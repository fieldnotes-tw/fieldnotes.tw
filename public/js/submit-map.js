(function () {
  const ZUOYING_CENTER = [22.688, 120.297];
  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  const ZUOYING_VIEWBOX = '120.24,22.62,120.35,22.74';

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

  const submitPinIcon = () => L.divIcon({
    html: '<span class="map-pin map-pin--submit" aria-hidden="true"></span>',
    className: 'map-pin-wrapper',
    iconSize: [26, 34],
    iconAnchor: [13, 34],
  });

  const DETAIL_PIN_SIZE = [22, 29];
  const DETAIL_PIN_ANCHOR = [11, 29];

  const existingSpotPinIcon = (category) => L.divIcon({
    html: `<span class="map-pin map-pin--detail is-dim" data-category="${category || 'plant'}" aria-hidden="true"></span>`,
    className: 'map-pin-wrapper',
    iconSize: DETAIL_PIN_SIZE,
    iconAnchor: DETAIL_PIN_ANCHOR,
  });

  window.createSubmitLocationMap = function createSubmitLocationMap(config) {
    const {
      mapElId,
      locationInputId,
      latInputId,
      lngInputId,
      hintElId,
      resultsElId,
      searchWrapSelector,
      mapWrapSelector,
    } = config;

    let map = null;
    let pin = null;
    let existingPins = [];
    let existingSpotCategory = 'plant';
    let searchTimer = null;
    let placedLabel = '';

    const $ = (id) => document.getElementById(id);

    function clearExistingPins() {
      existingPins.forEach((marker) => marker.remove());
      existingPins = [];
    }

    function fitVisiblePoints() {
      if (!map) return;
      const latlngs = existingPins.map((marker) => marker.getLatLng());
      if (pin) latlngs.push(pin.getLatLng());
      if (!latlngs.length) return;
      if (latlngs.length === 1) {
        map.setView(latlngs[0], 15, { animate: false });
        return;
      }
      map.fitBounds(L.latLngBounds(latlngs), {
        paddingTopLeft: L.point(22, 30),
        paddingBottomRight: L.point(22, 38),
        maxZoom: 14,
        animate: false,
      });
    }

    function setExistingSpots(spots, category = 'plant') {
      existingSpotCategory = category || 'plant';
      clearExistingPins();
      if (!map) return;
      (spots || []).forEach((spot) => {
        const lat = Number(spot.lat);
        const lng = Number(spot.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const marker = L.marker([lat, lng], {
          icon: existingSpotPinIcon(existingSpotCategory),
          interactive: false,
        }).addTo(map);
        existingPins.push(marker);
      });
      if (!pin) fitVisiblePoints();
    }

    function setSearchOpen(open) {
      const input = $(locationInputId);
      const list = $(resultsElId);
      if (!input || !list) return;
      list.hidden = !open || !list.children.length;
      input.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setLocationLabel(label) {
      if (label && $(locationInputId)) {
        $(locationInputId).value = label;
        placedLabel = label;
      }
    }

    function clearPinPosition() {
      if (pin) {
        pin.remove();
        pin = null;
      }
      if ($(latInputId)) $(latInputId).value = '';
      if ($(lngInputId)) $(lngInputId).value = '';
      syncMapPinState();
    }

    function syncMapPinState() {
      const wrap = document.querySelector(mapWrapSelector);
      const hint = hintElId ? $(hintElId) : null;
      if (!wrap) return;
      const hasPin = Boolean($(latInputId)?.value && $(lngInputId)?.value);
      wrap.classList.toggle('submit-form__map-wrap--unpinned', !hasPin);
      if (hint && typeof t === 'function') {
        hint.textContent = t(hasPin ? 'submit.where.mapHintPlaced' : 'submit.where.mapHintEmpty');
      }
    }

    function setPin(lat, lng, label) {
      if ($(latInputId)) $(latInputId).value = lat;
      if ($(lngInputId)) $(lngInputId).value = lng;
      if (label) setLocationLabel(label);
      if (!map) {
        syncMapPinState();
        return;
      }
      if (pin) pin.remove();
      pin = L.marker([lat, lng], { draggable: true, icon: submitPinIcon() }).addTo(map);
      pin.on('dragend', async () => {
        const { lat: pLat, lng: pLng } = pin.getLatLng();
        $(latInputId).value = pLat;
        $(lngInputId).value = pLng;
        try {
          const row = await nominatim(`/reverse?lat=${pLat}&lon=${pLng}&format=json&zoom=18`);
          if (row?.display_name) setLocationLabel(formatPlaceName(row));
        } catch {
          // Keep whatever the user typed.
        }
      });
      map.setView([lat, lng], Math.max(map.getZoom(), 16));
      syncMapPinState();
    }

    function initMap() {
      const el = $(mapElId);
      if (!el || map || typeof L === 'undefined') return;
      map = L.map(mapElId, {
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
        setTimeout(() => {
          map?.invalidateSize();
          if (existingPins.length && !pin) fitVisiblePoints();
        }, 200);
      });
      syncMapPinState();
    }

    function renderSearchResults(items) {
      const list = $(resultsElId);
      if (!list) return;
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
          setPin(Number(item.lat), Number(item.lon), formatPlaceName(item));
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
      const input = $(locationInputId);
      const list = $(resultsElId);
      if (!input) return;

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
          setPin(Number(items[0].lat), Number(items[0].lon), formatPlaceName(items[0]));
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
      const input = $(locationInputId);
      if (!input) return;
      input.addEventListener('input', () => {
        if (input.value.trim() !== placedLabel.trim()) {
          placedLabel = '';
          clearPinPosition();
        }
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(input.value), 350);
      });
      input.addEventListener('focus', () => {
        const list = $(resultsElId);
        if (list?.children.length) setSearchOpen(true);
      });
      if (searchWrapSelector) {
        document.addEventListener('click', (e) => {
          if (!e.target.closest(searchWrapSelector)) setSearchOpen(false);
        });
      }
    }

    return {
      init() {
        initMap();
        initSearch();
      },
      setPin,
      clearPin() {
        if (pin) {
          pin.remove();
          pin = null;
        }
        placedLabel = '';
        if ($(latInputId)) $(latInputId).value = '';
        if ($(lngInputId)) $(lngInputId).value = '';
        if ($(locationInputId)) $(locationInputId).value = '';
        syncMapPinState();
        if (existingPins.length) fitVisiblePoints();
      },
      setExistingSpots,
      invalidateSize() {
        map?.invalidateSize();
        setTimeout(() => {
          map?.invalidateSize();
          if (existingPins.length && !pin) fitVisiblePoints();
        }, 200);
      },
      getLocationLabel() {
        return $(locationInputId)?.value?.trim() || '';
      },
      getCoords() {
        const lat = Number($(latInputId)?.value);
        const lng = Number($(lngInputId)?.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng };
      },
      selectFirstSearchResult,
    };
  };

  window.preventSubmitFormEnterSubmit = function preventSubmitFormEnterSubmit(form, {
    searchInputId,
    onSearchEnter,
  } = {}) {
    if (!form) return;
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (searchInputId && e.target.id === searchInputId && typeof onSearchEnter === 'function') {
        onSearchEnter();
      }
    });
  };
})();
