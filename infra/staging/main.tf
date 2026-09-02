variable "use_custom_domain" {
  type        = bool
  description = "Attach staging.fieldnotes.tw once infra/dns ACM is issued (after NS flip)."
  default     = false
}

variable "tf_state_bucket" {
  type        = string
  description = "Shared Terraform state bucket (same value as backend.hcl). Required when use_custom_domain is true."
  default     = null
}

variable "line_channel_id" {
  type        = string
  description = "LINE Login channel ID (empty disables LINE login)"
  default     = ""
}

variable "line_channel_secret" {
  type        = string
  description = "LINE Login channel secret"
  default     = ""
  sensitive   = true
}

data "terraform_remote_state" "dns" {
  count = var.use_custom_domain ? 1 : 0

  backend = "s3"
  config = {
    bucket = var.tf_state_bucket
    key    = "dns/terraform.tfstate"
    region = "ap-east-2"
  }
}

module "stack" {
  source = "../modules/stack"

  providers = {
    aws     = aws
    aws.ses = aws.ses
  }

  environment       = "staging"
  aws_region        = "ap-east-2"
  vpc_cidr          = "10.20.0.0/16"
  instance_type     = "t4g.micro"
  db_instance_class = "db.t4g.micro"
  # Demo cards for staging previews; images live in the media bucket, not the API image.
  seed_demo = true
  # Production owns the SES domain identity so staging can be destroyed without breaking mail.
  manage_ses_identity = false
  # Allow terraform destroy to wipe versioned objects (idle teardown).
  force_destroy = true

  hosted_zone_id      = var.use_custom_domain ? data.terraform_remote_state.dns[0].outputs.zone_id : null
  acm_certificate_arn = var.use_custom_domain ? data.terraform_remote_state.dns[0].outputs.acm_certificate_arn : null
  domain_names        = var.use_custom_domain ? ["staging.fieldnotes.tw"] : []
  primary_domain      = var.use_custom_domain ? "staging.fieldnotes.tw" : null
  create_dns_records  = var.use_custom_domain
  line_channel_id     = var.line_channel_id
  line_channel_secret = var.line_channel_secret
}

output "cloudfront_domain_name" {
  value = module.stack.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  value = module.stack.cloudfront_distribution_id
}

output "media_bucket" {
  value = module.stack.media_bucket
}

output "ecr_repository_url" {
  value = module.stack.ecr_repository_url
}

output "api_instance_id" {
  value = module.stack.api_instance_id
}

output "api_public_ip" {
  value = module.stack.api_public_ip
}

output "db_secret_arn" {
  value = module.stack.db_secret_arn
}

output "app_secret_arn" {
  value = module.stack.app_secret_arn
}

output "admin_email" {
  value = module.stack.admin_email
}

output "ses_email_from" {
  value = module.stack.ses_email_from
}

output "ses_dkim_tokens" {
  value = module.stack.ses_dkim_tokens
}

output "app_public_host" {
  value = module.stack.app_public_host
}
