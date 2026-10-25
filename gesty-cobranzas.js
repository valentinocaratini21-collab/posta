// =====================================================================
// GESTY · G-05 — COBRANZAS
// Spec: gesty-cola-builds.md G-05 · gesty-areas-detalle.md §3 ·
// gesty-sistema-operativo.md §2.3 (disparador/pasos/registro) y §5
// (matriz: enviar cualquier mensaje de cobranza = SIEMPRE con OK
// del dueño, sin excepción).
//
// El motor vigila las facturas ENVIADAS impagas de G-04 (las
// parciales, por su saldo). Cuando una entra en un escalón nuevo de
// la escalera del fundamento (amable → firme → último aviso), nace
// UNA tarjeta `cobranza` en «Para tu OK» con el mensaje LISTO: el
// texto final, con los datos reales de la factura y del negocio,
// queda congelado en la tarjeta — lo que el dueño lee es lo que
// sale. Una sola cobranza activa por factura; el escalón avanza
// sobre la misma (si la tarjeta sigue esperando, se REGENERA vía
// editCard de la fundación: mismo id, versión nueva).
//
// Enviar es lo que la aprobación ejecuta, con la misma lectura que
// G-04 aplicó a la emisión: approveCard de la fundación invoca al
// ejecutor de forma SÍNCRONA, así que el ejecutor sella el envío
// como APROBADO (mensaje, canal, saldo y versión congelados) y la
// materialización por el canal — async por naturaleza — la hace
// enviarCobranza, la ÚNICA función del servidor que registra un
// envío de cobranza: exige el sello de aprobación previo. No existe
// otra vía: sin tarjeta aprobada, ningún mensaje sale, y cada
// `cobranza-enviada` del registro durable tiene su
// `cobranza-envio-aprobado` (misma tarjeta) antes en el log.
//
// Cuando el pago entra — por el registro de pagos de G-04 a través
// de registrarPago, por un comprobante de pago de G-03 vinculado, o
// por cualquier camino que salde la factura — la cobranza se CIERRA
// sola: el cierre se reconcilia en el escaneo y en cada lectura
// (sincronizarCierres), sin tocar G-04. Pago parcial: la cobranza
// sigue abierta por el saldo y la tarjeta que espera se regenera
// con el número nuevo (el documento cambió debajo del borrador).
//
// Regla de verdad: los mensajes se arman SOLO con datos reales (la
// factura y el fundamento). Nada de amenazas, consecuencias ni
// recargos inventados: la variable {recargo} solo se resuelve si el
// dueño definió su política de mora en el fundamento; si la
// plantilla la menciona y el fundamento no la define, el mensaje
// sale sin esa mención y la tarjeta lleva el aviso para que el
// dueño lo vea ANTES de aprobar.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const facturacion = require('./gesty-facturacion');
const comprobantes = require('./gesty-comprobantes');

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CANALES_COBRANZA = ['email', 'whatsapp-manual'];
const GRUPO_POLITICA = 'reglas-cobro';

