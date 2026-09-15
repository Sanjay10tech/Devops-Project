# ArgoCD (GitOps / Continuous Deployment)

ArgoCD is the **only** thing that deploys application workloads to Kubernetes.
Jenkins builds, tests, scans, pushes images, and updates the **desired state** in
Git — it never runs `kubectl apply` against the cluster. ArgoCD detects the Git
change and reconciles the cluster to match.

## Files

```
argocd/
├── project.yaml                 AppProject (guardrails: allowed repo/namespaces/kinds)
├── root-app.yaml                App-of-Apps root (manages the child apps below)
└── applications/
    ├── netflow-dev.yaml         dev  → k8s/overlays/dev  (automated sync)
    ├── netflow-staging.yaml     stg  → k8s/overlays/staging (automated sync)
    └── netflow-prod.yaml        prod → k8s/overlays/prod (MANUAL sync initially)
```

## GitOps directory structure & source separation (requirement 10)

Two concerns are kept clearly separate:

| Concern | Where | Changed by |
|---|---|---|
| **Application source** (code) | `backend/`, `frontend/` in the app repo | developers |
| **Desired state** (manifests) | `k8s/**` + `argocd/**` (the GitOps repo) | CI (image tags) + platform team |

> In this monorepo both live together for reference. In production the GitOps
> desired state typically lives in a **separate repo**
> (`https://github.com/Sanjay10tech/Devops-Project-gitops.git`, referenced by the
> Applications) so that a config change never triggers an application rebuild and
> permissions can differ. The Application `repoURL`/`path` fields point at that repo.

## Deployment versioning strategy (requirement: versioning)

- **Immutable image tags.** Every build is tagged with the **git commit SHA**
  (e.g. `netflow-backend:9f2a1c3b4d5e`). Tags are never overwritten; `latest` is
  never used for deployment.
- **Desired state = a Git commit.** Jenkins bumps the image tag in the target
  overlay's `kustomization.yaml` via `kustomize edit set image` and commits it.
  That commit *is* the version of the deployment.
- **Rollback = a previous Git revision.** Because each deploy maps to a commit,
  rolling back means pointing at an earlier commit (see Rollback below).
- **History retained.** `revisionHistoryLimit` (10 dev/staging, 20 prod) keeps prior
  synced revisions so ArgoCD can roll back quickly.

## Progressive automation (requirements 6, 7, 8)

| Env | Sync | Self-heal | Prune | Rationale |
|---|---|---|---|---|
| dev | automated | on | on | prove the workflow end-to-end here first |
| staging | automated | on | on (foreground) | enabled after dev is validated |
| prod | **manual** initially | off initially | careful (`PruneLast`, foreground) | a human approves each promotion until the workflow is trusted |

Prod ships with the `automated:` block **commented out** in
`applications/netflow-prod.yaml`. After the dev/staging workflow is validated,
enable automation by uncommenting it. Pruning in prod uses `PruneLast=true` so new
resources become healthy before anything is removed.

## Bootstrap (apply order)

Install ArgoCD first (Helm or the official install manifest), then:

```bash
# 1. Project guardrails
kubectl apply -f argocd/project.yaml

# 2. App-of-Apps root — creates the child Applications from Git
kubectl apply -f argocd/root-app.yaml

# 3. Watch them appear and sync
argocd app list
argocd app get netflow-dev
```

After this, **all changes flow through Git** — you rarely `kubectl apply` again.

## The complete flow

```
Developer                                                             EKS
   │  git push (code)                                                  ▲
   ▼                                                                   │ reconcile
GitHub (app repo) ──webhook──► Jenkins CI                              │
                                 │  checkout → env validate            │
                                 │  install → lint → unit tests        │
                                 │  coverage → SonarQube gate          │
                                 │  dependency scan (OWASP)            │
                                 │  Trivy filesystem scan              │
                                 │  docker build                       │
                                 │  Trivy image scan  ── all gates ──┐ │
                                 ▼                                   │ │
                          Amazon ECR  ◄── push immutable <git-sha> ──┘ │
                                 │                                     │
                                 ▼  kustomize edit set image + commit  │
                    GitHub (GitOps repo) ────────────────────────────►│
                                 │                                ArgoCD
                                 └──── ArgoCD detects new commit ──────┘
                                       renders overlay, syncs to EKS
```

