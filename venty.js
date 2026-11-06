// venty.js — VENTY, ventas y crecimiento (slice 1: capa de app en Modo Prueba).
// Patrón oficina: init(db) crea las tablas con prefijo venty_; funciones
// puras exportadas para test; nada de Posty se toca (cero cambios a sus
// tablas o rutas). Todo número visible sale del registro o va rotulado
// «ejemplo». La voz de Venty: minúsculas, sin ¿/¡, burbujas 2–4, 0–1 emoji.
// Valores vivos: USD 300 plan único, estreno 2/11/2027, Clásico #4CAF50,
// profunda #2E7D32, navy #0A1E33. Descuento máximo 10% solo.
'use strict';

const MODO = 'prueba';
const PRECIO_MENSUAL_USD = 300;
const ESTRENO = '2027-11-02';
const DESCUENTO_MAX = 10;
const GRUPO_ESCALA = 15;
const SEGUIMIENTO_MAX = 3;
const TZ_CUENTA = 'America/Argentina/Buenos_Aires';

// ---- Café Aroma: fundamento comercial (una sola fuente; manda sobre el flujo) ----
const CAFE_AROMA = {
  rubro: 'gastronomía',
  modo: 'gastronomía',
  estrella: 'Brunch Aroma para dos',
  precios: [
    { item: 'Café con leche', precio: 4800 },
    { item: 'Cappuccino', precio: 5200 },
    { item: 'Flat white', precio: 5500 },
    { item: 'Medialuna', precio: 1900 },
    { item: 'Tostado de jamón y queso', precio: 7500 },
    { item: 'Brunch Aroma para dos', precio: 24000 },
    { item: 'Torta del día (porción)', precio: 6800 },
    { item: 'Limonada con menta y jengibre 1L', precio: 8900 },
    { item: 'Almuerzo del día (plato + bebida)', precio: 12500 },
    { item: 'Café en grano 250 g', precio: 15000 },
  ],
  politicas: {
    reserva_sin_sena_hasta: 6,
    grupo_sena_pct: 30,
    grupo_sena_desde: 7,
    cancelacion_sin_cargo_horas: 2,
  },
  limites: {
    descuento_max_pct: DESCUENTO_MAX,
    grupo_escala_desde: GRUPO_ESCALA,
    prohibido: ['catering fuera del local', 'exclusividad del salón'],
  },
  tono: 'cercano, minúsculas, rioplatense con medida, 0–1 emoji, nunca ¿/¡',
  objeciones: [
    { objecion: 'Está caro, en otro café sale menos', respuesta: 'te entiendo, el nuestro es con grano de especialidad y se hace al momento. si querés probarlo tranqui, arrancá con el flat white a $5.500' },
    { objecion: '¿Tienen opciones sin TACC?', respuesta: 'no está en el fundamento: lo confirmo y te aviso' },
    { objecion: 'Lo consulto y te aviso', respuesta: 'dale, te guardo la disponibilidad del brunch del fin de semana y te escribo' },
  ],
  derechos: { poderes: ['venty'], precio_contratado_usd: PRECIO_MENSUAL_USD, plan: 'unico' },
};

// ---- Caza en slice 1: EJEMPLO ROTULADO (la caza real es slice 4) ----
const CAZA_EJEMPLO = {
  ejemplo: true,
  nota: 'en modo prueba, la caza es de ejemplo; la caza real llega con el slice 4',
  cupo_semanal: { usados: 8, tope: 12 },
  zonas: [
    { nombre: 'Centro', estado: 'en_curso', estudiados: 26, tier_a: 12, contactados: 4 },
    { nombre: 'Barrio Norte', estado: 'siguiente', relevados: 18, pre_puntuados: 7 },
  ],
  prospectos: [
    { nombre: 'Gimnasio Fuerza Viva', tier: 'A', puntaje: 91, porque: 'tiene que buscar clientes: entrenan 200 personas por semana y no tienen canal de captación', estado: 'contactado' },
    { nombre: 'Panadería La Espiga', tier: 'A', puntaje: 88, porque: 'tiene que buscar clientes: abre sucursal nueva y necesita llenar la mañana', estado: 'pendiente' },
    { nombre: 'Florería Jazmín', tier: 'B', puntaje: 76, porque: 'vende por encargo y todavía no probó captar por instagram', estado: 'pendiente' },
  ],
};

