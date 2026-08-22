const ZUOYING_CENTER = [22.688, 120.297];
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const ZUOYING_VIEWBOX = '120.24,22.62,120.35,22.74'; // west,south,east,north
const DESCRIPTION_MAX = 120;

let map = null;
let pin = null;
let searchTimer = null;
let placedLabel = '';
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
  if (label) {
    $('f_location').value = label;
    placedLabel = label;
  }
}

function clearPinPosition() {
  if (pin) {
    pin.remove();
    pin = null;
  }
  $('f_lat').value = '';
  $('f_lng').value = '';
  syncMapPinState();
}

const submitPinIcon = () => L.divIcon({
  html: '<span class="map-pin map-pin--submit" aria-hidden="true"></span>',
  className: 'map-pin-wrapper',
  iconSize: [26, 34],
  iconAnchor: [13, 34],
});

function syncMapPinState() {
  const wrap = document.querySelector('.submit-form__map-wrap');
  const hint = $('submitMapHint');
  if (!wrap) return;
  const hasPin = Boolean($('f_lat').value && $('f_lng').value);
  wrap.classList.toggle('submit-form__map-wrap--unpinned', !hasPin);
  if (hint) {
    hint.textContent = t(hasPin ? 'submit.where.mapHintPlaced' : 'submit.where.mapHintEmpty');
  }
}

