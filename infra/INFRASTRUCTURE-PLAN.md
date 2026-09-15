# Infrastructure Plan (read before applying)

This document is the design/plan for the production AWS infrastructure implemented
as Terraform in this directory. It lists every resource that will be created, the
public/private split, least-privilege IAM, **what must be configured manually in the
AWS console**, cost considerations, and how the implementation satisfies each
requirement.

> The Terraform in `infra/` implements this plan. Nothing has been applied. Run
> `terraform plan` to preview before `terraform apply`.
> This project **only creates its own resources** and does not modify or destroy
> anything outside it.

---

## 1. Architecture summary

```
AWS account / region
└── VPC (10.0.0.0/16, 3 AZs)
    ├── Public subnets  (one per AZ)   → Internet Gateway, NAT Gateway(s), ALB
    └── Private subnets (one per AZ)   → EKS worker nodes (+ future RDS)
        │
        ├── EKS control plane (managed)        — API endpoint (public+private)
        ├── EKS managed node group (private)   — worker nodes, no public IPs
        └── OIDC provider                      — IRSA for pod-level IAM
    ECR (immutable, scan-on-push)  — netflow-backend, netflow-frontend
    IAM  — cluster role, node role, IRSA role(s), CI push policy
```

Worker nodes run in **private** subnets with **no public IPs**; inbound app traffic
reaches them only through an ALB in the public subnets (created later by the
AWS Load Balancer Controller / Ingress). Egress from nodes goes out via NAT.

---

## 2. Resources created (inventory)

| Category | Resource(s) | Count (defaults) |
|---|---|---|
| Networking | `aws_vpc` | 1 |
| | `aws_internet_gateway` | 1 |
| | `aws_subnet` public | 3 (one per AZ) |
| | `aws_subnet` private | 3 (one per AZ) |
| | `aws_eip` (NAT) | 1 (single NAT) or 3 |
| | `aws_nat_gateway` | 1 (single NAT) or 3 |
| | `aws_route_table` + associations | public 1, private 3 |
| EKS | `aws_eks_cluster` | 1 |
| | `aws_eks_node_group` (managed) | 1 (2–4 nodes) |
| | `aws_iam_openid_connect_provider` | 1 |
| | `aws_eks_addon` (vpc-cni, coredns, kube-proxy) | 3 |
| ECR | `aws_ecr_repository` (+ lifecycle policy) | 2 |
| IAM | cluster role, node role | 2 |
| | IRSA role (External Secrets) | 1 |
| | CI ECR-push managed policy | 1 |
| | role policy attachments | several |
| Logging | CloudWatch log group for EKS control plane | 1 (auto-created by EKS) |

---

## 3. Public vs private (requirement 1 & 3)

| Tier | What lives here | Internet-reachable? |
|---|---|---|
| **Public subnets** | Internet Gateway, NAT Gateway(s), future ALB | Yes (ingress/egress) |
| **Private subnets** | EKS worker nodes, future RDS | No inbound from internet; egress via NAT only |

- Worker nodes have **no public IPs** and sit in private subnets (requirement 3).
- The **EKS API endpoint** is enabled for both private and public access; public
  access is gated by `cluster_public_access_cidrs`. **Restrict this to your
  office/VPN CIDRs in production** (see manual steps) or disable public access.

---

## 4. Least-privilege IAM (requirement 2)

| Identity | Permissions | Scope |
|---|---|---|
| EKS cluster role | `AmazonEKSClusterPolicy` | control plane only |
| Node role | `AmazonEKSWorkerNodePolicy`, `AmazonEKS_CNI_Policy`, `AmazonEC2ContainerRegistryReadOnly` | nodes **pull** images only |
| IRSA: External Secrets | `secretsmanager:GetSecretValue`/`DescribeSecret` on `netflow/<env>/*` | that SA + those secrets only |
| CI ECR push (managed policy) | ECR push/pull on the 2 app repos + `GetAuthorizationToken` | app repos only |

No wildcard admin roles. The IRSA role is assumable **only** by the
`external-secrets:external-secrets` service account via the cluster OIDC provider.

---

## 5. Manual AWS console / CLI steps (NOT done by this Terraform)

These are intentionally outside the Terraform to avoid chicken-and-egg problems,
secret exposure, or destructive scope:

1. **Terraform remote state bootstrap** — create the S3 state bucket (versioned,
   encrypted) and the DynamoDB lock table *before* enabling the `backend "s3"` block.
   Commands are in [`README.md`](./README.md). (One-time, per account.)
