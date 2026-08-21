let photos = [];
let phenomenonId = '';
let editSightingId = '';

function $(id) {
  return document.getElementById(id);
}

function params() {
  return new URLSearchParams(location.search);
}

function setError(msg) {
  const el = $('sightingError');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function defaultSeenAt() {
  if ($('f_commentOnly')?.checked) return;
  setDefaultSeenDateTime($('f_seenDate'), $('f_seenHour'), $('f_seenMinute'));
}

function isCommentOnly() {
  return Boolean($('f_commentOnly')?.checked);
}

function syncCommentOnlyMode() {
  const on = isCommentOnly();
  const fields = $('sightingWhenFields');
  if (fields) fields.hidden = on;
  ['f_seenDate', 'f_seenHour', 'f_seenMinute'].forEach((id) => {
    const el = $(id);
    if (el) el.required = !on;
  });
}

function resolveSeenAtIso() {
  if (isCommentOnly() || !$('f_seenDate').value) {
    return new Date().toISOString();
  }
  return seenDateTimeIso($('f_seenDate'), $('f_seenHour'), $('f_seenMinute'))
    || new Date().toISOString();
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

function removePhoto(id) {
  const index = photos.findIndex((p) => p.id === id);
  if (index < 0) return;
  revokePhotoPreview(photos[index]);
  photos.splice(index, 1);
  renderPhotoList();
}

function syncSubmitState() {
  const btn = $('sightingBtn');
  if (!btn || $('sightingForm')?.hidden) return;
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
    const frame = document.createElement('div');
    frame.className = 'submit-form__photo-frame';
    appendUploadPreview(frame, photo);
    bindUploadPreviewLightbox(frame, photo, photos, index);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'submit-form__photo-remove';
    remove.innerHTML = '<span aria-hidden="true">×</span>';
    remove.disabled = photo.uploading;
    remove.addEventListener('click', () => removePhoto(photo.id));
    frame.appendChild(remove);
    li.appendChild(frame);
    if (photo.uploading) {
      const loading = document.createElement('span');
      loading.className = 'submit-form__photo-loading';
      loading.textContent = t('submit.photo.uploading');
      li.appendChild(loading);
    }
    list.appendChild(li);
  });
  list.hidden = photos.length === 0;
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
    uploading: true,
    isVideo: isVideoUploadFile(file),
  };
  photos.push(photo);
  renderPhotoList();
  try {
    photo.url = await uploadImageFile(file);
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
    for (const file of files) await addPhotoFile(file);
    setImageStatus('');
  } catch (err) {
    setImageStatus('');
    setError(err.message || t('submit.error.uploadFailed'));
  } finally {
    $('f_image').value = '';
  }
}

function showSuccess() {
  $('sightingForm').hidden = true;
  $('sightingSuccess').hidden = false;
  if (phenomenonId) {
    $('sightingSuccessLink').href = `/?phenomenon=${encodeURIComponent(phenomenonId)}`;
  }
}

async function loadEditSighting(id) {
  const { data } = await api(`/api/sightings/${id}`);
  editSightingId = data.id;
  phenomenonId = data.phenomenonId;
  $('sightingTitle').textContent = t('sighting.form.editTitle');
  $('sightingContext').hidden = false;
  $('sightingContext').textContent = data.phenomenonTitle;
  $('f_note').value = data.note || '';
  setSeenDateTimeInputs($('f_seenDate'), $('f_seenHour'), $('f_seenMinute'), data.seenAt);
  clearPhotos();
  for (const url of data.imageUrls || []) {
    photos.push({ id: randomId(), url, localUrl: '', uploading: false });
  }
  renderPhotoList();
  $('sightingDeleteBtn').hidden = false;
}

async function loadPhenomenonContext(id) {
  const { data } = await api(`/api/phenomena/${id}`);
  phenomenonId = data.id;
  $('sightingContext').hidden = false;
  $('sightingContext').textContent = data.title;
}

function validateSightingForm() {
  if (!$('f_note').value.trim()) return t('sighting.error.noNote');
  if (!isCommentOnly() && $('f_seenDate').value) {
    const parsed = combineSeenDateTime(
      $('f_seenDate').value,
      $('f_seenHour').value,
      $('f_seenMinute').value,
    );
    if (!parsed) return t('sighting.error.noSeenAt');
  }
  return '';
}

function buildSightingPayload() {
  const payload = {
    note: $('f_note').value.trim(),
    imageUrls: photos.map((p) => p.url).filter(Boolean),
  };
  const seenAt = resolveSeenAtIso();
  if (seenAt) payload.seenAt = seenAt;
  return payload;
}

async function handleDelete() {
  if (!editSightingId) return;
  if (!confirm(t('sighting.form.confirmDelete'))) return;
  setError('');
  const btn = $('sightingDeleteBtn');
  btn.disabled = true;
  try {
    await api(`/api/sightings/${editSightingId}`, { method: 'DELETE' });
    location.href = phenomenonId ? `/?phenomenon=${encodeURIComponent(phenomenonId)}` : '/';
  } catch (err) {
    setError(err.message || t('submit.error.failed'));
    btn.disabled = false;
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  setError('');

  const validationErr = validateSightingForm();
  if (validationErr) {
    setError(validationErr);
    return;
  }

  if (photos.some((p) => p.uploading)) {
    setError(t('submit.error.uploadInProgress'));
    return;
  }
  if (photos.some((p) => !p.url)) {
    setError(t('submit.error.uploadFailed'));
    return;
  }

  const payload = buildSightingPayload();

  const btn = $('sightingBtn');
  btn.disabled = true;
  try {
    if (editSightingId) {
      await api(`/api/sightings/${editSightingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      await api(`/api/submissions/phenomena/${phenomenonId}/sightings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    showSuccess();
  } catch (err) {
    setError(err.message || t('submit.error.failed'));
    syncSubmitState();
  }
}

async function boot() {
  await i18nReady;
  if (!getCurrentUser()) {
    location.href = '/login';
    return;
  }

  const editId = params().get('edit');
  const phenomenonParam = params().get('phenomenon');

  try {
    if (editId) {
      await loadEditSighting(editId);
    } else if (phenomenonParam) {
      await loadPhenomenonContext(phenomenonParam);
    } else {
      setError(t('sighting.form.missingTarget'));
      $('sightingBtn').disabled = true;
    }
  } catch (err) {
    if (err.status === 403) {
      setError(t('sighting.error.forbidden'));
      $('sightingForm').hidden = true;
      $('sightingBtn').disabled = true;
      history.replaceState(null, '', '/sighting');
      return;
    }
    setError(err.message || t('submit.error.failed'));
    $('sightingBtn').disabled = true;
    return;
  }

  defaultSeenAt();
  syncCommentOnlyMode();
  $('f_commentOnly')?.addEventListener('change', syncCommentOnlyMode);
  $('f_image').addEventListener('change', (e) => handleImagePick(e.target.files));
  $('sightingForm').addEventListener('submit', handleSubmit);
  $('sightingDeleteBtn')?.addEventListener('click', handleDelete);
}

boot();
