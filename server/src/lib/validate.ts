import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { localeOf, t } from './i18n.js';

/** Zod validator that returns a translated generic invalid-request error. */
export function validated<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: t(localeOf(c), 'errors.invalidRequest') }, 400);
    }
  });
}
