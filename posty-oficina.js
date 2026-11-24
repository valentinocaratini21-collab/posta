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
const preguntasPosteos = require('./preguntas-posteos'); // PP-PREGUNTAS-POSTEOS-OFICINA

// (LOTE BANDEJA-NOMBRE · defecto del dueño 24/11) Las cuentas demo de
// la oficina (84 Café Aroma y las vidriera 86–90) no dejan decisiones
// en la Bandeja: su semana es material de muestra, no trabajo real.
const CUENTAS_DEMO = [84, 86, 87, 88, 89, 90];
function esCuentaDemo(uid) { return CUENTAS_DEMO.includes(Number(uid)); }

// Los datos reales del negocio dueño de la tarjeta: nombre, @, la
// estrella de su fundamento (si la declaró) y su idioma.
function datosNegocio(db, uid) {
  let negocio = '', ig = '', estrella = '', en = false;
  try { const u = db.prepare('SELECT lang FROM users WHERE id = ?').get(uid); en = !!(u && u.lang === 'en'); } catch (e) {}
  try {
    const p = db.prepare('SELECT business_name, ig_username FROM profiles WHERE user_id = ?').get(uid);
    if (p) { negocio = p.business_name || ''; ig = p.ig_username || ''; }
  } catch (e) {}
  if (!negocio) { try { const f = db.prepare("SELECT hecho FROM oficina_fundamento WHERE user_id = ? AND clave = 'nombre'").get(uid); if (f) negocio = f.hecho || ''; } catch (e) {} }
  try { const f = db.prepare("SELECT hecho FROM oficina_fundamento WHERE user_id = ? AND clave LIKE '%estrella%' ORDER BY ts DESC LIMIT 1").get(uid); if (f) estrella = f.hecho || ''; } catch (e) {}
  return { negocio, ig, estrella, en };
}

// Concordancia: «1 posteo» / «N posteos», en el idioma de la cuenta.
function nPosteos(n, en) { return en ? (n === 1 ? '1 post' : n + ' posts') : (n === 1 ? '1 posteo' : n + ' posteos'); }
function nBorradores(n, en) { return en ? (n === 1 ? '1 draft' : n + ' drafts') : (n === 1 ? '1 borrador' : n + ' borradores'); }
function nProgramados(n, en) { return en ? (n === 1 ? '1 scheduled' : n + ' scheduled') : (n === 1 ? '1 programado' : n + ' programados'); }
function nPublicados(n, en) { return en ? (n === 1 ? '1 published' : n + ' published') : (n === 1 ? '1 publicado' : n + ' publicados'); }

// Los textos de la tarjeta de la semana, desde la cuenta real: nada de
// texto demo — el negocio, su estrella y su idioma mandan.
function textosSemana(db, uid, c) {
  const d = datosNegocio(db, uid);
  const nom = d.negocio || (d.en ? 'your business' : 'tu negocio');
  const detalle = `${nBorradores(c.borradores, d.en)} · ${nProgramados(c.programados, d.en)} · ${nPublicados(c.publicados, d.en)}`;
  const resumen = d.en
    ? `Posty built the week for ${nom} from its foundation: ${nPosteos(c.total, true)} (${detalle})`
    : `Posty armó la semana de ${nom} desde su fundamento: ${nPosteos(c.total, false)} (${detalle})`;
  const que = d.en ? 'Your Instagram week is ready' : 'Tu semana de Instagram está lista';
  const propuesta = d.en
    ? `Posty made ${nPosteos(c.total, true)} from your foundation: your price list, your palette${d.estrella ? ' and your star (' + d.estrella + ')' : ''}. If you accept, the week is set and Posty's autopilot posts on its own, as always on your account.`
    : `Posty generó ${nPosteos(c.total, false)} desde tu fundamento: tu lista de precios, tu paleta${d.estrella ? ' y tu estrella (' + d.estrella + ')' : ''}. Si aceptás, la semana queda aceptada y el autopiloto de Posty publica solo, como siempre en tu cuenta.`;
  return { resumen, que, propuesta, datos: d };
}

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
  if (esCuentaDemo(uid)) return { ok: true, semana: false, causa: 'cuenta_demo', conteo: c };
  if (!c.total) return { ok: true, semana: false, causa: 'sin_posteos_todavia', conteo: c };
  const ya = db.prepare("SELECT id, registro_ref FROM oficina_registros WHERE user_id = ? AND poder = 'posty' AND tipo = 'semana' AND salida = 1").get(uid);
  if (ya) {
    // Ítems de la era del texto demo: si la tarjeta de esta semana quedó
    // sin el negocio en su contexto, se reescribe con los datos reales
    // de la cuenta (su nombre, su idioma, su conteo) en esta misma sync.
    try {
      const t = textosSemana(db, uid, c);
      const items = db.prepare("SELECT id, contexto_json FROM oficina_bandeja WHERE user_id = ? AND poder = 'posty' AND registro_ref = ?").all(uid, ya.registro_ref || '');
      for (const it of items) {
        let ctx = null; try { ctx = it.contexto_json ? JSON.parse(it.contexto_json) : null; } catch (e) {}
        if (ctx && ctx.tipo === 'semana_posty' && !ctx.negocio) {
          ctx.negocio = t.datos.negocio; ctx.ig = t.datos.ig;
          db.prepare('UPDATE oficina_bandeja SET que = ?, propuesta = ?, contexto_json = ? WHERE id = ?').run(t.que, t.propuesta, JSON.stringify(ctx), it.id);
        }
      }
    } catch (e) {}
    return { ok: true, semana: true, ya_registrada: true, conteo: c };
  }
  const t = textosSemana(db, uid, c);
  const sal = oficina.registrarSalida(db, uid, {
    poder: 'posty', tipo: 'semana',
    resumen: t.resumen,
    recibo: { motor: 'Posty (su generador de semanas)', posteos: c.total, borradores: c.borradores, programados: c.programados, publicados: c.publicados },
    evento_nivel: 'semana_generada',
  });
  await oficina.crearBandejaItem(db, uid, {
    poder: 'posty',
    que: t.que,
    propuesta: t.propuesta,
    contexto: { tipo: 'semana_posty', registro_ref: sal.registro_ref, negocio: t.datos.negocio, ig: t.datos.ig },
    registro_ref: sal.registro_ref,
  });
  return { ok: true, semana: true, salida: sal.registro_ref, conteo: c };
}

