// =====================================================================
// GESTY · G-08 — PRESUPUESTOS
// Spec: gesty-cola-builds.md G-08 · gesty-areas-detalle.md §1 ·
// gesty-sistema-operativo.md §2.1 y §5 (matriz: enviar un
// presupuesto = SIEMPRE con OK del dueño) · gesty-build-spec.md §3
// (entidad Presupuesto) y §12.3 (la seña se pregunta en el primer
// presupuesto y vive en el fundamento).
//
// El presupuesto es el DOCUMENTO administrativo y su envío. El dueño
// (o su equipo) carga el pedido — el texto del cliente o su dictado,
// con los ítems — y Gesty arma el borrador: cada precio sale del
// fundamento (la lista de precios) o del último presupuesto similar
// (al mismo cliente primero, al mismo concepto después), y CADA
// precio guardado cita su fuente. Lo que falta para cotizar no se
// inventa ni se pregunta dos veces: queda como UNA pregunta (la del
// fundamento si un precio nuevo se aprende, la del cliente si no
// hay a quién cotizarle), y la respuesta queda guardada para
// siempre — un precio respondido entra a la lista de precios con
// origen `pregunta-unica`. Totales SIEMPRE calculados en el
// servidor: los que mande el cliente se ignoran (criterio G-04).
//
// Flujo: borrador → esperando-ok → enviado → aceptado / vencido /
// rechazado. Enviar SOLO ocurre tras el OK: la tarjeta
// `presupuesto` de la matriz congela el documento completo, su
// ejecutor SELLA el envío aprobado y el despacho (enviarPresu-
// puesto) es la única función del servidor que registra un envío
// — exige el sello. Sin tarjeta aprobada no sale nada, y cada
// `presupuesto-enviado` del registro tiene su
// `presupuesto-envio-aprobado` antes en el log (lectura G-05).
//
// Seguimiento administrativo: al cumplirse la regla del fundamento
// (días sin respuesta) o al vencer la validez sin respuesta, Gesty
// PREPARA el recordatorio como tarjeta nueva de la misma matriz —
// un aviso sereno de que el presupuesto venció o sigue sin
// respuesta. NO lo envía sola y NO argumenta la venta:
// FRONTERA DE LA CASA — el seguimiento comercial y la conversación
// de venta son de Venty; el recordatorio de Gesty avisa un hecho
// administrativo (venció / no hubo respuesta), nada más.
//
// Aceptado → alimenta G-04: crearFacturaDesdePresupuesto usa el
// acople por `origen_ref` que gesty-facturacion ya soporta
// (crearDesdePresupuesto), sin modificar G-04.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const facturacion = require('./gesty-facturacion');

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ESTADOS = ['borrador', 'esperando-ok', 'enviado', 'aceptado', 'vencido', 'rechazado'];
const CANALES_ENVIO = ['email', 'whatsapp-manual'];
const GRUPO_POLITICA = 'reglas-cobro';
// Validez por default si el fundamento no define la habitual: la del
// ejemplo de la casa (áreas §1: «validez 10 días»). Es un default
// declarado, no un dato del negocio: la política del fundamento lo
// reemplaza en cuanto el dueño la define.
const VALIDEZ_DEFAULT_DIAS = 10;

// El aviso del recordatorio: sereno y administrativo (frontera
// Venty). Sin urgencia fabricada, sin descuentos, sin argumentos.
function plantillaRecordatorio(vencido) {
  return vencido
    ? 'Hola {cliente}, te escribo de {negocio}. El presupuesto {numero} por {moneda} {total} venció el {vencimiento} y quedó sin respuesta registrada. Si todavía lo necesitás, avisanos y lo vemos de nuevo. ¡Gracias!'
    : 'Hola {cliente}, te escribo de {negocio}. Te recordamos que el presupuesto {numero} por {moneda} {total} sigue vigente hasta el {vencimiento}. Quedamos atentos a tu respuesta. ¡Gracias!';
}

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
function soloDigitos(v) { return String(v || '').replace(/\D/g, ''); }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function normDesc(v) { return normTexto(v).toLowerCase().replace(/\s+/g, ' '); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&gt;').replace(/>/g, '&gt;')
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
function addDias(iso, dias) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.trunc(Number(dias) || 0));
  return d.toISOString().slice(0, 10);
}
function safeJson(s, def) { try { return JSON.parse(s); } catch (e) { return def; } }

// ---------------------------------------------------------------------------
// Configuración e inyección (patrón de la casa: el canal se inyecta)
// ---------------------------------------------------------------------------

const _cfg = { sendEmail: null };

function configure(opts) {
  const o = opts || {};
  if (o.sendEmail !== undefined) _cfg.sendEmail = typeof o.sendEmail === 'function' ? o.sendEmail : null;
}

// ---------------------------------------------------------------------------
// Esquema (aditivo, idempotente)
// ---------------------------------------------------------------------------

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  facturacion.ensureSchema(db);
  db.exec(`
  CREATE TABLE IF NOT EXISTS gesty_presupuestos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    numero_interno INTEGER NOT NULL,
    cliente_campo TEXT NOT NULL DEFAULT '',
    cliente_nombre TEXT NOT NULL DEFAULT '',
    cliente_cuit TEXT NOT NULL DEFAULT '',
    cliente_condicion_iva TEXT NOT NULL DEFAULT '',
    cliente_email TEXT NOT NULL DEFAULT '',
    pedido_texto TEXT NOT NULL DEFAULT '',
    concepto TEXT NOT NULL DEFAULT '',
    fecha TEXT NOT NULL DEFAULT '',
    moneda TEXT NOT NULL DEFAULT 'ARS',
    canal TEXT NOT NULL DEFAULT 'email',
    items TEXT NOT NULL DEFAULT '[]',
    impuestos TEXT NOT NULL DEFAULT '[]',
    otros_impuestos TEXT NOT NULL DEFAULT '[]',
    subtotal_neto REAL,
    total_impuestos REAL,
    total REAL,
    validez_dias INTEGER NOT NULL DEFAULT 10,
    sena_porcentaje REAL,
    sena_contra TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'borrador',
    pregunta TEXT NOT NULL DEFAULT '',
    respuestas TEXT NOT NULL DEFAULT '[]',
    envios TEXT NOT NULL DEFAULT '[]',
    recordatorios TEXT NOT NULL DEFAULT '[]',
    fecha_envio TEXT NOT NULL DEFAULT '',
    vigencia_desde TEXT NOT NULL DEFAULT '',
    vigencia_hasta TEXT NOT NULL DEFAULT '',
    recordatorio_en TEXT NOT NULL DEFAULT '',
    tarjeta_id INTEGER,
    recordatorio_tarjeta_id INTEGER,
    factura_id INTEGER,
    fundamento_version INTEGER NOT NULL DEFAULT 0,
    creado_por TEXT NOT NULL DEFAULT 'gesty',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gesty_pres_user ON gesty_presupuestos(user_id, id);
  CREATE INDEX IF NOT EXISTS idx_gesty_pres_estado ON gesty_presupuestos(user_id, estado, vigencia_hasta);
  CREATE TABLE IF NOT EXISTS gesty_presupuestos_meta (
    user_id INTEGER PRIMARY KEY,
    proximo_numero INTEGER NOT NULL DEFAULT 1
  );
  `);
  _esquemas.add(db);
}

function proximoNumero(db, userId) {
  db.prepare(`INSERT INTO gesty_presupuestos_meta (user_id, proximo_numero) VALUES (?, 2)
    ON CONFLICT(user_id) DO UPDATE SET proximo_numero = proximo_numero + 1`).run(userId);
  const r = db.prepare('SELECT proximo_numero FROM gesty_presupuestos_meta WHERE user_id = ?').get(userId);
  return Number(r.proximo_numero) - 1;
}
function numeroFormateado(n) { return `P-${String(n).padStart(4, '0')}`; }

// ---------------------------------------------------------------------------
// La política de presupuestos: vive en el fundamento (grupo
// `reglas-cobro`, spec G-02 §3.3 — ahí viven la política de seña y
// las reglas comerciales). Leer nunca inventa: devuelve los
// valores vigentes, su origen y los ids usados (usa_datos).
// ---------------------------------------------------------------------------

function sanitizarListaPrecios(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    const o = e || {};
    const descripcion = normTexto(o.descripcion);
    const precio = Number(o.precio_unitario);
    if (!descripcion || !Number.isFinite(precio) || precio < 0) continue;
    const alicuota = o.alicuota_iva === undefined || o.alicuota_iva === null ? 21 : Number(o.alicuota_iva);
    out.push({
      descripcion, precio_unitario: round2(precio),
      alicuota_iva: Number.isFinite(alicuota) && alicuota >= 0 && alicuota < 100 ? alicuota : 21,
    });
  }
  return out;
}

