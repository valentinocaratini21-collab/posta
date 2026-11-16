// test-lote-venty-slice4-representantes.js — SLICE 4: unitarias.
// Scoring con puerta, oleada en espejo + gobernador, ingesta autenticada
// y carga idempotente del piloto fitswapp (198 leads, zonas en orden,
// oleada 1 con los 10 fundadores, todo borrador/espejo, cero envíos).
// Uso: node test-lote-venty-slice4-representantes.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

const venty = require('./venty');
const gobernador = require('./venty-gobernador');
const ventyEmail = require('./venty-email');
const ventyFitswapp = require('./venty-fitswapp');
const oleadas = require('./venty-oleadas');
const ingesta = require('./venty-ingesta-buzon');
const carga = require('./venty-piloto-carga');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const db = new DatabaseSync(':memory:');
venty.init(db);
ventyEmail.ensureSchema(db);
const UID = 1;
venty.asegurarSemilla(db, UID);

// ---------- A. scoring con la puerta «tiene que buscar clientes» ----------
console.log('— A. scoring: la puerta manda sobre el puntaje');
{
  const conPuerta = oleadas.puntuar({ ig: '@x', tienda_online: true, consignacion: true, fundador_star: true });
  eq(conPuerta.puntaje, 100, 'puntuar completo: 100');
  eq(conPuerta.tier, 'A', '85+ con puerta sí → tier a');
  ok(conPuerta.puerta_busca_clientes && conPuerta.evidencia_puerta.length > 0, 'puerta sí exige evidencia registrada');
  const sinPuerta = oleadas.puntuar({ ig: '@x', tienda_online: true, fundador_star: true });
  eq(sinPuerta.puntaje, 90, 'sin consignación: 90 puntos igual');
  eq(sinPuerta.tier, 'B', '85+ sin la puerta → topado en tier b');
  ok(sinPuerta.topado_por_puerta === true, 'el tope por puerta queda marcado');
  const medio = oleadas.puntuar({ ig: '@x' });
  eq(medio.tier, 'C', '65 sin puerta ni extras → tier c, no entra en oleadas');
  const bJusto = oleadas.tierDe(84, true);
  eq(bJusto.tier, 'B', 'tier b es 70–84 aunque la puerta sea sí');
  const aJusto = oleadas.tierDe(85, true);
  eq(aJusto.tier, 'A', '85 con puerta → a (regla pura)');
  const topado = oleadas.tierDe(95, false);
  ok(topado.tier === 'B' && topado.topado_por_puerta, '95 sin puerta → b topado (regla pura)');
  const cerrado = oleadas.puntuar({ ig: '@x', cerrado: true, consignacion: true });
  eq(cerrado.tier, 'excluido', 'cerrado → excluido, nunca se escribe');
  const temp = oleadas.puntuar({ temporalmente_cerrado: true });
  eq(temp.motivo_exclusion, 'posiblemente_cerrado_temporal', 'possibly temporarily closed → excluido hasta reverificar');
  const mayor = oleadas.puntuar({ mayorista: true, ig: '@m' });
  eq(mayor.tier, 'excluido', 'mayorista → excluido de la oleada 1');
  const inf = oleadas.puntuar({ infantil: true, ig: '@i' });
  eq(inf.tier, 'excluido', 'infantil → excluido de la oleada 1');
  const sinVer = oleadas.puntuar({ ig: '@x', tienda_online: true, consignacion: true, sin_verificar: true });
  ok(sinVer.puntaje <= 69 && sinVer.tier !== 'A', 'sin reverificar en persona no llega a tier a');
}

