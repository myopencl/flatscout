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

# Cargar credenciales
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

echo "================================================" | tee -a "$LOG_FILE"
echo "🔄 FlatScout GitHub Pipeline - $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"

# 1. Obtener datos
node "$SCRAPER_SCRIPT" --output json > "$TEMP_DATA"

# 2. Generar mapa (Actualizado a carpeta create-map)
node "skills/create-map/scripts/generate_map.js" "$@"

# 3. Git Deployment
REPO_URL="https://${GITHUB_TOKEN}@github.com/myopencl/flatscout.git"
git remote set-url origin "$REPO_URL"

git add index.html
if ! git diff-index --quiet HEAD --; then
  git commit -m "FlatScout Dynamic Map Update: $(date)"
  git push origin main
  echo "✅ Mapa subido a GitHub." | tee -a "$LOG_FILE"
else
  echo "ℹ️  No hay cambios en el mapa, omitiendo commit." | tee -a "$LOG_FILE"
fi

# 4. Limpieza
rm -f "$TEMP_DATA"

echo "✅ Pipeline completado." | tee -a "$LOG_FILE"
