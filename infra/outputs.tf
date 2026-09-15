# --- Networking -------------------------------------------------------------
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB / NAT)"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (EKS nodes / RDS)"
  value       = aws_subnet.private[*].id
}

# --- EKS --------------------------------------------------------------------
output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  description = "EKS API server endpoint"
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority" {
  description = "Base64-encoded cluster CA certificate"
  value       = aws_eks_cluster.this.certificate_authority[0].data
  sensitive   = true
}

output "oidc_provider_arn" {
  description = "IAM OIDC provider ARN for IRSA"
  value       = aws_iam_openid_connect_provider.eks.arn
}

output "kubeconfig_command" {
  description = "Command to configure kubectl for this cluster"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.this.name}"
}

# --- ECR --------------------------------------------------------------------
output "ecr_repository_urls" {
  description = "Map of ECR repository name -> repository URL"
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

# --- IAM --------------------------------------------------------------------
output "external_secrets_irsa_role_arn" {
  description = "IRSA role ARN for the External Secrets Operator service account"
  value       = aws_iam_role.external_secrets.arn
}

output "ci_ecr_push_policy_arn" {
  description = "Attach this managed policy to the CI identity to allow ECR push"
  value       = aws_iam_policy.ci_ecr_push.arn
}
