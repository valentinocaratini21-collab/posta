// test-lote-soulcycle-cierre4.js
// LOTE SOULCYCLE-CIERRE-4 — RESCATE QUE NO ABANDONA + ENTRADA HONESTA
// (cierre 4 de la corrida SoulCycle, candidata 1 de 5 del gate, 15/11).
//
// La evidencia (~/workspace/soulcycle-corrida-15nov/): la generación
// cerró con 5 piezas en armando sin imagen; el rescate de fondo dejó
// idx 2/3/4 «en-rescate · cadena-en-fondo» y la pieza 1 en
// «armado-rescate» tras juicio FAIL; ~13 min de relecturas con
// gen-status generating:false (nadie trabajando); importación 0;
// guest/start 500 «We could not open your feed yet» ×2.
//
// Qué cambia:
//   (a) rescuePieceWithSealDetalle devuelve el MOTIVO de cada salida
//       (sin-insumos · sin-archivo-de-logo · tope-de-gasto ·
//       generacion-fallo · qa-concepto · compuesto-fallo · logo-qa);
//       scheduleWeekRescue lo persiste EN LA PIEZA (posts[idx].rescate
//       + el motivo de su entrada en rescate_semana) en cada pasada, y
//       cuando la cadena se detiene (en espera o agotada) declara el
//       motivo final por pieza (estado 'detenido'). Ninguna pieza
//       queda en «armando» huérfano. La SEMANA nunca se declara
//       incompleta (eso no cambia): el motivo es por pieza.
//   (b) El re-enganche por fila de caché (rearmarSemanaPruebaPorCacheKey)
//       es compartido por el resumidor, el BARRIDO nuevo
//       (rescateSemanaSweep, cron */5 en scheduler.js — la cadena vive
//       en memoria y un reinicio ya no la mata en silencio) y la
//       entrada del invitado.
//   (c) gen-status suma rescuing/arming (generating intacto).
//   (d) guest/start con importación 0 y semana en armado: re-engancha
//       la cadena y responde 202 week_pending con la vuelta posible
//       (la fila invitada queda reusable; la prueba NO se consume).
//       Sin piezas en armado y sin medio: 202 week_unavailable.
//       El 500 «try again in a minute» no existe más.
//
// Se corre desde la raíz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-soulcycle-cierre4.js
// Control contra la base v1103: PZ_ROOT=<base> (la sección A cae y el
// boot reproduce el abandono: gen-status sin rescuing/arming y
// guest/start 500 con el texto viejo).
// El boot tarda ~3-4 min: el cierre 'detenido' del fixture llega por
// el camino real de EN ESPERA (3 pasadas sin logo, delay de cadena).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const SCHED = fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const iRescate = SERVER.indexOf('async function scheduleWeekRescue');
const cuerpoRescate = iRescate >= 0 ? SERVER.slice(iRescate, iRescate + 60000) : '';
const iGuest = SERVER.indexOf("app.post('/api/guest/start'");
const cuerpoGuest = iGuest >= 0 ? SERVER.slice(iGuest, iGuest + 60000) : '';
const iGenStatus = SERVER.indexOf("app.get('/api/trial/gen-status'");
const cuerpoGenStatus = iGenStatus >= 0 ? SERVER.slice(iGenStatus, iGenStatus + 4000) : '';