// Escalera por default si el dueño no configuró la suya en el
// fundamento: tonos sobrios, sin recargos ni consecuencias (regla
// de verdad). Días desde el vencimiento de la factura.
const ESCALONES_DEFAULT = [
  {
    clave: 'amable', dias_desde: 1,
    plantilla: 'Hola {cliente}, ¿cómo estás? Te escribo de {negocio} para recordarte que la factura {factura} por {moneda} {saldo} venció el {vencimiento}. Si ya la pagaste, desestimá este mensaje; y si no, ¿me confirmás cuándo podrás hacerlo? ¡Gracias!',
  },
  {
    clave: 'firme', dias_desde: 7,
    plantilla: 'Hola {cliente}, te escribo de {negocio}. La factura {factura} por {moneda} {saldo} lleva {dias} días vencida (venció el {vencimiento}). Necesitamos regularizarla: ¿podés confirmarnos hoy la fecha de pago? Gracias.',
  },
  {
    clave: 'ultimo', dias_desde: 15,
    plantilla: 'Hola {cliente}, este es un último aviso de {negocio} por la factura {factura} de {moneda} {saldo}, vencida el {vencimiento} (hace {dias} días). Por favor comunicate hoy con nosotros para resolverlo. Gracias.',
  },
];
const CANAL_DEFAULT = 'email';

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function soloDigitos(v) { return String(v || '').replace(/\D/g, ''); }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtMonto(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function diffDias(desdeISO, hastaISO) {
  if (!esFechaISO(desdeISO) || !esFechaISO(hastaISO)) return null;
  return Math.round((Date.parse(String(hastaISO).slice(0, 10)) - Date.parse(String(desdeISO).slice(0, 10))) / 86400000);
}

// ---------------------------------------------------------------------------
// Configuración e inyección (patrón de la casa: el canal se inyecta)
// ---------------------------------------------------------------------------

const _cfg = { sendEmail: null };

function configure(opts) {
  const o = opts || {};
  if (o.sendEmail !== undefined) _cfg.sendEmail = typeof o.sendEmail === 'function' ? o.sendEmail : null;
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente) — una cobranza activa por factura
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  facturacion.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_cobranzas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    factura_id INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierta',
    escalon_actual TEXT NOT NULL DEFAULT '',
    tarjeta_id INTEGER,
    tarjeta_escalon TEXT NOT NULL DEFAULT '',
    envios TEXT NOT NULL DEFAULT '[]',
    respuestas TEXT NOT NULL DEFAULT '[]',
    promesa_fecha TEXT NOT NULL DEFAULT '',
    motivo_cierre TEXT NOT NULL DEFAULT '',
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_cobranzas_activas
    ON gesty_cobranzas(user_id, factura_id) WHERE estado = 'abierta';
  CREATE INDEX IF NOT EXISTS idx_gesty_cobranzas_user ON gesty_cobranzas(user_id, estado, id);
  `);
  _esquemas.add(db);
}

// ---------------------------------------------------------------------------
// La política de cobranza: vive en el fundamento (grupo
// `reglas-cobro`), la define el dueño. Sin dato, la escalera por
// default. Leer nunca inventa: devuelve también los ids de los
// datos usados (usa_datos de las tarjetas) y de dónde salió todo.
// ---------------------------------------------------------------------------

function validarEscalones(raw) {
  if (!Array.isArray(raw) || !raw.length) fail('La escalera de cobranza necesita al menos un escalón.');
  const vistos = new Set();
  const out = raw.map((e, i) => {
    const o = e || {};
    const clave = normTexto(o.clave).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!clave) fail(`El escalón ${i + 1} no tiene clave válida.`);
    if (vistos.has(clave)) fail(`La escalera repite el escalón «${clave}».`);
    vistos.add(clave);
    const dias = Number(o.dias_desde);
    if (!Number.isFinite(dias)) fail(`El escalón «${clave}» necesita sus días desde el vencimiento.`);
    const plantilla = normTexto(o.plantilla);
    if (!plantilla) fail(`El escalón «${clave}» necesita su plantilla de mensaje.`);
    return { clave, dias_desde: Math.trunc(dias), plantilla };
  });
  out.sort((a, b) => a.dias_desde - b.dias_desde);
  return out;
}

function getPolitica(db, userId) {
  ensureSchema(db);
  const datos = gesty.getData(db, userId, { grupo: GRUPO_POLITICA });
  const porCampo = {};
  for (const d of datos) porCampo[d.campo] = d;
  let escalones = ESCALONES_DEFAULT.map((e) => ({ ...e }));
  let origenEscalones = 'default';
  if (porCampo.cobranza_escalones && Array.isArray(porCampo.cobranza_escalones.valor)) {
    try { escalones = validarEscalones(porCampo.cobranza_escalones.valor); origenEscalones = 'fundamento'; }
    catch (e) { /* la escalera guardada no valida: manda la default, no se rompe la cobranza */ }
  }
  const canalDato = porCampo.cobranza_canal;
  const canal = canalDato && CANALES_COBRANZA.includes(String(canalDato.valor)) ? String(canalDato.valor) : CANAL_DEFAULT;
  const recargo = porCampo.recargo_mora && porCampo.recargo_mora.valor ? normTexto(porCampo.recargo_mora.valor) : '';
  const usaDatos = ['cobranza_escalones', 'cobranza_canal', 'recargo_mora']
    .map((c) => (porCampo[c] ? porCampo[c].id : null)).filter((x) => x !== null);
  const rs = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
  if (rs) usaDatos.push(rs.id);
  return {
    escalones, canal, recargo_mora: recargo,
    origen: origenEscalones, usa_datos: usaDatos,
  };
}

// El dueño define SU escalera (la guarda en el fundamento con
// origen del dueño: su procedencia queda asentada) y el cambio
// queda en el registro durable del área.
function setPolitica(db, userId, politica, opts) {
  ensureSchema(db);
  const p = politica || {};
  const o = opts || {};
  const origenRef = normTexto(o.origen_ref || 'vista-cobranzas');
  if (p.escalones !== undefined) {
    gesty.setData(db, userId, {
      grupo: GRUPO_POLITICA, campo: 'cobranza_escalones', valor: validarEscalones(p.escalones),
      origen: 'dueno', origen_ref: origenRef, cargado_por: 'dueno', confirmado: true,
    });
  }
  if (p.canal !== undefined) {
    const canal = normTexto(p.canal).toLowerCase();
    if (!CANALES_COBRANZA.includes(canal)) fail(`Canal de cobranza inválido: ${canal}. Canales: ${CANALES_COBRANZA.join(', ')}.`);
    gesty.setData(db, userId, {
      grupo: GRUPO_POLITICA, campo: 'cobranza_canal', valor: canal,
      origen: 'dueno', origen_ref: origenRef, cargado_por: 'dueno', confirmado: true,
    });
  }
  if (p.recargo_mora !== undefined) {
    gesty.setData(db, userId, {
      grupo: GRUPO_POLITICA, campo: 'recargo_mora', valor: normTexto(p.recargo_mora),
      origen: 'dueno', origen_ref: origenRef, cargado_por: 'dueno', confirmado: true,
    });
  }
  const vigente = getPolitica(db, userId);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'cobranza', entidad_id: 'politica',
    tipo_evento: 'cobranza-politica-actualizada',
    resumen: `Política de cobranza actualizada: escalera ${vigente.escalones.map((e) => `${e.clave}@${e.dias_desde}d`).join(', ')} · canal ${vigente.canal}${vigente.recargo_mora ? ` · recargo definido: ${vigente.recargo_mora}` : ''}`,
    payload: { escalones: vigente.escalones.map((e) => ({ clave: e.clave, dias_desde: e.dias_desde })), canal: vigente.canal, recargo_definido: !!vigente.recargo_mora },
  });
  return vigente;
}

// ---------------------------------------------------------------------------
// El mensaje de un escalón: SOLO datos reales. Devuelve el texto
// final (el que el dueño va a leer en la tarjeta) y los avisos.
// ---------------------------------------------------------------------------

function negocioNombre(db, userId) {
  const d = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
  return d && d.valor ? String(d.valor) : 'Tu negocio';
}

function armarMensaje(db, userId, f, escalon, politica, diasMora) {
  const avisos = [];
  let texto = String(escalon.plantilla || '');
  const usaRecargo = /\{recargo\}/.test(texto);
  if (usaRecargo && !politica.recargo_mora) {
    avisos.push('La plantilla menciona {recargo} pero tu fundamento no define una política de mora: el mensaje sale sin esa mención. Si querés que la lleve, definí el recargo en tu política de cobranza.');
  }
  const vars = {
    cliente: f.cliente.nombre || f.cliente.cuit || 'cliente',
    negocio: negocioNombre(db, userId),
    factura: f.numero,
    monto: fmtMonto(f.total),
    saldo: fmtMonto(f.saldo),
    moneda: f.moneda || 'ARS',
    vencimiento: fmtFecha(f.vencimiento || f.fecha),
    dias: String(Math.max(0, diasMora || 0)),
    dias_para_vencer: String(diasMora !== null && diasMora < 0 ? -diasMora : 0),
    recargo: politica.recargo_mora || '',
  };
  for (const [k, v] of Object.entries(vars)) {
    texto = texto.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  texto = texto.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
  return { mensaje: texto, avisos };
}

function escalonAplicable(politica, diasMora) {
  let elegido = null;
  for (const e of politica.escalones) {
    if (diasMora >= e.dias_desde) elegido = e;
  }
  return elegido;
}
function ordenEscalon(politica, clave) {
  return politica.escalones.findIndex((e) => e.clave === clave);
}

// ---------------------------------------------------------------------------
// Entidad cobranza — lectura
// ---------------------------------------------------------------------------

function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }

function parseCobranzaRow(db, userId, r, hoy) {
  if (!r) return null;
  const f = facturacion.getFactura(db, userId, r.factura_id);
  const vto = f ? (f.vencimiento || f.fecha) : '';
  const vigente = tarjetaVigenteDe(db, userId, r);
  return {
    id: r.id, user_id: r.user_id, factura_id: r.factura_id,
    estado: r.estado,
    escalon_actual: r.escalon_actual || '',
    escalon: vigente ? (r.tarjeta_escalon || '') : (r.escalon_actual || ''),
    tarjeta_id: r.tarjeta_id || null,
    tarjeta_vigente: vigente,
    envios: safeJson(r.envios, []),
    respuestas: safeJson(r.respuestas, []),
    promesa_fecha: r.promesa_fecha || '',
    motivo_cierre: r.motivo_cierre || '',
    creado_por: r.creado_por,
    creado_en: r.created_at, actualizado_en: r.updated_at,
    factura: f ? {
      numero: f.numero, tipo_comprobante: f.tipo_comprobante, letra: f.letra,
      cliente: f.cliente, fecha: f.fecha, vencimiento: f.vencimiento, moneda: f.moneda,
      total: f.total, pagado: f.pagado, saldo: f.saldo, estado: f.estado, cobro_estado: f.cobro_estado,
    } : null,
    dias_mora: vto ? diffDias(vto, hoy || hoyISO()) : null,
  };
}

// La tarjeta vigente de la cobranza: la que la bandeja todavía
// espera (esperando/devuelta). Una aprobada ya cumplió su acto.
function tarjetaVigenteDe(db, userId, filaCobranza) {
  if (!filaCobranza || !filaCobranza.tarjeta_id) return false;
  const c = gesty.getCard(db, userId, filaCobranza.tarjeta_id);
  return !!(c && (c.estado === 'esperando' || c.estado === 'devuelta'));
}

function filaCobranza(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ?').get(Number(id));
  if (!r || r.user_id !== userId) fail('Esa cobranza no es de esta cuenta.');
  return r;
}
function cobranzaActivaDeFactura(db, userId, facturaId) {
  ensureSchema(db);
  return db.prepare(`SELECT * FROM gesty_cobranzas WHERE user_id = ? AND factura_id = ? AND estado = 'abierta'`)
    .get(userId, Number(facturaId)) || null;
}
function getCobranza(db, userId, id, opts) {
  ensureSchema(db);
  sincronizarCierre(db, userId, Number(id));
  const r = db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseCobranzaRow(db, userId, r, (opts || {}).hoy) : null;
}

// ---------------------------------------------------------------------------
// Cierre: la deuda saldada cierra la cobranza SOLA. Se reconcilia
// en el escaneo y en cada lectura, porque el pago puede entrar por
// caminos que no conocen cobranzas (el registro de pagos de G-04).
// ---------------------------------------------------------------------------

function cerrarCobranza(db, userId, fila, motivo, extra) {
  db.prepare(`UPDATE gesty_cobranzas SET estado = 'cerrada', motivo_cierre = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(motivo, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
    tipo_evento: 'cobranza-cerrada',
    resumen: `Cobranza cerrada (${motivo === 'pago-registrado' ? 'la deuda se saldó' : motivo})`,
    payload: { factura_id: fila.factura_id, motivo, ...(extra || {}) },
  });
  return db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ?').get(fila.id);
}

