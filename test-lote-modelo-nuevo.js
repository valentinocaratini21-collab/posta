'use strict';
/* =====================================================================
   SUITE — LOTE MODELO-NUEVO («hoy te estudiamos, mañana sale»)
   =====================================================================
   Fija los cinco comportamientos del modelo nuevo de prueba:
   1) el plan de la semana se revela al instante en la casa del
      invitado (slots de vidrio con nombre, formato y fecha — sin
      arte fingido): proyección modelo-nuevo.planSemanaPrueba +
      GET /api/trial/mi-plan + la sección mnPlan de Inicio;
   2) el slot cuya pieza cargó la palanca de mano pasa a «listo»,
      resuelve su imagen desde la fila del posteo (nunca el data URI
      del payload) y la casa muestra la línea del audio hasta 17:00;
   3) la tarjeta «Así va a postear tu Instagram» lista el sistema de
      formatos y su aprobación persiste (POST /api/trial/estrategia/
      aprobar, idempotente);
   4) el banner de conexión lleva la copia con fecha («Conectá tu
      Instagram hoy para que mañana salga tu primer posteo», ES+EN)
      en el candado de la pieza y en la sección del plan, con el @;
   5) la tira del día 4 con el precio fundador US$199 se rinde
      siempre que hay plan (solo muestra: sin comportamiento nuevo).
   Corre contra LOT_ROOT (default: este árbol). Contra el árbol base
   sin el lote, la suite FALLA (modelo-nuevo.js no existe).
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = process.env.LOT_ROOT || __dirname;
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(cond, nombre, extra) {
  if (cond) { pass++; console.log('  ✓', nombre); }
  else { fail++; fails.push(nombre + (extra ? ' — ' + extra : '')); console.log('  ✗', nombre, extra || ''); }
}
const count = (s, sub) => s.split(sub).length - 1;

/* ---------------- A. Unidad: modelo-nuevo.js ---------------- */
console.log('\n— A. La proyección del plan (unidad) —');
let MN = null;
try { MN = require(path.join(ROOT, 'modelo-nuevo.js')); } catch (e) {}
ok(!!MN, 'A0 · modelo-nuevo.js existe y carga');

if (MN) {
  const { DatabaseSync } = require('node:sqlite');
  const dbm = new DatabaseSync(':memory:');
  ok(MN.estrategiaAprobada(dbm, 7) === 0, 'A1 · sin aprobación, la marca es 0');
  const t1 = MN.marcarEstrategiaAprobada(dbm, 7, 111111);
  ok(t1 === 111111 && MN.estrategiaAprobada(dbm, 7) === 111111, 'A2 · aprobar persiste la marca');
  ok(MN.marcarEstrategiaAprobada(dbm, 7, 222222) === 111111, 'A3 · la aprobación es idempotente (la primera manda)');
  dbm.close();

  const weekShell = [
    { day: 'Miércoles', date: '19 nov', hour: '19:00', post: 0 },
    { day: 'Jueves', date: '20 nov', hour: '19:00', post: 1 },
    { day: 'Viernes', date: '21 nov', hour: '19:00', post: 2 },
  ];
  const shell = {
    posts: [
      { type: 'image', armando: true, caption: '', headline: '' },
      { type: 'image', armando: true, caption: '', headline: '' },
      { type: 'image', armando: true, caption: '', headline: '' },
    ],
    digest: { producto_estrella: 'Berry Mille Crepe' },
    design: null, week: weekShell, linea_mano: true, puerta_sin_gasto: true,
  };
  const planShell = MN.planSemanaPrueba(shell);
  ok(!!planShell && planShell.slots.length === 3, 'A4 · la cáscara proyecta 3 slots');
  ok(planShell && planShell.estrella === 'Berry Mille Crepe', 'A5 · la estrella sale del digest declarado');
  ok(planShell && planShell.slots.every((s) => s.estado === 'plan'), 'A6 · sin piezas cargadas, todo es plan (nada fingido)');
  ok(planShell && planShell.slots[0].nombre === 'Berry Mille Crepe', 'A7 · el slot 0 sin titular muestra su estrella');
  ok(planShell && planShell.slots[1].nombre === '' && planShell.slots[1].dia_semana === 'Jueves', 'A8 · el slot sin nombre queda con su fecha (no se inventa)');
  ok(planShell && planShell.formatos.length === 0, 'A9 · sin formatos nombrados, el sistema queda vacío (no se inventa)');

  const llena = {
    posts: [
      { type: 'image', image: 'data:image/jpeg;base64,AAAA', headline: 'El Tortelli, en vivo', formato: 'The Dish', mano: { cargada_at: 123, dia: 1, post_id: 55 } },
      { type: 'carousel', images: ['data:image/jpeg;base64,BBBB'], headline: 'Manos a la masa', formato: 'Handmade', mano: { cargada_at: 124, dia: 2 } },
      { type: 'image', armando: true, headline: '', formato: '' },
    ],
    digest: { producto_estrella: 'Tortelli di Michelangelo' },
    formatos_sistema: ['The Dish', 'Handmade', 'The Table'],
    design: null, week: weekShell, linea_mano: true,
  };
  const planLlena = MN.planSemanaPrueba(llena);
  ok(planLlena && planLlena.slots[0].estado === 'listo' && planLlena.slots[0].post_id === 55, 'A10 · la pieza cargada a mano es «listo» con su post_id');
  ok(planLlena && planLlena.slots[1].estado === 'listo', 'A11 · el carrusel cargado también es «listo»');
  ok(planLlena && planLlena.slots[2].estado === 'plan', 'A12 · el slot en armado sigue en plan');
  ok(planLlena && planLlena.slots[0].formato === 'The Dish' && planLlena.formatos.join('|') === 'The Dish|Handmade|The Table', 'A13 · formatos de la pieza y sistema completo, desde los datos');

  ok(MN.planSemanaPrueba(null) === null && MN.planSemanaPrueba({}) === null, 'A14 · sin payload no hay plan');
  ok(MN.planSemanaPrueba({ posts: shell.posts }) === null, 'A15 · sin fechas (week) no hay plan: la casa no promete en vacío');

  const hoy = MN.etiquetaHoy('es', Date.now());
  const conHoy = JSON.parse(JSON.stringify(shell));
  conHoy.week = [
    { day: hoy.day, date: hoy.date, hour: '19:00', post: 0 },
    { day: '—', date: '—', hour: '19:00', post: 1 },
    { day: '—', date: '—', hour: '19:00', post: 2 },
  ];
  const planHoy = MN.planSemanaPrueba(conHoy);
  ok(planHoy && planHoy.slots[0].sale_hoy === false && planHoy.slots[0].fecha === MN.etiquetaHoy('es', Date.now() + 86400000).date && planHoy.slots[1].sale_hoy === false, 'A16 · (re-pin PLAN-MAGIA) la cáscara que arranca hoy se reasigna: el día 1 sale mañana (sale_hoy en falso, fecha de mañana)');
}

