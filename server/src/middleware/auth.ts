import { createMiddleware } from 'hono/factory';
import { readSessionUser, type SessionUser } from '../lib/auth.js';
import { localeOf, t, type Locale } from '../lib/i18n.js';

export type AuthEnv = {
  Variables: {
    user: SessionUser;
    locale: Locale;
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await readSessionUser(c);
  if (!user) {
    return c.json({ error: t(localeOf(c), 'errors.unauthorized') }, 401);
  }
  c.set('user', user);
  await next();
});

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await readSessionUser(c);
  if (!user) {
    return c.json({ error: t(localeOf(c), 'errors.unauthorized') }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: t(localeOf(c), 'errors.forbidden') }, 403);
  }
  c.set('user', user);
  await next();
});
