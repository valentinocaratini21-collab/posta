// posty-oficina.js — POSTY dentro de la oficina (programa TestFlight).
// Su superpoder, demostrado con trabajo real: la semana que el motor de
// Posty genera desde el fundamento entra al río como salida con recibo,
// va a la Bandeja con la propuesta armada, y el OK del dueño la deja
// aceptada — la publicación la sigue haciendo el autopiloto de Posty,
// como en su propia app. Nada se simula: sincronizarSemana lee los
// posteos REALES de la cuenta (tabla posts) y registra lo que hay.
'use strict';

const oficina = require('./oficina');
const niveles = require('./niveles');

function conteoSemana(db, uid) {
  let rows = [];
  try { rows = db.prepare('SELECT status, COUNT(*) AS n FROM posts WHERE user_id = ? GROUP BY status').all(uid); } catch (e) {}
  const por = {};
  let total = 0;
  for (const r of rows) { por[r.status] = r.n; total += r.n; }
  return { total, borradores: por.draft || 0, programados: por.scheduled || 0, publicados: por.published || 0, por_estado: por };
}

// Si el motor ya generó la semana y la oficina todavía no la registró,
// la registra: salida con recibo + Bandeja con la propuesta armada.
// Idempotente: una sola salida «semana» por cuenta en el programa.
async function sincronizarSemana(db, uid) {
  const c = conteoSemana(db, uid);
  if (!c.total) return { ok: true, semana: false, causa: 'sin_posteos_todavia', conteo: c };
  const ya = db.prepare("SELECT id FROM oficina_registros WHERE user_id = ? AND poder = 'posty' AND tipo = 'semana' AND salida = 1").get(uid);
  if (ya) return { ok: true, semana: true, ya_registrada: true, conteo: c };
  const sal = oficina.registrarSalida(db, uid, {
    poder: 'posty', tipo: 'semana',
    resumen: `Posty armó la semana de Café Aroma desde su fundamento: ${c.total} posteos (${c.borradores} borradores · ${c.programados} programados · ${c.publicados} publicados)`,
    recibo: { motor: 'Posty (su generador de semanas)', posteos: c.total, borradores: c.borradores, programados: c.programados, publicados: c.publicados },
    evento_nivel: 'semana_generada',
  });
  await oficina.crearBandejaItem(db, uid, {
    poder: 'posty',
    que: 'Tu semana de Instagram está lista',
    propuesta: `Posty generó ${c.total} posteos desde tu fundamento: tu lista de precios, tu paleta y tu estrella (el Brunch Aroma para dos). Si aceptás, la semana queda aceptada y el autopiloto de Posty publica solo, como siempre en tu cuenta.`,
    contexto: { tipo: 'semana_posty', registro_ref: sal.registro_ref },
    registro_ref: sal.registro_ref,
  });
  return { ok: true, semana: true, salida: sal.registro_ref, conteo: c };
}

// La decisión del dueño sobre la semana: Posty aprende de ella.
function hookBandeja(db, uid, item, accion) {
  if (!item.contexto || item.contexto.tipo !== 'semana_posty') return null;
  if (accion === 'aceptar') {
    niveles.registrarEvento(db, uid, {
      poder: 'posty', evento: 'semana_aceptada',
      hecho: 'El dueño aceptó la semana entera de Café Aroma', registro_ref: item.registro_ref || '',
    }, oficina.metricas(db, uid));
    oficina.registrarRegistro(db, uid, {
      poder: 'posty', tipo: 'semana_aceptada',
      resumen: 'Semana aceptada por el dueño: el autopiloto de Posty publica solo',
      estado: 'aceptada',
    });
    return { detalle: 'semana_aceptada' };
  }
  oficina.registrarRegistro(db, uid, {
    poder: 'posty', tipo: 'semana_cambio',
    resumen: `El dueño pidió un cambio en la semana: ${item.nota_dueno || 'sin nota'}`,
    estado: 'cambio_pedido',
  });
  return { detalle: 'cambio_registrado' };
}

// El chat: lo de Posty lo responde Posty, desde los posteos reales.
function rutaChat(db, uid) {
  const c = conteoSemana(db, uid);
  if (!c.total) {
    return { reply: 'Todavía no armé tu primera semana en esta oficina. Trabajo desde tu fundamento: cuando el motor la genere, aparece en tu Agenda, en el río y en tu Bandeja para tu OK.' };
  }
  const pend = oficina.listarBandeja(db, uid, { soloPendientes: true }).filter((i) => i.poder === 'posty').length;
  return {
    reply: `Tu semana ya está armada desde tu fundamento: ${c.total} posteos (${c.publicados} publicados · ${c.programados} programados · ${c.borradores} en borrador).${pend ? ' Te está esperando en la Bandeja para tu OK.' : ' El autopiloto publica solo, como siempre.'}`,
  };
}

let iniciado = false;
function init() {
  if (iniciado) return;
  iniciado = true;
  oficina.registrarHookBandeja('posty', hookBandeja);
  oficina.registrarRutaChat('posty', [/semana|posteos|instagram|public|feed/i], async (db, uid) => rutaChat(db, uid));
}

module.exports = { init, sincronizarSemana, conteoSemana, hookBandeja };
