const REPORT_FORM_URL = 'https://forms.gle/Ln8WBNaK5s8fggTYA';

const feedStage = document.getElementById('feedStage');
const feedLayoutHost = document.getElementById('feedLayoutHost');
const mapRail = document.getElementById('mapRail');
const mapRailList = document.getElementById('mapRailList');
const gridFeed = document.getElementById('gridFeed');
const feedDetailPane = document.getElementById('feedDetailPane');
const feedDetailBody = document.getElementById('feedDetailBody');
const feedDetailHeader = document.getElementById('feedDetailHeader');
const feedDetailHeaderTitle = document.getElementById('feedDetailHeaderTitle');
const feedDetailMenuBtn = document.getElementById('feedDetailMenuBtn');
const feedDetailMenuPanel = document.getElementById('feedDetailMenuPanel');
const feedDetailMenuList = document.getElementById('feedDetailMenuList');
const feedDetailHeaderClose = document.getElementById('feedDetailHeaderClose');
const feedDetailClose = document.getElementById('feedDetailClose');
const mapView = document.getElementById('mapView');
const mapSheet = document.getElementById('mapSheet');
const mapSheetBody = document.getElementById('mapSheetBody');
const mapSheetClose = document.getElementById('mapSheetClose');
const mapSheetHandle = document.getElementById('mapSheetHandle');
const mapSheetPeekNav = document.getElementById('mapSheetPeekNav');
const mapSheetPinDots = document.getElementById('mapSheetPinDots');
const mapSheetPinCounter = document.getElementById('mapSheetPinCounter');
const cardModal = document.getElementById('cardModal');
const cardModalBody = document.getElementById('cardModalBody');
const cardModalClose = document.getElementById('cardModalClose');
const cardModalBackdrop = document.getElementById('cardModalBackdrop');

let cards = [];
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
const DESKTOP_SPLIT_MQ = window.matchMedia('(min-width: 980px)');

function prefersSplitDetail() {
  return TABLET_SPLIT_MQ.matches;
}

function prefersMapRail() {
  return DESKTOP_SPLIT_MQ.matches;
}

function isPhoneLayout() {
  return !TABLET_SPLIT_MQ.matches;
}

// Zuoying (左營), Kaohsiung — placeholder until a Google Maps API key replaces this OSM view.
const ZUOYING_CENTER = [22.688, 120.297];
let leafletMap = null;
const markerRefs = [];

function statusLabel(status) {
  return t(`status.${status}`) || t('status.active');
}

function applyFilters() {
  const catActive = selectedCats.size > 0;
  cards.forEach((c) => {
    c.classList.toggle('is-filtered-out', catActive && !selectedCats.has(c.dataset.category));
  });
  markerRefs.forEach(({ marker, card }) => {
    const show = !catActive || selectedCats.has(card.dataset.category);
    if (!leafletMap) return;
    if (show && !leafletMap.hasLayer(marker)) marker.addTo(leafletMap);
    if (!show && leafletMap.hasLayer(marker)) marker.remove();
  });
  syncMapRail();
  remountOpenDetail();
}

