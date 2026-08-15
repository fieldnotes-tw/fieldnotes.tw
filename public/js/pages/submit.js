const ZUOYING_CENTER = [22.688, 120.297];
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const ZUOYING_VIEWBOX = '120.24,22.62,120.35,22.74'; // west,south,east,north

let map = null;
let pin = null;
let searchTimer = null;
let photos = [];
let dragPhotoId = null;

function $(id) {
  return document.getElementById(id);
}

function setError(msg) {
  const el = $('submitError');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function setSearchOpen(open) {
  const input = $('f_location');
  const list = $('searchResults');
  list.hidden = !open || !list.children.length;
  input.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function formatPlaceName(item) {
  return item.display_name.split(',').slice(0, 3).join('，');
}

async function nominatim(path) {
  const res = await fetch(`${NOMINATIM}${path}`, {
    headers: { 'Accept-Language': typeof getLocale === 'function' ? getLocale() : 'zh-Hant' },
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return res.json();
}

function setLocationLabel(label) {
  if (label) $('f_location').value = label;
}

function setPin(lat, lng, label) {
  $('f_lat').value = lat;
  $('f_lng').value = lng;
  if (label) setLocationLabel(label);
  if (!map) return;
  if (pin) pin.remove();
  pin = L.marker([lat, lng], { draggable: true }).addTo(map);
  pin.on('dragend', async () => {
    const { lat: pLat, lng: pLng } = pin.getLatLng();
    $('f_lat').value = pLat;
    $('f_lng').value = pLng;
    try {
      const row = await nominatim(
        `/reverse?lat=${pLat}&lon=${pLng}&format=json&zoom=18`,
      );
      if (row?.display_name) setLocationLabel(formatPlaceName(row));
    } catch {
      // Keep whatever the user typed.
    }
  });
  map.setView([lat, lng], Math.max(map.getZoom(), 16));
}

function initMap() {
  map = L.map('submitMap', {
    scrollWheelZoom: true,
    zoomControl: true,
  }).setView(ZUOYING_CENTER, 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  map.on('click', (e) => {
    setPin(e.latlng.lat, e.latlng.lng);
    nominatim(`/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json&zoom=18`)
      .then((row) => {
        if (row?.display_name) setLocationLabel(formatPlaceName(row));
      })
      .catch(() => {});
  });

  requestAnimationFrame(() => {
    map.invalidateSize();
    setTimeout(() => map?.invalidateSize(), 200);
  });
}

function renderSearchResults(items) {
  const list = $('searchResults');
  list.replaceChildren();
  if (!items.length) {
    setSearchOpen(false);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'submit-form__search-item';
    btn.textContent = item.display_name;
    btn.addEventListener('click', () => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      setLocationLabel(formatPlaceName(item));
      setPin(lat, lng);
      setSearchOpen(false);
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
  setSearchOpen(true);
}

async function runSearch(q) {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    renderSearchResults([]);
    return;
  }
  try {
    const rows = await nominatim(
      `/search?q=${encodeURIComponent(trimmed)}&format=json&limit=6&viewbox=${ZUOYING_VIEWBOX}&bounded=0&countrycodes=tw`,
    );
    renderSearchResults(Array.isArray(rows) ? rows : []);
  } catch {
    renderSearchResults([]);
  }
}

function initSearch() {
  const input = $('f_location');
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(input.value), 350);
  });
  input.addEventListener('focus', () => {
    if ($('searchResults').children.length) setSearchOpen(true);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.submit-form__search')) setSearchOpen(false);
  });
}

function defaultSeenDate() {
  const input = $('f_seenDate');
  if (input.value) return;
  const today = new Date();
  input.value = today.toISOString().slice(0, 10);
}

function showSuccess() {
  $('submitForm').hidden = true;
  $('submitSuccess').hidden = false;
}

function syncStatusOther() {
  const wrap = $('statusOtherWrap');
  const input = $('f_statusOther');
  const checked = document.querySelector('input[name="status"]:checked');
  const isOther = checked?.value === 'other';
  wrap.hidden = !isOther;
  if (!isOther) input.value = '';
}

function initStatusOther() {
  $('statusGroup').addEventListener('change', syncStatusOther);
  syncStatusOther();
}

function setImageStatus(msg) {
  const el = $('imageStatus');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function photoSrc(photo) {
  return photo.url || photo.localUrl || '';
}

function revokePhotoPreview(photo) {
  if (photo.localUrl) {
    URL.revokeObjectURL(photo.localUrl);
    photo.localUrl = '';
  }
}

function clearPhotos() {
  photos.forEach(revokePhotoPreview);
  photos = [];
  renderPhotoList();
  $('f_image').value = '';
  setImageStatus('');
}

function movePhoto(id, delta) {
  const index = photos.findIndex((p) => p.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= photos.length) return;
  const [item] = photos.splice(index, 1);
  photos.splice(next, 0, item);
  renderPhotoList();
}

function removePhoto(id) {
  const index = photos.findIndex((p) => p.id === id);
  if (index < 0) return;
  revokePhotoPreview(photos[index]);
  photos.splice(index, 1);
  renderPhotoList();
}

function renderPhotoList() {
  const list = $('photoList');
  list.replaceChildren();

  photos.forEach((photo, index) => {
    const li = document.createElement('li');
    li.className = 'submit-form__photo-item';
    li.dataset.id = photo.id;

    const handle = document.createElement('span');
    handle.className = 'submit-form__photo-drag';
    handle.setAttribute('role', 'button');
    handle.setAttribute('tabindex', photo.uploading ? '-1' : '0');
    handle.setAttribute('aria-label', t('submit.photo.drag'));
    handle.textContent = '⋮⋮';
    if (!photo.uploading) handle.draggable = true;
    if (photo.uploading) handle.classList.add('is-disabled');

    const body = document.createElement('div');
    body.className = 'submit-form__photo-body';

    const frame = document.createElement('div');
    frame.className = 'submit-form__photo-frame';

    if (index === 0) {
      const cover = document.createElement('span');
      cover.className = 'submit-form__photo-cover';
      cover.textContent = t('submit.photo.cover');
      frame.appendChild(cover);
    }

    const img = document.createElement('img');
    img.className = 'submit-form__photo-img';
    img.src = photoSrc(photo);
    img.alt = '';
    img.draggable = false;
    frame.appendChild(img);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'submit-form__photo-remove';
    remove.setAttribute('aria-label', t('submit.photo.remove'));
    remove.innerHTML = '<span aria-hidden="true">×</span>';
    remove.disabled = photo.uploading;
    remove.addEventListener('click', () => removePhoto(photo.id));
    frame.appendChild(remove);

    body.appendChild(frame);

    if (photo.uploading) {
      const loading = document.createElement('span');
      loading.className = 'submit-form__photo-loading';
      loading.textContent = t('submit.photo.uploading');
      body.appendChild(loading);
    }

    const actions = document.createElement('div');
    actions.className = 'submit-form__photo-actions';

    const earlier = document.createElement('button');
    earlier.type = 'button';
    earlier.className = 'submit-form__photo-move';
    earlier.textContent = t('submit.photo.moveEarlier');
    earlier.disabled = index === 0 || photo.uploading;
    earlier.addEventListener('click', () => movePhoto(photo.id, -1));

    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'submit-form__photo-move';
    later.textContent = t('submit.photo.moveLater');
    later.disabled = index === photos.length - 1 || photo.uploading;
    later.addEventListener('click', () => movePhoto(photo.id, 1));

    actions.append(earlier, later);
    body.appendChild(actions);
    li.append(handle, body);

    handle.addEventListener('dragstart', (e) => {
      dragPhotoId = photo.id;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', photo.id);
      if (e.dataTransfer.setDragImage) {
        e.dataTransfer.setDragImage(li, 48, 40);
      }
    });
    handle.addEventListener('dragend', () => {
      dragPhotoId = null;
      li.classList.remove('is-dragging');
      list.querySelectorAll('.submit-form__photo-item').forEach((item) => {
        item.classList.remove('is-drop-target');
      });
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      li.classList.add('is-drop-target');
    });
    li.addEventListener('dragleave', (e) => {
      if (!li.contains(e.relatedTarget)) {
        li.classList.remove('is-drop-target');
      }
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('is-drop-target');
      const droppedId = e.dataTransfer.getData('text/plain') || dragPhotoId;
      if (!droppedId || droppedId === photo.id) return;
      const from = photos.findIndex((p) => p.id === droppedId);
      const to = photos.findIndex((p) => p.id === photo.id);
      if (from < 0 || to < 0) return;
      const [item] = photos.splice(from, 1);
      photos.splice(to, 0, item);
      dragPhotoId = null;
      renderPhotoList();
    });

    list.appendChild(li);
  });

  list.hidden = photos.length === 0;
  $('photoDragHint').hidden = photos.length < 2;
}

async function uploadImageFile(file) {
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
  if (!put.ok) {
    throw new Error(t('submit.error.uploadFailed'));
  }

  return data.publicPath;
}

async function addPhotoFile(file) {
  const photo = {
    id: crypto.randomUUID(),
    url: '',
    localUrl: URL.createObjectURL(file),
    uploading: true,
  };
  photos.push(photo);
  renderPhotoList();

  try {
    photo.url = await uploadImageFile(file);
    revokePhotoPreview(photo);
    photo.uploading = false;
    renderPhotoList();
  } catch (err) {
    removePhoto(photo.id);
    throw err;
  }
}

async function handleImagePick(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;

  setImageStatus(t('submit.photo.uploading'));
  try {
    for (const file of files) {
      await addPhotoFile(file);
    }
    setImageStatus('');
  } catch (err) {
    setImageStatus('');
    setError(err.message || t('submit.error.uploadFailed'));
  } finally {
    $('f_image').value = '';
  }
}

function initPhotoUpload() {
  $('f_image').addEventListener('change', (e) => {
    handleImagePick(e.target.files);
  });
  renderPhotoList();
}

function resetForm() {
  $('submitForm').reset();
  $('submitForm').hidden = false;
  $('submitSuccess').hidden = true;
  setError('');
  syncStatusOther();
  clearPhotos();
  if (pin) {
    pin.remove();
    pin = null;
  }
  $('f_lat').value = '';
  $('f_lng').value = '';
  defaultSeenDate();
  map?.setView(ZUOYING_CENTER, 14);
}

function validateForm() {
  if (!$('f_lat').value || !$('f_lng').value) {
    return t('submit.error.noLocation');
  }
  if (!document.querySelector('input[name="status"]:checked')) {
    return t('submit.error.noStatus');
  }
  const status = document.querySelector('input[name="status"]:checked').value;
  if (status === 'other' && !$('f_statusOther').value.trim()) {
    return t('submit.error.noStatusOther');
  }
  if (photos.some((p) => p.uploading)) {
    return t('submit.error.uploadInProgress');
  }
  return '';
}

async function handleSubmit(e) {
  e.preventDefault();
  setError('');

  const err = validateForm();
  if (err) {
    setError(err);
    return;
  }

  const btn = $('submitBtn');
  btn.disabled = true;

  const statusEl = document.querySelector('input[name="status"]:checked');
  const status = statusEl.value;
  const payload = {
    title: $('f_title').value.trim(),
    description: $('f_description').value.trim(),
    extra: $('f_extra').value.trim(),
    status: status === 'other' ? 'other' : status,
    statusLabel: status === 'other' ? $('f_statusOther').value.trim() : undefined,
    location: $('f_location').value.trim(),
    lat: Number($('f_lat').value),
    lng: Number($('f_lng').value),
    seenAt: $('f_seenDate').value,
    imageUrls: photos.map((p) => p.url).filter(Boolean),
  };

  try {
    // Review queue API coming soon — for now acknowledge locally.
    await new Promise((r) => setTimeout(r, 400));
    console.info('[submit] draft payload', payload);
    showSuccess();
  } catch (submitErr) {
    setError(submitErr.message || t('submit.error.failed'));
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

  if (typeof L === 'undefined') {
    setError(t('submit.error.mapLoad'));
    return;
  }

  initMap();
  initSearch();
  initStatusOther();
  initPhotoUpload();
  defaultSeenDate();
  $('submitForm').addEventListener('submit', handleSubmit);
  $('submitAgain').addEventListener('click', resetForm);
}

boot();
