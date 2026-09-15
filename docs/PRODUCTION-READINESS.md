# Production-Readiness & Failure-Testing Plan

This plan verifies that the Netflow delivery pipeline and runtime behave correctly
under both success and failure conditions. It maps each test to the real components
in this project — Jenkins CI gates, Amazon ECR, the GitOps repo, ArgoCD, the
Kubernetes manifests (probes/HPA/PDB/NetworkPolicy), and the Prometheus/Grafana
monitoring stack.

> ## Safety rules (read first)
> - **Never run failure tests against production.** Use the **dev** (or a
>   throwaway) environment/namespace: `netflow-dev`, and feature branches for CI.
> - Do **not** delete or modify shared/production resources. Every scenario below
>   is reversible and scoped to non-prod.
> - Prefer a local `kind`/`minikube` cluster or the `dev` overlay for cluster tests.
> - Announce load tests; keep them within the dev environment's capacity.
> - Capture evidence (logs/screenshots) as you go — see each scenario.

---

## Production-readiness checklist

Confirm before promoting to production:

**Delivery**
- [ ] CI is green on `main`; all gates enforced (tests, coverage, SonarQube, OWASP, Trivy fs/image, hadolint, kube-linter, Gitleaks).
- [ ] Images are immutable git-SHA tags in ECR; no `latest` in any manifest.
- [ ] ArgoCD apps `Synced` + `Healthy`; prod sync policy reviewed (manual until validated).
- [ ] Rollback verified (see Scenario 13).

**Runtime**
- [ ] Liveness/readiness/startup probes on every container.
- [ ] Resource requests/limits set; HPA + PDB configured.
- [ ] `securityContext` (non-root, read-only rootfs, dropped caps, seccomp); restricted PSA.
- [ ] NetworkPolicies applied (default-deny + explicit allows).
- [ ] Secrets sourced from Secrets Manager via External Secrets; none in Git.

**Operations**
- [ ] Prometheus scraping app + cluster + nodes; Grafana dashboards load.
- [ ] Alert rules loaded and routed via Alertmanager (see Scenario 14).
- [ ] Runbooks/on-call defined; log aggregation available.
- [ ] Backups/restore tested for the database (RDS automated backups).

---

## Test matrix

| # | Scenario | Layer | Expected gate/response |
|---|---|---|---|
| 1 | Successful deployment | end-to-end | full pipeline → ArgoCD sync → healthy |
| 2 | Failed unit test | CI | Unit Tests stage fails; no image |
| 3 | Failed security scan | CI | Gitleaks/SonarQube/OWASP gate fails |
| 4 | Vulnerable Docker image | CI | Trivy image scan fails before push |
| 5 | Failed Docker build | CI | Docker Build stage fails |
| 6 | Failed image push | CI | Push stage fails/retries |
| 7 | Invalid Kubernetes manifest | CI/CD | kube-linter/kustomize fails; ArgoCD refuses |
| 8 | Failed ArgoCD sync | CD | app `OutOfSync`/`SyncFailed`; alert |
| 9 | Application pod crash | runtime | restart, CrashLoop, alert |
| 10 | Readiness failure | runtime | pod removed from endpoints |
| 11 | Increased traffic | runtime | HPA scales out |
| 12 | Kubernetes rollout failure | runtime | rollout blocked; old pods serve |
| 13 | Rollback | CD | revert to previous git SHA |
| 14 | Monitoring alert generation | observability | alert fires + routes |

---

## Scenarios

### 1. Successful deployment (happy path)

- **Reproduce (safely):** On a feature branch, make a trivial safe change, open a PR
  to `develop`, merge; let Jenkins run and commit the image bump to the GitOps repo;
  sync `netflow-dev` in ArgoCD.
- **Expected behavior:** All CI gates pass; image pushed to ECR with a git-SHA tag;
  GitOps commit created; ArgoCD reconciles; rolling update completes; pods `Ready`.
- **System response:** `argocd app get netflow-dev` → `Synced`/`Healthy`; new
  ReplicaSet scaled up, old scaled down (rolling, `maxUnavailable: 0`).
