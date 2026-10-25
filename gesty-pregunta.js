// =====================================================================
// GESTY · G-25 — «GESTY PREGUNTA» (la pregunta semanal del fundamento)
// Spec: gesty-cola-builds.md G-25 · gesty-sistema-operativo.md (regla
// de la pregunta única: «si un dato falta y hace falta, Gesty pregunta
// UNA vez, con opciones de un toque. La respuesta queda guardada para
// siempre; nunca vuelve a preguntar lo mismo. Sin respuesta, trabaja
// con lo seguro y marca el hueco — jamás adivina»).
//
// QUÉ ES Y QUÉ NO ES:
// · Es la pregunta SEMANAL sobre el FUNDAMENTO: como máximo UNA
//   activa por cuenta y como máximo UN nacimiento por semana de vida
//   (la semana del fundamento, la misma definición de G-24:
//   ⌊días desde el primer registro durable / 7⌋ + 1).
// · NO es la pregunta única de G-03 por papel (esa vive en
//   Comprobantes, atada a un comprobante en revisión: acá no se la
//   toca ni se la duplica). NO es una propuesta de regla de G-20
//   (esas viven en «Lo que Gesty aprendió» con su aprobar/descartar:
//   acá no se convierten en preguntas ni se duplican). Esta pregunta
//   nace de un HUECO del fundamento, trae opciones de un toque y su
//   respuesta ESCRIBE el fundamento una sola vez.
//
// LA FRONTERA PAPEL / NO-PAPEL (declarada por tipo de dato en el
// catálogo de abajo — es LA decisión del build):
// Un hueco es PREGUNTABLE solo si ningún papel puede cerrarlo:
// políticas y preferencias del dueño (días de pago, día de entrega,
// horario de reservas, medio de pago) y la confirmación de un dato
// inferido que ningún papel confirma. Todo lo que un papel puede
// cerrar — un CUIT, un monto, una fecha, el papel que falta — lo
// cierra G-03/G-18 LEYENDO: jamás se pregunta. La detección devuelve
// también los huecos NO preguntables, con su motivo, para que la
// frontera sea inspeccionable y no una promesa. Y ante la duda un
// tipo no declarado en el catálogo es NO preguntable: este módulo
// solo pregunta lo que el catálogo declara preguntable.
//
// EL MOMENTO: la pregunta nace pegada a un momento real citado —
// el cierre del día (G-21; si el ref es una fecha con cierre durable
// ese día, el momento queda VERIFICADO contra el registro), la
// apertura del panel, un escaneo, la rutina diaria. El momento se
// cita tal como lo declara quien evalúa; no se inventa.
//
// JAMÁS REPITE: índice UNIQUE (cuenta, hueco). Respondida, descartada
// o vencida, ese hueco NUNCA vuelve a nacer como pregunta. Lo no
// respondido se retira al cumplirse su semana y no se re-pregunta:
// el hueco sigue visible en el fundamento y en «Lo que Gesty
// aprendió», sin insistir. La insistencia es el defecto que este
// build existe para evitar.
//
// LA RESPUESTA escribe en el fundamento con procedencia del dueño:
// origen `pregunta-unica` (el origen que el fundamento de G-02
// reserva a «lo respondiste en una pregunta de Gesty» — su lista de
// orígenes es cerrada y no se extiende) con origen_ref
// `pregunta-gesty:<id>` (la pregunta citada) y cargado_por `dueno`.
// «Otra respuesta» libre: si el dato se puede estructurar sin
// inventar (una fecha explícita, un día de semana nombrado, un
// número limpio), se estructura; si no, queda como NOTA del dueño
// citada en la respuesta — jamás se fuerza una estructura y jamás
// se escribe el fundamento con un valor adivinado.
// =====================================================================
'use strict';

const gesty = require('./gesty.js');

let reglas = null;
try { reglas = require('./gesty-reglas.js'); } catch (e) { reglas = null; }
let salud = null;
try { salud = require('./gesty-salud.js'); } catch (e) { salud = null; }
let cierreDia = null;
try { cierreDia = require('./gesty-cierre-dia.js'); } catch (e) { cierreDia = null; }
let contadorMod = null;
try { contadorMod = require('./gesty-contador.js'); } catch (e) { contadorMod = null; }
let reservasCanal = null;
try { reservasCanal = require('./gesty-reservas-canal.js'); } catch (e) { reservasCanal = null; }
let huecosMod = null;
try { huecosMod = require('./gesty-huecos.js'); } catch (e) { huecosMod = null; }
let comprobantes = null;
try { comprobantes = require('./gesty-comprobantes.js'); } catch (e) { comprobantes = null; }

// Los momentos reales a los que una pregunta puede nacer pegada
// (lista cerrada: un momento fuera de la lista no dispara preguntas).
const MOMENTOS = ['cierre-del-dia', 'apertura-panel', 'escaneo', 'rutina-diaria'];
const ESTADOS = ['activa', 'respondida', 'descartada', 'vencida', 'cerrada-externa'];

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// ---------------------------------------------------------------------------
// Reloj inyectable + la semana del fundamento (definición de G-24)
// ---------------------------------------------------------------------------

// opts.ahora = ISO datetime · opts.hoy = 'YYYY-MM-DD' · nada = ahora real.
function relojDe(opts) {
  const o = opts || {};
  let ahora = null;
  if (o.ahora && !Number.isNaN(Date.parse(o.ahora))) ahora = new Date(o.ahora);
  else if (esFechaISO(o.hoy)) ahora = new Date(String(o.hoy) + 'T12:00:00.000Z');
  else ahora = new Date();
  return { ahora, ahoraISO: ahora.toISOString(), hoy: ahora.toISOString().slice(0, 10) };
}

