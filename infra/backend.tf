# Remote state backend (recommended for team use).
#
# Configure with a pre-existing S3 bucket + DynamoDB lock table, then run:
#   terraform init -backend-config=backend.hcl
#
# Left commented so `terraform init` works locally out of the box. Uncomment and
# supply values (or a backend.hcl) before collaborating / running in CI.
#
# terraform {
#   backend "s3" {
#     bucket         = "netflow-terraform-state"
#     key            = "infra/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "netflow-terraform-locks"
#     encrypt        = true
#   }
# }
