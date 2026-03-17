#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = '/home/ubuntu/.openclaw/workspace-flatscout';
const TEMP_DATA = path.join(WORKSPACE_ROOT, 'listings_temp.json');
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, 'index.html'); // Siempre index.html

let db;
try { db = JSON.parse(fs.readFileSync(TEMP_DATA, 'utf8')); } catch (e) { process.exit(1); }

const apartments = (Array.isArray(db) ? db : db.listings || []).filter(apt => apt.status !== 'rejected');

const apartmentsJS = apartments.map(apt => {
  const coordsData = apt.rawDetailsJson?.location?.coordinates || apt.location?.coordinates || {};
  return {
    coords: [coordsData.latitude || 52.409694, coordsData.longitude || 16.917666],
    address: apt.addressText || apt.title || 'Poznań',
    price: apt.price || apt.totalPrice?.value || 0,
    size: apt.areaM2 || apt.areaInSquareMeters || 0,
    rooms: apt.roomsNumber === "THREE" ? 3 : (apt.roomsNumber || apt.rooms || 0),
    floor: apt.floorNumber === "FOURTH" ? 4 : (apt.floorNumber || apt.floor || '-'),
    monthly: apt.rentPrice?.value || apt.property?.rent?.value || '0',
    status: apt.userState?.status || apt.status || 'FOUND',
    score: apt.score || 0,
    url: apt.url || apt.canonicalUrl || '#'
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
        body { margin:0; padding:0; font-family:sans-serif; } #map { height: 100vh; width: 100%; }
        .controls { position: absolute; z-index: 2000; top: 15px; left: 60px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        .legend { position: absolute; bottom: 20px; right: 10px; background: white; padding: 10px; border-radius: 8px; font-size: 11px; z-index: 1000; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .popup-content { min-width: 200px; font-size: 14px; line-height: 1.4; }
        .price { font-size: 16px; font-weight: bold; color: #2563eb; }
        button, select, input { display: block; width: 100%; margin: 5px 0; padding: 8px; }
    </style>
</head>
<body>
    <button style="position:absolute; z-index:2000; top:15px; left:15px; padding:10px; background:#2563eb; color:white; border:none; border-radius:8px;" onclick="document.getElementById('filterMenu').style.display = (document.getElementById('filterMenu').style.display === 'block' ? 'none' : 'block')">🔎</button>
    <div id="filterMenu" class="controls">
        <label>Hab:</label><select id="roomFilter" onchange="filterMap()"><option value="all">Todas</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4+</option></select>
        <label>Estado:</label><select id="statusFilter" onchange="filterMap()"><option value="all">Todos</option><option value="FOUND">FOUND</option><option value="SEEN">SEEN</option><option value="VISITED">VISITED</option><option value="FINALIST">FINALIST</option></select>
        <label>Score min:</label><input type="number" id="scoreFilter" oninput="filterMap()" value="0" maxlength="3">
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
        
        function filterMap() {
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            const r = document.getElementById('roomFilter').value;
            const s = parseFloat(document.getElementById('scoreFilter').value) || 0;
            const st = document.getElementById('statusFilter').value;
            
            apartments.filter(a => (r === 'all' || a.rooms == r) && (a.score >= s) && (st === 'all' || a.status === st)).forEach(apt => {
                const color = apt.price < 500000 ? '#10b981' : (apt.price < 600000 ? '#f59e0b' : '#ef4444');
                const m = L.circleMarker(apt.coords, { radius: 12, fillColor: color, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map)
                    .bindPopup("<div class='popup-content'><b>"+apt.address+"</b><br><div class='price'>"+apt.price.toLocaleString()+" PLN</div>📐 "+apt.size+" m² | 🛏️ Rooms: "+apt.rooms+" | 🏢 Floor: "+apt.floor+"<br>💰 Gastos: "+apt.monthly+" PLN<br><a href='"+apt.url+"' target='_blank'>Ver anuncio</a></div>");
                markers.push(m);
            });
        }
        filterMap();
    </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
console.log('✅ index.html generado.');
