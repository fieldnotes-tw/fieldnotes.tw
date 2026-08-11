// Auth client: session cookie against /api/auth. Nav state is cached in
// localStorage for snappy UI, then reconciled with GET /api/auth/me.
const CURRENT_USER_KEY = 'lz_current_user';
const AVATAR_COLOR_VARS = ['--avatar-plant', '--avatar-animal', '--avatar-sky', '--avatar-taste', '--avatar-workshop'];

function colorForUsername(username) {
  let hash = 0;
  for (const ch of username) hash = (hash + ch.charCodeAt(0)) % AVATAR_COLOR_VARS.length;
  return AVATAR_COLOR_VARS[hash];
}

function shapeUser(apiUser) {
  if (!apiUser) return null;
  return {
    id: apiUser.id,
    username: apiUser.username,
    role: apiUser.role,
    colorVar: colorForUsername(apiUser.username),
    initial: Array.from(apiUser.username.trim())[0] || '?',
  };
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
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
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
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

async function login(username, password) {
  const { data } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return setCurrentUser(data);
}

async function register(username, password) {
  const { data } = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
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

  const submitLink = document.createElement('a');
  submitLink.className = 'auth-nav__btn';
  submitLink.textContent = '投稿';
  submitLink.href = user ? 'submit.html' : 'login.html';
  container.appendChild(submitLink);

  if (user) {
    if (user.role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.className = 'auth-nav__btn';
      adminLink.textContent = '管理';
      adminLink.href = 'admin.html';
      container.appendChild(adminLink);
    }

    const wrap = document.createElement('div');
    wrap.className = 'auth-nav__user';

    const avatarBtn = document.createElement('button');
    avatarBtn.type = 'button';
    avatarBtn.className = 'avatar avatar--sm auth-nav__avatar';
    avatarBtn.style.background = `var(${user.colorVar})`;
    avatarBtn.textContent = user.initial;
    avatarBtn.setAttribute('aria-label', `${user.username} 的帳號選單`);

    const dropdown = document.createElement('div');
    dropdown.className = 'auth-nav__dropdown';
    const nameEl = document.createElement('span');
    nameEl.className = 'auth-nav__dropdown-name';
    nameEl.textContent = user.role === 'admin' ? `${user.username}（管理員）` : user.username;
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'auth-nav__logout';
    logoutBtn.textContent = '登出';
    dropdown.append(nameEl, logoutBtn);

    wrap.append(avatarBtn, dropdown);
    container.appendChild(wrap);

    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('is-open');
    });
    logoutBtn.addEventListener('click', async () => {
      await logout();
      location.href = 'index.html';
    });
    document.addEventListener('click', () => wrap.classList.remove('is-open'));
  } else {
    const loginLink = document.createElement('a');
    loginLink.className = 'auth-nav__btn';
    loginLink.textContent = '登入';
    loginLink.href = 'login.html';

    const registerLink = document.createElement('a');
    registerLink.className = 'auth-nav__btn auth-nav__btn--primary';
    registerLink.textContent = '註冊帳號';
    registerLink.href = 'register.html';

    container.append(loginLink, registerLink);
  }
}

async function initAuthNav() {
  try {
    await refreshCurrentUser();
  } catch {
    // Keep cached nav if /me is unreachable.
  }
  document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);
}

initAuthNav();
