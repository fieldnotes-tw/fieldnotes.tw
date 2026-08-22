variable "email_domain" {
  type        = string
  description = "Domain used for SES From addresses (DKIM DNS required)"
  default     = "fieldnotes.tw"
}

variable "email_from_local_part" {
  type        = string
  description = "Local part of the From address (e.g. noreply)"
  default     = "noreply"
}

variable "ses_region" {
  type        = string
  description = "SES region (not available in ap-east-2; use Tokyo)"
  default     = "ap-northeast-1"
}

variable "manage_ses_identity" {
  type        = bool
  description = "Create the SES domain identity (only one env should own it per account/region)"
  default     = true
}

locals {
  email_from = "${var.email_from_local_part}@${var.email_domain}"
  # Only the owning env exposes DKIM tokens; others do not look up the identity
  # (a data source would block terraform destroy when the identity is missing).
  ses_dkim_tokens = var.manage_ses_identity ? try(aws_sesv2_email_identity.domain[0].dkim_signing_attributes[0].tokens, []) : []
}

resource "aws_sesv2_email_identity" "domain" {
  count    = var.manage_ses_identity ? 1 : 0
  provider = aws.ses

  email_identity = var.email_domain
}
