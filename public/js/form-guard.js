function initFormLeaveGuard({ isDirty, getMessage, onSaveDraft, confirmLeave } = {}) {
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
    if (event.defaultPrevented) return;
    if (!shouldBlock()) return;

    const link = event.target.closest('a[href]');
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;

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
    event.stopImmediatePropagation();

    const navigateAway = () => {
      allowLeaveWithoutPrompt();
      location.assign(url.href);
    };

    if (typeof confirmLeave === 'function') {
      const action = confirmLeave();
      if (action === 'stay') return;
      if (action === 'save' && typeof onSaveDraft === 'function') {
        if (onSaveDraft() === false) return;
      }
      navigateAway();
      return;
    }

    const message = typeof getMessage === 'function' ? getMessage() : String(getMessage || '');
    if (message && !confirm(message)) return;

    navigateAway();
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
