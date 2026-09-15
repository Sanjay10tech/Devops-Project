data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name        = "${var.project}-${var.environment}"
  cluster_name = "${var.project}-${var.environment}"

  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # Deterministic subnet CIDRs carved from the VPC CIDR.
  # Public:  10.0.0.0/20, 10.0.16.0/20, ...
  # Private: 10.0.128.0/20, 10.0.144.0/20, ...
  public_subnet_cidrs  = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnet_cidrs = [for i in range(var.az_count) : cidrsubnet(var.vpc_cidr, 4, i + 8)]

  common_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
