#!/usr/bin/env node

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

const SEARCH_IDS = [
  '590bc35c-d6d7-4736-a4f5-7517dc319273', // Otodom Poznań core
  'cccb5c0e-00c0-45a5-bd47-25d6fce21f61', // OLX Poznań core tight
  '73a0bdfa-7d8c-4ccf-81f5-0b5182dfce84'  // Immohouse Poznań core
];

const SEARCH_PROFILE = {
  city: 'Poznań',
  maxPrice: 700000, // PLN
  minArea: 45,      // m²
  minRooms: 2,      // 2 rooms + living or 1 large bedroom (flexible, check title/desc)
  // Neighborhoods: Jeżyce, Łazarz, Centrum (Centre)
  // Exclude: >25min from Teatr Wielki (Fredry 9, 61-701 Poznań)
};

function calculateScore(listing) {
  let score = 0;
  let reasons = [];

  // Price value (80 weight)
  if (listing.price && listing.areaM2) {
    const pricePerM2 = listing.price / listing.areaM2;
    // Assuming typical prices in Poznań, adjust as needed
    if (pricePerM2 < 10000) { // Very good price per m2
      score += 80; reasons.push('muy buen precio/m²');
    } else if (pricePerM2 < 12000) { // Good price per m2
      score += 65; reasons.push('buen precio/m²');
    } else if (pricePerM2 < 14000) { // Average price per m2
      score += 50; reasons.push('precio/m² medio');
    } else {
      score += 30; reasons.push('precio/m² alto');
    }
  }

  // Size/layout (70 weight)
  if (listing.areaM2 >= SEARCH_PROFILE.minArea) {
    score += 70; reasons.push('tamaño adecuado');
  }

  // Rooms (flexible, check for "3 pokoje" or similar in description for 2+living)
  if (listing.rooms && listing.rooms >= SEARCH_PROFILE.minRooms) {
    score += 60; reasons.push('número de habitaciones adecuado');
  } else if (listing.description && (listing.description.toLowerCase().includes('3 pokoje') || listing.description.toLowerCase().includes('2 pokoje') && listing.description.toLowerCase().includes('salon'))) {
    score += 50; reasons.push('habitaciones adecuadas (según descripción)');
  }
  
  // Location (very high weight, currently only city-level check)
  if (listing.city && listing.city.toLowerCase() === SEARCH_PROFILE.city.toLowerCase()) {
    score += 90; reasons.push('ubicación en Poznań');
    if (listing.neighborhood && (listing.neighborhood.toLowerCase().includes('jeżyce') || listing.neighborhood.toLowerCase().includes('łazarz') || listing.neighborhood.toLowerCase().includes('centrum'))) {
        score += 20; reasons.push('barrio preferido');
    }
  }

  // Normalize score to 0-100 (rough approximation, can be improved)
  score = Math.round(score / 300 * 100); // Max possible score without advanced location/commute is ~300 (80+70+60+90)
  if (score > 100) score = 100;

  return { score, reasons: reasons.join(', ') };
}

async function fetchListings(searchId) {
  const url = `${BASE_URL}/api/v1/saved-searches/${searchId}/listings?limit=100`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error fetching ${searchId}: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return Array.isArray(data.items) ? data.items : [];
}

async function main() {
  let allListings = [];
  try {
    for (const searchId of SEARCH_IDS) {
      const listings = await fetchListings(searchId);
      allListings = allListings.concat(listings);
    }
  } catch (error) {
    console.error(`❌ Error al obtener los listings: ${error.message}`);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('El scraper no está corriendo. Ejecutar: docker compose up -d');
    }
    process.exit(1);
  }

  const seen = new Set();
  const uniqueFilteredListings = [];

  for (const listing of allListings) {
    // Apply filters from SEARCH_PROFILE
    if (!listing.price || listing.price > SEARCH_PROFILE.maxPrice) continue;
    if (!listing.areaM2 || listing.areaM2 < SEARCH_PROFILE.minArea) continue;
    if (!listing.url || !listing.url.startsWith('http')) continue;
    if (!listing.city || listing.city.toLowerCase() !== SEARCH_PROFILE.city.toLowerCase()) continue;

    // Deduplicate
    const id = listing.id || listing.url; // Use listing.id as primary, then URL
    if (seen.has(id)) continue;
    seen.add(id);

    // Calculate score
    const { score, reasons } = calculateScore(listing);
    
    // Only include if score meets threshold
    if (score >= 75) {
      uniqueFilteredListings.push({ ...listing, score, scoreReasons: reasons });
    }
  }

  if (uniqueFilteredListings.length === 0) {
    console.log('HEARTBEAT_OK');
    return;
  }

  // Sort by score (descending) and then by updated date (newest first)
  uniqueFilteredListings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  const top10 = uniqueFilteredListings.slice(0, 10);

  // Format output
  let output = 'Resumen: ' + (top10.length > 0 ? \`Se encontraron \${top10.length} nuevos anuncios relevantes desde las 17:00 del 7 de marzo de 2026.\` : 'Sin coincidencias exactas.') + '\n\n';
  
  if (top10.length > 0) {
    output += 'Nuevos anuncios (max 10):\n';
    for (const listing of top10) {
      const portal = listing.source || 'unknown';
      const title = listing.title || 'Sin título';
      const price = listing.price ? \`\${listing.price.toLocaleString('es-ES')} PLN\` : 'Precio no disponible';
      const area = listing.areaM2 ? \`\${listing.areaM2} m²\` : 'Área no disponible';
      const rooms = listing.rooms ? \`\${listing.rooms} habitaciones\` : 'Habitaciones no disponibles';
      const neighborhood = listing.neighborhood || 'Ubicación no disponible';
      const publishedDate = listing.firstSeenAt ? new Date(listing.firstSeenAt).toLocaleDateString('es-ES') : '';
      const updatedDate = listing.updatedAt ? new Date(listing.updatedAt).toLocaleDateString('es-ES') : '';
      const displayDate = updatedDate !== publishedDate ? \`actualizado el \${updatedDate}\` : \`publicado el \${publishedDate}\`;

      output += \`- \*\*${portal}**\n\`;
      output += \`  - Título: ${title}\n\`;
      output += \`  - Precio: ${price}\n\`;
      output += \`  - Tamaño: ${area}\n\`;
      output += \`  - Habitaciones: ${rooms}\n\`;
      output += \`  - Barrio: ${neighborhood}\n\`;
      output += \`  - Fecha: ${displayDate}\n\`;
      output += \`  - URL: ${listing.url}\n\`;
      output += \`  - Puntuación: ${listing.score}/100 (${listing.scoreReasons})\n\`;
      output += \`\n\`;
    }
    output += 'Acciones:\n';
    output += '- Revisar los anuncios mejor puntuados\n';
    output += '- Verificar ubicación y distancia a Teatr Wielki\n';
  } else {
      output += 'Sin coincidencias exactas.\n';
  }

  console.log(output);
}

main();
