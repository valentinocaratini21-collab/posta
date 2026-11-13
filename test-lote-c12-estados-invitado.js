// test-lote-c12-estados-invitado.js — LOTE C12 · ESTADOS HONESTOS DEL
// INVITADO (diag. Veja #5 §(c), DIAGNOSIS.md truncada en §2.6: la spec
// de estados es la del brief del tablero).
//
// El problema: el sistema SE AUTO-APRUEBA al programar la prueba —
// importTrialWeek nacía con post_signals.client_signal='approved'
// (auto_signal=0: posaba como señal del cliente) y scheduleAllDrafts
// estampaba approval='approved' + approved_at en TODO, así la métrica
// approval_rate daba 100% sin ninguna aprobación humana y el detalle
// del posteo afirmaba «Aprobado — sale a las 19:00».
//
// El lote: (1) la importación de un INVITADO escribe la señal honesta
// del sistema ('auto', auto_signal=1 — el criterio de scheduler.js
// cuando un posteo sale solo); la de una cuenta REGISTRADA no cambia.
// (2) scheduleAllDrafts estampa approval='auto' SIN approved_at solo
// para invitados; el registrado conserva 'approved' + approved_at.
// (3) apvPill: programado + 'auto' dice «Sale solo a las …» (futuro),
// nunca «Salió solo» ni «Aprobado».
//
// Modo CONTROL (C12_CONTROL=1, contra la base v1001): reproduce el
// comportamiento ANTERIOR (approved en todo) — las aserciones de
// integración se invierten y tienen que pasar contra el bug.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.C12_CONTROL === '1';
const PORT = 35112;
const BASE = `http://127.0.0.1:${PORT}`;
const TRIAL_TEST_KEY = 'test-c12-suite';
const tmpDir = '/tmp/c12-suite-' + process.pid;
const BUILD_ESPERADO = CONTROL ? 'v1001' : 'v1004';
const ENGINE = require(path.join(ROOT, 'demo')).DEMO_ENGINE_V;

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + extra : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);

// ---------- Parte A: estática ----------
{
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  t('A1 BUILD del árbol', src.includes(`const BUILD_ID = '20261105-${BUILD_ESPERADO}';`));
  if (!CONTROL) {
    t('A2 importTrialWeek resuelve is_guest para la señal',
      /let trialSignal = 'approved';[\s\S]{0,700}gu\.is_guest\) \{ trialSignal = 'auto'; trialSignalAuto = 1; \}/.test(src));
    t('A3 el INSERT de señales escribe client_signal/auto_signal computados',
      src.includes('client_signal, week_key, updated_at, style_code, tipo, auto_signal)') &&
      src.includes("trialSignal, '', styleCode, String(dpost.kind || ''), trialSignalAuto)"));
    t('A4 scheduleAllDrafts: rama invitado approval=auto SIN approved_at',
      src.includes("approval='auto', error='', notified=0, auto_published=1 WHERE id=?"));
    t('A5 scheduleAllDrafts: rama registrada histórica intacta',
      src.includes("approval='approved', approved_at=datetime('now'), error='', notified=0, auto_published=1 WHERE id=?"));
    t('A6 scheduleAllDrafts resuelve is_guest del uid',
      /sadEsInvitado = !!\(guS && guS\.is_guest\)/.test(src));
    t('A6b recordAutoSignal: señal del sistema (auto + auto_signal=1)',
      /function recordAutoSignal\(userId, post\)/.test(src) && src.includes("client_signal='auto', caption=excluded.caption"));
    t('A6c scheduleDraftsPerWeek ramifica la señal por opts y el embudo la pasa',
      src.includes('function scheduleDraftsPerWeek(uid, drafts, apply, opts)') &&
      src.includes("opts.signal === 'auto'") &&
      src.includes("{ signal: sadEsInvitado ? 'auto' : 'approved' }"));
    const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    const iSale = app.indexOf('Sale solo a las');
    const iSalio = app.indexOf('Salió solo (no lo viste a tiempo)');
    t('A7 apvPill: rama programado+auto («Sale solo») ANTES de la genérica',
      iSale > 0 && iSalio > iSale && app.includes("ap === 'auto' && st === 'scheduled'"));
    const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    t('A8 index ES sirve app.js?v=693', idx.includes('app.js?v=693'));
  }
}