function setPin(lat, lng, label) {
  $('f_lat').value = lat;
  $('f_lng').value = lng;
  if (label) setLocationLabel(label);
  if (!map) {
    syncMapPinState();
    return;
  }
  if (pin) pin.remove();
  pin = L.marker([lat, lng], { draggable: true, icon: submitPinIcon() }).addTo(map);
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
  syncMapPinState();
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
  syncMapPinState();
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

async function selectFirstSearchResult() {
  const input = $('f_location');
  const list = $('searchResults');
  const firstBtn = list?.querySelector('.submit-form__search-item');
  if (firstBtn && list && !list.hidden) {
    firstBtn.click();
    return;
  }

  clearTimeout(searchTimer);
  const trimmed = input.value.trim();
  if (trimmed.length < 2) return;

  try {
    const rows = await nominatim(
      `/search?q=${encodeURIComponent(trimmed)}&format=json&limit=6&viewbox=${ZUOYING_VIEWBOX}&bounded=0&countrycodes=tw`,
    );
    const items = Array.isArray(rows) ? rows : [];
    if (items.length) {
      const lat = Number(items[0].lat);
      const lng = Number(items[0].lon);
      setLocationLabel(formatPlaceName(items[0]));
      setPin(lat, lng);
      renderSearchResults(items);
      setSearchOpen(false);
    } else {
      renderSearchResults([]);
    }
  } catch {
    renderSearchResults([]);
  }
}

function initSearch() {
  const input = $('f_location');
  input.addEventListener('input', () => {
    if (input.value.trim() !== placedLabel.trim()) {
      placedLabel = '';
      clearPinPosition();
    }
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
  setDefaultSeenDateTime($('f_seenDate'), $('f_seenHour'), $('f_seenMinute'));
}

function showSuccess(phenomenonId) {
  $('submitForm').hidden = true;
  $('submitSuccess').hidden = false;
  const viewLink = $('submitSuccessView');
  if (viewLink) {
    if (phenomenonId) {
      viewLink.href = `/?phenomenon=${encodeURIComponent(phenomenonId)}`;
      viewLink.hidden = false;
    } else {
      viewLink.hidden = true;
    }
  }
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

function syncSubmitState() {
  const btn = $('submitBtn');
  if (!btn || $('submitForm')?.hidden) return;
  const uploading = photos.some((p) => p.uploading);
  btn.disabled = uploading;
  btn.setAttribute('aria-busy', uploading ? 'true' : 'false');
}

function renderPhotoList() {
  const list = $('photoList');
  list.replaceChildren();

  photos.forEach((photo, index) => {
    const li = document.createElement('li');
    li.className = 'submit-form__photo-item';
    if (photo.uploading) li.classList.add('is-uploading');
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

    appendUploadPreview(frame, photo);
    bindUploadPreviewLightbox(frame, photo, photos, index);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'submit-form__photo-remove';
    remove.setAttribute('aria-label', t('submit.photo.remove'));
    remove.innerHTML = '<span aria-hidden="true">×</span>';
    remove.disabled = photo.uploading;
    remove.addEventListener('click', () => removePhoto(photo.id));
    frame.appendChild(remove);

    body.appendChild(frame);

    appendPhotoCaptionField(body, photo);

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
  syncPhotoUploadLabel(photos.length);
  syncSubmitState();
}

async function uploadImageFile(file) {
  return uploadMediaFile(file);
}

async function addPhotoFile(file) {
  const photo = {
    id: randomId(),
    url: '',
    localUrl: URL.createObjectURL(file),
    posterUrl: '',
    uploading: true,
    isVideo: isVideoUploadFile(file),
    caption: '',
  };
  photos.push(photo);
  renderPhotoList();
  if (photo.isVideo) {
    primeVideoPoster(photo).then(() => renderPhotoList());
  }

  try {
    const uploaded = await uploadImageFile(file);
    photo.url = uploaded.url;
    photo.posterUrl = uploaded.posterUrl || photo.posterUrl || videoPosterUrl(uploaded.url);
    photo.uploading = false;
    if (!photo.isVideo) revokePhotoPreview(photo);
    renderPhotoList();
  } catch (err) {
    removePhoto(photo.id);
    throw err;
  }
}

async function handleImagePick(fileList) {
  const files = Array.from(fileList || []).filter(isUploadMediaFile);
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

function syncRichPreviews() {
  $('f_extra')?.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSubmitFormTitle(key) {
  const title = $('submitPageTitle');
  if (title) title.textContent = t(key);
}

function setSubmitPrimaryLabel(key) {
  const btn = $('submitBtn');
  if (btn) btn.textContent = t(key);
}

function setSubmitDeleteVisible(visible) {
  const btn = $('submitDeleteBtn');
  if (btn) btn.hidden = !visible;
}

function resetForm() {
  editId = '';
  $('submitForm').reset();
  $('submitForm').hidden = false;
  $('submitSuccess').hidden = true;
  const viewLink = $('submitSuccessView');
  if (viewLink) viewLink.hidden = true;
  setSubmitFormTitle('submit.title');
  setSubmitPrimaryLabel('submit.send');
  setSubmitDeleteVisible(false);
  setError('');
  clearPhotos();
  if (pin) {
    pin.remove();
    pin = null;
  }
  placedLabel = '';
  $('f_lat').value = '';
  $('f_lng').value = '';
  defaultSeenDate();
  syncRichPreviews();
  map?.setView(ZUOYING_CENTER, 14);
  syncMapPinState();
}

function initDescriptionCounter() {
  const field = $('f_description');
  const counter = $('descriptionCounter');
  if (!field || !counter) return;
  const sync = () => {
    const count = field.value.length;
    counter.textContent = t('submit.description.counter', { count, max: DESCRIPTION_MAX });
    counter.classList.toggle('is-over', count > DESCRIPTION_MAX);
  };
  field.addEventListener('input', sync);
  sync();
}

function validateForm() {
  if (!$('f_title').value.trim()) {
    return t('submit.error.noTitle');
  }
  if (!$('f_description').value.trim()) {
    return t('submit.error.noDescription');
  }
  if (!combineSeenDateTime($('f_seenDate').value, $('f_seenHour').value, $('f_seenMinute').value)) {
    return t('submit.error.noSeenDate');
  }
  if (!$('f_lat').value || !$('f_lng').value) {
    return t('submit.error.noLocation');
  }
  if (photos.some((p) => p.uploading)) {
    return t('submit.error.uploadInProgress');
  }
  if (photos.some((p) => !p.url)) {
    return t('submit.error.uploadFailed');
  }
  if ($('f_description').value.trim().length > DESCRIPTION_MAX) {
    return t('submit.error.descriptionTooLong');
  }
  return '';
}

async function handleDelete() {
  if (!editId) return;
  const title = $('f_title').value.trim() || t('submit.editTitle');
  if (!confirm(t('submit.confirmDelete', { title }))) return;

  const btn = $('submitDeleteBtn');
  btn.disabled = true;
  setError('');

  try {
    await api(`/api/submissions/phenomena/${editId}`, { method: 'DELETE' });
    location.href = '/';
  } catch (err) {
    setError(err.message || t('submit.error.deleteFailed'));
    btn.disabled = false;
  }
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

  const payload = {
    title: $('f_title').value.trim(),
    description: $('f_description').value.trim(),
    extra: $('f_extra').value.trim(),
    findingHint: $('f_finding').value.trim(),
    location: $('f_location').value.trim(),
    lat: Number($('f_lat').value),
    lng: Number($('f_lng').value),
    seenAt: seenDateTimeIso($('f_seenDate'), $('f_seenHour'), $('f_seenMinute')),
    images: formImagesPayload(photos),
  };

  try {
    let phenomenonId = editId || '';
    if (editId) {
      await api(`/api/submissions/phenomena/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: payload.title,
          description: payload.description,
          notes: payload.extra || undefined,
          findingHint: payload.findingHint || undefined,
          location: payload.location,
          lat: payload.lat,
          lng: payload.lng,
          images: payload.images,
          lastNoticedAt: payload.seenAt,
        }),
      });
    } else {
      const result = await api('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          extra: payload.extra || undefined,
          findingHint: payload.findingHint || undefined,
        }),
      });
      phenomenonId = result?.data?.id || '';
    }
    showSuccess(phenomenonId);
  } catch (submitErr) {
    setError(submitErr.message || t('submit.error.failed'));
    syncSubmitState();
  }
}

let editId = '';

async function loadEditPhenomenon(id) {
  const { data } = await api(`/api/submissions/phenomena/${id}`);
  editId = id;
  $('f_title').value = data.title;
  $('f_description').value = data.description;
  $('f_extra').value = data.notes || '';
  $('f_finding').value = data.findingHint || '';
  $('f_location').value = data.location || '';
  if (data.lat != null && data.lng != null) setPin(data.lat, data.lng);
  if (data.lastNoticedAt) {
    setSeenDateTimeInputs($('f_seenDate'), $('f_seenHour'), $('f_seenMinute'), data.lastNoticedAt);
  }
  clearPhotos();
  for (const item of normalizeLoadedFormImages(data)) {
    photos.push({
      id: randomId(),
      url: item.url,
      caption: item.caption,
      localUrl: '',
      uploading: false,
      isVideo: item.isVideo || isVideoMediaUrl(item.url),
    });
  }
  renderPhotoList();
  setSubmitFormTitle('submit.editTitle');
  setSubmitPrimaryLabel('submit.save');
  setSubmitDeleteVisible(true);
  syncRichPreviews();
}

async function boot() {
  await i18nReady;

  try {
    await refreshCurrentUser();
  } catch {
    // Keep cached session if /me is unreachable.
  }

  if (!getCurrentUser()) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    location.href = `/login?next=${next}`;
    return;
  }

  if (typeof L === 'undefined') {
    setError(t('submit.error.mapLoad'));
  } else {
    initMap();
  }
  initSearch();
  initPhotoUpload();
  defaultSeenDate();
  mountRichField($('f_extra'), $('extraPreview'));
  initDescriptionCounter();
  $('submitForm').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (e.target.id === 'f_location') selectFirstSearchResult();
  });
  $('submitForm').addEventListener('submit', handleSubmit);
  $('submitDeleteBtn')?.addEventListener('click', handleDelete);
  $('submitAgain').addEventListener('click', resetForm);

  const params = new URLSearchParams(location.search);
  const editParam = params.get('edit');
  if (editParam) {
    try {
      await loadEditPhenomenon(editParam);
    } catch (err) {
      if (err.status === 403) {
        setError(t('submit.error.forbidden'));
        history.replaceState(null, '', '/submit');
        return;
      }
      setError(err.message || t('submit.error.failed'));
    }
  }
}

boot();
