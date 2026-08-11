# fieldnotes.tw infrastructure

Region: `ap-east-2` (Taipei)

| Branch | Environment |
|--------|-------------|
| `development` | staging |
| `main` | production |

Stack per environment: VPC (no NAT) · `t4g.micro` API EC2 · RDS Postgres `db.t4g.micro` · S3 + CloudFront (frontend + `/api/*` → EC2) · ECR.

CI authenticates with **GitHub OIDC** (no long-lived access keys in the repo).

> Do not commit AWS account IDs, role ARNs, state bucket names, or `backend.hcl` / `*.tfvars` with real values. Use the `*.example` files and GitHub Environment variables instead.

## One-time bootstrap (local AWS creds)

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # set github_org (gitignored)
aws sts get-caller-identity
terraform init
terraform apply
```

Outputs (local only — do not paste into the repo):

- `state_bucket`
- `gha_role_staging_arn`
- `gha_role_prod_arn`

## Apply environments

```bash
# After bootstrap, create backend config from the state_bucket output:
cp ../backend.hcl.example backend.hcl   # in staging/ and production/
# edit bucket = "..."

cd infra/staging
terraform init -backend-config=backend.hcl
terraform apply

cd infra/production
terraform init -backend-config=backend.hcl
terraform apply
```

## GitHub configuration (not in git)

Create Environments **staging** and **production**. On each environment, set variables:

| Variable | Value |
|----------|--------|
| `AWS_ROLE_ARN` | Deploy role ARN for that environment (from bootstrap output) |
| `TF_STATE_BUCKET` | State bucket name (from bootstrap output) |

Optional: require reviewers on the **production** environment.

Branch flow: feature → `development` (staging deploy) → PR → `main` (production deploy).

## DNS (later)

CloudFront uses the default `*.cloudfront.net` certificate until Route 53 + ACM are added.

## Cost notes

- No NAT Gateway (RDS private; API EC2 public, reaches RDS in-VPC).
- Two environments ≈ two EC2 micros + two RDS micros + CloudFront/S3. RDS dominates spend.
- `terraform destroy` in `infra/staging` when idle if you want to save money.
