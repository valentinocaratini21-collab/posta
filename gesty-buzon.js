// =====================================================================
// GESTY · G-23 — EL BUZÓN DE PAPELES (la dirección de email del
// negocio). Spec: gesty-cola-builds.md G-23 («cada negocio recibe su
// dirección: el comprobante reenviado entra solo como papel de G-03,
// leído y archivado; del remitente se propone la contraparte; sin
// registro no hay promesa: el evento de ingesta es la constancia»).
//
// QUÉ ES: cada cuenta con Gesty puede generar SU dirección de buzón
// — papeles+<token>@gestyofficemanager.com — y cualquier comprobante
// que un proveedor (o el propio dueño) reenvíe a esa dirección entra
// SOLO al registro de papeles de G-03, por la ingesta de email que
// G-03 ya tiene (ingestEmail: este build NO duplica su lógica, la
// llama). Reenviar un mail es el gesto con menos fricción que
// existe: ni abrir la app, ni sacar una foto, ni completar nada.
//
// LA DIRECCIÓN ES UNA CREDENCIAL. El token (24 bytes aleatorios,
// hex) ES la identidad del buzón: quien lo conoce puede meter
// papeles en la cuenta. Por eso, patrón G-15b: en el servidor solo
// vive su HUELLA sha256 (tabla propia con índice único + espejo en
// el fundamento, grupo «cuentas-medios», campo «buzon_papeles» —
// ahí también vive solo la huella, jamás el token). La dirección en
// claro se devuelve UNA vez por generación (la respuesta de
// generar); después el estado muestra la dirección enmascarada y la
// huella corta. Si se pierde o se filtra: REGENERAR mata la
// anterior en el acto (la huella se reemplaza; el token viejo deja
// de resolver y sus emails se descartan registrados). El token
// jamás aparece en logs ni en gesty_events (solo su huella corta, 8
// hex del hash — lo que el registro puede citar sin filtrar nada).
//
// Sin dirección generada, NO hay buzón: la dirección no se infiere
// del negocio ni existe por default — se genera por acto del dueño
// (ruta con sesión + pack + capacidad «comprobantes») y el módulo
// lo declara en cada estado.
//
// LA INGESTA (pública, sin sesión — el token es la credencial):
//   POST /api/gesty/buzon/ingresar
//   CONTRATO PARA EL TRANSPORTE (H-G23-1): este endpoint es el que
//   va a golpear el Worker de Cloudflare Email Routing cuando
//   exista. El Worker recibe el correo crudo en
//   *@gestyofficemanager.com y reenvía a este endpoint un JSON:
//     {
//       "para": "papeles+<token>@gestyofficemanager.com",
//         // alias aceptados: "destino" | "to"; o "token": "<token>"
//       "de": "facturacion@proveedor.example",
//         // alias: "remitente" | "from" (acepta «Nombre <email>»)
//       "asunto": "Factura 0003-00001234",          // opcional
//       "cuerpo_texto": "…", "cuerpo_html": "…",    // opcionales
//       "adjuntos": [ { "nombre": "factura.pdf",
//                       "content_type": "application/pdf",
//                       "datos_base64": "…" } ]     // alias de
//         // campos: tipo|mime, base64|datos — los de G-03
//     }
//   Respuestas: 200 { ok, ingesta } · 400 el sobre no cumple el
//   contrato · 404 la dirección no resuelve a ningún buzón activo
//   (token desconocido, regenerado o cuenta sin Gesty: la misma
//   respuesta para los tres — no se filtra cuál) · 429 rate-limit.
//   Guardas EN ORDEN (patrón de la casa, G-14): (1) rate-limit
//   propio por IP — TODO intento cuenta, también el abusivo
//   (60/15 min); (2) resolución del token por huella (índice único
//   + comparación en tiempo constante); un token que no resuelve
//   JAMÁS archiva «en alguna cuenta»: el intento queda en
//   gesty_buzon_descartes con su huella corta y el motivo, fuera
//   de toda cuenta; (3) rate-limit por buzón (240/15 min);
//   (4) validación del sobre (remitente con forma de email);
//   (5) guardas de tamaño por adjunto (10 MB) y por email (20 MB
//   de papeles, máx. 10 adjuntos): el adjunto que excede queda
//   registrado con su motivo, no desaparece; (6) solo los adjuntos
//   PAPEL (PDF/PNG/JPG/WebP por tipo o por extensión) pasan a
//   G-03 — el resto queda registrado como «no-papel» (un .docx no
//   es un papel y el motor de archivos de G-03 lo rechazaría).
//
// EL RESULTADO POR PAPEL es el de G-03 tal cual: «leido», «necesita-
// revision» (con su pregunta única, que la hace G-03) o «duplicado»
// (la huella emisor+tipo+número de G-03 lo marca y lo guarda
// marcado — un reenvío repetido NO duplica el registro vivo). Cada
// ingesta — con papeles o sin ninguno aprovechable — queda en
// gesty_buzon_ingestas Y en el registro durable (evento
// «buzon-ingesta» / «buzon-ingesta-sin-papel», entidad «buzon»):
// el evento ES la constancia (sin registro no hay promesa). Un
// email sin papel aprovechable es «sin-papel» CON SU MOTIVO
// (sin adjuntos, adjuntos no-papel, cuerpo sin comprobante…).
//
// LA CONTRAPARTE corre por el circuito de G-03: cada papel que
// entra propone su emisor/receptor al fundamento con origen
// «comprobante» (propuesta, nunca escritura directa sobre lo que
// ya hay — la identidad fiscal del papel manda sobre la dirección
// de email, que puede ser la de un estudio o una casilla genérica).
// Este build registra por papel si su contraparte YA existía en el
// fundamento («vinculado»: el papel nace atado a la contraparte
// conocida por las claves de siempre, cuit o nombre) o si nació
// como propuesta de esta ingesta, y el remitente queda citado en
// la constancia.
//
// H-G23-1 · EL TRANSPORTE NO ESTÁ CONECTADO (declarado, como G-09b
// construyó la capacidad antes que el canal): la casilla real — el
// Worker de Cloudflare Email Routing que recibe el correo crudo y
// lo reenvía a este endpoint con el contrato de arriba — es un
// paso de infraestructura aparte. Hasta entonces el buzón existe,
// genera direcciones y procesa todo sobre que lo golpee con el
// contrato, pero ningún correo real llega solo.
//
// H-G23-2 · EL CUERPO COMO PAPEL, limitado por la capa de archivos
// de G-03: cuando el cuerpo (texto o HTML) trae un comprobante
// legible — señales deterministas: fecha + monto + CUIT con
// checksum válido o palabra de comprobante — el buzón intenta
// ingresarlo por la misma ingesta de email de G-03 como parte
// «cuerpo-del-email.txt». La capa de archivos de G-03 solo guarda
// PDF/imagen: hoy ese intento se rechaza y el cuerpo queda
// registrado en la ingesta como «no-archivado» CON EL MOTIVO
// LITERAL — jamás se finge un papel que no entró ni se disfraza el
// texto de PDF. Si el Worker (H-G23-1) renderiza un cuerpo HTML
// que ES el comprobante como PDF y lo manda en adjuntos, entra
// como cualquier papel. El cuerpo solo se intenta como papel
// cuando no entró ningún adjunto papel (no duplica lo adjuntado).
//
// Esquema ADITIVO e idempotente, patrón de la casa: no toca
// ninguna tabla existente ni cambia el comportamiento de Posty.
// =====================================================================
'use strict';

