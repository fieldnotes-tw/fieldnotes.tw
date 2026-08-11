variable "aws_region" {
  type        = string
  description = "Region for the Terraform state bucket"
  default     = "ap-east-2"
}

variable "github_org" {
  type        = string
  description = "GitHub org or user that owns the repo"
}

variable "github_repo" {
  type        = string
  description = "Repository name"
  default     = "fieldnotes.tw"
}

variable "state_bucket_prefix" {
  type        = string
  description = "Prefix for the state bucket; account ID is appended at apply time"
  default     = "fieldnotes-tw-tfstate"
}
