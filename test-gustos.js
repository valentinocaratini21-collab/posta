#!/usr/bin/env node
// test-gustos.js — 🧠 MEMORIA DE GUSTOS (v392): aprender por vía
// explícita (chat, al instante, con acuse) y por patrón (2 correcciones
// iguales → propuesta → solo con confirmación se aprende); el gusto
// entra a las entradas del generador (style_rules + tasteBlock de
// level-boosts); borrar lo retira; un gusto contra una regla dura
// queda «en pausa por regla de calidad» y nunca se aplica.
// Uso: node test-gustos.js   (modos internos: --unit / --setlang / --dump)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/* ================= modos internos (procesos hijos) ================= */
if (process.argv.includes('--unit')) {
  // Unidad pura sobre un DATA_DIR propio: detectores, registro,
  // conflicto, patrón con confirmación, olvido, preservación.
  let okN = 0, failN = 0;
  const ok = (name, cond, extra) => { if (cond) { okN++; console.log('  ✓', name); } else { failN++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 200) : ''); } };
  const db = require('./db').db || require('./db');
  const tm = require('./taste-memory');
  const cd = require('./client-digest');

  // — detectExplicit: los ejemplos del brief entran —
  ok('explícito: «sin hashtags»', (tm.detectExplicit('sin hashtags') || {}).tipo === 'sin_hashtags');
  ok('explícito: «de ahora en más, sin hashtags»', (tm.detectExplicit('de ahora en más, sin hashtags') || {}).tipo === 'sin_hashtags');
  ok('explícito: «no uses emojis»', (tm.detectExplicit('no uses emojis') || {}).tipo === 'sin_emojis');
  ok('explícito: «más corto» pelado', (tm.detectExplicit('más corto') || {}).tipo === 'mas_corto');
  ok('explícito: «siempre textos cortos»', (tm.detectExplicit('quiero los textos siempre cortos') || {}).tipo === 'mas_corto');
  ok('explícito: «siempre con precio»', (tm.detectExplicit('siempre con precio') || {}).tipo === 'con_precio');
  ok('explícito: «sin texto en las fotos»', (tm.detectExplicit('sin texto en las fotos') || {}).tipo === 'sin_texto_imagen');
  const pp = tm.detectExplicit('nunca uses la palabra barato');
  ok('explícito: «nunca uses la palabra barato»', pp && pp.tipo === 'palabra_prohibida' && pp.valor === 'barato', JSON.stringify(pp));
  ok('explícito EN: «no hashtags»', (tm.detectExplicit('no hashtags') || {}).tipo === 'sin_hashtags');
  ok('explícito EN: «from now on, short texts»', (tm.detectExplicit('from now on, short texts') || {}).tipo === 'mas_corto');
  const libre = tm.detectExplicit('de ahora en más, usá siempre fotos de día');
  ok('explícito libre con marco', libre && libre.tipo === 'libre' && /fotos de día/.test(libre.valor), JSON.stringify(libre));
  // — detectExplicit: lo que NO es un gusto estable —
  ok('no captura: edit imperativo con verbo', tm.detectExplicit('hacelo más corto') === null);
  ok('no captura: edit de un posteo puntual', tm.detectExplicit('el posteo 2 de 5: sacale los hashtags y cambiale la foto por la del local') === null);
  ok('no captura: pregunta', tm.detectExplicit('¿cuánto sale el plan pro?') === null);
  ok('no captura: pedido común', tm.detectExplicit('quiero un posteo para el viernes a la mañana') === null);
  ok('no captura: saludo', tm.detectExplicit('hola posty') === null);
  // — parseYesNo estricto —
  ok('sí pelado', tm.parseYesNo('sí') === true);
  ok('dale', tm.parseYesNo('dale!') === true);
  ok('no pelado', tm.parseYesNo('no') === false);
  ok('no gracias', tm.parseYesNo('no, gracias') === false);
  ok('frase larga no es respuesta', tm.parseYesNo('sí pero cambiale la foto por otra') === null);
  ok('otra cosa no es respuesta', tm.parseYesNo('quiero un reel') === null);

  // — registro + sincronización + duplicado —
  // (usuarios reales: client_digest y style_rules tienen FK a users)
  const U1 = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run('unit1@gustos.test', 'x').lastInsertRowid;
  const r1 = tm.learn(db, U1, { tipo: 'sin_hashtags', valor: '', origen: 'explicito', ejemplo: 'sin hashtags', lang: 'es' });
  ok('learn crea el gusto activo', !!r1.gusto && r1.gusto.estado === 'activo' && r1.gusto.origen === 'explicito');
  const st1 = tm.readState(db, U1);
  ok('el gusto vive en el digest', st1.gustos.length === 1 && st1.gustos[0].tipo === 'sin_hashtags');
  const sr1 = db.prepare('SELECT rule_text, active FROM style_rules WHERE user_id = ? AND rule_key = ?').get(U1, 'gusto-sin-hashtags');
  ok('el gusto se sincroniza a style_rules (canal del generador)', !!sr1 && sr1.active === 1 && /SIN hashtags/.test(sr1.rule_text), JSON.stringify(sr1));
  const r1b = tm.learn(db, U1, { tipo: 'sin_hashtags', valor: '', origen: 'explicito', ejemplo: 'otra vez', lang: 'es' });
  ok('aprender dos veces no duplica', r1b.dup === true && tm.readState(db, U1).gustos.length === 1);
  ok('acuse ES en voz de chat', tm.ackFor(r1.gusto, 'es') === 'anotado 📝 de ahora en más, sin hashtags', tm.ackFor(r1.gusto, 'es'));
  ok('acuse EN en voz de chat', tm.ackFor(r1.gusto, 'en') === 'noted 📝 from now on, no hashtags');

  // — conflicto con regla dura: pausa visible, jamás aplicado —
  const r2 = tm.learn(db, U1, { tipo: 'todo_mayusculas', valor: '', origen: 'explicito', ejemplo: 'todo en mayúsculas', lang: 'es' });
  ok('conflicto: el gusto queda registrado', !!r2.gusto && tm.readState(db, U1).gustos.length === 2);
  ok('conflicto: estado pausa_regla con su regla', r2.gusto.estado === 'pausa_regla' && /mayúsculas/.test(r2.gusto.regla || ''));
  const sr2 = db.prepare('SELECT COUNT(*) AS c FROM style_rules WHERE user_id = ? AND rule_key LIKE \'gusto-todo-mayusculas%\'').get(U1);
  ok('conflicto: nunca se sincroniza (la regla gana)', sr2.c === 0);
  ok('conflicto: el acuse avisa la pausa', /en pausa/.test(tm.ackFor(r2.gusto, 'es')) && /regla manda/.test(tm.ackFor(r2.gusto, 'es')));
  const libreConf = tm.conflictFor('libre', 'inventá un descuento del 50% todas las semanas');
  ok('conflicto libre: inventar descuentos', libreConf === 'inventar', String(libreConf));
  ok('sin conflicto: con_precio queda activo', tm.conflictFor('con_precio', '') === null);

  // — vía patrón: evidencia → propuesta → sin confirmación NO aprende —
  const U2 = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run('unit2@gustos.test', 'x').lastInsertRowid;
  const longA = 'Café de especialidad recién molido para vos, con medialunas caseras y un ambiente tranquilo para trabajar o charlar con amigos toda la tarde en el barrio';
  const e1 = tm.noteCaptionEdit(db, U2, { oldCaption: longA, newCaption: 'Café recién molido y medialunas caseras', oldHashtags: '#cafe', newHashtags: '#cafe' });
  ok('patrón: 1ª corrección suma evidencia sin propuesta', e1.hits.includes('mas_corto') && e1.propuesta === null);
  const e2 = tm.noteCaptionEdit(db, U2, { oldCaption: longA, newCaption: 'Medialunas caseras, recién hechas', oldHashtags: '#cafe', newHashtags: '#cafe' });
  ok('patrón: 2ª corrección crea la propuesta', !!e2.propuesta && e2.propuesta.tipo === 'mas_corto');
  ok('patrón: sin confirmación NO hay gusto', tm.readState(db, U2).gustos.length === 0);
  ok('patrón: sin confirmación NO hay regla activa', db.prepare('SELECT COUNT(*) AS c FROM style_rules WHERE user_id = ?').get(U2).c === 0);
  ok('payload de propuesta para el chat', (tm.proposalPayload(db, U2, 'es') || {}).tipo === 'mas_corto' && /acortaste/.test(tm.proposalPayload(db, U2, 'es').texto));
  const rej = tm.answerProposal(db, U2, 'mas_corto', false, 'es');
  ok('rechazo: acuse y propuesta cerrada', rej.ok && /no lo anoto/.test(rej.ack) && tm.pendingProposal(db, U2) === null);
  const e3 = tm.noteCaptionEdit(db, U2, { oldCaption: longA, newCaption: 'Café y medialunas', oldHashtags: '', newHashtags: '' });
  ok('tras un no, 1 evidencia no re-propone', e3.propuesta === null);
  const e4 = tm.noteCaptionEdit(db, U2, { oldCaption: longA, newCaption: 'Café y medialunas, siempre', oldHashtags: '', newHashtags: '' });
  ok('tras un no, la 2ª evidencia nueva sí re-propone', !!e4.propuesta);
  const acc = tm.answerProposal(db, U2, 'mas_corto', true, 'es');
  ok('confirmación: aprende con origen patrón', acc.ok && !!acc.gusto && acc.gusto.origen === 'patron' && acc.gusto.estado === 'activo');
  ok('confirmación: acuse de chat', acc.ack === 'anotado 📝 de ahora en más, textos cortos y al punto', acc.ack);
  const srU2 = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND rule_key = ?').get(U2, 'gusto-mas-corto');
  ok('confirmación: se sincroniza al generador', !!srU2 && /CORTOS/.test(srU2.rule_text));

  // — olvidar: sale del registro y del generador —
  const gone = tm.forget(db, U2, acc.gusto.id);
  ok('borrar devuelve el gusto', !!gone && gone.id === acc.gusto.id);
  ok('borrar: fuera del digest', tm.readState(db, U2).gustos.length === 0);
  ok('borrar: fuera de style_rules', db.prepare('SELECT COUNT(*) AS c FROM style_rules WHERE user_id = ?').get(U2).c === 0);

  // — detectores de corrección —
  ok('detector: sacar hashtags (campo aparte)', tm.detectCorrections('hola #cafe', 'hola', '#a', '').includes('sin_hashtags'));
  ok('detector: sacar emojis', tm.detectCorrections('hola 😄🎉 todo bien', 'hola todo bien', '', '').includes('sin_emojis'));
  ok('detector: agregar precio', tm.detectCorrections('probá el combo', 'probá el combo a $9.900', '', '').includes('con_precio'));
  ok('detector: sin cambios, sin hits', tm.detectCorrections('mismo texto', 'mismo texto', '', '').length === 0);

  // — learnFromText (la vía de la IA del chat) —
  const lt1 = tm.learnFromText(db, U1, 'El cliente prefiere captions sin emojis');
  ok('learnFromText mapea al catálogo', !!lt1.gusto && lt1.gusto.tipo === 'sin_emojis');
  const lt2 = tm.learnFromText(db, U1, 'Usar fondo beige en las fotos del local');
  ok('learnFromText libre conserva el texto', !!lt2.gusto && lt2.gusto.tipo === 'libre' && /beige/.test(lt2.gusto.valor));

  // — el refresco semanal preserva los gustos —
  const stored = tm.readState(db, U1).digest;
  const merged = cd.applyDeepBlocks(stored, cd.emptyDigest());
  ok('applyDeepBlocks preserva gustos', Array.isArray(merged.gustos) && merged.gustos.length === stored.gustos.length, (merged.gustos || []).length + ' vs ' + stored.gustos.length);
  ok('emptyDigest nace con los bloques de gustos', Array.isArray(cd.emptyDigest().gustos) && Array.isArray(cd.emptyDigest().gustos_pendientes));

  // — lista para la pantalla —
  const api = tm.listForApi(db, U1, 'es');
  ok('listForApi: origen explícito con fecha', api.gustos.length >= 3 && /me lo pediste el \d+\/\d+/.test((api.gustos[0] || {}).origen_label || ''), JSON.stringify(api.gustos[0] || {}));
  const pausa = api.gustos.find((g) => g.tipo === 'todo_mayusculas');
  ok('listForApi: la pausa se ve con su regla', !!pausa && pausa.estado === 'pausa_regla' && /mayúsculas/.test(pausa.regla || ''));
  const apiEn = tm.listForApi(db, U1, 'en');
  ok('listForApi EN', /you asked me on/.test((apiEn.gustos[0] || {}).origen_label || ''));

  console.log(`UNIT_RESULT ok=${okN} fail=${failN}`);
  process.exit(failN ? 1 : 0);
}

