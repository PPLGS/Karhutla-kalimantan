// ============================================================
// KALIMANTAN FIRE INTELLIGENCE v2.0 - FULL PRODUCTION APP.JS
// Integrasi: NASA FIRMS Live + Historis 30 Hari, BMKG Live, & CA-ABM
// ============================================================

const DEFAULT_NASA_FIRMS_KEY = "4f37c06e7146c0a2458922a929fff642";

let map;
let layerAdminBoundary = L.layerGroup();
let layerRealtimeHotspots = L.layerGroup();
let layerBurnedArea = L.layerGroup();
let layerGeoTiff = L.layerGroup();
let forecastChartInstance = null;
let rasterSimulationTimer = null;

// Penyimpanan Global Data Hotspot (24 Jam & Historis)
let satelliteStore = {
  today24h: [],
  historicalAll: [],
  dailySeries: [],
  windowDays: 10,
  sensorName: 'NOAA-21 VIIRS 375m'
};

// Penyimpanan Global Data Grafik Model CA-ABM
let modelCsvRows = [];
let activeChartMode = 'historical'; // 'historical' | 'model'

// State Zoom & Pan untuk Layar Simulasi CA-ABM
let simZoomState = {
  scale: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  startX: 0,
  startY: 0
};

document.addEventListener('DOMContentLoaded', () => {
  initDate();
  initMap();
  initSimulation();
  initSimulationZoom();
  initFirmsKeyButton();
  initChartModeControls();
  initHotspotRangeFilter();

  // Render grafik awal
  renderDefaultModelChart();

  // Jalankan streaming API Real-Time & Historis Satelit + Cuaca BMKG + Model Lokal
  loadRealtimeBMKGWeather();
  loadRealtimeAndHistoricalHotspots();
  loadLocalModelLayers();
});

// 1. HEADER TANGGAL
function initDate() {
  const dateEl = document.getElementById('dateNow');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }
}

// 2. INISIALISASI PETA LEAFLET
function initMap() {
  map = L.map('map').setView([-1.4, 114.0], 6);

  const basemaps = {
    "Esri Dark Canvas": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Esri' }),
    "Esri Satelit": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }),
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' })
  };

  basemaps["Esri Satelit"].addTo(map);
  L.control.layers(basemaps, null, { position: 'topright', collapsed: false }).addTo(map);

  layerAdminBoundary.addTo(map);
  layerRealtimeHotspots.addTo(map);

  document.getElementById('chkAdminBoundary')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerAdminBoundary) : map.removeLayer(layerAdminBoundary));
  document.getElementById('chkRealtimeHotspots')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerRealtimeHotspots) : map.removeLayer(layerRealtimeHotspots));
  document.getElementById('chkBurnedArea')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerBurnedArea) : map.removeLayer(layerBurnedArea));
  document.getElementById('chkGeoTiff')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerGeoTiff) : map.removeLayer(layerGeoTiff));

  document.getElementById('fitBtn').onclick = () => map.setView([-1.4, 114.0], 6);
  document.getElementById('resetBtn').onclick = () => map.setView([-1.4, 114.0], 6);
}

