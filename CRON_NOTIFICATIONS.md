# 🔔 Sistema de Notificaciones Automáticas

## 📋 Cómo funciona

### Flujo completo:

```
1. CRON ejecuta update_and_deploy.sh cada 6 horas
   ↓
2. Script busca nuevos apartamentos (cuando esté configurado)
   ↓
3. Regenera apartments_map.html con datos actualizados
   ↓
4. Hace deploy a Netlify → https://myFlatScout.netlify.app
   ↓
5. Ejecuta send_update_notification.js
   ↓
6. Crea archivo .pending_notification con el mensaje
   ↓
7. En el siguiente heartbeat, el agente FlatScout:
   - Lee .pending_notification
   - Envía mensaje a Telegram con:
     * Número de apartamentos activos
     * Número de nuevos sin revisar
     * Link al mapa actualizado
   - Elimina .pending_notification
```

---

## 🎯 Mensaje que recibirás

Cada vez que el mapa se actualice, recibirás:

```
🗺️ Mapa actualizado - 06/03/2026 21:00

📊 15 apartamentos activos
🆕 3 nuevos sin revisar
🔗 https://myFlatScout.netlify.app/apartments_map.html

Actualización automática ✅
```

---

## ⏰ Frecuencia

**Por defecto:** Cada 6 horas

Para cambiar la frecuencia, edita el crontab:
```bash
crontab -e
```

Ejemplos de frecuencias:
```cron
# Cada 3 horas
0 */3 * * * /home/ubuntu/.openclaw/workspace-flatscout/update_and_deploy.sh

# Cada 12 horas
0 */12 * * * /home/ubuntu/.openclaw/workspace-flatscout/update_and_deploy.sh

# Solo a las 9am y 9pm
0 9,21 * * * /home/ubuntu/.openclaw/workspace-flatscout/update_and_deploy.sh

# Solo una vez al día (9am)
0 9 * * * /home/ubuntu/.openclaw/workspace-flatscout/update_and_deploy.sh
```

---

## 🧪 Prueba manual

Para probar el sistema sin esperar al cron:

```bash
cd /home/ubuntu/.openclaw/workspace-flatscout

# 1. Regenerar mapa y hacer deploy
./update_and_deploy.sh

# 2. Esperar a que el agente envíe la notificación
#    (o dispararla manualmente con un mensaje al agente)
```

---

## 📝 Archivos involucrados

- **`.pending_notification`** - Mensaje temporal que el agente debe enviar
- **`.last_update_notification.txt`** - Backup del último mensaje enviado
- **`send_update_notification.js`** - Script que genera las notificaciones
- **`update_and_deploy.sh`** - Script principal del cron
- **`HEARTBEAT.md`** - Instrucciones para que el agente revise notificaciones

---

## 🛠️ Solución de problemas

### No recibo notificaciones

1. Verifica que existe `.pending_notification`:
   ```bash
   ls -la /home/ubuntu/.openclaw/workspace-flatscout/.pending_notification
   ```

2. Si existe, el agente debería enviarla en el próximo heartbeat

3. Puedes forzar manualmente enviando un mensaje al agente:
   "Revisa si hay notificaciones pendientes"

### Ver últimas ejecuciones del cron

```bash
tail -f /var/log/flatscout-deploy.log
```

### Verificar que el cron está activo

```bash
crontab -l
```

Deberías ver la línea del cron de FlatScout.

---

## ✅ Estado del sistema

Para verificar que todo funciona:

1. **Cron instalado:** `crontab -l | grep flatscout`
2. **Scripts ejecutables:** `ls -la /home/ubuntu/.openclaw/workspace-flatscout/*.sh`
3. **Netlify configurado:** `netlify status` (desde el workspace)
4. **Última actualización:** Ver timestamp en https://myFlatScout.netlify.app/apartments_map.html

---

## 🎨 Personalizar mensajes

Edita `send_update_notification.js` y modifica la sección donde se construye el `message`.

Ejemplo para añadir más info:
```javascript
message += `\n💰 Rango de precios: ${minPrice}k - ${maxPrice}k PLN`;
message += `\n📍 Barrios: ${neighborhoods.join(', ')}`;
```
