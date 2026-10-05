// lib/emailAttachments.ts
//
// Shared (client + server) shape and limits for email attachments.
// Files live in Supabase Storage; emails carry references, and the server
// downloads and attaches them at send time. The browser never sends file
// bytes through the API (Vercel caps request bodies at 4.5 MB).

import { z } from 'zod';

/** Per-file cap. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/**
 * Total cap across all attachments. Gmail rejects messages over 25 MB *after*
 * base64 encoding (+33%), so raw attachments must stay well under ~18 MB.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Storage folder (inside the private band-documents bucket) for files picked from a computer. */
export const EMAIL_UPLOAD_FOLDER = 'email-attachments';

export const attachmentRefSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('library'),
    /** media_library.id — band documents and photos. */
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    size: z.number().int().nonnegative().optional(),
    mime: z.string().max(255).optional(),
  }),
  z.object({
    source: z.literal('upload'),
    /** Path inside the band-documents bucket: <act_id>/email-attachments/<uuid>-<name> */
    path: z.string().min(1).max(512),
    name: z.string().min(1).max(255),
    size: z.number().int().nonnegative().optional(),
    mime: z.string().max(255).optional(),
  }),
]);

export const attachmentListSchema = z.array(attachmentRefSchema).max(MAX_ATTACHMENTS);

export type AttachmentRef = z.infer<typeof attachmentRefSchema>;

/** Human-readable size, e.g. "1.4 MB". */
export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Storage-safe file name: keeps letters, digits, dot, dash, underscore.
 * The original name is kept separately for display and the email itself.
 */
export function safeStorageName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');
  return cleaned.slice(-120) || 'file';
}
