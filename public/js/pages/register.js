i18nReady.then(() => {
  const errorEl = document.getElementById('registerError');
  showLineAuthError(errorEl);

  refreshCurrentUser().then((user) => {
    if (user) location.href = '/';
  }).catch(() => {});

  const form = document.getElementById('registerForm');
  const successEl = document.getElementById('registerSuccess');
  const resendBtn = document.getElementById('resendBtn');
  const signupEl = document.getElementById('registerSignup');
  const oauthEl = document.getElementById('registerOauth');
  const titleEl = document.getElementById('registerTitle');
  let pendingEmail = '';

  function showRegisterPending(email) {
    pendingEmail = email;
    signupEl.hidden = true;
    oauthEl.hidden = true;
    if (titleEl) titleEl.textContent = t('auth.register.pendingTitle');
    successEl.textContent = t('auth.register.sent', { email });
    successEl.hidden = false;
    resendBtn.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    if (password !== confirmPassword) {
      errorEl.textContent = t('auth.register.passwordMismatch');
      errorEl.hidden = false;
      successEl.hidden = true;
      return;
    }
    if (password.length < 8) {
      errorEl.textContent = t('auth.register.passwordTooShort');
      errorEl.hidden = false;
      successEl.hidden = true;
      return;
    }
    errorEl.hidden = true;
    successEl.hidden = true;
    try {
      const data = await register(email, password);
      showRegisterPending(data.email);
    } catch (err) {
      errorEl.textContent = err.status === 409
        ? t('auth.register.alreadyRegistered')
        : (err.message || t('auth.register.failed'));
      errorEl.hidden = false;
    }
  });

  resendBtn.addEventListener('click', async () => {
    const email = pendingEmail || form.email.value.trim();
    if (!email) return;
    errorEl.hidden = true;
    try {
      await resendConfirmation(email);
      successEl.textContent = t('auth.register.resent', { email });
      successEl.hidden = false;
    } catch (err) {
      errorEl.textContent = err.message || t('auth.register.resendFailed');
      errorEl.hidden = false;
    }
  });

  document.getElementById('lineRegisterBtn')?.addEventListener('click', () => {
    startLineLogin('/', '/register');
  });
});