function getPolitica(db, userId) {
  ensureSchema(db);
  const datos = gesty.getData(db, userId, { grupo: GRUPO_POLITICA });
  const porCampo = {};
  for (const d of datos) porCampo[d.campo] = d;

  let validez = VALIDEZ_DEFAULT_DIAS;
  let origenValidez = 'default';
  const dv = porCampo.presupuesto_validez_dias;
  if (dv && Number.isFinite(Number(dv.valor)) && Number(dv.valor) >= 1) {
    validez = Math.trunc(Number(dv.valor)); origenValidez = 'fundamento';
  }

  let sena = null;
  const ds = porCampo.politica_sena;
  if (ds && ds.valor && typeof ds.valor === 'object') {
    const pct = Number(ds.valor.porcentaje);
    if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
      sena = { porcentaje: pct, contra: normTexto(ds.valor.contra || '') };
    }
  }

  let seguimiento = null;
  const dg = porCampo.presupuesto_seguimiento_dias;
  if (dg && Number.isFinite(Number(dg.valor)) && Number(dg.valor) >= 0) {
    seguimiento = Math.trunc(Number(dg.valor));
  }

  const canalDato = porCampo.presupuesto_canal;
  const canal = canalDato && CANALES_ENVIO.includes(String(canalDato.valor)) ? String(canalDato.valor) : 'email';

  const lista = porCampo.lista_precios ? sanitizarListaPrecios(porCampo.lista_precios.valor) : [];

  const usaDatos = ['presupuesto_validez_dias', 'politica_sena', 'presupuesto_seguimiento_dias', 'presupuesto_canal', 'lista_precios']
    .map((c) => (porCampo[c] ? porCampo[c].id : null)).filter((x) => x !== null);
  const rs = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
  if (rs) usaDatos.push(rs.id);

  return {
    validez_dias: validez, origen_validez: origenValidez,
    sena, seguimiento_dias: seguimiento, canal,
    lista_precios: lista, usa_datos: usaDatos,
  };
}

// El dueño define SU política (queda en el fundamento con su
// procedencia, y el cambio en el registro durable del área).
function setPolitica(db, userId, cambios, opts) {
  ensureSchema(db);
  const c = cambios || {};
  const o = opts || {};
  const origenRef = normTexto(o.origen_ref || 'vista-presupuestos');
  const poner = (campo, valor) => gesty.setData(db, userId, {
    grupo: GRUPO_POLITICA, campo, valor,
    origen: 'dueno', origen_ref: origenRef, cargado_por: 'dueno', confirmado: true,
  });
  if (c.validez_dias !== undefined) {
    const v = Number(c.validez_dias);
    if (!Number.isFinite(v) || v < 1 || v > 365) fail('La validez habitual tiene que ser un número de días entre 1 y 365.');
    poner('presupuesto_validez_dias', Math.trunc(v));
  }
  if (c.sena !== undefined) {
    if (c.sena === null) {
      poner('politica_sena', null);
    } else {
      const pct = Number((c.sena || {}).porcentaje);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) fail('La seña necesita su porcentaje (mayor a 0 y hasta 100). Sin política de seña, el presupuesto no la menciona.');
      poner('politica_sena', { porcentaje: pct, contra: normTexto((c.sena || {}).contra || '') });
    }
  }
  if (c.seguimiento_dias !== undefined) {
    if (c.seguimiento_dias === null) poner('presupuesto_seguimiento_dias', null);
    else {
      const v = Number(c.seguimiento_dias);
      if (!Number.isFinite(v) || v < 0 || v > 365) fail('Los días de seguimiento tienen que ser un número entre 0 y 365.');
      poner('presupuesto_seguimiento_dias', Math.trunc(v));
    }
  }
  if (c.canal !== undefined) {
    const canal = normTexto(c.canal).toLowerCase();
    if (!CANALES_ENVIO.includes(canal)) fail(`Canal de presupuestos inválido: ${canal}. Canales: ${CANALES_ENVIO.join(', ')}.`);
    poner('presupuesto_canal', canal);
  }
  if (c.lista_precios !== undefined) {
    poner('lista_precios', sanitizarListaPrecios(c.lista_precios));
  }
  const vigente = getPolitica(db, userId);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'presupuesto', entidad_id: 'politica',
    tipo_evento: 'presupuesto-politica-actualizada',
    resumen: `Política de presupuestos actualizada: validez ${vigente.validez_dias} días · canal ${vigente.canal}` +
      (vigente.sena ? ` · seña ${vigente.sena.porcentaje}%` : ' · sin seña') +
      (vigente.seguimiento_dias !== null ? ` · recordatorio a los ${vigente.seguimiento_dias} días sin respuesta` : ' · recordatorio al vencer'),
    payload: { validez_dias: vigente.validez_dias, canal: vigente.canal, sena: !!vigente.sena, seguimiento_dias: vigente.seguimiento_dias, precios_en_lista: vigente.lista_precios.length },
  });
  return vigente;
}

// ---------------------------------------------------------------------------
// Cliente: sale del fundamento (§3.3) o del alta del momento — con
// snapshot en el presupuesto (mismo criterio que G-04). A
// diferencia de la factura, el presupuesto TOLERA nacer sin
// cliente: es intake asistido y el hueco queda como la pregunta.
// ---------------------------------------------------------------------------

function buscarClienteDato(db, userId, ref) {
  const clientes = gesty.getData(db, userId, { grupo: 'clientes-facturacion' });
  if (ref.campo) return clientes.find((d) => d.campo === String(ref.campo)) || null;
  if (ref.cuit) {
    const cuit = soloDigitos(ref.cuit);
    return clientes.find((d) => d.valor && soloDigitos(d.valor.cuit || '') === cuit && cuit) || null;
  }
  return null;
}

// Devuelve { snap, dato } — snap null SOLO cuando no vino ningún
// dato de cliente (ni nombre, ni CUIT, ni campo). Un campo/CUIT
// que no resuelve en el fundamento es error, como en G-04.
function resolverClienteSuave(db, userId, clienteIn) {
  const c = clienteIn || {};
  let dato = null;
  if (c.campo || c.cuit) {
    dato = buscarClienteDato(db, userId, c);
    if (c.campo && !dato) fail(`El cliente «${c.campo}» no está en el fundamento.`);
  }
  const v = dato && dato.valor && typeof dato.valor === 'object' ? dato.valor : {};
  const snap = {
    campo: dato ? dato.campo : normTexto(c.campo),
    dato_id: dato ? dato.id : null,
    nombre: normTexto(c.nombre || v.nombre || v.razon_social),
    cuit: soloDigitos(c.cuit || v.cuit || ''),
    condicion_iva: normTexto(c.condicion_iva || v.condicion_iva || v.condicion || ''),
    email: normTexto(c.email || v.email || ''),
  };
  if (!snap.nombre && !snap.cuit) return { snap: null, dato: null };
  return { snap, dato };
}

// ---------------------------------------------------------------------------
// Precios con fuente citada — el corazón del intake
// ---------------------------------------------------------------------------

function precioDeLista(politica, descripcion) {
  const nd = normDesc(descripcion);
  const lista = politica.lista_precios || [];
  return lista.find((e) => normDesc(e.descripcion) === nd)
    || lista.find((e) => { const ne = normDesc(e.descripcion); return ne && (ne.includes(nd) || nd.includes(ne)); })
    || null;
}

// El último presupuesto YA COTIZADO (enviado/aceptado/vencido) con
// el mismo concepto; el del mismo cliente manda sobre el de otro.
function precioUltimoSimilar(db, userId, descripcion, cliente) {
  const nd = normDesc(descripcion);
  if (!nd) return null;
  const rows = db.prepare(`SELECT * FROM gesty_presupuestos WHERE user_id = ? AND estado IN ('enviado','aceptado','vencido') ORDER BY id DESC`)
    .all(userId);
  let mejor = null;
  for (const r of rows) {
    for (const it of safeJson(r.items, [])) {
      if (!it || normDesc(it.descripcion) !== nd) continue;
      if (it.precio_unitario === null || it.precio_unitario === undefined) continue;
      const mismoCliente = Boolean(cliente && (
        (cliente.cuit && r.cliente_cuit && soloDigitos(cliente.cuit) === soloDigitos(r.cliente_cuit)) ||
        (cliente.campo && r.cliente_campo && cliente.campo === r.cliente_campo)));
      const candidato = {
        precio_unitario: Number(it.precio_unitario),
        alicuota_iva: it.alicuota_iva === undefined ? 21 : Number(it.alicuota_iva),
        presupuesto_id: r.id, numero: numeroFormateado(r.numero_interno),
        fecha: r.fecha_envio || r.fecha || '', mismo_cliente: mismoCliente,
      };
      if (mismoCliente) return candidato; // el más reciente del mismo cliente: manda
      if (!mejor) mejor = candidato;
    }
  }
  return mejor;
}

