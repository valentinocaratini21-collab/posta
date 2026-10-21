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

function analisisView() {
  return `<div class="ana-wrap"><div id="anaRoot">
    <div class="ana-card ana-letter"><div class="ana-loading">
      <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
      <p class="ana-load-t">Estoy armando tu análisis…</p>
      <p class="ana-load-s">Leo tu cuenta, tu mercado y tu semana. Dame un segundo.</p>
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
  try { window.scrollTo(0, 0); } catch (e) {}
}

function anaRefresh(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Analizando…'; }
  anaLoad(true);
}

function anaRetry() { anaLoad(false); }

function anaErrorHTML() {
  return `<div class="ana-card ana-letter"><div class="ana-loading">
    <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
    <p class="ana-load-t">Uy, no pude armar tu análisis ahora 😅</p>
    <p class="ana-load-s">No es tu cuenta: es un tropiezo de conexión de mi lado. Probamos de nuevo.</p>
    <button class="btn btn-primary" style="margin-top:14px" onclick="anaRetry()">Reintentar</button>
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
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
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
  if (s.videos > 0) return 'ya usás reels, el formato que más empuja';
  if (s.hook_pct != null && s.hook_pct >= 50) return 'tus textos ya abren con gancho';
  if (s.carousels > 0) return 'ya probás con carruseles';
  if (s.days_since_last != null && s.days_since_last <= 2) return 'venís activo estos días';
  if (s.n_posts >= 8) return 'ya tenés material publicado para apoyarnos';
  return '';
}

function anaVerdict(a, stage, birth) {
  if (birth) {
    return 'Tu cuenta está por nacer — y nacer con estrategia es una ventaja enorme: no hay nada que corregir, todo por construir. Yo pongo el plan y la constancia desde el primer posteo.';
  }
  const s = (a && a.signals) || {};
  const rate = s.posts_per_week != null ? anaFmtRate(s.posts_per_week) : null;
  const strong = anaStrong(s);
  if (stage === 'fuerte') {
    return 'Tu cuenta ya viene trabajando' + (rate ? ' a ' + rate + ' posteos por semana' : '') + (strong ? ' y ' + strong : '') + '. Lo que sigue no es rescatar nada: es afinar y sostener — y de eso me encargo yo.';
  }
  const parts = [];
  if (strong) parts.push('Tenés con qué: ' + strong + '.');
  if (rate) parts.push('Hoy tu ritmo es de ' + rate + ' posteos por semana — y la constancia no depende de tu tiempo: la pongo yo.');
  else parts.push('Tu cuenta está viva — lo que sigue es darle constancia y dirección: de eso me encargo yo.');
  parts.push('Abajo está el plan, en orden.');
  return parts.join(' ');
}