- **Recovery:** N/A (success). If anything lags, re-sync.
- **Evidence:** Jenkins build log (all stages green), ECR image digest+tag,
  GitOps commit SHA, `kubectl -n netflow-dev rollout status deploy/backend`, ArgoCD
  screenshot, Grafana showing steady request rate/latency.

### 2. Failed unit test

- **Reproduce:** On a branch, add a deliberately failing test (e.g.
  `expect(1).toBe(2)`) in `backend/src`. Push / run the pipeline.
- **Expected behavior:** The **Unit Tests** stage fails; the pipeline stops.
- **System response:** No coverage/Sonar/scan/build stages run after it
  (`skipStagesAfterUnstable` / hard failure); **no image is built or pushed**; no
  GitOps change; nothing deploys.
- **Recovery:** Remove/fix the test, push again; pipeline goes green.
- **Evidence:** Jenkins Unit Tests stage log + JUnit report (`reports/tests/*.xml`),
  pipeline "failed" status, confirmation ECR has **no** new tag for that SHA.

### 3. Failed security scan (secrets / SAST / dependencies)

- **Reproduce (pick one, on a branch):**
  - Secrets: add a fake AWS-key-shaped string to a file → **Gitleaks** trips.
  - SAST: introduce a Sonar quality-gate violation (e.g. drop coverage below min or
    add a blocker smell) → **SonarQube Quality Gate** fails.
  - Deps: add a package with a known CVE (CVSS ≥ 7) → **OWASP Dependency-Check** fails.
- **Expected behavior:** The corresponding gate fails the build.
- **System response:** Pipeline stops at that stage; no image promoted. Gates are
  **not** bypassed.
- **Recovery:** Remove the secret/rotate it, fix the finding, or upgrade the
  dependency; re-run.
- **Evidence:** The failing stage log, the archived report
  (`reports/dependency-check/*`, Sonar gate result, Gitleaks output), and proof no
  image was pushed.

### 4. Vulnerable Docker image

- **Reproduce:** On a branch, pin an old base image or add an OS package with a
  known HIGH/CRITICAL CVE, or temporarily lower `TRIVY_SEVERITY` scope to include a
  known-vulnerable component. Build through CI.
- **Expected behavior:** **Trivy Container Image Scan** finds HIGH/CRITICAL and
  fails (`--exit-code 1`) **before** the push stage.
- **System response:** Image is **not** pushed to ECR; pipeline stops.
- **Recovery:** Upgrade the base/package to a patched version; re-scan; proceed.
- **Evidence:** Trivy image report (`reports/trivy/image-*.txt`) listing the CVE,
  failed stage log, ECR shows no new tag.

### 5. Failed Docker build

- **Reproduce:** On a branch, introduce a Dockerfile error (e.g. `COPY` a
  non-existent path or a bad build command). Run CI.
- **Expected behavior:** **Docker Image Build** stage fails.
- **System response:** No image produced; scan/push/GitOps stages don't run.
- **Recovery:** Fix the Dockerfile; re-run. (`hadolint` in Static Code Analysis
  catches many issues even earlier.)
- **Evidence:** Docker Build stage log with the build error; hadolint report if it
  tripped first.

### 6. Failed image push (registry unreachable / auth)

- **Reproduce (safely, non-prod):** In a test pipeline, point `ECR_REGISTRY` at an
  invalid registry, or use a credential without push permission to a **test** repo.
  Do **not** tamper with the real prod ECR.
- **Expected behavior:** The **Push Image to Registry** stage fails; because it has
  `retry(2)`, it retries transient errors, then fails if still unreachable.
- **System response:** No GitOps update (that stage never runs); nothing deploys.
- **Recovery:** Fix the registry URL / IAM permission (ECR push scoped policy);
  re-run. Verify `aws ecr get-login-password` succeeds.
- **Evidence:** Push stage log showing the retry attempts and final failure; IAM
  policy check; confirmation the intended tag is absent from ECR.

