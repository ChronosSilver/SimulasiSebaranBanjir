/* Urutan warna paling gelap ditempatkan pada tahap awal (1 m atau 0,5 jam) karena
   lahan yang paling cepat tergenang memiliki elevasi terendah dan genangan terdalam. */
const WATER_RAMP = ['#081d58', '#1d3c96', '#1d70b8', '#22a0c2', '#48cabd', '#8fe3ca', '#d4f7e6'];
const RAIN_RAMP = [
  '#081d58',
  '#163382',
  '#1d5aa6',
  '#1f82bd',
  '#28acc1',
  '#55cebe',
  '#95e5cc',
  '#d4f7e6',
];

/* Prefix khusus tugas1_ptk_ mencegah bentrok key localStorage dengan proyek lain
   pada origin localhost yang sama (seperti proyek UTS Kalimantan Barat). */
const STORAGE_KEYS = {
  lat: 'tugas1_ptk_lat',
  lng: 'tugas1_ptk_lng',
  zoom: 'tugas1_ptk_zoom',
  mode: 'tugas1_ptk_mode',
  levels: 'tugas1_ptk_levels',
  rainDurations: 'tugas1_ptk_rain_durations',
  basemap: 'tugas1_ptk_basemap',
  floodAlpha: 'tugas1_ptk_floodAlpha',
  hillshadeOn: 'tugas1_ptk_hillshadeOn',
  hillshadeAlpha: 'tugas1_ptk_hillshadeAlpha',
  theme: 'tugas1_ptk_theme',
};

const PONTIANAK_CENTER = [-0.0263, 109.3425];
const DEFAULT_ZOOM = 13;
const MIN_ZOOM = 12;
const PONTIANAK_MAX_BOUNDS = L.latLngBounds(
  [-0.120, 109.240],
  [0.065, 109.435]
);

const KECAMATAN_CENTERS = [
  { name: 'Kec. Pontianak Kota', lat: -0.0265, lon: 109.3315 },
  { name: 'Kec. Pontianak Selatan', lat: -0.0460, lon: 109.3365 },
  { name: 'Kec. Pontianak Tenggara', lat: -0.0565, lon: 109.3585 },
  { name: 'Kec. Pontianak Barat', lat: -0.0155, lon: 109.3085 },
  { name: 'Kec. Pontianak Timur', lat: -0.0295, lon: 109.3695 },
  { name: 'Kec. Pontianak Utara', lat: 0.0045, lon: 109.3475 },
];

const state = {
  mode: 'water',
  levels: [],
  rainDurations: [],
  rainIntensityMmHr: 55,
  selectedWater: new Set(),
  selectedRain: new Set(),
  floodAlpha: 0.7,
  hillshade: null,
  boundaryLayer: null,
  demGrid: null,
  stats: [],
  rainStats: [],
  dataVersion: '',
  loadToken: 0,
};

/* Tiap level dirender satu kali pada pane tersendiri dan diatur lewat opacity
   agar animasi kenaikan air maupun durasi hujan dikomposit GPU tanpa membangun ulang DOM SVG. */
const floodLayers = new Map();
const rainLayers = new Map();
const layerBuilds = new Map();

const isRainMode = () => state.mode === 'rain';
const activeScale = () => (isRainMode() ? state.rainDurations : state.levels);
const activeSelected = () => (isRainMode() ? state.selectedRain : state.selectedWater);
const activeStats = () => (isRainMode() ? state.rainStats : state.stats);
const activeLayerMap = () => (isRainMode() ? rainLayers : floodLayers);

