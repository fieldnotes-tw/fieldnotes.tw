# fieldnotes.tw infrastructure

Region: `ap-east-2` (Taipei)

| Branch | Environment |
|--------|-------------|
| `development` | staging |
| `production` | production |

Stack per environment: VPC (no NAT) · `t4g.micro` API EC2 · RDS Postgres `db.t4g.micro` · S3 media + CloudFront (`/media/*` → S3; pages + `/api/*` → EC2) · ECR · Secrets Manager (`…/database`, `…/app`) · SES domain identity for `noreply@fieldnotes.tw` in **ap-northeast-1** (SES is not available in Taipei).

Shared DNS lives in `infra/dns` (Route 53 hosted zone + us-east-1 ACM). Domain **registration** stays at GoDaddy; only nameservers move to Route 53.

Retrieve the staging admin password after apply:

```bash
aws secretsmanager get-secret-value --region ap-east-2 \
  --secret-id fieldnotes-staging/app --query SecretString --output text | jq -r '{admin_email,admin_password}'
```

### SES email

SES identities are created in `ap-northeast-1` (Tokyo). **Production** owns the domain identity (`manage_ses_identity = true`); staging only looks it up so it can be destroyed without breaking mail. DKIM CNAMEs are managed in `infra/dns` from `ses_dkim_tokens` (production output). Until the domain verifies (and while the account is in the SES sandbox), confirmation mail only delivers to SES-verified recipient addresses. Request production access when ready.

**SES ownership cutover** (one-time, if staging still owns the identity): deploy production first so it creates/adopts the identity, then deploy staging with `manage_ses_identity = false`. Only after that is it safe to destroy staging.

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

Deploy workflows run `terraform apply` on every push (`development` → staging, `production` → production), then build/push the API image and roll it out via SSM.

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

Branch flow: feature → `development` (staging deploy) → PR → `production` (production deploy).

## DNS cutover (GoDaddy → Route 53 nameservers)

Registration stays at GoDaddy. Goal hostnames:

| Name | Target |
|------|--------|
| `fieldnotes.tw` | production CloudFront |
| `www.fieldnotes.tw` | production CloudFront |
| `staging.fieldnotes.tw` | staging CloudFront |

### 1. Apply the shared DNS stack

GitHub Actions → **Deploy DNS** → Run workflow (uses the **staging** environment). First run: leave `wait_for_acm_validation` off. The job summary prints Route 53 nameservers and ACM validation CNAMEs. SES DKIM tokens are read from production state.

This creates the hosted zone, ACM cert (pending validation), ACM DNS records, DMARC, SES DKIM, and **temporary GitHub Pages** apex/`www` records so the public site keeps working when nameservers flip.

### 2. Delegate staging (keep apex on GoDaddy)

Do **not** replace `ns57/58.domaincontrol.com` yet.

At GoDaddy DNS, add four **NS** records, host `staging`, values = the four `name_servers` from the job summary. Also add the ACM validation CNAMEs for `fieldnotes.tw` and `www.fieldnotes.tw` (those names are still served by GoDaddy).

Full-domain NS cutover is later: replace GoDaddy nameservers with the same four Route 53 nameservers only after the zone already has the GitHub Pages apex/`www` records (default `legacy_github_pages = true`).

### 3. Wait for ACM

After the GoDaddy records have propagated, re-run **Deploy DNS** with `wait_for_acm_validation` enabled. Job summary ACM status should be `ISSUED`.

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
- Tear down idle staging from GitHub Actions: **Actions → Deploy staging → Run workflow**, set `action=destroy` and `confirm=destroy-staging`. Recreate with a push to `development`, or Run workflow with `action=deploy`. Do this only after the SES ownership cutover above (production owns the identity). Staging S3 uses `force_destroy`; Secrets Manager secrets use a 0-day recovery window so names are reusable immediately. The destroy job also empties versioned objects first so leftover buckets cannot block teardown.