if (process.argv.includes('--setlang')) {
  const db = require('./db').db || require('./db');
  db.prepare('UPDATE users SET lang = ? WHERE email = ?').run('en', process.env.GUSTOS_EMAIL);
  console.log('setlang ok');
  process.exit(0);
}
if (process.argv.includes('--dump')) {
  const db = require('./db').db || require('./db');
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.GUSTOS_EMAIL);
  if (!u) { console.log(JSON.stringify({ error: 'sin usuario' })); process.exit(0); }
  const cd = require('./client-digest');
  const digest = cd.getStoredDigest(db, u.id) || {};
  const rules = db.prepare('SELECT rule_key, rule_text, active FROM style_rules WHERE user_id = ? ORDER BY rule_key').all(u.id);
  let tasteBlock = '';
  try {
    const lb = require('./level-boosts');
    const out = lb.applyLevelBoosts(db, u.id, 3, lb.KIND_CAPTION, { userId: u.id });
    tasteBlock = (out.payload && out.payload.tasteBlock) || '';
  } catch (e) { tasteBlock = 'ERR:' + e.message; }
  console.log(JSON.stringify({ user_id: u.id, gustos: digest.gustos || null, pendientes: digest.gustos_pendientes || null, rules, tasteBlock }));
  process.exit(0);
}