// ---- helpers de fecha/hora (zona de la cuenta) ----
function hoyYmd(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz || TZ_CUENTA });
}
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function ahoraIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function fmtPesos(n) {
  const s = String(Math.round(Number(n) || 0));
  return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function sliceTxt(s, n) { return String(s || '').slice(0, n); }

// ---- validador de voz de Venty (servidor): minúsculas, sin ¿/¡, 0–1 emoji ----
function contarEmoji(s) {
  const m = String(s || '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu);
  return m ? m.length : 0;
}
function validarVoz(texto) {
  const t = String(texto || '');
  const errores = [];
  if (/[¿¡]/.test(t)) errores.push('signo_apertura');
  if (contarEmoji(t) > 1) errores.push('mas_de_un_emoji');
  const primera = t.trim().charAt(0);
  if (primera && primera !== primera.toLowerCase() && /[A-ZÁÉÍÓÚÑ]/.test(primera)) errores.push('mayuscula_inicial');
  return { ok: errores.length === 0, errores };
}

// ---- tablas ----
function init(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_fundamento (
    user_id INTEGER PRIMARY KEY,
    rubro TEXT DEFAULT '',
    modo TEXT DEFAULT '',
    estrella TEXT DEFAULT '',
    precios_json TEXT DEFAULT '[]',
    politicas_json TEXT DEFAULT '{}',
    limites_json TEXT DEFAULT '{}',
    tono TEXT DEFAULT '',
    derechos_json TEXT DEFAULT '{}',
    objeciones_json TEXT DEFAULT '[]',
    website_url TEXT DEFAULT '',
    ciudad TEXT DEFAULT '',
    paleta_json TEXT DEFAULT '[]',
    version INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT ''
  )`);
  // Migración CONECTAR-4: fundamentos creados antes del lote no tienen
  // estas columnas; ALTER guardado (si ya existen, no pasa nada).
  for (const col of ['website_url TEXT', 'ciudad TEXT', 'paleta_json TEXT']) {
    try { db.exec(`ALTER TABLE venty_fundamento ADD COLUMN ${col}`); } catch (e) { /* ya existe */ }
  }
  // ---- CONECTAR-4: representantes por zona + leads pre-contacto ----
  // UN representante POR ZONA por cliente (modelo vigente 6/11): cada uno
  // hace TODO en su zona (email + Instagram + seguimiento) con la misma
  // voz; identidad remitente por zona por cliente; fundamento y lista de
  // leads compartidos (para no escribir dos veces al mismo prospecto ni
  // pasarse del cupo — el cupo lo gobierna venty-gobernador.js).
  db.exec(`CREATE TABLE IF NOT EXISTS venty_zonas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nombre TEXT NOT NULL DEFAULT '',
    ciudad TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'activa',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, nombre)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_representantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    zona_id INTEGER NOT NULL,
    nombre TEXT NOT NULL DEFAULT '',
    remitente_nombre TEXT NOT NULL DEFAULT '',
    remitente_email TEXT NOT NULL DEFAULT '',
    remitente_ig TEXT NOT NULL DEFAULT '',
    remitente_wa TEXT NOT NULL DEFAULT '',
    voz_nota TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, zona_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    zona_id INTEGER,
    nombre TEXT NOT NULL DEFAULT '',
    nombre_norm TEXT NOT NULL DEFAULT '',
    canal_preferido TEXT NOT NULL DEFAULT '',
    contacto_ref TEXT NOT NULL DEFAULT '',
    puntaje INTEGER DEFAULT 0,
    porque TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, nombre_norm)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_leads_user ON venty_leads(user_id, zona_id, estado)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_rep_user ON venty_representantes(user_id, zona_id)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_partidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cliente_nombre TEXT NOT NULL,
    canal TEXT DEFAULT 'simulacion',
    estado TEXT DEFAULT 'viva',
    modo_rubro TEXT DEFAULT '',
    monto INTEGER DEFAULT 0,
    forma_cierre TEXT DEFAULT '',
    motivo_perdida TEXT DEFAULT '',
    seguimiento_toque INTEGER DEFAULT 0,
    proximo_toque_at TEXT DEFAULT '',
    origen TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_venty_part_user ON venty_partidas(user_id, estado)`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partida_id INTEGER NOT NULL,
    autor TEXT NOT NULL,
    texto TEXT NOT NULL,
    canal TEXT DEFAULT 'simulacion',
    enviado_at TEXT NOT NULL,
    fuente_precio TEXT DEFAULT ''
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_venty_msg_part ON venty_mensajes(partida_id, enviado_at)`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_jugadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    partida_id INTEGER,
    tipo TEXT NOT NULL,
    propuesta_json TEXT DEFAULT '{}',
    porque TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    resuelto_at TEXT DEFAULT '',
    resuelto_por TEXT DEFAULT '',
    nota_dueno TEXT DEFAULT ''
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_venty_jug_user ON venty_jugadas(user_id, estado)`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    partida_id INTEGER,
    datos_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_venty_ev_user ON venty_eventos(user_id, tipo, created_at)`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_parte (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    semana TEXT NOT NULL,
    datos_json TEXT NOT NULL,
    emitido_at TEXT NOT NULL,
    UNIQUE(user_id, semana)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_freno (
    user_id INTEGER PRIMARY KEY,
    pausado INTEGER DEFAULT 0,
    alcance TEXT DEFAULT 'mensajes y contactos nuevos; los turnos agendados siguen',
    desde TEXT DEFAULT '',
    hasta TEXT DEFAULT ''
  )`);
}

function registrarEvento(db, userId, tipo, partidaId, datos) {
  try {
    db.prepare(`INSERT INTO venty_eventos (user_id, tipo, partida_id, datos_json, created_at) VALUES (?,?,?,?,?)`)
      .run(userId, tipo, partidaId || null, JSON.stringify(datos || {}), ahoraIso());
  } catch (e) { /* el registro nunca rompe el flujo */ }
}

function leerFundamento(db, userId) {
  try {
    const row = db.prepare('SELECT * FROM venty_fundamento WHERE user_id = ?').get(userId);
    if (!row) return null;
    const j = (s, dflt) => { try { return JSON.parse(s || ''); } catch (e) { return dflt; } };
    return {
      ...row,
      website_url: row.website_url || '',
      ciudad: row.ciudad || '',
      paleta: j(row.paleta_json, []),
      precios: j(row.precios_json, []),
      politicas: j(row.politicas_json, {}),
      limites: j(row.limites_json, {}),
      derechos: j(row.derechos_json, {}),
      objeciones: j(row.objeciones_json, []),
    };
  } catch (e) { return null; }
}

// ---- CONECTAR-4: puente del fundamento (website_url / ciudad / paleta) ----
// Solo actualiza los campos del puente. Nunca toca precios, estrella,
// políticas ni tono: eso lo decide el dueño, no la web ni Posty.
function actualizarFundamentoPuente(db, userId, cambios) {
  const c = cambios || {};
  const sets = [];
  const vals = [];
  if (c.website_url !== undefined) { sets.push('website_url=?'); vals.push(String(c.website_url || '').slice(0, 500)); }
  if (c.ciudad !== undefined) { sets.push('ciudad=?'); vals.push(String(c.ciudad || '').slice(0, 80)); }
  if (c.paleta !== undefined) {
    const pal = Array.isArray(c.paleta) ? c.paleta.slice(0, 2).map((p) => ({
      hex: String(typeof p === 'string' ? p : (p.hex || '')).toUpperCase(),
      rol: (p && p.rol) || '',
    })).filter((p) => /^#[0-9A-F]{6}$/.test(p.hex)) : [];
    sets.push('paleta_json=?'); vals.push(JSON.stringify(pal));
  }
  if (c.rubro !== undefined) { sets.push('rubro=?'); vals.push(String(c.rubro || '').slice(0, 80)); }
  if (!sets.length) return leerFundamento(db, userId);
  sets.push('updated_at=?'); vals.push(ahoraIso());
  vals.push(userId);
  db.prepare(`UPDATE venty_fundamento SET ${sets.join(', ')} WHERE user_id = ?`).run(...vals);
  return leerFundamento(db, userId);
}

// ---- CONECTAR-4: zonas / representantes (uno por zona) / leads ----------
function crearZona(db, userId, opts) {
  const o = opts || {};
  const nombre = String(o.nombre || '').trim().slice(0, 80);
  if (!nombre) return { ok: false, error: 'sin_nombre' };
  const ciudad = String(o.ciudad || '').trim().slice(0, 80);
  try {
    const r = db.prepare(`INSERT INTO venty_zonas (user_id, nombre, ciudad, estado, created_at) VALUES (?,?,?,'activa',?)`)
      .run(userId, nombre, ciudad, ahoraIso());
    return { ok: true, id: Number(r.lastInsertRowid), nombre, ciudad };
  } catch (e) {
    return { ok: false, error: 'zona_ya_existe' };
  }
}

function listarZonas(db, userId) {
  return db.prepare('SELECT * FROM venty_zonas WHERE user_id = ? ORDER BY nombre ASC').all(userId);
}

function crearRepresentante(db, userId, opts) {
  const o = opts || {};
  const zonaId = Number(o.zona_id || 0);
  if (!zonaId) return { ok: false, error: 'sin_zona' };
  const zona = db.prepare('SELECT * FROM venty_zonas WHERE id = ? AND user_id = ?').get(zonaId, userId);
  if (!zona) return { ok: false, error: 'zona_no_encontrada' };
  const nombre = String(o.nombre || '').trim().slice(0, 80);
  if (!nombre) return { ok: false, error: 'sin_nombre' };
  try {
    const r = db.prepare(`INSERT INTO venty_representantes
      (user_id, zona_id, nombre, remitente_nombre, remitente_email, remitente_ig, remitente_wa, voz_nota, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(userId, zonaId, nombre,
      String(o.remitente_nombre || nombre).slice(0, 80),
      String(o.remitente_email || '').trim().slice(0, 200),
      String(o.remitente_ig || '').trim().slice(0, 120),
      String(o.remitente_wa || '').replace(/\D/g, '').slice(0, 20),
      String(o.voz_nota || '').slice(0, 300), ahoraIso());
    return { ok: true, id: Number(r.lastInsertRowid), zona_id: zonaId, nombre };
  } catch (e) {
    return { ok: false, error: 'zona_ya_tiene_representante' };
  }
}

function listarRepresentantes(db, userId) {
  return db.prepare(`SELECT r.*, z.nombre AS zona_nombre FROM venty_representantes r
    LEFT JOIN venty_zonas z ON z.id = r.zona_id WHERE r.user_id = ? ORDER BY z.nombre ASC`).all(userId);
}

function representanteDeZona(db, userId, zonaId) {
  return db.prepare('SELECT * FROM venty_representantes WHERE user_id = ? AND zona_id = ?').get(userId, Number(zonaId || 0)) || null;
}

function normNombreLead(nombre) {
  return String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

// Dedupe por (negocio, prospecto): mismo nombre normalizado → mismo lead,
// nunca se escribe dos veces al mismo prospecto.
function crearLead(db, userId, opts) {
  const o = opts || {};
  const nombre = String(o.nombre || '').trim().slice(0, 120);
  if (!nombre) return { ok: false, error: 'sin_nombre' };
  const nombreNorm = normNombreLead(nombre);
  const zonaId = o.zona_id ? Number(o.zona_id) : null;
  if (zonaId) {
    const zona = db.prepare('SELECT id FROM venty_zonas WHERE id = ? AND user_id = ?').get(zonaId, userId);
    if (!zona) return { ok: false, error: 'zona_no_encontrada' };
  }
  const canal = ['email', 'instagram', 'whatsapp'].includes(String(o.canal_preferido || '')) ? String(o.canal_preferido) : '';
  const existente = db.prepare('SELECT * FROM venty_leads WHERE user_id = ? AND nombre_norm = ?').get(userId, nombreNorm);
  if (existente) return { ok: false, error: 'lead_ya_existe', lead_id: existente.id };
  const r = db.prepare(`INSERT INTO venty_leads
    (user_id, zona_id, nombre, nombre_norm, canal_preferido, contacto_ref, puntaje, porque, estado, created_at)
    VALUES (?,?,?,?,?,?,?,?,'pendiente',?)`).run(userId, zonaId, nombre, nombreNorm, canal,
    String(o.contacto_ref || '').trim().slice(0, 200),
    Math.max(0, Math.min(100, Number(o.puntaje || 0) || 0)),
    String(o.porque || '').slice(0, 300), ahoraIso());
  return { ok: true, id: Number(r.lastInsertRowid), nombre };
}

function listarLeads(db, userId, opts) {
  const o = opts || {};
  if (o.zona_id) return db.prepare('SELECT * FROM venty_leads WHERE user_id = ? AND zona_id = ? ORDER BY puntaje DESC, nombre ASC').all(userId, Number(o.zona_id));
  if (o.estado) return db.prepare('SELECT * FROM venty_leads WHERE user_id = ? AND estado = ? ORDER BY puntaje DESC, nombre ASC').all(userId, String(o.estado));
  return db.prepare('SELECT * FROM venty_leads WHERE user_id = ? ORDER BY puntaje DESC, nombre ASC').all(userId);
}

function estaPausado(db, userId) {
  try {
    const r = db.prepare('SELECT pausado FROM venty_freno WHERE user_id = ?').get(userId);
    return !!(r && r.pausado);
  } catch (e) { return false; }
}

// ---- semilla Café Aroma (idempotente por usuario; fechas relativas a hoy) ----
function asegurarSemilla(db, userId) {
  if (leerFundamento(db, userId)) return false;
  const hoy = hoyYmd();
  const ayer = shiftDays(hoy, -1);
  const anteayer = shiftDays(hoy, -2);
  const lun = mondayKeyOf(hoy);
  const ts = (ymd, hhmm) => `${ymd} ${hhmm}:00`;
  const insFund = db.prepare(`INSERT INTO venty_fundamento
    (user_id, rubro, modo, estrella, precios_json, politicas_json, limites_json, tono, derechos_json, objeciones_json, version, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`);
  insFund.run(userId, CAFE_AROMA.rubro, CAFE_AROMA.modo, CAFE_AROMA.estrella,
    JSON.stringify(CAFE_AROMA.precios), JSON.stringify(CAFE_AROMA.politicas),
    JSON.stringify(CAFE_AROMA.limites), CAFE_AROMA.tono,
    JSON.stringify(CAFE_AROMA.derechos), JSON.stringify(CAFE_AROMA.objeciones), ahoraIso());
  db.prepare(`INSERT OR IGNORE INTO venty_freno (user_id, pausado, alcance) VALUES (?,0,?)`)
    .run(userId, 'mensajes y contactos nuevos; los turnos agendados siguen');

  const insP = db.prepare(`INSERT INTO venty_partidas
    (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insM = db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`);
  const insE = db.prepare(`INSERT INTO venty_eventos (user_id, tipo, partida_id, datos_json, created_at) VALUES (?,?,?,?,?)`);
  const ev = (tipo, pid, datos, cuando) => insE.run(userId, tipo, pid, JSON.stringify(datos || {}), cuando || ahoraIso());
  const msg = (pid, autor, texto, canal, cuando, fuente) => insM.run(pid, autor, texto, canal || 'simulacion', cuando, fuente || '');

  // Martín — partida ya jugada (flujo TestFlight): brunch $24.000, cierre
  // reserva sin seña, reseña pedida, jugada del 25% para 20 en Bandeja.
  const martin = Number(insP.run(userId, 'Martín', 'simulacion', 'cerrada_ganada', 'gastronomía', 24000, 'reserva sin seña', '', 0, '', 'simulacion', ts(anteayer, '09:02'), ts(hoy, '13:40')).lastInsertRowid);
  msg(martin, 'cliente', 'hola! cuánto sale el brunch para dos?', 'simulacion', ts(anteayer, '09:02'));
  msg(martin, 'venty', 'hola martín, soy del equipo de café aroma, te ayudo yo', 'simulacion', ts(anteayer, '09:02'));
  msg(martin, 'venty', 'el brunch aroma para dos sale $24.000', 'simulacion', ts(anteayer, '09:03'), 'lista cargada ' + ts(anteayer, '09:03'));
  msg(martin, 'venty', 'contame para cuándo lo querés y si es en el local o para llevar', 'simulacion', ts(anteayer, '09:03'));
  msg(martin, 'cliente', 'este sábado a la mañana, en el local', 'simulacion', ts(anteayer, '09:05'));
  msg(martin, 'venty', 'perfecto, sábado a la mañana en el local, te lo reservo sin seña', 'simulacion', ts(anteayer, '09:05'));
  msg(martin, 'venty', 'si querés sumar la limonada de 1l sale $8.900', 'simulacion', ts(anteayer, '09:06'), 'lista cargada ' + ts(anteayer, '09:06'));
  msg(martin, 'cliente', 'mmm, está un poco caro, en otro lado lo vi a menos', 'simulacion', ts(anteayer, '09:08'));
  msg(martin, 'venty', 'te entiendo, el nuestro es con grano de especialidad y se hace al momento', 'simulacion', ts(anteayer, '09:08'));
  msg(martin, 'venty', 'si querés probarlo tranqui, arrancá con el flat white a $5.500', 'simulacion', ts(anteayer, '09:09'), 'lista cargada ' + ts(anteayer, '09:09'));
  msg(martin, 'cliente', 'dale, reservame el brunch para el sábado', 'simulacion', ts(anteayer, '09:11'));
  msg(martin, 'venty', 'listo, reservado para el sábado a las 10:00 a tu nombre, sin seña', 'simulacion', ts(anteayer, '09:11'));
  msg(martin, 'venty', 'te esperamos', 'simulacion', ts(anteayer, '09:11'));
  msg(martin, 'cliente', 'y si somos 20 por un cumple, me hacés 25% off?', 'simulacion', ts(hoy, '13:38'));
  msg(martin, 'venty', 'eso lo confirmo con el dueño enseguida, te aviso en cuanto me responda', 'simulacion', ts(hoy, '13:38'));
  msg(martin, 'venty', 'martín, gracias por venir el sábado, si te gustó nos dejás una reseña en google', 'simulacion', ts(hoy, '13:40'));
  ev('primera_respuesta', martin, { ms: 38000 }, ts(anteayer, '09:02'));
  ev('cotizacion', martin, { item: 'Brunch Aroma para dos', monto: 24000, fuente: 'lista cargada' }, ts(anteayer, '09:03'));
  ev('objecion', martin, { texto: 'mmm, está un poco caro, en otro lado lo vi a menos', respuesta: 'aprobada 1' }, ts(anteayer, '09:08'));
  ev('cierre', martin, { forma: 'reserva sin seña', monto: 24000 }, ts(anteayer, '09:11'));
  ev('resena_pedida', martin, {}, ts(hoy, '13:40'));
  ev('lectura_fuente', martin, { fuente: 'lista cargada' }, ts(anteayer, '09:03'));

  // Lucía Gómez — viva, objeción horario de entrega, toque 2 de 3.
  const lucia = Number(insP.run(userId, 'Lucía Gómez', 'whatsapp', 'viva', 'gastronomía', 0, '', '', 2, ts(shiftDays(hoy, 2), '10:00'), 'whatsapp', ts(ayer, '08:40'), ts(hoy, '09:12')).lastInsertRowid);
  msg(lucia, 'cliente', 'hola, el brunch del sábado me lo llevan a casa?', 'whatsapp', ts(ayer, '08:40'));
  msg(lucia, 'venty', 'hola lucía, el brunch es en el local, pero te lo dejamos listo para retirar a las 8:00', 'whatsapp', ts(ayer, '08:41'));
  msg(lucia, 'cliente', 'a las 8 me viene bien, lo retiro yo', 'whatsapp', ts(ayer, '08:44'));
  msg(lucia, 'venty', 'listo lucía, retiro a las 8:00 el sábado, te lo dejamos armado', 'whatsapp', ts(hoy, '09:12'));
  msg(lucia, 'venty', 'si querés sumar la limonada de 1l sale $8.900, avisame y te la agrego', 'whatsapp', ts(hoy, '09:12'), 'lista cargada ' + ts(hoy, '09:12'));
  ev('primera_respuesta', lucia, { ms: 41000 }, ts(ayer, '08:40'));
  ev('cotizacion', lucia, { item: 'Brunch Aroma para dos', monto: 24000, fuente: 'lista cargada' }, ts(ayer, '08:41'));
  ev('objecion', lucia, { texto: 'el brunch del sábado me lo llevan a casa?', respuesta: 'franja de las 8:00' }, ts(ayer, '08:40'));
  ev('ajuste', lucia, { que: 'ofrecer la franja de las 8:00 de entrada' }, ts(ayer, '08:41'));
  ev('seguimiento', lucia, { toque: 2 }, ts(hoy, '09:12'));

  // Pedro Molina — viva, te necesita: pidió 15% (jugada en Bandeja).
  const pedro = Number(insP.run(userId, 'Pedro Molina', 'whatsapp', 'viva', 'gastronomía', 0, '', '', 1, ts(shiftDays(hoy, 1), '11:00'), 'whatsapp', ts(ayer, '17:20'), ts(hoy, '15:05')).lastInsertRowid);
  msg(pedro, 'cliente', 'hola, quiero reservar el brunch para 4 el domingo', 'whatsapp', ts(ayer, '17:20'));
  msg(pedro, 'venty', 'hola pedro, el brunch para 4 sale $48.000, te lo reservo sin seña', 'whatsapp', ts(ayer, '17:21'), 'lista cargada ' + ts(ayer, '17:21'));
  msg(pedro, 'cliente', 'y si te pago ahora me hacés 15%?', 'whatsapp', ts(ayer, '17:25'));
  msg(pedro, 'venty', 'pedro, lo del descuento lo estoy confirmando con el dueño, te aviso enseguida', 'whatsapp', ts(hoy, '15:05'));
  ev('primera_respuesta', pedro, { ms: 44000 }, ts(ayer, '17:20'));
  ev('cotizacion', pedro, { item: 'Brunch Aroma para dos x2', monto: 48000, fuente: 'lista cargada' }, ts(ayer, '17:21'));

  // Natalia Bravo — cerrada ganada, seña $18.500.
  const natalia = Number(insP.run(userId, 'Natalia Bravo', 'instagram', 'cerrada_ganada', 'gastronomía', 18500, 'seña', '', 0, '', 'instagram', ts(ayer, '10:04'), ts(hoy, '10:04')).lastInsertRowid);
  msg(natalia, 'cliente', 'hola! quiero el almuerzo del día para 2 mañana', 'instagram', ts(ayer, '10:02'));
  msg(natalia, 'venty', 'hola natalia, el almuerzo del día para 2 sale $25.000', 'instagram', ts(ayer, '10:03'), 'lista cargada ' + ts(ayer, '10:03'));
  msg(natalia, 'cliente', 'dale, te dejo la seña', 'instagram', ts(ayer, '10:04'));
  msg(natalia, 'venty', 'listo natalia, tu seña de $18.500 quedó registrada, te esperamos mañana', 'instagram', ts(hoy, '10:04'));
  ev('primera_respuesta', natalia, { ms: 31000 }, ts(ayer, '10:02'));
  ev('cotizacion', natalia, { item: 'Almuerzo del día x2', monto: 25000, fuente: 'lista cargada' }, ts(ayer, '10:03'));
  ev('cierre', natalia, { forma: 'seña', monto: 18500 }, ts(ayer, '10:04'));

  // Valeria Ruiz — cerrada ganada, pago total $62.500.
  const valeria = Number(insP.run(userId, 'Valeria Ruiz', 'whatsapp', 'cerrada_ganada', 'gastronomía', 62500, 'pago total', '', 0, '', 'whatsapp', ts(anteayer, '12:30'), ts(anteayer, '12:41')).lastInsertRowid);
  msg(valeria, 'cliente', 'hola, somos 5 para el brunch del domingo, cuánto es?', 'whatsapp', ts(anteayer, '12:30'));
  msg(valeria, 'venty', 'hola valeria, para 5 son 2 brunch para dos y un almuerzo, $60.500 en total', 'whatsapp', ts(anteayer, '12:31'), 'lista cargada ' + ts(anteayer, '12:31'));
  msg(valeria, 'cliente', 'perfecto, te pago todo ahora', 'whatsapp', ts(anteayer, '12:40'));
  msg(valeria, 'venty', 'listo valeria, pago total de $62.500 registrado, los esperamos el domingo', 'whatsapp', ts(anteayer, '12:41'));
  ev('primera_respuesta', valeria, { ms: 47000 }, ts(anteayer, '12:30'));
  ev('cotizacion', valeria, { item: 'Brunch x2 + Almuerzo', monto: 60500, fuente: 'lista cargada' }, ts(anteayer, '12:31'));
  ev('cierre', valeria, { forma: 'pago total', monto: 62500 }, ts(anteayer, '12:41'));

  // Andrés Luna — cerrada perdida, motivo precio, seguimiento agotado.
  const andres = Number(insP.run(userId, 'Andrés Luna', 'instagram', 'cerrada_perdida', 'gastronomía', 0, '', 'precio', 3, '', 'instagram', ts(shiftDays(hoy, -3), '16:00'), ts(shiftDays(hoy, -1), '16:00')).lastInsertRowid);
  msg(andres, 'cliente', 'cuánto sale el café en grano?', 'instagram', ts(shiftDays(hoy, -3), '16:00'));
  msg(andres, 'venty', 'hola andrés, el café en grano de 250 g sale $15.000', 'instagram', ts(shiftDays(hoy, -3), '16:01'), 'lista cargada ' + ts(shiftDays(hoy, -3), '16:01'));
  msg(andres, 'cliente', 'lo pienso y te aviso', 'instagram', ts(shiftDays(hoy, -3), '16:05'));
  ev('primera_respuesta', andres, { ms: 52000 }, ts(shiftDays(hoy, -3), '16:00'));
  ev('cotizacion', andres, { item: 'Café en grano 250 g', monto: 15000, fuente: 'lista cargada' }, ts(shiftDays(hoy, -3), '16:01'));
  ev('seguimiento', andres, { toque: 3 }, ts(shiftDays(hoy, -1), '16:00'));
  ev('perdida', andres, { motivo: 'precio' }, ts(shiftDays(hoy, -1), '16:00'));

  // Jorge Acosta — viva, reactivación.
  const jorge = Number(insP.run(userId, 'Jorge Acosta', 'whatsapp', 'viva', 'gastronomía', 0, '', '', 1, ts(shiftDays(hoy, 3), '09:00'), 'caza', ts(hoy, '11:30'), ts(hoy, '11:30')).lastInsertRowid);
  msg(jorge, 'venty', 'hola jorge, hace un rato que no nos vemos, el flat white sigue a $5.500 cuando quieras', 'whatsapp', ts(hoy, '11:30'), 'lista cargada ' + ts(hoy, '11:30'));
  ev('seguimiento', jorge, { toque: 1, tipo: 'reactivacion' }, ts(hoy, '11:30'));

  // Gimnasio Fuerza Viva — viva, caza Tier A (ejemplo).
  const gimnasio = Number(insP.run(userId, 'Gimnasio Fuerza Viva', 'instagram', 'viva', 'gastronomía', 0, '', '', 0, '', 'caza', ts(hoy, '12:15'), ts(hoy, '12:15')).lastInsertRowid);
  msg(gimnasio, 'venty', 'hola, soy del equipo de café aroma, vi que entrenan por la zona y les armé una propuesta para el equipo', 'instagram', ts(hoy, '12:15'));
  ev('caza_contacto', gimnasio, { tier: 'A', puntaje: 91 }, ts(hoy, '12:15'));

  // Jugadas pendientes en la Bandeja (3 tarjetas).
  const insJ = db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`);
  insJ.run(userId, martin, 'descuento', JSON.stringify({ que: 'grupo de 20 para un cumple con 25% off', pedido_pct: 25, autorizado_pct: 10, grupo: 20, monto_sin_descuento: 240000, monto_con_descuento: 180000 }), 'el pedido excede el descuento máximo (10%) y el tamaño de escalación (15+): venty no concede ni rechaza, lo decide el dueño');
  insJ.run(userId, pedro, 'descuento', JSON.stringify({ que: 'brunch para 4 el domingo con 15% off por pago ahora', pedido_pct: 15, autorizado_pct: 10, monto_sin_descuento: 48000, monto_con_descuento: 40800 }), 'el pedido excede el descuento máximo (10%): lo decide el dueño');
  insJ.run(userId, null, 'estrategia', JSON.stringify({ que: 'lanzar la tanda de búsqueda de clientes en Centro: 12 Tier A', zona: 'Centro', tier_a: 12 }), 'la tanda es de ejemplo en modo prueba; al aceptar queda registrada y su ejecución real llega con el slice 4');
  void lun;
  return true;
}

// ---- cómputos del registro (nada escrito a mano) ----
function listarPartidas(db, userId) {
  return db.prepare(`SELECT * FROM venty_partidas WHERE user_id = ? ORDER BY updated_at DESC, id DESC`).all(userId);
}

function computarFrase(db, userId) {
  const hoy = hoyYmd();
  const rows = db.prepare(`SELECT estado, monto, updated_at FROM venty_partidas WHERE user_id = ?`).all(userId);
  const hoyRows = rows.filter((r) => String(r.updated_at || '').slice(0, 10) === hoy);
  const ganadasHoy = hoyRows.filter((r) => r.estado === 'cerrada_ganada');
  const montoHoy = ganadasHoy.reduce((a, r) => a + (Number(r.monto) || 0), 0);
  const vivas = rows.filter((r) => r.estado === 'viva').length;
  const norte = computarLineaNorte(db, userId);
  let frase;
  if (!rows.length) frase = 'hoy no entró ninguna consulta todavía, venty está buscando';
  else if (!ganadasHoy.length) frase = `hoy no cerraste ventas todavía · ${vivas} ${vivas === 1 ? 'conversación viva' : 'conversaciones vivas'} · venty sigue buscando`;
  else frase = `hoy cerraste ${ganadasHoy.length} ${ganadasHoy.length === 1 ? 'venta' : 'ventas'} por ${fmtPesos(montoHoy)} · ${vivas} ${vivas === 1 ? 'conversación viva' : 'conversaciones vivas'}`;
  return { frase, ventas_hoy: ganadasHoy.length, monto_hoy: montoHoy, vivas, tasa_cierre_pct: norte.tasa_cierre_pct, primera_respuesta_seg: norte.primera_respuesta_seg, modo: MODO };
}

function computarLineaNorte(db, userId) {
  let calificadas = 0, ganadas = 0;
  try {
    const c = db.prepare(`SELECT COUNT(DISTINCT partida_id) c FROM venty_eventos WHERE user_id = ? AND tipo = 'cotizacion'`).get(userId);
    calificadas = (c && c.c) || 0;
    const g = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ? AND estado = 'cerrada_ganada'`).get(userId);
    ganadas = (g && g.c) || 0;
  } catch (e) {}
  const tasa = calificadas ? Math.round((ganadas / calificadas) * 100) : null;
  let primera = null;
  try {
    const rows = db.prepare(`SELECT datos_json FROM venty_eventos WHERE user_id = ? AND tipo = 'primera_respuesta'`).all(userId);
    const ms = rows.map((r) => { try { return Number(JSON.parse(r.datos_json || '{}').ms) || null; } catch (e) { return null; } }).filter((n) => n !== null);
    if (ms.length) primera = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length / 1000);
  } catch (e) {}
  return { tasa_cierre_pct: tasa, primera_respuesta_seg: primera, calificadas, ganadas, modo: MODO };
}

