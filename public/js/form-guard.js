function initFormLeaveGuard({ isDirty, getMessage, onConfirmLeave } = {}) {
  let bypassLeaveGuard = false;

  function allowLeaveWithoutPrompt() {
    bypassLeaveGuard = true;
  }

  function shouldBlock() {
    return !bypassLeaveGuard && typeof isDirty === 'function' && isDirty();
  }

  window.addEventListener('beforeunload', (event) => {
    if (!shouldBlock()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('click', (event) => {
    if (!shouldBlock()) return;

    const link = event.target.closest('a[href]');
    if (!link) return;
    if (link.target && link.target !== '_self') return;

    const rawHref = link.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      return;
    }

    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }

    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;

    event.preventDefault();
    event.stopPropagation();

    const message = typeof getMessage === 'function' ? getMessage() : String(getMessage || '');
    if (message && !confirm(message)) return;

    if (typeof onConfirmLeave === 'function') onConfirmLeave();
    allowLeaveWithoutPrompt();
    location.href = url.href;
  }, true);

  return { allowLeaveWithoutPrompt };
}

function readStoredDraft(storageKey) {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredDraft(storageKey, data) {
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify({
    ...data,
    savedAt: Date.now(),
  }));
}

function clearStoredDraft(storageKey) {
  if (!storageKey) localStorage.removeItem(storageKey);
}
