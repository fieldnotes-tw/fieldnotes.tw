output "state_bucket" {
  value     = aws_s3_bucket.tfstate.bucket
  sensitive = true
}

output "lock_table" {
  value = aws_dynamodb_table.tf_locks.name
}

output "github_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}

output "gha_role_staging_arn" {
  value     = aws_iam_role.gha_staging.arn
  sensitive = true
}

output "gha_role_prod_arn" {
  value     = aws_iam_role.gha_prod.arn
  sensitive = true
}