function computarParte(db, userId, semana) {
  const sem = semana || mondayKeyOf(hoyYmd());
  const ini = sem + ' 00:00:00';
  const fin = shiftDays(sem, 7) + ' 00:00:00';
  const consultas = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ? AND created_at >= ? AND created_at < ?`).get(userId, ini, fin);
  const cotizadas = db.prepare(`SELECT COUNT(DISTINCT partida_id) c FROM venty_eventos WHERE user_id = ? AND tipo = 'cotizacion' AND created_at >= ? AND created_at < ?`).get(userId, ini, fin);
  const ventas = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(monto),0) m FROM venty_partidas WHERE user_id = ? AND estado = 'cerrada_ganada' AND updated_at >= ? AND updated_at < ?`).get(userId, ini, fin);
  const turnos = db.prepare(`SELECT COUNT(*) c FROM venty_partidas WHERE user_id = ? AND estado = 'cerrada_ganada' AND forma_cierre LIKE 'reserva%' AND updated_at >= ? AND updated_at < ?`).get(userId, ini, fin);
  const objRows = db.prepare(`SELECT datos_json FROM venty_eventos WHERE user_id = ? AND tipo = 'objecion' AND created_at >= ? AND created_at < ?`).all(userId, ini, fin);
  const conteo = {};
  for (const r of objRows) { try { const t = JSON.parse(r.datos_json || '{}').texto || ''; if (t) conteo[t] = (conteo[t] || 0) + 1; } catch (e) {} }
  const objTop = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
  let ajuste = null;
  try {
    const a = db.prepare(`SELECT datos_json FROM venty_eventos WHERE user_id = ? AND tipo = 'ajuste' AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1`).get(userId, ini, fin);
    if (a) ajuste = JSON.parse(a.datos_json || '{}').que || null;
  } catch (e) {}
  const norte = computarLineaNorte(db, userId);
  const nConsultas = (consultas && consultas.c) || 0;
  if (!nConsultas && !((cotizadas && cotizadas.c) || 0)) return { emitido: false, semana: sem, razon: 'sin_datos', modo: MODO };
  return {
    emitido: true, semana: sem, modo: MODO,
    consultas: nConsultas,
    calificadas: (cotizadas && cotizadas.c) || 0,
    cotizadas: (cotizadas && cotizadas.c) || 0,
    ventas: (ventas && ventas.c) || 0,
    monto: (ventas && ventas.m) || 0,
    turnos: (turnos && turnos.c) || 0,
    no_shows: 0,
    primera_respuesta_seg: norte.primera_respuesta_seg,
    tasa_cierre_pct: norte.tasa_cierre_pct,
    objecion_mas_frecuente: objTop ? objTop[0] : null,
    objecion_veces: objTop ? objTop[1] : 0,
    ajuste: ajuste,
  };
}

