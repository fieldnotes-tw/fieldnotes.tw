// Auth client: session cookie against /api/auth. Nav state is cached in
// localStorage for snappy UI, then reconciled with GET /api/auth/me.
const CURRENT_USER_KEY = 'lz_current_user';
const AVATAR_COLOR_VARS = ['--avatar-plant', '--avatar-animal', '--avatar-sky', '--avatar-taste', '--avatar-workshop'];

function colorForEmail(email) {
  let hash = 0;
  for (const ch of email) hash = (hash + ch.charCodeAt(0)) % AVATAR_COLOR_VARS.length;
  return AVATAR_COLOR_VARS[hash];
}

function emailLocalPart(email) {
  return (email || '').split('@')[0] || email || '?';
}

function shapeUser(apiUser) {
  if (!apiUser?.email) return null;
  const local = emailLocalPart(apiUser.email);
  const display = apiUser.displayName || local;
  return {
    id: apiUser.id,
    email: apiUser.email,
    role: apiUser.role,
    displayName: apiUser.displayName || null,
    avatarUrl: apiUser.avatarUrl || null,
    bio: apiUser.bio || null,
    colorVar: colorForEmail(apiUser.email),
    initial: Array.from(display.trim())[0]?.toUpperCase() || '?',
  };
}

function getCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
    // Drop cached username-era sessions.
    if (user && !user.email) {
      localStorage.removeItem(CURRENT_USER_KEY);
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function setCurrentUser(apiUser) {
  const user = shapeUser(apiUser);
  if (user) localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(CURRENT_USER_KEY);
  return user;
}

function logoutCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

async function api(path, options = {}) {
  const headers = {
    'Accept-Language': typeof getLocale === 'function' ? getLocale() : 'zh-Hant',
    ...(options.headers || {}),
  };
  if (options.body != null && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }

  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (res.status === 204) {
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return null;
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function refreshCurrentUser() {
  const { data } = await api('/api/auth/me');
  const user = setCurrentUser(data);
  document.dispatchEvent(new CustomEvent('fn:user-updated', { detail: user }));
  return user;
}

async function login(email, password) {
  const { data } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return setCurrentUser(data);
}

async function register(email, password) {
  const { data } = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data;
}

async function resendConfirmation(email) {
  return api('/api/auth/resend-confirmation', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

async function confirmEmail(token) {
  const { data } = await api(`/api/auth/confirm?token=${encodeURIComponent(token)}`);
  return setCurrentUser(data);
}

async function requestPasswordReset(email) {
  return api('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

async function resetPassword(token, password) {
  const { data } = await api('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  return setCurrentUser(data);
}

function startLineLogin(next, returnTo) {
  const params = new URLSearchParams();
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    params.set('next', next);
  }
  const page = returnTo || location.pathname;
  if (page === '/login' || page === '/register') {
    params.set('returnTo', page);
  }
  const qs = params.toString();
  location.href = `/api/auth/line/start${qs ? `?${qs}` : ''}`;
}

function showLineAuthError(errorEl) {
  if (!errorEl) return;
  const params = new URLSearchParams(location.search);
  const line = params.get('line');
  if (!line) return;

  const messageParam = params.get('message');
  const messages = {
    unavailable: 'auth.line.unavailable',
    denied: 'auth.line.denied',
    invalid: 'auth.line.invalid',
    failed: 'auth.line.failed',
  };

  errorEl.textContent = messageParam || t(messages[line] || 'auth.line.failed');
  errorEl.hidden = false;
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
  } finally {
    logoutCurrentUser();
  }
}

function renderAuthNav(container) {
  const user = getCurrentUser();
  container.replaceChildren();

  if (typeof renderLangSwitcher === 'function' && !container.closest('.floatingbar')) {
    renderLangSwitcher(container);
  }

  const submitLink = document.createElement('a');
  submitLink.className = 'auth-nav__btn auth-nav__btn--primary';
  submitLink.textContent = t('nav.submit');
  submitLink.href = user ? '/submit' : `/login?next=${encodeURIComponent('/submit')}`;
  container.appendChild(submitLink);

  if (user) {
    if (user.role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.className = 'auth-nav__btn';
      adminLink.textContent = t('nav.admin');
      adminLink.href = '/admin';
      container.appendChild(adminLink);
    }

    const wrap = document.createElement('div');
    wrap.className = 'auth-nav__user';

    const profileLink = document.createElement('a');
    profileLink.className = 'avatar avatar--sm auth-nav__avatar';
    profileLink.href = '/profile';
    profileLink.setAttribute('aria-label', t('nav.profile'));
    if (user.avatarUrl) {
      const img = document.createElement('img');
      img.src = user.avatarUrl;
      img.alt = '';
      img.className = 'auth-nav__avatar-img';
      profileLink.appendChild(img);
    } else {
      profileLink.style.background = `var(${user.colorVar})`;
      profileLink.textContent = user.initial;
    }

    wrap.append(profileLink);
    container.appendChild(wrap);
  } else {
    const loginLink = document.createElement('a');
    loginLink.className = 'auth-nav__btn';
    loginLink.textContent = t('nav.login');
    loginLink.href = '/login';
    container.appendChild(loginLink);
  }
}

async function initAuthNav() {
  await i18nReady;
  try {
    await refreshCurrentUser();
  } catch {
    // Keep cached nav if /me is unreachable.
  }
  document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);
}

initAuthNav();
