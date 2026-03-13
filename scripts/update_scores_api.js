#!/usr/bin/env node
const api = require('./flatscout-scraper-api/scripts/poznan-api');
(async()=>{
  try{
    const res = await api.searchListings({limit:100});
    const listings = res.data || res || [];
    // scoring weights
    const w_price=0.3, w_location=0.25, w_size=0.15, w_state=0.2, w_fees=0.1;
    const fav_neigh=['Jeżyce','Łazarz','Stare Miasto','Stary Rynek','Centrum'];
    const pps = listings.map(l=> l.pricePerSquareMeter || (l.price && l.areaM2? l.price/l.areaM2: null)).filter(x=>x);
    const minp=Math.min(...pps), maxp=Math.max(...pps);
    for(const l of listings){
      const ppm = l.pricePerSquareMeter || (l.price && l.areaM2? l.price/l.areaM2: (l.totalPrice && l.areaInSquareMeters? l.totalPrice.value/l.areaInSquareMeters: null));
      const price_s = ppm ? 1 - ((ppm - minp)/( (maxp-minp)||1)) : 0.5;
      const neigh = l.neighborhood || (l.rawSummaryJson && l.rawSummaryJson.location && l.rawSummaryJson.location.reverseGeocoding && l.rawSummaryJson.location.reverseGeocoding.locations && l.rawSummaryJson.location.reverseGeocoding.locations.length? l.rawSummaryJson.location.reverseGeocoding.locations.slice(-1)[0].name: '') || '';
      const loc_s = fav_neigh.some(n=> (neigh||'').includes(n))?1.0:0.6;
      const size = l.areaM2 || l.areaInSquareMeters || (l.rawSummaryJson && l.rawSummaryJson.areaInSquareMeters);
      let size_s=0.5;
      if(size){ if(size<45) size_s=0.4; else if(size<=70) size_s=0.9; else if(size<=90) size_s=0.7; else size_s=0.5 }
      const st = (l.userState && l.userState.status) || l.status || 'FOUND';
      const state_map={'visited':1.0,'visit_scheduled':0.9,'visit_pending':0.85,'offer_candidate':0.95,'contacted':0.8,'found':0.6,'new':0.6,'rejected':0.1};
      const state_s = state_map[(st||'').toLowerCase()]||0.6;
      const fees = l.monthly_fees || (l.rentPrice && l.rentPrice.value) || null;
      let fees_s=0.6; if(fees!==null){ fees_s = 1 - Math.min(Math.max((fees-300)/500,0),1) }
      const score = Math.round((price_s*w_price + loc_s*w_location + size_s*w_size + state_s*w_state + fees_s*w_fees)*100);
      // update via API
      await api.updateListingState(l.id, {score_total: score});
      console.log('Updated', l.id, 'score', score);
    }
  }catch(e){ console.error('Error',e); process.exit(1)}
})();