// Devuelve cuántas cerró. Si se pasa cobranzaId, sincroniza solo esa.
function sincronizarCierres(db, userId, cobranzaId) {
  ensureSchema(db);
  const rows = cobranzaId
    ? db.prepare(`SELECT * FROM gesty_cobranzas WHERE user_id = ? AND id = ? AND estado = 'abierta'`).all(userId, Number(cobranzaId))
    : db.prepare(`SELECT * FROM gesty_cobranzas WHERE user_id = ? AND estado = 'abierta'`).all(userId);
  let cerradas = 0;
  for (const fila of rows) {
    const f = facturacion.getFactura(db, userId, fila.factura_id);
    if (!f) continue;
    if (f.estado === 'cobrada' || f.saldo <= 0) { cerrarCobranza(db, userId, fila, 'pago-registrado'); cerradas++; }
    else if (f.estado === 'anulada') { cerrarCobranza(db, userId, fila, 'factura-anulada'); cerradas++; }
  }
  return cerradas;
}
function sincronizarCierre(db, userId, cobranzaId) { return sincronizarCierres(db, userId, cobranzaId); }

// ---------------------------------------------------------------------------
// Preparar / regenerar la tarjeta del escalón que toca
// ---------------------------------------------------------------------------

function detalleTarjeta(db, userId, fila, f, escalon, politica, diasMora) {
  const { mensaje, avisos } = armarMensaje(db, userId, f, escalon, politica, diasMora);
  const detalle = {
    cobranza_id: fila.id, factura_id: f.id, factura_numero: f.numero,
    cliente: { nombre: f.cliente.nombre, cuit: f.cliente.cuit, email: f.cliente.email },
    escalon: escalon.clave, dias_mora: diasMora,
    vencimiento: f.vencimiento || f.fecha, total: f.total, saldo: f.saldo, moneda: f.moneda,
    canal: politica.canal, mensaje,
  };
  if (avisos.length) detalle.avisos = avisos;
  return detalle;
}
function tituloTarjeta(f, escalon) {
  return `Cobranza ${escalon.clave} — ${f.cliente.nombre || f.cliente.cuit} · Factura ${f.numero} · ${f.moneda} ${fmtMonto(f.saldo)}`;
}

