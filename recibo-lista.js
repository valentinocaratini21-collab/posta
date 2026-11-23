'use strict';
// (LOTE RECIBO-LISTA · asiento del tablero 2026-11-23 00:17, «dale, arma todo»)
// EL RECIBO DE LA FILA Y EL ÚNICO TOQUE DE ENERO.
//
// (1) EL RECIBO: quien entra a la lista de espera por la puerta en modo
// lista (modo-lista.js · tabla lista_espera) recibe EN EL MOMENTO un
// email con su lugar en la fila y qué pasa el 1° de febrero. La fila
// nueva nace con recibo_estado='pendiente' (el valor por defecto de la
// columna; la fila que ya existía conserva su estado cuando se
// re-anota, porque el ON CONFLICT de registrar no toca estas columnas:
// re-anotarse NUNCA duplica el recibo ni mueve el lugar). El despacho
// sale por la vía de correo del producto (email.js → Resend, con su
// registro durable en email_send_log): disparo inmediato desde la ruta
// de la puerta + barrido del scheduler como red para lo que el disparo
// no alcanzó.
//
// (2) EL TOQUE DE ENERO: el único contacto intermedio con la fila.
// Corre durante enero de 2027 (ventana fija de abajo), una sola vez por
// fila, a la fila vigente a esa fecha (toda fila con toque_estado en
// 'pendiente'). Freno anti-duplicado: la fila se RECLAMA antes de
// enviar (toque_estado pasa a 'enviando' en la misma operación
// síncrona, con su marca de tiempo en el reclamo); un segundo barrido,
// un reinicio o una corrida solapada encuentran la fila ya reclamada y
// no la tocan. Si la puerta ya volvió a modo normal, el toque no sale:
// ya no hace falta avisar que el lugar sigue reservado.
//
// EL LUGAR EN LA FILA: es el rango de la fila por id entre todas las
// filas de lista_espera (COUNT de las filas con id <= el propio). El id
// no cambia al re-anotarse, así que el lugar nace con el alta y no se
// mueve nunca, se calcule cuando se calcule. La identidad es la de la
// tabla (ig, domain, email): el mismo email con otro @ es otra fila y
// otro lugar, como manda la unicidad vigente.
//
// REBOTES: si Resend rechaza el envío al despachar (HTTP 4xx, p. ej.
// una dirección inválida), el estado queda 'rechazado': terminal, sin
// reintentos, y el motivo literal del proveedor ya vive en
// email_send_log (lo escribe email.js). Un rebote POSTERIOR a la
// aceptación del proveedor no tiene superficie en el producto hoy (no
// hay webhook de Resend conectado): declarado, no simulado.
//
// AL DESPLEGAR: las filas que ya están en la lista nacen en este lote
// con recibo_estado='pendiente' — el primer barrido les manda el
// recibo que les correspondía, con su lugar real. Es la deuda del
// recibo, no un envío nuevo inventado.

const { sendEmail, emailFaceHeader } = require('./email');
const modoLista = require('./modo-lista');

