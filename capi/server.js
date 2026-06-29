/* ============================================================
   VisionLife · Backend (Conversions API + Panel de configuración)
   ------------------------------------------------------------
   1) Conversions API (CAPI): recibe eventos del navegador (mismo
      event_id que el Pixel → DEDUPLICA) y los reenvía a la Graph
      API de Meta firmados con el ACCESS TOKEN (solo variable de
      entorno, NUNCA en archivos del navegador).
   2) Panel: guarda la configuración del Pixel y el archivo de
      verificación de dominio en disco (volumen /data) y nginx los
      sirve. Así "Guardar" en /admin.html se aplica AL INSTANTE,
      sin tocar el repo ni redesplegar.  Estos endpoints (/api/config*)
      están protegidos por HTTP Basic Auth en nginx.

   Sin dependencias npm: solo módulos nativos de Node.

   Variables de entorno (Dokploy):
     CAPI_ENABLED, CAPI_ACCESS_TOKEN, CAPI_PIXEL_ID,
     CAPI_TEST_EVENT_CODE, CAPI_ALLOWED_ORIGIN, CAPI_API_VERSION,
     PORT, CONFIG_DIR (def. /data)
   ============================================================ */
"use strict";
var http = require("http");
var https = require("https");
var fs = require("fs");

var PORT = parseInt(process.env.PORT || "3000", 10);
var TOKEN = process.env.CAPI_ACCESS_TOKEN || "";
var PIXEL_ID = process.env.CAPI_PIXEL_ID || "";
var TEST_CODE = process.env.CAPI_TEST_EVENT_CODE || "";
var ENABLED = String(process.env.CAPI_ENABLED || "").toLowerCase() === "true";
var API_VERSION = process.env.CAPI_API_VERSION || "v21.0";
var ALLOWED_ORIGIN = process.env.CAPI_ALLOWED_ORIGIN || "";
var ALLOWED_EVENTS = { PageView: 1, Lead: 1, Contact: 1, Schedule: 1, ViewContent: 1, CompleteRegistration: 1 };

/* ---- Almacén de configuración (volumen persistente) ---- */
var CONFIG_DIR = process.env.CONFIG_DIR || "/data";
var CONFIG_PATH = CONFIG_DIR + "/meta-config.js";
var WELLKNOWN_DIR = CONFIG_DIR + "/wellknown";

function isPersistent() {
  // ¿está /data montado como volumen? (sobrevive a redeploys)
  try {
    var m = fs.readFileSync("/proc/mounts", "utf8");
    return m.split("\n").some(function (l) { return l.split(" ")[1] === CONFIG_DIR; });
  } catch (e) { return false; }
}
function jsStr(s) { return JSON.stringify(String(s == null ? "" : s)); }

// Plantilla EXACTA de meta-config.js (idéntica a la del panel → archivo estable).
function buildMetaConfig(c) {
  return '' +
'/* ============================================================\n' +
'   VisionLife · Configuración de Meta (Facebook) Pixel\n' +
'   ------------------------------------------------------------\n' +
'   Generado por el panel /admin.html (botón Guardar). Se aplica al\n' +
'   instante; vive en el volumen del servidor. Si "enabled" es false\n' +
'   o el Pixel ID está vacío, la página funciona y NO carga el Pixel.\n' +
'   ============================================================ */\n' +
'window.VL_META = {\n' +
'  // Interruptor general. Si es false, NO se carga ningún Pixel.\n' +
'  enabled: ' + (c.enabled ? 'true' : 'false') + ',\n' +
'\n' +
'  // ID numérico del Pixel (15-16 dígitos).\n' +
'  pixelId: ' + jsStr(c.pixelId) + ',\n' +
'\n' +
'  // Evento estándar al hacer clic en WhatsApp: "Lead" | "Contact" | "Schedule".\n' +
'  leadEvent: ' + jsStr(c.leadEvent) + ',\n' +
'\n' +
'  // Código de verificación de dominio (solo referencia).\n' +
'  domainVerification: ' + jsStr(c.domainVerification) + ',\n' +
'\n' +
'  // Conversions API (eventos de servidor, con deduplicación por event_id).\n' +
'  capi: {\n' +
'    enabled: ' + (c.capiEnabled ? 'true' : 'false') + ',\n' +
'    endpoint: ' + jsStr(c.capiEndpoint || "/api/capi") + '\n' +
'  },\n' +
'\n' +
'  // true = mensajes de depuración en la consola.\n' +
'  debug: false\n' +
'};\n';
}

