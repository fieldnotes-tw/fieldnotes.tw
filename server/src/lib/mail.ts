import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DEFAULT_LOCALE, t, type Locale } from './i18n.js';

function appBaseUrl() {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, '');
  if (!base) {
    throw new Error('APP_BASE_URL is required');
  }
  return base;
}

function emailFrom() {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('EMAIL_FROM is required');
  }
  return from;
}

export function confirmUrl(token: string) {
  return `${appBaseUrl()}/confirm?token=${encodeURIComponent(token)}`;
}

export function resetPasswordUrl(token: string) {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendViaSes(to: string, subject: string, text: string, html: string) {
  const client = new SESv2Client({
    // SES is not available in ap-east-2; staging/prod send via Tokyo by default.
    region: process.env.SES_REGION || process.env.AWS_REGION || 'ap-northeast-1',
  });

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: emailFrom(),
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: text, Charset: 'UTF-8' },
            Html: { Data: html, Charset: 'UTF-8' },
          },
        },
      },
    }),
  );
}

export async function sendConfirmEmail(
  to: string,
  token: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const link = confirmUrl(token);
  const subject = t(locale, 'mail.confirm.subject');
  const text = t(locale, 'mail.confirm.body', { link });
  const html = t(locale, 'mail.confirm.html', { link });

  // Always log so operators can recover the link if SES is pending verification.
  console.log(`[mail] to=${to} locale=${locale} confirm=${link}`);

  const mode = (process.env.MAIL_MODE ?? 'log').toLowerCase();
  if (mode === 'log') {
    return;
  }

  if (mode !== 'ses') {
    throw new Error(`Unsupported MAIL_MODE: ${mode}`);
  }

  await sendViaSes(to, subject, text, html);
}

export async function sendResetPasswordEmail(
  to: string,
  token: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const link = resetPasswordUrl(token);
  const subject = t(locale, 'mail.reset.subject');
  const text = t(locale, 'mail.reset.body', { link });
  const html = t(locale, 'mail.reset.html', { link });

  console.log(`[mail] to=${to} locale=${locale} reset=${link}`);

  const mode = (process.env.MAIL_MODE ?? 'log').toLowerCase();
  if (mode === 'log') {
    return;
  }

  if (mode !== 'ses') {
    throw new Error(`Unsupported MAIL_MODE: ${mode}`);
  }

  await sendViaSes(to, subject, text, html);
}
