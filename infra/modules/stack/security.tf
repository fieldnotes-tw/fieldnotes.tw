resource "aws_security_group" "api" {
  name        = "${local.name_prefix}-api"
  description = "API host"
  vpc_id      = aws_vpc.this.id

  # CloudFront will hit the API origin over HTTP until custom certs/DNS exist.
  ingress {
    description = "HTTP from internet (CloudFront origin)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Direct API port (debug / early deploy)"
    from_port   = var.api_container_port
    to_port     = var.api_container_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-api"
  }
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db"
  description = "Postgres from API host only"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Postgres from API"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-db"
  }
}
