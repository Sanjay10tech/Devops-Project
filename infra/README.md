# Infrastructure (Terraform)

Declarative AWS infrastructure for the Netflow platform, matching
[`../ARCHITECTURE.md`](../ARCHITECTURE.md):

```
AWS
├── VPC        public + private subnets across AZs, IGW, NAT, route tables
├── EKS        managed control plane + node group (private), OIDC/IRSA, addons
├── ECR        immutable, scan-on-push repositories for app images
└── IAM        least-privilege roles (cluster, nodes, IRSA, CI push)
```

## Files

| File | Purpose |
|---|---|
| `INFRASTRUCTURE-PLAN.md` | **Read first** — resource inventory, manual steps, cost, requirement mapping |
| `versions.tf` | Terraform + provider version pins (reproducibility) |
| `providers.tf` | AWS provider + default tags |
| `backend.tf` | Remote state backend (S3 + DynamoDB), commented until configured |
| `variables.tf` | Input variables (region, CIDRs, sizes, versions) |
| `terraform.tfvars.example` | Copy to `terraform.tfvars` and customize |
| `locals.tf` | AZ selection, subnet CIDR math, common tags |
| `vpc.tf` | VPC, subnets, IGW, NAT, route tables (+ EKS subnet tags) |
| `eks.tf` | EKS cluster, OIDC provider, managed node group, core addons |
| `ecr.tf` | ECR repositories + lifecycle policies |
| `iam.tf` | IAM roles/policies (least-privilege) |
| `outputs.tf` | Cluster/ECR/IAM outputs |

## Prerequisites

- Terraform >= 1.6
- AWS credentials with permission to create VPC/EKS/ECR/IAM resources
  (use a dedicated provisioning role; do not use long-lived root keys)
- `kubectl` and `aws` CLI to interact with the cluster afterward

## Remote state (recommended)

State can contain sensitive data — keep it in encrypted S3 with locking, not in Git
(`*.tfstate` is gitignored). One-time bootstrap of the state bucket + lock table:

```bash
aws s3api create-bucket --bucket netflow-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket netflow-terraform-state \
  --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name netflow-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Then uncomment the `backend "s3"` block in `backend.tf` and run `terraform init`.

## Usage

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # adjust values

terraform init
terraform fmt -check
terraform validate
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

Configure kubectl afterward (the exact command is emitted as an output):

```bash
aws eks update-kubeconfig --region us-east-1 --name netflow-prod
kubectl get nodes
```

## Least-privilege IAM

- **Cluster role** — only `AmazonEKSClusterPolicy`.
- **Node role** — `AmazonEKSWorkerNodePolicy`, `AmazonEKS_CNI_Policy`, and
  `AmazonEC2ContainerRegistryReadOnly` (pull only; nodes never push).
- **IRSA (External Secrets)** — a role assumable **only** by the
  `external-secrets:external-secrets` service account (via the cluster OIDC
  provider), scoped to read Secrets Manager secrets under
  `netflow/<env>/*` — nothing else.
- **CI ECR push** — a managed policy scoped to *just* the two app repositories
  (plus the un-scopable `GetAuthorizationToken`). Attach it to the Jenkins/CI
  identity. Prefer an IAM role over static keys.

### Using an IRSA role from Kubernetes

Annotate the service account with the role ARN (from `terraform output`):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: external-secrets
  namespace: external-secrets
  annotations:
    eks.amazonaws.com/role-arn: <external_secrets_irsa_role_arn>
```

## Security notes

- `cluster_public_access_cidrs` defaults to `0.0.0.0/0` for convenience.
  **Restrict it to your office/VPN CIDRs in production**, or disable public access.
- No secrets are stored in this configuration. Application secrets live in AWS
  Secrets Manager and reach the cluster via IRSA + External Secrets Operator.
- Worker nodes and RDS live in **private** subnets; only the ALB and NAT are public.

## Teardown

```bash
terraform plan -destroy      # review exactly what will be removed
terraform destroy            # removes ONLY resources in this Terraform state
```

> `terraform destroy` only affects resources tracked in **this** project's state.
> It does not touch pre-existing VPCs, clusters, or any AWS resources created
> outside this configuration. Always review `terraform plan -destroy` first.
>
> ECR repositories use `force_delete = false`, so destroy will fail if images
> remain. Empty the repositories first (or set `force_delete = true` deliberately).
> The remote-state S3 bucket + DynamoDB lock table are created manually and are
> **not** destroyed by this configuration.

## Status

This configuration has **not been applied** — it is provided as reviewed IaC.
Run `terraform plan` in a target account to preview before applying.
