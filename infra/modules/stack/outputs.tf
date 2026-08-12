output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "primary_domain" {
  value = local.primary_domain
}

output "app_public_host" {
  description = "Hostname used for app_base_url (custom domain when enabled)"
  value       = local.app_public_host
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "api_instance_id" {
  value = aws_instance.api.id
}

output "api_public_ip" {
  value = aws_eip.api.public_ip
}

output "db_secret_arn" {
  value = aws_secretsmanager_secret.db.arn
}

output "app_secret_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "admin_email" {
  value = var.admin_email
}

output "ses_email_from" {
  value = local.email_from
}

output "ses_dkim_tokens" {
  description = "Create CNAME records: <token>._domainkey.fieldnotes.tw → <token>.dkim.amazonses.com"
  value       = local.ses_dkim_tokens
}

output "database_endpoint" {
  value = aws_db_instance.this.address
}
