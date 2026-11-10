// test-lote-pildora-pwa-v853.js — LOTE v853 PÍLDORA «TE FALTA 1 PASO»:
// SUPRIMIR LA FILA PWA EN NATIVO.
// Problema (verificado por bamboo en el chat principal): la píldora muestra
// «Instalá la app» porque en la app instalada (Capacitor/TestFlight) el paso
// PWA nunca se puede completar — el evento appinstalled no dispara en el
// shell nativo y la fila no tiene exención IS_NATIVE. El flag solo lo pone
// appinstalled (o el modo standalone), y en nativo no hay ni uno ni otro.
// Fix (SOLO la supresión de la fila; push y plan quedaron DESCARTADOS con
// evidencia y NO van en este lote): la condición de la fila PWA en
// setupChecklistHtml() suma !(IS_NATIVE), con el patrón de guarda del
// codebase (typeof IS_NATIVE !== 'undefined' && IS_NATIVE) — mismo patrón
// que el banner de prueba vencida (línea 18506: en nativo devuelve '').
// Efecto: en nativo la fila no se agrega a rows; el conteo del título no
// la cuenta; si era el único paso pendiente, setupChecklistHtml devuelve ''
// y la píldora desaparece entera (setupMainHTML / refreshSetupChecklist).
// En el navegador nada cambia: la fila sigue cuando es móvil, no instalada
// y no descartada. Los binds (bindSetupRows, pwaWire) ya son null-safe
// (if (pi) / if (ib)), así que la fila ausente no rompe nada.
// Valores: BUILD 20261105-v853 · ?v=582 en el index ES (app.js tocado) ·
// styles?v=20261225 heredado · CHUNK_V sin cambio ('20261105-v850': el fix
// está en app.js mismo, no en un chunk lazy) · M78: funciones auditadas
// (todo lo que setupChecklistHtml llama existe definido en el bundle).
// Parte A: estática. Parte B: setupChecklistHtml REAL en vm con stubs
// (nativo / navegador / IS_NATIVE indefinido / otro paso pendiente /
// descartada / instalada). Parte C: boot real.
// Uso: node test-lote-pildora-pwa-v853.js — sale 0 si todo pasa.
// Puerto: 34632 (34630 fue el boot de verificación v851; 34593-34595 los
// de v847/v851; ads-pantalla usa 18754 fijo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEnSrc = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const crypto = require('crypto');
const appMd5 = crypto.createHash('md5').update(appSrc).digest('hex');

