#!/usr/bin/env bash
set -euo pipefail

REGION="${SES_REGION:-ap-northeast-1}"
WEBSITE_URL="${WEBSITE_URL:-https://fieldnotes.tw}"
CONTACT_EMAIL="${CONTACT_EMAIL:-admin@fieldnotes.tw}"

aws sesv2 put-account-details \
  --region "$REGION" \
  --mail-type TRANSACTIONAL \
  --website-url "$WEBSITE_URL" \
  --contact-language EN \
  --use-case-description "Transactional email for 最近高雄 (fieldnotes.tw): account confirmation, password reset, and moderation notices. Recipients opt in by registering; volume is low (community sighting platform)." \
  --additional-contact-email-addresses "$CONTACT_EMAIL" \
  --production-access-enabled

echo "Production access request submitted in $REGION. Check SES console → Account dashboard for status."