function remountOpenDetail() {
  const keep = focusedCard && !focusedCard.classList.contains('is-filtered-out')
    ? focusedCard
    : getVisibleCards()[0];
  if (feedStage.classList.contains('is-detail-open')) {
    mountContinuousDetail(feedDetailBody, { scrollTo: keep });
    if (keep) syncFocusedFromDetailScroll(keep);
    renderFeedDetailMenu();
  } else if (isPhoneLayout() && mapSheet.classList.contains('is-open') && keep) {
    if (mapSheet.classList.contains('is-expanded')) {
      mountMapSheetDetail(keep);
      setFocusedCard(keep);
      const entry = findMarkerEntry(keep);
      if (entry) setActiveMapPin(entry.marker);
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

const floatingSearchBtn = document.getElementById('floatingSearchBtn');
const floatingSearchPanel = document.getElementById('floatingSearchPanel');
const floatingLangBtn = document.getElementById('floatingLangBtn');
const floatingLangPanel = document.getElementById('floatingLangPanel');
function updateFeedStickyTop() {
  let stickyTop = 16;
  if (floatingbar?.classList.contains('is-visible')) {
    stickyTop = Math.max(stickyTop, floatingbar.getBoundingClientRect().bottom + 8);
  }
  document.documentElement.style.setProperty('--feed-sticky-top', `${stickyTop}px`);
}
function setFloatingSearchOpen(open) {
  if (!floatingSearchBtn || !floatingSearchPanel) return;
  if (open) setFloatingLangOpen(false);
  floatingSearchPanel.hidden = !open;
  floatingSearchBtn.classList.toggle('is-open', open);
  floatingSearchBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  updateFeedStickyTop();
}
function setFloatingLangOpen(open) {
  if (!floatingLangBtn || !floatingLangPanel) return;
  if (open) {
    setFloatingSearchOpen(false);
    window.closeAllLangPanels?.();
  }
  floatingLangPanel.hidden = !open;
  floatingLangBtn.classList.toggle('is-open', open);
  floatingLangBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  updateFeedStickyTop();
}
function closeFloatingPanels() {
  setFloatingSearchOpen(false);
  setFloatingLangOpen(false);
}
window.closeFloatingSearch = () => setFloatingSearchOpen(false);
floatingSearchBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setFloatingSearchOpen(floatingSearchPanel.hidden);
});
floatingLangBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setFloatingLangOpen(floatingLangPanel.hidden);
});
document.querySelectorAll('.floatingbar__lang-option').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const locale = btn.dataset.locale;
    if (locale && locale !== getLocale()) setLocale(locale);
    else setFloatingLangOpen(false);
  });
});
function syncFloatingLangOptions() {
  const locale = getLocale();
  document.querySelectorAll('.floatingbar__lang-option').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.locale === locale);
  });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.floatingbar__search-panel') || e.target.closest('.floatingbar__search-btn')) return;
  if (e.target.closest('.floatingbar__lang-panel') || e.target.closest('.floatingbar__lang-btn')) return;
  const panelOpen = (floatingSearchPanel && !floatingSearchPanel.hidden)
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
  const parts = new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', weekday: 'long' }).formatToParts(d);
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

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=22.688&longitude=120.297&current=temperature_2m,weather_code&timezone=Asia%2FTaipei';

