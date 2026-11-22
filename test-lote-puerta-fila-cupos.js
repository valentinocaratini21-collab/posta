'use strict';
// test-lote-puerta-fila-cupos.js — LOTE PUERTA-FILA-CUPOS (decisión del
// dueño 2026-11-22 15:36, asentada por el tablero): la lista de espera
// se presenta como lo que es — la FILA DE CUPOS de la prueba del
// 1° de febrero. El Modelo A no cambia (la puerta NO abre pruebas);
// cambia el sentido dicho de la lista: sumarse es reservar el lugar en
// la fila, por orden de llegada, con los cupos asignados en tandas
// diarias servibles. Sin maquinaria nueva y sin promesas de más: ni
// fecha de cupo individual ni número de posición.
//
// Uso: node test-lote-puerta-fila-cupos.js [work|base]
//   work → el árbol del lote: todos los casos en verde.
//   base → el árbol prístino v1222: control (ninguna superficie dice
//          la fila todavía; el resto del modo lista intacto).
//
// Casos (work):
//  (1) /api/puerta/modo ES y EN: el mensaje de confirmación suma el
//      lugar reservado en la fila, en el idioma de cada puerta.
//  (2) guest/start ES y EN: el alta en la lista responde la
//      confirmación con la frase de la fila y guarda la fila en
//      lista_espera (la maquinaria de siempre, sin cambios).
//  (3) Landing ES servida: la línea está en el index estático (1
//      formulario) Y en las plantillas de app.js (3 formularios — la
//      landing ES con JS la renderiza el bundle). Landing EN servida:
//      la línea está en inglés de verdad en los 3 formularios.
//  (4) /prueba y /en/prueba servidas: el elemento de la fila existe y
//      el cableado de modo lista lo muestra con el texto exacto.
//  (5) Chromium 390px: en /prueba la línea se VE (modo lista la
//      destapa con el texto ES); en /en/prueba se ve en EN; en la
//      landing ES se ve la línea; en la EN también.
//  (6) Guardas: ninguna superficie promete fecha de cupo individual
//      ni número de posición (sin «#N», sin «tu día», sin «your day»,
//      sin «you are number»).
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const WHICH = process.argv[2] === 'base' ? 'base' : 'work';
const ROOT = path.join(__dirname, WHICH);
const CONTROL = WHICH === 'base';

const ES_FILA = 'Sumarte es reservar tu lugar en la fila: las pruebas abren el 1° de febrero y los cupos se asignan por orden de llegada.';
const EN_FILA = 'Joining reserves your place in line: trials open on February 1, and spots are assigned in order of arrival.';
const ES_CONF = 'Tu lugar en la fila quedó reservado: los cupos se asignan por orden de llegada.';
const EN_CONF = 'Your place in line is reserved: spots are assigned in order of arrival.';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; failures.push(label); console.log('  ✗', label, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 300) : ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function api(port, method, p, body) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j, text };
}

async function waitUp(port, tries = 150) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); if (r.ok) return true; } catch (e) {}
    await sleep(1000);
  }
  return false;
}

let child = null;
async function boot(port) {
  if (!(await portFree(port))) throw new Error(`puerto ${port} ocupado antes del boot`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `pfc-${WHICH}-`));
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: path.join(dataDir, 'media'), ADMIN_TOKEN: 'boot-test-token-pfc', NODE_PATH: path.join(ROOT, 'node_modules'), OPENAI_API_KEY: '', SESSION_SECRET: 'suite-secret-puerta-fila-cupos', DEMO_AI_DAILY_CAP_USD: '0' };
  delete env.PUERTA_MODO; // modo lista activo por defecto, como en producción
  child = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write('[srv] ' + d));
  const up = await waitUp(port);
  if (!up) throw new Error('el servidor no levantó');
  return dataDir;
}

function killChild() {
  if (child && child.pid) { try { process.kill(child.pid, 'SIGTERM'); } catch (e) {} }
  child = null;
}

function loadPlaywright() {
  // Patrón verificado en las suites hermanas: playwright-core vive en
  // posty-stores/tools y el Chromium en la caché ms-playwright.
  const candidates = [
    '/tmp/pw-boot/node_modules/playwright-core',
    path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core'),
  ];
  for (const c of candidates) { try { return require(c); } catch (e) {} }
  return null;
}

