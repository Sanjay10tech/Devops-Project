# FINAL AUDIT — Netflow DevSecOps Project

**Auditor role:** Principal DevSecOps Engineer
**Method:** Repository inspection + **actual execution of safe validations** (builds,
compose up, kustomize, kube-linter, hadolint, promtool, unit tests, secret scan).
Nothing is marked verified merely because a file exists.

**Legend:** ✅ implemented & verified · ⚠️ implemented, needs validation ·
❌ missing · 🔴 security/reliability issue

---

## Overall project status

The project is **substantially implemented and, for everything runnable in this
environment, verified working**. The application builds, tests pass, containers run
healthy, endpoints respond, manifests render and pass security linting, and the
monitoring config/rules validate. One **real bug was found and fixed** during this
audit (frontend ESLint peer-dependency conflict that broke `npm install`).

What **cannot** be verified here is anything needing live AWS/EKS, a Jenkins
controller, or a running ArgoCD/Prometheus — because those environments are not
available in this workspace. Those items are classified ⚠️ (needs validation on a
real cluster), **not** ✅.

**Environment used for validation:** Node v24.6.0 / npm 10.9, Docker Engine 29.7.2,
kubectl (with built-in kustomize), Python 3.13. Terraform was **not installed**, so
IaC is not machine-validated.

---

## Architecture summary (as implemented)

Three-tier app (React/Nginx → Node/Express → PostgreSQL) delivered by Jenkins CI
(build/test/scan → ECR → GitOps commit) and ArgoCD CD (GitOps → EKS), observed by
Prometheus/Grafana. Two-repo model; Jenkins never deploys to the cluster directly.
No architecture was changed by this audit.

---

## Area-by-area findings (with evidence)

### 1. Application
| Item | Status | Evidence |
|---|---|---|
| Backend (Express/TS) | ✅ | `npm run build`/`typecheck` exit 0; image runs healthy |
| Frontend (React/Vite) | ✅ (after fix) | `npm run build` exit 0 **after** fixing the ESLint peer conflict |
| REST API | ✅ | `GET /api/v1/content/home` → 200, 5783 bytes of seeded data |
| Database + migrations/seed | ✅ | `/ready` → 200 `database: ok`; home endpoint returns seeded rows |
| Health/readiness endpoints | ✅ | `/health` 200, `/ready` 200 (live) |
| Tests | ✅ | `npm test` → **3 files, 17 tests, all passed** (service 6, validation 8, metrics 3) |

### 2. Docker
| Item | Status | Evidence |
|---|---|---|
| Dockerfiles (backend, frontend) | ✅ | both `docker build` exit 0 |
| Multi-stage builds | ✅ | deps→build→prod-deps→runtime (backend); deps→build→nginx (frontend) |
| Non-root containers | ✅ | backend `USER node`; frontend nginx-unprivileged (uid 101); hadolint pass |
| Health checks | ✅ | compose `ps` shows all services **healthy** |
| Image optimization | ✅ | multi-stage; alpine/unprivileged bases; prior measured ~206MB / ~74MB |
| docker-compose | ✅ | `docker compose config` exit 0; `up -d` → db/backend/frontend healthy; teardown clean |

### 3. CI/CD (Jenkins)
| Item | Status | Evidence |
|---|---|---|
| Jenkinsfile + 15 stages | ⚠️ | file present & internally consistent; **not run** (no Jenkins controller) |
| Test execution stage | ✅ (tests themselves) | the underlying `npm test` verified locally; stage wiring ⚠️ |
| SonarQube stage | ⚠️ | requires a SonarQube server (not available) |
| Dependency scanning (OWASP) | ⚠️ | requires the CLI + NVD key on the agent |
| Trivy fs / image scanning | ⚠️ | stage present; Trivy verified working in prior sessions, not this pipeline run |
| Static analysis (hadolint, kube-linter, trivy config) | ✅ (tools) | tools run clean locally (see below); stage wiring ⚠️ |
| Image tagging (git SHA, no latest) | ✅ (design) | Jenkinsfile uses git-SHA tags; manifests carry no `latest` (kube-linter pass) |
| ECR push / GitOps update | ⚠️ | needs AWS creds + GitOps repo; not executed |

