/* chunk-analisis.js — Lazy chunk de Posty: la pantalla "Tu análisis" (LA CARTA v3).
 * Se carga bajo demanda vía loadChunk('analisis') desde app.js (router: tab 'analisis';
 * el menú y el link de Schedule ya apuntan a #/app/analisis).
 * Es un <script> clásico: comparte el scope global con app.js; las funciones declaradas
 * acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA (la de todos los chunks): no agregar top-level let/const/var con nombres que ya
 * existan en app.js u otro chunk — por eso TODO acá lleva prefijo ana.
 *
 * analisisView() devuelve la cáscara con un loading amable; bindAnalisis() pide
 * GET /api/analysis y pinta la carta; anaRefresh() hace POST /api/analysis/refresh.
 *
 * EL ANÁLISIS COMPLETO (pantalla "Tu análisis", diseño cerrado de Valentino):
 * la carta mínima es la superficie; su radiografía entera vive a un toque en
 * "Ver mi análisis completo →" (el botón propio de esta ventana; la tarjeta
 * homónima de Schedule y su link con sessionStorage 'posty_ana_full' se
 * eliminaron el 2026-10-25 por decisión de Valentino). La ventana ABRE con
 * la explicación de cómo se armó el plan (el week_summary del motor, en
 * anaCartaHTML): es su línea de apertura, no una sección más. El orden de
 * la radiografía es EL de la spec: foto de hoy (números grandes) → las tres
 * tarjetas (a mejorar / a incrementar / a reducir, cada hallazgo cerrando
 * con qué hace Posty) → competencia en BARRAS (posteos/semana, solo con el
 * mercado completo del payload gateado) → "Así nace tu semana" (hallazgo →
 * decisión de la semana, desde las decisions del payload) → plan de
 * ejecución → (loop medido, cartas anteriores, notas de datos) → banner →
 * firma. Cuenta de nacimiento: misma estructura con su plan (lo que Posty ya
 * sabe + kit + vidriera + así nace + plan de nacimiento), jamás números de
 * una cuenta que no existe. La croma de la pantalla sale en el idioma del
 * análisis (a.lang; el contenido del payload ya viene bilingüe del motor).
 *
 * LA FORMA (decisión de Valentino, 2026-10-20): la carta en el estilo de la
 * CARTA NOCTURNA — cuando el payload trae `letter` (compuesta por el motor
 * desde los datos reales), se lee como carta personal: avatar de Posty →
 * título evocativo → saludo al negocio → narración en primera persona de SU
 * semana (fortalezas primero, marcador honesto con su lectura, hallazgos con
 * el arreglo ya en marcha) → plan integrado en la narración (3 fases, "El
 * efecto:" por paso) → competencia SOLO si el payload gateado la trae →
 * cierre motivacional amarillo → FIRMA de Posty → botón discreto de
 * actualizar. Las cartas SIN `letter` (las anteriores a este cambio) se
 * siguen rindiendo con la forma de bloques v3 (veredicto → foto de hoy →
 * hallazgos agrupados → plan navy), intacta más abajo.
 * REGLA DE VERDAD: solo se afirma lo que el payload trae (este payload NO trae
 * puntaje de salud ni ejes: la carta no los inventa). Cuenta sin análisis o sin
 * datos → carta de NACIMIENTO honesta, jamás una radiografía fingida.
 * CARTA SEMANAL: esta es la carta de ESTA semana; abajo, "Cartas anteriores"
 * lista las previas con el resumen honesto que trae history (n, fecha,
 * hallazgos, medición del plan) y la línea de progreso sale del loop medido.
 * Cada carta anterior se abre ENTERA (anaOpenPast → GET /api/analysis/:id).
 * La serie la mantiene el sweep del DOMINGO A LA NOCHE (refreshAnalysesSweep
 * en modo ventana, server.js): la carta cierra la semana que pasó.
 * Tono: líder motivacional — fortalezas primero, nada de retos ni números en rojo.
 */

var anaLastPayload = null;
var anaPastMode = false;

/* Idioma de la croma de esta pantalla: el del análisis (payload) y, antes de
 * que llegue, el de la cuenta (ME.lang). El contenido (hallazgos, decisiones,
 * carta) ya viene en ese idioma desde el motor: acá se localiza el marco. */
var anaLang = 'es';
function anaUiLang() {
  try { if (typeof ME !== 'undefined' && ME && ME.lang === 'en') return 'en'; } catch (e) {}
  return 'es';
}
function anaSetLang(a) {
  if (a && (a.lang === 'en' || a.lang === 'es')) anaLang = a.lang;
  else if (!a) anaLang = anaUiLang();
  return anaLang;
}
function anaT(es, enS) { return anaLang === 'en' ? enS : es; }

function analisisView() {
  const en = anaUiLang() === 'en';
  return `<div class="ana-wrap"><div id="anaRoot">
    <div class="ana-card ana-letter"><div class="ana-loading">
      <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
      <p class="ana-load-t">${en ? 'Building your strategy…' : 'Estoy armando tu estrategia…'}</p>
      <p class="ana-load-s">${en ? 'I read your account, your market and your week. Give me a second.' : 'Leo tu cuenta, tu mercado y tu semana. Dame un segundo.'}</p>
    </div></div>
  </div></div>`;
}

async function bindAnalisis() { await anaLoad(false); }

async function anaLoad(useRefresh) {
  const rootEl = document.getElementById('anaRoot');
  if (!rootEl) return;
  anaPastMode = false;
  let d = null;
  try {
    d = useRefresh ? await api.post('/api/analysis/refresh', {}) : await api.get('/api/analysis');
  } catch (e) { d = null; }
  if (useRefresh && (!d || d.ok === false)) {
    try { d = await api.get('/api/analysis'); } catch (e) { d = null; }
  }
  if (!document.getElementById('anaRoot')) return; // el usuario ya navegó a otra vista
  if (!d || d.ok === false || !('analysis' in d)) {
    rootEl.innerHTML = anaErrorHTML();
    return;
  }
  anaLastPayload = d;
  rootEl.innerHTML = anaCartaHTML(d);
  anaNextStepMount();
  anaBoostRecLoad();
  anaWeekNumsLoad();
  anaMagiaEntrada();
  try { window.scrollTo(0, 0); } catch (e) {}
}

function anaRefresh(btn) {
  if (btn) { btn.disabled = true; btn.textContent = anaT('Analizando…', 'Analyzing…'); }
  anaLoad(true);
}

function anaRetry() { anaLoad(false); }

function anaErrorHTML() {
  const en = anaUiLang() === 'en';
  return `<div class="ana-card ana-letter"><div class="ana-loading">
    <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
    <p class="ana-load-t">${en ? 'Oops, I could not build your strategy just now' : 'Uy, no pude armar tu estrategia ahora'}</p>
    <p class="ana-load-s">${en ? 'It is not your account: it is a connection hiccup on my side. Let us try again.' : 'No es tu cuenta: es un tropiezo de conexión de mi lado. Probamos de nuevo.'}</p>
    <button class="btn btn-primary" style="margin-top:14px" onclick="anaRetry()">${en ? 'Try again' : 'Reintentar'}</button>
  </div></div>`;
}

/* ---------- contexto y veredicto (compuesto desde los datos, nunca molde) ---------- */

function anaCtx() {
  const c = { handle: '', biz: '' };
  try {
    if (typeof PROFILE !== 'undefined' && PROFILE) {
      if (PROFILE.ig_username) c.handle = String(PROFILE.ig_username).replace(/^@/, '');
      if (PROFILE.business_name) c.biz = String(PROFILE.business_name);
    }
  } catch (e) {}
  return c;
}

function anaFmtRate(x) {
  if (x == null) return '';
  const v = Math.round(Number(x) * 10) / 10;
  if (Number.isInteger(v)) return String(v);
  return anaLang === 'en' ? String(v) : String(v).replace('.', ',');
}

function anaStage(a) {
  const s = (a && a.signals) || {};
  const r = s.posts_per_week;
  if (r != null && r >= 4 && (s.days_since_last == null || s.days_since_last <= 3)) return 'fuerte';
  if ((r != null && r < 2) || (s.days_since_last != null && s.days_since_last >= 14)) return 'floja';
  return 'viva';
}

function anaStrong(s) {
  if (!s) return '';
  if (s.videos > 0) return anaT('ya usás reels, el formato que más empuja', 'you already use reels, the format that pushes the hardest');
  if (s.hook_pct != null && s.hook_pct >= 50) return anaT('tus textos ya abren con gancho', 'your captions already open with a hook');
  if (s.carousels > 0) return anaT('ya probás con carruseles', 'you already try carousels');
  if (s.days_since_last != null && s.days_since_last <= 2) return anaT('venís activo estos días', 'you have been active these days');
  if (s.n_posts >= 8) return anaT('ya tenés material publicado para apoyarnos', 'you already have published material to build on');
  return '';
}

function anaVerdict(a, stage, birth) {
  if (birth) {
    return anaT('Tu cuenta está por nacer — y nacer con estrategia es una ventaja enorme: no hay nada que corregir, todo por construir. Yo pongo el plan y la constancia desde el primer posteo.', 'Your account is about to be born — and being born with a strategy is a huge advantage: there is nothing to fix, everything to build. I bring the plan and the consistency from the very first post.');
  }
  const s = (a && a.signals) || {};
  const rate = s.posts_per_week != null ? anaFmtRate(s.posts_per_week) : null;
  const strong = anaStrong(s);
  if (stage === 'fuerte') {
    return anaT('Tu cuenta ya viene trabajando', 'Your account is already working') + (strong ? anaT(' y ', ' and ') + strong : '') + anaT('. Lo que sigue no es rescatar nada: es afinar y sostener — y de eso me encargo yo.', '. What comes next is not rescuing anything: it is fine-tuning and keeping it up — and that is on me.');
  }
  const parts = [];
  if (strong) parts.push(anaT('Tenés con qué: ', 'You have what it takes: ') + strong + '.');
  if (rate) parts.push(anaT('La constancia no depende de tu tiempo: la pongo yo.', 'Consistency does not depend on your time: I provide it.'));
  else if (strong) parts.push(anaT('Tu cuenta está viva — lo que sigue es darle constancia y dirección: de eso me encargo yo.', 'Your account is alive — what comes next is giving it consistency and direction: that is on me.'));
  else parts.push(anaT('Todavía estoy juntando los primeros datos de tu cuenta — mientras tanto el plan ya está: constancia y dirección desde esta semana, y de eso me encargo yo.', 'I am still gathering the first data from your account — meanwhile the plan is already set: consistency and direction from this week on, and that is on me.'));
  parts.push(anaT('Abajo está el plan, en orden.', 'The plan is below, in order.'));
  return parts.join(' ');
}

