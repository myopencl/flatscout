#!/usr/bin/env node
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function scanListings() {
  try {
    // Get listings updated since 24 hours ago
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = `${BASE_URL}/listings?updatedSince=${since}&status=active&limit=100`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const listings = await response.json();
    
    if (!Array.isArray(listings) || listings.length === 0) {
      console.log('HEARTBEAT_OK');
      return;
    }

    // Apply filters from SEARCH_PROFILE.md
    const filtered = listings.filter(listing => {
      // Price: max 700,000 PLN
      if (listing.price && listing.price > 700000) return false;
      
      // Size: min 45 m²
      if (listing.area && listing.area < 45) return false;
      
      // Must have a valid URL
      if (!listing.url || !listing.url.startsWith('http')) return false;
      
      return true;
    });

    // Deduplicate by listing_id
    const seen = new Set();
    const unique = filtered.filter(listing => {
      if (seen.has(listing.listing_id)) return false;
      seen.add(listing.listing_id);
      return true;
    });

    if (unique.length === 0) {
      console.log('HEARTBEAT_OK');
      return;
    }

    // Sort by updated date (newest first)
    unique.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    // Take top 10
    const top = unique.slice(0, 10);

    // Format output
    console.log('## Resumen');
    console.log(`Encontradas ${unique.length} propiedades nuevas/actualizadas desde las 17:00 (7 mar 2026, 20:00).\n`);
    
    console.log('## Nuevos anuncios\n');
    
    for (const listing of top) {
      const portal = listing.portal || 'unknown';
      const title = listing.title || 'Sin título';
      const price = listing.price ? `${listing.price.toLocaleString('es-ES')} PLN` : 'Precio no disponible';
      const area = listing.area ? `${listing.area} m²` : 'Área no disponible';
      const rooms = listing.rooms ? `${listing.rooms} habitaciones` : 'Habitaciones no disponibles';
      const location = listing.address_components?.neighborhood || listing.address_components?.city || 'Ubicación no disponible';
      const updated = listing.updated_at ? new Date(listing.updated_at).toLocaleDateString('es-ES') : '';
      const url = listing.url;

      // Simple scoring (placeholder - price/area ratio)
      let score = 50;
      if (listing.price && listing.area) {
        const pricePerM2 = listing.price / listing.area;
        // Lower price per m² = higher score (assuming ~12,000 PLN/m² is average)
        if (pricePerM2 < 10000) score = 85;
        else if (pricePerM2 < 12000) score = 70;
        else if (pricePerM2 < 14000) score = 55;
        else score = 40;
      }

      console.log(`- **${portal}**: ${title}`);
      console.log(`  - Precio: ${price}`);
      console.log(`  - Tamaño: ${area}`);
      console.log(`  - Habitaciones: ${rooms}`);
      console.log(`  - Ubicación: ${location}`);
      if (updated) console.log(`  - Actualizado: ${updated}`);
      console.log(`  - URL: ${url}`);
      console.log(`  - Puntuación: ${score}/100 (relación precio/m²)`);
      console.log('');
    }

    if (unique.length > 10) {
      console.log(`_(Mostrando las 10 más recientes de ${unique.length} totales)_\n`);
    }

    console.log('## Acciones');
    console.log('- Revisar los anuncios mejor puntuados');
    console.log('- Verificar ubicación y distancia a Teatr Wielki');

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ API no disponible: scraper no está corriendo. Ejecutar: docker compose up -d');
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

scanListings();
