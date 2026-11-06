// test-lote-venty-conectar4.js — VENTY-CONECTAR-4: suites por módulo.
// Unitarias con DB en memoria (node:sqlite): conexiones, gobernador,
// representantes/leads + puente del fundamento, email (dirección, plantilla
// con paleta, opt-out), WhatsApp por cliente, webhook de Instagram y web
// como fuente. Sin red real: los envíos usan fetchImpl stub.
// Uso: node test-lote-venty-conectar4.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

const venty = require('./venty');
const conexiones = require('./venty-conexiones');
const gobernador = require('./venty-gobernador');
const ventyWa = require('./venty-whatsapp');
const ventyIg = require('./venty-instagram');
const ventyEmail = require('./venty-email');
const ventyWeb = require('./venty-web');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const db = new DatabaseSync(':memory:');
venty.init(db);
const UID = 1;
venty.asegurarSemilla(db, UID);

// ---------- A. Conexiones ----------
console.log('— A. venty-conexiones');
{
  const lista = conexiones.listarConexiones(db, UID);
  eq(lista.length, 4, 'listar: siempre los 4 canales');
  eq(lista.find((c) => c.canal === 'whatsapp').estado, 'pendiente', 'sin fila: whatsapp pendiente/no conectado');
  ok(!lista.find((c) => c.canal === 'whatsapp').viva, 'sin fila: whatsapp no viva');
  const sinRef = conexiones.iniciarConexion(db, UID, 'whatsapp', { proveedor: 'meta', etiqueta: 'mi número' });
  eq(sinRef.estado, 'falta_accion', 'iniciar sin credencial_ref → falta una acción');
  let rechazo = '';
  try { conexiones.iniciarConexion(db, UID, 'instagram', { credencial_ref: 'EAABwzLixnjYBADskdjfh38r9fh238fh2398fh2' }); } catch (e) { rechazo = e.message; }
  ok(/secreto/.test(rechazo), 'iniciar con valor que parece secreto en claro → rechazado');
  try { conexiones.iniciarConexion(db, UID, 'instagram', { token: 'abc' }); } catch (e) { rechazo = e.message; }
  ok(/credencial_ref/.test(rechazo), 'iniciar con campo secreto → rechazado (solo credencial_ref)');
  let dup = '';
  try { conexiones.iniciarConexion(db, UID, 'whatsapp', { credencial_ref: 'VENTY_WA_T1' }); } catch (e) { dup = e.message; }
  ok(/ya tiene/.test(dup), 'segunda conexión en el mismo canal sin revocar → rechazado');
  // Con ref presente en env: pendiente → fetch → conectado.
  process.env.VENTY_WA_T1 = 'tok-falso';
  process.env.VENTY_WA_T1_PHONE_NUMBER_ID = 'pnid-1';
  const rev = conexiones.revocarConexion(db, UID, 'whatsapp');
  eq(rev.estado, 'revocada', 'revocar → revocada');
  const re = conexiones.iniciarConexion(db, UID, 'whatsapp', { proveedor: 'meta', etiqueta: 'mi número', credencial_ref: 'VENTY_WA_T1', cuenta_ref: 'pnid-1' });
  eq(re.estado, 'pendiente', 're-iniciar tras revocar → pendiente');
  const viva = conexiones.marcarFetch(db, UID, 'whatsapp', { cuenta_ref: 'pnid-1' });
  eq(viva.estado, 'conectado', 'marcarFetch con credencial presente → conectado');
  ok(viva.viva, 'conectado + fetch + credencial → viva');
  eq(conexiones.resolverDuenoPorCuenta(db, 'whatsapp', 'pnid-1'), UID, 'ruteo webhook por phone_number_id → dueño');
  eq(conexiones.resolverDuenoPorCuenta(db, 'whatsapp', 'pnid-otro'), null, 'phone_number_id desconocido → sin dueño');
  const resumen = conexiones.resumenEstado(db, UID);
  eq(resumen.find((c) => c.canal === 'whatsapp').estado, 'conectado', 'resumenEstado: whatsapp conectado (real, no hardcodeado)');
  eq(resumen.find((c) => c.canal === 'instagram').estado, 'no_conectado', 'resumenEstado: instagram sin fila → no_conectado');
}

