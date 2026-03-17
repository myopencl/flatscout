#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = '/home/ubuntu/.openclaw/workspace-flatscout';
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, 'index.html');
const API_BASE = process.env.POZNAN_API_URL || 'http://localhost:3000';

const args = require('minimist')(process.argv.slice(2));

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function buildQuery() {
  const params = new URLSearchParams();
  params.set('status', args.status || 'active');
  params.set('hasCoords', args.hasCoords || 'true');
  params.set('limit', String(args.limit || 500));

  const passthrough = [
    'portal', 'city', 'minPrice', 'maxPrice', 'minArea', 'maxArea', 'rooms',
    'userStatus', 'searchId', 'minScore', 'sortBy', 'sortDir', 'page'
  ];

  passthrough.forEach((k) => {
    if (args[k] !== undefined && args[k] !== null && args[k] !== '') {
      params.set(k, String(args[k]));
    }
  });

  return params.toString();
}

function mapListing(l) {
  const lat = toNum(l.coordinates?.lat);
  const lon = toNum(l.coordinates?.lon);
  const hasCoords = lat !== null && lon !== null;
  const listingId = l.id || '';
  return {
    id: listingId,
    hasCoords,
    coords: hasCoords ? [lat, lon] : null,
    address: l.address || l.title || 'Poznań',
    title: l.title || 'Sin título',
    portal: (l.portal || 'unknown').toLowerCase(),
    price: toNum(l.price) ?? 0,
    size: toNum(l.size_m2) ?? 0,
    rooms: l.nr_rooms ?? 0,
    floor: l.floor ?? '-',
    monthly: toNum(l.monthly_expenses),
    score: toNum(l.score) ?? null,
    thumbnailUrl: l.thumbnail_url || null,
    status: l.user?.workflow_status || 'FOUND',
    alternateUrls: Array.isArray(l.alternate_urls) ? l.alternate_urls : [],
    comments: l.user?.comments || null,
    visitDate: l.user?.visit_date || null,
    url: l.url || '#',
    dateSeen: l.date_seen || null,
    rating: l.user?.rating ?? null,
    isFavorite: !!(l.user?.isFavorite || l.user?.is_favorite)
  };
}

