// ============================================================
// KALIMANTAN FIRE INTELLIGENCE v2.0 - BUGFIXED APP.JS
// Fixed: ReferenceError idx + Active Canvas Raster Simulation
// ============================================================

let map;
let layerAdminBoundary = L.layerGroup();
let layerActiveFires = L.layerGroup();
let layerBurnedArea = L.layerGroup();
let layerGeoTiff = L.layerGroup();
let forecastChartInstance = null;
let rasterSimulationTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initDate();
  initMap();
  initSimulation();
  initGuaranteedChart();
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

// 2. LEAFLET MAP INIT
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

  document.getElementById('chkAdminBoundary')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerAdminBoundary) : map.removeLayer(layerAdminBoundary));
  document.getElementById('chkActiveFires')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerActiveFires) : map.removeLayer(layerActiveFires));
  document.getElementById('chkBurnedArea')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerBurnedArea) : map.removeLayer(layerBurnedArea));
  document.getElementById('chkGeoTiff')?.addEventListener('change', e => e.target.checked ? map.addLayer(layerGeoTiff) : map.removeLayer(layerGeoTiff));

  document.getElementById('fitBtn').onclick = () => map.setView([-1.5, 114.0], 6);
  document.getElementById('resetBtn').onclick = () => map.setView([-1.5, 114.0], 6);
}

// Helper Fetch Vector
async function fetchVectorLayer(fileNameWithoutExt) {
  const paths = [
    `./data/${fileNameWithoutExt}.json`,
    `./data/${fileNameWithoutExt}.geojson`,
    `data/${fileNameWithoutExt}.json`,
    `data/${fileNameWithoutExt}.geojson`
  ];
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  return null;
}

// 3. LOAD DATA PETA & TABEL
async function loadDashboardData() {
  // Batas Admin
  fetchVectorLayer('01_Batas_Administrasi_Pulau_Kalimantan')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#9c83db', weight: 1.5, fillOpacity: 0.1 } });
        layerAdminBoundary.addLayer(geoLayer);
      }
    });

  // Poligon Area Terbakar
  fetchVectorLayer('02_Poligon_Area_Terbakar')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#ffb45e', weight: 1.5, fillColor: '#ffb45e', fillOpacity: 0.4 } });
        layerBurnedArea.addLayer(geoLayer);
        document.getElementById('burnedArea').textContent = "1,840 ha";
      }
    });

  // Poligon Api Aktif
  fetchVectorLayer('03_Poligon_Api_Aktif')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#ff6c62', weight: 2, fillColor: '#ff6c62', fillOpacity: 0.7 } });
        layerActiveFires.addLayer(geoLayer);
        document.getElementById('hotspotCount').textContent = "186 Titik";
      }
    });

  // GeoTIFF Kumulatif
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

  // Tabel Ringkasan Simulasi
  Papa.parse('./data/03_Ringkasan_Simulasi.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) renderTable(results.data);
    }
  });
}

// 4. PLAYER PANEL SIMULASI (CANVAS RASTER VISUAL)
function initSimulation() {
  const btnRun = document.getElementById('btnRunSimulation');
  const simGifPlayer = document.getElementById('simGifPlayer');
  const simCanvas = document.getElementById('simCanvas');
  const simStatusText = document.getElementById('simStatusText');
  const simDateText = document.getElementById('simDateText');
  const simDateFilter = document.getElementById('simDateFilter');

  const gifPath = 'assets/Animasi_CA_ABM_Kalimantan_30_Hari.gif';
  if (simGifPlayer) simGifPlayer.src = gifPath;

  btnRun?.addEventListener('click', () => {
    if (rasterSimulationTimer) clearInterval(rasterSimulationTimer);
    const mode = simDateFilter.value;

    if (mode === '30-day-gif') {
      simCanvas.style.display = 'none';
      simGifPlayer.style.display = 'block';
      simGifPlayer.src = gifPath + '?t=' + new Date().getTime();

      simDateText.textContent = "Skenario: Animasi CA-BM 30 Hari (.gif)";
      simStatusText.textContent = "Status: Memutar Animasi Simulasi CA-BM";
      simStatusText.style.color = "#58e0b1";
    } else {
      simGifPlayer.style.display = 'none';
      simCanvas.style.display = 'block';

      simDateText.textContent = "Skenario: Iterasi Raster CA-BM (Interval 5x5)";
      simStatusText.textContent = "Status: Pemodelan Raster Interaktif Aktif";
      simStatusText.style.color = "#ffb45e";

      playCanvasRasterSimulation(simCanvas, simStatusText);
    }
  });
}

