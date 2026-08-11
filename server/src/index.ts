import { isDev, repoRoot, serverRoot } from './lib/env.js';
import { getRequestListener } from '@hono/node-server';
import { serve } from '@hono/node-server';
import { watch } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApp } from './app.js';
import { publicRoot } from './lib/assets.js';

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

async function start() {
  if (!isDev()) {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`App listening on http://127.0.0.1:${info.port}`);
      console.log(`Static root: ${publicRoot()}`);
    });
    return;
  }

  // Create the HTTP server first so Vite HMR can share it (no extra :24678).
  const server = createServer();
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: join(repoRoot, 'vite.config.js'),
    root: repoRoot,
    server: {
      middlewareMode: true,
      hmr: { server },
      watch: {
        // Avoid restarting Vite when server code is rewritten by tsx watch.
        ignored: [
          '**/server/src/**',
          '**/server/public/assets/**',
          '**/node_modules/**',
        ],
      },
    },
    appType: 'custom',
  });

  const honoListener = getRequestListener(app.fetch);
  server.on('request', (req, res) => {
    vite.middlewares(req, res, () => {
      honoListener(req, res);
    });
  });

  const reload = () => {
    vite.ws.send({ type: 'full-reload', path: '*' });
  };

  watch(join(serverRoot, 'src/views'), { recursive: true }, reload);
  watch(join(serverRoot, 'public/js'), { recursive: true }, reload);
  watch(join(serverRoot, 'public/locales'), { recursive: true }, reload);

  server.listen(port, () => {
    console.log(`Dev app listening on http://127.0.0.1:${port}`);
    console.log('Vite middleware: HMR for client JS/CSS; full reload for templates/js');
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
