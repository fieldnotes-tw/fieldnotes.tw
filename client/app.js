const REPORT_FORM_URL = 'https://forms.gle/Ln8WBNaK5s8fggTYA';

const gridFeed = document.getElementById('gridFeed');
const mapView = document.getElementById('mapView');
const mapSheet = document.getElementById('mapSheet');
const mapSheetBody = document.getElementById('mapSheetBody');
const mapSheetClose = document.getElementById('mapSheetClose');
const mapSheetCollapse = document.getElementById('mapSheetCollapse');
const cardModal = document.getElementById('cardModal');
const cardModalBody = document.getElementById('cardModalBody');
const cardModalClose = document.getElementById('cardModalClose');
const cardModalBackdrop = document.getElementById('cardModalBackdrop');

let cards = [];
const selectedCats = new Set();

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
}

const catToggles = document.querySelectorAll('.cat-toggle');
catToggles.forEach((el) => el.addEventListener('click', (e) => {
  e.preventDefault();
  const cat = el.dataset.cat;
  const nowSelected = !selectedCats.has(cat);
  if (nowSelected) selectedCats.add(cat); else selectedCats.delete(cat);
  document.querySelectorAll(`.cat-toggle[data-cat="${cat}"]`).forEach((match) => {
    match.classList.toggle('is-selected', nowSelected);
    if (match.hasAttribute('aria-pressed')) match.setAttribute('aria-pressed', nowSelected);
  });
  applyFilters();
}));
catToggles.forEach((el) => el.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
}));

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

  const photo = document.createElement('div');
  photo.className = 'card__photo';
  if (item.imageUrl) {
    const img = document.createElement('img');
    img.src = item.imageUrl;
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

// Builds the [photo, body] nodes shared by the map sheet and the card modal,
// so both surfaces show the same expanded set of fields from one source of truth.
function buildDetailNodes(card) {
  const photoWrap = document.createElement('div');
  photoWrap.className = 'card__photo';
  const sourceImg = card.querySelector('.card__photo img');
  if (sourceImg) {
    const img = document.createElement('img');
    img.src = sourceImg.src;
    img.alt = sourceImg.alt;
    photoWrap.appendChild(img);
  }

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

function openMapSheet(card, marker) {
  markerRefs.forEach(({ marker: m }) => {
    m.getElement()?.querySelector('.map-pin')?.classList.toggle('is-active', m === marker);
  });
  mapSheetBody.replaceChildren(...buildDetailNodes(card));
  mapSheet.classList.add('is-open');
}

function closeMapSheet() {
  mapSheet.classList.remove('is-open');
  markerRefs.forEach(({ marker }) => {
    marker.getElement()?.querySelector('.map-pin')?.classList.remove('is-active');
  });
}
mapSheetClose.addEventListener('click', closeMapSheet);
mapSheetCollapse.addEventListener('click', closeMapSheet);

function openCardModal(card) {
  cardModalBody.replaceChildren(...buildDetailNodes(card));
  cardModal.classList.add('is-open');
}
function closeCardModal() {
  cardModal.classList.remove('is-open');
}
cardModalClose.addEventListener('click', closeCardModal);
cardModalBackdrop.addEventListener('click', closeCardModal);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeCardModal(); closeMapSheet(); }
});

const viewToggleBtns = document.querySelectorAll('.view-toggle__btn');
viewToggleBtns.forEach((btn) => btn.addEventListener('click', () => {
  viewToggleBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
  const isMap = btn.dataset.view === 'map';
  gridFeed.classList.toggle('is-hidden', isMap);
  mapView.classList.toggle('is-hidden', !isMap);
  if (isMap) {
    initMap();
    requestAnimationFrame(() => leafletMap.invalidateSize());
  } else {
    closeMapSheet();
  }
}));

document.querySelectorAll('.observer-item__toggle').forEach((btn) => btn.addEventListener('click', () => {
  const item = btn.closest('.observer-item');
  const isOpen = item.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', isOpen);
}));

const floatingbar = document.getElementById('floatingbar');
const sitehead = document.querySelector('.sitehead');
const onScroll = () => {
  floatingbar.classList.toggle('is-visible', window.scrollY > sitehead.offsetHeight - 48);
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

function showFeedMessage(message) {
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
    cards.forEach((card) => card.addEventListener('click', () => openCardModal(card)));
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
loadPhenomena();
