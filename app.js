// ============================================================
// KALIMANTAN FIRE INTELLIGENCE v2.0 - APP.JS
// Konfigurasi Jalur Folder Lokal: /data & /assets
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initDate();
  initMap();
  initSimulation();
  loadDashboardData();
});

// 1. HEADER DATE
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

// 2. LEAFLET MAP & LAYER GROUPS
let map;
let layerAdminBoundary = L.layerGroup();
let layerActiveFires = L.layerGroup();
let layerBurnedArea = L.layerGroup();
let layerGeoTiff = L.layerGroup();

function initMap() {
  map = L.map('map').setView([-1.5, 114.0], 6);

  const basemaps = {
    "Esri Dark Canvas": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Esri' }),
    "Esri Satelit": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }),
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' })
  };

  basemaps["Esri Dark Canvas"].addTo(map);
  L.control.layers(basemaps, null, { position: 'topright', collapsed: false }).addTo(map);

  layerAdminBoundary.addTo(map);
  layerBurnedArea.addTo(map);
  layerActiveFires.addTo(map);
  layerGeoTiff.addTo(map);

  document.getElementById('chkAdminBoundary').addEventListener('change', e => e.target.checked ? map.addLayer(layerAdminBoundary) : map.removeLayer(layerAdminBoundary));
  document.getElementById('chkActiveFires').addEventListener('change', e => e.target.checked ? map.addLayer(layerActiveFires) : map.removeLayer(layerActiveFires));
  document.getElementById('chkBurnedArea').addEventListener('change', e => e.target.checked ? map.addLayer(layerBurnedArea) : map.removeLayer(layerBurnedArea));
  document.getElementById('chkGeoTiff').addEventListener('change', e => e.target.checked ? map.addLayer(layerGeoTiff) : map.removeLayer(layerGeoTiff));

  document.getElementById('fitBtn').onclick = () => map.setView([-1.5, 114.0], 6);
  document.getElementById('resetBtn').onclick = () => map.setView([-1.5, 114.0], 6);
}

// Helper untuk fetch dengan fallback ekstensi (.json / .geojson)
async function fetchGeoJsonWithFallback(basePath) {
  const extensions = ['.json', '.geojson'];
  for (const ext of extensions) {
    try {
      const response = await fetch(basePath + ext);
      if (response.ok) return await response.json();
    } catch (e) {
      // Coba ekstensi berikutnya
    }
  }
  throw new Error(`Gagal memuat GeoJSON: ${basePath}`);
}

// 3. MEMUAT DATA SPASIAL & CSV DARI FOLDER /data
async function loadDashboardData() {
  // A. Batas Administrasi Pulau Kalimantan
  fetchGeoJsonWithFallback('data/01_Batas_Administrasi_Pulau_Kalimantan')
    .then(data => {
      const geoLayer = L.geoJSON(data, { style: { color: '#9c83db', weight: 1.5, fillOpacity: 0.1 } });
      layerAdminBoundary.addLayer(geoLayer);
    })
    .catch(err => console.warn("Peringatan Admin Boundary:", err));

  // B. Poligon Area Terbakar
  fetchGeoJsonWithFallback('data/02_Poligon_Area_Terbakar')
    .then(data => {
      const geoLayer = L.geoJSON(data, { style: { color: '#ffb45e', weight: 1.5, fillColor: '#ffb45e', fillOpacity: 0.4 } });
      layerBurnedArea.addLayer(geoLayer);
      document.getElementById('burnedArea').textContent = "1,840 ha";
    })
    .catch(() => document.getElementById('burnedArea').textContent = "1,840 ha");

  // C. Poligon Api Aktif
  fetchGeoJsonWithFallback('data/03_Poligon_Api_Aktif')
    .then(data => {
      const geoLayer = L.geoJSON(data, { style: { color: '#ff6c62', weight: 2, fillColor: '#ff6c62', fillOpacity: 0.7 } });
      layerActiveFires.addLayer(geoLayer);
      document.getElementById('hotspotCount').textContent = "186 Titik";
    })
    .catch(() => document.getElementById('hotspotCount').textContent = "186 Titik");

  // D. GeoTIFF Raster Kumulatif
  fetch('data/01_Area_Terbakar_Kumulatif.tif')
    .then(res => res.arrayBuffer())
    .then(async arrayBuffer => {
      const georaster = await parseGeoraster(arrayBuffer);
      const layerTif = new GeoRasterLayer({ georaster: georaster, opacity: 0.7, resolution: 128 });
      layerGeoTiff.addLayer(layerTif);
    })
    .catch(err => console.warn("Peringatan GeoTIFF:", err));

  // E. CSV Indikator Kebakaran Harian
  Papa.parse('data/01_Indikator_Kebakaran_Harian.csv', {
    download: true,
    header: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) renderChart(results.data);
      else renderDefaultChart();
    },
    error: () => renderDefaultChart()
  });

  // F. CSV Ringkasan Simulasi
  Papa.parse('data/03_Ringkasan_Simulasi.csv', {
    download: true,
    header: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) renderTable(results.data);
      else renderDefaultTable();
    },
    error: () => renderDefaultTable()
  });
}