function crearTarjetaEscalon(db, userId, fila, f, escalon, politica, diasMora) {
  const detalle = detalleTarjeta(db, userId, fila, f, escalon, politica, diasMora);
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'cobranza',
    titulo: tituloTarjeta(f, escalon),
    detalle,
    // Como en G-04: la tarjeta NO hereda el vencimiento de la
    // factura — una factura vencida es justamente la que hay que
    // cobrar; si la tarjeta naciera vencida, nunca se podría aprobar.
    monto: f.saldo, moneda: f.moneda, vence: '',
    usa_datos: politica.usa_datos, creado_por: 'gesty',
  });
  db.prepare(`UPDATE gesty_cobranzas SET tarjeta_id = ?, tarjeta_escalon = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(tarjeta.id, escalon.clave, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
    tipo_evento: 'cobranza-escalon-preparado',
    resumen: `Recordatorio ${escalon.clave} listo para tu OK: factura ${f.numero} de ${f.cliente.nombre || f.cliente.cuit} (${f.moneda} ${fmtMonto(f.saldo)}, ${diasMora} días de mora)`,
    payload: { factura_id: f.id, tarjeta_id: tarjeta.id, escalon: escalon.clave, saldo: f.saldo, dias_mora: diasMora },
  });
  return tarjeta;
}

function regenerarTarjetaEscalon(db, userId, fila, f, escalon, politica, diasMora) {
  const detalle = detalleTarjeta(db, userId, fila, f, escalon, politica, diasMora);
  const tarjeta = gesty.editCard(db, userId, fila.tarjeta_id, {
    detalle, titulo: tituloTarjeta(f, escalon), monto: f.saldo, actor: 'gesty',
  });
  db.prepare(`UPDATE gesty_cobranzas SET tarjeta_escalon = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(escalon.clave, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
    tipo_evento: 'cobranza-escalon-actualizado',
    resumen: `El recordatorio de la factura ${f.numero} se regeneró (${escalon.clave}, saldo ${f.moneda} ${fmtMonto(f.saldo)}): la tarjeta espera tu OK con los números nuevos`,
    payload: { factura_id: f.id, tarjeta_id: tarjeta.id, escalon: escalon.clave, saldo: f.saldo, dias_mora: diasMora },
  });
  return tarjeta;
}

// ---------------------------------------------------------------------------
// EL MOTOR de vencimientos
// ---------------------------------------------------------------------------

