variable "use_custom_domain" {
  type        = bool
  description = "Attach fieldnotes.tw / www once infra/dns ACM is issued and legacy GitHub Pages records are removed."
  default     = false
}

variable "tf_state_bucket" {
  type        = string
  description = "Shared Terraform state bucket (same value as backend.hcl). Required when use_custom_domain is true."
  default     = null
}

variable "create_dns_records" {
  type        = bool
  description = "Create apex/www Route 53 aliases. Set true only after infra/dns legacy_github_pages=false."
  default     = false
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

  environment         = "production"
  aws_region          = "ap-east-2"
  vpc_cidr            = "10.30.0.0/16"
  instance_type       = "t4g.micro"
  db_instance_class   = "db.t4g.micro"
  manage_ses_identity = true

  hosted_zone_id      = var.use_custom_domain ? data.terraform_remote_state.dns[0].outputs.zone_id : null
  acm_certificate_arn = var.use_custom_domain ? data.terraform_remote_state.dns[0].outputs.acm_certificate_arn : null
  domain_names        = var.use_custom_domain ? ["fieldnotes.tw", "www.fieldnotes.tw"] : []
  primary_domain      = var.use_custom_domain ? "fieldnotes.tw" : null
  create_dns_records  = var.use_custom_domain && var.create_dns_records
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