async function loadWeather() {
  const weatherEl = document.getElementById('weatherText');
  if (!weatherEl) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    // Low priority so feed/API work isn't starved; overlaps i18n load.
    const res = await fetch(WEATHER_URL, {
      signal: controller.signal,
      priority: 'low',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await i18nReady;
    const temp = Math.round(data.current.temperature_2m);
    const desc = weatherTextForCode(data.current.weather_code);
    weatherEl.textContent = `${desc} ${temp}°C`;
  } catch {
    await i18nReady;
    weatherEl.textContent = t('home.weatherUnavailable');
  } finally {
    clearTimeout(timer);
  }
}

function observerInitial(name) {
  if (!name) return '?';
  return Array.from(name)[0];
}

function resolveImageUrls(item) {
  if (Array.isArray(item.imageUrls) && item.imageUrls.length) return item.imageUrls;
  const urls = item.imageUrl ? [item.imageUrl] : [];
  // Demo: multi-photo gallery until submissions store imageUrls[].
  if (item.title === '棋盤腳進入花季' && urls.length === 1) {
    return [
      urls[0],
      '/media/phenomena/bougainvillea.jpg',
      '/media/phenomena/longan.jpg',
    ];
  }
  return urls;
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

function buildPhotoGallery(urls, alt = '') {
  const gallery = document.createElement('div');
  gallery.className = 'photo-gallery';
  if (urls.length <= 1) gallery.classList.add('photo-gallery--single');

  const track = document.createElement('div');
  track.className = 'photo-gallery__track';
  track.setAttribute('role', 'region');
  track.setAttribute('aria-roledescription', 'carousel');
  track.setAttribute('aria-label', alt || t('home.detail.photos'));

  urls.forEach((url, i) => {
    const slide = document.createElement('div');
    slide.className = 'photo-gallery__slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${i + 1} / ${urls.length}`);
    const img = document.createElement('img');
    img.src = url;
    img.alt = i === 0 ? alt : '';
    img.loading = i === 0 ? 'eager' : 'lazy';
    slide.appendChild(img);
    track.appendChild(slide);
  });

  gallery.appendChild(track);

  if (urls.length > 1) {
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'photo-gallery__nav photo-gallery__nav--prev';
    prev.setAttribute('aria-label', t('home.detail.prevPhoto'));
    prev.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14 6 L8 12 L14 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'photo-gallery__nav photo-gallery__nav--next';
    next.setAttribute('aria-label', t('home.detail.nextPhoto'));
    next.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M10 6 L16 12 L10 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

    const counter = document.createElement('span');
    counter.className = 'photo-gallery__counter';
    counter.textContent = `1 / ${urls.length}`;

    gallery.append(prev, next, counter);
  }

  return gallery;
}

function initPhotoGallery(gallery) {
  const track = gallery.querySelector('.photo-gallery__track');
  const slides = [...gallery.querySelectorAll('.photo-gallery__slide')];
  if (!track || slides.length <= 1) return;

  const prev = gallery.querySelector('.photo-gallery__nav--prev');
  const next = gallery.querySelector('.photo-gallery__nav--next');
  const counter = gallery.querySelector('.photo-gallery__counter');
  let index = 0;
  let scrollTimer = 0;

  const syncIndex = () => {
    const anchor = track.scrollLeft + track.clientWidth * 0.15;
    index = slides.reduce((best, slide, i) => {
      const dist = Math.abs(slide.offsetLeft - anchor);
      return dist < best.dist ? { i, dist } : best;
    }, { i: 0, dist: Infinity }).i;
    counter.textContent = `${index + 1} / ${slides.length}`;
    prev.disabled = index === 0;
    next.disabled = index === slides.length - 1;
  };

  const goTo = (i) => {
    index = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: slides[index].offsetLeft, behavior: 'smooth' });
    counter.textContent = `${index + 1} / ${slides.length}`;
    prev.disabled = index === 0;
    next.disabled = index === slides.length - 1;
  };

  prev.addEventListener('click', () => goTo(index - 1));
  next.addEventListener('click', () => goTo(index + 1));
  track.addEventListener('scroll', () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(syncIndex, 80);
  }, { passive: true });

  syncIndex();
}

function mountDetailContent(container, card) {
  container.replaceChildren(...buildDetailNodes(card));
  container.querySelectorAll('.photo-gallery').forEach(initPhotoGallery);
}

function buildDetailSection(card, { loop = '' } = {}) {
  const section = document.createElement('section');
  section.className = 'feed-detail__section';
  section.dataset.id = card.dataset.id;
  if (loop) section.dataset.loop = loop;
  section.append(...buildDetailNodes(card));
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

function createPeekColButton(step) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `map-sheet__peek-col-btn map-sheet__peek-col-btn--${step < 0 ? 'prev' : 'next'}`;
  btn.setAttribute('aria-label', t(step < 0 ? 'home.mapPrevPin' : 'home.mapNextPin'));
  const path = step < 0 ? 'M14 6 L8 12 L14 18' : 'M10 6 L16 12 L10 18';
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateMapSheetPin(step);
  });
  return btn;
}

function mountMapSheetDetail(card) {
  detailScrollRoot = null;
  detailLoopHeight = 0;
  mapSheetBody.replaceChildren();
  mapSheetBody.style.paddingBottom = '';
  mapSheetBody.scrollTop = 0;
  if (!card) return;
  const section = buildDetailSection(card);
  mapSheetBody.appendChild(section);
  section.querySelectorAll('.photo-gallery').forEach(initPhotoGallery);
}