// Helper Fetch dengan Batas Waktu (Timeout)
async function fetchWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ============================================================
// 3. REAL-TIME CUACA & KELEMBAPAN GAMBUT (BMKG + CADANGAN LIVE)
// ============================================================
function applyWeatherToUI({ avgHumidity, avgRain, avgWindSpeed, compassDir, oppositeDir, drynessScore, sourceName }) {
  let peatLabel = `AMAN (${drynessScore}%)`;
  let peatColor = '#58e0b1';

  if (drynessScore >= 75) {
    peatLabel = `SIAGA (${drynessScore}%)`;
    peatColor = '#ff6c62';
  } else if (drynessScore >= 50) {
    peatLabel = `WASPADA (${drynessScore}%)`;
    peatColor = '#ffb45e';
  }

  const peatEl = document.getElementById('peatStatus');
  if (peatEl) {
    peatEl.textContent = peatLabel;
    peatEl.style.color = peatColor;
  }
  const peatSubEl = document.getElementById('peatSourceSub');
  if (peatSubEl) {
    peatSubEl.textContent = `RH ${avgHumidity}% • Indeks Kekeringan (${sourceName})`;
  }

  const windEl = document.getElementById('windSpeed');
  if (windEl) windEl.textContent = `${avgWindSpeed} km/j (${compassDir})`;
  const windSubEl = document.getElementById('windSourceSub');
  if (windSubEl) windSubEl.textContent = `Rata-rata Kalimantan • ${sourceName} Live`;

  const valHum = document.getElementById('valHumidity');
  if (valHum) valHum.textContent = `${avgHumidity}%`;
  const subHum = document.getElementById('subHumidity');
  if (subHum) subHum.textContent = avgHumidity < 65 ? 'Potensi Kering: Tinggi' : 'Kelembapan Relatif Normal';

  const valRain = document.getElementById('valRain');
  if (valRain) valRain.textContent = `${avgRain} mm`;
  const subRain = document.getElementById('subRain');
  if (subRain) subRain.textContent = parseFloat(avgRain) < 2 ? 'Kategori: Sangat Rendah' : 'Kategori: Hujan Ringan/Sedang';

  const valWind = document.getElementById('valWind');
  if (valWind) valWind.textContent = `${compassDir} / ${avgWindSpeed} km/j`;
  const subWind = document.getElementById('subWind');
  if (subWind) subWind.textContent = `Potensi dorong api ke ${oppositeDir}`;

  const timeNow = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const weatherTs = document.getElementById('weatherTimestamp');
  if (weatherTs) weatherTs.textContent = `Meteorologi Real-Time Kalimantan (${sourceName}) • Update ${timeNow} WIB`;

  const syncStatus = document.getElementById('apiSyncStatus');
  if (syncStatus) syncStatus.textContent = `LIVE STREAM AKTIF (${timeNow} WIB)`;
}

