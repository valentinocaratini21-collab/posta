// =====================================================================
// GESTY · G-27 — COBRANZA CON MEDIO DE PAGO
// Spec: gesty-cola-builds.md G-27 («el mensaje de cobranza aprobado
// incluye el link o los datos de pago del negocio cuando el
// fundamento los tiene — Mercado Pago u otro; sin el dato cargado,
// el mensaje sale sin link y lo dice — jamás un link inventado»).
//
// EL DATO vive en el fundamento (G-02), grupo «cuentas-medios»,
// campo «medio-pago-cobranzas» — el MISMO grupo/campo que el buzón
// de G-23 usa para su dirección y que el catálogo de G-25 detecta
// como hueco preguntable (su detector mira presencia de esta fila:
// nombre alineado, cero cambios en G-25).
//
// LA FORMA del valor es la que G-25 ya fijó al estructurar la
// respuesta del dueño, y este módulo la sigue tal cual:
//   { tipo: 'link',  dato: '<url con esquema>' }
//   { tipo: 'alias', dato: '<alias o CBU, un solo token>' }
//   { estado: 'sin-medio', incluir: false }   ← la elección
//   explícita del dueño («por ahora, sin medio»): no es un medio,
//   es una decisión — el mensaje sale sin línea y SIN el aviso de
//   «no está cargado», porque cargado está: decidido.
// Este build suma UN tipo más, nombrado en la spec de G-27:
//   { tipo: 'datos', dato: '<texto del dueño>' }  (CBU con espacios
//   u otros datos bancarios en texto libre: viaja tal cual).
// El detector de G-25 es agnóstico a la forma (solo presencia), así
// que el tipo nuevo no lo altera.
//
// LA VERDAD DEL LINK: al cargar — por este endpoint o por la
// respuesta de G-25 — un «link» exige esquema (http/https, la
// validación que G-25 ya aplica en su estructurar): un dominio o
// un alias con puntos NO es un link y no se guarda como link.
// Nada se acorta, se sigue ni se prueba desde el servidor: el link
// del dueño es un dato suyo, no una promesa de funcionamiento.
//
// LA COSTURA con G-05 es solo el RENDER: gesty-cobranzas.js llama a
// aplicarAlMensaje al armar el detalle de la tarjeta, así el medio
// queda DENTRO del mensaje congelado que la aprobación sella y que
// enviarCobranza despacha — lo aprobado es exactamente lo enviado,
// y la tarjeta registra qué medio viajó (detalle.medio_pago). La
// máquina de estados y el sello de G-05 no se tocan. Si el medio
// cambia con una tarjeta esperando, el escaneo de G-05 la regenera
// declarando el cambio (su criterio para escalón/saldo), detectado
// comparando la foto del medio de la tarjeta con la vigente.
// =====================================================================
'use strict';

const gesty = require('./gesty');

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const GRUPO_MEDIO = 'cuentas-medios';
const CAMPO_MEDIO = 'medio-pago-cobranzas';

// La declaración que la tarjeta lleva cuando el mensaje sale sin
// medio por no estar cargado (texto de la spec de G-27).
const AVISO_SIN_MEDIO = 'Este mensaje sale sin medio de pago: no está cargado en tu fundamento.';

const TIPOS_MEDIO = ['link', 'alias', 'datos'];

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// ---------------------------------------------------------------------------
// Lectura del dato (el fundamento es la única fuente)
// ---------------------------------------------------------------------------

function datoMedio(db, userId) {
  return gesty.getData(db, userId, { grupo: GRUPO_MEDIO }).find((d) => d.campo === CAMPO_MEDIO) || null;
}

function idDatoMedio(db, userId) {
  const d = datoMedio(db, userId);
  return d ? d.id : null;
}