function readSavedConfig() {
  try {
    var t = fs.readFileSync(CONFIG_PATH, "utf8");
    var strOf = function (k) { var m = t.match(new RegExp(k + '\\s*:\\s*["\\\']([^"\\\']*)["\\\']')); return m ? m[1] : ""; };
    var boolOf = function (k) { var m = t.match(new RegExp(k + '\\s*:\\s*(true|false)')); return m ? (m[1] === 'true') : false; };
    var capiBlock = (t.match(/capi\s*:\s*\{([\s\S]*?)\}/) || [, ''])[1];
    var cb = function (k) { var m = capiBlock.match(new RegExp(k + '\\s*:\\s*(true|false)')); return m ? (m[1] === 'true') : false; };
    var cs = function (k) { var m = capiBlock.match(new RegExp(k + '\\s*:\\s*["\\\']([^"\\\']*)["\\\']')); return m ? m[1] : ""; };
    return {
      enabled: boolOf('enabled'), pixelId: strOf('pixelId'), leadEvent: strOf('leadEvent') || "Lead",
      domainVerification: strOf('domainVerification'), capiEnabled: cb('enabled'), capiEndpoint: cs('endpoint') || "/api/capi"
    };
  } catch (e) { return null; }
}
function listVerifyFiles() {
  try { return fs.readdirSync(WELLKNOWN_DIR).filter(function (f) { return /\.html$/i.test(f); }); }
  catch (e) { return []; }
}

/* ---- límite de tasa simple en memoria (anti-spam de la CAPI) ---- */
var hits = Object.create(null);
var RL_WINDOW = 60000, RL_MAX = 80;
function rateLimited(ip) {
  var now = Date.now();
  var rec = hits[ip] || { count: 0, ts: now };
  if (now - rec.ts > RL_WINDOW) { rec.count = 0; rec.ts = now; }
  rec.count++; hits[ip] = rec;
  return rec.count > RL_MAX;
}
setInterval(function () {
  var now = Date.now();
  for (var k in hits) { if (now - hits[k].ts > RL_WINDOW) delete hits[k]; }
}, RL_WINDOW).unref();

