// test-lote-conserje-pedidos-voz.js — LOTE CONSERJE-PEDIDOS-VOZ
// Lo que los clientes piden por nota de voz (tira bajo el posteo / bajo
// la semana) visible en el conserje, lado a lado con lo que Posty
// entregó. Cubre:
//  · voiceRequests (support-cases): lee chat_messages hilo='post' /
//    'semana' (role='user') y compone el par pedido↔respuesta↔posteo.
//    El vínculo con el posteo es el post_id de la propia fila (exacto);
//    el de la semana no fabrica posteo. Un pedido sin respuesta de
//    Posty sale como no entregado (respuesta null), nunca con un par
//    inventado. La respuesta que vale es la PRIMERA assistant posterior
//    al pedido en el mismo hilo (un segundo pedido sobre el mismo
//    posteo no hereda la respuesta del primero).
//  · Sin cruces: el filtro por cliente y el posteo emparejado son del
//    mismo dueño; el chat general (hilo='') no entra.
//  · La puerta de revisión (decisión de Valentino 13/11): el pedido
//    específico por voz NO se hace en el momento — queda pendiente,
//    se revisa acá y, si se aprueba, se arma al día siguiente.
//    decideVoiceRequest persiste pendiente/aprobado/descartado en
//    support_voz_pedidos; aprobar exige la interpretación registrada
//    (el entendido): sin respuesta de Posty no se aprueba a ciegas.
//  · La ruta admin existe bajo requireAdminToken y delega en
//    voiceRequests/decideVoiceRequest; el chunk pinta la sección (VM)
//    con el chip de revisión, el detalle lado a lado con lo entendido
//    ANTES de las acciones, y la declaración honesta de la nota del
//    tab Subir (no se guarda en ningún lado).
//  · CHUNK_V bumpeado (se tocó un chunk-*).
// DB scratch en memoria; fechas fijas. Uso:
//   node test-lote-conserje-pedidos-voz.js        → contra este árbol
//   PZ_TREE=<árbol> node test-lote-conserje-pedidos-voz.js → control
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.env.PZ_TREE || __dirname;
const support = require(path.join(TREE, 'support-cases.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '');
  CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
  CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', caption TEXT DEFAULT '', image_path TEXT DEFAULT '', prev_image_path TEXT DEFAULT '', scheduled_at TEXT, published_at TEXT);
  CREATE TABLE chat_messages (id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT DEFAULT 'user', text TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), post_id INTEGER DEFAULT 0, hilo TEXT DEFAULT '');
`);
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (87, ?, ?)').run('Portrait Coffee', 'portrait.coffee');
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (89, ?, ?)').run('Ladyee Boutique', 'ladyee');
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (90, ?, ?)').run('Tienda Nueve', 'tiendanueve');
db.prepare('INSERT INTO settings (user_id, timezone) VALUES (87, ?)').run('America/New_York');
db.prepare('INSERT INTO settings (user_id, timezone) VALUES (89, ?)').run('America/Argentina/Buenos_Aires');
db.prepare('INSERT INTO settings (user_id, timezone) VALUES (90, ?)').run('America/New_York');
db.prepare(`INSERT INTO posts (id, user_id, status, media_type, caption, image_path, prev_image_path, scheduled_at) VALUES (501, 87, 'scheduled', 'image', ?, '/media/501.jpg', '/media/501-prev.jpg', '2026-11-14 00:00:00')`).run('la torta de la casa, recién salida');
db.prepare(`INSERT INTO posts (id, user_id, status, media_type, caption, image_path) VALUES (502, 87, 'draft', 'image', ?, '/media/502.jpg')`).run('borrador de la semana');
db.prepare(`INSERT INTO posts (id, user_id, status, media_type, caption, image_path, published_at) VALUES (601, 89, 'published', 'image', ?, '/media/601.jpg', '2026-11-12 22:00:00')`).run('el vestido rojo en vidriera');

const MSG = [
  // [id, user_id, role, text, hilo, post_id, created_at]
  [1, 87, 'user', 'sacá el avatar de Posty de arriba a la izquierda, en la imagen', 'post', 501, '2026-11-13 23:17:00'],
  [2, 87, 'assistant', 'Listo, la cambié ✓ Si no te gusta, vuelve la de antes.', 'post', 501, '2026-11-13 23:17:30'],
  [3, 87, 'user', 'hacé la semana que viene más divertida', 'semana', 0, '2026-11-13 21:00:00'],
  [4, 87, 'assistant', 'Dale, la armo con más color y un reel más', 'semana', 0, '2026-11-13 21:00:20'],
  [5, 87, 'user', 'cambiá el caption por uno más corto', 'post', 502, '2026-11-13 22:00:00'],
  [6, 89, 'user', 'rehacé la foto con el vestido rojo', 'post', 601, '2026-11-13 20:05:00'],
  [7, 89, 'assistant', 'Listo, la rehíce ✓', 'post', 601, '2026-11-13 20:05:40'],
  [8, 87, 'user', 'un mensaje del chat general, no de la tira', '', 0, '2026-11-13 19:00:00'],
  [9, 87, 'user', 'pedido sobre un posteo que ya no está', 'post', 999, '2026-11-13 18:00:00'],
  [10, 87, 'assistant', 'Listo ✓', 'post', 999, '2026-11-13 18:00:30'],
  [11, 89, 'user', 'sumale el logo más grande a esta misma foto', 'post', 601, '2026-11-13 20:30:00'],
];
for (const m of MSG) {
  db.prepare('INSERT INTO chat_messages (id, user_id, role, text, hilo, post_id, created_at) VALUES (?,?,?,?,?,?,?)').run(m[0], m[1], m[2], m[3], m[4], m[5], m[6]);
}

const ABS = (uid, p) => 'https://postycommunitymanager.com' + String(p || '');

console.log('· voiceRequests — composición del par pedido↔entregado');
check('voiceRequests existe en support-cases', typeof support.voiceRequests === 'function');
if (typeof support.voiceRequests === 'function') {
  const r = support.voiceRequests(db, { absImageUrl: ABS });
  check('ok y total = 6 pedidos de tira (el chat general no entra)', r.ok === true && r.total === 6 && r.pedidos.length === 6, 'total=' + (r && r.total));
  check('orden: más nuevo primero (id 11 → id 1)', r.pedidos.map((p) => p.id).join(',') === '11,9,6,5,3,1', r.pedidos.map((p) => p.id).join(','));
  const byId = {}; for (const p of r.pedidos) byId[p.id] = p;

  const p1 = byId[1] || {};
  check('pedido del posteo: negocio e ig del dueño', p1.business_name === 'Portrait Coffee' && p1.ig_username === 'portrait.coffee');
  check('pedido del posteo: texto tal cual se transcribió', p1.pedido === 'sacá el avatar de Posty de arriba a la izquierda, en la imagen');
  check('pedido del posteo: respuesta de Posty emparejada', typeof p1.respuesta === 'string' && p1.respuesta.indexOf('Listo, la cambié') === 0 && p1.entregado === true);
  check('pedido del posteo: el posteo es el 501 (vínculo exacto por post_id)', p1.posteo && p1.posteo.id === 501 && p1.posteo.status === 'scheduled');
  check('pedido del posteo: imagen absoluta y anterior guardada', p1.posteo && p1.posteo.image_url === 'https://postycommunitymanager.com/media/501.jpg' && p1.posteo.tiene_anterior === true);
  check('cuándo en la zona del cliente (23:17 UTC = 18:17 en Nueva York)', String(p1.cuando || '').includes('18:17'), p1.cuando);

  const p5 = byId[5] || {};
  check('sin respuesta de Posty: respuesta null y entregado=false (sin par inventado)', p5.respuesta === null && p5.entregado === false && p5.posteo && p5.posteo.id === 502);

  const p3 = byId[3] || {};
  check('pedido de semana: ambito semana, sin posteo fabricado, con su respuesta', p3.ambito === 'semana' && p3.posteo === null && typeof p3.respuesta === 'string');

  const p9 = byId[9] || {};
  check('posteo que ya no está: posteo null pero la respuesta se muestra', p9.posteo === null && p9.respuesta === 'Listo ✓' && p9.entregado === true);

  const p6 = byId[6] || {};
  check('otro cliente: su pedido empareja con SU posteo (601, no el 501)', p6.business_name === 'Ladyee Boutique' && p6.posteo && p6.posteo.id === 601 && p6.posteo.status === 'published');
  check('cuándo en la zona de Ladyee (20:05 UTC = 17:05 en Buenos Aires)', String(p6.cuando || '').includes('17:05'), p6.cuando);

  const p11 = byId[11] || {};
  check('segundo pedido sobre el mismo posteo NO hereda la respuesta del primero', p11.respuesta === null && p11.entregado === false && p11.posteo && p11.posteo.id === 601);

  const f87 = support.voiceRequests(db, { absImageUrl: ABS, userId: 87 });
  check('filtro por cliente: solo los de Portrait (4) y ninguno de Ladyee', f87.total === 4 && f87.pedidos.every((p) => p.user_id === 87), 'total=' + f87.total);
  const f90 = support.voiceRequests(db, { absImageUrl: ABS, userId: 90 });
  check('cliente sin pedidos: lista vacía, nada inventado', f90.ok === true && f90.total === 0);
  const lim = support.voiceRequests(db, { absImageUrl: ABS, limit: 2 });
  check('límite respetado (2, empezando por el más nuevo)', lim.pedidos.length === 2 && lim.pedidos[0].id === 11);

  check('lo entendido = la interpretación registrada (la respuesta del hilo)', p1.entendido === p1.respuesta && p5.entendido === null);
  check('sin decisión cargada: todos nacen «pendiente de revisión»', r.pedidos.every((p) => p.revision && p.revision.estado === 'pendiente' && p.revision.decidido_en === null));
}

console.log('· decideVoiceRequest — la puerta de aprobación');
check('decideVoiceRequest existe en support-cases', typeof support.decideVoiceRequest === 'function');
if (typeof support.decideVoiceRequest === 'function') {
  const d1 = support.decideVoiceRequest(db, { messageId: 1, decision: 'aprobado' });
  check('aprobar un pedido con interpretación registrada: ok', d1.ok === true && d1.estado === 'aprobado' && !!d1.decidido_en, JSON.stringify(d1));
  const tras = support.voiceRequests(db, { absImageUrl: ABS });
  const t1 = tras.pedidos.find((p) => p.id === 1) || {};
  check('la aprobación persiste y se lee en la lista (aprobado + cuándo)', t1.revision && t1.revision.estado === 'aprobado' && !!t1.revision.decidido_en);
  const t3 = tras.pedidos.find((p) => p.id === 3) || {};
  check('decidir uno no toca a los demás (el de semana sigue pendiente)', t3.revision && t3.revision.estado === 'pendiente');

  const dSin = support.decideVoiceRequest(db, { messageId: 5, decision: 'aprobado' });
  check('aprobar SIN interpretación registrada se rechaza (no a ciegas)', dSin.ok === false && dSin.error === 'sin_interpretacion', JSON.stringify(dSin));
  const dDesc = support.decideVoiceRequest(db, { messageId: 5, decision: 'descartado' });
  check('descartar no exige interpretación: cierra sin construir nada', dDesc.ok === true && dDesc.estado === 'descartado');
  const dPend = support.decideVoiceRequest(db, { messageId: 5, decision: 'pendiente' });
  check('una decisión se puede corregir volviendo a pendiente', dPend.ok === true && dPend.estado === 'pendiente');

  const dInv = support.decideVoiceRequest(db, { messageId: 1, decision: 'quizas' });
  check('decisión inválida se rechaza', dInv.ok === false && dInv.error === 'decision_invalida');
  const dGral = support.decideVoiceRequest(db, { messageId: 8, decision: 'aprobado' });
  check('un mensaje del chat general NO es un pedido decidible', dGral.ok === false && dGral.error === 'pedido_inexistente');
  const dNo = support.decideVoiceRequest(db, { messageId: 99999, decision: 'descartado' });
  check('mensaje inexistente se rechaza', dNo.ok === false && dNo.error === 'pedido_inexistente');
  const dAsis = support.decideVoiceRequest(db, { messageId: 2, decision: 'aprobado' });
  check('la respuesta de Posty (assistant) no es un pedido decidible', dAsis.ok === false && dAsis.error === 'pedido_inexistente');
}

console.log('· superficie — ruta, chunk y versión');
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
check('ruta GET pedidos-voz bajo requireAdminToken', serverSrc.includes("app.get('/api/admin/support/conserje/pedidos-voz', requireAdminToken"));
check('la ruta delega en supportCases.voiceRequests', serverSrc.includes('supportCases.voiceRequests(db,'));
check('ruta POST decidir bajo requireAdminToken y delega en decideVoiceRequest', serverSrc.includes("app.post('/api/admin/support/conserje/pedidos-voz/decidir', requireAdminToken") && serverSrc.includes('supportCases.decideVoiceRequest(db,'));
const chunkSrc = fs.readFileSync(path.join(TREE, 'public', 'chunk-conserje.js'), 'utf8');
check('el chunk tiene la sección Pedidos por voz', chunkSrc.includes('🎙 Pedidos por voz') && chunkSrc.includes('data-cj="pedidos-voz"'));
check('el chunk declara el hueco del tab Subir (no se guarda)', chunkSrc.includes('todavía no se guarda en ningún lado'));
check('el chunk declara que el audio no se guarda', chunkSrc.includes('El audio no se guarda'));
const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
check('CHUNK_V bumpeado al tocar un chunk', !appSrc.includes("const CHUNK_V = '20261105-v977';"));

console.log('· render del chunk en VM');
const ctx = {
  console,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  pzIc: () => '',
  $: () => null,
  adminApi: async () => ({ ok: true, pedidos: [] }),
  document: { querySelector: () => null },
  location: { hash: '' },
  sessionStorage: { getItem: () => null, removeItem: () => {} },
  localStorage: { setItem: () => {} },
  window: {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(chunkSrc, ctx, { filename: 'chunk-conserje.js' });
check('las funciones de la sección existen en el chunk', typeof ctx.conserjePedidosVozHTML === 'function' && typeof ctx.conserjePedidoItemHTML === 'function' && typeof ctx.conserjePedidoDetalleHTML === 'function' && typeof ctx.conserjePedidoDecidir === 'function' && typeof ctx.conserjePedidoRevisionChip === 'function');
if (typeof ctx.conserjePedidosVozHTML !== 'function') {
  // Control contra la base: sin las funciones no hay render que probar;
  // el resto de los checks de render cuentan como fallados y se sale.
  for (const n of ['lista con chips de revisión', 'detalle lado a lado con entendido y acciones', 'detalle sin-entregar sin aprobar a ciegas', 'detalle aprobado de semana', 'estado vacío']) check('render: ' + n, false, 'funciones ausentes en este árbol');
  console.log(`\n== ${pass} ok · ${fail} mal ==`);
  process.exit(1);
}
ctx.conserjeEstado.pedidosVoz = { ok: true, total: 3, pedidos: [
  { id: 1, user_id: 87, business_name: 'Portrait Coffee', ig_username: 'portrait.coffee', cuando: '13/11, 18:17', ambito: 'posteo', pedido: 'sacá el avatar de Posty de arriba a la izquierda, en la imagen', respuesta: 'Listo, la cambié ✓', entendido: 'Listo, la cambié ✓', entregado: true, revision: { estado: 'pendiente', decidido_en: null }, posteo: { id: 501, status: 'scheduled', media_type: 'image', caption: 'la torta de la casa, recién salida', scheduled_at: '2026-11-14 00:00:00', published_at: null, image_url: 'https://postycommunitymanager.com/media/501.jpg', tiene_anterior: true } },
  { id: 5, user_id: 87, business_name: 'Portrait Coffee', ig_username: 'portrait.coffee', cuando: '13/11, 17:00', ambito: 'posteo', pedido: 'cambiá el caption por uno más corto', respuesta: null, entendido: null, entregado: false, revision: { estado: 'pendiente', decidido_en: null }, posteo: { id: 502, status: 'draft', media_type: 'image', caption: 'borrador de la semana', scheduled_at: null, published_at: null, image_url: 'https://postycommunitymanager.com/media/502.jpg', tiene_anterior: false } },
  { id: 3, user_id: 87, business_name: 'Portrait Coffee', ig_username: 'portrait.coffee', cuando: '13/11, 16:00', ambito: 'semana', pedido: 'hacé la semana que viene más divertida', respuesta: 'Dale, la armo con más color', entendido: 'Dale, la armo con más color', entregado: true, revision: { estado: 'aprobado', decidido_en: '2026-11-13 23:40:00' }, posteo: null },
] };
const lista = ctx.conserjePedidosVozHTML();
check('la lista muestra negocio, pedido y el estado de revisión (pendiente/aprobado)', lista.includes('Portrait Coffee') && lista.includes('sacá el avatar de Posty') && lista.includes('Pendiente de revisión') && lista.includes('Aprobado · para mañana') && lista.includes('sobre la semana'));
ctx.conserjeEstado.pedidoAbierto = 1;
const listaAbierta = ctx.conserjePedidosVozHTML();
check('al abrirlo: pedido y entregado lado a lado (entendido + posteo + imagen anterior)', listaAbierta.includes('Lo que pidió') && listaAbierta.includes('Lo que entendió Posty') && listaAbierta.includes('El posteo que quedó') && listaAbierta.includes('la torta de la casa, recién salida') && listaAbierta.includes('Tiene una imagen anterior guardada'));
check('pendiente CON entendido: la acción de aprobar está viva (se aprueba lo entendido)', listaAbierta.includes('data-cj="pedido-decidir"') && listaAbierta.includes('✓ Aprobar — se arma mañana') && !listaAbierta.includes('data-decision="aprobado" disabled'));
ctx.conserjeEstado.pedidoAbierto = 5;
const abiertaSin = ctx.conserjePedidosVozHTML();
check('el sin-entregar es «pendiente de revisión»: sin entendido no se aprueba a ciegas', abiertaSin.includes('Sin entregar todavía: Posty todavía no respondió este pedido, así que tampoco hay una interpretación registrada para revisar.') && abiertaSin.includes('data-decision="aprobado" disabled') && abiertaSin.includes('aprobar a ciegas no'));
ctx.conserjeEstado.pedidoAbierto = 3;
const abiertaSem = ctx.conserjePedidosVozHTML();
check('el de semana abierto declara que no hay un posteo único y muestra su aprobación', abiertaSem.includes('no hay un único posteo para mostrar') && abiertaSem.includes('✅ Aprobado: queda listo para armarlo mañana.'));
ctx.conserjeEstado.pedidosVoz = { ok: true, total: 0, pedidos: [] };
check('sin pedidos: estado vacío honesto', ctx.conserjePedidosVozHTML().includes('Todavía no hay pedidos por voz de clientes.'));

console.log(`\n== ${pass} ok · ${fail} mal ==`);
process.exit(fail ? 1 : 0);
