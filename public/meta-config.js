/* ============================================================
   VisionLife · Configuración de Meta (Facebook) Pixel
   ------------------------------------------------------------
   Edita estos valores desde el panel  /admin.html  (recomendado)
   o a mano. Después:  git commit  →  git push  →  y vuelve a
   desplegar en Dokploy (botón "Deploy") para que los cambios
   salgan a producción.

   Si "enabled" es false o el Pixel ID está vacío, la página
   funciona normal y NO se carga ningún Pixel.
   ============================================================ */
window.VL_META = {
  // Interruptor general. Si es false, NO se carga ningún Pixel.
  enabled: true,

  // ID numérico del Pixel (15-16 dígitos).
  // Meta Events Manager → Orígenes de datos → tu Pixel → Configuración.
  pixelId: "2429752624096890",

  // Evento estándar al hacer clic en WhatsApp: "Lead" | "Contact" | "Schedule".
  leadEvent: "Lead",

  // Código de verificación de dominio (SOLO referencia; ver métodos en /admin.html).
  // El Pixel NO lo inyecta: usa el archivo HTML que te da Meta o el <meta> estático.
  domainVerification: "",

  // Conversions API (eventos de servidor, además del Pixel, con deduplicación).
  // Requiere desplegar con Compose (servicio "capi") y configurar el TOKEN y el
  // PIXEL_ID como variables de entorno en Dokploy (NUNCA aquí). El navegador solo
  // envía el evento a "endpoint"; el token vive en el servidor.
  capi: {
    enabled: true,
    endpoint: "/api/capi"
  },

  // true = muestra mensajes de depuración en la consola del navegador.
  debug: false
};