// ---------- Parte B: apvPill en VM (la píldora del detalle) ----------
{
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  function extractFn(srcText, name) {
    const i = srcText.indexOf('function ' + name + '(');
    if (i < 0) return '';
    let depth = 0, j = srcText.indexOf('{', i);
    const start = j;
    for (; j < srcText.length; j++) {
      if (srcText[j] === '{') depth++;
      else if (srcText[j] === '}') { depth--; if (!depth) return srcText.slice(i, j + 1); }
    }
    return '';
  }
  const sbx = {
    console,
    apvTz: () => 'America/Argentina/Buenos_Aires',
    apvHM: () => '19:00',
    apvCountdown: () => 'en 2 h',
    humanError: (e) => e || '',
    esc: (s) => String(s),
    pzIc: () => '',
  };
  vm.createContext(sbx);
  const code = extractFn(appJs, 'pzIsPubReal') + '\n' + extractFn(appJs, 'apvPill') + '\nthis.__pill = apvPill;';
  let pill = null;
  try { vm.runInContext(code, sbx); pill = sbx.__pill; } catch (e) {}
  t('B0 apvPill se extrae y corre', typeof pill === 'function');
  if (pill) {
    const D = new Date('2026-11-13T22:00:00Z');
    const sched = { status: 'scheduled', scheduled_at: '2026-11-13 22:00:00' };
    const hAuto = pill({ ...sched, approval: 'auto' }, D, true);
    if (!CONTROL) {
      t('B1 programado+auto → «Sale solo a las 19:00»', has(hAuto, 'Sale solo a las 19:00'), hAuto);
      t('B2 programado+auto → NUNCA «Salió solo»', !has(hAuto, 'Salió solo'), hAuto);
      t('B3 programado+auto → NUNCA «Aprobado»', !has(hAuto, 'Aprobado'), hAuto);
      const hAutoSinFecha = pill({ ...sched, approval: 'auto' }, new Date(NaN), false);
      t('B4 programado+auto sin fecha → «Sale solo» sin hora', has(hAutoSinFecha, 'Sale solo') && !has(hAutoSinFecha, 'Salió solo'), hAutoSinFecha);
    } else {
      t('B1c CONTROL programado+auto → el bug: «Salió solo» en pasado', has(hAuto, 'Salió solo'), hAuto);
    }
    const hAppr = pill({ ...sched, approval: 'approved' }, D, true);
    t('B5 programado+approved → «Aprobado — sale a las 19:00» (registrado intacto)', has(hAppr, 'Aprobado — sale a las 19:00'), hAppr);
    const hPend = pill({ ...sched, approval: 'pending' }, D, true);
    t('B6 programado+pending → «Pendiente»', has(hPend, 'Pendiente') && !has(hPend, 'Aprobado'), hPend);
    const hHist = pill({ status: 'publishing', approval: 'auto' }, D, true);
    t('B7 no-programado+auto → historial «Salió solo» intacto', has(hHist, 'Salió solo'), hHist);
  }
}

