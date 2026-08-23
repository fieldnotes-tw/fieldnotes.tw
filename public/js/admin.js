let phenomenaCache = [];
let editingId = null;
let pendingImageUrl = '';

function $(id) {
  return document.getElementById(id);
}

function categoryLabel(category) {
  return t(`category.${category}`) || category;
}

function statusLabel(status) {
  return t(`status.${status}`) || status;
}

function formatWhen(value) {
  if (!value) return t('admin.emDash');
  try {
    const locale = getLocale() === 'en' ? 'en-US' : 'zh-TW';
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatUserLabel(row) {
  const lineId = row.lineUserId
    || (row.email?.startsWith('line_') && row.email.endsWith('@oauth.local')
      ? row.email.slice(5, -('@oauth.local'.length))
      : null);
  if (lineId) {
    const name = row.displayName?.trim();
    return name ? `${name} · LINE ${lineId}` : `LINE ${lineId}`;
  }
  return row.email;
}

function renderUserIdentity(row) {
  const lineId = row.lineUserId
    || (row.email?.startsWith('line_') && row.email.endsWith('@oauth.local')
      ? row.email.slice(5, -('@oauth.local'.length))
      : null);
  if (!lineId) return row.email;

  const wrap = document.createElement('div');
  wrap.className = 'admin-user-identity';
  const name = row.displayName?.trim();
  if (name) {
    const nameEl = document.createElement('div');
    nameEl.className = 'admin-user-identity__name';
    nameEl.textContent = name;
    wrap.appendChild(nameEl);
  }
  const lineEl = document.createElement('code');
  lineEl.className = 'admin-user-identity__line';
  lineEl.textContent = lineId;
  wrap.appendChild(lineEl);
  return wrap;
}

function setFormError(message) {
  const el = $('phenomenonError');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

function openEditor(row = null) {
  editingId = row?.id ?? null;
  pendingImageUrl = row?.imageUrl || '';
  $('phenomenonEditorTitle').textContent = row ? t('admin.phenomena.edit') : t('admin.phenomena.new');
  $('phenomenonForm').reset();
  $('f_title').value = row?.title || '';
  $('f_description').value = row?.description || '';
  $('f_category').value = row?.category || 'plant';
  $('f_status').value = row?.status || 'active';
  $('f_location').value = row?.location || '';
  $('f_observerName').value = row?.observerName || '';
  $('f_notes').value = row?.notes || '';
  $('f_imageAlt').value = row?.imageAlt || '';
  $('f_lat').value = row?.lat ?? '';
  $('f_lng').value = row?.lng ?? '';
  $('f_metaLabel').value = row?.metaLabel || '';
  $('imagePreview').src = pendingImageUrl || '';
  $('imagePreview').hidden = !pendingImageUrl;
  $('imagePath').textContent = pendingImageUrl || t('admin.form.imageNone');
  setFormError('');
  $('phenomenonEditor').hidden = false;
}

function closeEditor() {
  $('phenomenonEditor').hidden = true;
  editingId = null;
  pendingImageUrl = '';
  $('f_image').value = '';
}

function currentStatusFilter() {
  const active = document.querySelector('.admin-filters__btn.is-active');
  return active?.dataset.status || 'all';
}

async function deleteUser(row) {
  if (!confirm(t('admin.users.deleteConfirm', { email: formatUserLabel(row) }))) return;
  try {
    await api(`/api/admin/users/${row.id}`, { method: 'DELETE' });
    await loadUsers();
  } catch (err) {
    alert(err.message || t('admin.users.deleteFailed'));
  }
}

async function setUserRole(row, role) {
  const key =
    role === 'admin'
      ? 'admin.users.promoteConfirm'
      : 'admin.users.demoteConfirm';
  if (!confirm(t(key, { email: formatUserLabel(row) }))) return;
  try {
    await api(`/api/admin/users/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    await loadUsers();
  } catch (err) {
    alert(err.message || t('admin.users.roleFailed'));
  }
}

function setCreateUserError(message) {
  const el = $('createUserError');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

async function createUser(e) {
  e.preventDefault();
  setCreateUserError('');
  const email = $('u_email').value.trim();
  const password = $('u_password').value;
  const role = $('u_role').value;
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    });
    $('createUserForm').reset();
    $('u_role').value = 'user';
    await loadUsers();
  } catch (err) {
    setCreateUserError(err.message || t('admin.users.createFailed'));
  }
}

async function loadUsers() {
  const metaEl = $('adminUserMeta');
  const tbody = document.querySelector('#adminUsersTable tbody');
  const me = getCurrentUser();
  try {
    const { data } = await api('/api/admin/users');
    metaEl.textContent = t('admin.users.count', { count: data.length });
    tbody.replaceChildren(...data.map((row) => {
      const tr = document.createElement('tr');
      const email = document.createElement('td');
      email.appendChild(renderUserIdentity(row));
      const role = document.createElement('td');
      role.textContent = row.role === 'admin' ? t('admin.users.roleAdmin') : t('admin.users.roleUser');
      const verified = document.createElement('td');
      verified.textContent = row.emailVerifiedAt ? t('admin.users.yes') : t('admin.users.no');
      const created = document.createElement('td');
      created.textContent = formatWhen(row.createdAt);
      const actions = document.createElement('td');
      actions.className = 'admin-actions';
      if (me?.id === row.id) {
        actions.textContent = t('admin.users.you');
      } else {
        const roleBtn = document.createElement('button');
        roleBtn.type = 'button';
        roleBtn.className = 'admin-btn';
        if (row.role === 'admin') {
          roleBtn.textContent = t('admin.users.demote');
          roleBtn.addEventListener('click', () => setUserRole(row, 'user'));
        } else {
          roleBtn.textContent = t('admin.users.promote');
          roleBtn.addEventListener('click', () => setUserRole(row, 'admin'));
        }
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'admin-btn admin-btn--danger';
        delBtn.textContent = t('admin.action.delete');
        delBtn.addEventListener('click', () => deleteUser(row));
        actions.append(roleBtn, delBtn);
      }
      tr.append(email, role, verified, created, actions);
      return tr;
    }));
  } catch (err) {
    metaEl.textContent = err.message || t('admin.users.loadFailed');
  }
}

async function loadPhenomena() {
  const metaEl = $('phenomenaMeta');
  const tbody = document.querySelector('#phenomenaTable tbody');
  const status = currentStatusFilter();
  metaEl.textContent = t('admin.phenomena.loading');
  try {
    const qs = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
    const { data } = await api(`/api/admin/phenomena${qs}`);
    phenomenaCache = data;
    metaEl.textContent = t('admin.phenomena.count', { count: data.length });
    tbody.replaceChildren(...data.map((row) => {
      const tr = document.createElement('tr');
      const thumb = document.createElement('td');
      if (row.imageUrl) {
        const img = document.createElement('img');
        img.src = row.imageUrl;
        img.alt = row.imageAlt || '';
        img.className = 'admin-thumb';
        thumb.appendChild(img);
      } else {
        thumb.textContent = t('admin.emDash');
      }

      const title = document.createElement('td');
      title.textContent = row.title;

      const category = document.createElement('td');
      category.textContent = categoryLabel(row.category);

      const statusCell = document.createElement('td');
      statusCell.textContent = statusLabel(row.status);

      const actions = document.createElement('td');
      actions.className = 'admin-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'admin-btn';
      editBtn.textContent = t('admin.action.edit');
      editBtn.addEventListener('click', () => openEditor(row));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'admin-btn admin-btn--danger';
      delBtn.textContent = t('admin.action.delete');
      delBtn.addEventListener('click', () => deletePhenomenon(row));
      actions.append(editBtn, delBtn);

      tr.append(thumb, title, category, statusCell, actions);
      return tr;
    }));
  } catch (err) {
    metaEl.textContent = err.message || t('admin.phenomena.loadFailed');
  }
}

async function uploadImage(file) {
  const { data } = await api('/api/admin/uploads', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type || 'image/jpeg' }),
  });

  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': data.contentType },
    body: file,
  });
  if (!put.ok) {
    throw new Error(t('admin.form.uploadFailedStatus', { status: put.status }));
  }

  pendingImageUrl = data.publicPath;
  $('imagePreview').src = pendingImageUrl;
  $('imagePreview').hidden = false;
  $('imagePath').textContent = pendingImageUrl;
}

async function savePhenomenon(e) {
  e.preventDefault();
  setFormError('');

  const latRaw = $('f_lat').value.trim();
  const lngRaw = $('f_lng').value.trim();
  const payload = {
    title: $('f_title').value.trim(),
    description: $('f_description').value.trim(),
    category: $('f_category').value,
    status: $('f_status').value,
    location: $('f_location').value.trim() || undefined,
    observerName: $('f_observerName').value.trim() || undefined,
    notes: $('f_notes').value.trim() || undefined,
    imageAlt: $('f_imageAlt').value.trim() || undefined,
    metaLabel: $('f_metaLabel').value.trim() || undefined,
    imageUrl: pendingImageUrl || undefined,
  };

  if (latRaw) payload.lat = Number(latRaw);
  if (lngRaw) payload.lng = Number(lngRaw);

  try {
    if (editingId) {
      await api(`/api/admin/phenomena/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/api/admin/phenomena', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    closeEditor();
    await loadPhenomena();
  } catch (err) {
    setFormError(err.message || t('admin.form.saveFailed'));
  }
}

async function deletePhenomenon(row) {
  if (!confirm(t('admin.phenomena.deleteConfirm', { title: row.title }))) return;
  try {
    await api(`/api/admin/phenomena/${row.id}`, { method: 'DELETE' });
    await loadPhenomena();
  } catch (err) {
    alert(err.message || t('admin.phenomena.deleteFailed'));
  }
}

async function boot() {
  await i18nReady;

  let user;
  try {
    user = await refreshCurrentUser();
  } catch {
    location.href = '/login';
    return;
  }

  if (!user) {
    location.href = '/login';
    return;
  }
  if (user.role !== 'admin') {
    location.href = '/';
    return;
  }

  document.querySelectorAll('[data-auth-nav]').forEach(renderAuthNav);

  document.querySelectorAll('.admin-filters__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-filters__btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      loadPhenomena();
    });
  });

  $('btnNewPhenomenon').addEventListener('click', () => openEditor());
  $('btnCancelEditor').addEventListener('click', closeEditor);
  $('phenomenonForm').addEventListener('submit', savePhenomenon);
  $('createUserForm').addEventListener('submit', createUser);
  $('f_image').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFormError('');
      await uploadImage(file);
    } catch (err) {
      setFormError(err.message || t('admin.form.uploadFailed'));
    }
  });

  await Promise.all([loadUsers(), loadPhenomena()]);
}

boot();
