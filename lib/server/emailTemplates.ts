// lib/server/emailTemplates.ts
//
// One place that saves a band's email template, used by both the Email page
// (/api/email/templates) and the agent's approval cards
// (/api/help/actions/execute → email_template_upsert). Titles are unique per
// band, case-insensitively (matches the DB index on act_id, lower(name)).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../apiError';

export const TEMPLATE_COLS = 'id, name, subject, body, updated_at';

export const templateSaveSchema = z.object({
  name: z.string().trim().min(1, 'Give the template a title').max(120, 'Keep the title under 120 characters'),
  subject: z.string().trim().max(300, 'Keep the subject under 300 characters').default(''),
  body: z.string().trim().min(1, 'The template is empty').max(50_000, 'The template is too long'),
});
export type TemplateInput = z.infer<typeof templateSaveSchema>;

export interface SavedTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  updated_at: string;
}

/** Thrown when a title is already used by another of the band's templates. */
export class TemplateExistsError extends AppError {
  readonly code = 'EXISTS' as const;
  constructor(name: string) {
    super(409, `A template called "${name}" already exists.`);
    this.name = 'TemplateExistsError';
    Object.setPrototypeOf(this, TemplateExistsError.prototype);
  }
}

/** Escapes LIKE wildcards so a title is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, m => `\\${m}`);
}

/**
 * Finds the band's template with this title (case-insensitive), or null.
 *
 * @throws AppError 500 when the lookup fails
 */
export async function findTemplateByName(
  service: SupabaseClient,
  actId: string,
  name: string,
): Promise<{ id: string } | null> {
  const { data, error } = await service
    .from('email_templates')
    .select('id')
    .eq('act_id', actId)
    .ilike('name', escapeLike(name.trim()))
    .maybeSingle();
  if (error) throw new AppError(500, 'Could not check existing templates');
  return (data as { id: string } | null) ?? null;
}

/**
 * Creates the template, or replaces the one with the same title when
 * `overwrite` is true.
 *
 * @param service service-role client (act filter is the only scoping)
 * @param actId   the caller's band, from their profile
 * @param userId  the caller (recorded as the creator on insert)
 * @throws TemplateExistsError (409) when the title is taken and overwrite is false
 * @throws AppError 500 when the write fails
 */
export async function saveTemplate(
  service: SupabaseClient,
  actId: string,
  userId: string,
  input: TemplateInput,
  opts: { overwrite?: boolean } = {},
): Promise<{ template: SavedTemplate; replaced: boolean }> {
  const { name, subject, body } = input;
  const now = new Date().toISOString();
  const existing = await findTemplateByName(service, actId, name);

  if (existing && !opts.overwrite) {
    throw new TemplateExistsError(name);
  }

  if (existing) {
    const { data, error } = await service
      .from('email_templates')
      .update({ name, subject, body, updated_at: now })
      .eq('id', existing.id)
      .eq('act_id', actId)
      .select(TEMPLATE_COLS)
      .single();
    if (error) throw new AppError(500, 'Could not save the template');
    return { template: data as SavedTemplate, replaced: true };
  }

  const { data, error } = await service
    .from('email_templates')
    .insert({ act_id: actId, user_id: userId, name, subject, body, created_at: now, updated_at: now })
    .select(TEMPLATE_COLS)
    .single();
  if (error) throw new AppError(500, 'Could not save the template');
  return { template: data as SavedTemplate, replaced: false };
}