// ---------- B. Gobernador ----------
console.log('— B. venty-gobernador');
{
  const c0 = gobernador.consultar(db, UID, 'whatsapp', 1);
  ok(c0.permitido && c0.tope === 20 && c0.usados === 0, 'tope default whatsapp 20/día, 0 usados');
  const p1 = gobernador.pedirPermiso(db, UID, 'whatsapp', 1, 'test');
  ok(p1.permitido && p1.usados === 1 && p1.registrado, 'pedirPermiso consume 1');
  const web = gobernador.consultar(db, UID, 'web', 1);
  ok(!web.permitido && web.motivo === 'canal_sin_cupo', 'la web no envía: sin cupo');
  const desc = gobernador.consultar(db, UID, 'canal_raro', 1);
  ok(!desc.permitido, 'canal desconocido → no permitido (fail-closed)');
  let techo = '';
  try { gobernador.setTope(db, UID, 'whatsapp', 500); } catch (e) { techo = e.message; }
  ok(/techo/.test(techo), 'subir tope sobre el techo de seguridad → rechazado');
  const bajo = gobernador.setTope(db, UID, 'email', 5);
  eq(bajo.tope, 5, 'bajar tope de email a 5 → ok');
  for (let i = 0; i < 5; i++) gobernador.pedirPermiso(db, UID, 'email', 1, 'test');
  const sinCupo = gobernador.consultar(db, UID, 'email', 1);
  ok(!sinCupo.permitido && sinCupo.motivo === 'cupo_diario_agotado', 'tope 5 agotado → no permitido');
  const dev = gobernador.devolverConsumo(db, UID, 'email', 1, 'fallo proveedor');
  eq(dev.devuelto, 1, 'devolverConsumo devuelve 1 tras fallo');
  ok(gobernador.consultar(db, UID, 'email', 1).permitido, 'tras devolver, vuelve a haber cupo');
  const dia = gobernador.resumenDia(db, UID);
  eq(dia.length, 3, 'resumenDia: 3 canales de envío');
}

