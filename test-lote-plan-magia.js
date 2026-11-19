'use strict';
/* =====================================================================
   LOTE PLAN-MAGIA — suite propia (18/11/2026)
   Correcciones de Valentino sobre la captura en vivo de la casa del
   invitado (BUILD v1179) + dos hallazgos de la recorrida en vivo:
   (1) ORDEN DE PANTALLA INVERSO: los slots del plan se muestran
       día 3 · día 2 · día 1 (izquierda→derecha); cada slot conserva
       su día, su fecha y su dato (solo cambia el orden de render).
   (2) BANNER ARRIBA + BOTÓN DE VIDRIO: el banner de conexión va
       sobre los slots y su botón es glass (ley de vidrio de la
       casa), con el @ del negocio en la etiqueta; la copia del
       banner no cambia.
   (3) VIDRIO MÁGICO: el slot en plan (también vacío) es vidrio con
       luz que lo atraviesa, hilo de luz, chispas flotantes y brillo
       que lo recorre — CSS puro, prefers-reduced-motion quieto.
   (A) FECHAS DEL MODELO: el día 1 de una prueba fresca sale MAÑANA
       19:00, nunca hoy — la cáscara nace desde mañana y la
       proyección (mi-plan) reasigna las cáscaras viejas que
       arrancan hoy. Pin: invitado creado hoy → slots mañana/+2/+3.
   (B) CÓDIGO LITERAL EN UN TÍTULO: «Tu primer posteo» rendía el
       fragmento ' + pzIc('rocket', 13) + ' sin evaluar (dos
       template literals: fastTrackCardHTML y firstPublishCardHTML).
       Pin: el fragmento no aparece en las salidas rendidas.
   Control: contra el árbol prístino (PLAN_MAGIA_ROOT=<base>) la
   suite FALLA en los pines del lote, como fue diseñada.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.env.PLAN_MAGIA_ROOT || path.resolve(__dirname);
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; fails.push(label); console.log('  XX ·', label, extra ? '→ ' + String(extra).slice(0, 200) : ''); }
}

const APP = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');
const MN = require(path.join(ROOT, 'modelo-nuevo.js'));

function sliceFn(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0) return '';
  return src.slice(a, b);
}
const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pzIcStub = (name, size) => `<svg data-ic="${name}" width="${size || 24}"></svg>`;

/* ---------------- A. Pines estáticos — app.js ---------------- */
console.log('\n— A. La sección del plan en app.js —');
const mnSrc = sliceFn(APP, 'function mnPlanHTML', 'async function mnAprobarEstrategia');
ok(!!mnSrc, 'A0 · mnPlanHTML existe');
ok(mnSrc.includes('plan.slots.slice().reverse()'), 'A1 · el render invierte el orden (día 3 · día 2 · día 1)');
ok(mnSrc.includes('data-mn-dia='), 'A2 · cada slot lleva su día en data-mn-dia (su dato no cambia)');
ok(mnSrc.indexOf('${banner}') > -1 && mnSrc.indexOf('${banner}') < mnSrc.indexOf('mn-grid'), 'A3 · el banner va ANTES de la grilla de slots en el DOM');
ok(mnSrc.includes('class="mn-connect-btn"') && mnSrc.includes('data-mn-connect'), 'A4 · el botón de conectar es .mn-connect-btn (vidrio), mismo gancho data-mn-connect');
ok(!mnSrc.includes('btn btn-primary btn-sm" data-mn-connect'), 'A5 · el botón plano viejo del banner ya no está');
ok(mnSrc.includes('Conectá tu Instagram hoy para que mañana salga tu primer posteo') && mnSrc.includes('Connect your Instagram today so your first post goes out tomorrow'), 'A6 · la copia del banner no cambia (ES+EN)');
ok((mnSrc.match(/mn-spark mn-spark-/g) || []).length >= 3 && mnSrc.includes('mn-slot-orb'), 'A7 · el vidrio del slot trae chispas (a/b/c) y orbe de luz');