function clientIp(req) {
  var real = (req.headers["x-real-ip"] || "").trim();
  if (real) return real;
  var xff = (req.headers["x-forwarded-for"] || "").split(",");
  var last = xff.length ? xff[xff.length - 1].trim() : "";
  return last || (req.socket && req.socket.remoteAddress) || "";
}
function sendJson(res, code, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function postToMeta(payload) {
  return new Promise(function (resolve, reject) {
    var data = JSON.stringify(payload);
    var path = "/" + API_VERSION + "/" + PIXEL_ID + "/events?access_token=" + encodeURIComponent(TOKEN);
    var opts = {
      hostname: "graph.facebook.com", port: 443, path: path, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    };
    var r = https.request(opts, function (resp) {
      var buf = ""; resp.on("data", function (d) { buf += d; });
      resp.on("end", function () { resolve({ status: resp.statusCode, body: buf }); });
    });
    r.on("error", reject);
    r.setTimeout(8000, function () { r.destroy(new Error("timeout")); });
    r.write(data); r.end();
  });
}

/* ---- Guardar configuración (POST /api/config) ---- */
function handleSaveConfig(req, res) {
  var b = "", big = false;
  req.on("data", function (c) { b += c; if (b.length > 60000) { big = true; req.destroy(); } });
  req.on("end", function () {
    if (big) return;
    var v; try { v = JSON.parse(b || "{}"); } catch (e) { return sendJson(res, 400, { error: "bad_json" }); }

    var pixelId = String(v.pixelId == null ? "" : v.pixelId).trim();
    if (pixelId && !/^\d{15,16}$/.test(pixelId)) return sendJson(res, 400, { error: "bad_pixel", message: "El Pixel ID debe tener 15-16 dígitos." });
    var leadEvent = ({ Lead: 1, Contact: 1, Schedule: 1 })[v.leadEvent] ? v.leadEvent : "Lead";
    var endpoint = String(v.capiEndpoint || "/api/capi").trim();
    if (!/^\/[A-Za-z0-9/_-]*$/.test(endpoint)) endpoint = "/api/capi";
    var dv = String(v.domainVerification || "").replace(/[\r\n"'<>]/g, "").slice(0, 200);
    var values = { enabled: !!v.enabled, pixelId: pixelId, leadEvent: leadEvent, domainVerification: dv, capiEnabled: !!v.capiEnabled, capiEndpoint: endpoint };

    var wroteVerify = null, verifyError = null;
    try {
      fs.mkdirSync(WELLKNOWN_DIR, { recursive: true });
      var vf = v.verifyFile;
      if (vf && vf.name && vf.content != null) {
        var name = String(vf.name).trim();
        if (name.indexOf("/") !== -1 || name.indexOf("..") !== -1 || !/^[A-Za-z0-9._-]{1,80}\.html$/.test(name)) {
          verifyError = "Nombre de archivo no válido (debe ser algo como xxxx.html, sin barras).";
        } else if (String(vf.content).length > 5000) {
          verifyError = "El contenido del archivo es demasiado grande.";
        } else {
          fs.writeFileSync(WELLKNOWN_DIR + "/" + name, String(vf.content));
          wroteVerify = name;
        }
      }
      var tmp = CONFIG_PATH + ".tmp";
      fs.writeFileSync(tmp, buildMetaConfig(values));
      fs.renameSync(tmp, CONFIG_PATH);
    } catch (e) {
      console.error("[config] error escribiendo:", e && e.message);
      return sendJson(res, 500, { error: "write_failed", message: String((e && e.message) || e) });
    }
    console.log("[config] guardado · pixel=" + (pixelId || "(vacío)") + " enabled=" + values.enabled + " capi=" + values.capiEnabled + (wroteVerify ? " verify=" + wroteVerify : ""));
    return sendJson(res, 200, { ok: true, persistent: isPersistent(), savedVerify: wroteVerify, verifyError: verifyError, verifyFiles: listVerifyFiles() });
  });
}

var server = http.createServer(function (req, res) {
  var url = req.url || "";

  /* ===== Panel (protegido por nginx Basic Auth) ===== */
  if (req.method === "GET" && url.indexOf("/api/config/status") === 0) {
    return sendJson(res, 200, { ok: true, persistent: isPersistent(), configDir: CONFIG_DIR, pixel: readSavedConfig(), verifyFiles: listVerifyFiles() });
  }
  if (req.method === "POST" && url.indexOf("/api/config") === 0) {
    return handleSaveConfig(req, res);
  }

  /* ===== Conversions API ===== */
  if (req.method === "GET" && url.indexOf("/api/capi/health") === 0) {
    return sendJson(res, 200, { ok: true, enabled: ENABLED, hasToken: !!TOKEN, hasPixel: !!PIXEL_ID, version: API_VERSION, persistent: isPersistent() });
  }
  if (req.method !== "POST" || url.indexOf("/api/capi") !== 0) {
    return sendJson(res, 404, { error: "not_found" });
  }

  if (ALLOWED_ORIGIN) {
    var origin = req.headers.origin || "";
    var referer = req.headers.referer || "";
    if (origin) {
      if (origin !== ALLOWED_ORIGIN) return sendJson(res, 403, { error: "forbidden_origin" });
    } else if (referer && referer.indexOf(ALLOWED_ORIGIN) !== 0) {
      return sendJson(res, 403, { error: "forbidden_origin" });
    }
  }
  var ip = clientIp(req);
  if (rateLimited(ip)) return sendJson(res, 429, { error: "rate_limited" });

  var body = "", tooBig = false;
  req.on("data", function (c) { body += c; if (body.length > 12000) { tooBig = true; req.destroy(); } });
  req.on("end", function () {
    if (tooBig) return;
    if (!ENABLED || !TOKEN || !PIXEL_ID) return sendJson(res, 204, { skipped: true });

    var evt;
    try { evt = JSON.parse(body || "{}"); } catch (e) { return sendJson(res, 400, { error: "bad_json" }); }

    var name = String(evt.event_name || "");
    if (!ALLOWED_EVENTS[name]) return sendJson(res, 400, { error: "bad_event" });

    var ua = req.headers["user-agent"] || "";
    var user_data = { client_ip_address: ip, client_user_agent: ua };
    if (evt.fbp) user_data.fbp = String(evt.fbp);
    if (evt.fbc) user_data.fbc = String(evt.fbc);

    var data = [{
      event_name: name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(evt.event_id || ""),
      action_source: "website",
      event_source_url: String(evt.event_source_url || ""),
      user_data: user_data,
      custom_data: (evt.custom_data && typeof evt.custom_data === "object") ? evt.custom_data : {}
    }];
    var payload = { data: data };
    if (TEST_CODE) payload.test_event_code = TEST_CODE;

    postToMeta(payload).then(function (r) {
      var ok = r.status >= 200 && r.status < 300;
      if (!ok) console.error("[capi] Meta respondió " + r.status + ": " + r.body.slice(0, 500));
      sendJson(res, ok ? 200 : 502, { ok: ok });
    }).catch(function (e) {
      console.error("[capi] error enviando a Meta:", e && e.message);
      sendJson(res, 502, { ok: false });
    });
  });
});

server.listen(PORT, function () {
  console.log("[capi] escuchando en :" + PORT + " · enabled=" + ENABLED + " · pixel=" + (PIXEL_ID ? "set" : "missing") + " · token=" + (TOKEN ? "set" : "missing") + " · persistente=" + isPersistent());
});