const slug = (lv) => String(lv).replace(/\.0$/, '');
const colorFor = (val, mode = state.mode) => {
  if (mode === 'rain') {
    return RAIN_RAMP[state.rainDurations.indexOf(val)] || '#1f82bd';
  }
  return WATER_RAMP[state.levels.indexOf(val)] || '#1d70b8';
};
const $ = (id) => document.getElementById(id);
const topLevel = () => {
  const sel = activeSelected();
  return sel.size ? Math.max(...sel) : null;
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function getSavedView() {
  const rawLat = parseFloat(localStorage.getItem(STORAGE_KEYS.lat));
  const rawLng = parseFloat(localStorage.getItem(STORAGE_KEYS.lng));
  const rawZoom = parseInt(localStorage.getItem(STORAGE_KEYS.zoom), 10);

  const validPos =
    !Number.isNaN(rawLat) &&
    !Number.isNaN(rawLng) &&
    PONTIANAK_MAX_BOUNDS.contains([rawLat, rawLng]);
  const validZoom = !Number.isNaN(rawZoom) && rawZoom >= MIN_ZOOM && rawZoom <= 19;

  return {
    center: validPos ? [rawLat, rawLng] : PONTIANAK_CENTER,
    zoom: validZoom ? rawZoom : DEFAULT_ZOOM,
  };
}

function saveMapView() {
  const center = map.getCenter();
  localStorage.setItem(STORAGE_KEYS.lat, String(center.lat));
  localStorage.setItem(STORAGE_KEYS.lng, String(center.lng));
  localStorage.setItem(STORAGE_KEYS.zoom, String(map.getZoom()));
}

function saveSelectedLevels() {
  if (isRainMode()) {
    localStorage.setItem(STORAGE_KEYS.rainDurations, JSON.stringify([...state.selectedRain]));
  } else {
    localStorage.setItem(STORAGE_KEYS.levels, JSON.stringify([...state.selectedWater]));
  }
}

const initialView = getSavedView();
const map = L.map('map', {
  zoomControl: false,
  minZoom: MIN_ZOOM,
  maxBounds: PONTIANAK_MAX_BOUNDS,
  maxBoundsViscosity: 0.85,
}).setView(initialView.center, initialView.zoom);

L.control.zoom({ position: 'topright' }).addTo(map);
map.on('moveend', saveMapView);
map.on('zoomend', saveMapView);

(function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEYS.theme, next);
  }

  $('theme-toggle').addEventListener('click', toggleTheme);
  $('theme-toggle-mobile').addEventListener('click', toggleTheme);
})();

(function initResetViewButtons() {
  function resetToPontianak() {
    map.setView(PONTIANAK_CENTER, DEFAULT_ZOOM, { animate: false });
    saveMapView();
  }
  $('reset-view').addEventListener('click', resetToPontianak);
  $('reset-view-mobile').addEventListener('click', resetToPontianak);
})();

/* Kredit sumber peta tetap ada di DOM untuk mematuhi lisensi ODbL/Esri, namun
   dilipat menjadi tombol "i" agar tidak menutupi ruang peta di layar sempit. */
(function compactAttribution() {
  const ctl = map.attributionControl;
  ctl.setPrefix('');

  const el = ctl.getContainer();
  el.classList.add('attrib-collapsed');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Informasi sumber peta');
  el.title = 'Informasi sumber peta';

  const toggle = (e) => {
    if (e.target.tagName === 'A') return;
    el.classList.toggle('attrib-collapsed');
  };
  el.addEventListener('click', toggle);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(e);
    }
  });
})();

function showLoading(text) {
  const el = $('loading');
  el.textContent = text;
  el.hidden = false;
}

function hideLoading() {
  $('loading').hidden = true;
}

function showError(message) {
  hideLoading();
  $('error-text').textContent = message;
  $('error-banner').hidden = false;
}

function hideError() {
  $('error-banner').hidden = true;
}

const sheet = (() => {
  const panel = $('panel');
  const handle = $('sheet-handle');
  const label = handle.querySelector('.sheet-handle-text');
  const peek = $('sheet-peek');
  const mq = window.matchMedia('(max-width: 960px)');

  let open = false;
  let dragging = false;
  let startY = 0;
  let startOffset = 0;
  let moved = 0;
  let suppressClick = false;

  const isSheet = () => mq.matches;
  const closedOffset = () => panel.offsetHeight - peekHeight();

  function peekHeight() {
    return handle.offsetHeight + peek.offsetHeight + 16;
  }

  function measure() {
    if (!isSheet()) return;
    document.documentElement.style.setProperty('--peek', `${Math.round(peekHeight())}px`);
  }

  function setOpen(next) {
    open = next;
    panel.classList.toggle('open', open);
    handle.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Tutup panel kontrol' : 'Buka panel kontrol';
  }

  handle.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setOpen(!open);
  });

  handle.addEventListener('pointerdown', (e) => {
    if (!isSheet()) return;
    dragging = true;
    moved = 0;
    startY = e.clientY;
    startOffset = open ? 0 : closedOffset();
    panel.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    moved = Math.max(moved, Math.abs(dy));
    const offset = Math.min(Math.max(startOffset + dy, 0), closedOffset());
    panel.style.transform = `translateY(${offset}px)`;
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('dragging');
    panel.style.transform = '';
    if (handle.hasPointerCapture?.(e.pointerId)) handle.releasePointerCapture(e.pointerId);

    if (moved > 8) {
      suppressClick = true;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 60) setOpen(dy < 0);
      else setOpen(open);
    }
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  mq.addEventListener('change', () => {
    panel.style.transform = '';
    setOpen(false);
    measure();
    map.invalidateSize();
  });
  window.addEventListener('resize', measure);

  setOpen(false);
  return {
    measure,
    close: () => setOpen(false),
    isOpen: () => open,
    isSheet,
  };
})();