function escanearVencimientos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const politica = getPolitica(db, userId);
  const resultado = {
    hoy, revisadas: 0, creadas: 0, tarjetas_nuevas: 0, tarjetas_regeneradas: 0,
    promesas_vigentes: 0, envios_pendientes: 0, sin_escalon: 0, sin_vencimiento: 0,
    cerradas: sincronizarCierres(db, userId),
  };
  const { facturas } = facturacion.listFacturas(db, userId, { a_cobrar: true, limit: 1000 });
  for (const f of facturas) {
    if (f.estado !== 'enviada' || f.saldo <= 0) continue; // solo se cobra lo que salió y se debe
    resultado.revisadas++;
    const vto = f.vencimiento || f.fecha;
    if (!vto) { resultado.sin_vencimiento++; continue; }
    const diasMora = diffDias(vto, hoy);
    if (diasMora === null) { resultado.sin_vencimiento++; continue; }
    const escalon = escalonAplicable(politica, diasMora);
    if (!escalon) { resultado.sin_escalon++; continue; }

    let fila = cobranzaActivaDeFactura(db, userId, f.id);
    if (!fila) {
      const info = db.prepare(`INSERT INTO gesty_cobranzas (user_id, factura_id, creado_por) VALUES (?, ?, 'gesty')`)
        .run(userId, f.id);
      fila = db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ?').get(Number(info.lastInsertRowid));
      resultado.creadas++;
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
        tipo_evento: 'cobranza-creada',
        resumen: `Cobranza abierta por la factura ${f.numero} de ${f.cliente.nombre || f.cliente.cuit} (${f.moneda} ${fmtMonto(f.saldo)} de saldo, venció el ${fmtFecha(vto)})`,
        payload: { factura_id: f.id, saldo: f.saldo, vencimiento: vto, dias_mora: diasMora },
      });
    }

    // Promesa del cliente: si prometió pagar y la fecha no pasó,
    // Gesty no apura — serena también para cobrar. Si la fecha
    // pasó sin pago, queda asentado y la escalera sigue.
    if (fila.promesa_fecha) {
      if (fila.promesa_fecha >= hoy) { resultado.promesas_vigentes++; continue; }
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
        tipo_evento: 'cobranza-promesa-incumplida',
        resumen: `La promesa de pago del ${fmtFecha(fila.promesa_fecha)} por la factura ${f.numero} venció sin pago registrado`,
        payload: { factura_id: f.id, promesa_fecha: fila.promesa_fecha },
      });
      db.prepare(`UPDATE gesty_cobranzas SET promesa_fecha = '', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
      fila = db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ?').get(fila.id);
    }

    const envios = safeJson(fila.envios, []);
    const envioPendiente = envios.some((e) => e.estado === 'aprobado' || e.estado === 'fallido');
    if (envioPendiente) { resultado.envios_pendientes++; continue; }

    if (tarjetaVigenteDe(db, userId, fila)) {
      const card = gesty.getCard(db, userId, fila.tarjeta_id);
      const saldoCongelado = card && card.detalle ? Number(card.detalle.saldo) : null;
      if (fila.tarjeta_escalon !== escalon.clave || saldoCongelado !== f.saldo) {
        regenerarTarjetaEscalon(db, userId, fila, f, escalon, politica, diasMora);
        resultado.tarjetas_regeneradas++;
      }
      continue;
    }

    // Sin tarjeta vigente: la última gestión de este escalón ya
    // salió (o volvió aprobada) → no se duplica; el escalón nuevo
    // sí nace.
    if (fila.escalon_actual && ordenEscalon(politica, fila.escalon_actual) >= ordenEscalon(politica, escalon.clave)) {
      continue;
    }
    crearTarjetaEscalon(db, userId, fila, f, escalon, politica, diasMora);
    resultado.tarjetas_nuevas++;
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// EL EJECUTOR de la matriz (tipo `cobranza`): lo invoca approveCard
// tras validar la aprobación en el servidor. Es SÍNCRONO (así lo
// llama la fundación): sella el envío como APROBADO con el mensaje,
// el canal y el saldo de LA tarjeta. El despacho por el canal lo
// hace enviarCobranza — y solo despacha envíos con este sello.
// Nunca devuelve un «enviado»: nada salió todavía (regla de verdad).
// ---------------------------------------------------------------------------

function ejecutarCobranza(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  const fila = d.cobranza_id
    ? db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ? AND user_id = ?').get(Number(d.cobranza_id), userId)
    : null;
  if (!fila) return { ok: false, motivo: 'La cobranza de esta tarjeta ya no existe.' };
  if (fila.estado !== 'abierta') return { ok: false, motivo: 'La deuda ya se saldó: este mensaje ya no corresponde.' };
  if (Number(fila.tarjeta_id) !== Number(card.id)) {
    return { ok: false, motivo: 'Hay una tarjeta más nueva para esta cobranza: se aprueba la vigente.' };
  }
  const f = facturacion.getFactura(db, userId, fila.factura_id);
  if (!f || f.estado !== 'enviada' || f.saldo <= 0) {
    return { ok: false, motivo: 'La deuda ya se saldó: este mensaje ya no corresponde.' };
  }
  if (round2(f.saldo) !== round2(Number(d.saldo))) {
    return { ok: false, motivo: 'El saldo cambió desde que se preparó el mensaje: la tarjeta se regenera con el número actual.' };
  }
  const envios = safeJson(fila.envios, []);
  envios.push({
    estado: 'aprobado',
    tarjeta_id: card.id, version_documento: card.version_documento,
    escalon: d.escalon || fila.tarjeta_escalon || '', canal: d.canal || CANAL_DEFAULT,
    mensaje: d.mensaje || '', destinatario: (f.cliente && f.cliente.email) || '',
    aprobado_en: new Date().toISOString(), intentos: 0,
  });
  db.prepare(`UPDATE gesty_cobranzas SET envios = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(envios), fila.id);
  return {
    ok: true,
    evento: 'cobranza-envio-aprobado', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
    resumen: `Envío de cobranza APROBADO (${d.escalon || ''}): el recordatorio de la factura ${f.numero} quedó sellado para despachar por ${d.canal || CANAL_DEFAULT}`,
    payload: { factura_id: fila.factura_id, tarjeta_id: card.id, escalon: d.escalon || '', canal: d.canal || CANAL_DEFAULT, saldo: f.saldo },
  };
}
gesty.registerExecutor('cobranza', ejecutarCobranza);

