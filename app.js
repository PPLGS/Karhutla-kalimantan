// ============================================================
// KALIMANTAN FIRE INTELLIGENCE v2.0 - FULL PRODUCTION APP.JS
// Integrasi: NASA FIRMS NOAA-21/20 Live, BMKG/Open-Meteo, & CA-ABM
// ============================================================

const DEFAULT_NASA_FIRMS_KEY = "4f37c06e7146c0a2458922a929fff642";

let map;
let layerAdminBoundary = L.layerGroup();
let layerRealtimeHotspots = L.layerGroup();
let layerBurnedArea = L.layerGroup();
let layerGeoTiff = L.layerGroup();
let forecastChartInstance = null;
let rasterSimulationTimer = null;

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
  initExportCsvButton();

  // Render grafik analytics harian segera
  renderDefaultChart();

  // Jalankan streaming API Real-Time Cuaca & Satelit NASA FIRMS + layer model lokal
  loadRealtimeBMKGWeather();
  loadRealtimeSatelliteHotspots();
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

  // Kartu Atas #3: Status Lahan Gambut
  const peatEl = document.getElementById('peatStatus');
  if (peatEl) {
    peatEl.textContent = peatLabel;
    peatEl.style.color = peatColor;
  }
  const peatSubEl = document.getElementById('peatSourceSub');
  if (peatSubEl) {
    peatSubEl.textContent = `RH ${avgHumidity}% • Indeks Kekeringan (${sourceName})`;
  }

  // Kartu Atas #4: Kecepatan Angin
  const windEl = document.getElementById('windSpeed');
  if (windEl) windEl.textContent = `${avgWindSpeed} km/j (${compassDir})`;
  const windSubEl = document.getElementById('windSourceSub');
  if (windSubEl) windSubEl.textContent = `Rata-rata Kalimantan • ${sourceName} Live`;

  // Panel Cuaca Kanan Bawah
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

  // Timestamp Header & Subjudul Cuaca
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
        fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${loc.code}`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );

    const validForecasts = [];
    responses.forEach(json => {
      if (json && Array.isArray(json.data) && json.data[0] && Array.isArray(json.data[0].cuaca)) {
        const flatSlots = json.data[0].cuaca.flat();
        if (flatSlots.length > 0) {
          validForecasts.push(flatSlots[0]);
        }
      }
    });

    if (validForecasts.length === 0) {
      throw new Error('Respons BMKG kosong, beralih ke cadangan live');
    }

    let sumHumidity = 0;
    let sumTemp = 0;
    let sumRain = 0;
    let sumWindSpeed = 0;
    let sumWindDeg = 0;

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

    applyWeatherToUI({
      avgHumidity,
      avgRain,
      avgWindSpeed,
      compassDir,
      oppositeDir,
      drynessScore,
      sourceName: 'BMKG'
    });
  } catch (err) {
    loadFallbackOpenMeteoWeather();
  }
}

async function loadFallbackOpenMeteoWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=-2.21,-0.02,-3.31,-0.50&longitude=113.92,109.34,114.59,117.15&current=relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m&timezone=Asia%2FJakarta';
  try {
    const res = await fetch(url);
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

    applyWeatherToUI({
      avgHumidity,
      avgRain,
      avgWindSpeed,
      compassDir,
      oppositeDir,
      drynessScore,
      sourceName: 'BMKG / Open-Meteo'
    });
  } catch (e) {}
}

function degToCompass(num) {
  const val = Math.floor((num / 22.5) + 0.5);
  const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return arr[(val % 16)];
}

// ============================================================
// 4. REAL-TIME TITIK API SATELIT (NASA FIRMS NOAA-21 & NOAA-20)
// ============================================================
function initFirmsKeyButton() {
  const btn = document.getElementById('btnFirmsKey');
  btn?.addEventListener('click', () => {
    const currentKey = localStorage.getItem('nasa_firms_map_key') || DEFAULT_NASA_FIRMS_KEY;
    const input = prompt(
      "MAP_KEY NASA FIRMS aktif saat ini:",
      currentKey
    );
    if (input !== null && input.trim() !== "") {
      localStorage.setItem('nasa_firms_map_key', input.trim());
      loadRealtimeSatelliteHotspots();
    }
  });
}

async function fetchFirmsSensor(firmsKey, sensorName) {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(firmsKey)}/${sensorName}/108,-4.5,119,4.5/1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const csvText = await res.text();
  if (csvText.includes('Invalid MAP_KEY') || csvText.includes('Error')) return [];
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true
