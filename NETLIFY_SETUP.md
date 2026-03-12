# 🚀 FlatScout - Setup Netlify Deploy Automático

## ✅ SETUP INICIAL (hacer solo una vez)

### 1. Instalar Netlify CLI
```bash
npm install -g netlify-cli
```

### 2. Login en Netlify
```bash
netlify login
```
Se abrirá tu navegador → **Autoriza** la aplicación

### 3. Inicializar sitio
```bash
cd /home/ubuntu/.openclaw/workspace-flatscout
netlify init
```

Responde:
- **What would you like to do?** → `Create & configure a new site`
- **Team:** → (elige tu equipo/cuenta)
- **Site name:** → `flatscout-map` (o el que prefieras)
- **Your build command:** → (déjalo vacío, presiona Enter)
- **Directory to deploy:** → `.` (punto)

**¡Listo!** Te dará una URL como: `https://flatscout-map.netlify.app`

---

## 🔧 HACER SCRIPTS EJECUTABLES

```bash
chmod +x /home/ubuntu/.openclaw/workspace-flatscout/generate_map.js
chmod +x /home/ubuntu/.openclaw/workspace-flatscout/update_and_deploy.sh
```

---

## 🧪 PRUEBA MANUAL (antes de automatizar)

```bash
cd /home/ubuntu/.openclaw/workspace-flatscout

# Generar el mapa
./generate_map.js

# Hacer deploy
./update_and_deploy.sh
```

Deberías ver:
```
✅ Mapa generado: /home/ubuntu/.openclaw/workspace-flatscout/apartments_map.html
   15 apartamentos incluidos
🚀 Desplegando a Netlify...
✅ Deploy exitoso!
```

Visita tu URL: `https://flatscout-map.netlify.app`

---

## ⏰ AUTOMATIZAR CON CRON

### 1. Editar crontab
```bash
crontab -e
```

### 2. Añadir esta línea (actualizar cada 6 horas)
```cron
0 */6 * * * /home/ubuntu/.openclaw/workspace-flatscout/update_and_deploy.sh
```

**Opciones de frecuencia:**
- Cada 6 horas: `0 */6 * * *`
- Cada 12 horas: `0 */12 * * *`
- Cada día a las 9am: `0 9 * * *`
- Cada día a las 9am y 9pm: `0 9,21 * * *`

### 3. Ver logs
```bash
tail -f /var/log/flatscout-deploy.log
```

---

## 🔗 COMPARTIR EL MAPA

**Tu mapa estará siempre disponible en:**
```
https://flatscout-map.netlify.app/apartments_map.html
```

Puedes:
- ✅ Compartir esta URL con quien quieras
- ✅ Abrirla desde cualquier dispositivo (móvil, tablet, etc.)
- ✅ El mapa se actualiza automáticamente cada 6 horas
- ✅ Siempre muestra los datos más recientes de tu base

---

## 🛠️ SOLUCIÓN DE PROBLEMAS

### El deploy falla con "Not authorized"
```bash
netlify logout
netlify login
```

### Ver el estado de tu sitio
```bash
netlify status
```

### Ver historial de deploys
```bash
netlify open:admin
```

### Hacer deploy manual
```bash
cd /home/ubuntu/.openclaw/workspace-flatscout
netlify deploy --prod
```

---

## 📝 PRÓXIMOS PASOS

1. **Integrar búsqueda automática:** Edita `update_and_deploy.sh` y descomenta la opción que prefieras (OpenClaw agent o script personalizado)

2. **Afinar coordenadas:** Edita `generate_map.js` y actualiza `NEIGHBORHOOD_COORDS` con coordenadas más precisas si las tienes

3. **Personalizar:** Cambia colores, estilos, o información mostrada editando `generate_map.js`

---

## 🎯 RESUMEN

✅ Cada 6 horas el sistema:
1. Busca nuevos apartamentos (cuando configures búsqueda)
2. Actualiza `listings_database.json`
3. Regenera `apartments_map.html`
4. Hace deploy a Netlify automáticamente

**Tu mapa siempre estará actualizado y accesible desde cualquier lugar.**
