const CATEGORY_LABELS = {
  animal: '動物',
  plant: '植物',
  sky: '天文地景',
  taste: '當季滋味',
  workshop: '工作坊',
};

const STATUS_LABELS = {
  active: '正在發生',
  upcoming: '即將到來',
  ending: '即將結束',
  ended: '已結束',
};

let phenomenaCache = [];
let editingId = null;
let pendingImageUrl = '';

function $(id) {
  return document.getElementById(id);
}

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
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
  $('phenomenonEditorTitle').textContent = row ? '編輯現象' : '新增現象';
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
  $('imagePath').textContent = pendingImageUrl || '尚未上傳';
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
  if (!confirm(`確定刪除使用者「${row.email}」？`)) return;
  try {
    const res = await fetch(`/api/admin/users/${row.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok && res.status !== 204) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    await loadUsers();
  } catch (err) {
    alert(err.message || '刪除失敗');
  }
}

async function loadUsers() {
  const metaEl = $('adminUserMeta');
  const tbody = document.querySelector('#adminUsersTable tbody');
  const me = getCurrentUser();
  try {
    const { data } = await api('/api/admin/users');
    metaEl.textContent = `共 ${data.length} 位使用者`;
    tbody.replaceChildren(...data.map((row) => {
      const tr = document.createElement('tr');
      const email = document.createElement('td');
      email.textContent = row.email;
      const role = document.createElement('td');
      role.textContent = row.role === 'admin' ? '管理員' : '一般使用者';
      const verified = document.createElement('td');
      verified.textContent = row.emailVerifiedAt ? '是' : '否';
      const created = document.createElement('td');
      created.textContent = formatWhen(row.createdAt);
      const actions = document.createElement('td');
      actions.className = 'admin-actions';
      if (me?.id === row.id) {
        actions.textContent = '（你）';
      } else {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'admin-btn admin-btn--danger';
        delBtn.textContent = '刪除';
        delBtn.addEventListener('click', () => deleteUser(row));
        actions.appendChild(delBtn);
      }
      tr.append(email, role, verified, created, actions);
      return tr;
    }));
  } catch (err) {
    metaEl.textContent = err.message || '無法載入使用者列表';
  }
}

async function loadPhenomena() {
  const metaEl = $('phenomenaMeta');
  const tbody = document.querySelector('#phenomenaTable tbody');
  const status = currentStatusFilter();
  metaEl.textContent = '載入中…';
  try {
    const qs = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
    const { data } = await api(`/api/admin/phenomena${qs}`);
    phenomenaCache = data;
    metaEl.textContent = `共 ${data.length} 筆`;
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
        thumb.textContent = '—';
      }

      const title = document.createElement('td');
      title.textContent = row.title;

      const category = document.createElement('td');
      category.textContent = CATEGORY_LABELS[row.category] || row.category;

      const statusCell = document.createElement('td');
      statusCell.textContent = STATUS_LABELS[row.status] || row.status;

      const actions = document.createElement('td');
      actions.className = 'admin-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'admin-btn';
      editBtn.textContent = '編輯';
      editBtn.addEventListener('click', () => openEditor(row));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'admin-btn admin-btn--danger';
      delBtn.textContent = '刪除';
      delBtn.addEventListener('click', () => deletePhenomenon(row));
      actions.append(editBtn, delBtn);

      tr.append(thumb, title, category, statusCell, actions);
      return tr;
    }));
  } catch (err) {
    metaEl.textContent = err.message || '無法載入現象';
  }
}

async function uploadImage(file) {
  const { data } = await api('/api/admin/uploads', {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type || 'image/jpeg' }),
  });

  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': data.contentType },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
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
    setFormError(err.message || '儲存失敗');
  }
}

async function deletePhenomenon(row) {
  if (!confirm(`確定刪除「${row.title}」？`)) return;
  try {
    const res = await fetch(`/api/admin/phenomena/${row.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok && res.status !== 204) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    await loadPhenomena();
  } catch (err) {
    alert(err.message || '刪除失敗');
  }
}

async function boot() {
  let user;
  try {
    user = await refreshCurrentUser();
  } catch {
    location.href = 'login.html';
    return;
  }

  if (!user) {
    location.href = 'login.html';
    return;
  }
  if (user.role !== 'admin') {
    location.href = 'index.html';
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
  $('f_image').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFormError('');
      await uploadImage(file);
    } catch (err) {
      setFormError(err.message || '圖片上傳失敗');
    }
  });

  await Promise.all([loadUsers(), loadPhenomena()]);
}

boot();
