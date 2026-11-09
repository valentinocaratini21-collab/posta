// test-lote-simplificar-app.js — LOTE SIMPLIFICAR-APP (partes 1–7)
// VM + boot real. Puerto 34579 (libre; no choca con 34572/34575/34576/34577/34578).
// La suite vive en release/ (el árbol del lote); TREE = su propio directorio.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const md5 = (x) => crypto.createHash('md5').update(x).digest('hex');
const { DatabaseSync } = require('node:sqlite');
const TREE = __dirname;
const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const chunkSrc = fs.readFileSync(path.join(TREE, 'public', 'chunk-analisis.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
let pass = 0, fail = 0; const fails = [];
function check(name, cond, got) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; fails.push(name); console.log('  ❌ ' + name + ' — ' + String(got == null ? '' : got).slice(0, 220)); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function sliceFn(s, start, end) {
  const i = s.indexOf(start);
  if (i < 0) throw new Error('no se encontró: ' + start);
  const j = end ? s.indexOf(end, i + start.length) : s.length;
  if (j < 0) throw new Error('no se encontró fin: ' + end);
  return s.slice(i, j);
}

// ---------- VM compartida ----------
let code = '';
const escM = appSrc.match(/^const esc = \(s\) => [^\n]*\n/m);
code += escM[0];
code += sliceFn(appSrc, 'function pzHoyDiaKey(', 'function pzHoyMoverKey(');
code += sliceFn(appSrc, 'function pzHoyMoverKey(', 'function pzHoyDowKey(');
code += sliceFn(appSrc, 'function pzHoyDowKey(', 'function pzHoyPostDiaKey(');
code += sliceFn(appSrc, 'function pzHoyPostDiaKey(', 'function pzHoySemana(');
code += sliceFn(appSrc, 'function pzHoySemana(', 'function pzHoyPendientes(');
code += sliceFn(appSrc, 'function pzHoyPendientes(', '// Hora corta');
code += sliceFn(appSrc, 'function pzHoySaludoTxt(', '\n// Hora corta');
code += sliceFn(appSrc, 'function pzHoyHoraCorta(', '\n// Día relativo corto');
code += sliceFn(appSrc, 'function pzHoySpeechHTML(', '\n// Entrada al conserje');
// (REDISEÑO SIMPLE · 9/11: la Parte 3 salió — el chunk vuelve a ser la base
// v824 y la mini vive en app.js: el slice pzHoySemana → pzHoyPendientes
// ya la trae (está entre ambas funciones).)
code += sliceFn(appSrc, 'function pzHoySemanaMiniHTML(', 'function pzHoyPendientes(');
const sb = {
  console, Date, Math, JSON, setTimeout, clearTimeout,
  ME: { lang: 'es' },
  SETTINGS: { timezone: 'America/New_York' },
  pzIc: (n, s) => `<svg data-ic="${n}" width="${s}">`,
  schedDayKeyOf: (d, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch (e) { return ''; } },
};
vm.createContext(sb);
vm.runInContext(code, sb);
const strip = (h) => String(h).replace(/<[^>]+>/g, '');
const t = (o) => strip(vm.runInContext('pzHoySpeechHTML(' + JSON.stringify(o) + ')', sb));
const TZ = 'America/New_York';

// ---------- §1 · PARTE 1: subida SOLO por chat ----------
console.log('— §1 parte 1: subida solo por chat —');
for (const s of ['pzHoyUploadHTML', 'pzHoyAlbumBorrar', 'pzHoyAlbumCuenta', 'pzHoySubirPicker', 'pzHoySubirCamara', 'pzHoySubirGaleria', 'mediaCardHTML', 'bindMediaCard', 'wireAlbumUpload', 'pzSftDespuesDeSubir(', 'data-uploadphoto', 'data-uploadvideo', 'agUploadBtn', '#mediaFiles']) {
  check('§1 fuera del chat: ' + s + ' ×0', !appSrc.includes(s), 'queda');
check('§1 #albumFile: solo el comentario intencional (NUNCA #albumFile)', (appSrc.match(/#albumFile/g) || []).length === 1, 'ocurrencias: ' + (appSrc.match(/#albumFile/g) || []).length);
}
check('§1 la puerta del chat queda (#chatFile + chatUploadPhotos)', appSrc.includes('#chatFile') && /function chatUploadPhotos/.test(appSrc), 'falta');
check('§1 el dock Agregar (+) es atajo al chat (pzDockMasFoto → #chatFile)', /pzDockMasFoto/.test(appSrc) && /pzDockMasToggle/.test(appSrc), 'falta');
check('§1 pzSubir* queda (alcanzable desde el chat)', /function pzSubirFotoAbrir/.test(appSrc), 'falta');
check('§1 endpoints de subida quedan (el chat los usa)', appSrc.includes('/api/media?from=chat') && appSrc.includes('/api/assets?kind=video'), 'falta');

// ---------- §2 · PARTE 2: Inicio = saludo + posteo del día ----------
console.log('— §2 parte 2: Inicio saludo + posteo del día —');
for (const s of ['pzHoySemanaHTML', 'pzSemanaOkHTML', 'vacioR1', 'cardsR1']) {
  check('§2 Inicio: ' + s + ' ×0', !appSrc.includes(s), 'queda');
}
check('§2 semR1 vuelve (el DATO de la mini, REDISEÑO SIMPLE)', /semR1 = pzHoySemana\(published/.test(appSrc), 'falta');
check('§2 pzHoyHoyHTML queda (el posteo del día)', /function pzHoyHoyHTML/.test(appSrc), 'falta');
check('§2 pzHoySemana (el DATO) queda para la mini de Hoy', /function pzHoySemana\(/.test(appSrc), 'falta');
check('§2 pzSemanaAprobada* quedan (el feed las usa)', /function pzSemanaAprobadaHTML/.test(appSrc) && /function pzSemanaAprobadaState/.test(appSrc), 'falta');
for (const s of ['pz-hoy-upload', 'pz-hoy-semana', 'pz-hoy-ring', 'pz-hoy-dias', 'pz-hoy-vacio', 'pz-hoy-album-']) {
  check('§2 CSS: ' + s + ' ×0', !cssSrc.includes(s), 'queda');
}

// ---------- §3 · PARTE 2 (revisada): la semana en Hoy = fila mini + insight ----------
// (REDISEÑO SIMPLE · 9/11: la Parte 3 NO se hace — no hay nada en Análisis.
// La 5/7 queda en Hoy como week-mini del mock + línea de insight.)
console.log('— §3 parte 2 revisada: semana mini en Hoy —');
check('§3 Análisis sin parte 3 (anaSemanaPuntajeHTML ×0)', !chunkSrc.includes('anaSemanaPuntajeHTML') && !appSrc.includes('anaSemanaPuntajeHTML'), 'queda');
check('§3 Análisis sin rating (anaRateUltimosHTML ×0)', !chunkSrc.includes('anaRateUltimosHTML') && !appSrc.includes('anaRateUltimosHTML'), 'queda');
check('§3 anaLoad no monta puntaje (anaPuntajeMount ×0)', !chunkSrc.includes('anaPuntajeMount'), 'queda');
check('§3 chunk = base v824 (md5)', md5(chunkSrc) === '7b52c1da30d871b23ec7bc1bacd7ca7c', md5(chunkSrc));
check('§3 CSS sin .ana-semana/.ana-rate (parte 3)', !cssSrc.includes('.ana-semana') && !cssSrc.includes('.ana-rate'), 'queda');
check('§3 CSS trae la mini (.pz-semana-mini/.pz-semana-bola/.pz-semana-insight)', cssSrc.includes('.pz-semana-mini') && cssSrc.includes('.pz-semana-bola') && cssSrc.includes('.pz-semana-insight'), 'falta');
const pub5 = [9, 10, 11, 12, 13].map((d, i) => ({ id: 600 + i, status: 'published', media_type: 'image', published_at: `2026-11-${String(d).padStart(2, '0')}T19:00:00Z`, caption: 'Posteo ' + (i + 1) }));
const sem = vm.runInContext(`pzHoySemana(${JSON.stringify(pub5)}, '${TZ}', new Date('2026-11-09T06:00:00-05:00'))`, sb);
sb.sem = sem;
check('§3 mini: conteo real n=5 (lun-vie)', sem.n === 5, JSON.stringify(sem));
const hMini = vm.runInContext('pzHoySemanaMiniHTML(sem, false, 2)', sb);
check('§3 mini: 7 bolas LUN–DOM', (hMini.match(/pz-semana-dia/g) || []).length === 7 && /LUN/.test(hMini) && /DOM/.test(hMini), hMini);
check('§3 mini: 5 hecho + 2 espera (lunes con 5 publicados)', (hMini.match(/pz-semana-dia done/g) || []).length === 5 && (hMini.match(/pz-semana-dia wait/g) || []).length === 2, hMini);
check('§3 mini: sin estado ready (SEMANA UNA POR UNA)', !/ready/.test(hMini), hMini);
check('§3 insight lunes: «5/7 posteos, tu semana viene en camino»', /5\/7 posteos, tu semana viene en camino/.test(hMini), hMini);
check('§3 insight: acción = están en tu feed', /Los próximos están en tu feed, con su día y su hora/.test(hMini), hMini);
const hMini0 = vm.runInContext('pzHoySemanaMiniHTML({n:0,lunes:"2026-11-09",dias:[{key:"2026-11-09",estado:"hoy"},{key:"2026-11-10",estado:"fut"},{key:"2026-11-11",estado:"fut"},{key:"2026-11-12",estado:"fut"},{key:"2026-11-13",estado:"fut"},{key:"2026-11-14",estado:"fut"},{key:"2026-11-15",estado:"fut"}]}, false, 0)', sb);
check('§3 insight n=0: «Tu semana recién arranca» + chat + botón', /Tu semana recién arranca/.test(hMini0) && /contale a Posty en el chat/.test(hMini0) && /Abrir el chat/.test(hMini0), hMini0);
check('§3 inicioView rinde la mini (pzHoySemanaMiniHTML en hoyAprobarHTML)', appSrc.includes('pzHoySemanaMiniHTML(semR1, enHome, pendProgR1)'), 'falta');

// ---------- §6 · PARTE 6: el saludo dice lo que pasa EN ESTE ESTADO ----------
console.log('— §6 parte 6: saludo por estado —');
const schedPend = { status: 'scheduled', approval: 'pending', scheduled_at: '2026-11-10T00:00:00Z' };
let g = t({ hoyPost: schedPend, pendientes: 2, haySemana: true, en: false, tz: TZ, manual: false, needOK: 0, schedSolo: 2 });
check('§6 A autopilot: sale solo a las 19:00 + aviso 30 min + aviso al salir', /sale a las .* solo/.test(g) && /30 min antes/.test(g) && /te aviso cuando salga/.test(g), g);
g = t({ hoyPost: { status: 'scheduled', approval: 'approved', scheduled_at: '2026-11-10T00:00:00Z' }, pendientes: 0, haySemana: true, en: false, tz: TZ, manual: true, needOK: 0, schedSolo: 0 });
check('§6 A manual aprobado: sale solo', /sale a las .* solo/.test(g), g);
g = t({ hoyPost: schedPend, pendientes: 2, haySemana: true, en: false, tz: TZ, manual: true, needOK: 2, schedSolo: 0 });
check('§6 A manual pendiente: necesita OK («Sin tu OK, no sale nada»)', /Sin tu OK, no sale nada/.test(g), g);
g = t({ hoyPost: { status: 'draft', scheduled_at: '2026-11-10T00:00:00Z' }, pendientes: 0, haySemana: true, en: false, tz: TZ, manual: false, needOK: 1, schedSolo: 0 });
check('§6 A draft en autopilot: necesita OK', /Sin tu OK, no sale nada/.test(g), g);
g = t({ hoyPost: null, pendientes: 2, haySemana: true, en: false, tz: TZ, manual: true, needOK: 2, schedSolo: 0 });
check('§6 B manual: «Tenés 2 posteos para revisar» (needOK, no el total)', /Tenés 2 posteos para revisar/.test(g), g);
g = t({ hoyPost: null, pendientes: 2, haySemana: true, en: false, tz: TZ, manual: false, needOK: 0, schedSolo: 2 });
check('§6 B autopilot: «salen solos a su hora»', /salen solos a su hora/.test(g), g);
const okLines = appSrc.split('\n').filter((l) => /Sin tu OK, no sale nada/.test(l));
check('§6 «Sin tu OK» vive solo en las 3 líneas que necesitan OK (A draft/manual + B singular/plural)', okLines.length === 3, 'líneas: ' + okLines.length);
check('§6 ninguna línea con «sale solo/salen solos» dice «Sin tu OK»', !appSrc.split('\n').some((l) => /sale.*solo|salen solos/.test(l) && /Sin tu OK/.test(l)), 'revisar');

// ---------- §7 · PARTE 7: datos reales user 12 (583/582/580) ----------
console.log('— §7 parte 7: datos reales user 12 —');
const posts12 = [
  { id: 583, status: 'scheduled', media_type: 'image', scheduled_at: '2026-11-10T00:00:00Z', approval: null, week_key: '2026-11-09' },
  { id: 582, status: 'scheduled', media_type: 'image', scheduled_at: '2026-11-11T00:00:00Z', approval: null, week_key: '2026-11-02' },
  { id: 580, status: 'scheduled', media_type: 'image', scheduled_at: '2026-11-12T00:00:00Z', approval: null, week_key: '' },
  { id: 581, status: 'draft', media_type: 'story', scheduled_at: null, approval: null, week_key: '' },
  { id: 570, status: 'published', media_type: 'image', scheduled_at: '2026-11-09T00:00:00Z', approval: 'approved', week_key: '2026-11-02' },
];
const hoyKey = vm.runInContext(`pzHoyDiaKey(new Date('2026-11-09T06:00:00-05:00'), '${TZ}')`, sb);
const mananaKey = vm.runInContext(`pzHoyMoverKey('${hoyKey}', 1)`, sb);
const pend12 = vm.runInContext(`pzHoyPendientes(${JSON.stringify(posts12)}, '${hoyKey}', '${mananaKey}', '2026-11-09', '${TZ}')`, sb);
check('§7 cartita=582, resto=[583,580], total=3, hoyPost=583', pend12.cartita && pend12.cartita.id === 582 && pend12.resto.length === 2 && pend12.total === 3, JSON.stringify(pend12));
check('§7 Inicio NO rinde cardsR1 (×0 en app.js)', !/cardsR1/.test(appSrc), 'queda cardsR1');
check('§7 barra Aprobar todo fuera de Inicio (pzAcceptWeek ×0)', !/pzAcceptWeek/.test(appSrc), 'queda');
check('§7 el saludo apunta al feed («miralos en tu feed»)', /miralos en tu feed/.test(t({ hoyPost: null, pendientes: 3, haySemana: true, en: false, tz: TZ, manual: true, needOK: 3, schedSolo: 0 })), 'falta');
check('§7 pzHoyPendientes + PZ_HOY_POSTS siguen (feed + Cambialo)', /function pzHoyPendientes/.test(appSrc) && /PZ_HOY_POSTS\[String\(/.test(appSrc), 'falta');

// ---------- §5 · PARTE 5: encabezado nombre del negocio, sin fuego ----------
console.log('— §5 parte 5: encabezado —');
check('§5 píldora de racha ×0 (pzHeadRacha / __pzHeadRacha* / pz-shell-racha)', !/pzHeadRacha/.test(appSrc) && !/__pzHeadRacha/.test(appSrc) && !/pz-shell-racha/.test(cssSrc), 'queda');
check('§5 el título usa PROFILE.business_name (no solo BB.estado.negocio)', /PROFILE\.business_name/.test(sliceFn(appSrc, 'function pzShellHeadHTML(', 'function pzShellDatosHoy(')), 'falta');
check('§5 el @ no aparece en el encabezado (sin sub con @handle)', !/@' \+ esc\(handle\)/.test(sliceFn(appSrc, 'function pzShellHeadHTML(', 'function pzShellDatosHoy(')) || !/sub =/.test(sliceFn(appSrc, 'function pzShellHeadHTML(', 'function pzShellDatosHoy(')), 'revisar');
check('§5 el fetch /api/ritual/hoy sigue (la carta lo necesita)', appSrc.includes('/api/ritual/hoy'), 'falta');
check('§5 la gamificación de racha de Nivel NO se tocó', /racha 30 días/.test(appSrc) || /racha.*30/.test(appSrc), 'falta');

// ---------- §4 · PARTE 4: el chat sube y baja con el teclado ----------
async function parteChat() {
  console.log('— §4 parte 4: teclado simulado —');
  let kb = '';
  kb += 'let PZ_CHAT_PIN = false;\n';
  kb += sliceFn(appSrc, 'function pzChatToBottom(', 'function chatScroll(');
  kb += sliceFn(appSrc, 'function chatScroll(', '// El pin sigue al dedo');
  kb += sliceFn(appSrc, 'function pzChatKbSync(', '// Escucha el teclado');
  kb += sliceFn(appSrc, 'function pzChatKbBind(', '// (LOTE MIC-INICIO)');
  let scrollWrites = 0;
  let _scrollTop = 0;
  const root = { style: {} };
  const box = { scrollHeight: 5000, dataset: {} };
  Object.defineProperty(box, 'scrollTop', { get() { return _scrollTop; }, set(v) { _scrollTop = v; scrollWrites++; }, configurable: true });
  const vvListeners = {};
  const vv = { height: 844, offsetTop: 0, addEventListener: (ev, fn) => { (vvListeners[ev] = vvListeners[ev] || []).push(fn); } };
  const win = { innerHeight: 844, visualViewport: vv, __pzChatKbBound: false, __pzChatKbSettle: false, addEventListener: () => {} };
  const sb2 = { console, Date, Math, JSON, setTimeout, clearTimeout, window: win, document: { getElementById: (id) => (id === 'pzChatFull' ? root : (id === 'chatBox' ? box : null)), querySelector: () => null } };
  sb2.$ = (sel) => (sel === '#chatBox' ? box : null);
  vm.createContext(sb2);
  vm.runInContext(kb, sb2);
  check('§4 contenedor escucha resize/scroll del viewport + orientationchange', /vv\.addEventListener\('resize', pzChatKbSync\)/.test(appSrc) && /vv\.addEventListener\('scroll', pzChatKbSync\)/.test(appSrc) && /orientationchange', pzChatKbSync/.test(appSrc), 'falta');
  check('§4 pzChatKbSync baja al final si el pin está prendido + re-afirma a 350 ms', /PZ_CHAT_PIN.*chatScroll\(\)/.test(appSrc) && /pzChatKbSync\(true\)/.test(appSrc) && /, 350\)/.test(appSrc), 'falta');
  check('§4 CSS: transición suave de altura/top en .pz-chatfull', /transition:height \.28s ease,top \.28s ease/.test(cssSrc), 'falta');
  check('§4 CSS: columna centrada 640px en ≥761px', /@media\(min-width:761px\)\{\.pz-chatfull\{left:50%;right:auto;width:640px;margin-left:-320px\}\}/.test(cssSrc), 'falta');
  check('§4 CSS: #chatCard flex:1 + .chat-box flex:1 sin max-height (hasta abajo)', /\.pz-chatfull #chatCard\{flex:1;display:flex;flex-direction:column;min-height:0/.test(cssSrc) && /\.pz-chatfull \.chat-box\{flex:1 1 auto;min-height:0;max-height:none;overflow-y:auto\}/.test(cssSrc), 'falta');
  vm.runInContext('pzChatKbBind(); pzChatKbSync();', sb2);
  check('§4 teclado cerrado: altura = viewport (844px)', root.style.height === '844px', root.style.height);
  vm.runInContext('PZ_CHAT_PIN = true;', sb2);
  scrollWrites = 0;
  vv.height = 500;
  (vvListeners.resize || []).forEach((fn) => fn());
  check('§4 teclado abierto: el chat SUBE (altura 500px) + baja al final', root.style.height === '500px' && scrollWrites >= 1 && box.scrollTop === box.scrollHeight, root.style.height + ' scrollWrites=' + scrollWrites);
  await sleep(420);
  check('§4 tras la animación: sigue a 500px y abajo, sin timers colgados', root.style.height === '500px' && box.scrollTop === box.scrollHeight && win.__pzChatKbSettle === false, root.style.height);
  scrollWrites = 0;
  vv.height = 844;
  (vvListeners.resize || []).forEach((fn) => fn());
  check('§4 teclado cerrado: el chat BAJA (altura 844px) + baja al final', root.style.height === '844px' && scrollWrites >= 1 && box.scrollTop === box.scrollHeight, root.style.height);
  await sleep(420);
  vm.runInContext('PZ_CHAT_PIN = false;', sb2);
  box.scrollTop = 100;
  scrollWrites = 0;
  vv.height = 500;
  (vvListeners.resize || []).forEach((fn) => fn());
  check('§4 pin apagado: el teclado NO mueve al lector', scrollWrites === 0 && box.scrollTop === 100, 'scrollWrites=' + scrollWrites + ' scrollTop=' + box.scrollTop);
}

// ---------- §8 · boot real ----------
const PORT = 34579;
const TEST_KEY = 'boot-test-key-sa';
const tmpDir = fs.mkdtempSync(path.join(path.dirname(TREE), 'boot-tmp-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
fs.copyFileSync(path.join(TREE, 'public', 'ai-avatar.png'), path.join(mediaDir, 'test.jpg'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
async function reqJson(method, p, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}
function iso(d) { return new Date(d).toISOString(); } // ISO con 'T': el server escribe toISOString() y el scheduler compara strings
async function parteBoot() {
  console.log('— §8 boot real —');
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    check('§8 el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    const buildFile = (fs.readFileSync(path.join(TREE, 'server.js'), 'utf8').match(/BUILD_ID\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '';
    check('§8 /api/version = BUILD del árbol (' + buildFile + ')', ver && ver.build === buildFile, JSON.stringify(ver));
    const servedApp = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=1`)).text();
    check('§8 el app.js servido trae el lote (sin pzHoyUploadHTML/cardsR1, con pzHoyHoyHTML)', !servedApp.includes('pzHoyUploadHTML') && !servedApp.includes('cardsR1') && servedApp.includes('pzHoyHoyHTML'), 'len ' + servedApp.length);
    check('§8 el app.js servido trae la puerta del chat (#chatFile)', servedApp.includes('#chatFile') && servedApp.includes('chatUploadPhotos'), 'falta');
    const servedChunk = await (await fetch(`http://127.0.0.1:${PORT}/chunk-analisis.js`)).text();
    check('§8 el chunk servido es la base v824 (sin parte 3)', !servedChunk.includes('anaPuntajeMount') && !servedChunk.includes('anaRateUltimosHTML') && !servedChunk.includes('anaSemanaPuntajeHTML') && md5(servedChunk) === md5(chunkSrc), 'len ' + servedChunk.length);
    // Tres usuarios: autopilot (trust 1), manual (trust 0), rating (aislado).
    async function join(tag) {
      const j = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'sa-' + tag, device: 'test-device-sa-' + tag });
      if (!j.json || !j.json.user_id) throw new Error('sin join ' + tag + ': ' + JSON.stringify(j.json));
      return { uid: j.json.user_id, cookie: j.setCookie ? String(j.setCookie).split(';')[0] : '' };
    }
    const uAuto = await join('auto');
    const uMan = await join('man');
    const uRate = await join('rate');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    for (const u of [uAuto, uMan, uRate]) { try { db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(u.uid); } catch (e) {} }
    const trustAuto = db.prepare('SELECT trust_level, autopilot_enabled FROM users WHERE id = ?').get(uAuto.uid);
    check('§8 el invitado nace en autopilot (trust 1)', Number(trustAuto.trust_level) === 1 && Number(trustAuto.autopilot_enabled) === 1, JSON.stringify(trustAuto));
    db.prepare('UPDATE users SET trust_level = 0, autopilot_enabled = 0 WHERE id = ?').run(uMan.uid);
    const postCols = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
    function seedPost(uid, fields) {
      const f = ['user_id', 'image_path', 'caption', 'status', 'scheduled_at', 'published_at', ...Object.keys(fields)];
      const v = [uid, '/media/test.jpg', fields.caption || 'Posteo de prueba', fields.status || 'scheduled', fields.scheduled_at || null, fields.published_at || null, ...Object.values(fields)];
      // quitar los duplicados de fields que ya están en f
      const seen = new Set(); const ff = []; const vv = [];
      f.forEach((k, i) => { if (!seen.has(k)) { seen.add(k); ff.push(k); vv.push(v[i]); } });
      const ok = ff.filter((k) => postCols.includes(k));
      const vals = ok.map((k) => vv[ff.indexOf(k)]);
      const r = db.prepare(`INSERT INTO posts (${ok.join(',')}) VALUES (${ok.map(() => '?').join(',')})`).run(...vals);
      return Number(r.lastInsertRowid);
    }
    const now = Date.now();
    // A: autopilot, vencido hace 1 min, pendiente → tiene que salir SOLO.
    const idA = seedPost(uAuto.uid, { status: 'scheduled', scheduled_at: iso(now - 60e3), approval: 'pending', media_type: 'image' });
    // B: manual, vencido hace 1 min, pendiente → tiene que FALLAR.
    const idB = seedPost(uMan.uid, { status: 'scheduled', scheduled_at: iso(now - 60e3), approval: 'pending', media_type: 'image' });
    // C: autopilot, sale en 30 min → aviso pre-publicación (autopilot_notified=1).
    const idC = seedPost(uAuto.uid, { status: 'scheduled', scheduled_at: iso(now + 30 * 60e3), approval: 'pending', media_type: 'image' });
    // R: publicado hace 2 días (rating, usuario aislado).
    const idR = seedPost(uRate.uid, { status: 'published', scheduled_at: iso(now - 2 * 864e5), published_at: iso(now - 2 * 864e5), approval: 'approved', media_type: 'image' });
    check('§8 posteos sembrados (A autopilot vencido, B manual vencido, C +30min, R publicado)', idA > 0 && idB > 0 && idC > 0 && idR > 0, `A=${idA} B=${idB} C=${idC} R=${idR}`);
    // Rating: XP base → rating_4 → +10 exacto, una sola vez.
    const lvl0 = await reqJson('GET', '/api/avatar-level', undefined, uRate.cookie);
    check('§8 XP base del usuario rating (ratings=0)', lvl0.status === 200 && lvl0.json && Number(lvl0.json.ratings) === 0, JSON.stringify(lvl0.json));
    const sig1 = await reqJson('POST', '/api/posts/' + idR + '/signal', { signal: 'rating_4' }, uRate.cookie);
    check('§8 POST rating_4 → 200 ok', sig1.status === 200 && sig1.json && sig1.json.ok === true, JSON.stringify(sig1.json));
    const lvl1 = await reqJson('GET', '/api/avatar-level', undefined, uRate.cookie);
    check('§8 XP tras ratear: base + 10, ratings = 1', lvl1.status === 200 && lvl1.json && Number(lvl1.json.ratings) === 1 && Number(lvl1.json.xp) === Number(lvl0.json.xp) + 10, JSON.stringify(lvl1.json));
    const sig2 = await reqJson('POST', '/api/posts/' + idR + '/signal', { signal: 'rating_5' }, uRate.cookie);
    const lvl2 = await reqJson('GET', '/api/avatar-level', undefined, uRate.cookie);
    check('§8 re-ratear: 200 ok, XP NO sube de nuevo', sig2.status === 200 && lvl2.json && Number(lvl2.json.xp) === Number(lvl1.json.xp) && Number(lvl2.json.ratings) === 1, JSON.stringify(lvl2.json));
    // Scheduler: esperar hasta 100 s a que el tick procese A, B y C.
    let stA = null, stB = null, stC = null;
    for (let i = 0; i < 20; i++) {
      stA = db.prepare('SELECT status, approval FROM posts WHERE id = ?').get(idA);
      stB = db.prepare('SELECT status, error FROM posts WHERE id = ?').get(idB);
      stC = db.prepare('SELECT autopilot_notified FROM posts WHERE id = ?').get(idC);
      if (stA && stA.status === 'published' && stB && stB.status === 'failed' && stC && Number(stC.autopilot_notified) === 1) break;
      await sleep(5000);
    }
    check('§8 A (autopilot, vencido, sin OK): PUBLICADO solo', stA && stA.status === 'published', JSON.stringify(stA));
    check('§8 A queda approval=auto', stA && stA.approval === 'auto', JSON.stringify(stA));
    check('§8 B (manual, vencido, sin OK): FALLA «sin aprobación»', stB && stB.status === 'failed' && String(stB.error || '') === 'sin aprobación', JSON.stringify(stB));
    check('§8 C (+30 min): aviso pre-publicación disparado (autopilot_notified=1)', stC && Number(stC.autopilot_notified) === 1, JSON.stringify(stC));
    const chatAviso = db.prepare("SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND text LIKE '%30 minutos%'").get(uAuto.uid);
    check('§8 C: el aviso quedó en el chat (respaldo si el push no llega)', chatAviso && Number(chatAviso.c) >= 1, JSON.stringify(chatAviso));
  } finally { kill(); }
}

(async () => {
  try { await parteChat(); } catch (e) { check('§4x sin excepción', false, e.message); }
  try { await parteBoot(); } catch (e) { check('§8x boot sin excepción', false, e.message); }
  console.log(`\nlote-simplificar-app: ${pass} ok, ${fail} mal`);
  if (fails.length) console.log('fallos:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