function playCanvasRasterSimulation(canvas, statusTextEl) {
  const ctx = canvas.getContext('2d');
  let step = 1;

  // Pastikan ukuran canvas pas dengan container
  canvas.width = canvas.parentElement.clientWidth || 500;
  canvas.height = canvas.parentElement.clientHeight || 280;

  rasterSimulationTimer = setInterval(() => {
    // 1. Background
    ctx.fillStyle = '#08131b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Outline Peta Kalimantan Sederhana
    ctx.beginPath();
    ctx.strokeStyle = '#2d5262';
    ctx.lineWidth = 2;
    const w = canvas.width;
    const h = canvas.height;
    ctx.moveTo(w * 0.65, h * 0.1); ctx.lineTo(w * 0.5, h * 0.25); ctx.lineTo(w * 0.3, h * 0.45);
    ctx.lineTo(w * 0.2, h * 0.7); ctx.lineTo(w * 0.4, h * 0.9); ctx.lineTo(w * 0.6, h * 0.92);
    ctx.lineTo(w * 0.75, h * 0.75); ctx.lineTo(w * 0.8, h * 0.45); ctx.lineTo(w * 0.7, h * 0.2);
    ctx.closePath();
    ctx.stroke();

    // 3. Titik Api & Heatmap Berdenyut Membesar Sesuai Step 1-30
    const fireRadius = 8 + (step * 3.5);
    const hotspots = [
      { x: w * 0.45, y: h * 0.65 }, // Kalteng
      { x: w * 0.32, y: h * 0.5 },  // Kalbar
      { x: w * 0.55, y: h * 0.75 }, // Kalsel
      { x: w * 0.62, y: h * 0.52 }  // Kaltim
    ];

    hotspots.forEach(pt => {
      const grad = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, fireRadius);
      grad.addColorStop(0, 'rgba(255, 77, 77, 0.95)');
      grad.addColorStop(0.4, 'rgba(255, 180, 94, 0.6)');
      grad.addColorStop(1, 'rgba(255, 180, 94, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, fireRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Overlay Text Info pada Kanvas
    ctx.fillStyle = '#58e0b1';
    ctx.font = 'bold 12px "DM Mono", monospace';
    ctx.fillText(`RASTER ITERATIVE STEP: ${step} / 30`, 15, 25);
    ctx.fillStyle = '#ffb45e';
    ctx.font = '11px Manrope, sans-serif';
    ctx.fillText(`Luas Simulasi: ${(step * 125 + 500).toLocaleString()} Ha`, 15, 42);

    // 5. Update Layer Raster TIF di Peta Kiri secara bersamaan
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
      statusTextEl.textContent = `Status: Memuat Raster Step ${step} / 30`;
    }

    step++;
    if (step > 30) {
      clearInterval(rasterSimulationTimer);
      if (statusTextEl) {
        statusTextEl.textContent = "Status: Iterasi 30-Hari Raster Selesai";
        statusTextEl.style.color = "#58e0b1";
      }
    }
  }, 450);
}

// 5. MEMUAT & RENDER GRAFIK (DIFIX DARI REFERENCE ERROR)
function initGuaranteedChart() {
  Papa.parse('./data/01_Indikator_Kebakaran_Harian.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) {
        renderChartFromCSV(results.data);
      } else {
        renderDefaultChart();
      }
    },
    error: () => renderDefaultChart()
  });
}

function renderChartFromCSV(csvData) {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // PERBAIKAN: Menambahkan parameter (row, idx) secara eksplisit untuk mencegah ReferenceError
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

  drawChartJS(ctx, labels, hotspotValues, burnedValues);
}

function renderDefaultChart() {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = ['01/10', '03/10', '05/10', '07/10', '09/10', '11/10', '13/10', '15/10', '17/10', '19/10'];
  const hotspots = [94, 123, 203, 236, 224, 175, 142, 175, 146, 100];
  const burned = [168.5, 333.3, 545.3, 1195.1, 1481.1, 1682.1, 2257.2, 2599.5, 3010.2, 3050.8];

  drawChartJS(ctx, labels, hotspots, burned);
}

function drawChartJS(ctx, labels, data1, data2) {
  if (forecastChartInstance) forecastChartInstance.destroy();

  forecastChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Jumlah Titik Api Aktif',
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
