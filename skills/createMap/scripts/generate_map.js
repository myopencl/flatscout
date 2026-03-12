#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = '/home/ubuntu/.openclaw/workspace-flatscout';
const TEMP_DATA = path.join(WORKSPACE_ROOT, 'listings_temp.json');
const OUTPUT_PATH = path.join(WORKSPACE_ROOT, 'apartments_map.html');

let db;
try {
  db = JSON.parse(fs.readFileSync(TEMP_DATA, 'utf8'));
} catch (error) { process.exit(1); }

const apartments = (Array.isArray(db) ? db : db.listings || []).filter(apt => apt.status !== 'rejected');

const apartmentsJS = apartments.map(apt => {
  const coordsData = apt.rawDetailsJson?.location?.coordinates || apt.location?.coordinates || {};
  const lat = coordsData.latitude || 52.4065;
  const lng = coordsData.longitude || 16.9260;
  
  const price = apt.price || apt.totalPrice?.value || 0;
  const area = apt.areaM2 || apt.areaInSquareMeters || 0;
  
  return {
    coords: [lat, lng],
    address: apt.addressText || apt.title || 'Poznań',
    price: price,
    size: area,
    pricePerM2: (price > 0 && area > 0) ? (price / area).toFixed(0) : 'N/A',
    floor: apt.floorNumber || apt.property?.properties?.floor || '-',
    rooms: apt.roomsNumber || apt.property?.properties?.numberOfRooms || 'N/A',
    monthly: apt.rentPrice?.value || apt.property?.rent?.value || 'N/A',
    url: apt.url || apt.canonicalUrl || '#'
  };
});

const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>FlatScout - Mapa</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        body { margin:0; padding:0; font-family:sans-serif; } #map { height: 100vh; width: 100%; }
        .legend { position: absolute; top: 10px; right: 10px; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 1000; }
        .legend-item { display: flex; align-items: center; margin: 5px 0; font-size: 12px; }
        .legend-color { width: 20px; height: 20px; border-radius: 50%; margin-right: 8px; border: 2px solid #333; }
        .popup-content { min-width: 200px; line-height: 1.4; }
        .price { font-size: 18px; font-weight: bold; color: #2563eb; }
    </style>
</head>
<body>
    <div id="map"></div>
    <div class="legend">
        <h4>🏠 Apartamentos (${apartments.length})</h4>
        <div class="legend-item"><div class="legend-color" style="background:#ef4444;"></div><span>> 600k PLN</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#f59e0b;"></div><span>500-600k PLN</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#10b981;"></div><span>< 500k PLN</span></div>
        <div class="legend-item"><div class="legend-color" style="background:#8b5cf6;"></div><span>🎭 Teatr Wielki</span></div>
    </div>
    <script>
        const map = L.map('map').setView([52.4065, 16.9260], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        
        L.marker([52.4065, 16.9260], { icon: L.divIcon({ html: '🎭', className: 'custom-icon'}) }).addTo(map).bindPopup('Teatr Wielki');
        L.circle([52.4065, 16.9260], { color: '#8b5cf6', radius: 3000, dashArray: '5,5' }).addTo(map);

        const apartments = ${JSON.stringify(apartmentsJS)};
        apartments.forEach(apt => {
            const color = apt.price < 500000 ? '#10b981' : (apt.price < 600000 ? '#f59e0b' : '#ef4444');
            L.circleMarker(apt.coords, { radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map)
                .bindPopup(\`
                    <div class='popup-content'>
                        <h3>\${apt.address}</h3>
                        <div class='price'>\${apt.price.toLocaleString()} PLN</div>
                        📐 \${apt.size} m² | 🛏️ Rooms: \${apt.rooms} | 🏢 Floor: \${apt.floor}<br>
                        💰 Gastos: \${apt.monthly} PLN/mes<br>
                        <a href='\${apt.url}' target='_blank'>Ver anuncio</a>
                    </div>\`);
        });
    </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, html, 'utf8');
console.log('✅ Mapa restaurado a versión estable.');
