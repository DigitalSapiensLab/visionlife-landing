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
│   ├── admin.html          # Panel para configurar Meta Pixel / CAPI (noindex)
│   ├── meta-config.js      # Configuración del Pixel (la genera /admin.html)
│   ├── robots.txt
│   └── assets/
│       ├── logo.svg
│       ├── meta-pixel.js   # Cargador del Pixel + envío a la Conversions API
│       └── img/
│           ├── 01.{avif,webp} … 10.{avif,webp}        # Infografías (AVIF + WebP)
│           └── paso-1.{avif,webp} … paso-6.{avif,webp} # Slideshow automático (posición 2)
├── capi/                   # Backend de la Conversions API (Node, sin dependencias)
│   ├── server.js
│   └── Dockerfile
├── Dockerfile              # Nginx alpine sirviendo /public
├── nginx.conf             # + proxy /api/ → servicio capi
├── docker-compose.yml     # web (nginx) + capi (node)
├── .env.example           # Variables de la CAPI (token, etc.) — NO subir .env real
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

### Opción B — Compose  *(necesaria si usas la Conversions API)*

1. **Create Service → Compose**, provider GitHub → repo `visionlife-landing`.
2. Compose Path: `docker-compose.yml`.
3. Asigna el dominio al servicio `visionlife-landing` (puerto interno `80`).
4. Si vas a usar la **Conversions API**, añade en **Environment** las variables
   `CAPI_*` (ver `.env.example` y la sección *Integración Meta Pixel* más abajo).
   Levanta dos contenedores: `visionlife-landing` (nginx) y `capi` (Node).
5. **Deploy**.

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

---

## 📊 Integración Meta Pixel + Conversions API

Toda la configuración de Meta se maneja desde el **panel de administración**:

```
https://TU-DOMINIO/admin.html
```

> El panel lleva `noindex` y está en `robots.txt` (no se enlaza públicamente). **No guarda
> secretos** y no puede cambiar producción por sí solo: solo **genera** el archivo
> `public/meta-config.js`, que tú subes al repo y vuelves a desplegar.

### A) Pixel del navegador (lo más común)

1. Entra a `/admin.html` → pega tu **Pixel ID** (15-16 dígitos), elige el evento de WhatsApp
   (**Lead** recomendado) y activa el interruptor.
2. Pulsa **Descargar meta-config.js** y reemplaza `public/meta-config.js` en el repo.
3. `git add public/meta-config.js && git commit -m "meta: pixel" && git push`
4. En Dokploy pulsa **Deploy**. Verifica con la extensión **Meta Pixel Helper** o en
   *Events Manager → Probar eventos*.

El cargador `assets/meta-pixel.js`:
- inicializa el Pixel y dispara `PageView`,
- dispara el evento elegido (Lead/Contact/Schedule) en **cada clic a WhatsApp**
  (header, feed, footer y botón flotante),
- usa un `event_id` único por evento para **deduplicar** con la Conversions API,
- **falla seguro**: si el Pixel está apagado o el ID es inválido, la landing funciona igual.

> ⚠️ `meta-config.js` se sirve con `Cache-Control: no-store` (ver `nginx.conf`) para que los
> cambios lleguen al instante. El cargador `meta-pixel.js` sí se cachea: si lo modificas,
> sube su versión en `index.html` (`meta-pixel.js?v=2`).

### Verificación de dominio (Meta)

Método recomendado: **subir el archivo HTML** que te da Meta (no depende de JavaScript).
En *Configuración del negocio → Seguridad de la marca → Dominios → Subir archivo HTML*:
descarga `xxxxxxxx.html`, colócalo en `public/`, haz push y Deploy, y pulsa **Verificar**.
Alternativas (en `/admin.html`): etiqueta `<meta>` estática en `index.html` o registro DNS TXT.

### B) Conversions API (eventos de servidor)

La CAPI envía los eventos **desde el servidor** además del Pixel (mejor atribución cuando el
navegador bloquea cookies/JS). Requiere el backend `capi` (incluido) y **desplegar con Compose**.

1. En Meta *Events Manager → Configuración → Conversions API → Generar token de acceso*.
2. Despliega con **Compose** (Opción B de arriba) para que arranque el servicio `capi`.
3. En Dokploy → tu servicio → **Environment**, define (ver `.env.example`):

   ```
   CAPI_ENABLED=true
   CAPI_ACCESS_TOKEN=<token-secreto>     # NUNCA lo subas al repo
   CAPI_PIXEL_ID=<mismo-pixel-id>
   CAPI_TEST_EVENT_CODE=<opcional>       # para "Probar eventos"
   CAPI_ALLOWED_ORIGIN=https://TU-DOMINIO  # opcional, recomendado
   ```

4. En `/admin.html` activa **Conversions API** (deja el endpoint en `/api/capi`), descarga
   el `meta-config.js`, push y Deploy.
5. Comprueba el backend en `https://TU-DOMINIO/api/capi/health` (debe responder
   `{"ok":true,"enabled":true,"hasToken":true,"hasPixel":true}`).

**Cómo funciona:** nginx redirige `/api/` al servicio `capi` (Node, puerto 3000). El navegador
envía cada evento (con su `event_id`) a `/api/capi`; el backend le añade IP + user-agent,
lo firma con el token y lo manda a la Graph API de Meta. Meta deduplica Pixel + CAPI por
`event_id`. **El token solo vive en variables de entorno del servidor, jamás en archivos del sitio.**

> Si despliegas como **Application (solo nginx)** en vez de Compose, la landing y el Pixel
> funcionan igual; solo la CAPI queda inactiva (deja `capi.enabled: false`).

### Proteger el panel `/admin.html` (opcional)

Descomenta el bloque de **HTTP Basic Auth** en `nginx.conf`, genera credenciales con
`htpasswd -c ./.htpasswd admin`, cópialas a la imagen (`COPY .htpasswd /etc/nginx/.htpasswd`
en el `Dockerfile`) y vuelve a desplegar.
