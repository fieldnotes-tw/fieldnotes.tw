const resolvedPosterCache = new Map();

export function videoPosterUrl(videoUrl) {
  if (!/\.(mp4|webm|mov)(\?|#|$)/i.test(String(videoUrl || ''))) return '';
  return String(videoUrl).replace(/\.(mp4|webm|mov)(?=($|[?#]))/i, '-poster.jpg');
}

export function seedPosterCache(videoUrl, src) {
  if (videoUrl && src) resolvedPosterCache.set(videoUrl, src);
}

/** Prefer transcoded .mp4 when the stored path is still .mov. */
export function resolvePlayableMediaUrl(url) {
  const s = String(url || '');
  if (/\.mov(?=($|[?#]))/i.test(s)) {
    return s.replace(/\.mov(?=($|[?#]))/i, '.mp4');
  }
  return s;
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

export async function capturePosterFromVideoUrl(url) {
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

function applyPosterToImage(img, src) {
  if (!src) return;
  img.src = src;
  img.removeAttribute('hidden');
}

function setPosterImage(img, posterUrl, videoUrl) {
  const cached = resolvedPosterCache.get(videoUrl);
  if (cached) {
    applyPosterToImage(img, cached);
    return;
  }

  let done = false;
  const finish = (src) => {
    if (done || !src) return;
    done = true;
    resolvedPosterCache.set(videoUrl, src);
    applyPosterToImage(img, src);
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

export function appendVideoThumbnail(parent, {
  videoUrl,
  posterUrl = '',
  className = '',
  alt = '',
  loading = 'lazy',
  inlinePlayback = false,
} = {}) {
  const serverPoster = posterUrl || videoPosterUrl(videoUrl);

  const img = document.createElement('img');
  img.className = className || 'photo-mosaic__img';
  img.alt = alt;
  img.loading = loading;
  img.draggable = false;
  img.dataset.videoUrl = videoUrl;

  setPosterImage(img, serverPoster, videoUrl);
  parent.appendChild(img);

  if (!inlinePlayback) return img;

  const video = document.createElement('video');
  video.className = `${className} detail__sighting-video`.trim();
  video.dataset.playbackUrl = videoUrl;
  video.src = resolvePlayableMediaUrl(videoUrl);
  video.hidden = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('playsinline', '');
  if (alt) video.setAttribute('aria-label', alt);
  parent.appendChild(video);

  return { img, video, media: img };
}
