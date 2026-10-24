// gesty-comprobantes.js — G-03 · COMPROBANTES (el motor de papeles de
// Gesty). Spec: gesty-build-spec.md §4 (entidad Comprobante), §7
// (ingestas) y §12 (tres pilares); gesty-areas-detalle.md §7 (el área
// silenciosa: corre 100% en automático, el dueño no aprueba nada);
// gesty-cola-builds.md G-03; vara de gesty-experiencia-cliente.md §5
// (≥95% bien leídos; el resto pide SOLO el dato dudoso).
//
// Qué hace, de punta a punta:
//   INGESTA — un comprobante entra por subida (foto/PDF, un toque),
//   por email (mensaje normalizado con adjuntos, el patrón de fuente
//   inyectada de hola-inbox.js) o por registro manual asistido
//   (build-spec §7.4). El archivo se guarda con la infraestructura
//   existente: buffer crudo a MEDIA_DIR con nombre único, servido por
//   el estático /media de siempre. NO se inserta en la tabla `assets`
//   de Posty (eso mezclaría papeles en la librería de fotos del
//   cliente: cero cambio de comportamiento para Posty).
//   LECTURA — OCR + modelo con el patrón de visión de la casa (fetch a
//   chat completions con image_url data-URI, como /api/dna/inspo y
//   tagAlbumPhoto) y, para PDFs digitales, el texto de
//   deep-read.pdfTextFromBuffer (pdftotext/poppler con respaldo en
//   Node). El extractor es INYECTABLE (registerExtractor): la ruta de
//   server.js usa el de la casa con la clave de la cuenta; sin modelo
//   disponible el comprobante queda GUARDADO en necesita-revision —
//   nunca perdido (G-02 spec §6.c).
//   CLASIFICACIÓN — reglas explícitas y auditables (cada una con id,
//   como las RULES de hola-inbox.js) + la sugerencia del modelo cuando
//   viene con confianza alta.
//   REGISTRO — todo queda en el registro durable de G-02 (gesty_events,
//   entidad_tipo 'comprobante') y la contraparte se PROPONE al
//   fundamento con origen `comprobante` (nace si no existe; jamás pisa
//   lo que ya hay, y los datos fiscales del negocio jamás se
//   sobrescriben: ley de la fundación).
//   DEDUPE — mismo emisor + tipo + número + CUIT = un solo registro
//   vivo; el segundo ingreso se GUARDA marcado `duplicado` (áreas §7:
//   no se descarta ningún comprobante, ni siquiera uno duplicado).
//   REVISIÓN — lo que no se lee con confianza queda `necesita-revision`
//   y Gesty hace UNA sola pregunta por el dato dudoso (banco §12.3;
//   evento pregunta-hecha). NO nace tarjeta de bandeja: clasificar
//   comprobantes corre en autopiloto y NUNCA genera tarjeta (G-02 spec
//   §4.2), y el área no tiene acciones de la matriz (las 10 son de
//   otros builds). El dueño responde/corrigiendo por el endpoint de
//   corrección y el comprobante se reevalúa solo.
//
// Esquema ADITIVO e idempotente, en la misma base y patrón que
// gesty.js: no toca ninguna tabla existente.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const gesty = require('./gesty');
let deepRead = null;
try { deepRead = require('./deep-read'); } catch (e) { deepRead = null; }

// ---------------------------------------------------------------------------
// Constantes de la spec
// ---------------------------------------------------------------------------

// build-spec §4: tipo (factura recibida/emitida, ticket, remito,
// recibo, otro) + clasificación (gasto/venta/stock/impuesto).
const TIPOS = ['factura-recibida', 'factura-emitida', 'ticket', 'remito', 'recibo', 'otro'];
const CLASIFICACIONES = ['gasto', 'venta', 'stock', 'impuesto'];
const ORIGENES_INGESTA = ['upload', 'email', 'manual', 'whatsapp'];
const UMBRAL_CONFIANZA = 0.8; // vara §5: por debajo, el dato es dudoso
const UMBRAL_SUGERENCIA = 0.7; // la sugerencia del modelo manda si viene firme

// Los campos que un comprobante necesita sí o sí para darse por leído.
// `numero` se suma cuando es factura (sin número no hay dedupe ni
// control de numeración). El orden es la prioridad de la pregunta
// única: se pregunta SOLO el primero que falte o venga flojo.
const CAMPOS_CLAVE_BASE = ['monto_total', 'fecha', 'emisor_nombre'];
const PRIORIDAD_PREGUNTA = ['monto_total', 'fecha', 'emisor_nombre', 'numero'];
const CAMPO_LEGIBLE = {
  monto_total: 'el monto total',
  fecha: 'la fecha',
  emisor_nombre: 'quién lo emitió',
  numero: 'el número del comprobante',
};

// Reglas de clasificación (auditables: id + descripción; el id queda
// guardado en la extracción para poder responder «¿por qué gasto?»).
const REGLAS_CLASIFICACION = [
  { id: 'emitida-es-venta', desc: 'lo emitió el negocio: es una venta' },
  { id: 'remito-es-stock', desc: 'un remito mueve mercadería: stock' },
  { id: 'emisor-fiscal-es-impuesto', desc: 'el emisor es un organismo o el concepto es un impuesto/tasa' },
  { id: 'sugerencia-del-modelo', desc: 'la lectura sugirió la clasificación con confianza alta' },
  { id: 'recibida-es-gasto', desc: 'papel recibido sin otra señal: gasto del negocio' },
  { id: 'sin-clasificar', desc: 'sin señal suficiente: queda sin clasificar, marcado, nunca perdido' },
];
const RE_IMPUESTO = /\b(arca|afip|dgi|rentas|impuesto|monotributo|ingresos brutos|iibb|tasa municipal|sellos|autonomos|autónomos)\b/i;