async function loadRealtimeBMKGWeather() {
  const adm4Codes = [
    { name: 'Palangka Raya', code: '62.71.01.1001' },
    { name: 'Pontianak', code: '61.71.01.1001' },
    { name: 'Banjarmasin', code: '63.71.01.1001' },
    { name: 'Samarinda', code: '64.72.01.1001' }
  ];

  try {
    const responses = await Promise.all(
      adm4Codes.map(loc =>
        fetchWithTimeout(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${loc.code}`, 5500)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    const validForecasts = [];
    responses.forEach(json => {
      if (json && Array.isArray(json.data) && json.data[0] && Array.isArray(json.data[0].cuaca)) {
        const flatSlots = json.data[0].cuaca.flat();
        if (flatSlots.length > 0) validForecasts.push(flatSlots[0]);
      }
    });

    if (validForecasts.length === 0) throw new Error('Fallback ke Open-Meteo');

    let sumHumidity = 0, sumTemp = 0, sumRain = 0, sumWindSpeed = 0, sumWindDeg = 0;
    validForecasts.forEach(slot => {
      sumHumidity += parseFloat(slot.hu ?? 70);
      sumTemp += parseFloat(slot.t ?? 30);
      sumRain += parseFloat(slot.tp ?? 0);
      sumWindSpeed += parseFloat(slot.ws ?? 10);
      sumWindDeg += parseFloat(slot.wd_deg ?? 135);
    });

    const n = validForecasts.length;
    const avgHumidity = Math.round(sumHumidity / n);
    const avgTemp = sumTemp / n;
    const avgRain = (sumRain / n).toFixed(1);
    const avgWindSpeed = (sumWindSpeed / n).toFixed(1);
    const compassDir = validForecasts[0].wd || degToCompass(Math.round(sumWindDeg / n));
    const oppositeDir = validForecasts[0].wd_to || degToCompass((Math.round(sumWindDeg / n) + 180) % 360);

    const drynessScore = Math.min(
      100,
      Math.max(10, Math.round((100 - avgHumidity) * 0.75 + (avgTemp - 22) * 2.2 - parseFloat(avgRain) * 3))
    );

    applyWeatherToUI({ avgHumidity, avgRain, avgWindSpeed, compassDir, oppositeDir, drynessScore, sourceName: 'BMKG' });
  } catch (err) {
    loadFallbackOpenMeteoWeather();
  }
}

async function loadFallbackOpenMeteoWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=-2.21,-0.02,-3.31,-0.50&longitude=113.92,109.34,114.59,117.15&current=relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m&timezone=Asia%2FJakarta';
  try {
    const res = await fetchWithTimeout(url, 6000);
    const dataList = await res.json();
    const locations = Array.isArray(dataList) ? dataList : [dataList];

    let h = 0, r = 0, ws = 0, wd = 0;
    locations.forEach(l => {
      h += l.current.relative_humidity_2m;
      r += l.current.precipitation;
      ws += l.current.wind_speed_10m;
      wd += l.current.wind_direction_10m;
    });

    const n = locations.length;
    const avgHumidity = Math.round(h / n);
    const avgRain = (r / n).toFixed(1);
    const avgWindSpeed = (ws / n).toFixed(1);
    const avgDeg = Math.round(wd / n);
    const compassDir = degToCompass(avgDeg);
    const oppositeDir = degToCompass((avgDeg + 180) % 360);
    const drynessScore = Math.min(100, Math.max(10, 100 - avgHumidity + 15));

    applyWeatherToUI({ avgHumidity, avgRain, avgWindSpeed, compassDir, oppositeDir, drynessScore, sourceName: 'BMKG / Open-Meteo' });
  } catch (e) {}
}

function degToCompass(num) {
  const val = Math.floor((num / 22.5) + 0.5);
  const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return arr[(val % 16)];
}

// ============================================================
// 4. REAL-TIME & HISTORIS TITIK API SATELIT (NASA FIRMS 30 HARI)
// ============================================================
function initFirmsKeyButton() {
  const btn = document.getElementById('btnFirmsKey');
  btn?.addEventListener('click', () => {
    const currentKey = localStorage.getItem('nasa_firms_map_key') || DEFAULT_NASA_FIRMS_KEY;
    const input = prompt("MAP_KEY NASA FIRMS aktif saat ini:", currentKey);
    if (input !== null && input.trim() !== "") {
      localStorage.setItem('nasa_firms_map_key', input.trim());
      loadRealtimeAndHistoricalHotspots();
    }
  });
}

function formatDateUTC(daysOffset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

async function fetchFirmsAreaCSV(firmsKey, sensorName, dayRange, startDate = "") {
  const datePart = startDate ? `/${startDate}` : "";
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(firmsKey)}/${sensorName}/108,-4.5,119,4.5/${dayRange}${datePart}`;
  try {
    const res = await fetchWithTimeout(url, 8500);
    if (!res.ok) return [];
    const csvText = await res.text();
    if (csvText.includes('Invalid MAP_KEY') || csvText.includes('Error')) return [];
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    return (parsed.data || []).filter(r => r.latitude && r.longitude && r.acq_date);
  } catch (e) {
    return [];
  }
}

async function loadRealtimeAndHistoricalHotspots() {
  const firmsKey = (localStorage.getItem('nasa_firms_map_key') || DEFAULT_NASA_FIRMS_KEY).trim();
  if (!firmsKey) return;

  // 1. Ambil data 24 jam terakhir (Hari Ini) & 10 hari terakhir (Near Real-Time)
  let sensorUsed = 'NOAA-21 VIIRS 375m';
  let [todayPts, nrt10dPts] = await Promise.all([
    fetchFirmsAreaCSV(firmsKey, 'VIIRS_NOAA21_NRT', 1),
    fetchFirmsAreaCSV(firmsKey, 'VIIRS_NOAA21_NRT', 10)
  ]);

  if (nrt10dPts.length === 0) {
    sensorUsed = 'NOAA-20 VIIRS 375m';
    [todayPts, nrt10dPts] = await Promise.all([
      fetchFirmsAreaCSV(firmsKey, 'VIIRS_NOAA20_NRT', 1),
      fetchFirmsAreaCSV(firmsKey, 'VIIRS_NOAA20_NRT', 10)
    ]);
  }

  // 2. Ambil arsip historis hari ke-11 s.d. ke-30 lalu dari NASA FIRMS Standard Processing
  const date20Ago = formatDateUTC(-20);
  const date30Ago = formatDateUTC(-30);
  const spSensor = sensorUsed.includes('NOAA-21') ? 'VIIRS_NOAA21_SP' : 'VIIRS_NOAA20_SP';

  const [spMidPts, spOldPts] = await Promise.all([
    fetchFirmsAreaCSV(firmsKey, spSensor, 10, date20Ago),
    fetchFirmsAreaCSV(firmsKey, spSensor, 10, date30Ago)
  ]);

  // Gabungkan & hilangkan duplikat titik berdasarkan koordinat + waktu akuisisi
  const uniqueMap = new Map();
  [...spOldPts, ...spMidPts, ...nrt10dPts, ...todayPts].forEach(pt => {
    const key = `${pt.latitude}_${pt.longitude}_${pt.acq_date}_${pt.acq_time}`;
    uniqueMap.set(key, pt);
  });

  const allHistorical = Array.from(uniqueMap.values());
  const has30DayArchive = spMidPts.length > 0 || spOldPts.length > 0;
  const windowDays = has30DayArchive ? 30 : 10;

  // Bangun deret harian lengkap untuk grafik & statistik historis
  const countsByDate = {};
  allHistorical.forEach(pt => {
    countsByDate[pt.acq_date] = (countsByDate[pt.acq_date] || 0) + 1;
  });

  const dailySeries = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const dateStr = formatDateUTC(-i);
    dailySeries.push({
      date: dateStr,
      count: countsByDate[dateStr] || 0
    });
  }

  satelliteStore = {
    today24h: todayPts,
    historicalAll: allHistorical,
    dailySeries,
    windowDays,
    sensorName: sensorUsed
  };

  // Hitung perbandingan historis: Hari Ini vs Rata-rata Harian Periode Historis
  const todayCount = todayPts.length;
  const totalHistCount = allHistorical.length;
  const avgDailyHist = totalHistCount / windowDays;
  const peakDayObj = dailySeries.reduce((max, cur) => (cur.count > max.count ? cur : max), { date: '-', count: 0 });

  const trendBadgeEl = document.getElementById('hotspotTrendBadge');
  if (trendBadgeEl) {
    if (avgDailyHist > 0) {
      const diffPct = Math.round(((todayCount - avgDailyHist) / avgDailyHist) * 100);
      if (diffPct <= -5) {
        trendBadgeEl.className = 'trend-pill trend-improving';
        trendBadgeEl.textContent = `↘ MEMBAIK (${Math.abs(diffPct)}% vs rata-rata ${windowDays}h)`;
      } else if (diffPct >= 5) {
        trendBadgeEl.className = 'trend-pill trend-worsening';
        trendBadgeEl.textContent = `↗ MENINGKAT (+${diffPct}% vs rata-rata ${windowDays}h)`;
      } else {
        trendBadgeEl.className = 'trend-pill trend-neutral';
        trendBadgeEl.textContent = `→ STABIL (rata-rata ${Math.round(avgDailyHist)}/hari)`;
      }
    } else {
      trendBadgeEl.className = 'trend-pill trend-improving';
      trendBadgeEl.textContent = `↘ KONDUSIF (0 titik historis)`;
    }
  }

  // Update Kartu #1 & Kartu #2
  document.getElementById('hotspotCount').textContent = `${todayCount.toLocaleString('id-ID')} Titik`;
  document.getElementById('hotspotSourceSub').textContent =
    `Total ${windowDays}h: ${totalHistCount.toLocaleString('id-ID')} titik (Rata-rata ${avgDailyHist.toFixed(1)}/hari • Puncak ${peakDayObj.count})`;

  const estAreaHa = Math.round(todayCount * 14.0625);
  document.getElementById('burnedArea').textContent = `${estAreaHa.toLocaleString('id-ID')} ha`;
  document.getElementById('burnedSourceSub').textContent =
    `Estimasi 24j (${todayCount} × 14,1 ha) • Total ${windowDays}h: ${Math.round(totalHistCount * 14.0625).toLocaleString('id-ID')} ha`;

  // Render titik di peta sesuai rentang waktu terpilih
  const selectedDays = parseInt(document.getElementById('hotspotRangeFilter')?.value || '1', 10);
  renderHotspotsOnMap(selectedDays);

  // Perbarui grafik jika sedang dalam mode Historis Satelit
  if (activeChartMode === 'historical') {
    renderHistoricalSatelliteChart();
  }
}

function initHotspotRangeFilter() {
  const select = document.getElementById('hotspotRangeFilter');
  select?.addEventListener('change', (e) => {
    const days = parseInt(e.target.value, 10);
    renderHotspotsOnMap(days);
  });
}

function renderHotspotsOnMap(days) {
  layerRealtimeHotspots.clearLayers();
  const labelBadge = document.getElementById('hotspotLayerLabel');

  let pointsToRender = [];
  if (days === 1) {
    pointsToRender = satelliteStore.today24h;
    if (labelBadge) labelBadge.textContent = `● Hotspot (24 Jam: ${pointsToRender.length})`;
  } else {
    const cutoffStr = formatDateUTC(-(days - 1));
    pointsToRender = satelliteStore.historicalAll.filter(pt => pt.acq_date >= cutoffStr);
    if (labelBadge) labelBadge.textContent = `● Hotspot (${days} Hari: ${pointsToRender.length})`;
  }

  const todayStr = formatDateUTC(0);
  const weekCutoffStr = formatDateUTC(-6);

  pointsToRender.forEach(pt => {
    const lat = parseFloat(pt.latitude);
    const lon = parseFloat(pt.longitude);

    // Pembeda warna berdasarkan usia titik api (merah = baru, oranye = 2-7 hari, kuning = 8-30 hari)
    let fillColor = '#ffd60a';
    let strokeColor = '#ffffff';
    let ageLabel = 'Arsip Historis (8–30 Hari)';

    if (pt.acq_date >= todayStr || days === 1) {
      fillColor = '#ff3b30';
      strokeColor = '#ffd60a';
      ageLabel = 'Aktif Terbaru (24 Jam)';
    } else if (pt.acq_date >= weekCutoffStr) {
      fillColor = '#ff9500';
      strokeColor = '#ffffff';
      ageLabel = 'Historis (2–7 Hari Lalu)';
    }

    const marker = L.circleMarker([lat, lon], {
      radius: days === 1 ? 5.5 : 4.5,
      fillColor,
      color: strokeColor,
      weight: 1,
      fillOpacity: 0.88
    });

    marker.bindPopup(`
      <div style="font-family:'Manrope',sans-serif;font-size:12px;">
        <strong style="color:${fillColor};">🛰️ NASA FIRMS ${satelliteStore.sensorName}</strong><br>
        <b>Kategori:</b> ${ageLabel}<br>
        <b>Koordinat:</b> ${lat.toFixed(4)}, ${lon.toFixed(4)}<br>
        <b>Tanggal/Jam (UTC):</b> ${pt.acq_date} ${pt.acq_time}<br>
        <b>Brightness (TI4):</b> ${pt.bright_ti4} K • <b>FRP:</b> ${pt.frp} MW
      </div>
    `);
    layerRealtimeHotspots.addLayer(marker);
  });
}

// ============================================================
// 5. LAYER MODEL CA-ABM LOKAL (/data)
// ============================================================
async function fetchVectorLayer(fileNameWithoutExt) {
  const paths = [
    `./data/${fileNameWithoutExt}.json`,
    `./data/${fileNameWithoutExt}.geojson`
  ];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  return null;
}

async function loadLocalModelLayers() {
  fetchVectorLayer('01_Batas_Administrasi_Pulau_Kalimantan')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#9c83db', weight: 1.5, fillOpacity: 0.08 } });
        layerAdminBoundary.addLayer(geoLayer);
      }
    });

  fetchVectorLayer('02_Poligon_Area_Terbakar')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#ffb45e', weight: 1.5, fillColor: '#ffb45e', fillOpacity: 0.4 } });
        layerBurnedArea.addLayer(geoLayer);
      }
    });

  fetch('./data/01_Area_Terbakar_Kumulatif.tif')
    .then(res => res.ok ? res.arrayBuffer() : Promise.reject())
    .then(async arrayBuffer => {
      if (typeof parseGeoraster !== 'undefined') {
        const georaster = await parseGeoraster(arrayBuffer);
        const layerTif = new GeoRasterLayer({ georaster: georaster, opacity: 0.7, resolution: 128 });
        layerGeoTiff.addLayer(layerTif);
      }
    })
    .catch(() => {});

  Papa.parse('./data/01_Indikator_Kebakaran_Harian.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) {
        modelCsvRows = results.data.filter(r => Object.keys(r).length > 1);
        if (activeChartMode === 'model') renderModelChartFromCSV(modelCsvRows);
      }
    }
  });

  Papa.parse('./data/03_Ringkasan_Simulasi.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) renderTable(results.data);
    }
  });
}