function resolverItems(db, userId, politica, itemsIn, cliente) {
  const items = [];
  const faltantes = [];
  for (const it of itemsIn || []) {
    const descripcion = normTexto(it && it.descripcion);
    if (!descripcion) fail('Cada ítem del presupuesto necesita su descripción (qué se cotiza).');
    const cantidad = Number(it.cantidad === undefined ? 1 : it.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) fail(`Cantidad inválida en «${descripcion}».`);
    let precio = null;
    let fuente = null;
    let alicuota = null;
    if (it.precio_unitario !== undefined && it.precio_unitario !== null && it.precio_unitario !== '') {
      precio = Number(it.precio_unitario);
      if (!Number.isFinite(precio) || precio < 0) fail(`Precio inválido en «${descripcion}».`);
      fuente = { tipo: 'pedido', texto: 'lo cargó el dueño en el pedido' };
    } else {
      const deLista = precioDeLista(politica, descripcion);
      if (deLista) {
        precio = deLista.precio_unitario;
        alicuota = deLista.alicuota_iva;
        fuente = { tipo: 'lista-precios', texto: 'sale de tu lista de precios del fundamento' };
      } else {
        const similar = precioUltimoSimilar(db, userId, descripcion, cliente);
        if (similar) {
          precio = similar.precio_unitario;
          alicuota = similar.alicuota_iva;
          fuente = {
            tipo: 'ultimo-presupuesto', presupuesto_id: similar.presupuesto_id, numero: similar.numero,
            fecha: similar.fecha, mismo_cliente: similar.mismo_cliente,
            texto: `es el precio del presupuesto ${similar.numero}${similar.fecha ? ` del ${fmtFecha(similar.fecha)}` : ''}${similar.mismo_cliente ? ' al mismo cliente' : ''}`,
          };
        }
      }
    }
    if (alicuota === null) {
      alicuota = it.alicuota_iva === undefined || it.alicuota_iva === null ? 21 : Number(it.alicuota_iva);
    }
    if (!Number.isFinite(alicuota) || alicuota < 0 || alicuota >= 100) fail(`Alícuota de IVA inválida en «${descripcion}».`);
    if (precio === null) {
      faltantes.push(descripcion);
      items.push({ descripcion, cantidad, precio_unitario: null, alicuota_iva: alicuota, fuente: null, subtotal: null, iva: null });
    } else {
      const subtotal = round2(cantidad * precio);
      items.push({
        descripcion, cantidad, precio_unitario: round2(precio), alicuota_iva: alicuota, fuente,
        subtotal, iva: round2(subtotal * alicuota / 100),
      });
    }
  }
  if (!items.length) fail('El presupuesto necesita al menos un ítem: el pedido se carga con lo que se cotiza.');
  return { items, faltantes };
}

// Totales — SIEMPRE en el servidor (mismo criterio que G-04). Si
// falta un precio, NO hay total: el presupuesto no se disfraza de
// cotizado (regla de verdad) y el hueco es la pregunta.
function calcularTotales(items, otrosIn) {
  if (items.some((it) => it.precio_unitario === null)) {
    return { completo: false, impuestos: [], otros_impuestos: [], subtotal_neto: null, total_impuestos: null, total: null };
  }
  const porAlicuota = new Map();
  let neto = 0;
  for (const it of items) {
    neto = round2(neto + it.subtotal);
    if (it.alicuota_iva > 0) {
      const prev = porAlicuota.get(it.alicuota_iva) || { concepto: `IVA ${it.alicuota_iva}%`, alicuota: it.alicuota_iva, base: 0, monto: 0 };
      prev.base = round2(prev.base + it.subtotal);
      prev.monto = round2(prev.monto + it.iva);
      porAlicuota.set(it.alicuota_iva, prev);
    }
  }
  const impuestos = [...porAlicuota.values()].sort((a, b) => b.alicuota - a.alicuota);
  const otros = [];
  let otrosTotal = 0;
  for (const oi of otrosIn || []) {
    const concepto = normTexto(oi && oi.concepto);
    const monto = Number(oi && oi.monto);
    if (!concepto || !Number.isFinite(monto) || monto < 0) fail('Impuesto adicional inválido (concepto y monto ≥ 0).');
    otros.push({ concepto, monto: round2(monto) });
    otrosTotal = round2(otrosTotal + monto);
  }
  const totalImpuestos = round2(impuestos.reduce((a, l) => a + l.monto, 0) + otrosTotal);
  return { completo: true, impuestos, otros_impuestos: otros, subtotal_neto: neto, total_impuestos: totalImpuestos, total: round2(neto + totalImpuestos) };
}

// ---------------------------------------------------------------------------
// LA pregunta — una sola, pegada al momento (patrón de la casa)
// ---------------------------------------------------------------------------

function preguntaDe(clienteSnap, items) {
  if (!clienteSnap) {
    return {
      campo: 'cliente',
      texto: '¿A quién le cotizo? Pasame el nombre (y el CUIT si lo tenés) y queda guardado para siempre.',
    };
  }
  const faltantes = items.filter((it) => it.precio_unitario === null).map((it) => it.descripcion);
  if (faltantes.length) {
    return {
      campo: 'precios',
      items: faltantes,
      texto: `¿A cuánto cotizo ${faltantes.map((d) => `«${d}»`).join(' y ')}? No está en tu lista de precios ni en presupuestos anteriores. La respuesta queda guardada en tu lista para siempre.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entidad presupuesto — lectura
// ---------------------------------------------------------------------------

function parsePresupuestoRow(r, hoy) {
  if (!r) return null;
  const items = safeJson(r.items, []);
  const pregunta = r.pregunta ? safeJson(r.pregunta, null) : null;
  const respuestas = safeJson(r.respuestas, []);
  const sena = r.sena_porcentaje !== null && r.sena_porcentaje !== undefined
    ? {
      porcentaje: Number(r.sena_porcentaje), contra: r.sena_contra || '',
      monto: r.total !== null && r.total !== undefined ? round2(Number(r.total) * Number(r.sena_porcentaje) / 100) : null,
    }
    : null;
  const hoyD = hoy || hoyISO();
  return {
    id: r.id, user_id: r.user_id,
    numero: numeroFormateado(r.numero_interno),
    cliente: {
      campo: r.cliente_campo || '', nombre: r.cliente_nombre || '', cuit: r.cliente_cuit || '',
      condicion_iva: r.cliente_condicion_iva || '', email: r.cliente_email || '',
    },
    pedido_texto: r.pedido_texto || '', concepto: r.concepto || '',
    fecha: r.fecha, moneda: r.moneda, canal: r.canal,
    items,
    impuestos: safeJson(r.impuestos, []), otros_impuestos: safeJson(r.otros_impuestos, []),
    subtotal_neto: r.subtotal_neto === null ? null : Number(r.subtotal_neto),
    total_impuestos: r.total_impuestos === null ? null : Number(r.total_impuestos),
    total: r.total === null ? null : Number(r.total),
    cotizado: r.total !== null,
    validez_dias: Number(r.validez_dias),
    sena,
    estado: r.estado,
    pregunta,
    respuestas,
    sin_respuesta: (r.estado === 'enviado' || r.estado === 'vencido') && respuestas.length === 0,
    envios: safeJson(r.envios, []),
    recordatorios: safeJson(r.recordatorios, []),
    fecha_envio: r.fecha_envio || '',
    vigencia: r.vigencia_desde || r.vigencia_hasta
      ? { desde: r.vigencia_desde || '', hasta: r.vigencia_hasta || '' } : null,
    recordatorio_en: r.recordatorio_en || '',
    dias_para_vencer: r.vigencia_hasta ? diffDias(hoyD, r.vigencia_hasta) : null,
    tarjeta_id: r.tarjeta_id || null,
    recordatorio_tarjeta_id: r.recordatorio_tarjeta_id || null,
    factura_id: r.factura_id || null,
    fundamento_version: r.fundamento_version,
    creado_por: r.creado_por,
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function getPresupuesto(db, userId, id, opts) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_presupuestos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parsePresupuestoRow(r, (opts || {}).hoy) : null;
}

function filaPresupuesto(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_presupuestos WHERE id = ?').get(Number(id));
  if (!r || r.user_id !== userId) fail('Ese presupuesto no es de esta cuenta.');
  return r;
}

// Recalcula totales + pregunta sobre la fila y la persiste. Lo usan
// la creación, la edición y la respuesta de la pregunta.
function recalcular(db, userId, fila) {
  const items = safeJson(fila.items, []);
  const calculo = calcularTotales(items, safeJson(fila.otros_impuestos, []));
  const clienteSnap = (fila.cliente_nombre || fila.cliente_cuit)
    ? { nombre: fila.cliente_nombre, cuit: fila.cliente_cuit } : null;
  const pregunta = preguntaDe(clienteSnap, items);
  db.prepare(`UPDATE gesty_presupuestos SET impuestos = ?, subtotal_neto = ?, total_impuestos = ?, total = ?,
    pregunta = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(calculo.impuestos), calculo.subtotal_neto, calculo.total_impuestos, calculo.total,
      pregunta ? JSON.stringify(pregunta) : '', fila.id);
  return { calculo, pregunta };
}

function registrarPregunta(db, userId, presupuesto, pregunta) {
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(presupuesto.id),
    tipo_evento: 'presupuesto-pregunta-hecha',
    resumen: `Para cotizar el presupuesto ${presupuesto.numero} falta un dato: ${pregunta.texto}`,
    payload: { numero: presupuesto.numero, campo: pregunta.campo, items: pregunta.items || [] },
  });
}

// ---------------------------------------------------------------------------
// Intake manual asistido — el pedido entra, el borrador nace
// ---------------------------------------------------------------------------

