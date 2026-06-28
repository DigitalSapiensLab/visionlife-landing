# VisionLife Landing — Nginx (estático) + backend CAPI (Node) en UNA sola imagen.
# Pensado para Dokploy tipo "Application" (un solo Dockerfile): el mismo contenedor
# sirve la web y expone /api/ para la Conversions API. Sin dependencias npm.
FROM nginx:1.27-alpine

# Node para el backend de la Conversions API
RUN apk add --no-cache nodejs

# Config de Nginx + credenciales del panel /admin.html
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY .htpasswd /etc/nginx/.htpasswd

# Backend CAPI (Node)
COPY capi/server.js /app/server.js

# Sitio estático
COPY public/ /usr/share/nginx/html/

# Arranque: Node (segundo plano) + Nginx (primer plano)
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Puerto interno del backend (nginx hace proxy a 127.0.0.1:3000)
ENV PORT=3000
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["/start.sh"]