### 4. AWS (Terraform)
| Item | Status | Evidence |
|---|---|---|
| Terraform (VPC/EKS/ECR/IAM/networking/SGs) | ⚠️ | code present & reviewed; **Terraform not installed** → no `validate`/`plan` run |
| Infrastructure dependencies | ⚠️ | logically consistent on review; unverified without `terraform plan` |
| IAM least-privilege | ✅ (by review) | scoped roles, IRSA to `netflow/<env>/*`, node role ECR read-only, CI push scoped to repos |

> All of area 4 is **design-verified only**. Do not claim the infra "works" until
> `terraform validate`/`plan` and an apply in a sandbox account.

### 5. Kubernetes
| Item | Status | Evidence |
|---|---|---|
| Deployments / Services / ConfigMap | ✅ | `kubectl kustomize` renders dev/staging/prod (exit 0) |
| Secret references (no plaintext) | ✅ | ExternalSecret → `backend-secrets`; no Secret with plaintext `data` in Git |
| Ingress | ✅ | renders; TLS via cert-manager annotations |
| RBAC | ✅ | least-privilege Role/RoleBinding; SA token automount off |
| HPA / PDB / NetworkPolicy | ✅ | present; PDB has `unhealthyPodEvictionPolicy`; default-deny + explicit allows |
| resource requests/limits, probes | ✅ | on both workloads (kube-linter 0 findings) |
| securityContext / non-root | ✅ | non-root, read-only rootfs, dropped caps, seccomp, restricted PSA |
| Manifest security lint | ✅ | **kube-linter `k8s/base` → 0 lint errors** |

### 6. ArgoCD
| Item | Status | Evidence |
|---|---|---|
| AppProject + App-of-Apps + per-env Applications | ✅ (valid YAML) | 5 manifests parse; render/structure correct |
| Sync config, self-heal, prune | ✅ (config) / ⚠️ (behavior) | dev/staging automated, prod manual until validated; live sync **not** tested (no cluster) |
| Rollback capability | ✅ (defined) / ⚠️ (behavior) | git-revert / `argocd app rollback` documented; not exercised live |
| Image version flow | ✅ (design) | CI `kustomize edit set image` → git-SHA; overlays carry non-`latest` placeholder |

### 7. Monitoring
| Item | Status | Evidence |
|---|---|---|
| Prometheus config | ✅ | `promtool check config` → valid syntax (exit 0) |
| Alert rules | ✅ | `promtool check rules` → **13 rules found** (exit 0) |
| Application metrics | ✅ | live `/metrics` → 200 with `http_requests_total`, `http_request_duration_seconds`, default process metrics |
| Kubernetes/node metrics | ⚠️ | queries target standard KSM/cAdvisor/node-exporter series; live scrape needs a cluster |
| Grafana dashboards | ✅ (valid) / ⚠️ (render) | 3 dashboards are valid JSON; visual render needs a Grafana instance |
| Alertmanager routing | ✅ (valid YAML) | config parses; delivery needs real receivers |

### 8. Security
| Item | Status | Evidence |
|---|---|---|
| Hardcoded credentials | ✅ none | repo-wide grep for AKIA/private keys/tokens → **no matches** |
| Exposed secrets | ✅ none | only `.env.example` placeholders; `.env` never committed |
| Vulnerable dependencies | ⚠️ | OWASP/Trivy gates exist; a live scan against current lockfiles is recommended |
| Container security | ✅ | non-root, read-only rootfs, dropped caps; hadolint pass |
| Kubernetes security | ✅ | restricted PSA, securityContext, NetworkPolicies; kube-linter 0 findings |
| IAM permissions | ✅ (review) | least-privilege + IRSA (design-verified) |
| CI/CD secrets | ✅ | Jenkins credentials + `set +x`; GitHub Actions `permissions: contents: read` |

