// gesty-propuestas-conexion.js — PROPUESTAS JUSTO A TIEMPO (decisión de
// producto Valentino 29/10: NO en el onboarding). El onboarding sigue intacto
// (un clic, 5 preguntas, menos de un minuto, sin conexiones). Las conexiones
// se proponen DESPUÉS, una por una, en el momento en que le ahorran al dueño
// un dolor que acaba de sentir, en palabras simples y con un toque.
//
// Momentos (uno por conexión, nunca las 3 juntas ni un checklist):
// · facturador — la primera vez que sube una foto de factura:
//   «¿Conecto tu facturador para que la próxima entre sola?»
// · email — la primera vez que reenvía un email:
//   «¿Conecto tu casilla para que no tengas que reenviar más?»
// · banco — cuando necesita datos del banco para conciliar:
//   «¿Conecto tu banco o seguimos por extractos?»
//   El banco va último: su momento llega último en el flujo (conciliar
//   supone papeles en movimiento) y sale último en la muestra de
//   desbloqueos. No hay demora artificial: si el momento real llega,
//   la propuesta llega.
//
// Si el dueño dice «después» (o no tiene las credenciales a mano), NO se
// insiste: la propuesta no vuelve a aparecer jamás por esa conexión; queda
// en Ajustes → Conexiones para cuando quiera. La prueba y el trabajo siguen
// igual con los puentes (foto, reenvío, extractos). Nada se bloquea por no
// conectar. Responder «aceptada» solo inicia el permiso: la conexión la
// crea conectar() cuando el permiso se completa (un toque para iniciar).
// Responder «extractos» (solo banco) elige el camino sin conexión.
//
// Las propuestas NO son tarjetas de Bandeja (deliberado): no son una
// aprobación, son un ofrecimiento en el momento. Viven en dos lugares: el
// momento mismo (flujo de subida, de reenvío o vista de conciliación) como
// nudge de un toque, y Ajustes → Conexiones como tarjeta persistente.
// Durante la prueba en espejo, mostrarDesbloqueos() muestra lo que cada
// conexión desbloquearía, como propuesta, nunca como requisito para probar.
'use strict';
const gesty = require('./gesty.js');
const conexiones = require('./gesty-conexiones.js');
const comprobantes = require('./gesty-comprobantes.js');
const conciliacion = require('./gesty-conciliacion.js');

const TEXTOS = {
  facturador: '¿Conecto tu facturador para que la próxima entre sola?',
  email: '¿Conecto tu casilla para que no tengas que reenviar más?',
  banco: '¿Conecto tu banco o seguimos por extractos?',
};
const MOMENTOS = {
  facturador: 'primera-foto-factura',
  email: 'primer-reenvio',
  banco: 'conciliacion-pendiente',
};
const RESPUESTAS = ['aceptada', 'despues', 'extractos'];

