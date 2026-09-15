# Production Architecture

This document describes the complete production architecture for a containerized,
cloud-native web application delivered through a fully automated CI/CD and GitOps
pipeline on AWS. It covers the high-level system design, each architectural layer,
the end-to-end deployment data flow, and the failure/rollback strategy.

> Scope note: This document defines architecture and technology decisions only.
> Application features are intentionally **not** implemented yet.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Application Architecture](#2-application-architecture)
3. [CI/CD Architecture](#3-cicd-architecture)
4. [GitOps Architecture](#4-gitops-architecture)
5. [AWS Architecture](#5-aws-architecture)
6. [Kubernetes Architecture](#6-kubernetes-architecture)
7. [Monitoring Architecture](#7-monitoring-architecture)
8. [Security Architecture](#8-security-architecture)
9. [Data Flow: Git Push to Production](#9-data-flow-git-push-to-production)
10. [Failure and Rollback Flow](#10-failure-and-rollback-flow)
11. [Technology Decisions & Rationale](#11-technology-decisions--rationale)

---

## Technology Stack Summary

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite), served by Nginx |
| Backend | Node.js + Express (TypeScript), REST API |
| Database | PostgreSQL (Amazon RDS), migrations via Flyway |
| Containerization | Docker (multi-stage builds) |
| Image Registry | Amazon ECR |
| Continuous Integration | Jenkins (declarative pipeline) |
| Code Quality (SAST) | SonarQube |
| Image / Dependency Scan | Trivy |
| Dependency Vulnerabilities | OWASP Dependency-Check |
| Secret Scanning | Gitleaks |
| GitOps / Continuous Deployment | ArgoCD |
| Cloud Provider | AWS |
| Orchestration | Kubernetes (Amazon EKS) |
| Ingress / TLS | NGINX Ingress Controller + cert-manager |
| Metrics | Prometheus |
| Dashboards | Grafana |
| Alerting | Alertmanager |
| Log Aggregation | Loki + Promtail |
| Secrets Management | AWS Secrets Manager + External Secrets Operator |
| IaC | Terraform |

---

## 1. High-Level Architecture

The system is a three-tier web application (frontend, backend API, database)
packaged as containers and deployed to a managed Kubernetes cluster on AWS. Two
Git repositories drive everything: an **application repo** (source code) and a
**GitOps config repo** (Kubernetes manifests). Jenkins builds and validates code;
ArgoCD reconciles the desired state from Git into the cluster.

```
                                   ┌──────────────────────────────────────────────┐
                                   │                   Developers                  │
                                   └───────────────────────┬──────────────────────┘
                                                           │ git push
                                                           ▼
                                        ┌───────────────────────────────────┐
                                        │        Git (Application Repo)      │
                                        └──────────────────┬────────────────┘
                                                           │ webhook
                                                           ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │                                     CI PIPELINE (Jenkins)                                 │
   │  checkout → lint/test → SonarQube → Gitleaks → OWASP DC → build image → Trivy → push ECR  │
   │                              └────────────► update image tag in GitOps repo               │
   └────────────────────────────────────────────────────────────┬───────────────────────────┘
                                                                  │ commit new image tag
                                                                  ▼
                                        ┌───────────────────────────────────┐
                                        │       Git (GitOps Config Repo)     │
                                        └──────────────────┬────────────────┘
                                                           │ poll / webhook
                                                           ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │                                   AWS ACCOUNT / VPC                                       │
   │                                                                                          │
   │   Route53 → ALB → NGINX Ingress ──► ┌───────────── Amazon EKS ─────────────┐             │
   │                                     │  ArgoCD (reconciles from GitOps repo) │             │
   │                                     │  ┌───────────┐   ┌───────────┐        │             │
   │                                     │  │ frontend  │   │  backend  │        │  Amazon ECR │
   │                                     │  │ (Nginx)   │──►│  (API)    │──────► │  RDS (PG)   │
   │                                     │  └───────────┘   └─────┬─────┘        │  Secrets Mgr│
   │                                     │  Prometheus/Grafana/Loki│              │             │
   │                                     └─────────────────────────┴────────────┘             │
   └──────────────────────────────────────────────────────────────────────────────────────────┘
```

Key principles:

- **Git is the single source of truth** for both code and infrastructure/deployment state.
- **Separation of CI and CD**: Jenkins builds and verifies artifacts; ArgoCD deploys. A push to Git never directly `kubectl apply`s to the cluster.
- **Immutable artifacts**: every build produces a uniquely tagged, scanned container image.
- **Declarative infrastructure**: Terraform provisions AWS; Kubernetes manifests describe workloads.

---

## 2. Application Architecture

A classic three-tier design with clear boundaries between presentation, business
logic, and persistence.

```
┌─────────────┐     HTTPS      ┌──────────────┐    SQL/TLS    ┌──────────────┐
│  Frontend   │ ─────────────► │   Backend    │ ────────────► │  PostgreSQL  │
│ React+Nginx │ ◄───────────── │ Express API  │ ◄──────────── │  (Amazon RDS)│
└─────────────┘   JSON/REST    └──────────────┘   result sets └──────────────┘
```

- **Frontend (React + TypeScript, Vite):** A single-page application built into
  static assets and served by Nginx inside a container. Nginx also handles gzip,
  caching headers, and proxies `/api` to the backend service.
- **Backend (Node.js + Express, TypeScript):** Stateless REST API. Statelessness
  is essential so it can scale horizontally behind a Kubernetes Service and
  survive pod rescheduling. Configuration and secrets are injected via environment
  variables sourced from Kubernetes Secrets / AWS Secrets Manager.
- **Database (PostgreSQL on Amazon RDS):** Managed relational store. Schema changes
  are versioned and applied through **Flyway** migrations run as a Kubernetes Job
  (or init step) before the new backend version serves traffic.
- **Contracts:** The frontend and backend communicate over a versioned JSON REST
  API. Health endpoints (`/healthz` liveness, `/readyz` readiness) are exposed for
  Kubernetes probes.

---

## 3. CI/CD Architecture

Jenkins runs a declarative pipeline triggered by a webhook on every push/PR. CI is
responsible for correctness, quality, and security of the artifact — never for
deploying to the cluster.

```
git push ─► Jenkins webhook
   │
   ├─ 1. Checkout                (clone app repo, resolve commit SHA)
   ├─ 2. Build & Unit Test       (npm ci, lint, unit tests, coverage)
   ├─ 3. SAST — SonarQube        (quality gate: bugs, code smells, coverage)
   ├─ 4. Secret Scan — Gitleaks  (fail on committed secrets)
   ├─ 5. Dependency Scan — OWASP Dependency-Check (CVE gate)
   ├─ 6. Docker Build            (multi-stage image, tag = <git-sha>)
   ├─ 7. Image Scan — Trivy      (fail on HIGH/CRITICAL vulns)
   ├─ 8. Push to Amazon ECR      (push immutable <git-sha> tag)
   └─ 9. Update GitOps Repo      (bump image tag in Kustomize/Helm values,
                                  commit + push to config repo)
```

- **Quality gates** (SonarQube, Trivy, OWASP, Gitleaks) can fail the build and
  block promotion, giving a hard security/quality boundary before any deploy.
- **Jenkins agents** run as ephemeral Kubernetes pods (Kubernetes plugin) for
  clean, scalable, reproducible builds.
- The pipeline's final act is a **Git commit to the GitOps repo**, which hands off
  to ArgoCD. Jenkins has no cluster deploy credentials.

---

## 4. GitOps Architecture

ArgoCD continuously reconciles the live cluster state against the declared state in
the GitOps config repo.

```
┌────────────────────┐   watch/poll   ┌───────────────┐   apply/sync   ┌──────────────┐
│  GitOps Config Repo │ ◄───────────── │    ArgoCD     │ ─────────────► │   EKS Cluster │
│ (Kustomize overlays│                │ (in-cluster)  │                │  live state   │
│  per environment)  │ ──────────────►│ detects drift │ ◄───────────── │              │
└────────────────────┘                └───────────────┘   observe      └──────────────┘
```

- **Repo layout:** `base/` common manifests + `overlays/{dev,staging,prod}` using
  Kustomize for environment-specific values (replicas, resources, hostnames).
- **App-of-Apps pattern:** a root ArgoCD `Application` manages child Applications
  (frontend, backend, monitoring, etc.), enabling ordered, auditable rollouts.
- **Sync policy:** automated sync with **self-heal** (revert manual drift) and
  **prune** (delete resources removed from Git). Production uses a manual sync gate
  or PR approval to promote.
- **Drift detection:** any change made directly in the cluster is flagged and
  reverted to match Git, guaranteeing Git is the source of truth.

---

## 5. AWS Architecture

All infrastructure is provisioned with Terraform.

```
Route53 (DNS)
   │
   ▼
AWS Certificate Manager (TLS) ─► Application Load Balancer (public subnets)
                                        │
                    ┌───────────────────┴────────────────────┐
                    │              VPC (multi-AZ)             │
                    │                                         │
                    │  Public Subnets:  ALB, NAT Gateway      │
                    │  Private Subnets: EKS worker nodes      │
                    │  Private Subnets: RDS (Multi-AZ)        │
                    │                                         │
                    │  EKS control plane (managed)            │
                    │  ECR (images)   Secrets Manager         │
                    │  S3 (artifacts/backups)  CloudWatch     │
                    │  IAM (IRSA roles per workload)          │
                    └─────────────────────────────────────────┘
```

- **VPC** spanning multiple Availability Zones for high availability.
- **Public subnets** host the internet-facing ALB and NAT Gateways only.
- **Private subnets** host EKS worker nodes and RDS — no direct internet exposure.
- **Amazon EKS** provides the managed Kubernetes control plane.
- **Amazon RDS (PostgreSQL, Multi-AZ)** for durable, automatically-failing-over storage.
- **Amazon ECR** stores scanned container images.
- **AWS Secrets Manager** stores DB credentials and app secrets, pulled into the
  cluster via the External Secrets Operator using **IRSA** (IAM Roles for Service Accounts).
- **S3** for build artifacts, DB backups, and logs; **CloudWatch** for control-plane/audit logs.

---

## 6. Kubernetes Architecture

```
                         ┌──────────────── EKS Cluster ────────────────┐
   Internet ─► ALB ─► NGINX Ingress Controller                         │
                         │        │                                    │
              ┌──────────┘        └───────────┐                        │
              ▼                                ▼                        │
   ┌───────────────────┐          ┌───────────────────┐                │
   │ Namespace: app     │          │ Namespace: monitoring             │
   │  Deployment: frontend         │  Prometheus, Grafana, Loki        │
   │  Deployment: backend (HPA)    │  Alertmanager                     │
   │  Service (ClusterIP) x2       │                                   │
   │  Job: db-migrate (Flyway)     │ Namespace: argocd                 │
   │  Secret / ConfigMap           │  ArgoCD server + controllers      │
   │  NetworkPolicies              │                                   │
   └───────────────────┘          └───────────────────────────────────┘
                         └──────────────────────────────────────────────┘
```

- **Namespaces** isolate workloads: `app`, `monitoring`, `argocd`, `ingress-nginx`, `external-secrets`.
- **Deployments** for stateless frontend/backend; a **HorizontalPodAutoscaler**
  scales the backend on CPU/memory (and custom metrics later).
- **Services (ClusterIP)** provide stable in-cluster DNS; the **NGINX Ingress**
  routes external traffic and terminates TLS via cert-manager.
- **Probes:** liveness/readiness/startup probes keep only healthy pods in rotation.
- **Resource requests/limits** on every container for scheduling and stability.
- **NetworkPolicies** restrict pod-to-pod traffic (e.g., only backend may reach RDS).
- **Flyway migration Job** runs before the backend rollout completes.

---

## 7. Monitoring Architecture

```
   backend/frontend  ─exposes /metrics─► Prometheus ──► Alertmanager ──► Slack/Email/PagerDuty
        │                                    │
   Promtail (log shipper) ──► Loki ◄─────────┘ (queried by)
                                     Grafana (dashboards: metrics + logs)
```

- **Prometheus** scrapes application and cluster metrics (node-exporter,
  kube-state-metrics, app `/metrics`).
- **Grafana** provides dashboards for latency, error rate, saturation (RED/USE
  methods) and infrastructure health.
- **Alertmanager** routes alerts (high error rate, pod crashloops, DB connections,
  certificate expiry) to Slack/email/PagerDuty.
- **Loki + Promtail** aggregate container logs, correlated with metrics in Grafana.
- **SLO-oriented alerts** rather than noisy per-metric thresholds where possible.

---

## 8. Security Architecture

Defense in depth across the pipeline and runtime.

```
Code:      Gitleaks (secrets) ─► SonarQube (SAST) ─► OWASP DC (deps)
Image:     Trivy scan (fail HIGH/CRITICAL) ─► signed, immutable ECR tags
Cluster:   RBAC · NetworkPolicies · Pod Security Standards · non-root containers
Secrets:   AWS Secrets Manager ─► External Secrets Operator (IRSA), no secrets in Git
Network:   Private subnets · security groups · TLS everywhere (cert-manager/ACM)
Identity:  IAM least-privilege · IRSA per workload · MFA on human access
```

- **Shift-left scanning:** secrets, SAST, dependency, and image scans all gate CI.
- **No secrets in Git:** secrets live in AWS Secrets Manager and are synced at
  runtime; the GitOps repo only references them.
- **Least privilege:** each workload gets a scoped IAM role via IRSA; Jenkins can
  push to ECR and commit to the GitOps repo but cannot deploy to the cluster.
- **Runtime hardening:** non-root containers, read-only root filesystems where
  possible, Pod Security Standards, and NetworkPolicies limiting east-west traffic.
- **TLS end to end:** ACM at the ALB and cert-manager-issued certs at the ingress.

---

## 9. Data Flow: Git Push to Production

```
1.  Developer pushes commit to the application repo.
2.  Git webhook triggers the Jenkins pipeline.
3.  Jenkins checks out the commit and runs lint + unit tests.
4.  SonarQube quality gate evaluates the code (SAST).
5.  Gitleaks scans for committed secrets.
6.  OWASP Dependency-Check scans dependencies for known CVEs.
7.  Jenkins builds a Docker image tagged with the git SHA (multi-stage build).
8.  Trivy scans the image; HIGH/CRITICAL findings fail the build.
9.  The image is pushed to Amazon ECR (immutable tag).
10. Jenkins updates the image tag in the GitOps config repo (Kustomize overlay)
    and commits/pushes the change.
11. ArgoCD detects the new commit in the GitOps repo.
12. ArgoCD renders the manifests and syncs desired state into EKS
    (prod may require manual approval / PR merge to promote).
13. A Flyway migration Job applies any pending schema changes.
14. Kubernetes performs a rolling update of the backend/frontend Deployments;
    readiness probes gate traffic to new pods.
15. NGINX Ingress routes live traffic to the new, healthy pods.
16. Prometheus/Grafana confirm healthy metrics; Alertmanager stays silent on success.
```

---

## 10. Failure and Rollback Flow

Failures are caught at the earliest possible stage; rollback is Git-driven.

```
CI-stage failure (tests/SAST/secrets/deps/Trivy):
   └─► pipeline stops, no image pushed, developer notified. Nothing reaches the cluster.

Deploy-stage failure (bad rollout):
   ├─ Readiness probes fail  ─► rolling update halts, old pods keep serving traffic.
   ├─ ArgoCD health = Degraded ─► alert fired; sync marked failed.
   └─ Rollback options:
        a) ArgoCD "Rollback" to the previous synced revision (previous Git commit).
        b) Git revert of the image-tag bump in the GitOps repo ─► ArgoCD re-syncs
           to the last-known-good image (auditable, preferred).
        c) `kubectl rollout undo` as a break-glass manual step.

Database migration failure:
   ├─ Flyway Job fails ─► backend rollout is not promoted; previous version stays live.
   └─ Forward-fix migration preferred; destructive rollbacks avoided by design
      (expand/contract migration pattern).

Infrastructure failure:
   ├─ RDS Multi-AZ auto-failover to standby.
   ├─ EKS reschedules pods across AZs; HPA/cluster autoscaler add capacity.
   └─ Terraform state enables reproducible re-provisioning.
```

Because every deployment corresponds to a Git commit, **rollback is simply
reverting to a previous commit** — the same reconciliation loop restores the
last-known-good state, fully audited.

---

## 11. Technology Decisions & Rationale

**React + TypeScript (Vite)** — Component model and huge ecosystem for the SPA;
TypeScript adds compile-time safety; Vite gives fast builds and a small, static,
easily-cacheable output ideal for containerized Nginx delivery.

**Node.js + Express (TypeScript)** — Lightweight, well-understood REST framework
with a large ecosystem; sharing TypeScript across front and back reduces context
switching. Stateless design fits horizontal scaling on Kubernetes.

**PostgreSQL + Flyway** — Mature, ACID-compliant relational database appropriate
for transactional web apps. Flyway makes schema changes versioned, repeatable, and
CI-friendly.

**Docker (multi-stage builds)** — Produces small, immutable, reproducible images.
Multi-stage builds keep build tooling out of the final runtime image, shrinking
attack surface and size.

**Jenkins** — Flexible, self-hostable automation server with a mature plugin
ecosystem and Kubernetes agents; declarative pipelines keep CI as code. Chosen for
full control over quality/security gates.

**SonarQube / Trivy / OWASP Dependency-Check / Gitleaks** — Layered "shift-left"
security: SonarQube for code quality/SAST, OWASP DC for dependency CVEs, Trivy for
image and OS-package vulnerabilities, Gitleaks to stop secret leakage — each a hard
gate before deployment.

**Amazon ECR** — Managed, private registry integrated with IAM and EKS; keeps
images close to the cluster with fine-grained access control.

**ArgoCD (GitOps)** — Declarative continuous delivery with drift detection,
self-heal, and audit via Git history. Separating deploy (ArgoCD) from build
(Jenkins) removes cluster credentials from CI and makes rollbacks a Git operation.

**AWS (EKS, RDS, VPC, ALB, Route53, Secrets Manager, S3, IAM)** — A managed,
production-grade cloud: EKS offloads control-plane ops, RDS offloads DB ops with
Multi-AZ failover, and native services (IAM/IRSA, Secrets Manager, ACM) provide
security building blocks without extra tooling.

**Kubernetes (EKS)** — Industry-standard orchestration for self-healing, rolling
updates, autoscaling (HPA), and declarative workloads — the backbone of the GitOps model.

**NGINX Ingress + cert-manager** — Standard, flexible L7 routing with automated TLS
certificate issuance and renewal.

**Prometheus + Grafana + Alertmanager + Loki** — The de-facto Kubernetes
observability stack: pull-based metrics, rich dashboards, flexible alert routing,
and log aggregation, all correlated in one place.

**AWS Secrets Manager + External Secrets Operator (IRSA)** — Keeps secrets out of
Git and out of container images; synced into the cluster at runtime with
least-privilege IAM roles.

**Terraform** — Declarative, provider-agnostic IaC so the entire AWS footprint is
versioned, reviewable, and reproducible.
