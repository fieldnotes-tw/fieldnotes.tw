i18nReady.then(async () => {
  const statusEl = document.getElementById('confirmStatus');
  const errorEl = document.getElementById('confirmError');
  const token = new URLSearchParams(location.search).get('token');

  if (!token) {
    statusEl.hidden = true;
    errorEl.textContent = t('auth.confirm.missingToken');
    errorEl.hidden = false;
    return;
  }

  try {
    const user = await confirmEmail(token);
    statusEl.textContent = t('auth.confirm.success');
    document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);
    location.href = user.role === 'admin' ? '/admin' : '/';
  } catch (err) {
    statusEl.hidden = true;
    errorEl.textContent = err.message || t('auth.confirm.failed');
    errorEl.hidden = false;
  }
});