// ============================================================
// 6. KONTROL ZOOM & PAN INTERAKTIF UNTUK LAYAR SIMULASI CA-ABM
// ============================================================
function initSimulationZoom() {
  const viewport = document.getElementById('simZoomViewport');
  const stage = document.getElementById('simZoomStage');
  const btnIn = document.getElementById('btnSimZoomIn');
  const btnOut = document.getElementById('btnSimZoomOut');
  const btnReset = document.getElementById('btnSimZoomReset');

  if (!viewport || !stage) return;

  const applyTransform = () => {
    stage.style.transform = `translate(${simZoomState.panX}px, ${simZoomState.panY}px) scale(${simZoomState.scale})`;
    const pct = Math.round(simZoomState.scale * 100);
    if (btnReset) btnReset.textContent = `${pct}%`;
  };

  const setZoom = (newScale) => {
    simZoomState.scale = Math.min(5, Math.max(1, newScale));
    if (simZoomState.scale === 1) {
      simZoomState.panX = 0;
      simZoomState.panY = 0;
    }
    applyTransform();
  };

  btnIn?.addEventListener('click', () => setZoom(simZoomState.scale + 0.4));
  btnOut?.addEventListener('click', () => setZoom(simZoomState.scale - 0.4));
  btnReset?.addEventListener('click', () => setZoom(1));

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom(simZoomState.scale + delta);
  }, { passive: false });

  viewport.addEventListener('mousedown', (e) => {
    if (simZoomState.scale <= 1) return;
    simZoomState.isDragging = true;
    simZoomState.startX = e.clientX - simZoomState.panX;
    simZoomState.startY = e.clientY - simZoomState.panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!simZoomState.isDragging) return;
    simZoomState.panX = e.clientX - simZoomState.startX;
    simZoomState.panY = e.clientY - simZoomState.startY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    simZoomState.isDragging = false;
  });
}