function anaDateLine(a) {
  let fecha = '';
  try {
    const src = a && a.created_at ? new Date(a.created_at) : new Date();
    if (!isNaN(src)) fecha = src.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {}
  if (!fecha) return '';
  return a && a.n ? 'Análisis #' + a.n + ' · ' + fecha : 'Análisis del ' + fecha;
}

/* ---------- Tu foto de hoy: los números reales + la trayectoria ---------- */

function anaStatsHTML(a, d) {
  const s = (a && a.signals) || {};
  const tiles = [];
  if (s.posts_per_week != null) tiles.push({ n: anaFmtRate(s.posts_per_week), l: 'posteos por semana' });
  if (s.n_posts >= 3 && s.videos != null) tiles.push({ n: s.videos + ' de ' + s.n_posts, l: 'reels en tus últimos posteos' });
  if (s.hook_pct != null) tiles.push({ n: s.hook_pct + '%', l: 'de tus captions abren con gancho' });
  if (s.max_gap_days != null && s.max_gap_days >= 2) tiles.push({ n: s.max_gap_days + ' días', l: 'tu racha más larga sin publicar' });
  else if (s.days_since_last != null) tiles.push({ n: s.days_since_last + ' días', l: 'desde tu último posteo' });
  if (s.avg_likes != null) tiles.push({ n: String(s.avg_likes), l: 'me gusta promedio por posteo' });
  let traj = '';
  const hist = (d && Array.isArray(d.history)) ? d.history : [];
  if (a && a.n && a.n >= 2) traj = `<p class="ana-traj">Ya es tu análisis #${a.n}: cada semana comparo contra el anterior y ajusto tu semana con lo nuevo que aprendo de tu cuenta.</p>`;
  else if (hist.length > 1) traj = `<p class="ana-traj">Ya tenés ${hist.length} análisis: cada uno aprende del anterior.</p>`;
  if (tiles.length < 2) return traj ? `<div class="ana-block">${traj}</div>` : '';
  return `<p class="ana-sec-t">📸 Tu foto de hoy</p><div class="ana-stats">${tiles.slice(0, 4).map((t) => `<div class="ana-stat"><p class="ana-sn">${esc(t.n)}</p><p class="ana-sl">${esc(t.l)}</p></div>`).join('')}</div>${traj}`;
}

/* ---------- Hallazgos ---------- */

function anaFindingHTML(f) {
  if (!f) return '';
  const act = f.decision || f.with_posty || '';
  return `<div class="ana-f"><p class="ana-t">${esc(f.text || '')}</p>`
    + (f.now ? `<p class="ana-fmeta"><span class="ana-now">Hoy: ${esc(f.now)}</span></p>` : '')
    + (act ? `<p class="ana-act">→ Con Posty: <b>${esc(act)}</b></p>` : '')
    + `</div>`;
}

function anaGroupsHTML(a) {
  const groups = [['mejorar', '🛠️ A mejorar'], ['incrementar', '📈 A incrementar'], ['reducir', '📉 A reducir']];
  const html = groups.map(([key, title]) => {
    const fs = (a.findings || []).filter((f) => f && f.group === key);
    if (!fs.length) return '';
    return `<div class="ana-group"><p class="ana-gtitle">${title}</p>${fs.map(anaFindingHTML).join('')}</div>`;
  }).join('');
  if (html) return html;
  return `<div class="ana-group"><p class="ana-t" style="margin-top:14px">Tu cuenta viene prolija: la semana sostiene lo que ya funciona y empuja los formatos que más rinden.</p></div>`;
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
    ritmo: { phase: 0, fx: () => 'Pasás de ' + (f.now || 'tu ritmo de hoy') + ' a tu semana completa, todas las semanas.' },
    reels: { phase: 0, fx: () => 'El formato que más empuja Instagram entra a tu mix desde esta semana.' },
    horarios: { phase: 1, fx: () => 'Nada sale a cualquier hora: tu cuenta gana regularidad también en el horario.' },
    captions: { phase: 1, fx: () => 'Hoy ' + (f.now || 'casi ninguno abre con gancho') + ' — conmigo, todos abren con gancho desde el primer día.' },
    paleta: { phase: 1, fx: () => 'Tu feed se ve parejo y reconocible de un solo vistazo.' },
    silencio: { phase: 2, fx: () => 'De ' + (f.now || 'rachas en silencio') + ' a 0 días en silencio: tu semana se programa sola.' },
  };
  if (byKey[f.key]) return { phase: byKey[f.key].phase, step: anaDot(step), fx: byKey[f.key].fx() };
  if (isMarket) return { phase: 1, step: anaDot(step), fx: f.now ? 'Hoy: ' + f.now + '.' : '' };
  const g = { incrementar: 0, mejorar: 1, reducir: 2 }[f.group];
  if (g == null) return null;
  return { phase: g, step: anaDot(step), fx: f.now ? 'Hoy: ' + f.now + '.' : '' };
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
  if (!phases[0].length) phases[0].push({ step: 'Tu semana sale completa y pareja, armada y programada por mí.', fx: 'La constancia queda instalada desde la primera semana.' });
  if (!phases[1].length) phases[1].push({ step: 'Reviso tu vidriera — nombre, bio y destacadas — con tu cuenta ya andando.', fx: 'Tu perfil queda vendiendo solo, las 24 horas.' });
  if (phases[2].length < 3) phases[2].push({ step: 'Cada semana te re-mido y ajusto la semana con lo nuevo que aprendo de tu cuenta.', fx: 'Lo que funciona se repite; lo que no, no vuelve.' });
  return phases;
}

