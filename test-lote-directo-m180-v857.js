// test-lote-directo-m180-v857.js — LOTE FIX «DIRECTO» (M180).
// Bug CONFIRMADO (lado del cliente, no del cerebro): en public/app.js el
// router de comandos cortos incluía «directos?» en el regex que abre la
// bandeja de DMs. Decir «hacelo más directo» (una edición) abría los DMs
// en vez de editar. El cerebro (server.js) no tiene ruteo de «directo».
// Fix (parche M180, 828 bytes, md5 en disco 87a5a28eed424360057e595a5dd9fe42):
// sacar «directos?» de ese regex + comentario explicativo. Los DMs siguen
// entrando por «mensajes» / «dm» / «bandeja» (y «privados»).
// Parte A: estática (pins + marcadores). Parte B: cliente en vm con stubs
// (el regex DM extraído del app.js servido + chatIsShortCommand extraído +
// chatEditCommand extraído: la batería de frases y el control con el regex
// viejo). Parte C: boot real de server.js en DATA_DIR temporal + HTTP
// (/api/version v857 + index con app.js?v=585).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-directo-m180-v857.js — sale 0 si todo pasa.
// Re-pin al re-basar sobre v856 (re-estampador v857, precedente v854/v856):
// A0g pasaba de 30547 líneas (30546 base v851 + 1) a 30550 (30549 vivo v856 + 1);
// el vivo trae 3 líneas más por la guarda IS_NATIVE de v853. El fix no cambia esto.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const net = require('net');
const { spawn } = require('child_process');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEnSrc = fs.existsSync(path.join(DIR, 'public/en/index.html'))
  ? fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8') : '';