// =====================================================================
// COPIA — EL ÚNICO LUGAR EDITABLE DE LOS DOS TEXTOS (el recibo y el
// toque de enero). El dueño aprueba o corrige ESTE bloque y no hay que
// tocar nada más. Voz de Posty, a UN solo negocio, sin rayas largas.
// =====================================================================
const COPIA = {
  recibo: {
    es: {
      asunto: (lugar) => `Ya estás en la fila de Posty: tu lugar es el ${lugar}`,
      cuerpo: (lugar) => `
    <p style="font-size:16px;margin:0 0 12px">Hola 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#47617A">
      Ya estás en la lista de Posty. <b style="color:#0A1E33">Tu lugar en la fila es el ${lugar}</b> y quedó reservado para tu negocio.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#47617A">
      El 1° de febrero abren las pruebas y los cupos se asignan por orden de llegada, así que tu lugar se respeta: cuando llegue tu turno, te avisamos a este mismo email y entrás a probar Posty con los posteos de tu negocio de verdad.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 4px;color:#47617A">
      Mientras tanto no tenés que hacer nada. Guardá este email: es tu recibo.
    </p>`,
      texto: (lugar) => [
        'Hola 👋',
        '',
        `Ya estás en la lista de Posty. Tu lugar en la fila es el ${lugar} y quedó reservado para tu negocio.`,
        '',
        'El 1° de febrero abren las pruebas y los cupos se asignan por orden de llegada, así que tu lugar se respeta: cuando llegue tu turno, te avisamos a este mismo email y entrás a probar Posty con los posteos de tu negocio de verdad.',
        '',
        'Mientras tanto no tenés que hacer nada. Guardá este email: es tu recibo.',
      ].join('\n'),
    },
    en: {
      asunto: (lugar) => `You are on Posty's list: your place in line is ${lugar}`,
      cuerpo: (lugar) => `
    <p style="font-size:16px;margin:0 0 12px">Hi 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#47617A">
      You are on Posty's list. <b style="color:#0A1E33">Your place in line is ${lugar}</b> and it is reserved for your business.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#47617A">
      Trials open on February 1 and spots are assigned in order of arrival, so your place is respected: when your turn comes, we will email you at this same address and you can start trying Posty with real posts for your business.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 4px;color:#47617A">
      In the meantime, you don't have to do anything. Keep this email: it is your receipt.
    </p>`,
      texto: (lugar) => [
        'Hi 👋',
        '',
        `You are on Posty's list. Your place in line is ${lugar} and it is reserved for your business.`,
        '',
        'Trials open on February 1 and spots are assigned in order of arrival, so your place is respected: when your turn comes, we will email you at this same address and you can start trying Posty with real posts for your business.',
        '',
        "In the meantime, you don't have to do anything. Keep this email: it is your receipt.",
      ].join('\n'),
    },
  },
  toque: {
    es: {
      asunto: () => 'Tu lugar en la fila de Posty sigue reservado 💛',
      cuerpo: (lugar) => `
    <p style="font-size:16px;margin:0 0 12px">Hola 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#47617A">
      Te sumaste a la lista de Posty hace un tiempo y te escribimos por una sola cosa: <b style="color:#0A1E33">tu lugar en la fila sigue reservado</b>. Es el ${lugar}, y es tuyo.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 4px;color:#47617A">
      El 1° de febrero abren las pruebas y los cupos salen por orden de llegada. Cuando llegue tu turno, te avisamos a este mismo email. No tenés que hacer nada.
    </p>`,
      texto: (lugar) => [
        'Hola 👋',
        '',
        `Te sumaste a la lista de Posty hace un tiempo y te escribimos por una sola cosa: tu lugar en la fila sigue reservado. Es el ${lugar}, y es tuyo.`,
        '',
        'El 1° de febrero abren las pruebas y los cupos salen por orden de llegada. Cuando llegue tu turno, te avisamos a este mismo email. No tenés que hacer nada.',
      ].join('\n'),
    },
    en: {
      asunto: () => 'Your place in line at Posty is still reserved 💛',
      cuerpo: (lugar) => `
    <p style="font-size:16px;margin:0 0 12px">Hi 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#47617A">
      You joined Posty's list a while ago and we are writing for one reason only: <b style="color:#0A1E33">your place in line is still reserved</b>. It is ${lugar}, and it is yours.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 4px;color:#47617A">
      Trials open on February 1 and spots are assigned in order of arrival. When your turn comes, we will email you at this same address. You don't have to do anything.
    </p>`,
      texto: (lugar) => [
        'Hi 👋',
        '',
        `You joined Posty's list a while ago and we are writing for one reason only: your place in line is still reserved. It is ${lugar}, and it is yours.`,
        '',
        "Trials open on February 1 and spots are assigned in order of arrival. When your turn comes, we will email you at this same address. You don't have to do anything.",
      ].join('\n'),
    },
  },
};