function anaStarterPhases() {
  return [
    [
      { step: 'Tu perfil nace completo: nombre, bio, foto y destacadas — tu kit está en esta misma carta.', fx: 'Te ves profesional desde el primer posteo.' },
      { step: 'Tu primera vidriera: 9 piezas pensadas como un todo, cada una con su rol.', fx: 'Quien entra a tu perfil entiende qué vendés en segundos.' },
    ],
    [
      { step: 'El ritmo queda instalado: tu semana completa sale sola, cada semana.', fx: 'Nacés con la constancia que a la mayoría de las cuentas les falta.' },
    ],
    [
      { step: 'Te mido desde el día uno: cada análisis nuevo compara contra el anterior y ajusta la semana.', fx: 'Tu cuenta mejora con datos, no con corazonadas.' },
    ],
  ];
}

function anaNeedLine(a, birth) {
  if (!birth) {
    return `De tu lado: <b>nada</b> — yo arranco. Tu semana ya está armada con este plan: la ves en <a href="#/app/schedule" style="color:inherit;text-decoration:underline">Schedule</a> 👇`;
  }
  const parts = [];
  try {
    if (typeof PROFILE !== 'undefined' && PROFILE && !PROFILE.ig_connected) {
      parts.push('conectá tu Instagram desde Ajustes — así publico por vos y tu análisis se afina con tus métricas reales');
    }
  } catch (e) {}
  parts.push('mandame tus fotos favoritas (3 a 5) — tu vidriera sale con tu material real, no con fotos genéricas');
  return `De tu lado: <b>cuando puedas</b> — ${parts.join('; ')}. Con eso, tu cuenta nace completa.`;
}

function anaPlanHTML(a, birth) {
  const phases = birth ? anaStarterPhases() : anaBuildPhases(a || {});
  const names = ['Esta semana', 'La que viene', 'De acá en más'];
  const nums = ['①', '②', '③'];
  const body = phases.map((steps, i) => {
    if (!steps.length) return '';
    const lis = steps.map((st) => `<li>${esc(st.step)}${st.fx ? `<span class="ana-fx">El efecto: ${esc(st.fx)}</span>` : ''}</li>`).join('');
    return `<div class="ana-phase"><p class="ana-ph">${nums[i]} ${names[i]}</p><ul>${lis}</ul></div>`;
  }).join('');
  const title = birth ? '🚀 Mi plan para que nazcas con todo' : '🚀 Mi plan para mejorar todo esto';
  return `<div class="ana-plan"><p class="ana-plan-t">${title}</p><p class="ana-plan-s">En este orden — y ya arranca</p>${body}<p class="ana-need">${anaNeedLine(a, birth)}</p></div>`;
}

/* ---------- Competencia: solo lo que el payload gateado trae ---------- */

function anaMarketHTML(a) {
  if (a.market_full && a.market) {
    const m = a.market;
    if (!m.available) {
      return `<p class="ana-sec-t">🗺️ Tu competencia</p><p class="ana-t">${esc(m.unavailable_reason || 'Todavía no hay datos públicos suficientes de cuentas de tu rubro y tu zona. Apenas aparezcan, este mapa se completa solo — no estimamos nada.')}</p>`;
    }
    const peers = (m.peers || []).map((p) => {
      const rate = p.posts_per_week != null ? anaFmtRate(p.posts_per_week) + ' posteos/sem' : 'sin datos de ritmo';
      const fol = p.followers != null ? ' · ' + Number(p.followers).toLocaleString('es-AR') + ' seguidores' : '';
      return `<div class="ana-peer"><span>@${esc(p.handle || '')}</span><span>${esc(rate + fol)}</span></div>`;
    }).join('');
    const mf = (m.findings || []).map(anaFindingHTML).join('');
    const pos = m.position && m.position.text ? `<p class="ana-pos">📍 ${esc(m.position.text)}</p>` : '';
    return `<p class="ana-sec-t">🗺️ Tu competencia, de tu rubro y tu zona</p>${peers}${mf}${pos}`;
  }
  const teaser = a.market_teaser;
  if (teaser && Array.isArray(teaser.items) && teaser.items.length) {
    const items = teaser.items.map((it) => `<p class="ana-t" style="margin-top:8px">📌 ${esc(it.text || '')}${it.now ? ` — <span style="color:var(--mut);font-weight:600">${esc(it.now)}</span>` : ''}</p>`).join('');
    return `<p class="ana-sec-t">🗺️ Tu mercado <span class="ana-badge">PROBADA</span></p>${items}`
      + `<p class="ana-upsell">El mapa completo — tu competencia una por una, tu posición en el rubro y las decisiones que tomamos con eso — es parte de <b>Growth</b> (planes Pro y Total).</p>`
      + `<a class="btn btn-primary btn-sm" style="margin-top:10px" href="#/app/ajustes?plan=1">Ver planes →</a>`;
  }
  return '';
}

