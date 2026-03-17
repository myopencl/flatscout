#!/usr/bin/env node

/**
 * Manage Listings Script
 * Update listing status, add notes, record visits.
 */

const api = require('./poznan-api');
const args = require('minimist')(process.argv.slice(2), {
  boolean: ['help'],
  alias: { h: 'help' }
});

/**
 * Parse natural language dates to ISO datetime
 * Supports: "hoy", "mañana", "jueves", "lunes", "el 20", "2026-03-20", etc.
 */
function parseNaturalDate(input) {
  if (!input) return null;
  
  const inputLower = input.toLowerCase().trim();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // "hoy" / "today"
  if (inputLower === 'hoy' || inputLower === 'today') {
    return today.toISOString();
  }
  
  // "mañana" / "tomorrow"
  if (inputLower === 'mañana' || inputLower === 'manana' || inputLower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString();
  }
  
  // "pasado mañana" / "day after tomorrow"
  if (inputLower === 'pasado mañana' || inputLower === 'pasado manana') {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return dayAfter.toISOString();
  }
  
  // Day names in Spanish/English
  const dayNames = {
    'domingo': 0, 'sunday': 0,
    'lunes': 1, 'monday': 1,
    'martes': 2, 'tuesday': 2,
    'miércoles': 3, 'miercoles': 3, 'wednesday': 3,
    'jueves': 4, 'thursday': 4,
    'viernes': 5, 'friday': 5,
    'sábado': 6, 'sabado': 6, 'saturday': 6
  };
  
  if (dayNames[inputLower] !== undefined) {
    const targetDay = dayNames[inputLower];
    const result = new Date(today);
    const currentDay = result.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7; // Next week
    result.setDate(result.getDate() + daysUntil);
    return result.toISOString();
  }
  
  // "el 20" / "el 20 de marzo"
  const dayMatch = inputLower.match(/(?:el\s+)?(\d{1,2})(?:\s+de\s+(\w+))?/);
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10);
    const monthNames = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
      'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
      'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    
    let month = dayMatch[2] ? monthNames[dayMatch[2]] : now.getMonth();
    if (month === undefined) month = now.getMonth();
    
    let year = now.getFullYear();
    // If the date has passed this month, assume next month
    if (month < now.getMonth() || (month === now.getMonth() && day < now.getDate())) {
      if (month <= now.getMonth()) year++;
    }
    
    const result = new Date(year, month, day);
    return result.toISOString();
  }
  
  // ISO date: "2026-03-20"
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(input).toISOString();
  }
  
  // ISO datetime: pass through
  if (/^\d{4}-\d{2}-\d{2}T/.test(input)) {
    return input;
  }
  
  // Try to parse as Date
  try {
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch (e) {}
  
  return null;
}

if (args.help || !args.listingId) {
  console.log(`
Usage: node manage-listings.js --listingId ID [options]

Actions:
  --action STR       'get' to view current state, 'update' to change (default: update)

Updates:
  --status STR       Status: FOUND, SEEN, VISIT_PENDING, VISITED, FINALIST, DISCARDED
  --comments STR     Your notes about the apartment (max 5000 chars)
  --visitDate DATE   Date you visited (supports natural language)
  --rating NUM       Your rating: 1-5 stars
  --pros STR         Comma-separated list of pros
  --cons STR         Comma-separated list of cons

Visit Date Formats:
  --visitDate "hoy"          → Today
  --visitDate "mañana"       → Tomorrow
  --visitDate "jueves"       → Next Thursday
  --visitDate "el 20"        → The 20th of current/next month
  --visitDate "2026-03-20"   → Specific date

Examples:
  node manage-listings.js --listingId abc123 --action get
  node manage-listings.js --listingId abc123 --status VISITED --visitDate "hoy" --rating 4
  node manage-listings.js --listingId abc123 --status VISIT_PENDING --visitDate "jueves"
`);
  if (!args.listingId) process.exit(1);
  process.exit(0);
}

const listingId = args.listingId;
const action = args.action || 'update';

(async () => {
  try {
    if (action === 'get') {
      const state = await api.getListingState(listingId);
      console.log(JSON.stringify(state, null, 2));
      return;
    }

    const update = {};
    if (args.status) update.status = args.status;
    if (args.comments) update.comments = args.comments;
    if (args.visitDate) {
      const parsedDate = parseNaturalDate(args.visitDate);
      if (!parsedDate) {
        console.error(`Error: Could not parse date "${args.visitDate}". Try "hoy", "mañana", "jueves", or "YYYY-MM-DD".`);
        process.exit(1);
      }
      update.visitDate = parsedDate;
    }
    if (args.rating) update.rating = parseInt(args.rating, 10);
    if (args.pros) update.pros = args.pros.split(',').map(s => s.trim()).filter(Boolean);
    if (args.cons) update.cons = args.cons.split(',').map(s => s.trim()).filter(Boolean);

    if (Object.keys(update).length === 0) {
      console.error('Error: No updates specified. Use --status, --comments, --rating, etc.');
      process.exit(1);
    }

    const result = await api.updateListingState(listingId, update);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) console.error('Details:', error.body);
    process.exit(1);
  }
})();