const crypto = require('crypto');

const gesty = require('./gesty');
const comprobantes = require('./gesty-comprobantes');

// ---------------------------------------------------------------------------
// Constantes del área
// ---------------------------------------------------------------------------

const DOMINIO_BUZON = 'gestyofficemanager.com';
const PREFIJO_LOCAL = 'papeles+';
const TOKEN_BYTES = 24; // 24 bytes aleatorios → 48 hex (≥16 bytes pedidos, G-15b usa 32 para enlaces; acá la dirección tiene que caber en un local-part de 64)
const GRUPO_FUNDAMENTO = 'cuentas-medios';
const CAMPO_FUNDAMENTO = 'buzon_papeles';

const MAX_ADJUNTOS = 10;
const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;   // por adjunto (G-03 admite 15 MB: el buzón es más estricto y lo declara)
const MAX_EMAIL_BYTES = 20 * 1024 * 1024;     // papeles por email

const RL_IP_MAX = 60;                  // intentos de ingesta por IP…
const RL_BUZON_MAX = 240;              // …y por buzón (huella)…
const RL_VENTANA_MS = 15 * 60 * 1000;  // …cada 15 minutos

const MIMES_PAPEL = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const EXTS_PAPEL = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function errorCon(codigo, mensaje) { const e = new Error(mensaje); e.code = codigo; return e; }
function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function ahoraISO(opts) {
  const o = opts || {};
  if (o.ahora && !Number.isNaN(Date.parse(o.ahora))) return new Date(o.ahora).toISOString();
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Esquema (idempotente, patrón de la casa)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_buzon (
    user_id INTEGER PRIMARY KEY,
    huella TEXT NOT NULL DEFAULT '',
    huella_corta TEXT NOT NULL DEFAULT '',
    generada_en TEXT NOT NULL DEFAULT '',
    generacion INTEGER NOT NULL DEFAULT 0,
    activa INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_buzon_huella ON gesty_buzon(huella) WHERE huella <> '';
  CREATE TABLE IF NOT EXISTS gesty_buzon_ingestas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    remitente TEXT NOT NULL DEFAULT '',
    asunto TEXT NOT NULL DEFAULT '',
    resultado TEXT NOT NULL DEFAULT '',
    papeles INTEGER NOT NULL DEFAULT 0,
    detalle TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_buzon_ingestas_user ON gesty_buzon_ingestas(user_id, id);
  CREATE TABLE IF NOT EXISTS gesty_buzon_descartes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    motivo TEXT NOT NULL DEFAULT '',
    huella_corta TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// Rate-limit propio (el de la casa vive en server.js, inalcanzable
// desde los módulos — precedente G-14/G-15b). En memoria.
// ---------------------------------------------------------------------------

const _hits = new Map(); // clave -> [ms, ...]
function consumirCupo(clave, max, ahoraMs) {
  const desde = ahoraMs - RL_VENTANA_MS;
  const vivos = (_hits.get(clave) || []).filter((t) => t > desde);
  if (vivos.length >= max) { _hits.set(clave, vivos); return false; }
  vivos.push(ahoraMs);
  _hits.set(clave, vivos);
  return true;
}
function _resetRateLimit() { _hits.clear(); }

// ---------------------------------------------------------------------------
// La dirección: generación, estado y resolución
// ---------------------------------------------------------------------------

function tokenDeDestino(destino) {
  let d = normTexto(destino).toLowerCase();
  if (!d) return '';
  const angle = d.match(/<([^<>]+)>/);
  if (angle) d = angle[1].trim();
  if (!d.includes('@')) return d; // alias del contrato: el token pelado
  const local = d.split('@')[0];
  if (!local.startsWith(PREFIJO_LOCAL)) return '';
  return local.slice(PREFIJO_LOCAL.length);
}

function filaBuzon(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_buzon WHERE user_id = ?').get(userId) || null;
}

// Generar (o regenerar) la dirección: acto del dueño. El token nace
// acá, su huella reemplaza a la anterior (la vieja muere en el
// acto) y el fundamento espeja SOLO la huella. La dirección en
// claro se devuelve en esta respuesta y en ninguna otra parte.
function generarDireccion(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  if (!gesty.gestyEnabled(db, userId)) {
    fail('Esta cuenta no tiene Gesty habilitado: sin pack no hay buzón.');
  }
  const previa = filaBuzon(db, userId);
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const huella = sha256Hex(token);
  const huellaCorta = huella.slice(0, 8);
  const generadaEn = ahoraISO(o);
  const generacion = previa ? Number(previa.generacion || 0) + 1 : 1;
  db.prepare(`INSERT INTO gesty_buzon (user_id, huella, huella_corta, generada_en, generacion, activa, updated_at)
    VALUES (?,?,?,?,?,1,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET huella = excluded.huella, huella_corta = excluded.huella_corta,
      generada_en = excluded.generada_en, generacion = excluded.generacion, activa = 1, updated_at = datetime('now')`)
    .run(userId, huella, huellaCorta, generadaEn, generacion);
  // El espejo en el fundamento (la dirección «vive» ahí, spec del
  // build): solo la huella + el estado — el token jamás se escribe.
  gesty.setData(db, userId, {
    grupo: GRUPO_FUNDAMENTO, campo: CAMPO_FUNDAMENTO,
    valor: { activa: true, huella, huella_corta: huellaCorta, generada_en: generadaEn, generacion },
    origen: 'dueno', origen_ref: 'buzon-papeles', cargado_por: 'dueno',
  });
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'buzon', entidad_id: 'direccion',
    tipo_evento: previa ? 'buzon-direccion-regenerada' : 'buzon-direccion-generada',
    resumen: previa
      ? `El dueño regeneró la dirección del buzón (generación ${generacion}); la anterior dejó de funcionar.`
      : 'El dueño generó la dirección del buzón de papeles.',
    payload: { huella_corta: huellaCorta, generacion, generada_en: generadaEn },
  });
  return {
    direccion: `${PREFIJO_LOCAL}${token}@${DOMINIO_BUZON}`,
    token,
    huella_corta: huellaCorta,
    generada_en: generadaEn,
    generacion,
    mato_anterior: !!previa,
  };
}