// Campos que el dueño puede corregir (la respuesta a la pregunta única
// o una corrección libre desde el detalle del papel).
const CAMPOS_CORREGIBLES = ['tipo', 'direccion', 'emisor_nombre', 'emisor_cuit', 'receptor_nombre', 'receptor_cuit',
  'numero', 'fecha', 'vencimiento', 'moneda', 'monto_total', 'monto_neto', 'cae', 'concepto', 'clasificacion'];

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }

// ---------------------------------------------------------------------------
// Configuración e inyección (patrón de la casa: fuente/aiFn inyectados)
// ---------------------------------------------------------------------------

const _cfg = { mediaDir: null, apiKeyFor: null };
let _extractor = null; // extractor inyectado (tests u otra ruta); gana al de la casa

function configure(opts) {
  const o = opts || {};
  if (o.mediaDir !== undefined) _cfg.mediaDir = o.mediaDir || null;
  if (o.apiKeyFor !== undefined) _cfg.apiKeyFor = typeof o.apiKeyFor === 'function' ? o.apiKeyFor : null;
}

// El extractor recibe { userId, buffer, mime, nombreArchivo } y devuelve
// el objeto crudo de campos + `confianza` por campo (o null si no pudo
// leer nada). Firmar null lo desregistra (vuelve el de la casa).
function registerExtractor(fn) {
  if (fn !== null && typeof fn !== 'function') fail('El extractor de comprobantes debe ser una función.');
  _extractor = fn;
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_comprobantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'otro',
    direccion TEXT NOT NULL DEFAULT '',
    emisor_nombre TEXT NOT NULL DEFAULT '',
    emisor_cuit TEXT NOT NULL DEFAULT '',
    receptor_nombre TEXT NOT NULL DEFAULT '',
    receptor_cuit TEXT NOT NULL DEFAULT '',
    numero TEXT NOT NULL DEFAULT '',
    fecha TEXT NOT NULL DEFAULT '',
    vencimiento TEXT NOT NULL DEFAULT '',
    moneda TEXT NOT NULL DEFAULT '',
    monto_total REAL,
    monto_neto REAL,
    impuestos TEXT NOT NULL DEFAULT '[]',
    cae TEXT NOT NULL DEFAULT '',
    concepto TEXT NOT NULL DEFAULT '',
    clasificacion TEXT NOT NULL DEFAULT '',
    archivo_path TEXT NOT NULL DEFAULT '',
    archivo_nombre TEXT NOT NULL DEFAULT '',
    archivo_mime TEXT NOT NULL DEFAULT '',
    origen TEXT NOT NULL DEFAULT 'upload',
    estado_lectura TEXT NOT NULL DEFAULT 'necesita-revision',
    campos_dudosos TEXT NOT NULL DEFAULT '[]',
    extraccion TEXT NOT NULL DEFAULT '{}',
    huella TEXT,
    duplicado_de INTEGER,
    asiento_vinculado TEXT NOT NULL DEFAULT '',
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_comp_user ON gesty_comprobantes(user_id, id);
  CREATE INDEX IF NOT EXISTS idx_gesty_comp_fecha ON gesty_comprobantes(user_id, fecha);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_comp_huella ON gesty_comprobantes(user_id, huella)
    WHERE huella IS NOT NULL AND duplicado_de IS NULL;
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Normalización (determinística: lo que el modelo diga pasa por acá)
// ---------------------------------------------------------------------------

function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function soloDigitos(v) { return String(v || '').replace(/\D/g, ''); }

function normCuit(v) {
  const d = soloDigitos(v);
  return d.length === 11 ? d : '';
}

// Checksum módulo 11 del CUIT: si no cierra, el dígito leído está mal
// y la confianza del campo cae (no se inventa el correcto).
function cuitChecksumOk(cuit) {
  const d = soloDigitos(cuit);
  if (d.length !== 11) return false;
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * mult[i];
  let verif = 11 - (sum % 11);
  if (verif === 11) verif = 0;
  if (verif === 10) verif = 9;
  return verif === Number(d[10]);
}

function normFecha(v) {
  const s = normTexto(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

function normMonto(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // Texto rioplatense: $ 1.234.567,89 → 1234567.89
  const s = String(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const limpio = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function normNumero(v) { return normTexto(v).toUpperCase().replace(/\s+/g, ''); }

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function confDe(confMap, campo, hayValor) {
  const c = confMap && typeof confMap === 'object' ? Number(confMap[campo]) : NaN;
  if (Number.isFinite(c)) return Math.min(Math.max(c, 0), 1);
  return hayValor ? 0.85 : 0; // el modelo no puntuó: presente vale, ausente no
}

// ---------------------------------------------------------------------------
// El extractor de la casa (visión + texto de PDF, patrón del codebase)
// ---------------------------------------------------------------------------

const PROMPT_LECTURA = `Sos el lector de comprobantes de una administradora de negocios argentina. Leés UN comprobante (factura, ticket, remito, recibo u otro papel fiscal/comercial) y devolvés SOLO un JSON válido, sin texto extra, con esta forma exacta:
{"tipo":"factura|ticket|remito|recibo|otro","emisor_nombre":"","emisor_cuit":"","receptor_nombre":"","receptor_cuit":"","numero":"","fecha":"","vencimiento":"","moneda":"ARS","monto_total":null,"monto_neto":null,"impuestos":[{"concepto":"IVA 21%","monto":0}],"cae":"","concepto":"","clasificacion_sugerida":"gasto|venta|stock|impuesto|","confianza":{"tipo":0,"emisor_nombre":0,"emisor_cuit":0,"receptor_nombre":0,"receptor_cuit":0,"numero":0,"fecha":0,"vencimiento":0,"monto_total":0,"monto_neto":0,"cae":0,"clasificacion_sugerida":0}}
Reglas: fechas en formato AAAA-MM-DD. Montos como números con punto decimal, sin símbolos ni separadores de miles. CUIT como cadena de 11 dígitos, sin guiones. El número de comprobante tal como está impreso (con su letra y punto de venta si están). Si un dato no está impreso o no se lee con seguridad, dejalo vacío/null y bajá su confianza: NUNCA inventes un dato. "concepto" es una descripción corta de qué es el papel. La confianza va de 0 a 1 por campo según cuán seguro estás de haberlo leído bien.`;

async function llamarModelo(userId, partes) {
  const key = _cfg.apiKeyFor ? String(_cfg.apiKeyFor(userId) || '') : '';
  if (!key) return null;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o', temperature: 0.1, max_tokens: 900,
      messages: [
        { role: 'system', content: PROMPT_LECTURA },
        { role: 'user', content: partes },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const raw = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
  if (!raw) return null;
  try { return JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()); }
  catch (e) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { return null; } }
    return null;
  }
}

async function extractorDeLaCasa({ userId, buffer, mime }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (mime === 'application/pdf') {
    if (!deepRead || typeof deepRead.pdfTextFromBuffer !== 'function') return null;
    const texto = await deepRead.pdfTextFromBuffer(buffer).catch(() => '');
    if (!texto || texto.trim().length < 20) return null; // PDF escaneado sin capa de texto: no hay vía honesta hoy
    const out = await llamarModelo(userId, [{ type: 'text', text: `Texto extraído del PDF del comprobante:\n\n${texto.slice(0, 12000)}` }]);
    return out ? { ...out, _via: 'texto-pdf' } : null;
  }
  if (/^image\//.test(mime || '')) {
    const b64 = buffer.toString('base64');
    const out = await llamarModelo(userId, [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
      { type: 'text', text: 'Leé este comprobante y devolvé el JSON pedido.' },
    ]);
    return out ? { ...out, _via: 'vision' } : null;
  }
  return null;
}

async function correrExtractor(userId, args) {
  const fn = _extractor || extractorDeLaCasa;
  try { return await fn({ userId, ...args }); }
  catch (e) { return null; } // una lectura fallida nunca tira abajo la ingesta: el papel queda guardado
}

// ---------------------------------------------------------------------------
// Clasificación y evaluación de la lectura
// ---------------------------------------------------------------------------

function clasificar(c) {
  if (c.tipo === 'factura-emitida') return { clasificacion: 'venta', regla: 'emitida-es-venta' };
  if (c.tipo === 'remito') return { clasificacion: 'stock', regla: 'remito-es-stock' };
  const texto = `${c.emisor_nombre || ''} ${c.concepto || ''}`;
  if (RE_IMPUESTO.test(texto)) return { clasificacion: 'impuesto', regla: 'emisor-fiscal-es-impuesto' };
  const sug = c._sugerencia;
  if (sug && CLASIFICACIONES.includes(sug.valor) && sug.confianza >= UMBRAL_SUGERENCIA) {
    return { clasificacion: sug.valor, regla: 'sugerencia-del-modelo' };
  }
  if (c.direccion === 'recibida' || c.tipo === 'factura-recibida' || c.tipo === 'ticket' || c.tipo === 'recibo') {
    return { clasificacion: 'gasto', regla: 'recibida-es-gasto' };
  }
  return { clasificacion: '', regla: 'sin-clasificar' };
}

function camposClave(tipo) {
  const base = CAMPOS_CLAVE_BASE.slice();
  if (String(tipo || '').startsWith('factura')) base.push('numero');
  return base;
}

// Evalúa la confianza por campo → estado de lectura + la pregunta única
// (SOLO el dato dudoso de mayor prioridad, banco §12.3).
function evaluar(c) {
  const clave = camposClave(c.tipo);
  const dudosos = [];
  for (const campo of PRIORIDAD_PREGUNTA) {
    if (!clave.includes(campo)) continue;
    const info = (c._confianzas || {})[campo] || { valor: c[campo], confianza: 0 };
    const vacio = info.valor === undefined || info.valor === null || info.valor === '';
    if (vacio || info.confianza < UMBRAL_CONFIANZA) dudosos.push(campo);
  }
  for (const campo of clave) if (!dudosos.includes(campo)) {
    const info = (c._confianzas || {})[campo] || { valor: c[campo], confianza: 0 };
    const vacio = info.valor === undefined || info.valor === null || info.valor === '';
    if (vacio || info.confianza < UMBRAL_CONFIANZA) dudosos.push(campo);
  }
  const estado = dudosos.length ? 'necesita-revision' : 'leido';
  const pregunta = estado === 'necesita-revision'
    ? { campo: dudosos[0], texto: `¿Cuál es ${CAMPO_LEGIBLE[dudosos[0]] || 'ese dato'} de este comprobante?` }
    : null;
  return { estado, dudosos, pregunta };
}

// Arma el comprobante normalizado desde la salida cruda del extractor.
function normalizarExtraccion(raw, fundamentoFiscal) {
  const r = raw || {};
  const conf = r.confianza && typeof r.confianza === 'object' ? r.confianza : {};
  const tipoLeido = normTexto(r.tipo).toLowerCase();
  const tipoDoc = ['factura', 'ticket', 'remito', 'recibo'].includes(tipoLeido) ? tipoLeido : 'otro';

  const emisorCuit = normCuit(r.emisor_cuit);
  const receptorCuit = normCuit(r.receptor_cuit);
  // Dirección: manda el CUIT propio del fundamento (los papeles
  // mandan, pero el dueño ya declaró cuál es SU cuit).
  let direccion = '';
  const propio = fundamentoFiscal && fundamentoFiscal.cuit ? soloDigitos(fundamentoFiscal.cuit) : '';
  if (propio && emisorCuit && emisorCuit === propio) direccion = 'emitida';
  else if (propio && receptorCuit && receptorCuit === propio) direccion = 'recibida';
  else if (tipoDoc === 'factura') direccion = normTexto(r.direccion).toLowerCase() === 'emitida' ? 'emitida' : 'recibida';
  else direccion = 'recibida';

  const tipo = tipoDoc === 'factura' ? `factura-${direccion}` : tipoDoc;
  const c = {
    tipo, direccion,
    emisor_nombre: normTexto(r.emisor_nombre),
    emisor_cuit: emisorCuit,
    receptor_nombre: normTexto(r.receptor_nombre),
    receptor_cuit: receptorCuit,
    numero: normNumero(r.numero),
    fecha: normFecha(r.fecha),
    vencimiento: normFecha(r.vencimiento),
    moneda: normTexto(r.moneda).toUpperCase().slice(0, 6),
    monto_total: normMonto(r.monto_total),
    monto_neto: normMonto(r.monto_neto),
    impuestos: Array.isArray(r.impuestos)
      ? r.impuestos.map((i) => ({ concepto: normTexto(i && i.concepto), monto: normMonto(i && i.monto) })).filter((i) => i.concepto || i.monto !== null)
      : [],
    cae: normTexto(r.cae),
    concepto: normTexto(r.concepto),
    _sugerencia: { valor: normTexto(r.clasificacion_sugerida).toLowerCase(), confianza: confDe(conf, 'clasificacion_sugerida', !!r.clasificacion_sugerida) },
    _confianzas: {},
  };
  const camposConf = ['tipo', 'emisor_nombre', 'emisor_cuit', 'receptor_nombre', 'receptor_cuit', 'numero', 'fecha', 'vencimiento', 'monto_total', 'monto_neto', 'cae'];
  for (const campo of camposConf) {
    let confianza = confDe(conf, campo, c[campo] !== '' && c[campo] !== null && c[campo] !== undefined);
    if ((campo === 'emisor_cuit' || campo === 'receptor_cuit') && c[campo] && !cuitChecksumOk(c[campo])) confianza = Math.min(confianza, 0.3);
    c._confianzas[campo] = { valor: c[campo], confianza };
  }
  return c;
}

function huellaDe(c) {
  // Dedupe del brief y de las áreas §7: mismo emisor + tipo + número +
  // CUIT = el mismo papel. Sin emisor o sin número no hay huella: no
  // se afirma un duplicado que no se puede respaldar.
  const emisorKey = c.emisor_cuit || slug(c.emisor_nombre);
  if (!emisorKey || !c.numero) return null;
  return `${emisorKey}|${c.tipo}|${c.numero}`;
}

function fundamentoFiscalDe(db, userId) {
  try {
    const datos = gesty.getData(db, userId, { grupo: 'datos-fiscales' });
    const out = {};
    for (const d of datos) out[d.campo] = d.valor;
    return { cuit: out.cuit || out.cuit_cuil || '', razon_social: out.razon_social || '' };
  } catch (e) { return { cuit: '', razon_social: '' }; }
}

// ---------------------------------------------------------------------------
// Guardado del archivo (infraestructura existente: MEDIA_DIR + /media)
// ---------------------------------------------------------------------------

function extDeMime(mime, nombreArchivo) {
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  const ext = path.extname(String(nombreArchivo || '')).toLowerCase().replace('.', '');
  return ['pdf', 'png', 'webp', 'jpg', 'jpeg'].includes(ext) ? ext : '';
}
function mimeDeExt(ext) {
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}

function guardarArchivo(buffer, mime, nombreArchivo) {
  if (!_cfg.mediaDir || !Buffer.isBuffer(buffer) || !buffer.length) return { archivo_path: '', archivo_mime: mime || '' };
  const ext = extDeMime(mime, nombreArchivo);
  if (!ext) fail('Formato no soportado: subí una foto (JPG/PNG/WebP) o un PDF del comprobante.');
  fs.mkdirSync(_cfg.mediaDir, { recursive: true });
  const name = `gesty-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(_cfg.mediaDir, name), buffer);
  return { archivo_path: `/media/${name}`, archivo_mime: mimeDeExt(ext) };
}

// ---------------------------------------------------------------------------
// La ingesta (corazón de G-03)
// ---------------------------------------------------------------------------

function parseRow(r) {
  if (!r) return null;
  let impuestos = [];
  let extraccion = {};
  let dudosos = [];
  try { impuestos = JSON.parse(r.impuestos || '[]'); } catch (e) { impuestos = []; }
  try { extraccion = JSON.parse(r.extraccion || '{}'); } catch (e) { extraccion = {}; }
  try { dudosos = JSON.parse(r.campos_dudosos || '[]'); } catch (e) { dudosos = []; }
  const c = {
    id: r.id, tipo: r.tipo, direccion: r.direccion,
    emisor: { nombre: r.emisor_nombre, cuit: r.emisor_cuit },
    receptor: { nombre: r.receptor_nombre, cuit: r.receptor_cuit },
    numero: r.numero, fecha: r.fecha, vencimiento: r.vencimiento,
    moneda: r.moneda, monto_total: r.monto_total, monto_neto: r.monto_neto,
    impuestos, cae: r.cae, concepto: r.concepto,
    clasificacion: r.clasificacion,
    archivo: { path: r.archivo_path, nombre: r.archivo_nombre, mime: r.archivo_mime },
    origen: r.origen, estado_lectura: r.estado_lectura,
    campos_dudosos: dudosos,
    pregunta: null,
    extraccion,
    duplicado_de: r.duplicado_de,
    asiento_vinculado: r.asiento_vinculado || '',
    creado_por: r.creado_por, creado_en: r.created_at, actualizado_en: r.updated_at,
  };
  if (c.estado_lectura === 'necesita-revision' && dudosos.length) {
    c.pregunta = { campo: dudosos[0], texto: `¿Cuál es ${CAMPO_LEGIBLE[dudosos[0]] || 'ese dato'} de este comprobante?` };
  }
  return c;
}

function getComprobante(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_comprobantes WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parseRow(r);
}

// Al terminar la lectura: evaluación, eventos y propuestas al
// fundamento. Devuelve la fila ya persistida (parseada).
function cerrarLectura(db, userId, id, c, opts) {
  const o = opts || {};
  const { estado, dudosos, pregunta } = evaluar(c);
  const { clasificacion, regla } = c.clasificacion && CLASIFICACIONES.includes(c.clasificacion)
    ? { clasificacion: c.clasificacion, regla: 'corregida-por-el-dueno' }
    : clasificar(c);
  c.clasificacion = clasificacion;
  const extraccion = {
    via: o.via || '',
    campos: c._confianzas || {},
    clasificacion_regla: regla,
    sugerencia: c._sugerencia || null,
  };
  db.prepare(`UPDATE gesty_comprobantes SET tipo = ?, direccion = ?, emisor_nombre = ?, emisor_cuit = ?,
    receptor_nombre = ?, receptor_cuit = ?, numero = ?, fecha = ?, vencimiento = ?, moneda = ?,
    monto_total = ?, monto_neto = ?, impuestos = ?, cae = ?, concepto = ?, clasificacion = ?,
    estado_lectura = ?, campos_dudosos = ?, extraccion = ?, huella = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(c.tipo, c.direccion || '', c.emisor_nombre || '', c.emisor_cuit || '', c.receptor_nombre || '', c.receptor_cuit || '',
      c.numero || '', c.fecha || '', c.vencimiento || '', c.moneda || '', c.monto_total, c.monto_neto,
      JSON.stringify(c.impuestos || []), c.cae || '', c.concepto || '', clasificacion,
      estado, JSON.stringify(dudosos), JSON.stringify(extraccion), huellaDe(c), id);
  const comp = getComprobante(db, userId, id);
  if (estado === 'leido') {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'comprobante', entidad_id: String(id),
      tipo_evento: 'comprobante-leido',
      resumen: `Comprobante leído y archivado: ${comp.emisor.nombre || comp.tipo} ${comp.numero || ''} · ${comp.moneda || ''} ${comp.monto_total ?? ''}`.trim(),
      payload: { tipo: comp.tipo, clasificacion, regla, via: extraccion.via },
    });
  } else {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'comprobante', entidad_id: String(id),
      tipo_evento: 'comprobante-revision',
      resumen: `Comprobante guardado, falta un dato: ${CAMPO_LEGIBLE[dudosos[0]] || dudosos[0]}`,
      payload: { campos_dudosos: dudosos, via: extraccion.via },
    });
    // La pregunta única (banco §12.3): UNA, por el dato dudoso, con
    // su momento (este comprobante) y su destino (este registro).
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'comprobante', entidad_id: String(id),
      tipo_evento: 'pregunta-hecha', resumen: pregunta ? pregunta.texto : '',
      payload: { campo: dudosos[0], comprobante_id: id, origen_pregunta: 'comprobante-necesita-revision' },
    });
  }
  return comp;
}

