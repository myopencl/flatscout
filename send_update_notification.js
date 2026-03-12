#!/usr/bin/env node
/**
 * Envía notificación de actualización del mapa a través de OpenClaw
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = path.join(__dirname);
const NOTIFICATION_FILE = path.join(WORKSPACE, '.last_update_notification.txt');
const MAP_URL = 'https://myFlatScout.netlify.app/apartments_map.html';

try {
  // Leer base de datos
  const db = JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'listings_database.json'), 'utf8'));
  const activeCount = db.listings.filter(a => a.status !== 'rejected').length;
  const newCount = db.listings.filter(a => a.status === 'new').length;
  
  // Construir mensaje
  const now = new Date();
  const timeStr = now.toLocaleString('es-ES', { 
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let message = `🗺️ Mapa actualizado - ${timeStr}\n\n`;
  message += `📊 ${activeCount} apartamentos activos`;
  
  if (newCount > 0) {
    message += `\n🆕 ${newCount} nuevos sin revisar`;
  }
  
  message += `\n🔗 ${MAP_URL}\n\n`;
  message += `Actualización automática ✅`;
  
  // Guardar en archivo para backup
  fs.writeFileSync(NOTIFICATION_FILE, message, 'utf8');
  
  // Intentar enviar via OpenClaw
  // Opción 1: Usar el CLI (si está disponible)
  try {
    execSync(`echo "${message}" | openclaw agent flatscout`, { 
      stdio: 'pipe',
      timeout: 5000 
    });
    console.log('✅ Notificación enviada via OpenClaw CLI');
  } catch (cliError) {
    // Opción 2: Escribir en archivo que el agente puede leer
    const pendingFile = path.join(WORKSPACE, '.pending_notification');
    fs.writeFileSync(pendingFile, JSON.stringify({
      timestamp: now.toISOString(),
      message: message,
      sent: false
    }), 'utf8');
    console.log('📝 Notificación guardada - el agente la enviará próximamente');
  }
  
} catch (error) {
  console.error('❌ Error al enviar notificación:', error.message);
  process.exit(1);
}
