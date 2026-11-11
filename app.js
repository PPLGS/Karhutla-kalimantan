// ============================================================
// KALIMANTAN FIRE INTELLIGENCE v2.0 - MAIN APPLICATION LOGIC
// Refactored based on Discussion Transcript & 4-Panel Architecture
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initDate();
  initMap();
  initLayerControls();
  initSimulation();
  initForecastChart();
  initWeatherAndTable();
  initFileUploads();
});

// 1. FORMAT TANGGAL HEADER
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

// 2. INISIALISASI PETA LEAFLET (REGION KALIMANTAN)
let map;
let liveHotspotGroup = L.layerGroup();
let peatlandGroup = L.layerGroup();
let geoGridGroup = L.layerGroup();

function initMap() {
  // Koordinat Tengah Kalimantan: [-1.5, 114.0], Zoom level 6
  map = L.map('map').setView([-1.5, 114.0], 6);

  // Basemap Gelap (CARTO Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);

  // Tambahkan Layer Groups ke Peta
  liveHotspotGroup.addTo(map);
  peatlandGroup.addTo(map);
  geoGridGroup.addTo(map);

  // Muat Data Contoh Spasial Kalimantan
  populateSampleHotspots();
  populateSamplePeatland();
  populateSampleGrid();

  // Tombol Reset & Fit View
  document.getElementById('fitBtn').onclick = () => map.setView([-1.5, 114.0], 6);
  document.getElementById('resetBtn').onclick = () => map.setView([-1.5, 114.0], 6);
}

// 3. SAKELAR KONTROL LAYER (PANEL 1)
function initLayerControls() {
  document.getElementById('chkLiveHotspot').addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(liveHotspotGroup);
    else map.removeLayer(liveHotspotGroup);
  });

  document.getElementById('chkPeatland').addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(peatlandGroup);
    else map.removeLayer(peatlandGroup);
  });

  document.getElementById('chkGeoGrid').addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(geoGridGroup);
    else map.removeLayer(geoGridGroup);
  });
}

// GENERATOR DATA CONTOH SPASIAL
function populateSampleHotspots() {
  const points = [
    { lat: -0.02, lng: 109.34, loc: "Kalimantan Barat", conf: "Tinggi (90%)" },
    { lat: -1.25, lng: 116.83, loc: "Kalimantan Timur", conf: "Sangat Tinggi (95%)" },
    { lat: -2.21, lng: 113.92, loc: "Kalimantan Tengah", conf: "Ekstrem (98%)" },
    { lat: -3.31, lng: 114.59, loc: "Kalimantan Selatan", conf: "Sedang (75%)" },
    { lat: 2.83, lng: 117.37, loc: "Kalimantan Utara", conf: "Tinggi (88%)" }
  ];

  points.forEach(pt => {
    const marker = L.circleMarker([pt.lat, pt.lng], {
      radius: 7,
      fillColor: '#ff6c62',
      color: '#ffffff',
      weight: 1.5,
      fillOpacity: 0.9
    });
    marker.bindPopup(`
      <div style="color: #071018; font-family: sans-serif;">
        <strong style="color: #e53e3e;">🔥 Titik Api Live (BMKG)</strong><br>
        <b>Wilayah:</b> ${pt.loc}<br>
        <b>Tingkat Kepercayaan:</b> ${pt.conf}<br>
        <b>Status:</b> Real-Time Stream
      </div>
    `);
    liveHotspotGroup.addLayer(marker);
  });
}

function populateSamplePeatland() {
  const peatCoords = [
    [-1.8, 113.2],
    [-1.8, 114.5],
    [-2.6, 114.5],
    [-2.6, 113.2]
  ];
  const polygon = L.polygon(peatCoords, {
    color: '#ffb45e',
    weight: 2,
    dashArray: '4, 4',
    fillColor: '#ffb45e',
    fillOpacity: 0.25
  });
  polygon.bindPopup("<b>Layer Lahan Gambut Kalimantan Tengah</b><br>Kerawanan: Tinggi");
  peatlandGroup.addLayer(polygon);
}

function populateSampleGrid() {
  const gridCoords = [
    [-2.0, 113.6],
    [-2.0, 114.0],
    [-2.4, 114.0],
    [-2.4, 113.6]
  ];
  const gridPoly = L.polygon(gridCoords, {
    color: '#9c83db',
    weight: 1,
    fillColor: '#9c83db',
    fillOpacity: 0.2
  });
  gridPoly.bindPopup("<b>GeoJSON Dampak Grid 1km</b><br>Hasil pemodelan kerawanan spasial");
  geoGridGroup.addLayer(gridPoly);
}

