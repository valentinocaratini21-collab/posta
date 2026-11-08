#!/usr/bin/env node
/* LOTE REDISEÑO R5 (Nivel) — suite rojo-primero.
   Decisión Valentino 8/11 01:54: Nivel queda EXACTAMENTE como el mock
   (posty-app-design, pane Nivel): barra de XP (500 por nivel, 1–50) +
   racha visible + misiones diarias + logros + escalera de niveles.
   FUERA: el jardín visible (posty-nivel50.js y su conteo por posteos),
   la oficina/escritorio, los premios viejos, toda Semilla de Maestro y
   el copy «jardín» de la pantalla. La limpieza de endpoints muertos del
   sistema de semillas/jardín va DENTRO de R5 (decisión del tablero).
   Regla XP aprobada 8/11 00:26 (vive en v793, intacta): 500/nivel,
   foto 40 / video 60, comentario respondido +25, posteo del día +15,
   primera semana +100, racha 30 +150 / 100 +300, 100 respuestas +150.
   La primera venta por anuncio (+200) NUNCA se suma por proyección:
   solo con una venta reportada por el cliente o un cobro real
   verificado; hoy no existe esa fuente, así que el trofeo queda
   bloqueado («Todavía no»). Ninguna misión suma XP sin la acción real
   (foto/video solo al mandarse; comentario solo al responderse de
   verdad): la XP la da el servidor por el hecho, nunca el cliente.
   Uso: node test-lote-rediseno-r5.js [árbol] — por defecto el dir del
   archivo. Boot real con DATA_DIR temporal + join trial (sin clave IA). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] || __dirname;
const PORT = 34795;
const TEST_KEY = 'rediseno-r5';

let PASS = 0, FAIL = 0;
const failed = [];
function check(name, cond, detail) {
  if (cond) { PASS++; console.log('  ok  ' + name); }
  else { FAIL++; failed.push(name); console.log('  FALLO ' + name + (detail ? ' — ' + detail : '')); }
}
const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const xpSrc = fs.existsSync(path.join(TREE, 'xp-nivel.js')) ? fs.readFileSync(path.join(TREE, 'xp-nivel.js'), 'utf8') : '';
const slice = (from, to) => {
  const a = appSrc.indexOf(from);
  const b = to ? appSrc.indexOf(to, a) : appSrc.length;
  return (a < 0 || b < 0) ? '' : appSrc.slice(a, b);
};
const fnSrc = (name) => {
  const m = appSrc.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  return m ? m[0] : '';
};

// ---------- Parte A: estático — el jardín sale ----------
console.log('== Parte A: estático — el jardín sale ==');
check('A1 posty-nivel50.js no existe', !fs.existsSync(path.join(TREE, 'posty-nivel50.js')));
check('A2 cero require posty-nivel50 (server, niveles, oficina, scheduler)', ['server.js', 'niveles.js', 'oficina.js', 'scheduler.js'].every((f) => !fs.readFileSync(path.join(TREE, f), 'utf8').includes("require('./posty-nivel50')")));
check('A3 postjardin.js no existe', !fs.existsSync(path.join(TREE, 'postjardin.js')));
check('A4 server.js: cero require postjardin', !serverSrc.includes("require('./postjardin')"));
check('A5 premios-notif.js no existe', !fs.existsSync(path.join(TREE, 'premios-notif.js')));
check('A6 server.js: cero require premios-notif', !serverSrc.includes("require('./premios-notif')"));
check('A7 scheduler.js: cero premios-notif', !fs.readFileSync(path.join(TREE, 'scheduler.js'), 'utf8').includes('premios-notif'));
for (const ep of ['/api/oficina/premios-no-vistos', '/api/oficina/premios-vistos', '/api/oficina/jardin-post50', '/api/oficina/jardin-semilla-regalo', '/api/oficina/jardin-semilla-canjear', '/api/oficina/jardin-semilla-mia'])
  check('A8 endpoint muerto fuera: ' + ep, !serverSrc.includes("'" + ep + "'"));
check('A9 /api/oficina/nivel sigue vivo', serverSrc.includes("app.get('/api/oficina/nivel'"));
check('A10 /api/oficina/nivel (posty) usa el cálculo XP', serverSrc.includes('avatarLevelData'));
check('A11 /api/oficina/jardin sigue vivo (oficina)', serverSrc.includes("app.get('/api/oficina/jardin'"));
check('A12 app.js: cero PZ_ROPA', !appSrc.includes('PZ_ROPA'));
check('A13 app.js: cero PZ_OFICINA', !appSrc.includes('PZ_OFICINA'));
check('A14 app.js: cero pzRopaAvatarHTML / pzOficinaSeccionHTML', !appSrc.includes('pzRopaAvatarHTML') && !appSrc.includes('pzOficinaSeccionHTML'));
check('A15 app.js: cero mxJardinHTML / mxJardinErrorHTML', !appSrc.includes('mxJardinHTML') && !appSrc.includes('mxJardinErrorHTML'));
check('A16 app.js: cero pzPremiosNuevosSync / Limpiar', !appSrc.includes('pzPremiosNuevosSync') && !appSrc.includes('pzPremiosNuevosLimpiar'));
check('A17 app.js: cero badge pz-premios-badge', !appSrc.includes('pz-premios-badge'));
check('A18 app.js: cero mxJardinPost50 / jardin-combinado / jardin-gesty', !appSrc.includes('mxJardinPost50') && !appSrc.includes('bbJardinCombinadoContent') && !appSrc.includes('bbJardinGestyContent'));
check('A19 app.js: cero Semilla de Maestro en UI', !appSrc.includes('Semilla de Maestro') && !appSrc.includes('semilla-maestro') && !appSrc.includes('Master seed'));
check('A20 app.js: cero «jardín» en la pantalla Nivel', !fnSrc('pzNivelPantallaHTML').toLowerCase().includes('jardín') && !fnSrc('pzNivelPantallaHTML').toLowerCase().includes('garden') && !fnSrc('bbNivelContent').toLowerCase().includes('jardín'));
check('A21 app.js: cero «Tu oficina» / «Your office» en Nivel', !fnSrc('pzNivelPantallaHTML').includes('Tu oficina') && !fnSrc('pzNivelPantallaHTML').includes('Your office'));
check('A22 app.js: cero «Próximo premio» en Nivel/tira', !appSrc.includes('Próximo premio') && !appSrc.includes('próximo premio') && !appSrc.includes('Next reward'));
check('A23 la tira ya no usa ropa: pzProximoPremioTira sin pzRopaPorNivel', !fnSrc('pzProximoPremioTira').includes('pzRopaPorNivel') && fnSrc('pzProximoPremioTira').includes('XP'));

// ---------- Parte A: estático — la pantalla nueva existe ----------
console.log('== Parte A: estático — la pantalla nueva existe ==');
const NIVEL_FNS = ['pzNivelPantallaHTML', 'pzNivelRachaCardHTML', 'pzNivelMisionesHTML', 'pzNivelLogrosHTML', 'pzNivelEscaleraHTML', 'pzNivelHitoActual', 'pzNivelNombre', 'pzNivelAutoCardHTML', 'pzNivelEnviarRespuesta', 'pzNivelRecargar', 'bbNivelContent'];
for (const f of NIVEL_FNS) check('A24 función existe: ' + f, appSrc.includes('function ' + f + '('));
check('A25 dispatch jardin-posty → bbNivelContent', /else if \(tab === 'jardin-posty'\)[^\n]*bbNivelContent\(\)/.test(appSrc));
check('A26 Nivel pide /api/avatar-level', fnSrc('bbNivelContent').includes("api.get('/api/avatar-level')"));
check('A27 Nivel pide /api/comments (misión comentario)', fnSrc('bbNivelContent').includes("api.get('/api/comments')"));
check('A28 Nivel pide /api/photo-mission + /api/ritual/hoy + /api/posts + /api/assets', ['/api/photo-mission', '/api/ritual/hoy', '/api/posts', '/api/assets'].every((e) => fnSrc('bbNivelContent').includes("api.get('" + e + "')")));
check('A29 misión comentario: panel con original + borrador + Enviar', fnSrc('pzNivelMisionesHTML').includes('Enviar la respuesta') && fnSrc('pzNivelMisionesHTML').includes('pzNivelEnviarRespuesta'));
check('A30 enviar respuesta: POST /api/comments/:id/reply + recarga', fnSrc('pzNivelEnviarRespuesta').includes('/reply') && fnSrc('pzNivelEnviarRespuesta').includes('pzNivelRecargar'));
check('A31 misión foto/video: abren el picker real del chat', fnSrc('pzNivelMisionesHTML').includes('pzSftFotoAlChat') || fnSrc('pzNivelMisionesHTML').includes('pzDockMasFoto'));
check('A32 el trofeo venta existe y NO se desbloquea solo', fnSrc('pzNivelLogrosHTML').includes('Primera venta por anuncio') && !fnSrc('pzNivelLogrosHTML').includes('ventaPorAnuncio'));
check('A33 postyLevelModal: regla XP real (40/60), no 100/150', !appSrc.includes('100 pts por post, 150 por reel') && slice('function postyLevelModal', 'function streakModalShell').includes('40'));
check('A34 nombres de nivel del mock en xp-nivel.js', xpSrc.includes('Recién arranca') && xpSrc.includes('Negocio Visible') && xpSrc.includes('Referente del rubro'));
check('A35 xp-nivel.js: nombres del mock, cero prestigio', fs.readFileSync(path.join(TREE, 'xp-nivel.js'), 'utf8').includes('Referente del rubro') && !fs.readFileSync(path.join(TREE, 'xp-nivel.js'), 'utf8').includes('prestigio'));
check('A35b server.js usa xp-nivel.js', serverSrc.includes("require('./xp-nivel')"));
check('A36 /api/avatar-level devuelve respuestas + rachaMax', fs.readFileSync(path.join(TREE, 'xp-nivel.js'), 'utf8').includes('respuestas, rachaMax'));
for (const c of ['.pz-nivel-head', '.pz-nivel-xpbar', '.pz-nivel-racha', '.pz-nivel-mision', '.pz-nivel-logro', '.pz-nivel-escalera', '.pz-nivel-auto'])
  check('A37 estilo existe: ' + c, cssSrc.includes(c));
check('A38 styles.css: cero reglas .pz-ropa- / .pz-oficina-', !cssSrc.includes('.pz-ropa-') && !cssSrc.includes('.pz-oficina-'));

// ---------- Parte A: estático — la regla XP intacta ----------
console.log('== Parte A: estático — la regla XP intacta ==');
check('A39 escala: 500 por nivel, 1–50', xpSrc.includes('XP_NIVEL = 500') && xpSrc.includes('XP_MAX_NIVEL = 50') && xpSrc.includes('Math.floor(xp / XP_NIVEL) + 1'));
check('A40 foto 40 / video 60', xpSrc.includes('XP_POST_BASE = 15') && xpSrc.includes('XP_POST_FOTO = 25') && xpSrc.includes('XP_POST_VIDEO = 45'));
check('A41 respuesta +25', xpSrc.includes('XP_RESPUESTA = 25'));
check('A42 bonos: semana 100, racha 150/300, 100 respuestas 150', xpSrc.includes('XP_PRIMERA_SEMANA = 100') && xpSrc.includes('XP_RACHA_30 = 150') && xpSrc.includes('XP_RACHA_100 = 300') && xpSrc.includes('XP_100_RESPUESTAS = 150'));
check('A43 primera venta por anuncio NO suma XP (sin dato de ventas)', !xpSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').toLowerCase().includes('venta'));
const CALLED = ['pzNivelPantallaHTML', 'pzNivelRachaCardHTML', 'pzNivelMisionesHTML', 'pzNivelLogrosHTML', 'pzNivelEscaleraHTML', 'pzNivelHitoActual', 'pzNivelNombre', 'pzNivelAutoCardHTML', 'pzNivelDiaSemana', 'pzNivelReelSemana', 'pzNivelVideoSemana', 'pzNivelNeedEn', 'albumMondayKey', 'pcTz', 'bbGo', 'esc', 'gzT'];
for (const f of CALLED) check('A44 función auditada: ' + f + ' definida', appSrc.includes('function ' + f + '(') || appSrc.includes('const ' + f + ' ='));

// ---------- Parte B: VM — la pantalla como el mock ----------
console.log('== Parte B: VM — la pantalla como el mock ==');
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
    pzSftFotoAlChat: () => {},
    pzDockMasFoto: () => {},
    pzDockMasVideo: () => {},
    document: { getElementById: () => null, querySelector: () => null },
    api: { get: async () => null, post: async () => ({ ok: true }) },
    location: { hash: '' },
  };
  vm.createContext(sandbox);
  const FNS = ['pzNivelNombre', 'pzNivelHitoActual', 'pzNivelDiaSemana', 'pzNivelReelSemana', 'pzNivelVideoSemana', 'pzNivelNeedEn', 'pzNivelRachaCardHTML', 'pzNivelAutoCardHTML', 'pzNivelMisionesHTML', 'pzNivelLogrosHTML', 'pzNivelEscaleraHTML', 'pzNivelPantallaHTML'];
  for (const f of FNS) {
    const src = fnSrc(f);
    if (!src) { sandbox['__' + f] = () => ''; continue; }
    vm.runInContext(src + '\nthis.__' + f + ' = ' + f + ';', sandbox);
  }
  return sandbox;
}
function call(ctx, expr) { try { return vm.runInContext(expr, ctx); } catch (e) { return 'VMERR:' + e.message; } }
const ctxEs = makeCtx('es'), ctxEn = makeCtx('en');
const NIVEL = { ok: true, xp: 1620, level: 4, levelName: 'Negocio Visible', nextXp: 2000, nextName: 'Negocio Visible', respuestas: 3, rachaMax: 12, published: 30, tier: 'none', unseenLevels: [] };
const RITUAL = { racha: 12, publicadoHoy: false };
const MISIONES = {
  mission: { need: 'una foto de tu plato más pedido', done: false },
  ritualHoy: RITUAL,
  posts: [{ status: 'scheduled', media_type: 'video', scheduled_at: '2026-11-12 19:00' }],
  assets: [],
  comments: [{ id: 7, username: 'Marta', text: '¿Tienen el taladro en oferta todavía?', suggested: '¡Hola, Marta! Sí, sigue en oferta hasta el sábado.', status: 'pending', created_at: '2026-11-08 10:00:00' }],
};
const D = { nivel: NIVEL, ritualHoy: RITUAL, mission: MISIONES.mission, posts: MISIONES.posts, assets: [], comments: MISIONES.comments };
const H = call(ctxEs, '__pzNivelPantallaHTML(' + JSON.stringify(D) + ')');
check('B1 cabecera: NIVEL 4 + Negocio Visible', H.includes('NIVEL') && H.includes('>4<') && H.includes('Negocio Visible'));
check('B2 XP: 120 / 500 para el Nivel 5, faltan 380', H.includes('120') && H.includes('500 XP') && H.includes('Nivel 5') && H.includes('380'));
check('B3 XP total: 1.620 acumulados', H.includes('1.620'));
check('B4 barra XP: 24%', H.includes('width:24%'));
check('B5 regla 500 XP del 1 al 50', H.includes('500 XP') && H.includes('del 1 al 50'));
check('B6 racha: 12 días publicando + metas 30/100', H.includes('12 días') && H.includes('30 días') && H.includes('+150 XP') && H.includes('100 días') && H.includes('+300 XP'));
check('B7 misiones: video 60 + foto 40 + comentario 25', H.includes('Grabá 15 segundos') && H.includes('+60 XP') && H.includes('Subí una foto') && H.includes('+40 XP') && H.includes('Respondé un comentario') && H.includes('+25 XP'));
check('B8 misión comentario: original + borrador + Enviar', H.includes('Marta') && H.includes('taladro en oferta') && H.includes('sigue en oferta hasta el sábado') && H.includes('Enviar la respuesta'));
check('B9 auto +15: posteo del día + Automático', H.includes('Se publicó tu posteo del día') && H.includes('+15 XP') && H.includes('Automático'));
check('B10 logros: semana ✓, 100 respuestas «Vas 3 de 100»', H.includes('Primera semana completa') && H.includes('✓ Conseguido') && H.includes('100 consultas respondidas') && H.includes('Vas 3 de 100'));
check('B11 trofeo venta bloqueado: «Todavía no»', H.includes('Primera venta por anuncio') && H.includes('Todavía no') && H.includes('+200 XP'));
check('B12 trofeos racha: «Vas 12 de 30» y «Vas 12 de 100»', H.includes('30 días seguidos') && H.includes('Vas 12 de 30') && H.includes('100 días seguidos') && H.includes('Vas 12 de 100'));
check('B13 escalera: 5 hitos + «Estás acá» en Negocio Visible', H.includes('Recién arranca') && H.includes('Constante') && H.includes('Conocido en el barrio') && H.includes('Negocio Visible') && H.includes('Referente del rubro') && H.includes('Estás acá'));
check('B14 footer: 140 XP por día', H.includes('140 XP por día'));
check('B15 EN: Level 4 + streak + missions', (() => { const h = call(ctxEn, '__pzNivelPantallaHTML(' + JSON.stringify(D) + ')'); return h.includes('Level') && h.includes('12 days') && /missions/i.test(h) && h.includes('Upload a photo') && h.includes('Record 15 seconds') && h.includes('Answer a comment'); })());
check('B16 sin datos: sin racha ni misiones, cabecera intacta', (() => { const h = call(ctxEs, '__pzNivelPantallaHTML(' + JSON.stringify({ nivel: { ok: true, xp: 0, level: 1, levelName: 'Recién arranca', nextXp: 500, nextName: 'Recién arranca', respuestas: 0, rachaMax: 0 }, ritualHoy: null, mission: null, posts: [], assets: [], comments: [] }) + ')'); return h.includes('NIVEL') && h.includes('Recién arranca') && !h.includes('pz-nivel-racha') && !h.includes('Subí una foto'); })());
check('B17 nivel 50: Nivel máximo', (() => { const h = call(ctxEs, '__pzNivelPantallaHTML(' + JSON.stringify({ nivel: { ok: true, xp: 24500, level: 50, levelName: 'Referente del rubro', nextXp: null, nextName: null, respuestas: 120, rachaMax: 100 }, ritualHoy: { racha: 100, publicadoHoy: true }, mission: null, posts: [], assets: [], comments: [] }) + ')'); return h.includes('Nivel máximo') && h.includes('Referente del rubro') && h.includes('✓ Conseguido'); })());
check('B18 hito actual: racha 14 → Constante', call(ctxEs, "__pzNivelHitoActual({level:2,respuestas:0,rachaMax:14}).nombre") === 'Constante');
check('B19 hito actual: 5 respuestas → Conocido en el barrio', call(ctxEs, "__pzNivelHitoActual({level:2,respuestas:5,rachaMax:3}).nombre") === 'Conocido en el barrio');
check('B20 hito actual: nivel 1 → Recién arranca', call(ctxEs, "__pzNivelHitoActual({level:1,respuestas:0,rachaMax:0}).nombre") === 'Recién arranca');
check('B21 nombre por nivel: 1–3 Recién arranca, 4–49 Negocio Visible, 50 Referente', call(ctxEs, '__pzNivelNombre(1)') === 'Recién arranca' && call(ctxEs, '__pzNivelNombre(3)') === 'Recién arranca' && call(ctxEs, '__pzNivelNombre(4)') === 'Negocio Visible' && call(ctxEs, '__pzNivelNombre(49)') === 'Negocio Visible' && call(ctxEs, '__pzNivelNombre(50)') === 'Referente del rubro');
check('B22 cero botones muertos: todo botón tiene onclick', (() => { const btns = H.match(/<button[^>]*>/g) || []; return btns.length >= 3 && btns.every((b) => /onclick=/.test(b)); })());
check('B23 cero «jardín» / «garden» / «premio» en la pantalla', !/jard[ií]n|garden|premio|prize/i.test(H));

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
  const serverSrc2 = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
  const buildTree = (serverSrc2.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '?';
  console.log('árbol: ' + TREE + ' BUILD ' + buildTree);
  console.log('== Parte C: boot real ==');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rediseno-r5-'));
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
    const u1 = await joinUser('nivel-r5');
    check('C2 join trial ok', !!u1.cookie);
    const av0 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C3 /api/avatar-level: nivel + XP + respuestas + rachaMax', !!av0 && av0.ok === true && typeof av0.level === 'number' && typeof av0.xp === 'number' && typeof av0.respuestas === 'number' && typeof av0.rachaMax === 'number', av0 ? JSON.stringify(av0) : 'sin respuesta');
    check('C4 nombre nivel 1 = Recién arranca', !!av0 && av0.levelName === 'Recién arranca', av0 ? av0.levelName : 'sin respuesta');
    const nv = j((await req('GET', '/api/oficina/nivel?poder=posty', null, null, u1.cookie)).txt);
    check('C5 /api/oficina/nivel: XP (avance 500, sin premios)', !!nv && nv.ok === true && typeof nv.nivel === 'number' && nv.avance && nv.avance.total === 500 && nv.premio_actual == null && nv.siguiente_premio == null, nv ? JSON.stringify(nv).slice(0, 160) : 'sin respuesta');
    check('C6 /api/oficina/nivel: proximo_paso en XP', !!nv && typeof nv.proximo_paso === 'string' && /XP/.test(nv.proximo_paso), nv ? nv.proximo_paso : 'sin respuesta');
    for (const ep of ['/api/oficina/premios-no-vistos', '/api/oficina/jardin-post50', '/api/oficina/jardin-semilla-mia'])
      check('C7 endpoint muerto 404: GET ' + ep, (await req('GET', ep, null, null, u1.cookie)).st === 404);
    const jd = j((await req('GET', '/api/oficina/jardin', null, null, u1.cookie)).txt);
    check('C8 /api/oficina/jardin sigue vivo (oficina)', !!jd && jd.ok === true, jd ? JSON.stringify(jd).slice(0, 80) : 'sin respuesta');
    const rit = j((await req('GET', '/api/ritual/hoy', null, null, u1.cookie)).txt);
    check('C9 /api/ritual/hoy: racha número (crea pz_ritual)', !!rit && typeof rit.racha === 'number', rit ? JSON.stringify(rit.racha) : 'sin respuesta');
    const servedApp = (await req('GET', '/app.js')).txt;
    check('C10 servido: app.js trae pzNivelPantallaHTML', servedApp.includes('pzNivelPantallaHTML'));
    check('C11 servido: app.js cero PZ_ROPA / pzPremiosNuevosSync', !servedApp.includes('PZ_ROPA') && !servedApp.includes('pzPremiosNuevosSync'));
    check('C12 servido: el dock dice Nivel', servedApp.includes("tabBtn('jardin', '#/app/jardin-posty', gzT('Nivel', 'Level'))"));
    // C12–C18: la regla XP con datos sembrados (mismo patrón que el lote
    // nivel-misiones-racha: node:sqlite sobre posta.db del tmp).
    const base0 = (av0 && typeof av0.xp === 'number') ? av0.xp : 0;
    const seed = new DatabaseSync(path.join(tmp, 'posta.db'));
    const insPost = (mt) => seed.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, published_at) VALUES (?, 'x.jpg', '', 'published', ?, datetime('now'))`).run(u1.userId, mt);
    insPost('image'); insPost('image'); insPost('video');
    const av13 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C13 XP: 2 fotos + 1 video = +140 (nivel 1, próximo 500)', !!av13 && av13.xp === base0 + 140 && av13.level === 1 && av13.nextXp === 500, av13 ? JSON.stringify(av13) : 'sin respuesta');
    // Misión comentario de verdad: comentario pendiente con borrador.
    // /api/comments es plan Total: el usuario de prueba se sube a Total
    // (plan_status='active', plan='total'). Sin IG conectado, el reply
    // real falla ('Instagram no conectado') y la XP NO se mueve: eso ES
    // la regla de oro (nada suma sin la acción real). El +25 se verifica
    // sembrando el 'replied' que deja un envío real (Atención).
    const seed0 = new DatabaseSync(path.join(tmp, 'posta.db'));
    seed0.prepare(`UPDATE users SET plan_status='active', plan='total' WHERE id = ?`).run(u1.userId);
    seed0.close();
    seed.prepare(`INSERT INTO comment_queue (user_id, ig_comment_id, ig_media_id, username, text, suggested, status) VALUES (?, 'igc1', 'm1', 'Marta', '¿Tienen el taladro en oferta todavía?', '¡Hola, Marta! Sí, sigue en oferta.', 'pending')`).run(u1.userId);
    const cm0 = j((await req('GET', '/api/comments', null, null, u1.cookie)).txt);
    check('C14 /api/comments: el pendiente con borrador está', !!cm0 && Array.isArray(cm0.comments) && cm0.comments.length === 1 && cm0.comments[0].suggested === '¡Hola, Marta! Sí, sigue en oferta.', cm0 ? JSON.stringify(cm0).slice(0, 120) : 'sin respuesta');
    const cid = cm0 && Array.isArray(cm0.comments) && cm0.comments[0] ? cm0.comments[0].id : null;
    let repOk = false, repTxt = '';
    if (cid) {
      const rr = await req('POST', '/api/comments/' + cid + '/reply', Buffer.from(JSON.stringify({ message: '¡Hola, Marta! Sí, sigue en oferta.' })), 'application/json', u1.cookie);
      repTxt = rr.txt; repOk = rr.st === 200;
    }
    check('C15 reply sin IG conectado: NO se manda (y no suma XP)', !repOk && /Instagram no conectado|No pudimos responder/.test(repTxt), repTxt.slice(0, 120));
    const av14a = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C16 XP: sin envío real, la XP NO se mueve (sigue 140)', !!av14a && av14a.xp === base0 + 140 && av14a.respuestas === 0, av14a ? JSON.stringify(av14a) : 'sin respuesta');
    seed.prepare(`UPDATE comment_queue SET status='replied' WHERE user_id = ? AND ig_comment_id = 'igc1'`).run(u1.userId);
    const av14 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C17 XP: respuesta real = +25 (165 total) y respuestas = 1', !!av14 && av14.xp === base0 + 165 && av14.respuestas === 1, av14 ? JSON.stringify(av14) : 'sin respuesta');
    const cm1 = j((await req('GET', '/api/comments', null, null, u1.cookie)).txt);
    check('C18 /api/comments: ya no hay pendientes (misión hecha)', !!cm1 && Array.isArray(cm1.comments) && cm1.comments.length === 0);
    const insPick = (dk) => seed.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, picked_post_id) VALUES (?, ?, 1, 1)`).run(u1.userId, dk);
    ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].forEach(insPick);
    seed.close();
    const av16 = j((await req('GET', '/api/avatar-level', null, null, u1.cookie)).txt);
    check('C19 XP: racha 7 días = +100 (265 total) y rachaMax = 7', !!av16 && av16.xp === base0 + 265 && av16.rachaMax === 7, av16 ? JSON.stringify(av16) : 'sin respuesta');
  } finally {
    try { proc.kill('SIGTERM'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nTOTAL: ${PASS} ok / ${FAIL} fallos${FAIL ? ' — ' + failed.join(' | ') : ''}`);
  process.exit(FAIL ? 1 : 0);
}
main().catch((e) => { console.log('ERROR: ' + (e && e.stack || e)); process.exit(2); });