/* ---------- El loop y el recorrido ---------- */

function anaLoopHTML(a) {
  if (!a.loop || !Array.isArray(a.loop.checks) || !a.loop.checks.length) return '';
  const ico = { 'cumplida': '✅', 'en-curso': '🔄', 'sin-datos': '⏳' };
  const checks = a.loop.checks.map((c) => `<div class="ana-check">${ico[c.status] || '•'} ${esc(c.text || '')}</div>`).join('');
  return `<div class="ana-block"><p class="ana-sec-t" style="margin-top:0">🔁 Así viene el plan</p><p class="ana-traj" style="margin:0 0 4px">Lo que el análisis anterior se propuso, medido contra tu cuenta hoy.</p>${checks}</div>`;
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
  if (done === measured.length) txt = 'cumplimos todos los objetivos que nos propusimos. Este plan sigue desde ahí.';
  else if (done > 0) txt = done + ' de ' + measured.length + ' objetivos del plan ya están cumplidos — el resto viene en camino y queda empujando en este plan.';
  else txt = 'el plan viene en camino, todavía sin objetivos cerrados — por eso esta carta refuerza justo esos puntos.';
  return `<p class="ana-prog">📈 <b>Desde tu carta anterior:</b> ${esc(txt)}</p>`;
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
    try { const dt = new Date(h.created_at); if (!isNaN(dt)) fecha = dt.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) {}
    let loopTxt = '';
    if (Array.isArray(h.loop_checks) && h.loop_checks.length) {
      const measured = h.loop_checks.filter((c) => c && c.status && c.status !== 'sin-datos');
      if (measured.length) {
        const done = measured.filter((c) => c.status === 'cumplida').length;
        loopTxt = ' · plan medido: ' + done + ' de ' + measured.length + ' objetivos cumplidos';
      }
    }
    const kindTxt = h.kind === 'nacimiento' ? ' · plan de nacimiento' : '';
    const right = fecha + ' · ' + (h.findings != null ? h.findings : '') + ' hallazgos' + loopTxt;
    const open = h.id ? ` onclick="anaOpenPast(${Number(h.id)})" style="cursor:pointer" title="Leer esta carta completa"` : '';
    const read = h.id ? ' · <u>leer completa</u>' : '';
    return `<div class="ana-peer"${open}><span>📩 Carta #${esc(String(h.n || ''))}${esc(kindTxt)}${read}</span><span>${esc(right)}</span></div>`;
  }).join('');
  return `<div class="ana-block"><p class="ana-sec-t" style="margin-top:0">📩 Cartas anteriores</p>${rows}<p class="ana-traj">Una carta nueva cada semana: cada una se apoya en la anterior — diagnóstico → plan → medición → ajuste. Por eso tu carta #10 va a ser mucho mejor que la #1.</p></div>`;
}

/* ---------- Carta anterior completa: abrir → leer → volver ---------- */

