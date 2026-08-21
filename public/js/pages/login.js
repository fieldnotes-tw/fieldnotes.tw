function loginRedirectTarget(user) {
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return user.role === 'admin' ? '/admin' : '/';
}

i18nReady.then(() => {
  refreshCurrentUser().then((user) => {
    if (user) location.href = loginRedirectTarget(user);
  }).catch(() => {});

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return;
    try {
      const user = await login(email, password);
      location.href = loginRedirectTarget(user);
    } catch (err) {
      errorEl.textContent = err.message || t('auth.login.failed');
      errorEl.hidden = false;
    }
  });
});
