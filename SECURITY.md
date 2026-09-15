# Security Policy

This document covers vulnerability reporting, the threat model, secrets
management, scanning, incident response, dependency updates, image scanning,
Kubernetes security controls, and the results of the most recent security review.

## Supported versions

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| `develop` | ✅ |
| older tags | ❌ |

## Reporting a vulnerability

**Do not report security vulnerabilities through public GitHub issues.** Report
privately via:

1. **GitHub Private Vulnerability Reporting** — repo **Security** tab → **Report a
   vulnerability** (preferred).
2. The maintainer's email on their GitHub profile.

Include: a description and impact, reproduction steps, the affected
component/commit, and any suggested remediation.

**What to expect:** acknowledgement within 3 business days, severity triage, and
coordinated disclosure with credit (if desired) once a fix ships.

---

## Threat model

A lightweight STRIDE-style view of the system (React SPA → Node/Express API →
PostgreSQL, delivered via Jenkins CI → ECR → ArgoCD → EKS).

### Assets
- User-facing application and its data (PostgreSQL content).
- Container images (ECR) and the deployment desired state (GitOps repo).
- Cloud infrastructure (EKS, RDS, IAM) and secrets (AWS Secrets Manager).
- CI/CD credentials (ECR push, GitOps push, NVD, SonarQube).

### Trust boundaries
- Internet → ALB/Ingress (public) → frontend → backend → database (private).
- CI (Jenkins) → registry (ECR) and GitOps repo — but **not** the cluster.
- Cluster workloads → AWS APIs via IRSA (scoped roles), not static keys.

### Key threats & mitigations
| Threat (STRIDE) | Example | Mitigation |
|---|---|---|
| Spoofing | Forged origin / stolen creds | TLS everywhere; IRSA (no static keys); scoped IAM |
| Tampering | Malicious image / manifest | Immutable git-SHA tags; Trivy image scan; GitOps review; signed commits recommended |
| Repudiation | Untracked change | Git history is the source of truth; EKS audit logs; ArgoCD history |
| Information disclosure | Secret leak | No secrets in Git/images; Secrets Manager + External Secrets; Gitleaks gate |
| Denial of service | Resource exhaustion | Resource requests/limits; HPA; PDB; NetworkPolicies |
| Elevation of privilege | Container breakout | Non-root, read-only rootfs, dropped caps, seccomp, restricted PSA, least-priv RBAC |

### Out of scope (current)
- WAF / DDoS protection at the edge (recommend AWS WAF + Shield).
- mTLS between services (recommend a service mesh if east-west encryption is required).
- Image signing/verification (recommend Cosign + admission policy).

---

## Secrets management

- **Never in Git or images.** Only `.env.example` (placeholders) is committed.
  `.gitignore` blocks `.env`, `*.pem`, `*.key`, `kubeconfig`, `.aws/`, and
  service-account JSON.
- **Source of truth:** AWS Secrets Manager (`netflow/<env>/*`).
- **Delivery to the cluster:** the External Secrets Operator assumes a scoped IRSA
  role (read-only on `netflow/<env>/*`) and materializes Kubernetes Secrets; the
  backend consumes them via `envFrom.secretRef`. Only references live in Git.
- **CI/CD secrets:** Jenkins credentials (`nvd-api-key`, `gitops-repo-credentials`),
  the SonarQube token (on the server object), and ECR auth (agent IAM role).
  Sensitive shell blocks run under `set +x` so tokens are never logged.
- **Alternatives supported:** Sealed Secrets or SOPS if not using External Secrets.
- **On exposure:** treat as compromised — **rotate immediately** and report privately.

---

## Vulnerability scanning (shift-left, gated)

Each of these is a **hard gate** in CI; a failure stops promotion. Gates are not
weakened to make the pipeline pass.

| Layer | Tool | Gate |
|---|---|---|
| Secrets | Gitleaks | any committed secret fails (Jenkins + GitHub Actions) |
| Code quality / SAST | SonarQube | quality gate (`waitForQualityGate abortPipeline`) |
| Dependencies | OWASP Dependency-Check | CVSS ≥ 7 fails |
| Dependencies | `npm audit` / Dependabot | alerts + PRs |
| Dockerfiles | **hadolint** | warnings/errors fail |
| IaC / manifests | **Trivy config** | HIGH/CRITICAL misconfig fails |
| K8s manifests | **kube-linter** | lint errors fail |
| Filesystem | Trivy fs | HIGH/CRITICAL vuln/secret/misconfig fails |
| Container image | Trivy image | HIGH/CRITICAL fails, before push |

---

## Image scanning & supply chain

- **Multi-stage, minimal images** (Alpine/unprivileged Nginx); build tooling never
  reaches the runtime layer.
- **Immutable tags** = git SHA; **no `latest`** anywhere in deployment.
- **Trivy** scans both the filesystem and the built images; HIGH/CRITICAL fails CI.
- **ECR** repositories are **immutable** with **scan-on-push** and lifecycle expiry.
- **Non-root, read-only root filesystem, dropped capabilities** at runtime.
- **Recommended next step:** sign images with Cosign and enforce verification via an
  admission controller (Kyverno/Policy Controller).

---

## Dependency updates

