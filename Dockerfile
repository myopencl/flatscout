# ---------------------------------------------------------------------------
# Stage 1 – Build
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies needed by Playwright
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma client
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 – Production image
# ---------------------------------------------------------------------------
FROM node:20-slim AS production

WORKDIR /app

# Playwright dependencies (Chromium)
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-noto \
    fonts-liberation \
    libnspr4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium instead of downloading its own
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Copy only production artefacts
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma/

# Non-root user for security
RUN useradd -m -u 1001 scraper && chown -R scraper:scraper /app
USER scraper

EXPOSE 3000

# Run DB migrations on startup, then start the service
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
