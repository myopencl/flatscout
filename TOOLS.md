# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Mapa de Listings

**Script canónico para generar/actualizar el mapa:**
```bash
/home/ubuntu/.openclaw/workspace-flatscout/skills/create-map/scripts/update_and_deploy_map_api.sh
```

Este script:
1. Ejecuta el scorer para actualizar puntuaciones
2. Genera el mapa desde la API `/api/v1/map/listings`
3. Sube el resultado a GitHub Pages

**URL del mapa:** https://myopencl.github.io/flatscout/

**NO usar:** `update_and_deploy.sh` ni `generate_map.js` (obsoletos)

---

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
