// test-lote-l11-candado.js — LOTE L11 CANDADO-INVITADO (re-base del preparador
// sobre el vivo v1063 → BUILD v1064; la suite original del builder pineaba su
// base v980 y su provisorio v994. Adaptaciones de la re-base, solo de pins y
// layout, sin tocar la lógica de los chequeos: BASE 'base-v980' → 'base'
// (árbol vivo v1063 del scratch del preparador) · B6 BUILD v994/v980 →
// v1064/v1063 · B8 contentLangOf 4 → 14 líneas y trial_sin_retencion ×0 → ×1
// (ambos son el censo real del vivo: contentLangOf creció con v922 y
// trial_sin_retencion entró con el correctivo-1 v983, ausente en la base
// v980 del builder) · §C/§D esperan los BUILD v1064/v1063 al bootear.
// PROBLEMA (diagnóstico Veja Q3/Q5): en /api/guest/start el chequeo «ya
// tiene posteos / ya entró» y la importación de la semana NO son atómicos:
// dos llamadas concurrentes para el mismo @ pueden pasar ambas el chequeo
// antes de que ninguna importe → la semana se importa dos veces (el 4º
// posteo fantasma). FIX: mutex por negocio (guest-start-lock.js) que
// serializa la sección crítica del handler (chequeos + creación/reuso +
// import + entrega); la segunda llamada espera, corre sus chequeos contra
// el estado final y sale por las guardas de siempre, sin re-importar. La
// espera tiene tope (30 s) y la liberación va en un finally: un fallo a
// mitad de camino tampoco deja el candado tomado.
// Secciones: A unidad del mutex (con el interleave exacto del diagnóstico
// como control sin candado) · B anclas estáticas · C e2e boot release
// (a/b/c/d del encargo, modo NO-test: el camino de producción) ·
// D control e2e sobre la base (mismo par concurrente; la base no tiene el
// candado — anclas ×0 — y su handler síncrono ya serializa en un proceso:
// se documenta el resultado real).
// Uso: node test-lote-l11-candado.js  (desde el scratch)
// Sale 0 si todo pasa, 1 si algo falla.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base');
const REL = path.join(ROOT, 'release');
let pass = 0, fail = 0;
const failed = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; failed.push(name); console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function read(p) { return fs.readFileSync(p, 'utf-8'); }
function countOcc(s, sub) { return s.split(sub).length - 1; }
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- A. Unidad: el mutex y el interleave del diagnóstico ----------
console.log('A. Unidad (guest-start-lock)');
const lock = require(path.join(REL, 'guest-start-lock.js'));
// Forma exacta del agujero: chequear «0 posteos» → yield → importar si 0.
async function corridaSinCandado(state) {
  if (state.posts === 0) { await sleep(30); state.imports++; state.posts = 3; }
}
async function corridaConCandado(state, key) {
  const unlock = await lock.acquire(key, 5000);
  try {
    if (state.posts === 0) { await sleep(30); state.imports++; state.posts = 3; }
  } finally { unlock(); }
}
(async () => {
  // A1 — control SIN candado: las dos corridas concurrentes pasan el
  // chequeo y las dos «importan» (el bug, reproducido a nivel mecanismo).
  const s0 = { posts: 0, imports: 0 };
  await Promise.all([corridaSinCandado(s0), corridaSinCandado(s0)]);
  t('A1 control sin candado: el interleave importa 2 veces', s0.imports === 2, 'imports=' + s0.imports);
  // A2 — CON candado: una sola importación; la segunda ve el estado final.
  const s1 = { posts: 0, imports: 0 };
  await Promise.all([corridaConCandado(s1, 'ig:a2'), corridaConCandado(s1, 'ig:a2')]);
  t('A2 con candado: importa 1 sola vez, posteos=3', s1.imports === 1 && s1.posts === 3, JSON.stringify(s1));
  // A3 — claves distintas NO se frenan entre sí (solapan).
  let inside = 0, maxInside = 0;
  async function seccion(key) {
    const unlock = await lock.acquire(key, 5000);
    try { inside++; maxInside = Math.max(maxInside, inside); await sleep(40); inside--; } finally { unlock(); }
  }
  await Promise.all([seccion('ig:a3-uno'), seccion('ig:a3-dos')]);
  t('A3 claves distintas solapan (max=2)', maxInside === 2, 'max=' + maxInside);
  // A4 — una sección que EXPLOTA libera igual (finally): la siguiente entra.
  const unlockA4 = await lock.acquire('ig:a4', 5000);
  let lanzo = false;
  try { throw new Error('fallo a mitad'); } catch (e) { lanzo = true; } finally { unlockA4(); }
  const t0 = Date.now();
  const unlockA4b = await lock.acquire('ig:a4', 5000);
  unlockA4b();
  t('A4 tras un fallo el candado queda libre', lanzo && (Date.now() - t0) < 1000, 'ms=' + (Date.now() - t0));
  // A5 — TOPE de espera: un candado nunca liberado no cuelga al que espera.
  await lock.acquire('ig:a5', 5000); // queda tomado a propósito
  const t1 = Date.now();
  const unlockA5 = await lock.acquire('ig:a5', 150);
  const espero = Date.now() - t1;
  unlockA5();
  t('A5 espera con tope: sigue a los ~150ms, no queda colgado', espero >= 100 && espero < 3000, 'ms=' + espero);
  // A6 — el Map no crece sin límite: la clave liberada se limpia.
  const unlockA6 = await lock.acquire('ig:a6', 5000);
  unlockA6();
  await sleep(20);
  t('A6 la clave liberada sale del Map', !lock._tails.has('ig:a6'));

  // ---------- B. Anclas estáticas ----------
  console.log('B. Anclas (base vs release)');
  const srvRel = read(path.join(REL, 'server.js'));
  const srvBase = read(path.join(BASE, 'server.js'));
  t('B1 release: guest-start-lock.js existe; base: no', fs.existsSync(path.join(REL, 'guest-start-lock.js')) && !fs.existsSync(path.join(BASE, 'guest-start-lock.js')));
  t('B2 acquire ×1 en release, ×0 en base', countOcc(srvRel, 'guestStartLock.acquire') === 1 && countOcc(srvBase, 'guestStartLock.acquire') === 0);
  t('B3 el acquire vive DENTRO de guest/start (entre la ruta y el import)',
    srvRel.indexOf("app.post('/api/guest/start'") < srvRel.indexOf('guestStartLock.acquire') &&
    srvRel.indexOf('guestStartLock.acquire') < srvRel.indexOf('importTrialWeek(g.userId'));
  t('B4 el candado NO cayó en chat-onboarding (su zona no tiene el acquire)',
    srvRel.indexOf('guestStartLock.acquire') < srvRel.indexOf("app.post('/api/guest/set-ig'"));
  t('B5 liberación en finally ×1', countOcc(srvRel, 'if (unlockGuestStart)') === 1 && /finally \{\s*\/\/ \(LOTE L11\)/.test(srvRel));
  t('B6 BUILD release v1064 / base v1063', srvRel.includes("const BUILD_ID = '20261105-v1064';") && srvBase.includes("const BUILD_ID = '20261105-v1063';"));
  t('B7 handler async + unlock declarado', srvRel.includes("app.post('/api/guest/start', async (req, res) => {") && srvRel.includes('let unlockGuestStart = null;'));
  t('B8 censos ajenos en release: monedaCuentaAds ×4 · PLAN_UNICO ×11 · contentLangOf 14 líneas · trial_sin_retencion ×1',
    countOcc(srvRel, 'monedaCuentaAds') === 4 && countOcc(srvRel, 'PLAN_UNICO') === 11 &&
    srvRel.split('\n').filter((l) => l.includes('contentLangOf')).length === 14 && countOcc(srvRel, 'trial_sin_retencion') === 1,
    'moneda=' + countOcc(srvRel, 'monedaCuentaAds') + ' plan=' + countOcc(srvRel, 'PLAN_UNICO'));

  // ---------- C/D. e2e con boot real ----------
  function portFree(port) {
    try { require('child_process').execSync("ss -ltn | grep -q ':" + port + " '", { stdio: 'pipe' }); return false; } catch (e) { return true; }
  }
  async function boot(dir, port, tag, build) {
    if (!portFree(port)) throw new Error('puerto ' + port + ' ocupado antes del boot ' + tag);
    const base = '/tmp/boot-l11-' + tag;
    fs.rmSync(base, { recursive: true, force: true });
    const dataDir = base + '/data';
    fs.mkdirSync(dataDir, { recursive: true });
    const logFd = fs.openSync(base + '/boot.log', 'w');
    const env = Object.assign({}, process.env, {
      PORT: String(port), DATA_DIR: dataDir,
      NODE_PATH: '/home/hatch/workspace/posta/node_modules',
      OPENAI_API_KEY: '', ADMIN_TOKEN: 'test-admin-l11', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY: 'test-l11-suite',
    });
    const child = spawn('node', ['server.js'], { cwd: dir, env, stdio: ['ignore', logFd, logFd] });
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      await sleep(500);
      try { const r = await fetch('http://127.0.0.1:' + port + '/api/version'); if (r.ok) { const j = await r.json(); up = j.build === build; } } catch (e) {}
    }
    if (!up) throw new Error('boot ' + tag + ' no levantó (ver ' + base + '/boot.log)');
    return { child, dataDir, port };
  }
  function jpegBuf(kb) { const b = Buffer.alloc(kb * 1024, 0); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0; return b; }
  function payloadFor(ig, business, validos) {
    const posts = [];
    for (let i = 0; i < 3; i++) posts.push({
      type: 'image',
      image: validos ? 'data:image/jpeg;base64,' + jpegBuf(12).toString('base64') : 'no-es-una-imagen',
      caption: `Posteo de prueba número ${i + 1} para el negocio ${business}: café de especialidad tostado en casa.`,
      hashtags: '#cafe', headline: 'Café', style: 'foto', style_name: 'foto', text_mode: 'text',
    });
    return { ok: true, engine: 25, lang: 'es', business, ig, category: 'cafetería', posts, design: { posts: posts.map(() => ({ headline: 'Café', style: 'foto', kind: 'foto' })) } };
  }
  function seedCache(dataDir, ig, payload) {
    const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
    db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
    db.close();
  }
  function estado(dataDir, ig) {
    const db = new DatabaseSync(path.join(dataDir, 'posta.db'), { readOnly: true });
    const guests = db.prepare('SELECT id FROM users WHERE is_guest = 1 AND guest_ig = ?').all(ig);
    let posts = 0;
    if (guests.length) posts = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(guests[0].id).n;
    const totalTrial = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE source = 'trial'").get().n;
    db.close();
    return { guests: guests.length, posts, totalTrial };
  }
  async function post(port, body) {
    const r = await fetch('http://127.0.0.1:' + port + '/api/guest/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, j };
  }

  console.log('C. e2e release (modo producción, sin test_key)');
  const rel = await boot(REL, 35121, 'rel', '20261105-v1064');
  try {
    // (b) una sola llamada: comportamiento idéntico al de siempre.
    seedCache(rel.dataDir, 'l11uno', payloadFor('l11uno', 'Uno Café', true));
    const rb = await post(rel.port, { ig: 'l11uno', domain: 'l11uno.com', device: 'dvc-l11', lang: 'es' });
    const eb = estado(rel.dataDir, 'l11uno');
    t('C-b llamada sola → 200, posts 3, scheduled 3; DB: 1 invitado, 3 posteos',
      rb.status === 200 && rb.j.ok === true && rb.j.posts === 3 && rb.j.scheduled === 3 && eb.guests === 1 && eb.posts === 3,
      rb.status + ' ' + JSON.stringify(rb.j) + ' ' + JSON.stringify(eb));
    // (c) segunda llamada DESPUÉS de terminada la primera: guarda de
    // siempre (409), sin re-importar ni crear otro invitado.
    const rc = await post(rel.port, { ig: 'l11uno', domain: 'l11uno.com', device: 'dvc-l11', lang: 'es' });
    const ec = estado(rel.dataDir, 'l11uno');
    t('C-c segunda llamada posterior → 409 trial_used; DB intacta (1 invitado, 3 posteos)',
      rc.status === 409 && rc.j.trial_used === true && ec.guests === 1 && ec.posts === 3,
      rc.status + ' ' + JSON.stringify(rc.j) + ' ' + JSON.stringify(ec));
    // (a) dos llamadas CONCURRENTES para el mismo @ nuevo: una sola
    // importación (un invitado, 3 posteos), una 200 y la otra 409.
    seedCache(rel.dataDir, 'l11conc', payloadFor('l11conc', 'Conc Café', true));
    const [ra1, ra2] = await Promise.all([
      post(rel.port, { ig: 'l11conc', domain: 'l11conc.com', device: 'dvc-l11', lang: 'es' }),
      post(rel.port, { ig: 'l11conc', domain: 'l11conc.com', device: 'dvc-l11', lang: 'es' }),
    ]);
    const ea = estado(rel.dataDir, 'l11conc');
    const estados = [ra1.status, ra2.status].sort();
    t('C-a concurrentes → {200,409}, 1 invitado, 3 posteos (una sola importación)',
      estados[0] === 200 && estados[1] === 409 && ea.guests === 1 && ea.posts === 3,
      estados.join(',') + ' ' + JSON.stringify(ea));
    // (d) la primera FALLA a mitad (payload con imágenes inválidas → el
    // import trae 0 → 500): el candado no queda tomado y la segunda,
    // con el payload ya válido, procede y entra.
    seedCache(rel.dataDir, 'l11falla', payloadFor('l11falla', 'Falla Café', false));
    const rd1 = await post(rel.port, { ig: 'l11falla', domain: 'l11falla.com', device: 'dvc-l11', lang: 'es' });
    seedCache(rel.dataDir, 'l11falla', payloadFor('l11falla', 'Falla Café', true));
    const rd2 = await post(rel.port, { ig: 'l11falla', domain: 'l11falla.com', device: 'dvc-l11', lang: 'es' });
    const ed = estado(rel.dataDir, 'l11falla');
    t('C-d fallo a mitad → 500; reintento válido → 200 con 3 posteos (candado libre)',
      rd1.status === 500 && rd2.status === 200 && rd2.j.posts === 3 && ed.guests === 1 && ed.posts === 3,
      rd1.status + '→' + rd2.status + ' ' + JSON.stringify(ed));
  } finally { rel.child.kill('SIGKILL'); }

  console.log('D. Control e2e base v1063 (sin el candado)');
  const bas = await boot(BASE, 35122, 'base', '20261105-v1063');
  try {
    seedCache(bas.dataDir, 'l11conc', payloadFor('l11conc', 'Conc Café', true));
    const [rb1, rb2] = await Promise.all([
      post(bas.port, { ig: 'l11conc', domain: 'l11conc.com', device: 'dvc-l11', lang: 'es' }),
      post(bas.port, { ig: 'l11conc', domain: 'l11conc.com', device: 'dvc-l11', lang: 'es' }),
    ]);
    const eb2 = estado(bas.dataDir, 'l11conc');
    console.log('    base concurrente → estados ' + [rb1.status, rb2.status].join(',') + ' · ' + JSON.stringify(eb2) +
      ' (en UN proceso el handler síncrono ya serializa; el agujero atómico se reproduce en A1 y el candado está ausente: B1/B2)');
    t('D1 base: el par concurrente completa sin romper (observación documentada en STATUS)',
      [rb1.status, rb2.status].includes(200) && eb2.posts === 3 && eb2.guests === 1,
      [rb1.status, rb2.status].join(',') + ' ' + JSON.stringify(eb2));
  } finally { bas.child.kill('SIGKILL'); }

  console.log('\nTOTAL: ' + pass + ' ok · ' + fail + ' fallas' + (failed.length ? ' → ' + failed.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR SUITE:', e); process.exit(1); });
