data "aws_caller_identity" "current" {}

locals {
  state_bucket_name = "${var.state_bucket_prefix}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "tf_locks" {
  name         = "fieldnotes-tw-tf-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# Account-wide GitHub OIDC provider (create once).
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC root CA thumbprint (documented by AWS/GitHub).
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

locals {
  # Jobs that set `environment:` use environment subjects, not branch refs.
  github_subs_staging = [
    "repo:${var.github_org}/${var.github_repo}:environment:staging",
    "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/development",
  ]
  github_subs_prod = [
    "repo:${var.github_org}/${var.github_repo}:environment:production",
    "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
  ]
  oidc_audiences = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "gha_trust_staging" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = local.oidc_audiences
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subs_staging
    }
  }
}

data "aws_iam_policy_document" "gha_trust_prod" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = local.oidc_audiences
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subs_prod
    }
  }
}

# Broad enough for first deploys + Terraform applies; tighten once the stack stabilizes.
data "aws_iam_policy_document" "gha_deploy" {
  statement {
    sid    = "DeployCore"
    effect = "Allow"
    actions = [
      "ec2:*",
      "ecr:*",
      "ecs:*",
      "elasticloadbalancing:*",
      "rds:*",
      "s3:*",
      "cloudfront:*",
      "logs:*",
      "ssm:*",
      "dynamodb:*",
      "secretsmanager:*",
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:CreateGrant",
      "iam:PassRole",
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:CreateInstanceProfile",
      "iam:DeleteInstanceProfile",
      "iam:AddRoleToInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile",
      "iam:GetInstanceProfile",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:TagInstanceProfile",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "gha_staging" {
  name               = "fieldnotes-gha-staging"
  assume_role_policy = data.aws_iam_policy_document.gha_trust_staging.json
}

resource "aws_iam_role" "gha_prod" {
  name               = "fieldnotes-gha-prod"
  assume_role_policy = data.aws_iam_policy_document.gha_trust_prod.json
}

resource "aws_iam_role_policy" "gha_staging" {
  name   = "fieldnotes-gha-staging"
  role   = aws_iam_role.gha_staging.id
  policy = data.aws_iam_policy_document.gha_deploy.json
}

resource "aws_iam_role_policy" "gha_prod" {
  name   = "fieldnotes-gha-prod"
  role   = aws_iam_role.gha_prod.id
  policy = data.aws_iam_policy_document.gha_deploy.json
}
