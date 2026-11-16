// Suite del LOTE EXCLUSIÓN-SIN-REGISTRO (v1120).
//
// El hueco que cierra: en /api/admin/trial-reset, una clave SIN registro
// (total === 0) devolvía { ok:true, sin_registro:true } y salía ANTES de
// la rama confirmada, así que registrarReseteo nunca corría y no se
// escribía la exclusión durable en trial_reset_log. La candidata fresca
// del gate (las cuatro claves en cero, reseteo confirmado antes de su
// primera corrida) nacía entonces SIN exclusión y su primera generación
// quedaba tomada por la línea a mano — la corrida no contaba.
//
// El cambio: en la rama total === 0, con confirm puesto, se invoca
// lineaMano.registrarReseteo ANTES de devolver, y la respuesta lo
// declara (exclusion_registrada:true). Sin confirm no se escribe nada,
// igual que siempre. Con registro, el comportamiento es el de hoy.
//
// Los tres casos pinchados, por HTTP contra la palanca real en un boot
// aislado del árbol, con la DB del rig como testigo:
//  (a) clave fresca + confirm → exclusión escrita (sin consumir) y la
//      primera generación nace SIN marca (motivo reseteo-operador, la
//      exclusión se consume, sin marca activa) y la puerta de rediseño
//      no frena: el software entrega la semana entera. También por la
//      vía de dominio solo.
//  (b) clave fresca sin confirm → respuesta idéntica a la de hoy y
//      NADA escrito: sin fila en trial_reset_log y la generación de la
//      clave se marcaría (no hay exclusión que la salve).
//  (c) clave con registro → idéntico a hoy: sin confirm, dry_run sin
//      borrar ni escribir; con confirm, reset_hecho + exclusión +
//      primera generación sin marca.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = 34741;
const TOKEN = 'token-suite';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
function count(hay, needle) { return hay.split(needle).length - 1; }

function payloadRig(ig) {
  return {
    ok: true, business: 'Exclusion Rig', ig: '@' + ig, category: 'fitness',
    digest: { producto_estrella: 'Rutina insignia', productos: [{ nombre: 'Rutina insignia' }], servicios: [], web: { description: 'hola@exclusionrig.test', url: '' } },
    posts: [0, 1, 2, 3, 4].map((i) => ({ type: 'image', armando: true, caption: 'c' + i, hashtags: '', headline: 'P' + i, text_mode: 'clean' })),
    week: [0, 1, 2, 3, 4].map((i) => ({ day: i + 1, date: '2026-11-16', hour: '19:00' })),
    demo_ai: { used: false, pieces: 0, cost_usd: 0, engines: [], qa: [] },
  };
}

