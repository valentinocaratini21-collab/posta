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
    if (!r.ok) {
      if (r.status === 402 && data.error === 'trial_expired') {
        if (typeof ME !== 'undefined' && ME) ME.trial_expired = true;
        try { location.hash = '#/app/ajustes'; } catch (e) {}
      }
      throw new Error(data.message || data.error || 'Error');
    }
    return data;
  },
  get: (u) => api.req('GET', u),
  post: (u, b) => api.req('POST', u, b),
  put: (u, b) => api.req('PUT', u, b),
  patch: (u, b) => api.req('PATCH', u, b),
  delete: (u) => api.req('DELETE', u),
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
    <p class="sub"><b>Vos no diseñás nada.</b> Con un clic armás tu semana; nosotros la publicamos sola en tu Instagram.</p>
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
    <div class="hero-note">Sin tarjeta · 10 días gratis · 🛡️ Garantía de 30 días · Cancelá cuando quieras</div>
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
      <div class="feat"><div class="ico">🎬</div><h3>Videos para Reels</h3><p>Convertimos tus fotos en videos verticales listos para Reels, en el formato que más rinde.</p></div>
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
        <p>Nos contás de tu negocio <b>una sola vez</b>. Creamos las ideas, los diseños y los textos, y publicamos en automático en tu cuenta. En pesos, con MercadoPago. Y lo probás <b>10 días gratis</b>, sin tarjeta.</p>
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
      <details><summary>¿Y si no me funciona?</summary><p>Tenés 30 días de garantía: si no estás conforme, te devolvemos el 100% de tu primer pago. Sin preguntas.</p></details>
      <details><summary>¿Cuándo veo mi primera semana?</summary><p>Ni bien pagás: armás tu primera semana con un clic y la dejás programada.</p></details>
      <details><summary>¿Tienen programa de referidos?</summary><p>Sí 🎁 En Ajustes → Referidos tenés tu link personal: si 2 referidos se suscriben con tu link, pagás la mitad todos los meses.</p></details>
      <details><summary>¿Qué pasa si mi referido cancela?</summary><p>El 50% off se mantiene mientras tus 2 referidos sigan suscriptos. Si uno cancela, volvés al precio normal hasta conseguir otro referido activo.</p></details>
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
    <p class="sub">${isLogin ? 'Entrá para seguir automatizando.' : '10 días gratis, sin tarjeta.'}</p>
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
let CHAT = [];       // [{role:'user'|'assistant', text}]
let CHAT_IDEA = null; // propuesta cerrada por el consultor {titulo, angulo}
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
  return list;
}
// La paleta por defecto siempre es "Mi marca" (indice 0 cuando hay colores de marca).
function defaultPal() { return 0; }
const PALETTES = BASE_PALETTES; // compat: usar getPalettes() para la lista efectiva

// Saca los N colores dominantes de una imagen (se usa para autocompletar
// los colores de marca desde el logo que sube el cliente). Filtra fondos
// blancos/negros y grises para quedarse con los colores reales de la marca.
function extractTopColors(img, n) {
  const cw = 120, chh = 120;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const s = Math.min(cw / img.naturalWidth, chh / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, chh);
  cx.drawImage(img, (cw - w) / 2, (chh - h) / 2, w, h);
  const d = cx.getImageData(0, 0, cw, chh).data;
  const buckets = {};
  for (let y = 0; y < chh; y += 2) {
    for (let x = 0; x < cw; x += 2) {
      const i = (y * cw + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn < 28) continue;              // grises
      if (mx > 242 && mn > 225) continue;      // blancos (fondos de logo)
      if (mx < 24) continue;                   // negros
      const key = [r >> 5, g >> 5, b >> 5].join(',');
      buckets[key] = (buckets[key] || 0) + 1;
    }
  }
  const toHex = (v) => Math.round(v * 32 + 16).toString(16).padStart(2, '0').toUpperCase();
  return Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, n || 3)
    .map(([k]) => '#' + k.split(',').map(Number).map(toHex).join(''));
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
          <div class="pal-row">${getPalettes().map((p, i) => `<div class="pal ${c.pal === i ? 'on' : ''}" data-pal="${i}" title="${p.name}${p.brand ? ' (tus colores)' : ''}" style="background:linear-gradient(135deg,${p.c.join(',')});${p.brand ? 'box-shadow:0 0 0 2px var(--yl)' : ''}"></div>`).join('')}</div>
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
  const drafts = posts.filter(p => p.status === 'draft');
  if (drafts.length) return `<div class="card rec-card">
      <div class="rec-tag">📋 Tu semana</div>
      <h3>Tenés ${drafts.length} ${drafts.length === 1 ? 'borrador' : 'borradores'} para revisar</h3>
      <p>Mirá cada posteo, editá lo que quieras y programá la semana cuando esté lista 👇</p>
    </div>`;
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
function autopilotCardHTML() {
  const ppw = (ME && ME.posts_per_week) || 3;
  const planName = (ME && ME.plan ? ME.plan[0].toUpperCase() + ME.plan.slice(1) : 'Esencial');
  const planTag = ME && ME.is_trial ? `${planName} (${ME.trial_expired ? 'prueba terminada' : 'trial'})` : planName;
  const opts = [3, 5, 7].filter(v => v <= ppw).map(v => `<option value="${v}" ${v === ppw ? 'selected' : ''}>${v} posts por semana</option>`).join('');
  return `
  <div class="card card-hi-yl">
    <h3>🚀 Llenamos tu semana en autopilot</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:6px">Creamos los textos, los diseños y un reel. Vos los revisás y aprobás — recién ahí se programan.</p>
    <p style="font-size:13px;color:var(--dim);margin-bottom:16px">Tu plan: <b>${esc(planTag)}</b> · ${ppw} posts por semana (1 es reel 🎬)${assetPhotos().length ? ` · 🖼️ usamos tus fotos` : ''}${assetLogo() ? ' · con tu logo' : ''}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select id="apCount" style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;color:var(--txt);font-size:15px;padding:12px 14px;font-family:inherit;font-weight:600">
        ${opts}
      </select>
      <button class="btn btn-primary" id="btnAutopilot">⚡ Armar mi semana</button>
    </div>
    <div id="apProg" style="margin-top:16px"></div>
  </div>`;
}

function reviewCardHTML(drafts) {
  return `
  <div class="card" id="reviewCard" style="border:2px solid var(--yel)">
    <h3 style="margin:0 0 6px">📋 Revisá tu semana</h3>
    <p style="color:var(--mut);font-size:14px;line-height:1.6;margin:0 0 16px">Mirá cada posteo, editá el texto si querés y cuando esté lista la programamos. Nada sale sin tu OK.</p>
    ${drafts.map((d, i) => `
    <div class="post-item" style="align-items:flex-start">
      <div style="width:72px;flex-shrink:0">
        ${d.media_type === 'video'
          ? `<video src="${esc(d.image_path)}" muted playsinline preload="metadata" data-lightbox="${esc(d.image_path)}" data-video="1" style="width:72px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line);background:#0A1E33;cursor:zoom-in"></video>`
          : `<img src="${esc(d.image_path)}" data-lightbox="${esc(d.image_path)}" style="width:72px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line);cursor:zoom-in">`}
      </div>
      <div class="info" style="flex:1;min-width:0">
        <div style="margin-bottom:6px"><span class="badge b-draft">Borrador ${i + 1}</span>${d.media_type === 'video' ? ' <span class="badge b-scheduled">🎬 reel</span>' : ''}</div>
        <textarea class="in" data-revcap="${d.id}" rows="3" placeholder="Texto del posteo...">${esc(d.caption || '')}</textarea>
        ${d.hashtags ? `<div class="cap" style="font-size:12px;margin-top:6px">${esc(d.hashtags)}</div>` : ''}
      </div>
      <div class="acts"><button class="btn btn-danger btn-sm" data-revdel="${d.id}" title="Eliminar borrador">🗑️</button></div>
    </div>`).join('')}
    <div style="margin-top:10px">
      <button class="btn btn-primary btn-block" id="btnScheduleWeek">✅ Programar semana</button>
    </div>
    <div id="revMsg"></div>
    <p style="font-size:13px;color:var(--dim);margin:10px 0 0">Se programan a las 19:00, un día cada uno, empezando mañana.</p>
  </div>`;
}

