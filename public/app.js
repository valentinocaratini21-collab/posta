/* Posta — frontend */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
const CHUNK_V = '20261001-v14'; // <-- el coordinador la reemplaza por el ?v= real al armar el zip
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
    const el = document.getElementById('scarcityLine');
    if (el && c && typeof c.spots_left === 'number') el.innerHTML = `🔥 Quedan <b>${c.spots_left} lugares</b> — cada negocio lleva trabajo personalizado.`;
  }).catch(() => {});
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
      <a href="#como-funciona">Cómo funciona</a>
      <a href="#ejemplos">Ejemplos</a>
      <a href="#planes">Planes</a>
      <a href="#faq">Preguntas</a>
      <a href="#/login">Entrar</a>
      <a class="btn btn-primary btn-sm" href="/prueba">Probar gratis</a>
    </div>
    <button class="hamburger" onclick="toggleMobileMenu()" aria-label="Abrir menú"><span></span><span></span><span></span></button>
  </div>
  <div class="mobile-menu" id="mobileMenu">
    <a href="#como-funciona">Cómo funciona</a>
    <a href="#ejemplos">Ejemplos</a>
    <a href="#planes">Planes</a>
    <a href="#faq">Preguntas</a>
    <a href="#/login">Entrar</a>
    <a class="btn btn-primary btn-block" href="/prueba">Probar gratis</a>
  </div></div>
  <div class="hero"><div class="wrap">
    <img class="hero-posty" src="ai-avatar.png" alt="Posty, tu community manager">
    <div class="pill">🤖 Tu community manager</div>
    <h1>Tu semana de Instagram,<br><span class="hl">hecha en 1 minuto</span></h1>
    <p class="sub">Posty crea las ideas, los diseños y los textos con <b>tu marca</b>. Vos solo aprobás — yo me ocupo de todo.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="/prueba" style="font-size:17px;padding:18px 46px">Ver mi semana gratis 👀</a>
    </div>
    <div class="hero-note">Sin tarjeta · probalo gratis · Cancelá cuando quieras</div>
    <div class="hero-note" style="margin-top:10px"><a href="/auditoria" style="color:var(--cel);font-weight:800;text-decoration:none">🔍 ¿Tu Instagram vende? Audit gratis →</a></div>
    <div class="pz-beforeafter">
      <h3>La diferencia se ve en una semana</h3>
      <div class="pz-ba-row">
        <div class="pz-ba-panel">
          <div class="pz-ba-label">TU INSTAGRAM HOY</div>
          <div class="pz-ba-grid">${'<span></span>'.repeat(9)}</div>
        </div>
        <div class="pz-ba-arrow">→</div>
        <div class="pz-ba-panel">
          <div class="pz-ba-label pz-ba-label-on">CON POSTY</div>
          <img src="hero-feed.jpg" alt="Feed de Instagram gestionado por Posty">
        </div>
      </div>
    </div>
    <div class="hero-co">Posty es un producto de <b>Posta</b> · Hecho en Argentina 🇦🇷</div>
    <div class="mock-row">
      <div class="phone"><div class="screen">
        <img src="hero-post.jpg" alt="Ejemplo de posteo creado por Posty">
        <div class="cap"><b>tu_negocio</b> 🔥 Nuevo ingreso que te va a encantar... <br><span style="color:#2793C8">#modaargentina #emprendedoresargentinos</span></div>
      </div></div>
      <div class="phone"><div class="screen">
        <video src="hero-reel2.mp4" poster="hero-reel2-poster.jpg" autoplay muted loop playsinline preload="metadata"></video>
        <div class="cap"><b>Pet Shop Huella</b> 🎬 Su reel de la semana, hecho por Posty...</div>
      </div></div>
    </div>
  </div></div>
  <div class="section" id="ejemplos" style="background:var(--bg2)"><div class="wrap">
    <h2>Hecho por Posty 🤖</h2>
    <p class="lede">Diseños y videos que armo en minutos, para cualquier rubro. Imaginá tu negocio acá 👇</p>
    <div class="show-row">
      <div class="phone sm"><div class="screen"><img loading="lazy" src="post-food.png" alt="Diseño para restaurante creado por Posty"></div><div class="cap"><b>Gastronomía</b> · Café & brunch</div></div>
      <div class="phone sm"><div class="screen"><video src="showcase-reel-cafe2.mp4" autoplay muted loop playsinline></video></div><div class="cap"><b>▶ Showreel</b> · Café Martínez</div></div>
      <div class="phone sm"><div class="screen"><img loading="lazy" src="post-moda.png" alt="Diseño para tienda de ropa creado por Posty"></div><div class="cap"><b>Moda</b> · Tienda Cora</div></div>
      <div class="phone sm"><div class="screen"><img loading="lazy" src="post-barber.png" alt="Diseño para barbería creado por Posty"></div><div class="cap"><b>Barbería</b> · El Corte</div></div>
      <div class="phone sm"><div class="screen"><img loading="lazy" src="post-belleza.png" alt="Diseño para estética creado por Posty"></div><div class="cap"><b>Belleza</b> · Estética Alma</div></div>
      <div class="phone sm"><div class="screen"><img loading="lazy" src="post-mascotas.png" alt="Diseño para pet shop creado por Posty"></div><div class="cap"><b>Mascotas</b> · Pet Shop Huella</div></div>
      <div class="phone sm"><div class="screen"><img loading="lazy" src="post-fitness.png" alt="Diseño para gimnasio creado por Posty"></div><div class="cap"><b>Fitness</b> · Gym Norte</div></div>
      <div class="phone sm"><div class="screen"><img loading="lazy" src="gastro-1.png" alt="Promo 2x1 para restaurante creada por Posty"></div><div class="cap"><b>Gastronomía</b> · Promo 2x1</div></div>
    </div>
    <div style="text-align:center;margin-top:28px"><a class="btn btn-primary" href="/prueba">Quiero mi semana así 👀</a></div>
  </div></div>
  <div class="section" id="como-funciona"><div class="wrap">
    <h2>Así trabajo yo 👇</h2>
    <p class="lede">Vos seguí atendiendo tu negocio. Del resto me ocupo yo.</p>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Me contás tu negocio una vez</h3><p>Qué vendés, tu estilo, tus fotos. Te lleva 2 minutos y no te pido más nada.</p></div>
      <div class="step"><div class="num">2</div><h3>Yo creo todo por vos</h3><p>Pienso las ideas, diseño con tus fotos y tu marca, y escribo los captions y hashtags que venden.</p></div>
      <div class="step"><div class="num">3</div><h3>Vos aprobás, yo publico</h3><p>Tu semana queda programada a la mejor hora. Nada sale sin tu OK.</p></div>
    </div>
    <div style="text-align:center;margin-top:28px"><a class="btn btn-primary" href="/prueba">Empezar mi prueba gratis</a></div>
  </div></div>
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
    </div>
    <p class="unico-line">Un community manager cuesta <b>$300.000+/mes</b>. Posty arranca en <b>$39.900</b>.</p>
    <div style="text-align:center;margin-top:18px"><a class="btn btn-primary" href="/prueba">Probar gratis</a></div>
  </div></div>
  <div class="section" id="planes"><div class="wrap">
    <h2>Elegí tu plan</h2>
    <p class="lede">Primero probá gratis 3 días. Si te gusta tu semana, elegís tu plan acá.</p>
    <div class="country-toggle">
      <button class="${country === 'AR' ? 'on' : ''}" data-country="AR" onclick="switchPlansCountry('AR')">🇦🇷 Argentina</button>
      <button class="${country === 'UY' ? 'on' : ''}" data-country="UY" onclick="switchPlansCountry('UY')">🇺🇾 Uruguay</button>
    </div>
    <div class="anchor-line" id="anchorLine">${anchorHTML(cfg && cfg.anchor)}</div>
    <div class="scarcity" id="scarcityLine">🔥 Solo <b>50 lugares</b> por mes — cada negocio lleva trabajo personalizado.</div>
    <div class="plans-row" id="plansRow">${planCards || '<p>Cargando planes...</p>'}</div>
    <div class="plan-dots" id="planDots"><span class="on"></span><span></span><span></span></div>
  </div></div>
  <div class="section" id="faq" style="background:var(--bg2)"><div class="wrap" style="max-width:760px">
    <h2>Preguntas frecuentes</h2>
    <p class="lede">Lo que todos preguntan antes de empezar.</p>
    <div class="faq">
      <details><summary>¿Necesito hacer algo?</summary><p>No. Me contás de tu negocio una sola vez y listo. Yo creo las ideas, los diseños, los textos y publico. Si querés, podés revisar todo antes de que salga.</p></details>
      <details><summary>¿Posty publica en mi cuenta real de Instagram?</summary><p>Sí. Conectás tu cuenta Business una vez y publico directamente en tu perfil con la API oficial de Meta. Y en la prueba gratis ya ves tu semana armada antes de registrarte.</p></details>
      <details><summary>¿Usás mis fotos y mi marca?</summary><p>Sí, eso es lo más importante: subís tus fotos y tu logo una vez, definimos tus colores, y todos los diseños salen con tu identidad. Nada genérico.</p></details>
      <details><summary>¿Puedo cancelar cuando quiera?</summary><p>Sí, sin preguntas ni trabas. Cancelás desde tu cuenta y listo.</p></details>
      <details><summary>¿Qué pasa si no me gusta un posteo?</summary><p>Me lo decís por el chat y lo cambio, o lo eliminás antes de que se publique. Además aprendo de lo que te gusta para hacerlo cada vez mejor.</p></details>
      <details><summary>¿Tengo que darte mi contraseña de Instagram?</summary><p>No. Conectás tu cuenta con el login oficial de Meta, igual que cuando entrás con Google en otras apps. Nunca veo ni guardo tu contraseña.</p></details>
      <details><summary>¿Publicás sin que yo lo apruebe?</summary><p>No. Todo queda como borrador y solo se publica lo que vos revisás y programás. Nada sale sin tu OK.</p></details>
      <details><summary>¿Y si no me funciona?</summary><p>Por eso la prueba es gratis y sin tarjeta: mirá tu semana armada en 1 minuto y decidí. Si no te sirve, no pagás nada.</p></details>
      <details><summary>¿Cuándo veo mi primera semana?</summary><p>Ya mismo: en la prueba gratis la ves armada en 1 minuto, y al crear tu cuenta entra como borradores, listos para revisar.</p></details>
    </div>
    <div style="text-align:center;margin-top:44px">
      <a class="btn btn-primary" href="/prueba" style="font-size:16px;padding:18px 44px">Ver mi semana gratis 👀</a>
    </div>
  </div></div>
  <div class="footer"><div class="wrap">
    <span class="logo logo-posty" style="font-size:17.5px"><img src="ai-avatar.png" alt="posty.">posty<span class="pdot">.</span></span>
    <span>Un producto de Posta · Hecho en Argentina 🇦🇷 · © 2026</span>
    <span style="margin-left:12px"><a href="/privacidad.html" style="color:var(--sky)">Privacidad</a> · <a href="/terminos.html" style="color:var(--sky)">Términos</a></span>
  </div></div>
  <div class="lp-sticky"><div class="wrap"><a class="btn btn-primary btn-block" href="/prueba">✨ Probar gratis</a></div></div>`;
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
// Celebración grande: confetti (ya existente) + coreografía de malabares ~3.2s:
// el avatar en grande (~120px) saltando + 3 pelotas amarillas en cascada.
// Todo CSS puro (clases .posty-celebrate / .pc-ava / .pc-ball en styles.css).
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
    ov.innerHTML = '<img class="pc-ava" src="ai-avatar.png" alt="Posty festejando">'
      + '<span class="pc-ball b1"></span><span class="pc-ball b2"></span><span class="pc-ball b3"></span>';
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
  try { if (typeof postyCelebrate === 'function') postyCelebrate(); } catch (e) {} // confetti + malabares
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
function setupChecklistHtml(title) {
  const rows = [];
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
    <button class="drawer-link ${tab === 'chat' ? 'on' : ''}" data-tab="chat"><span class="di">💬</span>Chat</button>
    <button class="drawer-link ${tab === 'schedule' ? 'on' : ''}" data-tab="schedule"><span class="di">📅</span>Schedule<span class="sched-count" id="schedCount" style="display:none"></span></button>
    <button class="drawer-link ${tab === 'numeros' ? 'on' : ''}" data-tab="numeros"><span class="di">📊</span>Tus números</button>
    <button class="drawer-link ${tab === 'ajustes' ? 'on' : ''}" data-tab="ajustes"><span class="di">⚙️</span>Ajustes</button>
    <div class="drawer-grow"></div>
    <button class="drawer-link drawer-logout" id="drawerLogout"><span class="di">🚪</span>Salir</button>
  </aside>
  ${tab === 'chat' ? '' : setupChecklistHtml()}
  <div class="app-shell">
    <div class="main ${tab === 'chat' ? 'main-chat' : ''}">${content}</div>
  </div>`;
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
    <p style="color:var(--mut);font-size:13px;line-height:1.6;margin-bottom:6px">Textos, diseños y un reel con tus fotos. Vos revisás y aprobás — al aceptar, salen solos.</p>
    <p style="font-size:11.5px;color:var(--dim);margin-bottom:16px">Tu plan: <b>${esc(planTag)}</b> · ${ppw} posteos por semana (1 es reel 🎬)${assetPhotos().length || assetVideos().length ? ` · 🖼️ usamos tus fotos y videos` : ''}${assetLogo() ? ' · con tu logo' : ''}</p>
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
                  <img src="${esc(p)}" data-lightbox="${esc(p)}" alt="Foto ${k + 1} del carrusel">
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
            : `<img src="${esc(d.image_path)}" data-lightbox="${esc(d.image_path)}" alt="Diseño del borrador ${i + 1}">`}
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
        const r = await api.post(`/api/drafts/${id}/photo-style`, { style: code }, { timeout: 120000 });
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
      const when = (winp && winp.value) ? new Date(winp.value).toISOString() : null;
      await api.patch('/api/posts/' + id, { scheduled_at: when, caption: ta ? ta.value : undefined });
      try { await api.post(`/api/posts/${id}/signal`, { signal: 'approved' }); } catch (e) {}
      try { await api.post('/api/funnel', { event: 'week_accepted' }); } catch (e) {}
      track('draft_accept', { id });
      const last = REVIEW_DRAFTS.filter(d => d.id !== id).length === 0;
      if (last) {
        // Festejo: aceptar se siente como un logro, no como un trámite
        streakModalShell(`
          <div class="big-emoji">🎉</div>
          <h3 style="margin:12px 0 4px">¡Listo! Tu semana se publica sola</h3>
          <p style="font-size:14px;margin:0 0 6px">Todos tus posteos quedaron programados ✅</p>
          <p class="d">Te avisamos por email cuando salga cada uno. 📬</p>
          ${celebRefHTML()}
          <button class="btn btn-primary btn-block" id="celebGo" style="margin-top:10px">Ver mi semana →</button>`);
        const cmo = document.getElementById('streakModal');
        if (cmo) wireCelebRef(cmo);
        const cg = $('#celebGo');
        if (cg) cg.onclick = () => { closeStreakModal(); render(); };
        else render();
      } else render();
    } catch (e) {
      if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); }
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
      track('schedule_all', { count: n });
      // Ya no hay borradores: la píldora y los chips se actualizan en el acto.
      try { REVIEW_DRAFTS = []; } catch (e) {}
      try { paintWeekPill(); } catch (e) {}
      try { renderQuickChips([], r.scheduled || [], false); } catch (e) {}
      streakModalShell(`
        <div class="big-emoji">📅</div>
        <h3 style="margin:12px 0 4px">✅ Tu semana está programada</h3>
        <p style="font-size:14px;margin:0 0 6px">${n} ${n === 1 ? 'posteo sale solo' : 'posteos salen solos'} en su horario 🎉</p>
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
    if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); }
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
    if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); }
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
    const items = $$('#reviewCard [data-revwhen]')
      .map((inp) => ({ id: +inp.dataset.revwhen, scheduled_at: inp.value ? new Date(inp.value).toISOString() : null }))
      .filter((it) => it.id > 0);
    const r = await api.post('/api/posts/accept-all', { items });
    const n = (r && r.accepted) || 0;
    if (!n) throw new Error('No había borradores pendientes');
    try { track('accept_all', { count: n }); } catch (e) {}
    try { REVIEW_DRAFTS = []; } catch (e) {}
    try { paintWeekPill(); } catch (e) {}
    toast(n === 1
      ? `✅ <b>Listo, acepté el posteo.</b><br>Sale solo a la hora indicada 👌`
      : `✅ <b>Listo, acepté los ${n}.</b><br>Salen solos a la hora indicada 👌`);
    render();
  } catch (e) {
    if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); }
    else if (m) { m.innerHTML = `<div class="err">😅 ${esc(e.message)}</div>`; m.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (b) { b.disabled = false; b.textContent = '✅ Aceptar todos'; }
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
async function chatMoreImage() {
  if (!CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  const b = $('#chatMoreImg');
  if (b) { b.disabled = true; postyThinking(b); }
  try {
    await renderChatPreviews();
    if (CHAT_IDEA !== idea) return;
    renderChatStoryboard();
  } finally {
    const b2 = $('#chatMoreImg');
    if (b2 && CHAT_IDEA === idea) { stopPostyThinking(b2); b2.disabled = false; b2.textContent = '↻ Otra imagen'; }
  }
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
    const prev = c.length > 90 ? cortar(c, 90) + '…' : c;
    b.innerHTML = `<b>Opción ${i + 1}</b><span>${esc(prev)}</span>`;
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
      const r = await api.post('/api/concept-shot', { idea, tipo, headline, refs: refs || [], excludeStyles: excludeStyles || [] }, { timeout: 120000 });
      if (r && r.ok === false && r.capped) throw { aiCap: true, message: r.error || '' };
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
async function renderChatPreviews() {
  const box = $('#chatPreviews');
  if (!box || !CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  const stopPrevThinking = () => stopPostyThinking($('#chatPrevThinking'));
  box.innerHTML = '<div class="chat-prev-loading" id="chatPrevThinking"></div>';
  postyThinking($('#chatPrevThinking'), ['Generando tu imagen 🎨…', 'Aplicando tu estilo ✨…']);
  try {
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
      box.innerHTML = '<div style="font-size:12px;color:var(--mut)">No pude generar la imagen 😅 Probá tocando ↻ Otra imagen.</div>';
      CHAT_PREVIEWS = [];
      return;
    }
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
  } catch (e) {
    if (CHAT_IDEA !== idea) return;
    stopPrevThinking();
    const detail = String((e && e.message) || '').slice(0, 120);
    if (isAiCapErr(e)) {
      box.innerHTML = '<div style="font-size:12px;color:var(--mut)">Llegué al tope diario de imágenes 😅 Probá de nuevo en un rato.</div>';
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

function chatCardHTML(compact, noEditChip, bareWrap) {
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
  const chips = !msgs ? `
    <div class="chat-chips" id="chatChips">
      <button data-chip="Haceme un posteo de promo para esta semana">✨ Haceme un posteo</button>
      ${noEditChip ? '' : `<button data-chip="Cambiá el texto del segundo posteo, hacelo más corto">✏️ Editá un borrador</button>`}
      <button data-chip="Dame una idea para vender más esta semana">💡 Dame una idea</button>
    </div>` : '';
  return `
  ${wrap}
    ${title}${desc}
    <div class="chat-box" id="chatBox">
      ${msgs || `<div class="chat-msg ai">¡Hola! 👋 ¿Qué hacemos hoy?</div>`}
    </div>${chips}
    <div id="chatProposal">${proposalHTML()}</div>
    <div id="chatPhotos" class="chat-photos"></div>
    <div class="chat-input-row">
      <button class="btn btn-soft" id="chatPlus" title="Agregar foto o video">＋</button>
      <input id="chatInput" class="in" placeholder="Escribile a Posty…" maxlength="2000" autocomplete="off">
      <button class="btn btn-soft" id="chatMicSend" title="Pedir con nota de voz">🎙</button>
      <input type="file" id="chatFile" accept="image/*,video/*" multiple hidden>
      <div class="chat-plus-menu" id="chatPlusMenu" hidden>
        <button data-k="photo">📷 Foto</button>
        <button data-k="video">🎬 Video</button>
      </div>
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
// Solo cuando está tranqui (no haciendo malabares).
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

// Posty trabajando: cambia el avatar al VIDEO de malabares 🤹 mientras genera.
// Cuando termina, vuelve a la imagen normal.
function postyWorking(on) {
  try {
    document.querySelectorAll('.chome-ava-wrap').forEach(w => {
      w.classList.toggle('working', !!on);
      const img = w.querySelector('.chome-ava');
      let vid = w.querySelector('.chome-ava-vid');
      if (on) {
        if (img) img.style.display = 'none';
        if (!vid) {
          vid = document.createElement('video');
          vid.className = 'chome-ava-vid';
          vid.src = 'ai-avatar-working.mp4';
          vid.muted = true; vid.loop = true; vid.autoplay = true; vid.playsInline = true;
          vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
          w.appendChild(vid);
        }
        const pr = vid.play(); if (pr && pr.catch) pr.catch(() => {});
      } else {
        if (img) img.style.display = '';
        if (vid) { try { vid.pause(); } catch (e) {} vid.remove(); }
      }
    });
  } catch (e) {}
}

async function chatMakePost(asVideo) {
  const idea = CHAT_IDEA;
  if (!idea) return;
  // Cupo del plan: chequear antes de crear para no perder la idea armada
  try {
    const q = await api.get('/api/quota');
    try { const mount = document.getElementById('chatQuickChips'); if (mount) { paintChatQuota(mount, q); paintUpcoming(mount); } } catch (e) {}
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
    try { const mount = document.getElementById('chatQuickChips'); if (mount) { paintChatQuota(mount); paintUpcoming(mount); } } catch (e) {}
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
// Vista #/app/chat: el chat a pantalla completa, con saludo proactivo y
// las tarjetas de la semana adentro. Mi semana y Ajustes siguen como pestañas.
async function chatView() {
  // Orden "contenido primero": la estrella son los borradores; el chat y el
  // checklist bajan de protagonismo (el checklist sigue 100% funcional).
  return `
  <div class="chat-home">
    <div class="chome-top">
      <button type="button" class="chome-ava-btn" id="chomeLvlBtn" aria-label="Nivel de Posty">
        <span class="chome-ava-wrap"><img src="ai-avatar.png" class="chome-ava" alt="Posty"></span>
        <span class="chome-lvl" id="chomeLvl" hidden></span>
      </button>
      <div><b>Posty<span class="pdot">.</span></b><div class="chome-sub">Tu community manager de confianza.<br>Vos vendé. Yo posteo.</div></div>
    </div>
    <div id="firstPickSlot"></div>
    <div id="revMsg"></div>
    <div id="nextStepCta" style="display:none"><button type="button" class="btn btn-primary" id="nextStepBtn">Revisá tu semana 👇</button></div>
    ${chatCardHTML(true, true, true)}
    ${setupSecondaryHtml()}
    <div id="apProg-semana"></div>
  </div>`;
}

async function bindChatView() {
  bindChat();
  bindReview();
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
      ${canApprove ? '<button type="button" data-pc-act="approve" class="pcard-approve">✅ Aprobar</button>' : ''}
    </div>`;
  return `<div class="pcard pcard-${layout}" data-post-id="${esc(String(p.id))}" data-sched-at="${esc(String(p.scheduled_at || ''))}" data-day-label="${esc(dayLabel)}">
    <button type="button" class="pcard-media" data-pc-act="open" aria-label="Ver posteo">${media}</button>
    <div class="pcard-body">
      <div class="pcard-meta"><b>${esc(when)}</b>${pcBadge(p)}</div>
      <div class="pcard-cap" data-pc-act="edit-cap" data-full="${esc(capFull)}" title="Tocá para editar">${esc(capFull)}</div>
      ${actions}
    </div>
  </div>`;
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
  const capEl = card.querySelector('.pcard-cap');
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
  const capEl = card.querySelector('.pcard-cap');
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
  // Actualiza todas las tarjetas visibles de este posteo.
  document.querySelectorAll('[data-post-id="' + id + '"]').forEach(c => {
    const ce = c.querySelector('.pcard-cap');
    if (ce) { ce.dataset.full = v; ce.textContent = v; ce.style.display = ''; }
    const we = c.querySelector('.pcard-edit');
    if (we) we.remove();
  });
  toast('✅ Caption actualizado');
}
// --- Loading + imagen inline en todas las tarjetas del posteo ---
function pcSetLoading(id, on, label) {
  document.querySelectorAll('[data-post-id="' + id + '"] .pcard-media').forEach(m => {
    let ov = m.querySelector('.pcard-loading');
    if (on) {
      if (!ov) { ov = document.createElement('div'); ov.className = 'pcard-loading'; m.appendChild(ov); }
      ov.innerHTML = '<span>' + esc(label || '⏳ Generando…') + '</span>';
    } else if (ov) ov.remove();
  });
}
function pcSetImage(id, path) {
  document.querySelectorAll('[data-post-id="' + id + '"] .pcard-media').forEach(m => {
    const img = m.querySelector('img');
    if (img) img.src = path;
    else m.innerHTML = '<img src="' + esc(path) + '" alt="" loading="lazy">';
  });
}
// --- Bottom sheet: cambiar imagen (3 caminos) ---
let PC_STYLES_CACHE = null;
function pcCloseSheet() {
  document.querySelectorAll('.pcsheet-backdrop').forEach(x => { try { x.remove(); } catch (e) {} });
}
async function pcLoadStyles(sel) {
  if (PC_STYLES_CACHE) { pcFillStyles(sel, PC_STYLES_CACHE); return; }
  try {
    const r = await api.get('/api/image-styles');
    PC_STYLES_CACHE = ((r && r.styles) || []).filter(s => s && (s.code || s.id));
  } catch (e) { PC_STYLES_CACHE = []; }
  pcFillStyles(sel, PC_STYLES_CACHE);
}
function pcFillStyles(sel, styles) {
  if (!sel) return;
  sel.innerHTML = '<option value="">Elegí un estilo…</option>' + styles.map(s => {
    const code = String(s.code || s.id || '');
    const label = String(s.name || s.label || code);
    return '<option value="' + esc(code) + '">' + esc(label) + '</option>';
  }).join('');
  sel.dataset.loaded = '1';
}
function pcOpenImageSheet(id) {
  pcCloseSheet();
  const bd = document.createElement('div');
  bd.className = 'pcsheet-backdrop';
  bd.innerHTML = `<div class="pcsheet" data-post-id="${esc(String(id))}" role="dialog" aria-modal="true">
    <div class="pcsheet-handle"></div>
    <div class="pcsheet-title">Cambiar imagen</div>
    <button type="button" class="pcsheet-opt" data-pc-act="img-style">🎨 Otro estilo</button>
    <div class="pcsheet-stylewrap" hidden>
      <select class="pcsheet-select" aria-label="Elegí un estilo"><option value="">Cargando estilos…</option></select>
    </div>
    <button type="button" class="pcsheet-opt" data-pc-act="img-upload">📷 Mi foto</button>
    <input type="file" accept="image/*" class="pcsheet-file" hidden>
    <button type="button" class="pcsheet-opt" data-pc-act="img-enhance">✨ Mejorar esta</button>
    <button type="button" class="pcsheet-close" data-pc-act="img-close">Cerrar</button>
    <div class="pcsheet-msg"></div>
  </div>`;
  document.body.appendChild(bd);
  bd.addEventListener('click', (e) => { if (e.target === bd) pcCloseSheet(); });
  const sheet = bd.querySelector('.pcsheet');
  const sel = sheet.querySelector('.pcsheet-select');
  sel.addEventListener('change', () => { if (sel.value) pcRestyle(id, sel.value); });
  const file = sheet.querySelector('.pcsheet-file');
  file.addEventListener('change', () => { if (file.files && file.files[0]) pcUploadPhoto(id, file.files[0]); });
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
// --- UN solo listener delegado para [data-pc-act] ---
function pcOnClick(e) {
  const el = e.target && e.target.closest ? e.target.closest('[data-pc-act]') : null;
  if (!el) return;
  const root = el.closest('[data-post-id]');
  if (!root) return;
  const id = root.dataset.postId;
  const act = el.dataset.pcAct;
  if (act === 'open') { location.hash = '#/app/post/' + encodeURIComponent(id); return; }
  if (act === 'edit-cap') { pcStartEdit(root); return; }
  if (act === 'save-cap') { pcSaveCap(root, id, el); return; }
  if (act === 'cancel-cap') { pcCancelEdit(root); return; }
  if (act === 'image') { pcOpenImageSheet(id); return; }
  if (act === 'skip') { pcSkip(id, root); return; }
  if (act === 'approve') { pcApprove(id, root, el); return; }
  if (act === 'img-style') {
    const wrap = root.querySelector('.pcsheet-stylewrap');
    const sel = root.querySelector('.pcsheet-select');
    if (wrap) {
      const show = wrap.hidden;
      wrap.hidden = !show;
      if (show && sel && !sel.dataset.loaded) pcLoadStyles(sel);
    }
    return;
  }
  if (act === 'img-upload') { const f = root.querySelector('.pcsheet-file'); if (f) f.click(); return; }
  if (act === 'img-enhance') { pcEnhance(id); return; }
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
  paintChatQuota(mount); paintUpcoming(mount);
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
  const prog = document.getElementById('apProg-' + t);
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
// Chequeo previo a crear: true = hay cupo; false = se mostró el modal de mejora
async function checkQuotaOrModal() {
  try {
    const q = await api.get('/api/quota');
    // Sincronizar la barrita con el dato fresco (si no, miente)
    try {
      const mount = document.getElementById('chatQuickChips');
      if (mount) { paintChatQuota(mount, q); paintUpcoming(mount); }
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
  track('paywall_view', { plan: (q && q.plan_name) || '', limit: (q && q.limit) || 0 });
  streakModalShell(`
    <img src="ai-avatar.png" alt="Posty" style="width:64px;height:64px;border-radius:50%;box-shadow:0 4px 14px rgba(39,147,200,.35)">
    <h3 style="margin:12px 0 4px">¡Llegamos al tope de la semana! 🚀</h3>
    <p style="font-size:14px;margin:0 0 6px">Tu plan <b>${esc(q.plan_name || '')}</b> incluye <b>${q.limit} posteos por semana</b> — y los usamos todos, ¡bien ahí!</p>
    <p class="d">${(typeof IS_NATIVE !== 'undefined' && IS_NATIVE) ? 'La semana que viene arrancás de cero de nuevo.' : 'Mejorá tu paquete y seguimos posteando ya mismo — se activa al instante, sin vueltas.'}</p>
    ${left > 0 && opts.onPartial ? `<button class="btn btn-soft btn-block" id="qPartial" style="margin-top:10px">Armar solo ${left === 1 ? 'el que me queda' : `los ${left} que me quedan`} →</button>` : ''}
    ${!(typeof IS_NATIVE !== 'undefined' && IS_NATIVE) ? '<button class="btn btn-primary btn-block" id="qUpgrade" style="margin-top:10px">⬆️ Mejorar mi paquete</button>' : ''}
    <button class="btn btn-ghost btn-block" id="qClose" style="margin-top:8px">Entendido</button>`);
  const up = document.getElementById('qUpgrade');
  if (up) up.onclick = () => { closeStreakModal(); location.hash = '#/app/ajustes?plan=1'; };
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
  const say = (html) => { const el = document.getElementById('adsBoostMsg'); if (el) el.innerHTML = html; };
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
  const recCards = list.length && budgets.length
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
  const boostRows = bl.length ? bl.map(b => `
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
  <div class="card" style="border:2px solid var(--yel)">
    <h3 style="margin:0 0 4px">💰 Tu crédito</h3>
    <div style="font-size:30px;font-weight:800;margin:2px 0 6px">${fmtARSc(bal)}</div>
    <p class="d" style="margin:0 0 10px">Un solo precio por potenciar tu posteo durante 7 días en Instagram y Facebook. Sin letra chica.</p>
    ${cfg && cfg.mp_ready ? `
      <p style="font-weight:700;font-size:12.5px;margin:0 0 8px">Cargar crédito</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${topupBtns}</div>
      <div id="adsMsg"></div>
    ` : `<p class="d">La carga de crédito se habilita en estos días. Escribinos y la activamos para tu cuenta.</p>`}
  </div>
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
    ${isFirst ? '<p style="font-size:15px;margin:0 0 6px;color:var(--mut)">La primera de muchas. Yo armo, vos aprobás — así de fácil va a ser siempre 💪</p>' : ''}
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
function postAuthLanding() {
  // Decisión normal post-registro/login: onboarding si falta el negocio, si no al chat con Posty (chat-first).
  const homeTab = '#/app/chat';
  const chosen = localStorage.getItem('posta_chosen_plan');
  if (PROFILE && PROFILE.business_name) {
    location.hash = chosen ? '#/app/ajustes?plan_sel=' + encodeURIComponent(chosen) : homeTab;
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
async function obConfirmSave() {
  const o = OB, p = o.profile || {};
  const btn = $('#obConfirm'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }
  try {
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
    const colors = (o.colors || []).filter((c, i, a) => c && a.indexOf(c) === i);
    if (colors.length >= 2) await api.put('/api/settings', { brand_colors: colors });
    SETTINGS = await api.get('/api/settings');
    await refreshSession();
    clearOB(); // onboarding confirmado: ya no hay nada que retomar
    const chosenPlan = localStorage.getItem('posta_chosen_plan');
    location.hash = chosenPlan ? '#/app/ajustes?plan_sel=' + encodeURIComponent(chosenPlan) : '#/app/schedule';
  } catch (e) {
    const m = $('#obMsg'); if (m) m.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = '✅ Todo bien, arranquemos'; }
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
  if (!o.started || o._resumePending) { o.started = true; o._resumePending = false; setTimeout(() => { if (OB === o && !o.loading && !o.done && o.phase === 'chat') obNext(); }, 60); }
  if (o.phase === 'summary' && o.profile) return obSummaryHTML();
  const msgs = o.chat.map(m => `<div class="chat-msg ${m.role === 'user' ? 'u' : 'ai'}">${esc(m.role === 'user' && !m.text ? '⏭️ Salteado' : m.text)}</div>`).join('');
  const pct = Math.round((o.step / o.total) * 100);
  return `<div class="page-head"><div class="ph-ico">🚀</div><div class="ph-txt"><h1>Te conozco primero</h1><p class="sub">Una charla rápida — con esto armo todo por vos.</p></div></div>
  <div class="card" style="max-width:640px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:11.5px;color:var(--mut);font-weight:700">Pregunta ${Math.min(o.step + 1, o.total)} de ${o.total}</span>
      <span style="display:flex;gap:10px;align-items:center;flex:none">
        ${o.phase === 'chat' && !o.loading ? `<button class="btn btn-ghost btn-sm" id="obSkip">Saltear ⏭️</button>` : ''}
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
async function render() {
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

  // Anclas dentro de la landing (#como-funciona, #incluye, #planes, #faq): no son rutas de la app
  if (!path.startsWith('#/')) {
    if (!LANDING_ON) {
      PLANS_CACHE = await api.get('/api/billing/plans').catch(() => null);
      root.innerHTML = landingView(PLANS_CACHE);
      LANDING_ON = true;
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
        postAuthLanding();
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
    // App instalada: se comporta como app, no como web. Va directo al chat
    // (o al login si no hay sesión) en vez de la landing de marketing.
    if (pwaIsStandalone()) { location.hash = '#/app/chat'; return; }
    // Logueado en la web: la vista principal es el chat con Posty (chat-first).
    // Visitante no logueado: la landing pública no cambia.
    await refreshSession();
    if (ME) { location.hash = '#/app/chat'; return; }
    PLANS_CACHE = await api.get('/api/billing/plans').catch(() => null);
    root.innerHTML = landingView(PLANS_CACHE);
    LANDING_ON = true;
    refreshScarcity(); // número vivo de /api/capacity (fallback: 50 del template)
    return;
  }

  // App (requiere login)
  LANDING_ON = false;
  await refreshSession();
  if (!ME && NET_OFFLINE) { root.innerHTML = offlineView(); bindOffline(); return; }
  if (!ME) { location.hash = '#/login'; return; }
  const tabRaw = path.split('/')[2] || '';
  // 🔔 Posty te avisa: #/app/post/:id → el id del posteo a aprobar
  const postId = decodeURIComponent(path.split('/')[3] || '').trim();
  // Chat-first en todas las plataformas: sin pestaña explícita se abre el
  // chat con Posty. Con pestaña explícita se respeta (navegación secundaria).
  let tab = tabRaw || 'chat';
  let content = '';
  if (tab === 'chat') content = await chatView();
  else if (tab === 'semana') { location.hash = '#/app/schedule'; return; } // Mi semana se fusionó en Schedule
  else if (tab === 'schedule') content = await scheduleView();
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
let SCHED_WEEK_OFFSET = 0; // 0 = semana actual; no se permite ir al pasado
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
  const slots = suggestSlots(drafts.length, schedPosts);
  const { expBanner } = xpStripHTML(sk, st, drafts.length); // (el xpStrip del nivel se eliminó: vive en el avatar del chat)
  const trialBanner = await trialExpiredBannerHTML(); // trial vencido → banner de reactivación (solo web)
  // Posty dogfood: la propuesta de hoy para @posty.hacetodo, primero que todo.
  let dogfoodPost = null;
  try { const r = await api.get('/api/dogfood/pending'); dogfoodPost = (r && r.post) || null; } catch (e) {}
  const dogfoodBlock = dogfoodPost ? dogfoodCardHTML(dogfoodPost) : '';
  const reviewBlock = drafts.length ? reviewCardHTML(drafts, slots, '📋 Revisá tu semana') : '';
  // Fast-track "Tu primer posteo": solo cuentas que NUNCA publicaron, con borradores con foto.
  const ftCandidates = drafts.filter(d => d.image_path).slice(0, 3);
  const ftBlock = (!published.length && ftCandidates.length) ? fastTrackCardHTML(ftCandidates) : '';
  // "🚀 Publicar mi primero" (mejora 2026-09-30): hero de 1 tap, visible SOLO
  // con 0 posteos publicados. Si no hay borradores, el botón genera uno primero.
  const fpBlock = (!published.length) ? firstPublishCardHTML(drafts) : '';
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
  // Lunes de la semana visible (offset en semanas desde la actual)
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + SCHED_WEEK_OFFSET * 7);
  mon.setHours(12, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(new Date(mon.getTime() + i * 86400000));
  const fmtDay = (d) => { try { return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', timeZone: tz }); } catch (e) { return ''; } };
  const fmtHour = (d) => { try { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch (e) { return ''; } };
  const todayK = dayKey(new Date());
  const weekLabel = (() => {
    try {
      const a = days[0].toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: tz });
      const b = days[6].toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: tz });
      return `${a} – ${b}`;
    } catch (e) { return ''; }
  })();
  const dayLong = (d) => { try { return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: tz }); } catch (e) { return ''; } };
  // Pulso de la semana: resumen vivo arriba del calendario.
  const weekSchedCount = scheduled.filter(x => days.some(d => dayKey(d) === dayKey(x.d))).length;
  const weekPubCount = publishedThisWeek.filter(x => days.some(d => dayKey(d) === dayKey(x.d))).length;
  let pulseHTML = '';
  if (SCHED_WEEK_OFFSET === 0) {
    const parts = [];
    if (weekSchedCount) parts.push(`📮 ${weekSchedCount} programado${weekSchedCount > 1 ? 's' : ''}`);
    if (weekPubCount) parts.push(`✅ ${weekPubCount} publicado${weekPubCount > 1 ? 's' : ''}`);
    if (drafts.length) parts.push(`📝 ${drafts.length} borrador${drafts.length > 1 ? 'es' : ''}`);
    pulseHTML = parts.length ? parts.join(' <span class="sched-pulse-sep">·</span> ') : '🕊️ Tu semana está vacía';
  } else {
    pulseHTML = weekSchedCount ? `📮 ${weekSchedCount} programado${weekSchedCount > 1 ? 's' : ''}` : '🕊️ Nada esa semana';
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
  const empty = !scheduled.length && !publishedThisWeek.length && SCHED_WEEK_OFFSET === 0;
  // Sin borradores ni programados: la tarjeta para armar la semana vive acá.
  const armBlock = (!drafts.length && empty) ? autopilotCardHTML('schedule') : '';
  return `<div id="schedView" class="sched-wrap">
    ${trialBanner}
    ${dogfoodBlock}
    ${expBanner}
    ${fpBlock}
    ${ftBlock}
    ${reviewBlock}
    ${failedBlock}
    ${armBlock}
    <div class="sched-top">
      <div><h2 style="margin:0">📅 Schedule</h2>
      <p class="sub" style="margin:4px 0 0">Los que ya aceptaste — salen solos a la hora indicada.</p></div>
      <div class="sched-nav">
        ${(sk && sk.current > 0) ? `<button type="button" class="sched-streak" id="schedStreakPill" aria-label="Ver mi racha">🔥 ${sk.current}</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="schedPrev" ${SCHED_WEEK_OFFSET <= 0 ? 'disabled' : ''} aria-label="Semana anterior">‹</button>
        <button class="btn btn-ghost btn-sm" id="schedToday">Esta semana</button>
        <button class="btn btn-ghost btn-sm" id="schedNext" aria-label="Semana siguiente">›</button>
      </div>
    </div>
    <div class="sched-weeklabel">${esc(weekLabel)}</div>
    <div class="sched-pulse">${pulseHTML}</div>
    ${!drafts.length && empty
      ? '' // el armBlock de arriba ya invita a armar la semana
      : empty
      ? `<div class="sched-emptyhero">
           <img src="ai-avatar.png" alt="Posty">
           <div><b>Tu semana está vacía… por ahora 😏</b>
           <p>Programá tus borradores de arriba 👆 y aparecen acá día por día, con su hora. Yo me ocupo de que salgan solos.</p></div>
         </div>`
      : `<div class="sched-grid">${cells}</div>
         <p class="hint" style="margin-top:10px">Tocá un posteo para verlo en grande 🔍</p>`}
  </div>`;
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
  const paint = async () => {
    try {
      const d = await api.get('/api/stats/ig');
      // 📮 "Ya salió": las estrellitas viven acá, con los números (aunque no haya alcance todavía).
      try {
        const posts = await api.get('/api/posts');
        const pub = (Array.isArray(posts) ? posts : []).filter(p => p.status === 'published');
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
        // Sin datos no hay tarjetas: solo el empty state con vista previa.
        if (grid) grid.style.display = 'none';
        if (box) box.innerHTML = `<div class="card st-empty">
          <div class="st-empty-ico">📊</div>
          <b>Tus números van a vivir acá</b>
          <p>Cuando publiquemos tu primera semana, vas a ver tu alcance, tus interacciones y tu mejor posteo, todo juntito.</p>
          <div class="st-preview"><span class="st-preview-tag">Vista previa</span>
            <div class="st-grid">
              ${['Personas alcanzadas (7 días)', 'Personas alcanzadas (30 días)', 'Interacciones (30 días)', 'Seguidores'].map(l => `<div class="st-card st-skel"><div class="st-skel-num"></div><div class="st-label">${esc(l)}</div></div>`).join('')}
            </div>
          </div>
        </div>`;
        return;
      }
      if (grid) grid.style.display = '';
      vals.forEach((v, i) => {
        const el = document.getElementById('stNum' + i);
        if (el) { el.textContent = fmt(v); el.closest('.st-card').classList.remove('st-loading'); }
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
  if (pv) pv.onclick = () => { if (SCHED_WEEK_OFFSET > 0) { SCHED_WEEK_OFFSET--; render(); } };
  if (nx) nx.onclick = () => { SCHED_WEEK_OFFSET++; render(); };
  if (td) td.onclick = () => { SCHED_WEEK_OFFSET = 0; render(); };
  // Días libres: el fantasma "+" lleva al chat a pedirle algo a Posty para ese día.
  $$('#schedView [data-sched-day]').forEach(b => b.onclick = () => { location.hash = '#/app/chat'; });
  $$('#schedView [data-lightbox]').forEach(el => el.onclick = () => {
    if (el.dataset.lightbox) openLightbox(el.dataset.lightbox, el.dataset.video === '1');
  });
  // Revisión de borradores (antes en Mi semana): carrusel, lightbox, aprobar/editar.
  bindReview();
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
  if (tab === 'chat') bindChatView(); // chat-first mobile: el chat es el home
  if (tab === 'schedule') bindSchedule();
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
        <p class="pz-exp-sub">Te lo muestro 3 horas antes y lo aprobás con un toque.</p>
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