// La decisión del dueño sobre la semana: Posty aprende de ella.
function hookBandeja(db, uid, item, accion) {
  // PP-PREGUNTAS-POSTEOS-OFICINA: propuesta pregunta->posteo. SOLO se
  // registra la decisión en el río. Nunca crea posteos ni publica: la
  // conversión a borrador la hace el generador semanal (pendiente del
  // turno del push) con imagen del fundamento, no acá.
  if (item.contexto && item.contexto.tipo === 'pregunta_posteo') {
    const ef = preguntasPosteos.efectoDecisionPregunta(
      { contexto: item.contexto, nota_dueno: item.nota_dueno }, accion);
    oficina.registrarRegistro(db, uid, {
      poder: 'posty', tipo: ef.tipo, resumen: ef.resumen, estado: ef.estado,
    });
    return { detalle: ef.tipo };
  }
  if (!item.contexto || item.contexto.tipo !== 'semana_posty') return null;
  if (accion === 'aceptar') {
    niveles.registrarEvento(db, uid, {
      poder: 'posty', evento: 'semana_aceptada',
      hecho: 'El dueño aceptó la semana entera de ' + (((item.contexto || {}).negocio) || 'tu negocio'), registro_ref: item.registro_ref || '',
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
    reply: `Tu semana ya está armada desde tu fundamento: ${nPosteos(c.total, false)} (${c.publicados} publicados · ${c.programados} programados · ${c.borradores} en borrador).${pend ? ' Te está esperando en la Bandeja para tu OK.' : ' El autopiloto publica solo, como siempre.'}`,
  };
}

// El DISEÑO es una capacidad de Posty (4+4): lo responde él, desde las
// piezas reales de la cuenta — no hay un poder de diseño separado.
function rutaDiseno(db, uid) {
  const c = conteoSemana(db, uid);
  if (!c.total) {
    return { reply: 'El diseño de tus piezas es mío: trabajo con tu paleta, tu estrella y tu fundamento. Todavía no hay piezas esta semana; cuando el motor las arme, las ves en tu Agenda y en el río.' };
  }
  return {
    reply: `El diseño de tus piezas es mío: salen de tu paleta y tu fundamento, nunca de una plantilla genérica. Esta semana hay ${nPosteos(c.total, false)} armados (${c.borradores} en borrador · ${c.programados} programados · ${c.publicados} publicados).`,
  };
}

// El CRECIMIENTO es una capacidad de Posty (4+4): las campañas se arman
// en MODO SOMBRA declarado — propuestas sin gastar un peso, con número
// medido antes de hablar de resultados (la medición real llega con la
// Marketing API). El rótulo queda intacto.
function rutaCrecimiento(db, uid) {
  return {
    reply: 'El crecimiento de tu Instagram también es mío. Las campañas se arman en MODO SOMBRA: la propuesta llega a tu Bandeja con su número esperado antes de gastar un peso — sin medición, no hay promesa. Cuando una campaña esté lista para tu OK, aparece ahí.',
  };
}

let iniciado = false;
function init() {
  if (iniciado) return;
  iniciado = true;
  oficina.registrarHookBandeja('posty', hookBandeja);
  // Las rutas específicas (sus capacidades) van ANTES que la de la semana.
  oficina.registrarRutaChat('posty', [/crec|seguidor|campañ|anuncio|pauta/i], async (db, uid) => rutaCrecimiento(db, uid));
  oficina.registrarRutaChat('posty', [/diseñ|pieza|flyer|marca/i], async (db, uid) => rutaDiseno(db, uid));
  oficina.registrarRutaChat('posty', [/semana|posteos|instagram|public|feed/i], async (db, uid) => rutaChat(db, uid));
}

module.exports = { init, sincronizarSemana, conteoSemana, hookBandeja, rutaDiseno, rutaCrecimiento };