function crearBorrador(db, userId, input) {
  ensureSchema(db);
  const b = input || {};
  const politica = getPolitica(db, userId);
  const { snap } = resolverClienteSuave(db, userId, b.cliente);
  const { items } = resolverItems(db, userId, politica, b.items, snap);
  const calculo = calcularTotales(items, b.otros_impuestos);
  const fecha = normTexto(b.fecha) || hoyISO();
  if (!esFechaISO(fecha)) fail('Fecha del presupuesto inválida (AAAA-MM-DD).');
  let validez = politica.validez_dias;
  if (b.validez_dias !== undefined && b.validez_dias !== null) {
    validez = Number(b.validez_dias);
    if (!Number.isFinite(validez) || validez < 1 || validez > 365) fail('La validez tiene que ser un número de días entre 1 y 365.');
    validez = Math.trunc(validez);
  }
  const canal = normTexto(b.canal || politica.canal).toLowerCase();
  if (!CANALES_ENVIO.includes(canal)) fail(`Canal de envío inválido: ${canal}.`);
  const pregunta = preguntaDe(snap, items);
  const numero = proximoNumero(db, userId);
  const info = db.prepare(`INSERT INTO gesty_presupuestos (user_id, numero_interno,
    cliente_campo, cliente_nombre, cliente_cuit, cliente_condicion_iva, cliente_email,
    pedido_texto, concepto, fecha, moneda, canal, items, impuestos, otros_impuestos,
    subtotal_neto, total_impuestos, total, validez_dias, sena_porcentaje, sena_contra,
    estado, pregunta, fundamento_version, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'borrador', ?,?,?)`)
    .run(userId, numero,
      snap ? snap.campo : '', snap ? snap.nombre : '', snap ? snap.cuit : '',
      snap ? snap.condicion_iva : '', snap ? snap.email : '',
      normTexto(b.pedido_texto), normTexto(b.concepto), fecha,
      normTexto(b.moneda || 'ARS').toUpperCase() || 'ARS', canal,
      JSON.stringify(items), JSON.stringify(calculo.impuestos), JSON.stringify(calculo.otros_impuestos),
      calculo.subtotal_neto, calculo.total_impuestos, calculo.total, validez,
      politica.sena ? politica.sena.porcentaje : null, politica.sena ? politica.sena.contra : '',
      pregunta ? JSON.stringify(pregunta) : '',
      gesty.foundationVersion(db, userId), normTexto(b.creado_por || 'gesty') || 'gesty');
  const id = Number(info.lastInsertRowid);
  const p = getPresupuesto(db, userId, id);
  gesty.recordEvent(db, userId, {
    actor: p.creado_por === 'dueno' ? 'dueno' : 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(id),
    tipo_evento: 'presupuesto-creado',
    resumen: `Borrador ${p.numero}${snap ? ` para ${snap.nombre || snap.cuit}` : ' (sin cliente todavía)'}` +
      (calculo.completo ? ` · ${p.moneda} ${fmtMonto(calculo.total)}` : ' · falta un dato para cotizar'),
    payload: {
      numero: p.numero, total: calculo.total, moneda: p.moneda, completo: calculo.completo,
      fuentes: items.map((it) => ({ descripcion: it.descripcion, fuente: it.fuente ? it.fuente.tipo : null })),
    },
  });
  if (pregunta) registrarPregunta(db, userId, p, pregunta);
  return p;
}

