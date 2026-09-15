# Netflow — Final Project Documentation & Senior DevOps/SRE Review

A single reference for the whole platform: a containerized three-tier app delivered
through a security-gated CI pipeline (Jenkins) and GitOps CD (ArgoCD) onto AWS EKS,
with Prometheus/Grafana observability. This document also contains an **honest
metrics** section that separates values measurable from the implementation from
those that require operational history.

> Companion docs (authoritative for each area):
> [ARCHITECTURE](../ARCHITECTURE.md) · [infra](../infra/README.md) ·
> [docker](../docker/README.md) · [jenkins](../jenkins/README.md) ·
> [security](../security/README.md) · [k8s](../k8s/README.md) ·
> [argocd](../argocd/README.md) · [monitoring](../monitoring/README.md) ·
> [SECURITY](../SECURITY.md) · [PRODUCTION-READINESS](./PRODUCTION-READINESS.md)

---

## 1. Project overview

Netflow is a Netflix-inspired content browser used as a reference implementation of
a modern DevSecOps delivery workflow. The application (React SPA + Node/TypeScript
API + PostgreSQL) is secondary to the delivery system around it: immutable image
builds, layered security scanning, GitOps deployment, and full observability.

Repositories of concern:
- **Application + platform config** (this repo): app code, Dockerfiles, Terraform,
  Kubernetes manifests, ArgoCD apps, monitoring, CI pipeline, docs.
- **GitOps desired state** (referenced): the config ArgoCD watches; CI commits image
  tags here.

## 2. Architecture

Three tiers, two Git repos, clean CI/CD separation:

```
Developer → GitHub → Jenkins (build·test·scan) → Amazon ECR
         → GitOps commit → ArgoCD → Amazon EKS → Prometheus/Grafana
```

- Frontend (Nginx) → Backend (Express) → PostgreSQL (RDS).
- Worker nodes in private subnets; ALB/NAT in public subnets.
- Jenkins never deploys to the cluster; it updates the GitOps desired state and
  ArgoCD reconciles. Full detail: [ARCHITECTURE.md](../ARCHITECTURE.md).

## 3. Technology stack

| Layer | Tech |
|---|---|
| Frontend | React + TypeScript (Vite), Nginx |
| Backend | Node.js + Express (TypeScript), prom-client |
| Database | PostgreSQL (RDS), Flyway-style migrations |
| Containers | Docker (multi-stage) |
| CI | Jenkins (declarative) |
| Security | Gitleaks, SonarQube, OWASP Dependency-Check, hadolint, Trivy, kube-linter |
| Registry | Amazon ECR |
| CD / GitOps | ArgoCD |
| Cloud | AWS (EKS, RDS, VPC, ECR, IAM, Secrets Manager) |
| Orchestration | Kubernetes (EKS), Kustomize |
| Observability | Prometheus, Grafana, Alertmanager |
| IaC | Terraform |

## 4. Local setup

```bash
# whole stack in Docker
cp .env.example .env
docker compose up -d --build
# frontend http://localhost:8080 · backend http://localhost:4000/health
```
Manual (no Docker): see [backend](../backend/README.md), [frontend](../frontend/README.md),
[database](../database/README.md).

## 5. AWS setup

Terraform in [`infra/`](../infra/README.md) provisions VPC (public/private subnets,
IGW, NAT), EKS (private managed nodes, OIDC/IRSA, addons), ECR (immutable,
scan-on-push), and least-privilege IAM. See
[INFRASTRUCTURE-PLAN.md](../infra/INFRASTRUCTURE-PLAN.md) for the resource inventory,
manual steps, and cost. `terraform init && plan && apply`.

## 6. Docker workflow

Multi-stage, non-root, read-only-rootfs images with health checks; `docker compose`
for local dev. **Verified:** both images build and the full compose stack runs
healthy with working health/API/proxy endpoints (see [docker](../docker/README.md)
"Verified test run").

## 7. Jenkins pipeline

15 stages: Checkout → Environment Validation → Install Dependencies → Lint →
Unit Tests → Test Coverage → Static Code Analysis (hadolint + Trivy config +
kube-linter) → SonarQube (+ Quality Gate) → Dependency Vulnerability Scan →
Trivy Filesystem Scan → Docker Image Build → Trivy Container Image Scan →
Image Tagging → Push Image → GitOps Deployment Update. Immutable git-SHA tags,
timeout + retries, report archiving, `set +x` around secrets. See
[jenkins](../jenkins/README.md).

## 8. Security scanning