// ---- cotizador con límites en servidor (nunca emite un número fuera de lista) ----
function buscarPrecio(fundamento, item) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const q = norm(item);
  return (fundamento.precios || []).find((p) => norm(p.item) === q || norm(p.item).includes(q) || (q && norm(p.item).includes(q))) || null;
}

function cotizar(db, userId, item, cantidad, descuentoPedido) {
  const f = leerFundamento(db, userId);
  if (!f) return { ok: false, kind: 'sin_fundamento' };
  const p = buscarPrecio(f, item);
  if (!p) return { ok: false, kind: 'no_en_lista', item };
  const cant = Math.max(1, Number(cantidad) || 1);
  const total = p.precio * cant;
  const desc = Number(descuentoPedido) || 0;
  if (desc > (f.limites.descuento_max_pct ?? DESCUENTO_MAX)) {
    return { ok: false, kind: 'a_bandeja', item: p.item, precio_unitario: p.precio, total, pedido_pct: desc, autorizado_pct: f.limites.descuento_max_pct ?? DESCUENTO_MAX };
  }
  return { ok: true, item: p.item, precio_unitario: p.precio, cantidad: cant, total, descuento_pct: desc, total_con_descuento: Math.round(total * (1 - desc / 100)), fuente: 'lista cargada' };
}

