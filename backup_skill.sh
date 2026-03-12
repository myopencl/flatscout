# Crear directorio de backup si no existe
mkdir -p /home/ubuntu/.openclaw/workspace-flatscout/backup/create-map/

# Copiar recursivamente el skill entero
cp -r /home/ubuntu/.openclaw/workspace-flatscout/skills/create-map/* /home/ubuntu/.openclaw/workspace-flatscout/backup/create-map/

echo "Backup completado en: /home/ubuntu/.openclaw/workspace-flatscout/backup/create-map/"