// El estado que ve el dueño: jamás el token (no se puede recuperar;
// si se perdió, se regenera). Sin fila = sin buzón, declarado.
function estadoBuzon(db, userId) {
  const r = filaBuzon(db, userId);
  if (!r || !r.huella) {
    return {
      existe: false, activa: false, direccion_visible: '', huella_corta: '',
      generada_en: '', generacion: 0,
      nota: 'Esta cuenta todavía no generó su dirección de buzón: sin dirección no hay buzón.',
      transporte: 'pendiente-worker',
    };
  }
  return {
    existe: true,
    activa: r.activa === 1,
    direccion_visible: `${PREFIJO_LOCAL}••••••••@${DOMINIO_BUZON}`,
    huella_corta: r.huella_corta || '',
    generada_en: r.generada_en || '',
    generacion: Number(r.generacion || 0),
    nota: 'La dirección completa se muestra una sola vez, al generarla. Si se perdió, regenerala: la anterior deja de funcionar en el acto.',
    transporte: 'pendiente-worker',
  };
}

// Resolver destino → cuenta por la huella (índice único +
// comparación en tiempo constante, patrón G-15b). Devuelve null si
// el token no resuelve a un buzón activo de una cuenta con Gesty.
function resolverDestino(db, destino) {
  ensureSchema(db);
  const token = tokenDeDestino(destino);
  if (!token) return null;
  const huella = sha256Hex(token.toLowerCase());
  const r = db.prepare('SELECT user_id, huella, activa FROM gesty_buzon WHERE huella = ?').get(huella);
  if (!r || r.activa !== 1) return null;
  const a = Buffer.from(String(r.huella));
  const b = Buffer.from(huella);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!gesty.gestyEnabled(db, Number(r.user_id))) return null;
  return { user_id: Number(r.user_id), huella_corta: huella.slice(0, 8) };
}