function mountMapSheetPeek(card, { direction = 0 } = {}) {
  detailScrollRoot = null;
  detailLoopHeight = 0;
  mapSheetBody.replaceChildren();
  mapSheetBody.style.paddingBottom = '';
  mapSheetBody.scrollTop = 0;
  if (direction > 0) mapSheetBody.dataset.peekDirection = 'next';
  else if (direction < 0) mapSheetBody.dataset.peekDirection = 'prev';
  else delete mapSheetBody.dataset.peekDirection;
  if (!card) return;

  const multi = getMapPinCards().length > 1;
  const row = document.createElement('div');
  row.className = 'map-sheet__peek-row';

  if (multi) row.appendChild(createPeekColButton(-1));

  row.appendChild(buildDetailSection(card));

  if (multi) row.appendChild(createPeekColButton(1));

  mapSheetBody.appendChild(row);
  row.querySelectorAll('.photo-gallery').forEach(initPhotoGallery);

  if (direction) {
    window.setTimeout(() => { delete mapSheetBody.dataset.peekDirection; }, 260);
  }
}

function mountContinuousDetail(container, { scrollTo } = {}) {
  detailScrollRoot = container;
  container.replaceChildren();
  container.style.paddingBottom = '';
  const visible = getVisibleCards();
  visible.forEach((card) => container.appendChild(buildDetailSection(card)));
  if (!isPhoneLayout()) {
    visible.forEach((card) => container.appendChild(buildDetailSection(card, { loop: 'after' })));
  }
  container.querySelectorAll('.photo-gallery').forEach(initPhotoGallery);
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
  const anchor = section.querySelector('.photo-gallery') || section;
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
  const anchor = containerRect.top + 20;
  const sections = [...detailScrollRoot.querySelectorAll('.feed-detail__section')];
  let active = null;

  for (const section of sections) {
    const gallery = section.querySelector('.photo-gallery');
    if (!gallery) continue;
    if (gallery.getBoundingClientRect().top <= anchor + 1) active = section;
    else if (active) break;
  }

  return active || sections[0] || null;
}

