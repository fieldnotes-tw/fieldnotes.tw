variable "domain_name" {
  type        = string
  description = "Apex domain hosted in this zone"
  default     = "fieldnotes.tw"
}

variable "certificate_sans" {
  type        = list(string)
  description = "Additional names on the shared ACM certificate (besides the apex)"
  default = [
    "www.fieldnotes.tw",
    "staging.fieldnotes.tw",
  ]
}

variable "dmarc_rua" {
  type        = string
  description = "DMARC aggregate report mailbox (existing GoDaddy posture)"
  default     = "mailto:dmarc_rua@onsecureserver.net"
}

variable "ses_dkim_tokens" {
  type        = list(string)
  description = "SES DKIM tokens for the apex domain (from staging output ses_dkim_tokens). Empty skips DKIM records."
  default     = []
}

variable "legacy_github_pages" {
  type        = bool
  description = "Keep apex/www pointing at GitHub Pages until CloudFront cutover. Set false before production creates Route 53 aliases."
  default     = true
}

variable "github_pages_ipv4" {
  type        = list(string)
  description = "GitHub Pages A records for the apex (used while legacy_github_pages is true)"
  default = [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ]
}

variable "github_pages_cname" {
  type        = string
  description = "GitHub Pages target for www (used while legacy_github_pages is true)"
  default     = "chao0312.github.io"
}

variable "wait_for_acm_validation" {
  type        = bool
  description = "Block apply until ACM issues (only after nameservers point at this zone)"
  default     = false
}