// Normaliza lo GUARDADO a la foto comparable del medio:
//   null                      → no hay dato cargado
//   { estado: 'sin-medio' }   → el dueño decidió no incluirlo
//   { tipo, dato }            → el medio que viaja en el mensaje
// Tolera las claves variantes con las que el brief nombró la forma
// (url / alias / texto) por si otro camino las escribió así: la
// forma canónica que este módulo y G-25 escriben es { tipo, dato }.
function normalizarGuardado(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor === 'string') {
    const t = valor.trim();
    if (!t) return null;
    return /^https?:\/\/\S+$/i.test(t) ? { tipo: 'link', dato: t } : { tipo: 'alias', dato: t };
  }
  if (typeof valor !== 'object' || Array.isArray(valor)) return null;
  if (valor.estado === 'sin-medio' || valor.incluir === false) return { estado: 'sin-medio' };
  const tipo = normTexto(valor.tipo).toLowerCase();
  const dato = normTexto(valor.dato || valor.url || valor.alias || valor.texto || '');
  if (!TIPOS_MEDIO.includes(tipo) || !dato) return null;
  return { tipo, dato };
}

function snapshotActual(db, userId) {
  const d = datoMedio(db, userId);
  return d ? normalizarGuardado(d.valor) : null;
}

function normSnap(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.estado === 'sin-medio') return { estado: 'sin-medio' };
  const tipo = normTexto(s.tipo).toLowerCase();
  const dato = normTexto(s.dato || '');
  if (!TIPOS_MEDIO.includes(tipo) || !dato) return null;
  return { tipo, dato };
}

// La comparación que usa el escaneo de G-05: ¿el medio vigente es
// el mismo que la tarjeta congeló al prepararse?
function snapshotsIguales(a, b) {
  return JSON.stringify(normSnap(a)) === JSON.stringify(normSnap(b));
}

// ---------------------------------------------------------------------------
// El render: la línea propia y serena que viaja en el mensaje
// ---------------------------------------------------------------------------

// La línea que el mensaje suma, o null si no viaja medio. El link
// va TAL CUAL (sin acortar ni tocar); el alias, con su rótulo; los
// datos, el texto del dueño palabra por palabra.
function lineaDe(snapshot) {
  const s = normSnap(snapshot);
  if (!s || s.estado === 'sin-medio') return null;
  if (s.tipo === 'link') return `Link de pago: ${s.dato}`;
  if (s.tipo === 'alias') return `Alias: ${s.dato}`;
  return s.dato; // datos: el texto del dueño, tal cual
}

// La costura de G-05: dado el mensaje ya renderizado del escalón,
// devuelve el mensaje final (con la línea del medio si hay medio),
// la foto del medio que viajó (lo que la tarjeta registra) y el
// aviso que la tarjeta declara cuando sale sin medio por no estar
// cargado. Con la elección «sin-medio» no hay aviso: fue decidido.
function aplicarAlMensaje(db, userId, mensaje) {
  const snap = snapshotActual(db, userId);
  if (!snap) return { mensaje, medio_pago: null, aviso: AVISO_SIN_MEDIO };
  if (snap.estado === 'sin-medio') return { mensaje, medio_pago: { estado: 'sin-medio' }, aviso: null };
  const linea = lineaDe(snap);
  return { mensaje: `${mensaje}\n${linea}`, medio_pago: snap, aviso: null };
}

// ---------------------------------------------------------------------------
// Carga del dato (la validación manda al guardar, no al leer)
// ---------------------------------------------------------------------------

// Un link exige esquema (http/https, como fijó G-25): sin esquema
// no se guarda como link — un alias de Mercado Pago también lleva
// puntos y no por eso es un link.
function validarLink(crudo) {
  const t = normTexto(crudo);
  if (!t) fail('El link de pago no puede estar vacío.');
  if (!/^https?:\/\//i.test(t)) {
    fail('Eso no se guarda como link: le falta el esquema (https://…). Un alias con puntos no es un link: cargalo como alias.');
  }
  if (/\s/.test(t)) fail('El link de pago no puede tener espacios.');
  let u = null;
  try { u = new URL(t); } catch (e) { u = null; }
  if (!u || !u.hostname) fail('El link de pago no es una URL válida.');
  return t;
}