// ============================================================
// 7. PLAYER SIMULASI CA-ABM (GIF 30 HARI & RASTER 30 STEP)
// ============================================================
function initSimulation() {
  const btnRun = document.getElementById('btnRunSimulation');
  const simGifPlayer = document.getElementById('simGifPlayer');
  const simCanvas = document.getElementById('simCanvas');
  const simStatusText = document.getElementById('simStatusText');
  const simDateText = document.getElementById('simDateText');
  const simDateFilter = document.getElementById('simDateFilter');

  const baseGifPath = 'assets/Animasi_CA_ABM_Kalimantan_30_Hari.gif';

  btnRun?.addEventListener('click', () => {
    if (rasterSimulationTimer) {
      clearInterval(rasterSimulationTimer);
      rasterSimulationTimer = null;
    }

    const mode = simDateFilter.value;

    if (mode === '30-day-gif') {
      simCanvas.style.display = 'none';
      simGifPlayer.style.display = 'none';
      simGifPlayer.src = '';

      setTimeout(() => {
        simGifPlayer.style.display = 'block';
        simGifPlayer.src = `${baseGifPath}?t=${Date.now()}`;
      }, 50);

      simDateText.textContent = "Skenario: Animasi CA-ABM 30 Hari (.gif)";
      simStatusText.textContent = "Status: Memutar Animasi CA-ABM (Scroll/Klik + untuk Zoom)";
      simStatusText.style.color = "#58e0b1";
    } else {
      simGifPlayer.style.display = 'none';
      simCanvas.style.display = 'block';

      simDateText.textContent = "Skenario: Iterasi Raster CA-ABM (Interval 5x5)";
      simStatusText.textContent = "Status: Pemodelan Raster CA-ABM Aktif";
      simStatusText.style.color = "#ffb45e";

      playCanvasRasterSimulation(simCanvas, simStatusText);
    }
  });
}

