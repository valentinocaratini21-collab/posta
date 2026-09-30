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
      <a class="btn ${p.highlighted ? 'btn-primary' : 'btn-soft'} btn-block" href="#/registro">Empezar ahora</a>
    </div>`).join('');
}

function anchorHTML(anchor) {
  if (!anchor) return '';
  return `Un community manager cuesta <b>${esc(anchor.cm)}</b>. Posta arranca en <b>${esc(anchor.desde)}</b>.`;
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
function calcDIY() {
  const h = Math.max(0, parseFloat(($('#diy_hours') || {}).value) || 0);
  const r = Math.max(0, parseFloat(($('#diy_rate') || {}).value) || 0);
  const out = $('#diy_out');
  if (!out) return;
  const monthly = Math.round(h * r * 4);
  const pro = (PLANS_CACHE && PLANS_CACHE.plans || []).find(p => p.id === 'pro');
  const sym = (pro && pro.currency === 'UYU') ? '$U ' : '$';
  const proLabel = pro ? pro.price_label : '$59.900';
  out.innerHTML = `Hacerlo vos te cuesta <b>${sym}${monthly.toLocaleString('es-AR')}/mes</b> · Posta Pro: <b>${esc(proLabel)}/mes</b>`;
  out.style.display = 'block';
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
      <a href="#incluye">Qué incluye</a>
      <a href="#ejemplos">Ejemplos</a>
      <a href="#planes">Planes</a>
      <a href="#faq">Preguntas</a>
      <a href="#/login">Entrar</a>
      <a class="btn btn-primary btn-sm" href="#/registro">Empezar ahora</a>
    </div>
    <button class="hamburger" onclick="toggleMobileMenu()" aria-label="Abrir menú"><span></span><span></span><span></span></button>
  </div>
  <div class="mobile-menu" id="mobileMenu">
    <a href="#como-funciona">Cómo funciona</a>
    <a href="#incluye">Qué incluye</a>
    <a href="#ejemplos">Ejemplos</a>
    <a href="#planes">Planes</a>
    <a href="#faq">Preguntas</a>
    <a href="#/login">Entrar</a>
    <a class="btn btn-primary btn-block" href="#/registro">Empezar ahora</a>
  </div></div>
  <div class="hero"><div class="wrap">
    <img class="hero-posty" src="ai-avatar.png" alt="Posty, tu community manager">
    <div class="pill">🤖 Tu community manager</div>
    <h1>¡Hola! Soy <span class="hl">Posty</span></h1>
    <p class="sub"><b>Te armo tu semana de Instagram en minutos.</b> Ideas, diseños, textos y hashtags con tu marca — vos solo aprobás, yo me ocupo de todo.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="#/registro">Empezar ahora</a>
      <a class="btn btn-ghost" href="/prueba">✨ Probar gratis</a>
    </div>
    <div class="pz-beforeafter">
      <h3>La diferencia se ve en una semana</h3>
      <div class="pz-ba-row">
        <div class="pz-ba-panel">
          <div class="pz-ba-label">TU INSTAGRAM HOY</div>
          <div class="pz-ba-grid">${'<span></span>'.repeat(9)}</div>
        </div>
        <div class="pz-ba-arrow">→</div>
        <div class="pz-ba-panel">
          <div class="pz-ba-label pz-ba-label-on">CON POSTA</div>
          <img src="hero-feed.jpg" alt="Feed de Instagram gestionado por Posty">
        </div>
      </div>
    </div>
    <div class="hero-note">Sin tarjeta · 3 días gratis · Cancelá cuando quieras</div>
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
  <div class="sample-banner"><div class="wrap">
    <div class="sample-txt"><b>🎁 Tu semana de posteos GRATIS</b><span>Te la armo en 1 minuto, con tu negocio real. Sin registro.</span></div>
    <a class="btn btn-primary" href="/prueba">Armemos tu semana gratis</a>
  </div></div>
  <div class="pz-trialband"><div class="wrap">
    <div class="pz-trialband-txt"><b>🚀 Probá la app completa</b><span>Te armo tus ideas + tu semana en 1 minuto. Sin registro.</span></div>
    <a class="btn btn-primary" href="/prueba">Probar la app</a>
  </div></div>
  <div class="section" id="ejemplos" style="background:var(--bg2)"><div class="wrap">
    <h2>Hecho por Posty 🤖</h2>
    <p class="lede">Diseños y videos que armo en minutos, para cualquier rubro. Cada post de mis clientes lleva mi marca — es mi mejor publicidad.</p>
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
  </div></div>
  <div class="section" id="como-funciona"><div class="wrap">
    <h2>Así trabajo yo 👇</h2>
    <p class="lede">Vos seguí atendiendo tu negocio. Del resto me ocupo yo.</p>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Me contás tu negocio una vez</h3><p>Qué vendés, tu estilo y tus competidores. Te lleva 2 minutos y no te pido más nada.</p></div>
      <div class="step"><div class="num">2</div><h3>Yo creo todo por vos</h3><p>Pienso las ideas, diseño con tus fotos y tu marca, y escribo los captions y hashtags que venden.</p></div>
      <div class="step"><div class="num">3</div><h3>Vos aprobás, yo publico</h3><p>Tu semana queda programada a la mejor hora. Nada sale sin tu OK.</p></div>
    </div>
  </div></div>
  <div class="section" id="incluye" style="background:var(--bg2)"><div class="wrap">
    <h2>Qué incluye</h2>
    <p class="lede">Todo lo que haría tu equipo de marketing, sin contratar a nadie. Esto es lo que hago por vos cada semana 👇</p>
    <div class="grid3">
      <div class="feat"><div class="ico">💡</div><h3>Ideas estratégicas</h3><p>Cada semana pensamos el contenido por vos: novedades, promos, tips, testimonios y más.</p></div>
      <div class="feat"><div class="ico">🎨</div><h3>Diseños con tu marca</h3><p>Usamos TUS fotos, TU logo y TUS colores. Nada de plantillas genéricas que no te representan.</p></div>
      <div class="feat"><div class="ico">✍️</div><h3>Captions + hashtags</h3><p>Textos en rioplatense con tu tono, pensados para vender, con hashtags para Argentina.</p></div>
      <div class="feat"><div class="ico">🎬</div><h3>Videos para Reels</h3><p>Convertimos tus fotos en videos verticales listos para Reels, en el formato que más rinde.</p></div>
      <div class="feat"><div class="ico">📅</div><h3>Publicación automática</h3><p>Programamos tu semana completa: la revisás una vez y el sistema publica solo, a la hora exacta, en tu cuenta real.</p></div>
      <div class="feat"><div class="ico">🔍</div><h3>Diferenciación de tu competencia</h3><p>Nos contás quiénes son tus competidores y creamos contenido que te haga destacar, no copiar.</p></div>
    </div>
  </div></div>
  <div class="section" id="calculadora" style="background:var(--bg2)"><div class="wrap" style="max-width:760px;text-align:center">
    <h2>¿Cuánto te cuesta hacerlo vos?</h2>
    <p class="lede">La cuenta que nadie hace antes de contratar un community manager.</p>
    <div class="pz-calc">
      <div class="field"><label>Horas por semana que le dedicás</label><input id="diy_hours" type="number" min="0" value="5"></div>
      <div class="field"><label>Valor de tu hora ($)</label><input id="diy_rate" type="number" min="0" value="8000"></div>
      <button class="btn btn-primary" onclick="calcDIY()">Calcular</button>
      <div id="diy_out" class="pz-calc-out" style="display:none"></div>
      <div style="text-align:center;margin-top:14px"><a class="btn btn-ghost" href="/prueba">Probar gratis</a></div>
    </div>
  </div></div>
  <div class="section" id="diferencia" style="background:var(--bg2)"><div class="wrap" style="max-width:860px">
    <h2>El único que hace todo por vos</h2>
    <p class="lede">Las herramientas te dan más trabajo. Yo te lo saco de encima.</p>
    <div class="vs-list">
      <div class="vs-item">
        <div class="vs-top">🧰 <b>Apps para programar posteos</b></div>
        <p>Vos creás los diseños, vos escribís los textos, vos programás cada posteo. Y se pagan en dólares con tarjeta.</p>
      </div>
      <div class="vs-item">
        <div class="vs-top">🧑‍💼 <b>Community manager</b></div>
        <p>$300.000+ por mes. Hay que buscarlo, dirigirlo, revisarlo y esperarlo.</p>
      </div>
      <div class="vs-item">
        <div class="vs-top">😮‍💨 <b>Hacerlo vos</b></div>
        <p>Horas por semana que no tenés, para un Instagram a medias.</p>
      </div>
      <div class="vs-item win">
        <div class="vs-top">🚀 <b>Posty</b></div>
        <p>Me contás de tu negocio <b>una sola vez</b>. Creo las ideas, los diseños y los textos, y programo tu semana en tu cuenta. Nada sale sin tu OK. En pesos, con MercadoPago. Y me probás <b>3 días gratis</b>, sin tarjeta.</p>
      </div>
    </div>
    <p class="unico-line">Soy el único community manager argentino 100% done-for-you para Instagram.</p>
    <div style="text-align:center;margin-top:18px"><a class="btn btn-primary" href="/prueba">Probar gratis</a></div>
  </div></div>
  <div class="section" id="vs-agencia"><div class="wrap" style="max-width:860px">
    <h2>Posty vs. agencia de marketing</h2>
    <p class="lede">Lo mismo que te promete una agencia, sin todo lo que odiás de las agencias.</p>
    <div class="cmp-table" role="table" aria-label="Comparación Posty vs agencia">
      <div class="cmp-row cmp-head" role="row"><div></div><div>Agencia tradicional</div><div class="win">Posty</div></div>
      <div class="cmp-row" role="row"><div class="crit">Precio por mes</div><div>Desde $300.000</div><div class="win">Desde $39.900</div></div>
      <div class="cmp-row" role="row"><div class="crit">Tu semana lista en</div><div>2 semanas</div><div class="win">Minutos</div></div>
      <div class="cmp-row" role="row"><div class="crit">Reuniones</div><div>Varias por mes</div><div class="win">Cero</div></div>
      <div class="cmp-row" role="row"><div class="crit">Probar antes de pagar</div><div>No existe</div><div class="win">3 días gratis, sin tarjeta</div></div>
      <div class="cmp-row" role="row"><div class="crit">Contrato</div><div>3 a 6 meses atado</div><div class="win">Mensual, cancelás cuando querés</div></div>
    </div>
    <p class="unico-line">Las agencias te venden reuniones. Yo te entrego la semana hecha.</p>
    <div style="text-align:center;margin-top:18px"><a class="btn btn-primary" href="/prueba">Probar gratis</a></div>
  </div></div>
  <div class="section" id="planes"><div class="wrap">
    <h2>Elegí tu plan</h2>
    <p class="lede">Elegí tu plan y arrancamos hoy mismo. Sin letra chica, cancelás cuando quieras.</p>
    <div class="country-toggle">
      <button class="${country === 'AR' ? 'on' : ''}" data-country="AR" onclick="switchPlansCountry('AR')">🇦🇷 Argentina</button>
      <button class="${country === 'UY' ? 'on' : ''}" data-country="UY" onclick="switchPlansCountry('UY')">🇺🇾 Uruguay</button>
    </div>
    <div class="anchor-line" id="anchorLine">${anchorHTML(cfg && cfg.anchor)}</div>
    <div class="scarcity" id="scarcityLine">🔥 Solo <b>15 lugares</b> por mes — cada negocio lleva trabajo personalizado.</div>
    <div class="plans-row" id="plansRow">${planCards || '<p>Cargando planes...</p>'}</div>
    <div class="plan-dots" id="planDots"><span class="on"></span><span></span><span></span></div>
  </div></div>
  <div class="section" id="faq" style="background:var(--bg2)"><div class="wrap" style="max-width:760px">
    <h2>Preguntas frecuentes</h2>
    <p class="lede">Lo que todos preguntan antes de empezar.</p>
    <div class="faq">
      <details><summary>¿Necesito hacer algo?</summary><p>No. Me contás de tu negocio una sola vez al registrarte y listo. Yo creo las ideas, los diseños, los textos y publico. Si querés, podés revisar todo antes de que salga.</p></details>
      <details><summary>¿Posty publica en mi cuenta real de Instagram?</summary><p>Sí. Conectás tu cuenta Business una vez y publico directamente en tu perfil con la API oficial de Meta. También podés ver tu semana armada en la prueba gratis antes de registrarte.</p></details>
      <details><summary>¿Usás mis fotos y mi marca?</summary><p>Sí, eso es lo más importante: subís tus fotos y tu logo una vez, definimos tus colores, y todos los diseños salen con tu identidad. Nada genérico.</p></details>
      <details><summary>¿Puedo cancelar cuando quiera?</summary><p>Sí, sin preguntas ni trabas. Cancelás desde tu cuenta y listo.</p></details>
      <details><summary>¿Qué pasa si no me gusta un posteo?</summary><p>Podés pedir cambios o eliminarlo antes de que se publique. Además aprendo de lo que te gusta para hacerlo cada vez mejor.</p></details>
      <details><summary>¿Tengo que darte mi contraseña de Instagram?</summary><p>No. Conectás tu cuenta con el login oficial de Meta, igual que cuando entrás con Google en otras apps. Nunca veo ni guardo tu contraseña.</p></details>
      <details><summary>¿Publicás sin que yo lo apruebe?</summary><p>No. Todo queda como borrador en tu cuenta y solo se publica lo que vos revisás y programás. Nada sale sin tu OK.</p></details>
      <details><summary>¿Y si no me funciona?</summary><p>Por eso la prueba es gratis y sin tarjeta: probame 3 días, mirá tu semana armada y decidí. Si no te sirve, no pagás nada.</p></details>
      <details><summary>¿Cuándo veo mi primera semana?</summary><p>Antes de pagar: en la prueba gratis ya ves tu semana armada, y al crear tu cuenta entra como borradores, listos para revisar.</p></details>
      <details><summary>¿Tienen programa de referidos?</summary><p>Sí 🎁 En Ajustes → Referidos tenés tu link personal: si 2 referidos se suscriben con tu link, pagás la mitad todos los meses.</p></details>
      <details><summary>¿Qué pasa si mi referido cancela?</summary><p>El 50% off se mantiene mientras tus 2 referidos sigan suscriptos. Si uno cancela, volvés al precio normal hasta conseguir otro referido activo.</p></details>
    </div>
    <div style="text-align:center;margin-top:44px">
      <a class="btn btn-primary" href="#/registro" style="font-size:16px;padding:18px 44px">Empezar ahora</a>
      <div style="margin-top:18px"><a class="btn btn-ghost" href="/prueba">✨ Probar gratis</a></div>
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
    <p class="sub">${isLogin ? 'Entrá para seguir automatizando.' : '3 días gratis, sin tarjeta.'}</p>
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
      <h2>Guardá Posta en tu celu</h2>
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
async function pushRenderZone() {
  const z = document.getElementById('pushZone');
  if (!z) return;
  if (!pushSupported()) { z.innerHTML = '<p class="hint">Tu navegador no soporta notificaciones push. Todo sigue funcionando igual 👍</p>'; return; }
  let sub = null;
  try { const reg = await navigator.serviceWorker.ready; sub = await reg.pushManager.getSubscription(); } catch (e) { sub = null; }
  const perm = pushPerm();
  if (perm === 'granted' && sub) {
    z.innerHTML = '<div class="okmsg">🔔 Notificaciones activadas en este dispositivo.</div>' +
      '<button class="btn btn-ghost btn-sm" id="pushOff">Desactivar en este dispositivo</button>';
    document.getElementById('pushOff').onclick = async () => {
      try {
        const j = sub.toJSON();
        await api.post('/api/push/unsubscribe', { endpoint: j.endpoint });
        await sub.unsubscribe();
      } catch (e) { /* igual seguir */ }
      try { localStorage.removeItem('push-sub'); } catch (e) {}
      pushRenderZone();
    };
  } else if (perm === 'denied') {
    z.innerHTML = '<p class="hint">Bloqueaste las notificaciones en el navegador. Para activarlas: Ajustes del celu → Posta → Notificaciones → Permitir.</p>';
  } else {
    z.innerHTML = '<button class="btn btn-primary" id="pushOn">🔔 Activar notificaciones</button> <span id="pushMsg"></span>';
    document.getElementById('pushOn').onclick = async () => {
      const m = document.getElementById('pushMsg');
      const res = await pushEnableFlow();
      if (res.ok) { pushRenderZone(); return; }
      if (m) {
        const msg = res.reason === 'declined' ? 'Dale, cuando quieras las activás desde acá 👍'
          : res.reason === 'denied' ? 'El navegador no dio permiso. Fijate en Ajustes → Notificaciones.'
          : res.reason === 'no_vapid' ? 'Todavía no están configuradas. Probá de nuevo en un rato.'
          : 'No se pudo activar 😅 Probá de nuevo.';
        m.innerHTML = '<span class="hint">' + msg + '</span>';
      }
    };
  }
}

/* ---------- CHECKLIST COMPACTO: reemplaza los 3 banners apilados ---------- */
function igConnectHere() {
  const cur = '/#' + ((location.hash.split('?')[0] || '#/app/semana').replace(/^#/, ''));
  igConnect(cur);
}
function setupChecklistHtml() {
  const rows = [];
  if (!(PROFILE && (PROFILE.business_name || '').trim())) {
    rows.push(`<button class="setup-row" id="setupBizRow"><span class="setup-ico">🏪</span><span class="setup-txt"><b>Poné el nombre de tu negocio</b><small>Es obligatorio: así todo Posta se siente tuyo.</small></span><span class="setup-go">Completar →</span></button>`);
  }
  if (!(PROFILE && PROFILE.ig_connected)) {
    rows.push(`<button class="setup-row" id="setupIgRow"><span class="setup-ico">📸</span><span class="setup-txt"><b>Conectá tu Instagram</b><small>Dejá tu semana lista para publicar.</small></span><span class="setup-go">Conectar →</span></button>`);
  }
  if (pwaIsMobile() && !pwaIsInstalled() && !pwaDismissed()) {
    rows.push(`<button class="setup-row" id="pwaInstallBtn"><span class="setup-ico">📲</span><span class="setup-txt"><b>Instalá la app</b><small>Acceso directo en tu teléfono.</small></span><span class="setup-go">Instalar →</span></button>`);
  }
  if (!rows.length) return '';
  const n = rows.length;
  return `<div class="setup-card"><div class="setup-title">🚀 Te ${n === 1 ? 'falta 1 paso' : `faltan ${n} pasos`}</div>${rows.join('')}</div>`;
}

function appShell(tab, content) {
  return `
  <div class="mtop">
    <button class="mtop-burger" id="mtopBurger" aria-label="Abrir menú">≡</button>
    <a class="mtop-pill" id="weekPill" href="#/app/semana">${weekPillLabel()}</a>
  </div>
  <div class="drawer-ov" id="drawerOv" hidden></div>
  <aside class="drawer" id="drawer" aria-label="Menú">
    <div class="drawer-ident" id="drawerIdent" aria-label="Tu negocio"></div>
    <button class="drawer-link ${tab === 'chat' ? 'on' : ''}" data-tab="chat"><span class="di">💬</span>Chat</button>
    <button class="drawer-link ${tab === 'ajustes' ? 'on' : ''}" data-tab="ajustes"><span class="di">⚙️</span>Ajustes</button>
    <div class="drawer-grow"></div>
    <button class="drawer-link drawer-logout" id="drawerLogout"><span class="di">🚪</span>Salir</button>
  </aside>
  ${setupChecklistHtml()}
  <div class="app-shell">
    <div class="main ${tab === 'chat' ? 'main-chat' : ''}">${content}</div>
  </div>`;
}

/* Drawer mobile: hamburguesa ≡ con todo lo demás (reemplaza la bottom nav) */
function openDrawer(){ const d = $('#drawer'), o = $('#drawerOv'); if (d) d.classList.add('open'); if (o) o.hidden = false; }
function closeDrawer(){ const d = $('#drawer'), o = $('#drawerOv'); if (d) d.classList.remove('open'); if (o) o.hidden = true; }

/* ---------- CREAR ---------- */
let CREATOR_OPEN = false; // el creador manual vive dentro de Mi semana, plegado hasta que se abre
let CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', options: null, detected: null, recommendedIndex: 0, recommendedReason: '', feedback: '', productPhoto: '', selected: [], cardPhoto: {}, carouselMode: false, carouselPhotos: [], isCarousel: false };


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
  const acc = pal.c[2] || pal.c[0]; // acento de LA MARCA del cliente, nunca el de Posta
  const ink = pal.dark ? '#0A1E33' : '#FFFFFF';
  const sub = pal.dark ? 'rgba(10,30,51,.72)' : 'rgba(255,255,255,.82)';

  if (o.photoImg) {
    // La foto va de fondo y el diseño se mantiene: velo con los colores de la marca
    drawCover(ctx, o.photoImg, 0, 0, W, H);
    if (o.tpl === 'claro') ctx.fillStyle = 'rgba(255,255,255,.88)';
    else if (o.tpl === 'noche') ctx.fillStyle = 'rgba(10,30,51,.86)';
    else { const pg = ctx.createLinearGradient(0, 0, W, H); pg.addColorStop(0, hexA(pal.c[0], .62)); pg.addColorStop(1, hexA(pal.c[1], .62)); ctx.fillStyle = pg; }
    ctx.fillRect(0, 0, W, H);
  }

  if (o.tpl === 'claro') {
    if (!o.photoImg) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = acc; ctx.fillRect(90, 120, 130, 18);
    ctx.fillStyle = '#0A1E33'; ctx.textAlign = 'center';
    ctx.font = '800 96px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.title || 'Tu título', W - 220).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, 420 + i * 116));
    ctx.fillStyle = 'rgba(10,30,51,.65)'; ctx.font = '400 52px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.subtitle || '', W - 260).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 900 + i * 70));
    ctx.fillStyle = '#0A1E33'; ctx.font = '700 44px -apple-system, Inter, sans-serif';
    ctx.fillText('@' + (o.handle || 'tunegocio'), W / 2, 1230);
  } else if (o.tpl === 'noche') {
    if (!o.photoImg) { ctx.fillStyle = '#0A1E33'; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = acc; ctx.lineWidth = 10; ctx.strokeRect(50, 50, W - 100, H - 100);
    ctx.fillStyle = acc; ctx.font = '800 40px -apple-system, Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(('' + (o.handle || 'tunegocio')).toUpperCase(), W / 2, 170);
    ctx.fillStyle = '#fff'; ctx.font = '800 104px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.title || 'Tu título', W - 240).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, 560 + i * 124));
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '400 54px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.subtitle || '', W - 280).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 1020 + i * 72));
  } else if (o.tpl === 'promo') {
    if (!o.photoImg) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, pal.c[0]); g.addColorStop(1, pal.c[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = ink; ctx.globalAlpha = .16;
    ctx.beginPath(); ctx.arc(W / 2, 560, 330, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.textAlign = 'center';
    ctx.font = '800 130px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.title || 'OFERTA', W - 200).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 520 + i * 150));
    ctx.font = '700 58px -apple-system, Inter, sans-serif'; ctx.fillStyle = sub;
    wrapText(ctx, o.subtitle || '', W - 240).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 980 + i * 76));
    // pill handle
    ctx.font = '800 46px -apple-system, Inter, sans-serif';
    const hw = ctx.measureText('@' + (o.handle || 'tunegocio')).width + 90;
    ctx.fillStyle = pal.dark ? '#0A1E33' : '#fff';
    ctx.beginPath(); ctx.roundRect(W / 2 - hw / 2, 1150, hw, 96, 48); ctx.fill();
    ctx.fillStyle = pal.dark ? '#fff' : '#0A1E33';
    ctx.fillText('@' + (o.handle || 'tunegocio'), W / 2, 1214);
  } else { // gradiente
    if (!o.photoImg) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, pal.c[0]); g.addColorStop(1, pal.c[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = ink; ctx.textAlign = 'left';
    ctx.font = '800 44px -apple-system, Inter, sans-serif';
    ctx.fillText('@' + (o.handle || 'tunegocio'), 90, 150);
    ctx.font = '800 118px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.title || 'Tu título', W - 180).slice(0, 4).forEach((l, i) => ctx.fillText(l, 90, 420 + i * 138));
    ctx.fillStyle = sub; ctx.font = '400 56px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.subtitle || '', W - 180).slice(0, 4).forEach((l, i) => ctx.fillText(l, 90, 1010 + i * 74));
    ctx.fillStyle = ink; ctx.fillRect(90, H - 130, 120, 14);
  }

  // Logo del cliente en la esquina inferior derecha (brand kit)
  if (o.logoImg) {
    const lw = 170, lh = Math.min(170, 170 * o.logoImg.height / Math.max(1, o.logoImg.width));
    const pad = 44;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W - pad - lw - 22, H - pad - lh - 22, lw + 44, lh + 44, 30);
    else ctx.rect(W - pad - lw - 22, H - pad - lh - 22, lw + 44, lh + 44);
    ctx.fill();
    ctx.drawImage(o.logoImg, W - pad - lw, H - pad - lh, lw, lh);
  }
}

function creatorChips() {
  const p = (typeof PROFILE !== 'undefined' && PROFILE) || {};
  const biz = p.business_name || 'tu negocio';
  const M = {
    ropa: ['Nuevo ingreso de la semana', 'Prenda destacada de hoy', 'Sale: hasta 40% off'],
    gastronomia: ['Promo 2x1 en pizzas', 'Plato nuevo de la carta', 'Menú del día'],
    cafeteria: ['Latte nuevo de la casa', 'Promo merienda', 'Café de especialidad'],
    belleza: ['Tratamiento nuevo', 'Promo del mes', 'Antes y después'],
    barberia: ['Corte de la semana', 'Promo corte + barba', 'Reservá tu turno'],
    fitness: ['Clase nueva esta semana', 'Promo primer mes', 'Rutina para arrancar'],
    salud: ['Nuevo servicio', 'Turnos disponibles', 'Tip de salud'],
    mascotas: ['Novedad para tu mascota', 'Promo en alimento', 'Tip para cuidarla'],
    servicios: ['Servicio nuevo', 'Promo este mes', 'Pedí tu presupuesto'],
    educacion: ['Curso nuevo', 'Inscripciones abiertas', 'Clase gratuita'],
    tecnologia: ['Producto nuevo', 'Oferta de la semana', 'Tip tecnológico'],
    hogar: ['Novedad para tu casa', 'Promo en deco', 'Antes y después'],
    inmobiliaria: ['Nueva propiedad', 'Oportunidad de la semana', 'Conocé este depto'],
    eventos: ['Próximo evento', 'Entradas disponibles', 'Así fue el último'],
    viajes: ['Nuevo destino', 'Promo en paquetes', 'Escapada del finde'],
    arte: ['Obra nueva', 'Mi proceso creativo', 'Encargá tu pieza'],
    otro: [`Lo nuevo de ${biz}`, 'Promo de la semana', 'Detrás de escena'],
  };
  return M[p.category] || M.otro;
}

function creatorView(embed) {
  const c = CREATOR;
  const head1 = embed ? '' : `<div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear posteo</h1><p class="sub">Paso 1 de 3 — Nosotros pensamos la estrategia. Vos solo aprobás.</p></div></div>`;
  const head2 = embed ? '' : `<div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear posteo</h1><p class="sub">Paso 2 de 3 — El diseño ya está listo. Retocalo si querés.</p></div></div>`;
  const head3 = embed ? '' : `<div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear posteo</h1><p class="sub">Paso 3 de 3 — Programalo y olvidate.</p></div></div>`;
  const headO = embed ? '' : `<div class="page-head"><div class="ph-ico">🎨</div><div class="ph-txt"><h1>Tus 6 diseños</h1><p class="sub">Te recomendamos la marcada con ⭐. Si preferís otra, elegila y programala.</p></div></div>`;
  const stepsBar = `<div class="steps-bar">${[1, 2, 3].map(i => `<div class="s ${i <= c.step ? 'on' : ''}"></div>`).join('')}</div>`;
  if (c.step === 1) {
    return `
    ${head1}
    ${stepsBar}
    <div class="card">
      <div class="field"><label>¿Alguna idea en mente? <span style="font-weight:400;color:var(--mut)">(opcional)</span></label>
        <textarea id="c_topic" placeholder="${esc('Ej: ' + creatorChips().map(t => '"' + t + '"').join(', '))}">${esc(c.topic)}</textarea>
        <div class="hint">Si no escribís nada, igual te armamos el posteo con nuestra estrategia. Una frase alcanza si querés guiarnos.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${creatorChips().map(t => `<button class="btn btn-ghost btn-sm" data-chip="${esc(t)}" type="button">${esc(t)}</button>`).join('')}
        </div></div>
      <div class="field"><label>📷 Foto de tu producto <span style="font-weight:400;color:var(--mut)">(opcional)</span></label>
        <div id="c_prodPhotoBox"></div>
        <input type="file" id="c_prodPhotoFile" accept="image/*" style="display:none">
        <div class="hint">Si la subís, las 6 opciones usan TU foto. Ideal para vender tu producto exacto. Si no, usamos fotos del banco.</div></div>
      <button class="btn btn-soft" id="btnGen">✨ Armar mi posteo</button>
      <div id="genErr"></div>
      <div id="genOut" style="margin-top:24px;${c.caption ? '' : 'display:none'}">
        <div class="field"><label>Caption</label><textarea id="c_caption" style="min-height:150px">${esc(c.caption)}</textarea></div>
        <div class="field"><label>Hashtags</label><textarea id="c_tags" style="min-height:70px">${esc(c.hashtags)}</textarea></div>
        <button class="btn btn-primary" id="btnToDesign">Siguiente: diseñar imagen →</button>
      </div>
    </div>`;
  }
  if (c.step === 2) {
    return `
    ${head2}
    ${stepsBar}
    <div class="designer">
      <div>
        <div class="card" style="padding:22px">
          <h3>Plantilla</h3>
          <div class="tpl-grid">
            ${['gradiente', 'claro', 'noche', 'promo'].map(t => `<div class="tpl ${c.tpl === t ? 'on' : ''}" data-tpl="${t}">${t[0].toUpperCase() + t.slice(1)}</div>`).join('')}
          </div>
          <h3 style="margin-top:18px">Paleta</h3>
          <div class="pal-row">${getPalettes().map((p, i) => `<div class="pal ${c.pal === i ? 'on' : ''}" data-pal="${i}" title="${p.name}${p.brand ? ' (tus colores)' : ''}" style="background:linear-gradient(135deg,${p.c.join(',')});${p.brand ? 'box-shadow:0 0 0 2px var(--yl)' : ''}"></div>`).join('')}</div>
          <div class="field" style="margin-top:18px"><label>Título</label><input id="d_title" value="${esc(c.title)}" placeholder="HASTA 40% OFF"></div>
          <div class="field"><label>Subtítulo</label><input id="d_sub" value="${esc(c.subtitle)}" placeholder="Solo esta semana"></div>
          <div class="field"><label>Usuario de Instagram (sin @)</label><input id="d_handle" value="${esc(c.handle || (PROFILE?.ig_username || ''))}" placeholder="tunegocio"></div>
          <div class="field"><label>${c.carouselMode ? 'Fotos del carrusel' : 'Foto del producto (opcional)'}</label>
            ${c.carouselMode ? `
            <div id="photoLib" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
              ${assetPhotos().map(a => {
                const ord = c.carouselPhotos.indexOf(a.file_path);
                return `<div style="position:relative;cursor:pointer" data-carlib="${esc(a.file_path)}">`
                  + `<img src="${esc(a.file_path)}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:2px solid ${ord >= 0 ? 'var(--cel)' : 'var(--line)'}">`
                  + (ord >= 0 ? `<span class="car-ord">${ord + 1}</span>` : '') + `</div>`;
              }).join('')}
            </div>
            <div class="hint">Elegí de 2 a 10 fotos para el carrusel — la primera es la portada. Tocá de nuevo para sacar.</div>
            <div style="margin-top:8px"><button class="btn btn-ghost btn-sm" id="btnCarouselOff" type="button">← Volver a foto única</button></div>
            <div id="carErr"></div>` : (c.photo ? `
            <div style="display:flex;gap:10px;align-items:center">
              <img src="${c.photo}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">
              <div style="display:flex;gap:8px">
                <button class="btn btn-ghost btn-sm" id="btnPhotoCh" type="button">Cambiar</button>
                <button class="btn btn-ghost btn-sm" id="btnPhotoRm" type="button">Quitar</button>
              </div>
            </div>` : `
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" id="btnPhotoAdd" type="button">📷 Subir foto</button>
              ${assetPhotos().length ? `<button class="btn btn-ghost btn-sm" id="btnPhotoLib" type="button">🖼️ Mis fotos</button>` : ''}
              ${assetPhotos().length >= 2 ? `<button class="btn btn-ghost btn-sm" id="btnCarousel" type="button">🎞️ Carrusel</button>` : ''}
            </div>
            <div id="photoLib" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
              ${assetPhotos().map(a => `<img src="${a.file_path}" data-lib="${a.file_path}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:2px solid var(--line);cursor:pointer">`).join('')}
            </div>
            <div class="hint">La foto va de fondo y el diseño se mantiene igual.${assetLogo() ? ' Tu logo se agrega solo en la esquina.' : ''}</div>`)}
            <input type="file" id="d_photo" accept="image/*" style="display:none">
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" id="btnBack1">← Atrás</button>
          <button class="btn btn-primary" id="btnSaveDesign" style="flex:1">${c.carouselMode ? 'Continuar →' : 'Guardar diseño →'}</button>
        </div>
      </div>
      <div><div class="preview-box"><canvas id="postCanvas"></canvas></div>
      <p style="color:var(--dim);font-size:11.5px;margin-top:10px;text-align:center">Vista previa real — así se va a ver en el feed.</p></div>
    </div>`;
  }
  if (c.step === 'options') {
    const det = c.detected || {};
    const colors = det.colors || [];
    const hexes = det.colorHex || [];
    const opts = c.options || [];
    const libPhotos = (typeof assetPhotos === 'function' ? assetPhotos() : []);
    const colorNames = colors.length > 1
      ? colors.slice(0, -1).join(', ') + ' y ' + colors[colors.length - 1]
      : colors.join(', ');
    return `
    ${headO}
    <div class="steps-bar">${[1, 2, 3].map(i => `<div class="s ${i <= 1 ? 'on' : ''}"></div>`).join('')}</div>
    ${colors.length ? `<div class="colors-note">🎨 Tus colores: ${esc(colorNames)}${hexes.map(h => `<span class="swatch" style="background:${esc(h)}" title="${esc(h)}"></span>`).join('')}</div>` : ''}
    ${det.productPhoto ? `<div class="prodphoto-note">📷 Usando la foto de tu producto en las 6 opciones</div>` : ''}
    ${det.photoQuery && !det.productPhoto ? `<div class="photoq-note">📸 Fotos de: <b>${esc(det.photoQuery)}</b>${det.userPhotos ? ` · usando tus fotos primero ✨` : ''}</div>` : ''}
    ${libPhotos.length ? `
    <div class="myphotos-card" style="padding:14px 18px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:700">📷 Tus fotos</span>
        <div class="mp-row" id="mpRow" style="margin:0">${libPhotos.map(a => `<span style="position:relative;display:inline-block"><img src="${esc(a.file_path)}" class="mp-thumb" alt="Tu foto"><button data-mpdel="${a.id}" title="Borrar foto" aria-label="Borrar foto" style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:1.5px solid #fff;background:#0A1E33;color:#fff;font-size:12.5px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3)">×</button></span>`).join('')}</div>
        <button class="btn btn-ghost btn-sm" id="btnUploadPhotos">📤 Subir más</button>
        <input type="file" id="mpFiles" accept="image/*" multiple style="display:none">
      </div>
      <div id="mpMsg"></div>
    </div>` : `
    <div class="myphotos-card">
      <div class="mp-title">📷 Tus fotos</div>
      <p class="mp-text">Para vender tu producto exacto (como tu buzo), subí sus fotos una vez y el creador las usa siempre.</p>
      <div class="mp-row" id="mpRow"><span class="mut">Todavía no subiste fotos.</span></div>
      <button class="btn btn-soft" id="btnUploadPhotos">📤 Subir fotos de tus productos</button>
      <input type="file" id="mpFiles" accept="image/*" multiple style="display:none">
      <div id="mpMsg"></div>
    </div>`}
    <div id="optErr"></div>
    <div class="opt-grid">
      ${opts.map((o, i) => `
      <div class="opt-card" data-card="${i}">
        ${i === c.recommendedIndex ? `<div class="opt-badge">⭐ Recomendada</div>` : ''}
        <label class="opt-sel"><input type="checkbox" class="opt-selbox" data-sel="${i}"><span>Elegir</span></label>
        <img class="opt-img" data-optimg="${i}" src="${esc(o.image)}" alt="${esc(o.title || ('Diseño ' + (i + 1)))}" loading="lazy" title="Tocá para ver en grande">
        ${i === c.recommendedIndex && c.recommendedReason ? `<p class="opt-reason">${esc(c.recommendedReason)}</p>` : ''}
        ${o.title ? `<p class="opt-title">${esc(o.title)}</p>` : ''}
        ${o.caption ? `<p class="opt-caption">${esc(o.caption)}</p>` : ''}
        <div class="opt-actions">
          <button class="btn btn-primary btn-sm opt-use" data-use="${i}">Usar este diseño →</button>
          <button class="btn btn-ghost btn-sm opt-myphoto" data-mp="${i}">📷 Mi foto</button>
        </div>
        <button class="opt-customlink" data-custom="${i}">✏️ Personalizar a mano</button>
      </div>`).join('')}
    </div>
    <div id="multiBar" style="display:none">
      <span id="multiCount">✅ 0 elegidos</span>
      <button class="btn btn-primary" id="btnMultiSched">Programar (0)</button>
    </div>
    <div style="display:flex;justify-content:center;margin:4px 0 26px">
      <button class="btn btn-soft" id="btnRegen">🔄 Regenerar opciones</button>
    </div>
    <div class="feedback-card">
      <p class="feedback-title">¿Querés cambiar algo? Decime y lo arreglamos. O lo mejoramos.</p>
      <div class="feedback-row">
        <input id="fb_input" placeholder='Ej: "más rojo", "otra foto", "caption más corto"'>
        <button class="btn btn-primary btn-sm" id="btnFeedback">Arreglar</button>
      </div>
      <div id="feedbackMsg"></div>
    </div>
    <div id="schedModal" class="modal-ov" style="display:none">
      <div class="modal-card">
        <h3>📅 Programar diseños</h3>
        <p class="mut" style="margin-bottom:12px">Elegí día y hora para cada uno.</p>
        <div id="schedRows"></div>
        <div id="schedMsg"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="btnSchedCancel">Cancelar</button>
          <button class="btn btn-primary" id="btnSchedConfirm">✅ Confirmar</button>
        </div>
      </div>
    </div>
    <div id="optLight" class="modal-ov" style="display:none">
      <div class="modal-card light-card">
        <img id="optLightImg" alt="Diseño en grande">
        <p id="optLightCap"></p>
        <button class="btn btn-ghost btn-block" id="btnLightClose">Cerrar</button>
      </div>
    </div>
    <div id="photoPickModal" class="modal-ov" style="display:none">
      <div class="modal-card">
        <h3>📷 Foto para este diseño</h3>
        <button class="btn btn-soft btn-block" id="btnPickUpload" style="margin:12px 0">📤 Subir nueva foto</button>
        <input type="file" id="pickFile" accept="image/*" style="display:none">
        <p class="mut" style="margin:6px 0 8px"><b>De tu librería</b></p>
        <div class="mp-row" id="pickLib"></div>
        <p class="mut" style="margin:6px 0 8px"><b>Del banco de fotos</b></p>
        <div class="mp-row" id="pickStock"></div>
        <div id="pickMsg"></div>
        <button class="btn btn-ghost btn-block" id="btnPickClose" style="margin-top:14px">Cancelar</button>
      </div>
    </div>
    <button class="btn btn-ghost btn-sm" id="btnBackOptions" style="margin-top:16px">← Volver</button>`;
  }
  // step 3
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDt = now.toISOString().slice(0, 16);
  return `
  ${head3}
  ${stepsBar}
  <div class="card">
    <div style="display:flex;gap:22px;flex-wrap:wrap">
      <img src="${esc(c.imagePath)}" style="width:180px;border-radius:14px;border:1px solid var(--line)">
      <div style="flex:1;min-width:240px">
        <div class="field"><label>Caption</label><textarea id="p_caption" style="min-height:120px">${esc(c.caption)}</textarea></div>
        <div class="field"><label>Hashtags</label><textarea id="p_tags" style="min-height:60px">${esc(c.hashtags)}</textarea></div>
      </div>
    </div>
    <div class="row2" style="margin-top:24px">
      <div class="field"><label>Fecha y hora de publicación</label><input type="datetime-local" id="p_when" min="${minDt}" value="${minDt}"></div>
      <div class="field"><label>&nbsp;</label><div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btnSchedule">📅 Programar</button>
        <button class="btn btn-soft" id="btnNow">⚡ Publicar ahora</button>
        <button class="btn btn-ghost" id="btnDraft">💾 Borrador</button>
      </div></div>
    </div>
    <div id="pubMsg"></div>
    <button class="btn btn-ghost btn-sm" id="btnBack2" style="margin-top:8px">← Atrás</button>
  </div>`;
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
      ${step(s3, 3, 'Creá tu primer posteo', 'O armamos tu semana en 1 tap.', '<a class="btn btn-primary btn-sm" href="#/app/semana">⚡ Armar mi semana</a>')}
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
    <p style="color:var(--mut);font-size:13px;line-height:1.6;margin-bottom:6px">Textos, diseños y un reel con tus fotos. Vos revisás y aprobás — nada sale sin tu OK.</p>
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
// Pill de fecha del borrador: aclara que es la fecha programada de salida
function fmtWhenPill(v) {
  const wt = fmtWhenTxt(v);
  return wt === 'Elegir día y hora' ? wt : `Programado para ${wt}`;
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
    <p style="color:var(--mut);font-size:12.5px;margin:0 0 4px">Revisalos y aceptalos — nada sale sin tu OK.</p>
    ${n ? `<button class="btn btn-primary btn-block" id="btnScheduleAll" style="margin:6px 0 10px">📅 Programar mi semana →</button>` : ''}
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
          ${d.media_type === 'video' ? `<button data-revvideo="${d.id}" title="Cambiar el video de este posteo">🎬 Otro video</button>` : `<button data-revphoto="${d.id}" title="Cambiar la foto de este posteo">🖼️ Otra foto</button>`}
          <button class="danger" data-revdel="${d.id}">🗑️</button>
        </div>
        ${d.strategy_why ? `<div style="font-size:11px;color:var(--dim);line-height:1.5;margin-top:8px;overflow-wrap:anywhere">💡 <b>Por qué:</b> ${esc(d.strategy_why)}</div>` : ''}
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
    <div class="rev-voice">
      <button class="rev-voice-btn" id="revVoiceBtn">🎙 ¿Cambiar algo? Pedilo por voz</button>
      <div class="rev-voice-msg" id="revVoiceMsg"></div>
    </div>
    <div id="revMsg"></div>
  </div>`;
}

// Nota de voz para pedir cambios en los borradores: vive abajo de los posteos,
// cero fricción. Graba, se transcribe con Whisper y la IA lo aplica directo.
let DVOICE_REC = null, DVOICE_CHUNKS = [], DVOICE_MIME = '', DVOICE_TIMER = null, DVOICE_START = 0;
function draftVoiceMsg(html) {
  const m = document.getElementById('revVoiceMsg');
  if (m) m.innerHTML = html;
}
function draftVoiceUI(rec) {
  const b = document.getElementById('revVoiceBtn');
  if (!b) return;
  b.classList.toggle('btn-rec', !!rec);
  if (!rec) b.innerHTML = '🎙 ¿Cambiar algo? Pedilo por voz';
}
function draftVoiceTick() {
  if (!DVOICE_REC) return;
  const b = document.getElementById('revVoiceBtn');
  const s = Math.floor((Date.now() - DVOICE_START) / 1000);
  const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (b) b.innerHTML = `🔴 ${t} — tocá para enviar`;
  draftVoiceMsg('<span style="color:var(--mut);font-size:11.5px">🔴 Grabando… contame qué le cambio a tus posteos</span>');
}
async function draftVoiceToggle() {
  if (DVOICE_REC) { draftVoiceStop(); return; }
  if (!REVIEW_DRAFTS.length) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    draftVoiceMsg('<span style="color:var(--mut);font-size:11.5px">🎙 Tu navegador no soporta notas de voz.</span>');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    DVOICE_CHUNKS = [];
    DVOICE_MIME = rec.mimeType || '';
    rec.ondataavailable = e => { if (e.data && e.data.size) DVOICE_CHUNKS.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); draftVoiceSend(); };
    DVOICE_REC = rec;
    rec.start();
    DVOICE_START = Date.now();
    draftVoiceUI(true);
    clearInterval(DVOICE_TIMER);
    DVOICE_TIMER = setInterval(draftVoiceTick, 500);
    draftVoiceTick();
    setTimeout(() => { if (DVOICE_REC) draftVoiceStop(); }, 90000);
  } catch (e) {
    draftVoiceMsg('<span style="color:var(--mut);font-size:11.5px">🎙 No pudimos usar el micrófono. Revisá el permiso.</span>');
  }
}
function draftVoiceStop() {
  const rec = DVOICE_REC;
  DVOICE_REC = null;
  clearInterval(DVOICE_TIMER);
  draftVoiceUI(false);
  if (rec) { try { rec.stop(); } catch (e) { draftVoiceSend(); } }
}
async function draftVoiceSend() {
  const chunks = DVOICE_CHUNKS; DVOICE_CHUNKS = [];
  draftVoiceUI(false);
  const blob = new Blob(chunks, { type: DVOICE_MIME || 'audio/mp4' });
  if (blob.size < 1500) { draftVoiceMsg(''); return; }
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || ''));
    fr.onerror = () => res('');
    fr.readAsDataURL(blob);
  });
  if (!dataUrl || !dataUrl.startsWith('data:audio/')) {
    draftVoiceMsg('<span style="color:#B3402E;font-size:11.5px">No pudimos procesar la nota. Probá de nuevo.</span>');
    return;
  }
  draftVoiceMsg('<span style="color:var(--mut);font-size:11.5px">⏳ Escuchando y aplicando…</span>');
  try {
    const lib = assetPhotos().slice().reverse().slice(0, 6);
    const r = await api.post('/api/ideas/chat', {
      messages: [{ role: 'user', text: '🎙️ Nota de voz' }],
      audio: dataUrl,
      drafts: REVIEW_DRAFTS.map(d => ({ id: d.id, caption: d.caption, when: d.scheduled_at })),
      library: await chatLibThumbs(),
      photoPaths: lib.map(p => p.file_path),
    }, { timeout: 90000 });
    if (r.edit && r.edit.ok) {
      draftVoiceMsg(`<span style="color:#1B7A3D;font-size:11.5px;font-weight:700">✅ ${esc(r.reply || 'Listo, aplicado')}</span>`);
      setTimeout(() => { try { render(); } catch (e) {} }, 1200);
    } else {
      draftVoiceMsg(`<span style="font-size:11.5px">${esc(r.reply || 'No te escuché bien, probá de nuevo')}</span>`);
    }
  } catch (e) {
    draftVoiceMsg(`<span style="color:#B3402E;font-size:11.5px">${esc(e.message || 'Error, probá de nuevo')}</span>`);
  }
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
  // Nota de voz para pedir cambios: abajo de los posteos
  const rvb = document.getElementById('revVoiceBtn');
  if (rvb) rvb.onclick = draftVoiceToggle;
  // Enter en los campos de edición por IA también aplica
  $$('#reviewCard [id^="aiedit-inp-"]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') runAiEdit(i.id.replace('aiedit-inp-', ''), 'text'); }));
  $$('#reviewCard [id^="aiphoto-inp-"]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') runAiEdit(i.id.replace('aiphoto-inp-', ''), 'photo'); }));
  $$('#reviewCard [id^="aiphoto-manual-"]').forEach(b => b.onclick = () => {
    const id = b.id.replace('aiphoto-manual-', '');
    const panel = document.getElementById(`aiphoto-${id}`);
    if (panel) panel.hidden = true;
    togglePhotoPicker(+id);
  });
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
  // Cambiar el video de un borrador reel: tira de videos + subir nuevo
  $$('[data-revvideo]').forEach(b => b.onclick = () => toggleVideoPicker(+b.dataset.revvideo, b));
  // Eliminar borrador (señal honesta: lo borró = no le gustó; va antes del DELETE)
  // Track 4 (agregado): si era el último borrador de la semana, el servidor
  // dispara la reconstrucción con otro enfoque y lo avisa en la respuesta.
  $$('[data-revdel]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Eliminar este borrador?')) return;
    try { await api.post(`/api/posts/${b.dataset.revdel}/signal`, { signal: 'rejected' }); } catch (e) {}
    let delRes = null;
    try { delRes = await api.delete('/api/posts/' + b.dataset.revdel); } catch (e) {}
    track('draft_delete', { id: b.dataset.revdel });
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
          const sc = document.querySelector('.sched-card');
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

// Borradores visibles en la tarjeta de revisión (para regenerar por id)
let REVIEW_DRAFTS = [];
// Píldora "Mi semana" del topbar: muestra cuántos borradores pendientes hay.
// Lee REVIEW_DRAFTS (borradores de la semana actual pendientes de acción del cliente).
function weekPillLabel() {
  const n = (typeof REVIEW_DRAFTS !== 'undefined' && Array.isArray(REVIEW_DRAFTS)) ? REVIEW_DRAFTS.length : 0;
  return n > 0 ? `Mi semana · ${n}` : 'Mi semana';
}
function paintWeekPill() {
  try { const p = document.getElementById('weekPill'); if (p) p.textContent = weekPillLabel(); } catch (e) {}
}
// Bloque de identidad del drawer mobile: logo + nombre del negocio + nivel de la marca + Mi plan.
let __drawerLvl = null, __drawerLvlAt = 0;
async function paintDrawerIdent() {
  const mount = document.getElementById('drawerIdent');
  if (!mount) return;
  const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'Mi negocio';
  let logo = (typeof assetLogo === 'function') ? assetLogo() : null;
  if (!logo) { try { const a = await api.get('/api/assets'); if (Array.isArray(a)) logo = a.find(x => x.kind === 'logo'); } catch (e) {} }
  if (!__drawerLvl || Date.now() - __drawerLvlAt > 60000) {
    try { const r = await api.get('/api/avatar-level'); if (r && r.ok) { __drawerLvl = r; __drawerLvlAt = Date.now(); } } catch (e) {}
  }
  const lv = (__drawerLvl && __drawerLvl.level) || 1;
  const lvName = (__drawerLvl && (__drawerLvl.levelName || POSTA_LVL_NAMES[__drawerLvl.level])) || POSTA_LVL_NAMES[1];
  const bc = (typeof brandColors === 'function' ? brandColors() : []).filter(Boolean);
  const fbBg = bc[0] || '#2793C8';
  const initial = (biz.trim()[0] || 'M').toUpperCase();
  const logoHtml = (logo && logo.file_path)
    ? `<img src="${esc(logo.file_path)}" alt="logo de ${esc(biz)}">`
    : `<span class="drawer-ident-fb" style="background:${esc(fbBg)}">${esc(initial)}</span>`;
  mount.innerHTML = `
    <span class="drawer-ident-logo">${logoHtml}</span>
    <span class="drawer-ident-txt"><b>${esc(biz)}</b><small>Nivel ${lv} · ${esc(lvName)}</small></span>
    <a class="drawer-plan" href="#/app/ajustes?plan=1">Mi plan</a>`;
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
      <div style="font-weight:800;margin-bottom:4px">${isOrder ? '🧾 Tu pedido' : '✨ Idea lista'}: ${esc(CHAT_IDEA.titulo)}</div>
      ${bits.length ? `<div style="font-size:11.5px;color:var(--mut);margin-bottom:6px">${bits.join(' · ')}</div>` : ''}
      ${CHAT_IDEA.angulo ? `<div style="font-size:12.5px;color:var(--mut);margin-bottom:6px">${esc(CHAT_IDEA.angulo)}</div>` : ''}
      ${Array.isArray(CHAT_IDEA.script) && CHAT_IDEA.script.length ? `
      <div style="margin:10px 0 4px">
        <div style="font-weight:800;font-size:12.5px;margin-bottom:6px">🎬 Guion del reel:</div>
        ${CHAT_IDEA.script.slice(0, 6).map(s => `
          <div class="script-row"><span class="script-seg">${esc(String((s && s.seg) || ''))}</span><span>${esc(String((s && s.visual) || ''))}</span><span style="color:var(--mut)">${esc(String((s && s.texto) || ''))}</span></div>`).join('')}
      </div>` : ''}
      <div style="font-weight:700;font-size:12.5px;margin:10px 0 6px">👇 Así se vería — tocá el que más te guste:</div>
      <div class="chat-previews" id="chatPreviews"><div style="font-size:11.5px;color:var(--mut)">⏳ Generando ejemplos…</div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 6px">
        <div style="font-weight:700;font-size:12.5px">📝 Elegí el texto <span style="font-weight:400;color:var(--mut)">(o retocalo)</span></div>
        <button class="btn btn-soft btn-sm" id="chatMoreCaps" type="button" title="Generar 3 textos nuevos">🔄 Otras</button>
      </div>
      <div class="chat-caps" id="chatCaps"></div>
      <textarea class="in" id="chatCaption" rows="4" placeholder="⏳ Generando texto…" oninput="this.dataset.touched='1'">${esc((CHAT_CAPTION && CHAT_CAPTION.caption) || '')}</textarea>
      <input class="in" id="chatHashtags" placeholder="#hashtags…" oninput="this.dataset.touched='1'" value="${esc((CHAT_CAPTION && CHAT_CAPTION.hashtags) || '')}" style="margin-top:6px">
      <details class="chat-board">
        <summary>🎬 Ver cómo sería el reel <span style="color:var(--mut);font-weight:400">(3 escenas)</span></summary>
        <div class="chat-board-row" id="chatBoard"><div style="font-size:11.5px;color:var(--mut)">⏳ Generando…</div></div>
      </details>
      <div class="chat-proposal-btns">
        <button class="btn btn-primary btn-sm" id="chatMkPost">✨ Hacerlo posteo</button>
        <button class="btn btn-soft btn-sm" id="chatMkReel">🎬 Hacerlo reel</button>
      </div>
      <div style="font-size:10.5px;color:var(--dim);margin-top:8px">Se crea como borrador y lo revisás antes de programar.</div>
    </div>`;
}

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
  if (b) { b.disabled = true; b.textContent = '⏳…'; }
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
  if (b2) { b2.disabled = false; b2.textContent = '🔄 Otras'; }
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
    const ph = lib.length ? await photoImg(lib[CHAT_PHOTO_IDX % lib.length].file_path) : null;
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
      } else {
        ctx.fillStyle = '#0A1E33';
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
async function renderChatPreviews() {
  const box = $('#chatPreviews');
  if (!box || !CHAT_IDEA) return;
  const idea = CHAT_IDEA;
  try {
    const lib = CHAT_PHOTOS.length ? CHAT_PHOTOS : assetPhotos();
    const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
    const handle = (PROFILE || {}).ig_username || '';
    const title = makeHeadline(idea.titulo || 'NOVEDAD', 5).toUpperCase() || 'NOVEDAD';
    // Bajada con copy real (primera línea del caption elegido); el ángulo es un brief y nunca se imprime.
    const cap0 = (CHAT_CAPTIONS[CHAT_CAP_SEL] || '');
    const subtitle = cortar(String(cap0 || idea.titulo || '').split('\n')[0], 90);
    const styles = chatStyles();
    const pair = [styles[CHAT_STYLE_IDX % styles.length], styles[(CHAT_STYLE_IDX + 1) % styles.length]];
    const phEntry = lib.length ? lib[CHAT_PHOTO_IDX % lib.length] : null;
    const ph = phEntry ? await photoImg(phEntry.file_path) : null;
    const mk = (tpl, pal) => {
      const cv = document.createElement('canvas');
      drawPost(cv, { tpl, pal, title, subtitle, handle, photoImg: ph, logoImg: logo });
      return cv;
    };
    CHAT_PREVIEWS = pair.map(([tpl, pal]) => ({ kind: 'design', cv: mk(tpl, pal) }));
    if (ph && phEntry) {
      // Tercera opción: la foto sola, sin diseño encima (cuando la foto vende sola)
      const cv = document.createElement('canvas');
      cv.width = 1080; cv.height = 1350;
      drawCover(cv.getContext('2d'), ph, 0, 0, 1080, 1350);
      CHAT_PREVIEWS.push({ kind: 'photo', cv, path: phEntry.file_path });
    }
    CHAT_PREV_SEL = 0;
    box.innerHTML = '';
    CHAT_PREVIEWS.forEach((pv, i) => {
      const d = document.createElement('div');
      d.className = 'chat-prev' + (i === CHAT_PREV_SEL ? ' sel' : '');
      d.appendChild(pv.cv);
      if (pv.kind === 'photo') {
        const tag = document.createElement('span');
        tag.className = 'pv-tag';
        tag.textContent = '📷 Solo foto';
        d.appendChild(tag);
      }
      d.onclick = () => {
        CHAT_PREV_SEL = i;
        box.querySelectorAll('.chat-prev').forEach((el, j) => el.classList.toggle('sel', j === i));
      };
      box.appendChild(d);
    });
  } catch (e) {
    box.innerHTML = `<div style="font-size:11.5px;color:var(--mut)">No pudimos generar los ejemplos, pero podés crearlo igual 👇</div>`;
    CHAT_PREVIEWS = [];
  }
}

let CHAT_LOADED = false; // historial ya cargado del servidor en esta sesión

// Trae el historial del chat del servidor (persiste entre sesiones)
async function chatLoadHistory() {
  try {
    const r = await api.get('/api/ideas/chat');
    if (r && Array.isArray(r.messages) && r.messages.length) {
      CHAT = r.messages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.text)
        .map(m => ({ role: m.role, text: String(m.text).slice(0, 2000) }));
      const box = $('#chatBox');
      if (box) box.innerHTML = CHAT.map(m => `<div class="chat-msg ${m.role === 'user' ? 'u' : 'ai'}">${esc(m.text)}</div>`).join('');
      const chips = $('#chatChips');
      if (chips) chips.remove(); // con historial, los ejemplos ya no hacen falta
    }
    if (r && typeof r.welcome === 'string' && r.welcome.trim()) {
      const box = $('#chatBox');
      if (box) box.insertAdjacentHTML('afterbegin', `<div class="chat-msg ai">${esc(r.welcome.trim().slice(0, 600))}</div>`);
      const chips = $('#chatChips');
      if (chips) chips.remove();
    }
    if (r && r.idea && r.idea.titulo) {
      CHAT_IDEA = r.idea;
      applyChatOrder(r.idea);
      chatRenderProposal();
      const ta0 = $('#chatCaption');
      if (ta0 && r.idea.caption) { ta0.value = r.idea.caption; ta0.dataset.touched = '1'; }
      refreshChatCaption();
    }
    chatScroll();
  } catch (e) { /* sin historial: se empieza de cero */ }
}

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
  // Motor de imágenes nivel agencia: primero intenta un concept shot con IA
  // usando las fotos que mandó en el chat (si mandó). Si falla, sigue como siempre.
  const cm = $('#chatMsg');
  const cmPrev = cm ? cm.innerHTML : null;
  if (cm) cm.innerHTML = `<div class="okmsg">🎨 Creando la imagen…</div>`;
  const chatRefs = CHAT_PHOTOS.filter(p => p && p.kind !== 'video' && p.file_path).slice(0, 2).map(p => p.file_path);
  const csPath = await aiConceptShot({
    idea,
    tipo: idea.tipo || tipoFromText(idea.titulo),
    headline: pickHeadline(idea, caption),
    refs: chatRefs,
  });
  if (cm && cmPrev !== null) cm.innerHTML = cmPrev;
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
  const msgs = CHAT.map(m => `
    <div class="chat-msg ${m.role === 'user' ? 'u' : 'ai'}">${esc(m.text)}</div>`).join('');
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
      <input id="chatInput" class="in" placeholder="Escribile a Posty… 💬" maxlength="2000" autocomplete="off">
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
  if (box) box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">${esc(text)}</div>`);
  chatScroll();
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
    CHAT_STYLE_IDX++;
    chatSay('✅ Probá con este estilo 👇');
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
  if (!CHAT_IDEA) return;
  const mkP = $('#chatMkPost'), mkR = $('#chatMkReel');
  if (mkP) mkP.onclick = () => { track('chat_idea_accepted', { reel: false }); chatMakePost(false); };
  if (mkR) mkR.onclick = () => { track('chat_idea_accepted', { reel: true }); chatMakePost(true); };
  const mCaps0 = $('#chatMoreCaps');
  if (mCaps0) mCaps0.onclick = chatMoreCaptions;
  renderChatPreviews();
  renderChatStoryboard();
  chatScroll();
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
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" id="chatTyping">⏳ …</div>`);
  chatScroll();
  // Fotos subidas en el chat que la IA todavía no vio → se las mandamos con este mensaje
  const unsentPhotos = CHAT_PHOTOS.filter(p => p.aiUrl && !p.sent).map(p => p.aiUrl);
  // Sus fotos guardadas (miniaturas): para que pueda usar la que le pidan ("la del asado")
  let libThumbs = [];
  try { libThumbs = await chatLibThumbs(); } catch (e) {}
  try {
    const r = await api.post('/api/ideas/chat', Object.assign(
      { messages: CHAT, photos: unsentPhotos, library: libThumbs, drafts: chatDraftsCtx() }, extra || {}));
    const t = $('#chatTyping'); if (t) t.remove();
    CHAT_PHOTOS.forEach(p => { if (p.aiUrl && unsentPhotos.includes(p.aiUrl)) p.sent = true; });
    CHAT.push({ role: 'assistant', text: r.reply || '…' });
    box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">${esc(r.reply || '…')}</div>`);
    // El ADN se completó en esta respuesta (bloque ```dna): invitar a generar de nuevo.
    // Nunca auto-disparar la generación: el cliente toca "⚡ Armemos tu semana" cuando quiere.
    if (r.dna) chatSay('¡Ya sé lo esencial de tu negocio! 🎉 Ahora tocá de nuevo "⚡ Armemos tu semana" y la armamos en serio.');
    // Opciones tocables que propone la IA (ej: "¿vender o alcance?")
    if (r.options && Array.isArray(r.options) && r.options.length) renderChatOptions(r.options);
    // La IA editó un borrador directo → refrescar la revisión para ver el cambio
    if (r.edit && r.edit.ok) { try { render(); } catch (e) {} }
    if (Array.isArray(r.ideas) && r.ideas.length > 1) {
      // MODO OPCIONES: el cliente elige entre varias ideas tocando su tarjeta
      renderChatIdeaOptions(r.ideas);
    } else if (r.idea) {
      chatAcceptIdea(r.idea);
    }
  } catch (e) {
    const t = $('#chatTyping'); if (t) t.remove();
    if (m) m.innerHTML = `<div class="err">${esc(e.message || 'No pudimos responder')}</div>`;
  }
  if (btn) { btn.disabled = false; chatUpdateSendBtn(); }
  chatScroll();
}

