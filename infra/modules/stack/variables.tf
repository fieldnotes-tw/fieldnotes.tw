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
