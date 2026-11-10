/* chunk-analisis.js — Lazy chunk de Posty: la pantalla "Tu análisis" (LA CARTA v3).
 * Se carga bajo demanda vía loadChunk('analisis') desde app.js (router: tab 'analisis';
 * el menú y el link de Schedule ya apuntan a #/app/analisis).
 * Es un <script> clásico: comparte el scope global con app.js; las funciones declaradas
 * acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA (la de todos los chunks): no agregar top-level let/const/var con nombres que ya
 * existan en app.js u otro chunk — por eso TODO acá lleva prefijo ana.
 *
 * analisisView() devuelve la cáscara con un loading amable; bindAnalisis() pide
 * GET /api/analysis y pinta la carta; anaRefresh() intenta POST
 * /api/analysis/refresh (BLOQUEADO desde ESTRATEGIA-SEMANAL: 410) y cae a GET.
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
  /* SACAR-PROXIMO-PASO 4/11: esta tarjeta ya no se monta en Estrategia. */
  anaBoostRecLoad();
  anaRestudioLoad();
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
    return anaT('De tu lado: <b>nada</b> — yo arranco. Tu semana ya está armada con este plan: la ves en ', 'On your side: <b>nothing</b> — I take it from here. Your week is already built with this plan: see it in ') + `<a href="#/app/schedule" style="color:inherit;text-decoration:underline">${anaT('tu agenda', 'your Schedule')}</a>`;
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
    /* SACAR-PROXIMO-PASO 4/11: esta tarjeta ya no se monta en Estrategia. */
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

/* CARTA-LIDER (decisión Valentino 3/11, SUPERSEDE carta-corta 2/11): la
 * carta mínima es de un LÍDER MOTIVACIONAL en 2 secciones de cuerpo +
 * cierre con agradecimiento (el banner, desde el motor): 1) Felicitaciones
 * — UN avance real (el festejo del motor, nunca inventado; sin festejo no
 * hay sección, nunca una felicitación fingida) · 2) Qué mejoramos y en qué
 * trabajamos — la línea honesta (qué mejorar, con su arreglo en marcha) +
 * las acciones (pasos claros) + el De tu lado. Partición POR KIND (el motor
 * los emite); kind desconocido o sin kind cae por posición (pre-acciones →
 * 1, resto → 2) para no perder NUNCA contenido. Sin acciones: forma plana
 * de siempre, sin secciones vacías (precedente carta-corta). El saludo del
 * cuerpo se suprime cuando opts.saludoTop (carta-personalizada: la carta
 * actual ya lo rinde arriba). Sin botón de audio (estrategia-sin-audio
 * v565). ~10 líneas: nada más se renderiza en esta vista. Las cartas v1
 * guardadas conservan su forma vieja. */
function anaLetterMinimalHTML(a, opts) {
  const L = a.letter;
  const items = Array.isArray(L.body) ? L.body : [];
  const render = (it) => {
    if (!it) return '';
    if (it.t === 'photo' && it.src) {
      /* CARTA-SIN-IMAGEN 4/11 (corrección Valentino): la foto del cuerpo
         NO se rinde en la carta mínima — solo texto. El payload la sigue
         trayendo (la usa la portada para compartir); acá no se dibuja. */
      return '';
    } else if (it.t === 'action') {
      return `<div class="ana-ltr-plan"><p>• ${esc(it.text || '')}</p></div>`;
    } else if (it.t === 'p') {
      return `<p class="ana-ltr-p">${esc(it.text || '')}</p>`;
    }
    return '';
  };
  const actionIdx = [];
  items.forEach((it, i) => { if (it && it.t === 'action') actionIdx.push(i); });
  if (!actionIdx.length) {
    // Carta degenerada (sin acciones): forma plana de siempre, sin audio y
    // sin secciones vacías; nunca se muestra una sección vacía.
    let h = '';
    if (L.greeting && !(opts && opts.saludoTop)) h += `<p class="ana-ltr-p ana-ltr-greet">${esc(String(L.greeting).replace(/\.+:/g, ':'))}</p>`;
    items.forEach((it) => { h += render(it); });
    return h;
  }
  const first = actionIdx[0];
  // Bucket por kind; la foto va con la felicitación (así la emite el
  // motor: tras el saludo, junto al festejo). La sección 1 existe si
  // tiene contenido: con kinds del motor, sin festejo queda vacía (la
  // honesta va a la 2) y no se rinde — nunca una felicitación fingida.
  // El saludo — si no lo suprime saludoTop — abre la sección 1 si existe
  // y si no, la 2: un saludo no es una felicitación.
  // (CARTA-DEDUP) Partición en entradas primero, para poder ordenar y
  // dedupar antes de renderizar: 1) en la sección 1 el festejo abre
  // (foto + festejo estables primero, resto después) — orden aprobado
  // 3/11: felicitar primero; 2) un paso (action) que re-enuncia lo que
  // la honesta ya dice (contenido textual o solape ≥0.8) no se lista —
  // cada mejora se enuncia UNA sola vez; si no queda ningún paso, el
  // encabezado «Esta semana hago esto:» tampoco se rinde.
  const normD = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const stopD = new Set('de la el en y a los las un una que es por con su sus tu tus se al del lo hoy ya esta este eso the a an and of to in your you this that is it'.split(' '));
  const wD = (s) => normD(s).replace(/[^a-z0-9áéíóúñü ]/g, ' ').split(' ').filter((w) => w && !stopD.has(w));
  const ovD = (x, y) => { const A = new Set(wD(x)), B = new Set(wD(y)); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return n / new Set([...A, ...B]).size; };
  const celE = [], trabE = [];
  items.forEach((it, i) => {
    if (!it) return;
    const k = it.kind || '';
    let b = null;
    if (it.t === 'photo' || k === 'festejo') b = 'cel';
    else if (k === 'honesta' || k === 'acciones-head' || it.t === 'action' || k === 'pedido') b = 'trab';
    else b = i < first ? 'cel' : 'trab';
    (b === 'cel' ? celE : trabE).push(it);
  });
  const celOrd = celE.filter((it) => it.t === 'photo' || (it.kind || '') === 'festejo').concat(celE.filter((it) => !(it.t === 'photo' || (it.kind || '') === 'festejo')));
  let cel = celOrd.map(render).join('');
  const honestaTxt = trabE.filter((it) => (it.kind || '') === 'honesta').map((it) => it.text || '');
  let trabF = trabE.filter((it) => {
    if (it.t !== 'action') return true;
    const t = it.text || '';
    return !honestaTxt.some((hx) => { const nt = normD(t), nh = normD(hx); return (nh && (nh.indexOf(nt) !== -1 || nt.indexOf(nh) !== -1)) || ovD(t, hx) >= 0.8; });
  });
  if (!trabF.some((it) => it.t === 'action')) trabF = trabF.filter((it) => (it.kind || '') !== 'acciones-head');
  let trab = trabF.map(render).join('');
  const sec = (es, enS, inner) => `<section class="ana-ltr-sec"><p class="ana-sec-t">${anaT(es, enS)}</p>${inner}</section>`;
  let out = '';
  if (L.greeting && !(opts && opts.saludoTop)) {
    const g = `<p class="ana-ltr-p ana-ltr-greet">${esc(String(L.greeting).replace(/\.+:/g, ':'))}</p>`;
    if (cel) cel = g + cel; else trab = g + trab;
  }
  if (cel) out += sec('Felicitaciones', 'Congratulations', cel);
  if (trab) out += sec('Qué mejoramos y en qué trabajamos', 'What we improve and work on', trab);
  return out;
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
  if (L.greeting && !(opts && opts.saludoTop)) h += `<p class="ana-ltr-p ana-ltr-greet">${esc(String(L.greeting).replace(/\.+:/g, ':'))}</p>`;
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
    x.fillText(en ? 'MY WEEK' : 'MI SEMANA', W / 2, baseY);
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
      if (typeof toast === 'function') toast(en ? 'Card downloaded — share it wherever you like' : 'Tarjeta descargada — compartila donde quieras');
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
  // (CARTA-LIDER) Si la carta ya dice esta frase textual, no se repite
  // debajo: cada pieza dice una sola cosa. Normalización inline (sin
  // función nueva en el chunk: el censo M78 de carta-mano exige 0 nuevas).
  try {
    const a = d && d.analysis;
    const body = (a && a.letter && Array.isArray(a.letter.body)) ? a.letter.body : [];
    const txt = body.map((it) => it.text || '').join(' ');
    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
    if (f.length >= 10 && norm(txt).indexOf(norm(f)) !== -1) return '';
  } catch (e) {}
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
  // (CARTA-DEDUP) El punto de más («Hola, Posty.:») viene del NOMBRE
  // guardado («Posty.» con punto final), no de la plantilla del motor
  // (que emite 'Hola, ' + nombre + ':'). Se normaliza el saludo final
  // (puntos antes de ':') en todos los puntos de render: el saludo con
  // nombre del negocio queda «Hola, Posty:» sin tocar opts.saludoTop.
  const g = String((a && a.letter && a.letter.greeting) || '').trim().replace(/\.+:/g, ':');
  const m = g.match(/^(Hola|Hi), (.+):$/);
  if (m && m[2]) return g;
  const ctx = anaCtx();
  if (ctx.biz) return anaT('Hola, ' + ctx.biz + ':', 'Hi, ' + ctx.biz + ':').replace(/\.+:/g, ':');
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
      <!-- CARTA-EXPLICA 4/11 (corrección Valentino: su hermana no entendía
           que esto es una carta de Posty): rótulo arriba de todo del papel,
           antes del avatar y del saludo, parte del papel (Gochi, chico,
           sin banner de UI). Punto único: toda carta (mínima, v1 y
           anteriores) pasa por anaCartaHTML, así que sale exactamente 1
           vez por construcción, sin duplicar. Sin cambio de styles.css:
           el estilo va inline. -->
      <p class="ana-ltr-tag" style="font-family:'Gochi Hand',cursive,system-ui,sans-serif;font-size:16px;letter-spacing:.05em;color:rgba(10,30,51,.55);margin:0 0 8px">${anaT('Carta de Posty', 'A letter from Posty')}</p>
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
  // (CARTA-SIN-ESTRATEGIA-NI-ADS 7/11, decisión Valentino) La línea
  // del rótulo (la frase que anunciaba la estrategia de la semana)
  // salió: la carta YA ES la estrategia, no hace falta aclararlo.
  // Sin línea.
  // (LOTE CEREBRO-CM) Tema de la semana actual, solo en la carta actual
  // (nunca en cartas viejas) y solo si hay semana guardada. Sin tema,
  // la carta sale como siempre.
  // (CARTA-LIDER) Fusión, no duplicación: si la carta ya dice el tema
  // textual, la línea standalone no se dibuja — la carta ya lo dice.
  // Normalización inline (sin función nueva en el chunk: el censo M78
  // de carta-mano exige 0 nuevas); aguja corta (<4) no dispara.
  const cartaTxtTema = (a && a.letter && Array.isArray(a.letter.body)) ? a.letter.body.map((it) => it.text || '').join(' ') : '';
  let temaNuevo = true;
  try {
    const normTema = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
    const tTema = normTema(String(d.temaSemana));
    temaNuevo = !(tTema.length >= 4 && normTema(cartaTxtTema).indexOf(tTema) !== -1);
  } catch (e) { temaNuevo = true; }
  if (!anaPastMode && d && d.temaSemana && temaNuevo) h += `<p class="ana-tema">${anaT('Esta semana: ', 'This week: ')}${esc(String(d.temaSemana))}</p>`;
  // (2026-10-25) APERTURA: la explicación de cómo se armó el plan — el
  // week_summary del motor («qué vi → por eso tu semana es así») — encabeza
  // la ventana SIN CARTA como su línea de apertura. Es el contenido que
  // vivía en la tarjeta «Lo que vi de tu cuenta» de la Agenda, eliminada
  // por Valentino (la pantalla principal no lleva resúmenes de Análisis).
  // El texto viene del motor en el idioma de la cuenta (paridad ES/EN sin
  // croma nueva) y «Así nace tu semana» ya no lo repite. Sin week_summary
  // no se inventa apertura: la ventana abre como siempre.
  // (CARTA-ESTRATEGIA 6/11, decisión Valentino) En la carta el
  // week_summary NO se rinde en ninguna versión (ni v1 ni mínima v2):
  // la frase «Esta semana miré tu cuenta y vi que…» repetía lo que el
  // cuerpo ya dice. La carta ES la superficie.
  const minimalCarta = carta && !!(a.letter && (a.letter.v >= 2 || a.letter.minimal));
  if (wsOpen && !minimalCarta && !carta) h += wsOpen.split('\n').filter(Boolean).map((l) => `<p class="ana-intro">${esc(l)}</p>`).join('');
  if (carta) {
    // FORMA CARTA (domingo a la noche): narración primero, datos como apoyo.
    // CARTA MÍNIMA (v2): la carta ES la superficie — kit/mercado/historial
    // no se agregan debajo (el análisis completo sigue en el payload y en
    // las vistas sin carta; las cartas v1 conservan su forma con apoyo).
    const minimal = minimalCarta;
    h += anaLetterBodyHTML(a, { saludoTop: !!saludoTop });
    // (CARTA-ESTRATEGIA 6/11, decisión Valentino) El week_summary ya NO
    // se rinde en la carta (ni v1 ni mínima v2): la frase «Esta semana
    // miré tu cuenta y vi que…» repetía lo que el cuerpo ya dice. El
    // dato sigue en el payload y en la vista sin carta.
    // (CARTA-SIN-ESTRATEGIA-NI-ADS 7/11, decisión Valentino) El bloque
    // de ads salió de la carta: ads ya tiene su lugar (tab Ads). La
    // carta sigue recomendando qué posteo rindió más en su cuerpo; la
    // billetera + el picker + Cargar viven en el tab Ads.
    // (ESTUDIO-PROFUNDO · M6 RE-ESTUDIO SEMANAL) La tarjeta «qué cambió»
    // vive DENTRO de la carta, después del cuerpo y antes de «Compartir
    // mi semana»: el cliente ve qué cambió su negocio esta semana sin
    // salir de la carta. Carga bajo demanda (anaRestudioLoad); sin
    // corrida, el hueco queda vacío (nada inventado).
    h += `<div id="anaRestudioBox"></div>`;
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
    // (CARTA-ESTRATEGIA 6/11, decisión Valentino) La carta termina en
    // «Compartir mi semana»: debajo del botón no se rinde nada — fuera
    // la nota «Se actualiza una vez por semana», la confirmación
    // «¿Qué vendés esta semana?» y Aprende. (El refresh y Aprende
    // siguen en la vista SIN carta; el flujo anaFlConfirmLoad/Render
    // queda dormido, sin botón que lo abra desde la carta.)
    h += `</div>`;
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
  // (CARTA-SIN-ESTRATEGIA-NI-ADS 7/11, decisión Valentino) Sin carta
  // guardada tampoco hay bloque de ads en la tarjeta: ads vive en el
  // tab Ads.
  // (ESTUDIO-PROFUNDO · M6 RE-ESTUDIO SEMANAL) Vista sin carta: la
  // tarjeta «qué cambió» va junto a la nota de actualización semanal.
  h += `<div id="anaRestudioBox"></div>`;
  if (!anaPastMode) h += `<div class="ana-refresh"><p style="font-size:12.5px;color:var(--mut);margin:0">${anaT('Se actualiza una vez por semana', 'It updates once a week')}</p></div>`;
  h += anaAprendeHTML(d);
  h += `</div>`;
  return h;
}

/* ---------- LOTE ADS-BILLETERA: billetera + elegir posteo + impulsar ---------- */
/* (Base: LOTE IMPULSAR-UN-CLIC, ABSORBIDO — su código vive acá, no dos
 * sistemas de ads.) La carta recomienda el mejor posteo de LA SEMANA por
 * dato real de IG (GET /api/estrategia/mejor-posteo) y el bloque vive
 * DENTRO de la carta-líder, justo después del cuerpo: muy a la vista el
 * domingo a la noche, no después de la carta. El cliente hace DOS pasos
 * y nada más: (1) CARGA PLATA ($20/$50/$100 USD a la billetera, con la
 * tarjeta guardada) y (2) ELIGE el posteo (el recomendado de la carta va
 * marcado «el que más rindió» y pre-seleccionado — sugerencia, no
 * imposición). Posty hace TODO el resto: público, presupuesto desde el
 * saldo, 7 días, creación del ad en Meta, gestión. El débito del saldo
 * ocurre SOLO cuando el ad se crea bien; si falla, NO se debita nada.
 * Gates intactos: permiso ads_management ANTES de gastar; sin tasa
 * USD→ARS → conversion_pendiente SIN gasto; sin reembolso automático
 * (registro + revisión manual). Sin dato = sin recomendación inventada;
 * solo se muestra éxito con ok:true. En cartas anteriores (anaPastMode)
 * no se muestra: la recomendación es de la carta actual.
 * Sin cambios de CSS: se reutilizan las clases .ana-boostrec*.
 * (CORRECCIÓN al patrón heredado: api.post TIRA excepción en 409 con el
 * cuerpo en e.data — los handlers de este lote leen e.data.motivo; el
 * patrón viejo (j = null en el catch) perdía el motivo del servidor.) */

let anaBilleteraDatos = null; // { mejor, billetera, elegibles, movimientos, boosts, selId, selMonto } del último load (carta o tab Ads)

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
    case 'ads_sin_permiso':
      return anaT('Todavía no podemos crear anuncios en Meta para tu cuenta: falta el permiso de publicidad (ads_management). Cuando esté aprobado, un toque y sale. No se gastó nada.', "We can't create Meta ads for your account yet: the advertising permission (ads_management) is missing. Once it's approved, one tap and it's live. Nothing was spent.");
    case 'ads_verificacion_fallida':
      return anaT('No pudimos verificar el permiso de publicidad con Meta ahora. Probá de nuevo en unos minutos. No se gastó nada.', "We couldn't check the advertising permission with Meta right now. Try again in a few minutes. Nothing was spent.");
    case 'ads_no_configurado':
      return anaT('La pauta todavía no está configurada para tu cuenta. Te avisamos en cuanto esté lista. No se gastó nada.', "Ads aren't set up for your account yet. We'll let you know as soon as it's ready. Nothing was spent.");
    case 'sin_autorizacion_publicitaria':
      return anaT('Tu Página de Facebook todavía no autorizó la cuenta publicitaria. No se gastó nada.', "Your Facebook Page hasn't authorized the ad account yet. Nothing was spent.");
    case 'sin_destacado':
      return anaT('No hay un posteo destacado esta semana para impulsar.', "There's no featured post this week to boost.");
    case 'posteo_no_encontrado':
      return anaT('Ese posteo ya no está en tu semana.', "That post is no longer in your week.");
    case 'sin_zona':
      return anaT('Falta la zona de tu negocio para pautar. No se gastó nada.', "We need your business area to run the ad. Nothing was spent.");
    case 'sin_cliente':
      return anaT('No pudimos identificar tu cuenta para el cobro. No se gastó nada.', "We couldn't identify your account for the charge. Nothing was spent.");
    case 'sin_proveedores':
      return anaT('El impulso no está disponible ahora. No se gastó nada.', "Boosting isn't available right now. Nothing was spent.");
    case 'boost_deshabilitado':
      return anaT('El impulso todavía no está habilitado en tu cuenta.', "Boosting isn't enabled on your account yet.");
    case 'sin_tarjeta_guardada':
      return anaT('No tenés una tarjeta guardada para cargar la billetera.', "You don't have a saved card to top up the wallet.");
    case 'sin_cliente_stripe':
      return anaT('Todavía no tenés una forma de pago guardada para la carga automática.', "You don't have a saved payment method for auto top-up yet.");
    case 'stripe_no_configurado':
      return anaT('La carga automática todavía no está disponible. No se cobró nada.', "Auto top-up isn't available yet. Nothing was charged.");
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
    // NUEVOS (ADS-BILLETERA)
    case 'saldo_insuficiente':
      return anaT('No te alcanza el saldo de la billetera para ' + m + '. Cargá plata primero — un toque y listo.', "Your wallet balance doesn't cover " + m + ". Top it up first — one tap and done.");
    case 'saldo_ars_pendiente':
      return anaT('Todavía tenés saldo viejo en pesos en la billetera. Gastalo o pedinos que lo revisemos antes de cargar en dólares.', "You still have old pesos balance in the wallet. Spend it or ask us to review it before topping up in dollars.");
    case 'cobro_sin_acreditar':
      return anaT('El cobro se hizo pero la plata no entró a tu billetera. Quedó registrado' + (cobroId ? ' (cobro ' + cobroId + ')' : '') + ' para revisión urgente. Escribinos y lo resolvemos.', "The charge went through but the money didn't reach your wallet. It was recorded" + (cobroId ? ' (charge ' + cobroId + ')' : '') + " for urgent review. Write to us and we'll sort it out.");
    case 'debito_fallido':
      return anaT('El anuncio se creó en Meta pero no se pudo debitar de tu billetera. Quedó registrado para revisión manual — no se te cobró dos veces.', "The ad was created on Meta but couldn't be debited from your wallet. It was recorded for manual review — you weren't charged twice.");
    case 'ya_impulsado':
      return anaT('Ese posteo ya tiene una pauta activa. Elegí otro posteo.', "That post already has an active boost. Pick another post.");
    case 'sin_posteo':
      return anaT('Elegí primero el posteo al que le querés meter ads.', "First pick the post you want to boost.");
    case 'demo':
      return anaT('Todavía estás en modo demo: conectá tu Instagram para cargar plata y meterle ads.', "You're still in demo mode: connect your Instagram to top up and run ads.");
    default:
      return anaT('No se pudo impulsar. No se gastó nada de tu billetera.', "It couldn't be boosted. Nothing was spent from your wallet.");
  }
}