async function anaOpenPast(id) {
  const rootEl = document.getElementById('anaRoot');
  if (!rootEl || !id) return;
  rootEl.innerHTML = `<div class="ana-card ana-letter"><div class="ana-loading">
    <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
    <p class="ana-load-t">Abro tu carta anterior…</p>
    <p class="ana-load-s">Es la carta tal como te la escribí esa semana.</p>
  </div></div>`;
  let d = null;
  try { d = await api.get('/api/analysis/' + Number(id)); } catch (e) { d = null; }
  if (!document.getElementById('anaRoot')) return; // ya navegó a otra vista
  if (!d || d.ok === false || !d.analysis) {
    const msg = (d && d.message) ? String(d.message) : 'Esta carta no se pudo abrir ahora 😅 Probamos de nuevo en un ratito.';
    rootEl.innerHTML = `<div class="ana-card ana-letter"><div class="ana-loading">
      <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
      <p class="ana-load-t">No pude abrir esa carta</p>
      <p class="ana-load-s">${esc(msg)}</p>
      <button class="btn btn-primary" style="margin-top:14px" onclick="anaBackCurrent()">← Volver a tu carta actual</button>
    </div></div>`;
    return;
  }
  anaPastMode = true;
  const bar = `<div style="margin-bottom:10px"><button class="btn btn-ghost btn-sm" onclick="anaBackCurrent()">← Volver a tu carta actual</button>
    <span style="margin-left:8px;font-size:12.5px;color:var(--mut);font-weight:600">Carta anterior — así se veía tu análisis esa semana</span></div>`;
  rootEl.innerHTML = bar + anaCartaHTML({ ok: true, plan: d.plan, analysis: d.analysis, history: [] });
  try { window.scrollTo(0, 0); } catch (e) {}
}

function anaBackCurrent() {
  const rootEl = document.getElementById('anaRoot');
  if (!rootEl) return;
  anaPastMode = false;
  if (anaLastPayload) {
    rootEl.innerHTML = anaCartaHTML(anaLastPayload);
    try { window.scrollTo(0, 0); } catch (e) {}
  } else {
    anaLoad(false);
  }
}

/* ---------- Nacimiento: lo que Posty ya sabe + kit + vidriera ---------- */

function anaKitHTML(a) {
  let h = '';
  const fs = (a.findings || []).filter((f) => f && f.text);
  if (fs.length) {
    h += `<p class="ana-sec-t">✨ Lo que ya sé de tu negocio</p>${fs.map(anaFindingHTML).join('')}`;
  }
  const kit = a.profile_kit || {};
  if (kit.highlights && kit.highlights.length) {
    h += `<p class="ana-t" style="margin-top:10px"><b>Destacadas:</b> ${esc(kit.highlights.join(' · '))}</p>`;
  }
  const grid = Array.isArray(a.starter_grid) ? a.starter_grid : [];
  if (grid.length) {
    const roles = grid.map((s) => `<div class="ana-role"><b>${esc(String(s.slot))}. ${esc(s.role || '')}</b> <span class="ana-role-f">${esc(s.format || '')}</span><div class="ana-role-w">${esc(s.why || '')}</div></div>`).join('');
    h += `<p class="ana-sec-t">🪟 Tu primera vidriera (9 piezas)</p>${roles}`;
    if (grid.market_note) h += `<p class="ana-note">${esc(grid.market_note)}</p>`;
  }
  return h;
}

/* ---------- Banner y firma ---------- */

function anaBanner(stage, ctx) {
  const lines = {
    starter: 'Nacer con plan es arrancar ganando: tu cuenta sale con estrategia desde el posteo uno.',
    fuerte: 'Ya venís bien — y esto recién arranca. Yo sostengo el ritmo y afino todo lo que sigue.',
    floja: 'Tenés el negocio. La constancia la pongo yo. Vos seguí haciendo lo que mejor sabés hacer.',
    viva: 'Tenés el negocio. La constancia la pongo yo. Vos seguí haciendo lo que mejor sabés hacer.',
  };
  let line = lines[stage] || lines.viva;
  if (ctx && ctx.handle) line = '@' + ctx.handle + ' — ' + line.charAt(0).toLowerCase() + line.slice(1);
  return line;
}