/* ---------------- B. Pines estáticos ---------------- */
console.log('\n— B. Pines estáticos (server, app, estilos, stamps) —');
ok(SRV.includes("require('./modelo-nuevo')"), 'B1 · server.js carga modelo-nuevo');
ok(SRV.includes("app.get('/api/trial/mi-plan', requireAuth"), 'B2 · GET /api/trial/mi-plan con sesión');
ok(SRV.includes("app.post('/api/trial/estrategia/aprobar', requireAuth"), 'B3 · POST /api/trial/estrategia/aprobar con sesión');
ok(SRV.includes('if (body.formato != null) pieza.formato') && SRV.includes('body.formatos_sistema'), 'B4 · pieza-mano acepta formato y formatos_sistema (opcionales)');
ok(SRV.includes('startsWith(\'data:\')') && SRV.includes('s.media = pr.image_path'), 'B5 · la imagen del slot sale de la fila del posteo, jamás un data URI');

ok(count(APP, 'Conectá tu Instagram hoy para que mañana salga tu primer posteo') >= 2, 'B6 · la copia de conexión con fecha vive en el candado Y en el banner del plan (ES)');
ok(count(APP, 'Connect your Instagram today so your first post goes out tomorrow') >= 2, 'B7 · la copia espejo EN vive en el candado Y en el banner del plan');
ok(!APP.includes('¿Lo querés en tu Instagram?') && !APP.includes('Want it on your Instagram?'), 'B8 · la copia vieja del candado («¿Lo querés…?») ya no existe');
ok(APP.includes('¿Querés un cambio? Mandanos un audio hasta las 17:00'), 'B9 · la línea del audio hasta las 17:00 (ES)');
ok(APP.includes('Want a change? Send us a voice note by 5:00 PM'), 'B10 · la línea del audio, espejo EN');
ok(APP.includes('Listo · sale hoy') && APP.includes('Ready · goes out today'), 'B11 · el estado «Listo · sale hoy» ES+EN');
ok(APP.includes('Así va a postear tu Instagram') && APP.includes('This is how your Instagram will post'), 'B12 · la tarjeta de la estrategia ES+EN');
ok(APP.includes("api.post('/api/trial/estrategia/aprobar'") && APP.includes('data-mn-aprobar'), 'B13 · la aprobación se toca una vez y persiste por la API');
ok(APP.includes('Día 4: tu Instagram sigue solo') && APP.includes('Day 4: your Instagram keeps going on its own'), 'B14 · la tira del día 4 ES+EN');
ok(APP.includes('US$199') && APP.includes('precio fundador') && APP.includes('founder price'), 'B15 · el precio fundador US$199 visible en la tira');
ok(APP.includes("api.get('/api/trial/mi-plan')") && APP.includes('mnPlanHTML(mnRes, enHome)'), 'B16 · Inicio pide el plan y lo rinde sobre la grilla');
ok(APP.includes('${mnPlanStr}') && APP.includes('mnPlanBind(root)'), 'B17 · la sección entra en la plantilla de Inicio y se enlaza en pzHoyBind');
ok(APP.includes('function mnPlanHTML') && APP.includes('mn-slot-glass') && APP.includes('Tu semana, planeada'), 'B18 · el slot en plan es vidrio con nombre y fecha (sin arte)');

