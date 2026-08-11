locals {
  custom_domain_enabled = var.hosted_zone_id != null && var.acm_certificate_arn != null && length(var.domain_names) > 0
  primary_domain = (
    var.primary_domain != null
    ? var.primary_domain
    : (length(var.domain_names) > 0 ? var.domain_names[0] : null)
  )
  app_public_host = local.custom_domain_enabled ? local.primary_domain : aws_cloudfront_distribution.this.domain_name
  app_public_origins = distinct(concat(
    ["https://${local.app_public_host}"],
    local.custom_domain_enabled ? ["https://${aws_cloudfront_distribution.this.domain_name}"] : [],
    [for name in var.domain_names : "https://${name}"],
    var.extra_cors_origins,
  ))
}

resource "aws_route53_record" "app_a" {
  for_each = local.custom_domain_enabled && var.create_dns_records ? toset(var.domain_names) : toset([])

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_aaaa" {
  for_each = local.custom_domain_enabled && var.create_dns_records ? toset(var.domain_names) : toset([])

  zone_id = var.hosted_zone_id
  name    = each.value
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