// ---------- C. Zonas / representantes / leads + puente fundamento ----------
console.log('— C. representantes + puente');
{
  const z1 = venty.crearZona(db, UID, { nombre: 'Centro', ciudad: 'CABA' });
  ok(z1.ok && z1.id, 'crearZona Centro');
  const zDup = venty.crearZona(db, UID, { nombre: 'Centro' });
  ok(!zDup.ok && zDup.error === 'zona_ya_existe', 'zona duplicada → error');
  const z2 = venty.crearZona(db, UID, { nombre: 'Barrio Norte', ciudad: 'CABA' });
  const r1 = venty.crearRepresentante(db, UID, { zona_id: z1.id, nombre: 'Ana', remitente_nombre: 'Ana de Café Aroma', remitente_ig: '@cafe.aroma' });
  ok(r1.ok && r1.id, 'crearRepresentante en Centro');
  const rDup = venty.crearRepresentante(db, UID, { zona_id: z1.id, nombre: 'Otro' });
  ok(!rDup.ok && rDup.error === 'zona_ya_tiene_representante', 'UN representante por zona: segundo → error');
  const r2 = venty.crearRepresentante(db, UID, { zona_id: z2.id, nombre: 'Bruno', remitente_nombre: 'Bruno de Café Aroma' });
  ok(r2.ok, 'representante distinto en Barrio Norte → ok');
  eq(venty.listarRepresentantes(db, UID).length, 2, 'listarRepresentantes: 2');
  ok(venty.representanteDeZona(db, UID, z1.id).nombre === 'Ana', 'representanteDeZona Centro → Ana');
  const l1 = venty.crearLead(db, UID, { zona_id: z1.id, nombre: 'Gimnasio Fuerza Viva', canal_preferido: 'instagram', contacto_ref: '@fuerzaviva', puntaje: 91, porque: 'tiene que buscar clientes' });
  ok(l1.ok && l1.id, 'crearLead Gimnasio Fuerza Viva');
  const lDup = venty.crearLead(db, UID, { zona_id: z2.id, nombre: 'gimnasio  fuerza viva', canal_preferido: 'email' });
  ok(!lDup.ok && lDup.error === 'lead_ya_existe' && lDup.lead_id === l1.id, 'lead duplicado (nombre normalizado, otra zona) → mismo lead, no se escribe dos veces');
  eq(venty.listarLeads(db, UID).length, 1, 'listarLeads: 1 (dedupe por negocio+prospecto)');
  // Puente del fundamento.
  const f0 = venty.leerFundamento(db, UID);
  eq(f0.website_url, '', 'fundamento sin website_url al inicio');
  const f1 = venty.actualizarFundamentoPuente(db, UID, { website_url: 'https://cafearoma.example', ciudad: 'CABA', paleta: [{ hex: '#7A4A21', rol: 'principal' }, { hex: '#E8D5B5', rol: 'acento' }] });
  eq(f1.website_url, 'https://cafearoma.example', 'puente: website_url guardado');
  eq(f1.ciudad, 'CABA', 'puente: ciudad guardada');
  eq(f1.paleta.length, 2, 'puente: paleta guardada (2 hex)');
  eq(f1.precios.length, 10, 'puente: precios intactos (la web no pisa precios)');
  // Puente desde Posty (solo lectura). Las tablas viven en db.js en
  // producción; acá se crean mínimas para el test.
  db.exec(`CREATE TABLE IF NOT EXISTS business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT '')`);
  db.exec(`CREATE TABLE IF NOT EXISTS client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT '')`);
  db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))`).run(UID, JSON.stringify({ website_url: 'https://otro.example' }));
  db.prepare(`INSERT INTO client_digest (user_id, digest_json, hash, version, updated_at) VALUES (?, ?, '', 1, datetime('now'))`).run(UID, JSON.stringify({ paleta: [{ hex: '#123456', rol: 'principal' }] }));
  const puente = ventyWeb.puenteDesdePosty(db, UID);
  eq(puente.website_url, 'https://otro.example', 'puenteDesdePosty lee website_url de business_dna');
  eq(puente.paleta[0].hex, '#123456', 'puenteDesdePosty lee paleta de client_digest');
}

// ---------- D. Email: dirección, plantilla, opt-out ----------
console.log('— D. venty-email');
{
  process.env.VENTY_EMAIL_UNSUB_SECRET = 'secreto-test-baja';
  const gen = ventyEmail.generarDireccion(db, UID);
  ok(/^venty\+[0-9a-f]{48}@ventysalesmanager\.com$/.test(gen.direccion), 'dirección de reenvío con token de 48 hex');
  ok(gen.huella_corta.length === 8, 'huella corta de 8');
  const fila = db.prepare('SELECT * FROM venty_email_direccion WHERE user_id = ?').get(UID);
  ok(!JSON.stringify(fila).includes(gen.direccion.split('@')[0].split('+')[1]), 'el token en claro NO está en la DB (solo su huella)');
  const est = ventyEmail.estadoDireccion(db, UID);
  ok(est.existe && est.direccion_visible.includes('••••••••'), 'estadoDireccion enmascarado (nunca muestra el token)');
  const token = gen.direccion.split('+')[1].split('@')[0];
  eq(ventyEmail.resolverToken(db, token), UID, 'resolverToken por huella → dueño');
  eq(ventyEmail.resolverToken(db, '00'.repeat(24)), null, 'token desconocido → null');
  const gen2 = ventyEmail.generarDireccion(db, UID);
  ok(gen2.mato_anterior && gen2.direccion !== gen.direccion, 'regenerar mata la anterior');
  eq(ventyEmail.resolverToken(db, token), null, 'el token viejo ya no resuelve');
  // Supresión + baja.
  ok(!ventyEmail.estaSuprimido(db, UID, 'prospecto@example.com'), 'no suprimido al inicio');
  ventyEmail.suprimir(db, UID, 'Prospecto@Example.com', 'baja');
  ok(ventyEmail.estaSuprimido(db, UID, 'prospecto@example.com'), 'suprimir normaliza el email (case-insensitive)');
  const tok = ventyEmail.tokenBaja(UID, 'otro@example.com');
  // (El secreto de baja vive en env en producción; en el test se fija uno.)
  ok(tok.length === 32 && ventyEmail.verificarBaja(UID, 'otro@example.com', tok), 'token de baja HMAC válido');
  ok(!ventyEmail.verificarBaja(UID, 'otro@example.com', tok + 'x'), 'token de baja alterado → inválido');
  ok(!ventyEmail.verificarBaja(UID, 'distinto@example.com', tok), 'token de baja de otro email → inválido');
  // Plantilla con la paleta DEL NEGOCIO.
  const pieza = ventyEmail.construirEmailNegocio({
    negocio: 'Café Aroma', paleta: [{ hex: '#7A4A21', rol: 'principal' }, { hex: '#E8D5B5', rol: 'acento' }],
    idea: { titulo: 'brunch para dos este finde', cuerpo: 'te guardamos mesa el sábado.' },
    ctaTexto: 'reservar', ctaUrl: 'https://cafearoma.example/reserva',
    bajaUrl: 'https://ventysalesmanager.com/api/venty/email/baja?t=x&e=y', remitente: 'Ana de Café Aroma',
  });
  ok(pieza.html.includes('#7A4A21') && pieza.html.includes('#E8D5B5'), 'plantilla usa la paleta del negocio');
  ok(!pieza.html.includes('#2793C8') && !pieza.html.includes('#FEC14D'), 'plantilla NO usa colores de Posty');
  ok(!pieza.html.includes('#4CAF50') && !pieza.html.includes('#2E7D32'), 'plantilla NO usa colores de Venty');
  ok(pieza.html.includes('darte de baja'), 'plantilla incluye link de baja');
  const dos = ventyEmail.construirEmailNegocio({ negocio: 'Café Aroma', paleta: [], ideas: [{ titulo: 'idea uno', cuerpo: 'cuerpo uno' }, { titulo: 'idea dos', cuerpo: 'cuerpo dos' }] });
  ok(dos.ideaExtra && dos.html.includes('idea uno') && !dos.html.includes('idea dos'), 'una idea por email: dos ideas → solo la primera');
  const neutra = ventyEmail.construirEmailNegocio({ negocio: 'X', paleta: [], idea: { titulo: 't', cuerpo: 'c' } });
  ok(neutra.html.includes('#5A6B7A'), 'sin paleta: fallback neutro (gris, nunca marca)');
}

// ---------- E. WhatsApp por cliente ----------
console.log('— E. venty-whatsapp');
(async () => {
  const fetchStub = async (url, opts) => {
    const body = JSON.parse(opts.body);
    ok(body.type === 'text' && body.to === '5491112345678', 'fetch WA: texto libre al número del lead');
    ok(String(opts.headers.Authorization).includes('tok-falso'), 'fetch WA: Authorization con el token por cliente');
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.1' }] }) };
  };
  const r1 = await ventyWa.enviarTexto(db, UID, { to: '5491112345678', texto: 'hola, soy ana de café aroma', fetchImpl: fetchStub });
  ok(r1.ok && r1.messageId === 'wamid.1', 'enviarTexto por cliente → ok con provider id');
  const hilos = ventyWa.listarHilos(db, UID);
  eq(hilos.length, 1, 'hilo por lead creado');
  eq(hilos[0].mensajes, 1, 'mensaje saliente guardado en el hilo');
  // Recepción: mensaje entrante + baja.
  const inc = ventyWa.handleIncomingVenty(db, { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: 'pnid-1' },
    messages: [
      { from: '5491112345678', id: 'wamid.in1', text: { body: 'me interesa el brunch' } },
      { from: '5491199999999', id: 'wamid.in2', text: { body: 'BAJA' } },
    ],
  } }] }] });
  eq(inc.recibidos, 2, 'webhook WA: 2 mensajes recibidos');
  eq(inc.optouts, 1, 'webhook WA: la baja marca opt-out');
  const hiloBaja = ventyWa.listarHilos(db, UID).find((h) => h.wa_numero === '5491199999999');
  ok(hiloBaja && hiloBaja.opt_out === 1, 'hilo con baja → opt_out');
  const rOpt = await ventyWa.enviarTexto(db, UID, { to: '5491199999999', texto: 'hola de nuevo', fetchImpl: fetchStub });
  ok(!rOpt.ok && rOpt.error === 'opt_out', 'enviar a lead con opt-out → bloqueado');
  const incSinDueno = ventyWa.handleIncomingVenty(db, { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: 'pnid-desconocido' },
    messages: [{ from: '5491100000000', id: 'wamid.in3', text: { body: 'hola' } }],
  } }] }] });
  eq(incSinDueno.ignorados, 1, 'webhook WA: número sin dueño → ignorado');
  const sinCred = await ventyWa.enviarTexto(db, 999, { to: '5491112345678', texto: 'hola', fetchImpl: fetchStub });
  ok(!sinCred.ok && sinCred.error === 'whatsapp_no_conectado', 'sin conexión viva → no sale nada');
  // Gobernador: el cupo de whatsapp se consumió con el envío (20/día default).
  eq(gobernador.usadosHoy(db, UID, 'whatsapp'), 2, 'gobernador: whatsapp consumió 2 (1 en B + 1 envío real en E)');

  // ---------- F. Instagram webhook + DM ----------
  console.log('— F. venty-instagram');
  process.env.INSTAGRAM_VERIFY_TOKEN = 'verify-falso';
  const chal = ventyIg.verifyWebhookGet({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-falso', 'hub.challenge': 'CHAL123' });
  eq(chal, 'CHAL123', 'webhook IG GET: challenge con token correcto');
  eq(ventyIg.verifyWebhookGet({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': 'CHAL123' }), null, 'webhook IG GET: token incorrecto → null');
  // Conexión IG viva para el ruteo.
  process.env.VENTY_IG_T1 = 'ig-tok-falso';
  conexiones.iniciarConexion(db, UID, 'instagram', { proveedor: 'meta', etiqueta: '@cafe.aroma', credencial_ref: 'VENTY_IG_T1', cuenta_ref: 'ig-123' });
  conexiones.marcarFetch(db, UID, 'instagram', { cuenta_ref: 'ig-123' });
  ok(conexiones.estadoCanal(db, UID, 'instagram').viva, 'conexión IG viva para el webhook');
  const wh = ventyIg.handleWebhook(db, { entry: [{ messaging: [
    { sender: { id: 'sender-1' }, recipient: { id: 'ig-123' }, message: { mid: 'mid-1', text: 'hola, cuánto sale el brunch?' } },
    { sender: { id: 'sender-1' }, recipient: { id: 'ig-123' }, message: { mid: 'mid-1', text: 'hola, cuánto sale el brunch?' } },
    { sender: { id: 'sender-2' }, recipient: { id: 'ig-otra' }, message: { mid: 'mid-2', text: 'hola' } },
  ] }] });
  eq(wh.recibidos, 1, 'webhook IG: 1 mensaje recibido (duplicado mid no duplica)');
  eq(wh.jugadas, 1, 'webhook IG: 1 jugada responder_dm en Bandeja');
  eq(wh.ignorados, 1, 'webhook IG: mensaje a otra cuenta → ignorado');
  const bandeja = venty.listarBandeja(db, UID);
  const jug = bandeja.find((j) => j.tipo === 'responder_dm');
  ok(!!jug, 'jugada responder_dm en Bandeja');
  const dmSinAceptar = await ventyIg.enviarDM(db, UID, { jugadaId: jug.id, texto: 'hola, el brunch sale $24.000', insights: { sendDM: async () => true } });
  ok(!dmSinAceptar.ok && dmSinAceptar.error === 'jugada_no_aceptada', 'DM sin jugada aceptada → bloqueado (espejo + Bandeja)');
  venty.resolverJugada(db, UID, jug.id, 'aceptar', '');
  const dmMalaVoz = await ventyIg.enviarDM(db, UID, { jugadaId: jug.id, texto: '¿Hola? ¡El Brunch!', insights: { sendDM: async () => true } });
  ok(!dmMalaVoz.ok && dmMalaVoz.error === 'voz_invalida', 'DM con voz inválida (¿/¡/mayúscula) → bloqueado');
  const dmOk = await ventyIg.enviarDM(db, UID, { jugadaId: jug.id, texto: 'hola, el brunch aroma para dos sale $24.000', insights: { sendDM: async () => true } });
  ok(dmOk.ok, 'DM con jugada aceptada + voz válida → enviado (transporte stub)');
  eq(gobernador.usadosHoy(db, UID, 'instagram'), 1, 'gobernador: 1 DM consumido');

  // ---------- G. Web como fuente ----------
  console.log('— G. venty-web');
  const stubSitio = async (url) => ({ ok: true, url, name: 'Café Aroma', description: 'café de especialidad', services: ['brunch', 'café'], city: 'CABA', palette: ['#7A4A21', '#E8D5B5'], photos: [], facts: {}, address: '', categoryHint: 'CafeOrCoffeeShop' });
  conexiones.iniciarConexion(db, UID, 'web', { proveedor: 'sitio', etiqueta: 'https://cafearoma.example' });
  const ref = await ventyWeb.refrescarDesdeWeb(db, UID, 'https://cafearoma.example', { fetchBusinessSite: stubSitio });
  ok(ref.ok && ref.sitio.ciudad === 'CABA', 'refrescarDesdeWeb: ciudad del sitio');
  eq(venty.leerFundamento(db, UID).paleta.length, 2, 'refrescarDesdeWeb: paleta en el fundamento');
  eq(conexiones.estadoCanal(db, UID, 'web').estado, 'conectado', 'refrescarDesdeWeb: conexión web conectada');
  const refMalo = await ventyWeb.refrescarDesdeWeb(db, UID, 'https://caido.example', { fetchBusinessSite: async () => null });
  ok(!refMalo.ok && refMalo.error === 'sitio_sin_respuesta', 'sitio que no responde → error honesto, sin inventar');
  eq(conexiones.estadoCanal(db, UID, 'web').estado, 'falta_accion', 'sitio caído → web en falta una acción');

  // ---------- H. Email: envío gated ----------
  console.log('— H. envío de email gated');
  process.env.VENTY_EM_T1 = 'resend-falso';
  conexiones.iniciarConexion(db, UID, 'email', { proveedor: 'resend', etiqueta: 'ventas', credencial_ref: 'VENTY_EM_T1' });
  conexiones.marcarFetch(db, UID, 'email', {});
  ok(conexiones.estadoCanal(db, UID, 'email').viva, 'conexión email viva');
  // Jugada email_prospecto aceptada.
  db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
    .run(UID, null, 'email_prospecto', JSON.stringify({ para: 'prospecto2@example.com', titulo: 'brunch para dos', cuerpo: 'te guardamos mesa el sábado.', negocio: 'Café Aroma', remitente: 'Ana de Café Aroma' }), 'primer contacto');
  const jugEmail = db.prepare(`SELECT * FROM venty_jugadas WHERE user_id = ? AND tipo = 'email_prospecto' ORDER BY id DESC LIMIT 1`).get(UID);
  const sinAceptar = await ventyEmail.enviarEmail(db, UID, { jugadaId: jugEmail.id, emailMod: { sendEmail: async () => ({ ok: true, id: 're_1' }) } });
  ok(!sinAceptar.ok && sinAceptar.error === 'jugada_no_aceptada', 'email sin jugada aceptada → bloqueado');
  venty.resolverJugada(db, UID, jugEmail.id, 'aceptar', '');
  // Destinatario suprimido → bloqueado aunque la jugada esté aceptada.
  db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
    .run(UID, null, 'email_prospecto', JSON.stringify({ para: 'prospecto@example.com', titulo: 't', cuerpo: 'c' }), 'x');
  const jugSup = db.prepare(`SELECT * FROM venty_jugadas WHERE user_id = ? AND tipo = 'email_prospecto' ORDER BY id DESC LIMIT 1`).get(UID);
  venty.resolverJugada(db, UID, jugSup.id, 'aceptar', '');
  const rSup = await ventyEmail.enviarEmail(db, UID, { jugadaId: jugSup.id, emailMod: { sendEmail: async () => ({ ok: true, id: 're_2' }) } });
  ok(!rSup.ok && rSup.error === 'suprimido', 'email a destinatario suprimido → bloqueado');
  let enviadoHtml = '';
  const rEmail = await ventyEmail.enviarEmail(db, UID, { jugadaId: jugEmail.id, bajaUrlBase: 'https://ventysalesmanager.com', emailMod: { sendEmail: async (args) => { enviadoHtml = args.html; return { ok: true, id: 're_3' }; } } });
  ok(rEmail.ok && rEmail.id === 're_3', 'email con jugada aceptada → enviado');
  ok(enviadoHtml.includes('#7A4A21') && enviadoHtml.includes('darte de baja'), 'email enviado con paleta del negocio + link de baja');
  eq(gobernador.usadosHoy(db, UID, 'email'), 5, 'gobernador: email 5 usados (5 en B - 1 devuelto + 1 envío real en H)');
  db.close();
  console.log(`\n— venty-conectar4 (unit): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