/* ---------- próximo análisis (LOTE 1 · ítem 4) ---------- */
// El sweep real: domingo 20:00–22:59 en la zona de la cuenta (userTz,
// default Buenos Aires); en la práctica, la carta de las 21:00. El próximo
// es el domingo cuya ventana no pasó todavía; si la carta de este domingo
// ya existe (anti-duplicado del sweep: creada en los últimos 3 días), el
// siguiente. Nunca se inventa una fecha: sin análisis real no hay línea.
// nowOpt solo para tests (fecha fija); en vivo usa la hora real.
function anaProximoAnalisisHTML(a, nowOpt) {
  try {
    const tz = (typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.timezone) || undefined;
    const zo = tz ? { timeZone: tz } : {};
    const parts = (d) => {
      const o = {};
      new Intl.DateTimeFormat('en-US', Object.assign({ weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }, zo)).formatToParts(d).forEach((p) => { o[p.type] = p.value; });
      return o;
    };
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = nowOpt ? new Date(nowOpt) : new Date();
    const np = parts(now);
    let hh = Number(np.hour); if (hh === 24) hh = 0;
    let off = (7 - WD.indexOf(np.weekday)) % 7;
    if (WD.indexOf(np.weekday) === 0 && hh > 22) off = 7; // domingo pasada la ventana
    let cand = new Date(now.getTime() + off * 86400000);
    if (a && a.created_at) {
      const cp = parts(cand);
      const ap = parts(new Date(a.created_at));
      if (ap.year === cp.year && ap.month === cp.month && ap.day === cp.day) cand = new Date(cand.getTime() + 7 * 86400000);
    }
    const en = anaLang === 'en';
    const fecha = cand.toLocaleDateString(en ? 'en-US' : 'es-AR', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, zo));
    return en ? 'Next strategy: ' + fecha + ' at night' : 'Próxima estrategia: ' + fecha + ' a la noche';
  } catch (e) { return ''; }
}