/* ================= principal ================= */
let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
};

const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const chunkAj = fs.readFileSync(path.join(__dirname, 'public/chunk-ajustes.js'), 'utf8');
const digestJs = fs.readFileSync(path.join(__dirname, 'client-digest.js'), 'utf8');

/* ---------- estáticos ---------- */
ok('server: rutas de gustos', serverJs.includes("app.get('/api/gustos'") && serverJs.includes("app.delete('/api/gustos/:id'") && serverJs.includes("app.post('/api/gustos/propuestas/responder'"));
ok('server: el chat suma taste_proposal (GET y POST)', (serverJs.match(/taste_proposal: tasteMemory\.proposalPayload/g) || []).length >= 3);
ok('server: atajo determinístico de gustos en el chat', serverJs.includes('tasteMemory.detectExplicit') && serverJs.includes('tasteMemory.answerProposal'));
ok('server: la activación silenciosa de style-learn ya no se invoca', !serverJs.includes('learnFromCaptionEdit('));
ok('server: las ediciones alimentan noteCaptionEdit', (serverJs.match(/tasteMemory\.noteCaptionEdit/g) || []).length >= 3);
ok('server: out.rule entra al registro de gustos', serverJs.includes('tasteMemory.learnFromText'));
ok('digest: bloques de gustos en emptyDigest', digestJs.includes('gustos: [], gustos_pendientes: []'));
ok('app.js: barra de propuesta', appJs.includes('function paintTasteProposal') && appJs.includes('tastePropYes') && appJs.includes('/api/gustos/propuestas/responder'));
ok('chunk-ajustes: pantalla «Lo que aprendí de vos»', chunkAj.includes('Lo que aprendí de vos') && chunkAj.includes("What I've learned from you") && chunkAj.includes('id="gustosZone"') && chunkAj.includes('gustosZoneLoad'));
ok('módulo taste-memory presente', fs.existsSync(path.join(__dirname, 'taste-memory.js')));

