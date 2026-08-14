import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { isDev, repoRoot, serverRoot } from './env.js';

// Catalogs are authored in public/locales/; synced into the API tree via
// `npm run static:sync` (dev / prebuild / CI).

export const LOCALES = ['zh-Hant', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh-Hant';
export const LOCALE_COOKIE = 'fn_locale';

type Catalog = Record<string, string>;

function catalogPaths(locale: Locale): string[] {
  const name = `${locale}.json`;
  const source = join(repoRoot, 'public/locales', name);
  const synced = [
    join(serverRoot, 'locales', name),
    join(serverRoot, 'public/locales', name),
  ];
  // Dev: prefer the authored file so edits apply without waiting on sync.
  return isDev() ? [source, ...synced] : [...synced, source];
}

function loadCatalog(locale: Locale): Catalog {
  for (const path of catalogPaths(locale)) {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
    } catch {
      // try next
    }
  }
  throw new Error(`Missing locale catalog: ${locale}`);
}

const catalogs: Record<Locale, Catalog> = {
  'zh-Hant': loadCatalog('zh-Hant'),
  en: loadCatalog('en'),
};

/** Re-read locale JSON from disk (dev live-reload). */
export function reloadCatalogs() {
  for (const locale of LOCALES) {
    catalogs[locale] = loadCatalog(locale);
  }
}

function normalizeLocale(raw: string | undefined | null): Locale | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/_/g, '-');
  if (value === 'zh-hant' || value === 'zh-tw' || value === 'zh-hk' || value === 'zh') {
    return 'zh-Hant';
  }
  if (value === 'en' || value.startsWith('en-')) {
    return 'en';
  }
  return null;
}

/** Parse Accept-Language / navigator language list into a supported locale. */
export function resolveLocaleFromAcceptLanguage(header: string | undefined | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const parts = header.split(',').map((part) => {
    const [tag, ...params] = part.trim().split(';');
    const q = params.find((p) => p.trim().startsWith('q='));
    const quality = q ? Number(q.split('=')[1]) || 0 : 1;
    return { tag: tag.trim(), quality };
  });
  parts.sort((a, b) => b.quality - a.quality);
  for (const { tag } of parts) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function resolveLocale(c: Context): Locale {
  const cookie = normalizeLocale(getCookie(c, LOCALE_COOKIE));
  if (cookie) return cookie;
  return resolveLocaleFromAcceptLanguage(c.req.header('Accept-Language'));
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = catalogs[locale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] == null ? `{${name}}` : String(vars[name]),
  );
}

export function localeOf(c: Context): Locale {
  return (c.get('locale') as Locale | undefined) ?? resolveLocale(c);
}
