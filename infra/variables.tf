variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name, used as a prefix and tag"
  type        = string
  default     = "netflow"
}

variable "environment" {
  description = "Environment name (e.g. dev, staging, prod)"
  type        = string
  default     = "prod"
}

# --- Networking -------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to spread subnets across"
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 4
    error_message = "az_count must be between 2 and 4 for HA and address-space sanity."
  }
}

variable "single_nat_gateway" {
  description = "Use a single NAT gateway (cheaper, less HA) instead of one per AZ"
  type        = bool
  default     = true
}

# --- EKS --------------------------------------------------------------------
variable "kubernetes_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.30"
}

variable "node_instance_types" {
  description = "Instance types for the managed node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_desired_size" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum number of worker nodes"
  type        = number
  default     = 4
}

variable "node_disk_size" {
  description = "EBS root volume size (GiB) per worker node"
  type        = number
  default     = 20
}

variable "node_capacity_type" {
  description = "Capacity type for the node group: ON_DEMAND or SPOT"
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

variable "cluster_public_access_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint. Restrict this in production."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# --- ECR --------------------------------------------------------------------
variable "ecr_repositories" {
  description = "ECR repositories to create for application images"
  type        = list(string)
  default     = ["netflow-backend", "netflow-frontend"]
}

variable "ecr_untagged_expiry_days" {
  description = "Expire untagged ECR images after this many days"
  type        = number
  default     = 14
}
