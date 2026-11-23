// test-lote-campana-limpiable.js — Suite del lote CAMPANA-LIMPIABLE
// (2026-11-23): «la campana se limpia con la mano del dueño».
// El defecto (captura del dueño, cuenta de la casa, 23/11 01:00): la
// campana clavada en 1 sin forma de sacarla, y bajo «ESPERA TU
// TOQUE» una tarjeta «0 respuestas listas».
//   A · Estática: el conteo accionable, la marca de lectura de las
//       novedades, la ruta nueva y la pintura del cliente + gate M78.
//   B · Módulo bandeja.js: EL CASO DE LA CAPTURA sembrado tal cual
//       (casa: 1 DM bloqueado por la ventana de 24 h + la novedad del
//       posteo de hoy sin ver) y sus frenos: el bloqueado no cuenta,
//       la novedad sí hasta que se abre la pantalla, y al marcarla
//       vista el total cae a 0. Más las variantes: DM fresco
//       accionable, ítem esperando un dato (accionable sin ser
//       enviable) y error con nota cruda de ventana.
//   C · Boot real: el circuito entero por HTTP — count, abrir
//       (POST vistas), count de nuevo en 0.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isoHace = (ms) => new Date(Date.now() - ms).toISOString();
const sqlHace = (ms) => isoHace(ms).replace('T', ' ').slice(0, 19);
const sqlAhora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const bj = read('bandeja.js');
  const srv = read('server.js');
  const app = read('public/app.js');
  ok('A1 countAcciones cuenta solo lo accionable (filtra por motivoBloqueo, no el estado crudo)',
    bj.includes('function countAcciones') && bj.includes('!motivoBloqueo(it, now)')
    && !bj.includes("SELECT COUNT(*) AS n FROM bandeja_items WHERE user_id = ? AND estado IN ('pendiente','sin_permiso','error')"));
  ok('A2 el conteo de la tanda sirve accionables (sin bloqueo terminal)',
    bj.includes('accionables: pend.filter(i => !i.bloqueo_motivo).length'));
  ok('A3 la marca de lectura existe: tabla bandeja_novedades_vistas + marcarNovedadesVistas + conteoCampana',
    bj.includes('CREATE TABLE IF NOT EXISTS bandeja_novedades_vistas')
    && bj.includes('function marcarNovedadesVistas') && bj.includes('function conteoCampana')
    && bj.includes('conteoCampana, marcarNovedadesVistas,'));
  ok('A4 las novedades llevan su estado de lectura (vista)',
    bj.includes('vista: parseFechaMs(post.published_at) <= hastaMs') && bj.includes('vista: parseFechaMs(boost.created_at) <= hastaMs'));
  ok('A5 server.js: POST /api/bandeja/novedades/vistas tras requireAuth y /count sirve el total de conteoCampana',
    srv.includes("app.post('/api/bandeja/novedades/vistas', requireAuth") && srv.includes('conteoCampana(db, uid)') && srv.includes('total: c.total'));
  ok('A6 app.js: la insignia pinta el TOTAL (con acciones de respaldo)',
    app.includes("typeof r.total === 'number' ? r.total"));
  ok('A7 app.js: abrir Notificaciones marca las novedades vistas (pzBandejaMarcarVistas desde pzBandejaView)',
    app.includes('function pzBandejaMarcarVistas()') && app.includes("api.post('/api/bandeja/novedades/vistas', {})")
    && /async function pzBandejaView\(\) \{[\s\S]*?pzBandejaMarcarVistas\(\);/.test(app));
  ok('A8 app.js: «ESPERA TU TOQUE» filtra por accionables y la tanda bloqueada tiene su tarjeta tranquila',
    app.includes("typeof c.accionables === 'number' ? c.accionables") && app.includes('function pzBandejaTarjetaBloqueadaHTML(t)')
    && app.includes("pzBandejaT('NO PUEDEN SALIR', 'CANNOT GO OUT')") && !app.includes('filter(t => (t.conteo || {}).pendientes > 0)'));
  ok('A9 app.js: ninguna tarjeta anuncia «0 respuestas listas» (el titular sale de para_salir solo si es > 0)',
    app.includes("c.para_salir ? `${c.para_salir}"));
  const llamadas = ['pzBandejaView', 'pzBandejaNotifsHTML', 'pzBandejaTarjetaHTML', 'pzBandejaTarjetaBloqueadaHTML', 'pzBandejaMarcarVistas', 'pzBandejaAbrir', 'pzBandejaVolver', 'pzBandejaAprobar', 'pzBandejaEditar', 'pzBandejaGuardar', 'pzBandejaDescartar', 'pzBandejaDeshacer', 'pzBandejaRepintar', 'pzCampanaBadgePintar', 'pzCampanaBadgeRefrescar'];
  const definidas = llamadas.filter(fn => new RegExp('(async )?function ' + fn + '\\(').test(app));
  ok(`A10 gate M78 — funciones auditadas: ${definidas.length}/${llamadas.length}`, definidas.length === llamadas.length, 'faltan: ' + llamadas.filter(f => !definidas.includes(f)).join(','));
}

