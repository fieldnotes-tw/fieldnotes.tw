import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import 'dotenv/config';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { health } from './routes/health.js';
import { phenomenaRoutes } from './routes/phenomena.js';

const app = new Hono();

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
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

app.route('/api/health', health);
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/phenomena', phenomenaRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://127.0.0.1:${info.port}`);
});