### 9. Reliability
| Item | Status | Evidence |
|---|---|---|
| Rolling deployment | ✅ (config) | `RollingUpdate` maxUnavailable 0 / maxSurge 1 |
| Rollback | ✅ (defined) / ⚠️ (live) | documented + design; not exercised on a live cluster |
| Failed-deployment handling | ✅ (config) | probes gate traffic; readiness blocks bad rollouts |
| Pod-failure handling | ✅ (config) | restarts, PDB, anti-affinity, HPA |
| Health checks | ✅ | liveness/readiness/startup on both workloads; verified live in Docker |
| Observability | ✅ | metrics verified live; dashboards/alerts validated |

---

## Critical issues

- **None blocking at the code/config level after the fix below.** The one build-breaking
  defect found during the audit has been fixed and re-verified.

### Fixed during this audit
| Severity | Issue | Fix | Re-verified |
|---|---|---|---|
| 🔴→✅ | **Frontend `npm install` failed** (`ERESOLVE`): `eslint-plugin-react-hooks@4.6.2` requires ESLint ≤ 8 but the project pins `eslint@^9`. This would break the frontend lint step and Docker build. | Bumped `eslint-plugin-react-hooks` to `^5.1.0` (ESLint 9 compatible) in `frontend/package.json` | `npm install`/`typecheck`/`build`/`lint` all exit 0 |

## Security issues

- No hardcoded secrets, no plaintext secrets, no exposed credentials found (grep +
  review). 
- 🔴 (pre-existing, tracked, **not** introduced here) EKS `cluster_public_access_cidrs`
  defaults to `0.0.0.0/0` in `infra/variables.tf` — restrict before production.
- ⚠️ No image signing / admission verification (recommended, not blocking).

## Required fixes (before calling it production-ready)

1. Commit the generated `backend/package-lock.json` and `frontend/package-lock.json`
   so CI/Docker use reproducible `npm ci`.
