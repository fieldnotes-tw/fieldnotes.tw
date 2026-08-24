import {
  appendVideoThumbnail,
  resolvePlayableMediaUrl,
  seedPosterCache,
  videoPosterUrl,
} from './video-preview.js';

const feedStage = document.getElementById('feedStage');
const feedLayoutHost = document.getElementById('feedLayoutHost');
const mapRail = document.getElementById('mapRail');
const mapRailList = document.getElementById('mapRailList');
const gridFeed = document.getElementById('gridFeed');

function bootstrapFeedLocale() {
  const match = document.cookie.match(/(?:^|; )fn_locale=([^;]*)/);
  if (match) {
    const value = decodeURIComponent(match[1]).trim().toLowerCase().replace(/_/g, '-');
    if (value === 'en' || value.startsWith('en-')) return 'en';
    if (value === 'zh-hant' || value === 'zh-tw' || value === 'zh-hk' || value === 'zh') return 'zh-Hant';
  }
  const lang = (document.documentElement.lang || '').trim().toLowerCase().replace(/_/g, '-');
  if (lang.startsWith('en')) return 'en';
  if (lang === 'zh-hant' || lang === 'zh-tw' || lang === 'zh-hk' || lang === 'zh') return 'zh-Hant';
  for (const tag of (navigator.languages || [navigator.language]).filter(Boolean)) {
    const value = String(tag).trim().toLowerCase().replace(/_/g, '-');
    if (value === 'en' || value.startsWith('en-')) return 'en';
    if (value === 'zh-hant' || value === 'zh-tw' || value === 'zh-hk' || value === 'zh') return 'zh-Hant';
  }
  return 'zh-Hant';
}

const phenomenaFetchPromise = (() => {
  const existing = window.__phenomenaPrefetch;
  if (existing) {
    delete window.__phenomenaPrefetch;
    return existing;
  }
  return fetch('/api/phenomena', {
    headers: { 'Accept-Language': bootstrapFeedLocale() },
    credentials: 'same-origin',
    priority: 'high',
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
})();
const feedDetailPane = document.getElementById('feedDetailPane');
const feedDetailBody = document.getElementById('feedDetailBody');
const feedDetailHeader = document.getElementById('feedDetailHeader');
const feedDetailHeaderTitle = document.getElementById('feedDetailHeaderTitle');
const feedDetailMenuBtn = document.getElementById('feedDetailMenuBtn');
const feedDetailMenuPanel = document.getElementById('feedDetailMenuPanel');
const feedDetailMenuList = document.getElementById('feedDetailMenuList');
const feedDetailHeaderClose = document.getElementById('feedDetailHeaderClose');
const feedDetailRailBtn = document.getElementById('feedDetailRailBtn');
const mapView = document.getElementById('mapView');
const mapSheet = document.getElementById('mapSheet');
const mapSheetBody = document.getElementById('mapSheetBody');
const mapSheetClose = document.getElementById('mapSheetClose');
const mapSheetHeader = document.getElementById('mapSheetHeader');
const mapSheetBack = document.getElementById('mapSheetBack');
const mapSheetBackLabel = document.getElementById('mapSheetBackLabel');
const mapSheetHandle = document.getElementById('mapSheetHandle');
const mapSheetPeekNav = document.getElementById('mapSheetPeekNav');
const mapSheetPeekPrev = document.getElementById('mapSheetPeekPrev');
const mapSheetPeekNext = document.getElementById('mapSheetPeekNext');
const mapSheetPinDots = document.getElementById('mapSheetPinDots');
const mapSheetPinCounter = document.getElementById('mapSheetPinCounter');
const cardModal = document.getElementById('cardModal');
const cardModalBody = document.getElementById('cardModalBody');
const cardModalClose = document.getElementById('cardModalClose');
const cardModalBackdrop = document.getElementById('cardModalBackdrop');

let cards = [];
const phenomenonCache = new Map();
let focusedCard = null;
let highlightedCard = null;
let detailAdvanceLock = false;
let detailAdvanceTimer = 0;
let detailScrollRaf = 0;
let mapCenterTimer = 0;
let mapPanTimer = 0;
let mapSheetGestureMoved = false;
let mapLayoutTimer = 0;
let detailLoopHeight = 0;
let detailScrollRoot = null;
const selectedCats = new Set();
const TABLET_SPLIT_MQ = window.matchMedia('(min-width: 760px)');
const DESKTOP_SPLIT_MQ = window.matchMedia('(min-width: 1200px)');

function prefersSplitDetail() {
  return TABLET_SPLIT_MQ.matches;
}

function prefersMapRail() {
  return DESKTOP_SPLIT_MQ.matches;
}

function isPhoneLayout() {
  return !TABLET_SPLIT_MQ.matches;
}

function usesSheetDetail() {
  return !DESKTOP_SPLIT_MQ.matches;
}

// Kaohsiung (高雄) — placeholder until a Google Maps API key replaces this OSM view.
const ZUOYING_CENTER = [22.688, 120.297];
let leafletMap = null;
const markerRefs = [];

function statusLabel(status) {
  return t(`status.${status}`) || t('status.active');
}

function applyFilters() {
  const catActive = selectedCats.size > 0;
  const query = keywordQuery.trim().toLowerCase();
  cards.forEach((c) => {
    const catOk = !catActive || cardCategories(c).some((cat) => selectedCats.has(cat));
    const kwOk = !query || cardMatchesKeyword(c, query);
    c.classList.toggle('is-filtered-out', !catOk || !kwOk);
  });
  markerRefs.forEach(({ marker, card }) => {
    const show = !card.classList.contains('is-filtered-out');
    if (!leafletMap) return;
    if (show && !leafletMap.hasLayer(marker)) marker.addTo(leafletMap);
    if (!show && leafletMap.hasLayer(marker)) marker.remove();
  });
  syncMapRail();

  if (feedStage.classList.contains('is-map-view') && !mapView.classList.contains('is-hidden')) {
    fitMapToVisiblePins();
  }

  const sheetOpen = usesSheetDetail() && mapSheet.classList.contains('is-open');
  const focusedHidden = focusedCard?.classList.contains('is-filtered-out');
  if (feedStage.classList.contains('is-detail-open')) {
    remountOpenDetail();
  } else if (sheetOpen && focusedHidden) {
    remountOpenDetail();
  } else if (sheetOpen && !focusedCard && getVisibleCards().length) {
    remountOpenDetail();
  }
}

function resolveLocationText(item) {
  return item?.locationSummary || item?.location || '';
}

function cardMatchesKeyword(card, query) {
  const item = getItemForCard(card);
  const parts = [
    item.title,
    item.description,
    resolveLocationText(item),
    item.location,
    item.notes,
    ...itemCategories(item).map(categoryLabel),
    card.querySelector('.card__title')?.textContent,
    card.querySelector('.card__desc')?.textContent,
  ];
  return parts.filter(Boolean).join(' ').toLowerCase().includes(query);
}

function remountOpenDetail() {
  const keep = focusedCard && !focusedCard.classList.contains('is-filtered-out')
    ? focusedCard
    : getVisibleCards()[0];
  if (feedStage.classList.contains('is-detail-open')) {
    void ensurePhenomenonDetail(keep?.dataset.id).then((item) => {
      mountSplitDetail(keep, item ?? getItemForCard(keep));
      if (keep) syncFocusedFromDetailScroll(keep);
      renderFeedDetailMenu();
    });
  } else if (usesSheetDetail() && mapSheet.classList.contains('is-open') && keep) {
    if (mapSheet.classList.contains('is-expanded')) {
      void ensurePhenomenonDetail(keep.dataset.id).then((item) => {
        mountMapSheetDetail(keep, item ?? getItemForCard(keep));
        setFocusedCard(keep);
        const entry = findMarkerEntry(keep);
        if (entry) setActiveMapPin(entry.marker);
      });
    } else {
      mountMapSheetPeek(keep);
      setFocusedCard(keep);
      const entry = findMarkerEntry(keep);
      if (entry) setActiveMapPin(entry.marker);
    }
    updateMapSheetPeekNav();
  }
}

function updateDetailHeaderTitle(card) {
  if (!feedDetailHeaderTitle) return;
  feedDetailHeaderTitle.textContent = card?.querySelector('.card__title')?.textContent || '';
  updateFeedDetailMenuActive();
}

function setFeedDetailMenuOpen(open) {
  if (!feedDetailMenuPanel || !feedDetailMenuBtn) return;
  feedDetailMenuPanel.hidden = !open;
  feedDetailMenuBtn.classList.toggle('is-open', open);
  feedDetailMenuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function updateFeedDetailMenuActive() {
  if (!feedDetailMenuList) return;
  feedDetailMenuList.querySelectorAll('.feed-detail__menu-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.id === focusedCard?.dataset.id);
    item.setAttribute('aria-selected', item.dataset.id === focusedCard?.dataset.id ? 'true' : 'false');
  });
}

function renderFeedDetailMenu() {
  if (!feedDetailMenuList) return;
  feedDetailMenuList.replaceChildren();
  getVisibleCards().forEach((card) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'feed-detail__menu-item';
    item.dataset.id = card.dataset.id;
    item.setAttribute('role', 'option');
    item.textContent = card.querySelector('.card__title')?.textContent || '';
    if (card === focusedCard) item.classList.add('is-active');
    item.setAttribute('aria-selected', card === focusedCard ? 'true' : 'false');
    item.addEventListener('click', () => {
      if (prefersMapRail()) {
        void ensurePhenomenonDetail(card.dataset.id).then((item) => {
          mountSplitDetail(card, item ?? getItemForCard(card));
          syncFocusedFromDetailScroll(card);
          setFeedDetailMenuOpen(false);
        });
        return;
      }
      scrollDetailToCard(card);
      syncFocusedFromDetailScroll(card);
      setFeedDetailMenuOpen(false);
    });
    feedDetailMenuList.appendChild(item);
  });
}

const catToggles = document.querySelectorAll('.cat-toggle');
function bindCatToggle(el) {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const cat = el.dataset.cat;
    const nowSelected = !selectedCats.has(cat);
    if (nowSelected) selectedCats.add(cat); else selectedCats.delete(cat);
    document.querySelectorAll(`.cat-toggle[data-cat="${cat}"]`).forEach((match) => {
      match.classList.toggle('is-selected', nowSelected);
      if (match.hasAttribute('aria-pressed')) match.setAttribute('aria-pressed', nowSelected);
    });
    applyFilters();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });
}
catToggles.forEach(bindCatToggle);

const feedFilterBtn = document.getElementById('feedFilterBtn');
const feedFilterPanel = document.getElementById('feedFilterPanel');
const feedSearchBtn = document.getElementById('feedSearchBtn');
const feedSearchPanel = document.getElementById('feedSearchPanel');
const feedSearchInput = document.getElementById('feedSearchInput');
let keywordQuery = '';
let mapSearchLock = false;
let mapViewSnapshot = null;
const floatingLangBtn = document.getElementById('floatingLangBtn');
const floatingLangPanel = document.getElementById('floatingLangPanel');
function updateFeedStickyTop() {
  let stickyTop = 16;
  if (floatingbar?.classList.contains('is-visible')) {
    stickyTop = Math.max(stickyTop, floatingbar.getBoundingClientRect().bottom + 8);
  }
  document.documentElement.style.setProperty('--feed-sticky-top', `${stickyTop}px`);
}

function syncMobileMapViewLayout() {
  const inMobileMap = isPhoneLayout() && feedStage.classList.contains('is-map-view');
  document.body.classList.toggle('is-mobile-map-view', inMobileMap);
  if (!inMobileMap) {
    document.documentElement.style.removeProperty('--map-controls-top');
    return;
  }
  const controlsTop = sitehead ? sitehead.getBoundingClientRect().bottom : 0;
  document.documentElement.style.setProperty('--map-controls-top', `${Math.max(0, controlsTop)}px`);
}
function isFeedToolbarPanelOpen() {
  return Boolean(
    (feedSearchPanel && !feedSearchPanel.hidden)
    || (feedFilterPanel && !feedFilterPanel.hidden),
  );
}

function shouldDeferMapLayoutSync() {
  return mapSearchLock
    || isFeedToolbarPanelOpen()
    || document.activeElement === feedSearchInput;
}

function lockMapViewForSearch() {
  if (!leafletMap || mapView.classList.contains('is-hidden')) return;
  mapSearchLock = true;
  mapViewSnapshot = {
    center: leafletMap.getCenter(),
    zoom: leafletMap.getZoom(),
  };
}

function unlockMapViewForSearch({ sync = true } = {}) {
  if (!mapSearchLock) return;
  mapSearchLock = false;
  if (leafletMap && mapViewSnapshot && !mapView.classList.contains('is-hidden')) {
    const { center, zoom } = mapViewSnapshot;
    if (leafletMap.getZoom() !== zoom) {
      leafletMap.setView(center, zoom, { animate: false });
    }
  }
  mapViewSnapshot = null;
  if (sync) syncMapLayoutOnly();
}

function syncMapLayoutOnly() {
  if (!leafletMap || mapView.classList.contains('is-hidden') || shouldDeferMapLayoutSync()) return;
  requestAnimationFrame(() => {
    leafletMap.invalidateSize({ animate: false });
  });
}

function setFeedSearchOpen(open) {
  if (!feedSearchBtn || !feedSearchPanel) return;
  if (open) {
    setFeedFilterOpen(false);
    setFloatingLangOpen(false);
    window.closeAllLangPanels?.();
  }
  feedSearchPanel.hidden = !open;
  feedSearchBtn.classList.toggle('is-open', open);
  feedSearchBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    if (!mapView.classList.contains('is-hidden')) lockMapViewForSearch();
    requestAnimationFrame(() => feedSearchInput?.focus({ preventScroll: true }));
  } else if (!mapView.classList.contains('is-hidden')) {
    unlockMapViewForSearch();
  }
}
function setFeedFilterOpen(open) {
  if (!feedFilterBtn || !feedFilterPanel) return;
  if (open) setFeedSearchOpen(false);
  if (open) setFloatingLangOpen(false);
  feedFilterPanel.hidden = !open;
  feedFilterBtn.classList.toggle('is-open', open);
  feedFilterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function setFloatingLangOpen(open) {
  if (!floatingLangBtn || !floatingLangPanel) return;
  if (open) {
    setFeedSearchOpen(false);
    setFeedFilterOpen(false);
    window.closeAllLangPanels?.();
  }
  floatingLangPanel.hidden = !open;
  floatingLangBtn.classList.toggle('is-open', open);
  floatingLangBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  updateFeedStickyTop();
}
function closeFloatingPanels() {
  setFeedSearchOpen(false);
  setFeedFilterOpen(false);
  setFloatingLangOpen(false);
}
window.closeFeedFilter = () => setFeedFilterOpen(false);
window.closeFeedSearch = () => setFeedSearchOpen(false);
feedSearchBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setFeedSearchOpen(feedSearchPanel.hidden);
});
feedSearchInput?.addEventListener('focus', () => {
  if (!mapView.classList.contains('is-hidden')) lockMapViewForSearch();
});
feedSearchInput?.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (isFeedToolbarPanelOpen()) return;
    unlockMapViewForSearch();
  }, 80);
});
feedSearchInput?.addEventListener('input', () => {
  keywordQuery = feedSearchInput.value;
  applyFilters();
});
feedSearchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    feedSearchInput.value = '';
    keywordQuery = '';
    applyFilters();
    setFeedSearchOpen(false);
  }
});
feedFilterBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setFeedFilterOpen(feedFilterPanel.hidden);
});
floatingLangBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setFloatingLangOpen(floatingLangPanel.hidden);
});
document.querySelectorAll('.floatingbar__lang-option').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const locale = btn.dataset.locale;
    setFloatingLangOpen(false);
    if (locale && locale !== getLocale()) setLocale(locale);
  });
});
function syncFloatingLangOptions() {
  const locale = getLocale();
  document.querySelectorAll('.floatingbar__lang-option').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.locale === locale);
  });
}

function getAboutBirdBubbles() {
  const bubbles = [];
  for (let i = 0; i < 12; i++) {
    const key = `home.about.birdBubble.${i}`;
    const text = t(key);
    if (text === key) break;
    bubbles.push(text);
  }
  return bubbles;
}

function initAboutBird() {
  const bubble = document.getElementById('aboutBirdBubble');
  const btn = document.getElementById('aboutBirdBtn');
  if (!bubble || !btn) return;

  const bubbles = getAboutBirdBubbles();
  if (bubbles.length < 2) return;

  let index = 0;
  btn.addEventListener('click', () => {
    index = (index + 1) % bubbles.length;
    bubble.classList.add('is-changing');
    window.setTimeout(() => {
      bubble.textContent = bubbles[index];
      bubble.classList.remove('is-changing');
    }, 120);
  });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.feed-toolbar__search-panel') || e.target.closest('.feed-toolbar__search-btn')) return;
  if (e.target.closest('.feed-toolbar__filter-panel') || e.target.closest('.feed-toolbar__filter-btn')) return;
  if (e.target.closest('.floatingbar__lang-panel') || e.target.closest('.floatingbar__lang-btn')) return;
  const panelOpen = (feedSearchPanel && !feedSearchPanel.hidden)
    || (feedFilterPanel && !feedFilterPanel.hidden)
    || (floatingLangPanel && !floatingLangPanel.hidden);
  if (panelOpen) closeFloatingPanels();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFloatingPanels();
});

function formatToday() {
  const todayEl = document.getElementById('todayDate');
  if (!todayEl) return;
  const locale = getLocale() === 'en' ? 'en-US' : 'zh-TW';
  const d = new Date();
  const parts = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  todayEl.textContent = t('home.date', {
    month: get('month'),
    day: get('day'),
    weekday: get('weekday'),
  });
}

function weatherTextForCode(code) {
  return t(`weather.${code}`) || '';
}

