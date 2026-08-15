import { isDev, repoRoot, serverRoot } from './lib/env.js';
import { getRequestListener } from '@hono/node-server';
import { serve } from '@hono/node-server';
import { copyFileSync, mkdirSync, readdirSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative, dirname, sep } from 'node:path';
import { createApp } from './app.js';
import { publicRoot } from './lib/assets.js';
import { reloadCatalogs } from './lib/i18n.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const app = createApp();
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true';

const authoredLocalesDir = join(repoRoot, 'public/locales');
const authoredJsDir = join(repoRoot, 'public/js');
const viewsDir = join(serverRoot, 'src/views');

function underDir(file: string, dir: string) {
  const rel = relative(dir, file);
  return Boolean(rel) && !rel.startsWith('..') && !rel.startsWith(`..${sep}`);
}

function syncLocaleFiles() {
  const targets = [
    join(serverRoot, 'locales'),
    join(serverRoot, 'public/locales'),
  ];
  for (const dir of targets) {
    mkdirSync(dir, { recursive: true });
  }
  for (const name of readdirSync(authoredLocalesDir)) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const from = join(authoredLocalesDir, name);
    for (const dir of targets) {
      copyFileSync(from, join(dir, name));
    }
  }
}

function syncJsFile(file: string) {
  const rel = relative(authoredJsDir, file);
  if (!rel || rel.startsWith('..')) return;
  const dest = join(serverRoot, 'public/js', rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
}

function syncJsTree() {
  for (const rel of listJsFiles(authoredJsDir)) {
    syncJsFile(join(authoredJsDir, rel));
  }
}

function listJsFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith('.')) continue;
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...listJsFiles(path, base));
    else if (name.name.endsWith('.js')) out.push(relative(base, path));
  }
  return out;
}

async function start() {
  if (!isDev()) {
    serve({ fetch: app.fetch, port, hostname: host }, (info) => {
      console.log(`App listening on http://${host}:${info.port}`);
      console.log(`Static root: ${publicRoot()}`);
    });
    return;
  }

  syncLocaleFiles();
  try {
    syncJsTree();
  } catch (err) {
    console.error('[dev] initial js sync failed', err);
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
        usePolling,
        interval: usePolling ? 300 : undefined,
        // Ignore generated sync trees and non-view server sources (tsx watches those).
        ignored: [
          '**/node_modules/**',
          '**/server/public/**',
          '**/server/locales/**',
          '**/server/src/lib/**',
          '**/server/src/routes/**',
          '**/server/src/middleware/**',
          '**/server/src/db/**',
          '**/server/src/index.ts',
          '**/server/src/app.ts',
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

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const reload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      vite.ws.send({ type: 'full-reload', path: '*' });
    }, 150);
  };

  const onLocaleChange = () => {
    try {
      syncLocaleFiles();
      reloadCatalogs();
    } catch (err) {
      console.error('[dev] locale sync failed', err);
    }
    reload();
  };

  // Watch authored sources only — never sync targets (that caused reload loops).
  const fullReloadRoots = [viewsDir, authoredJsDir, authoredLocalesDir];
  for (const root of fullReloadRoots) {
    vite.watcher.add(root);
  }

  vite.watcher.on('change', (file) => {
    const base = file.split(/[/\\]/).pop() ?? '';
    if (base.startsWith('.')) return;

    if (underDir(file, authoredLocalesDir) && base.endsWith('.json')) {
      onLocaleChange();
      return;
    }
    if (underDir(file, authoredJsDir)) {
      try {
        syncJsFile(file);
      } catch (err) {
        console.error('[dev] js sync failed', err);
      }
      reload();
      return;
    }
    if (underDir(file, viewsDir)) {
      reload();
    }
  });

  // Fallback when not polling (native FS events).
  if (!usePolling) {
    for (const root of fullReloadRoots) {
      watch(root, { recursive: true }, (_event, filename) => {
        const name = filename?.toString() ?? '';
        if (name.startsWith('.')) return;
        if (root === authoredLocalesDir || name.endsWith('.json')) {
          onLocaleChange();
          return;
        }
        if (root === authoredJsDir && name) {
          try {
            syncJsFile(join(authoredJsDir, name));
          } catch (err) {
            console.error('[dev] js sync failed', err);
          }
        }
        reload();
      });
    }
  }

  server.listen(port, host, () => {
    console.log(`Dev app listening on http://${host}:${port}`);
    console.log(
      `Vite middleware: HMR for client JS/CSS; full reload for templates/js/locales${
        usePolling ? ' (polling)' : ''
      }`,
    );
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
