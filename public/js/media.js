function isVideoMediaUrl(url) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(url || ''));
}

function resolvePlayableMediaUrl(url) {
  return String(url || '').replace(/\.mov(?=($|[?#]))/i, '.mp4');
}

function mediaUrlMatches(video, url) {
  if (!url) return Boolean(video.src);
  try {
    return new URL(url, location.origin).href === video.src;
  } catch {
    return video.src.endsWith(url);
  }
}

function playLightboxVideo(video) {
  const tryPlay = () => video.play().catch(() => {});
  if (video.readyState >= 2) tryPlay();
  else video.addEventListener('loadeddata', tryPlay, { once: true });
}

function isUploadMediaFile(file) {
  const type = file?.type || '';
  return type.startsWith('image/') || type.startsWith('video/');
}

function isVideoUploadFile(file) {
  return (file?.type || '').startsWith('video/');
}

async function uploadMediaFile(file) {
  const contentType = file.type || 'image/jpeg';
  const { data } = await api('/api/submissions/uploads', {
    method: 'POST',
    body: JSON.stringify({ contentType }),
  });
  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': data.contentType },
    body: file,
  });
  if (!put.ok) throw new Error(t('submit.error.uploadFailed'));
  if (data.backend === 'local') {
    const payload = await put.json().catch(() => null);
    if (payload?.data?.publicPath) return payload.data.publicPath;
  }
  return data.publicPath;
}

function prepareVideoPreview(video, { fallbackSrc = '' } = {}) {
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.addEventListener('loadedmetadata', () => {
    try {
      if (video.duration > 0) {
        video.currentTime = Math.min(0.05, video.duration * 0.01);
      }
    } catch {
      /* noop */
    }
  }, { once: true });
  if (fallbackSrc) {
    video.addEventListener('error', () => {
      if (video.src !== fallbackSrc) video.src = fallbackSrc;
    }, { once: true });
  }
}

function appendUploadPreview(frame, photo) {
  const serverSrc = photo.url || '';
  const localSrc = photo.localUrl || '';
  const src = serverSrc || localSrc;
  frame.querySelector('.submit-form__photo-img, .submit-form__photo-video')?.remove();
  if (isVideoMediaUrl(src) || photo.isVideo) {
    const video = document.createElement('video');
    video.className = 'submit-form__photo-video';
    video.src = src;
    prepareVideoPreview(video, {
      fallbackSrc: serverSrc && localSrc && serverSrc !== localSrc ? localSrc : '',
    });
    frame.appendChild(video);
    return video;
  }
  const img = document.createElement('img');
  img.className = 'submit-form__photo-img';
  img.src = src;
  img.alt = '';
  img.draggable = false;
  frame.appendChild(img);
  return img;
}

let mediaLightboxEl = null;
let mediaLightboxUrls = [];
let mediaLightboxIndex = 0;
let mediaLightboxScrollLock = '';

function requestVideoFullscreen(video) {
  if (!video) return;
  if (video.requestFullscreen) {
    video.requestFullscreen().catch(() => {});
    return;
  }
  if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen();
    return;
  }
  if (video.webkitRequestFullscreen) {
    video.webkitRequestFullscreen();
  }
}

function prepareLightboxVideo(video) {
  video.controls = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.controlsList = 'nodownload';
}

function setLightboxVideoSource(video, url) {
  prepareLightboxVideo(video);
  const src = resolvePlayableMediaUrl(url);
  if (!mediaUrlMatches(video, src)) {
    video.pause();
    video.removeAttribute('src');
    video.src = src;
    video.load();
  }
  video.onerror = () => {
    if (/\.mov(?=($|[?#]))/i.test(url) && !mediaUrlMatches(video, url)) {
      video.src = url;
      video.load();
    }
  };
  playLightboxVideo(video);
}

function ensureMediaLightbox() {
  if (mediaLightboxEl) return mediaLightboxEl;

  const lightbox = document.createElement('div');
  lightbox.className = 'photo-lightbox';
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <div class="photo-lightbox__backdrop" data-media-lightbox-close></div>
    <div class="photo-lightbox__stage" role="dialog" aria-modal="true">
      <button type="button" class="photo-lightbox__close" data-media-lightbox-close aria-label="">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="photo-lightbox__nav photo-lightbox__nav--prev" aria-label="">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M14 6 L8 12 L14 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      </button>
      <img class="photo-lightbox__img" alt="">
      <button type="button" class="photo-lightbox__nav photo-lightbox__nav--next" aria-label="">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M10 6 L16 12 L10 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
      </button>
      <button type="button" class="photo-lightbox__fullscreen" data-media-lightbox-fullscreen aria-label="" hidden>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="photo-lightbox__fullscreen-label"></span>
      </button>
      <span class="photo-lightbox__counter" aria-hidden="true"></span>
    </div>
  `;
  document.body.appendChild(lightbox);

  lightbox.querySelector('.photo-lightbox__close')?.setAttribute('aria-label', t('home.close'));
  lightbox.querySelector('.photo-lightbox__nav--prev')?.setAttribute('aria-label', t('home.detail.prevPhoto'));
  lightbox.querySelector('.photo-lightbox__nav--next')?.setAttribute('aria-label', t('home.detail.nextPhoto'));
  const fsLabelInit = lightbox.querySelector('.photo-lightbox__fullscreen-label');
  if (fsLabelInit) fsLabelInit.textContent = t('home.detail.fullscreen');
  lightbox.querySelector('[data-media-lightbox-fullscreen]')?.setAttribute('aria-label', t('home.detail.fullscreen'));

  lightbox.querySelectorAll('[data-media-lightbox-close]').forEach((el) => {
    el.addEventListener('click', closeMediaLightbox);
  });
  lightbox.querySelector('.photo-lightbox__nav--prev')
    ?.addEventListener('click', () => stepMediaLightbox(-1));
  lightbox.querySelector('.photo-lightbox__nav--next')
    ?.addEventListener('click', () => stepMediaLightbox(1));
  lightbox.querySelector('[data-media-lightbox-fullscreen]')
    ?.addEventListener('click', () => {
      requestVideoFullscreen(lightbox.querySelector('.photo-lightbox__video'));
    });
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox.querySelector('.photo-lightbox__stage')) closeMediaLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (!mediaLightboxEl || mediaLightboxEl.hidden) return;
    if (e.key === 'Escape') closeMediaLightbox();
    if (e.key === 'ArrowLeft') stepMediaLightbox(-1);
    if (e.key === 'ArrowRight') stepMediaLightbox(1);
  });

  mediaLightboxEl = lightbox;
  return lightbox;
}

function renderMediaLightbox() {
  const lightbox = ensureMediaLightbox();
  const img = lightbox.querySelector('.photo-lightbox__img');
  let video = lightbox.querySelector('.photo-lightbox__video');
  if (!video) {
    video = document.createElement('video');
    video.className = 'photo-lightbox__video';
    img.insertAdjacentElement('afterend', video);
  }

  const counter = lightbox.querySelector('.photo-lightbox__counter');
  const prev = lightbox.querySelector('.photo-lightbox__nav--prev');
  const next = lightbox.querySelector('.photo-lightbox__nav--next');
  const fullscreen = lightbox.querySelector('[data-media-lightbox-fullscreen]');
  const closeBtn = lightbox.querySelector('.photo-lightbox__close');
  const stage = lightbox.querySelector('.photo-lightbox__stage');
  closeBtn.setAttribute('aria-label', t('home.close'));
  prev.setAttribute('aria-label', t('home.detail.prevPhoto'));
  next.setAttribute('aria-label', t('home.detail.nextPhoto'));
  const fsLabel = lightbox.querySelector('.photo-lightbox__fullscreen-label');
  if (fsLabel) fsLabel.textContent = t('home.detail.fullscreen');
  fullscreen?.setAttribute('aria-label', t('home.detail.fullscreen'));

  const url = mediaLightboxUrls[mediaLightboxIndex] || '';
  if (isVideoMediaUrl(url)) {
    img.classList.remove('is-active');
    img.removeAttribute('src');
    video.classList.add('is-active');
    setLightboxVideoSource(video, url);
    fullscreen.hidden = false;
  } else {
    video.classList.remove('is-active');
    video.pause();
    video.removeAttribute('src');
    img.classList.add('is-active');
    img.src = url;
    img.alt = '';
    fullscreen.hidden = true;
  }
  stage.setAttribute('aria-label', t('home.detail.photoLightbox'));

  const multi = mediaLightboxUrls.length > 1;
  prev.hidden = !multi;
  next.hidden = !multi;
  counter.hidden = !multi;
  if (multi) {
    counter.textContent = `${mediaLightboxIndex + 1} / ${mediaLightboxUrls.length}`;
    prev.disabled = mediaLightboxIndex === 0;
    next.disabled = mediaLightboxIndex === mediaLightboxUrls.length - 1;
  }
}

function openMediaLightbox(urls, index = 0) {
  if (!urls.length) return;
  mediaLightboxUrls = urls;
  mediaLightboxIndex = Math.max(0, Math.min(urls.length - 1, index));
  const lightbox = ensureMediaLightbox();
  renderMediaLightbox();
  mediaLightboxScrollLock = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  lightbox.hidden = false;
  lightbox.classList.add('is-open');
  lightbox.querySelector('.photo-lightbox__close')?.focus();
}

function closeMediaLightbox() {
  if (!mediaLightboxEl || mediaLightboxEl.hidden) return;
  mediaLightboxEl.querySelector('.photo-lightbox__video')?.pause();
  mediaLightboxEl.hidden = true;
  mediaLightboxEl.classList.remove('is-open');
  document.body.style.overflow = mediaLightboxScrollLock;
  mediaLightboxScrollLock = '';
}

function stepMediaLightbox(delta) {
  if (mediaLightboxUrls.length <= 1) return;
  mediaLightboxIndex = Math.max(0, Math.min(mediaLightboxUrls.length - 1, mediaLightboxIndex + delta));
  renderMediaLightbox();
}

function bindUploadPreviewLightbox(frame, photo, photos, index) {
  const src = photo.url || photo.localUrl || '';
  const isVideo = photo.isVideo || isVideoMediaUrl(src);
  frame.classList.toggle('is-video-preview', isVideo);

  if (!src || photo.uploading) {
    frame.classList.remove('is-previewable');
    frame.removeAttribute('role');
    frame.removeAttribute('tabindex');
    frame.removeAttribute('aria-label');
    return;
  }

  const open = () => {
    const urls = photos.map((p) => p.url || p.localUrl).filter(Boolean);
    if (!urls.length) return;
    openMediaLightbox(urls, index);
  };

  frame.classList.add('is-previewable');
  frame.setAttribute('role', 'button');
  frame.setAttribute('tabindex', '0');
  frame.setAttribute('aria-label', isVideo ? t('submit.photo.openVideo') : t('submit.photo.openPreview'));
  frame.addEventListener('click', (e) => {
    if (e.target.closest('.submit-form__photo-remove')) return;
    open();
  });
  frame.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
}
