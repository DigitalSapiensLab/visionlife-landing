#!/bin/sh
# Arranca el backend (Node) en segundo plano y Nginx en primer plano.
# Si Node falla, Nginx sigue sirviendo la web (la landing y el Pixel del
# navegador no dependen del backend; solo /api/ devolvería 502).

# Almacén de configuración (volumen persistente si está montado en Dokploy).
DATA_DIR="${CONFIG_DIR:-/data}"
mkdir -p "$DATA_DIR/wellknown"
# Semilla: si aún no hay config guardada, copia la del repo como valor inicial.
if [ ! -f "$DATA_DIR/meta-config.js" ]; then
  cp /usr/share/nginx/html/meta-config.js "$DATA_DIR/meta-config.js" 2>/dev/null || true
  echo "[start] meta-config.js inicial copiado a $DATA_DIR"
fi

echo "[start] iniciando backend (node)…"
node /app/server.js &

echo "[start] iniciando nginx…"
exec nginx -g 'daemon off;'
