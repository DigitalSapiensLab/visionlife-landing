#!/bin/sh
# Arranca el backend CAPI (Node) en segundo plano y Nginx en primer plano.
# Si Node falla, Nginx sigue sirviendo la web (la landing y el Pixel del
# navegador no dependen del backend; solo /api/ devolvería 502).
echo "[start] iniciando backend CAPI (node)…"
node /app/server.js &

echo "[start] iniciando nginx…"
exec nginx -g 'daemon off;'