ok(CSS.includes('.mn-plan') && CSS.includes('.mn-slot-listo') && CSS.includes('.mn-dia4') && CSS.includes('.mn-connect'), 'B19 · los estilos del plan existen');
ok(IDX.includes('app.js?v=797') && IDX.includes('styles.css?v=20261299'), 'B20 · (re-pin PUERTA-NUEVA) stamps del aterrizaje: app.js 797 + estilos 20261299 (ES)');
ok(IDXEN.includes('styles.css?v=20261299') && !IDXEN.includes('app.js?v=797'), 'B21 · (re-pin PUERTA-NUEVA) el índice EN bumpea solo estilos (no carga app.js)');

/* ---------------- C. Arranque real ---------------- */
console.log('\n— C. Arranque real: puerta → plan → pieza → aprobación —');
const PORT = 18800 + (process.pid % 400);
const ADMIN = 'adm-mn-suite';
const TKEY = 'mn-test-key';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-suite-'));
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';

function req(method, p, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const data = opts.body != null ? JSON.stringify(opts.body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': Buffer.byteLength(data) } : {}, opts.cookie ? { Cookie: opts.cookie } : {}, opts.headers || {}) }, (res) => {
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
    for (let i = 0; i < 60 && !up; i++) { try { const v = await req('GET', '/api/version'); up = v.status === 200; } catch (e) {} if (!up) await sleep(500); }
    ok(up, 'C0 · el servidor del lote arranca', srvLog.slice(-300));
    if (!up) throw new Error('sin servidor');

    // La semana cáscara sembrada como la deja la puerta sin gasto:
    // 3 esqueletos en armado, estrella declarada, fechas de la
    // cáscara (hoy / mañana / pasado según etiquetaHoy).
    const hoy = MN.etiquetaHoy('es', Date.now());
    const man = MN.etiquetaHoy('es', Date.now() + 86400000);
    const pas = MN.etiquetaHoy('es', Date.now() + 2 * 86400000);
    const payload = {
      posts: [
        { type: 'image', armando: true, caption: '', hashtags: '', headline: '' },
        { type: 'image', armando: true, caption: '', hashtags: '', headline: '' },
        { type: 'image', armando: true, caption: '', hashtags: '', headline: '' },
      ],
      digest: { producto_estrella: 'Berry Mille Crepe' },
      design: null,
      week: [
        { day: hoy.day, date: hoy.date, hour: '19:00', post: 0 },
        { day: man.day, date: man.date, hour: '19:00', post: 1 },
        { day: pas.day, date: pas.date, hour: '19:00', post: 2 },
      ],
      linea_mano: true, puerta_sin_gasto: true,
    };
    const { DatabaseSync } = require('node:sqlite');
    const dbf = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    dbf.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('mnprueba', JSON.stringify(payload), Date.now());
    dbf.close();

    const start = await req('POST', '/api/guest/start?test_key=' + TKEY, { body: { ig: 'mnprueba', lang: 'es' } });
    // La puerta, con la semana TODA en armado, responde week_pending
    // (202): la sesión nace igual y la casa muestra el plan — es el
    // comportamiento diseñado de la línea a mano, no un error.
    ok(start.json && start.json.week_pending === true && start.json.pending === 3, 'C1 · la puerta responde week_pending con la sesión nacida (línea a mano)', start.text.slice(0, 160));
    const setc = (start.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
    ok(!!setc, 'C2 · la puerta entrega la cookie de sesión');
    const dbu = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const urow = dbu.prepare('SELECT id FROM users WHERE guest_ig = ?').get('mnprueba');
    dbu.close();
    const uid = urow && Number(urow.id);
    ok(!!uid, 'C2b · el invitado existe en la base con su @');

    const sinSesion = await req('GET', '/api/trial/mi-plan');
    ok(sinSesion.status === 401, 'C3 · mi-plan sin sesión es 401');

    const p0 = await req('GET', '/api/trial/mi-plan', { cookie: setc });
    const pl0 = p0.json && p0.json.plan;
    ok(p0.status === 200 && !!pl0, 'C4 · mi-plan devuelve el plan del invitado');
    ok(pl0 && pl0.estrella === 'Berry Mille Crepe' && pl0.slots[0].nombre === 'Berry Mille Crepe', 'C5 · el plan trae la estrella y el slot 0 la muestra');
    ok(pl0 && pl0.slots.every((s) => s.estado === 'plan'), 'C6 · día 0: los tres slots en plan, sin arte fingido');
    ok(pl0 && pl0.slots[0].sale_hoy === false && pl0.slots[0].hora === '19:00' && pl0.slots[0].fecha === man.date, 'C7 · (re-pin PLAN-MAGIA) el slot 1 NO cae hoy: la proyección reasigna la cáscara a mañana (sale_hoy en falso, fecha de mañana, 19:00)');
    ok(p0.json && p0.json.conectado === false && p0.json.estrategia_aprobada === false, 'C8 · sin conexión y sin estrategia aprobada al entrar');

    // La marca de línea a mano + la carga de la pieza del día 1 con
    // su formato nombrado y el sistema completo del negocio.
    const dbm2 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    dbm2.prepare("INSERT INTO trial_linea_mano (cache_key, ig, user_id, estado, creada_at) VALUES ('mnprueba', 'mnprueba', ?, 'activa', ?)").run(uid, Date.now());
    dbm2.close();
    const carga = await req('POST', '/api/admin/trial/pieza-mano?token=' + ADMIN, {
      body: { ig: 'mnprueba', dia: 1, media: JPEG, headline: 'Berry Mille Crepe', formato: 'The Dish', formatos_sistema: ['The Dish', 'Handmade', 'The Table'], caption: 'La estrella de la casa.' },
    });
    ok(carga.status === 200 && carga.json && carga.json.ok, 'C9 · pieza-mano carga la pieza del día 1', carga.text.slice(0, 160));

    const p1 = await req('GET', '/api/trial/mi-plan', { cookie: setc });
    const pl1 = p1.json && p1.json.plan;
    ok(pl1 && pl1.slots[0].estado === 'listo', 'C10 · con la pieza cargada, el slot 1 pasa a «listo»');
    ok(pl1 && pl1.slots[0].formato === 'The Dish', 'C11 · el slot muestra el formato nombrado de la pieza');
    ok(pl1 && pl1.formatos.join('|') === 'The Dish|Handmade|The Table', 'C12 · el sistema de formatos del negocio llega al plan');
    ok(pl1 && pl1.slots[1].estado === 'plan' && pl1.slots[2].estado === 'plan', 'C13 · los demás slots siguen en plan');

    // La imagen del slot listo sale de la fila del posteo: se siembra
    // la fila y el post_id en el payload, como hace la importación.
    const dbm3 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const ins = dbm3.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type) VALUES (?, '/media/mn-suite.jpg', 'cap', '', 'scheduled', 'image')").run(uid);
    const pid = Number(ins.lastInsertRowid);
    const row = dbm3.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get('mnprueba');
    const pl = JSON.parse(row.payload);
    pl.posts[0].mano.post_id = pid;
    pl.posts[0].image = JPEG; // el payload guarda el data URI: jamás debe viajar
    dbm3.prepare('UPDATE trial_cache SET payload = ? WHERE ig = ?').run(JSON.stringify(pl), 'mnprueba');
    dbm3.close();
    const p2 = await req('GET', '/api/trial/mi-plan', { cookie: setc });
    const pl2 = p2.json && p2.json.plan;
    ok(pl2 && pl2.slots[0].media === '/media/mn-suite.jpg', 'C14 · la imagen del slot listo es la ruta del posteo');
    ok(!JSON.stringify(p2.json).includes('data:image'), 'C15 · la respuesta NUNCA filtra el data URI del payload');

    const ap = await req('POST', '/api/trial/estrategia/aprobar', { cookie: setc, body: {} });
    ok(ap.status === 200 && ap.json && ap.json.ok && ap.json.aprobada_at > 0, 'C16 · aprobar la estrategia persiste y devuelve la marca');
    const p3 = await req('GET', '/api/trial/mi-plan', { cookie: setc });
    ok(p3.json && p3.json.estrategia_aprobada === true && p3.json.estrategia_aprobada_at === ap.json.aprobada_at, 'C17 · al volver, la casa lee la estrategia aprobada');
  } catch (e) {
    ok(false, 'C · el arranque real completó', String(e && e.message || e).slice(0, 200));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\n===== MODELO-NUEVO: ${pass} ok · ${fail} fallos =====`);
  if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
  process.exit(fail ? 1 : 0);
})();