function anaDateLine(a) {
  let fecha = '';
  try {
    const src = a && a.created_at ? new Date(a.created_at) : new Date();
    if (!isNaN(src)) fecha = src.toLocaleDateString(anaLang === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {}
  if (!fecha) return '';
  return a && a.n ? anaT('Estrategia #', 'Strategy #') + a.n + ' · ' + fecha : anaT('Estrategia del ', 'Strategy from ') + fecha;
}

/* ---------- Tu foto de hoy: los números reales + la trayectoria ---------- */

function anaStatsHTML(a, d) {
  const s = (a && a.signals) || {};
  const tiles = [];
  if (s.posts_per_week != null) tiles.push({ n: anaFmtRate(s.posts_per_week), l: anaT('posteos por semana', 'posts per week') });
  if (s.n_posts >= 3 && s.videos != null) tiles.push({ n: s.videos + anaT(' de ', ' of ') + s.n_posts, l: anaT('reels en tus últimos posteos', 'reels in your latest posts') });
  if (s.hook_pct != null) tiles.push({ n: s.hook_pct + '%', l: anaT('de tus captions abren con gancho', 'of your captions open with a hook') });
  if (s.max_gap_days != null && s.max_gap_days >= 2) tiles.push({ n: s.max_gap_days + anaT(' días', ' days'), l: anaT('tu racha más larga sin publicar', 'your longest stretch without posting') });
  else if (s.days_since_last != null) tiles.push({ n: s.days_since_last + anaT(' días', ' days'), l: anaT('desde tu último posteo', 'since your last post') });
  if (s.avg_likes != null) tiles.push({ n: String(s.avg_likes), l: anaT('me gusta promedio por posteo', 'average likes per post') });
  let traj = '';
  const hist = (d && Array.isArray(d.history)) ? d.history : [];
  if (a && a.n && a.n >= 2) traj = `<p class="ana-traj">${anaT('Ya es tu estrategia #', 'This is already your strategy #')}${a.n}${anaT(': cada semana comparo contra el anterior y ajusto tu semana con lo nuevo que aprendo de tu cuenta.', ': every week I compare against the previous one and adjust your week with what I newly learn from your account.')}</p>`;
  else if (hist.length > 1) traj = `<p class="ana-traj">${anaT('Ya tenés ', 'You already have ')}${hist.length}${anaT(' estrategias: cada una aprende de la anterior.', ' strategies: each one learns from the previous.')}</p>`;
  if (tiles.length < 2) return traj ? `<div class="ana-block">${traj}</div>` : '';
  return `<p class="ana-sec-t">${anaT(`${pzIc('camera', 16)} Tu foto de hoy`, `${pzIc('camera', 16)} Your snapshot today`)}</p><div class="ana-stats">${tiles.slice(0, 4).map((t) => `<div class="ana-stat"><p class="ana-sn">${esc(t.n)}</p><p class="ana-sl">${esc(t.l)}</p></div>`).join('')}</div>${traj}`;
}

/* ---------- Hallazgos ---------- */

function anaFindingHTML(f, skipActs) {
  if (!f) return '';
  const act = f.decision || f.with_posty || '';
  const dup = !!(act && Array.isArray(skipActs) && skipActs.length && anaNormTxt(skipActs.join(' ')).indexOf(anaNormTxt(act)) !== -1);
  return `<div class="ana-f"><p class="ana-t">${esc(f.text || '')}</p>`
    + (f.now ? `<p class="ana-fmeta"><span class="ana-now">${anaT('Hoy: ', 'Today: ')}${esc(f.now)}</span></p>` : '')
    + ((act && !dup) ? `<p class="ana-act">${pzIc("arrowRight", 13)} ${anaT('Con Posty: ', 'With Posty: ')}<b>${esc(act)}</b></p>` : '')
    + `</div>`;
}

function anaGroupsHTML(a) {
  const groups = [['mejorar', anaT(`${pzIc('wrench', 16)} A mejorar`, `${pzIc('wrench', 16)} To improve`)], ['incrementar', anaT(`${pzIc('chartUp', 16)} A incrementar`, `${pzIc('chartUp', 16)} To grow`)], ['reducir', anaT(`${pzIc('chartDown', 16)} A reducir`, `${pzIc('chartDown', 16)} To reduce`)]];
  const html = groups.map(([key, title]) => {
    const fs = (a.findings || []).filter((f) => f && f.group === key);
    if (!fs.length) return '';
    return `<div class="ana-group"><p class="ana-gtitle">${title}</p>${fs.map(anaFindingHTML).join('')}</div>`;
  }).join('');
  if (html) return html;
  return `<div class="ana-group"><p class="ana-t" style="margin-top:14px">${anaT('Esta semana no encontré nada para corregir: la semana sostiene lo que ya funciona, empuja los formatos que más rinden y sigo midiendo tu cuenta.', 'This week I found nothing to fix: the week keeps what already works, pushes the formats that perform best and I keep measuring your account.')}</p></div>`;
}

/* ---------- Plan de ejecución: nace de los hallazgos y sus decisiones ---------- */

function anaCleanWp(wp) {
  return String(wp || '').replace(/^todos:\s*/i, '');
}
function anaDot(t) {
  const s = String(t || '').trim();
  return s && !/[.!?…]$/.test(s) ? s + '.' : s;
}
function anaCap(t) {
  const s = String(t || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function anaStepFor(f, isMarket) {
  if (!f) return null;
  const step = f.decision || (f.with_posty ? anaCap(anaCleanWp(f.with_posty)) : '');
  if (!step) return null;
  const byKey = {
    ritmo: { phase: 0, fx: () => anaT('Pasás de ', 'You go from ') + (f.now || anaT('tu ritmo de hoy', "today's rhythm")) + anaT(' a tu semana completa, todas las semanas.', ' to your full week, every week.') },
    reels: { phase: 0, fx: () => anaT('El formato que más empuja Instagram entra a tu mix desde esta semana.', 'The format that pushes Instagram the hardest joins your mix from this week.') },
    horarios: { phase: 1, fx: () => anaT('Nada sale a cualquier hora: tu cuenta gana regularidad también en el horario.', 'Nothing goes out at just any time: your account gains regularity in its schedule too.') },
    captions: { phase: 1, fx: () => anaT('Hoy ', 'Today ') + (f.now || anaT('casi ninguno abre con gancho', 'almost none opens with a hook')) + anaT(' — conmigo, todos abren con gancho desde el primer día.', ' — with me, every one opens with a hook from day one.') },
    paleta: { phase: 1, fx: () => anaT('Tu feed se ve parejo y reconocible de un solo vistazo.', 'Your feed looks even and recognizable at a single glance.') },
    silencio: { phase: 2, fx: () => anaT('De ', 'From ') + (f.now || anaT('rachas en silencio', 'silent stretches')) + anaT(' a 0 días en silencio: tu semana se programa sola.', ' to 0 silent days: your week schedules itself.') },
  };
  if (byKey[f.key]) return { phase: byKey[f.key].phase, step: anaDot(step), fx: byKey[f.key].fx() };
  if (isMarket) return { phase: 1, step: anaDot(step), fx: f.now ? anaT('Hoy: ', 'Today: ') + f.now + '.' : '' };
  const g = { incrementar: 0, mejorar: 1, reducir: 2 }[f.group];
  if (g == null) return null;
  return { phase: g, step: anaDot(step), fx: f.now ? anaT('Hoy: ', 'Today: ') + f.now + '.' : '' };
}

function anaBuildPhases(a) {
  const phases = [[], [], []];
  (a.findings || []).forEach((f) => {
    const st = anaStepFor(f, false);
    if (st && phases[st.phase].length < 3) phases[st.phase].push(st);
  });
  // Si el plan trae el mercado completo, sus decisiones también alimentan el plan.
  if (a.market_full && a.market && Array.isArray(a.market.findings)) {
    a.market.findings.forEach((f) => {
      const st = anaStepFor(f, true);
      if (st && phases[st.phase].length < 3) phases[st.phase].push(st);
    });
  }
  // Fase sin hallazgos: solo pasos del propio proceso de Posty (siempre
  // sostenibles: la semana del cliente existe y el loop semanal es real).
  if (!phases[0].length) phases[0].push({ step: anaT('Tu semana sale completa y pareja, armada y programada por mí.', 'Your week goes out full and even, built and scheduled by me.'), fx: anaT('La constancia queda instalada desde la primera semana.', 'Consistency is installed from the first week.') });
  if (!phases[1].length) phases[1].push({ step: anaT('Reviso tu vidriera — nombre, bio y destacadas — con tu cuenta ya andando.', 'I review your storefront — name, bio and highlights — with your account already running.'), fx: anaT('Tu perfil queda vendiendo solo, las 24 horas.', 'Your profile keeps selling on its own, 24 hours a day.') });
  if (phases[2].length < 3) phases[2].push({ step: anaT('Cada semana te re-mido y ajusto la semana con lo nuevo que aprendo de tu cuenta.', 'Every week I re-measure you and adjust the week with what I newly learn from your account.'), fx: anaT('Lo que funciona se repite; lo que no, no vuelve.', 'What works gets repeated; what does not, does not come back.') });
  return phases;
}

function anaStarterPhases() {
  return [
    [
      { step: anaT('Tu perfil nace completo: nombre, bio, foto y destacadas — tu kit está en esta misma carta.', 'Your profile is born complete: name, bio, photo and highlights — your kit is right in this letter.'), fx: anaT('Te ves profesional desde el primer posteo.', 'You look professional from the very first post.') },
      { step: anaT('Tu primera vidriera: 9 piezas pensadas como un todo, cada una con su rol.', 'Your first storefront: 9 pieces designed as a whole, each with its role.'), fx: anaT('Quien entra a tu perfil entiende qué vendés en segundos.', 'Whoever lands on your profile gets what you sell in seconds.') },
    ],
    [
      { step: anaT('El ritmo queda instalado: tu semana completa sale sola, cada semana.', 'The rhythm is installed: your full week goes out on its own, every week.'), fx: anaT('Nacés con la constancia que a la mayoría de las cuentas les falta.', 'You are born with the consistency most accounts lack.') },
    ],
    [
      { step: anaT('Te mido desde el día uno: cada estrategia nueva compara contra la anterior y ajusta la semana.', 'I measure you from day one: every new strategy compares against the previous one and adjusts the week.'), fx: anaT('Tu cuenta mejora con datos, no con corazonadas.', 'Your account improves with data, not hunches.') },
    ],
  ];
}

function anaNeedLine(a, birth) {
  if (!birth) {
    return anaT('De tu lado: <b>nada</b> — yo arranco. Tu semana ya está armada con este plan: la ves en ', 'On your side: <b>nothing</b> — I take it from here. Your week is already built with this plan: see it in ') + `<a href="#/app/schedule" style="color:inherit;text-decoration:underline">${anaT('tu agenda', 'your Schedule')}</a> 👇`;
  }
  const parts = [];
  try {
    if (typeof PROFILE !== 'undefined' && PROFILE && !PROFILE.ig_connected) {
      parts.push(anaT('conectá tu Instagram desde Ajustes — así publico por vos y tu estrategia se afina con tus métricas reales', 'connect your Instagram from Settings — that way I post for you and your strategy sharpens with your real metrics'));
    }
  } catch (e) {}
  parts.push(anaT('mandame tus fotos favoritas (3 a 5) — tu vidriera sale con tu material real, no con fotos genéricas', 'send me your favorite photos (3 to 5) — your storefront goes out with your real material, not generic photos'));
  return `${anaT('De tu lado: <b>cuando puedas</b> — ', 'On your side: <b>whenever you can</b> — ')}${parts.join('; ')}${anaT('. Con eso, tu cuenta nace completa.', '. With that, your account is born complete.')}`;
}

function anaPlanHTML(a, birth) {
  const phases = birth ? anaStarterPhases() : anaBuildPhases(a || {});
  const names = anaLang === 'en' ? ['This week', 'Next week', 'From here on'] : ['Esta semana', 'La que viene', 'De acá en más'];
  const nums = ['①', '②', '③'];
  const body = phases.map((steps, i) => {
    if (!steps.length) return '';
    const lis = steps.map((st) => `<li>${esc(st.step)}${st.fx ? `<span class="ana-fx">${anaT('El efecto: ', 'The effect: ')}${esc(st.fx)}</span>` : ''}</li>`).join('');
    return `<div class="ana-phase"><p class="ana-ph">${nums[i]} ${names[i]}</p><ul>${lis}</ul></div>`;
  }).join('');
  const title = birth ? anaT(`${pzIc('rocket', 16)} Mi plan para que nazcas con todo`, `${pzIc('rocket', 16)} My plan so you launch with everything`) : anaT(`${pzIc('rocket', 16)} Mi plan para mejorar todo esto`, `${pzIc('rocket', 16)} My plan to improve all of this`);
  return `<div class="ana-plan"><p class="ana-plan-t">${title}</p><p class="ana-plan-s">${anaT('En este orden — y ya arranca', 'In this order — and it starts now')}</p>${body}<p class="ana-need">${anaNeedLine(a, birth)}</p></div>`;
}

/* ---------- Competencia: solo lo que el payload gateado trae ---------- */

/* BARRAS de competencia (spec de la pantalla): posteos por semana — la
 * métrica sobre la que el motor mide la posición — tu barra primero en
 * celeste y las de tu competencia en gris azulado, ordenadas de mayor a
 * menor. SOLO valores que el payload trae: un par sin cadencia medida no
 * entra a la barra (queda en la fila de texto de respaldo) y tu fila solo
 * existe si tu ritmo está medido. Nada se estima para dibujar. */
function anaBarsHTML(a) {
  const m = a.market || {};
  const own = (a.signals && a.signals.posts_per_week != null) ? Number(a.signals.posts_per_week) : null;
  const rows = [];
  (m.peers || []).forEach((p) => {
    if (p && p.posts_per_week != null) rows.push({ label: '@' + (p.handle || ''), v: Number(p.posts_per_week), fol: p.followers, own: false });
  });
  if (!rows.length) return '';
  const ctx = anaCtx();
  if (own != null) rows.push({ label: anaT('vos', 'you') + (ctx.handle ? ' (@' + ctx.handle + ')' : ''), v: own, fol: null, own: true });
  rows.sort((x, y) => y.v - x.v);
  const max = Math.max.apply(null, rows.map((r) => r.v).concat([0.1]));
  const unit = anaT('posteos/sem', 'posts/wk');
  const bars = rows.map((r) => {
    const w = Math.max(4, Math.round((r.v / max) * 100));
    const fol = r.fol != null ? ' · ' + Number(r.fol).toLocaleString(anaLang === 'en' ? 'en-US' : 'es-AR') + anaT(' seguidores', ' followers') : '';
    return `<div class="ana-bar-row${r.own ? ' ana-bar-own' : ''}"><div class="ana-bar-head"><span class="ana-bar-name">${esc(r.label)}</span><span class="ana-bar-val">${esc(anaFmtRate(r.v) + ' ' + unit + fol)}</span></div><div class="ana-bar-track"><div class="ana-bar-fill" style="width:${w}%"></div></div></div>`;
  }).join('');
  return `<div class="ana-bars">${bars}</div>`;
}

function anaMarketHTML(a) {
  if (a.market_full && a.market) {
    const m = a.market;
    if (!m.available) {
      return `<p class="ana-sec-t">${anaT(`${pzIc('map', 16)} Tu competencia`, `${pzIc('map', 16)} Your competition`)}</p><p class="ana-t">${esc(m.unavailable_reason || anaT('Todavía no hay datos públicos suficientes de cuentas de tu rubro y tu zona. Apenas aparezcan, este mapa se completa solo — no estimamos nada.', 'There is not enough public data yet from accounts in your category and your area. As soon as it appears, this map completes itself — we estimate nothing.'))}</p>`;
    }
    const bars = anaBarsHTML(a);
    const peers = bars ? '' : (m.peers || []).map((p) => {
      const rate = p.posts_per_week != null ? anaFmtRate(p.posts_per_week) + anaT(' posteos/sem', ' posts/wk') : anaT('sin datos de ritmo', 'no rhythm data');
      const fol = p.followers != null ? ' · ' + Number(p.followers).toLocaleString(anaLang === 'en' ? 'en-US' : 'es-AR') + anaT(' seguidores', ' followers') : '';
      return `<div class="ana-peer"><span>@${esc(p.handle || '')}</span><span>${esc(rate + fol)}</span></div>`;
    }).join('');
    const mf = (m.findings || []).map(anaFindingHTML).join('');
    const pos = m.position && m.position.text ? `<p class="ana-pos">${pzIc('pin', 14)} ${esc(m.position.text)}</p>` : '';
    return `<p class="ana-sec-t">${anaT(`${pzIc('map', 16)} Tu competencia, de tu rubro y tu zona`, `${pzIc('map', 16)} Your competition, in your category and your area`)}</p>${bars}${peers}${mf}${pos}`;
  }
  const teaser = a.market_teaser;
  if (teaser && Array.isArray(teaser.items) && teaser.items.length) {
    const items = teaser.items.map((it) => `<p class="ana-t" style="margin-top:8px">${pzIc('pin', 15)} ${esc(it.text || '')}${it.now ? ` — <span style="color:var(--mut);font-weight:600">${esc(it.now)}</span>` : ''}</p>`).join('');
    return `<p class="ana-sec-t">${anaT(pzIc('map', 20) + ' Tu mercado', pzIc('map', 20) + ' Your market')} <span class="ana-badge">${anaT('MUESTRA', 'TASTE')}</span></p>${items}`
      + `<p class="ana-upsell">${anaT('El mapa completo — tu competencia una por una, tu posición en el rubro y las decisiones que tomamos con eso — es parte de <b>Growth</b> (planes Pro y Total).', 'The full map — your competition one by one, your position in the category and the decisions we make with it — is part of <b>Growth</b> (Pro and Total plans).')}</p>`
      + `<a class="btn btn-primary btn-sm" style="margin-top:10px" href="#/app/ajustes?plan=1">${anaT('Ver planes', 'See plans') + ' ' + pzIc('arrowRight', 13)}</a>`;
  }
  return '';
}

/* ---------- El loop y el recorrido ---------- */

function anaLoopHTML(a) {
  if (!a.loop || !Array.isArray(a.loop.checks) || !a.loop.checks.length) return '';
  const ico = { 'cumplida': pzIc('checkCircle', 16), 'en-curso': pzIc('refresh', 16), 'sin-datos': pzIc('clock', 16) };
  const checks = a.loop.checks.map((c) => `<div class="ana-check">${ico[c.status] || '•'} ${esc(c.text || '')}</div>`).join('');
  return `<div class="ana-block"><p class="ana-sec-t" style="margin-top:0">${anaT(`${pzIc('refresh', 16)} Así viene el plan`, `${pzIc('refresh', 16)} How the plan is going`)}</p><p class="ana-traj" style="margin:0 0 4px">${anaT('Lo que la estrategia anterior se propuso, medida contra tu cuenta hoy.', 'What the previous strategy set out to do, measured against your account today.')}</p>${checks}</div>`;
}

/* La línea de progreso contra la carta anterior, desde el loop medido:
 * solo afirma lo que los checks del motor ya midieron (este sistema no usa
 * puntaje de salud: la carta no inventa uno). */
function anaProgressHTML(a) {
  const checks = (a && a.loop && Array.isArray(a.loop.checks)) ? a.loop.checks : [];
  const measured = checks.filter((c) => c && c.status && c.status !== 'sin-datos');
  if (!measured.length) return '';
  const done = measured.filter((c) => c.status === 'cumplida').length;
  let txt;
  if (done === measured.length) txt = anaT('cumplimos todos los objetivos que nos propusimos. Este plan sigue desde ahí.', 'we met every goal we set. This plan continues from there.');
  else if (done > 0) txt = done + anaT(' de ', ' of ') + measured.length + anaT(' objetivos del plan ya están cumplidos — el resto viene en camino y queda empujando en este plan.', ' plan goals are already met — the rest is on its way and keeps pushing in this plan.');
  else txt = anaT('el plan viene en camino, todavía sin objetivos cerrados — por eso esta carta refuerza justo esos puntos.', 'the plan is on its way, with no goals closed yet — that is why this letter reinforces exactly those points.');
  return `<p class="ana-prog">${pzIc('chartUp', 16)} <b>${anaT('Desde tu carta anterior:', 'Since your last letter:')}</b> ${esc(txt)}</p>`;
}

/* Cartas anteriores: el historial del payload trae el RESUMEN (n, fecha,
 * cantidad de hallazgos y la medición del plan de esa semana); cada fila es
 * TOCABLE y abre la carta COMPLETA de esa semana (GET /api/analysis/:id,
 * solo las del propio usuario) con el mismo renderer de la carta actual. */
function anaHistoryHTML(d, a) {
  const hist = (d && Array.isArray(d.history)) ? d.history : [];
  // La entrada actual es la primera (la serie viene de nueva a vieja):
  // "Cartas anteriores" lista solo las previas a la carta en pantalla.
  const prev = (a && a.n != null) ? hist.filter((h) => h.n !== a.n) : hist.slice(1);
  if (!prev.length) return '';
  const rows = prev.map((h) => {
    let fecha = String(h.created_at || '').slice(0, 10);
    try { const dt = new Date(h.created_at); if (!isNaN(dt)) fecha = dt.toLocaleDateString(anaLang === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) {}
    let loopTxt = '';
    if (Array.isArray(h.loop_checks) && h.loop_checks.length) {
      const measured = h.loop_checks.filter((c) => c && c.status && c.status !== 'sin-datos');
      if (measured.length) {
        const done = measured.filter((c) => c.status === 'cumplida').length;
        loopTxt = anaT(' · plan medido: ', ' · plan measured: ') + done + anaT(' de ', ' of ') + measured.length + anaT(' objetivos cumplidos', ' goals met');
      }
    }
    const kindTxt = h.kind === 'nacimiento' ? anaT(' · plan de nacimiento', ' · birth plan') : '';
    const right = fecha + ' · ' + (h.findings != null ? h.findings : '') + anaT(' hallazgos', ' findings') + loopTxt;
    const open = h.id ? ` onclick="anaOpenPast(${Number(h.id)})" style="cursor:pointer" title="${anaT('Leer esta carta completa', 'Read this letter in full')}"` : '';
    const read = h.id ? anaT(' · <u>leer completa</u>', ' · <u>read in full</u>') : '';
    return `<div class="ana-peer"${open}><span>${pzIc('mail', 14)} ${anaT('Carta #', 'Letter #')}${esc(String(h.n || ''))}${esc(kindTxt)}${read}</span><span>${esc(right)}</span></div>`;
  }).join('');
  return `<div class="ana-block"><p class="ana-sec-t" style="margin-top:0">${anaT(`${pzIc('mail', 16)} Cartas anteriores`, `${pzIc('mail', 16)} Past letters`)}</p>${rows}<p class="ana-traj">${anaT('Una carta nueva cada semana: cada una se apoya en la anterior — diagnóstico → plan → medición → ajuste. Por eso tu carta #10 va a ser mucho mejor que la #1.', 'A new letter every week: each one builds on the previous — diagnosis → plan → measurement → adjustment. That is why your letter #10 will be much better than your #1.')}</p></div>`;
}

/* ---------- Carta anterior completa: abrir → leer → volver ---------- */

async function anaOpenPast(id) {
  const rootEl = document.getElementById('anaRoot');
  if (!rootEl || !id) return;
  const en0 = anaUiLang() === 'en';
  rootEl.innerHTML = `<div class="ana-card ana-letter"><div class="ana-loading">
    <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
    <p class="ana-load-t">${en0 ? 'Opening your past letter…' : 'Abro tu carta anterior…'}</p>
    <p class="ana-load-s">${en0 ? 'It is the letter just as I wrote it to you that week.' : 'Es la carta tal como te la escribí esa semana.'}</p>
  </div></div>`;
  let d = null;
  try { d = await api.get('/api/analysis/' + Number(id)); } catch (e) { d = null; }
  if (!document.getElementById('anaRoot')) return; // ya navegó a otra vista
  if (!d || d.ok === false || !d.analysis) {
    const msg = (d && d.message) ? String(d.message) : (en0 ? 'I could not open that letter just now. Let us try again in a bit.' : 'Esta carta no se pudo abrir ahora. Probamos de nuevo en un ratito.');
    rootEl.innerHTML = `<div class="ana-card ana-letter"><div class="ana-loading">
      <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
      <p class="ana-load-t">${en0 ? 'I could not open that letter' : 'No pude abrir esa carta'}</p>
      <p class="ana-load-s">${esc(msg)}</p>
      <button class="btn btn-primary" style="margin-top:14px" onclick="anaBackCurrent()">${en0 ? pzIc('arrowLeft', 14) + ' Back to your current letter' : pzIc('arrowLeft', 14) + ' Volver a tu carta actual'}</button>
    </div></div>`;
    return;
  }
  anaPastMode = true;
  anaSetLang(d.analysis);
  const bar = `<div style="margin-bottom:10px"><button class="btn btn-ghost btn-sm" onclick="anaBackCurrent()">${pzIc('arrowLeft', 14) + ' ' + anaT('Volver a tu carta actual', 'Back to your current letter')}</button>
    <span style="margin-left:8px;font-size:12.5px;color:var(--mut);font-weight:600">${anaT('Carta anterior — así se veía tu estrategia esa semana', 'Past letter — this is what your strategy looked like that week')}</span></div>`;
  rootEl.innerHTML = bar + anaCartaHTML({ ok: true, plan: d.plan, analysis: d.analysis, history: [] });
  try { window.scrollTo(0, 0); } catch (e) {}
}

function anaBackCurrent() {
  const rootEl = document.getElementById('anaRoot');
  if (!rootEl) return;
  anaPastMode = false;
  if (anaLastPayload) {
    rootEl.innerHTML = anaCartaHTML(anaLastPayload);
    anaNextStepMount();
    anaBoostRecLoad();
    anaWeekNumsLoad();
    try { window.scrollTo(0, 0); } catch (e) {}
  } else {
    anaLoad(false);
  }
}

/* ---------- Nacimiento: lo que Posty ya sabe + kit + vidriera ---------- */

function anaNormTxt(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function anaKitHTML(a, skipActs) {
  let h = '';
  const fs = (a.findings || []).filter((f) => f && f.text);
  if (fs.length) {
    h += `<p class="ana-sec-t">${anaT(`${pzIc('sparkle', 16)} Lo que ya sé de tu negocio`, `${pzIc('sparkle', 16)} What I already know about your business`)}</p>${fs.map((f) => anaFindingHTML(f, skipActs)).join('')}`;
  }
  const kit = a.profile_kit || {};
  if (kit.highlights && kit.highlights.length) {
    h += `<p class="ana-t" style="margin-top:10px"><b>${anaT('Destacadas:', 'Highlights:')}</b> ${esc(kit.highlights.join(' · '))}</p>`;
  }
  const grid = Array.isArray(a.starter_grid) ? a.starter_grid : [];
  if (grid.length) {
    const roles = grid.map((s) => `<div class="ana-role"><b>${esc(String(s.slot))}. ${esc(s.role || '')}</b> <span class="ana-role-f">${esc(s.format || '')}</span><div class="ana-role-w">${esc(s.why || '')}</div></div>`).join('');
    h += `<p class="ana-sec-t">${anaT(`${pzIc('store', 16)} Tu primera vidriera (9 piezas)`, `${pzIc('store', 16)} Your first storefront (9 posts)`)}</p>${roles}`;
    if (grid.market_note) h += `<p class="ana-note">${esc(grid.market_note)}</p>`;
  }
  return h;
}

/* ---------- Banner y firma ---------- */

function anaBanner(stage, ctx) {
  const lines = anaLang === 'en' ? {
    starter: 'Being born with a plan is starting ahead: your account goes out with a strategy from post one.',
    fuerte: 'You are already doing well — and this is just getting started. I keep the rhythm and fine-tune everything that follows.',
    floja: 'You have the business. The consistency is on me. You keep doing what you do best.',
    viva: 'You have the business. The consistency is on me. You keep doing what you do best.',
  } : {
    starter: 'Nacer con plan es arrancar ganando: tu cuenta sale con estrategia desde el posteo uno.',
    fuerte: 'Ya venís bien — y esto recién arranca. Yo sostengo el ritmo y afino todo lo que sigue.',
    floja: 'Tenés el negocio. La constancia la pongo yo. Vos seguí haciendo lo que mejor sabés hacer.',
    viva: 'Tenés el negocio. La constancia la pongo yo. Vos seguí haciendo lo que mejor sabés hacer.',
  };
  let line = lines[stage] || lines.viva;
  if (ctx && ctx.handle) line = '@' + ctx.handle + ' — ' + (anaLang === 'en' ? line : line.charAt(0).toLowerCase() + line.slice(1));
  return line;
}

function anaSignHTML(birth) {
  const fline = birth
    ? anaT('Tu cuenta nace con plan. Nos vemos en tu agenda', 'Your account is born with a plan. See you in your Schedule')
    : anaT('El plan ya está en marcha: tu semana está armada con todo esto. Nos vemos en tu agenda', 'The plan is already in motion: your week is built with all of this. See you in your Schedule');
  return `<div class="ana-sign">
    <img src="ai-avatar.png" alt="Posty">
    <p class="ana-fname">Posty<span>.</span></p>
    <p class="ana-frole">${anaT('Tu community manager', 'Your community manager')}</p>
    <p class="ana-fline">${fline}</p>
  </div>`;
}

/* ---------- La carta narrativa (estilo carta nocturna, 2026-10-20) ----------
 * Si el payload trae `letter` (la compone el motor desde los datos reales),
 * la carta se lee como CARTA CORTA (resumen de menos de un minuto, tono
 * amigo): saludo personal → narración breve en primera persona de SU semana
 * (los números ya vienen leídos dentro del marcador de la propia carta —
 * sin banda de tiles en esta vista) → el plan dentro de la narración (fase
 * en negrita, efecto en línea) → cierre de líder motivacional → firma. Las
 * cartas viejas (sin letter) se siguen
 * leyendo con la forma de bloques v3 de abajo: nada se rompe hacia atrás. */

/* CARTA MÍNIMA EN 3 BLOQUES (decisión Valentino 2/11, sobre la forma v2):
 * saludo + foto + festejo/honesta → "Qué pasó" · acciones de la semana →
 * "Qué viene" · "De tu lado" → "Qué hacer". Mismo contenido, mismo orden,
 * solo agrupado con título; sin botón de audio en la carta (la página
 * firmada y el email lo conservan). ~10 líneas: nada más se renderiza en
 * esta vista. Las cartas v1 guardadas conservan su forma vieja. */
function anaLetterMinimalHTML(a, opts) {
  const L = a.letter;
  const items = Array.isArray(L.body) ? L.body : [];
  const render = (it) => {
    if (!it) return '';
    if (it.t === 'photo' && it.src) {
      return `<figure style="margin:2px 0 12px"><img src="${esc(it.src)}" alt="" loading="lazy" style="width:148px;height:148px;object-fit:cover;border-radius:14px;display:block" onerror="this.parentNode.style.display='none'"></figure>`;
    } else if (it.t === 'action') {
      return `<div class="ana-ltr-plan"><p>• ${esc(it.text || '')}</p></div>`;
    } else if (it.t === 'p') {
      return `<p class="ana-ltr-p">${esc(it.text || '')}</p>`;
    }
    return '';
  };
  // CARTA CORTA EN 3 BLOQUES (decisión Valentino 2/11): la forma mínima v2
  // ya venía ordenada saludo → foto → festejo/honesta → acciones →
  // "De tu lado"; la partición es por posición, sin reescribir ni inventar
  // contenido: antes de la primera acción / acciones / después de la última
  // acción. Sin botón de audio (decisión estrategia-sin-audio 2/11, ya
  // aplicada en v565: la carta en Estrategia no lo lleva; la página
  // firmada /carta/:token y el botón del email quedan intactos en
  // server.js). El saludo del cuerpo se suprime cuando opts.saludoTop
  // (carta-personalizada: la carta actual ya lo rinde arriba).
  const actionIdx = [];
  items.forEach((it, i) => { if (it && it.t === 'action') actionIdx.push(i); });
  if (!actionIdx.length) {
    // Carta degenerada (sin acciones): forma plana de siempre, sin audio y
    // sin bloques inventados; nunca se muestra una sección vacía.
    let h = '';
    if (L.greeting && !(opts && opts.saludoTop)) h += `<p class="ana-ltr-p ana-ltr-greet">${esc(L.greeting)}</p>`;
    items.forEach((it) => { h += render(it); });
    return h;
  }
  const first = actionIdx[0], last = actionIdx[actionIdx.length - 1];
  let pre = '', mid = '', post = '';
  if (L.greeting && !(opts && opts.saludoTop)) pre += `<p class="ana-ltr-p ana-ltr-greet">${esc(L.greeting)}</p>`;
  items.forEach((it, i) => {
    if (i < first) pre += render(it);
    else if (i <= last) mid += render(it);
    else post += render(it);
  });
  const sec = (es, enS, inner) => `<section class="ana-ltr-sec"><p class="ana-sec-t">${anaT(es, enS)}</p>${inner}</section>`;
  return sec('Qué pasó', 'What happened', pre)
    + sec('Qué viene', "What's next", mid)
    + sec('Qué hacer', 'What to do', post);
}

/* ---------- Así nace tu semana: hallazgo → decisión de la semana ----------
 * La sección que convierte el diagnóstico en la semana concreta: lista las
 * decisiones que la semana tomó, cada una con su hallazgo de origen. Todo
 * sale del payload (findings con decision, de la cuenta y — con el mercado
 * completo — de la competencia): si no hay decisiones registradas, la
 * sección no existe. Nada se redacta acá que el motor no haya decidido ya.
 * (El week_summary del motor — qué vi → por eso tu semana es así — ya NO
 * se repite en esta sección: desde el 2026-10-25 encabeza la ventana
 * entera como su línea de apertura, en anaCartaHTML.) */
function anaWeekBirthHTML(d, a) {
  const seen = new Set();
  const rows = [];
  const push = (f) => {
    if (!f || !f.decision) return;
    const k = f.key || f.text || '';
    if (seen.has(k)) return;
    seen.add(k);
    rows.push(f);
  };
  (a.findings || []).forEach(push);
  if (a.market_full && a.market && Array.isArray(a.market.findings)) a.market.findings.forEach(push);
  if (!rows.length) return '';
  let h = `<p class="ana-sec-t">${anaT(`${pzIc('compass', 16)} Así nace tu semana`, `${pzIc('compass', 16)} How your week is born`)}</p>`;
  h += rows.slice(0, 4).map((f) => `<div class="ana-f"><p class="ana-act" style="margin-top:0">${pzIc("arrowRight", 13)} ${anaT('En tu semana: ', 'In your week: ')}<b>${esc(f.decision)}</b></p><p class="ana-fmeta"><span class="ana-now">${anaT('Porque vi: ', 'Because I saw: ')}${esc(f.text || '')}${f.now ? ' (' + esc(f.now) + ')' : ''}</span></p></div>`).join('');
  h += `<p style="margin-top:10px"><a href="#/app/schedule" style="font-weight:700;color:var(--cel)">${anaT('Verla en tu agenda', 'See it in your Schedule') + ' ' + pzIc('arrowRight', 13)}</a></p>`;
  return h;
}

/* El análisis COMPLETO detrás de un toque (diseño asentado de la carta
 * mínima: la carta es la superficie; la radiografía entera vive a un toque,
 * sin salir de la pantalla). EL ORDEN es el de la spec de la pantalla
 * "Tu análisis": foto de hoy → tres tarjetas → competencia (barras) →
 * así nace tu semana → plan de ejecución → loop medido → cartas anteriores
 * → notas de datos. (El banner y la firma los pone la carta, debajo.)
 * Sin la línea de progreso: la carta ya es el resumen.
 * Nacimiento: la misma estructura con su plan — lo que Posty ya sabe + kit
 * y vidriera → así nace → plan de nacimiento → cartas anteriores. */
function anaFullHTML(d, a, birth) {
  anaSetLang(a);
  if (birth) return anaKitHTML(a || {}) + anaWeekBirthHTML(d, a || {}) + anaPlanHTML(a, true) + anaHistoryHTML(d, a);
  let h = '';
  h += anaStatsHTML(a, d);
  h += anaGroupsHTML(a);
  h += anaMarketHTML(a);
  h += anaWeekBirthHTML(d, a);
  h += anaPlanHTML(a, false);
  h += anaLoopHTML(a);
  h += anaHistoryHTML(d, a);
  if (a && Array.isArray(a.data_notes) && a.data_notes.length) {
    h += a.data_notes.map((n) => `<p class="ana-note">${esc(n)}</p>`).join('');
  }
  return h;
}

function anaToggleFull(btn) {
  const box = document.getElementById('anaFull');
  if (!box) return;
  const open = box.style.display !== 'none';
  box.style.display = open ? 'none' : 'block';
  if (btn) btn.innerHTML = open ? anaT('Ver mi estrategia completa', 'See my full strategy') + ' ' + pzIc('arrowRight', 13) : anaT('Ver menos', 'See less') + ' ' + pzIc('chevUp', 13);
}

function anaLetterBodyHTML(a, opts) {
  const L = a.letter;
  if (L && (L.v >= 2 || L.minimal)) return anaLetterMinimalHTML(a, opts);
  const items = Array.isArray(L.body) ? L.body : [];
  const phaseNums = ['①', '②', '③'];
  let h = '';
  if (L.greeting && !(opts && opts.saludoTop)) h += `<p class="ana-ltr-p ana-ltr-greet">${esc(L.greeting)}</p>`;
  let lastPhase = -1;
  items.forEach((it) => {
    if (!it) return;
    if (it.t === 'plan') {
      const head = it.phase !== lastPhase ? `<b>${phaseNums[it.phase] || ''} ${esc(it.phase_name || '')} —</b> ` : '';
      lastPhase = it.phase;
      h += `<div class="ana-ltr-plan"><p>${head}${esc(it.step || '')}${it.fx ? `<span class="ana-fx">${anaT('El efecto: ', 'The effect: ')}${esc(it.fx)}</span>` : ''}</p></div>`;
    } else {
      h += `<p class="ana-ltr-p">${esc(it.text || '')}</p>`;
    }
  });
  // CARTA CORTA (2026-10-20): la banda "Tu foto de hoy" NO va en la vista de
  // carta — duplicaba los números que la propia carta ya trae leídos en su
  // marcador (≤3, con su lectura) y alargaba el resumen. La foto completa
  // (tiles + trayectoria) sigue existiendo en el análisis, fuera de la carta.
  return h;
}

function anaHasLetter(a) {
  return !!(a && a.letter && Array.isArray(a.letter.body) && a.letter.body.length);
}

/* ---------- Carta compartible + referidos (capa de visibilidad, 2026-10-21) ----------
 * DEBAJO de la carta (el formato de la carta es cerrado: nada entra en su
 * texto). Botón "Compartir mi semana": tarjeta vertical 1080×1920 con la
 * foto de su mejor posteo (o placa con los colores de SU marca), su @ y el
 * festejo REAL de su carta; la atribución a Posty va como firma chica,
 * nunca como marca de agua sobre su foto. Fail-closed: sin carta mínima,
 * sin festejo o sin @, el bloque no existe. La línea de referidos respeta
 * los caps del servidor (superficie 'ref_letter'). */
function anaShareBlockHTML(a) {
  const L = a && a.letter;
  if (!L || !(L.v >= 2 || L.minimal)) return '';
  const items = Array.isArray(L.body) ? L.body : [];
  const pride = items.find((it) => it && it.t === 'p' && it.text);
  const handle = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.ig_username) ? String(PROFILE.ig_username).replace(/^@/, '') : '';
  if (!pride || !handle) return '';
  const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
  setTimeout(() => { try { anaWireShareBlock(); } catch (e) {} }, 40);
  return `<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
    <button class="btn btn-primary btn-block" onclick="anaShareWeek(this)">${en ? (pzIc('share', 18) + ' Share my week') : (pzIc('share', 18) + ' Compartir mi semana')}</button>
    <p class="d" style="text-align:center;margin-top:6px">${en ? 'A card with your best post of the week — ready for your stories.' : 'Una tarjeta con tu mejor posteo de la semana, lista para tus historias.'}</p>
    <div id="anaRefLine"></div>
  </div>`;
}

async function anaWireShareBlock() {
  const slot = document.getElementById('anaRefLine');
  if (!slot || typeof pzVisibility !== 'function') return;
  try {
    const st = await pzVisibility();
    if (!st || !st.ok || !st.prompts || !st.prompts.ref_letter || !st.prompts.ref_letter.show) return;
    const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
    if (st.referral && st.referral.thanks) {
      slot.innerHTML = (typeof pzRefThanksHTML === 'function') ? pzRefThanksHTML(en) : '';
    } else {
      slot.innerHTML = (typeof celebRefHTML === 'function') ? celebRefHTML() : '';
      if (typeof wireCelebRef === 'function') wireCelebRef(slot);
    }
    api.post('/api/visibility/shown', { surface: 'ref_letter' }).catch(() => {});
    if (typeof PZ_VIS_PROMISE !== 'undefined') PZ_VIS_PROMISE = null;
  } catch (e) {}
}

function anaLoadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function anaDrawCover(x, img, dx, dy, dw, dh) {
  const s = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
  const sw = dw / s, sh = dh / s;
  x.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, dx, dy, dw, dh);
}
function anaWrap(x, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
    else cur = t;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const total = words.join(' ').length;
  const used = lines.join(' ').length;
  if (used < total && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…]*$/, '') + '…';
  return lines;
}
function anaLum(hex) {
  const n = parseInt(String(hex || '').slice(1), 16);
  if (isNaN(n)) return 0.3;
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

async function anaShareWeek(btn) {
  const a = anaLastPayload && anaLastPayload.analysis;
  const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
  if (!a || !a.letter) return;
  const items = Array.isArray(a.letter.body) ? a.letter.body : [];
  const prideIt = items.find((it) => it && it.t === 'p' && it.text);
  const photoIt = items.find((it) => it && it.t === 'photo' && it.src);
  const handle = (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.ig_username) ? String(PROFILE.ig_username).replace(/^@/, '') : '';
  if (!prideIt || !handle) { if (typeof toast === 'function') toast(en ? 'There is no week to share yet' : 'Todavía no hay una semana para compartir'); return; }
  if (btn) btn.disabled = true;
  try {
    const W = 1080, H = 1920;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    let cols = [];
    try { cols = JSON.parse((typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.brand_colors) || '[]'); } catch (e) {}
    cols = (Array.isArray(cols) ? cols : []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
    const primary = cols[0] || '#2793C8';
    const accent = cols[1] || '#FEC14D';
    const inkOnPrimary = anaLum(primary) > 0.62 ? '#0A1E33' : '#FFFFFF';
    const subOnPrimary = inkOnPrimary === '#FFFFFF' ? 'rgba(255,255,255,.85)' : 'rgba(10,30,51,.72)';
    let photo = null;
    if (photoIt) { try { photo = await anaLoadImg(photoIt.src); } catch (e) { photo = null; } }
    let baseY;
    if (photo) {
      anaDrawCover(x, photo, 0, 0, W, 1300);
      x.fillStyle = primary; x.fillRect(0, 1300, W, H - 1300);
      baseY = 1445;
    } else {
      x.fillStyle = primary; x.fillRect(0, 0, W, H);
      let av = null;
      try { av = await anaLoadImg('ai-avatar.png'); } catch (e) {}
      if (av) {
        x.save(); x.beginPath(); x.arc(W / 2, 545, 245, 0, Math.PI * 2); x.clip();
        anaDrawCover(x, av, W / 2 - 245, 300, 490, 490); x.restore();
        x.lineWidth = 10; x.strokeStyle = accent; x.beginPath(); x.arc(W / 2, 545, 245, 0, Math.PI * 2); x.stroke();
      }
      baseY = 990;
    }
    x.textAlign = 'center';
    x.fillStyle = accent;
    x.font = '800 40px system-ui, Arial, sans-serif';
    x.fillText(en ? 'MY WEEK 💙' : 'MI SEMANA 💙', W / 2, baseY);
    x.fillStyle = inkOnPrimary;
    let hSize = 86;
    x.font = '900 ' + hSize + 'px system-ui, Arial, sans-serif';
    while (x.measureText('@' + handle).width > W - 150 && hSize > 40) { hSize -= 6; x.font = '900 ' + hSize + 'px system-ui, Arial, sans-serif'; }
    x.fillText('@' + handle, W / 2, baseY + 112);
    x.font = '600 46px system-ui, Arial, sans-serif';
    anaWrap(x, String(prideIt.text), W - 180, 3).forEach((ln, i) => x.fillText(ln, W / 2, baseY + 196 + i * 60));
    x.fillStyle = subOnPrimary;
    x.font = '600 34px system-ui, Arial, sans-serif';
    x.fillText(en ? 'with @postycommunitymanager' : 'con @posty.communitymanager', W / 2, H - 84);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    if (!blob) throw new Error('sin blob');
    const file = new File([blob], 'mi-semana-posty.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: en ? 'My week' : 'Mi semana' });
    } else {
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a');
      aEl.href = url; aEl.download = 'mi-semana-posty.png';
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (typeof toast === 'function') toast(en ? '✅ Card downloaded — share it wherever you like' : '✅ Tarjeta descargada — compartila donde quieras');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (typeof toast === 'function') toast(en ? 'I could not build the card — try again in a bit' : 'No pude armar la tarjeta — probá en un ratito');
  } finally { if (btn) btn.disabled = false; }
}

/* ---------- LOTE ESTRATEGIA-APRENDE (2026-11-02): «Posty aprendió» ----------
 * UNA frase real de aprendizaje debajo de la carta (fuera de su texto: el
 * formato de la carta es cerrado, nada entra en ella). La frase viene del
 * servidor en d.aprendizaje (registro real de semana-aprende, filtrado por
 * user_id); sin frase no se dibuja nada, y en cartas anteriores tampoco
 * (el aprendizaje es de la semana actual, no de la carta vieja). */
function anaAprendeHTML(d) {
  if (typeof anaPastMode !== 'undefined' && anaPastMode) return '';
  const f = d && typeof d.aprendizaje === 'string' ? d.aprendizaje.trim() : '';
  if (!f) return '';
  return `<p class="ana-aprende"><b>${anaT('Posty aprendió', 'Posty learned')}</b>: ${esc(f)}</p>`;
}

/* ---------- La carta completa ---------- */

// (CARTA-PERSONALIZADA 3/11) Saludo de apertura de la carta ACTUAL.
// Devuelve el saludo con nombre ("Hola, {nombre}:" / "Hi, {name}:") o ''.
// Orden de fuentes, todas reales, nunca inventadas:
//   1) letter.greeting guardado, si ya trae nombre (formato del motor);
//   2) PROFILE.business_name (anaCtx) si el saludo guardado es pelado
//      ("Hola:") o falta — cubre cartas generadas sin nombre;
//   3) '' si no hay nombre en ningún lado: la carta abre como hoy.
// Cartas viejas: anaPastMode=true -> '' (su saludo queda en el cuerpo).
function anaSaludoTop(a, carta) {
  if (!carta) return '';
  try { if (typeof anaPastMode !== 'undefined' && anaPastMode) return ''; } catch (e) { return ''; }
  const g = String((a && a.letter && a.letter.greeting) || '').trim();
  const m = g.match(/^(Hola|Hi), (.+):$/);
  if (m && m[2]) return g;
  const ctx = anaCtx();
  if (ctx.biz) return anaT('Hola, ' + ctx.biz + ':', 'Hi, ' + ctx.biz + ':');
  return '';
}

function anaCartaHTML(d) {
  const a = (d && d.analysis) || null;
  anaSetLang(a);
  const birth = !a || a.kind === 'nacimiento';
  const ctx = anaCtx();
  const stage = birth ? 'starter' : anaStage(a);
  const bizLine = [ctx.biz, ctx.handle ? '@' + ctx.handle : ''].filter(Boolean).join(' · ');
  const dateLine = anaDateLine(a);
  const nextLine = (!birth && a && !anaPastMode) ? anaProximoAnalisisHTML(a) : '';
  const carta = anaHasLetter(a);
  const saludoTop = anaSaludoTop(a, carta);
  const title = carta && a.letter.title ? a.letter.title : anaT('Tu estrategia', 'Your strategy');
  const intro = !a
    ? anaT('Todavía no tengo tu radiografía — y no te voy a inventar una. Esto es lo que armo para tu cuenta desde tu rubro, tu zona y tu negocio' + pzIc('arrowDown', 13) + '', 'I do not have your full picture yet — and I will not make one up. This is what I build for your account from your category, your area and your business' + pzIc('arrowDown', 13) + '')
    : (birth
      ? anaT('Tu cuenta está por nacer — y va a nacer con estrategia. Estudié tu rubro y tu zona, y esto es lo que armé para vos' + pzIc('arrowDown', 13) + '', 'Your account is about to be born — and it will be born with a strategy. I studied your category and your area, and this is what I built for you' + pzIc('arrowDown', 13) + '')
      : anaT('Estudié tu cuenta dato por dato — tu ritmo, tus formatos, tus textos — y armé el plan con el que lo mejoro. Esto es lo que vi' + pzIc('arrowDown', 13) + '', 'I studied your account data point by data point — your rhythm, your formats, your texts — and built the plan I improve it with. This is what I saw' + pzIc('arrowDown', 13) + ''));
  const wsOpen = d && typeof d.week_summary === 'string' ? d.week_summary.trim() : '';
  const manoCls = anaPastMode ? '' : ' ana-carta-mano';
  let h = `<div class="ana-card ana-letter${manoCls}">
    <div class="ana-lhead">
      <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
      <h3 class="ana-title">${esc(title)}</h3>
      ${bizLine ? `<p class="ana-biz">${esc(bizLine)}</p>` : ''}
      ${dateLine ? `<p class="ana-date">${esc(dateLine)}</p>` : ''}
      ${nextLine ? `<p class="ana-next">${esc(nextLine)}</p>` : ''}
      ${carta ? '' : (wsOpen ? '' : `<p class="ana-intro">${intro}</p>`)}
    </div>
    <div id="anaWeekNums"></div>`;
  // (CARTA-PERSONALIZADA 3/11) Primera línea del cuerpo de la carta
  // ACTUAL: el nombre del cliente, tras la tira de números y antes de
  // ana-ltr-first, del week_summary y de los 3 bloques de carta-corta.
  // Sin nombre, nada.
  if (saludoTop) h += `<p class="ana-ltr-p ana-ltr-greet">${esc(saludoTop)}</p>`;
  // (LOTE 15 · carta Estrategia) Primera línea SIEMPRE que haya un
  // análisis (con carta guardada y sin ella): la frase exacta, en el
  // idioma de la carta, una sola vez. Sin análisis no hay línea.
  if (a) h += `<p class="ana-ltr-first">${anaT('la estrategia para esta semana', 'the strategy for this week')}</p>`;
  // (LOTE CEREBRO-CM) Tema de la semana actual, solo en la carta actual
  // (nunca en cartas viejas) y solo si hay semana guardada. Sin tema,
  // la carta sale como siempre.
  if (!anaPastMode && d && d.temaSemana) h += `<p class="ana-tema">${anaT('Esta semana: ', 'This week: ')}${esc(String(d.temaSemana))}</p>`;
  // (2026-10-25) APERTURA: la explicación de cómo se armó el plan — el
  // week_summary del motor («qué vi → por eso tu semana es así») — encabeza
  // la ventana como su línea de apertura. Es el contenido que vivía en la
  // tarjeta «Lo que vi de tu cuenta» de la Agenda, eliminada por Valentino
  // (la pantalla principal no lleva resúmenes de Análisis). El texto viene
  // del motor en el idioma de la cuenta (paridad ES/EN sin croma nueva) y
  // «Así nace tu semana» ya no lo repite. Sin week_summary no se inventa
  // apertura: la ventana abre como siempre.
  if (wsOpen) h += wsOpen.split('\n').filter(Boolean).map((l) => `<p class="ana-intro">${esc(l)}</p>`).join('');
  if (carta) {
    // FORMA CARTA (domingo a la noche): narración primero, datos como apoyo.
    // CARTA MÍNIMA (v2): la carta ES la superficie — kit/mercado/historial
    // no se agregan debajo (el análisis completo sigue en el payload y en
    // las vistas sin carta; las cartas v1 conservan su forma con apoyo).
    const minimal = !!(a.letter && (a.letter.v >= 2 || a.letter.minimal));
    h += anaLetterBodyHTML(a, { saludoTop: !!saludoTop });
    if (minimal) {
      h += `<div style="text-align:center;margin:14px 0 4px"><button class="btn btn-ghost" id="anaFullBtn" onclick="anaToggleFull(this)">${anaT('Ver mi estrategia completa', 'See my full strategy') + ' ' + pzIc('arrowRight', 13)}</button></div><div id="anaFull" style="display:none">${anaFullHTML(d, a, birth)}</div>`;
    }
    if (!minimal && birth) h += anaKitHTML(a);
    if (!minimal && !birth) h += anaMarketHTML(a);
    if (!minimal) h += anaHistoryHTML(d, a);
    if (!minimal && Array.isArray(a.data_notes) && a.data_notes.length) {
      h += a.data_notes.map((n) => `<p class="ana-note">${esc(n)}</p>`).join('');
    }
    h += `<div class="ana-banner">${esc(a.letter.closing || anaBanner(stage, ctx))}</div>`;
    h += anaSignHTML(birth);
    if (!anaPastMode) h += anaShareBlockHTML(a);
    if (!anaPastMode) h += `<div class="ana-refresh"><button class="btn btn-ghost btn-sm" onclick="anaRefresh(this)">${anaT('↻ Actualizar estrategia', '↻ Refresh strategy')}</button></div>`;
    // (FUNDAMENTO-LITERAL · pieza 4) Confirmación semanal, solo carta
    // actual (nunca en cartas viejas): un toque «Sigue igual» o editar
    // un producto. No suma fricción a la aprobación: si no se toca, la
    // semana se arma con el fundamento vigente. Se carga bajo demanda.
    if (!anaPastMode) h += `<div class="ana-fl-confirm" style="margin-top:12px;text-align:center"><button class="btn btn-ghost btn-sm" onclick="anaFlConfirmLoad(this)">${anaT('¿Qué vendés esta semana?', 'What are you selling this week?')}</button><div id="anaFlBox" style="display:none;text-align:left;margin-top:10px"></div></div>`;
    h += anaAprendeHTML(d);
    h += `</div>`;
    h += `<div id="anaBoostRec"></div>`;
    return h;
  }
  if (!birth) h += `<div class="ana-verdict"><p class="ana-vlabel">${anaT('Mi veredicto', 'My verdict')}</p><p class="ana-vq">${esc(anaVerdict(a, stage, birth))}</p></div>`;
  if (!a) {
    h += `<div style="text-align:center;margin-top:16px"><button class="btn btn-primary" onclick="anaRefresh(this)">${anaT('Armar mi estrategia', 'Build my strategy')}</button></div>`;
  }
  if (!birth) h += anaProgressHTML(a);
  if (!birth) h += anaStatsHTML(a, d);
  if (!birth) h += anaGroupsHTML(a);
  if (birth && a) {
    const wsDecs = (a && Array.isArray(a.findings) ? a.findings.filter((f) => f && f.decision).slice(0, 2).map((f) => String(f.decision)) : []);
    h += anaKitHTML(a, wsOpen ? [wsOpen].concat(wsDecs) : wsDecs);
  }
  if (!birth) h += anaMarketHTML(a);
  if (a) h += anaWeekBirthHTML(d, a);
  h += anaPlanHTML(a, birth);
  if (!birth) h += anaLoopHTML(a);
  h += anaHistoryHTML(d, a);
  if (a && Array.isArray(a.data_notes) && a.data_notes.length) {
    h += a.data_notes.map((n) => `<p class="ana-note">${esc(n)}</p>`).join('');
  }
  h += `<div class="ana-banner">${esc(anaBanner(stage, ctx))}</div>`;
  h += anaSignHTML(birth);
  if (!anaPastMode) h += `<div class="ana-refresh"><button class="btn btn-ghost btn-sm" onclick="anaRefresh(this)">${anaT('↻ Actualizar estrategia', '↻ Refresh strategy')}</button></div>`;
  h += anaAprendeHTML(d);
  h += `</div>`;
  h += `<div id="anaBoostRec"></div>`;
  return h;
}

/* ---------- LOTE IMPULSAR EN ESTRATEGIA: mejor posteo + impulso ---------- */
/* La carta recomienda el mejor posteo de LA SEMANA por dato real de IG
 * (GET /api/estrategia/mejor-posteo) y ofrece impulsarlo con los 3 montos
 * fijos del Impulsar ($20/$50/$100, 7 días) por /api/destacado/impulsar.
 * Reglas: sin dato = sin recomendación inventada; el cobro lo decide el
 * servidor (gates intactos: flag, conversión pendiente, sin reembolso
 * automático); solo se muestra éxito con ok:true. En cartas anteriores
 * (anaPastMode) no se muestra: la recomendación es de la carta actual. */

function anaBoostRecPartes(m) {
  const p = [];
  if (Number(m.likes || 0) > 0) p.push(anaT(Number(m.likes) + ' me gusta', Number(m.likes) + ' likes'));
  if (Number(m.comments || 0) > 0) p.push(anaT(Number(m.comments) + ' comentarios', Number(m.comments) + ' comments'));
  if (Number(m.saved || 0) > 0) p.push(anaT(Number(m.saved) + ' guardados', Number(m.saved) + ' saves'));
  if (Number(m.reach || 0) > 0) p.push(anaT('alcance ' + Number(m.reach), 'reach ' + Number(m.reach)));
  return p;
}

function anaBoostRecMotivo(motivo, monto, cobroId) {
  const m = monto ? ('$' + monto) : '';
  switch (motivo) {
    case 'conversion_pendiente':
      return anaT('Queda armado: ' + m + ' por 7 días para este posteo. Todavía no se puede cobrar porque falta definir la conversión USD→ARS. No se cobró nada.', "Armed and waiting: " + m + " for 7 days on this post. It can't be charged yet because the USD→ARS conversion isn't set. Nothing was charged.");
    case 'boost_deshabilitado':
      return anaT('El impulso todavía no está habilitado en tu cuenta.', "Boosting isn't enabled on your account yet.");
    case 'sin_tarjeta_guardada':
      return anaT('No tenés una tarjeta guardada para cobrar el impulso.', "You don't have a saved card to charge the boost.");
    case 'cobro_requiere_accion':
      return anaT('El cobro necesita una confirmación tuya y no se puede hacer solo. No se cobró nada.', "The charge needs your confirmation and can't run on its own. Nothing was charged.");
    case 'cobro_fallido':
      return anaT('No se pudo cobrar. No se cobró nada.', "The charge failed. Nothing was charged.");
    case 'anuncio_fallido':
      return anaT('El cobro se hizo pero el anuncio no se pudo lanzar. Quedó registrado' + (cobroId ? ' (cobro ' + cobroId + ')' : '') + ' y sin reembolso automático: se revisa aparte.', "The charge went through but the ad couldn't launch. It was recorded" + (cobroId ? ' (charge ' + cobroId + ')' : '') + " with no automatic refund: it will be reviewed separately.");
    case 'sin_publicar':
      return anaT('Este posteo todavía no está publicado en Instagram.', "This post isn't published on Instagram yet.");
    case 'monto_invalido':
      return anaT('Ese monto no es válido. Elegí $20, $50 o $100.', "That amount isn't valid. Choose $20, $50 or $100.");
    default:
      return anaT('No se pudo impulsar. No se cobró nada.', "It couldn't be boosted. Nothing was charged.");
  }
}

function anaBoostRecHTML(d) {
  const m = d.mejor;
  const partes = anaBoostRecPartes(m);
  const porque = partes.length
    ? anaT('Fue tu posteo con más interacción esta semana: ', 'Your highest-engagement post this week: ') + partes.join(', ') + '.'
    : anaT('Fue tu posteo con más interacción esta semana.', 'Your highest-engagement post this week.');
  const img = m.image_path ? `<img src="${esc(m.image_path)}" alt="" class="ana-boostrec-img">` : '';
  const cap = m.caption ? `<p class="ana-boostrec-cap">${esc(m.caption)}</p>` : '';
  const boost = d.boostHabilitado
    ? `<div class="ana-boostrec-montos" id="anaBoostRecMontos">
        <p class="ana-boostrec-monto-t">${anaT('Impulsalo por 7 días:', 'Boost it for 7 days:')}</p>
        ${[20, 50, 100].map((x) => `<button type="button" class="btn btn-primary btn-sm" onclick="anaBoostRecElegir(${x})">$${x}</button>`).join(' ')}
      </div><div class="ana-boostrec-msg" id="anaBoostRecMsg"></div>`
    : `<p class="ana-boostrec-nota">${anaT('Impulsar todavía no está habilitado en tu cuenta.', "Boosting isn't enabled on your account yet.")}</p>`;
  return `<div class="ana-boostrec">
    <p class="ana-boostrec-sec">${anaT('Impulsar', 'Boost')}</p>
    <p class="ana-boostrec-saludo">${anaT('¡Hola! Te traigo una idea cortita:', 'Hi! A quick idea for you:')}</p>
    <p class="ana-boostrec-t">${anaT('Tu mejor posteo de la semana', 'Your best post this week')}</p>
    <div class="ana-boostrec-post">${img}<div>${cap}<p class="ana-boostrec-why">${esc(porque)}</p></div></div>
    ${boost}
    <p class="ana-boostrec-despedida">— Posty</p>
  </div>`;
}

function anaBoostRecElegir(monto) {
  const caja = document.getElementById('anaBoostRecMontos');
  const msg = document.getElementById('anaBoostRecMsg');
  if (!caja) return;
  caja.innerHTML = `<button type="button" class="btn btn-primary btn-sm" onclick="anaBoostRecConfirmar(${monto}, this)">${anaT('Confirmar $', 'Confirm $')}${monto}</button> <button type="button" class="btn btn-ghost btn-sm" onclick="anaBoostRecLoad()">${anaT('Cancelar', 'Cancel')}</button>`;
  if (msg) msg.textContent = '';
}

async function anaBoostRecConfirmar(monto, btn) {
  const box = document.getElementById('anaBoostRec');
  const msg = document.getElementById('anaBoostRecMsg');
  const postId = box ? Number(box.dataset.postId || 0) : 0;
  if (!postId) return;
  if (btn) btn.disabled = true;
  let j = null;
  try { j = await api.post('/api/destacado/impulsar', { montoUSD: monto, posteoId: postId }); } catch (e) { j = null; }
  if (!msg) return;
  if (j && j.ok) {
    msg.textContent = anaT('Impulsado. Posty te va a reportar números reales cuando lleguen.', 'Boosted. Posty will report real numbers when they arrive.');
    const caja = document.getElementById('anaBoostRecMontos');
    if (caja) caja.innerHTML = '';
  } else {
    const motivo = (j && j.motivo) || '';
    msg.textContent = anaBoostRecMotivo(motivo, monto, j && j.cobroId);
  }
  if (btn) btn.disabled = false;
}

async function anaBoostRecLoad() {
  const box = document.getElementById('anaBoostRec');
  if (!box || anaPastMode) return;
  let d = null;
  try { d = await api.get('/api/estrategia/mejor-posteo'); } catch (e) { d = null; }
  if (document.getElementById('anaBoostRec') !== box) return;
  if (!d || !d.ok) { box.innerHTML = ''; return; }
  if (!d.mejor) {
    box.innerHTML = '';
    return;
  }
  box.dataset.postId = String(d.mejor.post_id);
  box.innerHTML = anaBoostRecHTML(d);
}

// ---------- FUNDAMENTO-LITERAL x5 (3/11) · pieza 4: confirmacion semanal ----------
// Confirmacion de un toque junto a la carta actual: «Sigue igual» no
// cambia nada; editar cambia solo ese producto; no tocarla no inventa
// nada (la semana se arma con el fundamento vigente). Carga bajo demanda
// para no sumar peso a la carta.
function anaFlConfirmLoad(btn) {
  const box = document.getElementById('anaFlBox');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<p class="ana-note">' + anaT('Cargando tu lista…', 'Loading your list…') + '</p>';
  fetch('/api/fundamento/semana-confirm').then((r) => r.json()).then((d) => {
    if (!d || !d.ok) throw new Error('no');
    anaFlConfirmRender(d);
  }).catch(() => { box.innerHTML = '<p class="ana-note">' + anaT('No pudimos cargar tu lista ahora.', 'We could not load your list right now.') + '</p>'; });
}
function anaFlConfirmRender(d) {
  const box = document.getElementById('anaFlBox');
  if (!box) return;
  const list = (d.productos || []).map((p) => '<span style="display:inline-block;margin:2px 4px 2px 0;padding:6px 10px;background:#fff;border:1px solid #DCEFFF;border-radius:999px;font-size:14px;font-weight:700;color:#0A1E33">' + esc(p.nombre) + '</span>').join('');
  // (FUNDAMENTO-LITERAL · pieza 5) Los vetos se ven y se pueden quitar
  // desde este mismo lugar (revocable, como pide el lote).
  const vetos = (d.vetos || []).map((v) => '<span style="display:inline-block;margin:2px 4px 2px 0;padding:6px 10px;background:#FDF0F0;border:1px solid #F3C6C6;border-radius:999px;font-size:14px;font-weight:700;color:#8B2E2E">' + esc(v) + ' <button type="button" onclick="anaFlQuitarVeto(this)" data-veto="' + esc(v) + '" style="border:0;background:none;color:#8B2E2E;font-weight:800;cursor:pointer">✕</button></span>').join('');
  // (RUBRO-GARANTÍAS ×6 · pieza 4) Las hipótesis se ven y se confirman
  // con un toque: una sola fuente no-cliente no genera en silencio;
  // la palabra del cliente acá las convierte en productos.
  const hips = (d.hipotesis || []).map((h) => '<span style="display:inline-block;margin:2px 4px 2px 0;padding:6px 10px;background:#FFF8E1;border:1px solid #F3D27A;border-radius:999px;font-size:14px;font-weight:700;color:#0A1E33">' + esc(h.nombre) + ' <span style="font-weight:400;color:#47617A">(' + esc((h.fuentes || []).join(' + ')) + ')</span> <button type="button" onclick="anaFlConfirmarHipotesis(this)" data-hip="' + esc(h.nombre) + '" style="border:0;background:none;color:#0A7A3D;font-weight:800;cursor:pointer">' + anaT('Confirmar', 'Confirm') + '</button></span>').join('');
  box.innerHTML = '<p class="ana-note">' + anaT('Esto es lo que tengo como lo que vendés. Si sigue igual, un toque y listo.', 'This is what I have as what you sell. If it is still the same, one tap and done.') + '</p>'
    + '<div>' + (list || anaT('Sin productos todavía.', 'No products yet.')) + '</div>'
    + (hips ? '<p class="ana-note" style="margin-top:10px">' + anaT('¿Esto también lo vendés? Lo vi en una sola fuente, confirmalo para usarlo:', 'Do you also sell this? I saw it in one source only — confirm it to use it:') + '</p><div>' + hips + '</div>' : '')
    + (vetos ? '<p class="ana-note" style="margin-top:10px">' + anaT('Vetado (nunca se genera):', 'Banned (never generated):') + '</p><div>' + vetos + '</div>' : '')
    + '<div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="anaFlSeguir(this)">' + anaT('Sigue igual', 'Still the same') + '</button></div>'
    + '<div style="margin-top:10px"><input id="anaFlEdit" class="oc-field" style="font-size:15px;padding:10px 12px" placeholder="' + anaT('Escribí un producto nuevo o uno corregido', 'Write a new or corrected product') + '"><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="anaFlEditar(this)">' + anaT('Guardar cambio', 'Save change') + '</button></div>'
    + '<p id="anaFlMsg" class="ana-note" style="display:none"></p>';
}
function anaFlSeguir(btn) {
  fetch('/api/fundamento/semana-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seguir: true }) }).then((r) => r.json()).then(() => {
    const m = document.getElementById('anaFlMsg');
    if (m) { m.style.display = 'block'; m.textContent = anaT('Listo, sigue igual. Tu semana se arma con esto.', 'Done, still the same. Your week is built from this.'); }
  });
}
function anaFlEditar(btn) {
  const v = (document.getElementById('anaFlEdit') || {}).value || '';
  if (!v.trim()) return;
  fetch('/api/fundamento/semana-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: v }) }).then((r) => r.json()).then((d) => {
    if (d && d.ok) anaFlConfirmRender(d);
  });
}
function anaFlQuitarVeto(btn) {
  const t = (btn && btn.getAttribute('data-veto')) || '';
  if (!t) return;
  fetch('/api/fundamento/veto', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ termino: t }) }).then((r) => r.json()).then((d) => {
    if (d && d.ok) anaFlConfirmLoad();
  });
}
function anaFlConfirmarHipotesis(btn) {
  const t = (btn && btn.getAttribute('data-hip')) || '';
  if (!t) return;
  fetch('/api/fundamento/hipotesis/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: t }) }).then((r) => r.json()).then((d) => {
    if (d && d.ok) anaFlConfirmLoad();
  });
}

