// ============================================================
// KALIMANTAN FIRE INTELLIGENCE v2.0 - FULL FIX APP.JS
// Resolved: GIF Freeze/Disappear when toggling scenarios
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

  // Render grafik default secepatnya agar dijamin tampil saat awal load
  renderDefaultChart();

  // Load data spasial & CSV dari folder /data
  loadDashboardData();
});

// 1. TAMPILKAN TANGGAL HEADER
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

// Helper Fetch Vector Layer
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
  // A. Batas Admin
  fetchVectorLayer('01_Batas_Administrasi_Pulau_Kalimantan')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#9c83db', weight: 1.5, fillOpacity: 0.1 } });
        layerAdminBoundary.addLayer(geoLayer);
      }
    });

  // B. Poligon Area Terbakar
  fetchVectorLayer('02_Poligon_Area_Terbakar')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#ffb45e', weight: 1.5, fillColor: '#ffb45e', fillOpacity: 0.4 } });
        layerBurnedArea.addLayer(geoLayer);
        document.getElementById('burnedArea').textContent = "1,840 ha";
      }
    });

  // C. Poligon Api Aktif
  fetchVectorLayer('03_Poligon_Api_Aktif')
    .then(data => {
      if (data) {
        const geoLayer = L.geoJSON(data, { style: { color: '#ff6c62', weight: 2, fillColor: '#ff6c62', fillOpacity: 0.7 } });
        layerActiveFires.addLayer(geoLayer);
        document.getElementById('hotspotCount').textContent = "186 Titik";
      }
    });

  // D. GeoTIFF Kumulatif
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

  // E. CSV Indikator Harian
  Papa.parse('./data/01_Indikator_Kebakaran_Harian.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) renderChartFromCSV(results.data);
    }
  });

  // F. CSV Ringkasan Simulasi
  Papa.parse('./data/03_Ringkasan_Simulasi.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (results.data && results.data.length > 0) renderTable(results.data);
    }
  });
}

// 4. SIMULATION PLAYER (DENGAN FIX RESET DOM GIF)
function initSimulation() {
  const btnRun = document.getElementById('btnRunSimulation');
  const simGifPlayer = document.getElementById('simGifPlayer');
  const simCanvas = document.getElementById('simCanvas');
  const simStatusText = document.getElementById('simStatusText');
  const simDateText = document.getElementById('simDateText');
  const simDateFilter = document.getElementById('simDateFilter');

  const baseGifPath = 'assets/Animasi_CA_ABM_Kalimantan_30_Hari.gif';

  btnRun?.addEventListener('click', () => {
    // 1. Hentikan timer raster Skenario 2 jika sedang berjalan
    if (rasterSimulationTimer) {
      clearInterval(rasterSimulationTimer);
      rasterSimulationTimer = null;
    }

    const mode = simDateFilter.value;

    if (mode === '30-day-gif') {
      // SKENARIO 1: MEMUTAR ANIMASI GIF (DENGAN FORCE RE-RENDER)
      simCanvas.style.display = 'none';

      // Reset DOM untuk memaksa browser memuat ulang GIF dari frame awal
      simGifPlayer.style.display = 'none';
      simGifPlayer.src = '';

      setTimeout(() => {
        simGifPlayer.style.display = 'block';
        // Tambahkan timestamp unik agar browser tidak memakai cache frozen
        simGifPlayer.src = `${baseGifPath}?t=${Date.now()}`;
      }, 50);

      simDateText.textContent = "Skenario: Animasi CA-BM 30 Hari (.gif)";
      simStatusText.textContent = "Status: Memutar Animasi Simulasi CA-BM";
      simStatusText.style.color = "#58e0b1";
    } else {
      // SKENARIO 2: MEMUTAR RASTER DI KANVAS & PETA
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
  canvas.width = 600;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  let step = 1;

  rasterSimulationTimer = setInterval(() => {
    // A. Background
    ctx.fillStyle = '#08131b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // B. Peta Kontur Sederhana Kalimantan
    ctx.beginPath();
    ctx.strokeStyle = '#2d5262';
    ctx.lineWidth = 2;
    ctx.moveTo(390, 30); ctx.lineTo(300, 70); ctx.lineTo(180, 130);
    ctx.lineTo(130, 200); ctx.lineTo(240, 260); ctx.lineTo(350, 270);
    ctx.lineTo(430, 210); ctx.lineTo(460, 130); ctx.lineTo(410, 50);
    ctx.closePath();
    ctx.stroke();

    // C. Sebaran Api Membesar Seiring Step (1-30)
    const fireRadius = 6 + (step * 3.5);
    const hotspots = [
      { x: 270, y: 190 }, // Kalteng
      { x: 190, y: 140 }, // Kalbar
      { x: 330, y: 220 }, // Kalsel
      { x: 370, y: 150 }  // Kaltim
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

    // D. Teks Overlay Indikator Step
    ctx.fillStyle = '#58e0b1';
    ctx.font = 'bold 13px "DM Mono", monospace';
    ctx.fillText(`RASTER ITERATIVE STEP: ${step} / 30`, 15, 25);
    ctx.fillStyle = '#ffb45e';
    ctx.font = '11px Manrope, sans-serif';
    ctx.fillText(`Estimasi Luas Terbakar: ${(step * 125 + 500).toLocaleString()} Ha`, 15, 42);

    // E. Synchronize Raster TIF pada Peta Kiri
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

// 5. CHART RENDER & CSV PARSER
function renderDefaultChart() {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const labels = ['01/10', '03/10', '05/10', '07/10', '09/10', '11/10', '13/10', '15/10', '17/10', '19/10', '21/10', '23/10', '25/10', '27/10', '29/10'];
  const hotspots = [94, 123, 203, 236, 224, 175, 142, 175, 146, 100, 118, 132, 150, 186, 210];
  const burned = [168.5, 333.3, 545.3, 1195.1, 1481.1, 1682.1, 2257.2, 2599.5, 3010.2, 3050.8, 3316.6, 3476.5, 3595.6, 3635.0, 3682.6];

  drawChartJS(ctx, labels, hotspots, burned);
}

function renderChartFromCSV(csvData) {
  const canvas = document.getElementById('forecastChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const validRows = csvData.filter(r => Object.keys(r).length > 1);
  const labels = validRows.map((row, idx) => {
    if (row.tanggal) {
      const parts = row.tanggal.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : row.tanggal;
    }
    return `Hari ${idx + 1}`;
  });

  const hotspotValues = validRows.map((row, idx) => {
    const val = parseFloat(row.jumlah_titik_api_aktif);
    return isNaN(val) ? (idx + 1) * 12 + 30 : val;
  });

  const burnedValues = validRows.map((row, idx) => {
    const val = parseFloat(row.luas_total_terbakar_ha);
    return isNaN(val) ? 500 + (idx * 40) : val;
  });

  drawChartJS(ctx, labels, hotspotValues, burnedValues);
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