/* ── A · Censo estático del lote ─────────────────────────────── */
seccion('A · el motivo existe y llega a la pieza');
{
  ok(SERVER.includes('async function rescuePieceWithSealDetalle'), 'A1 existe rescuePieceWithSealDetalle');
  for (const m of ['sin-insumos', 'sin-archivo-de-logo', 'tope-de-gasto', 'generacion-fallo', 'qa-concepto', 'compuesto-fallo', 'logo-qa']) {
    ok(SERVER.includes(`motivo: '${m}'`), 'A2 la cadena declara el motivo ' + m);
  }
  ok(SERVER.includes('async function rescuePieceWithSeal(opts)') && SERVER.includes('rescuePieceWithSealDetalle(opts)'), 'A3 el wrapper histórico delega en la Detalle (pieza o null)');
  ok(cuerpoRescate.includes('rescuePieceWithSealDetalle') && cuerpoRescate.includes('motivosRescate'), 'A4 scheduleWeekRescue consume la Detalle y junta motivos por pasada');
  ok(cuerpoRescate.includes("estado: 'trabajando'"), 'A5 la pasada persiste el estado trabajando con su motivo en la pieza');
  ok(cuerpoRescate.includes('declararRescateDetenido') && cuerpoRescate.includes("estado: 'detenido'"), 'A6 al cerrar, la cadena declara el motivo final por pieza (detenido)');
  ok(cuerpoRescate.includes("declararRescateDetenido('sin-archivo-de-logo')") && cuerpoRescate.includes("declararRescateDetenido('pasadas-agotadas')"), 'A7 la declaración cubre los dos cierres: en espera y pasadas agotadas');
  ok(SERVER.includes("rescate: { estado: 'completada', motivo: null"), 'A8 la pieza completada también declara su estado de rescate');
}
seccion('A · el re-enganche compartido y el barrido');
{
  ok(SERVER.includes('async function rearmarSemanaPruebaPorCacheKey'), 'A9 existe el re-enganche por fila de caché');
  ok(SERVER.includes('rearmarSemanaPruebaPorCacheKey(info.ig)'), 'A10 el resumidor por usuario delega en el re-enganche');
  ok(SERVER.includes('async function rescateSemanaSweep'), 'A11 existe el barrido del rescate');
  ok(SERVER.includes('rescateSemanaSweep,'), 'A12 el barrido está exportado para el scheduler');
  ok(SCHED.includes("'*/5 * * * *'") && SCHED.includes('srv.rescateSemanaSweep'), 'A13 scheduler.js agenda el barrido cada 5 minutos (patrón serieFeedSweep)');
  ok(SERVER.includes('todoSinLogo'), 'A14 el barrido trae la guarda anti-quema del bloqueo sin logo');
}
seccion('A · gen-status y la entrada honesta');
{
  ok(cuerpoGenStatus.includes('rescuing: semanaCadenasVivas.has(ig)') && cuerpoGenStatus.includes('arming'), 'A15 gen-status suma rescuing + arming sin tocar generating');
  eq(count(SERVER, 'We could not open your feed yet'), 0, 'A16 el 500 «try again in a minute» de guest/start no existe más');
  ok(cuerpoGuest.includes('week_pending: true') && cuerpoGuest.includes('status(202)'), 'A17 guest/start responde 202 week_pending con la semana en armado');
  ok(cuerpoGuest.includes('rearmarSemanaPruebaPorCacheKey(cacheKey)'), 'A18 guest/start re-engancha la cadena sobre la caché (trabajo de verdad)');
  ok(cuerpoGuest.includes('week_unavailable: true'), 'A19 sin armado y sin medio: 202 week_unavailable, tampoco 500');
  ok(!/if \(!nImp\) \{\n\s*\/\/ \(LOTE PRUEBA-CHAT\) La fila reusada/.test(cuerpoGuest), 'A20 la fila invitada ya no se borra en la importación en 0 (queda reusable)');
  ok(SERVER.includes("BUILD_ID = '20261105-v1104'"), 'A21 stamp BUILD v1104');
}

/* ── B · Boot: el fixture de la corrida, vivo ────────────────── */
const IG = 'soulcyclefix';
function fixturePayload() {
  const posts = [0, 1, 2, 3, 4].map((i) => ({
    type: 'image', armando: true,
    headline: ['Try From USD today', 'USD', '3 keys to rotor set install', 'From USD: order today', 'Something new just arrived'][i],
    caption: 'Caption fixture ' + i, hashtags: '#fixture',
    juicio: i === 1 ? { pasa: false, motivos: ['no-vende-producto', 'marca-no-visible'], salida: 'armado-rescate' } : undefined,
  }));
  return {
    ok: true, engine: 25, lang: 'en', content_lang: 'en',
    business: 'SoulCycle', ig: IG, category: 'otro', subcat: '',
    accent: '#B99B77', btn: '#5D2A0D',
    digest: { hash: 'fixturehashcierre4', producto_estrella: null, texto_feed: null },
    web_info: { description: '', url: '' },
    posts,
    design: {
      posts: posts.map((p) => ({ headline: p.headline, subline: '', tema: null, text_mode: 'text', photo_source: 'brand-poster' })),
      styles: [], photos: [], videoIdx: 2, count: 5, engine: 25, subcat: null,
    },
    rescate_semana: [2, 3, 4].map((idx) => ({ idx, cadena: 'en-rescate', motivo: 'cadena-en-fondo' })),
    primer_posteo: null,
    week: [0, 1, 2, 3, 4].map((i) => ({ day: 'Monday', date: 'Nov 16', hour: '12:30 PM', post: i })),
    spots_left: 49, video_ok: false,
  };
}

async function boot() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35700 + Math.floor(Math.random() * 300);
  const base = 'http://127.0.0.1:' + port;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-cierre4-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '', ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '', GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const jars = new Map();
  async function req(jarKey, method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const jar = jars.get(jarKey);
    if (jar) headers.Cookie = jar;
    const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie');
    if (sc) jars.set(jarKey, sc.split(';')[0]);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, text };
  }
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(dataDir, 'posta.db');
  const readPayload = () => {
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = ro.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(IG);
      return row && row.payload ? JSON.parse(row.payload) : null;
    } finally { ro.close(); }
  };
  const pollUntil = async (fn, timeoutMs, stepMs) => {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > timeoutMs) return null;
      await sleep(stepMs || 2000);
    }
  };
  try {
    let version = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { const r = await fetch(base + '/api/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
      await sleep(1500);
    }
    ok(!!version, 'B1 el servidor botea y /api/version responde', version || out.slice(-300));
    eq(version && version.build, '20261105-v1104', 'B2 el build servido es el del lote');

    // La semana trabada de la corrida, sembrada en la caché.
    const rw = new DatabaseSync(dbPath);
    rw.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)').run(IG, JSON.stringify(fixturePayload()), Date.now());
    rw.close();

    const st0 = await req('a', 'GET', '/api/trial/gen-status?ig=' + IG);
    ok(st0.json && st0.json.cached === true && st0.json.generating === false, 'B3 gen-status: cached y generating:false (como en la corrida)', st0.text.slice(0, 200));
    eq(st0.json && st0.json.arming, 5, 'B4 gen-status declara las 5 piezas en armado (arming)');
    eq(st0.json && st0.json.rescuing, false, 'B5 gen-status: todavía nadie trabaja (rescuing:false)');

    const gs1 = await req('a', 'POST', '/api/guest/start', { ig: IG, domain: '', device: 'dvc-cierre4', lang: 'en' });
    eq(gs1.status, 202, 'B6 guest/start con la semana en armado: 202, NO 500');
    ok(gs1.json && gs1.json.week_pending === true && gs1.json.pending === 5, 'B7 la respuesta declara week_pending con las 5 pendientes', gs1.text.slice(0, 200));
    ok(gs1.json && /still being built/i.test(gs1.json.error || ''), 'B8 el mensaje es el estado honesto (se está armando), no «try again»');

    const viva = await pollUntil(async () => {
      const st = await req('a', 'GET', '/api/trial/gen-status?ig=' + IG);
      return st.json && st.json.rescuing === true ? st.json : null;
    }, 30000);
    ok(!!viva, 'B9 la cadena quedó re-enganchada y TRABAJANDO (gen-status rescuing:true)');

    const conMotivo = await pollUntil(() => {
      const pl = readPayload();
      if (!pl || !Array.isArray(pl.posts)) return null;
      const todas = pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'trabajando' && p.rescate.motivo === 'sin-archivo-de-logo');
      const entradas = (pl.rescate_semana || []).every((e) => e.motivo === 'sin-archivo-de-logo');
      return todas && entradas ? pl : null;
    }, 60000);
    ok(!!conMotivo, 'B10 cada pieza declara su motivo real en su estado (trabajando · sin-archivo-de-logo) y el placeholder cadena-en-fondo murió');

    const gs2 = await req('b', 'POST', '/api/guest/start', { ig: IG, domain: '', device: 'dvc-cierre4', lang: 'en' });
    eq(gs2.status, 202, 'B11 la segunda entrada tampoco es 500 ni 409: 202 week_pending (la vuelta posible)');
    ok(gs2.json && gs2.json.week_pending === true, 'B12 la segunda respuesta mantiene el estado honesto');
    const ro2 = new DatabaseSync(dbPath, { readOnly: true });
    const guests = ro2.prepare('SELECT id FROM users WHERE guest_ig = ?').all(IG);
    eq(guests.length, 1, 'B13 la fila invitada quedó y se reusa (una sola, con 0 posteos)');
    const nPostsGuest = guests.length ? ro2.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(guests[0].id).n : -1;
    eq(nPostsGuest, 0, 'B14 el invitado reusable tiene 0 posteos (nada se entregó)');
    // trial_used nace perezosa al primer uso del candado: si ni
    // siquiera existe, menos puede haber un consumo registrado.
    let used = -1;
    if (guests.length) {
      try { used = ro2.prepare('SELECT COUNT(*) AS n FROM trial_used WHERE user_id = ?').get(guests[0].id).n; } catch (e) { used = 0; }
    }
    eq(used, 0, 'B15 la prueba NO se consumió (sin registro de uso del invitado)');
    ro2.close();

    const detenido = await pollUntil(() => {
      const pl = readPayload();
      if (!pl || !Array.isArray(pl.posts)) return null;
      return pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'detenido' && !!p.rescate.motivo) ? pl : null;
    }, 300000, 5000);
    ok(!!detenido, 'B16 la cadena se detiene y CADA pieza declara su motivo final (detenido) — ninguna en armado huérfano');
    const stF = await req('a', 'GET', '/api/trial/gen-status?ig=' + IG);
    ok(stF.json && stF.json.rescuing === false && stF.json.arming === 5, 'B17 con la cadena detenida, gen-status lo refleja (rescuing:false, arming:5 con motivos en la pieza)');

    const gs3 = await req('c', 'POST', '/api/guest/start', { ig: IG, domain: '', device: 'dvc-cierre4', lang: 'en' });
    eq(gs3.status, 202, 'B18 tras el cierre, la entrada vuelve a responder el estado honesto (202)');
    const viva2 = await pollUntil(async () => {
      const st = await req('c', 'GET', '/api/trial/gen-status?ig=' + IG);
      return st.json && st.json.rescuing === true ? st.json : null;
    }, 30000);
    ok(!!viva2, 'B19 la cadena se re-engancha tras haberse detenido (rescuing:true de nuevo)');
    const trabajando2 = await pollUntil(() => {
      const pl = readPayload();
      if (!pl || !Array.isArray(pl.posts)) return null;
      return pl.posts.every((p) => p && p.rescate && p.rescate.estado === 'trabajando') ? pl : null;
    }, 60000);
    ok(!!trabajando2, 'B20 al re-enganchar, el estado de las piezas vuelve a trabajando con el motivo de la pasada nueva');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await boot();
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE SOULCYCLE-CIERRE-4: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
