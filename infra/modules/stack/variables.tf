variable "project" {
  type    = string
  default = "fieldnotes"
}

variable "environment" {
  type        = string
  description = "staging or production"
}

variable "aws_region" {
  type    = string
  default = "ap-east-2"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "instance_type" {
  type        = string
  description = "API host instance type"
  default     = "t4g.micro"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_name" {
  type    = string
  default = "fieldnotes"
}

variable "db_username" {
  type    = string
  default = "fieldnotes"
}

variable "api_container_port" {
  type    = number
  default = 3001
}

variable "admin_email" {
  type        = string
  description = "Initial admin email seeded on first API boot (pre-verified)"
  default     = "admin@fieldnotes.tw"
}

variable "extra_cors_origins" {
  type        = list(string)
  description = "Additional allowed CORS origins beyond the CloudFront domain"
  default     = []
}

variable "hosted_zone_id" {
  type        = string
  description = "Route 53 hosted zone id for custom domains (from infra/dns). Null keeps the default cloudfront.net cert."
  default     = null
}

variable "acm_certificate_arn" {
  type        = string
  description = "us-east-1 ACM certificate ARN covering domain_names (from infra/dns)"
  default     = null
}

variable "domain_names" {
  type        = list(string)
  description = "CloudFront alternate domain names for this environment"
  default     = []
}

variable "primary_domain" {
  type        = string
  description = "Canonical public hostname used for app_base_url (defaults to domain_names[0])"
  default     = null
}

variable "create_dns_records" {
  type        = bool
  description = "Create Route 53 A/AAAA aliases to CloudFront. Keep false for production until legacy GitHub Pages records are removed from infra/dns."
  default     = true
}

variable "seed_demo" {
  type        = bool
  description = "When true, seed demo phenomena on first boot if the catalog is empty"
  default     = false
}

variable "force_destroy" {
  type        = bool
  description = "Allow terraform destroy to delete non-empty versioned S3 buckets (staging teardown)"
  default     = false
}
