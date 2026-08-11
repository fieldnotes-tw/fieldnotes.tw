import { isDev } from './lib/env.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { publicRoot } from './lib/assets.js';
import { localeOf, t } from './lib/i18n.js';
import { withLocale, type LocaleEnv } from './middleware/locale.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { health } from './routes/health.js';
import { pageRoutes } from './routes/pages.js';
import { phenomenaRoutes } from './routes/phenomena.js';

export function createApp() {
  const app = new Hono<LocaleEnv>();

  const corsOrigins = (
    process.env.CORS_ORIGINS ?? 'http://localhost:3001,http://127.0.0.1:3001'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use('*', logger());
  app.use(
    '*',
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use('*', withLocale);

  const staticRoot = publicRoot();
  const dev = isDev();

  async function longCache(
    c: { res: Response; header: (k: string, v: string) => void },
    next: () => Promise<void>,
  ) {
    await next();
    if (c.res.status === 200) {
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }

  // In dev, Vite serves /client/* and CSS; skip hashed /assets.
  if (!dev) {
    app.use('/assets/*', longCache);
    app.use('/assets/*', serveStatic({ root: staticRoot }));
  }

  app.use('/js/*', serveStatic({ root: staticRoot }));
  app.use('/fonts/*', longCache);
  app.use('/fonts/*', serveStatic({ root: staticRoot }));
  app.use('/locales/*', serveStatic({ root: staticRoot }));
  // Local/dev seed + upload photos (staging/prod serve /media/* from S3 via CloudFront).
  app.use('/media/*', serveStatic({ root: staticRoot }));
  app.use('/images/*', serveStatic({ root: staticRoot }));

  app.route('/api/health', health);
  app.route('/api/auth', authRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/phenomena', phenomenaRoutes);
  app.route('/', pageRoutes);

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: t(localeOf(c), 'errors.notFound') }, 404);
    }
    return c.text('Not found', 404);
  });

  app.onError((err, c) => {
    console.error(err);
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: t(localeOf(c), 'errors.internal') }, 500);
    }
    return c.text('Internal server error', 500);
  });

  return app;
}
