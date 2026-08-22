function resetRedirectTarget(user) {
  return user.role === 'admin' ? '/admin' : '/';
}

i18nReady.then(() => {
  const form = document.getElementById('resetForm');
  const errorEl = document.getElementById('resetError');
  const submitBtn = form.querySelector('.auth-form__submit');
  const token = new URLSearchParams(location.search).get('token');

  if (!token) {
    errorEl.textContent = t('auth.reset.missingToken');
    errorEl.hidden = false;
    submitBtn.disabled = true;
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    if (password.length < 8) {
      errorEl.textContent = t('auth.register.passwordTooShort');
      errorEl.hidden = false;
      return;
    }
    if (password !== confirmPassword) {
      errorEl.textContent = t('auth.register.passwordMismatch');
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    try {
      const user = await resetPassword(token, password);
      location.href = resetRedirectTarget(user);
    } catch (err) {
      errorEl.textContent = err.message || t('auth.reset.failed');
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });
});