(async () => {
  try {
    const query = buildQuery();
    const url = `${API_BASE}/api/v1/map/listings?${query}`;

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Map API Error ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    const rawListings = Array.isArray(payload) ? payload : (payload.data || payload.items || payload.results || []);
    const apartments = rawListings.map(mapListing);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>FlatScout Mapa</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin:0; padding:0; font-family:sans-serif; }
    #map { height: 100vh; width: 100%; }
    .controls { position: absolute; z-index: 2000; top: 15px; left: 15px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-height: 90vh; overflow-y: auto; }
    .filter-toggle { position: absolute; z-index: 2000; top: 15px; left: 15px; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; }
    .legend { position: absolute; bottom: 20px; right: 10px; background: white; padding: 10px; border-radius: 8px; font-size: 11px; z-index: 1000; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
    .popup-content { min-width: 220px; font-size: 14px; line-height: 1.4; }
    .price { font-size: 16px; font-weight: bold; color: #2563eb; }
    .popup-actions { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; }
    .btn-action { display: inline-block; padding: 7px 8px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 12px; text-align: center; flex: 1; min-width: 60px; color: #ffffff !important; }
    .btn-primary { background: #1d4ed8; }
    .btn-telegram { background: #006699; }
    .btn-fav { background: #b45309; }
    .btn-unfav { background: #374151; }
    .btn-discard { background: #991b1b; }
    .listing-counter { margin-top: 8px; font-size: 12px; font-weight: 600; color: #374151; }
    .controls label { font-size: 12px; font-weight: 600; margin-top: 6px; display: block; }
    .controls select, .controls input[type=number] { display: block; width: 100%; margin: 3px 0; padding: 6px; box-sizing: border-box; font-size: 13px; }
    #scoreFilter { width: 3.6em; }
    .status-multi { width: 100%; margin: 3px 0; padding: 4px; box-sizing: border-box; font-size: 12px; }
    .fav-row { display: flex; align-items: center; gap: 6px; margin: 6px 0; font-size: 13px; }
    .fav-row input[type=checkbox] { width: auto; margin: 0; cursor: pointer; }
    .star-marker { display: flex; align-items: center; justify-content: center; }
    @media (max-width: 768px) {
      .filter-toggle { display: block; }
      #filterMenu { display: none; top: 60px; left: 15px; width: 33vw; min-width: 150px; max-width: 220px; }
    }
    @media (min-width: 769px) { .filter-toggle { display: none; } #filterMenu { display: block !important; } }
  </style>
</head>
<body>
  <button class="filter-toggle" onclick="toggleFilters()">🔎</button>
  <div id="filterMenu" class="controls">
    <label>Hab:</label>
    <select id="roomFilter" onchange="filterMap()">
      <option value="all">Todas</option>
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4">4+</option>
    </select>
    <label>Estado (Ctrl+clic para varios):</label>
    <select id="statusFilter" class="status-multi" multiple size="5" onchange="filterMap()">
      <option value="FOUND">FOUND</option>
      <option value="SEEN">SEEN</option>
      <option value="VISIT_PENDING">VISIT_PENDING</option>
      <option value="VISITED">VISITED</option>
      <option value="FINALIST">FINALIST</option>
    </select>
    <label>Portal:</label>
    <select id="portalFilter" onchange="filterMap()"><option value="all">Todos</option></select>
    <label>Score min:</label>
    <input type="number" id="scoreFilter" inputmode="numeric" min="0" max="100" oninput="handleScoreInput()" value="0">
    <div class="fav-row">
      <input type="checkbox" id="favFilter" onchange="filterMap()">
      <label for="favFilter" style="margin:0;font-weight:normal;">⭐ Solo favoritos</label>
    </div>
    <div class="fav-row">
      <input type="checkbox" id="recentFilter" onchange="filterMap()">
      <label for="recentFilter" style="margin:0;font-weight:normal;">🆕 Últimas 24h</label>
    </div>
    <div id="listingCounter" class="listing-counter">0 de 0 anuncios</div>
  </div>
  <div id="map"></div>
  <div class="legend">
    <b>Precios:</b><br>
    <span style="color:#10b981">● &lt; 550k</span><br>
    <span style="color:#f59e0b">● 550–650k</span><br>
    <span style="color:#ef4444">● &gt; 650k</span><br>
    <span style="color:#8b5cf6">● 🎭 Teatr</span><br>
    ⭐ Favorito<br>
    <span style="display:inline-block;width:10px;height:10px;background:#6b7280;border:1px solid white;border-radius:1px;vertical-align:middle;"></span> Nuevo (&lt;24h)
  </div>
  <div style="position:absolute; bottom:20px; left:10px; background:white; padding:8px; border-radius:6px; font-size:11px; z-index:1000; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Actualizado: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</div>

  <script>
    const map = L.map('map').setView([52.409694, 16.917666], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.marker([52.409694, 16.917666], { icon: L.divIcon({ html: '🎭', className: 'x'}) }).addTo(map).bindPopup('Teatr Wielki');
    L.circle([52.409694, 16.917666], { color: '#8b5cf6', radius: 3000, dashArray: '5,5' }).addTo(map);

    const apartments = ${JSON.stringify(apartments)};
    let markers = [];

    function capitalizePortal(v) { const s = String(v || '').trim(); return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : 'Unknown'; }
    function toggleFilters() { if (window.matchMedia('(min-width: 769px)').matches) return; const m = document.getElementById('filterMenu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; }

    function populatePortalFilter() {
      const portalFilter = document.getElementById('portalFilter');
      const portals = Array.from(new Set(apartments.map(a => String(a.portal || '').toLowerCase()).filter(Boolean))).sort();
      portalFilter.innerHTML = '<option value="all">Todos</option>' + portals.map(p => '<option value="' + p + '">' + capitalizePortal(p) + '</option>').join('');
    }

    function handleScoreInput() {
      const el = document.getElementById('scoreFilter');
      const raw = String(el.value || '').replace(/\\D/g, '').slice(0, 3);
      el.value = raw === '' ? '' : String(parseInt(raw, 10));
      filterMap();
    }

    function fmtMonthly(v) { if (v === null || v === undefined || v === '') return 'N/D'; const n = Number(v); return Number.isFinite(n) ? n.toLocaleString() + ' PLN' : String(v); }
    function fmtPricePerM2(price, size) { if (!price || !size || size === 0) return 'N/D'; return Math.round(price / size).toLocaleString() + ' PLN/m²'; }
    function score100(v) { if (v === null || v === undefined || Number.isNaN(Number(v))) return null; const n = Number(v); return n <= 1 ? Math.round(n * 100) : Math.round(n); }
    function fmtDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }); }

    function priceColor(price) {
      return price < 550000 ? '#10b981' : (price < 650000 ? '#f59e0b' : '#ef4444');
    }

    function makeStarIcon(color) {
      return L.divIcon({
        html: '<svg viewBox="0 0 24 24" width="28" height="28"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="' + color + '" stroke="white" stroke-width="1.5"/></svg>',
        className: 'star-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });
    }

    function makeSquareIcon(color) {
      return L.divIcon({
        html: '<div style="width:16px;height:16px;background:' + color + ';border:2.5px solid white;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8]
      });
    }

    function filterMap() {
      markers.forEach(m => map.removeLayer(m));
      markers = [];

      const r = document.getElementById('roomFilter').value;
      const s = parseFloat(document.getElementById('scoreFilter').value) || 0;
      const stSelected = Array.from(document.getElementById('statusFilter').selectedOptions).map(o => o.value.toUpperCase());
      const p = document.getElementById('portalFilter').value;
      const favOnly = document.getElementById('favFilter').checked;
      const recentOnly = document.getElementById('recentFilter').checked;
      const oneDayAgo = Date.now() - 1 * 24 * 60 * 60 * 1000;

      const pNorm = String(p || 'all').toLowerCase();

      const filtered = apartments.filter(a => {
        const sc = score100(a.score);
        const scoreOk = s <= 0 ? true : (sc === null ? true : sc >= s);
        const aStatus = String(a.status || '').toUpperCase();
        if (aStatus === 'DISCARDED') return false;
        const statusOk = stSelected.length === 0 || stSelected.includes(aStatus);
        const favOk = !favOnly || a.isFavorite;
        const recentOk = !recentOnly || (a.dateSeen && new Date(a.dateSeen).getTime() >= oneDayAgo);
        return (r === 'all' || String(a.rooms) === r) &&
          scoreOk &&
          statusOk &&
          favOk &&
          recentOk &&
          (pNorm === 'all' || String(a.portal).toLowerCase() === pNorm);
      });

      filtered.forEach(apt => {
        if (!apt.hasCoords || !Array.isArray(apt.coords)) return;

        const color = priceColor(apt.price);
        const isNew = apt.dateSeen && new Date(apt.dateSeen).getTime() >= (Date.now() - 1 * 24 * 60 * 60 * 1000);
        const detailText = '/detalle ' + (apt.id || '');
        const botUrl = 'https://t.me/myflatscout_bot?text=' + encodeURIComponent(detailText);
        const favCmd = apt.isFavorite ? '/unfavorite ' + apt.id : '/favorite ' + apt.id;
        const favBotUrl = 'https://t.me/myflatscout_bot?text=' + encodeURIComponent(favCmd);
        const favBtnClass = apt.isFavorite ? 'btn-action btn-unfav' : 'btn-action btn-fav';
        const favBtnLabel = apt.isFavorite ? '★ Quitar Fav' : '☆ Añadir Fav';
        const discardCmd = '/discard ' + apt.id;
        const discardBotUrl = 'https://t.me/myflatscout_bot?text=' + encodeURIComponent(discardCmd);

        const visitLine = fmtDate(apt.visitDate) ? ('<br>📅 Visita: ' + fmtDate(apt.visitDate)) : '';
        const commentsLine = apt.comments ? ('<br>📝 ' + String(apt.comments)) : '';
        const altLinks = (apt.alternateUrls || []).length
          ? ('<br>🔗 ' + apt.alternateUrls.map(u => "<a href='" + u + "' target='_blank'>link</a>").join(' · '))
          : '';

        const popupContent = "<div class='popup-content'>" +
          (apt.thumbnailUrl ? "<img src='" + apt.thumbnailUrl + "' style='width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;' onerror=\\\"this.style.display='none'\\\">" : "") +
          "<b>" + apt.address + "</b>" +
          (isNew ? " <span style='background:#10b981;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;vertical-align:middle;'>NUEVO</span>" : "") +
          "<br><div class='price'>" + Number(apt.price || 0).toLocaleString() + " PLN</div>" +
          "📐 " + apt.size + " m² | 🛏️ " + apt.rooms + " hab | 🏢 P" + apt.floor +
          "<br>💰 Czynsz: " + fmtMonthly(apt.monthly) + " | 💶 " + fmtPricePerM2(apt.price, apt.size) +
          (apt.score !== null ? "<br>⭐ Score: <b>" + apt.score + "</b>/100" : "") +
          "<br>🏷️ " + (apt.status || 'N/D') +
          visitLine + commentsLine + altLinks +
          "<div class='popup-actions'>" +
            "<a href='" + apt.url + "' target='_blank' class='btn-action btn-primary'>Ver Anuncio</a>" +
            "<a href='" + botUrl + "' target='_blank' class='btn-action btn-telegram'>Comentar</a>" +
            "<a href='" + favBotUrl + "' target='_blank' class='" + favBtnClass + "'>" + favBtnLabel + "</a>" +
            "<a href='" + discardBotUrl + "' target='_blank' class='btn-action btn-discard'>🗑 Discard</a>" +
          "</div>" +
        "</div>";

        let marker;
        if (apt.isFavorite) {
          marker = L.marker(apt.coords, { icon: makeStarIcon(color) }).addTo(map);
        } else if (isNew) {
          marker = L.marker(apt.coords, { icon: makeSquareIcon(color) }).addTo(map);
        } else {
          marker = L.circleMarker(apt.coords, { radius: 12, fillColor: color, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map);
        }
        marker.bindPopup(popupContent);
        markers.push(marker);
      });

      const c = document.getElementById('listingCounter');
      if (c) c.textContent = markers.length + ' de ' + apartments.length + ' anuncios';
    }

    populatePortalFilter();
    filterMap();
  </script>
</body>
</html>`;

    fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
    console.log('✅ index.html generado desde /api/v1/map/listings');
  } catch (err) {
    console.error('❌ Error generando mapa desde Map API:', err.message);
    process.exit(1);
  }
})();
