import { createMiddleware } from 'hono/factory';
import { readSessionUser, type SessionUser } from '../lib/auth.js';

export type AuthEnv = {
  Variables: {
    user: SessionUser;
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await readSessionUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('user', user);
  await next();
});

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = await readSessionUser(c);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  c.set('user', user);
  await next();
});