### 7. Invalid Kubernetes manifest

- **Reproduce:** On a branch, break a manifest (e.g. wrong indentation, invalid
  field, or a `latest` tag) under `k8s/`. Run `kubectl kustomize k8s/overlays/dev`
  and the CI static-analysis stage.
- **Expected behavior:** `kustomize` build fails, and/or **kube-linter** reports
  errors and fails the Static Code Analysis stage. A malformed manifest committed to
  GitOps causes ArgoCD to show `ComparisonError`/`OutOfSync` and refuse to apply.
- **System response:** Invalid state does not reach the cluster; ArgoCD reports the
  error rather than degrading running pods.
- **Recovery:** Fix the manifest; `kubectl kustomize` clean; re-commit; ArgoCD syncs.
- **Evidence:** `kubectl kustomize` error output, kube-linter report
  (`reports/kube-linter.txt`), ArgoCD `ComparisonError` screenshot.

### 8. Failed ArgoCD sync

- **Reproduce (dev):** Commit a manifest that applies but can't become healthy
  (e.g. reference a non-existent ConfigMap, or an image tag that isn't in ECR) to the
  `netflow-dev` path.
- **Expected behavior:** ArgoCD app goes `OutOfSync` then `SyncFailed`/`Degraded`;
  with retry/backoff it re-attempts.
- **System response:** In dev (automated), self-heal retries; the previous healthy
  ReplicaSet keeps serving because readiness gates the new pods. Alert
  `UnavailableReplicas`/`PodNotReady` may fire.
- **Recovery:** Fix the manifest in Git (or roll back the commit); ArgoCD re-syncs.
- **Evidence:** `argocd app get netflow-dev`, controller logs
  (`kubectl -n argocd logs deploy/argocd-application-controller`), ArgoCD history.

### 9. Application pod crash

- **Reproduce (dev):** Force a crash — e.g. `kubectl -n netflow-dev exec <pod> --
  kill 1`, or deploy a build that exits on startup (bad required env) to dev.
- **Expected behavior:** The container exits; kubelet restarts it; repeated crashes
  → `CrashLoopBackOff`.
- **System response:** Deployment keeps desired replicas; `restartCount` climbs;
  `kube_pod_container_status_restarts_total` rises → **PodRestartSpike** alert after
  the threshold.
- **Recovery:** Fix the cause (config/secret/bug); roll forward or roll back.
- **Evidence:** `kubectl -n netflow-dev describe pod <pod>` (events/last state),
  `kubectl logs <pod> --previous`, Grafana restarts panel, the fired alert.

### 10. Readiness failure

- **Reproduce (dev):** Make `/ready` fail without killing the process — e.g. point
  the backend at an unreachable DB in dev so readiness fails but liveness passes.
- **Expected behavior:** The pod stays `Running` but **not `Ready`**; it is removed
  from the Service endpoints and receives no traffic.
- **System response:** During a rollout, unready new pods block progression
  (`maxUnavailable: 0`), so old pods keep serving. `PodNotReady` alert may fire.
- **Recovery:** Restore the dependency (DB/secret); readiness recovers; the pod
  rejoins endpoints.
- **Evidence:** `kubectl get pods` (READY 0/1), `kubectl get endpoints backend`
  (pod absent), describe showing failed readiness probe, Grafana.

### 11. Increased application traffic (load / autoscaling)

- **Reproduce (dev):** Generate load against the dev URL with a load tool
  (e.g. `hey`, `k6`, or `ab`) at a level dev can handle. Example:
  `hey -z 3m -c 50 https://dev.netflow.example.com/api/v1/content/home`.
- **Expected behavior:** CPU/memory rise; the **HPA** scales replicas up toward its
  max; latency stays bounded; no errors.
- **System response:** `kubectl -n netflow-dev get hpa` shows increasing replicas;
  new pods schedule (anti-affinity spreads them); Grafana request-rate rises,
  latency stable. If limits are hit, `HighContainerCPU/Memory` may fire.
- **Recovery:** Stop the load; HPA scales back down after the stabilization window.
- **Evidence:** HPA events (`kubectl describe hpa backend`), replica count over time,
  Grafana RED dashboard (rate/latency), load-tool summary.

### 12. Kubernetes rollout failure

- **Reproduce (dev):** Deploy an image tag that never becomes ready (e.g. wrong port
  or failing startup probe) to dev.
- **Expected behavior:** The rolling update **pauses** — new pods never pass
  readiness, so with `maxUnavailable: 0` the old ReplicaSet keeps all traffic;
  `progressDeadlineSeconds` eventually marks the rollout failed.
- **System response:** `kubectl rollout status` reports progress stalled;
  `DeploymentReplicaMismatch`/`UnavailableReplicas` alerts may fire; **no downtime**
  because old pods still serve.
- **Recovery:** Roll back (Scenario 13) or fix and roll forward.
- **Evidence:** `kubectl -n netflow-dev rollout status deploy/backend` (stalled),
  `kubectl describe deploy` (conditions), ArgoCD `Progressing`/`Degraded`, alerts.

### 13. Rollback to a previous version

- **Reproduce (dev):** After a bad deploy (e.g. Scenario 12), roll back.
- **Expected behavior / procedure (choose one, Git-native preferred):**
  ```bash
  # A) Revert the GitOps image bump (audited); ArgoCD re-syncs last-known-good.
  #    In the GitOps repo:
  git revert <bad-image-bump-commit> && git push
  # B) ArgoCD rollback to a previous synced revision.
  argocd app history netflow-dev
  argocd app rollback netflow-dev <REVISION_ID>
  # C) Emergency, break-glass:
  kubectl -n netflow-dev rollout undo deploy/backend
  ```
- **System response:** The previous immutable image tag is redeployed; pods become
  `Ready`; ArgoCD returns to `Synced`/`Healthy`.
- **Recovery:** N/A (this *is* recovery). Follow up with a `git revert` if you used
  option B/C so Git remains the source of truth.
- **Evidence:** ArgoCD history + current revision, `kubectl rollout history`, the
  revert commit SHA, Grafana showing error rate/latency returning to normal.

### 14. Monitoring alert generation

- **Reproduce (dev, use the earlier scenarios as triggers):**
  - Error-rate alert: point backend at a bad DB so `/api` returns 5xx (drives
    `HighErrorRate`).
  - Restart alert: crash loop a pod (Scenario 9 → `PodRestartSpike`).
  - Availability: scale a dev deploy to 0 or block readiness (`UnavailableReplicas`).
- **Expected behavior:** Prometheus evaluates the rule; after its `for:` duration the
  alert transitions `Pending` → `Firing`; Alertmanager routes it (critical → page,
  others → default receiver).
- **System response:** Alert visible in Prometheus (*Alerts*), grouped/routed by
  Alertmanager, and reflected on the Grafana dashboards.
- **Recovery:** Resolve the underlying condition; the alert auto-resolves after the
  metric returns to normal.
- **Evidence:** Prometheus *Alerts* page (Pending→Firing), Alertmanager
  notification (Slack/email/PagerDuty test receiver), Grafana panel screenshot, the
  rule expression from `monitoring/prometheus/alert-rules.yml`.

---

## Evidence-capture conventions

For a repeatable audit trail, store per-run evidence under a dated folder, e.g.
`evidence/YYYY-MM-DD-<scenario>/`:

- CI: Jenkins build URL + stage log export + archived `reports/**`.
- Registry: ECR image list / digest (`aws ecr describe-images`).
- GitOps: relevant commit SHAs (bump + any revert).
- Cluster: `kubectl get/describe/logs` output, `argocd app get`/`history`.
- Observability: Grafana dashboard screenshots, Prometheus/Alertmanager screenshots.

## Cadence

- Run scenarios 2–8 automatically as part of pipeline verification on a schedule
  (they are safe, CI-only, and self-cleaning on a branch).
- Run runtime scenarios 9–14 in dev during a scheduled game-day (quarterly
  suggested), and after any significant infrastructure change.