// ---------------------------------------------------------------------------
// EL DESPACHO — la única vía de envío de cobranza del servidor.
// Exige el sello del ejecutor (envío 'aprobado' o 'fallido' con su
// aprobación): sin tarjeta aprobada, no sale nada.
// ---------------------------------------------------------------------------

async function enviarCobranza(db, userId, cobranzaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fila = filaCobranza(db, userId, cobranzaId);
  if (fila.estado !== 'abierta') fail('Esta cobranza ya está cerrada: no hay nada para enviar.');
  const f = facturacion.getFactura(db, userId, fila.factura_id);
  if (!f || f.estado !== 'enviada' || f.saldo <= 0) fail('La deuda ya se saldó: no hay nada para cobrar.');
  const envios = safeJson(fila.envios, []);
  const idx = envios.map((e, i) => [e, i]).filter(([e]) => e.estado === 'aprobado' || e.estado === 'fallido').pop();
  if (!idx) fail('Sin el OK del dueño no sale: esta cobranza no tiene un envío aprobado esperando despacho.');
  const [envio, envioIdx] = idx;
  if (o.canal && normTexto(o.canal).toLowerCase() !== envio.canal) {
    fail(`El envío aprobado es por ${envio.canal}: cambiar el canal pide editar la tarjeta y un OK nuevo.`);
  }
  const guardar = () => db.prepare(`UPDATE gesty_cobranzas SET envios = ?, escalon_actual = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(envios), fila.escalon_actual, fila.id);

  if (envio.canal === 'whatsapp-manual') {
    // Manual asistido: el dueño lo manda por su WhatsApp y el envío
    // existe porque queda registrado con su comprobante (G-04).
    const comprobante = normTexto(o.comprobante || '');
    if (!comprobante) fail('El envío manual se registra con su comprobante (qué se mandó y cuándo): sin comprobante, no hay envío.');
    envio.estado = 'enviado';
    envio.intentos = (envio.intentos || 0) + 1;
    envio.fecha = new Date().toISOString();
    envio.comprobante = comprobante;
    envio.destinatario = normTexto(o.destinatario || f.cliente.nombre);
    fila.escalon_actual = envio.escalon || fila.escalon_actual;
    guardar();
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
      tipo_evento: 'cobranza-enviada',
      resumen: `Recordatorio ${envio.escalon} enviado por WhatsApp (registro manual del dueño) por la factura ${f.numero}`,
      payload: { factura_id: f.id, tarjeta_id: envio.tarjeta_id, escalon: envio.escalon, canal: envio.canal },
      comprobante_externo: comprobante,
    });
    return { cobranza: getCobranza(db, userId, fila.id), envio };
  }

  // Canal email: el canal de email existente de la app (inyectado).
  const destinatario = normTexto(o.destinatario || envio.destinatario || f.cliente.email);
  if (!destinatario) fail('No hay email del cliente para enviarle el recordatorio: se carga una vez y queda en el fundamento.');
  if (!_cfg.sendEmail) fail('El canal de email no está disponible en este servidor.');
  const text = envio.mensaje;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body style="font-family:system-ui,Arial,sans-serif;color:#29173F;margin:32px"><p>${esc(text).replace(/\n/g, '<br>')}</p></body></html>`;
  let r;
  envio.intentos = (envio.intentos || 0) + 1;
  try { r = await _cfg.sendEmail({ to: destinatario, subject: `Recordatorio de pago — Factura ${f.numero}`, html, text }); }
  catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) {
    const motivo = r && r.skipped ? 'el servidor no tiene el canal de email configurado' : 'el proveedor de email rechazó el envío';
    envio.estado = 'fallido';
    envio.motivo = motivo;
    guardar();
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
      tipo_evento: 'cobranza-envio-fallido',
      resumen: `El recordatorio de la factura ${f.numero} NO salió por email: ${motivo}. La cobranza sigue abierta.`,
      payload: { factura_id: f.id, tarjeta_id: envio.tarjeta_id, escalon: envio.escalon, canal: envio.canal, motivo },
    });
    fail(`El email no salió (${motivo}). La cobranza sigue abierta: nada quedó enviado a medias.`);
  }
  envio.estado = 'enviado';
  envio.fecha = new Date().toISOString();
  envio.comprobante = String(r.id || r.provider_id || 'email');
  envio.destinatario = destinatario;
  fila.escalon_actual = envio.escalon || fila.escalon_actual;
  guardar();
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
    tipo_evento: 'cobranza-enviada',
    resumen: `Recordatorio ${envio.escalon} enviado por email a ${destinatario} por la factura ${f.numero}`,
    payload: { factura_id: f.id, tarjeta_id: envio.tarjeta_id, escalon: envio.escalon, canal: envio.canal, destinatario },
    comprobante_externo: envio.comprobante,
  });
  return { cobranza: getCobranza(db, userId, fila.id), envio };
}