// Editar SOLO en borrador: se re-resuelven precios y totales en el
// servidor y el hueco se re-evalúa. Fuera de borrador, el
// documento se corrige por la bandeja (editar la tarjeta, R7).
function editarBorrador(db, userId, presupuestoId, cambios) {
  ensureSchema(db);
  const p = getPresupuesto(db, userId, presupuestoId);
  if (!p) fail('Ese presupuesto no es de esta cuenta.');
  if (p.estado !== 'borrador') fail(`Solo se edita un borrador (este presupuesto está «${p.estado}»).`);
  const c = cambios || {};
  const politica = getPolitica(db, userId);
  const clienteRes = c.cliente !== undefined ? resolverClienteSuave(db, userId, c.cliente) : { snap: p.cliente };
  const snap = clienteRes.snap || p.cliente;
  const { items } = resolverItems(db, userId, politica,
    c.items !== undefined ? c.items : p.items.map((it) => ({
      descripcion: it.descripcion, cantidad: it.cantidad,
      precio_unitario: it.precio_unitario === null ? undefined : it.precio_unitario,
      alicuota_iva: it.alicuota_iva,
    })), snap);
  const otros = c.otros_impuestos !== undefined ? c.otros_impuestos : p.otros_impuestos;
  const calculo = calcularTotales(items, otros);
  let validez = p.validez_dias;
  if (c.validez_dias !== undefined && c.validez_dias !== null) {
    validez = Number(c.validez_dias);
    if (!Number.isFinite(validez) || validez < 1 || validez > 365) fail('La validez tiene que ser un número de días entre 1 y 365.');
    validez = Math.trunc(validez);
  }
  const canal = normTexto(c.canal || p.canal).toLowerCase();
  if (!CANALES_ENVIO.includes(canal)) fail(`Canal de envío inválido: ${canal}.`);
  const pregunta = preguntaDe(snap && (snap.nombre || snap.cuit) ? snap : null, items);
  db.prepare(`UPDATE gesty_presupuestos SET cliente_campo = ?, cliente_nombre = ?, cliente_cuit = ?,
    cliente_condicion_iva = ?, cliente_email = ?, pedido_texto = ?, concepto = ?, fecha = ?, moneda = ?,
    canal = ?, items = ?, impuestos = ?, otros_impuestos = ?, subtotal_neto = ?, total_impuestos = ?,
    total = ?, validez_dias = ?, pregunta = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(snap ? snap.campo : '', snap ? snap.nombre : '', snap ? snap.cuit : '',
      snap ? snap.condicion_iva : '', snap ? snap.email : '',
      normTexto(c.pedido_texto !== undefined ? c.pedido_texto : p.pedido_texto),
      normTexto(c.concepto !== undefined ? c.concepto : p.concepto),
      normTexto(c.fecha || p.fecha), normTexto(c.moneda || p.moneda).toUpperCase() || 'ARS',
      canal, JSON.stringify(items), JSON.stringify(calculo.impuestos), JSON.stringify(calculo.otros_impuestos),
      calculo.subtotal_neto, calculo.total_impuestos, calculo.total, validez,
      pregunta ? JSON.stringify(pregunta) : '', p.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'presupuesto', entidad_id: String(p.id),
    tipo_evento: 'presupuesto-editado', resumen: `Borrador ${p.numero} editado${calculo.completo ? ` · ${p.moneda} ${fmtMonto(calculo.total)}` : ' · sigue faltando un dato'}`,
    payload: { numero: p.numero, total_anterior: p.total, total_nuevo: calculo.total },
  });
  const actualizado = getPresupuesto(db, userId, p.id);
  if (pregunta) registrarPregunta(db, userId, actualizado, pregunta);
  return actualizado;
}

// La respuesta del dueño a LA pregunta. Lo respondido queda
// guardado para siempre: un precio nuevo entra a la lista de
// precios del fundamento con su procedencia (pregunta-unica).
function responderPregunta(db, userId, presupuestoId, respuesta) {
  ensureSchema(db);
  const fila = filaPresupuesto(db, userId, presupuestoId);
  const p = parsePresupuestoRow(fila);
  if (p.estado !== 'borrador') fail(`Este presupuesto está «${p.estado}»: ya no espera respuestas de armado.`);
  const pregunta = p.pregunta;
  if (!pregunta) fail('Este presupuesto no tiene ninguna pregunta esperando respuesta.');
  const r = respuesta || {};

  if (pregunta.campo === 'cliente') {
    const { snap } = resolverClienteSuave(db, userId, r.cliente || {});
    if (!snap) fail('La respuesta tiene que traer el cliente (nombre o CUIT).');
    db.prepare(`UPDATE gesty_presupuestos SET cliente_campo = ?, cliente_nombre = ?, cliente_cuit = ?,
      cliente_condicion_iva = ?, cliente_email = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(snap.campo, snap.nombre, snap.cuit, snap.condicion_iva, snap.email, p.id);
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'presupuesto', entidad_id: String(p.id),
      tipo_evento: 'presupuesto-pregunta-respondida',
      resumen: `El dueño respondió la pregunta del presupuesto ${p.numero}: el cliente es ${snap.nombre || snap.cuit}`,
      payload: { numero: p.numero, campo: 'cliente' },
    });
  } else if (pregunta.campo === 'precios') {
    const precios = Array.isArray(r.precios) ? r.precios : [];
    if (!precios.length) fail('La respuesta tiene que traer los precios que faltan: [{ descripcion, precio_unitario }].');
    const items = p.items.map((it) => ({ ...it }));
    const aprendidos = [];
    for (const falta of pregunta.items || []) {
      const dado = precios.find((x) => x && normDesc(x.descripcion) === normDesc(falta));
      if (!dado) fail(`Falta el precio de «${falta}» en la respuesta.`);
      const precio = Number(dado.precio_unitario);
      if (!Number.isFinite(precio) || precio < 0) fail(`Precio inválido para «${falta}».`);
      const it = items.find((x) => normDesc(x.descripcion) === normDesc(falta) && x.precio_unitario === null);
      it.precio_unitario = round2(precio);
      if (dado.alicuota_iva !== undefined && dado.alicuota_iva !== null) {
        const al = Number(dado.alicuota_iva);
        if (Number.isFinite(al) && al >= 0 && al < 100) it.alicuota_iva = al;
      }
      it.fuente = { tipo: 'pregunta-unica', texto: 'lo respondiste cuando Gesty te lo preguntó: queda en tu lista de precios' };
      it.subtotal = round2(it.cantidad * it.precio_unitario);
      it.iva = round2(it.subtotal * it.alicuota_iva / 100);
      aprendidos.push({ descripcion: it.descripcion, precio_unitario: it.precio_unitario, alicuota_iva: it.alicuota_iva });
    }
    db.prepare(`UPDATE gesty_presupuestos SET items = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(items), p.id);
    // Aprendido para siempre: la lista de precios del fundamento
    // incorpora lo respondido con su procedencia.
    const politica = getPolitica(db, userId);
    const lista = politica.lista_precios.slice();
    for (const a of aprendidos) {
      const idx = lista.findIndex((e) => normDesc(e.descripcion) === normDesc(a.descripcion));
      if (idx >= 0) lista[idx] = a; else lista.push(a);
    }
    gesty.setData(db, userId, {
      grupo: GRUPO_POLITICA, campo: 'lista_precios', valor: lista,
      origen: 'pregunta-unica', origen_ref: `presupuesto:${p.id}`, cargado_por: 'dueno', confirmado: true,
    });
    gesty.recordEvent(db, userId, {
      actor: 'dueno', entidad_tipo: 'presupuesto', entidad_id: String(p.id),
      tipo_evento: 'presupuesto-pregunta-respondida',
      resumen: `El dueño cotizó ${aprendidos.map((a) => `«${a.descripcion}» a ${fmtMonto(a.precio_unitario)}`).join(', ')}: quedó guardado en la lista de precios`,
      payload: { numero: p.numero, campo: 'precios', aprendidos },
    });
  }

  const filaNueva = db.prepare('SELECT * FROM gesty_presupuestos WHERE id = ?').get(p.id);
  const { pregunta: preguntaNueva } = recalcular(db, userId, filaNueva);
  const actualizado = getPresupuesto(db, userId, p.id);
  if (preguntaNueva) registrarPregunta(db, userId, actualizado, preguntaNueva);
  return actualizado;
}

// ---------------------------------------------------------------------------
// El documento y el texto — lo que el cliente recibe
// ---------------------------------------------------------------------------

function documentoDatos(p) {
  return {
    presupuesto_id: p.id, numero: p.numero,
    cliente: p.cliente, fecha: p.fecha, moneda: p.moneda, concepto: p.concepto,
    items: p.items, impuestos: p.impuestos, otros_impuestos: p.otros_impuestos,
    subtotal_neto: p.subtotal_neto, total_impuestos: p.total_impuestos, total: p.total,
    validez_dias: p.validez_dias, sena: p.sena, canal: p.canal,
  };
}

function lineaSena(sena, moneda) {
  if (!sena) return '';
  return `Seña: ${sena.porcentaje}%${sena.monto !== null ? ` (${moneda} ${fmtMonto(sena.monto)})` : ''}${sena.contra ? ` — ${sena.contra}` : ''}.`;
}

function textoPresupuesto(db, userId, p) {
  const negocio = (() => {
    const d = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
    return d && d.valor ? String(d.valor) : 'Tu negocio';
  })();
  const lineas = [
    `Presupuesto ${p.numero} — ${negocio}`,
    `Cliente: ${p.cliente.nombre || p.cliente.cuit}`,
    `Fecha: ${fmtFecha(p.fecha)}`,
    '',
    ...p.items.map((it) => `• ${it.descripcion} × ${it.cantidad} — ${p.moneda} ${fmtMonto(it.subtotal)}`),
    '',
    `Subtotal: ${p.moneda} ${fmtMonto(p.subtotal_neto)}`,
  ];
  for (const l of p.impuestos) lineas.push(`${l.concepto}: ${p.moneda} ${fmtMonto(l.monto)}`);
  for (const l of p.otros_impuestos) lineas.push(`${l.concepto}: ${p.moneda} ${fmtMonto(l.monto)}`);
  lineas.push(`TOTAL ${p.moneda}: ${fmtMonto(p.total)}`);
  lineas.push('');
  lineas.push(p.vigencia && p.vigencia.hasta
    ? `Válido hasta el ${fmtFecha(p.vigencia.hasta)} (${p.validez_dias} días).`
    : `Validez: ${p.validez_dias} días desde su envío.`);
  const sena = lineaSena(p.sena, p.moneda);
  if (sena) lineas.push(sena);
  return lineas.join('\n');
}

function documentoPresupuesto(db, userId, presupuestoId) {
  ensureSchema(db);
  const p = getPresupuesto(db, userId, presupuestoId);
  if (!p) fail('Ese presupuesto no es de esta cuenta.');
  const fiscales = gesty.getData(db, userId, { grupo: 'datos-fiscales' });
  const fiscal = (campo) => { const d = fiscales.find((x) => x.campo === campo); return d && d.valor ? String(d.valor) : ''; };
  const negocio = fiscal('razon_social') || 'Tu negocio';
  const cuitEmisor = fiscal('cuit');
  const filas = p.items.map((it) => `<tr><td>${esc(it.descripcion)}</td><td class="n">${fmtMonto(it.cantidad)}</td><td class="n">${it.precio_unitario === null ? 'a cotizar' : fmtMonto(it.precio_unitario)}</td><td class="n">${it.alicuota_iva}%</td><td class="n">${it.subtotal === null ? '—' : fmtMonto(it.subtotal)}</td></tr>`).join('');
  const filasImp = [
    ...p.impuestos.map((l) => `<tr><td>${esc(l.concepto)} (base ${fmtMonto(l.base)})</td><td class="n">${fmtMonto(l.monto)}</td></tr>`),
    ...p.otros_impuestos.map((l) => `<tr><td>${esc(l.concepto)}</td><td class="n">${fmtMonto(l.monto)}</td></tr>`),
  ].join('');
  const sena = lineaSena(p.sena, p.moneda);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto ${esc(p.numero)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#29173F;margin:32px}h1{font-size:20px;margin:0}.aviso{background:#FBEEDC;border:1px solid #B5805F;padding:8px 12px;border-radius:8px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}.n{text-align:right}.tot{font-weight:700;font-size:16px}.meta{color:#555}</style></head>
<body><p class="aviso">Presupuesto preparado por Gesty — no es un comprobante fiscal.</p><h1>PRESUPUESTO · ${esc(p.numero)}</h1>
<p class="meta">${esc(negocio)}${cuitEmisor ? ` · CUIT ${esc(cuitEmisor)}` : ''}<br>Fecha: ${esc(fmtFecha(p.fecha))} · Estado: ${esc(p.estado)}</p>
<p><strong>Cliente:</strong> ${esc(p.cliente.nombre)}${p.cliente.cuit ? ` · CUIT ${esc(p.cliente.cuit)}` : ''}${p.cliente.condicion_iva ? ` · ${esc(p.cliente.condicion_iva)}` : ''}</p>
${p.concepto ? `<p>${esc(p.concepto)}</p>` : ''}
<table><tr><th>Descripción</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">IVA</th><th class="n">Subtotal</th></tr>${filas}</table>
${p.cotizado ? `<table><tr><td>Subtotal neto</td><td class="n">${fmtMonto(p.subtotal_neto)}</td></tr>${filasImp}<tr><td class="tot">TOTAL ${esc(p.moneda)}</td><td class="n tot">${fmtMonto(p.total)}</td></tr></table>` : '<p><strong>Falta un dato para cotizar este presupuesto.</strong></p>'}
<p>Validez: ${p.validez_dias} días${p.vigencia && p.vigencia.hasta ? ` (hasta el ${esc(fmtFecha(p.vigencia.hasta))})` : ' desde su envío'}.</p>
${sena ? `<p>${esc(sena)}</p>` : ''}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Bandeja: pedir el OK y el ejecutor de la matriz (tipo
// `presupuesto` — sirve el envío inicial y el recordatorio;
// detalle.accion los distingue)
// ---------------------------------------------------------------------------

function pedirOK(db, userId, presupuestoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const p = getPresupuesto(db, userId, presupuestoId);
  if (!p) fail('Ese presupuesto no es de esta cuenta.');
  if (p.estado === 'esperando-ok' && p.tarjeta_id) {
    const card = gesty.getCard(db, userId, p.tarjeta_id);
    if (card && (card.estado === 'esperando' || card.estado === 'devuelta')) {
      fail('Este presupuesto ya tiene su tarjeta esperando en «Para tu OK».');
    }
  }
  if (p.envios.some((e) => e.estado === 'aprobado')) {
    fail('Este presupuesto ya tiene su OK aprobado: falta despachar el envío, no pedir otro.');
  }
  if (p.estado !== 'borrador' && p.estado !== 'esperando-ok') {
    fail(`El presupuesto está «${p.estado}»: ya no pide OK de envío.`);
  }
  if (p.pregunta) {
    fail(`Falta un dato para cotizar: ${p.pregunta.texto} Cuando lo respondas, el presupuesto pide su OK.`);
  }
  if (!p.cotizado) fail('El presupuesto todavía no tiene sus precios: no se puede enviar.');
  const politica = getPolitica(db, userId);
  const usaDatos = politica.usa_datos.slice();
  const clienteDato = buscarClienteDato(db, userId, { campo: p.cliente.campo, cuit: p.cliente.cuit });
  if (clienteDato) usaDatos.push(clienteDato.id);
  const documento = documentoDatos(p);
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'presupuesto',
    titulo: `Enviar presupuesto ${p.numero} · ${p.cliente.nombre || p.cliente.cuit} · ${p.moneda} ${fmtMonto(p.total)}`,
    detalle: {
      presupuesto_id: p.id, accion: 'envio', documento,
      texto: textoPresupuesto(db, userId, p),
      canal: p.canal, destinatario: p.canal === 'email' ? p.cliente.email : p.cliente.nombre,
    },
    // La tarjeta NO lleva vencimiento propio: la validez del
    // presupuesto corre desde su envío, no desde la bandeja
    // (lección de G-04: el documento vencido es el que hay que
    // poder mandar).
    monto: p.total, moneda: p.moneda, vence: '',
    usa_datos: usaDatos, creado_por: o.creado_por || 'gesty',
  });
  db.prepare(`UPDATE gesty_presupuestos SET estado = 'esperando-ok', tarjeta_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(tarjeta.id, p.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(p.id),
    tipo_evento: 'presupuesto-esperando-ok',
    resumen: `Presupuesto ${p.numero} esperando tu OK en la bandeja`,
    payload: { numero: p.numero, tarjeta_id: tarjeta.id, total: p.total },
  });
  return { presupuesto: getPresupuesto(db, userId, p.id), tarjeta };
}