// La semana de vida de la cuenta, contada desde su primer registro
// durable (la definición que G-24 fijó para el panel: MIN entre el
// primer evento durable y el primer dato del fundamento). Si el
// reloj pedido cae antes de ese inicio — o la cuenta aún no tiene
// registros — la semana se DECLARA 1 con su motivo, no se inventa.
function semanaActual(db, userId, hoy) {
  if (salud && typeof salud.semanaDeVida === 'function') {
    try {
      const s = salud.semanaDeVida(db, userId, hoy);
      if (s && Number.isInteger(s.numero)) {
        return { numero: s.numero, inicio: s.inicio, desde: s.desde, hasta: s.hasta, declarada: false };
      }
      return { numero: 1, inicio: s && s.inicio ? s.inicio : null, desde: null, hasta: null, declarada: true, motivo: (s && s.motivo) || 'la cuenta todavía no tiene registros durables' };
    } catch (e) { /* cae a la declaración */ }
  }
  return { numero: 1, inicio: null, desde: null, hasta: null, declarada: true, motivo: 'semana declarada (sin fuente de semana disponible)' };
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_preguntas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    clave_hueco TEXT NOT NULL,
    grupo TEXT NOT NULL DEFAULT '',
    campo TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    opciones TEXT NOT NULL DEFAULT '[]',
    evidencia TEXT NOT NULL DEFAULT '',
    momento_tipo TEXT NOT NULL DEFAULT '',
    momento_ref TEXT NOT NULL DEFAULT '',
    momento_detalle TEXT NOT NULL DEFAULT '',
    momento_verificado INTEGER NOT NULL DEFAULT 0,
    semana INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'activa',
    respuesta TEXT NOT NULL DEFAULT '',
    dato_id INTEGER,
    nacida_en TEXT NOT NULL DEFAULT '',
    cerrada_en TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_preguntas_hueco ON gesty_preguntas(user_id, clave_hueco);
  CREATE INDEX IF NOT EXISTS idx_gesty_preguntas_user ON gesty_preguntas(user_id, estado, id);
  `);
  _esquemas.add(db);
}

function parsePreguntaRow(r) {
  if (!r) return null;
  return {
    id: r.id, clave_hueco: r.clave_hueco,
    grupo: r.grupo, campo: r.campo,
    texto: r.texto,
    opciones: safeJson(r.opciones, []),
    otra_respuesta: true, // la salida libre existe siempre (regla de la casa)
    evidencia: r.evidencia || '',
    momento: { tipo: r.momento_tipo, ref: r.momento_ref, detalle: r.momento_detalle, verificado: r.momento_verificado === 1 },
    semana: r.semana,
    estado: r.estado,
    respuesta: r.respuesta ? safeJson(r.respuesta, null) : null,
    dato_id: r.dato_id === null || r.dato_id === undefined ? null : Number(r.dato_id),
    nacida_en: r.nacida_en || '',
    cerrada_en: r.cerrada_en || '',
    creada_en: r.created_at, actualizada_en: r.updated_at,
  };
}

function filaPregunta(db, userId, id) {
  return db.prepare('SELECT * FROM gesty_preguntas WHERE id = ? AND user_id = ?').get(Number(id), userId);
}
function preguntaPorClave(db, userId, clave) {
  return db.prepare('SELECT * FROM gesty_preguntas WHERE user_id = ? AND clave_hueco = ?').get(userId, String(clave));
}
function filaActiva(db, userId) {
  return db.prepare(`SELECT * FROM gesty_preguntas WHERE user_id = ? AND estado = 'activa' ORDER BY id ASC LIMIT 1`).get(userId);
}

// ---------------------------------------------------------------------------
// Piezas de lenguaje: días de semana (0 = domingo … 6 = sábado, la
// convención de G-07/G-09b) y extracción sin inventar.
// ---------------------------------------------------------------------------

const DIA_NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIA_PLURAL = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados'];
const DIA_REGEX = [
  [0, /domingos?\b/i], [1, /lunes\b/i], [2, /martes\b/i], [3, /mi[eé]rcoles\b/i],
  [4, /jueves\b/i], [5, /viernes\b/i], [6, /s[aá]bados?\b/i],
];
function diasSemanaEnTexto(texto) {
  const t = String(texto || '');
  const out = [];
  for (const [d, re] of DIA_REGEX) if (re.test(t)) out.push(d);
  return [...new Set(out)].sort((a, b) => a - b);
}
function horasEnTexto(texto) {
  const m = String(texto || '').match(/(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|horas?)?\D{1,12}?(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const h1 = Number(m[1]); const min1 = m[2] ? Number(m[2]) : 0;
  const h2 = Number(m[3]); const min2 = m[4] ? Number(m[4]) : 0;
  if (!(h1 >= 0 && h1 <= 23 && h2 >= 0 && h2 <= 23 && min1 <= 59 && min2 <= 59)) return null;
  const fmt = (h, mi) => String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  const a = fmt(h1, min1); const c = fmt(h2, min2);
  if (c <= a) return null;
  return { hora_apertura: a, hora_cierre: c };
}
function enteroEnTexto(texto) {
  const m = String(texto || '').match(/\d{1,3}/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isInteger(n) ? n : null;
}
function fechaEnTexto(texto) {
  const m = String(texto || '').match(/\d{4}-\d{2}-\d{2}/);
  return m && esFechaISO(m[0]) ? m[0] : null;
}

// ---------------------------------------------------------------------------
// EL CATÁLOGO DE HUECOS PREGUNTABLES
// Cada entrada declara: su clave, su destino en el fundamento, cómo se
// detecta el hueco HOY (leyendo los registros vivos), cómo nacen sus
// opciones (de evidencia citada) y cómo una respuesta se convierte en
// el valor que se escribe. El orden del catálogo ES la prioridad: a
// igual momento, nace la primera candidata disponible.
// ---------------------------------------------------------------------------

function datoDe(db, userId, grupo, campo) {
  return gesty.getData(db, userId, { grupo }).find((d) => d.campo === campo) || null;
}

// --- 1 · El medio de pago de las cobranzas (lo consume G-27) --------
const entradaMedioPago = {
  clave: 'medio-pago-cobranzas',
  orden: 1,
  detectar(db, userId) {
    if (!gesty.hasCapacidad(db, userId, 'cobranzas')) return null;
    if (datoDe(db, userId, 'cuentas-medios', 'medio-pago-cobranzas')) return null;
    return {
      clave_hueco: 'medio-pago-cobranzas',
      grupo: 'cuentas-medios', campo: 'medio-pago-cobranzas',
      texto: '¿Qué medio de pago querés que incluya en tus mensajes de cobranza?',
      evidencia: 'Todavía no cargaste ningún medio de pago: hoy tus cobranzas salen sin link ni alias, y lo declaran.',
      opciones: [
        { clave: 'con-link', texto: 'Mi link de pago (Mercado Pago u otro): pegalo en «Otra respuesta»', requiere_texto: true, tipo_dato: 'link' },
        { clave: 'con-alias', texto: 'Mi alias o CBU para transferencias: escribilo en «Otra respuesta»', requiere_texto: true, tipo_dato: 'alias' },
        { clave: 'sin-medio', texto: 'Por ahora, sin medio de pago en los mensajes', valor: { estado: 'sin-medio', incluir: false } },
      ],
    };
  },
  estructurar(texto) {
    const t = normTexto(texto);
    if (!t) return { ok: false };
    // Link = con esquema (sin https:// no es un link usable, aunque
    // se parezca a un dominio: un alias de MP también lleva puntos).
    if (/^https?:\/\/\S+$/i.test(t)) return { ok: true, valor: { tipo: 'link', dato: t } };
    if (/^\S{4,60}$/.test(t)) return { ok: true, valor: { tipo: 'alias', dato: t } };
    return { ok: false };
  },
};

// --- 2 · El día de entrega al contador (lo consume G-15) ------------
const entradaDiaContador = {
  clave: 'dia-entrega-contador',
  orden: 2,
  detectar(db, userId) {
    if (!contadorMod || typeof contadorMod.getContador !== 'function') return null;
    let perfil = null;
    try { perfil = contadorMod.getContador(db, userId); } catch (e) { return null; }
    if (!perfil || (!perfil.nombre && !perfil.email)) return null; // sin contador, no hay entrega que agendar
    if (perfil.dia_entrega) return null;
    const quien = perfil.nombre || perfil.email;
    return {
      clave_hueco: 'dia-entrega-contador',
      grupo: 'contador', campo: 'dia_entrega',
      texto: '¿Qué día del mes le entregás la carpeta a tu contador?',
      evidencia: `Tenés a ${quien} como tu contador, pero no su día de entrega: la carpeta del mes se arma sin fecha de entrega.`,
      opciones: [2, 5, 10].map((d) => ({ clave: `dia-${d}`, texto: `El día ${d} de cada mes`, valor: d })),
    };
  },
  estructurar(texto) {
    const n = enteroEnTexto(texto);
    // G-15 lee el día en 1..28: fuera de ese rango no se estructura.
    if (n !== null && n >= 1 && n <= 28) return { ok: true, valor: n };
    return { ok: false };
  },
};

// --- 3 · La ventana horaria de las reservas del canal (G-09b) -------
const entradaHorarioReservas = {
  clave: 'horario-reservas-canal',
  orden: 3,
  detectar(db, userId) {
    if (!gesty.hasCapacidad(db, userId, 'agenda')) return null;
    if (!reservasCanal || typeof reservasCanal.getConfig !== 'function') return null;
    let cfg = null;
    try { cfg = reservasCanal.getConfig(db, userId); } catch (e) { return null; }
    if (!cfg || cfg.es_default !== true) return null; // ya es SU horario, declarado por él
    return {
      clave_hueco: 'horario-reservas-canal',
      grupo: 'reglas-dueno', campo: 'reservas-canal',
      texto: '¿En qué días y horario querés que tome tus reservas por WhatsApp y por teléfono?',
      evidencia: 'Nunca me dijiste tu horario: hoy tomo reservas con el de referencia (lunes a sábado, de 09:00 a 18:00), declarado como tal.',
      opciones: [
        { clave: 'referencia', texto: 'Lunes a sábado, 09:00 a 18:00 (el de referencia, pero mío)', valor: { hora_apertura: '09:00', hora_cierre: '18:00', dias_semana: [1, 2, 3, 4, 5, 6] } },
        { clave: 'extendido', texto: 'Lunes a sábado, 08:00 a 20:00', valor: { hora_apertura: '08:00', hora_cierre: '20:00', dias_semana: [1, 2, 3, 4, 5, 6] } },
        { clave: 'semana-corta', texto: 'Lunes a viernes, 09:00 a 18:00', valor: { hora_apertura: '09:00', hora_cierre: '18:00', dias_semana: [1, 2, 3, 4, 5] } },
      ],
    };
  },
  // El valor que se escribe es la configuración COMPLETA de G-09b
  // (su lector funde defaults por campo: escribir el parche completo
  // con el resto de los campos vigentes no inventa nada).
  valorFinal(db, userId, pregunta, parcial) {
    const cfg = reservasCanal.getConfig(db, userId);
    return {
      hora_apertura: parcial.hora_apertura, hora_cierre: parcial.hora_cierre,
      dias_semana: parcial.dias_semana,
      paso_min: cfg.paso_min, duracion_default_min: cfg.duracion_default_min,
    };
  },
  estructurar(texto) {
    const horas = horasEnTexto(texto);
    if (!horas) return { ok: false };
    const dias = diasSemanaEnTexto(texto);
    return { ok: true, valor: { ...horas, dias_semana: dias.length ? dias : [1, 2, 3, 4, 5, 6] }, dias_declarados_en_el_texto: dias.length > 0 };
  },
};

// --- 4 · Los días de pago a un proveedor (la ficha de G-07) ---------
// Frontera con G-20 declarada: G-20 propone el PLAZO (días desde la
// factura) como regla en «Lo que Gesty aprendió»; esta pregunta es por
// los DÍAS DE SEMANA de pago de la ficha — un dato que G-20 nunca
// propone. Si G-20 ya tiene una propuesta de plazo viva para ese
// proveedor, tampoco se pregunta: su conducta de pago ya está siendo
// tratada en la otra superficie.
function propuestasVivasDePago(db, userId, campo) {
  if (!reglas || typeof reglas.listPropuestas !== 'function') return [];
  try {
    const { propuestas } = reglas.listPropuestas(db, userId, {});
    return (propuestas || []).filter((p) => p.tipo === 'pago-proveedor'
      && p.clave === `pago-proveedor:${campo}`
      && ['pendiente', 'aprobada', 'activa'].includes(String(p.estado || '')));
  } catch (e) { return []; }
}

const entradaDiasPagoProveedor = {
  clave: 'dias-pago-proveedor',
  orden: 4,
  detectar(db, userId) {
    if (!gesty.hasCapacidad(db, userId, 'proveedores')) return null;
    const fichas = gesty.getData(db, userId, { grupo: 'proveedores' })
      .filter((d) => d.valor && typeof d.valor === 'object' && !Array.isArray(d.valor))
      .sort((a, b) => String(a.campo).localeCompare(String(b.campo)));
    for (const ficha of fichas) {
      const v = ficha.valor;
      if (Array.isArray(v.dias_pago) && v.dias_pago.length) continue;       // ya declarados
      if (v.criterio_pago === 'vencimiento') continue;                       // ya respondido a su modo
      const recibidos = Number(v.comprobantes_recibidos) || 0;
      const observados = Array.isArray(v.dias_pago_observados) ? v.dias_pago_observados.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
      if (recibidos < 2 && !observados.length) continue;                     // sin base: no es un proveedor habitual todavía
      if (propuestasVivasDePago(db, userId, ficha.campo).length) continue;   // G-20 ya lo está tratando
      const nombre = normTexto(v.nombre || '') || ficha.campo.replace(/_/g, ' ');
      const opciones = [];
      const obs = [...new Set(observados)].slice(0, 2);
      for (const d of obs) opciones.push({ clave: `dias-${d}`, texto: `${DIA_PLURAL[d].replace(/^los /, 'Los ')}`, valor: { dias_pago: [d] } });
      if (obs.length >= 2) opciones.push({ clave: `dias-${obs[0]}-${obs[1]}`, texto: `${DIA_PLURAL[obs[0]].replace(/^los /, 'Los ')} y ${DIA_NOMBRE[obs[1]]}`, valor: { dias_pago: obs } });
      opciones.push({ clave: 'al-vencimiento', texto: 'El día que vence cada factura', valor: { dias_pago: [], criterio_pago: 'vencimiento' } });
      const evidenciaObs = observados.length
        ? `Tus pagos a ${nombre} ya cayeron en ${[...new Set(observados)].map((d) => DIA_NOMBRE[d]).join(' y ')}`
        : `Ya recibiste ${recibidos} comprobantes de ${nombre}`;
      return {
        clave_hueco: `dias-pago-proveedor:${ficha.campo}`,
        grupo: 'proveedores', campo: ficha.campo,
        texto: `¿Qué días de la semana le pagás a ${nombre}?`,
        evidencia: `${evidenciaObs}, pero nunca declaraste tus días de pago a este proveedor: las órdenes se proponen sin tu día.`,
        opciones,
      };
    }
    return null;
  },
  // La ficha es un objeto compartido con G-07: se funde SOLO la
  // respuesta sobre la ficha viva — el resto de las claves (las
  // observadas de G-07, las del dueño) quedan intactas.
  valorFinal(db, userId, pregunta, parcial) {
    const actual = datoDe(db, userId, 'proveedores', pregunta.campo);
    const base = actual && actual.valor && typeof actual.valor === 'object' ? actual.valor : {};
    const out = { ...base, dias_pago: parcial.dias_pago };
    if (parcial.criterio_pago) out.criterio_pago = parcial.criterio_pago;
    else delete out.criterio_pago;
    return out;
  },
  estructurar(texto) {
    const dias = diasSemanaEnTexto(texto);
    if (dias.length) return { ok: true, valor: { dias_pago: dias } };
    if (/vencimiento|cuando vence|al vencer/i.test(texto)) return { ok: true, valor: { dias_pago: [], criterio_pago: 'vencimiento' } };
    return { ok: false };
  },
};

// --- 5 · La confirmación de un dato inferido sin papel que lo avale -
// Solo datos ESCALARES fuera de `datos-fiscales` (lo fiscal se lee de
// un papel o lo corrige el dueño: NO se pregunta), con origen
// inferido/rubro y sin confirmación del dueño. Sin escalar no hay
// pregunta: una ficha u objeto no se «confirma» con un toque.
const GRUPOS_CONFIRMACION_EXCLUIDOS = ['datos-fiscales'];
const entradaConfirmacion = {
  clave: 'confirmacion',
  orden: 5,
  detectar(db, userId) {
    const datos = gesty.getData(db, userId, {})
      .filter((d) => !GRUPOS_CONFIRMACION_EXCLUIDOS.includes(d.grupo))
      .filter((d) => (d.origen === 'inferido' || d.origen === 'rubro') && !d.confirmado_por_dueno)
      .filter((d) => !/^regla-aprendida-/.test(d.campo)) // las reglas de G-20 viven en su superficie
      .filter((d) => ['string', 'number', 'boolean'].includes(typeof d.valor))
      .sort((a, b) => String(a.actualizado_en).localeCompare(String(b.actualizado_en)) || a.id - b.id);
    const d = datos[0];
    if (!d) return null;
    const campoLegible = d.campo.replace(/_/g, ' ');
    return {
      clave_hueco: `confirmacion:${d.id}`,
      grupo: d.grupo, campo: d.campo, dato_id: d.id,
      texto: `Tengo este dato de tu negocio y ningún papel lo confirma: ${campoLegible} = «${String(d.valor)}». ¿Es así?`,
      evidencia: `Salió de ${gesty.ORIGEN_LEGIBLE[d.origen] || d.origen} (${d.origen_ref}) y quedó marcado «a confirmar».`,
      opciones: [
        { clave: 'si-es-asi', texto: 'Sí, es así', valor: d.valor },
        { clave: 'no-esta-mal', texto: 'No, está mal', sin_escritura: true },
      ],
    };
  },
  estructurar(texto, ctx) {
    const t = normTexto(texto);
    if (!t || t.length > 200) return { ok: false };
    const original = datoDe(ctx.db, ctx.userId, ctx.pregunta.grupo, ctx.pregunta.campo);
    const valorOriginal = original ? original.valor : null;
    if (typeof valorOriginal === 'number') {
      const n = Number(t.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) && /^\d/.test(t) ? { ok: true, valor: n } : { ok: false };
    }
    if (typeof valorOriginal === 'boolean') return { ok: false }; // un sí/no suelto no es un valor: no se fuerza
    if (typeof valorOriginal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valorOriginal)) {
      const f = fechaEnTexto(t);
      return f ? { ok: true, valor: f } : { ok: false };
    }
    return { ok: true, valor: t }; // el valor correcto de un texto ES el texto
  },
};
// La firma de `estructurar` en todo el catálogo es (texto, ctx) con
// ctx = { db, userId, pregunta }: la confirmación la usa para mirar
// el tipo del valor original sin inventar la conversión.

const CATALOGO = [entradaMedioPago, entradaDiaContador, entradaHorarioReservas, entradaDiasPagoProveedor, entradaConfirmacion];
function entradaDeClave(claveHueco) {
  const base = String(claveHueco || '').split(':')[0];
  return CATALOGO.find((e) => e.clave === base) || null;
}

// ---------------------------------------------------------------------------
// DETECCIÓN — candidatas preguntables + la frontera declarada
// ---------------------------------------------------------------------------

// Los huecos que un papel cierra NO se preguntan: se listan con su
// motivo para que la frontera sea un dato, no una promesa.
function huecosNoPreguntables(db, userId) {
  const out = [];
  // (i) Datos fiscales faltantes: el CUIT y la condición se leen de
  // un papel (G-03) o los corrige el dueño — jamás se preguntan.
  const fiscales = gesty.getData(db, userId, { grupo: 'datos-fiscales' });
  if (!fiscales.find((d) => d.campo === 'cuit')) {
    out.push({ tipo: 'dato-fiscal-faltante', dato: 'datos-fiscales · cuit', motivo: 'se lee de un comprobante (G-03) o lo corrige el dueño: no se pregunta' });
  }
  // (ii) Papeles que faltan (G-18): los cierra el papel cuando llega.
  try {
    if (huecosMod && typeof huecosMod.listHuecos === 'function') {
      const { huecos } = huecosMod.listHuecos(db, userId, { estado: 'abierto', limit: 500 });
      for (const h of (huecos || [])) {
        out.push({ tipo: 'papel-faltante', dato: `hueco-${h.id}`, motivo: 'lo cierra el papel cuando llega (G-18): no se pregunta' });
      }
    }
  } catch (e) { /* la frontera se declara con lo que se pudo leer */ }
  // (iii) Papeles en revisión (G-03): su pregunta única es de G-03.
  try {
    if (comprobantes && typeof comprobantes.listComprobantes === 'function') {
      const { comprobantes: lista } = comprobantes.listComprobantes(db, userId, { limit: 500 });
      const enRevision = (lista || []).filter((c) => c.estado_lectura === 'necesita-revision');
      for (const c of enRevision) {
        out.push({ tipo: 'papel-en-revision', dato: `comprobante-${c.id}`, motivo: 'su única pregunta es la de su papel (G-03): esta pregunta semanal no la duplica' });
      }
    }
  } catch (e) { /* idem */ }
  return out;
}

function detectarCandidatos(db, userId, opts) {
  ensureSchema(db);
  const yaPreguntados = new Set(db.prepare('SELECT clave_hueco FROM gesty_preguntas WHERE user_id = ?').all(userId).map((r) => r.clave_hueco));
  const candidatos = [];
  for (const entrada of CATALOGO) {
    let c = null;
    try { c = entrada.detectar(db, userId); } catch (e) { c = null; }
    if (c && !yaPreguntados.has(c.clave_hueco)) candidatos.push(c);
  }
  return {
    candidatos,
    no_preguntables: huecosNoPreguntables(db, userId),
    frontera: 'solo se pregunta lo que ningún papel puede cerrar (catálogo declarado de G-25); ante la duda, un hueco no se pregunta',
  };
}

// ---------------------------------------------------------------------------
// CICLO DE VIDA
// ---------------------------------------------------------------------------

function normalizarMomento(db, userId, momentoIn) {
  const m = momentoIn || {};
  const tipo = MOMENTOS.includes(String(m.tipo || '')) ? String(m.tipo) : 'apertura-panel';
  const ref = normTexto(m.ref || '');
  const detalle = normTexto(m.detalle || '') || (m.tipo ? '' : 'evaluación sin momento declarado por el llamador');
  let verificado = false;
  if (tipo === 'cierre-del-dia' && esFechaISO(ref) && cierreDia && typeof cierreDia.getCierre === 'function') {
    try { verificado = !!cierreDia.getCierre(db, userId, ref); } catch (e) { verificado = false; }
  }
  return { tipo, ref, detalle, verificado };
}

// Retira la activa si su semana ya cumplió o si su hueco se cerró por
// otra vía. Devuelve la fila activa vigente (o null).
function sanearActiva(db, userId, reloj, semana) {
  let fila = filaActiva(db, userId);
  if (!fila) return null;
  if (Number(fila.semana) < semana.numero) {
    db.prepare(`UPDATE gesty_preguntas SET estado = 'vencida', cerrada_en = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(reloj.ahoraISO, fila.id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'pregunta', entidad_id: String(fila.id),
      tipo_evento: 'pregunta-vencida',
      resumen: `La pregunta de la semana ${fila.semana} venció sin respuesta: no se vuelve a preguntar.`,
      payload: { clave_hueco: fila.clave_hueco, semana_nacimiento: fila.semana },
    });
    return null;
  }
  // ¿El hueco se cerró por otra vía (el dueño cargó el dato solo)?
  const entrada = entradaDeClave(fila.clave_hueco);
  if (entrada) {
    let sigue = null;
    try { sigue = entrada.detectar(db, userId); } catch (e) { sigue = null; }
    const mismaClave = sigue && sigue.clave_hueco === fila.clave_hueco;
    if (!mismaClave) {
      db.prepare(`UPDATE gesty_preguntas SET estado = 'cerrada-externa', cerrada_en = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(reloj.ahoraISO, fila.id);
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'pregunta', entidad_id: String(fila.id),
        tipo_evento: 'pregunta-cerrada-externa',
        resumen: 'El hueco de la pregunta se cerró por otra vía: la pregunta se retira sin insistir.',
        payload: { clave_hueco: fila.clave_hueco },
      });
      return null;
    }
  }
  return fila;
}

function preguntaActiva(db, userId, opts) {
  ensureSchema(db);
  const reloj = relojDe(opts);
  const semana = semanaActual(db, userId, reloj.hoy);
  const fila = sanearActiva(db, userId, reloj, semana);
  return fila ? parsePreguntaRow(fila) : null;
}

// LA evaluación: la llaman los momentos (endpoint hoy; el cierre del
// día y la rutina la invocarán al correr). Nace como máximo UNA.
function evaluarPregunta(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const reloj = relojDe(o);
  const semana = semanaActual(db, userId, reloj.hoy);
  const activa = sanearActiva(db, userId, reloj, semana);
  if (activa) {
    return { creada: false, motivo: 'ya-hay-una-activa', pregunta: parsePreguntaRow(activa), semana };
  }
  const nacioEstaSemana = db.prepare('SELECT id FROM gesty_preguntas WHERE user_id = ? AND semana = ? LIMIT 1').get(userId, semana.numero);
  if (nacioEstaSemana) {
    return { creada: false, motivo: 'ritmo-semanal', pregunta: null, semana, detalle: 'esta semana ya nació la pregunta de la cuenta: la próxima puede nacer la semana que viene' };
  }
  const { candidatos, no_preguntables } = detectarCandidatos(db, userId, o);
  if (!candidatos.length) {
    return { creada: false, motivo: 'sin-huecos-preguntables', pregunta: null, semana, no_preguntables };
  }
  const c = candidatos[0];
  const momento = normalizarMomento(db, userId, o.momento);
  const info = db.prepare(`INSERT INTO gesty_preguntas (user_id, clave_hueco, grupo, campo, texto, opciones, evidencia,
      momento_tipo, momento_ref, momento_detalle, momento_verificado, semana, estado, nacida_en)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'activa', ?)`)
    .run(userId, c.clave_hueco, c.grupo, c.campo, c.texto, JSON.stringify(c.opciones || []), c.evidencia || '',
      momento.tipo, momento.ref, momento.detalle, momento.verificado ? 1 : 0, semana.numero, reloj.ahoraISO);
  const id = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'pregunta', entidad_id: String(id),
    tipo_evento: 'pregunta-creada',
    resumen: `Gesty pregunta (semana ${semana.numero}): ${c.texto}`,
    payload: { clave_hueco: c.clave_hueco, momento: momento.tipo, momento_ref: momento.ref, momento_verificado: momento.verificado },
  });
  return { creada: true, motivo: null, pregunta: parsePreguntaRow(filaPregunta(db, userId, id)), semana, no_preguntables };
}

// La escritura ÚNICA de la respuesta en el fundamento.
function escribirRespuesta(db, userId, preguntaRow, valor) {
  const entrada = entradaDeClave(preguntaRow.clave_hueco);
  const final = entrada && typeof entrada.valorFinal === 'function'
    ? entrada.valorFinal(db, userId, parsePreguntaRow(preguntaRow), valor)
    : valor;
  return gesty.setData(db, userId, {
    grupo: preguntaRow.grupo, campo: preguntaRow.campo, valor: final,
    origen: 'pregunta-unica', origen_ref: `pregunta-gesty:${preguntaRow.id}`,
    cargado_por: 'dueno', confirmado: true,
  });
}

function cerrarPregunta(db, userId, fila, estado, respuesta, datoId, reloj) {
  db.prepare(`UPDATE gesty_preguntas SET estado = ?, respuesta = ?, dato_id = ?, cerrada_en = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(estado, JSON.stringify(respuesta || {}), datoId === undefined ? null : datoId, reloj.ahoraISO, fila.id);
  return parsePreguntaRow(filaPregunta(db, userId, fila.id));
}

function responderPregunta(db, userId, preguntaId, respuestaIn, opts) {
  ensureSchema(db);
  const o = opts || {};
  const reloj = relojDe(o);
  const semana = semanaActual(db, userId, reloj.hoy);
  let fila = filaPregunta(db, userId, preguntaId);
  if (!fila) fail('Esa pregunta no es de esta cuenta.');
  if (fila.estado === 'activa') {
    const vigente = sanearActiva(db, userId, reloj, semana);
    if (!vigente || vigente.id !== fila.id) {
      fail('La pregunta ya no está activa: venció o su hueco se cerró por otra vía. No se vuelve a preguntar.');
    }
    fila = vigente;
  } else {
    fail(`La pregunta ya está ${fila.estado}: una pregunta se responde una sola vez.`);
  }
  const r = respuestaIn || {};
  const tipo = String(r.tipo || '');
  if (!['opcion', 'otra', 'descarte'].includes(tipo)) fail('La respuesta tiene que ser una opción, «otra respuesta» o el descarte.');

  if (tipo === 'descarte') {
    const cerrada = cerrarPregunta(db, userId, fila, 'descartada', { tipo: 'descarte' }, null, reloj);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'pregunta', entidad_id: String(fila.id),
      tipo_evento: 'pregunta-descartada',
      resumen: 'El dueño descartó la pregunta: el hueco queda en el fundamento, sin insistir.',
      payload: { clave_hueco: fila.clave_hueco },
    });
    return { pregunta: cerrada, dato: null };
  }

  const entrada = entradaDeClave(fila.clave_hueco);
  if (!entrada) fail('La pregunta no tiene entrada de catálogo: no se puede responder por esta vía.');
  const opciones = safeJson(fila.opciones, []);

  if (tipo === 'opcion') {
    const op = opciones.find((x) => x.clave === String(r.clave || ''));
    if (!op) fail('Esa opción no es de esta pregunta.');
    if (op.sin_escritura) {
      // Ej.: «No, está mal» en una confirmación: se registra el
      // rechazo; el dato queda como estaba (a confirmar), y la
      // pregunta muere igual — jamás se re-pregunta.
      const cerrada = cerrarPregunta(db, userId, fila, 'respondida', { tipo: 'opcion', clave: op.clave, sin_escritura: true }, null, reloj);
      gesty.recordEvent(db, userId, {
        actor: 'dueno', entidad_tipo: 'pregunta', entidad_id: String(fila.id),
        tipo_evento: 'pregunta-respondida',
        resumen: `El dueño respondió «${op.texto}»: el dato queda marcado como estaba, sin escribir el fundamento.`,
        payload: { clave_hueco: fila.clave_hueco, via: 'opcion', clave: op.clave, sin_escritura: true },
      });
      return { pregunta: cerrada, dato: null };
    }
    let valor;
    if (op.requiere_texto) {
      const texto = normTexto(r.texto || '');
      if (!texto) fail('Esa opción necesita el dato: escribilo en el texto de la respuesta.');
      const est = entrada.estructurar(texto, { db, userId, pregunta: parsePreguntaRow(fila) });
      if (!est.ok) fail('No pude tomar ese dato tal como está escrito: probá de nuevo o dejalo como «otra respuesta».');
      valor = est.valor;
      // La opción ya declara su tipo (link/alias): manda ella, no la
      // heurística del texto — el dueño dijo QUÉ es ese dato.
      if (op.tipo_dato && valor && typeof valor === 'object' && valor.dato) valor = { ...valor, tipo: op.tipo_dato };
    } else {
      valor = op.valor;
    }
    const dato = escribirRespuesta(db, userId, fila, valor);
    const cerrada = cerrarPregunta(db, userId, fila, 'respondida',
      { tipo: 'opcion', clave: op.clave, valor, dato_id: dato.id }, dato.id, reloj);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'pregunta', entidad_id: String(fila.id),
      tipo_evento: 'pregunta-respondida',
      resumen: `El dueño respondió la pregunta: el dato quedó en el fundamento (${fila.grupo} · ${fila.campo}).`,
      payload: { clave_hueco: fila.clave_hueco, via: 'opcion', clave: op.clave, dato_id: dato.id },
    });
    return { pregunta: cerrada, dato };
  }

  // tipo === 'otra': texto libre del dueño.
  const texto = normTexto(r.texto || '');
  if (!texto) fail('La «otra respuesta» necesita el texto.');
  const est = entrada.estructurar(texto, { db, userId, pregunta: parsePreguntaRow(fila) });
  if (est.ok) {
    const dato = escribirRespuesta(db, userId, fila, est.valor);
    const cerrada = cerrarPregunta(db, userId, fila, 'respondida',
      { tipo: 'otra', texto, valor: est.valor, estructurada: true, dato_id: dato.id }, dato.id, reloj);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'pregunta', entidad_id: String(fila.id),
      tipo_evento: 'pregunta-respondida',
      resumen: `El dueño respondió con su texto y el dato quedó en el fundamento (${fila.grupo} · ${fila.campo}).`,
      payload: { clave_hueco: fila.clave_hueco, via: 'otra', estructurada: true, dato_id: dato.id },
    });
    return { pregunta: cerrada, dato };
  }
  // No se pudo estructurar sin inventar: queda como NOTA citada del
  // dueño. El fundamento NO se escribe con un valor adivinado, y la
  // pregunta muere igual (jamás se re-pregunta).
  const cerrada = cerrarPregunta(db, userId, fila, 'respondida',
    { tipo: 'otra', texto, estructurada: false, nota: true }, null, reloj);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'pregunta', entidad_id: String(fila.id),
    tipo_evento: 'pregunta-respondida',
    resumen: 'El dueño respondió con un texto que no se pudo estructurar sin inventar: queda como su nota citada, sin escribir el fundamento.',
    payload: { clave_hueco: fila.clave_hueco, via: 'otra', estructurada: false, nota: true },
  });
  return { pregunta: cerrada, dato: null };
}

