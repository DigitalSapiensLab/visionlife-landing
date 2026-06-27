# VisionLife — Landing Page

Landing page de una sola columna con las infografías de **VisionLife** secuenciadas.
Cada imagen y el botón flotante enlazan a WhatsApp (**+51 989 192 379**) con un
mensaje predeterminado: *"Hola, estoy interesado en implementar VisionLife para mis
proyectos inmobiliarios."*

## Comportamiento responsive

- **Móvil:** imágenes a ancho completo (100%).
- **Escritorio (≥1024px):** columna de imágenes al **30% del ancho del navegador**, centrada.
- **Header sticky** con el logo VisionLife (verde) arriba a la izquierda + botón de WhatsApp.

## Estructura

```
visionlife-landing/
├── public/                 # Sitio estático (lo que se sirve)
│   ├── index.html
│   └── assets/
│       ├── logo.svg
│       └── img/01.png … 10.png
├── Dockerfile              # Nginx alpine sirviendo /public
├── nginx.conf
├── docker-compose.yml
└── .dockerignore
```

---

## 🚀 Despliegue en Dokploy (recomendado)

### Opción A — Application + Dockerfile (la más simple)

1. En tu proyecto **Visionlife** → **Create Service → Application**.
2. **Provider: GitHub** → conecta la cuenta `DigitalSapiensLab` y elige el repo
   **`visionlife-landing`**, rama `main`.
3. **Build Type:** `Dockerfile` · Dockerfile Path: `Dockerfile`.
4. En **Advanced / Ports** deja el puerto del contenedor en **`80`**.
5. Pestaña **Domains** → agrega tu dominio (o usa el `*.traefik.me` que da Dokploy)
   apuntando al **puerto 80** y activa HTTPS (Let's Encrypt).
6. **Deploy**. Dokploy clona, construye la imagen y publica.

### Opción B — Compose

1. **Create Service → Compose**, provider GitHub → repo `visionlife-landing`.
2. Compose Path: `docker-compose.yml`.
3. Asigna el dominio al servicio `visionlife-landing` (puerto interno `80`).
4. **Deploy**.

> Cada vez que hagas `git push` a `main`, vuelve a pulsar **Deploy** (o activa el
> webhook/autodeploy de Dokploy) para actualizar producción.

---

## 🖥️ Prueba local

Con Docker:

```bash
docker compose up --build
# abre http://localhost:8080
```

Sin Docker (solo estáticos):

```bash
cd public && python3 -m http.server 8080
# abre http://localhost:8080
```

---

## Cambiar el número o el mensaje de WhatsApp

Edita los enlaces en `public/index.html` (formato `wa.me`):

```
https://wa.me/51989192379?text=<mensaje-codificado-en-url>
```
