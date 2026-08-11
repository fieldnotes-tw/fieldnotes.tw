import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

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
  return `${appBaseUrl()}/confirm.html?token=${encodeURIComponent(token)}`;
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

export async function sendConfirmEmail(to: string, token: string) {
  const link = confirmUrl(token);
  const subject = '確認你的 最近左營 帳號';
  const text = `請開啟以下連結以確認信箱（24 小時內有效）：\n\n${link}\n`;
  const html = `<p>請開啟以下連結以確認信箱（24 小時內有效）：</p><p><a href="${link}">${link}</a></p>`;

  // Always log so operators can recover the link if SES is pending verification.
  console.log(`[mail] to=${to} confirm=${link}`);

  const mode = (process.env.MAIL_MODE ?? 'log').toLowerCase();
  if (mode === 'log') {
    return;
  }

  if (mode !== 'ses') {
    throw new Error(`Unsupported MAIL_MODE: ${mode}`);
  }

  await sendViaSes(to, subject, text, html);
}
