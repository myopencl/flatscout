# poznan-scraper

Servicio Node.js de captación, indexación y seguimiento de anuncios de pisos en venta en Poznań.
Portales cubiertos: **Immohouse**, **OLX**, **Otodom**.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   Capa 1 – Scraper                  │
│  node-cron → crawlerRunner → Adapters → PostgreSQL  │
│  (ImmohouseAdapter / OlxAdapter / OtodomAdapter)    │
└─────────────────────┬───────────────────────────────┘
                      │  REST API (Fastify)
┌─────────────────────▼───────────────────────────────┐
│              Capa 2 – Agente externo                │
│  OpenClaw / LLM → GET /api/v1/listings              │
└─────────────────────────────────────────────────────┘
```

Cada adapter es independiente.  Immohouse y OLX usan `fetch + cheerio`.
Otodom usa **Playwright** (el servidor devuelve 403 a clientes HTTP directos).

---

## Requisitos

- Node.js 20+
- PostgreSQL 15+
- (opcional) Docker + Docker Compose

---

## Puesta en marcha rápida (Docker)

```bash
# 1. Clonar y entrar al directorio
cd poznan-scraper

# 2. Levantar DB + scraper
docker compose up -d

# 3. Verificar salud
curl http://localhost:3000/health
```

---

## Instalación manual (sin Docker)

```bash
# 1. Instalar dependencias
npm install

# 2. Instalar Playwright Chromium (solo para Otodom)
npm run playwright:install

# 3. Copiar y editar variables de entorno
cp .env.example .env
# Editar DATABASE_URL con tus credenciales

# 4. Crear base de datos y aplicar migraciones
npm run db:migrate

# 5. Generar cliente Prisma
npm run db:generate

# 6. Iniciar en desarrollo
npm run dev

# O compilar y ejecutar en producción
npm run build
npm start
```

---

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | *requerido* |
| `PORT` | Puerto HTTP | `3000` |
| `LOG_LEVEL` | `trace/debug/info/warn/error` | `info` |
| `LOG_PRETTY` | Colorear logs en terminal | `true` |
| `PLAYWRIGHT_HEADLESS` | Chromium en modo headless | `true` |
| `CRAWLER_CONCURRENCY` | Crawls paralelos | `4` |
| `DETAIL_FETCH_CONCURRENCY` | Detail fetches paralelos | `2` |
| `REQUEST_TIMEOUT_MS` | Timeout por request (ms) | `20000` |
| `RATE_LIMIT_DELAY_MS` | Espera mínima entre requests | `1500` |
| `MAX_RETRIES` | Reintentos por request | `3` |

---

## API Reference

### Health

```
GET /health
```

### Saved Searches

```
POST   /api/v1/searches                # Crear búsqueda guardada
GET    /api/v1/searches                # Listar todas
GET    /api/v1/searches/:id            # Detalle
PATCH  /api/v1/searches/:id            # Actualizar
DELETE /api/v1/searches/:id            # Eliminar
POST   /api/v1/searches/:id/duplicate  # Duplicar
POST   /api/v1/searches/:id/run-now    # Ejecutar ahora (async)

GET    /api/v1/searches/:id/listings           # Anuncios de la búsqueda
GET    /api/v1/searches/:id/changes?since=...  # Cambios desde fecha
GET    /api/v1/searches/:id/stats              # Estadísticas del crawler
```

### Listings

```
GET    /api/v1/listings                               # Filtrar anuncios
GET    /api/v1/listings/:id                           # Detalle
GET    /api/v1/listings/:id/events                    # Histórico de cambios
GET    /api/v1/listings/:id/potential-duplicates      # Duplicados cross-portal
PATCH  /api/v1/listings/:id/state                     # Marcar favorito/descartado
```

#### Filtros de GET /api/v1/listings

| Param | Tipo | Ejemplo |
|---|---|---|
| `source` | string | `immohouse` |
| `city` | string | `Poznań` |
| `minPrice` | number | `400000` |
| `maxPrice` | number | `700000` |
| `minArea` | number | `40` |
| `maxArea` | number | `90` |
| `rooms` | number | `3` |
| `status` | `active\|inactive` | `active` |
| `updatedSince` | ISO-8601 | `2024-03-01T00:00:00Z` |
| `page` | number | `1` |
| `limit` | number | `50` |

---

## Ejemplos curl

### Crear búsqueda en Immohouse

```bash
curl -s -X POST http://localhost:3000/api/v1/searches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Poznań 3 pokoje 400-700k Immohouse",
    "portal": "immohouse",
    "frequencyMinutes": 60,
    "filters": {
      "operation": "buy",
      "propertyType": "flat",
      "city": "Poznań",
      "priceMin": 400000,
      "priceMax": 700000,
      "areaMin": 40,
      "areaMax": 90,
      "rooms": 3
    }
  }' | jq .