/* ---------- ESTRATEGIA-MAGIA (2/11, decisión Valentino): destellos de entrada
   en la carta de Estrategia. Regla permanente de magia: estrella de 4 puntas
   dorada #FEC14D y celeste #2793C8, estelas suaves; nunca puntos ni polvo;
   solo Posty tiene magia. Solo en la entrada: una animación que se desvanece
   sola, sin bloquear toques ni tapar texto, sin repetirse mientras la carta
   está abierta; prefers-reduced-motion la anula. Solo la carta actual
   (anaLoad): las cartas anteriores (anaOpenPast) no la llevan. ---------- */
function anaMagiaEntrada() {
  try {
    if (typeof document === 'undefined') return;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var head = document.querySelector('.ana-lhead');
    if (!head) return;
    if (head.querySelector('.ana-magia-entrada')) return; /* ya está: no se repite */
    var box = document.createElement('span');
    box.className = 'ana-magia-entrada';
    box.setAttribute('aria-hidden', 'true');
    var cols = ['#FEC14D', '#2793C8', '#FEC14D', '#2793C8', '#FEC14D'];
    var glow = ['rgba(254,193,77,.65)', 'rgba(39,147,200,.65)', 'rgba(254,193,77,.65)', 'rgba(39,147,200,.65)', 'rgba(254,193,77,.65)'];
    for (var i = 0; i < 5; i++) {
      var s = document.createElement('i');
      s.className = 'ana-mg-' + (i + 1);
      s.style.background = cols[i];
      s.style.filter = 'drop-shadow(0 0 6px ' + glow[i] + ')';
      s.style.animationDelay = (i * 0.18) + 's';
      box.appendChild(s);
    }
    head.appendChild(box);
    setTimeout(function () { try { box.remove(); } catch (e) {} }, 3000);
  } catch (e) {}
}

