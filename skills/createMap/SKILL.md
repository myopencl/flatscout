# 🤖 FlatScout Local Skill: createMap
# Ubicación: workspace-flatscout/skills/createMap/

## Descripción
Genera y despliega el mapa interactivo de apartamentos.

## Estructura
- Scripts: `skills/createMap/scripts/`
- Configuración: `listings_database.json` (Raíz)

## Comandos operativos
1. `node scripts/generate_map.js`
2. `./scripts/update_and_deploy.sh`

## Instrucciones para el Agente
Si se pide "crear mapa" o "publicar mapa":
1. Asegúrate de estar en la raíz.
2. Ejecuta el generador.
3. Ejecuta el despliegue.
4. Verifica los logs en `/var/log/flatscout-deploy.log`.