/* ---------------- B. Pines estáticos — styles.css ---------------- */
console.log('\n— B. El vidrio mágico y el botón glass en styles.css —');
const btnRule = (CSS.match(/\.mn-connect-btn\{[^}]*\}/) || [''])[0];
ok(!!btnRule, 'B1 · existe la regla .mn-connect-btn');
ok(btnRule.includes('backdrop-filter:blur(10px)') && btnRule.includes('rgba(255,255,255,.30)'), 'B2 · el botón es vidrio esmerilado (fondo translúcido + blur)');
ok(btnRule.includes('color:#fff') && btnRule.includes('border:1px solid rgba(255,255,255,.55)'), 'B3 · texto blanco y borde de luz: contraste sobre el banner navy');
ok(CSS.includes('.mn-connect-btn:hover') && CSS.includes('.mn-connect-btn:active'), 'B4 · el botón tiene estados hover y press');
ok(CSS.includes('@keyframes mnShimmer') && CSS.includes('@keyframes mnTwinkle') && CSS.includes('@keyframes mnFloat'), 'B5 · animaciones del vidrio: brillo que recorre, chispas que titilan, orbe que flota');
const sparkRule = (CSS.match(/\.mn-spark\{[^}]*\}/) || [''])[0];
ok(sparkRule.includes('clip-path:polygon(50% 0'), 'B6 · las chispas son estrellas de 4 puntas en CSS puro (sin assets)');
ok(CSS.includes('.mn-slot-glass::before') && CSS.includes('linear-gradient(90deg,rgba(39,147,200,0)'), 'B7 · el hilo de luz cruza la parte alta del vidrio (celeste → amarillo, acento)');
ok(CSS.includes('@media (prefers-reduced-motion:reduce)') && CSS.includes('.mn-slot-glass::after,.mn-slot-orb,.mn-spark{animation:none}'), 'B8 · prefers-reduced-motion: la magia queda quieta');
ok(CSS.includes('.mn-connect{margin:0 0 12px'), 'B9 · el banner respira hacia abajo (vive arriba de los slots)');

/* ---------------- C. Hallazgo (B): el título «Tu primer posteo» ---------------- */
console.log('\n— C. El fragmento de código literal en «Tu primer posteo» —');
const ftSrc = sliceFn(APP, 'function fastTrackCardHTML', 'function bindFastTrack');
const fpSrc = sliceFn(APP, 'function firstPublishCardHTML', 'async function fpWaitDrafts');
ok(!ftSrc.includes("' + pzIc('rocket'") && !fpSrc.includes("' + pzIc('rocket'"), 'C1 · el fragmento sin evaluar no existe más en las dos tarjetas (la concatenación válida de la Agenda y un comentario homónimo quedan fuera: no se rinden literales)');
ok(ftSrc.includes("${pzIc('rocket', 13)} Tu primer posteo"), 'C2 · fastTrackCardHTML interpola el ícono dentro del template');
ok(fpSrc.includes("${pzIc('rocket', 13)} Tu primer posteo"), 'C3 · firstPublishCardHTML (Agenda) interpola el ícono dentro del template');
try {
  const firstPublishCardHTML = new Function('pzIc', fpSrc + '\nreturn firstPublishCardHTML;')(pzIcStub);
  const out1 = firstPublishCardHTML([]);
  ok(out1.includes('data-ic="rocket"') && out1.includes('Tu primer posteo') && !out1.includes("pzIc('rocket'"), 'C4 · la tarjeta de Agenda rinde ícono + «Tu primer posteo», sin código literal');
} catch (e) { ok(false, 'C4 · la tarjeta de Agenda rinde ícono + «Tu primer posteo»', e.message); }
try {
  const cortar = (s, n) => String(s).slice(0, n);
  const ftAll = sliceFn(APP, 'function ftCandTitle', 'function bindFastTrack');
  const fastTrackCardHTML = new Function('PROFILE', 'esc', 'cortar', 'pzIc', ftAll + '\nreturn fastTrackCardHTML;')({ ig_connected: false }, escStub, cortar, pzIcStub);
  const out2 = fastTrackCardHTML([{ id: 7, caption: 'La estrella de la casa', image_path: '' }]);
  ok(out2.includes('data-ic="rocket"') && out2.includes('Tu primer posteo') && !out2.includes("pzIc('rocket'"), 'C5 · la tarjeta fast-track rinde ícono + «Tu primer posteo», sin código literal');
} catch (e) { ok(false, 'C5 · la tarjeta fast-track rinde ícono + «Tu primer posteo»', e.message); }

