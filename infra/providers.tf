provider "aws" {
  region = var.aws_region

  # Consistent tags applied to every resource that supports tagging.
  default_tags {
    tags = local.common_tags
  }
}