function descartarPregunta(db, userId, preguntaId, opts) {
  return responderPregunta(db, userId, preguntaId, { tipo: 'descarte' }, opts);
}

// ---------------------------------------------------------------------------
// CONSULTAS
// ---------------------------------------------------------------------------

function getPregunta(db, userId, id) {
  ensureSchema(db);
  return parsePreguntaRow(filaPregunta(db, userId, id));
}

function listPreguntas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 100, 1), 500);
  const rows = o.estado && ESTADOS.includes(String(o.estado))
    ? db.prepare('SELECT * FROM gesty_preguntas WHERE user_id = ? AND estado = ? ORDER BY id DESC LIMIT ?').all(userId, String(o.estado), lim)
    : db.prepare('SELECT * FROM gesty_preguntas WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, lim);
  const total = db.prepare('SELECT COUNT(*) AS n FROM gesty_preguntas WHERE user_id = ?').get(userId);
  return { preguntas: rows.map(parsePreguntaRow), total: total ? Number(total.n) || 0 : 0 };
}

// El resumen para «La oficina» (G-24): el estado de la pregunta de la
// semana, sin tocar nada.
function resumenPregunta(db, userId, opts) {
  ensureSchema(db);
  const reloj = relojDe(opts);
  const semana = semanaActual(db, userId, reloj.hoy);
  const activa = preguntaActiva(db, userId, opts);
  const conteos = {};
  for (const e of ESTADOS) {
    const r = db.prepare('SELECT COUNT(*) AS n FROM gesty_preguntas WHERE user_id = ? AND estado = ?').get(userId, e);
    conteos[e] = r ? Number(r.n) || 0 : 0;
  }
  const nacio = db.prepare('SELECT COUNT(*) AS n FROM gesty_preguntas WHERE user_id = ? AND semana = ?').get(userId, semana.numero);
  return {
    semana_actual: semana,
    hay_activa: !!activa,
    activa: activa ? { id: activa.id, texto: activa.texto, clave_hueco: activa.clave_hueco, momento: activa.momento } : null,
    nacio_esta_semana: (nacio ? Number(nacio.n) || 0 : 0) > 0,
    conteos,
    regla: 'una pregunta activa por vez, un nacimiento por semana, jamás se repite un hueco',
  };
}

module.exports = {
  // constantes
  MOMENTOS, ESTADOS, CATALOGO: CATALOGO.map((e) => ({ clave: e.clave, orden: e.orden })),
  // esquema
  ensureSchema,
  // detección (la frontera, inspeccionable)
  detectarCandidatos, huecosNoPreguntables,
  // ciclo de vida
  evaluarPregunta, responderPregunta, descartarPregunta,
  // consultas
  preguntaActiva, getPregunta, listPreguntas, resumenPregunta,
  // piezas internas, exportadas para tests y reuso
  semanaActual, relojDe, diasSemanaEnTexto, horasEnTexto,
};
