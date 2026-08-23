i18nReady.then(() => {
  refreshCurrentUser().then((user) => {
    if (user) location.href = user.role === 'admin' ? '/admin' : '/';
  }).catch(() => {});

  const form = document.getElementById('forgotForm');
  const errorEl = document.getElementById('forgotError');
  const successEl = document.getElementById('forgotSuccess');
  const submitBtn = form.querySelector('.auth-form__submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    successEl.hidden = true;
    const email = form.email.value.trim();
    if (!email) return;

    submitBtn.disabled = true;
    try {
      await requestPasswordReset(email);
      successEl.textContent = t('auth.forgot.sent');
      successEl.hidden = false;
      form.email.value = '';
    } catch (err) {
      errorEl.textContent = err.message || t('auth.forgot.failed');
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
});