// La contraparte se PROPONE al fundamento (build-spec §3.3): nace con
// origen `comprobante` si no existe; si ya existe, no se toca (el
// dueño corrige; los cambios de precio los marca G-07 contra la
// última compra). Los datos fiscales propios: solo nacen del primer
// comprobante emitido que los muestra; jamás se sobrescriben.
function proponerAlFundamento(db, userId, comp) {
  const propuestas = [];
  const yaExiste = (grupo, campo) => gesty.getData(db, userId, { grupo }).some((d) => d.campo === campo);
  const crear = (grupo, campo, valor) => {
    if (yaExiste(grupo, campo)) return;
    try {
      gesty.setData(db, userId, {
        grupo, campo, valor, origen: 'comprobante', origen_ref: String(comp.id), cargado_por: 'gesty',
      });
      propuestas.push(`${grupo}:${campo}`);
    } catch (e) { /* la fundación manda: si rechaza, la propuesta no nace */ }
  };
  if (comp.direccion === 'recibida' && (comp.emisor.nombre || comp.emisor.cuit)) {
    const campo = comp.emisor.cuit ? `cuit_${comp.emisor.cuit}` : slug(comp.emisor.nombre);
    crear('proveedores', campo, {
      nombre: comp.emisor.nombre, cuit: comp.emisor.cuit || '',
      ultimo_comprobante: comp.id, ultimo_monto: comp.monto_total, moneda: comp.moneda || '',
    });
  }
  if (comp.direccion === 'emitida' && (comp.receptor.nombre || comp.receptor.cuit)) {
    const campo = comp.receptor.cuit ? `cuit_${comp.receptor.cuit}` : slug(comp.receptor.nombre);
    crear('clientes-facturacion', campo, {
      nombre: comp.receptor.nombre, cuit: comp.receptor.cuit || '',
      ultimo_comprobante: comp.id, ultimo_monto: comp.monto_total, moneda: comp.moneda || '',
    });
  }
  if (comp.direccion === 'emitida' && comp.emisor.cuit) {
    crear('datos-fiscales', 'cuit', comp.emisor.cuit);
    if (comp.emisor.nombre) crear('datos-fiscales', 'razon_social', comp.emisor.nombre);
  }
  return propuestas;
}

