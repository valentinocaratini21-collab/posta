// test-lote-porque-ajeno.js — LOTE PORQUE-AJENO: el «Por qué» de un
// posteo nunca es de otro. Diagnóstico (captura del dueño 20/11): el
// detalle del posteo 696 (zapatillas, cuenta 12) mostraba «Porque
// muestra The Portrait Coffee Collection…» — la estrella del
// fundamento vidriera de café estampada en una pieza de otro producto.
// Mecanismo: whyForPost caía al ancla del digest (productos[0]) cuando
// el posteo no traía ancla propia, y el backfill de GET /api/posts lo
// persistía sin la guarda sinMuestra para todo origen != trial.
//
// El lote:
//  1) RAÍZ (analysis-engine): «muestra X» solo con ancla PROPIA del
//     posteo y sin sinMuestra del llamador; el fallback al digest muere.
//  2) BACKFILL (GET /api/posts): sinMuestra SIEMPRE (en tiempo de
//     lectura no hay evidencia foto↔producto persistida para nadie).
//  3) FRENO (proyección de GET /api/posts): un strategy_why guardado
//     que afirma «muestra <ancla>» con ancla ajena a los campos
//     propios del posteo (source_topic · rg_producto · caption) viaja
//     VACÍO en el payload; la fila no se toca.
//  4) PASADA (admin, una vez): POST /api/admin/posts/reparar-porque-ajeno
//     — dry-run por defecto con el conteo exacto; {dry_run:false}
//     recomputa con el whyForPost corregido o vacía.
//
// Modo CONTROL (PQA_CONTROL=1, correr dentro del árbol base v1197):
// reproduce el bug (U1, backfill y proyección) y la ausencia de la
// pasada (404).
// Uso: node test-lote-porque-ajeno.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.PQA_CONTROL === '1';
const PORT = 35161;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = '/tmp/pqa-suite-' + process.pid;
const analysisEngine = require(path.join(ROOT, 'analysis-engine'));
const clientDigest = require(path.join(ROOT, 'client-digest'));

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + extra : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);

const DIGEST_CAFE = { business: 'Casa QA', rubro: 'cafeteria', productos: [{ nombre: 'The Portrait Coffee Collection' }], servicios: [], ciudad: '' };
const DIRTY_ES = 'Porque muestra The Portrait Coffee Collection, uno de los fuertes de tu negocio, con tu línea visual.';
const DIRTY_EN = 'Because it shows The Portrait Coffee Collection, one of your business strengths, in your visual line.';
const WHY_ESPLAR = 'Porque muestra Esplar, uno de los fuertes de tu negocio, con tu línea visual.';

// ---------- Parte U: whyForPost en unidad ----------
{
  const anEs = { lang: 'es', findings: [] };
  const anEn = { lang: 'en', findings: [] };
  const wSin = analysisEngine.whyForPost({ tipo: 'promo' }, anEs, DIGEST_CAFE, {});
  const wAnchor = analysisEngine.whyForPost({ tipo: 'promo', anchor: 'Esplar' }, anEn, DIGEST_CAFE, {});
  const wTopic = analysisEngine.whyForPost({ tipo: 'promo', source_topic: 'Esplar' }, anEs, DIGEST_CAFE, {});
  const wGuard = analysisEngine.whyForPost({ tipo: 'promo', anchor: 'Esplar' }, anEs, DIGEST_CAFE, { sinMuestra: true });
  const wPhoto = analysisEngine.whyForPost({ tipo: 'promo', photo_product: 'Esplar' }, anEs, DIGEST_CAFE, {});
  if (!CONTROL) {
    t('U1 sin ancla propia: NO afirma «muestra» ni nombra el producto del digest',
      !/muestra/i.test(String(wSin || '')) && !has(wSin, 'Portrait Coffee') && has(wSin, 'semana pensada como un todo'), wSin);
    t('U2 ancla propia (anchor, EN): afirma «shows Esplar»',
      has(wAnchor, 'Because it shows Esplar'), wAnchor);
    t('U3 ancla propia (source_topic, ES): afirma «muestra Esplar», no el café',
      has(wTopic, 'Porque muestra Esplar') && !has(wTopic, 'Portrait'), wTopic);
    t('U5 ancla propia (photo_product): afirma «muestra Esplar»',
      has(wPhoto, 'Porque muestra Esplar'), wPhoto);
  } else {
    t('U1c CONTROL sin ancla propia: cae al digest y afirma el café (el bug)',
      has(wSin, 'Porque muestra The Portrait Coffee Collection'), wSin);
  }
  t('U4 sinMuestra suprime el claim aun con ancla propia (ambos modos)',
    !/muestra/i.test(String(wGuard || '')), wGuard);
}