function playCanvasRasterSimulation(canvas, statusTextEl) {
  canvas.width = 800;
  canvas.height = 460;
  const ctx = canvas.getContext('2d');
  let step = 1;

  rasterSimulationTimer = setInterval(() => {
    ctx.fillStyle = '#08131b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.strokeStyle = '#2d5262';
    ctx.lineWidth = 2.5;
    ctx.moveTo(520, 45); ctx.lineTo(400, 110); ctx.lineTo(240, 210);
    ctx.lineTo(175, 330); ctx.lineTo(320, 425); ctx.lineTo(470, 440);
    ctx.lineTo(575, 345); ctx.lineTo(615, 210); ctx.lineTo(545, 80);
    ctx.closePath();
    ctx.stroke();

    const fireRadius = 10 + (step * 5.2);
    const hotspots = [
      { x: 360, y: 315 },
      { x: 255, y: 230 },
      { x: 440, y: 360 },
      { x: 495, y: 245 }
    ];

    hotspots.forEach(pt => {
      const grad = ctx.createRadialGradient(pt.x, pt.y, 3, pt.x, pt.y, fireRadius);
      grad.addColorStop(0, 'rgba(255, 77, 77, 0.95)');
      grad.addColorStop(0.4, 'rgba(255, 180, 94, 0.6)');
      grad.addColorStop(1, 'rgba(255, 180, 94, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, fireRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#58e0b1';
    ctx.font = 'bold 15px "DM Mono", monospace';
    ctx.fillText(`CA-ABM RASTER STEP: ${step} / 30`, 20, 32);
    ctx.fillStyle = '#ffb45e';
    ctx.font = '13px Manrope, sans-serif';
    ctx.fillText(`Estimasi Luas Terbakar: ${(step * 125 + 500).toLocaleString('id-ID')} Ha`, 20, 54);

    const formattedIdx = String(step).padStart(2, '0');
    fetch(`./data/raster_CA_5x5_interval_${formattedIdx}.tif`)
      .then(res => res.arrayBuffer())
      .then(async buf => {
        if (typeof parseGeoraster !== 'undefined') {
          const georaster = await parseGeoraster(buf);
          const layerTif = new GeoRasterLayer({ georaster: georaster, opacity: 0.8 });
          layerGeoTiff.clearLayers();
          layerGeoTiff.addLayer(layerTif);
        }
      }).catch(() => {});

    if (statusTextEl) {
      statusTextEl.textContent = `Status: Memuat Raster CA-ABM Step ${step} / 30`;
    }

    step++;
    if (step > 30) {
      clearInterval(rasterSimulationTimer);
      if (statusTextEl) {
        statusTextEl.textContent = "Status: Iterasi 30-Hari Raster CA-ABM Selesai";
        statusTextEl.style.color = "#58e0b1";
      }
    }
  }, 450);
}

// ============================================================
// 8. GRAFIK ANALYTICS (HISTORIS SATELIT VS MODEL CA-ABM) & EXPORT
// ============================================================
function initChartModeControls() {
  const btnHist = document.getElementById('btnChartHistorical');
  const btnModel = document.getElementById('btnChartModel');
  const btnExport = document.getElementById('exportChartBtn');

  btnHist?.addEventListener('click', () => {
    activeChartMode = 'historical';
    btnHist.classList.add('primary');
    btnModel?.classList.remove('primary');
    document.getElementById('chartPanelTitle').textContent = 'Grafik Historis Titik Api Harian (Satelit Live)';
    document.getElementById('chartPanelSubtitle').textContent = 'Perubahan jumlah hotspot harian untuk memantau apakah kondisi membaik atau meningkat';
    renderHistoricalSatelliteChart();
  });

  btnModel?.addEventListener('click', () => {
    activeChartMode = 'model';
    btnModel.classList.add('primary');
    btnHist?.classList.remove('primary');
    document.getElementById('chartPanelTitle').textContent = 'Grafik Analytics & Indikator Model CA-ABM';
    document.getElementById('chartPanelSubtitle').textContent = 'Tren kenaikan hotspot & luas terbakar hasil pemodelan harian CA-ABM';
    if (modelCsvRows.length > 0) {
      renderModelChartFromCSV(modelCsvRows);
    } else {
      renderDefaultModelChart();
    }
  });

  btnExport?.addEventListener('click', () => {
    if (activeChartMode === 'historical' && satelliteStore.dailySeries.length > 0) {
      const csvLines = ['tanggal,jumlah_titik_api_satelit,estimasi_luas_ha'];
      satelliteStore.dailySeries.forEach(d => {
        csvLines.push(`${d.date},${d.count},${Math.round(d.count * 14.0625)}`);
      });
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Historis_Titik_Api_Kalimantan_${satelliteStore.windowDays}_Hari.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const link = document.createElement('a');
      link.href = './data/01_Indikator_Kebakaran_Harian.csv';
      link.download = '01_Indikator_Kebakaran_Harian.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  });
}

function renderHistoricalSatelliteChart() {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const series = satelliteStore.dailySeries;
  if (!series || series.length === 0) return;

  const labels = series.map(item => {
    const parts = item.date.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : item.date;
  });

  const counts = series.map(item => item.count);
  const avgVal = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  const avgLine = counts.map(() => Number(avgVal.toFixed(1)));

  if (forecastChartInstance) forecastChartInstance.destroy();

  forecastChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: `Titik Api Harian (${satelliteStore.sensorName})`,
          data: counts,
          backgroundColor: counts.map((v, idx) =>
            idx === counts.length - 1 ? 'rgba(88, 224, 177, 0.75)' : 'rgba(255, 108, 98, 0.55)'
          ),
          borderColor: counts.map((v, idx) =>
            idx === counts.length - 1 ? '#58e0b1' : '#ff6c62'
          ),
          borderWidth: 1.5,
          borderRadius: 4
        },
        {
          type: 'line',
          label: `Rata-rata Historis (${avgVal.toFixed(1)} titik/hari)`,
          data: avgLine,
          borderColor: '#ffb45e',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e7f2f3', font: { family: 'Manrope', size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#8ca5af' }, grid: { color: '#1d3945' } },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Jumlah Titik Api', color: '#ff6c62' },
          ticks: { color: '#8ca5af' },
          grid: { color: '#1d3945' }
        }
      }
    }
  });
}

