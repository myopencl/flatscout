#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = '/home/ubuntu/.openclaw/workspace-flatscout';
const TEMP_DATA = path.join(WORKSPACE_ROOT, 'listings_temp.json');
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, 'index.html');

let db;
try { db = JSON.parse(fs.readFileSync(TEMP_DATA, 'utf8')); } catch (e) { process.exit(1); }

const apartments = (Array.isArray(db) ? db : db.listings || []).filter(apt => apt.status !== 'rejected');

const toNum = (v) => {
  if (v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

const pickCoords = (apt) => {
  const c = apt.rawDetailsJson?.location?.coordinates || apt.location?.coordinates || {};
  let lat = NaN;
  let lon = NaN;

  if (Array.isArray(c) && c.length >= 2) {
    const a = toNum(c[0]);
    const b = toNum(c[1]);

    // Detectar orden para Poznań:
    // lat ~ 52.x , lon ~ 16.x
    const looksLatLon = a > 45 && a < 60 && b > 10 && b < 25;
    const looksLonLat = a > 10 && a < 25 && b > 45 && b < 60;

    if (looksLatLon) {
      lat = a;
      lon = b;
    } else {
      // default GeoJSON [lon,lat]
      lon = a;
      lat = b;
    }
  } else {
    lat = toNum(
      c.latitude ?? c.lat ?? c.y ??
      apt.rawDetailsJson?.location?.latitude ?? apt.rawDetailsJson?.location?.lat ??
      apt.location?.latitude ?? apt.location?.lat ??
      apt.latitude ?? apt.lat
    );
    lon = toNum(
      c.longitude ?? c.lng ?? c.lon ?? c.x ??
      apt.rawDetailsJson?.location?.longitude ?? apt.rawDetailsJson?.location?.lng ?? apt.rawDetailsJson?.location?.lon ??
      apt.location?.longitude ?? apt.location?.lng ?? apt.location?.lon ??
      apt.longitude ?? apt.lng ?? apt.lon
    );
  }

  if (!Number.isFinite(lat)) lat = 52.409694;
  if (!Number.isFinite(lon)) lon = 16.917666;

  return [lat, lon];
};

const pickPrice = (apt) => {
  return (
    toNum(apt.price) ||
    toNum(apt.totalPrice?.value) ||
    toNum(apt.totalPrice?.amount) ||
    toNum(apt.rawDetailsJson?.price?.value) ||
    toNum(apt.rawDetailsJson?.price?.amount) ||
    toNum(apt.rawDetailsJson?.price) ||
    0
  );
};

const apartmentsJS = apartments.map((apt) => {
  return {
    id: apt.id || apt.listingId || apt.externalId || apt.rawDetailsJson?.id || '',
    coords: pickCoords(apt),
    address: apt.addressText || apt.title || 'Poznań',
    price: pickPrice(apt),
    size: apt.areaM2 || apt.areaInSquareMeters || 0,
    rooms: apt.roomsNumber === 'THREE' ? 3 : (apt.roomsNumber || apt.rooms || 0),
    floor: apt.floorNumber === 'FOURTH' ? 4 : (apt.floorNumber || apt.floor || '-'),
    monthly: (() => {
      const fromArray = (arr) => (Array.isArray(arr)
        ? arr.find(x => /czynsz|gastos|rent|opłaty/i.test(String(x?.name || x?.key || x?.label || '')))?.value
        : undefined);
      return (
        apt.czynsz ??
        apt.rawDetailsJson?.czynsz ??
        apt.rawDetailsJson?.price?.czynsz ??
        apt.rawDetailsJson?.price?.monthlyRent ??
        apt.rawDetailsJson?.finance?.czynsz ??
        apt.rawDetailsJson?.fees?.czynsz ??
        fromArray(apt.rawDetailsJson?.params) ??
        fromArray(apt.rawDetailsJson?.parameters) ??
        fromArray(apt.rawDetailsJson?.attributes) ??
        apt.monthlyFees ??
        apt.administrativeRent?.value ??
        apt.rentPrice?.value ??
        apt.property?.rent?.value ??
        apt.rawDetailsJson?.price?.rent ??
        apt.rawDetailsJson?.fees?.monthly ??
        apt.charges?.monthly ??
        null
      );
    })(),
    status: apt.userState?.status || apt.status || 'FOUND',
    portal: apt.source || apt.portal || apt.rawDetailsJson?.source || 'unknown',
    visitDate: apt.visitDate || apt.visitedAt || apt.userState?.visitedAt || apt.scheduledVisitDate || apt.visitScheduledAt || null,
    comments: apt.comments || apt.notes || apt.userState?.comment || apt.userState?.notes || null,
    score: apt.score || 0,
    url: apt.url || apt.canonicalUrl || apt.listingUrl || apt.sourceUrl || '#'
  };
});

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

        .controls {
            position: absolute;
            z-index: 2000;
            top: 15px;
            left: 15px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .filter-toggle {
            position: absolute;
            z-index: 2000;
            top: 15px;
            left: 15px;
            padding: 10px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 8px;
        }

        .legend {
            position: absolute;
            bottom: 20px;
            right: 10px;
            background: white;
            padding: 10px;
            border-radius: 8px;
            font-size: 11px;
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .popup-content { min-width: 200px; font-size: 14px; line-height: 1.4; }
        .price { font-size: 16px; font-weight: bold; color: #2563eb; }
        .btn-bot { display:block; margin-top:8px; padding:8px; background:#0088cc; color:white; text-align:center; border-radius:4px; text-decoration:none; font-weight:bold; font-size:12px; }
        .listing-counter { margin-top: 8px; font-size: 12px; font-weight: 600; color: #374151; }

        button, select, input { display: block; width: 100%; margin: 5px 0; padding: 8px; box-sizing: border-box; }
        #scoreFilter { width: 3.6em; }

        @media (max-width: 768px) {
            .filter-toggle { display: block; }
            #filterMenu { display: none; top: 60px; left: 15px; }
        }

        @media (min-width: 769px) {
            .filter-toggle { display: none; }
            #filterMenu { display: block !important; }
        }
    </style>
</head>
<body>
    <button class="filter-toggle" onclick="toggleFilters()">🔎</button>
    <div id="filterMenu" class="controls">
        <label>Hab:</label><select id="roomFilter" onchange="filterMap()"><option value="all">Todas</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4+</option></select>
        <label>Estado:</label><select id="statusFilter" onchange="filterMap()"><option value="all">Todos</option><option value="FOUND">FOUND</option><option value="SEEN">SEEN</option><option value="VISIT_PENDING">VISIT_PENDING</option><option value="VISITED">VISITED</option><option value="FINALIST">FINALIST</option></select>
        <label>Portal:</label><select id="portalFilter" onchange="filterMap()"><option value="all">Todos</option></select>
        <label>Score min:</label><input type="number" id="scoreFilter" inputmode="numeric" min="0" max="999" oninput="handleScoreInput()" value="0">
        <div id="listingCounter" class="listing-counter">0 de 0 anuncios</div>
    </div>
    <div id="map"></div>
    <div class="legend">
        <b>Precios:</b><br><span style="color:#10b981">● < 500k</span><br><span style="color:#f59e0b">● 500-600k</span><br><span style="color:#ef4444">● > 600k</span><br><span style="color:#8b5cf6">● 🎭 Teatr</span>
    </div>
    <div style="position:absolute; bottom:20px; left:10px; background:white; padding:8px; border-radius:6px; font-size:11px; z-index:1000; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        Actualizado: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
    </div>
    <script>
        const map = L.map('map').setView([52.409694, 16.917666], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker([52.409694, 16.917666], { icon: L.divIcon({ html: '🎭', className: 'x'}) }).addTo(map).bindPopup('Teatr Wielki');
        L.circle([52.409694, 16.917666], { color: '#8b5cf6', radius: 3000, dashArray: '5,5' }).addTo(map);

        let markers = [];
        const apartments = ${JSON.stringify(apartmentsJS)};

        function capitalizePortal(v) {
            const s = String(v || '').trim();
            return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : 'Unknown';
        }

        function populatePortalFilter() {
            const portalFilter = document.getElementById('portalFilter');
            if (!portalFilter) return;
            const current = portalFilter.value || 'all';
            const portals = Array.from(new Set(apartments.map(a => String(a.portal || '').toLowerCase()).filter(Boolean))).sort();
            portalFilter.innerHTML = '<option value="all">Todos</option>' + portals.map(p => '<option value="' + p + '">' + capitalizePortal(p) + '</option>').join('');
            if (portals.includes(current)) portalFilter.value = current;
        }

        function toggleFilters() {
            if (window.matchMedia('(min-width: 769px)').matches) return;
            const menu = document.getElementById('filterMenu');
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }

        function handleScoreInput() {
            const el = document.getElementById('scoreFilter');
            const raw = String(el.value || '').replace(/\D/g, '').slice(0, 3);
            el.value = raw === '' ? '' : String(parseInt(raw, 10));
            filterMap();
        }

        function fmtMonthly(value) {
            if (value === null || value === undefined || value === '') return 'N/D';
            const n = Number(value);
            if (!Number.isNaN(n)) return n.toLocaleString() + ' PLN';
            return String(value);
        }

        function fmtDate(value) {
            if (!value) return null;
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return String(value);
            return d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
        }

        function filterMap() {
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            const r = document.getElementById('roomFilter').value;
            const s = parseFloat(document.getElementById('scoreFilter').value) || 0;
            const st = document.getElementById('statusFilter').value;
            const p = document.getElementById('portalFilter').value;

            const filtered = apartments.filter(a => (r === 'all' || a.rooms == r) && (a.score >= s) && (st === 'all' || a.status === st) && (p === 'all' || String(a.portal).toLowerCase() === p));
            filtered.forEach(apt => {
                try {
                    const color = apt.price < 500000 ? '#10b981' : (apt.price < 600000 ? '#f59e0b' : '#ef4444');
                    const detailText = '/detalle ' + (apt.id || '');
                    const botUrl = 'https://t.me/myflatscout_bot?text=' + encodeURIComponent(detailText);
                    const visitLine = fmtDate(apt.visitDate) ? ("<br>📅 Visita: " + fmtDate(apt.visitDate)) : "";
                    const commentsLine = apt.comments ? ("<br>📝 Comentarios: " + String(apt.comments)) : "";
                    const m = L.circleMarker(apt.coords, { radius: 12, fillColor: color, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map)
                        .bindPopup("<div class='popup-content'><b>"+apt.address+"</b><br><div class='price'>"+Number(apt.price || 0).toLocaleString()+" PLN</div>📐 "+apt.size+" m² | 🛏️ Rooms: "+apt.rooms+" | 🏢 Floor: "+apt.floor+"<br>💰 Gastos: "+fmtMonthly(apt.monthly)+"<br>⭐ Score: "+Number(apt.score || 0)+"/100<br>🏷️ Estado: "+(apt.status || 'N/D')+visitLine+commentsLine+"<br><a href='"+apt.url+"' target='_blank'>Ver anuncio</a><a class='btn-bot' href='"+botUrl+"' target='_blank'>🤖 Comentar con @myflatscout_bot</a></div>");
                    markers.push(m);
                } catch (e) {
                    console.warn('Listing omitido:', apt && apt.id, apt && apt.coords, e && e.message);
                }
            });
            const counterEl = document.getElementById('listingCounter');
            if (counterEl) counterEl.textContent = filtered.length + ' de ' + apartments.length + ' anuncios';
            // Contador principal (filtrados sobre total)
        }

        populatePortalFilter();
        filterMap();
    </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
console.log('✅ index.html generado.');
