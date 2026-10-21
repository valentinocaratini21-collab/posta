/* Posta — frontend */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Variante liviana de una imagen /media (la maestra no se toca: es la que
// se publica). @640.webp para tarjetas, @24.webp de placeholder borroso.
// Si la variante no existe (imágenes viejas), __imgFb cae a la maestra.
function mv(src, w) {
  if (!src || typeof src !== 'string' || src.indexOf('/media/') !== 0) return src;
  return src.replace(/\.(jpe?g|png)$/i, '@' + w + '.webp');
}
window.__imgFb = function (el) {
  if (!el || el.dataset.fbk) return;
  el.dataset.fbk = '1';
  if (el.dataset.full) el.src = el.dataset.full;
};
// Precarga silenciosa de las variantes de la semana: cuando el
// cliente desliza o entra a mirar, las imágenes ya están en caché.
function prefetchMedia(list) {
  try {
    (list || []).slice(0, 12).forEach((d) => {
      if (!d || !d.image_path || d.media_type === 'video') return;
      const im = new Image();
      im.src = mv(d.image_path, 640);
    });
  } catch (e) {}
}
// Corta un texto SIN partir palabras a la mitad: si el corte cae dentro de una
// palabra, retrocede al espacio anterior. Nunca devuelve "efecti".
const cortar = (t, max) => {
  const s = String(t || '').trim();
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  const i = c.lastIndexOf(' ');
  const cut = (i > max * 0.4 ? c.slice(0, i) : c).trim();
  return sinColgada(cut.split(' ').filter(Boolean)).join(' ');
};
// Palabras en las que un titular JAMÁS debe terminar (se vería cortado a mitad de oración,
// ej. "Tip: Cómo organizar tu contenido de").
const HEADLINE_DANGLING = new Set(['de','del','al','el','la','los','las','un','una','unos','unas','y','e','o','u','ni','que','en','con','por','para','sin','sobre','entre','hasta','desde','durante','a','ante','bajo','contra','hacia','tras','mediante','segun','según','como','cómo','pero','mas','más','si','sí','no','tu','tus','su','sus','mi','mis','nuestro','nuestra','esta','este','esto','es','son','hay','se','le','les','lo','me','te']);
const sinColgada = (words) => {
  const w = words.slice();
  while (w.length > 1 && HEADLINE_DANGLING.has(String(w[w.length - 1]).toLowerCase().replace(/[.,;:!?¿¡()"“”'']/g, ''))) w.pop();
  return w;
};
// Titular COMPLETO para imágenes: nunca cortado a mitad de oración ni terminado en
// preposición/artículo. Prefiere la primera oración si entra; si no, recorta por
// palabras y retrocede hasta una palabra "firme".
const makeHeadline = (text, maxWords = 6, maxChars = 70) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const m = s.match(/^[^.!?…]+[.!?…]/);
  const first = (m ? m[0] : s).trim();
  const fw = first.split(' ').filter(Boolean);
  const words = fw.length <= maxWords ? sinColgada(fw) : sinColgada(s.split(' ').filter(Boolean).slice(0, maxWords));
  let out = words.join(' ');
  if (out.length > maxChars) {
    const c = out.slice(0, maxChars);
    const i = c.lastIndexOf(' ');
    out = sinColgada((i > maxChars * 0.4 ? c.slice(0, i) : c).trim().split(' ').filter(Boolean)).join(' ');
  }
  return out;
};

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
      if (r.status === 402 && data.error === 'trial_expired') {
        if (typeof ME !== 'undefined' && ME) ME.trial_expired = true;
        try { location.hash = '#/app/ajustes'; } catch (e) {}
      }
      const err = new Error(data.message || data.error || 'Error');
      err.status = r.status;
      err.data = data; // el cuerpo (ej. plan_limit) viaja con el error
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

// IS_NATIVE: la app corre empaquetada (Capacitor iOS / TWA Android). Sin ventas: cero precios, cero CTAs de pago.
const IS_NATIVE = (() => { try {
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return true;
  if (typeof document !== 'undefined' && document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
  return false;
} catch (e) { return false; } })();

// ---------- Analytics propio: mide el uso para mejorar el producto ----------
// Fire-and-forget: encola eventos y los manda en batch. JAMÁS rompe ni frena la UI.
const AN_Q = [];
function anSid() {
  try {
    let s = localStorage.getItem('posta_sid');
    if (!s) { s = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem('posta_sid', s); }
    return s;
  } catch (e) { return 'nosid'; }
}
function track(name, props) {
  try {
    if (!/^[a-z0-9_]{2,40}$/.test(name || '')) return;
    AN_Q.push({ name, props: props || {}, sid: anSid() });
    if (AN_Q.length > 200) AN_Q.splice(0, AN_Q.length - 200); // tope de memoria
  } catch (e) {}
}
let AN_SENDING = false;
async function flushTrack() {
  if (AN_SENDING || !AN_Q.length) return;
  AN_SENDING = true;
  const batch = AN_Q.splice(0, 60);
  try {
    await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }), keepalive: true });
  } catch (e) { /* se pierde el batch: no pasa nada */ }
  AN_SENDING = false;
  if (AN_Q.length) setTimeout(flushTrack, 2000);
}
function trackBeacon() { // envío sincrónico para pagehide y salidas inmediatas (checkout)
  try {
    if (!AN_Q.length || !navigator.sendBeacon) return;
    navigator.sendBeacon('/api/track', new Blob([JSON.stringify({ events: AN_Q.splice(0, 60) })], { type: 'application/json' }));
  } catch (e) {}
}
setInterval(flushTrack, 10000);
try {
  window.addEventListener('pagehide', () => { trackBeacon(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') trackBeacon(); });
} catch (e) {}
// screen_view automático: cada cambio de ruta
let AN_LAST_PATH = '';
function trackScreen() {
  try {
    const h = location.hash || '#/';
    const p = '/#' + h.split('?')[0].replace(/^#/, '');
    if (p === AN_LAST_PATH) return;
    AN_LAST_PATH = p;
    track('screen_view', { path: p });
  } catch (e) {}
}
try { window.addEventListener('hashchange', () => setTimeout(trackScreen, 60)); } catch (e) {}
// Una sola vez por pantalla (evita duplicar en cada render)
function trackOnce(key, name, props) {
  try {
    const p = (location.hash || '#/').split('?')[0];
    const k = '__an_' + key + '_' + p;
    if (window[k]) return;
    window[k] = true;
    track(name, props);
  } catch (e) {}
}

// Sube un archivo a /api/assets (logo, photo, video). El endpoint recibe el binario
// crudo con Content-Type de imagen/video. Devuelve {ok, id, path, kind}.
async function uploadAssetFile(file, kind) {
  const k = kind === 'logo' ? 'logo' : kind === 'video' ? 'video' : 'photo';
  let r;
  try {
    r = await fetch('/api/assets?kind=' + k, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    throw new Error('¡Uh! Me desconecté un segundo 😅 Revisá tu conexión y probá de nuevo.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error((data && (data.error || data.message)) || 'No pude subir el archivo 😅 Probá de nuevo');
  try { if (typeof ASSETS !== 'undefined') ASSETS = await api.get('/api/assets').catch(() => ASSETS); } catch (e) {}
  return data;
}

// ---------- Lazy chunks: vistas pesadas fuera del primer pantallazo ----------
// app.js trae el primer pantallazo (landing, auth, chat, semana, schedule, aprobación).
// Las vistas pesadas (ajustes, admin, creador manual) viven en /chunk-*.js y se
// cargan bajo demanda la primera vez que se navega a ellas. Son <script> clásicos:
// comparten el scope global con este archivo, sin imports/exports que mantener.
const CHUNK_V = '20261020-v292'; // <-- el coordinador la reemplaza por el ?v= real al armar el zip
const __CHUNKS = {};
function loadChunk(name) {
  if (__CHUNKS[name]) return __CHUNKS[name];
  __CHUNKS[name] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/chunk-' + name + '.js?v=' + CHUNK_V;
    s.onload = () => resolve();
    s.onerror = () => { delete __CHUNKS[name]; reject(new Error('chunk ' + name + ' no cargó')); };
    document.head.appendChild(s);
  });
  return __CHUNKS[name];
}
// Tarjeta amable si un chunk no pudo descargarse (p. ej. sin conexión).
function chunkFailHTML() {
  return '<div class="apv-wrap"><div class="card" style="text-align:center">'
    + '<h3 style="margin:0 0 6px">\U0001f605 Uh, no pude cargar esta secci\u00f3n</h3>'
    + '<p class="hint">Revis\u00e1 tu conexi\u00f3n y prob\u00e1 de nuevo.</p>'
    + '<button class="btn btn-soft" onclick="render()">Reintentar</button>'
    + '</div></div>';
}
let ME = null;
let PROFILE = null;
let SETTINGS = null;
let ASSETS = [];
let PLANS_CACHE = null;
let LANDING_ON = false;

// Referidos: cache de GET /api/referrals/mine (una sola llamada por sesión)
let PZ_REF_PROMISE = null;
let PZ_AUTO_PLAN = false;
async function pzReferral() {
  if (!PZ_REF_PROMISE) PZ_REF_PROMISE = api.get('/api/referrals/mine').catch(() => null);
  return PZ_REF_PROMISE;
}

// true cuando el último refreshSession falló por red (no por sesión cerrada).
// En ese caso NO mandamos al login: la sesión sigue válida, solo falta internet.
let NET_OFFLINE = false;
// Callback que re-pinta la tarjeta "🌐 La web de tu negocio" (lo registra bindSettings cuando renderiza Ajustes)
let PZ_WEB_REFRESH = null;
// Callback que re-consulta GET /api/posty/level y repinta la tarjeta "🧠 Lo que Posty sabe de tu negocio"
let PZ_LEVEL_REFRESH = null;
async function refreshSession() {
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    try {
      const { user } = await api.get('/api/auth/me');
      ME = user || null;
      NET_OFFLINE = false;
      if (user) {
        PROFILE = await api.get('/api/profile');
        SETTINGS = await api.get('/api/settings');
        ASSETS = await api.get('/api/assets').catch(() => []);
      }
      return;
    } catch (e) {
      lastErr = e;
      if (e && e.status === 401) { ME = null; NET_OFFLINE = false; return; } // sesión realmente cerrada
      if (e && e.networkError && i < 2) { await new Promise(r => setTimeout(r, 800 * (i + 1))); continue; }
      break;
    }
  }
  if (lastErr && lastErr.networkError) { NET_OFFLINE = true; return; } // mantenemos ME anterior
  ME = null; NET_OFFLINE = false;
}
// Pantalla cuando hay sesión pero no hay internet: reintentar, nunca pedir login.
function offlineView() {
  return `<div class="pz-offline">
    <div style="font-size:46px">📡</div>
    <h2>Sin conexión</h2>
    <p>No pudimos hablar con el servidor.<br>Tu sesión sigue abierta, solo te falta internet.</p>
    <button class="btn btn-primary" id="btnRetryConn" style="margin-top:14px">Reintentar</button>
  </div>`;
}
function bindOffline() {
  const b = document.getElementById('btnRetryConn');
  if (b) b.onclick = () => render();
}
function assetPhotos() { return ASSETS.filter(a => a.kind === 'photo'); }
function assetVideos() { return ASSETS.filter(a => a.kind === 'video'); }
function assetLogo() { return ASSETS.find(a => a.kind === 'logo'); }

/* ---------- Zonas horarias ---------- */
function zonedTimeToUtc(y, mo, d, h, mi, tz) {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p = Object.fromEntries(fmt.formatToParts(guess).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return new Date(guess.getTime() - (asUTC - guess.getTime()));
}
// Hora de publicación: la de mayor audiencia del negocio (best_hour, medido con
// Instagram), 19:00 como respaldo. Fecha ISO (UTC) del día (hoy+i+1) a esa hora
// en la zona horaria del negocio.
function slotHour() {
  const h = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.best_hour) || 19;
  return (h >= 9 && h <= 21) ? h : 19;
}
function slotDate19(i, tz) {
  const HH = slotHour();
  try {
    const now = new Date();
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + i + 1);
    return zonedTimeToUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), HH, 0, tz).toISOString();
  } catch {
    const d = new Date(); d.setDate(d.getDate() + i + 1); d.setHours(HH, 0, 0, 0);
    return d.toISOString();
  }
}
// Día 'YYYY-MM-DD' de un ISO en la zona horaria del negocio
function tzDayKey(iso, tz) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch { return ''; }
}
// ISO → valor para <input type="datetime-local"> en hora local del navegador
function isoToLocalInput(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
const TIMEZONES = [
  ['America/Argentina/Buenos_Aires', 'Buenos Aires, Argentina'],
  ['America/Santiago', 'Santiago, Chile'],
  ['America/Asuncion', 'Asunción, Paraguay'],
  ['America/Montevideo', 'Montevideo, Uruguay'],
  ['America/Sao_Paulo', 'São Paulo, Brasil'],
  ['America/Bogota', 'Bogotá, Colombia'],
  ['America/Lima', 'Lima, Perú'],
  ['America/Mexico_City', 'Ciudad de México, México'],
  ['America/New_York', 'Nueva York, EE.UU.'],
  ['Europe/Madrid', 'Madrid, España'],
];
const CATS = [
  ['ropa', '👕', 'Ropa'], ['gastronomia', '🍔', 'Gastronomía'], ['cafeteria', '☕', 'Cafetería'],
  ['belleza', '💄', 'Belleza'], ['barberia', '💈', 'Barbería'], ['fitness', '💪', 'Fitness'],
  ['salud', '🩺', 'Salud'], ['mascotas', '🐾', 'Mascotas'], ['servicios', '🛠️', 'Servicios'],
  ['educacion', '📚', 'Educación'], ['tecnologia', '💻', 'Tecnología'], ['hogar', '🏠', 'Hogar y deco'],
  ['inmobiliaria', '🏢', 'Inmobiliaria'], ['eventos', '🎉', 'Eventos'], ['viajes', '✈️', 'Viajes'],
  ['arte', '🎨', 'Arte y diseño'], ['otro', '➕', 'Otro'],
];
const TONES = [
  ['canchero', '😎', 'Canchero'], ['profesional', '💼', 'Profesional'], ['divertido', '😂', 'Divertido'],
  ['cercano', '🤝', 'Cercano'], ['elegante', '✨', 'Elegante'], ['motivador', '🔥', 'Motivador'],
];
const catKnown = v => CATS.some(([x]) => x === v);
const catSel = v => catKnown(v) ? v : 'otro';
const catCustom = v => (catKnown(v) || v === 'otro' || !v) ? '' : v;

/* ---------- LANDING ---------- */
// Precio por día bajo cada plan (landing)
function pzPerDayHTML(p) {
  const per = Math.round(Number(p.price || 0) / 30);
  if (!per) return '';
  const sym = p.currency === 'UYU' ? '$U ' : '$';
  return `<div class="pz-perday">≈ ${sym}${per.toLocaleString('es-AR')} por día</div>`;
}
function planCardsHTML(plans) {
  return (plans || []).map(p => `
    <div class="price-card${p.highlighted ? ' hot' : ''}">
      ${p.highlighted ? '<div class="tag">EL MÁS ELEGIDO</div>' : ''}
      <h3>Plan ${esc(p.name)}</h3>
      <div class="price">${esc(p.price_label)}<small>/mes</small></div>
      ${pzPerDayHTML(p)}
      <p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">${esc(p.tagline)}</p>
      <ul>${(p.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <a class="btn ${p.highlighted ? 'btn-primary' : 'btn-soft'} btn-block" href="/prueba">Probar gratis</a>
    </div>`).join('');
}

function anchorHTML(anchor) {
  if (!anchor) return '';
  return `Un community manager cuesta <b>${esc(anchor.cm)}</b>. Posty arranca en <b>${esc(anchor.desde)}</b>.`;
}

// Cambia el país de los planes en la landing sin recargar
let PLANS_COUNTRY = 'AR';
function toggleMobileMenu() {
  const m = document.getElementById('mobileMenu');
  if (m) m.classList.toggle('open');
}
async function switchPlansCountry(c) {
  PLANS_COUNTRY = (c === 'UY') ? 'UY' : 'AR';
  document.querySelectorAll('.country-toggle button').forEach(b => b.classList.toggle('on', b.dataset.country === PLANS_COUNTRY));
  try {
    const cfg = await api.get('/api/billing/plans?country=' + PLANS_COUNTRY);
    PLANS_CACHE = cfg;
    const row = document.getElementById('plansRow');
    if (row) row.innerHTML = planCardsHTML(cfg.plans);
    const anchor = document.getElementById('anchorLine');
    if (anchor && cfg.anchor) anchor.innerHTML = anchorHTML(cfg.anchor);
  } catch (e) { /* mantiene los planes actuales */ }
}

// Banda fina si llegó con link de referido (?ref= guardado en localStorage)
function pzRefBandHTML() {
  try {
    if (localStorage.getItem('posta_ref')) return `<div class="pz-refband">🎉 Llegaste con un link de invitado: tenés <b>20% off</b> en tu plan, todos los meses</div>`;
  } catch (e) {}
  return '';
}
// Calculadora "cuánto te cuesta hacerlo vos" (global, la llama el botón)

// Lugares reales: el estático del template ("50") es solo un fallback; el número
// vivo baja de /api/capacity (spots_total = MONTHLY_SPOTS en server.js).
function refreshScarcity() {
  fetch('/api/capacity').then(r => r.json()).then(c => {
    if (!c || typeof c.spots_left !== 'number') return;
    const el = document.getElementById('scarcityLine');
    if (el) el.innerHTML = `🔥 Quedan <b>${c.spots_left} lugares</b> — acompañamos personalmente a cada negocio que entra.`;
    document.querySelectorAll('[data-spots]').forEach(s => {
      s.innerHTML = `🔥 Quedan <b>${c.spots_left} de ${c.spots_total} lugares</b> este mes`;
      s.hidden = false;
    });
  }).catch(() => {});
}
// Tarjeta de reporte semanal (2026-10-17): hace VISIBLE el trabajo de
// Posty — lo publicado la semana pasada con su engagement real, lo que ya
// está en camino y la próxima fecha que vende. Se llena sola tras el render
// de Schedule; lunes a miércoles muestra el reporte completo y cualquier
// día muestra el aviso de oportunidad si lo hay.
async function enhanceWeekReport() {
  const slot = document.getElementById('hs-report');
  if (!slot || slot.dataset.done) return;
  slot.dataset.done = '1';
  try {
    const r = await api.get('/api/week/report');
    if (!r || !r.ok) return;
    const day = new Date().getDay(); // 1=lun ... 3=mié
    const showFull = r.has && day >= 1 && day <= 3;
    const opp = r.opportunity;
    if (!showFull && !opp && !r.question) return;
    let h = '<div class="hs-report">';
    if (showFull) {
      h += `<div class="hs-report-title">🎉 Tu semana pasada en Posty</div>`;
      let line = `📸 <b>${r.n}</b> posteo${r.n === 1 ? '' : 's'} publicado${r.n === 1 ? '' : 's'}`;
      if (r.stories) line += ` · 📱 <b>${r.stories}</b> historia${r.stories === 1 ? '' : 's'}`;
      h += `<div class="hs-report-line">${line}</div>`;
      const eng = [];
      if (r.likes) eng.push(`❤️ ${r.likes} likes`);
      if (r.comments) eng.push(`💬 ${r.comments} comentarios`);
      if (r.reach) eng.push(`👁️ ${Number(r.reach).toLocaleString('es-AR')} alcance`);
      if (eng.length) h += `<div class="hs-report-line">${eng.join(' · ')}</div>`;
      if (r.best) h += `<div class="hs-report-line">🏆 Tu mejor posteo: “${esc(r.best.caption)}…” (${r.best.likes} ❤️ · ${r.best.comments} 💬)</div>`;
      if (r.nextCount) h += `<div class="hs-report-line">✨ Y ya hay <b>${r.nextCount}</b> posteos en camino para esta semana</div>`;
      if (r.gridNote) h += `<div class="hs-report-line">${esc(r.gridNote)}</div>`;
    }
    if (opp) {
      h += `<div class="hs-report-line">📅 <b>Se viene ${esc(opp.name)}</b> ${opp.daysLeft === 0 ? '¡hoy!' : opp.daysLeft === 1 ? '¡mañana!' : `en ${opp.daysLeft} días`} — tu semana va a tener un posteo especial ✨</div>`;
    }
    // (v238) POSTY PREGUNTA: el reporte semanal anuncia la pregunta de
    // la semana; la respuesta se da en SU tarjeta de Schedule (una sola
    // pregunta entre las dos superficies, un solo lugar para tocar).
    if (r.question && r.question.texto) {
      h += `<div class="hs-report-line">🤔 <b>Posty te pregunta:</b> ${esc(r.question.texto)} <span style="color:var(--mut)">Respondela en la tarjeta de tu semana 👇</span></div>`;
    }
    h += '</div>';
    slot.innerHTML = h;
  } catch (e) {}
}
// 💡 Loop de ideas semanal (2026-10-18): bloque en Schedule con las ideas que
// Posty pensó para esta semana (competencia / su ganador / calendario), cada
// una con Hacelo (la convierte en borrador) y Ahora no (no se repite). Abajo,
// discreta, la gestión de competidores: es el lugar contextual del loop.
// v223: el bloque de ideas tiene ciclo de vida INDEPENDIENTE del filtro
// de la agenda. Antes su slot vivía DENTRO del bloque de la agenda y
// render() lo repoblaba async tras cada repintado: en cada cambio de
// vista el bloque reaparecía de golpe en el medio de la agenda (el
// flash que Valentino marcó). Ahora: su HTML se cachea en la sesión,
// su único slot vive en Schedule FUERA de la agenda (bajo el bloque de
// la semana), y al repintar se pinta SINCRÓNICO desde la caché — sin
// flash, sin re-fetch por cada cambio de vista u offset.
let IDEAS_CACHE_HTML = null;
// (v236) EL CHIP DE IDEAS: el bloque vive colapsado detrás del chip
// "💡 Ideas" de la fila de subida. Chip y panel se pintan desde la
// MISMA fuente (esta caché + el conteo en memoria): el chip sale en el
// HTML estático de render() ya con su badge y su aria-expanded, y
// paintIdeasChrome() re-aplica TODO el estado (badge, expandido,
// panel abierto/cerrado) de forma SINCRÓNICA en cada repintado —
// abrir/cerrar no dispara fetches y un render() completo (que
// reconstruye #schedView entero) no parpadea ni colapsa el panel.
let IDEAS_PANEL_OPEN = false;
let IDEAS_PENDING_COUNT = null; // null = todavía no lo sabemos (badge reservado, invisible)
function paintIdeasChrome() {
  const badge = document.getElementById('ideasBadge');
  if (badge) {
    const n = IDEAS_PENDING_COUNT;
    badge.textContent = (typeof n === 'number') ? String(n) : '0';
    badge.classList.toggle('off', !(typeof n === 'number' && n > 0));
  }
  const chip = document.getElementById('ideasChip');
  if (chip) chip.setAttribute('aria-expanded', IDEAS_PANEL_OPEN ? 'true' : 'false');
  const slot = document.getElementById('hs-ideas');
  if (slot) slot.classList.toggle('ideas-closed', !IDEAS_PANEL_OPEN);
}
function toggleIdeasPanel() {
  IDEAS_PANEL_OPEN = !IDEAS_PANEL_OPEN;
  paintIdeasChrome();
  // Al abrir, si el panel nunca cargó, enhanceIdeas lo trae (con la
  // caché de sesión es sincrónico y sin fetch cuando ya cargó).
  if (IDEAS_PANEL_OPEN) { try { enhanceIdeas(); } catch (e) {} }
}
async function enhanceIdeas(force) {
  const slot = document.getElementById('hs-ideas');
  if (!slot) return;
  if (!force && IDEAS_CACHE_HTML !== null) {
    if (!slot.dataset.done) {
      slot.dataset.done = '1';
      slot.innerHTML = IDEAS_CACHE_HTML;
      wireIdeasBlock(slot);
    }
    paintIdeasChrome();
    return;
  }
  if (slot.dataset.done && !force) return;
  slot.dataset.done = '1';
  let r;
  try { r = await api.get('/api/ideas'); } catch (e) { slot.dataset.done = ''; return; }
  if (!r || !r.ok) { slot.dataset.done = ''; return; }
  const ideas = r.ideas || [];
  IDEAS_PENDING_COUNT = ideas.length; // (v236) el badge del chip sale de la MISMA respuesta que pinta el panel
  const comps = r.competitors || [];
  const fmtChip = { post: '📸 Posteo', reel: '🎬 Reel', carrusel: '🖼️ Carrusel' };
  let h = '<div class="hs-ideas">';
  h += '<div class="hs-ideas-title">💡 Ideas de Posty para vos</div>';
  if (ideas.length) {
    h += '<div class="hs-ideas-sub">Las pensé mirando tu competencia, lo que mejor te funcionó y lo que se viene. ¿Alguna te gusta?</div>';
    for (const it of ideas) {
      h += `<div class="idea-card" data-idea-card="${it.id}">
        <div class="idea-top"><span class="idea-fmt">${fmtChip[it.format] || '📸 Posteo'}</span></div>
        <div class="idea-title">${esc(it.title)}</div>
        <div class="idea-why">${esc(it.why)}</div>
        <div class="idea-actions">
          <button type="button" class="btn btn-primary btn-sm" data-idea-make="${it.id}">💪 Hacelo</button>
          <button type="button" class="btn btn-ghost btn-sm" data-idea-dismiss="${it.id}">Ahora no</button>
        </div>
      </div>`;
    }
  } else {
    h += '<div class="hs-ideas-sub">Cada lunes te traigo ideas nuevas desde tu competencia, tus posteos que mejor anduvieron y las fechas que se vienen. Sin humo: si no hay nada concreto, no te molesto.</div>';
  }
  h += '<div class="idea-comps"><span class="idea-comps-label">👀 Tu competencia:</span>';
  for (const c of comps) h += `<span class="idea-comp-chip">@${esc(c)}<button type="button" class="idea-comp-x" data-comp-remove="${esc(c)}" aria-label="Quitar @${esc(c)}">×</button></span>`;
  if (comps.length < 5) h += '<span class="idea-comp-add"><input type="text" id="ideaCompInput" placeholder="@competidor" maxlength="42" autocomplete="off" autocapitalize="none"><button type="button" class="btn btn-ghost btn-sm" id="ideaCompAdd">Agregar</button></span>';
  h += '<div class="idea-comp-warn" id="ideaCompWarn" role="alert" hidden></div>';
  h += '</div>';
  if (!comps.length) h += '<div class="idea-comps-hint">Cargá hasta 5 cuentas y Posty las mira cada semana para traerte ideas con datos reales.</div>';
  h += '</div>';
  IDEAS_CACHE_HTML = h;
  // El slot pudo ser reemplazado por un re-render mientras la respuesta
  // viajaba: se pinta el slot ACTUAL, en su lugar definitivo, una vez.
  const cur = document.getElementById('hs-ideas');
  if (cur) { cur.dataset.done = '1'; cur.innerHTML = h; wireIdeasBlock(cur); }
  paintIdeasChrome();
}
function wireIdeasBlock(slot) {
  const compList = () => [...slot.querySelectorAll('[data-comp-remove]')].map((x) => x.getAttribute('data-comp-remove'));
  const saveComps = async (list) => {
    try { await api.post('/api/ideas/competitors', { handles: list }); } catch (e) {}
    try { enhanceIdeas(true); } catch (e) {}
  };
  // (v236) Tras una mutación (Hacelo / Ahora no) la caché del panel se
  // invalida y se re-trae la lista autoritativa: badge y panel nunca
  // pueden contar historias distintas, y una tarjeta resuelta no
  // reaparece al repintar.
  const refreshIdeas = () => { IDEAS_CACHE_HTML = null; try { enhanceIdeas(true); } catch (e) {} };
  slot.querySelectorAll('[data-idea-dismiss]').forEach((b) => {
    b.onclick = async () => {
      const id = b.getAttribute('data-idea-dismiss');
      b.disabled = true;
      try { await api.post('/api/ideas/' + id + '/dismiss', {}); } catch (e) {}
      if (typeof IDEAS_PENDING_COUNT === 'number') IDEAS_PENDING_COUNT = Math.max(0, IDEAS_PENDING_COUNT - 1);
      paintIdeasChrome();
      const card = slot.querySelector(`[data-idea-card="${id}"]`);
      if (card) card.remove();
      refreshIdeas();
    };
  });
  slot.querySelectorAll('[data-idea-make]').forEach((b) => {
    b.onclick = async () => {
      const id = b.getAttribute('data-idea-make');
      const card = slot.querySelector(`[data-idea-card="${id}"]`);
      b.disabled = true;
      b.textContent = '⏳ Armando tu posteo…';
      try {
        await api.post('/api/ideas/' + id + '/make', {}, { timeout: 240000 });
        if (typeof IDEAS_PENDING_COUNT === 'number') IDEAS_PENDING_COUNT = Math.max(0, IDEAS_PENDING_COUNT - 1);
        paintIdeasChrome();
        if (card) card.innerHTML = '<div class="idea-done">✅ ¡Listo! Tu posteo quedó como borrador en tu semana — revisalo cuando quieras.</div>';
        try { toast('✅ Posteo creado desde tu idea'); } catch (e) {}
        setTimeout(() => { refreshIdeas(); try { render(); } catch (e) {} }, 900);
      } catch (e) {
        b.disabled = false;
        b.textContent = '💪 Hacelo';
        try { toast('😅 ' + (e.message || 'No pude armarlo ahora')); } catch (e2) {}
      }
    };
  });
  slot.querySelectorAll('[data-comp-remove]').forEach((b) => {
    b.onclick = () => saveComps(compList().filter((x) => x !== b.getAttribute('data-comp-remove')));
  });
  const addBtn = slot.querySelector('#ideaCompAdd');
  const inp = slot.querySelector('#ideaCompInput');
  if (addBtn && inp) {
    const warn = slot.querySelector('#ideaCompWarn');
    const showWarn = (msg) => { if (warn) { warn.textContent = msg; warn.hidden = false; } };
    const hideWarn = () => { if (warn) { warn.hidden = true; warn.textContent = ''; } };
    const doAdd = () => {
      const v = String(inp.value || '').trim();
      if (!v) return;
      // (v236) La MISMA regla del servidor (ideas.parseCompetitorHandles:
      // charset de IG, sin punto inicial/final, sin duplicados, tope 5),
      // validada ANTES de guardar: un @ inválido ya no se descarta en
      // silencio — el panel avisa. Acepta varios @ separados por
      // espacio/coma, como el parser del servidor.
      const cur = compList();
      const toks = v.split(/[\s,;|]+/).filter(Boolean).map((t) => t.replace(/^@+/, '').toLowerCase());
      const bad = !toks.length || toks.some((h) => !/^[a-z0-9._]{2,40}$/.test(h) || h.startsWith('.') || h.endsWith('.') || cur.includes(h));
      if (bad || cur.length + toks.length > 5) {
        showWarn(bad ? 'Ese @ no parece válido 😅 Revisá el nombre e intentá de nuevo.' : 'Ya tenés 5 competidores — quitá uno para agregar otro.');
        return;
      }
      hideWarn();
      saveComps(cur.concat(toks));
    };
    addBtn.onclick = doAdd;
    inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doAdd(); } };
  }
}
// 🤔 POSTY PREGUNTA (v238): UNA pregunta por semana sobre lo que el
// fundamento no pudo leer solo (rubro a confirmar, estrella, precios,
// huecos del negocio). La tarjeta vive en Schedule, entre las ideas y
// el chat — donde aterriza el ritual de fotos del lunes — y sigue el
// patrón de las ideas: caché de sesión y pintado SINCRÓNICO desde la
// caché en cada render (sin flash, sin fetch por repintado, sin popup).
// Un toque (opciones) o una línea de texto; "Ahora no" no insiste.
let QUESTION_CACHE_HTML = null; // null = todavía no cargó; '' = esta semana no hay pregunta
function questionCardHTML(q) {
  let h = `<div class="hs-question" data-qid="${q.id}">`;
  h += '<div class="hs-question-title">🤔 Posty te pregunta</div>';
  h += `<div class="hs-question-text">${esc(q.texto)}</div>`;
  if ((q.opciones || []).length) {
    h += '<div class="pq-opts">';
    for (const o of q.opciones) h += `<button type="button" class="pq-opt" data-q-opt="${esc(o.value)}">${esc(o.label)}</button>`;
    h += '</div>';
  }
  if (q.allow_text !== false) {
    h += '<div class="pq-text-row"><input type="text" class="in pq-input" id="pqInput" placeholder="O escribilo con tus palabras…" maxlength="200" autocomplete="off"><button type="button" class="btn btn-primary btn-sm" id="pqSend">Guardar</button></div>';
  }
  h += '<div class="pq-foot"><button type="button" class="btn btn-ghost btn-sm" id="pqDismiss">Ahora no</button><span class="pq-hint">Una sola por semana: es para que tus posteos sean de TU negocio, no genéricos.</span></div>';
  h += '</div>';
  return h;
}
function questionSwap(html) {
  QUESTION_CACHE_HTML = html;
  const cur = document.getElementById('hs-question');
  if (cur) { cur.dataset.done = '1'; cur.innerHTML = html; wireQuestionCard(cur); }
}
async function enhanceQuestion(force) {
  const slot = document.getElementById('hs-question');
  if (!slot) return;
  if (!force && QUESTION_CACHE_HTML !== null) {
    if (slot.dataset.done !== '1') {
      slot.dataset.done = '1';
      slot.innerHTML = QUESTION_CACHE_HTML;
      wireQuestionCard(slot);
    }
    return;
  }
  if (slot.dataset.done && !force) return;
  slot.dataset.done = '1';
  let r;
  try { r = await api.get('/api/questions/current'); } catch (e) { slot.dataset.done = ''; return; }
  if (!r || !r.ok) { slot.dataset.done = ''; return; }
  questionSwap(r.question ? questionCardHTML(r.question) : '');
}
function wireQuestionCard(slot) {
  const card = slot && slot.querySelector('.hs-question[data-qid]');
  if (!card || card.dataset.wired) return;
  card.dataset.wired = '1';
  const id = card.getAttribute('data-qid');
  const inp = card.querySelector('#pqInput');
  const answer = async (payload) => {
    try {
      await api.post('/api/questions/' + id + '/answer', payload);
      questionSwap('<div class="hs-question"><div class="hs-question-text">✅ ¡Gracias! Ya lo tengo en cuenta para tus próximos posteos.</div></div>');
      try { toast('✅ ¡Gracias! Respuesta guardada'); } catch (e) {}
    } catch (e) {
      try { toast('😅 ' + ((e && e.message) || 'No pude guardarla, probá de nuevo')); } catch (e2) {}
    }
  };
  card.querySelectorAll('[data-q-opt]').forEach((b) => {
    b.onclick = () => {
      const v = b.getAttribute('data-q-opt');
      // "No, es otro": no envía nada — enfoca el texto para que lo escriba.
      if (v === '__otro__') { if (inp) { inp.focus(); inp.placeholder = 'Escribí cuál es…'; } return; }
      b.disabled = true;
      answer({ value: v });
    };
  });
  const send = card.querySelector('#pqSend');
  const doSend = () => {
    const t = String((inp && inp.value) || '').trim();
    if (!t) { if (inp) { inp.focus(); inp.placeholder = 'Escribí tu respuesta 😊'; } return; }
    answer({ text: t });
  };
  if (send) send.onclick = doSend;
  if (inp) inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doSend(); } };
  const dis = card.querySelector('#pqDismiss');
  if (dis) dis.onclick = async () => {
    dis.disabled = true;
    try { await api.post('/api/questions/' + id + '/dismiss', {}); } catch (e) {}
    questionSwap('<div class="hs-question"><div class="hs-question-text">👌 Dale — la semana que viene te pregunto otra cosa.</div></div>');
  };
}
function lpGoTrial(e) {
  if (e) e.preventDefault();
  const inp = document.getElementById('lpIg');
  const ig = String((inp && inp.value) || '').replace(/^@/, '').trim().toLowerCase();
  location.href = ig ? '/prueba?ig=' + encodeURIComponent(ig) : '/prueba';
  return false;
}
let LP_LIVE_TIMER = null, LP_LIVE_IO = null;
function lpInitHero() {
  lpInitCarousel();
  lpInitWall();
  // — Actividad en vivo "Posty trabajando": rota líneas ilustrativas del negocio de ejemplo.
  const line = document.getElementById('lpLiveLine');
  if (line) {
    const items = [
      '🐾 <b>Posty</b> publicó el posteo del martes <span>· hace 2 h</span>',
      '💬 <b>Posty</b> dejó listas 3 respuestas a comentarios <span>· hace 5 h</span>',
      '🎬 El reel de la semana ya está listo <span>· ayer</span>',
      '📸 Historia de la promo programada <span>· hoy 9:00</span>',
      '📊 Tu reporte de la semana está listo <span>· el lunes</span>'
    ];
    let i = 0;
    line.innerHTML = items[0];
    if (LP_LIVE_TIMER) { clearInterval(LP_LIVE_TIMER); LP_LIVE_TIMER = null; }
    if (LP_LIVE_IO) { LP_LIVE_IO.disconnect(); LP_LIVE_IO = null; }
    const tick = () => {
      line.classList.add('swap');
      setTimeout(() => { i = (i + 1) % items.length; line.innerHTML = items[i]; line.classList.remove('swap'); }, 320);
    };
    const start = () => { if (!LP_LIVE_TIMER) LP_LIVE_TIMER = setInterval(tick, 3500); };
    const stop = () => { if (LP_LIVE_TIMER) { clearInterval(LP_LIVE_TIMER); LP_LIVE_TIMER = null; } };
    if ('IntersectionObserver' in window) {
      LP_LIVE_IO = new IntersectionObserver((es) => { es.forEach((en) => { if (en.isIntersecting) start(); else stop(); }); }, { threshold: 0.15 });
      LP_LIVE_IO.observe(line);
    } else start();
  }
  // — Contraste arrastrable HOY / CON POSTY (pointer events + range accesible).
  const drag = document.getElementById('pzDrag');
  if (drag && !drag.dataset.bound) {
    drag.dataset.bound = '1';
    const range = document.getElementById('pzDragRange');
    const setPos = (p) => {
      p = Math.max(4, Math.min(96, p));
      drag.style.setProperty('--pos', p + '%');
      if (range) range.value = Math.round(p);
    };
    setPos(50);
    let on = false;
    const fromEvent = (e) => { const r = drag.getBoundingClientRect(); if (r.width) setPos(((e.clientX - r.left) / r.width) * 100); };
    drag.addEventListener('pointerdown', (e) => {
      if (e.target === range) return;
      on = true; drag.classList.add('touched');
      try { drag.setPointerCapture(e.pointerId); } catch (err) {}
      fromEvent(e);
    });
    drag.addEventListener('pointermove', (e) => { if (on) fromEvent(e); });
    ['pointerup', 'pointercancel'].forEach((ev) => drag.addEventListener(ev, () => { on = false; }));
    if (range) range.addEventListener('input', () => { drag.classList.add('touched'); setPos(parseFloat(range.value) || 50); });
  }
}

/* ---------- v176: carrusel de perfiles soñados (20 rubros) ---------- */
const LP_PROFILES = [
  { rubro: 'Cafetería', user: 'cafe.aurora', name: 'Café Aurora ☕', cat: 'Cafetería · Palermo', stats: ['128', '4.812', '96'],
    bio: ['☕ Café de especialidad y brunch', '🥐 Medialunas recién horneadas, todos los días', '📍 Gorriti 4380 · 8 a 20 h'], link: 'cafe-aurora',
    ava: 'ig-cafe.jpg', avaAlt: 'Foto de perfil de Café Aurora',
    hls: [['hl-menu.jpg', 'Menú'], ['hl-promos.jpg', 'Promos'], ['hl-local.jpg', 'El local'], ['hl-clientes.jpg', 'Clientes']],
    cells: ['ig-cafe.jpg', 'g-tazas.jpg', 'g-pasta.jpg', 'g-latte.jpg', 'VIDEO', 'g-platos.jpg', 'g-vaso.jpg', 'g-tres.jpg', 'g-gourmet.jpg'],
    cellAlt: 'Posteo de Instagram de Café Aurora' },
  { rubro: 'Barbería', user: 'elcorte.barberia', name: 'El Corte Barbería 💈', cat: 'Barbería · Caballito', stats: ['96', '3.214', '88'],
    bio: ['💈 Degradé, barba y diseño', '📲 Reservá tu turno desde el link', '📍 Av. Rivadavia 5120 · 10 a 20 h'], link: 'elcorte',
    slug: 'elcorte', hls: ['Cortes', 'Barba', 'El local', 'Clientes'] },
  { rubro: 'Moda', user: 'tiendacora', name: 'Tienda Cora 👕', cat: 'Tienda de ropa · Recoleta', stats: ['210', '6.540', '132'],
    bio: ['👕 Nueva colección cada semana', '🛵 Envíos a todo el país', '📍 Santa Fe 2140 · 10 a 20 h'], link: 'tiendacora',
    slug: 'tiendacora', hls: ['Nuevo', 'Looks', 'El local', 'Clientas'] },
  { rubro: 'Belleza', user: 'estetica.alma', name: 'Estética Alma 💅', cat: 'Centro de estética · Belgrano', stats: ['154', '5.103', '117'],
    bio: ['💅 Uñas, pestañas y cejas', '📲 Turnos por WhatsApp', '📍 Cabildo 2350 · 9 a 19 h'], link: 'estetica-alma',
    slug: 'esteticaalma', hls: ['Uñas', 'Diseños', 'Promos', 'Clientas'] },
  { rubro: 'Gastronomía', user: 'laesquina.resto', name: 'Parrilla La Esquina 🔥', cat: 'Parrilla · San Telmo', stats: ['187', '4.376', '95'],
    bio: ['🔥 Parrilla y cocina criolla', '🍷 Vinos de bodegas chicas', '📍 Defensa 1135 · desde las 20 h'], link: 'laesquina',
    slug: 'laesquina', hls: ['La carta', 'Promos', 'El local', 'Clientes'] },
  { rubro: 'Panadería', user: 'eltrigodorado', name: 'El Trigo Dorado 🥐', cat: 'Panadería · Villa Crespo', stats: ['88', '2.845', '64'],
    bio: ['🥐 Pan de masa madre, todos los días', '🎂 Tortas por encargo', '📍 Malabia 920 · 7:30 a 20 h'], link: 'eltrigodorado',
    slug: 'eltrigodorado', hls: ['Del horno', 'Facturas', 'El local', 'Encargos'] },
  { rubro: 'Pizzería', user: 'donroquepizza', name: 'Pizzería Don Roque 🍕', cat: 'Pizzería · Almagro', stats: ['143', '3.730', '71'],
    bio: ['🍕 Pizza a la piedra en horno de barro', '🛵 Delivery en 30 min', '📍 Corrientes 4020 · 19 a 00 h'], link: 'donroque',
    slug: 'donroque', hls: ['Pizzas', 'Promos', 'El horno', 'Clientes'] },
  { rubro: 'Heladería', user: 'miogelato', name: 'Mío Gelato 🍦', cat: 'Heladería · Núñez', stats: ['76', '1.932', '58'],
    bio: ['🍦 Gelato artesanal, 24 sabores', '🌱 Opciones sin TACC y veganas', '📍 Cabildo 3100 · 12 a 00 h'], link: 'miogelato',
    slug: 'miogelato', hls: ['Sabores', 'Promos', 'El local', 'Clientes'] },
  { rubro: 'Fitness', user: 'gymnorte', name: 'Gym Norte 💪', cat: 'Gimnasio · Belgrano', stats: ['167', '4.508', '143'],
    bio: ['💪 Musculación y clases grupales', '🎟️ Primera clase sin cargo', '📍 Monroe 2620 · 6 a 23 h'], link: 'gymnorte',
    slug: 'gymnorte', hls: ['Clases', 'Profes', 'El gym', 'Alumnos'] },
  { rubro: 'Mascotas', user: 'petshop.huella', name: 'Pet Shop Huella 🐶', cat: 'Pet shop · Villa Crespo', stats: ['129', '3.366', '89'],
    bio: ['🐶 Baño, corte y alimento balanceado', '🚗 Retiro y entrega a domicilio', '📍 Scalabrini Ortiz 780 · 9 a 20 h'], link: 'petshop-huella',
    slug: 'petshop', hls: ['Baños', 'Cortes', 'Productos', 'Clientes'] },
  { rubro: 'Deco', user: 'casalinda.deco', name: 'Casa Linda 🛋️', cat: 'Deco y hogar · Palermo', stats: ['203', '7.214', '156'],
    bio: ['🛋️ Objetos que hacen hogar', '✨ Nuevos ingresos cada semana', '📍 Honduras 4750 · 10 a 19 h'], link: 'casalinda',
    slug: 'casalinda', hls: ['Ambientes', 'Nuevos', 'El showroom', 'Clientes'] },
  { rubro: 'Florería', user: 'elrosedal.flores', name: 'El Rosedal 💐', cat: 'Florería · Recoleta', stats: ['92', '2.410', '66'],
    bio: ['💐 Ramos armados en el día', '🚚 Envíos en el día en CABA', '📍 Junín 1180 · 9 a 20 h'], link: 'elrosedal',
    slug: 'elrosedal', hls: ['Ramos', 'Eventos', 'El local', 'Clientes'] },
  { rubro: 'Cafetería', user: 'cafe.martinez', name: 'Café Martínez ☕', cat: 'Cafetería · Microcentro', stats: ['231', '8.930', '210'],
    bio: ['☕ Café de especialidad al paso', '🥐 Medialunas y tostados', '📍 Florida 340 · 7 a 21 h'], link: 'cafe-martinez',
    slug: 'cafemartinez', hls: ['Menú', 'Promos', 'El local', 'Clientes'] },
  { rubro: 'Gastronomía', user: 'nonnarosa.cocina', name: 'Nonna Rosa 🍝', cat: 'Cocina italiana · Caballito', stats: ['118', '3.054', '77'],
    bio: ['🍝 Pastas caseras, como las de la nonna', '📦 Viandas y pastas para llevar', '📍 Rojas 410 · 12 a 23 h'], link: 'nonnarosa',
    slug: 'nonnarosa', hls: ['Pastas', 'La carta', 'El local', 'Clientes'] },
  { rubro: 'Belleza', user: 'brillo.peluqueria', name: 'Brillo Peluquería ✂️', cat: 'Peluquería · Belgrano', stats: ['176', '5.672', '121'],
    bio: ['✂️ Corte, color y peinados', '💇‍♀️ Diagnóstico capilar sin cargo', '📍 Juramento 2090 · 9 a 20 h'], link: 'brillo',
    slug: 'brillo', hls: ['Cortes', 'Color', 'Peinados', 'Clientas'] },
  { rubro: 'Barbería', user: 'navajaclub', name: 'Navaja Club 🪒', cat: 'Barbería · Palermo', stats: ['84', '2.208', '52'],
    bio: ['🪒 Barbería clásica, ritual completo', '🥃 Tu corte incluye un trago', '📍 Gorriti 5020 · 11 a 21 h'], link: 'navajaclub',
    slug: 'navajaclub', hls: ['Cortes', 'Barba', 'El local', 'Clientes'] },
  { rubro: 'Moda', user: 'elvestidor.moda', name: 'El Vestidor 👗', cat: 'Boutique · Palermo Soho', stats: ['158', '4.940', '98'],
    bio: ['👗 Prendas de autor, talles reales', '🆕 Cápsula nueva cada mes', '📍 Thames 1560 · 11 a 20 h'], link: 'elvestidor',
    slug: 'elvestidor', hls: ['Nuevo', 'Looks', 'El local', 'Clientas'] },
  { rubro: 'Fitness', user: 'box360', name: 'Box 360 🏋️', cat: 'Entrenamiento funcional · Núñez', stats: ['97', '2.765', '83'],
    bio: ['🏋️ Funcional y cross training', '👥 Grupos reducidos, coach en piso', '📍 Libertador 7010 · 7 a 22 h'], link: 'box360',
    slug: 'box360', hls: ['Clases', 'Profes', 'El box', 'Alumnos'] },
  { rubro: 'Mascotas', user: 'patitas.peluqueria', name: 'Patitas 🐾', cat: 'Peluquería canina · Caballito', stats: ['111', '3.502', '74'],
    bio: ['🐾 Baño y corte con turno', '💅 Corte de uñas y limpieza de oídos', '📍 Acoyte 560 · 9 a 19 h'], link: 'patitas',
    slug: 'patitas', hls: ['Baños', 'Cortes', 'Antes y después', 'Clientes'] },
  { rubro: 'Panadería', user: 'laespiga.pasteleria', name: 'La Espiga 🎂', cat: 'Pastelería · Villa Crespo', stats: ['139', '4.127', '69'],
    bio: ['🎂 Pastelería artesanal', '☕ Meriendas y desayunos', '📍 Thames 890 · 8 a 20 h'], link: 'laespiga',
    slug: 'laespiga', hls: ['Tortas', 'Facturas', 'Promos', 'Encargos'] }
];
function lpTiles(p) {
  if (p.cells) return p.cells;
  const out = [];
  for (let k = 1; k <= 9; k++) out.push(`gt-${p.slug}-${k}.jpg`);
  return out;
}
function lpCellsHTML(p, tiles) {
  return tiles.map((t, k) => {
    if (t === 'VIDEO') return `<span class="igp-cell-reel"><video src="showcase-reel-natural.mp4" autoplay muted loop playsinline preload="metadata" aria-label="Reel de Instagram de ${p.name}: barista preparando latte art"></video><span class="igp-reel-badge">▶</span></span>`;
    const img = `<img loading="lazy" src="${t}" alt="Posteo de Instagram de ${p.name}">`;
    if (k === 4 && !p.cells) return `<span class="igp-cell-reel">${img}<span class="igp-reel-badge">▶</span></span>`;
    return img;
  }).join('');
}
/* ---------- Tarjeta compacta de perfil por rubro: cabecera + stats +
   bio corta + grilla 3×3. Nació como pared densa en v208; desde v211 la
   landing la muestra en páginas de 4 con flechas (ver lpWallPagesHTML). */
function lpWallCardHTML(p) {
  const tiles = lpTiles(p);
  const ava = p.ava || tiles[0];
  const avaAlt = p.avaAlt || ('Foto de perfil de ' + p.user);
  return `<div class="lp-wall-card">
    <div class="igp-top"><b>${p.user}</b><span class="igp-top-ics"><svg viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 1 1 12 0v5l1.2 3H4.8L6 16zM10 21a2.2 2.2 0 0 0 4 0"/></svg><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/></svg><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span></div>
    <div class="igp-head">
      <span class="ig-ava ig-ava-lg"><img loading="lazy" src="${ava}" alt="${avaAlt}"></span>
      <div class="igp-stats"><div><b>${p.stats[0]}</b><span>publicaciones</span></div><div><b>${p.stats[1]}</b><span>seguidores</span></div><div><b>${p.stats[2]}</b><span>seguidos</span></div></div>
    </div>
    <div class="igp-bio"><b>${p.name}</b> <span class="igp-cat">${p.cat}</span><br><span class="igp-link">postyhacetodo.com/p/${p.link}</span></div>
    <div class="igp-grid">${lpCellsHTML(p, tiles)}</div>
    <div class="lp-wall-foot">${p.rubro}</div>
  </div>`;
}
/* ---------- v211: la pared pasa a UNA SOLA FILA de 4 con flechas ‹ ›
   (orden de Valentino 20/10: la grilla 4+4 "ocupa demasiado lugar y no
   me gusta"). Páginas de 4 con la mecánica del carrusel de /prueba
   (.ej-*): track que se traslada −100% por página, flechas con .off en
   los extremos y swipe táctil. En pantallas ≤1023px las páginas se
   aplanan (display:contents en CSS) y el track vuelve a ser la tira
   horizontal con scroll-snap de v208: ahí las flechas avanzan de a una
   tarjeta y el estado .off sale del scroll. ---------- */
const LP_WALL_PER = 4;
let LP_WALL_PAGE = 0;
function lpWallPagesHTML() {
  const pages = [];
  for (let i = 0; i < LP_PROFILES.length; i += LP_WALL_PER) {
    pages.push(`<div class="lp-wall-page">${LP_PROFILES.slice(i, i + LP_WALL_PER).map(lpWallCardHTML).join('')}</div>`);
  }
  return pages.join('');
}
function lpWallMobile() { return window.matchMedia('(max-width:1023px)').matches; }
function lpWallSyncArrows() {
  const track = document.getElementById('lpWallTrack');
  const prev = document.getElementById('lpWallPrev');
  const next = document.getElementById('lpWallNext');
  if (!track || !prev || !next) return;
  if (lpWallMobile()) {
    const max = track.scrollWidth - track.clientWidth;
    prev.classList.toggle('off', track.scrollLeft <= 2);
    next.classList.toggle('off', track.scrollLeft >= max - 2);
    return;
  }
  const pages = track.children.length;
  prev.classList.toggle('off', LP_WALL_PAGE <= 0);
  next.classList.toggle('off', LP_WALL_PAGE >= pages - 1);
  const c = document.getElementById('lpWallCount');
  if (c) c.textContent = (LP_WALL_PAGE + 1) + ' / ' + pages;
}
function lpWallSync() {
  const track = document.getElementById('lpWallTrack');
  if (!track) return;
  if (lpWallMobile()) { track.style.transform = ''; lpWallSyncArrows(); return; }
  const pages = track.children.length;
  LP_WALL_PAGE = Math.max(0, Math.min(pages - 1, LP_WALL_PAGE));
  track.style.transform = 'translateX(' + (-LP_WALL_PAGE * 100) + '%)';
  lpWallSyncArrows();
}
function lpWallStep(d) {
  const track = document.getElementById('lpWallTrack');
  if (!track) return;
  if (lpWallMobile()) {
    const card = track.querySelector('.lp-wall-card');
    const w = card ? card.offsetWidth + 10 : track.clientWidth;
    track.scrollBy({ left: d * w, behavior: 'smooth' });
    return;
  }
  LP_WALL_PAGE += d;
  lpWallSync();
}
function lpInitWall() {
  const track = document.getElementById('lpWallTrack');
  if (!track || track.dataset.bound) return;
  track.dataset.bound = '1';
  let tx = null;
  track.addEventListener('touchstart', (e) => { tx = e.changedTouches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx;
    tx = null;
    if (Math.abs(dx) >= 40 && !lpWallMobile()) lpWallStep(dx < 0 ? 1 : -1);
  }, { passive: true });
  let raf = false;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = true;
    requestAnimationFrame(() => { raf = false; lpWallSyncArrows(); });
  }, { passive: true });
  window.addEventListener('resize', lpWallSync);
  lpWallSync();
}
function lpProfileHTML(p) {
  const tiles = lpTiles(p);
  const ava = p.ava || tiles[0];
  const avaAlt = p.avaAlt || ('Foto de perfil de ' + p.user);
  const hlPairs = (p.hls[0] && Array.isArray(p.hls[0])) ? p.hls : p.hls.map((l, k) => [tiles[[1, 2, 4, 6][k]], l]);
  const cells = lpCellsHTML(p, tiles);
  return `<div class="phone igp-phone"><div class="screen"><div class="igp">
    <div class="igp-top"><b>${p.user}</b><span class="igp-top-ics"><svg viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 1 1 12 0v5l1.2 3H4.8L6 16zM10 21a2.2 2.2 0 0 0 4 0"/></svg><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/></svg><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span></div>
    <div class="igp-head">
      <span class="ig-ava ig-ava-lg"><img src="${ava}" alt="${avaAlt}"></span>
      <div class="igp-stats"><div><b>${p.stats[0]}</b><span>publicaciones</span></div><div><b>${p.stats[1]}</b><span>seguidores</span></div><div><b>${p.stats[2]}</b><span>seguidos</span></div></div>
    </div>
    <div class="igp-bio"><b>${p.name}</b><span class="igp-cat">${p.cat}</span><p>${p.bio.join('<br>')}</p><span class="igp-link">postyhacetodo.com/p/${p.link}</span></div>
    <div class="igp-btns"><span class="igp-btn primary">Seguir</span><span class="igp-btn">Mensaje</span></div>
    <div class="igp-hls">${hlPairs.map(([img, l]) => `<div class="igp-hl"><span class="igp-hl-ring"><img loading="lazy" src="${img}" alt="Historia destacada: ${l}"></span><small>${l}</small></div>`).join('')}</div>
    <div class="igp-grid">${cells}</div>
  </div></div></div>`;
}
function lpCarSlidesHTML() {
  return LP_PROFILES.map((p, i) => {
    const near = (i === 0 || i === 1 || i === LP_PROFILES.length - 1);
    return `<div class="lp-slide" data-i="${i}">${near ? lpProfileHTML(p) : '<div class="phone igp-phone lp-slide-ph"><div class="screen"><div class="igp-ph"></div></div></div>'}</div>`;
  }).join('');
}
let LP_CAR_IDX = 0;
function lpCarRender(i) {
  const track = document.getElementById('lpCarTrack');
  if (!track) return;
  const n = LP_PROFILES.length;
  i = ((i % n) + n) % n;
  const slide = track.children[i];
  if (slide && slide.querySelector('.lp-slide-ph')) slide.innerHTML = lpProfileHTML(LP_PROFILES[i]);
}
function lpCarEnsure(i) { lpCarRender(i - 1); lpCarRender(i); lpCarRender(i + 1); }
function lpFillGrid(slide) {
  if (!slide) return;
  const grid = slide.querySelector('.igp-grid');
  if (!grid || grid.dataset.filled) return;
  grid.dataset.filled = '1';
  grid.classList.add('igp-pre');
  requestAnimationFrame(() => requestAnimationFrame(() => grid.classList.add('igp-go')));
}
function lpCarSync() {
  const track = document.getElementById('lpCarTrack');
  if (!track || !track.clientWidth) return;
  const idx = Math.max(0, Math.min(LP_PROFILES.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
  LP_CAR_IDX = idx;
  lpCarEnsure(idx);
  const r = document.getElementById('lpCarRubro');
  const c = document.getElementById('lpCarCount');
  if (r) r.textContent = LP_PROFILES[idx].rubro;
  if (c) c.textContent = (idx + 1) + ' / ' + LP_PROFILES.length;
  lpFillGrid(track.children[idx]);
}
function lpCarStep(d) {
  const track = document.getElementById('lpCarTrack');
  if (!track) return;
  const n = LP_PROFILES.length;
  let next = LP_CAR_IDX + d;
  if (next < 0) next = n - 1;
  if (next >= n) next = 0;
  lpCarEnsure(next);
  track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
}
function lpInitCarousel() {
  const track = document.getElementById('lpCarTrack');
  if (!track || track.dataset.bound) return;
  track.dataset.bound = '1';
  lpCarEnsure(0);
  let raf = false;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = true;
    requestAnimationFrame(() => { raf = false; lpCarSync(); });
  }, { passive: true });
  // Drag con mouse en desktop (el swipe táctil lo da el scroll nativo).
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    drag = { x: e.clientX, sl: track.scrollLeft };
    track.classList.add('dragging');
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
  });
  track.addEventListener('pointermove', (e) => { if (drag) track.scrollLeft = drag.sl - (e.clientX - drag.x); });
  ['pointerup', 'pointercancel'].forEach((ev) => track.addEventListener(ev, () => { drag = null; track.classList.remove('dragging'); }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => { if (en.isIntersecting) { lpFillGrid(track.children[LP_CAR_IDX]); io.disconnect(); } });
    }, { threshold: 0.25 });
    io.observe(track);
  } else lpFillGrid(track.children[0]);
}
/* ---------- v176: auditoría + calculadora ---------- */
function lpGoAudit(e) {
  if (e) e.preventDefault();
  const inp = document.getElementById('lpAuditIg');
  const ig = String((inp && inp.value) || '').replace(/^@/, '').trim().toLowerCase();
  location.href = ig ? '/auditoria?ig=' + encodeURIComponent(ig) : '/auditoria';
  return false;
}
let LP_CALC_RATE = 5000;
function lpCalcRate(btn) {
  LP_CALC_RATE = parseInt(btn.getAttribute('data-rate'), 10) || 5000;
  document.querySelectorAll('.lp-crate').forEach((b) => b.classList.toggle('on', b === btn));
  lpCalcUpdate();
}
function lpCalcUpdate() {
  const inp = document.getElementById('lpCalcH');
  const out = document.getElementById('lpCalcOut');
  if (!inp || !out) return;
  const h = parseInt(inp.value, 10) || 6;
  const hv = document.getElementById('lpCalcHVal');
  if (hv) hv.textContent = h + ' h';
  const fmt = (n) => Math.round(n).toLocaleString('es-AR');
  const horasMes = Math.round(h * 4.33);
  const costo = h * 4.33 * LP_CALC_RATE;
  out.innerHTML = `Tu Instagram hoy te cuesta ≈ <b>$${fmt(costo)}</b> por mes (<b>${horasMes} horas</b> tuyas).<br>Con Posty: desde <b>$1.330 por día</b> y <b>0 horas tuyas</b> — te quedan <b>${horasMes} horas por mes</b> para tu negocio.`;
}

/* ---------- v177: la semana de tu rubro ---------- */
const LP_WEEK_ICONS = '<svg viewBox="0 0 24 24"><path d="M12 20.5C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.6z"/></svg><svg viewBox="0 0 24 24"><path d="M12 4c4.7 0 8.2 3.2 8.2 7.3 0 4.1-3.5 7.3-8.2 7.3-1 0-1.9-.15-2.8-.45L5.6 19.8l.8-3C5 15.3 3.8 13.6 3.8 11.3 3.8 7.2 7.3 4 12 4z"/></svg><svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><svg viewBox="0 0 24 24"><path d="M21 3.5 4 10.6l6.7 2.9L13.6 20z"/><path d="M10.7 13.5 21 3.5"/></svg><span class="ig-save"><svg viewBox="0 0 24 24"><path d="M6.8 3.8h10.4V20L12 16.4 6.8 20z"/></svg></span>';
const LP_WEEK_DAYS = [
  { d: 'Lun', cls: 'lp-day-ok', t: '✓ Publicado · lun 10:32' },
  { d: 'Mar', cls: 'lp-day-ok', t: '✓ Publicado · mar 11:06' },
  { d: 'Mié', cls: 'lp-day-sched', t: '📮 Programado · mié 18:30' },
  { d: 'Jue', cls: 'lp-day-sched', t: '📮 Programado · jue 11:00' },
  { d: 'Vie', cls: 'lp-day-sched', t: '📮 Programado · vie 12:15' }
];
const LP_WEEK = {
  mixto: { ejemplo: 'con negocios de varios rubros', cards: [
    { u: 'cafe.aurora', l: 'C', c: '#FDEBD2', img: 'ig-cafe.jpg', alt: 'Posteo de Instagram de una cafetería hecho por Posty' },
    { u: 'tiendacora', l: 'T', c: '#E4F0FA', img: 'ig-moda.jpg', alt: 'Posteo de Instagram de una tienda de ropa hecho por Posty' },
    { u: 'elcorte.barberia', l: 'E', c: '#E9E4DC', img: 'ig-barber.jpg', alt: 'Posteo de Instagram de una barbería hecho por Posty' },
    { u: 'estetica.alma', l: 'A', c: '#FBE4EC', img: 'ig-belleza.jpg', alt: 'Posteo de Instagram de una estética hecho por Posty' },
    { u: 'petshop.huella', l: 'H', c: '#E2F2E4', img: 'ig-mascotas.jpg', alt: 'Posteo de Instagram de un pet shop hecho por Posty' }
  ] },
  cafeteria: { ejemplo: 'de una cafetería', u: 'cafe.aurora', l: 'C', c: '#FDEBD2', alt: 'Posteo de Instagram de Café Aurora hecho por Posty', imgs: ['ig-cafe.jpg', 'g-tazas.jpg', 'g-latte.jpg', 'g-pasta.jpg', 'g-vaso.jpg'] },
  barberia: { ejemplo: 'de una barbería', u: 'elcorte.barberia', l: 'E', c: '#E9E4DC', alt: 'Posteo de Instagram de El Corte Barbería hecho por Posty', imgs: ['ig-barber.jpg', 'gt-elcorte-2.jpg', 'gt-elcorte-4.jpg', 'gt-elcorte-6.jpg', 'gt-elcorte-8.jpg'] },
  moda: { ejemplo: 'de una tienda de moda', u: 'tiendacora', l: 'T', c: '#E4F0FA', alt: 'Posteo de Instagram de Tienda Cora hecho por Posty', imgs: ['ig-moda.jpg', 'gt-tiendacora-2.jpg', 'gt-tiendacora-4.jpg', 'gt-tiendacora-6.jpg', 'gt-tiendacora-8.jpg'] },
  belleza: { ejemplo: 'de una estética', u: 'estetica.alma', l: 'A', c: '#FBE4EC', alt: 'Posteo de Instagram de Estética Alma hecho por Posty', imgs: ['ig-belleza.jpg', 'gt-esteticaalma-2.jpg', 'gt-esteticaalma-4.jpg', 'gt-esteticaalma-6.jpg', 'gt-esteticaalma-8.jpg'] },
  mascotas: { ejemplo: 'de un pet shop', u: 'petshop.huella', l: 'H', c: '#E2F2E4', alt: 'Posteo de Instagram de Pet Shop Huella hecho por Posty', imgs: ['ig-mascotas.jpg', 'gt-petshop-1.jpg', 'gt-petshop-4.jpg', 'gt-petshop-6.jpg', 'gt-petshop-8.jpg'] },
  fitness: { ejemplo: 'de un gimnasio', u: 'gymnorte', l: 'G', c: '#E6E0F5', alt: 'Posteo de Instagram de Gym Norte hecho por Posty', imgs: ['ig-fitness.jpg', 'gt-gymnorte-2.jpg', 'gt-gymnorte-4.jpg', 'gt-gymnorte-6.jpg', 'gt-gymnorte-8.jpg'] }
};
// v186 — Garantía "nunca la misma foto dos veces en una semana".
// Pools de respaldo por rubro (la foto ig-* del rubro + las gt-* de su set
// del carrusel) y ALIAS de identidad: archivos con nombre distinto que son
// LA MISMA foto (recortes del mismo original; auditoría perceptual en
// test-lp-week.js). Sin alias, el dedupe por nombre no ve el duplicado.
const LP_WEEK_POOLS = {
  cafeteria: ['ig-cafe.jpg', 'g-tazas.jpg', 'g-latte.jpg', 'g-pasta.jpg', 'g-vaso.jpg', 'g-cappu.jpg', 'g-gourmet.jpg', 'g-platos.jpg', 'g-tres.jpg'],
  barberia: ['ig-barber.jpg', 'gt-elcorte-1.jpg', 'gt-elcorte-2.jpg', 'gt-elcorte-3.jpg', 'gt-elcorte-4.jpg', 'gt-elcorte-5.jpg', 'gt-elcorte-6.jpg', 'gt-elcorte-7.jpg', 'gt-elcorte-8.jpg', 'gt-elcorte-9.jpg'],
  moda: ['ig-moda.jpg', 'gt-tiendacora-1.jpg', 'gt-tiendacora-2.jpg', 'gt-tiendacora-3.jpg', 'gt-tiendacora-4.jpg', 'gt-tiendacora-5.jpg', 'gt-tiendacora-6.jpg', 'gt-tiendacora-7.jpg', 'gt-tiendacora-8.jpg', 'gt-tiendacora-9.jpg'],
  belleza: ['ig-belleza.jpg', 'gt-esteticaalma-1.jpg', 'gt-esteticaalma-2.jpg', 'gt-esteticaalma-3.jpg', 'gt-esteticaalma-4.jpg', 'gt-esteticaalma-5.jpg', 'gt-esteticaalma-6.jpg', 'gt-esteticaalma-7.jpg', 'gt-esteticaalma-8.jpg', 'gt-esteticaalma-9.jpg'],
  mascotas: ['ig-mascotas.jpg', 'gt-petshop-1.jpg', 'gt-petshop-2.jpg', 'gt-petshop-3.jpg', 'gt-petshop-4.jpg', 'gt-petshop-5.jpg', 'gt-petshop-6.jpg', 'gt-petshop-7.jpg', 'gt-petshop-8.jpg', 'gt-petshop-9.jpg'],
  fitness: ['ig-fitness.jpg', 'gt-gymnorte-1.jpg', 'gt-gymnorte-2.jpg', 'gt-gymnorte-3.jpg', 'gt-gymnorte-4.jpg', 'gt-gymnorte-5.jpg', 'gt-gymnorte-6.jpg', 'gt-gymnorte-7.jpg', 'gt-gymnorte-8.jpg', 'gt-gymnorte-9.jpg']
};
const LP_WEEK_ALIAS = {
  'gt-petshop-2.jpg': 'ig-mascotas.jpg',
  'gt-tiendacora-3.jpg': 'ig-moda.jpg',
  'gt-elcorte-1.jpg': 'ig-barber.jpg',
  'gt-esteticaalma-3.jpg': 'ig-belleza.jpg',
  'gt-gymnorte-5.jpg': 'ig-fitness.jpg'
};
// Tarjetas de respaldo del modo mixto (rubros que no están en las 5 de base).
const LP_WEEK_EXTRA = [
  { u: 'gymnorte', l: 'G', c: '#E6E0F5', img: 'ig-fitness.jpg', alt: 'Posteo de Instagram de un gimnasio hecho por Posty' },
  { u: 'laesquina.resto', l: 'R', c: '#FDE8D8', img: 'ig-gastro.jpg', alt: 'Posteo de Instagram de un restaurante hecho por Posty' }
];
// Devuelve las 5 tarjetas de una semana SIN fotos repetidas: si una foto
// (o su alias) ya salió, se avanza a la próxima no usada del pool del
// rubro; en mixto se reemplaza la tarjeta entera por una de respaldo.
function lpWeekCards(key) {
  const data = LP_WEEK[key] || LP_WEEK.mixto;
  const canon = (src) => LP_WEEK_ALIAS[src] || src;
  const used = new Set();
  const take = (img, pool) => {
    if (!used.has(canon(img))) { used.add(canon(img)); return img; }
    for (const cand of pool || []) {
      if (!used.has(canon(cand))) { used.add(canon(cand)); return cand; }
    }
    return img; // sin alternativa en el pool: mejor la foto que un hueco
  };
  if (data.cards) {
    return data.cards.map((card) => {
      if (!used.has(canon(card.img))) { used.add(canon(card.img)); return card; }
      const alt = LP_WEEK_EXTRA.find((c) => !used.has(canon(c.img)));
      if (alt) { used.add(canon(alt.img)); return alt; }
      return card;
    });
  }
  const pool = LP_WEEK_POOLS[key] || data.imgs;
  return data.imgs.map((img) => ({ u: data.u, l: data.l, c: data.c, img: take(img, pool), alt: data.alt }));
}
function lpWeekCardHTML(card, day) {
  return `<div class="lp-day"><div class="lp-ig-head"><span class="lp-ig-ava"><i style="background:${card.c}">${card.l}</i></span><b>${card.u}</b><span class="lp-ig-dots">•••</span></div><img loading="lazy" src="${card.img}" alt="${card.alt}"><div class="lp-ig-act">${LP_WEEK_ICONS}</div><div class="lp-day-meta"><b>${day.d}</b><span>Posteo</span></div><div class="${day.cls}">${day.t}</div></div>`;
}
function lpWeekSet(key, btn) {
  const data = LP_WEEK[key] || LP_WEEK.mixto;
  document.querySelectorAll('.lp-wchip').forEach((b) => b.classList.toggle('on', b === btn));
  const grid = document.getElementById('lpWeekGrid');
  const bridge = document.getElementById('lpWeekBridge');
  const apply = () => {
    if (grid) {
      const cards = lpWeekCards(key).map((card, i) => lpWeekCardHTML(card, LP_WEEK_DAYS[i]));
      grid.innerHTML = cards.join('');
      grid.classList.remove('lp-week-swap');
    }
    if (bridge) bridge.innerHTML = `Esto es un ejemplo ${data.ejemplo}. <a href="#" onclick="return lpWeekToForm()">La semana de <b>TU</b> negocio se arma en 1 minuto →</a>`;
  };
  if (grid) { grid.classList.add('lp-week-swap'); setTimeout(apply, 170); } else apply();
}
function lpWeekToForm() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => { const i = document.getElementById('lpIg'); if (i) i.focus({ preventScroll: true }); }, 500);
  return false;
}

/* 🧠 Análisis (2026-10-19): la sección que vende el cerebro. SOLO afirma lo
 * que el sistema construido hace: radiografía con datos reales de su perfil,
 * competencia pública de su rubro/zona, plan de nacimiento sin diagnóstico
 * inventado, y el porqué en cada posteo. */
function lpAnalisisHTML() {
  return `
  <div class="section" id="analisis" style="background:var(--bg2)"><div class="wrap">
    <h2>Posty analiza tu Instagram y tu competencia <span class="hl">antes de escribir una palabra</span></h2>
    <p class="lede">Nada de publicar por publicar. Primero miro tu cuenta y tu mercado, dato por dato — y cada posteo de tu semana nace de algo que vi. En tu prueba ya lo ves: el diagnóstico de tu Instagram viene incluido.</p>
    <div class="lp-cm-cards">
      <div class="lp-cm-card"><div class="lp-cm-i">🔍</div><h3>Tu cuenta, medida</h3><p class="lp-cm-tag">Qué mejorar, qué subir, qué bajar</p><p>Tu ritmo, tus formatos, tus horarios y tus textos, leídos de tu perfil real. Sin humo: cada punto viene con tu número de hoy y con lo que Posty mueve esta semana.</p></div>
      <div class="lp-cm-card"><div class="lp-cm-i">🗺️</div><h3>Tu competencia, en un mapa</h3><p class="lp-cm-tag">Dónde estás parado en tu rubro</p><p>Las cuentas de tu rubro y tu zona: cuánto publican, qué formatos les funcionan y qué huecos dejan. Tu semana se arma para ese mapa, no en el vacío. El mapa completo es parte de Growth.</p></div>
      <div class="lp-cm-card"><div class="lp-cm-i">🌱</div><h3>¿Recién arrancás?</h3><p class="lp-cm-tag">Tu cuenta nace con plan</p><p>Sin historial no hay diagnóstico inventado: tu cuenta nace con posicionamiento, el kit de perfil completo y una primera vidriera de 9 piezas pensada desde tu mercado.</p></div>
    </div>
    <h3 style="text-align:center;margin:36px 0 4px">Así se ve tu análisis 👇</h3>
    <p style="text-align:center;color:var(--mut,#5A7186);font-size:13.5px;margin:0 0 18px">Ejemplo con una cafetería de barrio — el tuyo sale de TU cuenta real, y te llega como una carta de Posty.</p>
    <style>
    .lp-letter{max-width:520px;margin:0 auto;background:#fff;border:1.5px solid #E3EDF4;border-radius:22px;box-shadow:0 12px 40px rgba(10,30,51,.08);padding:22px 20px 18px;text-align:left}
    .lp-letter-head{display:flex;align-items:center;gap:12px}
    .lp-letter-head img{width:54px;height:54px;border-radius:50%;border:2.5px solid #FEC14D;background:#fff}
    .lp-letter-head b{display:block;font-size:19px;font-weight:900;color:#0A1E33}
    .lp-letter-head span{font-size:12.5px;font-weight:700;color:#2793C8}
    .lp-letter-verdict{background:#2793C8;border-radius:16px;padding:14px 16px;margin-top:14px;color:#fff}
    .lp-letter-verdict span{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.1px;opacity:.85}
    .lp-letter-verdict p{font-size:15px;font-weight:800;line-height:1.45;margin:5px 0 0;color:#fff}
    .lp-letter-f{font-size:13.5px;line-height:1.55;color:#33566B;margin:14px 0 0}
    .lp-letter-f b{color:#0A1E33}
    .lp-letter-f span{color:#2793C8;font-weight:700}
    .lp-letter-plan{background:#0A1E33;border-radius:16px;padding:15px 17px;margin-top:14px}
    .lp-letter-plan .lp-lp-t{font-size:14.5px;font-weight:900;color:#fff;margin:0 0 8px}
    .lp-letter-plan p{font-size:13px;line-height:1.55;color:#D7E6EF;margin:6px 0 0}
    .lp-letter-plan p b{color:#FEC14D}
    .lp-letter-banner{background:#FEC14D;color:#0A1E33;border-radius:12px;padding:11px 14px;font-size:13.5px;font-weight:800;text-align:center;margin-top:14px}
    .lp-letter-sign{display:flex;align-items:center;gap:11px;margin-top:16px;padding-top:14px;border-top:2px dashed #C9E2EF}
    .lp-letter-sign img{width:40px;height:40px;border-radius:50%;border:2px solid #FEC14D;background:#fff}
    .lp-letter-sign p{margin:0;line-height:1.15}
    .lp-letter-sign i{font-size:24px;font-weight:900;font-style:italic;color:#0A1E33;letter-spacing:-.5px}
    .lp-letter-sign i b{color:#FEC14D;font-style:italic}
    .lp-letter-sign span{display:block;font-size:10px;font-weight:800;color:#2793C8;text-transform:uppercase;letter-spacing:1.1px;margin-top:1px}
    </style>
    <div class="lp-letter">
      <div class="lp-letter-head"><img src="ai-avatar.png" alt="Posty"><div><b>Tu análisis</b><span>Cafetería de barrio · ejemplo</span></div></div>
      <div class="lp-letter-verdict"><span>Mi veredicto</span><p>“Tenés buen café y buena gente. Hoy tu ritmo es de 2 posteos por semana — y la constancia no depende de tu tiempo: la pongo yo.”</p></div>
      <p class="lp-letter-f">📈 <b>Tu ritmo de publicación tiene mucho para crecer</b> — hoy: 2 posteos por semana.<br><span>→ Con Posty: tu semana completa, armada y programada.</span></p>
      <div class="lp-letter-plan">
        <p class="lp-lp-t">🚀 Mi plan para mejorar todo esto</p>
        <p><b>① Esta semana:</b> tu semana completa, sin un solo hueco — cada posteo programado en tu franja.</p>
        <p><b>② La que viene:</b> tu vidriera queda vendiendo sola — nombre buscable, bio que vende y destacadas completas.</p>
        <p><b>③ De acá en más:</b> te re-mido cada semana y ajusto: lo que funciona, se repite.</p>
      </div>
      <p class="lp-letter-banner">Tenés el negocio. La constancia la pongo yo.</p>
      <div class="lp-letter-sign"><img src="ai-avatar.png" alt="Posty"><p><i>Posty<b>.</b></i><span>Tu community manager</span></p></div>
    </div>
    <p class="lp-cm-close">💡 Y cada posteo te dice su <b>porqué</b>: qué vi, qué decidí y para qué sale. Así de simple.</p>
    <div style="text-align:center"><a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:16px 36px">Ver el análisis de mi cuenta →</a></div>
  </div></div>`;
}
function lpAtencionHTML() {
  return `
  <div class="section" id="atencion" style="background:var(--bg2)"><div class="wrap">
    <p style="text-align:center;margin:0 0 6px"><span style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:12px;letter-spacing:.6px;text-transform:uppercase;padding:6px 14px;border-radius:999px">Exclusivo del plan Total</span></p>
    <h2>Y con Total, Posty también <span class="hl">atiende y vende por vos</span></h2>
    <p class="lede">El posteo trae la consulta. ¿Y después? Si nadie responde rápido, esa venta se enfría. Con Atención al cliente, Posty está atento las 24 horas: prepara cada respuesta al instante — con tus precios reales y tu forma de atender — y vos la aprobás con un toque antes de que salga. Nada se manda sin tu OK.</p>
    <div class="lp-cm-cards">
      <div class="lp-cm-card"><div class="lp-cm-i">💬</div><h3>La respuesta lista al instante, 24/7</h3><p class="lp-cm-tag">Mensajes y comentarios de Instagram</p><p>Tus precios, tus servicios, tus horarios: preparo cada respuesta con los datos reales de tu negocio, en tu tono, y te la dejo lista para aprobar con un toque. Nada de respuestas genéricas ni precios inventados — y nada sale sin tu OK.</p></div>
      <div class="lp-cm-card"><div class="lp-cm-i">📅</div><h3>Agendo y confirmo tus turnos</h3><p class="lp-cm-tag">Tu agenda, siempre con tu OK</p><p>Ofrezco tus horarios libres y dejo la reserva y la confirmación listas para tu toque. Y si alguien cancela, ese lugar se vuelve a ofrecer.</p></div>
      <div class="lp-cm-card"><div class="lp-cm-i">🎯</div><h3>Sigo cada consulta hasta el cierre</h3><p class="lp-cm-tag">Ningún interesado se enfría</p><p>Si alguien preguntó y no cerró, te preparo el seguimiento a tiempo para que salga con tu toque. Cuando está listo para comprar, el cierre va con link de pago o seña — y después de la venta, la reseña de Google también te queda lista para aprobar.</p></div>
    </div>
    <p class="lp-cm-close">🤝 Vos ves todo: cada conversación queda en tu cuenta, nada sale sin tu OK, y lo sensible — quejas, descuentos, plata — te lo derivo a vos. <b>Posty atiende; vos mandás.</b></p>
    <div style="text-align:center"><a class="btn btn-primary" href="#planes" style="font-size:16px;padding:16px 36px">Ver el plan Total →</a></div>
  </div></div>`;
}
/* 🧩 Secciones por capacidad (2026-10-20): cada utilidad de Posty con su
 * PROPIA sección completa — kicker, titular de beneficio, explicación,
 * 3 ✓, MUESTRA real del producto y CTA — estilo Predis, con el sistema
 * visual del sitio. Posteos y Análisis ya tienen su sección completa
 * arriba (#analisis y la semana); acá van las que faltaban: Reels,
 * Historias, Comentarios, Growth, Ideas y Tienda, más el detalle de
 * pieza de Posteos. Solo se afirma lo que el producto hace hoy. */
function lpCapSectionsHTML() {
  return `
  <div class="section" id="capacidades" style="padding-bottom:6px"><div class="wrap">
    <h2>Todo lo que Posty hace, parte por parte</h2>
    <p class="lede">Esto no es "una app para programar posteos". Es el trabajo completo de un community manager — y cada parte tiene su propia herramienta. Miralas una por una:</p>
  </div></div>
  <div class="section cap-sec"><div class="wrap"><div class="cap-grid">
    <div class="cap-copy">
      <div class="cap-kick">Posteos de Instagram</div>
      <h2>Tu semana entera, <span class="hl">publicada sola</span></h2>
      <p class="cap-exp">Posty estudia tu negocio y arma tu semana completa: 7 posteos + 1 reel con tus productos, tus colores y tu protagonista. Se publica a tu mejor hora. Vos solo mirás — y frenás si algo no te cierra.</p>
      <ul class="cap-list">
        <li>De tu producto exacto, nunca genérico</li>
        <li>La línea visual de TU feed, heredada</li>
        <li>Aviso 30 minutos antes de cada posteo</li>
      </ul>
      <a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>
    </div>
    <div class="cap-side">
      <div class="cap-sample">
        <div class="cap-ig-head"><img src="ai-avatar.png" alt="Posty"><b>posty.hacetodo</b><span>•••</span></div>
        <img class="cap-ig-img" loading="lazy" src="lp-pieza.jpg" alt="Pieza real hecha por Posty: el robot celeste saludando, con el titular SOY POSTY.">
        <div class="cap-ig-act"><svg viewBox="0 0 24 24"><path d="M12 20.5C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.6z"/></svg><svg viewBox="0 0 24 24"><path d="M12 4c4.7 0 8.2 3.2 8.2 7.3 0 4.1-3.5 7.3-8.2 7.3-1 0-1.9-.15-2.8-.45L5.6 19.8l.8-3C5 15.3 3.8 13.6 3.8 11.3 3.8 7.2 7.3 4 12 4z"/></svg><svg viewBox="0 0 24 24"><path d="M21 3.5 4 10.6l6.7 2.9L13.6 20z"/><path d="M10.7 13.5 21 3.5"/></svg><svg class="save" viewBox="0 0 24 24"><path d="M6.8 3.8h10.4V20L12 16.4 6.8 20z"/></svg></div>
        <p class="cap-ig-cap"><b>posty.hacetodo</b> ¡Hola! Soy Posty. 👋 Soy tu community manager: analizo tu Instagram a fondo — tu ritmo, tus mejores posteos, tu vidriera y hasta tu competencia — y con ese análisis armo tu plan…</p>
      </div>
      <p class="cap-note">Una pieza real de Posty. Las tuyas salen con TU producto, tus fotos y tus colores.</p>
    </div>
  </div></div></div>
  <div class="section cap-sec tint"><div class="wrap"><div class="cap-grid cap-flip">
    <div class="cap-copy">
      <div class="cap-kick">Reels</div>
      <h2>Reels que muestran tu negocio <span class="hl">en movimiento</span></h2>
      <p class="cap-exp">El video es lo que más gente nueva trae, y es lo que menos tiempo tenés de hacer. Posty arma tus reels con tu material y tu marca, con el gancho primero y el cierre que empuja a escribirte. Salen publicados solos.</p>
      <ul class="cap-list">
        <li>1 por semana en Esencial · 3 en Pro · 5 en Total</li>
        <li>Con tus fotos y videos, o creados desde cero</li>
        <li>Se publican solos, a tu mejor hora</li>
      </ul>
      <a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>
    </div>
    <div class="cap-side">
      <div class="cap-phone">
        <video src="posty-rubros.mp4?v=2" poster="posty-rubros-poster.jpg?v=2" autoplay muted loop playsinline preload="metadata" aria-label="Reel real armado por Posty para un café"></video>
        <span class="cap-ph-chip">🎬 REEL</span>
        <div class="cap-ph-bot"><b>@tu.negocio</b><span>El reel de tu semana, listo y publicado solo.</span><div class="cap-ph-bar"><i></i></div></div>
      </div>
      <p class="cap-note">Video real de Posty trabajando: así sale un reel tuyo.</p>
    </div>
  </div></div></div>
  <div class="section cap-sec"><div class="wrap"><div class="cap-grid">
    <div class="cap-copy">
      <div class="cap-kick">Historias<span class="cap-plan">Plan Pro</span></div>
      <h2>Tu negocio, presente <span class="hl">todos los días</span></h2>
      <p class="cap-exp">Cada posteo sale también como historia, y Posty suma historias que hacen participar a tu audiencia: encuestas, preguntas y cuentas regresivas para tus fechas fuertes. Tu cuenta se mueve todos los días, aunque vos no abras la app.</p>
      <ul class="cap-list">
        <li>Cada posteo, también en historias</li>
        <li>Encuestas y preguntas que hacen participar</li>
        <li>3 por semana en Pro · todos los días en Total</li>
      </ul>
      <a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>
    </div>
    <div class="cap-side">
      <div class="cap-phone">
        <img loading="lazy" src="g-tazas.jpg" alt="Historia de Instagram de una cafetería hecha por Posty">
        <div class="cap-ph-top"><i class="on"></i><i></i><i></i></div>
        <div class="cap-ph-head"><img src="ai-avatar.png" alt="Posty"><span>tu.negocio</span><span style="opacity:.75;font-weight:600">2 h</span></div>
        <div class="cap-ph-bot"><b>Mañana te esperamos desde temprano ☀️</b>
          <div class="cap-poll"><b>📊 ¿A qué hora abrimos?</b><div class="cap-poll-row"><span>A las 8</span><span>68%</span></div><div class="cap-poll-row"><span>A las 9</span><span>32%</span></div></div>
        </div>
      </div>
      <p class="cap-note">Una historia de las que arma Posty: tu posteo, con encuesta incluida.</p>
    </div>
  </div></div></div>
  <div class="section cap-sec tint"><div class="wrap"><div class="cap-grid cap-flip">
    <div class="cap-copy">
      <div class="cap-kick">Comentarios y respuestas<span class="cap-plan">Plan Total</span></div>
      <h2>Ningún comentario queda <span class="hl">sin respuesta</span></h2>
      <p class="cap-exp">Posty lee cada comentario y cada mensaje que te llega, prepara la respuesta en tu tono y te la deja lista. Vos la mandás con un toque. Tu bandeja queda en cero sin vivir pegado al teléfono — y si algo es delicado, te lo pasa a vos.</p>
      <ul class="cap-list">
        <li>Respuestas en tu tono, nunca robóticas</li>
        <li>Nada sale sin tu OK en un toque</li>
        <li>Quejas y temas sensibles, directo a vos</li>
      </ul>
      <a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>
    </div>
    <div class="cap-side">
      <div class="cap-sample"><div class="cap-thread">
        <div class="cap-msg"><div class="cap-ava" style="background:#B08968">M</div><div class="cap-bub"><span class="who">marina.g · comentario en tu posteo</span><br>¿Hacen envíos a Córdoba? ¿Cuánto tarda?</div></div>
        <div class="cap-msg"><div class="cap-ava" style="background:#2793C8">P</div><div class="cap-bub reply"><span class="who">Respuesta de Posty · lista para enviar</span><br>¡Sí, Marina! Enviamos a todo el país 🚚 A Córdoba llega en 2 a 4 días hábiles. ¿Querés que te pase el link del producto?</div></div>
        <div class="cap-sendrow"><span class="cap-send">Enviar ✓</span><span class="cap-alt">Editar</span><span class="cap-tag">Tu tono: amable y directo</span></div>
      </div></div>
      <p class="cap-note">Así te llega cada respuesta: lista, en tu tono, a un toque de salir.</p>
    </div>
  </div></div></div>
  <div class="section cap-sec navy"><div class="wrap"><div class="cap-grid">
    <div class="cap-copy">
      <div class="cap-kick">Growth<span class="cap-plan">Plan Pro</span></div>
      <h2>Lo que funciona, <span class="hl">se potencia</span></h2>
      <p class="cap-exp">Posty detecta el posteo que mejor te está andando y te propone potenciarlo con pauta. Vos fijás el tope de gasto y nada se mueve sin tu OK. Y cada mes elegís un foco de crecimiento: más consultas, más reservas o más ventas.</p>
      <ul class="cap-list">
        <li>Tu mejor posteo, detectado solo</li>
        <li>Pauta con tu tope, siempre con tu OK</li>
        <li>Tu página pública lista, con WhatsApp directo</li>
      </ul>
      <a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>
    </div>
    <div class="cap-side">
      <div class="cap-sample"><div class="cap-grow">
        <div class="cap-grow-best"><img loading="lazy" src="ig-cafe.jpg" alt="Posteo de una cafetería hecho por Posty"><div><h4>Tu posteo que más rindió</h4><div class="cap-grow-metric">▲ El doble de interacciones que tu promedio</div><div class="cap-grow-sub">Hace 3 días · Posteo de producto</div></div></div>
        <div class="cap-prop">🚀 <b>Propuesta de Posty:</b> potenciarlo con <b>$15.000</b> por 5 días (tu tope: $20.000). Llega a gente de tu zona que todavía no te sigue.</div>
        <div class="cap-sendrow"><span class="cap-send">Potenciar ✓</span><span class="cap-alt">Ahora no</span></div>
      </div></div>
      <p class="cap-note">La propuesta llega sola cuando un posteo la rompe. Vos decidís.</p>
    </div>
  </div></div></div>
  <div class="section cap-sec"><div class="wrap"><div class="cap-grid cap-flip">
    <div class="cap-copy">
      <div class="cap-kick">Ideas semanales</div>
      <h2>Nunca te quedás <span class="hl">sin qué publicar</span></h2>
      <p class="cap-exp">Cada semana Posty mira tu competencia, el posteo que mejor te anduvo y las fechas que se vienen — y te propone ideas concretas para tu negocio. La que te gusta se convierte en posteo con un toque.</p>
      <ul class="cap-list">
        <li>Desde tu competencia, tus ganadores y el calendario</li>
        <li>Un toque en "Hacelo" y la idea se vuelve posteo</li>
        <li>Sin relleno: si no hay nada concreto, no te molesta</li>
      </ul>
      <a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>
    </div>
    <div class="cap-side">
      <div class="cap-sample cap-idea-wrap">
        <div class="idea-card">
          <div class="idea-top"><span class="idea-fmt">📸 Posteo</span></div>
          <div class="idea-title">El paso a paso de tu producto estrella</div>
          <div class="idea-why">Tu competencia lo publicó el martes y le rindió el doble que su promedio. Tu versión sale con tu producto, tus fotos y tus colores.</div>
          <div class="idea-actions">
            <span class="btn btn-primary btn-sm">💪 Hacelo</span>
            <span class="btn btn-ghost btn-sm">Ahora no</span>
          </div>
        </div>
      </div>
      <p class="cap-note">Así te llegan las ideas cada semana, listas para aprobar.</p>
    </div>
  </div></div></div>
  <div class="section cap-sec tint"><div class="wrap"><div class="cap-grid">
    <div class="cap-copy">
      <div class="cap-kick">Posty conectado · Nuevo</div>
      <h2>Tu tienda le habla <span class="hl">a tu Instagram</span></h2>
      <p class="cap-exp">Conectás tu Tiendanube en un toque y Posty pasa a postear lo que tu negocio tiene de verdad: tu producto estrella deja de ser el de más likes y pasa a ser el que más vende. Y lo que está sin stock, no se promociona jamás.</p>
      <ul class="cap-list">
        <li>Estrella por ventas reales, no por likes</li>
        <li>Sin stock = fuera de los posteos, automático</li>
        <li>Los productos quietos se empujan a propósito</li>
      </ul>
      <a class="cap-cta" href="/prueba">Probá gratis 3 días →</a>
    </div>
    <div class="cap-side">
      <div class="cap-sample"><div class="cap-shop">
        <div class="row"><span>🛍️</span><span><b>Tu tienda, conectada</b></span><span class="pill">Tiendanube ✓</span></div>
        <div class="row"><span>⭐</span><span>Estrella por ventas: <b>Campera Urbana</b> (38 ventas en 30 días)</span></div>
        <div class="row"><span>🚫</span><span>Remera Logo — sin stock</span><span class="pill out">Fuera de los posteos</span></div>
        <div class="row"><span>💤</span><span>Buzo Oversize — quieto hace 26 días</span><span class="pill warn">Se empuja esta semana</span></div>
      </div></div>
      <p class="cap-note">Tu tienda real, conectada en un toque desde Ajustes.</p>
    </div>
  </div></div></div>`;
}

/* 📋 Grilla resumen (2026-10-20): las 12 cosas que Posty hace, como cierre
 * del tour de capacidades, justo antes de planes. Espeja la grilla de
 * /prueba ("Todo lo que Posty hace por vos"). */
function lpRecapHTML() {
  const items = [
    ['🎨', 'Diseña tu semana', 'Posteos, reels e historias con tu marca: tus fotos, tus colores y tu producto exacto. Nada de plantillas iguales para todos.'],
    ['✍️', 'Escribe para vender', 'Captions y hashtags en tu tono, pensados para que te compren, no para rellenar.'],
    ['⏰', 'Publica solo', 'A la mejor hora, todos los días. Te avisa 30 minutos antes por si querés frenar algo.'],
    ['🔍', 'Estudia tu negocio', 'Lee tu Instagram y tu rubro: qué vende, qué está funcionando y qué hace tu competencia.'],
    ['📆', 'Caza las fechas que venden', 'Día de la Madre, Hot Sale, Navidad: tu semana se adapta sola, sin que te acuerdes vos.'],
    ['💡', 'Te propone ideas', 'Cada semana, ideas nuevas para tu negocio, listas para aprobar con un toque.'],
    ['💬', 'Responde tus comentarios', 'La respuesta lista en tu tono; la mandás con un toque. Nada sale sin tu OK.'],
    ['📩', 'Responde tus mensajes', 'Tu bandeja de Instagram, en cero.'],
    ['⭐', 'Cuida tus reseñas', 'Contesta tus reseñas de Google por vos.'],
    ['🚀', 'Potencia lo que anda', 'Detecta el posteo que la rompe y te propone impulsarlo con pauta. Vos fijás el tope de gasto.'],
    ['🌐', 'Tu página, lista para compartir', 'Una página pública de tu negocio con botón de WhatsApp directo a vos.'],
    ['🤚', 'Vos mandás', 'Frenás cualquier posteo con un toque, pedís cambios en el chat como si hablaras con tu CM, o aprobás todo a mano si preferís.'],
  ];
  return `
  <div class="section lp-recap"><div class="wrap">
    <h2>Todo esto, en un solo Posty</h2>
    <p class="lede">El trabajo completo de un community manager, en un solo lugar.</p>
    <div class="lp-recap-grid">${items.map((it) => `<div class="lp-recap-item"><div class="he">${it[0]}</div><div><b>${it[1]}</b><p>${it[2]}</p></div></div>`).join('')}</div>
    <p class="lp-recap-foot">Y cada semana te llega el resumen: qué funcionó, qué sigue y el foco del mes.</p>
    <div style="text-align:center;margin-top:22px"><a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:16px 36px">Probá gratis 3 días</a></div>
  </div></div>`;
}

function landingView(cfg) {
  const plans = (cfg && cfg.plans) || [];
  const country = (cfg && cfg.country) || 'AR';
  PLANS_COUNTRY = country;
  const planCards = planCardsHTML(plans);
  return `
  ${pzRefBandHTML()}
  <div class="nav nav-landing"><div class="wrap">
    <a class="logo logo-posty" href="#/"><img src="ai-avatar.png" alt="posty.">posty<span class="pdot">.</span></a>
    <div class="nav-links">
      <a href="#analisis">Análisis</a>
      <a href="#capacidades">Todo lo que hace</a>
      <a href="#como-funciona">Cómo funciona</a>
      <a href="#ejemplos">Ejemplos</a>
      <a href="#planes">Planes</a>
      <a href="#faq">Preguntas</a>
      <a data-posty-chat role="button" tabindex="0" style="cursor:pointer">Ayuda</a>
      <a href="#/login">Entrar</a>
      <a class="btn btn-primary btn-sm" href="/prueba">Probar gratis</a>
    </div>
    <a class="lp-entrar" href="#/login">Entrar</a>
    <button class="hamburger" onclick="toggleMobileMenu()" aria-label="Abrir menú"><span></span><span></span><span></span></button>
  </div>
  <div class="mobile-menu" id="mobileMenu">
    <a href="#analisis">Análisis</a>
    <a href="#capacidades">Todo lo que hace</a>
    <a href="#como-funciona">Cómo funciona</a>
    <a href="#ejemplos">Ejemplos</a>
    <a href="#planes">Planes</a>
    <a href="#faq">Preguntas</a>
    <a data-posty-chat role="button" tabindex="0" style="cursor:pointer" onclick="toggleMobileMenu()">Ayuda</a>
    <a href="#/login">Entrar</a>
    <a class="btn btn-primary btn-block" href="/prueba">Probar gratis</a>
  </div></div>
  <div class="hero"><div class="wrap">
    <img class="hero-posty" src="ai-avatar.png" alt="Posty, tu community manager">
    <div class="pill">🤖 Tu community manager</div>
    <h1>Tu Instagram trabajando<br><span class="hl">todos los días, con un solo clic</span></h1>
    <p class="sub">Posty crea las ideas, los diseños y los textos con <b>tu marca</b> — y los publica solo. Posteos, reels, historias, comentarios, mensajes y pauta — todo tu Instagram, hecho por Posty. Vos no hacés nada: solo frenás si algo no te cierra.</p>
    <form class="lp-igform" onsubmit="return lpGoTrial(event)">
      <input id="lpIg" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@tu_negocio" aria-label="Tu Instagram">
      <button class="btn btn-primary" type="submit">Ver mi semana →</button>
    </form>
    <p class="lp-igform-note">Pegá tu Instagram y mirá <b>tu</b> semana real, con tu marca 👆</p>
    <div class="hero-note">✓ Sin tarjeta · ✓ 3 días gratis · ✓ Cancelá cuando quieras</div>
    <p class="lp-spots" data-spots hidden></p>
    <div class="lp-show" id="ejemplos">
      <p class="lp-show-eyebrow">✨ Así queda tu Instagram con Posty</p>
      <div class="lp-wall" id="lpWall">
        <button type="button" class="lp-wall-nav prev off" id="lpWallPrev" aria-label="Perfiles anteriores" onclick="lpWallStep(-1)">‹</button>
        <div class="lp-wall-viewport" id="lpWallViewport">
          <div class="lp-wall-track" id="lpWallTrack">${lpWallPagesHTML()}</div>
        </div>
        <button type="button" class="lp-wall-nav next" id="lpWallNext" aria-label="Perfiles siguientes" onclick="lpWallStep(1)">›</button>
      </div>
      <div class="lp-wall-meta"><span class="lp-wall-note">20 rubros · perfiles armados por Posty</span><span class="lp-wall-count" id="lpWallCount">1 / 5</span></div>
      <div class="lp-show-cta">
        <p class="lp-show-bridge">Este es un ejemplo. <b>El tuyo</b> se arma en 1 minuto 👇</p>
        <form class="lp-igform lp-show-form" onsubmit="var v=this.querySelector('input').value.replace('@','').trim().toLowerCase();location.href=v?'/prueba?ig='+encodeURIComponent(v):'/prueba';return false">
          <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@tu_negocio" aria-label="Tu Instagram">
          <button class="btn btn-primary" type="submit">Quiero mi perfil así →</button>
        </form>
        <p class="lp-show-cert">3 días gratis · sin tarjeta · cancelás cuando querés</p>
        <p class="lp-spots" data-spots hidden></p>
      </div>
      <div class="lp-live" id="lpLive">
        <div class="lp-live-head"><span class="lp-live-dot"></span><b>Posty trabajando</b><span>así trabaja por este negocio, todos los días</span></div>
        <div class="lp-live-line" id="lpLiveLine"></div>
      </div>
    </div>
    <div class="pz-beforeafter">
      <h3>La diferencia se ve en una semana</h3>
      <div class="pz-drag" id="pzDrag">
        <div class="pz-drag-layer">
          <div class="pz-ba-prof"><span class="pz-ba-ava"><img src="ig-cafe.jpg" alt=""></span><span class="pz-ba-who"><b>cafe.aurora</b><small>Cafetería · Palermo</small></span></div>
          <p class="pz-ba-bio">☕ Café de especialidad y brunch<br>📍 Gorriti 4380 · 8 a 20 h</p>
          <div class="pz-ba-grid pz-ba-grid-live"><img src="ig-cafe.jpg" alt=""><img loading="lazy" src="g-tazas.jpg" alt=""><img loading="lazy" src="g-pasta.jpg" alt=""><img loading="lazy" src="g-latte.jpg" alt=""><img loading="lazy" src="g-cappu.jpg" alt=""><img loading="lazy" src="g-platos.jpg" alt=""><img loading="lazy" src="g-vaso.jpg" alt=""><img loading="lazy" src="g-tres.jpg" alt=""><img loading="lazy" src="g-gourmet.jpg" alt=""></div>
          <p class="pz-ba-last pz-ba-last-on">🔥 Publicando esta semana</p>
        </div>
        <div class="pz-drag-layer pz-drag-hoy pz-ba-dead" aria-hidden="true">
          <div class="pz-ba-prof"><span class="pz-ba-ava">C</span><span class="pz-ba-who"><b>cafe.aurora</b><small>Cafetería · Palermo</small></span></div>
          <p class="pz-ba-bio">Café ☕</p>
          <div class="pz-ba-grid"><span class="pz-ba-dull"><img src="ig-cafe.jpg" alt=""></span><span></span><span></span><span></span><span class="pz-ba-dull"><img loading="lazy" src="g-vaso.jpg" alt=""></span><span></span><span></span><span></span><span class="pz-ba-dull"><img loading="lazy" src="g-tres.jpg" alt=""></span></div>
          <p class="pz-ba-last">⏸ Última publicación: hace 6 semanas</p>
        </div>
        <span class="pz-tag pz-tag-hoy">HOY</span>
        <span class="pz-tag pz-tag-on">CON POSTY</span>
        <div class="pz-drag-bar"><span class="pz-drag-knob">⇄</span></div>
        <input class="pz-drag-range" id="pzDragRange" type="range" min="4" max="96" step="1" value="50" aria-label="Comparar el perfil: arrastrá para ver tu Instagram hoy, a la izquierda, y con Posty, a la derecha">
      </div>
      <p class="pz-drag-hint">👆 Arrastrá la línea: así cambia un perfil cuando Posty se pone a trabajar</p>
    </div>
    <div class="hero-co">Posty es un producto de <b>Posta</b> · Hecho en Argentina 🇦🇷 · Publicamos con la API oficial de Meta · Nunca te pedimos tu contraseña</div>
  </div></div>
  ${lpAnalisisHTML()}
  <div class="section lp-week-sec"><div class="wrap">
    <div class="lp-week" aria-label="Ejemplo de una semana armada por Posty">
      <div class="lp-week-head"><span class="lp-week-title">📅 Tu semana de Instagram en Posty</span><span class="lp-week-badge">Se publica sola ✨</span></div>
      <div class="lp-wchips" role="group" aria-label="Ver la semana de un rubro">
        <button type="button" class="lp-wchip on" onclick="lpWeekSet('mixto', this)">⭐ Ejemplo mixto</button>
        <button type="button" class="lp-wchip" onclick="lpWeekSet('cafeteria', this)">☕ Cafetería</button>
        <button type="button" class="lp-wchip" onclick="lpWeekSet('barberia', this)">💈 Barbería</button>
        <button type="button" class="lp-wchip" onclick="lpWeekSet('moda', this)">👕 Moda</button>
        <button type="button" class="lp-wchip" onclick="lpWeekSet('belleza', this)">💅 Belleza</button>
        <button type="button" class="lp-wchip" onclick="lpWeekSet('mascotas', this)">🐶 Mascotas</button>
        <button type="button" class="lp-wchip" onclick="lpWeekSet('fitness', this)">🏋️ Fitness</button>
      </div>
      <div class="lp-week-grid" id="lpWeekGrid">
        <div class="lp-day"><div class="lp-ig-head"><span class="lp-ig-ava"><i style="background:#FDEBD2">C</i></span><b>cafe.aurora</b><span class="lp-ig-dots">•••</span></div><img loading="lazy" src="ig-cafe.jpg" alt="Posteo de Instagram de una cafetería hecho por Posty"><div class="lp-ig-act"><svg viewBox="0 0 24 24"><path d="M12 20.5C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.6z"/></svg><svg viewBox="0 0 24 24"><path d="M12 4c4.7 0 8.2 3.2 8.2 7.3 0 4.1-3.5 7.3-8.2 7.3-1 0-1.9-.15-2.8-.45L5.6 19.8l.8-3C5 15.3 3.8 13.6 3.8 11.3 3.8 7.2 7.3 4 12 4z"/></svg><svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><svg viewBox="0 0 24 24"><path d="M21 3.5 4 10.6l6.7 2.9L13.6 20z"/><path d="M10.7 13.5 21 3.5"/></svg><span class="ig-save"><svg viewBox="0 0 24 24"><path d="M6.8 3.8h10.4V20L12 16.4 6.8 20z"/></svg></span></div><div class="lp-day-meta"><b>Lun</b><span>Posteo</span></div><div class="lp-day-ok">✓ Publicado · lun 10:32</div></div>
        <div class="lp-day"><div class="lp-ig-head"><span class="lp-ig-ava"><i style="background:#E4F0FA">T</i></span><b>tiendacora</b><span class="lp-ig-dots">•••</span></div><img loading="lazy" src="ig-moda.jpg" alt="Posteo de Instagram de una tienda de ropa hecho por Posty"><div class="lp-ig-act"><svg viewBox="0 0 24 24"><path d="M12 20.5C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.6z"/></svg><svg viewBox="0 0 24 24"><path d="M12 4c4.7 0 8.2 3.2 8.2 7.3 0 4.1-3.5 7.3-8.2 7.3-1 0-1.9-.15-2.8-.45L5.6 19.8l.8-3C5 15.3 3.8 13.6 3.8 11.3 3.8 7.2 7.3 4 12 4z"/></svg><svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><svg viewBox="0 0 24 24"><path d="M21 3.5 4 10.6l6.7 2.9L13.6 20z"/><path d="M10.7 13.5 21 3.5"/></svg><span class="ig-save"><svg viewBox="0 0 24 24"><path d="M6.8 3.8h10.4V20L12 16.4 6.8 20z"/></svg></span></div><div class="lp-day-meta"><b>Mar</b><span>Posteo</span></div><div class="lp-day-ok">✓ Publicado · mar 11:06</div></div>
        <div class="lp-day"><div class="lp-ig-head"><span class="lp-ig-ava"><i style="background:#E9E4DC">E</i></span><b>elcorte.barberia</b><span class="lp-ig-dots">•••</span></div><img loading="lazy" src="ig-barber.jpg" alt="Posteo de Instagram de una barbería hecho por Posty"><div class="lp-ig-act"><svg viewBox="0 0 24 24"><path d="M12 20.5C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.6z"/></svg><svg viewBox="0 0 24 24"><path d="M12 4c4.7 0 8.2 3.2 8.2 7.3 0 4.1-3.5 7.3-8.2 7.3-1 0-1.9-.15-2.8-.45L5.6 19.8l.8-3C5 15.3 3.8 13.6 3.8 11.3 3.8 7.2 7.3 4 12 4z"/></svg><svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><svg viewBox="0 0 24 24"><path d="M21 3.5 4 10.6l6.7 2.9L13.6 20z"/><path d="M10.7 13.5 21 3.5"/></svg><span class="ig-save"><svg viewBox="0 0 24 24"><path d="M6.8 3.8h10.4V20L12 16.4 6.8 20z"/></svg></span></div><div class="lp-day-meta"><b>Mié</b><span>Posteo</span></div><div class="lp-day-sched">📮 Programado · mié 18:30</div></div>
        <div class="lp-day"><div class="lp-ig-head"><span class="lp-ig-ava"><i style="background:#FBE4EC">A</i></span><b>estetica.alma</b><span class="lp-ig-dots">•••</span></div><img loading="lazy" src="ig-belleza.jpg" alt="Posteo de Instagram de una estética hecho por Posty"><div class="lp-ig-act"><svg viewBox="0 0 24 24"><path d="M12 20.5C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.6z"/></svg><svg viewBox="0 0 24 24"><path d="M12 4c4.7 0 8.2 3.2 8.2 7.3 0 4.1-3.5 7.3-8.2 7.3-1 0-1.9-.15-2.8-.45L5.6 19.8l.8-3C5 15.3 3.8 13.6 3.8 11.3 3.8 7.2 7.3 4 12 4z"/></svg><svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><svg viewBox="0 0 24 24"><path d="M21 3.5 4 10.6l6.7 2.9L13.6 20z"/><path d="M10.7 13.5 21 3.5"/></svg><span class="ig-save"><svg viewBox="0 0 24 24"><path d="M6.8 3.8h10.4V20L12 16.4 6.8 20z"/></svg></span></div><div class="lp-day-meta"><b>Jue</b><span>Posteo</span></div><div class="lp-day-sched">📮 Programado · jue 11:00</div></div>
        <div class="lp-day"><div class="lp-ig-head"><span class="lp-ig-ava"><i style="background:#E2F2E4">H</i></span><b>petshop.huella</b><span class="lp-ig-dots">•••</span></div><img loading="lazy" src="ig-mascotas.jpg" alt="Posteo de Instagram de un pet shop hecho por Posty"><div class="lp-ig-act"><svg viewBox="0 0 24 24"><path d="M12 20.5C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.6z"/></svg><svg viewBox="0 0 24 24"><path d="M12 4c4.7 0 8.2 3.2 8.2 7.3 0 4.1-3.5 7.3-8.2 7.3-1 0-1.9-.15-2.8-.45L5.6 19.8l.8-3C5 15.3 3.8 13.6 3.8 11.3 3.8 7.2 7.3 4 12 4z"/></svg><svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><svg viewBox="0 0 24 24"><path d="M21 3.5 4 10.6l6.7 2.9L13.6 20z"/><path d="M10.7 13.5 21 3.5"/></svg><span class="ig-save"><svg viewBox="0 0 24 24"><path d="M6.8 3.8h10.4V20L12 16.4 6.8 20z"/></svg></span></div><div class="lp-day-meta"><b>Vie</b><span>Posteo</span></div><div class="lp-day-sched">📮 Programado · vie 12:15</div></div>
      </div>
      <p class="lp-week-note">Así se ve tu semana: ideas, diseños y textos con tu marca, que se publican solos en los mejores horarios.</p>
      <p class="lp-week-bridge" id="lpWeekBridge">Esto es un ejemplo con negocios de varios rubros. <a href="#" onclick="return lpWeekToForm()">La semana de <b>TU</b> negocio se arma en 1 minuto →</a></p>
    </div>
  </div></div>
  <div class="section" id="como-funciona"><div class="wrap">
    <h2>Así trabajo yo 👇</h2>
    <p class="lede">Vos seguí atendiendo tu negocio. Del resto me ocupo yo.</p>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Me contás tu negocio una vez</h3><p>Qué vendés, tu estilo, tus fotos. Te lleva 2 minutos y no te pido más nada.</p></div>
      <div class="step"><div class="num">2</div><h3>Yo creo todo por vos</h3><p>Pienso las ideas, diseño con tus fotos y tu marca, y escribo los captions y hashtags que venden.</p></div>
      <div class="step"><div class="num">3</div><h3>Se publica solo</h3><p>Tu semana sale en los mejores horarios sin que toques nada. ¿Algo no te cierra? Lo frenás en un toque.</p></div>
    </div>
    <p class="lp-steptotal">⏱️ Tu tiempo total: <b>2 minutos</b> para contarnos de tu negocio. Publicar: 0 minutos — sale solo.</p>
    <div style="text-align:center;margin-top:28px"><a class="btn btn-primary" href="/prueba">Empezar mi prueba gratis</a></div>
  </div></div>
  <div class="section" id="cm"><div class="wrap">
    <h2>Un community manager hace mucho más que publicar</h2>
    <p class="lede">Un Instagram que vende no se mantiene solo: hay que publicar seguido, conversar con la gente, responder todo y promocionar lo que funciona. Eso es lo que hace un community manager. Y cobra <b>$300.000 o más por mes</b>. <b>Posty hace ese mismo trabajo, todos los días.</b></p>
    <div class="lp-cm-cards">
      <div class="lp-cm-card"><div class="lp-cm-i">💬</div><h3>Comunidad</h3><p class="lp-cm-tag">Que nadie quede sin respuesta</p><p>Responde comentarios y mensajes (con tu OK en un toque), contesta tus reseñas de Google, y arma historias que hacen participar a tu audiencia: encuestas, preguntas y cuentas regresivas. Una comunidad se construye conversando, no solo publicando.</p></div>
      <div class="lp-cm-card"><div class="lp-cm-i">📈</div><h3>Crecimiento</h3><p class="lp-cm-tag">Que te descubra gente nueva</p><p>Detecta tus posteos que mejor andan y los potencia con pauta (vos fijás el tope), te da tu página pública lista para compartir con botón de WhatsApp, y cada mes trabaja con un foco de crecimiento que vos elegís.</p></div>
      <div class="lp-cm-card"><div class="lp-cm-i">🛒</div><h3>Ventas</h3><p class="lp-cm-tag">Que el seguidor se vuelva cliente</p><p>Posteos pensados para vender: tu producto, tus promos. Te avisa ANTES de cada fecha que vende (Día de la Madre, Hot Sale, Navidad…) para llegar listo, y cada perfil termina en un toque: WhatsApp directo a tu negocio.</p></div>
    </div>
    <div class="lp-cm-cmp" role="table" aria-label="Comparación entre un community manager tradicional y Posty">
      <div class="lp-cm-row lp-cm-head" role="row"><div>El trabajo</div><div>Community manager</div><div class="win">Posty</div></div>
      <div class="lp-cm-row" role="row"><div class="crit">Publica posteos, reels e historias</div><div>✓</div><div class="win">✓</div></div>
      <div class="lp-cm-row" role="row"><div class="crit">Responde comentarios y mensajes</div><div>✓</div><div class="win">✓</div></div>
      <div class="lp-cm-row" role="row"><div class="crit">Cuida tus reseñas</div><div>✓</div><div class="win">✓</div></div>
      <div class="lp-cm-row" role="row"><div class="crit">Potencia lo que anda con pauta</div><div>✓</div><div class="win">✓</div></div>
      <div class="lp-cm-row" role="row"><div class="crit">Piensa el foco de cada mes</div><div>✓</div><div class="win">✓</div></div>
      <div class="lp-cm-row" role="row"><div class="crit">Está disponible</div><div>En su horario</div><div class="win">Todos los días, a toda hora</div></div>
      <div class="lp-cm-row" role="row"><div class="crit">Cuesta</div><div>$300.000+ por mes</div><div class="win">Desde $1.330 por día</div></div>
    </div>
    <p class="lp-cm-close">El mismo trabajo. Sin sueldos, sin cargas sociales, sin vacaciones.</p>
    <div style="text-align:center"><a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:16px 36px">Quiero mi community manager →</a></div>
  </div></div>
  <div class="section lp-work" id="trabajando"><div class="wrap">
    <h2>Así trabaja Posty, todos los días</h2>
    <p class="lede">Esto pasa en tu cuenta mientras vos atendés tu negocio.</p>
    <div class="lp-work-flex">
      <div class="lp-work-vid"><video src="posty-rubros.mp4?v=2" poster="posty-rubros-poster.jpg?v=2" autoplay muted loop playsinline preload="metadata" aria-label="Video real de Posty trabajando: arma un posteo y un reel para un café"></video></div>
      <ul class="lp-work-list">
        <li>🎨 <b>Arma tus posteos</b> con tus fotos, tus colores y tu tono.</li>
        <li>🎬 <b>Crea tus reels</b> y los deja listos para publicarse solos.</li>
        <li>📮 <b>Publica a la mejor hora</b> — y te avisa antes, por si querés frenar algo.</li>
      </ul>
    </div>
  </div></div>
  <div class="section" id="trabajo"><div class="wrap">
    <h2>Así trabaja Posty por vos</h2>
    <p class="lede">Comunidad, crecimiento y ventas no pasan por arte de magia: pasan por hacer estas 9 cosas todas las semanas. Las hace Posty.</p>
    <div class="lp-jobs">
      <div class="lp-job"><div class="lp-job-i">🔍</div><h3>Estudia tu rubro</h3><p>Mira qué funciona en negocios como el tuyo y arma ideas para vender, no para rellenar.</p></div>
      <div class="lp-job"><div class="lp-job-i">📅</div><h3>Caza las fechas que venden</h3><p>Día de la Madre, Navidad, el día de tu rubro: tu semana se adapta sola a lo que la gente está comprando.</p></div>
      <div class="lp-job"><div class="lp-job-i">🎨</div><h3>Diseña con tu marca</h3><p>Tus fotos, tus colores y tu logo en cada pieza. Nada de plantillas iguales para todos.</p></div>
      <div class="lp-job"><div class="lp-job-i">✍️</div><h3>Escribe como tu negocio</h3><p>Textos en rioplatense, con tu tono y cero errores. Como si los hubieras escrito vos.</p></div>
      <div class="lp-job"><div class="lp-job-i">⏰</div><h3>Publica a la mejor hora</h3><p>Cada posteo sale cuando tu audiencia está mirando. Y te avisa antes, por si querés frenarlo. Y cada posteo sale también como historia.</p></div>
      <div class="lp-job"><div class="lp-job-i">🧠</div><h3>Aprende de tus gustos</h3><p>Lo que te encanta se repite; lo que no, no vuelve. Cada semana se parece más a vos. Y una vez por semana te pregunta lo justo para conocer tu negocio como un empleado: tu producto estrella, tus promos y qué no publicar jamás.</p></div>
      <div class="lp-job"><div class="lp-job-i">💬</div><h3>Responde tus comentarios</h3><p>Posty lee cada comentario que te dejan, prepara la respuesta en tu tono y la mandás con un toque. Nada sale sin tu OK.</p></div>
      <div class="lp-job"><div class="lp-job-i">📩</div><h3>Responde tus mensajes</h3><p>Los mensajes de Instagram, igual: la respuesta llega lista y la mandás con un toque. Tu bandeja, en cero.</p></div>
      <div class="lp-job"><div class="lp-job-i">🚀</div><h3>Potencia lo que mejor anda</h3><p>Cuando un posteo la rompe, Posty lo detecta y te propone potenciarlo con pauta. Vos fijás el tope de gasto.</p></div>
      <div class="lp-job"><div class="lp-job-i">💡</div><h3>Ideas nuevas cada semana</h3><p>Posty mira a tu competencia, las fechas que venden y tu posteo que mejor anduvo — y te propone ideas listas para aprobar con un toque.</p></div>
      <div class="lp-job"><div class="lp-job-i">📊</div><h3>Tu resumen, cada semana</h3><p>Qué posteos funcionaron, qué sigue y el foco del mes — te llega solo, sin que tengas que pedirlo.</p></div>
      <div class="lp-job" style="padding:0;overflow:hidden"><video src="posty-working.mp4?v=3" poster="posty-working-poster.jpg?v=3" autoplay muted loop playsinline preload="metadata" aria-label="Posty trabajando en la computadora" style="width:100%;height:100%;object-fit:cover;object-position:center 32%;display:block"></video></div>
    </div>
    <div style="text-align:center;margin-top:30px"><a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:16px 36px">Probá gratis 3 días</a></div>
  </div></div>
  ${lpCapSectionsHTML()}
  <div class="section" id="diferencia" style="background:var(--bg2)"><div class="wrap" style="max-width:860px">
    <h2>El único que hace todo por vos</h2>
    <p class="lede">Las apps para programar te dan más trabajo. Los community managers salen $300.000+ por mes. Las agencias te venden reuniones. Yo te entrego la semana hecha.</p>
    <div class="cmp-table" role="table" aria-label="Comparación Posty vs agencia">
      <div class="cmp-row cmp-head" role="row"><div></div><div>Agencia tradicional</div><div class="win">Posty</div></div>
      <div class="cmp-row" role="row"><div class="crit">Precio por mes</div><div>Desde $300.000</div><div class="win">Desde $39.900</div></div>
      <div class="cmp-row" role="row"><div class="crit">Tu semana lista en</div><div>2 semanas</div><div class="win">1 minuto</div></div>
      <div class="cmp-row" role="row"><div class="crit">Reuniones</div><div>Varias por mes</div><div class="win">Cero</div></div>
      <div class="cmp-row" role="row"><div class="crit">Probar antes de pagar</div><div>No existe</div><div class="win">Probalo gratis, sin tarjeta</div></div>
      <div class="cmp-row" role="row"><div class="crit">Contrato</div><div>3 a 6 meses atado</div><div class="win">Mensual, cancelás cuando querés</div></div>
      <div class="cmp-row" role="row"><div class="crit">Responde comentarios y mensajes</div><div>Si está en el contrato</div><div class="win">Incluido — con un toque</div></div>
      <div class="cmp-row" role="row"><div class="crit">Pauta publicitaria</div><div>Honorarios aparte</div><div class="win">Potencia tu mejor posteo desde la app</div></div>
    </div>
    <p class="unico-line">Un community manager cuesta <b>$300.000+/mes</b>. Posty arranca en <b>$39.900</b>.</p>
    <p class="lp-trust">🔒 Publicamos con la API oficial de Meta · Entrás con el login oficial, sin darnos tu contraseña · Podés frenar cualquier posteo antes de que salga</p>
    <div style="text-align:center;margin-top:18px"><a class="btn btn-primary" href="/prueba">Probar gratis</a></div>
  </div></div>
  <div class="section" id="herramienta" style="background:var(--bg2)"><div class="wrap" style="max-width:920px">
    <h2>Una herramienta te da trabajo. Posty te lo saca.</h2>
    <p class="lede">Las apps de IA para redes son lindas… hasta que te sentás a usarlas: hay que pensar, escribir, diseñar, programar y publicar. Eso es un trabajo. Posty <b>es</b> el que lo hace.</p>
    <div class="lp-vs">
      <div class="lp-vs-col lp-vs-tool">
        <h3>Con una herramienta de IA, vos…</h3>
        <ul>
          <li>✗ Pensás qué postear cada semana</li>
          <li>✗ Escribís las instrucciones y los textos</li>
          <li>✗ Editás los diseños hasta que queden bien</li>
          <li>✗ Programás y publicás uno por uno</li>
          <li>✗ Aprendés un panel nuevo y complicado</li>
          <li>✗ Te acordás solo de las fechas importantes</li>
        </ul>
      </div>
      <div class="lp-vs-col lp-vs-posty">
        <h3>Con Posty, vos…</h3>
        <ul>
          <li>✓ <b>Nada.</b> La semana llega armada y se publica sola</li>
          <li>✓ <b>Nada.</b> Escribe en tu tono, con tu marca</li>
          <li>✓ <b>Nada.</b> Sale listo — y si algo no te gusta, lo frenás en un toque</li>
          <li>✓ <b>Nada.</b> Sale a la mejor hora, siempre</li>
          <li>✓ <b>Nada.</b> No hay panel que aprender: es tener el community manager</li>
          <li>✓ <b>Nada.</b> Posty caza las fechas que venden por vos</li>
        </ul>
      </div>
    </div>
    <div style="text-align:center;margin-top:28px"><a class="btn btn-primary" href="/prueba">Quiero no hacer nada 😎</a></div>
  </div></div>
  <div class="section" id="fotos"><div class="wrap">
    <h2>Con tus fotos, es tu negocio de verdad. Sin fotos, Posty lo crea igual.</h2>
    <p class="lede">Los posteos que ves arriba salen por dos caminos — y los dos funcionan:</p>
    <div class="lp-foto-grid">
      <div class="lp-foto-card">
        <div class="lp-foto-i">📸</div>
        <h3>Nos pasás fotos y videos de tu negocio</h3>
        <p>Tus productos, tu local, tu equipo: nada vende como lo real. Posty usa <b>tu</b> material en los posteos, y cuanto más nos pasás, mejores y más tuyos salen.</p>
        <div class="lp-foto-check">✅ Sale tu negocio de verdad, no uno parecido</div>
      </div>
      <div class="lp-foto-card">
        <div class="lp-foto-i">🤖</div>
        <h3>¿No tenés material? Lo creamos nosotros</h3>
        <p>Posty diseña las imágenes desde cero con tu marca, tus colores y tu estilo. Nunca te quedás sin publicar por no tener fotos.</p>
        <div class="lp-foto-check">✅ Tu semana sale igual, siempre</div>
      </div>
    </div>
    <p class="lp-foto-cta"><a href="/prueba">En la prueba gratuita podés subir una foto tuya y ver la diferencia →</a></p>
    <div style="text-align:center;margin-top:26px"><a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:16px 36px">Probá gratis 3 días</a></div>
  </div></div>
  <div class="section lp-calc" id="calculadora"><div class="wrap" style="max-width:820px">
    <h2>¿Cuánto te cuesta hoy tu Instagram?</h2>
    <p class="lede">Mové el control y hacé la cuenta con tus números reales.</p>
    <div class="lp-calc-box">
      <label class="lp-calc-lab" for="lpCalcH">Horas que le dedicás por semana: <b id="lpCalcHVal">6 h</b></label>
      <input type="range" id="lpCalcH" min="1" max="20" step="1" value="6" oninput="lpCalcUpdate()" aria-label="Horas por semana que le dedicás a tu Instagram">
      <label class="lp-calc-lab" style="margin-top:16px">¿Cuánto vale tu hora?</label>
      <div class="lp-calc-rates">
        <button type="button" class="lp-crate" data-rate="3000" onclick="lpCalcRate(this)">$3.000</button>
        <button type="button" class="lp-crate on" data-rate="5000" onclick="lpCalcRate(this)">$5.000</button>
        <button type="button" class="lp-crate" data-rate="10000" onclick="lpCalcRate(this)">$10.000</button>
      </div>
      <div class="lp-calc-out" id="lpCalcOut">Tu Instagram hoy te cuesta ≈ <b>$129.900</b> por mes (<b>26 horas</b> tuyas).<br>Con Posty: desde <b>$1.330 por día</b> y <b>0 horas tuyas</b> — te quedan <b>26 horas por mes</b> para tu negocio.</div>
    </div>
    <p class="lp-calc-cm">Y si lo tercerizás: un community manager que lo haga por vos cuesta <b>$300.000+ por mes</b>.</p>
  </div></div>
  <div class="section lp-ctl" id="control"><div class="wrap" style="max-width:920px">
    <h2>Tranqui: vos siempre tenés el freno de mano</h2>
    <p class="lede">Posty trabaja solo, pero nada sale sin que puedas frenarlo. Así de simple:</p>
    <div class="lp-ctl-grid">
      <div class="lp-ctl-card"><div class="lp-ctl-ico">🔔</div><b>Te avisa antes</b><p>30 minutos antes de publicar cada posteo te llega el aviso. Lo ves venir, siempre.</p></div>
      <div class="lp-ctl-card"><div class="lp-ctl-ico">⏸</div><b>Frenás con un toque</b><p>El botón Frenar lo vuelve a borrador al instante. Sin explicaciones, sin vueltas.</p></div>
      <div class="lp-ctl-card"><div class="lp-ctl-ico">🎨</div><b>¿No te cierra la imagen?</b><p>Tenés 1 rehacer con otro estilo por posteo, gratis. Posty la arma de nuevo.</p></div>
      <div class="lp-ctl-card"><div class="lp-ctl-ico">↩️</div><b>Volvés a la anterior</b><p>Si el rehacer no te gusta, volvés a la imagen anterior cuando quieras.</p></div>
    </div>
    <p class="lp-ctl-close">Posty trabaja solo. <b>Vos mandás.</b></p>
  </div></div>
  <div class="lp-stats"><div class="wrap">
    <div class="lp-stats-grid">
      <div class="lp-stat"><div class="lp-stat-n">1 minuto</div><div class="lp-stat-t">para ver tu semana armada</div></div>
      <div class="lp-stat"><div class="lp-stat-n">7 posteos + 1 reel</div><div class="lp-stat-t">por semana · 0 minutos tuyos publicando</div></div>
      <div class="lp-stat"><div class="lp-stat-n">$1.330<span class="lp-stat-per">/día</span></div><div class="lp-stat-t">desde — un community manager cuesta $300.000+ por mes</div></div>
      <div class="lp-stat"><div class="lp-stat-n">3 días</div><div class="lp-stat-t">de prueba gratis, sin tarjeta</div></div>
    </div>
  </div></div>
  ${lpAtencionHTML()}
  ${lpRecapHTML()}
  <div class="section" id="planes"><div class="wrap">
    <h2>Elegí tu plan</h2>
    <p class="lede">Primero probá gratis 3 días. Si te gusta tu semana, elegís tu plan acá.</p>
    <div class="lp-offer"><b>La oferta es simple:</b> probás 3 días gratis, ves tu semana armada antes de pagar un peso y, si no te encanta, no pagás nada. Sin tarjeta, sin contrato, sin letra chica.</div>
    <div class="country-toggle">
      <button class="${country === 'AR' ? 'on' : ''}" data-country="AR" onclick="switchPlansCountry('AR')">🇦🇷 Argentina</button>
      <button class="${country === 'UY' ? 'on' : ''}" data-country="UY" onclick="switchPlansCountry('UY')">🇺🇾 Uruguay</button>
    </div>
    <div class="anchor-line" id="anchorLine">${anchorHTML(cfg && cfg.anchor)}</div>
    <div class="scarcity" id="scarcityLine">🔥 Solo <b>50 lugares</b> por mes — acompañamos personalmente a cada negocio que entra.</div>
    <div class="plans-row" id="plansRow">${planCards || '<p>Cargando planes...</p>'}</div>
    <div class="plan-dots" id="planDots"><span class="on"></span><span></span><span></span></div>
    <p class="lp-plans-note">Precios en pesos · Sin contrato de permanencia · Cancelás cuando quieras desde tu cuenta</p>
  </div></div>
  <div class="section" id="faq" style="background:var(--bg2)"><div class="wrap" style="max-width:760px">
    <h2>Preguntas frecuentes</h2>
    <p class="lede">Lo que todos preguntan antes de empezar.</p>
    <div class="faq">
      <details><summary>¿Necesito hacer algo?</summary><p>No. Me contás de tu negocio una sola vez y listo. Yo creo las ideas, los diseños, los textos y publico. Si querés, podés revisar todo antes de que salga.</p></details>
      <details><summary>¿Posty publica en mi cuenta real de Instagram?</summary><p>Sí. Conectás tu cuenta Business una vez y publico directamente en tu perfil con la API oficial de Meta. Y en la prueba gratis ya ves tu semana armada antes de registrarte.</p></details>
      <details><summary>¿Usás mis fotos y mi marca?</summary><p>Sí, eso es lo más importante: subís tus fotos y tu logo una vez, definimos tus colores, y todos los diseños salen con tu identidad. Nada genérico.</p></details>
      <details><summary>¿Puedo cancelar cuando quiera?</summary><p>Sí, sin preguntas ni trabas. Cancelás desde tu cuenta y listo.</p></details>
      <details><summary>¿Qué pasa si no me gusta un posteo?</summary><p>Lo frenás antes de que salga, en un toque. ¿No te gusta la imagen? La rehacés con otro estilo o volvés a la anterior, gratis. Y aprendo de lo que te gusta para que cada semana salga mejor.</p></details>
      <details><summary>¿Posty también atiende a mis clientes?</summary><p>Con el plan Total, sí: Posty está atento a tus mensajes de Instagram las 24 horas y prepara cada respuesta al instante, con tus precios y servicios reales. También te deja listos los turnos y reservas para confirmar, el seguimiento a quien preguntó y no cerró, y el cierre con link de pago o seña. Vos aprobás cada mensaje con un toque antes de que salga — nada se manda sin tu OK — y lo sensible te lo derivo a vos.</p></details>
      <details><summary>¿Tengo que darte mi contraseña de Instagram?</summary><p>No. Conectás tu cuenta con el login oficial de Meta, igual que cuando entrás con Google en otras apps. Nunca veo ni guardo tu contraseña.</p></details>
      <details><summary>¿Los posteos se publican solos?</summary><p>Sí, esa es la idea: tu semana sale sola en los mejores horarios, sin que toques nada. Antes de cada publicación te aviso, y si algo no te cierra lo frenás con un toque. ¿Preferís aprobar todo a mano? También podés: apagás la publicación automática en Ajustes y nada sale sin tu OK.</p></details>
      <details><summary>¿Y si no me funciona?</summary><p>Por eso la prueba es gratis y sin tarjeta: mirá tu semana armada en 1 minuto y decidí. Si no te sirve, no pagás nada.</p></details>
      <details><summary>¿Cuándo veo mi primera semana?</summary><p>Ya mismo: en la prueba gratis la ves armada en 1 minuto, y al crear tu cuenta ya queda publicándose sola (con aviso previo, por si querés frenar algo).</p></details>
      <details><summary>¿Posty responde los comentarios y los mensajes de mi Instagram?</summary><p>Sí. Por cada comentario o mensaje que llega, Posty te prepara la respuesta en el tono de tu negocio: la mandás con un toque, la editás o la descartás. Nada se responde sin que lo apruebes vos.</p></details>
      <details><summary>¿Posty reemplaza a un community manager?</summary><p>Hace el trabajo completo de todos los días: publicar, responder, promocionar y cuidar tu perfil — con tu aprobación en un toque cuando hace falta criterio humano. Si tu marca necesita producción de fotos o video presencial, o campañas a medida, eso sigue siendo trabajo de un equipo humano.</p></details>
      <details><summary>¿Posty puede hacer publicidad de mis posteos?</summary><p>Sí. Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo con pauta. Cargás crédito en la app, fijás cuánto querés gastar y listo: tu mejor contenido llega a mucha más gente.</p></details>
    </div>
    <p style="text-align:center;margin-top:28px;font-size:15.5px;color:var(--dim)">¿Otra duda? <a data-posty-chat role="button" tabindex="0" style="color:var(--sky);font-weight:700;cursor:pointer">Hablá con Posty →</a></p>
    <div style="text-align:center;margin-top:44px">
      <a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:18px 44px">Ver mi semana gratis 👀</a>
    </div>
  </div></div>
  <div class="section lp-audit" id="auditoria"><div class="wrap" style="max-width:760px">
    <h2>¿Tu Instagram está vendiendo?</h2>
    <p class="lede">Posty analiza tu perfil <b>gratis</b> y te dice qué está frenando tus ventas: qué publicar, qué responder, qué mejorar.</p>
    <form class="lp-igform lp-audit-form" onsubmit="return lpGoAudit(event)">
      <input id="lpAuditIg" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@tu_negocio" aria-label="Tu Instagram">
      <button class="btn btn-primary" type="submit">Auditar mi Instagram gratis</button>
    </form>
    <p class="lp-audit-note">Sin registrarte · El resultado llega en menos de un minuto</p>
  </div></div>
  <div class="lp-final"><div class="wrap">
    <img class="hero-posty lp-final-ava" src="ai-avatar.png" alt="Posty, tu community manager">
    <h2>Tu primera semana ya puede estar armada</h2>
    <p>Contanos de tu negocio y mirala en 1 minuto. Gratis, sin tarjeta.</p>
    <a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:18px 44px">Ver mi semana gratis 👀</a>
    <div class="hero-note" style="margin-top:18px">✓ Sin tarjeta · ✓ 3 días gratis · ✓ Cancelá cuando quieras</div>
    <p class="lp-spots" data-spots hidden></p>
  </div></div>
  <div class="footer"><div class="wrap">
    <span class="logo logo-posty" style="font-size:17.5px"><img src="ai-avatar.png" alt="posty.">posty<span class="pdot">.</span></span>
    <span>Posty, tu community manager con IA · Un producto de Posta · Hecho en Argentina 🇦🇷 · © 2026</span>
    <span style="margin-left:12px"><a href="/privacidad.html" style="color:var(--sky)">Privacidad</a> · <a href="/terminos.html" style="color:var(--sky)">Términos</a> · <a data-posty-chat role="button" tabindex="0" style="color:var(--sky);cursor:pointer">Soporte</a></span>
  </div></div>
  <div class="lp-sticky"><div class="wrap"><a class="btn btn-primary btn-block" href="/prueba">Probá gratis 3 días</a></div></div>`;
}

/* ---------- AUTH ---------- */
function authView(mode) {
  const isLogin = mode === 'login';
  return `
  <div class="nav"><div class="wrap">
    <a class="logo logo-posty" href="#/"><img src="ai-avatar.png" alt="posty.">posty<span class="pdot">.</span></a>
    <div class="nav-links"><a href="#/${isLogin ? 'registro' : 'login'}">${isLogin ? 'Crear cuenta' : 'Entrar'}</a></div>
  </div></div>
  <div class="wrap"><div class="form-card">
    <h2>${isLogin ? 'Bienvenido de vuelta 👋' : 'Creá tu cuenta 🚀'}</h2>
    <p class="sub">${isLogin ? 'Entrá para seguir automatizando.' : 'Probalo gratis, sin tarjeta.'}</p>
    <div id="formErr"></div>
    <div class="field"><label>Email</label><input id="f_email" type="email" placeholder="vos@tunegocio.com"${isLogin ? ' autocomplete="email"' : ' autocomplete="off" readonly onfocus="this.removeAttribute(\'readonly\')"'}></div>
    <div class="field"><label>Contraseña</label><input id="f_pass" type="password" placeholder="Mínimo 6 caracteres"${isLogin ? ' autocomplete="current-password"' : ' autocomplete="new-password" readonly onfocus="this.removeAttribute(\'readonly\')"'}></div>
    <button class="btn btn-primary btn-block" id="btnAuth">${isLogin ? 'Entrar' : 'Crear cuenta'}</button>
    <p style="text-align:center;margin-top:18px;font-size:12.5px;color:var(--dim)">
      ${isLogin ? '¿No tenés cuenta? <a href="#/registro" style="color:var(--cel)">Registrate</a> · <a href="#/forgot" style="color:var(--cel)">Olvidé mi contraseña</a>' : '¿Ya tenés cuenta? <a href="#/login" style="color:var(--cel)">Entrá</a>'}
    </p>
  </div></div>`;
}

function forgotView() {
  return `
  <div class="nav"><div class="wrap">
    <a class="logo logo-posty" href="#/"><img src="ai-avatar.png" alt="posty.">posty<span class="pdot">.</span></a>
    <div class="nav-links"><a href="#/login">Entrar</a></div>
  </div></div>
  <div class="wrap"><div class="form-card">
    <h2>Recuperá tu contraseña 🔑</h2>
    <p class="sub">Te mando un link a tu email para elegir una nueva.</p>
    <div id="forgotMsg"></div>
    <div class="field"><label>Email</label><input id="f_email" type="email" placeholder="vos@tunegocio.com" autocomplete="email" style="font-size:16px"></div>
    <button class="btn btn-primary btn-block" id="btnForgot">Mandame el link</button>
    <p style="text-align:center;margin-top:18px;font-size:12.5px;color:var(--dim)">
      <a href="#/login" style="color:var(--cel)">Volver a entrar</a>
    </p>
  </div></div>`;
}

function resetView() {
  return `
  <div class="nav"><div class="wrap">
    <a class="logo logo-posty" href="#/"><img src="ai-avatar.png" alt="posty.">posty<span class="pdot">.</span></a>
  </div></div>
  <div class="wrap"><div class="form-card">
    <h2>Elegí tu nueva contraseña 🔑</h2>
    <p class="sub">Que sea de 6 caracteres como mínimo.</p>
    <div id="resetMsg"></div>
    <div class="field"><label>Nueva contraseña</label><input id="f_pass" type="password" placeholder="Mínimo 6 caracteres" autocomplete="new-password" style="font-size:16px"></div>
    <button class="btn btn-primary btn-block" id="btnReset">Guardar y entrar</button>
  </div></div>`;
}

/* ---------- APP SHELL ---------- */
/* ---------- Shell ---------- */
let IDEAS = [];
let CHAT = [];       // [{role:'user'|'assistant', text}]
let CHAT_IDEA = null; // propuesta cerrada por el consultor {titulo, angulo, caption?, photo_index?, colors?}
let CUSTOM_PAL = null; // paleta pedida por el cliente en el chat ("en rojo") — manda sobre la marca
// Paleta a partir de los colores que pidió el cliente (1-3 hex)
function orderPalette(hexes) {
  const c = hexes.slice(0, 3).map(h => h.toUpperCase());
  while (c.length < 3) c.push(c[c.length - 1]);
  const n = parseInt(c[0].slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return { name: 'Tu pedido', c, dark: lum > 0.6, custom: true };
}
// Miniaturas de sus fotos guardadas (las más nuevas primero) para que la IA las vea
async function chatLibThumbs() {
  const lib = assetPhotos().slice().reverse().slice(0, 6);
  const out = [];
  for (const p of lib) {
    try {
      const img = await photoImg(p.file_path);
      const s = Math.min(1, 256 / Math.max(img.width || 1, img.height || 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((img.width || 1) * s));
      cv.height = Math.max(1, Math.round((img.height || 1) * s));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      out.push(cv.toDataURL('image/jpeg', 0.7));
    } catch (e) { /* foto ilegible: se saltea */ }
  }
  return out;
}
// Aplica un pedido del cliente: foto elegida + colores (el texto dictado va al textarea)
function applyChatOrder(idea) {
  if (!idea) return;
  if (Number.isInteger(idea.photo_index) && !CHAT_PHOTOS.length) {
    const lib = assetPhotos().slice().reverse();
    const pick = lib[idea.photo_index];
    if (pick) { CHAT_PHOTOS = [{ file_path: pick.file_path }]; CHAT_PHOTO_IDX = 0; renderChatPhotos(); }
  }
  if (idea.colors && idea.colors.length) CUSTOM_PAL = orderPalette(idea.colors);
}
/* ---------- PWA: instalar la app ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
/* ---------- FASE 3: limpiar el badge de notificaciones al abrir la app ---------- */
try {
  if (typeof navigator.clearAppBadge === 'function') {
    window.addEventListener('load', () => { navigator.clearAppBadge().catch(() => {}); });
  }
} catch (e) { /* nunca bloquear */ }
let PWA_DEFERRED = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  PWA_DEFERRED = e;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
  PWA_DEFERRED = null;
  try { localStorage.setItem('pwa-installed', '1'); } catch (e) {}
  pwaReportInstalled();
  const b = document.getElementById('pwaBanner');
  if (b) b.remove();
  // Ofrecer notificaciones push una sola vez, con la tarjeta amable de Posty.
  try {
    if (!localStorage.getItem('push-asked')) {
      localStorage.setItem('push-asked', '1');
      setTimeout(() => { try { pushEnableFlow(); } catch (e) {} }, 2000);
    }
  } catch (e) { /* nunca bloquear */ }
});
function pwaIsInstalled() {
  try { if (localStorage.getItem('pwa-installed') === '1') return true; } catch (e) {}
  return pwaIsStandalone();
}
// Solo modo instalado real (sin el flag de localStorage): decide si la app arranca como app.
function pwaIsStandalone() {
  try { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || !!navigator.standalone; } catch (e) { return false; }
}
function pwaIsIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
// La invitación a instalar solo tiene sentido en el teléfono: en la compu no se muestra.
function pwaIsMobile() {
  try { return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || ''); } catch (e) { return false; }
}
function pwaDismissed() {
  try {
    const t = parseInt(localStorage.getItem('pwa-dismissed') || '0', 10);
    return t && (Date.now() - t < 24 * 3600 * 1000);
  } catch (e) { return false; }
}
// Avisar al servidor (una sola vez por dispositivo) que la app quedó instalada.
// Así no le mandamos emails de recordatorio a quien ya la tiene en el teléfono.
function pwaReportInstalled() {
  try { if (localStorage.getItem('pwa-reported') === '1') return; } catch (e) {}
  try { localStorage.setItem('pwa-reported', '1'); } catch (e) {}
  try { api.post('/api/pwa-installed', {}).catch(() => {}); } catch (e) {}
}
async function pwaDoInstall() {
  if (PWA_DEFERRED) {
    PWA_DEFERRED.prompt();
    try { await PWA_DEFERRED.userChoice; } catch (e) {}
    PWA_DEFERRED = null;
    return;
  }
  pwaInstallModal();
}
// Modal visual paso a paso para guardar Posta en el celu.
// En iPhone muestra SOLO los pasos de iPhone (nada de Android que confunda).
function pwaInstallModal() {
  if (document.getElementById('pzPwaOverlay')) return;
  const steps = pwaIsIos() ? `
    <div class="pz-pwa-step"><span class="pz-pwa-n">1</span><div><b>Tocá los tres puntitos •••</b><small>Abajo a la derecha, junto a la dirección.</small></div></div>
    <div class="pz-pwa-step"><span class="pz-pwa-n">2</span><div><b>Tocá Compartir</b><small>El cuadradito con la flecha hacia arriba.</small></div></div>
    <div class="pz-pwa-step"><span class="pz-pwa-n">3</span><div><b>Elegí "Agregar a pantalla de inicio"</b><small>Deslizá un poco hacia abajo para encontrarla.</small></div></div>
    <div class="pz-pwa-step"><span class="pz-pwa-n">4</span><div><b>Tocá "Agregar"</b><small>Arriba a la derecha. ¡Listo! Posty queda como una app en tu teléfono 🎉</small></div></div>
  ` : `
    <div class="pz-pwa-step"><span class="pz-pwa-n">1</span><div><b>Tocá el menú ⋮</b><small>Arriba a la derecha en Chrome.</small></div></div>
    <div class="pz-pwa-step"><span class="pz-pwa-n">2</span><div><b>Elegí "Instalar app"</b><small>O "Agregar a pantalla de inicio".</small></div></div>
    <div class="pz-pwa-step"><span class="pz-pwa-n">3</span><div><b>Confirmá</b><small>¡Listo! Posty queda como una app en tu teléfono 🎉</small></div></div>
  `;
  const ov = document.createElement('div');
  ov.id = 'pzPwaOverlay';
  ov.className = 'pz-exp-overlay';
  ov.innerHTML = `
    <div class="pz-exp-modal" role="dialog" aria-modal="true">
      <button class="pz-exp-x" id="pzPwaClose" aria-label="Cerrar">✕</button>
      <div style="font-size:37px">📲</div>
      <h2>Guardá Posty en tu celu</h2>
      <p class="pz-exp-sub">Queda como una app, con su ícono en la pantalla de inicio.</p>
      <div class="pz-pwa-steps">${steps}</div>
      <button class="btn btn-primary btn-block" id="pzPwaOk">Entendido</button>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('#pzPwaClose').onclick = close;
  ov.querySelector('#pzPwaOk').onclick = close;
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
}
function pwaWire() {
  // Si ya la abrió como app instalada, avisar al servidor una sola vez.
  try { if (pwaIsInstalled()) pwaReportInstalled(); } catch (e) {}
  const d = document.getElementById('pwaDismiss');
  if (d) d.onclick = () => {
    try { localStorage.setItem('pwa-dismissed', String(Date.now())); } catch (e) {}
    const b = document.getElementById('pwaBanner');
    if (b) b.remove();
  };
  const ib = document.getElementById('pwaInstallBtn');
  if (ib) ib.onclick = pwaDoInstall;
  const mi = document.getElementById('msheetInstall');
  if (mi) mi.onclick = () => {
    const ms = document.getElementById('msheet');
    if (ms) ms.classList.remove('open');
    pwaDoInstall();
  };
}

/* ---------- PUSH NOTIFICATIONS (VAPID): Posty te avisa en el celu ---------- */
// La tarjeta amable de Posty SIEMPRE va antes del prompt del navegador.
// Si el usuario no da permiso, todo sigue funcionando igual. Nunca spam.
function pushSupported() {
  try { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
  catch (e) { return false; }
}
function pushPerm() { try { return Notification.permission; } catch (e) { return 'denied'; } }
// 🔔 Posty te habla y estás en otra pestaña: notificación local del navegador.
// Usa el mismo permiso que el push (pushEnableFlow). Solo dispara si la pestaña está oculta.
function postyNotify(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    const n = new Notification(title || 'Posty', {
      body: String(body || '').replace(/\n+/g, ' ').slice(0, 140),
      icon: 'ai-avatar.png',
      tag: 'posty-chat',
    });
    n.onclick = () => { try { window.focus(); } catch (e) {} try { n.close(); } catch (e2) {} };
  } catch (e) {}
}
function pushKeyToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const b = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function pushAskCard() {
  return new Promise((resolve) => {
    if (document.getElementById('pzPushOv')) { resolve(false); return; }
    const ov = document.createElement('div');
    ov.id = 'pzPushOv';
    ov.className = 'pz-exp-overlay';
    ov.innerHTML = `
      <div class="pz-exp-modal" role="dialog" aria-modal="true">
        <div style="font-size:37px">🔔</div>
        <h2>¿Te aviso cuando pase algo?</h2>
        <p class="pz-exp-sub">Te mando un avisito cuando tu posteo salga publicado y cuando tu semana esté lista para revisar. Nada de spam, lo prometo 🤙</p>
        <button class="btn btn-primary btn-block" id="pzPushYes">Sí, avisame 👍</button>
        <button class="btn btn-soft btn-block" id="pzPushNo" style="margin-top:8px">Ahora no</button>
      </div>`;
    document.body.appendChild(ov);
    const close = (v) => { try { ov.remove(); } catch (e) {} resolve(v); };
    ov.querySelector('#pzPushYes').onclick = () => close(true);
    ov.querySelector('#pzPushNo').onclick = () => close(false);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(false); });
  });
}
async function pushDoSubscribe() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (pushPerm() === 'denied') return { ok: false, reason: 'denied' };
  try {
    const r = await api.get('/api/push/vapid-key');
    if (!r || !r.key) return { ok: false, reason: 'no_vapid' };
    if (pushPerm() === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, reason: 'denied' };
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyToU8(r.key) });
    const j = sub.toJSON();
    await api.post('/api/push/subscribe', { endpoint: j.endpoint, keys: j.keys });
    try { localStorage.setItem('push-sub', '1'); } catch (e) {}
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'error' };
  }
}
// Flujo completo: tarjeta de Posty → permiso real → suscripción.
async function pushEnableFlow() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (pushPerm() === 'denied') return { ok: false, reason: 'denied' };
  const accepted = await pushAskCard();
  if (!accepted) return { ok: false, reason: 'declined' };
  return pushDoSubscribe();
}
/* ---------- CHECKLIST QUE FESTEJA ---------- */
// Detecta la transición a 0 pasos (todos completados) y celebra UNA SOLA VEZ.
let SETUP_COUNT_PREV = null; // conteo del último render del checklist
const SETUP_CELEBRATED_KEY = 'posty-checklist-celebrated';
function setupChecklistCelebrate(n) {
  try {
    const prev = SETUP_COUNT_PREV;
    SETUP_COUNT_PREV = n; // se actualiza SIEMPRE: un render = una oportunidad
    if (!(prev > 0 && n === 0)) return; // solo transición real a cero
    let flag = null;
    try { flag = localStorage.getItem(SETUP_CELEBRATED_KEY); } catch (e) {}
    if (flag) return; // ya festejó: jamás repetir
    try { localStorage.setItem(SETUP_CELEBRATED_KEY, '1'); } catch (e) {} // flag ANTES de los efectos
    const msg = '¡Listo! Ya estoy trabajando para vos 🎉';
    chatSay(msg); // mensaje de Posty en el chat (persiste en el servidor vía /api/ideas/chat/log)
    toast('🎉 <b>¡Listo!</b> Ya estoy trabajando para vos 🎉'); // toast visible en la app
    postyConfetti(); // confetti sutil
  } catch (e) {}
}
// Confetti sutil: ~25 piezas con CSS puro, sin librerías. No bloquea ni rompe el layout mobile.
function postyConfetti() {
  const colors = ['#2793C8', '#FEC14D', '#0A1E33', '#7EC8F2', '#FFE29A'];
  const box = document.createElement('div');
  box.className = 'posty-confetti';
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('i');
    p.style.left = (Math.random() * 100).toFixed(2) + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
    p.style.animationDuration = (1.6 + Math.random() * 1.2).toFixed(2) + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => { try { box.remove(); } catch (e) {} }, 3600);
}
// Celebración grande: confetti (ya existente) + Posty en su forma de siempre
// con una pelotita amarilla picando al lado ~3.2s (CSS puro, .posty-celebrate
// en styles.css; v257 — los malabares de v256 se fueron por orden de Valentino).
// Idempotente: si ya hay una celebración en curso, no se apila otra (flag con timestamp).
let POSTY_CELEBRATE_UNTIL = 0;
function postyCelebrate() {
  try {
    const now = Date.now();
    if (POSTY_CELEBRATE_UNTIL && now < POSTY_CELEBRATE_UNTIL) return; // ya hay una en curso
    POSTY_CELEBRATE_UNTIL = now + 3200;
    if (typeof postyConfetti === 'function') postyConfetti();
    const ov = document.createElement('div');
    ov.className = 'posty-celebrate';
    // v257 (orden de Valentino): SIN malabares. Posty en su forma de siempre
    // (avatar redondo) + UNA pelotita amarilla picando al lado. Nada más.
    ov.innerHTML = '<div class="pc-wrap"><img class="pc-ava" src="ai-avatar.png" alt="Posty">'
      + '<span class="pc-one-sh"></span><span class="pc-one"></span></div>';
    document.body.appendChild(ov);
    setTimeout(() => {
      try { ov.remove(); } catch (e) {}
      try { if (Date.now() >= POSTY_CELEBRATE_UNTIL) POSTY_CELEBRATE_UNTIL = 0; } catch (e2) {}
    }, 3300);
  } catch (e) {}
}
// Magia de primera apertura: confetti sutil (ya existente) + el avatar "saluda"
// (bounce + giro sutil, 1.2s, CSS puro). Una sola vez por sesión.
function firstOpenParty() {
  let done = false;
  try { done = sessionStorage.getItem('posta_first_open_party') === '1'; } catch (e) {}
  if (done) return;
  try { sessionStorage.setItem('posta_first_open_party', '1'); } catch (e) {}
  try { if (typeof postyCelebrate === 'function') postyCelebrate(); } catch (e) {} // confetti + pelotita
  try {
    const ava = document.querySelector('.chome-ava');
    if (ava) {
      ava.classList.add('chome-ava-wave');
      setTimeout(() => { try { ava.classList.remove('chome-ava-wave'); } catch (e2) {} }, 1600);
    }
  } catch (e) {}
}
/* ---------- CHECKLIST COMPACTO: reemplaza los 3 banners apilados ---------- */
function igConnectHere() {
  const cur = '/#' + ((location.hash.split('?')[0] || '#/app/schedule').replace(/^#/, ''));
  igConnect(cur);
}
function setupChecklistHtml(title, opts) {
  let rows = [];
  if (!(PROFILE && (PROFILE.business_name || '').trim())) {
    rows.push(`<button class="setup-row" id="setupBizRow"><span class="setup-ico">🏪</span><span class="setup-txt"><b>Poné el nombre de tu negocio</b><small>Es obligatorio: así todo Posty se siente tuyo.</small></span><span class="setup-go">Completar →</span></button>`);
  }
  if (!(PROFILE && PROFILE.ig_connected)) {
    rows.push(`<button class="setup-row" id="setupIgRow"><span class="setup-ico">📸</span><span class="setup-txt"><b>Conectá tu Instagram</b><small>Dejá tu semana lista para publicar.</small></span><span class="setup-go">Conectar →</span></button>`);
  }
  if (pwaIsMobile() && !pwaIsInstalled() && !pwaDismissed()) {
    rows.push(`<button class="setup-row" id="pwaInstallBtn"><span class="setup-ico">📲</span><span class="setup-txt"><b>Instalá la app</b><small>Acceso directo en tu teléfono.</small></span><span class="setup-go">Instalar →</span></button>`);
  }
  // 🔔 Notificaciones: obligatorias. Sin botón de descartar: el paso se cumple
  // activando push, o por email si el OS lo bloquea (el email siempre llega).
  if (pushSupported() && pushPerm() !== 'granted') {
    if (pushPerm() === 'denied') {
      rows.push(`<div class="setup-row setup-done"><span class="setup-ico">📧</span><span class="setup-txt"><b>Te aviso por email</b><small>Bloqueaste las notificaciones: los avisos llegan a tu email.</small></span><span class="setup-go">✓</span></div>`);
    } else {
      rows.push(`<button class="setup-row" id="setupPushRow"><span class="setup-ico">🔔</span><span class="setup-txt"><b>Activá las notificaciones</b><small>Te aviso antes de publicar cada posteo.</small></span><span class="setup-go">Activar →</span></button>`);
    }
  }
  // La detección de transición vive acá: cubre TODAS las rutas que pintan el checklist
  // (refreshSetupChecklist, appShell, chatView), porque todas pasan por esta función.
  setupChecklistCelebrate(rows.length);
  // En Inicio, la línea fina de IG ya comunica la conexión: la fila de IG del
  // checklist se omite ahí para no pedir lo mismo dos veces en una pantalla.
  if (opts && opts.omitIg) rows = rows.filter((r) => !r.includes('setupIgRow'));
  if (!rows.length) return '';
  const n = rows.length;
  const t = title || `🚀 Te ${n === 1 ? 'falta 1 paso' : `faltan ${n} pasos`}`;
  return `<div class="setup-card"><div class="setup-title">${t}</div>${rows.join('')}</div>`;
}
// Checklist como sección secundaria al final del chat: mismas filas y mismos
// binds (sigue funcional), solo baja de protagonismo con título propio.
function setupSecondaryHtml() {
  const h = setupChecklistHtml('Para que la magia siga ✨');
  if (!h) return '';
  return `<section class="setup-secondary" aria-label="Para que la magia siga">${h}</section>`;
}
// Bindea las filas del checklist (se re-bindea tras cada refresh del checklist).
function bindSetupRows() {
  const sg = $('#setupIgRow');
  if (sg) sg.onclick = igConnectHere;
  const sb = $('#setupBizRow');
  if (sb) sb.onclick = () => location.hash = '#/app/ajustes';
  const pi = $('#pwaInstallBtn');
  if (pi) pi.onclick = pwaDoInstall;
  const sp = $('#setupPushRow');
  if (sp) sp.onclick = async () => {
    sp.disabled = true;
    try {
      const r = await pushEnableFlow();
      if (r && r.ok) {
        toast('🔔 <b>¡Listo!</b> Te aviso antes de cada posteo 🙌');
      } else if (r && r.reason === 'denied') {
        // El OS lo bloqueó: al refrescar, la fila pasa a "Te aviso por email".
      } else if (r && r.reason !== 'declined') {
        toast(r && r.reason === 'no_vapid'
          ? '🔔 Todavía no están listas del lado del servidor. Probá en un rato.'
          : '🔔 No se pudo activar 😅 Probá de nuevo.');
      }
    } catch (e) {}
    // Siempre refrescar: la fila se deriva del permiso real, así converge a la verdad.
    refreshSetupChecklist();
    try { sp.disabled = false; } catch (e) {}
  };
}
// Re-render del checklist en el lugar (tras activar notificaciones, etc.).
// Conserva el título de la sección secundaria del chat ("Para que la magia siga ✨").
function refreshSetupChecklist() {
  document.querySelectorAll('.setup-card').forEach(card => {
    const sec = card.closest('.setup-secondary');
    const h = setupChecklistHtml(sec ? 'Para que la magia siga ✨' : undefined);
    if (!h) { (sec || card).remove(); return; }
    const t = document.createElement('template');
    t.innerHTML = h.trim();
    const fresh = t.content.firstElementChild;
    if (fresh) card.replaceWith(fresh);
  });
  bindSetupRows();
}

/* ---------- 🏠 Rediseño mobile (2026-10-20, mock aprobado por Valentino) ----------
   En teléfonos (≤820px) la app gana barra de pestañas inferior y una home
   nueva (Inicio); la hamburguesa se oculta SOLO donde las pestañas están
   (el chat conserva su navegación de siempre). Desktop: todo como hoy. */
function mzIsMobile() {
  try { return !!(window.matchMedia && window.matchMedia('(max-width: 820px)').matches); } catch (e) { return false; }
}
function mzHomeHash() { return mzIsMobile() ? '#/app/inicio' : '#/app/schedule'; }
function mzTabsHTML(tab) {
  if (tab === 'chat') return ''; // el chat es pantalla completa con su input fijo: sin pestañas
  const on = tab === 'inicio' ? 'inicio'
    : (tab === 'schedule' || tab === 'post') ? 'semana'
    : tab === 'analisis' ? 'analisis'
    : tab === 'ajustes' ? 'ajustes' : '';
  const t = (key, route, ico, label) => `<button type="button" class="mz-tab${on === key ? ' on' : ''}" data-tab="${route}"><span class="mz-tab-ic">${ico}</span>${label}</button>`;
  return `<nav class="mz-tabs" aria-label="Navegación principal">${t('inicio', 'inicio', '🏠', 'Inicio')}${t('semana', 'schedule', '📅', 'Semana')}${t('analisis', 'analisis', '🧠', 'Análisis')}${t('ajustes', 'ajustes', '⚙️', 'Ajustes')}</nav>`;
}

function appShell(tab, content) {
  return `
  <div class="mtop">
    <button class="mtop-burger" id="mtopBurger" aria-label="Abrir menú">≡</button>
  </div>
  <div class="drawer-ov" id="drawerOv" hidden></div>
  <aside class="drawer" id="drawer" aria-label="Menú">
    <div class="drawer-ident" id="drawerIdent" aria-label="Tu negocio"></div>
    <div class="side-posty" id="sidePosty" aria-label="Posty">
      <img src="ai-avatar.png" alt="Posty" class="side-posty-ava">
      <span class="side-posty-txt"><b id="sidePostyName">Posty<span class="pdot">.</span></b></span>
    </div>
    <button class="drawer-link ${tab === 'schedule' ? 'on' : ''}" data-tab="schedule"><span class="di">📅</span>Schedule<span class="sched-count" id="schedCount" style="display:none"></span></button>
    <button class="drawer-link ${tab === 'analisis' ? 'on' : ''}" data-tab="analisis"><span class="di">📊</span>Análisis</button>
    <button class="drawer-link ${tab === 'ajustes' ? 'on' : ''}" data-tab="ajustes"><span class="di">⚙️</span>Ajustes</button>
    <div class="drawer-grow"></div>
    <button class="drawer-link drawer-logout" id="drawerLogout"><span class="di">🚪</span>Salir</button>
  </aside>
  ${tab === 'chat' ? '' : setupChecklistHtml(undefined, (tab === 'inicio' || tab === 'schedule') ? { omitIg: true } : undefined)}
  <div class="app-shell">
    <div class="main ${tab === 'chat' ? 'main-chat' : ''}">${content}</div>
  </div>
  ${mzTabsHTML(tab)}`;
}

/* Drawer mobile: hamburguesa ≡ con todo lo demás (reemplaza la bottom nav) */
function openDrawer(){ const d = $('#drawer'), o = $('#drawerOv'); if (d) d.classList.add('open'); if (o) o.hidden = false; }
function closeDrawer(){ const d = $('#drawer'), o = $('#drawerOv'); if (d) d.classList.remove('open'); if (o) o.hidden = true; }



const BASE_PALETTES = [
  { name: 'Celeste', c: ['#2793C8', '#1E7FAE'], dark: false },
  { name: 'Amarillo', c: ['#FEC14D', '#E5A62C'], dark: true },
  { name: 'Navy', c: ['#0A1E33', '#47617A'], dark: false },
  { name: 'Nieve', c: ['#FFFFFF', '#F2F9FD'], dark: true },
];
// Colores de marca del cliente (brand kit) → paleta "Mi marca" primera en la lista
// Los colores de Posta nunca son "los del cliente": si lo guardado es exactamente
// nuestro trío por defecto, se trata como no configurado.
const POSTA_DEFAULT_TRIO = ['#FEC14D', '#2793C8', '#0A1E33'];
const NEUTRAL_TRIO = ['#8B95A1', '#C3CAD2', '#4A5560'];
function brandColors() {
  try {
    const c = JSON.parse((SETTINGS && SETTINGS.brand_colors) || '[]');
    const list = Array.isArray(c) ? c.filter(x => /^#[0-9a-fA-F]{6}$/.test(x)) : [];
    if (list.length >= 3 && POSTA_DEFAULT_TRIO.every((d, i) => list[i].toUpperCase() === d)) return [];
    return list;
  } catch { return []; }
}
function loadImageUrl(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}
function getPalettes() {
  const list = [...BASE_PALETTES];
  const bc = brandColors();
  if (bc.length >= 2) {
    const n = parseInt(bc[0].slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    list.unshift({ name: 'Mi marca', c: bc.slice(0, 3), dark: lum > 0.6, brand: true });
  }
  // El pedido del cliente manda: va primero y el índice 0 lo usa
  if (CUSTOM_PAL) list.unshift(CUSTOM_PAL);
  return list;
}
// La paleta por defecto siempre es "Mi marca" (indice 0 cuando hay colores de marca).
function defaultPal() { return 0; }
const PALETTES = BASE_PALETTES; // compat: usar getPalettes() para la lista efectiva

// Saca los N colores dominantes de una imagen (se usa para autocompletar
// los colores de marca desde el logo que sube el cliente).
// - Devuelve el tono EXACTO más frecuente de cada grupo (no el centro aproximado
//   del bucket): el color del logo sale idéntico al original.
// - El puntaje mezcla frecuencia con saturación: un acento chico pero vivo
//   (ej. el puntito del logo) le gana a variantes apagadas con más píxeles.
// Regla: el FONDO del logo nunca es el principal. El color más frecuente de
// toda la imagen suele ser el fondo → va como acento (si es un color real).
// El principal es el color más fuerte del logo en sí (el "logo literal").
function extractTopColors(img, n) {
  const cw = 120, chh = 120;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = false; // sin suavizado: los colores planos del logo quedan puros, sin tonos de borde inventados
  const s = Math.min(cw / img.naturalWidth, chh / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, chh);
  cx.drawImage(img, (cw - w) / 2, (chh - h) / 2, w, h);
  const dx = (cw - w) / 2, dy = (chh - h) / 2;
  const inLogo = (x, y) => x >= dx && x < dx + w && y >= dy && y < dy + h; // sin letterbox
  const d = cx.getImageData(0, 0, cw, chh).data;
  const key = (r, g, b) => [r >> 5, g >> 5, b >> 5].join(',');
  const isNeutral = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return (mx - mn < 28) || (mx > 242 && mn > 225) || (mx < 24); // grises, blancos, negros
  };
  // track: por bucket guarda cantidad, saturación acumulada y el tono exacto más frecuente
  const track = (map, k, r, g, b) => {
    let e = map[k];
    if (!e) e = map[k] = { n: 0, sat: 0, exact: {}, best: 0, bestN: 0 };
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    e.n++; e.sat += (mx - mn) / 255;
    const ek = (r << 16) | (g << 8) | b;
    const c = (e.exact[ek] || 0) + 1;
    e.exact[ek] = c;
    if (c > e.bestN) { e.bestN = c; e.best = ek; }
  };
  const hexOf = (e) => '#' + [16, 8, 0].map(s => ((e.best >> s) & 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  // 1) Fondo = el color más frecuente del ÁREA DEL LOGO (incluye neutros)
  const all = {};
  for (let y = 0; y < chh; y += 2) {
    for (let x = 0; x < cw; x += 2) {
      if (!inLogo(x, y)) continue;
      const i = (y * cw + x) * 4;
      track(all, key(d[i], d[i + 1], d[i + 2]), d[i], d[i + 1], d[i + 2]);
    }
  }
  const sorted = Object.entries(all).sort((a, b) => b[1].n - a[1].n);
  if (!sorted.length) return [];
  const bgKey = sorted[0][0], bgE = sorted[0][1];
  const bgIsReal = !isNeutral((bgE.best >> 16) & 255, (bgE.best >> 8) & 255, bgE.best & 255);
  // 2) Principal y secundario: colores cromáticos que NO son el fondo
  const buckets = {};
  for (let y = 0; y < chh; y += 2) {
    for (let x = 0; x < cw; x += 2) {
      if (!inLogo(x, y)) continue;
      const i = (y * cw + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const k = key(r, g, b);
      if (k === bgKey) continue;          // el fondo no compite por ser principal
      if (isNeutral(r, g, b)) continue;   // grises/blancos/negros
      track(buckets, k, r, g, b);
    }
  }
  const rgbOf = (e) => [(e.best >> 16) & 255, (e.best >> 8) & 255, e.best & 255];
  const cDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // Diversidad perceptual: un tono casi idéntico a uno ya elegido (ej. bordes
  // anti-aliased del mismo navy) no ocupa el lugar de un color distinto
  // (ej. el puntito celeste del logo).
  const scored = Object.values(buckets)
    .sort((a, b) => (b.n * (0.25 + 2 * (b.sat / b.n))) - (a.n * (0.25 + 2 * (a.sat / a.n))));
  const picked = [];
  for (const e of scored) {
    if (picked.every(p => cDist(rgbOf(e), rgbOf(p)) >= 48)) {
      picked.push(e);
      if (picked.length === 3) break;
    }
  }
  const ranked = picked.map(hexOf);
  // 3) El fondo (si es un color real, ej. navy de fitswapp) va como acento
  const out = bgIsReal ? [ranked[0], ranked[1], hexOf(bgE)].filter(Boolean) : ranked;
  return out.slice(0, n || 3);
}
function loadImageFile(file) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(im.src); res(im); };
    im.onerror = rej;
    im.src = URL.createObjectURL(file);
  });
}

function wrapText(ctx, text, maxW) {
  const words = String(text || '').split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
let PHOTO_CACHE = { url: '', img: null };
function photoImg(url) {
  if (!url) return Promise.resolve(null);
  if (PHOTO_CACHE.url === url && PHOTO_CACHE.img) return Promise.resolve(PHOTO_CACHE.img);
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { PHOTO_CACHE = { url, img: im }; res(im); };
    im.onerror = () => res(null);
    im.src = url;
  });
}

function drawPost(canvas, o) {
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const pals = getPalettes();
  const pal = pals[o.pal] || pals[0];
  const c0 = pal.c[0], c1 = pal.c[1] || pal.c[0];
  let acc = pal.c[2] || pal.c[0]; // acento de LA MARCA del cliente, nunca el de Posta
  const ink = pal.dark ? '#0A1E33' : '#FFFFFF';
  const FONT = "-apple-system, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";
  const SERIF = "Georgia, 'Times New Roman', serif";

  const title = String(o.title || 'Tu título');
  const subtitle = String(o.subtitle || '');
  const handle = '@' + (o.handle || 'tunegocio');

  // ---------- helpers de dibujo ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function L(text, maxW, font) { ctx.font = font; return wrapText(ctx, text, maxW); }
  function cl(ls, cx, y, lh) { ls.forEach((l, i) => ctx.fillText(l, cx, y + i * lh)); } // centradas
  function ll(ls, x, y, lh) { ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh)); }   // a la izquierda
  // Ajuste tipográfico: achica la fuente hasta que el texto entre en maxLines.
  // NUNCA corta palabras: prefiere achicar antes que truncar. Si ni al mínimo
  // entra, devuelve todas las líneas igual (los layouts centrados lo absorben).
  // overflow=true solo se usa para subtítulos: mejor ausentes que cortados.
  function fit(text, maxW, maxLines, mkFont, startSize, minSize) {
    let size = startSize, ls = [];
    while (true) {
      ls = L(text, maxW, mkFont(size));
      if (ls.length <= maxLines || size <= minSize) break;
      size -= 6;
    }
    const overflow = ls.length > maxLines;
    return { lines: ls, size, overflow };
  }
  function overline(text, cx, y, color, size) {
    ctx.font = '700 ' + (size || 38) + 'px ' + FONT;
    try { ctx.letterSpacing = '7px'; } catch (e) {}
    ctx.fillStyle = color; ctx.textAlign = 'center';
    ctx.fillText(String(text).toUpperCase(), cx, y);
    try { ctx.letterSpacing = '0px'; } catch (e) {}
  }
  function pill(cx, cy, text, font, bg, fg, opts) {
    opts = opts || {};
    ctx.font = font;
    const padX = opts.padX != null ? opts.padX : 46;
    const w = ctx.measureText(text).width + padX * 2, h = opts.h || 92;
    ctx.save();
    if (!opts.flat) { ctx.shadowColor = 'rgba(10,30,51,.25)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; }
    rr(cx - w / 2, cy - h / 2, w, h, h / 2);
    if (opts.stroke) { ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.lw || 3; ctx.stroke(); }
    else { ctx.fillStyle = bg; ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = fg; ctx.textAlign = 'center';
    const fs = parseInt((font.match(/(\d+)px/) || [0, 40])[1], 10);
    ctx.fillText(text, cx, cy + fs * 0.36);
    return w;
  }
  // foto de fondo con velo; devuelve false si no hay foto
  function photoBG(veil) {
    if (!o.photoImg) return false;
    drawCover(ctx, o.photoImg, 0, 0, W, H);
    ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);
    return true;
  }
  function brandGrad(x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    return g;
  }

  const tpl = o.tpl || 'gradiente';

  if (tpl === 'claro') {
    // ---- Tarjeta luminosa: aire, overline con tracking, titular protagonista ----
    const hasPhoto = photoBG('rgba(255,255,255,.90)');
    if (!hasPhoto) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H); }
    if (!hasPhoto) {
      const gl = ctx.createLinearGradient(0, 0, 0, 560);
      gl.addColorStop(0, hexA(c0, 0.10)); gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl; ctx.fillRect(0, 0, W, 560);
    }
    ctx.textAlign = 'center';
    overline(handle, W / 2, 148, acc);
    ctx.fillStyle = acc; rr(W / 2 - 60, 182, 120, 9, 4.5); ctx.fill();
    const t = fit(title, W - 240, 4, s => '800 ' + s + 'px ' + FONT, 100, 70);
    const th = (t.lines.length - 1) * t.size * 1.18, cy = 600;
    ctx.fillStyle = '#0A1E33';
    cl(t.lines, W / 2, cy - th / 2, t.size * 1.18);
    if (subtitle) {
      const s = fit(subtitle, W - 300, 3, z => '400 ' + z + 'px ' + FONT, 50, 34);
      if (!s.overflow) {
        ctx.fillStyle = 'rgba(10,30,51,.64)';
        cl(s.lines, W / 2, cy + th / 2 + 72, s.size * 1.36);
      }
    }
  } else if (tpl === 'noche') {
    // ---- Noche premium: marco doble fino, titular blanco con subrayado acento ----
    const hasPhoto = photoBG('rgba(10,30,51,.85)');
    if (!hasPhoto) { ctx.fillStyle = '#0A1E33'; ctx.fillRect(0, 0, W, H); }
    const vg = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 950);
    vg.addColorStop(0, 'rgba(255,255,255,.06)'); vg.addColorStop(1, 'rgba(0,0,0,.30)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = acc; ctx.lineWidth = 5; ctx.strokeRect(46, 46, W - 92, H - 92);
    ctx.strokeStyle = hexA(acc, 0.35); ctx.lineWidth = 2; ctx.strokeRect(68, 68, W - 136, H - 136);
    ctx.textAlign = 'center';
    overline(handle, W / 2, 172, acc);
    const t = fit(title, W - 280, 4, s => '800 ' + s + 'px ' + FONT, 106, 72);
    const th = (t.lines.length - 1) * t.size * 1.17, cy = 640;
    ctx.fillStyle = '#FFFFFF';
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    cl(t.lines, W / 2, cy - th / 2, t.size * 1.17);
    ctx.restore();
    ctx.fillStyle = acc; rr(W / 2 - 70, cy + th / 2 + 36, 140, 10, 5); ctx.fill();
    if (subtitle) {
      const s = fit(subtitle, W - 320, 3, z => '400 ' + z + 'px ' + FONT, 52, 34);
      if (!s.overflow) {
        ctx.fillStyle = 'rgba(255,255,255,.72)';
        cl(s.lines, W / 2, cy + th / 2 + 102, s.size * 1.35);
      }
    }
  } else if (tpl === 'promo') {
    // ---- Energía de oferta: diagonal, círculos deco, pill de marca ----
    const hasPhoto = photoBG((() => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, hexA(c0, 0.70)); g.addColorStop(1, hexA(c1, 0.70));
      return g;
    })());
    if (!hasPhoto) { ctx.fillStyle = brandGrad(0, 0, W, H); ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    ctx.beginPath(); ctx.arc(W * 0.84, 250, 150, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(130, 1090, 210, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(-0.32);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(-W, -70, W * 2, 140);
    ctx.restore();
    ctx.textAlign = 'center';
    overline(handle, W / 2, 150, hexA(ink, 0.85));
    const t = fit(title, W - 200, 4, s => '900 ' + s + 'px ' + FONT, 138, 80);
    const th = (t.lines.length - 1) * t.size * 1.15, cy = 620;
    ctx.fillStyle = ink;
    ctx.save();
    ctx.shadowColor = 'rgba(10,30,51,.30)'; ctx.shadowOffsetY = 10; ctx.shadowBlur = 0;
    cl(t.lines, W / 2, cy - th / 2, t.size * 1.15);
    ctx.restore();
    if (subtitle) {
      const s = fit(subtitle, W - 260, 3, z => '700 ' + z + 'px ' + FONT, 56, 36);
      if (!s.overflow) {
        ctx.fillStyle = hexA(ink, 0.88);
        cl(s.lines, W / 2, cy + th / 2 + 66, s.size * 1.32);
      }
    }
    pill(W / 2, 1200, '✦ ' + handle + ' ✦', '800 42px ' + FONT,
      pal.dark ? '#0A1E33' : 'rgba(255,255,255,.94)', pal.dark ? '#FFFFFF' : '#0A1E33', { padX: 40, h: 88 });
  } else if (tpl === 'editorial') {
    // ---- Revista: foto arriba, bloque de marca abajo, serif gigante ----
    const PH = 780;
    if (o.photoImg) { drawCover(ctx, o.photoImg, 0, 0, W, PH); }
    else { ctx.fillStyle = brandGrad(0, 0, W, PH); ctx.fillRect(0, 0, W, PH); }
    const sc = ctx.createLinearGradient(0, PH - 170, 0, PH + 20);
    sc.addColorStop(0, hexA(c0, 0)); sc.addColorStop(1, c0);
    ctx.fillStyle = sc; ctx.fillRect(0, PH - 170, W, 190);
    ctx.fillStyle = c0; ctx.fillRect(0, PH, W, H - PH);
    ctx.textAlign = 'left';
    ctx.font = '800 40px ' + FONT; ctx.fillStyle = '#FFFFFF';
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    ctx.fillText(handle, 90, 112);
    ctx.restore();
    const kickC = (acc !== c0) ? acc : ink;
    const t = fit(title, 720, 3, s => '700 ' + s + 'px ' + SERIF, 110, 54);
    const tlh = t.size * 1.11;
    // kicker dinámico: siempre arriba del titular, sin tocarlo
    const kickY = 962 - t.size * 0.95 - 30;
    ctx.font = '700 36px ' + FONT;
    try { ctx.letterSpacing = '6px'; } catch (e) {}
    ctx.fillStyle = kickC; ctx.textAlign = 'left';
    ctx.fillText('DESTACADO', 90, kickY);
    try { ctx.letterSpacing = '0px'; } catch (e) {}
    ctx.font = '700 ' + t.size + 'px ' + SERIF;
    ctx.fillStyle = ink;
    ll(t.lines, 90, 962, tlh);
    const ruleY = 962 + (t.lines.length - 1) * tlh + 46;
    ctx.fillStyle = kickC; rr(90, ruleY, 160, 7, 3.5); ctx.fill();
    if (subtitle) {
      const sMax = t.lines.length >= 3 ? 1 : 2;
      const s = fit(subtitle, 720, sMax, z => '400 ' + z + 'px ' + FONT, 46, 32);
      // si ni así entra, se omite: mejor ausente que cortado a mitad de frase
      if (!s.overflow) {
        ctx.fillStyle = hexA(ink, 0.80);
        ll(s.lines, 90, ruleY + 52, s.size * 1.35);
      }
    }
  } else if (tpl === 'bold') {
    // ---- Tipográfico gigante: marca de agua + titular enorme ----
    const hasPhoto = photoBG((() => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, hexA(c0, 0.84)); g.addColorStop(1, hexA(c1, 0.84));
      return g;
    })());
    if (!hasPhoto) {
      ctx.fillStyle = c0; ctx.fillRect(0, 0, W, H);
      const hl = ctx.createRadialGradient(W / 2, H * 0.42, 100, W / 2, H * 0.42, 800);
      hl.addColorStop(0, 'rgba(255,255,255,.10)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl; ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.globalAlpha = 0.08; ctx.fillStyle = ink; ctx.textAlign = 'center';
    ctx.font = '900 330px ' + FONT;
    const wword = (title.split(' ')[0] || title).toUpperCase().slice(0, 10);
    ctx.fillText(wword, W / 2, 400);
    ctx.restore();
    ctx.textAlign = 'center';
    const t = fit(title.toUpperCase(), W - 160, 3, s => '900 ' + s + 'px ' + FONT, 168, 76);
    const tlh = t.size * 1.06, th = (t.lines.length - 1) * tlh, cy = 640;
    const lastAcc = (acc !== c0) ? acc : ink;
    t.lines.forEach((ln, i) => {
      ctx.fillStyle = (i === t.lines.length - 1 && t.lines.length > 1) ? lastAcc : ink;
      ctx.fillText(ln, W / 2, cy - th / 2 + i * tlh);
    });
    if (subtitle) {
      // pill de una línea: achica hasta entrar; si no entra, texto normal en 2 líneas
      let pz = 44, pw = 0;
      const maxPw = W - 240;
      while (pz > 28) {
        ctx.font = '700 ' + pz + 'px ' + FONT;
        pw = ctx.measureText(subtitle).width + 100;
        if (pw <= maxPw) break;
        pz -= 2;
      }
      if (pw <= maxPw) {
        pill(W / 2, cy + th / 2 + 112, subtitle, '700 ' + pz + 'px ' + FONT,
          'rgba(255,255,255,.16)', ink, { stroke: hexA(ink, 0.85), lw: 3, flat: true });
      } else {
        const s = fit(subtitle, W - 260, 2, z => '700 ' + z + 'px ' + FONT, 44, 30);
        if (!s.overflow) {
          ctx.fillStyle = hexA(ink, 0.88);
          cl(s.lines, W / 2, cy + th / 2 + 96, s.size * 1.32);
        }
      }
    }
    ctx.textAlign = 'left'; ctx.font = '700 40px ' + FONT;
    ctx.fillStyle = hexA(ink, 0.75);
    ctx.fillText(handle, 90, 1240);
  } else { // gradiente
    // ---- Moderno alineado a la izquierda: riel de acento, aire, jerarquía ----
    const hasPhoto = photoBG((() => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, hexA(c0, 0.68)); g.addColorStop(1, hexA(c1, 0.68));
      return g;
    })());
    if (!hasPhoto) { ctx.fillStyle = brandGrad(0, 0, 0, H); ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = acc; rr(84, 150, 14, 920, 7); ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = '700 38px ' + FONT;
    try { ctx.letterSpacing = '6px'; } catch (e) {}
    ctx.fillStyle = hexA(ink, 0.80);
    ctx.fillText(handle.toUpperCase(), 130, 152);
    try { ctx.letterSpacing = '0px'; } catch (e) {}
    const t = fit(title, W - 300, 4, s => '800 ' + s + 'px ' + FONT, 116, 76);
    const tlh = t.size * 1.17, th = (t.lines.length - 1) * tlh, cy = 640;
    ctx.fillStyle = ink;
    ctx.save();
    ctx.shadowColor = 'rgba(10,30,51,.22)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ll(t.lines, 130, cy - th / 2, tlh);
    ctx.restore();
    if (subtitle) {
      const s = fit(subtitle, W - 320, 3, z => '400 ' + z + 'px ' + FONT, 54, 34);
      if (!s.overflow) {
        ctx.fillStyle = hexA(ink, 0.82);
        ll(s.lines, 130, cy + th / 2 + 62, s.size * 1.33);
      }
    }
    ctx.fillStyle = acc; rr(130, H - 170, 130, 12, 6); ctx.fill();
  }

  // Logo del cliente: siempre visible pero discreto, esquina inferior derecha
  if (o.logoImg) {
    const lw = 150, lh = Math.min(150, 150 * o.logoImg.height / Math.max(1, o.logoImg.width));
    const pad = 40, card = 20;
    const bx = W - pad - lw - card * 2, by = H - pad - lh - card * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(10,30,51,.28)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    rr(bx, by, lw + card * 2, lh + card * 2, 26); ctx.fill();
    ctx.restore();
    ctx.drawImage(o.logoImg, bx + card, by + card, lw, lh);
  }
}


/* ---------- IDEAS: nosotros pensamos el contenido por vos ---------- */
// ---------- Checklist primeros pasos + próximo posteo recomendado ----------
function weekStartMonday(d){ const x = new Date(d); const day = (x.getDay()+6)%7; x.setHours(0,0,0,0); x.setDate(x.getDate()-day); return x; }
function postWeekDate(p){
  const s = p.scheduled_at || p.published_at; if(!s) return null;
  const d = new Date(s.length === 16 ? s.replace(' ','T') : s);
  return isNaN(d) ? null : d;
}
// Elige la idea con menos solapamiento de temas con los últimos posteos
function pickNextIdea(ideas, posts){
  const stop = new Set(['para','con','los','las','una','del','que','por','como','esta','este','esto','mas','muy','sin','sobre','entre','hasta','desde','todo','todos','toda','esas','esos','este','esta']);
  const recent = new Set();
  posts.slice(0, 10).forEach(p => {
    String(p.caption || '').toLowerCase().split(/[^a-záéíóúñü]+/).forEach(w => { if (w.length > 4 && !stop.has(w)) recent.add(w); });
  });
  let best = 0, bestScore = 999;
  ideas.forEach((idea, i) => {
    const words = String(idea.titulo || '').toLowerCase().split(/[^a-záéíóúñü]+/).filter(w => w.length > 4 && !stop.has(w));
    const overlap = words.filter(w => recent.has(w)).length;
    if (overlap < bestScore) { bestScore = overlap; best = i; }
  });
  return best;
}
function checklistHTML(postsCount){
  const p = PROFILE || {};
  const s1 = !!(p.business_name && p.business_name.trim());
  const s2 = !!p.ig_connected;
  const s3 = postsCount > 0;
  const done = [s1, s2, s3].filter(Boolean).length;
  if (done === 3) return '';
  const step = (ok, num, title, desc, action) => `
    <div class="check-step ${ok ? 'done' : ''}">
      <span class="ck-ico">${ok ? '✅' : num}</span>
      <span class="ck-txt"><b>${title}</b><span>${desc}</span></span>
      <span class="ck-act">${ok ? '<span class="ck-done">Listo</span>' : action}</span>
    </div>`;
  return `<div class="card check-card">
    <div class="check-head"><h3>🚀 Tus primeros pasos</h3><span class="badge b-scheduled">${done}/3</span></div>
    <div class="pz-refbar check-bar"><div style="width:${Math.round(done / 3 * 100)}%"></div></div>
    <div class="check-steps">
      ${step(s1, 1, 'Contanos tu negocio', 'Unos 2 minutos, una sola vez.', '<a class="btn btn-soft btn-sm" href="#/app/ajustes">Completar</a>')}
      ${step(s2, 2, 'Conectá tu Instagram', 'Dejá tu semana lista para publicar.', '<button class="btn btn-primary btn-sm" data-ig-connect>Conectar Instagram</button>')}
      ${step(s3, 3, 'Creá tu primer posteo', 'O armamos tu semana en 1 tap.', '<a class="btn btn-primary btn-sm" href="#/app/schedule">⚡ Armar mi semana</a>')}
    </div>
  </div>`;
}
// tag: 'semana' — la tarjeta vive en Mi semana; los ids se sufijan con el tag para no colisionar.
// La semana ya está completa: el héroe lo celebra y ofrece sumar o rehacer,
// en vez de invitar a "armar" de nuevo como si no hubiera nada.
function weekDoneCardHTML() {
  return `
  <div class="card" style="border:2px solid rgba(34,197,94,.45);background:#F2FAF4">
    <h3 style="margin:0 0 6px">✅ Tu semana está armada</h3>
    <p style="color:var(--mut);font-size:12.5px;line-height:1.6;margin:0 0 14px">Los posteos salen solos en sus horarios. Nada que hacer — solo vendé.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <a class="btn btn-soft btn-sm" data-opencreator style="cursor:pointer">✨ Sumar otro posteo</a>
      <button class="btn btn-ghost btn-sm" data-autopilot="semana">↻ Rehacer la semana</button>
      <button class="btn btn-ghost btn-sm" id="btnVaciarDrafts">🗑️ Vaciar</button>
    </div>
    <div id="apProg-semana"></div>
  </div>`;
}
// Estado vacío (sin borradores): UNA sola tarjeta. Antes eran dos
// ("autopilot" + "community manager") que decían lo mismo: las dos
// ofrecían armar posteos. El chat vive adentro como vía para pedidos
// puntuales, no como tarjeta separada que repite el mensaje.
function autopilotCardHTML(tag) {
  const t = tag || 'semana';
  const ppw = (ME && ME.posts_per_week) || 3;
  const planName = (ME && ME.plan ? ME.plan[0].toUpperCase() + ME.plan.slice(1) : 'Esencial');
  const planTag = ME && ME.is_trial ? `${planName} (${ME.trial_expired ? 'prueba terminada' : 'trial'})` : planName;
  const opts = [3, 5, 7].filter(v => v <= ppw).map(v => `<option value="${v}" ${v === ppw ? 'selected' : ''}>${v} posteos por semana</option>`).join('');
  return `
  <div class="card card-hi-yl" id="autopilotCard-${t}">
    <h3>🚀 Armemos tu semana</h3>
    <p style="color:var(--mut);font-size:13px;line-height:1.6;margin-bottom:6px">Textos, diseños y reels con tus fotos. Salen solos — y si algo no te gusta, lo frenás o lo cambiás en un toque.</p>
    <p style="font-size:11.5px;color:var(--dim);margin-bottom:16px">Tu plan: <b>${esc(planTag)}</b> · ${ppw} posteos${(ME && ME.reels_per_week) ? ` + ${ME.reels_per_week} reel${ME.reels_per_week > 1 ? 'es' : ''} 🎬` : ''} por semana${assetPhotos().length || assetVideos().length ? ` · 🖼️ usamos tus fotos y videos` : ''}${assetLogo() ? ' · con tu logo' : ''}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select id="apCount-${t}" style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;color:var(--txt);font-size:16px;padding:12px 14px;font-family:inherit;font-weight:600">
        ${opts}
      </select>
      <button class="btn btn-primary" data-autopilot="${t}">⚡ Armemos tu semana</button>
    </div>
    <div id="apProg-${t}" style="margin-top:16px"></div>
    <div style="margin-top:4px">
      <p style="color:var(--mut);font-size:12.5px;margin:14px 0 10px;padding-top:14px;border-top:1.5px solid var(--line)">¿O algo puntual? <a href="#/app/chat" style="color:var(--cel);font-weight:700">Preguntale a Posty 💬</a></p>
    </div>
  </div>`;
}

// 📷 Mis fotos y videos: tira finita arriba de Mi semana, sin tarjeta grande.
// Un toque para agregar, × para borrar. Las fotos alimentan los posteos automáticamente.
function mediaCardHTML() {
  const items = [...assetPhotos().map(a => ({ ...a, isVid: false })), ...assetVideos().map(a => ({ ...a, isVid: true }))].reverse(); // más nuevos primero
  return `
  <div id="mediaCard" class="media-stripbar" title="Mis fotos y videos — las usamos en tus posteos">
    <span class="media-strip-ico">📷</span>
    <div class="media-strip">${items.map(a => `
      <div class="media-thumb sm">
        ${a.isVid
          ? `<video src="${esc(a.file_path)}" muted playsinline preload="metadata"></video><span class="media-play">▶</span>`
          : `<img src="${esc(a.file_path)}" alt="Foto del negocio">`}
        <button class="media-del" data-mediadel="${a.id}" title="Borrar" aria-label="Borrar archivo">×</button>
      </div>`).join('')}</div>
    <button class="btn btn-soft btn-sm" id="btnMediaAdd" title="Agregar fotos o videos">＋</button>
    <input type="file" id="mediaFiles" accept="image/*,video/*" multiple style="display:none">
  </div>
  <div id="mediaMsg" style="margin:-8px 0 12px"></div>`;
}
function bindMediaCard() {
  const add = $('#btnMediaAdd'), inp = $('#mediaFiles');
  if (!add || !inp) return;
  add.onclick = () => inp.click();
  inp.onchange = async () => {
    const files = [...inp.files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!files.length) return;
    const msg = $('#mediaMsg');
    add.disabled = true;
    try {
      let ok = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        msg.innerHTML = `<div class="hint">⏳ Subiendo ${i + 1} de ${files.length}…</div>`;
        const r = await fetch('/api/assets?kind=' + (f.type.startsWith('video/') ? 'video' : 'photo'), {
          method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
        ok++;
      }
      msg.innerHTML = `<div class="okmsg">✅ ${ok === 1 ? 'Agregado' : ok + ' agregados'} — ya los usamos en tus posteos.</div>`;
      ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      render();
    } catch (e) { msg.innerHTML = `<div class="err">Error: ${esc(e.message)}</div>`; }
    add.disabled = false; inp.value = '';
  };
  $$('#mediaCard [data-mediadel]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Borrar? No se va a usar más en tus posteos nuevos.')) return;
    try { await api.delete('/api/assets/' + b.dataset.mediadel); } catch (e) {}
    ASSETS = await api.get('/api/assets').catch(() => ASSETS);
    render();
  });
}

// Fecha linda en español para la tarjeta de revisión ("mié 30 sep · 18:00")
function fmtWhenTxt(v) {
  if (!v) return 'Elegir día y hora';
  const d = new Date(v);
  if (isNaN(d)) return 'Elegir día y hora';
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const p2 = n => String(n).padStart(2, '0');
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
// Pill de fecha del borrador: fecha PROPUESTA (condicional, todavía no aceptado)
function fmtWhenPill(v) {
  const wt = fmtWhenTxt(v);
  return wt === 'Elegir día y hora' ? wt : `Saldría ${wt}`;
}
// Badge de estrategia (tipo de contenido) junto al pill de fecha
function tipoBadge(t) {
  const map = { promo: ['🎯', 'Promo'], tip: ['📚', 'Tip'], social: ['💬', 'Prueba social'], detras: ['🎬', 'Detrás de escena'], novedad: ['✨', 'Novedad'] };
  if (!map[t]) return '';
  return `<span class="tipo-badge">${map[t][0]} ${map[t][1]}</span>`;
}
function reviewCardHTML(drafts, slots, title) {  const s = slots || [];
  prefetchMedia(drafts);
  const n = drafts.length;
  // Cabecera estilo Instagram: el borrador se muestra como el posteo que va a ser (WYSIWYG).
  const bizName = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'Mi negocio';
  const bizLogo = (typeof assetLogo === 'function' ? assetLogo() : null);
  const bizColor = (typeof brandColors === 'function' && brandColors()[0]) || '#2793C8';
  const ava = bizLogo
    ? `<img src="${esc(bizLogo.file_path)}" alt="" class="igmock-ava">`
    : `<span class="igmock-ava" style="background:${esc(bizColor)}">${esc((bizName || 'M')[0].toUpperCase())}</span>`;
  return `
  <div class="card" id="reviewCard" style="border:2px solid var(--yel)">
    <h3 style="margin:0 0 6px">${title || '📋 Tus posteos de la semana'}</h3>
    <p style="color:var(--mut);font-size:12.5px;margin:0 0 4px">Revisalos y aceptalos — al aceptar, salen solos a la hora indicada.</p>
    ${n ? `<button class="btn btn-primary btn-block" id="btnActivateWeek" style="margin:6px 0 10px">🚀 Activar mi semana</button>` : ''}
    <div class="igmock-carousel">
      ${drafts.length > 1 ? `<button class="car-arrow left" data-carprev aria-label="Posteo anterior">‹</button>` : ''}
      <div class="igmock-track">
    ${drafts.map((d, i) => `
    <div class="igmock">
      <div class="igmock-head">
        ${ava}
        <span class="igmock-name">${esc(bizName)}</span>
        <span class="igmock-count">${i + 1} de ${n}</span>
      </div>
      <div class="igmock-media">
        ${(() => {
          // Carrusel: slides swipeables dentro del preview (portada = image_path)
          let cpaths = [];
          if (d.media_type === 'carousel') {
            try { cpaths = JSON.parse(d.carousel_paths || '[]'); } catch (e) { cpaths = []; }
            if (!Array.isArray(cpaths) || !cpaths.length) cpaths = [d.image_path];
          }
          if (d.media_type === 'carousel' && cpaths.length > 1) {
            return `<div class="carslide-carousel">
              <div class="carslide-track">
                ${cpaths.map((p, k) => `
                <div class="carslide">
                  <img src="${esc(mv(p, 640))}" data-full="${esc(p)}" data-lightbox="${esc(p)}" onerror="__imgFb(this)" loading="lazy" alt="Foto ${k + 1} del carrusel">
                  <span class="carslide-num">${k + 1}/${cpaths.length}</span>
                </div>`).join('')}
              </div>
              <button class="car-arrow sm left" data-csprev aria-label="Foto anterior">‹</button>
              <button class="car-arrow sm right" data-csnext aria-label="Foto siguiente">›</button>
              <div class="carslide-dots">${cpaths.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>
            </div>
            <span class="igmock-badge">🎞️ Carrusel</span>`;
          }
          if (!d.image_path && d.media_type !== 'video') {
            return `<div class="igmock-nodesign"><span>♻️ Republicado con texto fresco</span><button class="btn btn-primary" data-revregen="${d.id}">✨ Generar diseño</button></div>`;
          }
          return `${d.media_type === 'video'
            ? `<video src="${esc(d.image_path)}" muted playsinline preload="metadata" data-lightbox="${esc(d.image_path)}" data-video="1"></video>`
            : `<img class="vimg" src="${esc(mv(d.image_path, 640))}" style="background-image:url('${esc(mv(d.image_path, 24))}')" data-full="${esc(d.image_path)}" data-lightbox="${esc(d.image_path)}" onerror="__imgFb(this)" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} alt="Diseño del borrador ${i + 1}">`}
          ${d.media_type === 'video' ? `<span class="igmock-badge">🎬 Reel</span>` : ''}
          ${d.media_type === 'story' ? `<span class="igmock-badge">📱 Historia</span>` : ''}`;
        })()}
      </div>
      <div class="igmock-body">
        <div class="rev-preview" data-revpreview="${d.id}">${esc((d.caption || '').trim() || 'Sin texto todavía')}</div>
        ${d.hashtags ? `<div class="rev-hashprev" data-revhashprev="${d.id}">${esc(d.hashtags)}</div>` : `<div class="rev-hashprev" data-revhashprev="${d.id}" style="display:none"></div>`}
        ${((d.caption || '').length > 120 || (d.hashtags || '').length > 80) ? `<button class="rev-more" data-revmore="${d.id}">ver más ▾</button>` : ''}
        <div data-revfields="${d.id}" hidden>
          <textarea class="in" data-revcap="${d.id}" rows="3" placeholder="Texto del posteo...">${esc(d.caption || '')}</textarea>
          <input class="in" data-revhash="${d.id}" value="${esc(d.hashtags || '')}" placeholder="#tuMarca #rubro" aria-label="Hashtags del borrador ${i + 1}" style="margin-top:6px;padding:8px 10px">
        </div>
        <button class="igmock-accept" data-revaccept="${d.id}">✅ Aceptar<span data-revacceptwhen="${d.id}">${(() => { const wt = fmtWhenTxt(isoToLocalInput(s[i] || '')); return wt === 'Elegir día y hora' ? '' : ` · sale ${wt}`; })()}</span></button>
        ${d.needs_review ? '' : `<button class="igmock-now" data-pubnow="${d.id}" style="margin-top:8px">⚡ Publicar ahora</button>`}
        <div class="igmock-whenrow"><label class="igmock-when2"><span>📅</span><span data-revwhentxt="${d.id}">${fmtWhenPill(isoToLocalInput(s[i] || ''))}</span><input type="datetime-local" data-revwhen="${d.id}" value="${isoToLocalInput(s[i] || '')}" aria-label="Día y hora para el borrador ${i + 1}" class="rev-dt-hide"></label>${tipoBadge(d.tipo)}</div>
        <div class="igmock-icos" style="margin-top:8px">
          <button data-revedit="${d.id}">✏️ Editar</button>
          ${d.media_type === 'video' ? '' : `<button data-revregen="${d.id}" title="Generar otro diseño para este posteo">✨ Otro diseño</button>`}
          ${(d.media_type === 'video' || d.media_type === 'carousel') ? '' : `<button data-revvars="${d.id}" title="Ver 3 opciones nuevas de este posteo">🔄 Otras 3</button>`}
          ${d.media_type === 'video' ? `<button data-revvideo="${d.id}" title="Cambiar el video de este posteo">🎬 Otro video</button>` : `<button data-revphoto="${d.id}" title="Cambiar la foto de este posteo">🖼️ Otra foto</button><button data-revphotopick=\"${d.id}\" title=\"Elegir una foto de tu librería o subir una nueva\">📷 Foto</button>${d.media_type !== 'carousel' ? `<button data-revrestyle=\"${d.id}\" title=\"Restylear TU foto con el estilo elegido arriba (mismo producto, otro estilo)\">🎨 Restylear</button><button data-revenhance=\"${d.id}\" title=\"Mejorar la foto: luz, nitidez y color en un tap\">✨ Mejorar</button><button data-revcarousel=\"${d.id}\" title=\"Convertir en carousel: portada que frena + 3 placas\">🎠 Carousel</button><button data-revreel=\\\"${d.id}\\\" title=\\\"Armar reel: Ken Burns + headline, 1080×1920 (máx 2/semana)\\\">🎬 Reel</button>` : ''}`}
          <button class="danger" data-revdel="${d.id}">🗑️</button>
        </div>
        ${d.strategy_why ? `<div style="font-size:11px;color:var(--dim);line-height:1.5;margin-top:8px;overflow-wrap:anywhere">💡 <b>Por qué:</b> ${esc(d.strategy_why)}</div>` : ''}
        ${d.media_type === 'video' && d.script ? `<div style="font-size:11px;color:var(--dim);line-height:1.6;margin-top:8px;overflow-wrap:anywhere">🎬 <b>Guion:</b><br>${(() => { try { return JSON.parse(d.script).map((sc, k) => `${k + 1}. <b>${esc(sc.seg || '')}</b> ${esc(sc.texto || sc.visual || '')}`).join('<br>'); } catch (e) { return ''; } })()}</div>` : ''}
        <button class="rev-nowsub" data-revnow="${d.id}">o publicalo ahora →</button>
        <div class="aiedit" id="aiedit-${d.id}" hidden>
          <div class="aiedit-row">
            <input class="in" id="aiedit-inp-${d.id}" placeholder="¿Qué le cambio? Ej: más corto, sin emojis…" maxlength="200" autocomplete="off">
            <button class="btn btn-primary btn-sm" id="aiedit-go-${d.id}">Aplicar</button>
          </div>
          <button class="rev-nowsub" id="aiedit-manual-${d.id}">o editalo a mano</button>
          <div class="aiedit-msg" id="aiedit-msg-${d.id}"></div>
        </div>
        <div class="aiedit" id="aiphoto-${d.id}" hidden>
          <div class="aiedit-row">
            <input class="in" id="aiphoto-inp-${d.id}" placeholder="¿Qué foto uso? Ej: la del local…" maxlength="200" autocomplete="off">
            <button class="btn btn-primary btn-sm" id="aiphoto-go-${d.id}">Aplicar</button>
          </div>
          <div class="aiedit-row" style="margin-top:8px">
            <select class="in" id="aistyle-sel-${d.id}" title="Elegí un estilo para regenerar la foto">
              <option value="">✨ Estilo: automático</option>
            </select>
          </div>
          <button class="rev-nowsub" id="aiphoto-manual-${d.id}">o elegí la foto vos</button>
          <div class="aiedit-msg" id="aiphoto-msg-${d.id}"></div>
        </div>
        <div id="revph-${d.id}"></div>
        <div id="revvar-${d.id}"></div>
        <div id="revnowm-${d.id}"></div>
      </div>
    </div>`).join('')}
      </div>
      ${drafts.length > 1 ? `<button class="car-arrow right" data-carnext aria-label="Posteo siguiente">›</button>` : ''}
      ${drafts.length > 1 ? `<div class="igmock-dots">${drafts.map((_, j) => `<i class="${j === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
    </div>
    <div id="revMsg"></div>
  </div>`;
}

// Edición de un borrador por IA (texto o foto): el cliente lo pide en lenguaje
// natural y la IA lo aplica directo vía /api/ideas/chat (bloque ```edit).
async function runAiEdit(id, kind) {
  const idx = REVIEW_DRAFTS.findIndex(d => String(d.id) === String(id));
  const inp = document.getElementById(kind === 'text' ? `aiedit-inp-${id}` : `aiphoto-inp-${id}`);
  const msg = document.getElementById(kind === 'text' ? `aiedit-msg-${id}` : `aiphoto-msg-${id}`);
  const go = document.getElementById(kind === 'text' ? `aiedit-go-${id}` : `aiphoto-go-${id}`);
  if (!inp || !msg || idx < 0) return;
  const instruction = (inp.value || '').trim();
  if (!instruction) { msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">Contame qué le cambio 👆</span>`; inp.focus(); return; }
  const n = idx + 1, total = REVIEW_DRAFTS.length;
  const text = kind === 'text'
    ? `El posteo ${n} de ${total}: ${instruction}`
    : `El posteo ${n} de ${total}: cambiá la foto — ${instruction}`;
  if (go) go.disabled = true;
  msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">⏳ La IA lo está aplicando…</span>`;
  try {
    const body = {
      messages: [{ role: 'user', text }],
      drafts: REVIEW_DRAFTS.map(d => ({ id: d.id, caption: d.caption, when: d.scheduled_at })),
    };
    if (kind === 'photo') {
      const lib = assetPhotos().slice().reverse().slice(0, 6);
      if (!lib.length) {
        // Sin fotos no hay nada que la IA pueda elegir: llevar al picker manual
        msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">Primero subí una foto 📸 Elegila vos:</span>`;
        setTimeout(() => {
          const panel = document.getElementById(`aiphoto-${id}`);
          if (panel) panel.hidden = true;
          togglePhotoPicker(+id);
        }, 800);
        if (go) go.disabled = false;
        return;
      }
      body.photoPaths = lib.map(p => p.file_path);
      body.library = await chatLibThumbs();
    }
    const r = await api.post('/api/ideas/chat', body, { timeout: 60000 });
    if (r.edit && r.edit.ok) {
      msg.innerHTML = `<span style="color:#1B7A3D;font-size:11.5px;font-weight:700">✅ ${esc(r.reply || 'Listo, aplicado')}</span>`;
      inp.value = '';
      setTimeout(() => { try { render(); } catch (e) {} }, 900);
    } else {
      msg.innerHTML = `<span style="font-size:11.5px">${esc(r.reply || 'No pude aplicarlo, probá de nuevo')}</span>`;
    }
  } catch (e) {
    msg.innerHTML = `<span style="color:#B3402E;font-size:11.5px">${esc(e.message || 'Error, probá de nuevo')}</span>`;
  }
  if (go) go.disabled = false;
}
// "🎨 Restylear": restylea la foto ACTUAL del borrador con el estilo elegido en
// el select "✨ Estilo" (mismo producto, otro estilo). Si no eligió estilo, abre
// el panel para que lo elija.
async function restyleDraftPhoto(id, btn) {
  const sel = document.getElementById(`aistyle-sel-${id}`);
  const msg = document.getElementById(`aiphoto-msg-${id}`);
  const code = sel && sel.value;
  if (!code) {
    const panel = document.getElementById(`aiphoto-${id}`);
    if (panel) panel.hidden = false;
    if (msg) msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">Elegí un estilo arriba 👆 y tocá 🎨 Restylear</span>`;
    if (sel) sel.focus();
    return;
  }
  const draft = REVIEW_DRAFTS.find(d => String(d.id) === String(id));
  if (btn) btn.disabled = true;
  if (msg) msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">⏳ Restyleando tu foto con ${esc(code)}…</span>`;
  try {
    const r = await api.post(`/api/drafts/${id}/photo-restyle`, { style: code }, { timeout: 180000 });
    if (r && r.ok && r.path) {
      if (draft) { draft.image_path = r.path; draft.style_code = r.style; }
      if (msg) msg.innerHTML = `<span style="color:#1B7A3D;font-size:11.5px;font-weight:700">✅ Tu foto, versión ${esc(code)}</span>`;
      setTimeout(() => { try { render(); } catch (e) {} }, 900);
    } else {
      if (msg) msg.innerHTML = `<span style="font-size:11.5px">${esc((r && r.error) || 'No se pudo, probá de nuevo')}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:#B3402E;font-size:11.5px">${esc(e.message || 'Error')}</span>`;
  }
  if (btn) btn.disabled = false;
  if (sel) sel.value = '';
}
// "✨ Mejorar": rescate de foto mediocre en un tap (luz, nitidez, color).
async function enhanceDraftPhoto(id, btn) {
  const msg = document.getElementById(`aiphoto-msg-${id}`);
  const panel = document.getElementById(`aiphoto-${id}`);
  if (panel) panel.hidden = false;
  const draft = REVIEW_DRAFTS.find(d => String(d.id) === String(id));
  if (btn) btn.disabled = true;
  if (msg) msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">⏳ Mejorando la foto…</span>`;
  try {
    const r = await api.post(`/api/drafts/${id}/photo-enhance`, {}, { timeout: 180000 });
    if (r && r.ok && r.path) {
      if (draft) draft.image_path = r.path;
      if (msg) msg.innerHTML = `<span style="color:#1B7A3D;font-size:11.5px;font-weight:700">✅ Foto mejorada</span>`;
      setTimeout(() => { try { render(); } catch (e) {} }, 900);
    } else {
      if (msg) msg.innerHTML = `<span style="font-size:11.5px">${esc((r && r.error) || 'No se pudo, probá de nuevo')}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:#B3402E;font-size:11.5px">${esc(e.message || 'Error')}</span>`;
  }
  if (btn) btn.disabled = false;
}
// "🎠 Carousel": convierte el borrador en carousel (portada + 3 placas).
async function carouselDraft(id, btn) {
  const msg = document.getElementById(`aiphoto-msg-${id}`);
  const panel = document.getElementById(`aiphoto-${id}`);
  if (panel) panel.hidden = false;
  const draft = REVIEW_DRAFTS.find(d => String(d.id) === String(id));
  if (btn) btn.disabled = true;
  if (msg) msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">⏳ Armándo el carousel (portada + 3 placas)…</span>`;
  try {
    const r = await api.post('/api/carousel-generate', { postId: id }, { timeout: 300000 });
    if (r && r.ok) {
      if (draft) { draft.media_type = 'carousel'; draft.carousel_paths = r.paths; draft.image_path = r.cover; }
      if (msg) msg.innerHTML = `<span style="color:#1B7A3D;font-size:11.5px;font-weight:700">✅ Carousel listo 🎠</span>`;
      setTimeout(() => { try { render(); } catch (e) {} }, 900);
    } else {
      if (msg) msg.innerHTML = `<span style="font-size:11.5px">${esc((r && r.error) || 'No se pudo, probá de nuevo')}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:#B3402E;font-size:11.5px">${esc(e.message || 'Error')}</span>`;
  }
  if (btn) btn.disabled = false;
}
// "🎬 Reel": arma un reel automático (Ken Burns + headline animado) desde el borrador.
async function reelDraft(id, btn) {
  const msg = document.getElementById(`aiphoto-msg-${id}`);
  const panel = document.getElementById(`aiphoto-${id}`);
  if (panel) panel.hidden = false;
  if (btn) btn.disabled = true;
  if (msg) msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">⏳ Armándo el reel (Ken Burns + headline)…</span>`;
  try {
    const r = await api.post('/api/reel-generate', { postId: id }, { timeout: 300000 });
    if (r && r.ok) {
      if (msg) msg.innerHTML = `<span style="color:#1B7A3D;font-size:11.5px;font-weight:700">✅ Reel listo 🎬</span><br><span style="font-size:11px;color:var(--mut)">${esc(r.audioNote || '')}</span>`;
      setTimeout(() => { try { render(); } catch (e) {} }, 2600);
    } else {
      if (msg) msg.innerHTML = `<span style="font-size:11.5px">${esc((r && r.error) || 'No se pudo, probá de nuevo')}</span>`;
    }
  } catch (e) {
    if (msg) msg.innerHTML = `<span style="color:#B3402E;font-size:11.5px">${esc(e.message || 'Error')}</span>`;
  }
  if (btn) btn.disabled = false;
}
// FEATURE-ESTILOS: lista de estilos cacheada + llenado de los selects "✨ Estilo".
let IMAGE_STYLES_CACHE = null;async function imageStylesList() {
  if (IMAGE_STYLES_CACHE) return IMAGE_STYLES_CACHE;
  try {
    const r = await api.get('/api/image-styles');
    IMAGE_STYLES_CACHE = (r && r.styles) || [];
  } catch (e) { IMAGE_STYLES_CACHE = []; }
  return IMAGE_STYLES_CACHE;
}
async function fillStyleSelects() {
  const styles = await imageStylesList();
  $$('#reviewCard [id^="aistyle-sel-"]').forEach(sel => {
    if (sel.dataset.filled) return;
    sel.dataset.filled = '1';
    for (const s of styles) {
      const o = document.createElement('option');
      o.value = s.code;
      o.textContent = `${s.code} · ${s.name}${s.brandSafe ? '' : ' 🎲'}`;
      sel.appendChild(o);
    }
    sel.onchange = async () => {
      const code = sel.value;
      if (!code) return;
      const id = sel.id.replace('aistyle-sel-', '');
      const msg = document.getElementById(`aiphoto-msg-${id}`);
      const draft = REVIEW_DRAFTS.find(d => String(d.id) === String(id));
      if (msg) msg.innerHTML = `<span style="color:var(--mut);font-size:11.5px">⏳ Regenerando la foto con ${esc(code)}…</span>`;
      try {
        const r = await api.post(`/api/drafts/${id}/photo-style`, { style: code }, { timeout: 180000 });
        if (r && r.ok && r.path) {
          if (draft) { draft.image_path = r.path; draft.style_code = r.style; }
          if (msg) msg.innerHTML = `<span style="color:#1B7A3D;font-size:11.5px;font-weight:700">✅ Foto nueva con ${esc(code)}</span>`;
          setTimeout(() => { try { render(); } catch (e) {} }, 900);
        } else {
          if (msg) msg.innerHTML = `<span style="font-size:11.5px">${esc((r && r.error) || 'No se pudo, probá de nuevo')}</span>`;
        }
      } catch (e) {
        if (msg) msg.innerHTML = `<span style="color:#B3402E;font-size:11.5px">${esc(e.message || 'Error')}</span>`;
      }
      sel.value = '';
    };
  });
}

function bindReview() {
  // Carrusel de borradores: flechas + puntitos para que sea obvio que hay más
  $$('.igmock-carousel').forEach(car => {
    const track = car.querySelector('.igmock-track');
    if (!track) return;
    const cards = [...track.querySelectorAll('.igmock')];
    const dots = car.querySelector('.igmock-dots');
    const step = () => (cards[0] ? cards[0].offsetWidth + 16 : track.clientWidth);
    const paint = () => {
      if (!dots || !cards.length) return;
      const idx = Math.min(cards.length - 1, Math.max(0, Math.round(track.scrollLeft / step())));
      dots.querySelectorAll('i').forEach((d, j) => d.classList.toggle('on', j === idx));
    };
    track.addEventListener('scroll', paint, { passive: true });
    paint();
    car.querySelectorAll('[data-carprev],[data-carnext]').forEach(b => b.onclick = () => {
      track.scrollBy({ left: (b.hasAttribute('data-carnext') ? 1 : -1) * step(), behavior: 'smooth' });
    });
  });
  // Slides del carrusel DENTRO de cada borrador (independiente del carrusel de borradores)
  $$('.carslide-carousel').forEach(car => {
    const track = car.querySelector('.carslide-track');
    if (!track) return;
    const slides = [...track.querySelectorAll('.carslide')];
    const dots = car.querySelector('.carslide-dots');
    const step = () => track.clientWidth;
    const paint = () => {
      if (!dots || !slides.length) return;
      const idx = Math.min(slides.length - 1, Math.max(0, Math.round(track.scrollLeft / step())));
      dots.querySelectorAll('i').forEach((d, j) => d.classList.toggle('on', j === idx));
    };
    track.addEventListener('scroll', paint, { passive: true });
    paint();
    car.querySelectorAll('[data-csprev],[data-csnext]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      track.scrollBy({ left: (b.hasAttribute('data-csnext') ? 1 : -1) * step(), behavior: 'smooth' });
    });
  });
  $$('#reviewCard [data-lightbox]').forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    openLightbox(el.dataset.lightbox, el.dataset.video === '1');
  });
  // Guardar el texto al salir del campo (queda en borrador, sin programar)
  $$('[data-revcap]').forEach(ta => ta.addEventListener('change', async () => {
    try { await api.patch('/api/posts/' + ta.dataset.revcap, { action: 'save-draft', caption: ta.value }); }
    catch (e) { /* se reintenta al programar */ }
  }));
  // Guardar los hashtags al salir del campo
  $$('[data-revhash]').forEach(inp => inp.addEventListener('change', async () => {
    try { await api.patch('/api/posts/' + inp.dataset.revhash, { action: 'save-draft', hashtags: inp.value }); } catch (e) { /* se reintenta al programar */ }
    const hp = document.querySelector(`[data-revhashprev="${inp.dataset.revhash}"]`);
    if (hp) { hp.textContent = inp.value || ''; hp.style.display = inp.value ? '' : 'none'; }
  }));
  // Texto colapsado por defecto: "Editar texto" expande los campos
  // Editar por IA: el cliente dice qué cambiar y la IA lo aplica al borrador
  $$('[data-revedit]').forEach(b => b.onclick = () => {
    const id = b.dataset.revedit;
    const panel = document.getElementById(`aiedit-${id}`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) track('draft_edit', { id });
    if (!panel.hidden) { const i = document.getElementById(`aiedit-inp-${id}`); if (i) i.focus({ preventScroll: true }); }
  });
  $$('#reviewCard [id^="aiedit-manual-"]').forEach(b => b.onclick = () => {
    const id = b.id.replace('aiedit-manual-', '');
    const f = document.querySelector(`[data-revfields="${id}"]`);
    const p = document.querySelector(`[data-revpreview="${id}"]`);
    const panel = document.getElementById(`aiedit-${id}`);
    if (panel) panel.hidden = true;
    if (!f || !p) return;
    f.hidden = false;
    p.style.display = 'none';
    const ta = f.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true });
  });
  $$('#reviewCard [id^="aiedit-go-"]').forEach(b => b.onclick = () => runAiEdit(b.id.replace('aiedit-go-', ''), 'text'));
  // Otra foto por IA: el cliente describe qué foto quiere y la IA la elige de su librería
  $$('#reviewCard [id^="aiphoto-go-"]').forEach(b => b.onclick = () => runAiEdit(b.id.replace('aiphoto-go-', ''), 'photo'));
  // Enter en los campos de edición por IA también aplica
  $$('#reviewCard [id^="aiedit-inp-"]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') runAiEdit(i.id.replace('aiedit-inp-', ''), 'text'); }));
  $$('#reviewCard [id^="aiphoto-inp-"]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') runAiEdit(i.id.replace('aiphoto-inp-', ''), 'photo'); }));
  $$('#reviewCard [id^="aiphoto-manual-"]').forEach(b => b.onclick = () => {
    const id = b.id.replace('aiphoto-manual-', '');
    const panel = document.getElementById(`aiphoto-${id}`);
    if (panel) panel.hidden = true;
    togglePhotoPicker(+id);
  });
  // FEATURE-ESTILOS: picker "✨ Estilo" — regenera SOLO la foto del borrador
  // con el estilo elegido (mantiene caption, hashtags y horario).
  fillStyleSelects();
  // Al guardar el caption, refrescar el preview
  $$('[data-revcap]').forEach(ta => ta.addEventListener('change', () => {
    const p = document.querySelector(`[data-revpreview="${ta.dataset.revcap}"]`);
    if (p) p.textContent = (ta.value || '').trim() || 'Sin texto todavía';
  }));
  // La fecha se muestra linda en español; al cambiarla se refresca el texto visible
  $$('#reviewCard [data-revwhen]').forEach(inp => inp.addEventListener('change', () => {
    const t = document.querySelector(`#reviewCard [data-revwhentxt="${inp.dataset.revwhen}"]`);
    if (t) t.textContent = fmtWhenPill(inp.value);
    const ab = document.querySelector(`#reviewCard [data-revacceptwhen="${inp.dataset.revwhen}"]`);
    if (ab) { const wt = fmtWhenTxt(inp.value); ab.textContent = wt === 'Elegir día y hora' ? '' : ` · sale ${wt}`; }
  }));
  // Regenerar un borrador (↻): nuevo diseño y nuevo texto del mismo tema, en el lugar
  $$('[data-revregen]').forEach(b => b.onclick = () => regenDraft(+b.dataset.revregen, b));
  // "🔄 Otras 3": 3 variantes nuevas (imagen + texto) para elegir, sin tocar el borrador
  $$('[data-revvars]').forEach(b => b.onclick = () => draftVariants(+b.dataset.revvars, b));
  // Cambiar la foto de un borrador: tira de fotos + subir nueva
  $$('[data-revphoto]').forEach(b => b.onclick = () => {
    const id = String(b.dataset.revphoto);
    const panel = document.getElementById(`aiphoto-${id}`);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { const i = document.getElementById(`aiphoto-inp-${id}`); if (i) i.focus({ preventScroll: true }); }
  });
  // FEATURE-FOTO-BORRADOR: "📷 Foto" abre el picker directo (librería + subir + quitar foto)
  $$('[data-revphotopick]').forEach(b => b.onclick = () => toggleDraftPhotoPicker(+b.dataset.revphotopick));
  // "🎨 Restylear": restylea la foto ACTUAL con el estilo elegido en el select
  $$('[data-revrestyle]').forEach(b => b.onclick = () => restyleDraftPhoto(+b.dataset.revrestyle, b));
  // "✨ Mejorar": un tap rescata la foto (luz, nitidez, color)
  $$('[data-revenhance]').forEach(b => b.onclick = () => enhanceDraftPhoto(+b.dataset.revenhance, b));
  // "🎠 Carousel": convierte el borrador en carousel automático
  $$('[data-revcarousel]').forEach(b => b.onclick = () => carouselDraft(+b.dataset.revcarousel, b));   // "🎬 Reel": arma un reel automático desde el borrador
   $$('[data-revreel]').forEach(b => b.onclick = () => reelDraft(+b.dataset.revreel, b));
  // Cambiar el video de un borrador reel: tira de videos + subir nuevo
  $$('[data-revvideo]').forEach(b => b.onclick = () => toggleVideoPicker(+b.dataset.revvideo, b));
  // Eliminar borrador (señal honesta: lo borró = no le gustó; va antes del DELETE)
  // Track 4 (agregado): si era el último borrador de la semana, el servidor
  // dispara la reconstrucción con otro enfoque y lo avisa en la respuesta.
// Overlay con chips: ¿qué no le gustó del borrador? (patrón de pickLogoImage)
function pickRejectReason() {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.setAttribute('style', 'position:fixed;inset:0;background:rgba(10,30,51,.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px');
    const box = document.createElement('div');
    box.setAttribute('style', 'background:#fff;border-radius:18px;padding:18px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)');
    box.innerHTML = '<div style="font-weight:800;font-size:14px;margin-bottom:4px">¿Qué no te gustó?</div>' +
      '<div style="font-size:11.5px;color:#47617A;margin-bottom:12px">Contame y no lo repito en tu próxima semana.</div>';
    const chips = [
      ['generico', 'Muy genérico'],
      ['estilo', 'No es mi estilo'],
      ['avatar', 'El logo salió raro'],
      ['representa', 'No me representa'],
    ];
    chips.forEach(([key, label]) => {
      const c = document.createElement('button');
      c.setAttribute('style', 'display:block;width:100%;text-align:left;border:2px solid #E3EEF6;border-radius:12px;background:#fff;padding:10px 12px;margin-bottom:8px;font-size:13px;font-weight:600;cursor:pointer');
      c.textContent = label;
      c.onclick = () => close(() => resolve(key));
      box.appendChild(c);
    });
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-soft btn-sm';
    cancel.setAttribute('style', 'margin-top:4px;width:100%');
    cancel.textContent = 'Cancelar';
    box.appendChild(cancel);
    ov.appendChild(box);
    const close = (fn) => { try { document.body.removeChild(ov); } catch (_) {} fn(); };
    cancel.onclick = () => close(() => resolve(null));
    ov.addEventListener('click', (e) => { if (e.target === ov) close(() => resolve(null)); });
    document.body.appendChild(ov);
  });
}
  $$('[data-revdel]').forEach(b => b.onclick = async () => {
    const reason = await pickRejectReason();
    if (!reason) return; // canceló: no pasa nada
    const pid = b.dataset.revdel;
    try { await api.post(`/api/posts/${pid}/reject-reason`, { reason }); } catch (e) {}
    try { await api.post(`/api/posts/${pid}/signal`, { signal: 'rejected' }); } catch (e) {}
    let delRes = null;
    try { delRes = await api.delete('/api/posts/' + pid); } catch (e) {}
    track('draft_delete', { id: pid });
    await render(); // el DOM se escribe tras los awaits: la barrita va después
    const rb = delRes && delRes.rebuild;
    if (rb && rb.rebuilding) rebuildWatchStart();
    else if (rb && rb.reason === 'frustrated') rebuildFrustrated();
  });
  // Publicar un borrador AHORA (sin esperar la programación)
  $$('[data-revnow]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.revnow;
    b.disabled = true;
    try {
      const ta = document.querySelector(`[data-revcap="${id}"]`);
      if (ta) await api.patch('/api/posts/' + id, { action: 'save-draft', caption: ta.value }).catch(() => {});
    } catch (e) {}
    const mount = document.getElementById('revnowm-' + id);
    await publishNowFlow(id, mount);
    render();
  });
  // "⚡ Publicar ahora" (v240): botón visible junto a Aceptar — el link
  // discreto data-revnow existía pero no se encontraba; mismo flujo y mount.
  $$('[data-pubnow]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.pubnow;
    b.disabled = true;
    try {
      const ta = document.querySelector(`[data-revcap="${id}"]`);
      if (ta) await api.patch('/api/posts/' + id, { action: 'save-draft', caption: ta.value }).catch(() => {});
    } catch (e) {}
    const mount = document.getElementById('revnowm-' + id);
    await publishNowFlow(id, mount);
    render();
  });
  // Aceptar UN borrador: se programa con su día/hora y sale solo
  $$('[data-revaccept]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.revaccept;
    const m = $('#revMsg');
    // Sin Instagram conectado, "sale solo" es mentira: pedir conectar antes de aceptar
    if (!(PROFILE && PROFILE.ig_connected)) {
      if (m) m.innerHTML = `<div class="err">📸 Conectá tu Instagram primero — si no, los posteos no pueden salir solos.<br><br><button class="btn btn-primary btn-sm" id="revIgGo">Conectar Instagram →</button></div>`;
      const g = $('#revIgGo');
      if (g) g.onclick = () => igConnectHere();
      m.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    b.disabled = true;
    try {
      const ta = document.querySelector(`[data-revcap="${id}"]`);
      const winp = document.querySelector(`#reviewCard [data-revwhen="${id}"]`);
      // 2026-10-09: en el carrusel del home no hay picker — usar el día propuesto.
      const proposed = b.dataset.proposed;
      const when = (winp && winp.value) ? new Date(winp.value).toISOString() : (proposed ? new Date(proposed).toISOString() : null);
      const pr = await api.patch('/api/posts/' + id, { scheduled_at: when, caption: ta ? ta.value : undefined });
      try { await api.post(`/api/posts/${id}/signal`, { signal: 'approved' }); } catch (e) {}
      try { await api.post('/api/funnel', { event: 'week_accepted' }); } catch (e) {}
      track('draft_accept', { id });
      // v215: la confirmación dice CUÁNDO sale (día y hora) — el servidor
      // devuelve la fecha real en la respuesta — y si es de la semana que
      // viene, se nota. Antes este flujo podía terminar en el modal de
      // tope con la semana actual llena aunque el posteo fuera de la otra.
      let whenTxt = '';
      let whenNextWeek = false;
      try {
        if (pr && pr.scheduled_at) {
          const dt = pcParseDate(pr.scheduled_at);
          if (dt) {
            const tzA = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
            const hh = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tzA });
            whenTxt = pcFmtDayLong(dt, tzA) + ' a las ' + hh;
            whenNextWeek = !!(pr.week_key && pr.week_key > albumMondayKey());
          }
        }
      } catch (e) {}
      // 2026-10-10: el festejo de "semana completa" solo si NO quedan borradores.
      // REVIEW_DRAFTS puede estar vacío en el home (el carrusel usa allPosts).
      let remaining = 0;
      try {
        const cards = document.querySelectorAll('#hsWeekList .igmock-fixed');
        // Contar tarjetas que todavía son borrador (tienen botón Aceptar, distinto al recién aceptado)
        cards.forEach(c => {
          const btn = c.querySelector('[data-revaccept]');
          if (btn && +btn.dataset.revaccept !== id && !btn.disabled) remaining++;
        });
        // Fallback: REVIEW_DRAFTS si el carrusel no está visible
        if (!cards.length) remaining = REVIEW_DRAFTS.filter(d => d.id !== id).length;
      } catch (e) { remaining = REVIEW_DRAFTS.filter(d => d.id !== id).length; }
      if (remaining === 0) {
        // Festejo: aceptar se siente como un logro, no como un trámite
        streakModalShell(`
          <div class="big-emoji">🎉</div>
          <h3 style="margin:12px 0 4px">¡Listo! Tu semana se publica sola</h3>
          <p style="font-size:14px;margin:0 0 6px">Todos tus posteos quedaron programados ✅</p>
          ${whenTxt ? `<p style="font-size:14px;margin:0 0 6px">📮 ${whenNextWeek ? 'Este queda para la semana que viene: sale el ' : 'Este sale el '}${esc(whenTxt)}</p>` : ''}
          <p class="d">Te avisamos por email cuando salga cada uno. 📬</p>
          ${celebRefHTML()}
          <button class="btn btn-primary btn-block" id="celebGo" style="margin-top:10px">Ver mi semana →</button>`);
        const cmo = document.getElementById('streakModal');
        if (cmo) wireCelebRef(cmo);
        const cg = $('#celebGo');
        if (cg) cg.onclick = () => { closeStreakModal(); render(); };
        else render();
      } else {
        if (whenTxt) toast(whenNextWeek
          ? `✅ <b>¡Listo!</b> Queda programado para la semana que viene: sale el ${esc(whenTxt)}`
          : `✅ <b>¡Listo!</b> Sale el ${esc(whenTxt)}`);
        render();
      }
    } catch (e) {
      if (isPlanLimitErr(e)) { planLimitModal(e); }
      else if (m) m.innerHTML = `<div class="err">Error: ${esc(e.message)}</div>`;
      b.disabled = false;
    }
  });
}

// "📅 Programar mi semana →": un tap programa TODOS los borradores a sus
// mejores horarios. El tap ES la aprobación (sin él, nada se programa ni publica).
// Núcleo de "Programar mi semana": lo usan #btnScheduleAll (Mi semana) y el
// chip del chat. Sin salir de la pantalla: programa todo y festeja en modal.
async function doScheduleAll(btn) {
  const b = btn || document.getElementById('btnScheduleAll');
  const m = $('#revMsg');
  // Sin Instagram conectado, "sale solo" es mentira: mismo gate que el accept individual.
  if (!(PROFILE && PROFILE.ig_connected)) {
    if (m) m.innerHTML = `<div class="err">📸 Conectá tu Instagram primero — si no, los posteos no pueden salir solos.<br><br><button class="btn btn-primary btn-sm" id="revIgGo">Conectar Instagram →</button></div>`;
    const g = $('#revIgGo');
    if (g) g.onclick = () => igConnectHere();
    if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (b) b.disabled = true;
  const old = b ? b.innerHTML : '';
  if (b) b.innerHTML = '⏳ Programando tu semana…';
  try {
    const r = await api.post('/api/posts/schedule-all', {});
    if (r && r.ok) {
      // Festejo + handoff a la agenda "Lo que se viene" con la semana programada.
      const n = (r.scheduled || []).length;
      const w = (r.waiting || []).length;
      track('schedule_all', { count: n, waiting: w });
      // Ya no hay borradores: la píldora y los chips se actualizan en el acto.
      try { if (!w) REVIEW_DRAFTS = []; } catch (e) {}
      try { paintWeekPill(); } catch (e) {}
      try { renderQuickChips([], r.scheduled || [], false); } catch (e) {}
      streakModalShell(`
        <div class="big-emoji">📅</div>
        <h3 style="margin:12px 0 4px">✅ Tu semana está programada</h3>
        <p style="font-size:14px;margin:0 0 6px">${n} ${n === 1 ? 'posteo sale solo' : 'posteos salen solos'} en su horario 🎉</p>
        ${w ? `<p style="font-size:14px;margin:0 0 6px">⏳ ${w} ${w === 1 ? 'quedó' : 'quedaron'} en espera: la semana a la que ${w === 1 ? 'pertenece' : 'pertenecen'} ya completó su cupo — ${w === 1 ? 'sigue' : 'siguen'} como borrador${w === 1 ? '' : 'es'} para la próxima.</p>` : ''}
        <p class="d">Te avisamos por email cuando salga cada uno. 📬</p>
        ${celebRefHTML()}
        <button class="btn btn-primary btn-block" id="celebGoSa" style="margin-top:10px">Ver mi semana →</button>`);
      const cmo = document.getElementById('streakModal');
      if (cmo) wireCelebRef(cmo);
      const cg = $('#celebGoSa');
      if (cg) cg.onclick = () => {
        closeStreakModal();
        render().then(() => {
          const sc = document.querySelector('.pcard');
          if (sc) sc.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      };
      else render();
    }
  } catch (e) {
    if (isPlanLimitErr(e)) { planLimitModal(e); }
    else if (m) { m.innerHTML = `<div class="err">Error: ${esc(e.message)}</div>`; m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (b) { b.disabled = false; b.innerHTML = old; }
  }
}
function bindScheduleAll() {
  const b = document.getElementById('btnScheduleAll');
  if (!b) return;
  b.onclick = () => doScheduleAll(b);
}

// "🚀 Activar mi semana": UN tap deja toda la semana lista. Acepta todos los
// borradores respetando las horas que muestran las tarjetas y programa con
// horario automático los que no tengan hora. El tap ES la confirmación.
async function doActivateWeek(btn) {
  const b = btn || document.getElementById('btnActivateWeek');
  const m = $('#revMsg');
  if (!(PROFILE && PROFILE.ig_connected)) {
    if (m) m.innerHTML = `<div class="err">📸 Conectá tu Instagram primero — si no, los posteos no pueden salir solos.<br><br><button class="btn btn-primary btn-sm" id="revIgGo">Conectar Instagram →</button></div>`;
    const g = $('#revIgGo');
    if (g) g.onclick = () => igConnectHere();
    if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (b) { b.disabled = true; b.innerHTML = '🚀 Activando tu semana…'; }
  try {
    // 1) Acepta con las horas de las tarjetas (respeta horas personalizadas).
    const items = $$('#reviewCard [data-revwhen]')
      .map((inp) => ({ id: +inp.dataset.revwhen, scheduled_at: inp.value ? new Date(inp.value).toISOString() : null }))
      .filter((it) => it.id > 0);
    let n1 = 0;
    try {
      const r1 = await api.post('/api/posts/accept-all', { items });
      n1 = (r1 && r1.accepted) || 0;
    } catch (e) { if (!isPlanLimitErr(e)) throw e; else throw e; }
    // 2) Los que quedaron sin hora se programan con horario automático.
    let n2 = 0;
    try {
      const r2 = await api.post('/api/posts/schedule-all', {});
      n2 = (r2 && (r2.scheduled || []).length) || 0;
    } catch (e) {
      if (!(e && /No hay borradores para programar/.test(e.message || ''))) throw e;
    }
    const n = n1 + n2;
    if (!n) throw new Error('No había borradores pendientes');
    track('activate_week', { count: n });
    try { REVIEW_DRAFTS = []; } catch (e) {}
    try { paintWeekPill(); } catch (e) {}
    try { renderQuickChips([], [], false); } catch (e) {}
    postyCelebrate();
    streakModalShell(`
      <div class="big-emoji">🚀</div>
      <h3 style="margin:12px 0 4px">Tu semana está activa</h3>
      <p style="font-size:14px;margin:0 0 6px">${n} ${n === 1 ? 'posteo sale solo' : 'posteos salen solos'} en su horario 🎉</p>
      <p class="d">Vos a lo tuyo — Posty se ocupa del resto 💪</p>
      ${typeof celebRefHTML === 'function' ? celebRefHTML() : ''}
      <button class="btn btn-primary btn-block" id="celebGoSa" style="margin-top:10px">Ver mi semana →</button>`);
    const cmo = document.getElementById('streakModal');
    if (cmo && typeof wireCelebRef === 'function') wireCelebRef(cmo);
    const cg = $('#celebGoSa');
    if (cg) cg.onclick = () => {
      closeStreakModal();
      render().then(() => {
        const sc = document.querySelector('.pcard');
        if (sc) sc.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    else render();
  } catch (e) {
    if (isPlanLimitErr(e)) { planLimitModal(e); }
    else if (m) { m.innerHTML = `<div class="err">😅 ${esc(e.message)}</div>`; m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (b) { b.disabled = false; b.innerHTML = '🚀 Activar mi semana'; }
  }
}
function bindActivateWeek() {
  const b = document.getElementById('btnActivateWeek');
  if (!b) return;
  b.onclick = () => doActivateWeek(b);
}

// "✅ Aceptar todos": un tap aprueba TODOS los borradores pendientes y los deja
// programados en la hora que muestra la tarjeta. El tap ES la confirmación.
async function doAcceptAll(btn) {
  const b = btn || document.getElementById('btnAcceptAll');
  const m = $('#revMsg');
  // Sin Instagram conectado, "sale solo" es mentira: mismo gate que los demás.
  if (!(PROFILE && PROFILE.ig_connected)) {
    if (m) m.innerHTML = `<div class="err">📸 Conectá tu Instagram primero — si no, los posteos no pueden salir solos.<br><br><button class="btn btn-primary btn-sm" id="revIgGo">Conectar Instagram →</button></div>`;
    const g = $('#revIgGo');
    if (g) g.onclick = () => igConnectHere();
    if (m) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (b) { b.disabled = true; b.textContent = 'Aceptando…'; }
  try {
    // 2026-10-11: funciona tanto en #reviewCard (con datetime inputs) como en
    // el carrusel del home (con data-proposed en los botones Aceptar).
    let items = $$('#reviewCard [data-revwhen]')
      .map((inp) => ({ id: +inp.dataset.revwhen, scheduled_at: inp.value ? new Date(inp.value).toISOString() : null }))
      .filter((it) => it.id > 0);
    // Si los ítems salieron de la tarjeta del editor (#reviewCard), su
    // "aceptar todos" es SOLO esa tarjeta (puede ser un subconjunto, p. ej.
    // los posteos que el chat acaba de armar): no se fusiona nada.
    const fromCard = items.length > 0;
    if (!items.length) {
      // Carrusel del home: botones Aceptar con data-proposed
      items = $$('#hsWeekList [data-revaccept]')
        .filter((btn) => !btn.disabled)
        .map((btn) => {
          const id = +btn.dataset.revaccept;
          const prop = btn.dataset.proposed;
          return { id, scheduled_at: prop ? new Date(prop).toISOString() : null };
        })
        .filter((it) => it.id > 0);
    }
    // "Todo" es TODO: la vista actual no siempre renderiza cada borrador
    // (Semana muestra máx. 3 por día en el cofre; Mes y Feed no pintan
    // botones de aceptar). Se completa con los borradores conocidos
    // (REVIEW_DRAFTS, que la agenda carga completos): sin propuesta visible,
    // viajan sin hora y el servidor asigna el horario con su política de
    // mejor hora, igual que en el autopilot. El servidor revalida dueño y
    // estado: un id viejo o ya aceptado es un no-op.
    try {
      if (!fromCard && Array.isArray(REVIEW_DRAFTS) && REVIEW_DRAFTS.length) {
        const have = new Set(items.map((it) => it.id));
        for (const d of REVIEW_DRAFTS) {
          const did = +(d && d.id);
          if (!(did > 0) || have.has(did)) continue;
          have.add(did);
          items.push({ id: did, scheduled_at: d.scheduled_at ? new Date(d.scheduled_at).toISOString() : null });
        }
      }
    } catch (e) {}
    const r = await api.post('/api/posts/accept-all', { items });
    const n = (r && r.accepted) || 0;
    if (!n) throw new Error('No había borradores pendientes');
    try { track('accept_all', { count: n }); } catch (e) {}
    try { REVIEW_DRAFTS = []; } catch (e) {}
    try { paintWeekPill(); } catch (e) {}
    // v215: el servidor acepta POR SEMANA de cada posteo y lo cuenta en
    // next_week — el toast lo refleja (nada de modal de tope si la semana
    // llena era la actual y estos van a la que viene).
    const nw = (r && r.next_week) || 0;
    toast(n === 1
      ? `✅ <b>Listo, acepté el posteo.</b><br>Sale solo a la hora indicada 👌`
      : (r && r.partial)
      ? `✅ <b>Acepté ${n}.</b><br>Los otros ${r.total - n} quedan en borrador por ahora 👌`
      : nw > 0
      ? `✅ <b>Listo, acepté los ${n}.</b><br>${nw === n ? 'Quedan programados para la semana que viene 📮' : `${nw} de ellos quedan para la semana que viene 📮`}`
      : `✅ <b>Listo, acepté los ${n}.</b><br>Salen solos a la hora indicada 👌`);
    render();
  } catch (e) {
    if (isPlanLimitErr(e)) { planLimitModal(e); }
    else if (m) { m.innerHTML = `<div class="err">😅 ${esc(e.message)}</div>`; m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (b) { b.disabled = false; b.textContent = '✅ Aceptar todo'; }
  }
}
function bindAcceptAll() {
  const b = document.getElementById('btnAcceptAll');
  if (!b) return;
  b.onclick = () => doAcceptAll(b);
}

// Borradores visibles en la tarjeta de revisión (para regenerar por id)
let REVIEW_DRAFTS = [];
// Badge del sidebar: muestra cuántos borradores pendientes hay.
function paintWeekPill() {
  paintSchedCount();
}
function paintSchedCount() {
  try {
    const n = (typeof REVIEW_DRAFTS !== 'undefined' && Array.isArray(REVIEW_DRAFTS)) ? REVIEW_DRAFTS.length : 0;
    const b = document.getElementById('schedCount');
    if (!b) return;
    b.textContent = n > 0 ? n : '';
    b.style.display = n > 0 ? '' : 'none';
  } catch (e) {}
}
// Bloque de identidad del drawer mobile: logo + nombre del negocio.
// Limpio: sin nivel ni "Mi plan" (igual que en el sidebar de escritorio;
// el nivel vive en el avatar del chat, el plan solo en Ajustes).
async function paintDrawerIdent() {
  const mount = document.getElementById('drawerIdent');
  if (!mount) return;
  const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'Mi negocio';
  let logo = (typeof assetLogo === 'function') ? assetLogo() : null;
  if (!logo) { try { const a = await api.get('/api/assets'); if (Array.isArray(a)) logo = a.find(x => x.kind === 'logo'); } catch (e) {} }
  const bc = (typeof brandColors === 'function' ? brandColors() : []).filter(Boolean);
  const fbBg = bc[0] || '#2793C8';
  const initial = (biz.trim()[0] || 'M').toUpperCase();
  const logoHtml = (logo && logo.file_path)
    ? `<img src="${esc(logo.file_path)}" alt="logo de ${esc(biz)}">`
    : `<span class="drawer-ident-fb" style="background:${esc(fbBg)}">${esc(initial)}</span>`;
  mount.innerHTML = `
    <span class="drawer-ident-logo">${logoHtml}</span>
    <span class="drawer-ident-txt"><b>${esc(biz)}</b></span>`;
}
// Identidad de Posty para el sidebar fijo de escritorio (≥1024px).
async function paintSidePosty() {
  // El nombre se muestra TAL CUAL lo escribió el cliente (si pone mayúscula, va mayúscula).
  // Sin nivel ni "Mi plan": el header queda limpio (el nivel vive en el avatar del chat,
  // el plan solo en Ajustes).
  try {
    const nm = document.getElementById('sidePostyName');
    const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim();
    if (nm && biz) nm.textContent = biz;
  } catch (e) {}
}
// Track 4 "Pipeline perpetuo": cuando la semana N está programada y ya existen
// borradores de la N+1, el teaser permite verlos como semana corriente.
let NEXTWEEK_VIEW = false;
let WEEKLY_BARS_HTML = ''; // gráfico de constancia: vive en el modal de racha (la tarjeta "Tu progreso" se eliminó)
// Regenerar UN borrador: texto nuevo del mismo tema + diseño con otro estilo.
// Reemplaza en el lugar, conserva el id y el día/hora sugeridos.
async function regenDraft(id, btn) {
  const d = REVIEW_DRAFTS.find(x => x.id === id);
  if (!d || d.media_type === 'video') return;
  // Señal honesta: si pide otro diseño, el anterior no le gustó.
  // Va ANTES de regenerar para que quede registrado el texto original.
  api.post(`/api/posts/${id}/signal`, { signal: 'rejected' }).catch(() => {});
  const isBtn = !!(btn && btn.tagName === 'BUTTON');
  const old = isBtn ? btn.innerHTML : null;
  if (isBtn) { btn.disabled = true; btn.innerHTML = '⏳'; }
  try {
    const topic = d.source_topic || (d.caption || '').split('\n')[0].slice(0, 80) || 'novedad';
    const out = await api.post('/api/generate', { topic });
    // Las fotos más nuevas van primero: las de esta semana protagonizan los posteos.
    const photos = assetPhotos().slice().reverse();
    const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
    const idx = Math.max(0, REVIEW_DRAFTS.indexOf(d));
    const title = makeHeadline(d.source_topic || topic, 5).toUpperCase() || 'NOVEDAD';
    const ph = photos.length ? photos[(idx + 1) % photos.length] : null;
    const imagePath = await renderDesignImage({
      tpl: pickTpl(idx + 1, false),
      pal: defaultPal(),
      title,
      subtitle: cortar(String(d.caption || '').split('\n')[0], 90),
      handle: (PROFILE || {}).ig_username || '',
      photoImg: ph ? await photoImg(ph.file_path) : null,
      logoImg: logo,
    });
    await api.patch('/api/posts/' + id, {
      action: 'save-draft',
      image_path: imagePath,
      caption: out.caption || d.caption,
      hashtags: out.hashtags || d.hashtags,
    });
    render();
  } catch (e) {
    alert('No pude regenerarlo 😅 Probá de nuevo.');
    if (isBtn) { btn.disabled = false; btn.innerHTML = old; }
  }
}
// "🔄 Otras 3": pide 3 variantes frescas del borrador (imagen con IA + texto,
// cada una con otro ángulo) y muestra un picker con miniaturas tocables.
// Al elegir una se reemplazan imagen, texto y hashtags del borrador.
// El original queda intacto hasta que el usuario elige (y si falla, también).
async function draftVariants(id, btn) {
  const d = REVIEW_DRAFTS.find(x => x.id === id);
  const mount = document.getElementById('revvar-' + id);
  if (!d || !mount) return;
  if (d.media_type === 'video' || d.media_type === 'carousel') return;
  if (mount.dataset.open === '1') { mount.innerHTML = ''; mount.dataset.open = ''; return; }
  mount.dataset.open = '1';
  const old = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generando 3 opciones…'; }
  try {
    track('draft_variants', { id });
    const out = await api.post(`/api/posts/${id}/variants`, {}, { timeout: 240000 });
    const variants = (out && out.variants) || [];
    if (!variants.length) throw new Error('no_variants');
    mount.innerHTML = `<div style="margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <b style="font-size:13px">🔄 Elegí tu favorita</b>
        <button class="btn btn-ghost btn-sm" data-varclose="${id}">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        ${variants.map((v, i) => `
        <button data-varpick="${id}" data-vari="${i}" style="border:2px solid var(--line);border-radius:14px;overflow:hidden;background:var(--bg2);padding:0;cursor:pointer;text-align:left;font-family:inherit;min-height:44px">
          <img src="${esc(v.image_path)}" alt="Opción ${i + 1}" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block">
          <div style="padding:8px 10px;font-size:10.5px;color:var(--mut);line-height:1.4;max-height:78px;overflow:hidden">${esc(String(v.caption || '').split('\n')[0].slice(0, 90) || 'Opción ' + (i + 1))}</div>
        </button>`).join('')}
      </div>
      <p style="font-size:11px;color:var(--dim);margin:8px 0 0">Tocá una para reemplazar la imagen y el texto del borrador.</p>
    </div>`;
    mount.querySelector('[data-varclose]').onclick = () => { mount.innerHTML = ''; mount.dataset.open = ''; };
    mount.querySelectorAll('[data-varpick]').forEach(p => p.onclick = async () => {
      const v = variants[+p.dataset.vari];
      if (!v) return;
      p.disabled = true; p.style.opacity = '0.5';
      try {
        await api.patch('/api/posts/' + id, {
          action: 'save-draft', image_path: v.image_path, caption: v.caption, hashtags: v.hashtags,
        });
        render();
      } catch (e) {
        p.disabled = false; p.style.opacity = '';
        alert('No pude aplicar la variante 😅 Probá de nuevo.');
      }
    });
  } catch (e) {
    const msg = e.message === 'no_variants'
      ? 'No se pudieron generar las variantes. Probá de nuevo en un minuto.'
      : (e.message || 'No pude generarlo 😅 Probá de nuevo.');
    mount.innerHTML = `<div class="err" style="margin-top:10px">⚠️ ${esc(msg)}</div>`;
    mount.dataset.open = ''; // el error no deja el picker trabado: se puede reintentar
  }
  if (btn) { btn.disabled = false; btn.innerHTML = old; }
}
// Cambiar SOLO la foto de un borrador: re-hace el diseño con esa foto pero
// conserva texto, hashtags, id y día/hora. (El ↻ Regenerar es lo que pide texto nuevo.)
async function changeDraftPhoto(id, el, photoPath) {
  const d = REVIEW_DRAFTS.find(x => x.id === id);
  if (!d || d.media_type === 'video' || !photoPath) return;
  try {
    el.style.opacity = '0.4'; el.style.pointerEvents = 'none';
    const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
    const idx = Math.max(0, REVIEW_DRAFTS.indexOf(d));
    const topic = d.source_topic || (d.caption || '').split('\n')[0].slice(0, 80) || 'novedad';
    const title = makeHeadline(topic, 5).toUpperCase() || 'NOVEDAD';
    const imagePath = await renderDesignImage({
      tpl: pickTpl(idx + 1, false),
      pal: defaultPal(),
      title,
      subtitle: cortar(String(d.caption || '').split('\n')[0], 90),
      handle: (PROFILE || {}).ig_username || '',
      photoImg: await photoImg(photoPath),
      logoImg: logo,
    });
    await api.patch('/api/posts/' + id, { action: 'save-draft', image_path: imagePath });
    render();
  } catch (e) {
    alert('No pude cambiar la foto 😅 Probá de nuevo.');
    el.style.opacity = ''; el.style.pointerEvents = '';
  }
}
// Selector de foto por borrador: tira horizontal con tus fotos + subir nueva.
// Elegir una cambia SOLO la foto de ESE borrador (el texto queda intacto).
function togglePhotoPicker(id, btn) {
  const mount = document.getElementById('revph-' + id);
  if (!mount) return;
  if (mount.dataset.open === '1') { mount.innerHTML = ''; mount.dataset.open = ''; return; }
  mount.dataset.open = '1';
  const photos = assetPhotos().slice().reverse(); // más nuevas primero
  mount.innerHTML = `<div style="display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;align-items:center">
    ${photos.map(p => `<img src="${esc(p.file_path)}" data-pickphoto="${esc(p.file_path)}" alt="Foto del negocio" style="width:64px;height:64px;flex-shrink:0;object-fit:cover;border-radius:10px;cursor:pointer;border:2px solid var(--line)">`).join('')}
    <label style="width:64px;height:64px;flex-shrink:0;border-radius:10px;border:2px dashed var(--line);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;color:var(--mut)" title="Subir nueva foto">＋<input type="file" accept="image/*" data-uploadphoto style="display:none"></label>
  </div>`;
  mount.querySelectorAll('[data-pickphoto]').forEach(img => img.onclick = () => changeDraftPhoto(id, img, img.dataset.pickphoto));
  const up = mount.querySelector('[data-uploadphoto]');
  if (up) up.onchange = async () => {
    const f = up.files[0]; if (!f) return;
    if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
    try {
      const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
      ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      await changeDraftPhoto(id, up, data.path);
      track('photo_upload', { kind: 'draft' });
    } catch (e) { alert('No se pudo subir la foto: ' + e.message); }
  };
}

// FEATURE-FOTO-BORRADOR: picker directo de foto para un borrador (botón "📷 Foto").
// Librería del cliente (assetPhotos) + subir nueva vía POST /api/media
// (que ya deja la foto en la librería como kind=photo) + "Sin foto" para
// volver al diseño plano con los colores de la marca. Al elegir, reusa
// changeDraftPhoto: el mismo pipeline que "✨ Otro diseño" (renderDesignImage
// + PATCH save-draft); conserva título, subtítulo, handle y logo.
function toggleDraftPhotoPicker(id) {
  const mount = document.getElementById('revph-' + id);
  if (!mount) return;
  if (mount.dataset.open === '1' && mount.dataset.which === 'foto') { mount.innerHTML = ''; mount.dataset.open = ''; mount.dataset.which = ''; return; }
  mount.dataset.open = '1'; mount.dataset.which = 'foto';
  const photos = assetPhotos().slice().reverse(); // más nuevas primero
  mount.innerHTML = `<div style="display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;align-items:center">
    <button type="button" data-rmphoto style="width:64px;height:64px;flex-shrink:0;border-radius:10px;border:2px solid var(--line);background:var(--bg2);cursor:pointer;font-size:10.5px;font-weight:700;color:var(--mut);line-height:1.25;font-family:inherit" title="Quitar la foto: diseño plano con tus colores">🚫<br>Sin<br>foto</button>
    ${photos.map(p => `<img src="${esc(p.file_path)}" data-pickphoto="${esc(p.file_path)}" alt="Foto del negocio" style="width:64px;height:64px;flex-shrink:0;object-fit:cover;border-radius:10px;cursor:pointer;border:2px solid var(--line)">`).join('')}
    <label style="width:64px;height:64px;flex-shrink:0;border-radius:10px;border:2px dashed var(--line);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;color:var(--mut)" title="Subir nueva foto">＋<input type="file" accept="image/*" data-uploadphoto style="display:none"></label>
  </div>`;
  mount.querySelectorAll('[data-pickphoto]').forEach(img => img.onclick = () => changeDraftPhoto(id, img, img.dataset.pickphoto));
  const rm = mount.querySelector('[data-rmphoto]');
  if (rm) rm.onclick = () => removeDraftPhoto(id, rm);
  const up = mount.querySelector('[data-uploadphoto]');
  if (up) up.onchange = async () => {
    const f = up.files[0]; if (!f) return;
    if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
    try {
      const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No pude subirla 😅 Probá de nuevo');
      ASSETS = await api.get('/api/assets').catch(() => ASSETS); // /api/media ya la dejó en la librería
      await changeDraftPhoto(id, up, data.path);
      track('photo_upload', { kind: 'draft' });
    } catch (e) { alert('No se pudo subir la foto: ' + e.message); }
  };
}

// FEATURE-FOTO-BORRADOR: quita la foto de fondo del borrador → diseño plano con
// los colores de la marca (renderDesignImage con photoImg: null; drawPost ya lo
// maneja). Conserva título, subtítulo, handle y logo; se guarda como el nuevo
// diseño del borrador igual que "✨ Otro diseño".
async function removeDraftPhoto(id, el) {
  const d = REVIEW_DRAFTS.find(x => x.id === id);
  if (!d || d.media_type === 'video') return;
  try {
    el.style.opacity = '0.4'; el.style.pointerEvents = 'none';
    const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
    const idx = Math.max(0, REVIEW_DRAFTS.indexOf(d));
    const topic = d.source_topic || (d.caption || '').split('\n')[0].slice(0, 80) || 'novedad';
    const title = makeHeadline(topic, 5).toUpperCase() || 'NOVEDAD';
    const imagePath = await renderDesignImage({
      tpl: pickTpl(idx + 1, false),
      pal: defaultPal(),
      title,
      subtitle: cortar(String(d.caption || '').split('\n')[0], 90),
      handle: (PROFILE || {}).ig_username || '',
      photoImg: null,
      logoImg: logo,
    });
    await api.patch('/api/posts/' + id, { action: 'save-draft', image_path: imagePath });
    track('photo_remove', { kind: 'draft' });
    render();
  } catch (e) {
    alert('No pude quitar la foto 😅 Probá de nuevo.');
    el.style.opacity = ''; el.style.pointerEvents = '';
  }
}

// Cambiar el VIDEO de un borrador reel por otro de la biblioteca del cliente.
async function changeDraftVideo(id, el, videoPath) {
  const d = REVIEW_DRAFTS.find(x => x.id === id);
  if (!d || d.media_type !== 'video' || !videoPath) return;
  try {
    el.style.opacity = '0.4'; el.style.pointerEvents = 'none';
    await api.patch('/api/posts/' + id, { action: 'save-draft', image_path: videoPath });
    render();
  } catch (e) {
    alert('No pude cambiar el video 😅 Probá de nuevo.');
    el.style.opacity = ''; el.style.pointerEvents = '';
  }
}
// Selector de video por borrador reel: tira horizontal con tus videos + subir nuevo.
function toggleVideoPicker(id, btn) {
  const mount = document.getElementById('revph-' + id);
  if (!mount) return;
  if (mount.dataset.open === '1') { mount.innerHTML = ''; mount.dataset.open = ''; return; }
  mount.dataset.open = '1';
  const vids = assetVideos();
  mount.innerHTML = `<div style="display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;align-items:center">
    ${vids.map(v => `<div style="position:relative;flex-shrink:0"><video src="${esc(v.file_path)}" data-pickvideo="${esc(v.file_path)}" muted playsinline preload="metadata" style="width:64px;height:64px;object-fit:cover;border-radius:10px;cursor:pointer;border:2px solid var(--line);background:#0A1E33"></video><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;pointer-events:none">▶</span></div>`).join('')}
    <label style="width:64px;height:64px;flex-shrink:0;border-radius:10px;border:2px dashed var(--line);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;color:var(--mut)" title="Subir nuevo video">＋<input type="file" accept="video/*" data-uploadvideo style="display:none"></label>
  </div>`;
  mount.querySelectorAll('[data-pickvideo]').forEach(v => v.onclick = () => changeDraftVideo(id, v, v.dataset.pickvideo));
  const up = mount.querySelector('[data-uploadvideo]');
  if (up) up.onchange = async () => {
    const f = up.files[0]; if (!f) return;
    if (!f.type.startsWith('video/')) { alert('Elegí un archivo de video'); return; }
    try {
      const r = await fetch('/api/assets?kind=video', { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
      ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      await changeDraftVideo(id, up, data.path);
    } catch (e) { alert('No se pudo subir el video: ' + e.message); }
  };
}

/* ---------- CHAT CONSULTOR DE IDEAS 💬 ---------- */
// El cliente trae su idea, la IA opina con honestidad y la pulen juntos.
// Hasta que no queda exactamente como quiere el cliente, no se manda nada.
let CHAT_PREVIEWS = []; // canvases de ejemplo generados al cerrar la idea
let CHAT_PREV_SEL = 0;
let CHAT_PHOTOS = []; // fotos subidas en el chat: [{file_path}]
let CHAT_PHOTO_IDX = 0;
let CHAT_STYLE_IDX = 0;
let CHAT_CAPTION = null; // {caption, hashtags} generados al cerrar la idea
let CHAT_CAPTIONS = []; // 3 opciones de texto para elegir
let CHAT_CAP_SEL = 0;

function proposalHTML() {
  if (!CHAT_IDEA) return '';
  // ¿Es un pedido concreto? Se presenta como tal, con el resumen de lo que entendimos.
  const isOrder = !!(CHAT_IDEA.caption || Number.isInteger(CHAT_IDEA.photo_index) || (CHAT_IDEA.colors || []).length);
  const bits = [];
  if (CHAT_IDEA.caption) bits.push('📝 tu texto tal cual');
  if (Number.isInteger(CHAT_IDEA.photo_index)) bits.push('📷 la foto que elegiste');
  if (CHAT_IDEA.colors && CHAT_IDEA.colors.length) bits.push('🎨 en tus colores');
  return `
    <div class="chat-proposal">
      <button class="cp-close" id="chatDismiss" type="button" aria-label="Cerrar">✕</button>
      <div class="cp-head">
        <img class="cp-avatar" src="ai-avatar.png" alt="Posty">
        <div class="cp-head-tx">
          <div class="cp-overline">${isOrder ? 'Tu pedido' : 'Idea lista'} ✨</div>
          <div class="cp-title">${esc(CHAT_IDEA.titulo)}</div>
        </div>
      </div>
      <div class="chat-previews" id="chatPreviews"><div class="cp-loading" id="chatPrevThinking"></div></div>
      <div class="chat-caps" id="chatCaps"></div>
      <div class="cp-more">
        <button class="cp-link" id="chatMoreImg" type="button">↻ Otra imagen</button>
        <span class="cp-dot">·</span>
        <button class="cp-link" id="chatMoreCaps" type="button">↻ Otros textos</button>
        <span class="cp-dot">·</span>
        <button class="cp-link" id="chatEditTx" type="button">✎ Editar</button>
      </div>
      <div id="chatEditBox" hidden>
        <textarea class="in" id="chatCaption" rows="3" placeholder="Tu texto…" oninput="this.dataset.touched='1'">${esc((CHAT_CAPTION && CHAT_CAPTION.caption) || '')}</textarea>
        <input class="in" id="chatHashtags" placeholder="#hashtags…" oninput="this.dataset.touched='1'" value="${esc((CHAT_CAPTION && CHAT_CAPTION.hashtags) || '')}" style="margin-top:6px">
      </div>
      <div class="chat-proposal-btns">
        <button class="btn btn-primary" id="chatMkPost">Hacerlo posteo</button>
        <button class="btn btn-soft" id="chatMkReel">Hacerlo reel</button>
      </div>
    </div>`;
}

// "✎ Editar": muestra/oculta el editor de texto
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest ? e.target.closest('#chatEditTx') : null;
  if (!t) return;
  const box = document.getElementById('chatEditBox');
  if (box) box.hidden = !box.hidden;
});

// Genera (o regenera) 3 opciones de texto para la idea cerrada
async function refreshChatCaption() {
  if (!CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  try {
    const out = await api.post('/api/generate', { topic: idea.titulo, n: 3, seed: (Date.now() % 100000) });
    if (CHAT_IDEA !== idea) return; // el usuario siguió de largo
    const caps = (out.captions && out.captions.length ? out.captions : [out.caption]).map(String).filter(Boolean);
    CHAT_CAPTIONS = caps.slice(0, 3);
    CHAT_CAP_SEL = 0;
    CHAT_CAPTION = { caption: CHAT_CAPTIONS[0] || '', hashtags: out.hashtags || '' };
    renderChatCaps();
    const ta = $('#chatCaption');
    if (ta && !ta.dataset.touched) ta.value = CHAT_CAPTION.caption;
    const hg = $('#chatHashtags');
    if (hg && !hg.dataset.touched) hg.value = CHAT_CAPTION.hashtags;
  } catch (e) { /* se genera al crear el borrador */ }
}

// Pide 3 textos nuevos cuando ninguno convence (no pisa los hashtags retocados)
async function chatMoreCaptions() {
  if (!CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  const b = $('#chatMoreCaps');
  if (b) { b.disabled = true; postyThinking(b); }
  try {
    const out = await api.post('/api/generate', { topic: idea.titulo, n: 3, seed: (Date.now() % 100000) + 7 });
    if (CHAT_IDEA !== idea) return;
    const caps = (out.captions && out.captions.length ? out.captions : [out.caption]).map(String).filter(Boolean);
    if (caps.length) {
      CHAT_CAPTIONS = caps.slice(0, 3);
      CHAT_CAP_SEL = 0;
      CHAT_CAPTION = { caption: CHAT_CAPTIONS[0], hashtags: out.hashtags || (CHAT_CAPTION && CHAT_CAPTION.hashtags) || '' };
      renderChatCaps();
      const ta = $('#chatCaption');
      if (ta) { ta.value = CHAT_CAPTION.caption; delete ta.dataset.touched; }
      const hg = $('#chatHashtags');
      if (hg && !hg.dataset.touched) hg.value = CHAT_CAPTION.hashtags;
    }
  } catch (e) { /* quedan las opciones anteriores */ }
  const b2 = $('#chatMoreCaps');
  if (b2) { stopPostyThinking(b2); b2.disabled = false; b2.textContent = '↻ Probar otros textos'; }
}

// "🔄 Otra imagen": genera una imagen nueva con OTRO estilo de la librería
// (los prompts subidos). Cada tap da una opción nueva, sin repetir estilo.
// "↻ Otra imagen" NO bloquea: dispara la generación en segundo plano y el
// usuario puede seguir chateando. La imagen aparece sola cuando está lista.
function chatMoreImage() {
  if (!CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  const b = $('#chatMoreImg');
  if (b) { b.disabled = true; b.textContent = '🎨 Generando…'; }
  // NO borrar el preview anterior: queda visible mientras se genera la nueva.
  // El "generando" se muestra en el botón, no pisando la imagen.
  const box = $('#chatPreviews');
  RENDER_PREV_FOR = null; RENDER_PREV_BUSY = null; // permitir regenerar
  renderChatPreviews(true).then(() => {
    if (CHAT_IDEA !== idea) return;
    renderChatStoryboard();
  }).catch(() => {}).finally(() => {
    const b2 = $('#chatMoreImg');
    if (b2 && CHAT_IDEA === idea) { stopPostyThinking(b2); b2.disabled = false; b2.textContent = '↻ Otra imagen'; }
  });
}

// 3 opciones de texto tocables: elegir una la carga en el campo editable
function renderChatCaps() {
  const box = $('#chatCaps');
  if (!box) return;
  box.innerHTML = '';
  CHAT_CAPTIONS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chat-cap-opt' + (i === CHAT_CAP_SEL ? ' sel' : '');
    // Texto COMPLETO: el usuario lo lee todo para decidir cuál le gusta.
    b.innerHTML = `<b>Opción ${i + 1}</b><span>${esc(c)}</span>`;
    b.onclick = () => {
      CHAT_CAP_SEL = i;
      CHAT_CAPTION = { caption: c, hashtags: (CHAT_CAPTION && CHAT_CAPTION.hashtags) || '' };
      const ta = $('#chatCaption');
      if (ta) { ta.value = c; ta.dataset.touched = '1'; }
      box.querySelectorAll('.chat-cap-opt').forEach((el, j) => el.classList.toggle('sel', j === i));
    };
    box.appendChild(b);
  });
}

// Texto envuelto para el storyboard del reel
// OJO: se llama drawWrappedText (no wrapText) porque wrapText ya existe
// y devuelve un array de líneas. Esta versión dibuja directo en el canvas.
function drawWrappedText(ctx, text, x, y, maxW, lh) {
  const words = String(text || '').split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lh));
}

// Mini storyboard del reel: las 3 escenas tal como saldrían (foto o diseño + texto)
async function renderChatStoryboard() {
  const box = $('#chatBoard');
  if (!box || !CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  try {
    const lib = CHAT_PHOTOS.length ? CHAT_PHOTOS : assetPhotos();
    const handle = (PROFILE || {}).ig_username || '';
    const title = makeHeadline(idea.titulo || 'NOVEDAD', 5).toUpperCase() || 'NOVEDAD';
    const angle = (idea.angulo || '').split('.')[0].slice(0, 90);
    const texts = [title, angle || title, handle ? '@' + handle : 'SEGUINOS 👇'];
    let ph = lib.length ? await photoImg(lib[CHAT_PHOTO_IDX % lib.length].file_path) : null;
    if (!ph) {
      // Sin foto: usar la imagen real generada para el preview (nunca bloques planos)
      const gen = (CHAT_PREVIEWS || []).find(p => p && p.kind === 'generated' && p.path);
      if (gen) { try { ph = await photoImg(gen.path); } catch (e) { ph = null; } }
    }
    if (CHAT_IDEA !== idea) return;
    if (!ph) {
      box.innerHTML = '<div style="font-size:11.5px;color:var(--mut)">🎨 Generando…</div>';
      return;
    }
    box.innerHTML = '';
    for (const tx of texts) {
      const cv = document.createElement('canvas');
      cv.width = 180; cv.height = 320;
      const ctx = cv.getContext('2d');
      if (ph) {
        const s = Math.max(cv.width / ph.width, cv.height / ph.height);
        const w = ph.width * s, h = ph.height * s;
        ctx.drawImage(ph, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
        const g = ctx.createLinearGradient(0, cv.height * 0.35, 0, cv.height);
        g.addColorStop(0, 'rgba(10,30,51,0)');
        g.addColorStop(1, 'rgba(10,30,51,.88)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
      ctx.fillStyle = '#fff';
      ctx.font = '800 15px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawWrappedText(ctx, tx, cv.width / 2, cv.height - 52, cv.width - 24, 19);
      const d = document.createElement('div');
      d.className = 'chat-board-scene';
      d.appendChild(cv);
      box.appendChild(d);
    }
  } catch (e) {
    box.innerHTML = '';
  }
}

// Genera 2 ejemplos visuales reales + opción "solo foto" de la idea con el diseñador,
// para que el cliente vea qué va a postear antes de crearlo.
// Usa las fotos subidas al chat (o las de la librería) y el estilo actual.
// Estilos ya usados para la idea actual ("Otra imagen" no repite estilo).
let CHAT_STYLE_USED = [];

// Igual que aiConceptShot pero devuelve también el estilo usado (para no repetirlo).
// Si falla, lanza el último error con su mensaje real (para diagnóstico honesto).
async function aiConceptShotFull({ idea, tipo, headline, refs, excludeStyles }) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await api.post('/api/concept-shot', { idea, tipo, headline, refs: refs || [], excludeStyles: excludeStyles || [] }, { timeout: 180000 });
      if (r && r.ok === false) {
        if (r.capped) throw { aiCap: true, message: r.error || '' };
        const diagStr = r.diag ? ` [diag: founder=${r.diag.founder}, aiOk=${r.diag.aiOk}, rateOk=${r.diag.rateOk}, used=${r.diag.rateUsed}]` : '';
        throw new Error((r.error || 'El servidor no devolvió imagen') + diagStr);
      }
      if (r && r.path) return { path: r.path, style: r.style || null, styleName: r.styleName || '' };
      lastErr = new Error('El servidor no devolvió imagen');
    } catch (e) {
      if (e && e.aiCap) throw e;
      lastErr = e;
      console.warn('[concept-shot] intento ' + (attempt + 1) + ' falló:', (e && e.message) || e);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.warn('[concept-shot] no disponible tras reintento');
  throw lastErr || new Error('No se pudo generar la imagen');
}

// Preview de la tarjeta "IDEA LISTA": UNA imagen real generada con IA usando
// los prompts de la librería de estilos. Lo que ves es EXACTAMENTE lo que sale
// al tocar "Hacerlo posteo" (se reutiliza la misma imagen, no se regenera).
// "Otra imagen" genera una nueva con OTRO estilo (sin repetir).
async function renderChatPreviews(force) {
  // REACTIVADO (2026-10-03): la tarjeta vuelve a mostrar la imagen.
  // Con el backend v27 (sin reintentos en cadena) la generación es confiable.
  return renderChatPreviews_OLD(force);
}
let RENDER_PREV_FOR = null; // titulo ya pintado (no regenerar)
let RENDER_PREV_BUSY = null; // titulo en generación (no duplicar)
async function renderChatPreviews_OLD(force) {
  const box = $('#chatPreviews');
  if (!box || !CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  const tituloKey = String(idea.titulo || '').slice(0, 80);
  if (!force && RENDER_PREV_FOR === tituloKey && box.querySelector('img')) return;
  if (!force && RENDER_PREV_BUSY === tituloKey) return;
  if (!force) RENDER_PREV_BUSY = tituloKey;
  const stopPrevThinking = () => stopPostyThinking($('#chatPrevThinking'));
  // FOTO-CLIENTE (2026-10-10, pedido de Valentino): si la idea trae photo_index,
  // la foto del cliente ES la imagen — no se genera nada con IA.
  if (Number.isInteger(idea.photo_index) && CHAT_PHOTOS.length) {
    const up = CHAT_PHOTOS[0];
    if (up && up.file_path) {
      RENDER_PREV_FOR = tituloKey; RENDER_PREV_BUSY = null;
      CHAT_PREVIEWS = [{ kind: 'photo', cv: null, path: up.file_path, style: null, styleName: '' }];
      CHAT_PREV_SEL = 0;
      stopPrevThinking();
      box.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'chat-prev sel chat-prev-single';
      const img = document.createElement('img');
      img.src = up.file_path;
      img.alt = 'Tu foto';
      d.appendChild(img);
      const tag = document.createElement('span');
      tag.className = 'pv-tag';
      tag.textContent = '📷 Tu foto';
      d.appendChild(tag);
      box.appendChild(d);
      renderChatStoryboard();
      return;
    }
  }
  // Si ya hay un preview, NO lo borramos: queda visible mientras se genera la nueva.
  // Solo mostramos "generando" si no hay nada que mostrar.
  const hadPreview = box.querySelector('img');
  if (!hadPreview) {
    box.innerHTML = '<div class="chat-prev-loading" id="chatPrevThinking"></div>';
    postyThinking($('#chatPrevThinking'), ['Generando tu imagen 🎨…', 'Aplicando tu estilo ✨…']);
  }
  // Pinta una imagen ya lista en la tarjeta (la usa la pre-generada y la on-demand).
  const paintPreview = (gen) => {
    if (CHAT_IDEA !== idea) return;
    RENDER_PREV_FOR = tituloKey; RENDER_PREV_BUSY = null;
    if (gen.style && !CHAT_STYLE_USED.includes(gen.style)) CHAT_STYLE_USED.push(gen.style);
    CHAT_PREVIEWS = [{ kind: 'generated', cv: null, path: gen.path, style: gen.style, styleName: gen.styleName }];
    CHAT_PREV_SEL = 0;
    stopPrevThinking();
    box.innerHTML = '';
    const pv = CHAT_PREVIEWS[0];
    const d = document.createElement('div');
    d.className = 'chat-prev sel chat-prev-single';
    const img = document.createElement('img');
    img.src = pv.path;
    img.alt = 'Imagen del posteo';
    d.appendChild(img);
    if (pv.styleName) {
      const tag = document.createElement('span');
      tag.className = 'pv-tag';
      tag.textContent = '\u2728 ' + pv.styleName;
      d.appendChild(tag);
    }
    box.appendChild(d);
    renderChatStoryboard();
  };
  try {
    // 1. ¿El servidor ya la pre-generó en background cuando nació la idea?
    // Si está lista → instantáneo. Si sigue en curso → esperarla (poll corto).
    try {
      const pg0 = await api.post('/api/ideas/pregen-image', { titulo: idea.titulo }, { timeout: 8000 });
      if (pg0 && pg0.status === 'done' && pg0.path) {
        paintPreview({ path: pg0.path, style: null, styleName: '' });
        return;
      }
      if (pg0 && pg0.status === 'pending') {
        const t0 = Date.now();
        while (Date.now() - t0 < 90000 && CHAT_IDEA === idea) {
          await new Promise(r => setTimeout(r, 4000));
          const pg = await api.post('/api/ideas/pregen-image', { titulo: idea.titulo }, { timeout: 8000 }).catch(() => null);
          if (pg && pg.status === 'done' && pg.path) { paintPreview({ path: pg.path, style: null, styleName: '' }); return; }
          if (!pg || pg.status === 'error' || pg.status === 'missing') break;
        }
      }
    } catch (e) { /* fallback a generación on-demand */ }
    if (CHAT_IDEA !== idea) return;
    // 2. Sin pre-generada: generar on-demand (comportamiento actual).
    const lib = CHAT_PHOTOS.length ? CHAT_PHOTOS : assetPhotos();
    const refs = lib.slice(0, 2).map(p => p.file_path || '').filter(Boolean);
    const gen = await aiConceptShotFull({
      idea: { titulo: idea.titulo, angulo: idea.angulo, porque: idea.porque, tipo: idea.tipo },
      tipo: idea.tipo || tipoFromText(idea.titulo),
      headline: pickHeadline(idea, (CHAT_CAPTIONS[CHAT_CAP_SEL] || '')),
      refs,
      excludeStyles: CHAT_STYLE_USED,
    });
    if (CHAT_IDEA !== idea) return;
    if (!gen || !gen.path) {
      stopPrevThinking();
      // No borrar el preview anterior si había uno: solo avisar del fallo.
      if (!box.querySelector('img')) {
        box.innerHTML = '<div style="font-size:12px;color:var(--mut)">No pude generar la imagen 😅 Probá tocando ↻ Otra imagen.</div>';
        CHAT_PREVIEWS = [];
      }
      return;
    }
    paintPreview(gen);
  } catch (e) {
    RENDER_PREV_BUSY = null;
    if (CHAT_IDEA !== idea) return;
    stopPrevThinking();
    const detail = String((e && e.message) || '').slice(0, 120);
    // Si había un preview anterior, lo conservamos y solo avisamos.
    if (box.querySelector('img')) return;
    if (isAiCapErr(e)) {
      const capMsg = (e.message || '').trim() || 'Llegamos al tope de IA 😅 Probá de nuevo en un rato.';
      box.innerHTML = '<div style="font-size:12px;color:var(--mut)">' + esc(capMsg) + '</div>';
    } else {
      box.innerHTML = '<div style="font-size:12px;color:var(--mut)">No pude generar la imagen 😅' +
        (detail ? `<br><small style="opacity:.7">Detalle: ${esc(detail)}</small>` : '') +
        '<br>Probá tocando ↻ Otra imagen.</div>';
    }
    CHAT_PREVIEWS = [];
  }
}


let CHAT_LOADED = false; // historial ya cargado del servidor en esta sesión

// ---- Logo auto-extraído: banner confirmable en el chat ----
// El servidor guarda el mensaje con el marcador [logo-candidate:/media/xxx.jpg];
// el frontend lo renderiza como banner con la foto + 2 botones táctiles (≥44px).
const LC_MARKER_RE = /\[logo-candidate(?::([^\]]+))?\]/;
function chatStripLcMarker(t) { return String(t || '').replace(/\[logo-candidate(?::[^\]]+)?\]/g, '').trim(); }

// ---- Nudge "¿publicamos tu primero?": banner con botón de 1 tap ----
// El servidor guarda el mensaje con el marcador [first-publish]; el frontend
// lo renderiza como banner con el botón "🚀 Publicar mi primero", que lleva a
// Schedule y auto-dispara el flujo (mismo patrón que [logo-candidate:...]).
const FP_MARKER_RE = /\[first-publish\]/;
function chatStripFpMarker(t) { return String(t || '').replace(/\[first-publish\]/g, '').trim(); }

// Marcador [celebrate]: el backend lo inserta en un mensaje para que el frontend
// festeje al renderizarlo. Se stripa SIEMPRE del texto visible (jamás se ve).
const CELEBRATE_MARKER = /\[celebrate\]/i;
const CELEBRATE_MARKER_G = /\[celebrate\]/gi;
function chatStripCelebrate(t) { return String(t || '').replace(CELEBRATE_MARKER_G, '').trim(); }
// Limpia marcadores internos del texto antes de mandarlo a la IA (el historial no los necesita).
function chatStripMcMarker(t) { return chatStripCelebrate(t); }
// Claves de mensajes ya renderizados: un mensaje con [celebrate] festeja UNA sola vez,
// aunque el historial se recargue (visibilitychange, re-render, etc.).
const CHAT_CELEBRATED_SEEN = new Set();
function chatCelebrateScan(messages) {
  try {
    (messages || []).forEach(m => {
      if (!m || m.role === 'user' || !m.text) return;
      const key = m.role + ' ' + String(m.text);
      if (CHAT_CELEBRATED_SEEN.has(key)) return;
      CHAT_CELEBRATED_SEEN.add(key);
      if (CELEBRATE_MARKER.test(String(m.text))) postyCelebrate();
    });
  } catch (e) {}
}

// Linkify mínimo del chat: las URLs en los mensajes salen como <a> (target=_blank).
// Orden seguro: se splitea el texto CRUDO por URL, se escapa cada parte por
// separado y solo las URLs capturadas se envuelven en <a>. Jamás se linkea sobre
// HTML ya escapado ni se escapa el <a> generado. Los marcadores internos
// ([celebrate], [logo-candidate:...]) ya se stripearon antes de llegar acá.
const CHAT_URL_RE = /(https?:\/\/[^\s<>"'`]+)/g;
function linkifyEsc(text) {
  return String(text || '').split(CHAT_URL_RE).map((p, i) => {
    if (i % 2 !== 1) return esc(p);
    // Puntuación de fin de frase fuera del link: "https://x.com/p/1." linkea sin el punto.
    const m = p.match(/^(.*?)([.,;:!?]+)$/);
    const url = m ? m[1] : p, trail = m ? m[2] : '';
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>${esc(trail)}`;
  }).join('');
}

// HTML de un mensaje del chat: si trae el marcador de logo candidato,
// renderiza el banner confirmable; si no, la burbuja normal.
function chatMsgHtml(role, text) {
  text = chatStripCelebrate(text); // el marcador [celebrate] jamás se ve
  // Banner "¿publicamos tu primero?": texto + botón táctil de 1 tap.
  if (role !== 'user' && FP_MARKER_RE.test(String(text || ''))) {
    return `<div class="chat-msg ai fp-banner">`
      + `<div>${esc(chatStripFpMarker(text))}</div>`
      + `<button type="button" class="btn btn-primary btn-block" data-fp-pub style="margin-top:10px;min-height:48px;touch-action:manipulation">🚀 Publicar mi primero</button>`
      + `</div>`;
  }
  const m = String(text || '').match(LC_MARKER_RE);
  if (!m || role === 'user') return `<div class="chat-msg ${role === 'user' ? 'u' : 'ai'}">${linkifyEsc(text)}</div>`;
  const imgPath = (m[1] || '').trim();
  const img = imgPath
    ? `<img src="${esc(imgPath)}" alt="Posible logo de tu marca" loading="lazy" style="width:96px;height:96px;object-fit:cover;border-radius:16px;display:block;margin:8px auto" onerror="this.closest('.lc-banner').remove()">`
    : '';
  return `<div class="chat-msg ai lc-banner" data-lc="${esc(imgPath)}" style="touch-action:manipulation">`
    + `<div>${esc(chatStripLcMarker(text))}</div>${img}`
    + `<div style="display:flex;gap:8px;margin-top:8px">`
    + `<button class="lc-yes" style="flex:1;min-height:44px;touch-action:manipulation;border:none;border-radius:12px;background:#1F9D55;color:#fff;font-size:15px;font-weight:700">Sí, ese es ✅</button>`
    + `<button class="lc-no" style="flex:1;min-height:44px;touch-action:manipulation;border:none;border-radius:12px;background:#EEF0F2;color:#333;font-size:15px;font-weight:700">No ❌</button>`
    + `</div></div>`;
}

// Confirma o rechaza el logo candidato y reemplaza el banner por texto chico.
// Si el candidato ya no existe (404), el banner se auto-oculta.
async function logoCandidateRespond(ok, bannerEl) {
  try {
    const r = await api.post(ok ? '/api/brand/logo-confirm' : '/api/brand/logo-reject', {});
    if (!r || !r.ok) throw new Error((r && r.error) || 'fail');
    if (bannerEl) bannerEl.outerHTML = `<div style="font-size:12px;color:var(--mut);margin:6px 0">${ok ? '✅ ¡Listo! Lo uso en todos tus diseños' : '👌 Dale, cuando quieras subí tu logo desde Mi marca'}</div>`;
  } catch (e) { if (bannerEl) bannerEl.remove(); }
}
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest ? (e.target.closest('.lc-yes') || e.target.closest('.lc-no')) : null;
  if (!t) return;
  try { e.preventDefault(); } catch (_) {}
  logoCandidateRespond(t.classList.contains('lc-yes'), t.closest('.lc-banner'));
});

// Banner "¿publicamos tu primero?": 1 tap → Schedule y auto-disparo del flujo.
// La bandera vive en sessionStorage: si ya está en Schedule, dispara directo.
document.addEventListener('click', (e) => {
  const t = e.target && e.target.closest ? e.target.closest('[data-fp-pub]') : null;
  if (!t) return;
  try { e.preventDefault(); } catch (_) {}
  try { sessionStorage.setItem('posta_fp_auto', '1'); } catch (_) {}
  if ((location.hash || '') === '#/app/schedule') { try { autoClickFirstPublish(); } catch (_) {} }
  else location.hash = '#/app/schedule';
});

// Si el candidato ya no existe (confirmado/rechazado en otra sesión),
// los banners pendientes se auto-ocultan.
async function chatLogoBannersVerify() {
  try {
    const r = await api.get('/api/brand/logo-candidate');
    if (!r || r.path) return;
    document.querySelectorAll('.lc-banner').forEach(b => b.remove());
  } catch (_) {}
}
let CHAT_FIRST_PICK = null; // sugerencia "¿Arrancamos por este? 👀" (GET /api/ideas/chat, solo primera apertura)

// Fix auditoría #2: 1 tap para rearmar la semana de /prueba cuando la
// importación trajo 0 (cache vencido). Genera en segundo plano; responde al toque.
async function trialRebuildWeek() {
  const b = document.getElementById('trialRebuildBtn');
  const say = (t, dis) => { if (b) { b.textContent = t; b.disabled = !!dis; } };
  say('⏳ Rearmándola…', true);
  try {
    const r = await api.post('/api/trial/rebuild-import', {});
    if (r && r.rebuilding) {
      say('✅ ¡En marcha! Te aviso cuando esté ✨', true);
      const box = $('#chatBox');
      if (box) {
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">${esc('Dale, la estoy rearmando ⏳ Te aviso acá mismo cuando tu semana esté lista ✨')}</div>`);
        chatScroll();
      }
    } else if (r && r.reason === 'has_drafts') {
      say('✅ Ya tenés borradores ✨', true);
    } else {
      say('⚡ Rearmar mi semana', false);
      alert('No pude arrancar la regeneración 😅 Probá de nuevo en un toque.');
    }
  } catch (e) {
    say('⚡ Rearmar mi semana', false);
    alert((e && e.message) || 'No pude arrancar la regeneración 😅 Probá de nuevo.');
  }
}

// Trae el historial del chat del servidor (persiste entre sesiones)
async function chatLoadHistory() {
  try {
    const r = await api.get('/api/ideas/chat');
    if (r && Array.isArray(r.messages) && r.messages.length) {
      CHAT = r.messages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.text)
        .map(m => ({ role: m.role, text: String(m.text).slice(0, 2000) }));
      const box = $('#chatBox');
      if (box) box.innerHTML = CHAT.map(m => chatMsgHtml(m.role, m.text)).join('');
      // Auto-trigger por marcador: mensajes NUEVOS con [celebrate] festejan una sola vez.
      chatCelebrateScan(CHAT);
      const chips = $('#chatChips');
      if (chips) chips.remove(); // con historial, los ejemplos ya no hacen falta
    }
    if (r && typeof r.welcome === 'string' && r.welcome.trim()) {
      const box = $('#chatBox');
      if (box) box.insertAdjacentHTML('afterbegin', `<div class="chat-msg ai">${esc(r.welcome.trim().slice(0, 600))}</div>`);
      const chips = $('#chatChips');
      if (chips) chips.remove();
      // Magia de primera apertura: confetti sutil + el avatar saluda.
      // Solo si el chat está visible (este fetch también corre desde otras vistas).
      if (box) { try { firstOpenParty(); } catch (e) {} }
    }
    // Fix auditoría #2: si la importación de /prueba trajo 0, el welcome honesto
    // viene con 1 tap para rearmar la semana (POST /api/trial/rebuild-import).
    if (r && r.welcome_regen) {
      const box = $('#chatBox');
      if (box && !document.getElementById('trialRebuildBtn')) {
        box.insertAdjacentHTML('beforeend',
          `<div style="margin:10px 0 4px"><button class="btn btn-primary btn-sm" id="trialRebuildBtn">⚡ Rearmar mi semana</button></div>`);
        const rb = document.getElementById('trialRebuildBtn');
        if (rb) rb.onclick = trialRebuildWeek;
      }
    }
    // Sugerencia de primera apertura: se cachea acá y se pinta en bindChatView
    // (este fetch también corre desde otras vistas, donde el slot no existe).
    try { CHAT_FIRST_PICK = (r && r.first_pick) || null; } catch (e) { CHAT_FIRST_PICK = null; }
    if (r && r.idea && r.idea.titulo) {
      CHAT_IDEA = r.idea;
      CHAT_STYLE_USED = [];
      applyChatOrder(r.idea);
      chatRenderProposal();
      const ta0 = $('#chatCaption');
      if (ta0 && r.idea.caption) { ta0.value = r.idea.caption; ta0.dataset.touched = '1'; }
      refreshChatCaption();
    }
    chatScroll();
    // Banners de logo candidato que ya no existe: se auto-ocultan.
    try { chatLogoBannersVerify(); } catch (_) {}
  } catch (e) { /* sin historial: se empieza de cero */ }
}
// Llegada en vivo: cuando la app vuelve a primer plano y la vista chat está activa,
// se recarga el historial para que el festejo de una publicación llegue sin recargar
// (el backend inserta el mensaje con [celebrate]; el scan de chatLoadHistory lo dispara).
document.addEventListener('visibilitychange', () => {
  try {
    if (document.visibilityState !== 'visible') return;
    if (!(location.hash || '').startsWith('#/app/chat')) return;
    if (!document.getElementById('chatBox')) return;
    if (typeof chatLoadHistory === 'function') chatLoadHistory();
  } catch (e) {}
});

// Crea el borrador usando el ejemplo elegido.
// Si se eligió "solo foto", se usa la foto directo sin diseño.
async function draftFromPreview(idea, prev) {
  const ta = $('#chatCaption');
  let caption = ta ? ta.value.trim() : '';
  const hg = $('#chatHashtags');
  let hashtags = hg ? hg.value.trim() : ((CHAT_CAPTION && CHAT_CAPTION.hashtags) || '');
  if (!caption) {
    const out = await api.post('/api/generate', { topic: idea.titulo, tipo: idea.tipo });
    caption = out.caption || '';
    hashtags = out.hashtags || hashtags;
  }
  let imagePath;
  // Si el preview ya es una imagen generada por IA, se reutiliza directo: es la final,
  // no se gasta otra generación.
  const reuseGen = prev && prev.kind === 'generated' && prev.path ? prev.path : null;
  // Motor de imágenes nivel agencia: primero intenta un concept shot con IA
  // usando las fotos que mandó en el chat (si mandó). Si falla, sigue como siempre.
  const cm = $('#chatMsg');
  const cmPrev = cm ? cm.innerHTML : null;
  if (!reuseGen && cm) {
    stopPostyThinking(document.getElementById('chatMkThinking')); // venía rotando desde "Hacerlo posteo"
    cm.innerHTML = '<div class="okmsg"><span id="chatMkThinking"></span></div>';
    postyThinking($('#chatMkThinking'));
  }
  const chatRefs = CHAT_PHOTOS.filter(p => p && p.kind !== 'video' && p.file_path).slice(0, 2).map(p => p.file_path);
  const csPath = reuseGen || await aiConceptShot({
    idea,
    tipo: idea.tipo || tipoFromText(idea.titulo),
    headline: pickHeadline(idea, caption),
    refs: chatRefs,
  });
  if (cm && cmPrev !== null) { stopPostyThinking(document.getElementById('chatMkThinking')); cm.innerHTML = cmPrev; }
  if (csPath) {
    imagePath = csPath;
  } else if (prev && prev.kind === 'photo' && prev.path) {
    imagePath = prev.path;
  } else {
    const cv = prev && prev.cv ? prev.cv : prev;
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const res = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No pude subir la imagen 😅 Probá de nuevo');
    imagePath = data.path;
  }
  try {
    await api.post('/api/posts', { image_path: imagePath, caption, hashtags, media_type: 'image', strategy_why: idea.porque || '' });
  } catch (e) {
    if (isPlanLimitErr(e)) {
      const q = await api.get('/api/quota').catch(() => null);
      quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' });
      return;
    }
    if (!String(e.message || '').includes('Ya creaste este posteo')) throw e;
  }
}

function chatCardHTML(compact, noEditChip, bareWrap, schedMode) {
  const msgs = CHAT.map(m => chatMsgHtml(m.role, m.text)).join('');
  // En la revisión va compacto: el saludo del chat ya dice lo mismo que la descripción.
  const desc = compact ? '' : `
    <p style="color:var(--mut);font-size:12.5px;line-height:1.6;margin:0 0 12px">Escribime como por WhatsApp — te armo posteos, te retoco borradores y te tiro ideas. Nada sale sin que lo veas vos primero.</p>`;
  // En la revisión va integrado: sin título (el saludo ya presenta el chat).
  const title = compact ? '' : `<h3 style="margin:0 0 6px">💬 Posty</h3>`;
  const wrap = compact
    ? `<div id="chatCard" style="${bareWrap ? 'margin:0 0 4px' : 'margin:14px 0 4px;padding-top:12px;border-top:1.5px solid var(--line)'}">`
    : `<div class="card" id="chatCard">`;
  // Sin borradores no hay nada que editar: el chip "Editá un borrador" es un callejón sin salida.
  // v221 (Schedule, órdenes de Valentino): SIN chips rápidos y SIN botón
  // "+" — la zona del chat queda limpia; el micrófono no se toca. Y el
  // ÚNICO botón de subida de la pantalla vive acá: fijo, inmediatamente
  // debajo del saludo (la caja de mensajes scrollea; esta fila no), con
  // su #albumFile y su #albumMsg (el festejo/clasificación de siempre).
  const chips = (!msgs && !schedMode) ? `
    <div class="chat-chips" id="chatChips">
      <button data-chip="Haceme un posteo de promo para esta semana">✨ Haceme un posteo</button>
      ${noEditChip ? '' : `<button data-chip="Cambiá el texto del segundo posteo, hacelo más corto">✏️ Editá un borrador</button>`}
      <button data-chip="Dame una idea para vender más esta semana">💡 Dame una idea</button>
    </div>` : '';
  // (v236) A la derecha de la subida, el chip de ideas: nace en el
  // HTML estático ya con su estado (badge y aria-expanded salen del
  // estado en memoria) para que ningún repintado lo mueva ni lo prenda
  // tarde. El badge tiene geometría fija reservada (CSS): el número
  // jamás empuja el layout al aparecer o cambiar.
  const ideasChip = schedMode ? `<button type="button" class="ideas-chip" id="ideasChip" aria-expanded="${IDEAS_PANEL_OPEN ? 'true' : 'false'}" aria-controls="hs-ideas">💡 Ideas <span class="ideas-badge${(typeof IDEAS_PENDING_COUNT === 'number' && IDEAS_PENDING_COUNT > 0) ? '' : ' off'}" id="ideasBadge">${typeof IDEAS_PENDING_COUNT === 'number' ? IDEAS_PENDING_COUNT : 0}</span></button>` : '';
  const upRow = schedMode ? `
    <div class="sched-up-row">
      <button type="button" class="ag-upload-btn" id="agUploadBtn">📸 Subir fotos o video</button>
      ${ideasChip}
      <input type="file" id="albumFile" accept="image/*,video/*" multiple style="display:none">
      <div class="album-row-msg" id="albumMsg" aria-live="polite"></div>
    </div>` : '';
  return `
  ${wrap}
    ${title}${desc}
    <div class="chat-box" id="chatBox">
      ${msgs || `<div class="chat-msg ai">¡Hola! 👋 ¿Qué hacemos hoy?</div>`}
    </div>${upRow}${chips}
    <div id="chatProposal">${proposalHTML()}</div>
    <div id="chatPhotos" class="chat-photos"></div>
    <div class="chat-input-row">
      ${schedMode ? '' : `<button class="btn btn-soft" id="chatPlus" title="Agregar foto o video">＋</button>`}
      <input id="chatInput" class="in" placeholder="Escribile a Posty…" maxlength="2000" autocomplete="off">
      <button class="btn btn-soft" id="chatMicSend" title="Pedir con nota de voz">🎙</button>
      <input type="file" id="chatFile" accept="image/*,video/*" multiple hidden>
      ${schedMode ? '' : `<div class="chat-plus-menu" id="chatPlusMenu" hidden>
        <button data-k="photo">📷 Foto</button>
        <button data-k="video">🎬 Video</button>
      </div>`}
    </div>
    <div id="chatMsg"></div>
  </div>`;
}

// Agrega un mensaje del asistente al chat (para confirmaciones locales)
function chatSay(text) {
  CHAT.push({ role: 'assistant', text });
  const box = $('#chatBox');
  if (box) box.insertAdjacentHTML('beforeend', chatMsgHtml('assistant', text));
  chatScroll();
  postyNotify('Posty', text);
  try { api.post('/api/ideas/chat/log', { messages: [{ role: 'assistant', text }] }).catch(() => {}); } catch (e) {}
}

// Opciones tocables que propone la IA ("¿vender o alcance?"): un toque la envía como tu respuesta.
// Se muestran una sola vez y se descartan al responder.
function renderChatOptions(options) {
  const box = $('#chatBox');
  if (!box || !Array.isArray(options) || !options.length) return;
  const old = $('#chatOptions'); if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.className = 'chat-chips';
  wrap.id = 'chatOptions';
  options.slice(0, 4).forEach(opt => {
    const label = cortar(String(opt), 60);
    if (!label) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => {
      wrap.remove();
      const inp = $('#chatInput');
      if (inp) inp.value = label;
      chatSend();
    };
    wrap.appendChild(b);
  });
  if (!wrap.children.length) return;
  box.appendChild(wrap);
  chatScroll();
}

// El cliente pidió ver sus posteos: tarjetas con la imagen real de cada borrador.
// Nunca una lista en texto.
function renderChatShowDrafts(drafts) {
  const box = $('#chatBox');
  if (!box || !Array.isArray(drafts) || !drafts.length) return;
  const old = $('#chatShowDrafts'); if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg ai';
  wrap.id = 'chatShowDrafts';
  wrap.style.maxWidth = '100%';
  wrap.style.whiteSpace = 'normal';
  const head = document.createElement('div');
  head.style.cssText = 'font-weight:800;margin-bottom:8px';
  head.textContent = '🖼️ Tus posteos 👇';
  wrap.appendChild(head);
  drafts.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'chat-idea-card';
    card.style.cursor = 'default';
    const badge = d.media_type === 'video' ? '🎬 Reel' : d.media_type === 'story' ? '📸 Historia' : d.media_type === 'carousel' ? '🖼️ Carrusel' : '📝 Post';
    const st = d.status === 'scheduled' && d.when ? ` · ⏰ ${esc(String(d.when).slice(0, 16).replace('T', ' '))}` : ' · 📝 borrador';
    card.innerHTML = `
      ${d.image_url ? `<img src="${esc(String(d.image_url))}" style="width:100%;border-radius:10px;margin-bottom:6px;display:block" loading="lazy" alt="">` : ''}
      <div style="font-size:12.5px;color:var(--mut)">${badge}${st}</div>
      ${d.caption ? `<div style="font-size:12.5px;margin-top:4px">${esc(String(d.caption).slice(0, 120))}</div>` : ''}`;
    wrap.appendChild(card);
  });
  const foot = document.createElement('button');
  foot.type = 'button';
  foot.className = 'btn btn-soft btn-sm';
  foot.style.marginTop = '8px';
  foot.textContent = '📅 Ver en Schedule';
  foot.onclick = () => { location.hash = '#/app/schedule'; };
  wrap.appendChild(foot);
  box.appendChild(wrap);
  chatScroll();
}

function renderChatPhotos() {
  const box = $('#chatPhotos');
  if (!box) return;
  box.innerHTML = CHAT_PHOTOS.map((p, i) => `
    <div class="chat-photo">
      ${p.aiUrl ? `<img src="${esc(p.aiUrl)}">${p.kind === 'video' ? `<span class="vid-badge">▶</span>` : ''}` : (p.kind === 'video' ? `<span class="vid-badge" style="left:50%;top:50%;transform:translate(-50%,-50%);bottom:auto;font-size:17.5px">🎬</span>` : `<img src="${esc(p.file_path)}">`)}
      <button data-chatrm="${i}" title="Quitar">✕</button>
    </div>`).join('');
  box.querySelectorAll('[data-chatrm]').forEach(b => b.onclick = () => {
    CHAT_PHOTOS.splice(+b.dataset.chatrm, 1);
    if (CHAT_PHOTO_IDX >= CHAT_PHOTOS.length) CHAT_PHOTO_IDX = 0;
    renderChatPhotos();
    chatUpdateSendBtn();
    if (CHAT_IDEA) renderChatPreviews();
  });
}

// Miniatura liviana (para que la IA "vea" la foto sin mandar megabytes)
function fileToThumb(file, maxSize = 512) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(1, maxSize / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * s));
        cv.height = Math.max(1, Math.round(img.height * s));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        resolve(cv.toDataURL('image/jpeg', 0.7));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

// Miniatura del primer frame de un video (para que la IA "vea" el video)
function fileToVideoThumb(file, maxSize = 512) {
  return new Promise((resolve) => {
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const url = URL.createObjectURL(file);
      const done = (thumb) => { URL.revokeObjectURL(url); resolve(thumb); };
      const timer = setTimeout(() => done(null), 6000);
      v.onloadeddata = () => {
        try { v.currentTime = Math.min(0.2, (v.duration || 1) / 2); } catch (e) { clearTimeout(timer); done(null); }
      };
      v.onseeked = () => {
        try {
          const s = Math.min(1, maxSize / Math.max(v.videoWidth || 1, v.videoHeight || 1));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round((v.videoWidth || 320) * s));
          cv.height = Math.max(1, Math.round((v.videoHeight || 240) * s));
          cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
          clearTimeout(timer); done(cv.toDataURL('image/jpeg', 0.7));
        } catch (e) { clearTimeout(timer); done(null); }
      };
      v.onerror = () => { clearTimeout(timer); done(null); };
      v.src = url;
    } catch (e) { resolve(null); }
  });
}
async function chatUploadPhotos(files) {
  const m = $('#chatMsg');
  const items = [...(files || [])].filter(f => f.type && (f.type.startsWith('image/') || f.type.startsWith('video/'))).slice(0, 4);
  if (!items.length) return;
  try {
    const nImgs = items.filter(f => f.type.startsWith('image/')).length;
    const nVids = items.length - nImgs;
    const what = [nImgs ? (nImgs > 1 ? nImgs + ' fotos' : 'foto') : '', nVids ? (nVids > 1 ? nVids + ' videos' : 'video') : ''].filter(Boolean).join(' y ');
    if (m) m.innerHTML = `<div class="okmsg">⏳ Subiendo ${what}…</div>`;
    for (const f of items) {
      const isVid = f.type.startsWith('video/');
      const url = isVid ? '/api/assets?kind=video' : '/api/media';
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': f.type || (isVid ? 'video/mp4' : 'image/jpeg') }, body: f });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo');
      const aiUrl = isVid ? await fileToVideoThumb(f) : await fileToThumb(f);
      CHAT_PHOTOS.push({ file_path: data.path, aiUrl, sent: false, kind: isVid ? 'video' : 'photo' });
    }
    if (m) m.innerHTML = '';
    renderChatPhotos();
    if (CHAT_IDEA) {
      CHAT_PHOTO_IDX = CHAT_PHOTOS.length - 1;
      renderChatPreviews();
      renderChatStoryboard();
      chatSay('📸 ¡Agregado! Actualicé los ejemplos 👇');
    } else {
      chatSay('📸 ¡Agregado! La IA también lo puede ver 👇');
    }
  } catch (e) {
    if (m) m.innerHTML = `<div class="err">${esc(e.message || 'No pude subirlo 😅 Probá de nuevo')}</div>`;
  }
}

// Estilos disponibles para los ejemplos (se rotan con "otro estilo")
function chatStyles() {
  const p = CUSTOM_PAL ? 0 : defaultPal();
  const n = (typeof getPalettes === 'function' ? getPalettes().length : 5) || 5;
  return [['gradiente', p], ['claro', (p + 1) % n], ['noche', (p + 2) % n], ['promo', (p + 3) % n]];
}

// Comandos de edición por chat cuando la idea ya está cerrada.
// Devuelve true si el mensaje era un pedido de edición y lo aplicó.
function chatEditCommand(text) {
  if (!CHAT_IDEA) return false;
  const t = text.trim();
  let m;
  // — Cambiar los colores (pedido directo: "ponelo en rojo", "de color azul") —
  // (Si dice "que diga ...", el color es parte del texto: lo maneja el patrón de título)
  const ORDER_COLORS = { rojo: '#D63A2F', roja: '#D63A2F', rojos: '#D63A2F', rojas: '#D63A2F', azul: '#1F6FEB', azules: '#1F6FEB', celeste: '#2793C8', verde: '#2E9E5B', verdes: '#2E9E5B', amarillo: '#FEC14D', amarillos: '#FEC14D', negro: '#0A1E33', blanco: '#FFFFFF', rosa: '#E85D9E', rosas: '#E85D9E', naranja: '#F07B2D', violeta: '#7B5CD6', dorado: '#C9A227' };
  if (!/que\s+diga/i.test(t)) {
    m = t.match(/(?:ponelo|ponela|cambial[oe]|hacelo|hacela|en|de\s+color|con\s+color)\s+(?:color\s+)?(rojo|roja|rojos|rojas|azul|azules|celeste|verde|verdes|amarillo|amarillos|negro|blanco|rosa|rosas|naranja|violeta|dorado)\b/i);
    if (m && ORDER_COLORS[m[1].toLowerCase()]) {
      CUSTOM_PAL = orderPalette([ORDER_COLORS[m[1].toLowerCase()]]);
      chatSay(`✅ Ahora en ${m[1].toLowerCase()} 👇`);
      renderChatPreviews();
      return true;
    }
  }
  // — Cambiar el título (solo pedidos explícitos) —
  const titlePats = [
    /t[ií]tulo\s*:\s*["“]?(.+?)["”]?\s*$/i,
    /\bcambial[eo]\s+(?:el\s+t[ií]tulo\s+)?a\s+["“]?(.+?)["”]?\s*$/i,
    /\bque\s+diga\s+["“]?(.+?)["”]?\s*$/i,
  ];
  for (const pat of titlePats) {
    m = t.match(pat);
    if (m && m[1]) {
      const nt = m[1].trim();
      if (nt.length >= 2 && nt.length <= 50) {
        CHAT_IDEA.titulo = nt;
        CHAT_CAPTION = null; CHAT_CAPTIONS = []; CHAT_CAP_SEL = 0; // el texto se regenera para el nuevo título
        chatSay(`✅ Título actualizado: "${nt}". Fijate los ejemplos 👇`);
        chatRenderProposal();
        refreshChatCaption();
        return true;
      }
    }
  }
  // — Cambiar la foto —
  const nPhotos = CHAT_PHOTOS.length;
  if (nPhotos > 1 && /\botra\s+foto\b/i.test(t)) {
    CHAT_PHOTO_IDX = (CHAT_PHOTO_IDX + 1) % nPhotos;
    chatSay('✅ Cambié la foto. ¿Te gusta más así? 👇');
    renderChatPreviews();
    renderChatStoryboard();
    return true;
  }
  m = t.match(/foto\s*(?:n[uú]mero\s*)?(\d)/i);
  if (m) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < nPhotos) {
      CHAT_PHOTO_IDX = idx;
      chatSay(`✅ Usando la foto ${idx + 1} 👇`);
      renderChatPreviews();
      renderChatStoryboard();
      return true;
    }
  }
  // — Cambiar el estilo —
  if (/\botro\s+(estilo|diseño|fondo)\b/i.test(t) || /\b(cambi[ae]|ponele)\s+(otro\s+)?(fondo|estilo|diseño)\b/i.test(t) || /\bm[aá]s\s+(claro|oscuro)\b/i.test(t)) {
    chatSay('✅ Generando con otro estilo 👇');
    renderChatPreviews();
    renderChatStoryboard();
    return true;
  }
  return false;
}

function chatScroll() {
  const b = $('#chatBox');
  if (b) b.scrollTop = b.scrollHeight;
}

function chatRenderProposal() {
  const p = $('#chatProposal');
  if (!p) return;
  p.innerHTML = proposalHTML();
  // Placeholder de los ejemplos visuales: Posty piensa en voz alta mientras se generan
  const pvT = document.getElementById('chatPrevThinking');
  if (pvT) postyThinking(pvT);
  if (!CHAT_IDEA) return;
  const mkP = $('#chatMkPost'), mkR = $('#chatMkReel');
  if (mkP) mkP.onclick = () => { track('chat_idea_accepted', { reel: false }); chatMakePost(false); };
  if (mkR) mkR.onclick = () => { track('chat_idea_accepted', { reel: true }); chatMakePost(true); };
  const mCaps0 = $('#chatMoreCaps');
  if (mCaps0) mCaps0.onclick = chatMoreCaptions;
  const mImg0 = $('#chatMoreImg');
  if (mImg0) mImg0.onclick = chatMoreImage;
  const dsm = $('#chatDismiss');
  if (dsm) dsm.onclick = () => { track('chat_idea_dismissed'); chatDismissProposal(); };
  renderChatPreviews();
  renderChatStoryboard();
  chatScroll();
}

// Salir del panel de la idea (✕) y seguir chateando con Posty.
function chatDismissProposal() {
  CHAT_IDEA = null; CUSTOM_PAL = null;
  CHAT_PREVIEWS = []; CHAT_PREV_SEL = 0;
  CHAT_CAPTION = null; CHAT_CAPTIONS = []; CHAT_CAP_SEL = 0;
  chatRenderProposal();
  chatSay('Dale, la dejamos por acá 👍 ¿Qué más hacemos?');
  try { api.post('/api/ideas/chat/log', { clearIdea: true }).catch(() => {}); } catch (e) {}
}

// Borradores en revisión para que la IA los vea y pueda editarlos directo
function chatDraftsCtx() {
  try {
    return (typeof REVIEW_DRAFTS !== 'undefined' ? REVIEW_DRAFTS : [])
      .filter(d => d && d.id)
      .slice(0, 10)
      .map(d => ({ id: d.id, caption: String(d.caption || '').slice(0, 300), when: String(d.scheduled_at || '').slice(0, 10) }));
  } catch (e) { return []; }
}

// "Posty pensando en voz alta": mientras se genera una idea o imagen, el estado
// rota en primera persona (voz cálida de Posty) cada ~2.5s, en vez de un ⏳ frío.
// postyThinking(el, stages) arranca la rotación sobre `el` y devuelve stop().
// REGLA DURA: llamar a stop (o a stopPostyThinking(el)) SIEMPRE al completar —
// éxito o error — para no dejar intervalos zombis. Si el elemento se desconecta
// del DOM sin stop, el intervalo se apaga solo (seguro extra, no reemplazo).
const POSTY_THINKING = [
  'Estoy eligiendo tu mejor foto 📸…',
  'Escribiendo en tu tono ✍️…',
  'Dándole los toques finales ✨…',
];
function postyThinking(el, stages) {
  if (!el) return function () {};
  stopPostyThinking(el); // nunca dos intervalos rotando sobre el mismo elemento
  const msgs = (stages && stages.length) ? stages : POSTY_THINKING;
  let i = 0;
  el.textContent = msgs[0];
  const t = setInterval(() => {
    if (!el.isConnected) { clearInterval(t); return; }
    i = (i + 1) % msgs.length;
    el.textContent = msgs[i];
  }, 2500);
  const stop = function () { clearInterval(t); };
  try { el._ptStop = stop; } catch (e) {}
  return stop;
}
function stopPostyThinking(el) {
  try { if (el && el._ptStop) { el._ptStop(); el._ptStop = null; } } catch (e) {}
}
// "Posty está escribiendo": tres puntitos animados, como WhatsApp.
// Sin narración del proceso interno (elegir foto, tono, etc.): eso se ve todo.
function postyTyping(el) {
  if (!el) return;
  try { stopPostyThinking(el); } catch (e) {}
  el.innerHTML = '<span class="typing-dots" aria-label="Posty está escribiendo"><span></span><span></span><span></span></span>';
}

async function chatSend() {
  const inp = $('#chatInput');
  const text = (inp.value || '').trim();
  // Las fotos se pueden mandar solas, sin texto: antes el botón no hacía nada en ese caso.
  const unsent = CHAT_PHOTOS.filter(p => p.aiUrl && !p.sent);
  if (!text && !unsent.length) return;
  const sendText = text || (unsent.length === 1 ? '📷 Te mando una foto' : `📷 Te mando ${unsent.length} fotos`);
  const box = $('#chatBox');
  // Las opciones tocables se usan una sola vez: al responder se descartan
  const oldOpts = $('#chatOptions'); if (oldOpts) oldOpts.remove();
  const oldIdeas = $('#chatIdeaOptions'); if (oldIdeas) oldIdeas.remove();
  CHAT.push({ role: 'user', text: sendText });
  track('chat_message', { len: sendText.length });
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg u msg-in">${esc(sendText)}</div>`);
  inp.value = '';
  chatUpdateSendBtn();
  chatScroll();
  // "diagnostico imagen" → prueba la generación de imagen y reporta el error exacto.
  if (/diagn[oó]stico imagen/i.test(sendText)) {
    (async () => {
      try {
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg u msg-in">${esc(sendText)}</div>`);
        inp.value = ''; chatUpdateSendBtn(); chatScroll();
        const sayId = 'diagSay' + Date.now();
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg a" id="${sayId}">Probando la generación de imagen… 🔍</div>`);
        chatScroll();
        const r = await api.post('/api/diag/image-test', {}, { timeout: 90000 });
        const el = document.getElementById(sayId);
        if (r && r.ok) {
          if (el) el.innerHTML = '✅ La generación de imagen funciona. El problema está en otro lado.';
        } else {
          const d = r && r.diag ? r.diag : {};
          let msg = '❌ Encontré el problema:<br><br>';
          msg += `<b>Error:</b> ${esc(r.error || 'desconocido')}<br>`;
          if (d.httpStatus) msg += `<b>HTTP:</b> ${d.httpStatus}<br>`;
          if (d.hasKey === false) msg += '<b>Key:</b> no hay API key en el servidor<br>';
          if (d.bodyPreview) msg += `<b>Respuesta:</b> <small>${esc(d.bodyPreview.slice(0, 150))}</small>`;
          if (el) el.innerHTML = msg;
        }
        chatScroll();
      } catch (e) {
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg a">No pude correr el diagnóstico: ${esc(e.message || '')}</div>`);
        chatScroll();
      }
    })();
    return;
  }
  // "diagnostico semana" → chequea todos los gates de la generación semanal.
  if (/diagn[oó]stico semana/i.test(sendText)) {
    (async () => {
      try {
        const sayId = 'diagWeekSay' + Date.now();
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg a" id="${sayId}">Revisando por qué no se genera tu semana… 🔍</div>`);
        chatScroll();
        const r = await api.post('/api/diag/week-test', {}, { timeout: 90000 });
        const el = document.getElementById(sayId);
        if (r && r.ok && r.diag) {
          const d = r.diag;
          let msg = '📋 <b>Diagnóstico de tu semana:</b><br><br>';
          msg += `Plan activo: ${d.planOk ? '✅' : '❌'}<br>`;
          msg += `Créditos IA: ${d.aiOk ? '✅' : '❌ ' + esc(d.aiErr || '')}<br>`;
          msg += `Datos del negocio: ${d.dnaOk ? '✅' : '❌ (falta descripción)'}<br>`;
          msg += `Posteos existentes: ${d.existing}<br>`;
          msg += `Generación en curso: ${d.running ? '⚠️ sí (trabada?)' : 'no'}<br>`;
          if (d.ideasOk === true) msg += `Ideas: ✅ (${d.ideasCount})<br>`;
          else if (d.ideasOk === false) msg += `Ideas: ❌ ${esc(d.ideasErr || '')}<br>`;
          if (!d.planOk) msg += '<br>❌ Tu plan no está activo.';
          else if (!d.aiOk) msg += '<br>❌ Se acabaron los créditos de IA.';
          else if (!d.dnaOk) msg += '<br>❌ Falta la descripción de tu negocio en Ajustes.';
          else if (d.ideasOk === false) msg += '<br>❌ La IA no está respondiendo.';
          else msg += '<br>✅ Todo ok — la generación debería estar corriendo.';
          if (el) el.innerHTML = msg;
        } else {
          if (el) el.innerHTML = `❌ No se pudo diagnosticar: ${esc((r && r.error) || 'error desconocido')}`;
        }
        chatScroll();
      } catch (e) {
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg a">No pude correr el diagnóstico: ${esc(e.message || '')}</div>`);
        chatScroll();
      }
    })();
    return;
  }
  // "generar semana que viene" → ejecuta el sweep semanal manualmente.
  if (/generar semana que viene/i.test(sendText)) {
    (async () => {
      try {
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg u msg-in">${esc(sendText)}</div>`);
        inp.value = ''; chatUpdateSendBtn(); chatScroll();
        const sayId = 'sweepSay' + Date.now();
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg a" id="${sayId}">Generando tu semana entrante… ⏳</div>`);
        chatScroll();
        const r = await api.post('/api/diag/run-sweep', {}, { timeout: 300000 });
        const el = document.getElementById(sayId);
        if (r && r.ok) {
          const res = r.result || {};
          if (el) el.innerHTML = `✅ Listo: ${res.generated || 0} semanas generadas. Recargá para verla 👆`;
          try { if (typeof refreshWeekPill === 'function') refreshWeekPill(); } catch (e) {}
        } else {
          if (el) el.innerHTML = `❌ No se pudo: ${esc(r.error || 'error desconocido')}`;
        }
        chatScroll();
      } catch (e) {
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg a">Error: ${esc(e.message || '')}</div>`);
        chatScroll();
      }
    })();
    return;
  }
  // "Armame la semana" (chip) → dispara el autopilot directo, como el CTA.
  if (/arma(m|r)?(me)? la semana|armemos (mi|la) semana/i.test(sendText)) {
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text: sendText }] }).catch(() => {}); } catch (e) {}
    try { track('autopilot_start', { from: 'chat' }); } catch (e) {}
    runAutopilotSmart((typeof ME !== 'undefined' && ME && ME.posts_per_week) || 3, 'semana');
    return;
  }
  // "¿qué preguntan en mis comentarios?" → insights del análisis (antes que el flujo de responder comentarios).
  if (/\bcomentarios?\b/i.test(sendText) && /(pregunt|duda|objeci|quieren|frena|dicen)/i.test(sendText)) {
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text: sendText }] }).catch(() => {}); } catch (e) {}
    showCommentInsights();
    return;
  }
  // "¿qué sale esta semana?" → la agenda, adentro del chat.
  if (/qu[eé] sale|esta semana|mi semana|\bagenda\b|programados/i.test(sendText) && !/arma/i.test(sendText)) {
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text: sendText }] }).catch(() => {}); } catch (e) {}
    showWeekInChat();
    return;
  }
  // "reseñas" → la IA trae las reseñas de Google sin responder y deja la respuesta lista, acá en el chat
  if (/\b(reseñas?|resenas?|opiniones|reviews?)\b/i.test(sendText)) {
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text: sendText }] }).catch(() => {}); } catch (e) {}
    showReviewsInChat();
    return;
  }
  // "mensajes" → la IA trae los DMs pendientes de Instagram y deja la respuesta lista, acá en el chat
  if (/\b(mensajes?|dms?|directos?|privados?|bandeja)\b/i.test(sendText)) {
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text: sendText }] }).catch(() => {}); } catch (e) {}
    showDMsInChat();
    return;
  }
  // "comentarios" → la IA trae los pendientes de Instagram y deja la respuesta lista, acá en el chat
  if (/\bcomentarios?\b/i.test(sendText) && !/sin comentarios/i.test(sendText)) {
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text: sendText }] }).catch(() => {}); } catch (e) {}
    showCommentsInChat();
    return;
  }
  // Si la idea está cerrada y el mensaje es un pedido de edición, se aplica directo
  if (CHAT_IDEA && chatEditCommand(sendText)) {
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text: sendText }] }).catch(() => {}); } catch (e) {}
    return;
  }
  return chatExchange({ text: sendText, pushed: true });
}

// Comentarios de IG dentro del chat: la IA los trae y deja la respuesta lista.
async function showCommentsInChat() {
  const box = $('#chatBox');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" id="chatCmTyping">⏳ Revisando tus comentarios…</div>`);
  chatScroll();
  let list = [];
  try { const r = await api.get('/api/comments'); list = (r && r.comments) || []; } catch (e) {}
  if (!list.length) {
    try { await api.post('/api/comments/refresh', {}); const r2 = await api.get('/api/comments'); list = (r2 && r2.comments) || []; } catch (e) {}
  }
  const t = $('#chatCmTyping'); if (t) t.remove();
  const html = list.length ? `
    <div class="chat-msg ai" style="max-width:100%">
      <div style="font-weight:800;margin-bottom:4px">💬 ${list.length} ${list.length === 1 ? 'comentario' : 'comentarios'} para responder</div>
      <div style="font-size:11.5px;color:var(--mut);margin-bottom:8px">Te dejé la respuesta lista — la editás si querés y sale en un toque.</div>
      ${list.map(c => `
      <div data-chatcm="${c.id}" style="background:#F7FAFC;border-radius:12px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:12.5px;margin-bottom:6px"><b>@${esc(c.username || '')}</b>: ${esc(c.text || '')}</div>
        <textarea class="in" data-chatcmreply="${c.id}" rows="2" style="font-size:16px" aria-label="Respuesta sugerida">${esc(c.suggested || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" data-chatcmdo="reply" data-id="${c.id}">💬 Responder</button>
          <button class="btn btn-ghost btn-sm" data-chatcmdo="dismiss" data-id="${c.id}">Descartar</button>
        </div>
        <div class="hint" data-chatcmmsg="${c.id}" style="margin:6px 0 0"></div>
      </div>`).join('')}
    </div>`
    : `<div class="chat-msg ai">💬 No tenés comentarios pendientes — todo respondido 👌</div>`;
  box.insertAdjacentHTML('beforeend', html);
  const say = list.length ? `Te muestro los ${list.length} comentarios para responder 👆` : 'No tenés comentarios pendientes.';
  CHAT.push({ role: 'assistant', text: say });
  try { api.post('/api/ideas/chat/log', { messages: [{ role: 'assistant', text: say }] }).catch(() => {}); } catch (e) {}
  bindChatComments();
  chatScroll();
}
function bindChatComments() {
  document.querySelectorAll('#chatBox [data-chatcmdo]').forEach(b => {
    if (b.dataset.bound) return; b.dataset.bound = '1';
    b.onclick = async () => {
      const id = b.dataset.id, act = b.dataset.chatcmdo;
      const msg = document.querySelector(`#chatBox [data-chatcmmsg="${id}"]`);
      b.disabled = true;
      try {
        if (act === 'reply') {
          const ta = document.querySelector(`#chatBox [data-chatcmreply="${id}"]`);
          const message = (ta && ta.value || '').trim();
          if (!message) throw new Error('La respuesta está vacía');
          b.textContent = '⏳ Enviando...';
          await api.post(`/api/comments/${id}/reply`, { message });
          if (msg) msg.innerHTML = '<span style="color:#1E7E34">✅ Respondido en Instagram</span>';
        } else {
          await api.post(`/api/comments/${id}/dismiss`, {});
          if (msg) msg.innerHTML = '<span style="color:var(--mut)">Descartado</span>';
        }
        setTimeout(() => { const item = document.querySelector(`#chatBox [data-chatcm="${id}"]`); if (item) item.style.opacity = '.45'; }, 1200);
      } catch (e) {
        b.disabled = false; b.textContent = act === 'reply' ? '💬 Responder' : 'Descartar';
        if (msg) msg.innerHTML = `<span style="color:#C0392B">${esc(e.message || 'No se pudo')}</span>`;
      }
    };
  });
}

// Mensajes directos de IG dentro del chat: espejo de comentarios, respuesta lista en un toque.
async function showDMsInChat() {
  const box = $('#chatBox');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" id="chatDmTyping">⏳ Revisando tus mensajes…</div>`);
  chatScroll();
  let list = [];
  try { const r = await api.get('/api/dms'); list = (r && r.dms) || []; } catch (e) {}
  if (!list.length) {
    try { await api.post('/api/dms/refresh', {}); const r2 = await api.get('/api/dms'); list = (r2 && r2.dms) || []; } catch (e) {}
  }
  const t = $('#chatDmTyping'); if (t) t.remove();
  const html = list.length ? `
    <div class="chat-msg ai" style="max-width:100%">
      <div style="font-weight:800;margin-bottom:4px">📩 ${list.length} ${list.length === 1 ? 'mensaje' : 'mensajes'} para responder</div>
      <div style="font-size:11.5px;color:var(--mut);margin-bottom:8px">Te dejé la respuesta lista — la editás si querés y sale en un toque.</div>
      ${list.map(d => `
      <div data-chatdm="${d.id}" style="background:#F7FAFC;border-radius:12px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:12.5px;margin-bottom:6px"><b>@${esc(d.username || '')}</b>: ${esc(d.text || '')}</div>
        <textarea class="in" data-chatdmreply="${d.id}" rows="2" style="font-size:16px" aria-label="Respuesta sugerida">${esc(d.suggested || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" data-chatdmdo="reply" data-id="${d.id}">📩 Responder</button>
          <button class="btn btn-ghost btn-sm" data-chatdmdo="dismiss" data-id="${d.id}">Descartar</button>
        </div>
        <div class="hint" data-chatdmmsg="${d.id}" style="margin:6px 0 0"></div>
      </div>`).join('')}
    </div>`
    : `<div class="chat-msg ai">📩 No tenés mensajes pendientes — bandeja al día 👌</div>`;
  box.insertAdjacentHTML('beforeend', html);
  const say = list.length ? `Te muestro los ${list.length} mensajes para responder 👆` : 'No tenés mensajes pendientes.';
  CHAT.push({ role: 'assistant', text: say });
  try { api.post('/api/ideas/chat/log', { messages: [{ role: 'assistant', text: say }] }).catch(() => {}); } catch (e) {}
  bindChatDMs();
  chatScroll();
}
function bindChatDMs() {
  document.querySelectorAll('#chatBox [data-chatdmdo]').forEach(b => {
    if (b.dataset.bound) return; b.dataset.bound = '1';
    b.onclick = async () => {
      const id = b.dataset.id, act = b.dataset.chatdmdo;
      const msg = document.querySelector(`#chatBox [data-chatdmmsg="${id}"]`);
      b.disabled = true;
      try {
        if (act === 'reply') {
          const ta = document.querySelector(`#chatBox [data-chatdmreply="${id}"]`);
          const message = (ta && ta.value || '').trim();
          if (!message) throw new Error('La respuesta está vacía');
          b.textContent = '⏳ Enviando...';
          await api.post(`/api/dms/${id}/reply`, { message });
          if (msg) msg.innerHTML = '<span style="color:#1E7E34">✅ Respondido en Instagram</span>';
        } else {
          await api.post(`/api/dms/${id}/dismiss`, {});
          if (msg) msg.innerHTML = '<span style="color:var(--mut)">Descartado</span>';
        }
        setTimeout(() => { const item = document.querySelector(`#chatBox [data-chatdm="${id}"]`); if (item) item.style.opacity = '.45'; }, 1200);
      } catch (e) {
        b.disabled = false; b.textContent = act === 'reply' ? '📩 Responder' : 'Descartar';
        if (msg) msg.innerHTML = `<span style="color:#C0392B">${esc(e.message || 'No se pudo')}</span>`;
      }
    };
  });
}

// Reseñas de Google dentro del chat: espejo de comentarios/DMs, respuesta lista en un toque.
async function showReviewsInChat() {
  const box = $('#chatBox');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" id="chatRvTyping">⏳ Revisando tus reseñas…</div>`);
  chatScroll();
  let list = [];
  try { const r = await api.get('/api/reviews'); list = (r && r.reviews) || []; } catch (e) {}
  if (!list.length) {
    try { await api.post('/api/reviews/refresh', {}); const r2 = await api.get('/api/reviews'); list = (r2 && r2.reviews) || []; } catch (e) {}
  }
  const t = $('#chatRvTyping'); if (t) t.remove();
  const stars = (n) => '⭐'.repeat(Math.max(1, Math.min(5, Number(n) || 0)));
  const html = list.length ? `
    <div class="chat-msg ai" style="max-width:100%">
      <div style="font-weight:800;margin-bottom:4px">⭐ ${list.length} ${list.length === 1 ? 'reseña' : 'reseñas'} de Google para responder</div>
      <div style="font-size:11.5px;color:var(--mut);margin-bottom:8px">Te dejé la respuesta lista — la editás si querés y sale en un toque.</div>
      ${list.map(rv => `
      <div data-chatrv="${rv.id}" style="background:#F7FAFC;border-radius:12px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:12.5px;margin-bottom:2px"><b>${esc(rv.reviewer || 'Un cliente')}</b> · ${stars(rv.star_rating)}</div>
        <div style="font-size:12.5px;margin-bottom:6px">${esc(rv.text || '(dejó solo la calificación, sin texto)')}</div>
        <textarea class="in" data-chatrvreply="${rv.id}" rows="2" style="font-size:16px" aria-label="Respuesta sugerida">${esc(rv.suggested || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary btn-sm" data-chatrvdo="reply" data-id="${rv.id}">⭐ Responder</button>
          <button class="btn btn-ghost btn-sm" data-chatrvdo="dismiss" data-id="${rv.id}">Descartar</button>
        </div>
        <div class="hint" data-chatrvmsg="${rv.id}" style="margin:6px 0 0"></div>
      </div>`).join('')}
    </div>`
    : `<div class="chat-msg ai">⭐ No tenés reseñas pendientes — todo respondido 👏</div>`;
  box.insertAdjacentHTML('beforeend', html);
  const say = list.length ? `Te muestro las ${list.length} reseñas para responder 👇` : 'No tenés reseñas pendientes.';
  CHAT.push({ role: 'assistant', text: say });
  try { api.post('/api/ideas/chat/log', { messages: [{ role: 'assistant', text: say }] }).catch(() => {}); } catch (e) {}
  bindChatReviews();
  chatScroll();
}
function bindChatReviews() {
  document.querySelectorAll('#chatBox [data-chatrvdo]').forEach(b => {
    if (b.dataset.bound) return; b.dataset.bound = '1';
    b.onclick = async () => {
      const id = b.dataset.id, act = b.dataset.chatrvdo;
      const msg = document.querySelector(`#chatBox [data-chatrvmsg="${id}"]`);
      b.disabled = true;
      try {
        if (act === 'reply') {
          const ta = document.querySelector(`#chatBox [data-chatrvreply="${id}"]`);
          const message = (ta && ta.value || '').trim();
          if (!message) throw new Error('La respuesta está vacía');
          b.textContent = '⏳ Enviando...';
          await api.post(`/api/reviews/${id}/reply`, { message });
          if (msg) msg.innerHTML = '<span style="color:#1E7E34">✅ Respondida en Google</span>';
        } else {
          await api.post(`/api/reviews/${id}/dismiss`, {});
          if (msg) msg.innerHTML = '<span style="color:var(--mut)">Descartada</span>';
        }
        setTimeout(() => { const item = document.querySelector(`#chatBox [data-chatrv="${id}"]`); if (item) item.style.opacity = '.45'; }, 1200);
      } catch (e) {
        b.disabled = false; b.textContent = act === 'reply' ? '⭐ Responder' : 'Descartar';
        if (msg) msg.innerHTML = `<span style="color:#C0392B">${esc(e.message || 'No se pudo')}</span>`;
      }
    };
  });
}

// Acepta la idea elegida: es el flujo EXACTO del de una sola idea (no se duplica lógica).
function chatAcceptIdea(idea) {
  CHAT_IDEA = idea; CHAT_CAPTION = null; CHAT_CAPTIONS = []; CHAT_CAP_SEL = 0;
  CHAT_STYLE_USED = [];
  applyChatOrder(idea); // foto elegida + colores del pedido
  chatRenderProposal();
  // Texto dictado por el cliente: va tal cual al textarea y se respeta (touched)
  const ta = $('#chatCaption');
  if (ta && idea.caption) { ta.value = idea.caption; ta.dataset.touched = '1'; }
  refreshChatCaption(); // solo rellena hashtags/opciones; el texto dictado no se toca
}

// MODO OPCIONES: tarjetas compactas tocables con las ideas propuestas; el cliente elige una.
function renderChatIdeaOptions(ideas) {
  const box = $('#chatBox');
  if (!box || !Array.isArray(ideas) || ideas.length < 2) return;
  const old = $('#chatIdeaOptions'); if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg ai';
  wrap.id = 'chatIdeaOptions';
  wrap.style.maxWidth = '100%';
  wrap.style.whiteSpace = 'normal';
  const head = document.createElement('div');
  head.style.cssText = 'font-weight:800;margin-bottom:8px';
  head.textContent = '✨ Elegí la idea que más te guste 👇';
  wrap.appendChild(head);
  ideas.slice(0, 3).forEach((idea, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'chat-idea-card';
    card.innerHTML = `
      ${idea.image_url ? `<img src="${esc(String(idea.image_url))}" style="width:100%;border-radius:10px;margin-bottom:6px;display:block" loading="lazy" alt="">` : ''}
      <div style="font-weight:800;font-size:13px;margin-bottom:4px">✨ ${esc(String(idea.titulo || ('Idea ' + (i + 1))))}</div>
      ${idea.angulo ? `<div style="font-size:11.5px;color:var(--mut)">${esc(String(idea.angulo))}</div>` : ''}`;
    card.onclick = () => {
      // La elegida queda marcada como elegida; las otras se descartan visualmente
      wrap.querySelectorAll('.chat-idea-card').forEach(el => el.classList.add('chat-idea-off'));
      card.classList.remove('chat-idea-off');
      card.classList.add('chat-idea-picked');
      const badge = document.createElement('div');
      badge.className = 'chat-idea-pick';
      badge.textContent = '✅ La elegiste';
      card.appendChild(badge);
      chatAcceptIdea(idea);
    };
    wrap.appendChild(card);
  });
  box.appendChild(wrap);
  chatScroll();
}

// Intercambio completo con /api/ideas/chat. `extra` agrega campos al JSON
// (ej: { audio: "data:audio/webm;base64,..." } para notas de voz).
async function chatExchange({ text, display, extra, pushed }) {
  const box = $('#chatBox'), m = $('#chatMsg'), btn = $('#chatMicSend');
  if (!pushed) {
    const oldOpts = $('#chatOptions'); if (oldOpts) oldOpts.remove();
    const oldIdeas = $('#chatIdeaOptions'); if (oldIdeas) oldIdeas.remove();
    CHAT.push({ role: 'user', text });
    box.insertAdjacentHTML('beforeend', `<div class="chat-msg u msg-in">${esc(display || text)}</div>`);
    chatScroll();
  }
  if (btn) btn.disabled = true;
  CHAT_IDEA = null; CUSTOM_PAL = null; CHAT_PREVIEWS = []; CHAT_PREV_SEL = 0; chatRenderProposal();
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" id="chatTyping"></div>`);
  postyTyping(document.getElementById('chatTyping'));
  chatScroll();
  postyWorking(true);
  // Fotos subidas en el chat que la IA todavía no vio → se las mandamos con este mensaje
  const unsentPhotos = CHAT_PHOTOS.filter(p => p.aiUrl && !p.sent).map(p => p.aiUrl);
  // Sus fotos guardadas (miniaturas): para que pueda usar la que le pidan ("la del asado")
  let libThumbs = [];
  try { libThumbs = await chatLibThumbs(); } catch (e) {}
  try {
    const r = await api.post('/api/ideas/chat', Object.assign(
      { messages: CHAT.map(m => ({ role: m.role, text: chatStripMcMarker(m.text) })), photos: unsentPhotos, library: libThumbs, drafts: chatDraftsCtx(),
        photoPaths: CHAT_PHOTOS.map(p => p && p.file_path).filter(Boolean) }, extra || {}));
    const t = $('#chatTyping'); if (t) { stopPostyThinking(t); t.remove(); }
    CHAT_PHOTOS.forEach(p => { if (p.aiUrl && unsentPhotos.includes(p.aiUrl)) p.sent = true; });
    CHAT.push({ role: 'assistant', text: r.reply || '…' });
    box.insertAdjacentHTML('beforeend', chatMsgHtml('assistant', r.reply || '…'));
    postyNotify('Posty', r.reply || '…');
    // El ADN se completó en esta respuesta (bloque ```dna): invitar a generar de nuevo.
    // Nunca auto-disparar la generación: el cliente toca "⚡ Armemos tu semana" cuando quiere.
    if (r.dna) chatSay('¡Ya sé lo esencial de tu negocio! 🎉 Ahora tocá de nuevo "⚡ Armemos tu semana" y la armamos en serio.');
    // Opciones tocables que propone la IA (ej: "¿vender o alcance?")
    if (r.options && Array.isArray(r.options) && r.options.length) renderChatOptions(r.options);
    // La IA editó un borrador directo → refrescar la revisión y mostrar la imagen en el chat
    if (r.edit && r.edit.ok) {
      try { render(); } catch (e) {}
      if (r.edit.photoFailed) {
        box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">No pude cambiar la foto 😅 ¿me la mandás de nuevo?</div>`);
        chatScroll();
      }
      if (Array.isArray(r.edit.images) && r.edit.images.length) {
        box.insertAdjacentHTML('beforeend', r.edit.images.map(u =>
          `<div class="chat-msg ai" style="max-width:100%;padding:8px"><img src="${esc(u)}" style="width:100%;border-radius:12px;display:block" alt="Borrador editado" loading="lazy"></div>`
        ).join(''));
      }
    }
    if (Array.isArray(r.ideas) && r.ideas.length > 1) {
      // MODO OPCIONES: el cliente elige entre varias ideas tocando su tarjeta
      renderChatIdeaOptions(r.ideas);
    } else if (r.idea) {
      chatAcceptIdea(r.idea);
    }
    // El cliente pidió VER sus posteos: mostrar los borradores reales con imagen.
    // Nunca texto sin imágenes.
    if (Array.isArray(r.showDrafts) && r.showDrafts.length) renderChatShowDrafts(r.showDrafts);
  } catch (e) {
    const t = $('#chatTyping'); if (t) { stopPostyThinking(t); t.remove(); }
    if (m) m.innerHTML = `<div class="err">${esc(e.message || 'No pudimos responder')}</div>`;
  }
  postyWorking(false);
  if (btn) { btn.disabled = false; chatUpdateSendBtn(); }
  chatScroll();
}

// Posty parpadea como un humano: cada 3.5-6.5s cierra los ojos 140ms.
// Solo cuando está tranqui (no mientras trabaja).
(function postyBlinkLoop() {
  try { const p = new Image(); p.src = 'ai-avatar-blink.png'; } catch (e) {}
  const blink = () => {
    try {
      const w = document.querySelector('.chome-ava-wrap');
      const img = w && w.querySelector('.chome-ava');
      if (w && img && !w.classList.contains('working') && img.src.includes('ai-avatar.png') && !img.src.includes('blink')) {
        const orig = img.src;
        img.src = 'ai-avatar-blink.png';
        setTimeout(() => { try { if (img.src.includes('blink')) img.src = orig; } catch (e) {} }, 140);
      }
    } catch (e) {}
    setTimeout(blink, 3500 + Math.random() * 3000);
  };
  setTimeout(blink, 2500);
})();

// Posty trabajando (v210): sin malabares — mientras genera, el avatar
// queda visible y quieto (la clase .working apaga el idle via CSS).
// Si quedo un video de malabares de una version anterior en el DOM, se
// limpia y el avatar vuelve a mostrarse.
function postyWorking(on) {
  try {
    document.querySelectorAll('.chome-ava-wrap').forEach(w => {
      w.classList.toggle('working', !!on);
      const img = w.querySelector('.chome-ava');
      if (img) img.style.display = '';
      const vid = w.querySelector('.chome-ava-vid');
      if (vid) { try { vid.pause(); } catch (e) {} vid.remove(); }
    });
  } catch (e) {}
}

async function chatMakePost(asVideo) {
  const idea = CHAT_IDEA;
  if (!idea) return;
  // Cupo del plan: chequear antes de crear para no perder la idea armada
  try {
    const q = await api.get('/api/quota');
    try { const mount = document.getElementById('chatQuickChips'); if (mount) { paintChatQuota(mount, q); } } catch (e) {}
    if (q.left <= 0) { quotaModal(q); return; }
  } catch (e) {}
  const m = $('#chatMsg');
  const mkP = $('#chatMkPost'), mkR = $('#chatMkReel');
  if (mkP) mkP.disabled = true;
  if (mkR) mkR.disabled = true;
  try {
    if (m) {
      m.innerHTML = '<div class="okmsg"><span id="chatMkThinking"></span></div>';
      postyThinking($('#chatMkThinking'), asVideo
        ? ['Estoy eligiendo tu mejor foto 📸…', 'Armando las escenas de tu reel 🎬…', 'Dándole los toques finales ✨…']
        : POSTY_THINKING);
    }
    if (!asVideo && CHAT_PREVIEWS.length) {
      await draftFromPreview(idea, CHAT_PREVIEWS[CHAT_PREV_SEL] || CHAT_PREVIEWS[0]);
    } else {
      await draftFromIdea(idea, asVideo, 0, true);
    }
    stopPostyThinking(document.getElementById('chatMkThinking'));
    if (m) m.innerHTML = '<div class="okmsg">¡Listo! ✅</div>';
    CHAT_IDEA = null;
    CUSTOM_PAL = null;
    CHAT_PREVIEWS = []; CHAT_PREV_SEL = 0;
    CHAT_PHOTOS = []; CHAT_PHOTO_IDX = 0; CHAT_STYLE_IDX = 0;
    CHAT_CAPTION = null; CHAT_CAPTIONS = []; CHAT_CAP_SEL = 0;
    const doneText = '¡Listo! Te lo dejé en revisión acá arriba 👆 Nada se programa hasta que vos lo apruebes.';
    try { api.post('/api/ideas/chat/log', { clearIdea: true, messages: [{ role: 'assistant', text: doneText }] }).catch(() => {}); } catch (e) {}
    CHAT.push({ role: 'assistant', text: doneText });
    render();
    try { const mount = document.getElementById('chatQuickChips'); if (mount) { paintChatQuota(mount); } } catch (e) {}
    try { if (typeof refreshWeekPill === 'function') refreshWeekPill(); } catch (e) {}
    setTimeout(() => {
      const rc = $('#reviewCard') || $('#draftsBanner');
      if (rc) rc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  } catch (e) {
    const capMsg = (e && e.aiCap) ? (e.message || 'Llegamos al tope de IA de hoy 🔋 Seguimos mañana 💪') : null;
    stopPostyThinking(document.getElementById('chatMkThinking'));
    if (m) m.innerHTML = capMsg ? `<div class="okmsg">${esc(capMsg)}</div>` : `<div class="err">Error: ${esc(e.message)}</div>`;
    if (mkP) mkP.disabled = false;
    if (mkR) mkR.disabled = false;
  }
}

/* ---------- Nota de voz: pedir el posteo hablando ---------- */
let VOICE_REC = null, VOICE_CHUNKS = [], VOICE_TIMER = null, VOICE_START = 0, VOICE_MIME = '';
function voiceTick() {
  if (!VOICE_REC) return;
  const b = document.getElementById('chatMicSend');
  const msg = document.getElementById('chatMsg');
  const s = Math.floor((Date.now() - VOICE_START) / 1000);
  const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (b) b.textContent = `🔴 ${t}`;
  if (msg) msg.innerHTML = `<div class="okmsg">🔴 Grabando ${t} — tocá de nuevo para enviar</div>`;
}
async function voiceToggle() {
  if (VOICE_REC) { voiceStop(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    chatSay('🎙 Tu navegador no soporta notas de voz. Escribime el pedido 👇');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    VOICE_CHUNKS = [];
    VOICE_MIME = rec.mimeType || '';
    rec.ondataavailable = e => { if (e.data && e.data.size) VOICE_CHUNKS.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); voiceSend(); };
    VOICE_REC = rec;
    rec.start();
    VOICE_START = Date.now();
    const b = document.getElementById('chatMicSend');
    if (b) { b.classList.add('btn-rec'); b.textContent = '⏺ 0:00'; }
    clearInterval(VOICE_TIMER);
    VOICE_TIMER = setInterval(voiceTick, 500);
    voiceTick();
    setTimeout(() => { if (VOICE_REC) voiceStop(); }, 90000); // tope 90 segundos
  } catch (e) {
    chatSay('🎙 No pudimos usar el micrófono. Revisá el permiso (Ajustes → Safari → Micrófono) o escribime el pedido 👇');
  }
}
function voiceStop() {
  const rec = VOICE_REC;
  VOICE_REC = null;
  clearInterval(VOICE_TIMER);
  const b = document.getElementById('chatMicSend');
  if (b) { b.classList.remove('btn-rec'); }
  chatUpdateSendBtn();
  const msg = document.getElementById('chatMsg');
  if (msg) msg.innerHTML = '';
  if (rec) { try { rec.stop(); } catch (e) { voiceSend(); } }
}
async function voiceSend() {
  const chunks = VOICE_CHUNKS; VOICE_CHUNKS = [];
  const blob = new Blob(chunks, { type: VOICE_MIME || 'audio/mp4' });
  if (blob.size < 1500) return; // grabación vacía
  // Base64 como data URL (data:audio/webm;base64,...): viaja en el JSON del chat
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || ''));
    fr.onerror = () => res('');
    fr.readAsDataURL(blob);
  });
  if (!dataUrl) { chatSay('🎙 No pudimos procesar la nota de voz. Probá de nuevo o escribime 👇'); return; }
  return chatExchange({ text: '🎙️ Nota de voz', extra: { audio: dataUrl } });
}

// Barra estilo Muse: a la derecha va 🎙 si no hay nada para enviar, ➤ si hay texto o fotos.
function chatUpdateSendBtn() {
  const b = $('#chatMicSend'), inp = $('#chatInput');
  if (!b) return;
  const unsent = (typeof CHAT_PHOTOS !== 'undefined' && CHAT_PHOTOS.some(p => !p.sent));
  const ready = (inp && inp.value.trim().length > 0) || unsent;
  if (VOICE_REC) return; // grabando: no tocar
  if (ready) { b.textContent = '➤'; b.className = 'btn btn-primary'; b.title = 'Enviar'; b.onclick = () => chatSend(); }
  else { b.textContent = '🎙'; b.className = 'btn btn-soft'; b.title = 'Pedir con nota de voz'; b.onclick = () => voiceToggle(); }
}

function bindChat() {
  const inp = $('#chatInput');
  if (!inp) return;
  if (!window.__chatOpenT) { window.__chatOpenT = true; track('chat_open'); }
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chatSend(); } });
  inp.addEventListener('input', chatUpdateSendBtn);
  // Botón ＋ : menú para foto/video (estilo Muse)
  const plus = $('#chatPlus'), menu = $('#chatPlusMenu');
  if (plus && menu) {
    plus.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    if (!window.__plusMenuDoc) {
      window.__plusMenuDoc = true;
      document.addEventListener('click', () => { const mm = $('#chatPlusMenu'); if (mm) mm.hidden = true; });
    }
    menu.querySelectorAll('button[data-k]').forEach(b => b.onclick = (e) => {
      e.stopPropagation(); menu.hidden = true;
      const file = $('#chatFile'); if (!file) return;
      file.accept = b.dataset.k === 'video' ? 'video/*' : 'image/*';
      file.click();
    });
  }
  chatScroll();
  const mkP = $('#chatMkPost'), mkR = $('#chatMkReel');
  if (mkP) mkP.onclick = () => { track('chat_idea_accepted', { reel: false }); chatMakePost(false); };
  if (mkR) mkR.onclick = () => { track('chat_idea_accepted', { reel: true }); chatMakePost(true); };
  const mCapsB = $('#chatMoreCaps');
  if (mCapsB) mCapsB.onclick = chatMoreCaptions;
  const mImgB = $('#chatMoreImg');
  if (mImgB) mImgB.onclick = chatMoreImage;
  const file = $('#chatFile');
  if (file) file.onchange = () => { chatUploadPhotos(file.files); file.value = ''; chatUpdateSendBtn(); };
  chatUpdateSendBtn();
  // Chips de ejemplo: un toque y el ejemplo cae en el input (no se envía solo)
  $$('#chatChips [data-chip]').forEach(b => b.onclick = () => {
    const i = $('#chatInput');
    if (i) { i.value = b.dataset.chip; i.focus(); }
  });
  renderChatPhotos();
  renderChatPreviews();
  renderChatStoryboard();
  if (!CHAT_LOADED) { CHAT_LOADED = true; try { window.__chatHistP = chatLoadHistory(); } catch (e) { window.__chatHistP = null; } }
}

/* ---------- CHAT-FIRST MOBILE: el chat es el home del celular ---------- */
// ---------- 🏠 HOME SIMPLE (2026-10-03) ----------
// Posty es esto: los posteos de la semana uno al lado del otro,
// y el chat abajo si querés cambiar/editar/crear algo distinto.

/* ---------- Piezas compartidas de la semana (home + agenda v217) ---------- */
// Propuestas de día para los borradores: DÍAS DISTINTOS, saltando los que
// ya tienen un posteo real (publicado o programado). Antes salían de
// "hoy + índice" y el corrimiento de las 10:00 hacía que dos posteos
// cayeran "mañana" (reporte de Valentino, 2026-10-16). Las historias
// tienen su propio carril, igual que en el servidor. Extraído TAL CUAL
// del IIFE que vivía dentro de homeWeekHTML (v217): misma entrada
// (all, list, tz) → mismo mapa, para que el carrusel del chat y las
// vistas Día/Semana/Mes de Schedule ubiquen cada borrador en el MISMO día.
function computeProposedIsos(all, list, tz) {
  const map = new Map();
  try {
    const dayKey = (v) => new Date(v).toLocaleDateString('en-CA', { timeZone: tz });
    const takenFeed = new Set(), takenStory = new Set();
    for (const p of all) {
      if (!p || !p.scheduled_at) continue;
      if (p.status !== 'published' && p.status !== 'scheduled') continue;
      (String(p.media_type) === 'story' ? takenStory : takenFeed).add(dayKey(p.scheduled_at));
    }
    const now = new Date();
    const hourNow = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now), 10);
    // Hora propuesta: la mejor hora del negocio (slotHour: best_hour medida
    // con Instagram, 19:00 de respaldo) — la MISMA política que el servidor
    // usa al programar (assignScheduleSlots). Antes era 10:00 fija, y esa
    // hora propuesta es la que el cliente termina aceptando: salía todo a
    // las 10:00 aunque la cuenta tuviera su mejor hora medida.
    const pHour = (typeof slotHour === 'function') ? slotHour() : 19;
    const pHH = String(pHour).padStart(2, '0');
    // Base: hoy si todavía no pasó la hora propuesta del cliente; si no, mañana.
    const cursorFeed = new Date(now.getTime() + (hourNow >= pHour ? 86400000 : 0));
    const cursorStory = new Date(cursorFeed.getTime());
    const nextFree = (cursor, taken) => {
      let d = new Date(cursor.getTime());
      for (let k = 0; k < 21; k++) {
        const ymd = d.toLocaleDateString('en-CA', { timeZone: tz });
        if (!taken.has(ymd)) { taken.add(ymd); return { iso: `${ymd}T${pHH}:00:00`, next: new Date(d.getTime() + 86400000) }; }
        d = new Date(d.getTime() + 86400000);
      }
      return null;
    };
    let cf = cursorFeed, cs = cursorStory;
    for (const d of list) {
      if (!d || d.scheduled_at) continue;
      const isStory = String(d.media_type) === 'story';
      const r = isStory ? nextFree(cs, takenStory) : nextFree(cf, takenFeed);
      if (r) { map.set(d.id, { iso: r.iso }); if (isStory) cs = r.next; else cf = r.next; }
    }
  } catch (e) {}
  return map;
}
// Etiqueta de día/hora de un posteo para la cabecera de su tarjeta:
// programado → su fecha; borrador → el día propuesto (o "Borrador").
function proposedLabelFor(d, proposedIsos, tz) {
  if (d.scheduled_at) return { label: '📮 ' + homeWhenLabel(d.scheduled_at), iso: null };
  try {
    const iso = (proposedIsos.get(d.id) || {}).iso || null;
    if (!iso) return { label: '📝 Borrador', iso: null };
    const lbl = new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: tz });
    return { label: `📅 ${lbl} · ${iso.slice(11, 16)}`, iso };
  } catch (e) { return { label: '📝 Borrador', iso: null }; }
}
// LA tarjeta grande réplica de Instagram (la del carrusel de v215).
// o = { bizName, tz, prop: {label, iso}, count: 'N de M' | null, dia: bool }
// - count null → sin contador en la tarjeta (v217: el "N de M" se leía como
//   índice de fotos del propio posteo; la cuenta vive en la cabecera).
// - dia true → esqueleto fijo y uniforme (.igmock-dia): zonas de alto fijo
//   para que TODAS las tarjetas midan exactamente lo mismo.
// Los publicados solo llegan acá desde la vista Día de Schedule: salen
// con su pastilla ✅ Publicado y sin acciones de borrador.
function weekCardHTML(d, o) {
  o = o || {};
  const tz = o.tz || 'America/Argentina/Buenos_Aires';
  const bizName = o.bizName || 'Mi negocio';
  const prop = o.prop || { label: '📝 Borrador', iso: null };
  const isV = String(d.media_type || '') === 'video';
  const isS = String(d.media_type || '') === 'story';
  const isPub = String(d.status) === 'published';
  // Tarjeta inmediata: borrador nacido sin imagen, creándose ahora mismo.
  const isPending = !d.image_path && d.status === 'draft';
  const media = isPending ? '<span class="pcard-pending-art"><span class="ppa-spark">✨</span><b>Creando imagen…</b></span>'
    : !d.image_path ? '<span class="pcard-nothumb">📝</span>'
    : isV ? `<video src="${esc(d.image_path)}" muted playsinline preload="metadata"></video>`
    : `<img src="${esc(d.image_path)}" alt="" loading="lazy">`;
  const capFull = String(d.caption || d.source_topic || '');
  // ⚡ Publicar ahora (v241, paridad con la tarjeta de revisión de v240):
  // solo si hay pieza lista y el estado lo permite (programado o borrador,
  // nunca en revisión). El mount .pcard-pubnowm recibe el progreso del flujo.
  const canPubNow = !isPending && !!d.image_path && (d.status === 'scheduled' || d.status === 'draft') && !d.needs_review;
  const acts = isPub ? (o.dia ? '<div class="pcard-actions hs-acts"></div>' : '')
    : `<div class="pcard-actions hs-acts">
        ${canPubNow ? '<button type="button" data-pc-act="pubnow" class="pcard-approve">⚡ Publicar ahora</button>' : ''}
        ${d.status === 'scheduled' ? '<button type="button" data-pc-act="hold">⏸ Frenar</button>' : ''}
        <button type="button" data-pc-act="edit-cap">✏️ Editar</button>
        ${isV || isPending ? '' : '<button type="button" data-pc-act="image">🖼️ Imagen</button>'}
        <button type="button" data-pc-act="skip">🗑️ Eliminar</button>
      </div><div class="pubnow-mount pcard-pubnowm"></div>`;
  // data-sched-at / data-day-label: los usa pcSkip para deshacer y para
  // "Armar otro" (la igmock del carrusel original no los traía).
  let dayLabel = '';
  const whenIso = isPub ? (d.published_at || d.scheduled_at) : d.scheduled_at;
  if (whenIso) { const dt = pcParseDate(whenIso); if (dt) dayLabel = pcFmtDayLong(dt, tz) + ' a las ' + dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }); }
  else if (prop.iso) { const dd = new Date(prop.iso.slice(0, 10) + 'T12:00:00Z'); const dn = dd.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' }); dayLabel = dn.charAt(0).toUpperCase() + dn.slice(1) + ' ' + dd.getUTCDate() + ' a las ' + prop.iso.slice(11, 16); }
  // La forma de Instagram: íconos + "Me gusta" solo cuando hay pieza
  // (un borrador creándose todavía no tiene qué mostrar).
  const igChrome = (!isPending && d.image_path) ? `<div class="igmock-acts" aria-hidden="true">${LP_WEEK_ICONS}</div><div class="igmock-likes">Sé el primero en indicar que te gusta</div>` : '';
  const statusHTML = d.status === 'scheduled'
    ? `<span class="pcard-scheduled">📮 Programado</span>`
    : isPub
      ? `<span class="pcard-published">✅ Publicado</span>`
      : isPending
        ? `<span class="pcard-creating">⏳ Creando…</span>`
        : `<button type="button" data-revaccept="${esc(String(d.id))}"${prop.iso ? ` data-proposed="${esc(prop.iso)}"` : ''} class="pcard-accept pcard-accept-top">✅ Aceptar</button>`;
  const capHTML = capFull ? `<div class="igmock-cap" data-pc-act="edit-cap" data-full="${esc(capFull)}" title="Tocá para editar">${esc(capFull)}</div>` : '';
  // (v251) El porqué TAMBIÉN en Día/Semana: mismo tratamiento que la tarjeta
  // de revisión (reviewCardHTML) — ya venía en el payload de /api/posts.
  const whyHTML = d.strategy_why ? `<div style="font-size:11px;color:var(--dim);line-height:1.5;margin-top:8px;overflow-wrap:anywhere">💡 <b>Por qué:</b> ${esc(d.strategy_why)}</div>` : '';
  const foot = o.dia
    ? `<div class="igmock-foot">
        <div class="igmock-chrome">${igChrome}</div>
        ${capFull ? capHTML : '<div class="igmock-cap" aria-hidden="true"></div>'}
        ${acts}
        ${whyHTML}
      </div>`
    : `<div class="igmock-foot">
        ${igChrome}
        ${capHTML}
        ${acts}
        ${whyHTML}
      </div>`;
  return `<div class="igmock igmock-fixed${o.dia ? ' igmock-dia' : ''}" data-post-id="${esc(String(d.id))}" data-sched-at="${esc(String(d.scheduled_at || ''))}" data-day-label="${esc(dayLabel)}">
      <div class="igmock-head"><span class="igmock-name">${esc(bizName)}</span>${o.count ? `
        <span class="igmock-count">${esc(o.count)}</span>` : ''}</div>
      <div class="igmock-when-top"><span>${esc(prop.label)}${isS ? ' · story' : ''}${isV ? ' · reel' : ''}</span>
        ${statusHTML}</div>
      ${isPending
        ? `<div class="igmock-media igmock-pending">${media}</div>`
        : `<button type="button" class="igmock-media" data-lightbox="${esc(d.image_path || '')}" data-video="${isV ? 1 : 0}" aria-label="Ver posteo">${media}</button>`}
      ${foot}
    </div>`;
}

/* ---------- v215: AGENDA = CARRUSEL DE TARJETAS GRANDES ---------- */
// homeWeekHTML pinta el carrusel que Valentino aprobó (el pre-v213):
// tarjetas grandes lado a lado, flechas ‹ ›, cada tarjeta con su día.
// La agenda compacta de v214 (grilla de 7 columnas + cofre #agVault +
// panel #agSheet) quedó descartada por Valentino.
function homeWeekHTML(posts, quota, generating, noDna) {
  prefetchMedia(posts);
  const q = quota || {};
  const qTotal = Number(q.limit) || 0;
  const qUsed = Math.max(0, Number(q.used) || 0);
  const all = posts || [];
  // Solo lo POR VENIR: borradores (a aprobar) + programados (con fecha/hora).
  // Los publicados no van en el home.
  const list = all.filter(p => p && (p.status === 'draft' || p.status === 'scheduled'))
    .sort((a, b) => ((a.status === 'draft' ? 0 : 1) - (b.status === 'draft' ? 0 : 1)) || String(a.scheduled_at || a.created_at || '').localeCompare(String(b.scheduled_at || b.created_at || '')));
  if (!list.length) {
    // 2026-10-06 (ensure honesto): el backend descartó la generación por falta
    // de ADN (reason:'no_dna') — NO mostrar el spinner "armando tu semana"
    // porque no hay nada en camino. Tarjeta honesta con camino a Ajustes.
    // Usa clase propia (hs-nodna) para que el loop de refresh de .hs-generating
    // no corra en este caso.
    if (noDna) return `<div class="hs-nodna" id="hsNoDna">
    <div class="hs-gen-ava"><img src="ai-avatar.png" alt="Posty"></div>
    <b>Para armar tu semana necesito conocer tu negocio 👇</b>
    <p>Contame de qué se trata en 2 minutos y la armo sola ✨</p>
    <a class="btn btn-primary btn-block" href="#/app/ajustes" style="margin-top:4px">Contar de mi negocio</a>
  </div>`;
    // Si estamos generando (ensure disparado), mostrar "armando" aunque
    // haya tenido posteos antes — la semana actual está vacía.
    if (generating) return `<div class="hs-generating" id="hsGenerating">
    <div class="hs-gen-ava"><img src="ai-avatar.png" alt="Posty"></div>
    <b>Posty está armando tu semana ✨</b>
    <p>Diseños, textos y hashtags con la onda de tu negocio.<br>En unos segundos aparece acá 👇</p>
    <div class="hs-gen-dots"><i></i><i></i><i></i></div>
    <button type="button" class="btn btn-ghost btn-sm" id="hsDiagBtn" style="margin-top:12px">🔍 ¿Por qué tarda tanto?</button>
    <div id="hsDiagOut" style="margin-top:10px;text-align:left"></div>
  </div>`;
    // Solo usuario NUEVO de verdad ve "armando": si alguna vez tuvo posteos,
    // la semana está completa (no un spinner eterno).
    const everHad = all.length > 0;
    if (everHad) return `<div class="hs-done">
      <div class="hs-gen-ava"><img src="ai-avatar.png" alt="Posty"></div>
      <b>Tu semana está completa 🎉</b>
      <p>Todo publicado. La próxima se arma sola ✨</p>
    </div>`;
    return `<div class="hs-generating" id="hsGenerating">
    <div class="hs-gen-ava"><img src="ai-avatar.png" alt="Posty"></div>
    <b>Posty está armando tu semana ✨</b>
    <p>Diseños, textos y hashtags con la onda de tu negocio.<br>En unos segundos aparece acá 👇</p>
    <div class="hs-gen-dots"><i></i><i></i><i></i></div>
  </div>`;
  }
  const bizName = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'Mi negocio';
  // 2026-10-05: 5 tarjetas FIJAS en columna (no carrusel), caption completo,
  // botones Aceptar/Editar/Imagen/Eliminar. Pedido de Valentino.
  // 2026-10-09: cada borrador muestra arriba el día propuesto (se programa ahí al aceptar).
  const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  // Propuestas de día para los borradores (compartido con la agenda v217:
  // computeProposedIsos — la misma cuenta que hacía el IIFE que vivía acá).
  const proposedIsos = computeProposedIsos(all, list, tz);

  // ===== v215: EL CARRUSEL DE TARJETAS GRANDES (restaurado) =====
  // La referencia de Valentino es el carrusel pre-v213: tarjetas grandes
  // lado a lado (3 visibles en escritorio), flechas ‹ › laterales, contador
  // "N de M", línea de día/hora con ✅ Aceptar al lado en los borradores,
  // imagen grande (el MASTER directo: las variantes @240 que pedía la
  // miniatura de v214 nunca existieron en el servidor — media-variants
  // solo genera @640 y @24 — y salían rotas), caption y acciones al pie.
  // Lo ÚNICO nuevo de diseño (pedido de Valentino): la forma literal de
  // Instagram DENTRO de la tarjeta — fila de íconos sociales SVG y línea
  // de "Me gusta" entre la imagen y el caption, como las tarjetas de la
  // landing (LP_WEEK_ICONS). Sin conteos inventados (regla de verdad):
  // la línea usa el estado cero real de Instagram.
  const proposedFor = (d) => proposedLabelFor(d, proposedIsos, tz);
  // Programados de semanas anteriores que quedaron sin salir: filas
  // compactas arriba (postCardHTML), como en v213/v214 — no ocupan
  // tarjeta del carrusel ni cuentan en el "N de M".
  const dayKeyOfIso = (iso) => { const d = pcParseDate(iso); return d ? d.toLocaleDateString('en-CA', { timeZone: tz }) : ''; };
  let mondayKeyStr = '';
  try { mondayKeyStr = albumMondayKey(); } catch (e) {}
  const staleItems = list.filter(p => p.status === 'scheduled' && p.scheduled_at && mondayKeyStr && dayKeyOfIso(p.scheduled_at) && dayKeyOfIso(p.scheduled_at) < mondayKeyStr)
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  const staleSet = new Set(staleItems);
  const staleHTML = staleItems.length ? `<div class="ag-stale"><div class="ag-stale-t">⏳ Programados de semanas anteriores</div>${staleItems.map(p => postCardHTML(p, { layout: 'row' })).join('')}</div>` : '';
  const rail = list.filter(p => !staleSet.has(p));
  // Las tarjetas las construye weekCardHTML (compartido con la agenda
  // v217); acá van CON el contador "N de M", como en el carrusel aprobado.
  const cards = rail.map((d, i) => weekCardHTML(d, { bizName, tz, prop: proposedFor(d), count: `${i + 1} de ${rail.length}` })).join('');
  // 2026-10-14 (pedido de Valentino): contador visible de la semana — cuántos
  // posteos van y cuántos quedan del plan, para que el cliente sepa cómo viene.
  // Cupo: UNA sola implementación en todas las superficies (schedQuotaHTML
  // con conteo por ubicación real, schedWeekCounts). La copia que vivía acá
  // contaba con otra lógica y la misma semana daba números distintos en el
  // carrusel y en la agenda.
  const quotaLine = schedQuotaHTML(list, quota, schedWeekCounts(all, tz, proposedIsos));
  // 2026-10-09: flechas laterales del carrusel (pedido de Valentino) — sin números.
  return `<div class="hs-week">
    <div class="hs-week-head"><b>Tu semana</b>${list.some(p => p.status === 'draft') ? `<button type="button" class="btn btn-primary btn-sm" id="hsAcceptAll">✅ Aceptar todo (${list.filter(p => p.status === 'draft').length})</button>` : ''}</div>
    ${quotaLine}
    <div id="hs-report"></div>
    ${generating ? `<div class="hs-completing">✨ Estoy armando los posteos que faltan…</div>` : ''}
    ${staleHTML}
    <div class="hs-carousel">
      <button type="button" class="hs-side" id="hsPrev" aria-label="Anterior">‹</button>
      <div class="hs-week-list" id="hsWeekList">${cards}</div>
      <button type="button" class="hs-side" id="hsNext" aria-label="Siguiente">›</button>
    </div>
  </div>`;
}
function homeWhenLabel(iso) {
  try {
    const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
    let s = String(iso || '').trim();
    if (!s) return '';
    // Normalizar: "YYYY-MM-DD HH:MM:SS" → ISO con Z; si ya trae zona, no duplicar.
    s = s.replace(' ', 'T');
    if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
    const d = new Date(s);
    if (isNaN(d)) return '';
    const day = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', timeZone: tz });
    const hh = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `${day} · ${hh}`;
  } catch (e) { return ''; }
}

/* ===== v217: SCHEDULE CON FILTRO DÍA · SEMANA · MES =====
   Diseño final de Valentino (consolidado de sus correcciones del
   2026-10-18): arriba de Schedule, un filtro segmentado.
   - DÍA: las tarjetas grandes réplica de Instagram de ESE día, con
     esqueleto fijo y uniforme (.igmock-dia), sin contador "N de M" en
     la tarjeta y con las flechas del riel POR FUERA del cuadro.
   - SEMANA: lunes a domingo de una, grilla de 7 columnas; tocar un
     día salta a la vista Día de ese día.
   - MES: el almanaque — semanas apiladas con su rótulo; tocar un día
     salta a Día.
   Ningún posteo desaparece al aceptarlo: queda en su día con su
   estado nuevo (📮 Programado / ✅ Publicado) en las tres vistas.
   Todo se pinta desde scheduled_at / día propuesto / estado — el
   mismo dato de siempre, sin estado paralelo. */
let SCHED_MODE = 'semana';
let FEED_PROFILE = null; // encabezado de la vista Feed: SOLO datos reales del IG (avatar público + seguidores)
try { const m0 = localStorage.getItem('posty_sched_mode'); if (m0 === 'dia' || m0 === 'semana' || m0 === 'mes' || m0 === 'feed') SCHED_MODE = m0; } catch (e) {}
let SCHED_WEEK_OFFSET = 0; // semanas desde la actual (vista Semana)
let SCHED_MONTH_OFFSET = 0; // meses desde el actual (vista Mes)
// (SCHED_DAY_OFFSET — días desde hoy — vive junto a scheduleView.)

// --- Fechas ancladas a mediodía UTC: aritmética de días sin sorpresas
// de zona horaria. El "ymd" SIEMPRE es la fecha local del cliente.
function schedTodayYmd(tz) { try { return new Date().toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return new Date().toISOString().slice(0, 10); } }
function schedYmdToDate(ymd) { const d = new Date(String(ymd || '').slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? null : d; }
function schedDateToYmd(d) { return d.toISOString().slice(0, 10); }
function schedAddDays(ymd, n) { const d = schedYmdToDate(ymd); if (!d) return ymd; d.setUTCDate(d.getUTCDate() + n); return schedDateToYmd(d); }
function schedMondayOf(ymd) { const d = schedYmdToDate(ymd); if (!d) return ymd; const back = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - back); return schedDateToYmd(d); }
function schedDiffDays(fromYmd, toYmd) { const a = schedYmdToDate(fromYmd), b = schedYmdToDate(toYmd); if (!a || !b) return 0; return Math.round((b - a) / 86400000); }
function schedDayKeyOf(dt, tz) { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } }
function schedCap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function schedMonthName(ymd) { const d = schedYmdToDate(ymd); try { return d ? d.toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' }) : ''; } catch (e) { return ''; } }
function schedRangeLabel(a, b) {
  const da = schedYmdToDate(a), db = schedYmdToDate(b);
  if (!da || !db) return '';
  const ma = schedMonthName(a), mb = schedMonthName(b);
  if (ma === mb) return `del ${da.getUTCDate()} al ${db.getUTCDate()} de ${ma}`;
  return `del ${da.getUTCDate()} de ${ma} al ${db.getUTCDate()} de ${mb}`;
}
// Estado visual de un posteo en las vistas de calendario.
function schedPostState(p) {
  if (!p) return 'draft';
  if (p.status === 'published') return 'published';
  if (p.status === 'scheduled') return 'scheduled';
  if (!p.image_path) return 'creating';
  return 'draft';
}
// Ubicación de TODOS los posteos por día: publicados → el día que
// salieron; programados → su scheduled_at; borradores → su scheduled_at
// si lo traen, si no el día propuesto (computeProposedIsos, la misma
// cuenta del carrusel: ningún borrador cambia de día entre vistas).
function schedPlacements(all, tz) {
  const posts = Array.isArray(all) ? all : [];
  const list = posts.filter(p => p && (p.status === 'draft' || p.status === 'scheduled'))
    .sort((a, b) => ((a.status === 'draft' ? 0 : 1) - (b.status === 'draft' ? 0 : 1)) || String(a.scheduled_at || a.created_at || '').localeCompare(String(b.scheduled_at || b.created_at || '')));
  const proposals = computeProposedIsos(posts, list, tz);
  const byDay = new Map();
  const dayOf = new Map();
  const push = (ymd, p, t) => {
    if (!ymd || !p) return;
    if (!byDay.has(ymd)) byDay.set(ymd, []);
    byDay.get(ymd).push({ p, t: t || 0 });
    dayOf.set(p.id, ymd);
  };
  for (const p of posts) {
    if (!p) continue;
    if (p.status === 'published') {
      const dt = pcParseDate(p.published_at || p.scheduled_at);
      if (dt) push(schedDayKeyOf(dt, tz), p, dt.getTime());
    } else if (p.status === 'scheduled') {
      const dt = pcParseDate(p.scheduled_at);
      if (dt) push(schedDayKeyOf(dt, tz), p, dt.getTime());
    } else if (p.status === 'draft') {
      if (p.scheduled_at) {
        const dt = pcParseDate(p.scheduled_at);
        if (dt) { push(schedDayKeyOf(dt, tz), p, dt.getTime()); continue; }
      }
      const iso = (proposals.get(p.id) || {}).iso;
      if (iso) { const base = schedYmdToDate(iso.slice(0, 10)); push(iso.slice(0, 10), p, base ? base.getTime() : 0); }
    }
  }
  for (const arr of byDay.values()) arr.sort((a, b) => a.t - b.t);
  return { byDay, dayOf, proposals, list };
}
// Línea de cupo de Schedule (la misma cuenta y el mismo copy que pinta
// homeWeekHTML en el chat: hechos/quedan + la semana que viene capeada,
// nunca "8 de 5").
// Conteo por UBICACIÓN REAL (la misma moneda que la grilla): piezas del
// pool de feed ubicadas en la semana actual (publicadas + programadas +
// borradores, cada una en SU día) y borradores armados de la semana que
// viene. Es la única fuente de los números del cupo en TODAS las
// superficies (agenda y carrusel): antes cada una contaba distinto — el
// servidor contaba solo programados/publicados, la "semana que viene" era
// una resta de slots y la nota de "fuera de esta semana" contaba por
// ubicación — y los tres números no reconciliaban a la vista del cliente.
function schedWeekCounts(all, tz, proposals) {
  const out = { thisWeek: 0, nextDrafts: 0 };
  try {
    const posts = Array.isArray(all) ? all : [];
    const today = schedTodayYmd(tz);
    const mon = schedMondayOf(today), sun = schedAddDays(mon, 6);
    const nMon = schedAddDays(mon, 7), nSun = schedAddDays(mon, 13);
    const dayOf = (p) => {
      if (p.status === 'published') { const dt = pcParseDate(p.published_at || p.scheduled_at); return dt ? schedDayKeyOf(dt, tz) : ''; }
      if (p.scheduled_at) { const dt = pcParseDate(p.scheduled_at); return dt ? schedDayKeyOf(dt, tz) : ''; }
      const iso = proposals && proposals.get ? ((proposals.get(p.id) || {}).iso || '') : '';
      return iso ? iso.slice(0, 10) : '';
    };
    for (const p of posts) {
      if (!p || /^(story|video)$/.test(String(p.media_type || 'image'))) continue;
      const k = dayOf(p);
      if (!k) continue;
      if (k >= mon && k <= sun && (p.status === 'draft' || p.status === 'scheduled' || p.status === 'published')) out.thisWeek++;
      if (p.status === 'draft' && k >= nMon && k <= nSun) out.nextDrafts++;
    }
  } catch (e) {}
  return out;
}
function schedQuotaHTML(list, quota, wk) {
  const q = quota || {};
  const qTotal = Number(q.limit) || 0;
  if (!(qTotal > 0)) return '';
  const qUsed = Math.max(0, Number(q.used) || 0);
  // La línea principal cuenta las piezas UBICADAS en esta semana (lo que la
  // grilla muestra); sin datos de ubicación cae al "used" del servidor.
  const shown = (wk && Number.isFinite(wk.thisWeek)) ? wk.thisWeek : qUsed;
  const qLeft = Math.max(0, qTotal - shown);
  const qPct = Math.min(100, Math.round((shown / qTotal) * 100));
  const nd = wk ? (wk.nextDrafts || 0) : 0;
  const nextLine = nd > 0
    ? `<div class="hs-quota-next">✨ Ya están armados <b>${Math.min(nd, qTotal)} de ${qTotal}</b> de la semana que viene${nd > qTotal ? ` · y <b>${nd - qTotal} más</b> en espera` : ''}</div>`
    : '';
  return `<div class="hs-quota">
      <div class="hs-quota-txt">${shown >= qTotal
        ? `🎉 <b>¡Semana completa!</b> ${shown} de ${qTotal} posteos esta semana`
        : `📊 <b>${shown} de ${qTotal}</b> posteos esta semana · te ${qLeft === 1 ? 'queda' : 'quedan'} <b>${qLeft}</b>`}</div>
      <div class="hs-quota-bar"><span style="width:${qPct}%"></span></div>
      ${nextLine}
    </div>`;
}
// Tira de programados de semanas anteriores que quedaron sin salir
// (la misma de v215: filas compactas de postCardHTML, siempre visible).
function schedStaleHTML(all, tz) {
  let mondayKeyStr = '';
  try { mondayKeyStr = albumMondayKey(); } catch (e) {}
  if (!mondayKeyStr) return '';
  const stale = (all || []).filter(p => p && p.status === 'scheduled' && p.scheduled_at)
    .filter(p => { const dt = pcParseDate(p.scheduled_at); const k = dt ? schedDayKeyOf(dt, tz) : ''; return !!k && k < mondayKeyStr; })
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  if (!stale.length) return '';
  return `<div class="ag-stale"><div class="ag-stale-t">⏳ Programados de semanas anteriores</div>${stale.map(p => postCardHTML(p, { layout: 'row' })).join('')}</div>`;
}
// Miniatura de calendario (Semana/Mes): la imagen MAESTRA o su variante
// @640 que SÍ existe (la @240 de v214 no existe: prohibida), con punto
// de estado y badge de reel/story. Videos: el propio archivo de portada.
function schedMiniHTML(p, timeLabel) {
  const st = schedPostState(p);
  const isV = String(p.media_type || '') === 'video';
  const isS = String(p.media_type || '') === 'story';
  const media = !p.image_path
    ? '<span class="scf-mini ph">✨</span>'
    : isV
      ? `<span class="scf-mini"><video src="${esc(p.image_path)}" muted playsinline preload="metadata"></video><i class="scf-dot st-${st}"></i><em class="scf-mini-badge">🎬</em></span>`
      : `<span class="scf-mini"><img src="${esc(mv(p.image_path, 640))}" data-full="${esc(p.image_path)}" onerror="__imgFb(this)" loading="lazy" alt=""><i class="scf-dot st-${st}"></i>${isS ? '<em class="scf-mini-badge">📸</em>' : ''}</span>`;
  return media + (timeLabel ? `<span class="scf-mini-t">${esc(timeLabel)}</span>` : '');
}
function schedMiniTime(p) {
  const dt = pcParseDate(p.scheduled_at || p.published_at);
  if (dt) { try { return dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: pcTz() }); } catch (e) {} }
  return String((typeof slotHour === 'function') ? slotHour() : 19).padStart(2, '0') + ':00'; // borrador sin fecha: su propuesta sale a la mejor hora
}
// --- Vista DÍA: tarjetas grandes de un solo día, en riel horizontal ---
function schedDiaBodyHTML(ctx) {
  const { pl, tz, bizName } = ctx;
  const today = schedTodayYmd(tz);
  const ymd = schedAddDays(today, SCHED_DAY_OFFSET);
  const items = pl.byDay.get(ymd) || [];
  if (!items.length) {
    const d = schedYmdToDate(ymd);
    const dl = d ? pcFmtDayLong(d, 'UTC') : ymd;
    // v221 (corrección de Valentino: "cuando paso de semana aparece una
    // pantalla que no tiene nada que ver"): el día vacío se muestra
    // DENTRO del mismo riel de Día (mismo marco, flechas fantasma en su
    // lugar), vacío y honesto — nunca como otro componente a pantalla
    // completa que rompe la naturaleza de la vista al navegar.
    const phE = '<span class="scf-arrow scf-arrow-ph" aria-hidden="true">‹</span>';
    return `<div class="scf-railwrap">
    ${phE}
    <div class="hs-week-list scf-rail" id="hsWeekList"><div class="scf-dayempty"><b>🕊️ Nada para este día</b><span>Este día está libre en tu agenda.</span><button type="button" class="sched-ghost scf-ghost" data-sched-day="${esc(dl)}"><span class="sg-plus">+</span><span class="sg-txt">Pedirle a Posty un posteo para este día</span></button></div></div>
    ${phE.replace('‹', '›')}
  </div>`;
  }
  const cards = items.map(({ p }) => {
    const prop = p.status === 'published'
      ? { label: '✅ ' + homeWhenLabel(p.published_at || p.scheduled_at), iso: null }
      : proposedLabelFor(p, pl.proposals, tz);
    return weekCardHTML(p, { bizName, tz, prop, dia: true });
  }).join('');
  const arrows = items.length > 1;
  // El espacio de las flechas se reserva SIEMPRE (fantasma invisible en
  // días de un solo posteo): si el riel cambiara de ancho según el día,
  // las tarjetas — que miden % del riel — cambiarían de alto entre días
  // y volvería el "no están iguales" que Valentino marcó.
  const ph = '<span class="scf-arrow scf-arrow-ph" aria-hidden="true">‹</span>';
  return `<div class="scf-railwrap">
    ${arrows ? '<button type="button" class="scf-arrow" id="scfRailPrev" aria-label="Posteo anterior">‹</button>' : ph}
    <div class="hs-week-list scf-rail" id="hsWeekList">${cards}</div>
    ${arrows ? '<button type="button" class="scf-arrow" id="scfRailNext" aria-label="Posteo siguiente">›</button>' : ph}
  </div>`;
}
// --- Vista SEMANA: lunes a domingo de una, sin deslizar de costado ---
// Cada posteo va COMPACTO en su columna (solo imagen, hora y estado —
// SIN pie de foto). Al pasar el mouse por encima (o al primer toque en
// táctil) se AGRANDA con todo: la tarjeta completa en una capa por
// encima de la grilla, sin que la grilla se reacomode (amendment de
// Valentino). Las tarjetas completas viven en el cofre #scfVault — el
// patrón de v214 — y se MUEVEN a la capa al abrir: conservan todos
// sus bindings ([data-pc-act] delegado, [data-revaccept], lightbox).
// El encabezado de cada día (día + número) salta a la vista Día.
function schedSemanaBodyHTML(ctx) {
  const { pl, tz, bizName } = ctx;
  const today = schedTodayYmd(tz);
  const monday = schedMondayOf(schedAddDays(today, SCHED_WEEK_OFFSET * 7));
  const sunday = schedAddDays(monday, 6);
  const cols = [];
  const vaultCards = [];
  for (let i = 0; i < 7; i++) {
    const ymd = schedAddDays(monday, i);
    const items = pl.byDay.get(ymd) || [];
    const dObj = schedYmdToDate(ymd) || new Date();
    const num = dObj.getUTCDate();
    let dow = '';
    try { dow = dObj.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').slice(0, 3).toUpperCase(); } catch (e) {}
    // (v218) La ampliación ya no se ancla a la celda: va centrada en la
    // pantalla para cualquier columna. popCls queda solo como marca.
    const popCls = i <= 1 ? 'pl' : i >= 5 ? 'pr' : 'pc';
    const shown = items.slice(0, 3);
    const minis = shown.map(({ p }) => `<span class="scf-mini-x" data-post-id="${esc(String(p.id))}" data-day="${ymd}" data-pop-cls="${popCls}">${schedMiniHTML(p, schedMiniTime(p))}</span>`).join('');
    const more = items.length > shown.length ? `<button type="button" class="scf-more" data-scf-day="${ymd}">+${items.length - shown.length}</button>` : '';
    // Día vacío: hoy/futuro → "+" accionable que salta a Día (donde vive el
    // pedido de posteo); pasado → guion tenue con su motivo (ese día ya fue:
    // no hay acción posible, pero tampoco un punto mudo).
    const free = !items.length
      ? (ymd < today
        ? '<span class="scf-cell-free past" title="Este día no tuvo posteo">–</span>'
        : `<button type="button" class="scf-cell-free add" data-scf-day="${ymd}" aria-label="Pedirle a Posty un posteo para este día">+</button>`)
      : '';
    for (const { p } of shown) {
      const prop = p.status === 'published'
        ? { label: '✅ ' + homeWhenLabel(p.published_at || p.scheduled_at), iso: null }
        : proposedLabelFor(p, pl.proposals, tz);
      vaultCards.push(weekCardHTML(p, { bizName, tz, prop, count: null }));
    }
    cols.push(`<div class="scf-col${ymd === today ? ' today' : ''}">
      <button type="button" class="scf-colhead" data-scf-day="${ymd}" aria-label="Ver el día ${ymd}"><span class="scf-col-dow">${esc(dow)}</span><span class="scf-col-n">${num}</span>${ymd === today ? '<span class="scf-hoy">hoy</span>' : ''}</button>
      <div class="scf-colbody">${minis}${more}${free}</div>
    </div>`);
  }
  // Borradores que caen fuera de la semana visible: no se esconden —
  // la línea lo dice y el filtro Día/Semana los alcanza navegando.
  const drafts = (ctx.all || []).filter(p => p && p.status === 'draft');
  const outside = drafts.filter(d => { const k = pl.dayOf.get(d.id); return k && (k < monday || k > sunday); }).length;
  const outsideHTML = outside ? `<div class="scf-outside">📝 ${outside === 1 ? 'Hay 1 borrador que cae' : `Hay ${outside} borradores que caen`} fuera de esta semana — están en su día, navegando con las flechas.</div>` : '';
  return `<div class="scf-weekwrap" id="hsWeekList"><div class="scf-week">${cols.join('')}</div><div class="scf-vault" id="scfVault" hidden>${vaultCards.join('')}</div></div>${outsideHTML}`;
}
// --- La capa de ampliación de Semana ---
let SCF_POP = null; // { wrap, card, vault, pop } — la tarjeta abierta, si hay
let SCF_POP_TIMER = null; // (legado) ya no hay cierre diferido por hover
let SCF_PINNED = false; // v221: click = capa FIJADA (queda hasta ✕ o click afuera)
function scfClosePop() {
  if (SCF_POP_TIMER) { clearTimeout(SCF_POP_TIMER); SCF_POP_TIMER = null; }
  SCF_PINNED = false;
  if (!SCF_POP) return;
  const cur = SCF_POP;
  SCF_POP = null;
  try { if (cur.vault && cur.card) cur.vault.appendChild(cur.card); } catch (e) {}
  try { const pop = cur.wrap.querySelector('.scf-pop'); if (pop) pop.remove(); } catch (e) {}
  try { cur.wrap.classList.remove('pop-open'); } catch (e) {}
}
function scfOpenPop(wrap, pinned) {
  if (!wrap) return;
  if (SCF_POP && SCF_POP.wrap === wrap) return;
  scfClosePop();
  const vault = document.getElementById('scfVault');
  if (!vault) return;
  const card = vault.querySelector(`.igmock[data-post-id="${String(wrap.dataset.postId || '')}"]`);
  if (!card) return;
  const pop = document.createElement('div');
  pop.className = 'scf-pop ' + (wrap.dataset.popCls || 'pc') + (pinned ? ' pinned' : '');
  pop.innerHTML = `<div class="scf-pop-bar"><button type="button" class="scf-pop-day">Ver el día completo →</button><button type="button" class="scf-pop-x" aria-label="Cerrar">✕</button></div>`;
  pop.appendChild(card);
  wrap.appendChild(pop);
  wrap.classList.add('pop-open');
  SCF_POP = { wrap, card, vault, pop };
  SCF_PINNED = !!pinned;
  // v221 (corrección de Valentino): la capa es vista previa de HOVER —
  // muere en el acto al salir el mouse (de la foto o de la tarjeta
  // grande), sin esperas. El cierre lo decide el rastreador geométrico
  // de mousemove (bindSchedFilter): mouseleave no es confiable con
  // capas fixed transformadas. Con click queda FIJADA (SCF_PINNED).
  const x = pop.querySelector('.scf-pop-x');
  if (x) x.onclick = (e) => { e.stopPropagation(); scfClosePop(); };
  const db = pop.querySelector('.scf-pop-day');
  if (db) db.onclick = (e) => { e.stopPropagation(); const d = wrap.dataset.day; scfClosePop(); if (d) schedJumpDay(d); };
}
// --- Vista MES: el almanaque, semanas apiladas con su rótulo ---
function schedMesBodyHTML(ctx) {
  const { pl, tz } = ctx;
  const today = schedTodayYmd(tz);
  const base = schedYmdToDate(today);
  base.setUTCDate(1);
  base.setUTCMonth(base.getUTCMonth() + SCHED_MONTH_OFFSET);
  const firstYmd = schedDateToYmd(base);
  const lastD = new Date(base.getTime());
  lastD.setUTCMonth(lastD.getUTCMonth() + 1);
  lastD.setUTCDate(0);
  const lastYmd = schedDateToYmd(lastD);
  let cursor = schedMondayOf(firstYmd);
  const rows = [];
  while (cursor <= lastYmd) {
    const wkEnd = schedAddDays(cursor, 6);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const ymd = schedAddDays(cursor, i);
      const out = ymd < firstYmd || ymd > lastYmd;
      const items = pl.byDay.get(ymd) || [];
      const num = (schedYmdToDate(ymd) || new Date()).getUTCDate();
      let inner = '';
      if (items.length) {
        const first = items[0].p;
        if (first.image_path) inner = schedMiniHTML(first, '');
        else inner = `<span class="scf-mdots">${items.slice(0, 3).map(({ p }) => `<i class="scf-dot st-${schedPostState(p)}"></i>`).join('')}</span>`;
        if (items.length > 1) inner += `<span class="scf-mmore">+${items.length - 1}</span>`;
      }
      cells.push(`<button type="button" class="scf-mcell${out ? ' out' : ''}${ymd === today ? ' today' : ''}" data-scf-day="${ymd}" aria-label="Ver el ${ymd}"><span class="scf-cell-n">${num}</span>${inner}</button>`);
    }
    rows.push(`<div class="scf-mweek"><div class="scf-mweek-t">Semana ${esc(schedRangeLabel(cursor, wkEnd))}</div><div class="scf-mgrid">${cells.join('')}</div></div>`);
    cursor = schedAddDays(cursor, 7);
  }
  return `<div class="scf-mes" id="hsWeekList">${rows.join('')}</div>`;
}
// Rótulo + offset de la barra de navegación según el modo activo.
function schedNavInfo(tz) {
  const today = schedTodayYmd(tz);
  if (SCHED_MODE === 'dia') {
    const ymd = schedAddDays(today, SCHED_DAY_OFFSET);
    const d = schedYmdToDate(ymd);
    let lbl = ymd;
    try { lbl = d ? d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : ymd; } catch (e) {}
    return { label: schedCap(lbl) + (SCHED_DAY_OFFSET === 0 ? ' · hoy' : ''), offset: SCHED_DAY_OFFSET };
  }
  if (SCHED_MODE === 'mes') {
    const base = schedYmdToDate(today);
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + SCHED_MONTH_OFFSET);
    const ymd = schedDateToYmd(base);
    return { label: schedCap(schedMonthName(ymd)) + ' de ' + String(ymd).slice(0, 4), offset: SCHED_MONTH_OFFSET };
  }
  if (SCHED_MODE === 'feed') {
    // Feed (v223): vista rodante — los que se vienen + los publicados —
    // sin navegación por período: la barra no muestra flechas ni rótulo.
    return { label: '', offset: 0 };
  }
  const monday = schedMondayOf(schedAddDays(today, SCHED_WEEK_OFFSET * 7));
  return { label: 'Semana ' + schedRangeLabel(monday, schedAddDays(monday, 6)), offset: SCHED_WEEK_OFFSET };
}
// El bloque completo del filtro (cabecera + cupo + barra + vista activa).
// Sin ningún posteo, delega en homeWeekHTML: los estados de siempre
// (armando / sin ADN / semana completa) quedan intactos.
function schedFilterBlockHTML(all, quota, generating, noDna) {
  const posts = Array.isArray(all) ? all : [];
  if (!posts.length) return homeWeekHTML(posts, quota, generating, noDna);
  const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  const bizName = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'Mi negocio';
  prefetchMedia(posts);
  const pl = schedPlacements(posts, tz);
  const drafts = posts.filter(p => p && p.status === 'draft');
  const ctx = { pl, tz, bizName, all: posts };
  const info = schedNavInfo(tz);
  const body = SCHED_MODE === 'dia' ? schedDiaBodyHTML(ctx) : SCHED_MODE === 'mes' ? schedMesBodyHTML(ctx) : SCHED_MODE === 'feed' ? feedPreviewHTML(posts, tz, (typeof FEED_PROFILE !== 'undefined' ? FEED_PROFILE : null)) : schedSemanaBodyHTML(ctx);
  // En Feed la barra no lleva navegación por período (vista rodante).
  const navHTML = SCHED_MODE === 'feed' ? '' : `<div class="scf-nav">
        <button type="button" class="scf-navbtn" id="scfNavPrev" aria-label="Anterior">‹</button>
        <span class="scf-nav-label">${esc(info.label)}</span>
        <button type="button" class="scf-navbtn" id="scfNavNext" aria-label="Siguiente">›</button>
        ${info.offset !== 0 ? '<button type="button" class="scf-todaybtn" id="scfNavToday">hoy</button>' : ''}
      </div>`;
  return `<div class="hs-week scf">
    <div class="hs-week-head"><b>📅 Tu agenda</b>${drafts.length ? `<button type="button" class="btn btn-primary btn-sm" id="hsAcceptAll">✅ Aceptar todo (${drafts.length})</button>` : ''}</div>
    <div id="revMsg"></div>
    ${schedQuotaHTML(pl.list, quota, schedWeekCounts(posts, tz, pl.proposals))}
    <div id="hs-report"></div>
    ${generating ? '<div class="hs-completing">✨ Estoy armando los posteos que faltan…</div>' : ''}
    ${schedStaleHTML(posts, tz)}
    <div class="scf-bar">
      <div class="scf-seg" role="tablist" aria-label="Ver la agenda por">
        <button type="button" role="tab" data-scf-mode="dia" class="${SCHED_MODE === 'dia' ? 'on' : ''}" aria-selected="${SCHED_MODE === 'dia'}">Día</button>
        <button type="button" role="tab" data-scf-mode="semana" class="${SCHED_MODE === 'semana' ? 'on' : ''}" aria-selected="${SCHED_MODE === 'semana'}">Semana</button>
        <button type="button" role="tab" data-scf-mode="mes" class="${SCHED_MODE === 'mes' ? 'on' : ''}" aria-selected="${SCHED_MODE === 'mes'}">Mes</button>
        <button type="button" role="tab" data-scf-mode="feed" class="scf-seg-feed ${SCHED_MODE === 'feed' ? 'on' : ''}" aria-selected="${SCHED_MODE === 'feed'}"><svg class="scf-ig-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><defs><linearGradient id="scfIgGrad" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset=".8" stop-color="#962FBF"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="3" y="3" width="18" height="18" rx="5.2" stroke="url(#scfIgGrad)" stroke-width="2.1"/><circle cx="12" cy="12" r="4.1" stroke="url(#scfIgGrad)" stroke-width="2.1"/><circle cx="17.3" cy="6.7" r="1.35" fill="url(#scfIgGrad)"/></svg>Feed</button>
      </div>
      ${navHTML}
    </div>
    ${drafts.length ? `<div class="scf-remain">📝 Te ${drafts.length === 1 ? 'queda' : 'quedan'} <b>${drafts.length}</b> por aceptar</div>` : ''}
    ${body}
  </div>`;
}
// --- ✨ El feed del negocio, como CUARTO MODO del filtro (v223) ---
// La grilla del perfil de IG del negocio es el cuerpo de la vista Feed
// de la agenda (Día·Semana·Mes·Feed): primero los que se vienen
// (programados y borradores, en su orden de salida), después los ya
// publicados reales. Nació en v221 como sección debajo de los posteos;
// v223 la muda entera al filtro (amendment de Valentino: "un filtro
// más de la agenda, no una sección debajo"). v223 (veredicto
// de Valentino con captura de su cuenta: "tiene que ser literalmente
// el feed de Instagram, exactamente el mismo diseño"): la grilla es la
// de un perfil de IG — tiles verticales 3:4 borde a borde (el formato
// actual de la grilla de IG) con cover desde el master 4:5, recorte
// leve arriba/abajo como hace IG (acá manda la fidelidad a IG, no el
// "foto entera" de Semana/Día: el posteo completo se ve al tocar el
// tile), publicados SIN ninguna
// marca, reels con el glifo blanco de IG, y la ÚNICA marca de los que
// se vienen es una pastillita mínima abajo a la izquierda (fecha corta
// o "borrador"). Vista de LECTURA: se pinta desde schedPlacements (el
// mismo mapa de días de la agenda, ninguna ubicación cambia entre
// vistas) + los publicados que la app conoce. Las historias NO van:
// no viven en la grilla del perfil. Tocar un tile que se viene salta a
// su día en la agenda (bindSchedule); tocar un publicado abre el
// lightbox.
// Encabezado réplica del perfil de Instagram (vista Feed): foto con anillo
// en degradé, @, nombre, conteos y link — SOLO con datos reales de la cuenta
// (prof: avatar público cacheado + seguidores reales si existen). Lo que la
// cuenta no tiene (bio leída, seguidos, total de posteos de IG) se omite con
// gracia: jamás un número fabricado (regla de verdad).
function feedProfileHeadHTML(prof, bizName) {
  const u = prof && prof.username ? String(prof.username) : '';
  const name = ((prof && prof.name) || bizName || '').trim();
  if (!u && !name) return '';
  const letter = esc((name || u || 'P').charAt(0).toUpperCase());
  const pic = prof && prof.pic ? `<img src="${esc(prof.pic)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  const stats = [];
  if (prof && Number(prof.followers) > 0) stats.push(`<div class="fp-stat"><b>${Number(prof.followers).toLocaleString('es-AR')}</b><span>seguidores</span></div>`);
  const statsHTML = stats.length ? `<div class="fp-stats">${stats.join('')}</div>` : '';
  return `<div class="fp-head">
    <div class="fp-head-top">
      <div class="fp-ava"><div class="fp-ava-in"><span class="fp-ava-letter">${letter}</span>${pic}</div></div>
      <div class="fp-head-right">${u ? `<div class="fp-user">${esc(u)}</div>` : ''}${statsHTML}</div>
    </div>
    ${name ? `<div class="fp-name">${esc(name)}</div>` : ''}
    ${u ? `<a class="fp-link" href="https://www.instagram.com/${esc(u)}/" target="_blank" rel="noopener">instagram.com/${esc(u)}</a>` : ''}
  </div>`;
}
function feedPreviewHTML(all, tz, prof) {
  const posts = (Array.isArray(all) ? all : []).filter(p => p && p.status !== 'failed' && String(p.media_type || '') !== 'story');
  if (!posts.length) return '';
  const pl = schedPlacements(posts, tz);
  const upcoming = [];
  for (const ymd of [...pl.byDay.keys()].sort()) {
    for (const it of (pl.byDay.get(ymd) || [])) {
      if (it.p.status === 'draft' || it.p.status === 'scheduled') upcoming.push({ p: it.p, ymd });
    }
  }
  const published = posts.filter(p => p.status === 'published')
    .sort((a, b) => String(b.published_at || b.scheduled_at || '').localeCompare(String(a.published_at || a.scheduled_at || '')));
  const parts = [];
  for (const u of upcoming) parts.push({ kind: 'up', p: u.p, ymd: u.ymd });
  for (const p of published) parts.push({ kind: 'pub', p });
  if (!parts.length) return '';
  const tileMedia = (p, isV) => !p.image_path
    ? '<span class="fp-tile-ph">✨</span>'
    : isV
      ? `<video src="${esc(p.image_path)}" muted playsinline preload="metadata"></video>`
      : `<img src="${esc(mv(p.image_path, 640))}" data-full="${esc(p.image_path)}" onerror="__imgFb(this)" loading="lazy" alt="">`;
  const VIS = 15;
  // v223: glifo de reel blanco estilo IG (sin círculo de fondo) y la
  // pastillita de fecha corta para los programados.
  const REEL_SVG = '<svg class="fp-reel" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3.4" width="18" height="17.2" rx="3.2"/><path d="M3.2 9.2h17.6" stroke-linecap="round"/><path d="M10.1 12.5v4.9c0 .5.6.8 1 .5l4.1-2.45c.4-.24.4-.78 0-1.02l-4.1-2.45c-.4-.24-1 .06-1 .52z" fill="#fff" stroke="none"/></svg>';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const grid = parts.map((t, i) => {
    const p = t.p;
    const isV = String(p.media_type || '') === 'video';
    const extra = i >= VIS ? ' fp-extra' : '';
    const media = tileMedia(p, isV);
    const reel = isV ? REEL_SVG : '';
    if (t.kind === 'up') {
      const sched = p.status === 'scheduled';
      let when = t.ymd;
      const dObj = schedYmdToDate(t.ymd);
      if (dObj) {
        let dow = '';
        try { dow = dObj.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''); } catch (e) {}
        when = `${dow} ${dObj.getUTCDate()} · ${schedMiniTime(p)}`;
      }
      // Única marca permitida (v223): pastillita mínima abajo a la
      // izquierda — fecha corta si ya está programado, "borrador" si no.
      const pill = sched ? (dObj ? `${dObj.getUTCDate()} ${MESES[dObj.getUTCMonth()]}` : 'programado') : 'borrador';
      return `<button type="button" class="fp-tile up${extra}" data-feed-day="${t.ymd}" data-post-id="${esc(String(p.id))}" title="${esc((sched ? 'Programado: ' : 'Borrador: ') + when)}">${media}<span class="fp-pill">${esc(pill)}</span>${reel}</button>`;
    }
    const lb = p.image_path ? ` data-lightbox="${esc(p.image_path)}" data-video="${isV ? '1' : '0'}"` : '';
    return `<button type="button" class="fp-tile pub${extra}" data-post-id="${esc(String(p.id))}"${lb}>${media}${reel}</button>`;
  }).join('');
  const moreBtn = parts.length > VIS ? '<button type="button" class="fp-more" id="fpMore">Ver más posteos</button>' : '';
  const anyUp = parts.some(t => t.kind === 'up');
  // v223 (amendment): la grilla ES el cuerpo de la vista Feed del
  // filtro — sin rótulo propio (la identidad la da el segmento "Feed");
  // la línea de honestidad queda como pie discreto de la vista.
  const bizNameF = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim();
  return `<section class="hs-feed" id="hsFeed">
    ${feedProfileHeadHTML(prof, bizNameF)}
    <div class="fp-grid">${grid}</div>
    ${anyUp ? '<div class="fp-line">Los que llevan pastillita todavía no salieron 😉</div>' : ''}${moreBtn}
  </section>`;
}
// --- Wiring del filtro (lo llama bindSchedule) ---
function schedSetMode(m) {
  SCHED_MODE = m;
  try { localStorage.setItem('posty_sched_mode', m); } catch (e) {}
  try { render(); } catch (e) {}
}
function schedNavStep(dir) {
  if (SCHED_MODE === 'feed') return; // el Feed no navega por período
  if (SCHED_MODE === 'dia') SCHED_DAY_OFFSET += dir;
  else if (SCHED_MODE === 'mes') SCHED_MONTH_OFFSET += dir;
  else SCHED_WEEK_OFFSET += dir;
  try { render(); } catch (e) {}
}
function schedJumpDay(ymd) {
  const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  SCHED_DAY_OFFSET = schedDiffDays(schedTodayYmd(tz), ymd);
  SCHED_MODE = 'dia';
  try { localStorage.setItem('posty_sched_mode', 'dia'); } catch (e) {}
  try { render(); } catch (e) {}
  setTimeout(() => { const el = document.getElementById('schedView'); if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } }, 60);
}
function bindSchedFilter() {
  SCF_POP = null; // el DOM se reconstruyó: ninguna capa queda abierta
  SCF_PINNED = false;
  $$('#schedView [data-scf-mode]').forEach(b => b.onclick = () => { if (b.dataset.scfMode !== SCHED_MODE) schedSetMode(b.dataset.scfMode); });
  const pv = $('#scfNavPrev'), nx = $('#scfNavNext'), td = $('#scfNavToday');
  if (pv) pv.onclick = () => schedNavStep(-1);
  if (nx) nx.onclick = () => schedNavStep(1);
  if (td) td.onclick = () => { SCHED_DAY_OFFSET = 0; SCHED_WEEK_OFFSET = 0; SCHED_MONTH_OFFSET = 0; try { render(); } catch (e) {} };
  $$('#schedView [data-scf-day]').forEach(b => b.onclick = () => schedJumpDay(b.dataset.scfDay));
  // Semana: el posteo compacto se agranda al pasar el mouse (con una
  // mini-espera para no parpadear al barrer la grilla) o al primer
  // toque en pantallas táctiles. La ampliación va CENTRADA en la
  // pantalla. v221 (corrección de Valentino): HOVER = vista previa que
  // se cierra EN EL ACTO al sacar el mouse de la foto (sin esperas, sin
  // depender de salir de la tarjeta grande); CLICK = capa FIJADA para
  // poder usar Editar/Aceptar/Frenar, hasta ✕ o click afuera. En
  // táctil el toque ya la fijaba: sin cambios.
  $$('#schedView .scf-mini-x').forEach(w => {
    let t = null;
    w.addEventListener('mouseenter', () => {
      if (SCF_PINNED) return; // hay una capa fijada: el hover no la roba
      if (t) clearTimeout(t);
      if (SCF_POP_TIMER) { clearTimeout(SCF_POP_TIMER); SCF_POP_TIMER = null; }
      t = setTimeout(() => scfOpenPop(w), 130);
    });
    w.addEventListener('mouseleave', () => {
      if (t) clearTimeout(t); // si se fue antes de los 130 ms, no abre
      // El CIERRE al salir lo maneja el rastreador geométrico global.
    });
    w.addEventListener('click', (e) => {
      if (e.target.closest('.scf-pop')) {
        // Click sobre la propia capa: queda FIJADA.
        SCF_PINNED = true;
        const p = e.target.closest('.scf-pop');
        if (p) p.classList.add('pinned');
        return;
      }
      e.stopPropagation();
      const touchLike = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
      if (touchLike) {
        if (SCF_POP && SCF_POP.wrap === w) scfClosePop();
        else scfOpenPop(w, true);
        return;
      }
      // Mouse: el click fija la ampliación (o la cierra si ya estaba fijada).
      if (SCF_POP && SCF_POP.wrap === w) {
        if (SCF_PINNED) scfClosePop();
        else { SCF_PINNED = true; if (SCF_POP.pop) SCF_POP.pop.classList.add('pinned'); }
      } else scfOpenPop(w, true);
    });
  });
  // Cerrar la capa tocando afuera o con Escape (una sola vez global).
  if (!window.__scfPopDocWired) {
    window.__scfPopDocWired = true;
    document.addEventListener('click', (e) => { if (SCF_POP && !e.target.closest('.scf-mini-x')) scfClosePop(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') scfClosePop(); });
  }
  // v221 — Rastreador geométrico de salida (corrección de Valentino:
  // "cuando saco el mouse de la foto directamente se tiene que cerrar
  // la foto grande"). Mientras la capa de hover está abierta y SIN
  // fijar, cada mousemove compara el puntero contra los rectángulos de
  // la foto y de la tarjeta grande: si no está sobre ninguna de las
  // dos, la capa se cierra EN EL ACTO. Sin timers ni esperas.
  if (!window.__scfPopMoveWired) {
    window.__scfPopMoveWired = true;
    document.addEventListener('mousemove', (e) => {
      if (!SCF_POP || SCF_PINNED) return;
      const wrap = SCF_POP.wrap, pop = SCF_POP.pop;
      if (!wrap || !pop || !document.contains(wrap)) return;
      const inR = (r) => r && e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2;
      if (inR(wrap.getBoundingClientRect())) return; // sigue sobre la foto
      if (inR(pop.getBoundingClientRect())) return; // sigue sobre la tarjeta grande
      scfClosePop();
    });
  }
  const rail = $('#hsWeekList');
  const rp = $('#scfRailPrev'), rn = $('#scfRailNext');
  if (rail && (rp || rn)) {
    const step = () => {
      try {
        const c = rail.querySelector('.igmock-fixed');
        return c ? c.offsetWidth + 12 : rail.clientWidth * 0.8;
      } catch (e) { return 300; }
    };
    if (rp) rp.onclick = () => rail.scrollBy({ left: -step(), behavior: 'smooth' });
    if (rn) rn.onclick = () => rail.scrollBy({ left: step(), behavior: 'smooth' });
  }
}
/* ===== /v217 ===== */

// Vista #/app/chat = HOME SIMPLE: los posteos de la semana uno al lado del
// otro, y el chat abajo si querés cambiar/editar/crear algo distinto.
async function chatView() {
  const [postsR, quotaR] = await Promise.all([
    api.get('/api/posts').catch(() => []),
    api.get('/api/quota').catch(() => null),
  ]);
  const posts = Array.isArray(postsR) ? postsR : [];
  const quota = quotaR;
  try { REVIEW_DRAFTS = posts.filter(p => p.status === 'draft'); } catch (e) {}
  const nDrafts = posts.filter(p => p.status === 'draft').length;
  const nSched = posts.filter(p => p.status === 'scheduled').length;
  // 2026-10-05: si no hay nada por venir, disparar la generación en segundo
  // plano (sin bloquear). El home muestra "armando" y refresca solo.
  let weekGenerating = false;
  let weekNoDna = false;
  // 2026-10-14: ensure corre SIEMPRE, no solo con la semana vacía — si la
  // semana está parcial, el backend crea los posteos que faltan solo.
  try {
    const er = await api.post('/api/week/ensure', {}).catch(() => null);
    weekGenerating = !!(er && er.generating);
    weekNoDna = !!(er && er.reason === 'no_dna' && !nDrafts && !nSched);
    if ((er && er.generating) || posts.some(p => !p.image_path && p.status === 'draft')) {
      // Refrescar en 8s para mostrar las tarjetas cuando aparezcan.
      setTimeout(() => { try { if ((location.hash || '').startsWith('#/app/chat')) render(); } catch (e) {} }, 8000);
    }
  } catch (e) {}
  return `
  <div class="chat-home hs-home">
    <div class="hs-top">
      <img src="ai-avatar.png" class="hs-ava" alt="Posty">
      <div><b>Posty<span class="pdot">.</span></b><div class="hs-sub">Tu semana, lista. Si querés cambiar algo, decime 👇</div></div>
    </div>
    <div id="revMsg"></div>
    ${homeWeekHTML(posts, quota, weekGenerating, weekNoDna)}
    <div id="albumCard"></div>
    ${nDrafts ? `<button class="btn btn-primary btn-block" id="btnActivateWeek" style="margin:4px 0 14px">🚀 Activar mi semana (${nDrafts})</button>` : ''}
    <div class="hs-chat-label"><b>💬 ¿Cambiamos algo?</b></div>
    ${chatCardHTML(true, true, true)}
  </div>`;
}


// ---------- Álbum del negocio + misión foto (2026-10-16) ----------
// La foto propia es el mejor insumo de Posty: esta tarjeta la pide con
// una misión concreta por semana, muestra el álbum con su progreso y
// convierte la primera foto de la semana en un posteo (festejo server).
// v183: estado del bloque "Fotos de esta semana" según cuántas fotos subió
// ESTA semana (meta del ritual semanal: 3–5). Función pura (testeable).
function albumWeekState(n) {
  n = Number(n) || 0;
  if (n >= 3) return { key: 'full', text: '¡Perfecto! Esta semana sale con tus fotos ✨' };
  if (n >= 1) return { key: 'some', text: `¡Van ${n}! Con 3 ya trabajamos bárbaro 📸` };
  return { key: 'none', text: 'Todavía no nos pasaste fotos esta semana: Posty crea las imágenes por vos, pero con las tuyas sale tu negocio real.' };
}
// Cablea el input de subida del álbum (lo comparten la tarjeta del chat
// y la fila fina de Schedule): subida secuencial a /api/album/photo con
// sus mensajes de siempre; al terminar bien, onDone() repinta la vista.
function wireAlbumUpload(inp, onDone) {
  if (!inp) return;
  inp.onchange = async () => {
    const files = Array.from(inp.files || []);
    if (!files.length) return;
    const msg = document.getElementById('albumMsg');
    let okCount = 0;
    let okVideos = 0;
    let lastErr = '';
    // Subida secuencial: el servidor festeja/clasifica cada foto en 2º plano.
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isVid = (f.type || '').startsWith('video/');
      if (msg) msg.textContent = files.length > 1 ? `Subiendo ${i + 1} de ${files.length}… 📤` : 'Subiendo… 📤';
      try {
        const r = await fetch('/api/album/photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/jpeg' }, body: f, signal: AbortSignal.timeout(isVid ? 300000 : 120000) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) throw new Error((d && d.error) || 'No pude subirla 😅');
        okCount++;
        if (isVid || d.kind === 'video') okVideos++;
      } catch (e) {
        lastErr = e.message || 'No pude subirla. Probá de nuevo.';
        break; // ej.: llegó al tope de 20 — no tiene sentido seguir
      }
    }
    if (msg) {
      if (okCount && files.length > 1) msg.innerHTML = `✅ <b>¡${okCount} archivos nuevos!</b> Posty ya los tiene para tus posteos y reels ✨${lastErr ? `<br>😅 ${esc(lastErr)}` : ''}`;
      else if (okCount && okVideos) msg.innerHTML = '✅ <b>¡Video guardado!</b> Posty lo va a usar en tus reels 🎬';
      else if (okCount) msg.innerHTML = '✅ <b>¡Hermosa!</b> Posty la está convirtiendo en un posteo — te aviso cuando esté listo ✨';
      else msg.textContent = '😅 ' + (lastErr || 'No pude subirla. Probá de nuevo.');
    }
    if (okCount) setTimeout(() => { try { onDone(); } catch (e) {} }, 2500);
  };
}
async function bindAlbumCard() {
  const box = document.getElementById('albumCard');
  if (!box) return;
  let data = null;
  try { data = await api.get('/api/album'); } catch (e) {}
  if (!data || !data.ok) { box.innerHTML = ''; return; }
  const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'tu negocio';
  const t = data.targets || { producto: 3, local: 2, equipo: 2 };
  const n = data.counts || {};
  const chip = (label, have, goal) => `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${have >= goal ? '#E7F6EC' : '#F1F5F9'};font-size:12.5px;margin:2px 4px 2px 0">${have >= goal ? '✅' : '📷'} ${label}: <b>${Math.min(have, goal)}/${goal}</b></span>`;
  const complete = (n.producto || 0) >= t.producto && (n.local || 0) >= t.local && (n.equipo || 0) >= t.equipo;
  const mission = data.mission || {};
  // v183 — Bloque "esta semana" A LA VISTA: el ritual semanal pide 3–5 fotos
  // (push + email de los lunes) y ESTE bloque es donde se suben: contador de
  // la semana (lun–dom, viene de /api/album), estado con la voz de Posty, la
  // idea de la misión conviviendo como sugerencia y el botón grande ADENTRO.
  const wk = data.week || { photos: 0, videos: 0, goal_min: 3, goal_max: 5 };
  const wst = albumWeekState(wk.photos || 0);
  const weekDone = wst.key === 'full';
  const missionLine = mission.done
    ? `<div style="font-size:13.5px;margin-top:8px">✅ <b>¡Misión cumplida!</b> Tu foto ya está trabajando por ${esc(biz)}.${mission.post_id ? ' Posty la convirtió en un posteo de tu semana ✨' : ''}</div>`
    : `<div style="font-size:13.5px;margin-top:8px">💡 <b>Idea de la semana:</b> ${esc(mission.text || 'Sacale una foto a tu negocio 📸')}<br><span style="font-size:12.5px;opacity:.75">Mandala como salga — Posty la arregla y la convierte en posteo.</span></div>`;
  const weekBlockHTML = `
    <div id="albumWeekBlock" style="background:${weekDone ? '#E7F6EC' : '#FFF7E0'};border:1.5px ${weekDone ? 'solid #BFE6CC' : 'dashed #FEC14D'};border-radius:12px;padding:12px;margin:10px 0">
      <div style="font-size:15px"><b>📸 Fotos de esta semana</b></div>
      <div style="font-size:14px;margin-top:4px">${esc(wst.text)}</div>
      <div style="font-size:12.5px;opacity:.8;margin-top:4px">📷 <b>${wk.photos || 0}</b> de ${wk.goal_min || 3}–${wk.goal_max || 5} esta semana${wk.videos ? ` · 🎬 <b>${wk.videos}</b> video${wk.videos === 1 ? '' : 's'} esta semana` : ''}</div>
      ${missionLine}
      <label class="btn btn-primary btn-block" style="margin:10px 0 0;cursor:pointer">
        📸 Subir fotos o videos
        <input type="file" id="albumFile" accept="image/*,video/*" multiple style="display:none">
      </label>
      <div style="font-size:12px;opacity:.65;margin-top:5px">Videos de hasta 90 segundos: Posty los usa en tus reels 🎬</div>
    </div>`;
  const perfHTML = data.perf
    ? `<div style="font-size:13.5px;margin:8px 0">📈 Tus posteos con <b>fotos propias</b> llegan en promedio a <b>${data.perf.foto}</b> personas${data.perf.sin ? ` (los de IA, a <b>${data.perf.sin}</b>)` : ''}. Por eso te pido fotos 😉</div>`
    : '';
  const items = data.photos || [];
  const nFotos = items.filter(ph => ph.kind !== 'video').length;
  const nVideos = items.filter(ph => ph.kind === 'video').length;
  const countHTML = items.length > 0
    ? `<div style="font-size:13.5px;margin-top:4px">📷 Ya tenés <b>${nFotos}</b> foto${nFotos === 1 ? '' : 's'}${nVideos ? ` y <b>${nVideos}</b> video${nVideos === 1 ? '' : 's'}` : ''} en tu álbum — Posty los usa en tus posteos y reels.</div>`
    : '';
  // v208 (pedido de Valentino): la grilla de imágenes viejas NO se renderiza
  // en la tarjeta — el álbum completo queda accesible con un toggle y
  // muestra solo las subidas del cliente (esto, que viene de /api/album).
  const gridInner = items.length
    ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0">${items.map(ph => ph.kind === 'video'
      ? `<div style="position:relative;width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#0A1E33"><img src="${esc(ph.thumb || '')}" data-full="${esc(ph.path)}" onerror="__imgFb(this)" loading="lazy" alt="Video de ${esc(biz)}" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;right:5px;bottom:5px;background:rgba(10,30,51,.82);color:#fff;font-size:11px;line-height:1;padding:4px 7px;border-radius:999px">▶ Video</span></div>`
      : `<img src="${esc(mv(ph.path, 640))}" data-full="${esc(ph.path)}" onerror="__imgFb(this)" loading="lazy" alt="Foto de ${esc(biz)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px">`).join('')}</div>`
    : '';
  const grid = items.length
    ? `<button type="button" class="btn btn-soft btn-sm" id="albumToggle" style="margin-top:8px">🖼️ Ver mi álbum (${items.length})</button><div id="albumGrid" style="display:none">${gridInner}</div>`
    : `<div style="font-size:14px;background:#F1F8FD;border-radius:12px;padding:10px 12px;margin:8px 0">Todavía no nos pasaste fotos: Posty crea las imágenes por vos, pero con las tuyas los posteos salen con tu negocio real.</div>`;
  box.innerHTML = `
  <div class="card" style="margin-top:14px">
    <div style="font-size:17px"><b>📸 Las fotos de tu negocio</b></div>
    <div style="font-size:13.5px;opacity:.8">Cuantas más fotos y videos nos pasás, mejores y más tuyos salen tus posteos.</div>
    ${countHTML}
    ${weekBlockHTML}
    <div>${chip('Productos', n.producto || 0, t.producto)}${chip('Tu local', n.local || 0, t.local)}${chip('Tu equipo', n.equipo || 0, t.equipo)}${complete ? '<div style="font-size:14px;margin-top:6px">🎉 <b>¡Álbum completo!</b> Posty tiene todo para que tus posteos sean 100% tuyos.</div>' : ''}</div>
    ${perfHTML}
    ${grid}
    <div id="albumMsg" style="font-size:13px;margin-top:6px"></div>
  </div>`;
  const aTgl = document.getElementById('albumToggle');
  if (aTgl) aTgl.onclick = () => {
    const g = document.getElementById('albumGrid');
    if (!g) return;
    const open = g.style.display !== 'none';
    g.style.display = open ? 'none' : '';
    aTgl.textContent = open ? `🖼️ Ver mi álbum (${items.length})` : '🖼️ Ocultar mi álbum';
  };
  // v183: deep link del ritual (push/email → ?fotos=semana): enfocar el
  // bloque de fotos de la semana UNA sola vez por carga de la app.
  try {
    if (!window.__albumFocusDone) {
      const q = new URLSearchParams((location.hash.split('?')[1] || ''));
      if (q.get('fotos')) {
        window.__albumFocusDone = true;
        const blk = document.getElementById('albumWeekBlock');
        if (blk) {
          blk.classList.add('album-focus');
          setTimeout(() => { try { blk.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 400);
          setTimeout(() => { try { blk.classList.remove('album-focus'); } catch (e) {} }, 5000);
        }
      }
    }
  } catch (e) {}
  wireAlbumUpload(document.getElementById('albumFile'), bindAlbumCard);
  // v208: recordatorio de fotos de la semana dentro del chat de Schedule.
  try { maybePhotoWeekReminder(data); } catch (e) {}
}
// v215 — Fila fina del álbum en Schedule (amendment de Valentino): la
// tarjeta grande "Las fotos de tu negocio" SOBRA en Schedule — con el
// botón sticky azul ya hay UN solo botón de subida a la vista. Acá queda
// la fila "🖼️ Ver mi álbum (N)" que despliega la vista del álbum (los
// contadores por categoría viven ADENTRO, no en Schedule) con ver y
// borrar, y el input #albumFile que dispara el sticky. La tarjeta
// completa sigue viviendo en el chat (#/app/chat).
async function bindAlbumRow() {
  const box = document.getElementById('albumRow');
  if (!box) return;
  let data = null;
  try { data = await api.get('/api/album'); } catch (e) {}
  if (!data || !data.ok) { box.innerHTML = ''; return; }
  const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'tu negocio';
  const t = data.targets || { producto: 3, local: 2, equipo: 2 };
  const n = data.counts || {};
  const chip = (label, have, goal) => `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${have >= goal ? '#E7F6EC' : '#F1F5F9'};font-size:12.5px;margin:2px 4px 2px 0">${have >= goal ? '✅' : '📷'} ${label}: <b>${Math.min(have, goal)}/${goal}</b></span>`;
  const items = data.photos || [];
  const gridInner = items.length
    ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0">${items.map(ph => `<div style="position:relative">${ph.kind === 'video'
      ? `<div style="position:relative;width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#0A1E33"><img src="${esc(ph.thumb || '')}" data-full="${esc(ph.path)}" onerror="__imgFb(this)" loading="lazy" alt="Video de ${esc(biz)}" style="width:100%;height:100%;object-fit:cover"><span style="position:absolute;right:5px;bottom:5px;background:rgba(10,30,51,.82);color:#fff;font-size:11px;line-height:1;padding:4px 7px;border-radius:999px">▶ Video</span></div>`
      : `<img src="${esc(mv(ph.path, 640))}" data-full="${esc(ph.path)}" onerror="__imgFb(this)" loading="lazy" alt="Foto de ${esc(biz)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px">`}<button type="button" class="media-del" data-albumdel="${esc(String(ph.id))}" title="Borrar" aria-label="Borrar archivo" style="position:absolute;top:4px;right:4px;z-index:2">×</button></div>`).join('')}</div>`
    : `<div style="font-size:13.5px;background:#F1F8FD;border-radius:12px;padding:10px 12px;margin:8px 0">Todavía no nos pasaste fotos: Posty crea las imágenes por vos, pero con las tuyas los posteos salen con tu negocio real.</div>`;
  box.innerHTML = `
  <div class="album-row">
    <input type="file" id="albumFile" accept="image/*,video/*" multiple style="display:none">
    <button type="button" class="album-row-btn" id="albumRowToggle" aria-expanded="false"><span>🖼️ Ver mi álbum (${items.length})</span><span aria-hidden="true">▾</span></button>
    <div class="album-row-panel" id="albumRowPanel" hidden>
      <div>${chip('Productos', n.producto || 0, t.producto)}${chip('Tu local', n.local || 0, t.local)}${chip('Tu equipo', n.equipo || 0, t.equipo)}</div>
      ${gridInner}
    </div>
    <div class="album-row-msg" id="albumMsg"></div>
  </div>`;
  const panel = document.getElementById('albumRowPanel');
  const tgl = document.getElementById('albumRowToggle');
  const setOpen = (open) => {
    if (!panel || !tgl) return;
    panel.hidden = !open;
    tgl.setAttribute('aria-expanded', open ? 'true' : 'false');
    const arrow = tgl.querySelector('span:last-child');
    if (arrow) arrow.textContent = open ? '▴' : '▾';
  };
  if (tgl && panel) tgl.onclick = () => setOpen(panel.hidden);
  // Borrar fotos del álbum (mismo endpoint que la biblioteca de medios).
  $$('#albumRowPanel [data-albumdel]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Borrar? No se va a usar más en tus posteos nuevos.')) return;
    try { await api.delete('/api/assets/' + b.dataset.albumdel); } catch (e) {}
    try { bindAlbumRow(); } catch (e) {}
  });
  wireAlbumUpload(document.getElementById('albumFile'), bindAlbumRow);
  // Deep link del ritual (push/email → ?fotos=semana): aterriza en la
  // agenda, que sigue existiendo — la fila se despliega y se enfoca.
  try {
    if (!window.__albumFocusDone) {
      const q = new URLSearchParams((location.hash.split('?')[1] || ''));
      if (q.get('fotos')) {
        window.__albumFocusDone = true;
        setOpen(true);
        if (panel) panel.classList.add('album-focus');
        setTimeout(() => { try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 400);
        setTimeout(() => { try { if (panel) panel.classList.remove('album-focus'); } catch (e) {} }, 5000);
      }
    }
  } catch (e) {}
  // El recordatorio semanal del chat NO depende de la tarjeta grande:
  // se alimenta de estos mismos datos del álbum.
  try { maybePhotoWeekReminder(data); } catch (e) {}
}

// v221 — Schedule sin fila del álbum: el botón de subida vive fijo en el
// bloque del chat (debajo del saludo) y su #albumFile va en la tarjeta
// del chat. Este binder cablea la subida (mismo wireAlbumUpload, mismo
// festejo/clasificación), alimenta el recordatorio semanal del chat
// (que antes dependía de bindAlbumRow) y resuelve el deep link del
// ritual (?fotos=semana) enfocando EL botón nuevo.
function bindSchedUpload() {
  wireAlbumUpload(document.getElementById('albumFile'), () => { try { render(); } catch (e) {} });
  (async () => {
    let data = null;
    try { data = await api.get('/api/album'); } catch (e) {}
    if (data && data.ok) { try { maybePhotoWeekReminder(data); } catch (e) {} }
  })();
  try {
    if (!window.__albumFocusDone) {
      const q = new URLSearchParams((location.hash.split('?')[1] || ''));
      if (q.get('fotos')) {
        window.__albumFocusDone = true;
        setTimeout(() => {
          const b = document.getElementById('agUploadBtn');
          if (!b) return;
          try { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
          b.classList.add('album-focus');
          setTimeout(() => { try { b.classList.remove('album-focus'); } catch (e) {} }, 5000);
        }, 400);
      }
    }
  } catch (e) {}
}

// v208 — Lunes de la semana actual (lun–dom, la misma definición del cupo)
// en la zona horaria del perfil, como clave estable 'YYYY-MM-DD'.
function albumMondayKey() {
  const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  const now = new Date();
  const ymd = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD en su zona
  const wd = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[wd] || 0;
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
// v208 — Si esta semana el cliente todavía no pasó fotos (week.photos==0),
// Posty lo dice UNA vez por semana en el chat de Schedule, como mensaje
// suyo. Burbuja efímera de UI: no se loguea al historial del servidor;
// el gate semanal vive en localStorage y si la semana ya tiene fotos la
// burbuja se retira y no vuelve.
// v222 — Regla de Valentino: UN solo botón de subida a la vista. La
// burbuja conserva su texto pero YA NO lleva botón propio: la subida se
// hace con el botón principal de la pantalla (el azul fijo bajo el
// saludo, v221). Esta burbuja solo se renderiza en Schedule (gate por
// hash más abajo), donde ese botón ya existe; en la vista de chat
// separada nunca aparece, así que ninguna otra superficie cambia.
async function maybePhotoWeekReminder(data) {
  try {
    if (!data || !data.week) return;
    if (!(location.hash || '').startsWith('#/app/schedule')) return;
    if (Number(data.week.photos || 0) > 0) {
      const old = document.getElementById('chatPhotoRem');
      if (old) old.remove();
      return;
    }
    const key = 'posty_photorem_' + albumMondayKey();
    let shown = false;
    try { shown = !!localStorage.getItem(key); } catch (e) {}
    if (shown) return;
    try { await (window.__chatHistP || Promise.resolve()); } catch (e) {}
    const box = document.getElementById('chatBox');
    if (!box || document.getElementById('chatPhotoRem')) return;
    box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" id="chatPhotoRem">esta semana todavía no me pasaste fotos 📸</div>`);
    try { localStorage.setItem(key, '1'); } catch (e) {}
    // v222: sin handler de botón — la burbuja ya no tiene botón propio
    // (un solo botón de subida a la vista: el principal de Schedule).
    chatScroll();
  } catch (e) {}
}

async function bindChatView() {
  bindChat();
  bindReview();
  try { bindAlbumCard(); } catch (e) {}
  // Home simple: tocar un posteo del carrusel lo abre en grande (patrón data-lightbox).
  $$('.hs-week [data-lightbox]').forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    if (el.dataset.lightbox) try { openLightbox(el.dataset.lightbox, el.dataset.video === '1'); } catch (err) {}
  });
  bindScheduleAll();
  bindAcceptAll();
  bindActivateWeek();
  bindAutopilot();
  // El nivel vive en el avatar del chat (no en el Schedule).
  try { paintChatLevel(); } catch (e) {}
  // El auto-arranque de la semana también aplica entrando por el chat.
  if (typeof maybeAutoStartWeek === 'function') { try { maybeAutoStartWeek(); } catch (e) {} }
  // El saludo va DESPUÉS del historial (chatLoadHistory reemplaza el box):
  // si ya cargó antes, no hay nada que esperar.
  try { await (window.__chatHistP || Promise.resolve()); } catch (e) {}
  try { await chatGreet(); } catch (e) {}
  // Tarjeta "¿Arrancamos por este? 👀" (solo primera apertura con borradores).
  try { renderFirstPick(CHAT_FIRST_PICK); } catch (e) {}
  // Un solo próximo paso: debajo de los borradores, solo si hay borradores.
  try {
    const nsc = document.getElementById('nextStepCta');
    const nsb = document.getElementById('nextStepBtn');
    if (nsc && nsb) {
      const hasDrafts = Array.isArray(REVIEW_DRAFTS) && REVIEW_DRAFTS.length > 0;
      nsc.style.display = hasDrafts ? '' : 'none';
      nsb.onclick = () => {
        // #revMsg en el chat solo recibe errores: los borradores reales viven
        // en #/app/schedule (reviewCardHTML "📋 Revisá tu semana").
        location.hash = '#/app/schedule';
      };
    }
  } catch (e) {}
  // Nudge forzado (ej: botón "Contame de tu negocio" del festejo) o pendiente semanal.
  let forced = null;
  try { forced = sessionStorage.getItem('posty-force-nudge'); sessionStorage.removeItem('posty-force-nudge'); } catch (e) {}
  try { await maybePostyNudge(forced || undefined); } catch (e) {}
  // Home: si está "armando tu semana", refrescar solo hasta que aparezcan (máx 2 min).
  try {
    if (document.querySelector('.hs-generating, .hs-completing, .igmock-pending') && (location.hash || '').startsWith('#/app/chat')) {
      let n = 0;
      try { n = Number(sessionStorage.getItem('hs_gen_retry') || 0); } catch (e) {}
      if (n < 24) {
        try { sessionStorage.setItem('hs_gen_retry', String(n + 1)); } catch (e) {}
        setTimeout(() => { try { if ((location.hash || '').startsWith('#/app/chat')) render(); } catch (e) {} }, 5000);
      } else {
        try { sessionStorage.removeItem('hs_gen_retry'); } catch (e) {}
      }
    } else {
      try { sessionStorage.removeItem('hs_gen_retry'); } catch (e) {}
    }
  } catch (e) {}
  // 🔔 Posty te avisa: "Editar" de #/app/post/:id pre-llena el chat (el chat edita posteos hablando)
  try {
    const pre = sessionStorage.getItem('posty-chat-prefill');
    if (pre) {
      sessionStorage.removeItem('posty-chat-prefill');
      const ci = document.getElementById('chatInput');
      if (ci) { ci.value = pre; ci.focus({ preventScroll: true }); }
    }
  } catch (e) {}
}

// Nudge proactivo de Posty (~1/semana, en momentos distintos): pide por chat lo
// que le falta — foto del producto, nota de voz o referencia de estilo — con acción inline.
async function maybePostyNudge(forceKind) {
  let kind = forceKind || null;
  if (!kind) {
    try { const r = await api.get('/api/nudges/pending'); kind = r && r.nudge && r.nudge.kind; } catch (e) { return; }
  }
  if (!kind) return;
  const box = document.getElementById('chatBox');
  if (!box) return;
  const id = 'pn' + Date.now();
  const kinds = {
    photo: {
      head: '📷 ¿Me pasás una foto de tu producto?',
      text: 'Con fotos reales tus posteos venden más — son 30 segundos con tu celular y la usamos esta misma semana.',
      btn: '📷 Subir foto', upload: '/api/assets?kind=photo', inspo: false,
    },
    inspo: {
      head: '🎨 ¿Te gusta algún estilo?',
      text: 'Pasame un posteo de Instagram que te encante y lo uso de referencia para tus diseños.',
      btn: '🎨 Subir referencia', upload: '/api/dna/inspo', inspo: true,
    },
    voice: {
      head: '🎙️ Contame de tu negocio',
      text: 'Hablame 2 minutos en un audio y aprendo cómo se ve lo que hacés.',
      btn: '🎙️ Grabar nota de voz', upload: null, inspo: false,
    },
  };
  const k = kinds[kind];
  if (!k) return;
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" style="max-width:100%">
    <div style="font-weight:800;margin-bottom:4px">${k.head}</div>
    <div style="font-size:13px;color:var(--mut);margin-bottom:10px">${k.text}</div>
    <button class="btn btn-primary btn-sm" id="${id}Btn">${k.btn}</button>
    <input type="file" id="${id}File" accept="image/*" style="display:none">
    <div id="${id}Msg" style="margin-top:8px"></div>
  </div>`);
  if (typeof chatScroll === 'function') chatScroll();
  const btn = document.getElementById(id + 'Btn'), inp = document.getElementById(id + 'File'), msg = document.getElementById(id + 'Msg');
  const done = async () => {
    try { await api.post('/api/nudges/done', { kind }); } catch (e) {}
  };
  // Voz: grabador inline en el chat (el botón alterna grabar/enviar).
  if (kind === 'voice') {
    if (btn) btn.onclick = () => pnVoiceToggle(id, done);
    return;
  }
  if (btn && inp) {
    btn.onclick = () => inp.click();
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      btn.disabled = true;
      if (msg) msg.innerHTML = `<div class="hint">⏳ ${k.inspo ? 'Mirando el estilo…' : 'Subiendo…'}</div>`;
      try {
        const r = await fetch(k.upload, { method: 'POST', headers: { 'Content-Type': f.type || 'image/jpeg' }, body: f });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo subir');
        await done();
        if (msg) msg.innerHTML = `<div class="hint">✅ ¡Genial! Ya lo estoy usando 😍</div>`;
        btn.style.display = 'none';
      } catch (e) {
        btn.disabled = false;
        if (msg) msg.innerHTML = `<div class="err">${esc(e.message || 'No pude subirlo 😅 Probá de nuevo')}</div>`;
      }
      inp.value = '';
    };
  }
}

// Grabador de voz inline para el nudge de Posty en el chat.
let PN_REC = null, PN_CHUNKS = [], PN_MIME = '', PN_TIMER = null, PN_START = 0;
function pnVoiceMsg(id, html) { const m = document.getElementById(id + 'Msg'); if (m) m.innerHTML = html; }
function pnVoiceTick(id) {
  if (!PN_REC) return;
  const b = document.getElementById(id + 'Btn');
  const s = Math.floor((Date.now() - PN_START) / 1000);
  if (b) b.innerHTML = `🔴 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} — tocá para enviar`;
}
async function pnVoiceToggle(id, done) {
  if (PN_REC) { pnVoiceStop(id, done); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    pnVoiceMsg(id, '<span style="color:var(--mut);font-size:11.5px">🎙 Tu navegador no soporta notas de voz.</span>');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    PN_CHUNKS = [];
    PN_MIME = rec.mimeType || '';
    rec.ondataavailable = e => { if (e.data && e.data.size) PN_CHUNKS.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); pnVoiceSend(id, done); };
    PN_REC = rec;
    rec.start();
    PN_START = Date.now();
    clearInterval(PN_TIMER);
    PN_TIMER = setInterval(() => pnVoiceTick(id), 500);
    pnVoiceTick(id);
    pnVoiceMsg(id, '<span style="color:var(--mut);font-size:11.5px">🔴 Grabando… contame qué vendés, tus precios y tus promos</span>');
    setTimeout(() => { if (PN_REC) pnVoiceStop(id, done); }, 180000);
  } catch (e) {
    pnVoiceMsg(id, '<span style="color:var(--mut);font-size:11.5px">🎙 No pudimos usar el micrófono. Revisá el permiso y probá de nuevo.</span>');
  }
}
function pnVoiceStop(id, done) {
  const rec = PN_REC;
  PN_REC = null;
  clearInterval(PN_TIMER);
  const b = document.getElementById(id + 'Btn');
  if (b) b.innerHTML = '🎙️ Grabar nota de voz';
  if (rec) { try { rec.stop(); } catch (e) { pnVoiceSend(id, done); } }
}
async function pnVoiceSend(id, done) {
  const chunks = PN_CHUNKS; PN_CHUNKS = [];
  const blob = new Blob(chunks, { type: PN_MIME || 'audio/mp4' });
  if (blob.size < 1500) { pnVoiceMsg(id, '<span style="color:var(--mut);font-size:11.5px">Parece que no se grabó nada. Probá de nuevo.</span>'); return; }
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || ''));
    fr.onerror = () => res('');
    fr.readAsDataURL(blob);
  });
  if (!dataUrl || !dataUrl.startsWith('data:audio/')) {
    pnVoiceMsg(id, '<span style="color:#B3402E;font-size:11.5px">No pudimos procesar la nota. Probá de nuevo.</span>');
    return;
  }
  pnVoiceMsg(id, '<span style="color:var(--mut);font-size:11.5px">⏳ Escuchando y aprendiendo de tu negocio…</span>');
  try {
    await api.post('/api/dna/from-audio', { audioDataUrl: dataUrl }, { timeout: 120000 });
    await done();
    pnVoiceMsg(id, '<span style="color:var(--mut);font-size:11.5px">✅ ¡Ya te conozco mejor! Lo guardé en tu negocio 😍</span>');
    const b = document.getElementById(id + 'Btn');
    if (b) b.style.display = 'none';
  } catch (e) {
    pnVoiceMsg(id, `<span style="color:#B3402E;font-size:11.5px">${esc((e && e.message) || 'No pudimos procesar la nota. Probá de nuevo.')}</span>`);
  }
}

// Mensaje del asistente solo local: no se loguea al servidor (no ensucia el contexto de la IA).
function chatSayLocal(text) {
  try { CHAT.push({ role: 'assistant', text }); } catch (e) {}
  const box = document.getElementById('chatBox');
  if (box) box.insertAdjacentHTML('beforeend', chatMsgHtml('assistant', text));
  if (typeof chatScroll === 'function') chatScroll();
  if (typeof postyNotify === 'function') postyNotify('Posty', text);
}

// Tarjeta "¿Arrancamos por este? 👀": solo primera apertura con borradores.
// first_pick llega en GET /api/ideas/chat (contrato backend). Tras responder se
// oculta y no vuelve a aparecer (flag en sessionStorage).
let FIRST_PICK_DONE = false;
function renderFirstPick(fp) {
  if (FIRST_PICK_DONE) return;
  try { if (sessionStorage.getItem('posta_first_pick_done') === '1') { FIRST_PICK_DONE = true; return; } } catch (e) {}
  const slot = document.getElementById('firstPickSlot');
  if (!slot || !fp || !(fp.post_id > 0)) return;
  const cap = String(fp.caption || '').trim();
  const excerpt = cap.length > 140 ? cap.slice(0, 140).trimEnd() + '…' : cap;
  slot.innerHTML = `
  <div class="card first-pick" id="firstPickCard">
    <div class="fp-title">¿Arrancamos por este? 👀</div>
    ${fp.image_url ? `<img class="fp-img" src="${esc(String(fp.image_url))}" alt="Posteo sugerido" loading="lazy">` : ''}
    ${excerpt ? `<div class="fp-cap">${esc(excerpt)}</div>` : ''}
    ${fp.reason ? `<div class="fp-reason">📸 ${esc(String(fp.reason))}</div>` : ''}
    <div class="fp-btns">
      <button type="button" class="btn btn-primary btn-sm" data-fpchoice="picked">Dale, ese 👍</button>
      <button type="button" class="btn btn-soft btn-sm" data-fpchoice="other">Prefiero otro</button>
      <button type="button" class="btn btn-ghost btn-sm" data-fpchoice="dismissed">Ahora no</button>
    </div>
  </div>`;
  slot.querySelectorAll('[data-fpchoice]').forEach(b => {
    b.onclick = () => firstPickAnswer(fp.post_id, b.dataset.fpchoice);
  });
}
async function firstPickAnswer(postId, choice) {
  const card = document.getElementById('firstPickCard');
  if (card) card.querySelectorAll('button').forEach(b => { b.disabled = true; });
  let reply = null;
  try {
    const r = await api.post('/api/posty/pick-feedback', { post_id: postId, choice });
    if (r && typeof r.reply === 'string' && r.reply.trim()) reply = r.reply.trim().slice(0, 600);
  } catch (e) { /* endpoint aún no desplegado: igual se oculta la tarjeta */ }
  FIRST_PICK_DONE = true;
  try { sessionStorage.setItem('posta_first_pick_done', '1'); } catch (e) {}
  const slot = document.getElementById('firstPickSlot');
  if (slot) slot.innerHTML = '';
  if (reply) { try { chatSay(reply); } catch (e) {} }
  if (choice === 'other') {
    // "Prefiero otro": los borradores están en Schedule, no en #revMsg
    // (que solo recibe errores en el chat).
    location.hash = '#/app/schedule';
  }
}

// Saludo proactivo con el estado REAL (una sola burbuja, una vez por sesión).
// El chat es 100% conversacional: Posty AVISA con texto + chips/link, nunca con
// tarjetas pesadas. La gestión semanal vive en Mi semana.
async function chatGreet() {
  let greeted = false;
  try { greeted = sessionStorage.getItem('posta_chat_greet') === '1'; } catch (e) {}
  // Estado real, compuesto del lado cliente con lo que ya existe.
  let all = [];
  try { all = await api.get('/api/posts'); } catch (e) { all = []; }
  const thisMon = mondayKey(new Date());
  const drafts = all.filter(p => p.status === 'draft' && (!p.week_key || p.week_key === thisMon)).sort((a, b) => a.id - b.id);
  const scheduled = all.filter(p => p.status === 'scheduled');
  try { REVIEW_DRAFTS = drafts; } catch (e) {}
  try { paintWeekPill(); } catch (e) {}
  const running = (typeof AUTOPILOT_RUNNING !== 'undefined' && AUTOPILOT_RUNNING) || window.__autoWeekRunning;
  // Chips de quick-reply contextuales (van siempre, el saludo solo una vez por sesión).
  try { renderQuickChips(drafts, scheduled, running); } catch (e) {}
  // Nivel del avatar: siempre se actualiza (no es el saludo).
  try { chatAvatarLevel(); } catch (e) {}
  // Misiones sin tarjeta en el chat: festejo si se cumplió alguna + dato de la
  // activa para el aviso de una línea.
  let missionActive = null;
  try {
    const mi = await chatActiveMission(all);
    if (mi && mi.newly && mi.newly.length && !greeted) {
      const cm = POSTA_MISSION_DEFS.find(x => x.id === mi.newly[0]);
      if (cm) chatSayLocal(`¡Misión cumplida! 🎉 ${cm.title} — seguimos.`);
    }
    if (mi && !mi.active && mi.nowDone.length && !greeted) {
      let allOk = false;
      try { allOk = localStorage.getItem('posta_missions_all') === '1'; } catch (e) {}
      if (!allOk) {
        try { localStorage.setItem('posta_missions_all', '1'); } catch (e) {}
        chatSayLocal('Tu Instagram está perfecto 🌟 Misión cumplida — yo me ocupo de que siga así.');
      }
    }
    missionActive = mi && mi.active;
  } catch (e) {}
  if (greeted) return;
  try { sessionStorage.setItem('posta_chat_greet', '1'); } catch (e) {}
  // "Rueditas": si la primera semana está en revisión, el cliente ve el estado
  // lindo y no el CTA de armar semana (reemplaza el saludo, no se suma).
  let inReview = 0;
  try { const rs = await api.get('/api/review-status'); inReview = (rs && rs.pending) || 0; } catch (e) {}
  let text, cta = '';
  if (running) {
    text = 'Estoy armando tu semana ahora mismo ⏳ Te aviso acá cuando esté lista.';
  } else if (inReview > 0) {
    text = 'Tu primera semana está en el horno ✨ La estamos dejando perfecta — te aviso acá cuando puedas revisarla.';
  } else if (drafts.length > 0) {
    const n = drafts.length;
    text = `Dejé ${n} ${n === 1 ? 'borrador listo' : 'borradores listos'} en Schedule 👇`;
  } else if (scheduled.length > 0) {
    // Resumen proactivo (hoy / mañana a la noche): reemplaza el saludo
    // genérico, no se suma — una sola burbuja por apertura.
    text = chatSchedSummary(scheduled) || 'Tu semana sale sola 📅 La próxima ya se está armando.';
  } else if (missionActive) {
    const mTitle = String(missionActive.title || '').toLowerCase();
    if (missionActive.act === 'comments') {
      text = 'Tenés comentarios sin responder 💬 Escribime "comentarios" y los vemos juntos.';
    } else {
      const dest = missionActive.go === '#/app/ajustes' ? 'Ajustes' : 'Schedule';
      text = `Falta una cosa para que tu Instagram quede perfecto: ${mTitle} 👇 Lo resolvés en un toque desde ${dest}.`;
    }
  } else {
    text = '¿Te armo tu semana? 👇';
    cta = `<div class="chat-cta-row"><button class="btn btn-primary" data-autopilot="semana">⚡ Armar mi semana</button></div>`;
  }
  chatSayLocal(text);
  const box = document.getElementById('chatBox');
  if (box && cta) {
    box.insertAdjacentHTML('beforeend', cta);
    if (typeof chatScroll === 'function') chatScroll();
  }
  // El CTA trae data-autopilot: cablearlo (el gate de ADN del autopilot
  // maneja solo el caso sin datos, con mini-entrevista en este mismo chat).
  if (cta && typeof bindAutopilot === 'function') bindAutopilot();
}

// Tarjetas de borrador dentro del chat: reusan las acciones de la revisión
// (data-revaccept / data-revvars vía bindReview, #btnScheduleAll vía bindScheduleAll).
// Nada se publica sin el tap: el ✅ programa ese borrador, el 📅 programa toda la semana.
// La píldora "Mi semana · N" se alimenta sin tarjetas: refresca el conteo de
// borradores de la semana actual (misma fuente que usaba el bloque del chat).
async function refreshWeekPill() {
  try {
    const all = await api.get('/api/posts');
    const thisMon = mondayKey(new Date());
    REVIEW_DRAFTS = all.filter(p => p.status === 'draft' && (!p.week_key || p.week_key === thisMon)).sort((a, b) => a.id - b.id);
  } catch (e) { try { REVIEW_DRAFTS = []; } catch (e2) {} }
  try { paintWeekPill(); } catch (e) {}
}


/* ---------- CAPA PROACTIVA DEL CHAT ---------- */
// Chips de quick-reply contextuales sobre el input: un tap manda el mensaje.
// El estado ya lo trae chatGreet (no fetchea de más).
// Chips de quick-reply contextuales sobre el input. Aceptan texto (manda el
// Línea de cupo sobre los chips del chat: cuántos posteos/reels quedan esta semana.
// El cliente lo ve sin preguntar; si se agota, Posty ya lo sabe por el contexto del chat.
async function paintChatQuota(mount, q0) {
  if (!mount || !mount.isConnected) return;
  let q = q0 || null;
  if (!q) { try { q = await api.get('/api/quota'); } catch (e) { return; } }
  if (!q || typeof q.left !== 'number' || !mount.isConnected) return;
  const r = q.reels || {};
  const st = q.stories || {};
  let t;
  if (q.left > 0) t = `Te quedan ${q.left} ${q.left === 1 ? 'posteo' : 'posteos'}`;
  else t = `Usaste tus ${q.limit} posteos`;
  if (r && typeof r.left === 'number' && (r.limit || 0) > 0) {
    t += r.left > 0 ? ` · ${r.left} ${r.left === 1 ? 'reel' : 'reels'}` : ' · sin reels';
  }
  if (st && typeof st.left === 'number' && (st.limit || 0) > 0) {
    t += st.left > 0 ? ` · ${st.left} ${st.left === 1 ? 'historia' : 'historias'}` : ' · sin historias';
  }
  t += ' esta semana';
  if (!mount.isConnected) return;
  const old = mount.querySelector('.chat-quota');
  if (old) old.remove();
  mount.insertAdjacentHTML('afterbegin', `<div class="chat-quota">📊 ${esc(t)}</div>`);
  try { mount.classList.toggle('quota-row', mount.querySelectorAll(':scope > button').length === 1); } catch (e) {}
}
/* ============================================================
   📇 TARJETA DE POSTEO UNIFICADA (chat "Se viene" + Schedule)
   Un solo componente, todo inline sin navegar: ver, editar
   caption, cambiar imagen (3 caminos), saltar con deshacer, aprobar.
   Acciones por UN listener delegado en document ([data-pc-act]).
   ============================================================ */
function pcTz() {
  try { return (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires'; }
  catch (e) { return 'America/Argentina/Buenos_Aires'; }
}
// Misma convención de parseo que el Schedule: "YYYY-MM-DD HH:MM" (16) = hora local,
// con 'T'/Z u offset se respeta lo que traiga.
function pcParseDate(s0) {
  const s = String(s0 || '');
  if (!s) return null;
  let x = s.length === 16 ? s.replace(' ', 'T') : s.replace(' ', 'T');
  if (s.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z';
  const d = new Date(x);
  return isNaN(d) ? null : d;
}
function pcFmtDay(d, tz) { try { return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', timeZone: tz }); } catch (e) { return ''; } }
function pcFmtDayLong(d, tz) { try { return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: tz }); } catch (e) { return ''; } }
function pcFmtHour(d, tz) { try { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }); } catch (e) { return ''; } }
function pcBadge(p) {
  if (String(p.status) === 'published') return '<span class="pcard-badge pcard-badge-done">✅ Salió</span>';
  const mt = String(p.media_type || '');
  if (mt === 'video') return '<span class="pcard-badge">🎬 Reel</span>';
  if (mt === 'story') return '<span class="pcard-badge">📸 Story</span>';
  if (mt === 'carousel') return '<span class="pcard-badge">🖼️ Carrusel</span>';
  return '<span class="pcard-badge">📝 Post</span>';
}
// layout: 'row' (chat, horizontal compacto) | 'col' (schedule, vertical)
function postCardHTML(p, opts) {
  opts = opts || {};
  const layout = opts.layout === 'col' ? 'col' : 'row';
  const tz = pcTz();
  const isPub = String(p.status) === 'published';
  const d = pcParseDate(isPub ? (p.published_at || p.scheduled_at) : p.scheduled_at);
  const when = d ? pcFmtDay(d, tz) + ' · ' + pcFmtHour(d, tz) : '';
  const dayLabel = d ? pcFmtDayLong(d, tz) + ' a las ' + pcFmtHour(d, tz) : '';
  const isV = String(p.media_type || '') === 'video';
  const media = !p.image_path ? '<span class="pcard-nothumb">📝</span>'
    : isV ? `<video src="${esc(p.image_path)}" muted playsinline preload="metadata"></video>`
    : `<img src="${esc(p.image_path)}" alt="" loading="lazy">`;
  const capFull = String(p.caption || p.source_topic || 'Posteo');
  const canApprove = String(p.approval) === 'pending' && String(p.status) === 'scheduled';
  const actions = isPub ? '' : `<div class="pcard-actions">
      ${isV ? '' : '<button type="button" data-pc-act="image">🖼️ Imagen</button>'}
      <button type="button" data-pc-act="skip">⏭️ Saltar</button>
      ${String(p.status) === 'scheduled' ? '<button type="button" data-pc-act="hold">⏸ Frenar</button>' : ''}
      ${canApprove ? '<button type="button" data-pc-act="approve" class="pcard-approve">✅ Aprobar</button>' : ''}
    </div>`;
  // TikTok (v166): solo posteos publicados y solo si el usuario conectó su
  // cuenta — el botón nace oculto y ttEnhance() lo muestra según /api/tiktok/status.
  const ttActs = !isPub ? '' : (p.tiktok_publish_id
    ? `<div class="pcard-actions"><span style="font-size:11.5px;font-weight:700;color:var(--dim)">🎵 Ya está en TikTok ✓</span></div>`
    : `<div class="pcard-actions"><button type="button" data-pc-act="tiktok" hidden>🎵 Compartir en TikTok</button></div>`);
  return `<div class="pcard pcard-${layout}" data-post-id="${esc(String(p.id))}" data-sched-at="${esc(String(p.scheduled_at || ''))}" data-day-label="${esc(dayLabel)}">
    <button type="button" class="pcard-media" data-pc-act="open" aria-label="Ver posteo">${media}</button>
    <div class="pcard-body">
      <div class="pcard-meta"><b>${esc(when)}</b>${pcBadge(p)}</div>
      <div class="pcard-cap" data-pc-act="edit-cap" data-full="${esc(capFull)}" title="Tocá para editar">${esc(capFull)}</div>
      ${p.strategy_why ? `<div style="font-size:11px;color:var(--dim);line-height:1.5;margin-top:8px;overflow-wrap:anywhere">💡 <b>Por qué:</b> ${esc(p.strategy_why)}</div>` : ''}
      ${actions}${ttActs}
    </div>
  </div>`;
}
// TikTok (v166): comparte un posteo publicado en TikTok, a pedido del usuario.
let __ttStatusP = null;
function ttStatusOnce() {
  if (!__ttStatusP) __ttStatusP = api.get('/api/tiktok/status').catch(() => null);
  return __ttStatusP;
}
async function ttEnhance() {
  try {
    const st = await ttStatusOnce();
    if (st && st.connected) document.querySelectorAll('[data-pc-act="tiktok"]').forEach(b => { b.hidden = false; });
  } catch (e) {}
}
async function pcShareTikTok(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '🎵 Publicando…'; }
  try {
    const r = await api.post('/api/tiktok/publish/' + encodeURIComponent(id), {});
    postToast({ text: (r && r.message) || '🎵 ¡Compartido en TikTok!', ms: 6000 });
    try { render(); } catch (e) {}
  } catch (e) {
    postToast({ text: '😅 ' + ((e && e.message) || 'No se pudo compartir en TikTok'), ms: 6000 });
    if (btn) { btn.disabled = false; btn.textContent = '🎵 Compartir en TikTok'; }
  }
}
// Toast con acciones (fijo abajo, sobre el input). actions: [{label, fn}]
function postToast(o) {
  o = o || {};
  try {
    document.querySelectorAll('.ptoast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'ptoast';
    t.innerHTML = `<span class="ptoast-txt">${esc(o.text || '')}</span><span class="ptoast-acts"></span>`;
    const acts = t.querySelector('.ptoast-acts');
    (o.actions || []).forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ptoast-btn';
      b.textContent = a.label;
      b.onclick = async () => { try { await a.fn(); } catch (e) {} try { t.remove(); } catch (e2) {} };
      acts.appendChild(b);
    });
    document.body.appendChild(t);
    setTimeout(() => { try { t.remove(); } catch (e) {} }, o.ms || 5000);
  } catch (e) {}
}
// --- Edición inline del caption ---
function pcStartEdit(card) {
  if (!card || card.querySelector('.pcard-edit')) return;
  const capEl = card.querySelector('.pcard-cap') || card.querySelector('.igmock-cap');
  if (!capEl) return;
  const current = capEl.dataset.full || capEl.textContent || '';
  capEl.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.className = 'pcard-edit';
  wrap.innerHTML = `<textarea rows="3" maxlength="2200">${esc(current)}</textarea>
    <div class="pcard-edit-btns">
      <button type="button" class="btn btn-primary btn-sm" data-pc-act="save-cap">Guardar</button>
      <button type="button" class="btn btn-soft btn-sm" data-pc-act="cancel-cap">Cancelar</button>
    </div>`;
  capEl.after(wrap);
  const ta = wrap.querySelector('textarea');
  if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }
}
function pcCancelEdit(card) {
  if (!card) return;
  const ed = card.querySelector('.pcard-edit');
  if (ed) ed.remove();
  const capEl = card.querySelector('.pcard-cap, .igmock-cap');
  if (capEl) capEl.style.display = '';
}
async function pcSaveCap(card, id, btn) {
  const wrap = card ? card.querySelector('.pcard-edit') : null;
  const ta = wrap ? wrap.querySelector('textarea') : null;
  if (!ta) return;
  const v = ta.value.trim();
  if (btn) btn.disabled = true;
  try {
    await api.patch('/api/posts/' + encodeURIComponent(id), { caption: v });
  } catch (e) {
    if (btn) btn.disabled = false;
    toast('No se pudo guardar: ' + esc((e && e.message) || 'probá de nuevo'));
    return;
  }
  // Actualiza todas las tarjetas visibles de este posteo. OJO: el caption
  // vive en .pcard-cap (tarjeta) o en .igmock-cap (vista tipo Instagram de
  // Schedule): si se busca una sola clase, la otra queda oculta tras
  // guardar y el caption "desaparece" hasta refrescar (bug 2026-10-16).
  document.querySelectorAll('[data-post-id="' + id + '"]').forEach(c => {
    const ce = c.querySelector('.pcard-cap, .igmock-cap');
    if (ce) { ce.dataset.full = v; ce.textContent = v; ce.style.display = ''; }
    const we = c.querySelector('.pcard-edit');
    if (we) we.remove();
  });
  toast('✅ Caption actualizado');
}
// --- Loading + imagen inline en todas las tarjetas del posteo ---
function pcSetLoading(id, on, label) {
  // Las dos superficies: .pcard-media (tarjeta) y .igmock-media (Schedule).
  // Buscar una sola dejaba la otra sin indicador y sin refresco (2026-10-16).
  document.querySelectorAll('[data-post-id="' + id + '"]').forEach(card => {
    const m = card.querySelector('.pcard-media, .igmock-media');
    if (!m) return;
    let ov = m.querySelector('.pcard-loading');
    if (on) {
      if (!ov) { ov = document.createElement('div'); ov.className = 'pcard-loading'; m.appendChild(ov); }
      ov.innerHTML = '<span>' + esc(label || '⏳ Generando…') + '</span>';
    } else if (ov) ov.remove();
  });
}
function pcSetImage(id, path) {
  // Se ve EN EL MOMENTO: se cambia el src en todas las tarjetas del posteo
  // con un cache-buster (la media sale con caché de 30 días: sin esto, si la
  // ruta se repitiera, el navegador seguiría mostrando la vieja) y el visor
  // en grande queda apuntando a la imagen nueva.
  const bust = path + (String(path).includes('?') ? '&' : '?') + 'v=' + Date.now();
  document.querySelectorAll('[data-post-id="' + id + '"]').forEach(card => {
    const m = card.querySelector('.pcard-media, .igmock-media');
    if (!m) return;
    const img = m.querySelector('img');
    if (img) img.src = bust;
    else m.innerHTML = '<img src="' + esc(bust) + '" alt="" loading="lazy">';
    if (m.dataset && m.dataset.lightbox !== undefined) m.dataset.lightbox = path;
  });
}
// --- Bottom sheet: cambiar imagen (3 caminos) ---
let PC_STYLES_CACHE = null;
function pcCloseSheet() {
  document.querySelectorAll('.pcsheet-backdrop').forEach(x => { try { x.remove(); } catch (e) {} });
}
async function pcLoadStyleUI(id, root) {
  const recBox = root.querySelector('.pcsheet-recbtns');
  const allBox = root.querySelector('.pcsheet-all');
  const countEl = root.querySelector('.pcsheet-allcount');
  let data = null;
  try { data = await api.get('/api/image-styles?post=' + encodeURIComponent(id)); } catch (e) {}
  const styles = (data && data.styles && data.styles.length) ? data.styles : (PC_STYLES_CACHE || []);
  if (styles.length) PC_STYLES_CACHE = styles;
  const rec = (data && data.recommended) || [];
  if (recBox) {
    recBox.innerHTML = rec.length
      ? rec.map(s => '<button type="button" class="pcsheet-opt pcsheet-rec" data-pc-act="img-pick" data-code="' + esc(String(s.code)) + '"><img class="pcsheet-thumb" src="/api/style-sample?style=' + encodeURIComponent(String(s.code)) + '" alt="" loading="lazy" onerror="this.remove()"><span>' + esc(String(s.name)) + '</span></button>').join('')
      : '<div class="pcsheet-loading">Sin recomendaciones por ahora — probá Sorprendeme 🎲</div>';
  }
  if (allBox) {
    allBox.innerHTML = styles.map(s => '<button type="button" class="pcsheet-chip" data-pc-act="img-pick" data-code="' + esc(String(s.code)) + '">' + esc(String(s.name)) + '</button>').join('');
  }
  if (countEl) countEl.textContent = styles.length ? styles.length + ' estilos pensados para negocios como el tuyo' : '';
}
function pcOpenImageSheet(id) {
  pcCloseSheet();
  const bd = document.createElement('div');
  bd.className = 'pcsheet-backdrop';
  bd.innerHTML = `<div class="pcsheet" data-post-id="${esc(String(id))}" role="dialog" aria-modal="true">
    <div class="pcsheet-handle"></div>
    <div class="pcsheet-title">Cambiar imagen</div>
    <button type="button" class="pcsheet-opt" data-pc-act="img-style">🎨 Otro estilo<small>La rehago con otro look — se ve al momento</small></button>
    <div class="pcsheet-stylewrap" hidden>
      <div class="pcsheet-reclabel">✨ Para este posteo, te recomiendo:</div>
      <div class="pcsheet-recbtns"><div class="pcsheet-loading">Cargando…</div></div>
      <button type="button" class="pcsheet-opt" data-pc-act="img-surprise">🎲 Sorprendeme<small>Posty elige un look de tu rubro por vos</small></button>
      <button type="button" class="pcsheet-opt" data-pc-act="img-all">📚 Ver todos los de mi rubro<small class="pcsheet-allcount"></small></button>
      <div class="pcsheet-all" hidden></div>
    </div>
    <button type="button" class="pcsheet-opt" data-pc-act="img-upload">📸 Usar una foto tuya<small>Subila y la uso en este posteo: sale tu negocio real</small></button>
    <input type="file" accept="image/*" class="pcsheet-file" hidden>
    <button type="button" class="pcsheet-opt" data-pc-act="img-enhance">✨ Mejorar esta<small>Retoco la actual: luz, color y nitidez</small></button>
    <button type="button" class="pcsheet-opt" data-pc-act="img-revert" hidden>↩️ Volver a la anterior<small>Recuperás la imagen que tenía antes del cambio — gratis</small></button>
    <div class="pcsheet-note"></div>
    <button type="button" class="pcsheet-close" data-pc-act="img-close">Cerrar</button>
    <div class="pcsheet-msg"></div>
  </div>`;
  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) pcCloseSheet(); });
  const sheet = bd.querySelector('.pcsheet');
  const file = sheet.querySelector('.pcsheet-file');
  file.addEventListener('change', () => { if (file.files && file.files[0]) pcUploadPhoto(id, file.files[0]); });
  // Estado del rehacer (1 por posteo): se lee del servidor al abrir.
  (async () => {
    try {
      const r = await api.get('/api/posts/' + encodeURIComponent(id));
      const post = r && r.post;
      if (!post || !document.body.contains(bd)) return;
      const note = sheet.querySelector('.pcsheet-note');
      if ((post.img_redos || 0) >= 1) {
        sheet.querySelectorAll('[data-pc-act="img-style"], [data-pc-act="img-enhance"]').forEach(b => {
          b.disabled = true; b.classList.add('pcsheet-off');
        });
        if (note) note.textContent = 'Ya usaste el rehacer de este posteo. Podés volver a la anterior o usar una foto tuya.';
      } else if (note) {
        note.textContent = 'Te queda 1 rehacer con IA para este posteo.';
      }
      if (post.prev_image_path) {
        const rb = sheet.querySelector('[data-pc-act="img-revert"]');
        if (rb) rb.hidden = false;
      }
    } catch (e) {}
  })();
}
function pcSheetMsg(id, html) {
  const m = document.querySelector('.pcsheet[data-post-id="' + id + '"] .pcsheet-msg');
  if (m) m.innerHTML = html;
}
async function pcRestyle(id, style) {
  pcCloseSheet();
  pcSetLoading(id, true, '⏳ Creando nueva imagen…');
  try {
    const r = await api.post('/api/drafts/' + encodeURIComponent(id) + '/photo-restyle', { style }, { timeout: 180000 });
    if (r && r.ok && r.path) { pcSetImage(id, r.path); toast('✅ Imagen actualizada'); }
    else toast('No se pudo: ' + esc((r && r.error) || 'probá de nuevo'));
  } catch (e) { toast('No se pudo: ' + esc((e && e.message) || 'probá de nuevo')); }
  pcSetLoading(id, false);
}
async function pcEnhance(id) {
  pcCloseSheet();
  pcSetLoading(id, true, '⏳ Mejorando la foto…');
  try {
    const r = await api.post('/api/drafts/' + encodeURIComponent(id) + '/photo-enhance', {}, { timeout: 180000 });
    if (r && r.ok && r.path) { pcSetImage(id, r.path); toast('✅ Foto mejorada'); }
    else toast('No se pudo: ' + esc((r && r.error) || 'probá de nuevo'));
  } catch (e) { toast('No se pudo: ' + esc((e && e.message) || 'probá de nuevo')); }
  pcSetLoading(id, false);
}
async function pcRevert(id) {
  pcCloseSheet();
  pcSetLoading(id, true, '⏳ Volviendo a la anterior…');
  try {
    const r = await api.post('/api/drafts/' + encodeURIComponent(id) + '/photo-revert', {}, { timeout: 60000 });
    if (r && r.ok && r.path) { pcSetImage(id, r.path); toast('↩️ Volvimos a la imagen anterior'); }
    else toast('No se pudo: ' + esc((r && r.error) || 'probá de nuevo'));
  } catch (e) { toast('No se pudo: ' + esc((e && e.message) || 'probá de nuevo')); }
  pcSetLoading(id, false);
}
async function pcUploadPhoto(id, file) {
  if (!file || !String(file.type || '').startsWith('image/')) { toast('Elegí un archivo de imagen'); return; }
  pcCloseSheet();
  pcSetLoading(id, true, '⏳ Subiendo foto…');
  try {
    const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': file.type || 'image/png' }, body: file });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'No pude subirla');
    await api.patch('/api/posts/' + encodeURIComponent(id), { action: 'save-draft', image_path: data.path });
    pcSetImage(id, data.path);
    toast('✅ Foto actualizada');
  } catch (e) { toast('No se pudo subir: ' + esc((e && e.message) || 'probá de nuevo')); }
  pcSetLoading(id, false);
}
// --- Frenar un posteo programado (vuelve a borrador; se re-acepta cuando quieran) ---
async function pcHold(id) {
  try {
    await api.patch('/api/posts/' + encodeURIComponent(id), { action: 'unschedule' });
  } catch (e) {
    toast('No se pudo frenar: ' + esc((e && e.message) || 'probá de nuevo'));
    return;
  }
  toast('⏸ Posteo frenado — no va a salir. Cuando quieras, aceptalo de nuevo.');
  try { render(); } catch (e) {}
}
// --- Saltar con deshacer (5s) + armar otro ---
async function pcSkip(id, card) {
  if (!card) return;
  const schedAt = card.dataset.schedAt || '';
  const dayLabel = card.dataset.dayLabel || 'ese día';
  card.style.pointerEvents = 'none';
  try {
    await api.patch('/api/posts/' + encodeURIComponent(id), { action: 'cancel' });
  } catch (e) {
    card.style.pointerEvents = '';
    toast('No se pudo saltar: ' + esc((e && e.message) || 'probá de nuevo'));
    return;
  }
  card.classList.add('pcard-gone');
  setTimeout(() => { if (card.classList.contains('pcard-gone')) card.style.display = 'none'; }, 280);
  postToast({
    text: 'Posteo saltado',
    ms: 5000,
    actions: [
      { label: 'Deshacer', fn: async () => {
        try { await api.patch('/api/posts/' + encodeURIComponent(id), { scheduled_at: schedAt }); }
        catch (e) { toast('No se pudo deshacer: ' + esc((e && e.message) || 'probá de nuevo')); return; }
        card.style.display = '';
        requestAnimationFrame(() => { card.classList.remove('pcard-gone'); card.style.pointerEvents = ''; });
      } },
      { label: 'Armar otro', fn: () => {
        try { sessionStorage.setItem('posty-chat-prefill', 'Armame un posteo para el ' + dayLabel); } catch (e) {}
        location.hash = '#/app/chat';
      } },
    ],
  });
}
// --- Aprobar ---
async function pcApprove(id, card, btn) {
  if (btn) btn.disabled = true;
  try {
    await api.post('/api/posts/' + encodeURIComponent(id) + '/approve', {});
  } catch (e) {
    if (btn) btn.disabled = false;
    toast('No se pudo aprobar: ' + esc((e && e.message) || 'probá de nuevo'));
    return;
  }
  document.querySelectorAll('[data-post-id="' + id + '"]').forEach(c => {
    const b = c.querySelector('.pcard-badge');
    if (b) b.outerHTML = '<span class="pcard-badge pcard-badge-ok">✅ Aprobado</span>';
    const ab = c.querySelector('[data-pc-act="approve"]');
    if (ab) ab.remove();
  });
  toast('✅ Aprobado — sale a su hora');
}
// --- Publicar ahora desde la tarjeta de Schedule (v241): el MISMO
// publishNowFlow de la tarjeta de revisión — hoja de OK explícito,
// progreso en el mount de ESTA tarjeta, y al salir bien refresco como
// hace Frenar. Si el editor de caption está abierto, se guarda antes
// (mismo PATCH que pcSaveCap), como hace bindReview con data-revcap. ---
async function pcPublishNow(id, root, btn) {
  if (btn) btn.disabled = true;
  const mount = root ? root.querySelector('.pcard-pubnowm') : null;
  if (!mount) { if (btn) btn.disabled = false; return; }
  const ta = root.querySelector('.pcard-edit textarea');
  if (ta) {
    const v = ta.value.trim();
    try { await api.patch('/api/posts/' + encodeURIComponent(id), { caption: v }); } catch (e) {}
    const ce = root.querySelector('.pcard-cap, .igmock-cap');
    if (ce) { ce.dataset.full = v; ce.textContent = v; ce.style.display = ''; }
    const we = root.querySelector('.pcard-edit');
    if (we) we.remove();
  }
  const res = await publishNowFlow(id, mount);
  if (res && res.ok) { try { render(); } catch (e) {} }
  else if (btn) btn.disabled = false;
}
// --- UN solo listener delegado para [data-pc-act] ---
function pcOnClick(e) {
  const el = e.target && e.target.closest ? e.target.closest('[data-pc-act]') : null;
  if (!el) return;
  const root = el.closest('[data-post-id]');
  if (!root) return;
  const id = root.dataset.postId;
  const act = el.dataset.pcAct;
  if (act === 'open') { location.hash = '#/app/post/' + encodeURIComponent(id); return; }
  if (act === 'hold') { pcHold(id); return; }
  if (act === 'edit-cap') { pcStartEdit(root); return; }
  if (act === 'save-cap') { pcSaveCap(root, id, el); return; }
  if (act === 'cancel-cap') { pcCancelEdit(root); return; }
  if (act === 'image') { pcOpenImageSheet(id); return; }
  if (act === 'skip') { pcSkip(id, root); return; }
  if (act === 'approve') { pcApprove(id, root, el); return; }
  if (act === 'pubnow') { pcPublishNow(id, root, el); return; }
  if (act === 'tiktok') { pcShareTikTok(id, el); return; }
  if (act === 'img-style') {
    const wrap = root.querySelector('.pcsheet-stylewrap');
    if (wrap) {
      const show = wrap.hidden;
      wrap.hidden = !show;
      if (show) pcLoadStyleUI(id, root);
    }
    return;
  }
  if (act === 'img-pick') {
    const code = el.dataset.code || '';
    if (code) pcRestyle(id, code);
    return;
  }
  if (act === 'img-surprise') {
    const list = PC_STYLES_CACHE || [];
    if (list.length) {
      const pick = list[Math.floor(Math.random() * list.length)];
      if (pick && pick.code) pcRestyle(id, pick.code);
    } else {
      pcSheetMsg(id, 'Esperá un segundo y probá de nuevo 🎲');
    }
    return;
  }
  if (act === 'img-all') {
    const all = root.querySelector('.pcsheet-all');
    if (all) all.hidden = !all.hidden;
    return;
  }
  if (act === 'img-upload') { const f = root.querySelector('.pcsheet-file'); if (f) f.click(); return; }
  if (act === 'img-enhance') { pcEnhance(id); return; }
  if (act === 'img-revert') { pcRevert(id); return; }
  if (act === 'img-close') { pcCloseSheet(); return; }
}
if (!window.__pcardBound) {
  window.__pcardBound = true;
  document.addEventListener('click', pcOnClick);
}
// 📅 "Se viene": próximos posteos programados integrados al chat.
// Usa la tarjeta unificada (todo inline: ver, editar, imagen, saltar, aprobar).
async function paintUpcoming(mount) {
  if (!mount || !mount.isConnected) return;
  const old = mount.querySelector('.chat-upcoming');
  if (old) old.remove();
  let posts = [];
  try { posts = await api.get('/api/posts'); } catch (e) { return; }
  const now = Date.now();
  const up = (Array.isArray(posts) ? posts : [])
    .filter(p => p.status === 'scheduled' && p.scheduled_at)
    .map(p => ({ p, d: pcParseDate(p.scheduled_at) }))
    .filter(x => x.d && x.d.getTime() > now - 3600000)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  if (!up.length || !mount.isConnected) return;
  const items = up.map(({ p }) => postCardHTML(p, { layout: 'row' })).join('');
  mount.insertAdjacentHTML('afterbegin', `<div class="chat-upcoming">
    <button type="button" class="cu-head" data-cu-go="schedule">📅 Se viene <span class="cu-go">Ver todo →</span></button>
    <div class="cu-list">${items}</div>
  </div>`);
  // Debajo de la tira de cupo si ya está (orden estable sin importar el timing).
  const box0 = mount.querySelector('.chat-upcoming');
  const qEl = mount.querySelector('.chat-quota');
  if (box0 && qEl && qEl.compareDocumentPosition(box0) & Node.DOCUMENT_POSITION_PRECEDING) {
    qEl.insertAdjacentElement('afterend', box0);
  }
  const box = mount.querySelector('.chat-upcoming');
  if (!box || !box.isConnected) return;
  const go = box.querySelector('[data-cu-go]');
  if (go) go.onclick = () => { location.hash = '#/app/schedule'; };
}
// mensaje), {go} (navega) o {do:'schedule'} (programa la semana sin salir del chat).
function renderQuickChips(drafts, scheduled, running) {
  const card = document.getElementById('chatCard');
  const inputRow = card ? card.querySelector('.chat-input-row') : null;
  if (!inputRow) return;
  let mount = document.getElementById('chatQuickChips');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'chatQuickChips';
    mount.className = 'chat-quick';
    inputRow.parentNode.insertBefore(mount, inputRow);
  }
  const dN = (drafts || []).length, sN = (scheduled || []).length;
  let chips;
  if (running) {
    chips = ['¿Qué sale esta semana? 📅', '¿Qué preguntan en mis comentarios? 💬'];
  } else if (dN > 0) {
    // Solo el botón que importa: el tap de aprobación. "Ver Schedule" duplica el
    // sidebar y "¿Qué sale esta semana?" la puede tipear (menos es más).
    chips = [
      { t: '📅 Programar mi semana', do: 'schedule' },
    ];
  } else if (sN > 0) {
    chips = ['¿Qué sale esta semana? 📅', '¿Qué preguntan en mis comentarios? 💬', '💡 Dame una idea para vender'];
  } else {
    chips = ['⚡ Armame la semana', '💡 Dame una idea para vender'];
  }
  mount.innerHTML = chips.map((c, i) => `<button type="button" data-qchip="${i}">${esc(typeof c === 'string' ? c : c.t)}</button>`).join('');
  mount.querySelectorAll('[data-qchip]').forEach(b => b.onclick = () => {
    const c = chips[+b.dataset.qchip];
    if (c && typeof c !== 'string' && c.go) { location.hash = c.go; return; }
    if (c && typeof c !== 'string' && c.do === 'schedule') { doScheduleAll(b); return; }
    const t = typeof c === 'string' ? c : (c && c.t);
    const i = document.getElementById('chatInput');
    if (!i || !t) return;
    i.value = t;
    chatSend();
  });
  paintChatQuota(mount);
}

// Utilidades de agenda con la zona horaria del usuario (misma convención que "Lo que se viene").
function chatAgendaKit() {
  const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  const dayKey = (d) => { try { return d.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } };
  const parse = (iso) => {
    const s0 = String(iso || '');
    let s = s0.length === 16 ? s0 : s0.replace(' ', 'T');
    if (s0.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
    return new Date(s);
  };
  const title = (p) => {
    const t = String(p.source_topic || '').trim();
    if (t) return t;
    const c = String(p.caption || '').split('\n')[0].trim();
    return c ? cortar(c, 50) : 'tu posteo';
  };
  const hour = (d) => { try { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch (e) { return ''; } };
  const dayLabel = (d, todayK, tomorrowK) => {
    const k = dayKey(d);
    if (k === todayK) return 'Hoy';
    if (k === tomorrowK) return 'Mañana';
    try { return d.toLocaleDateString('es-AR', { weekday: 'long', timeZone: tz }); } catch (e) { return k; }
  };
  return { tz, dayKey, parse, title, hour, dayLabel };
}

// Resumen proactivo para el saludo: si hay posteos HOY → "Hoy sale…";
// si es de noche y hay mañana → "Mañana sale…". '' = saludo genérico.
function chatSchedSummary(scheduled) {
  try {
    const K = chatAgendaKit();
    const items = (scheduled || []).map(p => ({ p, d: K.parse(p.scheduled_at) }))
      .filter(x => !isNaN(x.d) && x.d.getTime() > Date.now() - 1800e3)
      .sort((a, b) => a.d - b.d);
    if (!items.length) return '';
    const todayK = K.dayKey(new Date()), tomorrowK = K.dayKey(new Date(Date.now() + 864e5));
    const today = items.filter(x => K.dayKey(x.d) === todayK);
    if (today.length === 1) return `Hoy sale ${K.title(today[0].p)} a las ${K.hour(today[0].d)} 📅`;
    if (today.length > 1) return `Hoy salen ${today.length} posteos 📅 — ${today.map(x => K.hour(x.d)).join(' y ')}`;
    let hNow = 12;
    try { hNow = parseInt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: K.tz }), 10); } catch (e) {}
    const tomorrow = items.filter(x => K.dayKey(x.d) === tomorrowK);
    if (tomorrow.length && hNow >= 18) {
      return tomorrow.length === 1
        ? `Mañana sale ${K.title(tomorrow[0].p)} a las ${K.hour(tomorrow[0].d)} 📅`
        : `Mañana salen ${tomorrow.length} posteos 📅 — ${tomorrow.map(x => K.hour(x.d)).join(' y ')}`;
    }
    return '';
  } catch (e) { return ''; }
}

// Intent "¿qué sale esta semana?": la agenda, adentro del chat.
async function showWeekInChat() {
  const box = document.getElementById('chatBox');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', '<div class="chat-msg ai" id="chatWeekTyping">⏳ Revisando tu agenda…</div>');
  if (typeof chatScroll === 'function') chatScroll();
  let all = [];
  try { all = await api.get('/api/posts'); } catch (e) { all = []; }
  const el = document.getElementById('chatWeekTyping');
  if (el) el.remove();
  const K = chatAgendaKit();
  const items = all.filter(p => p.status === 'scheduled')
    .map(p => ({ p, d: K.parse(p.scheduled_at) }))
    .filter(x => !isNaN(x.d)).sort((a, b) => a.d - b.d);
  if (!items.length) { chatSayLocal('Todavía no tenés nada programado. ¿Te armo la semana? 👇'); return; }
  const todayK = K.dayKey(new Date()), tomorrowK = K.dayKey(new Date(Date.now() + 864e5));
  const lines = ['📅 Schedule:'];
  items.slice(0, 10).forEach(x => lines.push(`• ${K.dayLabel(x.d, todayK, tomorrowK)} ${K.hour(x.d)} — ${K.title(x.p)}`));
  chatSayLocal(lines.join('\n'));
  try { track('chat_week_summary'); } catch (e) {}
}

// Intent "¿qué preguntan en mis comentarios?": FAQs/objeciones/deseos del
// análisis de IG (ig-comments.js → ADN). Rioplatense, corto.
async function showCommentInsights() {
  const box = document.getElementById('chatBox');
  if (!box) return;
  box.insertAdjacentHTML('beforeend', '<div class="chat-msg ai" id="chatInsTyping">💬 Revisando qué preguntan en tus comentarios…</div>');
  if (typeof chatScroll === 'function') chatScroll();
  const done = () => { const el = document.getElementById('chatInsTyping'); if (el) el.remove(); };
  let dna = {};
  try { dna = await api.get('/api/dna'); } catch (e) { dna = {}; }
  const read = (d) => ({
    faqs: ((d && d.preguntas_frecuentes) || []).map(f => (f && f.pregunta) || f).filter(Boolean),
    objs: ((d && d.objeciones) || []).filter(Boolean),
    des: ((d && d.deseos) || []).filter(Boolean),
  });
  let r = read(dna);
  if (!r.faqs.length && !r.objs.length && !r.des.length) {
    const igOn = !!((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.ig_connected) ||
      (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.ig_user_id));
    if (!igOn) {
      done();
      chatSayLocal('Todavía no leí tus comentarios 💬 Conectá tu Instagram en Ajustes y los analizo todas las semanas.');
      return;
    }
    // Dispara el análisis en segundo plano (si está fresco, vuelve al instante).
    try { api.post('/api/ig/mine-comments', {}).catch(() => {}); } catch (e) {}
    done();
    chatSayLocal('Todavía no los analicé — ya me puse a leerlos 💬 Preguntame de nuevo en unos minutos.');
    return;
  }
  done();
  const lines = ['💬 Esto es lo que más aparece en tus comentarios:'];
  r.faqs.slice(0, 5).forEach((q, i) => lines.push(`${i + 1}. ${String(q).slice(0, 140)}`));
  if (r.objs.length) lines.push('', `Lo que más les frena: ${r.objs.slice(0, 3).join(' · ')}`);
  if (r.des.length) lines.push(`Lo que más quieren: ${r.des.slice(0, 3).join(' · ')}`);
  chatSayLocal(lines.join('\n'));
  try { track('chat_comment_insights'); } catch (e) {}
}

/* ---------- NIVEL DE LA MARCA DEL CLIENTE ---------- */
// El que sube de nivel es el LOGO DEL CLIENTE (100 XP por post publicado, 150 si es reel).
// Posty es el guía que festeja, no el protagonista: su avatar queda limpio, sin marcos ni badges.
const POSTA_LVL_NAMES = { 1: 'Recién llegado', 2: 'Aprendiz del feed', 3: 'Ritmo agarrado', 4: 'Contenido serio', 5: 'Máquina de contenido', 6: 'Cara visible', 7: 'Referente del rubro', 8: 'Imparable', 9: 'Ídolo local', 10: 'Leyenda del barrio' };

async function chatAvatarLevel() {
  let lv = null;
  try { lv = await api.get('/api/avatar-level'); } catch (e) {}
  if (!lv || !lv.ok) return;
  // Festejo de subida de nivel: una vez por nivel (el servidor guarda el seen).
  // Habla de la MARCA DEL CLIENTE, no de Posty.
  const unseen = (lv.unseenLevels || []).filter(n => n > 1);
  if (unseen.length) {
    const top = Math.max.apply(null, unseen);
    const tierMsg = lv.tier === 'gold' ? ' Tu logo ahora tiene marco de oro 🥇'
      : lv.tier === 'silver' ? ' Tu logo ahora tiene marco de plata 🥈'
      : lv.tier === 'bronze' ? ' Tu logo ahora tiene marco de bronce 🥉' : '';
    chatSayLocal(`¡Tu marca subió al nivel ${top}: ${POSTA_LVL_NAMES[top] || ''}! 🎉${tierMsg}`);
    try { track('brand_levelup', { level: top }); } catch (e) {}
    try { api.post('/api/avatar-level/seen', { levels: unseen }); } catch (e) {}
  }
}

// El nivel se ve en el logo del chat: badge "Nv N" sobre el avatar.
// Tap → modal con el progreso (nombre del nivel, barra, qué falta).
async function paintChatLevel() {
  const badge = document.getElementById('chomeLvl');
  const btn = document.getElementById('chomeLvlBtn');
  if (!badge || !btn) return;
  let lv = null;
  try { lv = await api.get('/api/avatar-level'); } catch (e) {}
  if (!lv || !lv.ok) { badge.hidden = true; return; }
  badge.hidden = false;
  badge.textContent = 'Nv ' + (lv.level || 1);
  btn.onclick = () => postyLevelModal(lv);
}
function postyLevelModal(lv) {
  const lvl = (lv && lv.level) || 1;
  const name = (lv && (lv.levelName || POSTA_LVL_NAMES[lvl])) || POSTA_LVL_NAMES[1] || '';
  const xp = (lv && lv.xp) || 0;
  let pct = 100, nextTxt = '👑 ¡Nivel máximo!';
  if (lv && lv.nextXp) {
    pct = Math.min(99, Math.round((xp / lv.nextXp) * 100));
    nextTxt = `${xp} de ${lv.nextXp} pts · próximo: ${esc(lv.nextName || '')}`;
  }
  streakModalShell(`
    <div class="stk-hero">
      <p class="stk-eyebrow">Nivel de Posty</p>
      <p class="stk-pts"><b>Nv ${lvl}</b> · ${esc(name)}</p>
      <div class="xp-bar" style="margin:12px auto;max-width:260px"><span style="width:${pct}%"></span></div>
      <p class="stk-next">${esc(nextTxt)}</p>
    </div>
    <p class="d" style="text-align:center">Cada posteo publicado suma: 100 pts por post, 150 por reel.</p>
    <button class="btn btn-ghost btn-block" id="lvlCloseBtn" style="margin-top:10px">Cerrar</button>`);
  const c = document.getElementById('lvlCloseBtn');
  if (c) c.onclick = () => closeStreakModal();
}

// Misiones de Posty: una activa por vez, narradas en el chat.
const POSTA_MISSION_DEFS = [
  { id: 'connect_ig', title: 'Conectá tu Instagram', why: 'Así publico por vos y leo tus comentarios.', cta: 'Conectar Instagram', go: '#/app/ajustes' },
  { id: 'photos', title: 'Subí fotos de tu negocio', why: 'Con tus fotos reales los posteos venden de verdad.', cta: 'Subir fotos', go: '#/app/schedule' },
  { id: 'dna', title: 'Contame de tu negocio', why: 'Dos minutos y te conozco a fondo.', cta: 'Contarle a Posty', go: '#/app/ajustes' },
  { id: 'first_post', title: 'Publicá tu primer posteo', why: 'El primero es el que más cuesta — después sale solo.', cta: 'Ver mis borradores', act: 'drafts' },
  { id: 'first_week', title: 'Programá tu primera semana', why: 'Un tap y toda la semana sale sola.', cta: '📅 Programar mi semana', act: 'schedule' },
  { id: 'comments', title: 'Respondé tus comentarios', why: 'Responder rápido trae clientes.', cta: 'Ver comentarios', act: 'comments' },
];

// Misión activa SIN tarjeta: solo el dato (para el aviso de una línea del saludo).
// Devuelve {active, newly, nowDone}. El festejo lo hace el llamador con chatSayLocal.
async function chatActiveMission(all) {
  const posts = Array.isArray(all) ? all : [];
  const published = posts.filter(p => p.status === 'published');
  const scheduled = posts.filter(p => p.status === 'scheduled');
  const igOn = !!((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.ig_connected));
  let photosN = 0, dnaComplete = false, pendingComments = 0;
  try {
    const [assets, dnaSt, com] = await Promise.all([
      api.get('/api/assets').catch(() => []),
      api.get('/api/dna/status').catch(() => ({})),
      igOn ? api.get('/api/comments').catch(() => ({})) : Promise.resolve({ comments: [] }),
    ]);
    photosN = (assets || []).filter(a => a.kind === 'photo').length;
    dnaComplete = !!(dnaSt && dnaSt.complete);
    pendingComments = ((com && com.comments) || []).length;
  } catch (e) {}
  const done = {
    connect_ig: igOn,
    photos: photosN > 0,
    dna: dnaComplete,
    first_post: published.length > 0,
    first_week: scheduled.length > 0 || published.length >= 3,
    comments: igOn && pendingComments === 0,
  };
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('posta_missions_done') || '[]'); } catch (e) { seen = []; }
  const nowDone = POSTA_MISSION_DEFS.filter(m => done[m.id]).map(m => m.id);
  const newly = nowDone.filter(id => !seen.includes(id));
  try { localStorage.setItem('posta_missions_done', JSON.stringify(Array.from(new Set(seen.concat(nowDone))))); } catch (e) {}
  const active = POSTA_MISSION_DEFS.find(m => !done[m.id]) || null;
  return { active, newly, nowDone };
}

async function renderDesignImage(o) {
  const cv = document.createElement('canvas');
  drawPost(cv, o);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  // FIX-FANTASMA: el diseño generado se registra como kind='design' (no 'photo')
  // para que el próximo "✨ Otro diseño" no lo tome como foto de fondo.
  const res = await fetch('/api/media?kind=design', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No pude subir la imagen 😅 Probá de nuevo');
  return data.path;
}
function slotDate(i) {
  return slotDate19(i, (SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires');
}

// ---------- Historias automáticas (1080x1920) ----------
// Foto a pleno + degradado + título: se ven nativas en el visor de historias.
function drawStory(canvas, o) {
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const pals = getPalettes();
  const pal = pals[o.pal] || pals[0];
  if (o.photoImg) {
    drawCover(ctx, o.photoImg, 0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, pal.c[0]); g.addColorStop(1, pal.c[1] || pal.c[0]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const dg = ctx.createLinearGradient(0, H * 0.42, 0, H);
  dg.addColorStop(0, 'rgba(10,30,51,0)');
  dg.addColorStop(1, 'rgba(10,30,51,.9)');
  ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.c[2] || pal.c[0]; // acento de la marca del cliente
  ctx.fillRect(W / 2 - 65, H - 600, 130, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 92px -apple-system, Inter, sans-serif';
  wrapText(ctx, o.title || 'Novedad', W - 160).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, H - 510 + i * 110));
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.font = '400 48px -apple-system, Inter, sans-serif';
  wrapText(ctx, o.subtitle || '', W - 200).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, H - 260 + i * 62));
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 44px -apple-system, Inter, sans-serif';
  ctx.fillText('@' + (o.handle || 'tunegocio'), W / 2, H - 100);
}
async function renderStoryImage(o) {
  const cv = document.createElement('canvas');
  drawStory(cv, o);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const res = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo subir la historia');
  return data.path;
}
// Horarios sugeridos para N borradores: a la hora de mayor audiencia del negocio,
// un día cada uno, salteando los días que ya tienen posteos programados.
function suggestSlots(n, scheduledPosts) {
  const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  const taken = new Set((scheduledPosts || []).map(p => tzDayKey(p.scheduled_at, tz)).filter(Boolean));
  const out = [];
  let off = 0, guard = 0;
  while (out.length < n && guard++ < 120) {
    const iso = slotDate19(off, tz); off++;
    const k = tzDayKey(iso, tz);
    if (k && !taken.has(k)) { taken.add(k); out.push(iso); }
  }
  while (out.length < n) out.push(slotDate19(off++, tz)); // respaldo: no dejar huecos
  return out;
}
// El último post de la semana del autopilot es un reel: 3 escenas con fotos
// del cliente (o diseños generados si no tiene) + textos de la idea.
async function autopilotReel(idea, photos, logoImg, palIdx, handle, idx, sub, onProgress) {
  const title = (idea.titulo || 'NOVEDAD').toUpperCase();
  const angle = String(sub || '').trim() || cortar(String(idea.titulo || ''), 90);
  const tipo = (idea && idea.tipo) || (typeof tipoFromText === 'function' ? tipoFromText(String(idea.titulo || '') + ' ' + String(idea.angulo || '')) : '');
  const refs = (photos || []).slice(0, 2).map(p => p.file_path).filter(Boolean);
  const usePhotos = (photos || []).length > 0;
  if (onProgress) onProgress('reel');
  const sceneImg = async (headline, text, k) => {
    // Nivel agencia: escena generada por el motor de conceptos (el titular ya va en la imagen,
    // por eso no se superpone texto). Con refs del usuario: mismo producto, otra escena.
    try {
      const cp = await aiConceptShot({ idea, tipo, headline, refs });
      if (cp) return { image_path: cp, text: '', duration: 3 };
    } catch (e) { if (isAiCapErr(e)) throw e; }
    // Fallback: como antes (foto del usuario o canvas)
    if (usePhotos) return { image_path: photos[(idx + k) % photos.length].file_path, text, duration: 3 };
    // Sin fotos: generamos el diseño y lo usamos como escena (ya trae texto, no duplicamos)
    const image_path = await renderDesignImage({
      tpl: DESIGN_TPLS[(idx + k) % DESIGN_TPLS.length], pal: palIdx,
      title: makeHeadline(headline || text, 5).toUpperCase() || 'NOVEDAD',
      subtitle: angle, handle, photoImg: null, logoImg,
    });
    return { image_path, text: '', duration: 3 };
  };
  // Escenas 1 y 2 en paralelo (cada una es una llamada al motor); la 3 es cierre de marca.
  const [s1, s2] = await Promise.all([sceneImg(title, title, 0), sceneImg(angle, angle, 1)]);
  const ctaText = handle ? '@' + handle : 'SEGUINOS 👇';
  const s3 = usePhotos
    ? { image_path: photos[(idx + 2) % photos.length].file_path, text: ctaText, duration: 3 }
    : { image_path: await renderDesignImage({ tpl: DESIGN_TPLS[(idx + 2) % DESIGN_TPLS.length], pal: palIdx, title: ctaText, subtitle: '', handle, photoImg: null, logoImg }), text: '', duration: 3 };
  const scenes = [s1, s2, s3];
  const r = await api.post('/api/videos', { scenes });
  return r.url;
}

// Crea UN borrador a partir de una idea (texto + diseño o reel).
// Lo usan el autopilot y el chat consultor. Nada se programa: todo va a revisión.
// Rotación de estilos de diseño: el autopilot y el chat generan los posteos
// con plantillas distintas para que la semana no se vea toda igual.
const DESIGN_TPLS = ['gradiente', 'claro', 'noche', 'promo', 'editorial', 'bold'];
let TPL_ROT = 0;
function pickTpl(idx, fromChat, topic) {
  if (fromChat) return DESIGN_TPLS[(TPL_ROT++) % DESIGN_TPLS.length];
  // Promo detectada → plantilla promo. Si no, rotación para que la semana varíe.
  if (topic && /promo|off|%|2x1|descuento|sale|oferta|liquidaci|cuotas/i.test(topic)) return 'promo';
  return DESIGN_TPLS[idx % DESIGN_TPLS.length];
}
// Lunes de esta semana (YYYY-MM-DD): define qué fotos cuentan como "nuevas".
function mondayKey(d) {
  const x = d ? new Date(d) : new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
// Product shot con IA basado en las fotos reales del cliente (aprende su producto).
async function aiProductShot(refs, idea) {
  const r = await api.post('/api/product-shot', { refs, idea: idea.titulo || '', angle: idea.angulo || '' });
  return r && r.path ? r.path : null;
}
// Infiere el tipo de contenido desde el texto (el motor de imágenes lo necesita;
// las ideas del chat y el creador manual no siempre traen tipo).
function tipoFromText(t) {
  const s = String(t || '').toLowerCase();
  if (/promo|off|%|2x1|descuento|sale|oferta|liquidaci|cuotas|precio/i.test(s)) return 'promo';
  if (/tip|consejo|c[oó]mo|gu[ií]a|aprende|aprend[eé]|truco|error/i.test(s)) return 'tip';
  if (/detr[aá]s|bastidores|cocina|taller|equipo|proceso/i.test(s)) return 'detras';
  if (/cliente|testimonio|rese[nñ]a|opini[oó]n|comunidad|gracias/i.test(s)) return 'social';
  return 'novedad';
}
// Titular corto y COMPLETO para la imagen: el título de la idea o la primera
// línea del caption, jamás cortado a mitad de oración (makeHeadline).
function pickHeadline(idea, caption = '') {
  const t = makeHeadline((idea && idea.titulo) || '', 6);
  if (t) return t;
  return makeHeadline(String(caption || '').split('\n')[0], 6);
}
// Motor de imágenes nivel agencia: concept shot generado con IA a partir de la
// idea y las fotos reales del cliente. Devuelve el path o null si falla
// (el llamador cae al flujo clásico sin romper nada).
async function aiConceptShot({ idea, tipo, headline, refs }) {
  // Posty GENERA la imagen siempre (como bamboo): 1 reintento ante fallos
  // transitorios. Si el tope diario de IA frenó (capped), se propaga el mensaje
  // amable y NO se cae a canvas en silencio.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await api.post('/api/concept-shot', { idea, tipo, headline, refs: refs || [] }, { timeout: 120000 });
      if (r && r.ok === false && r.capped) throw { aiCap: true, message: r.error || '' };
      if (r && r.path) return r.path;
    } catch (e) {
      if (e && e.aiCap) throw e;
      console.warn('[concept-shot] intento ' + (attempt + 1) + ' falló:', (e && e.message) || e);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.warn('[concept-shot] no disponible tras reintento, sigo con el flujo clásico');
  return null;
}
function isAiCapErr(e) { return !!(e && e.aiCap); }
async function draftFromIdea(idea, asVideo, idx = 0, useChatText = false, onProgress = null) {
  // Las fotos más nuevas van primero: las que sube esta semana (misión)
  // protagonizan los posteos, no adivinamos.
  const photos = assetPhotos().slice().reverse();
  const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
  const palIdx = defaultPal();
  const handle = (PROFILE || {}).ig_username || '';
  const tpl = pickTpl(idx, useChatText, idea.titulo);
  const out = await api.post('/api/generate', { topic: idea.titulo, tipo: idea.tipo });
  // Si viene del chat, se respeta el texto que el cliente eligió/editó (no se regenera)
  const chatTa = useChatText ? $('#chatCaption') : null;
  const chatHg = useChatText ? $('#chatHashtags') : null;
  const caption = (chatTa && chatTa.value.trim()) || out.caption || '';
  const hashtags = (chatHg && chatHg.value.trim()) || out.hashtags || '';
  let imagePath = null, mediaType = 'image';
  if (asVideo) {
    // Si el cliente subió sus propios videos, el reel ES su video (con nuestro texto).
    const vids = assetVideos();
    if (vids.length) {
      imagePath = vids[idx % vids.length].file_path;
      mediaType = 'video';
    } else {
      try {
        imagePath = await autopilotReel(idea, photos, logo, palIdx, handle, idx, out.suboverlay, onProgress);
        mediaType = 'video';
      } catch (e) { imagePath = null; /* fallback a diseño estático */ }
    }
  }
  if (!imagePath) {
    // Motor de imágenes nivel agencia: primero intenta un concept shot con IA
    // basado en las fotos reales del cliente (máx 2). Si falla, cae al flujo de siempre.
    if (onProgress) onProgress('image');
    const csPath = await aiConceptShot({
      idea,
      tipo: idea.tipo || tipoFromText(idea.titulo),
      headline: pickHeadline(idea),
      refs: photos.slice(0, 2).map(p => p.file_path),
    });
    if (onProgress) onProgress('base');
    if (csPath) imagePath = csPath;
  }
  if (!imagePath) {
    // Titular sobre la imagen: lo escribe la IA (con punch); fallback al tema truncado.
    const title = String(out.overlay || '').trim().toUpperCase()
      || makeHeadline(idea.titulo || 'NOVEDAD', 5).toUpperCase() || 'NOVEDAD';
    // La bajada la escribe la IA como copy real (suboverlay); el ángulo es un brief y nunca se imprime.
    const subtitle = String(out.suboverlay || '').trim() || cortar(String(caption || '').split('\n')[0], 90);
    // Fotos FRESCAS (subidas esta semana): protagonistas. Sin fotos nuevas pero con
    // historia: la IA genera una variación basada en sus fotos reales (aprende su producto).
    const wk = mondayKey();
    const fresh = photos.filter(p => (p.created_at || '').slice(0, 10) >= wk);
    const ph = fresh.length ? fresh[idx % fresh.length] : null;
    if (ph) {
      imagePath = await renderDesignImage({
        tpl, pal: palIdx, title, subtitle, handle,
        photoImg: await photoImg(ph.file_path), logoImg: logo,
      });
    } else if (photos.length) {
      try {
        imagePath = await aiProductShot(photos.slice(0, 2).map(p => p.file_path), idea);
      } catch (e) { imagePath = null; }
      if (!imagePath) {
        // Fallback: diseño con su foto más nueva (nunca se rompe la semana)
        imagePath = await renderDesignImage({
          tpl, pal: palIdx, title, subtitle, handle,
          photoImg: await photoImg(photos[0].file_path), logoImg: logo,
        });
      }
    } else {
      imagePath = await renderDesignImage({
        tpl, pal: palIdx, title, subtitle, handle, photoImg: null, logoImg: logo,
      });
    }
  }
  try {
    await api.post('/api/posts', { image_path: imagePath, caption, hashtags, media_type: mediaType, source_topic: idea.titulo || '', source_angle: idea.angulo || '', tipo: idea.tipo || '', strategy_why: idea.porque || '', script: Array.isArray(idea.script) ? idea.script.slice(0, 6) : undefined });
  } catch (e) {
    if (!String(e.message || '').includes('Ya creaste este posteo')) throw e;
  }
  return { imagePath, mediaType };
}

let AUTOPILOT_RUNNING = false;

async function runAutopilot(n, tag) {
  const t = tag || 'semana';
  // Anti-duplicación: una sola corrida a la vez (dos botones distintos usan el mismo data-autopilot)
  if (AUTOPILOT_RUNNING) return;
  AUTOPILOT_RUNNING = true;
  postyWorking(true);
  const apT0 = Date.now();
  track('autopilot_start', { n, tag: t }); track('week_generate_start', { n, tag: t });
  let prog = document.getElementById('apProg-' + t);
  if (!prog) {
    // El autopilot se disparó desde el home/chat sin la tarjeta renderizada
    // (ej: chip "Armame la semana" o modal de cupo): crear el contenedor de
    // progreso donde el usuario lo vea, si no todo muere en silencio.
    prog = document.createElement('div');
    prog.id = 'apProg-' + t;
    const box = document.getElementById('chatBox');
    if (box) box.prepend(prog);
    else {
      const home = document.querySelector('.hs-home');
      if (home) home.appendChild(prog);
      else document.body.prepend(prog);
    }
  }
  $$('[data-autopilot]').forEach(b => b.disabled = true);
  try {
    // Cupo del plan: chequear ANTES de gastar IA — ofrecer mejorar o armar parcial
    let quota = null;
    try { quota = await api.get('/api/quota'); } catch (e) {}
    if (quota && quota.left < n) {
      // Sin plan (prueba vencida): directo a la pantalla de los 3 planes, sin vueltas
      if (ME && ME.trial_expired) { showExpiredModal(); return; }
      if (quota.left <= 0) { quotaModal(quota); return; }
      quotaModal(quota, { onPartial: () => runAutopilot(quota.left, t) });
      return;
    }
    // Gate de ADN "no generar a ciegas": sin lo esencial del negocio (producto estrella,
    // cliente ideal, diferencial, tono) no generamos — saldrían posteos flojos o inventados.
    // El chat arranca solo la mini-entrevista (el backend la guía con needDna).
    let dnaGate = null;
    try { dnaGate = await api.get('/api/dna/status'); } catch (e) {}
    if (dnaGate && !dnaGate.complete) {
      const postsNow = await api.get('/api/posts').catch(() => []);
      const hasDrafts = postsNow.some(p => p.status === 'draft');
      prog.innerHTML = `<div class="okmsg">👋 Para que tu semana salga buena de verdad, charlemos 2 minutos de tu negocio 👇` +
        (hasDrafts ? `<br><button class="btn btn-ghost btn-sm" id="dnaGateLater-${t}" style="margin-top:10px">Hacerlo después →</button>` : '') +
        `</div>`;
      const laterBtn = document.getElementById('dnaGateLater-' + t);
      if (laterBtn) laterBtn.onclick = () => { prog.innerHTML = ''; };
      // Scrollear a la tarjeta del chat y mandar el primer mensaje con el flujo normal:
      // con el ADN vacío/parcial el needDna del backend arranca la entrevista solo.
      setTimeout(() => {
        const card = document.getElementById('autopilotCard-' + t) || document.getElementById('chatCard');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      setTimeout(() => {
        if (document.getElementById('chatBox')) chatExchange({ text: '¡Dale, charlemos de mi negocio! 👇' });
      }, 800);
      return;
    }
    // Si hay borradores sin revisar de una corrida anterior, preguntar antes de reemplazarlos
    const existing = await api.get('/api/posts');
    const oldDrafts = existing.filter(p => p.status === 'draft');
    if (oldDrafts.length) {
      const ok = confirm(`Hay ${oldDrafts.length} ${oldDrafts.length === 1 ? 'borrador sin revisar' : 'borradores sin revisar'}. ¿Los reemplazamos por una semana nueva?`);
      if (!ok) return;
      for (const d of oldDrafts) { try { await api.delete('/api/posts/' + d.id); } catch (e) {} }
      // Verificar que el borrado funcionó: si quedaron borradores, abortar y no crear nada encima
      const afterDelete = await api.get('/api/posts').catch(() => []);
      if (afterDelete.some(p => p.status === 'draft')) {
        prog.innerHTML = `<div class="err">⚠️ No se pudieron borrar los borradores anteriores. Probá de nuevo o usá 🗑️ Vaciar.</div>`;
        return;
      }
    } else {
      // Sin borradores pero con semana programada: no duplicar por accidente
      const scheduled = existing.filter(p => p.status === 'scheduled');
      if (scheduled.length) {
        const ok = confirm(`Ya tenés ${scheduled.length} ${scheduled.length === 1 ? 'posteo programado' : 'posteos programados'} esta semana. ¿Sumamos una tanda nueva de borradores para revisar?`);
        if (!ok) return;
      }
    }
    let ideas = IDEAS;
    if (!ideas.length) {
      prog.innerHTML = `<div class="okmsg">💡 Generando ideas para tu negocio...</div>`;
      const r = await api.post('/api/ideas', {});
      // Sin datos del negocio no generamos nada: primero el onboarding conversacional.
      // (Generar a ciegas es lo que produce posteos inventados que no son el negocio.)
      if (r.need_profile) {
        prog.innerHTML = `<div class="okmsg">👋 Para armar tu semana primero tengo que conocer tu negocio: <a href="#/app/onboarding" style="color:var(--cel);font-weight:700">charlamos 2 minutos</a> o <a href="#/app/schedule" style="color:var(--cel);font-weight:700">hacelo después →</a></div>`;
        return;
      }
      ideas = r.ideas || [];
      IDEAS = ideas;
    }
    const picks = ideas.slice(0, n);
    if (!picks.length) throw new Error('No hay ideas para programar');
    // Van saliendo en vivo: cada borrador aparece abajo a medida que se crea,
    // la espera se siente cero en vez de una barra infinita.
    const live = [];
    const liveHTML = () => live.length ? `<div class="live-strip">${live.map(d => `
      <div class="live-thumb">${d.mediaType === 'video'
        ? `<video src="${esc(d.imagePath)}" muted playsinline preload="metadata"></video><span class="live-badge">🎬</span>`
        : `<img src="${esc(d.imagePath)}" alt="Borrador listo">${d.mediaType === 'story' ? '<span class="live-badge">📱</span>' : ''}`}<span class="live-ok">✓</span></div>`).join('')}</div>
      <div class="hint" style="margin:4px 0 0">${live.length} ${live.length === 1 ? 'listo' : 'listos'} — en un toque los revisás 👇</div>` : '';
    // Brand kit del cliente: fotos rotadas + logo + paleta de marca
    // Generación en paralelo: pool de hasta 3 borradores a la vez (el reel entra
    // al mismo pool, no al final en serie). La semana sale en ~90s en vez de 5-10 min.
    const POOL_SIZE = 3;
    let quotaStopped = false, nextIdx = 0, doneCount = 0, firstErr = null;
    const poolRender = () => {
      // Mensaje de completitud desordenada: importa cuántos están listos, no cuál.
      prog.innerHTML = `<div class="okmsg">⏳ Creando… ${doneCount} de ${picks.length} listos</div>${liveHTML()}`;
    };
    async function apWorker() {
      while (!quotaStopped) {
        // Cancelación del auto-arranque (Track 3): si el usuario tocó Cancelar, no tomar más picks
        if (window.__autoWeekCancel) return;
        const i = nextIdx++; // sincrónico: ningún otro worker toma el mismo índice
        if (i >= picks.length) return;
        const idea = picks[i];
        const isReel = i === picks.length - 1; // el último post de la semana es un reel 🎬
        try {
          // onProgress: estado amable mientras el motor de imágenes trabaja ("🎨 Creando la imagen…")
          const created = await draftFromIdea(idea, isReel, i, false, (phase) => {
            const el = prog.querySelector('.okmsg');
            if (el) el.innerHTML = phase === 'image' ? '🎨 Creando la imagen…' : phase === 'reel' ? '🎬 Creando las escenas del reel…' : '⏳ Creando…';
          }); // borrador: el cliente revisa antes de programar
          if (created && created.imagePath) live.push(created);
        } catch (e) {
          // Si el cupo se agotó a mitad de la corrida: cartel de mejora y frenar el pool
          if (isPlanLimitErr(e)) {
            const q2 = await api.get('/api/quota').catch(() => null);
            quotaModal(q2 || { limit: 3, used: 3, left: 0, plan_name: '' });
            quotaStopped = true;
            return;
          }
          if (isAiCapErr(e)) {
            const msg = e.message || 'Llegamos al tope de IA de hoy \uD83D\uDD0B Seguimos ma\u00F1ana \uD83D\uDCAA';
            try { prog.innerHTML = `<div class="okmsg">${esc(msg)}</div>`; } catch (_) {}
            try { if (typeof chatSayLocal === 'function') chatSayLocal(msg); } catch (_) {}
            quotaStopped = true;
            return;
          }
          // Error de un borrador solo: se registra y la semana sigue con los demás
          if (!firstErr) firstErr = e;
          console.error('[autopilot] no se pudo crear el borrador "' + (idea.titulo || i) + '":', (e && e.message) || e);
        }
        doneCount++;
        poolRender();
      }
    }
    poolRender();
    await Promise.all(Array.from({ length: Math.min(POOL_SIZE, picks.length) }, apWorker));
    // Si no salió NINGÚN borrador, algo está roto: mostrar el error en vez de un festejo vacío
    if (firstErr && !live.length) throw firstErr;
    prog.innerHTML = `<div class="okmsg">🎉 ¡Tu semana está lista! La armé con tu marca y tu estilo 💪</div>${liveHTML()}`;
    // Chat-first: si el usuario está en el chat, la promesa "te aviso acá mismo"
    // se cumple acá — el aviso cae como mensaje de la IA (sin tarjetas: la
    // gestión vive en Mi semana) y se refrescan píldora + chips.
    try {
      if ((location.hash || '').startsWith('#/app/chat') && document.getElementById('chatBox')) {
        chatSayLocal('¡Tu semana está lista! 🎉 La dejé en Schedule para que la revises — mirala con amor que la hice para vos 👇');
        if (typeof refreshWeekPill === 'function') refreshWeekPill().then(() => {
          try { renderQuickChips(REVIEW_DRAFTS, [], false); } catch (e) {}
        });
      }
    } catch (e) {}
    // Historias + reels del plan: los genera el servidor (ffmpeg) en segundo plano
    // con las imágenes recién creadas. Se programan junto con la semana:
    // más presencia, cero trabajo extra. Caen en "Revisá tu semana" al refrescar.
    // (Las historias no consumen cupo; si el cupo frenó la corrida, tampoco se crean.)
    if (!quotaStopped) try {
      prog.innerHTML = `<div class="okmsg">⏳ Creando tus historias y reels ✨...</div>${liveHTML()}`;
      api.post('/api/posts/generate-extras', {}).catch((e) => console.error('[extras]', e.message));
      prog.innerHTML = `<div class="okmsg">🎉 ¡Tu semana está lista! La armé con tu marca y tu estilo 💪</div>${liveHTML()}`;
    } catch (e) { console.error('[extras]', e.message); }
    track('week_generate_done', { count: live.length, ms: Date.now() - apT0, tag: t });
    // Racha: registrar la semana armada (idempotente por semana)
    let sk = null;
    try { sk = await api.post('/api/streak/week-armed', {}); } catch (e) {}
    setTimeout(() => {
      // Al terminar, caés directo sobre tus borradores (ya no hay que buscarlos)
      render();
      // La IA pide las fotos POR CHAT, como un amigo — nada de tarjetas.
      api.post('/api/proactive-shot-ask', {}).then(r => { if (r && r.asked) chatLoadHistory(); }).catch(() => {});
      setTimeout(() => { const rc = $('#reviewCard'); if (rc) rc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
      if (sk && sk.newWeek) setTimeout(() => showStreakCelebration(sk), 600);
    }, 900);
  } catch (e) {
    // 429 = tope amable de Posty (rate limit / kill-switch): se muestra tal cual, sin "Error:".
    const friendly = e && (e.status === 429);
    prog.innerHTML = friendly ? `<div class="okmsg">${esc(e.message)}</div>` : `<div class="err">Error: ${esc(e.message)}</div>`;
  } finally {
    // Cubrir todos los returns tempranos: la corrida terminó (o abortó)
    AUTOPILOT_RUNNING = false;
    postyWorking(false);
    $$('[data-autopilot]').forEach(b => b.disabled = false);
  }
}

function bindVaciarDrafts() {
  const b = document.getElementById('btnVaciarDrafts');
  if (!b) return;
  b.onclick = async () => {
    const ok = confirm('¿Borrar TODOS los borradores y armarlos de nuevo con otro enfoque?');
    if (!ok) return;
    b.disabled = true;
    b.textContent = '⏳ Vaciando…';
    // Track 4 (agregado): Vaciar ya no solo borra — reconstruye la semana con
    // OTRO enfoque (los borradores se marcan como rejected en el servidor y la
    // exclusión de 60 días hace que la nueva tanda use otros ángulos/tipos).
    let r = null;
    try {
      // Si está revisando la N+1 (teaser), el Vaciar reconstruye esa semana.
      const shownWk = (typeof NEXTWEEK_VIEW !== 'undefined' && NEXTWEEK_VIEW && REVIEW_DRAFTS.length && REVIEW_DRAFTS[0].week_key)
        ? REVIEW_DRAFTS[0].week_key : null;
      r = await api.post('/api/posts/rebuild-week', shownWk ? { week_key: shownWk } : {});
    }
    catch (e) { alert('⚠️ ' + (e.message || 'No se pudo vaciar. Probá de nuevo.')); render(); return; }
    track('drafts_emptied', { count: (typeof REVIEW_DRAFTS !== 'undefined' ? REVIEW_DRAFTS.length : 0) });
    await render(); // el DOM se escribe tras los awaits: la barrita va después
    if (r && r.rebuilding) rebuildWatchStart();
    else if (r && r.reason === 'frustrated') rebuildFrustrated();
  };
}

// Track 4 (agregado): barrita sutil de "reconstruyendo" (mismo patrón visual
// que autoWeekBar del Track 3). La generación corre en el servidor; acá se
// muestra el progreso y se espera a que aparezcan los borradores nuevos.
let __rebuildPoll = null;
function rebuildWatchStart() {
  if (document.getElementById('rebuildBar')) return;
  const main = document.querySelector('.main');
  if (!main) return;
  const bar = document.createElement('div');
  bar.id = 'rebuildBar';
  bar.setAttribute('role', 'status');
  bar.setAttribute('style', 'display:flex;align-items:center;gap:10px;background:#ffffff;border:1.5px solid rgba(39,147,200,.4);border-radius:14px;padding:10px 12px;margin:0 0 12px;font-size:12.5px;line-height:1.4;box-shadow:0 2px 12px rgba(39,147,200,.10)');
  bar.innerHTML = '<span style="font-size:16px">🔄</span>' +
    '<span style="flex:1;min-width:0"><b>Armando de nuevo con otro enfoque…</b><br><span style="color:var(--mut);font-size:11.5px">Tus borradores aparecen acá abajo cuando estén listos 👇</span></span>';
  main.prepend(bar);
  if (__rebuildPoll) clearInterval(__rebuildPoll);
  let waited = 0;
  __rebuildPoll = setInterval(async () => {
    waited += 5000;
    let drafts = [];
    try { drafts = await api.get('/api/posts?status=draft'); } catch (e) {}
    if (drafts.length) {
      clearInterval(__rebuildPoll); __rebuildPoll = null;
      const b2 = document.getElementById('rebuildBar'); if (b2) b2.remove();
      render();
      return;
    }
    if (waited >= 6 * 60 * 1000) {
      clearInterval(__rebuildPoll); __rebuildPoll = null;
      const b3 = document.getElementById('rebuildBar');
      if (b3) b3.innerHTML = '<span style="font-size:16px">⏳</span><span style="flex:1;min-width:0">Está tardando más de lo normal — si en unos minutos no aparecen, contame en el chat 👇</span>';
    }
  }, 5000);
}
// Track 4 (agregado): tope de 2 reconstrucciones/semana alcanzado. Se frena y
// se deriva al chat preguntando qué no cierra. Los rejected que se marcaron al
// vaciar alimentan la detección de frustración del chat (3+ rejected), así que
// el próximo mensaje del usuario ya entra en modo frustración solo.
function rebuildFrustrated() {
  const main = document.querySelector('.main');
  if (main && !document.getElementById('rebuildFrust')) {
    const d = document.createElement('div');
    d.id = 'rebuildFrust';
    d.className = 'card';
    d.setAttribute('style', 'border:1.5px solid #FEC14D;background:#FFF9EC;margin:0 0 12px');
    d.innerHTML = '<h3 style="margin:0 0 4px">🛑 Frenemos un toque</h3>' +
      '<p style="margin:0 0 12px;color:var(--mut);font-size:12.5px">Ya armamos tu semana 2 veces y la vaciaste de nuevo — regenerar a ciegas sería quemar tu tiempo y tu plata.</p>' +
      '<a class="btn btn-primary btn-sm" href="#/app/chat">💬 Contame en el chat qué no te cierra</a>';
    main.prepend(d);
  }
}

function bindAutopilot() {
  $$('[data-autopilot]').forEach(b => b.onclick = () => {
    const t = b.dataset.autopilot || 'semana';
    const sel = document.getElementById('apCount-' + t);
    runAutopilotSmart(sel ? +sel.value : ((ME && ME.posts_per_week) || 3), t);
  });
}

// El plan se aplica en silencio: el cliente toca un botón, nosotros nos ocupamos del resto.
async function runAutopilotSmart(n, t) {
  let plan = [];
  try { const r = await api.get('/api/weekly-plan'); plan = (r && r.plan) || []; } catch (e) {}
  if (!Array.isArray(plan) || !plan.length) return runAutopilot(n, t);
  try {
    if (!IDEAS.length) {
      const r = await api.post('/api/ideas', {});
      IDEAS = (r && r.ideas) || [];
    }
  } catch (e) {}
  if (IDEAS.length) {
    const byTipo = {};
    IDEAS.forEach(idea => { const tt = (idea && idea.tipo) || 'novedad'; (byTipo[tt] = byTipo[tt] || []).push(idea); });
    const used = new Set(), ordered = [];
    plan.forEach(p => {
      const pt = (p && p.serie_tipo) || (p && p.tipo);
      const cand = (byTipo[pt] || []).find(i => !used.has(i));
      if (cand) { used.add(cand); ordered.push(cand); }
    });
    IDEAS.forEach(i => { if (!used.has(i)) ordered.push(i); });
    IDEAS = ordered;
  }
  runAutopilot(n, t);
}



/* ---------- MIS FOTOS ---------- */
/* ---------- Logo: acepta imagen, PDF o Word → se convierte a PNG en el dispositivo ---------- */
function loadScriptOnce(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[data-lib="' + src + '"]')) return res();
    const s = document.createElement('script');
    s.src = src;
    s.setAttribute('data-lib', src);
    s.onload = () => res();
    s.onerror = () => rej(new Error('No se pudo cargar la herramienta de conversión. Revisá tu conexión e intentá de nuevo.'));
    document.head.appendChild(s);
  });
}
function cancelledErr() { const e = new Error('cancelado'); e.cancelled = true; return e; }
async function pdfToPngBlob(file) {
  const V = '3.11.174';
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V + '/pdf.min.js');
  const lib = window.pdfjsLib;
  if (!lib) throw new Error('No se pudo leer el PDF');
  lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + V + '/pdf.worker.min.js';
  const data = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data }).promise;
  const pg1 = await pdf.getPage(1);
  const v1 = pg1.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 1600 / Math.max(v1.width, v1.height));
  const vp = pg1.getViewport({ scale });
  const cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
  await pg1.render({ canvasContext: cx, viewport: vp }).promise;
  try { await pdf.destroy(); } catch (_) {}
  return await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('No se pudo convertir el PDF')), 'image/png'));
}
function pickLogoImage(imgs) {
  return new Promise((resolve, reject) => {
    const ov = document.createElement('div');
    ov.setAttribute('style', 'position:fixed;inset:0;background:rgba(10,30,51,.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px');
    const box = document.createElement('div');
    box.setAttribute('style', 'background:#fff;border-radius:18px;padding:18px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)');
    box.innerHTML = '<div style="font-weight:800;font-size:14px;margin-bottom:4px">Elegí tu logo</div>' +
      '<div style="font-size:11.5px;color:#47617A;margin-bottom:12px">Tu Word tiene varias imágenes. Tocá la que sea tu logo.</div>';
    const grid = document.createElement('div');
    grid.setAttribute('style', 'display:grid;grid-template-columns:1fr 1fr;gap:10px;max-height:44vh;overflow:auto');
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-soft btn-sm';
    cancel.setAttribute('style', 'margin-top:12px;width:100%');
    cancel.textContent = 'Cancelar';
    box.appendChild(grid); box.appendChild(cancel); ov.appendChild(box);
    const close = (fn) => { try { document.body.removeChild(ov); } catch (_) {} imgs.forEach(i => { try { URL.revokeObjectURL(i.url); } catch (_) {} }); fn(); };
    imgs.forEach(im => {
      const b = document.createElement('button');
      b.setAttribute('style', 'border:2px solid #E3EEF6;border-radius:12px;background:#fff;padding:8px;cursor:pointer');
      const im2 = document.createElement('img');
      im2.src = im.url; im2.alt = im.name;
      im2.setAttribute('style', 'width:100%;height:90px;object-fit:contain;pointer-events:none');
      b.appendChild(im2);
      b.onclick = () => close(() => resolve(im.blob));
      grid.appendChild(b);
    });
    cancel.onclick = () => close(() => reject(cancelledErr()));
    ov.addEventListener('click', (e) => { if (e.target === ov) close(() => reject(cancelledErr())); });
    document.body.appendChild(ov);
  });
}
async function docxToPngBlob(file) {
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const JZ = window.JSZip;
  if (!JZ) throw new Error('No se pudo leer el Word');
  const zip = await JZ.loadAsync(file);
  const okExt = /\.(png|jpe?g|webp|gif)$/i;
  const found = [];
  const jobs = [];
  zip.forEach((rel, ze) => {
    if (!ze.dir && /^word\/media\//i.test(rel) && okExt.test(rel)) {
      jobs.push(ze.async('blob').then(b => { if (b && b.size) found.push({ name: rel.split('/').pop(), blob: b, url: '' }); }));
    }
  });
  await Promise.all(jobs);
  if (!found.length) throw new Error('No encontramos imágenes dentro del Word. Probá con un PDF o una foto del logo.');
  found.forEach(f => { f.url = URL.createObjectURL(f.blob); });
  if (found.length === 1) { const b = found[0].blob; try { URL.revokeObjectURL(found[0].url); } catch (_) {} return b; }
  return pickLogoImage(found);
}
/* Siempre devuelve un File de imagen: PDF/Word se convierten, imagen pasa directo */
async function logoFileToImage(file) {
  const nm = (file.name || '').toLowerCase();
  const tp = file.type || '';
  const isPdf = tp === 'application/pdf' || nm.endsWith('.pdf');
  const isDocx = nm.endsWith('.docx') || tp === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (isPdf) return new File([await pdfToPngBlob(file)], 'logo.png', { type: 'image/png' });
  if (isDocx) return new File([await docxToPngBlob(file)], 'logo.png', { type: 'image/png' });
  if (tp.startsWith('image/')) return file;
  throw new Error('Ese formato no lo aceptamos. Subí una imagen, un PDF o un Word.');
}

/* ---------- CALENDARIO / HISTORIAL ---------- */
function badge(s) {
  const map = { scheduled: 'b-scheduled', published: 'b-published', failed: 'b-failed', draft: 'b-draft', cancelled: 'b-cancelled', publishing: 'b-scheduled' };
  const label = { scheduled: 'Programado', published: 'Publicado', failed: 'Falló', draft: 'Borrador', cancelled: 'Cancelado', publishing: 'Publicando…' };
  return `<span class="badge ${map[s] || 'b-draft'}">${label[s] || s}</span>`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  // Los datetimes de SQLite vienen en UTC sin zona ('2026-09-27 02:52:00'): marcarlos Z para que el navegador los pase a hora local.
  // Los de 16 chars ('YYYY-MM-DDTHH:MM') vienen de un input datetime-local: ya son hora local, no tocar.
  let s = iso.length === 16 ? iso : iso.replace(' ', 'T');
  if (iso.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  const d = new Date(s);
  return d.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// "mañana a las 19:00" / "el miércoles 30 a las 19:00"
function relDay(iso) {
  if (!iso) return '—';
  let s = iso.length === 16 ? iso : iso.replace(' ', 'T');
  if (iso.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  const d = new Date(s);
  if (isNaN(d)) return fmtDate(iso);
  const now = new Date();
  const dayOnly = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dayOnly(d) - dayOnly(now)) / 86400000);
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (diff <= 0) return `hoy a las ${time}`;
  if (diff === 1) return `mañana a las ${time}`;
  return `el ${d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })} a las ${time}`;
}
// Errores técnicos de Meta/IG traducidos a lenguaje humano
function humanError(err) {
  if (!err) return '';
  const e = String(err);
  if (/only photo or video/i.test(e)) return 'Instagram no pudo leer la imagen. Reintentá en unos minutos.';
  if (/no está accesible en internet|no pudo descargar la imagen/i.test(e)) return 'La imagen no está accesible — Instagram no la pudo descargar. Regenerá la imagen desde el posteo.';
  if (/190|token.*expir|invalid.+token|oauth/i.test(e)) return 'Tu conexión con Instagram venció. Reconectala en Ajustes → Instagram.';
  if (/permission|scope|not authorized/i.test(e)) return 'Falta un permiso de Instagram. Reconectá tu cuenta en Ajustes.';
  if (/429|rate limit/i.test(e)) return 'Instagram nos pidió esperar un poco. Reintentá en unos minutos.';
  if (/timeout|network|econn|fetch failed/i.test(e)) return 'Hubo un problema de conexión. Reintentá en unos minutos.';
  return 'No se pudo publicar en Instagram. Reintentá o reconectá tu cuenta.';
}
// Lightbox: ver el diseño en grande (tap en la miniatura)
function openLightbox(src, isVideo) {
  let lb = $('#lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.innerHTML = `<div class="lb-backdrop"></div><div class="lb-content"></div><button class="lb-close" aria-label="Cerrar">✕</button>`;
    document.body.appendChild(lb);
    lb.querySelector('.lb-backdrop').onclick = closeLightbox;
    lb.querySelector('.lb-close').onclick = closeLightbox;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
  }
  lb.querySelector('.lb-content').innerHTML = isVideo
    ? `<video src="${esc(src)}" controls autoplay playsinline style="max-width:92vw;max-height:84vh;border-radius:12px"></video>`
    : `<img src="${esc(src)}" alt="Diseño" style="max-width:92vw;max-height:84vh;border-radius:12px;object-fit:contain">`;
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const lb = $('#lightbox');
  if (lb) { lb.style.display = 'none'; lb.querySelector('.lb-content').innerHTML = ''; }
  document.body.style.overflow = '';
}
function postItem(p, actions) {
  const thumb = p.media_type === 'video'
    ? `<video class="thumb" src="${esc(p.image_path)}" muted preload="metadata" style="object-fit:cover" data-lightbox="${esc(p.image_path)}" data-video="1"></video>`
    : `<img class="thumb" src="${esc(p.image_path)}" data-lightbox="${esc(p.image_path)}">`;
  const vtag = p.media_type === 'video' ? `<span class="badge b-scheduled">🎬 video</span>` : p.media_type === 'story' ? `<span class="badge b-scheduled">📱 historia</span>` : '';
  const capFull = (p.caption || '').trim();
  const capFirst = esc(capFull.split('\n')[0] || '(sin texto)');
  const hasMore = capFull.includes('\n') || (p.hashtags || '').trim();
  return `<div class="post-item">
    ${thumb}
    <div class="info">
      <div class="cap" ${hasMore ? 'data-cap' : ''}>${capFirst}${hasMore ? ' <span class="more-hint">ver más ▾</span>' : ''}</div>
      ${hasMore ? `<div class="full-cap" style="display:none">${esc(capFull)}${p.hashtags ? `<div class="full-tags">${esc(p.hashtags)}</div>` : ''}</div>` : ''}
      <div class="meta">${vtag}${badge(p.status)}
        ${p.scheduled_at && p.status === 'scheduled' ? `<span>📅 ${fmtDate(p.scheduled_at)}</span>` : ''}
        ${p.published_at ? `<span>✅ ${fmtDate(p.published_at)}</span>` : ''}
        ${p.ig_permalink && !p.ig_permalink.includes('/demo_') ? `<a href="${esc(p.ig_permalink)}" target="_blank" style="color:var(--cel)">Ver en IG ↗</a>` : ''}
        ${p.error ? `<span style="color:#D64545" title="${esc(p.error)}">${esc(humanError(p.error))}</span>` : ''}
      </div>
    </div>
    <div class="acts">${actions}</div>
  </div>`;
}
/* ---------- Publicar ahora (instantáneo, con progreso en vivo) ---------- */
// Tarjeta de aprobación antes de publicar (pedido de Valentino 2026-09-29):
// el cliente ve imagen + texto + cuenta destino y da el OK explícito.
// Nada se publica sin esta aprobación.
function publishApproveSheet(postId) {
  return new Promise(async (resolve) => {
    let post = null;
    try { post = (await api.get(`/api/posts/${postId}`)).post; } catch (e) {}
    if (!post) { resolve(false); return; }
    const prof = (typeof PROFILE !== 'undefined' && PROFILE) || {};
    const igOn = !!prof.ig_connected;
    const handle = prof.ig_username || '';
    const img = post.image_path ? esc(post.image_path) : '';
    const cap = String(post.caption || '');
    const tags = String(post.hashtags || '');
    const full = (cap + (tags ? '\n' + tags : '')).trim();
    const ov = document.createElement('div');
    ov.className = 'pubsheet-ov';
    ov.innerHTML =
      '<div class="pubsheet" role="dialog" aria-modal="true">' +
      '<div class="pubsheet-grip"></div>' +
      '<div class="pubsheet-title">\u00BFPublicar en Instagram?</div>' +
      '<div class="pubsheet-sub">' + (igOn && handle ? `Se publica en <b>@${esc(handle)}</b>` : 'Todav\u00EDa no conectaste tu Instagram') + '</div>' +
      '<div class="pubsheet-body">' +
        (img ? `<img class="pubsheet-img" src="${img}" alt="Vista previa del posteo">` : '') +
        `<div class="pubsheet-cap">${esc(full.length > 240 ? full.slice(0, 240) + '\u2026' : full)}</div>` +
      '</div>' +
      '<div class="pubsheet-row">' +
        '<button class="btn btn-soft" data-ps="no">Cancelar</button>' +
        (igOn ? '<button class="btn btn-primary" data-ps="yes">Publicar</button>'
              : '<button class="btn btn-primary" data-ps="connect">Conectar Instagram</button>') +
      '</div></div>';
    const done = (v) => { try { ov.remove(); } catch (e) {} resolve(v); };
    ov.querySelector('[data-ps="no"]').onclick = () => done(false);
    const yes = ov.querySelector('[data-ps="yes"]');
    if (yes) yes.onclick = () => done(true);
    const conn = ov.querySelector('[data-ps="connect"]');
    if (conn) conn.onclick = () => { done(false); try { igConnect(); } catch (e) { location.hash = '#/app/ajustes'; } };
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
    document.body.appendChild(ov);
  });
}

async function publishNowFlow(postId, mount) {
  const approved = await publishApproveSheet(postId);
  if (!approved) return { ok: false, cancelled: true };
  const steps = ['Preparando imagen', 'Publicando en Instagram'];
  const paint = (activeIdx, doneAll, err) => {
    mount.innerHTML = `<div class="pubnow">` +
      steps.map((s, i) => {
        const cls = doneAll || i < activeIdx ? 'done' : (i === activeIdx ? 'active' : '');
        const icon = doneAll || i < activeIdx ? '✅' : (i === activeIdx ? '⏳' : '○');
        return `<div class="pubnow-step ${cls}"><span>${icon}</span><span>${s}…</span></div>`;
      }).join('') +
      (err ? `<div class="err">${esc(humanError(err))}</div><button class="btn btn-soft btn-sm" data-pnretry="${postId}">Reintentar</button>` : '') +
      `</div>`;
    const rb = mount.querySelector('[data-pnretry]');
    if (rb) rb.onclick = () => publishNowFlow(postId, mount);
  };
  paint(0, false);
  try {
    await api.post(`/api/posts/${postId}/publish-now`, {});
  } catch (e) {
    paint(0, false, e.message);
    return { ok: false };
  }
  const t0 = Date.now();
  while (Date.now() - t0 < 3.5 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 2500));
    let st;
    try { st = (await api.get(`/api/posts/${postId}`)).post; }
    catch (e) { continue; }
    if (st.status === 'published') {
      track('post_publish', { id: postId });
      mount.innerHTML = `<div class="okmsg">✅ ¡Publicado en Instagram! ${st.ig_permalink ? `<a href="${esc(st.ig_permalink)}" target="_blank" style="color:#2793C8">Ver en IG ↗</a>` : ''}</div>`;
      return { ok: true, permalink: st.ig_permalink };
    }
    if (st.status === 'failed' || st.status === 'cancelled') {
      paint(1, false, st.error || 'Se canceló la publicación.');
      return { ok: false };
    }
    paint(Date.now() - t0 > 9000 ? 1 : 0, false);
  }
  mount.innerHTML = `<div class="okmsg">⏳ Sigue publicándose… lo ves en Schedule en un minuto.</div>`;
  return { ok: true, pending: true };
}

/* ============================================================
   FAST-TRACK "Tu primer posteo" (Track A)
   Hero card de Mi semana: 3 micro-pasos —
   (1) elegir favorito entre 3 candidatos, (2) subir UNA foto opcional,
   (3) publicar. La VISIBILIDAD la decide Track C: reemplaza heroCard
   por fastTrackCardHTML(candidates) cuando aplique.
   ============================================================ */
let FT = null; // estado en vivo de la tarjeta: { sel, candidates, photoDone, publishing }

function ftCandTitle(c) {
  const t = String(c.source_topic || '').trim();
  if (t) return cortar(t, 42);
  const cap = String(c.caption || '').split('\n')[0].trim();
  return cap ? cortar(cap, 42) : 'Posteo';
}

function fastTrackCardHTML(candidates) {
  const cands = (Array.isArray(candidates) ? candidates : []).filter(Boolean).slice(0, 3);
  if (!cands.length) return '';
  // El primero va preseleccionado: un tap menos, la elección se puede cambiar.
  FT = { sel: cands[0].id, candidates: cands, photoDone: false, photoPath: null, publishing: false };
  const connected = !!(PROFILE && PROFILE.ig_connected);
  return `
  <div class="card ft-card" id="fastTrackCard">
    <div class="ft-head">
      <div class="ft-title">🚀 Tu primer posteo</div>
      <div class="ft-sub">Elegí uno, publicalo, y listo — sale en tu Instagram.</div>
    </div>
    <div class="ft-step"><div class="ft-stepn">1</div><div class="ft-stepbody">
      <div class="ft-stept">Elegí tu favorito</div>
      <div class="ft-cands">
        ${cands.map(c => `
        <button type="button" class="ft-cand${c.id === FT.sel ? ' sel' : ''}" data-ftpick="${c.id}" aria-pressed="${c.id === FT.sel}">
          <span class="ft-thumb">${c.image_path ? `<img src="${esc(c.image_path)}" data-ftthumb="${c.id}" alt="">` : `<span class="ft-nothumb">🖼️</span>`}<span class="ft-check">✓</span></span>
          <span class="ft-candt">${esc(ftCandTitle(c))}</span>
        </button>`).join('')}
      </div>
    </div></div>
    <div class="ft-step"><div class="ft-stepn">2</div><div class="ft-stepbody">
      <div class="ft-stept">Una foto <span style="font-weight:400;color:var(--mut)">(opcional)</span></div>
      <button type="button" class="btn btn-soft ft-upload" id="ftPhotoBtn">📷 Subí una foto de lo que vendés</button>
      <input type="file" id="ftPhotoInput" accept="image/*" style="display:none">
      <div class="ft-photo-st" id="ftPhotoSt">Si subís una foto tuya, la usamos en el posteo.</div>
      <button type="button" class="ft-skip" id="ftPhotoSkip">saltear →</button>
    </div></div>
    <div class="ft-step"><div class="ft-stepn">3</div><div class="ft-stepbody">
      <div class="ft-stept">Publicar</div>
      ${connected
        ? `<button type="button" class="btn btn-primary btn-block ft-pub" id="ftPublish">🚀 Publicar ahora</button>`
        : `<button type="button" class="btn btn-primary btn-block ft-pub" id="ftConnect">📸 Conectar Instagram</button>
           <div class="ft-hint">Primero conectá tu Instagram; después publicás con un tap.</div>`}
      <div id="ftPubMount"></div>
    </div></div>
  </div>`;
}

function bindFastTrack() {
  const card = document.getElementById('fastTrackCard');
  if (!card || !FT) return;
  // Handlers asignados (no addEventListener): el bind corre en cada render,
  // el DOM se reconstruye y no se duplican.
  // Paso 1: elegir / cambiar favorito
  card.querySelectorAll('[data-ftpick]').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.ftpick);
      FT.sel = id;
      card.querySelectorAll('[data-ftpick]').forEach(b => {
        const on = Number(b.dataset.ftpick) === id;
        b.classList.toggle('sel', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    };
  });
  // Paso 2: foto opcional
  const fileInput = document.getElementById('ftPhotoInput');
  const photoBtn = document.getElementById('ftPhotoBtn');
  const photoSkip = document.getElementById('ftPhotoSkip');
  const photoSt = document.getElementById('ftPhotoSt');
  const setSt = (html) => { if (photoSt) photoSt.innerHTML = html; };
  if (photoBtn && fileInput) photoBtn.onclick = () => fileInput.click();
  if (photoSkip) photoSkip.onclick = () => {
    FT.photoDone = true;
    setSt('✅ Listo — sale con la imagen que armó la IA.');
    photoSkip.style.display = 'none';
    if (photoBtn) photoBtn.style.display = 'none';
  };
  if (fileInput) fileInput.onchange = async () => {
    const f = fileInput.files[0]; if (!f) return;
    if (!f.type.startsWith('image/')) { setSt('❌ Elegí un archivo de imagen.'); return; }
    const sel = FT.candidates.find(c => c.id === FT.sel) || FT.candidates[0];
    if (photoBtn) photoBtn.style.display = 'none';
    if (photoSkip) photoSkip.style.display = 'none';
    try {
      setSt('⏳ Subiendo…');
      const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
      const newPath = data.path;
      setSt('🎨 Mejorando la imagen…');
      const improved = await aiConceptShot({
        idea: { titulo: sel.source_topic || '', porque: sel.strategy_why || '', angulo: sel.source_angle || '' },
        tipo: sel.tipo || '',
        headline: ftCandTitle(sel),
        refs: [newPath],
      });
      const finalPath = improved || newPath;
      await api.patch('/api/posts/' + sel.id, { action: 'save-draft', image_path: finalPath });
      sel.image_path = finalPath;
      const rd = (typeof REVIEW_DRAFTS !== 'undefined' ? REVIEW_DRAFTS : []).find(x => x.id === sel.id);
      if (rd) rd.image_path = finalPath;
      const thumb = card.querySelector(`[data-ftthumb="${sel.id}"]`);
      if (thumb && thumb.tagName === 'IMG') thumb.src = finalPath;
      FT.photoDone = true; FT.photoPath = finalPath;
      setSt('✅ Listo — tu foto ya está en el posteo.');
    } catch (e) {
      // Nunca bloquear: se sigue con la imagen original.
      setSt(isAiCapErr(e) ? '🔋 ' + (e.message || 'Llegamos al tope de IA de hoy — seguimos mañana 💪') : '😅 No pudimos mejorar la foto esta vez — sale con la imagen original, igual va a quedar bien.');
      FT.photoDone = true;
    }
  };
  // Paso 3: publicar (o conectar primero)
  const conn = document.getElementById('ftConnect');
  if (conn) conn.onclick = () => { igConnectHere(); };
  const pub = document.getElementById('ftPublish');
  if (pub) pub.onclick = async () => {
    if (FT.publishing) return;
    // Chequeo de cupo con el patrón existente (modal de mejora si no hay cupo).
    const hasQuota = await checkQuotaOrModal();
    if (!hasQuota) return;
    const sel = FT.candidates.find(c => c.id === FT.sel) || FT.candidates[0];
    if (!sel) return;
    FT.publishing = true;
    pub.disabled = true;
    pub.textContent = '⏳ Publicando…';
    const mount = document.getElementById('ftPubMount');
    const res = await publishNowFlow(sel.id, mount);
    if (res && res.ok) {
      // Magia lograda: refrescamos la pantalla y festejamos.
      try { render(); } catch (e) { /* sigue el modal igual */ }
      streakModalShell(`
        <div class="big-emoji">🎉</div>
        <h3 style="margin:12px 0 4px">¡Tu primer posteo está saliendo!</h3>
        <p class="d" style="font-size:14px">Ya está publicado (o publicándose) en tu Instagram.<br>Mientras sale, <b>contame de tu negocio 🎙️</b> — así los próximos posteos salen todavía mejor.</p>
        <button class="btn btn-primary btn-block" id="ftCelebVoice" style="margin-top:10px;font-size:14px">🎙️ Contame de tu negocio</button>
        <button class="btn btn-ghost btn-block" id="ftCelebClose" style="margin-top:8px">Ahora no</button>`);
      const vb = document.getElementById('ftCelebVoice');
      if (vb) vb.onclick = () => {
        closeStreakModal();
        postyAskInChat('voice');
      };
      const cb = document.getElementById('ftCelebClose');
      if (cb) cb.onclick = closeStreakModal;
    } else {
      FT.publishing = false;
      pub.disabled = false;
      pub.textContent = '🚀 Publicar ahora';
    }
  };
}
/* ============================================================
   "🚀 Publicar mi primero" (mejora 2026-09-30: garantizar el primer posteo)
   Tarjeta hero en Schedule, visible SOLO cuando hay 0 posteos publicados.
   1 tap → publica el primer borrador (publish-now, con el OK explícito de
   siempre: imagen + cuenta destino). Si no hay borradores, primero genera UNO
   con el flujo autopilot existente (n=1) y después lo publica. Sin gates nuevos.
   ============================================================ */
function firstPublishCardHTML(drafts) {
  const list = Array.isArray(drafts) ? drafts : [];
  const n = list.length;
  const sub = n
    ? (n === 1
        ? 'Ya tenés 1 borrador listo ✨ — publicalo y miralo vivo en tu Instagram.'
        : `Ya tenés ${n} borradores listos ✨ — publicá el primero y miralo vivo en tu Instagram.`)
    : 'Todavía no hay borradores — tocá el botón, armo el primero al toque y lo publicamos 🚀';
  return `
  <div class="card" id="firstPublishCard" style="border:2px solid var(--yel);background:#FFF9EC">
    <h3 style="margin:0 0 4px">🚀 Tu primer posteo</h3>
    <p class="hint" style="margin:0 0 10px">${sub}</p>
    <button type="button" class="btn btn-primary btn-block" id="btnFirstPublish" style="min-height:52px;font-size:16px;touch-action:manipulation">🚀 Publicar mi primero</button>
    <div id="fpPubMount" style="margin-top:10px"></div>
  </div>`;
}

// Espera liviana a que aparezca al menos 1 borrador (caso "generar primero"):
// resuelve con los borradores o [] al agotar el timeout.
async function fpWaitDrafts(timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    let posts = [];
    try { posts = await api.get('/api/posts'); } catch (e) { posts = []; }
    const drafts = (Array.isArray(posts) ? posts : []).filter(p => p && p.status === 'draft').sort((a, b) => a.id - b.id);
    if (drafts.length) return drafts;
    if (Date.now() - t0 > timeoutMs) return [];
    await new Promise(r => setTimeout(r, 3000));
  }
}

async function firstPublishFlow() {
  const btn0 = document.getElementById('btnFirstPublish');
  if (!btn0 || btn0.disabled) return;
  const mount = () => document.getElementById('fpPubMount');
  const say = (t, dis) => { const b = document.getElementById('btnFirstPublish'); if (b) { b.textContent = t; b.disabled = !!dis; } };
  // Mismo resguardo que el fast-track: sin cupo, modal de mejora (no es un gate nuevo).
  const hasQuota = await checkQuotaOrModal();
  if (!hasQuota) return;
  say('⏳ Preparando…', true);
  try {
    // Anti-carrera: si ya publicó por otro lado, no duplicar.
    let posts = await api.get('/api/posts').catch(() => []);
    if ((posts || []).some(p => p && p.status === 'published')) { try { render(); } catch (e) {} return; }
    let drafts = (posts || []).filter(p => p && p.status === 'draft').sort((a, b) => a.id - b.id);
    if (!drafts.length) {
      // Sin borradores: generar UNO con el flujo existente (autopilot n=1).
      // El progreso necesita su elemento: si la tarjeta "Armemos tu semana" no
      // está (hay programados pero 0 borradores), se crea uno temporal acá.
      let prog = document.getElementById('apProg-schedule');
      if (!prog) {
        const m0 = mount();
        if (m0) m0.innerHTML = '<div id="apProg-schedule"></div>';
        prog = document.getElementById('apProg-schedule');
      }
      if (prog) prog.innerHTML = '<div class="okmsg">🎨 Armando tu primer posteo…</div>';
      const alreadyRunning = (typeof AUTOPILOT_RUNNING !== 'undefined') && !!AUTOPILOT_RUNNING;
      await runAutopilotSmart(1, 'schedule');
      drafts = await fpWaitDrafts(alreadyRunning ? 90000 : 8000);
      if (!drafts.length) {
        // El autopilot no generó (gate de ADN → chat, o cupo): decirlo de frente.
        say('🚀 Publicar mi primero', false);
        const m1 = mount();
        if (m1) m1.innerHTML = '<div class="hint">😅 No lo pude armar solo — <a href="#/app/chat" style="color:var(--cel);font-weight:700">contame de tu negocio en el chat</a> y lo hacemos juntos 👇</div>';
        return;
      }
      // runAutopilot re-renderiza la vista a los ~900ms: esperar al DOM nuevo
      // antes de publicar (el mount viejo queda descolgado).
      await new Promise(r => setTimeout(r, 1400));
    }
    const m2 = mount();
    // publishNowFlow pide el OK explícito (imagen + cuenta destino): nada sale sin ese tap.
    const res = await publishNowFlow(drafts[0].id, m2 || document.getElementById('btnFirstPublish').parentElement);
    if (res && res.ok) { try { render(); } catch (e) {} }
    else say('🚀 Publicar mi primero', false);
  } catch (e) {
    say('🚀 Publicar mi primero', false);
    const m3 = mount();
    if (m3) m3.innerHTML = `<div class="err">${esc(humanError((e && e.message) || 'No se pudo'))}</div>`;
  }
}

// Auto-disparo desde el banner del chat ("¿publicamos tu primero?"):
// verifica que siga en 0 publicados y toca el botón.
async function autoClickFirstPublish() {
  const btn = document.getElementById('btnFirstPublish');
  if (!btn || btn.disabled) return;
  try {
    const posts = await api.get('/api/posts').catch(() => []);
    if ((posts || []).some(p => p && p.status === 'published')) return; // ya salió por otro lado
  } catch (e) {}
  const b2 = document.getElementById('btnFirstPublish');
  if (b2 && !b2.disabled) b2.click();
}

function bindFirstPublish() {
  const btn = document.getElementById('btnFirstPublish');
  if (!btn) return;
  btn.onclick = () => { firstPublishFlow(); };
  // Llegada desde el banner del chat: auto-disparar.
  try {
    if (sessionStorage.getItem('posta_fp_auto') === '1') {
      sessionStorage.removeItem('posta_fp_auto');
      setTimeout(() => { try { autoClickFirstPublish(); } catch (e) {} }, 500);
    }
  } catch (e) {}
}
/* ---------- MI SEMANA (dashboard) ---------- */
let SEM_NUDGES = [];

// Botones 👍/👎 para enseñarle a Posty lo que te gusta
function sigBtns(p) {
  const a = p.signal === 'approved' ? ' on' : '';
  const r = p.signal === 'rejected' ? ' on' : '';
  return `<button class="sig-btn${a}" data-sig="approved" data-id="${p.id}" title="Me gustó, así">👍</button><button class="sig-btn${r}" data-sig="rejected" data-id="${p.id}" title="No me gustó">👎</button>`;
}
function bindSignalBtns() {
  $$('[data-sig]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await api.post(`/api/posts/${b.dataset.id}/signal`, { signal: b.dataset.sig }); }
    catch (e) { b.disabled = false; return; }
    render();
  });
}

// Calendario comercial argentino: fechas que venden. Nudge si faltan ≤14 días.
function arFechas() {
  const y = new Date().getFullYear();
  const out = [];
  const push = (name, date, topic, approx) => out.push({ name, date, topic, approx: !!approx });
  for (const yy of [y, y + 1]) {
    const t = (m) => { const d = new Date(yy, m, 1); let n = 0; for (;;) { if (d.getDay() === 0 && ++n === 3) return new Date(d); d.setDate(d.getDate() + 1); } };
    push('Año Nuevo', new Date(yy, 0, 1), 'Promo de comienzo de año para tu negocio');
    push('Reyes Magos', new Date(yy, 0, 6), 'Promo por Reyes: últimos regalos');
    push('Día de la Mujer', new Date(yy, 2, 8), 'Contenido por el Día de la Mujer');
    push('Hot Sale', new Date(yy, 4, 11), 'Ofertas para el Hot Sale', true);
    push('Día del Padre', t(5), 'Promo por el Día del Padre');
    push('Día del Niño', t(7), 'Promo por el Día del Niño');
    push('Día de la Madre', t(9), 'Promo por el Día de la Madre');
    push('CyberMonday', new Date(yy, 10, 2), 'Ofertas para el CyberMonday', true);
    push('Navidad', new Date(yy, 11, 25), 'Promo de Navidad y fiestas');
    push('Fin de año', new Date(yy, 11, 31), 'Cierre de año: balance y agradecimiento');
  }
  return out;
}
function upcomingNudges() {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return arFechas()
    .map(f => {
      const d = new Date(f.date); d.setHours(0, 0, 0, 0);
      const days = Math.round((d - now) / 86400000);
      return { ...f, days };
    })
    .filter(f => f.days >= 0 && f.days <= 14)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2);
}
function fmtDay(d) {
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ---------- RACHAS 🔥 ---------- */
// Límite del plan semanal: "mejorá tu paquete para seguir posteando esta semana"
function isPlanLimitErr(e) { return !!(e && e.status === 403 && e.data && e.data.plan_limit); }
// v215: el modal de tope se alimenta del 403 del servidor — trae el cupo
// DE LA SEMANA DEL POSTEO (limit/used/week_key), no el de la semana
// actual — y suma la acción "Ver los posteos de esta semana".
async function planLimitModal(e) {
  const d = (e && e.data) || {};
  const q = d.limit
    ? { limit: d.limit, used: d.used != null ? d.used : d.limit, left: 0, plan_name: d.plan_name || '', week_key: d.week_key || null }
    : (await api.get('/api/quota').catch(() => null)) || { limit: 3, used: 3, left: 0, plan_name: '' };
  quotaModal(q, { showWeek: true });
}
// Chequeo previo a crear: true = hay cupo; false = se mostró el modal de mejora
async function checkQuotaOrModal() {
  try {
    const q = await api.get('/api/quota');
    // Sincronizar la barrita con el dato fresco (si no, miente)
    try {
      const mount = document.getElementById('chatQuickChips');
      if (mount) { paintChatQuota(mount, q); }
    } catch (e) {}
    if (q.left <= 0) {
      // Sin plan (prueba vencida): directo a la pantalla de los 3 planes, sin vueltas
      if (ME && ME.trial_expired) { showExpiredModal(); return false; }
      quotaModal(q); return false;
    }
  } catch (e) { /* si falla el chequeo, no bloquear */ }
  return true;
}
function quotaModal(q, opts = {}) {
  const left = q.left || 0;
  const hasPartial = left > 0 && typeof opts.onPartial === 'function';
  track('paywall_view', { plan: (q && q.plan_name) || '', limit: (q && q.limit) || 0 });
  const headTitle = hasPartial
    ? `Te quedan ${left} ${left === 1 ? 'posteo' : 'posteos'} esta semana`
    : `¡Llegamos al tope de la semana! 🚀`;
  const headHtml = hasPartial
    ? `<p style="font-size:14px;margin:0 0 6px">¿Los armamos ahora mismo? O mejorá tu paquete y seguimos sin freno — se activa al instante.</p>`
    : `<p style="font-size:14px;margin:0 0 6px">Tu plan <b>${esc(q.plan_name || '')}</b> incluye <b>${q.limit} posteos por semana</b> — y los usamos todos, ¡bien ahí!</p>
    <p class="d">${(typeof IS_NATIVE !== 'undefined' && IS_NATIVE) ? 'La semana que viene arrancás de cero de nuevo.' : 'Mejorá tu paquete y seguimos posteando ya mismo — se activa al instante, sin vueltas.'}</p>`;
  streakModalShell(`
    <img src="ai-avatar.png" alt="Posty" style="width:64px;height:64px;border-radius:50%;box-shadow:0 4px 14px rgba(39,147,200,.35)">
    <h3 style="margin:12px 0 4px">${headTitle}</h3>
    ${headHtml}
    ${hasPartial ? `<button class="btn btn-primary btn-block" id="qPartial" style="margin-top:10px">⚡ Armar ${left === 1 ? 'el que me queda' : `los ${left} que me quedan`} →</button>` : ''}
    ${!(typeof IS_NATIVE !== 'undefined' && IS_NATIVE) ? `<button class="btn ${hasPartial ? 'btn-soft' : 'btn-primary'} btn-block" id="qUpgrade" style="margin-top:10px">⬆️ Mejorar mi paquete</button>` : ''}
    ${opts.showWeek ? `<button class="btn btn-soft btn-block" id="qShowWeek" style="margin-top:10px">📅 Ver los posteos de esta semana</button>` : ''}
    <button class="btn btn-ghost btn-block" id="qClose" style="margin-top:8px">Entendido</button>`);
  const up = document.getElementById('qUpgrade');
  if (up) up.onclick = () => { closeStreakModal(); location.hash = '#/app/ajustes?plan=1'; };
  // v215: ver la semana que ocupa el cupo (los posteos que ya están).
  const sw = document.getElementById('qShowWeek');
  if (sw) sw.onclick = () => {
    closeStreakModal();
    const go = () => { const el = document.getElementById('hsWeekList'); if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } };
    const h = location.hash || '';
    if (h.startsWith('#/app/schedule') || h.startsWith('#/app/chat')) { try { render(); } catch (e) {} setTimeout(go, 400); }
    else { location.hash = '#/app/schedule'; setTimeout(go, 800); }
  };
  const cl = document.getElementById('qClose');
  if (cl) cl.onclick = closeStreakModal;
  const pa = document.getElementById('qPartial');
  if (pa && opts.onPartial) pa.onclick = () => { closeStreakModal(); opts.onPartial(); };
}
function closeStreakModal() { const m = document.getElementById('streakModal'); if (m) m.remove(); }
function streakModalShell(inner) {
  closeStreakModal();
  const ov = document.createElement('div');
  ov.className = 'modal-ov'; ov.id = 'streakModal';
  ov.innerHTML = `<div class="modal-card"><div class="streak-celeb">${inner}</div></div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) closeStreakModal(); });
  document.body.appendChild(ov);
}
function streakNextTxt(sk) {
  if (!sk.nextLevel) return `<p class="d">Nivel máximo 👑</p>`;
  const falta = sk.nextLevel.at - sk.current;
  return `<p class="d">Te ${falta === 1 ? 'falta 1 semana' : `faltan ${falta} semanas`} para ${esc(sk.nextLevel.emoji)} ${esc(sk.nextLevel.name)}</p>`;
}
// "38h" / "2d" / "menos de 1h" — cuánto le queda de vida a la racha (72h desde la última publicación)
function fmtStreakLeft(ms) {
  if (!ms || ms <= 0) return 'menos de 1h';
  const h = ms / 36e5;
  if (h < 1) return 'menos de 1h';
  if (h < 48) return Math.ceil(h) + 'h';
  return Math.floor(h / 24) + 'd';
}
function streakShareBtns() {
  return `<button class="btn btn-primary btn-block" id="streakShareBtn" style="margin-top:10px">📤 Compartir mi racha</button>
  <button class="btn btn-ghost btn-block" id="streakCloseBtn" style="margin-top:8px">Cerrar</button>`;
}
function wireStreakModalBtns(sk) {
  const sh = $('#streakShareBtn'); if (sh) sh.onclick = () => shareStreakImage(sk);
  const cl = $('#streakCloseBtn'); if (cl) cl.onclick = closeStreakModal;
}
// Celebración al completar la semana (festejo especial si subió de nivel)
// Bloque de referidos para los picos emocionales (festejos): compacto, un toque para compartir.
function celebRefHTML() {
  return `
  <div class="celeb-ref">
    <p class="celeb-ref-t">🎁 ¿A quién más le vendría bien esto?</p>
    <p class="d">Compartí tu link: ellos ahorran 20% todos los meses, y con 2 referidos vos pagás la mitad.</p>
    <div class="celeb-ref-btns">
      <button class="btn btn-wa btn-sm" data-cref="wa">WhatsApp</button>
      <button class="btn btn-ghost btn-sm" data-cref="copy">Copiar link</button>
    </div>
    <p class="d celeb-ref-msg"></p>
  </div>`;
}
async function wireCelebRef(root) {
  let link = '';
  try { const info = await pzReferral(); if (info && info.ok) link = info.link; } catch (e) {}
  const msg = root.querySelector('.celeb-ref-msg');
  const shareMsg = `Mirá lo que hace Posty con el Instagram de mi negocio: arma la semana y la publica sola. Probalo gratis con mi link: ${link}`;
  root.querySelectorAll('[data-cref]').forEach(b => {
    b.onclick = async () => {
      if (!link) { if (msg) msg.textContent = 'No se pudo cargar tu link todavía.'; return; }
      if (b.dataset.cref === 'wa') {
        location.href = 'https://wa.me/?text=' + encodeURIComponent(shareMsg);
      } else {
        try { await navigator.clipboard.writeText(link); if (msg) msg.textContent = '✅ Link copiado'; }
        catch (e) { if (msg) msg.textContent = link; }
      }
    };
  });
}
// Festejo de primera publicación: una vez por cuenta, cuando el primer posteo sale.
// Es el momento donde la confianza se cristaliza ("¿viste? salió solo").
let _pubCelebChecked = false;
async function maybeFirstPublishCelebration() {
  if (_pubCelebChecked) return;
  _pubCelebChecked = true;
  let r;
  try { r = await api.get('/api/publish-celebration'); } catch (e) { return; }
  if (!r || !r.show || !r.post) return;
  const p = r.post;
  const isVideo = p.media_type === 'video';
  streakModalShell(`
    <div class="big-emoji">🎉</div>
    <h3 style="margin:12px 0 4px">¿Viste? Salió solo</h3>
    <p style="font-size:14px;margin:0 0 6px">Tu primer ${isVideo ? 'reel' : 'posteo'} ya está en Instagram — <b>vos no hiciste nada</b>.</p>
    ${p.ig_permalink ? `<a class="btn btn-primary btn-block" href="${esc(p.ig_permalink)}" target="_blank" rel="noopener" style="margin:8px 0">Ver en Instagram →</a>` : ''}
    ${celebRefHTML()}
    <button class="btn btn-ghost btn-block" id="pubCelebClose" style="margin-top:6px">Seguir →</button>`);
  const ov = document.getElementById('streakModal');
  if (ov) wireCelebRef(ov);
  try { await api.post('/api/publish-celebration/seen', {}); } catch (e) {}
  const c = document.getElementById('pubCelebClose');
  if (c) c.onclick = () => closeStreakModal();
}
// Hitos de publicaciones: 10, 25, 50, 100 (el hito 1 lo cubre maybeFirstPublishCelebration).
// Un festejo por hito, una sola vez por cuenta.
let _msCelebChecked = false;
async function maybeMilestoneCelebration() {
  if (_msCelebChecked) return;
  _msCelebChecked = true;
  let r;
  try { r = await api.get('/api/milestones'); } catch (e) { return; }
  if (!r || !r.show || !r.milestone) return;
  streakModalShell(`
    <div class="big-emoji">🏆</div>
    <h3 style="margin:12px 0 4px">¡${r.milestone} posteos publicados!</h3>
    <p style="font-size:14px;margin:0 0 6px">Tu constancia está dando frutos — y esto recién empieza. 🚀</p>
    <button class="btn btn-primary btn-block" id="msCelebClose" style="margin-top:8px">Seguir →</button>`);
  try { await api.post('/api/milestones/seen', { milestone: r.milestone }); } catch (e) {}
  const mc = document.getElementById('msCelebClose');
  if (mc) mc.onclick = () => closeStreakModal();
}
// Misión de fotos de la semana: 3 fotos concretas + progreso de subidas.
// Vive pegada a la tarjeta de fotos: ven la misión y suben ahí mismo, cero pasos.
/* ---------- Sugerencias proactivas del CM ---------- */
let _tipsDismissed = false;
async function loadProactiveTips() {
  const el = document.getElementById('proactiveTips');
  if (!el || _tipsDismissed) return;
  let r;
  try { r = await api.get('/api/proactive-tips'); } catch (e) { return; }
  const tips = (r && r.tips) || [];
  if (!tips.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
  <div class="card" id="cmTipsCard" style="border:1.5px solid #FEC14D;background:#FFFDF6">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <h3 style="margin:0 0 8px">💡 Sugerencias de tu CM</h3>
      <button id="cmTipsX" aria-label="Ocultar sugerencias" style="background:none;border:0;font-size:14px;cursor:pointer;color:var(--mut);padding:0">✕</button>
    </div>
    ${tips.map(t => t && t.kind === 'pause-tipo'
      ? `<div class="cm-tip pause-tip"><span>🚫</span><span style="flex:1">${esc(t.texto || '')}</span><span class="pause-btns"><button class="btn btn-soft btn-sm" data-pause-yes="${esc(t.tipo || '')}">Sí, pausalas</button><button class="btn btn-ghost btn-sm" data-pause-no>No</button></span></div>`
      : `<div class="cm-tip"><span>${t.icon || '💡'}</span><span>${esc(t.text)}</span></div>`).join('')}
  </div>`;
  const x = document.getElementById('cmTipsX');
  if (x) x.onclick = () => { _tipsDismissed = true; const c = document.getElementById('cmTipsCard'); if (c) c.remove(); };
  // Pausar un tipo de contenido (la IA lo deja de proponer por 30 días)
  $$('#cmTipsCard [data-pause-yes]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      try { await api.post('/api/pause-tipo', { tipo: b.dataset.pauseYes, paused: true }); } catch (e) {}
      loadProactiveTips().catch(() => {});
      loadWeeklyPlan().catch(() => {});
    };
  });
  $$('#cmTipsCard [data-pause-no]').forEach(b => {
    b.onclick = () => { const row = b.closest('.pause-tip'); if (row) row.remove(); };
  });
}
/* ---------- Plan semanal sugerido ---------- */
const TIPO_META = { promo: ['🎯', 'Promo'], tip: ['📚', 'Tip'], social: ['💬', 'Prueba social'], detras: ['🎬', 'Detrás de escena'], novedad: ['✨', 'Novedad'] };
async function loadWeeklyPlan() {
  const el = document.getElementById('weeklyPlan');
  if (!el) return;
  let r;
  try { r = await api.get('/api/weekly-plan'); } catch (e) { el.innerHTML = ''; return; }
  const plan = (r && r.plan) || [];
  // Sin explicaciones de estrategia: nosotros nos ocupamos. Solo la serie, que sí necesita un sí del cliente.
  const sug = plan.find(p => p && p.kind === 'suggest-serie');
  if (!sug) { el.innerHTML = ''; return; }
  el.innerHTML = `
  <div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:12px">
    <span style="font-size:26.5px">📺</span>
    <div style="flex:1"><b>${esc(sug.nombre_sugerido || 'Tu serie')}</b><div class="d" style="margin-top:2px">Tu serie fija de cada semana.</div></div>
    <button class="btn btn-primary" data-serie-nombre="${esc(sug.nombre_sugerido || '')}" data-serie-weekday="${esc(sug.weekday ?? '')}" data-serie-tipo="${esc(sug.tipo || '')}">Crear</button>
  </div>`;
  // Crear serie sugerida por el CM
  $$('#weeklyPlan [data-serie-nombre]').forEach(sb => {
    sb.onclick = async () => {
      sb.disabled = true;
      try {
        const body = { nombre: sb.dataset.serieNombre };
        if (sb.dataset.serieWeekday !== '') body.weekday = Number(sb.dataset.serieWeekday);
        if (sb.dataset.serieTipo) body.tipo = sb.dataset.serieTipo;
        await api.post('/api/series', body);
        loadWeeklyPlan().catch(() => {});
      } catch (e) { sb.disabled = false; }
    };
  });
}
// Autopilot siguiendo el orden de tipos del plan (reordena las ideas, sin tocar el flujo)
async function runAutopilotWithPlan(plan) {
  return runAutopilotSmart((ME && ME.posts_per_week) || 3, 'semana');
}
/* ---------- Fotos de la semana: checklist de la misión ---------- */
function isoWeekKey(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (x.getUTCDay() + 6) % 7; // lunes = 0
  x.setUTCDate(x.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((x - firstThu) / (7 * 864e5));
  return `${x.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
/* ---------- Republicar: un posteo que voló, con diseño fresco ---------- */
let _recycleDismissed = false;
async function loadRecycleSuggest() {
  const el = document.getElementById('recycleCard');
  if (!el || _recycleDismissed) return;
  let r;
  try { r = await api.get('/api/recycle-suggest'); } catch (e) { el.innerHTML = ''; return; }
  const s = r && r.suggestion;
  if (!s) { el.innerHTML = ''; return; }
  el.innerHTML = `
  <div class="card" style="border:1.5px solid #FEC14D;background:#FFFDF6;margin-bottom:14px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <h3 style="margin:0 0 8px">♻️ Republicar</h3>
      <button id="recycleX" aria-label="Ocultar" style="background:none;border:0;font-size:14px;cursor:pointer;color:var(--mut);padding:0">✕</button>
    </div>
    <div style="display:flex;gap:10px;align-items:center">
      ${s.thumb ? `<img src="${esc(s.thumb)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex:none">` : ''}
      <div style="min-width:0">
        <div style="font-weight:700;font-size:13px;line-height:1.35">Este posteo voló hace ${esc(s.days_ago)} días (${esc(s.reach)} alcance)</div>
        <div class="d" style="font-size:11.5px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(s.caption)}</div>
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="recycleGo" style="margin-top:10px">♻️ Republicar con diseño fresco</button>
  </div>`;
  const x = document.getElementById('recycleX');
  if (x) x.onclick = () => { _recycleDismissed = true; el.innerHTML = ''; };
  const go = document.getElementById('recycleGo');
  if (go) go.onclick = async () => {
    go.disabled = true;
    go.textContent = '⏳ Preparando…';
    try {
      await api.post('/api/recycle', { post_id: s.post_id });
      chatSay('Listo, lo dejé en revisión 👇');
      render();
    } catch (e) {
      go.disabled = false;
      go.textContent = '♻️ Republicar con diseño fresco';
    }
  };
}
/* ---------- Loop visible: por qué armé tu semana así ---------- */
/* ---------- Alerta honesta de rendimiento ---------- */
let _perfAlertDismissed = false;
async function loadPerformanceAlert() {
  const el = document.getElementById('perfAlert');
  if (!el || _perfAlertDismissed) return;
  let r;
  try { r = await api.get('/api/performance-alert'); } catch (e) { return; }
  if (!r || !r.alert) { el.innerHTML = ''; return; }
  el.innerHTML = `
  <div class="card" style="border:1.5px solid #E0A32E;background:#FFFDF6;margin-bottom:14px">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <h3 style="margin:0 0 8px">⚠️ Tu alcance bajó ${esc(String(r.dropPct))}%</h3>
      <button id="perfAlertX" aria-label="Ocultar alerta" style="background:none;border:0;font-size:14px;cursor:pointer;color:var(--mut);padding:0">✕</button>
    </div>
    <p class="d" style="margin:0 0 6px">${esc(r.diagnostico || '')}</p>
    <p style="margin:0;font-weight:700;font-size:13px">💪 ${esc(r.plan || '')}</p>
  </div>`;
  const x = document.getElementById('perfAlertX');
  if (x) x.onclick = () => { _perfAlertDismissed = true; const c = el.firstElementChild; if (c) c.remove(); };
}
/* ---------- Pilares del mes ---------- */
async function loadPillars() {
  const el = document.getElementById('pillarsCard');
  if (!el) return;
  el.innerHTML = `<div class="card"><h3 style="margin:0 0 4px">📅 Pilares del mes</h3><p class="d" style="margin:0">Armando tus focos de contenido…</p></div>`;
  let r;
  try { r = await api.get('/api/pillars'); } catch (e) { el.innerHTML = ''; return; }
  const paint = (list) => {
    if (!list || !list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <h3 style="margin:0 0 8px">📅 Pilares del mes</h3>
        <button id="pillarsRegen" class="rev-redo" style="margin:0" title="Regenerar pilares">↻ regenerar</button>
      </div>
      ${list.map(p => `<div class="pillar"><b>${esc(p.titulo || '')}</b><span>${esc(p.enfoque || '')}</span></div>`).join('')}
    </div>`;
    const rb = document.getElementById('pillarsRegen');
    if (rb) rb.onclick = async () => {
      rb.disabled = true; rb.textContent = '↻ generando…';
      try { const rr = await api.post('/api/pillars/refresh', {}); if (rr && rr.pillars) paint(rr.pillars); }
      catch (e) { rb.disabled = false; rb.textContent = '↻ regenerar'; }
    };
  };
  paint((r && r.pillars) || []);
}
/* ---------- Reporte semanal: tu semana en números ---------- */
async function loadReportCard() {
  const el = document.getElementById('reportCard');
  if (!el) return;
  let r;
  try { r = await api.get('/api/weekly-report'); } catch (e) { el.innerHTML = ''; return; }
  const posts = (r && r.posts) || [];
  if (!posts.length) { el.innerHTML = ''; return; }
  const t = (r && r.totals) || { reach: 0, likes: 0, comments: 0 };
  const fmt = n => Number(n || 0).toLocaleString('es-AR');
  // Sin datos todavía: mensaje amable en vez de un tablero de ceros.
  if (!(t.reach > 0 || t.likes > 0 || t.comments > 0)) {
    el.innerHTML = `
    <div class="card" style="border:2px solid var(--cel)">
      <h3 style="margin:0 0 4px">📊 Tu semana en números</h3>
      <p class="d" style="margin:0">Tus números de Instagram aparecen acá cuando tus posteos empiecen a juntar alcance.</p>
    </div>`;
    return;
  }
  const best = posts.slice().sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];
  const bestId = best ? best.id : null;
  el.innerHTML = `
  <div class="card" style="border:2px solid var(--cel)">
    <h3 style="margin:0 0 4px">📊 Tu semana en números</h3>
    <p class="hint" style="margin:0 0 12px">Así rindieron tus posteos en los últimos 7 días.</p>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <div style="flex:1;background:#0A1E33;color:#fff;border-radius:12px;padding:10px 6px;text-align:center"><div style="font-size:17.5px;font-weight:800">${fmt(t.reach)}</div><div style="font-size:10px;opacity:.8">alcance</div></div>
      <div style="flex:1;background:#0A1E33;color:#fff;border-radius:12px;padding:10px 6px;text-align:center"><div style="font-size:17.5px;font-weight:800">${fmt(t.likes)}</div><div style="font-size:10px;opacity:.8">likes</div></div>
      <div style="flex:1;background:#0A1E33;color:#fff;border-radius:12px;padding:10px 6px;text-align:center"><div style="font-size:17.5px;font-weight:800">${fmt(t.comments)}</div><div style="font-size:10px;opacity:.8">comentarios</div></div>
    </div>
    ${posts.slice(0, 5).map(p => `
      <div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #EDF1F5">
        <img src="${esc(p.image_path)}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0" alt="">
        <div style="flex:1;min-width:0;font-size:11.5px"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.id === bestId ? '🏆 ' : ''}${esc(String(p.caption || '').split('\n')[0] || (p.media_type === 'story' ? 'Historia' : 'Posteo'))}</div>
        <div style="color:var(--mut);font-size:10.5px">👁️ ${fmt(p.reach)} · ❤️ ${fmt(p.likes)} · 💬 ${fmt(p.comments)}</div></div>
      </div>`).join('')}
  </div>`;
}

/* ---------- PUBLICIDAD: billetera + potenciar posteos ganadores ---------- */
function fmtARSc(cents) { return '$' + Math.round((cents || 0) / 100).toLocaleString('es-AR'); }
let ADS_CTX = null; // { balance, minTopup } — lo llena adsView para pintar los botones sin parpadeo

// Tarjeta de posteo recomendado: pills de presupuesto + botón que se adapta solo.
// Se usa en Mi semana (a la vista) y en #/app/ads.
function adsRecCardHTML(r, budgets) {
  const pills = (budgets || []).map((c, i) =>
    `<button type="button" class="ads-pill${i === 1 ? ' on' : ''}" data-pill="${c}">${fmtARSc(c)}</button>`).join('');
  return `
  <div class="ads-rec" data-rec="${r.post_id}">
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
      <img src="${esc(r.image_path)}" style="width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0" alt="">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.caption || 'Posteo')}</div>
        <div style="color:var(--mut);font-size:10.5px">👁️ ${Number(r.reach || 0).toLocaleString('es-AR')} alcance · ⚡ ${r.er_pct}% interacción</div>
      </div>
    </div>
    <p class="d" style="margin:0 0 2px">Rindió por encima de tu promedio — la plata va a un ganador probado.</p>
    <div class="ads-pills" data-pills>${pills}</div>
    <button class="btn btn-primary btn-block" data-boost></button>
    <div data-confirm style="margin-top:8px"></div>
  </div>`;
}
function adsSelectedBudget(card) {
  const on = card.querySelector('[data-pill].on');
  return on ? Number(on.dataset.pill) : 0;
}
// El botón se adapta solo: con crédito dice "Potenciar", sin crédito "Cargar $X y potenciar"
function paintAdsBtn(card, balanceCents, minTopupCents) {
  const btn = card.querySelector('[data-boost]');
  if (!btn) return;
  const b = adsSelectedBudget(card);
  if (!b) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  if ((balanceCents || 0) >= b) {
    btn.innerHTML = '🚀 Potenciar';
    btn.dataset.mode = 'boost';
  } else {
    const load = Math.max(minTopupCents || 0, b);
    btn.innerHTML = `💰 Cargar ${fmtARSc(load)} y potenciar`;
    btn.dataset.mode = 'topup';
    btn.dataset.load = String(load);
  }
}
function bindAdsRecCards(scope, opts) {
  // opts: { balance, minTopup, returnTo }
  if (!scope) return;
  scope.querySelectorAll('.ads-rec').forEach(card => {
    paintAdsBtn(card, opts.balance, opts.minTopup);
    card.querySelectorAll('[data-pill]').forEach(pl => pl.onclick = () => {
      card.querySelectorAll('[data-pill]').forEach(x => x.classList.remove('on'));
      pl.classList.add('on');
      card.querySelector('[data-confirm]').innerHTML = '';
      paintAdsBtn(card, opts.balance, opts.minTopup);
    });
    card.querySelector('[data-boost]').onclick = () => adsRecAction(card, opts);
  });
}
async function adsRecAction(card, opts) {
  const btn = card.querySelector('[data-boost]');
  const box = card.querySelector('[data-confirm]');
  const budget = adsSelectedBudget(card);
  if (!budget) return;
  if (btn.dataset.mode === 'topup') {
    // Un solo toque: guarda la pauta pendiente, cobra por MercadoPago y al volver se activa sola
    const load = Number(btn.dataset.load) || budget;
    try { localStorage.setItem('posta_pending_boost', JSON.stringify({ post_id: Number(card.dataset.rec), budget_cents: budget, ts: Date.now() })); } catch (e) {}
    btn.disabled = true; btn.textContent = '⏳ Abriendo MercadoPago…';
    try {
      const r = await api.post('/api/ads/topup', { amount_cents: load, return_to: opts.returnTo });
      track('checkout_start', { kind: 'ads_topup' }); trackBeacon();
      if (r && r.init_point) { location.href = r.init_point; return; }
      throw new Error('No se pudo generar el pago');
    } catch (e) {
      btn.disabled = false; paintAdsBtn(card, opts.balance, opts.minTopup);
      box.innerHTML = `<div class="err">${esc(e.message || 'No se pudo generar el pago')}</div>`;
    }
    return;
  }
  // Con crédito: confirmación inline, misma pantalla
  box.innerHTML = `
    <div style="background:#FFF7E8;border:1px solid var(--yel);border-radius:12px;padding:10px 12px;font-size:12.5px">
      <div style="margin-bottom:8px">Se debitan <b>${fmtARSc(budget)}</b> de tu crédito por 7 días de pauta en Instagram y Facebook.</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" data-ok style="flex:1">Confirmar 🚀</button>
        <button class="btn btn-ghost btn-sm" data-no style="flex:1">Cancelar</button>
      </div>
    </div>`;
  box.querySelector('[data-no]').onclick = () => { box.innerHTML = ''; };
  box.querySelector('[data-ok]').onclick = async (ev) => {
    const okb = ev.currentTarget; okb.disabled = true;
    try {
      const r = await api.post('/api/ads/boost', { post_id: Number(card.dataset.rec), budget_cents: budget });
      box.innerHTML = `<div class="okmsg">🚀 ${esc((r && r.message) || '¡Pauta creada!')}</div>`;
      try {
        const cfg = await api.get('/api/ads/config');
        opts.balance = cfg.balance_cents || 0;
        paintAdsBtn(card, opts.balance, opts.minTopup);
      } catch (e) {}
      setTimeout(() => { const h = location.hash || ''; if (h.startsWith('#/app/ads') || h.startsWith('#/app/schedule')) render(); }, 4000);
    } catch (e) {
      if (e && (e.status === 402 || /crédito/i.test(String(e.message || '')))) {
        try { const cfg = await api.get('/api/ads/config'); opts.balance = cfg.balance_cents || 0; } catch (err) {}
        box.innerHTML = '';
        paintAdsBtn(card, opts.balance, opts.minTopup); // pasa a modo "cargar y potenciar"
      } else {
        box.innerHTML = `<div class="err">${esc(e.message || 'No se pudo crear la pauta')}</div>`;
        okb.disabled = false;
      }
    }
  };
}

// Tarjeta "a la vista" para Mi semana: los recomendados sin entrar a otra pantalla
function adsBoostCardHTML(cfg, recs) {
  if (typeof IS_NATIVE !== 'undefined' && IS_NATIVE) return ''; // sin ventas en app nativa
  const list = (recs && recs.recommendations) || [];
  const budgets = (cfg && cfg.budget_options) || [];
  if (!list.length || !budgets.length) return '';
  return `
  <div class="card" id="adsBoostCard" style="border:2px solid var(--cel)">
    <div id="adsBoostMsg"></div>
    <h3 style="margin:0 0 4px">🚀 Te recomendamos potenciar</h3>
    <p class="d" style="margin:0 0 10px">Rindieron más que tu promedio — un toque y llegan a más gente.</p>
    ${list.slice(0, 2).map(r => adsRecCardHTML(r, budgets)).join('')}
    <a href="#/app/ads" style="font-size:11.5px;color:var(--cel);font-weight:700">Ver mi crédito e historial →</a>
  </div>`;
}

// Al volver de MercadoPago con una pauta pendiente: se activa sola ("nosotros nos ocupamos")
async function handlePendingBoost() {
  const q = new URLSearchParams((location.hash.split('?')[1] || ''));
  const topupState = q.get('topup');
  const cleanUrl = () => { try { if (/\?topup=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/app/schedule'); } catch (e) {} };
  let p = null;
  try { p = JSON.parse(localStorage.getItem('posta_pending_boost') || 'null'); } catch (e) {}
  if (!p || (Date.now() - (p.ts || 0) > 24 * 3600 * 1000)) {
    if (p) { try { localStorage.removeItem('posta_pending_boost'); } catch (e) {} }
    cleanUrl(); return;
  }
  const say = (html) => { const el = document.getElementById('adsBoostMsg'); if (el) { el.innerHTML = html; return; } try { toast(String(html).replace(/<[^>]+>/g, '')); } catch (e) {} };
  const tryBoost = async () => {
    try {
      const r = await api.post('/api/ads/boost', { post_id: Number(p.post_id), budget_cents: Number(p.budget_cents) });
      try { localStorage.removeItem('posta_pending_boost'); } catch (e) {}
      return { ok: true, msg: (r && r.message) || '¡Pauta creada!' };
    } catch (e) {
      if (e && (e.status === 402 || /crédito/i.test(String(e.message || '')))) return { ok: false, nocredit: true };
      try { localStorage.removeItem('posta_pending_boost'); } catch (e2) {}
      return { ok: false, msg: (e && e.message) || 'No se pudo crear la pauta' };
    }
  };
  const done = async (res) => {
    if (res.ok) {
      say(`<div class="okmsg">🚀 ${esc(res.msg)}</div>`);
      try {
        const cfg = await api.get('/api/ads/config');
        if (ADS_CTX) ADS_CTX.balance = cfg.balance_cents || 0;
        const abc = document.getElementById('adsBoostCard');
        if (abc) abc.querySelectorAll('.ads-rec').forEach(c => paintAdsBtn(c, cfg.balance_cents || 0, cfg.min_topup_cents || 1000000));
      } catch (e) {}
      setTimeout(() => { if ((location.hash || '').startsWith('#/app/schedule')) render(); }, 6000);
    } else if (res.nocredit) {
      say(`<div class="okmsg">⏳ Tu pago está en proceso. Cuando se acredite, activamos tu pauta sola — no tenés que hacer nada.</div>`);
    } else {
      say(`<div class="err">${esc(res.msg)}</div>`);
    }
  };
  if (topupState === 'ok') {
    say(`<div class="okmsg">⏳ Acreditando tu pago…</div>`);
    let res = null;
    for (let i = 0; i < 5; i++) { res = await tryBoost(); if (!res.nocredit) break; await new Promise(r => setTimeout(r, 3000)); }
    cleanUrl();
    await done(res);
  } else if (topupState === 'pending') {
    cleanUrl();
    say(`<div class="okmsg">⏳ Tu pago está en proceso. Cuando se acredite, activamos tu pauta sola — no tenés que hacer nada.</div>`);
  } else if (topupState === 'error') {
    cleanUrl();
    try { localStorage.removeItem('posta_pending_boost'); } catch (e) {}
    say(`<div class="err">No se pudo completar el pago. Probá de nuevo cuando quieras.</div>`);
  } else {
    // Visita normal con pauta pendiente: si ya hay crédito, se activa sola
    try {
      const cfg = await api.get('/api/ads/config');
      if (cfg && (cfg.balance_cents || 0) >= Number(p.budget_cents)) await done(await tryBoost());
    } catch (e) {}
  }
}

// 🚀 Pauta pendiente (vuelta de MercadoPago) y tarjeta de recomendados en la
// Agenda: ciclo propio post-render, como Ideas — la Agenda no espera estas
// llamadas. Si hay una pauta por activar, handlePendingBoost la activa sola.
async function enhanceAdsBoost() {
  const slot = document.getElementById('adsBoostSlot');
  if (!slot || slot.dataset.done) return;
  slot.dataset.done = '1';
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem('posta_pending_boost') || 'null'); } catch (e) {}
  const hasTopup = /\?topup=/.test(location.hash || '');
  try {
    const cfg = await api.get('/api/ads/config');
    const recs = await api.get('/api/ads/recommendations');
    if (!document.getElementById('adsBoostSlot')) return; // ya navegó a otra vista
    const html = adsBoostCardHTML(cfg, recs);
    if (html) {
      slot.innerHTML = html;
      bindAdsRecCards(slot, { balance: (cfg && cfg.balance_cents) || 0, minTopup: (cfg && cfg.min_topup_cents) || 1000000, returnTo: 'schedule' });
    } else if (pending || hasTopup) {
      slot.innerHTML = `<div class="card" id="adsBoostCard"><div id="adsBoostMsg"></div></div>`;
    }
  } catch (e) {}
  if (pending || hasTopup) { try { await handlePendingBoost(); } catch (e) {} }
}

async function adsView() {
  const q = new URLSearchParams((location.hash.split('?')[1] || ''));
  const topupState = q.get('topup'); // ok | pending | error (vuelta de MercadoPago)
  let cfg = null, recs = null, boosts = null;
  try { cfg = await api.get('/api/ads/config'); } catch (e) {}
  try { recs = await api.get('/api/ads/recommendations'); } catch (e) {}
  try { boosts = await api.get('/api/ads/boosts'); } catch (e) {}
  ADS_CTX = { balance: cfg ? cfg.balance_cents : 0, minTopup: cfg ? cfg.min_topup_cents : 1000000 };
  const bal = ADS_CTX.balance;

  const topupBanner = topupState === 'ok'
    ? `<div class="okmsg" style="margin-bottom:12px">💰 ¡Crédito acreditado! Ya podés potenciar tus posteos.</div>`
    : topupState === 'pending'
      ? `<div class="okmsg" style="margin-bottom:12px">⏳ Tu pago está en proceso. El crédito aparece acá cuando se acredite.</div>`
      : topupState === 'error'
        ? `<div class="err" style="margin-bottom:12px">No se pudo completar el pago. Probá de nuevo.</div>`
        : '';

  const topupBtns = cfg && cfg.topup_options
    ? cfg.topup_options.map(c => `<button class="btn btn-soft" data-topup="${c}" style="flex:1;min-width:90px">${fmtARSc(c)}</button>`).join('')
    : '';

  const list = (recs && recs.recommendations) || [];
  const budgets = (cfg && cfg.budget_options) || [];
  const recCards = recs === null
    ? `<div class="st-empty"><div class="st-empty-ico">⭐</div><b>No pude cargar tus recomendaciones ahora 😅</b><p>Probá de nuevo en un ratito.</p><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="render()">Reintentar</button></div>`
    : list.length && budgets.length
    ? `<div id="adsRecsCard">${list.map(r => adsRecCardHTML(r, budgets)).join('')}</div>`
    : `<div class="st-empty">
         <div class="st-empty-ico">⭐</div>
         <b>Las recomendaciones van a vivir acá</b>
         <p>Cuando tus posteos junten alcance, te marcamos acá cuáles conviene potenciar.</p>
         <a class="btn btn-primary btn-sm" href="#/app/schedule" style="margin-top:12px">📅 Ir a mi semana</a>
       </div>`;

  const bl = (boosts && boosts.boosts) || [];
  const statusTxt = (b) => b.status === 'active' ? '🟢 Activa'
    : b.status === 'pending' ? '⏳ Activándose' : b.status === 'finished' ? '✅ Finalizada' : esc(b.status || '');
  const boostRows = boosts === null
    ? `<div class="st-empty"><div class="st-empty-ico">📣</div><b>No pude cargar tus pautas ahora 😅</b><p>Probá de nuevo en un ratito.</p><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="render()">Reintentar</button></div>`
    : bl.length ? bl.map(b => `
    <div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #EDF1F5">
      <div style="flex:1;min-width:0;font-size:11.5px">
        <div style="font-weight:700">${statusTxt(b)} · ${fmtARSc(b.budget_cents)}</div>
        <div style="color:var(--mut);font-size:10.5px">${b.last_reach ? `👁️ ${Number(b.last_reach).toLocaleString('es-AR')} alcance · 💸 ${fmtARSc(b.last_spend_cents)} gastados` : 'Ya la estamos poniendo en marcha'}</div>
      </div>
    </div>`).join('')
    : `<div class="st-empty">
         <div class="st-empty-ico">📣</div>
         <b>Tus pautas van a vivir acá</b>
         <p>Cuando potencies tu primer posteo, lo ves acá con su alcance y lo gastado, sin misterio.</p>
         <button class="btn btn-soft btn-sm" id="adsBoostGoRecs" style="margin-top:12px">⭐ Ver recomendaciones</button>
       </div>`;

  return `
  <div class="card" style="text-align:center">
    <h2 style="margin:0 0 4px">🚀 Potenciar</h2>
    <p class="d" style="margin:0">Llevá tus mejores posteos a más gente, sin tocar el administrador de anuncios. Nosotros nos ocupamos.</p>
  </div>
  ${topupBanner}
  ${!cfg ? `<div class="card" style="border:2px solid var(--yel)">
    <h3 style="margin:0 0 4px">💰 Tu crédito</h3>
    <p class="d" style="margin:0 0 10px">No pude cargar tu crédito ahora 😅 No es tu cuenta: es un tropiezo de conexión de mi lado.</p>
    <button class="btn btn-primary btn-sm" onclick="render()">Reintentar</button>
  </div>` : `<div class="card" style="border:2px solid var(--yel)">
    <h3 style="margin:0 0 4px">💰 Tu crédito</h3>
    <div style="font-size:30px;font-weight:800;margin:2px 0 6px">${fmtARSc(bal)}</div>
    <p class="d" style="margin:0 0 10px">Un solo precio por potenciar tu posteo durante 7 días en Instagram y Facebook. Sin letra chica.</p>
    ${cfg && cfg.mp_ready ? `
      <p style="font-weight:700;font-size:12.5px;margin:0 0 8px">Cargar crédito</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${topupBtns}</div>
      <div id="adsMsg"></div>
    ` : `<p class="d">La carga de crédito se habilita en estos días. <a href="#/app/chat" style="color:var(--cel);font-weight:700">Escribile a Posty</a> y la activamos para tu cuenta.</p>`}
  </div>`}
  <div class="card" id="adsRecsSec">
    <h3 style="margin:0 0 4px">⭐ Te recomendamos potenciar</h3>
    <p class="d" style="margin:0 0 10px">Elegidos por rendimiento real, no por corazonada.</p>
    ${recCards}
  </div>
  <div class="card">
    <h3 style="margin:0 0 6px">📣 Tus pautas</h3>
    ${boostRows}
  </div>`;
}

function bindAds() {
  // Si vuelve de MP con pauta pendiente, la atiende Mi semana
  try {
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    if (q.get('topup') === 'ok' && localStorage.getItem('posta_pending_boost')) {
      location.hash = '#/app/schedule?topup=ok'; return;
    }
  } catch (e) {}
  try {
    if (/\?topup=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/app/ads');
  } catch (e) {}
  document.querySelectorAll('[data-topup]').forEach(b => b.onclick = async () => {
    const msg = document.getElementById('adsMsg');
    b.disabled = true;
    try {
      const r = await api.post('/api/ads/topup', { amount_cents: Number(b.dataset.topup), return_to: 'ads' });
      track('checkout_start', { kind: 'ads_topup' }); trackBeacon();
      if (r && r.init_point) location.href = r.init_point; // checkout de MercadoPago
      else if (msg) msg.innerHTML = `<div class="err">No se pudo generar el pago</div>`;
    } catch (e) {
      if (msg) msg.innerHTML = `<div class="err">${esc(e.message || 'No se pudo generar el pago')}</div>`;
    }
    b.disabled = false;
  });
  const arc = document.getElementById('adsRecsCard');
  if (arc) bindAdsRecCards(arc, { balance: (ADS_CTX && ADS_CTX.balance) || 0, minTopup: (ADS_CTX && ADS_CTX.minTopup) || 1000000, returnTo: 'ads' });
  // Empty state "Tus pautas": el CTA lleva a la sección de recomendaciones (misma página).
  const bgRecs = document.getElementById('adsBoostGoRecs');
  if (bgRecs) bgRecs.onclick = () => {
    const sec = document.getElementById('adsRecsSec');
    if (sec && typeof sec.scrollIntoView === 'function') sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function showStreakCelebration(sk) {
  if (!sk || !sk.current) return;
  const lv = sk.level || { emoji: '🔥', name: '' };
  const pts = sk.current * 100;
  const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim();
  const isFirst = sk.newWeek && sk.current === 1;
  streakModalShell(`
    ${isFirst ? '<img src="ai-avatar.png" alt="Posty" style="width:64px;height:64px;border-radius:50%;box-shadow:0 4px 14px rgba(39,147,200,.35)">' : `<div class="big-emoji">${lv.emoji}</div>`}
    <h3 style="margin:12px 0 4px">${isFirst ? '¡Tu primera semana! 🎉' : (sk.leveledUp ? (biz ? `¡${esc(biz)} subió a ${esc(lv.name)}!` : '¡Subiste de nivel!') : '¡Racha en marcha!')}</h3>
    ${isFirst ? '<p style="font-size:15px;margin:0 0 6px;color:var(--mut)">La primera de muchas. Yo armo, yo publico — vos a mirar cómo crece 💪</p>' : ''}
    <p style="font-size:16px;margin:0 0 6px"><b>⚡ +100 pts</b> · ${pts} pts en total</p>
    <p style="font-size:15px;margin:0 0 6px"><b>${sk.current} ${sk.current === 1 ? 'semana seguida' : 'semanas seguidas'}</b>${lv.name ? ` · ${esc(lv.name)}` : ''}</p>
    ${streakNextTxt(sk)}
    ${streakShareBtns()}`);
  wireStreakModalBtns(sk);
}
// Tocar el HUD de XP: modal PRO de la racha — urgencia primero (loss aversion),
// héroe premium con anillo de progreso animado, acción concreta para mantenerla,
// camino de niveles aspiracional y stats con punch.
function streakPillModal(sk) {
  if (!sk || !sk.current) return;
  const lv = sk.level || { emoji: '🔥', name: '' };
  const pts = sk.current * 100;
  const levels = sk.levels || [];
  const curIdx = levels.findIndex(l => sk.level && l.name === sk.level.name);
  const nl = sk.nextLevel;
  const pct = nl ? Math.min(100, Math.round(sk.current / nl.at * 100)) : 100;
  const falta = nl ? nl.at - sk.current : 0;
  const nextTxt = nl
    ? `${sk.current} de ${nl.at} semanas · te ${falta === 1 ? 'falta 1 semana' : `faltan ${falta} semanas`} para ${nl.emoji} ${esc(nl.name)}`
    : `Nivel máximo alcanzado 👑`;
  // Anillo de progreso animado alrededor del badge (en vez de barrita plana)
  const R = 56, C = 2 * Math.PI * R;
  const ring = `<div class="stk-ring"><svg viewBox="0 0 128 128" width="128" height="128"><circle cx="64" cy="64" r="${R}" class="stk-ring-bg"/><circle cx="64" cy="64" r="${R}" class="stk-ring-fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 64 64)"/></svg><div class="stk-badge">${lv.emoji}</div></div>`;
  // Urgencia = retención: el countdown es LO PRIMERO que se ve.
  const left = fmtStreakLeft(sk.expiresInMs);
  const countdown = sk.expiringSoon
    ? `<div class="stk-count danger">⏳ Tu racha se apaga en <b>${left}</b></div>`
    : `<div class="stk-count">🔥 Racha viva · le quedan <b>${left}</b></div>`;
  // Acción concreta: exacto qué hacer + botón que lo lleva ahí.
  const cta = `<div class="stk-cta"><p>Programá 1 posteo y la racha sigue viva.</p><button class="btn btn-primary btn-block" id="stkGoSched">📅 Programar mi semana</button></div>`;
  const journey = levels.map((l, i) => {
    const isCur = i === curIdx;
    const done = !isCur && sk.current >= l.min;
    const isNext = !!(nl && l.name === nl.name);
    const node = `<div class="stk-node${isCur ? ' cur' : ''}${done ? ' done' : ''}${isNext ? ' next' : ''}${!isCur && !done && !isNext ? ' lock' : ''}"><div class="stk-dot">${l.emoji}</div><small>${esc(l.name)}</small></div>`;
    const link = i < levels.length - 1 ? `<div class="stk-link${done || isCur ? ' on' : ''}"></div>` : '';
    return node + link;
  }).join('');
  // Récord a batir (solo si el best supera la racha actual)
  const beatTxt = sk.best > sk.current ? `<p class="stk-beat">🏆 Tu récord: ${sk.best} — te faltan ${sk.best - sk.current}</p>` : '';
  streakModalShell(`
    ${countdown}
    <div class="stk-hero">
      ${ring}
      <p class="stk-eyebrow">Nivel ${esc(lv.name)}</p>
      <p class="stk-pts"><b>⚡ ${pts}</b> pts</p>
      <p class="stk-next">${nextTxt}</p>
      ${beatTxt}
    </div>
    ${cta}
    ${journey ? `<div class="stk-journey">${journey}</div>` : ''}
    <div class="stk-smart"><b>🧠 Cuanto más subís, mejor trabajo para vos</b>Cada semana entiendo más tu producto: qué vende, qué le gusta a tu gente. Mejores posteos → más clientes en tu Instagram → más ventas. El tiempo con Posty se nota 💰</div>
    <div class="stk-stats">
      <div class="stk-stat"><b>🔥 ${sk.current}</b><span>${sk.current === 1 ? 'semana seguida' : 'semanas seguidas'}</span></div>
      <div class="stk-stat"><b>🏆 ${sk.best}</b><span>mejor racha</span></div>
      <div class="stk-stat"><b>+100</b><span>pts por semana</span></div>
    </div>
    ${WEEKLY_BARS_HTML ? `<p class="d" style="margin:14px 0 6px;text-align:center">Posteos por semana</p><div class="bars" style="height:90px;margin:0 0 4px">${WEEKLY_BARS_HTML}</div>` : ''}
    <p class="stk-rule">La racha sigue viva mientras salga al menos un posteo cada 72 horas.</p>
    <p class="stk-share-t">🎁 Tu constancia también vende — compartila</p>
    ${streakShareBtns()}`);
  wireStreakModalBtns(sk);
  const go = document.getElementById('stkGoSched');
  if (go) go.onclick = () => { closeStreakModal(); location.hash = '#/app/schedule'; };
}
// Insignia opt-in para compartir: imagen "🔥 N semanas con Posta" (tamaño historia)
function shareStreakImage(sk) {
  if (!sk || !sk.current) return;
  const lv = sk.level || { emoji: '🔥', name: '' };
  const bc = (typeof brandColors === 'function' ? brandColors() : []).filter(Boolean);
  const c0 = bc[0] || '#2793C8', c1 = bc[1] || '#0A1E33';
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1080, 1920);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  x.textAlign = 'center'; x.fillStyle = '#FFFFFF';
  x.font = '220px serif'; x.fillText(lv.emoji, 540, 700);
  x.font = '900 210px -apple-system, Arial, sans-serif'; x.fillText(String(sk.current), 540, 1010);
  x.font = '700 62px -apple-system, Arial, sans-serif';
  x.fillText(sk.current === 1 ? 'SEMANA CON POSTY' : 'SEMANAS CON POSTY', 540, 1130);
  x.globalAlpha = 0.85; x.font = '500 44px -apple-system, Arial, sans-serif';
  x.fillText('Mi negocio no para ' + lv.emoji, 540, 1240);
  x.globalAlpha = 0.6; x.font = '500 36px -apple-system, Arial, sans-serif';
  x.fillText('Hecho por Posty 🤖', 540, 1820);
  x.globalAlpha = 1;
  cv.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'mi-racha-posty.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Mi racha con Posty' }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'mi-racha-posta.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}

/* ---------- Barra XP (racha) ---------- */
// En Schedule solo se usa el expBanner (aviso de racha por apagarse) y el
// cálculo de WEEKLY_BARS_HTML. La barrita del nivel se eliminó: el nivel
// vive en el avatar del chat (badge "Nv N" con tap → progreso).
function xpStripHTML(sk, st, draftN) {
  if (!st) return { xpStrip: '', expBanner: '' };
  const w = st.week, mo = st.month;
  // Gráfico de constancia (últimas 8 semanas): vive en el modal de racha.
  const maxT = Math.max(1, ...st.weekly.map(x => x.total));
  const weeksWithData = (st.weekly || []).filter(x => x.total > 0).length;
  WEEKLY_BARS_HTML = weeksWithData >= 3
    ? st.weekly.map(x => `<div class="bar-w"><div class="bar" style="height:${Math.max(4, Math.round((x.total / maxT) * 100))}%"></div><span>${esc(x.label)}</span></div>`).join('')
    : '';
  const expBanner = sk && sk.expiringSoon ? `
  <div class="card" style="border:1.5px solid #FEC14D;background:#FFF9EC">
    <div class="nudge-top"><span class="nudge-ico">⏳</span><div><h3>Tu racha ${esc(sk.level.emoji)} se apaga en ${fmtStreakLeft(sk.expiresInMs)}</h3>
    <p>${draftN > 0 ? 'Programá tus borradores acá abajo 👇 y la racha sigue viva.' : 'Si no sale ningún posteo en ese tiempo, la racha vuelve a cero.'}</p></div></div>
  </div>` : '';
  // Barra superior unificada: racha + tu progreso en un solo vistazo.
  const hasStreak = sk && sk.current > 0 && sk.level;
  const stripInner = `
    <span class="xp-brand" id="xpBrand"></span>
    <span class="xp-bar"><span id="xpBrandBar" style="width:0%"></span></span>
    <span class="xp-sub" id="xpBrandSub">Cargando tu progreso…</span>
    <span class="xp-exp" id="xpBrandExp"></span>
    <span class="xp-stats" id="xpBrandStats"></span>`;
  const xpStrip = hasStreak
    ? `<button class="xp-strip" id="xpStrip" aria-label="Ver el progreso de tu racha">${stripInner}</button>`
    : `<div class="xp-strip" id="xpStrip" style="cursor:default">${stripInner}</div>`;
  return { xpStrip, expBanner };
}


/* ---------- Handoff a Posty en el chat ---------- */
// "Contame de tu negocio" vive en el chat: Posty lo pide ahí con grabador inline.
function postyAskInChat(kind) {
  try { sessionStorage.setItem('posty-force-nudge', kind); } catch (e) {}
  location.hash = '#/app/chat';
}



/* ---------- TRACK 3 · "LA SEMANA ESPERÁNDOTE AL ENTRAR" ---------- */
// Visión: si ya tenemos los datos del negocio, la semana se arma SOLA en segundo
// plano al entrar a Mi semana, sin tocar "⚡ Armemos tu semana".
// Solo crea borradores: nada se programa ni se publica solo.
let __autoWeekPoll = null;
function autoWeekKey() {
  // Una sola vez por semana: lunes (misma convención que weekStartMonday).
  const m = weekStartMonday(new Date());
  const p2 = (v) => String(v).padStart(2, '0');
  return 'posta_autoweek_' + m.getFullYear() + '-' + p2(m.getMonth() + 1) + '-' + p2(m.getDate());
}
function autoWeekShowBar() {
  if (document.getElementById('autoWeekBar')) return;
  const main = document.querySelector('.main');
  if (!main) return;
  const bar = document.createElement('div');
  bar.id = 'autoWeekBar';
  bar.setAttribute('role', 'status');
  bar.setAttribute('style', 'display:flex;align-items:center;gap:10px;background:#ffffff;border:1.5px solid rgba(39,147,200,.4);border-radius:14px;padding:10px 12px;margin:0 0 12px;font-size:12.5px;line-height:1.4;box-shadow:0 2px 12px rgba(39,147,200,.10)');
  bar.innerHTML = '<span style="font-size:16px">✨</span>' +
    '<span style="flex:1;min-width:0">Armando tu semana en segundo plano…</span>' +
    '<button class="btn btn-ghost btn-sm" id="autoWeekCancelBtn" type="button">Cancelar</button>';
  main.prepend(bar);
  const c = document.getElementById('autoWeekCancelBtn');
  if (c) c.addEventListener('click', (e) => { e.preventDefault(); autoWeekCancel(); });
}
function autoWeekHideBar() {
  const b = document.getElementById('autoWeekBar');
  if (b) b.remove();
  if (__autoWeekPoll) { clearInterval(__autoWeekPoll); __autoWeekPoll = null; }
}
function autoWeekCancel() {
  // Convención de cancelación para el pool del autopilot: mientras sea truthy, el
  // pool la respeta entre items (la chequea antes de encolar cada uno). Si el pool
  // no la honra, el fallback defensivo igual vale: el aviso desaparece y esta
  // semana no se vuelve a armar sola. Se guarda con el weekkey para no bloquear
  // semanas futuras en la misma sesión.
  window.__autoWeekCancel = autoWeekKey();
  window.__autoWeekRunning = false;
  autoWeekHideBar();
}
// Vigila la corrida automática y oculta el aviso cuando termina (éxito, gate de
// ADN, error o cancelación). El autopilot ya hace render() + scroll al terminar.
function autoWeekWatch() {
  if (__autoWeekPoll) clearInterval(__autoWeekPoll);
  let seen = AUTOPILOT_RUNNING, waited = 0;
  __autoWeekPoll = setInterval(() => {
    waited += 1500;
    if (AUTOPILOT_RUNNING) seen = true;
    else if (seen || waited >= 45000 || window.__autoWeekCancel === autoWeekKey()) {
      window.__autoWeekRunning = false;
      if (__autoWeekPoll) { clearInterval(__autoWeekPoll); __autoWeekPoll = null; }
      autoWeekHideBar();
    }
  }, 1500);
}
async function autoWeekDataReady() {
  // 1) ADN completo → listo para generar.
  try { const ds = await api.get('/api/dna/status'); if (ds && ds.complete) return true; } catch (e) {}
  // 2) Datos de trial: /prueba pre-carga el perfil con lo que contó el cliente.
  //    Mismo umbral que el backend usa para decidir si puede generar sin inventar.
  const p = PROFILE || {};
  const name = String(p.business_name || '').trim();
  const desc = String(p.description || '').trim();
  return !!(name && desc.length >= 20);
}
async function maybeAutoStartWeek() {
  try {
    const wk = autoWeekKey();
    // Re-entrada a mitad de una corrida automática: mostrar el aviso de nuevo, sin relanzar.
    // (Va primero: el flag de localStorage ya quedó marcado al arrancar.)
    if (window.__autoWeekRunning && AUTOPILOT_RUNNING) { autoWeekShowBar(); autoWeekWatch(); return; }
    // Una sola vez por semana: entrar y salir no re-arma.
    let done = null;
    try { done = localStorage.getItem(wk); } catch (e) {}
    if (done) return;
    if (window.__autoWeekCancel === wk) return; // se canceló a mano (fallback sin localStorage)
    if (AUTOPILOT_RUNNING) return; // corrida manual en curso: no interferir
    // Mismos datos que calcula scheduleView: borradores, programados y publicados.
    const all = await api.get('/api/posts').catch(() => []);
    const drafts = all.filter(p => p.status === 'draft');
    const scheduled = all.filter(p => p.status === 'scheduled');
    if (drafts.length || scheduled.length) return; // hay trabajo en curso: no pisar nada
    // Fast-track: cuenta nueva (0 publicados) con candidatos → su camino es la
    // tarjeta "Tu primer posteo", no el armado automático.
    const publishedCount = all.filter(p => p.status === 'published').length;
    const ftCandidates = drafts.slice().sort((a, b) => b.id - a.id).filter(p => p.image_path).slice(0, 3);
    if (publishedCount === 0 && ftCandidates.length > 0) return;
    const n = (ME && ME.posts_per_week) || 3;
    // Sin cupo para la semana completa no arrancamos en segundo plano:
    // el usuario elige a mano (el autopilot le ofrece la versión parcial).
    try {
      const quota = await api.get('/api/quota').catch(() => null);
      if (quota && quota.left < n) return;
    } catch (e) {}
    // Sin lo esencial del negocio no arrancamos: el gate de ADN del autopilot
    // ya maneja ese caso cuando el usuario toca el botón manual.
    if (!(await autoWeekDataReady())) return;
    // Todo OK: marcar la semana ANTES de arrancar y lanzar el autopilot de siempre.
    try { localStorage.setItem(wk, '1'); } catch (e) {}
    window.__autoWeekCancel = false;
    window.__autoWeekRunning = true;
    autoWeekShowBar();
    // runAutopilotSmart es la misma entrada del botón manual: aplica el plan
    // semanal si existe y cae a runAutopilot si no. Escribe su progreso en
    // #apProg-semana; la barrita de arriba es solo aviso + cancelar.
    runAutopilotSmart(n, 'semana');
    autoWeekWatch();
  } catch (e) { /* silencioso: el botón manual sigue intacto */ }
}


/* ---------- AJUSTES ---------- */

/* ---------- CONECTAR INSTAGRAM: popup de primer ingreso ---------- */
function postAuthLanding(isReg) {
  // FASE 4 (autopilot): onboarding si falta el negocio; si no, directo a la
  // semana. El chat queda como escape hatch en la navegación secundaria.
  const homeTab = mzHomeHash();
  const chosen = localStorage.getItem('posta_chosen_plan');
  // Deep-link previo al login: si el guardia nos desvio desde una ruta
  // #/app/* concreta, el destino tras el login es ESA, no el default.
  // Se consume siempre (aunque no se use) para que no salte despues.
  // En un registro fresco manda el onboarding: la cuenta recien nace.
  let ret = null;
  try { ret = sessionStorage.getItem('posta_return_to'); sessionStorage.removeItem('posta_return_to'); } catch (e) {}
  const retOk = !isReg && ret && ret.startsWith('#/app/') && ret.split('?')[0] !== '#/app/onboarding';
  if (PROFILE && PROFILE.business_name) {
    location.hash = chosen ? '#/app/ajustes?plan_sel=' + encodeURIComponent(chosen) : (retOk ? ret : homeTab);
  } else if (retOk) {
    location.hash = ret;
  } else {
    location.hash = '#/app/onboarding';
    OB = freshOB();
  }
}
function igDismissKey() {
  const id = (ME && (ME.id || ME.email)) || 'anon';
  return 'posta_ig_dismissed_' + id;
}
function maybeShowIgPopup(tab) {
  try {
    if (!ME || !PROFILE) return;
    if (PROFILE.ig_connected) return;
    if (tab === 'onboarding') return; // no interrumpir el onboarding
    if (document.getElementById('igFirstOverlay')) return;
    let dismissed = null;
    try { dismissed = localStorage.getItem(igDismissKey()); } catch (e) {}
    if (dismissed) return;
    const ov = document.createElement('div');
    ov.id = 'igFirstOverlay';
    ov.className = 'pz-exp-overlay';
    ov.innerHTML = `
    <div class="pz-exp-modal" role="dialog" aria-modal="true">
      <div style="font-size:46px;line-height:1">📸</div>
      <h2>Conectá tu Instagram</h2>
      <p class="pz-exp-sub">Así Posty deja tu semana lista para publicar.</p>
      <button class="btn btn-primary btn-block" id="igFirstGo" style="padding:15px;font-size:15px">Conectar Instagram</button>
      <div id="igFirstMsg" style="margin-top:8px;text-align:left"></div>
      <div class="hint" style="margin-top:10px">🔒 Nunca vemos ni guardamos tu contraseña.</div>
      <div class="hint" id="igPrivTip" style="margin-top:8px;display:none">💡 Parece que estás en navegación privada: ahí Instagram suele pedirte un código de verificación extra. En una ventana normal son 2 toques.</div>
      <details style="margin:12px 0 4px;text-align:left">
        <summary style="font-weight:700;cursor:pointer;font-size:12.5px;color:var(--mut)">¿Cómo hago mi cuenta profesional?</summary>
        <ol style="margin:10px 0 0 20px;padding:0;font-size:12.5px;color:var(--mut);line-height:1.8">
          <li>Abrí Instagram y andá a tu perfil</li>
          <li>Tocá <b>☰</b> → <b>Configuración y privacidad</b></li>
          <li><b>Tipo de cuenta y herramientas</b> → <b>Cambiar a cuenta profesional</b></li>
          <li>Elegí <b>Creator</b> o <b>Business</b> y completá los pasos</li>
        </ol>
        <div class="hint" style="margin-top:6px">Instagram no permite hacer este cambio desde otra app: se hace dentro de Instagram.</div>
      </details>
      <div style="margin-top:8px"><a href="#" id="igFirstSkip" style="color:var(--dim);font-size:12.5px">Lo hago después →</a></div>
    </div>`;
    document.body.appendChild(ov);
    try {
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(es => {
          const q = es && es.quota;
          if (q && q < 300 * 1024 * 1024) {
            const tip = ov.querySelector('#igPrivTip');
            if (tip) tip.style.display = '';
          }
        }).catch(() => {});
      }
    } catch (e2) {}
    const go = ov.querySelector('#igFirstGo');
    if (go) go.onclick = igConnectHere;
    const skip = ov.querySelector('#igFirstSkip');
    if (skip) skip.onclick = (e) => {
      e.preventDefault();
      try { localStorage.setItem(igDismissKey(), '1'); } catch (e2) {}
      ov.remove();
    };
  } catch (e) {}
}
/* ---------- toast global ---------- */
function toast(html) {
  try {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0A1E33;color:#fff;padding:14px 20px;border-radius:14px;font-size:13px;line-height:1.5;z-index:10001;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,.35);text-align:center';
    t.innerHTML = html;
    document.body.appendChild(t);
    setTimeout(() => { try { t.remove(); } catch (e) {} }, 5200);
  } catch (e) {}
}
/* ---------- resultado del OAuth (?ig=) en cualquier pantalla ---------- */
function handleIgResult() {
  let q = '';
  try { q = location.hash.split('?')[1] || ''; } catch (e) {}
  const hq = new URLSearchParams(q);
  const r = hq.get('ig');
  if (!r) return;
  try { history.replaceState(null, '', location.pathname + location.hash.split('?')[0]); } catch (e) {}
  if (r === 'ok') {
    toast('✅ <b>¡Instagram conectado!</b>' + (hq.get('demo_off') ? '<br>El modo demo se apagó solo — ahora publicás de verdad.' : '') + (hq.get('brand_reset') ? '<br>Conectaste otra cuenta: reiniciamos tu marca y borramos los posteos pendientes del negocio anterior.' : ''));
    // 🌐 Posta estudia tu web: si nunca se analizó, la analizamos en background
    // (magia, cero pasos). El backend resuelve la web de la bio en vivo si no
    // le pasamos URL. Silencio total si falla: no puede romper ni demorar
    // el flujo de conexión.
    try {
      api.get('/api/website/status').then(st => {
        if (!st || st.ok !== false) return; // ya analizada (o en análisis): no molestar
        const cand = String((st && st.url) || (PROFILE && (PROFILE.ig_website || PROFILE.website)) || (SETTINGS && (SETTINGS.ig_website || SETTINGS.website)) || '').trim();
        api.post('/api/website/analyze', cand ? { url: cand } : {})
          .then(() => { try { if (typeof PZ_WEB_REFRESH !== 'undefined' && PZ_WEB_REFRESH) PZ_WEB_REFRESH(); } catch (e) {} })
          .catch(() => {});
      }).catch(() => {});
    } catch (e) {}
    // 🔔 Posty te avisa: tras conectar IG, pedir permiso push UNA vez (oportuno, nunca en frío)
    try { maybeAskPushPostIg(); } catch (e) {}
  } else if (r === 'personal') {
    toast('⚠️ <b>Tu cuenta de Instagram es personal.</b><br>Para publicar necesitás una cuenta profesional (Business o Creator).');
  } else if (r === 'error') {
    toast('❌ ' + esc(hq.get('msg') || 'No se pudo conectar tu Instagram.'));
  }
}

/* ---------- ONBOARDING (4 pasos) ---------- */
let OB = null;
let IG_VERIFIED_AT = null;
const igSince = (s) => {
  try {
    const d = String(s.ig_token_issued_at || '').slice(0, 10).split('-');
    return d.length === 3 ? `${d[2]}/${d[1]}` : '';
  } catch (e) { return ''; }
}; // última verificación manual de la conexión IG (HH:MM)
let IG_MODE_WARN = false;  // aviso: modo Real elegido sin cuenta conectada
function freshOB() {
  return {
    chat: [],            // [{role:'user'|'assistant', text}]
    step: 0, total: 8,   // respuestas dadas
    chips: null, awaitLogo: false, awaitPhotos: false,
    loading: false, done: false, started: false,
    phase: 'chat',       // 'chat' | 'summary'
    mode: 'form',        // FASE 4: 'form' (default, directo) | 'chat' (alternativa conversacional)
    profile: null, summary: null,
    colors: [],          // [c1,c2,c3] extraídos del logo
  };
}
// ---- Onboarding diferible: el progreso vive en localStorage ('posta_ob') y se retoma ----
const OB_KEY = 'posta_ob';
function saveOB() {
  try {
    if (!OB) return;
    const { loading, _resumePending, ...rest } = OB; // transitorios: no se persisten
    localStorage.setItem(OB_KEY, JSON.stringify(rest));
  } catch (e) {}
}
function loadOB() {
  try {
    const raw = localStorage.getItem(OB_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || !Array.isArray(o.chat) || typeof o.step !== 'number') return null; // corrupto
    if (o.phase === 'summary' && o.profile) { /* resumen sin confirmar: se retoma */ }
    else if (o.done || o.step >= (o.total || 8)) return null; // ya terminado: se descarta
    const clean = Object.assign(freshOB(), o, { loading: false });
    const last = clean.chat[clean.chat.length - 1];
    if (clean.phase === 'chat' && !clean.done && last && last.role === 'user') clean._resumePending = true; // la respuesta de la IA quedó en vuelo: se re-pide al entrar
    return clean;
  } catch (e) { return null; }
}
function clearOB() { try { localStorage.removeItem(OB_KEY); } catch (e) {} }
// ---- Onboarding conversacional ----
function obScroll() {
  const b = $('#obBox');
  if (b) b.scrollTop = b.scrollHeight;
}
async function obNext() {
  const o = OB; if (!o || o.done || o.phase !== 'chat') return;
  o.loading = true; render();
  try {
    const r = await api.post('/api/onboarding/chat', { history: o.chat.map(m => ({ role: m.role, text: m.text })) });
    if (r && r.done) { o.done = true; obFinish(); return; }
    if (r && r.reply) {
      o.chat.push({ role: 'assistant', text: r.reply });
      o.step = typeof r.answered === 'number' ? r.answered : o.step;
      o.chips = r.chips || null;
      o.awaitLogo = !!r.awaitLogo;
      o.awaitPhotos = !!r.awaitPhotos;
    } else {
      // Sin respuesta válida: sacar el mensaje del usuario para que reintente
      const ui = o.chat.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop();
      if (ui !== undefined) o.chat.splice(ui, 1);
      o.chat.push({ role: 'assistant', text: 'Se me cortó un segundo 😅 ¿me repetís eso?' });
    }
  } catch (e) {
    o.chat.push({ role: 'assistant', text: 'Tuve un problema de conexión 😅 ¿probamos de nuevo? Escribime tu respuesta.' });
  }
  o.loading = false; saveOB(); render(); obScroll();
}
async function obSend(text) {
  const o = OB; if (!o || o.loading || o.done || o.phase !== 'chat') return;
  track('onboarding_step', { step: o.step, total: o.total });
  o.chat.push({ role: 'user', text: (text || '').trim() });
  o.chips = null;
  saveOB();
  render(); obScroll();
  obNext();
}
async function obFinish() {
  const o = OB; if (!o) return;
  o.loading = true; render();
  try {
    const qa = [];
    let lastQ = '';
    o.chat.forEach(m => {
      if (m.role === 'assistant') lastQ = m.text;
      else if (m.role === 'user') { qa.push({ q: lastQ, text: m.text }); lastQ = ''; }
    });
    const r = await api.post('/api/onboarding/finish', { history: qa });
    if (r && r.ok) { o.profile = r.profile; o.summary = r.summary; o.phase = 'summary'; }
    else o.chat.push({ role: 'assistant', text: 'No pude cerrar la entrevista 😅 ¿me contás de nuevo en una línea qué vendés?' }), o.done = false, o.phase = 'chat';
  } catch (e) {
    o.chat.push({ role: 'assistant', text: 'Tuve un problema cerrando 😅 escribime "listo" y lo intentamos de nuevo.' });
    o.done = false; o.phase = 'chat';
  }
  o.loading = false; saveOB(); render(); obScroll();
}
// FASE 4: guarda el perfil del onboarding (form directo o entrevista) con el
// mismo mapeo a /api/profile, y aterriza en la semana. Extraído de obConfirmSave.
async function obSaveProfile(p, colors) {
  const cats = ['ropa', 'gastronomia', 'cafeteria', 'belleza', 'barberia', 'fitness', 'salud', 'mascotas', 'servicios', 'educacion', 'tecnologia', 'hogar', 'inmobiliaria', 'eventos', 'viajes', 'arte'];
  const category = cats.includes(p.category) ? p.category : 'otro';
  const desc = [p.description, p.audience ? `Cliente ideal: ${p.audience}` : '', p.differentiator ? `Diferencial: ${p.differentiator}` : ''].filter(Boolean).join(' ').slice(0, 600);
  const igu = String(p.instagram || '').trim().replace(/^@/, '').replace(/\s+/g, '');
  await api.put('/api/profile', {
    business_name: p.business_name || 'Mi negocio', category, description: desc,
    competitors: '', goal: p.goal || 'vender',
    ig_username: igu,
    tone: (PROFILE && PROFILE.tone) || 'canchero',
  });
  const cols = (colors || []).filter((c, i, a) => c && a.indexOf(c) === i);
  if (cols.length >= 2) await api.put('/api/settings', { brand_colors: cols });
  SETTINGS = await api.get('/api/settings');
  await refreshSession();
  clearOB(); // onboarding confirmado: ya no hay nada que retomar
  const chosenPlan = localStorage.getItem('posta_chosen_plan');
  location.hash = chosenPlan ? '#/app/ajustes?plan_sel=' + encodeURIComponent(chosenPlan) : '#/app/schedule';
}
async function obConfirmSave() {
  const o = OB; if (!o) return;
  const btn = $('#obConfirm'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
  try {
    await obSaveProfile(o.profile || {}, o.colors || []);
  } catch (e) {
    const m = $('#obMsg'); if (m) m.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = '✅ Todo bien, arranquemos'; }
  }
}
// FASE 4: submit del formulario directo — valida, arma el perfil y guarda.
async function obFormSubmit() {
  const o = OB; if (!o) return;
  const gv = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const msg = $('#obFormMsg');
  const biz = gv('obfBiz'), cat = gv('obfCat');
  if (!biz) { if (msg) msg.innerHTML = '<div class="err">Contanos el nombre de tu negocio 🙂</div>'; return; }
  if (!cat) { if (msg) msg.innerHTML = '<div class="err">Elegí tu rubro 🙂</div>'; return; }
  const btn = $('#obFormGo');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
  try {
    await obSaveProfile({
      business_name: biz, category: cat,
      description: gv('obfDesc'), audience: '', differentiator: '',
      instagram: gv('obfIg'), goal: gv('obfGoal') || 'vender',
    }, []);
    if (msg) msg.innerHTML = '';
  } catch (e) {
    if (msg) msg.innerHTML = `<div class="err">${esc((e && e.message) || 'No se pudo guardar')}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Armar mi semana →'; }
  }
}
function obSummaryHTML() {
  const o = OB, p = o.profile || {};
  const rows = [
    ['🏪', 'Negocio', p.business_name],
    ['👕', 'Rubro', p.category && p.category !== 'otro' ? p.category : ''],
    ['🎯', 'Cliente ideal', p.audience],
    ['✨', 'Diferencial', p.differentiator],
    ['📸', 'Instagram', p.instagram ? '@' + String(p.instagram).replace(/^@/, '') : ''],
    ['🚀', 'Objetivo', ({ vender: 'Vender más', seguidores: 'Conseguir seguidores', local: 'Llenar mi local', novedades: 'Contar novedades' })[p.goal] || ''],
  ].filter(([, , v]) => v);
  return `<div class="page-head"><div class="ph-ico">🧠</div><div class="ph-txt"><h1>Esto entendí</h1><p class="sub">Revisalo — con esto armo tu contenido.</p></div></div>
  <div class="card" style="max-width:640px">
    <p style="font-size:14px;line-height:1.65;margin:0 0 14px">${esc(o.summary || '')}</p>
    ${rows.map(([ico, k, v]) => `<div class="cm-tip"><span>${ico}</span><span><b>${esc(k)}:</b> ${esc(v)}</span></div>`).join('')}
    ${o.colors.length >= 2 ? `<div class="cm-tip"><span>🎨</span><span><b>Colores:</b> ${o.colors.map(c => `<span style="display:inline-block;width:18px;height:18px;border-radius:6px;background:${esc(c)};border:1px solid var(--line);vertical-align:-3px;margin-right:4px"></span>`).join('')} <span style="color:var(--mut);font-size:11.5px">de tu logo</span></span></div>` : ''}
    <div id="obMsg" style="margin-top:8px"></div>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
      <button class="btn btn-ghost" id="obFix">✏️ Corregir</button>
      <button class="btn btn-primary" id="obConfirm" style="flex:1">✅ Todo bien, arranquemos</button>
    </div>
    <div style="text-align:center;margin-top:14px"><a href="#/app/schedule" style="color:var(--dim);font-size:12.5px">Hacerlo después →</a></div>
  </div>`;
}
function onboardingView() {
  const o = OB;
  if (o.phase === 'summary' && o.profile) return obSummaryHTML();
  // FASE 4 (autopilot): el default es el formulario directo; la entrevista
  // conversacional queda como alternativa explícita (modo 'chat').
  if (o.mode === 'chat') return obChatHTML(o);
  return obFormHTML();
}

// FASE 4 — formulario directo de onboarding (default): 5 datos y listo, sin
// charla. Guarda con el mismo mapeo que la entrevista (obSaveProfile).
function obFormHTML() {
  const cats = [['ropa','👕 Ropa'],['gastronomia','🍔 Gastronomía'],['cafeteria','☕ Cafetería'],['belleza','💅 Belleza'],['barberia','💈 Barbería'],['fitness','🏋️ Fitness'],['salud','🩺 Salud'],['mascotas','🐾 Mascotas'],['servicios','🔧 Servicios'],['educacion','🎓 Educación'],['tecnologia','💻 Tecnología'],['hogar','🏠 Hogar'],['inmobiliaria','🏘️ Inmobiliaria'],['eventos','🎉 Eventos'],['viajes','✈️ Viajes'],['arte','🎨 Arte']];
  const goals = [['vender','Vender más'],['seguidores','Conseguir seguidores'],['local','Llenar mi local'],['novedades','Contar novedades']];
  return `<div class="page-head"><div class="ph-ico">🚀</div><div class="ph-txt"><h1>Contame de tu negocio</h1><p class="sub">5 datos y armo todo por vos — sin charlas.</p></div></div>
  <div class="card" style="max-width:640px">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <a href="#/app/schedule" style="color:var(--dim);font-size:11.5px;font-weight:600;white-space:nowrap">Hacerlo después →</a>
    </div>
    <div class="field"><label>Nombre de tu negocio *</label><input id="obfBiz" placeholder="Ej: Café Martínez" maxlength="60" autocomplete="off"></div>
    <div class="field"><label>Rubro *</label><select id="obfCat"><option value="">Elegí tu rubro…</option>${cats.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('')}</select></div>
    <div class="field"><label>Instagram</label><input id="obfIg" placeholder="@tu_negocio" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    <div class="field"><label>¿Qué buscás con tu Instagram?</label><select id="obfGoal">${goals.map(g => `<option value="${g[0]}">${g[1]}</option>`).join('')}</select></div>
    <div class="field" style="margin-bottom:6px"><label>¿Qué vendés?</label><textarea id="obfDesc" rows="3" maxlength="600" placeholder="En 1-2 líneas: qué ofrecés y qué te hace diferente"></textarea></div>
    <div id="obFormMsg" style="margin-top:8px"></div>
    <button class="btn btn-primary btn-block" id="obFormGo" style="margin-top:14px">Armar mi semana →</button>
    <p style="text-align:center;margin:12px 0 0"><button type="button" id="obChatAlt" style="background:none;border:0;color:var(--cel);font-size:12.5px;font-weight:700;cursor:pointer">¿Preferís contármelo charlando? 💬</button></p>
  </div>`;
}

// Entrevista conversacional (alternativa, ya no default): extraída de
// onboardingView sin cambios de lógica. Usa /api/onboarding/chat.
function obChatHTML(o) {
  if (!o.started || o._resumePending) { o.started = true; o._resumePending = false; setTimeout(() => { if (OB === o && !o.loading && !o.done && o.phase === 'chat') obNext(); }, 60); }
  const msgs = o.chat.map(m => `<div class="chat-msg ${m.role === 'user' ? 'u' : 'ai'}">${esc(m.role === 'user' && !m.text ? '⏭️ Salteado' : m.text)}</div>`).join('');
  const pct = Math.round((o.step / o.total) * 100);
  return `<div class="page-head"><div class="ph-ico">🚀</div><div class="ph-txt"><h1>Te conozco primero</h1><p class="sub">Una charla rápida — con esto armo todo por vos.</p></div></div>
  <div class="card" style="max-width:640px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:11.5px;color:var(--mut);font-weight:700">Pregunta ${Math.min(o.step + 1, o.total)} de ${o.total}</span>
      <span style="display:flex;gap:10px;align-items:center;flex:none">
        ${o.phase === 'chat' && !o.loading ? `<button class="btn btn-ghost btn-sm" id="obSkip">Saltear ⏭️</button>` : ''}
        <button type="button" id="obFormAlt" style="background:none;border:0;color:var(--dim);font-size:11.5px;font-weight:600;white-space:nowrap;cursor:pointer">Completarlo directo →</button>
        <a href="#/app/schedule" style="color:var(--dim);font-size:11.5px;font-weight:600;white-space:nowrap">Hacerlo después →</a>
      </span>
    </div>
    <div style="height:6px;border-radius:99px;background:var(--line);margin:0 0 14px;overflow:hidden"><div style="height:100%;width:${pct}%;border-radius:99px;background:linear-gradient(90deg,var(--cel),var(--yel));transition:width .4s"></div></div>
    <div class="chat-box" id="obBox" style="min-height:230px;max-height:48vh">${msgs}${o.loading ? `<div class="chat-msg ai">⏳ …</div>` : ''}</div>
    ${o.chips && !o.loading ? `<div class="chat-chips" style="margin-top:10px">${o.chips.map(c => `<button data-obchip="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <div class="chat-input-row" style="margin-top:10px">
      ${o.awaitLogo && !o.loading ? `<button class="btn btn-soft" id="obLogoBtn" title="Subir logo">📤</button><input type="file" id="obLogoFile" accept="image/*,.pdf,.docx" hidden>` : ''}
      ${o.awaitPhotos && !o.loading ? `<button class="btn btn-soft" id="obPhotosBtn" title="Subir fotos">📸</button><input type="file" id="obPhotosFile" accept="image/*" multiple hidden>` : ''}
      <input id="obInput" class="in" placeholder="${o.awaitPhotos ? 'O escribí "saltear"' : 'Escribí tu respuesta…'}" maxlength="600" autocomplete="off" ${o.loading ? 'disabled' : ''}>
      <button class="btn btn-primary" id="obSend" title="Enviar" ${o.loading ? 'disabled' : ''}>➤</button>
    </div>
    ${o.awaitPhotos && !o.loading ? `<div id="obPhotosPrev" class="ob-photos-prev"></div>` : ''}
    <div id="obMsg" style="margin-top:8px"></div>
  </div>`;
}

function bindOnboarding() {
  const o = OB; if (!o) return;
  // FASE 4: formulario directo (default) — cableado del form + alternancia
  // de modo. (Esta función nunca se llamaba: la entrevista estaba sin cablear.)
  const fGo = $('#obFormGo');
  if (fGo) fGo.onclick = obFormSubmit;
  const cAlt = $('#obChatAlt');
  if (cAlt) cAlt.onclick = () => { o.mode = 'chat'; saveOB(); render(); };
  const fAlt = $('#obFormAlt');
  if (fAlt) fAlt.onclick = () => { o.mode = 'form'; saveOB(); render(); };
  const inp = $('#obInput'), send = $('#obSend');
  const doSend = () => { if (inp && !inp.disabled) { obSend(inp.value); inp.value = ''; } };
  if (send) send.onclick = doSend;
  if (inp) { inp.onkeydown = e => { if (e.key === 'Enter') doSend(); }; if (!inp.disabled) setTimeout(() => { try { inp.focus(); } catch (e) {} }, 150); }
  const sk = $('#obSkip'); if (sk) sk.onclick = () => obSend('');
  $$('[data-obchip]').forEach(b => b.onclick = () => obSend(b.dataset.obchip));
  const lb = $('#obLogoBtn'), lf = $('#obLogoFile');
  if (lb && lf) {
    lb.onclick = () => lf.click();
    lf.onchange = async () => {
      const orig = lf.files[0]; lf.value = '';
      if (!orig) return;
      const msg = $('#obMsg');
      try {
        const nm = (orig.name || '').toLowerCase();
        if (nm.endsWith('.pdf') || nm.endsWith('.docx')) { if (msg) msg.innerHTML = '<div class="hint">⏳ Convirtiendo tu archivo a imagen…</div>'; }
        const f = await logoFileToImage(orig);
        await uploadAssetFile(f, 'logo');
        try {
          const img = await loadImageFile(f);
          const cols = extractTopColors(img, 3);
          o.colors = cols.filter(Boolean).slice(0, 3);
        } catch (e) { /* mantiene sin colores */ }
        if (msg) msg.innerHTML = '';
        obSend('✅ Logo subido');
      } catch (e) {
        if (msg) msg.innerHTML = (e && e.cancelled) ? '' : `<div class="err">${esc(e.message)}</div>`;
      }
    };
  }
  const cf = $('#obConfirm'); if (cf) cf.onclick = obConfirmSave;
  // Paso de fotos del onboarding: hasta 5 fotos del negocio → biblioteca semilla
  // para que la IA genere contenido parecido cada semana.
  const pb = $('#obPhotosBtn'), pf = $('#obPhotosFile'), pv = $('#obPhotosPrev');
  if (pb && pf) {
    pb.onclick = () => pf.click();
    pf.onchange = async () => {
      const files = [...pf.files].filter(f => f.type.startsWith('image/')).slice(0, 5);
      pf.value = '';
      if (!files.length) return;
      const msg = $('#obMsg');
      pb.disabled = true;
      let ok = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (pv) pv.insertAdjacentHTML('beforeend', `<span class="ob-ph-thumb"><img src="${URL.createObjectURL(f)}" alt=""></span>`);
          if (msg) msg.innerHTML = `<div class="hint">⏳ Subiendo ${i + 1} de ${files.length}…</div>`;
          await uploadAssetFile(f, 'photo');
          ok++;
          if (pv && pv.lastElementChild) pv.lastElementChild.classList.add('done');
        }
        if (msg) msg.innerHTML = '';
        obSend(`✅ ${ok} ${ok === 1 ? 'foto subida' : 'fotos subidas'}`);
      } catch (e) {
        pb.disabled = false;
        if (msg) msg.innerHTML = `<div class="err">${esc(e.message || 'No se pudieron subir')}</div>`;
      }
    };
  }
  const fx = $('#obFix');
  if (fx) fx.onclick = () => {
    o.phase = 'chat';
    o.chat.push({ role: 'assistant', text: 'Dale, decime qué tengo que corregir 👇' });
    saveOB();
    render(); obScroll();
  };
  obScroll();
}
const GOALS = [
  ['vender', '💰', 'Vender más', 'Que cada post traiga clientes y ventas'],
  ['seguidores', '📈', 'Más seguidores', 'Crecer la comunidad y el alcance'],
  ['lanzamiento', '🚀', 'Lanzamientos', 'Anunciar novedades y promos con fuerza'],
  ['fidelizar', '🤝', 'Fidelizar clientes', 'Que te vuelvan a elegir, siempre'],
  ['referente', '🎓', 'Ser referente', 'Posicionarte como experto en tu rubro'],
];

/* ---------- ROUTER ---------- */
function bootSplashOff() {
  try { const b = document.getElementById('posty-boot'); if (b) b.remove(); } catch (e) {}
}
async function render() {
  // Splash de carga (index.html): en rutas #/app/* NO se saca al entrar.
  // Debajo del splash vive el shell publico y la app todavia esta resolviendo
  // sesion/vista: sacarlo antes de pintar era el flash a la landing en
  // deep-links y recargas logueadas. Se saca al pintar la app (appShell /
  // offline) o al caer en ruta publica/auth, cuyo render lo remueve aca.
  const _bootPath = (location.hash || '#/').split('?')[0];
  if (!_bootPath.startsWith('#/app')) bootSplashOff();
  // La hoja de chat de Inicio pudo quedar abierta en el body: cada render arranca limpio.
  try { document.body.classList.remove('mz-sheet-open'); } catch (e) {}
  // Tarjeta de reporte semanal: se llena sola si la vista la incluye.
  setTimeout(() => { try { enhanceWeekReport(); } catch (e) {} }, 60);
  // v223: enhanceIdeas ya NO se dispara desde render(): el bloque de
  // ideas tiene ciclo de vida propio y se enciende desde bindSchedule.
  setTimeout(() => { try { ttEnhance(); } catch (e) {} }, 80);
  const root = $('#app');
  // Captura de código de referido (?ref=): se guarda una vez, sanitizado
  try {
    const qs = new URLSearchParams(location.search);
    const r = qs.get('ref');
    if (r) {
      const clean = String(r).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      if (clean) {
        localStorage.setItem('posta_ref', clean);
        // Click en link de referido: una vez por sesión (embudo completo de referidos)
        if (!sessionStorage.getItem('ref_click_sent')) {
          sessionStorage.setItem('ref_click_sent', '1');
          track('ref_click', { code: clean.toLowerCase() });
        }
      }
    }
    // UTMs para CAC: se guardan y viajan con el registro
    const us = qs.get('utm_source'), uc = qs.get('utm_campaign');
    if (us || uc) {
      try { localStorage.setItem('posta_utm', JSON.stringify({ source: String(us || '').slice(0, 40), campaign: String(uc || '').slice(0, 80) })); } catch (e) {}
    }
  } catch (e) {}
  const hash = location.hash || '#/';
  const [path] = hash.split('?');

  // 📱 App instalada (standalone): NUNCA landing — el redirect va ANTES de la
  // rama de anclas porque iOS suele relanzar la web app en la última URL
  // (ancla incluida) y la landing se comía el ingreso (reporte 2026-10-20:
  // Valentino abría su app y caía en marketing, sin sesión y sin login a la
  // vista). Va directo a la home de la app; sin sesión, la ruta /app rebota
  // sola al login. Auth y reset quedan afuera: son destinos válidos.
  try {
    if (pwaIsStandalone() && !path.startsWith('#/app') && path !== '#/login' && path !== '#/registro' && !path.startsWith('#/reset')) {
      location.hash = mzHomeHash();
      return;
    }
  } catch (e) {}

  // Anclas dentro de la landing (#como-funciona, #incluye, #planes, #faq): no son rutas de la app
  if (!path.startsWith('#/')) {
    if (!LANDING_ON) {
      PLANS_CACHE = await api.get('/api/billing/plans').catch(() => null);
      root.innerHTML = landingView(PLANS_CACHE);
      LANDING_ON = true;
      lpInitHero();
      // Lugares reales: bajan solos con cada cliente nuevo
      refreshScarcity();
      // Puntitos del carrusel de planes
      const pr = document.getElementById('plansRow'), pd = document.getElementById('planDots');
      if (pr && pd) {
        const updDots = () => {
          const w = pr.firstElementChild ? pr.firstElementChild.offsetWidth + 14 : 1;
          const i = Math.min(2, Math.max(0, Math.round(pr.scrollLeft / w)));
          pd.querySelectorAll('span').forEach((d, j) => d.classList.toggle('on', j === i));
        };
        pr.addEventListener('scroll', updDots, { passive: true });
        updDots();
      }
    }
    const el = document.querySelector(path);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }));
    return;
  }

  if (path === '#/login' || path === '#/registro') {
    LANDING_ON = false;
    root.innerHTML = authView(path.slice(2));
    $('#btnAuth').onclick = async () => {
      const email = $('#f_email').value, password = $('#f_pass').value;
      try {
        const isReg = path !== '#/login';
        const body = { email, password };
        if (isReg) {
          const rf = localStorage.getItem('posta_ref');
          if (rf) body.ref = rf;
          try { const u = JSON.parse(localStorage.getItem('posta_utm') || 'null'); if (u) body.utm = u; } catch (e) {}
        } else {
          // Login viniendo de /prueba: pasamos el @ para importar su semana como borradores
          try {
            const tp = JSON.parse(localStorage.getItem('posta_trial_profile') || 'null');
            if (tp && tp.ig_username) body.trial_ig = tp.ig_username;
          } catch (e) {}
        }
        await api.post(isReg ? '/api/auth/register' : '/api/auth/login', body);
        if (!isReg) { try { localStorage.removeItem('posta_trial_profile'); } catch (e) {} }
        await refreshSession();
        if (isReg) localStorage.removeItem('posta_ref');
        if (isReg) { try { localStorage.removeItem('posta_utm'); } catch (e) {} }
        // Puente /prueba → cuenta: si viene de la prueba, pre-cargamos el perfil con los
        // datos que ya nos dio (negocio, rubro, etc.) y se saltea el onboarding.
        // Solo si la prueba es fresca (24h): datos viejos de tests no deben volverse marca permanente.
        if (isReg) {
          try {
            const tp = JSON.parse(localStorage.getItem('posta_trial_profile') || 'null');
            const fresh = tp && tp.saved_at && (Date.now() - tp.saved_at < 24 * 3600 * 1000);
            if (fresh && tp.business_name) {
              const catMap = { moda: 'ropa', gastronomia: 'gastronomia', belleza: 'belleza', fitness: 'fitness', mascotas: 'mascotas', salud: 'salud', hogar: 'hogar', inmobiliaria: 'inmobiliaria', autos: 'servicios', educacion: 'educacion', turismo: 'viajes', eventos: 'eventos', tecnologia: 'tecnologia', deco: 'hogar', joyeria: 'otro', fotografia: 'arte', profesionales: 'servicios', flores: 'otro', bar: 'gastronomia', cafeteria: 'cafeteria', barberia: 'barberia', servicios: 'servicios', viajes: 'viajes', arte: 'arte', otro: 'otro' };
              await api.put('/api/profile', {
                business_name: String(tp.business_name).slice(0, 80),
                category: catMap[tp.category] || 'otro',
                description: String(tp.description || '').slice(0, 600),
                competitors: String(tp.competitors || '').slice(0, 200),
                ig_username: String(tp.ig_username || '').slice(0, 40),
                tone: tp.tone === 'tu' ? 'profesional' : 'canchero',
                goal: 'vender',
              });
              const bc = (tp.brand_colors || []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
              if (bc.length >= 2) await api.put('/api/settings', { brand_colors: bc.slice(0, 3) }).catch(() => {});
              await refreshSession();
            }
          } catch (e) {}
          localStorage.removeItem('posta_trial_profile');
        }
        // Primer ingreso: el popup de conectar Instagram aparece solo (una vez por cuenta)
        postAuthLanding(isReg);
      } catch (e) {
        const dup = /ya está registrado/i.test(e.message || '');
        $('#formErr').innerHTML = `<div class="err">${dup ? `Ese email ya tiene cuenta. ¿Eras vos? <a href="#/login" style="color:var(--cel);font-weight:700">Entrá</a>` : esc(e.message)}</div>`;
      }
    };
    return;
  }
  if (path === '#/forgot') {
    LANDING_ON = false;
    root.innerHTML = forgotView();
    $('#btnForgot').onclick = async () => {
      const email = ($('#f_email').value || '').trim();
      if (!email) { $('#forgotMsg').innerHTML = `<div class="err">Escribí tu email 📧</div>`; return; }
      try {
        await api.post('/api/auth/forgot', { email });
        $('#forgotMsg').innerHTML = `<div class="ok-msg">¡Listo! 📬 Si ese email tiene cuenta, ya te mandé el link para cambiar tu contraseña. Revisá tu casilla (y el spam).</div>`;
      } catch (e) {
        $('#forgotMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
    };
    return;
  }
  if (path.startsWith('#/reset')) {
    const token = new URLSearchParams((location.hash.split('?')[1] || '')).get('token') || '';
    LANDING_ON = false;
    root.innerHTML = resetView();
    $('#btnReset').onclick = async () => {
      const password = $('#f_pass').value || '';
      try {
        await api.post('/api/auth/reset', { token, password });
        await refreshSession();
        postAuthLanding();
      } catch (e) {
        $('#resetMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
    };
    return;
  }
  if (path === '#/' || path === '') {
    // App instalada: se comporta como app, no como web. Va directo a la semana
    // (o al login si no hay sesión) en vez de la landing de marketing.
    if (pwaIsStandalone()) { location.hash = mzHomeHash(); return; }
    // Logueado en la web (v292): rebota a SU pantalla con la MISMA regla que
    // tras el login — postAuthLanding es la única fuente de verdad del
    // destino (onboarding si falta el negocio, plan elegido, return-to, o la
    // home —inicio/schedule— vía mzHomeHash). Antes esto mandaba siempre a la
    // home y un usuario sin negocio caía en la app en vez del onboarding.
    // Orden de rebotes en la raíz: 1º standalone (arriba), 2º gate de idioma
    // del shell (vive en index.html y solo actúa con hash de landing; este
    // destino es siempre #/app/*, así que nunca se cruzan), 3º este rebote.
    // Visitante no logueado: la landing pública no cambia.
    await refreshSession();
    if (ME) { postAuthLanding(); return; }
    PLANS_CACHE = await api.get('/api/billing/plans').catch(() => null);
    root.innerHTML = landingView(PLANS_CACHE);
    LANDING_ON = true;
    lpInitHero();
    refreshScarcity(); // número vivo de /api/capacity (fallback: 50 del template)
    return;
  }

  // App (requiere login)
  LANDING_ON = false;
  await refreshSession();
  if (!ME && NET_OFFLINE) { bootSplashOff(); root.innerHTML = offlineView(); bindOffline(); return; }
  if (!ME) {
    // Deep-link: recordamos a donde queria ir para aterrizar ahi tras el
    // login (postAuthLanding lo consume), en vez del destino por defecto.
    try { if (path.startsWith('#/app')) sessionStorage.setItem('posta_return_to', location.hash); } catch (e) {}
    location.hash = '#/login'; return;
  }
  const tabRaw = path.split('/')[2] || '';
  // 🔔 Posty te avisa: #/app/post/:id → el id del posteo a aprobar
  const postId = decodeURIComponent(path.split('/')[3] || '').trim();
  // FASE 4 (autopilot): sin pestaña explícita se abre la semana (Schedule).
  // El chat sigue vivo en #/app/chat como escape hatch para retoques puntuales.
  let tab = tabRaw || (mzIsMobile() ? 'inicio' : 'schedule');
  let content = '';
  if (tab === 'chat') content = await chatView();
  else if (tab === 'inicio') content = await inicioView(); // 🏠 Rediseño mobile: la home "una pantalla, una respuesta"
  else if (tab === 'semana') { location.hash = '#/app/schedule'; return; } // Mi semana se fusionó en Schedule
  else if (tab === 'schedule') content = await scheduleView();
  else if (tab === 'analisis') { let __okAn = true; try { await loadChunk('analisis'); } catch (e) { __okAn = false; } content = __okAn ? analisisView() : chunkFailHTML(); } // 🧠 Análisis: LA CARTA v3 (chunk-analisis.js)
  else if (tab === 'numeros') content = statsView(); // 📊 Tus números (stats de IG)
  else if (tab === 'crear') { location.hash = '#/app/schedule'; return; } // Creador manual fusionado en Schedule
  else if (tab === 'ideas') { location.hash = '#/app/schedule'; return; } // Ideas se fusionó en Schedule
  else if (tab === 'video') { location.hash = '#/app/schedule'; return; } // Creador manual de video eliminado: el reel lo arma el autopilot
  else if (tab === 'fotos') { location.hash = '#/app/ajustes'; return; } // Mis fotos vive en Ajustes > Mi marca
  else if (tab === 'onboarding') { if (!OB) OB = loadOB() || freshOB(); content = onboardingView(); }
  else if (tab === 'calendario') { location.hash = '#/app/schedule'; return; } // Calendario fusionado en Schedule
  else if (tab === 'historial') { location.hash = '#/app/schedule'; return; } // Historial fusionado en Schedule
  else if (tab === 'ads') { if (typeof IS_NATIVE !== 'undefined' && IS_NATIVE) { location.hash = '#/app/semana'; } else content = await adsView(); } // 🚀 Potenciar: billetera + boost (solo web)
  else if (tab === 'admin') { let __okA = true; try { await loadChunk('admin'); } catch (e) { __okA = false; } content = __okA ? await adminView() : chunkFailHTML(); } // 📊 Analytics (solo equipo)
  else if (tab === 'post') content = await approvalPostView(postId); // 🔔 Posty te avisa: aprobar por notificación
  else if (tab === 'dogfood') content = await dogfoodView(postId); // 🤖 Posty dogfood: propuesta del día
  else { let __okJ = true; try { await loadChunk('ajustes'); } catch (e) { __okJ = false; } content = __okJ ? ajustesView() : chunkFailHTML(); }
  bootSplashOff();
  root.innerHTML = appShell(tab, content);
  bindApp(tab);
  // El banner de trial vencido lleva id único: si algún re-render lo duplicara, queda solo uno.
  try {
    const _tbs = document.querySelectorAll('#pzTrialBanner');
    for (let _i = 1; _i < _tbs.length; _i++) _tbs[_i].remove();
  } catch (e) {}
  // Si vino con ?plan=1 o ?plan_sel= → la sección Mi plan queda abierta Y en pantalla (no arriba de Ajustes)
  try {
    const _pq = new URLSearchParams(location.hash.split('?')[1] || '');
    if (tab === 'ajustes' && (_pq.get('plan') || _pq.get('plan_sel'))) {
      const _pz = document.getElementById('planZone');
      const _card = _pz && _pz.closest('.card');
      if (_card) setTimeout(() => _card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  } catch (e) {}
  handleIgResult();    // toast del OAuth (?ig=) en cualquier pantalla
  renderIgResume(); // banner "terminar de conectar" si el OAuth quedó a medias
  if (!(PROFILE && PROFILE.ig_pending)) maybeShowIgPopup(tab); // popup de conectar Instagram (primer ingreso)
  // Modal agresivo: trial vencido (una vez por sesión; no molesta en Mi plan).
  // En nativo (tiendas): sin modal de ventas → aviso neutro inline, sin CTA de pago.
  try {
    if (ME && ME.trial_expired && ME.plan_status === 'trial' && tab !== 'ajustes' && !sessionStorage.getItem('pz_exp_modal')) {
      if (IS_NATIVE) showExpiredNoticeNative(); else showExpiredModal();
    }
  } catch (e) {}
}

/* ---------- Aviso neutro (nativo): trial vencido, sin CTA de pago ---------- */
function showExpiredNoticeNative() {
  if (document.getElementById('pzExpNativeNote')) return;
  try { sessionStorage.setItem('pz_exp_modal', '1'); } catch (e) {} // una vez por sesión
  const main = document.querySelector('.main');
  if (!main) return;
  const n = document.createElement('div');
  n.id = 'pzExpNativeNote';
  n.innerHTML = `
    <div style="margin:10px 14px 0;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between">
      <div style="font-size:13px;color:var(--mut)">Tu prueba terminó.</div>
      <button id="pzExpNativeX" aria-label="Cerrar" style="background:none;border:0;font-size:16px;cursor:pointer;color:var(--dim)">✕</button>
    </div>`;
  main.prepend(n);
  const x = document.getElementById('pzExpNativeX');
  if (x) x.onclick = () => n.remove();
}

/* ---------- Modal agresivo: trial vencido ---------- */
async function showExpiredModal() {
  if (document.getElementById('pzExpOverlay')) return;
  trackOnce('expmodal', 'trial_expired_view');
  let plans = [];
  try { const d = await api.get('/api/billing/plans'); plans = d.plans || []; } catch (e) {}
  const perDay = (p) => '\u2248 $' + Math.round(p.price / 30).toLocaleString('es-AR') + ' por d\u00eda';
  const expMix = (p) => {
    const parts = [];
    if (p.postsPerWeek > 0) parts.push(`${p.postsPerWeek} posteo${p.postsPerWeek > 1 ? 's' : ''}`);
    if (p.reelsPerWeek > 0) parts.push(`${p.reelsPerWeek} reel${p.reelsPerWeek > 1 ? 's' : ''}`);
    if (p.storiesPerWeek > 0) parts.push(`${p.storiesPerWeek} historia${p.storiesPerWeek > 1 ? 's' : ''}`);
    return parts.length ? `<small class="pz-exp-mix">${parts.join(' + ')} por semana</small>` : '';
  };
  const rows = plans.map(p => `
    <button class="pz-exp-plan" data-exp-plan="${p.id}">
      <span>${p.highlighted ? '<span class="pz-exp-tag">EL M\u00c1S ELEGIDO</span>' : ''}<b>${esc(p.name)}</b><small>${esc(p.price_label)}/mes \u00b7 ${perDay(p)}</small>${expMix(p)}</span>
      <span class="pz-exp-go">Elegir \u2192</span>
    </button>`).join('');
  const ov = document.createElement('div');
  ov.id = 'pzExpOverlay';
  ov.className = 'pz-exp-overlay';
  ov.innerHTML = `
    <div class="pz-exp-modal" role="dialog" aria-modal="true">
      <button class="pz-exp-x" id="pzExpClose" aria-label="Cerrar">\u2715</button>
      <img src="ai-avatar.png" alt="Posty" style="width:74px;height:74px;border-radius:50%;box-shadow:0 4px 14px rgba(39,147,200,.35)">
      <h2>Se termin\u00f3 tu prueba 🥹</h2>
      <p class="pz-exp-sub">Tus posteos no tienen por qu\u00e9 frenar: eleg\u00ed tu plan y el lunes tu semana est\u00e1 lista como siempre.</p>
      <div class="pz-exp-plans">${rows}</div>
      ${plans.length ? '' : '<button class="btn btn-primary btn-block" id="pzExpGo">Ver planes 🚀</button>'}
      <button class="pz-exp-later" id="pzExpLater">Pausar mis posteos</button>
    </div>`;
  document.body.appendChild(ov);
  const close = () => { try { sessionStorage.setItem('pz_exp_modal', '1'); } catch (e) {} ov.remove(); };
  const goPlan = (pid) => { close(); location.hash = '#/app/ajustes' + (pid ? '?plan_sel=' + encodeURIComponent(pid) : ''); };
  ov.querySelector('#pzExpClose').onclick = close;
  ov.querySelector('#pzExpLater').onclick = close;
  const goBtn = ov.querySelector('#pzExpGo');
  if (goBtn) goBtn.onclick = () => goPlan('');
  ov.querySelectorAll('[data-exp-plan]').forEach(b => b.onclick = () => goPlan(b.dataset.expPlan));
}

/* ---------- Banner persistente: trial vencido (tab Schedule / Mi semana) ---------- */
let PZ_TRIAL_PLANS_CACHE = null; // plan m\u00e1s barato de /api/billing/plans (fetch cacheado por sesi\u00f3n)
async function trialExpiredBannerHTML() {
  try { if (typeof IS_NATIVE !== 'undefined' && IS_NATIVE) return ''; } catch (e) {}
  if (!(typeof ME !== 'undefined' && ME && ME.trial_expired && ME.plan_status === 'trial')) return '';
  if (typeof document !== 'undefined' && document.getElementById('pzExpOverlay')) return ''; // modal abierto: no competir
  try {
    if (!PZ_TRIAL_PLANS_CACHE) {
      const d = await api.get('/api/billing/plans');
      const arr = (d && d.plans) || [];
      PZ_TRIAL_PLANS_CACHE = arr.slice().sort((a, b) => (a.price || 0) - (b.price || 0))[0] || null;
    }
  } catch (e) {}
  if (!PZ_TRIAL_PLANS_CACHE || !(PZ_TRIAL_PLANS_CACHE.price > 0)) return '';
  const perDay = '\u2248 $' + Math.round(PZ_TRIAL_PLANS_CACHE.price / 30).toLocaleString('es-AR') + '/d\u00eda';
  return `<a id="pzTrialBanner" class="pz-trial-banner" href="#/app/ajustes">\uD83D\uDD12 Tu prueba termin\u00f3 \u2014 reactiv\u00e1 tu semana por ${perDay} \u2192</a>`;
}

/* ---------- SCHEDULE: calendario de posteos programados ---------- */
let SCHED_DAY_OFFSET = 0; // 0 = hoy; navegacion dia por dia
/* ---------- Tarjeta de fallidos + "Ya salió" (viven en Schedule) ---------- */
// Posteos que fallaron al publicar, con botón de reintento (usa /api/posts/:id/publish-now).
function failedCardHTML(failed) {
  const list = (Array.isArray(failed) ? failed : []).filter(Boolean);
  if (!list.length) return '';
  return `
  <div class="card" id="failedCard" style="border:2px solid #E2574C">
    <h3 style="margin:0 0 4px">⚠️ ${list.length === 1 ? 'Un posteo no pudo salir' : list.length + ' posteos no pudieron salir'}</h3>
    <p class="hint" style="margin:0 0 10px">Tocá reintentar y lo publicamos de nuevo.</p>
    ${list.map(p => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      ${p.image_path ? `<img src="${esc(p.image_path)}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none" alt="">` : ''}
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(String(p.caption || p.source_topic || 'Posteo').split('\n')[0].slice(0, 60))}</div>
        ${p.error ? `<div style="font-size:11.5px;color:var(--mut)">${esc(humanError(p.error))}</div>` : ''}
      </div>
      <button class="btn btn-soft btn-sm" data-failed-retry="${p.id}">🔄 Reintentar</button>
      <button class="btn btn-soft btn-sm" data-failed-dismiss="${p.id}" title="Descartar este posteo">✕</button>
    </div>`).join('')}
    <div class="hint" data-failed-msg style="margin-top:4px"></div>
  </div>`;
}
// "Ya salió": outcome loop liviano — publicados de hace +24h sin rating.
// Pregunta positiva "¿del 1 al 5 qué tanto te gustaron?" con estrellitas (data-sig rating_N,
// lo cablea bindSignalBtns). 1-2 = señal negativa (no repetir), 4-5 = positiva (priorizar).
function salioCardHTML(publishedList) {
  const DAY = 864e5, now = Date.now();
  const list = (Array.isArray(publishedList) ? publishedList : [])
    .filter(p => {
      const pub = new Date(String(p.published_at || '').replace(' ', 'T')).getTime();
      if (!pub || now - pub < DAY) return false;
      const sig = String(p.signal || '');
      return !(sig.startsWith('rating') || sig === 'brought_clients' || sig === 'no_clients');
    })
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .slice(0, 5);
  if (!list.length) return '';
  return `
  <div class="card" id="salioCard">
    <h3 style="margin:0 0 4px">📮 Ya salió</h3>
    <p class="hint" style="margin:0 0 12px">¿Del 1 al 5 qué tanto te gustaron estos posteos?<br>Con tus respuestas entiendo cada vez más tus gustos 🙂</p>
    ${list.map(p => `
    <div class="st-rate-row">
      ${p.image_path ? `<img class="st-rate-thumb" src="${esc(p.image_path)}" alt="" loading="lazy">` : ''}
      <div class="st-rate-body">
        <div class="st-rate-cap">${esc(String(p.caption || p.source_topic || 'Posteo').split('\n')[0].slice(0, 90))}</div>
        <div class="st-rate-stars">
          ${[1, 2, 3, 4, 5].map(n => `<button class="btn btn-soft btn-sm star-btn" data-sig="rating_${n}" data-id="${p.id}" aria-label="${n} de 5">★</button>`).join('')}
        </div>
      </div>
    </div>`).join('')}
  </div>`;
}

async function scheduleView() {
  const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  // Datos para la barra XP + revisión (antes en Mi semana).
  let st = null, sk = null;
  try { st = await api.get('/api/stats/summary'); } catch (e) {}
  try { sk = await api.get('/api/streak'); } catch (e) {}
  let allPosts = [];
  try { allPosts = await api.get('/api/posts'); } catch (e) { allPosts = []; }
  // Borradores arriba ("Revisá tu semana"), programados en el calendario debajo.
  const drafts = allPosts.filter(p => p.status === 'draft').sort((a, b) => a.id - b.id);
  REVIEW_DRAFTS = drafts; // el chat los necesita para editar borradores por chat
  const schedPosts = allPosts.filter(p => p.status === 'scheduled');
  const published = allPosts.filter(p => p.status === 'published');
  const failed = allPosts.filter(p => p.status === 'failed');
  // 2026-10-05: si no hay nada por venir, disparar la generación en segundo
  // plano (sin bloquear). El home muestra "armando" y refresca solo.
  let weekGenerating = false;
  let weekNoDna = false;
  // 2026-10-14: ensure corre SIEMPRE, no solo con la semana vacía — si la
  // semana está parcial, el backend crea los posteos que faltan solo.
  try {
    const er = await api.post('/api/week/ensure', {}).catch(() => null);
    weekGenerating = !!(er && er.generating);
    weekNoDna = !!(er && er.reason === 'no_dna' && !drafts.length && !schedPosts.length);
    if ((er && er.generating) || allPosts.some(p => !p.image_path && p.status === 'draft')) {
      setTimeout(() => { try { if ((location.hash || '').startsWith('#/app/schedule')) render(); } catch (e) {} }, 8000);
    }
  } catch (e) {}
  let quota = null;
  try { quota = await api.get('/api/quota').catch(() => null); } catch (e) {}
  const slots = suggestSlots(drafts.length, schedPosts);
  const { expBanner } = xpStripHTML(sk, st, drafts.length); // (el xpStrip del nivel se eliminó: vive en el avatar del chat)
  const trialBanner = await trialExpiredBannerHTML(); // trial vencido → banner de reactivación (solo web)
  // 📸 Instagram desconectado (2026-10-20): sin conexión ningún posteo puede
  // salir — se avisa PRIMERO que todo en la agenda, sin tono de error. Se
  // computa en cada render: al reconectar, el aviso desaparece solo.
  const igBanner = (typeof PROFILE !== 'undefined' && PROFILE && !PROFILE.ig_connected)
    ? `<div class="card card-hi-yl" style="margin:0 0 12px;padding:14px 16px;border-radius:14px">
        <div style="font-weight:800;font-size:14px;margin-bottom:6px">📸 Tu Instagram no está conectado</div>
        <div style="font-size:13px;line-height:1.6;color:var(--mut)">Tu semana se sigue armando, pero ningún posteo puede salir hasta que conectes tu cuenta. Es una sola vez y queda.</div>
        <a class="btn btn-primary btn-sm" style="margin-top:10px" href="#/app/ajustes?ig=1">Conectar Instagram</a>
      </div>`
    : '';
  // Posty dogfood: la propuesta de hoy para @posty.hacetodo, primero que todo.
  let dogfoodPost = null;
  try { const r = await api.get('/api/dogfood/pending'); dogfoodPost = (r && r.post) || null; } catch (e) {}
  const dogfoodBlock = dogfoodPost ? dogfoodCardHTML(dogfoodPost) : '';
  // 🧠 Análisis (2026-10-19): la semana abre con "lo que vi → por qué tu
  // semana es así" (solo lectura: peek no dispara construcciones).
  let analysisSummaryBlock = '';
  try {
    const an = await api.get('/api/analysis?peek=1').catch(() => null);
    if (an && an.week_summary) {
      analysisSummaryBlock = `<div class="card" style="margin:0 0 12px;padding:14px 16px;background:var(--bg2);border:1px solid var(--line);border-radius:14px">
        <div style="font-weight:800;font-size:14px;margin-bottom:6px">🧠 Lo que vi de tu cuenta</div>
        <div style="font-size:13px;line-height:1.6;color:var(--mut)">${esc(an.week_summary).replace(/\n/g, '<br>')}</div>
        <a href="#/app/analisis" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:700;color:var(--cel)">Ver mi análisis completo →</a>
      </div>`;
    }
  } catch (e) {}
  const reviewBlock = drafts.length ? reviewCardHTML(drafts, slots, '📋 Revisá tu semana') : '';
  // Fast-track "Tu primer posteo": solo cuentas que NUNCA publicaron, con borradores con foto.
  const ftCandidates = drafts.filter(d => d.image_path).slice(0, 3);
  const ftBlock = (!published.length && ftCandidates.length) ? fastTrackCardHTML(ftCandidates) : '';
  // "🚀 Publicar mi primero" (mejora 2026-09-30): hero de 1 tap, visible SOLO
  // con 0 posteos publicados. Si no hay borradores, el botón genera uno primero.
  // Una sola tarjeta de "primer posteo": con candidatos con foto manda el
  // fast-track guiado; el hero de 1 tap queda para cuando no hay candidato
  // (sin borradores o sin foto). Antes se apilaban las dos, mismo título.
  const fpBlock = (!published.length && !ftCandidates.length) ? firstPublishCardHTML(drafts) : '';
  // Fallidos: debajo de la revisión, antes del calendario.
  const failedBlock = failedCardHTML(failed);
  const parse = (iso) => {
    const s0 = String(iso || '');
    let s = s0.length === 16 ? s0 : s0.replace(' ', 'T');
    if (s0.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
    return new Date(s);
  };
  const dayKey = (d) => { try { return d.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } };
  const scheduled = schedPosts
    .map(p => ({ p, d: parse(p.scheduled_at) }))
    .filter(x => !isNaN(x.d))
    .sort((a, b) => a.d - b.d);
  // Publicados de la semana visible: van en el día que salieron (✓ Salió).
  // Así el calendario + "te quedan X" siempre suman el cupo del plan.
  const publishedThisWeek = published
    .map(p => ({ p, d: parse(p.published_at || p.scheduled_at), done: true }))
    .filter(x => !isNaN(x.d))
    .sort((a, b) => a.d - b.d);
  // Día visible (offset en días desde hoy): se muestra UN día a la vez.
  const now = new Date();
  const day = new Date(now);
  day.setDate(day.getDate() + SCHED_DAY_OFFSET);
  day.setHours(12, 0, 0, 0);
  const days = [day];
  const fmtDay = (d) => { try { return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', timeZone: tz }); } catch (e) { return ''; } };
  const fmtHour = (d) => { try { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch (e) { return ''; } };
  const todayK = dayKey(new Date());
  const dayLabel = (() => {
    try { return days[0].toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }); }
    catch (e) { return ''; }
  })();
  const dayLong = (d) => { try { return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: tz }); } catch (e) { return ''; } };
  // Pulso de la semana: resumen vivo arriba del calendario.
  const daySchedCount = scheduled.filter(x => dayKey(x.d) === dayKey(days[0])).length;
  const dayPubCount = publishedThisWeek.filter(x => dayKey(x.d) === dayKey(days[0])).length;
  let pulseHTML = '';
  {
    const parts = [];
    if (daySchedCount) parts.push(`📮 ${daySchedCount} programado${daySchedCount > 1 ? 's' : ''}`);
    if (dayPubCount) parts.push(`✅ ${dayPubCount} publicado${dayPubCount > 1 ? 's' : ''}`);
    if (SCHED_DAY_OFFSET === 0 && drafts.length) parts.push(`📝 ${drafts.length} borrador${drafts.length > 1 ? 'es' : ''}`);
    pulseHTML = parts.length ? parts.join(' <span class="sched-pulse-sep">·</span> ') : '🕊️ Nada este día';
  }
  // Banner del próximo posteo (día y hora), debajo del día visible.
  let nextPostHTML = '';
  {
    const upcoming = scheduled.filter(x => x.d > new Date());
    if (upcoming.length) {
      const nx = upcoming[0];
      const nd = nx.d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: tz });
      const nh = nx.d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
      nextPostHTML = `<div class="sched-nextpost">📮 <b>Próximo posteo:</b> ${esc(nd)} a las ${esc(nh)}</div>`;
    }
  }
  const cells = days.map(d => {
    const k = dayKey(d);
    const items = scheduled.filter(x => dayKey(x.d) === k)
      .concat(publishedThisWeek.filter(x => dayKey(x.d) === k))
      .sort((a, b) => a.d - b.d);
    const isToday = k === todayK;
    return `<div class="sched-col${isToday ? ' today' : ''}">
      <div class="sched-colhead">${esc(fmtDay(d))}${isToday ? ' <span class="sched-today">hoy</span>' : ''}</div>
      <div class="sched-colbody">
        ${items.length ? items.map(({ p }) => postCardHTML(p, { layout: 'col' })).join('') : `<button class="sched-ghost" data-sched-day="${esc(dayLong(d))}" aria-label="Pedirle a Posty un posteo para el ${esc(dayLong(d))}"><span class="sg-plus">+</span><span class="sg-txt">Libre</span></button>`}
      </div>
    </div>`;
  }).join('');
  const empty = !scheduled.length && !publishedThisWeek.length && SCHED_DAY_OFFSET === 0;
  // Sin borradores ni programados: la tarjeta para armar la semana vive acá.
  const armBlock = (!drafts.length && empty) ? autopilotCardHTML('schedule') : '';
  // 2026-10-05: home en Schedule (primera pestaña) — 5 tarjetas fijas arriba,
  // chat abajo en la misma pantalla. Pedido de Valentino.
  // Vista Feed: el encabezado réplica del perfil se alimenta SOLO de datos
  // reales — foto y nombre del avatar público de IG (cacheado en el
  // servidor) y los seguidores que la vista YA cargó en `st` (sin pedidos
  // extra). Lo que no existe no se pide ni se inventa: el encabezado lo omite.
  if (SCHED_MODE === 'feed') {
    const igu = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.ig_username) || '';
    if (igu && !(FEED_PROFILE && FEED_PROFILE.username === igu)) {
      try {
        const av = await api.get('/api/ig/avatar?u=' + encodeURIComponent(igu)).catch(() => null);
        const fol = (st && Number(st.followers) > 0) ? Number(st.followers) : null;
        FEED_PROFILE = { username: igu, pic: (av && av.pic_url) || null, name: (av && av.name) || '', followers: fol };
      } catch (e) {}
    }
  }
  const homeWeekBlock = schedFilterBlockHTML(allPosts, quota, weekGenerating, weekNoDna);
  // v223: la grilla del feed ya NO es una sección debajo de los posteos:
  // es el cuarto modo del filtro de la agenda (Día·Semana·Mes·Feed) y
  // la pinta schedFilterBlockHTML adentro de homeWeekBlock.
  const homeChatBlock = `<div class="hs-chat-label" style="margin-top:18px"><b>💬 ¿Cambiamos algo?</b></div>${chatCardHTML(true, true, true, true)}`;
  return `<div id="schedView" class="sched-wrap">
    <div class="hs-brand-head">
      <img src="ai-avatar.png" alt="Posty" class="hs-brand-ava">
      <div class="hs-brand-txt"><b>Posty<span style="color:var(--cel)">.</span></b><span>Tu semana, lista sola</span></div>
    </div>
    ${igBanner}
    ${trialBanner}
    ${dogfoodBlock}
    ${analysisSummaryBlock}
    ${expBanner}
    ${fpBlock}
    ${ftBlock}
    ${failedBlock}
    ${homeWeekBlock}
    <div id="adsBoostSlot"></div>
    <div id="hs-ideas"${IDEAS_PANEL_OPEN ? '' : ' class="ideas-closed"'}></div>
    <div id="hs-question"></div>
    ${homeChatBlock}
    ${armBlock}
  </div>`;
}
/* ============================================================
   🏠 INICIO — rediseño mobile (2026-10-20, mock aprobado por Valentino)
   "Una pantalla, una respuesta": ¿está todo andando? ¿tengo que hacer
   algo? HOY manda (tarjeta grande con su porqué), la semana es una
   LISTA vertical (no 7 columnitas), UN solo contador y UNA barra, el
   análisis y las ideas son UNA línea cada uno, y el chat vive como
   barra fija que abre una hoja con EL chat de Schedule (mismo estado
   CHAT, mismos handlers: bindChat + bindSchedUpload — nada duplicado).
   Datos: SOLO los que la app ya carga (/api/posts, /api/quota,
   /api/week/ensure, /api/analysis?peek=1, /api/ideas). La ubicación
   por día sale de schedPlacements — la misma cuenta de la agenda.
   ============================================================ */
function mzKindLabel(p) {
  const mt = String(p.media_type || '');
  if (mt === 'video') return 'Reel';
  if (mt === 'story') return 'Historia';
  if (mt === 'carousel') return 'Carrusel';
  return 'Posteo';
}
function mzTitleOf(p) {
  const line = String(p.caption || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  return line || String(p.source_topic || '').trim() || 'Posteo';
}
// Hora visible de un posteo, la misma que muestra la agenda: publicado →
// published_at; programado → scheduled_at; borrador → su scheduled_at o
// la hora de su día propuesto (schedPlacements/computeProposedIsos).
function mzTimeOf(p, proposals) {
  const dt = pcParseDate(p.status === 'published' ? (p.published_at || p.scheduled_at) : p.scheduled_at);
  if (dt) return pcFmtHour(dt, pcTz());
  const iso = (proposals && proposals.get) ? (proposals.get(p.id) || {}).iso : null;
  return iso ? iso.slice(11, 16) : '';
}
function mzDayHead(ymd, todayYmd) {
  const d = schedYmdToDate(ymd);
  if (!d) return '';
  let wd = '';
  try { wd = d.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' }); } catch (e) {}
  const name = ((wd ? wd.charAt(0).toUpperCase() + wd.slice(1) : '') + ' ' + d.getUTCDate()).toUpperCase();
  if (ymd === todayYmd) return 'HOY · ' + name;
  if (ymd === schedAddDays(todayYmd, 1)) return 'MAÑANA · ' + name;
  return name;
}
function mzDayShort(ymd) {
  const d = schedYmdToDate(ymd);
  if (!d) return { d: '', n: '' };
  let wd = '';
  try { wd = d.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' }); } catch (e) {}
  return { d: wd.replace(/\./g, '').toUpperCase(), n: d.getUTCDate() };
}
function mzRowChip(p) {
  const st = schedPostState(p);
  if (st === 'published') return '<span class="mz-st pub">Publicado</span>';
  if (st === 'scheduled') return '<span class="mz-st pub">Programado</span>';
  if (st === 'creating') return '<span class="mz-st dra">Creando…</span>';
  return '<span class="mz-st dra">Borrador</span>';
}
function mzHeroChip(p) {
  const st = schedPostState(p);
  if (st === 'published') return '<span class="mz-chip ok">✓ Publicado</span>';
  if (st === 'scheduled') return '<span class="mz-chip ok">✓ Programado</span>';
  if (st === 'creating') return '<span class="mz-chip dra">⏳ Creando…</span>';
  return '<span class="mz-chip dra">Borrador</span>';
}
function mzMediaHTML(p, cls) {
  if (!p.image_path) return `<div class="${cls} mz-nomedia"><span>✨</span></div>`;
  if (String(p.media_type || '') === 'video') return `<video class="${cls}" src="${esc(p.image_path)}" muted playsinline preload="metadata"></video>`;
  return `<img class="${cls}" src="${esc(p.image_path)}" alt="" loading="lazy">`;
}

async function inicioView() {
  const tz = pcTz();
  let allPosts = [];
  try { allPosts = await api.get('/api/posts'); } catch (e) { allPosts = []; }
  if (!Array.isArray(allPosts)) allPosts = [];
  const drafts = allPosts.filter(p => p.status === 'draft').sort((a, b) => a.id - b.id);
  REVIEW_DRAFTS = drafts; // el chat de la hoja edita borradores, igual que en Schedule
  const schedPosts = allPosts.filter(p => p.status === 'scheduled');
  // El mismo auto-arranque de la semana que dispara Schedule al entrar:
  // si no, entrando por Inicio la semana nunca se armaría sola.
  let weekGenerating = false;
  let weekNoDna = false;
  try {
    const er = await api.post('/api/week/ensure', {}).catch(() => null);
    weekGenerating = !!(er && er.generating);
    weekNoDna = !!(er && er.reason === 'no_dna' && !drafts.length && !schedPosts.length);
    if ((er && er.generating) || allPosts.some(p => !p.image_path && p.status === 'draft')) {
      setTimeout(() => { try { if ((location.hash || '').startsWith('#/app/inicio')) render(); } catch (e) {} }, 8000);
    }
  } catch (e) {}
  let quota = null;
  try { quota = await api.get('/api/quota').catch(() => null); } catch (e) {}
  // 🧠 La carta: peek (solo lectura) — el mismo dato que consume la
  // vista Análisis. Sin análisis guardado, la línea no aparece.
  let hasCarta = false;
  try { const an = await api.get('/api/analysis?peek=1').catch(() => null); hasCarta = !!(an && an.analysis); } catch (e) {}

  const todayYmd = schedTodayYmd(tz);
  const monday = schedMondayOf(todayYmd);
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map(i => schedAddDays(monday, i));
  const nextDays = [0, 1, 2, 3, 4, 5, 6].map(i => schedAddDays(monday, 7 + i));
  const { byDay, proposals } = schedPlacements(allPosts, tz);
  const flat = [];
  for (const [ymd, arr] of byDay) for (const it of arr) flat.push({ p: it.p, ymd });
  // HOY: el próximo a salir de hoy; si ya salieron todos, el último
  // publicado; si hoy no hay nada, el próximo que viene (día real).
  const nowMs = Date.now();
  const todays = flat.filter(x => x.ymd === todayYmd);
  let hero = null;
  const upToday = todays.filter(x => x.p.status === 'scheduled' && (pcParseDate(x.p.scheduled_at) || new Date(0)).getTime() >= nowMs - 3600000);
  if (upToday.length) hero = upToday[0];
  if (!hero) { const pub = todays.filter(x => x.p.status === 'published'); if (pub.length) hero = pub[pub.length - 1]; }
  if (!hero) { const dr = todays.filter(x => x.p.status === 'draft'); if (dr.length) hero = dr[0]; }
  if (!hero) { const fut = flat.filter(x => x.ymd > todayYmd && x.p.status !== 'published'); if (fut.length) hero = fut[0]; }
  if (!hero) { const past = flat.filter(x => x.p.status === 'published'); if (past.length) hero = past[past.length - 1]; }

  const initial = (((ME && ME.email) || (PROFILE && PROFILE.business_name) || 'P').trim().charAt(0) || 'P').toUpperCase();
  const igLine = (typeof PROFILE !== 'undefined' && PROFILE && !PROFILE.ig_connected)
    ? `<a class="mz-igbar" href="#/app/ajustes?ig=1">📸 <span><b>Instagram sin conectar</b> — tu semana no puede salir.</span><span class="mz-igbar-go">Conectar →</span></a>`
    : '';

  let heroHTML = '';
  if (hero) {
    const hp = hero.p;
    const hm = mzTimeOf(hp, proposals);
    const heroDt = pcParseDate(hp.status === 'published' ? (hp.published_at || hp.scheduled_at) : hp.scheduled_at);
    let prompt = 'Quiero editar ese posteo';
    if (heroDt) prompt = apvEditPrompt(heroDt, tz);
    else {
      const dd = schedYmdToDate(hero.ymd);
      let wd = '';
      try { if (dd) wd = dd.toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' }); } catch (e) {}
      if (dd) prompt = `Quiero editar el posteo del ${wd} ${dd.getUTCDate()}${hm ? ' a las ' + hm : ''}`;
    }
    heroHTML = `
  <div class="mz-lbl">${esc(mzDayHead(hero.ymd, todayYmd))}</div>
  <div class="mz-hero">
    ${mzMediaHTML(hp, 'mz-hero-img')}
    <div class="mz-hero-b">
      <div class="mz-chips"><span class="mz-chip sky">${esc(mzKindLabel(hp))}${hm ? ' · ' + esc(hm) : ''}</span>${mzHeroChip(hp)}</div>
      <h1>${esc(mzTitleOf(hp))}</h1>
      ${hp.strategy_why ? `<p class="mz-why">💡 <b>Por qué:</b> ${esc(hp.strategy_why)}</p>` : ''}
      <div class="mz-hero-f"><button type="button" class="mz-btn pri" id="mzHeroVer" data-mzpost="${esc(String(hp.id))}">Ver posteo</button><button type="button" class="mz-btn gho" id="mzHeroCambiar" data-mzprompt="${esc(prompt)}">Cambiar</button></div>
    </div>
  </div>`;
  }

  const cartaLine = hasCarta
    ? `<a class="mz-ana" href="#/app/analisis"><span class="mz-ana-ic">🧠</span> Tu carta de esta semana está lista<span class="mz-ana-go">Ver →</span></a>`
    : '';

  // Tu semana: lista vertical lun→dom con UN contador y UNA barra.
  const weekItems = [];
  for (const ymd of weekDays) for (const it of (byDay.get(ymd) || [])) weekItems.push({ p: it.p, ymd });
  let weekHTML = '';
  if (weekItems.length) {
    const wkDrafts = weekItems.filter(x => x.p.status === 'draft');
    const wkMarcha = weekItems.filter(x => x.p.status === 'published' || x.p.status === 'scheduled').length;
    const wkTotal = weekItems.length;
    const pct = wkTotal ? Math.round((wkMarcha / wkTotal) * 100) : 0;
    const rows = weekItems.map(({ p, ymd }) => {
      const ds = mzDayShort(ymd);
      const hm = mzTimeOf(p, proposals);
      const propIso = p.status === 'draft' ? (proposals.get(p.id) || {}).iso : null;
      return `<div class="mz-row" data-post-id="${esc(String(p.id))}"${p.status === 'draft' ? ` data-revaccept="${esc(String(p.id))}"${propIso ? ` data-proposed="${esc(propIso)}"` : ''}` : ''}>
      <div class="mz-row-tap" data-pc-act="open" role="button" aria-label="Ver posteo">
        <div class="mz-day"><div class="mz-day-d">${esc(ds.d)}</div><div class="mz-day-n">${esc(String(ds.n))}</div></div>
        ${mzMediaHTML(p, 'mz-thumb')}
        <div class="mz-row-mid"><div class="mz-row-t">${esc(mzTitleOf(p))}</div><div class="mz-row-s">${hm ? esc(hm) + ' · ' : ''}${esc(mzKindLabel(p))}</div></div>
        ${mzRowChip(p)}
      </div>
    </div>`;
    }).join('');
    weekHTML = `
  <div class="mz-week">
    <div class="mz-week-h"><h2>Tu semana</h2>${wkDrafts.length ? `<button type="button" class="mz-accept" id="mzAcceptAll">✅ Aceptar todo (${wkDrafts.length})</button>` : ''}</div>
    <div class="mz-prog"><i style="width:${pct}%"></i></div>
    <div class="mz-prog-t"><b>${wkMarcha} de ${wkTotal}</b> en marcha · ${wkDrafts.length ? `te quedan <b>${wkDrafts.length}</b> borrador${wkDrafts.length > 1 ? 'es' : ''} por aceptar` : 'todo aceptado ✓'}</div>
    <div id="revMsg"></div>
    <div id="hsWeekList" class="mz-rows">${rows}</div>
  </div>`;
  } else {
    // Semana vacía: los estados de siempre (armando / falta ADN /
    // completa), con el MISMO bloque que pinta el home actual.
    weekHTML = homeWeekHTML(allPosts, quota, weekGenerating, weekNoDna);
  }

  // La que viene: UNA línea (la cuenta capeada al cupo, como en la agenda).
  const nextCount = nextDays.reduce((n, ymd) => n + (byDay.get(ymd) || []).length, 0);
  const qLim = quota && Number(quota.limit) > 0 ? Number(quota.limit) : 0;
  const nextLine = nextCount
    ? `<a class="mz-next" href="#/app/schedule">✨ <span>La que viene ya se está armando <span class="mz-next-sub">· ${qLim ? Math.min(nextCount, qLim) + ' de ' + qLim : nextCount + ' armados'}</span></span><span class="mz-next-go">Ver →</span></a>`
    : '';

  return `<div id="inicioView" class="mz-wrap">
  <div class="mz-hd">
    <div class="mz-brand"><img src="ai-avatar.png" alt="Posty"><span>Posty<span class="mz-dot">.</span></span></div>
    <button type="button" class="mz-uchip" id="mzUserChip" aria-label="Ajustes">${esc(initial)}</button>
  </div>
  ${igLine}
  ${heroHTML}
  ${cartaLine}
  ${weekHTML}
  ${nextLine}
  <div id="mzIdeasSlot"></div>
  <div class="mz-chatbar" id="mzChatBar">
    <button type="button" class="mz-plus" id="mzPlus" aria-label="Subir fotos o video">+</button>
    <button type="button" class="mz-ph" id="mzChatOpen">Escribile a Posty…</button>
    <button type="button" class="mz-mic" id="mzMic" aria-label="Pedir con nota de voz">🎙️</button>
  </div>
  <div class="mz-sheet" id="mzSheet" hidden>
    <div class="mz-sheet-card">
      <div class="mz-sheet-head"><b>💬 ¿Cambiamos algo?</b><button type="button" class="mz-sheet-x" id="mzSheetX" aria-label="Cerrar">✕</button></div>
      <div class="mz-sheet-body">${chatCardHTML(true, true, true, true)}</div>
    </div>
  </div>
</div>`;
}

function mzOpenSheet(focus) {
  const sh = $('#mzSheet');
  if (!sh) return;
  sh.hidden = false;
  try { document.body.classList.add('mz-sheet-open'); } catch (e) {}
  // Prefill pendiente: el MISMO contrato que usa "Editar" de #/app/post/:id
  // (sessionStorage 'posty-chat-prefill'), consumido al abrir el chat.
  try {
    const pre = sessionStorage.getItem('posty-chat-prefill');
    if (pre) {
      sessionStorage.removeItem('posty-chat-prefill');
      const ci = document.getElementById('chatInput');
      if (ci) ci.value = pre;
    }
  } catch (e) {}
  try { chatUpdateSendBtn(); } catch (e) {}
  try { chatScroll(); } catch (e) {}
  if (focus) {
    const ci = document.getElementById('chatInput');
    if (ci) setTimeout(() => { try { ci.focus({ preventScroll: true }); } catch (e) { try { ci.focus(); } catch (e2) {} } }, 60);
  }
}
function mzCloseSheet() {
  const sh = $('#mzSheet');
  if (sh) sh.hidden = true;
  try { document.body.classList.remove('mz-sheet-open'); } catch (e) {}
}

function bindInicio() {
  const uc = $('#mzUserChip');
  if (uc) uc.onclick = () => { location.hash = '#/app/ajustes'; };
  const hv = $('#mzHeroVer');
  if (hv) hv.onclick = () => { location.hash = '#/app/post/' + encodeURIComponent(hv.dataset.mzpost || ''); };
  const hc = $('#mzHeroCambiar');
  if (hc) hc.onclick = () => {
    try { sessionStorage.setItem('posty-chat-prefill', hc.dataset.mzprompt || 'Quiero editar ese posteo'); } catch (e) {}
    mzOpenSheet(true);
  };
  // "Aceptar todo (N)": el handler de siempre (doAcceptAll lee los
  // data-revaccept/data-proposed de #hsWeekList — acá, las filas de la
  // semana; en el bloque de respaldo, sus tarjetas).
  const aa = $('#mzAcceptAll');
  if (aa) aa.onclick = () => doAcceptAll(aa);
  const hsA = $('#hsAcceptAll');
  if (hsA) hsA.onclick = () => doAcceptAll(hsA);
  // Bloque de respaldo (semana vacía): flechas del carrusel + lightbox,
  // el mismo cableado que hace bindSchedule en su vista.
  const wl = document.querySelector('#inicioView #hsWeekList');
  const hp = $('#hsPrev'), hn = $('#hsNext');
  if (wl && (hp || hn)) {
    const step = () => {
      try {
        const c = wl.querySelector('.igmock-fixed');
        return c ? c.offsetWidth + 12 : wl.clientWidth * 0.8;
      } catch (e) { return 300; }
    };
    if (hp) hp.onclick = () => wl.scrollBy({ left: -step(), behavior: 'smooth' });
    if (hn) hn.onclick = () => wl.scrollBy({ left: step(), behavior: 'smooth' });
  }
  $$('#inicioView [data-lightbox]').forEach(el => el.onclick = () => {
    if (el.dataset.lightbox) openLightbox(el.dataset.lightbox, el.dataset.video === '1');
  });
  // El chat de la hoja: EXACTAMENTE el cableado de Schedule (mismo
  // historial, mismo envío, misma subida). Una sola implementación.
  try { bindChat(); } catch (e) {}
  try { bindSchedUpload(); } catch (e) {}
  const clickUp = () => { const f = document.getElementById('albumFile'); if (f) f.click(); };
  const agUp = $('#agUploadBtn');
  if (agUp) agUp.onclick = clickUp;
  // El chip de Ideas dentro de la hoja: el panel de ideas vive en la
  // Semana — se abre allá (sin callejones sin salida).
  const ic = $('#ideasChip');
  if (ic) ic.onclick = () => { IDEAS_PANEL_OPEN = true; mzCloseSheet(); location.hash = '#/app/schedule'; };
  // Barra de chat fija: + sube (mismo flujo), el campo abre la hoja,
  // el micrófono abre la hoja y arranca la nota de voz de siempre.
  const plus = $('#mzPlus');
  if (plus) plus.onclick = clickUp;
  const open = $('#mzChatOpen');
  if (open) open.onclick = () => mzOpenSheet(true);
  const mic = $('#mzMic');
  if (mic) mic.onclick = () => { mzOpenSheet(false); setTimeout(() => { try { voiceToggle(); } catch (e) {} }, 80); };
  const x = $('#mzSheetX');
  if (x) x.onclick = mzCloseSheet;
  const sh = $('#mzSheet');
  if (sh) sh.addEventListener('click', (e) => { if (e.target === sh) mzCloseSheet(); });
  // 💡 Ideas: UNA línea si hay pendientes (la misma fuente que el panel:
  // GET /api/ideas → IDEAS_PENDING_COUNT). Lleva a la Semana con el
  // panel abierto, que es donde vive el flujo de ideas.
  const paintIdeasLine = () => {
    const slot = $('#mzIdeasSlot');
    if (!slot) return;
    const n = (typeof IDEAS_PENDING_COUNT === 'number') ? IDEAS_PENDING_COUNT : 0;
    slot.innerHTML = n > 0
      ? `<button type="button" class="mz-idea" id="mzIdeasGo">💡 Tenés ${n} idea${n > 1 ? 's' : ''} nueva${n > 1 ? 's' : ''} de Posty →</button>`
      : '';
    const g = $('#mzIdeasGo');
    if (g) g.onclick = () => { IDEAS_PANEL_OPEN = true; location.hash = '#/app/schedule'; };
  };
  if (typeof IDEAS_PENDING_COUNT === 'number') paintIdeasLine();
  else {
    api.get('/api/ideas').then(r => {
      if (r && r.ok) IDEAS_PENDING_COUNT = (r.ideas || []).length;
      paintIdeasLine();
    }).catch(() => {});
  }
}

/* ---------- 🧠 ANÁLISIS (2026-10-19): la casa del cerebro de Posty ---------- */
// Arriba: la radiografía de SU cuenta (todos los planes). Abajo: "Tu mercado"
// — completo solo en Growth (Pro/Total); en Esencial, la probada con upsell.
// Cuenta nueva: el plan de nacimiento (kit de perfil + vidriera de 9).
async function pzAnalysisRefresh(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Analizando…'; }
  try { await api.post('/api/analysis/refresh', {}); } catch (e) {}
  try { await render(); } catch (e) { location.reload(); }
}
function pzFindingHTML(f) {
  const nums = f.with_posty
    ? `<div style="font-size:12.5px;margin-top:4px"><span style="color:var(--mut)">Hoy: ${esc(f.now || '')}</span> <span style="color:var(--cel);font-weight:700">→ Con Posty: ${esc(f.with_posty)}</span></div>`
    : (f.now ? `<div style="font-size:12.5px;margin-top:4px;color:var(--mut)">Hoy: ${esc(f.now)}</div>` : '');
  return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="font-size:14px;font-weight:600;line-height:1.5">${esc(f.text || '')}</div>${nums}</div>`;
}
async function analysisView() {
  let d = null;
  try { d = await api.get('/api/analysis'); } catch (e) {}
  const head = `<div class="card" style="padding:18px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="font-size:20px;font-weight:800">🧠 Tu análisis</div>
      <button class="btn btn-ghost btn-sm" onclick="pzAnalysisRefresh(this)">↻ Actualizar</button>
    </div>
    <p style="color:var(--mut);font-size:13.5px;line-height:1.6;margin-top:6px">Esto es lo que Posty ve de tu cuenta y de tu mercado — y las decisiones que toma con eso. Cada posteo de tu semana nace de acá.</p>
  </div>`;
  if (!d || !d.analysis) {
    return `${head}<div class="card" style="padding:18px;margin-top:12px"><p style="font-size:14px;line-height:1.6">Todavía no armé tu primer análisis. Lo armo ahora con los datos reales de tu cuenta y tu rubro 👇</p><button class="btn btn-primary" style="margin-top:10px" onclick="pzAnalysisRefresh(this)">Armar mi análisis</button></div>`;
  }
  const a = d.analysis;
  const groups = [['mejorar', '🛠️ A mejorar'], ['incrementar', '📈 A incrementar'], ['reducir', '📉 A reducir']];
  let body = '';
  if (a.kind === 'nacimiento') {
    const kit = a.profile_kit || {};
    const roles = (a.starter_grid || []).map((s) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b style="font-size:13.5px">${esc(String(s.slot))}. ${esc(s.role || '')}</b> <span style="color:var(--mut);font-size:12px">${esc(s.format || '')}</span><div style="font-size:12.5px;color:var(--mut);line-height:1.5">${esc(s.why || '')}</div></div>`).join('');
    body += `<div class="card" style="padding:18px;margin-top:12px">
      <div style="font-size:16px;font-weight:800">🌱 Tu plan de nacimiento</div>
      <p style="color:var(--mut);font-size:13.5px;line-height:1.6;margin-top:4px">Tu cuenta recién arranca: nace con estrategia — posicionamiento desde tu rubro y tu zona, kit de perfil completo y tu primera vidriera de 9 piezas.</p>
      ${(a.findings || []).map(pzFindingHTML).join('')}
      ${kit.bio ? `<div style="background:var(--bg2);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.7;margin-top:12px;white-space:pre-line"><b>Tu bio, lista para pegar:</b>\n${esc(kit.bio)}</div>` : ''}
      ${(kit.highlights && kit.highlights.length) ? `<p style="font-size:13px;margin-top:10px"><b>Destacadas:</b> ${esc(kit.highlights.join(' · '))}</p>` : ''}
      ${roles ? `<div style="margin-top:12px"><div style="font-weight:800;font-size:14px;margin-bottom:4px">Tu primera vidriera</div>${roles}</div>` : ''}
    </div>`;
  } else {
    const ghtml = groups.map(([k, t]) => {
      const fs = (a.findings || []).filter((f) => f && f.group === k);
      return fs.length ? `<div style="margin-top:14px"><div style="font-weight:800;font-size:14px">${t}</div>${fs.map(pzFindingHTML).join('')}</div>` : '';
    }).join('');
    body += `<div class="card" style="padding:18px;margin-top:12px"><div style="font-size:16px;font-weight:800">🔍 Tu cuenta</div>${ghtml || '<p style="color:var(--mut);font-size:13.5px;margin-top:8px">Tu cuenta viene prolija: la semana sostiene lo que ya funciona y empuja los formatos que más rinden.</p>'}</div>`;
  }
  // --- Tu mercado: completo (Growth) o probada (Esencial) ---
  if (a.market_full && a.market) {
    const peers = (a.market.peers || []).map((p) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px"><span>@${esc(p.handle)}</span><span style="color:var(--mut)">${p.posts_per_week != null ? esc(String(p.posts_per_week)) + ' posteos/sem' : 'sin datos'}${p.followers != null ? ' · ' + esc(String(p.followers)) + ' seguidores' : ''}</span></div>`).join('');
    const mf = (a.market.findings || []).map(pzFindingHTML).join('');
    body += `<div class="card" style="padding:18px;margin-top:12px"><div style="font-size:16px;font-weight:800">🗺️ Tu mercado</div>
      ${a.market.available ? `${peers}${mf}${a.market.position ? `<p style="font-size:13.5px;line-height:1.6;margin-top:10px">📍 ${esc(a.market.position.text)}</p>` : ''}` : `<p style="color:var(--mut);font-size:13.5px;line-height:1.6;margin-top:6px">Todavía no hay datos públicos suficientes de cuentas de tu rubro y tu zona. Apenas aparezcan, este mapa se completa solo — no estimamos nada.</p>`}
    </div>`;
  } else {
    const teaser = a.market_teaser;
    const items = teaser && teaser.items ? teaser.items.map((it) => `<p style="font-size:13.5px;line-height:1.6;margin:6px 0">📌 ${esc(it.text || '')}${it.now ? ` — <span style="color:var(--mut);font-weight:600">${esc(it.now)}</span>` : ''}</p>`).join('') : '';
    body += `<div class="card" style="padding:18px;margin-top:12px"><div style="font-size:16px;font-weight:800">🗺️ Tu mercado <span style="font-size:12px;color:var(--cel);font-weight:700">PROBADA</span></div>
      ${items || '<p style="color:var(--mut);font-size:13.5px;line-height:1.6;margin-top:6px">Posty ya está mirando las cuentas de tu rubro y tu zona.</p>'}
      <p style="font-size:13px;color:var(--mut);line-height:1.6;margin-top:8px">El mapa completo — tu competencia una por una, tu posición en el rubro y las decisiones que tomamos con eso — es parte de <b>Growth</b> (planes Pro y Total).</p>
      <a class="btn btn-primary btn-sm" style="margin-top:10px" href="#/app/ajustes?plan=1">Ver planes →</a>
    </div>`;
  }
  // --- El loop: predicciones anteriores vs resultados ---
  if (a.loop && Array.isArray(a.loop.checks) && a.loop.checks.length) {
    const ico = { 'cumplida': '✅', 'en-curso': '🔄', 'sin-datos': '⏳' };
    const checks = a.loop.checks.map((c) => `<div style="padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px;line-height:1.6">${ico[c.status] || '•'} ${esc(c.text || '')}</div>`).join('');
    body += `<div class="card" style="padding:18px;margin-top:12px"><div style="font-size:16px;font-weight:800">🔁 Así viene el plan</div><p style="color:var(--mut);font-size:12.5px;margin-top:2px">Lo que el análisis anterior se propuso, medido contra tu cuenta hoy.</p>${checks}</div>`;
  }
  if (Array.isArray(d.history) && d.history.length > 1) {
    const hist = d.history.map((h) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px"><span>Análisis #${esc(String(h.n || ''))}</span><span style="color:var(--mut)">${esc(String(h.created_at || '').slice(0, 10))} · ${esc(String(h.findings))} hallazgos</span></div>`).join('');
    body += `<div class="card" style="padding:18px;margin-top:12px"><div style="font-size:16px;font-weight:800">🗂️ Historial</div>${hist}<p style="color:var(--mut);font-size:12.5px;line-height:1.6;margin-top:8px">Cada análisis aprende del anterior: el #10 de tu cuenta es mucho mejor que el #1.</p></div>`;
  }
  const notes = (a.data_notes || []).map((n) => `<p style="color:var(--dim);font-size:12px;margin-top:10px">${esc(n)}</p>`).join('');
  return `${head}${body}${notes}`;
}

/* ---------- 📊 TUS NÚMEROS: stats reales de Instagram ---------- */
// Números honestos: lo que trae la API de IG (o caché local). Si no hay datos,
// el empty state lo dice de frente, sin inventar nada.
function statsView() {
  const cards = ['Personas alcanzadas (7 días)', 'Personas alcanzadas (30 días)', 'Interacciones (30 días)', 'Seguidores']
    .map((l, i) => `<div class="st-card st-loading"><div class="st-num" id="stNum${i}">…</div><div class="st-label">${esc(l)}</div>${i === 0 ? '<div id="stDelta"></div>' : ''}</div>`)
    .join('');
  return `
  <div class="st-wrap">
    <div class="page-head">
      <div class="ph-ico">📊</div>
      <div class="ph-txt"><h1>Tus números</h1><p class="sub">Cómo viene rindiendo tu Instagram.</p></div>
    </div>
    <div class="st-grid" id="stGrid">${cards}</div>
    <div id="stBest"></div>
    <div id="stRate"></div>
  </div>`;
}
function bindStats() {
  let pubCount = 0;
  const paint = async () => {
    try {
      const d = await api.get('/api/stats/ig');
      // 📮 "Ya salió": las estrellitas viven acá, con los números (aunque no haya alcance todavía).
      try {
        const posts = await api.get('/api/posts');
        const pub = (Array.isArray(posts) ? posts : []).filter(p => p.status === 'published');
        pubCount = pub.length;
        const rateBox = document.getElementById('stRate');
        if (rateBox) rateBox.innerHTML = salioCardHTML(pub);
        bindSignalBtns();
      } catch (e) { /* sin posteos no hay estrellitas */ }
      const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');
      const grid = document.getElementById('stGrid');
      const box = document.getElementById('stBest');
      const vals = [d.reach_7d, d.reach_30d, d.interactions_30d, d.followers];
      const hasData = vals.some((v) => Number(v) > 0) || d.best_post;
      if (!hasData) {
        // Estado vacío claro: no es un error ni está cargando, simplemente
        // no hay posteos publicados todavía para analizar.
        if (grid) grid.style.display = 'none';
        if (box) box.innerHTML = `<div class="card st-empty">
          <div class="st-empty-ico">📊</div>
          ${pubCount > 0 ? '<b>Tus posteos ya salieron 🎉</b>' : '<b>Todavía no hay posteos para analizar</b>'}
          ${pubCount > 0 ? '<p>Todavía no tengo las métricas de tu Instagram (alcance e interacciones) para mostrarte. Cuando estén, aparecen acá solitas.</p>' : '<p>Cuando publiquemos tu primera semana, vas a ver acá tu alcance, tus interacciones y tu mejor posteo, todo juntito.</p>'}
          <div class="st-empty-tags">
            <span>Personas alcanzadas</span>
            <span>Interacciones</span>
            <span>Mejor posteo</span>
            <span>Seguidores</span>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <a class="btn btn-primary btn-sm" href="#/app/schedule">📅 Ir a mi semana</a>
            ${(typeof PROFILE !== 'undefined' && PROFILE && !PROFILE.ig_connected) ? '<a class="btn btn-soft btn-sm" href="#/app/ajustes?ig=1">📸 Conectar Instagram</a>' : ''}
          </div>
        </div>`;
        return;
      }
      if (grid) grid.style.display = '';
      vals.forEach((v, i) => {
        const el = document.getElementById('stNum' + i);
        if (el) { el.textContent = (v == null ? '—' : fmt(v)); el.closest('.st-card').classList.remove('st-loading'); }
      });
      // Delta honesto del alcance semanal: solo si ambas cohortes tienen ≥3 posteos
      // con datos. Con pocos datos el % es puro ruido (swings absurdos) y mezcla
      // volumen con rendimiento: mejor el número absoluto, sin delta.
      const cur = Number(d.reach_7d) || 0, prev = Number(d.reach_prev7d) || 0;
      const postsCur = Number(d.posts_7d) || 0, postsPrev = Number(d.posts_prev7d) || 0;
      const dEl = document.getElementById('stDelta');
      if (dEl) {
        if (postsCur >= 3 && postsPrev >= 3 && prev > 0 && cur !== prev) {
          const pct = Math.round((cur - prev) / prev * 100);
          dEl.innerHTML = pct > 0
            ? `<span class="st-delta up">▲ ${pct}% vs sem. pasada</span>`
            : `<span class="st-delta down">▼ ${Math.abs(pct)}% vs sem. pasada</span>`;
        } else dEl.innerHTML = '';
      }
      if (!box) return;
      box.innerHTML = d.best_post
        ? `<div class="card st-best">
            <h3>⭐ Tu mejor posteo</h3>
            <div class="st-best-row">
              ${d.best_post.image_url ? `<img src="${esc(d.best_post.image_url)}" alt="" loading="lazy">` : ''}
              <div><b>${esc(d.best_post.caption_short || 'Tu posteo')}</b>
              <p>${esc(d.best_post.metric)}</p></div>
            </div>
          </div>`
        : `<div class="card st-empty"><b>Todavía no hay suficientes datos para elegir un mejor posteo 🙂</b>
           <p>Publicá un poco más y aparece acá solito.</p></div>`;
    } catch (e) {
      const gridEl = document.getElementById('stGrid');
      if (gridEl) gridEl.style.display = 'none';
      const box = document.getElementById('stBest');
      if (box) box.innerHTML = `<div class="card st-empty">
        <b>Ups, no pude traer tus números ahora 😅</b>
        <p>Probá de nuevo en un ratito.</p>
        <button class="btn btn-primary btn-sm" id="stRetry" style="margin-top:10px">Reintentar</button>
      </div>`;
      const r = document.getElementById('stRetry');
      if (r) r.onclick = () => { r.disabled = true; r.textContent = 'Cargando…'; paint(); };
    }
  };
  paint();
}
function bindSchedule() {
  const pv = $('#schedPrev'), nx = $('#schedNext'), td = $('#schedToday');
  if (pv) pv.onclick = () => { if (SCHED_DAY_OFFSET > 0) { SCHED_DAY_OFFSET--; render(); } };
  if (nx) nx.onclick = () => { SCHED_DAY_OFFSET++; render(); };
  if (td) td.onclick = () => { SCHED_DAY_OFFSET = 0; render(); };
  // 2026-10-05: chat en el Schedule (home) — cablear como en #/app/chat.
  try { bindChat(); } catch (e) {}
  // 2026-10-07: botón "¿Por qué tarda tanto?" en el estado "armando".
  const diagBtn = $('#hsDiagBtn');
  if (diagBtn) diagBtn.onclick = async () => {
    const out = $('#hsDiagOut');
    if (out) out.innerHTML = '<p style="font-size:13px">Revisando… 🔍</p>';
    diagBtn.disabled = true;
    try {
      const r = await api.post('/api/diag/week-test', {}, { timeout: 90000 });
      const d = r && r.diag ? r.diag : {};
      let msg = '<div style="font-size:13px;line-height:1.7;background:#fff;border-radius:12px;padding:12px">';
      msg += `<b>Diagnóstico:</b><br>`;
      msg += `Plan: ${d.planOk ? '✅' : '❌'}<br>`;
      msg += `Créditos IA: ${d.aiOk ? '✅' : '❌ ' + esc(d.aiErr || '')}<br>`;
      msg += `Datos negocio: ${d.dnaOk ? '✅' : '❌'}<br>`;
      msg += `Posteos: ${d.existing || 0}<br>`;
      if (d.posts && d.posts.length) {
        const noImg = d.posts.filter(p => !p.hasImage).length;
        msg += `Sin imagen: ${noImg > 0 ? '❌ ' + noImg : '✅ 0'}<br>`;
        d.posts.slice(0, 3).forEach(p => {
          msg += `<small>#${p.id}: ${p.hasImage ? '🖼️ ' + esc(p.imagePath.slice(0, 40)) : '❌ sin imagen'}</small><br>`;
        });
      }
      msg += `En curso: ${d.running ? '⚠️' : 'no'}<br>`;
      if (d.ideasOk === true) msg += `Ideas IA: ✅ (${d.ideasCount || 0})<br>`;
      else if (d.ideasOk === false) msg += `Ideas IA: ❌ ${esc((d.ideasErr || '').slice(0, 120))}<br>`;
      if (d.imageOk === true) msg += `Imagen IA: ✅<br>`;
      else if (d.imageOk === false) msg += `Imagen IA: ❌ ${esc((d.imageErr || '').slice(0, 150))}<br>`;
      if (d.lastFailure) msg += `Último fallo: ⚠️ ${esc(d.lastFailure.reason.slice(0, 120))}<br>`;
      msg += '</div>';
      if (out) out.innerHTML = msg;
    } catch (e) {
      if (out) out.innerHTML = `<p style="font-size:13px;color:#c00">Error: ${esc(e.message || '')}</p>`;
    }
    diagBtn.disabled = false;
  };
  // 2026-10-11: botón "Aceptar todo" arriba del carrusel (pedido de Valentino).
  const hsAcceptAll = $('#hsAcceptAll');
  if (hsAcceptAll) hsAcceptAll.onclick = () => doAcceptAll(hsAcceptAll);
  // 2026-10-09: flechas laterales del carrusel.
  const weekList = $('#hsWeekList');
  const hsPrev = $('#hsPrev');
  const hsNext = $('#hsNext');
  if (weekList) {
    const step = () => {
      try {
        const c = weekList.querySelector('.igmock-fixed');
        return c ? c.offsetWidth + 12 : weekList.clientWidth * 0.8;
      } catch (e) { return 300; }
    };
    if (hsPrev) hsPrev.onclick = () => weekList.scrollBy({ left: -step(), behavior: 'smooth' });
    if (hsNext) hsNext.onclick = () => weekList.scrollBy({ left: step(), behavior: 'smooth' });
  }
  // toque nada). Si la generación falló, mostrar el error en pantalla.
  (async () => {
    const genEl = $('#hsGenerating');
    if (!genEl) return;
    // Esperar 45s (dar tiempo a que la generación termine o falle).
    await new Promise(r => setTimeout(r, 45000));
    if (!document.querySelector('#hsGenerating')) return; // ya se fue
    try {
      const lr = await api.get('/api/week/last-result').catch(() => null);
      if (lr && lr.has && lr.result && lr.result.ok === false) {
        const out = $('#hsDiagOut');
        if (out) {
          const r = lr.result;
          out.innerHTML = `<div style="font-size:13px;line-height:1.7;background:#fff3f3;border:1px solid #fcc;border-radius:12px;padding:12px">` +
            `<b>❌ La generación falló:</b><br>` +
            `Motivo: <b>${esc(r.reason || 'desconocido')}</b><br>` +
            (r.error ? `<small>${esc(String(r.error).slice(0, 200))}</small><br>` : '') +
            (r.imgFailCount ? `Imágenes fallidas: ${r.imgFailCount}<br>` : '') +
            `</div>`;
        }
      }
    } catch (e) {}
  })();
  // Días libres: el fantasma "+" lleva al chat a pedirle algo a Posty para ese día.
  // v221: el chat vive EN esta misma pantalla, abajo — el fantasma baja
  // hasta el chat de Schedule y enfoca el input (antes saltaba a la
  // vista del chat: otra pantalla, lo que Valentino marcó).
  $$('#schedView [data-sched-day]').forEach(b => b.onclick = () => {
    const card = document.getElementById('chatCard');
    if (card) { try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
    const inp = document.getElementById('chatInput');
    if (inp) setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch (e) { try { inp.focus(); } catch (e2) {} } }, 480);
  });
  $$('#schedView [data-lightbox]').forEach(el => el.onclick = () => {
    if (el.dataset.lightbox) openLightbox(el.dataset.lightbox, el.dataset.video === '1');
  });
  // Revisión de borradores (antes en Mi semana): carrusel, lightbox, aprobar/editar.
  bindReview();
  // v217: filtro Día·Semana·Mes (segmentado, navegación, salto de día,
  // ampliación hover/toque de la vista Semana).
  try { bindSchedFilter(); } catch (e) {}
  try { enhanceIdeas(); } catch (e) {} // 💡 v223: ideas con ciclo propio (caché de sesión; su slot vive fuera de la agenda)
  try { enhanceAdsBoost(); } catch (e) {} // 🚀 pauta pendiente/recomendados: ciclo propio, no bloquea la agenda
  try { enhanceQuestion(); } catch (e) {} // 🤔 v238: Posty pregunta — tarjeta propia sobre el chat, mismo ciclo anti-flash
  // (v236) Chip de ideas: el cableado sigue el patrón de la casa (se
  // recablea en cada pintado) y el estado visible se re-aplica
  // sincrónico tras el render — badge, expandido y panel como estaban.
  try { paintIdeasChrome(); } catch (e) {}
  const ideasChipBtn = $('#ideasChip');
  if (ideasChipBtn) ideasChipBtn.onclick = () => { try { toggleIdeasPanel(); } catch (e) {} };
  // v221: ✨ Así va quedando tu feed — tocar un tile que se viene salta
  // a su día en la agenda; "Ver más posteos" despliega el historial.
  // (Los tiles publicados se abren con el wiring de [data-lightbox] de
  // más arriba, el de siempre.)
  $$('#schedView [data-feed-day]').forEach(b => b.onclick = () => schedJumpDay(b.dataset.feedDay));
  const fpMore = $('#fpMore');
  if (fpMore) fpMore.onclick = () => {
    const sec = document.getElementById('hsFeed');
    if (!sec) return;
    const open = sec.classList.toggle('open');
    fpMore.textContent = open ? 'Ver menos' : 'Ver más posteos';
  };
  try { bindSchedUpload(); } catch (e) {} // 📸 v221: cablea la subida del bloque del chat + recordatorio semanal
  // ÚNICO botón de subida de la pantalla (v221): vive fijo debajo del
  // saludo del chat y dispara el MISMO input del álbum (#albumFile, con
  // su festejo y su clasificación, ahora dentro del bloque del chat).
  const agUp = $('#agUploadBtn');
  if (agUp) agUp.onclick = () => {
    const f = document.getElementById('albumFile');
    if (f) { f.click(); return; }
    const blk = document.getElementById('albumWeekBlock') || document.getElementById('albumCard');
    if (blk) blk.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  bindScheduleAll(); // "📅 Programar mi semana →" (chip del chat)
  bindAcceptAll(); // legacy (ya no se pinta en la tarjeta)
  bindActivateWeek(); // "🚀 Activar mi semana" dentro de la tarjeta de revisión
  bindAutopilot(); // tarjeta "Armemos tu semana" (estado vacío)
  // Fast-track "🚀 Tu primer posteo" (solo cuentas que nunca publicaron).
  try { if (typeof bindFastTrack === 'function') bindFastTrack(); } catch (e) {}
  // "🚀 Publicar mi primero" (mejora 2026-09-30: 1 tap, solo 0 publicados).
  try { if (typeof bindFirstPublish === 'function') bindFirstPublish(); } catch (e) {}
  // 🤖 Posty dogfood: ✅ Publicar / ⏭️ Saltar.
  try { if (typeof bindDogfood === 'function') bindDogfood(); } catch (e) {}
  // Reintento de fallidos: publica de nuevo vía publish-now.
  $$('#schedView [data-failed-retry]').forEach(b => b.onclick = async () => {
    const id = b.dataset.failedRetry;
    b.disabled = true;
    const msg = document.querySelector('#failedCard [data-failed-msg]');
    try {
      await api.post(`/api/posts/${id}/publish-now`, {});
      if (msg) msg.innerHTML = '<div class="hint">⏳ Publicando… lo ves arriba en un minuto.</div>';
      setTimeout(() => { try { render(); } catch (e) {} }, 2000);
    } catch (e) {
      b.disabled = false;
      if (msg) msg.innerHTML = `<div class="err">${esc(humanError(e.message || 'No se pudo reintentar'))}</div>`;
    }
  });
  // Descartar un fallido: lo saca de la tarjeta sin publicarlo.
  $$('#schedView [data-failed-dismiss]').forEach(b => b.onclick = async () => {
    const id = b.dataset.failedDismiss;
    b.disabled = true;
    try {
      await api.post(`/api/posts/${id}/dismiss-failed`, {});
      render();
    } catch (e) {
      b.disabled = false;
      const msg = document.querySelector('#failedCard [data-failed-msg]');
      if (msg) msg.innerHTML = `<div class="err">${esc(humanError(e.message || 'No se pudo descartar'))}</div>`;
    }
  });
  // 👍/👎 del "Ya salió": ahora viven en 📊 Tus números (bindStats los cablea).
  // Racha: pill compacta en el header del Schedule → abre el modal de racha.
  const sp = $('#schedStreakPill');
  if (sp) sp.onclick = async () => {
    try { const sk2 = await api.get('/api/streak'); if (sk2 && sk2.current > 0) streakPillModal(sk2); } catch (e) {}
  };
  // Festejos (antes se chequeaban al entrar a Mi semana).
  setTimeout(() => maybeFirstPublishCelebration(), 1200);
  setTimeout(() => maybeMilestoneCelebration(), 2600);
  // La IA avisa por chat si hay comentarios sin responder (1 vez por día).
  api.post('/api/proactive-comments-ask', {}).then(r => { if (r && r.asked) chatLoadHistory(); }).catch(() => {});
}

function bindApp(tab) {
  if (tab === 'ajustes') trackOnce('settings', 'settings_open');
  if (tab === 'admin' && typeof bindAdmin === 'function') bindAdmin(); // el chunk ya lo cargó render()
  if (tab === 'analisis' && typeof bindAnalisis === 'function') bindAnalisis(); // 🧠 la carta se pinta al cargar el chunk
  if (tab === 'chat') bindChatView(); // chat como escape hatch (FASE 4: ya no es el home)
  if (tab === 'schedule') bindSchedule();
  if (tab === 'inicio') bindInicio();
  if (tab === 'onboarding') bindOnboarding(); // FASE 4: cablea form directo o entrevista (antes dead code: nunca se llamaba)
  if (tab === 'dogfood') { try { if (typeof bindDogfood === 'function') bindDogfood(); } catch (e) {} }
  if (tab === 'numeros') bindStats(); // 📊 Tus números
  if (tab === 'post') bindApprovalPost(); // 🔔 Posty te avisa
  pwaWire();
  // Caption expandible (revisión, opciones del chat, historial): "ver más" o tap directo sobre el texto
  if (!window.__revMoreWired) {
    window.__revMoreWired = true;
    document.addEventListener('click', e => {
      const m = e.target.closest('[data-revmore]');
      if (m) {
        const id = m.dataset.revmore;
        const cap = document.querySelector(`[data-revpreview="${id}"]`);
        const tag = document.querySelector(`[data-revhashprev="${id}"]`);
        const open = !!(cap && cap.classList.toggle('expanded'));
        if (tag) tag.classList.toggle('expanded', open);
        m.textContent = open ? 'ver menos ▴' : 'ver más ▾';
        return;
      }
      const t = e.target.closest('.rev-preview,.opt-caption');
      if (t && !e.target.closest('button')) t.classList.toggle('expanded');
    });
  }
  $$('[data-tab]').forEach(b => b.onclick = () => { closeDrawer(); location.hash = '#/app/' + b.dataset.tab; });
  $$('[data-ig-connect]').forEach(b => b.onclick = igConnect);
  bindSetupRows();
  const loA = $('#btnLogoutAj');
  if (loA) loA.onclick = async () => { await api.post('/api/auth/logout'); location.hash = '#/'; };
  const bg = $('#mtopBurger');
  if (bg) bg.onclick = openDrawer;
  const dov = $('#drawerOv');
  if (dov) dov.onclick = closeDrawer;
  try { paintDrawerIdent(); } catch (e) {}
  try { paintSidePosty(); } catch (e) {}
  const dlo = $('#drawerLogout');
  if (dlo) dlo.onclick = async () => { closeDrawer(); await api.post('/api/auth/logout'); location.hash = '#/'; };

  if (tab === 'ajustes' && typeof bindSettings === 'function') bindSettings(); // el chunk ya lo cargó render()
}


function igConnect(next) {
  const nx = (typeof next === 'string' && next.startsWith('/#/')) ? next : '';
  // Misma pestaña: /api/ig/go redirige vía 302 a Instagram (iOS no abre la app)
  // y el callback vuelve solo a Posta. Si Instagram te deja varado en el feed
  // (login + verificación que pierde el contexto OAuth), al volver a Posta
  // aparece el banner "terminar de conectar" y lo completás con un toque
  // (ya quedaste logueado en Instagram, el cartel de autorización sale directo).
  location.href = '/api/ig/go' + (nx ? '?next=' + encodeURIComponent(nx) : '');
}
/* ---------- banner "terminar de conectar Instagram" ---------- */
// Si el usuario volvió a Posta sin completar el OAuth (Instagram lo dejó en el
// feed), mostramos un banner superior por 15 min: un toque y termina.
function renderIgResume() {
  const show = !!(PROFILE && PROFILE.ig_pending && !PROFILE.ig_connected);
  let b = document.getElementById('igResumeBanner');
  if (!show) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div');
  b.id = 'igResumeBanner';
  b.innerHTML = `
  <div style="position:fixed;top:0;left:0;right:0;z-index:9000;display:flex;justify-content:center;padding:10px 12px;pointer-events:none">
    <div style="pointer-events:auto;background:#0A1E33;color:#fff;border-radius:16px;padding:12px 14px;display:flex;gap:12px;align-items:center;box-shadow:0 12px 32px rgba(0,0,0,.35);max-width:560px;width:100%">
      <div style="font-size:26.5px;line-height:1">📸</div>
      <div style="flex:1;font-size:12.5px;line-height:1.45"><b>¡Casi terminás!</b><br>Se interrumpió la conexión (a veces Instagram pide un código y se corta). Tu sesión ya quedó iniciada: es un toque más.</div>
      <button class="btn btn-primary" id="igResumeGo" style="white-space:nowrap;padding:12px 16px">Terminar de conectar</button>
    </div>
  </div>`;
  document.body.appendChild(b);
  b.querySelector('#igResumeGo').onclick = () => igConnect();
}


/* ============================================================
   🔔 POSTY TE AVISA — aprobación de posteos por notificación
   Ruta #/app/post/:id. Todo nuevo con prefijo apv-. No toca
   pushEnableFlow/pushSupported/pushPerm ni el sw.
   ============================================================ */
function apvTz() {
  try { return (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires'; } catch (e) { return 'America/Argentina/Buenos_Aires'; }
}
// Misma convención de parseo que el Schedule: ISO UTC con ' ' o 'T'.
function apvParse(iso) {
  const s0 = String(iso || '');
  let s = s0.length === 16 ? s0 : s0.replace(' ', 'T');
  if (s0.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  return new Date(s);
}
function apvDayKey(d, tz) { try { return d.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } }
function apvHM(d, tz) { try { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }); } catch (e) { return ''; } }
// "Sale hoy 18:00" / "Sale mañana 18:00" / "Sale el jueves 2 de octubre a las 18:00"
function apvWhenText(d, tz) {
  const hm = apvHM(d, tz), k = apvDayKey(d, tz);
  if (k === apvDayKey(new Date(), tz)) return `Sale hoy ${hm}`;
  if (k === apvDayKey(new Date(Date.now() + 864e5), tz)) return `Sale mañana ${hm}`;
  let dl = '';
  try { dl = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }); } catch (e) {}
  return dl ? `Sale el ${dl} a las ${hm}` : 'Sale pronto';
}
// Cuenta regresiva corta para el pill de pendiente: "en 2 h 15 min".
function apvCountdown(d) {
  const ms = d.getTime() - Date.now();
  if (!(ms > 0)) return 'en cualquier momento';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `en ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 48) return `en ${h} h${m ? ` ${m} min` : ''}`;
  const days = Math.floor(h / 24);
  return `en ${days} día${days > 1 ? 's' : ''}`;
}
function apvPill(p, d, dOk) {
  const ap = String(p.approval || ''), st = String(p.status || '');
  const tz = apvTz();
  if (st === 'published') {
    const link = p.permalink || p.ig_permalink || p.url || '';
    return `<span class="apv-pill apv-pill-ok">✅ Publicado</span>${link ? ` <a class="apv-link" href="${esc(link)}" target="_blank" rel="noopener">Ver en Instagram ↗</a>` : ''}`;
  }
  if (st === 'failed') return '<span class="apv-pill apv-pill-warn">⚠️ No salió: sin aprobación a tiempo</span>';
  if (ap === 'rejected' || st === 'cancelled') return '<span class="apv-pill apv-pill-bad">❌ Rechazado — no se publica</span>';
  if (ap === 'auto') return '<span class="apv-pill apv-pill-auto">🤖 Salió solo (no lo viste a tiempo)</span>';
  if (ap === 'approved' && st === 'scheduled') return `<span class="apv-pill apv-pill-ok">✅ Aprobado — sale a las ${esc(dOk ? apvHM(d, tz) : '')}</span>`;
  if (ap === 'pending' && st === 'scheduled' && dOk && d.getTime() > Date.now()) return `<span class="apv-pill apv-pill-pend">⏳ Pendiente — sale ${esc(apvCountdown(d))} (o antes si lo aprobás)</span>`;
  return '<span class="apv-pill apv-pill-pend">⏳ Pendiente</span>';
}
function apvNotFound() {
  return `<div class="apv-wrap"><div class="card" style="text-align:center">
    <img src="ai-avatar.png" alt="Posty" style="width:72px;height:72px;border-radius:50%">
    <h3 style="margin:12px 0 6px">Ese posteo no existe 😅</h3>
    <p class="hint">Capaz se borró o el link está mal.</p>
    <a class="btn btn-soft" href="#/app/schedule" style="margin-top:10px">Volver a Schedule</a>
  </div></div>`;
}
// Mensaje pre-llenado del chat para "Editar": el usuario completa qué cambiar.
function apvEditPrompt(d, tz) {
  const hm = apvHM(d, tz), k = apvDayKey(d, tz);
  if (k === apvDayKey(new Date(), tz)) return `Quiero editar el posteo que sale hoy a las ${hm}`;
  if (k === apvDayKey(new Date(Date.now() + 864e5), tz)) return `Quiero editar el posteo que sale mañana a las ${hm}`;
  let dl = '';
  try { dl = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: tz }); } catch (e) {}
  return dl ? `Quiero editar el posteo que sale el ${dl} a las ${hm}` : 'Quiero editar ese posteo';
}
// ---------------------------------------------------------------------------
// Posty dogfood: tarjeta de la propuesta del día + vista dedicada (#/app/dogfood/:id).
// ---------------------------------------------------------------------------
function dogfoodCardHTML(p) {
  const cap = esc(String(p.caption || '')).slice(0, 220);
  return `<div class="card dogfood-card" id="dogfoodCard" style="border:2px solid #FEC14D;background:linear-gradient(135deg,#fffdf5,#fff)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:20px">🤖</span>
      <div><b>Posty para @posty.hacetodo</b>
      <div class="hint">⏳ Pendiente de tu aprobación — propuesta de hoy</div></div>
    </div>
    ${p.image_path ? `<img src="${esc(p.image_path)}" alt="Propuesta de Posty" style="width:100%;border-radius:12px" loading="eager">` : ''}
    <p style="margin:10px 0 4px">${cap}${String(p.caption || '').length > 220 ? '…' : ''}</p>
    <div style="display:flex;gap:10px;margin-top:12px">
      <button class="btn btn-primary" id="dogfoodApprove" data-dfid="${p.id}" style="flex:1;padding:14px;font-size:17px">✅ Publicar</button>
      <button class="btn btn-soft" id="dogfoodDismiss" data-dfid="${p.id}" style="flex:1;padding:14px;font-size:17px">⏭️ Saltar</button>
    </div>
  </div>`;
}
async function dogfoodAction(id, action) {
  const btn = action === 'approve' ? $('#dogfoodApprove') : $('#dogfoodDismiss');
  try { if (btn) { btn.disabled = true; btn.textContent = action === 'approve' ? 'Publicando…' : 'Descartando…'; } } catch (e) {}
  try {
    const r = await api.post(`/api/dogfood/${id}/${action}`, {});
    if (r && r.ok) {
      if (action === 'approve') toast('🎉 ¡Publicado en @posty.hacetodo!');
      else toast('⏭️ Descartado. Mañana te propongo otro.');
      render();
    } else {
      toast('😅 ' + ((r && (r.error || r.blocked)) || 'No se pudo completar'));
      render();
    }
  } catch (e) { toast('😅 No se pudo completar, probá de nuevo'); render(); }
}
function bindDogfood() {
  const a = $('#dogfoodApprove'), d = $('#dogfoodDismiss');
  if (a) a.onclick = () => dogfoodAction(a.dataset.dfid, 'approve');
  if (d) d.onclick = () => dogfoodAction(d.dataset.dfid, 'dismiss');
}
async function dogfoodView(id) {
  let p = null;
  try { const r = await api.get('/api/dogfood/pending'); p = (r && r.post) || null; } catch (e) {}
  if (!p || (id && String(p.id) !== String(id))) {
    return `<div class="card" style="text-align:center"><h3 style="margin:0 0 6px">🤖 Sin propuesta pendiente</h3>
      <p class="hint">Cada mañana te propongo un posteo para @posty.hacetodo. Volvé mañana ☀️</p>
      <a class="btn btn-soft" href="#/app/schedule" style="margin-top:10px">Ir a Schedule</a></div>`;
  }
  return `<div class="apv-wrap">
    <a class="apv-back" href="#/app/schedule">← Schedule</a>
    ${dogfoodCardHTML(p)}
  </div>`;
}
async function approvalPostView(id) {
  if (!id) return apvNotFound();
  let p = null, is404 = false, loadErr = false;
  try {
    const r = await api.get('/api/posts/' + encodeURIComponent(id));
    // El endpoint existente devuelve {post:{...}}; si el backend lo aplana, también sirve.
    p = (r && r.post) ? r.post : r;
  }
  catch (e) {
    if (e && e.status === 404) is404 = true;
    else loadErr = true;
  }
  if (is404 || (!loadErr && (!p || p.id == null))) return apvNotFound();
  if (loadErr) return `<div class="apv-wrap"><div class="card" style="text-align:center">
    <h3 style="margin:0 0 6px">😅 Uh, no pude cargar el posteo</h3>
    <p class="hint">Revisá tu conexión y probá de nuevo.</p>
    <button class="btn btn-soft" id="apvRetry" style="margin-top:10px">Reintentar</button>
  </div></div>`;
  try { track('apv_view', { id: p.id }); } catch (e) {}
  const tz = apvTz();
  const d = apvParse(p.scheduled_at), dOk = !isNaN(d);
  const st = String(p.status || ''), ap = String(p.approval || '');
  // Acciones solo mientras todavía hay algo que decidir.
  const canAct = st === 'scheduled' && (ap === 'pending' || ap === 'approved');
  const isVideo = String(p.media_type || '') === 'video';
  const media = p.image_path
    ? `<div class="apv-media">${isVideo
      ? `<video src="${esc(p.image_path)}" controls playsinline preload="metadata"></video>`
      : `<img src="${esc(p.image_path)}" alt="Posteo" loading="eager">`}</div>`
    : '';
  const cap = esc(String(p.caption || 'Sin texto todavía')).replace(/\n/g, '<br>');
  const tags = String(p.hashtags || '').trim();
  const editPrompt = dOk ? apvEditPrompt(d, tz) : 'Quiero editar ese posteo';
  const actions = canAct ? `
    <div class="apv-actions" id="apvActions">
      <button class="btn btn-primary" id="apvAccept" data-apvid="${esc(String(p.id))}">Aceptar ✅</button>
      <button class="btn btn-soft" id="apvEdit" data-apvedit="${esc(editPrompt)}">Editar ✏️</button>
      <button class="btn btn-danger" id="apvReject">Rechazar ❌</button>
    </div>
    <div class="apv-confirm" id="apvConfirm" hidden>
      <p><b>¿Seguro?</b> No se va a publicar.</p>
      <div class="apv-actions">
        <button class="btn btn-danger" id="apvRejectYes" data-apvid="${esc(String(p.id))}">Sí, rechazar</button>
        <button class="btn btn-soft" id="apvRejectNo">Cancelar</button>
      </div>
    </div>` : '';
  return `<div class="apv-wrap">
    <a class="apv-back" href="#/app/schedule">← Schedule</a>
    ${media}
    <div class="apv-pillrow">${apvPill(p, d, dOk)}</div>
    ${dOk ? `<div class="apv-when">⏰ ${esc(apvWhenText(d, tz))}</div>` : ''}
    <div class="apv-caption">${cap}${tags ? `<div class="apv-tags">${esc(tags)}</div>` : ''}</div>
    ${actions}
  </div>`;
}
function bindApprovalPost() {
  const rt = document.getElementById('apvRetry');
  if (rt) rt.onclick = () => render();
  const acc = document.getElementById('apvAccept');
  if (acc) acc.onclick = async () => {
    acc.disabled = true; acc.textContent = 'Aprobando…';
    try {
      await api.post('/api/posts/' + encodeURIComponent(acc.dataset.apvid) + '/approve');
      try { track('apv_approve', { id: acc.dataset.apvid }); } catch (e) {}
      toast('✅ <b>¡Aprobado!</b> Sale a la hora indicada 🙌');
    } catch (e) { toast('😅 ' + esc((e && e.message) || 'No se pudo aprobar')); }
    render(); // re-render sin recargar la página
  };
  const rej = document.getElementById('apvReject');
  if (rej) rej.onclick = () => {
    const c = document.getElementById('apvConfirm'), a = document.getElementById('apvActions');
    if (c) c.hidden = false;
    if (a) a.style.display = 'none';
  };
  const rno = document.getElementById('apvRejectNo');
  if (rno) rno.onclick = () => {
    const c = document.getElementById('apvConfirm'), a = document.getElementById('apvActions');
    if (c) c.hidden = true;
    if (a) a.style.display = '';
  };
  const ryes = document.getElementById('apvRejectYes');
  if (ryes) ryes.onclick = async () => {
    ryes.disabled = true; ryes.textContent = 'Rechazando…';
    try {
      await api.post('/api/posts/' + encodeURIComponent(ryes.dataset.apvid) + '/reject');
      try { track('apv_reject', { id: ryes.dataset.apvid }); } catch (e) {}
      toast('❌ <b>Rechazado.</b> No se va a publicar.');
    } catch (e) { toast('😅 ' + esc((e && e.message) || 'No se pudo rechazar')); }
    render(); // re-render sin recargar la página
  };
  const ed = document.getElementById('apvEdit');
  if (ed) ed.onclick = () => {
    // La edición vive en el chat (ahí Posty edita posteos hablando): se pre-llena el mensaje.
    try { sessionStorage.setItem('posty-chat-prefill', ed.dataset.apvedit || 'Quiero editar ese posteo'); } catch (e) {}
    location.hash = '#/app/chat';
  };
}
/* ---------- Pedido de permiso push oportuno: solo tras conectar IG ---------- */
// Se muestra UNA vez (flag localStorage 'push-ask-ig'). Nunca en frío al abrir la app.
function maybeAskPushPostIg() {
  try {
    if (localStorage.getItem('push-ask-ig')) return;
    localStorage.setItem('push-ask-ig', '1'); // consumido aunque no se muestre (p.ej. sin soporte)
  } catch (e) { return; }
  if (!pushSupported() || pushPerm() !== 'default') return; // sin soporte, bloqueado o ya dado: no molestar
  setTimeout(() => {
    if (document.getElementById('apvPushOv')) return;
    const ov = document.createElement('div');
    ov.id = 'apvPushOv';
    ov.className = 'pz-exp-overlay';
    ov.innerHTML = `
      <div class="pz-exp-modal" role="dialog" aria-modal="true">
        <img src="ai-avatar.png" alt="Posty" style="width:64px;height:64px;border-radius:50%;box-shadow:0 4px 14px rgba(39,147,200,.35)">
        <h2>¿Te aviso antes de cada posteo? 👀</h2>
        <p class="pz-exp-sub">Te lo muestro 3 horas antes — y si no te cierra, lo frenás con un toque.</p>
        <button class="btn btn-primary btn-block" id="apvPushYes">Sí, avisame</button>
        <button class="btn btn-soft btn-block" id="apvPushNo" style="margin-top:8px">Ahora no</button>
      </div>`;
    document.body.appendChild(ov);
    const close = () => { try { ov.remove(); } catch (e) {} };
    ov.querySelector('#apvPushYes').onclick = async () => {
      close();
      // pushDoSubscribe = segunda mitad de pushEnableFlow (permiso → suscripción),
      // sin repetir la tarjeta genérica: esta tarjeta YA fue el pedido amable.
      try {
        const r = await pushDoSubscribe();
        if (r && r.ok) toast('🔔 <b>¡Listo!</b> Te aviso antes de cada posteo 🙌');
      } catch (e) {}
    };
    ov.querySelector('#apvPushNo').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  }, 2500);
}

window.addEventListener('hashchange', render);
render();
setTimeout(trackScreen, 800); // primer screen_view de la carga (hashchange no dispara al entrar)