/* ---------- LOTE ESTRATEGIA-NÚMEROS: la semana en números grandes ----------
 * Fila encima de la carta con 3 números REALES de los últimos 7 días.
 * Fuentes preexistentes, sin cambios de servidor:
 *  - GET /api/stats/ig (stats.js buildSummary, desde post_metrics):
 *      posts_7d = publicados CON métricas en los últimos 7 días,
 *      reach_7d = alcance sumado de esa misma cohorte.
 *  - GET /api/posts (filas con likes de post_metrics):
 *      Likes = suma de likes de los publicados en los últimos 7 días
 *      que TENGAN likes no nulo (sin métrica todavía = sin dato, no 0).
 * REGLA DE VERDAD: un número sin dato real NO se dibuja (nunca un 0
 * inventado). Por eso los números de /api/stats/ig solo se dibujan si son
 * > 0 (un 0 ahí no distingue "sin posteos" de "posteos sin métricas") y
 * Likes solo si al menos un posteo publicado en la ventana trae likes.
 * Sin los 3 números, la fila no existe: Estrategia queda como hoy.
 * En cartas anteriores (anaPastMode) no se muestra, igual que Impulsar. */
function anaWeekNumsTiles(st, posts) {
  const tiles = [];
  const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');
  if (st && Number(st.posts_7d) > 0) tiles.push({ n: fmt(st.posts_7d), l: anaT('Posteos', 'Posts') });
  if (st && Number(st.reach_7d) > 0) tiles.push({ n: fmt(st.reach_7d), l: anaT('Alcance', 'Reach') });
  const list = Array.isArray(posts) ? posts : [];
  const cut = Date.now() - 7 * 86400000;
  let likesSum = 0, likesSeen = false;
  list.forEach((p) => {
    if (!p || p.status !== 'published') return;
    const at = Date.parse(p.published_at || p.created_at || '');
    if (!Number.isFinite(at) || at < cut) return;
    if (p.likes == null || p.likes === '') return;
    likesSeen = true;
    likesSum += Number(p.likes) || 0;
  });
  if (likesSeen) tiles.push({ n: fmt(likesSum), l: anaT('Likes', 'Likes') });
  // Orden del encargo: Posteos, Likes, Alcance.
  const order = { Posteos: 0, Posts: 0, Likes: 1, Alcance: 2, Reach: 2 };
  tiles.sort((a, b) => (order[a.l] ?? 9) - (order[b.l] ?? 9));
  return tiles;
}

