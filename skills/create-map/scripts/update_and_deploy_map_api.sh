#!/bin/bash
set -e

WORKSPACE="/home/ubuntu/.openclaw/workspace-flatscout"
LOG_FILE="$WORKSPACE/logs/flatscout-deploy.log"
ENV_FILE="$WORKSPACE/.env"

cd "$WORKSPACE"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

echo "================================================" | tee -a "$LOG_FILE"
echo "🔄 FlatScout Map API Pipeline - $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"

# 1. Run scorer to update scores.json
echo "📊 Running scorer..." | tee -a "$LOG_FILE"
node "skills/flatscout-scraper-api/scripts/score-listings.js" --limit=100 2>&1 | tee -a "$LOG_FILE"

# 2. Generate map from API (will read scores.json)
echo "🗺️ Generating map..." | tee -a "$LOG_FILE"
node "skills/create-map/scripts/generate_map_from_map_api.js" "$@"

# Configurar remote con token si está disponible
if [ -n "$GITHUB_TOKEN" ]; then
  git remote set-url origin "https://${GITHUB_TOKEN}@github.com/myopencl/flatscout.git"
fi

git add index.html
if ! git diff-index --quiet HEAD --; then
  git commit -m "FlatScout MapAPI Update: $(date)"
  git push origin main
  echo "✅ Mapa subido a GitHub." | tee -a "$LOG_FILE"
else
  echo "ℹ️  No hay cambios en el mapa, omitiendo commit." | tee -a "$LOG_FILE"
fi

echo "✅ Pipeline completado." | tee -a "$LOG_FILE"