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
  return {
    id: apiUser.id,
    email: apiUser.email,
    role: apiUser.role,
    colorVar: colorForEmail(apiUser.email),
    initial: Array.from(local.trim())[0]?.toUpperCase() || '?',
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
  return setCurrentUser(data);
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
  submitLink.className = 'auth-nav__btn';
  submitLink.textContent = t('nav.submit');
  submitLink.href = user ? '/submit' : '/login';
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

    const avatarBtn = document.createElement('button');
    avatarBtn.type = 'button';
    avatarBtn.className = 'avatar avatar--sm auth-nav__avatar';
    avatarBtn.style.background = `var(${user.colorVar})`;
    avatarBtn.textContent = user.initial;
    avatarBtn.setAttribute('aria-label', t('nav.accountMenu', { email: user.email }));

    const dropdown = document.createElement('div');
    dropdown.className = 'auth-nav__dropdown';
    const nameEl = document.createElement('span');
    nameEl.className = 'auth-nav__dropdown-name';
    nameEl.textContent = user.role === 'admin'
      ? t('nav.adminBadge', { email: user.email })
      : user.email;
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'auth-nav__logout';
    logoutBtn.textContent = t('nav.logout');
    dropdown.append(nameEl, logoutBtn);

    wrap.append(avatarBtn, dropdown);
    container.appendChild(wrap);

    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('is-open');
    });
    logoutBtn.addEventListener('click', async () => {
      await logout();
      location.href = '/';
    });
    document.addEventListener('click', () => wrap.classList.remove('is-open'));
  } else {
    const loginLink = document.createElement('a');
    loginLink.className = 'auth-nav__btn';
    loginLink.textContent = t('nav.login');
    loginLink.href = '/login';

    const registerLink = document.createElement('a');
    registerLink.className = 'auth-nav__btn auth-nav__btn--primary';
    registerLink.textContent = t('nav.register');
    registerLink.href = '/register';

    container.append(loginLink, registerLink);
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
