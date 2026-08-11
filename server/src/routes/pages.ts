import { Hono } from 'hono';
import { getAssets } from '../lib/assets.js';
import { isDev } from '../lib/env.js';
import { renderPage } from '../lib/render.js';
import type { LocaleEnv } from '../middleware/locale.js';

export const pageRoutes = new Hono<LocaleEnv>();

const htmlRedirects: Record<string, string> = {
  '/index.html': '/',
  '/login.html': '/login',
  '/register.html': '/register',
  '/confirm.html': '/confirm',
  '/admin.html': '/admin',
  '/submit.html': '/submit',
};

for (const [from, to] of Object.entries(htmlRedirects)) {
  pageRoutes.get(from, (c) => c.redirect(to, 301));
}

pageRoutes.get('/', (c) =>
  renderPage(c, 'home', {
    titleKey: 'brand.title',
    leaflet: true,
    // Dev: Vite serves /client/main.js with HMR. Prod: hashed bundle.
    moduleScript: isDev() ? '/client/main.js' : getAssets().js,
  }),
);

pageRoutes.get('/login', (c) =>
  renderPage(c, 'login', {
    titleKey: 'auth.login.pageTitle',
    scripts: ['/js/pages/login.js'],
  }),
);

pageRoutes.get('/register', (c) =>
  renderPage(c, 'register', {
    titleKey: 'auth.register.pageTitle',
    scripts: ['/js/pages/register.js'],
  }),
);

pageRoutes.get('/confirm', (c) =>
  renderPage(c, 'confirm', {
    titleKey: 'auth.confirm.pageTitle',
    scripts: ['/js/pages/confirm.js'],
  }),
);

pageRoutes.get('/submit', (c) =>
  renderPage(c, 'submit', {
    titleKey: 'submit.pageTitle',
    scripts: ['/js/pages/submit.js'],
  }),
);

pageRoutes.get('/admin', (c) =>
  renderPage(c, 'admin', {
    titleKey: 'admin.pageTitle',
    scripts: ['/js/admin.js'],
  }),
);
