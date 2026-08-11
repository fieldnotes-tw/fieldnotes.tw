resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "admin" {
  length  = 24
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name = "${local.name_prefix}/app"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    jwt_secret     = random_password.jwt.result
    cookie_secure  = "1"
    cors_origins   = join(",", concat(["https://${aws_cloudfront_distribution.this.domain_name}"], var.extra_cors_origins))
    admin_email    = var.admin_email
    admin_password = random_password.admin.result
    email_from     = local.email_from
    app_base_url   = "https://${aws_cloudfront_distribution.this.domain_name}"
    mail_mode      = "ses"
    ses_region     = var.ses_region
  })
}
