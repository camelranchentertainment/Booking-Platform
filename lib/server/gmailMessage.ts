// lib/server/gmailMessage.ts
//
// Reads the parts of a Gmail API message that the inbox sync and the agent's
// Gmail lookup both need.

function decodeBase64Url(data?: string | null): string {
  if (!data) return '';

  try {
    const normalized = data
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> = [],
  name: string,
): string {
  return (
    headers.find(
      header => header.name?.toLowerCase() === name.toLowerCase(),
    )?.value || ''
  );
}

export function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);

  return (match?.[1] || value)
    .trim()
    .toLowerCase();
}

export function extractMessageBody(payload: any): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload.parts || [];

  // Prefer plain text
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  // Fall back to HTML
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  // Handle nested multipart messages
  for (const part of parts) {
    const nested = extractMessageBody(part);
    if (nested) return nested;
  }

  return '';
}
