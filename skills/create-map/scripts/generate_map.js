#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = require('minimist')(process.argv.slice(2));

const WORKSPACE_ROOT = '/home/ubuntu/.openclaw/workspace-flatscout';
const filename = args.name ? `map_${args.name}.html` : 'index.html';
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, filename);

console.log(`📥 Generando mapa: ${filename} | Top: ${args.top || 'Todos'}`);

let db;
try {
  const TEMP_DATA = path.join(WORKSPACE_ROOT, 'listings_temp.json');
  db = JSON.parse(fs.readFileSync(TEMP_DATA, 'utf8'));
} catch (error) { process.exit(1); }

// Filtrado de seguridad y lógico
let apartments = (Array.isArray(db) ? db : db.listings || []).filter(apt => apt.status !== 'rejected');

// 1. Filtrar por habitaciones si existe
if (args.rooms) {
    apartments = apartments.filter(apt => {
        const r = apt.roomsNumber === "THREE" ? 3 : (apt.roomsNumber || apt.rooms || 'N/A');
        return parseInt(r) === parseInt(args.rooms);
    });
}

// 2. Ordenar por score (si existe) y aplicar Top limit
apartments.sort((a, b) => (b.score || 0) - (a.score || 0));
if (args.top) {
    apartments = apartments.slice(0, parseInt(args.top));
}

const filterText = (args.rooms ? 'Hab: ' + args.rooms + ' | ' : '') + 
                   (args.top ? 'Top: ' + args.top : 'Todos');

const apartmentsJS = apartments.map(apt => {
  const coordsData = apt.rawDetailsJson?.location?.coordinates || apt.location?.coordinates || {};
  return {
    coords: [coordsData.latitude || 52.409694, coordsData.longitude || 16.917666],
    address: apt.addressText || apt.title || 'Poznań',
    price: apt.price || apt.totalPrice?.value || 0,
    size: apt.areaM2 || apt.areaInSquareMeters || 0,
    rooms: apt.roomsNumber || apt.rooms || 'N/A',
    floor: apt.floorNumber || apt.floor || '-',
    monthly: apt.rentPrice?.value || apt.property?.rent?.value || 'N/A',
    url: apt.url || apt.canonicalUrl || '#',
    score: apt.score || 0
  };
});

const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlatScout - ${filename}</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { margin:0; padding:0; font-family:sans-serif; } #map { height: 100vh; width: 100%; }
        .legend { position: absolute; top: 10px; right: 10px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 1000; }
        .legend-item { display: flex; align-items: center; margin: 5px 0; font-size: 12px; }
        .legend-color { width: 20px; height: 20px; border-radius: 50%; margin-right: 8px; border: 2px solid #333; }
        .filter-banner { position: absolute; top: 10px; left: 10px; background: #2563eb; color: white; padding: 10px 15px; border-radius: 6px; z-index: 1000; font-weight: bold; }
        .popup-content { min-width: 200px; }
    </style>
</head>
<body>
    <div id="map"></div>
    <div class="filter-banner">🔎 ${filterText}</div>
    <div class="legend"><h4>🏠 Apartamentos (${apartments.length})</h4></div>
    <script>
        const map = L.map('map').setView([52.409694, 16.917666], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        const apartments = ${JSON.stringify(apartmentsJS)};
        apartments.forEach(apt => {
            L.circleMarker(apt.coords, { radius: 10, fillColor: '#2563eb', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map)
                .bindPopup("<b>"+apt.address+"</b><br>Score: "+apt.score+"<br><a href='"+apt.url+"'>Ver anuncio</a>");
        });
    </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
console.log('✅ Generado.');