function chromiumExe() {
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  const dirs = fs.readdirSync(cache).filter((d) => d.startsWith('chromium') && !d.includes('headless'));
  for (const d of dirs) {
    const exe = path.join(cache, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

(async () => {
  const P = WHICH === 'base' ? 34711 : 34712;
  console.log(`\n== LOTE PUERTA-FILA-CUPOS · árbol ${WHICH} · puerto ${P} ==`);
  const dataDir = await boot(P);
  try {
    // (1) Confirmación por /api/puerta/modo, ambos idiomas.
    const modoEs = await api(P, 'GET', '/api/puerta/modo?lang=es');
    const modoEn = await api(P, 'GET', '/api/puerta/modo?lang=en');
    ok(modoEs.j && modoEs.j.modo === 'lista', '(1) la puerta está en modo lista (ES)', modoEs.j);
    if (!CONTROL) {
      ok((modoEs.j.mensaje || '').includes(ES_CONF), '(1) ES: la confirmación dice el lugar reservado en la fila', modoEs.j && modoEs.j.mensaje);
      ok((modoEn.j.mensaje || '').includes(EN_CONF), '(1) EN: the confirmation states the reserved place in line', modoEn.j && modoEn.j.mensaje);
    } else {
      ok(!(modoEs.j.mensaje || '').includes('fila'), '(1) BASE: la confirmación todavía no habla de la fila (ES)', modoEs.j && modoEs.j.mensaje);
      ok(!(modoEn.j.mensaje || '').includes('in line'), '(1) BASE: the confirmation does not mention the line yet (EN)', modoEn.j && modoEn.j.mensaje);
    }

    // (2) Alta real en la lista por guest/start, ambos idiomas.
    const a = await api(P, 'POST', '/api/guest/start', { ig: '@FilaBizES', domain: 'filabizes.com', email: 'dueno@filabizes.com', lang: 'es' });
    const b = await api(P, 'POST', '/api/guest/start', { ig: '@QueueBizEN', domain: 'queuebizen.com', email: 'owner@queuebizen.com', lang: 'en' });
    ok(a.j && a.j.modo_lista === true, '(2) ES: guest/start anota en la lista', a.j);
    ok(b.j && b.j.modo_lista === true, '(2) EN: guest/start lands on the waitlist', b.j);
    if (!CONTROL) {
      ok((a.j.message || '').includes(ES_CONF), '(2) ES: el alta confirma el lugar en la fila', a.j && a.j.message);
      ok((b.j.message || '').includes(EN_CONF), '(2) EN: joining confirms the place in line', b.j && b.j.message);
    }
    const db = new DatabaseSync(path.join(dataDir, 'posta.db'), { readOnly: true });
    const rowEs = db.prepare("SELECT * FROM lista_espera WHERE email = 'dueno@filabizes.com'").get();
    const rowEn = db.prepare("SELECT * FROM lista_espera WHERE email = 'owner@queuebizen.com'").get();
    ok(!!rowEs && rowEs.lang === 'es', '(2) ES: la fila quedó guardada en lista_espera', rowEs);
    ok(!!rowEn && rowEn.lang === 'en', '(2) EN: the row is saved on lista_espera with lang en', rowEn);
    db.close();

    // (3) Landings servidas. OJO (verificado en Chromium): la landing
    // ES con JS la renderiza app.js desde sus plantillas — el index
    // estático es la pintura sin JS. La línea tiene que estar en las
    // dos capas ES y en la estática EN (que no carga app.js).
    const landEs = await api(P, 'GET', '/');
    const landEn = await api(P, 'GET', '/en/index.html');
    const bundle = await api(P, 'GET', '/app.js');
    if (!CONTROL) {
      ok(landEs.text.includes(ES_FILA) && (landEs.text.match(/lp-fila/g) || []).length === 1, '(3) ES: el index estático trae la línea en su formulario de captura');
      ok((bundle.text.match(/lp-fila/g) || []).length === 3 && bundle.text.includes(ES_FILA), '(3) ES: app.js (la landing que el visitante con JS usa) trae la línea en sus 3 formularios');
      ok((landEn.text.match(/lp-fila/g) || []).length === 3 && landEn.text.includes(EN_FILA), '(3) EN: la landing trae la línea en inglés en sus 3 formularios de captura');
      ok(!landEn.text.includes(ES_FILA), '(3) EN: ni una palabra de la línea en español en la puerta inglesa (paridad real)');
    } else {
      ok(!landEs.text.includes('lp-fila') && !landEn.text.includes('lp-fila') && !bundle.text.includes('lp-fila'), '(3) BASE: ninguna capa de la landing trae la línea todavía');
    }

    // (4) /prueba servidas: elemento + cableado.
    const prEs = await api(P, 'GET', '/prueba');
    const prEn = await api(P, 'GET', '/en/prueba');
    if (!CONTROL) {
      ok(prEs.text.includes('id="fFilaHint"') && prEs.text.includes(ES_FILA), '(4) ES: /prueba trae el elemento de la fila y su texto en el cableado de modo lista');
      ok(prEn.text.includes('id="fFilaHint"') && prEn.text.includes(EN_FILA), '(4) EN: /en/prueba trae el elemento y el texto en inglés de verdad');
      ok(!prEn.text.includes(ES_FILA), '(4) EN: /en/prueba no sirve la línea en español (paridad real)');
    } else {
      ok(!prEs.text.includes('fFilaHint') && !prEn.text.includes('fFilaHint'), '(4) BASE: /prueba todavía no trae el elemento de la fila');
    }

    // (6) Guardas sobre las superficies del lote (mensajes, líneas de
    // la fila y páginas servidas): ni posición numérica ni fecha de
    // cupo individual. La fecha del 1° de febrero es la apertura para
    // todos — eso sí se dice; lo prohibido es prometerle a UN negocio
    // SU día o SU número.
    const superficies = [modoEs.j.mensaje, modoEn.j.mensaje, a.j.message, b.j.message, landEs.text, landEn.text, prEs.text, prEn.text].join('\n');
    ok(!/sos el #|tu posición|your position|you are (number|#)|#\d+\s*(en la fila|in line)|posición\s*\d/i.test(superficies), '(6) guarda: ninguna superficie muestra número de posición');
    const dichos = [modoEs.j.mensaje, modoEn.j.mensaje, a.j.message, b.j.message, ES_FILA, EN_FILA].join('\n');
    ok(!/(tu|su) (cupo|prueba) (es|empieza|arranca) el|your (spot|trial) (is|starts) on|tu día de prueba|your trial day/i.test(dichos), '(6) guarda: ninguna superficie promete una fecha de cupo individual');

    // (5) Chromium 390px: la línea se VE donde tiene que verse.
    const pw = loadPlaywright();
    ok(!!pw, '(5) Chromium disponible para la QA visual');
    if (pw) {
      const browser = await pw.chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const base = `http://127.0.0.1:${P}`;
      await page.goto(base + '/prueba', { waitUntil: 'load' });
      await page.waitForTimeout(900);
      const filaEs = await page.evaluate(() => { const el = document.getElementById('fFilaHint'); return el ? { hidden: el.hidden, text: el.textContent } : null; });
      await page.goto(base + '/en/prueba', { waitUntil: 'load' });
      await page.waitForTimeout(900);
      const filaEn = await page.evaluate(() => { const el = document.getElementById('fFilaHint'); return el ? { hidden: el.hidden, text: el.textContent } : null; });
      await page.goto(base + '/', { waitUntil: 'load' });
      await page.waitForTimeout(900);
      const landFilaEs = await page.evaluate(() => { const els = [...document.querySelectorAll('.lp-fila')]; const el = els[0]; return el ? { count: els.length, visible: !!(el.offsetWidth || el.offsetHeight), text: el.textContent } : null; });
      await page.goto(base + '/en/index.html', { waitUntil: 'load' });
      const landFilaEn = await page.evaluate(() => { const el = document.querySelector('.lp-fila'); return el ? { visible: !!(el.offsetWidth || el.offsetHeight), text: el.textContent } : null; });
      await browser.close();
      if (!CONTROL) {
        ok(filaEs && filaEs.hidden === false && filaEs.text === ES_FILA, '(5) ES: en /prueba la línea de la fila se ve, con su texto exacto', filaEs);
        ok(filaEn && filaEn.hidden === false && filaEn.text === EN_FILA, '(5) EN: on /en/prueba the line is visible, in English', filaEn);
        ok(landFilaEs && landFilaEs.count === 3 && landFilaEs.visible && landFilaEs.text === ES_FILA, '(5) ES: en la landing renderizada las 3 líneas están y la del hero se ve', landFilaEs);
        ok(landFilaEn && landFilaEn.visible && landFilaEn.text === EN_FILA, '(5) EN: on the landing the line is visible, in English', landFilaEn);
      } else {
        ok(filaEs === null && filaEn === null, '(5) BASE: /prueba no tiene elemento de la fila que mostrar', { filaEs, filaEn });
        ok(landFilaEs === null && landFilaEn === null, '(5) BASE: las landings no muestran línea de la fila', { landFilaEs, landFilaEn });
      }
    }
  } finally {
    killChild();
    await sleep(800);
    const free = await portFree(P);
    console.log(free ? `  ✓ puerto ${P} libre tras la muerte por PID exacto` : `  ✗ puerto ${P} SIGUE OCUPADO`);
    if (!free) { fail++; failures.push('puerto ocupado al cerrar'); }
  }
  console.log(`\n== RESULTADO ${WHICH}: ${pass} ok · ${fail} MAL ==`);
  if (failures.length) { console.log('Fallos:', failures.join(' | ')); process.exit(1); }
})().catch((e) => { killChild(); console.error('ERROR DE SUITE:', e.message); process.exit(2); });
