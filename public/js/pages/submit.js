i18nReady.then(() => {
  if (!getCurrentUser()) {
    location.href = '/login';
  }
});