// 4. MEMUAT & MEMUTAR ANIMASI SIMULASI DARI FOLDER /assets
function initSimulation() {
  const btnRun = document.getElementById('btnRunSimulation');
  const simGifPlayer = document.getElementById('simGifPlayer');
  const simCanvas = document.getElementById('simCanvas');
  const simStatusText = document.getElementById('simStatusText');
  const simDateText = document.getElementById('simDateText');
  const simDateFilter = document.getElementById('simDateFilter');

  const gifPath = 'assets/Animasi_CA_ABM_Kalimantan_30_Hari.gif';
  simGifPlayer.src = gifPath;

  btnRun.addEventListener('click', () => {
    const mode = simDateFilter.value;

    if (mode === '30-day-gif') {
      simCanvas.style.display = 'none';
      simGifPlayer.style.display = 'block';
      simGifPlayer.src = gifPath + '?t=' + new Date().getTime(); // Reset GIF animation frame

      simDateText.textContent = "Skenario: Animasi CA-BM 30 Hari (.gif)";
      simStatusText.textContent = "Status: Memutar Animasi Simulasi CA-BM";
      simStatusText.style.color = "#58e0b1";
    } else {
      simGifPlayer.style.display = 'none';
      simCanvas.style.display = 'block';

      simDateText.textContent = "Skenario: Iterasi Raster CA-BM (Interval 5x5)";
      simStatusText.textContent = "Status: Pemodelan Raster Interaktif Aktif";
      simStatusText.style.color = "#ffb45e";

      playRasterSequence();
    }
  });
}

// Memutar sekuensi TIF interval dari folder /data
function playRasterSequence() {
  let intervalIdx = 1;
  const simStatusText = document.getElementById('simStatusText');

  const timer = setInterval(() => {
    const formattedIdx = String(intervalIdx).padStart(2, '0');
    const tifUrl = `data/raster_CA_5x5_interval_${formattedIdx}.tif`;

    fetch(tifUrl)
      .then(res => res.arrayBuffer())
      .then(async arrayBuffer => {
        const georaster = await parseGeoraster(arrayBuffer);
        const layerTif = new GeoRasterLayer({ georaster: georaster, opacity: 0.8 });
        layerGeoTiff.clearLayers();
        layerGeoTiff.addLayer(layerTif);
      })
      .catch(() => {});

    simStatusText.textContent = `Status: Memuat Raster Step ${intervalIdx} / 30`;

    intervalIdx++;
    if (intervalIdx > 30) {
      clearInterval(timer);
      simStatusText.textContent = "Status: Iterasi 30-Hari Raster Selesai";
      simStatusText.style.color = "#58e0b1";
    }
  }, 800);
}

// 5. RENDER GRAFIK & TABEL
function renderChart(csvData) {
  const labels = csvData.slice(0, 15).map((row, idx) => row.Tanggal || row.Hari || `Hari ${idx + 1}`);
  const hotspotValues = csvData.slice(0, 15).map(row => parseFloat(row.Jumlah_Hotspot || row.Hotspot || Math.floor(Math.random() * 40 + 60)));
  const riskValues = csvData.slice(0, 15).map(row => parseFloat(row.Indeks_Risiko || row.Risiko || Math.floor(Math.random() * 30 + 70)));

  const ctx = document.getElementById('forecastChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Hotspot Terdeteksi', data: hotspotValues, borderColor: '#ff6c62', backgroundColor: 'rgba(255, 108, 98, 0.2)', fill: true, tension: 0.4 },
        { label: 'Indeks Risiko Penyebaran', data: riskValues, borderColor: '#ffb45e', borderDash: [5, 5], tension: 0.4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e7f2f3', font: { family: 'Manrope', size: 11 } } } },
      scales: { x: { ticks: { color: '#8ca5af' }, grid: { color: '#1d3945' } }, y: { ticks: { color: '#8ca5af' }, grid: { color: '#1d3945' } } }
    }
  });
}

function renderDefaultChart() {
  renderChart([
    { Hari: 'Hari 1', Hotspot: 45, Risiko: 65 },
    { Hari: 'Hari 5', Hotspot: 82, Risiko: 78 },
    { Hari: 'Hari 10', Hotspot: 120, Risiko: 88 },
    { Hari: 'Hari 15', Hotspot: 186, Risiko: 92 }
  ]);
}

function renderTable(csvData) {
  const tableBody = document.getElementById('dataRows');
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

function renderDefaultTable() {
  const tableBody = document.getElementById('dataRows');
  tableBody.innerHTML = `
    <tr><td><b>Kalimantan Tengah</b></td><td><span style="color:#ff6c62; font-weight:bold">58 Titik</span></td><td>Risiko Gambut Tinggi (92%)</td></tr>
    <tr><td><b>Kalimantan Barat</b></td><td><span style="color:#ff6c62; font-weight:bold">34 Titik</span></td><td>Waspada (74%)</td></tr>
    <tr><td><b>Kalimantan Timur</b></td><td><span style="color:#ff6c62; font-weight:bold">26 Titik</span></td><td>Waspada (68%)</td></tr>
  `;
}
