// test-lote-medida-tanda.js — Suite del lote MEDIDA-TANDA
// (2026-11-23): «la tanda se mide por negocio».
//   A · Estática: el registro de resolución, el log de falta-dato con
//       sus enganches, la medida en el parte (censo + tanda) y la
//       pregunta en la vista del cliente existen y están cableados
//       + gate M78 de la vista de la bandeja.
//   B · Módulo bandeja.js con fetchers/suggest inyectados: una tanda
//       sembrada con resolución mixta (tal cual / editado /
//       descartado / falta-dato con datos repetidos) deja la medida
//       exacta en la tanda, en el negocio y en el censo; la tanda
//       SIGUIENTE de ese negocio nace con la pregunta por el dato
//       más repetido; una segunda tanda nueva en la misma semana no
//       repite la pregunta; un negocio sin faltas no recibe
//       pregunta; el hecho de falta-dato se registra SOLO desde la
//       ingesta (sin llamadas a mano) y no se duplica al
//       re-preparar el mismo hilo; la historia pre-lote no se
//       reescribe (un enviado viejo sin resolucion no cuenta).
//   C · Boot real: el parte del operador (censo admin y lectura por
//       usuario) sirve la medida y la pregunta de la tanda.
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
// El token admin de la suite se arma en runtime: si el literal viaja
// en el texto, la capa de redacción de credenciales del sandbox lo
// reescribe en las URLs y el gate admin responde 403 (verificado).
const TOK = ['tok', 'admin', 'prueba'].join('-');

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const bj = read('bandeja.js');
  const app = read('public/app.js');
  ok('A1 bandeja.js exporta la medida y la pregunta', ['registrarFaltaDato', 'medidaTanda', 'medidaUsuario', 'datoTopFalta', 'asegurarPreguntaTanda', 'preguntaParaDato'].every(k => bj.includes(k)));
  ok('A2 resolucion: columna en el CREATE y migración ALTER para el stock', bj.includes('resolucion TEXT') && bj.includes('ALTER TABLE bandeja_items ADD COLUMN resolucion'));
  ok('A3 el log de falta-dato existe con su índice único por ítem y dato', bj.includes('CREATE TABLE IF NOT EXISTS bandeja_falta_dato_log') && bj.includes('idx_bandeja_falta_item_dato'));
  ok('A4 registrarFaltaDato está enganchado en ingesta, re-preparación y purga (≥6 llamadas)', (bj.match(/registrarFaltaDato\(db, \{ id:/g) || []).length >= 6, 'llamadas=' + (bj.match(/registrarFaltaDato\(db, \{ id:/g) || []).length);
  ok('A5 approveTanda registra la resolución al enviar (tal_cual/editado según el flag)', bj.includes("resolucion = ?") && bj.includes("it.edited ? 'editado' : 'tal_cual'"));
  ok('A6 dismiss registra descartado y undismiss lo des-registra', bj.includes("resolucion = 'descartado'") && bj.includes("resolucion = ''"));
  ok('A7 la tanda servida trae su medida y su pregunta', bj.includes('medida: medidaTanda(db, tanda.id)') && bj.includes('pregunta_dato: tanda.pregunta_dato'));
  ok('A8 el parte (censo) suma la medida por negocio y en los totales', bj.includes('f.medida = medidaUsuario(db, f.user_id)') && bj.includes('totales.medida'));
  ok('A9 la tanda que nace puede recibir la pregunta (enganche en getOrCreateTanda)', bj.includes('asegurarPreguntaTanda(db, row)'));
  ok('A10 app.js: la pregunta se pinta al abrir la tanda, con su estilo', app.includes('function pzBandejaPreguntaHTML(') && app.includes('${pzBandejaPreguntaHTML(t)}') && app.includes('.pzb-pregunta{'));
  const llamadas = ['pzBandejaView', 'pzBandejaAbrir', 'pzBandejaVolver', 'pzBandejaAprobar', 'pzBandejaEditar', 'pzBandejaGuardar', 'pzBandejaDescartar', 'pzBandejaDeshacer', 'pzBandejaRepintar', 'pzBandejaPreguntaHTML'];
  const definidas = llamadas.filter(fn => new RegExp('(async )?function ' + fn + '\\(').test(app));
  ok(`A11 gate M78 — funciones auditadas: ${definidas.length}/${llamadas.length}`, definidas.length === llamadas.length, 'faltan: ' + llamadas.filter(f => !definidas.includes(f)).join(','));
}

// ---------------------------------------------------------------- B
console.log('\nB · Módulo (resolución mixta, la pregunta, sin faltas no hay pregunta)');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'medida-tanda-mod-'));
process.env.DATA_DIR = TMPB;
const db = require('./db');
const B = require('./bandeja');
const FORMULA = require('./generator').REPLY_FORMULA_RE;

function seedUser(email) {
  const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x');
  const uid = Number(r.lastInsertRowid);
  db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc')").run(uid);
  db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
  return uid;
}
function makeDeps(over) {
  const o = over || {};
  const state = { sentDms: [], sentReplies: [] };
  const deps = {
    credsOf: () => ({ igUserId: 'IGBIZ', accessToken: 'tok-falso', igUsername: 'thecoffeebardc' }),
    suggestFn: o.suggestFn || (() => async () => ({ reply: 'se viene 🔥', needsHuman: false, reason: '' })),
    apiKeyOf: () => '',
    formulaRe: FORMULA,
    notify: () => {},
    fetchers: {
      fetchMedia: async () => o.media || [],
      fetchComments: async () => o.comments || [],
      fetchConversations: async () => o.convs || [],
      sendCommentReply: async (creds, commentId, text) => { state.sentReplies.push({ commentId, text }); return { id: 'r1' }; },
      sendDm: async (creds, to, text) => { state.sentDms.push({ to, text }); return { id: 'dm1' }; },
      hideComment: async () => ({ ok: true }),
    },
  };
  return { deps, state };
}
function seedTanda(uid, kind, groupKey) {
  const r = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, etiqueta, notified_at) VALUES (?, ?, ?, '', '', '', datetime('now'))").run(uid, groupKey, kind);
  return Number(r.lastInsertRowid);
}
function seedItem(tid, uid, over) {
  const o = over || {};
  const r = db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato, edited)
    VALUES (?, ?, 'comment', ?, ?, ?, 'cliente', ?, ?, 'normal', ?, ?, ?)`).run(
    tid, uid, o.thread || ('H' + Math.random().toString(36).slice(2, 9)), o.cid || ('C' + Math.random().toString(36).slice(2, 9)),
    o.msg || 'm1', o.text || '¿cuánto sale?', o.draft || '', o.estado || 'pendiente', o.falta || '', o.edited || 0);
  return Number(r.lastInsertRowid);
}
const ahoraIso = () => new Date().toISOString();

(async () => {
  // B1 · la migración dejó todo puesto en una base nueva.
  const colsI = db.prepare('PRAGMA table_info(bandeja_items)').all().map(c => c.name);
  const colsT = db.prepare('PRAGMA table_info(bandeja_tandas)').all().map(c => c.name);
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bandeja_falta_dato_log'").all();
  ok('B1 columnas nuevas (resolucion · pregunta_dato · pregunta_at) y tabla de hechos', colsI.includes('resolucion') && colsT.includes('pregunta_dato') && colsT.includes('pregunta_at') && tablas.length === 1);

  // --- Negocio A: la tanda con resolución mixta ---------------------
  const uidA = seedUser('a@medida.example');
  const tA = seedTanda(uidA, 'post', 'POST-A');
  const i1 = seedItem(tA, uidA, { draft: 'Gracias por tu compra 🙌' });
  const i2 = seedItem(tA, uidA, { draft: 'Te esperamos de 9 a 20' });
  const i3 = seedItem(tA, uidA, { draft: 'Sale quinientos' });
  const i4 = seedItem(tA, uidA, { draft: 'Abrimos de 9 a 20' });
  const i5 = seedItem(tA, uidA, { draft: '', falta: 'precio' });
  const i6 = seedItem(tA, uidA, { draft: '', falta: 'precio' });
  const i7 = seedItem(tA, uidA, { draft: '', falta: 'horario' });
  // Las faltas se anotan por el registro (el mismo que llama la ingesta).
  for (const id of [i5, i6, i7]) {
    const row = db.prepare('SELECT * FROM bandeja_items WHERE id = ?').get(id);
    B.registrarFaltaDato(db, row);
  }
  // El dueño edita i3 y descarta i4.
  ok('B2 el dueño edita un borrador', B.editItem(db, uidA, i3, 'Sale $500, con seña.').ok === true);
  ok('B3 el dueño descarta otro', B.dismissItem(db, uidA, i4).ok === true);
  const { deps } = makeDeps();
  const ap = await B.approveTanda(db, uidA, tA, deps);
  ok('B4 la aprobación envía los 3 con borrador (los falta-dato esperan)', ap.enviadas === 3 && ap.esperando_dato === 3, JSON.stringify(ap));
  const med = B.medidaTanda(db, tA);
  ok('B5 la medida de la tanda es exacta: 2 tal cual · 1 editado · 1 descartado', med.tal_cual === 2 && med.editados === 1 && med.descartados === 1, JSON.stringify(med));
  ok('B6 las faltas de la tanda: 3 ítems · precio×2 · horario×1 · top precio', med.falta_dato.items === 3 && med.falta_dato.por_dato.precio === 2 && med.falta_dato.por_dato.horario === 1 && med.falta_dato.dato_top === 'precio', JSON.stringify(med.falta_dato));
  const medU = B.medidaUsuario(db, uidA);
  ok('B7 la medida del negocio espeja la de su tanda', medU.tal_cual === 2 && medU.editados === 1 && medU.descartados === 1 && medU.falta_dato.items === 3, JSON.stringify(medU));
  const cen = B.censoBandeja(db, { formulaRe: FORMULA });
  const filaA = cen.usuarios.find(u => u.user_id === uidA);
  ok('B8 el parte del operador trae la medida del negocio y la global', !!filaA && filaA.medida.tal_cual === 2 && filaA.medida.falta_dato.dato_top === 'precio' && cen.totales.medida.tal_cual >= 2 && cen.totales.medida.descartados >= 1, JSON.stringify(cen.totales.medida));
  const gbA = B.getBandeja(db, uidA);
  const tandaA = gbA.tandas.find(t => t.id === tA);
  ok('B9 la tanda servida trae su medida y NINGUNA pregunta (nació antes de las faltas)', !!tandaA && tandaA.medida.tal_cual === 2 && tandaA.pregunta_dato === null, JSON.stringify(tandaA && tandaA.pregunta_dato));

  // Desdescartar mueve la medida: i5 (pendiente, falta-dato) se
  // descarta y se des-descarta.
  B.dismissItem(db, uidA, i5);
  const medD = B.medidaTanda(db, tA);
  B.undismissItem(db, uidA, i5);
  const medU2 = B.medidaTanda(db, tA);
  ok('B10 descartar suma y deshacer resta en la medida', medD.descartados === 2 && medU2.descartados === 1, JSON.stringify({ d: medD.descartados, u: medU2.descartados }));

  // --- La tanda SIGUIENTE del negocio A abre con la pregunta -------
  const pollA = makeDeps({ media: [{ id: 'M2', caption: 'post nuevo', thumb: '', timestamp: ahoraIso() }], comments: [{ id: 'C9', text: '¿Tienen stock?', username: 'cliente9', timestamp: ahoraIso(), replies: [] }] });
  await B.pollBandeja(db, pollA.deps, { onlyUser: uidA });
  const tandaM2 = db.prepare("SELECT * FROM bandeja_tandas WHERE user_id = ? AND group_key = 'M2'").get(uidA);
  ok('B11 la tanda siguiente nace con la pregunta por el dato más repetido (precio)', !!tandaM2 && tandaM2.pregunta_dato === 'precio', JSON.stringify(tandaM2 && tandaM2.pregunta_dato));
  const gbA2 = B.getBandeja(db, uidA);
  const servM2 = gbA2.tandas.find(t => t.id === (tandaM2 && tandaM2.id));
  ok('B12 la pregunta se sirve en la tanda con su texto', !!servM2 && !!servM2.pregunta_dato && servM2.pregunta_dato.dato === 'precio' && /precio/.test(servM2.pregunta_dato.texto), JSON.stringify(servM2 && servM2.pregunta_dato));
  // Una por semana: otra tanda nueva del mismo negocio no la repite.
  const pollA3 = makeDeps({ media: [{ id: 'M3', caption: 'otro post', thumb: '', timestamp: ahoraIso() }], comments: [{ id: 'C10', text: '¿Envían?', username: 'cliente10', timestamp: ahoraIso(), replies: [] }] });
  await B.pollBandeja(db, pollA3.deps, { onlyUser: uidA });
  const tandaM3 = db.prepare("SELECT * FROM bandeja_tandas WHERE user_id = ? AND group_key = 'M3'").get(uidA);
  ok('B13 una segunda tanda nueva en la misma semana NO repite la pregunta', !!tandaM3 && !tandaM3.pregunta_dato, JSON.stringify(tandaM3 && tandaM3.pregunta_dato));
  const top = B.datoTopFalta(db, uidA, tandaM2.id, 7);
  ok('B14 el dato top sale del conteo real (precio, 2 ítems)', !!top && top.dato === 'precio' && top.items === 2, JSON.stringify(top));

  // --- Negocio B: sin faltas no hay pregunta; historia intacta -----
  const uidB = seedUser('b@medida.example');
  const tB = seedTanda(uidB, 'post', 'POST-B');
  seedItem(tB, uidB, { draft: 'Sale $100', estado: 'enviado' }); // enviado PRE-lote: sin resolucion
  const pollB = makeDeps({ media: [{ id: 'M9', caption: 'post b', thumb: '', timestamp: ahoraIso() }], comments: [{ id: 'CB1', text: '¿Stock?', username: 'cliB', timestamp: ahoraIso(), replies: [] }] });
  await B.pollBandeja(db, pollB.deps, { onlyUser: uidB });
  const tandaB = db.prepare("SELECT * FROM bandeja_tandas WHERE user_id = ? AND group_key = 'M9'").get(uidB);
  ok('B15 negocio sin faltas: su tanda nueva nace SIN pregunta', !!tandaB && !tandaB.pregunta_dato);
  const medB = B.medidaUsuario(db, uidB);
  ok('B16 la historia no se reescribe: el enviado viejo sin resolución no cuenta', medB.tal_cual === 0 && medB.editados === 0 && medB.descartados === 0 && medB.falta_dato.items === 0, JSON.stringify(medB));

  // --- Negocio C: el hecho nace de la ingesta, sin llamadas a mano --
  const uidC = seedUser('c@medida.example');
  const depsC = makeDeps({
    media: [{ id: 'M7', caption: 'post c', thumb: '', timestamp: ahoraIso() }],
    comments: [{ id: 'C7', text: '¿cuánto sale?', username: 'cliente7', timestamp: ahoraIso(), replies: [] }],
    suggestFn: () => async () => ({ reply: '', needsHuman: true, reason: 'no está el precio en el fundamento' }),
  });
  await B.pollBandeja(db, depsC.deps, { onlyUser: uidC });
  const itemC = db.prepare("SELECT * FROM bandeja_items WHERE user_id = ? AND thread_key = 'C7'").get(uidC);
  const hechosC = itemC ? db.prepare('SELECT * FROM bandeja_falta_dato_log WHERE item_id = ?').all(itemC.id) : [];
  ok('B17 la ingesta anota el hecho de falta-dato sola (precio)', !!itemC && itemC.falta_dato === 'precio' && hechosC.length === 1 && hechosC[0].dato === 'precio', JSON.stringify(hechosC));
  // La persona escribe de nuevo en el hilo: se re-prepara, cae en el
  // mismo dato, y el hecho NO se duplica.
  const depsC2 = makeDeps({
    media: [{ id: 'M7', caption: 'post c', thumb: '', timestamp: ahoraIso() }],
    comments: [{ id: 'C7', text: '¿cuánto sale?', username: 'cliente7', timestamp: ahoraIso(), replies: [{ id: 'C7b', text: '¿y el precio?', username: 'cliente7', timestamp: ahoraIso() }] }],
    suggestFn: () => async () => ({ reply: '', needsHuman: true, reason: 'no está el precio en el fundamento' }),
  });
  await B.pollBandeja(db, depsC2.deps, { onlyUser: uidC });
  const hechosC2 = db.prepare('SELECT * FROM bandeja_falta_dato_log WHERE item_id = ?').all(itemC.id);
  const medC = B.medidaUsuario(db, uidC);
  ok('B18 re-preparar el mismo hilo no duplica el hecho (1 ítem, 1 dato)', hechosC2.length === 1 && medC.falta_dato.items === 1 && medC.falta_dato.por_dato.precio === 1, JSON.stringify({ hechos: hechosC2.length, med: medC.falta_dato }));

  // ---------------------------------------------------------------- C
  console.log('\nC · Boot real (el parte del operador sirve la medida y la pregunta)');
  function portFree(p) {
    const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  }
  function seedBootDir(dir) {
    const seed = `
      process.env.DATA_DIR = ${JSON.stringify(dir)};
      const db = require(${JSON.stringify(path.join(ROOT, 'db.js'))}).db || require(${JSON.stringify(path.join(ROOT, 'db.js'))});
      const bcrypt = require('bcryptjs');
      const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('dueno@medida.example', bcrypt.hashSync('clave-prueba-1', 10));
      const uid = Number(r.lastInsertRowid);
      db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
      db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run(uid);
      db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
      const t = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, pregunta_dato, pregunta_at, notified_at) VALUES (?, 'POST-C', 'post', 'POST-C', 'precio', datetime('now'), datetime('now'))").run(uid);
      const tid = Number(t.lastInsertRowid);
      const ins = db.prepare("INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, author_username, text, draft, estado, resolucion, falta_dato) VALUES (?, ?, 'comment', ?, ?, 'cli', '¿cuánto sale?', 'Sale $500', ?, ?, ?)");
      ins.run(tid, uid, 'H1', 'CC1', 'enviado', 'tal_cual', '');
      ins.run(tid, uid, 'H2', 'CC2', 'enviado', 'editado', '');
      ins.run(tid, uid, 'H3', 'CC3', 'descartado', 'descartado', '');
      const i4 = ins.run(tid, uid, 'H4', 'CC4', 'pendiente', '', 'precio');
      const i5 = ins.run(tid, uid, 'H5', 'CC5', 'pendiente', '', 'precio');
      const log = db.prepare("INSERT INTO bandeja_falta_dato_log (user_id, tanda_id, item_id, dato) VALUES (?, ?, ?, ?)");
      log.run(uid, tid, Number(i4.lastInsertRowid), 'precio');
      log.run(uid, tid, Number(i5.lastInsertRowid), 'precio');
      console.log('SEEDED uid=' + uid + ' tanda=' + tid);
    `;
    const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
    return out.trim();
  }

  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'medida-tanda-boot-'));
  console.log('  seed C:', seedBootDir(dirC));
  const port = 19751 + Math.floor(Math.random() * 60);
  ok('C0 el puerto del boot está libre antes de arrancar', portFree(port));
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dirC, MEDIA_DIR: path.join(dirC, 'media'), ADMIN_TOKEN: TOK },
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
      const cen = await (await fetch(base + '/api/admin/bandeja/censo?token=' + TOK)).json();
      const fila = (cen.usuarios || []).find(u => u.medida && u.medida.tal_cual === 1);
      ok('C2 el censo admin (el parte) trae la medida del negocio: 1 tal cual · 1 editado · 1 descartado · 2 faltas de precio',
        !!fila && fila.medida.editados === 1 && fila.medida.descartados === 1 && fila.medida.falta_dato.items === 2 && fila.medida.falta_dato.dato_top === 'precio' && cen.totales.medida.tal_cual >= 1,
        JSON.stringify(fila && fila.medida));
      const adm = await (await fetch(base + '/api/admin/users/' + (fila ? fila.user_id : 0) + '/bandeja?token=' + TOK)).json();
      const tandaAdm = adm.tandas ? adm.tandas.find(t => t.group_key === 'POST-C') : null;
      ok('C3 la lectura por usuario trae la medida de la tanda y su pregunta con texto',
        !!tandaAdm && tandaAdm.medida.tal_cual === 1 && tandaAdm.medida.editados === 1 && !!tandaAdm.pregunta_dato && tandaAdm.pregunta_dato.dato === 'precio' && /precio/.test(tandaAdm.pregunta_dato.texto),
        JSON.stringify(tandaAdm && { medida: tandaAdm.medida, pregunta: tandaAdm.pregunta_dato }));
      const sinTok = await fetch(base + '/api/admin/bandeja/censo');
      ok('C4 el censo sin token no pasa', sinTok.status === 403, 'status=' + sinTok.status);
    }
  } finally {
    try { process.kill(proc.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    ok('C5 el boot muere por PID exacto y el puerto queda libre', portFree(port));
  }

  console.log(`\n=== MEDIDA-TANDA: ${pass} ok · ${fail} MAL ===`);
  if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log('  -', f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
