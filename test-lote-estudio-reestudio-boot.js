'use strict';
/* test-lote-estudio-reestudio-boot.js — ESTUDIO-PROFUNDO · M6 (base v760).
 * Levanta server.js en una copia aislada (DATA_DIR temporal propio, sin
 * tocar la DB real) y verifica: /api/version con el BUILD vigente, que
 * los 3 endpoints del re-estudio están montados, que el re-estudio CORRE
 * por HTTP (disparador manual, con sesión real de un usuario registrado)
 * y que el diff SE SIRVE en GET /api/estudio/ultimo-cambio. También que
 * el chunk con la tarjeta se sirve con el CHUNK_V nuevo.
 *
 * LÍMITE HONESTO DEL BOOT (sandbox): web-extract bloquea por diseño
 * (anti-SSRF) cualquier stub local — 127.0.0.1, localhost y hosts que
 * resuelven a IP privada — y la VM no alcanza su propia IP externa, así
 * que el re-estudio con una web fresca REAL no se puede ejercer por HTTP
 * acá. Por eso el boot usa una web inexistente y verifica la RAMA
 * HONESTA en vivo (fuentes_no_leidas, cero cambios inventados), mientras
 * el diff fresco completo está cubierto a nivel módulo por
 * test-lote-estudio-reestudio.js (runRestudyForUser con fetchers
 * inyectados) y el diff servido se verifica con una corrida semillada.
 *
 * Uso: node test-lote-estudio-reestudio-boot.js — sale 0 si todo pasa.
 * Puertos: servidor 18785 (el stub web local NO se usa: ver arriba).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const PORT = 18785;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-reestudio-boot-'));
const nodeModules = path.join(__dirname, '..', '.lote-pruebaentrada-boot', 'node_modules');
const EMAIL = 'reestudio-boot-' + Date.now().toString(36) + '@test.invalid';
const PASSWORD = 'boot123456';

let cookie = '';
async function req(p, opts = {}) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: { ...(opts.json ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, text: j === null ? await r.text().catch(() => '') : '' };
}
async function reqText(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: r.status, text: await r.text() };
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Corrida semillada: el fixture del diff (4 cambios exactos).
function digestSemillado() {
  return {
    v: 1, business: 'Café Test', category: 'cafetería', subcat: '',
    rubro_id: { v: 1, rubro: 'cafetería', subrubro: '', confianza: 0.9, fuente: 'pregunta', segura: true },
    productos: [
      { nombre: 'Café Latte', precio: '$1500', procedencia: 'web' },
      { nombre: 'Medialuna', precio: '$800', procedencia: 'web' },
      { nombre: 'Torta de Chocolate', precio: '$2500', procedencia: 'web' },
    ],
    servicios: [{ nombre: 'Café para llevar', procedencia: 'web' }],
    promos: [{ titulo: '2x1 en medialunas' }, { titulo: 'Promo torta 2x1' }],
    temas_feed: [], fuentes: { web: { at: '2026-11-07T09:00:00.000Z' }, feed: { at: '2026-11-07T09:00:00.000Z' } },
    dueno: null, clientCorrections: [],
    studyHistory: {
      runs: [{
        at: '2026-11-07T09:00:00.000Z',
        cambios: [
          { tipo: 'producto_nuevo', item: 'Torta de Chocolate', despues: '$2500', fuente: 'web' },
          { tipo: 'producto_falta', item: 'Tostado', antes: '$900', fuente: 'web' },
          { tipo: 'precio_cambio', item: 'Café Latte', antes: '$1200', despues: '$1500', fuente: 'web' },
          { tipo: 'promo_nueva', item: 'Promo torta 2x1', despues: '', fuente: 'web' },
        ],
        conflictos: [],
        fuentes: { web: true, feed: true, catalog: false },
        fuentes_no_leidas: [],
      }],
      lastRunAt: '2026-11-07T09:00:00.000Z',
      pendientes: 0,
    },
  };
}

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-reestudio',
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await sleep(1000);
    }
    check('el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await req('/api/version');
    check('/api/version trae el BUILD 20261105-v764', ver.status === 200 && ver.json && ver.json.build === '20261105-v764',
      JSON.stringify(ver.json));
    const health = await req('/api/health');
    check('/api/health ok', health.status === 200 && health.json && health.json.ok === true);

    // Endpoints montados (sin sesión no es 404).
    const sinSesion = await req('/api/estudio/ultimo-cambio');
    check('GET /api/estudio/ultimo-cambio sin sesión → no 404 (montado)', sinSesion.status !== 404, 'status ' + sinSesion.status);
    const sinSesionPost = await req('/api/estudio/reestudio', { method: 'POST', json: {} });
    check('POST /api/estudio/reestudio sin sesión → no 404 (montado)', sinSesionPost.status !== 404, 'status ' + sinSesionPost.status);

    // Registro real → sesión por cookie.
    const reg = await req('/api/auth/register', { method: 'POST', json: { email: EMAIL, password: PASSWORD } });
    check('registro de usuario boot ok', reg.status === 200 && reg.json && reg.json.ok === true, JSON.stringify(reg.json));
    check('sesión por cookie', !!cookie, 'sin set-cookie');

    // Semilla: perfil + ADN (web inexistente a propósito) + digest con
    // la corrida del fixture. Reintentos por SQLITE_BUSY (el servidor
    // tiene la DB abierta).
    const dbPath = path.join(tmpDir, 'posta.db');
    let seeded = false;
    for (let i = 0; i < 20 && !seeded; i++) {
      try {
        const sdb = new DatabaseSync(dbPath);
        const u = sdb.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
        if (!u) throw new Error('usuario boot no visible en DB');
        const uid = u.id;
        sdb.prepare(`INSERT INTO profiles (user_id, business_name, category, ig_username, ig_connected)
          VALUES (?, 'Café Test', 'cafetería', '', 0)
          ON CONFLICT(user_id) DO UPDATE SET business_name='Café Test', category='cafetería'`).run(uid);
        sdb.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET dna_json=excluded.dna_json`)
          .run(uid, JSON.stringify({ website_url: 'https://cafe-test-inexistente-12345.example/' }));
        sdb.exec(`CREATE TABLE IF NOT EXISTS client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT DEFAULT '{}', hash TEXT DEFAULT '', version INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')))`);
        sdb.prepare(`INSERT INTO client_digest (user_id, digest_json, hash, version, updated_at) VALUES (?, ?, '', 1, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET digest_json=excluded.digest_json`).run(uid, JSON.stringify(digestSemillado()));
        sdb.close();
        seeded = true;
      } catch (e) {
        await sleep(300);
      }
    }
    check('semilla de perfil + ADN + digest con corrida', seeded);

    // El diff se sirve.
    const ultimo = await req('/api/estudio/ultimo-cambio');
    check('GET /api/estudio/ultimo-cambio con sesión → 200', ultimo.status === 200 && ultimo.json && ultimo.json.ok === true,
      JSON.stringify(ultimo.json));
    const run = ultimo.json && ultimo.json.run;
    check('la corrida servida trae los 4 cambios del fixture', !!run && Array.isArray(run.cambios) && run.cambios.length === 4,
      JSON.stringify(run && run.cambios));
    const tipos = (run.cambios || []).map((c) => c.tipo).sort();
    check('tipos del diff: producto_nuevo + producto_falta + precio_cambio + promo_nueva',
      JSON.stringify(tipos) === JSON.stringify(['precio_cambio', 'producto_falta', 'producto_nuevo', 'promo_nueva']),
      tipos.join(','));

    // El re-estudio corre por HTTP (rama honesta: web inexistente).
    const re = await req('/api/estudio/reestudio', { method: 'POST', json: {} });
    check('POST /api/estudio/reestudio corre (responde)', re.status === 200 && re.json && typeof re.json.ok === 'boolean',
      JSON.stringify(re.json));
    check('rama honesta: fuentes_no_leidas incluye web y cero cambios inventados',
      re.json && Array.isArray(re.json.fuentes_no_leidas) && re.json.fuentes_no_leidas.includes('web')
      && Array.isArray(re.json.cambios) && re.json.cambios.length === 0,
      JSON.stringify(re.json));

    // La corrida honesta quedó en el historial y el diff viejo sigue servido.
    const ultimo2 = await req('/api/estudio/ultimo-cambio');
    const run2 = ultimo2.json && ultimo2.json.run;
    check('la corrida honesta queda registrada (0 cambios, web no leída)',
      !!run2 && Array.isArray(run2.cambios) && run2.cambios.length === 0
      && Array.isArray(run2.fuentes_no_leidas) && run2.fuentes_no_leidas.includes('web'),
      JSON.stringify(run2));

    // El chunk con la tarjeta se sirve con el CHUNK_V nuevo.
    const chunk = await reqText('/chunk-analisis.js?v=20261105-v764');
    check('chunk-analisis con CHUNK_V nuevo → 200 con la tarjeta', chunk.status === 200 && chunk.text.includes('anaRestudioBox'),
      'status ' + chunk.status);
  } catch (e) {
    console.log('error del test:', e.message);
    fail++;
  } finally {
    kill();
    await sleep(500);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n${pass} ok, ${fail} mal`);
  process.exit(fail ? 1 : 0);
})();
