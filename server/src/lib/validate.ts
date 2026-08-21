import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodIssue, ZodType } from 'zod';
import { localeOf, t } from './i18n.js';

const FIELD_LABEL_KEYS: Record<string, string> = {
  title: 'validation.field.title',
  description: 'validation.field.description',
  extra: 'validation.field.extra',
  findingHint: 'validation.field.findingHint',
  status: 'validation.field.status',
  category: 'validation.field.category',
  location: 'validation.field.location',
  lat: 'validation.field.location',
  lng: 'validation.field.location',
  seenAt: 'validation.field.seenAt',
  note: 'validation.field.note',
  contentType: 'validation.field.contentType',
  displayName: 'validation.field.displayName',
  bio: 'validation.field.bio',
  avatarUrl: 'validation.field.avatarUrl',
  imageUrls: 'validation.field.imageUrls',
};

function fieldLabel(locale: ReturnType<typeof localeOf>, path: (string | number)[]): string {
  const key = String(path[0] ?? '');
  const labelKey = FIELD_LABEL_KEYS[key];
  return labelKey ? t(locale, labelKey) : key;
}

function validationMessage(locale: ReturnType<typeof localeOf>, issue: ZodIssue): string {
  const field = fieldLabel(locale, issue.path);

  if (typeof issue.message === 'string' && issue.message.startsWith('errors.')) {
    return t(locale, issue.message, { field });
  }

  if (issue.code === 'too_small') {
    if (issue.type === 'string' && issue.minimum === 1) {
      return t(locale, 'errors.fieldRequired', { field });
    }
    if (issue.type === 'array') {
      return t(locale, 'errors.fieldRequired', { field });
    }
  }

  if (issue.code === 'invalid_type') {
    if (issue.received === 'undefined' || issue.received === 'null') {
      return t(locale, 'errors.fieldRequired', { field });
    }
  }

  if (issue.code === 'invalid_enum_value' || issue.code === 'invalid_date') {
    return t(locale, 'errors.fieldInvalid', { field });
  }

  if (issue.code === 'custom') {
    return t(locale, 'errors.fieldInvalid', { field });
  }

  return t(locale, 'errors.fieldInvalid', { field });
}

/** Zod validator that returns translated field-level validation errors. */
export function validated<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const locale = localeOf(c);
      const messages = [...new Set(result.error.issues.map((issue) => validationMessage(locale, issue)))];
      return c.json({ error: messages.join(' ') }, 400);
    }
  });
}
