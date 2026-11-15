// test-lote-arreglos-auditoria.js
// LOTE ARREGLOS-AUDITORÍA (3 de 5 de la orden «Subi todo» del 14/11) —
// censo fino ítem por ítem contra la base v1097 (7280f019) y
// construcción SOLO de lo que faltaba. Origen: la auditoría de payload
// de las corridas Veja #7 + Mejuri (13/11, .diag-veja7/AUDIT.md).
//
//  (a) CONSTRUIDO — EL PORQUÉ DE LA ESTRELLA VISIBLE: la auditoría del
//      email nombraba la estrella pero nunca decía por qué lo es. La
//      evidencia existía (inferStar / vía corroborada) pero vivía solo
//      en el payload interno. Ahora buildAudit compone la línea pública
//      desde ESA evidencia (starWhyLine), el payload la guarda como
//      estrella_porque y la página la muestra en su sección «Tu estrella».
//  (b) CONSTRUIDO — EL FORMATO COMO TEXTO: el formato vivía solo en el
//      payload y, con suerte, en un badge con ícono. La tarjeta del
//      posteo (weekCardHTML y postCardHTML) suma la línea «Formato: …»
//      como texto, para cada pieza, en el idioma de la cuenta
//      (pzFormatoLineaHTML).
//  (c) VIVO (censo, no se construyó) — LA NOTA LLEGA AL CEREBRO:
//      /api/chat/nota guarda en memoria_cliente (tipo 'nota') y
//      memoriaParaBrief viaja en los briefs de ideas y de captions; el
//      acuse enlatado murió con RESPONDE-CON-TRABAJO. Se aserta el
//      cableado vigente.
//  (d) VIVO (censo) — «Try Salar, where today»: la clase subordinante
//      colgante está frenada por enSpliceLint + trimFunctionTail,
//      cableados en el titular del slot 0 y en los captions
//      (LOTE PRIMER-POSTEO-PERFECTO, pieza 4). Se aserta la clase exacta.
//  (e) VIVO (censo) — «YA USÓ SU PRUEBA» SIRVE LA SEMANA: la rama
//      usedForever sirve el snapshot del candado en ambas rutas y
//      guest/start reanuda para el dueño (LOTE
//      EXHIBICIÓN-PRUEBA-RECIÉN-ENTREGADA v1016). Se aserta el cableado.
//
// Se corre desde la raíz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-arreglos-auditoria.js
// Control contra la base v1097: PZ_ROOT=<base> (falla en (a) y (b)).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-arreglos-audit-'));
const MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-arreglos-audit-media-'));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function seccion(s) { console.log('\n[' + s + ']'); }
const count = (s, sub) => (String(s).split(sub).length - 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const INDEX_ES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const INDEX_EN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const DEMO = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const EA = require(path.join(ROOT, 'email-audit.js'));
const CD = require(path.join(ROOT, 'client-digest.js'));

const NOW = Date.UTC(2026, 10, 13, 15, 0, 0);
const DAY = 86400;
const nowSec = Math.floor(NOW / 1000);
const post = (daysAgo, caption, likes, comments, type) => ({
  type: type || 'GraphImage',
  shortcode: 'FIX' + daysAgo,
  taken_at: nowSec - daysAgo * DAY,
  caption, likes, comments,
  thumb: null, pinned: null, video_duration: null,
});
const PROFILE_A = { handle: 'ligre.arg', name: 'Ligre', bio: '', bio_unread: true, link: '', link_unread: true, followers: 4200, posts_count: 210, following: 300, is_verified: false, category: 'restaurant', pic: null };
const ITEMS_A = [
  { nombre: 'La Milanga', fuente: 'web-catalog' },
  { nombre: 'Zucchina', fuente: 'web-catalog' },
  { nombre: 'La Polpetta', fuente: 'web-catalog' },
];
const POSTS_A = [
  post(9, 'sábado de horno y mostrador lleno, así trabajamos acá', 40, 2),
  post(11, 'la zucchina recién salida, con el queso burbujeante', 25, 1),
  post(13, 'nuestra cocina a las siete de la mañana, antes de abrir', 18, 0),
  post(15, 'La Milanga con fritas, la que junta a todo el barrio', 900, 30),
  post(29, 'masa madre de todos los días, sin apuro', 22, 3),
  post(31, 'el equipo amasando antes de que salga el sol', 15, 0),
  post(33, 'una de la casa, con albahaca fresca del mercado', 12, 1),
  post(35, 'el mostrador del mediodía, como siempre', 9, 0),
  post(37, 'horno a leña y paciencia, la fórmula de siempre', 30, 2),
  post(39, 'la polpetta de la abuela en su salsa de domingo', 11, 0),
  post(41, 'cerramos el día con la última tanda del horno', 8, 0),
  post(45, 'primera foto de esta grilla, el local recién pintado', 6, 1),
];

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
function reqJson(port, method, p) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, body: b }); });
    });
    req.on('error', () => resolve({ status: 0, json: null, body: '' }));
    req.end();
  });
}

