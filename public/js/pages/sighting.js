let photos = [];
let phenomenonId = '';
let editSightingId = '';
let editSpotId = '';
let phenomenonSpots = [];
let phenomenonCategory = 'plant';
let selectedSpotId = '';
let spotChoiceMode = 'existing';
let otherSpotMap = null;

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
  setDefaultSeenDateTime($('f_seenDate'), $('f_seenTime'));
}

function isCommentOnly() {
  return Boolean($('f_commentOnly')?.checked);
}

function syncOtherSpotExistingPins() {
  otherSpotMap?.setExistingSpots?.(phenomenonSpots, phenomenonCategory);
}

function ensureOtherSpotMap() {
  if (otherSpotMap || typeof createSubmitLocationMap !== 'function') {
    syncOtherSpotExistingPins();
    return otherSpotMap;
  }
  otherSpotMap = createSubmitLocationMap({
    mapElId: 'otherSpotMap',
    locationInputId: 'f_otherSpotLocation',
    latInputId: 'f_otherSpotLat',
    lngInputId: 'f_otherSpotLng',
    hintElId: 'otherSpotMapHint',
    resultsElId: 'otherSpotSearchResults',
    searchWrapSelector: '.sighting-form__other-spot-search',
    mapWrapSelector: '#otherSpotMapWrap',
  });
  otherSpotMap.init();
  syncOtherSpotExistingPins();
  return otherSpotMap;
}

function syncCommentOnlyMode() {
  const on = isCommentOnly();
  const spotSection = $('sightingSpotSection');
  const whenSection = $('sightingWhenSection');
  if (spotSection) {
    spotSection.hidden = on;
    spotSection.classList.toggle('is-collapsed', on);
  }
  if (whenSection) {
    whenSection.hidden = on;
    whenSection.classList.toggle('is-collapsed', on);
  }
  ['f_seenDate', 'f_seenTime'].forEach((id) => {
    const el = $(id);
    if (el) el.required = !on;
  });
  if (!on) syncSpotChoiceMode();
}

function syncSpotChoiceMode() {
  if (isCommentOnly()) return;

  const otherField = $('otherSpotField');
  const otherSelected = spotChoiceMode === 'other';
  if (otherField) otherField.hidden = !otherSelected;

  if (otherSelected) {
    requestAnimationFrame(() => ensureOtherSpotMap()?.invalidateSize());
  } else {
    otherSpotMap?.clearPin();
  }
}

function resolveSeenAtIso() {
  if (isCommentOnly() || !$('f_seenDate').value) {
    return new Date().toISOString();
  }
  return seenDateTimeIso($('f_seenDate'), $('f_seenTime'))
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
    li.className = 'submit-form__photo-item submit-form__photo-item--simple';
    if (photo.uploading) li.classList.add('is-uploading');

    const body = document.createElement('div');
    body.className = 'submit-form__photo-body';

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
    body.appendChild(frame);
    appendPhotoCaptionField(body, photo);

    if (photo.uploading) {
      const loading = document.createElement('span');
      loading.className = 'submit-form__photo-loading';
      loading.textContent = t('submit.photo.uploading');
      body.appendChild(loading);
    }

    li.appendChild(body);
    list.appendChild(li);
  });
  list.hidden = photos.length === 0;
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
    for (const file of files) await addPhotoFile(file);
    setImageStatus('');
  } catch (err) {
    setImageStatus('');
    setError(err.message || t('submit.error.uploadFailed'));
  } finally {
    $('f_image').value = '';
  }
}

function redirectToPhenomenonDetail(targetPhenomenonId, spotId) {
  if (!targetPhenomenonId) {
    location.href = '/';
    return;
  }
  sessionStorage.setItem('fieldnotes.refreshPhenomenon', targetPhenomenonId);
  const qs = new URLSearchParams({ phenomenon: targetPhenomenonId });
  if (spotId) qs.set('spot', spotId);
  location.href = `/?${qs.toString()}`;
}

function resolveSubmittedSpotId(payload, response) {
  if (payload.spotId) return payload.spotId;
  const latest = response?.data?.recentSightings?.[0];
  return latest?.spotId || '';
}

async function loadEditSighting(id) {
  const { data } = await api(`/api/sightings/${id}`);
  editSightingId = data.id;
  editSpotId = data.spotId || '';
  phenomenonId = data.phenomenonId;
  $('sightingTitle').textContent = t('sighting.form.editTitle');
  $('sightingContext').hidden = false;
  $('sightingContext').textContent = data.phenomenonTitle;
  $('sightingCommentOnlySection').hidden = true;
  $('f_note').value = data.note || '';
  setSeenDateTimeInputs($('f_seenDate'), $('f_seenTime'), data.seenAt);
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
  $('sightingDeleteBtn').hidden = false;
  $('sightingSpotSection').hidden = true;
}