/* ---------------- D. Unidad — la proyección y las fechas del modelo ---------------- */
console.log('\n— D. planSemanaPrueba: el día 1 es mañana, nunca hoy —');
const NOW = Date.now();
function shellWeek(startOffsetDays, lang) {
  return [0, 1, 2].map((i) => {
    const et = MN.etiquetaHoy(lang, NOW + (startOffsetDays + i) * 86400000);
    return { day: et.day, date: et.date, hour: lang === 'en' ? '7:00 PM' : '19:00', post: i };
  });
}
function shellPayload(startOffsetDays, lang, listo0) {
  return {
    lang,
    posts: [0, 1, 2].map((i) => (listo0 && i === 0)
      ? { type: 'image', image: 'data:image/jpeg;base64,x', mano: { cargada_at: NOW - 60000, post_id: 42 } }
      : { type: 'image', armando: true, caption: '', headline: '' }),
    digest: { producto_estrella: 'Berry Mille Crepe' },
    design: null,
    week: shellWeek(startOffsetDays, lang),
    linea_mano: true, puerta_sin_gasto: true,
  };
}
function labels(plan) { return plan.slots.map((s) => s.dia_semana + '|' + s.fecha); }
function expectedLabels(lang, from) { return [0, 1, 2].map((i) => { const et = MN.etiquetaHoy(lang, NOW + (from + i) * 86400000); return et.day + '|' + et.date; }); }

const pOld = MN.planSemanaPrueba(shellPayload(0, 'es', false), NOW);
ok(JSON.stringify(labels(pOld)) === JSON.stringify(expectedLabels('es', 1)), 'D1 · cáscara vieja (arranca hoy): la proyección la reasigna a mañana/+2/+3', labels(pOld).join(' · '));
ok(pOld.slots.every((s) => s.sale_hoy === false), 'D2 · tras la reasignación ningún slot dice «sale hoy»');
const hoyLbl = MN.etiquetaHoy('es', NOW);
ok(!labels(pOld).includes(hoyLbl.day + '|' + hoyLbl.date), 'D3 · la fecha de hoy no aparece en ningún slot del plan fresco');
const pNew = MN.planSemanaPrueba(shellPayload(1, 'es', false), NOW);
ok(JSON.stringify(labels(pNew)) === JSON.stringify(expectedLabels('es', 1)), 'D4 · cáscara nueva (arranca mañana): la proyección la deja intacta');
const pListo = MN.planSemanaPrueba(shellPayload(0, 'es', true), NOW);
ok(labels(pListo)[0] === (hoyLbl.day + '|' + hoyLbl.date) && pListo.slots[0].sale_hoy === true, 'D5 · slot 1 ya LISTO con fecha de hoy: la proyección NO lo reescribe (su fecha es real)');
const pEn = MN.planSemanaPrueba(shellPayload(0, 'en', false), NOW);
ok(JSON.stringify(labels(pEn)) === JSON.stringify(expectedLabels('en', 1)), 'D6 · espejo EN: la reasignación también corre (mañana/+2/+3)');