(function panelToggle() {
  const app = $('app');
  const btn = $('panel-toggle');
  const label = $('panel-toggle-text');
  let hidden = false;

  btn.addEventListener('click', () => {
    hidden = !hidden;
    app.classList.toggle('panel-hidden', hidden);
    if (hidden) sheet.close();
    btn.setAttribute('aria-expanded', String(!hidden));
    label.textContent = hidden ? 'Tampilkan panel' : 'Sembunyikan panel';
    btn.title = label.textContent;
  });

  $('panel').addEventListener('transitionend', (e) => {
    if (e.propertyName === 'margin-left') map.invalidateSize();
  });

  btn.title = 'Sembunyikan panel';
})();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    map.closePopup();
    if (sheet.isSheet() && sheet.isOpen()) {
      sheet.close();
    }
  }
});

const DEFAULT_BASEMAP = localStorage.getItem(STORAGE_KEYS.basemap) || 'osm';

const basemaps = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }),
  satelit: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
  ),
  gelap: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
  }),
};

const initialBasemapKey = basemaps[DEFAULT_BASEMAP] ? DEFAULT_BASEMAP : 'osm';
let activeBasemap = basemaps[initialBasemapKey].addTo(map);

function buildBasemapRadio() {
  const box = $('basemap-radio');
  box.innerHTML = '';
  const labels = {
    osm: 'OpenStreetMap (Peta Jalan)',
    satelit: 'Citra Satelit (Esri World Imagery)',
    gelap: 'Kanvas Gelap (CARTO Dark)',
  };
  Object.keys(basemaps).forEach((key) => {
    const id = `bm-${key}`;
    const el = document.createElement('label');
    el.setAttribute('for', id);
    el.innerHTML = `<input type="radio" name="basemap" id="${id}" value="${key}" ${
      key === initialBasemapKey ? 'checked' : ''
    }/> <span>${labels[key]}</span>`;
    el.querySelector('input').addEventListener('change', () => {
      map.removeLayer(activeBasemap);
      activeBasemap = basemaps[key].addTo(map);
      activeBasemap.bringToBack();
      localStorage.setItem(STORAGE_KEYS.basemap, key);
    });
    box.appendChild(el);
  });
}

function syncModeHeadings() {
  const rain = isRainMode();
  $('mode-water').classList.toggle('active', !rain);
  $('mode-water').setAttribute('aria-selected', String(!rain));
  $('mode-rain').classList.toggle('active', rain);
  $('mode-rain').setAttribute('aria-selected', String(rain));

  $('param-heading').textContent = rain ? 'Durasi hujan DEMNAS (jam)' : 'Tinggi muka air (m)';
  $('legend-heading').textContent = rain ? 'Legenda durasi hujan' : 'Legenda kedalaman';
  $('bars-heading').textContent = rain
    ? 'Luas tergenang per durasi (km²)'
    : 'Estimasi luas tergenang (km²)';
}

function buildLevelButtons() {
  const box = $('level-buttons');
  const rain = isRainMode();
  const scale = activeScale();
  box.classList.toggle('rain-grid', rain);
  box.innerHTML = '';

  scale.forEach((val) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(val);
    b.dataset.level = val;
    b.style.setProperty('--band-color', colorFor(val));
    b.setAttribute(
      'aria-label',
      rain ? `Durasi hujan ${val} jam` : `Tinggi muka air ${val} meter`
    );
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      anim.stop();
      toggleLevel(val);
    });
    box.appendChild(b);
  });
}