async function loadWeather() {
  const weatherEl = document.getElementById('weatherText');
  if (!weatherEl) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('/api/weather', {
      signal: controller.signal,
      headers: {
        'Accept-Language': typeof getLocale === 'function' ? getLocale() : 'zh-Hant',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const data = payload?.data;
    if (!data || typeof data.temperature !== 'number' || typeof data.weatherCode !== 'number') {
      throw new Error('Invalid weather payload');
    }
    await i18nReady;
    const temp = Math.round(data.temperature);
    const desc = weatherTextForCode(data.weatherCode);
    weatherEl.textContent = t('home.weatherLine', { temp, desc });
    weatherEl.title = t('home.weatherLine', { temp, desc });
  } catch {
    await i18nReady;
    weatherEl.textContent = t('home.weatherUnavailable');
    weatherEl.removeAttribute('title');
  } finally {
    clearTimeout(timer);
  }
}

function observerInitial(name) {
  if (!name) return '?';
  return Array.from(name)[0];
}

function isVideoMediaUrl(url) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(url || ''));
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

function appendMediaPreview(parent, url, { alt = '', loading = 'lazy', className = '' } = {}) {
  if (isVideoMediaUrl(url)) {
    const inlinePlayback = className === 'detail__sighting-media';
    const result = appendVideoThumbnail(parent, {
      videoUrl: url,
      posterUrl: videoPosterUrl(url),
      className: className || 'photo-mosaic__video',
      alt,
      loading,
      inlinePlayback,
    });
    return inlinePlayback ? result.media : result;
  }
  const img = document.createElement('img');
  img.className = className || 'photo-mosaic__img';
  img.src = url;
  img.alt = alt;
  img.loading = loading;
  img.draggable = false;
  parent.appendChild(img);
  return img;
}

function memberProfileUrl(userId) {
  return userId ? `/members/${encodeURIComponent(userId)}` : null;
}

function buildMemberAvatar({ userId, name, avatarUrl, category }, { className = 'detail__member-avatar' } = {}) {
  const shell = document.createElement(userId ? 'a' : 'span');
  if (userId) {
    shell.href = memberProfileUrl(userId);
    shell.className = 'detail__member-avatar-link';
  }
  const avatar = document.createElement('span');
  avatar.className = `avatar ${className}`;
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    img.className = 'detail__member-avatar-img';
    avatar.appendChild(img);
  } else {
    avatar.dataset.cat = category || 'plant';
    avatar.textContent = observerInitial(name);
  }
  shell.appendChild(avatar);
  return shell;
}

function buildMemberName({ userId, name, className = 'detail__sighting-name' }) {
  const label = name || t('home.detail.anonymousObserver');
  if (!userId) {
    const el = document.createElement('strong');
    el.className = className;
    el.textContent = label;
    return el;
  }
  const link = document.createElement('a');
  link.className = `${className} detail__member-link`;
  link.href = memberProfileUrl(userId);
  link.textContent = label;
  return link;
}

function categoryLabel(category) {
  return t(`category.${category}`) || category;
}

function itemCategories(item) {
  if (item?.categories?.length) return item.categories;
  return item?.category ? [item.category] : [];
}

function cardCategories(card) {
  const raw = card.dataset.categories;
  if (raw) return raw.split(',').filter(Boolean);
  return card.dataset.category ? [card.dataset.category] : [];
}

function cachePhenomena(items) {
  items.forEach((item) => phenomenonCache.set(item.id, item));
}

function getItemForCard(card) {
  return phenomenonCache.get(card.dataset.id) ?? cardToFallbackItem(card);
}

function seedVideoPosterCacheFromCard(card) {
  if (!card) return;
  card.querySelectorAll('.card__photo img[data-video-url]').forEach((img) => {
    const videoUrl = img.dataset.videoUrl;
    if (videoUrl && img.src && !img.hidden && img.complete && img.naturalWidth > 0) {
      seedPosterCache(videoUrl, img.src);
    }
  });
}

function cardToFallbackItem(card) {
  return {
    id: card.dataset.id,
    status: card.dataset.status,
    category: card.dataset.category,
    categories: cardCategories(card),
    title: card.querySelector('.card__title')?.textContent || '',
    description: card.querySelector('.card__desc')?.textContent || '',
    location: card.dataset.location || '',
    locationSummary: card.dataset.locationSummary || card.dataset.location || '',
    notes: card.dataset.notes || '',
    findingHint: card.dataset.findingHint || '',
    userId: card.dataset.userId || null,
    lat: card.dataset.lat ? parseFloat(card.dataset.lat) : null,
    lng: card.dataset.lng ? parseFloat(card.dataset.lng) : null,
    imageAlt: card.querySelector('.card__photo img')?.alt || '',
    imageUrl: card.querySelector('.card__photo img')?.src || null,
    observerName: card.querySelector('.card__observer span:last-child')?.textContent || null,
    creatorName: card.dataset.creatorName || null,
    creatorAvatarUrl: card.dataset.creatorAvatarUrl || null,
    sightingCount: Number(card.dataset.sightingCount || 0),
    observerCount: Number(card.dataset.observerCount || 0),
    lastSeenAt: card.dataset.lastSeenAt || null,
  };
}

function patchCardPreview(card, item) {
  if (!card || !item) return;

  card.dataset.sightingCount = String(item.sightingCount ?? 0);
  card.dataset.observerCount = String(item.observerCount ?? 0);
  if (item.lastSeenAt) card.dataset.lastSeenAt = item.lastSeenAt;
  else delete card.dataset.lastSeenAt;

  const locationText = resolveLocationText(item);
  if (locationText) card.dataset.locationSummary = locationText;
  else delete card.dataset.locationSummary;

  const body = card.querySelector('.card__body');
  if (body) {
    const locWrap = body.querySelector('.card__location');
    if (locationText) {
      if (locWrap) {
        locWrap.querySelector('.card__location-text').textContent = locationText;
      } else {
        const title = body.querySelector('.card__title');
        const loc = document.createElement('p');
        loc.className = 'card__location';
        const pin = document.createElement('span');
        pin.className = 'card__location-pin';
        pin.setAttribute('aria-hidden', 'true');
        pin.textContent = '📍';
        const text = document.createElement('span');
        text.className = 'card__location-text';
        text.textContent = locationText;
        loc.append(pin, text);
        title?.insertAdjacentElement('afterend', loc);
      }
    } else if (locWrap) {
      locWrap.remove();
    }

    const seenText = buildCardSeenText(item.lastSeenAt);
    const footEl = body.querySelector('.card__foot');
    if (seenText) {
      if (footEl) footEl.textContent = seenText;
      else {
        const foot = document.createElement('p');
        foot.className = 'card__foot';
        foot.textContent = seenText;
        body.appendChild(foot);
      }
    } else if (footEl) {
      footEl.remove();
    }
  }

  patchMapRailPreview(card, item);
}

function patchMapRailPreview(card, item) {
  if (!mapRailList || !card || !item) return;
  const itemEl = mapRailList.querySelector(
    `.map-rail__item[data-id="${CSS.escape(card.dataset.id)}"]`,
  );
  if (!itemEl) return;

  const locationText = resolveLocationText(item);
  const railBody = itemEl.querySelector('.map-rail__body');
  if (railBody) {
    const locWrap = railBody.querySelector('.map-rail__location');
    if (locationText) {
      if (locWrap) {
        locWrap.querySelector('.map-rail__location-text').textContent = locationText;
      } else {
        const location = document.createElement('p');
        location.className = 'map-rail__location';
        const pin = document.createElement('span');
        pin.className = 'map-rail__location-pin';
        pin.setAttribute('aria-hidden', 'true');
        pin.textContent = '📍';
        const text = document.createElement('span');
        text.className = 'map-rail__location-text';
        text.textContent = locationText;
        location.append(pin, text);
        railBody.appendChild(location);
      }
    } else if (locWrap) {
      locWrap.remove();
    }

    const seenText = buildCardSeenText(item.lastSeenAt);
    const recentEl = railBody.querySelector('.map-rail__activity-recent');
    if (seenText) {
      if (recentEl) recentEl.textContent = seenText;
      else {
        const recent = document.createElement('p');
        recent.className = 'map-rail__activity-recent';
        recent.textContent = seenText;
        railBody.appendChild(recent);
      }
    } else if (recentEl) {
      recentEl.remove();
    }
  }
}

const REFRESH_PHENOMENON_KEY = 'fieldnotes.refreshPhenomenon';
let pendingDeepLinkSpotId = null;

function captureDeepLinkSpotId() {
  const params = new URLSearchParams(location.search);
  const spotId = params.get('spot');
  if (!spotId) return;
  pendingDeepLinkSpotId = spotId;
  params.delete('spot');
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

function consumePendingDeepLinkSpotId() {
  const spotId = pendingDeepLinkSpotId;
  pendingDeepLinkSpotId = null;
  return spotId;
}

async function ensurePhenomenonDetail(id, { force = false } = {}) {
  const pendingRefresh = sessionStorage.getItem(REFRESH_PHENOMENON_KEY);
  if (pendingRefresh === id) {
    sessionStorage.removeItem(REFRESH_PHENOMENON_KEY);
    phenomenonCache.delete(id);
    force = true;
  }
  const cached = phenomenonCache.get(id);
  const cacheHasObservers = Array.isArray(cached?.observers) && cached.observers.length > 0;
  const cacheHasCommunityDetail = cacheHasObservers || Array.isArray(cached?.trackers);
  const cacheMissingCreator = Boolean(
    cached?.userId && cached?.creatorName && !cacheHasObservers,
  );
  const cacheMissingTrackers = Number(cached?.trackCount ?? 0) > 0
    && !Array.isArray(cached?.trackers);
  if (!force && cached?.recentSightings && cacheHasCommunityDetail && !cacheMissingCreator && !cacheMissingTrackers) {
    return cached;
  }
  try {
    const res = await fetch(`/api/phenomena/${id}`, {
      headers: { 'Accept-Language': getLocale() },
    });
    if (!res.ok) return cached ?? null;
    const payload = await res.json();
    if (payload.data) {
      phenomenonCache.set(id, payload.data);
      const card = cards.find((entry) => entry.dataset.id === id);
      if (card) patchCardPreview(card, payload.data);
    }
    return payload.data ?? cached ?? null;
  } catch {
    return cached ?? null;
  }
}

function formatRelativeTime(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('home.relative.justNow');
  if (minutes < 60) return t('home.relative.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('home.relative.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return t('home.relative.daysAgo', { count: days });
}

function formatSightingDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return t('home.sighting.date', { month: date.getMonth() + 1, day: date.getDate() });
}

function resolveImageUrls(item) {
  if (Array.isArray(item.imageUrls) && item.imageUrls.length) return item.imageUrls;
  const urls = item.imageUrl ? [item.imageUrl] : [];
  // Demo: second photo until submissions store imageUrls[].
  if (item.title === '來找羅漢松的「小羅漢」，會慢慢變紅哦' && urls.length === 1) {
    return [
      urls[0],
      '/media/phenomena/podocarpus-seeds.jpg',
    ];
  }
  return urls;
}

function resolveFormImages(item) {
  const fromImages = Array.isArray(item.images) && item.images.length
    ? item.images.map((image) => ({
      url: image.url || image.imageUrl,
      caption: image.caption || image.imageAlt || '',
    }))
    : [];
  const urls = resolveImageUrls(item);
  if (!fromImages.length) {
    return urls.map((url, index) => ({
      url,
      caption: index === 0 ? (item.imageAlt || '') : '',
    }));
  }
  const seen = new Set(fromImages.map((image) => image.url));
  const merged = [...fromImages];
  urls.forEach((url) => {
    if (!url || seen.has(url)) return;
    merged.push({ url, caption: '' });
    seen.add(url);
  });
  return merged;
}

function getCardImageUrls(card) {
  if (card.dataset.imageUrls) {
    try {
      const parsed = JSON.parse(card.dataset.imageUrls);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* ignore malformed dataset */
    }
  }
  const img = card.querySelector('.card__photo img');
  return img?.src ? [img.src] : [];
}

function photoOrientation(w, h) {
  if (!w || !h) return 'square';
  const ratio = w / h;
  if (ratio < 0.92) return 'portrait';
  if (ratio > 1.08) return 'landscape';
  return 'square';
}

function syncMosaicGalleryHeight(mosaic) {
  if (mosaic.classList.contains('photo-mosaic--single')) {
    mosaic.removeAttribute('data-gallery-shape');
    return;
  }
  const main = mosaic.querySelector('.photo-mosaic__cell--main img, .photo-mosaic__cell--main video');
  if (!main) return;
  const w = main.naturalWidth || main.videoWidth;
  const h = main.naturalHeight || main.videoHeight;
  if (!w || !h) return;
  mosaic.dataset.galleryShape = photoOrientation(w, h);
}

function tuneCardPhoto(mediaEl) {
  const wrap = mediaEl.closest('.card__photo');
  if (!wrap) return;
  const apply = () => {
    const w = mediaEl.naturalWidth || mediaEl.videoWidth;
    const h = mediaEl.naturalHeight || mediaEl.videoHeight;
    if (!w || !h) return;
    const orient = photoOrientation(w, h);
    wrap.classList.remove('card__photo--portrait', 'card__photo--landscape', 'card__photo--square');
    wrap.classList.add(`card__photo--${orient}`);
  };
  if (mediaEl.tagName === 'VIDEO') {
    if (mediaEl.readyState >= 1) apply();
    else mediaEl.addEventListener('loadedmetadata', apply, { once: true });
    return;
  }
  if (mediaEl.complete && mediaEl.naturalWidth) apply();
  else mediaEl.addEventListener('load', apply, { once: true });
}

function applyPhotoSlideOrientation(cell, mediaEl) {
  const mosaic = cell.closest('.photo-mosaic');
  const apply = () => {
    const w = mediaEl.naturalWidth || mediaEl.videoWidth;
    const h = mediaEl.naturalHeight || mediaEl.videoHeight;
    if (!w || !h) return;

    cell.style.setProperty('--slide-aspect', `${w} / ${h}`);
    cell.classList.remove('photo-mosaic__cell--portrait', 'photo-mosaic__cell--landscape', 'photo-mosaic__cell--square');
    cell.classList.add(`photo-mosaic__cell--${photoOrientation(w, h)}`);

    if (mosaic && cell.classList.contains('photo-mosaic__cell--main')) {
      syncMosaicGalleryHeight(mosaic);
    }
  };

  if (mediaEl.tagName === 'VIDEO') {
    if (mediaEl.readyState >= 1) apply();
    else mediaEl.addEventListener('loadedmetadata', apply, { once: true });
    return;
  }
  if (mediaEl.complete && mediaEl.naturalWidth) apply();
  else mediaEl.addEventListener('load', apply, { once: true });
}

function buildPhotoMosaic(urlsOrImages, alt = '', { phenomenonId = '' } = {}) {
  let urls;
  let captions;
  if (urlsOrImages.length && typeof urlsOrImages[0] === 'object') {
    urls = urlsOrImages.map((image) => image.url);
    captions = urlsOrImages.map((image) => image.caption || '');
  } else {
    urls = urlsOrImages;
    captions = urls.map((_, index) => (index === 0 ? alt : ''));
  }

  const mosaic = document.createElement('div');
  mosaic.className = 'photo-mosaic';
  if (!urls.length) {
    mosaic.classList.add('photo-mosaic--empty');
    mosaic.hidden = true;
    return mosaic;
  }

  mosaic.dataset.allUrls = JSON.stringify(urls);
  mosaic.dataset.allCaptions = JSON.stringify(captions);
  mosaic.dataset.imageAlt = captions[0] || alt;
  if (phenomenonId) mosaic.dataset.phenomenonId = phenomenonId;
  if (urls.length === 1) mosaic.classList.add('photo-mosaic--single');

  const track = document.createElement('div');
  track.className = 'photo-mosaic__track';

  urls.forEach((url, i) => {
    const cell = document.createElement('div');
    cell.className = 'photo-mosaic__cell';
    cell.setAttribute('role', 'button');
    cell.tabIndex = 0;
    if (i === 0) cell.classList.add('photo-mosaic__cell--main');
    cell.setAttribute('aria-label', t('home.detail.openPhoto', { index: i + 1, total: urls.length }));

    const media = appendMediaPreview(cell, url, {
      alt: captions[i] || (i === 0 ? alt : ''),
      loading: i === 0 ? 'eager' : 'lazy',
    });
    if (isVideoMediaUrl(url)) {
      cell.classList.add('photo-mosaic__cell--video');
    }
    media.addEventListener('load', () => applyPhotoSlideOrientation(cell, media), { once: true });
    track.appendChild(cell);
  });

  mosaic.appendChild(track);

  if (urls.length > 1) {
    const counter = document.createElement('span');
    counter.className = 'photo-mosaic__counter';
    counter.setAttribute('aria-hidden', 'true');
    counter.textContent = `1 / ${urls.length}`;
    mosaic.appendChild(counter);
  }

  return mosaic;
}

const GALLERY_TAP_MOVE_PX = 10;
const GALLERY_SCROLL_MOVE_PX = 6;

function bindGalleryTrackDrag(track, cells, onCellTap) {
  if (!track || cells.length <= 1) return;

  let drag = null;

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const cell = e.target.closest('.photo-mosaic__cell');
    if (!cell || !track.contains(cell)) return;
    drag = {
      cellIndex: cells.indexOf(cell),
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: track.scrollLeft,
      moved: false,
      pointerId: e.pointerId,
    };
    if (drag.cellIndex < 0) {
      drag = null;
      return;
    }
    track.setPointerCapture(e.pointerId);
  });

  track.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dx) < GALLERY_TAP_MOVE_PX && Math.abs(dy) < GALLERY_TAP_MOVE_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      drag.moved = true;
    }
    track.scrollLeft = drag.scrollLeft - dx;
    e.preventDefault();
  });

  const finishDrag = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { cellIndex, moved, startX, startY } = drag;
    if (track.hasPointerCapture(e.pointerId)) {
      track.releasePointerCapture(e.pointerId);
    }
    drag = null;
    if (moved) {
      mapSheetGestureMoved = true;
      return;
    }
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > GALLERY_TAP_MOVE_PX || dy > GALLERY_TAP_MOVE_PX) return;
    onCellTap(cellIndex, e);
  };

  track.addEventListener('pointerup', finishDrag);
  track.addEventListener('pointercancel', () => {
    drag = null;
  });
}

/** Open lightbox on tap, not when the user was scrolling the gallery strip. */
function bindGalleryTap(el, onTap, { scrollRoot = null } = {}) {
  let gesture = null;

  scrollRoot?.addEventListener('scroll', () => {
    if (gesture) gesture.scrolled = true;
  }, { passive: true });

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    gesture = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollRoot?.scrollLeft ?? 0,
      scrolled: false,
    };
  }, { capture: true });

  el.addEventListener('pointerup', (e) => {
    if (!gesture || e.button !== 0) return;
    const g = gesture;
    gesture = null;
    const dx = Math.abs(e.clientX - g.x);
    const dy = Math.abs(e.clientY - g.y);
    const scrollMoved = scrollRoot
      && Math.abs(scrollRoot.scrollLeft - g.scrollLeft) > GALLERY_SCROLL_MOVE_PX;
    if (g.scrolled || scrollMoved || dx > GALLERY_TAP_MOVE_PX || dy > GALLERY_TAP_MOVE_PX) return;
    e.preventDefault();
    e.stopPropagation();
    onTap(e);
  }, { capture: true });

  el.addEventListener('pointercancel', () => {
    gesture = null;
  }, { capture: true });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

let photoLightboxEl = null;
let photoLightboxIndex = 0;
let photoLightboxUrls = [];
let photoLightboxCaptions = [];
let photoLightboxScrollLock = '';

