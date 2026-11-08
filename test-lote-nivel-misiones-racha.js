#!/usr/bin/env node
/* LOTE NIVEL-MISIONES-RACHA — suite rojo-primero.
   Decisión Valentino 7/11 23:44 (sobre el mock posty-app-design): la
   gamificación se llama Nivel (no Premios), con misiones diarias y la racha
   visible. El jardín, sus niveles 1–50, sus premios y los 7 meses quedan
   intactos; las misiones alimentan LA MISMA progresión del jardín.
   - Renombre: Premios → Nivel (ES) / Level (EN) en dock, tira, header,
     drawer y título de ruta. Los premios en sí («Próximo premio») NO se
     renombran; los identificadores internos (pzPremiosNuevosSync,
     PZ_PREMIOS_*, /api/oficina/premios-*) se quedan.
   - Racha: la REAL del ritual (/api/ritual/hoy), días seguidos eligiendo
     el posteo. Sin dato, no hay bloque: nunca un número inventado.
   - Misiones: solo de datos reales — foto de la semana (/api/photo-mission),
     reel programado de la semana (/api/posts) y video ya subido (/api/assets).
     Cada una vale el XP REAL que su posteo gana al publicarse (foto 40 /
     video 60, la misma regla de /api/avatar-level: 15 de base + 25 foto o
     +45 video). Sin dato, no hay misión. Regla XP aprobada por Valentino
     8/11 00:26: 500 puntos por nivel (1–50); comentario respondido +25
     (queda registrado: replyComment pone status='replied'); primera semana
     completa +100, racha 30 días +150, 100 días +300, 100 respuestas +150.
     La primera venta por anuncio (+200) NO se suma: Posty no ve las ventas.
     La misión de responder un comentario NO se construye acá como tarjeta:
     comment_queue no guarda CUÁNDO se respondió, así que no se puede
     mostrar el "hecho hoy" sin inventar; la XP sí es real en la regla.
   - Sin server.js: todo se compone en el cliente desde endpoints existentes.
   Uso: node test-lote-nivel-misiones-racha.js [árbol] — por defecto el dir
   del archivo. Boot real con DATA_DIR temporal + join trial (sin clave IA). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] || __dirname;
const PORT = 34793;
const TEST_KEY = 'nivel-misiones-racha';

let PASS = 0, FAIL = 0;
const failed = [];
function check(name, cond, detail) {
  if (cond) { PASS++; console.log('  ok  ' + name); }
  else { FAIL++; failed.push(name); console.log('  FALLO ' + name + (detail ? ' — ' + detail : '')); }
}
const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const slice = (from, to) => {
  const a = appSrc.indexOf(from);
  const b = to ? appSrc.indexOf(to, a) : appSrc.length;
  return (a < 0 || b < 0) ? '' : appSrc.slice(a, b);
};
const fnSrc = (name) => {
  const m = appSrc.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  return m ? m[0] : '';
};

// ---------- Parte A: estático — renombre ----------
console.log('== Parte A: estático — renombre ==');
const bb = slice('function bbShell(tab, content)', 'async function bbLoadEstado');
const mz = slice('function mzTabsHTML(tab)', 'function appShell');
const dr = slice('<aside class="drawer"', '</aside>');
const tira = slice('function mxTiraHTML', 'async function mxPortTop');
const jardinFn = slice('function mxJardinHTML', 'function mxJardinErrorHTML');
check('A1 bb-bar: dice Nivel', bb.includes("gzT('Nivel', 'Level')"));
check('A2 bb-bar: cero Premios', !bb.includes('Premios') && !bb.includes('Prizes'));
check('A3 mz-tabs: dice Nivel', mz.includes("gzT('Nivel', 'Level')"));
check('A4 mz-tabs: cero Premios', !mz.includes('Premios') && !mz.includes('Prizes'));
check('A5 drawer: ternario Level/Nivel', dr.includes("? 'Level' : 'Nivel'"));
check('A6 drawer: cero Prizes/Premios', !dr.includes('Prizes') && !dr.includes('Premios'));
check('A7 header jardín: <h1> Nivel', jardinFn.includes("<h1>${gzT('Nivel', 'Level')}</h1>"));
check('A8 header jardín: cero Premios', !jardinFn.includes('Premios') && !jardinFn.includes('Prizes'));
check('A9 tira: dice «Nivel N»', tira.includes("gzT('Nivel', 'Level')") && tira.includes('mxNvNum(nvP)'));
check('A10 tira: cero «Premios · Nv»', !tira.includes("gzT('Premios'") && !tira.includes('Premios ·'));
check('A11 título de ruta: Level/Nivel', appSrc.includes("(en ? 'Level' : 'Nivel')"));
check('A12 cero gzT(Premios en todo app.js', !appSrc.includes("gzT('Premios'"));
check('A13 cero Prizes en todo app.js', !appSrc.includes('Prizes'));
check('A14 cero >Premios< en todo app.js', !appSrc.includes('>Premios<'));
check('A15 los premios en sí se quedan: «Próximo premio»', appSrc.includes('Próximo premio') || appSrc.includes('próximo premio'));
check('A16 semilla de maestro sigue fuera', !appSrc.includes('Semillas de Maestro') && !appSrc.includes('mxSemillaCanjeHTML'));
check('A17 jardín intacto: ropa, oficina, zonas', appSrc.includes('PZ_ROPA') && appSrc.includes('PZ_OFICINA') && appSrc.includes('MX_ZONAS_PREMIO'));
check('A18 jardín intacto: nivel 1–50', appSrc.includes('mxNvNum') && appSrc.includes('Nivel máximo'));
check('A19 badge de premio nuevo intacto', appSrc.includes('pzPremiosNuevosSync') && appSrc.includes('pzPremiosNuevosLimpiar') && appSrc.includes('/api/oficina/premios-no-vistos'));
check('A20 identificadores internos se quedan', appSrc.includes('PZ_PREMIOS_NUEVOS') && appSrc.includes('/api/oficina/premios'));

// ---------- Parte A: estático — misiones y racha ----------
console.log('== Parte A: estático — misiones y racha ==');
const NIVEL_FNS = ['pzNivelDiaSemana', 'pzNivelReelSemana', 'pzNivelVideoSemana', 'pzNivelNeedEn', 'pzNivelRachaHTML', 'pzNivelMisionesHTML'];
for (const f of NIVEL_FNS) check('A21 función existe: ' + f, appSrc.includes('function ' + f + '('));
const bbJardin = slice('async function bbJardinPostyContent', 'async function bbJardinGestyContent');
check('A22 Nivel pide /api/photo-mission', bbJardin.includes("api.get('/api/photo-mission')"));
check('A23 Nivel pide /api/ritual/hoy', bbJardin.includes("api.get('/api/ritual/hoy')"));
check('A24 Nivel pide /api/posts', bbJardin.includes("api.get('/api/posts')"));
check('A25 Nivel pide /api/assets', bbJardin.includes("api.get('/api/assets')"));
check('A26 cada fetch con su propio catch', (bbJardin.match(/\.catch\(\(\) => null\)/g) || []).length >= 4);
check('A27 mxJardinHTML recibe extra', appSrc.includes('function mxJardinHTML(tipo, nvP, nvG, jardin, post50, semanaHTML, extra)'));
check('A28 Nivel pinta racha+misiones bajo la barra', jardinFn.includes('${rachaHTML}${misionesHTML}'));
check('A29 misión foto vale +40 XP', fnSrc('pzNivelMisionesHTML').includes("'+40 XP'") || fnSrc('pzNivelMisionesHTML').includes('+40 XP'));
check('A30 misión video vale +60 XP', fnSrc('pzNivelMisionesHTML').includes('+60 XP'));
check('A31 la XP coincide con la regla real del servidor (foto 40 / video 60)', serverSrc.includes('XP_POST_BASE = 15') && serverSrc.includes('XP_POST_FOTO = 25') && serverSrc.includes('XP_POST_VIDEO = 45'));
check('A32 la misión de comentarios NO se inventa', !fnSrc('pzNivelMisionesHTML').includes('comment') && !fnSrc('pzNivelMisionesHTML').includes('/api/comments'));
check('A33 sin server.js nuevo', !serverSrc.includes('pzNivel') && !serverSrc.includes('/api/nivel-misiones'));
check('A34 botones llevan al chat (álbum)', fnSrc('pzNivelMisionesHTML').split("bbGo(\\'#/app/chat\\')").length - 1 === 2);
for (const c of ['.pz-nivel-racha', '.pz-nivel-racha-num', '.pz-nivel-racha-tx', '.pz-nivel-misiones', '.pz-nivel-misiones-sub', '.pz-mision', '.pz-mision-accion', '.pz-mision-xp', '.pz-mision-btn', '.pz-mision-ok'])
  check('A35 estilo existe: ' + c, cssSrc.includes(c + '{') || cssSrc.includes(c + ' '));
const CALLED = ['pzNivelRachaHTML', 'pzNivelMisionesHTML', 'pzNivelReelSemana', 'pzNivelVideoSemana', 'pzNivelDiaSemana', 'pzNivelNeedEn', 'albumMondayKey', 'pcTz', 'bbGo', 'esc', 'gzT'];
for (const f of CALLED) check('A36 función auditada: ' + f + ' definida', appSrc.includes('function ' + f + '(') || appSrc.includes('const ' + f + ' ='));
check('A37 escala: 500 puntos por nivel, 1–50', serverSrc.includes('XP_NIVEL = 500') && serverSrc.includes('XP_MAX_NIVEL = 50') && serverSrc.includes('Math.floor(xp / XP_NIVEL) + 1'));
check('A38 respuestas: +25 por comentario respondido (status replied)', serverSrc.includes("status = 'replied'") && serverSrc.includes('XP_RESPUESTA = 25'));
check('A39 racha: bonos de la racha máxima del ritual', serverSrc.includes('rachaMaximaRitual') && serverSrc.includes('XP_PRIMERA_SEMANA = 100') && serverSrc.includes('XP_RACHA_30 = 150') && serverSrc.includes('XP_RACHA_100 = 300'));
check('A40 100 respuestas: +150', serverSrc.includes('XP_100_RESPUESTAS = 150'));
const avBlock = serverSrc.slice(serverSrc.indexOf('// ---------- Niveles'), serverSrc.indexOf('// Sugerencias proactivas'));
const avCode = avBlock.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
check('A41 primera venta por anuncio NO suma XP (sin dato de ventas)', !avCode.toLowerCase().includes('venta'));
check('A42 seen: niveles 2..50', serverSrc.includes('n <= 50'));
check('A43 marcos reescalados a 50 niveles (15/25/35)', serverSrc.includes("lvl >= 35 ? 'gold'") && serverSrc.includes("lvl >= 25 ? 'silver'") && serverSrc.includes("lvl >= 15 ? 'bronze'"));
check('A44 funciones nuevas del servidor definidas', serverSrc.includes('function rachaMaximaRitual(') && serverSrc.includes('function avatarNivelNombre(') && serverSrc.includes('function avatarTier('));
check('A45 el festejo usa el nombre del servidor para niveles >10', slice('async function chatAvatarLevel', '// El nivel se ve en el logo del chat').includes('lv.levelName'));

// ---------- Parte B: VM — helpers puros ----------
console.log('== Parte B: VM — helpers puros ==');
function makeCtx(lang) {
  const sandbox = {
    ME: { lang },
    console,
    gzT: (es, en) => (lang === 'en' ? en : es),
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    bbGo: () => {},
    albumMondayKey: () => '2026-11-09',
    pcTz: () => 'America/Argentina/Buenos_Aires',
    mxNvNum: () => 2,
    pzRopaAvance: () => 40,
    pzRopaAvatarHTML: () => '',
    pzRopaListaHTML: () => '<div class="pz-ropa-lista"></div>',
    pzOficinaSeccionHTML: () => '',
    mxJardinErrorHTML: () => '<div class="bb-error"></div>',
  };
  vm.createContext(sandbox);
  for (const f of NIVEL_FNS) {
    const src = fnSrc(f);
    // En base no existe: el stub devuelve '' y los checks B fallan
    // (rojo-primero) sin romper la suite.
    if (!src) { sandbox['__' + f] = () => ''; continue; }
    vm.runInContext(src + '\nthis.__' + f + ' = ' + f + ';', sandbox);
  }
  const jSrc = fnSrc('mxJardinHTML');
  if (!jSrc) { sandbox.__mxJardinHTML = () => ''; }
  else vm.runInContext(jSrc + '\nthis.__mxJardinHTML = mxJardinHTML;', sandbox);
  return sandbox;
}
function call(ctx, expr) { try { return vm.runInContext(expr, ctx); } catch (e) { return ''; } }
const ctxEs = makeCtx('es'), ctxEn = makeCtx('en');
check('B1 día de semana ES (jueves)', call(ctxEs, "__pzNivelDiaSemana('2026-11-12 19:00', false)") === 'jueves');
check('B2 día de semana EN (Thursday)', call(ctxEn, "__pzNivelDiaSemana('2026-11-12 19:00', true)") === 'Thursday');
check('B3 día de semana ISO con zona (19:00Z = jueves en BA)', call(ctxEs, "__pzNivelDiaSemana('2026-11-12T19:00:00Z', false, 'America/Argentina/Buenos_Aires')") === 'jueves');
check('B4 día de semana vacío → vacío', call(ctxEs, "__pzNivelDiaSemana('', false)") === '');
const postsSemana = [
  { status: 'scheduled', media_type: 'video', scheduled_at: '2026-11-12 19:00' },
  { status: 'scheduled', media_type: 'video', scheduled_at: '2026-11-11 19:00' },
  { status: 'scheduled', media_type: 'photo', scheduled_at: '2026-11-10 12:00' },
  { status: 'scheduled', media_type: 'video', scheduled_at: '2026-11-16 19:00' },
  { status: 'published', media_type: 'video', scheduled_at: '2026-11-10 19:00' },
];
check('B5 reel de la semana: el video programado más próximo', (() => { const r = call(ctxEs, '__pzNivelReelSemana(' + JSON.stringify(postsSemana) + ')'); return r && r.scheduled_at === '2026-11-11 19:00'; })());
check('B6 reel de la semana: sin video → null', call(ctxEs, '__pzNivelReelSemana([])') === null);
check('B7 reel de la semana: solo foto → null', call(ctxEs, "__pzNivelReelSemana([{status:'scheduled',media_type:'photo',scheduled_at:'2026-11-10 12:00'}])") === null);
check('B8 video subido esta semana → true', call(ctxEs, "__pzNivelVideoSemana([{kind:'video',created_at:'2026-11-10 10:00:00'}])") === true);
check('B9 video subido: solo foto → false', call(ctxEs, "__pzNivelVideoSemana([{kind:'photo',created_at:'2026-11-10 10:00:00'}])") === false);
check('B10 video subido: video de la semana pasada → false', call(ctxEs, "__pzNivelVideoSemana([{kind:'video',created_at:'2026-11-02 10:00:00'}])") === false);
check('B11 need EN: plato más pedido', call(ctxEn, "__pzNivelNeedEn('una foto de tu plato más pedido')") === 'a photo of your most-ordered dish');
check('B12 need EN: vidriera', call(ctxEn, "__pzNivelNeedEn('una foto de tu vidriera')") === 'a photo of your storefront');
check('B13 need EN: producto estrella (texto libre, tal cual)', call(ctxEn, "__pzNivelNeedEn('una foto de tu torta de chocolate')") === 'a photo of your torta de chocolate');
check('B14 need EN: producto o servicio', call(ctxEn, "__pzNivelNeedEn('una foto de tu producto o servicio')") === 'a photo of your product or service');
check('B15 racha 12 días ES', (() => { const h = call(ctxEs, "__pzNivelRachaHTML({racha:12})"); return h.includes('12 días seguidos') && h.includes('🔥'); })());
check('B16 racha 0 → hoy empieza', call(ctxEs, "__pzNivelRachaHTML({racha:0})").includes('Hoy empieza tu racha'));
check('B17 racha 1 día EN', call(ctxEn, "__pzNivelRachaHTML({racha:1})").includes('1 day in a row'));
check('B18 racha sin dato → nada', call(ctxEs, '__pzNivelRachaHTML(null)') === '' && call(ctxEs, '__pzNivelRachaHTML({})') === '');
const mFoto = { mission: { need: 'una foto de tu plato más pedido', done: false }, ritualHoy: null, posts: [], assets: [] };
check('B19 misión foto pendiente: QUÉ + CÓMO + XP', (() => { const h = call(ctxEs, '__pzNivelMisionesHTML(' + JSON.stringify(mFoto) + ')'); return h.includes('Subí una foto de tu plato más pedido') && h.includes('Cómo:') && h.includes('+40 XP') && h.includes('>Subir<') && h.includes('onclick="bbGo(\'#/app/chat\')"'); })());
check('B20 misión foto hecha: ¡Foto subida! + ✓ sin botón', (() => { const h = call(ctxEs, "__pzNivelMisionesHTML({mission:{need:'una foto de tu plato más pedido',done:true},posts:[],assets:[]})"); return h.includes('¡Foto subida!') && h.includes('✓') && !h.includes('>Subir<'); })());
const mReel = { mission: { need: 'una foto de tu plato más pedido', done: false }, ritualHoy: null, posts: [{ status: 'scheduled', media_type: 'video', scheduled_at: '2026-11-12 19:00' }], assets: [] };
check('B21 misión video: 15 s + el reel del jueves + 60 XP', (() => { const h = call(ctxEs, '__pzNivelMisionesHTML(' + JSON.stringify(mReel) + ')'); return h.includes('Grabá 15 segundos') && h.includes('Posty lo convierte en el reel del jueves') && h.includes('+60 XP') && h.includes('>Grabar<'); })());
check('B22 misión video hecha: ¡Video subido!', (() => { const h = call(ctxEs, "__pzNivelMisionesHTML({mission:null,posts:[{status:'scheduled',media_type:'video',scheduled_at:'2026-11-12 19:00'}],assets:[{kind:'video',created_at:'2026-11-10 10:00:00'}]})"); return h.includes('¡Video subido!') && h.includes('✓') && !h.includes('>Grabar<'); })());
check('B23 sin misión ni reel → nada', call(ctxEs, '__pzNivelMisionesHTML({mission:null,posts:[],assets:[]})') === '');
check('B24 misión foto EN', (() => { const h = call(ctxEn, '__pzNivelMisionesHTML(' + JSON.stringify(mFoto) + ')'); return h.includes('Upload a photo of your most-ordered dish') && h.includes('+40 XP'); })());
check('B25 misión video EN: the Thursday reel', (() => { const h = call(ctxEn, '__pzNivelMisionesHTML(' + JSON.stringify(mReel) + ')'); return h.includes('Posty turns it into the Thursday reel') && h.includes('Record 15 seconds'); })());
const nvP = { nombre_nivel: 'Aprendiz', nombre_siguiente: 'Bufanda' };
const extra = { mission: { need: 'una foto de tu plato más pedido', done: false }, ritualHoy: { racha: 12 }, posts: [{ status: 'scheduled', media_type: 'video', scheduled_at: '2026-11-12 19:00' }], assets: [] };
check('B26 jardín con extra: racha + misiones bajo el nivel', (() => { const h = call(ctxEs, '__mxJardinHTML("posty",' + JSON.stringify(nvP) + ',null,null,null,null,' + JSON.stringify(extra) + ')'); return h.includes('pz-nivel-racha') && h.includes('12 días seguidos') && h.includes('pz-nivel-misiones') && h.includes('Misiones de hoy'); })());
check('B27 jardín sin extra: sin racha ni misiones, resto intacto', (() => { const h = call(ctxEs, '__mxJardinHTML("posty",' + JSON.stringify(nvP) + ',null,null,null,null,null)'); return !h.includes('pz-nivel-racha') && !h.includes('pz-nivel-misiones') && h.includes('pz-ropa-lista'); })());
check('B28 jardín EN: título Level + Today’s missions', (() => { const h = call(ctxEn, '__mxJardinHTML("posty",' + JSON.stringify(nvP) + ',null,null,null,null,' + JSON.stringify(extra) + ')'); return h.includes('<h1>Level</h1>') && h.includes('Today’s missions'); })());

// ---------- Parte C: boot real ----------
function req(method, p, body, ctype, cookie) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: { ...(ctype ? { 'Content-Type': ctype } : {}), ...(cookie ? { Cookie: cookie } : {}) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ st: res.statusCode, txt: d })); });
    r.on('error', (e) => resolve({ st: 0, txt: 'ERR ' + e.message }));
    r.setTimeout(120000, () => { try { r.destroy(); } catch (e) {} resolve({ st: 0, txt: 'TIMEOUT' }); });
    if (body) r.write(body);
    r.end();
  });
}
const j = (s) => { try { return JSON.parse(s); } catch (e) { return null; }; };
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    const r = await req('GET', '/api/version');
    if (r.st === 200) return j(r.txt);
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  return null;
}
function reqH(method, p, body, ctype, cookie) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: { ...(ctype ? { 'Content-Type': ctype } : {}), ...(cookie ? { Cookie: cookie } : {}) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ st: res.statusCode, txt: d, headers: res.headers })); });
    r.on('error', (e) => resolve({ st: 0, txt: 'ERR ' + e.message, headers: {} }));
    r.setTimeout(120000, () => { try { r.destroy(); } catch (e) {} resolve({ st: 0, txt: 'TIMEOUT', headers: {} }); });
    if (body) r.write(body);
    r.end();
  });
}
async function joinUser(ig) {
  const r = await reqH('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
    Buffer.from(JSON.stringify({ kind: 'join', ig, device: 'probe' })), 'application/json');
  const b = j(r.txt);
  if (!b || !b.ok) throw new Error('join falló: ' + r.txt.slice(0, 200));
  const sc = r.headers['set-cookie'];
  const cookie = Array.isArray(sc) ? sc[0].split(';')[0] : String(sc || '').split(';')[0];
  return { cookie, userId: b.user_id };
}

async function main() {
  const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
  const buildTree = (serverSrc.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '?';
  console.log('árbol: ' + TREE + ' BUILD ' + buildTree);
  console.log('== Parte C: boot real ==');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nivel-misiones-'));
  const mediaDir = path.join(tmp, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmp, MEDIA_DIR: mediaDir,
    ADMIN_TOKEN: 'probe-admin', NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const proc = spawn('node', ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  proc.stdout.on('data', (d) => { serverLog += d.toString(); });
  proc.stderr.on('data', (d) => { serverLog += d.toString(); });
  try {
    const ver = await waitUp();
    check('C1 boot: /api/version responde el BUILD del árbol',
      !!ver && ver.build === buildTree, ver ? JSON.stringify(ver.build) : 'sin respuesta');
    const u1 = await joinUser('nivel-m1');
    check('C2 join trial ok', !!u1.cookie);
    const pm = j((await req('GET', '/api/photo-mission', null, null, u1.cookie)).txt);
    check('C3 /api/photo-mission: need concreto + done', !!pm && typeof pm.need === 'string' && pm.need.length > 5 && typeof pm.done === 'boolean', pm ? pm.need : 'sin respuesta');
    const rit = j((await req('GET', '/api/ritual/hoy', null, null, u1.cookie)).txt);
    check('C4 /api/ritual/hoy: racha número', !!rit && typeof rit.racha === 'number', rit ? JSON.stringify(rit.racha) : 'sin respuesta');
    const av = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C5 /api/avatar-level: nivel + XP vivos', !!av && av.ok === true && typeof av.level === 'number' && typeof av.xp === 'number', av ? JSON.stringify(av) : 'sin respuesta');
    const nv = j((await req('GET', '/api/oficina/nivel?poder=posty', null, null, u1.cookie)).txt);
    check('C6 /api/oficina/nivel: nivel del jardín', !!nv && typeof nv.nivel === 'number', nv ? JSON.stringify(nv).slice(0, 120) : 'sin respuesta');
    const posts = j((await req('GET', '/api/posts', null, null, u1.cookie)).txt);
    check('C7 /api/posts: array', Array.isArray(posts));
    const assets = j((await req('GET', '/api/assets', null, null, u1.cookie)).txt);
    check('C8 /api/assets: array', Array.isArray(assets));
    const cm = j((await req('GET', '/api/comments', null, null, u1.cookie)).txt);
    check('C9 /api/comments responde (la misión NO se construye desde acá)', !!cm && (Array.isArray(cm.comment_queue) || typeof cm.error === 'string'));
    const servedApp = (await req('GET', '/app.js')).txt;
    check('C10 servido: app.js trae pzNivelMisionesHTML', servedApp.includes('pzNivelMisionesHTML'));
    check('C11 servido: el dock dice Nivel', servedApp.includes("tabBtn('jardin', '#/app/jardin-posty', gzT('Nivel', 'Level'))"));
    check('C12 servido: app.js cero Premios en UI', !servedApp.includes("gzT('Premios'"));
    // C13–C16: la regla XP con datos sembrados (DB directa, mismo patrón
    // que test-lote-ads-directo.js: node:sqlite sobre posta.db del tmp).
    const av0 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    const base0 = (av0 && typeof av0.xp === 'number') ? av0.xp : 0;
    const seed = new DatabaseSync(path.join(tmp, 'posta.db'));
    const insPost = (mt) => seed.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, published_at) VALUES (?, 'x.jpg', '', 'published', ?, datetime('now'))`).run(u1.userId, mt);
    insPost('image'); insPost('image'); insPost('video');
    const av13 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C13 XP: 2 fotos + 1 video = +140 (nivel 1, próximo 500)', !!av13 && av13.xp === base0 + 140 && av13.level === 1 && av13.nextXp === 500 && typeof av13.levelName === 'string' && av13.levelName.length > 0, av13 ? JSON.stringify(av13) : 'sin respuesta');
    for (let i = 0; i < 10; i++) insPost('image');
    const av14 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C14 XP: 12 fotos + 1 video = +540 (nivel 2, próximo 1000)', !!av14 && av14.xp === base0 + 540 && av14.level === 2 && av14.nextXp === 1000, av14 ? JSON.stringify(av14) : 'sin respuesta');
    const insRep = (id) => seed.prepare(`INSERT INTO comment_queue (user_id, ig_comment_id, ig_media_id, username, text, status) VALUES (?, ?, 'm1', 'u', 't', 'replied')`).run(u1.userId, id);
    insRep('c1'); insRep('c2'); insRep('c3');
    const av15 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C15 XP: 3 respuestas = +75 (615 total)', !!av15 && av15.xp === base0 + 615, av15 ? JSON.stringify(av15) : 'sin respuesta');
    // 7 días seguidos eligiendo en el ritual → primera semana completa +100.
    const insPick = (dk) => seed.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, picked_post_id) VALUES (?, ?, 1, 1)`).run(u1.userId, dk);
    ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].forEach(insPick);
    seed.close();
    const av16 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C16 XP: racha 7 días = +100 (715 total)', !!av16 && av16.xp === base0 + 715, av16 ? JSON.stringify(av16) : 'sin respuesta');
  } finally {
    try { proc.kill('SIGTERM'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nTOTAL: ${PASS} ok / ${FAIL} fallos${FAIL ? ' — ' + failed.join(' | ') : ''}`);
  process.exit(FAIL ? 1 : 0);
}
main().catch((e) => { console.log('ERROR: ' + (e && e.stack || e)); process.exit(2); });