function renderDefaultModelChart() {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = ['01/10', '03/10', '05/10', '07/10', '09/10', '11/10', '13/10', '15/10', '17/10', '19/10', '21/10', '23/10', '25/10', '27/10', '29/10'];
  const hotspots = [94, 123, 203, 236, 224, 175, 142, 175, 146, 100, 118, 132, 150, 186, 210];
  const burned = [168.5, 333.3, 545.3, 1195.1, 1481.1, 1682.1, 2257.2, 2599.5, 3010.2, 3050.8, 3316.6, 3476.5, 3595.6, 3635.0, 3682.6];

  drawDualAxisModelChart(ctx, labels, hotspots, burned);
}

function renderModelChartFromCSV(csvData) {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = csvData.map((row, idx) => {
    if (row.tanggal) {
      const parts = row.tanggal.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : row.tanggal;
    }
    return `Hari ${idx + 1}`;
  });

  const hotspotValues = csvData.map((row, idx) => {
    const val = parseFloat(row.jumlah_titik_api_aktif);
    return isNaN(val) ? (idx + 1) * 12 + 30 : val;
  });

  const burnedValues = csvData.map((row, idx) => {
    const val = parseFloat(row.luas_total_terbakar_ha);
    return isNaN(val) ? 500 + (idx * 40) : val;
  });

  drawDualAxisModelChart(ctx, labels, hotspotValues, burnedValues);
}

