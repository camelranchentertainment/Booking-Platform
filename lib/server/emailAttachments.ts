// lib/server/emailAttachments.ts
//
// Server-only: turns attachment references into file bytes for sending.
// Every reference is checked against the caller's act — a library id from
// another band, or an upload path outside this band's folder, is rejected.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import {
  EMAIL_UPLOAD_FOLDER,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type AttachmentRef,
} from '../emailAttachments';

export interface ResolvedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

const UPLOAD_BUCKET = 'band-documents';

/**
 * True when `path` is inside this act's email-attachment folder and contains
 * no traversal segments. Exported for tests.
 */
export function isOwnUploadPath(path: string, actId: string): boolean {
  if (!path || path.includes('\\')) return false;
  const parts = path.split('/');
  if (parts.some(p => p === '' || p === '.' || p === '..')) return false;
  return parts.length === 3 && parts[0] === actId && parts[1] === EMAIL_UPLOAD_FOLDER;
}

/** Strips characters that would break a MIME header or a file system. */
export function cleanFilename(name: string): string {
  const cleaned = name.replace(/[\r\n"\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 200) || 'attachment';
}

async function download(
  service: SupabaseClient,
  bucket: string,
  path: string,
): Promise<{ bytes: Buffer; type: string }> {
  const { data, error } = await service.storage.from(bucket).download(path);
  if (error || !data) {
    throw new AppError(400, 'One of the attachments could not be found. Remove it and attach it again.');
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  return { bytes, type: data.type || 'application/octet-stream' };
}

/**
 * Downloads and validates every attachment for an outgoing email.
 *
 * @param service  service-role client (bypasses storage RLS, so ownership is checked here)
 * @param actId    the caller's act, from their profile — never from the request
 * @param refs     validated attachment references
 * @throws AppError 400 for a foreign/missing file or when size limits are exceeded
 */
export async function resolveAttachments(
  service: SupabaseClient,
  actId: string,
  refs: AttachmentRef[],
): Promise<ResolvedAttachment[]> {
  const out: ResolvedAttachment[] = [];
  let total = 0;

  for (const ref of refs) {
    let bucket: string;
    let path: string;
    let mime: string | null = null;

    if (ref.source === 'library') {
      const { data: row } = await service
        .from('media_library')
        .select('storage_path, mime_type, document_category, act_id')
        .eq('id', ref.id)
        .eq('act_id', actId)
        .maybeSingle();
      if (!row?.storage_path) {
        throw new AppError(400, `"${cleanFilename(ref.name)}" is not in your band's files.`);
      }
      // Same routing rule as /api/media: documents live in band-documents, the rest in media-library.
      bucket = row.document_category ? 'band-documents' : 'media-library';
      path = row.storage_path as string;
      mime = (row.mime_type as string | null) ?? null;
    } else {
      if (!isOwnUploadPath(ref.path, actId)) {
        throw new AppError(400, `"${cleanFilename(ref.name)}" is not one of your uploads.`);
      }
      bucket = UPLOAD_BUCKET;
      path = ref.path;
    }

    const { bytes, type } = await download(service, bucket, path);
    if (bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new AppError(400, `"${cleanFilename(ref.name)}" is larger than 10 MB.`);
    }
    total += bytes.length;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new AppError(400, 'Attachments add up to more than 15 MB. Remove one and try again.');
    }

    out.push({
      filename: cleanFilename(ref.name),
      contentType: mime || type || 'application/octet-stream',
      content: bytes,
    });
  }

  return out;
}
