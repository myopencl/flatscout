---
name: create-map
description: >
Access the Poznań real estate market database through a map. Use this whenever a user wants to see a map with the listings
---

# 🤖 FlatScout Local Skill: createMap

## Descripción
Generación de mapas específicos y despliegue a GitHub Pages.

## Comandos para el agente
Para generar un mapa personalizado:
`bash ./skills/createMap/scripts/update_and_deploy.sh --name [nombre] --rooms [N] --status [S]`

- `--name`: Nombre del archivo de salida (`map_[nombre].html`).
- `--rooms`: Filtro de habitaciones (opcional).
- `--status`: Filtro de estado (ej: VISITED).

## Instrucciones para el Agente (Dynamic Querying)
Cuando el usuario pida un mapa especial (ej: "Mapa de 2 habitaciones visitadas"):
1. Identifica el nombre: `map_2hab_visitados.html` -> `--name 2hab_visitados`.
2. Identifica los flags de filtrado.
3. El agente debe ejecutar el script de despliegue pasando estos parámetros.
4. El agente debe informar al usuario de la nueva URL: `https://myopencl.github.io/flatscout/map_[nombre].html`

## Regla canónica de actualización de mapa (obligatoria)
Cuando el usuario pida "actualizar el mapa" (sin pedir variantes), ejecutar SIEMPRE exactamente:
`/home/ubuntu/.openclaw/workspace-flatscout/skills/create-map/scripts/update_and_deploy.sh`

No usar rutas ni scripts alternativos salvo instrucción explícita del usuario.