function normalizeLightboxCaptions(urls, captions, index = 0) {
  if (Array.isArray(captions)) {
    return urls.map((_, i) => captions[i] || '');
  }
  if (typeof captions === 'string' && captions) {
    return urls.map((_, i) => (i === index ? captions : ''));
  }
  return urls.map(() => '');
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

function activateInlineVideo(video) {
  if (!video) return;
  const item = video.closest('.detail__sighting-photo-item');
  const poster = item?.querySelector('img.detail__sighting-media, img.detail__sighting-video');
  prepareLightboxVideo(video);
  const rawUrl = video.dataset.playbackUrl || video.getAttribute('src') || video.src || '';
  const src = resolvePlayableMediaUrl(rawUrl);
  if (src && !mediaUrlMatches(video, src)) {
    video.src = src;
  }
  video.hidden = false;
  if (poster) poster.hidden = true;
  item?.classList.add('is-playing');
  const tryPlay = () => { video.play().catch(() => {}); };
  if (video.readyState >= 2) tryPlay();
  else {
    video.addEventListener('loadeddata', tryPlay, { once: true });
    video.load();
  }
}

function toggleInlineVideo(video) {
  if (!video) return;
  if (video.paused || video.muted) {
    activateInlineVideo(video);
  } else {
    video.pause();
  }
}

function mountMediaExpandButton(container, onExpand) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'detail-media__expand';
  btn.setAttribute('aria-label', t('submit.photo.openPreview'));
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onExpand(e);
  });
  container.appendChild(btn);
  return btn;
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

function ensurePhotoLightbox() {
  if (photoLightboxEl) return photoLightboxEl;

  const lightbox = document.createElement('div');
  lightbox.className = 'photo-lightbox';
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <div class="photo-lightbox__backdrop" data-lightbox-close></div>
    <div class="photo-lightbox__stage" role="dialog" aria-modal="true">
      <button type="button" class="photo-lightbox__close" data-lightbox-close aria-label="">
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

  const closeEls = lightbox.querySelectorAll('[data-lightbox-close]');
  const prev = lightbox.querySelector('.photo-lightbox__nav--prev');
  const next = lightbox.querySelector('.photo-lightbox__nav--next');
  const closeBtn = lightbox.querySelector('.photo-lightbox__close');
  closeBtn.setAttribute('aria-label', t('home.close'));
  prev.setAttribute('aria-label', t('home.detail.prevPhoto'));
  next.setAttribute('aria-label', t('home.detail.nextPhoto'));

  closeEls.forEach((el) => el.addEventListener('click', closePhotoLightbox));
  prev.addEventListener('click', () => stepPhotoLightbox(-1));
  next.addEventListener('click', () => stepPhotoLightbox(1));
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox.querySelector('.photo-lightbox__stage')) closePhotoLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (!photoLightboxEl || photoLightboxEl.hidden) return;
    if (e.key === 'Escape') closePhotoLightbox();
    if (e.key === 'ArrowLeft') stepPhotoLightbox(-1);
    if (e.key === 'ArrowRight') stepPhotoLightbox(1);
  });

  photoLightboxEl = lightbox;
  return lightbox;
}

function renderPhotoLightbox() {
  const lightbox = ensurePhotoLightbox();
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
  const stage = lightbox.querySelector('.photo-lightbox__stage');
  const url = photoLightboxUrls[photoLightboxIndex] || '';
  const caption = photoLightboxCaptions[photoLightboxIndex] || '';

  lightbox.classList.toggle('is-video-open', isVideoMediaUrl(url));
  lightbox.classList.toggle('has-caption', Boolean(caption));

  if (isVideoMediaUrl(url)) {
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

  const multi = photoLightboxUrls.length > 1;
  prev.hidden = !multi;
  next.hidden = !multi;
  counter.hidden = !multi;
  if (multi) {
    counter.textContent = `${photoLightboxIndex + 1} / ${photoLightboxUrls.length}`;
    prev.disabled = photoLightboxIndex === 0;
    next.disabled = photoLightboxIndex === photoLightboxUrls.length - 1;
  }
}

function openPhotoLightbox(urls, index = 0, captions = '') {
  if (!urls.length) return;
  photoLightboxUrls = urls;
  photoLightboxIndex = Math.max(0, Math.min(urls.length - 1, index));
  photoLightboxCaptions = normalizeLightboxCaptions(urls, captions, index);
  const lightbox = ensurePhotoLightbox();
  renderPhotoLightbox();
  photoLightboxScrollLock = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.classList.add('is-photo-lightbox-open');
  lightbox.hidden = false;
  lightbox.classList.add('is-open');
  lightbox.querySelector('.photo-lightbox__close')?.focus();
}

function closePhotoLightbox() {
  if (!photoLightboxEl || photoLightboxEl.hidden) return;
  photoLightboxEl.querySelector('.photo-lightbox__video')?.pause();
  photoLightboxEl.hidden = true;
  photoLightboxEl.classList.remove('is-open', 'is-video-open');
  document.body.classList.remove('is-photo-lightbox-open');
  document.body.style.overflow = photoLightboxScrollLock;
  photoLightboxScrollLock = '';
}

function stepPhotoLightbox(delta) {
  if (photoLightboxUrls.length <= 1) return;
  photoLightboxIndex = Math.max(0, Math.min(photoLightboxUrls.length - 1, photoLightboxIndex + delta));
  renderPhotoLightbox();
}

function initPhotoMosaic(mosaic) {
  if (mosaic.dataset.mosaicReady || mosaic.classList.contains('photo-mosaic--empty')) return;
  mosaic.dataset.mosaicReady = '1';

  let urls = [];
  try {
    urls = JSON.parse(mosaic.dataset.allUrls || '[]');
  } catch {
    urls = [];
  }
  if (!urls.length) return;

  const alt = mosaic.dataset.imageAlt || '';
  let captions = [];
  try {
    captions = JSON.parse(mosaic.dataset.allCaptions || '[]');
  } catch {
    captions = [];
  }
  const track = mosaic.querySelector('.photo-mosaic__track');
  const counter = mosaic.querySelector('.photo-mosaic__counter');
  const cells = [...mosaic.querySelectorAll('.photo-mosaic__cell')];

  const updateCounter = () => {
    if (!counter || !track || cells.length <= 1) return;
    const anchorX = track.getBoundingClientRect().left + track.clientWidth * 0.28;
    let index = 0;
    let best = Infinity;
    cells.forEach((cell, i) => {
      const rect = cell.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(center - anchorX);
      if (dist < best) {
        best = dist;
        index = i;
      }
    });
    counter.textContent = `${index + 1} / ${cells.length}`;
  };

  track?.addEventListener('scroll', () => {
    window.requestAnimationFrame(updateCounter);
  }, { passive: true });

  const handleCellTap = (index, e) => {
    e.stopPropagation();
    if (mapSheetPeekOpen() && mosaic.closest('.map-sheet__peek-row') && !isVideoMediaUrl(urls[index])) {
      expandMapSheet();
      return;
    }
    openPhotoLightbox(urls, index, captions.length ? captions : alt);
  };

  cells.forEach((cell, index) => {
    applyPhotoSlideOrientation(cell, cell.querySelector('.photo-mosaic__img, .photo-mosaic__video'));
    cell.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      handleCellTap(index, e);
    });
  });

  if (cells.length > 1 && track) {
    bindGalleryTrackDrag(track, cells, handleCellTap);
  } else if (cells.length === 1) {
    bindGalleryTap(cells[0], (e) => handleCellTap(0, e));
  }

  updateCounter();
}

function mountDetailContent(container, card, item = null) {
  destroyDetailMaps(container);
  const detailItem = item ?? getItemForCard(card);
  container.replaceChildren(...buildDetailNodes(detailItem));
  container.querySelectorAll('.photo-mosaic').forEach(initPhotoMosaic);
  finishDetailMount(container, detailItem);
}

function buildDetailSection(item, { loop = '' } = {}) {
  const section = document.createElement('section');
  section.className = 'feed-detail__section';
  section.dataset.id = item.id;
  if (loop) section.dataset.loop = loop;
  section.append(...buildDetailNodes(item));
  return section;
}

function measureDetailLoopHeight(root = detailScrollRoot) {
  if (!root) return 0;
  const firstLoop = root.querySelector('.feed-detail__section[data-loop="after"]');
  return firstLoop ? firstLoop.offsetTop : root.scrollHeight;
}

function findPrimaryDetailSection(id, root = detailScrollRoot) {
  if (!root) return null;
  return root.querySelector(
    `.feed-detail__section:not([data-loop])[data-id="${CSS.escape(id)}"]`,
  );
}

function bindMapSheetPeekNavButtons() {
  mapSheetPeekPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateMapSheetPin(-1);
  });
  mapSheetPeekNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateMapSheetPin(1);
  });
  [mapSheetPeekPrev, mapSheetPeekNext].forEach((btn) => {
    btn?.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    btn?.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
  });
}

function mountMapSheetDetail(card, item = null) {
  detailScrollRoot = null;
  detailLoopHeight = 0;
  destroyDetailMaps(mapSheetBody);
  mapSheetBody.replaceChildren();
  mapSheetBody.style.paddingBottom = '';
  mapSheetBody.scrollTop = 0;
  if (!card) return;
  const detailItem = item ?? getItemForCard(card);
  const section = buildDetailSection(detailItem);
  mapSheetBody.appendChild(section);
  section.querySelectorAll('.photo-mosaic').forEach(initPhotoMosaic);
  finishDetailMount(section, detailItem);
}

function mountSplitDetail(card, item = null) {
  detailScrollRoot = null;
  detailLoopHeight = 0;
  destroyDetailMaps(feedDetailBody);
  feedDetailBody.replaceChildren();
  feedDetailBody.style.paddingBottom = '';
  feedDetailBody.scrollTop = 0;
  if (!card) return;
  const detailItem = item ?? getItemForCard(card);
  const section = buildDetailSection(detailItem);
  feedDetailBody.appendChild(section);
  section.querySelectorAll('.photo-mosaic').forEach(initPhotoMosaic);
  finishDetailMount(section, detailItem);
}

function mountMapSheetPeek(card, { direction = 0, item = null } = {}) {
  detailScrollRoot = null;
  detailLoopHeight = 0;
  mapSheetBody.replaceChildren();
  mapSheetBody.style.paddingBottom = '';
  mapSheetBody.scrollTop = 0;
  if (direction > 0) mapSheetBody.dataset.peekDirection = 'next';
  else if (direction < 0) mapSheetBody.dataset.peekDirection = 'prev';
  else delete mapSheetBody.dataset.peekDirection;
  if (!card) return;

  const detailItem = item ?? getItemForCard(card);
  const row = document.createElement('div');
  row.className = 'map-sheet__peek-row';
  row.appendChild(buildDetailSection(detailItem));

  mapSheetBody.appendChild(row);
  row.querySelectorAll('.photo-mosaic').forEach(initPhotoMosaic);
  finishDetailMount(row.querySelector('.feed-detail__section'), detailItem);
  syncMapSheetPeekLayout(row);

  if (direction) {
    window.setTimeout(() => { delete mapSheetBody.dataset.peekDirection; }, 260);
  }
}

const PEEK_FLAT_RATIO = 1.8;
const PEEK_CAP_EARLY = 0.68;

function syncMapSheetPeekLayout(row = mapSheetBody?.querySelector('.map-sheet__peek-row')) {
  if (!row || !mapSheetPeekOpen()) return;
  const apply = () => {
    const isTabletPeek = TABLET_SPLIT_MQ.matches && !DESKTOP_SPLIT_MQ.matches;
    if (!isTabletPeek) {
      row.classList.remove('map-sheet__peek-row--split');
      return;
    }
    const w = row.getBoundingClientRect().width || window.innerWidth;
    if (!w) return;
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const maxPhotoH = Math.min(window.innerHeight * 0.32, rootFont * 13);
    const naturalStripH = w * (10 / 16);
    const displayH = Math.min(naturalStripH, maxPhotoH);
    const stripTooFlat = (w / displayH) >= PEEK_FLAT_RATIO
      || naturalStripH >= maxPhotoH * PEEK_CAP_EARLY;
    row.classList.toggle('map-sheet__peek-row--split', stripTooFlat);
  };
  apply();
  window.requestAnimationFrame(apply);
  window.requestAnimationFrame(() => window.requestAnimationFrame(apply));
}

function mountContinuousDetail(container, { scrollTo } = {}) {
  detailScrollRoot = container;
  destroyDetailMaps(container);
  container.replaceChildren();
  container.style.paddingBottom = '';
  const visible = getVisibleCards();
  visible.forEach((card) => container.appendChild(buildDetailSection(getItemForCard(card))));
  if (!isPhoneLayout()) {
    visible.forEach((card) => container.appendChild(buildDetailSection(getItemForCard(card), { loop: 'after' })));
  }
  container.querySelectorAll('.photo-mosaic').forEach(initPhotoMosaic);
  container.querySelectorAll('.feed-detail__section:not([data-loop])').forEach((section) => {
    const id = section.dataset.id;
    const cached = phenomenonCache.get(id);
    if (cached) finishDetailMount(section, cached);
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      detailLoopHeight = measureDetailLoopHeight(container);
      if (scrollTo) scrollDetailToCard(scrollTo, { behavior: 'instant' });
    });
  });
}

function normalizeDetailScrollLoop() {
  if (!detailScrollRoot || !detailLoopHeight) return;
  const top = detailScrollRoot.scrollTop;
  if (top >= detailLoopHeight) {
    detailAdvanceLock = true;
    detailScrollRoot.scrollTop = top - detailLoopHeight;
    window.setTimeout(() => { detailAdvanceLock = false; }, 50);
  }
}

function scrollDetailToCard(card, { behavior = 'smooth' } = {}) {
  const section = findPrimaryDetailSection(card.dataset.id);
  if (!section || !detailScrollRoot) return;
  const anchor = section.querySelector('.photo-mosaic') || section;
  detailAdvanceLock = true;
  const rootRect = detailScrollRoot.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const targetTop = detailScrollRoot.scrollTop + (anchorRect.top - rootRect.top);
  if (behavior === 'instant') {
    detailScrollRoot.scrollTop = targetTop;
    window.setTimeout(() => { detailAdvanceLock = false; }, 60);
  } else {
    detailScrollRoot.scrollTo({ top: targetTop, behavior: 'smooth' });
    window.setTimeout(() => { detailAdvanceLock = false; }, 420);
  }
}

function findActiveDetailSection() {
  if (!detailScrollRoot) return null;
  const containerRect = detailScrollRoot.getBoundingClientRect();
  const anchor = containerRect.top + containerRect.height * DETAIL_SCROLL_ANCHOR_RATIO;
  const sections = [...detailScrollRoot.querySelectorAll('.feed-detail__section')];
  let active = null;

  for (const section of sections) {
    const mosaic = section.querySelector('.photo-mosaic');
    if (!mosaic) continue;
    if (mosaic.getBoundingClientRect().top <= anchor + 1) active = section;
    else if (active) break;
  }

  return active || sections[0] || null;
}

function isDetailStreamActive() {
  if (feedStage.classList.contains('is-detail-open')) return true;
  return usesSheetDetail()
    && mapSheet.classList.contains('is-open')
    && mapSheet.classList.contains('is-expanded');
}

function updateDetailScrollSpy() {
  detailScrollRaf = 0;
  if (!isDetailStreamActive() || !detailScrollRoot || detailAdvanceLock) return;
  const section = findActiveDetailSection();
  if (!section) return;
  const card = cards.find((c) => c.dataset.id === section.dataset.id);
  if (card && card !== focusedCard) syncFocusedFromDetailScroll(card);
}

function debouncedCenterMapOnCard(card) {
  window.clearTimeout(mapPanTimer);
  const animate = !(usesSheetDetail() && mapSheet.classList.contains('is-open'));
  mapPanTimer = window.setTimeout(() => centerMapOnCard(card, { animate }), MAP_PIN_PAN_DELAY_MS);
}

function syncFocusedFromDetailScroll(card) {
  setFocusedCard(card);
  updateDetailHeaderTitle(card);
  if (!mapView.classList.contains('is-hidden')) {
    const entry = findMarkerEntry(card);
    if (entry) {
      setActiveMapPin(entry.marker);
      debouncedCenterMapOnCard(card);
    }
    scrollRailToFocusedCard();
  }
}

function onDetailPaneScroll() {
  if (!isDetailStreamActive() || !detailScrollRoot) return;
  normalizeDetailScrollLoop();
  if (detailAdvanceLock) return;
  if (!detailScrollRaf) detailScrollRaf = requestAnimationFrame(updateDetailScrollSpy);
}

function buildCardReportText(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  const time = minutes < 1
    ? t('home.relative.justNow')
    : (formatRelativeTime(iso) || t('home.relative.justNow'));
  return t('home.card.lastReport', { time });
}

function formatDetailLocationLabel(location) {
  const trimmed = location.trim();
  if (!trimmed) return '';
  if (/^📍\s*/u.test(trimmed)) return trimmed;
  return `📍 ${trimmed}`;
}

function appendStarterDiscoveryLine(line, item) {
  const name = item.creatorName || item.observerName;
  if (!name) return false;

  const prefix = t('home.detail.startedByPrefix');
  if (prefix) {
    const prefixEl = document.createElement('span');
    prefixEl.className = 'detail__starter-text';
    prefixEl.textContent = prefix;
    line.appendChild(prefixEl);
  }

  line.appendChild(buildMemberAvatar({
    userId: item.userId,
    name,
    avatarUrl: item.creatorAvatarUrl,
    category: item.category,
  }, { className: 'detail__member-avatar detail__member-avatar--sm' }));

  if (item.userId) {
    line.appendChild(buildMemberName({
      userId: item.userId,
      name,
      className: 'detail__starter-name detail__member-link',
    }));
  } else {
    const plain = document.createElement('strong');
    plain.className = 'detail__starter-name';
    plain.textContent = name;
    line.appendChild(plain);
  }

  const suffix = t('home.detail.startedBySuffix');
  if (suffix) {
    const suffixEl = document.createElement('span');
    suffixEl.className = 'detail__starter-text';
    suffixEl.textContent = suffix;
    line.appendChild(suffixEl);
  }

  return true;
}

function appendDetailMeta(head, item) {
  const community = buildObserversSection(item, { placement: 'inline', excludeUserId: item.userId || null });
  const hasDiscovery = Boolean(item.creatorName || item.observerName);

  if (hasDiscovery || community) {
    const group = document.createElement('div');
    group.className = 'detail__starter-group';

    if (hasDiscovery) {
      const line = document.createElement('p');
      line.className = 'detail__starter-line detail__starter-line--discovery';
      appendStarterDiscoveryLine(line, item);
      group.appendChild(line);
    }

    if (community) {
      const line = document.createElement('p');
      line.className = 'detail__starter-line detail__starter-line--community';
      line.appendChild(community);
      group.appendChild(line);
    }

    head.appendChild(group);
  }

  if (resolveLocationText(item)) {
    const location = document.createElement('p');
    location.className = 'detail__subtitle detail__subtitle--location';
    location.textContent = formatDetailLocationLabel(resolveLocationText(item));
    head.appendChild(location);
  }

  const latest = item.recentSightings?.[0];
  const seenAt = latest?.seenAt || item.lastSeenAt;
  if (seenAt) {
    const when = formatRelativeTime(seenAt) || t('home.relative.justNow');
    const report = document.createElement('p');
    report.className = 'detail__last-report';
    report.textContent = t('home.card.lastReport', { time: when });
    head.appendChild(report);
  }
}

