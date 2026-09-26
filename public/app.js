/* Posta — frontend */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const api = {
  async req(method, url, body) {
    let r;
    try {
      r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new Error('El servidor no responde. Revisá tu conexión y probá de nuevo.');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error');
    return data;
  },
  get: (u) => api.req('GET', u),
  post: (u, b) => api.req('POST', u, b),
  put: (u, b) => api.req('PUT', u, b),
  patch: (u, b) => api.req('PATCH', u, b),
  del: (u) => api.req('DELETE', u),
};

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

async function refreshSession() {
  try {
    const { user } = await api.get('/api/auth/me');
    ME = user;
    if (user) {
      PROFILE = await api.get('/api/profile');
      SETTINGS = await api.get('/api/settings');
      ASSETS = await api.get('/api/assets').catch(() => []);
    }
  } catch { ME = null; }
}
function assetPhotos() { return ASSETS.filter(a => a.kind === 'photo'); }
function assetLogo() { return ASSETS.find(a => a.kind === 'logo'); }

/* ---------- Zonas horarias ---------- */
function zonedTimeToUtc(y, mo, d, h, mi, tz) {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p = Object.fromEntries(fmt.formatToParts(guess).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return new Date(guess.getTime() - (asUTC - guess.getTime()));
}
// Fecha ISO (UTC) del día (hoy+i+1) a las 19:00 en la zona horaria del negocio
function slotDate19(i, tz) {
  try {
    const now = new Date();
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + i + 1);
    return zonedTimeToUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), 19, 0, tz).toISOString();
  } catch {
    const d = new Date(); d.setDate(d.getDate() + i + 1); d.setHours(19, 0, 0, 0);
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
const TIMEZONES = ['America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Asuncion', 'America/Montevideo', 'America/Sao_Paulo', 'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/New_York', 'Europe/Madrid'];

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
      <p style="color:var(--mut);font-size:14px;margin-bottom:18px">${esc(p.tagline)}</p>
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
    if (localStorage.getItem('posta_ref')) return `<div class="pz-refband">🎉 Llegaste con el link de un amigo</div>`;
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
    <a class="logo" href="#/">Posta<span class="dot">.</span></a>
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
    <div class="pill">Tu equipo de marketing en automático <b>🇦🇷</b></div>
    <h1>Vos vendé. <span class="hl">Nosotros posteamos.</span></h1>
    <p class="sub"><b>Vos no te ocupás de nada.</b> Contanos de tu negocio una sola vez: creamos las ideas, los diseños y los captions, y publicamos solo en tu Instagram.</p>
    <div class="hero-cta">
      <a class="btn btn-primary" href="#/registro">Empezar ahora</a>
      <a class="btn btn-ghost" href="/demo">✨ Probar gratis</a>
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
          <img src="hero-feed.png" alt="Feed de Instagram gestionado por Posta">
        </div>
      </div>
    </div>
    <div class="hero-note">Sin tarjeta · 7 días gratis · 🛡️ Garantía de 30 días · Cancelá cuando quieras</div>
    <div class="mock-row">
      <div class="phone"><div class="screen">
        <img src="hero-post.png" alt="Ejemplo de posteo creado por Posta">
        <div class="cap"><b>tu_negocio</b> 🔥 Nuevo ingreso que te va a encantar... <br><span style="color:#2793C8">#modaargentina #emprendedoresargentinos</span></div>
      </div></div>
      <div class="phone"><div class="screen">
        <video src="hero-reel2.mp4" autoplay muted loop playsinline></video>
        <div class="cap"><b>Pet Shop Huella</b> 🎬 Su reel de la semana, hecho con Posta...</div>
      </div></div>
    </div>
  </div></div>
  <div class="sample-banner"><div class="wrap">
    <div class="sample-txt"><b>🎁 3 posteos de muestra GRATIS</b><span>Generala vos mismo en 30 segundos, con tu negocio real. Sin registro.</span></div>
    <a class="btn btn-primary" href="/demo">Quiero mi muestra gratis</a>
  </div></div>
  <div class="pz-trialband"><div class="wrap">
    <div class="pz-trialband-txt"><b>🚀 Probá la app completa</b><span>Te armamos tus ideas + tu semana en 2 minutos. Una sola vez, sin registro.</span></div>
    <a class="btn btn-primary" href="/prueba">Probar la app</a>
  </div></div>
  <div class="section" id="ejemplos" style="background:var(--bg2)"><div class="wrap">
    <h2>Hecho con Posta</h2>
    <p class="lede">Diseños y videos creados en minutos, para cualquier rubro. Cada post de nuestros clientes lleva la marca Hecho con Posta — es nuestra mejor publicidad.</p>
    <div class="show-row">
      <div class="phone sm"><div class="screen"><img src="post-food.png" alt="Diseño para restaurante creado por Posta"></div><div class="cap"><b>Gastronomía</b> · Café & brunch</div></div>
      <div class="phone sm"><div class="screen"><video src="showcase-reel-cafe2.mp4" autoplay muted loop playsinline></video></div><div class="cap"><b>▶ Showreel</b> · Café Martínez</div></div>
      <div class="phone sm"><div class="screen"><img src="post-moda.png" alt="Diseño para tienda de ropa creado por Posta"></div><div class="cap"><b>Moda</b> · Tienda Cora</div></div>
      <div class="phone sm"><div class="screen"><img src="post-barber.png" alt="Diseño para barbería creado por Posta"></div><div class="cap"><b>Barbería</b> · El Corte</div></div>
      <div class="phone sm"><div class="screen"><img src="post-belleza.png" alt="Diseño para estética creado por Posta"></div><div class="cap"><b>Belleza</b> · Estética Alma</div></div>
      <div class="phone sm"><div class="screen"><img src="post-mascotas.png" alt="Diseño para pet shop creado por Posta"></div><div class="cap"><b>Mascotas</b> · Pet Shop Huella</div></div>
      <div class="phone sm"><div class="screen"><img src="post-fitness.png" alt="Diseño para gimnasio creado por Posta"></div><div class="cap"><b>Fitness</b> · Gym Norte</div></div>
      <div class="phone sm"><div class="screen"><img src="gastro-1.png" alt="Promo 2x1 para restaurante creada por Posta"></div><div class="cap"><b>Gastronomía</b> · Promo 2x1</div></div>
    </div>
  </div></div>
  <div class="section" id="como-funciona"><div class="wrap">
    <h2>Así de simple</h2>
    <p class="lede">Vos seguí atendiendo tu negocio. Del resto nos ocupamos nosotros.</p>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Contanos tu negocio una vez</h3><p>Qué vendés, tu estilo y tus competidores. Te lleva 2 minutos y no te pedimos más nada.</p></div>
      <div class="step"><div class="num">2</div><h3>Creamos todo por vos</h3><p>Ideas estratégicas, diseños con tus fotos y tu marca, captions y hashtags que venden.</p></div>
      <div class="step"><div class="num">3</div><h3>Tu semana, armada</h3><p>Ideas, diseños y captions programados a la mejor hora. Vos elegís cuándo sale cada post.</p></div>
    </div>
  </div></div>
  <div class="section" id="incluye" style="background:var(--bg2)"><div class="wrap">
    <h2>Qué incluye</h2>
    <p class="lede">Todo lo que haría tu equipo de marketing, sin contratar a nadie.</p>
    <div class="grid3">
      <div class="feat"><div class="ico">💡</div><h3>Ideas estratégicas</h3><p>Cada semana pensamos el contenido por vos: novedades, promos, tips, testimonios y más.</p></div>
      <div class="feat"><div class="ico">🎨</div><h3>Diseños con tu marca</h3><p>Usamos TUS fotos, TU logo y TUS colores. Nada de plantillas genéricas que no te representan.</p></div>
      <div class="feat"><div class="ico">✍️</div><h3>Captions + hashtags</h3><p>Textos en rioplatense con tu tono, pensados para vender, con hashtags para Argentina.</p></div>
      <div class="feat"><div class="ico">🎬</div><h3>Videos para Reels</h3><p>Convertimos tus fotos en videos verticales con música, listos para el formato que más rinde.</p></div>
      <div class="feat"><div class="ico">📅</div><h3>Publicación automática</h3><p>Programamos tu semana completa y el sistema publica solo, a la hora exacta, en tu cuenta real.</p></div>
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
    <p class="lede">Las herramientas te dan más trabajo. Nosotros te lo sacamos de encima.</p>
    <div class="vs-list">
      <div class="vs-item">
        <div class="vs-top">🧰 <b>Apps para programar posteos</b></div>
        <p>Vos creás los diseños, vos escribís los textos, vos programás cada post. Y se pagan en dólares con tarjeta.</p>
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
        <div class="vs-top">🚀 <b>Posta</b></div>
        <p>Nos contás de tu negocio <b>una sola vez</b>. Creamos las ideas, los diseños y los textos, y publicamos en automático en tu cuenta. En pesos, con MercadoPago. Y lo probás <b>7 días gratis</b>, sin tarjeta.</p>
      </div>
    </div>
    <p class="unico-line">Somos el único servicio argentino 100% done-for-you para Instagram.</p>
    <div style="text-align:center;margin-top:18px"><a class="btn btn-primary" href="/prueba">Probar gratis</a></div>
  </div></div>
  <div class="section" id="planes"><div class="wrap">
    <h2>Elegí tu plan</h2>
    <p class="lede">Sin letra chica. Cancelá cuando quieras.</p>
    <div class="country-toggle">
      <button class="${country === 'AR' ? 'on' : ''}" data-country="AR" onclick="switchPlansCountry('AR')">🇦🇷 Argentina</button>
      <button class="${country === 'UY' ? 'on' : ''}" data-country="UY" onclick="switchPlansCountry('UY')">🇺🇾 Uruguay</button>
    </div>
    <div class="anchor-line" id="anchorLine">${anchorHTML(cfg && cfg.anchor)}</div>
    <div class="scarcity">🔥 Solo <b>15 lugares</b> por mes — cada negocio lleva trabajo personalizado.</div>
    <div class="plans-row" id="plansRow">${planCards || '<p>Cargando planes...</p>'}</div>
  </div></div>
  <div class="section" id="faq" style="background:var(--bg2)"><div class="wrap" style="max-width:760px">
    <h2>Preguntas frecuentes</h2>
    <p class="lede">Lo que todos preguntan antes de empezar.</p>
    <div class="faq">
      <details><summary>¿Necesito hacer algo?</summary><p>No. Nos contás de tu negocio una sola vez al registrarte y listo. Nosotros creamos las ideas, los diseños, los textos y publicamos. Si querés, podés revisar todo antes de que salga.</p></details>
      <details><summary>¿Publican en mi cuenta real de Instagram?</summary><p>Sí. Conectás tu cuenta Business una vez y publicamos directamente en tu perfil con la API oficial de Meta. También podés probar todo en modo demo antes.</p></details>
      <details><summary>¿Usan mis fotos y mi marca?</summary><p>Sí, eso es lo más importante: subís tus fotos y tu logo una vez, definimos tus colores, y todos los diseños salen con tu identidad. Nada genérico.</p></details>
      <details><summary>¿Puedo cancelar cuando quiera?</summary><p>Sí, sin preguntas ni trabas. Cancelás desde tu cuenta y listo.</p></details>
      <details><summary>¿Qué pasa si no me gusta un post?</summary><p>Podés pedir cambios o eliminarlo antes de que se publique. Además aprendemos de lo que te gusta para hacerlo cada vez mejor.</p></details>
      <details><summary>¿Tengo que darles mi contraseña de Instagram?</summary><p>No. Conectás tu cuenta con el login oficial de Meta, igual que cuando entrás con Google en otras apps. Nunca vemos ni guardamos tu contraseña.</p></details>
      <details><summary>¿Publican sin que yo lo apruebe?</summary><p>Sí. Tu semana se publica en automático, pero la ves entera antes en "Mi semana" y podés editar o eliminar cualquier posteo. Nada sale sin que lo hayas podido revisar.</p></details>
      <details><summary>¿Y si no me funciona?</summary><p>Tenés 30 días de garantía: si tu Instagram no se ve transformado, te devolvemos el 100%. Sin preguntas.</p></details>
      <details><summary>¿Cuándo veo mi primera semana?</summary><p>Al día siguiente: pagás hoy y mañana tu primera semana ya está armada y programada.</p></details>
      <details><summary>¿Tienen programa de referidos?</summary><p>Sí 🎁 En Ajustes → Referidos tenés tu link personal: si 2 amigos se suscriben con tu link, pagás la mitad todos los meses.</p></details>
    </div>
    <div style="text-align:center;margin-top:44px">
      <a class="btn btn-primary" href="#/registro" style="font-size:18px;padding:18px 44px">Empezar ahora</a>
      <div style="margin-top:18px"><a class="btn btn-ghost" href="/demo">✨ Probar gratis</a></div>
    </div>
  </div></div>
  <div class="footer"><div class="wrap">
    <span class="logo" style="font-size:20px">Posta<span class="dot">.</span></span>
    <span>Hecho en Argentina 🇦🇷 · © 2026</span>
    <span style="margin-left:12px"><a href="/privacidad.html" style="color:var(--sky)">Privacidad</a> · <a href="/terminos.html" style="color:var(--sky)">Términos</a></span>
  </div></div>`;
}

/* ---------- AUTH ---------- */
function authView(mode) {
  const isLogin = mode === 'login';
  return `
  <div class="nav"><div class="wrap">
    <a class="logo" href="#/">Posta<span class="dot">.</span></a>
    <div class="nav-links"><a href="#/${isLogin ? 'registro' : 'login'}">${isLogin ? 'Crear cuenta' : 'Entrar'}</a></div>
  </div></div>
  <div class="wrap"><div class="form-card">
    <h2>${isLogin ? 'Bienvenido de vuelta 👋' : 'Creá tu cuenta 🚀'}</h2>
    <p class="sub">${isLogin ? 'Entrá para seguir automatizando.' : '7 días gratis, sin tarjeta.'}</p>
    <div id="formErr"></div>
    <div class="field"><label>Email</label><input id="f_email" type="email" placeholder="vos@tunegocio.com"></div>
    <div class="field"><label>Contraseña</label><input id="f_pass" type="password" placeholder="Mínimo 6 caracteres"></div>
    <button class="btn btn-primary btn-block" id="btnAuth">${isLogin ? 'Entrar' : 'Crear cuenta'}</button>
    <p style="text-align:center;margin-top:18px;font-size:14px;color:var(--dim)">
      ${isLogin ? '¿No tenés cuenta? <a href="#/registro" style="color:var(--cel)">Registrate</a>' : '¿Ya tenés cuenta? <a href="#/login" style="color:var(--cel)">Entrá</a>'}
    </p>
  </div></div>`;
}

/* ---------- APP SHELL ---------- */
const TABS = [
  ['semana', '🏠', 'Mi semana'],
  ['crear', '✨', 'Crear post'],
  ['ideas', '💡', 'Ideas'],
  ['video', '🎬', 'Video'],
  ['fotos', '📷', 'Mis fotos'],
  ['calendario', '📅', 'Calendario'],
  ['historial', '📊', 'Historial'],
  ['ajustes', '⚙️', 'Ajustes'],
];
let IDEAS = [];
/* ---------- PWA: instalar la app ---------- */
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
  const b = document.getElementById('pwaBanner');
  if (b) b.remove();
});
function pwaIsInstalled() {
  try { if (localStorage.getItem('pwa-installed') === '1') return true; } catch (e) {}
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || !!navigator.standalone;
}
function pwaIsIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function pwaDismissed() {
  try { return localStorage.getItem('pwa-dismissed') === '1'; } catch (e) { return false; }
}
function pwaBannerHtml() {
  if (pwaIsInstalled() || pwaDismissed()) return '';
  const ios = pwaIsIos();
  const txt = ios
    ? 'Instalá Posta en tu teléfono: tocá <b>Compartir</b> y elegí <b>“Agregar a pantalla de inicio”</b>.'
    : 'Instalá Posta en tu teléfono para tenerla siempre a mano.';
  const btnStyle = (!ios && !PWA_DEFERRED) ? ' style="display:none"' : '';
  return `<div class="pwa-banner" id="pwaBanner">
    <span class="pwa-ico">📲</span>
    <div class="pwa-txt">${txt}</div>
    <button class="btn btn-primary btn-sm" id="pwaInstallBtn"${btnStyle}>Instalar</button>
    <button class="pwa-x" id="pwaDismiss" aria-label="Cerrar">✕</button>
  </div>`;
}
async function pwaDoInstall() {
  if (PWA_DEFERRED) {
    PWA_DEFERRED.prompt();
    try { await PWA_DEFERRED.userChoice; } catch (e) {}
    PWA_DEFERRED = null;
    return;
  }
  alert('Para instalar Posta:\n\niPhone: tocá Compartir y elegí "Agregar a pantalla de inicio".\n\nAndroid: tocá el menú ⋮ y elegí "Instalar app" o "Agregar a pantalla de inicio".');
}
function pwaWire() {
  const d = document.getElementById('pwaDismiss');
  if (d) d.onclick = () => {
    try { localStorage.setItem('pwa-dismissed', '1'); } catch (e) {}
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

function appShell(tab, content) {
  const MAIN_TABS = [['semana', '🏠', 'Inicio'], ['crear', '✨', 'Crear'], ['ideas', '💡', 'Ideas'], ['video', '🎬', 'Video']];
  const MORE_TABS = [['fotos', '📷', 'Mis fotos'], ['calendario', '📅', 'Calendario'], ['historial', '📊', 'Historial'], ['ajustes', '⚙️', 'Ajustes']];
  const moreOn = MORE_TABS.some(([k]) => k === tab);
  const igBanner = (PROFILE && PROFILE.ig_connected) ? '' : `
  <div class="ig-banner"><span class="igb-ico">📸</span><span class="igb-txt"><b>Conectá tu Instagram</b><span>Publicá en automático en 1 minuto, sin contraseña.</span></span><button class="btn btn-primary btn-sm" data-ig-connect>Conectar ahora</button></div>`;
  return `
  <div class="mtop"><a class="logo" href="#/">Posta<span class="dot">.</span></a>
    <button class="btn btn-ghost btn-sm" id="btnLogoutM">Salir</button></div>
  <div class="mtabs">${TABS.map(([k, i, l]) => `<button class="mtab ${k === tab ? 'on' : ''}" data-tab="${k}">${i} ${l}</button>`).join('')}</div>
  ${pwaBannerHtml()}
  ${igBanner}
  <div class="app-shell">
    <div class="sidebar">
      <a class="logo" href="#/" style="padding:6px 16px 20px">Posta<span class="dot">.</span></a>
      ${TABS.map(([k, i, l]) => `<button class="side-link ${k === tab ? 'on' : ''}" data-tab="${k}"><span class="ico">${i}</span>${l}</button>`).join('')}
      <div class="grow"></div>
      <div class="side-user">${esc(ME?.email || '')}</div>
      <button class="side-link" id="btnLogout"><span class="ico">🚪</span>Salir</button>
    </div>
    <div class="main">${content}</div>
  </div>
  <nav class="mbar">
    ${MAIN_TABS.map(([k, i, l]) => `<button class="mbar-btn ${k === tab ? 'on' : ''}" data-tab="${k}"><span class="ico">${i}</span><span class="lbl">${l}</span></button>`).join('')}
    <button class="mbar-btn ${moreOn ? 'on' : ''}" id="mbarMore"><span class="ico">⋯</span><span class="lbl">Más</span></button>
  </nav>
  <div class="msheet" id="msheet"><div class="msheet-bg" id="msheetBg"></div>
    <div class="msheet-card">
      ${MORE_TABS.map(([k, i, l]) => `<button class="msheet-btn ${k === tab ? 'on' : ''}" data-tab="${k}"><span class="ico">${i}</span>${l}</button>`).join('')}
      ${pwaIsInstalled() ? '' : '<button class="msheet-btn" id="msheetInstall"><span class="ico">📲</span>Instalar app</button>'}
    </div>
  </div>`;
}

/* ---------- CREAR ---------- */
let CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', options: null, detected: null, recommendedIndex: 0, recommendedReason: '', feedback: '', productPhoto: '', selected: [], cardPhoto: {} };

/* ---------- VIDEO ---------- */
function freshVState() {
  return { scenes: [{ image_path: '', text: '', duration: 3 }], music_path: '', result_url: '', caption: '', busy: false };
}
let VSTATE = freshVState();

const BASE_PALETTES = [
  { name: 'Celeste', c: ['#2793C8', '#1E7FAE'], dark: false },
  { name: 'Amarillo', c: ['#FEC14D', '#E5A62C'], dark: true },
  { name: 'Navy', c: ['#0A1E33', '#47617A'], dark: false },
  { name: 'Nieve', c: ['#FFFFFF', '#F2F9FD'], dark: true },
];
// Colores de marca del cliente (brand kit) → paleta "Mi marca" primera en la lista
function brandColors() {
  try {
    const c = JSON.parse((SETTINGS && SETTINGS.brand_colors) || '[]');
    return Array.isArray(c) ? c.filter(x => /^#[0-9a-fA-F]{6}$/.test(x)) : [];
  } catch { return []; }
}
function getPalettes() {
  const list = [...BASE_PALETTES];
  const bc = brandColors();
  if (bc.length >= 2) {
    const n = parseInt(bc[0].slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    list.unshift({ name: 'Mi marca', c: [bc[0], bc[1]], dark: lum > 0.6, brand: true });
  }
  return list;
}
function defaultPal() {
  const pals = getPalettes();
  const p = SETTINGS && SETTINGS.preferred_palette;
  if (Number.isInteger(p) && p >= 0 && p < pals.length) return p;
  return 0;
}
const PALETTES = BASE_PALETTES; // compat: usar getPalettes() para la lista efectiva

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
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
    ctx.fillStyle = '#FEC14D'; ctx.fillRect(90, 120, 130, 18);
    ctx.fillStyle = '#0A1E33'; ctx.textAlign = 'center';
    ctx.font = '800 96px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.title || 'Tu título', W - 220).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, 420 + i * 116));
    ctx.fillStyle = 'rgba(10,30,51,.65)'; ctx.font = '400 52px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.subtitle || '', W - 260).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 900 + i * 70));
    ctx.fillStyle = '#0A1E33'; ctx.font = '700 44px -apple-system, Inter, sans-serif';
    ctx.fillText('@' + (o.handle || 'tunegocio'), W / 2, 1230);
  } else if (o.tpl === 'noche') {
    if (!o.photoImg) { ctx.fillStyle = '#0A1E33'; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = '#FEC14D'; ctx.lineWidth = 10; ctx.strokeRect(50, 50, W - 100, H - 100);
    ctx.fillStyle = '#FEC14D'; ctx.font = '800 40px -apple-system, Inter, sans-serif'; ctx.textAlign = 'center';
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

function creatorView() {
  const c = CREATOR;
  const stepsBar = `<div class="steps-bar">${[1, 2, 3].map(i => `<div class="s ${i <= c.step ? 'on' : ''}"></div>`).join('')}</div>`;
  if (c.step === 1) {
    return `
    <div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear post</h1><p class="sub">Paso 1 de 3 — Contanos la idea, la IA escribe el texto.</p></div></div>
    ${stepsBar}
    <div class="card">
      <div class="field"><label>¿De qué es el post?</label>
        <textarea id="c_topic" placeholder='Ej: "nuevo buzo oversize color crema", "promo 2x1 en pizzas los martes", "abrimos local en Palermo"'>${esc(c.topic)}</textarea>
        <div class="hint">Una frase alcanza. La IA lo convierte en caption + hashtags con tu tono.</div></div>
      <div class="field"><label>📷 Foto de tu producto <span style="font-weight:400;color:var(--mut)">(opcional)</span></label>
        <div id="c_prodPhotoBox"></div>
        <input type="file" id="c_prodPhotoFile" accept="image/*" style="display:none">
        <div class="hint">Si la subís, las 6 opciones usan TU foto. Ideal para vender tu producto exacto. Si no, usamos fotos del banco.</div></div>
      <button class="btn btn-soft" id="btnGen">🤖 Generar con IA</button>
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
    <div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear post</h1><p class="sub">Paso 2 de 3 — Diseñá la imagen del post (1080 × 1350).</p></div></div>
    ${stepsBar}
    <div class="designer">
      <div>
        <div class="card" style="padding:22px">
          <h3>Plantilla</h3>
          <div class="tpl-grid">
            ${['gradiente', 'claro', 'noche', 'promo'].map(t => `<div class="tpl ${c.tpl === t ? 'on' : ''}" data-tpl="${t}">${t[0].toUpperCase() + t.slice(1)}</div>`).join('')}
          </div>
          <h3 style="margin-top:18px">Paleta</h3>
          <div class="pal-row">${getPalettes().map((p, i) => `<div class="pal ${c.pal === i ? 'on' : ''}" data-pal="${i}" title="${p.name}${p.brand ? ' (tus colores)' : ''}" style="background:linear-gradient(135deg,${p.c[0]},${p.c[1]});${p.brand ? 'box-shadow:0 0 0 2px var(--yl)' : ''}"></div>`).join('')}</div>
          <div class="field" style="margin-top:18px"><label>Título</label><input id="d_title" value="${esc(c.title)}" placeholder="HASTA 40% OFF"></div>
          <div class="field"><label>Subtítulo</label><input id="d_sub" value="${esc(c.subtitle)}" placeholder="Solo esta semana"></div>
          <div class="field"><label>Usuario de Instagram (sin @)</label><input id="d_handle" value="${esc(c.handle || (PROFILE?.ig_username || ''))}" placeholder="tunegocio"></div>
          <div class="field"><label>Foto del producto (opcional)</label>
            ${c.photo ? `
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
            </div>
            <div id="photoLib" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
              ${assetPhotos().map(a => `<img src="${a.file_path}" data-lib="${a.file_path}" style="width:64px;height:80px;object-fit:cover;border-radius:10px;border:2px solid var(--line);cursor:pointer">`).join('')}
            </div>
            <div class="hint">La foto va de fondo y el diseño se mantiene igual.${assetLogo() ? ' Tu logo se agrega solo en la esquina.' : ''}</div>`}
            <input type="file" id="d_photo" accept="image/*" style="display:none">
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" id="btnBack1">← Atrás</button>
          <button class="btn btn-primary" id="btnSaveDesign" style="flex:1">Guardar diseño →</button>
        </div>
      </div>
      <div><div class="preview-box"><canvas id="postCanvas"></canvas></div>
      <p style="color:var(--dim);font-size:13px;margin-top:10px;text-align:center">Vista previa real — así se va a ver en el feed.</p></div>
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
    <div class="page-head"><div class="ph-ico">🎨</div><div class="ph-txt"><h1>Elegí tu diseño</h1><p class="sub">6 opciones hechas para tu idea. Elegí una o varias y programalas.</p></div></div>
    <div class="steps-bar">${[1, 2, 3].map(i => `<div class="s ${i <= 1 ? 'on' : ''}"></div>`).join('')}</div>
    ${colors.length ? `<div class="colors-note">🎨 Tus colores: ${esc(colorNames)}${hexes.map(h => `<span class="swatch" style="background:${esc(h)}" title="${esc(h)}"></span>`).join('')}</div>` : ''}
    ${det.productPhoto ? `<div class="prodphoto-note">📷 Usando la foto de tu producto en las 6 opciones</div>` : ''}
    ${det.photoQuery && !det.productPhoto ? `<div class="photoq-note">📸 Fotos de: <b>${esc(det.photoQuery)}</b>${det.userPhotos ? ` · usando tus fotos primero ✨` : ''}</div>` : ''}
    <div class="myphotos-card">
      <div class="mp-title">📷 Tus fotos</div>
      <p class="mp-text">Para vender tu producto exacto (como tu buzo), subí sus fotos una vez y el creador las usa siempre.</p>
      <div class="mp-row" id="mpRow">
        ${libPhotos.length ? libPhotos.map(a => `<img src="${esc(a.file_path)}" class="mp-thumb" alt="Tu foto">`).join('') : `<span class="mut">Todavía no subiste fotos.</span>`}
      </div>
      <button class="btn btn-soft" id="btnUploadPhotos">📤 Subir fotos de tus productos</button>
      <input type="file" id="mpFiles" accept="image/*" multiple style="display:none">
      <div id="mpMsg"></div>
    </div>
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
  <div class="page-head"><div class="ph-ico">✨</div><div class="ph-txt"><h1>Crear post</h1><p class="sub">Paso 3 de 3 — Programalo y olvidate.</p></div></div>
  ${stepsBar}
  <div class="card">
    <div style="display:flex;gap:22px;flex-wrap:wrap">
      <img src="${esc(c.imagePath)}" style="width:180px;border-radius:14px;border:1px solid var(--line)">
      <div style="flex:1;min-width:240px">
        <p style="font-size:15px;line-height:1.6;color:var(--mut);white-space:pre-wrap">${esc(c.caption)}</p>
        <p style="color:var(--yl-l);font-size:14px;margin-top:8px">${esc(c.hashtags)}</p>
      </div>
    </div>
    <div class="row2" style="margin-top:24px">
      <div class="field"><label>Fecha y hora de publicación</label><input type="datetime-local" id="p_when" min="${minDt}" value="${minDt}"></div>
      <div class="field"><label>&nbsp;</label><div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btnSchedule">📅 Programar</button>
        <button class="btn btn-soft" id="btnNow">⚡ Publicar ahora</button>
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
      ${step(s2, 2, 'Conectá tu Instagram', 'Publicá en automático en 1 minuto.', '<button class="btn btn-primary btn-sm" data-ig-connect>Conectar Instagram</button>')}
      ${step(s3, 3, 'Creá tu primer posteo', 'O armá tu semana en 1 tap.', '<a class="btn btn-soft btn-sm" href="#/app/crear">Crear post</a>')}
    </div>
  </div>`;
}
function recCardHTML(ideas, posts, ppw){
  const ws = weekStartMonday(new Date());
  const inWeek = posts.filter(p => { const d = postWeekDate(p); return d && d >= ws && ['scheduled','publishing','published'].includes(p.status); });
  const missing = Math.max(0, ppw - inWeek.length);
  if (!missing) return `<div class="card rec-card rec-done">
      <div class="rec-tag">✨ Esta semana</div>
      <h3>Tu semana está completa ✅</h3>
      <p>Tenés ${inWeek.length} ${inWeek.length === 1 ? 'posteo' : 'posteos'} programados o publicados (${ppw}/semana en tu plan). La próxima recomendación llega el lunes. 🚀</p>
    </div>`;
  if (!ideas.length) return `<div class="card rec-card">
      <div class="rec-tag">✨ Tu próximo posteo</div>
      <h3>¿Qué publicamos ahora?</h3>
      <p>Generamos ideas pensadas para tu negocio y te recomendamos qué posteo crear primero.</p>
      <button class="btn btn-primary" id="btnRecGen">✨ Generar ideas</button>
    </div>`;
  const idea = ideas[pickNextIdea(ideas, posts)];
  const isVideo = /reel|video/i.test(idea.formato || '');
  const idx = IDEAS.indexOf(idea);
  return `<div class="card rec-card">
    <div class="rec-tag">✨ Tu próximo posteo recomendado</div>
    <h3>${esc(idea.titulo)}</h3>
    ${idea.angulo ? `<p>${esc(idea.angulo)}</p>` : ''}
    <div class="rec-meta"><span class="badge b-scheduled">${esc(idea.formato || 'Post')}</span><span>📅 Te faltan ${missing} de ${ppw} esta semana</span></div>
    <button class="btn btn-primary" data-rec-idea="${idx}">${isVideo ? '🎬 Crear este video' : 'Crear este posteo'} →</button>
  </div>`;
}
async function ideasView() {
  const comp = ((PROFILE || {}).competitors || '').trim();
  let posts = [];
  try { posts = await api.get('/api/posts'); } catch (e) { posts = []; }
  const ppw = (ME && ME.posts_per_week) || 3;
  return `<div class="page-head"><div class="ph-ico">💡</div><div class="ph-txt"><h1>Ideas</h1><p class="sub">Nosotros pensamos el contenido por vos. Vos no te ocupás de nada.</p></div></div>
  ${checklistHTML(posts.length)}
  ${recCardHTML(IDEAS, posts, ppw)}
  <div class="card hero-card">
    <div class="auto-head"><div class="ah-ico">⚡</div><div class="ah-txt"><h3>Piloto automático</h3><p>Armo tu semana completa de una: ideas, textos, diseños y programación.</p></div></div>
    <div class="set-row"><div><div class="t">Publicar automáticamente</div><div class="d">Posteo a la hora que elijas, sin que muevas un dedo.</div></div><div class="toggle ${SETTINGS && SETTINGS.autopilot ? 'on' : ''}" id="tglAuto"></div></div>
    <div class="set-row"><div><div class="t">Hora de publicación</div><div class="d">El momento en que sale cada posteo.</div></div><input class="in" style="width:110px" type="time" id="autoTime" value="${(SETTINGS && SETTINGS.autopilot_time) || '19:00'}"></div>
    <div class="set-row"><div><div class="t">Competidores a diferenciarte</div><div class="d">Marcas que querés superar: usamos sus puntos débiles para que brilles.</div></div></div>
    <input class="in" id="autoComp" placeholder="Ej: @competidor1, @competidor2" value="${esc(comp)}">
    <div class="btn-row"><button class="btn btn-primary btn-lg" id="btnAuto">${SETTINGS && SETTINGS.autopilot ? '🔁 Regenerar mi semana' : '⚡ Armar mi semana'}</button>
    <button class="btn btn-soft" id="btnPlan">⚙️ Mi plan</button></div>
    <div id="autoMsg"></div>
  </div>
  <div id="ideasZone">${IDEAS.length ? ideasList() : `
    <div class="empty"><div class="big">💡</div>
      Todavía no generamos ideas para tu negocio.<br><br>
      <button class="btn btn-primary" id="btnGenIdeas">✨ Generar ideas para mi negocio</button>
    </div>`}
  </div>
  <div id="ideasMsg"></div>`;
}

function ideasList() {
  const ppw = (ME && ME.posts_per_week) || 3;
  const planName = (ME && ME.plan ? ME.plan[0].toUpperCase() + ME.plan.slice(1) : 'Esencial');
  const planTag = ME && ME.is_trial ? `${planName} (trial)` : planName;
  const opts = [3, 5, 7].filter(v => v <= ppw).map(v => `<option value="${v}" ${v === ppw ? 'selected' : ''}>${v} posts por semana</option>`).join('');
  return `
  <div class="card">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:18px">
      <h3 style="margin:0">Ideas creadas para vos (${IDEAS.length})</h3>
      <button class="btn btn-ghost btn-sm" id="btnRegenIdeas">↻ Regenerar</button>
    </div>
    ${IDEAS.map((idea, i) => {
      const isVideo = /reel|video/i.test(idea.formato || '');
      return `
    <div class="post-item" style="align-items:flex-start">
      <div class="info">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
          <span class="badge b-scheduled">${esc(idea.formato)}</span>
          <b style="font-size:15px">${esc(idea.titulo)}</b>
        </div>
        <div class="cap" style="white-space:normal;line-height:1.6">${esc(idea.angulo)}</div>
      </div>
      <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">
        ${isVideo ? `<button class="btn btn-primary btn-sm" data-video="${i}">🎬 Crear video →</button>` : ''}
        <button class="btn btn-soft btn-sm" data-idea="${i}">Crear post →</button>
      </div>
    </div>`; }).join('')}
  </div>
  <div class="card card-hi-yl">
    <h3>🚀 Llenamos tu semana en autopilot</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:6px">Creamos el texto, diseñamos la imagen y programamos los posts solos. Vos solo mirá cómo salen.</p>
    <p style="font-size:13px;color:var(--dim);margin-bottom:16px">Tu plan: <b>${esc(planTag)}</b> · ${ppw} posts por semana${assetPhotos().length ? ` · 🖼️ usamos tus fotos` : ''}${assetLogo() ? ' · con tu logo' : ''}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select id="apCount" style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;color:var(--txt);font-size:15px;padding:12px 14px;font-family:inherit;font-weight:600">
        ${opts}
      </select>
      <button class="btn btn-primary" id="btnAutopilot">⚡ Armar mi semana</button>
    </div>
    <div id="apProg" style="margin-top:16px"></div>
  </div>`;
}

async function renderDesignImage(o) {
  const cv = document.createElement('canvas');
  drawPost(cv, o);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const res = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen');
  return data.path;
}
function slotDate(i) {
  return slotDate19(i, (SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires');
}
async function runAutopilot(n) {
  const prog = $('#apProg');
  const btn = $('#btnAutopilot');
  btn.disabled = true;
  try {
    let ideas = IDEAS;
    if (!ideas.length) {
      prog.innerHTML = `<div class="okmsg">💡 Generando ideas para tu negocio...</div>`;
      const r = await api.post('/api/ideas', {});
      ideas = r.ideas || [];
      IDEAS = ideas;
    }
    const picks = ideas.slice(0, n);
    if (!picks.length) throw new Error('No hay ideas para programar');
    // Brand kit del cliente: fotos rotadas + logo + paleta de marca
    const photos = assetPhotos();
    const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
    const palIdx = defaultPal();
    for (let i = 0; i < picks.length; i++) {
      const idea = picks[i];
      prog.innerHTML = `<div class="okmsg">⏳ Creando post ${i + 1} de ${picks.length}: <b>${esc(idea.titulo)}</b>...</div>`;
      const out = await api.post('/api/generate', { topic: idea.titulo });
      const title = idea.titulo.split(' ').slice(0, 5).join(' ').toUpperCase() || 'NOVEDAD';
      const ph = photos.length ? photos[i % photos.length] : null;
      const imagePath = await renderDesignImage({
        tpl: 'gradiente', pal: palIdx,
        title, subtitle: (idea.angulo || '').split('.')[0].slice(0, 90),
        handle: (PROFILE || {}).ig_username || '',
        photoImg: ph ? await photoImg(ph.file_path) : null,
        logoImg: logo,
      });
      await api.post('/api/posts', {
        image_path: imagePath, caption: out.caption, hashtags: out.hashtags,
        scheduled_at: slotDate(i),
      });
    }
    prog.innerHTML = `<div class="okmsg">✅ ¡Listo! ${picks.length} posts programados. Se publican solos.</div>`;
    setTimeout(() => location.hash = '#/app/calendario', 1600);
  } catch (e) {
    prog.innerHTML = `<div class="err">Error: ${esc(e.message)}</div>`;
    btn.disabled = false;
  }
}

function bindIdeas() {
  const gen = async () => {
    const z = $('#ideasZone');
    z.innerHTML = `<div class="empty"><div class="big">⏳</div>Estudiando tu negocio y tu competencia...</div>`;
    try {
      const { ideas } = await api.post('/api/ideas', {});
      IDEAS = ideas || [];
      render();
    } catch (e) {
      z.innerHTML = `<div class="err">No se pudieron generar las ideas: ${esc(e.message)}</div>`;
    }
  };
  const b = $('#btnGenIdeas'); if (b) b.onclick = gen;
  const r = $('#btnRegenIdeas'); if (r) r.onclick = gen;
  const rg = $('#btnRecGen'); if (rg) rg.onclick = gen;
  $$('[data-rec-idea]').forEach(btn => btn.onclick = () => {
    const idea = IDEAS[+btn.dataset.recIdea];
    if (!idea) return;
    if (/reel|video/i.test(idea.formato || '')) {
      const photos = assetPhotos();
      VSTATE = freshVState();
      VSTATE.scenes = [{ image_path: photos.length ? photos[0].file_path : '', text: idea.titulo, duration: 4 }];
      if (photos.length > 1) VSTATE.scenes.push({ image_path: photos[1].file_path, text: (idea.angulo || '').split('.')[0].slice(0, 80), duration: 4 });
      location.hash = '#/app/video';
    } else {
      CREATOR = { step: 1, topic: idea.titulo, caption: '', hashtags: '', tpl: 'gradiente', pal: defaultPal(), palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', productPhoto: '', selected: [], cardPhoto: {} };
      location.hash = '#/app/crear';
    }
  });
  $$('[data-idea]').forEach(btn => btn.onclick = () => {
    const idea = IDEAS[+btn.dataset.idea];
    CREATOR = { step: 1, topic: idea.titulo, caption: '', hashtags: '', tpl: 'gradiente', pal: defaultPal(), palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', productPhoto: '', selected: [], cardPhoto: {} };
    location.hash = '#/app/crear';
  });
  $$('[data-video]').forEach(btn => btn.onclick = () => {
    const idea = IDEAS[+btn.dataset.video];
    const photos = assetPhotos();
    VSTATE = freshVState();
    VSTATE.scenes = [{ image_path: photos.length ? photos[0].file_path : '', text: idea.titulo, duration: 4 }];
    if (photos.length > 1) VSTATE.scenes.push({ image_path: photos[1].file_path, text: (idea.angulo || '').split('.')[0].slice(0, 80), duration: 4 });
    location.hash = '#/app/video';
  });
  const ap = $('#btnAutopilot'); if (ap) ap.onclick = () => runAutopilot(+$('#apCount').value);
}

/* ---------- VIDEO 🎬 ---------- */
function videoView() {
  const v = VSTATE;
  const photos = assetPhotos();
  return `<div class="page-head"><div class="ph-ico">🎬</div><div class="ph-txt"><h1>Video</h1><p class="sub">Convertí tus fotos en un video vertical (1080×1920) para Reels y TikTok. Hasta 5 escenas, 60 segundos en total.</p></div></div>
  ${!photos.length ? `<div class="card tip-card"><p style="color:var(--mut);font-size:15px;margin:0">💡 Tip: subí tus fotos en <a href="#/app/fotos" style="color:var(--cel);font-weight:700">Mis fotos</a> y las tenés siempre a mano para tus videos.</p></div>` : ''}
  <div class="card"><h3>Escenas (${v.scenes.length}/5)</h3>
    ${v.scenes.map((s, i) => `
    <div class="post-item" style="align-items:flex-start;gap:14px">
      <div style="width:72px;flex-shrink:0">
        ${s.image_path ? `<img src="${esc(s.image_path)}" style="width:72px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">` : `<div style="width:72px;height:110px;border-radius:10px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--dim)">🖼️</div>`}
      </div>
      <div class="info" style="flex:1">
        <div class="scene-n">Escena ${i + 1}</div>
        <div class="field" style="margin-bottom:8px"><label>Texto en pantalla</label><input data-vtext="${i}" value="${esc(s.text)}" placeholder="Ej: Nuevo ingreso 🔥" maxlength="140"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <div class="field" style="margin:0;width:110px"><label>Duración (seg)</label><input type="number" data-vdur="${i}" min="1" max="30" value="${s.duration}"></div>
          <button class="btn btn-ghost btn-sm" data-vup="${i}">📤 Subir</button>
          ${photos.length ? `<button class="btn btn-ghost btn-sm" data-vlib="${i}">🖼️ Mis fotos</button>` : ''}
          ${v.scenes.length > 1 ? `<button class="btn btn-danger btn-sm" data-vrm="${i}">Quitar</button>` : ''}
        </div>
        <div data-vpicker="${i}" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${photos.map(a => `<img src="${a.file_path}" data-vpick="${i}:${a.file_path}" style="width:56px;height:80px;object-fit:cover;border-radius:8px;border:2px solid var(--line);cursor:pointer">`).join('')}
        </div>
      </div>
    </div>`).join('')}
    ${v.scenes.length < 5 ? `<button class="btn btn-ghost" id="btnVAdd">＋ Agregar escena</button>` : ''}
    <input type="file" id="v_file" accept="image/*" style="display:none">
    <input type="file" id="v_libfile" accept="image/*" style="display:none">
  </div>
  <div class="card"><h3>🎵 Música (opcional)</h3>
    ${v.music_path ? `
      <div style="display:flex;gap:10px;align-items:center">
        <span style="font-size:14px;color:var(--mut)">🎵 ${esc(v.music_path.split('/').pop())}</span>
        <button class="btn btn-ghost btn-sm" id="btnVMusicRm">Quitar</button>
      </div>` : `
      <button class="btn btn-ghost btn-sm" id="btnVMusicAdd">📤 Subir MP3</button>
      <div class="hint">El video se corta a la duración de las escenas.</div>`}
    <input type="file" id="v_music" accept="audio/mpeg" style="display:none">
  </div>
  <div class="card"><h3>Generar</h3>
    <div class="field"><label>Caption (opcional, para programarlo)</label><textarea data-vcap style="min-height:80px" placeholder="Texto que acompaña el video...">${esc(v.caption)}</textarea></div>
    <button class="btn btn-primary" id="btnVGen" ${v.busy ? 'disabled' : ''}>${v.busy ? '⏳ Generando video...' : '🎬 Generar video'}</button>
    <div id="vMsg" style="margin-top:14px"></div>
    ${v.result_url ? `
    <div style="margin-top:18px;display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start">
      <video src="${esc(v.result_url)}" controls style="width:220px;border-radius:14px;border:1px solid var(--line)"></video>
      <div style="flex:1;min-width:220px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
          <a class="btn btn-soft btn-sm" href="${esc(v.result_url)}" download>⬇️ Descargar</a>
        </div>
        <div class="field"><label>Fecha y hora de publicación</label><input type="datetime-local" id="v_when"></div>
        <button class="btn btn-primary btn-sm" id="btnVSched">📅 Programar video</button>
        <div id="vSchedMsg" style="margin-top:10px"></div>
      </div>
    </div>` : ''}
  </div>`;
}

async function uploadAssetFile(file, kind) {
  const r = await fetch('/api/assets?kind=' + kind, { method: 'POST', headers: { 'Content-Type': file.type || 'image/png' }, body: file });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'No se pudo subir');
  ASSETS = await api.get('/api/assets');
  return data.path;
}

function bindVideo() {
  const v = VSTATE;
  const rerender = () => render();
  const vfile = $('#v_file');
  let vfileIdx = 0;
  // Subir imagen para escena (también queda en la librería)
  $$('[data-vup]').forEach(b => b.onclick = () => { vfileIdx = +b.dataset.vup; vfile.click(); });
  vfile.onchange = async () => {
    const f = vfile.files[0]; if (!f) return;
    try {
      const p = await uploadAssetFile(f, 'photo');
      v.scenes[vfileIdx].image_path = p;
      rerender();
    } catch (e) { alert('Error: ' + e.message); }
    vfile.value = '';
  };
  // Elegir de la librería
  $$('[data-vlib]').forEach(b => b.onclick = () => {
    const z = document.querySelector(`[data-vpicker="${b.dataset.vlib}"]`);
    z.style.display = z.style.display === 'none' ? 'flex' : 'none';
  });
  $$('[data-vpick]').forEach(im => im.onclick = () => {
    const [i, ...rest] = im.dataset.vpick.split(':');
    v.scenes[+i].image_path = rest.join(':');
    rerender();
  });
  $$('[data-vtext]').forEach(inp => inp.oninput = () => { v.scenes[+inp.dataset.vtext].text = inp.value; });
  $$('[data-vdur]').forEach(inp => inp.onchange = () => {
    v.scenes[+inp.dataset.vdur].duration = Math.min(30, Math.max(1, Math.round(+inp.value || 3)));
  });
  $$('[data-vrm]').forEach(b => b.onclick = () => { v.scenes.splice(+b.dataset.vrm, 1); rerender(); });
  $$('[data-vcap]').forEach(inp => inp.oninput = () => { v.caption = inp.value; });
  const bAdd = $('#btnVAdd');
  if (bAdd) bAdd.onclick = () => { v.scenes.push({ image_path: '', text: '', duration: 3 }); rerender(); };
  // Música
  const bma = $('#btnVMusicAdd');
  if (bma) bma.onclick = () => $('#v_music').click();
  const vm = $('#v_music');
  if (vm) vm.onchange = async () => {
    const f = vm.files[0]; if (!f) return;
    try {
      const r = await fetch('/api/audio', { method: 'POST', headers: { 'Content-Type': 'audio/mpeg' }, body: f });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      v.music_path = data.path;
      rerender();
    } catch (e) { alert('Error: ' + e.message); }
    vm.value = '';
  };
  const bmr = $('#btnVMusicRm');
  if (bmr) bmr.onclick = () => { v.music_path = ''; rerender(); };
  // Generar
  const bg = $('#btnVGen');
  if (bg) bg.onclick = async () => {
    const missing = v.scenes.findIndex(s => !s.image_path);
    if (missing >= 0) { $('#vMsg').innerHTML = `<div class="err">La escena ${missing + 1} no tiene imagen</div>`; return; }
    const total = v.scenes.reduce((a, s) => a + s.duration, 0);
    if (total > 60) { $('#vMsg').innerHTML = `<div class="err">El video no puede durar más de 60 segundos (ahora: ${total}s)</div>`; return; }
    v.busy = true; rerender();
    try {
      const r = await api.post('/api/videos', {
        scenes: v.scenes.map(s => ({ image_path: s.image_path, text: s.text, duration: s.duration })),
        music_path: v.music_path || undefined,
      });
      v.result_url = r.url;
      $('#vMsg').innerHTML = `<div class="okmsg">✅ Video listo (${r.duration}s)</div>`;
    } catch (e) {
      $('#vMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
    }
    v.busy = false;
    rerender();
  };
  // Programar
  const bs = $('#btnVSched');
  if (bs) bs.onclick = async () => {
    const when = $('#v_when').value;
    if (!when) { $('#vSchedMsg').innerHTML = `<div class="err">Elegí fecha y hora</div>`; return; }
    try {
      await api.post('/api/posts', {
        image_path: v.result_url, caption: v.caption, media_type: 'video',
        scheduled_at: new Date(when).toISOString(),
      });
      $('#vSchedMsg').innerHTML = `<div class="okmsg">✅ Video programado. Se publica solo.</div>`;
      VSTATE = freshVState();
      setTimeout(() => location.hash = '#/app/calendario', 1400);
    } catch (e) { $('#vSchedMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
}

/* ---------- MIS FOTOS ---------- */
function fotosView() {
  const photos = assetPhotos();
  const logo = assetLogo();
  return `<div class="page-head"><div class="ph-ico">📷</div><div class="ph-txt"><h1>Mis fotos</h1><p class="sub">Tu librería: las fotos que usamos de fondo en tus diseños y videos, y tu logo que va en cada post.</p></div></div>
  <div class="card"><h3>🖼️ Fotos (${photos.length}/20)</h3>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      ${photos.map(a => `
      <div style="position:relative">
        <img src="${a.file_path}" style="width:120px;height:150px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">
        <button class="btn btn-danger btn-sm foto-del" data-adel="${a.id}">✕</button>
      </div>`).join('')}
      ${photos.length < 20 ? `<button class="btn btn-ghost foto-add" id="btnAAdd">＋<br>Agregar</button>` : ''}
    </div>
    <input type="file" id="a_files" accept="image/*" multiple style="display:none">
    <div class="hint">El autopilot usa tus fotos rotando: post 1 → foto 1, post 2 → foto 2, etc. Si no hay fotos, usa los diseños de plantilla.</div>
  </div>
  <div class="card"><h3>🔰 Tu logo</h3>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      ${logo ? `<img src="${logo.file_path}" style="max-width:160px;max-height:100px;border-radius:12px;border:1px solid var(--line);background:#fff;padding:8px">` : `<div style="color:var(--dim);font-size:15px">Todavía no subiste tu logo.</div>`}
      <div style="display:flex;gap:8px">
        <button class="btn btn-soft btn-sm" id="btnLogoAdd">${logo ? 'Cambiar logo' : 'Subir logo'}</button>
        ${logo ? `<button class="btn btn-danger btn-sm" id="btnLogoRm">Quitar</button>` : ''}
      </div>
    </div>
    <input type="file" id="a_logo" accept="image/*" style="display:none">
    <div class="hint">El logo se dibuja en la esquina inferior de cada diseño que generamos.</div>
  </div>
  <div id="aMsg"></div>`;
}

function bindFotos() {
  const msg = (t, ok) => { $('#aMsg').innerHTML = `<div class="${ok ? 'okmsg' : 'err'}">${t}</div>`; };
  const up = async (files, kind) => {
    for (const f of files) {
      try { await uploadAssetFile(f, kind); }
      catch (e) { msg('Error: ' + esc(e.message), false); return; }
    }
    render();
  };
  const bAdd = $('#btnAAdd');
  if (bAdd) bAdd.onclick = () => $('#a_files').click();
  const af = $('#a_files');
  if (af) af.onchange = () => up([...af.files].slice(0, 20 - assetPhotos().length), 'photo');
  const bLogo = $('#btnLogoAdd');
  if (bLogo) bLogo.onclick = () => $('#a_logo').click();
  const al = $('#a_logo');
  if (al) al.onchange = () => { if (al.files[0]) up([al.files[0]], 'logo'); };
  const bLrm = $('#btnLogoRm');
  if (bLrm) bLrm.onclick = async () => {
    const logo = assetLogo();
    if (logo && confirm('¿Quitar tu logo?')) { await api.del('/api/assets/' + logo.id); ASSETS = await api.get('/api/assets'); render(); }
  };
  $$('[data-adel]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Eliminar esta foto?')) return;
    await api.del('/api/assets/' + b.dataset.adel);
    ASSETS = await api.get('/api/assets');
    render();
  });
}

/* ---------- CALENDARIO / HISTORIAL ---------- */
function badge(s) {
  const map = { scheduled: 'b-scheduled', published: 'b-published', failed: 'b-failed', draft: 'b-draft', cancelled: 'b-cancelled', publishing: 'b-scheduled' };
  const label = { scheduled: 'Programado', published: 'Publicado', failed: 'Falló', draft: 'Borrador', cancelled: 'Cancelado', publishing: 'Publicando…' };
  return `<span class="badge ${map[s] || 'b-draft'}">${label[s] || s}</span>`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 16 ? iso : iso.replace(' ', 'T'));
  return d.toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function postItem(p, actions) {
  const thumb = p.media_type === 'video'
    ? `<video class="thumb" src="${esc(p.image_path)}" muted preload="metadata" style="object-fit:cover"></video>`
    : `<img class="thumb" src="${esc(p.image_path)}">`;
  const vtag = p.media_type === 'video' ? `<span class="badge b-scheduled">🎬 video</span>` : '';
  return `<div class="post-item">
    ${thumb}
    <div class="info">
      <div class="cap">${esc(p.caption.split('\n')[0] || '(sin texto)')}</div>
      <div class="meta">${vtag}${badge(p.status)}
        ${p.scheduled_at && p.status === 'scheduled' ? `<span>📅 ${fmtDate(p.scheduled_at)}</span>` : ''}
        ${p.published_at ? `<span>✅ ${fmtDate(p.published_at)}</span>` : ''}
        ${p.ig_permalink ? `<a href="${esc(p.ig_permalink)}" target="_blank" style="color:var(--cel)">Ver en IG ↗</a>` : ''}
        ${p.error ? `<span style="color:#D64545">${esc(p.error)}</span>` : ''}
      </div>
    </div>
    <div class="acts">${actions}</div>
  </div>`;
}
/* ---------- MI SEMANA (dashboard) ---------- */
let SEM_NUDGES = [];

// Botones 👍/👎 para enseñarle a Posta lo que te gusta
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

async function semanaView() {
  let st = null;
  try { st = await api.get('/api/stats/summary'); } catch (e) { st = null; }
  const head = `<div class="page-head"><div class="ph-ico">🏠</div><div class="ph-txt"><h1>Mi semana</h1><p class="sub">Tu semana, armada. Vos no te ocupás de nada.</p></div></div>`;
  if (!st) return head + `<div class="empty"><div class="big">⏳</div>No pudimos cargar tu resumen. Probá de nuevo.</div>`;
  const w = st.week, ap = st.approval, mo = st.month;
  const ws = new Date(w.start + 'T12:00:00'), we = new Date(w.end + 'T12:00:00');
  const pct = w.planned ? Math.min(100, Math.round((w.ready / w.planned) * 100)) : 0;

  // Tira de 7 días (lun–dom)
  const dayKey = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA'); } catch { return ''; } };
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString('en-CA');
    const todays = w.posts.filter(p => dayKey(p.published_at || p.scheduled_at) === key);
    const cls = todays.some(p => p.status === 'published') ? 'ok' : todays.length ? 'pend' : 'empty';
    const ico = cls === 'ok' ? '✅' : cls === 'pend' ? '📅' : '·';
    days.push(`<div class="wk-day ${cls}"><span class="wd-n">${d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}</span><span class="wd-d">${d.getDate()}</span><span class="wd-i">${ico}</span></div>`);
  }

  // Gráfico de ritmo: últimas 8 semanas (posteos por semana — datos propios)
  const maxT = Math.max(1, ...st.weekly.map(x => x.total));
  const bars = st.weekly.map(x => `<div class="bar-w"><div class="bar" style="height:${Math.max(4, Math.round((x.total / maxT) * 100))}%"></div><span>${esc(x.label)}</span></div>`).join('');

  // Aprobación sin cambios
  const apBlock = ap.total
    ? `<div class="big-pct">${ap.approved_rate}%</div>
       <div class="pz-refbar check-bar"><div style="width:${ap.approved_rate}%"></div></div>
       <p class="d">De ${ap.total} ${ap.total === 1 ? 'posteo que opinaste' : 'posteos que opinaste'}, ${ap.approved} ${ap.approved === 1 ? 'salió' : 'salieron'} sin que toques nada.${ap.edited ? ` Tocaste ${ap.edited} y descartaste ${ap.rejected}.` : ''}</p>`
    : `<p class="d" style="margin:0">Todavía no hay datos. Marcá 👍 o 👎 en tus posteos y Posta aprende lo que te gusta para hacerlo cada vez mejor.</p>`;

  // Próximos posteos de la semana con 👍/👎
  const upcoming = w.posts.filter(p => ['scheduled', 'publishing'].includes(p.status));
  const upBlock = upcoming.length
    ? upcoming.map(p => postItem(p, sigBtns(p))).join('')
    : `<div class="empty"><div class="big">📭</div>No hay posteos pendientes esta semana.<br><br><a class="btn btn-primary" href="#/app/ideas">Armar mi semana</a></div>`;

  // Nudges de calendario comercial
  SEM_NUDGES = upcomingNudges();
  const nudgeBlock = SEM_NUDGES.map((n, i) => `
    <div class="card nudge-card">
      <div class="nudge-top"><span class="nudge-ico">📣</span><div><h3>Se acerca ${esc(n.name)}</h3>
      <p>${fmtDay(n.date)}${n.days === 0 ? ' — ¡es hoy!' : n.days === 1 ? ' — ¡es mañana!' : ` — faltan ${n.days} días`}${n.approx ? ' (fecha aprox.)' : ''}</p></div></div>
      <button class="btn btn-primary btn-sm" data-nudge="${i}">Armar idea →</button>
    </div>`).join('');

  return `${head}
  <div class="card sem-hero">
    <div class="sem-top"><div><h3>Esta semana</h3><p>${fmtDay(ws)} – ${fmtDay(we)}</p></div><span class="badge ${w.missing ? 'b-scheduled' : 'b-published'}">${w.ready}/${w.planned}</span></div>
    <div class="pz-refbar check-bar"><div style="width:${pct}%"></div></div>
    ${w.missing
      ? `<p class="sem-msg">Te ${w.missing === 1 ? 'falta 1 posteo' : `faltan ${w.missing} posteos`} para completar tu semana. <a href="#/app/ideas"><b>Armarlos ahora →</b></a></p>`
      : `<p class="sem-msg ok">✅ Tu semana está armada. Se publica sola, no tenés que hacer nada.</p>`}
  </div>
  <div class="card"><h3>📅 Día por día</h3><div class="wk-strip">${days.join('')}</div></div>
  ${nudgeBlock}
  <div class="card"><h3>🔜 Próximos posteos</h3><p class="d">Marcá 👍 si te gusta como está o 👎 si no te convence — así aprendemos.</p>${upBlock}</div>
  <div class="row2">
    <div class="card"><h3>📊 Tu ritmo</h3><p class="d">Posteos por semana (últimas 8)</p><div class="bars">${bars}</div></div>
    <div class="card"><h3>👍 Aprobados sin cambios</h3>${apBlock}</div>
  </div>
  <div class="card month-card">
    <div class="nudge-top"><span class="nudge-ico">🗓️</span><div><h3>Tu mes con Posta</h3><p>Lo que hicimos por vos este mes</p></div></div>
    <div class="month-grid">
      <div class="mstat"><b>${mo.published}</b><span>posteos publicados</span></div>
      <div class="mstat"><b>${mo.scheduled}</b><span>programados</span></div>
      <div class="mstat"><b>~0</b><span>minutos tuyos</span></div>
      <div class="mstat hl"><b>${mo.hours_saved} h</b><span>ahorradas (estimado)</span></div>
    </div>
    <p class="d">Hacer esto a mano te llevaría ~1,5 h por posteo entre idea, diseño, texto y publicación. Vos no moviste un dedo.</p>
  </div>`;
}

function bindSemana() {
  bindSignalBtns();
  $$('[data-nudge]').forEach(b => b.onclick = () => {
    const n = SEM_NUDGES[+b.dataset.nudge];
    if (!n) return;
    CREATOR = { step: 1, topic: n.topic, caption: '', hashtags: '', tpl: 'gradiente', pal: defaultPal(), palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', productPhoto: '', selected: [], cardPhoto: {} };
    location.hash = '#/app/crear';
  });
}

async function calendarView() {
  const posts = await api.get('/api/posts?status=scheduled');
  const drafts = await api.get('/api/posts?status=draft');
  const all = [...posts, ...drafts];
  return `<div class="page-head"><div class="ph-ico">📅</div><div class="ph-txt"><h1>Calendario</h1><p class="sub">Tus próximos posts. Se publican solos a la hora indicada.</p></div></div>
  ${all.length ? all.map(p => postItem(p, `
      ${sigBtns(p)}
      ${p.status === 'scheduled' ? `<button class="btn btn-soft btn-sm" data-act="now" data-id="${p.id}">Publicar ahora</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${p.id}">Cancelar</button>
    `)).join('') : `<div class="empty"><div class="big">📭</div>No tenés posts programados.<br><br><a class="btn btn-primary" href="#/app/crear">Crear el primero</a></div>`}`;
}
async function historyView() {
  const posts = await api.get('/api/posts');
  const done = posts.filter(p => ['published', 'failed', 'cancelled'].includes(p.status));
  return `<div class="page-head"><div class="ph-ico">📊</div><div class="ph-txt"><h1>Historial</h1><p class="sub">Todo lo que ya pasó por Posta. Marcá 👍/👎 y aprendemos lo que te gusta.</p></div></div>
  ${done.length ? done.map(p => postItem(p, `${p.status === 'published' ? sigBtns(p) : ''}${p.status === 'failed' ? `<button class="btn btn-soft btn-sm" data-act="now" data-id="${p.id}">Reintentar</button>` : ''}`)).join('')
    : `<div class="empty"><div class="big">📊</div>Todavía no hay historial.</div>`}`;
}

/* ---------- AJUSTES ---------- */
function ajustesView() {
  const p = PROFILE, s = SETTINGS;
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const igMsg = q.get('ig') === 'ok' ? `<div class="okmsg">✅ Instagram conectado: @${esc(p.ig_username)}</div>`
    : q.get('ig') === 'error' ? `<div class="err">❌ ${esc(q.get('msg') || 'Error al conectar')}</div>` : '';
  const planMsg = q.get('plan') === 'ok' ? `<div class="okmsg">✅ ¡Pago recibido! Tu plan ya está activo.</div>`
    : q.get('plan') === 'pending' ? `<div class="okmsg">⏳ Tu pago está en proceso. Te avisamos cuando se acredite.</div>`
    : q.get('plan') === 'error' ? `<div class="err">❌ El pago no se completó. Probá de nuevo.</div>` : '';
  const tokenWarn = s.ig_token_warning ? `<div class="err" style="margin-bottom:18px">⚠️ <b>Tu conexión con Instagram necesita atención:</b> no pudimos renovar tu token automáticamente. Reconectá tu cuenta abajo.</div>` : '';
  const bc = brandColors();
  return `<div class="page-head"><div class="ph-ico">⚙️</div><div class="ph-txt"><h1>Ajustes</h1><p class="sub">Tu negocio, tu marca, tu plan y tus integraciones.</p></div></div>
  ${igMsg}${planMsg}${tokenWarn}
  <div class="card card-hi-yl"><h3>💳 Mi plan</h3>
    <div id="planZone"><p style="color:var(--dim)">Cargando...</p></div>
  </div>
  <div class="card card-hi-cel"><h3>🎁 Referidos · 50% off</h3>
    <div id="refZone"><p style="color:var(--dim)">Cargando...</p></div>
  </div>
  <div class="card"><h3>🏪 Tu negocio</h3>
    <div class="row2">
      <div class="field"><label>Nombre del negocio</label><input id="s_biz" value="${esc(p.business_name)}" placeholder="Mi Tienda"></div>
      <div class="field"><label>Usuario de Instagram</label><input id="s_iguser" value="${esc(p.ig_username)}" placeholder="mitienda"></div>
    </div>
    <div class="row2">
      <div class="field"><label>Rubro</label><select id="s_cat">
        ${['ropa', 'gastronomia', 'fitness', 'servicios', 'mascotas', 'viajes', 'belleza', 'otro'].map(c => `<option ${p.category === c ? 'selected' : ''} value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Tono de la IA</label><select id="s_tone">
        ${['canchero', 'profesional', 'divertido'].map(t => `<option ${p.tone === t ? 'selected' : ''} value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}
      </select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Zona horaria <span style="color:var(--dim);font-weight:400">(para programar a las 19:00 de tu país)</span></label><select id="s_tz">
        ${TIMEZONES.map(t => `<option ${s.timezone === t ? 'selected' : ''} value="${t}">${t.replace('_', ' ')}</option>`).join('')}
      </select></div>
      <div class="field"><label>Objetivo</label><select id="s_goal">
        ${GOALS.map(([v, ico, t]) => `<option ${p.goal === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
      </select></div>
    </div>
    <div class="field"><label>Descripción (para que la IA te conozca)</label><textarea id="s_desc" placeholder="Vendemos ropa urbana para jóvenes en Palermo...">${esc(p.description)}</textarea>
      <div class="hint">Mientras más nos cuentes, mejores ideas creamos por vos.</div></div>
    <div class="field"><label>Tus competidores <span style="color:var(--dim);font-weight:400">(nombres o usuarios de IG, separados por coma)</span></label>
      <input id="s_comp" value="${esc(p.competitors || '')}" placeholder="tiendaX, @competidor2">
      <div class="hint">Los estudiamos para crear ideas que te hagan destacar.</div></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnSaveProfile">Guardar</button> <span id="profMsg"></span>
      <button class="btn btn-ghost btn-sm" id="btnOnb">🧭 Retomar guía inicial</button>
    </div>
  </div>
  <div class="card"><h3>🎨 Mi marca</h3>
    <p style="color:var(--mut);font-size:14px;margin-bottom:16px">Tus fotos están en <a href="#/app/fotos" style="color:var(--cel);font-weight:700">Mis fotos</a>. Acá definís tu logo y tus colores: todo lo que generemos sale con tu identidad.</p>
    <div class="row2">
      <div class="field"><label>Logo</label>
        <div style="display:flex;gap:10px;align-items:center">
          ${assetLogo() ? `<img src="${assetLogo().file_path}" style="max-height:48px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px">` : '<span style="color:var(--dim);font-size:14px">Sin logo</span>'}
          <button class="btn btn-ghost btn-sm" id="btnBrandLogo">📤 ${assetLogo() ? 'Cambiar' : 'Subir'}</button>
        </div>
        <input type="file" id="s_logofile" accept="image/*" style="display:none">
      </div>
      <div class="field"><label>Paleta preferida</label><select id="s_pal">
        ${getPalettes().map((pl, i) => `<option value="${i}" ${defaultPal() === i ? 'selected' : ''}>${pl.name}${pl.brand ? ' (tus colores)' : ''}</option>`).join('')}
      </select></div>
    </div>
    <div class="field"><label>Colores de tu marca <span style="color:var(--dim);font-weight:400">(con 2 alcanza para activar "Mi marca")</span></label>
      <div style="display:flex;gap:10px">
        ${[0, 1, 2].map(i => `<input type="color" id="s_c${i}" value="${bc[i] || ['#FEC14D', '#2793C8', '#0A1E33'][i]}" style="width:56px;height:44px;border:1px solid var(--line);border-radius:12px;padding:4px;background:#fff;cursor:pointer">`).join('')}
      </div>
    </div>
    <button class="btn btn-primary" id="btnSaveBrand">Guardar marca</button> <span id="brandMsg"></span>
  </div>
  <div class="card"><h3>📸 Instagram</h3>
    <div class="set-row"><div><div class="t">Modo demo ${s.demo_mode ? '(activo)' : ''}</div>
      <div class="d">En modo demo las publicaciones se simulan: probá todo el flujo sin conectar nada. Desactivalo para publicar de verdad.</div></div>
      <div class="toggle ${s.demo_mode ? 'on' : ''}" id="tglDemo"></div></div>
    <div class="set-row"><div><div class="t">Cuenta conectada</div>
      <div class="d">${p.ig_connected ? `✅ @${esc(p.ig_username)} — lista para publicar` : 'Todavía no conectaste tu Instagram. Necesitás una cuenta profesional (Business o Creator).'}</div></div>
      ${p.ig_connected ? `<button class="btn btn-danger btn-sm" id="btnIgDisc">Desconectar</button>` : `<button class="btn btn-soft btn-sm" id="btnIgConn">Conectar Instagram</button>`}
    </div>
    <div id="igMsg"></div>
  </div>
  <div class="card"><h3>🔑 Integraciones</h3>
    <div class="field"><label>OpenAI API Key <span style="color:var(--dim);font-weight:400">(opcional — sin esto usa el generador local)</span></label>
      <input id="s_openai" type="password" value="${esc(s.openai_key)}" placeholder="sk-..."></div>
    <div class="row2">
      <div class="field"><label>Meta App ID</label><input id="s_appid" value="${esc(s.meta_app_id)}" placeholder="123456789"></div>
      <div class="field"><label>Meta App Secret</label><input id="s_appsecret" type="password" value="${esc(s.meta_app_secret)}" placeholder="••••••"></div>
    </div>
    <div class="field"><label>Instagram Embed URL <span style="color:var(--dim);font-weight:400">(del dashboard de Meta → caso de uso Instagram → "API setup with Instagram login")</span></label>
      <input id="s_igembed" value="${esc(s.ig_embed_url)}" placeholder="https://www.instagram.com/oauth/authorize?..."></div>
    <div class="field"><label>URL pública de imágenes <span style="color:var(--dim);font-weight:400">(para publicar de verdad, ej: https://tu-dominio.com)</span></label>
      <input id="s_imgurl" value="${esc(s.image_base_url)}" placeholder="https://..."></div>
    <button class="btn btn-primary" id="btnSaveSettings">Guardar integraciones</button> <span id="setMsg"></span>
    <p class="hint" style="margin-top:14px">📖 El paso a paso para crear tu app de Meta y publicar de verdad está en el <b>README</b> del proyecto.</p>
  </div>`;
}

/* ---------- ONBOARDING (4 pasos) ---------- */
let OB = null;
function freshOB() {
  return {
    step: 1,
    business_name: (PROFILE && PROFILE.business_name) || '',
    category: (PROFILE && PROFILE.category) || 'ropa',
    description: (PROFILE && PROFILE.description) || '',
    competitors: (PROFILE && PROFILE.competitors) || '',
    goal: (PROFILE && PROFILE.goal) || '',
    palSel: '0',
    c1: '#FEC14D', c2: '#2793C8', c3: '#0A1E33',
    useBrand: false,
  };
}
const GOALS = [
  ['vender', '💰', 'Vender más', 'Que cada post traiga clientes y ventas'],
  ['seguidores', '📈', 'Más seguidores', 'Crecer la comunidad y el alcance'],
  ['lanzamiento', '🚀', 'Lanzamientos', 'Anunciar novedades y promos con fuerza'],
];
function onboardingView() {
  const o = OB;
  const stepsBar = `<div class="steps-bar">${[1, 2, 3, 4].map(i => `<div class="s ${i <= o.step ? 'on' : ''}"></div>`).join('')}</div>`;
  let body = '';
  if (o.step === 1) body = `
    <h3>Tu negocio 🏪</h3>
    <div class="field"><label>Nombre del negocio</label><input id="ob_biz" value="${esc(o.business_name)}" placeholder="Mi Tienda"></div>
    <div class="field"><label>Rubro</label><select id="ob_cat">
      ${['ropa', 'gastronomia', 'fitness', 'servicios', 'mascotas', 'viajes', 'belleza', 'otro'].map(c => `<option ${o.category === c ? 'selected' : ''} value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
    </select></div>
    <div class="field"><label>Contanos en una frase qué hacés</label><textarea id="ob_desc" placeholder="Vendemos ropa urbana para jóvenes en Palermo...">${esc(o.description)}</textarea></div>`;
  if (o.step === 2) body = `
    <h3>Tus competidores 🔍</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:18px">Los estudiamos para crear contenido que te haga <b>destacar</b>, no copiar.</p>
    <div class="field"><label>Nombres o usuarios de Instagram, separados por coma</label><input id="ob_comp" value="${esc(o.competitors)}" placeholder="tiendaX, @competidor2"></div>
    <div class="hint">Si no tenés a mano, saltealo y lo agregás después en Ajustes.</div>`;
  if (o.step === 3) body = `
    <h3>Tu estilo 🎨</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:18px">Tus fotos, tu logo y tus colores: todo lo que generemos sale con tu marca.</p>
    <div class="field"><label>Logo (opcional)</label>
      <div style="display:flex;gap:10px;align-items:center">
        ${assetLogo() ? `<img src="${assetLogo().file_path}" style="max-height:56px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px">` : ''}
        <button class="btn btn-ghost btn-sm" id="ob_logo">📤 ${assetLogo() ? 'Cambiar logo' : 'Subir logo'}</button>
      </div>
      <input type="file" id="ob_logofile" accept="image/*" style="display:none">
    </div>
    <div class="field"><label>Tus colores de marca (opcional, con 2 alcanza)</label>
      <div style="display:flex;gap:10px">
        ${['c1', 'c2', 'c3'].map(k => `<input type="color" id="ob_${k}" value="${o[k]}" style="width:56px;height:44px;border:1px solid var(--line);border-radius:12px;padding:4px;background:#fff;cursor:pointer">`).join('')}
      </div>
      <div class="hint">Si los completás, creamos la paleta "Mi marca" y es la que usamos por defecto.</div>
    </div>
    <div class="field"><label>Paleta preferida</label><select id="ob_pal">
      ${getPalettes().map((p, i) => `<option value="${p.brand ? 'brand' : BASE_PALETTES.indexOf(p)}" ${String(o.palSel) === (p.brand ? 'brand' : String(BASE_PALETTES.indexOf(p))) ? 'selected' : ''}>${p.name}${p.brand ? ' (tus colores)' : ''}</option>`).join('')}
    </select></div>`;
  if (o.step === 4) body = `
    <h3>Tu objetivo 🎯</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:18px">Para enfocar las ideas y los textos en lo que más te sirve.</p>
    <div style="display:grid;gap:12px">
      ${GOALS.map(([v, ico, t, d]) => `
      <button class="goal-card ${o.goal === v ? 'on' : ''}" data-goal="${v}">
        <span class="gc-ico">${ico}</span>
        <span><b class="gc-t">${t}</b><br><span class="gc-d">${d}</span></span>
      </button>`).join('')}
    </div>`;
  return `<div class="page-head"><div class="ph-ico">🚀</div><div class="ph-txt"><h1>Te configuramos todo</h1><p class="sub">Paso ${o.step} de 4 — 2 minutos y no te pedimos más nada.</p></div></div>
  ${stepsBar}
  <div class="card" style="max-width:640px">${body}
    <div id="obMsg" style="margin-top:8px"></div>
    <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
      ${o.step > 1 ? `<button class="btn btn-ghost" id="obBack">← Atrás</button>` : ''}
      ${o.step < 4 ? `<button class="btn btn-primary" id="obNext" style="flex:1">Continuar →</button>` : `<button class="btn btn-primary" id="obFinish" style="flex:1">✨ Listo, a crear contenido</button>`}
    </div>
    <div style="text-align:center;margin-top:14px"><a href="#/app/crear" style="color:var(--dim);font-size:14px">Saltear por ahora →</a></div>
  </div>`;
}

function bindOnboarding() {
  const o = OB;
  const back = $('#obBack');
  if (back) back.onclick = () => { o.step--; render(); };
  const next = $('#obNext');
  if (next) next.onclick = () => {
    if (o.step === 1) {
      o.business_name = $('#ob_biz').value.trim();
      o.category = $('#ob_cat').value;
      o.description = $('#ob_desc').value.trim();
      if (!o.business_name) { $('#obMsg').innerHTML = `<div class="err">Poné el nombre de tu negocio</div>`; return; }
    }
    if (o.step === 2) o.competitors = $('#ob_comp').value.trim();
    if (o.step === 3) {
      o.c1 = $('#ob_c1').value; o.c2 = $('#ob_c2').value; o.c3 = $('#ob_c3').value;
      o.palSel = $('#ob_pal').value;
    }
    o.step++; render();
  };
  $$('[data-goal]').forEach(b => b.onclick = () => { o.goal = b.dataset.goal; render(); });
  const bl = $('#ob_logo');
  if (bl) bl.onclick = () => $('#ob_logofile').click();
  const lf = $('#ob_logofile');
  if (lf) lf.onchange = async () => {
    if (!lf.files[0]) return;
    try { await uploadAssetFile(lf.files[0], 'logo'); render(); }
    catch (e) { $('#obMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  const fin = $('#obFinish');
  if (fin) fin.onclick = async () => {
    fin.disabled = true; fin.textContent = '⏳ Guardando...';
    try {
      await api.put('/api/profile', {
        business_name: o.business_name, category: o.category, description: o.description,
        competitors: o.competitors, goal: o.goal || 'vender',
        ig_username: (PROFILE && PROFILE.ig_username) || '',
        tone: (PROFILE && PROFILE.tone) || 'canchero',
      });
      // Brand kit
      const colors = [o.c1, o.c2, o.c3].filter((c, i, a) => a.indexOf(c) === i);
      if (colors.length >= 2) await api.put('/api/settings', { brand_colors: colors });
      SETTINGS = await api.get('/api/settings');
      const pals = getPalettes();
      let palIdx = 0;
      if (o.palSel === 'brand' && pals[0] && pals[0].brand) palIdx = 0;
      else {
        const bi = parseInt(o.palSel, 10);
        palIdx = pals.findIndex(p => !p.brand && BASE_PALETTES.indexOf(p) === bi);
        if (palIdx < 0) palIdx = 0;
      }
      await api.put('/api/settings', { preferred_palette: palIdx });
      await refreshSession();
      // Si viene de /prueba con plan preseleccionado, va directo a elegirlo
      const chosenPlan = localStorage.getItem('posta_chosen_plan');
      location.hash = chosenPlan ? '#/app/ajustes?plan_sel=' + encodeURIComponent(chosenPlan) : '#/app/ideas';
    } catch (e) {
      $('#obMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      fin.disabled = false; fin.textContent = '✨ Listo, a crear contenido';
    }
  };
}

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
        }
        await api.post(isReg ? '/api/auth/register' : '/api/auth/login', body);
        await refreshSession();
        if (isReg) localStorage.removeItem('posta_ref');
        // Onboarding si el perfil está incompleto; si viene de /prueba, va a elegir plan
        const chosen = localStorage.getItem('posta_chosen_plan');
        if (PROFILE && PROFILE.business_name) {
          location.hash = chosen ? '#/app/ajustes?plan_sel=' + encodeURIComponent(chosen) : '#/app/semana';
        } else {
          location.hash = '#/app/onboarding';
          OB = freshOB();
        }
      } catch (e) { $('#formErr').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    return;
  }
  if (path === '#/' || path === '') {
    PLANS_CACHE = await api.get('/api/billing/plans').catch(() => null);
    root.innerHTML = landingView(PLANS_CACHE);
    LANDING_ON = true;
    return;
  }

  // App (requiere login)
  LANDING_ON = false;
  await refreshSession();
  if (!ME) { location.hash = '#/login'; return; }
  const tab = (path.split('/')[2] || 'semana');
  let content = '';
  if (tab === 'semana') content = await semanaView();
  else if (tab === 'crear') content = creatorView();
  else if (tab === 'ideas') content = await ideasView();
  else if (tab === 'video') content = videoView();
  else if (tab === 'fotos') content = fotosView();
  else if (tab === 'onboarding') { if (!OB) OB = freshOB(); content = onboardingView(); }
  else if (tab === 'calendario') content = await calendarView();
  else if (tab === 'historial') content = await historyView();
  else content = ajustesView();
  root.innerHTML = appShell(tab, content);
  bindApp(tab);
}

function bindApp(tab) {
  pwaWire();
  $$('.mtab,.side-link[data-tab],.mbar-btn[data-tab],.msheet-btn[data-tab]').forEach(b => b.onclick = () => location.hash = '#/app/' + b.dataset.tab);
  $$('[data-ig-connect]').forEach(b => b.onclick = igConnect);
  const lo1 = $('#btnLogout'), lo2 = $('#btnLogoutM');
  if (lo1) lo1.onclick = async () => { await api.post('/api/auth/logout'); location.hash = '#/'; };
  if (lo2) lo2.onclick = async () => { await api.post('/api/auth/logout'); location.hash = '#/'; };
  const mm = $('#mbarMore'), ms = $('#msheet'), mb = $('#msheetBg');
  if (mm && ms) mm.onclick = () => ms.classList.add('open');
  if (mb && ms) mb.onclick = () => ms.classList.remove('open');

  if (tab === 'semana') bindSemana();
  if (tab === 'crear') bindCreator();
  if (tab === 'ideas') bindIdeas();
  if (tab === 'video') bindVideo();
  if (tab === 'fotos') bindFotos();
  if (tab === 'onboarding') bindOnboarding();
  if (tab === 'calendario' || tab === 'historial') {
    $$('[data-act]').forEach(b => b.onclick = async () => {
      const id = b.dataset.id, act = b.dataset.act;
      if (act === 'cancel' && !confirm('¿Cancelar este post?')) return;
      await api.patch(`/api/posts/${id}`, { action: act === 'now' ? 'publish-now' : 'cancel' });
      render();
    });
    bindSignalBtns();
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
        : `<button class="btn btn-ghost" id="btnProdPhAdd" type="button">📷 Agregar foto de tu producto</button>
           <div id="prodPhMsg"></div>`;
      const trig = () => $('#c_prodPhotoFile').click();
      const bAdd = $('#btnProdPhAdd'); if (bAdd) bAdd.onclick = trig;
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
        if (!r.ok) throw new Error(data.error || 'No se pudo subir');
        c.productPhoto = data.path;
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
      } catch (e) {
        alert('No se pudo subir la foto: ' + e.message);
      }
      renderProdBox();
    };
    renderProdBox();
    $('#btnGen').onclick = async () => {
      c.topic = $('#c_topic').value.trim();
      if (!c.topic) { $('#genErr').innerHTML = `<div class="err">Escribí el tema del post primero</div>`; return; }
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
        btn.disabled = false; btn.textContent = '🤖 Generar con IA';
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
      $('#btnSaveDesign').disabled = true; $('#btnSaveDesign').textContent = '⏳ Guardando...';
      try {
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        c.imagePath = data.path; c.step = 3; render();
      } catch (e) { alert('Error: ' + e.message); $('#btnSaveDesign').disabled = false; $('#btnSaveDesign').textContent = 'Guardar diseño →'; }
    };
  }
  if (c.step === 'options') {
    $$('.opt-use').forEach(b => b.onclick = () => {
      const o = c.options[+b.dataset.use]; if (!o) return;
      c.imagePath = o.image; c.caption = o.caption || ''; c.hashtags = o.hashtags || '';
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
        if (!r.ok) throw new Error(data.error || 'No se pudo subir');
        ASSETS = await api.get('/api/assets').catch(() => ASSETS);
        await applyCardPhoto(pickIdx, data.path);
      } catch (e) {
        $('#pickMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      }
      $('#pickFile').value = '';
    };
    // ---- Subir fotos a la librería (arriba de las opciones) ----
    $('#btnUploadPhotos').onclick = () => $('#mpFiles').click();
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
        return `<div class="sched-row">
          <img src="${esc(o.image)}" class="sched-thumb" alt="">
          <div class="sched-info"><b>${esc(o.title || 'Diseño')}</b><span class="mut">${esc((o.caption || '').slice(0, 60))}…</span></div>
          <input type="datetime-local" data-swhen="${r.idx}" value="${isoToLocalInput(r.iso)}">
        </div>`;
      }).join('');
      $('#schedMsg').innerHTML = '';
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
        $('#schedMsg').innerHTML = `<div class="okmsg">✅ ${r.count} ${r.count === 1 ? 'posteo programado' : 'posteos programados'} — <a href="#/app/calendario">ver en Calendario</a></div>`;
        c.selected = [];
        $$('.opt-selbox').forEach(ch => { ch.checked = false; });
        $$('.opt-card').forEach(cd => cd.classList.remove('selected'));
        updateMultiBar();
        setTimeout(() => { $('#schedModal').style.display = 'none'; location.hash = '#/app/calendario'; }, 1800);
      } catch (e) {
        $('#schedMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
        btn.disabled = false; btn.textContent = '✅ Confirmar';
      }
    };
    $('#btnRegen').onclick = async () => {
      const btn = $('#btnRegen');
      btn.disabled = true; btn.textContent = '🎨 Generando nuevas opciones...';
      try {
        const out = await api.post('/api/creator/options', { topic: c.topic, productPhoto: c.productPhoto || undefined });
        if (!out || !Array.isArray(out.options) || !out.options.length) throw new Error('No llegaron opciones, probá de nuevo');
        applyOptions(out);
      } catch (e) {
        $('#optErr').innerHTML = `<div class="err">${esc(e.message)}</div>`;
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
    const done = (msg) => {
      $('#pubMsg').innerHTML = `<div class="okmsg">${msg}</div>`;
      CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', options: null, detected: null, recommendedIndex: 0, recommendedReason: '', feedback: '', productPhoto: '', selected: [], cardPhoto: {} };
      setTimeout(() => location.hash = '#/app/calendario', 1400);
    };
    $('#btnSchedule').onclick = async () => {
      const when = $('#p_when').value;
      if (!when) { $('#pubMsg').innerHTML = `<div class="err">Elegí fecha y hora</div>`; return; }
      try {
        await api.post('/api/posts', { image_path: c.imagePath, caption: c.caption, hashtags: c.hashtags, scheduled_at: new Date(when).toISOString() });
        done('✅ Post programado. Se publica solo a la hora indicada.');
      } catch (e) { $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    $('#btnNow').onclick = async () => {
      try {
        const { id } = await api.post('/api/posts', { image_path: c.imagePath, caption: c.caption, hashtags: c.hashtags });
        await api.patch(`/api/posts/${id}`, { action: 'publish-now' });
        done('⚡ Publicando ahora... mirá el historial en unos segundos.');
      } catch (e) { $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    };
    $('#btnBack2').onclick = () => { c.step = 2; render(); };
  }
}

async function igConnect() {
  try { const { url } = await api.get('/api/ig/start'); location.href = url; }
  catch (e) {
    const m = $('#igMsg');
    if (m) m.innerHTML = `<div class="err">${esc(e.message)}</div>`;
    else alert('Error: ' + e.message);
  }
}
function bindSettings() {
  $('#btnSaveProfile').onclick = async () => {
    await api.put('/api/profile', {
      business_name: $('#s_biz').value, ig_username: $('#s_iguser').value.replace('@', ''),
      category: $('#s_cat').value, tone: $('#s_tone').value, description: $('#s_desc').value,
      competitors: $('#s_comp').value, goal: $('#s_goal').value,
    });
    await api.put('/api/settings', { timezone: $('#s_tz').value });
    $('#profMsg').innerHTML = '<span style="color:var(--cel);font-size:14px">✅ Guardado</span>';
    PROFILE = await api.get('/api/profile');
    SETTINGS = await api.get('/api/settings');
  };
  const bOnb = $('#btnOnb');
  if (bOnb) bOnb.onclick = () => { OB = freshOB(); location.hash = '#/app/onboarding'; };
  // Mi plan
  (async () => {
    const z = $('#planZone');
    if (!z) return;
    try {
      const { plans, mp_configured } = await api.get('/api/billing/plans');
      const cur = (ME && ME.plan) || 'esencial';
      const hasActive = ME && !ME.is_trial && ME.plan_status === 'active';
      const statusTag = !hasActive ? `<span style="font-size:13px;color:var(--dim)">(${ME && ME.plan_status === 'cancelled' ? 'cancelado' : 'trial'})</span>` : '';
      const curPlan = plans.find(p => p.id === cur) || plans[0];
      const planCard = (p) => `
          <div class="plan-mini${p.id === cur && hasActive ? ' cur' : ''}">
            <div class="pm-top"><b>${esc(p.name)}</b> ${p.highlighted ? '<span class="badge b-scheduled">Recomendado</span>' : ''}</div>
            <div class="pm-price">${esc(p.price_label)}<small>/mes</small></div>
            <div class="pm-perk">${p.postsPerWeek} posts/semana</div>
            <button class="btn ${p.id === cur && hasActive ? 'btn-ghost' : 'btn-primary'} btn-sm btn-block" data-sub="${p.id}" ${p.id === cur && hasActive ? 'disabled' : ''}>${p.id === cur && hasActive ? 'Plan actual' : 'Suscribirse'}</button>
          </div>`;
      const bindSub = () => {
        $$('#planList [data-sub]').forEach(b => b.onclick = () => {
          if (!mp_configured) { $('#planMsg').innerHTML = `<div class="err">Pagos no configurados todavía.</div>`; return; }
          // Paso 1: pedir el email de la cuenta de MercadoPago (debe coincidir con la que paga)
          const preset = esc((ME && (ME.mp_payer_email || ME.email)) || '');
          $('#planMsg').innerHTML = `
            <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:12px">
              <div style="font-weight:800;margin-bottom:6px">Un paso más 💳</div>
              <div style="font-size:14px;color:var(--mut);margin-bottom:10px">Ingresá el <b>email de tu cuenta de MercadoPago</b>, el mismo con el que vas a pagar.</div>
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
          <div style="font-size:13px;color:var(--dim)">Plan actual</div>
          <div style="font-size:20px;font-weight:800">${esc(curPlan.name)} ${statusTag}</div>
        </div>
        <div style="font-size:16px;font-weight:800;margin-bottom:12px">Elegí tu plan para empezar 🚀</div>
        <div id="planList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${plans.map(planCard).join('')}</div>
        <div id="planMsg" style="margin-top:10px"></div>
        <p style="font-size:13px;color:var(--dim);margin-top:12px">Se renueva automáticamente cada mes. Podés cancelar cuando quieras.</p>`;
        bindSub();
      } else {
        z.innerHTML = `
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div class="plan-cur">
            <div class="pc-label">Plan actual</div>
            <div class="pc-name">${esc(curPlan.name)}</div>
            <div class="pc-det">${esc(curPlan.price_label)}/mes · ${curPlan.postsPerWeek} posts/semana · se renueva solo cada mes</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btnCancelSub" style="color:#c0392b">Cancelar suscripción</button>
        </div>
        <div id="planMsg" style="margin-top:10px"></div>
        <p style="font-size:13px;color:var(--dim)">Para cambiar de plan, primero cancelá tu suscripción actual y después elegí el nuevo.</p>`;
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
        const refInfo = await pzReferral();
        if (refInfo && refInfo.discount_active) {
          z.insertAdjacentHTML('afterbegin', `<div class="pz-disc">🎁 <b>50% off por referidos</b>: se aplica automáticamente al suscribirte.</div>`);
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
    z.innerHTML = `
      <p style="color:var(--mut);font-size:14px;margin-bottom:4px">Compartí tu link personal: si <b>${need} amigos</b> se suscriben con tu link, <b>pagás la mitad todos los meses</b>.</p>
      <div class="pz-refrow">
        <input id="pzRefLink" readonly value="${esc(info.link)}" onclick="this.select()">
        <button class="btn btn-primary btn-sm" id="pzRefCopy">Copiar</button>
      </div>
      <div class="pz-refbar"><div style="width:${pct}%"></div></div>
      <p style="font-size:14px;color:var(--mut)"><b>${n}/${need}</b> amigos suscriptos</p>
      ${info.discount_active
        ? `<div class="pz-disc">✅ Tenés <b>50% off activo</b> en tu suscripción.</div>`
        : `<p style="font-size:14px">Te falta(n) <b>${missing}</b>: cuando ${need} amigos se suscriban con tu link, pagás la mitad.</p>`}
      <span id="pzRefMsg" style="font-size:13px"></span>`;
    $('#pzRefCopy').onclick = async () => {
      const v = $('#pzRefLink').value;
      try { await navigator.clipboard.writeText(v); }
      catch (e) {
        const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e2) {}
        t.remove();
      }
      $('#pzRefMsg').innerHTML = '<span style="color:var(--cel)">✅ Link copiado</span>';
    };
  })();
  // Marca
  const bBlog = $('#btnBrandLogo');
  if (bBlog) bBlog.onclick = () => $('#s_logofile').click();
  const slf = $('#s_logofile');
  if (slf) slf.onchange = async () => {
    if (!slf.files[0]) return;
    try { await uploadAssetFile(slf.files[0], 'logo'); render(); }
    catch (e) { $('#brandMsg').innerHTML = `<span style="color:var(--red);font-size:14px">${esc(e.message)}</span>`; }
  };
  $('#btnSaveBrand').onclick = async () => {
    const colors = [$('#s_c0').value, $('#s_c1').value, $('#s_c2').value].filter((c, i, a) => a.indexOf(c) === i);
    await api.put('/api/settings', { brand_colors: colors, preferred_palette: +$('#s_pal').value });
    $('#brandMsg').innerHTML = '<span style="color:var(--cel);font-size:14px">✅ Marca guardada</span>';
    SETTINGS = await api.get('/api/settings');
  };
  $('#btnSaveSettings').onclick = async () => {
    await api.put('/api/settings', {
      openai_key: $('#s_openai').value, meta_app_id: $('#s_appid').value,
      meta_app_secret: $('#s_appsecret').value, ig_embed_url: $('#s_igembed').value,
      image_base_url: $('#s_imgurl').value,
    });
    $('#setMsg').innerHTML = '<span style="color:var(--cel);font-size:14px">✅ Guardado</span>';
  };
  $('#tglDemo').onclick = async () => {
    const v = !$('#tglDemo').classList.contains('on');
    await api.put('/api/settings', { demo_mode: v });
    render();
  };
  const bc = $('#btnIgConn');
  if (bc) bc.onclick = igConnect;
  const bd = $('#btnIgDisc');
  if (bd) bd.onclick = async () => { await api.post('/api/ig/disconnect'); render(); };
}

window.addEventListener('hashchange', render);
render();