// ---------------------------------------------------------------------------
// Respuestas del cliente y promesas de pago
// ---------------------------------------------------------------------------

function registrarRespuesta(db, userId, cobranzaId, respuesta) {
  ensureSchema(db);
  const r = respuesta || {};
  const fila = filaCobranza(db, userId, cobranzaId);
  if (fila.estado !== 'abierta') fail('Esta cobranza ya está cerrada: la respuesta queda en el historial de la factura.');
  const texto = normTexto(r.texto);
  if (!texto) fail('La respuesta del cliente se registra con su texto: sin texto no hay registro.');
  const registro = {
    texto, canal: normTexto(r.canal || ''), fecha: normTexto(r.fecha) || hoyISO(),
    registrada_en: new Date().toISOString(),
  };
  const respuestas = safeJson(fila.respuestas, []);
  respuestas.push(registro);
  let promesa = fila.promesa_fecha || '';
  if (r.promesa_fecha !== undefined && r.promesa_fecha !== null && r.promesa_fecha !== '') {
    if (!esFechaISO(r.promesa_fecha)) fail('La fecha de la promesa de pago tiene que ser una fecha válida (AAAA-MM-DD).');
    promesa = String(r.promesa_fecha);
  }
  db.prepare(`UPDATE gesty_cobranzas SET respuestas = ?, promesa_fecha = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(respuestas), promesa, fila.id);
  const fResp = facturacion.getFactura(db, userId, fila.factura_id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
    tipo_evento: 'cobranza-respuesta',
    resumen: `Respuesta del cliente por la factura ${fResp ? fResp.numero : fila.factura_id}: «${texto.slice(0, 140)}»`,
    payload: { factura_id: fila.factura_id, canal: registro.canal },
  });
  if (promesa && promesa !== fila.promesa_fecha) {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
      tipo_evento: 'cobranza-promesa',
      resumen: `Promesa de pago registrada: el cliente prometió pagar el ${fmtFecha(promesa)}`,
      payload: { factura_id: fila.factura_id, promesa_fecha: promesa },
    });
  }
  return getCobranza(db, userId, fila.id);
}

// ---------------------------------------------------------------------------
// Pagos: entran por el registro de pagos de G-04; la cobranza se
// refleja sola. Parcial → sigue por el saldo (y la tarjeta que
// espera se regenera con el número nuevo). Total → se cierra.
// ---------------------------------------------------------------------------

function despuesDelPago(db, userId, fila, pagoRegistro) {
  const f = facturacion.getFactura(db, userId, fila.factura_id);
  if (!f) return getCobranza(db, userId, fila.id);
  if (f.estado === 'cobrada' || f.saldo <= 0) {
    const fresca = db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ?').get(fila.id);
    if (fresca.estado === 'abierta') cerrarCobranza(db, userId, fresca, 'pago-registrado', { monto_pago: pagoRegistro.monto });
  } else {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
      tipo_evento: 'cobranza-pago-parcial',
      resumen: `Pago parcial registrado en la factura ${f.numero}: la cobranza sigue abierta por el saldo (${f.moneda} ${fmtMonto(f.saldo)})`,
      payload: { factura_id: f.id, monto_pago: pagoRegistro.monto, saldo: f.saldo },
    });
    // La tarjeta que espera traía el saldo viejo: se regenera con
    // el número nuevo (el documento cambió debajo del borrador).
    const fresca = db.prepare('SELECT * FROM gesty_cobranzas WHERE id = ?').get(fila.id);
    if (tarjetaVigenteDe(db, userId, fresca)) {
      const card = gesty.getCard(db, userId, fresca.tarjeta_id);
      if (card && Number(card.detalle.saldo) !== f.saldo) {
        const politica = getPolitica(db, userId);
        const vto = f.vencimiento || f.fecha;
        const escalon = politica.escalones.find((e) => e.clave === fresca.tarjeta_escalon)
          || escalonAplicable(politica, diffDias(vto, hoyISO()) || 0)
          || politica.escalones[0];
        regenerarTarjetaEscalon(db, userId, fresca, f, escalon, politica, diffDias(vto, hoyISO()) || 0);
      }
    }
  }
  return getCobranza(db, userId, fila.id);
}

function registrarPago(db, userId, cobranzaId, pago) {
  ensureSchema(db);
  const fila = filaCobranza(db, userId, cobranzaId);
  if (fila.estado !== 'abierta') fail('Esta cobranza ya está cerrada.');
  const r = facturacion.registrarCobro(db, userId, fila.factura_id, pago || {});
  return { cobranza: despuesDelPago(db, userId, fila, r.pago), pago: r.pago, factura: r.factura };
}

// El pago que entra como PAPEL (G-03): el cliente manda su
// comprobante de pago, queda vinculado a la cobranza y salda (o
// abona) la factura por el registro de pagos de G-04. El monto
// sale del papel: si el papel no lo trae legible, se pide — no se
// inventa.
function vincularComprobantePago(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const comp = comprobantes.getComprobante(db, userId, Number(d.comprobante_id));
  if (!comp) fail('Ese comprobante no es de esta cuenta.');
  let fila = null;
  if (d.cobranza_id) fila = filaCobranza(db, userId, d.cobranza_id);
  else if (d.factura_id) fila = cobranzaActivaDeFactura(db, userId, d.factura_id);
  if (!fila) fail('No hay una cobranza abierta para vincular este comprobante.');
  if (fila.estado !== 'abierta') fail('Esta cobranza ya está cerrada.');
  const monto = d.monto === undefined || d.monto === null ? comp.monto_total : Number(d.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    fail('El comprobante no trae un monto legible: indicá el monto del pago para vincularlo (no se inventa).');
  }
  const r = facturacion.registrarCobro(db, userId, fila.factura_id, {
    monto, medio: normTexto(d.medio || ''), fecha: normTexto(d.fecha) || comp.fecha || hoyISO(),
    comprobante: `comprobante:${comp.id}`,
  });
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cobranza', entidad_id: String(fila.id),
    tipo_evento: 'cobranza-pago-vinculado',
    resumen: `Pago vinculado desde el comprobante #${comp.id} (${comp.tipo || 'comprobante'} de ${comp.emisor.nombre || 'el cliente'}): ${fmtMonto(monto)} a la factura ${r.factura.numero}`,
    payload: { factura_id: fila.factura_id, comprobante_id: comp.id, monto },
    comprobante_externo: `comprobante:${comp.id}`,
  });
  return { cobranza: despuesDelPago(db, userId, fila, r.pago), pago: r.pago, factura: r.factura, comprobante: comp };
}

