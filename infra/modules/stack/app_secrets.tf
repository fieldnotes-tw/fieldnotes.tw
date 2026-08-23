resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "admin" {
  length  = 24
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name_prefix}/app"
  # Staging uses force_destroy; skip the 30-day recovery window so recreate can reuse names.
  recovery_window_in_days = var.force_destroy ? 0 : 30
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    jwt_secret          = random_password.jwt.result
    cookie_secure       = "1"
    cors_origins        = join(",", local.app_public_origins)
    admin_email         = var.admin_email
    admin_password      = random_password.admin.result
    email_from          = local.email_from
    app_base_url        = "https://${local.app_public_host}"
    mail_mode           = "ses"
    ses_region          = var.ses_region
    media_bucket        = aws_s3_bucket.media.bucket
    media_public_prefix = "/media"
    seed_demo           = var.seed_demo ? "1" : "0"
    line_channel_id     = var.line_channel_id
    line_channel_secret = var.line_channel_secret
  })
}
