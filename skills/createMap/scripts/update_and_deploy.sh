#!/bin/bash
###############################################################################
# FlatScout - Automatización GitHub (Git Push)
###############################################################################
set -e

# Configuración
WORKSPACE="/home/ubuntu/.openclaw/workspace-flatscout"
LOG_FILE="$WORKSPACE/logs/flatscout-deploy.log"
SCRAPER_SCRIPT="$WORKSPACE/skills/flatscout-scraper-api/scripts/search-listings.js"
TEMP_DATA="$WORKSPACE/listings_temp.json"
ENV_FILE="$WORKSPACE/.env"

cd "$WORKSPACE"

echo "================================================" | tee -a "$LOG_FILE"
echo "🔄 FlatScout GitHub Pipeline - $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"

# Cargar credenciales
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

# 1. Obtener datos
echo "📥 Consultando Scraper..." | tee -a "$LOG_FILE"
node "$SCRAPER_SCRIPT" --output json --scoreMin 75 > "$TEMP_DATA"

# 2. Generar mapa
node "skills/createMap/scripts/generate_map.js"

# 3. Git Deployment
# Configurar remoto autenticado
REPO_URL="https://${GITHUB_TOKEN}@github.com/myopencl/flatscout.git"
git remote set-url origin "$REPO_URL"

git add apartments_map.html
if ! git diff-index --quiet HEAD --; then
  git commit -m "FlatScout Map Update: $(date)"
  git push origin main
  echo "✅ Mapa subido a GitHub (https://myopencl.github.io/flatscout/apartments_map.html)." | tee -a "$LOG_FILE"
else
  echo "ℹ️  No hay cambios en el mapa, omitiendo commit." | tee -a "$LOG_FILE"
fi

# 4. Limpieza
rm -f "$TEMP_DATA"

echo "✅ Pipeline completado." | tee -a "$LOG_FILE"
