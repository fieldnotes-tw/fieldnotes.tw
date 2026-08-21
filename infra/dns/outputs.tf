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
  description = "Cert attached to CloudFront. Staging-only until cdn cert is ISSUED and stacks are switched."
  value       = aws_acm_certificate.site.arn
}

output "acm_certificate_status" {
  value = aws_acm_certificate.site.status
}

output "cdn_acm_certificate_arn" {
  description = "Apex+www+staging cert. Switch stacks to this ARN after it is ISSUED (after GoDaddy NS cutover)."
  value       = aws_acm_certificate.cdn.arn
}

output "cdn_acm_certificate_status" {
  value = aws_acm_certificate.cdn.status
}

output "acm_validation_records" {
  description = "ACM CNAMEs in this zone (become public after nameservers point here)."
  value = merge(
    {
      for name, record in aws_route53_record.acm_validation : name => {
        type  = record.type
        name  = record.name
        value = one(record.records)
      }
    },
    {
      for name, record in aws_route53_record.cdn_acm_validation : "cdn:${name}" => {
        type  = record.type
        name  = record.name
        value = one(record.records)
      }
    },
  )
}

output "legacy_github_pages" {
  value = var.legacy_github_pages
}
