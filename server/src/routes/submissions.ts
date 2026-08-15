import { Hono } from 'hono';
import { z } from 'zod';
import { localeOf, t } from '../lib/i18n.js';
import {
  createUploadUrl,
  isAllowedContentType,
  isSafeMediaFilename,
  mediaBackend,
  saveLocalUpload,
} from '../lib/media.js';
import { validated } from '../lib/validate.js';
import { requireAuth, type AuthEnv } from '../middleware/auth.js';

export const submissionRoutes = new Hono<AuthEnv>();

submissionRoutes.use('*', requireAuth);

const uploadSchema = z.object({
  contentType: z.string().trim().min(1),
});

submissionRoutes.post('/uploads', validated('json', uploadSchema), async (c) => {
  const locale = localeOf(c);
  const { contentType } = c.req.valid('json');
  if (!isAllowedContentType(contentType)) {
    return c.json({ error: t(locale, 'errors.unsupportedContentType') }, 400);
  }

  try {
    const upload = await createUploadUrl(contentType, {
      localUploadBase: '/api/submissions/uploads/local',
    });
    return c.json({ data: upload }, 201);
  } catch (err) {
    console.error('Failed to create submission upload URL', err);
    return c.json({ error: t(locale, 'errors.uploadUrlFailed') }, 500);
  }
});

submissionRoutes.put('/uploads/local/:filename', async (c) => {
  const locale = localeOf(c);
  if (mediaBackend() !== 'local') {
    return c.json({ error: t(locale, 'errors.mediaNotConfigured') }, 501);
  }

  const filename = c.req.param('filename');
  if (!isSafeMediaFilename(filename)) {
    return c.json({ error: t(locale, 'errors.invalidRequest') }, 400);
  }

  const contentType = c.req.header('content-type') || '';
  if (!isAllowedContentType(contentType)) {
    return c.json({ error: t(locale, 'errors.unsupportedContentType') }, 400);
  }

  try {
    const body = await c.req.arrayBuffer();
    if (!body.byteLength) {
      return c.json({ error: t(locale, 'errors.invalidRequest') }, 400);
    }
    const publicPath = await saveLocalUpload(filename, body, contentType);
    return c.json({ data: { publicPath } }, 201);
  } catch (err) {
    console.error('Submission local media upload failed', err);
    return c.json({ error: t(locale, 'errors.uploadUrlFailed') }, 500);
  }
});