Layered, gated (fail the build; not bypassed): **Gitleaks** (secrets),
**SonarQube** (SAST), **OWASP Dependency-Check** (deps, CVSS ≥ 7),
**hadolint** (Dockerfiles), **Trivy config** (IaC/misconfig), **kube-linter**
(manifests), **Trivy filesystem**, **Trivy image** (HIGH/CRITICAL before push).
Full policy + threat model: [SECURITY.md](../SECURITY.md).

## 9. Kubernetes deployment

Kustomize base + dev/staging/prod overlays: Namespace (restricted PSA), SA + RBAC,
Deployments (probes, resources, securityContext, anti-affinity), Service, Ingress,
HPA, PDB, NetworkPolicy, ExternalSecret. **Verified:** all overlays render with
`kubectl kustomize` and pass **kube-linter with 0 errors**. See [k8s](../k8s/README.md).

## 10. ArgoCD GitOps workflow

App-of-Apps + AppProject; per-env Applications targeting the overlays. dev/staging
automated (self-heal + prune); **prod manual until validated**, careful prune
(`PruneLast`). Rollback = Git revert or `argocd app rollback`. See
[argocd](../argocd/README.md).

## 11. Prometheus monitoring

Scrapes app pods (annotation-based), cAdvisor, kube-state-metrics, node-exporter.
Backend exposes real metrics via prom-client. **Verified:** `promtool check config`
passed and `promtool check rules` reported **13 rules**. See [monitoring](../monitoring/README.md).

## 12. Grafana dashboards

Three provisioned dashboards: Application (RED — rate/errors/latency/health),
Kubernetes Workloads (CPU/mem/restarts/availability/deployment health), and
Infrastructure/Nodes (node + cluster utilization). Datasource + provider provisioned.

## 13. Troubleshooting

Runbooks live in [argocd](../argocd/README.md) (sync/image-pull/unhealthy/manifest),
[monitoring](../monitoring/README.md) (alert workflow), and
[PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) (14 failure scenarios).

## 14. Rollback procedure

Immutable tags make rollback deterministic:
```bash
git revert <image-bump-commit> && git push     # preferred, audited
argocd app rollback netflow-prod <REVISION_ID> # fast
kubectl -n netflow-prod rollout undo deploy/backend  # break-glass
```

## 15. Security practices

No secrets in Git/images (Secrets Manager + External Secrets via IRSA); least-priv
IAM/RBAC; non-root, read-only, dropped-caps, seccomp, restricted PSA; default-deny
NetworkPolicies; immutable images; layered scanning gates. Latest audit findings +
fixes in [SECURITY.md](../SECURITY.md).

## 16. Cost considerations

Baseline ~$170–190/month in us-east-1 (EKS control plane ~$73, 2× t3.medium ~$60,
single NAT ~$33, plus EBS/ECR/CloudWatch/transfer). Levers: single NAT, Spot nodes,
node sizing. Full breakdown: [INFRASTRUCTURE-PLAN.md](../infra/INFRASTRUCTURE-PLAN.md).

## 17. Testing evidence

Verified in this project (commands were actually run):
- **Docker:** backend + frontend images build; `docker compose up` → all three
  services `healthy`; `/health` 200, `/ready` 200 (DB ok), `/api/v1/content/home`
  200 seeded data, frontend `/` 200, `/healthz` 200, `/api` proxy 200.
- **Backend metrics:** ran the container and scraped `/metrics` — confirmed
  `http_requests_total`, `http_request_duration_seconds` histogram, and default
  `netflow_backend_*` process metrics with correct labels.
- **Prometheus:** `promtool check config` = valid; `check rules` = 13 rules.
- **Kubernetes:** `kubectl kustomize` renders dev/staging/prod; **kube-linter = 0
  errors**; **hadolint** = pass (warning threshold).
- **Backend unit tests:** service + validation + metrics test suites present
  (`backend/src/**/*.test.ts`).

Not yet available (require a live cluster / operational history): live EKS apply,
end-to-end pipeline run on a Jenkins controller, and any time-series operational
data (success rate, deployment frequency, MTTR).

## 18. Production-readiness checklist

See [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) for the full checklist and
the 14-scenario failure-testing plan.

---

# Measurable project metrics (honest accounting)

Two categories. **Category A** is calculable **now** from the implementation and is
backed by a source in the repo. **Category B** requires operational history
(a running cluster + pipeline over time) and therefore has a defined **measurement
method** but **no invented value**.

## Category A — measurable from the implementation (with evidence)

