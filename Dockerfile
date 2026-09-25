FROM node:24-slim

# ffmpeg para el generador de video + fuentes para los textos
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pil \
    ffmpeg \
    fonts-dejavu \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias (solo prod)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Código
COPY . .

# Defaults seguros (se pisan con variables de entorno)
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    MEDIA_DIR=/app/media

# Crear directorios de datos (la persistencia real la dan los Volumes de Railway)
RUN mkdir -p /app/data /app/media

EXPOSE 3000

CMD ["node", "server.js"]