function buildCardSeenText(iso) {
  return buildCardReportText(iso);
}

function appendCardLocation(parent, locationText) {
  const location = document.createElement('p');
  location.className = 'card__location';

  const pin = document.createElement('span');
  pin.className = 'card__location-pin';
  pin.setAttribute('aria-hidden', 'true');
  pin.textContent = '📍';

  const text = document.createElement('span');
  text.className = 'card__location-text';
  text.textContent = locationText;

  location.append(pin, text);
  parent.appendChild(location);
}

function renderCard(item, { eagerImage = false } = {}) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = item.id;
  card.dataset.status = item.status;
  const cats = itemCategories(item);
  card.dataset.category = cats[0] || 'plant';
  card.dataset.categories = cats.join(',');
  if (item.lat != null) card.dataset.lat = String(item.lat);
  if (item.lng != null) card.dataset.lng = String(item.lng);
  if (item.location) card.dataset.location = item.location;
  if (resolveLocationText(item)) card.dataset.locationSummary = resolveLocationText(item);
  if (item.notes) card.dataset.notes = item.notes;
  if (item.findingHint) card.dataset.findingHint = item.findingHint;
  card.dataset.sightingCount = String(item.sightingCount ?? 0);
  card.dataset.observerCount = String(item.observerCount ?? 0);
  if (item.lastSeenAt) card.dataset.lastSeenAt = item.lastSeenAt;
  if (item.userId) card.dataset.userId = item.userId;
  if (item.creatorName) card.dataset.creatorName = item.creatorName;
  if (item.creatorAvatarUrl) card.dataset.creatorAvatarUrl = item.creatorAvatarUrl;

  const imageUrls = resolveImageUrls(item);
  if (imageUrls.length) card.dataset.imageUrls = JSON.stringify(imageUrls);

  const photo = document.createElement('div');
  photo.className = 'card__photo';
  if (imageUrls[0]) {
    const first = imageUrls[0];
    if (isVideoMediaUrl(first)) {
      const img = appendVideoThumbnail(photo, {
        videoUrl: first,
        posterUrl: videoPosterUrl(first),
        className: 'card__photo-video',
      });
      img.addEventListener('load', () => {
        if (img.src && img.naturalWidth > 0) seedPosterCache(first, img.src);
      }, { once: true });
      tuneCardPhoto(img);
    } else {
      const img = document.createElement('img');
      img.src = first;
      img.alt = item.imageAlt || '';
      img.loading = eagerImage ? 'eager' : 'lazy';
      img.decoding = eagerImage ? 'sync' : 'async';
      img.fetchPriority = eagerImage ? 'high' : 'auto';
      photo.appendChild(img);
      tuneCardPhoto(img);
    }
  }

  const body = document.createElement('div');
  body.className = 'card__body';

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = item.title;
  body.appendChild(title);

  const locationText = resolveLocationText(item);
  if (locationText) appendCardLocation(body, locationText);

  const seenText = buildCardSeenText(item.lastSeenAt);
  if (seenText) {
    const foot = document.createElement('p');
    foot.className = 'card__foot';
    foot.textContent = seenText;
    body.appendChild(foot);
  }

  card.append(photo, body);

  return card;
}

function clearMapMarkers() {
  markerRefs.forEach(({ marker }) => {
    if (leafletMap && leafletMap.hasLayer(marker)) marker.remove();
  });
  markerRefs.length = 0;
}

function addMapMarkers() {
  if (!leafletMap) return;
  clearMapMarkers();
  cards.forEach((card) => {
    const lat = parseFloat(card.dataset.lat);
    const lng = parseFloat(card.dataset.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    const icon = L.divIcon({
      html: `<span class="map-pin" data-category="${card.dataset.category}"></span>`,
      className: 'map-pin-wrapper',
      iconSize: [26, 34],
      iconAnchor: [13, 34],
    });
    const marker = L.marker([lat, lng], {
      icon,
      title: card.querySelector('.card__title')?.textContent || '',
    }).addTo(leafletMap);
    marker.on('click', () => openMapSheet(card, marker));
    markerRefs.push({ marker, card });
  });
  applyFilters();
}

function bindPinchWheelZoom(map) {
  let wheelAcc = 0;
  const wheelThreshold = 45;
  map.getContainer().addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    wheelAcc += event.deltaY;
    if (Math.abs(wheelAcc) < wheelThreshold) return;
    const step = wheelAcc > 0 ? -1 : 1;
    wheelAcc = 0;
    map.setZoom(map.getZoom() + step);
  }, { passive: false });
}

function initMap() {
  if (leafletMap) {
    addMapMarkers();
    return;
  }
  leafletMap = L.map('mapCanvas', {
    scrollWheelZoom: false,
    touchZoom: true,
  }).setView(ZUOYING_CENTER, 15);
  bindPinchWheelZoom(leafletMap);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(leafletMap);
  addMapMarkers();
}

function openPhenomenonOnMap(item) {
  const card = cards.find((c) => c.dataset.id === item.id);
  if (!card) return;
  const mapBtn = document.querySelector('.view-toggle__btn[data-view="map"]');
  if (mapView.classList.contains('is-hidden') && mapBtn) mapBtn.click();
  const entry = findMarkerEntry(card);
  if (entry) openMapSheet(card, entry.marker);
  else openSplitDetail(card);
}

function googleMapsDirectionsUrlForCoords(lat, lng, label) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const place = label?.trim();
  if (place) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
  }
  return null;
}

function getReportedSpots(item) {
  return (item?.spots ?? []).filter((spot) => {
    const count = Number(spot.sightingCount ?? 0);
    if (count > 0) return true;
    return Boolean(spot.lastSeenAt);
  });
}

function getSpotsWithCoords(item) {
  return getReportedSpots(item).filter((spot) => {
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });
}

function getPreferredNavSpot(item) {
  const withCoords = getSpotsWithCoords(item);
  if (!withCoords.length) return null;
  return [...withCoords].sort((a, b) => {
    const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  })[0];
}

function getLatestSightingForSpot(item, spotId) {
  if (!spotId) return null;
  return (item.recentSightings ?? []).find((sighting) => sighting.spotId === spotId) ?? null;
}

function resolveDetailMapPoints(item) {
  const spotPoints = getSpotsWithCoords(item).map((spot) => {
    const latest = getLatestSightingForSpot(item, spot.id);
    return {
      id: spot.id,
      lat: Number(spot.lat),
      lng: Number(spot.lng),
      label: spot.label || spot.name,
      lastSeenAt: spot.lastSeenAt || latest?.seenAt || null,
      latestNote: latest?.note?.trim() || null,
    };
  });
  if (spotPoints.length) return spotPoints;

  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const latest = item.recentSightings?.[0] ?? null;
    return [{
      id: null,
      lat,
      lng,
      label: resolveLocationText(item),
      lastSeenAt: item.lastSeenAt || latest?.seenAt || null,
      latestNote: latest?.note?.trim() || null,
    }];
  }
  return [];
}

function detailSpotTooltipText(point) {
  if (point.lastSeenAt) {
    return formatRelativeTime(point.lastSeenAt) || formatSightingDate(point.lastSeenAt);
  }
  return point.label || '';
}

function detailSpotTooltipOptions() {
  return {
    permanent: false,
    direction: 'top',
    offset: [0, -34],
    opacity: 1,
    className: 'detail-map-tooltip',
  };
}

function ensureDetailMapPinHint(canvas) {
  const preview = canvas.closest('.detail__map-preview');
  if (!preview) return null;
  let hint = preview.querySelector('.detail__map-pin-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'detail__map-pin-hint';
    hint.hidden = true;
    preview.appendChild(hint);
  }
  return hint;
}

function bindDetailSpotHoverHint(marker, point, canvas) {
  const text = detailSpotTooltipText(point);
  if (!text) return;
  const hint = ensureDetailMapPinHint(canvas);
  if (!hint) return;
  marker.on('mouseover', () => {
    hint.textContent = text;
    hint.hidden = false;
  });
  marker.on('mouseout', () => {
    hint.hidden = true;
  });
}

function googleMapsDirectionsUrl(item, spot) {
  if (spot) {
    return googleMapsDirectionsUrlForCoords(
      Number(spot.lat),
      Number(spot.lng),
      spot.label || spot.name,
    );
  }

  const preferred = getPreferredNavSpot(item);
  if (preferred) {
    return googleMapsDirectionsUrlForCoords(
      Number(preferred.lat),
      Number(preferred.lng),
      preferred.label || preferred.name,
    );
  }

  return googleMapsDirectionsUrlForCoords(
    Number(item?.lat),
    Number(item?.lng),
    resolveLocationText(item) || item?.location,
  );
}

function buildSightingUrl(phenomenonId, spotId) {
  const params = new URLSearchParams({ phenomenon: phenomenonId });
  if (spotId) params.set('spot', spotId);
  return `/sighting?${params.toString()}`;
}

const detailMiniMapRegistry = new WeakMap();
const detailMapMarkerRegistry = new WeakMap();
let detailMapOverlayEl = null;
let detailMapOverlayMap = null;
let detailMapOverlayScrollLock = '';
let detailMapOverlayMarkers = null;
let detailMapOverlayItem = null;
let detailMapOverlayPoints = [];
let detailMapOverlayCategory = 'plant';

const DETAIL_PIN_SIZE = [22, 29];
const DETAIL_PIN_ANCHOR = [11, 29];

function detailSpotPinIcon(category, { active = false, dim = false } = {}) {
  const classes = ['map-pin', 'map-pin--detail'];
  if (active) classes.push('is-active');
  else if (dim) classes.push('is-dim');
  return L.divIcon({
    html: `<span class="${classes.join(' ')}" data-category="${category}"></span>`,
    className: 'map-pin-wrapper',
    iconSize: DETAIL_PIN_SIZE,
    iconAnchor: DETAIL_PIN_ANCHOR,
  });
}

function fitDetailMiniMapToPoints(map, points) {
  if (!map || points.length < 2) return;
  map.fitBounds(
    L.latLngBounds(points.map((point) => [point.lat, point.lng])),
    {
      paddingTopLeft: L.point(22, 30),
      paddingBottomRight: L.point(22, 38),
      maxZoom: 14,
      animate: false,
    },
  );
}

const detailMiniMapDragState = new WeakMap();

function bindDetailMiniMapInteraction(canvas, map) {
  const preview = canvas.closest('.detail__map-preview');
  if (!preview) return;

  let state = detailMiniMapDragState.get(canvas);
  if (!state) {
    state = { dragged: false };
    detailMiniMapDragState.set(canvas, state);
    preview.addEventListener('click', (e) => {
      if (state.dragged) {
        state.dragged = false;
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  map.on('dragstart', () => { state.dragged = false; });
  map.on('drag', () => { state.dragged = true; });
}

function destroyDetailMaps(root) {
  root?.querySelectorAll('.detail__map-canvas').forEach((canvas) => {
    detailMapMarkerRegistry.delete(canvas);
    const map = detailMiniMapRegistry.get(canvas);
    if (map) {
      map.remove();
      detailMiniMapRegistry.delete(canvas);
    }
  });
}

function updateDetailMapSpotSelection(root, item, spotId) {
  const canvas = root.querySelector('.detail__map-canvas');
  if (!canvas) return;
  const markers = detailMapMarkerRegistry.get(canvas);
  if (!markers) return;

  const category = canvas.dataset.category || item.category || 'plant';
  const multi = markers.size > 1;
  markers.forEach((marker, id) => {
    const active = id === spotId;
    marker.setIcon(detailSpotPinIcon(category, { active, dim: multi && !active }));
  });
}

function applyDetailSpotSelection(root, item, spotId) {
  const spot = item.spots?.find((entry) => entry.id === spotId);
  if (!spot) return;

  const hero = root.querySelector('.detail__hero') || root;
  hero.dataset.selectedSpotId = spotId;

  root.querySelectorAll('.detail__spot-item').forEach((li) => {
    const selected = li.dataset.spotId === spotId;
    li.classList.toggle('is-selected', selected);
    li.setAttribute('aria-selected', selected ? 'true' : 'false');
  });

  const navBtn = root.querySelector('.detail__action--nav');
  const reportBtn = root.querySelector('.detail__action--primary');
  const mapsUrl = googleMapsDirectionsUrl(item, spot);
  if (navBtn) {
    if (mapsUrl) {
      navBtn.href = mapsUrl;
      navBtn.hidden = false;
    } else {
      navBtn.hidden = true;
    }
  }
  if (reportBtn) {
    reportBtn.href = buildSightingUrl(item.id, spotId);
  }

  updateDetailMapSpotSelection(root, item, spotId);
}

function initDetailSpotSelection(root, item) {
  const spots = getReportedSpots(item);
  if (!spots.length) return;

  let defaultId = getPreferredNavSpot(item)?.id || spots[0].id;
  const preferredFromLink = consumePendingDeepLinkSpotId();
  if (preferredFromLink && spots.some((spot) => spot.id === preferredFromLink)) {
    defaultId = preferredFromLink;
  }
  applyDetailSpotSelection(root, item, defaultId);

  if (spots.length === 1) return;

  root.querySelectorAll('.detail__spot-item').forEach((li) => {
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = li.dataset.spotId;
      if (id) applyDetailSpotSelection(root, item, id);
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        li.click();
      }
    });
  });
}

function finishDetailMount(root, item) {
  initDetailMapCanvases(root);
  if (item) initDetailSpotSelection(root, item);
  if (item && !canEditPhenomenon(item)) {
    root?.querySelectorAll('.detail__edit-btn').forEach((btn) => btn.remove());
  }
}

function initDetailMiniMap(canvas) {
  if (!canvas || typeof L === 'undefined') return null;
  if (detailMiniMapRegistry.has(canvas)) return detailMiniMapRegistry.get(canvas);

  let points = [];
  try {
    points = JSON.parse(canvas.dataset.mapPoints || '[]');
  } catch {
    points = [];
  }
  if (!points.length) {
    const lat = Number(canvas.dataset.lat);
    const lng = Number(canvas.dataset.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      points = [{ lat, lng, label: '' }];
    }
  }
  if (!points.length) return null;

  const category = canvas.dataset.category || 'plant';
  const phenomenonId = canvas.dataset.phenomenonId;
  const item = phenomenonId ? phenomenonCache.get(phenomenonId) : null;

  const map = L.map(canvas, {
    zoomControl: false,
    dragging: !isPhoneLayout(),
    scrollWheelZoom: false,
    touchZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    attributionControl: false,
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  bindDetailMiniMapInteraction(canvas, map);

  const markers = new Map();
  const multi = points.length > 1;
  points.forEach((point) => {
    const marker = L.marker([point.lat, point.lng], {
      icon: detailSpotPinIcon(category, { dim: multi }),
    }).addTo(map);
    bindDetailSpotHoverHint(marker, point, canvas);
    if (point.id) {
      markers.set(point.id, marker);
      if (item) {
        marker.on('click', (e) => {
          if (e.originalEvent) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
          }
          const root = canvas.closest('.feed-detail__section')
            || canvas.closest('.card-modal__body')
            || canvas.closest('.map-sheet__body')
            || canvas.closest('.feed-detail__body')
            || canvas.parentElement;
          if (root) applyDetailSpotSelection(root, item, point.id);
        });
      }
    }
  });

  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], 15, { animate: false });
  } else {
    fitDetailMiniMapToPoints(map, points);
  }

  detailMiniMapRegistry.set(canvas, map);
  detailMapMarkerRegistry.set(canvas, markers);
  const refit = () => {
    map.invalidateSize({ animate: false });
    if (points.length > 1) fitDetailMiniMapToPoints(map, points);
  };
  requestAnimationFrame(() => requestAnimationFrame(refit));
  return map;
}

function initDetailMapCanvases(root) {
  root?.querySelectorAll('.detail__map-canvas').forEach((canvas) => {
    initDetailMiniMap(canvas);
  });
}

function closeDetailMapOverlay() {
  if (!detailMapOverlayEl || detailMapOverlayEl.hidden) return;
  detailMapOverlayEl.hidden = true;
  document.body.style.overflow = detailMapOverlayScrollLock;
  detailMapOverlayScrollLock = '';
  if (detailMapOverlayMap) {
    detailMapOverlayMap.remove();
    detailMapOverlayMap = null;
  }
  detailMapOverlayMarkers = null;
  detailMapOverlayItem = null;
  detailMapOverlayPoints = [];
  detailMapOverlayEl.querySelector('.detail-map-overlay__canvas')?.replaceChildren();
}

function findDetailRootsForPhenomenon(phenomenonId) {
  const roots = [];
  document.querySelectorAll(
    `.feed-detail__section[data-id="${CSS.escape(phenomenonId)}"]:not([data-loop])`,
  ).forEach((el) => roots.push(el));
  if (cardModalBody?.querySelector(`.detail__hero[data-phenomenon-id="${phenomenonId}"]`)) {
    roots.push(cardModalBody);
  }
  return roots;
}

function syncDetailSpotFromOverlay(item, spotId) {
  if (!spotId) return;
  findDetailRootsForPhenomenon(item.id).forEach((root) => {
    applyDetailSpotSelection(root, item, spotId);
  });
}