function syncLevelButtons() {
  const rain = isRainMode();
  const scale = activeScale();
  const sel = activeSelected();
  const all = scale.length > 0 && sel.size === scale.length;
  const btn = $('select-all');
  if (rain) {
    btn.textContent = all ? 'Satu durasi' : 'Semua durasi';
    btn.title = all ? 'Tampilkan hanya durasi 0,5 jam' : 'Tampilkan seluruh durasi hujan sekaligus';
  } else {
    btn.textContent = all ? 'Satu level' : 'Semua level';
    btn.title = all ? 'Tampilkan hanya level 1 m' : 'Tampilkan seluruh pita level sekaligus';
  }

  document.querySelectorAll('#level-buttons button').forEach((b) => {
    const on = sel.has(Number(b.dataset.level));
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

/* Seluruh pane ditempatkan dalam satu pane induk yang mengatur transparansi
   ke basemap, sehingga tumpukan poligon antar-tahap tidak saling mencampur warna. */
const FLOOD_GROUP = 'flood-group';

function floodGroupEl() {
  let el = map.getPane(FLOOD_GROUP);
  if (!el) {
    map.createPane(FLOOD_GROUP);
    el = map.getPane(FLOOD_GROUP);
    el.style.zIndex = '410';
    el.style.pointerEvents = 'none';
    el.style.opacity = String(state.floodAlpha);
  }
  return el;
}

async function buildLayer(val, mode = state.mode) {
  const rain = mode === 'rain';
  const fileSlug = slug(val).replace('.', '_');
  const url = rain
    ? `data/rain/dur_${fileSlug}.geojson?v=${state.dataVersion}`
    : `data/flood/level_${slug(val)}.geojson?v=${state.dataVersion}`;

  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const gj = await res.json();

  const scale = rain ? state.rainDurations : state.levels;
  const paneName = `${rain ? 'rain' : 'flood'}-${fileSlug}`;
  map.createPane(paneName, floodGroupEl());
  const paneEl = map.getPane(paneName);
  paneEl.style.zIndex = String(scale.length - scale.indexOf(val));
  paneEl.style.opacity = '0';
  paneEl.style.visibility = 'hidden';
  paneEl.style.transition = reduceMotion.matches ? 'none' : 'opacity 0.25s ease';

  const color = colorFor(val, mode);
  const layer = L.geoJSON(gj, {
    pane: paneName,
    interactive: false,
    style: { color, weight: 0.6, fillColor: color, fillOpacity: 1, opacity: 1 },
  }).addTo(map);

  const entry = { paneEl, layer, hideTimer: null };
  (rain ? rainLayers : floodLayers).set(val, entry);
  return entry;
}

function ensureLayer(val, mode = state.mode) {
  const targetMap = mode === 'rain' ? rainLayers : floodLayers;
  if (targetMap.has(val)) return Promise.resolve(targetMap.get(val));

  const key = `${mode}:${val}`;
  if (layerBuilds.has(key)) return layerBuilds.get(key);

  const build = buildLayer(val, mode).finally(() => layerBuilds.delete(key));
  layerBuilds.set(key, build);
  return build;
}

function syncLayerMapVisibility(layerMap, isModeActive, selectedSet) {
  layerMap.forEach((entry, val) => {
    const { paneEl } = entry;
    if (entry.hideTimer) {
      clearTimeout(entry.hideTimer);
      entry.hideTimer = null;
    }

    if (isModeActive && selectedSet.has(val)) {
      paneEl.style.visibility = 'visible';
      requestAnimationFrame(() => {
        paneEl.style.opacity = '1';
      });
    } else {
      paneEl.style.opacity = '0';
      entry.hideTimer = setTimeout(
        () => {
          paneEl.style.visibility = 'hidden';
          entry.hideTimer = null;
        },
        reduceMotion.matches ? 0 : 280
      );
    }
  });
}

function syncLayers() {
  const rain = isRainMode();
  syncLayerMapVisibility(floodLayers, !rain, state.selectedWater);
  syncLayerMapVisibility(rainLayers, rain, state.selectedRain);
}

async function setSelection(values, persist = true) {
  const rain = isRainMode();
  if (rain) {
    state.selectedRain = new Set(values);
  } else {
    state.selectedWater = new Set(values);
  }
  if (persist) saveSelectedLevels();
  syncLevelButtons();
  syncLegend();
  syncStats();

  const sel = activeSelected();
  const lMap = activeLayerMap();
  const missing = [...sel].filter((v) => !lMap.has(v));
  if (!missing.length) {
    syncLayers();
    return;
  }

  const modeAtStart = state.mode;
  const token = ++state.loadToken;
  showLoading(
    missing.length > 1
      ? `Memuat ${missing.length} layer ${rain ? 'durasi hujan DEMNAS' : 'genangan'} Pontianak...`
      : `Memuat zona ${rain ? `durasi hujan ${missing[0]} jam` : `genangan level ${missing[0]} m`}...`
  );
  try {
    for (const v of missing) {
      await ensureLayer(v, modeAtStart);
      if (token !== state.loadToken) return;
    }
    syncLayers();
    hideLoading();
    hideError();
  } catch (err) {
    if (token !== state.loadToken) return;
    showError('Gagal memuat poligon genangan. Pastikan halaman dibuka melalui localhost XAMPP.');
  }
}

function toggleLevel(val) {
  const next = new Set(activeSelected());
  if (next.has(val)) next.delete(val);
  else next.add(val);
  setSelection(next);
}

const anim = (() => {
  const btn = $('anim-play');
  const label = $('anim-play-text');
  const speedSel = $('anim-speed');
  let playing = false;
  let timer = null;
  let token = 0;
  let idx = 0;

  const frameCount = () => activeScale().length + 1;
  const speed = () => Number(speedSel.value);

  function syncButton() {
    btn.classList.toggle('playing', playing);
    const defaultText = isRainMode()
      ? 'Putar simulasi hujan 0 ke 4 jam'
      : 'Putar simulasi 0 ke 4 m';
    label.textContent = playing ? 'Hentikan simulasi' : defaultText;
    btn.setAttribute('aria-label', label.textContent);
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    token++;
    playing = false;
    syncButton();
    hideLoading();
  }

  function tick() {
    const scale = activeScale();
    setSelection(scale.slice(0, idx));

    if (idx >= frameCount() - 1) {
      timer = setTimeout(stop, speed());
      return;
    }
    timer = setTimeout(() => {
      idx += 1;
      tick();
    }, speed());
  }

  async function preload() {
    const mine = ++token;
    const modeNow = state.mode;
    const scale = activeScale();
    const lMap = activeLayerMap();
    const pending = scale.filter((v) => !lMap.has(v));
    if (!pending.length) return true;

    let done = 0;
    for (const v of pending) {
      showLoading(`Menyiapkan animasi (${done}/${pending.length})...`);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      try {
        await ensureLayer(v, modeNow);
      } catch (err) {
        showError('Gagal menyiapkan layer animasi. Periksa koneksi server lokal.');
        return false;
      }
      if (mine !== token) return false;
      done += 1;
    }
    syncLayers();
    hideLoading();
    return true;
  }

  btn.addEventListener('click', async () => {
    if (playing) {
      stop();
      return;
    }
    playing = true;
    syncButton();

    const ready = await preload();
    if (!ready || !playing) return;

    idx = 0;
    tick();
  });

  syncButton();
  return { stop, syncButton };
})();

async function setSimMode(nextMode, persist = true) {
  const normalized = nextMode === 'rain' ? 'rain' : 'water';
  anim.stop();
  map.closePopup();
  state.mode = normalized;
  if (persist) {
    localStorage.setItem(STORAGE_KEYS.mode, normalized);
  }
  syncModeHeadings();
  anim.syncButton();
  buildLevelButtons();
  await setSelection([...activeSelected()], false);
}

(function initModeTabs() {
  $('mode-water').addEventListener('click', () => {
    if (state.mode !== 'water') setSimMode('water', true);
  });
  $('mode-rain').addEventListener('click', () => {
    if (state.mode !== 'rain') setSimMode('rain', true);
  });
})();

function syncLegend() {
  const ul = $('legend');
  ul.innerHTML = '';
  const rain = isRainMode();
  const scale = activeScale();
  const sel = activeSelected();
  const unit = rain ? 'jam' : 'm';

  scale.forEach((val) => {
    const li = document.createElement('li');
    if (sel.has(val)) li.classList.add('active');
    li.innerHTML = `<span class="swatch" style="background:${colorFor(val)}"></span> ${val} ${unit}`;
    ul.appendChild(li);
  });

  const n = sel.size;
  if (rain) {
    $('legend-note').textContent =
      n > 1
        ? 'Tiap warna menandai cekungan DEMNAS yang mulai tergenang pada durasi hujan tersebut. Warna paling gelap menunjukkan akumulasi aliran tercepat (0,5 jam).'
        : n === 1
        ? `Menampilkan sebaran genangan hujan Kota Pontianak pada durasi ${topLevel()} jam (intensitas acuan ${state.rainIntensityMmHr} mm/jam).`
        : 'Belum ada durasi hujan yang dipilih (0 jam). Klik tombol durasi 0.5 hingga 4 jam di atas untuk menampilkan sebaran genangan.';
  } else {
    $('legend-note').textContent =
      n > 1
        ? 'Tiap warna menandai area yang mulai tergenang pada tinggi air tersebut. Warna lebih gelap menunjukkan dataran lebih rendah (genangan terdalam).'
        : n === 1
        ? `Menampilkan cakupan genangan Kota Pontianak pada tinggi muka air ${topLevel()} m.`
        : 'Belum ada level genangan yang dipilih (0 m). Klik tombol level 1 hingga 4 m di atas untuk menampilkan sebaran banjir.';
  }
}

function syncStats() {
  const box = $('stat-active');
  const rain = isRainMode();
  const sel = activeSelected();
  const statsArr = activeStats();
  const top = topLevel();
  const active =
    top == null
      ? null
      : statsArr.find((r) => (rain ? r.duration === top : r.level === top));

  if (!active) {
    box.innerHTML = rain
      ? '<div class="big">0 km² (Durasi 0 jam)</div><div class="small">Belum ada durasi hujan aktif. Pilih tombol durasi 0.5 hingga 4 jam atau jalankan simulasi.</div>'
      : '<div class="big">0 km² (Level 0 m)</div><div class="small">Belum ada level genangan aktif. Pilih tombol tinggi muka air 1 hingga 4 m atau jalankan simulasi.</div>';
  } else if (rain) {
    const bands = sel.size > 1 ? ` · ${sel.size} tahap waktu aktif` : '';
    box.innerHTML = `
      <div class="big">${active.area_km2.toLocaleString('id-ID')} km²</div>
      <div class="small">${active.area_ha.toLocaleString('id-ID')} ha (${active.n_features} cekungan) · hujan ${
      active.duration
    } jam (${active.rain_mm} mm)${bands}</div>`;
  } else {
    const bands = sel.size > 1 ? ` · ${sel.size} pita kedalaman aktif` : '';
    box.innerHTML = `
      <div class="big">${active.area_km2.toLocaleString('id-ID')} km²</div>
      <div class="small">${active.area_ha.toLocaleString('id-ID')} ha (${active.n_features} zona) · muka air ${
      active.water_elev
    } m${bands}</div>`;
  }
  sheet.measure();

  const ul = $('stat-bars');
  ul.innerHTML = '';
  if (!statsArr.length) return;

  const max = Math.max(...statsArr.map((r) => r.area_km2));
  statsArr.forEach((r) => {
    const val = rain ? r.duration : r.level;
    const unit = rain ? 'j' : 'm';
    const li = document.createElement('li');
    if (sel.has(val)) li.classList.add('active');
    li.innerHTML = `
      <span>${val} ${unit}</span>
      <span class="track"><span class="fill" style="width:${(r.area_km2 / max) * 100}%"></span></span>
      <span>${r.area_km2.toFixed(1)}</span>`;
    ul.appendChild(li);
  });
}

function findNearestKecamatan(lat, lon) {
  let best = KECAMATAN_CENTERS[0].name;
  let minD = Infinity;
  KECAMATAN_CENTERS.forEach((k) => {
    const d = Math.hypot(lat - k.lat, lon - k.lon);
    if (d < minD) {
      minD = d;
      best = k.name;
    }
  });
  return best;
}

/* Interpolasi bilinear dari matriks DEMNAS Kota Pontianak agar estimasi elevasi
   tanah dan waktu mulai tergenang pada titik klik konsisten dengan poligon. */
function sampleMatrixField(matrix, lat, lon) {
  const d = state.demGrid;
  if (!d || !matrix) return null;
  if (lat < d.latMin || lat > d.latMax || lon < d.lonMin || lon > d.lonMax) {
    return null;
  }

  const u = ((lat - d.latMin) / (d.latMax - d.latMin)) * (d.ny - 1);
  const v = ((lon - d.lonMin) / (d.lonMax - d.lonMin)) * (d.nx - 1);

  const r0 = Math.max(0, Math.min(d.ny - 2, Math.floor(u)));
  const c0 = Math.max(0, Math.min(d.nx - 2, Math.floor(v)));
  const du = u - r0;
  const dv = v - c0;

  const nearR = Math.max(0, Math.min(d.ny - 1, Math.round(u)));
  const nearC = Math.max(0, Math.min(d.nx - 1, Math.round(v)));
  if (matrix[nearR][nearC] == null) {
    return null;
  }

  const z00 = matrix[r0][c0];
  const z01 = matrix[r0][c0 + 1];
  const z10 = matrix[r0 + 1][c0];
  const z11 = matrix[r0 + 1][c0 + 1];

  if (z00 == null || z01 == null || z10 == null || z11 == null) {
    return Number(Number(matrix[nearR][nearC]).toFixed(2));
  }

  const val =
    (1 - du) * (1 - dv) * z00 +
    (1 - du) * dv * z01 +
    du * (1 - dv) * z10 +
    du * dv * z11;
  return Number(val.toFixed(2));
}

map.on('click', (e) => {
  if (sheet.isSheet() && sheet.isOpen()) {
    sheet.close();
    return;
  }

  const { lat, lng } = e.latlng;
  const terrainElev = sampleMatrixField(state.demGrid?.grid, lat, lng);
  const rainOnset = sampleMatrixField(state.demGrid?.rainOnset, lat, lng);
  const twiScore = sampleMatrixField(state.demGrid?.twi, lat, lng);
  const top = topLevel();
  const kecName = findNearestKecamatan(lat, lng);

  let html = `<div class="depth-popup"><span class="zone-title">${kecName}</span>`;

  if (terrainElev == null) {
    html += `Titik berada di luar batas administrasi Kota Pontianak.`;
  } else if (isRainMode()) {
    const twiCat =
      twiScore >= 0.65 ? 'Tinggi (Cekungan)' : twiScore >= 0.35 ? 'Sedang' : 'Rendah';
    if (top == null) {
      html += `Elevasi DEMNAS: <b>${terrainElev} m</b><br/>
        Indeks akumulasi aliran: <b>${twiCat}</b><br/>
        Pilih durasi hujan (0,5 hingga 4 jam) di panel untuk menghitung estimasi genangan.`;
    } else if (rainOnset != null && rainOnset > top) {
      const cumMm = (top * state.rainIntensityMmHr).toFixed(1);
      html += `<b>Area belum tergenang</b><br/>
        Durasi hujan: ${top} jam (${cumMm} mm)<br/>
        Elevasi DEMNAS: ${terrainElev} m · Akumulasi: ${twiCat}`;
    } else {
      const onset = rainOnset != null ? rainOnset : 0.35;
      const cumMm = (top * state.rainIntensityMmHr).toFixed(1);
      const estDepth = Number(Math.max(0.08, (top - onset) * 0.32 + 0.12).toFixed(2));
      html += `Durasi hujan: <b>${top} jam (${cumMm} mm)</b><br/>
        Elevasi DEMNAS: ${terrainElev} m · Akumulasi: ${twiCat}<br/>
        Perkiraan kedalaman: <b>${estDepth} m</b>
        <div class="calc">Mulai tergenang sejak ${onset} jam (selisih ${(top - onset).toFixed(2)} jam)</div>`;
    }
  } else if (top == null) {
    html += `Elevasi tanah: <b>${terrainElev} m</b><br/>
      Pilih level tinggi muka air (1 hingga 4 m) di panel untuk menghitung kedalaman genangan di titik ini.`;
  } else if (terrainElev > top) {
    html += `<b>Area tidak tergenang</b><br/>
      Tinggi muka air: ${top} m<br/>
      Elevasi tanah: ${terrainElev} m (lebih tinggi dari muka air)`;
  } else {
    const estDepth = Number(Math.max(0, top - terrainElev).toFixed(2));
    html += `Tinggi muka air: <b>${top} m</b><br/>
      Elevasi tanah: ${terrainElev} m<br/>
      Perkiraan kedalaman: <b>${estDepth} m</b>
      <div class="calc">${top} m - ${terrainElev} m = ${estDepth} m</div>`;
  }
  html += `</div>`;

  L.popup({ autoPanPadding: [24, 24] })
    .setLatLng(e.latlng)
    .setContent(html)
    .openOn(map);
});

(function initLevelActionButtons() {
  $('select-all').addEventListener('click', () => {
    anim.stop();
    const scale = activeScale();
    const sel = activeSelected();
    const semua = sel.size === scale.length;
    setSelection(semua ? [scale[0]] : scale);
  });

  $('clear-levels').addEventListener('click', () => {
    anim.stop();
    setSelection([]);
  });
})();

const floodSlider = $('flood-opacity');
const floodOpacityVal = $('flood-opacity-val');
const hillshadeToggle = $('hillshade-toggle');
const hillshadeSlider = $('hillshade-opacity');
const hillshadeOpacityVal = $('hillshade-opacity-val');

(function initLayerControls() {
  const savedFloodAlpha = localStorage.getItem(STORAGE_KEYS.floodAlpha);
  if (savedFloodAlpha !== null) {
    floodSlider.value = savedFloodAlpha;
  }
  state.floodAlpha = Number(floodSlider.value) / 100;
  floodOpacityVal.textContent = `${floodSlider.value}%`;

  const savedHsOn = localStorage.getItem(STORAGE_KEYS.hillshadeOn);
  if (savedHsOn !== null) {
    hillshadeToggle.checked = savedHsOn === 'true';
  }

  const savedHsAlpha = localStorage.getItem(STORAGE_KEYS.hillshadeAlpha);
  if (savedHsAlpha !== null) {
    hillshadeSlider.value = savedHsAlpha;
  }
  hillshadeOpacityVal.textContent = `${hillshadeSlider.value}%`;

  floodSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    state.floodAlpha = val / 100;
    floodOpacityVal.textContent = `${val}%`;
    floodGroupEl().style.opacity = String(state.floodAlpha);
    localStorage.setItem(STORAGE_KEYS.floodAlpha, String(val));
  });

  hillshadeToggle.addEventListener('change', (e) => {
    localStorage.setItem(STORAGE_KEYS.hillshadeOn, String(e.target.checked));
    if (!state.hillshade) return;
    if (e.target.checked) state.hillshade.addTo(map);
    else map.removeLayer(state.hillshade);
  });

  hillshadeSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    hillshadeOpacityVal.textContent = `${val}%`;
    localStorage.setItem(STORAGE_KEYS.hillshadeAlpha, String(val));
    if (state.hillshade) state.hillshade.setOpacity(val / 100);
  });
})();

