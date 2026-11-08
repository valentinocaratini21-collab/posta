// test-lote-venty-slice2-fitswapp.js — SLICE 2 FITSWAPP: piloto / cliente
// cero de Venty, solo servidor. Unitarias con DB en memoria (node:sqlite):
// web fitswapp.com como fuente (paleta canónica que manda, semilla Café
// Aroma intacta), IG @fit.swapp registrado en falta_accion, email con
// paleta de Fitswapp + dominio de envío como puerta fail-closed, DM que
// vuelve a Bandeja como «falta el permiso», y hola-inbox sin lector
// inventado. Sin red real ni credenciales reales.
// Uso: node test-lote-venty-slice2-fitswapp.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

const venty = require('./venty');
const conexiones = require('./venty-conexiones');
const gobernador = require('./venty-gobernador');
const ventyIg = require('./venty-instagram');
const ventyEmail = require('./venty-email');
const ventyWeb = require('./venty-web');
const ventyFitswapp = require('./venty-fitswapp');
const holaInbox = require('./hola-inbox');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const db = new DatabaseSync(':memory:');
venty.init(db);
const UID = 1;
venty.asegurarSemilla(db, UID);

(async () => {
  // ---------- A. La web propone, no impone: paleta del dueño manda ----------
  console.log('— A. venty-web: paleta del fundamento no la pisa el sitio');
  conexiones.iniciarConexion(db, UID, 'web', { proveedor: 'sitio', etiqueta: 'https://cafearoma.example' });
  const stubOtraPaleta = async (url) => ({ ok: true, url, name: 'X', description: '', services: [], city: 'CABA', palette: ['#AAAAAA', '#BBBBBB'], photos: [], categoryHint: 'CafeOrCoffeeShop' });
  venty.actualizarFundamentoPuente(db, UID, { paleta: [{ hex: '#111111', rol: 'principal' }, { hex: '#222222', rol: 'acento' }] });
  await ventyWeb.refrescarDesdeWeb(db, UID, 'https://cafearoma.example', { fetchBusinessSite: stubOtraPaleta });
  const palTras = venty.leerFundamento(db, UID).paleta.map((p) => p.hex);
  eq(JSON.stringify(palTras), JSON.stringify(['#111111', '#222222']), 'fundamento con paleta → el refresco NO la pisa');
  venty.actualizarFundamentoPuente(db, UID, { paleta: [] });
  await ventyWeb.refrescarDesdeWeb(db, UID, 'https://cafearoma.example', { fetchBusinessSite: stubOtraPaleta });
  const palVacia = venty.leerFundamento(db, UID).paleta.map((p) => p.hex);
  eq(JSON.stringify(palVacia), JSON.stringify(['#AAAAAA', '#BBBBBB']), 'fundamento sin paleta → el refresco la trae del sitio');

  // ---------- B. Piloto web: fitswapp.com como fuente ----------
  console.log('— B. venty-fitswapp: fuente web fitswapp.com');
  const partidasAntes = venty.listarPartidas(db, UID).length;
  const rubroAntes = venty.leerFundamento(db, UID).rubro;
  const stubFitswapp = async (url) => ({
    ok: true, url, name: 'Fitswapp', description: 'vendé tu ropa sin vueltas',
    services: ['publicar con IA', 'cobro protegido'], city: '', palette: ['#000000', '#FFFFFF'],
    photos: [], categoryHint: '',
  });
  const conWeb = await ventyFitswapp.conectarFuenteWeb(db, UID, { fetchBusinessSite: stubFitswapp });
  ok(conWeb.ok && conWeb.website_url === 'https://fitswapp.com', 'conectarFuenteWeb: URL fijada en el servidor (no la trae el cliente)');
  eq(conWeb.paleta, 'canonica_fitswapp', 'conectarFuenteWeb: paleta canónica del borrador');
  const fWeb = venty.leerFundamento(db, UID);
  eq(fWeb.website_url, 'https://fitswapp.com', 'fundamento: website_url fitswapp.com');
  eq(JSON.stringify(fWeb.paleta.map((p) => p.hex)), JSON.stringify(['#FF6B00', '#0B0B0C']), 'fundamento: paleta canónica (#FF6B00 + #0B0B0C), no la de la landing');
  eq(fWeb.rubro, rubroAntes, 'fundamento: rubro intacto (la web no lo impone)');
  eq(conexiones.estadoCanal(db, UID, 'web').estado, 'conectado', 'conexión web conectada tras el refresco');
  eq(venty.listarPartidas(db, UID).length, partidasAntes, 'simulación Café Aroma: partidas intactas (no se reemplaza)');
  ok(venty.listarPartidas(db, UID).some((p) => p.cliente_nombre === 'Martín'), 'simulación Café Aroma: Martín sigue');
  const evWeb = db.prepare(`SELECT * FROM venty_eventos WHERE user_id = ? AND tipo = 'fitswapp_web_conectada'`).get(UID);
  ok(!!evWeb, 'evento fitswapp_web_conectada registrado');
  const conWebMalo = await ventyFitswapp.conectarFuenteWeb(db, UID, { fetchBusinessSite: async () => null });
  ok(!conWebMalo.ok && conWebMalo.error === 'sitio_sin_respuesta', 'sitio que no responde → error honesto, sin inventar');
  eq(conexiones.estadoCanal(db, UID, 'web').estado, 'falta_accion', 'sitio caído → web en falta una acción');
  eq(JSON.stringify(venty.leerFundamento(db, UID).paleta.map((p) => p.hex)), JSON.stringify(['#FF6B00', '#0B0B0C']), 'refresco fallido → la paleta canónica queda');

  // ---------- C. Piloto IG: @fit.swapp registrado, sin cuenta ----------
  console.log('— C. venty-fitswapp: Instagram @fit.swapp');
  const conIg = ventyFitswapp.conectarInstagram(db, UID);
  eq(conIg.estado, 'falta_accion', 'conectarInstagram: falta una acción (sin cuenta de Meta)');
  eq(conIg.etiqueta, '@fit.swapp', 'conectarInstagram: etiqueta @fit.swapp');
  eq(conIg.cuenta_ref, '', 'conectarInstagram: sin cuenta_ref inventado (el ig user id no se conoce)');
  ok((conIg.ultimo_error || '').includes('cuenta de Meta') && (conIg.ultimo_error || '').includes('instagram_manage_messages'), 'conectarInstagram: motivo exacto (Meta + app review)');
  const whSinDueno = ventyIg.handleWebhook(db, { entry: [{ messaging: [
    { sender: { id: 'sender-x' }, recipient: { id: 'ig-desconocida' }, message: { mid: 'mid-x', text: 'hola' } },
  ] }] });
  eq(whSinDueno.ignorados, 1, 'webhook IG: destinatario sin dueño → ignorado, no se inventa dueño');

  // ---------- D. Email Fitswapp: paleta, firma, una idea ----------
  console.log('— D. venty-fitswapp: plantilla de email con paleta Fitswapp');
  const pieza = ventyFitswapp.construirEmailFitswapp({
    ideas: [{ titulo: 'sumate como fundador', cuerpo: 'vendé tu ropa sin vueltas, 0% comisión inicial.' }, { titulo: 'segunda idea', cuerpo: 'no debe salir' }],
    ctaTexto: 'sumarme', ctaUrl: 'https://fitswapp.com', bajaUrl: 'https://ventysalesmanager.com/api/venty/email/baja?t=x&e=y',
  });
  ok(pieza.html.includes('#FF6B00') && pieza.html.includes('#0B0B0C') && pieza.html.includes('#F2EDE4'), 'plantilla Fitswapp: naranja + negro + crema');
  ok(!pieza.html.includes('#2793C8') && !pieza.html.includes('#FEC14D'), 'plantilla Fitswapp: NO usa azul/amarillo de Posty');
  ok(!pieza.html.includes('#4CAF50') && !pieza.html.includes('#2E7D32'), 'plantilla Fitswapp: NO usa verde de Venty');
  ok(pieza.html.includes('El equipo de Fitswapp'), 'plantilla Fitswapp: firma «El equipo de Fitswapp» (nunca Venty)');
  ok(pieza.html.includes('sumate como fundador') && !pieza.html.includes('segunda idea'), 'una idea por email: dos ideas → solo la primera');
  ok(pieza.html.includes('darte de baja'), 'plantilla Fitswapp: link de baja');
  ok(pieza.html.includes('background:#0B0B0C') && pieza.html.includes('color:#F2EDE4'), 'plantilla Fitswapp: cabecera negra con texto crema');
  ok(pieza.html.includes('background:#FF6B00') && pieza.html.includes('color:#0B0B0C'), 'plantilla Fitswapp: CTA naranja con texto negro');
  const vieja = ventyEmail.construirEmailNegocio({
    negocio: 'Café Aroma', paleta: [{ hex: '#7A4A21', rol: 'principal' }, { hex: '#E8D5B5', rol: 'acento' }],
    idea: { titulo: 't', cuerpo: 'c' }, ctaTexto: 'ir', ctaUrl: 'https://x.example',
  });
  ok(vieja.html.includes('background:#7A4A21') && vieja.html.includes('color:#fff'), 'sin estilo: comportamiento v721 intacto (cabecera principal, texto blanco)');

  // ---------- E. Dominio de envío: puerta fail-closed ----------
  console.log('— E. venty-fitswapp: dominio de envío + envío piloto gated');
  eq(ventyFitswapp.fijarDominioEnvio(db, UID, '').error, 'sin_dominio', 'dominio vacío → sin_dominio');
  eq(ventyFitswapp.fijarDominioEnvio(db, UID, 'https://fitswapp.com').error, 'dominio_invalido', 'dominio con protocolo → inválido');
  eq(ventyFitswapp.fijarDominioEnvio(db, UID, 'fitswapp').error, 'dominio_invalido', 'dominio sin TLD → inválido');
  eq(ventyFitswapp.fijarDominioEnvio(db, UID, 'postycommunitymanager.com').error, 'dominio_de_posty', 'dominio de Posty → rechazado');
  let llamadasEnvio = 0;
  let ultimoFrom = '';
  const emailStub = { sendEmail: async (args) => { llamadasEnvio++; ultimoFrom = args.from || ''; return { ok: true, id: 're_fit_1' }; } };
  const sinDominio = await ventyFitswapp.enviarEmailPiloto(db, UID, { jugadaId: 0, emailMod: emailStub });
  ok(!sinDominio.ok && sinDominio.error === 'falta_dominio_envio', 'sin dominio decidido → el envío no sale (falta_dominio_envio)');
  eq(llamadasEnvio, 0, 'sin dominio → sendEmail ni se llama');
  const domOk = ventyFitswapp.fijarDominioEnvio(db, UID, 'FITSWAPP.COM');
  ok(domOk.ok && domOk.dominio === 'fitswapp.com', 'fijarDominioEnvio: se guarda en minúscula');
  eq(ventyFitswapp.remitenteDe('fitswapp.com'), 'Fitswapp <hola@fitswapp.com>', 'remitente: Fitswapp <hola@<dominio>>');
  // Conexión email viva (puerta v721) + jugada email_prospecto.
  process.env.VENTY_EM_FIT = 'resend-falso-fit';
  conexiones.iniciarConexion(db, UID, 'email', { proveedor: 'resend', etiqueta: 'ventas fitswapp', credencial_ref: 'VENTY_EM_FIT' });
  conexiones.marcarFetch(db, UID, 'email', {});
  ok(conexiones.estadoCanal(db, UID, 'email').viva, 'conexión email viva para el piloto');
  db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
    .run(UID, null, 'email_prospecto', JSON.stringify({ para: 'local@example.com', titulo: 'sumate como fundador', cuerpo: 'vendé tu ropa sin vueltas.', negocio: 'Fitswapp', remitente: 'El equipo de Fitswapp' }), 'primer contacto fundador');
  const jugFit = db.prepare(`SELECT * FROM venty_jugadas WHERE user_id = ? AND tipo = 'email_prospecto' ORDER BY id DESC LIMIT 1`).get(UID);
  const sinAceptarFit = await ventyFitswapp.enviarEmailPiloto(db, UID, { jugadaId: jugFit.id, emailMod: emailStub });
  ok(!sinAceptarFit.ok && sinAceptarFit.error === 'jugada_no_aceptada', 'email piloto sin jugada aceptada → bloqueado');
  venty.resolverJugada(db, UID, jugFit.id, 'aceptar', '');
  let htmlEnviado = '';
  const emailCaptura = { sendEmail: async (args) => { llamadasEnvio++; ultimoFrom = args.from || ''; htmlEnviado = args.html || ''; return { ok: true, id: 're_fit_2' }; } };
  const rFit = await ventyFitswapp.enviarEmailPiloto(db, UID, { jugadaId: jugFit.id, bajaUrlBase: 'https://ventysalesmanager.com', emailMod: emailCaptura });
  ok(rFit.ok && rFit.id === 're_fit_2', 'email piloto con dominio + jugada aceptada → enviado');
  eq(ultimoFrom, 'Fitswapp <hola@fitswapp.com>', 'email piloto: from Fitswapp, nunca Posty');
  ok(htmlEnviado.includes('#FF6B00') && htmlEnviado.includes('darte de baja'), 'email piloto enviado: paleta Fitswapp + baja');
  eq(gobernador.usadosHoy(db, UID, 'email'), 1, 'gobernador: 1 email piloto consumido');
  // Suprimido → bloqueado aunque la jugada esté aceptada.
  ventyEmail.suprimir(db, UID, 'suprimido@example.com', 'baja');
  db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
    .run(UID, null, 'email_prospecto', JSON.stringify({ para: 'suprimido@example.com', titulo: 't', cuerpo: 'c' }), 'x');
  const jugSup = db.prepare(`SELECT * FROM venty_jugadas WHERE user_id = ? AND tipo = 'email_prospecto' ORDER BY id DESC LIMIT 1`).get(UID);
  venty.resolverJugada(db, UID, jugSup.id, 'aceptar', '');
  const rSup = await ventyFitswapp.enviarEmailPiloto(db, UID, { jugadaId: jugSup.id, emailMod: emailStub });
  ok(!rSup.ok && rSup.error === 'suprimido', 'email piloto a suprimido → bloqueado');

  // ---------- F. IG: sin permiso de Meta el DM vuelve a Bandeja ----------
  console.log('— F. venty-instagram: falta_permiso_instagram');
  process.env.VENTY_IG_FIT = 'ig-tok-falso-fit';
  conexiones.revocarConexion(db, UID, 'instagram');
  conexiones.iniciarConexion(db, UID, 'instagram', { proveedor: 'meta', etiqueta: '@fit.swapp', credencial_ref: 'VENTY_IG_FIT', cuenta_ref: 'ig-fit-1' });
  conexiones.marcarFetch(db, UID, 'instagram', { cuenta_ref: 'ig-fit-1' });
  ok(conexiones.estadoCanal(db, UID, 'instagram').viva, 'conexión IG viva para el test de permiso');
  const nuevaJugadaDm = (sender) => {
    db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
      .run(UID, null, 'responder_dm', JSON.stringify({ ig_sender_id: sender, texto_entrante: 'hola, quiero vender' }), 'te escribió por instagram');
    return db.prepare(`SELECT * FROM venty_jugadas WHERE user_id = ? AND tipo = 'responder_dm' ORDER BY id DESC LIMIT 1`).get(UID);
  };
  const jugPerm = nuevaJugadaDm('sender-fit-1');
  venty.resolverJugada(db, UID, jugPerm.id, 'aceptar', '');
  const rPerm = await ventyIg.enviarDM(db, UID, { jugadaId: jugPerm.id, texto: 'hola, contame qué tenés para vender', insights: { sendDM: async () => { throw new Error('OAuthException (#10) Application does not have permission for this action'); } } });
  ok(!rPerm.ok && rPerm.error === 'falta_permiso_instagram', 'sendDM con error de permiso → falta_permiso_instagram');
  const deVuelta = venty.listarBandeja(db, UID).find((j) => j.id === jugPerm.id);
  ok(!!deVuelta && deVuelta.estado === 'pendiente', 'DM sin permiso → la jugada vuelve a Bandeja (pendiente)');
  ok((deVuelta.nota_dueno || '').includes('instagram_manage_messages'), 'jugada en Bandeja con el motivo del permiso');
  eq(gobernador.usadosHoy(db, UID, 'instagram'), 0, 'gobernador: cupo de IG devuelto tras el fallo de permiso');
  const jugOtro = nuevaJugadaDm('sender-fit-2');
  venty.resolverJugada(db, UID, jugOtro.id, 'aceptar', '');
  const rOtro = await ventyIg.enviarDM(db, UID, { jugadaId: jugOtro.id, texto: 'hola, contame qué tenés para vender', insights: { sendDM: async () => { throw new Error('timeout de red'); } } });
  ok(!rOtro.ok && rOtro.error === 'timeout de red', 'error que NO es de permiso → pasa tal cual, sin marcar falta de permiso');
  ok(!venty.listarBandeja(db, UID).find((j) => j.id === jugOtro.id), 'error no-permiso → la jugada NO vuelve a Bandeja (sigue aceptada)');
  eq(gobernador.usadosHoy(db, UID, 'instagram'), 0, 'gobernador: cupo devuelto también tras error no-permiso');
  eq(ventyIg.marcarFaltaPermiso(db, UID, 999999, 'x').ok, false, 'marcarFaltaPermiso con jugada inexistente → error');

  // ---------- G. Buzón: sin lector inventado ----------
  console.log('— G. hola-inbox: punto de enchufe, sin lector falso');
  const poll = await holaInbox.pollInbox(db, null);
  ok(poll && poll.available === false, 'pollInbox sigue sin fuente: available false, honesto');
  const ingId = ventyEmail.registrarIngesta(db, UID, { huella_corta: 'abcd1234', de: 'local@example.com', asunto: 're: sumate como fundador' });
  ok(ingId > 0 && !!db.prepare('SELECT * FROM venty_email_ingestas WHERE id = ?').get(ingId), 'registrarIngesta: punto de enchufe vivo (el worker lo alimenta después)');

  // ---------- H. Estado del piloto (usuario nuevo, sin nada conectado) ----------
  console.log('— H. venty-fitswapp: estadoPiloto');
  const UID2 = 7;
  venty.asegurarSemilla(db, UID2);
  const est0 = ventyFitswapp.estadoPiloto(db, UID2);
  eq(est0.fundamento, 'borrador_sin_aprobar', 'estadoPiloto: el fundamento es borrador, nunca aprobado');
  eq(est0.whatsapp.estado, 'excluido_piloto', 'estadoPiloto: WhatsApp excluido del piloto');
  ok(est0.whatsapp.bloqueo.includes('no tiene WhatsApp Business'), 'estadoPiloto: motivo de exclusión de WhatsApp');
  eq(est0.email.dominio_envio, '', 'estadoPiloto: sin dominio al inicio');
  ok(!est0.email.listo_para_enviar_real, 'estadoPiloto: email no listo sin dominio');
  eq(est0.bloqueos.length, 3, 'estadoPiloto: 3 bloqueos (dominio + cuenta Meta + app review)');
  ok(est0.bloqueos.every((b) => b.que && b.quien && b.que_pedir), 'estadoPiloto: cada bloqueo dice qué falta, de quién y qué pedirle');
  ok(est0.bloqueos.some((b) => b.quien === 'Valentino' && b.que.includes('dominio')), 'estadoPiloto: bloqueo dominio → Valentino');
  ok(est0.bloqueos.some((b) => b.quien === 'Meta (trámite)'), 'estadoPiloto: bloqueo app review → Meta (trámite)');
  ventyFitswapp.fijarDominioEnvio(db, UID2, 'fitswapp.com');
  eq(ventyFitswapp.estadoPiloto(db, UID2).bloqueos.length, 2, 'con dominio fijado: quedan 2 bloqueos (Meta)');
  const ig2 = ventyFitswapp.conectarInstagram(db, UID2);
  eq(ig2.etiqueta, '@fit.swapp', 'conectarInstagram en usuario nuevo: @fit.swapp');
  eq(ventyFitswapp.estadoPiloto(db, UID2).instagram.estado, 'falta_accion', 'estadoPiloto: IG en falta_accion tras registrar');
  const web2 = await ventyFitswapp.conectarFuenteWeb(db, UID2, { fetchBusinessSite: stubFitswapp });
  ok(web2.ok, 'conectarFuenteWeb en usuario nuevo: ok');
  eq(ventyFitswapp.estadoPiloto(db, UID2).web.estado, 'conectado', 'estadoPiloto: web conectada');
  eq(venty.listarPartidas(db, UID2).some((p) => p.cliente_nombre === 'Martín'), true, 'usuario nuevo: la semilla Café Aroma sigue intacta tras conectar la fuente');

  db.close();
  console.log(`\n— venty-slice2-fitswapp (unit): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