// EL EJECUTOR de la matriz (tipo `presupuesto`): lo invoca
// approveCard tras validar la aprobación en el servidor. Es
// SÍNCRONO: SELLA el envío (inicial o recordatorio) como APROBADO
// con el documento/mensaje y el canal de LA tarjeta. El despacho
// por el canal lo hacen enviarPresupuesto / enviarRecordatorio —
// las únicas vías de envío, y solo despachan con este sello.
function ejecutarPresupuesto(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  // Una tarjeta `presupuesto` SIN referencia a un presupuesto no
  // es un documento de esta área (las de pedirOK y las de
  // seguimiento siempre la traen): este motor no ejecuta nada
  // sobre ella y lo declara — la fundación la sella como
  // registrada «sin-motor», sin fingir envío alguno.
  if (!d.presupuesto_id) return { ok: true, sin_motor: true };
  const fila = filaPresupuestoOrNull(db, userId, d.presupuesto_id);
  if (!fila) return { ok: false, motivo: 'El presupuesto de esta tarjeta ya no existe.' };
  const p = parsePresupuestoRow(fila);

  if (d.accion === 'recordatorio') {
    if (Number(fila.recordatorio_tarjeta_id) !== Number(card.id)) {
      return { ok: false, motivo: 'Hay una tarjeta de recordatorio más nueva para este presupuesto: se aprueba la vigente.' };
    }
    if (p.estado !== 'enviado' && p.estado !== 'vencido') {
      return { ok: false, motivo: `El presupuesto está «${p.estado}»: el recordatorio ya no corresponde.` };
    }
    if (p.respuestas.length) {
      return { ok: false, motivo: 'El cliente ya respondió: este recordatorio ya no corresponde.' };
    }
    const recordatorios = safeJson(fila.recordatorios, []);
    recordatorios.push({
      estado: 'aprobado', tarjeta_id: card.id, version_documento: card.version_documento,
      canal: d.canal || fila.canal, mensaje: d.mensaje || '',
      destinatario: d.destinatario || '', aprobado_en: new Date().toISOString(), intentos: 0,
    });
    db.prepare(`UPDATE gesty_presupuestos SET recordatorios = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(recordatorios), fila.id);
    return {
      ok: true,
      evento: 'presupuesto-recordatorio-aprobado', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
      resumen: `Recordatorio del presupuesto ${p.numero} APROBADO: quedó sellado para despachar por ${d.canal || fila.canal}`,
      payload: { tarjeta_id: card.id, canal: d.canal || fila.canal },
    };
  }

  // Envío inicial
  if (p.estado !== 'esperando-ok') {
    return { ok: false, motivo: `El presupuesto está «${p.estado}»: ya no está esperando su OK de envío.` };
  }
  if (Number(fila.tarjeta_id) !== Number(card.id)) {
    return { ok: false, motivo: 'Hay una tarjeta más nueva para este presupuesto: se aprueba la vigente.' };
  }
  if (!d.documento || round2(Number(d.documento.total)) !== round2(Number(fila.total))) {
    return { ok: false, motivo: 'El total cambió desde que se preparó el presupuesto: la tarjeta se regenera con el número actual.' };
  }
  const envios = safeJson(fila.envios, []);
  envios.push({
    estado: 'aprobado', tarjeta_id: card.id, version_documento: card.version_documento,
    canal: d.canal || fila.canal, destinatario: d.destinatario || '',
    texto: d.texto || '', aprobado_en: new Date().toISOString(), intentos: 0,
  });
  db.prepare(`UPDATE gesty_presupuestos SET envios = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(envios), fila.id);
  return {
    ok: true,
    evento: 'presupuesto-envio-aprobado', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
    resumen: `Envío del presupuesto ${p.numero} APROBADO: quedó sellado para despachar por ${d.canal || fila.canal}`,
    payload: { tarjeta_id: card.id, canal: d.canal || fila.canal, total: fila.total },
  };
}
function filaPresupuestoOrNull(db, userId, id) {
  const r = db.prepare('SELECT * FROM gesty_presupuestos WHERE id = ?').get(Number(id));
  return r && r.user_id === userId ? r : null;
}
gesty.registerExecutor('presupuesto', ejecutarPresupuesto);

// ---------------------------------------------------------------------------
// Despacho compartido por canal (email / whatsapp-manual)
// ---------------------------------------------------------------------------

async function despachar(db, userId, p, sello, opts, textos) {
  const o = opts || {};
  if (o.canal && normTexto(o.canal).toLowerCase() !== sello.canal) {
    fail(`El envío aprobado es por ${sello.canal}: cambiar el canal pide editar la tarjeta y un OK nuevo.`);
  }
  if (sello.canal === 'whatsapp-manual') {
    const comprobante = normTexto(o.comprobante || '');
    if (!comprobante) fail('El envío manual se registra con su comprobante (qué se mandó y cuándo): sin comprobante, no hay envío.');
    sello.estado = 'enviado';
    sello.intentos = (sello.intentos || 0) + 1;
    sello.fecha = new Date().toISOString();
    sello.comprobante = comprobante;
    sello.destinatario = normTexto(o.destinatario || sello.destinatario || p.cliente.nombre);
    return { canal: 'whatsapp-manual', comprobante, destinatario: sello.destinatario, actor: 'dueno' };
  }
  const destinatario = normTexto(o.destinatario || sello.destinatario || p.cliente.email);
  if (!destinatario) fail('No hay email del cliente para enviarle el presupuesto: se carga una vez y queda en el fundamento.');
  if (!_cfg.sendEmail) fail('El canal de email no está disponible en este servidor.');
  sello.intentos = (sello.intentos || 0) + 1;
  let r;
  try { r = await _cfg.sendEmail({ to: destinatario, subject: textos.subject, html: textos.html, text: textos.text }); }
  catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) {
    const motivo = r && r.skipped ? 'el servidor no tiene el canal de email configurado' : 'el proveedor de email rechazó el envío';
    sello.estado = 'fallido';
    sello.motivo = motivo;
    return { fallo: motivo };
  }
  sello.estado = 'enviado';
  sello.fecha = new Date().toISOString();
  sello.comprobante = String(r.id || r.provider_id || 'email');
  sello.destinatario = destinatario;
  return { canal: 'email', comprobante: sello.comprobante, destinatario, actor: 'gesty' };
}

function ultimoSello(lista) {
  const idx = lista.map((e, i) => [e, i]).filter(([e]) => e.estado === 'aprobado' || e.estado === 'fallido').pop();
  return idx ? { sello: idx[0], i: idx[1] } : null;
}