function applyDetailOverlaySpotSelection(spotId) {
  const item = detailMapOverlayItem;
  const overlay = detailMapOverlayEl;
  if (!item || !overlay || !detailMapOverlayPoints.length) return;

  const point = detailMapOverlayPoints.find((entry) => entry.id === spotId)
    || detailMapOverlayPoints[0];
  if (!point) return;

  const resolvedSpotId = point.id || spotId;
  const spot = item.spots?.find((entry) => entry.id === resolvedSpotId) || point;
  const multi = detailMapOverlayPoints.length > 1;

  detailMapOverlayMarkers?.forEach((marker, id) => {
    const active = id === resolvedSpotId;
    marker.setIcon(detailSpotPinIcon(detailMapOverlayCategory, { active, dim: multi && !active }));
  });

  overlay.querySelectorAll('.detail-map-overlay__spot').forEach((btn) => {
    const selected = btn.dataset.spotId === resolvedSpotId;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
  });

  const metaEl = overlay.querySelector('.detail-map-overlay__spot-meta');
  const noteEl = overlay.querySelector('.detail-map-overlay__spot-note');
  if (metaEl) {
    metaEl.replaceChildren();
    const name = document.createElement('strong');
    name.className = 'detail-map-overlay__spot-name';
    name.textContent = point.label || spot.label || spot.name || '';
    metaEl.appendChild(name);
    if (point.lastSeenAt) {
      const when = document.createElement('span');
      when.className = 'detail-map-overlay__spot-when';
      when.textContent = formatRelativeTime(point.lastSeenAt) || formatSightingDate(point.lastSeenAt);
      metaEl.appendChild(when);
    }
  }

  if (noteEl) {
    noteEl.replaceChildren();
    const latest = getLatestSightingForSpot(item, resolvedSpotId);
    if (latest?.observerName || latest?.userId || latest?.note?.trim()) {
      if (latest.observerName || latest.userId) {
        const reporter = document.createElement('div');
        reporter.className = 'detail-map-overlay__reporter';
        reporter.append(
          buildMemberAvatar({
            userId: latest.userId,
            name: latest.observerName,
            avatarUrl: latest.observerAvatarUrl,
            category: item.category,
          }, { className: 'detail-map-overlay__avatar' }),
          buildMemberName({
            userId: latest.userId,
            name: latest.observerName,
            className: 'detail-map-overlay__reporter-name',
          }),
        );
        noteEl.appendChild(reporter);
      }
      if (latest.note?.trim()) {
        appendRichText(noteEl, latest.note, 'detail-map-overlay__note-text');
      }
    } else {
      const empty = document.createElement('p');
      empty.className = 'detail-map-overlay__note-empty';
      empty.textContent = t('home.detail.overlayNoReport');
      noteEl.appendChild(empty);
    }
  }

  const navBtn = overlay.querySelector('.detail-map-overlay__action--nav');
  const reportBtn = overlay.querySelector('.detail-map-overlay__action--report');
  const mapsUrl = googleMapsDirectionsUrl(item, spot);
  if (navBtn) {
    if (mapsUrl) {
      navBtn.href = mapsUrl;
      navBtn.hidden = false;
    } else {
      navBtn.hidden = true;
    }
  }
  if (reportBtn && resolvedSpotId) {
    reportBtn.href = buildSightingUrl(item.id, resolvedSpotId);
  }

  overlay.dataset.selectedSpotId = resolvedSpotId || '';
  if (resolvedSpotId) syncDetailSpotFromOverlay(item, resolvedSpotId);
}

function renderDetailMapOverlaySpots(points) {
  const overlay = detailMapOverlayEl;
  if (!overlay) return;
  const listEl = overlay.querySelector('.detail-map-overlay__spots');
  if (!listEl) return;

  const selectable = points.filter((point) => point.id);
  listEl.replaceChildren();
  listEl.hidden = selectable.length <= 1;
  selectable.forEach((point) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detail-map-overlay__spot';
    btn.dataset.spotId = point.id;
    btn.setAttribute('role', 'option');
    btn.textContent = point.label;
    btn.addEventListener('click', () => applyDetailOverlaySpotSelection(point.id));
    listEl.appendChild(btn);
  });
}

