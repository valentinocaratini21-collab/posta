/* panel.js — Loader standalone del panel de control (/panel).
 *
 * chunk-admin.js es un <script> clásico pensado para vivir dentro de app.js
 * (se carga con loadChunk('admin') en la ruta #/app/admin) y usa los helpers
 * globales de app.js. Auditado 2026-10-17, los ÚNICOS helpers que consume son:
 *   esc  (×61), $   (×50), $$ (×3) y api.get / api.post (vía adminApi).
 * Acá se los proveemos con implementaciones fieles y mínimas, SIN cargar
 * app.js (que bootearía todo el SPA de cliente encima del panel).
 * Después se carga /chunk-admin.js con el mismo ?v=CHUNK_V que usa
 * loadChunk en app.js y se monta igual que en la app:
 *   root.innerHTML = await adminView(); await bindAdmin();
 * La puerta es la de siempre: bindAdmin pide el token y lo guarda en
 * localStorage 'posta_admin_token' (mismo origen → sirve para /panel y
 * para #/app/admin indistintamente).
 */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Copia fiel de api.req de app.js. Única diferencia deliberada: sin la rama
// 402 'trial_expired' (es del SPA de cliente — setea ME y navega por hash;
// los endpoints /api/admin/* nunca devuelven ese error).
const api = {
  async req(method, url, body, opts = {}) {
    let r;
    try {
      r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(opts.timeout || 30000),
      });
    } catch (e) {
      const err = new Error('¡Uh! Me desconecté un segundo 😅 Revisá tu conexión y probá de nuevo.');
      err.networkError = true; // error de red: NO es "sesión cerrada"
      throw err;
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.message || data.error || 'Error');
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get: (u) => api.req('GET', u),
  post: (u, b, o) => api.req('POST', u, b, o),
  put: (u, b) => api.req('PUT', u, b),
  patch: (u, b) => api.req('PATCH', u, b),
  delete: (u) => api.req('DELETE', u),
  del: (u) => api.req('DELETE', u),
};

const CHUNK_V = '20261017-v171'; // misma constante que CHUNK_V en app.js

function panelFailHTML() {
  return '<div class="card" style="text-align:center">'
    + '<h3 style="margin:0 0 6px">😅 Uh, no pude cargar el panel</h3>'
    + '<p class="d">Revisá tu conexión y probá de nuevo.</p>'
    + '<button class="btn btn-soft" onclick="location.reload()">Reintentar</button>'
    + '</div>';
}

function panelBoot() {
  const root = document.getElementById('panelRoot');
  if (!root) return;
  const s = document.createElement('script');
  s.src = '/chunk-admin.js?v=' + CHUNK_V;
  s.onload = async () => {
    try {
      root.innerHTML = await adminView();
      await bindAdmin();
    } catch (e) {
      root.innerHTML = panelFailHTML();
    }
  };
  s.onerror = () => { root.innerHTML = panelFailHTML(); };
  document.head.appendChild(s);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panelBoot);
else panelBoot();
