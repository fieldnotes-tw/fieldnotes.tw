function $(id) {
  return document.getElementById(id);
}

function setError(msg) {
  const el = $('profileError');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function setSuccess(msg) {
  const el = $('profileSuccess');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function setActiveTab(name) {
  document.querySelectorAll('.profile-tabs__btn').forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $('profilePanelMine').hidden = name !== 'mine';
  $('profilePanelTracks').hidden = name !== 'tracks';
  $('profilePanelSightings').hidden = name !== 'sightings';
}

function renderListItem({ title, meta, href, editHref, onDelete, deleteLabel }) {
  const item = document.createElement('article');
  item.className = 'profile-list__item';

  const body = document.createElement('div');
  body.className = 'profile-list__body';
  const heading = document.createElement('h3');
  heading.className = 'profile-list__title';
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = title;
    heading.appendChild(link);
  } else {
    heading.textContent = title;
  }
  body.appendChild(heading);
  if (meta) {
    const foot = document.createElement('p');
    foot.className = 'profile-list__meta';
    foot.textContent = meta;
    body.appendChild(foot);
  }

  const actions = document.createElement('div');
  actions.className = 'profile-list__actions';
  if (editHref) {
    const edit = document.createElement('a');
    edit.className = 'profile-list__action';
    edit.href = editHref;
    edit.textContent = t('profile.edit');
    actions.appendChild(edit);
  }
  if (onDelete) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'profile-list__action profile-list__action--danger';
    del.textContent = deleteLabel || t('profile.delete');
    del.addEventListener('click', onDelete);
    actions.appendChild(del);
  }

  item.append(body, actions);
  return item;
}

async function uploadAvatar(file) {
  const { data } = await api('/api/submissions/uploads', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type || 'image/jpeg' }),
  });
  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': data.contentType },
    body: file,
  });
  if (!put.ok) throw new Error(t('submit.error.uploadFailed'));
  return data.publicPath;
}

function applyAvatarPreview(apiUser) {
  const user = apiUser?.email ? shapeUser(apiUser) : getCurrentUser();
  const img = $('profileAvatarImg');
  const fallback = $('profileAvatarFallback');
  if (!user || !img || !fallback) return;

  if (user.avatarUrl) {
    const bust = user.avatarUrl.includes('?') ? '&' : '?';
    img.src = `${user.avatarUrl}${bust}v=${Date.now()}`;
    img.hidden = false;
    fallback.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    fallback.hidden = false;
    fallback.style.background = `var(${user.colorVar})`;
    fallback.textContent = user.initial;
  }
}

async function loadProfile() {
  const { data } = await api('/api/me');
  const user = setCurrentUser(data);
  $('f_displayName').value = data.displayName || '';
  $('f_bio').value = data.bio || '';
  applyAvatarPreview(data);
  document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);
}

function renderEmptyPanel(panel, message) {
  panel.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'profile-panel__empty';
  empty.textContent = message;
  panel.appendChild(empty);
}

async function loadMine() {
  const panel = $('profilePanelMine');
  panel.replaceChildren();
  const { data } = await api('/api/me/phenomena');
  if (!data.length) {
    renderEmptyPanel(panel, t('profile.emptyMine'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'profile-list';
  data.forEach((item) => {
    list.appendChild(renderListItem({
      title: item.title,
      meta: item.location || '',
      href: `/?phenomenon=${encodeURIComponent(item.id)}`,
      editHref: `/submit?edit=${encodeURIComponent(item.id)}`,
      onDelete: async () => {
        if (!confirm(t('profile.confirmDelete'))) return;
        await api(`/api/submissions/phenomena/${item.id}`, { method: 'DELETE' });
        await loadMine();
      },
    }));
  });
  panel.appendChild(list);
}

async function loadTracks() {
  const panel = $('profilePanelTracks');
  panel.replaceChildren();
  const { data } = await api('/api/me/tracks');
  if (!data.length) {
    renderEmptyPanel(panel, t('profile.emptyTracks'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'profile-list';
  data.forEach((item) => {
    list.appendChild(renderListItem({
      title: item.title,
      meta: item.location || '',
      href: `/?phenomenon=${encodeURIComponent(item.id)}`,
      onDelete: async () => {
        await api(`/api/me/tracks/${item.id}`, { method: 'DELETE' });
        await loadTracks();
      },
      deleteLabel: t('profile.untrack'),
    }));
  });
  panel.appendChild(list);
}

async function loadSightings() {
  const panel = $('profilePanelSightings');
  panel.replaceChildren();
  const { data } = await api('/api/me/sightings');
  if (!data.length) {
    renderEmptyPanel(panel, t('profile.emptySightings'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'profile-list';
  data.forEach((item) => {
    const seen = new Date(item.seenAt);
    list.appendChild(renderListItem({
      title: item.phenomenonTitle,
      meta: seen.toLocaleString(),
      editHref: `/sighting?edit=${encodeURIComponent(item.id)}`,
      onDelete: async () => {
        if (!confirm(t('profile.confirmDelete'))) return;
        await api(`/api/sightings/${item.id}`, { method: 'DELETE' });
        await loadSightings();
      },
    }));
  });
  panel.appendChild(list);
}

async function handleProfileSave(e) {
  e.preventDefault();
  setError('');
  setSuccess('');
  const btn = $('profileSaveBtn');
  btn.disabled = true;
  try {
    const { data } = await api('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: $('f_displayName').value.trim(),
        bio: $('f_bio').value.trim(),
      }),
    });
    setCurrentUser(data);
    document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);
    applyAvatarPreview(data);
    setSuccess(t('profile.saved'));
  } catch (err) {
    setError(err.message || t('submit.error.failed'));
  } finally {
    btn.disabled = false;
  }
}

async function boot() {
  await i18nReady;
  if (!getCurrentUser()) {
    location.href = '/login';
    return;
  }

  await loadProfile();
  await Promise.all([loadMine(), loadTracks(), loadSightings()]);

  document.querySelectorAll('.profile-tabs__btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  $('profileForm').addEventListener('submit', handleProfileSave);
  $('profileLogoutBtn').addEventListener('click', async () => {
    await logout();
    location.href = '/';
  });
  $('f_avatar').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    try {
      const avatarUrl = await uploadAvatar(file);
      const { data } = await api('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl }),
      });
      setCurrentUser(data);
      applyAvatarPreview(data);
      document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);
      setSuccess(t('profile.avatarUpdated'));
    } catch (err) {
      setError(err.message || t('submit.error.uploadFailed'));
    } finally {
      e.target.value = '';
    }
  });
}

boot();