// ---------- Parte B: boot real + siembra del caso del dueño ----------
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function cookieOf(res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-pqa', SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const srvPid = srv.pid;
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t('B0 server booteó', up, log.slice(-400));
    if (!up) return;

    const rReg = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'pqa@example.com', password: 'secreto1' }),
    });
    const cookie = cookieOf(rReg);
    t('B0b registro ok', rReg.status === 200 || rReg.status === 201, String(rReg.status));

    const db = dbOpen();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('pqa@example.com');
    const uid = user.id;
    clientDigest.saveDigest(db, uid, DIGEST_CAFE);
    const dg = clientDigest.getDigest(db, uid);
    t('B0c fundamento sembrado: productos[0] es la colección de café',
      !!(dg && dg.productos && dg.productos[0] && (dg.productos[0].nombre || dg.productos[0]) === 'The Portrait Coffee Collection'),
      JSON.stringify(dg && dg.productos));

    const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, scheduled_at, approval, source, source_topic, rg_producto, strategy_why, needs_review)
      VALUES (?, '/media/pqa.jpg', ?, '#pqa', ?, 'image', 'foto', ?, 'auto', '', ?, ?, ?, 0)`);
    const P = {};
    P.p1 = ins.run(uid, 'Zapatillas Volt: la suela que se siente en cada paso.', 'draft', null, '', '', '').lastInsertRowid;
    P.p2 = ins.run(uid, 'Esplar en canvas orgánico, recién llegada.', 'scheduled', '2027-01-05 19:00:00', 'Esplar', '', '').lastInsertRowid;
    P.p3 = ins.run(uid, 'Así queda un posteo de zapatillas cuando lo hace posty.', 'published', '2026-11-16 19:00:00', '', '', DIRTY_ES).lastInsertRowid;
    P.p4 = ins.run(uid, 'Esplar, nuestra zapatilla de canvas de todos los días.', 'published', '2026-11-15 19:00:00', 'Esplar', '', WHY_ESPLAR).lastInsertRowid;
    P.p5 = ins.run(uid, 'Sneakers drop of the week.', 'draft', null, '', '', DIRTY_EN).lastInsertRowid;
    P.p6 = ins.run(uid, 'Pastelería de la casa: tortas por encargo para el finde.', 'published', '2026-11-14 19:00:00', '', '', DIRTY_ES).lastInsertRowid;
    P.p7 = ins.run(uid, 'Lo nuevo de la semana en el local.', 'draft', null, '', '', 'Porque forma parte de una semana pensada como un todo: cada pieza cumple un rol distinto en tu grilla.').lastInsertRowid;
    P.p8 = ins.run(uid, 'La Esplar volvió en todos los talles.', 'scheduled', '2027-01-06 19:00:00', '', '', WHY_ESPLAR).lastInsertRowid;
    db.close();

    const rPosts = await fetch(BASE + '/api/posts', { headers: { cookie } });
    const jPosts = await rPosts.json().catch(() => ([]));
    const byId = {};
    (Array.isArray(jPosts) ? jPosts : []).forEach((p) => { byId[p.id] = p; });
    t('B1 GET /api/posts trae los 8 posteos sembrados',
      [P.p1, P.p2, P.p3, P.p4, P.p5, P.p6, P.p7, P.p8].every((id) => byId[id]),
      JSON.stringify(Object.keys(byId)));

    const dbR = dbOpen();
    const dbWhy = (id) => (dbR.prepare('SELECT strategy_why FROM posts WHERE id = ?').get(id) || {}).strategy_why || '';
    if (!CONTROL) {
      // (i) el caso del dueño por el backfill: fundamento cafetero +
      // posteo de zapatillas sin ancla → porqué honesto, sin el café.
      t('B2 (i) backfill: el posteo de zapatillas ya NO nombra el café (payload)',
        !!byId[P.p1] && !has(byId[P.p1].strategy_why, 'Portrait') && !/muestra/i.test(String(byId[P.p1].strategy_why || '')) && has(byId[P.p1].strategy_why, 'semana pensada como un todo'),
        byId[P.p1] && byId[P.p1].strategy_why);
      t('B2b (i) backfill: el porqué honesto quedó PERSISTIDO (no el claim)',
        !has(dbWhy(P.p1), 'Portrait') && has(dbWhy(P.p1), 'semana pensada como un todo'), dbWhy(P.p1));
      t('B3 backfill fail-closed universal: ni con topic propio afirma «muestra» en tiempo de lectura',
        !!byId[P.p2] && !/muestra/i.test(String(byId[P.p2].strategy_why || '')), byId[P.p2] && byId[P.p2].strategy_why);
      // (iii) fila sucia sembrada a mano: el freno la proyecta vacía,
      // el dato no se toca.
      t('B4 (iii) FRENO: la fila sucia publicada viaja VACÍA en el payload',
        !!byId[P.p3] && byId[P.p3].strategy_why === '', byId[P.p3] && byId[P.p3].strategy_why);
      t('B4b (iii) FRENO: la fila en la base sigue sucia (proyección, no escritura)',
        dbWhy(P.p3) === DIRTY_ES, dbWhy(P.p3));
      // (ii) ancla propia verdadera: el porqué «muestra» se conserva.
      t('B5 (ii) el posteo con ancla propia (source_topic) conserva su «muestra Esplar»',
        !!byId[P.p4] && byId[P.p4].strategy_why === WHY_ESPLAR, byId[P.p4] && byId[P.p4].strategy_why);
      t('B6 el posteo con ancla en su caption conserva su «muestra Esplar»',
        !!byId[P.p8] && byId[P.p8].strategy_why === WHY_ESPLAR, byId[P.p8] && byId[P.p8].strategy_why);
    } else {
      t('B2c CONTROL backfill viejo: el posteo de zapatillas recibe el café del digest (el bug)',
        !!byId[P.p1] && has(byId[P.p1].strategy_why, 'Porque muestra The Portrait Coffee Collection'),
        byId[P.p1] && byId[P.p1].strategy_why);
      t('B4c CONTROL sin freno: la fila sucia publicada se pinta tal cual (el bug)',
        !!byId[P.p3] && byId[P.p3].strategy_why === DIRTY_ES, byId[P.p3] && byId[P.p3].strategy_why);
    }
    dbR.close();

    // ---------- Parte R: la pasada de reparación ----------
    const rNoTok = await fetch(BASE + '/api/admin/posts/reparar-porque-ajeno', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    if (!CONTROL) {
      t('R1 la pasada exige token admin (403 sin token)', rNoTok.status === 403, String(rNoTok.status));
      const rDry = await fetch(BASE + '/api/admin/posts/reparar-porque-ajeno?token=adm-pqa', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
      const jDry = await rDry.json().catch(() => ({}));
      t('R2 (iv) DRY-RUN: cuenta exacto — 5 candidatas con firma, 3 sucias (p3, p5, p6)',
        rDry.status === 200 && jDry.ok === true && jDry.dry_run === true && jDry.candidatas === 5 && jDry.sucias === 3 &&
        [P.p3, P.p5, P.p6].every((id) => (jDry.muestra_ids || []).includes(Number(id))) &&
        jDry.por_estado && jDry.por_estado.published === 2 && jDry.por_estado.draft === 1,
        JSON.stringify(jDry));
      const dbD = dbOpen();
      t('R2b (iv) DRY-RUN no escribe nada: p3 sigue sucia en la base',
        ((dbD.prepare('SELECT strategy_why FROM posts WHERE id = ?').get(P.p3) || {}).strategy_why || '') === DIRTY_ES);
      dbD.close();
      const rExe = await fetch(BASE + '/api/admin/posts/reparar-porque-ajeno?token=adm-pqa', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dry_run: false }),
      });
      const jExe = await rExe.json().catch(() => ({}));
      t('R3 ejecución: 3 filas tocadas (recomputadas o vaciadas)',
        rExe.status === 200 && jExe.ok === true && jExe.dry_run === false && jExe.ejecutado && jExe.ejecutado.total === 3 &&
        (jExe.ejecutado.recomputadas + jExe.ejecutado.vaciadas) === 3,
        JSON.stringify(jExe));
      const dbE = dbOpen();
      const w = (id) => (dbE.prepare('SELECT strategy_why FROM posts WHERE id = ?').get(id) || {}).strategy_why || '';
      t('R4 las sucias ya no llevan la firma ajena (p3, p5, p6)',
        !has(w(P.p3), 'Portrait') && !has(w(P.p5), 'Portrait') && !has(w(P.p6), 'Portrait'),
        JSON.stringify([w(P.p3), w(P.p5), w(P.p6)]));
      t('R5 las limpias quedan intactas (p4 y p8 con su «muestra Esplar», p7 con su línea honesta)',
        w(P.p4) === WHY_ESPLAR && w(P.p8) === WHY_ESPLAR && has(w(P.p7), 'semana pensada como un todo'),
        JSON.stringify([w(P.p4), w(P.p8), w(P.p7)]));
      dbE.close();
      const rDry2 = await fetch(BASE + '/api/admin/posts/reparar-porque-ajeno?token=adm-pqa', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
      const jDry2 = await rDry2.json().catch(() => ({}));
      t('R6 segundo DRY-RUN: 0 sucias (quedan solo las 2 candidatas que sí corresponden)',
        jDry2.sucias === 0 && jDry2.candidatas === 2, JSON.stringify(jDry2));
    } else {
      t('R1c CONTROL: la pasada no existe en el árbol base (404)',
        rNoTok.status === 404, String(rNoTok.status));
    }
  } finally {
    try { process.kill(srvPid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(srvPid, 'SIGKILL'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${CONTROL ? 'CONTROL' : 'RELEASE'}: ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