function bindReview() {
  // Tap en la miniatura abre el diseño en grande
  $$('#reviewCard [data-lightbox]').forEach(el => el.onclick = (e) => {
    e.stopPropagation();
    openLightbox(el.dataset.lightbox, el.dataset.video === '1');
  });
  // Guardar el texto al salir del campo (queda en borrador, sin programar)
  $$('[data-revcap]').forEach(ta => ta.addEventListener('change', async () => {
    try { await api.patch('/api/posts/' + ta.dataset.revcap, { action: 'save-draft', caption: ta.value }); }
    catch (e) { /* se reintenta al programar */ }
  }));
  // Eliminar borrador
  $$('[data-revdel]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Eliminar este borrador?')) return;
    try { await api.delete('/api/posts/' + b.dataset.revdel); } catch (e) {}
    render();
  });
  // Programar toda la semana
  const sw = $('#btnScheduleWeek');
  if (sw) sw.onclick = async () => {
    sw.disabled = true;
    const m = $('#revMsg');
    try {
      const tas = $$('[data-revcap]');
      for (let i = 0; i < tas.length; i++) {
        await api.patch('/api/posts/' + tas[i].dataset.revcap, {
          scheduled_at: slotDate(i), caption: tas[i].value,
        });
      }
      location.hash = '#/app/calendario';
    } catch (e) {
      if (m) m.innerHTML = `<div class="err">Error: ${esc(e.message)}</div>`;
      sw.disabled = false;
    }
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
  return `
    <div class="chat-proposal">
      <div style="font-weight:800;margin-bottom:4px">✨ Idea lista: ${esc(CHAT_IDEA.titulo)}</div>
      ${CHAT_IDEA.angulo ? `<div style="font-size:14px;color:var(--mut);margin-bottom:6px">${esc(CHAT_IDEA.angulo)}</div>` : ''}
      <div style="font-weight:700;font-size:14px;margin:10px 0 6px">👇 Así se vería — tocá el que más te guste:</div>
      <div class="chat-previews" id="chatPreviews"><div style="font-size:13px;color:var(--mut)">⏳ Generando ejemplos…</div></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 6px">
        <div style="font-weight:700;font-size:14px">📝 Elegí el texto <span style="font-weight:400;color:var(--mut)">(o retocalo)</span></div>
        <button class="btn btn-soft btn-sm" id="chatMoreCaps" type="button" title="Generar 3 textos nuevos">🔄 Otras</button>
      </div>
      <div class="chat-caps" id="chatCaps"></div>
      <textarea class="in" id="chatCaption" rows="4" placeholder="⏳ Generando texto…" oninput="this.dataset.touched='1'">${esc((CHAT_CAPTION && CHAT_CAPTION.caption) || '')}</textarea>
      <input class="in" id="chatHashtags" placeholder="#hashtags…" oninput="this.dataset.touched='1'" value="${esc((CHAT_CAPTION && CHAT_CAPTION.hashtags) || '')}" style="font-size:13px;margin-top:6px">
      <details class="chat-board">
        <summary>🎬 Ver cómo sería el reel <span style="color:var(--mut);font-weight:400">(3 escenas)</span></summary>
        <div class="chat-board-row" id="chatBoard"><div style="font-size:13px;color:var(--mut)">⏳ Generando…</div></div>
      </details>
      <div class="chat-proposal-btns">
        <button class="btn btn-primary btn-sm" id="chatMkPost">✨ Hacerlo post</button>
        <button class="btn btn-soft btn-sm" id="chatMkReel">🎬 Hacerlo reel</button>
      </div>
      <div style="font-size:12px;color:var(--dim);margin-top:8px">Se crea como borrador y lo revisás antes de programar.</div>
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
    const prev = c.length > 90 ? c.slice(0, 90) + '…' : c;
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
function wrapText(ctx, text, x, y, maxW, lh) {
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
    const title = (idea.titulo || 'NOVEDAD').split(' ').slice(0, 5).join(' ').toUpperCase() || 'NOVEDAD';
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
      wrapText(ctx, tx, cv.width / 2, cv.height - 52, cv.width - 24, 19);
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
    const title = (idea.titulo || 'NOVEDAD').split(' ').slice(0, 5).join(' ').toUpperCase() || 'NOVEDAD';
    const subtitle = (idea.angulo || '').split('.')[0].slice(0, 90);
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
    box.innerHTML = `<div style="font-size:13px;color:var(--mut)">No pudimos generar los ejemplos, pero podés crearlo igual 👇</div>`;
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
    }
    if (r && r.idea && r.idea.titulo) {
      CHAT_IDEA = r.idea;
      chatRenderProposal();
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
    const out = await api.post('/api/generate', { topic: idea.titulo });
    caption = out.caption || '';
    hashtags = out.hashtags || hashtags;
  }
  let imagePath;
  if (prev && prev.kind === 'photo' && prev.path) {
    imagePath = prev.path;
  } else {
    const cv = prev && prev.cv ? prev.cv : prev;
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const res = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo subir la imagen');
    imagePath = data.path;
  }
  try {
    await api.post('/api/posts', { image_path: imagePath, caption, hashtags, media_type: 'image' });
  } catch (e) {
    if (!String(e.message || '').includes('Ya creaste este posteo')) throw e;
  }
}

function chatCardHTML() {
  const msgs = CHAT.map(m => `
    <div class="chat-msg ${m.role === 'user' ? 'u' : 'ai'}">${esc(m.text)}</div>`).join('');
  return `
  <div class="card" id="chatCard">
    <h3 style="margin:0 0 6px">💬 ¿Tenés una idea? Charlemos</h3>
    <p style="color:var(--mut);font-size:14px;line-height:1.6;margin:0 0 12px">Contanos tu idea y te damos nuestra opinión honesta. La pulimos juntos hasta que quede perfecta — recién ahí la convertimos en posteo.</p>
    <div class="chat-box" id="chatBox">
      ${msgs || `<div class="chat-msg ai">👋 ¡Hola! Soy tu consultor de contenido. Contame qué idea tenés para tu Instagram y te digo la posta: si va a vender, qué le cambiaría y cómo la haría. ¿Qué tenés en mente?</div>`}
    </div>
    <div id="chatProposal">${proposalHTML()}</div>
    <div id="chatPhotos" class="chat-photos"></div>
    <div class="chat-input-row">
      <button class="btn btn-soft" id="chatAttach" title="Agregar foto">📷</button>
      <input id="chatInput" class="in" placeholder="Ej: quiero un post sobre mis nuevos buzos…" maxlength="2000" autocomplete="off">
      <button class="btn btn-primary" id="chatSend" title="Enviar">➤</button>
      <input type="file" id="chatFile" accept="image/*" multiple hidden>
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

function renderChatPhotos() {
  const box = $('#chatPhotos');
  if (!box) return;
  box.innerHTML = CHAT_PHOTOS.map((p, i) => `
    <div class="chat-photo">
      <img src="${esc(p.file_path)}">
      <button data-chatrm="${i}" title="Quitar foto">✕</button>
    </div>`).join('');
  box.querySelectorAll('[data-chatrm]').forEach(b => b.onclick = () => {
    CHAT_PHOTOS.splice(+b.dataset.chatrm, 1);
    if (CHAT_PHOTO_IDX >= CHAT_PHOTOS.length) CHAT_PHOTO_IDX = 0;
    renderChatPhotos();
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

async function chatUploadPhotos(files) {
  const m = $('#chatMsg');
  const imgs = [...(files || [])].filter(f => f.type && f.type.startsWith('image/')).slice(0, 4);
  if (!imgs.length) return;
  try {
    if (m) m.innerHTML = `<div class="okmsg">⏳ Subiendo ${imgs.length > 1 ? imgs.length + ' fotos' : 'foto'}…</div>`;
    for (const f of imgs) {
      const res = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': f.type || 'image/jpeg' }, body: f });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo subir la foto');
      const aiUrl = await fileToThumb(f);
      CHAT_PHOTOS.push({ file_path: data.path, aiUrl, sent: false });
    }
    if (m) m.innerHTML = '';
    renderChatPhotos();
    if (CHAT_IDEA) {
      CHAT_PHOTO_IDX = CHAT_PHOTOS.length - 1;
      renderChatPreviews();
      renderChatStoryboard();
      chatSay('📷 ¡Foto agregada! Actualicé los ejemplos con tu foto 👇');
    } else {
      chatSay('📷 ¡Foto agregada! La voy a usar en los ejemplos y la IA también la puede ver 👇');
    }
  } catch (e) {
    if (m) m.innerHTML = `<div class="err">${esc(e.message || 'No se pudo subir')}</div>`;
  }
}

// Estilos disponibles para los ejemplos (se rotan con "otro estilo")
function chatStyles() {
  const p = defaultPal();
  const n = (typeof getPalettes === 'function' ? getPalettes().length : 5) || 5;
  return [['gradiente', p], ['claro', (p + 1) % n], ['noche', (p + 2) % n], ['promo', (p + 3) % n]];
}

// Comandos de edición por chat cuando la idea ya está cerrada.
// Devuelve true si el mensaje era un pedido de edición y lo aplicó.
function chatEditCommand(text) {
  if (!CHAT_IDEA) return false;
  const t = text.trim();
  let m;
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
  if (mkP) mkP.onclick = () => chatMakePost(false);
  if (mkR) mkR.onclick = () => chatMakePost(true);
  const mCaps0 = $('#chatMoreCaps');
  if (mCaps0) mCaps0.onclick = chatMoreCaptions;
  renderChatPreviews();
  renderChatStoryboard();
  chatScroll();
}

async function chatSend() {
  const inp = $('#chatInput');
  const text = (inp.value || '').trim();
  if (!text) return;
  const box = $('#chatBox'), m = $('#chatMsg'), btn = $('#chatSend');
  CHAT.push({ role: 'user', text });
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg u">${esc(text)}</div>`);
  inp.value = '';
  btn.disabled = true;
  // Si la idea está cerrada y el mensaje es un pedido de edición, se aplica directo
  if (CHAT_IDEA && chatEditCommand(text)) {
    btn.disabled = false;
    try { api.post('/api/ideas/chat/log', { messages: [{ role: 'user', text }] }).catch(() => {}); } catch (e) {}
    return;
  }
  CHAT_IDEA = null; CHAT_PREVIEWS = []; CHAT_PREV_SEL = 0; chatRenderProposal();
  box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai" id="chatTyping">⏳ …</div>`);
  chatScroll();
  // Fotos subidas en el chat que la IA todavía no vio → se las mandamos con este mensaje
  const unsentPhotos = CHAT_PHOTOS.filter(p => p.aiUrl && !p.sent).map(p => p.aiUrl);
  try {
    const r = await api.post('/api/ideas/chat', { messages: CHAT, photos: unsentPhotos });
    const t = $('#chatTyping'); if (t) t.remove();
    CHAT_PHOTOS.forEach(p => { if (p.aiUrl && unsentPhotos.includes(p.aiUrl)) p.sent = true; });
    CHAT.push({ role: 'assistant', text: r.reply || '…' });
    box.insertAdjacentHTML('beforeend', `<div class="chat-msg ai">${esc(r.reply || '…')}</div>`);
    if (r.idea) { CHAT_IDEA = r.idea; CHAT_CAPTION = null; CHAT_CAPTIONS = []; CHAT_CAP_SEL = 0; chatRenderProposal(); refreshChatCaption(); }
  } catch (e) {
    const t = $('#chatTyping'); if (t) t.remove();
    if (m) m.innerHTML = `<div class="err">${esc(e.message || 'No pudimos responder')}</div>`;
  }
  btn.disabled = false;
  chatScroll();
}

async function chatMakePost(asVideo) {
  const idea = CHAT_IDEA;
  if (!idea) return;
  const m = $('#chatMsg');
  const mkP = $('#chatMkPost'), mkR = $('#chatMkReel');
  if (mkP) mkP.disabled = true;
  if (mkR) mkR.disabled = true;
  try {
    if (m) m.innerHTML = `<div class="okmsg">⏳ Creando tu ${asVideo ? 'reel' : 'post'}…</div>`;
    if (!asVideo && CHAT_PREVIEWS.length) {
      await draftFromPreview(idea, CHAT_PREVIEWS[CHAT_PREV_SEL] || CHAT_PREVIEWS[0]);
    } else {
      await draftFromIdea(idea, asVideo, 0, true);
    }
    CHAT_IDEA = null;
    CHAT_PREVIEWS = []; CHAT_PREV_SEL = 0;
    CHAT_PHOTOS = []; CHAT_PHOTO_IDX = 0; CHAT_STYLE_IDX = 0;
    CHAT_CAPTION = null; CHAT_CAPTIONS = []; CHAT_CAP_SEL = 0;
    const doneText = '¡Listo! Te lo dejé en revisión acá arriba 👆 Nada se programa hasta que vos lo apruebes.';
    try { api.post('/api/ideas/chat/log', { clearIdea: true, messages: [{ role: 'assistant', text: doneText }] }).catch(() => {}); } catch (e) {}
    CHAT.push({ role: 'assistant', text: doneText });
    render();
    setTimeout(() => { const rc = $('#reviewCard'); if (rc) rc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
  } catch (e) {
    if (m) m.innerHTML = `<div class="err">Error: ${esc(e.message)}</div>`;
    if (mkP) mkP.disabled = false;
    if (mkR) mkR.disabled = false;
  }
}

function bindChat() {
  const btn = $('#chatSend'), inp = $('#chatInput');
  if (!btn || !inp) return;
  btn.onclick = chatSend;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chatSend(); } });
  chatScroll();
  const mkP = $('#chatMkPost'), mkR = $('#chatMkReel');
  if (mkP) mkP.onclick = () => chatMakePost(false);
  if (mkR) mkR.onclick = () => chatMakePost(true);
  const mCapsB = $('#chatMoreCaps');
  if (mCapsB) mCapsB.onclick = chatMoreCaptions;
  const att = $('#chatAttach'), file = $('#chatFile');
  if (att && file) {
    att.onclick = () => file.click();
    file.onchange = () => { chatUploadPhotos(file.files); file.value = ''; };
  }
  renderChatPhotos();
  renderChatPreviews();
  renderChatStoryboard();
  if (!CHAT_LOADED) { CHAT_LOADED = true; chatLoadHistory(); }
}

async function ideasView() {
  let posts = [];
  try { posts = await api.get('/api/posts'); } catch (e) { posts = []; }
  const ppw = (ME && ME.posts_per_week) || 3;
  const drafts = posts.filter(p => p.status === 'draft').sort((a, b) => a.id - b.id);
  return `<div class="page-head"><div class="ph-ico">💡</div><div class="ph-txt"><h1>Ideas</h1><p class="sub">Nosotros pensamos el contenido por vos.</p></div></div>
  ${checklistHTML(posts.length)}
  ${recCardHTML(IDEAS, posts, ppw)}
  ${autopilotCardHTML()}
  ${drafts.length ? reviewCardHTML(drafts) : ''}
  ${chatCardHTML()}
  <div id="ideasZone">${IDEAS.length ? ideasList() : `
    <div class="empty"><div class="big">💡</div>
      Todavía no generamos ideas para tu negocio.<br>
      <span style="font-size:14px">Usá "✨ Generar ideas" o "⚡ Armar mi semana" acá arriba 👆</span>
    </div>`}
  </div>
  <div id="ideasMsg"></div>`;
}

function ideasList() {
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
// El último post de la semana del autopilot es un reel: 3 escenas con fotos
// del cliente (o diseños generados si no tiene) + textos de la idea.
async function autopilotReel(idea, photos, logoImg, palIdx, handle, idx) {
  const title = (idea.titulo || 'NOVEDAD').toUpperCase();
  const angle = (idea.angulo || '').split('.')[0].slice(0, 90);
  const usePhotos = photos.length > 0;
  const sceneImg = async (text, k) => {
    if (usePhotos) return { image_path: photos[(idx + k) % photos.length].file_path, text, duration: 3 };
    // Sin fotos: generamos el diseño y lo usamos como escena (ya trae texto, no duplicamos)
    const image_path = await renderDesignImage({
      tpl: 'gradiente', pal: palIdx,
      title: text.split(' ').slice(0, 5).join(' ').toUpperCase() || 'NOVEDAD',
      subtitle: angle, handle, photoImg: null, logoImg,
    });
    return { image_path, text: '', duration: 3 };
  };
  const scenes = [
    await sceneImg(title, 0),
    await sceneImg(angle || title, 1),
    await sceneImg(handle ? '@' + handle : 'SEGUINOS 👇', 2),
  ];
  const r = await api.post('/api/videos', { scenes });
  return r.url;
}

// Crea UN borrador a partir de una idea (texto + diseño o reel).
// Lo usan el autopilot y el chat consultor. Nada se programa: todo va a revisión.
async function draftFromIdea(idea, asVideo, idx = 0, useChatText = false) {
  const photos = assetPhotos();
  const logo = assetLogo() ? await photoImg(assetLogo().file_path) : null;
  const palIdx = defaultPal();
  const handle = (PROFILE || {}).ig_username || '';
  const out = await api.post('/api/generate', { topic: idea.titulo });
  // Si viene del chat, se respeta el texto que el cliente eligió/editó (no se regenera)
  const chatTa = useChatText ? $('#chatCaption') : null;
  const chatHg = useChatText ? $('#chatHashtags') : null;
  const caption = (chatTa && chatTa.value.trim()) || out.caption || '';
  const hashtags = (chatHg && chatHg.value.trim()) || out.hashtags || '';
  let imagePath = null, mediaType = 'image';
  if (asVideo) {
    try {
      imagePath = await autopilotReel(idea, photos, logo, palIdx, handle, idx);
      mediaType = 'video';
    } catch (e) { imagePath = null; /* fallback a diseño estático */ }
  }
  if (!imagePath) {
    const title = (idea.titulo || 'NOVEDAD').split(' ').slice(0, 5).join(' ').toUpperCase() || 'NOVEDAD';
    const ph = photos.length ? photos[idx % photos.length] : null;
    imagePath = await renderDesignImage({
      tpl: 'gradiente', pal: palIdx,
      title, subtitle: (idea.angulo || '').split('.')[0].slice(0, 90),
      handle,
      photoImg: ph ? await photoImg(ph.file_path) : null,
      logoImg: logo,
    });
  }
  try {
    await api.post('/api/posts', { image_path: imagePath, caption, hashtags, media_type: mediaType });
  } catch (e) {
    if (!String(e.message || '').includes('Ya creaste este posteo')) throw e;
  }
}

async function runAutopilot(n) {
  const prog = $('#apProg');
  const btn = $('#btnAutopilot');
  btn.disabled = true;
  try {
    // Si hay borradores sin revisar de una corrida anterior, preguntar antes de reemplazarlos
    const existing = await api.get('/api/posts');
    const oldDrafts = existing.filter(p => p.status === 'draft');
    if (oldDrafts.length) {
      const ok = confirm(`Tenés ${oldDrafts.length} ${oldDrafts.length === 1 ? 'borrador sin revisar' : 'borradores sin revisar'}. ¿Los reemplazo por una semana nueva?`);
      if (!ok) { btn.disabled = false; return; }
      for (const d of oldDrafts) { try { await api.delete('/api/posts/' + d.id); } catch (e) {} }
    }
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
    for (let i = 0; i < picks.length; i++) {
      const idea = picks[i];
      const isReel = i === picks.length - 1; // el último post de la semana es un reel 🎬
      prog.innerHTML = `<div class="okmsg">⏳ Creando ${isReel ? 'reel' : 'post'} ${i + 1} de ${picks.length}: <b>${esc(idea.titulo)}</b>${isReel ? ' (puede tardar 1-2 min)' : ''}...</div>`;
      await draftFromIdea(idea, isReel, i); // borrador: el cliente revisa antes de programar
    }
    prog.innerHTML = `<div class="okmsg">📋 ¡Tu semana está lista! Revisala acá abajo 👇</div>`;
    setTimeout(() => {
      render();
      setTimeout(() => { const rc = $('#reviewCard'); if (rc) rc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    }, 900);
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
  bindReview();
  bindChat();
}

/* ---------- VIDEO 🎬 ---------- */
function vTotalHTML() {
  const total = VSTATE.scenes.reduce((a, s) => a + (+s.duration || 0), 0);
  const over = total > 60;
  return `⏱️ Duración total: <b style="color:${over ? 'var(--red-d)' : 'var(--txt)'}">${total}s</b> / 60s máx`;
}

function videoView() {
  const v = VSTATE;
  const photos = assetPhotos();
  return `<div class="page-head"><div class="ph-ico">🎬</div><div class="ph-txt"><h1>Video</h1><p class="sub">Convertí tus fotos en un video vertical (1080×1920) para Reels y TikTok. Hasta 5 escenas, 60 segundos en total.</p></div></div>
  ${!photos.length ? `<div class="card tip-card"><p style="color:var(--mut);font-size:15px;margin:0">💡 Tip: subí tus fotos en <a href="#/app/fotos" style="color:var(--cel);font-weight:700">Mis fotos</a> y las tenés siempre a mano para tus videos.</p></div>` : ''}
  <div class="card"><h3>Escenas (${v.scenes.length}/5)</h3>
    ${v.scenes.map((s, i) => `
    <div class="post-item" style="align-items:flex-start;gap:14px">
      <div style="width:72px;flex-shrink:0">
        ${s.image_path ? `
        <div class="vprev">
          <img src="${esc(s.image_path)}" alt="">
          <div class="vprev-txt" data-vprevtxt="${i}" style="${s.text ? '' : 'display:none'}">${esc(s.text)}</div>
        </div>` : `<div class="vprev vprev-empty">🖼️</div>`}
      </div>
      <div class="info" style="flex:1">
        <div class="scene-n">Escena ${i + 1}</div>
        <div class="field" style="margin-bottom:8px"><label>Texto en pantalla</label><input data-vtext="${i}" value="${esc(s.text)}" placeholder="Ej: Nuevo ingreso 🔥" maxlength="140"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <div class="field" style="margin:0;width:110px"><label>Duración (seg)</label><input type="number" data-vdur="${i}" min="1" max="30" value="${s.duration}"></div>
          <button class="btn btn-ghost btn-sm" data-vup="${i}">📤 Subir</button>
          ${photos.length ? `<button class="btn btn-ghost btn-sm" data-vlib="${i}">🖼️ Mis fotos</button>` : ''}
          ${i > 0 ? `<button class="btn btn-ghost btn-sm" data-vmove="${i}" data-vdir="-1" title="Subir escena">↑</button>` : ''}
          ${i < v.scenes.length - 1 ? `<button class="btn btn-ghost btn-sm" data-vmove="${i}" data-vdir="1" title="Bajar escena">↓</button>` : ''}
          ${v.scenes.length > 1 ? `<button class="btn btn-danger btn-sm" data-vrm="${i}">Quitar</button>` : ''}
        </div>
        <div data-vpicker="${i}" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${photos.map(a => `<img src="${a.file_path}" data-vpick="${i}:${a.file_path}" style="width:56px;height:80px;object-fit:cover;border-radius:8px;border:2px solid var(--line);cursor:pointer">`).join('')}
        </div>
      </div>
    </div>`).join('')}
    ${v.scenes.length < 5 ? `<button class="btn btn-ghost" id="btnVAdd">＋ Agregar escena</button>` : ''}
    <div id="vTotal" class="hint" style="margin:12px 0 0">${vTotalHTML()}</div>
    <input type="file" id="v_file" accept="image/*" style="display:none">
  </div>
  <div class="card"><h3>🎵 Música (opcional)</h3>
    ${v.music_path ? `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span style="font-size:14px;color:var(--mut)">🎵 ${esc(v.music_path.split('/').pop())}</span>
        <audio src="${esc(v.music_path)}" controls style="height:36px;max-width:220px"></audio>
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
        <div class="field"><label>Fecha y hora de publicación</label><input type="datetime-local" id="v_when" value="${isoToLocalInput(slotDate19(0, (SETTINGS && SETTINGS.timezone) || 'America/Argentina/Buenos_Aires'))}"></div>
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
    const btn = document.querySelector(`[data-vup="${vfileIdx}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Subiendo…'; }
    try {
      const p = await uploadAssetFile(f, 'photo');
      v.scenes[vfileIdx].image_path = p;
      rerender();
    } catch (e) { alert('Error: ' + e.message); if (btn) { btn.disabled = false; btn.innerHTML = '📤 Subir'; } }
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
  $$('[data-vtext]').forEach(inp => inp.oninput = () => {
    const i = +inp.dataset.vtext;
    v.scenes[i].text = inp.value;
    const pt = document.querySelector(`[data-vprevtxt="${i}"]`);
    if (pt) { pt.textContent = inp.value; pt.style.display = inp.value ? '' : 'none'; }
  });
  $$('[data-vdur]').forEach(inp => inp.onchange = () => {
    v.scenes[+inp.dataset.vdur].duration = Math.min(30, Math.max(1, Math.round(+inp.value || 3)));
    inp.value = v.scenes[+inp.dataset.vdur].duration;
    const t = $('#vTotal');
    if (t) t.innerHTML = vTotalHTML();
  });
  $$('[data-vrm]').forEach(b => b.onclick = () => { v.scenes.splice(+b.dataset.vrm, 1); rerender(); });
  // Mover escena ↑ ↓
  $$('[data-vmove]').forEach(b => b.onclick = () => {
    const i = +b.dataset.vmove, j = i + (+b.dataset.vdir);
    if (j < 0 || j >= v.scenes.length) return;
    const [s] = v.scenes.splice(i, 1);
    v.scenes.splice(j, 0, s);
    rerender();
  });
  $$('[data-vcap]').forEach(inp => inp.oninput = () => { v.caption = inp.value; });
  const bAdd = $('#btnVAdd');
  if (bAdd) bAdd.onclick = () => { v.scenes.push({ image_path: '', text: '', duration: 3 }); rerender(); };
  // Música
  const bma = $('#btnVMusicAdd');
  if (bma) bma.onclick = () => $('#v_music').click();
  const vm = $('#v_music');
  if (vm) vm.onchange = async () => {
    const f = vm.files[0]; if (!f) return;
    if (bma) { bma.disabled = true; bma.textContent = '⏳ Subiendo…'; }
    try {
      const r = await fetch('/api/audio', { method: 'POST', headers: { 'Content-Type': 'audio/mpeg' }, body: f });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      v.music_path = data.path;
      rerender();
    } catch (e) { alert('Error: ' + e.message); if (bma) { bma.disabled = false; bma.innerHTML = '📤 Subir MP3'; } }
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
    v.result_url = '';
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
        <img src="${a.file_path}" data-lightbox="${a.file_path}" style="width:120px;height:150px;object-fit:cover;border-radius:12px;border:1px solid var(--line);cursor:zoom-in">
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
    const total = files.length;
    for (let i = 0; i < total; i++) {
      if (total > 1) $('#aMsg').innerHTML = `<div class="hint" style="margin:0">⏳ Subiendo ${i + 1} de ${total}…</div>`;
      try { await uploadAssetFile(files[i], kind); }
      catch (e) { msg('Error: ' + esc(e.message), false); return; }
    }
    $('#aMsg').innerHTML = '';
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
  // Tap en una foto → verla en grande
  $$('[data-lightbox]').forEach(el => el.onclick = () => openLightbox(el.dataset.lightbox, el.dataset.video === '1'));
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
  const vtag = p.media_type === 'video' ? `<span class="badge b-scheduled">🎬 video</span>` : '';
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
async function publishNowFlow(postId, mount) {
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
      mount.innerHTML = `<div class="okmsg">✅ ¡Publicado en Instagram! ${st.ig_permalink ? `<a href="${esc(st.ig_permalink)}" target="_blank" style="color:#2793C8">Ver en IG ↗</a>` : ''}</div>`;
      return { ok: true, permalink: st.ig_permalink };
    }
    if (st.status === 'failed' || st.status === 'cancelled') {
      paint(1, false, st.error || 'Se canceló la publicación.');
      return { ok: false };
    }
    paint(Date.now() - t0 > 9000 ? 1 : 0, false);
  }
  mount.innerHTML = `<div class="okmsg">⏳ Sigue publicándose… lo ves en el historial en un minuto.</div>`;
  return { ok: true, pending: true };
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
  const head = `<div class="page-head"><div class="ph-ico">🏠</div><div class="ph-txt"><h1>Mi semana</h1><p class="sub">Tu semana, armada con un clic.</p></div></div>`;
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
  const head = `<div class="page-head"><div class="ph-ico">📅</div><div class="ph-txt"><h1>Calendario</h1><p class="sub">Tus próximos posts. Se publican solos a la hora indicada.</p></div></div>`;
  if (!all.length) return head + `<div class="empty"><div class="big">📭</div>No tenés posts programados.<br><br><a class="btn btn-primary" href="#/app/ideas">⚡ Armar mi semana</a><div style="margin-top:12px"><a href="#/app/crear" class="mut" style="font-size:14px">o crear un post suelto →</a></div></div>`;
  const nextLine = posts.length ? `<p class="cal-next">📍 Próximo posteo: <b>${relDay(posts[0].scheduled_at)}</b> — sale solo, no tenés que hacer nada.</p>` : '';
  const draftNudge = drafts.length ? `<p class="cal-draft-nudge">✏️ Tenés ${drafts.length === 1 ? '1 borrador' : `${drafts.length} borradores`} sin fecha — poneles día y hora abajo para que salgan solos.</p>` : '';
  return head + nextLine + draftNudge
  + all.map(p => postItem(p, `
      ${sigBtns(p)}
      ${p.status === 'scheduled' ? `<button class="btn btn-soft btn-sm" data-act="now" data-id="${p.id}">Publicar ahora</button>` : ''}
      ${p.status === 'draft' ? `<span class="sched-row"><input type="datetime-local" id="sched-${p.id}"><button class="btn btn-soft btn-sm" data-act="sched" data-id="${p.id}">📅 Programar</button></span>` : ''}
      <button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${p.id}">Cancelar</button>
    `)).join('');
}
async function historyView() {
  const posts = await api.get('/api/posts');
  const done = posts.filter(p => ['published', 'failed', 'cancelled'].includes(p.status));
  const d = new Date(), mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const inMk = (p) => (p.published_at || p.scheduled_at || p.created_at || '').slice(0, 7) === mk;
  const mp = done.filter(p => p.status === 'published' && inMk(p)).length;
  const mf = done.filter(p => p.status === 'failed' && inMk(p)).length;
  const summary = (mp || mf)
    ? `<p class="hist-sum">📊 Este mes: <b>${mp}</b> publicado${mp === 1 ? '' : 's'}${mf ? ` · <b>${mf}</b> fallaron` : ''}</p>` : '';
  return `<div class="page-head"><div class="ph-ico">📊</div><div class="ph-txt"><h1>Historial</h1><p class="sub">Todo lo que ya pasó por Posta. Marcá 👍/👎 y aprendemos lo que te gusta.</p></div></div>
  ${summary}
  ${done.length ? done.map(p => postItem(p, `${p.status === 'published' ? sigBtns(p) : ''}${p.status === 'failed' ? `<button class="btn btn-soft btn-sm" data-act="now" data-id="${p.id}">Reintentar</button>` : ''}${p.status === 'published' ? `<button class="btn btn-ghost btn-sm" data-act="dup" data-id="${p.id}">Duplicar</button>` : ''}<button class="btn btn-ghost btn-sm" data-act="del" data-id="${p.id}" title="Borrar del historial">🗑️</button>`)).join('')
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
  <p style="color:var(--mut);font-size:14px;margin:-6px 0 14px">🤖 La IA usa estos datos para crear tus ideas y posteos: cuanto más completos, mejores resultados.</p>
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
      <div class="field"><label>Zona horaria <span style="color:var(--dim);font-weight:400">(para programar a las 19:00 de tu país)</span></label><select id="s_tz">
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
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnSaveProfile">Guardar</button> <span id="profMsg"></span>
      <span id="profDirty" style="display:none;color:var(--yel);font-size:13px;font-weight:700">● Tenés cambios sin guardar</span>
      <button class="btn btn-ghost btn-sm" id="btnOnb">🧭 Retomar guía inicial</button>
      <button class="btn btn-ghost btn-sm" id="btnPreview">👁 Vista previa</button>
    </div>
  </div>
  <div class="card"><h3>🎨 Mi marca</h3>
    <p style="color:var(--mut);font-size:14px;margin-bottom:16px">Tus fotos están en <a href="#/app/fotos" style="color:var(--cel);font-weight:700">Mis fotos</a>. Acá definís tu logo y tus colores: todo lo que generemos sale con tu identidad.</p>
    <div class="row2">
      <div class="field"><label>Logo</label>
        <div style="display:flex;gap:10px;align-items:center">
          ${assetLogo() ? `<img src="${assetLogo().file_path}" style="max-height:48px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px">` : '<span style="color:var(--dim);font-size:14px">Sin logo</span>'}
          <button class="btn btn-ghost btn-sm" id="btnBrandLogo">📤 ${assetLogo() ? 'Cambiar' : 'Subir'}</button>
          ${assetLogo() ? '<button class="btn btn-ghost btn-sm" id="btnBrandLogoDel">🗑️ Quitar</button>' : ''}
        </div>
        <input type="file" id="s_logofile" accept="image/*" style="display:none">
      </div>
    </div>
    <div class="field"><label>Colores de tu marca <span style="color:var(--dim);font-weight:400">(con 2 alcanza para activar "Mi marca")</span></label>
      <div style="display:flex;gap:10px">
        ${[0, 1, 2].map(i => `<input type="color" id="s_c${i}" value="${bc[i] || NEUTRAL_TRIO[i]}" style="width:56px;height:44px;border:1px solid var(--line);border-radius:12px;padding:4px;background:#fff;cursor:pointer">`).join('')}
      </div>
      <div class="hint">Subí tu logo y detectamos tus colores automáticamente, o elegilos a mano.</div>
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
      <span id="brandDirty" style="display:none;color:var(--yel);font-size:13px;font-weight:700">● Tenés cambios sin guardar</span>
    </div>
  </div>
  <div class="card"><h3>📸 Instagram</h3>
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
      <div style="font-weight:800;margin-bottom:10px">📲 Hacé tu cuenta profesional <span style="font-weight:400;color:var(--dim);font-size:13px">(gratis, 30 segundos)</span></div>
      <ol style="margin:0 0 12px 20px;padding:0;font-size:14px;color:var(--mut);line-height:1.8">
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
  </div>
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
      <div class="field" style="margin-top:10px"><button class="btn btn-ghost" id="btnTestMeta" type="button">Probar conexión</button> <span id="metaTestMsg" style="font-size:13px"></span></div>
      <div class="field"><label>Instagram Embed URL</label>
        <input id="s_igembed" value="${esc(s.ig_embed_url)}" placeholder="https://www.instagram.com/oauth/authorize?...">
        <p class="hint">La dirección que Meta genera para conectar tu Instagram. Se copia del dashboard de Meta: caso de uso Instagram → "API setup with Instagram login".</p></div>
    </div>
    <button class="btn btn-primary" id="btnSaveSettings">Guardar</button> <span id="setMsg"></span>
  </details>`;
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
    step: 1,
    business_name: (PROFILE && PROFILE.business_name) || '',
    category: (PROFILE && PROFILE.category) || 'ropa',
    description: (PROFILE && PROFILE.description) || '',
    competitors: (PROFILE && PROFILE.competitors) || '',
    goal: (PROFILE && PROFILE.goal) || '',
    c1: '#8B95A1', c2: '#C3CAD2', c3: '#4A5560',
    useBrand: false,
  };
}
const GOALS = [
  ['vender', '💰', 'Vender más', 'Que cada post traiga clientes y ventas'],
  ['seguidores', '📈', 'Más seguidores', 'Crecer la comunidad y el alcance'],
  ['lanzamiento', '🚀', 'Lanzamientos', 'Anunciar novedades y promos con fuerza'],
  ['fidelizar', '🤝', 'Fidelizar clientes', 'Que te vuelvan a elegir, siempre'],
  ['referente', '🎓', 'Ser referente', 'Posicionarte como experto en tu rubro'],
];
function onboardingView() {
  const o = OB;
  const stepsBar = `<div class="steps-bar">${[1, 2, 3, 4].map(i => `<div class="s ${i <= o.step ? 'on' : ''}"></div>`).join('')}</div>`;
  let body = '';
  if (o.step === 1) body = `
    <h3>Tu negocio 🏪</h3>
    <div class="field"><label>Nombre del negocio</label><input id="ob_biz" value="${esc(o.business_name)}" placeholder="Mi Tienda"></div>
    <div class="field"><label>Rubro</label><select id="ob_cat">
      ${CATS.map(([v, ico, t]) => `<option ${catSel(o.category) === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
    </select></div>
    <div class="field" id="ob_catother_w" style="${catSel(o.category) === 'otro' ? '' : 'display:none'}"><label>¿Cuál?</label><input id="ob_catother" value="${esc(catCustom(o.category))}" placeholder="Ej: veterinaria, librería..." maxlength="40"></div>
    <div class="field"><label>Contanos en una frase qué hacés</label><textarea id="ob_desc" maxlength="600" placeholder="Vendemos ropa urbana para jóvenes en Palermo...">${esc(o.description)}</textarea></div>`;
  if (o.step === 2) body = `
    <h3>Tus competidores 🔍</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:18px">Los estudiamos para crear contenido que te haga <b>destacar</b>, no copiar.</p>
    <div class="field"><label>Nombres o usuarios de Instagram, separados por coma</label><input id="ob_comp" value="${esc(o.competitors)}" placeholder="tiendaX, @competidor2"></div>
    <div class="hint">Si no tenés a mano, saltealo y lo agregás después en Ajustes.</div>`;
  if (o.step === 3) {
    body = `
    <h3>Tu estilo 🎨</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:18px">Tu logo y tus colores: todo lo que generemos sale con tu marca, no con la nuestra.</p>
    <div class="field"><label>Logo de tu marca *</label>
      <div style="display:flex;gap:10px;align-items:center">
        ${assetLogo() ? `<img src="${assetLogo().file_path}" style="max-height:56px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px">` : ''}
        <button class="btn btn-ghost btn-sm" id="ob_logo">📤 ${assetLogo() ? 'Cambiar logo' : 'Subir logo'}</button>
      </div>
      <input type="file" id="ob_logofile" accept="image/*" style="display:none">
      <div class="hint">Al subirlo sacamos tus colores automáticamente. Sin logo no podemos seguir.</div>
    </div>
    <div class="field"><label>Tus colores *</label>
      <div style="display:flex;gap:10px">
        ${['c1', 'c2', 'c3'].map(k => `<input type="color" id="ob_${k}" value="${o[k]}" style="width:56px;height:44px;border:1px solid var(--line);border-radius:12px;padding:4px;background:#fff;cursor:pointer">`).join('')}
      </div>
      <div class="hint">Salen de tu logo solos. Tocá cada uno si querés ajustarlo a mano.</div>
    </div>
    <div class="hint" style="margin-top:4px">🎨 Todo lo que generemos va a usar estos colores: son la identidad de tu marca.</div>`;
  }
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
      const obCatOther = $('#ob_catother').value.trim();
      o.category = ($('#ob_cat').value === 'otro' && obCatOther) ? obCatOther.toLowerCase() : $('#ob_cat').value;
      o.description = $('#ob_desc').value.trim();
      if (!o.business_name) { $('#obMsg').innerHTML = `<div class="err">Poné el nombre de tu negocio</div>`; return; }
    }
    if (o.step === 2) o.competitors = $('#ob_comp').value.trim();
    if (o.step === 3) {
      o.c1 = $('#ob_c1').value; o.c2 = $('#ob_c2').value; o.c3 = $('#ob_c3').value;
      if (!assetLogo()) { $('#obMsg').innerHTML = `<div class="err">Subí el logo de tu marca para continuar 🙂</div>`; return; }
    }
    o.step++; render();
  };
  const obCat = $('#ob_cat');
  if (obCat) obCat.onchange = () => { $('#ob_catother_w').style.display = obCat.value === 'otro' ? '' : 'none'; };
  $$('[data-goal]').forEach(b => b.onclick = () => { o.goal = b.dataset.goal; render(); });
  const bl = $('#ob_logo');
  if (bl) bl.onclick = () => $('#ob_logofile').click();
  const lf = $('#ob_logofile');
  if (lf) lf.onchange = async () => {
    if (!lf.files[0]) return;
    try {
      await uploadAssetFile(lf.files[0], 'logo');
      try {
        const img = await loadImageFile(lf.files[0]);
        const cols = extractTopColors(img, 3);
        if (cols[0]) o.c1 = cols[0];
        if (cols[1]) o.c2 = cols[1];
        if (cols[2]) o.c3 = cols[2];
      } catch (e) { /* mantiene los colores actuales */ }
      render();
    }
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
      <div style="font-size:42px">\U0001F512</div>
      <h2>Tu prueba gratis termin\u00f3</h2>
      <p class="pz-exp-sub">Tus posteos se frenaron. Eleg\u00ed tu plan para seguir publicando con tu marca.</p>
      <div class="pz-exp-plans">${rows}</div>
      ${plans.length ? '' : '<button class="btn btn-primary btn-block" id="pzExpGo">Ver planes \U0001F680</button>'}
      <p class="pz-exp-guar">\U0001F6E1\uFE0F Si no est\u00e1s conforme, te devolvemos el 100% de tu primer pago.</p>
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
      if (act === 'del') {
        if (!confirm('¿Borrar este posteo del historial?')) return;
        await api.delete(`/api/posts/${id}`);
        render(); return;
      }
      if (act === 'dup') {
        await api.post(`/api/posts/${id}/duplicate`, {});
        location.hash = '#/app/calendario'; return;
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
    // Tap en el caption expande/colapsa el texto completo (historial y calendario)
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
    const resetCreator = () => {
      CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '', options: null, detected: null, recommendedIndex: 0, recommendedReason: '', feedback: '', productPhoto: '', selected: [], cardPhoto: {} };
    };
    const done = (msg) => {
      $('#pubMsg').innerHTML = `<div class="okmsg">${msg}</div>`;
      resetCreator();
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
      const btn = $('#btnNow');
      btn.disabled = true; // bloquea el doble tap
      try {
        const { id } = await api.post('/api/posts', { image_path: c.imagePath, caption: c.caption, hashtags: c.hashtags });
        $('#pubMsg').innerHTML = '<div class="pubnow-mount"></div>';
        const r = await publishNowFlow(id, $('#pubMsg .pubnow-mount'));
        if (r && r.ok && r.permalink) {
          // publishNowFlow ya mostró "¡Publicado! Ver en IG ↗"
          resetCreator();
          setTimeout(() => location.hash = '#/app/calendario', 8000);
        } else if (r && r.ok) {
          done('⏳ Se está publicando… lo ves en el historial en un minuto.');
        }
        // si falló, publishNowFlow ya mostró el error con botón Reintentar
      } catch (e) { $('#pubMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; btn.disabled = false; }
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
    $('#profMsg').innerHTML = '<span style="color:var(--cel);font-size:14px">✅ Guardado</span>';
    profDirty = false; if (dirtyEl) dirtyEl.style.display = 'none';
    PROFILE = await api.get('/api/profile');
    SETTINGS = await api.get('/api/settings');
  };
  const bOnb = $('#btnOnb');
  if (bOnb) bOnb.onclick = () => { OB = freshOB(); location.hash = '#/app/onboarding'; };
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
        <p style="color:var(--mut);font-size:13px;margin:0 0 8px">Con estos datos creamos tus ideas y posteos:</p>
        ${row('🏪', 'Negocio', esc(biz) || '<span class="pv-warn">Falta el nombre</span>')}
        ${row('📸', 'Instagram', igu ? '@' + esc(igu) : '<span class="pv-warn">Sin usuario</span>')}
        ${row(catE[1], 'Rubro', esc(catTxt))}
        ${row(toneE[1], 'Tono de la IA', esc(toneE[2]))}
        ${row(goalE[1], 'Objetivo', esc(goalE[2]) + (goalE[3] ? `<br><span style="font-weight:400;color:var(--mut);font-size:13px">${esc(goalE[3])}</span>` : ''))}
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
      const statusTag = !hasActive ? `<span style="font-size:13px;color:var(--dim)">(${ME && ME.plan_status === 'cancelled' ? 'cancelado' : (ME && ME.trial_expired) ? 'prueba terminada' : 'trial'})</span>` : '';
      const trialLeft = (ME && ME.trial_days_left) || 0;
      // refInfo se obtiene una sola vez acá: lo usan bindSub (clic Suscribirse) y los banners
      let refInfo = null;
      try { refInfo = await pzReferral(); } catch (e) {}
      let trialBanner = '';
      if (!hasActive && ME && ME.plan_status === 'trial') {
        if (ME.trial_expired) trialBanner = `<div class="pz-trial-exp">🔒 <b>Tu prueba gratis terminó.</b> Elegí tu plan para seguir publicando con tu marca.</div>`;
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
            <div class="pm-perk">${p.postsPerWeek} posts/semana</div>
            <ul class="pm-feats">${(p.features || []).map(f => `<li>✓ ${esc(f)}</li>`).join('')}</ul>
            <button class="btn ${p.id === cur && hasActive ? 'btn-ghost' : 'btn-primary'} btn-sm btn-block" data-sub="${p.id}" ${p.id === cur && hasActive ? 'disabled' : ''}>${p.id === cur && hasActive ? 'Plan actual' : 'Suscribirse'}</button>
          </div>`;
      const bindSub = () => {
        $$('#planList [data-sub]').forEach(b => b.onclick = () => {
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
        ${trialBanner}
        <div style="font-size:16px;font-weight:800;margin-bottom:12px">Elegí tu plan para ${ME && ME.trial_expired ? 'seguir' : 'empezar'} 🚀</div>
        <div id="planList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${plans.map(planCard).join('')}</div>
        <div id="planMsg" style="margin-top:10px"></div>
        <div class="pz-guar">🛡️ <b>Garantía Posta:</b> si no estás conforme, te devolvemos el 100% de tu primer pago.</div>
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
      <details style="font-size:13px;color:var(--mut);margin:0 0 12px"><summary style="cursor:pointer;font-weight:700">👀 Vista previa del mensaje</summary><p style="background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0 0">${esc(shareMsg)}</p></details>
      <div class="pz-ref-slots">${slots}</div>
      <div class="pz-refbar"><div style="width:${pct}%"></div></div>
      <p style="font-size:14px;color:var(--mut)"><b>${n}/${need}</b> referidos</p>
      ${(info.joined && info.joined.length) ? `<div class="pz-ref-joined"><div class="pz-ref-joined-t">Se unieron con tu link 🎉</div>${info.joined.map(nm => `<div class="pz-ref-join">✓ ${esc(nm)}</div>`).join('')}</div>` : ''}
      ${(info.pending && info.pending.length) ? `<div class="pz-ref-joined"><div class="pz-ref-joined-t">En camino 🚶</div><div class="pz-ref-pending-sub">Se registraron con tu link y están en prueba. Un mensaje tuyo los convierte 👇</div>${info.pending.map((p, i) => `<div class="pz-ref-join">⏳ ${esc(p.name)}${p.days_left > 0 ? `<span class="pz-ref-days"> · le quedan ${p.days_left} día${p.days_left === 1 ? '' : 's'} de prueba</span>` : ''} <button class="btn btn-ghost btn-sm" data-nudge="${i}" style="margin-left:6px">📋 Copiar mensaje</button></div>`).join('')}</div>` : ''}
      ${info.discount_active
        ? `<div class="pz-disc">✅ Tenés <b>50% off activo</b>${half$ ? ` en tu suscripción: pagás <b>${half$}/mes</b>` : ' en tu suscripción'}.</div>`
        : `<p style="font-size:14px">${missing === 1 ? 'Te falta <b>1</b> referido' : `Te faltan <b>${missing}</b> referidos`}: cuando se suscriban con tu link, pagás la mitad.</p>`}
      <p class="pz-ref-auto">⚡ El descuento se aplica solo a tu suscripción, sin hacer nada.</p>
      <span id="pzRefMsg" style="font-size:13px"></span>`;
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
  const slf = $('#s_logofile');
  if (slf) slf.onchange = async () => {
    if (!slf.files[0]) return;
    try {
      await uploadAssetFile(slf.files[0], 'logo');
      try {
        const img = await loadImageFile(slf.files[0]);
        const cols = extractTopColors(img, 3);
        if (cols.length >= 2) await api.put('/api/settings', { brand_colors: cols });
      } catch (e) { /* el logo quedó; los colores se eligen a mano */ }
      SETTINGS = await api.get('/api/settings').catch(() => SETTINGS);
      render();
    }
    catch (e) { $('#brandMsg').innerHTML = `<span style="color:var(--red);font-size:14px">${esc(e.message)}</span>`; }
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
  ['s_c0', 's_c1', 's_c2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { markBrandDirty(); renderBrandPrev(); });
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
      cols.forEach((c, i) => { const inp = $('#s_c' + i); if (inp && c) { inp.value = c; filled++; } });
      if (filled >= 2) $('#brandMsg').innerHTML = '<span style="color:var(--mut);font-size:14px">🎨 Detectamos tus colores del logo — tocá Guardar marca para confirmar.</span>';
    } catch (e) { /* quedan los valores actuales */ }
  })();
  $('#btnSaveBrand').onclick = async () => {
    const colors = [$('#s_c0').value, $('#s_c1').value, $('#s_c2').value].filter((c, i, a) => a.indexOf(c) === i);
    const untouched = NEUTRAL_TRIO.every((d, i) => (colors[i] || '').toUpperCase() === d);
    if (untouched && !assetLogo()) { $('#brandMsg').innerHTML = `<span style="color:var(--red);font-size:14px">Subí tu logo o elegí tus colores 🙂</span>`; return; }
    await api.put('/api/settings', { brand_colors: colors });
    $('#brandMsg').innerHTML = '<span style="color:var(--cel);font-size:14px">✅ Marca guardada</span>';
    brandDirty = false; if (bDirtyEl) bDirtyEl.style.display = 'none';
    SETTINGS = await api.get('/api/settings');
  };
  $('#btnSaveSettings').onclick = async () => {
    await api.put('/api/settings', {
      meta_app_id: $('#s_appid').value,
      meta_app_secret: $('#s_appsecret').value, ig_embed_url: $('#s_igembed').value,
    });
    $('#setMsg').innerHTML = '<span style="color:var(--cel);font-size:14px">✅ Guardado</span>';
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
  // --- resultado del OAuth (?ig= en el hash) ---
  (function igResult() {
    let q = '';
    try { q = location.hash.split('?')[1] || ''; } catch (e) {}
    const hq = new URLSearchParams(q);
    const r = hq.get('ig');
    if (!r) return;
    try { history.replaceState(null, '', location.pathname + '#/app/ajustes'); } catch (e) {}
    const box = $('#igBanner');
    if (!box) return;
    if (r === 'ok') {
      box.innerHTML = `<div class="ig-ok">✅ <b>¡Instagram conectado!</b>${hq.get('demo_off') ? ' El modo demo se apagó solo — ahora publicás de verdad.' : ''}<br><a class="btn btn-primary btn-sm" href="#/app/crear" style="margin-top:10px">Crear mi primer posteo →</a></div>`;
    } else if (r === 'personal') {
      box.innerHTML = `<div class="ig-warn">⚠️ <b>Tu cuenta de Instagram es personal.</b> Para publicar necesitás una cuenta profesional (Business o Creator).</div>`;
      const g = $('#igProGuide'); if (g) g.style.display = '';
    } else if (r === 'error') {
      box.innerHTML = `<div class="err">❌ ${esc(hq.get('msg') || 'No se pudo conectar tu Instagram.')}</div>`;
    }
  })();
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

window.addEventListener('hashchange', render);
render();