// ---------- B. textos del playbook (t1–t4 sí, t5/t6 no) ----------
console.log('— B. textos: playbook fitswapp, voz baja, una idea');
{
  const lead = { nombre: 'Galpón de Ropa', canal_preferido: 'instagram' };
  for (const t of ['T1', 'T2', 'T3', 'T4']) {
    const p = oleadas.textoPara(lead, t, {});
    ok(p.ok, t + ': tipo válido para fitswapp');
    ok(!/[¿¡]/.test(p.texto + ' ' + (p.asunto || '')), t + ': cero signos de apertura');
    ok(p.texto.charAt(0) === p.texto.charAt(0).toLowerCase(), t + ': arranca en minúscula');
    ok(venty.validarVoz(p.texto).ok, t + ': pasa el validador de voz de venty');
    ok(!/venty/.test(p.texto.replace('equipo de fitswapp', '')), t + ': no vende a venty, escribe fitswapp');
  }
  eq(oleadas.textoPara(lead, 'T5', {}).ok, false, 't5 reactivación no aplica todavía a fitswapp');
  eq(oleadas.textoPara(lead, 'T6', {}).ok, false, 't6 reseña no aplica todavía a fitswapp');
  const pieza = ventyFitswapp.construirEmailFitswapp({ idea: { titulo: oleadas.textoPara(lead, 'T1', {}).asunto, cuerpo: oleadas.textoPara(lead, 'T1', {}).texto }, ctaTexto: 'quiero ser fundador', ctaUrl: 'https://fitswapp.com' });
  ok(pieza.html.includes('#FF6B00') && pieza.html.includes('#0B0B0C'), 'email fitswapp: paleta del borrador (naranja y negro)');
  ok(!pieza.html.includes('#4CAF50') && !pieza.html.includes('#2793C8'), 'email fitswapp: cero colores de venty o posty');
}

// ---------- C. carga del piloto: 198 leads, zonas en orden, oleada 1 ----------
console.log('— C. carga del piloto fitswapp (borrador/espejo, idempotente)');
let censo1;
{
  const r = carga.cargarPiloto(db, UID, {});
  ok(r.ok && !r.ya_cargado, 'primera carga: ok');
  censo1 = carga.censo(db, UID);
  eq(censo1.filas_fuente, 198, 'la fuente congelada al 6/11 trae 198 filas');
  eq(censo1.leads, 198, 'carga: 198 leads');
  eq(JSON.stringify(censo1.zonas.map((z) => z.orden)), JSON.stringify([1, 2, 3, 4, 5]), 'zonas en el orden del borrador §11');
  eq(censo1.zonas[0].nombre, 'Palermo', 'zona 1 es palermo');
  eq(censo1.zonas[4].nombre, 'GBA', 'zona 5 es gba');
  eq(censo1.representantes, 5, 'un representante por zona (5)');
  const reps = venty.listarRepresentantes(db, UID);
  ok(reps.every((x) => x.remitente_wa === ''), 'whatsapp fuera del piloto: ningún representante tiene remitente de whatsapp');
  ok(reps.every((x) => x.remitente_ig === '@fit.swapp'), 'los representantes trabajan instagram @fit.swapp');
  eq(censo1.oleada1.items, 10, 'oleada 1 en espejo con los 10 candidatos fundadores');
  const items = db.prepare(`SELECT i.*, l.nombre FROM venty_s4_oleada_items i JOIN venty_leads l ON l.id = i.lead_id WHERE i.oleada_id = ?`).all(censo1.oleada1.id);
  const nombres = items.map((i) => i.nombre).sort();
  eq(JSON.stringify(nombres), JSON.stringify([...carga.FUNDADORES_OLEADA1].sort()), 'la oleada 1 es exactamente la lista de fundadores del borrador');
  ok(items.every((i) => i.estado === 'espejo'), 'oleada 1: todos los ítems en espejo');
  ok(items.every((i) => i.canal === 'instagram' || i.canal === 'email'), 'oleada 1: solo email e instagram, cero whatsapp');
  eq(censo1.leads_por_estado.pendiente, 198, 'todos los leads quedan pendientes (borrador)');
  const sinCanal = db.prepare(`SELECT COUNT(*) c FROM venty_leads l JOIN venty_s4_lead_detalle d ON d.lead_id = l.id
    WHERE l.user_id = ? AND l.canal_preferido = '' AND d.tier <> 'excluido'`).get(UID);
  ok(sinCanal.c > 0, 'hay leads sin canal confirmado: quedan sin destino de dm ni de email');
  const excluidos = db.prepare(`SELECT COUNT(*) c FROM venty_s4_lead_detalle WHERE user_id = ? AND tier = 'excluido'`).get(UID);
  ok(excluidos.c >= 5, 'descartados o sin verificar de la lista quedan excluidos de la oleada 1 (' + excluidos.c + ')');
  const eureka = db.prepare(`SELECT COUNT(DISTINCT clave_negocio) c FROM venty_s4_lead_detalle WHERE user_id = ? AND clave_negocio LIKE 'eureka%'`).get(UID);
  eq(eureka.c, 1, 'eureka viene dos veces en la fuente con una sola clave de negocio: la oleada lo contacta una vez');
  eq(ventyFitswapp.estadoPiloto(db, UID).fundamento, 'borrador_sin_aprobar', 'la carga no aprueba el fundamento: sigue borrador');
  eq(ventyFitswapp.leerPiloto(db, UID).dominio_envio, '', 'puerta falta_dominio_envio sigue cerrada tras la carga');
  eq(gobernador.usadosHoy(db, UID, 'email'), 0, 'cero envíos de email en la carga');
  eq(gobernador.usadosHoy(db, UID, 'instagram'), 0, 'cero envíos de instagram en la carga');
  const envios = db.prepare('SELECT COUNT(*) c FROM venty_email_envios WHERE user_id = ?').get(UID);
  eq(envios.c, 0, 'registro de envíos real vacío: nada salió');
  const r2 = carga.cargarPiloto(db, UID, {});
  ok(r2.ok && r2.ya_cargado, 'segunda carga: idempotente, no duplica');
  const censo2 = carga.censo(db, UID);
  eq(censo2.leads, 198, 'tras la segunda carga siguen siendo 198 leads');
  eq(censo2.oleada1.items, 10, 'tras la segunda carga la oleada 1 sigue con 10');
}