function renderSpotChoices() {
  const wrap = $('spotChoices');
  const section = $('sightingSpotSection');
  if (!wrap || !section) return;

  wrap.replaceChildren();
  if (isCommentOnly()) {
    section.hidden = true;
    section.classList.add('is-collapsed');
    return;
  }

  section.hidden = false;
  section.classList.remove('is-collapsed');

  if (!phenomenonSpots.length) {
    spotChoiceMode = 'other';
    selectedSpotId = '';
  }

  phenomenonSpots.forEach((spot) => {
    const label = document.createElement('label');
    label.className = 'sighting-form__spot-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'spotChoice';
    input.value = spot.id;
    input.checked = spotChoiceMode === 'existing' && selectedSpotId === spot.id;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      spotChoiceMode = 'existing';
      selectedSpotId = spot.id;
      syncSpotChoiceMode();
    });
    const text = document.createElement('span');
    text.textContent = spot.label || spot.name;
    label.append(input, text);
    wrap.appendChild(label);
  });

  const otherLabel = document.createElement('label');
  otherLabel.className = 'sighting-form__spot-option';
  const otherInput = document.createElement('input');
  otherInput.type = 'radio';
  otherInput.name = 'spotChoice';
  otherInput.value = 'other';
  otherInput.checked = spotChoiceMode === 'other';
  otherInput.addEventListener('change', () => {
    if (!otherInput.checked) return;
    spotChoiceMode = 'other';
    syncSpotChoiceMode();
  });
  const otherText = document.createElement('span');
  otherText.textContent = t('sighting.form.otherSpot');
  otherLabel.append(otherInput, otherText);
  wrap.appendChild(otherLabel);

  syncSpotChoiceMode();
}

async function loadPhenomenonContext(id, preferredSpotId = '') {
  const { data } = await api(`/api/phenomena/${id}`);
  phenomenonId = data.id;
  phenomenonSpots = data.spots || [];
  phenomenonCategory = data.category || 'plant';
  selectedSpotId = preferredSpotId
    || params().get('spot')
    || phenomenonSpots[0]?.id
    || '';
  spotChoiceMode = 'existing';
  $('sightingContext').hidden = false;
  $('sightingContext').textContent = data.title;
  renderSpotChoices();
  syncOtherSpotExistingPins();
  syncCommentOnlyMode();
}

function validateSightingForm() {
  if (!$('f_note').value.trim()) return t('sighting.error.noNote');

  if (!isCommentOnly()) {
    if (spotChoiceMode === 'other') {
      const map = ensureOtherSpotMap();
      if (!map?.getCoords()) return t('submit.error.noLocation');
      if (!map.getLocationLabel()) return t('sighting.error.noOtherSpot');
    } else if (phenomenonSpots.length && !selectedSpotId) {
      return t('sighting.error.noSpot');
    }

    if ($('f_seenDate').value) {
      const parsed = combineSeenDateTime(
        $('f_seenDate').value,
        $('f_seenTime').value,
      );
      if (!parsed) return t('sighting.error.noSeenAt');
    }
  }

  return '';
}

function buildSightingPayload() {
  const payload = {
    note: $('f_note').value.trim(),
    images: formImagesPayload(photos),
  };
  const seenAt = resolveSeenAtIso();
  if (seenAt) payload.seenAt = seenAt;

  if (!isCommentOnly()) {
    if (spotChoiceMode === 'other') {
      const map = ensureOtherSpotMap();
      const coords = map?.getCoords();
      payload.otherSpot = {
        name: map?.getLocationLabel() || '',
        lat: coords?.lat,
        lng: coords?.lng,
      };
    } else if (selectedSpotId) {
      payload.spotId = selectedSpotId;
    }
  } else {
    payload.commentOnly = true;
  }

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
    redirectToPhenomenonDetail(phenomenonId, editSpotId);
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
    let spotId = '';
    if (editSightingId) {
      await api(`/api/sightings/${editSightingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      spotId = editSpotId;
    } else {
      const result = await api(`/api/submissions/phenomena/${phenomenonId}/sightings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      spotId = resolveSubmittedSpotId(payload, result);
    }
    redirectToPhenomenonDetail(phenomenonId, spotId);
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
  preventSubmitFormEnterSubmit($('sightingForm'), {
    searchInputId: 'f_otherSpotLocation',
    onSearchEnter: () => otherSpotMap?.selectFirstSearchResult?.(),
  });
  $('sightingForm').addEventListener('submit', handleSubmit);
  $('sightingDeleteBtn')?.addEventListener('click', handleDelete);
}

boot();