// ---------------------------------------------------------------- B
console.log('\nB · Módulo (el caso de la captura y sus variantes)');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-limpiable-mod-'));
process.env.DATA_DIR = TMPB;
const dbmod = require('./db');
const db = dbmod.db || dbmod;
const B = require('./bandeja');
B.initBandejaTables(db);

function seedUser(email) {
  const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x');
  const uid = Number(r.lastInsertRowid);
  db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username) VALUES (?, 'Posty', 'servicios', 'amable', 'posty.communitymanager')").run(uid);
  db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
  return uid;
}
function seedDm(uid, over) {
  const o = over || {};
  const t = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, etiqueta, notified_at) VALUES (?, ?, 'dm', ?, datetime('now'))")
    .run(uid, o.group || ('dm:CV' + Math.floor(Math.random() * 1e9)), o.etiqueta || '@posty.communitymanager');
  const tid = Number(t.lastInsertRowid);
  const r = db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, falta_dato, note, last_in_at, created_at, updated_at)
    VALUES (?, ?, 'dm', 'CV', 'm1', 'm1', 'vecina_', 'U1', ?, ?, 'normal', ?, ?, ?, ?, ?, ?)`)
    .run(tid, uid, o.text || '¿hacen envíos?', o.draft !== undefined ? o.draft : '¡Hola! Sí, hacemos envíos a todo el país.', o.estado || 'pendiente', o.falta || '', o.note || '', o.lastIn || sqlAhora(), o.creada || sqlAhora(), o.creada || sqlAhora());
  return { tid, iid: Number(r.lastInsertRowid) };
}

// LA CASA, tal cual la captura: un DM bloqueado por la ventana (llegó
// hace 3 días) con su borrador, y el posteo de hoy publicado.
const casa = seedUser('casa@posty.example');
const sCasa = seedDm(casa, { lastIn: sqlHace(3 * 86400000), creada: sqlHace(3 * 86400000) });
db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (?, 'film.jpg', 'Esto es Posty: tus community managers.', 'published', ?)").run(casa, sqlAhora());

{
  const gb = B.getBandeja(db, casa);
  const tanda = (gb.tandas || []).find(t => t.id === sCasa.tid);
  ok('B1 la tanda de la casa: para_salir 0 · bloqueadas 1 · accionables 0 · pendientes 1',
    !!tanda && tanda.conteo.para_salir === 0 && tanda.conteo.bloqueadas === 1 && tanda.conteo.accionables === 0 && tanda.conteo.pendientes === 1,
    JSON.stringify(tanda && tanda.conteo));
  ok('B2 el ítem bloqueado se sirve con su motivo en español (la verdad de v1243 intacta)',
    !!tanda && tanda.items[0].bloqueo_motivo === B.NOTA_VENTANA && tanda.items[0].enviable === false);
  ok('B3 countAcciones de la casa = 0: el bloqueado NO sostiene la campana (el defecto daba 1)',
    B.countAcciones(db, casa) === 0, 'countAcciones=' + B.countAcciones(db, casa));
  const novs = B.novedades(db, casa);
  ok('B4 la novedad del posteo de hoy existe y nace SIN VER', novs.length === 1 && novs[0].tipo === 'posteo' && novs[0].vista === false, JSON.stringify(novs));
  const cc = typeof B.conteoCampana === 'function' ? B.conteoCampana(db, casa) : null;
  ok('B5 el total de la campana arranca en 1 — y ese 1 es la novedad, no el bloqueado',
    !!cc && cc.acciones === 0 && cc.novedades === 1 && cc.total === 1, JSON.stringify(cc));
  const tras = typeof B.marcarNovedadesVistas === 'function' ? B.marcarNovedadesVistas(db, casa) : null;
  ok('B6 abrir la pantalla (marcar vistas) deja el total en 0 EN EL ACTO', !!tras && tras.total === 0 && tras.novedades === 0, JSON.stringify(tras));
  const novs2 = B.novedades(db, casa);
  ok('B7 la novedad queda marcada vista y el conteo se mantiene en 0', novs2.length === 1 && novs2[0].vista === true && !!cc && B.conteoCampana(db, casa).total === 0);
}

// Variante: DM fresco con borrador — accionable de verdad.
const fresco = seedUser('fresco@example');
seedDm(fresco, {});
{
  const gb = B.getBandeja(db, fresco);
  const tanda = (gb.tandas || [])[0];
  ok('B8 el DM fresco cuenta: countAcciones 1 · accionables 1 · para_salir 1',
    B.countAcciones(db, fresco) === 1 && !!tanda && tanda.conteo.accionables === 1 && tanda.conteo.para_salir === 1,
    JSON.stringify(tanda && tanda.conteo));
}

// Variante: ítem esperando un dato (sin borrador, no bloqueado) —
// accionable (el dueño lo escribe) aunque no enviable todavía.
const dato = seedUser('dato@example');
seedDm(dato, { draft: '', falta: 'precio' });
{
  const gb = B.getBandeja(db, dato);
  const tanda = (gb.tandas || [])[0];
  ok('B9 el que espera un dato cuenta como accionable (campana 1) pero no como para_salir',
    B.countAcciones(db, dato) === 1 && !!tanda && tanda.conteo.accionables === 1 && tanda.conteo.para_salir === 0 && tanda.conteo.esperando_dato === 1,
    JSON.stringify(tanda && tanda.conteo));
}

// Variante: error con la nota cruda de ventana de Meta guardada —
// causa terminal por la nota, tampoco cuenta.
const cruda = seedUser('cruda@example');
seedDm(cruda, { estado: 'error', note: 'This message is sent outside of allowed window.' });
{
  ok('B10 el error con nota cruda de ventana tampoco cuenta (causa terminal por la nota)',
    B.countAcciones(db, cruda) === 0, 'countAcciones=' + B.countAcciones(db, cruda));
}

// ---------------------------------------------------------------- C
console.log('\nC · Boot real (el circuito de la campana por HTTP)');
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}
function seedBootDir(dir) {
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const dbm = require(${JSON.stringify(path.join(ROOT, 'db.js'))});
    const db = dbm.db || dbm;
    const bcrypt = require('bcryptjs');
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('dueno@casa.example', bcrypt.hashSync('clave-prueba-1', 10));
    const uid = Number(r.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'Posty', 'servicios', 'amable', 'posty.communitymanager', 1)").run(uid);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
    require(${JSON.stringify(path.join(ROOT, 'bandeja.js'))}).initBandejaTables(db);
    const t = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, etiqueta, notified_at) VALUES (?, 'dm:CV1', 'dm', '@posty.communitymanager', datetime('now'))").run(uid);
    const tid = Number(t.lastInsertRowid);
    db.prepare(\`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, note, last_in_at, created_at, updated_at)
      VALUES (?, ?, 'dm', 'CV1', 'm-old', 'm-old', 'vecina_', 'U777', '¿hacen envíos?', '¡Hola! Sí, hacemos envíos.', 'normal', 'pendiente', '', ?, ?, ?)\`)
      .run(tid, uid, ${JSON.stringify(sqlHace(3 * 86400000))}, ${JSON.stringify(sqlHace(3 * 86400000))}, ${JSON.stringify(sqlHace(3 * 86400000))});
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (?, 'film.jpg', 'Esto es Posty: tus community managers.', 'published', datetime('now'))").run(uid);
    console.log('SEEDED uid=' + uid + ' tanda=' + tid);
  `;
  const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  return out.trim();
}