async function chatMakePost(asVideo) {
  const idea = CHAT_IDEA;
  if (!idea) return;
  // Cupo del plan: chequear antes de crear para no perder la idea armada
  try {
    const q = await api.get('/api/quota');
    if (q.left <= 0) { quotaModal(q); return; }
  } catch (e) {}
  const m = $('#chatMsg');
  const mkP = $('#chatMkPost'), mkR = $('#chatMkReel');
  if (mkP) mkP.disabled = true;
  if (mkR) mkR.disabled = true;
  try {
    if (m) m.innerHTML = `<div class="okmsg">⏳ Creando tu ${asVideo ? 'reel' : 'posteo'}…</div>`;
    if (!asVideo && CHAT_PREVIEWS.length) {
      await draftFromPreview(idea, CHAT_PREVIEWS[CHAT_PREV_SEL] || CHAT_PREVIEWS[0]);
    } else {
      await draftFromIdea(idea, asVideo, 0, true);
    }
    CHAT_IDEA = null;
    CUSTOM_PAL = null;
    CHAT_PREVIEWS = []; CHAT_PREV_SEL = 0;
    CHAT_PHOTOS = []; CHAT_PHOTO_IDX = 0; CHAT_STYLE_IDX = 0;
    CHAT_CAPTION = null; CHAT_CAPTIONS = []; CHAT_CAP_SEL = 0;
    const doneText = '¡Listo! Te lo dejé en revisión acá arriba 👆 Nada se programa hasta que vos lo apruebes.';
    try { api.post('/api/ideas/chat/log', { clearIdea: true, messages: [{ role: 'assistant', text: doneText }] }).catch(() => {}); } catch (e) {}
    CHAT.push({ role: 'assistant', text: doneText });
    render();
    setTimeout(() => {
      const rc = $('#reviewCard') || $('#draftsBanner');
      if (rc) rc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  } catch (e) {
    const capMsg = (e && e.aiCap) ? (e.message || 'Llegamos al tope de IA de hoy 🔋 Seguimos mañana 💪') : null;
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
  return `
  <div class="chat-home">
    <div class="chome-top">
      <span class="chome-ava-wrap"><img src="ai-avatar.png" class="chome-ava" alt="Posty"></span>
      <div><b>Posty</b><div class="chome-sub">tu community manager: te arma la semana y la publica por vos</div></div>
    </div>
    ${chatCardHTML(true, true, true)}
    <div id="revMsg"></div>
    <div id="apProg-semana"></div>
  </div>`;
}

async function bindChatView() {
  bindChat();
  bindReview();
  bindScheduleAll();
  bindAutopilot();
  // El auto-arranque de la semana también aplica entrando por el chat.
  if (typeof maybeAutoStartWeek === 'function') { try { maybeAutoStartWeek(); } catch (e) {} }
  // El saludo va DESPUÉS del historial (chatLoadHistory reemplaza el box):
  // si ya cargó antes, no hay nada que esperar.
  try { await (window.__chatHistP || Promise.resolve()); } catch (e) {}
  try { await chatGreet(); } catch (e) {}
}

// Mensaje del asistente solo local: no se loguea al servidor (no ensucia el contexto de la IA).
function chatSayLocal(text) {
  try { CHAT.push({ role: 'assistant', text }); } catch (e) {}
  const box = document.getElementById('chatBox');
  if (box) box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">${esc(text)}</div>`);
  if (typeof chatScroll === 'function') chatScroll();
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
    text = `Dejé ${n} ${n === 1 ? 'borrador listo' : 'borradores listos'} en Mi semana 👇`;
  } else if (scheduled.length > 0) {
    // Resumen proactivo (hoy / mañana a la noche): reemplaza el saludo
    // genérico, no se suma — una sola burbuja por apertura.
    text = chatSchedSummary(scheduled) || 'Tu semana sale sola 📅 La próxima ya se está armando.';
  } else if (missionActive) {
    const mTitle = String(missionActive.title || '').toLowerCase();
    if (missionActive.act === 'comments') {
      text = 'Tenés comentarios sin responder 💬 Escribime "comentarios" y los vemos juntos.';
    } else {
      const dest = missionActive.go === '#/app/ajustes' ? 'Ajustes' : 'Mi semana';
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
    chips = [
      { t: 'Ver Mi semana 👇', go: '#/app/semana' },
      { t: '📅 Programar mi semana', do: 'schedule' },
      '¿Qué sale esta semana? 📅',
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
  const lines = ['📅 Mi semana:'];
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

// Pinta el nivel de LA MARCA en la tira TU PROGRESO: logo del cliente con
// marco de nivel (bronce/plata/oro) + badge, nombre del negocio, UNA barra
// al siguiente nivel y 2-3 stats. Si no hay logo: inicial con la paleta del cliente.
async function paintBrandStrip() {
  const mount = document.getElementById('xpBrand');
  if (!mount) return;
  let lv = null;
  try { lv = await api.get('/api/avatar-level'); } catch (e) {}
  let logo = (typeof assetLogo === 'function') ? assetLogo() : null;
  if (!logo) { try { const a = await api.get('/api/assets'); if (Array.isArray(a)) logo = a.find(x => x.kind === 'logo'); } catch (e) {} }
  const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim() || 'Mi negocio';
  const lvl = (lv && lv.ok) ? lv.level : 1;
  const lvlName = (lv && lv.ok && (lv.levelName || POSTA_LVL_NAMES[lv.level])) || POSTA_LVL_NAMES[1];
  const tier = (lv && lv.ok && lv.tier) || 'none';
  const xp = (lv && lv.ok && lv.xp) || 0;
  const published = (lv && lv.ok && lv.published) || 0;
  let pct = 0, sub;
  if (lv && lv.ok && lv.nextXp) {
    pct = Math.min(99, Math.round((xp / lv.nextXp) * 100));
    sub = `${xp} de ${lv.nextXp} pts · próximo: ${lv.nextName}`;
  } else if (lv && lv.ok) { pct = 100; sub = `👑 ¡Nivel máximo: ${lvlName}!`; }
  else { sub = 'Publicá para subir de nivel'; }
  const bc = (typeof brandColors === 'function' ? brandColors() : []).filter(Boolean);
  const fbBg = bc[0] || '#2793C8';
  const initial = (biz.trim()[0] || 'M').toUpperCase();
  const logoHtml = (logo && logo.file_path)
    ? `<img src="${esc(logo.file_path)}" alt="logo">`
    : `<span class="xp-logo-fallback" style="background:${esc(fbBg)}">${esc(initial)}</span>`;
  mount.innerHTML = `
    <span class="xp-logo-wrap tier-${tier}">${logoHtml}<span class="xp-lvl-badge">${lvl}</span></span>
    <span class="xp-brand-txt"><span class="xp-title">Tu progreso</span><b class="xp-biz">${esc(biz)}</b><span class="xp-lvlname">Nivel ${lvl} · ${esc(lvlName)}</span></span>`;
  const bar = document.getElementById('xpBrandBar'); if (bar) bar.style.width = pct + '%';
  const subEl = document.getElementById('xpBrandSub'); if (subEl) subEl.textContent = sub;
  const stats = document.getElementById('xpBrandStats');
  if (stats) {
    let streakTxt = '';
    try { const sk = await api.get('/api/streak'); if (sk && sk.current > 0) streakTxt = `<span>🔥 ${sk.current} ${sk.current === 1 ? 'semana' : 'semanas'}</span>`; } catch (e) {}
    stats.innerHTML = `<span>⚡ ${xp} pts</span>${streakTxt}<span>📮 ${published} ${published === 1 ? 'publicado' : 'publicados'}</span>`;
  }
}

// Misiones de Posty: una activa por vez, narradas en el chat.
const POSTA_MISSION_DEFS = [
  { id: 'connect_ig', title: 'Conectá tu Instagram', why: 'Así publico por vos y leo tus comentarios.', cta: 'Conectar Instagram', go: '#/app/ajustes' },
  { id: 'photos', title: 'Subí fotos de tu negocio', why: 'Con tus fotos reales los posteos venden de verdad.', cta: 'Subir fotos', go: '#/app/semana' },
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
  const res = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
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
const DESIGN_TPLS = ['gradiente', 'claro', 'noche', 'promo'];
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
    await api.post('/api/posts', { image_path: imagePath, caption, hashtags, media_type: mediaType, source_topic: idea.titulo || '', source_angle: idea.angulo || '', tipo: idea.tipo || '', strategy_why: idea.porque || '' });
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
        prog.innerHTML = `<div class="okmsg">👋 Para armar tu semana primero tengo que conocer tu negocio: <a href="#/app/onboarding" style="color:var(--cel);font-weight:700">charlamos 2 minutos</a> o <a href="#/app/semana" style="color:var(--cel);font-weight:700">hacelo después →</a></div>`;
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
        chatSayLocal('¡Tu semana está lista! 🎉 La dejé en Mi semana para que la revises — mirala con amor que la hice para vos 👇');
        if (typeof refreshWeekPill === 'function') refreshWeekPill().then(() => {
          try { renderQuickChips(REVIEW_DRAFTS, [], false); } catch (e) {}
        });
      }
    } catch (e) {}
    // Historias automáticas: 2 por semana con las primeras ideas (foto + título).
    // Se programan junto con la semana: más presencia, cero trabajo extra.
    // (No consumen cupo del plan; si el cupo frenó la corrida, tampoco se crean.)
    if (!quotaStopped) try {
      prog.innerHTML = `<div class="okmsg">⏳ Creando 2 historias automáticas...</div>${liveHTML()}`;
      const sPhotos = assetPhotos().slice().reverse();
      const sHandle = (PROFILE || {}).ig_username || '';
      const sPal = defaultPal();
      const nStories = Math.min(2, picks.length - 1);
      for (let si = 0; si < nStories; si++) {
        const idea = picks[si];
        const title = makeHeadline(idea.titulo || 'Novedad', 5).toUpperCase() || 'NOVEDAD';
        const subtitle = makeHeadline((idea.angulo || '').split('.')[0], 12, 80);
        const ph = sPhotos.length ? sPhotos[(si + 1) % sPhotos.length] : null;
        let sPath = null;
        try {
          sPath = await renderStoryImage({
            pal: sPal, title, subtitle, handle: sHandle,
            photoImg: ph ? await photoImg(ph.file_path) : null,
          });
        } catch (e) { console.error('[historias] diseño:', e.message); }
        if (sPath) {
          try {
            await api.post('/api/posts', {
              image_path: sPath, caption: title, hashtags: '',
              media_type: 'story', source_topic: idea.titulo || '',
            });
            live.push({ imagePath: sPath, mediaType: 'story' });
            prog.innerHTML = `<div class="okmsg">⏳ Historia ${si + 1} de ${nStories} ✅</div>${liveHTML()}`;
          } catch (e) {
            if (!String(e.message || '').includes('Ya creaste este posteo')) throw e;
          }
        }
      }
      prog.innerHTML = `<div class="okmsg">🎉 ¡Tu semana está lista! La armé con tu marca y tu estilo 💪</div>${liveHTML()}`;
    } catch (e) { console.error('[historias]', e.message); }
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
  mount.innerHTML = `<div class="okmsg">⏳ Sigue publicándose… lo ves en Mi semana en un minuto.</div>`;
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
  // Handlers asignados (no addEventListener): bindSemana corre en cada render,
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
        const vc = document.getElementById('dnaVoiceCard');
        if (vc) vc.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    <p class="d">Mejorá tu paquete y seguimos posteando ya mismo — se activa al instante, sin vueltas.</p>
    ${left > 0 && opts.onPartial ? `<button class="btn btn-soft btn-block" id="qPartial" style="margin-top:10px">Armar solo ${left === 1 ? 'el que me queda' : `los ${left} que me quedan`} →</button>` : ''}
    <button class="btn btn-primary btn-block" id="qUpgrade" style="margin-top:10px">⬆️ Mejorar mi paquete</button>
    <button class="btn btn-ghost btn-block" id="qClose" style="margin-top:8px">Ahora no</button>`);
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
  const shareMsg = `Mirá lo que hace Posta con el Instagram de mi negocio: arma la semana y la publica sola. Probalo 3 días gratis con mi link: ${link}`;
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
let ADS_CTX = null; // { balance, minTopup } — lo llena semanaView/adsView para pintar los botones sin parpadeo

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
      setTimeout(() => { const h = location.hash || ''; if (h.startsWith('#/app/ads') || h.startsWith('#/app/semana')) render(); }, 4000);
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
  const cleanUrl = () => { try { if (/\?topup=/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/app/semana'); } catch (e) {} };
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
      setTimeout(() => { if ((location.hash || '').startsWith('#/app/semana')) render(); }, 6000);
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
    : `<div class="hint" style="padding:8px 0">Todavía no hay datos suficientes. Cuando tus posteos junten alcance, te decimos acá cuáles conviene potenciar. 👆</div>`;

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
    : `<p class="d" style="margin:0">Todavía no potenciaste ningún posteo.</p>`;

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
  <div class="card">
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
      location.hash = '#/app/semana?topup=ok'; return;
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
}

async function loadMissionCard() {  const el = $('#missionCard');
  if (!el) return;
  let m;
  try { m = await api.get('/api/photo-mission'); } catch (e) { el.innerHTML = ''; return; }
  if (!m || !m.need) { el.innerHTML = ''; return; }
  // Una sola foto pedida, concreta y de SU negocio. El botón SUBE la foto directo (sin vueltas).
  if (m.done) {
    el.innerHTML = `
    <div class="card mission-card">
      <h3 style="margin:0 0 4px">📷 Tus posteos</h3>
      <p style="margin:0;color:var(--mut);font-size:12.5px">✅ ¡Listo! Ya tenemos tu foto — la estamos usando en tus posteos de esta semana.</p>
    </div>`;
    return;
  }
  el.innerHTML = `
  <div class="card mission-card">
    <h3 style="margin:0 0 4px">📋 Tareas para seguir mejorando tus posteos</h3>
    <p style="margin:0 0 6px;font-size:13px">Nos falta <b>${esc(m.need)}</b> — 30 segundos con tu celular.</p>
    <p class="hint" style="margin:0 0 10px">La usamos en tus posteos de esta semana: con tus fotos reales, venden más.</p>
    <button class="btn btn-primary btn-sm" id="missionUpload">📷 Subir la foto</button>
    <input type="file" id="missionFile" accept="image/*" style="display:none">
    <div id="missionMsg" style="margin-top:8px"></div>
  </div>`;
  const b = $('#missionUpload'), inp = $('#missionFile');
  if (b && inp) {
    b.onclick = () => inp.click();
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      const msg = $('#missionMsg');
      b.disabled = true;
      if (msg) msg.innerHTML = `<div class="hint">⏳ Subiendo…</div>`;
      try {
        const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/jpeg' }, body: f });
        if (!r.ok) throw new Error('No se pudo subir la foto');
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
        loadMissionCard(); // re-render → estado hecho
      } catch (e) {
        b.disabled = false;
        if (msg) msg.innerHTML = `<div class="err">${esc(e.message || 'No pude subirlo 😅 Probá de nuevo')}</div>`;
      }
      inp.value = '';
    };
  }
}

/* ---------- 🎨 Referencia visual (inspo): un posteo que te gusta → dirección de arte ---------- */
// Tarjeta prominente en Mi semana. El cliente sube un posteo de Instagram que
// le gusta → POST /api/dna/inspo lo analiza con visión (gpt-4o) y guarda el
// estilo en business_dna.dna_json.inspo. El generador lo lee solo:
// dnaBitsLine (concept-shot / image-brief) y businessContext (captions).
async function loadInspoCard() {
  const el = document.getElementById('inspoCard');
  if (!el) return;
  let inspo = '';
  try { const r = await api.get('/api/dna'); inspo = (r && r.dna && String(r.dna.inspo || '').trim()) || ''; } catch (e) { el.innerHTML = ''; return; }
  if (inspo) {
    el.innerHTML = `
    <div class="card" style="opacity:.85">
      <h3 style="margin:0 0 4px">🎨 Tu estilo de referencia</h3>
      <p style="margin:0;color:var(--mut);font-size:12.5px">✅ Ya tenemos tu estilo de referencia: lo usamos para diseñar tus posteos.</p>
      <p style="margin:8px 0 0;font-size:12px;color:var(--dim);font-style:italic">“${esc(inspo.slice(0, 160))}”</p>
      <div style="text-align:right;margin-top:4px"><button class="btn btn-ghost btn-sm" id="inspoChange">cambiar</button></div>
    </div>`;
    const ch = document.getElementById('inspoChange');
    if (ch) ch.onclick = () => inspoIdleHTML(el);
    return;
  }
  inspoIdleHTML(el);
}
function inspoIdleHTML(el) {
  el.innerHTML = `
  <div class="card" style="border:2px solid var(--cel)">
    <h3 style="margin:0 0 4px">🎨 ¿Te gusta algún estilo?</h3>
    <p style="color:var(--mut);font-size:12.5px;margin:0 0 12px">Subí un posteo de Instagram que te guste y lo usamos de referencia para tus diseños.</p>
    <div style="text-align:center"><button class="btn btn-primary btn-sm" id="inspoUpload">🎨 Subir referencia</button></div>
    <input type="file" id="inspoFile" accept="image/*" style="display:none">
    <div id="inspoMsg" style="margin-top:8px;text-align:center"></div>
  </div>`;
  const b = document.getElementById('inspoUpload'), inp = document.getElementById('inspoFile');
  if (b && inp) {
    b.onclick = () => inp.click();
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f || !f.type.startsWith('image/')) return;
      const msg = document.getElementById('inspoMsg');
      b.disabled = true;
      if (msg) msg.innerHTML = `<div class="hint">⏳ Mirando el estilo…</div>`;
      try {
        const r = await fetch('/api/dna/inspo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/jpeg' }, body: f });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo analizar la imagen');
        loadInspoCard(); // re-render → estado hecho
      } catch (e) {
        b.disabled = false;
        if (msg) msg.innerHTML = `<div class="err">${esc(e.message || 'No pude subirlo 😅 Probá de nuevo')}</div>`;
      }
      inp.value = '';
    };
  }
}

/* ---------- "Ya salió": historial de publicados con outcome loop liviano ---------- */
// Para posteos published de hace +24h sin señal de outcome se pregunta
// "¿Este posteo te trajo clientes? 👍/👎" → señales brought_clients/no_clients.
// p.signal viene del JOIN con post_signals: solo se saltea si ya es de outcome
// (approved/rejected de la revisión no cuentan).
function salioCardHTML(publishedList) {
  const DAY = 24 * 3600 * 1000;
  const now = Date.now();
  const pubMs = (s) => {
    try {
      const t = String(s || '').trim().replace(' ', 'T');
      const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t) ? t : t + 'Z');
      return isNaN(d) ? 0 : d.getTime();
    } catch (e) { return 0; }
  };
  const items = publishedList.slice(0, 8).map(p => {
    const old = pubMs(p.published_at) > 0 && (now - pubMs(p.published_at) > DAY);
    const sig = p.signal || '';
    const hasOutcome = sig === 'brought_clients' || sig === 'no_clients';
    const media = p.media_type === 'video'
      ? `<video src="${esc(p.image_path || '')}" muted preload="metadata" playsinline></video>`
      : (p.image_path ? `<img src="${esc(p.image_path)}" alt="" loading="lazy">` : `<div style="width:120px;height:150px;border-radius:12px;background:#EEF2F6"></div>`);
    let foot = '';
    if (old && !hasOutcome) {
      foot = `<div style="margin-top:6px">
        <div style="font-size:10px;color:var(--mut);line-height:1.4;margin-bottom:4px">¿Este posteo te trajo clientes?</div>
        <div class="pub-rate"><button class="sig-btn" data-oc-sig="brought_clients" data-id="${p.id}" title="Sí, me trajo clientes">👍</button><button class="sig-btn" data-oc-sig="no_clients" data-id="${p.id}" title="No">👎</button></div>
      </div>`;
    } else if (hasOutcome) {
      foot = `<div style="font-size:10px;color:var(--dim);margin-top:6px;line-height:1.4">${sig === 'brought_clients' ? '✅ Te trajo clientes' : '📭 Sin clientes todavía'}</div>`;
    }
    return `<div class="pub-thumb">${media}${foot}</div>`;
  }).join('');
  return `
  <div class="card" style="margin-top:12px">
    <h3 style="margin:0 0 4px">✅ Ya salió</h3>
    <p style="color:var(--mut);font-size:11.5px;margin:0 0 10px">Contanos cómo rindió cada posteo: así la IA aprende qué te trae clientes de verdad.</p>
    <div class="pub-strip">${items}</div>
  </div>`;
}
function bindOutcomeBtns() {
  $$('[data-oc-sig]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await api.post(`/api/posts/${b.dataset.id}/signal`, { signal: b.dataset.ocSig }); }
    catch (e) { b.disabled = false; return; }
    render();
  });
}

/* ---------- 🎙️ Contame de tu negocio: nota de voz → ADN ---------- */
// Tarjeta pegada a la misión de fotos en Mi semana. El cliente habla ~2 minutos
// de su negocio, se transcribe con Whisper y la IA extrae el ADN (productos,
// promos, horarios, ubicación) vía POST /api/dna/from-audio.
let DNAV_REC = null, DNAV_CHUNKS = [], DNAV_MIME = '', DNAV_TIMER = null, DNAV_START = 0;
const DNA_LABELS = {
  producto_estrella: '⭐ Tu producto estrella', cliente_ideal: '🎯 Tu cliente ideal',
  diferencial: '✨ Lo que te diferencia', tono: '🗣️ Tono',
  productos: '🛍️ Productos', servicios: '🛠️ Servicios', promos_activas: '🏷️ Promos activas',
  horarios: '🕒 Horarios', ubicacion: '📍 Ubicación',
};
function dnaVoiceIdleHTML() {
  return `
  <div class="card" style="border:2px solid var(--cel)">
    <h3 style="margin:0 0 4px">🎙️ Contame de tu negocio</h3>
    <p style="color:var(--mut);font-size:12.5px;margin:0 0 12px">Hablame 2 minutos de tu negocio y la IA aprende cómo se ve lo que hacés.</p>
    <div style="text-align:center"><button class="rev-voice-btn" id="dnaVoiceBtn">🎙️ Grabar nota de voz</button></div>
    <div class="rev-voice-msg" id="dnaVoiceMsg" style="text-align:center"></div>
  </div>`;
}
function loadDnaVoiceCard() {
  const el = document.getElementById('dnaVoiceCard');
  if (!el) return;
  el.innerHTML = dnaVoiceIdleHTML();
  const b = document.getElementById('dnaVoiceBtn');
  if (b) b.onclick = dnaVoiceToggle;
}
function dnaVoiceMsg(html) { const m = document.getElementById('dnaVoiceMsg'); if (m) m.innerHTML = html; }
function dnaVoiceTick() {
  if (!DNAV_REC) return;
  const b = document.getElementById('dnaVoiceBtn');
  const s = Math.floor((Date.now() - DNAV_START) / 1000);
  const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (b) b.innerHTML = `🔴 ${t} — tocá para enviar`;
}
async function dnaVoiceToggle() {
  if (DNAV_REC) { dnaVoiceStop(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    dnaVoiceMsg('<span style="color:var(--mut);font-size:11.5px">🎙 Tu navegador no soporta notas de voz.</span>');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    DNAV_CHUNKS = [];
    DNAV_MIME = rec.mimeType || '';
    rec.ondataavailable = e => { if (e.data && e.data.size) DNAV_CHUNKS.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); dnaVoiceSend(); };
    DNAV_REC = rec;
    rec.start();
    DNAV_START = Date.now();
    const b = document.getElementById('dnaVoiceBtn');
    if (b) b.classList.add('btn-rec');
    clearInterval(DNAV_TIMER);
    DNAV_TIMER = setInterval(dnaVoiceTick, 500);
    dnaVoiceTick();
    dnaVoiceMsg('<span style="color:var(--mut);font-size:11.5px">🔴 Grabando… contame qué vendés, tus precios y tus promos</span>');
    setTimeout(() => { if (DNAV_REC) dnaVoiceStop(); }, 180000);
  } catch (e) {
    dnaVoiceMsg('<span style="color:var(--mut);font-size:11.5px">🎙 No pudimos usar el micrófono. Revisá el permiso en tu navegador y probá de nuevo.</span>');
  }
}
function dnaVoiceStop() {
  const rec = DNAV_REC;
  DNAV_REC = null;
  clearInterval(DNAV_TIMER);
  const b = document.getElementById('dnaVoiceBtn');
  if (b) { b.classList.remove('btn-rec'); b.innerHTML = '🎙️ Grabar nota de voz'; }
  if (rec) { try { rec.stop(); } catch (e) { dnaVoiceSend(); } }
}
async function dnaVoiceSend() {
  const chunks = DNAV_CHUNKS; DNAV_CHUNKS = [];
  const blob = new Blob(chunks, { type: DNAV_MIME || 'audio/mp4' });
  if (blob.size < 1500) { dnaVoiceMsg('<span style="color:var(--mut);font-size:11.5px">Parece que no se grabó nada. Probá de nuevo.</span>'); return; }
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || ''));
    fr.onerror = () => res('');
    fr.readAsDataURL(blob);
  });
  if (!dataUrl || !dataUrl.startsWith('data:audio/')) {
    dnaVoiceMsg('<span style="color:#B3402E;font-size:11.5px">No pudimos procesar la nota. Probá de nuevo.</span>');
    return;
  }
  dnaVoiceMsg('<span style="color:var(--mut);font-size:11.5px">⏳ Escuchando y aprendiendo de tu negocio…</span>');
  try {
    const r = await api.post('/api/dna/from-audio', { audioDataUrl: dataUrl }, { timeout: 120000 });
    const el = document.getElementById('dnaVoiceCard');
    if (el) el.innerHTML = `
    <div class="card" style="border:2px solid var(--cel)">
      <h3 style="margin:0 0 4px">🧬 La IA ya te conoce mejor</h3>
      ${dnaExtractedSummaryHTML(r.extracted)}
      ${r.transcript ? `<details style="margin-top:10px"><summary style="font-size:11.5px;color:var(--dim);cursor:pointer">Ver lo que dijiste</summary><p style="font-size:12px;color:var(--mut);font-style:italic;margin:8px 0 0">“${esc(r.transcript)}”</p></details>` : ''}
      <p style="font-size:11.5px;color:var(--mut);margin:12px 0 0">Lo guardamos en <b>Ajustes → Tu negocio</b>, donde podés verlo y corregirlo cuando quieras.</p>
      <div style="text-align:center;margin-top:10px"><button class="rev-voice-btn" id="dnaVoiceAgain">🎙️ Contar más</button></div>
      <div class="rev-voice-msg" id="dnaVoiceMsg" style="text-align:center"></div>
    </div>`;
    const ag = document.getElementById('dnaVoiceAgain');
    if (ag) ag.onclick = () => { loadDnaVoiceCard(); dnaVoiceToggle(); };
  } catch (e) {
    dnaVoiceMsg(`<span style="color:#B3402E;font-size:11.5px">${esc((e && e.message) || 'No pudimos procesar la nota. Probá de nuevo.')}</span>`);
  }
}
function dnaExtractedSummaryHTML(extracted) {
  const x = extracted || {};
  const rows = [];
  const fmtItem = (it) => {
    if (typeof it === 'string') return it.trim();
    if (it && typeof it === 'object') {
      const a = (it.nombre || it.titulo || it.pregunta || '').trim();
      const b2 = (it.precio || it.detalle || it.respuesta || '').trim();
      return b2 ? `${a} — ${b2}` : a;
    }
    return '';
  };
  for (const k of Object.keys(DNA_LABELS)) {
    const v = x[k];
    if (v === undefined || v === null) continue;
    let txt = '';
    if (Array.isArray(v)) {
      const items = v.map(fmtItem).filter(Boolean);
      if (!items.length) continue;
      txt = items.slice(0, 6).join(' · ');
    } else if (String(v).trim()) {
      txt = String(v).trim();
    }
    if (!txt) continue;
    rows.push(`<div style="font-size:12.5px;margin:6px 0"><b>${DNA_LABELS[k]}:</b> ${esc(txt)}</div>`);
  }
  if (!rows.length) return `<p style="font-size:12.5px;color:var(--mut);margin:8px 0">Te escuché perfecto, pero no detecté datos nuevos del negocio. Probá contando tus productos, precios o promos.</p>`;
  return `<div style="margin-top:8px">${rows.join('')}</div>`;
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
// Tocar el HUD de XP: modal PRO de la racha — héroe con progreso, camino de niveles y stats.
function streakPillModal(sk) {
  if (!sk || !sk.current) return;
  const lv = sk.level || { emoji: '🔥', name: '' };
  const pts = sk.current * 100;
  const biz = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.business_name || '').trim();
  const levels = sk.levels || [];
  const curIdx = levels.findIndex(l => sk.level && l.name === sk.level.name);
  const journey = levels.map((l, i) => {
    const isCur = i === curIdx;
    const done = !isCur && sk.current >= l.min;
    const node = `<div class="stk-node${isCur ? ' cur' : ''}${done ? ' done' : ''}${!isCur && !done ? ' lock' : ''}"><div class="stk-dot">${l.emoji}</div><small>${esc(l.name)}</small></div>`;
    const link = i < levels.length - 1 ? `<div class="stk-link${done || isCur ? ' on' : ''}"></div>` : '';
    return node + link;
  }).join('');
  const nl = sk.nextLevel;
  const pct = nl ? Math.min(100, Math.round(sk.current / nl.at * 100)) : 100;
  const falta = nl ? nl.at - sk.current : 0;
  const nextTxt = nl
    ? `${sk.current} de ${nl.at} semanas · te ${falta === 1 ? 'falta 1 semana' : `faltan ${falta} semanas`} para ${nl.emoji} ${esc(nl.name)}`
    : `Nivel máximo alcanzado 👑`;
  const warn = sk.expiringSoon
    ? `<p class="warn">⏳ Tu racha se apaga en ${fmtStreakLeft(sk.expiresInMs)} si no sale ningún posteo — programá y seguí sumando.</p>` : '';
  streakModalShell(`
    <div class="stk-hero">
      <div class="stk-badge">${lv.emoji}</div>
      <p class="stk-eyebrow">Nivel ${esc(lv.name)}</p>
      ${biz ? `<p class="stk-biz">La racha de ${esc(biz)}</p>` : ''}
      <p class="stk-pts"><b>⚡ ${pts}</b> pts</p>
      <div class="stk-bar"><i style="width:${pct}%"></i></div>
      <p class="stk-next">${nextTxt}</p>
    </div>
    ${journey ? `<div class="stk-journey">${journey}</div>` : ''}
    <div class="stk-stats">
      <div class="stk-stat"><b>🔥 ${sk.current}</b><span>${sk.current === 1 ? 'semana seguida' : 'semanas seguidas'}</span></div>
      <div class="stk-stat"><b>🏆 ${sk.best}</b><span>mejor racha</span></div>
      <div class="stk-stat"><b>+100</b><span>pts por semana</span></div>
    </div>
    ${WEEKLY_BARS_HTML ? `<p class="d" style="margin:14px 0 6px;text-align:center">Posteos por semana</p><div class="bars" style="height:90px;margin:0 0 4px">${WEEKLY_BARS_HTML}</div>` : ''}
    ${warn}
    <p class="stk-rule">La racha sigue viva mientras salga al menos un posteo cada 72 horas.</p>
    ${streakShareBtns()}`);
  wireStreakModalBtns(sk);
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

async function semanaView() {
  let st = null;
  try { st = await api.get('/api/stats/summary'); } catch (e) { st = null; }
  let sk = null;
  try { sk = await api.get('/api/streak'); } catch (e) {}
  // Borradores y programados viven acá, en Mi semana: se revisan y programan sin salir de la pantalla.
  let allPosts = [];
  try { allPosts = await api.get('/api/posts'); } catch (e) { allPosts = []; }
  // Track 4 "Pipeline perpetuo": los borradores se filtran por semana.
  // week_key '' = semana corriente / legado (como antes, sin filtrar).
  // Los de la próxima semana viven aparte hasta que les toca.
  const thisMon = mondayKey(new Date());
  let drafts = allPosts.filter(p => p.status === 'draft' && (!p.week_key || p.week_key === thisMon)).sort((a, b) => a.id - b.id);
  const nextDrafts = allPosts.filter(p => p.status === 'draft' && p.week_key && p.week_key !== thisMon).sort((a, b) => a.id - b.id);
  if (!nextDrafts.length) NEXTWEEK_VIEW = false;
  const viewingNext = NEXTWEEK_VIEW && nextDrafts.length > 0;
  if (viewingNext) drafts = nextDrafts;
  const scheduled = allPosts.filter(p => p.status === 'scheduled').sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const draftN = drafts.length;
  const slots = suggestSlots(draftN, scheduled);
  // La barra superior se construye más abajo: lleva racha + progreso juntos
  // (la tarjeta "Tu progreso" del fondo se eliminó — nadie la miraba).
  let xpStrip = '';
  const expBanner = sk && sk.expiringSoon ? `
  <div class="card" style="border:1.5px solid #FEC14D;background:#FFF9EC">
    <div class="nudge-top"><span class="nudge-ico">⏳</span><div><h3>Tu racha ${esc(sk.level.emoji)} se apaga en ${fmtStreakLeft(sk.expiresInMs)}</h3>
    <p>${draftN > 0 ? 'Programá tus borradores acá abajo 👇 y la racha sigue viva.' : 'Si no sale ningún posteo en ese tiempo, la racha vuelve a cero.'}</p></div></div>
  </div>` : '';
  if (!st) return `<div class="empty"><div class="big">⏳</div>No pudimos cargar tu resumen. Probá de nuevo.</div>`;
  const w = st.week, ap = st.approval, mo = st.month;
  const pct = w.planned ? Math.min(100, Math.round((w.ready / w.planned) * 100)) : 0;

  // Gráfico de constancia (últimas 8 semanas): vive en el modal de racha.
  const maxT = Math.max(1, ...st.weekly.map(x => x.total));
  const weeksWithData = (st.weekly || []).filter(x => x.total > 0).length;
  WEEKLY_BARS_HTML = weeksWithData >= 3
    ? st.weekly.map(x => `<div class="bar-w"><div class="bar" style="height:${Math.max(4, Math.round((x.total / maxT) * 100))}%"></div><span>${esc(x.label)}</span></div>`).join('')
    : '';
  // Barra superior unificada: racha + tu progreso en un solo vistazo.
  // La tarjeta "Tu progreso" del fondo se eliminó — su info vive acá arriba.
  const hasStreak = sk && sk.current > 0 && sk.level;
  const nl = hasStreak ? sk.nextLevel : null;
  const lvlPct = nl ? Math.min(99, Math.round((sk.current / nl.at) * 100)) : 100;
  const weekTxt = w.missing
    ? (draftN > 0 ? `Tenemos ${draftN} ${draftN === 1 ? 'borrador' : 'borradores'} — revisalos abajo 👇` : `Faltan ${w.missing} para completar la semana`)
    : `✅ ${w.ready}/${w.planned} — semana armada, se publica sola`;
  const statsTxt = mo.published > 0
    ? `<span>⏱ ≈${mo.hours_saved_total} h ahorradas</span><span>📮 ${mo.published} ${mo.published === 1 ? 'publicado' : 'publicados'}</span>`
    : `<span>⏱ Cada posteo te ahorra ≈1,5 h</span>`;
  const stripInner = `
    <span class="xp-brand" id="xpBrand"></span>
    <span class="xp-bar"><span id="xpBrandBar" style="width:0%"></span></span>
    <span class="xp-sub" id="xpBrandSub">Cargando tu progreso…</span>
    <span class="xp-stats" id="xpBrandStats"></span>`;
  xpStrip = hasStreak
    ? `<button class="xp-strip" id="xpStrip" aria-label="Ver el progreso de tu racha">${stripInner}</button>`
    : `<div class="xp-strip" id="xpStrip" style="cursor:default">${stripInner}</div>`;

  // HERO: lo más importante primero.
  // Fast-track "Tu primer posteo" (Track A/C): si la cuenta NUNCA publicó y hay
  // borradores con foto, la hero es la tarjeta de publicación rápida — reemplaza
  // tanto al autopilot como a la revisión. La condición se auto-resuelve: al
  // publicar por cualquier lado (Mi semana, creador, chat), publishedCount > 0
  // y la tarjeta desaparece sola. Sin flags en el servidor.
  REVIEW_DRAFTS = drafts;
  const weekDone = !w.missing;
  const publishedCount = allPosts.filter(p => p.status === 'published').length;
  const ftCandidates = drafts.slice().sort((a, b) => b.id - a.id).filter(p => p.image_path).slice(0, 3);
  const showFastTrack = publishedCount === 0 && ftCandidates.length > 0;
  const heroCard = showFastTrack && typeof fastTrackCardHTML === 'function' ? fastTrackCardHTML(ftCandidates)
    : draftN > 0 ? reviewCardHTML(drafts, slots, viewingNext ? '📋 Tu próxima semana' : null)
    : weekDone ? weekDoneCardHTML()
    : autopilotCardHTML('semana');
  // Track 4 "Pipeline perpetuo": teaser sutil cuando la semana N está lista y
  // la N+1 ya se armó sola en segundo plano. Toca → la revisa como corriente.
  const nextTeaser = (!viewingNext && draftN === 0 && nextDrafts.length > 0 && weekDone) ? `
  <button class="card" id="nextWeekTeaser" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1.5px solid rgba(39,147,200,.35);background:#F4FAFE;cursor:pointer;margin:0 0 12px">
    <span style="font-size:17.5px">✨</span>
    <span style="flex:1;min-width:0"><b>Tu próxima semana ya está lista</b><br><span style="color:var(--mut);font-size:11.5px">La armamos mientras programabas — tocala para revisarla</span></span>
    <span style="font-size:17.5px;color:var(--cel)">›</span>
  </button>` : '';
  const nextBack = viewingNext ? `
  <div style="margin:-4px 0 10px"><button class="rev-nowsub" id="nextWeekBack" style="padding:0">‹ volver a esta semana</button></div>` : '';
  // Rehacer es acción secundaria: link de texto sutil al pie de la revisión, nunca un botón.
  const redoMini = draftN > 0
    ? `<div style="text-align:center;margin:-8px 0 18px"><button class="rev-redo" data-autopilot="semana">↻ empezar de nuevo</button><div id="apProg-semana"></div></div>`
    : '';
  // Historial fusionado en Mi semana: los fallidos piden acción arriba,
  // los publicados con 👍/👎 quedan abajo como "Ya salió".
  const failed = allPosts.filter(p => p.status === 'failed').sort((a, b) => b.id - a.id);
  const failedCard = failed.length ? `
  <div class="card" style="border:2px solid rgba(214,69,69,.45);background:#FDF3F3">
    <h3 style="margin:0 0 4px">⚠️ ${failed.length} ${failed.length === 1 ? 'posteo no salió' : 'posteos no salieron'}</h3>
    <p style="color:var(--mut);font-size:12.5px;margin:0 0 12px">Reintentalos acá, sin ir a otra pantalla.</p>
    ${failed.map(p => postItem(p, `<button class="btn btn-soft btn-sm" data-act="now" data-id="${p.id}">Reintentar</button><button class="btn btn-ghost btn-sm" data-act="del" data-id="${p.id}" title="Borrar">🗑️</button>`)).join('')}
  </div>` : '';

  // Mi semana es el tablero puro: racha/progreso, posteos, agenda, fotos,
  // misión y historial. El chat vive solo en su pestaña (#/app/chat).
  // 📷 Mis fotos: tira finita arriba de todo (solo si hay fotos/videos). Desde acá se borran.
  const mediaStrip = (assetPhotos().length || assetVideos().length) ? mediaCardHTML() : '';
  const planSlot = weekDone ? '' : `<div id="perfAlert"></div><div id="weeklyPlan"></div>`;
  // Programados: agenda agrupada por día (Hoy / Mañana / día de semana) — qué se viene y cuándo sale.
  const schedTz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
  const schedDayKey = (d) => { try { return d.toLocaleDateString('en-CA', { timeZone: schedTz }); } catch (e) { return ''; } };
  const schedParse = (iso) => {
    const s0 = String(iso || '');
    let s = s0.length === 16 ? s0 : s0.replace(' ', 'T');
    if (s0.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
    return new Date(s);
  };
  const schedTitle = (p) => {
    const t = String(p.source_topic || '').trim();
    if (t) return t;
    const c = String(p.caption || '').split('\n')[0].trim();
    return c ? cortar(c, 60) : 'Posteo';
  };
  const schedGroups = [];
  {
    const todayK = schedDayKey(new Date());
    const tomorrowK = schedDayKey(new Date(Date.now() + 86400000));
    scheduled.forEach(p => {
      const d = schedParse(p.scheduled_at);
      if (isNaN(d)) return;
      const k = schedDayKey(d);
      let g = schedGroups.find(g => g.k === k);
      if (!g) {
        let label;
        if (k === todayK) label = 'Hoy';
        else if (k === tomorrowK) label = 'Mañana';
        else { try { label = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', timeZone: schedTz }); } catch (e) { label = k || ''; } }
        g = { k, label, items: [] };
        schedGroups.push(g);
      }
      g.items.push({ p, d });
    });
  }
  const scheduledStrip = schedGroups.length ? `
  <div class="card sched-card">
    <h3 style="margin:0">📅 Lo que se viene <span style="font-weight:400;color:var(--mut);font-size:11.5px">— sale solo</span></h3>
    ${schedGroups.map(g => `
    <div class="sched-day">
      <div class="sched-daylabel">${esc(g.label)}</div>
      ${g.items.map(({ p, d }) => `
      <div class="sched-item">
        ${p.image_path ? `<img class="sched-thumb" src="${esc(p.image_path)}" alt="">` : `<div class="sched-thumb"></div>`}
        <div style="min-width:0">
          <div class="sched-time">${esc(d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: schedTz }))}</div>
          <div class="sched-title">${esc(schedTitle(p))}</div>
        </div>
      </div>`).join('')}
    </div>`).join('')}
  </div>` : '';
  // Historial "Ya salió": publicados con loop de outcome liviano (punto 4).
  const publishedList = allPosts
    .filter(p => p.status === 'published' && p.published_at)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const salioCard = publishedList.length ? salioCardHTML(publishedList) : '';
  // Tarjeta "Contame de tu negocio" (nota de voz → ADN): vive pegada a la misión de fotos.
  const topBlock = `${xpStrip}${expBanner}${planSlot}${failedCard}${nextTeaser}${nextBack}${heroCard}${redoMini}${scheduledStrip}<div id="inspoCard"></div>${mediaStrip}<div id="missionCard"></div><div id="dnaVoiceCard"></div>${salioCard}`;

  return topBlock;
}

/* ---------- FAST-TRACK "TU PRIMER POSTEO" — integración (Track C) ---------- */
// La tarjeta y el festejo los construye Track A; acá vive el handoff post-publish
// a la nota de voz: cierra el modal de festejo (el que esté abierto) y scrollea
// a la tarjeta "Contame de tu negocio", que ya existe en topBlock (#dnaVoiceCard).
// El festejo NO se duplica acá: esto solo responde al botón del modal.
function fastTrackCloseModals() {
  document.querySelectorAll('.modal-ov').forEach(ov => {
    if (ov.style.display !== 'none') ov.remove();
  });
}
function fastTrackGoToVoice() {
  fastTrackCloseModals();
  const el = document.getElementById('dnaVoiceCard');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// Botón de handoff en voseo para el modal de festejo. Si Track A ya lo incluyó
// en su modal, este HTML no hace falta — el binding delegado igual lo atiende.
function fastTrackVoiceCtaHTML() {
  return `<button class="btn btn-primary btn-block" data-ft-voice style="margin-top:10px">🎙️ Contame de tu negocio</button>`;
}

function bindSemana() {
  bindSignalBtns();
  bindOutcomeBtns(); // loop liviano: ¿este posteo te trajo clientes?
  bindAutopilot();
  bindVaciarDrafts();
  bindReview();
  bindScheduleAll(); // "📅 Programar mi semana →": la semana entera en un tap
  // Track 4 "Pipeline perpetuo": teaser de la próxima semana ya armada.
  const tw = document.getElementById('nextWeekTeaser');
  if (tw) tw.onclick = () => { NEXTWEEK_VIEW = true; render(); };
  const bw = document.getElementById('nextWeekBack');
  if (bw) bw.onclick = () => { NEXTWEEK_VIEW = false; render(); };
  // Fast-track "Tu primer posteo" (Track A): su tarjeta es la hero cuando aplica.
  // Defensivo: si la tarjeta de Track A aún no está definida, queda el flujo normal.
  if (typeof bindFastTrack === 'function') { window.__ftHookedByTrackC = true; bindFastTrack(); }
  // Handoff post-publish → nota de voz: delegación única para el botón
  // "🎙️ Contame de tu negocio" del modal de festejo (funciona aunque Track A
  // agregue el botón después de esta integración).
  if (!window.__ftVoiceBound) {
    window.__ftVoiceBound = true;
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('[data-ft-voice]');
      if (b) { e.preventDefault(); fastTrackGoToVoice(); }
    });
  }
  bindMediaCard(); // tira "Mis fotos": borrar desde acá
  // Misión de fotos semanal
  loadMissionCard().catch(() => {});
  // 🎨 Referencia visual del cliente (inspo): tarjeta prominente, estado hecho si ya hay
  loadInspoCard().catch(() => {});
  // 🎙️ Contame de tu negocio: nota de voz → ADN (pegada a la misión de fotos)
  loadDnaVoiceCard();
  // Sugerencia de serie + alerta honesta de rendimiento
  loadWeeklyPlan().catch(() => {});
  loadPerformanceAlert().catch(() => {});
  // La IA avisa por chat si hay comentarios sin responder (1 vez por día)
  api.post('/api/proactive-comments-ask', {}).then(r => { if (r && r.asked) chatLoadHistory(); }).catch(() => {});
  // Festejo de primera publicación (una vez por cuenta): se chequea al entrar a Mi semana
  setTimeout(() => maybeFirstPublishCelebration(), 1200);
  setTimeout(() => maybeMilestoneCelebration(), 2600);
  // Track A · Fast-track "Tu primer posteo": la visibilidad la decide Track C
  // (heroCard → fastTrackCardHTML); este hook solo cablea, y es no-op sin la tarjeta.
  // Si Track C ya lo cableó (window.__ftHookedByTrackC), no se duplica.
  if (typeof bindFastTrack === 'function' && !window.__ftHookedByTrackC) bindFastTrack();
  const xs = $('#xpStrip');
  if (xs) xs.onclick = async () => {
    try { const sk = await api.get('/api/streak'); if (sk && sk.current > 0) streakPillModal(sk); } catch (e) {}
  };
  // Nivel de la MARCA en la tira (logo del cliente): se llena async.
  try { paintBrandStrip(); } catch (e) {}
  // Track 3 · "La semana esperándote al entrar": si la semana está vacía y ya
  // tenemos los datos del negocio, se arma sola en segundo plano. No bloquea el binding.
  // Si el usuario toca "⚡ Armemos tu semana" a mano mientras el auto corre, el flag
  // AUTOPILOT_RUNNING ya ignora el tap; acá solo ocultamos el aviso para no confundir.
  if (!window.__autoWeekTapBound) {
    window.__autoWeekTapBound = true;
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('[data-autopilot]');
      if (b && window.__autoWeekRunning) { window.__autoWeekRunning = false; autoWeekHideBar(); }
    });
  }
  maybeAutoStartWeek();
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
    // Mismos datos que calcula semanaView: borradores, programados y publicados.
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
function ajustesView() {
  const p = PROFILE, s = SETTINGS;
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const openSec = q.get('plan') ? 'plan' : q.get('ig') ? 'ig' : 'marca';
  const igMsg = q.get('ig') === 'ok' ? `<div class="okmsg">✅ Instagram conectado: @${esc(p.ig_username)}</div>`
    : q.get('ig') === 'error' ? `<div class="err">❌ ${esc(q.get('msg') || 'Error al conectar')}</div>` : '';
  const planMsg = q.get('plan') === 'ok' ? `<div class="okmsg" id="planConfirmMsg">⏳ Confirmando tu pago con MercadoPago…</div>`
    : q.get('plan') === 'pending' ? `<div class="okmsg">⏳ Tu pago está en proceso. Te avisamos cuando se acredite.</div>`
    : q.get('plan') === 'error' ? `<div class="err">❌ El pago no se completó. Si fue por el email, tocá <b>Suscribirse</b> de nuevo y fijate que sea el mismo de tu cuenta de MercadoPago.</div>` : '';
  const tokenWarn = s.ig_token_warning ? `<div class="err" style="margin-bottom:18px">⚠️ <b>Tu conexión con Instagram necesita atención:</b> no pudimos renovar tu token automáticamente. Reconectá tu cuenta abajo.</div>` : '';
  const bc = brandColors();
  return `<div class="page-head"><div class="ph-ico">⚙️</div><div class="ph-txt"><h1>Ajustes</h1><p class="sub">Tu marca, tu negocio, tu Instagram y tu plan.</p></div></div>
  ${igMsg}${planMsg}${tokenWarn}
  <div class="card ajsec${openSec==='marca' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🎨 Mi marca</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:16px">Acá definís tu logo y tus colores: todo lo que generemos sale con tu identidad.</p>
    <div class="row2">
      <div class="field"><label>Logo</label>
        <div style="display:flex;gap:10px;align-items:center">
          ${assetLogo() ? `<img src="${assetLogo().file_path}" style="max-height:48px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px">` : '<span style="color:var(--dim);font-size:12.5px">Sin logo</span>'}
          <button class="btn btn-ghost btn-sm" id="btnBrandLogo">📤 ${assetLogo() ? 'Cambiar' : 'Subir'}</button>
          ${assetLogo() ? '<button class="btn btn-ghost btn-sm" id="btnBrandLogoDel">🗑️ Quitar</button>' : ''}
        </div>
        <input type="file" id="s_logofile" accept="image/*,.pdf,.docx" style="display:none">
        <div class="hint" style="font-size:10.5px;color:var(--dim);margin-top:6px">Aceptamos imagen, PDF o Word.</div>
      </div>
    </div>
    <div class="field"><label>Colores de tu marca <span style="color:var(--dim);font-weight:400">(con 2 alcanza para activar "Mi marca")</span></label>
      <div style="font-size:10.5px;color:var(--dim);margin:0 0 10px">Tocá el rol de cada color para reordenarlos ↕</div>
      <div style="display:flex;gap:10px">
        ${[0, 1, 2].map(i => `
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <input type="color" id="s_c${i}" value="${bc[i] || NEUTRAL_TRIO[i]}" style="width:56px;height:44px;border:1px solid var(--line);border-radius:12px;padding:4px;background:#fff;cursor:pointer">
          <input type="text" id="s_h${i}" value="${(bc[i] || NEUTRAL_TRIO[i]).toUpperCase()}" maxlength="7" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="#000000" style="width:88px;text-align:center;font-size:16px;font-family:monospace;padding:6px 4px;border:1px solid var(--line);border-radius:8px;text-transform:uppercase">
          <div style="position:relative">
            <select id="s_r${i}" aria-label="Rol del color ${i + 1}: tocá para reordenar" style="appearance:none;-webkit-appearance:none;font-size:16px;font-weight:700;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:9px 30px 9px 14px;background:#F2F9FD;max-width:150px;cursor:pointer">
              ${['Principal', 'Secundario', 'Acento'].map((r, ri) => `<option value="${ri}"${ri === i ? ' selected' : ''}>${r}</option>`).join('')}
            </select>
            <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--dim);pointer-events:none">⌄</span>
          </div>
        </div>`).join('')}
      </div>
      <div class="hint">Subí tu logo y detectamos tus colores automáticamente, o elegilos a mano tocando el color o escribiendo su código. Con el menú de cada color elegís si es Principal, Secundario o Acento: se reordenan solos. El principal domina los diseños, el secundario lo acompaña y el acento va en botones y detalles.</div>
    </div>
    <div class="field"><label>Vista previa</label>
      <div id="brandPrev"></div>
      <div class="hint">Así se ve tu marca en tus posteos. Se actualiza sola cuando cambiás los colores.</div>
    </div>
    <div class="field"><label>Foto de perfil</label>
      <div style="display:flex;gap:12px;align-items:center">
        <div class="brand-pf" id="brandPf"></div>
        <div class="hint" style="margin:0">Así se ve tu logo recortado en círculo, como foto de perfil de Instagram.</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnSaveBrand">Guardar marca</button> <span id="brandMsg"></span>
      <span id="brandDirty" style="display:none;color:var(--yel);font-size:11.5px;font-weight:700">● Tenemos cambios sin guardar</span>
    </div>
    <div style="margin-top:10px"><button class="linklike" id="btnResetBrand" style="font-size:11.5px;color:var(--mut);text-decoration:underline;background:none;border:0;cursor:pointer;padding:0">Reiniciar todo</button></div>
  </div></div>
  <div class="card ajsec${openSec==='negocio' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🏪 Tu negocio</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
  <p style="color:var(--mut);font-size:12.5px;margin:-6px 0 14px">🤖 La IA usa estos datos para crear tus posteos.</p>
    <div class="row2">
      <div class="field"><label>Nombre del negocio</label><input id="s_biz" value="${esc(p.business_name)}" placeholder="Mi Tienda"></div>
      <div class="field"><label>Usuario de Instagram</label><input id="s_iguser" value="${esc(p.ig_username)}" placeholder="tu_usuario" ${p.ig_connected ? 'disabled' : ''}>${p.ig_connected ? '<div class="hint">✓ Cuenta conectada — se actualiza sola</div>' : ''}</div>
    </div>
    <div class="row2">
      <div class="field"><label>Rubro</label><select id="s_cat">
        ${CATS.map(([v, ico, t]) => `<option ${catSel(p.category) === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
      </select></div>
      <div class="field" id="s_catother_w" style="${catSel(p.category) === 'otro' ? '' : 'display:none'}"><label>¿Cuál?</label><input id="s_catother" value="${esc(catCustom(p.category))}" placeholder="Ej: veterinaria, librería..." maxlength="40"></div>
      <div class="field"><label>Tono de la IA</label><select id="s_tone">
        ${TONES.map(([v, ico, t]) => `<option ${p.tone === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
      </select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Zona horaria <span style="color:var(--dim);font-weight:400">(para programar a la hora de tu país)</span></label><select id="s_tz">
        ${TIMEZONES.map(([v, l]) => `<option ${s.timezone === v ? 'selected' : ''} value="${v}">${l}</option>`).join('')}
      </select></div>
      <div class="field"><label>Objetivo</label><select id="s_goal">
        ${GOALS.map(([v, ico, t]) => `<option ${p.goal === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
      </select></div>
    </div>
    <div class="field"><label>Descripción (para que la IA te conozca)</label><textarea id="s_desc" maxlength="600" placeholder="Vendemos ropa urbana para jóvenes en Palermo...">${esc(p.description)}</textarea>
      <div class="hint"><span id="s_desc_n">${(p.description || '').length}</span>/600 · Mientras más nos cuentes, mejores ideas creamos por vos.</div>
      </div>
    <div class="field"><label>Tus competidores</label>
      <div class="comp-box" id="s_compbox"><div class="comp-chips" id="s_chips"></div><input id="s_compin" name="compinput" placeholder="＋ Agregar competidor…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" readonly onfocus="this.removeAttribute('readonly')"></div>
      <div class="hint" id="compHint" style="display:none;color:#e5484d"></div>
      <div class="hint">Los estudiamos para crear ideas que te hagan destacar.</div></div>
    <div class="field" style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
      <label style="font-size:13px">🧬 Lo que la IA sabe de tu negocio</label>
      <div class="hint" style="margin:-6px 0 12px">Completá lo que quieras: la IA lo usa para crear posteos que venden de verdad.</div>
      <div class="field"><label>Productos <span id="dnaChip_productos"></span> <span style="color:var(--dim);font-weight:400">(uno por línea: nombre — precio)</span></label>
        <textarea id="s_dna_productos" rows="3" placeholder="Remera oversize — $25.000&#10;Zapatillas retro — $89.900"></textarea></div>
      <div class="field"><label>Promos activas <span id="dnaChip_promos_activas"></span> <span style="color:var(--dim);font-weight:400">(una por línea)</span></label>
        <textarea id="s_dna_promos" rows="2" placeholder="2x1 en remeras esta semana"></textarea></div>
      <div class="row2">
        <div class="field"><label>Horarios <span id="dnaChip_horarios"></span></label><input id="s_dna_horarios" placeholder="Lun a Sáb 10 a 20 hs" autocomplete="off"></div>
        <div class="field"><label>Ubicación <span id="dnaChip_ubicacion"></span></label><input id="s_dna_ubicacion" placeholder="Palermo, CABA" autocomplete="off"></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-soft" id="btnSaveDna">💾 Guardar datos del negocio</button> <span id="dnaMsg"></span>
      </div>
      <div id="webDnaZone"></div>
      <div id="dnaFuentesZone"></div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnSaveProfile">Guardar</button> <span id="profMsg"></span>
      <span id="profDirty" style="display:none;color:var(--yel);font-size:11.5px;font-weight:700">● Tenemos cambios sin guardar</span>
      <button class="btn btn-ghost btn-sm" id="btnOnb">🧭 Retomar guía inicial</button>
      <button class="btn btn-ghost btn-sm" id="btnPreview">👁 Vista previa</button>
    </div>
  </div></div>
  <div class="card ajsec${openSec==='web' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🌐 La web de tu negocio</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="webZone"><p style="color:var(--dim)">Cargando…</p></div>
  </div></div>
  <div id="srcStoriesCard" class="card ajsec${openSec==='stories' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>📱 Tus historias recientes</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="storiesZone"><p style="color:var(--dim)">Cargando…</p></div>
  </div></div>
  <div id="srcFbCard" class="card ajsec${openSec==='fb' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>📘 Tu página de Facebook</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="fbZone"><p style="color:var(--dim)">Cargando…</p></div>
  </div></div>
  <div class="card ajsec"><div class="ajsec-h" role="button" tabindex="0"><h3>💬 Lo que preguntan tus seguidores</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="srcCommentsCard"><p style="color:var(--dim)">Cargando…</p></div>
  </div></div>
  <div id="srcPlacesCard" class="card ajsec${openSec==='places' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>⭐ Lo que dicen tus clientes</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="placesZone"><p style="color:var(--dim)">Cargando…</p></div>
  </div></div>
  <div class="card ajsec${openSec==='ig' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>📸 Instagram</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="igBanner"></div>
    <div class="ig-checklist">
      <div class="t">Tu Instagram está listo cuando:</div>
      <div class="ig-check ${(p.ig_connected && p.ig_username) ? 'ok' : ''}">${(p.ig_connected && p.ig_username) ? '✅' : '⬜'} Cuenta profesional conectada</div>
      <div class="ig-check ${!s.demo_mode ? 'ok' : ''}">${!s.demo_mode ? '✅' : '⬜'} Modo demo apagado</div>
      <div class="ig-check ${IG_VERIFIED_AT ? 'ok' : ''}">${IG_VERIFIED_AT ? '✅' : '⬜'} Conexión verificada${IG_VERIFIED_AT ? ` <span style="color:var(--dim);font-weight:400">(${IG_VERIFIED_AT})</span>` : ''}</div>
    </div>
    <div style="font-weight:800;margin-bottom:8px">Modo de publicación</div>
    <div class="ig-modes">
      <div class="ig-mode ${s.demo_mode ? 'sel' : ''}" id="igModeDemo" role="button" tabindex="0">
        <div class="ig-mode-h">🧪 Demo ${s.demo_mode ? '<span class="ig-mode-on">● Activo</span>' : ''}</div>
        <span>Simulamos todo: probá el flujo completo sin conectar nada.</span>
      </div>
      <div class="ig-mode ${!s.demo_mode ? 'sel' : ''}" id="igModeReal" role="button" tabindex="0">
        <div class="ig-mode-h">🚀 Real ${!s.demo_mode ? '<span class="ig-mode-on">● Activo</span>' : ''}</div>
        <span>Publicamos en tu Instagram de verdad.</span>
      </div>
    </div>
    ${IG_MODE_WARN ? `<div class="ig-warn" style="margin-bottom:14px">⚠️ Elegiste el modo <b>Real</b> pero todavía no conectaste tu Instagram. Conectalo abajo para publicar de verdad.</div>` : ''}
    <div class="set-row"><div><div class="t">Cuenta conectada</div>
      <div class="d">${p.ig_connected ? `✅ @${esc(p.ig_username)} — lista para publicar${igSince(s) ? ` · conectada el ${igSince(s)}` : ''} · <a href="https://www.instagram.com/${esc(p.ig_username)}/" target="_blank" rel="noopener" style="color:var(--cel);font-weight:700">ver perfil</a>` : 'Todavía no conectaste tu Instagram. Necesitás una <b>cuenta profesional</b> (Business o Creator). <a href="#" id="igProLink" style="color:var(--cel);font-weight:700">¿Cómo la hago profesional?</a>'}</div>
      <div class="hint" style="margin-top:6px">🔒 Posta puede publicar fotos y videos, y leer tu perfil. Nunca vemos ni guardamos tu contraseña.${p.ig_connected ? '<br>🔑 Si cambiás tu contraseña de Instagram, reconectá tu cuenta acá para que los posteos sigan saliendo.' : ''}</div></div>
      ${p.ig_connected ? `<div style="display:flex;gap:8px;flex-wrap:wrap;flex:none"><button class="btn btn-soft btn-sm" id="btnIgVerify">🔍 Verificar conexión</button><button class="btn btn-danger btn-sm" id="btnIgDisc">Desconectar</button></div>` : `<button class="btn btn-primary btn-sm" id="btnIgConn">Conectar Instagram</button>`}
    </div>
    <div id="igVerifyMsg" style="margin-top:10px"></div>
    <div id="igProGuide" style="display:none;margin-top:4px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#F2F9FD">
      <div style="font-weight:800;margin-bottom:10px">📲 Hacé tu cuenta profesional <span style="font-weight:400;color:var(--dim);font-size:11.5px">(gratis, 30 segundos)</span></div>
      <ol style="margin:0 0 12px 20px;padding:0;font-size:12.5px;color:var(--mut);line-height:1.8">
        <li>Abrí Instagram y andá a tu perfil</li>
        <li>Tocá <b>☰</b> → <b>Configuración y privacidad</b></li>
        <li><b>Tipo de cuenta y herramientas</b> → <b>Cambiar a cuenta profesional</b></li>
        <li>Elegí <b>Creator</b> o <b>Business</b> y completá los pasos</li>
      </ol>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn-soft btn-sm" href="https://www.instagram.com/" target="_blank" rel="noopener">📲 Abrir Instagram</a>
        <button class="btn btn-primary btn-sm" id="btnIgRetry">🔄 Ya la hice profesional — conectar</button>
      </div>
      <div class="hint" style="margin-top:8px">Instagram no permite hacer este cambio desde otra app: se hace dentro de Instagram, por eso te llevamos hasta ahí.</div>
    </div>
    <div id="igMsg"></div>
  </div></div>
  <div class="card card-hi-yl ajsec${openSec==='plan' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>💳 Mi plan</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="planZone"><p style="color:var(--dim)">Cargando...</p></div>
  </div></div>
  <div class="card card-hi-cel ajsec${openSec==='referidos' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🎁 Referidos · 50% off</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="refZone"><p style="color:var(--dim)">Cargando...</p></div>
  </div></div>
  <div class="card ajsec"><div class="ajsec-h" role="button" tabindex="0"><h3>🔔 Notificaciones</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:14px">Te aviso en el celu cuando tu posteo salga publicado y cuando tu semana esté lista para revisar. Sin spam, lo prometo 🤙</p>
    <div id="pushZone"><p style="color:var(--dim)">Cargando...</p></div>
  </div></div>
  <details class="card int-advanced"><summary>⚙️ Configuración avanzada</summary>
    <p class="hint" style="margin:12px 0">Solo si necesitás conectar tu propia app de Meta. La mayoría no tiene que tocar nada acá.</p>
    <div class="int-block"><h4>📸 App de Meta</h4>
      <div class="row2">
        <div class="field"><label>Meta App ID</label><input id="s_appid" value="${esc(s.meta_app_id)}" placeholder="123456789">
          <p class="hint">El número identificador de tu app en Meta.</p></div>
        <div class="field"><label>Meta App Secret</label><input id="s_appsecret" type="password" value="${esc(s.meta_app_secret)}" placeholder="••••••">
          <p class="hint">La clave secreta de tu app. Nunca la compartas.</p></div>
      </div>
      <p class="hint">Los encontrás en <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a> → tu app → Configuración.</p>
      <div class="field" style="margin-top:10px"><button class="btn btn-ghost" id="btnTestMeta" type="button">Probar conexión</button> <span id="metaTestMsg" style="font-size:11.5px"></span></div>
      <div class="field"><label>Instagram Embed URL</label>
        <input id="s_igembed" value="${esc(s.ig_embed_url)}" placeholder="https://www.instagram.com/oauth/authorize?...">
        <p class="hint">La dirección que Meta genera para conectar tu Instagram. Se copia del dashboard de Meta: caso de uso Instagram → "API setup with Instagram login".</p></div>
    </div>
    <button class="btn btn-primary" id="btnSaveSettings">Guardar</button> <span id="setMsg"></span>
  </details>
  <div class="card" style="margin-top:16px"><button class="btn btn-danger btn-block" id="btnLogoutAj">🚪 Salir</button></div>`;
}

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
      <p class="pz-exp-sub">Así Posta deja tu semana lista para publicar.</p>
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
    location.hash = chosenPlan ? '#/app/ajustes?plan_sel=' + encodeURIComponent(chosenPlan) : '#/app/semana';
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
    <div style="text-align:center;margin-top:14px"><a href="#/app/semana" style="color:var(--dim);font-size:12.5px">Hacerlo después →</a></div>
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
        <a href="#/app/semana" style="color:var(--dim);font-size:11.5px;font-weight:600;white-space:nowrap">Hacerlo después →</a>
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
    const r = new URLSearchParams(location.search).get('ref');
    if (r) {
      const clean = String(r).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      if (clean) localStorage.setItem('posta_ref', clean);
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
      fetch('/api/capacity').then(r => r.json()).then(c => {
        const el = document.getElementById('scarcityLine');
        if (el && c && typeof c.spots_left === 'number') el.innerHTML = `🔥 Quedan <b>${c.spots_left} lugares</b> — cada negocio lleva trabajo personalizado.`;
      }).catch(() => {});
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
    return;
  }

  // App (requiere login)
  LANDING_ON = false;
  await refreshSession();
  if (!ME && NET_OFFLINE) { root.innerHTML = offlineView(); bindOffline(); return; }
  if (!ME) { location.hash = '#/login'; return; }
  const tabRaw = path.split('/')[2] || '';
  // Chat-first en todas las plataformas: sin pestaña explícita se abre el
  // chat con Posty. Con pestaña explícita se respeta (navegación secundaria).
  let tab = tabRaw || 'chat';
  let content = '';
  if (tab === 'chat') content = await chatView();
  else if (tab === 'semana') content = await semanaView();
  else if (tab === 'crear') { location.hash = '#/app/semana'; return; } // Creador manual fusionado en Mi semana
  else if (tab === 'ideas') { location.hash = '#/app/semana'; return; } // Ideas se fusionó en Mi semana
  else if (tab === 'video') { location.hash = '#/app/semana'; return; } // Creador manual de video eliminado: el reel lo arma el autopilot
  else if (tab === 'fotos') { location.hash = '#/app/ajustes'; return; } // Mis fotos vive en Ajustes > Mi marca
  else if (tab === 'onboarding') { if (!OB) OB = loadOB() || freshOB(); content = onboardingView(); }
  else if (tab === 'calendario') { location.hash = '#/app/semana'; return; } // Calendario fusionado en Mi semana
  else if (tab === 'historial') { location.hash = '#/app/semana'; return; } // Historial fusionado en Mi semana
  else if (tab === 'ads') content = await adsView(); // 🚀 Potenciar: billetera + boost de posteos
  else if (tab === 'admin') content = await adminView(); // 📊 Analytics (solo equipo)
  else content = ajustesView();
  root.innerHTML = appShell(tab, content);
  bindApp(tab);
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
  // Modal agresivo: trial vencido (una vez por sesión; no molesta en Mi plan)
  try {
    if (ME && ME.trial_expired && ME.plan_status === 'trial' && tab !== 'ajustes' && !sessionStorage.getItem('pz_exp_modal')) {
      showExpiredModal();
    }
  } catch (e) {}
}

/* ---------- Modal agresivo: trial vencido ---------- */
async function showExpiredModal() {
  if (document.getElementById('pzExpOverlay')) return;
  trackOnce('expmodal', 'trial_expired_view');
  let plans = [];
  try { const d = await api.get('/api/billing/plans'); plans = d.plans || []; } catch (e) {}
  const perDay = (p) => '\u2248 $' + Math.round(p.price / 30).toLocaleString('es-AR') + ' por d\u00eda';
  const rows = plans.map(p => `
    <button class="pz-exp-plan" data-exp-plan="${p.id}">
      <span><b>${esc(p.name)}</b><small>${esc(p.price_label)}/mes \u00b7 ${perDay(p)}</small></span>
      <span class="pz-exp-go">Elegir \u2192</span>
    </button>`).join('');
  const ov = document.createElement('div');
  ov.id = 'pzExpOverlay';
  ov.className = 'pz-exp-overlay';
  ov.innerHTML = `
    <div class="pz-exp-modal" role="dialog" aria-modal="true">
      <button class="pz-exp-x" id="pzExpClose" aria-label="Cerrar">\u2715</button>
      <img src="ai-avatar.png" alt="Posty" style="width:74px;height:74px;border-radius:50%;box-shadow:0 4px 14px rgba(39,147,200,.35)">
      <h2>Tu prueba gratis termin\u00f3</h2>
      <p class="pz-exp-sub">Elegí tu plan y seguimos publicando por vos.</p>
      <div class="pz-exp-plans">${rows}</div>
      ${plans.length ? '' : '<button class="btn btn-primary btn-block" id="pzExpGo">Ver planes 🚀</button>'}
      <button class="pz-exp-later" id="pzExpLater">Por ahora no</button>
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

function bindApp(tab) {
  if (tab === 'ajustes') trackOnce('settings', 'settings_open');
  if (tab === 'admin') bindAdmin();
  if (tab === 'chat') bindChatView(); // chat-first mobile: el chat es el home
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
  const sg = $('#setupIgRow');
  if (sg) sg.onclick = igConnectHere;
  const sb = $('#setupBizRow');
  if (sb) sb.onclick = () => location.hash = '#/app/ajustes';
  const loA = $('#btnLogoutAj');
  if (loA) loA.onclick = async () => { await api.post('/api/auth/logout'); location.hash = '#/'; };
  const bg = $('#mtopBurger');
  if (bg) bg.onclick = openDrawer;
  const dov = $('#drawerOv');
  if (dov) dov.onclick = closeDrawer;
  try { paintDrawerIdent(); } catch (e) {}
  $$('.drawer-plan').forEach(a => { a.onclick = () => closeDrawer(); });
  const dlo = $('#drawerLogout');
  if (dlo) dlo.onclick = async () => { closeDrawer(); await api.post('/api/auth/logout'); location.hash = '#/'; };

  if (tab === 'semana') bindSemana();
  if (tab === 'ads') bindAds();
  if (tab === 'onboarding') bindOnboarding();
  if (tab === 'semana') {
    $$('[data-act]').forEach(b => b.onclick = async () => {
      const id = b.dataset.id, act = b.dataset.act;
      if (act === 'cancel' && !confirm('¿Cancelar este post?')) return;
      if (act === 'del') {
        if (!confirm('¿Borrar este posteo del historial?')) return;
        await api.delete(`/api/posts/${id}`);
        render(); return;
      }
      if (act === 'dup') {
        try {
          await api.post(`/api/posts/${id}/duplicate`, {});
        } catch (e) {
          if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); return; }
          throw e;
        }
        location.hash = '#/app/semana'; return;
      }
      if (act === 'sched') {
        const inp = $(`#sched-${id}`);
        if (!inp || !inp.value) { alert('Elegí fecha y hora'); return; }
        await api.patch(`/api/posts/${id}`, { scheduled_at: new Date(inp.value).toISOString() });
        render(); return;
      }
      if (act === 'now') {
        b.disabled = true; // bloquea el doble tap
        const actsEl = b.closest('.post-item').querySelector('.acts');
        actsEl.innerHTML = '<div class="pubnow-mount"></div>';
        await publishNowFlow(id, actsEl.querySelector('.pubnow-mount'));
        render();
        return;
      }
      await api.patch(`/api/posts/${id}`, { action: 'cancel' });
      render();
    });
    bindSignalBtns();
    // Tap en el caption expande/colapsa el texto completo
    $$('.post-item').forEach(item => {
      const cap = item.querySelector('[data-cap]');
      const full = item.querySelector('.full-cap');
      if (!cap || !full) return;
      const toggle = () => {
        const open = full.style.display !== 'none';
        full.style.display = open ? 'none' : 'block';
        cap.style.display = open ? 'block' : 'none';
      };
      cap.onclick = toggle;
      full.onclick = toggle;
    });
    // Tap en la miniatura abre el diseño en grande
    $$('.post-item [data-lightbox]').forEach(el => el.onclick = (e) => {
      e.stopPropagation();
      openLightbox(el.dataset.lightbox, el.dataset.video === '1');
    });
  }
  if (tab === 'ajustes') bindSettings();
}

function bindCreator() {
  const c = CREATOR;
  if (c.step === 1) {
    // 📷 Foto del producto (opcional): se sube al momento y viaja como productPhoto.
    const renderProdBox = () => {
      const box = $('#c_prodPhotoBox');
      if (!box) return;
      box.innerHTML = c.productPhoto
        ? `<div style="display:flex;gap:10px;align-items:center">
            <img src="${esc(c.productPhoto)}" style="width:72px;height:90px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" alt="Foto de tu producto">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" id="btnProdPhCh" type="button">Cambiar</button>
              <button class="btn btn-ghost btn-sm" id="btnProdPhRm" type="button">Quitar</button>
            </div>
          </div>`
        : `<div style="display:flex;gap:8px;flex-wrap:wrap">
             <button class="btn btn-ghost" id="btnProdPhAdd" type="button">📷 Agregar foto de tu producto</button>
             ${assetPhotos().length ? `<button class="btn btn-ghost" id="btnProdPhLib" type="button">🖼️ Tus fotos</button>` : ''}
           </div>
           <div id="prodPhLib" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
             ${assetPhotos().map(a => `<img src="${esc(a.file_path)}" data-prodpick="${esc(a.file_path)}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:2px solid var(--line);cursor:pointer" alt="Tu foto">`).join('')}
           </div>
           <div id="prodPhMsg"></div>`;
      const trig = () => $('#c_prodPhotoFile').click();
      const bAdd = $('#btnProdPhAdd'); if (bAdd) bAdd.onclick = trig;
      const bLib = $('#btnProdPhLib'); if (bLib) bLib.onclick = () => { const l = $('#prodPhLib'); if (l) l.style.display = l.style.display === 'none' ? 'flex' : 'none'; };
      $$('#prodPhLib [data-prodpick]').forEach(img => img.onclick = () => { c.productPhoto = img.dataset.prodpick; renderProdBox(); });
      const bCh = $('#btnProdPhCh'); if (bCh) bCh.onclick = trig;
      const bRm = $('#btnProdPhRm'); if (bRm) bRm.onclick = () => { c.productPhoto = ''; renderProdBox(); };
    };
    const prodInput = $('#c_prodPhotoFile');
    if (prodInput) prodInput.onchange = async () => {
      const f = prodInput.files[0]; if (!f) return;
      if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
      const msg = $('#prodPhMsg');
      if (msg) msg.innerHTML = `<div class="hint">⏳ Subiendo foto...</div>`;
      try {
        const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
        c.productPhoto = data.path;
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      } catch (e) {
        alert('No se pudo subir la foto: ' + e.message);
      }
      renderProdBox();
    };
    renderProdBox();
    $$('[data-chip]').forEach(b => b.onclick = () => { const t = $('#c_topic'); if (t) { t.value = b.dataset.chip; t.focus(); } });
    $('#btnGen').onclick = async () => {
      c.topic = $('#c_topic').value.trim();
      if (!c.topic) {
        // Sin idea del usuario: Posta decide con los datos del negocio
        const p = (typeof PROFILE !== 'undefined' && PROFILE) || {};
        c.topic = [p.business_name, p.category].filter(Boolean).join(' — ') || 'Posteo para mi negocio';
      }
      const btn = $('#btnGen');
      btn.disabled = true; btn.textContent = '🎨 Armándo tus 6 opciones...';
      try {
        const out = await api.post('/api/creator/options', { topic: c.topic, productPhoto: c.productPhoto || undefined });
        if (!out || !Array.isArray(out.options) || out.options.length !== 6) throw new Error('Respuesta incompleta');
        c.options = out.options;
        c.detected = out.detected || null;
        c.recommendedIndex = out.recommendedIndex || 0;
        c.recommendedReason = out.recommendedReason || '';
        c.feedback = '';
        c.selected = [];
        c.cardPhoto = {};
        c.step = 'options'; render();
      } catch (e) {
        // Fallback al comportamiento viejo (pantalla de texto con caption/hashtags)
        try {
          const out = await api.post('/api/generate', { topic: c.topic });
          c.caption = out.caption; c.hashtags = out.hashtags;
          $('#genErr').innerHTML = '';
          $('#genOut').style.display = 'block';
          $('#c_caption').value = c.caption; $('#c_tags').value = c.hashtags;
        } catch (e2) { $('#genErr').innerHTML = `<div class="err">${esc(e2.message)}</div>`; }
        btn.disabled = false; btn.textContent = '✨ Armar mi posteo';
      }
    };
    const toDesign = $('#btnToDesign');
    if (toDesign) toDesign.onclick = () => {
      c.caption = $('#c_caption').value; c.hashtags = $('#c_tags').value;
      if (!c.title) c.title = c.topic.split(' ').slice(0, 4).join(' ').toUpperCase();
      if (!c.palTouched) c.pal = defaultPal();
      c.step = 2; render();
    };
  }
  if (c.step === 2) {
    const cv = $('#postCanvas');
    const redraw = async () => {
      const pi = await photoImg(c.photo);
      const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
      drawPost(cv, { tpl: c.tpl, pal: c.pal, title: $('#d_title').value, subtitle: $('#d_sub').value, handle: $('#d_handle').value, photoImg: pi, logoImg: logo });
    };
    ['d_title', 'd_sub', 'd_handle'].forEach(id => $('#' + id).oninput = () => {
      c.title = $('#d_title').value; c.subtitle = $('#d_sub').value; c.handle = $('#d_handle').value; redraw();
    });
    $$('.tpl').forEach(t => t.onclick = () => { c.tpl = t.dataset.tpl; render(); });
    $$('.pal').forEach(p => p.onclick = () => { c.pal = +p.dataset.pal; c.palTouched = true; render(); });
    const fp = $('#d_photo');
    if (fp) {
      const pick = () => fp.click();
      const bAdd = $('#btnPhotoAdd'); if (bAdd) bAdd.onclick = pick;
      const bCh = $('#btnPhotoCh'); if (bCh) bCh.onclick = pick;
      const bRm = $('#btnPhotoRm'); if (bRm) bRm.onclick = () => { c.photo = ''; render(); };
      const bLib = $('#btnPhotoLib');
      if (bLib) bLib.onclick = () => { const z = $('#photoLib'); z.style.display = z.style.display === 'none' ? 'flex' : 'none'; };
      $$('#photoLib [data-lib]').forEach(im => im.onclick = () => { c.photo = im.dataset.lib; render(); });
      // Modo carrusel: multi-selección de 2 a 10 fotos con numerito de orden
      const bCar = $('#btnCarousel');
      if (bCar) bCar.onclick = () => { c.carouselMode = true; c.carouselPhotos = []; render(); };
      const bCarOff = $('#btnCarouselOff');
      if (bCarOff) bCarOff.onclick = () => { c.carouselMode = false; c.carouselPhotos = []; render(); };
      $$('#photoLib [data-carlib]').forEach(el => el.onclick = () => {
        const p = el.dataset.carlib;
        const i = c.carouselPhotos.indexOf(p);
        if (i >= 0) c.carouselPhotos.splice(i, 1);
        else { if (c.carouselPhotos.length >= 10) return; c.carouselPhotos.push(p); }
        render();
      });
      fp.onchange = () => {
        const f = fp.files[0]; if (!f) return;
        if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
        const r = new FileReader();
        r.onload = () => { c.photo = r.result; render(); };
        r.readAsDataURL(f);
      };
    }
    c.title = $('#d_title').value; c.subtitle = $('#d_sub').value; c.handle = $('#d_handle').value;
    redraw();
    $('#btnBack1').onclick = () => { c.step = 1; render(); };
    $('#btnSaveDesign').onclick = async () => {
      // Modo carrusel: sin diseño canvas, las fotos van directo como slides
      if (c.carouselMode) {
        if (c.carouselPhotos.length < 2) {
          const e = $('#carErr');
          if (e) e.innerHTML = `<div class="err" style="margin-top:8px">Elegí al menos 2 fotos para el carrusel.</div>`;
          return;
        }
        c.imagePath = c.carouselPhotos[0]; c.isCarousel = true; c.step = 3; render(); return;
      }
      $('#btnSaveDesign').disabled = true; $('#btnSaveDesign').textContent = '⏳ Guardando...';
      try {
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        c.imagePath = data.path; c.fromOptions = false; c.step = 3; render();
      } catch (e) { alert('Error: ' + e.message); $('#btnSaveDesign').disabled = false; $('#btnSaveDesign').textContent = 'Guardar diseño →'; }
    };
  }
  if (c.step === 'options') {
    $$('.opt-use').forEach(b => b.onclick = () => {
      const o = c.options[+b.dataset.use]; if (!o) return;
      c.imagePath = o.image; c.caption = o.caption || ''; c.hashtags = o.hashtags || '';
      c.fromOptions = true;
      c.step = 3; render();
    });
    $$('.opt-customlink').forEach(b => b.onclick = () => {
      const o = c.options[+b.dataset.custom]; if (!o) return;
      c.title = o.title || ''; c.subtitle = o.subtitle || ''; c.caption = o.caption || '';
      c.hashtags = o.hashtags || ''; c.photo = o.image || '';
      c.tpl = 'gradiente'; c.pal = defaultPal(); c.palTouched = false;
      c.step = 2; render();
    });
    const applyOptions = (out) => {
      c.options = out.options; c.detected = out.detected || null;
      c.recommendedIndex = out.recommendedIndex || 0;
      c.recommendedReason = out.recommendedReason || '';
      c.selected = []; c.cardPhoto = {};
      render();
    };
    // ---- Selección múltiple ----
    function updateMultiBar() {
      const n = c.selected.length;
      const bar = $('#multiBar');
      if (!bar) return;
      bar.style.display = n ? 'flex' : 'none';
      $('#multiCount').textContent = `✅ ${n} elegido${n === 1 ? '' : 's'}`;
      $('#btnMultiSched').textContent = `Programar (${n})`;
    }
    $$('.opt-selbox').forEach(ch => ch.onchange = () => {
      const i = +ch.dataset.sel;
      c.selected = c.selected.filter(x => x !== i);
      if (ch.checked) { c.selected.push(i); c.selected.sort((a, b) => a - b); }
      const card = document.querySelector(`[data-card="${i}"]`);
      if (card) card.classList.toggle('selected', ch.checked);
      updateMultiBar();
    });
    // ---- Detalle en grande (tap en la imagen) ----
    $$('.opt-img').forEach(im => im.onclick = () => {
      const o = c.options[+im.dataset.optimg]; if (!o) return;
      $('#optLightImg').src = o.image;
      $('#optLightCap').textContent = (o.caption || '') + (o.hashtags ? '\n\n' + o.hashtags : '');
      $('#optLight').style.display = 'flex';
    });
    const closeLight = () => { const l = $('#optLight'); if (l) l.style.display = 'none'; };
    $('#btnLightClose').onclick = closeLight;
    $('#optLight').onclick = (e) => { if (e.target.id === 'optLight') closeLight(); };
    // ---- "📷 Mi foto" por tarjeta ----
    let pickIdx = null;
    function openMyPhotoPicker(idx) {
      pickIdx = idx;
      const o = c.options[idx]; if (!o) return;
      const lib = assetPhotos();
      $('#pickLib').innerHTML = lib.length
        ? lib.map(a => `<img src="${esc(a.file_path)}" data-pick="${esc(a.file_path)}" class="mp-thumb" alt="Tu foto">`).join('')
        : `<span class="mut">Todavía no subiste fotos.</span>`;
      const stock = (o.photoCandidates || []).filter(u => !lib.some(a => a.file_path === u)).slice(0, 6);
      $('#pickStock').innerHTML = stock.length
        ? stock.map(u => `<img src="${esc(u)}" data-pick="${esc(u)}" class="mp-thumb" alt="Foto del banco">`).join('')
        : `<span class="mut">Sin alternativas.</span>`;
      $('#pickMsg').innerHTML = '';
      $('#photoPickModal').style.display = 'flex';
    }
    async function applyCardPhoto(idx, photoUrl) {
      const o = c.options[idx]; if (!o) return;
      $('#pickMsg').innerHTML = `<div class="hint">⏳ Actualizando diseño...</div>`;
      try {
        const r = await api.post('/api/creator/rerender', {
          style: o.style, photo: photoUrl, headline: o.title, subline: o.subtitle,
          pill: o.pill, bar: o.bar, cta: o.cta, colors: o.colors,
        });
        if (!r || !r.image) throw new Error('Sin imagen');
        o.image = r.image;
        c.cardPhoto[idx] = photoUrl;
        if (o.photoCandidates && !o.photoCandidates.includes(photoUrl)) o.photoCandidates.unshift(photoUrl);
        const img = document.querySelector(`img[data-optimg="${idx}"]`);
        if (img) img.src = r.image;
        $('#photoPickModal').style.display = 'none';
      } catch (e) {
        $('#pickMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
    }
    $$('.opt-myphoto').forEach(b => b.onclick = () => openMyPhotoPicker(+b.dataset.mp));
    $('#photoPickModal').onclick = async (e) => {
      const t = e.target;
      if (t.id === 'photoPickModal' || t.id === 'btnPickClose') { $('#photoPickModal').style.display = 'none'; return; }
      if (t.id === 'btnPickUpload') { $('#pickFile').click(); return; }
      const pk = t.dataset && t.dataset.pick;
      if (pk && pickIdx !== null) await applyCardPhoto(pickIdx, pk);
    };
    $('#pickFile').onchange = async () => {
      const f = $('#pickFile').files[0]; if (!f || pickIdx === null) return;
      if (!f.type.startsWith('image/')) { alert('Elegí un archivo de imagen'); return; }
      $('#pickMsg').innerHTML = `<div class="hint">⏳ Subiendo foto...</div>`;
      try {
        const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'No pude subirlo 😅 Probá de nuevo');
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
        await applyCardPhoto(pickIdx, data.path);
      } catch (e) {
        $('#pickMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
      $('#pickFile').value = '';
    };
    // ---- Subir fotos a la librería (arriba de las opciones) ----
    $('#btnUploadPhotos').onclick = () => $('#mpFiles').click();
    // ---- Borrar foto de la librería: no se usa más en posteos nuevos ----
    $$('#mpRow [data-mpdel]').forEach(b => b.onclick = async (ev) => {
      ev.stopPropagation();
      if (!confirm('¿Borrar esta foto? No se va a usar más en tus posteos nuevos.')) return;
      try {
        await api.delete('/api/assets/' + b.dataset.mpdel);
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
        render(); // refresca el creador y la tira de Mis fotos
      } catch (e) { alert('No se pudo borrar: ' + (e.message || e)); }
    });
    $('#mpFiles').onchange = async () => {
      const files = Array.from($('#mpFiles').files || []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      const msg = $('#mpMsg');
      msg.innerHTML = `<div class="hint">⏳ Subiendo ${files.length} ${files.length === 1 ? 'foto' : 'fotos'}...</div>`;
      let ok = 0;
      for (const f of files) {
        try {
          const r = await fetch('/api/assets?kind=photo', { method: 'POST', headers: { 'Content-Type': f.type || 'image/png' }, body: f });
          const data = await r.json();
          if (r.ok) ok++;
          else if (msg) msg.innerHTML = `<div class="err">${esc(data.error || 'Error')}</div>`;
        } catch (e) { msg.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      }
      $('#mpFiles').value = '';
      ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      if (ok) {
        msg.innerHTML = `<div class="hint">✅ ¡Listo! Regenerando con tus fotos...</div>`;
        try {
          const out = await api.post('/api/creator/options', { topic: c.topic, productPhoto: c.productPhoto || undefined });
          if (out && Array.isArray(out.options) && out.options.length) { applyOptions(out); return; }
        } catch (e) { /* queda el mensaje de abajo */ }
        msg.innerHTML = `<div class="hint">✅ ¡Listo! Tocá "🔄 Regenerar opciones" para usarlas.</div>`;
      }
    };
    // ---- Programar N ----
    async function openSchedModal() {
      if (!c.selected.length) return;
      const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires';
      let scheduled = [];
      try { scheduled = await api.get('/api/posts?status=scheduled'); } catch (e) { scheduled = []; }
      const taken = new Set((scheduled || []).map(p => tzDayKey(p.scheduled_at, tz)).filter(Boolean));
      let off = 0;
      const rows = c.selected.map(idx => {
        let iso = slotDate19(0, tz);
        let guard = 0;
        while (guard++ < 90) {
          iso = slotDate19(off, tz); off++;
          const k = tzDayKey(iso, tz);
          if (k && !taken.has(k)) { taken.add(k); break; }
        }
        return { idx, iso };
      });
      $('#schedRows').innerHTML = rows.map(r => {
        const o = c.options[r.idx];
        return `<div class="sched-row" data-row="${r.idx}">
          <img src="${esc(o.image)}" class="sched-thumb" alt="">
          <div class="sched-info"><b>${esc(o.title || 'Diseño')}</b><span class="mut">${esc((o.caption || '').slice(0, 60))}…</span></div>
          <input type="datetime-local" data-swhen="${r.idx}" value="${isoToLocalInput(r.iso)}">
          <button class="btn btn-soft btn-sm sched-now" data-now="${r.idx}" title="Publicar ahora en Instagram">⚡ Postear ahora</button>
        </div>
        <div class="pubnow-mount" data-mount="${r.idx}"></div>`;
      }).join('');
      $('#schedMsg').innerHTML = '';
      // "⚡ Postear ahora" por fila: crea el post y lo publica al instante
      $$('#schedRows [data-now]').forEach(b => b.onclick = async () => {
        const idx = +b.dataset.now;
        const o = c.options[idx]; if (!o) return;
        b.disabled = true;
        const mount = document.querySelector(`#schedRows [data-mount="${idx}"]`);
        const row = document.querySelector(`#schedRows [data-row="${idx}"]`);
        try {
          const r = await api.post('/api/creator/schedule', { items: [{ image: o.image, caption: o.caption || '', hashtags: o.hashtags || '', scheduled_at: new Date().toISOString() }] });
          if (!r.ids || !r.ids.length) throw new Error('Ya hay un posteo igual creado hoy');
          const res = await publishNowFlow(r.ids[0], mount);
          if (res && res.ok) {
            // ya salió (o está saliendo): sacarlo de la selección para no duplicarlo al confirmar
            c.selected = c.selected.filter(x => x !== idx);
            const ch = document.querySelector(`.opt-selbox[data-sel="${idx}"]`);
            if (ch) ch.checked = false;
            const card = document.querySelector(`[data-card="${idx}"]`);
            if (card) card.classList.remove('selected');
            updateMultiBar();
            const inp = row ? row.querySelector('input[data-swhen]') : null;
            if (inp) inp.disabled = true;
            if (row) row.style.opacity = '.55';
            b.textContent = '✅ Posteado';
          } else {
            b.disabled = false;
          }
        } catch (e) {
          if (mount) mount.innerHTML = `<div class="err">${esc(e.message)}</div>`;
          b.disabled = false;
        }
      });
      $('#schedModal').style.display = 'flex';
    }
    $('#btnMultiSched').onclick = openSchedModal;
    $('#btnSchedCancel').onclick = () => { $('#schedModal').style.display = 'none'; };
    $('#schedModal').onclick = (e) => { if (e.target.id === 'schedModal') $('#schedModal').style.display = 'none'; };
    $('#btnSchedConfirm').onclick = async () => {
      const btn = $('#btnSchedConfirm');
      btn.disabled = true; btn.textContent = '⏳ Programando...';
      try {
        const items = c.selected.map(idx => {
          const o = c.options[idx];
          const inp = document.querySelector(`input[data-swhen="${idx}"]`);
          const v = inp && inp.value;
          if (!v) throw new Error('Elegí fecha y hora para todos los diseños');
          return { image: o.image, caption: o.caption || '', hashtags: o.hashtags || '', scheduled_at: new Date(v).toISOString() };
        });
        const r = await api.post('/api/creator/schedule', { items });
        $('#schedMsg').innerHTML = `<div class="okmsg">✅ ${r.count} ${r.count === 1 ? 'posteo programado' : 'posteos programados'} — <a href="#/app/semana">ver en Mi semana</a></div>`;
        c.selected = [];
        $$('.opt-selbox').forEach(ch => { ch.checked = false; });
        $$('.opt-card').forEach(cd => cd.classList.remove('selected'));
        updateMultiBar();
        setTimeout(() => { $('#schedModal').style.display = 'none'; location.hash = '#/app/semana'; }, 1800);
      } catch (e) {
        $('#schedMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
        btn.disabled = false; btn.textContent = '✅ Confirmar';
      }
    };
    $('#btnRegen').onclick = async () => {
      if (!confirm('¿Genero 6 opciones nuevas? Las actuales se reemplazan.')) return;
      const btn = $('#btnRegen');
      btn.disabled = true; btn.textContent = '🎨 Generando nuevas opciones...';
      try {
        const out = await api.post('/api/creator/options', { topic: c.topic, productPhoto: c.productPhoto || undefined });
        if (!out || !Array.isArray(out.options) || !out.options.length) throw new Error('No llegaron opciones, probá de nuevo');
        // Motor de imágenes nivel agencia: intenta primero un concept shot por opción
        // con la foto del producto y las de la librería (máx 2). Si alguna falla,
        // esa opción queda con su imagen canvas de siempre — nada se rompe.
        const libRefs = (c.productPhoto ? [c.productPhoto] : [])
          .concat(assetPhotos().slice(0, 2).map(a => a.file_path)).slice(0, 2);
        const csTipo = tipoFromText(c.topic);
        await Promise.all(out.options.map(async (o) => {
          const p = await aiConceptShot({
            idea: c.topic || o.title || '',
            tipo: csTipo,
            headline: pickHeadline({ titulo: o.title }, o.caption),
            refs: libRefs,
          });
          if (p) o.image = p;
        }));
        applyOptions(out);
      } catch (e) {
        const capMsg = (e && e.aiCap) ? (e.message || 'Llegamos al tope de IA de hoy 🔋 Seguimos mañana 💪') : null;
        $('#optErr').innerHTML = `<div class="${capMsg ? 'okmsg' : 'err'}">${esc(capMsg || e.message)}</div>`;
        btn.disabled = false; btn.textContent = '🔄 Regenerar opciones';
      }
    };
    $('#btnFeedback').onclick = async () => {
      const inp = $('#fb_input');
      const fb = inp.value.trim();
      const msg = $('#feedbackMsg');
      if (!fb) { msg.innerHTML = `<div class="hint" style="margin:10px 0 0">Contame qué querés cambiar 👇</div>`; return; }
      const btn = $('#btnFeedback');
      btn.disabled = true; btn.textContent = '🔧 Arreglándolo...';
      try {
        const out = await api.post('/api/creator/options', { topic: c.topic, feedback: fb, productPhoto: c.productPhoto || undefined });
        if (!out || !Array.isArray(out.options) || !out.options.length) throw new Error('No llegaron opciones, probá de nuevo');
        c.feedback = fb; applyOptions(out);
      } catch (e) {
        msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
        btn.disabled = false; btn.textContent = 'Arreglar';
      }
    };
    $('#btnBackOptions').onclick = () => { c.step = 1; render(); };
  }
  if (c.step === 3) {
    const resetCreator = () => {
      CREATOR_OPEN = false;
      CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', options: null, detected: null, recommendedIndex: 0, recommendedReason: '', feedback: '', productPhoto: '', selected: [], cardPhoto: {}, carouselMode: false, carouselPhotos: [], isCarousel: false };
    };
    const done = (msg, hash) => {
      $('#pubMsg').innerHTML = `<div class="okmsg">${msg}</div>`;
      resetCreator();
      setTimeout(() => location.hash = hash || '#/app/semana', 1400);
    };
    const carPayload = () => {
      const p = { image_path: c.imagePath, caption: c.caption, hashtags: c.hashtags };
      if (c.isCarousel) { p.media_type = 'carousel'; p.carousel_paths = c.carouselPhotos; }
      return p;
    };
    $('#btnSchedule').onclick = async () => {
      const when = $('#p_when').value;
      if (!when) { $('#pubMsg').innerHTML = `<div class="err">Elegí fecha y hora</div>`; return; }
      if (!(await checkQuotaOrModal())) return;
      c.caption = $('#p_caption').value; c.hashtags = $('#p_tags').value;
      try {
        await api.post('/api/posts', { ...carPayload(), scheduled_at: new Date(when).toISOString() });
        done('✅ Post programado. Se publica solo a la hora indicada.');
      } catch (e) { $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    $('#btnNow').onclick = async () => {
      const btn = $('#btnNow');
      if (!(await checkQuotaOrModal())) return;
      btn.disabled = true; // bloquea el doble tap
      c.caption = $('#p_caption').value; c.hashtags = $('#p_tags').value;
      try {
        const { id } = await api.post('/api/posts', carPayload());
        $('#pubMsg').innerHTML = '<div class="pubnow-mount"></div>';
        const r = await publishNowFlow(id, $('#pubMsg .pubnow-mount'));
        if (r && r.ok && r.permalink) {
          // publishNowFlow ya mostró "¡Publicado! Ver en IG ↗"
          resetCreator();
          setTimeout(() => location.hash = '#/app/semana', 8000);
        } else if (r && r.ok) {
          done('⏳ Se está publicando… lo ves en Mi semana en un minuto.');
        }
        // si falló, publishNowFlow ya mostró el error con botón Reintentar
      } catch (e) {
        if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); btn.disabled = false; return; }
        $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; btn.disabled = false;
      }
    };
    $('#btnDraft').onclick = async () => {
      const btn = $('#btnDraft');
      // Guardar borrador no consume cupo: el plan limita las publicaciones, no la creación.
      btn.disabled = true;
      c.caption = $('#p_caption').value; c.hashtags = $('#p_tags').value;
      try {
        await api.post('/api/posts', carPayload());
        done('💾 Guardado como borrador. Lo revisás en Mi semana.', '#/app/semana');
      } catch (e) {
        if (isPlanLimitErr(e)) { const q = await api.get('/api/quota').catch(() => null); quotaModal(q || { limit: 3, used: 3, left: 0, plan_name: '' }); btn.disabled = false; return; }
        $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; btn.disabled = false;
      }
    };
    $('#btnBack2').onclick = () => { c.step = c.fromOptions ? 'options' : 2; render(); };
  }
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
function bindSettings() {
  // Acordeón de secciones en móvil
  $$('.ajsec-h').forEach(h => {
    const tg = () => h.parentElement.classList.toggle('open');
    h.onclick = tg;
    h.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tg(); } };
  });
  // Notificaciones push: pinta la sección 🔔 según el estado del permiso.
  try { pushRenderZone(); } catch (e) { /* nunca bloquear ajustes */ }
  const sCat = $('#s_cat');
  if (sCat) sCat.onchange = () => { $('#s_catother_w').style.display = sCat.value === 'otro' ? '' : 'none'; };
  const sDesc = $('#s_desc');
  if (sDesc) sDesc.oninput = () => { $('#s_desc_n').textContent = sDesc.value.length; };
  // --- competidores como chips ---
  let compChips = String((PROFILE && PROFILE.competitors) || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  let compPics = {};
  const compBox = $('#s_chips');
  const renderChips = () => {
    compBox.innerHTML = compChips.map((c, i) => {
      const pic = compPics[c.toLowerCase()];
      const av = pic ? `<img src="${esc(pic)}" class="comp-av" onerror="this.remove()">` : `<span class="comp-av comp-av-fb">📷</span>`;
      return `<span class="comp-chip">${av}${esc(c)}<b data-ci="${i}" style="cursor:pointer;margin-left:6px">×</b></span>`;
    }).join('');
    compBox.querySelectorAll('[data-ci]').forEach(x => x.onclick = () => { compChips.splice(+x.dataset.ci, 1); renderChips(); markDirty(); });
  };
  const fetchPic = async (name) => {
    const k = name.toLowerCase();
    if (compPics[k] !== undefined) return;
    compPics[k] = null;
    try {
      const r = await api.get('/api/ig/avatar?u=' + encodeURIComponent(name));
      if (r && r.pic_url) { compPics[k] = r.pic_url; renderChips(); }
    } catch (e) {}
  };
  const addChip = () => {
    const v = $('#s_compin').value.trim().replace(/^@+/, '');
    const cHint = $('#compHint');
    if (!v) return;
    if (v.includes('@')) {
      if (cHint) { cHint.textContent = 'Eso parece un email — poné el nombre o el usuario de Instagram del competidor.'; cHint.style.display = ''; }
      $('#s_compin').value = '';
      return;
    }
    if (cHint) cHint.style.display = 'none';
    if (compChips.length >= 10) { $('#s_compin').value = ''; return; }
    if (!compChips.some(c => c.toLowerCase() === v.toLowerCase())) { compChips.push(v); fetchPic(v); }
    $('#s_compin').value = ''; renderChips(); markDirty();
  };
  renderChips();
  compChips.forEach(fetchPic);
  $('#s_compin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addChip(); } });
  $('#s_compbox').addEventListener('click', e => { if (e.target.id !== 's_compin') $('#s_compin').focus(); });
  // --- cambios sin guardar ---
  let profDirty = false;
  const dirtyEl = $('#profDirty');
  function markDirty() { if (!profDirty) { profDirty = true; if (dirtyEl) dirtyEl.style.display = ''; } }
  ['s_biz', 's_iguser', 's_cat', 's_catother', 's_tone', 's_tz', 's_goal', 's_desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', markDirty);
    if (el) el.addEventListener('change', markDirty);
  });
  $('#btnSaveProfile').onclick = async () => {
    if (!$('#s_biz').value.trim()) { $('#profMsg').innerHTML = '<div class="err">Poné el nombre de tu negocio</div>'; return; }
    const catOther = $('#s_catother').value.trim();
    await api.put('/api/profile', {
      business_name: $('#s_biz').value, ig_username: $('#s_iguser').value.replace('@', ''),
      category: ($('#s_cat').value === 'otro' && catOther) ? catOther.toLowerCase() : $('#s_cat').value,
      tone: $('#s_tone').value, description: $('#s_desc').value,
      competitors: compChips.join(', '), goal: $('#s_goal').value,
    });
    await api.put('/api/settings', { timezone: $('#s_tz').value });
    $('#profMsg').innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Guardado</span>';
    profDirty = false; if (dirtyEl) dirtyEl.style.display = 'none';
    PROFILE = await api.get('/api/profile');
    SETTINGS = await api.get('/api/settings');
  };
  // --- ADN del negocio (GET/PUT /api/dna): listas simples, sin fricción ---
  const dnaEls = { productos: $('#s_dna_productos'), promos: $('#s_dna_promos'), horarios: $('#s_dna_horarios'), ubicacion: $('#s_dna_ubicacion') };
  const splitNamePrice = (line) => {
    const m = String(line || '').match(/^(.*?)\s+[—–-]\s+(.*)$/);
    if (!m) return { nombre: String(line || '').trim(), precio: '' };
    return { nombre: m[1].trim(), precio: m[2].trim() };
  };
  const dnaArrLine = (it) => {
    if (typeof it === 'string') return it;
    const a = (it.nombre || it.titulo || '').trim();
    const b = (it.precio || it.detalle || '').trim();
    return b ? `${a} — ${b}` : a;
  };
  const paintDna = (dna) => {
    const d = dna || {};
    if (dnaEls.productos) dnaEls.productos.value = (Array.isArray(d.productos) ? d.productos : []).map(dnaArrLine).filter(Boolean).join('\n');
    if (dnaEls.promos) dnaEls.promos.value = (Array.isArray(d.promos_activas) ? d.promos_activas : []).map(dnaArrLine).filter(Boolean).join('\n');
    if (dnaEls.horarios) dnaEls.horarios.value = d.horarios || '';
    if (dnaEls.ubicacion) dnaEls.ubicacion.value = d.ubicacion || '';
    paintSrcChips(d);
  };
  // --- chips de fuente por bloque (Expertos en información): dna.fuentes = { campo: 'etiqueta' } ---
  // Si un campo no tiene fuente registrada, se muestra sin chip (defensivo).
  const DNA_SRC_STYLE = 'font-size:10px;font-weight:700;background:#E7F4FB;color:#166E9C;border-radius:999px;padding:2px 9px;white-space:nowrap';
  const dnaSrcChip = (fuentes, field) => {
    const t = (fuentes && typeof fuentes === 'object' && fuentes[field]) || '';
    return t ? `<span style="${DNA_SRC_STYLE}">${esc(String(t))}</span>` : '';
  };
  const paintSrcChips = (dna) => {
    const d = dna || {};
    for (const f of ['productos', 'promos_activas', 'horarios', 'ubicacion']) {
      const el = document.getElementById('dnaChip_' + f);
      if (el) el.innerHTML = dnaSrcChip(d.fuentes, f);
    }
  };
  // --- datos de la web dentro del ADN: read-only, con etiqueta "de tu web" ---
  const webDnaZone = $('#webDnaZone');
  const webArrOf = (v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.filter(x => x && String(typeof x === 'string' ? x : (x.nombre || x.titulo || '')).trim());
    return [v];
  };
  const paintWebDna = (dna) => {
    if (!webDnaZone) return;
    const d = dna || {};
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    const w = isObj(d.website) ? d.website : (isObj(d.web_data) ? d.web_data : {});
    const prods = webArrOf(w.productos || d.website_productos || d.web_productos);
    const precios = webArrOf(w.precios || d.website_precios || d.web_precios);
    const promos = webArrOf(w.promos || d.website_promos || d.web_promos);
    const groups = [['🛍️ Productos', prods], ['💲 Precios', precios], ['🎉 Promos', promos]].filter(([, a]) => a.length);
    if (!groups.length) { webDnaZone.innerHTML = ''; return; }
    const tag = '<span style="font-size:10px;font-weight:700;background:#E7F4FB;color:#166E9C;border-radius:999px;padding:2px 9px;white-space:nowrap">🌐 de tu web</span>';
    webDnaZone.innerHTML = `
      <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:16px">
        <div style="font-weight:800;font-size:12.5px;margin-bottom:10px">🌐 Lo que encontramos en tu web</div>
        ${groups.map(([t, arr]) => `
          <div class="field" style="margin-bottom:10px"><label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${t} ${tag}</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${arr.map(it => `<span class="comp-chip">${esc(dnaArrLine(it))}</span>`).join('')}</div>
          </div>`).join('')}
        <div class="hint">Se actualiza solo cuando volvés a analizar tu web en "🌐 La web de tu negocio".</div>
      </div>`;
  };
  const refreshWebDna = () => { api.get('/api/dna').then(r => paintWebDna(r && r.dna)).catch(() => {}); };
  // --- 📚 Datos de otras fuentes: bloques de solo lectura con su chip de fuente ---
  // Cada track (comentarios IG, Facebook, Google, MercadoLibre, historias) guarda sus campos
  // en el ADN con su etiqueta en dna.fuentes. Campos nuevos de otros tracks que todavía no
  // existan se cablean defensivo (título generado desde el nombre del campo).
  const DNA_INFO_BLOCKS = [
    ['producto_estrella', '⭐ Producto estrella'], ['cliente_ideal', '🎯 Cliente ideal'],
    ['diferencial', '✨ Diferencial'], ['servicios', '🛠️ Servicios'], ['promos', '🎉 Promos'],
    ['precio_rango', '💲 Rango de precios'], ['preguntas_frecuentes', '❓ Preguntas frecuentes'],
    ['objeciones', '🚧 Objeciones'], ['deseos', '💭 Deseos de tus clientes'],
    ['testimonios', '💬 Testimonios'], ['puntos_fuertes', '💪 Puntos fuertes'],
    ['descripcion_fb', '📘 Descripción de Facebook'], ['reviews_fb', '📘 Reviews de Facebook'],
    ['anuncios', '📣 Anuncios'], ['tono_ejemplos', '🗣️ Frases del dueño'],
  ];
  // Campos que ya tienen UI propia en esta tarjeta o no son mostrables.
  const DNA_INFO_SKIP = new Set(['fuentes', 'productos', 'promos_activas', 'horarios', 'ubicacion',
    'website', 'web_data', 'inspo', 'tono', 'series', 'paused_tipos', 'paused_series',
    'website_url', 'website_analyzed_at', 'website_partial', 'resumen']);
  const dnaHas = (v) => {
    if (v == null) return false;
    if (typeof v === 'string') return !!v.trim();
    if (Array.isArray(v)) return v.some(x => x && (typeof x === 'string' ? x.trim() : String(x.nombre || x.titulo || x.pregunta || x.texto || '').trim()));
    return true;
  };
  const dnaInfoLine = (it) => {
    if (it && typeof it === 'object') {
      const q = String(it.pregunta || '').trim();
      const a = String(it.respuesta || '').trim();
      if (q) return `<div style="margin:6px 0"><div style="font-weight:700;font-size:12.5px">❓ ${esc(q)}</div>${a ? `<div style="color:var(--mut);font-size:11.5px">💬 ${esc(a)}</div>` : ''}</div>`;
    }
    return `<span class="comp-chip">${esc(dnaArrLine(it))}</span>`;
  };
  const paintFuentesDna = (dna) => {
    const zone = $('#dnaFuentesZone');
    if (!zone) return;
    const d = dna || {};
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    const fuentes = isObj(d.fuentes) ? d.fuentes : {};
    const known = new Set(DNA_INFO_BLOCKS.map(([f]) => f));
    const blocks = [];
    for (const [field, title] of DNA_INFO_BLOCKS) {
      if (dnaHas(d[field])) blocks.push([field, title, d[field]]);
    }
    for (const field of Object.keys(fuentes)) {
      if (known.has(field) || DNA_INFO_SKIP.has(field) || !dnaHas(d[field])) continue;
      const title = '🧩 ' + field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      blocks.push([field, title, d[field]]);
    }
    if (!blocks.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = `
      <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:16px">
        <div style="font-weight:800;font-size:12.5px;margin-bottom:10px">📚 Datos de otras fuentes</div>
        ${blocks.map(([field, title, v]) => `
          <div class="field" style="margin-bottom:10px">
            <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${esc(title)} ${dnaSrcChip(fuentes, field)}</label>
            <div style="margin-top:6px">${Array.isArray(v)
              ? v.slice(0, 6).map(dnaInfoLine).join('') + (v.length > 6 ? `<div class="hint">…y ${v.length - 6} más</div>` : '')
              : `<div style="font-size:12.5px">${esc(String(v))}</div>`}</div>
          </div>`).join('')}
        <div class="hint">La IA usa estos datos para crear posteos que venden de verdad.</div>
      </div>`;
  };
  if (dnaEls.productos) {
    api.get('/api/dna').then(r => { paintDna(r && r.dna); paintWebDna(r && r.dna); paintFuentesDna(r && r.dna); }).catch(() => {});
    const bDna = $('#btnSaveDna');
    if (bDna) bDna.onclick = async () => {
      const msg = $('#dnaMsg');
      try {
        const productos = dnaEls.productos.value.split('\n').map(splitNamePrice).filter(p => p.nombre).map(p => ({ nombre: p.nombre, precio: p.precio }));
        const promos_activas = dnaEls.promos.value.split('\n').map(l => { const s = splitNamePrice(l); return s.nombre ? { titulo: s.nombre, detalle: s.precio } : null; }).filter(Boolean);
        const r = await api.put('/api/dna', {
          productos, promos_activas,
          horarios: dnaEls.horarios.value.trim(),
          ubicacion: dnaEls.ubicacion.value.trim(),
        });
        paintDna(r && r.dna);
        if (msg) msg.innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Guardado</span>';
      } catch (e) {
        if (msg) msg.innerHTML = `<span style="color:#B3402E;font-size:12.5px">${esc((e && e.message) || 'No se pudo guardar')}</span>`;
      }
    };
  }
  // --- 🌐 La web de tu negocio (GET /api/website/status · POST /api/website/analyze) ---
  let webStatus = null;
  const webZone = $('#webZone');
  const fmtWebAt = (at) => {
    try {
      let s = String(at || '').trim().replace(' ', 'T');
      if (!s) return '';
      if (!/[zZ]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'; // datetimes de SQLite vienen en UTC
      const d = new Date(s);
      if (isNaN(d)) return String(at);
      return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return String(at || ''); }
  };
  const normWebUrl = (u) => {
    let s = String(u || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
  };
  const paintWebZone = (st, errMsg) => {
    if (st) webStatus = st;
    if (!webZone) return;
    const err = errMsg ? `<div class="err" style="margin-top:10px">❌ ${esc(errMsg)}</div>` : '';
    if (!webStatus) { webZone.innerHTML = '<div class="err">❌ No pudimos cargar el estado de tu web. Probá recargar la página.</div>'; return; }
    if (webStatus.ok) {
      webZone.innerHTML = `
        <div class="okmsg">✅ <b>${esc(webStatus.url || 'Tu web')}</b><br>Analizada el ${esc(fmtWebAt(webStatus.analyzed_at))}${webStatus.partial ? ' <b>(parcial:</b> no pudimos leer todas las páginas)' : ''}</div>
        <p style="color:var(--mut);font-size:12.5px;margin:10px 0 14px">Sacamos de tu web productos, precios y promos para que la IA cree posteos que venden.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm" id="btnWebRe">🔄 Analizar de nuevo</button> <span id="webMsg"></span>
        </div>${err}`;
      const b = $('#btnWebRe');
      if (b) b.onclick = () => runWebAnalyze({ force: true });
    } else {
      const det = String(webStatus.url || '').trim();
      webZone.innerHTML = `
        <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">${det ? `Detectamos esta web en tu bio de Instagram 👇` : '¿Tenés web? La estudiamos y sacamos productos, precios y promos para que la IA cree posteos que venden.'}</p>
        <div class="field" style="margin-bottom:10px"><label>URL de tu web o publicación</label>
          <input id="s_weburl" value="${esc(det)}" placeholder="https://tuweb.com" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btnWebGo">🔍 Analizar mi web</button> <span id="webMsg"></span>
        </div>
        <p class="hint" style="margin-top:10px">🛒 <b>¿Vendés en MercadoLibre?</b> Pegá el link de tu publicación (articulo.mercadolibre.com…) y sacamos título, precio y descripción para tus posteos.</p>${err}`;
      const b = $('#btnWebGo');
      if (b) b.onclick = () => {
        const u = normWebUrl(($('#s_weburl') || {}).value);
        if (!u) { const m = $('#webMsg'); if (m) m.innerHTML = '<span style="color:#B3402E;font-size:12.5px">Pegá la URL de tu web</span>'; return; }
        runWebAnalyze({ url: u });
      };
    }
  };
  const runWebAnalyze = async (body) => {
    if (!webZone) return;
    webZone.innerHTML = '<div class="hint">⏳ Analizando tu web… esto puede tardar un ratito. Podés seguir usando la app, nosotros te avisamos acá.</div>';
    try {
      await api.post('/api/website/analyze', body, { timeout: 240000 });
      try { webStatus = await api.get('/api/website/status'); } catch (e) { /* queda el anterior */ }
      paintWebZone(webStatus);
      refreshWebDna();
      toast('✅ <b>Ya estudiamos tu web.</b><br>Los datos quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintWebZone(webStatus, (e && e.message) || 'No se pudo analizar tu web');
    }
  };
  if (webZone) {
    api.get('/api/website/status').then(st => paintWebZone(st)).catch(() => paintWebZone(null));
    // refresco invocable desde el auto-análisis post-OAuth (?ig=ok)
    PZ_WEB_REFRESH = () => {
      api.get('/api/website/status').then(st => paintWebZone(st)).catch(() => {});
      refreshWebDna();
    };
  }
  // --- 📱 Tus historias recientes (GET /api/ig/stories-status · POST /api/ig/mine-stories) ---
  // Lee las historias de las últimas 24h y la IA saca promos y anuncios del texto visible.
  // Solo lee: nunca publica nada. Ojo: Instagram no da el archivo, solo las últimas 24h.
  let storiesStatus = null;
  const storiesZone = $('#storiesZone');
  const paintStoriesZone = (st, errMsg) => {
    if (st) storiesStatus = st;
    if (!storiesZone) return;
    const err = errMsg ? `<div class="err" style="margin-top:10px">❌ ${esc(errMsg)}</div>` : '';
    if (!storiesStatus) { storiesZone.innerHTML = '<div class="err">❌ No pudimos cargar el estado de tus historias. Probá recargar la página.</div>'; return; }
    if (storiesStatus.ok) {
      const n = (storiesStatus.promos || 0) + (storiesStatus.anuncios || 0);
      storiesZone.innerHTML = `
        <div class="okmsg">✅ <b>Historias analizadas el ${esc(fmtWebAt(storiesStatus.analyzed_at))}</b><br>${n ? `Sacamos ${n} dato${n === 1 ? '' : 's'} de tus historias (promos y anuncios): la IA los usa para crear posteos al día.` : 'No encontramos texto en tus historias recientes: si publicás una promo o un anuncio, volvé a analizarlas.'}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-soft btn-sm" id="btnStoriesGo">🔄 Analizar de nuevo</button> <span id="storiesMsg"></span>
        </div>${err}`;
      const b = $('#btnStoriesGo');
      if (b) b.onclick = runStoriesAnalyze;
    } else {
      storiesZone.innerHTML = `
        <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Leemos tus historias de las últimas 24h y sacamos las promos y anuncios que publicaste, para que la IA cree posteos al día. <b>Ojo:</b> Instagram solo nos deja ver las de las últimas 24 horas, no el archivo.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btnStoriesGo">📱 Analizar historias</button> <span id="storiesMsg"></span>
        </div>${err}`;
      const b = $('#btnStoriesGo');
      if (b) b.onclick = runStoriesAnalyze;
    }
  };
  const runStoriesAnalyze = async () => {
    if (!storiesZone) return;
    storiesZone.innerHTML = '<div class="hint">⏳ Leyendo tus historias de las últimas 24h… las analizamos una por una, puede tardar un ratito.</div>';
    try {
      await api.post('/api/ig/mine-stories', {}, { timeout: 240000 });
      try { storiesStatus = await api.get('/api/ig/stories-status'); } catch (e) { /* queda el anterior */ }
      paintStoriesZone(storiesStatus);
      refreshWebDna();
      toast('✅ <b>Ya leímos tus historias.</b><br>Los datos quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintStoriesZone(storiesStatus, (e && e.message) || 'No se pudieron analizar tus historias');
    }
  };
  if (storiesZone) {
    api.get('/api/ig/stories-status').then(st => paintStoriesZone(st)).catch(() => paintStoriesZone(null));
  }
  // --- 💬 Lo que preguntan tus seguidores (GET /api/ig/comments-status · POST /api/ig/mine-comments) ---
  // Lee los últimos ~20 posteos + comentarios y la IA saca preguntas frecuentes, objeciones y deseos.
  // Solo lee: nunca publica ni comenta nada. Conectá IG para usarlo.
  let srcCommentsStatus = null;
  const srcCommentsCard = $('#srcCommentsCard');
  const fmtSrcAt = (at) => {
    try {
      let s = String(at || '').trim().replace(' ', 'T');
      if (!s) return '';
      if (!/[zZ]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
      const d = new Date(s);
      if (isNaN(d)) return String(at);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return String(at || ''); }
  };
  const paintSrcComments = (st, errMsg) => {
    if (st) srcCommentsStatus = st;
    if (!srcCommentsCard) return;
    const err = errMsg ? `<div class="err" style="margin-top:10px">❌ ${esc(errMsg)}</div>` : '';
    if (!srcCommentsStatus) { srcCommentsCard.innerHTML = '<div class="err">❌ No pudimos cargar el estado de los comentarios. Probá recargar la página.</div>'; return; }
    if (srcCommentsStatus.ok) {
      const c = srcCommentsStatus.counts || {};
      const n = Number(c.comments || 0);
      srcCommentsCard.innerHTML = `
        <div class="okmsg">✅ <b>${n} comentarios</b> analizados${c.posts ? ` de ${c.posts} posteos` : ''}<br><span style="color:var(--dim);font-size:11.5px">Último análisis: ${esc(fmtSrcAt(srcCommentsStatus.analyzed_at))}</span></div>
        <p style="color:var(--mut);font-size:12.5px;margin:10px 0 14px">La IA leyó lo que te preguntan tus seguidores y lo usa para crear posteos que responden antes de que pregunten.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm" id="btnSrcCommentsRe">🔄 Analizar de nuevo</button> <span id="srcCommentsMsg"></span>
        </div>${err}`;
      const b = $('#btnSrcCommentsRe');
      if (b) b.onclick = () => runCommentsMine({ force: true });
    } else {
      srcCommentsCard.innerHTML = `
        <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Leemos los comentarios de tus últimos posteos y la IA saca <b>qué te preguntan</b>, <b>qué objeciones tienen</b> y <b>qué desean</b> — sin pedirte nada más. Esos datos entrenan a la IA para vender mejor.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btnSrcCommentsGo">💬 Analizar comentarios</button> <span id="srcCommentsMsg"></span>
        </div>${err}`;
      const b = $('#btnSrcCommentsGo');
      if (b) b.onclick = () => runCommentsMine({});
    }
  };
  const runCommentsMine = async (body) => {
    if (!srcCommentsCard) return;
    srcCommentsCard.innerHTML = '<div class="hint">⏳ Analizando comentarios… esto puede tardar un ratito. Podés seguir usando la app, nosotros te avisamos acá.</div>';
    try {
      await api.post('/api/ig/mine-comments', body, { timeout: 240000 });
      try { srcCommentsStatus = await api.get('/api/ig/comments-status'); } catch (e) { /* queda el anterior */ }
      paintSrcComments(srcCommentsStatus);
      toast('✅ <b>Ya analizamos tus comentarios.</b><br>La IA ahora sabe qué te preguntan tus seguidores.');
    } catch (e) {
      paintSrcComments(srcCommentsStatus, (e && e.message) || 'No se pudieron analizar los comentarios');
    }
  };
  if (srcCommentsCard) {
    api.get('/api/ig/comments-status').then(st => paintSrcComments(st)).catch(() => paintSrcComments(null));
  }
  // --- ⭐ Lo que dicen tus clientes (GET /api/places/status · POST /api/places/analyze) ---
  let placesStatus = null;
  const placesZone = $('#placesZone');
  const paintPlacesZone = (st, errMsg) => {
    if (st) placesStatus = st;
    if (!placesZone) return;
    const err = errMsg ? `<div class="err" style="margin-top:10px">❌ ${esc(errMsg)}</div>` : '';
    if (!placesStatus) { placesZone.innerHTML = '<div class="err">❌ No pudimos cargar el estado. Probá recargar la página.</div>'; return; }
    // Sin key: explicación + cómo conseguirla.
    if (!placesStatus.has_key) {
      placesZone.innerHTML = `
        <div class="hint" style="background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:12px;font-size:12.5px">
          🔑 <b>Todavía no conectamos Google.</b><br>
          Para leer las reseñas de tu negocio necesitás una clave de Google Places API: entrás a
          <b>console.cloud.google.com</b> → activás la API <b>"Places API"</b> → creás una API key.
          Pasanos la key y la activamos por vos.
        </div>
        <p style="color:var(--mut);font-size:12.5px;margin:0 0 12px">Con eso sacamos lo que repiten tus clientes (atención, precios, calidad) y testimonios reales que la IA puede usar en los posteos.</p>${err}`;
      return;
    }
    if (placesStatus.ok) {
      const chips = (placesStatus.puntos_fuertes || []).map(x => `<span style="display:inline-block;background:#FFF6E3;border:1px solid #F5D98B;color:#8a6d1a;border-radius:999px;padding:4px 12px;margin:0 6px 6px 0;font-size:11.5px;font-weight:700">${esc(x)}</span>`).join('');
      const tests = (placesStatus.testimonios || []).map(t => `<div style="border-left:3px solid #2793C8;padding:6px 12px;margin:0 0 10px;font-size:12.5px;color:var(--txt)">"${esc(t.cita || '')}"${t.autor ? ` <b style="color:var(--dim)">— ${esc(t.autor)}</b>` : ''}</div>`).join('');
      placesZone.innerHTML = `
        <div class="okmsg">✅ <b>${esc(placesStatus.place_name || 'Tu negocio')}</b>${placesStatus.rating ? ` <span style="color:#f5a623">★</span> ${esc(String(placesStatus.rating))}` : ''}${placesStatus.total_ratings ? ` <span style="color:var(--dim);font-weight:400">(${esc(String(placesStatus.total_ratings))} reseñas)</span>` : ''}<br><span style="font-size:11.5px;color:var(--mut)">Analizado el ${esc(fmtWebAt(placesStatus.analyzed_at))}${placesStatus.partial ? ' (parcial)' : ''}</span></div>
        ${chips ? `<div style="font-weight:800;margin:12px 0 6px;font-size:12.5px">Lo que más repiten tus clientes</div><div>${chips}</div>` : ''}
        ${tests ? `<div style="font-weight:800;margin:12px 0 6px;font-size:12.5px">Testimonios reales</div><div>${tests}</div>` : '<p style="color:var(--mut);font-size:12.5px;margin:12px 0 0">Todavía no encontramos reseñas para citar.</p>'}
        <p style="color:var(--mut);font-size:11.5px;margin:12px 0">Los puntos fuertes y testimonios quedan en "🧬 Lo que la IA sabe" para que la IA los use.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm" id="btnPlacesRe">🔄 Buscar de nuevo</button> <span id="placesMsg"></span>
        </div>${err}`;
      const b = $('#btnPlacesRe');
      if (b) b.onclick = () => runPlacesAnalyze({ force: true });
    } else {
      placesZone.innerHTML = `
        <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Buscamos tu negocio en Google, leemos las reseñas y sacamos lo que más repiten tus clientes + testimonios reales que la IA usa para vender.</p>
        <div class="field" style="margin-bottom:10px"><label>Nombre de tu negocio en Google <span style="color:var(--dim);font-weight:400">(opcional: si lo dejás vacío usamos tu perfil)</span></label>
          <input id="s_placesq" style="font-size:16px" placeholder="Ej: Pizzería Lo de Juan" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btnPlacesGo">⭐ Buscar mi negocio</button> <span id="placesMsg"></span>
        </div>${err}`;
      const b = $('#btnPlacesGo');
      if (b) b.onclick = () => runPlacesAnalyze({ query: (($('#s_placesq') || {}).value || '').trim() });
    }
  };
  const runPlacesAnalyze = async (body) => {
    if (!placesZone) return;
    placesZone.innerHTML = '<div class="hint">⏳ Buscando tu negocio en Google… esto puede tardar un ratito. Podés seguir usando la app, nosotros te avisamos acá.</div>';
    try {
      await api.post('/api/places/analyze', body, { timeout: 240000 });
      try { placesStatus = await api.get('/api/places/status'); } catch (e) { /* queda el anterior */ }
      paintPlacesZone(placesStatus);
      toast('✅ <b>Ya leímos tus reseñas.</b><br>Los testimonios quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintPlacesZone(placesStatus, (e && e.message) || 'No se pudo buscar tu negocio');
    }
  };
  if (placesZone) {
    api.get('/api/places/status').then(st => paintPlacesZone(st)).catch(() => paintPlacesZone(null));
  }
  // --- 📘 Tu página de Facebook (GET /api/fb/status · POST /api/fb/analyze) ---
  let fbStatus = null;
  const fbZone = $('#fbZone');
  const paintFbZone = (st, errMsg) => {
    if (st) fbStatus = st;
    if (!fbZone) return;
    const err = errMsg ? `<div class="err" style="margin-top:10px">❌ ${esc(errMsg)}</div>` : '';
    if (!fbStatus) { fbZone.innerHTML = '<div class="err">❌ No pudimos cargar el estado de tu página. Probá recargar la página.</div>'; return; }
    if (fbStatus.ok) {
      fbZone.innerHTML = `
        <div class="okmsg">✅ <b>${esc(fbStatus.page || 'Tu página')}</b><br>Analizada el ${esc(fmtWebAt(fbStatus.analyzed_at))}${fbStatus.partial ? ' <b>(parcial:</b> tu página tiene poquitos datos)' : ''}</div>
        <p style="color:var(--mut);font-size:12.5px;margin:10px 0 14px">Sacamos de tu página horarios, ubicación, descripción y lo que dicen tus clientes para que la IA hable de tu negocio con datos reales.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-soft btn-sm" id="btnFbRe">🔄 Analizar de nuevo</button> <span id="fbMsg"></span>
        </div>${err}`;
      const b = $('#btnFbRe');
      if (b) b.onclick = () => runFbAnalyze({ force: true });
    } else {
      fbZone.innerHTML = `
        <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">¿Tenés página de Facebook? La estudiamos: horarios, ubicación, descripción y opiniones de tus clientes. Si tu Instagram está conectado la detectamos sola 👇</p>
        <div class="field" style="margin-bottom:6px"><label>URL o ID de tu página de Facebook</label>
          <input id="s_fbpage" placeholder="https://www.facebook.com/tu-negocio" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        </div>
        <div class="hint" style="margin-bottom:14px">Cómo pegarla: abrí tu página en Facebook y copiá lo que dice la barra de direcciones (ej: facebook.com/tu-negocio). Podés dejarlo vacío si tu Instagram está conectado.</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btnFbGo">📘 Analizar mi página</button> <span id="fbMsg"></span>
        </div>${err}`;
      const b = $('#btnFbGo');
      if (b) b.onclick = () => runFbAnalyze({ page: (($('#s_fbpage') || {}).value || '').trim() });
    }
  };
  const runFbAnalyze = async (body) => {
    if (!fbZone) return;
    fbZone.innerHTML = '<div class="hint">⏳ Analizando tu página de Facebook… esto puede tardar un ratito. Podés seguir usando la app, nosotros te avisamos acá.</div>';
    try {
      await api.post('/api/fb/analyze', body, { timeout: 120000 });
      try { fbStatus = await api.get('/api/fb/status'); } catch (e) { /* queda el anterior */ }
      paintFbZone(fbStatus);
      refreshWebDna();
      toast('✅ <b>Ya estudiamos tu página de Facebook.</b><br>Los datos quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintFbZone(fbStatus, (e && e.message) || 'No se pudo analizar tu página');
    }
  };
  if (fbZone) {
    api.get('/api/fb/status').then(st => paintFbZone(st)).catch(() => paintFbZone(null));
  }
  const bOnb = $('#btnOnb');
  if (bOnb) bOnb.onclick = () => { OB = loadOB() || freshOB(); location.hash = '#/app/onboarding'; };
  const bPrev = $('#btnPreview');
  if (bPrev) bPrev.onclick = openPreview;
  function openPreview() {
    const catV = $('#s_cat').value;
    const catE = CATS.find(c => c[0] === catV) || ['otro', '🏷️', 'Otro'];
    const catTxt = catV === 'otro' ? ($('#s_catother').value.trim() || 'Otro') : catE[2];
    const toneE = TONES.find(t => t[0] === $('#s_tone').value) || ['', '🎭', '—'];
    const goalE = GOALS.find(g => g[0] === $('#s_goal').value) || ['', '🎯', '—', ''];
    const tzE = TIMEZONES.find(z => z[0] === $('#s_tz').value) || [];
    const biz = $('#s_biz').value.trim();
    const igu = $('#s_iguser').value.trim().replace(/^@+/, '');
    const desc = $('#s_desc').value.trim();
    const row = (ico, lbl, val) => `<div class="pv-row"><span class="pv-ico">${ico}</span><div><div class="pv-lbl">${lbl}</div><div class="pv-val">${val}</div></div></div>`;
    const chips = compChips.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">` + compChips.map(c => {
          const pic = compPics[c.toLowerCase()];
          const av = pic ? `<img src="${esc(pic)}" class="comp-av" onerror="this.remove()">` : '';
          return `<span class="comp-chip">${av}${esc(c)}</span>`;
        }).join('') + `</div>`
      : `<span class="pv-warn">Todavía no sumaste competidores.</span>`;
    const tips = [];
    if (!desc) tips.push('una descripción de tu negocio');
    if (!compChips.length) tips.push('al menos un competidor');
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `
      <div class="modal-card" style="max-width:440px" role="dialog" aria-modal="true">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
          <h3 style="margin:0">🤖 Cómo me ve la IA</h3>
          <button class="btn btn-ghost btn-sm" id="pvX">✕</button>
        </div>
        <p style="color:var(--mut);font-size:11.5px;margin:0 0 8px">Con estos datos creamos tus ideas y posteos:</p>
        ${row('🏪', 'Negocio', esc(biz) || '<span class="pv-warn">Falta el nombre</span>')}
        ${row('📸', 'Instagram', igu ? '@' + esc(igu) : '<span class="pv-warn">Sin usuario</span>')}
        ${row(catE[1], 'Rubro', esc(catTxt))}
        ${row(toneE[1], 'Tono de la IA', esc(toneE[2]))}
        ${row(goalE[1], 'Objetivo', esc(goalE[2]) + (goalE[3] ? `<br><span style="font-weight:400;color:var(--mut);font-size:11.5px">${esc(goalE[3])}</span>` : ''))}
        ${row('🕐', 'Zona horaria', esc(tzE[1] || '—'))}
        ${row('📝', 'Descripción', desc ? esc(desc.length > 160 ? desc.slice(0, 160) + '…' : desc) : '<span class="pv-warn">Sin descripción.</span>')}
        ${row('⚔️', 'Competidores', chips)}
        ${tips.length ? `<div class="pv-tip">💡 <b>Tip:</b> sumá ${tips.join(' y ')} para ideas mucho mejores.</div>` : `<div class="pv-tip">✅ <b>Perfil completo:</b> la IA tiene todo lo que necesita.</div>`}
        <button class="btn btn-primary btn-block" id="pvOk" style="margin-top:12px">Entendido</button>
      </div>`;
    document.body.appendChild(ov);
    const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#pvX').onclick = close;
    ov.querySelector('#pvOk').onclick = close;
  }
  // Mi plan
  (async () => {
    const z = $('#planZone');
    if (!z) return;
    try {
      const { plans, mp_configured } = await api.get('/api/billing/plans');
      const cur = (ME && ME.plan) || 'esencial';
      const hasActive = ME && !ME.is_trial && ME.plan_status === 'active';
      const pcm = document.getElementById('planConfirmMsg');
      if (pcm) pcm.innerHTML = hasActive
        ? '✅ ¡Pago recibido! Tu plan ya está activo.'
        : '⏳ Tu pago está confirmándose con MercadoPago. En unos segundos tu plan se activa solo — no hace falta que hagas nada.';
      const statusTag = !hasActive ? `<span style="font-size:11.5px;color:var(--dim)">(${ME && ME.plan_status === 'cancelled' ? 'cancelado' : (ME && ME.trial_expired) ? 'prueba terminada' : 'trial'})</span>` : '';
      const trialLeft = (ME && ME.trial_days_left) || 0;
      // refInfo se obtiene una sola vez acá: lo usan bindSub (clic Suscribirse) y los banners
      let refInfo = null;
      try { refInfo = await pzReferral(); } catch (e) {}
      let trialBanner = '';
      if (!hasActive && ME && ME.plan_status === 'trial') {
        if (ME.trial_expired) trialBanner = `<div class="pz-trial-exp">🔒 <b>Se terminó la prueba.</b> Elegí tu plan y seguimos publicando juntos 🥹</div>`;
        else if (trialLeft > 0) trialBanner = trialLeft <= 3
          ? `<div class="pz-trial-warn">⏰ <b>¡Te ${trialLeft === 1 ? 'queda 1 día' : `quedan ${trialLeft} días`} de prueba!</b> Suscribite para no frenar tus posteos.</div>`
          : `<div class="pz-trial-ok">🎁 Estás en tu prueba gratis: te quedan <b>${trialLeft} días</b>.</div>`;
      }
      const curPlan = plans.find(p => p.id === cur) || plans[0];
      const planCard = (p) => `
          <div class="plan-mini${p.id === cur && hasActive ? ' cur' : ''}${p.highlighted ? ' rec' : ''}">
            <div class="pm-top"><b>${esc(p.name)}</b> ${p.highlighted ? '<span class="badge b-scheduled">Recomendado</span>' : ''}</div>
            <div class="pm-price">${esc(p.price_label)}<small>/mes</small></div>
            <div class="pm-perday">\u2248 $${Math.round(p.price / 30).toLocaleString('es-AR')} por d\u00eda</div>
            <div class="pm-perk">${p.postsPerWeek} posteos/semana</div>
            <ul class="pm-feats">${(p.features || []).map(f => `<li>✓ ${esc(f)}</li>`).join('')}</ul>
            <button class="btn ${p.id === cur && hasActive ? 'btn-ghost' : 'btn-primary'} btn-sm btn-block" data-sub="${p.id}" ${p.id === cur && hasActive ? 'disabled' : ''}>${p.id === cur && hasActive ? 'Plan actual' : 'Suscribirse'}</button>
          </div>`;
      const bindSub = () => {
        $$('#planList [data-sub]').forEach(b => b.onclick = () => {
          track('plan_select', { plan: b.dataset.sub });
          if (!mp_configured) { $('#planMsg').innerHTML = `<div class="err">Pagos no configurados todavía.</div>`; return; }
          // Paso 1: pedir el email de la cuenta de MercadoPago (debe coincidir con la que paga)
          const preset = esc((ME && (ME.mp_payer_email || ME.email)) || '');
          const subPlan = plans.find(p => p.id === b.dataset.sub) || curPlan;
          const discLine = (refInfo && refInfo.discount_active)
            ? `<div class="pz-disc" style="margin:0 0 10px">🎉 Tenés <b>50% off</b> por referidos: este plan te queda en <b>$${Math.round(subPlan.price / 2).toLocaleString('es-AR')}/mes</b>.</div>`
            : (refInfo && refInfo.invited)
              ? `<div class="pz-disc" style="margin:0 0 10px">🎉 Tenés <b>20% off</b> de invitado: este plan te queda en <b>$${Math.round(subPlan.price * 0.8).toLocaleString('es-AR')}/mes</b>.</div>`
              : '';
          $('#planMsg').innerHTML = `
            <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:12px">
              ${discLine}
              <div style="font-weight:800;margin-bottom:6px">Un paso más 💳</div>
              <div style="font-size:12.5px;color:var(--mut);margin-bottom:10px">Ingresá el <b>email de tu cuenta de MercadoPago</b>.</div>
              <div style="font-size:11.5px;background:#FFF7E6;border:1px solid #FEC14D;border-radius:10px;padding:10px 12px;margin-bottom:10px">El comprobante de pago te va a llegar a <b>ese email</b>: fijate que sea el de tu cuenta de MercadoPago.</div>
              <div class="field"><input id="mpEmail" type="email" placeholder="tu@email.com" value="${preset}" autocomplete="email"></div>
              <button class="btn btn-primary btn-block" id="btnGoMP">Continuar al pago</button>
            </div>`;
          const emInput = $('#mpEmail');
          if (emInput) emInput.focus();
          $('#btnGoMP').onclick = async () => {
            const em = ($('#mpEmail').value || '').trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
              $('#planMsg').innerHTML = `<div class="err">Ingresá un email válido.</div>`;
              return;
            }
            const btn = $('#btnGoMP');
            btn.disabled = true; btn.textContent = '⏳ Redirigiendo a MercadoPago...';
            try {
              const { init_point } = await api.post('/api/billing/subscribe', { plan: b.dataset.sub, payer_email: em });
              track('checkout_start', { plan: b.dataset.sub, kind: 'plan' }); trackBeacon();
              location.href = init_point;
            } catch (e) {
              $('#planMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
            }
          };
        });
      };
      if (!hasActive) {
        z.innerHTML = `
        <div style="margin-bottom:16px">
          <div style="font-size:11.5px;color:var(--dim)">Plan actual</div>
          <div style="font-size:17.5px;font-weight:800">${esc(curPlan.name)} ${statusTag}</div>
        </div>
        ${trialBanner}
        <div style="font-size:14px;font-weight:800;margin-bottom:12px">Elegí tu plan para ${ME && ME.trial_expired ? 'seguir' : 'empezar'} 🚀</div>
        <div id="planList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${plans.map(planCard).join('')}</div>
        <div id="planMsg" style="margin-top:10px"></div>
        <p style="font-size:11.5px;color:var(--dim);margin-top:12px">Se renueva automáticamente cada mes. Podés cancelar cuando quieras.</p>`;
        bindSub();
      } else if (ME && ME.plan === 'free') {
        z.innerHTML = `
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div class="plan-cur">
            <div class="pc-label">Plan actual</div>
            <div class="pc-name">Founder 🚀</div>
            <div class="pc-det">Gratis para siempre · 7 posteos/semana · todos los límites del Total</div>
          </div>
        </div>
        <div id="planMsg" style="margin-top:10px"></div>`;
      } else {
        z.innerHTML = `
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div class="plan-cur">
            <div class="pc-label">Plan actual</div>
            <div class="pc-name">${esc(curPlan.name)}</div>
            <div class="pc-det">${esc(curPlan.price_label)}/mes · ${curPlan.postsPerWeek} posteos/semana · se renueva solo cada mes</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btnCancelSub" style="color:#c0392b">Cancelar suscripción</button>
        </div>
        <div id="planMsg" style="margin-top:10px"></div>
        <p style="font-size:11.5px;color:var(--dim)">Para cambiar de plan, primero cancelá tu suscripción actual y después elegí el nuevo.</p>`;
        $('#btnCancelSub').onclick = async () => {
          if (!confirm('¿Cancelar tu suscripción? Mantenés tu plan hasta el fin del período ya pago.')) return;
          const b = $('#btnCancelSub'); b.disabled = true; b.textContent = 'Cancelando...';
          try {
            await api.post('/api/billing/cancel');
            await refreshSession(); render();
          } catch (e) {
            $('#planMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
            b.disabled = false; b.textContent = 'Cancelar suscripción';
          }
        };
      }
      // 🎁 50% off por referidos: se aplica automáticamente al suscribirte
      try {
        if (refInfo && refInfo.discount_active) {
          z.insertAdjacentHTML('afterbegin', `<div class="pz-disc">🎁 <b>50% off por referidos</b>: se aplica automáticamente al suscribirte.</div>`);
        } else if (refInfo && refInfo.invited && !hasActive) {
          z.insertAdjacentHTML('afterbegin', `<div class="pz-disc">🎉 <b>Tenés 20% off de invitado</b>: se aplica automáticamente al suscribirte, todos los meses.</div>`);
        }
      } catch (e) {}
      // Plan preseleccionado desde /prueba (?plan_sel=): click programático UNA vez
      if (!PZ_AUTO_PLAN && !hasActive) {
        const pq = new URLSearchParams(location.hash.split('?')[1] || '');
        const sel = (pq.get('plan_sel') || '').replace(/[^a-z]/g, '');
        if (sel) {
          PZ_AUTO_PLAN = true;
          try { history.replaceState(null, '', location.pathname + '#/app/ajustes'); } catch (e) {}
          localStorage.removeItem('posta_chosen_plan');
          const btn = document.querySelector(`#planList [data-sub="${sel}"]`);
          if (btn && !btn.disabled) btn.click();
        }
      }
    } catch (e) { z.innerHTML = `<div class="err">No se pudieron cargar los planes</div>`; }
  })();
  // 🎁 Referidos
  (async () => {
    const z = $('#refZone');
    if (!z) return;
    const info = await pzReferral();
    if (!info || !info.ok) { z.innerHTML = `<p style="color:var(--dim)">No se pudo cargar tu link de referidos.</p>`; return; }
    const n = info.referred_count || 0, need = info.needed || 2;
    const pct = Math.min(100, Math.round(n / need * 100));
    const missing = Math.max(0, need - n);
    // Precio concreto según el plan actual (o el del trial)
    let planPrice = 0;
    try {
      const pd = await api.get('/api/billing/plans');
      const pl = (pd.plans || []).find(x => x.id === ((ME && ME.plan) || 'esencial')) || (pd.plans || [])[0];
      if (pl) planPrice = pl.price || 0;
    } catch (e) {}
    const fmt$ = (v) => '$' + Math.round(v).toLocaleString('es-AR');
    const half$ = planPrice ? fmt$(planPrice / 2) : null;
    const shareMsg = `Uso Posta para el Instagram de mi negocio: crea y publica el contenido por mí. Con mi link ahorrás hasta $25.980 por mes en tu plan: ${info.link}`;
    const slots = Array.from({ length: need }, (_, i) =>
      `<span class="pz-slot${i < n ? ' on' : ''}">${i < n ? '\u2713' : (i + 1)}</span>`).join('');
    z.innerHTML = `
      <div class="pz-ref-hero">
        <div class="pz-ref-hero-t">🎁 Pagás la mitad, todos los meses</div>
        ${half$ ? `<div class="pz-ref-hero-p">Pasás de <s>${fmt$(planPrice)}</s> a <b>${half$}</b>/mes con ${need} referidos suscriptos.</div>`
          : `<div class="pz-ref-hero-p">Con <b>${need} referidos</b> suscriptos, tu plan te sale <b>la mitad</b>.</div>`}
      </div>
      <div class="pz-ref-steps">
        <div><span>1️⃣</span>Compartí tu link</div>
        <div><span>2️⃣</span>Ellos se suscriben con <b>20% off todos los meses</b></div>
        <div><span>3️⃣</span>Vos pagás la mitad mientras sigan suscriptos</div>
      </div>
      <div class="pz-ref-share">
        <button class="btn btn-wa btn-sm" data-share="wa">WhatsApp</button>
        <button class="btn btn-ig btn-sm" data-share="ig">Instagram</button>
        <button class="btn btn-x btn-sm" data-share="x">X</button>
        <button class="btn btn-primary btn-sm" id="pzRefNative" style="display:none">📤 Compartir</button>
        <button class="btn btn-ghost btn-sm" id="pzRefCopy">Copiar link</button>
        <button class="btn btn-ghost btn-sm" id="pzRefCopyMsg">Copiar mensaje</button>
      </div>
      <div class="pz-refrow">
        <input id="pzRefLink" readonly value="${esc(info.link)}" onclick="this.select()">
      </div>
      <details style="font-size:11.5px;color:var(--mut);margin:0 0 12px"><summary style="cursor:pointer;font-weight:700">👀 Vista previa del mensaje</summary><p style="background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0 0">${esc(shareMsg)}</p></details>
      <div class="pz-ref-slots">${slots}</div>
      <div class="pz-refbar"><div style="width:${pct}%"></div></div>
      <p style="font-size:12.5px;color:var(--mut)"><b>${n}/${need}</b> referidos</p>
      ${(info.joined && info.joined.length) ? `<div class="pz-ref-joined"><div class="pz-ref-joined-t">Se unieron con tu link 🎉</div>${info.joined.map(nm => `<div class="pz-ref-join">✓ ${esc(nm)}</div>`).join('')}</div>` : ''}
      ${(info.pending && info.pending.length) ? `<div class="pz-ref-joined"><div class="pz-ref-joined-t">En camino 🚶</div><div class="pz-ref-pending-sub">Se registraron con tu link y están en prueba. Un mensaje tuyo los convierte 👇</div>${info.pending.map((p, i) => `<div class="pz-ref-join">⏳ ${esc(p.name)}${p.days_left > 0 ? `<span class="pz-ref-days"> · le quedan ${p.days_left} día${p.days_left === 1 ? '' : 's'} de prueba</span>` : ''} <button class="btn btn-ghost btn-sm" data-nudge="${i}" style="margin-left:6px">📋 Copiar mensaje</button></div>`).join('')}</div>` : ''}
      ${info.discount_active
        ? `<div class="pz-disc">✅ Tenés <b>50% off activo</b>${half$ ? ` en tu suscripción: pagás <b>${half$}/mes</b>` : ' en tu suscripción'}.</div>`
        : `<p style="font-size:12.5px">${missing === 1 ? 'Nos falta <b>1</b> referido' : `Nos faltan <b>${missing}</b> referidos`}: cuando se suscriban con tu link, pagás la mitad.</p>`}
      <p class="pz-ref-auto">⚡ El descuento se aplica solo a tu suscripción, sin hacer nada.</p>
      <span id="pzRefMsg" style="font-size:11.5px"></span>`;
    const say = (t) => { const m = $('#pzRefMsg'); if (m) m.innerHTML = `<span style="color:var(--cel)">${t}</span>`; };
    const copyLink = async (okMsg) => {
      const v = $('#pzRefLink').value;
      try { await navigator.clipboard.writeText(v); }
      catch (e) {
        const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e2) {}
        t.remove();
      }
      say(okMsg || '✅ Link copiado');
    };
    $('#pzRefCopy').onclick = () => copyLink();
    const copyText = async (t, okMsg) => {
      try { await navigator.clipboard.writeText(t); }
      catch (e) {
        const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        ta.remove();
      }
      say(okMsg || '✅ Copiado');
    };
    $('#pzRefCopyMsg').onclick = () => copyText(shareMsg, '✅ Mensaje copiado: pegalo donde quieras');
    z.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => {
      const p = info.pending[Number(b.dataset.nudge)];
      if (!p) return;
      const who = (p.name && p.name !== 'Un referido') ? ` ${p.name}` : '';
      copyText(`Che${who}! Vi que empezaste tu prueba de Posta con mi link 🚀 Si te suscribís${p.days_left > 0 ? ` (te quedan ${p.days_left} día${p.days_left === 1 ? '' : 's'} de prueba)` : ''}, mantenés el 20% off todos los meses. Cualquier cosa me preguntás 👍`, '✅ Mensaje copiado: pegalo en WhatsApp');
    });
    const nativeBtn = $('#pzRefNative');
    if (nativeBtn && navigator.share) {
      nativeBtn.style.display = '';
      nativeBtn.onclick = async () => { try { await navigator.share({ title: 'Posta', text: shareMsg }); } catch (e) {} };
    }
    z.querySelectorAll('[data-share]').forEach(b => b.onclick = () => {
      const k = b.dataset.share;
      if (k === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(shareMsg), '_blank');
      else if (k === 'x') window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareMsg), '_blank');
      else if (k === 'ig') copyLink('✅ Link copiado: pegalo en tu historia o por DM');
    });
  })();
  // Marca
  const bBlog = $('#btnBrandLogo');
  if (bBlog) bBlog.onclick = () => $('#s_logofile').click();
  $$('[data-lightbox]').forEach(el => el.onclick = () => openLightbox(el.dataset.lightbox, el.dataset.video === '1'));
  // Si el creador ya tenía 6 opciones generadas, las regenera con los colores
  // nuevos para que el cambio se vea al instante (cero pasos extra).
  async function refreshCreatorWithNewColors(msgEl) {
    try {
      const cc = (typeof CREATOR !== 'undefined' && CREATOR) || null;
      if (!cc || !Array.isArray(cc.options) || cc.options.length !== 6 || !cc.topic) return false;
      if (msgEl) msgEl.innerHTML = '<span style="font-size:12.5px;color:var(--cel)">🎨 Actualizando tus diseños…</span>';
      const out = await api.post('/api/creator/options', { topic: cc.topic, productPhoto: cc.productPhoto || undefined });
      if (out && Array.isArray(out.options) && out.options.length === 6) {
        cc.options = out.options; cc.detected = out.detected || null;
        cc.recommendedIndex = out.recommendedIndex || 0;
        cc.recommendedReason = out.recommendedReason || '';
        cc.selected = []; cc.cardPhoto = {};
        return true;
      }
    } catch (e) { /* no bloquea el guardado */ }
    return false;
  }
  const slf = $('#s_logofile');
  if (slf) slf.onchange = async () => {
    const orig = slf.files[0]; slf.value = '';
    if (!orig) return;
    try {
      const nm = (orig.name || '').toLowerCase();
      if (nm.endsWith('.pdf') || nm.endsWith('.docx')) $('#brandMsg').innerHTML = '<span style="font-size:12.5px;color:var(--dim)">⏳ Convirtiendo tu archivo a imagen…</span>';
      const f = await logoFileToImage(orig);
      await uploadAssetFile(f, 'logo');
      try {
        const img = await loadImageFile(f);
        const cols = extractTopColors(img, 3);
        if (cols.length >= 2) await api.put('/api/settings', { brand_colors: cols });
      } catch (e) { /* el logo quedó; los colores se eligen a mano */ }
      SETTINGS = await api.get('/api/settings').catch(() => SETTINGS);
      const refreshed = await refreshCreatorWithNewColors($('#brandMsg'));
      if (refreshed) $('#brandMsg').innerHTML = '<span style="font-size:12.5px;color:var(--cel)">✅ Colores actualizados en tus diseños</span>';
      render();
    }
    catch (e) { $('#brandMsg').innerHTML = (e && e.cancelled) ? '' : `<span style="color:var(--red);font-size:12.5px">${esc(e.message)}</span>`; }
  };
  // --- vista previa de marca ---
  const lumInk = (hex) => {
    const n = parseInt(String(hex).slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#0A1E33' : '#FFFFFF';
  };
  function renderBrandPrev() {
    const logo = assetLogo();
    const pf = $('#brandPf');
    if (pf) pf.innerHTML = logo ? `<img src="${logo.file_path}" alt="logo">` : '';
    const box = $('#brandPrev');
    if (!box) return;
    const c = [$('#s_c0') && $('#s_c0').value, $('#s_c1') && $('#s_c1').value, $('#s_c2') && $('#s_c2').value].filter(Boolean);
    if (!c.length) { box.innerHTML = ''; return; }
    const biz = (PROFILE && PROFILE.business_name) || 'Tu negocio';
    const ink = lumInk(c[0]);
    box.innerHTML = `
      <div class="bp-card" style="background:linear-gradient(135deg,${c[0]},${c[1] || c[0]})">
        <div class="bp-head">${logo ? `<img src="${logo.file_path}">` : ''}<span style="color:${ink}">${esc(biz)}</span></div>
        <div class="bp-title" style="color:${ink}">¡NUEVA<br>COLECCIÓN!</div>
        <div><span class="bp-cta" style="background:${c[2] || c[1] || c[0]};color:${lumInk(c[2] || c[1] || c[0])}">Ver más →</span></div>
      </div>`;
  }
  let brandDirty = false;
  const bDirtyEl = $('#brandDirty');
  function markBrandDirty() { if (!brandDirty) { brandDirty = true; if (bDirtyEl) bDirtyEl.style.display = ''; } }
  const normHex = (v) => {
    let h = String(v || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
    return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toUpperCase() : null;
  };
  const syncHexFromPicker = (i) => { const hx = $('#s_h' + i); const pk = $('#s_c' + i); if (hx && pk) hx.value = pk.value.toUpperCase(); };
  ['s_c0', 's_c1', 's_c2'].forEach((id, i) => {
    const pick = document.getElementById(id);
    const hex = document.getElementById('s_h' + i);
    if (pick) pick.addEventListener('input', () => { syncHexFromPicker(i); markBrandDirty(); renderBrandPrev(); });
    if (hex && pick) {
      hex.addEventListener('input', () => {
        const n = normHex(hex.value);
        if (n) { pick.value = n; markBrandDirty(); renderBrandPrev(); }
      });
      hex.addEventListener('change', () => {
        const n = normHex(hex.value);
        hex.value = n || pick.value.toUpperCase();
        if (n) { pick.value = n; markBrandDirty(); renderBrandPrev(); }
      });
    }
  });
  // Reordenar roles: el menú de cada color permite elegir Principal/Secundario/Acento;
  // los colores se intercambian de lugar solos. El rol es posicional: el menú vuelve a su lugar.
  const swapBrandColors = (a, b) => {
    const pa = document.getElementById('s_c' + a), pb = document.getElementById('s_c' + b);
    if (!pa || !pb) return;
    const va = pa.value;
    pa.value = pb.value; pb.value = va;
    syncHexFromPicker(a); syncHexFromPicker(b);
    markBrandDirty(); renderBrandPrev();
  };
  [0, 1, 2].forEach((i) => {
    const sel = document.getElementById('s_r' + i);
    if (sel) sel.addEventListener('change', () => {
      const to = parseInt(sel.value, 10);
      sel.value = String(i);
      if (Number.isInteger(to) && to >= 0 && to <= 2 && to !== i) swapBrandColors(i, to);
    });
  });
  renderBrandPrev();
  const bBlogDel = $('#btnBrandLogoDel');
  if (bBlogDel) bBlogDel.onclick = async () => {
    if (!confirm('¿Quitar el logo de tu marca?')) return;
    const logo = assetLogo();
    if (logo && logo.id) { try { await api.del('/api/assets/' + logo.id); } catch (e) {} }
    ASSETS = await api.get('/api/assets').catch(() => []);
    render();
  };
  // Si hay logo pero no colores de marca: detectarlos del logo automáticamente
  (async () => {
    try {
      if (brandColors().length >= 2) return;
      const logo = assetLogo();
      if (!logo) return;
      const img = await loadImageUrl(logo.file_path);
      const cols = extractTopColors(img, 3);
      let filled = 0;
      cols.forEach((c, i) => { const inp = $('#s_c' + i); if (inp && c) { inp.value = c; syncHexFromPicker(i); filled++; } });
      if (filled >= 2) $('#brandMsg').innerHTML = '<span style="color:var(--mut);font-size:12.5px">🎨 Detectamos tus colores del logo — tocá Guardar marca para confirmar.</span>';
    } catch (e) { /* quedan los valores actuales */ }
  })();
  $('#btnSaveBrand').onclick = async () => {
    const colors = [$('#s_c0').value, $('#s_c1').value, $('#s_c2').value].filter((c, i, a) => a.indexOf(c) === i);
    const untouched = NEUTRAL_TRIO.every((d, i) => (colors[i] || '').toUpperCase() === d);
    if (untouched && !assetLogo()) { $('#brandMsg').innerHTML = `<span style="color:var(--red);font-size:12.5px">Subí tu logo o elegí tus colores 🙂</span>`; return; }
    await api.put('/api/settings', { brand_colors: colors });
    const brandMsgEl = $('#brandMsg');
    brandMsgEl.innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Marca guardada</span>';
    brandDirty = false; if (bDirtyEl) bDirtyEl.style.display = 'none';
    SETTINGS = await api.get('/api/settings');
    if (await refreshCreatorWithNewColors(brandMsgEl))
      brandMsgEl.innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Marca guardada — diseños actualizados</span>';
  };
  // Reiniciar todo: marca (logo, colores, nombre) + posteos pendientes (borradores y
  // programados). Para cuando se cambió de negocio/cuenta. El historial publicado no se toca.
  const btnResetBrand = $('#btnResetBrand');
  if (btnResetBrand) btnResetBrand.onclick = async () => {
    if (!confirm('¿Reiniciar todo? Se borran el logo, los colores, el nombre del negocio y los posteos pendientes (borradores y programados). El historial publicado no se toca.')) return;
    const brandMsgEl = $('#brandMsg');
    try {
      brandMsgEl.innerHTML = '<span style="color:var(--mut);font-size:12.5px">⏳ Reiniciando…</span>';
      await api.post('/api/brand/reset', {});
      ASSETS = await api.get('/api/assets').catch(() => []);
      SETTINGS = await api.get('/api/settings').catch(() => SETTINGS);
      await refreshSession();
      brandDirty = false; if (bDirtyEl) bDirtyEl.style.display = 'none';
      render();
    } catch (e) {
      brandMsgEl.innerHTML = `<span style="color:var(--red);font-size:12.5px">${esc(e.message)}</span>`;
    }
  };
  $('#btnSaveSettings').onclick = async () => {
    await api.put('/api/settings', {
      meta_app_id: $('#s_appid').value,
      meta_app_secret: $('#s_appsecret').value, ig_embed_url: $('#s_igembed').value,
    });
    $('#setMsg').innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Guardado</span>';
  };
  const btm = $('#btnTestMeta');
  if (btm) btm.onclick = async () => {
    const msg = $('#metaTestMsg');
    const appId = $('#s_appid').value.trim(), appSecret = $('#s_appsecret').value.trim();
    if (!appId || !appSecret) { msg.innerHTML = '<span style="color:var(--red)">Completá App ID y App Secret primero</span>'; return; }
    msg.textContent = 'Probando…';
    try {
      const r = await api.post('/api/settings/test-meta', { app_id: appId, app_secret: appSecret });
      msg.innerHTML = r.ok
        ? `<span style="color:var(--green-d)">✅ App válida: <b>${esc(r.app_name)}</b></span>`
        : `<span style="color:var(--red)">❌ ${esc(r.error)}</span>`;
    } catch (e) { msg.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`; }
  };
  const setDemoMode = async (v) => {
    await api.put('/api/settings', { demo_mode: v });
    IG_MODE_WARN = (!v && !(PROFILE && PROFILE.ig_connected));
    render();
  };
  const md = $('#igModeDemo'); if (md) { md.onclick = () => setDemoMode(true); md.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDemoMode(true); } }; }
  const mr = $('#igModeReal'); if (mr) { mr.onclick = () => setDemoMode(false); mr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDemoMode(false); } }; }
  const bc = $('#btnIgConn');
  if (bc) bc.onclick = igConnect;
  const bd = $('#btnIgDisc');
  if (bd) bd.onclick = async () => {
    const u = (PROFILE && PROFILE.ig_username) ? '@' + PROFILE.ig_username : 'tu cuenta';
    if (!confirm(`¿Desconectar ${u} de Posta?\n\nTus posteos programados se pausarán hasta que vuelvas a conectar.`)) return;
    track('ig_disconnect'); trackBeacon();
    await api.post('/api/ig/disconnect'); render();
  };
  const stampVerified = () => {
    const d = new Date();
    IG_VERIFIED_AT = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const bv = $('#btnIgVerify');
  if (bv) bv.onclick = async () => {
    const vm = $('#igVerifyMsg');
    if (vm) vm.innerHTML = '<div class="hint">🔍 Verificando tu conexión con Instagram…</div>';
    try {
      const r = await api.get('/api/ig/sync');
      if (r && r.username) {
        PROFILE.ig_username = r.username;
        stampVerified();
        render();
      } else if (vm) {
        vm.innerHTML = `<div class="err">❌ No se pudo verificar: ${esc((r && r.error) || 'respuesta vacía')}</div>`;
      }
    } catch (e) {
      if (vm) vm.innerHTML = `<div class="err">❌ La verificación falló: ${esc(e.message)}</div>`;
    }
  };
  const igProLink = $('#igProLink');
  if (igProLink) igProLink.onclick = (e) => { e.preventDefault(); const g = $('#igProGuide'); if (g) g.style.display = g.style.display === 'none' ? '' : 'none'; };
  const igRetry = $('#btnIgRetry');
  if (igRetry) igRetry.onclick = () => igConnect();
  // Si está conectado pero el username quedó vacío: sincronizar solo (reintenta una vez a los 10s)
  if (PROFILE && PROFILE.ig_connected && !PROFILE.ig_username) {
    const doIgSync = async (isRetry) => {
      const m = $('#igMsg');
      const bindRetry = () => {
        const rb = $('#igSyncRetry');
        if (rb) rb.onclick = (ev) => { ev.preventDefault(); doIgSync(false); };
      };
      try {
        const r = await api.get('/api/ig/sync');
        if (r && r.username) { PROFILE.ig_username = r.username; render(); return; }
        throw new Error((r && r.error) || 'respuesta vacía');
      } catch (e) {
        if (!isRetry) {
          if (m) m.innerHTML = `<div class="hint">🔄 Sincronizando tu cuenta de Instagram…</div>`;
          setTimeout(() => doIgSync(true), 10000);
        } else {
          if (m) m.innerHTML = `<div class="err">⚠️ No se pudo leer tu @ de Instagram: ${esc(e.message)} <a href="#" id="igSyncRetry" style="color:var(--cel);font-weight:700">Reintentar</a></div>`;
          bindRetry();
        }
      }
    };
    doIgSync(false);
  }
  // Verificación silenciosa: conectado con username → tildar el checklist sin pedir taps
  if (PROFILE && PROFILE.ig_connected && PROFILE.ig_username && !IG_VERIFIED_AT) {
    (async () => {
      try {
        const r = await api.get('/api/ig/sync');
        if (r && r.username) { PROFILE.ig_username = r.username; stampVerified(); render(); }
      } catch (e) { /* queda sin verificar; el botón manual sigue disponible */ }
    })();
  }
}

/* ---------- 📊 Panel de analytics (solo equipo Posta) ---------- */
// Ruta oculta #/app/admin. Gate: token de admin (el mismo ADMIN_TOKEN del servidor).
function adminToken() { try { return localStorage.getItem('posta_admin_token') || ''; } catch (e) { return ''; } }
function adminApi(path, method, data) {
  const t = adminToken();
  const url = '/api/admin/' + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
  if (method === 'POST') return api.post(url, data || {});
  return api.get(url);
}
async function adminView() {
  return `<div class="page-head"><div class="ph-ico">📊</div><div class="ph-txt"><h1>Analytics</h1><p class="sub">Cómo se usa Posta — solo equipo</p></div></div>
  <div class="card" id="adminCard"><div class="d">⏳ Cargando…</div></div>`;
}
async function bindAdmin() {
  const card = $('#adminCard'); if (!card) return;
  if (!adminToken()) {
    card.innerHTML = `<h3 style="margin:0 0 8px">🔒 Acceso restringido</h3>
      <p class="d">Pegá el token de admin del servidor (ADMIN_TOKEN).</p>
      <div class="field"><input id="adTok" type="password" placeholder="token" style="width:100%;font-size:16px"></div>
      <button class="btn btn-primary" id="adTokGo">Entrar</button>
      <div id="adTokMsg" style="margin-top:8px"></div>`;
    $('#adTokGo').onclick = async () => {
      const v = ($('#adTok').value || '').trim();
      if (!v) return;
      try { localStorage.setItem('posta_admin_token', v); } catch (e) {}
      try { await adminApi('funnel?days=7'); bindAdmin(); }
      catch (e) {
        try { localStorage.removeItem('posta_admin_token'); } catch (ee) {}
        $('#adTokMsg').innerHTML = `<div class="err">Token inválido.</div>`;
      }
    };
    return;
  }
  card.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-soft btn-sm" data-atab="funnel">Funnel /prueba</button>
      <button class="btn btn-soft btn-sm" data-atab="activity">Actividad</button>
      <button class="btn btn-soft btn-sm" data-atab="users">Por usuario</button>
      <button class="btn btn-soft btn-sm" data-atab="review">✨ Revisión</button>
      <select id="adDays" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px">
        <option value="7">7 días</option><option value="30" selected>30 días</option>
      </select>
    </div>
    <div id="adBody"><div class="d">⏳ Cargando…</div></div>`;
  const body = $('#adBody');
  const days = () => ($('#adDays') && $('#adDays').value) || '30';
  const bar = (pct) => `<div style="height:10px;background:var(--bg2);border-radius:99px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${Math.max(1, Math.min(100, pct))}%;background:var(--cel);border-radius:99px"></div></div>`;
  async function showFunnel() {
    body.innerHTML = `<div class="d">⏳ Cargando funnel…</div>`;
    let r;
    try { r = await adminApi('funnel?days=' + days()); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar. Revisá el token.</div>`; return; }
    const f = r.funnel || [];
    body.innerHTML = f.map((s, i) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b>${i + 1}. ${esc(s.label)}</b>
          <span style="font-size:17.5px;font-weight:800">${s.users}</span>
        </div>
        ${bar(s.pct_first)}
        <div style="font-size:11.5px;color:var(--mut);margin-top:4px">${s.pct_prev}% del paso anterior · ${s.pct_first}% del inicio</div>
      </div>`).join('') || `<div class="d">Todavía no hay datos.</div>`;
  }
  async function showActivity() {
    body.innerHTML = `<div class="d">⏳ Cargando actividad…</div>`;
    let r;
    try { r = await adminApi('activity?days=' + days()); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const dau = (r.dau || []).slice(0, 14).reverse();
    const maxD = Math.max(1, ...dau.map(x => x.n));
    const tops = Object.entries(r.totals || {}).slice(0, 20);
    body.innerHTML = `
      <h4 style="margin:0 0 8px">Usuarios activos por día</h4>
      <div style="display:flex;align-items:flex-end;gap:4px;height:90px;margin-bottom:16px">
        ${dau.map(x => `<div title="${esc(x.d)}: ${x.n}" style="flex:1;background:var(--cel);border-radius:4px 4px 0 0;height:${Math.max(3, x.n / maxD * 88)}px;min-width:8px"></div>`).join('')}
      </div>
      <h4 style="margin:0 0 8px">Eventos más comunes</h4>
      ${tops.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span style="font-family:monospace;font-size:11.5px">${esc(k)}</span><b>${v}</b></div>`).join('') || '<div class="d">Sin datos.</div>'}`;
  }
  async function showUsers() {
    body.innerHTML = `
      <div class="field" style="display:flex;gap:8px"><input id="adQ" placeholder="email del usuario…" style="flex:1;font-size:16px"><button class="btn btn-primary btn-sm" id="adQGo">Buscar</button></div>
      <div id="adUsers"></div><div id="adTimeline" style="margin-top:12px"></div>`;
    const go = async () => {
      const q = ($('#adQ').value || '').trim();
      if (!q) return;
      $('#adUsers').innerHTML = `<div class="d">⏳ Buscando…</div>`;
      let r;
      try { r = await adminApi('users?q=' + encodeURIComponent(q)); }
      catch (e) { $('#adUsers').innerHTML = `<div class="err">Error.</div>`; return; }
      $('#adUsers').innerHTML = (r.users || []).map(u => `
        <button class="btn btn-ghost btn-block" data-uid="${u.id}" style="text-align:left;margin-bottom:6px">
          <b>${esc(u.email)}</b><br><span style="font-size:10.5px;color:var(--mut)">${esc(u.plan || '')} · ${esc(u.plan_status || '')} · desde ${esc((u.created_at || '').slice(0, 10))}</span>
        </button>`).join('') || `<div class="d">Sin resultados.</div>`;
      $$('#adUsers [data-uid]').forEach(b => b.onclick = async () => {
        $('#adTimeline').innerHTML = `<div class="d">⏳ Cargando línea de tiempo…</div>`;
        let t;
        try { t = await adminApi('events?user_id=' + b.dataset.uid + '&days=' + days() + '&limit=200'); }
        catch (e) { $('#adTimeline').innerHTML = `<div class="err">Error.</div>`; return; }
        $('#adTimeline').innerHTML = `<h4 style="margin:0 0 8px">Línea de tiempo</h4>` + ((t.events || []).map(e => {
          let pr = '';
          try { const o = JSON.parse(e.props || '{}'); const ks = Object.keys(o).slice(0, 4); if (ks.length) pr = ' <span style="color:var(--mut)">(' + ks.map(k => k + ': ' + String(o[k]).slice(0, 24)).join(', ') + ')</span>'; } catch (ee) {}
          return `<div style="padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px"><span style="color:var(--mut);font-size:10.5px">${esc((e.created_at || '').slice(5, 16).replace(' ', ' · '))}</span> <b style="font-family:monospace;font-size:11.5px">${esc(e.name)}</b>${pr}</div>`;
        }).join('') || `<div class="d">Sin eventos.</div>`);
      });
    };
    $('#adQGo').onclick = go;
    $('#adQ').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }
  // Cola de revisión de la "primera semana con rueditas": borradores con
  // needs_review=1. Aprobar → visible al cliente + golden example. Editar →
  // aplica caption, aprueba y guarda el golden con lo final. Rechazar → nota
  // que alimenta el aprendizaje y regenera el borrador con otro enfoque.
  async function showReview() {
    body.innerHTML = `<div class="d">⏳ Cargando cola de revisión…</div>`;
    let r;
    try { r = await adminApi('review-queue'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const q = r.queue || [];
    if (!q.length) { body.innerHTML = `<div class="d">✨ Nada pendiente. La cola está vacía.</div>`; return; }
    body.innerHTML = `<div style="margin-bottom:10px;font-size:13px;color:var(--mut)">${q.length} borrador${q.length > 1 ? 'es' : ''} esperando revisión</div>` +
      q.map(p => `
      <div data-rev="${p.id}" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px">
          <b style="font-size:14px">${esc(p.business_name || p.email || ('Usuario ' + p.user_id))}</b>
          <span style="font-size:11px;color:var(--mut)">${esc((p.created_at || '').slice(0, 16))} · ${esc(p.tipo || p.media_type || '')}</span>
        </div>
        ${p.image_url ? `<img src="${esc(p.image_url)}" style="width:100%;border-radius:10px;margin-bottom:8px" loading="lazy">` : ''}
        <div style="font-size:13.5px;white-space:pre-wrap;margin-bottom:4px">${esc(p.caption || '')}</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:10px">${esc(p.hashtags || '')}</div>
        <textarea data-rev-note rows="2" placeholder="Nota para el rechazo (¿qué hay que cambiar?)" style="font-size:16px;width:100%;border:2px solid var(--line);border-radius:10px;padding:8px;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-rev-approve="${p.id}">✅ Aprobar</button>
          <button class="btn btn-soft btn-sm" data-rev-edit="${p.id}">✏️ Aprobar con edición</button>
          <button class="btn btn-soft btn-sm" data-rev-reject="${p.id}">🔄 Rechazar y regenerar</button>
        </div>
      </div>`).join('');
    body.querySelectorAll('[data-rev-approve]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revApprove + '/approve', 'POST'); showReview(); }
      catch (e) { alert('No se pudo aprobar'); b.disabled = false; }
    });
    body.querySelectorAll('[data-rev-edit]').forEach(b => b.onclick = async () => {
      const orig = (q.find(x => String(x.id) === String(b.dataset.revEdit)) || {});
      const cap = prompt('Caption final:', orig.caption || '');
      if (cap === null) return;
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revEdit + '/edit', 'POST', { caption: cap }); showReview(); }
      catch (e) { alert('No se pudo guardar'); b.disabled = false; }
    });
    body.querySelectorAll('[data-rev-reject]').forEach(b => b.onclick = async () => {
      const card = body.querySelector(`[data-rev="${b.dataset.revReject}"]`);
      const note = card && card.querySelector('[data-rev-note]') ? card.querySelector('[data-rev-note]').value.trim() : '';
      if (!note) { alert('Escribí una nota: ¿qué hay que cambiar?'); return; }
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revReject + '/reject', 'POST', { note }); showReview(); }
      catch (e) { alert('No se pudo rechazar'); b.disabled = false; }
    });
  }
  $$('#adminCard [data-atab]').forEach(b => b.onclick = () => {
    $$('#adminCard [data-atab]').forEach(x => x.classList.remove('btn-primary'));
    b.classList.add('btn-primary');
    ({ funnel: showFunnel, activity: showActivity, users: showUsers, review: showReview })[b.dataset.atab]();
  });
  const f0 = $('#adminCard [data-atab="funnel"]'); if (f0) f0.click();
  const dd = $('#adDays'); if (dd) dd.onchange = () => { const cur = $('#adminCard .btn-primary[data-atab]'); if (cur) cur.click(); };
}

window.addEventListener('hashchange', render);
render();
setTimeout(trackScreen, 800); // primer screen_view de la carga (hashchange no dispara al entrar)