// Cáscara propia del módulo (el mismo patrón de notify-email.js): la
// cara de Posty arriba y un pie que dice la verdad de ESTE correo (el
// pie genérico de emailShell habla de contenido pendiente y acá no
// aplica).
function shellLista(inner, lang) {
  const foot = lang === 'en'
    ? `You're getting this email because you joined Posty's waitlist.<br>
      Don't want these notices? Write to us at <a href="mailto:hola@postycommunitymanager.com" style="color:#2793C8">hola@postycommunitymanager.com</a>.`
    : `Te escribimos porque te sumaste a la lista de espera de Posty.<br>
      ¿No querés recibir estos avisos? Escribinos a <a href="mailto:hola@postycommunitymanager.com" style="color:#2793C8">hola@postycommunitymanager.com</a>.`;
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
  ${emailFaceHeader(lang)}
  <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
    ${inner}
    <p style="font-size:12px;line-height:1.6;color:#47617A;margin:20px 0 0">${foot}
    </p>
  </div>
</div>`;
}

// ---------------------------------------------------------------------
// Esquema: las columnas del lote sobre lista_espera (aditivo e
// idempotente, el patrón de bandeja.js: PRAGMA + ALTER si falta).
// ---------------------------------------------------------------------
const _esquemaListo = new WeakSet();
function ensureSchema(db) {
  if (_esquemaListo.has(db)) return;
  modoLista.ensureSchema(db);
  const cols = db.prepare('PRAGMA table_info(lista_espera)').all().map((c) => c.name);
  const add = (name, ddl) => { if (!cols.includes(name)) db.exec(`ALTER TABLE lista_espera ADD COLUMN ${ddl}`); };
  add('recibo_estado', `recibo_estado TEXT NOT NULL DEFAULT 'pendiente'`);
  add('recibo_at', 'recibo_at INTEGER NOT NULL DEFAULT 0');
  add('recibo_intentos', 'recibo_intentos INTEGER NOT NULL DEFAULT 0');
  add('toque_estado', `toque_estado TEXT NOT NULL DEFAULT 'pendiente'`);
  add('toque_at', 'toque_at INTEGER NOT NULL DEFAULT 0');
  _esquemaListo.add(db);
}

// El lugar en la fila: rango por id (ver el encabezado).
function lugarEnLaFila(db, filaId) {
  const r = db.prepare('SELECT COUNT(*) AS n FROM lista_espera WHERE id <= ?').get(filaId);
  return r ? Number(r.n) : 0;
}

function armarPieza(tipo, fila, lugar) {
  const lang = fila.lang === 'en' ? 'en' : 'es';
  const copia = COPIA[tipo][lang];
  return {
    asunto: copia.asunto(lugar),
    html: shellLista(copia.cuerpo(lugar), lang),
    texto: copia.texto(lugar),
  };
}
function armarRecibo(fila, lugar) { return armarPieza('recibo', fila, lugar); }
function armarToque(fila, lugar) { return armarPieza('toque', fila, lugar); }

// ---------------------------------------------------------------------
// Despacho de UNA fila ya reclamada. Registra el desenlace en la fila:
//   enviado   → estado 'enviado' + marca de tiempo. Nunca más se toca.
//   rechazado → el proveedor dijo que no (HTTP 4xx): terminal.
//   resto     → transitorio (sin clave, red, timeout): el recibo vuelve
//               a 'pendiente' con un intento más (tope MAX_INTENTOS y
//               queda 'error'); el toque vuelve a 'pendiente' y lo
//               reintenta la próxima corrida dentro de la ventana.
// ---------------------------------------------------------------------
const MAX_INTENTOS_RECIBO = 5;
async function despachar(db, tipo, fila) {
  const colE = tipo === 'recibo' ? 'recibo_estado' : 'toque_estado';
  const colA = tipo === 'recibo' ? 'recibo_at' : 'toque_at';
  const lugar = lugarEnLaFila(db, fila.id);
  const pieza = armarPieza(tipo, fila, lugar);
  let r = null;
  try {
    r = await sendEmail({ to: fila.email, subject: pieza.asunto, html: pieza.html, text: pieza.texto });
  } catch (e) {
    r = { ok: false, error: String((e && e.message) || e) };
  }
  const now = Date.now();
  if (r && r.ok) {
    db.prepare(`UPDATE lista_espera SET ${colE} = 'enviado', ${colA} = ? WHERE id = ?`).run(now, fila.id);
    return 'enviado';
  }
  if (r && r.httpStatus) {
    db.prepare(`UPDATE lista_espera SET ${colE} = 'rechazado', ${colA} = ? WHERE id = ?`).run(now, fila.id);
    return 'rechazado';
  }
  if (tipo === 'recibo') {
    const intentos = (Number(fila.recibo_intentos) || 0) + 1;
    if (intentos >= MAX_INTENTOS_RECIBO) {
      db.prepare(`UPDATE lista_espera SET recibo_estado = 'error', recibo_intentos = ?, recibo_at = ? WHERE id = ?`).run(intentos, now, fila.id);
      return 'error';
    }
    db.prepare(`UPDATE lista_espera SET recibo_estado = 'pendiente', recibo_intentos = ? WHERE id = ?`).run(intentos, fila.id);
    return 'reintento';
  }
  db.prepare(`UPDATE lista_espera SET toque_estado = 'pendiente' WHERE id = ?`).run(fila.id);
  return 'reintento';
}

// Un reclamo 'enviando' más viejo que esto se considera huérfano (el
// proceso murió a mitad del envío) y la fila vuelve a ser candidata.
const RECLAMO_VENCIDO_MS = 15 * 60 * 1000;

// Barrido genérico: selecciona candidatas, las reclama UNA POR UNA en
// síncrono antes de cada envío (el reclamo lleva la marca de tiempo
// que la fila tenía: si otro barrido la reclamó en el medio, este
// reclamo no la toma) y despacha.
async function correrBarrido(db, tipo, limite) {
  const colE = tipo === 'recibo' ? 'recibo_estado' : 'toque_estado';
  const colA = tipo === 'recibo' ? 'recibo_at' : 'toque_at';
  const ahora = Date.now();
  const filas = db.prepare(`SELECT * FROM lista_espera
    WHERE ${colE} = 'pendiente'
       OR (${colE} = 'enviando' AND ${colA} > 0 AND ${colA} < ?)
    ORDER BY id ASC LIMIT ?`).all(ahora - RECLAMO_VENCIDO_MS, limite);
  const res = { candidatos: filas.length, enviados: 0, rechazados: 0, errores: 0, reintentos: 0 };
  for (const fila of filas) {
    const claim = db.prepare(`UPDATE lista_espera SET ${colE} = 'enviando', ${colA} = ?
      WHERE id = ? AND (${colE} = 'pendiente' OR (${colE} = 'enviando' AND ${colA} = ?))`)
      .run(ahora, fila.id, fila[colA]);
    if (!claim.changes) continue;
    const out = await despachar(db, tipo, fila);
    if (out === 'enviado') res.enviados++;
    else if (out === 'rechazado') res.rechazados++;
    else if (out === 'error') res.errores++;
    else res.reintentos++;
  }
  return res;
}

// ---------------------------------------------------------------------
// (1) EL RECIBO — barrido + disparo inmediato desde el alta.
// ---------------------------------------------------------------------
async function barridoRecibos(db, opts = {}) {
  ensureSchema(db);
  const limite = Math.max(1, Math.min(200, Number(opts.limite) || 50));
  const total = { candidatos: 0, enviados: 0, rechazados: 0, errores: 0, reintentos: 0 };
  // Hasta 3 pasadas: si entraron altas mientras se despachaba, salen en
  // la misma corrida. La red del scheduler cubre el resto.
  for (let pasada = 0; pasada < 3; pasada++) {
    const r = await correrBarrido(db, 'recibo', limite);
    for (const k of Object.keys(total)) total[k] += r[k];
    if (!r.candidatos) break;
  }
  return total;
}

const _recibosEnCurso = new Set();
function dispararRecibos(db) {
  if (_recibosEnCurso.has(db)) return Promise.resolve({ en_curso: true });
  _recibosEnCurso.add(db);
  return barridoRecibos(db)
    .catch((e) => { console.error('[recibo-lista] barrido de recibos falló:', e.message); return { error: e.message }; })
    .finally(() => { _recibosEnCurso.delete(db); });
}

// ---------------------------------------------------------------------
// (2) EL TOQUE DE ENERO — ventana fija de enero de 2027 (hora de la
// casa, EST) y puerta todavía en modo lista. Fuera de eso, no corre.
// ---------------------------------------------------------------------
const TOQUE_DESDE = Date.UTC(2027, 0, 1, 5, 0, 0); // 2027-01-01 00:00 EST
const TOQUE_HASTA = Date.UTC(2027, 1, 1, 5, 0, 0); // 2027-02-01 00:00 EST (exclusivo)
function esVentanaToque(ahoraMs) {
  return ahoraMs >= TOQUE_DESDE && ahoraMs < TOQUE_HASTA;
}

async function barridoToqueEnero(db, opts = {}) {
  ensureSchema(db);
  const ahora = typeof opts.ahora === 'number' ? opts.ahora : Date.now();
  if (!esVentanaToque(ahora)) return { activo: false, motivo: 'fuera_de_ventana', candidatos: 0, enviados: 0, rechazados: 0, errores: 0, reintentos: 0 };
  if (!modoLista.activo()) return { activo: false, motivo: 'puerta_normal', candidatos: 0, enviados: 0, rechazados: 0, errores: 0, reintentos: 0 };
  const limite = Math.max(1, Math.min(1000, Number(opts.limite) || 200));
  const r = await correrBarrido(db, 'toque', limite);
  return { activo: true, ...r };
}

module.exports = {
  COPIA,
  ensureSchema,
  lugarEnLaFila,
  armarRecibo,
  armarToque,
  barridoRecibos,
  dispararRecibos,
  barridoToqueEnero,
  esVentanaToque,
  TOQUE_DESDE,
  TOQUE_HASTA,
};