(async () => {
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-limpiable-boot-'));
  console.log('  seed C:', seedBootDir(dirC));
  const port = 19811 + Math.floor(Math.random() * 60);
  ok('C0 el puerto del boot está libre antes de arrancar', portFree(port));
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dirC, MEDIA_DIR: path.join(dirC, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  proc.stdout.on('data', d => { bootLog += d; });
  proc.stderr.on('data', d => { bootLog += d; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
    ok('C1 el servidor levanta', up, bootLog.slice(-300));
    if (up) {
      const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@casa.example', password: 'clave-prueba-1' }) });
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
      ok('C2 login del dueño', login.ok && !!cookie, 'status=' + login.status);
      const c1 = await (await fetch(base + '/api/bandeja/count', { headers: { Cookie: cookie } })).json();
      ok('C3 count al arrancar: acciones 0 (el bloqueado no cuenta) · novedades 1 · total 1',
        c1.ok === true && c1.acciones === 0 && c1.novedades === 1 && c1.total === 1, JSON.stringify(c1));
      const gb = await (await fetch(base + '/api/bandeja', { headers: { Cookie: cookie } })).json();
      const tanda = (gb.tandas || []).find(t => t.kind === 'dm');
      ok('C4 la bandeja servida: la tanda trae accionables 0 · bloqueadas 1 · el motivo en el ítem · la novedad sin ver',
        !!tanda && tanda.conteo.accionables === 0 && tanda.conteo.bloqueadas === 1 && tanda.items[0].bloqueo_motivo === B.NOTA_VENTANA
        && (gb.novedades || []).length === 1 && gb.novedades[0].vista === false,
        JSON.stringify({ conteo: tanda && tanda.conteo, novs: gb.novedades }));
      const pv = await fetch(base + '/api/bandeja/novedades/vistas', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
      const pvj = await pv.json().catch(() => ({}));
      ok('C5 abrir Notificaciones (POST vistas) responde con el total ya en 0', pv.ok && pvj.ok === true && pvj.total === 0, 'status=' + pv.status + ' ' + JSON.stringify(pvj));
      const c2 = await (await fetch(base + '/api/bandeja/count', { headers: { Cookie: cookie } })).json();
      ok('C6 count después de abrir: total 0 — la campana quedó limpia', c2.ok === true && c2.total === 0 && c2.novedades === 0, JSON.stringify(c2));
      const gb2 = await (await fetch(base + '/api/bandeja', { headers: { Cookie: cookie } })).json();
      ok('C7 la novedad sigue listada, ya marcada vista (se ve, no cuenta)',
        (gb2.novedades || []).length === 1 && gb2.novedades[0].vista === true, JSON.stringify(gb2.novedades));
      const sinSesion = await fetch(base + '/api/bandeja/count');
      ok('C8 sin sesión no hay conteo del dueño', sinSesion.status === 401, 'status=' + sinSesion.status);
    }
  } finally {
    try { proc.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { proc.kill('SIGKILL'); } catch (e) {}
  }
  console.log(`\nRESULTADO: ${pass} ok · ${fail} MAL`);
  if (fails.length) { console.log('FALLAS:\n - ' + fails.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})();