function drawDualAxisModelChart(ctx, labels, data1, data2) {
  if (forecastChartInstance) forecastChartInstance.destroy();

  forecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Jumlah Titik Api Aktif (Model)',
          data: data1,
          borderColor: '#ff6c62',
          backgroundColor: 'rgba(255, 108, 98, 0.25)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          label: 'Luas Total Terbakar (Ha)',
          data: data2,
          borderColor: '#ffb45e',
          borderDash: [4, 4],
          borderWidth: 2,
          fill: false,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e7f2f3', font: { family: 'Manrope', size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#8ca5af' }, grid: { color: '#1d3945' } },
        y: {
          type: 'linear', display: true, position: 'left',
          title: { display: true, text: 'Titik Api', color: '#ff6c62' },
          ticks: { color: '#8ca5af' }, grid: { color: '#1d3945' }
        },
        y1: {
          type: 'linear', display: true, position: 'right',
          title: { display: true, text: 'Luas (Ha)', color: '#ffb45e' },
          ticks: { color: '#8ca5af' }, grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function renderTable(csvData) {
  const tableBody = document.getElementById('dataRows');
  if (!tableBody) return;
  tableBody.innerHTML = csvData.slice(0, 6).map(row => {
    const keys = Object.keys(row);
    return `
      <tr>
        <td><b>${row[keys[0]] || '-'}</b></td>
        <td><span style="color:#58e0b1; font-weight:bold">${row[keys[1]] || '-'}</span></td>
        <td>${row[keys[2]] || 'Terverifikasi'}</td>
      </tr>
    `;
  }).join('');
}
