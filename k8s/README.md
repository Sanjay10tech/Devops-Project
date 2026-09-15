# Kubernetes Manifests

Production-oriented, declarative manifests managed with **Kustomize**: a shared
`base/` plus per-environment `overlays/` (dev, staging, prod). The Jenkins pipeline
sets immutable image tags in an overlay and ArgoCD reconciles the result.

## Layout

```
k8s/
├── base/
│   ├── namespace.yaml         Namespace + Pod Security Admission (restricted)
│   ├── serviceaccount.yaml    SAs for backend, frontend, external-secrets (IRSA)
│   ├── rbac.yaml              least-privilege Role + RoleBinding
│   ├── backend-config.yaml    ConfigMap (non-secret config only)
│   ├── externalsecret.yaml    SecretStore + ExternalSecret (AWS Secrets Manager)
│   ├── backend-deployment.yaml   Deployment: probes, resources, securityContext
│   ├── frontend-deployment.yaml  Deployment: probes, resources, securityContext
│   ├── service.yaml           ClusterIP Services
│   ├── ingress.yaml           Ingress (TLS via cert-manager, /api → backend)
│   ├── hpa.yaml               HorizontalPodAutoscalers
│   ├── pdb.yaml               PodDisruptionBudgets
│   ├── networkpolicy.yaml     default-deny + targeted allows
│   └── kustomization.yaml
└── overlays/
    ├── dev/       1 replica, debug logging, :dev images, dev host
    ├── staging/   2 replicas, :staging images, staging host
    └── prod/      3 replicas, higher HPA/PDB, git-SHA images (set by CI)
```

## What's included (requirement coverage)

| Item | Where |
|---|---|
| Namespace | `namespace.yaml` (with restricted Pod Security Standard) |
| Deployment | `backend-deployment.yaml`, `frontend-deployment.yaml` |
| Service | `service.yaml` |
| ConfigMap | `backend-config.yaml` (non-secret only) |
| Secret references | `externalsecret.yaml` → creates `backend-secrets`; consumed via `envFrom.secretRef` |
| Ingress | `ingress.yaml` |
| ServiceAccount | `serviceaccount.yaml` (per workload; token auto-mount off) |
| RBAC | `rbac.yaml` (least-privilege Role/RoleBinding) |
| HorizontalPodAutoscaler | `hpa.yaml` |
| PodDisruptionBudget | `pdb.yaml` |
| NetworkPolicy | `networkpolicy.yaml` (default-deny + allows) |
| Resource requests/limits | in both Deployments |
| liveness/readiness/startup probes | in both Deployments |
| securityContext / non-root | pod + container level in both Deployments |
| Rolling deployment | `strategy: RollingUpdate` (maxUnavailable 0, maxSurge 1) |
| Immutable image tags | Kustomize image names; CI sets git-SHA tag (never `latest` in prod) |

## Secret management (no plaintext in Git)

**No secret values are stored in Git.** The flow:

1. Secret values live in **AWS Secrets Manager** under `netflow/<env>/backend`.
2. The **External Secrets Operator** authenticates via **IRSA** (the
   `external-secrets-sa` service account is annotated with the IAM role ARN created
   in [`../infra/iam.tf`](../infra/iam.tf)).
3. `SecretStore` + `ExternalSecret` (`externalsecret.yaml`) pull those values and
   create a Kubernetes `Secret` named `backend-secrets`.
4. The backend Deployment consumes it with `envFrom.secretRef`.

Only *references* (which key, which property) are in Git — never the values.

**Prerequisites in-cluster:** install the External Secrets Operator, and create the
`netflow/<env>/backend` secrets in AWS Secrets Manager (see
[`../infra/INFRASTRUCTURE-PLAN.md`](../infra/INFRASTRUCTURE-PLAN.md)).

> If you are not using External Secrets, an alternative is Sealed Secrets
> (encrypted secrets safe to commit) or SOPS-encrypted manifests. Do **not** commit
> raw `Secret` manifests with plaintext `data`/`stringData`.

## Build / validate

`kustomize` is built into `kubectl`, so no separate install is needed:

```bash
# Render an environment (validates that the kustomization builds):
kubectl kustomize k8s/overlays/dev
kubectl kustomize k8s/overlays/staging
kubectl kustomize k8s/overlays/prod

# Server-side dry-run against a cluster (full schema + admission validation):
kubectl apply -k k8s/overlays/prod --dry-run=server

# Optional offline schema validation:
kubectl kustomize k8s/overlays/prod | kubeconform -strict -summary
```

All three overlays were validated with `kubectl kustomize` and render cleanly
(no warnings or errors).

## Deploy

Deployment is via **ArgoCD** (GitOps) — see [`../argocd/README.md`](../argocd/README.md).
For a manual apply during bootstrap:

```bash
kubectl apply -k k8s/overlays/dev
```

The CI pipeline pins immutable image tags before ArgoCD syncs:

```bash
# run by Jenkins in the target overlay directory
kustomize edit set image \
  netflow-backend=<ECR>/netflow-backend:<git-sha> \
  netflow-frontend=<ECR>/netflow-frontend:<git-sha>
```

## Notes

- The `frontend` container uses a read-only root filesystem, so Nginx's temp/cache/run
  paths are backed by `emptyDir` volumes.
- NetworkPolicies assume the ingress controller namespace is labeled `name=ingress-nginx`.
- `backend-secrets` is created by the ExternalSecret at runtime; a fresh cluster
  without the operator will leave the backend pods waiting for that Secret.
