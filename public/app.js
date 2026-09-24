/* Posta — frontend */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const api = {
  async req(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
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
const TIMEZONES = ['America/Argentina/Buenos_Aires', 'America/Santiago', 'America/Asuncion', 'America/Montevideo', 'America/Sao_Paulo', 'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/New_York', 'Europe/Madrid'];

/* ---------- LANDING ---------- */
function landingView(cfg) {
  const plans = (cfg && cfg.plans) || [];
  const wa = (cfg && cfg.whatsapp) || '';
  const planCards = plans.map(p => `
    <div class="price-card${p.highlighted ? ' hot' : ''}">
      ${p.highlighted ? '<div class="tag">EL MÁS ELEGIDO</div>' : ''}
      <h3>Plan ${esc(p.name)}</h3>
      <div class="price">${esc(p.price_label)}<small>/mes</small></div>
      <p style="color:var(--mut);font-size:14px;margin-bottom:18px">${esc(p.tagline)}</p>
      <ul>${(p.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <a class="btn ${p.highlighted ? 'btn-sun' : 'btn-grad'} btn-block" href="#/registro">Empezar ahora</a>
    </div>`).join('');
  return `
  <div class="nav"><div class="wrap">
    <a class="logo" href="#/">Posta<span class="dot">.</span></a>
    <div class="nav-links">
      <a href="#como-funciona">Cómo funciona</a>
      <a href="#incluye">Qué incluye</a>
      <a href="#planes">Planes</a>
      <a href="#faq">Preguntas</a>
      <a href="#/login">Entrar</a>
      <a class="btn btn-sun btn-sm" href="#/registro">Empezar ahora</a>
    </div>
  </div></div>
  <div class="hero"><div class="wrap">
    <div class="pill">Tu equipo de marketing en automático <b>🇦🇷</b></div>
    <h1>Vos vendé. <span class="hl">Nosotros posteamos.</span></h1>
    <p class="sub"><b>Vos no te ocupás de nada.</b> Contanos de tu negocio una sola vez: creamos las ideas, los diseños y los captions, y publicamos solo en tu Instagram.</p>
    <div class="hero-cta">
      <a class="btn btn-sun" href="#/registro">Empezar ahora</a>
      ${wa ? `<a class="btn btn-ghost" href="${wa}" target="_blank">💬 Hablar por WhatsApp</a>` : `<a class="btn btn-ghost" href="#como-funciona">Ver cómo funciona</a>`}
    </div>
    <div class="hero-note">Sin tarjeta · 7 días gratis · 🛡️ Garantía de 30 días · Cancelá cuando quieras</div>
    <div class="mock-row">
      <div class="phone"><div class="screen">
        <img src="hero-post.png" alt="Ejemplo de posteo creado por Posta">
        <div class="cap"><b>tu_negocio</b> 🔥 Nuevo ingreso que te va a encantar... <br><span style="color:#1B86BC">#modaargentina #emprendedoresargentinos</span></div>
      </div></div>
      <div class="phone"><div class="screen">
        <video src="showreel.mp4" autoplay muted loop playsinline></video>
        <div class="cap"><b>Posta</b> 🎬 Así se ven los posteos que creamos para tu negocio, en cualquier rubro...</div>
      </div></div>
    </div>
  </div></div>
  <div class="sample-banner"><div class="wrap">
    <div class="sample-txt"><b>🎁 3 posteos de muestra GRATIS</b><span>Te los armamos con tu marca para que veas la calidad antes de pagar un peso.</span></div>
    ${wa ? `<a class="btn btn-sun" href="${wa}" target="_blank">Quiero mi muestra gratis</a>` : `<a class="btn btn-sun" href="#/registro">Quiero mi muestra gratis</a>`}
  </div></div>
  <div class="section" id="como-funciona"><div class="wrap">
    <h2>Así de simple</h2>
    <p class="lede">Vos seguí atendiendo tu negocio. Del resto nos ocupamos nosotros.</p>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Contanos tu negocio una vez</h3><p>Qué vendés, tu estilo y tus competidores. Te lleva 2 minutos y no te pedimos más nada.</p></div>
      <div class="step"><div class="num">2</div><h3>Creamos todo por vos</h3><p>Ideas estratégicas, diseños con tus fotos y tu marca, captions y hashtags que venden.</p></div>
      <div class="step"><div class="num">3</div><h3>Publicamos solos</h3><p>Tu semana armada y publicada automáticamente a la mejor hora. Vos ni te enterás.</p></div>
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
  <div class="section" id="planes"><div class="wrap">
    <h2>Elegí tu plan</h2>
    <p class="lede">Sin letra chica. Cancelá cuando quieras.</p>
    <div class="anchor-line">Un community manager cuesta <b>$300.000+/mes</b>. Posta arranca en <b>$29.900</b>.</div>
    <div class="scarcity">🔥 Solo <b>15 lugares</b> por mes — cada negocio lleva trabajo personalizado.</div>
    <div class="plans-row">${planCards || '<p>Cargando planes...</p>'}</div>
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
      <details><summary>¿Publican sin que yo lo apruebe?</summary><p>Vos elegís: automático total o con tu aprobación previa. Todo queda visible en tu calendario para revisar antes de que salga.</p></details>
      <details><summary>¿Y si no me funciona?</summary><p>Tenés 30 días de garantía: si tu Instagram no se ve transformado, te devolvemos el 100%. Sin preguntas.</p></details>
    </div>
    <div style="text-align:center;margin-top:44px">
      <a class="btn btn-sun" href="#/registro" style="font-size:18px;padding:18px 44px">Empezar ahora</a>
      ${wa ? `<div style="margin-top:16px"><a href="${wa}" target="_blank" style="color:var(--celeste-d);font-weight:700">💬 o hablanos por WhatsApp</a></div>` : ''}
    </div>
  </div></div>
  <div class="footer"><div class="wrap">
    <span class="logo" style="font-size:20px">Posta<span class="dot">.</span></span>
    <span>Hecho en Argentina 🇦🇷 · © 2026</span>
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
    <button class="btn btn-sun btn-block" id="btnAuth">${isLogin ? 'Entrar' : 'Crear cuenta'}</button>
    <p style="text-align:center;margin-top:18px;font-size:14px;color:var(--dim)">
      ${isLogin ? '¿No tenés cuenta? <a href="#/registro" style="color:var(--celeste-d)">Registrate</a>' : '¿Ya tenés cuenta? <a href="#/login" style="color:var(--celeste-d)">Entrá</a>'}
    </p>
  </div></div>`;
}

/* ---------- APP SHELL ---------- */
const TABS = [
  ['crear', '✨', 'Crear post'],
  ['ideas', '💡', 'Ideas'],
  ['video', '🎬', 'Video'],
  ['fotos', '📷', 'Mis fotos'],
  ['calendario', '📅', 'Calendario'],
  ['historial', '📊', 'Historial'],
  ['ajustes', '⚙️', 'Ajustes'],
];
let IDEAS = [];
function appShell(tab, content) {
  return `
  <div class="mtop"><a class="logo" href="#/">Posta<span class="dot">.</span></a>
    <button class="btn btn-ghost btn-sm" id="btnLogoutM">Salir</button></div>
  <div class="mtabs">${TABS.map(([k, i, l]) => `<button class="mtab ${k === tab ? 'on' : ''}" data-tab="${k}">${i} ${l}</button>`).join('')}</div>
  <div class="app-shell">
    <div class="sidebar">
      <a class="logo" href="#/" style="padding:6px 16px 20px">Posta<span class="dot">.</span></a>
      ${TABS.map(([k, i, l]) => `<button class="side-link ${k === tab ? 'on' : ''}" data-tab="${k}"><span class="ico">${i}</span>${l}</button>`).join('')}
      <div class="grow"></div>
      <div style="padding:12px 16px;font-size:13px;color:var(--dim)">${esc(ME?.email || '')}</div>
      <button class="side-link" id="btnLogout"><span class="ico">🚪</span>Salir</button>
    </div>
    <div class="main">${content}</div>
  </div>`;
}

/* ---------- CREAR ---------- */
let CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '' };

/* ---------- VIDEO ---------- */
function freshVState() {
  return { scenes: [{ image_path: '', text: '', duration: 3 }], music_path: '', result_url: '', caption: '', busy: false };
}
let VSTATE = freshVState();

const BASE_PALETTES = [
  { name: 'Cielo', c: ['#2FA9E0', '#1B86BC'], dark: false },
  { name: 'Sol', c: ['#FFD200', '#FF9E00'], dark: true },
  { name: 'Bandera', c: ['#2FA9E0', '#FFD200'], dark: true },
  { name: 'Nube', c: ['#EAF6FD', '#BFE3F5'], dark: true },
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
  const ink = pal.dark ? '#0B2239' : '#FFFFFF';
  const sub = pal.dark ? 'rgba(10,12,10,.72)' : 'rgba(255,255,255,.82)';

  if (o.photoImg) {
    // La foto va de fondo y el diseño se mantiene: velo con los colores de la marca
    drawCover(ctx, o.photoImg, 0, 0, W, H);
    if (o.tpl === 'claro') ctx.fillStyle = 'rgba(255,255,255,.88)';
    else if (o.tpl === 'noche') ctx.fillStyle = 'rgba(11,34,57,.86)';
    else { const pg = ctx.createLinearGradient(0, 0, W, H); pg.addColorStop(0, hexA(pal.c[0], .62)); pg.addColorStop(1, hexA(pal.c[1], .62)); ctx.fillStyle = pg; }
    ctx.fillRect(0, 0, W, H);
  }

  if (o.tpl === 'claro') {
    if (!o.photoImg) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = '#FFC93C'; ctx.fillRect(90, 120, 130, 18);
    ctx.fillStyle = '#0B2239'; ctx.textAlign = 'center';
    ctx.font = '800 96px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.title || 'Tu título', W - 220).slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, 420 + i * 116));
    ctx.fillStyle = 'rgba(10,12,10,.65)'; ctx.font = '400 52px -apple-system, Inter, sans-serif';
    wrapText(ctx, o.subtitle || '', W - 260).slice(0, 3).forEach((l, i) => ctx.fillText(l, W / 2, 900 + i * 70));
    ctx.fillStyle = '#0B2239'; ctx.font = '700 44px -apple-system, Inter, sans-serif';
    ctx.fillText('@' + (o.handle || 'tunegocio'), W / 2, 1230);
  } else if (o.tpl === 'noche') {
    if (!o.photoImg) { ctx.fillStyle = '#0B2239'; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = '#FFC93C'; ctx.lineWidth = 10; ctx.strokeRect(50, 50, W - 100, H - 100);
    ctx.fillStyle = '#FFC93C'; ctx.font = '800 40px -apple-system, Inter, sans-serif'; ctx.textAlign = 'center';
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
    ctx.fillStyle = pal.dark ? '#0B2239' : '#fff';
    ctx.beginPath(); ctx.roundRect(W / 2 - hw / 2, 1150, hw, 96, 48); ctx.fill();
    ctx.fillStyle = pal.dark ? '#fff' : '#0B2239';
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
    <h1>Crear post ✨</h1><p class="sub">Paso 1 de 3 — Contanos la idea, la IA escribe el texto.</p>
    ${stepsBar}
    <div class="card">
      <div class="field"><label>¿De qué es el post?</label>
        <textarea id="c_topic" placeholder='Ej: "nuevo buzo oversize color crema", "promo 2x1 en pizzas los martes", "abrimos local en Palermo"'>${esc(c.topic)}</textarea>
        <div class="hint">Una frase alcanza. La IA lo convierte en caption + hashtags con tu tono.</div></div>
      <button class="btn btn-grad" id="btnGen">🤖 Generar con IA</button>
      <div id="genErr"></div>
      <div id="genOut" style="margin-top:24px;${c.caption ? '' : 'display:none'}">
        <div class="field"><label>Caption</label><textarea id="c_caption" style="min-height:150px">${esc(c.caption)}</textarea></div>
        <div class="field"><label>Hashtags</label><textarea id="c_tags" style="min-height:70px">${esc(c.hashtags)}</textarea></div>
        <button class="btn btn-sun" id="btnToDesign">Siguiente: diseñar imagen →</button>
      </div>
    </div>`;
  }
  if (c.step === 2) {
    return `
    <h1>Crear post ✨</h1><p class="sub">Paso 2 de 3 — Diseñá la imagen del post (1080 × 1350).</p>
    ${stepsBar}
    <div class="designer">
      <div>
        <div class="card" style="padding:22px">
          <h3>Plantilla</h3>
          <div class="tpl-grid">
            ${['gradiente', 'claro', 'noche', 'promo'].map(t => `<div class="tpl ${c.tpl === t ? 'on' : ''}" data-tpl="${t}">${t[0].toUpperCase() + t.slice(1)}</div>`).join('')}
          </div>
          <h3 style="margin-top:18px">Paleta</h3>
          <div class="pal-row">${getPalettes().map((p, i) => `<div class="pal ${c.pal === i ? 'on' : ''}" data-pal="${i}" title="${p.name}${p.brand ? ' (tus colores)' : ''}" style="background:linear-gradient(135deg,${p.c[0]},${p.c[1]});${p.brand ? 'box-shadow:0 0 0 2px var(--yellow)' : ''}"></div>`).join('')}</div>
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
          <button class="btn btn-sun" id="btnSaveDesign" style="flex:1">Guardar diseño →</button>
        </div>
      </div>
      <div><div class="preview-box"><canvas id="postCanvas"></canvas></div>
      <p style="color:var(--dim);font-size:13px;margin-top:10px;text-align:center">Vista previa real — así se va a ver en el feed.</p></div>
    </div>`;
  }
  // step 3
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDt = now.toISOString().slice(0, 16);
  return `
  <h1>Crear post ✨</h1><p class="sub">Paso 3 de 3 — Programalo y olvidate.</p>
  ${stepsBar}
  <div class="card">
    <div style="display:flex;gap:22px;flex-wrap:wrap">
      <img src="${esc(c.imagePath)}" style="width:180px;border-radius:14px;border:1px solid var(--line)">
      <div style="flex:1;min-width:240px">
        <p style="font-size:15px;line-height:1.6;color:var(--mut);white-space:pre-wrap">${esc(c.caption)}</p>
        <p style="color:#1B86BC;font-size:14px;margin-top:8px">${esc(c.hashtags)}</p>
      </div>
    </div>
    <div class="row2" style="margin-top:24px">
      <div class="field"><label>Fecha y hora de publicación</label><input type="datetime-local" id="p_when" min="${minDt}" value="${minDt}"></div>
      <div class="field"><label>&nbsp;</label><div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-sun" id="btnSchedule">📅 Programar</button>
        <button class="btn btn-grad" id="btnNow">⚡ Publicar ahora</button>
      </div></div>
    </div>
    <div id="pubMsg"></div>
    <button class="btn btn-ghost btn-sm" id="btnBack2" style="margin-top:8px">← Atrás</button>
  </div>`;
}

/* ---------- IDEAS: nosotros pensamos el contenido por vos ---------- */
function ideasView() {
  const comp = ((PROFILE || {}).competitors || '').trim();
  return `<h1>Ideas 💡</h1><p class="sub">Nosotros pensamos el contenido por vos. Vos no te ocupás de nada.</p>
  <div class="card" style="background:linear-gradient(135deg,#EAF6FD,#FFF8E6);border:1px solid #BFE3F5">
    <h3>⚡ Piloto automático</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.65;margin:0">
      Contanos de tu negocio <b>una sola vez</b>. Estudiamos tu rubro${comp ? ` y a tus competidores (<b>${esc(comp)}</b>)` : ''},
      creamos las ideas, el texto y el diseño, y lo publicamos solo.
      ${comp ? '' : '<br><a href="#/app/ajustes" style="color:var(--celeste-d);font-weight:700">→ Agregá tus competidores en Ajustes</a> para ideas que te hagan destacar.'}
    </p>
  </div>
  <div id="ideasZone">${IDEAS.length ? ideasList() : `
    <div class="empty"><div class="big">💡</div>
      Todavía no generamos ideas para tu negocio.<br><br>
      <button class="btn btn-sun" id="btnGenIdeas">✨ Generar ideas para mi negocio</button>
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
        ${isVideo ? `<button class="btn btn-sun btn-sm" data-video="${i}">🎬 Crear video →</button>` : ''}
        <button class="btn btn-grad btn-sm" data-idea="${i}">Crear post →</button>
      </div>
    </div>`; }).join('')}
  </div>
  <div class="card" style="border:2px solid var(--yellow)">
    <h3>🚀 Llenamos tu semana en autopilot</h3>
    <p style="color:var(--mut);font-size:15px;line-height:1.6;margin-bottom:6px">Creamos el texto, diseñamos la imagen y programamos los posts solos. Vos solo mirá cómo salen.</p>
    <p style="font-size:13px;color:var(--dim);margin-bottom:16px">Tu plan: <b>${esc(planTag)}</b> · ${ppw} posts por semana${assetPhotos().length ? ` · 🖼️ usamos tus fotos` : ''}${assetLogo() ? ' · con tu logo' : ''}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select id="apCount" style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;color:var(--txt);font-size:15px;padding:12px 14px;font-family:inherit;font-weight:600">
        ${opts}
      </select>
      <button class="btn btn-sun" id="btnAutopilot">⚡ Armar mi semana</button>
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
  $$('[data-idea]').forEach(btn => btn.onclick = () => {
    const idea = IDEAS[+btn.dataset.idea];
    CREATOR = { step: 1, topic: idea.titulo, caption: '', hashtags: '', tpl: 'gradiente', pal: defaultPal(), palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '' };
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
  return `<h1>Video 🎬</h1><p class="sub">Convertí tus fotos en un video vertical (1080×1920) para Reels y TikTok. Hasta 5 escenas, 60 segundos en total.</p>
  ${!photos.length ? `<div class="card" style="border:1px dashed var(--celeste)"><p style="color:var(--mut);font-size:15px;margin:0">💡 Tip: subí tus fotos en <a href="#/app/fotos" style="color:var(--celeste-d);font-weight:700">Mis fotos</a> y las tenés siempre a mano para tus videos.</p></div>` : ''}
  <div class="card"><h3>Escenas (${v.scenes.length}/5)</h3>
    ${v.scenes.map((s, i) => `
    <div class="post-item" style="align-items:flex-start;gap:14px">
      <div style="width:72px;flex-shrink:0">
        ${s.image_path ? `<img src="${esc(s.image_path)}" style="width:72px;height:110px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">` : `<div style="width:72px;height:110px;border-radius:10px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--dim)">🖼️</div>`}
      </div>
      <div class="info" style="flex:1">
        <div style="font-weight:700;margin-bottom:8px">Escena ${i + 1}</div>
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
    <button class="btn btn-sun" id="btnVGen" ${v.busy ? 'disabled' : ''}>${v.busy ? '⏳ Generando video...' : '🎬 Generar video'}</button>
    <div id="vMsg" style="margin-top:14px"></div>
    ${v.result_url ? `
    <div style="margin-top:18px;display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start">
      <video src="${esc(v.result_url)}" controls style="width:220px;border-radius:14px;border:1px solid var(--line)"></video>
      <div style="flex:1;min-width:220px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
          <a class="btn btn-grad btn-sm" href="${esc(v.result_url)}" download>⬇️ Descargar</a>
        </div>
        <div class="field"><label>Fecha y hora de publicación</label><input type="datetime-local" id="v_when"></div>
        <button class="btn btn-sun btn-sm" id="btnVSched">📅 Programar video</button>
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
  return `<h1>Mis fotos 📷</h1><p class="sub">Tu librería: las fotos que usamos de fondo en tus diseños y videos, y tu logo que va en cada post.</p>
  <div class="card"><h3>🖼️ Fotos (${photos.length}/20)</h3>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      ${photos.map(a => `
      <div style="position:relative">
        <img src="${a.file_path}" style="width:120px;height:150px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">
        <button class="btn btn-danger btn-sm" data-adel="${a.id}" style="position:absolute;top:6px;right:6px;padding:6px 10px">✕</button>
      </div>`).join('')}
      ${photos.length < 20 ? `<button class="btn btn-ghost" id="btnAAdd" style="width:120px;height:150px;border-style:dashed">＋<br>Agregar</button>` : ''}
    </div>
    <input type="file" id="a_files" accept="image/*" multiple style="display:none">
    <div class="hint">El autopilot usa tus fotos rotando: post 1 → foto 1, post 2 → foto 2, etc. Si no hay fotos, usa los diseños de plantilla.</div>
  </div>
  <div class="card"><h3>🔰 Tu logo</h3>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      ${logo ? `<img src="${logo.file_path}" style="max-width:160px;max-height:100px;border-radius:12px;border:1px solid var(--line);background:#fff;padding:8px">` : `<div style="color:var(--dim);font-size:15px">Todavía no subiste tu logo.</div>`}
      <div style="display:flex;gap:8px">
        <button class="btn btn-grad btn-sm" id="btnLogoAdd">${logo ? 'Cambiar logo' : 'Subir logo'}</button>
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
        ${p.ig_permalink ? `<a href="${esc(p.ig_permalink)}" target="_blank" style="color:var(--celeste-d)">Ver en IG ↗</a>` : ''}
        ${p.error ? `<span style="color:#D64545">${esc(p.error)}</span>` : ''}
      </div>
    </div>
    <div class="acts">${actions}</div>
  </div>`;
}
async function calendarView() {
  const posts = await api.get('/api/posts?status=scheduled');
  const drafts = await api.get('/api/posts?status=draft');
  const all = [...posts, ...drafts];
  return `<h1>Calendario 📅</h1><p class="sub">Tus próximos posts. Se publican solos a la hora indicada.</p>
  ${all.length ? all.map(p => postItem(p, `
      ${p.status === 'scheduled' ? `<button class="btn btn-grad btn-sm" data-act="now" data-id="${p.id}">Publicar ahora</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${p.id}">Cancelar</button>
    `)).join('') : `<div class="empty"><div class="big">📭</div>No tenés posts programados.<br><br><a class="btn btn-sun" href="#/app/crear">Crear el primero</a></div>`}`;
}
async function historyView() {
  const posts = await api.get('/api/posts');
  const done = posts.filter(p => ['published', 'failed', 'cancelled'].includes(p.status));
  return `<h1>Historial 📊</h1><p class="sub">Todo lo que ya pasó por Posta.</p>
  ${done.length ? done.map(p => postItem(p, p.status === 'failed' ? `<button class="btn btn-grad btn-sm" data-act="now" data-id="${p.id}">Reintentar</button>` : '')).join('')
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
  return `<h1>Ajustes ⚙️</h1><p class="sub">Tu negocio, tu marca, tu plan y tus integraciones.</p>
  ${igMsg}${planMsg}${tokenWarn}
  <div class="card" style="border:2px solid var(--yellow)"><h3>💳 Mi plan</h3>
    <div id="planZone"><p style="color:var(--dim)">Cargando...</p></div>
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
      <button class="btn btn-sun" id="btnSaveProfile">Guardar</button> <span id="profMsg"></span>
      <button class="btn btn-ghost btn-sm" id="btnOnb">🧭 Retomar guía inicial</button>
    </div>
  </div>
  <div class="card"><h3>🎨 Mi marca</h3>
    <p style="color:var(--mut);font-size:14px;margin-bottom:16px">Tus fotos están en <a href="#/app/fotos" style="color:var(--celeste-d);font-weight:700">Mis fotos</a>. Acá definís tu logo y tus colores: todo lo que generemos sale con tu identidad.</p>
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
        ${[0, 1, 2].map(i => `<input type="color" id="s_c${i}" value="${bc[i] || ['#2FA9E0', '#1B86BC', '#FFC93C'][i]}" style="width:56px;height:44px;border:1px solid var(--line);border-radius:12px;padding:4px;background:#fff;cursor:pointer">`).join('')}
      </div>
    </div>
    <button class="btn btn-sun" id="btnSaveBrand">Guardar marca</button> <span id="brandMsg"></span>
  </div>
  <div class="card"><h3>📸 Instagram</h3>
    <div class="set-row"><div><div class="t">Modo demo ${s.demo_mode ? '(activo)' : ''}</div>
      <div class="d">En modo demo las publicaciones se simulan: probá todo el flujo sin conectar nada. Desactivalo para publicar de verdad.</div></div>
      <div class="toggle ${s.demo_mode ? 'on' : ''}" id="tglDemo"></div></div>
    <div class="set-row"><div><div class="t">Cuenta conectada</div>
      <div class="d">${p.ig_connected ? `✅ @${esc(p.ig_username)} — lista para publicar` : 'Todavía no conectaste tu Instagram. Necesitás una cuenta Business vinculada a una Página de Facebook.'}</div></div>
      ${p.ig_connected ? `<button class="btn btn-danger btn-sm" id="btnIgDisc">Desconectar</button>` : `<button class="btn btn-grad btn-sm" id="btnIgConn">Conectar Instagram</button>`}
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
    <div class="field"><label>URL pública de imágenes <span style="color:var(--dim);font-weight:400">(para publicar de verdad, ej: https://tu-dominio.com)</span></label>
      <input id="s_imgurl" value="${esc(s.image_base_url)}" placeholder="https://..."></div>
    <button class="btn btn-sun" id="btnSaveSettings">Guardar integraciones</button> <span id="setMsg"></span>
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
    c1: '#2FA9E0', c2: '#1B86BC', c3: '#FFC93C',
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
      <button class="goal-card ${o.goal === v ? 'on' : ''}" data-goal="${v}" style="display:flex;gap:14px;align-items:center;text-align:left;background:#fff;border:2px solid ${o.goal === v ? 'var(--celeste)' : 'var(--line)'};border-radius:16px;padding:18px;cursor:pointer;font-family:inherit">
        <span style="font-size:30px">${ico}</span>
        <span><b style="font-size:16px">${t}</b><br><span style="color:var(--mut);font-size:14px">${d}</span></span>
      </button>`).join('')}
    </div>`;
  return `<h1>Te configuramos todo 🚀</h1><p class="sub">Paso ${o.step} de 4 — 2 minutos y no te pedimos más nada.</p>
  ${stepsBar}
  <div class="card" style="max-width:640px">${body}
    <div id="obMsg" style="margin-top:8px"></div>
    <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
      ${o.step > 1 ? `<button class="btn btn-ghost" id="obBack">← Atrás</button>` : ''}
      ${o.step < 4 ? `<button class="btn btn-sun" id="obNext" style="flex:1">Continuar →</button>` : `<button class="btn btn-sun" id="obFinish" style="flex:1">✨ Listo, a crear contenido</button>`}
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
      location.hash = '#/app/ideas';
    } catch (e) {
      $('#obMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
      fin.disabled = false; fin.textContent = '✨ Listo, a crear contenido';
    }
  };
}

/* ---------- ROUTER ---------- */
async function render() {
  const root = $('#app');
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
        await api.post(path === '#/login' ? '/api/auth/login' : '/api/auth/register', { email, password });
        await refreshSession();
        // Onboarding si el perfil está incompleto
        location.hash = (PROFILE && PROFILE.business_name) ? '#/app/crear' : '#/app/onboarding';
        if (!PROFILE || !PROFILE.business_name) OB = freshOB();
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
  const tab = (path.split('/')[2] || 'crear');
  let content = '';
  if (tab === 'crear') content = creatorView();
  else if (tab === 'ideas') content = ideasView();
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
  $$('.mtab,.side-link[data-tab]').forEach(b => b.onclick = () => location.hash = '#/app/' + b.dataset.tab);
  const lo1 = $('#btnLogout'), lo2 = $('#btnLogoutM');
  if (lo1) lo1.onclick = async () => { await api.post('/api/auth/logout'); location.hash = '#/'; };
  if (lo2) lo2.onclick = async () => { await api.post('/api/auth/logout'); location.hash = '#/'; };

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
  }
  if (tab === 'ajustes') bindSettings();
}

function bindCreator() {
  const c = CREATOR;
  if (c.step === 1) {
    $('#btnGen').onclick = async () => {
      c.topic = $('#c_topic').value.trim();
      if (!c.topic) { $('#genErr').innerHTML = `<div class="err">Escribí el tema del post primero</div>`; return; }
      $('#btnGen').disabled = true; $('#btnGen').textContent = '⏳ Generando...';
      try {
        const out = await api.post('/api/generate', { topic: c.topic });
        c.caption = out.caption; c.hashtags = out.hashtags;
        $('#genErr').innerHTML = '';
        $('#genOut').style.display = 'block';
        $('#c_caption').value = c.caption; $('#c_tags').value = c.hashtags;
      } catch (e) { $('#genErr').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      $('#btnGen').disabled = false; $('#btnGen').textContent = '🤖 Generar con IA';
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
  if (c.step === 3) {
    const done = (msg) => {
      $('#pubMsg').innerHTML = `<div class="okmsg">${msg}</div>`;
      CREATOR = { step: 1, topic: '', caption: '', hashtags: '', tpl: 'gradiente', pal: 0, palTouched: false, title: '', subtitle: '', handle: '', imagePath: '', photo: '' };
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

function bindSettings() {
  $('#btnSaveProfile').onclick = async () => {
    await api.put('/api/profile', {
      business_name: $('#s_biz').value, ig_username: $('#s_iguser').value.replace('@', ''),
      category: $('#s_cat').value, tone: $('#s_tone').value, description: $('#s_desc').value,
      competitors: $('#s_comp').value, goal: $('#s_goal').value,
    });
    await api.put('/api/settings', { timezone: $('#s_tz').value });
    $('#profMsg').innerHTML = '<span style="color:var(--celeste-d);font-size:14px">✅ Guardado</span>';
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
      const isTrial = ME && ME.is_trial;
      const curPlan = plans.find(p => p.id === cur) || plans[0];
      z.innerHTML = `
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px 20px">
            <div style="font-size:13px;color:var(--dim)">Plan actual</div>
            <div style="font-size:20px;font-weight:800">${esc(curPlan.name)} ${isTrial ? '<span style="font-size:13px;color:var(--dim)">(trial)</span>' : ''}</div>
            <div style="font-size:14px;color:var(--mut)">${esc(curPlan.price_label)}/mes · ${curPlan.postsPerWeek} posts/semana · ${isTrial ? 'Trial' : esc(ME.plan_status)}</div>
          </div>
          <button class="btn btn-sun btn-sm" id="btnPlanChange">Cambiar / mejorar plan</button>
        </div>
        <div id="planList" style="display:none;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px"></div>
        <div id="planMsg" style="margin-top:10px"></div>`;
      $('#btnPlanChange').onclick = () => {
        const l = $('#planList');
        const show = l.style.display === 'none';
        l.style.display = show ? 'grid' : 'none';
        if (show) l.innerHTML = plans.map(p => `
          <div style="border:2px solid ${p.id === cur && !isTrial ? 'var(--celeste)' : 'var(--line)'};border-radius:16px;padding:18px">
            <b>${esc(p.name)}</b> ${p.highlighted ? '<span class="badge b-scheduled">Recomendado</span>' : ''}
            <div style="font-size:22px;font-weight:800;margin:8px 0">${esc(p.price_label)}<small style="font-size:13px;color:var(--dim)">/mes</small></div>
            <div style="font-size:14px;color:var(--mut);margin-bottom:12px">${p.postsPerWeek} posts/semana</div>
            <button class="btn ${p.id === cur && !isTrial ? 'btn-ghost' : 'btn-sun'} btn-sm btn-block" data-sub="${p.id}" ${p.id === cur && !isTrial ? 'disabled' : ''}>${p.id === cur && !isTrial ? 'Plan actual' : 'Elegir ' + esc(p.name)}</button>
          </div>`).join('');
        $$('#planList [data-sub]').forEach(b => b.onclick = async () => {
          if (!mp_configured) { $('#planMsg').innerHTML = `<div class="err">Pagos no configurados todavía. Escribinos y lo activamos.</div>`; return; }
          b.disabled = true; b.textContent = '⏳...';
          try {
            const { init_point } = await api.post('/api/billing/subscribe', { plan: b.dataset.sub });
            location.href = init_point;
          } catch (e) {
            $('#planMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
            b.disabled = false; b.textContent = 'Elegir plan';
          }
        });
      };
    } catch (e) { z.innerHTML = `<div class="err">No se pudieron cargar los planes</div>`; }
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
    $('#brandMsg').innerHTML = '<span style="color:var(--celeste-d);font-size:14px">✅ Marca guardada</span>';
    SETTINGS = await api.get('/api/settings');
  };
  $('#btnSaveSettings').onclick = async () => {
    await api.put('/api/settings', {
      openai_key: $('#s_openai').value, meta_app_id: $('#s_appid').value,
      meta_app_secret: $('#s_appsecret').value, image_base_url: $('#s_imgurl').value,
    });
    $('#setMsg').innerHTML = '<span style="color:var(--celeste-d);font-size:14px">✅ Guardado</span>';
  };
  $('#tglDemo').onclick = async () => {
    const v = !$('#tglDemo').classList.contains('on');
    await api.put('/api/settings', { demo_mode: v });
    render();
  };
  const bc = $('#btnIgConn');
  if (bc) bc.onclick = async () => {
    try {
      const { url } = await api.get('/api/ig/start');
      location.href = url;
    } catch (e) { $('#igMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  const bd = $('#btnIgDisc');
  if (bd) bd.onclick = async () => { await api.post('/api/ig/disconnect'); render(); };
}

window.addEventListener('hashchange', render);
render();