function isDetailStreamActive() {
  if (feedStage.classList.contains('is-detail-open')) return true;
  return isPhoneLayout()
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
  const animate = !(isPhoneLayout() && mapSheet.classList.contains('is-open'));
  mapPanTimer = window.setTimeout(() => centerMapOnCard(card, { animate }), 220);
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

function renderCard(item) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = item.id;
  card.dataset.status = item.status;
  card.dataset.category = item.category;
  if (item.lat != null) card.dataset.lat = String(item.lat);
  if (item.lng != null) card.dataset.lng = String(item.lng);
  if (item.location) card.dataset.location = item.location;
  if (item.notes) card.dataset.notes = item.notes;

  const imageUrls = resolveImageUrls(item);
  if (imageUrls.length) card.dataset.imageUrls = JSON.stringify(imageUrls);

  const photo = document.createElement('div');
  photo.className = 'card__photo';
  if (imageUrls[0]) {
    const img = document.createElement('img');
    img.src = imageUrls[0];
    img.alt = item.imageAlt || '';
    img.loading = 'lazy';
    photo.appendChild(img);
  }

  const body = document.createElement('div');
  body.className = 'card__body';

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.innerHTML = '<span class="dot"></span>';
  pill.append(statusLabel(item.status));

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = item.title;

  const desc = document.createElement('p');
  desc.className = 'card__desc';
  desc.textContent = item.description;

  body.append(pill, title, desc);

  if (item.observerName) {
    const observer = document.createElement('div');
    observer.className = 'card__observer';
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.dataset.cat = item.category;
    avatar.textContent = observerInitial(item.observerName);
    const name = document.createElement('span');
    name.textContent = item.observerName;
    observer.append(avatar, name);
    body.appendChild(observer);
  }

  if (item.metaLabel) {
    const meta = document.createElement('p');
    meta.className = 'card__meta';
    meta.textContent = item.metaLabel;
    body.appendChild(meta);
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

function initMap() {
  if (leafletMap) {
    addMapMarkers();
    return;
  }
  leafletMap = L.map('mapCanvas').setView(ZUOYING_CENTER, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(leafletMap);
  addMapMarkers();
}

// Builds the [gallery, body] nodes shared by the map sheet, card modal, and split detail.
function buildDetailNodes(card) {
  const alt = card.querySelector('.card__photo img')?.alt || '';
  const photoWrap = buildPhotoGallery(getCardImageUrls(card), alt);

  const body = document.createElement('div');
  body.className = 'card__body';
  const pill = card.querySelector('.pill');
  if (pill) body.appendChild(pill.cloneNode(true));

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = card.querySelector('.card__title')?.textContent || '';
  const desc = document.createElement('p');
  desc.className = 'card__desc';
  desc.textContent = card.querySelector('.card__desc')?.textContent || '';
  body.append(title, desc);

  const observer = card.querySelector('.card__observer');
  if (observer) {
    const observerRow = observer.cloneNode(true);
    observerRow.classList.add('detail__observer');
    body.appendChild(observerRow);
  }

  if (card.dataset.location) {
    const locationRow = document.createElement('p');
    locationRow.className = 'detail__row';
    const strong = document.createElement('strong');
    strong.textContent = t('home.detail.location');
    locationRow.append(strong, ' ' + card.dataset.location);
    body.appendChild(locationRow);
  }

  const metaText = card.querySelector('.card__meta')?.textContent;
  if (metaText) {
    const meta = document.createElement('p');
    meta.className = 'detail__row';
    const strong = document.createElement('strong');
    strong.textContent = t('home.detail.lastSeen');
    meta.append(strong, ' ' + metaText);
    body.appendChild(meta);
  }

  if (card.dataset.notes) {
    const notesRow = document.createElement('p');
    notesRow.className = 'detail__row';
    const strong = document.createElement('strong');
    strong.textContent = t('home.detail.notes');
    notesRow.append(strong, ' ' + card.dataset.notes);
    body.appendChild(notesRow);
  }

  const cta = document.createElement('a');
  cta.className = 'detail__cta';
  cta.href = REPORT_FORM_URL;
  cta.target = '_blank';
  cta.rel = 'noopener';
  cta.textContent = t('home.detail.reportCta');
  body.appendChild(cta);

  return [photoWrap, body];
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
  mountMapSheetPeek(nextCard, { direction: step });
  updateMapSheetPeekNav();
  scheduleCenterMapOnCard(nextCard, { animate: false });
  scrollRailToFocusedCard();
}

function findCenterRailCard() {
  if (!mapRail || mapRail.hidden) return null;
  const railRect = mapRail.getBoundingClientRect();
  const railCenter = railRect.top + railRect.height / 2;
  let bestItem = null;
  let bestDist = Infinity;
  mapRailList?.querySelectorAll('.map-rail__item').forEach((item) => {
    const rect = item.getBoundingClientRect();
    if (rect.bottom < railRect.top || rect.top > railRect.bottom) return;
    const dist = Math.abs(rect.top + rect.height / 2 - railCenter);
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
  }, 140);
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
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'map-rail__item';
  item.dataset.id = card.dataset.id;
  if (card.dataset.status) item.dataset.status = card.dataset.status;

  const imgSrc = card.querySelector('.card__photo img')?.src;
  if (imgSrc) {
    const thumb = document.createElement('img');
    thumb.className = 'map-rail__thumb';
    thumb.src = imgSrc;
    thumb.alt = '';
    thumb.loading = 'lazy';
    item.appendChild(thumb);
  }

  const body = document.createElement('div');
  body.className = 'map-rail__body';

  const pill = card.querySelector('.pill');
  if (pill) body.appendChild(pill.cloneNode(true));

  const title = document.createElement('span');
  title.className = 'map-rail__title';
  title.textContent = card.querySelector('.card__title')?.textContent || '';
  body.appendChild(title);

  const observer = card.querySelector('.card__observer');
  if (observer) body.appendChild(observer.cloneNode(true));

  item.appendChild(body);

  item.addEventListener('mouseenter', () => setHighlightedPin(card));
  item.addEventListener('mouseleave', () => clearHighlightedPin());
  item.addEventListener('click', () => {
    const entry = findMarkerEntry(card);
    if (entry) openMapSheet(card, entry.marker);
    else if (prefersSplitDetail()) openSplitDetail(card);
  });

  return item;
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
  window.clearTimeout(mapLayoutTimer);
  mapLayoutTimer = window.setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!leafletMap || mapView.classList.contains('is-hidden')) return;
        leafletMap.invalidateSize({ animate: false });
        if (pan && focusedCard) scheduleCenterMapOnCard(focusedCard, { animate, waitForSheet: isPhoneLayout() && mapSheet.classList.contains('is-open') });
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

function getMapPinScreenBand() {
  if (!leafletMap || prefersSplitDetail()) return null;
  const mapRect = leafletMap.getContainer().getBoundingClientRect();
  if (!mapRect.height) return null;
  let visibleTop = mapRect.top;
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

function alignMapPinToVisibleBand(latlng) {
  const band = getMapPinScreenBand();
  if (!leafletMap || !latlng || !band || !mapSheet.classList.contains('is-open')) return;
  const { mapRect, visibleTop, visibleHeight } = band;
  const targetY = (visibleTop + visibleHeight * MAP_PIN_VISIBLE_RATIO) - mapRect.top;
  const pinY = leafletMap.latLngToContainerPoint(latlng).y;
  const panY = pinY - targetY;
  if (Math.abs(panY) > 1) leafletMap.panBy([0, panY], { animate: false });
}

function centerMapOnCard(card, { animate = true, resize = true } = {}) {
  if (!leafletMap || !card?.dataset.lat || !card?.dataset.lng) return;
  const latlng = L.latLng(parseFloat(card.dataset.lat), parseFloat(card.dataset.lng));
  const zoom = Math.max(leafletMap.getZoom(), 15);
  const alignAfterMove = isPhoneLayout() && mapSheet.classList.contains('is-open');
  const run = () => {
    leafletMap.invalidateSize({ animate: false });
    if (animate && !alignAfterMove) {
      leafletMap.flyTo(latlng, zoom, { duration: 0.45 });
      leafletMap.once('moveend', () => alignMapPinToVisibleBand(latlng));
      return;
    }
    leafletMap.setView(latlng, zoom, { animate: false });
    alignMapPinToVisibleBand(latlng);
  };
  if (resize) requestAnimationFrame(() => requestAnimationFrame(run));
  else run();
}

function scheduleCenterMapOnCard(card, { animate = false, waitForSheet = false } = {}) {
  window.clearTimeout(mapCenterTimer);
  const run = () => centerMapOnCard(card, { animate, resize: false });
  if (waitForSheet && mapSheet.classList.contains('is-open') && isPhoneLayout()) {
    afterMapSheetLayout(run);
    return;
  }
  mapCenterTimer = window.setTimeout(run, waitForSheet ? 280 : 0);
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
  mapSheetHandle?.setAttribute('aria-label', t('home.collapsePanel'));
  if (focusedCard) mountMapSheetDetail(focusedCard);
  updateMapSheetPeekNav();
  settleMapLayout({ pan: Boolean(focusedCard), animate: false });
}

function collapseMapSheet() {
  if (!mapSheet.classList.contains('is-expanded')) return;
  mapSheet.classList.remove('is-expanded');
  mapSheetHandle?.setAttribute('aria-label', t('home.expandPanel'));
  if (focusedCard) mountMapSheetPeek(focusedCard);
  updateMapSheetPeekNav();
  settleMapLayout({ pan: Boolean(focusedCard), animate: false });
}

function pickInitialMapPinCard() {
  const pinCards = getMapPinCards();
  if (!pinCards.length) return null;
  if (focusedCard && pinCards.includes(focusedCard)) return focusedCard;
  return pinCards[0];
}

function openInitialMapPinPreview() {
  const card = pickInitialMapPinCard();
  if (!card) return;
  const entry = findMarkerEntry(card);
  if (!entry) return;
  openMapSheet(card, entry.marker, { pan: true });
}

function panToFocusedCard() {
  if (!focusedCard || !leafletMap) return;
  const entry = findMarkerEntry(focusedCard);
  if (!entry) return;
  setActiveMapPin(entry.marker);
  const animate = !(isPhoneLayout() && mapSheet.classList.contains('is-open'));
  centerMapOnCard(focusedCard, { animate });
}

function openMapSheet(card, marker, { pan = true } = {}) {
  setFocusedCard(card);
  setActiveMapPin(marker);
  if (isPhoneLayout()) {
    hideSplitDetail();
    mapSheet.classList.remove('is-expanded');
    mapSheetHandle?.setAttribute('aria-label', t('home.expandPanel'));
    mountMapSheetPeek(card);
    mapSheet.classList.add('is-open');
    updateMapSheetPeekNav();
    if (pan) scheduleCenterMapOnCard(card, { animate: false, waitForSheet: true });
    else settleMapLayout({ pan: false, animate: false });
    return;
  }
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
  if (!mapView.classList.contains('is-hidden')) settleMapLayout({ pan: false, animate: false });
}

function closeMapSheet() {
  hideMapSheet();
  if (!feedStage.classList.contains('is-detail-open')) setFocusedCard(null);
}

mapSheetClose.addEventListener('click', closeMapSheet);
mapSheetHandle?.addEventListener('click', () => {
  if (!isPhoneLayout() || !mapSheet.classList.contains('is-open')) return;
  if (mapSheet.classList.contains('is-expanded')) collapseMapSheet();
  else expandMapSheet();
});

let mapSheetTouchStartX = 0;
let mapSheetTouchStartY = 0;
let mapSheetTouchOnGallery = false;
let mapSheetTouchAxis = '';
function mapSheetPeekOpen() {
  return isPhoneLayout() && mapSheet.classList.contains('is-open') && !mapSheet.classList.contains('is-expanded');
}

function updateMapSheetPeekNav() {
  if (!mapSheetPeekNav) return;
  const pinCards = getMapPinCards();
  const show = mapSheetPeekOpen() && pinCards.length > 1;
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

  if (peek && !mapSheetTouchOnGallery && (mapSheetTouchAxis === 'x' || (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 36))) {
    navigateMapSheetPin(dx < 0 ? 1 : -1);
    mapSheetTouchAxis = '';
    return;
  }

  if (dy < -52 && peek && mapSheetTouchAxis !== 'x') expandMapSheet();
  else if (dy > 52 && expanded && mapSheetBody.scrollTop <= 4) collapseMapSheet();
  else if (dy > 72 && peek && mapSheetTouchAxis !== 'x') closeMapSheet();
  mapSheetTouchAxis = '';
}
function bindMapSheetSwipe(el, { trackAxis = false } = {}) {
  el?.addEventListener('touchstart', (e) => {
    if (!isPhoneLayout() || !mapSheet.classList.contains('is-open')) return;
    mapSheetTouchStartX = e.touches[0].clientX;
    mapSheetTouchStartY = e.touches[0].clientY;
    mapSheetTouchOnGallery = Boolean(e.target.closest('.photo-gallery__track'));
    mapSheetTouchAxis = '';
  }, { passive: true });
  el?.addEventListener('touchmove', (e) => {
    if (!mapSheetPeekOpen() || mapSheetTouchOnGallery) return;
    const dx = e.touches[0].clientX - mapSheetTouchStartX;
    const dy = e.touches[0].clientY - mapSheetTouchStartY;
    if (!mapSheetTouchAxis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      mapSheetTouchAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    if (trackAxis && mapSheetTouchAxis === 'x') e.preventDefault();
  }, { passive: false });
  el?.addEventListener('touchend', (e) => {
    if (!isPhoneLayout() || !mapSheet.classList.contains('is-open')) return;
    onMapSheetSwipeEnd(mapSheetTouchStartX, mapSheetTouchStartY, e);
  }, { passive: true });
}
bindMapSheetSwipe(mapSheetHandle);
bindMapSheetSwipe(mapSheetBody, { trackAxis: true });
bindMapSheetSwipe(mapSheetPeekNav, { trackAxis: true });

let mapSheetTapStartX = 0;
let mapSheetTapStartY = 0;
function tryExpandMapSheetFromTap(e) {
  if (!mapSheetPeekOpen()) return;
  if (e.target.closest('a, button, .photo-gallery__track')) return;
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
    scrollToSiteheadMenu({ instant: true });
    initMap();
    syncMapRail();
    openInitialMapPinPreview();
    updateMapRailVisibility({ pan: false, animate: false });
  } else {
    hideMapSheet();
    clearMapPinActive();
    updateMapRailVisibility();
  }
}));

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
}

function openSplitDetail(card) {
  hideCardModal();
  hideMapSheet();
  const wasOpen = feedStage.classList.contains('is-detail-open');
  setFocusedCard(card);
  updateDetailHeaderTitle(card);
  feedDetailPane.setAttribute('aria-hidden', 'false');
  feedStage.classList.add('is-detail-open');
  if (isPhoneLayout()) document.body.classList.add('is-detail-open');
  else document.body.classList.remove('is-detail-open');
  updateMapRailVisibility();
  const hasStream = feedDetailBody.querySelector('.feed-detail__section');
  if (!wasOpen || !hasStream) {
    mountContinuousDetail(feedDetailBody, { scrollTo: card });
  } else {
    detailScrollRoot = feedDetailBody;
    scrollDetailToCard(card);
  }
  renderFeedDetailMenu();
  setFeedDetailMenuOpen(false);
  if (!mapView.classList.contains('is-hidden')) {
    panToFocusedCard();
    requestAnimationFrame(() => scrollRailToFocusedCard());
  }
}

function closeSplitDetail() {
  if (!focusedCard && !feedStage.classList.contains('is-detail-open')) return;
  const returnToMap = isPhoneLayout() && !mapView.classList.contains('is-hidden');
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
feedDetailClose.addEventListener('click', closeSplitDetail);
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
    if (feedDetailMenuPanel && !feedDetailMenuPanel.hidden) {
      setFeedDetailMenuOpen(false);
      return;
    }
    closeCardModal();
    closeSplitDetail();
    closeMapSheet();
  }
});