function validarEntrada(entrada) {
  const e = entrada || {};
  if (e.sin_medio === true || normTexto(e.tipo).toLowerCase() === 'sin-medio') {
    return { estado: 'sin-medio', incluir: false };
  }
  const tipo = normTexto(e.tipo).toLowerCase();
  if (tipo === 'link') return { tipo: 'link', dato: validarLink(e.url !== undefined ? e.url : e.dato) };
  if (tipo === 'alias') {
    const t = normTexto(e.alias !== undefined ? e.alias : e.dato);
    if (!t) fail('El alias no puede estar vacío.');
    if (/\s/.test(t)) fail('El alias va sin espacios (un solo dato). Si son varios datos bancarios, cargalos como «datos».');
    if (t.length < 4 || t.length > 120) fail('El alias tiene que tener entre 4 y 120 caracteres.');
    return { tipo: 'alias', dato: t };
  }
  if (tipo === 'datos') {
    const t = normTexto(e.texto !== undefined ? e.texto : e.dato);
    if (!t) fail('Los datos de pago no pueden estar vacíos.');
    if (t.length > 500) fail('Los datos de pago son demasiado largos para un mensaje de cobranza (máx. 500 caracteres).');
    return { tipo: 'datos', dato: t };
  }
  fail('El medio de pago se carga como link, alias o datos — o se marca «sin medio».');
}

// El dueño carga (o cambia, o apaga) su medio de pago: queda en el
// fundamento con SU procedencia y el hecho en el registro durable.
function setMedioPago(db, userId, entrada, opts) {
  const o = opts || {};
  const valor = validarEntrada(entrada);
  const dato = gesty.setData(db, userId, {
    grupo: GRUPO_MEDIO, campo: CAMPO_MEDIO, valor,
    origen: 'dueno', origen_ref: normTexto(o.origen_ref || 'vista-cobranzas'),
    cargado_por: 'dueno', confirmado: true,
  });
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'cobranza', entidad_id: 'medio-pago',
    tipo_evento: 'cobranza-medio-pago-actualizado',
    resumen: valor.estado === 'sin-medio'
      ? 'Medio de pago de cobranzas: el dueño eligió no incluir medio en los mensajes'
      : `Medio de pago de cobranzas actualizado: ${valor.tipo === 'link' ? 'link de pago' : valor.tipo === 'alias' ? 'alias' : 'datos de pago'}`,
    payload: valor.estado === 'sin-medio' ? { estado: 'sin-medio' } : { tipo: valor.tipo, dato: valor.dato },
  });
  return { dato, medio: getMedioPago(db, userId) };
}

// La lectura para la pantalla y para los tests: qué hay cargado,
// en qué estado y qué línea viajaría hoy en un mensaje.
function getMedioPago(db, userId) {
  const fila = datoMedio(db, userId);
  const snap = fila ? normalizarGuardado(fila.valor) : null;
  if (!fila || !snap) {
    return { cargado: false, estado: 'sin-cargar', tipo: null, dato: null, linea: null, medio_pago: null, dato_id: fila ? fila.id : null };
  }
  if (snap.estado === 'sin-medio') {
    return { cargado: true, estado: 'sin-medio', tipo: null, dato: null, linea: null, medio_pago: { estado: 'sin-medio' }, dato_id: fila.id };
  }
  return {
    cargado: true, estado: 'con-medio', tipo: snap.tipo, dato: snap.dato,
    linea: lineaDe(snap), medio_pago: snap, dato_id: fila.id,
  };
}

module.exports = {
  // constantes
  GRUPO_MEDIO, CAMPO_MEDIO, AVISO_SIN_MEDIO, TIPOS_MEDIO,
  // el dato en el fundamento
  datoMedio, idDatoMedio, snapshotActual, snapshotsIguales,
  // render (la costura de G-05)
  lineaDe, aplicarAlMensaje,
  // carga con validación
  validarEntrada, setMedioPago, getMedioPago,
};
