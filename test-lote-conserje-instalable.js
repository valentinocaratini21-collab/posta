'use strict';

// =====================================================================
// LOTE CONSERJE-INSTALABLE — la consola como web app instalable
// =====================================================================
// Censo: CENSO-CONSERJE-3 §5.2 (línea M36 1865 del censo; lote
// registrado al aprobar el dueño, 23/11 «Arregla el conserje»).
// La consola se guarda en la pantalla de inicio como SU app (no la
// del cliente): manifest propio con scope /conserje, la moneda como
// ícono (PNG generados de public/bambooty-placa.webp), las metas de
// iOS en conserje.html y el registro del /sw.js de la casa desde
// conserje.js — SIN cachear ningún asset de la consola: el SW solo
// cachea su lista de íconos y todo lo demás va por red, así que la
// frescura la sigue mandando el sello ?v= (8 → 9 en este lote).
//
//   A · Estática del head: manifest enlazado, las 5 metas de
//       instalable y el sello bumpeado.
//   B · El manifest parsea, declara lo del censo y sus íconos
//       existen en public/ con sus tamaños REALES (IHDR del PNG).
//   C · conserje.js compila y registra /sw.js.
//   D · Política del SW, evaluando el sw.js REAL: un fetch de
//       conserje.js / conserje.html / la API NO se responde desde
//       caché (respondWith no se invoca); un ícono de su lista SÍ
//       (control de que el arnés mide).
//   E · Boot real: /conserje sirve el head nuevo, el manifest y los
//       íconos salen por HTTP, conserje.js?v=9 sale immutable y
//       /conserje sale no-cache.
//
// Contra la base prístina v1273 (sin el lote): A, B y C caen; D y E
// confirman que la política y el servidor ya eran los correctos.
// Uso: node test-lote-conserje-instalable.js — sale 0 si todo pasa.
// =====================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');

const ROOT = process.env.TREE || (fs.existsSync(path.join(__dirname, 'public', 'conserje.html')) ? __dirname : path.join(__dirname, 'release'));
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const readBuf = (p) => { try { return fs.readFileSync(path.join(ROOT, p)); } catch (e) { return null; } };

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }

const html = read('public/conserje.html');
const js = read('public/conserje.js');
const sw = read('public/sw.js');