function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: valores del lote y alcance —');
  check('A0 BUILD v853 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v853';"));
  check('A0b cero v851 en server.js', !srvSrc.includes('20261105-v851'));
  check('A1 index ES en ?v=582', idxSrc.includes('app.js?v=582') && !idxSrc.includes('app.js?v=581'));
  check('A1b styles?v=20261225 heredado en ES', idxSrc.includes('styles.css?v=20261225'));
  check('A1c index EN sin cambio (styles?v=20261225, sin app.js?v=)', idxEnSrc.includes('styles.css?v=20261225') && !idxEnSrc.includes('app.js?v='));
  check('A2 CHUNK_V sin cambio (20261105-v850: el fix está en app.js, no en un chunk)', appSrc.includes("const CHUNK_V = '20261105-v850';"));
  const fn = fnFrom(appSrc, 'function setupChecklistHtml(title, opts) {');
  check('A3 setupChecklistHtml existe', !!fn);
  check('A3b la condición PWA lleva la guarda IS_NATIVE (v853)',
    !!fn && fn.includes("!(typeof IS_NATIVE !== 'undefined' && IS_NATIVE)"));
  check('A3c el comentario v853 explica el porqué',
    !!fn && fn.includes('(v853)') && fn.includes('appinstalled no dispara'));
  check('A4 la fila PWA sigue intacta (id + texto, solo cambia la condición)',
    appSrc.includes('id="pwaInstallBtn"') && appSrc.includes('Instalá la app')
    && (appSrc.match(/Instalá la app/g) || []).length === 1);
  check('A5 IS_NATIVE sigue definida (const, línea 2331)', appSrc.includes('const IS_NATIVE = (() => {'));
  check('A5b pwaIsInstalled / pwaIsMobile / pwaDismissed siguen definidos',
    appSrc.includes('function pwaIsInstalled() {') && appSrc.includes('function pwaIsMobile() {')
    && appSrc.includes('function pwaDismissed() {'));
  const defs = (appSrc.match(/^function [A-Za-z0-9_$]+\s*\(/gm) || []).length;
  check('A6 1005 definiciones function (igual que la base v851: nada borrado ni agregado)', defs === 1005, `defs=${defs}`);
  check('A7 app.js modificado solo +3 líneas vs base (el comentario v853)', (() => {
    // El pin de líneas vive en el STATUS; acá: el archivo tiene 30550 líneas.
    return appSrc.split('\n').length === 30550;
  })(), `líneas=${appSrc.split('\n').length}`);
}

// ---------- Parte B: setupChecklistHtml REAL en vm ----------
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function runChecklist(opts) {
  const store = new Map(Object.entries(opts.ls || {}));
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  let celebrateArg = null;
  const sandbox = {
    console,
    navigator: { userAgent: opts.ua || UA_MOBILE, standalone: undefined },
    window: { matchMedia: () => ({ matches: false }) },
    localStorage: ls,
    PROFILE: opts.profile || { business_name: 'Test', ig_connected: true, first_week_live: true },
    ME: opts.me || { lang: 'es', plan_status: 'active' },
    pzIc: (n) => n,
    pzPushRowPending: () => false,
    pzPushRowDenied: () => false,
    setupChecklistCelebrate: (n) => { celebrateArg = n; },
  };
  if (opts.isNative !== undefined) sandbox.IS_NATIVE = opts.isNative;
  vm.createContext(sandbox);
  const code = [
    fnFrom(appSrc, 'function pwaIsStandalone() {'),
    fnFrom(appSrc, 'function pwaIsInstalled() {'),
    fnFrom(appSrc, 'function pwaIsMobile() {'),
    fnFrom(appSrc, 'function pwaDismissed() {'),
    fnFrom(appSrc, 'function setupChecklistHtml(title, opts) {'),
    'setupChecklistHtml(undefined);',
  ].join('\n');
  const html = vm.runInContext(code, sandbox);
  return { html: html || '', celebrateArg };
}

function parteB() {
  console.log('— B) vm: la fila PWA en nativo vs navegador —');
  // B1: nativo, móvil, nada más pendiente → tarjeta vacía (la píldora desaparece).
  const b1 = runChecklist({ isNative: true });
  check('B1 nativo: la fila PWA NO se renderiza', !b1.html.includes('pwaInstallBtn') && !b1.html.includes('Instalá la app'), b1.html.slice(0, 120));
  check('B1b nativo: sin pasos pendientes la tarjeta es vacía', b1.html === '', b1.html.slice(0, 120));
  check('B1c nativo: celebrate recibe 0 pasos', b1.celebrateArg === 0, `celebrate=${b1.celebrateArg}`);
  // B2: navegador, móvil → la fila SÍ está, con su título «Te falta 1 paso».
  const b2 = runChecklist({ isNative: false });
  check('B2 navegador: la fila PWA SÍ se renderiza', b2.html.includes('pwaInstallBtn') && b2.html.includes('Instalá la app'));
  check('B2b navegador: el título cuenta 1 paso', b2.html.includes('Te falta 1 paso'), b2.html.slice(0, 160));
  check('B2c navegador: celebrate recibe 1 paso', b2.celebrateArg === 1, `celebrate=${b2.celebrateArg}`);
  // B3: IS_NATIVE indefinido (por si el bundle viejo no la trae) → no explota, fila presente.
  let b3 = null, b3err = null;
  try { b3 = runChecklist({}); } catch (e) { b3err = e; }
  check('B3 IS_NATIVE indefinido: no explota y la fila está', !b3err && b3 && b3.html.includes('pwaInstallBtn'), b3err ? String(b3err) : '');
  // B4: nativo, escritorio → la fila ya no estaba (pwaIsMobile falso); sigue sin estar.
  const b4 = runChecklist({ isNative: true, ua: UA_DESKTOP });
  check('B4 nativo escritorio: sin fila PWA (como antes)', !b4.html.includes('pwaInstallBtn') && b4.html === '');
  // B5: nativo con OTRO paso pendiente (falta el nombre del negocio) → solo ese paso, conteo 1.
  const b5 = runChecklist({ isNative: true, profile: { business_name: '', ig_connected: true, first_week_live: true } });
  check('B5 nativo + otro paso: la fila del negocio SÍ está', b5.html.includes('setupBizRow'));
  check('B5b nativo + otro paso: la fila PWA NO está', !b5.html.includes('pwaInstallBtn'));
  check('B5c nativo + otro paso: el título cuenta 1 (no 2)', b5.html.includes('Te falta 1 paso') && !b5.html.includes('Te faltan 2 pasos'), b5.html.slice(0, 160));
  check('B5d nativo + otro paso: celebrate recibe 1', b5.celebrateArg === 1, `celebrate=${b5.celebrateArg}`);
  // B6: navegador con otro paso pendiente → los dos pasos, conteo 2.
  const b6 = runChecklist({ isNative: false, profile: { business_name: '', ig_connected: true, first_week_live: true } });
  check('B6 navegador + otro paso: las dos filas están', b6.html.includes('setupBizRow') && b6.html.includes('pwaInstallBtn'));
  check('B6b navegador + otro paso: el título cuenta 2', b6.html.includes('Te faltan 2 pasos'), b6.html.slice(0, 160));
  check('B6c navegador + otro paso: celebrate recibe 2', b6.celebrateArg === 2, `celebrate=${b6.celebrateArg}`);
  // B7/B8: comportamiento previo intacto en el navegador (descartada / instalada).
  const b7 = runChecklist({ isNative: false, ls: { 'pwa-dismissed': String(Date.now()) } });
  check('B7 navegador + descartada hace un rato: sin fila (como antes)', !b7.html.includes('pwaInstallBtn') && b7.html === '');
  const b8 = runChecklist({ isNative: false, ls: { 'pwa-installed': '1' } });
  check('B8 navegador + instalada: sin fila (como antes)', !b8.html.includes('pwaInstallBtn') && b8.html === '');
  // B9: M78 — todo lo que setupChecklistHtml llama existe definido en el bundle.
  const fn = fnFrom(appSrc, 'function setupChecklistHtml(title, opts) {');
  const stripped = fn.replace(/\/\/[^\n]*/g, '').replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\])*'/g, "''");
  const cands = [...new Set(stripped.match(/\b(pz[A-Za-z0-9_$]*|pwa[A-Za-z0-9_$]*|setup[A-Za-z0-9_$]*)\s*\(/g) || [])]
    .map((s) => s.replace(/\s*\($/, ''))
    .filter((n) => n !== 'setupChecklistHtml');
  const isDef = (n) => new RegExp('function ' + n + '\\s*\\(').test(appSrc)
    || new RegExp('const ' + n + '\\s*=').test(appSrc);
  let audN = 0, audOk = 0;
  for (const c of cands) {
    audN++;
    if (isDef(c)) audOk++;
    else check('B9 M78: setupChecklistHtml llama a ' + c + ' pero NO está definida', false, c);
  }
  // La fila PWA se ata en bindSetupRows a pwaDoInstall: también tiene que existir.
  audN++;
  if (/function pwaDoInstall\s*\(/.test(appSrc)) audOk++;
  else check('B9b M78: el handler de la fila (pwaDoInstall) existe', false);
  check(`B9c M78: funciones auditadas: ${audOk}/${audN} (todo lo que el checklist llama existe)`, audN > 0 && audOk === audN, `${audOk}/${audN} — llamadas: ${cands.join(', ')}`);
}

// ---------- Parte C: boot real ----------
const PORT = 34632;
const TEST_KEY = 'boot-test-key-pildora-pwa';
const ADMIN_TOKEN = 'boot-admin-token-pildora-pwa';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pildora-pwa-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';

async function bootServer() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
    await sleep(1000);
  }
  return { child, up, out: () => out };
}
async function killServer(child) {
  try { child.kill('SIGTERM'); } catch (e) {}
  await sleep(800);
  try { if (child.exitCode === null) child.kill('SIGKILL'); } catch (e) {}
  await sleep(300);
}

async function parteC() {
  console.log('— C) boot real —');
  let b = null;
  try {
    b = await bootServer();
    check('C0 el servidor levanta con el lote', b.up, b.out().slice(-300));
    if (!b.up) return;
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('C1 /api/version trae el BUILD v853', ver && ver.build === '20261105-v853', JSON.stringify(ver));
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    check('C2 el index servido trae app.js?v=582', idx.includes('app.js?v=582'));
    check('C2b el index servido trae styles?v=20261225', idx.includes('styles.css?v=20261225'));
    const app = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=582`)).text();
    check('C3 el app.js servido lleva la guarda v853', app.includes("!(typeof IS_NATIVE !== 'undefined' && IS_NATIVE)"));
    check('C3b el app.js servido sigue con la fila PWA (id + texto)', app.includes('id="pwaInstallBtn"') && app.includes('Instalá la app'));
    check('C4 cero errores en el log del boot', !/Error|error|Unhandled/i.test(b.out().replace(/api\/version/g, '')), b.out().slice(-300));
  } catch (e) {
    console.log('error de la parte C:', e.message);
    fail++;
  } finally {
    if (b) await killServer(b.child);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  parteB();
  await parteC();
  console.log(`\ntest-lote-pildora-pwa-v853: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
