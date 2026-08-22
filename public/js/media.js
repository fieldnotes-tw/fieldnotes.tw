function isVideoMediaUrl(url) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(url || ''));
}

function resolvePlayableMediaUrl(url) {
  const s = String(url || '');
  if (/\.mov(?=($|[?#]))/i.test(s)) {
    return s.replace(/\.mov(?=($|[?#]))/i, '.mp4');
  }
  return s;
}

function nextVideoSourceFallback(originalUrl, currentSrc) {
  const original = String(originalUrl || '');
  const current = String(currentSrc || '');
  if (/\.mov(?=($|[?#]))/i.test(original) && current !== original) return original;
  if (/\.mov(?=($|[?#]))/i.test(original) && current === original) {
    return original.replace(/\.mov(?=($|[?#]))/i, '.mp4');
  }
  return '';
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

function inferUploadContentType(file) {
  const raw = file?.type?.split(';')[0]?.trim().toLowerCase() || '';
  if (raw.startsWith('image/') || raw.startsWith('video/')) return raw;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

async function uploadMediaFile(file) {
  const contentType = inferUploadContentType(file);
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
    const publicPath = payload?.data?.publicPath || data.publicPath;
    const posterPath = payload?.data?.posterPath || videoPosterUrl(publicPath);
    return { url: publicPath, posterUrl: posterPath || '' };
  }
  const publicPath = data.publicPath;
  return { url: publicPath, posterUrl: videoPosterUrl(publicPath) };
}

function videoPosterUrl(url) {
  if (!/\.(mp4|webm|mov)(\?|#|$)/i.test(String(url || ''))) return '';
  return String(url).replace(/\.(mp4|webm|mov)(?=($|[?#]))/i, '-poster.jpg');
}

function captureVideoPosterDataUrl(video) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(video, 0, 0, width, height);
  try {
    return canvas.toDataURL('image/jpeg', 0.84);
  } catch {
    return '';
  }
}

function loadVideoForCapture(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');

    const cleanup = (fn) => {
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      cleanup(() => reject(new Error('video capture timeout')));
    }, 15000);

    video.addEventListener('error', () => {
      cleanup(() => reject(new Error('video load failed')));
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      try {
        const duration = video.duration;
        const target = Number.isFinite(duration) && duration > 0
          ? Math.min(0.5, Math.max(0.05, duration * 0.05))
          : 0;
        if (target <= 0 || Math.abs(video.currentTime - target) < 0.02) {
          cleanup(() => resolve(video));
          return;
        }
        video.addEventListener('seeked', () => {
          cleanup(() => resolve(video));
        }, { once: true });
        video.currentTime = target;
      } catch {
        cleanup(() => resolve(video));
      }
    }, { once: true });

    video.src = url;
    video.load();
  });
}

async function capturePosterFromVideoUrl(url) {
  if (!url) return '';
  let video;
  try {
    video = await loadVideoForCapture(url);
    const dataUrl = captureVideoPosterDataUrl(video);
    video.remove();
    return dataUrl;
  } catch {
    video?.remove();
    return '';
  }
}

function setPosterImage(img, posterUrl, videoUrl) {
  let done = false;
  const finish = (src) => {
    if (done || !src) return;
    done = true;
    img.src = src;
  };

  if (posterUrl) {
    const probe = new Image();
    probe.onload = () => finish(posterUrl);
    probe.onerror = () => {
      capturePosterFromVideoUrl(videoUrl).then(finish);
    };
    probe.src = posterUrl;
  } else {
    capturePosterFromVideoUrl(videoUrl).then(finish);
  }
}

async function primeVideoPoster(photo) {
  if (!photo.isVideo || photo.posterUrl) return '';
  if (!photo.localUrl) return '';
  photo.posterUrl = await capturePosterFromVideoUrl(photo.localUrl);
  return photo.posterUrl;
}

function appendUploadPreview(frame, photo) {
  const serverSrc = photo.url || '';
  const localSrc = photo.localUrl || '';
  const src = serverSrc || localSrc;
  frame.querySelector('.submit-form__photo-img, .submit-form__photo-video, .submit-form__photo-poster')?.remove();
  if (isVideoMediaUrl(src) || photo.isVideo) {
    const img = document.createElement('img');
    img.className = 'submit-form__photo-img submit-form__photo-poster';
    img.alt = '';
    img.draggable = false;
    const posterUrl = photo.posterUrl || videoPosterUrl(serverSrc);
    const fallbackVideoUrl = localSrc || serverSrc;
    if (posterUrl && posterUrl.startsWith('data:')) {
      img.src = posterUrl;
    } else {
      setPosterImage(img, posterUrl, fallbackVideoUrl);
    }
    frame.appendChild(img);
    return img;
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
let mediaLightboxCaptions = [];
let mediaLightboxIsVideo = [];
let mediaLightboxIndex = 0;
let mediaLightboxScrollLock = '';

function isVideoLightboxItem(index) {
  const url = mediaLightboxUrls[index] || '';
  return mediaLightboxIsVideo[index] || isVideoMediaUrl(url);
}

function prepareLightboxVideo(video) {
  video.controls = true;
  video.muted = false;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.controlsList = 'nodownload';
}

function setLightboxVideoSource(video, url) {
  prepareLightboxVideo(video);
  const originalUrl = String(url || '');
  const src = resolvePlayableMediaUrl(originalUrl);
  if (!mediaUrlMatches(video, src)) {
    video.pause();
    video.removeAttribute('src');
    video.src = src;
    video.load();
  }
  video.onerror = () => {
    const fallback = nextVideoSourceFallback(originalUrl, video.src);
    if (!fallback || mediaUrlMatches(video, fallback)) return;
    video.src = fallback;
    video.load();
    playLightboxVideo(video);
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
      <span class="photo-lightbox__counter" aria-hidden="true"></span>
      <p class="photo-lightbox__caption" hidden></p>
    </div>
  `;
  document.body.appendChild(lightbox);

  lightbox.querySelector('.photo-lightbox__close')?.setAttribute('aria-label', t('home.close'));
  lightbox.querySelector('.photo-lightbox__nav--prev')?.setAttribute('aria-label', t('home.detail.prevPhoto'));
  lightbox.querySelector('.photo-lightbox__nav--next')?.setAttribute('aria-label', t('home.detail.nextPhoto'));

  lightbox.querySelectorAll('[data-media-lightbox-close]').forEach((el) => {
    el.addEventListener('click', closeMediaLightbox);
  });
  lightbox.querySelector('.photo-lightbox__nav--prev')
    ?.addEventListener('click', () => stepMediaLightbox(-1));
  lightbox.querySelector('.photo-lightbox__nav--next')
    ?.addEventListener('click', () => stepMediaLightbox(1));
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
  const captionEl = lightbox.querySelector('.photo-lightbox__caption');
  const prev = lightbox.querySelector('.photo-lightbox__nav--prev');
  const next = lightbox.querySelector('.photo-lightbox__nav--next');
  const closeBtn = lightbox.querySelector('.photo-lightbox__close');
  const stage = lightbox.querySelector('.photo-lightbox__stage');
  closeBtn.setAttribute('aria-label', t('home.close'));
  prev.setAttribute('aria-label', t('home.detail.prevPhoto'));
  next.setAttribute('aria-label', t('home.detail.nextPhoto'));

  const url = mediaLightboxUrls[mediaLightboxIndex] || '';
  const caption = mediaLightboxCaptions[mediaLightboxIndex] || '';
  const isVideo = isVideoLightboxItem(mediaLightboxIndex);
  lightbox.classList.toggle('is-video-open', isVideo);
  lightbox.classList.toggle('has-caption', Boolean(caption));
  if (isVideo) {
    img.classList.remove('is-active');
    img.removeAttribute('src');
    video.classList.add('is-active');
    setLightboxVideoSource(video, url);
  } else {
    video.classList.remove('is-active');
    video.pause();
    video.removeAttribute('src');
    img.classList.add('is-active');
    img.src = url;
    img.alt = caption;
  }
  if (captionEl) {
    captionEl.textContent = caption;
    captionEl.hidden = !caption;
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

function normalizeMediaLightboxCaptions(urls, captions, index = 0) {
  if (Array.isArray(captions)) {
    return urls.map((_, i) => captions[i] || '');
  }
  if (typeof captions === 'string' && captions) {
    return urls.map((_, i) => (i === index ? captions : ''));
  }
  return urls.map(() => '');
}

function openMediaLightbox(urls, index = 0, captions = '', videoFlags = []) {
  if (!urls.length) return;
  mediaLightboxUrls = urls;
  mediaLightboxIndex = Math.max(0, Math.min(urls.length - 1, index));
  mediaLightboxCaptions = normalizeMediaLightboxCaptions(urls, captions, index);
  mediaLightboxIsVideo = videoFlags.length
    ? videoFlags.slice(0, urls.length)
    : urls.map((url) => isVideoMediaUrl(url));
  while (mediaLightboxIsVideo.length < urls.length) {
    mediaLightboxIsVideo.push(isVideoMediaUrl(urls[mediaLightboxIsVideo.length]));
  }
  const lightbox = ensureMediaLightbox();
  renderMediaLightbox();
  mediaLightboxScrollLock = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.classList.add('is-photo-lightbox-open');
  lightbox.hidden = false;
  lightbox.classList.add('is-open');
  lightbox.querySelector('.photo-lightbox__close')?.focus();
}

function closeMediaLightbox() {
  if (!mediaLightboxEl || mediaLightboxEl.hidden) return;
  mediaLightboxEl.querySelector('.photo-lightbox__video')?.pause();
  mediaLightboxEl.hidden = true;
  mediaLightboxEl.classList.remove('is-open', 'is-video-open');
  document.body.classList.remove('is-photo-lightbox-open');
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
    const captions = photos.map((p) => p.caption || '');
    const videoFlags = photos.map((p) => p.isVideo || isVideoMediaUrl(p.url || p.localUrl || ''));
    openMediaLightbox(urls, index, captions, videoFlags);
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

function appendPhotoCaptionField(body, photo) {
  const label = document.createElement('label');
  label.className = 'submit-form__photo-caption';
  const span = document.createElement('span');
  span.className = 'submit-form__photo-caption-label';
  span.textContent = t('submit.photo.caption');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'submit-form__photo-caption-input';
  input.maxLength = 500;
  input.placeholder = t('submit.photo.captionPlaceholder');
  input.value = photo.caption || '';
  input.disabled = photo.uploading;
  input.addEventListener('input', () => {
    photo.caption = input.value;
  });
  label.append(span, input);
  body.appendChild(label);
  return input;
}

function syncPhotoUploadLabel(count) {
  const label = document.querySelector('.submit-form__photo-upload .submit-form__photo-btn');
  if (!label) return;
  label.textContent = t(count > 0 ? 'submit.photo.uploadMore' : 'submit.photo.upload');
}

function formImagesPayload(photos) {
  return photos
    .filter((photo) => photo.url)
    .map((photo) => ({
      url: photo.url,
      caption: photo.caption?.trim() || undefined,
    }));
}

function normalizeLoadedFormImages(data) {
  if (Array.isArray(data?.images) && data.images.length) {
    return data.images.map((image) => ({
      url: image.url,
      caption: image.caption || '',
      isVideo: isVideoMediaUrl(image.url),
    }));
  }
  const urls = Array.isArray(data?.imageUrls) && data.imageUrls.length
    ? data.imageUrls
    : data?.imageUrl
      ? [data.imageUrl]
      : [];
  return urls.map((url) => ({
    url,
    caption: '',
    isVideo: isVideoMediaUrl(url),
  }));
}