// ---------- D. espejo obligatorio + gobernador ----------
console.log('— D. espejo obligatorio y cupo del gobernador');
{
  const v0 = oleadas.verificarSalida(db, UID, censo1.oleada1.id, {});
  eq(v0.puede_salir, false, 'sin espejo aceptado la oleada no puede salir');
  ok(v0.bloqueos.some((b) => b.error === 'sin_espejo_aceptado'), 'el bloqueo es sin_espejo_aceptado');
  const jugadas = db.prepare(`SELECT jugada_id FROM venty_s4_oleada_items WHERE oleada_id = ?`).all(censo1.oleada1.id);
  for (const j of jugadas) venty.resolverJugada(db, UID, j.jugada_id, 'aceptar', '');
  const v1 = oleadas.verificarSalida(db, UID, censo1.oleada1.id, {});
  eq(v1.espejo_aceptado, true, 'con las jugadas aceptadas en bandeja el espejo queda aceptado');
  eq(v1.puede_salir, true, 'espejo aceptado + cupo ok → el dictamen de oleadas pasa (las puertas del piloto son otra capa)');
  const v2 = oleadas.verificarSalida(db, UID, censo1.oleada1.id, { puertasExtra: [{ error: 'falta_dominio_envio' }] });
  ok(!v2.puede_salir && v2.bloqueos.some((b) => b.error === 'falta_dominio_envio'), 'con la puerta del dominio cerrada no sale aunque el espejo esté aceptado');
  // gobernador frenando la preparación por cupo:
  const U2 = 2;
  venty.asegurarSemilla(db, U2);
  const z = venty.crearZona(db, U2, { nombre: 'Zona Cupo', ciudad: 'prueba' });
  gobernador.setTope(db, U2, 'instagram', 3);
  for (let i = 0; i < 5; i++) venty.crearLead(db, U2, { nombre: 'Local Cupo ' + i, zona_id: z.id, canal_preferido: 'instagram', contacto_ref: '@cupo' + i, puntaje: 90, porque: 'prueba' });
  const ol = oleadas.prepararOleadaZona(db, U2, z.id, { piloto: 'prueba' });
  eq(ol.items.length, 3, 'el gobernador frena la oleada en espejo al cupo del canal (3 de 5)');
  const ol2 = oleadas.prepararOleadaZona(db, U2, z.id, { piloto: 'prueba' });
  ok(ol2.ya_existia && ol2.items.length === 3, 'la oleada del día es idempotente por zona y fecha');
  const dev = gobernador.pedirPermiso(db, U2, 'instagram', 1, 'prueba devolución');
  ok(dev.permitido, 'pedirPermiso consume para la prueba de devolución');
  gobernador.devolverConsumo(db, U2, 'instagram', 1, 'el envío falló');
  eq(gobernador.usadosHoy(db, U2, 'instagram'), 0, 'si el envío falla el cupo se devuelve (el espejo nunca consumió)');
}