// Render del bloque de ads con billetera. Lee anaBilleteraDatos (mejor +
// billetera + elegibles del último load). La recomendación de la carta se
// muestra arriba; abajo: saldo + cargar, picker de posteos (recomendado
// marcado y pre-seleccionado), monto y [Meter ads por 7 días].
function anaBilleteraHTML() {
  const d = anaBilleteraDatos || {};
  const mejor = d.mejor || null;
  const hoy = d.hoy || null;
  const bil = d.billetera || {};
  const eleg = Array.isArray(d.elegibles) ? d.elegibles : [];
  const saldoCents = Number(bil.balance_cents || 0);
  const moneda = bil.currency || 'USD';
  const saldoUSD = moneda === 'USD' ? Math.floor(saldoCents / 100) : 0;
  const selId = d.selId || 0;
  const selMonto = d.selMonto || 20;
  // (LOTE ADS-PANTALLA) La compuerta bloquea GASTAR, no mostrar: la
  // pantalla se ve igual en todos los estados y solo cambian el botón y
  // la nota honesta. Habilitado = flag + permiso, los dos en true
  // explícito; cualquier duda (null/undefined) es bloqueado (fail-closed:
  // nunca se ofrece un botón que el servidor va a rechazar).
  // Orden del motivo (el del mock aprobado): primero lo que el cliente
  // puede entender — sin permiso, o Meta sin conectar — y la flag
  // (interruptor interno) solo cuando Meta ya está lista pero la flag
  // está apagada. Hoy (flag apagada + Meta sin conectar) la nota es la
  // de Meta, como en el mock.
  const habilitado = d.boostHabilitado === true && d.ads_permiso === true;
  const motivoBloqueo = d.ads_permiso === false ? 'ads_sin_permiso' : (d.ads_permiso !== true ? 'ads_no_configurado' : 'boost_deshabilitado');
  let recHTML = '';
  if (mejor) {
    const partes = anaBoostRecPartes(mejor);
    const porque = partes.length
      ? anaT('Fue tu posteo con más interacción esta semana: ', 'Your highest-engagement post this week: ') + partes.join(', ') + '.'
      : anaT('Fue tu posteo con más interacción esta semana.', 'Your highest-engagement post this week.');
    const img = mejor.image_path ? `<img src="${esc(mejor.image_path)}" alt="" class="ana-boostrec-img">` : '';
    const cap = mejor.caption ? `<p class="ana-boostrec-cap">${esc(mejor.caption)}</p>` : '';
    recHTML = `<p class="ana-boostrec-t">${anaT('Tu mejor posteo de la semana', 'Your best post this week')}</p>
    <div class="ana-boostrec-post">${img}<div>${cap}<p class="ana-boostrec-why">${esc(porque)}</p></div></div>`;
  }
  // (LOTE ADS-PANTALLA) Sin mejor de la semana, el posteo de hoy es el
  // recomendado: siempre hay un posteo para impulsar. Es el programado
  // de hoy (todavía no publicado): se muestra, no se puede elegir para
  // gastar hasta que salga — el picker pre-selecciona el publicado más
  // reciente.
  let hoyHTML = '';
  if (!mejor && hoy) {
    const img = hoy.image_path ? `<img src="${esc(hoy.image_path)}" alt="" class="ana-boostrec-img">` : '';
    const cap = hoy.caption ? `<p class="ana-boostrec-cap">${esc(hoy.caption)}</p>` : '';
    const chip = hoy.hora ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;background:#FEC14D;border-radius:999px;font-size:12px;font-weight:800;color:#0A1E33">${anaT('Sale hoy · ' + hoy.hora, 'Goes live today · ' + hoy.hora)}</span>` : '';
    hoyHTML = `<p class="ana-boostrec-t">${anaT('El posteo de hoy', "Today's post")}</p>
    <div class="ana-boostrec-post">${img}<div>${cap}${chip}</div></div>
    <p class="ana-boostrec-nota">${anaT('En cuanto se publique, queda listo para impulsar.', "As soon as it's published, it's ready to boost.")}</p>`;
  }
  const saldoTxt = moneda === 'USD'
    ? anaT('Tu billetera de ads: $' + saldoUSD, 'Your ads wallet: $' + saldoUSD)
    : anaT('Tu billetera vieja tiene $' + Math.floor(saldoCents / 100) + ' en pesos. La primera carga en dólares la pasa a USD.', 'Your old wallet has $' + Math.floor(saldoCents / 100) + ' in pesos. The first dollar top-up switches it to USD.');
  const cargarHTML = `<div class="ana-boostrec-montos" style="margin-top:10px">
      <p class="ana-boostrec-monto-t">${anaT('Cargar plata:', 'Top up:')}</p>
      ${[20, 50, 100].map((x) => `<button type="button" class="btn btn-ghost btn-sm" onclick="anaBilleteraCargar(${x}, this)">$${x}</button>`).join(' ')}
    </div>`;
  // Picker: recomendado primero, 5 más recientes como máximo. Sin
  // elegibles, la nota honesta (el cliente igual puede cargar plata).
  // (Los elegibles traen `post_id`, no `id`: así los devuelve el módulo.)
  // (LOTE ADS-PANTALLA) El posteo elegido por el buscador, si no está
  // entre los 5, se agrega como fila extra seleccionada: la elección
  // nunca se pierde de vista. Sin mejor, la primera fila lleva el chip
  // «el más reciente».
  const mejorId = mejor ? mejor.post_id : 0;
  const lista = eleg.slice().sort((a, b) => ((b.post_id === mejorId) ? 1 : 0) - ((a.post_id === mejorId) ? 1 : 0)).slice(0, 5);
  const selPost = (d.selPost && Number(d.selPost.post_id) === Number(selId)) ? d.selPost : null;
  const listaIds = new Set(lista.map((e) => e.post_id));
  const extra = (selPost && !listaIds.has(selPost.post_id)) ? [selPost] : [];
  const pickerHTML = eleg.length
    ? `<p class="ana-boostrec-monto-t" style="margin:12px 0 4px">${anaT('¿A cuál le metemos ads?', 'Which post gets the ads?')}</p>` + lista.map((e, i) => anaBilleteraPickerRow(e, e.post_id === selId, !!(mejor && e.post_id === mejor.post_id), !mejor && i === 0)).join('') + extra.map((e) => anaBilleteraPickerRow(e, true, false, false)).join('') + (eleg.length > 5 ? `<p class="ana-boostrec-nota">${anaT('Mostramos los 5 más recientes.', 'Showing the 5 most recent.')}</p>` : '')
    : `<p class="ana-boostrec-nota" style="margin-top:10px">${anaT('Todavía no tenés posteos publicados para impulsar.', "You don't have published posts to boost yet.")}</p>`;
  // (LOTE ADS-PANTALLA) Buscador: encontrar CUALQUIER posteo del feed
  // por una palabra de su caption, sin límite de edad. La búsqueda solo
  // repinta sus resultados (nunca el bloque entero: el input no pierde
  // el foco mientras se escribe).
  const busq = d.busq || { q: '', resultados: [], buscando: false, hecho: false };
  const busqHTML = `<div style="margin-top:12px">
    <p class="ana-boostrec-monto-t">${anaT('¿Buscás otro posteo?', 'Looking for another post?')}</p>
    <input type="search" id="anaBoostRecBusq" value="${esc(busq.q || '')}" placeholder="${esc(anaT('Escribí una palabra del posteo…', 'Type a word from the post…'))}" oninput="anaBilleteraBuscar(this.value)" autocomplete="off" style="width:100%;padding:10px 12px;border:2px solid #DCEFFF;border-radius:12px;font-size:14px;color:#0A1E33;background:#fff;box-sizing:border-box">
    <div id="anaBoostRecBusqRes">${anaBilleteraBusqResHTML()}</div>
  </div>`;
  const montoHTML = `<div class="ana-boostrec-montos" style="margin-top:12px">
      <p class="ana-boostrec-monto-t">${anaT('¿Cuánto le metemos?', 'How much?')}</p>
      ${[20, 50, 100].map((x) => `<button type="button" class="btn ${x === selMonto ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="anaBilleteraElegirMonto(${x}, this)">$${x}</button>`).join(' ')}
    </div>`;
  const puede = selId > 0 && eleg.length > 0 && saldoUSD >= selMonto;
  const faltaTxt = selId > 0 && eleg.length > 0 && saldoUSD < selMonto
    ? `<p class="ana-boostrec-nota" style="margin-top:8px">${anaT('Te faltan $' + (selMonto - saldoUSD) + ' en la billetera. Cargá plata arriba.', "You're $" + (selMonto - saldoUSD) + " short in the wallet. Top up above.")}</p>`
    : '';
  const notaConv = d.conversion_pendiente === true
    ? `<p class="ana-boostrec-nota" style="margin-top:8px">${anaT('Queda armado por 7 días. Todavía no se puede gastar porque falta definir la conversión USD→ARS. No se gasta nada todavía.', "Armed for 7 days. It can't be spent yet because the USD→ARS conversion isn't set. Nothing is spent yet.")}</p>`
    : '';
  // (LOTE ADS-PANTALLA) Botón de acción según el estado. Habilitado: el
  // de siempre («Meter ads por 7 días»), que gasta de verdad. Bloqueado:
  // el botón del chat («Quiero impulsar este posteo»): abre el chat con
  // Posty con el posteo anclado y el mensaje ya escrito — no gasta ni
  // promete nada, la intención queda en la conversación. Sin posteo
  // elegido no hay botón (no hay nada que anclar); la nota honesta
  // queda igual.
  const notaBloqueo = motivoBloqueo === 'boost_deshabilitado'
    ? anaT('El impulso todavía no está habilitado en tu cuenta. Posty lo está dejando listo y te avisa. No se gastó nada.', "Boosting isn't enabled on your account yet. Posty is getting it ready and will let you know. Nothing was spent.")
    : motivoBloqueo === 'ads_sin_permiso'
      ? anaT('Todavía no podemos crear anuncios en Meta para tu cuenta: falta el permiso de publicidad (ads_management). Posty te avisa en cuanto esté aprobado. No se gastó nada.', "We can't create Meta ads for your account yet: the advertising permission (ads_management) is missing. Posty will let you know once it's approved. Nothing was spent.")
      : anaT('Todavía no se pueden crear anuncios: falta conectar la cuenta publicitaria de Meta. Posty te avisa en cuanto esté lista. No se gastó nada.', "Ads can't be created yet: the Meta ad account still needs to be connected. Posty will let you know as soon as it's ready. Nothing was spent.");
  const tienePosteo = selId > 0 && (eleg.length > 0 || !!selPost);
  const accionHTML = habilitado
    ? (eleg.length
      ? `<button type="button" class="btn btn-primary" style="width:100%;margin-top:12px" onclick="anaBilleteraImpulsar(this)" ${puede ? '' : 'disabled'}>${anaT('Meter ads por 7 días · $' + selMonto, 'Run ads for 7 days · $' + selMonto)}</button>${faltaTxt}${notaConv}`
      : '')
    : `${tienePosteo ? `<button type="button" class="btn btn-primary" style="width:100%;margin-top:12px" onclick="anaBilleteraQuieroImpulsar(this)">💬 ${anaT('Quiero impulsar este posteo', 'I want to boost this post')}</button>` : ''}<p class="ana-boostrec-nota" style="margin-top:8px">${notaBloqueo}</p>`;
  return `<div class="ana-boostrec">
    <p class="ana-boostrec-sec">${anaT('Impulsar', 'Boost')}</p>
    <p class="ana-boostrec-saludo">${anaT('¡Hola! Te traigo una idea cortita:', 'Hi! A quick idea for you:')}</p>
    <p class="ana-boostrec-nota" style="margin-top:10px;font-weight:800;color:#0A1E33">${saldoTxt}</p>
    ${cargarHTML}
    ${recHTML}
    ${hoyHTML}
    ${pickerHTML}
    ${busqHTML}
    ${montoHTML}
    ${accionHTML}
    <div class="ana-boostrec-msg" id="anaBoostRecMsg"></div>
    <p class="ana-boostrec-despedida">— Posty</p>
  </div>`;
}

// Fila del picker de posteos (recomendado, recientes y resultados del
// buscador comparten la misma fila: miniatura real + caption + chip).
// (LOTE ADS-DIRECTO v759) Corte de caption por palabra, nunca a mitad:
// si el corte cae justo en un límite de palabra se queda ahí; si no, se
// retrocede al último espacio; sin espacio, corte duro. Espejo en el
// servidor: cortarCaption en ads-billetera.js.
function anaCortarCaption(texto, max) {
  const t = String(texto || '');
  const m = Math.max(0, Math.floor(Number(max) || 0));
  if (!m || t.length <= m) return t;
  const recorte = t.slice(0, m);
  if (t[m] === ' ') return recorte + '…';
  const ultimoEspacio = recorte.lastIndexOf(' ');
  if (ultimoEspacio > 0) return recorte.slice(0, ultimoEspacio) + '…';
  return recorte + '…';
}

function anaBilleteraPickerRow(e, sel, rec, masReciente) {
  const cap = esc(anaCortarCaption(String(e.caption || 'Posteo sin caption'), 120));
  const img = e.image_path ? `<img src="${esc(e.image_path)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:10px;flex:0 0 auto">` : '';
  const chip = rec
    ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;background:#FEC14D;border-radius:999px;font-size:12px;font-weight:800;color:#0A1E33">${anaT('✦ el que más rindió', '✦ top performer')}</span>`
    : (masReciente ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;background:#FEC14D;border-radius:999px;font-size:12px;font-weight:800;color:#0A1E33">${anaT('✦ el más reciente', '✦ most recent')}</span>` : '');
  return `<button type="button" onclick="anaBilleteraElegirPosteo(${e.post_id}, this)" style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;margin:6px 0;padding:8px;border:2px solid ${sel ? '#FEC14D' : '#DCEFFF'};border-radius:14px;background:${sel ? '#FFF8E1' : '#fff'};cursor:pointer">${img}<span style="flex:1;min-width:0"><span style="display:block;font-size:13.5px;font-weight:700;color:#0A1E33;line-height:1.35">${cap}</span>${chip}</span>${sel ? '<span style="font-size:18px;color:#1FA855">✓</span>' : ''}</button>`;
}

// Resultados del buscador: solo repintan su contenedor (nunca el bloque
// entero, para no robarle el foco al input mientras se escribe).
function anaBilleteraBusqResHTML() {
  const d = anaBilleteraDatos || {};
  const b = d.busq || {};
  const res = Array.isArray(b.resultados) ? b.resultados : [];
  if (b.buscando) return `<p class="ana-boostrec-nota">${anaT('Buscando…', 'Searching…')}</p>`;
  if ((b.q || '').trim().length >= 2 && b.hecho && !res.length) return `<p class="ana-boostrec-nota">${anaT('No encontré ningún posteo con esa palabra.', 'No post found with that word.')}</p>`;
  if (!res.length) return '';
  return res.map((e) => anaBilleteraPickerRow(e, e.post_id === (d.selId || 0), !!(d.mejor && e.post_id === d.mejor.post_id), false)).join('');
}

var ANA_BUSQ_TIMER = null;
function anaBilleteraBuscar(q) {
  const d = anaBilleteraDatos;
  if (!d) return;
  if (!d.busq) d.busq = { q: '', resultados: [], buscando: false, hecho: false };
  d.busq.q = String(q || '');
  const qq = d.busq.q.trim();
  if (ANA_BUSQ_TIMER) { clearTimeout(ANA_BUSQ_TIMER); ANA_BUSQ_TIMER = null; }
  const pintarRes = () => {
    const box = document.getElementById('anaBoostRecBusqRes');
    if (box) box.innerHTML = anaBilleteraBusqResHTML();
  };
  if (qq.length < 2) { d.busq.resultados = []; d.busq.buscando = false; d.busq.hecho = false; pintarRes(); return; }
  d.busq.buscando = true;
  pintarRes();
  const qEnviada = qq;
  ANA_BUSQ_TIMER = setTimeout(async () => {
    let j = null;
    try { j = await api.get('/api/ads/billetera/buscar?q=' + encodeURIComponent(qEnviada)); } catch (e) { j = null; }
    const dd = anaBilleteraDatos;
    if (!dd || !dd.busq || dd.busq.q.trim() !== qEnviada) return; // ya cambió la búsqueda
    dd.busq.buscando = false;
    dd.busq.hecho = true;
    dd.busq.resultados = (j && j.ok && Array.isArray(j.resultados)) ? j.resultados : [];
    const box = document.getElementById('anaBoostRecBusqRes');
    if (box) box.innerHTML = anaBilleteraBusqResHTML();
  }, 300);
}

// (LOTE ADS-PANTALLA) Estado bloqueado: el botón no gasta ni promete
// nada — abre el chat con Posty con el posteo anclado y el mensaje ya
// escrito. Mismo camino que «Pedir un cambio» (HF_ASK_TEXT_PENDING +
// hfAskChange + hfDeliverAskText): la intención queda en la
// conversación, donde el conserje la ve y la sigue.
function anaBilleteraQuieroImpulsar(btn) {
  const d = anaBilleteraDatos;
  if (!d) return;
  const post = d.selPost || ((d.elegibles || []).find((e) => e.post_id === d.selId) || null);
  if (!post || !post.post_id) return;
  const monto = d.selMonto || 20;
  const texto = anaT('Quiero impulsar este posteo con $' + monto + ' por 7 días', 'I want to boost this post with $' + monto + ' for 7 days');
  const anchorPost = { id: post.post_id, image_path: post.image_path || '', caption: post.caption || '', status: (d.hoy && d.hoy.post_id && Number(d.hoy.post_id) === Number(post.post_id)) ? 'scheduled' : 'published', media_type: '' };
  try { HF_ASK_TEXT_PENDING = texto; } catch (e) {}
  try { if (typeof hfAskChange === 'function') hfAskChange(anchorPost); } catch (e) {}
  try { if (typeof hfDeliverAskText === 'function') hfDeliverAskText(); } catch (e) {}
}

// Selección en el picker / monto: re-render desde los datos cacheados
// (sin otro viaje al servidor; la elección es local hasta el toque).
// (LOTE ADS-PANTALLA) La elección guarda también el posteo completo
// (selPost): el elegido por el buscador puede no estar entre los 5
// recientes y tiene que seguir visible como fila seleccionada.
function anaBilleteraElegirPosteo(id, btn) {
  if (!anaBilleteraDatos) return;
  const d = anaBilleteraDatos;
  const nid = Number(id) || 0;
  d.selId = nid;
  const enEleg = (d.elegibles || []).find((e) => e.post_id === nid) || null;
  const enFeed = (d.feed || []).find((e) => e.post_id === nid) || null;
  const enBusq = ((d.busq && d.busq.resultados) || []).find((e) => e.post_id === nid) || null;
  d.selPost = enEleg || enFeed || enBusq || ((d.selPost && d.selPost.post_id === nid) ? d.selPost : null);
  anaBilleteraPintar();
}
function anaBilleteraElegirMonto(monto, btn) {
  if (!anaBilleteraDatos) return;
  anaBilleteraDatos.selMonto = Number(monto) || 20;
  anaBilleteraPintar();
}

// Cargar plata: un toque cobra con la tarjeta guardada y acredita en la
// billetera. El mensaje se pone DESPUÉS del refresh (el re-render borra
// el msg viejo).
// (LOTE CARGAR-ADS) Motivos de Cargar con su texto propio. Los de
// anaBoostRecMotivo hablan de «impulsar» o de «carga automática» y el
// usuario acaba de tocar «Cargar» — un texto así no le dice qué pasó con
// SU carga. Los motivos que ya son de la billetera (demo, saldo viejo en
// pesos, cobro sin acreditar, monto inválido) se reutilizan tal cual.
// Sin motivo (500 del servidor, red caída) también hay texto: nunca un
// toque sin respuesta visible.
function anaCargarMotivo(motivo, monto, cobroId) {
  switch (motivo) {
    case 'sin_cliente_stripe':
    case 'sin_tarjeta_guardada':
      return anaT('No tenés una tarjeta guardada, así que no se pudo cargar. Para cargar plata, primero hay que agregar una tarjeta. No se cobró nada.', "You don't have a saved card, so the top-up couldn't go through. To top up, a card has to be added first. Nothing was charged.");
    case 'stripe_no_configurado':
      return anaT('La carga todavía no está disponible en tu cuenta. Probá de nuevo más tarde. No se cobró nada.', "Top-up isn't available on your account yet. Try again later. Nothing was charged.");
    case 'cobro_fallido':
      return anaT('No se pudo cobrar con tu tarjeta. Probá de nuevo en un momento. No se cobró nada.', "The charge didn't go through. Try again in a moment. Nothing was charged.");
    case 'cobro_requiere_accion':
      return anaT('El cobro necesita una confirmación tuya y no se puede hacer solo. No se cobró nada.', "The charge needs your confirmation and can't run on its own. Nothing was charged.");
    case 'cobro_no_confirmado':
      return anaT('El cobro no se confirmó. Probá de nuevo. No se cobró nada.', "The charge wasn't confirmed. Try again. Nothing was charged.");
    case 'sin_proveedores':
      return anaT('La carga no está disponible ahora. Probá de nuevo en un momento. No se cobró nada.', "Top-up isn't available right now. Try again in a moment. Nothing was charged.");
    case '':
    case null:
    case undefined:
      return anaT('No se pudo cargar ahora. Probá de nuevo en un momento. No se cobró nada.', "The top-up didn't go through right now. Try again in a moment. Nothing was charged.");
    default:
      return anaBoostRecMotivo(motivo, monto, cobroId);
  }
}

// (LOTE CARGAR-ADS) El mensaje de Cargar va PEGADO al botón que se tocó.
// El #anaBoostRecMsg compartido quedaba, en el tab Ads, 679 px más abajo
// del botón (después de la foto grande y del botón Impulsar), fuera de la
// pantalla: el toque parecía no hacer nada (repro con Playwright 390px).
// Solo una vista está montada a la vez, así que el dedicado que existe es
// el de esta vista; si no hay dedicado, cae al compartido. Después de
// escribir, se lleva a la vista para que se vea sin tener que buscarlo.
function anaCargarMsgEl() {
  return document.getElementById('anaAdsCargarMsg')
    || document.getElementById('anaBilleteraCargarMsg')
    || document.getElementById('anaBoostRecMsg');
}
function anaCargarDecir(t) {
  const m = anaCargarMsgEl();
  if (!m) return;
  m.textContent = t;
  try { m.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}

async function anaBilleteraCargar(monto, btn) {
  if (btn) btn.disabled = true;
  let j = null;
  try { j = await api.post('/api/ads/billetera/cargar', { montoUSD: monto }); } catch (e) { j = (e && e.data) || null; }
  if (btn) btn.disabled = false;
  if (j && j.ok) {
    const nuevoSaldo = Math.floor(Number(j.balance_cents || 0) / 100);
    await anaBoostRecLoad(true);
    await anaBilleteraTabLoad();
    anaCargarDecir(anaT('Listo, cargaste $' + monto + '. Tu billetera tiene $' + nuevoSaldo + '.', 'Done, you topped up $' + monto + '. Your wallet now has $' + nuevoSaldo + '.'));
  } else {
    anaCargarDecir(anaCargarMotivo((j && j.motivo) || '', monto, j && j.cobroId));
    // (LOTE AGREGAR-TARJETA) Sin tarjeta, el mensaje lleva al flujo:
    // el botón queda pegado al mensaje (hermano, no hijo).
    if (anaCargarSinTarjeta((j && j.motivo) || '')) anaAgregarTarjetaBtn(anaCargarMsgEl());
  }
}

// (LOTE ADS-DIRECTO v759) Decisión pura del toque Impulsar: qué hace
// UN toque con lo que hay pre-seleccionado. 'impulsar' = directo al
// servidor; 'cargar_y_impulsar' = la automática carga el monto y después
// impulsa, todo en el mismo toque; 'saldo_insuficiente' = manual, 2
// toques (Cargar y después Impulsar); 'chat' = bloqueado o posteo sin
// publicar: abre el chat con Posty, nunca un botón que el servidor va a
// rechazar ni un cobro en estado bloqueado; 'ya_impulsado' y
// 'sin_posteo' = nota honesta. Sin DOM ni red: se testea en VM.
function anaAdsRutaImpulsar(d) {
  const sel = (d && d.selPost) || null;
  if (!sel || !sel.post_id) return { ruta: 'sin_posteo' };
  const id = String(sel.post_id);
  const enFeed = ((d.feed || []).find((p) => String(p.post_id) === id)) || null;
  if (enFeed && enFeed.ya_impulsado) return { ruta: 'ya_impulsado' };
  const esHoy = !!(d.hoy && d.hoy.post_id && String(d.hoy.post_id) === id);
  const publicado = ((d.elegibles || []).some((p) => String(p.post_id) === id));
  if (!d.boostHabilitado || esHoy || !publicado) return { ruta: 'chat' };
  const monto = Number(d.selMonto) || 20;
  const saldo = Math.floor(Number((d.billetera && d.billetera.balance_cents) || 0) / 100);
  if (saldo >= monto) return { ruta: 'impulsar' };
  if (d.auto_topup) return { ruta: 'cargar_y_impulsar' };
  return { ruta: 'saldo_insuficiente' };
}

// Impulsar con saldo: el débito ocurre SOLO si el ad se creó bien en
// Meta (lo garantiza el servidor); acá solo se muestra el resultado.
// (LOTE ADS-DIRECTO v759) El toque se decide con anaAdsRutaImpulsar:
// con todo pre-seleccionado y saldo, es 1 toque; con automática
// prendida y saldo corto, carga y después impulsa en el mismo toque;
// bloqueado o sin publicar, va al chat (nunca se ofrece un botón que el
// servidor va a rechazar).
async function anaBilleteraImpulsar(btn) {
  if (!anaBilleteraDatos) return;
  const d = anaBilleteraDatos;
  const ruta = anaAdsRutaImpulsar(d);
  const posteoId = d.selId || 0;
  const monto = d.selMonto || 20;
  const decir = (t) => { const m = document.getElementById('anaBoostRecMsg'); if (m) m.textContent = t; };
  if (ruta.ruta === 'sin_posteo') { decir(anaBoostRecMotivo('sin_posteo', monto)); return; }
  if (ruta.ruta === 'ya_impulsado') { decir(anaBoostRecMotivo('ya_impulsado', monto)); return; }
  if (ruta.ruta === 'chat') { anaBilleteraQuieroImpulsar(); return; }
  if (ruta.ruta === 'saldo_insuficiente') { decir(anaBoostRecMotivo('saldo_insuficiente', monto)); return; }
  if (btn) btn.disabled = true;
  try {
    if (ruta.ruta === 'cargar_y_impulsar') {
      let c = null;
      try { c = await api.post('/api/ads/billetera/cargar', { montoUSD: monto, ref: 'carga_auto_' + Date.now().toString(36) }); } catch (e) { c = (e && e.data) || null; }
      if (!c || !c.ok) { decir(anaBoostRecMotivo((c && c.motivo) || 'cobro_fallido', monto, c && c.cobroId)); return; }
    }
    let j = null;
    try { j = await api.post('/api/ads/billetera/impulsar', { posteoId, montoUSD: monto }); } catch (e) { j = (e && e.data) || null; }
    if (j && j.ok) {
      const nuevoSaldo = Math.floor(Number(j.balance_cents || 0) / 100);
      // (LOTE ADS-PANTALLA) El posteo recién impulsado ya no se puede
      // volver a impulsar: sale de la selección antes de recargar, para
      // que el picker no lo siga mostrando como elegido.
      if (anaBilleteraDatos) { anaBilleteraDatos.selId = 0; anaBilleteraDatos.selPost = null; }
      await anaBoostRecLoad(true);
      await anaBilleteraTabLoad();
      const msg2 = document.getElementById('anaBoostRecMsg');
      if (msg2) msg2.textContent = anaT('Listo, ya tiene ads por 7 días. Tu billetera quedó en $' + nuevoSaldo + '. Posty te va a reportar números reales cuando lleguen.', 'Done, it has ads for 7 days. Your wallet is now at $' + nuevoSaldo + '. Posty will report real numbers when they arrive.');
    } else {
      decir(anaBoostRecMotivo((j && j.motivo) || '', monto, j && j.cobroId));
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// (LOTE ADS-DIRECTO v759) Cargar con el monto SELECCIONADO (el botón
// «↓ Cargar $20» usa lo que está elegido, no un monto fijo).
async function anaAdsCargar(btn) {
  const d = anaBilleteraDatos || {};
  await anaBilleteraCargar(Number(d.selMonto) || 20, btn);
}

// (LOTE AGREGAR-TARJETA) Guardar/cambiar la tarjeta para Ads sin cobrar
// nada: un toque abre la página alojada por Stripe (Checkout modo
// setup); al volver a Ads la tarjeta ya está guardada y el siguiente
// Cargar sale con un toque. Siempre disponible: agregar otra tarjeta
// la deja como la activa. Sin Stripe.js ni formulario propio en la app.
function anaTarjetaMsgEl() {
  try { if (typeof anaCargarMsgEl === 'function') { const m = anaCargarMsgEl(); if (m) return m; } } catch (e) {}
  // (v877) En la hoja Impulsar el mensaje es #pzBoostMsg: si el setup de
  // Stripe falla desde ahí, el aviso tiene que verse en la hoja.
  return document.getElementById('anaBoostRecMsg') || document.getElementById('pzBoostMsg');
}
async function anaAgregarTarjeta(btn) {
  if (btn) btn.disabled = true;
  let j = null;
  try { j = await api.post('/api/billing/stripe/setup', {}); } catch (e) { j = (e && e.data) || null; }
  if (j && j.url) { location.href = j.url; return; }
  if (btn) btn.disabled = false;
  const m = anaTarjetaMsgEl();
  if (m) m.textContent = anaT('No se pudo abrir el pago seguro. Probá de nuevo en un momento.', "The secure payment page couldn't be opened. Try again in a moment.");
}
// Botón «Agregar tarjeta» / «Cambiar tarjeta» de la billetera: si ya hay
// una guardada se muestra cuál es (•••• últimos 4) y el botón es para
// cambiarla; si no hay, es para agregarla. Siempre visible: cambiar de
// tarjeta no es de una sola vez.
function anaTarjetaBtnHTML(d) {
  const t = (d && d.tarjeta) || null;
  const label = (t && t.tiene)
    ? anaT('Cambiar tarjeta' + (t.last4 ? ' •••• ' + t.last4 : ''), 'Change card' + (t.last4 ? ' •••• ' + t.last4 : ''))
    : anaT('Agregar tarjeta', 'Add a card');
  return `<button type="button" onclick="anaAgregarTarjeta(this)" style="width:100%;padding:11px;border:2px solid #DCEFFF;border-radius:12px;background:#fff;font-size:14px;font-weight:800;color:#2793C8;cursor:pointer;margin-top:10px">${esc(label)}</button>`;
}
// Sin tarjeta, el mensaje de Cargar lleva al flujo: el botón queda pegado
// al mensaje (hermano, no hijo: el texto del mensaje no cambia y lo que
// lo lee sigue viendo el mismo texto).
function anaCargarSinTarjeta(motivo) { return motivo === 'sin_cliente_stripe' || motivo === 'sin_tarjeta_guardada'; }
function anaAgregarTarjetaBtn(m) {
  if (!m || !m.parentNode) return;
  const prev = m.parentNode.querySelector('.ana-agregar-tarjeta-btn');
  if (prev) prev.remove();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ana-agregar-tarjeta-btn';
  b.textContent = anaT('Agregar tarjeta', 'Add a card');
  b.setAttribute('style', 'margin-top:8px;padding:10px 14px;border:2px solid #DCEFFF;border-radius:12px;background:#fff;font-size:14px;font-weight:800;color:#2793C8;cursor:pointer');
  b.onclick = function () { anaAgregarTarjeta(b); };
  m.insertAdjacentElement('afterend', b);
}
// Vuelta de Stripe tras guardar la tarjeta (?tarjeta=ok en el hash):
// se confirma una sola vez y se limpia el parámetro para no repetirla.
function anaTarjetaRetorno() {
  let q = null;
  try { q = new URLSearchParams(((location.hash || '').split('?')[1] || '')); } catch (e) { return; }
  if (!q || q.get('tarjeta') !== 'ok') return;
  const m = anaTarjetaMsgEl();
  if (m) m.textContent = anaT('Tarjeta guardada. Ya podés cargar con un toque.', 'Card saved. You can top up with one tap now.');
  try { history.replaceState(null, '', location.pathname + '#/app/ads'); } catch (e) {}
}

// (LOTE DOCK-ADS) Las lecturas de la billetera, compartidas por la carta
// y por el tab Ads: mejor posteo, billetera y elegibles. Ninguna tira si
// falla: cada una cae a null y el constructor decide qué mostrar.
// (LOTE ADS-DIRECTO v759) Se suma la 5ª lectura: el feed entero para la
// grilla (GET /api/ads/billetera/feed).
async function anaBilleteraFetchDatos() {
  let d = null, bil = null, elig = null, hoy = null, feed = null;
  try { d = await api.get('/api/estrategia/mejor-posteo'); } catch (e) { d = null; }
  try { bil = await api.get('/api/ads/billetera'); } catch (e) { bil = null; }
  try { elig = await api.get('/api/ads/billetera/elegibles'); } catch (e) { elig = null; }
  try { hoy = await api.get('/api/ads/billetera/hoy'); } catch (e) { hoy = null; }
  try { feed = await api.get('/api/ads/billetera/feed'); } catch (e) { feed = null; }
  return { d, bil, elig, hoy, feed };
}

// Constructor de anaBilleteraDatos desde las lecturas. El recomendado va
// pre-seleccionado; si había selección, se conserva si el posteo sigue
// elegible. Sin mejor, se pre-selecciona el primer elegible (antes quedaba
// sin selección y el botón Impulsar deshabilitado hasta tocar uno).
// (LOTE ADS-SOLO-PUBLICADOS) `preferReciente`: en el tab Ads el
// destacado por defecto es el posteo PUBLICADO más reciente (el primero
// del feed que sigue elegible); el posteo de hoy programado NUNCA es el
// destacado — todavía no existe en Instagram y Meta no lo puede pautar.
// La carta sigue con el mejor (sin 3er argumento).
// El feed entero y la automática viajan en los datos para la grilla y la
// fila de carga automática del tab.
// (FIX DOCK-ADS: los elegibles traen `post_id`, no `id` — el conjunto viejo
// era de undefined y la selección se perdía tras cada carga o impulso; el
// comentario de anaBilleteraHTML ya lo decía.)
function anaBilleteraConstruirDatos(f, prevSel, preferReciente) {
  const d = f && f.d, bil = f && f.bil, elig = f && f.elig;
  const tieneMejor = !!(d && d.ok && d.mejor);
  const elegibles = (elig && elig.ok && Array.isArray(elig.elegibles)) ? elig.elegibles : [];
  const hoy = (f && f.hoy && f.hoy.ok && f.hoy.hoy) ? f.hoy.hoy : null;
  const datos = {
    mejor: tieneMejor ? d.mejor : null,
    hoy,
    boostHabilitado: (d && d.boostHabilitado !== undefined) ? d.boostHabilitado : (bil && bil.ok ? bil.boostHabilitado : undefined),
    ads_permiso: (bil && bil.ok && bil.ads_permiso !== undefined) ? bil.ads_permiso : (d ? d.ads_permiso : undefined),
    conversion_pendiente: (d && d.conversion_pendiente !== undefined) ? d.conversion_pendiente : (bil && bil.ok ? bil.conversion_pendiente : undefined),
    billetera: bil && bil.ok ? bil : { balance_cents: 0, currency: 'USD', montos_usd: [20, 50, 100] },
    elegibles,
    feed: (f && f.feed && f.feed.ok && Array.isArray(f.feed.posts)) ? f.feed.posts : [],
    auto_topup: (bil && bil.ok && bil.auto_topup) ? 1 : 0,
    tiene_tarjeta: !!(bil && bil.ok && bil.tiene_tarjeta),
    // (LOTE AGREGAR-TARJETA) Tarjeta activa para Cargar/Impulsar (la
    // default del cliente, si no la más reciente): marca + últimos 4
    // para mostrarla en la billetera. null si no hay o no se pudo leer.
    tarjeta: (bil && bil.ok && bil.tarjeta) || null,
    vistaFeed: false,
    movimientos: (bil && bil.ok && Array.isArray(bil.movimientos)) ? bil.movimientos : [],
    boosts: [],
    selId: 0, selMonto: 20,
    selPost: null,
    busq: { q: '', resultados: [], buscando: false, hecho: false },
  };
  const ids = new Set(elegibles.map((e) => e.post_id));
  // El feed viene ordenado por publicado desc (el servidor): el primero
  // que sigue elegible es el publicado más reciente que se puede impulsar.
  // Si el más reciente ya tiene pauta, salta al siguiente elegible; si no
  // hay ninguno elegible, no hay destacado (vacío honesto, nunca el hoy).
  const feedOrden = Array.isArray(datos.feed) ? datos.feed : [];
  const reciente = (preferReciente ? feedOrden.find((p) => ids.has(p.post_id)) : null) || null;
  const defecto = reciente ? reciente.post_id : (tieneMejor ? d.mejor.post_id : (elegibles[0] ? elegibles[0].post_id : 0));
  // (LOTE ADS-PANTALLA) La selección sobrevive a la recarga si el posteo
  // sigue elegible; si venía del buscador (fuera de los 20), sobrevive
  // con su objeto guardado (selPost) y se vuelve a mostrar como fila.
  const prevPost = (prevSel && prevSel.selPost && Number(prevSel.selPost.post_id) === Number(prevSel.selId)) ? prevSel.selPost : null;
  if (prevSel && prevSel.selId && (ids.has(prevSel.selId) || prevPost)) {
    datos.selId = prevSel.selId;
    datos.selPost = elegibles.find((e) => e.post_id === prevSel.selId) || prevPost;
  } else {
    datos.selId = defecto;
    datos.selPost = elegibles.find((e) => e.post_id === defecto) || null;
  }
  datos.selMonto = (prevSel && prevSel.selMonto) ? prevSel.selMonto : 20;
  return datos;
}

async function anaBoostRecLoad(keepSel) {
  const box = document.getElementById('anaBoostRec');
  if (!box || anaPastMode) return;
  const prevSel = keepSel && anaBilleteraDatos ? { selId: anaBilleteraDatos.selId, selMonto: anaBilleteraDatos.selMonto, selPost: anaBilleteraDatos.selPost || null } : null;
  const f = await anaBilleteraFetchDatos();
  if (document.getElementById('anaBoostRec') !== box) return;
  if (!f.d || !f.d.ok) { box.innerHTML = ''; return; }
  const tieneMejor = !!f.d.mejor;
  const tieneEleg = f.elig && f.elig.ok && Array.isArray(f.elig.elegibles) && f.elig.elegibles.length > 0;
  if (!tieneMejor && !tieneEleg) { box.innerHTML = ''; return; }
  anaBilleteraDatos = anaBilleteraConstruirDatos(f, prevSel);
  box.innerHTML = anaBilleteraHTML();
}

// ---------- TAB ADS (LOTE DOCK-ADS + LOTE ADS-DIRECTO v759) ----------
// El tab Ads del dock usa los mismos datos que la carta, pero con su
// propia vista directa (anaAdsTabHTML): billetera + carga automática +
// publicado más reciente destacado + grilla de solo publicados. Si las
// lecturas fallan, devuelve null y adsView muestra la nota honesta
// (nunca el bloque de «no habilitado», que sería mentira).
// (LOTE ADS-SOLO-PUBLICADOS) El posteo de hoy programado no es el
// destacado ni entra en la grilla: todavía no está publicado.
// /api/ads/boosts ya existe (la usaba el tab viejo).
async function anaBilleteraTabDatos() {
  const prevSel = anaBilleteraDatos ? { selId: anaBilleteraDatos.selId, selMonto: anaBilleteraDatos.selMonto, selPost: anaBilleteraDatos.selPost || null } : null;
  const prevVista = anaBilleteraDatos ? !!anaBilleteraDatos.vistaFeed : false;
  const f = await anaBilleteraFetchDatos();
  if (!f.d && !f.bil && !f.elig && !f.hoy && !f.feed) return null;
  let boosts = null;
  try { boosts = await api.get('/api/ads/boosts'); } catch (e) { boosts = null; }
  const datos = anaBilleteraConstruirDatos(f, prevSel, true); // preferReciente: destacado = publicado más reciente
  datos.vistaFeed = prevVista;
  datos.boosts = (boosts && boosts.ok && Array.isArray(boosts.boosts)) ? boosts.boosts : [];
  anaBilleteraDatos = datos;
  return datos;
}

// Re-pinta el tab Ads tras cargar plata o impulsar (los handlers de la
// billetera llaman a anaBoostRecLoad para la carta; acá va el tab). Si el
// tab no está montado, no hace nada; si la recarga falla, deja el
// contenido viejo (nunca lo reemplaza por un error).
async function anaBilleteraTabLoad() {
  const box = document.getElementById('adsTabRoot');
  if (!box) return;
  let datos = null;
  try { datos = await anaBilleteraTabDatos(); } catch (e) { datos = null; }
  if (!datos || document.getElementById('adsTabRoot') !== box) return;
  box.innerHTML = anaAdsTabHTML();
}

// Re-pinta la billetera donde esté montada (carta y/o tab Ads).
function anaBilleteraPintar() {
  const h = anaBilleteraHTML();
  const a = document.getElementById('anaBoostRec'); if (a) a.innerHTML = h;
  const b = document.getElementById('adsTabRoot'); if (b) b.innerHTML = anaAdsTabHTML();
}

// ---------- LOTE R4 REDISEÑO (Impulsar) ----------
// Ads pasa a ser Impulsar con el diseño del mock (pane Ads): campaña activa
// con números reales, simulador con proyección ESTIMACIÓN, recomendación
// del mejor posteo como única fuente. La recomendación vive en Impulsar
// como una línea (LOTE A 8/11: Estrategia y la carta semanal eliminadas;
// el bloque de la carta es código dormido, las cartas viejas siguen
// legibles); la fuente viva es este tab, que lee el mejor posteo una sola
// vez en anaBilleteraTabDatos.
// Reglas duras: solo posteos ya publicados (v774); sin tasa USD→ARS ni
// política de reembolsos NO hay gasto real (§5.4 abierto: el botón
// Impulsar muestra el aviso y el servidor lo frena con
// conversion_pendiente antes de gastar); "Ventas cerradas" solo con
// reporte del cliente — sin fuente durable en v793 la línea NO se muestra
// nunca, ni un cero inventado; la proyección es ESTIMACIÓN, nunca promesa.

// Espejo en el cliente de simulador-impulsar.js (misma fórmula, mismos
// motivos; el módulo node es la referencia y la suite compara ambos).
function anaSimEstimar(input) {
  const presupuesto = Number((input && input.presupuestoUSD) || 0);
  if (!(presupuesto > 0) || !Number.isFinite(presupuesto)) return { ok: false, motivo: 'sin_presupuesto' };
  let gastoCents = 0, alcanceBase = 0, nBoosts = 0;
  for (const b of (input && Array.isArray(input.boosts) ? input.boosts : [])) {
    const alcance = Number((b && b.last_reach) || 0);
    const gasto = Number((b && b.last_spend_cents) || 0);
    if (alcance > 0 && gasto > 0) { gastoCents += gasto; alcanceBase += alcance; nBoosts++; }
  }
  if (!(alcanceBase > 0) || !(gastoCents > 0)) return { ok: false, motivo: 'sin_datos_pauta' };
  let comentarios = 0, alcancePosts = 0, nPosts = 0;
  for (const p of (input && Array.isArray(input.posts) ? input.posts : [])) {
    const alcance = Number((p && p.reach) || 0);
    if (alcance > 0) { alcancePosts += alcance; comentarios += Number((p && p.comments) || 0); nPosts++; }
  }
  if (!(alcancePosts > 0)) return { ok: false, motivo: 'sin_datos_cuenta' };
  const costo = (gastoCents / 100) / alcanceBase;
  const tasa = comentarios / alcancePosts;
  const alcance = presupuesto / costo;
  return { ok: true, consultas: Math.round(alcance * tasa), alcance: Math.round(alcance), costoPorAlcanceUSD: costo, tasaRespuesta: tasa, nBoosts, nPosts };
}

// Snap del deslizante al monto válido más cercano ($20/$50/$100, los de
// la billetera); en empate, al menor — nunca se gasta de más por redondeo.
function anaSimMontoValido(v) {
  const n = Number(v) || 0;
  let mejor = 20, dist = Infinity;
  for (const m of [20, 50, 100]) { const dd = Math.abs(n - m); if (dd < dist) { dist = dd; mejor = m; } }
  return mejor;
}

function anaSimCtaTxt(monto, dias) {
  return '🚀 ' + anaT('Impulsar con $' + monto + ' · ' + dias + ' días', 'Boost with $' + monto + ' · ' + dias + ' days');
}

// Línea de proyección del simulador: número solo con datos reales;
// sin datos, el motivo honesto (nunca un número inventado).
function anaSimProjHTML(presupuestoUSD) {
  const d = anaBilleteraDatos || {};
  const loc = anaLang === 'en' ? 'en-US' : 'es-AR';
  const est = anaSimEstimar({ presupuestoUSD: Number(presupuestoUSD) || 20, boosts: d.boosts || [], posts: d.elegibles || [] });
  if (!est.ok) {
    const txt = est.motivo === 'sin_datos_pauta'
      ? anaT('Todavía no hay datos de pauta en tu cuenta: el primer impulso con $20 nos da el costo real por consulta, y a partir de ahí esta estimación es tuya.', 'No ad data on your account yet: the first $20 boost gives us the real cost per inquiry, and from then on this estimate is yours.')
      : anaT('Todavía no hay datos suficientes en tu cuenta para estimar.', 'Not enough data on your account to estimate yet.');
    return `<div class="proj" id="impSimProj" style="font-size:13.5px;line-height:1.55;font-weight:600;color:#33506B">${esc(txt)}</div>`;
  }
  const porDolar = Math.max(1, Math.round(1 / est.costoPorAlcanceUSD));
  const tasaPct = (est.tasaRespuesta * 100).toLocaleString(loc, { maximumFractionDigits: 1 });
  const baseTxt = anaT(
    'Sale de tus números de Instagram: tus anuncios anteriores llegaron a ≈ ' + porDolar.toLocaleString(loc) + ' personas por $1, y el ' + tasaPct + '% te escribió.',
    'From your own Instagram numbers: your past ads reached ≈ ' + porDolar.toLocaleString(loc) + ' people per $1, and ' + tasaPct + '% wrote to you.');
  const lineaTxt = anaT(
    'Con <b>$' + (Number(presupuestoUSD) || 20) + '</b> Posty estima <b>≈ ' + est.consultas.toLocaleString(loc) + ' consultas</b> en la semana, apuntando a gente cerca de tu local.',
    'With <b>$' + (Number(presupuestoUSD) || 20) + '</b> Posty estimates <b>≈ ' + est.consultas.toLocaleString(loc) + ' inquiries</b> this week, targeting people near your business.');
  return `<div class="proj" id="impSimProj" style="font-size:14px;line-height:1.55;color:#0A1E33">${lineaTxt} <span style="display:inline-block;margin-top:6px;padding:2px 8px;background:#FEC14D;border-radius:999px;font-size:11.5px;font-weight:900;color:#0A1E33">${esc(anaT('ESTIMACIÓN', 'ESTIMATE'))}</span><span style="display:block;margin-top:6px;font-size:12.5px;font-weight:600;color:#33506B">${esc(baseTxt)} ${esc(anaT('No es una promesa: es lo que dicen tus datos.', 'Not a promise: it is what your data says.'))}</span></div>`;
}

// Tarjeta del simulador (mock: "Probá el presupuesto antes de gastarlo").
// El deslizante mueve la proyección en vivo sin repintar (el repintado
// entero destruiría el deslizante a mitad del arrastre); al soltar se
// ajusta al monto válido y ahí sí se repinta. El botón Impulsar vive
// acá y usa el flujo real (anaBilleteraImpulsar): con conversión
// pendiente el servidor lo frena antes de gastar y el aviso ya está
// visible debajo del botón ANTES del toque.
function anaSimCardHTML() {
  const d = anaBilleteraDatos || {};
  const bil = d.billetera || {};
  const selMonto = Number(d.selMonto) || 20;
  const dias = Number(bil.dias) || 7;
  const notaConv = d.conversion_pendiente === true
    ? `<p style="margin:8px 0 0;text-align:center;font-size:12.5px;line-height:1.45;color:#5A4A6B">${esc(anaT('Queda armado por 7 días. Todavía no se puede gastar porque falta definir la conversión USD→ARS. No se gasta nada todavía.', 'Armed for 7 days. It can’t be spent yet because the USD→ARS conversion isn’t set. Nothing is spent yet.'))}</p>`
    : '';
  return `<div class="card" id="impSimCard">
    <h4 style="margin:0 0 4px">${esc(anaT('Probá el presupuesto antes de gastarlo', 'Try the budget before spending it'))}</h4>
    <p class="sub" style="margin:0 0 12px">${esc(anaT('Mové el control y Posty estima el resultado con los números de tu propia cuenta, no con promedios de internet.', 'Move the slider and Posty estimates the result with your own account’s numbers, not internet averages.'))}</p>
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px"><span style="font-size:13.5px;font-weight:800;color:#0A1E33">${esc(anaT('Presupuesto por 7 días', 'Budget for 7 days'))}</span><span id="impSimVal" style="font-size:15px;font-weight:900;color:#0A1E33">$${selMonto}</span></div>
    <input type="range" id="impSimRange" min="20" max="100" step="10" value="${selMonto}" oninput="anaSimSliderInput(this)" onchange="anaSimSliderChange(this)" aria-label="${esc(anaT('Presupuesto por 7 días', 'Budget for 7 days'))}" style="width:100%;margin:8px 0 10px">
    ${anaSimProjHTML(selMonto)}
    <button type="button" id="impSimCta" onclick="anaBilleteraImpulsar(this)" style="width:100%;padding:14px;border:0;border-radius:14px;background:#FEC14D;color:#0A1E33;font-size:16px;font-weight:900;cursor:pointer;margin:12px 0 6px">${esc(anaSimCtaTxt(selMonto, dias))}</button>
    <p style="margin:0;text-align:center;font-size:12.5px;color:#5A4A6B">${esc(anaT('Posty elige el público y lo gestiona.', 'Posty picks the audience and runs it.'))}</p>
    ${notaConv}
    <div class="ana-boostrec-msg" id="anaBoostRecMsg"></div>
  </div>`;
}

function anaSimSliderInput(el) {
  if (!el || !anaBilleteraDatos) return;
  const v = Number(el.value) || 20;
  const val = document.getElementById('impSimVal');
  if (val) val.textContent = '$' + v;
  const proj = document.getElementById('impSimProj');
  if (proj) proj.outerHTML = anaSimProjHTML(v);
  const cta = document.getElementById('impSimCta');
  if (cta) cta.textContent = anaSimCtaTxt(anaSimMontoValido(v), Number(((anaBilleteraDatos.billetera) || {}).dias) || 7);
}

function anaSimSliderChange(el) {
  if (!el || !anaBilleteraDatos) return;
  anaBilleteraDatos.selMonto = anaSimMontoValido(Number(el.value) || 20);
  anaBilleteraPintar();
}

// Ir al simulador / al destacado: scroll real a la sección (nunca un
// botón que solo avisa).
function anaImpIrSimulador() {
  const el = document.getElementById('impSimCard');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function anaImpIrDestacado() {
  const el = document.getElementById('impDestacado');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Tarjeta de campaña (mock: titular = resultado, dinero abajo, chico).
// Solo números reales de Meta (alcance y gasto reportados) y del
// presupuesto. "Ventas cerradas" NO se muestra: sin reporte del cliente
// no hay fuente — ni un cero inventado. Sin campaña activa, estado
// honesto con botón que lleva al simulador.
function anaCampanaActivaHTML() {
  const d = anaBilleteraDatos || {};
  const loc = anaLang === 'en' ? 'en-US' : 'es-AR';
  const boosts = Array.isArray(d.boosts) ? d.boosts : [];
  const activa = boosts.find((b) => b && b.status === 'active') || boosts.find((b) => b && b.status === 'pending') || null;
  if (!activa) {
    return `<div class="card" id="impCampanaCard">
    <h4 style="margin:0 0 4px">${esc(anaT('Sin campaña activa', 'No active campaign'))}</h4>
    <p class="sub" style="margin:0 0 10px">${esc(anaT('Todavía no impulsaste ningún posteo. Probá un presupuesto y Posty se ocupa del resto.', "You haven't boosted any post yet. Try a budget and Posty handles the rest."))}</p>
    <button type="button" onclick="anaImpIrSimulador()" style="padding:10px 14px;border:2px solid #DCEFFF;border-radius:12px;background:#fff;font-size:14px;font-weight:800;color:#2793C8;cursor:pointer">${esc(anaT('Probar un presupuesto →', 'Try a budget →'))}</button>
  </div>`;
  }
  const post = (d.feed || []).find((p) => Number(p.post_id) === Number(activa.post_id)) || (d.elegibles || []).find((e) => Number(e.post_id) === Number(activa.post_id)) || null;
  const titulo = post && post.caption ? anaCortarCaption(post.caption, 60) : anaT('Tu campaña activa', 'Your active campaign');
  const alcance = Number(activa.last_reach || 0);
  const gastado = Math.floor(Number(activa.last_spend_cents || 0) / 100);
  const presupuesto = Math.floor(Number(activa.budget_cents || 0) / 100);
  const moneda = (activa.currency && activa.currency !== 'USD') ? ' ' + activa.currency : '';
  const pill = activa.status === 'active'
    ? `<span style="display:inline-flex;align-items:center;gap:6px;background:#E6F7EE;color:#0E6B4C;font-size:11.5px;font-weight:900;padding:4px 10px;border-radius:999px">● ${esc(anaT('ACTIVA', 'ACTIVE'))}</span>`
    : `<span style="display:inline-flex;align-items:center;gap:6px;background:#FFF3D6;color:#8A6D00;font-size:11.5px;font-weight:900;padding:4px 10px;border-radius:999px">● ${esc(anaT('PENDIENTE', 'PENDING'))}</span>`;
  let diasTxt = '';
  try {
    const ini = new Date(String(activa.created_at || '').replace(' ', 'T'));
    const fin = new Date(ini.getTime() + (Number(activa.duration_days) || 7) * 86400000);
    const restan = Math.ceil((fin.getTime() - Date.now()) / 86400000);
    diasTxt = restan > 0
      ? anaT('quedan ' + restan + (restan === 1 ? ' día' : ' días'), restan + (restan === 1 ? ' day left' : ' days left'))
      : anaT('terminó el ', 'ended ') + fin.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  } catch (e) { diasTxt = ''; }
  const grande = alcance > 0
    ? `<div style="font-size:32px;font-weight:900;color:#0A1E33;line-height:1;margin:8px 0 2px">${alcance.toLocaleString(loc)} <span style="font-size:18px">${esc(anaT('personas alcanzadas', 'people reached'))}</span></div>`
    : `<div style="font-size:20px;font-weight:900;color:#0A1E33;line-height:1.2;margin:8px 0 2px">${esc(anaT('Todavía sin alcance reportado de Meta', 'No reach reported by Meta yet'))}</div>`;
  const sub = gastado > 0
    ? esc(anaT('Gastados $' + gastado.toLocaleString(loc) + moneda + ' de $' + presupuesto.toLocaleString(loc) + moneda, 'Spent $' + gastado.toLocaleString(loc) + moneda + ' of $' + presupuesto.toLocaleString(loc) + moneda)) + (diasTxt ? ' · ' + esc(diasTxt) : '')
    : esc(anaT('Presupuesto $' + presupuesto.toLocaleString(loc) + moneda + ' · gasto todavía sin reportar de Meta', 'Budget $' + presupuesto.toLocaleString(loc) + moneda + ' · spend not reported by Meta yet')) + (diasTxt ? ' · ' + esc(diasTxt) : '');
  return `<div class="card" id="impCampanaCard">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <h4 style="margin:0">${esc(titulo)}</h4>
      ${pill}
    </div>
    ${grande}
    <p class="sub" style="margin:0">${sub}</p>
  </div>`;
}

// Tarjeta de recomendación (mock: "Recomendación de Posty" + "Aplicar →").
// Única fuente: el mejor posteo de la semana (GET /api/estrategia/
// mejor-posteo, ya cargado en anaBilleteraDatos). Sin mejor, no hay
// tarjeta — nunca un recomendado inventado.
function anaRecomendacionHTML() {
  const d = anaBilleteraDatos || {};
  const mejor = d.mejor || null;
  if (!mejor) return '';
  const partes = anaBoostRecPartes(mejor);
  const porque = partes.length
    ? anaT('Fue tu posteo con más interacción esta semana: ', 'Your highest-engagement post this week: ') + partes.join(', ') + '.'
    : anaT('Fue tu posteo con más interacción esta semana.', 'Your highest-engagement post this week.');
  const img = mejor.image_path ? `<img src="${esc(mejor.image_path)}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:10px;flex-shrink:0">` : '';
  const cap = mejor.caption ? `<p style="margin:0;font-size:13px;font-weight:700;color:#0A1E33;line-height:1.4">${esc(anaCortarCaption(mejor.caption, 90))}</p>` : '';
  const yaElegido = Number(d.selId || 0) === Number(mejor.post_id);
  const enFeed = (d.feed || []).find((p) => Number(p.post_id) === Number(mejor.post_id)) || null;
  const yaImpulsado = !!(enFeed && enFeed.ya_impulsado);
  const accion = yaElegido
    ? `<p style="margin:10px 0 0;font-size:13px;font-weight:800;color:#1FA855">✓ ${esc(anaT('Este es el posteo elegido para impulsar.', 'This is the post chosen to boost.'))}</p>`
    : yaImpulsado
      ? `<p style="margin:10px 0 0;font-size:13px;font-weight:800;color:#47617A">${esc(anaT('Este posteo ya tiene ads activos.', 'This post already has active ads.'))}</p>`
      : `<button type="button" onclick="anaRecAplicar()" style="margin-top:10px;padding:10px 14px;border:2px solid #DCEFFF;border-radius:12px;background:#fff;font-size:14px;font-weight:800;color:#2793C8;cursor:pointer">${esc(anaT('Aplicar →', 'Apply →'))}</button>`;
  return `<div class="card" id="impRecCard">
    <div style="display:flex;gap:10px;align-items:flex-start">
      <span style="font-size:20px;line-height:1">💡</span>
      <div style="flex:1;min-width:0">
        <p style="margin:0;font-size:14px;line-height:1.55;color:#0A1E33"><b>${esc(anaT('Recomendación de Posty:', 'Posty recommends:'))}</b> ${esc(porque)}</p>
        <div style="display:flex;gap:10px;align-items:center;margin-top:10px">${img}<div style="flex:1;min-width:0">${cap}</div></div>
        ${accion}
        <div class="ana-boostrec-msg" id="anaRecMsg"></div>
      </div>
    </div>
  </div>`;
}

// "Aplicar →": el recomendado pasa a ser el posteo elegido (si se puede
// impulsar: publicado y sin pauta activa). Repinta y baja al destacado,
// donde se ve el cambio de verdad. Nunca elige un posteo no elegible.
function anaRecAplicar() {
  const d = anaBilleteraDatos;
  if (!d || !d.mejor) return;
  const id = Number(d.mejor.post_id) || 0;
  if (!id) return;
  const decir = (t) => { const m = document.getElementById('anaRecMsg'); if (m) m.textContent = t; };
  const enFeed = (d.feed || []).find((p) => Number(p.post_id) === id) || null;
  if (enFeed && enFeed.ya_impulsado) { decir(anaT('Este posteo ya tiene ads activos.', 'This post already has active ads.')); return; }
  const eleg = (d.elegibles || []).find((e) => Number(e.post_id) === id) || null;
  if (!eleg) { decir(anaT('Este posteo todavía no se puede impulsar.', 'This post can’t be boosted yet.')); return; }
  d.selId = id;
  d.selPost = eleg;
  anaBilleteraPintar();
  anaImpIrDestacado();
}

// ---------- TAB ADS DIRECTO (LOTE ADS-DIRECTO v759 · mock v4 aprobado) ----------
// La pantalla Ads directa: billetera visible con Cargar + carga
// automática con regla visible, montos en UNA fila, publicado más
// reciente destacado y pre-seleccionado, botón Feed con la grilla de
// solo publicados, Impulsar en 1 toque cuando todo está
// pre-seleccionado. La carta de Estrategia (anaBilleteraHTML) no se toca.
// (LOTE ADS-SOLO-PUBLICADOS) El posteo de hoy programado no es el
// destacado ni entra en la grilla.
function anaAdsDirectoHTML() {
  const d = anaBilleteraDatos || {};
  const bil = d.billetera || {};
  const saldo = Math.floor(Number(bil.balance_cents || 0) / 100);
  const moneda = bil.currency || 'USD';
  const selMonto = Number(d.selMonto) || 20;
  const dias = Number(bil.dias) || 7;
  const selPost = d.selPost || null;
  const mejor = d.mejor || null;
  const autoOn = !!d.auto_topup;
  const esMejor = !!(selPost && mejor && Number(selPost.post_id) === Number(mejor.post_id));
  const backBtn = `<a href="#/app/inicio" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:1.5px solid #DCEFFF;background:#fff;color:#0A1E33;font-size:18px;text-decoration:none;flex:0 0 auto">←</a>`;
  // Tirita de pasos: 1 Posteo · 2 Monto · 3 Impulsar. El 1 se tilda
  // cuando hay posteo elegido; el 2 siempre (el monto nace elegido).
  const paso = (n, txt, listo) => `<span style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#0A1E33"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${listo ? '#FEC14D' : '#E8F1F8'};color:#0A1E33;font-size:12px;font-weight:900">${listo ? '✓' : n}</span>${esc(txt)}</span>`;
  const pasos = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:1px solid #DCEFFF;border-radius:14px;padding:10px 14px;margin-bottom:14px">${paso(1, anaT('Posteo', 'Post'), !!selPost)}<span style="color:#B9CBD9">·</span>${paso(2, anaT('Monto', 'Amount'), true)}<span style="color:#B9CBD9">·</span>${paso(3, anaT('Impulsar', 'Boost'), false)}</div>`;
  // Billetera: saldo + UNA fila de montos + Cargar + automática.
  const montos = `<div class="ana-ads-montos" style="display:flex;gap:8px;margin:10px 0">${[20, 50, 100].map((x) => `<button type="button" onclick="anaBilleteraElegirMonto(${x}, this)" style="flex:1;padding:10px 0;border:2px solid ${x === selMonto ? '#FEC14D' : '#DCEFFF'};border-radius:12px;background:${x === selMonto ? '#FFF8E1' : '#fff'};font-size:15px;font-weight:800;color:#0A1E33;cursor:pointer">$${x}</button>`).join('')}</div>`;
  const toggle = `<button type="button" data-auto="${autoOn ? 'on' : 'off'}" onclick="anaBilleteraAutoToggle(this)" aria-label="${esc(anaT('Carga automática', 'Auto top-up'))}" style="width:52px;height:30px;border-radius:999px;background:${autoOn ? '#1FA855' : '#CBD5E1'};border:0;position:relative;cursor:pointer;flex:0 0 auto;padding:0"><span style="position:absolute;top:3px;${autoOn ? 'right:3px' : 'left:3px'};width:24px;height:24px;border-radius:50%;background:#fff;display:block"></span></button>`;
  const walletCard = `<div class="card">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
      <span style="font-size:15px;font-weight:900;color:#0A1E33">${esc(anaT('Billetera', 'Wallet'))}</span>
      <span style="font-size:22px;font-weight:900;color:#0A1E33">$${saldo} ${esc(moneda)}</span>
    </div>
    ${montos}
    <button type="button" onclick="anaAdsCargar(this)" style="width:100%;padding:12px;border:0;border-radius:12px;background:#2793C8;color:#fff;font-size:15px;font-weight:900;cursor:pointer">↓ ${esc(anaT('Cargar $' + selMonto, 'Top up $' + selMonto))}</button>
    <div class="ana-boostrec-msg" id="anaAdsCargarMsg"></div>
    <p style="margin:8px 0 0;text-align:center;font-size:12px;color:#5A4A6B">${esc(anaT('La primera carga es en USD', 'Your first top-up is in USD'))}</p>
    ${anaTarjetaBtnHTML(d)}
    <div style="display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid #E8F1F8">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;color:#0A1E33">${esc(anaT('Carga automática', 'Auto top-up'))}</div>
        <div style="font-size:12.5px;color:#5A4A6B;line-height:1.4">${esc(anaT('cuando se acaba, carga $' + selMonto + ' desde tu banco', 'when it runs out, it tops up $' + selMonto + ' from your bank'))}</div>
        ${(!autoOn && !d.tiene_tarjeta) ? `<div style="font-size:12.5px;color:#5A4A6B;line-height:1.4;margin-top:2px">${esc(anaT('Necesitás una tarjeta guardada para prenderla.', 'You need a saved card to turn it on.'))}</div>` : ''}
      </div>
      ${toggle}
    </div>
  </div>`;
  // Posteo destacado: el elegido (por defecto, el publicado más
  // reciente), con borde amarillo + tilde verde, y su chip (el que más
  // rindió, cuando el elegido es el mejor de la semana). El posteo de hoy
  // programado nunca es el destacado: todavía no está publicado.
  const chipDestacado = esMejor
    ? `<span style="display:inline-block;margin-top:8px;padding:2px 8px;background:#FEC14D;border-radius:999px;font-size:12px;font-weight:800;color:#0A1E33">${esc(anaT('✦ el que más rindió', '✦ top performer'))}</span>` : '';
  const destacado = selPost
    ? `<div style="position:relative;background:#fff;border:2px solid #FEC14D;border-radius:16px;overflow:hidden;margin-bottom:14px">
      <span style="position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;background:#1FA855;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;z-index:1">✓</span>
      ${selPost.image_path ? `<img src="${esc(selPost.image_path)}" alt="" style="width:100%;aspect-ratio:1/1;object-fit:contain;display:block;background:#E8F1F8">` : ''}
      <div style="padding:12px 14px"><div style="font-size:14px;font-weight:700;color:#0A1E33;line-height:1.4">${esc(anaCortarCaption(selPost.caption || '', 90))}</div>${chipDestacado}</div>
    </div>`
    : `<p class="ana-boostrec-nota">${esc(anaT('Todavía no tenés posteos para impulsar.', "You don't have posts to boost yet."))}</p>`;
  // (LOTE R4 REDISEÑO) El botón Impulsar vive en la tarjeta del
  // simulador (anaSimCardHTML), junto a la proyección y al aviso de
  // sin-tasa; el mensaje #anaBoostRecMsg vive ahí también.
  const feedBtn = `<button type="button" onclick="anaAdsAbrirFeed()" style="width:100%;padding:12px;border:2px solid #DCEFFF;border-radius:14px;background:#fff;font-size:14.5px;font-weight:800;color:#0A1E33;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect x="1" y="1" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="6.7" y="1" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="12.4" y="1" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="1" y="6.7" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="6.7" y="6.7" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="12.4" y="6.7" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="1" y="12.4" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="6.7" y="12.4" width="4.6" height="4.6" rx="1" fill="#2793C8"/><rect x="12.4" y="12.4" width="4.6" height="4.6" rx="1" fill="#2793C8"/></svg>${esc(anaT('Elegí qué foto del feed impulsar', 'Choose which feed photo to boost'))}</button>`;
  const hist = `<div class="card"><h3 style="margin:0 0 6px">${esc(anaT('Últimos impulsos', 'Recent boosts'))}</h3><div id="adsHistorial">${anaBilleteraHistorialHTML()}</div></div>`;
  // (LOTE R4 REDISEÑO) La pantalla es Impulsar (mock: pane Ads):
  // mensaje de Posty, campaña activa con números reales, billetera,
  // destacado, simulador con el botón Impulsar, recomendación, Feed,
  // historial. La ruta sigue siendo #/app/ads.
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">${backBtn}<div style="flex:1;min-width:0"><div style="font-size:20px;font-weight:900;color:#0A1E33;line-height:1.2">${esc(anaT('Impulsar', 'Boost'))}</div><div style="font-size:13.5px;color:#5A4A6B;line-height:1.4">${esc(anaT('Impulsá tus posteos y que te vean más clientes.', 'Boost your posts so more customers see you.'))}</div></div></div>
  <p style="margin:0 0 14px;font-size:15px;font-weight:600;line-height:1.5;color:#0A1E33">${esc(anaT('Tus anuncios, traducidos a resultados: nada de CPC ni CPM. Solo cuánta gente te escribió y cuánto te costó cada una. 🎯', 'Your ads, translated into results: no CPC or CPM. Just how many people wrote to you and what each one cost. 🎯'))}</p>
  ${pasos}
  ${anaCampanaActivaHTML()}
  ${walletCard}
  <div id="impDestacado">${destacado}</div>
  ${anaSimCardHTML()}
  ${anaRecomendacionHTML()}
  ${feedBtn}
  ${hist}`;
}

// Grilla del feed: SOLO los posteos publicados (el de hoy programado no
// entra hasta que se publique: todavía no existe en Instagram). 3
// columnas, borde a borde (el sangrado -14px cancela el padding de
// .bb-main), scroll nativo.
// La elegida lleva borde amarillo + tilde verde; la que ya tiene ads
// lleva su marca y no se puede volver a elegir.
// (LOTE ADS-FEED-STORIES · 7/11) La grilla muestra la imagen ENTERA:
// object-fit:contain sobre fondo neutro — con cover el recorte cuadrado
// cortaba los titulares de las imágenes 4:5 (viven en las bandas
// superior/inferior). La celda sigue 1/1 para que la grilla no se
// descuadre; lo mismo vale para el destacado de la vista principal.
function anaAdsFeedHTML() {
  const d = anaBilleteraDatos || {};
  const feed = Array.isArray(d.feed) ? d.feed : [];
  const lista = feed.slice();
  const backBtn = `<button type="button" onclick="anaAdsCerrarFeed()" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:1.5px solid #DCEFFF;background:#fff;color:#0A1E33;font-size:18px;cursor:pointer;flex:0 0 auto;padding:0">←</button>`;
  const celdas = lista.map((p) => {
    const esElegida = Number(p.post_id) === Number(d.selId || 0);
    const chip = p.ya_impulsado
      ? `<span style="position:absolute;left:6px;bottom:6px;padding:2px 8px;background:rgba(10,30,51,.75);border-radius:999px;font-size:11px;font-weight:800;color:#fff">${esc(anaT('Con ads', 'With ads'))}</span>` : '';
    return `<button type="button" onclick="anaAdsElegirFeed(${p.post_id}, this)" style="position:relative;padding:0;border:0;background:#E8F1F8;cursor:pointer;aspect-ratio:1/1;overflow:hidden;${esElegida ? 'box-shadow:inset 0 0 0 3px #FEC14D;' : ''}">${p.image_path ? `<img src="${esc(p.image_path)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:contain;display:block">` : ''}${esElegida ? '<span style="position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:#1FA855;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900">✓</span>' : ''}${chip}</button>`;
  }).join('');
  const grid = lista.length
    ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-left:-14px;margin-right:-14px">${celdas}</div>`
    : `<p class="ana-boostrec-nota">${esc(anaT('Todavía no tenés posteos publicados en tu feed.', "You don't have published posts in your feed yet."))}</p>`;
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">${backBtn}<div style="flex:1;min-width:0"><div style="font-size:20px;font-weight:900;color:#0A1E33;line-height:1.2">${esc(anaT('Tu feed', 'Your feed'))}</div><div style="font-size:13.5px;color:#5A4A6B;line-height:1.4">${esc(anaT('Tocá la foto que querés impulsar', 'Tap the photo you want to boost'))}</div></div><span style="font-size:13px;font-weight:800;color:#0A1E33;white-space:nowrap">${esc(anaT(lista.length + ' posteos', lista.length + ' posts'))}</span></div>
  <div class="ana-boostrec-msg" id="anaAdsFeedMsg"></div>
  ${grid}`;
}

// Despachador del tab Ads: grilla o vista principal.
function anaAdsTabHTML() {
  // (R4) El tab Ads nunca llamaba a anaSetLang: anaLang quedaba en su
  // 'es' por defecto y TODO el tab — incluido el Impulsar nuevo — salía
  // en español aunque la cuenta fuera EN. Sin argumento, anaSetLang toma
  // el idioma de la cuenta (ME.lang); en VM sin ME, 'es' como antes.
  try { anaSetLang(); } catch (e) {}
  return (anaBilleteraDatos && anaBilleteraDatos.vistaFeed) ? anaAdsFeedHTML() : anaAdsDirectoHTML();
}

function anaAdsAbrirFeed() {
  if (!anaBilleteraDatos) return;
  anaBilleteraDatos.vistaFeed = true;
  anaBilleteraPintar();
}
function anaAdsCerrarFeed() {
  if (!anaBilleteraDatos) return;
  anaBilleteraDatos.vistaFeed = false;
  anaBilleteraPintar();
}

// Elegir desde la grilla: la elegida pasa a ser el destacado y se
// vuelve a la vista principal. La que ya tiene ads no se elige: avisa
// y no cambia nada.
function anaAdsElegirFeed(id, btn) {
  const d = anaBilleteraDatos;
  if (!d) return;
  const nid = Number(id) || 0;
  const enFeed = (d.feed || []).find((p) => Number(p.post_id) === nid) || null;
  if (enFeed && enFeed.ya_impulsado) {
    const m = document.getElementById('anaAdsFeedMsg');
    if (m) m.textContent = anaBoostRecMotivo('ya_impulsado');
    return;
  }
  const enEleg = (d.elegibles || []).find((e) => Number(e.post_id) === nid) || null;
  d.selId = nid;
  // Sin fallback al hoy: el programado no se puede elegir (no está en la
  // grilla); si el id no es un publicado, el destacado queda vacío.
  d.selPost = enFeed || enEleg || ((d.selPost && Number(d.selPost.post_id) === nid) ? d.selPost : null);
  d.vistaFeed = false;
  anaBilleteraPintar();
}

// Carga automática: un toque la prende o la apaga. Prenderla exige
// tarjeta guardada (lo verifica el servidor); si no la hay, queda
// apagada y se dice por qué. Apagarla nunca cobra ni verifica nada.
async function anaBilleteraAutoToggle(btn) {
  const d = anaBilleteraDatos || {};
  const nuevo = !d.auto_topup;
  if (btn) btn.disabled = true;
  let j = null;
  try { j = await api.post('/api/ads/billetera/auto', { on: nuevo }); } catch (e) { j = (e && e.data) || null; }
  if (btn) btn.disabled = false;
  if (j && j.ok) {
    anaBilleteraDatos.auto_topup = j.auto_topup ? 1 : 0;
    anaBilleteraPintar();
    const msg = document.getElementById('anaBoostRecMsg');
    if (msg) msg.textContent = nuevo
      ? anaT('Listo, la carga automática está prendida: cuando se acabe el saldo, carga $' + (Number(d.selMonto) || 20) + ' desde tu banco.', 'Done, auto top-up is on: when the balance runs out, it tops up $' + (Number(d.selMonto) || 20) + ' from your bank.')
      : anaT('Listo, la carga automática está apagada.', 'Done, auto top-up is off.');
  } else {
    const msg = document.getElementById('anaBoostRecMsg');
    if (msg) msg.textContent = anaBoostRecMotivo((j && j.motivo) || '', Number(d.selMonto) || 20);
  }
}

// Historial real de impulsos (de /api/ads/boosts: la misma tabla que
// escribe la billetera). Estado, monto, días, fechas y —cuando Meta ya los
// reportó— alcance y gasto reales. Sin clics: el endpoint no los trae y no
// se inventan (el mock mostraba «1.840 clics» ilustrativos).
function anaBilleteraHistorialHTML() {
  const boosts = (anaBilleteraDatos && Array.isArray(anaBilleteraDatos.boosts)) ? anaBilleteraDatos.boosts : [];
  if (!boosts.length) return `<p class="ana-note">${anaT('Todavía no impulsaste ningún posteo. Cuando lo hagas, aparece acá con sus números reales.', "You haven't boosted any post yet. When you do, it shows here with its real numbers.")}</p>`;
  const en = anaLang === 'en';
  const loc = en ? 'en-US' : 'es-AR';
  const fechaCorta = (ts) => { try { return new Date(String(ts).replace(' ', 'T')).toLocaleDateString(loc, { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
  const hasta = (b) => {
    try {
      const ini = new Date(String(b.created_at).replace(' ', 'T'));
      const fin = new Date(ini.getTime() + (Number(b.duration_days) || 7) * 86400000);
      return fin.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
    } catch (e) { return ''; }
  };
  const estadoTxt = (b) => {
    if (b.status === 'active') return `<span style="display:inline-block;padding:2px 8px;background:#E6F7EE;color:#1FA855;border-radius:999px;font-size:12px;font-weight:800">${anaT('Activo', 'Active')}</span>`;
    if (b.status === 'pending') return `<span style="display:inline-block;padding:2px 8px;background:#FFF3D6;color:#8A6D00;border-radius:999px;font-size:12px;font-weight:800">${anaT('Pendiente', 'Pending')}</span>`;
    if (b.status === 'finished') return `<span style="display:inline-block;padding:2px 8px;background:#EDF1F5;color:#47617A;border-radius:999px;font-size:12px;font-weight:800">${anaT('Terminado', 'Finished')}</span>`;
    if (b.status === 'error') return `<span style="display:inline-block;padding:2px 8px;background:#FDECEC;color:#B3261E;border-radius:999px;font-size:12px;font-weight:800">${anaT('Revisar', 'Needs review')}</span>`;
    return `<span style="display:inline-block;padding:2px 8px;background:#EDF1F5;color:#47617A;border-radius:999px;font-size:12px;font-weight:800">${esc(String(b.status || ''))}</span>`;
  };
  const montoTxt = (b) => {
    const m = Math.floor(Number(b.budget_cents || 0) / 100);
    return '$' + m.toLocaleString(loc) + ((b.currency && b.currency !== 'USD') ? ' ' + b.currency : '');
  };
  return boosts.slice(0, 5).map((b) => {
    const dias = Number(b.duration_days) || 7;
    const alcance = Number(b.last_reach || 0);
    const gastado = Math.floor(Number(b.last_spend_cents || 0) / 100);
    const det = [anaT('Posteo #', 'Post #') + (b.post_id || '?')];
    const fIni = fechaCorta(b.created_at); if (fIni) det.push(fIni);
    const fFin = hasta(b); if (fFin) det.push(anaT('hasta ', 'until ') + fFin);
    if (alcance > 0) det.push(anaT('Alcance ', 'Reach ') + alcance.toLocaleString(loc));
    if (gastado > 0) det.push(anaT('Gastado $', 'Spent $') + gastado.toLocaleString(loc));
    return `<div style="padding:10px 0;border-top:1px solid #EDF1F5">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span style="font-size:14px;font-weight:800;color:#0A1E33">${montoTxt(b)} · ${dias} ${anaT('días', 'days')}</span>
        ${estadoTxt(b)}
      </div>
      <div style="font-size:12px;color:var(--mut);margin-top:4px">${esc(det.join(' · '))}</div>
    </div>`;
  }).join('') + (boosts.length > 5 ? `<p class="ana-note">${anaT('Mostramos los 5 más recientes.', 'Showing the 5 most recent.')}</p>` : '');
}

function anaBilleteraHistorialPintar() {
  const box = document.getElementById('adsHistorial');
  if (box) box.innerHTML = anaBilleteraHistorialHTML();
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
  const fotos = (d && d.fotos) || {};
  // (SABE-SIEMPRE · ítem 2) La pregunta semanal con fotos: cada producto
  // con foto sale como tarjeta tocable (la foto es de sus propios
  // posteos, nunca stock); sin foto, la chip de texto de siempre. Tocar
  // una foto la selecciona para ESTA semana; el botón de abajo la guarda.
  const list = (d.productos || []).map((p) => {
    const f = fotos[p.nombre];
    if (f) return '<button type="button" class="ana-fl-foto" data-prod="' + esc(p.nombre) + '" onclick="anaFlToggleFoto(this)" style="display:inline-block;vertical-align:top;margin:2px 6px 6px 0;padding:0 0 6px;border:2px solid #DCEFFF;border-radius:14px;background:#fff;cursor:pointer;overflow:hidden;width:104px"><img src="' + esc(f) + '" alt="" loading="lazy" style="display:block;width:104px;height:78px;object-fit:cover"><span style="display:block;padding:4px 6px 0;font-size:13px;font-weight:700;color:#0A1E33;line-height:1.2">' + esc(p.nombre) + '</span></button>';
    return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:6px 10px;background:#fff;border:1px solid #DCEFFF;border-radius:999px;font-size:14px;font-weight:700;color:#0A1E33">' + esc(p.nombre) + '</span>';
  }).join('');
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
    + (d.semana_elegida && d.semana_elegida.productos && d.semana_elegida.productos.length ? '<p class="ana-note" style="margin-top:10px">' + anaT('Tu semana ya está elegida con: ', 'Your week is already picked with: ') + d.semana_elegida.productos.map((n) => esc(n)).join(' · ') + '</p>' : '')
    + '<div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="anaFlSeguir(this)">' + anaT('Sigue igual', 'Still the same') + '</button> <button id="anaFlElegirBtn" class="btn btn-primary btn-sm" style="display:none" onclick="anaFlElegirSemana(this)">' + anaT('Armar mi semana con estos', 'Build my week with these') + '</button></div>'
    + '<div style="margin-top:10px"><input id="anaFlEdit" class="oc-field" style="font-size:15px;padding:10px 12px" placeholder="' + anaT('Escribí un producto nuevo o uno corregido', 'Write a new or corrected product') + '"><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="anaFlEditar(this)">' + anaT('Guardar cambio', 'Save change') + '</button></div>'
    + '<p id="anaFlMsg" class="ana-note" style="display:none"></p>';
}
function anaFlToggleFoto(btn) {
  if (!btn) return;
  const sel = btn.getAttribute('data-sel') === '1';
  btn.setAttribute('data-sel', sel ? '0' : '1');
  btn.style.borderColor = sel ? '#DCEFFF' : '#FEC14D';
  btn.style.background = sel ? '#fff' : '#FFF8E1';
  const box = document.getElementById('anaFlBox');
  const n = box ? box.querySelectorAll('.ana-fl-foto[data-sel="1"]').length : 0;
  const b = document.getElementById('anaFlElegirBtn');
  if (b) b.style.display = n > 0 ? 'inline-block' : 'none';
}
function anaFlElegirSemana(btn) {
  const box = document.getElementById('anaFlBox');
  if (!box) return;
  const names = Array.from(box.querySelectorAll('.ana-fl-foto[data-sel="1"]')).map((el) => el.getAttribute('data-prod') || '').filter(Boolean);
  if (!names.length) return;
  fetch('/api/fundamento/semana-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productos: names }) }).then((r) => r.json()).then((d) => {
    const m = document.getElementById('anaFlMsg');
    if (m) { m.style.display = 'block'; m.textContent = (d && d.ok) ? anaT('Listo, tu semana se arma con estos.', 'Done, your week is built from these.') : anaT('No pudimos guardar tu elección ahora.', 'We could not save your pick right now.'); }
    if (d && d.ok) anaFlConfirmLoad();
  }).catch(() => {
    const m = document.getElementById('anaFlMsg');
    if (m) { m.style.display = 'block'; m.textContent = anaT('No pudimos guardar tu elección ahora.', 'We could not save your pick right now.'); }
  });
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

// ---------- ESTUDIO-PROFUNDO · M6 RE-ESTUDIO SEMANAL: tarjeta «qué cambió» ----------
// Carga bajo demanda la última corrida del re-estudio y la rinde en la
// carta: qué cambió en el negocio esta semana (productos, precios,
// promos) y los conflictos pendientes — un dato que el estudio fresco
// contradice y que el cliente corrigió queda con SU valor hasta que él
// decida (botones «Queda como está» / «Usar lo nuevo»). Sin corrida, la
// tarjeta no se dibuja (nada inventado). ES+EN en paridad (anaT).
function anaRestudioLoad() {
  const box = document.getElementById('anaRestudioBox');
  if (!box) return;
  fetch('/api/estudio/ultimo-cambio').then((r) => r.json()).then((d) => {
    if (!d || !d.ok || !d.run) return;
    anaRestudioRender(d.run);
  }).catch(() => { /* sin corrida o sin red: la tarjeta no se dibuja */ });
}
function anaRestudioLinea(c) {
  if (!c || !c.tipo) return '';
  const it = esc(String(c.item || ''));
  if (c.tipo === 'producto_nuevo') return '+ ' + it + (c.despues ? ' · ' + esc(String(c.despues)) : '') + ' ' + anaT('(producto nuevo)', '(new product)');
  if (c.tipo === 'producto_falta') return '− ' + it + ' ' + anaT('(ya no está)', '(no longer listed)');
  if (c.tipo === 'precio_cambio') return it + ': ' + esc(String(c.antes || '—')) + ' → ' + esc(String(c.despues || '—'));
  if (c.tipo === 'servicio_nuevo') return '+ ' + it + ' ' + anaT('(servicio nuevo)', '(new service)');
  if (c.tipo === 'servicio_falta') return '− ' + it + ' ' + anaT('(ya no está)', '(no longer listed)');
  if (c.tipo === 'promo_nueva') return '+ ' + it + ' ' + anaT('(promo nueva)', '(new promo)');
  if (c.tipo === 'promo_falta') return '− ' + it + ' ' + anaT('(promo terminada)', '(promo ended)');
  return '';
}
function anaRestudioRender(run) {
  const box = document.getElementById('anaRestudioBox');
  if (!box || !run) return;
  const cambios = Array.isArray(run.cambios) ? run.cambios : [];
  const conflictos = Array.isArray(run.conflictos) ? run.conflictos.filter((c) => c && c.estado === 'pendiente') : [];
  const noLeidas = Array.isArray(run.fuentes_no_leidas) ? run.fuentes_no_leidas : [];
  if (!cambios.length && !conflictos.length && !noLeidas.length) {
    box.innerHTML = `<div style="margin:12px 0;padding:12px 14px;background:#F2F9FE;border:1px solid #DCEFFF;border-radius:14px"><p style="margin:0;font-size:14px;font-weight:800;color:#0A1E33">${anaT('Qué cambió esta semana', 'What changed this week')}</p><p class="ana-note" style="margin:6px 0 0">${anaT('Revisé tu Instagram y tu web esta semana: nada cambió.', "I checked your Instagram and website this week: nothing changed.")}</p></div>`;
    return;
  }
  let fecha = '';
  try { fecha = new Date(run.at || Date.now()).toLocaleDateString(anaLang === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short' }); } catch (e) {}
  const lineas = cambios.map((c) => '<li style="margin:3px 0">' + anaRestudioLinea(c) + '</li>').join('');
  const confs = conflictos.map((c) => '<div style="margin-top:10px;padding:10px 12px;background:#FFF8E1;border:1px solid #F3D27A;border-radius:12px">'
    + '<p style="margin:0;font-size:14px;color:#0A1E33">⚠ ' + esc(String(c.item || '')) + ': ' + anaT('vos tenés ', 'you have ') + '<b>' + esc(String(c.valor_cliente || '—')) + '</b>' + anaT(', el estudio ve ', ', the study sees ') + '<b>' + esc(String(c.valor_nuevo || anaT('que ya no está', 'gone'))) + '</b>' + anaT('. Queda lo tuyo hasta que decidas.', '. Yours stays until you decide.') + '</p>'
    + '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-ghost btn-sm" data-item="' + esc(String(c.item || '')) + '" data-tipo="' + esc(String(c.tipo || '')) + '" onclick="anaRestudioResolver(this,\'cliente\')">' + anaT('Queda como está', 'Keep mine') + '</button><button class="btn btn-primary btn-sm" data-item="' + esc(String(c.item || '')) + '" data-tipo="' + esc(String(c.tipo || '')) + '" onclick="anaRestudioResolver(this,\'nuevo\')">' + anaT('Usar lo nuevo', 'Use the new one') + '</button></div></div>').join('');
  const noLeidasHtml = noLeidas.length ? '<p class="ana-note" style="margin:8px 0 0">' + anaT('No pude leer: ', "I couldn't read: ") + esc(noLeidas.join(' + ')) + anaT(' — no se cambió nada.', ' — nothing was changed.') + '</p>' : '';
  box.innerHTML = `<div style="margin:12px 0;padding:12px 14px;background:#F2F9FE;border:1px solid #DCEFFF;border-radius:14px"><p style="margin:0;font-size:14px;font-weight:800;color:#0A1E33">${anaT('Qué cambió esta semana', 'What changed this week')}${fecha ? ' · ' + esc(fecha) : ''}</p>`
    + (lineas ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:14px;color:#0A1E33">' + lineas + '</ul>' : '')
    + confs + noLeidasHtml + '</div>';
}
function anaRestudioResolver(btn, decision) {
  const item = (btn && btn.getAttribute('data-item')) || '';
  const tipo = (btn && btn.getAttribute('data-tipo')) || '';
  if (!item || !tipo || !decision) return;
  if (btn) btn.disabled = true;
  fetch('/api/estudio/conflicto/resolver', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, nombre: item, decision }) }).then((r) => r.json()).then((d) => {
    if (d && d.ok) anaRestudioLoad();
    else if (btn) btn.disabled = false;
  }).catch(() => { if (btn) btn.disabled = false; });
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