function parseSavedList(storageKey, validArray, fallbackValue) {
  const raw = localStorage.getItem(storageKey);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v) => validArray.includes(Number(v))).map(Number);
      }
    } catch (_) {
      return [fallbackValue];
    }
  }
  return [fallbackValue];
}

async function loadAppData() {
  hideError();
  showLoading('Memuat data DEMNAS dan poligon genangan Kota Pontianak...');

  try {
    const [meta, statsRes, rainStatsRes, demGrid, boundaryGj] = await Promise.all([
      fetch('data/meta.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('data/stats.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('data/rain_stats.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('data/dem_grid.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('data/pontianak_boundary.geojson', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ]);

    state.levels = meta.levels;
    state.rainDurations = meta.rainDurations || [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
    state.rainIntensityMmHr = meta.rainIntensityMmHr || 55;
    state.dataVersion = meta.version || '';
    state.stats = statsRes.stats;
    state.rainStats = rainStatsRes.stats;
    state.demGrid = demGrid;

    if (state.boundaryLayer) {
      map.removeLayer(state.boundaryLayer);
    }
    state.boundaryLayer = L.geoJSON(boundaryGj, {
      interactive: false,
      style: {
        color: '#0f766e',
        weight: 2.2,
        opacity: 0.9,
        fillOpacity: 0,
        dashArray: '6, 5',
      },
    }).addTo(map);

    if (state.hillshade) {
      map.removeLayer(state.hillshade);
    }
    state.hillshade = L.imageOverlay(`data/hillshade.png?v=${state.dataVersion}`, meta.bounds, {
      opacity: Number(hillshadeSlider.value) / 100,
    });
    if (hillshadeToggle.checked) {
      state.hillshade.addTo(map);
    }

    const initialWater = parseSavedList(STORAGE_KEYS.levels, state.levels, state.levels[0]);
    const initialRain = parseSavedList(
      STORAGE_KEYS.rainDurations,
      state.rainDurations,
      state.rainDurations[0]
    );
    state.selectedWater = new Set(initialWater);
    state.selectedRain = new Set(initialRain);

    const savedMode = localStorage.getItem(STORAGE_KEYS.mode);
    const startMode = savedMode === 'rain' ? 'rain' : 'water';
    await setSimMode(startMode, false);
    sheet.measure();
  } catch (err) {
    showError('Gagal memuat data geospasial Kota Pontianak. Pastikan Apache XAMPP aktif.');
  }
}

$('retry-btn').addEventListener('click', loadAppData);

buildBasemapRadio();
loadAppData();