async function anaWeekNumsLoad() {
  const box = document.getElementById('anaWeekNums');
  if (!box || anaPastMode) return;
  let st = null, posts = null;
  try { st = await api.get('/api/stats/ig'); } catch (e) { st = null; }
  try { posts = await api.get('/api/posts'); } catch (e) { posts = null; }
  if (document.getElementById('anaWeekNums') !== box) return;
  const tiles = anaWeekNumsTiles(st, posts);
  box.innerHTML = tiles.length
    ? `<div class="ana-weeknums">${tiles.map((t) => `<div class="ana-weeknum"><b>${esc(t.n)}</b><span>${esc(t.l)}</span></div>`).join('')}</div>`
    : '';
}

/* ---------- LOTE ESTRATEGIA-PRÓXIMO-PASO: una sola tarjeta ---------- */
/* Prioridad determinista sobre el estado real, nunca inventada:
 * (1) pendientes de aprobar en la semana actual -> "Aprobá tu semana"
 *     (lleva al feed, donde se aprueba); (2) sin pendientes pero con un
 *     mejor posteo real -> "Impulsá tu mejor posteo" (hace scroll a la
 *     tarjeta Impulsar que ya existe, NUNCA crea un segundo botón de
 *     cobro); (3) sin pendientes ni mejor posteo -> sin tarjeta.
 * Pendiente = programado pendiente de la semana actual (mismo criterio
 * que pzAcceptAllWeekCands) + borrador de la semana actual (mismo
 * criterio que el filtro de borradores en revisión). Sin mondayKey o
 * sin lista de posteos: fail-closed, sin tarjeta. */