| Metric | Value | How measured | Evidence in repo |
|---|---|---|---|
| Security gates in the Jenkins pipeline | **7** | Counted gating tools invoked in the Jenkinsfile: SonarQube, OWASP Dependency-Check, hadolint, Trivy config, kube-linter, Trivy filesystem, Trivy image | `jenkins/Jenkinsfile` |
| Total distinct security checks across CI | **8** | The 7 Jenkins gates **plus Gitleaks**, which runs in GitHub Actions (not Jenkins) | `jenkins/Jenkinsfile` + `.github/workflows/secret-scan.yml` |
| CI pipeline stages | **15** | Counted top-level `stage(...)` blocks | `jenkins/Jenkinsfile` |
| Prometheus alert rules | **13** | `promtool check rules` output: "SUCCESS: 13 rules found" | `monitoring/prometheus/alert-rules.yml` |
| Application metric families exposed | request rate, error rate (via status_code), latency histogram, + default process metrics | Scraped `/metrics` from the running container | `backend/src/metrics/metrics.ts` |
| Grafana dashboards | **3** | File count of provisioned dashboards | `monitoring/grafana/dashboards/*.json` |
| Kubernetes manifest lint findings | **0** | `kube-linter lint k8s/base` after fixes | `SECURITY.md` audit table; `k8s/base/**` |
| Environments | **3** (dev/staging/prod) | Kustomize overlays | `k8s/overlays/*` |
| Container image posture | non-root, read-only rootfs, dropped caps | Manifest + Dockerfile review; kube-linter/hadolint pass | `k8s/base/*-deployment.yaml`, `*/Dockerfile` |

> **Application response latency** is *observable* (the `http_request_duration_seconds`
> histogram exists and was confirmed populated during the local scrape), but a
> specific p95/p99 **number** requires representative traffic against a deployed
> instance. Measure it with the load test in Scenario 11 and read the value from the
> Grafana Application dashboard — do not state a figure until then.

## Category B — require operational history (method defined, value NOT invented)

Each of these has a legitimate measurement method using artifacts this project
already produces. **Do not put a number on your resume until you have run the system
and recorded it.**

| Metric | How to measure it (using this project) |
|---|---|
| Deployment duration (before vs after automation) | "Before" = time a manual build+deploy takes you by hand; "after" = Jenkins build duration (shown per build) + ArgoCD sync duration (`argocd app history` timestamps). Compare. |
| Pipeline success rate | successful builds ÷ total builds over a window, from Jenkins build history (or the API). |
| Deployment frequency | count of GitOps image-bump commits (or ArgoCD syncs) per week/day. |
| Rollback time | wall-clock from initiating `git revert`/`argocd app rollback` to app `Healthy` again — measure during Scenario 13. |
| Mean time to detect (MTTD) | time from fault injection to the alert firing — measure during Scenario 14 (alert `for:` + scrape interval give a lower bound). |
| Mean time to recovery (MTTR) | time from alert firing to service healthy again — measure across game-day incidents. |
| Application p95/p99 latency | run the Scenario 11 load test; read the percentile from Grafana. |

---

# Resume bullets (based ONLY on verified results)

These use only Category-A facts that are backed by evidence in the repo. They
describe what was **built and verified**, not operational outcomes that haven't been
measured yet.

- **Built a full DevSecOps delivery pipeline for a containerized 3-tier app** (React
  + Node/TypeScript + PostgreSQL) using Jenkins (15 stages) and ArgoCD GitOps to AWS
  EKS, with immutable git-SHA image tags and Jenkins decoupled from cluster deploys.

- **Embedded 8 layered security checks across CI** — 7 gating tools in the Jenkins
  pipeline (SonarQube, OWASP Dependency-Check, hadolint, Trivy config/filesystem/image,
  kube-linter) plus Gitleaks in GitHub Actions — that fail on policy violations;
  hardened Kubernetes workloads to pass **kube-linter with 0 findings** (non-root,
  read-only rootfs, dropped capabilities, restricted PSA, default-deny NetworkPolicies).

- **Implemented production observability** with Prometheus + Grafana: instrumented
  the API for request-rate/error-rate/latency metrics and authored **13 validated
  alert rules** (`promtool`-checked) across application, Kubernetes, and node layers,
  surfaced in 3 Grafana dashboards.

> When you have run the system, extend these with Category-B numbers (e.g. "reduced
> deployment time from X to Y", "MTTR of Z") measured per the methods above — each is
> defensible because the measurement source already exists.
