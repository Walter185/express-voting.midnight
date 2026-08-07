# Stage 1: Compilar Contrato Compact y Build de la Web App Next.js
FROM node:20-alpine AS builder

WORKDIR /workspace

# Instalar dependencias necesarias para Node y utilidades de compilación
RUN apk add --no-cache libc6-compat curl bash

# Copiar configuración de la app y contrato
COPY app/package*.json ./app/
COPY app/tsconfig.json ./app/
COPY app/next.config.mjs ./app/
COPY contract/ ./contract/

# Instalar dependencias npm
WORKDIR /workspace/app
RUN npm install

# Crear directorio public si no existe para evitar fallos en COPY
RUN mkdir -p public

# Copiar el código fuente de la app y assets públicos
COPY app/src ./src
COPY app/public ./public

# Compilar binding de Compact (si se dispone de compactc CLI o script fallback)
RUN npm run build:compact || true

# Compilar la aplicación Next.js
RUN npm run build

# Stage 2: Runner de producción minimalista
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copiar assets generados
COPY --from=builder /workspace/app/public ./public
COPY --from=builder /workspace/app/.next/standalone ./
COPY --from=builder /workspace/app/.next/static ./.next/static
COPY --from=builder /workspace/app/node_modules ./node_modules
COPY --from=builder /workspace/app/package.json ./package.json

EXPOSE 3000

CMD ["node", "server.js"]
