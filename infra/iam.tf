# =============================================================================
# IAM — least-privilege roles.
#   - EKS cluster role (control plane)
#   - EKS node role (worker nodes)
#   - IRSA roles for in-cluster workloads (External Secrets, AWS LB Controller)
#   - CI push policy scoped to the app ECR repositories
# Managed AWS policies are used where they represent the minimal supported set;
# custom policies are scoped to specific resources.
# =============================================================================

data "aws_caller_identity" "current" {}

# --- EKS cluster (control plane) role ---------------------------------------
data "aws_iam_policy_document" "eks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_cluster" {
  name               = "${local.name}-eks-cluster"
  assume_role_policy = data.aws_iam_policy_document.eks_assume.json
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# --- EKS worker node role ---------------------------------------------------
data "aws_iam_policy_document" "node_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "eks_nodes" {
  name               = "${local.name}-eks-nodes"
  assume_role_policy = data.aws_iam_policy_document.node_assume.json
}

# Minimal managed policies required by EKS managed node groups.
resource "aws_iam_role_policy_attachment" "node_worker" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

# Read-only pull from ECR (nodes pull images; push is a CI-only concern).
resource "aws_iam_role_policy_attachment" "node_ecr_readonly" {
  role       = aws_iam_role.eks_nodes.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# --- IRSA trust helper -------------------------------------------------------
# Builds an assume-role policy that trusts the cluster OIDC provider for a
# specific Kubernetes service account (namespace:serviceaccount).
locals {
  oidc_provider_url = replace(aws_iam_openid_connect_provider.eks.url, "https://", "")
}

data "aws_iam_policy_document" "irsa_external_secrets" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_provider_url}:sub"
      values   = ["system:serviceaccount:external-secrets:external-secrets"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_provider_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

# IRSA role for the External Secrets Operator — read only the app's secrets.
resource "aws_iam_role" "external_secrets" {
  name               = "${local.name}-irsa-external-secrets"
  assume_role_policy = data.aws_iam_policy_document.irsa_external_secrets.json
}

data "aws_iam_policy_document" "external_secrets" {
  statement {
    sid    = "ReadAppSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    # Scope to this project's secret name prefix only.
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.project}/${var.environment}/*",
    ]
  }
}

resource "aws_iam_role_policy" "external_secrets" {
  name   = "read-app-secrets"
  role   = aws_iam_role.external_secrets.id
  policy = data.aws_iam_policy_document.external_secrets.json
}

# --- CI push policy (attach to the CI principal / Jenkins agent role) --------
# Provided as a managed policy so it can be attached to whatever identity CI uses.
data "aws_iam_policy_document" "ci_ecr_push" {
  statement {
    sid       = "EcrAuth"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # GetAuthorizationToken does not support resource scoping
  }
  statement {
    sid    = "EcrPushPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for r in aws_ecr_repository.this : r.arn]
  }
}

resource "aws_iam_policy" "ci_ecr_push" {
  name        = "${local.name}-ci-ecr-push"
  description = "Least-privilege ECR push/pull for CI, scoped to the app repositories"
  policy      = data.aws_iam_policy_document.ci_ecr_push.json
}
