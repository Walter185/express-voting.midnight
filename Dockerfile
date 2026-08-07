# Dockerfile para Cloud Run - VotExpress Midnight Web App
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /workspace

# Instalar dependencias del sistema
RUN apk add --no-cache libc6-compat curl bash

# Copiar configuración de la app y contrato
COPY app/package*.json ./app/
COPY app/tsconfig.json ./app/
COPY app/next.config.mjs ./app/
COPY contract/ ./contract/

# Instalar dependencias npm
WORKDIR /workspace/app
RUN npm install

# Crear directorio public si no existe
RUN mkdir -p public

# Copiar el código fuente de la app y assets públicos
COPY app/src ./src
COPY app/public ./public

# Compilar binding de Compact (fallback silencioso si compactc no está disponible)
RUN npm run build:compact || true

# Compilar la aplicación Next.js
RUN npm run build

# Stage 2: Runner de producción minimalista
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Cloud Run inyecta PORT automáticamente, default 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Copiar assets generados
COPY --from=builder /workspace/app/public ./public
COPY --from=builder /workspace/app/.next/standalone ./
COPY --from=builder /workspace/app/.next/static ./.next/static
COPY --from=builder /workspace/app/node_modules ./node_modules
COPY --from=builder /workspace/app/package.json ./package.json

EXPOSE 8080

CMD ["node", "server.js"]
