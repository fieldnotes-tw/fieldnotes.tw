// Lightweight i18n for the MPA: cookie override → browser languages → zh-Hant.
const I18N_LOCALES = ['zh-Hant', 'en'];
const I18N_DEFAULT = 'zh-Hant';
const I18N_COOKIE = 'fn_locale';

let i18nLocale = I18N_DEFAULT;
let i18nCatalog = {};

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

function normalizeLocale(raw) {
  if (!raw) return null;
  const value = String(raw).trim().toLowerCase().replace(/_/g, '-');
  if (value === 'zh-hant' || value === 'zh-tw' || value === 'zh-hk' || value === 'zh') {
    return 'zh-Hant';
  }
  if (value === 'en' || value.startsWith('en-')) return 'en';
  return null;
}

function resolveLocale() {
  const fromCookie = normalizeLocale(readCookie(I18N_COOKIE));
  if (fromCookie) return fromCookie;

  const candidates = [
    ...(navigator.languages || []),
    navigator.language,
  ].filter(Boolean);

  for (const tag of candidates) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return I18N_DEFAULT;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] == null ? `{${name}}` : String(vars[name]),
  );
}

function t(key, vars) {
  const template = i18nCatalog[key] ?? key;
  return interpolate(template, vars);
}

function getLocale() {
  return i18nLocale;
}

function setLocale(locale) {
  const next = normalizeLocale(locale) || I18N_DEFAULT;
  writeCookie(I18N_COOKIE, next);
  location.reload();
}

function setCharsContent(el, text) {
  el.replaceChildren();
  const chars = Array.from(text);
  const useChars = i18nLocale === 'zh-Hant' && chars.length > 1;
  if (useChars) {
    for (const ch of chars) {
      const span = document.createElement('span');
      span.textContent = ch;
      el.appendChild(span);
    }
  } else {
    el.textContent = text;
  }
}

function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (!key) return;
    el.innerHTML = t(key);
  });

  root.querySelectorAll('[data-i18n-chars]').forEach((el) => {
    const key = el.getAttribute('data-i18n-chars');
    if (!key) return;
    setCharsContent(el, t(key));
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    el.setAttribute('placeholder', t(key));
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (!key) return;
    el.setAttribute('aria-label', t(key));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    document.title = t(key);
  });

  document.documentElement.lang = i18nLocale;
}

let langSwitchDocBound = false;

function closeAllLangPanels() {
  document.querySelectorAll('.lang-switch.is-open').forEach((wrap) => {
    wrap.classList.remove('is-open');
    const btn = wrap.querySelector('.lang-switch__btn');
    const panel = wrap.querySelector('.lang-switch__panel');
    btn?.classList.remove('is-open');
    btn?.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
  });
}

function setLangPanelOpen(wrap, open) {
  const btn = wrap.querySelector('.lang-switch__btn');
  const panel = wrap.querySelector('.lang-switch__panel');
  if (!btn || !panel) return;
  if (open) {
    closeAllLangPanels();
    window.closeFloatingSearch?.();
  }
  wrap.classList.toggle('is-open', open);
  btn.classList.toggle('is-open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  panel.hidden = !open;
}

function bindLangSwitchDoc() {
  if (langSwitchDocBound) return;
  langSwitchDocBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('.lang-switch')) return;
    closeAllLangPanels();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllLangPanels();
  });
}

function renderLangSwitcher(container) {
  bindLangSwitchDoc();

  const wrap = document.createElement('div');
  wrap.className = 'lang-switch';

  const panelId = `lang-panel-${Math.random().toString(36).slice(2, 9)}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'lang-switch__btn';
  btn.setAttribute('aria-label', t('nav.lang.label'));
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', panelId);
  btn.innerHTML = `<svg class="lang-switch__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z"/></svg>`;

  const panel = document.createElement('div');
  panel.className = 'lang-switch__panel';
  panel.id = panelId;
  panel.hidden = true;
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', t('nav.lang.label'));

  for (const locale of I18N_LOCALES) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'lang-switch__option' + (locale === i18nLocale ? ' is-active' : '');
    option.setAttribute('role', 'menuitemradio');
    option.setAttribute('aria-checked', locale === i18nLocale ? 'true' : 'false');
    option.textContent = locale === 'zh-Hant' ? t('nav.lang.zh') : t('nav.lang.en');
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      if (locale !== i18nLocale) setLocale(locale);
      else closeAllLangPanels();
    });
    panel.appendChild(option);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setLangPanelOpen(wrap, panel.hidden);
  });

  wrap.append(btn, panel);
  container.appendChild(wrap);
}

async function loadCatalog(locale) {
  const res = await fetch(`/locales/${locale}.json`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to load locale ${locale}`);
  return res.json();
}

const i18nReady = (async () => {
  i18nLocale = resolveLocale();
  if (!readCookie(I18N_COOKIE)) {
    // Persist resolved browser default so API cookie negotiation matches the UI.
    writeCookie(I18N_COOKIE, i18nLocale);
  }
  i18nCatalog = await loadCatalog(i18nLocale);
  applyI18n();
  return i18nLocale;
})().catch((err) => {
  console.error(err);
  i18nCatalog = {};
});

window.t = t;
window.getLocale = getLocale;
window.setLocale = setLocale;
window.applyI18n = applyI18n;
window.i18nReady = i18nReady;
window.renderLangSwitcher = renderLangSwitcher;
window.closeAllLangPanels = closeAllLangPanels;
