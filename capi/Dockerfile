# VisionLife · servicio CAPI (Conversions API) — Node sin dependencias
FROM node:20-alpine

WORKDIR /app
COPY server.js ./

ENV PORT=3000 NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/capi/health >/dev/null 2>&1 || exit 1

USER node
CMD ["node", "server.js"]