function anaSignHTML(birth) {
  const fline = birth
    ? 'Tu cuenta nace con plan. Nos vemos en tu agenda 📅'
    : 'El plan ya está en marcha: tu semana está armada con todo esto. Nos vemos en tu agenda 📅';
  return `<div class="ana-sign">
    <img src="ai-avatar.png" alt="Posty">
    <p class="ana-fname">Posty<span>.</span></p>
    <p class="ana-frole">Tu community manager</p>
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

function anaLetterBodyHTML(a) {
  const L = a.letter;
  const items = Array.isArray(L.body) ? L.body : [];
  const phaseNums = ['①', '②', '③'];
  let h = '';
  if (L.greeting) h += `<p class="ana-ltr-p ana-ltr-greet">${esc(L.greeting)}</p>`;
  let lastPhase = -1;
  items.forEach((it) => {
    if (!it) return;
    if (it.t === 'plan') {
      const head = it.phase !== lastPhase ? `<b>${phaseNums[it.phase] || ''} ${esc(it.phase_name || '')} —</b> ` : '';
      lastPhase = it.phase;
      h += `<div class="ana-ltr-plan"><p>${head}${esc(it.step || '')}${it.fx ? `<span class="ana-fx">El efecto: ${esc(it.fx)}</span>` : ''}</p></div>`;
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

/* ---------- La carta completa ---------- */

function anaCartaHTML(d) {
  const a = (d && d.analysis) || null;
  const birth = !a || a.kind === 'nacimiento';
  const ctx = anaCtx();
  const stage = birth ? 'starter' : anaStage(a);
  const bizLine = [ctx.biz, ctx.handle ? '@' + ctx.handle : ''].filter(Boolean).join(' · ');
  const dateLine = anaDateLine(a);
  const carta = anaHasLetter(a);
  const title = carta && a.letter.title ? a.letter.title : 'Tu análisis';
  const intro = !a
    ? 'Todavía no tengo tu radiografía — y no te voy a inventar una. Esto es lo que armo para tu cuenta desde tu rubro, tu zona y tu negocio 👇'
    : (birth
      ? 'Tu cuenta está por nacer — y va a nacer con estrategia. Estudié tu rubro y tu zona, y esto es lo que armé para vos 👇'
      : 'Estudié tu cuenta dato por dato — tu ritmo, tus formatos, tus textos — y armé el plan con el que lo mejoro. Esto es lo que vi 👇');
  let h = `<div class="ana-card ana-letter">
    <div class="ana-lhead">
      <div class="ana-ava"><img src="ai-avatar.png" alt="Posty"></div>
      <h3 class="ana-title">${esc(title)}</h3>
      ${bizLine ? `<p class="ana-biz">${esc(bizLine)}</p>` : ''}
      ${dateLine ? `<p class="ana-date">${esc(dateLine)}</p>` : ''}
      ${carta ? '' : `<p class="ana-intro">${intro}</p>`}
    </div>`;
  if (carta) {
    // FORMA CARTA (domingo a la noche): narración primero, datos como apoyo.
    h += anaLetterBodyHTML(a);
    if (birth) h += anaKitHTML(a);
    if (!birth) h += anaMarketHTML(a);
    h += anaHistoryHTML(d, a);
    if (Array.isArray(a.data_notes) && a.data_notes.length) {
      h += a.data_notes.map((n) => `<p class="ana-note">${esc(n)}</p>`).join('');
    }
    h += `<div class="ana-banner">${esc(a.letter.closing || anaBanner(stage, ctx))}</div>`;
    h += anaSignHTML(birth);
    if (!anaPastMode) h += `<div class="ana-refresh"><button class="btn btn-ghost btn-sm" onclick="anaRefresh(this)">↻ Actualizar análisis</button></div>`;
    h += `</div>`;
    return h;
  }
  h += `<div class="ana-verdict"><p class="ana-vlabel">Mi veredicto</p><p class="ana-vq">${esc(anaVerdict(a, stage, birth))}</p></div>`;
  if (!a) {
    h += `<div style="text-align:center;margin-top:16px"><button class="btn btn-primary" onclick="anaRefresh(this)">Armar mi análisis</button></div>`;
  }
  if (!birth) h += anaProgressHTML(a);
  if (!birth) h += anaStatsHTML(a, d);
  if (!birth) h += anaGroupsHTML(a);
  if (birth && a) h += anaKitHTML(a);
  h += anaPlanHTML(a, birth);
  if (!birth) h += anaMarketHTML(a);
  if (!birth) h += anaLoopHTML(a);
  h += anaHistoryHTML(d, a);
  if (a && Array.isArray(a.data_notes) && a.data_notes.length) {
    h += a.data_notes.map((n) => `<p class="ana-note">${esc(n)}</p>`).join('');
  }
  h += `<div class="ana-banner">${esc(anaBanner(stage, ctx))}</div>`;
  h += anaSignHTML(birth);
  if (!anaPastMode) h += `<div class="ana-refresh"><button class="btn btn-ghost btn-sm" onclick="anaRefresh(this)">↻ Actualizar análisis</button></div>`;
  h += `</div>`;
  return h;
}
