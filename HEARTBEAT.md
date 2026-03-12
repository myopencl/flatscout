# HEARTBEAT.md - FlatScout Búsquedas Periódicas

## Tarea 1: Revisar notificaciones pendientes

**PRIORIDAD MÁXIMA - Ejecutar siempre al inicio:**

1. Buscar archivo: `/home/ubuntu/.openclaw/workspace-flatscout/.pending_notification`
2. Si existe:
   - Leer el contenido JSON
   - Extraer el campo `message`
   - Enviar mensaje a Ernest vía Telegram
   - Eliminar el archivo `.pending_notification`
   - Confirmar: "✅ Notificación enviada"
3. Si no existe, continuar con Tarea 2

## Tarea 2: Buscar nuevos apartamentos

**Frecuencia recomendada**: Cada 6-12 horas (depende de configuración de OpenClaw)

### Qué hacer en cada heartbeat:

1. **Buscar nuevos listados** en los portales configurados:
   - otodom.pl
   - immohouse.pl
   - olx.pl

2. **Filtros de búsqueda**:
   - Ciudad: Poznań
   - Barrios: Jeżyce, Łazarz, Stare Miasto (Centro)
   - Precio máximo: 700,000 PLN
   - Tamaño mínimo: 45 m²
   - Tipo: Venta (no alquiler)

3. **Comparar con base de datos**:
   - Cargar `listings_database.json`
   - Identificar listados nuevos (no existentes en DB)
   - Verificar que no estén en estado "rejected"

4. **Scoring de nuevos listados**:
   - Calcular puntuación basada en SEARCH_PROFILE.md:
     * Precio/valor: 80
     * Ubicación/proximidad trabajo: 90
     * Tamaño/distribución: 70
     * Estado: 60
     * Trayecto: 95
     * Nivel ruido: 40
     * Certeza costes: 50

5. **Alertar si hay candidatos**:
   - Si score >= 75: Alerta inmediata con detalles
   - Si score 60-74: Incluir en resumen diario
   - Si score < 60: Solo añadir a DB, no alertar

6. **Actualizar base de datos**:
   - Añadir nuevos listados encontrados
   - Marcar listados que ya no aparecen como "removed"
   - Actualizar timestamp de `last_seen_at`

### Formato de alerta para nuevos apartamentos:

```
🏠 NUEVO APARTAMENTO - Score: XX/100

📍 Dirección, Barrio
💰 XXX,000 PLN (XX.X zł/m²)
📐 XX m² | X hab + salón | Piso X/X
💵 Gastos: XXX zł/mes

✅ Por qué encaja:
- [razón 1]
- [razón 2]

🔗 [URL del anuncio]
```

### Si no hay nada nuevo:

Responder: `HEARTBEAT_OK`

---

## Notas operativas:

- **No hacer búsquedas manuales exhaustivas**: Usar APIs o scraping ligero cuando sea posible
- **Respetar rate limits**: No sobrecargar los portales
- **Prioridad**: Alertar solo lo relevante, evitar spam
- **Logging**: Mantener registro de cuándo se buscó y qué se encontró
