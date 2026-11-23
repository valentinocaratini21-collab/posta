// test-lote-bandeja-verdad.js — Suite del lote BANDEJA-VERDAD
// (2026-11-22): «la bandeja dice la verdad».
//   A · Estática: la purga, la enviabilidad, el mapeo de errores y
//       las lecturas admin existen y están cableadas (scheduler,
//       GET /api/bandeja, app.js) + gate M78 de la vista.
//   B · Módulo bandeja.js con fetchers/suggest inyectados: el CASO
//       DEL VIDEO del dueño sembrado tal cual (DM en error, nota
//       cruda de ventana, borrador con la fórmula, mensaje de más
//       de 24 h) y sus frenos: para_salir = 0, sin oferta de
//       aprobación posible, motivo en español visible, la fórmula
//       purgada, approve devuelve bloqueadas = 1 SIN llamar al
//       envío. Más: la purga en sus variantes, la ingesta de un DM
//       viejo (fuera de ventana desde el nacimiento) y de uno
//       fresco (sale), el error de permiso guardado crudo, y el
//       error fresco que jamás se guarda crudo.
//   C · Boot real: el censo admin ve el stock con la fórmula, la
//       lectura admin por usuario dice la verdad del caso, y la
//       guarda en la lectura (GET /api/bandeja) purga el borrador
//       antes de servirlo.
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
const FORMULA_RE = /gracias por (escribirnos|tu mensaje|contactarnos)/i;

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const bj = read('bandeja.js');
  const gen = read('generator.js');
  const srv = read('server.js');
  const sch = read('scheduler.js');
  const app = read('public/app.js');
  ok('A1 bandeja.js exporta la verdad: purga, censo, mapeo, ventana', ['purgarBorradoresFormula', 'censoBandeja', 'mapearErrorEnvio', 'esErrorVentana', 'dmFueraDeVentana'].every(k => bj.includes(k)));
  ok('A2 generator.js exporta REPLY_FORMULA_RE (la misma del candado)', gen.includes('REPLY_FORMULA_RE,') || gen.includes('REPLY_FORMULA_RE }'));
  ok('A3 last_in_at: columna en el CREATE y migración ALTER para el stock', bj.includes('last_in_at TEXT') && bj.includes('ALTER TABLE bandeja_items ADD COLUMN last_in_at'));
  ok('A4 la ingesta guarda el último entrante (DM y comentarios)', (bj.match(/last_in_at/g) || []).length >= 8);
  ok('A5 approveTanda ya NO guarda el e.message crudo: mapea a español', !bj.includes("String(e.message || 'error de envío')") && bj.includes('mapearErrorEnvio(e.message)'));
  ok('A6 el conteo descuenta las bloqueadas de para_salir', bj.includes('bloqueadas:') && bj.includes('!i.bloqueo_motivo'));
  ok('A7 server.js: las lecturas admin de la bandeja, tras requireAdminToken', srv.includes("app.get('/api/admin/users/:id/bandeja', requireAdminToken") && srv.includes("app.get('/api/admin/bandeja/censo', requireAdminToken"));
  ok('A8 server.js: guarda de purga en la lectura de la bandeja', srv.includes('purgarBorradoresFormula(db, bandejaDeps(), { onlyUser: uid })'));
  ok('A9 scheduler.js: barrido único al desplegar', sch.includes('purgarBorradoresFormula(db, proBandejaDeps(db))'));
  ok('A10 app.js: el toast lee bloqueadas/errores y motivos (no miente)', app.includes('r.bloqueadas') && app.includes('r.motivos') && app.includes('no pudo salir'));
  ok('A11 app.js: la tarjeta solo ofrece «Aprobar» si hay algo enviable', /c\.para_salir \? `<button type="button" class="pzb-btn pzb-btn-aprobar"/.test(app));
  const llamadas = ['pzBandejaView', 'pzBandejaAbrir', 'pzBandejaVolver', 'pzBandejaAprobar', 'pzBandejaEditar', 'pzBandejaGuardar', 'pzBandejaDescartar', 'pzBandejaDeshacer', 'pzBandejaRepintar'];
  const definidas = llamadas.filter(fn => new RegExp('(async )?function ' + fn + '\\(').test(app));
  ok(`A12 gate M78 — funciones auditadas: ${definidas.length}/${llamadas.length}`, definidas.length === llamadas.length, 'faltan: ' + llamadas.filter(f => !definidas.includes(f)).join(','));
}

// ---------------------------------------------------------------- B
console.log('\nB · Módulo (el caso del video y sus frenos)');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-verdad-mod-'));
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
  const state = { sentDms: [], sentReplies: [], dmCalls: 0, replyCalls: 0 };
  const deps = {
    credsOf: () => ({ igUserId: 'IGBIZ', accessToken: 'tok-falso', igUsername: 'thecoffeebardc' }),
    suggestFn: o.suggestFn || (() => async () => ({ reply: 'se viene 🔥', needsHuman: false, reason: '' })),
    apiKeyOf: () => '',
    formulaRe: FORMULA,
    notify: () => {},
    fetchers: {
      fetchMedia: async () => [],
      fetchComments: async () => o.comments || [],
      fetchConversations: async () => o.convs || [],
      sendCommentReply: async (creds, commentId, text) => { state.replyCalls++; if (o.failReply) throw new Error(o.failReply); state.sentReplies.push({ commentId, text }); return { id: 'r1' }; },
      sendDm: async (creds, to, text) => { state.dmCalls++; if (o.failDm) throw new Error(o.failDm); state.sentDms.push({ to, text }); return { id: 'dm1' }; },
      hideComment: async () => ({ ok: true }),
    },
  };
  return { deps, state };
}
function seedTanda(uid, kind, groupKey, etiqueta) {
  const r = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, etiqueta, notified_at) VALUES (?, ?, ?, '', '', ?, datetime('now'))").run(uid, groupKey, kind, etiqueta || '');
  return Number(r.lastInsertRowid);
}

(async () => {
  // B1 · la migración dejó la columna puesta en una base nueva.
  const cols = db.prepare('PRAGMA table_info(bandeja_items)').all().map(c => c.name);
  ok('B1 la tabla bandeja_items tiene last_in_at', cols.includes('last_in_at'));

  // --- EL CASO DEL VIDEO, sembrado tal cual -------------------------
  const uidV = seedUser('dueno@casa.example');
  const tidV = seedTanda(uidV, 'dm', 'dm:CV1', '@reyveronica_');
  const hace3d = sqlHace(3 * 86400000);
  db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, note, last_in_at, created_at, updated_at)
    VALUES (?, ?, 'dm', 'CV1', 'm-old', 'm-old', 'reyveronica_', 'U777', '🔥', '¡Gracias por escribirnos! 🙌', 'normal', 'error', 'This message is sent outside of allowed window.', ?, ?, ?)`)
    .run(tidV, uidV, isoHace(3 * 86400000), hace3d, hace3d);

  const censo0 = B.censoBandeja(db, { formulaRe: FORMULA });
  const filaV = censo0.usuarios.find(u => u.user_id === uidV);
  ok('B2 el censo admin ve el stock: 1 borrador con la fórmula, de más de 24 h', !!filaV && filaV.formula.cantidad === 1 && filaV.formula.antiguedad_horas > 24, JSON.stringify(censo0.totales));
  ok('B3 el censo trae el error con su nota visible ya mapeada', !!filaV && filaV.en_error.length === 1 && filaV.en_error[0].note_visible === B.NOTA_VENTANA, JSON.stringify(filaV && filaV.en_error));

  const { deps: depsV, state: stV } = makeDeps({
    convs: [{ id: 'CV1', participants: [{ id: 'IGBIZ', username: 'thecoffeebardc' }, { id: 'U777', username: 'reyveronica_' }], messages: [{ id: 'm-old', text: '🔥', fromId: 'U777', fromUsername: 'reyveronica_', created_time: isoHace(3 * 86400000) }] }],
    failDm: 'This message is sent outside of allowed window.',
  });
  const purga = await B.purgarBorradoresFormula(db, depsV, { onlyUser: uidV });
  const itemV = db.prepare('SELECT * FROM bandeja_items WHERE user_id = ?').get(uidV);
  ok('B4 la purga regenera el borrador-fórmula con el redactor actual', purga.regenerados === 1 && itemV.draft === 'se viene 🔥' && !FORMULA_RE.test(itemV.draft), JSON.stringify(purga) + ' draft=' + itemV.draft);

  const gbV = B.getBandeja(db, uidV);
  const tandaV = gbV.tandas.find(t => t.id === tidV);
  ok('B5 EL FRENO: para_salir = 0 (la pantalla no puede ofrecer «Aprobar las 1»)', !!tandaV && tandaV.conteo.para_salir === 0, JSON.stringify(tandaV && tandaV.conteo));
  ok('B6 la bloqueada se cuenta como bloqueada, no como lista', !!tandaV && tandaV.conteo.bloqueadas === 1);
  const servV = tandaV ? tandaV.items[0] : null;
  ok('B7 la tarjeta dice la verdad en español (motivo y nota, sin crudo de Meta)', !!servV && servV.bloqueo_motivo === B.NOTA_VENTANA && servV.note === B.NOTA_VENTANA && !/allowed window/i.test(servV.note), servV && servV.note);
  const apV = await B.approveTanda(db, uidV, tidV, depsV);
  ok('B8 approve NO llama al envío y devuelve bloqueadas = 1', stV.dmCalls === 0 && apV.bloqueadas === 1 && apV.enviadas === 0 && apV.motivos[0] === B.NOTA_VENTANA, JSON.stringify(apV));

  // --- La purga en sus variantes ------------------------------------
  const uidP = seedUser('purga@example');
  const tidP = seedTanda(uidP, 'post', 'POSTP', '');
  const insP = db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato, edited)
    VALUES (?, ?, 'comment', ?, ?, ?, ?, ?, ?, 'normal', 'pendiente', '', ?)`);
  insP.run(tidP, uidP, 'cp1', 'cp1', 'cp1', 'vale.r', '¿cuánto cuesta el flat white?', '¡Gracias por escribirnos! 🙌', 0);
  insP.run(tidP, uidP, 'cp2', 'cp2', 'cp2', 'dueno.edita', 'qué lindo lugar', '¡Gracias por escribirnos! 🙌', 1);
  const depsP = makeDeps({ suggestFn: () => async () => ({ reply: '', needsHuman: true, reason: 'dato_no_esta_en_el_fundamento:precio' }) }).deps;
  const purgaP = await B.purgarBorradoresFormula(db, depsP, { onlyUser: uidP });
  const itP1 = db.prepare("SELECT * FROM bandeja_items WHERE user_id = ? AND thread_key = 'cp1'").get(uidP);
  const itP2 = db.prepare("SELECT * FROM bandeja_items WHERE user_id = ? AND thread_key = 'cp2'").get(uidP);
  ok('B9 si la regeneración no da texto: borrador vacío con su marca de falta-dato', purgaP.vaciados === 1 && itP1.draft === '' && !!itP1.falta_dato, JSON.stringify(itP1));
  ok('B10 el borrador EDITADO por el dueño no se toca (su texto es suyo)', itP2.draft === '¡Gracias por escribirnos! 🙌');

  // --- Ingesta: DM viejo nace bloqueado; DM fresco sale --------------
  const uidG = seedUser('dmviejo@example');
  const convVieja = [{ id: 'CVOLD', participants: [{ id: 'IGBIZ', username: 'thecoffeebardc' }, { id: 'U555', username: 'lu.p' }], messages: [{ id: 'mo1', text: 'hola, ¿tienen algo sin tacc?', fromId: 'U555', fromUsername: 'lu.p', created_time: isoHace(48 * 3600000) }] }];
  const wG = makeDeps({ convs: convVieja, suggestFn: () => async () => ({ reply: '¡Hola! Sí, tenemos opciones sin tacc.', needsHuman: false, reason: '' }) });
  await B.pollBandeja(db, wG.deps, { onlyUser: uidG });
  const itG = db.prepare("SELECT * FROM bandeja_items WHERE user_id = ? AND source = 'dm'").get(uidG);
  ok('B11 la ingesta guarda el instante del último entrante', !!itG && Math.abs(Date.parse(itG.last_in_at) - (Date.now() - 48 * 3600000)) < 60000, itG && itG.last_in_at);
  const gbG = B.getBandeja(db, uidG);
  const tandaG = gbG.tandas.find(t => t.kind === 'dm');
  ok('B12 el DM fuera de ventana NO cuenta para salir desde que nace', !!tandaG && tandaG.conteo.para_salir === 0 && tandaG.conteo.bloqueadas === 1 && tandaG.items[0].note === B.NOTA_VENTANA, JSON.stringify(tandaG && tandaG.conteo));

  const uidF = seedUser('dmfresco@example');
  const convFresca = [{ id: 'CVNEW', participants: [{ id: 'IGBIZ', username: 'thecoffeebardc' }, { id: 'U556', username: 'sofi.m' }], messages: [{ id: 'mn1', text: 'hola, ¿tienen algo sin tacc?', fromId: 'U556', fromUsername: 'sofi.m', created_time: new Date().toISOString() }] }];
  const wF = makeDeps({ convs: convFresca, suggestFn: () => async () => ({ reply: '¡Hola! Sí, tenemos opciones sin tacc.', needsHuman: false, reason: '' }) });
  await B.pollBandeja(db, wF.deps, { onlyUser: uidF });
  const gbF = B.getBandeja(db, uidF);
  const tandaF = gbF.tandas.find(t => t.kind === 'dm');
  ok('B13 el DM fresco SÍ cuenta para salir (la ventana no sobre-bloquea)', !!tandaF && tandaF.conteo.para_salir === 1, JSON.stringify(tandaF && tandaF.conteo));
  const apF = await B.approveTanda(db, uidF, tandaF.id, wF.deps);
  ok('B14 el DM fresco sale por su camino al aprobar', apF.enviadas === 1 && wF.state.sentDms.length === 1 && apF.bloqueadas === 0, JSON.stringify(apF));

  // --- Error de permiso guardado crudo (stock viejo) -----------------
  const uidE = seedUser('permiso@example');
  const tidE = seedTanda(uidE, 'post', 'POSTE', '');
  db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, note)
    VALUES (?, ?, 'comment', 'ce1', 'ce1', 'ce1', 'martin.g', '¿abren mañana?', 'Mañana abrimos de 9 a 20.', 'normal', 'error', '(#200) Requires instagram_business_manage_comments permission')`)
    .run(tidE, uidE);
  const wE = makeDeps({});
  const gbE = B.getBandeja(db, uidE);
  const servE = gbE.tandas.find(t => t.id === tidE).items[0];
  ok('B15 la nota cruda de permiso se sirve mapeada a español', servE.note === B.NOTA_PERMISO && servE.bloqueo_motivo === B.NOTA_PERMISO, servE.note);
  const apE = await B.approveTanda(db, uidE, tidE, wE.deps);
  ok('B16 el error de permiso terminal tampoco se reintenta a ciegas', wE.state.replyCalls === 0 && apE.bloqueadas === 1 && apE.enviadas === 0, JSON.stringify(apE));

  // --- Error fresco: jamás se guarda crudo ----------------------------
  const uidR = seedUser('crudo@example');
  const tidR = seedTanda(uidR, 'post', 'POSTR', '');
  db.prepare(`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado)
    VALUES (?, ?, 'comment', 'cr1', 'cr1', 'cr1', 'juanp', 'el mejor café', '¡Gracias Juan! Es nuestro Classic.', 'normal', 'pendiente')`)
    .run(tidR, uidR);
  const wR = makeDeps({ failReply: 'Meta boom crudo XYZ (code 12345)' });
  const apR = await B.approveTanda(db, uidR, tidR, wR.deps);
  const itR = db.prepare('SELECT * FROM bandeja_items WHERE user_id = ?').get(uidR);
  ok('B17 el error fresco se guarda mapeado, nunca crudo', apR.errores === 1 && itR.note === 'Instagram no lo dejó salir' && !/Meta boom/.test(itR.note), itR.note);
  ok('B18 el resultado expone el motivo del error', Array.isArray(apR.motivos) && apR.motivos.includes('Instagram no lo dejó salir'), JSON.stringify(apR.motivos));

  // ---------------------------------------------------------------- C
  console.log('\nC · Boot real (lecturas admin y guarda en la lectura)');
  function portFree(p) {
    const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  }
  function seedBootDir(dir) {
    const seed = `
      process.env.DATA_DIR = ${JSON.stringify(dir)};
      const db = require(${JSON.stringify(path.join(ROOT, 'db.js'))}).db || require(${JSON.stringify(path.join(ROOT, 'db.js'))});
      const bcrypt = require('bcryptjs');
      const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('dueno@coffee.example', bcrypt.hashSync('clave-prueba-1', 10));
      const uid = Number(r.lastInsertRowid);
      db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
      db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run(uid);
      db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
      db.prepare("INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)").run(uid, JSON.stringify({ horarios: 'Lun a Vie 9 a 20' }));
      const t = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, etiqueta, notified_at) VALUES (?, 'dm:CV1', 'dm', '@reyveronica_', datetime('now'))").run(uid);
      const tid = Number(t.lastInsertRowid);
      db.prepare(\`INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, note, last_in_at, created_at, updated_at)
        VALUES (?, ?, 'dm', 'CV1', 'm-old', 'm-old', 'reyveronica_', 'U777', '🔥', '¡Gracias por escribirnos! 🙌', 'normal', 'error', 'This message is sent outside of allowed window.', ?, ?, ?)\`)
        .run(tid, uid, ${JSON.stringify(isoHace(3 * 86400000))}, ${JSON.stringify(sqlHace(3 * 86400000))}, ${JSON.stringify(sqlHace(3 * 86400000))});
      console.log('SEEDED uid=' + uid + ' tanda=' + tid);
    `;
    const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
    return out.trim();
  }

  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-verdad-boot-'));
  console.log('  seed C:', seedBootDir(dirC));
  const port = 19711 + Math.floor(Math.random() * 60);
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
      const cen = await (await fetch(base + '/api/admin/bandeja/censo?token=tok-admin-prueba')).json();
      // OJO: el barrido al desplegar puede purgar el borrador-fórmula
      // antes de esta lectura (es su trabajo) — lo que NO cambia es el
      // error con su nota mapeada ni el bloqueo por ventana.
      ok('C2 el censo admin ve el caso: error con nota mapeada y 1 bloqueada por ventana', cen.ok === true && cen.totales.bloqueadas_ventana >= 1 && (cen.usuarios || []).some(u => u.en_error.length >= 1 && u.en_error[0].note_visible === B.NOTA_VENTANA), JSON.stringify(cen.totales || {}));
      const sinTok = await fetch(base + '/api/admin/bandeja/censo');
      ok('C3 el censo admin sin token no pasa', sinTok.status === 403, 'status=' + sinTok.status);
      const filaBoot = (cen.usuarios || []).find(u => u.en_error.length >= 1);
      const adm = await (await fetch(base + '/api/admin/users/' + (filaBoot ? filaBoot.user_id : 0) + '/bandeja?token=tok-admin-prueba')).json();
      const tandaAdm = adm.tandas ? adm.tandas.find(t => t.kind === 'dm') : null;
      ok('C4 la lectura admin por usuario dice la verdad del caso (0 para salir · 1 bloqueada · nota en español)',
        !!tandaAdm && tandaAdm.conteo.para_salir === 0 && tandaAdm.conteo.bloqueadas === 1 && tandaAdm.items[0].note === B.NOTA_VENTANA,
        JSON.stringify(tandaAdm && tandaAdm.conteo));
      const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@coffee.example', password: 'clave-prueba-1' }) });
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
      ok('C5 login del dueño', login.ok && !!cookie, 'status=' + login.status);
      const gb = await (await fetch(base + '/api/bandeja', { headers: { Cookie: cookie } })).json();
      const tandaGb = (gb.tandas || []).find(t => t.kind === 'dm');
      const itemGb = tandaGb ? tandaGb.items[0] : null;
      ok('C6 la guarda en la lectura purgó la fórmula antes de servir', !!itemGb && !FORMULA_RE.test(String(itemGb.draft || '')), itemGb && itemGb.draft);
      ok('C7 y la tanda servida al dueño tampoco ofrece lo que no sale', !!tandaGb && tandaGb.conteo.para_salir === 0 && tandaGb.conteo.bloqueadas === 1, JSON.stringify(tandaGb && tandaGb.conteo));
    }
  } finally {
    try { process.kill(proc.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    ok('C8 el boot muere por PID exacto y el puerto queda libre', portFree(port));
  }

  console.log(`\n=== BANDEJA-VERDAD: ${pass} ok · ${fail} MAL ===`);
  if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log('  -', f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