async function main() {
  console.log('— pines estáticos del lote —');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  ok(count(srv, "const BUILD_ID = '20261105-v1120';") === 1, 'P1 BUILD_ID 20261105-v1120 x1 en server.js');
  ok(count(srv, 'lineaMano.registrarReseteo(db, igKey, domainKey, Date.now())') === 2,
    'P2 registrarReseteo invocado en DOS caminos del trial-reset (la rama confirmada de siempre + la rama sin_registro)');
  const iSin = srv.indexOf('if (total === 0)');
  const iDry = srv.indexOf('if (!confirm) return res.json({ ...base, dry_run: true });');
  ok(iSin > 0 && iDry > iSin, 'P3 la rama sin_registro sigue antes del dry_run');
  const ramaSin = srv.slice(iSin, iDry);
  ok(ramaSin.includes('if (confirm)') && ramaSin.includes('registrarReseteo') && ramaSin.includes('exclusion_registrada'),
    'P4 la rama sin_registro registra la exclusión solo con confirm y la declara en la respuesta');

  console.log('— boot aislado del árbol —');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-exclusion-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-exclusion-media-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: TOKEN, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('  child PID=' + child.pid + ' puerto ' + PORT);
  try {
    let vivo = false, ver = null;
    for (let i = 0; i < 60 && !vivo; i++) {
      await sleep(500);
      try { const r = await fetch('http://127.0.0.1:' + PORT + '/api/version'); if (r.status === 200) { vivo = true; ver = await r.json(); } } catch (e) {}
    }
    ok(vivo, 'B0 el boot aislado levanta');
    if (!vivo) return;
    ok(ver && ver.build === '20261105-v1120', 'B1 /api/version del rig = 20261105-v1120', ver);
    const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
    db.exec('PRAGMA busy_timeout = 8000');
    const lm = require(path.join(ROOT, 'linea-mano.js'));
    // El testigo crea el esquema vacío si el server todavía no lo creó
    // (ensureSchema es perezoso: corre en la primera entrada del módulo).
    // No escribe ninguna exclusión: las aserciones miran las FILAS.
    try { lm.ensureSchema(db); } catch (e) {}
    const post = async (url, body) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };
    const resetUrl = 'http://127.0.0.1:' + PORT + '/api/admin/trial-reset?token=' + TOKEN;
    const logDe = (kind, value) => db.prepare('SELECT * FROM trial_reset_log WHERE kind = ? AND value = ? ORDER BY id DESC').get(kind, value);

    console.log('— (b) clave fresca SIN confirm: nada escrito, respuesta de hoy —');
    const rb = await post(resetUrl, { ig: 'excl.b.rig' });
    ok(rb.status === 200 && rb.json.sin_registro === true && rb.json.total === 0,
      'b1 sin registro y sin confirm: sin_registro, como hoy', rb.json);
    ok(rb.json.exclusion_registrada === undefined && rb.json.reset_hecho === undefined && rb.json.dry_run === undefined,
      'b2 la respuesta no declara exclusión ni reset ni dry_run (idéntica a la de hoy)', rb.json);
    ok(!logDe('ig', 'excl.b.rig'), 'b3 trial_reset_log sin fila para la clave (nada escrito)');
    const naceB = lm.nace(db, { ig: 'excl.b.rig', domain: '', testMode: false, allowlisted: false, now: Date.now() });
    ok(naceB.marcada === true, 'b4 sin exclusión, la generación de la clave se marca (la línea a mano la tomaría)', naceB);

    console.log('— (a) clave fresca CON confirm: exclusión escrita, generación sin marca —');
    const ra = await post(resetUrl, { ig: 'excl.a.rig', confirm: true });
    ok(ra.status === 200 && ra.json.sin_registro === true && ra.json.total === 0,
      'a1 sin registro y con confirm: sigue respondiendo sin_registro', ra.json);
    ok(ra.json.exclusion_registrada === true, 'a2 la respuesta declara exclusion_registrada', ra.json);
    const logA = logDe('ig', 'excl.a.rig');
    ok(!!logA && Number(logA.consumida) === 0, 'a3 la exclusión durable quedó escrita y sin consumir', logA);
    const naceA = lm.nace(db, { ig: 'excl.a.rig', domain: '', testMode: false, allowlisted: false, now: Date.now() });
    ok(naceA.marcada === false && naceA.motivo === 'reseteo-operador',
      'a4 la primera generación tras el reseteo NO se marca (motivo reseteo-operador)', naceA);
    const logA5 = logDe('ig', 'excl.a.rig');
    ok(!!logA5 && Number(logA5.consumida) === 1 && lm.marcaActiva(db, 'excl.a.rig') === null,
      'a5 la exclusión se consumió (un reseteo = una prueba excluida) y no hay marca activa');
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('excl.a.rig', JSON.stringify(payloadRig('excl.a.rig')), Date.now());
    const redA = await post('http://127.0.0.1:' + PORT + '/api/trial/redesign', { ig: 'excl.a.rig', colors: { accent: '#112233', btn: '#445566' } });
    ok(!(redA.status === 409 && redA.json.error === 'linea_mano'),
      'a6 la puerta de rediseño NO frena la clave excluida: el software entrega la semana entera', { status: redA.status, error: redA.json.error });

    console.log('— (a2) clave fresca por DOMINIO solo, con confirm —');
    const ra2 = await post(resetUrl, { domain: 'excl-a2.rig', confirm: true });
    ok(ra2.status === 200 && ra2.json.sin_registro === true && ra2.json.exclusion_registrada === true,
      'a2.1 dominio fresco + confirm: sin_registro con exclusión declarada', ra2.json);
    const logA2 = logDe('domain', 'excl-a2.rig');
    ok(!!logA2 && Number(logA2.consumida) === 0, 'a2.2 exclusión durable escrita para el dominio', logA2);
    const naceA2 = lm.nace(db, { ig: '', domain: 'excl-a2.rig', testMode: false, allowlisted: false, now: Date.now() });
    ok(naceA2.marcada === false && naceA2.motivo === 'reseteo-operador',
      'a2.3 la primera generación del dominio NO se marca', naceA2);

    console.log('— (c) clave CON registro: idéntico a hoy —');
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('excl.c.rig', JSON.stringify(payloadRig('excl.c.rig')), Date.now());
    const rc0 = await post(resetUrl, { ig: 'excl.c.rig' });
    ok(rc0.status === 200 && rc0.json.dry_run === true && rc0.json.total === 1,
      'c1 con registro y sin confirm: dry_run, como hoy', rc0.json);
    ok(db.prepare('SELECT COUNT(*) AS n FROM trial_cache WHERE ig = ?').get('excl.c.rig').n === 1 && !logDe('ig', 'excl.c.rig'),
      'c2 el dry_run no borró nada ni escribió exclusión');
    const rc = await post(resetUrl, { ig: 'excl.c.rig', confirm: true });
    ok(rc.status === 200 && rc.json.reset_hecho === true, 'c3 con registro y confirm: reset_hecho, como hoy', rc.json);
    ok(db.prepare('SELECT COUNT(*) AS n FROM trial_cache WHERE ig = ?').get('excl.c.rig').n === 0,
      'c4 el registro se borró (el reseteo corrió su rama completa)');
    const logC = logDe('ig', 'excl.c.rig');
    ok(!!logC && Number(logC.consumida) === 0, 'c5 la exclusión durable quedó escrita, como hoy', logC);
    const naceC = lm.nace(db, { ig: 'excl.c.rig', domain: '', testMode: false, allowlisted: false, now: Date.now() });
    ok(naceC.marcada === false && naceC.motivo === 'reseteo-operador',
      'c6 la primera generación tras el reseteo NO se marca, como hoy', naceC);
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().then(() => {
  console.log(`\n${fail === 0 ? '✓' : '✗'} suite exclusion-sin-registro: ${pass} ok · ${fail} mal`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