// Pipeline común: persiste el comprobante ya leído (o sin leer) con su
// dedupe y sus propuestas. `c` viene normalizado (o vacío si no hubo
// lectura posible); `meta` trae origen/archivo/creador.
function persistirLeido(db, userId, c, meta) {
  const huella = huellaDe(c);
  let duplicadoDe = null;
  if (huella) {
    const prev = db.prepare('SELECT id FROM gesty_comprobantes WHERE user_id = ? AND huella = ? AND duplicado_de IS NULL ORDER BY id ASC LIMIT 1')
      .get(userId, huella);
    if (prev) duplicadoDe = Number(prev.id);
  }
  const info = db.prepare(`INSERT INTO gesty_comprobantes (user_id, tipo, direccion, emisor_nombre, emisor_cuit,
    receptor_nombre, receptor_cuit, numero, fecha, vencimiento, moneda, monto_total, monto_neto, impuestos,
    cae, concepto, clasificacion, archivo_path, archivo_nombre, archivo_mime, origen, estado_lectura,
    campos_dudosos, extraccion, huella, duplicado_de, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, c.tipo || 'otro', c.direccion || '', c.emisor_nombre || '', c.emisor_cuit || '',
      c.receptor_nombre || '', c.receptor_cuit || '', c.numero || '', c.fecha || '', c.vencimiento || '',
      c.moneda || '', c.monto_total, c.monto_neto, JSON.stringify(c.impuestos || []), c.cae || '', c.concepto || '',
      '', meta.archivo_path || '', meta.archivo_nombre || '', meta.archivo_mime || '',
      meta.origen || 'upload', 'necesita-revision', '[]', '{}', huella, duplicadoDe, meta.creado_por || 'gesty');
  const id = Number(info.lastInsertRowid);
  gesty.recordEvent(db, userId, {
    actor: meta.creado_por === 'dueno' ? 'dueno' : 'gesty',
    entidad_tipo: 'comprobante', entidad_id: String(id),
    tipo_evento: 'comprobante-registrado',
    resumen: `Entró un comprobante (${meta.origen || 'upload'})`,
    payload: { origen: meta.origen || 'upload', archivo: meta.archivo_nombre || '' },
  });
  if (duplicadoDe !== null) {
    // Áreas §7: el duplicado no se descarta — se guarda, marcado, y
    // no vuelve a proponer ni a preguntar: el vivo es el primero.
    db.prepare(`UPDATE gesty_comprobantes SET estado_lectura = 'duplicado', updated_at = datetime('now') WHERE id = ?`).run(id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'comprobante', entidad_id: String(id),
      tipo_evento: 'comprobante-duplicado',
      resumen: `Duplicado del comprobante #${duplicadoDe}: quedó guardado, marcado como duplicado`,
      payload: { duplicado_de: duplicadoDe, huella },
    });
    return { comprobante: getComprobante(db, userId, id), duplicado: true, propuestas: [] };
  }
  const comp = cerrarLectura(db, userId, id, c, { via: meta.via || '' });
  const propuestas = proponerAlFundamento(db, userId, comp);
  return { comprobante: comp, duplicado: false, propuestas };
}