// ---------- Parte C: integración (guest/start + register reales) ----------
function imgDataUri() {
  const buf = fs.readFileSync(path.join(ROOT, 'public', 'siembra-nails', 'tira-nails-1.jpg'));
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
function payloadFor(ig, business, captions) {
  const img = imgDataUri();
  const posts = captions.map((caption, i) => ({
    type: 'image', image: img, caption, hashtags: '#c12 #suite',
    headline: ['Uno', 'Dos', 'Tres'][i % 3], style: 'foto', style_name: 'foto', text_mode: 'text',
  }));
  return {
    ok: true, engine: ENGINE, lang: 'en', business, ig, category: 'sneakers',
    posts,
    design: { posts: posts.map((pp) => ({ headline: pp.headline, style: 'foto', kind: 'foto' })) },
    digest: { business, productos: [{ nombre: 'Esplar' }], servicios: [], ciudad: '' },
    content_lang: 'en',
  };
}
const CAPS = [
  'Esplar sneakers, handcrafted with organic cotton and wild rubber from the Amazon rainforest, made to last for years of daily wear.',
  'Our Esplar line pairs chrome-free leather with a recycled lining: a quiet design that goes with everything you already own.',
  'Small steps, honest materials. The Esplar is stitched by people who sign their work, in sizes for the whole family.',
];
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function seed(ig, payload) {
  const db = dbOpen();
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function cookieOf(res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-c12', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t('C0 server booteó', up, log.slice(-400));
    if (!up) return;

    // --- Invitado: la prueba completa por guest/start ---
    seed('invitadoc12', payloadFor('invitadoc12', 'Veja Suite', CAPS));
    const rG = await fetch(BASE + '/api/guest/start?test_key=' + TRIAL_TEST_KEY, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ig: 'invitadoc12', lang: 'en' }),
    });
    const jG = await rG.json().catch(() => ({}));
    t('C1 guest/start ok con 3 posteos programados', rG.status === 200 && jG.posts === 3 && jG.scheduled === 3, JSON.stringify(jG).slice(0, 200));
    const cookieG = cookieOf(rG);
    const db = dbOpen();
    const gUser = db.prepare('SELECT id, is_guest FROM users WHERE guest_ig = ?').get('invitadoc12');
    t('C2 el dueño es invitado (is_guest=1)', !!(gUser && gUser.is_guest === 1), JSON.stringify(gUser));
    const posts = db.prepare('SELECT status, approval, approved_at, auto_published FROM posts WHERE user_id = ? ORDER BY id').all(gUser.id);
    const sigs = db.prepare('SELECT client_signal, auto_signal FROM post_signals WHERE user_id = ? ORDER BY post_id').all(gUser.id);
    t('C3 3 posteos, todos scheduled', posts.length === 3 && posts.every((p) => p.status === 'scheduled'), JSON.stringify(posts));
    t('C4 auto_published=1 en los 3 (lo programó el sistema, ambos modos)', posts.every((p) => p.auto_published === 1), JSON.stringify(posts));
    if (!CONTROL) {
      t('C5 approval=auto en los 3 (nadie aprobó)', posts.every((p) => p.approval === 'auto'), JSON.stringify(posts));
      t('C6 approved_at vacío en los 3', posts.every((p) => !p.approved_at), JSON.stringify(posts));
      t('C7 señales: 3 × client_signal=auto con auto_signal=1',
        sigs.length === 3 && sigs.every((s) => s.client_signal === 'auto' && s.auto_signal === 1), JSON.stringify(sigs));
    } else {
      t('C5c CONTROL approval=approved (el bug)', posts.every((p) => p.approval === 'approved'), JSON.stringify(posts));
      t('C6c CONTROL approved_at estampado (el bug)', posts.every((p) => !!p.approved_at), JSON.stringify(posts));
      t('C7c CONTROL señales: 3 × approved con auto_signal=0 (el bug)',
        sigs.length === 3 && sigs.every((s) => s.client_signal === 'approved' && s.auto_signal === 0), JSON.stringify(sigs));
    }
    // La métrica real del producto: approval_rate de launch-analytics.
    const la = require(path.join(ROOT, 'launch-analytics'));
    const sig = la.accountSignals(db, gUser.id, 30);
    if (!CONTROL) {
      t('C8 approval_rate: 0 aprobaciones del cliente, rate null (sin decisiones)',
        sig.approved === 0 && sig.approval_rate === null, JSON.stringify(sig));
    } else {
      t('C8c CONTROL approval_rate: 3 «aprobadas», rate 100 (el bug)',
        sig.approved === 3 && sig.approval_rate === 100, JSON.stringify(sig));
    }
    // La superficie que alimenta la píldora del detalle.
    const rP = await fetch(BASE + '/api/posts', { headers: { cookie: cookieG } });
    const jP = await rP.json().catch(() => ({}));
    const list = Array.isArray(jP) ? jP : (jP.posts || []);
    const trialPosts = list.filter((p) => p.source === 'trial');
    if (!CONTROL) {
      t('C9 GET /api/posts expone approval=auto al invitado',
        trialPosts.length === 3 && trialPosts.every((p) => p.approval === 'auto'), JSON.stringify(trialPosts.map((p) => p.approval)));
    } else {
      t('C9c CONTROL GET /api/posts expone approval=approved',
        trialPosts.length === 3 && trialPosts.every((p) => p.approval === 'approved'), JSON.stringify(trialPosts.map((p) => p.approval)));
    }
    db.close();

    // --- Registrado: la importación por alta NO cambia ---
    seed('registradoc12', payloadFor('registradoc12', 'Veja Suite', CAPS));
    const rR = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'registrado-c12@example.com', password: 'secreto1', trial_ig: 'registradoc12' }),
    });
    t('C10 register ok', rR.status === 200 || rR.status === 201, 'status ' + rR.status);
    const db2 = dbOpen();
    const rUser = db2.prepare('SELECT id, is_guest FROM users WHERE email = ?').get('registrado-c12@example.com');
    const sigsR = rUser ? db2.prepare('SELECT client_signal, auto_signal FROM post_signals WHERE user_id = ? ORDER BY post_id').all(rUser.id) : [];
    t('C11 el registrado NO es invitado', !!(rUser && rUser.is_guest === 0), JSON.stringify(rUser));
    t('C12 señales del registrado: approved con auto_signal=0 (histórico intacto, ambos modos)',
      sigsR.length === 3 && sigsR.every((s) => s.client_signal === 'approved' && s.auto_signal === 0), JSON.stringify(sigsR));
    db2.close();
  } finally {
    try { process.kill(srv.pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(srv.pid, 'SIGKILL'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${CONTROL ? 'CONTROL' : 'RELEASE'}: ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
