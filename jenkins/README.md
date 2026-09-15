# Jenkins CI Pipeline

Production-grade declarative pipeline ([`Jenkinsfile`](./Jenkinsfile)) that builds,
tests, scans, publishes immutable images, and updates the GitOps desired state.

**Jenkins never deploys to Kubernetes directly.** Its final act is a commit to the
GitOps repository; ArgoCD reconciles that change into the cluster.

## Stages

| # | Stage | Purpose | Fails build when |
|---|---|---|---|
| 1 | Checkout | Resolve commit, derive immutable `IMAGE_TAG` (git SHA), create report dirs | — |
| 2 | Environment Validation | Assert required tools + Docker daemon are present | a tool is missing |
| 3 | Install Dependencies | `npm ci` (backend + frontend, parallel, `retry(2)`) | install fails |
| 4 | Lint | `typecheck` + ESLint (JSON reports archived) | lint/type errors |
| 5 | Unit Tests | Backend Vitest → JUnit report | test failure |
| 6 | Test Coverage | Coverage run + **threshold gate** (`MIN_COVERAGE`) | coverage below min |
| 7 | Static Code Analysis | Trivy config/misconfig + secret scan report | — (report) |
| 8 | SonarQube Analysis + Quality Gate | SAST + `waitForQualityGate` | failing quality gate |
| 9 | Dependency Vulnerability Scan | OWASP Dependency-Check (`retry(2)`) | CVSS ≥ `OWASP_FAIL_ON_CVSS` |
| 10 | Trivy Filesystem Scan | vuln/secret/misconfig on source | severity ≥ `TRIVY_SEVERITY` |
| 11 | Docker Image Build | Build backend + frontend (parallel), OCI revision label | build fails |
| 12 | Trivy Container Image Scan | Scan both images | severity ≥ `TRIVY_SEVERITY` |
| 13 | Image Tagging | Immutable `IMAGE_TAG` + `<branch>-<sha>` (no `latest`) | — |
| 14 | Push Image to Registry | ECR login + push (`retry(2)`) | push fails |
| 15 | GitOps Deployment Update | `kustomize edit set image` + commit to GitOps repo | push fails |

## Configurable security thresholds (build parameters)

| Parameter | Default | Meaning |
|---|---|---|
| `TRIVY_SEVERITY` | `HIGH,CRITICAL` | Severities that fail Trivy FS + image scans |
| `OWASP_FAIL_ON_CVSS` | `7` | Fail dependency scan on CVSS ≥ this value |
| `MIN_COVERAGE` | `70` | Minimum backend line coverage % |
| `UPDATE_GITOPS` | `true` | Whether to update the GitOps desired state |

## Reliability & hygiene features

- **Timeout:** 60-minute hard pipeline timeout; 10-minute quality-gate timeout.
- **Retry:** `retry(2)` on dependency install, dependency scan, image push, and the
  GitOps update (network-sensitive stages).
- **Concurrency:** `disableConcurrentBuilds()`.
- **Reports archived:** lint JSON, JUnit test results, coverage, Trivy reports, and
  OWASP Dependency-Check reports are archived under `reports/**` (fingerprinted).
- **Safe cleanup:** `docker image prune` + `cleanWs(deleteDirs: true, notFailBuild: true)`
  in `post { always }`.
- **Immutable tags:** images are tagged with the **git SHA** (and `<branch>-<sha>`).
  **No `latest` tag is used for deployment.**
- **Reproducible:** `npm ci` against committed lockfiles, pinned tool versions on the
  agent, and deterministic image tags.

## Not leaking secrets

- All secrets come from **Jenkins credentials** via `withCredentials` /
  `withSonarQubeEnv` — never hardcoded.
- Sensitive shell blocks run with `set +x` so tokens (NVD key, ECR login password,
  Git token in the clone URL) are **never echoed** to the console log.
- The SonarQube token is injected by `withSonarQubeEnv` and masked by Jenkins.

## Required Jenkins credentials

Create these under **Manage Jenkins → Credentials** (store in a folder/domain scoped
to this job where possible). IDs must match the `Jenkinsfile`.

| Credential ID | Type | Purpose | Referenced in |
|---|---|---|---|
| `nvd-api-key` | Secret text | NVD API key for OWASP Dependency-Check (faster, rate-limit-free CVE data) | Dependency Vulnerability Scan |
| `gitops-repo-credentials` | Username with password (PAT as password) | Clone & push the GitOps config repo so the image tag can be bumped | GitOps Deployment Update |
| SonarQube token | Secret text, attached to the **SonarQube server** config (`sonarqube`) under *Manage Jenkins → System* | Authenticates the scanner to SonarQube | SonarQube Analysis (`withSonarQubeEnv`) |
| ECR access | **Preferred:** IAM role on the Jenkins agent (instance profile / IRSA). **Alternative:** `aws-ecr-credentials` (AWS access key/secret) | Authenticate to Amazon ECR to push images | Push Image to Registry |

### Notes on each credential

- **`nvd-api-key`** — Request a free key from the NVD. Least privilege: it only reads
  public CVE data. Rotate periodically.
- **`gitops-repo-credentials`** — Use a **fine-grained Personal Access Token** (or a
  deploy key) scoped to *only* the GitOps repository with **contents: write**. It must
  not have access to other repos or org admin scopes. This is the only credential that
  can change the deployment desired state.
- **SonarQube token** — Generated in SonarQube (My Account → Security). Scope to
  "Execute Analysis". Configured on the server object, not inline in the pipeline.
- **ECR access** — Prefer an **IAM role** on the agent with an ECR policy limited to
  `Push` on the two repositories (plus `GetAuthorizationToken`). Avoid long-lived
  access keys; if unavoidable, store them as a Jenkins AWS credential and bind them,
  never print them.

> If you switch ECR auth to static keys, bind them with `withCredentials([aws...])`
> and keep `set +x` around the login step so nothing is logged.

## Prerequisites

### Jenkins plugins
- Pipeline / Pipeline: Declarative
- Git, Credentials Binding
- SonarQube Scanner for Jenkins
- Pipeline Utility Steps (`readJSON`)
- AnsiColor (`ansiColor('xterm')`)
- JUnit
- (Recommended) Docker Pipeline, AWS Steps

### Agent tooling (validated by the Environment Validation stage)
Node.js 20 + npm, Docker CLI + reachable daemon, `trivy`, `dependency-check` CLI,
`aws` CLI v2, `kustomize`, `git`, and a `sonar-scanner` tool named `sonar-scanner`
under *Manage Jenkins → Tools*.

## GitOps handoff

The final stage clones the GitOps repo and, in `k8s/overlays/prod`, runs:

```bash
kustomize edit set image \
  netflow-backend=<ECR>/netflow-backend:<git-sha> \
  netflow-frontend=<ECR>/netflow-frontend:<git-sha>
```

then commits and pushes. ArgoCD reconciles the change into EKS. The Kustomize image
names are declared in [`../k8s/base/kustomization.yaml`](../k8s/base/kustomization.yaml).
Rollback = revert the GitOps commit (or point the tag at a previous SHA).

## Related

- Security gates & configs: [`../security/README.md`](../security/README.md)
- Kubernetes manifests / GitOps target: [`../k8s/README.md`](../k8s/README.md)
- Full architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
