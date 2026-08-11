# fieldnotes.tw infrastructure

Region: `ap-east-2` (Taipei)

| Branch | Environment |
|--------|-------------|
| `development` | staging |
| `main` | production |

Stack per environment: VPC (no NAT) · `t4g.micro` API EC2 · RDS Postgres `db.t4g.micro` · S3 + CloudFront (frontend + `/api/*` → EC2) · ECR · Secrets Manager (`…/database`, `…/app`) · SES domain identity for `noreply@fieldnotes.tw` in **ap-northeast-1** (SES is not available in Taipei).

Shared DNS lives in `infra/dns` (Route 53 hosted zone + us-east-1 ACM). Domain **registration** stays at GoDaddy; only nameservers move to Route 53.

Retrieve the staging admin password after apply:

```bash
aws secretsmanager get-secret-value --region ap-east-2 \
  --secret-id fieldnotes-staging/app --query SecretString --output text | jq -r '{admin_email,admin_password}'
```

### SES email

SES identities are created in `ap-northeast-1` (Tokyo). DKIM CNAMEs are managed in `infra/dns` from `ses_dkim_tokens` (staging output). Until the domain verifies (and while the account is in the SES sandbox), confirmation mail only delivers to SES-verified recipient addresses. Request production access when ready.

CI authenticates with **GitHub OIDC** (no long-lived access keys in the repo).

> Do not commit AWS account IDs, role ARNs, state bucket names, or `backend.hcl` / `*.tfvars` with real values. Use the `*.example` files and GitHub Environment variables instead.

## One-time bootstrap (local AWS creds)

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # github_org=fieldnotes-tw (gitignored)
aws sts get-caller-identity
terraform init
terraform apply
```

Re-apply bootstrap after IAM policy changes (for example when adding `route53:*` / `acm:*` to the deploy roles).

Outputs (local only — do not paste into the repo):

- `state_bucket`
- `gha_role_staging_arn`
- `gha_role_prod_arn`

## Apply environments

Deploy workflows run `terraform apply` on every push (`development` → staging, `main` → production), then build/push the API image and roll it out via SSM.

For a local apply (or the first bring-up before CI has run):

```bash
# After bootstrap, create backend config from the state_bucket output:
cp ../backend.hcl.example backend.hcl   # in dns/, staging/, and production/
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
| `USE_CUSTOM_DOMAIN` | `true` only after ACM is issued (see DNS cutover) |
| `CREATE_DNS_RECORDS` | production only: `true` after `legacy_github_pages=false` in `infra/dns` |

Optional: require reviewers on the **production** environment.

Branch flow: feature → `development` (staging deploy) → PR → `main` (production deploy).

## DNS cutover (GoDaddy → Route 53 nameservers)

Registration stays at GoDaddy. Goal hostnames:

| Name | Target |
|------|--------|
| `fieldnotes.tw` | production CloudFront |
| `www.fieldnotes.tw` | production CloudFront |
| `staging.fieldnotes.tw` | staging CloudFront |

### 1. Apply the shared DNS stack

```bash
cd infra/dns
cp ../backend.hcl.example backend.hcl   # same state bucket as staging/production
cp terraform.tfvars.example terraform.tfvars

# Pull DKIM tokens from staging (after staging has been applied at least once):
terraform -chdir=../staging output -json ses_dkim_tokens
# paste into terraform.tfvars as ses_dkim_tokens = ["...", "...", "..."]

terraform init -backend-config=backend.hcl
terraform apply
terraform output name_servers
```

This creates the hosted zone, ACM cert (pending validation), ACM DNS records, DMARC, SES DKIM, and **temporary GitHub Pages** apex/`www` records so the public site keeps working when nameservers flip.

### 2. Point GoDaddy nameservers at Route 53

At GoDaddy, replace `ns57/58.domaincontrol.com` with the four `name_servers` from the dns stack. Do **not** flip NS while the Route 53 zone is empty of the current GitHub Pages records.

### 3. Wait for ACM

```bash
# After NS have propagated:
cd infra/dns
# in terraform.tfvars:
#   wait_for_acm_validation = true
terraform apply
terraform output acm_certificate_status   # expect ISSUED
```

### 4. Attach custom domains to CloudFront

1. Staging: set GitHub Environment variable `USE_CUSTOM_DOMAIN=true` (or local `TF_VAR_use_custom_domain=true`) and redeploy / `terraform apply`. This adds `staging.fieldnotes.tw` aliases + Route 53 records and updates `app_base_url` / CORS.
2. Production: set `USE_CUSTOM_DOMAIN=true` first so CloudFront picks up `fieldnotes.tw` + `www` and the cert (DNS can still point at GitHub Pages).
3. Cut apex/`www` to CloudFront:
   - In `infra/dns` set `legacy_github_pages = false` and apply (removes GH Pages records).
   - Set production `CREATE_DNS_RECORDS=true` and apply (creates A/AAAA aliases to CloudFront).

### 5. Verify

- `https://staging.fieldnotes.tw`
- `https://fieldnotes.tw` and `https://www.fieldnotes.tw`
- SES identity DKIM verified in `ap-northeast-1`

After cutover, the root repo `CNAME` (GitHub Pages) and the old Pages project can be removed manually. Registrar transfer to Route 53 Domains is optional and out of scope.

**Important:** Do not enable production `CREATE_DNS_RECORDS` while `legacy_github_pages` is still true — both would compete for apex/`www`.

## Cost notes

- No NAT Gateway (RDS private; API EC2 public, reaches RDS in-VPC).
- Two environments ≈ two EC2 micros + two RDS micros + CloudFront/S3. RDS dominates spend.
- `terraform destroy` in `infra/staging` when idle if you want to save money.