function fail(m) { const e = new Error(m); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function ensureSchema(db) {
  gesty.ensureSchema(db);
  conexiones.ensureSchema(db);
  comprobantes.ensureSchema(db);
  conciliacion.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_propuestas_conexion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plataforma TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    momento TEXT NOT NULL DEFAULT '',
    contexto TEXT NOT NULL DEFAULT '{}',
    respuesta TEXT NOT NULL DEFAULT '',
    propuesta_en TEXT NOT NULL DEFAULT (datetime('now')),
    respondida_en TEXT NOT NULL DEFAULT '',
    UNIQUE(user_id, plataforma)
  )`);
}

function parseRow(r) {
  if (!r) return null;
  let contexto = {};
  try { contexto = JSON.parse(r.contexto || '{}'); } catch (e) { contexto = {}; }
  return {
    id: r.id, user_id: r.user_id, plataforma: r.plataforma, texto: r.texto,
    momento: r.momento, contexto, respuesta: r.respuesta || '',
    propuesta_en: r.propuesta_en || '', respondida_en: r.respondida_en || '',
  };
}

function getPropuesta(db, userId, plataforma) {
  ensureSchema(db);
  return parseRow(db.prepare('SELECT * FROM gesty_propuestas_conexion WHERE user_id = ? AND plataforma = ?').get(userId, String(plataforma)));
}

function listPropuestas(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_propuestas_conexion WHERE user_id = ? ORDER BY id ASC').all(userId).map(parseRow);
}

// ¿Hay motivo real de banco? Movimientos sin conciliar + papeles leídos
// esperando. Sin ese momento, la propuesta de banco no existe.
function hayMotivoBanco(db, userId) {
  ensureSchema(db);
  const mov = db.prepare(`SELECT COUNT(*) AS n FROM gesty_conciliacion_movimientos
    WHERE user_id = ? AND estado IN ('sin-conciliar','sin-par')`).get(userId);
  if (!mov || !mov.n) return false;
  const pap = db.prepare(`SELECT COUNT(*) AS n FROM gesty_comprobantes
    WHERE user_id = ? AND estado_lectura = 'leido' AND (duplicado_de IS NULL OR duplicado_de = 0)`).get(userId);
  return !!pap && !!pap.n;
}

function proponer(db, userId, plataforma, contexto) {
  ensureSchema(db);
  const plat = String(plataforma);
  if (!TEXTOS[plat]) fail(`Plataforma inválida para propuesta: ${plat}.`);
  // Ya conectada: nada que proponer.
  const activas = conexiones.conexionesActivas(db, userId, plat);
  if (activas.length) return null;
  const existente = getPropuesta(db, userId, plat);
  if (existente) {
    // Cerrada para siempre (después / aceptada / extractos): no vuelve.
    if (existente.respuesta) return null;
    // Pendiente sin responder: se devuelve la misma, nunca un duplicado.
    return { propuesta: existente, nueva: false };
  }
  const info = db.prepare(`INSERT INTO gesty_propuestas_conexion
    (user_id, plataforma, texto, momento, contexto) VALUES (?,?,?,?,?)`)
    .run(userId, plat, TEXTOS[plat], MOMENTOS[plat], JSON.stringify(contexto || {}));
  return { propuesta: getPropuesta(db, userId, plat), nueva: true };
}

function proponerFacturador(db, userId, contexto) { return proponer(db, userId, 'facturador', contexto); }
function proponerEmail(db, userId, contexto) { return proponer(db, userId, 'email', contexto); }
function proponerBanco(db, userId, contexto) {
  ensureSchema(db);
  if (!hayMotivoBanco(db, userId)) return null;
  return proponer(db, userId, 'banco', contexto);
}

// Entrada principal para la app: la app llama con el evento que acaba de
// observar (el dolor que el dueño acaba de sentir) y recibe la propuesta
// de ese momento, o null. Eventos: 'subida-factura' | 'reenvio-email' |
// 'conciliacion-pendiente'.
function evaluarMomentos(db, userId, evento) {
  ensureSchema(db);
  if (evento === 'subida-factura') return proponerFacturador(db, userId, { evento });
  if (evento === 'reenvio-email') return proponerEmail(db, userId, { evento });
  // Decisión recepción 29/10: Gesty NUNCA propone conectar el banco en
  // vivo justo a tiempo. El banco queda en Ajustes → Conexiones como
  // opción manual, y por extractos como un papel más. proponerBanco
  // sigue existiendo para la creación manual desde Ajustes, pero
  // ningún momento del dolor lo dispara. (El evento sigue siendo
  // válido: devuelve null, no un error, para no romper llamadas viejas.)
  if (evento === 'conciliacion-pendiente') return null;
  fail(`Evento de momento inválido: ${evento || '(vacío)'}.`);
}

function responderPropuesta(db, userId, plataforma, respuesta, opts) {
  ensureSchema(db);
  const plat = String(plataforma);
  const resp = normTexto(respuesta);
  if (!RESPUESTAS.includes(resp)) fail(`Respuesta inválida: ${resp}. Válidas: ${RESPUESTAS.join(', ')}.`);
  if (resp === 'extractos' && plat !== 'banco') fail('«Seguimos por extractos» es solo para el banco.');
  const prop = getPropuesta(db, userId, plat);
  if (!prop) fail('No hay propuesta de esa conexión para responder.');
  if (prop.respuesta) fail('Esa propuesta ya fue respondida.');
  db.prepare(`UPDATE gesty_propuestas_conexion SET respuesta = ?, respondida_en = datetime('now') WHERE id = ?`).run(resp, prop.id);
  let conexionExtractos = null;
  // «Seguimos por extractos» + banco conocido: el camino queda elegido en
  // el mismo toque (la tarjeta vive en Ajustes → Conexiones). Sin banco
  // conocido, la elección queda registrada y el banco se elige ahí.
  if (resp === 'extractos') {
    const proveedor = normTexto((opts || {}).proveedor);
    if (proveedor) {
      conexionExtractos = conexiones.conectar(db, userId, { plataforma: 'banco', proveedor, modo: 'extractos' });
    }
  }
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'propuesta-conexion', entidad_id: String(prop.id),
    tipo_evento: 'propuesta-conexion-respondida',
    resumen: `Propuesta ${plat} respondida: ${resp}${conexionExtractos ? ' (camino por extractos creado)' : ''}.`,
    payload: { plataforma: plat, respuesta: resp },
  });
  return { propuesta: getPropuesta(db, userId, plat), conexion_extractos: conexionExtractos };
}

// Muestra de la prueba en espejo: lo que cada conexión desbloquearía, con
// conteos reales (nunca inventados). Propuesta, nunca requisito.
function mostrarDesbloqueos(db, userId) {
  ensureSchema(db);
  const facturasMano = db.prepare(`SELECT COUNT(*) AS n FROM gesty_comprobantes
    WHERE user_id = ? AND tipo LIKE 'factura%' AND origen IN ('upload','email','manual')
    AND (duplicado_de IS NULL OR duplicado_de = 0)`).get(userId);
  const reenvios = db.prepare(`SELECT COUNT(*) AS n FROM gesty_comprobantes
    WHERE user_id = ? AND origen = 'email' AND (duplicado_de IS NULL OR duplicado_de = 0)`).get(userId);
  const sinConciliar = db.prepare(`SELECT COUNT(*) AS n FROM gesty_conciliacion_movimientos
    WHERE user_id = ? AND estado IN ('sin-conciliar','sin-par')`).get(userId);
  const conectadas = {};
  for (const c of conexiones.conexionesActivas(db, userId)) conectadas[c.plataforma] = true;
  const respondidas = {};
  for (const p of listPropuestas(db, userId)) if (p.respuesta) respondidas[p.plataforma] = p.respuesta;
  const lineas = [];
  if (!conectadas.facturador && !respondidas.facturador) {
    const n = (facturasMano && facturasMano.n) || 0;
    lineas.push({
      plataforma: 'facturador', orden: 1, tiene_dato: n > 0, conteo: n,
      texto: n > 0
        ? `Con tu facturador conectado, estas ${n} facturas entrarían solas, sin foto ni reenvío.`
        : 'Con tu facturador conectado, las facturas entrarían solas, sin foto ni reenvío.',
    });
  }
  if (!conectadas.email && !respondidas.email) {
    const n = (reenvios && reenvios.n) || 0;
    lineas.push({
      plataforma: 'email', orden: 2, tiene_dato: n > 0, conteo: n,
      texto: n > 0
        ? `Con tu casilla conectada, estos ${n} papeles entrarían solos, sin que los reenvíes.`
        : 'Con tu casilla conectada, los papeles entrarían solos, sin que los reenvíes.',
    });
  }
  // Decisión recepción 29/10: la muestra just-in-time ya no incluye al
  // banco. (sinConciliar queda sin uso acá; el conteo sigue vivo en
  // hayMotivoBanco para quien lo necesite como detector.)
  void sinConciliar;
  return { es_requisito: false, lineas };
}

module.exports = {
  TEXTOS, MOMENTOS, RESPUESTAS,
  ensureSchema,
  proponerFacturador, proponerEmail, proponerBanco, evaluarMomentos,
  responderPropuesta, getPropuesta, listPropuestas, hayMotivoBanco, mostrarDesbloqueos,
};