/* ---------------- E. Unidad — la cáscara nace mañana ---------------- */
console.log('\n— E. buildTrialWeekCasara: la semana cáscara arranca mañana —');
ok(SRV.includes('const startOffset = 1;'), 'E1 · startOffset fijo en 1 (día 1 = mañana 19:00, sin excepción)');
try {
  const casaraSrc = sliceFn(SRV, 'function buildTrialWeek(', 'const TRIAL_IMG_MIME');
  const buildTrialWeekCasara = new Function(casaraSrc + '\nreturn buildTrialWeekCasara;')();
  const wk = buildTrialWeekCasara('es');
  const lbl = (off) => { const et = MN.etiquetaHoy('es', Date.now() + off * 86400000); return et.day + '|' + et.date; };
  ok(wk.length === 3 && (wk[0].day + '|' + wk[0].date) === lbl(1) && (wk[1].day + '|' + wk[1].date) === lbl(2) && (wk[2].day + '|' + wk[2].date) === lbl(3), 'E2 · la cáscara trae mañana/+2/+3', wk.map((w) => w.day + ' ' + w.date).join(' · '));
  ok(wk.every((w) => w.hour === '19:00'), 'E3 · los tres lugares a las 19:00');
} catch (e) { ok(false, 'E2 · la cáscara trae mañana/+2/+3', e.message); }

/* ---------------- F. Unidad — el render de la sección ---------------- */
console.log('\n— F. mnPlanHTML rendido: orden, banner y magia —');
try {
  const { mnPlanHTML } = new Function('esc', 'pzIc', sliceFn(APP, 'function mnSlotWhen', 'async function mnAprobarEstrategia') + '\nreturn { mnSlotWhen, mnPlanHTML };')(escStub, pzIcStub);
  const mkRes = (en) => ({
    ok: true, conectado: false, ig: 'highlandbakery', estrategia_aprobada: false,
    plan: {
      estrella: 'Berry Mille Crepe', formatos: [],
      slots: [
        { dia: 1, nombre: 'Berry Mille Crepe', formato: '', dia_semana: en ? 'Thursday' : 'Jueves', fecha: en ? 'Nov 20' : '20 nov', hora: en ? '7:00 PM' : '19:00', estado: 'plan' },
        { dia: 2, nombre: '', formato: '', dia_semana: en ? 'Friday' : 'Viernes', fecha: en ? 'Nov 21' : '21 nov', hora: en ? '7:00 PM' : '19:00', estado: 'plan' },
        { dia: 3, nombre: '', formato: '', dia_semana: en ? 'Saturday' : 'Sábado', fecha: en ? 'Nov 22' : '22 nov', hora: en ? '7:00 PM' : '19:00', estado: 'plan' },
      ],
    },
  });
  const html = mnPlanHTML(mkRes(false), false);
  const orden = [...html.matchAll(/data-mn-dia="(\d)"/g)].map((m) => m[1]);
  ok(orden.join(',') === '3,2,1', 'F1 · orden de pantalla: día 3 · día 2 · día 1 (izquierda→derecha)', orden.join(','));
  const seg = {};
  for (const part of html.split('data-mn-dia="').slice(1)) seg[part[0]] = part;
  ok(seg['3'].includes('sale Sábado') && seg['2'].includes('sale Viernes') && seg['1'].includes('sale Jueves'), 'F2 · cada slot conserva SU fecha: el de la izquierda dice «sale Sábado», el del medio «sale Viernes», el de la derecha «sale Jueves»');
  ok(html.indexOf('mn-connect') > -1 && html.indexOf('mn-connect') < html.indexOf('mn-grid'), 'F3 · el banner rendido queda arriba de la grilla');
  ok(html.includes('Conectar @highlandbakery') && html.includes('class="mn-connect-btn"'), 'F4 · el botón rendido lleva el @ del negocio y la clase de vidrio');
  ok((html.match(/mn-slot-orb/g) || []).length === 3 && (html.match(/mn-spark mn-spark-a/g) || []).length === 3, 'F5 · el estado vacío también es mágico: 3 orbes y 3 juegos de chispas rendidos');
  ok(html.includes('sale Jueves · 19:00') && html.includes('Tu semana, planeada'), 'F6 · la línea de fecha bajo cada slot y el título de la sección quedan');
  const htmlEn = mnPlanHTML(mkRes(true), true);
  const ordenEn = [...htmlEn.matchAll(/data-mn-dia="(\d)"/g)].map((m) => m[1]);
  ok(ordenEn.join(',') === '3,2,1' && htmlEn.includes('Connect @highlandbakery') && htmlEn.indexOf('mn-connect') < htmlEn.indexOf('mn-grid'), 'F7 · espejo EN: mismo orden, banner arriba y botón con el @');
} catch (e) { ok(false, 'F · el render de mnPlanHTML corre', e.message); }