// EL DESPACHO del envío inicial — la única vía. Exige el sello
// del ejecutor: sin tarjeta aprobada, no sale nada.
async function enviarPresupuesto(db, userId, presupuestoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fila = filaPresupuesto(db, userId, presupuestoId);
  const p = parsePresupuestoRow(fila);
  if (p.estado !== 'esperando-ok') {
    fail(`El presupuesto está «${p.estado}»: el envío sale solo tras el OK, desde esperando-ok.`);
  }
  const envios = safeJson(fila.envios, []);
  const hallado = ultimoSello(envios);
  if (!hallado) fail('Sin el OK del dueño no sale: este presupuesto no tiene un envío aprobado esperando despacho.');
  const { sello } = hallado;
  const politica = getPolitica(db, userId);
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const vigenciaDesde = hoy;
  const vigenciaHasta = addDias(hoy, p.validez_dias);
  const seguimientoEn = politica.seguimiento_dias !== null
    ? addDias(hoy, politica.seguimiento_dias) : vigenciaHasta;
  const recordatorioEn = seguimientoEn < vigenciaHasta ? seguimientoEn : vigenciaHasta;
  const pConVigencia = { ...p, vigencia: { desde: vigenciaDesde, hasta: vigenciaHasta } };
  const r = await despachar(db, userId, p, sello, o, {
    subject: `Presupuesto ${p.numero}`,
    html: documentoPresupuesto(db, userId, p.id),
    text: textoPresupuesto(db, userId, pConVigencia),
  });
  if (r.fallo) {
    db.prepare(`UPDATE gesty_presupuestos SET envios = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(envios), fila.id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
      tipo_evento: 'presupuesto-envio-fallido',
      resumen: `El presupuesto ${p.numero} NO salió por email: ${r.fallo}. Sigue esperando en la bandeja de despacho.`,
      payload: { tarjeta_id: sello.tarjeta_id, canal: sello.canal, motivo: r.fallo },
    });
    fail(`El email no salió (${r.fallo}). El presupuesto sigue esperando-ok: nada quedó enviado a medias.`);
  }
  db.prepare(`UPDATE gesty_presupuestos SET estado = 'enviado', envios = ?, fecha_envio = ?,
    vigencia_desde = ?, vigencia_hasta = ?, recordatorio_en = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(envios), hoy, vigenciaDesde, vigenciaHasta, recordatorioEn, fila.id);
  gesty.recordEvent(db, userId, {
    actor: r.actor, entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
    tipo_evento: 'presupuesto-enviado',
    resumen: `Presupuesto ${p.numero} enviado por ${r.canal === 'email' ? `email a ${r.destinatario}` : 'WhatsApp (registro manual del dueño)'} · válido hasta el ${fmtFecha(vigenciaHasta)}`,
    payload: { numero: p.numero, tarjeta_id: sello.tarjeta_id, canal: r.canal, destinatario: r.destinatario, vigencia_hasta: vigenciaHasta, recordatorio_en: recordatorioEn },
    comprobante_externo: r.comprobante,
  });
  return { presupuesto: getPresupuesto(db, userId, fila.id), envio: sello };
}

// ---------------------------------------------------------------------------
// Seguimiento: la rutina que marca vencidos y PREPARA el
// recordatorio (tarjeta nueva). Nunca envía sola.
// ---------------------------------------------------------------------------

function procesarSeguimiento(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const politica = getPolitica(db, userId);
  const resultado = { hoy, revisados: 0, vencidos_ahora: 0, recordatorios_creados: 0, ya_con_tarjeta: 0, ya_respondidos: 0, con_sello_pendiente: 0 };
  const rows = db.prepare(`SELECT * FROM gesty_presupuestos WHERE user_id = ? AND estado IN ('enviado','vencido') ORDER BY id ASC`).all(userId);
  for (let fila of rows) {
    resultado.revisados++;
    let p = parsePresupuestoRow(fila, hoy);

    // Vencimiento de la validez: el estado se declara, no se esconde.
    if (p.estado === 'enviado' && p.vigencia && p.vigencia.hasta && hoy > p.vigencia.hasta) {
      db.prepare(`UPDATE gesty_presupuestos SET estado = 'vencido', updated_at = datetime('now') WHERE id = ?`).run(fila.id);
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
        tipo_evento: 'presupuesto-vencido',
        resumen: `El presupuesto ${p.numero} venció el ${fmtFecha(p.vigencia.hasta)} sin respuesta registrada`,
        payload: { numero: p.numero, vigencia_hasta: p.vigencia.hasta },
      });
      resultado.vencidos_ahora++;
      fila = db.prepare('SELECT * FROM gesty_presupuestos WHERE id = ?').get(fila.id);
      p = parsePresupuestoRow(fila, hoy);
    }

    if (p.respuestas.length) { resultado.ya_respondidos++; continue; }

    // Un recordatorio por presupuesto: si ya salió, no se repite.
    if (p.recordatorios.some((x) => x.estado === 'enviado')) continue;
    // Con el sello aprobado esperando despacho, no nace otra tarjeta.
    if (p.recordatorios.some((x) => x.estado === 'aprobado')) { resultado.con_sello_pendiente++; continue; }
    // Tarjeta vigente esperando: ya está preparada.
    if (p.recordatorio_tarjeta_id) {
      const card = gesty.getCard(db, userId, p.recordatorio_tarjeta_id);
      if (card && (card.estado === 'esperando' || card.estado === 'devuelta')) { resultado.ya_con_tarjeta++; continue; }
    }
    if (!p.recordatorio_en || p.recordatorio_en > hoy) continue;

    const vencido = p.estado === 'vencido';
    const vars = {
      cliente: p.cliente.nombre || p.cliente.cuit || 'cliente',
      negocio: (() => {
        const d = gesty.getData(db, userId, { grupo: 'datos-fiscales' }).find((x) => x.campo === 'razon_social');
        return d && d.valor ? String(d.valor) : 'Tu negocio';
      })(),
      numero: p.numero, moneda: p.moneda, total: fmtMonto(p.total),
      vencimiento: fmtFecha(p.vigencia ? p.vigencia.hasta : ''),
    };
    let mensaje = plantillaRecordatorio(vencido);
    for (const [k, v] of Object.entries(vars)) mensaje = mensaje.replace(new RegExp(`\\{${k}\\}`, 'g'), v);

    const tarjeta = gesty.createCard(db, userId, {
      tipo: 'presupuesto',
      titulo: `Recordatorio del presupuesto ${p.numero} · ${p.cliente.nombre || p.cliente.cuit} · ${p.moneda} ${fmtMonto(p.total)} (${vencido ? 'vencido' : 'sin respuesta'})`,
      detalle: {
        presupuesto_id: p.id, accion: 'recordatorio', mensaje,
        canal: politica.canal, destinatario: politica.canal === 'email' ? p.cliente.email : p.cliente.nombre,
        total: p.total, vigencia_hasta: p.vigencia ? p.vigencia.hasta : '',
      },
      monto: p.total, moneda: p.moneda, vence: '',
      usa_datos: politica.usa_datos, creado_por: 'gesty',
    });
    db.prepare(`UPDATE gesty_presupuestos SET recordatorio_tarjeta_id = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(tarjeta.id, fila.id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
      tipo_evento: 'presupuesto-recordatorio-preparado',
      resumen: `Recordatorio del presupuesto ${p.numero} listo para tu OK (${vencido ? 'venció' : 'sin respuesta'}): Gesty lo preparó, no lo envió`,
      payload: { numero: p.numero, tarjeta_id: tarjeta.id, vencido },
    });
    resultado.recordatorios_creados++;
  }
  return resultado;
}

// EL DESPACHO del recordatorio — exige su sello, como el envío.
async function enviarRecordatorio(db, userId, presupuestoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fila = filaPresupuesto(db, userId, presupuestoId);
  const p = parsePresupuestoRow(fila);
  if (p.estado !== 'enviado' && p.estado !== 'vencido') {
    fail(`El presupuesto está «${p.estado}»: no hay recordatorio para despachar.`);
  }
  if (p.respuestas.length) fail('El cliente ya respondió: este recordatorio ya no corresponde.');
  const recordatorios = safeJson(fila.recordatorios, []);
  const hallado = ultimoSello(recordatorios);
  if (!hallado) fail('Sin el OK del dueño no sale: este recordatorio no tiene una aprobación sellada esperando despacho.');
  const { sello } = hallado;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body style="font-family:system-ui,Arial,sans-serif;color:#29173F;margin:32px"><p>${esc(sello.mensaje || '').replace(/\n/g, '<br>')}</p></body></html>`;
  const r = await despachar(db, userId, p, sello, o, {
    subject: `Presupuesto ${p.numero}`, html, text: sello.mensaje || '',
  });
  if (r.fallo) {
    db.prepare(`UPDATE gesty_presupuestos SET recordatorios = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(recordatorios), fila.id);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
      tipo_evento: 'presupuesto-recordatorio-fallido',
      resumen: `El recordatorio del presupuesto ${p.numero} NO salió por email: ${r.fallo}.`,
      payload: { tarjeta_id: sello.tarjeta_id, canal: sello.canal, motivo: r.fallo },
    });
    fail(`El email no salió (${r.fallo}). El recordatorio sigue sellado para reintentar: nada quedó enviado a medias.`);
  }
  db.prepare(`UPDATE gesty_presupuestos SET recordatorios = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(recordatorios), fila.id);
  gesty.recordEvent(db, userId, {
    actor: r.actor, entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
    tipo_evento: 'presupuesto-recordatorio-enviado',
    resumen: `Recordatorio del presupuesto ${p.numero} enviado por ${r.canal === 'email' ? `email a ${r.destinatario}` : 'WhatsApp (registro manual del dueño)'}`,
    payload: { numero: p.numero, tarjeta_id: sello.tarjeta_id, canal: r.canal, destinatario: r.destinatario },
    comprobante_externo: r.comprobante,
  });
  return { presupuesto: getPresupuesto(db, userId, fila.id), recordatorio: sello };
}

// ---------------------------------------------------------------------------
// Respuesta del cliente — queda registrada; aceptado y rechazado
// mueven el estado. Una respuesta también apaga el recordatorio
// pendiente: su ejecutor lo rechaza con el motivo (ya respondió).
// ---------------------------------------------------------------------------

function registrarRespuesta(db, userId, presupuestoId, respuesta) {
  ensureSchema(db);
  const fila = filaPresupuesto(db, userId, presupuestoId);
  const p = parsePresupuestoRow(fila);
  if (p.estado !== 'enviado' && p.estado !== 'vencido') {
    fail(`El presupuesto está «${p.estado}»: todavía no salió, no hay respuesta de cliente para registrar.`);
  }
  const r = respuesta || {};
  const texto = normTexto(r.texto);
  if (!texto) fail('La respuesta del cliente se registra con su texto: sin texto no hay registro.');
  const resultado = normTexto(r.resultado || '').toLowerCase();
  if (resultado && !['aceptado', 'rechazado', 'consulta'].includes(resultado)) {
    fail(`Resultado de respuesta inválido: ${resultado}. Válidos: aceptado, rechazado, consulta.`);
  }
  const registro = {
    texto, resultado: resultado || 'consulta',
    canal: normTexto(r.canal || ''), fecha: normTexto(r.fecha) || hoyISO(),
    registrada_en: new Date().toISOString(),
  };
  const respuestas = safeJson(fila.respuestas, []);
  respuestas.push(registro);
  let nuevoEstado = fila.estado;
  if (resultado === 'aceptado') nuevoEstado = 'aceptado';
  if (resultado === 'rechazado') nuevoEstado = 'rechazado';
  db.prepare(`UPDATE gesty_presupuestos SET respuestas = ?, estado = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(respuestas), nuevoEstado, fila.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
    tipo_evento: 'presupuesto-respuesta',
    resumen: `Respuesta del cliente por el presupuesto ${p.numero} (${registro.resultado}): «${texto.slice(0, 140)}»`,
    payload: { numero: p.numero, resultado: registro.resultado, canal: registro.canal },
  });
  if (resultado === 'aceptado') {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
      tipo_evento: 'presupuesto-aceptado',
      resumen: `Presupuesto ${p.numero} ACEPTADO por ${p.cliente.nombre || p.cliente.cuit} · ${p.moneda} ${fmtMonto(p.total)}: ya puede alimentar su factura`,
      payload: { numero: p.numero, total: p.total },
    });
  }
  if (resultado === 'rechazado') {
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(fila.id),
      tipo_evento: 'presupuesto-rechazado',
      resumen: `Presupuesto ${p.numero} rechazado por el cliente: queda cerrado con su motivo registrado`,
      payload: { numero: p.numero },
    });
  }
  return getPresupuesto(db, userId, fila.id);
}

// ---------------------------------------------------------------------------
// Aceptado → alimenta G-04 por el acople `origen_ref` (sin tocar
// G-04): la factura nace borrador con origen_tipo 'presupuesto'.
// ---------------------------------------------------------------------------

function crearFacturaDesdePresupuesto(db, userId, presupuestoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fila = filaPresupuesto(db, userId, presupuestoId);
  const p = parsePresupuestoRow(fila);
  if (p.estado !== 'aceptado') {
    fail(`Solo un presupuesto aceptado alimenta una factura (este está «${p.estado}»).`);
  }
  if (p.factura_id) {
    const previa = facturacion.getFactura(db, userId, p.factura_id);
    fail(`Este presupuesto ya tiene su factura borrador${previa ? ` (${previa.numero})` : ''}: no se duplica.`);
  }
  if (!p.cotizado) fail('El presupuesto aceptado no tiene totales: no hay factura para armar.');
  const factura = facturacion.crearDesdePresupuesto(db, userId, {
    presupuesto_ref: String(p.id),
    cliente: {
      campo: p.cliente.campo, nombre: p.cliente.nombre, cuit: p.cliente.cuit,
      condicion_iva: p.cliente.condicion_iva, email: p.cliente.email,
    },
    items: p.items.map((it) => ({
      descripcion: it.descripcion, cantidad: it.cantidad,
      precio_unitario: it.precio_unitario, alicuota_iva: it.alicuota_iva,
    })),
    otros_impuestos: p.otros_impuestos,
    moneda: p.moneda,
    concepto: o.concepto !== undefined ? o.concepto : (p.concepto || `Presupuesto ${p.numero} aceptado`),
    fecha: o.fecha, vencimiento: o.vencimiento, plazo_dias: o.plazo_dias,
    creado_por: 'gesty',
  });
  db.prepare(`UPDATE gesty_presupuestos SET factura_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(factura.id, p.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'presupuesto', entidad_id: String(p.id),
    tipo_evento: 'presupuesto-factura-creada',
    resumen: `Del presupuesto ${p.numero} aceptado nació el borrador de factura ${factura.numero} · ${factura.moneda} ${fmtMonto(factura.total)}`,
    payload: { numero: p.numero, factura_id: factura.id, factura_numero: factura.numero, total: factura.total },
  });
  return { presupuesto: getPresupuesto(db, userId, p.id), factura };
}

// ---------------------------------------------------------------------------
// Consulta — la base de la pantalla de Presupuestos, de la agenda
// (G-09: vencimientos de validez) y del reporte (sin respuesta)
// ---------------------------------------------------------------------------

function listPresupuestos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = esFechaISO(o.hoy) ? String(o.hoy) : hoyISO();
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  const rows = db.prepare('SELECT * FROM gesty_presupuestos WHERE user_id = ? ORDER BY id DESC').all(userId);
  let out = rows.map((r) => parsePresupuestoRow(r, hoy));
  if (o.estado) out = out.filter((p) => p.estado === String(o.estado));
  if (o.cliente_cuit) out = out.filter((p) => p.cliente.cuit === soloDigitos(o.cliente_cuit));
  if (o.cliente) {
    const q = normTexto(o.cliente).toLowerCase();
    out = out.filter((p) => (p.cliente.nombre || '').toLowerCase().includes(q));
  }
  if (o.desde) out = out.filter((p) => p.fecha >= String(o.desde));
  if (o.hasta) out = out.filter((p) => p.fecha <= String(o.hasta));
  if (o.sin_respuesta) out = out.filter((p) => p.sin_respuesta);
  if (o.por_vencer) out = out.filter((p) => p.estado === 'enviado' && p.dias_para_vencer !== null && p.dias_para_vencer >= 0);
  const total = out.length;
  return { presupuestos: out.slice(off, off + lim), total };
}

function resumenPresupuestos(db, userId, opts) {
  ensureSchema(db);
  const hoy = esFechaISO((opts || {}).hoy) ? String((opts || {}).hoy) : hoyISO();
  const rows = db.prepare('SELECT * FROM gesty_presupuestos WHERE user_id = ?').all(userId);
  const resumen = {
    total: rows.length, por_estado: {}, sin_respuesta: 0, vencen_hoy: 0,
    monto_vigente: 0, monto_aceptado: 0, con_pregunta: 0, recordatorios_pendientes: 0,
  };
  for (const e of ESTADOS) resumen.por_estado[e] = 0;
  for (const r of rows) {
    const p = parsePresupuestoRow(r, hoy);
    resumen.por_estado[p.estado] = (resumen.por_estado[p.estado] || 0) + 1;
    if (p.sin_respuesta) resumen.sin_respuesta++;
    if (p.estado === 'enviado' && p.dias_para_vencer === 0) resumen.vencen_hoy++;
    if (p.estado === 'enviado' && p.total !== null) resumen.monto_vigente = round2(resumen.monto_vigente + p.total);
    if (p.estado === 'aceptado' && p.total !== null) resumen.monto_aceptado = round2(resumen.monto_aceptado + p.total);
    if (p.pregunta) resumen.con_pregunta++;
    if (p.recordatorio_tarjeta_id) {
      const card = gesty.getCard(db, userId, p.recordatorio_tarjeta_id);
      if (card && (card.estado === 'esperando' || card.estado === 'devuelta')) resumen.recordatorios_pendientes++;
    }
  }
  return resumen;
}

module.exports = {
  // constantes
  ESTADOS, CANALES_ENVIO, VALIDEZ_DEFAULT_DIAS,
  // configuración / inyección
  configure,
  // esquema
  ensureSchema,
  // política del fundamento
  getPolitica, setPolitica,
  // intake y armado
  crearBorrador, editarBorrador, responderPregunta,
  // documento
  documentoPresupuesto, textoPresupuesto,
  // bandeja / matriz
  pedirOK, ejecutarPresupuesto,
  // despacho (únicas vías de envío)
  enviarPresupuesto, enviarRecordatorio,
  // seguimiento
  procesarSeguimiento,
  // respuestas y acople con G-04
  registrarRespuesta, crearFacturaDesdePresupuesto,
  // consulta
  getPresupuesto, listPresupuestos, resumenPresupuestos,
  // piezas internas, exportadas para tests y reuso
  resolverItems, precioDeLista, precioUltimoSimilar, preguntaDe, plantillaRecordatorio,
};
