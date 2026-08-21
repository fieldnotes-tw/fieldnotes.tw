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
  description = "us-east-1 cert for CloudFront (currently staging.fieldnotes.tw only until apex NS cutover)."
  value       = aws_acm_certificate.site.arn
}

output "acm_certificate_status" {
  value = aws_acm_certificate.site.status
}

output "acm_validation_records" {
  description = "Copy these CNAMEs into GoDaddy for names that are not yet delegated to this zone (apex and www until full NS cutover)."
  value = {
    for name, record in aws_route53_record.acm_validation : name => {
      type  = record.type
      name  = record.name
      value = one(record.records)
    }
  }
}

output "legacy_github_pages" {
  value = var.legacy_github_pages
}