// Ingesta por subida (foto/PDF): guarda el archivo con la infra de la
// casa y corre la lectura. Devuelve { comprobante, duplicado, propuestas }.
async function ingestUpload(db, userId, args) {
  ensureSchema(db);
  const a = args || {};
  const buffer = a.buffer;
  if (!Buffer.isBuffer(buffer) || !buffer.length) fail('El archivo llegó vacío.');
  if (buffer.length > 15 * 1024 * 1024) fail('El archivo supera los 15 MB.');
  const mime = a.contentType || a.mime || mimeDeExt(extDeMime('', a.nombreArchivo));
  const guardado = guardarArchivo(buffer, mime, a.nombreArchivo);
  const raw = await correrExtractor(userId, { buffer, mime: guardado.archivo_mime || mime, nombreArchivo: a.nombreArchivo || '' });
  const fiscal = fundamentoFiscalDe(db, userId);
  const c = raw
    ? normalizarExtraccion(raw, fiscal)
    : normalizarExtraccion(null, fiscal);
  return persistirLeido(db, userId, c, {
    origen: 'upload', creado_por: 'dueno',
    archivo_path: guardado.archivo_path, archivo_nombre: a.nombreArchivo || '', archivo_mime: guardado.archivo_mime,
    via: raw ? (raw._via || 'modelo') : 'sin-modelo',
  });
}