// ---------- helpers de extracción (mismo patrón que test-lote-chat-clicks) ----------
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
  console.log('— A) estática: pins y marcadores del lote —');
  check('A0 BUILD v857 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v857';"));
  check('A0b server.js YA NO trae v851', !srvSrc.includes('20261105-v851'));
  check('A0c app.js?v=585 en el index ES', idxSrc.includes('/app.js?v=585'));
  check('A0d app.js?v=581 YA NO está en el index ES', !idxSrc.includes('/app.js?v=581'));
  check('A0e styles?v=20261225 heredado en el index ES', idxSrc.includes('styles.css?v=20261225'));
  check('A0f CHUNK_V sin cambio (v850, el fix está en app.js, no en un chunk)', appSrc.includes("const CHUNK_V = '20261105-v850';"));
  check('A0g app.js tiene 30550 líneas (30549 vivo v856 + 1 del comentario M180)', appSrc.split('\n').length - 1 === 30550 || appSrc.split('\n').length === 30551, `líneas=${appSrc.split('\n').length}`);
  // §1 el fix M180
  check('A1 el comentario M180 está en app.js', appSrc.includes('(M180 · fix «directo»)'));
  check('A1b el regex DM nuevo está (sin directos?)', appSrc.includes('/\\b(mensajes?|dms?|privados?|bandeja)\\b/i'));
  check('A1c el regex DM viejo YA NO está', !appSrc.includes('mensajes?|dms?|directos?|privados?|bandeja'));
  check('A1d «directos?» tiene 0 ocurrencias en app.js', (appSrc.match(/directos\?/g) || []).length === 0);
  check('A1e el regex DM vive en la rama que llama a showDMsInChat()', (() => {
    const i = appSrc.indexOf('showDMsInChat();');
    return i > 0 && appSrc.slice(i - 400, i).includes('privados?|bandeja');
  })());
  // §2 el router sigue intacto en el resto
  check('A2 la rama «reseñas» sigue (showReviewsInChat)', appSrc.includes('showReviewsInChat();') && appSrc.includes("reseñas?|resenas?|opiniones|reviews?"));
  check('A2b la rama «comentarios» sigue (showCommentsInChat)', appSrc.includes('showCommentsInChat();'));
  check('A2c la rama «¿qué sale esta semana?» sigue (showWeekInChat)', appSrc.includes('showWeekInChat();'));
  check('A2d la rama de edición sigue DESPUÉS de la rama DM (el DM ya no la intercepta)', (() => {
    const dm = appSrc.indexOf('showDMsInChat();');
    const ed = appSrc.indexOf('if (CHAT_IDEA && chatEditCommand(sendText))');
    return dm > 0 && ed > 0 && dm < ed;
  })());
  check('A2e chatIsShortCommand, chatEditCommand y showDMsInChat existen', appSrc.includes('function chatIsShortCommand(t)') && appSrc.includes('function chatEditCommand(text)') && appSrc.includes('function showDMsInChat'));
  // §3 M78: el set de definiciones no cambió (el fix no toca ninguna función)
  check('A3 definiciones function idénticas a v851 (1336 con duplicados, mismo md5 ordenado)', (() => {
    const names = (appSrc.match(/function [A-Za-z0-9_$]+\(/g) || []).sort();
    const crypto = require('crypto');
    const md5 = crypto.createHash('md5').update(names.join('\n') + '\n').digest('hex'); // +'\n' = el stream de grep|sort|md5sum
    return names.length === 1336 && md5 === 'd8d35e46b643bdaa0787d5def86698b6';
  })());
}

// ---------- Parte B: vm (el regex y las funciones extraídos del app.js servido) ----------
function parteB() {
  console.log('— B) vm: la decisión DM con el código servido —');
  const csSrc = fnFrom(appSrc, 'function chatIsShortCommand(t) {');
  check('B0 chatIsShortCommand extraído del app.js servido', !!csSrc);
  const ceSrc = fnFrom(appSrc, 'function chatEditCommand(text) {');
  check('B0b chatEditCommand extraído del app.js servido', !!ceSrc);
  if (!csSrc || !ceSrc) { fail++; return; }
  // El regex DM: la línea del if que precede al primer showDMsInChat().
  const dmIdx = appSrc.indexOf('showDMsInChat();');
  const dmWin = appSrc.slice(dmIdx - 400, dmIdx);
  const dmMatch = dmWin.match(/\/\\b\(mensajes\?[^/]*\)\\b\/i/);
  check('B0c el regex DM extraído del app.js servido', !!dmMatch, dmMatch ? dmMatch[0] : 'no encontrado');
  if (!dmMatch) { fail++; return; }
  const ctx = {
    CHAT_IDEA: { id: 1, titulo: 'x' },
    CHAT_PHOTOS: [{}, {}],
    CHAT_PHOTO_IDX: 0,
    CUSTOM_PAL: null, CHAT_CAPTION: null, CHAT_CAPTIONS: [], CHAT_CAP_SEL: 0,
    orderPalette: (x) => x,
    chatSay: () => {}, renderChatPreviews: () => {}, renderChatStoryboard: () => {},
    chatRenderProposal: () => {}, refreshChatCaption: () => {},
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(csSrc, ctx);
  vm.runInContext(ceSrc, ctx);
  vm.runInContext('var DM_RE = ' + dmMatch[0] + ';', ctx);
  const isDM = (t) => vm.runInContext(`chatIsShortCommand(${JSON.stringify(t)}) && DM_RE.test(${JSON.stringify(t)})`, ctx);
  const isEdit = (t) => !!vm.runInContext(`chatEditCommand(${JSON.stringify(t)})`, ctx);

  // El bug: estas frases ABRÍAN los DMs con el regex viejo. Con el fix, NO.
  for (const t of ['hacelo más directo', 'más directo', 'directo', 'hacelo directo', 'directos', 'sé más directo', 'más directa', 'directo al grano']) {
    check(`B1 «${t}» NO abre los DMs`, isDM(t) === false);
  }
  // Control: el regex VIEJO sí las abría (la prueba caza el bug pre-fix).
  const OLD_RE = /\b(mensajes?|dms?|directos?|privados?|bandeja)\b/i;
  check('B1c control: el regex viejo SÍ abría «hacelo más directo»', OLD_RE.test('hacelo más directo') === true);
  check('B1d control: «hacelo más directo» ES comando corto (3 palabras)', vm.runInContext('chatIsShortCommand("hacelo más directo")', ctx) === true);
  // Los DMs siguen entrando por sus palabras.
  for (const t of ['mensajes', 'mis mensajes', 'dm', 'dms', 'bandeja', 'privados', 'mensaje', 'los dms pendientes', 'revisá mis mensajes', 'abrí la bandeja', 'mensaje privado']) {
    check(`B2 «${t}» SÍ abre los DMs`, isDM(t) === true);
  }
  // El texto sigue su camino: «hacelo más directo» no lo traga chatEditCommand
  // (no es color/título/foto/estilo) → cae al cerebro, no a los DMs ni al vacío.
  check('B3 «hacelo más directo» no lo traga chatEditCommand (va al cerebro)', isEdit('hacelo más directo') === false);
  // El router de edición sigue intacto en el resto.
  check('B3b «ponelo en rojo» sigue siendo edición (color)', isEdit('ponelo en rojo') === true);
  check('B3c «otra foto» sigue siendo edición (foto)', isEdit('otra foto') === true);
  check('B3d «otro estilo» sigue siendo edición (estilo)', isEdit('otro estilo') === true);
}

// ---------- Parte C: boot real ----------
const PORTS = [34631, 34632, 34633];
const TEST_KEY = 'boot-test-key-directo-m180';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'directo-m180-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(true));
    setTimeout(() => { try { s.destroy(); } catch (e) {} resolve(true); }, 2000);
  });
}

async function parteC() {
  console.log('— C) boot real: /api/version v857 + index con ?v=585 —');
  let PORT = null;
  for (const p of PORTS) {
    if (await portFree(p)) { PORT = p; break; }
  }
  check('C0 hay un puerto libre para el boot', PORT !== null, `probados: ${PORTS.join(',')}`);
  if (PORT === null) { fail++; return; }
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    check('C1 el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await fetch(`http://127.0.0.1:${PORT}/api/version`).then((r) => r.json()).catch(() => null);
    check('C1b /api/version trae el BUILD v857', ver && ver.build === '20261105-v857', JSON.stringify(ver));
    const idx = await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.text()).catch(() => '');
    check('C1c el index servido trae app.js?v=585', idx.includes('/app.js?v=585'));
    check('C1d el index servido trae styles?v=20261225', idx.includes('styles.css?v=20261225'));
    check('C1e la DB del boot existe en el DATA_DIR temporal', fs.existsSync(path.join(tmpDir, 'posta.db')));
  } catch (e) {
    console.log('error de la parte C:', e.message);
    fail++;
  } finally {
    kill();
    await sleep(800);
    const freeAgain = await portFree(PORT);
    check('C1f el puerto quedó libre tras matar el boot por PID', freeAgain);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  parteB();
  await parteC();
  console.log(`\ntest-lote-directo-m180-v857: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
