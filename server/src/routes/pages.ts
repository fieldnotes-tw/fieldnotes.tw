import { Hono } from 'hono';
import { getAssets } from '../lib/assets.js';
import { loadFeaturedContributors } from '../lib/contributors.js';
import { isDev } from '../lib/env.js';
import { renderPage } from '../lib/render.js';
import type { LocaleEnv } from '../middleware/locale.js';

export const pageRoutes = new Hono<LocaleEnv>();

const htmlRedirects: Record<string, string> = {
  '/index.html': '/',
  '/login.html': '/login',
  '/register.html': '/register',
  '/confirm.html': '/confirm',
  '/forgot-password.html': '/forgot-password',
  '/reset-password.html': '/reset-password',
  '/admin.html': '/admin',
  '/submit.html': '/submit',
};

for (const [from, to] of Object.entries(htmlRedirects)) {
  pageRoutes.get(from, (c) => c.redirect(to, 301));
}

pageRoutes.get('/', async (c) => {
  const contributors = await loadFeaturedContributors();
  return renderPage(c, 'home', {
    titleKey: 'brand.title',
    leaflet: true,
    contributors,
    moduleScript: isDev() ? '/client/main.js' : getAssets().js,
  });
});

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

pageRoutes.get('/forgot-password', (c) =>
  renderPage(c, 'forgot', {
    titleKey: 'auth.forgot.pageTitle',
    scripts: ['/js/pages/forgot.js'],
  }),
);

pageRoutes.get('/reset-password', (c) =>
  renderPage(c, 'reset-password', {
    titleKey: 'auth.reset.pageTitle',
    scripts: ['/js/pages/reset-password.js'],
  }),
);

pageRoutes.get('/submit', (c) =>
  renderPage(c, 'submit', {
    titleKey: 'submit.pageTitle',
    leaflet: true,
    scripts: ['/js/datetime-local.js', '/js/media.js', '/js/form-guard.js', '/js/pages/submit.js'],
  }),
);

pageRoutes.get('/sighting', (c) =>
  renderPage(c, 'sighting', {
    titleKey: 'sighting.form.pageTitle',
    leaflet: true,
    scripts: ['/js/datetime-local.js', '/js/media.js', '/js/submit-map.js', '/js/form-guard.js', '/js/pages/sighting.js'],
  }),
);

pageRoutes.get('/profile', (c) =>
  renderPage(c, 'profile', {
    titleKey: 'profile.pageTitle',
    scripts: ['/js/pages/profile.js'],
  }),
);

pageRoutes.get('/members/:id', (c) =>
  renderPage(c, 'member', {
    titleKey: 'member.pageTitle',
    scripts: ['/js/pages/member.js'],
  }),
);

pageRoutes.get('/admin', (c) =>
  renderPage(c, 'admin', {
    titleKey: 'admin.pageTitle',
    scripts: ['/js/admin.js'],
  }),
);