// Ingesta por email (build-spec §7.1): el lector de la casilla entrega
// mensajes normalizados { de, asunto, adjuntos: [{ nombre, content_type
// | tipo, datos_base64 | base64 }] } — el mismo patrón de fuente
// inyectada de hola-inbox.js. Cada adjunto papel entra al registro;
// un mensaje sin adjuntos no crea nada (y lo dice).
async function ingestEmail(db, userId, mensaje) {
  ensureSchema(db);
  const m = mensaje || {};
  const adjuntos = Array.isArray(m.adjuntos) ? m.adjuntos : (Array.isArray(m.attachments) ? m.attachments : []);
  const resultados = [];
  for (const adj of adjuntos) {
    const b64 = adj.datos_base64 || adj.base64 || adj.datos || '';
    if (!b64) continue;
    const buffer = Buffer.from(String(b64), 'base64');
    if (!buffer.length || buffer.length > 15 * 1024 * 1024) continue;
    const mime = adj.content_type || adj.tipo || mimeDeExt(extDeMime('', adj.nombre));
    const guardado = guardarArchivo(buffer, mime, adj.nombre);
    const raw = await correrExtractor(userId, { buffer, mime: guardado.archivo_mime || mime, nombreArchivo: adj.nombre || '' });
    const fiscal = fundamentoFiscalDe(db, userId);
    const c = raw ? normalizarExtraccion(raw, fiscal) : normalizarExtraccion(null, fiscal);
    resultados.push(persistirLeido(db, userId, c, {
      origen: 'email', creado_por: 'gesty',
      archivo_path: guardado.archivo_path, archivo_nombre: adj.nombre || '', archivo_mime: guardado.archivo_mime,
      via: raw ? (raw._via || 'modelo') : 'sin-modelo',
    }));
  }
  return { comprobantes: resultados.map((r) => r.comprobante), duplicados: resultados.filter((r) => r.duplicado).length };
}