// ---------------------------------------------------------------------
seccion('A · estática del head de la consola');
t('A1 <link rel="manifest"> al manifest propio', html.includes('<link rel="manifest" href="/conserje.webmanifest">'));
t('A2 apple-mobile-web-app-capable', html.includes('<meta name="apple-mobile-web-app-capable" content="yes">'));
t('A3 apple-mobile-web-app-status-bar-style black-translucent', html.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'));
t('A4 apple-mobile-web-app-title «Conserje»', html.includes('<meta name="apple-mobile-web-app-title" content="Conserje">'));
t('A5 theme-color #0A1E33', html.includes('<meta name="theme-color" content="#0A1E33">'));
t('A6 mobile-web-app-capable (Android/Chrome)', html.includes('<meta name="mobile-web-app-capable" content="yes">'));
t('A7 apple-touch-icon = la moneda 180', html.includes('<link rel="apple-touch-icon" href="/icon-conserje-180.png">'));
t('A8 el manifest del cliente NO se enlaza desde la consola', !html.includes('rel="manifest" href="/manifest.json"'));
t('A9 sello de conserje.js bumpeado a ?v=9', html.includes('<script src="/conserje.js?v=9"></script>') && !html.includes('conserje.js?v=8'));

// ---------------------------------------------------------------------
seccion('B · el manifest y sus íconos');
let man = null;
try { man = JSON.parse(read('public/conserje.webmanifest')); } catch (e) { /* cae en B1 */ }
t('B1 conserje.webmanifest existe y parsea', !!man);
if (man) {
  t('B2 name/short_name', /Conserje/.test(man.name || '') && man.short_name === 'Conserje', JSON.stringify({ name: man.name, short_name: man.short_name }));
  t('B3 start_url y scope = /conserje', man.start_url === '/conserje' && man.scope === '/conserje');
  t('B4 display standalone', man.display === 'standalone');
  t('B5 fondo y tema = el marino #0A1E33', man.background_color === '#0A1E33' && man.theme_color === '#0A1E33');
  const icons = Array.isArray(man.icons) ? man.icons : [];
  t('B6 declara 192, 512 y maskable 512', icons.some((i) => i.sizes === '192x192') && icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') && icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const ic of icons) {
    const buf = readBuf('public' + ic.src);
    const esPng = !!buf && buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50;
    const w = esPng ? buf.readUInt32BE(16) : 0;
    const h = esPng ? buf.readUInt32BE(20) : 0;
    const [dw, dh] = String(ic.sizes).split('x').map(Number);
    t('B7 ' + ic.src + ' existe y mide ' + ic.sizes + ' de verdad', esPng && w === dw && h === dh, 'real: ' + w + 'x' + h);
  }
  const at = readBuf('public/icon-conserje-180.png');
  t('B8 el apple-touch-icon 180 existe y mide 180×180', !!at && at.readUInt32BE(16) === 180 && at.readUInt32BE(20) === 180);
}

// ---------------------------------------------------------------------
seccion('C · conserje.js registra el service worker');
let compila = true;
try { new vm.Script(js); } catch (e) { compila = false; }
t('C1 conserje.js compila (vm.Script)', compila && js.length > 10000);
t('C2 registra /sw.js', js.includes("navigator.serviceWorker.register('/sw.js')"));
t('C3 el registro está guardado por feature-detect', js.includes("'serviceWorker' in navigator"));

// ---------------------------------------------------------------------
seccion('D · política del SW: la consola nunca sale de caché');
t('D0 sw.js existe y su lista de íconos no nombra ningún asset de la consola', sw.length > 500 && !/conserje/.test(sw));
{
  const handlers = {};
  const sandbox = {
    self: { addEventListener: (ev, fn) => { handlers[ev] = fn; }, skipWaiting: () => {}, clients: { claim: () => {} }, location: { origin: 'http://x' }, registration: {} },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: () => Promise.resolve({ clone: () => ({}) }),
    URL, Promise, console,
  };
  sandbox.self.caches = sandbox.caches;
  vm.createContext(sandbox);
  let cargo = true;
  try { new vm.Script(sw).runInContext(sandbox); } catch (e) { cargo = false; }
  t('D1 el sw.js real carga en el arnés', cargo && typeof handlers.fetch === 'function');
  if (cargo) {
    const despachar = (url, mode) => {
      let respondio = false;
      const ev = { request: { method: 'GET', url, mode: mode || 'cors' }, respondWith: () => { respondio = true; }, waitUntil: () => {} };
      handlers.fetch(ev);
      return respondio;
    };
    t('D2 conserje.js?v=9 va por red (sin respondWith)', despachar('http://x/conserje.js?v=9') === false);
    t('D3 conserje.html va por red', despachar('http://x/conserje.html') === false);
    t('D4 la API del conserje va por red', despachar('http://x/api/admin/conserje/vista') === false);
    t('D5 el manifest va por red', despachar('http://x/conserje.webmanifest') === false);
    t('D6 CONTROL: un ícono de su lista SÍ se responde (el arnés mide)', despachar('http://x/icon-192.png') === true);
    t('D7 la navegación responde con red-primero (offline solo si no hay red)', despachar('http://x/conserje', 'navigate') === true);
  }
}

// ---------------------------------------------------------------------
seccion('E · boot real');
const PORT = 18771;
const BASE = 'http://127.0.0.1:' + PORT;
const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-instalable-'));
async function waitBoot(tries) {
  for (let i = 0; i < (tries || 60); i++) {
    try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'tok-instalable', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    t('E1 el servidor levanta', await waitBoot(), log.slice(-300));
    const rCons = await fetch(BASE + '/conserje');
    const htmlServido = await rCons.text();
    t('E2 /conserje 200 con el head instalable y el sello ?v=9',
      rCons.status === 200 && htmlServido.includes('rel="manifest" href="/conserje.webmanifest"') && htmlServido.includes('conserje.js?v=9'));
    t('E3 /conserje sale no-cache', (rCons.headers.get('cache-control') || '').includes('no-cache'));
    const rMan = await fetch(BASE + '/conserje.webmanifest');
    let manOk = false;
    try { const j = await rMan.json(); manOk = j && j.short_name === 'Conserje' && j.start_url === '/conserje'; } catch (e) {}
    t('E4 el manifest se sirve y parsea (200)', rMan.status === 200 && manOk, 'status ' + rMan.status);
    for (const p of ['/icon-conserje-180.png', '/icon-conserje-192.png', '/icon-conserje-512.png', '/icon-conserje-maskable-512.png']) {
      const r = await fetch(BASE + p);
      const b = Buffer.from(await r.arrayBuffer());
      t('E5 ' + p + ' se sirve (200, PNG)', r.status === 200 && b[0] === 0x89 && b[1] === 0x50, 'status ' + r.status);
    }
    const rJs = await fetch(BASE + '/conserje.js?v=9');
    t('E6 conserje.js?v=9 sale immutable (el sello manda la frescura)', (rJs.headers.get('cache-control') || '').includes('immutable'), rJs.headers.get('cache-control') || '');
    const jsServido = await rJs.text();
    t('E7 el conserje.js servido registra el SW', jsServido.includes("navigator.serviceWorker.register('/sw.js')"));
  } catch (e) {
    t('E· excepción en el boot', false, String(e && e.message || e));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})();
