# Plantilla de Visualización de Anuncios

Esta plantilla define cómo se deben mostrar los detalles de un anuncio de apartamento, priorizando la claridad, el uso del español y la inclusión de iconos relevantes.

## Estructura del Anuncio

```markdown
🏠 **[Título del Anuncio]**
🌐 **Portal:** [Nombre del Portal]
💰 **Precio:** [Precio PLN] PLN ([Precio EUR] EUR)
📐 **Superficie:** [Área en m²] m²
🛏️ **Habitaciones:** [Número de Habitaciones]
📍 **Barrio:** [Barrio/Ubicación]
📅 **Publicado/Actualizado:** [Fecha de Publicación/Actualización, si disponible]
🔗 **URL:** [URL Directa del Anuncio]

[EMOJI_ESTADO] **Estado:** [Estado del Listing (Ej: Nuevo, Visitado, Descartado)]
⭐ **Puntuación:** [Score Total]/100
    - **Razón:** [Breve explicación de la puntuación]
📝 **Comentarios:** [Tus comentarios sobre el apartamento, si existen]
👍 **Pros:** [Lista de pros, si existen]
👎 **Contras:** [Lista de contras, si existen]
==================================
```

## Guía de Emojis para el Estado (campo `Estado`):

*   **Nuevo (FOUND):** ✅ Nuevo
*   **Visto (SEEN):** 👁️ Visto
*   **Visita Pendiente (VISIT_PENDING):** 🗓️ Visita Pendiente
*   **Visitado (VISITED):** 🚶‍♂️ Visitado
*   **Finalista (FINALIST):** 🏆 Finalista
*   **Descartado (DISCARDED):** 🗑️ Descartado

## Ejemplos de Uso:

### Ejemplo de un Anuncio Nuevo:

```markdown
🏠 **Apartamento en el centro de Poznań**
🌐 **Portal:** Otodom
💰 **Precio:** 598.000 PLN (131.560 EUR)
📐 **Superficie:** 67 m²
🛏️ **Habitaciones:** 3
📍 **Barrio:** Stare Miasto (Centro)
📅 **Publicado/Actualizado:** 2026-03-08
🔗 **URL:** https://www.otodom.pl/pl/oferta/3-pokoje-w-centrum-miasta-ID4onUz

✅ **Estado:** Nuevo
⭐ **Puntuación:** 93/100
    - **Razón:** Excelente ubicación, cumple todos los filtros.
📝 **Comentarios:** Ninguno.
👍 **Pros:** - Céntrico - Buen tamaño.
👎 **Contras:** - No se especifica el estado exacto del edificio.
==================================
```

### Ejemplo de un Anuncio Visitado:

```markdown
🏠 **Mieszkanie - inwestycja en el centro de Poznan**
🌐 **Portal:** Otodom
💰 **Precio:** 620.000 PLN (136.400 EUR)
📐 **Superficie:** 68.62 m²
🛏️ **Habitaciones:** 3
📍 **Barrio:** Jeżyce/Centrum
📅 **Publicado/Actualizado:** 2026-03-08
🔗 **URL:** https://www.otodom.pl/pl/oferta/mieszkanie-inwestycja-en-el-centro-de-poznania-ID4vFk8

🚶‍♂️ **Estado:** Visitado
⭐ **Puntuación:** 88/100
    - **Razón:** Muy buena ubicación, pero requiere inversión adicional.
📝 **Comentarios:** Pequeño, necesita renovación, hay una parte del comedor con ventanas a una zona interior. Edificio en general necesita renovaciones. Gastos a futuro.
👍 **Pros:** - 3 habitaciones y buen tamaño - Céntrico.
👎 **Contras:** - Necesita renovación - Parte del comedor con ventanas a zona interior - Edificio con gastos futuros.
==================================
```
