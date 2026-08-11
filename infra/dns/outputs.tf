output "zone_id" {
  value = aws_route53_zone.this.zone_id
}

output "zone_name" {
  value = aws_route53_zone.this.name
}

output "name_servers" {
  description = "Set these as the GoDaddy nameservers (registration stays at GoDaddy)"
  value       = aws_route53_zone.this.name_servers
}

output "acm_certificate_arn" {
  description = "Shared us-east-1 cert for CloudFront. Issued only after NS delegation (or wait_for_acm_validation=true)."
  value       = aws_acm_certificate.site.arn
}

output "acm_certificate_status" {
  value = aws_acm_certificate.site.status
}

output "legacy_github_pages" {
  value = var.legacy_github_pages
}