- **Dependabot** (`.github/dependabot.yml`) opens weekly PRs for npm (backend +
  frontend), Docker base images, and GitHub Actions.
- **Dependabot security alerts + updates** enabled in repo settings.
- **OWASP Dependency-Check** gates the pipeline on CVSS ≥ 7.
- **Commit `package-lock.json`** so `npm ci` installs are deterministic and audited.
- Review and merge dependency PRs promptly; security updates take priority.

---

## Kubernetes security controls

- **Pod Security Admission:** the `netflow` namespace enforces the **restricted**
  standard (enforce + audit + warn).
- **securityContext:** `runAsNonRoot`, non-root UID/GID, `readOnlyRootFilesystem`,
  `allowPrivilegeEscalation: false`, `capabilities: drop [ALL]`, and
  `seccompProfile: RuntimeDefault` on both workloads.
- **RBAC:** dedicated ServiceAccounts per workload with API-token automount off; a
  minimal Role (read one ConfigMap) — no cluster-admin.
- **NetworkPolicies:** default-deny ingress/egress; explicit allows for
  ingress→frontend, frontend→backend, backend→DB/HTTPS, DNS, and
  monitoring→backend `/metrics` only.
- **Resource requests/limits, HPA, PDB** (with `unhealthyPodEvictionPolicy`),
  and **pod anti-affinity** for resilience.
- **No `latest` images**; only immutable git-SHA tags are deployed.
- **Secrets** via External Secrets (no plaintext Secret manifests in Git).

---

## Incident response basics

1. **Detect** — alert (Alertmanager), anomaly in Grafana, failed scan, or report.
2. **Triage** — assess severity/scope. If a secret leaked, **rotate it now**.
3. **Contain** —
   - Bad release: **roll back** via ArgoCD (`argocd app rollback`) or `git revert`
     the GitOps commit (last-known-good image).
   - Compromised workload: scale to zero / cordon the node / apply a deny
     NetworkPolicy.
   - Compromised credential: revoke/rotate in AWS/GitHub; invalidate sessions.
4. **Eradicate & recover** — patch, rebuild a clean image (new git SHA), re-scan,
   redeploy through the pipeline (gates must pass).
5. **Post-incident** — write a blameless postmortem; add a regression test or a new
   pipeline gate so it can't recur.

Useful commands:
```bash
kubectl -n netflow-prod get pods
kubectl -n netflow-prod logs <pod> --previous
argocd app history netflow-prod && argocd app rollback netflow-prod <REV>
```

---

## Security review — findings & fixes (latest audit)

A full DevSecOps review was performed across source, dependencies, Dockerfiles,
images, Kubernetes manifests, RBAC, IAM, secrets, network policies, exposed
services, container privileges, filesystem permissions, CI/CD credentials, and
GitHub configuration.

### Fixed in this review
| # | Area | Finding | Fix | Verified |
|---|---|---|---|---|
| 1 | Frontend / exposed service | Missing HTTP security headers; nginx version exposed | Added CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy; `server_tokens off` | config reviewed |
| 2 | Backend / CORS | Fail-open: empty `CORS_ORIGINS` reflected any origin | Fail closed (`origin: false` when unset) | backend image rebuilt (compiles) |
| 3 | NetworkPolicy | Backend policy would block Prometheus scrape and left `/metrics` reachability implicit | Explicit allow from `monitoring` ns to backend:4000 only | manifest reviewed |
| 4 | K8s manifests | `latest` image tag rendered in base/prod | Non-`latest` placeholder tag; CI pins git SHA | **kube-linter: 0 errors** |
| 5 | K8s manifests | No pod anti-affinity | Added `podAntiAffinity` (preferred) on both workloads | **kube-linter: 0 errors** |
| 6 | K8s manifests | PDB missing `unhealthyPodEvictionPolicy` | Set `AlwaysAllow` on both PDBs | **kube-linter: 0 errors** |
| 7 | CI gates | No Dockerfile/manifest security lint | Added hadolint + kube-linter + gating `trivy config` to Jenkins | **hadolint: pass**, kube-linter wired |

### Verified good (no change needed)
- **SQL:** all queries parameterized (`$1..$n`) — no injection.
- **Source:** no `eval`/`exec`/`child_process`/`innerHTML`; `helmet()` enabled;
  `x-powered-by` disabled; Zod validation at the HTTP boundary.
- **Dockerfiles:** multi-stage, non-root, read-only rootfs, healthchecks,
  `dumb-init`; hadolint clean at the warning threshold.
- **IAM:** least-privilege roles; IRSA scoped to `netflow/<env>/*`; node role is
  ECR **read-only**; CI push policy scoped to the two repos.
- **Secrets:** none committed (Gitleaks + manual scan clean); only `.env.example`.
- **CI credentials:** all via Jenkins credentials with `set +x`; no hardcoded keys.
- **GitHub:** `permissions: contents: read` on workflows; Gitleaks on PRs;
  Dependabot configured; branch protection documented in `docs/github-setup.md`.

### Recommended (tracked, not blocking)
- Enable EKS public API endpoint CIDR restriction (currently defaults to `0.0.0.0/0`).
- Add image signing (Cosign) + admission verification.
- Add AWS WAF at the ALB and consider a service mesh for mTLS.
- Commit `package-lock.json` files for fully reproducible, audited installs.