function ensureDetailMapOverlay() {
  if (detailMapOverlayEl) return detailMapOverlayEl;

  const overlay = document.createElement('div');
  overlay.className = 'detail-map-overlay';
  overlay.hidden = true;

  const top = document.createElement('div');
  top.className = 'detail-map-overlay__top';

  const navSlot = document.createElement('div');
  navSlot.className = 'detail-map-overlay__nav-slot';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'detail-map-overlay__close';
  closeBtn.setAttribute('aria-label', t('home.detail.back'));
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14 6 L8 12 L14 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span>${t('home.detail.back')}</span>`;
  closeBtn.addEventListener('click', closeDetailMapOverlay);

  top.append(closeBtn, navSlot);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'detail-map-overlay__canvas-wrap';
  const canvas = document.createElement('div');
  canvas.className = 'detail-map-overlay__canvas';
  canvasWrap.appendChild(canvas);

  const panel = document.createElement('div');
  panel.className = 'detail-map-overlay__panel';

  const list = document.createElement('div');
  list.className = 'detail-map-overlay__spots';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  const info = document.createElement('div');
  info.className = 'detail-map-overlay__spot-info';

  const meta = document.createElement('div');
  meta.className = 'detail-map-overlay__spot-meta';

  const note = document.createElement('div');
  note.className = 'detail-map-overlay__spot-note';

  info.append(meta, note);

  const actions = document.createElement('div');
  actions.className = 'detail-map-overlay__actions';

  const navBtn = document.createElement('a');
  navBtn.className = 'detail__action detail__action--nav detail-map-overlay__action--nav';
  navBtn.target = '_blank';
  navBtn.rel = 'noopener noreferrer';
  navBtn.innerHTML = `${detailActionIcon('navigate')}<span>${t('home.detail.navigateShort')}</span>`;

  const reportBtn = document.createElement('a');
  reportBtn.className = 'detail__action detail__action--primary detail-map-overlay__action--report';
  reportBtn.innerHTML = `${detailActionIcon('report')}<span>${t('home.detail.iAlsoWent')}</span>`;

  actions.append(navBtn, reportBtn);
  panel.append(list, info, actions);

  overlay.append(top, canvasWrap, panel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDetailMapOverlay();
  });
  document.body.appendChild(overlay);
  detailMapOverlayEl = overlay;
  return overlay;
}

async function openDetailMapOverlay(item, selectedSpotId) {
  const fullItem = (await ensurePhenomenonDetail(item.id)) ?? item;
  const points = resolveDetailMapPoints(fullItem);
  if (!points.length) return;

  detailMapOverlayItem = fullItem;
  detailMapOverlayPoints = points;
  detailMapOverlayCategory = fullItem.category || 'plant';
  detailMapOverlayMarkers = new Map();

  const defaultSpotId = selectedSpotId
    || getPreferredNavSpot(fullItem)?.id
    || points.find((point) => point.id)?.id
    || null;

  const overlay = ensureDetailMapOverlay();
  const canvas = overlay.querySelector('.detail-map-overlay__canvas');
  overlay.querySelector('.detail-map-overlay__nav-slot')?.replaceChildren();
  renderDetailMapOverlaySpots(points);

  overlay.hidden = false;
  detailMapOverlayScrollLock = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  overlay.querySelector('.detail-map-overlay__close')?.focus();

  if (detailMapOverlayMap) {
    detailMapOverlayMap.remove();
    detailMapOverlayMap = null;
  }

  requestAnimationFrame(() => {
    detailMapOverlayMap = L.map(canvas, {
      zoomControl: true,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(detailMapOverlayMap);

    const multi = points.length > 1;
    points.forEach((point) => {
      const active = Boolean(defaultSpotId && point.id === defaultSpotId);
      const marker = L.marker([point.lat, point.lng], {
        icon: detailSpotPinIcon(detailMapOverlayCategory, { active, dim: multi && !active }),
      }).addTo(detailMapOverlayMap);
      if (point.id) {
        detailMapOverlayMarkers.set(point.id, marker);
        marker.on('click', () => applyDetailOverlaySpotSelection(point.id));
      }
    });

    if (defaultSpotId && multi) {
      const focusPoint = points.find((point) => point.id === defaultSpotId);
      if (focusPoint) {
        detailMapOverlayMap.setView([focusPoint.lat, focusPoint.lng], 16, { animate: false });
      }
    } else if (points.length === 1) {
      detailMapOverlayMap.setView([points[0].lat, points[0].lng], 16, { animate: false });
    } else {
      detailMapOverlayMap.fitBounds(
        L.latLngBounds(points.map((point) => [point.lat, point.lng])),
        { padding: [36, 36], maxZoom: 16, animate: false },
      );
    }

    applyDetailOverlaySpotSelection(defaultSpotId || points[0]?.id);

    requestAnimationFrame(() => detailMapOverlayMap?.invalidateSize({ animate: false }));
  });
}


const TRACKED_STORAGE_KEY = 'fieldnotes.trackedPhenomena';
const TRACK_UPDATES_SEEN_KEY = 'fieldnotes.trackUpdatesSeen';

function readTrackedIds() {
  try {
    const raw = localStorage.getItem(TRACKED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isPhenomenonTracked(id) {
  return readTrackedIds().includes(id);
}

function canEditPhenomenon(item) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) return false;
  if (user.role === 'admin') return true;
  const ownerId = item?.userId ?? null;
  return ownerId != null && String(ownerId) === String(user.id);
}

function canEditSighting(sighting) {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) return false;
  if (user.role === 'admin') return true;
  return sighting.userId != null && String(sighting.userId) === String(user.id);
}

function remountOpenDetailForAuth() {
  if (!focusedCard) return;
  void (async () => {
    const detailItem = (await ensurePhenomenonDetail(focusedCard.dataset.id, { force: true }))
      ?? getItemForCard(focusedCard);
    if (feedStage.classList.contains('is-detail-open')) {
      mountSplitDetail(focusedCard, detailItem);
      return;
    }
    if (cardModal?.classList.contains('is-open')) {
      mountDetailContent(cardModalBody, focusedCard, detailItem);
      return;
    }
    if (mapSheet?.classList.contains('is-open')) {
      if (mapSheet.classList.contains('is-expanded')) mountMapSheetDetail(focusedCard, detailItem);
      else mountMapSheetPeek(focusedCard, { item: detailItem });
    }
  })();
}

function getRenderRichText() {
  return typeof globalThis.renderRichText === 'function' ? globalThis.renderRichText : null;
}

function fillRichTextContent(container, text) {
  const render = getRenderRichText();
  if (render && text) {
    container.appendChild(render(text));
    return;
  }
  if (!text) return;
  String(text).split('\n').forEach((line, index) => {
    if (index > 0) container.appendChild(document.createElement('br'));
    container.appendChild(document.createTextNode(line));
  });
}

function appendRichText(parent, text, className) {
  const el = document.createElement('div');
  if (className) el.className = className;
  el.classList.add('rich-text');
  fillRichTextContent(el, text);
  parent.appendChild(el);
  return el;
}

async function syncTrackedFromServer() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user || typeof api !== 'function') return;
  try {
    const { data } = await api('/api/me/track-ids');
    if (Array.isArray(data)) {
      localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify(data));
      document.querySelectorAll('.detail__action--track[data-id]').forEach((btn) => {
        if (btn.dataset.id) syncTrackControls(btn.dataset.id);
      });
    }
  } catch {
    // Keep local cache if offline.
  }
}

function renderTrackButton(btn, id) {
  const tracked = isPhenomenonTracked(id);
  btn.classList.toggle('is-active', tracked);
  const label = tracked ? t('home.detail.tracking') : t('home.detail.track');
  btn.innerHTML = `${detailActionIcon('heart', { filled: tracked })}<span>${label}</span>`;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', tracked ? 'true' : 'false');
}

function syncTrackControls(id) {
  document.querySelectorAll(`.detail__action--track[data-id="${id}"]`).forEach((btn) => {
    renderTrackButton(btn, id);
  });
}

function setPhenomenonTracked(id, tracked) {
  const ids = readTrackedIds();
  const next = tracked ? [...new Set([...ids, id])] : ids.filter((entry) => entry !== id);
  localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify(next));
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user && typeof api === 'function') {
    const path = tracked ? `/api/me/tracks/${id}` : `/api/me/tracks/${id}`;
    void api(path, { method: tracked ? 'POST' : 'DELETE' }).catch(() => {});
  }
  if (tracked) {
    const item = phenomenonCache.get(id);
    if (item?.updatedAt) markTrackUpdateSeen(id, item.updatedAt);
  }
  syncTrackControls(id);
}

function readTrackUpdatesSeen() {
  try {
    const raw = localStorage.getItem(TRACK_UPDATES_SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markTrackUpdateSeen(id, updatedAt) {
  const seen = readTrackUpdatesSeen();
  seen[id] = updatedAt;
  localStorage.setItem(TRACK_UPDATES_SEEN_KEY, JSON.stringify(seen));
}

function showTrackUpdateBanner(items) {
  let banner = document.getElementById('feedUpdateBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'feedUpdateBanner';
    banner.className = 'feed-update-banner';
    banner.setAttribute('role', 'status');
    feedStage?.prepend(banner);
  }
  const label = items.length === 1
    ? t('home.updates.single', { title: items[0].title })
    : t('home.updates.multi', { count: items.length });
  banner.replaceChildren();
  const text = document.createElement('p');
  text.className = 'feed-update-banner__text';
  text.textContent = label;
  banner.appendChild(text);
  if (items.length === 1) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'feed-update-banner__link';
    link.textContent = t('home.updates.view');
    link.addEventListener('click', () => {
      const card = cards.find((c) => c.dataset.id === items[0].id);
      if (card) openCardDetail(card);
      banner.remove();
    });
    banner.appendChild(link);
  }
}

function checkTrackedUpdates(items) {
  const tracked = readTrackedIds();
  if (!tracked.length) return;
  const seen = readTrackUpdatesSeen();
  const updates = items.filter((item) => {
    if (!tracked.includes(item.id) || !item.updatedAt) return false;
    const lastSeen = seen[item.id];
    if (!lastSeen) {
      markTrackUpdateSeen(item.id, item.updatedAt);
      return false;
    }
    return new Date(item.updatedAt) > new Date(lastSeen);
  });
  if (updates.length) showTrackUpdateBanner(updates);
}

function bindDetailEditLink(editLink) {
  editLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.assign(editLink.href);
  });
}

function detailActionIcon(type, { filled = false } = {}) {
  if (type === 'heart') {
    const fill = filled ? 'currentColor' : 'none';
    const stroke = filled ? 'none' : 'currentColor';
    return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 20.5 C12 20.5 4.5 15.2 4.5 9.6 C4.5 7.2 6.4 5.5 8.7 5.5 C10.1 5.5 11.3 6.2 12 7.3 C12.7 6.2 13.9 5.5 15.3 5.5 C17.6 5.5 19.5 7.2 19.5 9.6 C19.5 15.2 12 20.5 12 20.5 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  }
  if (type === 'navigate') {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 12 L20 4 L14 20 L12 13 L4 12 Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/></svg>';
  }
  if (type === 'report') {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 7 V17 M7 12 H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  if (type === 'edit') {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20 H14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/></svg>';
  }
  return '';
}

function buildSpotsSection(item) {
  const spotList = getReportedSpots(item);
  if (spotList.length <= 1) return null;

  const section = document.createElement('section');
  section.className = 'detail__spots detail__block';

  const heading = document.createElement('h4');
  heading.className = 'detail__section-title detail__section-title--spots';
  heading.textContent = t('home.detail.spotsHeading');
  section.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'detail__spot-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', t('home.detail.spotsHeading'));

  spotList.forEach((spot) => {
    const li = document.createElement('li');
    li.className = 'detail__spot-item';
    li.dataset.spotId = spot.id;
    li.setAttribute('role', 'option');
    li.tabIndex = 0;

    const name = document.createElement('span');
    name.className = 'detail__spot-name';
    name.textContent = spot.label || spot.name;
    li.appendChild(name);

    const metaParts = [];
    if (spot.lastSeenAt) {
      const when = formatRelativeTime(spot.lastSeenAt) || formatSightingDate(spot.lastSeenAt);
      if (when) metaParts.push(when);
    }
    if (metaParts.length) {
      const meta = document.createElement('span');
      meta.className = 'detail__spot-meta';
      meta.textContent = metaParts.join(' · ');
      li.appendChild(meta);
    }

    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
}

function buildSightingReportLink(item) {
  const reportLink = document.createElement('a');
  reportLink.className = 'detail__action detail__action--primary';
  const preferred = getPreferredNavSpot(item) || getReportedSpots(item)[0];
  reportLink.href = buildSightingUrl(item.id, preferred?.id);
  reportLink.innerHTML = `${detailActionIcon('report')}<span>${t('home.detail.iAlsoWent')}</span>`;
  reportLink.addEventListener('click', (e) => e.stopPropagation());
  return reportLink;
}

function buildDetailTrackButton(item) {
  const trackBtn = document.createElement('button');
  trackBtn.type = 'button';
  trackBtn.className = 'detail__action detail__action--track detail__title-track';
  trackBtn.dataset.id = item.id;
  renderTrackButton(trackBtn, item.id);
  trackBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setPhenomenonTracked(item.id, !isPhenomenonTracked(item.id));
  });
  return trackBtn;
}

function buildDetailReportHint() {
  const hint = document.createElement('p');
  hint.className = 'detail__report-hint';
  hint.textContent = t('home.detail.reportElsewhereHint');
  return hint;
}

function buildDetailMapActions(item) {
  const actions = document.createElement('div');
  actions.className = 'detail__map-actions';

  const mapsUrl = googleMapsDirectionsUrl(item);
  if (mapsUrl) {
    const navBtn = document.createElement('a');
    navBtn.className = 'detail__action detail__action--nav';
    navBtn.href = mapsUrl;
    navBtn.target = '_blank';
    navBtn.rel = 'noopener noreferrer';
    navBtn.innerHTML = `${detailActionIcon('navigate')}<span>${t('home.detail.navigateShort')}</span>`;
    navBtn.addEventListener('click', (e) => e.stopPropagation());
    actions.appendChild(navBtn);
  } else {
    actions.classList.add('detail__map-actions--solo');
  }

  const reportCol = document.createElement('div');
  reportCol.className = 'detail__map-report-col';
  reportCol.append(buildSightingReportLink(item), buildDetailReportHint());
  actions.appendChild(reportCol);

  return actions;
}

function buildDetailMapBlock(item) {
  const mapPoints = resolveDetailMapPoints(item);
  if (!mapPoints.length) {
    const wrap = document.createElement('div');
    wrap.className = 'detail__map-actions-wrap';
    wrap.append(buildDetailMapActions(item));
    wrap.classList.add('detail__actions--no-map');
    return wrap;
  }

  const block = document.createElement('section');
  block.className = 'detail__map-block';

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'detail__map-preview';
  previewBtn.setAttribute('aria-label', t('home.detail.openMap'));

  const canvas = document.createElement('div');
  canvas.className = 'detail__map-canvas';
  canvas.dataset.mapPoints = JSON.stringify(mapPoints);
  canvas.dataset.category = item.category || 'plant';
  canvas.dataset.phenomenonId = item.id;
  previewBtn.appendChild(canvas);

  const expand = document.createElement('span');
  expand.className = 'detail__map-expand';
  expand.setAttribute('aria-hidden', 'true');
  expand.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M8 4h12v12M20 4L10 14M14 20H4V10" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  previewBtn.appendChild(expand);

  previewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const hero = previewBtn.closest('.detail__hero');
    void openDetailMapOverlay(item, hero?.dataset?.selectedSpotId);
  });

  block.append(previewBtn, buildDetailMapActions(item));
  return block;
}

function bindObserverItemToggles(root = document) {
  root.querySelectorAll('.observer-item__toggle').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const item = btn.closest('.observer-item');
      if (!item) return;
      const isOpen = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });
}

function resolveObserverProfiles(item) {
  const apiObservers = item?.observers?.length ? item.observers : [];
  if (!apiObservers.length) return [];

  return apiObservers.map((observer) => {
    const bio = observer.bio?.trim() || '';
    return {
      userId: observer.userId,
      name: observer.name,
      avatarUrl: observer.avatarUrl,
      category: item.category || 'plant',
      bioParagraphs: bio ? [bio] : [],
    };
  });
}

function buildObserverAvatarShell({ name, avatarUrl, category }, { className = 'avatar--sm' } = {}) {
  const avatar = document.createElement('span');
  avatar.className = `avatar ${className}`;
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    img.className = 'detail__member-avatar-img';
    avatar.appendChild(img);
  } else {
    avatar.dataset.cat = category || 'plant';
    avatar.textContent = observerInitial(name);
  }
  return avatar;
}

function buildObserverListItem(profile) {
  const li = document.createElement('li');
  li.className = 'observer-item';
  const hasBody = profile.bioParagraphs.length > 0 || profile.userId;

  if (!hasBody) {
    const row = document.createElement('div');
    row.className = 'observer-item__row';
    row.appendChild(buildObserverAvatarShell({
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      category: profile.category,
    }));
    const name = document.createElement('span');
    name.className = 'observer-item__name';
    name.textContent = profile.name;
    row.appendChild(name);
    li.appendChild(row);
    return li;
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'observer-item__toggle';
  toggle.setAttribute('aria-expanded', 'false');

  toggle.appendChild(buildObserverAvatarShell({
    name: profile.name,
    avatarUrl: profile.avatarUrl,
    category: profile.category,
  }));

  const name = document.createElement('span');
  name.className = 'observer-item__name';
  name.textContent = profile.name;
  toggle.appendChild(name);

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('class', 'observer-item__chevron');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('width', '14');
  chevron.setAttribute('height', '14');
  chevron.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 9 L12 15 L18 9');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  chevron.appendChild(path);
  toggle.appendChild(chevron);

  const body = document.createElement('div');
  body.className = 'observer-item__body';
  const inner = document.createElement('div');
  inner.className = 'observer-item__body-inner';
  profile.bioParagraphs.forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph;
    inner.appendChild(p);
  });
  const profileUrl = memberProfileUrl(profile.userId);
  if (profileUrl) {
    const link = document.createElement('a');
    link.className = 'observer-item__link';
    link.href = profileUrl;
    link.textContent = t('home.observers.viewProfile');
    inner.appendChild(link);
  }
  body.appendChild(inner);

  li.append(toggle, body);
  return li;
}

function buildCommunityChevron() {
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('class', 'detail__community-chevron');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('width', '14');
  chevron.setAttribute('height', '14');
  chevron.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 9 L12 15 L18 9');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  chevron.appendChild(path);
  return chevron;
}

function resolveTrackerProfiles(item) {
  const apiTrackers = item?.trackers?.length ? item.trackers : [];
  return apiTrackers.map((tracker) => ({
    userId: tracker.userId,
    name: tracker.name,
    avatarUrl: tracker.avatarUrl,
    category: item.category || 'plant',
    bioParagraphs: tracker.bio?.trim() ? [tracker.bio.trim()] : [],
  }));
}

function buildCommunityAvatarStack(profiles, { max = 5, category = 'plant' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'detail__observer-avatars';
  profiles.slice(0, max).forEach((profile) => {
    const avatarShell = buildObserverAvatarShell({
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      category: profile.category || category,
    });
    const profileUrl = profile.userId ? memberProfileUrl(profile.userId) : '';
    if (profileUrl) {
      const link = document.createElement('a');
      link.className = 'detail__member-avatar-link';
      link.href = profileUrl;
      link.appendChild(avatarShell);
      wrap.appendChild(link);
    } else {
      wrap.appendChild(avatarShell);
    }
  });
  if (profiles.length > max) {
    const more = document.createElement('span');
    more.className = 'detail__observer-more';
    more.textContent = '+';
    more.setAttribute('aria-hidden', 'true');
    wrap.appendChild(more);
  }
  return wrap;
}

function buildCommunityPreviewRow(profiles, labelKey, category) {
  if (!profiles.length) return null;
  const row = document.createElement('div');
  row.className = 'detail__community-row';
  const label = document.createElement('span');
  label.className = 'detail__community-label';
  label.textContent = t(labelKey);
  row.append(label, buildCommunityAvatarStack(profiles, { category }));
  return row;
}

function buildTrackerListItem(profile) {
  const li = document.createElement('li');
  li.className = 'observer-item';
  const row = document.createElement('div');
  row.className = 'observer-item__row';
  const profileUrl = memberProfileUrl(profile.userId);
  if (profileUrl) {
    const link = document.createElement('a');
    link.className = 'detail__member-avatar-link';
    link.href = profileUrl;
    link.appendChild(buildObserverAvatarShell({
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      category: profile.category,
    }));
    row.appendChild(link);
  } else {
    row.appendChild(buildObserverAvatarShell({
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      category: profile.category,
    }));
  }
  const name = document.createElement('span');
  name.className = 'observer-item__name';
  if (profileUrl) {
    const nameLink = document.createElement('a');
    nameLink.href = profileUrl;
    nameLink.textContent = profile.name;
    name.appendChild(nameLink);
  } else {
    name.textContent = profile.name;
  }
  row.appendChild(name);
  li.appendChild(row);
  return li;
}

function mergeCommunityProfiles(reporters, trackers, { excludeUserId = null } = {}) {
  const seen = new Set();
  const merged = [];
  [...reporters, ...trackers].forEach((profile) => {
    if (excludeUserId && profile.userId === excludeUserId) return;
    const key = profile.userId || profile.name;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(profile);
  });
  return merged;
}

function buildObserversSection(item, { placement = 'inline', excludeUserId = null } = {}) {
  const sightingCount = Number(item.sightingCount ?? 0);
  const hasSightings = (item.recentSightings ?? []).length > 0;
  const reporterProfiles = (sightingCount > 0 || hasSightings) ? resolveObserverProfiles(item) : [];
  const trackerProfiles = resolveTrackerProfiles(item);
  const isInline = placement === 'inline';
  const otherProfiles = isInline
    ? mergeCommunityProfiles(reporterProfiles, trackerProfiles, { excludeUserId })
    : [];

  if (isInline && !otherProfiles.length) return null;
  if (!isInline && !reporterProfiles.length && !trackerProfiles.length) return null;

  const category = item.category || 'plant';

  if (isInline) {
    const row = document.createElement('span');
    row.className = 'detail__community-static';
    const label = document.createElement('span');
    label.className = 'detail__community-label';
    label.textContent = t('home.detail.communityCompact');
    row.append(
      buildCommunityAvatarStack(otherProfiles, { max: 5, category }),
      label,
    );
    return row;
  }

  const section = document.createElement('section');
  section.className = 'detail__observers-section detail__community';

  const preview = document.createElement('div');
  preview.className = 'detail__community-preview';
  const reportingRow = buildCommunityPreviewRow(reporterProfiles, 'home.detail.communityReporting', category);
  const trackingRow = buildCommunityPreviewRow(trackerProfiles, 'home.detail.communityTracking', category);
  if (reportingRow) preview.appendChild(reportingRow);
  if (trackingRow) preview.appendChild(trackingRow);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'detail__community-summary';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', t('home.detail.communityExpand'));
  toggle.append(preview, buildCommunityChevron());

  const panel = document.createElement('div');
  panel.className = 'detail__community-panel';
  panel.hidden = true;

  const heading = document.createElement('h4');
  heading.className = 'detail__section-title detail__section-title--observers';
  heading.textContent = t('home.detail.observersTitle');
  const intro = document.createElement('p');
  intro.className = 'detail__observers-intro';
  intro.textContent = t('home.detail.observersIntro');
  section.append(heading, intro);

  if (reporterProfiles.length) {
    const groupLabel = document.createElement('p');
    groupLabel.className = 'detail__community-group-label';
    groupLabel.textContent = t('home.detail.communityReporting');
    panel.appendChild(groupLabel);

    const list = document.createElement('ul');
    list.className = 'observer-list detail__observer-list';
    reporterProfiles.forEach((profile) => {
      list.appendChild(buildObserverListItem(profile));
    });
    panel.appendChild(list);
  }

  if (trackerProfiles.length) {
    const groupLabel = document.createElement('p');
    groupLabel.className = 'detail__community-group-label';
    groupLabel.textContent = t('home.detail.communityTracking');
    panel.appendChild(groupLabel);

    const list = document.createElement('ul');
    list.className = 'observer-list detail__observer-list detail__tracker-list';
    trackerProfiles.forEach((profile) => {
      list.appendChild(buildTrackerListItem(profile));
    });
    panel.appendChild(list);
  }

  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    section.classList.toggle('is-open', open);
    if (open) bindObserverItemToggles(panel);
  });

  section.append(toggle, panel);
  return section;
}

function buildSightingsTimeline(item) {
  const sightings = item.recentSightings ?? [];

  const wrap = document.createElement('section');
  wrap.className = 'detail__sightings';

  const heading = document.createElement('h4');
  heading.className = 'detail__section-title detail__section-title--sightings';
  heading.textContent = t('home.detail.recentSightings');
  wrap.appendChild(heading);

  if (!sightings.length) {
    const empty = document.createElement('p');
    empty.className = 'detail__sightings-empty';
    empty.textContent = t('home.detail.recentSightingsEmpty');
    wrap.appendChild(empty);
  }

  sightings.forEach((sighting, index) => {
    const entry = document.createElement('article');
    entry.className = 'detail__sighting';

    const head = document.createElement('header');
    head.className = 'detail__sighting-head';

    const author = document.createElement('div');
    author.className = 'detail__sighting-author';
    author.append(
      buildMemberAvatar({
        userId: sighting.userId,
        name: sighting.observerName,
        avatarUrl: sighting.observerAvatarUrl,
        category: item.category,
      }),
      buildMemberName({ userId: sighting.userId, name: sighting.observerName }),
    );

    const date = document.createElement('time');
    date.className = 'detail__sighting-date';
    date.dateTime = sighting.seenAt;
    const relative = formatRelativeTime(sighting.seenAt);
    const dateLabel = formatSightingDate(sighting.seenAt);
    date.textContent = relative && dateLabel
      ? `${dateLabel} · ${relative}`
      : (dateLabel || relative || '');

    head.append(author, date);
    entry.appendChild(head);

    if (sighting.spotLabel) {
      const spot = document.createElement('p');
      spot.className = 'detail__sighting-spot';
      spot.textContent = sighting.spotLabel;
      entry.appendChild(spot);
    }

    if (sighting.note) {
      appendRichText(entry, sighting.note, 'detail__sighting-note');
    }

    if (canEditSighting(sighting)) {
      const edit = document.createElement('a');
      edit.className = 'detail__sighting-edit';
      edit.href = `/sighting?edit=${encodeURIComponent(sighting.id)}`;
      edit.textContent = t('home.detail.editSighting');
      entry.appendChild(edit);
    }

    if (sighting.images?.length) {
      const photos = document.createElement('div');
      photos.className = 'detail__sighting-photos';
      const urls = sighting.images.map((image) => image.imageUrl);
      const captions = sighting.images.map((image) => image.imageAlt || '');
      sighting.images.forEach((image, imgIndex) => {
        const isVideo = isVideoMediaUrl(image.imageUrl);
        const item = document.createElement('div');
        item.className = `detail__sighting-photo-item${isVideo ? ' is-video' : ''}`;
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.setAttribute('aria-label', isVideo
          ? t('submit.photo.openVideo')
          : t('home.detail.openPhoto', { index: imgIndex + 1, total: urls.length }));
        appendMediaPreview(item, image.imageUrl, {
          alt: image.imageAlt || '',
          className: 'detail__sighting-media',
        });
        if (isVideo) {
          const video = item.querySelector('video.detail__sighting-video');
          mountMediaExpandButton(item, () => {
            openPhotoLightbox(urls, imgIndex, captions);
          });
          item.addEventListener('click', (e) => {
            if (e.target.closest('.detail-media__expand')) return;
            e.stopPropagation();
            toggleInlineVideo(video);
          });
          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleInlineVideo(video);
            }
          });
        } else {
          const open = (e) => {
            e.stopPropagation();
            openPhotoLightbox(urls, imgIndex, captions);
          };
          bindGalleryTap(item, open, { scrollRoot: urls.length > 1 ? photos : null });
          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open(e);
            }
          });
        }
        photos.appendChild(item);
      });
      entry.appendChild(photos);
    }

    wrap.appendChild(entry);
    if (index < sightings.length - 1) {
      const rule = document.createElement('hr');
      rule.className = 'detail__sighting-rule';
      wrap.appendChild(rule);
    }
  });

  const reportWrap = document.createElement('div');
  reportWrap.className = 'detail__sightings-report-wrap';
  const reportBtn = buildSightingReportLink(item);
  reportBtn.classList.add('detail__sightings-report');
  reportWrap.append(reportBtn, buildDetailReportHint());
  wrap.appendChild(reportWrap);

  return wrap;
}

function buildNotesContent(notes) {
  const container = document.createDocumentFragment();
  notes.split(/\n\n+/).filter(Boolean).forEach((block, index) => {
    const trimmed = block.trim();
    const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;

    if (/^🔎/.test(lines[0])) {
      const heading = document.createElement('h5');
      heading.className = 'detail__about-heading';
      heading.textContent = lines[0].replace(/^🔎\s*/, '');
      container.appendChild(heading);
      if (lines.length > 1) {
        const para = document.createElement('div');
        para.className = 'detail__about-para';
        fillRichTextContent(para, lines.slice(1).join('\n'));
        container.appendChild(para);
      }
      return;
    }

    if (/^⚠️/.test(lines[0])) {
      const heading = document.createElement('h5');
      heading.className = 'detail__about-heading detail__about-heading--warn';
      heading.textContent = lines[0].replace(/^⚠️\s*/, '');
      container.appendChild(heading);
      if (lines.length > 1) {
        const para = document.createElement('div');
        para.className = 'detail__about-para';
        fillRichTextContent(para, lines.slice(1).join('\n'));
        container.appendChild(para);
      }
      return;
    }

    const para = document.createElement('div');
    para.className = index === 0 ? 'detail__about-lead' : 'detail__about-para';
    fillRichTextContent(para, trimmed);
    container.appendChild(para);
  });
  return container;
}

function buildAboutSection(item) {
  if (!item.notes) return null;
  const about = document.createElement('section');
  about.className = 'detail__about';
  const heading = document.createElement('h4');
  heading.className = 'detail__section-title';
  heading.textContent = t('home.detail.aboutObservation');
  const body = document.createElement('div');
  body.className = 'detail__about-body';
  body.append(buildNotesContent(item.notes));
  about.append(heading, body);
  return about;
}

// Builds detail nodes shared by the map sheet, card modal, and split detail.
function buildDetailNodes(item) {
  const formImages = resolveFormImages(item);
  const photoWrap = buildPhotoMosaic(formImages, item.imageAlt || '', { phenomenonId: item.id });

  const body = document.createElement('div');
  body.className = 'card__body detail__hero';
  body.dataset.phenomenonId = item.id;

  const head = document.createElement('div');
  head.className = 'detail__head';

  const titleRow = document.createElement('div');
  titleRow.className = 'detail__title-row';
  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = item.title;
  titleRow.appendChild(title);

  const titleActions = document.createElement('div');
  titleActions.className = 'detail__title-actions';
  titleActions.appendChild(buildDetailTrackButton(item));
  if (canEditPhenomenon(item)) {
    const editLink = document.createElement('a');
    editLink.className = 'detail__edit-btn';
    editLink.href = `/submit?edit=${encodeURIComponent(item.id)}`;
    editLink.setAttribute('aria-label', t('home.detail.editObservation'));
    editLink.innerHTML = detailActionIcon('edit');
    bindDetailEditLink(editLink);
    titleActions.appendChild(editLink);
  }
  titleRow.appendChild(titleActions);
  head.appendChild(titleRow);

  if (item.description) {
    appendRichText(head, item.description, 'detail__summary');
  }

  appendDetailMeta(head, item);

  body.appendChild(head);

  const spotsSection = buildSpotsSection(item);
  if (spotsSection) body.appendChild(spotsSection);

  if (item.updatedAt) markTrackUpdateSeen(item.id, item.updatedAt);

  const mapBlock = buildDetailMapBlock(item);
  mapBlock.classList.add('detail__block', 'detail__block--map');
  body.appendChild(mapBlock);

  const extras = document.createElement('div');
  extras.className = 'detail__extras';

  if (item.findingHint) {
    const finding = document.createElement('section');
    finding.className = 'detail__finding';
    const heading = document.createElement('h4');
    heading.className = 'detail__section-title detail__section-title--finding';
    heading.textContent = t('submit.finding.label');
    const body = document.createElement('p');
    body.className = 'detail__finding-body';
    body.textContent = item.findingHint;
    finding.append(heading, body);
    extras.appendChild(finding);
  }

  if (extras.childElementCount) body.appendChild(extras);

  const nodes = [photoWrap, body];
  const about = buildAboutSection(item);
  const timeline = buildSightingsTimeline(item);
  if (about) nodes.push(about);
  if (timeline) nodes.push(timeline);

  return nodes;
}

function setFocusedCard(card) {
  focusedCard = card || null;
  cards.forEach((c) => c.classList.toggle('is-selected', c === focusedCard));
}

function getVisibleCards() {
  return cards.filter((c) => !c.classList.contains('is-filtered-out'));
}

function getMapPinCards() {
  return getVisibleCards().filter((c) => c.dataset.lat && c.dataset.lng && findMarkerEntry(c));
}

function fitMapToVisiblePins() {
  if (!leafletMap || mapView.classList.contains('is-hidden')) return;
  const pinCards = getMapPinCards();
  if (!pinCards.length) return;

  const latlngs = pinCards
    .map((card) => L.latLng(parseFloat(card.dataset.lat), parseFloat(card.dataset.lng)))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (!latlngs.length) return;

  if (latlngs.length === 1) {
    leafletMap.setView(latlngs[0], 15, { animate: false });
    return;
  }

  leafletMap.fitBounds(L.latLngBounds(latlngs), {
    padding: [48, 48],
    maxZoom: 15,
    animate: false,
  });
}

function navigateMapSheetPin(step) {
  const pinCards = getMapPinCards();
  if (pinCards.length < 2 || !focusedCard) return;
  let idx = pinCards.indexOf(focusedCard);
  if (idx === -1) idx = 0;
  const nextCard = pinCards[(idx + step + pinCards.length) % pinCards.length];
  const entry = findMarkerEntry(nextCard);
  if (!entry) return;

  setFocusedCard(nextCard);
  setActiveMapPin(entry.marker);
  if (mapSheet.classList.contains('is-expanded')) {
    void ensurePhenomenonDetail(nextCard.dataset.id).then((item) => {
      if (focusedCard === nextCard) mountMapSheetDetail(nextCard, item ?? getItemForCard(nextCard));
    });
  } else {
    mountMapSheetPeek(nextCard, { direction: step });
  }
  updateMapSheetPeekNav();
  scheduleCenterMapOnCard(nextCard, { animate: true, waitForPeek: true });
  scrollRailToFocusedCard();
}

function findCenterRailCard() {
  if (!mapRail || mapRail.hidden) return null;
  const railRect = mapRail.getBoundingClientRect();
  const railCenter = railRect.top + railRect.height / 2;
  const switchBand = Math.max(28, railRect.height * MAP_RAIL_CENTER_BAND);
  let bestItem = null;
  let bestDist = Infinity;
  mapRailList?.querySelectorAll('.map-rail__item').forEach((item) => {
    const rect = item.getBoundingClientRect();
    if (rect.bottom < railRect.top || rect.top > railRect.bottom) return;
    const dist = Math.abs(rect.top + rect.height / 2 - railCenter);
    if (dist > switchBand) return;
    if (dist < bestDist) {
      bestDist = dist;
      bestItem = item;
    }
  });
  if (!bestItem) return null;
  return cards.find((c) => c.dataset.id === bestItem.dataset.id) ?? null;
}

function scrollRailToFocusedCard() {
  if (!focusedCard || !mapRailList) return;
  const item = mapRailList.querySelector(`.map-rail__item[data-id="${focusedCard.dataset.id}"]`);
  item?.scrollIntoView({ block: 'nearest' });
}

function onMapRailScrollDebounced() {
  if (detailAdvanceLock || highlightedCard) return;
  window.clearTimeout(detailAdvanceTimer);
  detailAdvanceTimer = window.setTimeout(() => {
    const card = findCenterRailCard();
    if (!card || card === focusedCard) return;
    setFocusedCard(card);
    const entry = findMarkerEntry(card);
    if (entry) {
      setActiveMapPin(entry.marker);
      debouncedCenterMapOnCard(card);
    }
  }, MAP_RAIL_SCROLL_DEBOUNCE_MS);
}

function setHighlightedPin(card) {
  highlightedCard = card || null;
  markerRefs.forEach(({ marker, card: c }) => {
    const pin = marker.getElement()?.querySelector('.map-pin');
    if (!pin) return;
    const isFocused = focusedCard === c;
    pin.classList.toggle('is-highlighted', c === card && !isFocused);
  });
  mapRailList?.querySelectorAll('.map-rail__item').forEach((item) => {
    item.classList.toggle('is-hover', item.dataset.id === card?.dataset.id);
  });
}

function clearHighlightedPin() {
  highlightedCard = null;
  markerRefs.forEach(({ marker, card: c }) => {
    if (c !== focusedCard) {
      marker.getElement()?.querySelector('.map-pin')?.classList.remove('is-highlighted');
    }
  });
  mapRailList?.querySelectorAll('.map-rail__item.is-hover').forEach((item) => {
    item.classList.remove('is-hover');
  });
}

function clearMapPinActive() {
  markerRefs.forEach(({ marker }) => {
    const pin = marker.getElement()?.querySelector('.map-pin');
    pin?.classList.remove('is-active', 'is-highlighted');
  });
}

function setActiveMapPin(marker) {
  markerRefs.forEach(({ marker: m }) => {
    const pin = m.getElement()?.querySelector('.map-pin');
    if (!pin) return;
    pin.classList.toggle('is-active', m === marker);
    pin.classList.toggle('is-highlighted', false);
  });
  mapRailList?.querySelectorAll('.map-rail__item').forEach((item) => {
    item.classList.toggle('is-selected', item.dataset.id === focusedCard?.dataset.id);
  });
}

function findMarkerEntry(card) {
  return markerRefs.find(({ card: c }) => c === card);
}

function renderMapRailItem(card) {
  const item = getItemForCard(card);
  const itemEl = document.createElement('button');
  itemEl.type = 'button';
  itemEl.className = 'map-rail__item';
  itemEl.dataset.id = card.dataset.id;
  if (card.dataset.status) itemEl.dataset.status = card.dataset.status;

  const imgSrc = card.querySelector('.card__photo img')?.src;
  if (imgSrc) {
    const thumb = document.createElement('img');
    thumb.className = 'map-rail__thumb';
    thumb.src = imgSrc;
    thumb.alt = '';
    thumb.loading = 'lazy';
    itemEl.appendChild(thumb);
  }

  const body = document.createElement('div');
  body.className = 'map-rail__body';

  const title = document.createElement('span');
  title.className = 'map-rail__title';
  title.textContent = item.title;
  body.appendChild(title);

  if (resolveLocationText(item)) {
    const location = document.createElement('p');
    location.className = 'map-rail__location';
    const pin = document.createElement('span');
    pin.className = 'map-rail__location-pin';
    pin.setAttribute('aria-hidden', 'true');
    pin.textContent = '📍';
    const text = document.createElement('span');
    text.className = 'map-rail__location-text';
    text.textContent = resolveLocationText(item);
    location.append(pin, text);
    body.appendChild(location);
  }

  const seenText = buildCardSeenText(item.lastSeenAt);
  if (seenText) {
    const recent = document.createElement('p');
    recent.className = 'map-rail__activity-recent';
    recent.textContent = seenText;
    body.appendChild(recent);
  }

  itemEl.appendChild(body);

  itemEl.addEventListener('mouseenter', () => setHighlightedPin(card));
  itemEl.addEventListener('mouseleave', () => clearHighlightedPin());
  itemEl.addEventListener('click', () => {
    const entry = findMarkerEntry(card);
    if (entry) openMapSheet(card, entry.marker);
    else if (prefersSplitDetail()) openSplitDetail(card);
  });

  return itemEl;
}

function syncMapRail() {
  if (!mapRailList) return;
  mapRailList.replaceChildren();
  cards.forEach((card) => {
    if (card.classList.contains('is-filtered-out')) return;
    if (!card.dataset.lat || !card.dataset.lng) return;
    mapRailList.appendChild(renderMapRailItem(card));
  });
  if (focusedCard) {
    mapRailList.querySelectorAll('.map-rail__item').forEach((item) => {
      item.classList.toggle('is-selected', item.dataset.id === focusedCard.dataset.id);
    });
  }
}

function settleMapLayout({ pan = false, animate = false } = {}) {
  if (shouldDeferMapLayoutSync()) return;
  window.clearTimeout(mapLayoutTimer);
  mapLayoutTimer = window.setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!leafletMap || mapView.classList.contains('is-hidden')) return;
        leafletMap.invalidateSize({ animate: false });
        if (!pan) fitMapToVisiblePins();
        if (pan && focusedCard) scheduleCenterMapOnCard(focusedCard, { animate, waitForSheet: usesSheetDetail() && mapSheet.classList.contains('is-open') });
      });
    });
  }, 40);
}

function updateMapRailVisibility({ pan = false, animate = false } = {}) {
  if (!mapRail) return;
  const inMapView = !mapView.classList.contains('is-hidden');
  const detailOpen = feedStage.classList.contains('is-detail-open');
  const show = prefersMapRail() && inMapView && !detailOpen;
  mapRail.hidden = !show;
  mapRail.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (inMapView && leafletMap) settleMapLayout({ pan, animate });
}

const MAP_PIN_VISIBLE_RATIO = 0.48;
const DETAIL_SCROLL_ANCHOR_RATIO = 0.42;
const MAP_RAIL_CENTER_BAND = 0.14;
const MAP_PIN_PAN_DELAY_MS = 320;
const MAP_RAIL_SCROLL_DEBOUNCE_MS = 260;
const MAP_PEEK_PAN_DELAY_MS = 300;

function getMapPinScreenBand() {
  if (!leafletMap || prefersSplitDetail()) return null;
  const mapRect = leafletMap.getContainer().getBoundingClientRect();
  if (!mapRect.height) return null;
  let visibleTop = mapRect.top;
  if (document.body.classList.contains('is-mobile-map-view')) {
    if (sitehead) visibleTop = Math.max(visibleTop, sitehead.getBoundingClientRect().bottom);
    if (feedControls && !feedControls.classList.contains('is-floating-nav')) {
      visibleTop = Math.max(visibleTop, feedControls.getBoundingClientRect().bottom);
    }
  }
  const bar = document.getElementById('floatingbar');
  if (bar?.classList.contains('is-visible')) {
    visibleTop = Math.max(visibleTop, bar.getBoundingClientRect().bottom);
  }
  let visibleBottom = mapRect.bottom;
  if (mapSheet.classList.contains('is-open')) {
    visibleBottom = Math.min(mapRect.bottom, mapSheet.getBoundingClientRect().top);
  }
  const visibleHeight = visibleBottom - visibleTop;
  if (visibleHeight <= 4) return null;
  return { mapRect, visibleTop, visibleBottom, visibleHeight };
}

function alignMapPinToVisibleBand(latlng, { animate = false } = {}) {
  const band = getMapPinScreenBand();
  if (!leafletMap || !latlng || !band || !mapSheet.classList.contains('is-open')) return;
  const { mapRect, visibleTop, visibleHeight } = band;
  const targetY = (visibleTop + visibleHeight * MAP_PIN_VISIBLE_RATIO) - mapRect.top;
  const pinY = leafletMap.latLngToContainerPoint(latlng).y;
  const panY = pinY - targetY;
  if (Math.abs(panY) > 1) {
    leafletMap.panBy([0, panY], { animate, duration: animate ? 0.32 : 0 });
  }
}

function focusMapPinOnBand(latlng, { animate = true } = {}) {
  const band = getMapPinScreenBand();
  if (!leafletMap || !latlng || !band || !mapSheet.classList.contains('is-open')) return false;

  const { mapRect, visibleTop, visibleHeight } = band;
  const targetX = mapRect.width / 2;
  const targetY = (visibleTop + visibleHeight * MAP_PIN_VISIBLE_RATIO) - mapRect.top;
  const pinPoint = leafletMap.latLngToContainerPoint(latlng);
  const panX = pinPoint.x - targetX;
  const panY = pinPoint.y - targetY;

  if (Math.abs(panX) <= 1 && Math.abs(panY) <= 1) return true;

  const margin = 72;
  const onScreen = pinPoint.x >= -margin
    && pinPoint.x <= mapRect.width + margin
    && pinPoint.y >= -margin
    && pinPoint.y <= mapRect.height + margin;
  const maxPan = Math.max(mapRect.width, visibleHeight) * 0.72;

  if (onScreen && Math.abs(panX) <= maxPan && Math.abs(panY) <= maxPan) {
    leafletMap.panBy([panX, panY], { animate, duration: animate ? 0.32 : 0 });
    return true;
  }

  return false;
}

function centerMapOnCard(card, { animate = true, resize = true } = {}) {
  if (!leafletMap || !card?.dataset.lat || !card?.dataset.lng) return;
  const latlng = L.latLng(parseFloat(card.dataset.lat), parseFloat(card.dataset.lng));
  const zoom = leafletMap.getZoom();
  const sheetOpen = usesSheetDetail() && mapSheet.classList.contains('is-open');
  const run = () => {
    if (!shouldDeferMapLayoutSync()) leafletMap.invalidateSize({ animate: false });
    if (sheetOpen) {
      if (focusMapPinOnBand(latlng, { animate })) return;
      const flyDuration = animate ? 0.45 : 0;
      leafletMap.flyTo(latlng, zoom, { duration: flyDuration });
      if (animate) {
        leafletMap.once('moveend', () => alignMapPinToVisibleBand(latlng, { animate: true }));
      } else {
        leafletMap.once('moveend', () => alignMapPinToVisibleBand(latlng, { animate: false }));
      }
      return;
    }
    if (animate) {
      leafletMap.flyTo(latlng, zoom, { duration: 0.45 });
      return;
    }
    leafletMap.setView(latlng, zoom, { animate: false });
  };
  if (resize) requestAnimationFrame(() => requestAnimationFrame(run));
  else run();
}

function scheduleCenterMapOnCard(card, { animate = false, waitForSheet = false, waitForPeek = false } = {}) {
  window.clearTimeout(mapCenterTimer);
  const run = () => centerMapOnCard(card, { animate, resize: false });
  if (waitForSheet && mapSheet.classList.contains('is-open') && usesSheetDetail()) {
    afterMapSheetLayout(run);
    return;
  }
  const delay = waitForPeek ? MAP_PEEK_PAN_DELAY_MS : (waitForSheet ? 280 : 0);
  mapCenterTimer = window.setTimeout(run, delay);
}

function afterMapSheetLayout(callback) {
  if (!mapSheet.classList.contains('is-open')) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    mapSheet.removeEventListener('transitionend', onEnd);
    requestAnimationFrame(() => requestAnimationFrame(callback));
  };
  const onEnd = (e) => {
    if (e.target !== mapSheet) return;
    if (e.propertyName === 'transform' || e.propertyName === 'max-height' || e.propertyName === 'height') finish();
  };
  mapSheet.addEventListener('transitionend', onEnd);
  window.setTimeout(finish, 320);
}

function expandMapSheet() {
  if (!mapSheet.classList.contains('is-open') || mapSheet.classList.contains('is-expanded')) return;
  mapSheet.classList.add('is-expanded');
  mapSheetHandle?.setAttribute('aria-label', t('home.close'));
  if (focusedCard) {
    seedVideoPosterCacheFromCard(focusedCard);
    mountMapSheetDetail(focusedCard, getItemForCard(focusedCard));
  }
  updateMapSheetPeekNav();
  settleMapLayout({ pan: Boolean(focusedCard), animate: false });
  syncPhoneSheetBodyLock();
  syncMapSheetChrome();
  void ensurePhenomenonDetail(focusedCard?.dataset.id).then((item) => {
    if (!item || !focusedCard || !mapSheet.classList.contains('is-expanded')) return;
    mountMapSheetDetail(focusedCard, item);
  });
}

function pickInitialMapPinCard() {
  const pinCards = getMapPinCards();
  if (!pinCards.length) return null;
  if (focusedCard && pinCards.includes(focusedCard)) return focusedCard;
  return pinCards[0];
}

function openInitialMapPinPreview({ pan = true } = {}) {
  const card = pickInitialMapPinCard();
  if (!card) return;
  const entry = findMarkerEntry(card);
  if (!entry) return;
  setFocusedCard(card);
  setActiveMapPin(entry.marker);
  if (pan) scheduleCenterMapOnCard(card, { animate: false, waitForSheet: false });
}

function panToFocusedCard() {
  if (!focusedCard || !leafletMap) return;
  const entry = findMarkerEntry(focusedCard);
  if (!entry) return;
  setActiveMapPin(entry.marker);
  const animate = !(usesSheetDetail() && mapSheet.classList.contains('is-open'));
  centerMapOnCard(focusedCard, { animate });
}

function syncPhoneSheetBodyLock() {
  if (!usesSheetDetail()) return;
  const lock = mapSheet.classList.contains('is-open') && mapSheet.classList.contains('is-expanded');
  document.body.classList.toggle('is-detail-open', lock);
}

function syncMapSheetChrome() {
  if (!usesSheetDetail()) return;
  const open = mapSheet.classList.contains('is-open');
  const expanded = mapSheet.classList.contains('is-expanded');
  const inMap = !mapView.classList.contains('is-hidden');

  if (mapSheetHeader) mapSheetHeader.hidden = !open || !expanded;
  if (mapSheetHandle) mapSheetHandle.hidden = !open || expanded;
  if (mapSheetClose) mapSheetClose.hidden = !open || expanded;

  if (mapSheetBack) {
    mapSheetBack.setAttribute(
      'aria-label',
      t(inMap ? 'home.detail.backToMap' : 'home.detail.backToList'),
    );
  }
  if (mapSheetBackLabel) {
    mapSheetBackLabel.textContent = t('home.detail.back');
  }
}

function openPhoneDetailSheet(card, { mode = 'expanded', pan = false, marker = null } = {}) {
  hideCardModal();
  hideSplitDetail();
  setFocusedCard(card);
  if (marker) setActiveMapPin(marker);
  else if (mode === 'expanded' && mapView.classList.contains('is-hidden')) clearMapPinActive();

  const cachedItem = getItemForCard(card);
  seedVideoPosterCacheFromCard(card);

  const expanded = mode !== 'peek';
  mapSheet.classList.toggle('is-expanded', expanded);
  mapSheet.classList.add('is-open');
  mapSheetHandle?.setAttribute('aria-label', t(expanded ? 'home.close' : 'home.expandPanel'));

  if (expanded) mountMapSheetDetail(card, cachedItem);
  else mountMapSheetPeek(card, { item: cachedItem });

  updateMapSheetPeekNav();

  if (pan && !mapView.classList.contains('is-hidden')) {
    scheduleCenterMapOnCard(card, { animate: false, waitForSheet: true });
  } else if (!mapView.classList.contains('is-hidden')) {
    settleMapLayout({ pan: false, animate: false });
  }
  syncPhoneSheetBodyLock();
  syncMapSheetChrome();

  void ensurePhenomenonDetail(card.dataset.id).then((detailItem) => {
    if (!detailItem || focusedCard !== card || !mapSheet.classList.contains('is-open')) return;
    if (mapSheet.classList.contains('is-expanded')) {
      mountMapSheetDetail(card, detailItem);
    } else {
      mountMapSheetPeek(card, { item: detailItem });
    }
    updateMapSheetPeekNav();
  });
}

function openMapSheet(card, marker, { pan = true } = {}) {
  if (usesSheetDetail()) {
    void openPhoneDetailSheet(card, { mode: 'peek', pan, marker });
    return;
  }
  setFocusedCard(card);
  setActiveMapPin(marker);
  hideMapSheet();
  openSplitDetail(card);
  if (pan && !mapView.classList.contains('is-hidden')) {
    centerMapOnCard(card, { animate: false });
  }
}

function hideMapSheet() {
  mapSheet.classList.remove('is-open', 'is-expanded');
  mapSheetHandle?.setAttribute('aria-label', t('home.expandPanel'));
  mapSheetBody.replaceChildren();
  if (detailScrollRoot === mapSheetBody) {
    detailScrollRoot = null;
    detailLoopHeight = 0;
  }
  clearMapPinActive();
  updateMapSheetPeekNav();
  syncPhoneSheetBodyLock();
  syncMapSheetChrome();
  if (!mapView.classList.contains('is-hidden')) settleMapLayout({ pan: false, animate: false });
}

function closeMapSheet() {
  hideMapSheet();
  if (!feedStage.classList.contains('is-detail-open')) setFocusedCard(null);
}

mapSheetClose.addEventListener('click', closeMapSheet);
mapSheetBack?.addEventListener('click', closeMapSheet);
mapSheetHandle?.addEventListener('click', () => {
  if (!usesSheetDetail() || !mapSheet.classList.contains('is-open')) return;
  if (mapSheet.classList.contains('is-expanded')) closeMapSheet();
  else expandMapSheet();
});

let mapSheetTouchStartX = 0;
let mapSheetTouchStartY = 0;
let mapSheetTouchOnGallery = false;
let mapSheetTouchOnPeekNav = false;
let mapSheetTouchAxis = '';
function mapSheetPeekOpen() {
  return usesSheetDetail() && mapSheet.classList.contains('is-open') && !mapSheet.classList.contains('is-expanded');
}

function updateMapSheetPeekNav() {
  if (!mapSheetPeekNav) return;
  const pinCards = getMapPinCards();
  const show = usesSheetDetail() && mapSheet.classList.contains('is-open') && pinCards.length > 1;
  mapSheetPeekNav.hidden = !show;
  mapSheetPeekNav.setAttribute('aria-hidden', show ? 'false' : 'true');
  mapSheet?.classList.toggle('is-peek-multi', show);
  if (mapSheetPinDots) {
    mapSheetPinDots.replaceChildren();
    if (show) {
      pinCards.forEach((card) => {
        const dot = document.createElement('span');
        dot.className = 'map-sheet__peek-dot';
        if (card === focusedCard) dot.classList.add('is-active');
        mapSheetPinDots.appendChild(dot);
      });
    }
  }
  if (!mapSheetPinCounter || !focusedCard) return;
  const idx = pinCards.indexOf(focusedCard);
  if (show && idx >= 0) {
    mapSheetPinCounter.textContent = t('home.mapPinCounter', {
      current: idx + 1,
      total: pinCards.length,
    });
  } else {
    mapSheetPinCounter.textContent = '';
  }
}
function onMapSheetSwipeEnd(startX, startY, e) {
  const dx = e.changedTouches[0].clientX - startX;
  const dy = e.changedTouches[0].clientY - startY;
  const expanded = mapSheet.classList.contains('is-expanded');
  const peek = !expanded;
  mapSheetGestureMoved = Math.abs(dx) > 8 || Math.abs(dy) > 8;

  if (mapSheetTouchOnPeekNav) {
    mapSheetTouchAxis = '';
    mapSheetTouchOnPeekNav = false;
    return;
  }

  if (!mapSheetTouchOnGallery && (mapSheetTouchAxis === 'x' || (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 36))) {
    const pinCards = getMapPinCards();
    if (mapSheet.classList.contains('is-open') && pinCards.length > 1) {
      navigateMapSheetPin(dx < 0 ? 1 : -1);
      mapSheetTouchAxis = '';
      return;
    }
  }

  if (expanded) {
    mapSheetTouchAxis = '';
    return;
  }

  if (dy < -52 && peek && mapSheetTouchAxis !== 'x') expandMapSheet();
  else if (dy > 72 && peek && mapSheetTouchAxis !== 'x') closeMapSheet();
  mapSheetTouchAxis = '';
}
function bindMapSheetSwipe(el, { trackAxis = false } = {}) {
  el?.addEventListener('touchstart', (e) => {
    if (!usesSheetDetail() || !mapSheet.classList.contains('is-open')) return;
    mapSheetTouchStartX = e.touches[0].clientX;
    mapSheetTouchStartY = e.touches[0].clientY;
    mapSheetTouchOnGallery = Boolean(e.target.closest('.photo-mosaic'));
    mapSheetTouchOnPeekNav = Boolean(e.target.closest('.map-sheet__peek-nav-btn'));
    mapSheetTouchAxis = '';
  }, { passive: true });
  el?.addEventListener('touchmove', (e) => {
    if (!usesSheetDetail() || !mapSheet.classList.contains('is-open') || mapSheetTouchOnGallery) return;
    const dx = e.touches[0].clientX - mapSheetTouchStartX;
    const dy = e.touches[0].clientY - mapSheetTouchStartY;
    if (!mapSheetTouchAxis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      mapSheetTouchAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    if (trackAxis && mapSheetTouchAxis === 'x') e.preventDefault();
  }, { passive: false });
  el?.addEventListener('touchend', (e) => {
    if (!usesSheetDetail() || !mapSheet.classList.contains('is-open')) return;
    onMapSheetSwipeEnd(mapSheetTouchStartX, mapSheetTouchStartY, e);
  }, { passive: true });
}
bindMapSheetSwipe(mapSheetHandle);
bindMapSheetSwipe(mapSheetBody, { trackAxis: true });
bindMapSheetSwipe(mapSheetPeekNav, { trackAxis: true });
bindMapSheetPeekNavButtons();

let mapSheetTapStartX = 0;
let mapSheetTapStartY = 0;
function tryExpandMapSheetFromTap(e) {
  if (!mapSheetPeekOpen()) return;
  if (e.target.closest('a, button, .detail__map-preview, .detail__edit-btn, .detail__map-actions, .map-sheet__peek-nav-btn, .detail__action--track')) return;
  expandMapSheet();
}
mapSheetBody?.addEventListener('click', (e) => {
  if (mapSheetGestureMoved) {
    mapSheetGestureMoved = false;
    return;
  }
  tryExpandMapSheetFromTap(e);
});
mapSheetBody?.addEventListener('touchstart', (e) => {
  if (!mapSheetPeekOpen()) return;
  mapSheetGestureMoved = false;
  mapSheetTapStartX = e.touches[0].clientX;
  mapSheetTapStartY = e.touches[0].clientY;
}, { passive: true });
mapSheetBody?.addEventListener('touchend', (e) => {
  if (!mapSheetPeekOpen()) return;
  if (mapSheetTouchAxis === 'x') return;
  const dx = e.changedTouches[0].clientX - mapSheetTapStartX;
  const dy = e.changedTouches[0].clientY - mapSheetTapStartY;
  if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
  tryExpandMapSheetFromTap(e);
}, { passive: true });
mapRail?.addEventListener('scroll', onMapRailScrollDebounced, { passive: true });
feedDetailBody?.addEventListener('scroll', onDetailPaneScroll, { passive: true });
mapSheetBody?.addEventListener('scroll', onDetailPaneScroll, { passive: true });

DESKTOP_SPLIT_MQ.addEventListener('change', () => {
  updateMapRailVisibility();
});
TABLET_SPLIT_MQ.addEventListener('change', () => {
  if (!focusedCard) {
    updateMapRailVisibility();
    return;
  }
  hideCardModal();
  hideMapSheet();
  const inMap = !mapView.classList.contains('is-hidden');
  hideSplitDetail();
  if (inMap) {
    const entry = findMarkerEntry(focusedCard);
    if (entry) openMapSheet(focusedCard, entry.marker, { pan: false });
    else openSplitDetail(focusedCard);
  } else {
    openSplitDetail(focusedCard);
  }
  updateMapRailVisibility();
});

function scrollToSiteheadMenu({ instant = false } = {}) {
  const menu = document.querySelector('.sitehead__menu');
  if (!menu) return;
  const top = menu.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, top), behavior: instant ? 'instant' : 'smooth' });
}

function enterMapView() {
  hideSplitDetail();
  hideMapSheet();
  scrollToSiteheadMenu({ instant: true });
  syncMobileMapViewLayout();
  initMap();
  syncMapRail();
  fitMapToVisiblePins();
  openInitialMapPinPreview({ pan: false });
  updateMapRailVisibility({ pan: false, animate: false });
  settleMapLayout({ pan: false, animate: false });
}

const viewToggleBtns = document.querySelectorAll('.view-toggle__btn');
viewToggleBtns.forEach((btn) => btn.addEventListener('click', () => {
  if (btn.classList.contains('is-active')) return;
  viewToggleBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
  const isMap = btn.dataset.view === 'map';
  feedStage.classList.toggle('is-map-view', isMap);
  feedLayoutHost.classList.toggle('is-hidden', isMap);
  mapView.classList.toggle('is-hidden', !isMap);
  if (isMap) {
    hideCardModal();
    hideSplitDetail();
    closeMapSheet();
    enterMapView();
  } else {
    syncMobileMapViewLayout();
    hideMapSheet();
    clearMapPinActive();
    updateMapRailVisibility();
    if (focusedCard && !usesSheetDetail()) openSplitDetail(focusedCard);
    else updateDetailRailBtn();
  }
}));

function updateDetailRailBtn() {
  if (!feedDetailRailBtn) return;
  feedDetailRailBtn.hidden = true;
}

function closeMapDetailToRail() {
  if (isPhoneLayout() || mapView.classList.contains('is-hidden')) return;
  hideSplitDetail();
  scrollRailToFocusedCard();
  updateDetailRailBtn();
  if (leafletMap) settleMapLayout({ pan: false, animate: false });
}

function hideSplitDetail() {
  setFeedDetailMenuOpen(false);
  feedDetailBody.replaceChildren();
  feedDetailBody.style.paddingBottom = '';
  detailLoopHeight = 0;
  if (detailScrollRoot === feedDetailBody) detailScrollRoot = null;
  feedStage.classList.remove('is-detail-open');
  feedDetailPane.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-detail-open');
  updateMapRailVisibility();
  updateDetailRailBtn();
}

function openSplitDetail(card) {
  if (usesSheetDetail()) {
    void openPhoneDetailSheet(card, { mode: 'expanded' });
    return;
  }
  hideCardModal();
  hideMapSheet();
  setFocusedCard(card);
  updateDetailHeaderTitle(card);
  feedDetailPane.setAttribute('aria-hidden', 'false');
  feedStage.classList.add('is-detail-open');
  if (!usesSheetDetail()) document.body.classList.remove('is-detail-open');
  updateMapRailVisibility();
  updateDetailRailBtn();
  const cachedItem = getItemForCard(card);
  seedVideoPosterCacheFromCard(card);
  mountSplitDetail(card, cachedItem);
  renderFeedDetailMenu();
  setFeedDetailMenuOpen(false);
  if (!mapView.classList.contains('is-hidden')) {
    panToFocusedCard();
    requestAnimationFrame(() => scrollRailToFocusedCard());
  }
  void ensurePhenomenonDetail(card.dataset.id).then((detailItem) => {
    if (!detailItem || focusedCard !== card || !feedStage.classList.contains('is-detail-open')) return;
    mountSplitDetail(card, detailItem);
    renderFeedDetailMenu();
    if (!mapView.classList.contains('is-hidden')) {
      requestAnimationFrame(() => scrollRailToFocusedCard());
    }
  });
}

function closeSplitDetail() {
  if (usesSheetDetail() && mapSheet.classList.contains('is-open')) {
    closeMapSheet();
    return;
  }
  if (!focusedCard && !feedStage.classList.contains('is-detail-open')) return;
  const returnToMap = usesSheetDetail() && !mapView.classList.contains('is-hidden');
  hideSplitDetail();
  if (!returnToMap) clearMapPinActive();
  setFocusedCard(null);
  if (returnToMap && leafletMap) {
    requestAnimationFrame(() => leafletMap.invalidateSize({ animate: false }));
  }
}

function showFocusedCardInFeed() {
  if (!focusedCard || feedStage.classList.contains('is-detail-open')) return;
  focusedCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function resetHomeView() {
  closeSplitDetail();
  closeCardModal();
  closeMapSheet();
  const listBtn = document.querySelector('.view-toggle__btn[data-view="list"]');
  if (listBtn && !listBtn.classList.contains('is-active')) listBtn.click();
  window.scrollTo({ top: 0 });
  onScroll();
}

function openCardDetail(card) {
  if (usesSheetDetail()) {
    const inMap = !mapView.classList.contains('is-hidden');
    const entry = inMap ? findMarkerEntry(card) : null;
    if (entry) {
      void openPhoneDetailSheet(card, { mode: 'expanded', pan: true, marker: entry.marker });
    } else {
      void openPhoneDetailSheet(card, { mode: 'expanded' });
    }
    return;
  }
  if (!mapView.classList.contains('is-hidden')) {
    const entry = findMarkerEntry(card);
    if (entry) {
      openMapSheet(card, entry.marker);
      return;
    }
  }
  openSplitDetail(card);
  if (!mapView.classList.contains('is-hidden')) panToFocusedCard();
}

function openCardModal(card) {
  setFocusedCard(card);
  mountDetailContent(cardModalBody, card);
  cardModal.classList.add('is-open');
}
function hideCardModal() {
  cardModal.classList.remove('is-open');
}
function closeCardModal() {
  hideCardModal();
  setFocusedCard(null);
}
feedDetailRailBtn?.addEventListener('click', closeMapDetailToRail);
feedDetailHeaderClose?.addEventListener('click', closeSplitDetail);
feedDetailMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const opening = feedDetailMenuPanel.hidden;
  if (opening) renderFeedDetailMenu();
  setFeedDetailMenuOpen(opening);
});
document.addEventListener('click', (e) => {
  if (!feedDetailMenuPanel || feedDetailMenuPanel.hidden) return;
  if (e.target.closest('.feed-detail__menu-btn') || e.target.closest('.feed-detail__menu-panel')) return;
  setFeedDetailMenuOpen(false);
});

let detailTouchStartY = 0;
feedDetailPane?.addEventListener('touchstart', (e) => {
  if (!isPhoneLayout() || !feedStage.classList.contains('is-detail-open')) return;
  detailTouchStartY = e.touches[0].clientY;
}, { passive: true });
feedDetailPane?.addEventListener('touchend', (e) => {
  if (!isPhoneLayout() || !feedStage.classList.contains('is-detail-open')) return;
  const dy = e.changedTouches[0].clientY - detailTouchStartY;
  if (dy > 72 && feedDetailBody.scrollTop <= 4) closeSplitDetail();
}, { passive: true });
cardModalClose.addEventListener('click', closeCardModal);
cardModalBackdrop.addEventListener('click', closeCardModal);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (detailMapOverlayEl && !detailMapOverlayEl.hidden) {
      closeDetailMapOverlay();
      return;
    }
    if (feedDetailMenuPanel && !feedDetailMenuPanel.hidden) {
      setFeedDetailMenuOpen(false);
      return;
    }
    closeCardModal();
    closeSplitDetail();
    closeMapSheet();
  }
});

document.querySelectorAll('.observer-item__toggle').forEach((btn) => {
  if (btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const item = btn.closest('.observer-item');
    if (!item) return;
    const isOpen = item.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
});

const floatingbar = document.getElementById('floatingbar');
const feedControls = document.getElementById('feedControls');
const sitehead = document.querySelector('.sitehead');
const onScroll = () => {
  const floatingVisible = window.scrollY > sitehead.offsetHeight - 48;
  const toolbarPanelOpen = isFeedToolbarPanelOpen();
  const useFloatingNav = floatingVisible && isPhoneLayout();
  floatingbar.classList.toggle('is-visible', floatingVisible);
  if (!toolbarPanelOpen) {
    feedControls?.classList.toggle('is-floating-nav', useFloatingNav);
  }
  if (!toolbarPanelOpen && useFloatingNav !== onScroll.lastFloatingVisible) {
    onScroll.lastFloatingVisible = useFloatingNav;
    if (!mapView.classList.contains('is-hidden') && leafletMap) {
      settleMapLayout({ pan: false, animate: false });
    }
  } else if (toolbarPanelOpen) {
    onScroll.lastFloatingVisible = feedControls?.classList.contains('is-floating-nav');
  }
  if (!floatingVisible && !toolbarPanelOpen) {
    closeFloatingPanels();
    window.closeAllLangPanels?.();
  }
  updateFeedStickyTop();
  syncMobileMapViewLayout();
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => {
  if (detailScrollRoot) detailLoopHeight = measureDetailLoopHeight();
  syncMobileMapViewLayout();
  syncMapLayoutOnly();
  syncMapSheetPeekLayout();
}, { passive: true });
window.visualViewport?.addEventListener('resize', () => {
  if (shouldDeferMapLayoutSync()) return;
  syncMobileMapViewLayout();
  syncMapLayoutOnly();
}, { passive: true });

document.querySelectorAll('a.brand-mark[href="#top"]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    resetHomeView();
  });
});
document.querySelector('.sitehead .brand-mark')?.addEventListener('click', resetHomeView);

function showFeedMessage(message) {
  closeSplitDetail();
  gridFeed.classList.remove('grid-feed--loading');
  gridFeed.removeAttribute('aria-busy');
  const p = document.createElement('p');
  p.className = 'grid-feed__message';
  p.textContent = message;
  gridFeed.replaceChildren(p);
  cards = [];
  clearMapMarkers();
}

function bindFeedCards(nodes) {
  nodes.forEach((card) => card.addEventListener('click', () => openCardDetail(card)));
}

function mountFeedCards(items) {
  gridFeed.classList.remove('grid-feed--loading');
  gridFeed.removeAttribute('aria-busy');
  const nodes = items.map((item, index) => renderCard(item, { eagerImage: index < 8 }));
  const firstBatch = Math.min(8, nodes.length);
  gridFeed.replaceChildren(...nodes.slice(0, firstBatch));
  bindFeedCards(nodes.slice(0, firstBatch));
  cards = nodes.slice(0, firstBatch);

  const finishFeedMount = () => {
    if (nodes.length > firstBatch) {
      gridFeed.append(...nodes.slice(firstBatch));
      bindFeedCards(nodes.slice(firstBatch));
    }
    cards = nodes;
    if (leafletMap) addMapMarkers();
    applyFilters();
  };

  if (nodes.length > firstBatch) {
    requestAnimationFrame(finishFeedMount);
  } else {
    finishFeedMount();
  }
}

async function loadPhenomena() {
  try {
    const [, payloadOrNull] = await Promise.all([
      i18nReady,
      phenomenaFetchPromise.catch(() => null),
    ]);
    let payload = payloadOrNull;
    if (!payload || bootstrapFeedLocale() !== getLocale()) {
      const res = await fetch('/api/phenomena', {
        headers: { 'Accept-Language': getLocale() },
        credentials: 'same-origin',
        priority: 'high',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
    }
    const items = payload.data ?? [];
    if (!items.length) {
      showFeedMessage(t('home.feed.empty'));
      return;
    }
    cachePhenomena(items);
    items.sort((a, b) => {
      const aRecent = new Date(a.lastSeenAt || a.lastNoticedAt || 0).getTime();
      const bRecent = new Date(b.lastSeenAt || b.lastNoticedAt || 0).getTime();
      if (bRecent !== aRecent) return bRecent - aRecent;
      const aCreated = new Date(a.createdAt || 0).getTime();
      const bCreated = new Date(b.createdAt || 0).getTime();
      return bCreated - aCreated;
    });
    mountFeedCards(items);
    requestAnimationFrame(() => checkTrackedUpdates(items));
  } catch (err) {
    console.error(err);
    showFeedMessage(t('home.feed.error'));
  }
}

// Start weather and feed fetch immediately so they never gate first paint.
loadWeather();
const phenomenaBootPromise = loadPhenomena();

(async () => {
  await i18nReady;
  formatToday();
  syncFloatingLangOptions();
  initAboutBird();
  document.addEventListener('fn:user-updated', () => {
    remountOpenDetailForAuth();
  });
  const userPromise = typeof refreshCurrentUser === 'function'
    ? refreshCurrentUser().catch(() => {})
    : Promise.resolve();
  await Promise.all([phenomenaBootPromise, userPromise]);
  void syncTrackedFromServer();
  captureDeepLinkSpotId();
  const deepLinkId = new URLSearchParams(location.search).get('phenomenon');
  if (deepLinkId && sessionStorage.getItem(REFRESH_PHENOMENON_KEY) === deepLinkId) {
    await ensurePhenomenonDetail(deepLinkId);
  }
  if (deepLinkId) {
    const card = cards.find((c) => c.dataset.id === deepLinkId);
    if (card) openCardDetail(card);
  }
  updateDetailRailBtn();
})();