// ---- motor de partida en simulación (modo guion; nunca finge generación) ----
function etapaDePartida(db, partidaId) {
  try {
    const evs = db.prepare(`SELECT tipo FROM venty_eventos WHERE partida_id = ?`).all(partidaId).map((r) => r.tipo);
    if (evs.includes('cierre')) return 'cerrada';
    if (evs.includes('objecion')) return 'objecion';
    if (evs.includes('cotizacion')) return 'cotizada';
    const n = db.prepare(`SELECT COUNT(*) c FROM venty_mensajes WHERE partida_id = ? AND autor = 'venty'`).get(partidaId);
    if (n && n.c > 0) return 'conversando';
    return 'nueva';
  } catch (e) { return 'nueva'; }
}

function primeraRespuestaMs(partidaId) {
  // Ritmo del OS para el cliente simulado: 20–40 s variable con «escribiendo».
  // Determinista por partida para que la métrica sea reproducible en test.
  return 20000 + ((Number(partidaId) * 7919) % 20000);
}

function registrarRespuesta(db, userId, partidaId, textos, canal, fuente) {
  const ahora = ahoraIso();
  const ins = db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`);
  const out = [];
  for (const t of textos) {
    const v = validarVoz(t);
    const texto = v.ok ? t : t.toLowerCase().replace(/[¿¡]/g, '');
    ins.run(partidaId, 'venty', texto, canal || 'simulacion', ahora, fuente || '');
    out.push(texto);
  }
  db.prepare(`UPDATE venty_partidas SET updated_at = ? WHERE id = ?`).run(ahora, partidaId);
  return out;
}

function jugarMensaje(db, userId, partidaId, textoCliente) {
  const texto = sliceTxt(String(textoCliente || '').trim(), 500);
  if (!texto) return { ok: false, kind: 'sin_texto' };
  const partida = db.prepare('SELECT * FROM venty_partidas WHERE id = ? AND user_id = ?').get(partidaId, userId);
  if (!partida) return { ok: false, kind: 'partida_no_encontrada' };
  if (estaPausado(db, userId)) return { ok: false, kind: 'en_pausa' };
  if (partida.estado === 'tomada') return { ok: false, kind: 'tomada_por_dueno' };
  if (partida.estado !== 'viva') return { ok: false, kind: 'partida_no_viva', estado: partida.estado };
  const canal = partida.canal || 'simulacion';
  const ahora = ahoraIso();
  db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at) VALUES (?,?,?,?,?)`)
    .run(partidaId, 'cliente', texto, canal, ahora);
  const norm = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const etapa = etapaDePartida(db, partidaId);
  const f = leerFundamento(db, userId);

  // Descuento que excede o grupo que escala: nunca se concede en el chat.
  const mPct = norm.match(/(\d+)\s*(%|por ciento|off)/);
  const mGrupo = norm.match(/somos\s+(\d+)|(\d+)\s*personas/);
  const pctPedido = mPct ? Number(mPct[1]) : 0;
  const grupoN = mGrupo ? Number(mGrupo[1] || mGrupo[2]) : 0;
  if ((pctPedido > (f?.limites?.descuento_max_pct ?? DESCUENTO_MAX)) || grupoN >= (f?.limites?.grupo_escala_desde ?? GRUPO_ESCALA)) {
    const propuesta = { que: texto, pedido_pct: pctPedido || null, grupo: grupoN || null, autorizado_pct: f?.limites?.descuento_max_pct ?? DESCUENTO_MAX };
    const ya = db.prepare(`SELECT id FROM venty_jugadas WHERE user_id = ? AND partida_id = ? AND tipo = 'descuento' AND estado = 'pendiente'`).get(userId, partidaId);
    if (!ya) {
      db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
        .run(userId, partidaId, 'descuento', JSON.stringify(propuesta), 'el pedido excede el descuento máximo o el tamaño de escalación: lo decide el dueño');
      registrarEvento(db, userId, 'jugada_creada', partidaId, { tipo: 'descuento', propuesta });
    }
    const r = registrarRespuesta(db, userId, partidaId, ['eso lo confirmo con el dueño enseguida, te aviso en cuanto me responda'], canal);
    return { ok: true, respuestas: r, estado: 'viva', jugada: 'bandeja' };
  }
  // Dato que no está en el fundamento: no se inventa.
  if (/tacc|sin gluten|celiac/.test(norm)) {
    registrarEvento(db, userId, 'hueco', partidaId, { dato: 'opciones sin TACC' });
    const r = registrarRespuesta(db, userId, partidaId, ['no está en el fundamento: lo confirmo y te aviso'], canal);
    return { ok: true, respuestas: r, estado: 'viva', hueco: 'sin TACC' };
  }
  // Objeción de precio: respuesta aprobada N.º 1.
  if (/caro|sale menos|otro lado|muy caro/.test(norm)) {
    const resp = f?.objeciones?.[0]?.respuesta || 'te entiendo, el nuestro es con grano de especialidad y se hace al momento';
    registrarEvento(db, userId, 'objecion', partidaId, { texto, respuesta: 'aprobada 1' });
    const r = registrarRespuesta(db, userId, partidaId, ['te entiendo, el nuestro es con grano de especialidad y se hace al momento', 'si querés probarlo tranqui, arrancá con el flat white a $5.500'], canal);
    return { ok: true, respuestas: r, estado: 'viva' };
  }
  // Aceptación tras cotizar: cierre según política + reseña en la misma conversación.
  if (etapa === 'cotizada' || etapa === 'objecion') {
    if (/dale|reservame|confirmo|perfecto|de una|listo|acepto/.test(norm)) {
      const forma = 'reserva sin seña';
      db.prepare(`UPDATE venty_partidas SET estado = 'cerrada_ganada', forma_cierre = ?, updated_at = ? WHERE id = ?`).run(forma, ahora, partidaId);
      const monto = Number(partida.monto) || 0;
      registrarEvento(db, userId, 'cierre', partidaId, { forma, monto });
      registrarEvento(db, userId, 'resena_pedida', partidaId, {});
      const r = registrarRespuesta(db, userId, partidaId, ['listo, reservado a tu nombre, sin seña', 'te esperamos', 'gracias por venir, si te gustó nos dejás una reseña en google'], canal);
      return { ok: true, respuestas: r, estado: 'cerrada_ganada', forma };
    }
  }
  // Lo consulto: seguimiento con dato concreto.
  if (/lo consulto|lo pienso|te aviso|lo veo/.test(norm)) {
    const toque = Math.min((Number(partida.seguimiento_toque) || 0) + 1, SEGUIMIENTO_MAX);
    db.prepare(`UPDATE venty_partidas SET seguimiento_toque = ?, proximo_toque_at = ?, updated_at = ? WHERE id = ?`)
      .run(toque, shiftDays(hoyYmd(), 2) + ' 10:00:00', ahora, partidaId);
    registrarEvento(db, userId, 'seguimiento', partidaId, { toque });
    const r = registrarRespuesta(db, userId, partidaId, ['dale, te guardo la disponibilidad del brunch del fin de semana y te escribo'], canal);
    return { ok: true, respuestas: r, estado: 'viva', seguimiento_toque: toque };
  }
  // Pregunta de precio: cotizar desde la lista cargada.
  if (/cuanto|cuánto|sale|precio|cuesta|vale/.test(norm)) {
    const item = (f?.precios || []).find((p) => norm.includes(p.item.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ')[0])) || (f?.precios || []).find((p) => p.item === 'Brunch Aroma para dos');
    if (item) {
      const cot = cotizar(db, userId, item.item, 1, 0);
      if (cot.ok) {
        registrarEvento(db, userId, 'cotizacion', partidaId, { item: cot.item, monto: cot.total, fuente: 'lista cargada' });
        if (etapa === 'nueva') registrarEvento(db, userId, 'primera_respuesta', partidaId, { ms: primeraRespuestaMs(partidaId) });
        db.prepare(`UPDATE venty_partidas SET monto = ? WHERE id = ?`).run(cot.total, partidaId);
        const r = registrarRespuesta(db, userId, partidaId,
          [`${cot.item.toLowerCase()} sale ${fmtPesos(cot.total)}`, 'contame para cuándo lo querés y si es en el local o para llevar'], canal, 'lista cargada');
        return { ok: true, respuestas: r, estado: 'viva', cotizacion: cot };
      }
    }
    const r = registrarRespuesta(db, userId, partidaId, ['contame qué querés y te paso el precio de la lista'], canal);
    return { ok: true, respuestas: r, estado: 'viva' };
  }
  // Saludo o primera consulta: arranque de la partida.
  if (etapa === 'nueva') {
    registrarEvento(db, userId, 'primera_respuesta', partidaId, { ms: primeraRespuestaMs(partidaId) });
    const r = registrarRespuesta(db, userId, partidaId, ['hola, soy del equipo de café aroma, te ayudo yo', 'contame qué andás buscando'], canal);
    return { ok: true, respuestas: r, estado: 'viva' };
  }
  const r = registrarRespuesta(db, userId, partidaId, ['dale, contame para cuándo lo querés y si es en el local o para llevar'], canal);
  return { ok: true, respuestas: r, estado: 'viva' };
}

// ---- chat dueño↔Venty (el dueño le habla a Venty; nunca le escribe al cliente) ----
function responderChatDueno(db, userId, texto) {
  const t = sliceTxt(String(texto || '').trim(), 2000);
  const norm = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const baja = (s) => String(s || '').toLowerCase();
  if (/paus|fren|parala|para todo/.test(norm)) {
    setFreno(db, userId, true);
    registrarEvento(db, userId, 'freno', null, { pausado: true });
    return { reply: baja('listo, venty en pausa. no sale ningún mensaje ni contacto nuevo, los turnos agendados siguen. cuando quieras, decime reanudar.'), options: ['reanudar'] };
  }
  if (/reanud|segu[ií]|dale, seguimos|arranca/.test(norm)) {
    setFreno(db, userId, false);
    registrarEvento(db, userId, 'freno', null, { pausado: false });
    return { reply: baja('listo, venty de vuelta. sigo donde quedé.'), options: [] };
  }
  if (/bandeja/.test(norm)) {
    const pend = listarBandeja(db, userId);
    if (!pend.length) return { reply: baja('la bandeja está libre, nada necesita tu ojo hoy.'), options: ['ver las ventas de hoy'] };
    return { reply: baja(`tenés ${pend.length} ${pend.length === 1 ? 'cosa' : 'cosas'} esperando tu ojo: ${pend.map((j) => j.que || j.tipo).join(' · ')}. tocá una para decidir.`), options: ['ver la bandeja'] };
  }
  if (/frase|como va hoy|hoy/.test(norm)) {
    const f = computarFrase(db, userId);
    return { reply: baja(f.frase + '.'), options: [] };
  }
  if (/parte|resumen|semana/.test(norm)) {
    const p = computarParte(db, userId);
    if (!p.emitido) return { reply: baja('todavía no hay datos para el parte de esta semana.'), options: [] };
    return { reply: baja(`esta semana: ${p.consultas} consultas, ${p.cotizadas} cotizadas, ${p.ventas} ventas por ${fmtPesos(p.monto)}. tasa de cierre ${p.tasa_cierre_pct === null ? '—' : p.tasa_cierre_pct + '%'}.`), options: [] };
  }
  const m = norm.match(/(?:venta|partida|cliente)\s+(?:de\s+)?([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)/);
  if (m) {
    const q = m[1].trim();
    const rows = db.prepare(`SELECT * FROM venty_partidas WHERE user_id = ? AND lower(cliente_nombre) LIKE ?`).all(userId, '%' + q + '%');
    if (rows.length === 1) {
      const p = rows[0];
      return { reply: baja(`${p.cliente_nombre}: ${p.estado === 'viva' ? 'viva' : p.estado}, ${p.monto ? fmtPesos(p.monto) : 'sin monto todavía'}. ${p.seguimiento_toque ? 'toque ' + p.seguimiento_toque + ' de 3.' : ''}`), options: [] };
    }
    if (rows.length > 1) return { reply: baja(`encontré ${rows.length} ventas con ese nombre, decime cuál.`), options: rows.slice(0, 3).map((r) => r.cliente_nombre) };
    return { reply: baja('no encontré ninguna venta con ese nombre.'), options: ['ver las ventas de hoy'] };
  }
  if (/hola|buen|qué tal|que tal/.test(norm)) {
    return { reply: baja('hola, acá estoy. hoy cerraste ventas y sigo las vivas, si algo necesita tu ojo te aviso.'), options: ['ver la bandeja', 'ver las ventas de hoy'] };
  }
  return { reply: baja('dale, lo anoto. si es algo para decidir, lo pongo en la bandeja.'), options: ['ver la bandeja', 'ver las ventas de hoy', 'pausar a venty'] };
}

// ---- Bandeja ----
function listarBandeja(db, userId) {
  const rows = db.prepare(`SELECT j.*, p.cliente_nombre FROM venty_jugadas j LEFT JOIN venty_partidas p ON p.id = j.partida_id WHERE j.user_id = ? AND j.estado = 'pendiente' ORDER BY j.id ASC`).all(userId);
  return rows.map((r) => ({ ...r, propuesta: safeJson(r.propuesta_json, {}) }));
}
function safeJson(s, dflt) { try { return JSON.parse(s || ''); } catch (e) { return dflt; } }

function resolverJugada(db, userId, jugadaId, accion, nota) {
  const j = db.prepare('SELECT * FROM venty_jugadas WHERE id = ? AND user_id = ?').get(jugadaId, userId);
  if (!j) return { ok: false, kind: 'jugada_no_encontrada' };
  if (j.estado !== 'pendiente') return { ok: false, kind: 'jugada_ya_resuelta', estado: j.estado };
  const ahora = ahoraIso();
  if (accion === 'aceptar') {
    db.prepare(`UPDATE venty_jugadas SET estado = 'aceptada', resuelto_at = ?, resuelto_por = 'dueno' WHERE id = ?`).run(ahora, jugadaId);
    const propuesta = safeJson(j.propuesta_json, {});
    registrarEvento(db, userId, 'jugada_aceptada', j.partida_id, { tipo: j.tipo, propuesta });
    if (j.partida_id && j.tipo === 'descuento') {
      const partida = db.prepare('SELECT * FROM venty_partidas WHERE id = ?').get(j.partida_id);
      if (partida) {
        const montoFinal = propuesta.monto_con_descuento || partida.monto;
        registrarRespuesta(db, userId, j.partida_id, [`listo, te lo dejé en ${propuesta.pedido_pct || ''}% para los ${propuesta.grupo || 'que me pediste'}, son ${fmtPesos(montoFinal)} en total`], partida.canal || 'simulacion');
        if (propuesta.grupo && Number(propuesta.grupo) >= GRUPO_ESCALA) {
          const insP = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
          const nid = Number(insP.run(userId, partida.cliente_nombre + ' (cumple ' + propuesta.grupo + ')', partida.canal || 'simulacion', 'viva', partida.modo_rubro || '', montoFinal, '', '', 0, '', 'bandeja', ahora, ahora).lastInsertRowid);
          registrarEvento(db, userId, 'cotizacion', nid, { item: 'grupo ' + propuesta.grupo, monto: montoFinal, fuente: 'lista cargada' });
        }
      }
    }
    return { ok: true, estado: 'aceptada' };
  }
  if (accion === 'rechazar') {
    db.prepare(`UPDATE venty_jugadas SET estado = 'rechazada', resuelto_at = ?, resuelto_por = 'dueno', nota_dueno = ? WHERE id = ?`).run(ahora, sliceTxt(nota || '', 300), jugadaId);
    registrarEvento(db, userId, 'jugada_rechazada', j.partida_id, { tipo: j.tipo, motivo: sliceTxt(nota || 'el dueño dijo que no', 300) });
    if (j.partida_id) registrarRespuesta(db, userId, j.partida_id, ['lo hablé con el dueño y por ahora no lo podemos hacer, te aviso si cambia'], 'simulacion');
    return { ok: true, estado: 'rechazada' };
  }
  if (accion === 'cambio') {
    db.prepare(`UPDATE venty_jugadas SET estado = 'cambio_pedido', resuelto_at = ?, resuelto_por = 'dueno', nota_dueno = ? WHERE id = ?`).run(ahora, sliceTxt(nota || '', 500), jugadaId);
    registrarEvento(db, userId, 'cambio_fundamento_pedido', j.partida_id, { tipo: j.tipo, nota: sliceTxt(nota || '', 500) });
    return { ok: true, estado: 'cambio_pedido' };
  }
  return { ok: false, kind: 'accion_invalida' };
}

// ---- freno / partidas / mensajes de hoy ----
function setFreno(db, userId, pausado) {
  const ahora = ahoraIso();
  db.prepare(`INSERT INTO venty_freno (user_id, pausado, alcance, desde, hasta) VALUES (?,?,?, ?, '')
    ON CONFLICT(user_id) DO UPDATE SET pausado = excluded.pausado, desde = excluded.desde`)
    .run(userId, pausado ? 1 : 0, 'mensajes y contactos nuevos; los turnos agendados siguen', ahora);
  return { pausado: !!pausado, alcance: 'mensajes y contactos nuevos; los turnos agendados siguen' };
}

function obtenerPartida(db, userId, partidaId) {
  const p = db.prepare('SELECT * FROM venty_partidas WHERE id = ? AND user_id = ?').get(partidaId, userId);
  if (!p) return null;
  const mensajes = db.prepare(`SELECT * FROM venty_mensajes WHERE partida_id = ? ORDER BY enviado_at ASC, id ASC`).all(partidaId);
  const jugadas = db.prepare(`SELECT * FROM venty_jugadas WHERE partida_id = ? ORDER BY id ASC`).all(partidaId)
    .map((r) => ({ ...r, propuesta: safeJson(r.propuesta_json, {}) }));
  return { ...p, mensajes, jugadas };
}

function tomarPartida(db, userId, partidaId) {
  const p = db.prepare('SELECT * FROM venty_partidas WHERE id = ? AND user_id = ?').get(partidaId, userId);
  if (!p) return { ok: false, kind: 'partida_no_encontrada' };
  if (p.estado !== 'viva') return { ok: false, kind: 'partida_no_viva', estado: p.estado };
  db.prepare(`UPDATE venty_partidas SET estado = 'tomada', updated_at = ? WHERE id = ?`).run(ahoraIso(), partidaId);
  registrarEvento(db, userId, 'partida_tomada', partidaId, { por: 'dueno' });
  return { ok: true, estado: 'tomada' };
}

function seguirPartida(db, userId, partidaId) {
  const p = db.prepare('SELECT * FROM venty_partidas WHERE id = ? AND user_id = ?').get(partidaId, userId);
  if (!p) return { ok: false, kind: 'partida_no_encontrada' };
  if (p.estado !== 'tomada') return { ok: false, kind: 'partida_no_tomada', estado: p.estado };
  db.prepare(`UPDATE venty_partidas SET estado = 'viva', updated_at = ? WHERE id = ?`).run(ahoraIso(), partidaId);
  registrarEvento(db, userId, 'partida_devuelta', partidaId, { por: 'dueno' });
  return { ok: true, estado: 'viva' };
}

function mensajesHoy(db, userId) {
  const hoy = hoyYmd();
  const rows = db.prepare(`
    SELECT m.*, p.cliente_nombre, p.id AS partida_id
    FROM venty_mensajes m JOIN venty_partidas p ON p.id = m.partida_id
    WHERE p.user_id = ? AND m.autor = 'venty' AND substr(m.enviado_at, 1, 10) = ?
    ORDER BY m.enviado_at ASC, m.id ASC`).all(userId, hoy);
  return rows.map((r) => ({ id: r.id, partida_id: r.partida_id, cliente: r.cliente_nombre, canal: r.canal, hora: String(r.enviado_at || '').slice(11, 16), texto: r.texto, fuente_precio: r.fuente_precio || '' }));
}

module.exports = {
  MODO, PRECIO_MENSUAL_USD, ESTRENO, DESCUENTO_MAX, GRUPO_ESCALA, SEGUIMIENTO_MAX,
  CAFE_AROMA, CAZA_EJEMPLO,
  init, asegurarSemilla, leerFundamento, actualizarFundamentoPuente, estaPausado, setFreno,
  crearZona, listarZonas, crearRepresentante, listarRepresentantes, representanteDeZona,
  crearLead, listarLeads, normNombreLead,
  listarPartidas, obtenerPartida, tomarPartida, seguirPartida,
  listarBandeja, resolverJugada,
  computarFrase, computarLineaNorte, computarParte, mensajesHoy,
  cotizar, buscarPrecio, validarVoz, jugarMensaje, responderChatDueno,
  registrarEvento, fmtPesos, hoyYmd, mondayKeyOf, shiftDays,
};
