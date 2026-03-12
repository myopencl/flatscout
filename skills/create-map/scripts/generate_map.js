#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = require('minimist')(process.argv.slice(2));

const WORKSPACE_ROOT = '/home/ubuntu/.openclaw/workspace-flatscout';
const filename = args.name ? `map_${args.name}.html` : 'index.html';
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, filename);

console.log(`📥 Generando mapa dinámico: ${filename} | Filtros: ${JSON.stringify(args)}`);

let db;
try {
  const TEMP_DATA = path.join(WORKSPACE_ROOT, 'listings_temp.json');
  db = JSON.parse(fs.readFileSync(TEMP_DATA, 'utf8'));
} catch (error) { process.exit(1); }

// Filtrado LÓGICO REAL
let apartments = (Array.isArray(db) ? db : db.listings || []).filter(apt => apt.status !== 'rejected');

if (args.rooms) {
    apartments = apartments.filter(apt => {
        const r = apt.roomsNumber === "THREE" ? 3 : (apt.roomsNumber || apt.rooms || 'N/A');
        return parseInt(r) === parseInt(args.rooms);
    });
}
if (args.status) {
    apartments = apartments.filter(apt => (apt.userState?.status || apt.status) === args.status);
}

// Construir descripción de filtros activa
const activeFilters = [];
if (args.rooms) activeFilters.push('Habitaciones: ' + args.rooms);
if (args.status) activeFilters.push('Estado: ' + args.status);
const filterText = activeFilters.length > 0 ? activeFilters.join(' | ') : 'Todos';

const apartmentsJS = apartments.map(apt => {
  const coordsData = apt.rawDetailsJson?.location?.coordinates || apt.location?.coordinates || {};
  return {
    coords: [coordsData.latitude || 52.409694, coordsData.longitude || 16.917666],
    address: apt.addressText || apt.title || 'Poznań',
    price: apt.price || apt.totalPrice?.value || 0,
    size: apt.areaM2 || apt.areaInSquareMeters || 0,
    rooms: apt.roomsNumber === "THREE" ? 3 : (apt.roomsNumber || apt.rooms || 'N/A'),
    floor: apt.floorNumber === "FOURTH" ? 4 : (apt.floorNumber || apt.floor || '-'),
    monthly: apt.rentPrice?.value || apt.property?.rent?.value || 'N/A',
    url: apt.url || apt.canonicalUrl || '#'
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
        .update-time { position: absolute; bottom: 10px; left: 10px; background: white; padding: 8px; border-radius: 6px; font-size: 11px; z-index: 1000; }
    </style>
</head>
<body>
    <div id="map"></div>
    <div class="filter-banner">🔎 Filtro: ${filterText}</div>
    <div class="legend">
        <h4>🏠 Apartamentos (${apartments.length})</h4>
        <div class="legend-item"><div class="legend-color" style="background:#ef4444;"></div><span>> 600k PLN</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#f59e0b;"></div><span>500-600k PLN</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#10b981;"></div><span>< 500k PLN</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#8b5cf6;"></div><span>🎭 Teatr Wielki</span></div>
    </div>
    <div class="update-time">Actualizado: ${new Date().toLocaleString('es-ES')}</div>
    <script>
        const map = L.map('map').setView([52.409694, 16.917666], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker([52.409694, 16.917666], { icon: L.divIcon({ html: '🎭', className: 'custom-icon'}) }).addTo(map).bindPopup('Teatr Wielki');
        L.circle([52.409694, 16.917666], { color: '#8b5cf6', radius: 3000, dashArray: '5,5' }).addTo(map);
        const apartments = ${JSON.stringify(apartmentsJS)};
        apartments.forEach(apt => {
            const color = apt.price < 500000 ? '#10b981' : (apt.price < 600000 ? '#f59e0b' : '#ef4444');
            L.circleMarker(apt.coords, { radius: 12, fillColor: color, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map)
                .bindPopup("<b>" + apt.address + "</b><br>Precio: " + apt.price.toLocaleString() + " PLN<br>Hab: " + apt.rooms + " | Piso: " + apt.floor + "<br>Gastos: " + apt.monthly + " PLN/mes<br><a href='"+apt.url+"' target='_blank'>Ver anuncio</a>");
        });
    </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
console.log('✅ ' + filename + ' generado con los filtros aplicados.');
