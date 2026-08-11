data "aws_ami" "al2023_arm" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    dnf update -y
    dnf install -y docker nginx jq awscli
    systemctl enable --now docker
    usermod -aG docker ec2-user

    cat >/etc/nginx/conf.d/api.conf <<'NGINX'
    server {
      listen 80 default_server;
      location /api/ {
        proxy_pass http://127.0.0.1:${var.api_container_port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
      }
      location / {
        return 404;
      }
    }
    NGINX
    rm -f /etc/nginx/conf.d/default.conf || true
    systemctl enable --now nginx

    cat >/usr/local/bin/fieldnotes-deploy.sh <<'SCRIPT'
    #!/bin/bash
    set -euo pipefail
    REGION="${var.aws_region}"
    REPO="${aws_ecr_repository.api.repository_url}"
    DB_SECRET_ID="${local.name_prefix}/database"
    APP_SECRET_ID="${local.name_prefix}/app"
    IMAGE_TAG="$${1:-latest}"

    aws ecr get-login-password --region "$REGION" \
      | docker login --username AWS --password-stdin "$${REPO%%/*}"

    DB_JSON=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$DB_SECRET_ID" --query SecretString --output text)
    APP_JSON=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$APP_SECRET_ID" --query SecretString --output text)

    DATABASE_URL=$(echo "$DB_JSON" | jq -r .database_url)
    JWT_SECRET=$(echo "$APP_JSON" | jq -r .jwt_secret)
    COOKIE_SECURE=$(echo "$APP_JSON" | jq -r .cookie_secure)
    CORS_ORIGINS=$(echo "$APP_JSON" | jq -r .cors_origins)
    ADMIN_EMAIL=$(echo "$APP_JSON" | jq -r .admin_email)
    ADMIN_PASSWORD=$(echo "$APP_JSON" | jq -r .admin_password)
    EMAIL_FROM=$(echo "$APP_JSON" | jq -r .email_from)
    APP_BASE_URL=$(echo "$APP_JSON" | jq -r .app_base_url)
    MAIL_MODE=$(echo "$APP_JSON" | jq -r .mail_mode)
    SES_REGION=$(echo "$APP_JSON" | jq -r .ses_region)
    MEDIA_BUCKET=$(echo "$APP_JSON" | jq -r .media_bucket)
    MEDIA_PUBLIC_PREFIX=$(echo "$APP_JSON" | jq -r .media_public_prefix)

    docker pull "$REPO:$IMAGE_TAG"
    docker rm -f fieldnotes-api || true
    docker run -d --name fieldnotes-api --restart unless-stopped \
      -p ${var.api_container_port}:${var.api_container_port} \
      -e PORT=${var.api_container_port} \
      -e AWS_REGION="$REGION" \
      -e AWS_DEFAULT_REGION="$REGION" \
      -e SES_REGION="$SES_REGION" \
      -e DATABASE_URL="$DATABASE_URL" \
      -e JWT_SECRET="$JWT_SECRET" \
      -e COOKIE_SECURE="$COOKIE_SECURE" \
      -e CORS_ORIGINS="$CORS_ORIGINS" \
      -e ADMIN_EMAIL="$ADMIN_EMAIL" \
      -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      -e EMAIL_FROM="$EMAIL_FROM" \
      -e APP_BASE_URL="$APP_BASE_URL" \
      -e MAIL_MODE="$MAIL_MODE" \
      -e MEDIA_BUCKET="$MEDIA_BUCKET" \
      -e MEDIA_PUBLIC_PREFIX="$MEDIA_PUBLIC_PREFIX" \
      "$REPO:$IMAGE_TAG"
    SCRIPT
    chmod +x /usr/local/bin/fieldnotes-deploy.sh
  EOT
}

resource "aws_instance" "api" {
  ami                         = data.aws_ami.al2023_arm.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.api.id]
  iam_instance_profile        = aws_iam_instance_profile.api.name
  user_data                   = local.user_data
  user_data_replace_on_change = true

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  tags = {
    Name = "${local.name_prefix}-api"
  }
}

resource "aws_eip" "api" {
  domain   = "vpc"
  instance = aws_instance.api.id

  tags = {
    Name = "${local.name_prefix}-api"
  }
}
