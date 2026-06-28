/* ============================================================
   VisionLife · Meta Conversions API (CAPI) — endpoint de servidor
   ------------------------------------------------------------
   Recibe eventos del navegador (mismo event_id que el Pixel para
   DEDUPLICAR) y los reenvía a la Graph API de Meta firmados con el
   ACCESS TOKEN, que vive SOLO como variable de entorno en el
   servidor (Dokploy) y NUNCA en archivos del navegador.

   Sin dependencias npm: usa solo módulos nativos de Node.

   Variables de entorno (configúralas en Dokploy):
     CAPI_ENABLED          "true" para activar el reenvío (def. false)
     CAPI_ACCESS_TOKEN     token de la Conversions API (secreto)
     CAPI_PIXEL_ID         ID del Pixel (mismo que el del navegador)
     CAPI_TEST_EVENT_CODE  (opcional) código de "Probar eventos"
     CAPI_ALLOWED_ORIGIN   (opcional) https://tudominio.com  → bloquea otros orígenes
     CAPI_API_VERSION      (opcional) versión Graph API (def. v21.0)
     PORT                  puerto interno (def. 3000)
   ============================================================ */
"use strict";
var http = require("http");
var https = require("https");

var PORT = parseInt(process.env.PORT || "3000", 10);
var TOKEN = process.env.CAPI_ACCESS_TOKEN || "";
var PIXEL_ID = process.env.CAPI_PIXEL_ID || "";
var TEST_CODE = process.env.CAPI_TEST_EVENT_CODE || "";
var ENABLED = String(process.env.CAPI_ENABLED || "").toLowerCase() === "true";
var API_VERSION = process.env.CAPI_API_VERSION || "v21.0";
var ALLOWED_ORIGIN = process.env.CAPI_ALLOWED_ORIGIN || "";
var ALLOWED_EVENTS = { PageView: 1, Lead: 1, Contact: 1, Schedule: 1, ViewContent: 1, CompleteRegistration: 1 };

/* ---- límite de tasa simple en memoria (anti-spam) ---- */
var hits = Object.create(null);
var RL_WINDOW = 60000, RL_MAX = 80;
function rateLimited(ip) {
  var now = Date.now();
  var rec = hits[ip] || { count: 0, ts: now };
  if (now - rec.ts > RL_WINDOW) { rec.count = 0; rec.ts = now; }
  rec.count++; hits[ip] = rec;
  return rec.count > RL_MAX;
}
// limpieza periódica para no crecer sin límite
setInterval(function () {
  var now = Date.now();
  for (var k in hits) { if (now - hits[k].ts > RL_WINDOW) delete hits[k]; }
}, RL_WINDOW).unref();

function clientIp(req) {
  // X-Real-IP lo fija nginx con $remote_addr (el peer real, NO influenciable por
  // el cliente). No usamos X-Forwarded-For porque su primer valor lo puede
  // falsificar el cliente y nginx solo lo APPEND-ea (eso permitiría saltarse el
  // rate-limit y falsear la IP enviada a Meta).
  var real = (req.headers["x-real-ip"] || "").trim();
  if (real) return real;
  // Fallback: último salto de XFF (el que añade nuestro propio proxy), si existe.
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

var server = http.createServer(function (req, res) {
  var url = req.url || "";

  // healthcheck (no expone el token)
  if (req.method === "GET" && url.indexOf("/api/capi/health") === 0) {
    return sendJson(res, 200, { ok: true, enabled: ENABLED, hasToken: !!TOKEN, hasPixel: !!PIXEL_ID, version: API_VERSION });
  }
  if (req.method !== "POST" || url.indexOf("/api/capi") !== 0) {
    return sendJson(res, 404, { error: "not_found" });
  }

  // Control de origen (cuando se configura). Control "blando": el header Origin
  // es falsificable por clientes que no sean navegadores, pero cierra el caso
  // trivial. Si falta Origin (algunos beacons del mismo origen no lo envían) se
  // valida por Referer; si tampoco hay, se permite (beacon de mismo origen).
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
    // si no está listo/activado: aceptar en silencio para no romper el navegador
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
      // no devolvemos detalles ni token al cliente
      sendJson(res, ok ? 200 : 502, { ok: ok });
    }).catch(function (e) {
      console.error("[capi] error enviando a Meta:", e && e.message);
      sendJson(res, 502, { ok: false });
    });
  });
});

server.listen(PORT, function () {
  console.log("[capi] escuchando en :" + PORT + " · enabled=" + ENABLED + " · pixel=" + (PIXEL_ID ? "set" : "missing") + " · token=" + (TOKEN ? "set" : "missing"));
});