// ---------------------------------------------------------------------------
// Consulta: por factura / cliente / escalón — la base de la
// pantalla de Cobranzas y del cierre del día (G-21)
// ---------------------------------------------------------------------------

function listCobranzas(db, userId, opts) {
  ensureSchema(db);
  sincronizarCierres(db, userId);
  const o = opts || {};
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  const rows = db.prepare('SELECT * FROM gesty_cobranzas WHERE user_id = ? ORDER BY id DESC').all(userId);
  let out = rows.map((r) => parseCobranzaRow(db, userId, r, o.hoy));
  if (o.estado) out = out.filter((c) => c.estado === String(o.estado));
  if (o.factura_id) out = out.filter((c) => c.factura_id === Number(o.factura_id));
  if (o.cliente_cuit) out = out.filter((c) => c.factura && soloDigitos(c.factura.cliente.cuit) === soloDigitos(o.cliente_cuit));
  if (o.cliente) {
    const q = normTexto(o.cliente).toLowerCase();
    out = out.filter((c) => c.factura && (c.factura.cliente.nombre || '').toLowerCase().includes(q));
  }
  if (o.escalon) out = out.filter((c) => c.escalon === String(o.escalon));
  const total = out.length;
  return { cobranzas: out.slice(off, off + lim), total };
}

function resumenCobranzas(db, userId) {
  ensureSchema(db);
  sincronizarCierres(db, userId);
  const rows = db.prepare('SELECT * FROM gesty_cobranzas WHERE user_id = ?').all(userId);
  const politica = getPolitica(db, userId);
  const resumen = {
    abiertas: 0, cerradas: 0, por_escalon: {}, monto_vencido: 0,
    con_tarjeta_pendiente: 0, con_promesa: 0, envios_pendientes: 0,
  };
  for (const e of politica.escalones) resumen.por_escalon[e.clave] = 0;
  const hoy = hoyISO();
  for (const r of rows) {
    const c = parseCobranzaRow(db, userId, r, hoy);
    if (c.estado === 'cerrada') { resumen.cerradas++; continue; }
    resumen.abiertas++;
    if (c.escalon && resumen.por_escalon[c.escalon] !== undefined) resumen.por_escalon[c.escalon]++;
    if (c.factura) resumen.monto_vencido = round2(resumen.monto_vencido + (c.factura.saldo || 0));
    if (c.tarjeta_vigente) resumen.con_tarjeta_pendiente++;
    if (c.promesa_fecha && c.promesa_fecha >= hoy) resumen.con_promesa++;
    if (c.envios.some((e) => e.estado === 'aprobado' || e.estado === 'fallido')) resumen.envios_pendientes++;
  }
  resumen.monto_vencido = round2(resumen.monto_vencido);
  return resumen;
}

module.exports = {
  // constantes
  CANALES_COBRANZA, ESCALONES_DEFAULT,
  // configuración / inyección
  configure,
  // esquema
  ensureSchema,
  // política del fundamento
  getPolitica, setPolitica,
  // motor
  escanearVencimientos, sincronizarCierres,
  // ejecutor de la matriz
  ejecutarCobranza,
  // despacho (única vía de envío)
  enviarCobranza,
  // respuestas y pagos
  registrarRespuesta, registrarPago, vincularComprobantePago,
  // consulta
  getCobranza, listCobranzas, resumenCobranzas,
  // piezas internas, exportadas para tests y reuso
  armarMensaje, escalonAplicable, validarEscalones,
};