(async () => {
  /* ── 0 · Stamps del lote ── */
  seccion('0 · stamps');
  eq(count(SERVER, "BUILD_ID = '20261105-v1098'"), 1, '0a BUILD v1098 x1 en server.js');
  eq(count(APPJS, "PZ_BUILD = '20261105-v1098'"), 1, '0b PZ_BUILD v1098 x1 en app.js');
  eq(count(INDEX_ES, 'app.js?v=745'), 1, '0c app.js?v=745 x1 en el index ES');
  eq(count(INDEX_ES, 'app.js?v=744'), 0, '0d el ?v= viejo no queda en el index ES');
  ok(INDEX_ES.includes('styles.css?v=20261286') && INDEX_EN.includes('styles.css?v=20261286'), '0e styles.css?v=20261286 intacto en ambos index (el lote no toca styles)');

  /* ── A · (a) el porqué de la estrella, construido ── */
  seccion('A · (a) porqué de la estrella visible');
  const builtA = EA.buildAudit({ profile: PROFILE_A, posts: POSTS_A, items: ITEMS_A, lang: 'es', paletteHues: null, now: NOW });
  ok(builtA.ok === true, 'A0 la auditoría se construye', builtA && builtA.motivo);
  if (builtA.ok) {
    ok(builtA.star_why && builtA.star_why.name === 'La Milanga', 'A1 star_why nombra a la estrella de esta lectura', builtA.star_why);
    ok(builtA.star_why && builtA.star_why.line.includes('La Milanga es tu estrella:'), 'A2 la línea dice por qué es la estrella, no solo el nombre', builtA.star_why && builtA.star_why.line);
    ok(builtA.star_why && builtA.star_why.line.includes('aparece en 1 de tus últimos 12 posteos'), 'A3 razón verificada: sus apariciones reales en el feed', builtA.star_why && builtA.star_why.line);
    ok(builtA.star_why && builtA.star_why.line.includes('es el más querido de tu feed (930 interacciones en su posteo con más cariño)'), 'A4 razón verificada: el cariño real (930 = 900+30 del fixture)', builtA.star_why && builtA.star_why.line);
    const payload = { lang: 'es', business_name: 'Ligre', handle: 'ligre.arg', fan: builtA.fan, findings: builtA.findings, estrella_porque: builtA.star_why };
    const html = EA.renderAuditHtml(payload);
    ok(html.includes('<h2>Tu estrella</h2>') && html.includes('La Milanga es tu estrella:'), 'A5 la página muestra la sección «Tu estrella» con el porqué');
    ok(html.indexOf('Primero, lo que nos gustó') < html.indexOf('Tu estrella') && html.indexOf('Tu estrella') < html.indexOf('Lo que vimos para mejorar'), 'A6 orden: fan → estrella → hallazgos');
    const htmlSin = EA.renderAuditHtml({ lang: 'es', business_name: 'Ligre', handle: 'ligre.arg', fan: builtA.fan, findings: builtA.findings });
    ok(!htmlSin.includes('<h2>Tu estrella</h2>'), 'A7 sin porqué guardado (payload viejo), la sección no se inventa');
    const builtEn = EA.buildAudit({ profile: PROFILE_A, posts: POSTS_A, items: ITEMS_A, lang: 'en', paletteHues: null, now: NOW });
    ok(builtEn.ok && builtEn.star_why && builtEn.star_why.line.includes('La Milanga is your star:'), 'A8 la línea en inglés abre con la estrella', builtEn.star_why && builtEn.star_why.line);
    ok(builtEn.star_why && builtEn.star_why.line.includes('it shows up in 1 of your last 12 posts') && builtEn.star_why.line.includes('it is the most loved on your feed (930 interactions'), 'A9 las razones salen en inglés, desde la misma evidencia', builtEn.star_why && builtEn.star_why.line);
    ok(builtEn.star_why && !/catálogo|posteos|cariño/.test(builtEn.star_why.line), 'A10 nada de español colado en la línea EN');
    const gen = await EA.generateEmailAudit({ ig: 'ligre.arg', lang: 'es' }, { data: { ok: true, profile: PROFILE_A, posts: POSTS_A }, items: ITEMS_A, paletteHues: null, now: NOW });
    ok(gen.ok === true && gen.payload.estrella_porque && gen.payload.estrella_porque.line.includes('es tu estrella'), 'A11 el payload persistido guarda estrella_porque', gen && gen.payload && gen.payload.estrella_porque);
  }

  /* ── B · (b) el formato como texto, construido ── */
  seccion('B · (b) formato como texto en la tarjeta');
  const mFn = APPJS.match(/function pzFormatoLineaHTML\(p\) \{[\s\S]*?\n\}/);
  ok(!!mFn, 'B0 pzFormatoLineaHTML existe en app.js');
  if (mFn) {
    const mk = (en) => {
      const sandbox = { ME: { lang: en ? 'en' : 'es' }, JSON };
      const fn = new Function('ME', 'JSON', mFn[0] + '\nreturn pzFormatoLineaHTML;')(sandbox.ME, sandbox.JSON);
      return fn;
    };
    const fEs = mk(false), fEn = mk(true);
    ok(fEs({ media_type: 'image' }).includes('<b>Formato:</b> Foto'), 'B1 foto → «Formato: Foto» como texto');
    ok(fEn({ media_type: 'image' }).includes('<b>Format:</b> Photo'), 'B2 EN: «Format: Photo»');
    ok(fEs({ media_type: 'video' }).includes('<b>Formato:</b> Reel'), 'B3 video → «Formato: Reel»');
    ok(fEs({ media_type: 'story' }).includes('<b>Formato:</b> Historia') && fEn({ media_type: 'story' }).includes('<b>Format:</b> Story'), 'B4 historia en ambos idiomas');
    ok(fEs({ media_type: 'carousel', carousel_paths: '["a","b","c"]' }).includes('<b>Formato:</b> Carrusel · 3 fotos'), 'B5 carrusel con su cantidad de fotos');
    ok(fEn({ media_type: 'carousel', carousel_paths: '["a","b"]' }).includes('<b>Format:</b> Carousel · 2 photos'), 'B6 carrusel EN con cantidad');
    ok(fEs({ media_type: '' }).includes('<b>Formato:</b> Foto'), 'B7 sin media_type, cae a Foto (nunca vacío)');
  }
  ok(count(APPJS, 'const fmtHTML = pzFormatoLineaHTML(d);') === 1 && count(APPJS, '${pzFormatoLineaHTML(p)}') === 1, 'B8 la línea está cableada en weekCardHTML y en postCardHTML');
  eq(count(APPJS, 'function pzFormatoLineaHTML'), 1, 'B9 una sola definición (gate M78: la función llamada existe una vez)');

  /* ── C · (c) censo vivo: la nota llega al cerebro ── */
  seccion('C · (c) la nota llega al cerebro (vivo)');
  ok(SERVER.includes("memoriaCliente.guardarMemoria(db, uid, [{ tipo: 'nota', texto }], texto)"), 'C1 /api/chat/nota guarda la nota en memoria_cliente (tipo nota)');
  ok(count(SERVER, 'memoriaCliente.memoriaParaBrief(db, uid)') >= 2, 'C2 memoriaParaBrief viaja en los briefs de ideas y de captions');
  {
    const a = SERVER.indexOf("app.post('/api/chat/nota'");
    const bloque = a >= 0 ? SERVER.slice(a, a + 1600) : '';
    ok(bloque && !bloque.includes('Anotado') && !bloque.includes('✅'), 'C3 el endpoint ya no responde con acuse enlatado (responde-con-trabajo)');
  }

  /* ── D · (d) censo vivo: la clase «Try Salar, where today» ── */
  seccion('D · (d) léxico «Try Salar, where today» (vivo)');
  eq(CD.enSpliceLint('Try Salar, where today', ['Salar, where']), true, 'D1 el titular exacto de Veja #7 (659) queda frenado');
  eq(CD.enSpliceLint('Salar, where ✨', ['Salar, where']), true, 'D2 el caption «Salar, where ✨» del 659 queda frenado');
  eq(CD.enSpliceLint('Try Salar today', ['Salar']), false, 'D3 el titular sano no se frena');
  ok(count(DEMO, 'enSpliceLint') >= 3 && count(SERVER, 'enSpliceLint') >= 0, 'D4 el lint está cableado en demo.js (titular del slot 0 y gate de textos)');

  /* ── E · (e) censo vivo: la semana recién entregada se sirve ── */
  seccion('E · (e) «ya usó su prueba» sirve la semana (vivo)');
  ok(count(SERVER, 'EXHIBICIÓN-PRUEBA-RECIÉN-ENTREGADA') >= 2, 'E1 la rama usedForever con snapshot está en ambas rutas (clásica y stream)');
  ok(SERVER.includes('const snapU = lockU && trialLockServePayload(lockU);'), 'E2 ambas rutas sirven el snapshot del candado como la semana');
  ok(SERVER.includes('const ownGuest = '), 'E3 guest/start reanuda para el invitado dueño (ownGuest)');

  /* ── F · Boot aislado: versión nueva y founders sin regresión ── */
  seccion('F · boot aislado');
  const PORT = 34731;
  ok(await portFree(PORT), 'F0 el puerto ' + PORT + ' está libre antes de bootear');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: process.env.DATA_DIR, MEDIA_DIR, NODE_PATH: process.env.NODE_PATH || '', OPENAI_API_KEY: '', RESEND_API_KEY: '', SUPERVISION_OFF: '1', ADMIN_TOKEN: 'test-arreglos-audit', SESSION_SECRET: 'test-arreglos-audit' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootOut = '';
  child.stdout.on('data', (c) => { bootOut += c; });
  child.stderr.on('data', (c) => { bootOut += c; });
  try {
    let v = null;
    for (let i = 0; i < 40 && !v; i++) { const r = await reqJson(PORT, 'GET', '/api/version'); if (r.json && r.json.build) v = r.json; else await sleep(500); }
    ok(v && v.build === '20261105-v1098', 'F1 /api/version responde el BUILD del lote', v);
    const f = await reqJson(PORT, 'GET', '/api/founders');
    eq(f.status, 200, 'F2 REGRESIÓN v1097: /api/founders sigue 200 con DB fresca');
    ok(f.json && f.json.ok === true && f.json.total === 200, 'F3 founders devuelve su payload (total 200)', f.json);
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    ok(await portFree(PORT), 'F4 el proceso de boot murió por su PID exacto y el puerto quedó libre');
  }

  console.log('\n== test-lote-arreglos-auditoria: ' + pass + ' ok · ' + fail + ' mal ==');
  if (failures.length) console.log('FALLOS:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