/* ---------------- G. Sellos ---------------- */
console.log('\n— G. Sellos —');
ok(IDX.includes('app.js?v=796') && IDX.includes('styles.css?v=20261299'), 'G1 · índice ES: app.js 796 + estilos 20261299 (sellos del aterrizaje)');
ok(IDXEN.includes('styles.css?v=20261299') && !IDXEN.includes('app.js?v='), 'G2 · índice EN: solo estilos 20261299 (no carga app.js; las menciones son comentarios)');

/* ---------------- H. Arranque real: invitado fresco → mi-plan ---------------- */
console.log('\n— H. Arranque real: la cáscara vieja entra hoy, el plan sale mañana —');
const PORT = 18900 + (process.pid % 300);
const ADMIN = 'adm-pm-suite';
const TKEY = 'pm-test-key';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-suite-'));
function req(method, p, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const data = opts.body != null ? JSON.stringify(opts.body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': Buffer.byteLength(data) } : {}, opts.cookie ? { Cookie: opts.cookie } : {}) }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, headers: res.headers, json, text: buf }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: ADMIN,
    SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY: TKEY,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  });
  const srv = spawn('node', [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { try { const v = await req('GET', '/api/version'); up = v.status === 200; } catch (e) {} if (!up) await sleep(500); }
    ok(up, 'H0 · el servidor del lote arranca', srvLog.slice(-300));
    if (!up) throw new Error('sin servidor');

    // La cáscara VIEJA sembrada como la dejaba la regla anterior:
    // el slot 1 fechado HOY. La proyección tiene que reasignarla.
    const payload = shellPayload(0, 'es', false);
    const { DatabaseSync } = require('node:sqlite');
    const dbf = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    dbf.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('pmprueba', JSON.stringify(payload), Date.now());
    dbf.close();

    const start = await req('POST', '/api/guest/start?test_key=' + TKEY, { body: { ig: 'pmprueba', lang: 'es' } });
    const setc = (start.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
    ok(!!setc, 'H1 · la puerta entrega la cookie de sesión');
    const p0 = await req('GET', '/api/trial/mi-plan', { cookie: setc });
    const pl = p0.json && p0.json.plan;
    ok(p0.status === 200 && !!pl, 'H2 · mi-plan devuelve el plan del invitado');
    const got = pl ? pl.slots.map((s) => s.dia_semana + '|' + s.fecha) : [];
    ok(JSON.stringify(got) === JSON.stringify(expectedLabels('es', 1)), 'H3 · el invitado creado hoy ve mañana/+2/+3 — nunca hoy', got.join(' · '));
    ok(!!pl && pl.slots.every((s) => s.sale_hoy === false), 'H4 · ningún slot del plan fresco dice «sale hoy»');
  } catch (e) {
    ok(false, 'H · el arranque real completó', String(e && e.message || e).slice(0, 200));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\n===== PLAN-MAGIA: ${pass} ok · ${fail} fallos =====`);
  if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
  process.exit(fail ? 1 : 0);
})();