// Registro manual asistido (build-spec §7.4): el dueño (o el chat por
// él) dicta los datos; lo que falta lo pregunta Gesty — el registro
// nace igual, marcado necesita-revision con su pregunta. Lo dicho por
// el dueño entra con confianza plena: no pasa por el modelo.
function registrarManual(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fiscal = fundamentoFiscalDe(db, userId);
  const crudo = {
    tipo: d.tipo || 'factura', direccion: d.direccion,
    emisor_nombre: d.emisor_nombre, emisor_cuit: d.emisor_cuit,
    receptor_nombre: d.receptor_nombre, receptor_cuit: d.receptor_cuit,
    numero: d.numero, fecha: d.fecha, vencimiento: d.vencimiento,
    moneda: d.moneda, monto_total: d.monto_total, monto_neto: d.monto_neto,
    impuestos: d.impuestos, cae: d.cae, concepto: d.concepto,
    clasificacion_sugerida: d.clasificacion,
    confianza: {},
  };
  for (const campo of ['tipo', 'emisor_nombre', 'emisor_cuit', 'receptor_nombre', 'receptor_cuit', 'numero', 'fecha', 'vencimiento', 'monto_total', 'monto_neto', 'cae', 'clasificacion_sugerida']) {
    if (d[campo] !== undefined && d[campo] !== null && d[campo] !== '') crudo.confianza[campo] = 1;
  }
  const c = normalizarExtraccion(crudo, fiscal);
  if (d.clasificacion && CLASIFICACIONES.includes(String(d.clasificacion))) c.clasificacion = String(d.clasificacion);
  return persistirLeido(db, userId, c, { origen: 'manual', creado_por: 'dueno', via: 'manual' });
}