Step by step:

1. **Developer → GitHub.** Push code to the application repo.
2. **Jenkins CI.** Webhook triggers the pipeline (checkout → env validation →
   deps → lint → unit tests → coverage → SonarQube quality gate).
3. **Security scans.** OWASP Dependency-Check, Trivy filesystem scan, then Trivy
   image scan — each a hard gate. A failure stops the pipeline; nothing is promoted.
4. **ECR.** The scanned image is pushed with an **immutable git-SHA tag**.
5. **GitOps commit.** Jenkins runs `kustomize edit set image ...` in the target
   overlay and commits the tag bump to the GitOps repo. Jenkins holds no cluster
   deploy credentials.
6. **ArgoCD detects the change** (webhook or ~3-min poll).
7. **ArgoCD synchronizes** the cluster to the new desired state (manual approval in
   prod until automation is enabled).
8. **EKS** runs the new version via a rolling update; probes gate traffic.

## Rollback (requirement 9)

Any of these — prefer the Git-native option for auditability:

```bash
# A) Git revert the image-tag bump (preferred; leaves an audit trail).
#    In the GitOps repo:
git revert <commit-that-bumped-the-tag>
git push            # ArgoCD syncs back to the previous image

# B) ArgoCD rollback to a previous synced revision.
argocd app history netflow-prod
argocd app rollback netflow-prod <REVISION_ID>

# C) Re-pin an explicit previous image (in the overlay), commit, push.
kustomize edit set image netflow-backend=<ECR>/netflow-backend:<older-sha>
```

## Troubleshooting

### Sync failure (`OutOfSync` / `SyncFailed`)
```bash
argocd app get netflow-prod
argocd app sync netflow-prod --dry-run
kubectl -n argocd logs deploy/argocd-application-controller
```
- Check the sync result message for the offending resource.
- Common causes: invalid manifest (see below), missing namespace (ensure
  `CreateNamespace=true`), or a failing hook. Fix in Git and re-sync.

### Image pull failure (`ImagePullBackOff` / `ErrImagePull`)
```bash
kubectl -n netflow-prod describe pod <pod>
kubectl -n netflow-prod get events --sort-by=.lastTimestamp
```
- Verify the image **tag exists in ECR** (the git SHA that CI pushed).
- Verify nodes can pull from ECR (node IAM has `AmazonEC2ContainerRegistryReadOnly`;
  see `infra/iam.tf`).
- Confirm the overlay's image name/tag matches what CI pushed.

### Unhealthy pods (`CrashLoopBackOff`, failing probes)
```bash
kubectl -n netflow-prod get pods
kubectl -n netflow-prod logs <pod> --previous
kubectl -n netflow-prod describe pod <pod>
```
- Readiness failing → check `/ready` and DB connectivity (is `backend-secrets`
  present? is the ExternalSecret synced?).
- CrashLoop → read `--previous` logs; check env/config in the ConfigMap/Secret.
- OOMKilled → raise memory limits in the deployment/overlay.

### Incorrect manifests
```bash
kubectl kustomize k8s/overlays/prod        # render locally
kubectl apply -k k8s/overlays/prod --dry-run=server
```
- Validate the overlay builds before committing.
- ArgoCD shows the diff (`argocd app diff netflow-prod`); fix in Git, never patch
  the live object (self-heal would revert it anyway).

### Rollback (fastest recovery)
- Use the Rollback section above. In an incident, `argocd app rollback` is quickest;
  follow up with a `git revert` so Git remains the source of truth.

## Validation performed

All five manifests were confirmed to be **valid YAML** (parsed successfully) and
were read/parsed by `kubectl` (which then only failed to *recognize* the CRD kinds
because no cluster/ArgoCD CRDs were reachable — expected offline). Apply them to a
cluster running ArgoCD to complete server-side validation.

## Related

- CI that produces the tag bump: [`../jenkins/README.md`](../jenkins/README.md)
- Manifests being deployed: [`../k8s/README.md`](../k8s/README.md)
- Cluster/IAM (IRSA, ECR): [`../infra/README.md`](../infra/README.md)
- Overall design: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
