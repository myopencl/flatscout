---
name: create-map
description: >
Access the Poznań real estate market database through a map. Use this whenever a user wants to see a map with the listings
---

# 🤖 FlatScout Local Skill: create-map

## Descripción
Generación de mapas interactivos con listings de Poznań y despliegue automático a GitHub Pages.

## Script canónico (OBLIGATORIO)
**SIEMPRE usar este script para generar/actualizar el mapa:**

```bash
/home/ubuntu/.openclaw/workspace-flatscout/skills/create-map/scripts/update_and_deploy_map_api.sh
```

Este script:
1. Ejecuta el scorer para actualizar puntuaciones
2. Genera el mapa desde la API `/api/v1/map/listings`
3. Sube el resultado a GitHub Pages

## NO usar
- ❌ `update_and_deploy.sh` (obsoleto)
- ❌ `generate_map.js` (eliminado)
- ✅ `generate_map_from_map_api.js` (usado internamente por el script canónico)

## URL del mapa
Una vez generado, el mapa está disponible en:
https://myopencl.github.io/flatscout/

## Funcionalidades del mapa
- Filtros por habitaciones, estado, portal, score mínimo
- Filtro de favoritos (⭐)
- Filtro de listings nuevos (últimas 24h)
- Acciones en cada popup:
  - Ver Anuncio (link directo)
  - Comentar (abre bot de Telegram con `/detalle <id>`)
  - ☆ Añadir Fav / ★ Quitar Fav
  - 🗑 Discard (marca como descartado)
- Marcadores especiales:
  - ⭐ Estrella para favoritos
  - Cuadrado para listings nuevos (<24h)
  - Círculo para el resto

## Para actualizar el mapa
Cuando el usuario pida "actualizar el mapa", ejecutar:
```bash
/home/ubuntu/.openclaw/workspace-flatscout/skills/create-map/scripts/update_and_deploy_map_api.sh
```
