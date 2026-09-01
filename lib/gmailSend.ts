import { getGmailClient } from './gmailClient';

export async function sendViaGmail(
  actId: string,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  if (!actId || !to || !subject || !body) {
    throw new Error('actId, to, subject, and body are all required');
  }

  const { gmail, gmailAddress } = await getGmailClient(actId);

  const messageParts = [
    `From: ${gmailAddress}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ];

  const raw = Buffer.from(messageParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}