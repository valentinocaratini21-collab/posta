#!/usr/bin/env node
// (v323 · pieza 8 + 5 + 7 + 13) CANDADO DE PRUEBA 90 DÍAS y piezas hermanas:
// el mismo negocio no regenera su prueba por 90 días (ni por @ ni por
// dominio), recupera su snapshot sin gastar IA, la allowlist pasa siempre,
// el honeypot bloquea en silencio, el regalo por email captura sin RESEND y
// el reel de muestra es idempotente. Todo sembrado: CERO gasto de IA.
// Uso: node test-trial-lock.js
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3991;
const BASE = `http://127.0.0.1:${PORT}`;
const DAY = 24 * 3600 * 1000;

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
};

(async () => {
  // ── Unit: normalización de identidad ──────────────────────────────────
  const tl = require('./trial-lock');
  ok('normalizeIg: @ + mayúsculas', tl.normalizeIg('@MiNegocio ') === 'minegocio');
  ok('normalizeIg: URL de instagram', tl.normalizeIg('https://www.instagram.com/MiNegocio/') === 'minegocio');
  ok('normalizeIg: vacío', tl.normalizeIg('') === '' && tl.normalizeIg(null) === '');
  ok('normalizeDomain: esquema + www + path', tl.normalizeDomain('https://www.MiNegocio.com/tienda?x=1') === 'minegocio.com');
  ok('normalizeDomain: sin esquema', tl.normalizeDomain('minegocio.com') === 'minegocio.com');
  ok('allowlist: marca propia', tl.isAllowlisted(null, 'posty.hacetodo', '') === true && tl.isAllowlisted(null, '', 'postyhacetodo.com') === true);
  ok('allowlist: negocio común NO', tl.isAllowlisted(null, 'minegocio', 'minegocio.com') === false);

  // ── Boot con DATA_DIR propio ───────────────────────────────────────────
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-lock-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', TRIAL_TEST_KEY: 'test-key', SESSION_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', d => { bootLog += d; });
  child.stderr.on('data', d => { bootLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch {}
      if (!up) await new Promise(r => setTimeout(r, 500));
    }
    assert(up, 'el servidor no levantó:\n' + bootLog.slice(-1500));

    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(dataDir, 'posta.db');
    const ro = new DatabaseSync(dbPath, { readOnly: true });
    const rw = new DatabaseSync(dbPath);
    const payload = {
      business: 'Negocio Candado', category: 'cafeteria', lang: 'es', ig: 'locktest',
      posts: [{ type: 'image', image: '/demo-x.jpg', headline: 'Titular semilla', caption: 'Caption semilla', why: 'Porqué semilla' }],
      week: [], spots_left: 40,
    };
    const now = Date.now();
    rw.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('locktest', 'locktest.com', 'Negocio Candado', 'es', JSON.stringify(payload), now - 10 * DAY, now - 10 * DAY);
    rw.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('viejolock', '', 'Viejo', 'es', JSON.stringify({ ...payload, ig: 'viejolock' }), now - 91 * DAY, now - 91 * DAY);
    rw.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('posty.hacetodo', '', 'Posty', 'es', JSON.stringify({ ...payload, ig: 'posty.hacetodo' }), now - 1 * DAY, now - 1 * DAY);
    rw.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('sinpayload', '', 'Sin', 'es', null, now - 5 * DAY, now - 5 * DAY);
    rw.prepare('INSERT INTO trial_sample_reels (ig, video, created_at) VALUES (?,?,?)')
      .run('locktest', '/media/reel-semilla.mp4', now);

    const gen = async (fields) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      const r = await fetch(BASE + '/api/trial/generate', { method: 'POST', body: fd });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };

    // @ dentro de 90 días (variante con mayúsculas y @) → snapshot, sin regenerar
    let g = await gen({ ig: '@LOCKTEST', business: 'Otro Nombre', category: 'cafeteria', lang: 'es' });
    ok('candado: @ en 90 días sirve snapshot', g.body.trial_locked === true && Array.isArray(g.body.posts), g.body);
    ok('candado: fechas del candado presentes', g.body.trial_unlock_at === now - 10 * DAY + 90 * DAY, g.body.trial_unlock_at);
    const evLock = ro.prepare("SELECT COUNT(*) c FROM funnel_events WHERE event = 'prueba_lock'").get();
    ok('candado: evento prueba_lock registrado', evLock.c >= 1, evLock);

    // La WEB del mismo negocio también cae en el candado
    g = await gen({ ig: '', web: 'https://www.locktest.com/tienda', business: '', category: 'cafeteria', lang: 'es' });
    ok('candado: dominio del mismo negocio bloquea', g.body.trial_locked === true, g.body);

    // @ a los 91 días: el candado NO aplica (la generación seguirá su curso
    // y fallará por red/IA en este entorno — lo que importa: no hay candado)
    g = await gen({ ig: 'viejolock', business: 'Viejo', category: 'cafeteria', lang: 'es' });
    ok('candado: 91 días ya no bloquea', g.body.trial_locked !== true, { status: g.status, keys: Object.keys(g.body || {}) });

    // Allowlist: aunque tenga candado, pasa
    g = await gen({ ig: 'posty.hacetodo', business: 'Posty', category: 'cafeteria', lang: 'es' });
    ok('candado: allowlist pasa siempre', g.body.trial_locked !== true, { status: g.status });

    // Sin snapshot recuperable → 409 amable con fecha exacta
    g = await gen({ ig: 'sinpayload', business: 'Sin', category: 'cafeteria', lang: 'es' });
    ok('candado sin snapshot: 409 + trial_locked', g.status === 409 && g.body.trial_locked === true, g);
    ok('candado sin snapshot: mensaje con fecha', /20\d\d/.test(String(g.body.error || '')), g.body.error);

    // Stream: el candado llega como evento SSE 'locked'
    {
      const fd = new FormData(); fd.append('ig', 'sinpayload'); fd.append('lang', 'es'); fd.append('category', 'cafeteria');
      const r = await fetch(BASE + '/api/trial/generate-stream', { method: 'POST', body: fd });
      const txt = await r.text();
      ok('stream: evento locked', /event: locked|"type":"locked"|locked/.test(txt), txt.slice(0, 200));
    }

    // GET week: con la caché vencida, el snapshot del candado rescata la semana
    {
      const r = await fetch(BASE + '/api/trial/week?ig=locktest');
      const b = await r.json().catch(() => ({}));
      ok('week: fallback al snapshot del candado', r.status === 200 && b.trial_locked === true && Array.isArray(b.posts), { status: r.status });
    }

    // Honeypot: error genérico + evento, sin consumir generación
    g = await gen({ ig: 'negocionuevo', business: 'Nuevo', category: 'cafeteria', lang: 'es', hp_empresa: 'spam-bot' });
    ok('honeypot: no genera', g.body.trial_locked !== true && !Array.isArray(g.body.posts), g.body);
    const evBot = ro.prepare("SELECT COUNT(*) c FROM funnel_events WHERE event = 'prueba_bot_block'").get();
    ok('honeypot: evento prueba_bot_block', evBot.c >= 1, evBot);

    // Regalo por email: captura + enrola + queda en cola sin RESEND (fail-closed honesto)
    {
      const r = await fetch(BASE + '/api/trial/gift-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig: 'locktest', email: 'dueno@locktest.com', lang: 'es' }),
      });
      const b = await r.json().catch(() => ({}));
      ok('regalo: ok con semana del candado', r.status === 200 && b.ok === true, b);
      ok('regalo: sin RESEND queda en cola (sent=false)', b.sent === false && b.queued === true, b);
      const sub = ro.prepare("SELECT COUNT(*) c FROM ideas_subscribers WHERE email = 'dueno@locktest.com'").get();
      ok('regalo: enrolado en el goteo de ideas (v321)', sub.c >= 1, sub);
      const tc = ro.prepare("SELECT gift_state FROM trial_cache WHERE ig = 'locktest'").get();
      ok('regalo: gift_state=queued en trial_cache', tc && tc.gift_state === 'queued', tc);
      const r2 = await fetch(BASE + '/api/trial/gift-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig: 'locktest', email: 'no-es-email', lang: 'es' }),
      });
      ok('regalo: email inválido → 400', r2.status === 400, r2.status);
    }

    // Reel de muestra: idempotente desde la fila sembrada (cero MOTION)
    {
      const r = await fetch(BASE + '/api/trial/sample-reel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig: 'locktest', lang: 'es' }),
      });
      const b = await r.json().catch(() => ({}));
      ok('reel: fila existente → cached sin regenerar', b.ok === true && b.cached === true && b.video === '/media/reel-semilla.mp4', b);
      const r2 = await fetch(BASE + '/api/trial/sample-reel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig: 'sinprueba', lang: 'es' }),
      });
      ok('reel: sin semana → 404 honesto', r2.status === 404, r2.status);
    }
  } finally {
    child.kill('SIGKILL');
  }
  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
