// Front-end-only auth simulation — no real backend. State lives in localStorage
// so the logged-in look can be demoed across pages before a real login system exists.
const CURRENT_USER_KEY = 'lz_current_user';
const AVATAR_COLOR_VARS = ['--avatar-plant', '--avatar-animal', '--avatar-sky', '--avatar-taste', '--avatar-workshop'];

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
  } catch {
    return null;
  }
}

function setCurrentUser(username) {
  const colorVar = AVATAR_COLOR_VARS[Math.floor(Math.random() * AVATAR_COLOR_VARS.length)];
  const user = { username, colorVar, initial: username.trim().charAt(0) || '?' };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  return user;
}

function logoutCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
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
    nameEl.textContent = user.username;
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
    logoutBtn.addEventListener('click', () => {
      logoutCurrentUser();
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

document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);
