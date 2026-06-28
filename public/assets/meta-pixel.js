/* ============================================================
   VisionLife · Cargador de Meta (Facebook) Pixel
   ------------------------------------------------------------
   Lee la configuración de window.VL_META (definida en
   /meta-config.js) y, SOLO si el Pixel está activado y el ID es
   válido (15-16 dígitos):
     1. Carga el código base oficial de Meta (fbevents.js)
     2. Inicializa el Pixel y dispara "PageView"
     3. Dispara el evento de WhatsApp (Lead/Contact/Schedule)
        en cada clic a un enlace wa.me

   NO toca la página si el Pixel está desactivado o mal
   configurado: la landing siempre funciona. No inyecta la
   verificación de dominio (esa va por archivo HTML o <meta>
   estático; ver /admin.html).
   ============================================================ */
(function () {
  "use strict";

  /* ---- 1. Leer configuración (+ vista previa local del admin) ---- */
  function readConfig() {
    var cfg = (window.VL_META && typeof window.VL_META === "object") ? window.VL_META : {};
    try {
      var raw = window.localStorage.getItem("VL_META_PREVIEW");
      if (raw) {
        var preview = JSON.parse(raw);
        if (preview && typeof preview === "object") {
          var merged = {}, k;
          for (k in cfg) { if (Object.prototype.hasOwnProperty.call(cfg, k)) merged[k] = cfg[k]; }
          for (k in preview) { if (Object.prototype.hasOwnProperty.call(preview, k)) merged[k] = preview[k]; }
          return merged;
        }
      }
    } catch (e) { /* localStorage no disponible → usar config del archivo */ }
    return cfg;
  }

  var cfg = readConfig();
  var debug = !!cfg.debug;
  function log() {
    if (debug && window.console && window.console.log) {
      window.console.log.apply(window.console, ["[VL_META]"].concat([].slice.call(arguments)));
    }
  }

  /* ---- 2. Validaciones (fallo seguro y silencioso) ---- */
  if (!cfg.enabled) { log("Pixel desactivado (enabled=false). No se carga nada."); return; }

  var pixelId = String(cfg.pixelId == null ? "" : cfg.pixelId).trim();
  if (!/^\d{15,16}$/.test(pixelId)) {
    log("Pixel ID inválido o vacío:", JSON.stringify(pixelId), "— se esperan 15-16 dígitos. No se carga nada.");
    return;
  }

  var leadEvent = (typeof cfg.leadEvent === "string" && cfg.leadEvent.trim()) ? cfg.leadEvent.trim() : "Lead";
  var capi = (cfg.capi && typeof cfg.capi === "object") ? cfg.capi : {};
  var capiOn = !!capi.enabled && typeof capi.endpoint === "string" && capi.endpoint;

  /* ---- Utilidades para deduplicación Pixel + CAPI ---- */
  function uuid() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
    return "e-" + Date.now() + "-" + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }
  function cookie(name) {
    var m = document.cookie.match("(?:^|; )" + name.replace(/([.*+?^${}()|[\]\\])/g, "\\$1") + "=([^;]*)");
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setCookie(name, value) {
    try { document.cookie = name + "=" + value + "; max-age=7776000; path=/; SameSite=Lax"; } catch (e) {}
  }
  // _fbp / _fbc son los identificadores que Meta usa para emparejar (match) y
  // atribuir. Normalmente los crea fbevents.js, pero si un bloqueador lo impide
  // —o el evento de servidor sale antes de que cargue— se perderían. Los
  // generamos nosotros con el formato oficial ANTES de iniciar el Pixel: así el
  // Pixel reutiliza estos mismos valores (no los sobrescribe) y el Pixel y la
  // CAPI comparten identidad → mejor match y deduplicación correcta.
  function ensureFbp() {
    var c = cookie("_fbp");
    if (c) return c;
    var fbp = "fb.1." + Date.now() + "." + Math.floor(Math.random() * 1e10);
    setCookie("_fbp", fbp);
    return fbp;
  }
  // _fbc se deriva del parámetro ?fbclid= (clic en un anuncio de Meta). Es la
  // señal de atribución más fuerte para tráfico pagado; la recuperamos aunque
  // fbevents.js esté bloqueado.
  function getFbc() {
    var c = cookie("_fbc");
    if (c) return c;
    try {
      var m = location.search.match(/[?&]fbclid=([^&]+)/);
      if (m && m[1]) {
        var fbc = "fb.1." + Date.now() + "." + decodeURIComponent(m[1]);
        setCookie("_fbc", fbc);
        return fbc;
      }
    } catch (e) {}
    return "";
  }
  var FBP = ensureFbp();
  var FBC = getFbc();

  // Envía el MISMO evento (mismo event_id) al backend CAPI. El servidor lo firma
  // con el token y Meta deduplica contra el evento del Pixel.
  function sendCapi(eventName, eventId, custom) {
    if (!capiOn) return;
    try {
      var payload = JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_source_url: location.href,
        fbp: FBP || cookie("_fbp"),
        fbc: FBC || cookie("_fbc"),
        custom_data: custom || {}
      });
      var sent = false;
      if (navigator.sendBeacon) {
        try { sent = navigator.sendBeacon(capi.endpoint, new Blob([payload], { type: "application/json" })); } catch (e) { sent = false; }
      }
      if (!sent && window.fetch) {
        fetch(capi.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true, credentials: "omit" }).catch(function () {});
      }
      log("CAPI enviado:", eventName, "· id:", eventId);
    } catch (e) { log("Error CAPI:", e); }
  }

  /* ---- 3. Código base oficial de Meta Pixel (fbevents.js) ---- */
  try {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    window.fbq("init", pixelId);
    var pvId = uuid();
    window.fbq("track", "PageView", {}, { eventID: pvId });
    sendCapi("PageView", pvId, {});
    log("Pixel inicializado:", pixelId, "· PageView enviado · CAPI:", capiOn ? "on" : "off");
  } catch (err) {
    log("Error inicializando el Pixel:", err);
    return;
  }

  /* ---- 4. Evento de WhatsApp en cada clic a wa.me ---- */
  // Búsqueda manual de ancestro: funciona también si el clic cae sobre el
  // <svg>/<path> del ícono (donde Element.closest puede fallar en navegadores viejos).
  function findWaLink(node) {
    while (node && node !== document) {
      if (node.tagName === "A" && node.getAttribute) {
        var href = node.getAttribute("href") || "";
        // Coincide con cualquier enlace de WhatsApp (no se acopla al número, para
        // que el tracking no deje de funcionar en silencio si el número cambia).
        if (/\/\/wa\.me\//.test(href) || href.indexOf("api.whatsapp.com/send") !== -1) return node;
      }
      node = node.parentNode;
    }
    return null;
  }
  function sourceOf(el) {
    if (el.closest) {
      if (el.closest(".wa-fab")) return "fab";
      if (el.closest(".site-header")) return "header";
      if (el.closest(".site-footer")) return "footer";
      if (el.closest(".feed")) return "feed";
    }
    return "other";
  }

  document.addEventListener("click", function (ev) {
    try {
      var link = findWaLink(ev.target);
      if (!link || !window.fbq) return;
      var src = sourceOf(link);
      var custom = { content_name: "WhatsApp VisionLife", source: src };
      var id = uuid();
      window.fbq("track", leadEvent, custom, { eventID: id });
      sendCapi(leadEvent, id, custom);
      log("Evento", leadEvent, "enviado · source:", src, "· id:", id);
    } catch (err) { log("Error en evento de clic:", err); }
  }, true);
})();