function anaNextStepPendientes(posts, mondayKey) {
  if (!Array.isArray(posts) || !mondayKey) return 0;
  let n = 0;
  for (const p of posts) {
    if (!p) continue;
    const st = String(p.status || '');
    if (st === 'scheduled') {
      if (String(p.approval || 'pending') !== 'pending') continue;
      if (String(p.week_key || '') !== mondayKey) continue;
      n++;
    } else if (st === 'draft') {
      const wk = String(p.week_key || '');
      if (wk && wk !== mondayKey) continue;
      if (String(p.approval || '') === 'approved') continue;
      n++;
    }
  }
  return n;
}

function anaNextStepElegir(pendientes, tieneMejor) {
  if (Number(pendientes || 0) > 0) return 'aprobar';
  if (tieneMejor) return 'impulsar';
  return null;
}

function anaNextStepHTML(paso) {
  const ap = paso === 'aprobar';
  const titulo = anaT('Próximo paso', 'Next step');
  const texto = ap
    ? anaT('Tenés posteos de esta semana esperando tu aprobación.', 'You have posts from this week waiting for your approval.')
    : anaT('Tu mejor posteo de la semana está listo para llegar a más gente.', 'Your best post this week is ready to reach more people.');
  const btn = ap
    ? anaT('Aprobá tu semana', 'Approve your week')
    : anaT('Impulsá tu mejor posteo', 'Boost your best post');
  const fn = ap ? 'anaNextStepIrInicio()' : 'anaNextStepIrImpulsar()';
  return `<div class="ana-card ana-nextstep"><p class="ana-nextstep-t">${titulo}</p><p class="ana-nextstep-p">${esc(texto)}</p><button type="button" class="btn btn-primary" onclick="${fn}">${esc(btn)}</button></div>`;
}

