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
├── capi/
│   └── server.js           # Backend de la Conversions API (Node, sin dependencias)
├── Dockerfile              # UNA imagen: Nginx (web) + Node (backend CAPI)
├── start.sh                # Arranca Node + Nginx en el mismo contenedor
├── nginx.conf              # sirve /public y hace proxy /api/ → 127.0.0.1:3000
├── docker-compose.yml      # opcional (prueba local); un solo servicio
├── .env.example            # Variables de la CAPI (token, etc.) — NO subir .env real
└── .dockerignore
```

> La **misma imagen** sirve la web y el backend de la Conversions API, así que el
> despliegue tipo **Application (Dockerfile)** ya incluye todo — no hace falta Compose.

---

## 🚀 Despliegue en Dokploy (recomendado)

### Application + Dockerfile (recomendado — incluye la Conversions API)

1. En tu proyecto **Visionlife** → **Create Service → Application**.
2. **Provider: GitHub** → conecta la cuenta `DigitalSapiensLab` y elige el repo
   **`visionlife-landing`**, rama `main`.
3. **Build Type:** `Dockerfile` · Dockerfile Path: `Dockerfile`.
4. En **Advanced / Ports** deja el puerto del contenedor en **`80`**.
5. **Si vas a usar la Conversions API:** pestaña **Environment** → añade las
   variables `CAPI_*` (ver `.env.example` y la sección *Integración Meta Pixel*).
   El backend va dentro de la misma imagen, así que **no necesitas Compose**.
6. Pestaña **Domains** → agrega tu dominio (o el `*.traefik.me` de Dokploy)
   apuntando al **puerto 80** y activa HTTPS (Let's Encrypt).
7. **Deploy**. Con el autodeploy/webhook activo, cada `git push` a `main`
   reconstruye y publica solo.

> ¿Prefieres Compose? También funciona: **Create Service → Compose**, Compose Path
> `docker-compose.yml`, define las `CAPI_*` en Environment y Deploy. Es un solo
> servicio (la misma imagen).

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

> El panel lleva `noindex`, está en `robots.txt` y **requiere usuario/contraseña**
> (HTTP Basic Auth). Al pulsar **Guardar y aplicar**, escribe la configuración en el
> servidor (volumen `/data`) y se aplica **al instante** — sin tocar el repo ni redesplegar.

### A) Pixel del navegador (lo más común)

1. Entra a `/admin.html` (usuario/contraseña) → pega tu **Pixel ID** (15-16 dígitos),
   elige el evento de WhatsApp (**Lead** recomendado) y activa el interruptor.
2. Pulsa **💾 Guardar y aplicar**. Listo: se aplica al instante y al recargar la página
   tus datos siguen ahí (se leen del servidor).
3. Verifica con la extensión **Meta Pixel Helper** o en *Events Manager → Probar eventos*.

> **Persistencia:** para que la config guardada sobreviva a los redeploys, en Dokploy
> añade un **Volume Mount → ruta `/data`** (tu servicio → *Advanced → Volumes/Mounts*).
> Sin volumen sigue funcionando, pero vuelve al valor inicial del repo al redesplegar.
> *“Descargar copia”* en el panel sigue disponible si quieres versionar el archivo en git.

El cargador `assets/meta-pixel.js`:
- inicializa el Pixel y dispara `PageView`,
- dispara el evento elegido (Lead/Contact/Schedule) en **cada clic a WhatsApp**
  (header, feed, footer y botón flotante),
- usa un `event_id` único por evento para **deduplicar** con la Conversions API,
- **falla seguro**: si el Pixel está apagado o el ID es inválido, la landing funciona igual.

> ⚠️ `meta-config.js` se sirve con `Cache-Control: no-store` (ver `nginx.conf`) para que los
> cambios lleguen al instante. El cargador `meta-pixel.js` sí se cachea: si lo modificas,
> sube su versión en `index.html` (`meta-pixel.js?v=2`).

### Verificación de dominio (Meta) — desde el panel

En *Meta → Configuración del negocio → Seguridad de la marca → Dominios → Subir archivo HTML*,
descarga el archivo `xxxxxxxx.html`. Luego en **`/admin.html`** (sección *Verificación de
dominio*) **súbelo** y pulsa **Guardar**: el servidor lo aloja en la raíz del sitio al instante
(`https://TU-DOMINIO/xxxxxxxx.html`). Vuelve a Meta y pulsa **Verificar**.

> Funciona para el dominio (o subdominio) que **apunte a este servidor**. Si verificas un
> dominio alojado en otro hosting, el archivo debe ir en ese otro sitio.
> Alternativas en el panel: etiqueta `<meta>` o registro DNS TXT.

### B) Conversions API (eventos de servidor)

La CAPI envía los eventos **desde el servidor** además del Pixel (mejor atribución cuando el
navegador bloquea cookies/JS). El backend ya viene **dentro de la misma imagen**, así que
funciona con el despliegue normal de **Application** — no necesitas Compose.

1. En Meta *Events Manager → Configuración → Conversions API → Generar token de acceso*.
2. En Dokploy → tu servicio → **Environment**, define (ver `.env.example`):

   ```
   CAPI_ENABLED=true
   CAPI_ACCESS_TOKEN=<token-secreto>     # NUNCA lo subas al repo
   CAPI_PIXEL_ID=<mismo-pixel-id>
   CAPI_TEST_EVENT_CODE=<opcional>       # para "Probar eventos"
   CAPI_ALLOWED_ORIGIN=https://TU-DOMINIO  # opcional, recomendado
   ```

3. **Deploy** (o `git push` si tienes autodeploy).
4. En `/admin.html` activa **Conversions API** (deja el endpoint en `/api/capi`), descarga
   el `meta-config.js`, push y Deploy.
5. Comprueba el backend en `https://TU-DOMINIO/api/capi/health` (debe responder
   `{"ok":true,"enabled":true,"hasToken":true,"hasPixel":true}`).

**Cómo funciona:** dentro del contenedor corren Nginx + Node (`start.sh`). Nginx redirige
`/api/` a `127.0.0.1:3000` (el backend Node). El navegador envía cada evento (con su
`event_id`) a `/api/capi`; el backend le añade IP + user-agent, lo firma con el token y lo
manda a la Graph API de Meta. Meta deduplica Pixel + CAPI por `event_id`. **El token solo vive
en variables de entorno del servidor, jamás en archivos del sitio.**

> Si despliegas como **Application (solo nginx)** en vez de Compose, la landing y el Pixel
> funcionan igual; solo la CAPI queda inactiva (deja `capi.enabled: false`).

### Acceso al panel `/admin.html`

El panel está **protegido con usuario y contraseña** (HTTP Basic Auth en `nginx.conf`).
El hash vive en `.htpasswd` (se versiona; solo es el hash bcrypt, no la clave en claro) y el
`Dockerfile` lo copia a la imagen.

**Cambiar la contraseña:**

```bash
htpasswd -B .htpasswd admin     # te pide la nueva clave (usuario: admin)
git add .htpasswd && git commit -m "admin: nueva clave" && git push
# luego pulsa Deploy en Dokploy
```

Para añadir más usuarios usa `htpasswd -B .htpasswd otro-usuario`. Para quitar la
protección, comenta las dos líneas `auth_basic*` del bloque `location = /admin.html`.