```

### Lanzar búsqueda manualmente

```bash
curl -s -X POST http://localhost:3000/api/v1/searches/<ID>/run | jq .
```

### Listar anuncios activos de 3 habitaciones

```bash
curl "http://localhost:3000/api/v1/listings?rooms=3&status=active&minPrice=400000&maxPrice=700000" | jq .
```

### Ver cambios de precio en las últimas 24h

```bash
SINCE=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
curl "http://localhost:3000/api/v1/searches/<ID>/changes?since=${SINCE}" | jq .
```

### Marcar un anuncio como favorito

```bash
curl -s -X PATCH http://localhost:3000/api/v1/listings/<LISTING_ID>/state \
  -H "Content-Type: application/json" \
  -d '{"searchId": "<SEARCH_ID>", "userState": "favorite"}' | jq .
```

---

## Tests

```bash
npm test              # Ejecutar todos los tests
npm run test:watch    # Modo watch
npm run test:coverage # Con cobertura
```

Tests unitarios cubiertos:
- `canonicalizeUrl` – normalización de URLs por portal
- `compareListings` – detección de cambios (precio, campos, estado)
- `fingerprints` – deduplicación cross-portal
- `immohouse.parsers` – parseo desde fixture HTML

---

## Añadir un nuevo portal

1. Crear `src/adapters/miportal/MiPortalAdapter.ts` implementando `PortalAdapter`
2. Crear `src/adapters/miportal/miportal.parsers.ts`
3. Registrar el adapter en `src/core/crawlerRunner.ts` → `adapters`
4. Añadir el portal al enum `portal` del schema Prisma si es necesario
5. Añadir tests con fixture HTML

---

## Estructura del proyecto

```
src/
  adapters/
    immohouse/    fetch + cheerio
    olx/          fetch + cheerio (Playwright fallback preparado)
    otodom/       Playwright (Next.js / 403 protegido)
  api/routes/     Fastify routes
  core/           crawlerRunner, scheduler, canonicalizeUrl, fingerprints, compareListings
  db/             Prisma client singleton
  types/          Interfaces compartidas
  utils/          logger, http (RateLimiter, fetchHtml), retry
prisma/
  schema.prisma   Modelo de datos completo
tests/
  fixtures/       HTML de prueba para parsers
Dockerfile
docker-compose.yml
```

---

## Notas de implementación

**Otodom y protección 403:** Otodom detecta y bloquea clientes HTTP normales.  El `OtodomAdapter` usa Playwright/Chromium con user-agent real, locale `pl-PL` y manejo automático del banner de cookies.

**OLX y renderizado JS:** La versión `www.olx.pl` intenta parsear HTML con cheerio.  Si la página llega sin contenido (JS-heavy), el adapter lo detecta y lo registra en logs.  Para activar Playwright en OLX, sustituye `fetchHtml` por `this.fetchPageHtml` del mismo patrón que OtodomAdapter.

**Deduplicación:** El `fingerprint` combina precio (±5000 PLN), área, habitaciones y texto de ubicación normalizado.  Permite detectar el mismo piso en diferentes portales sin usar LLM.

**Scheduler:** `node-cron` comprueba cada minuto qué búsquedas están pendientes según `frequency_minutes`.  Las ejecuciones no se solapan (guard `activeJobs`).
"# poznan-scraper" 