function anaNextStepIrInicio() {
  try { location.hash = '#/app/inicio'; } catch (e) {}
}

function anaNextStepIrImpulsar() {
  try {
    const box = document.getElementById('anaBoostRec');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {}
}

function anaNextStepMount() {
  try {
    const rootEl = document.getElementById('anaRoot');
    if (!rootEl || document.getElementById('anaNextStep')) return;
    rootEl.insertAdjacentHTML('afterbegin', '<div id="anaNextStep"></div>');
    anaNextStepLoad();
  } catch (e) {}
}

async function anaNextStepLoad() {
  try {
    const box = document.getElementById('anaNextStep');
    if (!box || anaPastMode) return;
    let posts = null;
    try { posts = await api.get('/api/posts'); } catch (e) { posts = null; }
    if (document.getElementById('anaNextStep') !== box) return;
    if (!Array.isArray(posts)) return; // fail-closed: sin lista no se afirma nada
    const wk = (typeof albumMondayKey === 'function') ? albumMondayKey() : '';
    if (!wk) return;
    const pendientes = anaNextStepPendientes(posts, wk);
    if (pendientes > 0) { box.innerHTML = anaNextStepHTML('aprobar'); return; }
    let mejor = null;
    try { const d = await api.get('/api/estrategia/mejor-posteo'); mejor = (d && d.ok && d.mejor) ? d.mejor : null; } catch (e) { mejor = null; }
    if (document.getElementById('anaNextStep') !== box) return;
    const paso = anaNextStepElegir(0, !!mejor);
    box.innerHTML = paso ? anaNextStepHTML(paso) : '';
  } catch (e) {}
}