// ---------- E. ingesta de buzón autenticada ----------
console.log('— E. ingesta: secreto en tiempo constante, hilo + jugada, baja');
{
  delete process.env.VENTY_INGESTA_SECRET;
  eq(ingesta.verificarSecreto({ 'x-venty-ingesta-secret': 'lo-que-sea' }).error, 'ingesta_cerrada', 'sin secreto configurado la ruta queda cerrada');
  process.env.VENTY_INGESTA_SECRET = 'secreto-ingesta-test';
  eq(ingesta.verificarSecreto({}).error, 'sin_secreto', 'sin header → rechazada');
  eq(ingesta.verificarSecreto({ 'x-venty-ingesta-secret': 'otro' }).error, 'secreto_incorrecto', 'secreto incorrecto → rechazada');
  ok(ingesta.verificarSecreto({ 'x-venty-ingesta-secret': 'secreto-ingesta-test' }).ok, 'secreto correcto → aceptada');
  const dir = ventyEmail.generarDireccion(db, UID);
  const token = dir.direccion.split('venty+')[1].split('@')[0];
  const r = ingesta.procesarIngesta(db, { de: 'local@example.com', para: dir.direccion, asunto: 're: fitswapp fundadores', cuerpo: 'hola, me interesa sumarme como fundador', message_id: 'msg-s4-1' });
  ok(r.ok && r.partida_id && r.jugada_id, 'ingesta válida: entra como hilo + jugada');
  const partida = db.prepare('SELECT * FROM venty_partidas WHERE id = ?').get(r.partida_id);
  eq(partida.canal, 'email', 'el hilo de la respuesta es de email');
  const jugada = db.prepare('SELECT * FROM venty_jugadas WHERE id = ?').get(r.jugada_id);
  ok(jugada.tipo === 'responder_email' && jugada.estado === 'pendiente', 'la respuesta espera en la bandeja como jugada pendiente');
  const ing = db.prepare('SELECT COUNT(*) c FROM venty_email_ingestas WHERE user_id = ?').get(UID);
  ok(ing.c >= 1, 'la ingesta alimenta registrarIngesta de venty-email');
  const dup = ingesta.procesarIngesta(db, { de: 'local@example.com', para: dir.direccion, asunto: 're: fitswapp fundadores', cuerpo: 'hola, me interesa sumarme como fundador', message_id: 'msg-s4-1' });
  ok(dup.ok && dup.duplicada, 'mismo message_id → duplicada, no crea otro hilo');
  const baja = ingesta.procesarIngesta(db, { de: 'baja@example.com', para: dir.direccion, asunto: 'baja', cuerpo: 'quiero darme de baja, no me escriban más', message_id: 'msg-s4-2' });
  ok(baja.ok && baja.baja, 'pedido de baja por ingesta: registrado como baja');
  ok(ventyEmail.estaSuprimido(db, UID, 'baja@example.com'), 'opt-out inmediato: el remitente queda suprimido');
  ok(!baja.jugada_id, 'la baja no crea jugada de respuesta');
  const sinDueno = ingesta.procesarIngesta(db, { de: 'x@example.com', para: 'venty+000000000000000000000000000000000000000000000000@ventysalesmanager.com', asunto: 'hola', cuerpo: 'sin dueño', message_id: 'msg-s4-3' });
  ok(sinDueno.ok && sinDueno.sin_dueno, 'token sin dueño: se registra y no se inventa hilo');
  void token;
}

console.log(`\n— venty-slice4-representantes (unit): ${total - fails}/${total} OK, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
