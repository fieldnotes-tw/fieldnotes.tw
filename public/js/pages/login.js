i18nReady.then(() => {
  refreshCurrentUser().then((user) => {
    if (user) location.href = user.role === 'admin' ? '/admin' : '/';
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
      location.href = user.role === 'admin' ? '/admin' : '/';
    } catch (err) {
      errorEl.textContent = err.message || t('auth.login.failed');
      errorEl.hidden = false;
    }
  });
});