2. Restrict `cluster_public_access_cidrs` to known CIDRs (or disable public endpoint).
3. Run `terraform validate`/`plan` (Terraform wasn't available here) and fix anything
   it surfaces before apply.
4. Execute the pipeline once on a real Jenkins to confirm stage wiring, and perform
   a first ArgoCD sync on a real cluster.

---

## Validation commands (what I ran / what you can re-run)

```bash
# Secrets
grep -rEI "AKIA[0-9A-Z]{16}|BEGIN .*PRIVATE KEY|aws_secret_access_key" .   # → none

# Backend (verified: 17 tests pass)
cd backend && npm install && npm run typecheck && npm run lint && npm test

# Frontend (verified after fix)
cd frontend && npm install && npm run typecheck && npm run build && npm run lint

# Kubernetes manifests
kubectl kustomize k8s/overlays/dev      # + staging, prod  → all render
docker run --rm -v "$PWD:/repo" -w /repo stackrox/kube-linter:latest lint /repo/k8s/base  # 0 errors

# Dockerfiles + images + stack
docker run --rm -v "$PWD:/repo" -w /repo hadolint/hadolint hadolint --config /repo/.hadolint.yaml backend/Dockerfile frontend/Dockerfile
docker build ./backend && docker build ./frontend
cp .env.example .env && docker compose up -d --build && docker compose ps   # all healthy
curl localhost:4000/health localhost:4000/ready localhost:8080/ localhost:4000/metrics
docker compose down -v && rm .env

# Monitoring
docker run --rm --entrypoint promtool -v "$PWD/monitoring/prometheus:/cfg" prom/prometheus:latest check config --syntax-only /cfg/prometheus.yml
docker run --rm --entrypoint promtool -v "$PWD/monitoring/prometheus:/cfg" prom/prometheus:latest check rules /cfg/alert-rules.yml   # 13 rules

# Infrastructure (NOT run here — Terraform not installed)
cd infra && terraform init && terraform validate && terraform plan
```

---

## Production-readiness score

**Score: 7 / 10 — "code-complete and locally verified; not yet cluster-proven."**

Rationale (honest):
- **+** App, Docker, manifests, monitoring config, and security posture are
  implemented and **actually verified** (builds, 17 tests, healthy stack, live
  endpoints, kube-linter/hadolint/promtool all clean, no secrets).
- **+** One real defect found and fixed during the audit.
- **−** No live AWS/EKS apply, no real pipeline run, no live ArgoCD sync or Grafana
  render — all require environments not available here.
- **−** Public EKS API CIDR default and missing lockfile commit are open items.

The score reflects that everything runnable is green, but "production-ready"
legitimately requires the live cluster/pipeline validations that remain.

---

## A. Critical fixes that must be done

1. **(Done in this audit)** Frontend ESLint peer conflict — fixed & re-verified.
2. **Commit lockfiles** (`backend/`, `frontend/`) for reproducible builds.
3. **Restrict `cluster_public_access_cidrs`** away from `0.0.0.0/0`.
4. **`terraform validate` + `plan`** and resolve findings before any apply.

## B. Recommended improvements

- Add image signing (Cosign) + admission verification (Kyverno/Policy Controller).
- Add AWS WAF at the ALB; consider a service mesh for mTLS if east-west encryption is needed.
- Add a frontend unit/component test suite (currently only the backend has tests).
- Wire Loki + Promtail for logs (the `monitoring/loki/` dir is still a placeholder).
- Run `npm audit` / a live Trivy scan against the committed lockfiles and triage.

## C. Exact commands you should run manually

- The full block under **Validation commands** above (all safe/local).
- On a sandbox AWS account: `cd infra && terraform init && terraform plan` then apply.
- After apply: `aws eks update-kubeconfig ...`, install ArgoCD, `kubectl apply -f argocd/project.yaml -f argocd/root-app.yaml`, then `argocd app sync netflow-dev`.
- Install `kube-prometheus-stack` per `monitoring/helm-values.yaml`; confirm targets in Prometheus and dashboards in Grafana.

## D. Credentials / accounts / services you still need to configure

- **AWS account** + a provisioning IAM role/SSO (no static keys) for Terraform.
- **Jenkins credentials:** `nvd-api-key`, `gitops-repo-credentials` (PAT), a SonarQube
  server + token, and ECR auth via the agent IAM role.
- **SonarQube server** (self-hosted or SonarCloud).
- **GitOps repository** that ArgoCD watches (`repoURL` in the Applications) + a token.
- **AWS Secrets Manager** entries `netflow/<env>/backend` (DB creds) for External Secrets.
- **Route53 hosted zone + ACM certificate** for the app domain (ingress TLS).
- **Alertmanager receivers** (Slack/PagerDuty/email) via a secret, not committed.

## E. Evidence to capture for your resume / presentation

Capture these — they are **real and reproducible** from this repo:
- Terminal showing `npm test` → **17 tests passing** (3 suites).
- `docker compose ps` with all three services **healthy** + `curl` output for
  `/health`, `/ready`, `/api/v1/content/home`, and `/metrics` (showing
  `http_requests_total`).
- `kube-linter` output: **0 lint errors** on `k8s/base`.
- `hadolint` passing both Dockerfiles.
- `promtool check rules` → **13 rules found** and `check config` valid.
- `kubectl kustomize k8s/overlays/prod` rendering cleanly.
- The audit fix diff (`eslint-plugin-react-hooks` bump) as an example of catching a
  real defect via validation.

> Do **not** present time-based operational metrics (deployment speed, build success
> rate, MTTD/MTTR) — those have not been measured. See
> `docs/PROJECT-OVERVIEW.md` for how to measure them legitimately once the system runs.