document.querySelectorAll('.observer-item__toggle').forEach((btn) => btn.addEventListener('click', () => {
  const item = btn.closest('.observer-item');
  const isOpen = item.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', isOpen);
}));

const floatingbar = document.getElementById('floatingbar');
const sitehead = document.querySelector('.sitehead');
const onScroll = () => {
  const floatingVisible = window.scrollY > sitehead.offsetHeight - 48;
  floatingbar.classList.toggle('is-visible', floatingVisible);
  if (!floatingVisible) {
    closeFloatingPanels();
    window.closeAllLangPanels?.();
  }
  updateFeedStickyTop();
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => {
  if (detailScrollRoot) detailLoopHeight = measureDetailLoopHeight();
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
  const p = document.createElement('p');
  p.className = 'grid-feed__message';
  p.textContent = message;
  gridFeed.replaceChildren(p);
  cards = [];
  clearMapMarkers();
}

async function loadPhenomena() {
  gridFeed.replaceChildren();
  try {
    const res = await fetch('/api/phenomena', {
      headers: { 'Accept-Language': getLocale() },
      priority: 'high',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const items = payload.data ?? [];
    if (!items.length) {
      showFeedMessage(t('home.feed.empty'));
      return;
    }
    const nodes = items.map(renderCard);
    gridFeed.replaceChildren(...nodes);
    cards = nodes;
    cards.forEach((card) => card.addEventListener('click', () => openCardDetail(card)));
    if (leafletMap) addMapMarkers();
    applyFilters();
  } catch (err) {
    console.error(err);
    showFeedMessage(t('home.feed.error'));
  }
}

// Start weather immediately (do not await) so it never gates the feed.
loadWeather();

await i18nReady;
formatToday();
syncFloatingLangOptions();
loadPhenomena();