// ---------------------------------------------------------------------------
// El sobre: normalización y guardas
// ---------------------------------------------------------------------------

function emailDeRemitente(de) {
  const s = normTexto(de);
  const m = s.match(/<([^<>]+)>/);
  const email = (m ? m[1] : s).trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email) ? email : '';
}

function esPapel(adj, buffer) {
  const mime = normTexto(adj.content_type || adj.tipo || adj.mime).toLowerCase();
  if (MIMES_PAPEL.includes(mime)) return true;
  const ext = normTexto(adj.nombre).toLowerCase().split('.').pop();
  return EXTS_PAPEL.includes(ext) && mime !== 'text/plain';
}

function textoDelCuerpo(sobre) {
  const plano = normTexto(sobre.cuerpo_texto || sobre.texto || '');
  if (plano) return plano;
  const html = String(sobre.cuerpo_html || sobre.html || '');
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// «Comprobante legible» en el cuerpo = señales deterministas, sin
// modelo: fecha + monto + (CUIT con checksum válido o palabra de
// comprobante). Lo que no junta las tres, no es un papel legible.
function cuerpoLegible(texto) {
  const t = String(texto || '');
  if (!t) return { legible: false, senales: [] };
  const senales = [];
  if (/(19|20)\d{2}-\d{2}-\d{2}|\b\d{1,2}[/.]\d{1,2}[/.](19|20)\d{2}\b/.test(t)) senales.push('fecha');
  if (/\$\s?\d|\b\d{1,3}(\.\d{3})+,\d{2}\b|\b\d+,\d{2}\b/.test(t)) senales.push('monto');
  let fiscal = /\b(factura|ticket|recibo|remito)\b/i.test(t);
  if (!fiscal) {
    for (const m of t.matchAll(/\d{2}-?\d{8}-?\d/g)) {
      if (comprobantes.cuitChecksumOk(m[0])) { fiscal = true; break; }
    }
  }
  if (fiscal) senales.push('señal-fiscal');
  return { legible: senales.length === 3, senales };
}

// Las claves de contraparte que el fundamento ya tiene (para decir
// «vinculado» vs «propuesta nueva» sin adivinar).
function contrapartesConocidas(db, userId) {
  const claves = new Set();  // 'grupo:campo'
  const identidades = [];    // { cuit, nombre_norm }
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  for (const grupo of ['proveedores', 'clientes-facturacion']) {
    for (const d of gesty.getData(db, userId, { grupo })) {
      claves.add(`${grupo}:${d.campo}`);
      const v = d.valor && typeof d.valor === 'object' ? d.valor : {};
      identidades.push({ cuit: String(v.cuit || '').replace(/\D/g, ''), nombre_norm: norm(v.nombre) });
    }
  }
  return { claves, identidades, norm };
}

function contraparteDelPapel(comp) {
  if (!comp) return null;
  if (comp.direccion === 'recibida') return comp.emisor;
  if (comp.direccion === 'emitida') return comp.receptor;
  return comp.emisor;
}

// ---------------------------------------------------------------------------
// La ingesta pública (el corazón de G-23)
// ---------------------------------------------------------------------------

async function ingresarEmail(db, sobre, meta) {
  ensureSchema(db);
  const s = sobre || {};
  const m = meta || {};
  const ahoraMs = m.ahora ? Date.parse(m.ahora) : Date.now();
  const ip = String(m.ip || 'desconocida');

  // (1) Rate-limit por IP: TODO intento cuenta.
  if (!consumirCupo(`ip:${ip}`, RL_IP_MAX, ahoraMs)) {
    throw errorCon('RATE_LIMIT', 'Demasiados intentos desde esta conexión. Esperá unos minutos.');
  }
  // (2) Resolución del token por huella.
  const destino = s.para || s.destino || s.to || (s.token ? String(s.token) : '');
  if (!normTexto(destino)) {
    throw errorCon('VALIDACION', 'El sobre no trae dirección destino (para) ni token.');
  }
  const resuelto = resolverDestino(db, destino);
  if (!resuelto) {
    const tokenIntentado = tokenDeDestino(destino);
    db.prepare('INSERT INTO gesty_buzon_descartes (motivo, huella_corta, ip) VALUES (?,?,?)')
      .run('token-sin-buzon', tokenIntentado ? sha256Hex(tokenIntentado.toLowerCase()).slice(0, 8) : '', ip);
    throw errorCon('TOKEN', 'La dirección de buzón no existe o no está activa.');
  }
  const userId = resuelto.user_id;
  // (3) Rate-limit por buzón.
  if (!consumirCupo(`buzon:${resuelto.huella_corta}`, RL_BUZON_MAX, ahoraMs)) {
    throw errorCon('RATE_LIMIT', 'Este buzón recibió demasiados emails en poco tiempo. Esperá unos minutos.');
  }
  // (4) El sobre mínimo: un remitente con forma de email.
  const remitente = emailDeRemitente(s.de || s.remitente || s.from || '');
  if (!remitente) throw errorCon('VALIDACION', 'El sobre no trae un remitente válido (de).');
  const asunto = normTexto(s.asunto || s.subject || '').slice(0, 300);

  // (5) Adjuntos: clasificación previa con su motivo por adjunto.
  const crudos = Array.isArray(s.adjuntos) ? s.adjuntos : (Array.isArray(s.attachments) ? s.attachments : []);
  const resultados = [];
  const papelAdjuntos = [];   // los que pasan a G-03, en orden
  const papelIndice = [];     // índice en `resultados` de cada papel
  let bytesPapel = 0;
  crudos.slice(0, MAX_ADJUNTOS).forEach((adj, i) => {
    const a = adj || {};
    const nombre = normTexto(a.nombre || a.name || '') || `adjunto-${i + 1}`;
    const b64 = a.datos_base64 || a.base64 || a.datos || '';
    const entrada = { fuente: 'adjunto', nombre, resultado: '', motivo: '' };
    if (!b64) { entrada.resultado = 'sin-contenido'; entrada.motivo = 'el adjunto llegó sin contenido'; resultados.push(entrada); return; }
    const buffer = Buffer.from(String(b64), 'base64');
    if (!buffer.length) { entrada.resultado = 'sin-contenido'; entrada.motivo = 'el adjunto llegó vacío'; resultados.push(entrada); return; }
    if (buffer.length > MAX_ADJUNTO_BYTES) {
      entrada.resultado = 'rechazado-tamano';
      entrada.motivo = `el adjunto supera el máximo de ${MAX_ADJUNTO_BYTES / 1024 / 1024} MB por adjunto`;
      resultados.push(entrada); return;
    }
    if (!esPapel(a, buffer)) {
      entrada.resultado = 'no-papel';
      entrada.motivo = 'el formato no es un papel (el buzón archiva PDF o imagen)';
      resultados.push(entrada); return;
    }
    if (bytesPapel + buffer.length > MAX_EMAIL_BYTES) {
      entrada.resultado = 'rechazado-tamano';
      entrada.motivo = `el email supera el máximo de ${MAX_EMAIL_BYTES / 1024 / 1024} MB de papeles`;
      resultados.push(entrada); return;
    }
    bytesPapel += buffer.length;
    entrada.resultado = 'pendiente'; // se completa con el resultado de G-03
    resultados.push(entrada);
    papelAdjuntos.push({ nombre: a.nombre || a.name || nombre, content_type: a.content_type || a.tipo || a.mime || '', datos_base64: String(b64) });
    papelIndice.push(resultados.length - 1);
  });
  if (crudos.length > MAX_ADJUNTOS) {
    resultados.push({ fuente: 'adjunto', nombre: '', resultado: 'rechazado-tamano', motivo: `el email trae más de ${MAX_ADJUNTOS} adjuntos: el resto no se procesó` });
  }

  // La foto de contrapartes ANTES: «vinculado» se juzga contra lo
  // que el fundamento ya tenía cuando el email llegó.
  const antes = contrapartesConocidas(db, userId);

  // (6) Los papeles entran por la ingesta de email de G-03, tal cual.
  let entrados = 0;
  if (papelAdjuntos.length) {
    const r = await comprobantes.ingestEmail(db, userId, { de: remitente, asunto, adjuntos: papelAdjuntos });
    r.comprobantes.forEach((comp, i) => {
      const entrada = resultados[papelIndice[i]];
      if (!entrada) return;
      entrada.resultado = comp.estado_lectura; // leido | necesita-revision | duplicado
      entrada.comprobante_id = comp.id;
      if (comp.estado_lectura === 'duplicado') entrada.duplicado_de = comp.duplicado_de;
      const cp = contraparteDelPapel(comp);
      entrada.contraparte = cp && (cp.nombre || cp.cuit)
        ? { nombre: cp.nombre || '', cuit: cp.cuit || '' } : null;
      entrada.vinculado = !!(cp && ((cp.cuit && antes.identidades.some((x) => x.cuit && x.cuit === String(cp.cuit).replace(/\D/g, '')))
        || (cp.nombre && antes.identidades.some((x) => x.nombre_norm && x.nombre_norm === antes.norm(cp.nombre)))));
      entrados++;
    });
  }

  // (7) El cuerpo: solo como papel si trae un comprobante legible y
  // no entró ningún adjunto papel (H-G23-2: la capa de archivos de
  // G-03 puede rechazar el texto — el desenlace queda registrado).
  const textoCuerpo = textoDelCuerpo(s);
  const leg = cuerpoLegible(textoCuerpo);
  let cuerpoEntrada = null;
  if (textoCuerpo) {
    cuerpoEntrada = { fuente: 'cuerpo', resultado: leg.legible ? 'legible' : 'sin-comprobante', senales: leg.senales };
    if (leg.legible && entrados === 0) {
      try {
        const rb = await comprobantes.ingestEmail(db, userId, {
          de: remitente, asunto,
          adjuntos: [{ nombre: 'cuerpo-del-email.txt', content_type: 'text/plain', datos_base64: Buffer.from(textoCuerpo, 'utf8').toString('base64') }],
        });
        if (rb.comprobantes.length) {
          const comp = rb.comprobantes[0];
          cuerpoEntrada.resultado = comp.estado_lectura;
          cuerpoEntrada.comprobante_id = comp.id;
          if (comp.estado_lectura === 'duplicado') cuerpoEntrada.duplicado_de = comp.duplicado_de;
          entrados++;
        } else {
          cuerpoEntrada.resultado = 'no-archivado';
          cuerpoEntrada.motivo = 'el motor de papeles no produjo un registro desde el cuerpo';
        }
      } catch (e) {
        cuerpoEntrada.resultado = 'no-archivado';
        cuerpoEntrada.motivo = String((e && e.message) || e).slice(0, 200);
      }
    }
    resultados.push(cuerpoEntrada);
  }

  // Las propuestas que esta ingesta dejó en el fundamento (el
  // circuito de G-03): claves nuevas de contrapartes/datos fiscales.
  const despues = contrapartesConocidas(db, userId);
  const propuestas = [...despues.claves].filter((k) => !antes.claves.has(k));

  // (8) El resultado global y su motivo honesto.
  let resultadoGlobal = 'sin-papel';
  let motivoSinPapel = '';
  if (entrados > 0) {
    resultadoGlobal = 'con-papeles';
  } else if (!crudos.length && !textoCuerpo) {
    motivoSinPapel = 'el email llegó sin adjuntos y sin cuerpo';
  } else if (resultados.some((r) => r.resultado === 'no-archivado')) {
    motivoSinPapel = 'el cuerpo traía un comprobante legible pero el motor de papeles no archiva texto plano (H-G23-2)';
  } else if (crudos.length) {
    motivoSinPapel = 'ningún adjunto era un papel aprovechable';
  } else {
    motivoSinPapel = 'el cuerpo no traía un comprobante legible';
  }

  const detalle = {
    resultados,
    propuestas,
    remitente,
    ...(motivoSinPapel ? { motivo: motivoSinPapel } : {}),
  };
  const info = db.prepare(`INSERT INTO gesty_buzon_ingestas (user_id, remitente, asunto, resultado, papeles, detalle)
    VALUES (?,?,?,?,?,?)`)
    .run(userId, remitente, asunto, resultadoGlobal, entrados, JSON.stringify(detalle));
  const ingestaId = Number(info.lastInsertRowid);

  // La constancia en el registro durable (append-only): el evento
  // ES el comprobante de que este email entró y qué pasó con él.
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'buzon', entidad_id: String(ingestaId),
    tipo_evento: resultadoGlobal === 'con-papeles' ? 'buzon-ingesta' : 'buzon-ingesta-sin-papel',
    resumen: resultadoGlobal === 'con-papeles'
      ? `Buzón: entró un email de ${remitente} — ${entrados} papel(es) al registro de comprobantes.`
      : `Buzón: entró un email de ${remitente} sin papel aprovechable (${motivoSinPapel}).`,
    payload: {
      remitente, asunto: asunto.slice(0, 120), huella_corta: resuelto.huella_corta,
      resultados: resultados.map((r) => ({
        fuente: r.fuente, ...(r.nombre ? { nombre: r.nombre } : {}), resultado: r.resultado,
        ...(r.comprobante_id ? { comprobante_id: r.comprobante_id } : {}),
        ...(r.motivo ? { motivo: r.motivo } : {}),
      })),
      propuestas,
    },
  });

  return { ok: true, ingesta: getIngesta(db, userId, ingestaId), resultados };
}