// Corrección del dueño (la respuesta a la pregunta única, o una
// corrección desde el detalle del papel): actualiza SOLO los campos
// que manda, con confianza plena y origen dueño, y reevalúa el
// comprobante: si era la respuesta a la pregunta, queda registrado
// pregunta-respondida; si todavía falta otro dato, nace la pregunta
// siguiente. La historia queda en el registro (build-spec §8).
function corregirComprobante(db, userId, id, campos, opts) {
  ensureSchema(db);
  const o = opts || {};
  if (String(o.actor || 'dueno') !== 'dueno') fail('Solo el dueño corrige un comprobante.');
  const row = db.prepare('SELECT * FROM gesty_comprobantes WHERE id = ?').get(Number(id));
  if (!row || row.user_id !== userId) fail('Ese comprobante no es de esta cuenta.');
  if (row.estado_lectura === 'duplicado') fail('Es un duplicado guardado: se corrige el comprobante original.');
  const cambios = {};
  for (const campo of CAMPOS_CORREGIBLES) {
    if (campos && campos[campo] !== undefined) cambios[campo] = campos[campo];
  }
  if (!Object.keys(cambios).length) fail('No llegó ningún dato para corregir.');

  const actual = parseRow(row);
  const crudo = {
    tipo: cambios.tipo !== undefined ? String(cambios.tipo).replace(/-(recibida|emitida)$/, '') : actual.tipo.replace(/-(recibida|emitida)$/, ''),
    direccion: cambios.direccion !== undefined ? cambios.direccion : actual.direccion,
    emisor_nombre: cambios.emisor_nombre !== undefined ? cambios.emisor_nombre : actual.emisor.nombre,
    emisor_cuit: cambios.emisor_cuit !== undefined ? cambios.emisor_cuit : actual.emisor.cuit,
    receptor_nombre: cambios.receptor_nombre !== undefined ? cambios.receptor_nombre : actual.receptor.nombre,
    receptor_cuit: cambios.receptor_cuit !== undefined ? cambios.receptor_cuit : actual.receptor.cuit,
    numero: cambios.numero !== undefined ? cambios.numero : actual.numero,
    fecha: cambios.fecha !== undefined ? cambios.fecha : actual.fecha,
    vencimiento: cambios.vencimiento !== undefined ? cambios.vencimiento : actual.vencimiento,
    moneda: cambios.moneda !== undefined ? cambios.moneda : actual.moneda,
    monto_total: cambios.monto_total !== undefined ? cambios.monto_total : actual.monto_total,
    monto_neto: cambios.monto_neto !== undefined ? cambios.monto_neto : actual.monto_neto,
    impuestos: actual.impuestos,
    cae: cambios.cae !== undefined ? cambios.cae : actual.cae,
    concepto: cambios.concepto !== undefined ? cambios.concepto : actual.concepto,
    clasificacion_sugerida: cambios.clasificacion !== undefined ? cambios.clasificacion : actual.clasificacion,
    confianza: {},
  };
  // Confianzas previas: se conservan las de la extracción; lo que el
  // dueño toca queda con confianza plena (él es la fuente).
  const prevConf = (actual.extraccion && actual.extraccion.campos) || {};
  for (const [campo, info] of Object.entries(prevConf)) crudo.confianza[campo] = info && typeof info.confianza === 'number' ? info.confianza : 0;
  for (const campo of Object.keys(cambios)) crudo.confianza[campo] = 1;
  const fiscal = fundamentoFiscalDe(db, userId);
  const c = normalizarExtraccion(crudo, fiscal);
  if (cambios.clasificacion && CLASIFICACIONES.includes(String(cambios.clasificacion))) c.clasificacion = String(cambios.clasificacion);

  const anterior = { estado_lectura: actual.estado_lectura, campos_dudosos: actual.campos_dudosos };
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'comprobante', entidad_id: String(row.id),
    tipo_evento: 'comprobante-corregido',
    resumen: `El dueño corrigió un comprobante: ${Object.keys(cambios).join(', ')}`,
    payload: { cambios: Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v])), anterior },
  });
  if (actual.pregunta && Object.prototype.hasOwnProperty.call(cambios, actual.pregunta.campo)) {
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'comprobante', entidad_id: String(row.id),
      tipo_evento: 'pregunta-respondida',
      resumen: `Respondió la pregunta por ${CAMPO_LEGIBLE[actual.pregunta.campo] || actual.pregunta.campo}`,
      payload: { campo: actual.pregunta.campo, comprobante_id: row.id },
    });
  }
  const comp = cerrarLectura(db, userId, row.id, c, { via: (actual.extraccion && actual.extraccion.via) || '' });
  const propuestas = proponerAlFundamento(db, userId, comp);
  return { comprobante: comp, propuestas };
}

// ---------------------------------------------------------------------------
// Consulta (la base de «Papeles» y del cierre G-06)
// ---------------------------------------------------------------------------

function listComprobantes(db, userId, filtros) {
  ensureSchema(db);
  const f = filtros || {};
  const where = ['user_id = ?'];
  const params = [userId];
  if (!f.incluir_duplicados) where.push("estado_lectura != 'duplicado'");
  if (f.estado) { where.push('estado_lectura = ?'); params.push(String(f.estado)); }
  if (f.tipo) { where.push('tipo = ?'); params.push(String(f.tipo)); }
  if (f.clasificacion) { where.push('clasificacion = ?'); params.push(String(f.clasificacion)); }
  if (f.desde) { where.push('fecha >= ?'); params.push(String(f.desde)); }
  if (f.hasta) { where.push('fecha <= ?'); params.push(String(f.hasta)); }
  if (f.contraparte) {
    where.push('(emisor_nombre LIKE ? OR receptor_nombre LIKE ? OR emisor_cuit LIKE ? OR receptor_cuit LIKE ?)');
    const like = `%${String(f.contraparte)}%`;
    params.push(like, like, like, like);
  }
  if (f.q) {
    where.push('(numero LIKE ? OR concepto LIKE ? OR emisor_nombre LIKE ? OR receptor_nombre LIKE ? OR cae LIKE ?)');
    const like = `%${String(f.q)}%`;
    params.push(like, like, like, like, like);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM gesty_comprobantes WHERE ${where.join(' AND ')}`).get(...params).n;
  const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 500);
  const offset = Math.max(Number(f.offset) || 0, 0);
  const rows = db.prepare(`SELECT * FROM gesty_comprobantes WHERE ${where.join(' AND ')} ORDER BY fecha DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return { comprobantes: rows.map(parseRow), total: Number(total) || 0 };
}

function historialComprobante(db, userId, id) {
  const comp = getComprobante(db, userId, id);
  if (!comp) fail('Ese comprobante no es de esta cuenta.');
  return { comprobante: comp, historial: gesty.listEvents(db, userId, { entidad_tipo: 'comprobante', entidad_id: String(id) }) };
}

module.exports = {
  // constantes
  TIPOS, CLASIFICACIONES, ORIGENES_INGESTA, UMBRAL_CONFIANZA,
  REGLAS_CLASIFICACION, CAMPOS_CORREGIBLES,
  // configuración / inyección
  configure, registerExtractor,
  // esquema
  ensureSchema,
  // ingesta
  ingestUpload, ingestEmail, registrarManual,
  // corrección y consulta
  corregirComprobante, getComprobante, listComprobantes, historialComprobante,
  // piezas internas, exportadas para tests y reuso
  normalizarExtraccion, evaluar, clasificar, huellaDe, cuitChecksumOk,
};
