const fs = require('fs');
const path = '/home/ubuntu/.openclaw/workspace-flatscout/listings_database.json';
const topPath = '/home/ubuntu/.openclaw/workspace-flatscout/listings_top5.json';

const raw = fs.readFileSync(path, 'utf8');
const db = JSON.parse(raw);

function getScore(l) {
    if (l.id === 'otodom_67739986') return 95; // Keep existing high score 
    if (l.status === 'rejected') return 30;

    let s = 50;

    // Location check
    const addr = (l.address || '').toLowerCase();
    const nbhd = (l.neighborhood || '').toLowerCase();
    const loc = addr + ' ' + nbhd;

    if (loc.includes('stary rynek') || loc.includes('stare miasto')) s += 25;
    else if (loc.includes('jeżyce') || loc.includes('jezyce')) s += 20;
    else if (loc.includes('łazarz') || loc.includes('lazarz') || loc.includes('wilda')) s += 15;
    else if (loc.includes('grunwald')) s += 10;
    else if (loc.includes('malta')) s += 5;
    else if (loc.includes('podolany') || loc.includes('naramowicka')) s -= 20;

    // Price check
    if (l.price < 500000) s += 15;
    else if (l.price <= 550000) s += 10;
    else if (l.price <= 600000) s += 5;
    else if (l.price > 700000) s -= 25;
    else if (l.price >= 650000) s -= 5;

    // Size check
    if (l.size_m2 >= 65) s += 12;
    else if (l.size_m2 >= 60) s += 8;
    else if (l.size_m2 >= 50) s += 5;

    // Status & Cons/Pros
    if (l.status === 'offer_candidate') s += 15;
    if (l.status === 'visited' || l.status === 'visit_scheduled') s += 8;

    if (l.cons && l.cons.length > 0) {
        const consStr = l.cons.join(' ').toLowerCase();
        if (consStr.includes('far') || consStr.includes('terrible')) s -= 15;
        if (consStr.includes('ground floor')) s -= 20;
    }

    return Math.min(Math.max(s, 10), 99);
}

db.listings.forEach(l => {
    if (l.score === null) {
        l.score = getScore(l);
    }
});

fs.writeFileSync(path, JSON.stringify(db, null, 2));

const top5 = db.listings
    .filter(l => l.status !== 'rejected')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

fs.writeFileSync(topPath, JSON.stringify(top5, null, 2));
console.log(JSON.stringify(top5, null, 2));
