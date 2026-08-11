import { Eta } from 'eta';
import type { Context } from 'hono';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAssets } from './assets.js';
import { isDev } from './env.js';
import { localeOf, t } from './i18n.js';

const here = dirname(fileURLToPath(import.meta.url));

const eta = new Eta({
  views: join(here, '../views'),
  cache: !isDev(),
  defaultExtension: '.eta',
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Stack each grapheme in its own span for the vertical category ovals. */
function charsHtml(text: string): string {
  const chars = Array.from(text).filter((ch) => !/\s/.test(ch));
  if (chars.length <= 1) {
    return escapeHtml(chars[0] || text);
  }
  return chars.map((ch) => `<span>${escapeHtml(ch)}</span>`).join('');
}

export type PageLocals = Record<string, unknown> & {
  titleKey: string;
  scripts?: string[];
  moduleScript?: string;
  leaflet?: boolean;
};

export async function renderPage(c: Context, view: string, data: PageLocals) {
  const locale = localeOf(c);
  const translate = (key: string, vars?: Record<string, string | number>) =>
    t(locale, key, vars);
  const dev = isDev();
  const assets = getAssets();

  const locals = {
    ...data,
    locale,
    t: translate,
    assets,
    dev,
    chars: (key: string) => charsHtml(translate(key)),
    scripts: data.scripts ?? [],
    moduleScript: data.moduleScript,
    leaflet: Boolean(data.leaflet),
  };

  const body = await eta.renderAsync(view, locals);
  const html = await eta.renderAsync('layouts/base', {
    ...locals,
    body,
  });

  c.header('Cache-Control', 'no-store');
  return c.html(html);
}