// ---------------------------------------------------------------------------
// Consultas del dueño
// ---------------------------------------------------------------------------

function parseIngestaRow(r) {
  if (!r) return null;
  let detalle = {};
  try { detalle = JSON.parse(r.detalle || '{}'); } catch (e) { detalle = {}; }
  return {
    id: r.id, remitente: r.remitente, asunto: r.asunto,
    resultado: r.resultado, papeles: Number(r.papeles || 0),
    detalle, creado_en: r.created_at,
  };
}

function getIngesta(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_buzon_ingestas WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return parseIngestaRow(r);
}

function listIngestas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const total = db.prepare('SELECT COUNT(*) AS n FROM gesty_buzon_ingestas WHERE user_id = ?').get(userId).n;
  const lim = Math.min(Math.max(Number(o.limit) || 100, 1), 500);
  const off = Math.max(Number(o.offset) || 0, 0);
  const rows = db.prepare('SELECT * FROM gesty_buzon_ingestas WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(userId, lim, off);
  return { ingestas: rows.map(parseIngestaRow), total: Number(total) || 0 };
}

// El resumen para «La oficina»: estado + la actividad del buzón,
// todo contado de los registros reales de este módulo.
function resumenBuzon(db, userId) {
  ensureSchema(db);
  const filas = db.prepare('SELECT resultado, papeles, detalle, created_at FROM gesty_buzon_ingestas WHERE user_id = ? ORDER BY id ASC').all(userId);
  const papeles = { entrados: 0, leidos: 0, necesita_revision: 0, duplicados: 0 };
  let conPapeles = 0, sinPapel = 0;
  for (const f of filas) {
    if (f.resultado === 'con-papeles') conPapeles++; else sinPapel++;
    papeles.entrados += Number(f.papeles || 0);
    let d = {};
    try { d = JSON.parse(f.detalle || '{}'); } catch (e) { d = {}; }
    for (const r of (d.resultados || [])) {
      if (r.resultado === 'leido') papeles.leidos++;
      else if (r.resultado === 'necesita-revision') papeles.necesita_revision++;
      else if (r.resultado === 'duplicado') papeles.duplicados++;
    }
  }
  return {
    buzon: estadoBuzon(db, userId),
    ingestas_total: filas.length,
    con_papeles: conPapeles,
    sin_papel: sinPapel,
    papeles,
    ultima_ingesta_en: filas.length ? filas[filas.length - 1].created_at : '',
  };
}

module.exports = {
  // constantes
  DOMINIO_BUZON, PREFIJO_LOCAL, TOKEN_BYTES,
  MAX_ADJUNTOS, MAX_ADJUNTO_BYTES, MAX_EMAIL_BYTES,
  RL_IP_MAX, RL_BUZON_MAX,
  // esquema
  ensureSchema,
  // la dirección
  generarDireccion, estadoBuzon, resolverDestino,
  // la ingesta pública
  ingresarEmail,
  // consultas
  getIngesta, listIngestas, resumenBuzon,
  // piezas internas, exportadas para tests y reuso
  tokenDeDestino, emailDeRemitente, cuerpoLegible, textoDelCuerpo,
  _resetRateLimit,
};
