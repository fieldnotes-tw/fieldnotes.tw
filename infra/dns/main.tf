resource "aws_route53_zone" "this" {
  name = var.domain_name

  tags = {
    Name = var.domain_name
  }
}

resource "aws_acm_certificate" "site" {
  provider = aws.acm

  domain_name               = var.acm_domain_name
  subject_alternative_names = var.certificate_sans
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  zone_id         = aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

resource "aws_acm_certificate_validation" "site" {
  count    = var.wait_for_acm_validation ? 1 : 0
  provider = aws.acm

  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.acm_validation : record.fqdn]
}

resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.this.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=${var.dmarc_rua}"]
}

resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.this.zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = 300
  records = [
    "0 issue \"amazon.com\"",
    "0 issuewild \"amazon.com\"",
  ]
}

resource "aws_route53_record" "ses_dkim" {
  for_each = toset(var.ses_dkim_tokens)

  zone_id = aws_route53_zone.this.zone_id
  name    = "${each.value}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = ["${each.value}.dkim.amazonses.com"]
}

# Preserve the public GitHub Pages site across the NS flip. Remove (legacy_github_pages=false)
# before production applies Route 53 aliases to CloudFront.
resource "aws_route53_record" "apex_github_pages" {
  count = var.legacy_github_pages ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = var.github_pages_ipv4
}

resource "aws_route53_record" "www_github_pages" {
  count = var.legacy_github_pages ? 1 : 0

  zone_id = aws_route53_zone.this.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = var.github_pages_ipv4
}

# Full CloudFront cert (apex + www + staging). Kept separate from the staging-only
# cert already attached to staging CloudFront so we can issue this after the NS
# flip without deleting the in-use certificate.
resource "aws_acm_certificate" "cdn" {
  provider = aws.acm

  domain_name = var.domain_name
  subject_alternative_names = [
    "www.${var.domain_name}",
    "staging.${var.domain_name}",
  ]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cdn_acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  zone_id         = aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

resource "aws_acm_certificate_validation" "cdn" {
  count    = var.wait_for_acm_validation ? 1 : 0
  provider = aws.acm

  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for record in aws_route53_record.cdn_acm_validation : record.fqdn]
}
