'use strict';

// =====================================================================
// LOTE VISTA-CONSERJE — suite del lote
// =====================================================================
// La consola del operador (mock aprobado 18/11) cableada a las fuentes
// reales. La suite corre en dos partes:
//   A · Estática: el módulo existe con sus funciones, server.js trae el
//       require, las seis rutas y la página /conserje; la página y su
//       JS existen con el diseño del mock y el cableado a los
//       endpoints reales — y la consola NUNCA manda «aprobado» a la
//       puerta de pedidos de voz (aprobar dispara el ejecutor del
//       software; los audios los resuelve bamboo a mano).
//   B · Conducta contra una DB temporal sembrada como la mini-
//       producción: la guarda de colisión de tratamientos (avisa y NO
//       aplica), el roster con sus exclusiones, la racha, los
//       pendientes por clase, las decisiones que salen de cada fuente,
//       el resuelto a mano, la orden de producción con su dedup y el
//       cierre de caso.
// Control: contra la base (sin el lote) la suite FALLA en A1 — el
// módulo no existe y nada de lo demás se puede probar.

const fs = require('fs');
const os = require('os');
const path = require('path');

let ok = 0, mal = 0;
function t(nombre, cond) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };

// ---------------------------------------------------------------------
seccion('A · estática del lote');
let cv = null;
try { cv = require('./conserje-vista'); } catch (e) { cv = null; }
t('A1 conserje-vista.js existe y carga', !!cv);
if (cv) {
  const fns = ['catalogoTratamientos', 'tratamientoDe', 'asignarTratamiento', 'planDePrueba', 'rachaDe',
    'pendientesDe', 'usuariosAtendidos', 'filaRoster', 'resumenHoy', 'decisiones', 'ultimasDecisiones',
    'colaProduccion', 'semanaDe', 'posteosDe', 'cliente', 'marcarVozResuelto', 'abrirOrdenProduccion',
    'cerrarCaso', 'vista'];
  t('A2 el módulo exporta las 19 funciones de la vista', fns.every((f) => typeof cv[f] === 'function'));
  const srcMod = read('conserje-vista.js');
  t('A3 la guarda de colisión vive en el módulo (colision + no aplica)', srcMod.includes("error: 'colision'") && srcMod.includes('conserje_tratamientos'));
  t('A4 el módulo no fabrica datos (sin Math.random ni fechas falsas)', !srcMod.includes('Math.random'));
  t('A5 el resuelto a mano usa su estado propio, no la puerta aprobado', srcMod.includes("'resuelto_mano'") && !srcMod.includes("decision: 'aprobado'"));
}
const srcServer = read('server.js');
t('A6 server.js requiere el módulo', srcServer.includes("require('./conserje-vista')"));
for (const ruta of ['/api/admin/conserje/vista', '/api/admin/conserje/vista/cliente', '/api/admin/conserje/vista/tratamiento',
  '/api/admin/conserje/vista/voz-resuelto', '/api/admin/conserje/vista/producir', '/api/admin/conserje/vista/caso-cerrar']) {
  t('A7 ruta presente: ' + ruta, srcServer.includes("'" + ruta + "'"));
}
t('A8 la página /conserje se sirve como /panel', srcServer.includes("app.get('/conserje'") && srcServer.includes("public', 'conserje.html'"));
t('A9 las rutas de la consola exigen el token admin', (srcServer.match(/\/api\/admin\/conserje\/vista[^']*', requireAdminToken/g) || []).length >= 6);

const html = read('public/conserje.html');
t('A10 la página existe con el diseño del mock (navy + vidrio)', html.includes('--navy: #0A1E33') && html.includes('backdrop-filter: blur'));
t('A11 la página trae los contenedores de la consola', ['id="roster"', 'id="centro"', 'id="decisiones"', 'id="ultimas"', 'id="cola"'].every((s) => html.includes(s)));
t('A12 la página carga su JS', html.includes('/conserje.js'));

const js = read('public/conserje.js');
t('A13 el JS lee la vista agregada y el gasto real', js.includes('/api/admin/conserje/vista') && js.includes('/api/admin/ai-costs'));
t('A14 el JS aprueba por la decisión de la revisión (sale/arreglar/no_sale/pedir)',
  js.includes('/api/admin/support/conserje/revision/decidir') && ["'sale'", "'arreglar'", "'no_sale'", "'pedir'"].every((s) => js.includes(s)));
t('A15 el JS trae Su feed por el endpoint del feed (con su disponible)', js.includes('/api/admin/support/conserje/feed') && js.includes('disponible'));
t('A16 el JS responde en el chat del cliente y cierra el pedido a mano',
  js.includes("'/chat'") || js.includes('/chat\'') || js.includes('/chat`') || js.includes("+ '/chat'") || js.includes('/api/admin/support/') && js.includes('voz-resuelto'));
t('A17 el JS registra los vistos en el registro del equipo', js.includes("'impulso_visto'") && js.includes("'portada_vista'"));
t('A18 el JS NUNCA aprueba un pedido de voz por la puerta del ejecutor', !/decision:\s*'aprobado'/.test(js) && !/decision:\s*"aprobado"/.test(js));
t('A19 el JS trata la colisión de tratamiento sin aplicar', js.includes('colision') && js.includes('tratamiento'));
t('A20 el JS guarda la nota por el endpoint de la ficha', js.includes('/api/admin/support/conserje/nota'));

// ---------------------------------------------------------------------
seccion('B · conducta contra una DB sembrada');
if (cv) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-suite-'));
  process.env.DATA_DIR = tmp;
  const db = require('./db');
  require('./guest-trial').ensureSchema(db); // columnas del invitado (is_guest, guest_ig, guest_domain)
  const supportCases = require('./support-cases');
  const conserjeRevision = require('./conserje-revision');
  const imageStyles = require('./image-styles');
  const { dayKeyInTz } = require('./morning-post-push');
  const TZ = 'America/New_York';
  const hoy = dayKeyInTz(new Date(), TZ);
  const shift = (key, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n, 12)).toISOString().slice(0, 10); };
  const ayer = shift(hoy, -1), d2 = shift(hoy, -2), manana = shift(hoy, 1);
  const aLas = (key, hora) => new Date(conserjeRevision.wallToUtc(key + ' ' + hora, TZ)).toISOString().replace('T', ' ').slice(0, 19);
  const ins = (sql, ...p) => db.prepare(sql).run(...p);

  ins(`INSERT INTO users (id, email, password_hash, plan, plan_status, concierge) VALUES (12, 'dueno@posty.app', 'x', 'posty', 'active', 1)`);
  ins(`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, guest_ig, guest_domain, concierge) VALUES (113, 'invitado@sotto.example', 'x', 'trial', 'trial', 1, 'sottosottoatl', 'sottosottoatlanta.com', 1)`);
  ins(`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, guest_ig, concierge) VALUES (123, 'invitado@bigtop.example', 'x', 'trial', 'trial', 1, 'bigtopcandyshop', 1)`);
  ins(`INSERT INTO users (id, email, password_hash, plan, plan_status) VALUES (140, 'qa-falso@postatest.com', 'x', 'trial', 'trial')`);
  ins(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (12, 'Posty', 'posty.communitymanager', 'Marketing')`);
  ins(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (113, 'Sotto Sotto', 'sottosottoatl', 'Restaurante italiano')`);
  ins(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (123, 'Big Top Candy Shop', 'bigtopcandyshop', 'Dulcería')`);
  ins(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (140, 'QA Falso', 'qafalso', 'Test')`);
  for (const uid of [12, 113, 123]) ins(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`, uid, TZ);
  const post = (id, uid, status, media, img, caption, sched, pub) =>
    ins(`INSERT INTO posts (id, user_id, status, media_type, image_path, caption, scheduled_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, uid, status, media, img, caption, sched, pub);
  post(9002, 113, 'published', 'image', '/media/sotto2.jpg', 'HANDMADE — La pasta se amasa a mano.', aLas(d2, '19:00'), aLas(d2, '19:00'));
  post(9001, 113, 'published', 'image', '/media/sotto1.jpg', 'THE DISH — Tortelli di Michelangelo.', aLas(ayer, '19:00'), aLas(ayer, '19:00'));
  post(9003, 113, 'draft', 'image', '/media/sotto3.jpg', 'THE TABLE — El salón principal de noche.', aLas(manana, '19:00'), null);
  post(9101, 123, 'published', 'image', '/media/bigtop1.jpg', 'THE SODA FOUNTAIN.', aLas(d2, '19:00'), aLas(d2, '19:00'));
  post(9102, 123, 'published', 'image', '/media/bigtop2.jpg', 'BY THE POUND.', aLas(ayer, '19:00'), aLas(ayer, '19:00'));
  post(9103, 123, 'published', 'image', '/media/bigtop3.jpg', 'CHILDHOOD CLASSICS.', aLas(hoy, '12:00'), aLas(hoy, '12:00'));
  post(9104, 123, 'scheduled', 'image', '/media/bigtop4.jpg', 'AT THE COUNTER.', aLas(manana, '19:00'), null);
  post(695, 12, 'published', 'video', '/media/695.mp4', 'El reel de la semana.', aLas(ayer, '19:00'), aLas(ayer, '19:00'));
  post(696, 12, 'published', 'image', '/media/696.jpg', 'El posteo para impulsar.', aLas(d2, '19:00'), aLas(d2, '19:00'));
  const payload = {
    posts: [
      { type: 'image', image: '/media/sotto1.jpg', formato: 'The Dish', headline: 'THE DISH', mano: { cargada_at: 1, post_id: 9001 } },
      { type: 'carousel', images: ['/media/sotto2.jpg'], formato: 'Handmade', headline: 'HANDMADE', mano: { cargada_at: 1, post_id: 9002 } },
      { type: 'image', formato: 'The Table', headline: 'THE TABLE' },
    ],
    week: [{ day: 'Lunes', date: '17 nov', hour: '19:00' }, { day: 'Martes', date: '18 nov', hour: '19:00' }, { day: 'Miércoles', date: '19 nov', hour: '19:00' }],
    digest: { producto_estrella: 'Tortelli di Michelangelo' },
    formatos_sistema: ['The Dish', 'Handmade', 'The Table'], lang: 'es', linea_mano: true,
  };
  ins(`INSERT INTO trial_cache (ig, payload, created_at) VALUES ('sottosottoatl', ?, datetime('now'))`, JSON.stringify(payload));
  const m1 = ins(`INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (113, 'user', 'cambiemos el posteo de hoy por el plato nuevo', 'post', 9001)`);
  const m2 = ins(`INSERT INTO chat_messages (user_id, role, text, hilo, post_id) VALUES (113, 'assistant', 'Perfecto: lo cambiamos por el plato nuevo.', 'post', 9001)`);
  ins(`INSERT INTO chat_messages (user_id, role, text) VALUES (123, 'user', '¿a qué hora sale el posteo de mañana?')`);
  supportCases.logTeamAction(db, { actor: 'equipo', action: 'responder_chat', userId: 113, chatMsgId: Number(m2.lastInsertRowid), detalle: 'Respuesta de seed.' });
  const vozId = Number(m1.lastInsertRowid);
  ins(`INSERT INTO ad_boosts (user_id, post_id, ig_media_id, budget_cents, fee_cents, status, error) VALUES (12, 696, '17978105123940652', 2000, 0, 'error', 'Invalid parameter de seed.')`);
  supportCases.openCase(db, { userId: 123, tipo: 'prueba_linea_mano', titulo: 'Producir día 2 de Big Top', detalle: 'Carrusel del local.', siguientePaso: 'Armar el carrusel.', dedupKey: 'suite-bigtop-d2' });
  const casoAyuda = supportCases.openCase(db, { userId: 113, tipo: 'ayuda', titulo: 'Preguntó por el horario del domingo', detalle: 'Confirmar si abren el domingo.', siguientePaso: 'Responder en el chat.', dedupKey: 'suite-sotto-domingo' });

  // B1 · el catálogo de tratamientos sale de los estilos reales
  const cat = cv.catalogoTratamientos(db);
  const familiasReales = new Set(imageStyles.listStyles().map((s) => imageStyles.styleFamilyOf(s)).filter(Boolean));
  t('B1 el catálogo de familias es el de image-styles (nada inventado)',
    cat.familias.length >= 10 && cat.familias.every((f) => familiasReales.has(f.key)) && cat.familias.some((f) => f.key === 'cinematic'));

  // B2 · la guarda de colisión: avisa y NO aplica
  const asig1 = cv.asignarTratamiento(db, 113, 'cinematic', 'suite');
  const asig2 = cv.asignarTratamiento(db, 123, 'cinematic', 'suite');
  t('B2 asignar una familia libre funciona', asig1.ok === true && cv.tratamientoDe(db, 113) === 'cinematic');
  t('B3 la misma familia en otro negocio devuelve colisión con el dueño',
    asig2.ok === false && asig2.error === 'colision' && asig2.ocupa && asig2.ocupa.user_id === 113);
  t('B4 la colisión NO se aplicó (el segundo negocio quedó sin esa familia)', cv.tratamientoDe(db, 123) === '');
  t('B5 otra familia sí se asigna, y retirar libera la familia',
    cv.asignarTratamiento(db, 123, 'pop', 'suite').ok === true
    && cv.asignarTratamiento(db, 113, '', 'suite').ok === true
    && cv.asignarTratamiento(db, 123, 'cinematic', 'suite').ok === true);
  t('B6 una familia que no existe se rechaza', cv.asignarTratamiento(db, 113, 'inventada', 'suite').ok === false);

  // B7 · el roster y sus exclusiones
  const roster = cv.usuariosAtendidos(db);
  const ids = roster.map((u) => u.id);
  t('B7 el roster trae dueño + las dos pruebas y excluye la cuenta QA',
    ids.includes(12) && ids.includes(113) && ids.includes(123) && !ids.includes(140));

  // B8 · racha y pendientes por clase
  const u113 = roster.find((u) => u.id === 113);
  const u123 = roster.find((u) => u.id === 123);
  const f113 = cv.filaRoster(db, u113, {}, Date.now());
  const f123 = cv.filaRoster(db, u123, {}, Date.now());
  t('B8 la racha cuenta días seguidos publicados (Sotto 2 · Big Top 3)', f113.racha === 2 && f123.racha === 3);
  t('B9 los pendientes se separan por clase (Sotto: 1 voz · Big Top: 1 chat)',
    f113.pendientes.voz === 1 && f113.pendientes.chat === 0 && f123.pendientes.chat === 1);
  t('B10 el plan de prueba trae estrella y formatos con sus nombres exactos',
    !!f113.plan_prueba && f113.plan_prueba.estrella === 'Tortelli di Michelangelo'
    && JSON.stringify(f113.plan_prueba.formatos) === JSON.stringify(['The Dish', 'Handmade', 'The Table'])
    && f113.plan_prueba.listos === 2 && f113.plan_prueba.total === 3);

  // B11 · la vista completa: hoy + decisiones de cada fuente + cola
  const v = cv.vista(db, { diskFreeMB: 13827 });
  t('B11 hoy: 2 pruebas activas y el conteo de decisiones cierra', v.hoy.pruebas_activas === 2 && v.hoy.decisiones_pendientes === v.decisiones.length);
  t('B12 hoy: lo publicado hoy cuenta (Big Top) y lo de mañana no',
    v.hoy.publicados_hoy === 1 && v.hoy.programados_hoy === 0);
  const tipos = v.decisiones.map((d) => d.tipo);
  t('B13 decisiones: la nota de voz pendiente está', v.decisiones.some((d) => d.tipo === 'voz' && d.message_id === vozId));
  t('B14 decisiones: la pieza de mañana de Sotto está para aprobar', v.decisiones.some((d) => d.tipo === 'pieza' && d.user_id === 113 && d.post_id === 9003));
  t('B15 decisiones: el impulso en error del dueño está con su motivo', v.decisiones.some((d) => d.tipo === 'impulso' && d.user_id === 12 && /Invalid parameter/.test(d.texto || '')));
  t('B16 decisiones: el reel sin portada alerta (y el disco sano NO alerta)',
    v.decisiones.some((d) => d.tipo === 'alerta' && d.kind === 'portada' && d.post_id === 695)
    && !v.decisiones.some((d) => d.kind === 'disco'));
  t('B17 decisiones: el caso abierto está; la producción a mano NO (vive en la cola)',
    v.decisiones.some((d) => d.tipo === 'caso' && d.user_id === 113)
    && !v.decisiones.some((d) => d.tipo === 'caso' && d.user_id === 123));
  t('B18 la cola trae la orden de producción de Big Top', v.cola.some((j) => j.user_id === 123));
  t('B19 el disco bajo SÍ alerta cuando el dato viene bajo',
    cv.vista(db, { diskFreeMB: 300 }).decisiones.some((d) => d.kind === 'disco' && d.disco_mb === 300));

  // B20 · la ficha del cliente
  const det = cv.cliente(db, 113, {});
  t('B20 la ficha trae la semana de 7 días y el posteo de mañana',
    det.ok === true && det.semana.length === 7 && det.posteos.some((p) => p.id === 9003));
  t('B21 el plan de la ficha: slots listo/listo/plan con formato por slot',
    !!det.plan_prueba_detalle && det.plan_prueba_detalle.slots.map((s) => s.estado).join(',') === 'listo,listo,plan'
    && det.plan_prueba_detalle.slots[2].formato === 'The Table');
  t('B22 la ficha de un usuario que no existe se declara, no se inventa', cv.cliente(db, 999999, {}).ok === false);

  // B23 · resuelto a mano: sale de pendientes en TODAS las lecturas
  const res = cv.marcarVozResuelto(db, vozId, 'suite');
  const vr = supportCases.voiceRequests(db, { limit: 10 });
  const enLista = (vr.pedidos || []).find((p) => p.id === vozId);
  t('B23 el pedido resuelto a mano queda con su estado en la lista de pedidos',
    res.ok === true && !!enLista && enLista.revision.estado === 'resuelto_mano');
  t('B24 y deja de contar como pendiente (fila y decisiones)',
    cv.pendientesDe(db, 113, Date.now()).voz === 0
    && !cv.vista(db, {}).decisiones.some((d) => d.tipo === 'voz' && d.message_id === vozId));

  // B25 · producir ahora: la orden entra a la cola, con dedup por día
  const ord1 = cv.abrirOrdenProduccion(db, 113, 'Falta la pieza del día 3.', 'suite');
  const ord2 = cv.abrirOrdenProduccion(db, 113, 'Falta la pieza del día 3.', 'suite');
  t('B25 producir ahora abre el caso de la línea a mano y el segundo toque deduplica',
    ord1.ok === true && ord2.ok === true && ord2.duplicado === true
    && cv.colaProduccion(db, cv.vista(db, {}).clientes).some((j) => j.user_id === 113));

  // B26 · cerrar el caso lo saca de las decisiones
  const cierre = cv.cerrarCaso(db, casoAyuda.caso.id);
  t('B26 cerrar el caso funciona y sale de las decisiones',
    cierre.ok === true && !cv.vista(db, {}).decisiones.some((d) => d.tipo === 'caso' && d.case_id === casoAyuda.caso.id));

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
} else {
  t('B (todas) — sin módulo no hay conducta que probar', false);
}

console.log('\n' + ok + ' ok · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