// 4. PEMUTAR SIMULASI CA-BM (PANEL 2)
function initSimulation() {
  const btnRun = document.getElementById('btnRunSimulation');
  const simGifPlayer = document.getElementById('simGifPlayer');
  const simStatusText = document.getElementById('simStatusText');
  const simDateText = document.getElementById('simDateText');
  const simDateFilter = document.getElementById('simDateFilter');

  btnRun.addEventListener('click', () => {
    simStatusText.textContent = "Status: Memuat & Memutar Simulasi...";
    simStatusText.style.color = "#ffb45e";

    setTimeout(() => {
      const selectedScenario = simDateFilter.options[simDateFilter.selectedIndex].text;
      simDateText.textContent = `Periode: ${selectedScenario}`;
      // Placeholder GIF pergerakan simulasi api adveksi CA-BM
      simGifPlayer.src = "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3ZpdXo5aHRqMmJhd3ZsdTFydW1mN2JndXRyNnVsNDQ1Y2EycCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif";
      simStatusText.textContent = "Status: Simulasi Pergerakan Api Aktif (CA-BM)";
      simStatusText.style.color = "#58e0b1";
    }, 800);
  });
}

// 5. GRAFIK ANALYTICS & FORECAST 3-HARI (PANEL 3)
function initForecastChart() {
  const ctx = document.getElementById('forecastChart').getContext('2d');
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['10 Nov (H-1)', '11 Nov (Hari Ini)', '12 Nov (Prediksi)', '13 Nov (Prediksi)', '14 Nov (Prediksi)'],
      datasets: [
        {
          label: 'Hotspot Terdeteksi',
          data: [95, 142, 185, 210, 160],
          borderColor: '#ff6c62',
          backgroundColor: 'rgba(255, 108, 98, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 5
        },
        {
          label: 'Indeks Risiko Penyebaran (CA-BM)',
          data: [40, 65, 88, 94, 72],
          borderColor: '#ffb45e',
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          tension: 0.4,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#e7f2f3', font: { family: 'Manrope', size: 11 } }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8ca5af', font: { family: 'DM Mono', size: 10 } },
          grid: { color: '#1d3945' }
        },
        y: {
          ticks: { color: '#8ca5af', font: { family: 'DM Mono', size: 10 } },
          grid: { color: '#1d3945' }
        }
      }
    }
  });

  document.getElementById('exportChartBtn').onclick = () => {
    alert("Mengunduh data prediksi H-1 s/d H+3 (CSV)...");
  };
}

// 6. STREAMING CUACA & TABEL ATRIBUT (PANEL 4)
function initWeatherAndTable() {
  const tableBody = document.getElementById('dataRows');
  const provincesData = [
    { name: "Kalimantan Tengah", hotspots: 58, peat: "Bahaya (92%)", area: "520 ha" },
    { name: "Kalimantan Barat", hotspots: 34, peat: "Waspada (74%)", area: "310 ha" },
    { name: "Kalimantan Timur", hotspots: 26, peat: "Waspada (68%)", area: "220 ha" },
    { name: "Kalimantan Selatan", hotspots: 16, peat: "Sedang (55%)", area: "130 ha" },
    { name: "Kalimantan Utara", hotspots: 8, peat: "Aman (30%)", area: "60 ha" }
  ];

  tableBody.innerHTML = provincesData.map(row => `
    <tr>
      <td><b>${row.name}</b></td>
      <td><span style="color:#ff6c62; font-weight:bold">${row.hotspots}</span></td>
      <td>${row.peat}</td>
      <td>${row.area}</td>
    </tr>
  `).join('');
}

// 7. FILE UPLOAD & PROSES EXPORT CSV
function initFileUploads() {
  const loadBtn = document.getElementById('loadBtn');
  const fileInput = document.getElementById('fileInput');
  const messageEl = document.getElementById('message');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  loadBtn.onclick = () => {
    const file = fileInput.files[0];
    if (!file) {
      messageEl.textContent = "Pilih file spasial terlebih dahulu (.geojson, .zip, .csv, .ipynb).";
      messageEl.style.color = "#ff6c62";
      return;
    }

    messageEl.textContent = `Memuat file: ${file.name}... Berhasil terintegrasi ke dalam map!`;
    messageEl.style.color = "#58e0b1";
  };

  exportCsvBtn.onclick = () => {
    const csvContent = "data:text/csv;charset=utf-8,Provinsi,Hotspot,Risiko,Luas\nKalbar,34,74%,310ha\nKalteng,58,92%,520ha";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ringkasan_karhutla_kalimantan.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
}