2. **AWS credentials for Terraform** — configure via `aws configure`, SSO, or an
   assumed role/CI OIDC. **Never hardcode keys** (requirement 8). Terraform reads
   them from the standard AWS credential chain.
3. **Restrict the EKS public API CIDRs** — set `cluster_public_access_cidrs` to your
   real office/VPN ranges (or disable public access) rather than the `0.0.0.0/0`
   default. This is a variable, but choosing the value is a human decision.
4. **Cluster access entries / `aws-auth`** — grant your IAM users/roles and the CI
   role access to the cluster (EKS Access Entries or the `aws-auth` ConfigMap) so
   `kubectl` and ArgoCD can operate. The creating principal is admin by default.
5. **Application secrets in Secrets Manager** — create the `netflow/<env>/*` secrets
   (e.g. DB credentials) that the External Secrets Operator will sync. Secret values
   must not be in Terraform or Git.
6. **Domain + TLS (later, for ingress)** — a Route53 hosted zone and an ACM
   certificate for the app's domain, consumed by the ALB/Ingress. Not required to
   stand up the cluster; needed to serve public HTTPS traffic.
7. **In-cluster controllers (later)** — install the AWS Load Balancer Controller,
   External Secrets Operator, and ArgoCD (via Helm/manifests). Terraform here
   provisions the IAM/OIDC they rely on but does not install the charts.

---

## 6. Estimated cost considerations (requirement 10)

Rough **monthly** estimate, `us-east-1`, on-demand, defaults (2× t3.medium, single
NAT). Prices are approximate and change over time — verify with the
[AWS Pricing Calculator](https://calculator.aws/).

| Resource | Basis | Est. / month (USD) |
|---|---|---|
| EKS control plane | $0.10/hr | ~$73 |
| Worker nodes | 2 × t3.medium @ ~$0.0416/hr | ~$60 |
| EBS (node root vols) | 2 × 20 GB gp3 | ~$3 |
| NAT gateway | 1 × ~$0.045/hr + data processing | ~$33 + data |
| ECR storage | first 500 MB free, then ~$0.10/GB | ~$1–5 |
| CloudWatch logs | ingestion + storage | ~$1–10 (usage-dependent) |
| Data transfer | egress + cross-AZ | variable |
| **Baseline total** | | **~$170–190 + data/transfer** |

### Cost levers
- **NAT gateway** is a big fixed cost. `single_nat_gateway = true` (default) uses one
  instead of one per AZ (saves ~$66/mo) at the cost of AZ redundancy for egress.
- **Node size/count** — `t3.medium` × 2 is a starting point; scale via
  `node_min_size`/`node_max_size` and instance type. Consider Spot for non-critical
  workloads.
- **Public API + logs** — control-plane logging and cross-AZ traffic add up; trim log
  types if not needed.
- **EKS control plane** is a flat ~$73/mo regardless of size — the main reason not to
  run many tiny clusters.

> These are estimates for planning only, not a quote. Actual cost depends on region,
> usage, data transfer, and pricing changes.

---

## 7. Requirement checklist

| # | Requirement | How it's met |
|---|---|---|
| 1 | Separate public/private networking | Public subnets (IGW/NAT/ALB) vs private subnets (nodes/RDS) |
| 2 | Least-privilege IAM | Scoped roles + IRSA + CI policy limited to app repos (§4) |
| 3 | Don't expose worker nodes | Nodes in private subnets, no public IPs; ingress via ALB only |
| 4 | Use ECR | 2 immutable, scan-on-push repos with lifecycle policies |
| 5 | Configure EKS for the app | Managed node group, autoscaling, OIDC/IRSA, core addons, audit logs |
| 6 | Resource tagging | Provider `default_tags` (Project/Environment/ManagedBy) + `Name` tags |
| 7 | Reproducible | Pinned Terraform + provider versions, lockfile, deterministic CIDRs/tags, remote state |
| 8 | No hardcoded credentials | AWS credential chain only; no keys in code; secrets via Secrets Manager/IRSA |
| 9 | plan/apply/destroy instructions | See [`README.md`](./README.md) §Usage and §Teardown |
| 10 | Cost + resources documented | This document (§2, §6) |

---

## 8. Apply / destroy workflow (summary)

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # customize; restrict API CIDRs
terraform init
terraform plan -out plan.tfplan                # REVIEW before applying
terraform apply plan.tfplan
# ... later ...
terraform destroy                              # empties nothing outside this project
```

Full details, remote-state bootstrap, and IRSA usage are in [`README.md`](./README.md).
