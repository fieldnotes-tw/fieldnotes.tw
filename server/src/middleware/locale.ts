import { createMiddleware } from 'hono/factory';
import { localeOf, resolveLocale, type Locale } from '../lib/i18n.js';

export type LocaleEnv = {
  Variables: {
    locale: Locale;
  };
};

export const withLocale = createMiddleware<LocaleEnv>(async (c, next) => {
  c.set('locale', resolveLocale(c));
  await next();
});

export { localeOf };