const PORT = 4417;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gustos-'));
const unitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gustos-unit-'));
const EMAIL = 'gustos@x.example';
const EMAIL_EN = 'gustos-en@x.example';

async function call(method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const txt = await r.text();
  let data = null; try { data = JSON.parse(txt); } catch (e) { data = txt; }
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, text: txt, cookie: sid };
}
function runSelf(mode, extraEnv) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [__filename, mode], {
      cwd: __dirname, env: { ...process.env, ...(extraEnv || {}) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}
function boot() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    (async () => {
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(BASE + '/api/version'); if (r.ok) return resolve(child); } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('no booteó: ' + log.slice(-400)));
    })();
  });
}

(async () => {
  /* ---------- unidad ---------- */
  const unit = await runSelf('--unit', { DATA_DIR: unitDir });
  process.stdout.write(unit.out.split('\n').filter((l) => l.includes('✓') || l.includes('✗')).join('\n') + '\n');
  const um = unit.out.match(/UNIT_RESULT ok=(\d+) fail=(\d+)/);
  if (um) { passed += Number(um[1]); failed += Number(um[2]); }
  else { failed++; console.log('  ✗ la corrida de unidad no reportó resultado', unit.out.slice(-300)); }

  /* ---------- E2E HTTP ---------- */
  const child = await boot();
  try {
    const sinSesion = await call('GET', '/api/gustos');
    ok('GET /api/gustos sin sesión no pasa', sinSesion.status === 401 || sinSesion.status === 302 || sinSesion.status === 403, sinSesion.status);

    const reg = await call('POST', '/api/auth/register', { email: EMAIL, password: 'secreto1' });
    const ck = reg.cookie;
    ok('registro con sesión', !!ck, reg.status);

    // 1) Explícito como PRIMER mensaje (no lo puede comer el guess de nombre)
    const c1 = await call('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'sin hashtags' }] }, ck);
    ok('chat: «sin hashtags» responde el acuse al instante', c1.status === 200 && c1.data && c1.data.reply === 'anotado 📝 de ahora en más, sin hashtags', c1.status + ' ' + String(c1.text).slice(0, 200));
    const g1 = await call('GET', '/api/gustos', null, ck);
    ok('el gusto quedó en la pantalla (API)', g1.data && g1.data.gustos.length === 1 && g1.data.gustos[0].tipo === 'sin_hashtags' && /me lo pediste el/.test(g1.data.gustos[0].origen_label || ''), JSON.stringify(g1.data).slice(0, 200));

    // 2) Explícito en conflicto → pausa visible, acuse honesto
    const c2 = await call('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'sin hashtags' }, { role: 'assistant', text: 'anotado 📝 de ahora en más, sin hashtags' }, { role: 'user', text: 'quiero todo en mayúsculas siempre' }] }, ck);
    ok('chat: el gusto en conflicto acusa la pausa', c2.status === 200 && /en pausa/.test((c2.data || {}).reply || '') && /regla manda/.test((c2.data || {}).reply || ''), String((c2.data || {}).reply || '').slice(0, 160));
    const g2 = await call('GET', '/api/gustos', null, ck);
    const pausa = (g2.data.gustos || []).find((g) => g.tipo === 'todo_mayusculas');
    ok('la pantalla muestra la pausa con su regla', !!pausa && pausa.estado === 'pausa_regla' && /mayúsculas/.test(pausa.regla || ''), JSON.stringify(g2.data).slice(0, 250));

    // 3) Patrón: dos acortadas → propuesta; sin confirmación no aprende
    // (dos captions largos DISTINTOS: la API frena duplicados del día)
    const longCap = 'Café de especialidad recién molido para vos, con medialunas caseras y un ambiente tranquilo para trabajar o charlar con amigos toda la tarde en el barrio';
    const longCap2 = 'Nuestro café de especialidad viene con medialunas recién horneadas, jugo de naranja exprimido y un rincón tranquilo con enchufes para que trabajes cómodo toda la mañana';
    const pa = await call('POST', '/api/posts', { image_path: '/media/g1.jpg', caption: longCap, hashtags: '#cafe #medialunas', media_type: 'image' }, ck);
    const pb = await call('POST', '/api/posts', { image_path: '/media/g2.jpg', caption: longCap2, hashtags: '#cafe #medialunas', media_type: 'image' }, ck);
    ok('piezas creadas para corregir', (pa.status === 200 || pa.status === 201) && (pb.status === 200 || pb.status === 201), pa.status + '/' + pb.status + ' ' + String(pb.text).slice(0, 120));
    const lst = await call('GET', '/api/posts', null, ck);
    const posts = Array.isArray(lst.data) ? lst.data : [];
    const idA = (posts.find((p) => p.image_path === '/media/g1.jpg') || {}).id;
    const idB = (posts.find((p) => p.image_path === '/media/g2.jpg') || {}).id;
    await call('PATCH', '/api/posts/' + idA, { action: 'save-draft', caption: 'Café recién molido y medialunas caseras', hashtags: '#cafe #medialunas' }, ck);
    const mid = await call('GET', '/api/ideas/chat', null, ck);
    ok('tras 1 corrección no hay propuesta', !(mid.data && mid.data.taste_proposal), JSON.stringify((mid.data || {}).taste_proposal));
    await call('PATCH', '/api/posts/' + idB, { action: 'save-draft', caption: 'Café, medialunas y jugo exprimido', hashtags: '#cafe #medialunas' }, ck);
    const mid2 = await call('GET', '/api/ideas/chat', null, ck);
    ok('tras 2 correcciones el chat trae la propuesta', !!mid2.data && !!mid2.data.taste_proposal && mid2.data.taste_proposal.tipo === 'mas_corto' && /acortaste/.test(mid2.data.taste_proposal.texto || ''), JSON.stringify((mid2.data || {}).taste_proposal));
    const g3 = await call('GET', '/api/gustos', null, ck);
    ok('sin confirmación, el gusto NO está', !(g3.data.gustos || []).some((g) => g.tipo === 'mas_corto'));

    // 4) Confirmación textual pelada en el chat
    const c3 = await call('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'sí' }] }, ck);
    ok('el «sí» pelado aprende el gusto patrón', c3.status === 200 && (c3.data || {}).reply === 'anotado 📝 de ahora en más, textos cortos y al punto', String((c3.data || {}).reply || '').slice(0, 120));
    const g4 = await call('GET', '/api/gustos', null, ck);
    const patron = (g4.data.gustos || []).find((g) => g.tipo === 'mas_corto');
    ok('el gusto patrón figura con su origen', !!patron && patron.origen === 'patron' && /lo propuse y me dijiste que sí/.test(patron.origen_label || ''), JSON.stringify(patron));

    // 5) Borrar: sale de la pantalla y del generador
    const del = await call('DELETE', '/api/gustos/' + patron.id, null, ck);
    ok('borrar responde ok', del.status === 200 && del.data && del.data.ok === true, del.status);
    const g5 = await call('GET', '/api/gustos', null, ck);
    ok('borrado: fuera de la lista', !(g5.data.gustos || []).some((g) => g.tipo === 'mas_corto') && g5.data.gustos.length === 2);

    // 6) Cuenta EN: acuse y aprendizaje en inglés
    const regEn = await call('POST', '/api/auth/register', { email: EMAIL_EN, password: 'secreto1' });
    const ckEn = regEn.cookie;
    ok('registro EN con sesión', !!ckEn, regEn.status);
    await runSelf('--setlang', { DATA_DIR: dataDir, GUSTOS_EMAIL: EMAIL_EN });
    const cEn = await call('POST', '/api/ideas/chat', { messages: [{ role: 'user', text: 'no hashtags' }] }, ckEn);
    ok('chat EN: acuse en inglés', cEn.status === 200 && (cEn.data || {}).reply === 'noted 📝 from now on, no hashtags', String((cEn.data || {}).reply || '').slice(0, 120));
    const gEn = await call('GET', '/api/gustos', null, ckEn);
    ok('pantalla EN: origen en inglés', (gEn.data.gustos || []).length === 1 && /you asked me on/.test(gEn.data.gustos[0].origen_label || ''), JSON.stringify(gEn.data).slice(0, 200));
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
  }
  await new Promise((r) => setTimeout(r, 600));

  /* ---------- volcado: registro + entradas del generador ---------- */
  const dump = await runSelf('--dump', { DATA_DIR: dataDir, GUSTOS_EMAIL: EMAIL });
  let dj = null;
  try { dj = JSON.parse(dump.out.trim().split('\n').pop()); } catch (e) {}
  ok('dump: el registro vive en el digest', !!dj && Array.isArray(dj.gustos) && dj.gustos.length === 2, dump.out.slice(-200));
  const keys = (dj && dj.rules || []).map((r) => r.rule_key);
  ok('dump: el gusto activo sigue sincronizado', !!dj && keys.includes('gusto-sin-hashtags'), keys.join(','));
  ok('dump: el borrado salió de style_rules', !!dj && !keys.includes('gusto-mas-corto'), keys.join(','));
  ok('dump: el gusto en pausa nunca se sincronizó', !!dj && !keys.some((k) => k.includes('mayusculas')), keys.join(','));
  ok('generador: el tasteBlock (level-boosts N3) lleva el gusto', !!dj && /SIN hashtags/.test(dj.tasteBlock || ''), String(dj && dj.tasteBlock).slice(0, 200));

  console.log(`\nRESULT ok=${passed} fail=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
