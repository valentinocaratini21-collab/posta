'use strict';

// =====================================================================
// LOTE VISTA-CONSERJE — LA CONSOLA DEL OPERADOR (bamboo)
// =====================================================================
// La vista que el mock aprobado por Valentino (18/11/2026) dibujó en
// vidrio sobre navy: a la izquierda las cuentas que el equipo atiende,
// al centro la ficha viva de cada una (su semana, su feed, su
// fundamento, su tratamiento), a la derecha lo que espera decisión y
// el registro de lo ya decidido, y abajo la cola de producción.
//
// REGLA DE ORO DE ESTA SUPERFICIE: nada se inventa. Cada número sale
// de la DB en el acto (posteos, casos, pedidos de voz, impulsos,
// registro del equipo). Lo que no tiene fuente no se muestra: sin
// snapshot de IG no hay feed (lo dice el endpoint del feed), sin plan
// de prueba no hay formatos, sin fila en ad_boosts no hay impulso.
// Un estado de consola inventado o vencido es la clase de error
// prohibida de la casa — por eso cada acción de la consola escribe en
// la misma fuente que la lee (la decisión de revisión, el estado del
// pedido de voz, el registro del equipo) y la vista se relee entera.
//
// Fuentes que esta vista compone (todas existentes):
//   · support-cases      — casos, pendientes de chat, pedidos de voz,
//                          registro del equipo (support_team_log).
//   · conserje-revision  — la cola de la noche (el posteo de mañana y
//                          su decisión), la ficha del cliente, la etapa.
//   · modelo-nuevo       — el plan de la semana de prueba (slots con
//                          nombre, formato y fecha) desde trial_cache.
//   · image-styles       — las familias de dirección de arte: el
//                          catálogo REAL de tratamientos.
//
// (LOTE CONSERJE-FORMA — la forma que dictó el dueño el 2026-11-22:
// la consola muestra EL PRESENTE VIVO en sus tres columnas. A la
// izquierda, la CARTERA VIVA: solo relaciones vivas — prueba
// corriendo, cliente pago y la casa — computadas de los datos reales
// (claseDeCuenta), no de la columna plan_status guardada. Al centro,
// la PRODUCCIÓN DE MAÑANA (produccionManana): el día que se está
// preparando, un día adelantado, con su semáforo arriba de todo. A la
// derecha, HOY NECESITA UNA MANO (decisiones): pedidos, decisiones
// del dueño, problemas y plata — todo de hoy, con la regla de
// fósiles: lo que se resolvió solo no aparece nunca, y lo que sigue
// real entra con fecha de hoy. La ficha del cliente sigue existiendo
// como drill-in desde cualquier columna.)
// Lo único nuevo que persiste esta vista es la tabla
// conserje_tratamientos: el tratamiento (familia) que el equipo le
// asigna a cada negocio, con su guarda — una familia la lleva UN solo
// negocio a la vez; si otro ya la tiene, la asignación NO se aplica y
// la consola avisa de quién es (la colisión se devuelve, no se pisa).

const supportCases = require('./support-cases');
const conserjeRevision = require('./conserje-revision');
const modeloNuevo = require('./modelo-nuevo');
const { dayKeyInTz } = require('./morning-post-push');

function safe(fn, fallback) { try { const r = fn(); return r === undefined ? fallback : r; } catch (e) { return fallback; } }
function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
function toMs(s) {
  if (!s) return NaN;
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d) ? NaN : d.getTime();
}
function normIg(s) { return String(s || '').trim().replace(/^@/, '').toLowerCase(); }
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function shiftDayKey(key, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n, 12, 0, 0));
  return d.toISOString().slice(0, 10);
}
function diaCortoDeKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  const wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return DIAS_CORTOS[wd];
}
function fechaCortaDeKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  return Number(m[3]) + ' ' + MESES_CORTOS[+m[2] - 1];
}

// ---------------------------------------------------------------------
// TRATAMIENTOS — la familia de dirección de cada negocio
// ---------------------------------------------------------------------
const FAMILIA_NOMBRES = {
  flatlay: 'Flatlay cenital', studio: 'Estudio / producto', macro: 'Macro detalle',
  levitation: 'Levitación', cinematic: 'Cinematográfico', luxury: 'Lujo',
  pop: 'Pop editorial', lifestyle: 'Lifestyle', duo_split: 'Antes / después',
  typo: 'Tipográfico', tech: 'Tech', action: 'Acción / proceso',
  corporate: 'Corporativo', carousel: 'Carrusel', miniature: 'Miniatura',
  premium_generic: 'Premium',
};

function ensureTratSchema(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS conserje_tratamientos (
      user_id INTEGER PRIMARY KEY,
      familia TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      actor TEXT NOT NULL DEFAULT 'equipo'
    )`);
  } catch (e) { /* sin tabla: la vista lo declara en asignaciones=null */ }
}

// El catálogo sale del repertorio real de estilos (image-styles): las
// familias que efectivamente existen entre los presets, con cuántos
// estilos tiene cada una. Sin módulo de estilos, catálogo vacío.
function catalogoTratamientos(db) {
  ensureTratSchema(db);
  const conteo = {};
  try {
    const imageStyles = require('./image-styles');
    for (const s of imageStyles.listStyles()) {
      const fam = imageStyles.styleFamilyOf(s);
      if (fam) conteo[fam] = (conteo[fam] || 0) + 1;
    }
  } catch (e) { /* sin catálogo: el selector no se muestra */ }
  const familias = Object.keys(conteo).sort().map((key) => ({
    key, nombre: FAMILIA_NOMBRES[key] || key, estilos: conteo[key],
  }));
  const rows = safe(() => db.prepare(
    `SELECT t.user_id, t.familia, p.business_name, p.ig_username
     FROM conserje_tratamientos t LEFT JOIN profiles p ON p.user_id = t.user_id`).all(), null);
  const asignaciones = {};
  if (rows) {
    for (const r of rows) {
      asignaciones[r.user_id] = {
        familia: r.familia || '',
        business_name: r.business_name || '', ig_username: r.ig_username || '',
      };
    }
  }
  return { familias, asignaciones };
}

function tratamientoDe(db, uid) {
  ensureTratSchema(db);
  const r = safe(() => db.prepare(
    'SELECT familia FROM conserje_tratamientos WHERE user_id = ?').get(Number(uid)), null);
  return r ? String(r.familia || '') : '';
}

// Asignar el tratamiento de un negocio. LA GUARDA: si la familia ya la
// lleva OTRO negocio, no se aplica nada y se devuelve la colisión con
// el nombre del que la tiene — la consola avisa y el selector vuelve.
function asignarTratamiento(db, userId, familia, actor) {
  ensureTratSchema(db);
  const uid = Number(userId) || 0;
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(uid), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const fam = String(familia || '').trim().toLowerCase();
  if (!fam) {
    safe(() => db.prepare('DELETE FROM conserje_tratamientos WHERE user_id = ?').run(uid), null);
    supportCases.logTeamAction(db, { actor: actor || 'equipo', action: 'tratamiento', userId: uid, detalle: 'Tratamiento retirado desde la consola.' });
    return { ok: true, user_id: uid, familia: '' };
  }
  const cat = catalogoTratamientos(db);
  if (!cat.familias.some((f) => f.key === fam)) return { ok: false, error: 'familia_invalida' };
  const choque = safe(() => db.prepare(
    `SELECT t.user_id, p.business_name, p.ig_username FROM conserje_tratamientos t
     LEFT JOIN profiles p ON p.user_id = t.user_id
     WHERE t.familia = ? AND t.user_id <> ?`).get(fam, uid), null);
  if (choque) {
    return {
      ok: false, error: 'colision', familia: fam,
      ocupa: {
        user_id: choque.user_id,
        business_name: choque.business_name || '',
        ig_username: choque.ig_username || '',
      },
    };
  }
  safe(() => db.prepare(
    `INSERT INTO conserje_tratamientos (user_id, familia, updated_at, actor) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(user_id) DO UPDATE SET familia = excluded.familia, updated_at = datetime('now'), actor = excluded.actor`)
    .run(uid, fam, actor || 'equipo'), null);
  const nombre = FAMILIA_NOMBRES[fam] || fam;
  supportCases.logTeamAction(db, { actor: actor || 'equipo', action: 'tratamiento', userId: uid, detalle: 'Tratamiento asignado: ' + nombre + ' (' + fam + ').' });
  return { ok: true, user_id: uid, familia: fam };
}

// ---------------------------------------------------------------------
// EL PLAN DE PRUEBA de una cuenta (trial_cache + modelo-nuevo)
// ---------------------------------------------------------------------
function planDePrueba(db, u) {
  const claves = [];
  const igs = [u && u.ig_username, u && u.guest_ig].map(normIg).filter(Boolean);
  for (const ig of igs) if (!claves.includes(ig)) claves.push(ig);
  if (u && u.guest_domain) {
    const dom = 'web:' + String(u.guest_domain).trim().toLowerCase();
    if (!claves.includes(dom)) claves.push(dom);
  }
  for (const clave of claves) {
    const row = safe(() => db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(clave), null);
    if (!row || !row.payload) continue;
    let payload = null;
    try { payload = JSON.parse(row.payload); } catch (e) { continue; }
    const plan = modeloNuevo.planSemanaPrueba(payload);
    if (plan) return { plan, cache_key: clave };
  }
  return null;
}

// ---------------------------------------------------------------------
// LA CARTERA VIVA (LOTE CONSERJE-FORMA — la forma que dictó el dueño
// el 2026-11-22): la lista del Conserje muestra RELACIONES VIVAS, no
// el estado guardado en users.plan_status — esa columna queda en
// 'trial' para siempre y hoy 42 de 43 cuentas figuran «prueba» aunque
// su prueba terminó hace semanas. La clase de cada cuenta se computa
// en el acto desde los datos reales:
//   · casa              — la cuenta del dueño (user 12), su vidriera
//                         de trabajo diario: siempre está.
//   · pago              — plan_status 'active' (o 'past_due': cliente
//                         pago en gracia, la suscripción sigue viva).
//   · prueba_corriendo  — plan_status 'trial' con el reloj corriendo
//                         (trial_started_at > 0, la conexión ya pasó) y
//                         el fin efectivo de la prueba en el futuro.
//   · prueba_pendiente  — plan_status 'trial' nacida pendiente de
//                         conexión (trial_started_at = 0, el reloj de
//                         PRUEBA-CONECTA no arrancó) CON la semana
//                         armada (plan en trial_cache o posteos).
//   · null              — no es relación viva: su prueba corrió y
//                         terminó, canceló, o nunca se armó. NO entra
//                         a la lista; su ficha e historia quedan en el
//                         registro (cliente() la sigue leyendo) y si
//                         vuelve, vuelve.
// El fin efectivo replica trialEffectiveEnd de server.js (la política
// vigente: TRIAL_DAYS = 3 desde el arranque real del reloj, con la
// extensión manual vigente mandando si está en el futuro).
// ---------------------------------------------------------------------
const TRIAL_DAYS = 3; // server.js: const TRIAL_DAYS = 3 (la política)

function finEfectivoPrueba(u, nowMs) {
  if (!u) return 0;
  if (u.trial_started_at !== undefined && u.trial_started_at !== null && Number(u.trial_started_at) === 0) return Infinity;
  const ext = Number(u.trial_extended_until || 0);
  if (ext > nowMs) return ext;
  const tEnds = Number(u.trial_ends_at || 0);
  if (!tEnds) return 0;
  const startedMs = Number(u.trial_started_at) > 0 ? Number(u.trial_started_at) : 0;
  const cMs = startedMs || Date.parse(String(u.created_at || '').replace(' ', 'T') + 'Z');
  const policyEnd = cMs ? cMs + TRIAL_DAYS * 86400000 : Infinity;
  return Math.min(tEnds, policyEnd);
}

function claseDeCuenta(db, u, nowMs) {
  const uid = Number(u && u.id) || 0;
  if (!uid) return { clase: null };
  if (uid === conserjeRevision.OWNER_USER_ID) return { clase: 'casa' };
  // (LOTE PADRÓN-CIERRE · auditoría 24/11, hallazgos 1 y 7) La marca
  // de cierre manda sobre el plan: una cuenta en hold (el cierre
  // registrado del equipo, POST /api/admin/hold) sale del padrón
  // aunque su plan_status siga «active» — el caso de la cuenta
  // cerrada @posta.hacetodo, que figuraba como cliente pago. La
  // casa quedó exceptuada arriba, como decidió el tablero.
  if (Number(u.hold) === 1) return { clase: null, cerrada: true };
  // (LOTE RUIDO-ESPACIOS · auditoría 24/11, hallazgo 6) Los espacios
  // del dueño no son clientes: si la cuenta es un espacio del login
  // de la casa (login_spaces), su clase es «espacio», con su tipo —
  // nunca «pago», aunque su plan_status diga active.
  const esp = safe(() => db.prepare(
    'SELECT kind FROM login_spaces WHERE space_user_id = ? AND login_user_id = ?')
    .get(uid, conserjeRevision.OWNER_USER_ID), null);
  if (esp) return { clase: 'espacio', espacio_kind: String(esp.kind || 'negocio') };
  const st = String((u && u.plan_status) || '');
  if (st === 'active' || st === 'past_due') return { clase: 'pago' };
  if (st !== 'trial') return { clase: null };
  const started = (u.trial_started_at === undefined || u.trial_started_at === null)
    ? null : Number(u.trial_started_at);
  if (started === 0) {
    // Pendiente de conexión: entra solo si su semana existe de verdad
    // (el mismo criterio con que la puerta deja invitados a medio
    // abrir fuera del roster: plan armado o posteos ya cargados).
    const conPlan = !!planDePrueba(db, u);
    const conPosts = conPlan ? true : safe(() => db.prepare(
      'SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(uid), { c: 0 }).c > 0;
    return (conPlan || conPosts)
      ? { clase: 'prueba_pendiente', pendiente_conexion: true }
      : { clase: null };
  }
  const fin = finEfectivoPrueba(u, nowMs);
  if (!(fin > nowMs)) return { clase: null };
  const tz = conserjeRevision.accountTz(db, uid);
  return {
    clase: 'prueba_corriendo',
    dias_restantes: Math.max(0, Math.ceil((fin - nowMs) / 86400000)),
    termina_ms: fin,
    termina_key: safe(() => dayKeyInTz(new Date(fin), tz), ''),
  };
}

// ---------------------------------------------------------------------
// RACHA — días seguidos con un posteo publicado, en la zona de la cuenta
// ---------------------------------------------------------------------
function rachaDe(db, uid, tz, nowMs) {
  const rows = safe(() => db.prepare(
    `SELECT published_at, scheduled_at FROM posts WHERE user_id = ? AND status = 'published'`).all(Number(uid)), []);
  const dias = new Set();
  for (const r of rows) {
    const t = toMs(r.published_at || r.scheduled_at);
    if (Number.isFinite(t)) { const k = safe(() => dayKeyInTz(new Date(t), tz), ''); if (k) dias.add(k); }
  }
  if (!dias.size) return 0;
  let cursor = safe(() => dayKeyInTz(new Date(nowMs), tz), '');
  if (!cursor) return 0;
  if (!dias.has(cursor)) cursor = shiftDayKey(cursor, -1); // hoy todavía no salió: la racha se mide hasta ayer
  let n = 0;
  while (cursor && dias.has(cursor)) { n++; cursor = shiftDayKey(cursor, -1); }
  return n;
}

// Pendientes de UNA cuenta, por clase — las mismas fuentes que cuentan
// las superficies existentes (chat sin responder del modo conserje,
// pedidos de voz sin revisión, casos abiertos, el posteo de mañana sin
// decidir en la cola de la noche).
function pendientesDe(db, uid, nowMs) {
  try { supportCases.ensureSchema(db); } catch (e) { /* las lecturas caen a su fallback */ }
  const lastId = safe(() => {
    const r = db.prepare(`SELECT MAX(chat_msg_id) AS m FROM support_team_log WHERE user_id = ? AND action = 'responder_chat'`).get(Number(uid));
    return r && r.m != null ? Number(r.m) : 0;
  }, 0);
  const chat = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = 'user' AND id > ?`).get(Number(uid), lastId), { c: 0 }).c || 0;
  // El mismo criterio de la lista de pedidos: pendiente = sin fila en
  // support_voz_pedidos o con estado 'pendiente', sobre las últimas 60
  // notas de la cuenta.
  const voz = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM chat_messages m
     WHERE m.user_id = ? AND m.role = 'user' AND m.hilo IN ('post', 'semana', 'general')
       AND m.id IN (SELECT id FROM chat_messages WHERE user_id = ? AND role = 'user'
                    AND hilo IN ('post', 'semana', 'general') ORDER BY id DESC LIMIT 60)
       AND NOT EXISTS (SELECT 1 FROM support_voz_pedidos v WHERE v.message_id = m.id AND v.estado <> 'pendiente')`)
    .get(Number(uid), Number(uid)), { c: 0 }).c || 0;
  const casos = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM support_cases WHERE user_id = ? AND estado <> 'cerrado'`).get(Number(uid)), { c: 0 }).c || 0;
  let revision = 0;
  try {
    const fecha = conserjeRevision.fechaRevision(db, nowMs);
    const tz = conserjeRevision.accountTz(db, Number(uid));
    const hay = conserjeRevision.posteoDeManana(db, Number(uid), fecha, tz);
    if (hay && hay.post && !conserjeRevision.revisionDe(db, Number(uid), fecha)) revision = 1;
  } catch (e) { /* sin cola: no se cuenta lo que no se pudo leer */ }
  return { chat, voz, casos, revision, total: chat + voz + casos + revision };
}

// ---------------------------------------------------------------------
// ROSTER — las cuentas que el equipo atiende
// ---------------------------------------------------------------------
const EXCLUYE_EMAIL = `u.email NOT LIKE '%postatest.com' AND u.email NOT LIKE 'qa-%' AND u.email NOT LIKE 'postyqa%'`;

function usuariosAtendidos(db, nowMs) {
  const now = Number(nowMs) || Date.now();
  const rows = safe(() => db.prepare(
    `SELECT u.id, u.email, u.plan, u.plan_status, u.is_guest, u.guest_ig, u.guest_domain,
            u.concierge, u.publishing_stopped, u.hold, u.hold_reason, u.trial_ends_at, u.trial_extended_until,
            u.trial_started_at, u.created_at,
            p.business_name, p.ig_username, p.category, p.ig_connected
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE (u.id = ${conserjeRevision.OWNER_USER_ID}
        OR u.plan_status IN ('active', 'past_due', 'trial'))
       AND (${EXCLUYE_EMAIL} OR u.id = ${conserjeRevision.OWNER_USER_ID})
     ORDER BY u.id ASC`).all(), []);
  // (LOTE CONSERJE-FORMA) La membresía ya no la decide la columna
  // guardada ni un caso abierto: la decide la CLASE computada desde
  // los datos reales (claseDeCuenta). Una prueba terminada, una cuenta
  // cancelada o un invitado sin semana armada quedan fuera de la
  // lista — su registro no se toca.
  return rows.filter((u) => claseDeCuenta(db, u, now).clase !== null);
}

function filaRoster(db, u, opts, nowMs) {
  const o = opts || {};
  const uid = u.id;
  const tz = conserjeRevision.accountTz(db, uid);
  const etapa = safe(() => conserjeRevision.etapaDe(db, uid, u, u), { clave: '', etiqueta: '', color: '', motivo: '' });
  const pend = pendientesDe(db, uid, nowMs);
  const racha = rachaDe(db, uid, tz, nowMs);
  const prox = safe(() => db.prepare(
    `SELECT id, scheduled_at FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL
     ORDER BY scheduled_at ASC LIMIT 1`).get(uid), null);
  const hoyKey = safe(() => dayKeyInTz(new Date(nowMs), tz), '');
  const publicadoHoy = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published'`).all(uid), [])
    .some((r) => { const t = toMs(r.published_at || r.scheduled_at); return Number.isFinite(t) && safe(() => dayKeyInTz(new Date(t), tz), '') === hoyKey; });
  const planInfo = (u.plan_status === 'trial' || u.is_guest) ? planDePrueba(db, u) : null;
  const plan = planInfo ? planInfo.plan : null;
  const listos = plan ? plan.slots.filter((s) => s.estado === 'listo').length : 0;
  // (LOTE CONSERJE-FORMA) La clase viva de la cuenta, computada de los
  // datos reales: es la que manda en los filtros y en las etiquetas —
  // la columna plan_status guardada queda como dato crudo, nada más.
  const claseInfo = claseDeCuenta(db, u, nowMs);
  const claseLabel = claseInfo.clase === 'casa' ? 'La casa'
    : claseInfo.clase === 'espacio' ? (claseInfo.espacio_kind === 'vidriera' ? 'Vidriera de la casa' : 'Espacio de la casa')
    : claseInfo.clase === 'pago' ? 'Cliente'
    : claseInfo.clase === 'prueba_corriendo' ? 'Prueba'
    : claseInfo.clase === 'prueba_pendiente' ? 'Prueba · sin conectar' : '';
  // La línea de estado: el hecho más urgente, en palabras llanas.
  let dot = 'grey', estado = '';
  if (etapa && etapa.clave === 'en_rojo') { dot = 'yellow'; estado = etapa.motivo || 'Necesita atención'; }
  else if (claseInfo.clase === 'prueba_pendiente') {
    dot = 'grey';
    estado = plan ? 'Semana armada · esperando la conexión' : 'Esperando la conexión de Instagram';
  }
  else if (pend.revision) { dot = 'yellow'; estado = 'Pieza de mañana para decidir'; }
  else if (pend.voz) { dot = 'yellow'; estado = 'Nota de voz por resolver'; }
  else if (pend.chat) { dot = 'yellow'; estado = pend.chat === 1 ? '1 mensaje sin responder' : pend.chat + ' mensajes sin responder'; }
  else if (pend.casos) { dot = 'yellow'; estado = pend.casos === 1 ? '1 caso abierto' : pend.casos + ' casos abiertos'; }
  else if (plan && listos < plan.slots.length) {
    dot = publicadoHoy ? 'green' : 'grey';
    estado = 'Prueba: ' + listos + ' de ' + plan.slots.length + ' piezas cargadas';
  } else if (prox) {
    dot = 'green';
    const t = toMs(prox.scheduled_at);
    const k = Number.isFinite(t) ? safe(() => dayKeyInTz(new Date(t), tz), '') : '';
    const hh = Number.isFinite(t) ? new Intl.DateTimeFormat('es', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t)) : '';
    estado = 'Al día · próximo ' + (k === hoyKey ? 'hoy' : (k === shiftDayKey(hoyKey, 1) ? 'mañana' : fechaCortaDeKey(k))) + (hh ? ' ' + hh : '');
  } else if (publicadoHoy) { dot = 'green'; estado = 'Al día · hoy ya publicó'; }
  else { dot = 'grey'; estado = 'Sin posteos programados'; }
  return {
    user_id: uid,
    // (LOTE RUIDO-ESPACIOS · detalle 10 de la auditoría) El nombre
    // que la consola muestra corta el rubro pegado que a veces trae
    // el nombre de Instagram («Nombre | Rubro»): se muestra el
    // nombre; el dato guardado no se toca.
    business_name: String(u.business_name || '').split(' | ')[0] || u.guest_ig || u.email || '',
    ig_connected: !!u.ig_connected,
    ig_username: u.ig_username || u.guest_ig || '',
    email: u.email || '',
    categoria: u.category || '',
    plan: u.plan || '', plan_status: u.plan_status || '',
    clase: claseInfo.clase || '', clase_label: claseLabel,
    prueba: (claseInfo.clase === 'prueba_corriendo' || claseInfo.clase === 'prueba_pendiente') ? {
      dias_restantes: claseInfo.dias_restantes != null ? claseInfo.dias_restantes : null,
      termina_key: claseInfo.termina_key || '',
      pendiente_conexion: !!claseInfo.pendiente_conexion,
    } : null,
    publishing_stopped: !!u.publishing_stopped,
    es_invitado: !!u.is_guest, es_dueno: uid === conserjeRevision.OWNER_USER_ID,
    concierge: !!u.concierge,
    etapa, racha, pendientes: pend,
    proximo: prox ? { post_id: prox.id, scheduled_at: prox.scheduled_at } : null,
    plan_prueba: plan ? { estrella: plan.estrella, formatos: plan.formatos, listos, total: plan.slots.length } : null,
    tratamiento: tratamientoDe(db, uid),
    dot, estado,
  };
}

// ---------------------------------------------------------------------
// HOY — la tira superior
// ---------------------------------------------------------------------
function resumenHoy(db, filas, decisionesList, opts, nowMs) {
  const o = opts || {};
  const tzD = safe(() => conserjeRevision.ownerTz(db), 'America/New_York');
  let fechaLabel = '';
  try {
    const f = new Intl.DateTimeFormat('es', { timeZone: tzD, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(nowMs));
    fechaLabel = f.charAt(0).toUpperCase() + f.slice(1);
  } catch (e) { fechaLabel = ''; }
  const hoyKey = safe(() => dayKeyInTz(new Date(nowMs), tzD), '');
  const ids = filas.map((f) => f.user_id);
  let programadosHoy = 0, publicadosHoy = 0, proximaHora = '';
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    const rows = safe(() => db.prepare(
      `SELECT status, scheduled_at, published_at FROM posts WHERE user_id IN (${marks}) AND status IN ('scheduled', 'published')`).all(...ids), []);
    let proxMs = Infinity;
    for (const r of rows) {
      const t = toMs(r.status === 'published' ? (r.published_at || r.scheduled_at) : r.scheduled_at);
      if (!Number.isFinite(t)) continue;
      const k = safe(() => dayKeyInTz(new Date(t), tzD), '');
      if (k !== hoyKey) continue;
      if (r.status === 'published') publicadosHoy++;
      else { programadosHoy++; if (t > nowMs && t < proxMs) proxMs = t; }
    }
    if (Number.isFinite(proxMs)) {
      proximaHora = new Intl.DateTimeFormat('es', { timeZone: tzD, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(proxMs));
    }
  }
  const suscriptores = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM users WHERE plan_status = 'active'`).get(), { c: 0 }).c || 0;
  return {
    fecha_label: fechaLabel,
    publica_hoy: programadosHoy + publicadosHoy,
    programados_hoy: programadosHoy,
    publicados_hoy: publicadosHoy,
    proxima_hora: proximaHora,
    // (LOTE CONSERJE-FORMA) Pruebas activas = las que están CORRIENDO
    // (reloj andando): la columna guardada contaba 42 «pruebas» con la
    // mayoría terminadas hace semanas.
    pruebas_activas: filas.filter((f) => f.clase === 'prueba_corriendo').length,
    // (LOTE RUIDO-ESPACIOS · detalle 11) Las que esperan conexión,
    // contadas aparte para que el encabezado no se lea «no hay
    // pruebas» cuando hay una fila esperando.
    pruebas_esperando: filas.filter((f) => f.clase === 'prueba_pendiente').length,
    decisiones_pendientes: decisionesList.length,
    suscriptores,
    meta_marzo: 30,
    disco_mb: (o.diskFreeMB != null ? o.diskFreeMB : null),
  };
}

// ---------------------------------------------------------------------
// PRODUCCIÓN DE MAÑANA (LOTE CONSERJE-FORMA) — el centro de la
// consola trabaja UN DÍA ADELANTADO: muestra los posteos del día que
// se está PREPARANDO (hoy domingo → los del lunes), porque lo de hoy
// ya está en curso. El universo es la cartera viva que publica por el
// régimen diario (cliente pago o prueba corriendo; la casa publica a
// mano por el flujo del producto y la prueba pendiente todavía no
// publica: ninguna de las dos entra). Una cuenta frenada
// (publishing_stopped) tampoco entra — su mañana no lo cubre Posty,
// el mismo criterio que ya usa la cola de revisión.
// El estado de cada cuenta sale de los datos reales de producción de
// mañana (la misma cola de revisión de la noche, filtrada a la
// cartera viva — ningún estado se inventa ni se marca a mano):
//   · listo          — el posteo de mañana está programado (sale
//                      solo), o el dueño ya decidió «no sale» para
//                      ese día (sin_posteo_decidido: mañana está
//                      resuelto para esa cuenta, no falta nada).
//   · en_preparacion — hay una propuesta (borrador) esperando
//                      decisión, o el dueño ya pidió «Posty lo arma»,
//                      o hay una orden de producción a mano abierta.
//   · falta          — nada de lo anterior: mañana no tiene posteo.
// ---------------------------------------------------------------------
function produccionManana(db, filas, opts, nowMs) {
  const o = opts || {};
  const fecha = conserjeRevision.fechaRevision(db, nowMs);
  const vacio = { fecha, fecha_label: '', resumen: { total: 0, listos: 0, en_preparacion: 0, faltan: 0 }, items: [] };
  if (!fecha) return vacio;
  const fechaLabel = (diaCortoDeKey(fecha) + ' ' + fechaCortaDeKey(fecha)).trim();
  const cola = safe(() => conserjeRevision.colaRevision(db, {
    fecha, absImageUrl: o.absImageUrl, posterUrlFor: o.posterUrlFor, nowMs,
  }), null);
  const porId = {};
  if (cola) {
    for (const it of (cola.items || [])) porId[it.user_id] = it;
    for (const it of (cola.sin_posteo || [])) porId[it.user_id] = it;
  }
  const ordenes = new Set(safe(() => db.prepare(
    `SELECT DISTINCT user_id FROM support_cases WHERE tipo = 'prueba_linea_mano' AND estado <> 'cerrado'`).all(), [])
    .map((r) => Number(r.user_id)));
  const items = [];
  for (const f of filas) {
    if (f.clase !== 'pago' && f.clase !== 'prueba_corriendo' && f.clase !== 'prueba_pendiente' && f.clase !== 'espacio' && f.clase !== 'casa') continue;
    // (LOTE RUIDO-CASA · correctivo de RUIDO-ESPACIOS) La casa vive
    // con el freno prendido (publishing_stopped: Posty no publica
    // por ella) y ese freno es la razón de su fila informativa: la
    // casa queda exceptuada del salteo por freno. Las demás cuentas
    // frenadas siguen fuera, como siempre.
    if (f.publishing_stopped && f.clase !== 'casa') continue;
    // (LOTE RUIDO-ESPACIOS · auditoría 24/11, hallazgos 6 y 8) El
    // espacio del dueño SIN Instagram conectado no tiene deber de
    // posteo: fuera de la producción de mañana (su «Mañana sin
    // posteo» era permanente e imposible de resolver). El espacio
    // CON Instagram sí entra — su falta es real. La casa entra como
    // fila informativa: decisiones() no le crea tarjeta ni problema.
    if (f.clase === 'espacio' && !f.ig_connected) continue;
    // La prueba que termina hoy ya no corre mañana: su mañana no se
    // le exige (su cierre vive en la derecha, clase plata).
    if (f.clase === 'prueba_corriendo' && f.prueba && f.prueba.termina_key && f.prueba.termina_key < fecha) continue;
    const uid = f.user_id;
    const it = porId[uid] || null;
    const post = it ? (it.post || null) : null;
    const decision = it ? (it.decision || null) : null;
    // (LOTE POSTEO-1-PRUEBA-PENDIENTE · M265, auditoría 24/11) La
    // prueba pendiente entra SOLO con su posteo de mañana en la
    // cola — su posteo 1, el que el operador tiene que poder
    // decidir desde la bandeja. Sin posteo de mañana queda fuera:
    // todavía no conectó, su mañana no se le exige y no nace una
    // «falta» imposible de resolver.
    if (f.clase === 'prueba_pendiente' && !post) continue;
    let estado = 'falta', sinPosteoDecidido = false;
    if (post && post.status === 'scheduled') estado = 'listo';
    else if (!post && decision && decision.decision === 'no_sale') { estado = 'listo'; sinPosteoDecidido = true; }
    else if (post) estado = 'en_preparacion';
    else if (decision && decision.decision === 'pedir') estado = 'en_preparacion';
    else if (ordenes.has(uid)) estado = 'en_preparacion';
    items.push({
      user_id: uid,
      business_name: f.business_name || '', ig_username: f.ig_username || '',
      clase: f.clase, estado, sin_posteo_decidido: sinPosteoDecidido,
      post: post ? {
        id: post.id, titulo: post.titulo || 'Posteo de mañana',
        caption: trunc(post.caption || '', 400),
        image_url: post.image_url || '', poster_url: post.poster_url || '',
        media_type: post.media_type || 'image', status: post.status || '',
        origen: it ? (it.origen || '') : '', cuando: post.cuando || '',
      } : null,
      decision: decision ? { decision: decision.decision, etiqueta: decision.etiqueta || decision.decision } : null,
      necesita_atencion: it ? !!it.necesita_atencion : false,
      motivo_atencion: it ? (it.motivo_atencion || '') : '',
    });
  }
  const orden = { falta: 0, en_preparacion: 1, listo: 2 };
  items.sort((a, b) => (orden[a.estado] - orden[b.estado]) || String(a.business_name).localeCompare(String(b.business_name)));
  return {
    fecha, fecha_label: fechaLabel,
    resumen: {
      total: items.length,
      listos: items.filter((i) => i.estado === 'listo').length,
      en_preparacion: items.filter((i) => i.estado === 'en_preparacion').length,
      faltan: items.filter((i) => i.estado === 'falta').length,
    },
    items,
  };
}

// ---------------------------------------------------------------------
// HOY NECESITA UNA MANO (LOTE CONSERJE-FORMA) — la columna derecha.
// Cuatro clases, TODAS DE HOY, sobre la cartera viva:
//   1 · pedido    — lo que los clientes están pidiendo: cambios y
//                   posteos pedidos (la cola de pedidos escritos/voz),
//                   el material subido esperando armado, y los casos
//                   abiertos que son necesidades del cliente.
//   2 · decision  — las decisiones del dueño de hoy: la pieza de
//                   mañana que existe y espera su toque (sale /
//                   arreglar / no sale, la decisión de la revisión).
//   3 · problema  — mañana sin posteo (la falta del centro), un
//                   posteo que no salió (status 'failed' de hoy o
//                   ayer), la conexión de Instagram caída (el aviso
//                   ig_token_warning que enciende el publicador y
//                   apaga la reconexión), un impulso en error, el
//                   disco bajo y el video publicado sin portada.
//   4 · plata     — las pruebas que terminan HOY (el día de la venta)
//                   y los pagos fallidos de hoy (el evento
//                   payment_failed) o la suscripción en past_due.
// LA REGLA DE FÓSILES (criterio #2 del dueño): el ítem cuyo objeto ya
// se resolvió solo — el posteo del pedido ya salió o se descartó, el
// caso es de un día que ya pasó, la cuenta ya no es relación viva —
// NO aparece nunca. El que sigue real entra con fecha de HOY, aunque
// haya nacido antes: hoy es cuando se resuelve. (La vista vieja
// traía 75 «decisiones» con 43 sin fecha: esa pila es lo que esta
// lista reemplaza.)
// ---------------------------------------------------------------------
const CASOS_DE_UN_DIA = ['sin_posteo_manana', 'post_no_publicado', 'sin_aprobar', 'semana_error', 'post_fallido', 'defecto_imagen'];
const POST_RESUELTO = ['published', 'cancelled', 'dismissed'];

function decisiones(db, filas, opts, nowMs) {
  const o = opts || {};
  const porId = {};
  for (const f of filas) porId[f.user_id] = f;
  const tzD = safe(() => conserjeRevision.ownerTz(db), 'America/New_York');
  const hoyKey = safe(() => dayKeyInTz(new Date(nowMs), tzD), '');
  const manana = o.mananaProd || produccionManana(db, filas, o, nowMs);
  const out = [];

  // 1 · PEDIDOS — la cola de pedidos escritos/voz sin revisión, con la
  // regla de fósiles sobre su objeto: si el posteo del que habla el
  // pedido ya salió o se descartó, el pedido se resolvió solo y no
  // entra (queda en su registro, no en la lista de hoy).
  try {
    const vr = supportCases.voiceRequests(db, { limit: 60, absImageUrl: o.absImageUrl, posterUrlFor: o.posterUrlFor });
    for (const p of (vr.pedidos || [])) {
      if (!p.revision || p.revision.estado !== 'pendiente') continue;
      const f = porId[p.user_id];
      if (!f) continue; // cuenta que ya no es relación viva: fuera de la consola
      if (p.posteo && POST_RESUELTO.includes(String(p.posteo.status || ''))) continue;
      out.push({
        clase: 'pedido',
        tipo: 'voz', id: 'voz-' + p.id, user_id: p.user_id,
        business_name: f.business_name || p.business_name || '',
        ig_username: f.ig_username || p.ig_username || '',
        titulo: p.es_idea ? 'Idea escrita' : 'Nota de voz', ambito: p.ambito, cuando: p.cuando || '',
        es_idea: !!p.es_idea,
        // (LOTE RESPUESTA-HILO-IDEA) El hilo completo de la idea viaja
        // a la tarjeta: si el cliente siguió respondiendo, quien
        // resuelve ve la conversación entera antes de contestar.
        idea_hilo: p.idea_hilo || null,
        pedido: p.pedido || '', respuesta: p.respuesta || '',
        message_id: p.id, posteo: p.posteo || null,
        fecha: hoyKey,
      });
    }
  } catch (e) { /* sin lista de voz: las demás clases igual salen */ }

  // 1 · PEDIDOS — el material subido que espera armado
  // (subir_pedidos_voz en 'pendiente_revision', su estado real manda).
  try {
    const rows = safe(() => db.prepare(
      `SELECT s.id, s.user_id, s.asset_id, s.kind, s.nota, s.post_id, s.created_at,
              p.business_name, p.ig_username
       FROM subir_pedidos_voz s LEFT JOIN profiles p ON p.user_id = s.user_id
       WHERE s.estado = 'pendiente_revision' ORDER BY s.id DESC LIMIT 60`).all(), []);
    for (const s of rows) {
      const f = porId[s.user_id];
      if (!f) continue;
      if (s.post_id) {
        const pst = safe(() => db.prepare('SELECT status FROM posts WHERE id = ?').get(Number(s.post_id)), null);
        if (pst && POST_RESUELTO.includes(String(pst.status || ''))) continue;
      }
      out.push({
        clase: 'pedido',
        tipo: 'subir', id: 'subir-' + s.id, user_id: s.user_id,
        business_name: f.business_name || s.business_name || '',
        ig_username: f.ig_username || s.ig_username || '',
        titulo: 'Material subido',
        texto: trunc(s.nota || '', 300),
        kind: s.kind || '', pedido_id: s.id, post_id: s.post_id || null,
        cuando: s.created_at || '', fecha: hoyKey,
      });
    }
  } catch (e) { /* sin tabla de subir legible: nada que mostrar */ }

  // 1 · PEDIDOS — los casos abiertos que son necesidades del cliente
  // (la producción a mano vive en la cola, no acá). Fósiles fuera: el
  // caso atado a un posteo ya resuelto, y el caso DE UN DÍA (su tipo
  // nombra el día: sin posteo mañana, post no publicado, sin aprobar,
  // error de semana, post fallido, defecto de imagen) creado antes de
  // hoy — su día ya pasó y su hecho de hoy, si existe, entra por su
  // fuente directa (el centro y los problemas).
  try {
    const casos = supportCases.listCases(db, { estado: 'abierto', limit: 50 });
    for (const c of casos) {
      if (c.tipo === 'prueba_linea_mano') continue;
      const f = porId[c.user_id];
      if (!f) continue;
      if (c.post_id) {
        const pst = safe(() => db.prepare('SELECT status FROM posts WHERE id = ?').get(Number(c.post_id)), null);
        if (pst && POST_RESUELTO.includes(String(pst.status || ''))) continue;
      }
      if (CASOS_DE_UN_DIA.includes(String(c.tipo || ''))) {
        const tzC = conserjeRevision.accountTz(db, Number(c.user_id));
        const creadoKey = c.created_at ? safe(() => dayKeyInTz(new Date(String(c.created_at).replace(' ', 'T') + 'Z'), tzC), '') : '';
        const hoyC = safe(() => dayKeyInTz(new Date(nowMs), tzC), '');
        if (creadoKey && hoyC && creadoKey < hoyC) continue;
      }
      out.push({
        clase: 'pedido',
        tipo: 'caso', id: 'caso-' + c.id, user_id: c.user_id,
        business_name: f.business_name || c.business_name || '',
        ig_username: f.ig_username || c.ig_username || '',
        titulo: c.titulo || 'Caso abierto',
        texto: trunc(c.detalle || '', 400),
        siguiente_paso: c.siguiente_paso || '', dueno: c.dueno || '',
        case_id: c.id, caso_tipo: c.tipo || '', created_at: c.created_at || '',
        fecha: hoyKey,
      });
    }
  } catch (e) { /* sin casos: la columna queda con lo demás */ }

  // 2 · DECISIONES DEL DUEÑO — la pieza de mañana que existe y espera
  // su toque. Su fecha es la del objeto (mañana): la acción de decidir
  // la necesita; la pieza está en la lista de HOY porque hoy se
  // decide. La que ya tiene decisión no entra (ya se decidió).
  for (const it of (manana.items || [])) {
    if (!it.post || it.decision) continue;
    if (it.clase === 'casa') continue; // (RUIDO-ESPACIOS) la casa es fila informativa en mañana: no se decide acá
    out.push({
      clase: 'decision',
      tipo: 'pieza', id: 'pieza-' + it.user_id + '-' + manana.fecha,
      user_id: it.user_id, business_name: it.business_name || '', ig_username: it.ig_username || '',
      titulo: it.post.titulo || 'Posteo de mañana', texto: it.post.caption || '',
      image_url: it.post.image_url || '', poster_url: it.post.poster_url || '',
      media_type: it.post.media_type || 'image',
      necesita_atencion: !!it.necesita_atencion, motivo_atencion: it.motivo_atencion || '',
      cuando: it.post.cuando || '', fecha: manana.fecha, post_id: it.post.id, origen: it.post.origen || '',
    });
  }

  // 3 · PROBLEMAS — mañana sin posteo (la falta del centro, acá como
  // problema accionable: «Posty lo arma» o ver la ficha).
  for (const it of (manana.items || [])) {
    if (it.estado !== 'falta') continue;
    if (it.clase === 'casa') continue; // (RUIDO-ESPACIOS) la casa se publica a mano: su falta se ve en mañana, no como problema «Posty lo arma»
    out.push({
      clase: 'problema',
      tipo: 'pieza_falta', id: 'falta-' + it.user_id + '-' + manana.fecha,
      user_id: it.user_id, business_name: it.business_name || '', ig_username: it.ig_username || '',
      titulo: 'Mañana sin posteo',
      texto: 'Este perfil no tiene posteo para mañana. La decisión «Posty lo arma» lo deja registrado para producción.',
      fecha: manana.fecha,
    });
  }

  // 3 · PROBLEMAS — la conexión caída y el posteo que no salió. El
  // aviso de token (settings.ig_token_warning) lo enciende el
  // publicador cuando Meta rechaza por token y lo apaga la
  // reconexión: mientras está prendido, la conexión ES el problema
  // (y tapa los fallos sueltos de esa cuenta, que son su síntoma).
  try {
    for (const f of filas) {
      const uid = f.user_id;
      const tz = conserjeRevision.accountTz(db, uid);
      const warn = safe(() => db.prepare(
        'SELECT ig_token_warning FROM settings WHERE user_id = ?').get(uid), null);
      if (warn && Number(warn.ig_token_warning) === 1) {
        out.push({
          clase: 'problema',
          tipo: 'conexion', id: 'conexion-' + uid, user_id: uid,
          business_name: f.business_name || '', ig_username: f.ig_username || '',
          titulo: 'Conexión de Instagram caída',
          texto: 'Meta rechazó el token de esta cuenta: hasta que se reconecte, sus posteos no salen.',
          fecha: hoyKey,
        });
        continue;
      }
      const hoyC = safe(() => dayKeyInTz(new Date(nowMs), tz), '');
      const desde = hoyC ? shiftDayKey(hoyC, -1) : '';
      const fallidos = safe(() => db.prepare(
        `SELECT id, caption, error, scheduled_at, created_at FROM posts
         WHERE user_id = ? AND status = 'failed' ORDER BY id DESC LIMIT 10`).all(uid), []);
      for (const p of fallidos) {
        const t = toMs(p.scheduled_at || p.created_at);
        const k = Number.isFinite(t) ? safe(() => dayKeyInTz(new Date(t), tz), '') : '';
        if (!k || (desde && k < desde)) continue; // su día ya pasó: fósil
        out.push({
          clase: 'problema',
          tipo: 'post_fallido', id: 'fallido-' + p.id, user_id: uid,
          business_name: f.business_name || '', ig_username: f.ig_username || '',
          titulo: 'Un posteo no salió',
          texto: trunc(p.error || 'La publicación falló.', 300),
          post_id: p.id, fecha: hoyKey,
        });
      }
    }
  } catch (e) { /* sin lectura de fallos: el problema no se fabrica */ }

  // 3 · PROBLEMAS — impulsos en error (ad_boosts): el hecho y su
  // motivo, tal cual quedó guardado. Lo ya visto por el equipo
  // (registro «impulso_visto» con el id del impulso en el detalle) no
  // vuelve a pedir decisión — sigue real mientras nadie lo vio,
  // porque el impulso sigue sin correr: entra con fecha de hoy.
  try {
    const vistos = new Set();
    const logs = safe(() => db.prepare(
      `SELECT detalle FROM support_team_log WHERE action = 'impulso_visto'`).all(), []);
    for (const l of logs) { const m = /boost:(\d+)/.exec(String(l.detalle || '')); if (m) vistos.add(Number(m[1])); }
    const boosts = safe(() => db.prepare(
      `SELECT b.id, b.user_id, b.post_id, b.budget_cents, b.fee_cents, b.error, b.created_at,
              p.business_name, p.ig_username
       FROM ad_boosts b LEFT JOIN profiles p ON p.user_id = b.user_id
       WHERE b.status = 'error' AND datetime(b.created_at) >= datetime('now', '-30 days')
       ORDER BY b.id DESC LIMIT 10`).all(), []);
    for (const b of boosts) {
      if (vistos.has(b.id)) continue;
      const f = porId[b.user_id];
      if (!f) continue;
      out.push({
        clase: 'problema',
        tipo: 'impulso', id: 'impulso-' + b.id, user_id: b.user_id,
        business_name: f.business_name || b.business_name || '',
        ig_username: f.ig_username || b.ig_username || '',
        titulo: 'Impulso en error', texto: String(b.error || 'Meta rechazó la creación del impulso.'),
        post_id: b.post_id || null, boost_id: b.id,
        budget_cents: b.budget_cents || 0, fee_cents: b.fee_cents || 0,
        created_at: b.created_at || '', fecha: hoyKey,
      });
    }
  } catch (e) { /* sin tabla de impulsos legible: nada que mostrar */ }

  // 3 · PROBLEMAS — alertas de hecho: disco bajo y posteos de video
  // publicados sin portada (la portada se lee de la columna guardada:
  // esta vista no extrae frames ni toca los posteos). Lo de portada
  // ya visto por el equipo (registro «portada_vista») no se repite;
  // mientras no se vio, el posteo sigue sin portada en su grilla:
  // sigue real y entra con fecha de hoy.
  if (o.diskFreeMB != null && o.diskFreeMB < 1024) {
    out.push({
      clase: 'problema',
      tipo: 'alerta', id: 'alerta-disco', user_id: null,
      business_name: '', ig_username: '',
      titulo: 'Disco del servidor bajo',
      texto: 'Quedan ' + o.diskFreeMB + ' MB libres. Si se llena, la app deja de guardar posteos.',
      kind: 'disco', disco_mb: o.diskFreeMB, fecha: hoyKey,
    });
  }
  try {
    const vistosP = new Set(safe(() => db.prepare(
      `SELECT post_id FROM support_team_log WHERE action = 'portada_vista' AND post_id IS NOT NULL`).all(), [])
      .map((r) => Number(r.post_id)));
    const ids = filas.map((f) => f.user_id);
    if (ids.length) {
      const marks = ids.map(() => '?').join(',');
      const rows = safe(() => db.prepare(
        `SELECT id, user_id FROM posts WHERE user_id IN (${marks}) AND status = 'published'
         AND LOWER(COALESCE(media_type, '')) IN ('video', 'reel', 'reels')
         AND COALESCE(cover_path, '') = '' ORDER BY id DESC LIMIT 10`).all(...ids), []);
      for (const r of rows) {
        if (vistosP.has(r.id)) continue;
        const f = porId[r.user_id];
        out.push({
          clase: 'problema',
          tipo: 'alerta', id: 'portada-' + r.id, user_id: r.user_id,
          business_name: (f && f.business_name) || '', ig_username: (f && f.ig_username) || '',
          titulo: 'Posteo de video sin portada',
          texto: 'El posteo #' + r.id + ' se publicó sin imagen de portada: en su grilla se ve un ícono genérico.',
          kind: 'portada', post_id: r.id, fecha: hoyKey,
        });
      }
    }
  } catch (e) { /* sin lectura de portadas: la alerta no se fabrica */ }

  // 4 · PLATA — la prueba que termina HOY (su último día: el día de
  // cerrar la venta) y el pago que falló hoy. El evento
  // payment_failed lo escribe el riel de cobro en el acto; la cuenta
  // en past_due es el estado parado del mismo hecho.
  for (const f of filas) {
    if (f.clase !== 'prueba_corriendo' || !f.prueba || !f.prueba.termina_key) continue;
    const tz = conserjeRevision.accountTz(db, f.user_id);
    const hoyC = safe(() => dayKeyInTz(new Date(nowMs), tz), '');
    if (hoyC && f.prueba.termina_key === hoyC) {
      out.push({
        clase: 'plata',
        tipo: 'prueba_termina', id: 'termina-' + f.user_id, user_id: f.user_id,
        business_name: f.business_name || '', ig_username: f.ig_username || '',
        titulo: 'Hoy termina su prueba',
        texto: 'Es el último día de la prueba de este negocio: el día de cerrar la venta.',
        fecha: hoyKey,
      });
    }
  }
  try {
    const evs = safe(() => db.prepare(
      `SELECT user_id, created_at FROM events WHERE name = 'payment_failed'
       ORDER BY id DESC LIMIT 100`).all(), []);
    const porUsuario = {};
    for (const e of evs) {
      const f = porId[e.user_id];
      if (!f) continue;
      const k = e.created_at ? safe(() => dayKeyInTz(new Date(String(e.created_at).replace(' ', 'T') + 'Z'), tzD), '') : '';
      if (!k || k !== hoyKey) continue;
      porUsuario[e.user_id] = (porUsuario[e.user_id] || 0) + 1;
    }
    for (const uid of Object.keys(porUsuario)) {
      const f = porId[uid];
      out.push({
        clase: 'plata',
        tipo: 'pago_fallido', id: 'pago-' + uid + '-' + hoyKey, user_id: Number(uid),
        business_name: f.business_name || '', ig_username: f.ig_username || '',
        titulo: 'Un pago falló hoy',
        texto: porUsuario[uid] === 1
          ? 'El cobro de hoy falló: quedó registrado en el riel de pago. Nadie le cobró de más; hay que seguirlo.'
          : 'Hoy fallaron ' + porUsuario[uid] + ' cobros de esta cuenta: quedaron registrados en el riel de pago.',
        fecha: hoyKey,
      });
    }
    for (const f of filas) {
      if (f.clase !== 'pago') continue;
      if (f.plan_status === 'past_due' && !porUsuario[f.user_id]) {
        out.push({
          clase: 'plata',
          tipo: 'pago_fallido', id: 'pastdue-' + f.user_id, user_id: f.user_id,
          business_name: f.business_name || '', ig_username: f.ig_username || '',
          titulo: 'Suscripción vencida',
          texto: 'La suscripción está en past_due: el último cobro no entró y la cuenta sigue en gracia.',
          fecha: hoyKey,
        });
      }
    }
  } catch (e) { /* sin eventos legibles: la plata no se fabrica */ }

  const ordenClase = { pedido: 0, decision: 1, problema: 2, plata: 3 };
  out.sort((a, b) => (ordenClase[a.clase] - ordenClase[b.clase]));
  return out;
}

// ---------------------------------------------------------------------
// ÚLTIMAS DECISIONES — el registro real del equipo
// ---------------------------------------------------------------------
function ultimasDecisiones(db, limit) {
  const rows = safe(() => supportCases.teamLog(db, { limit: limit || 15 }), []);
  return rows.map((r) => ({
    id: r.id, actor: r.actor || 'equipo', action: r.action || '',
    etiqueta: r.etiqueta || r.action || '',
    user_id: r.user_id || null, post_id: r.post_id || null, case_id: r.case_id || null,
    business_name: r.business_name || '', ig_username: r.ig_username || '',
    detalle: r.detalle || '', cuando: r.cuando || '', created_at: r.created_at || '',
  }));
}

// ---------------------------------------------------------------------
// COLA DE PRODUCCIÓN — lo que bamboo está haciendo
// ---------------------------------------------------------------------
function colaProduccion(db, filas) {
  const porId = {};
  for (const f of filas) porId[f.user_id] = f;
  const out = [];
  const casos = safe(() => db.prepare(
    `SELECT c.id, c.user_id, c.titulo, c.detalle, c.siguiente_paso, c.created_at,
            p.business_name, p.ig_username
     FROM support_cases c LEFT JOIN profiles p ON p.user_id = c.user_id
     WHERE c.tipo IN ('prueba_linea_mano', 'pedido_dueno') AND c.estado <> 'cerrado'
     ORDER BY c.id ASC`).all(), []);
  for (const c of casos) {
    const f = porId[c.user_id];
    // (LOTE CONSERJE-FORMA) La cola también es de la cartera viva: la
    // producción abierta de una cuenta que ya no es relación viva no
    // se ofrece como trabajo de hoy (su caso queda en el registro).
    if (!f) continue;
    out.push({
      user_id: c.user_id,
      business_name: (f && f.business_name) || c.business_name || '',
      ig_username: (f && f.ig_username) || c.ig_username || '',
      titulo: c.titulo || 'Producción a mano',
      detalle: trunc(c.siguiente_paso || c.detalle || '', 200),
      case_id: c.id,
    });
  }
  // Las decisiones «Posty lo arma» de la revisión que todavía no tienen
  // posteo: producción pedida por el dueño, en cola.
  const pedidos = safe(() => db.prepare(
    `SELECT r.user_id, r.fecha_posteo, p.business_name, p.ig_username
     FROM conserje_revision r LEFT JOIN profiles p ON p.user_id = r.user_id
     WHERE r.decision = 'pedir' AND r.fecha_posteo >= date('now', '-1 day')
     ORDER BY r.fecha_posteo ASC LIMIT 10`).all(), []);
  for (const r of pedidos) {
    const f = porId[r.user_id];
    if (!f) continue; // (LOTE CONSERJE-FORMA) solo cartera viva
    out.push({
      user_id: r.user_id,
      business_name: (f && f.business_name) || r.business_name || '',
      ig_username: (f && f.ig_username) || r.ig_username || '',
      titulo: 'Posty lo arma · ' + fechaCortaDeKey(r.fecha_posteo),
      detalle: 'Decidido en la revisión de la noche: falta producir este posteo.',
      case_id: null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// CLIENTE — la ficha viva
// ---------------------------------------------------------------------
function semanaDe(db, uid, tz, nowMs, planStatus) {
  const hoyKey = safe(() => dayKeyInTz(new Date(nowMs), tz), '');
  if (!hoyKey) return [];
  // «Falta» es la promesa diaria del plan pago (1 posteo por día). En
  // la prueba los posteos salen los días del plan — un día sin pieza
  // entre día y día no es una falta, y la consola no lo pinta como una.
  const enPrueba = planStatus === 'trial';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoyKey);
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  const lunes = shiftDayKey(hoyKey, -((dow + 6) % 7));
  const keys = [];
  for (let i = 0; i < 7; i++) keys.push(shiftDayKey(lunes, i));
  const rows = safe(() => db.prepare(
    `SELECT id, status, media_type, scheduled_at, published_at, created_at FROM posts
     WHERE user_id = ? AND status IN ('published', 'scheduled', 'draft')`).all(Number(uid)), []);
  const porDia = {};
  for (const p of rows) {
    const t = toMs(p.scheduled_at || p.published_at || p.created_at);
    if (!Number.isFinite(t)) continue;
    const k = safe(() => dayKeyInTz(new Date(t), tz), '');
    if (!keys.includes(k)) continue;
    const prev = porDia[k];
    const rango = { published: 3, scheduled: 2, draft: 1 };
    if (!prev || (rango[p.status] || 0) > (rango[prev.status] || 0)) porDia[k] = p;
  }
  const stops = new Set(safe(() => db.prepare(
    `SELECT day_key FROM day_stops WHERE user_id = ?`).all(Number(uid)), []).map((r) => r.day_key));
  const horaEnTz = (ms) => {
    if (!Number.isFinite(ms)) return '';
    try { return new Intl.DateTimeFormat('es', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)); }
    catch (e) { return ''; }
  };
  return keys.map((k) => {
    const p = porDia[k];
    let estado = 'vacio';
    if (p) estado = p.status === 'published' ? 'publicado' : (p.status === 'scheduled' ? 'programado' : 'borrador');
    else if (stops.has(k)) estado = 'frenado';
    else if (k <= hoyKey && !enPrueba) estado = 'falta';
    return {
      key: k, dia: diaCortoDeKey(k), fecha: fechaCortaDeKey(k), es_hoy: k === hoyKey,
      estado, post_id: p ? p.id : null,
      hora: p ? horaEnTz(toMs(p.scheduled_at)) : '',
    };
  });
}

function posteosDe(db, uid, tz, opts) {
  const o = opts || {};
  const abs = typeof o.absImageUrl === 'function' ? o.absImageUrl : null;
  // (LOTE BOTONES-CONSERJE) El posteo FALLIDO también es parte de la
  // ficha: la tarjeta «Un posteo no salió» promete «Ver el posteo» y el
  // posteo tiene que estar en esta lista para que la consola lo pueda
  // mostrar (su tarjeta se pinta sin acciones, con su chip de estado).
  const rows = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status IN ('published', 'scheduled', 'draft', 'failed')
     ORDER BY COALESCE(scheduled_at, published_at, created_at) DESC LIMIT 12`).all(Number(uid)), []);
  // (LOTE CENSO-CONSERJE-2 · F3) El posteo referido (el deep link de
  // la push, «Ver el posteo») entra SIEMPRE en la ficha, aunque no
  // esté entre los 12 últimos: sin esto, la consola abría la ficha
  // sin el posteo y sin decir nada.
  const incluirId = Number(o.postId) || 0;
  if (incluirId && !rows.some((p) => Number(p.id) === incluirId)) {
    const extra = safe(() => db.prepare(
      `SELECT * FROM posts WHERE user_id = ? AND id = ? AND status IN ('published', 'scheduled', 'draft', 'failed')`).get(Number(uid), incluirId), null);
    if (extra) rows.push(extra);
  }
  return rows.map((p) => {
    const t = toMs(p.scheduled_at || p.published_at || p.created_at);
    let poster = '';
    if (typeof o.posterUrlFor === 'function') { try { poster = o.posterUrlFor(Number(uid), p) || ''; } catch (e) { poster = ''; } }
    return {
      id: p.id,
      titulo: conserjeRevision.tituloDe(p),
      caption: trunc(p.caption || '', 500),
      status: p.status || '', media_type: p.media_type || 'image', tipo: p.tipo || '',
      image_url: abs && p.image_path && !String(p.image_path).startsWith('data:') ? abs(Number(uid), p.image_path) : '',
      poster_url: poster,
      scheduled_at: p.scheduled_at || null, published_at: p.published_at || null,
      dia_key: Number.isFinite(t) ? safe(() => dayKeyInTz(new Date(t), tz), '') : '',
      approval: p.approval || '',
    };
  });
}

// ---------------------------------------------------------------------
// (LOTE CONSERJE-VER-GRANDE) La media COMPLETA de un posteo, para el
// visor en grande de la consola. Las superficies pintan miniaturas
// con lo mínimo (portada o póster); al tocar la imagen, el visor pide
// esto por la ruta posteo-media y muestra la pieza entera: las
// láminas del carrusel en su orden, la URL reproducible del video con
// su póster, y el caption SIN truncar. Fail-soft: sin posteo (o de
// otro usuario) devuelve null y el visor cae a su respaldo.
// ---------------------------------------------------------------------
function mediaDePosteo(db, uid, postId, opts) {
  const o = opts || {};
  const abs = typeof o.absImageUrl === 'function' ? o.absImageUrl : null;
  const p = safe(() => db.prepare(
    `SELECT * FROM posts WHERE id = ? AND user_id = ?`).get(Number(postId), Number(uid)), null);
  if (!p) return null;
  const absDe = (path) => {
    const s = String(path || '');
    if (!s || s.startsWith('data:')) return '';
    return abs ? (safe(() => abs(Number(uid), s), '') || '') : s;
  };
  const mt = String(p.media_type || 'image');
  const esVideo = ['video', 'reel', 'reels'].indexOf(mt.toLowerCase()) >= 0;
  let poster = '';
  if (esVideo && typeof o.posterUrlFor === 'function') { try { poster = o.posterUrlFor(Number(uid), p) || ''; } catch (e) { poster = ''; } }
  let slides = [];
  if (mt === 'carousel' && p.carousel_paths) {
    try {
      const arr = JSON.parse(p.carousel_paths);
      if (Array.isArray(arr)) slides = arr.map(absDe).filter(Boolean);
    } catch (e) { slides = []; }
  }
  const imageUrl = absDe(p.image_path);
  if (!slides.length && imageUrl && !esVideo) slides = [imageUrl];
  return {
    ok: true,
    post_id: p.id,
    titulo: conserjeRevision.tituloDe(p),
    caption: String(p.caption || ''),
    status: p.status || '', media_type: mt, tipo: p.tipo || '',
    image_url: imageUrl,
    poster_url: poster,
    video_url: esVideo ? imageUrl : '',
    slides,
  };
}


// (LOTE DESCUENTOS-CODIGO) El descuento del negocio para su ficha: el
// código vigente (aunque no sea el que manda) y la fuente que manda
// (el MAYOR descuento, sin sumar — misma regla que server.js).
function descuentoDe(db, uid) {
  try {
    const now = new Date().toISOString();
    const v = db.prepare(`SELECT c.code, c.percent, c.duration_months, r.redeemed_at, r.expires_at FROM discount_redemptions r JOIN discount_codes c ON c.id = r.code_id WHERE r.user_id = ? AND c.active = 1 AND (r.expires_at IS NULL OR r.expires_at > ?) ORDER BY r.id DESC LIMIT 1`).get(uid, now);
    let mult = 1, fuente = null;
    const n = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND plan_status = 'active'`).get(uid);
    if (n && n.n >= 2) { mult = 0.5; fuente = 'referidos'; }
    else {
      const me = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(uid);
      if (me && me.referred_by) { mult = 0.8; fuente = 'invitado'; }
    }
    if (v && (1 - (Number(v.percent) || 0) / 100) < mult) { mult = 1 - (Number(v.percent) || 0) / 100; fuente = 'codigo'; }
    if (!v && !fuente) return null;
    return {
      fuente, percent_off: Math.round((1 - mult) * 100),
      codigo: v ? { code: v.code, percent: Number(v.percent) || 0, duration_months: v.duration_months == null ? null : Number(v.duration_months), redeemed_at: v.redeemed_at, expires_at: v.expires_at } : null,
    };
  } catch (e) { return null; }
}

function cliente(db, userId, opts) {
  const o = opts || {};
  const uid = Number(userId) || 0;
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const u = safe(() => db.prepare(
    `SELECT u.id, u.email, u.plan, u.plan_status, u.is_guest, u.guest_ig, u.guest_domain,
            u.concierge, u.publishing_stopped, u.hold, u.hold_reason, u.trial_ends_at, u.trial_extended_until,
            u.trial_started_at, u.created_at,
            p.business_name, p.ig_username, p.category, p.ig_connected
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`).get(uid), null);
  if (!u) return { ok: false, error: 'sin_usuario' };
  const tz = conserjeRevision.accountTz(db, uid);
  const nowMs = Number(o.nowMs) || Date.now();
  const fila = filaRoster(db, u, o, nowMs);
  const absM = typeof o.absImageUrl === 'function' ? o.absImageUrl : (x) => x;
  const ficha = safe(() => conserjeRevision.fichaCliente(db, uid, {}), null);
  const planInfo = planDePrueba(db, u);
  const boost = safe(() => db.prepare(
    `SELECT id, post_id, status, budget_cents, fee_cents, error, created_at FROM ad_boosts
     WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(uid), null);
  return {
    ok: true,
    ...fila,
    ficha,
    semana: semanaDe(db, uid, tz, nowMs, u.plan_status),
    posteos: posteosDe(db, uid, tz, o),
    plan_prueba_detalle: planInfo ? {
      estrella: planInfo.plan.estrella,
      formatos: planInfo.plan.formatos,
      slots: planInfo.plan.slots,
      estrategia_aprobada: safe(() => modeloNuevo.estrategiaAprobada(db, uid), 0) > 0,
    } : null,
    boost: boost ? {
      id: boost.id, post_id: boost.post_id || null, status: boost.status || '',
      budget_cents: boost.budget_cents || 0, fee_cents: boost.fee_cents || 0,
      error: boost.error || '', created_at: boost.created_at || '',
    } : null,
    // (LOTE CONSERJE-PRODUCTO-DISENO) Su material: lo que el negocio
    // subió en «Subir» (la misma tabla que lee su álbum), más nuevo
    // primero — la pestaña «Material» de su ficha lo espeja.
    material: safe(() => db.prepare(
      `SELECT id, kind, file_path, thumb_path, album_tag, created_at FROM assets
       WHERE user_id = ? AND kind IN ('photo','video') ORDER BY created_at DESC LIMIT 24`).all(uid), [])
      .map((a) => ({
        id: a.id, kind: a.kind, tag: a.album_tag || '',
        img: a.thumb_path || a.file_path ? absM(uid, a.thumb_path || a.file_path) : '',
        cuando: a.created_at || '',
      })),
    descuento: descuentoDe(db, uid),
  };
}

// ---------------------------------------------------------------------
// ACCIONES de la consola (cada una escribe en su fuente real)
// ---------------------------------------------------------------------
// El pedido de voz que bamboo resolvió A MANO: queda registrado con su
// estado propio en la misma tabla de revisión de pedidos — deja de
// contar como pendiente en todas las lecturas (la lista de pedidos y
// los conteos leen el mismo estado) y el registro del equipo lo anota.
// NO pasa por la puerta «aprobado»: aprobar un pedido sobre un posteo
// dispara el ejecutor del software, y los audios los resuelve bamboo.
function marcarVozResuelto(db, messageId, actor) {
  try { supportCases.ensureSchema(db); } catch (e) { /* la escritura cae a su error */ }
  const mid = Number(messageId) || 0;
  if (!mid) return { ok: false, error: 'sin_pedido' };
  const m = safe(() => db.prepare(
    `SELECT id, user_id, text FROM chat_messages WHERE id = ? AND role = 'user' AND hilo IN ('post', 'semana', 'general')`).get(mid), null);
  if (!m) return { ok: false, error: 'pedido_inexistente' };
  safe(() => db.prepare(
    `INSERT INTO support_voz_pedidos (message_id, estado, decidido_en) VALUES (?, 'resuelto_mano', datetime('now'))
     ON CONFLICT(message_id) DO UPDATE SET estado = 'resuelto_mano', decidido_en = datetime('now')`).run(mid), null);
  const row = safe(() => db.prepare('SELECT estado FROM support_voz_pedidos WHERE message_id = ?').get(mid), null);
  if (!row) return { ok: false, error: 'no_se_guardo' };
  supportCases.logTeamAction(db, {
    actor: actor || 'equipo', action: 'voz_resuelta_mano',
    userId: Number(m.user_id), chatMsgId: mid,
    detalle: 'Pedido de voz resuelto a mano por el equipo: «' + trunc(m.text || '', 120) + '»',
  });
  return { ok: true, message_id: mid, estado: String(row.estado) };
}

// «Producir ahora»: la orden de producción entra a la MISMA cola que
// despierta al operador (el caso prueba_linea_mano que los pendientes
// del conserje ya levantan). Dedup por cuenta y día: dos toques no
// abren dos órdenes para lo mismo.
function abrirOrdenProduccion(db, userId, detalle, actor) {
  const uid = Number(userId) || 0;
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(uid), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const tz = conserjeRevision.accountTz(db, uid);
  const hoyKey = safe(() => dayKeyInTz(new Date(), tz), '') || new Date().toISOString().slice(0, 10);
  const r = supportCases.openCase(db, {
    userId: uid, tipo: 'prueba_linea_mano',
    titulo: 'Producir ahora — orden desde la consola del conserje',
    detalle: trunc(detalle || 'El equipo pidió producir la pieza que falta desde la consola.', 500),
    dueno: 'equipo', siguientePaso: 'Producir la pieza a mano y cargarla con la palanca de siempre.',
    dedupKey: 'vista-producir:' + uid + ':' + hoyKey,
  });
  if (r && r.ok && !r.duplicado) {
    supportCases.logTeamAction(db, { actor: actor || 'equipo', action: 'posteo_creado', userId: uid, caseId: r.caso ? r.caso.id : null, detalle: 'Orden de producción abierta desde la consola (caso #' + (r.caso ? r.caso.id : '?') + ').' });
  }
  return r;
}

function cerrarCaso(db, caseId) {
  return supportCases.closeCase(db, Number(caseId) || 0, { confirmadoPor: 'equipo — consola del conserje' });
}

// ---------------------------------------------------------------------
// LA VISTA COMPLETA
// ---------------------------------------------------------------------
function vista(db, opts) {
  const o = opts || {};
  const nowMs = Number(o.nowMs) || Date.now();
  const usuarios = usuariosAtendidos(db, nowMs);
  const filas = usuarios.map((u) => filaRoster(db, u, o, nowMs));
  // (LOTE CONSERJE-PRODUCTO-ACCION) Cada fila trae su urgencia: la
  // lista se ordena por ella y el botón «Ir al próximo con
  // problemas» salta con el mismo criterio.
  for (const f of filas) { f.urgencia = urgenciaDe(db, f.user_id, f.clase, o, nowMs); }
  // (LOTE CONSERJE-FORMA) La producción de mañana se computa una vez
  // y alimenta dos superficies: el centro (el tablero de mañana) y la
  // derecha (las decisiones del dueño y las faltas como problema).
  const mananaProd = produccionManana(db, filas, o, nowMs);
  const decs = decisiones(db, filas, { ...o, mananaProd }, nowMs);
  const cat = catalogoTratamientos(db);
  return {
    ok: true,
    generado_en: new Date(nowMs).toISOString(),
    hoy: resumenHoy(db, filas, decs, o, nowMs),
    clientes: filas,
    manana: mananaProd,
    mano: decs,
    decisiones: decs,
    ultimas: ultimasDecisiones(db, 15),
    cola: colaProduccion(db, filas),
    familias: cat.familias,
  };
}

// ---------------------------------------------------------------------
// SU PRODUCTO (LOTE CONSERJE-PRODUCTO · idea del dueño 24/11 19:12):
// el espejo fiel de lo que el cliente ve, al abrir su negocio en el
// conserje — su Inicio de hoy con SUS palabras y su idioma, sus
// pedidos abiertos con la espera, y la próxima pieza que todavía no
// llegó a su producto. La regla del espejo manda sobre la vista de
// admin: lo que el cliente no ve (needs_review = 1, la cola de
// revisión) acá NO se pinta como visto — va a «todavía no lo vio».
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// PIEZAS COMPARTIDAS DEL ESPEJO (LOTE CONSERJE-PRODUCTO-ACCION): la
// espera, los pedidos abiertos y el posteo visible de un día los
// computan igual «Su producto» y la urgencia de la lista — una sola
// fuente para que las dos superficies nunca se contradigan.
// ---------------------------------------------------------------------
function haceLabelDe(nowMs, utc) {
  if (!utc) return '';
  const t = new Date(String(utc).replace(' ', 'T') + (String(utc).includes('T') ? '' : 'Z')).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.max(1, Math.round((nowMs - t) / 60000));
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 48) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
  const d = Math.round(h / 24);
  return 'hace ' + d + (d === 1 ? ' día' : ' días');
}

function pedidosAbiertosDe(db, uid, o, nowMs) {
  const cola = safe(() => supportCases.voiceRequests(db, { limit: 60, userId: uid, absImageUrl: o.absImageUrl, posterUrlFor: o.posterUrlFor }), null);
  const out = [];
  for (const pd of (cola && cola.pedidos) || []) {
    const t = pd.cuando_utc ? new Date(String(pd.cuando_utc).replace(' ', 'T') + 'Z').getTime() : NaN;
    const espera = Number.isFinite(t) ? Math.max(1, Math.round((nowMs - t) / 60000)) : 0;
    if (pd.es_idea) {
      if (pd.idea_estado === 'recibida') out.push({ tipo: 'idea', ambito: '', texto: trunc(pd.pedido || '', 400), hace: haceLabelDe(nowMs, pd.cuando_utc), desde: pd.cuando_utc || '', espera_min: espera, message_id: pd.id || 0, post_id: 0 });
    } else if (pd.revision && pd.revision.estado === 'pendiente' && !pd.respuesta) {
      out.push({ tipo: 'pedido', ambito: pd.ambito || '', texto: trunc(pd.pedido || '', 400), hace: haceLabelDe(nowMs, pd.cuando_utc), desde: pd.cuando_utc || '', espera_min: espera, message_id: pd.id || 0, post_id: pd.posteo ? pd.posteo.id : 0 });
    }
  }
  out.sort((a, b) => String(a.desde).localeCompare(String(b.desde)));
  return out;
}

// El posteo de un día TAL COMO LO VE el cliente: el filtro de
// GET /api/posts (needs_review = 0) y el rango de semanaDe.
function postVisibleEn(db, uid, tz, key) {
  if (!key) return null;
  const rows = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND COALESCE(needs_review, 0) = 0 AND status IN ('published', 'scheduled', 'draft')`).all(uid), []);
  const rango = { published: 3, scheduled: 2, draft: 1 };
  let best = null;
  for (const p of rows) {
    const t = toMs(p.scheduled_at || p.published_at || p.created_at);
    if (!Number.isFinite(t)) continue;
    if (safe(() => dayKeyInTz(new Date(t), tz), '') !== key) continue;
    if (!best || (rango[p.status] || 0) > (rango[best.status] || 0)) best = p;
  }
  return best;
}

function shortcodeDe(permalink) {
  const m = /instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/.exec(String(permalink || ''));
  return m ? m[1] : '';
}

// LO PROMETIDO CONTRA LO REAL: las tres promesas que su pantalla le
// hizo, tildadas de los datos — cumplida, pendiente o rota. Nada se
// marca cumplido sin el hecho detrás.
function promesasDe(db, u, tz, nowMs, hoyKey, hoyPost, en, horaDe) {
  const uid = u.id;
  const out = [];
  // (a) el posteo de hoy sale a su hora
  const bh = (u.best_hour >= 9 && u.best_hour <= 21) ? u.best_hour : 19;
  let horaTxt, estadoA, detalleA;
  if (hoyPost && hoyPost.status === 'published') {
    horaTxt = horaDe(toMs(hoyPost.published_at || hoyPost.scheduled_at), en);
    estadoA = 'cumplida'; detalleA = en ? 'It went out.' : 'Salió.';
  } else {
    const fallidoHoy = safe(() => db.prepare(
      `SELECT scheduled_at FROM posts WHERE user_id = ? AND status = 'failed'`).all(uid), [])
      .some((p) => safe(() => dayKeyInTz(new Date(toMs(p.scheduled_at)), tz), '') === hoyKey);
    if (hoyPost && hoyPost.scheduled_at) horaTxt = horaDe(toMs(hoyPost.scheduled_at), en);
    else horaTxt = en ? (((bh + 11) % 12) + 1) + ':00 ' + (bh < 12 ? 'AM' : 'PM') : bh + ':00';
    if (fallidoHoy) { estadoA = 'rota'; detalleA = en ? 'It was supposed to go out and failed.' : 'Tenía que salir y falló.'; }
    else if (hoyPost) {
      const t = toMs(hoyPost.scheduled_at);
      const vencida = Number.isFinite(t) && nowMs > t + 15 * 60000;
      estadoA = vencida ? 'rota' : 'pendiente';
      detalleA = vencida ? (en ? 'The time passed and it did not go out.' : 'Pasó la hora y no salió.') : (en ? 'Loaded and scheduled.' : 'Cargado y programado.');
    } else {
      let pasada = false;
      try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(nowMs));
        const hh = Number((parts.find((x) => x.type === 'hour') || {}).value || 0);
        const mm = Number((parts.find((x) => x.type === 'minute') || {}).value || 0);
        pasada = (hh * 60 + mm) > (bh * 60 + 15);
      } catch (e) {}
      estadoA = pasada ? 'rota' : 'pendiente';
      detalleA = pasada ? (en ? 'The time passed with nothing loaded.' : 'Pasó la hora y no hay nada cargado.') : (en ? 'Still to be loaded.' : 'Todavía no se cargó.');
    }
  }
  out.push({ clave: 'hoy', texto: en ? 'Out today · ' + horaTxt : 'Sale a las ' + horaTxt, estado: estadoA, detalle: detalleA });
  // (b) tu semana lista: una pieza por día (visible o en revisión)
  let estadoB = 'pendiente', detalleB = '';
  if (hoyKey) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoyKey);
    const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
    const lunes = shiftDayKey(hoyKey, -((dow + 6) % 7));
    const conPieza = new Set();
    const rows = safe(() => db.prepare(
      `SELECT scheduled_at, published_at, created_at FROM posts WHERE user_id = ? AND status IN ('published', 'scheduled', 'draft')`).all(uid), []);
    for (const p of rows) {
      const t = toMs(p.scheduled_at || p.published_at || p.created_at);
      if (Number.isFinite(t)) { const k = safe(() => dayKeyInTz(new Date(t), tz), ''); if (k) conPieza.add(k); }
    }
    let faltan = 0, rotaB = false;
    for (let i = 0; i < 7; i++) {
      const k = shiftDayKey(lunes, i);
      if (!conPieza.has(k)) { faltan++; if (k < hoyKey) rotaB = true; }
    }
    if (!faltan) { estadoB = 'cumplida'; detalleB = en ? 'The seven days have their piece.' : 'Los siete días tienen su pieza.'; }
    else if (rotaB) { estadoB = 'rota'; detalleB = en ? 'A past day went by without its post.' : 'Un día pasado quedó sin su posteo.'; }
    else { estadoB = 'pendiente'; detalleB = en ? (faltan + (faltan === 1 ? ' day' : ' days') + ' still to load.') : ('Faltan ' + faltan + (faltan === 1 ? ' día' : ' días') + ' por cargar.'); }
  }
  out.push({ clave: 'semana', texto: en ? 'Your week, planned' : 'Tu semana lista', estado: estadoB, detalle: detalleB });
  // (c) mañana a las 9:00 lo ves acá
  const mananaKey = hoyKey ? shiftDayKey(hoyKey, 1) : '';
  const visManana = mananaKey ? postVisibleEn(db, uid, tz, mananaKey) : null;
  let estadoC, detalleC;
  if (visManana) { estadoC = 'cumplida'; detalleC = en ? 'Already in their product.' : 'Ya está en su producto.'; }
  else {
    const hayManana = mananaKey ? safe(() => db.prepare(
      `SELECT id, scheduled_at, created_at FROM posts WHERE user_id = ? AND status IN ('scheduled', 'draft')`).all(uid), [])
      .some((p) => safe(() => dayKeyInTz(new Date(toMs(p.scheduled_at || p.created_at)), tz), '') === mananaKey) : false;
    estadoC = 'pendiente';
    detalleC = hayManana ? (en ? 'Loaded, waiting in review.' : 'Cargada, espera en revisión.') : (en ? 'Not loaded yet.' : 'Todavía no se cargó.');
  }
  out.push({ clave: 'manana', texto: en ? 'Tomorrow at 9:00 AM, here' : 'Mañana 9:00 lo ves acá', estado: estadoC, detalle: detalleC });
  return out;
}

// SU INSTAGRAM REAL contra lo que el producto cree: el último
// publicado del producto tiene que estar en su Instagram. La
// diferencia solo se afirma cuando el publicado cae dentro de la
// ventana que la lectura cubre — afuera de la ventana, no se sabe.
function igRealDe(db, uid, nowMs) {
  const pub = safe(() => db.prepare(
    `SELECT id, caption, ig_permalink, published_at FROM posts WHERE user_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 1`).get(uid), null);
  const ultimoProducto = pub ? { post_id: pub.id, titulo: conserjeRevision.tituloDe(pub), cuando: haceLabelDe(nowMs, pub.published_at), permalink: pub.ig_permalink || '' } : null;
  const snap = safe(() => db.prepare('SELECT payload, fetched_at FROM ig_home_snapshot WHERE user_id = ?').get(uid), null);
  if (!snap) return { estado: 'sin_lectura', ultimo_real: null, ultimo_producto: ultimoProducto, leido_hace: '' };
  let recents = [];
  try { recents = (JSON.parse(snap.payload) || {}).recents || []; } catch (e) {}
  const r0 = recents[0] || null;
  const ultimoReal = r0 ? { img: r0.img || '', shortcode: r0.shortcode || '', cuando: haceLabelDe(nowMs, r0.taken_at) } : null;
  const leidoHace = snap.fetched_at ? haceLabelDe(nowMs, new Date(Number(snap.fetched_at)).toISOString()) : '';
  if (!pub) return { estado: 'sin_publicados', ultimo_real: ultimoReal, ultimo_producto: null, leido_hace: leidoHace };
  const sc = shortcodeDe(pub.ig_permalink);
  let estado;
  if (sc && recents.some((r) => r.shortcode === sc)) estado = 'confirma';
  else {
    const oldest = recents.length ? toMs(recents[recents.length - 1].taken_at) : NaN;
    const pubMs = toMs(pub.published_at);
    estado = (Number.isFinite(oldest) && Number.isFinite(pubMs) && pubMs >= oldest) ? 'no_esta' : 'sin_lectura';
  }
  return { estado, ultimo_real: ultimoReal, ultimo_producto: ultimoProducto, leido_hace: leidoHace };
}

// SI EL CLIENTE ESTÁ MIRANDO: su actividad real en el producto —
// la última actividad registrada, cuándo vio su Inicio (su semana)
// y cuándo aceptó un posteo. Sin evento, no se muestra: sin fuente
// no hay señal.
function actividadDe(db, uid, nowMs) {
  const ultimo = safe(() => db.prepare('SELECT created_at FROM events WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(uid), null);
  const vio = safe(() => db.prepare(
    `SELECT created_at FROM events WHERE user_id = ? AND name = 'screen_view' AND props LIKE '%inicio%' ORDER BY created_at DESC LIMIT 1`).get(uid), null);
  const acepto = safe(() => db.prepare(
    `SELECT created_at FROM events WHERE user_id = ? AND name IN ('apv_approve', 'draft_accept', 'accept_all', 'f3_dbltap_approve') ORDER BY created_at DESC LIMIT 1`).get(uid), null);
  return {
    ultima_hace: ultimo ? haceLabelDe(nowMs, ultimo.created_at) : '',
    vio_hace: vio ? haceLabelDe(nowMs, vio.created_at) : '',
    acepto_hace: acepto ? haceLabelDe(nowMs, acepto.created_at) : '',
  };
}

// LA URGENCIA DE UNA CUENTA para ordenar la lista: pedido vencido
// (la promesa de 30 minutos rota) → hoy sin posteo a la vista →
// semana incompleta → el resto. Las clases que no producen posteos
// (espacios) quedan en el resto: no ensucian el orden.
function urgenciaDe(db, uid, clase, o, nowMs) {
  const RESTO = { nivel: 3, motivo: '', detalle: '', espera_min: 0 };
  if (!['pago', 'prueba_corriendo', 'prueba_pendiente', 'casa'].includes(clase)) return RESTO;
  const u = safe(() => db.prepare(
    `SELECT u.id, u.plan_status, u.created_at, u.trial_started_at, u.is_guest, u.guest_ig, u.guest_domain,
            p.ig_username
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`).get(uid), null);
  if (!u) return RESTO;
  const pedidos = pedidosAbiertosDe(db, uid, o, nowMs);
  const vencido = pedidos.find((p) => p.espera_min > 30);
  if (vencido) return { nivel: 0, motivo: 'pedido_vencido', detalle: 'Un pedido espera ' + vencido.hace, espera_min: vencido.espera_min };
  const tz = conserjeRevision.accountTz(db, uid);
  const hoyKey = safe(() => dayKeyInTz(new Date(nowMs), tz), '');
  if (!hoyKey) return RESTO;
  if (!postVisibleEn(db, uid, tz, hoyKey)) return { nivel: 1, motivo: 'sin_posteo_hoy', detalle: 'Hoy sin posteo a la vista', espera_min: 0 };
  if (u.plan_status === 'trial') {
    const planInfo = planDePrueba(db, u);
    const inicio = Number(u.trial_started_at) || 0;
    if (planInfo && inicio > 0) {
      const dias = Math.floor((nowMs - inicio) / 86400000);
      const vencidoSlot = planInfo.plan.slots.some((s, i) => s.estado !== 'listo' && dias >= i);
      if (vencidoSlot) return { nivel: 2, motivo: 'semana_incompleta', detalle: 'Su prueba tiene una pieza vencida', espera_min: 0 };
    }
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoyKey);
    if (m) {
      const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
      const lunes = shiftDayKey(hoyKey, -((dow + 6) % 7));
      const stops = new Set(safe(() => db.prepare('SELECT day_key FROM day_stops WHERE user_id = ?').all(uid), []).map((r) => r.day_key));
      const creadaKey = u.created_at ? safe(() => dayKeyInTz(new Date(toMs(u.created_at)), tz), '') : '';
      for (let k = lunes; k < hoyKey; k = shiftDayKey(k, 1)) {
        if (creadaKey && k < creadaKey) continue;
        if (stops.has(k)) continue;
        if (!postVisibleEn(db, uid, tz, k)) return { nivel: 2, motivo: 'semana_incompleta', detalle: 'Le falta un posteo esta semana', espera_min: 0 };
      }
    }
  }
  return RESTO;
}

// ---------------------------------------------------------------------
// EL CHAT DEL DUEÑO CON BAMBOO (LOTE CONSERJE-INICIO · pedido del
// dueño 24/11): en la ficha de cada negocio, el dueño le pide un
// cambio a bamboo por escrito. El hilo vive en dueno_chat; cada
// mensaje del dueño abre (o renueva) su tarea en la cola del conserje
// — un caso pedido_dueno por negocio — y la respuesta de bamboo la
// cierra. Nada de esto lo ve el cliente: es la línea interna.
// ---------------------------------------------------------------------
function ensureDuenoChat(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS dueno_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    autor TEXT NOT NULL,
    texto TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function duenoChatDe(db, uid, nowMs) {
  ensureDuenoChat(db);
  const rows = safe(() => db.prepare(
    'SELECT autor, texto, created_at FROM dueno_chat WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(Number(uid)), []);
  return rows.reverse().map((m) => ({
    autor: m.autor === 'bamboo' ? 'bamboo' : 'dueno',
    texto: m.texto || '',
    hace: haceLabelDe(nowMs, m.created_at),
  }));
}

function duenoChatAgregar(db, userId, autor, texto) {
  const uid = Number(userId) || 0;
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(uid), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const t = trunc(String(texto || '').trim(), 1000);
  if (!t) return { ok: false, error: 'sin_texto' };
  const a = autor === 'bamboo' ? 'bamboo' : 'dueno';
  ensureDuenoChat(db);
  db.prepare('INSERT INTO dueno_chat (user_id, autor, texto) VALUES (?, ?, ?)').run(uid, a, t);
  if (a === 'dueno') {
    safe(() => supportCases.openCase(db, {
      userId: uid, tipo: 'pedido_dueno',
      titulo: 'Pedido del dueño en el chat de la ficha',
      detalle: t,
      dueno: 'equipo', siguientePaso: 'Hacer el cambio y responderle al dueño en el chat de la ficha.',
      dedupKey: 'dueno-chat:' + uid,
    }), null);
  } else {
    const c = safe(() => db.prepare(
      "SELECT id FROM support_cases WHERE dedup_key = ? AND estado <> 'cerrado' ORDER BY id DESC LIMIT 1").get('dueno-chat:' + uid), null);
    if (c && c.id) safe(() => supportCases.closeCase(db, c.id, { confirmadoPor: 'bamboo — respondió en el chat de la ficha' }), null);
  }
  return { ok: true, dueno_chat: duenoChatDe(db, uid, Date.now()) };
}

function producto(db, userId, opts) {
  const o = opts || {};
  const uid = Number(userId) || 0;
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const u = safe(() => db.prepare(
    `SELECT u.id, u.lang, u.plan_status, u.is_guest, u.guest_ig, u.guest_domain, u.best_hour,
            p.business_name, p.ig_username
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`).get(uid), null);
  if (!u) return { ok: false, error: 'sin_usuario' };
  const tz = conserjeRevision.accountTz(db, uid);
  const en = u.lang === 'en';
  const nowMs = Number(o.nowMs) || Date.now();
  const hoyKey = safe(() => dayKeyInTz(new Date(nowMs), tz), '');
  const abs = typeof o.absImageUrl === 'function' ? o.absImageUrl : null;
  const horaDe = (ms, h12) => {
    if (!Number.isFinite(ms)) return '';
    try { return new Intl.DateTimeFormat(en ? 'en-US' : 'es', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: !!h12 }).format(new Date(ms)); }
    catch (e) { return ''; }
  };
  // --- 1 · su posteo de hoy, como lo ve él (filtro del cliente:
  // GET /api/posts esconde needs_review = 1; el rango por día es el
  // mismo de semanaDe: publicado > programado > borrador) ---
  const hoyPost = postVisibleEn(db, uid, tz, hoyKey);
  let hoy;
  if (hoyPost) {
    const t = toMs(hoyPost.scheduled_at || hoyPost.published_at);
    let poster = '';
    if (typeof o.posterUrlFor === 'function') { try { poster = o.posterUrlFor(uid, hoyPost) || ''; } catch (e) { poster = ''; } }
    const img = poster || (abs && hoyPost.image_path && !String(hoyPost.image_path).startsWith('data:') ? abs(uid, hoyPost.image_path) : '');
    const estado = hoyPost.status === 'published' ? 'publicado' : (hoyPost.status === 'scheduled' ? 'sale_hoy' : 'borrador');
    const linea = estado === 'publicado'
      ? (en ? 'Already out · ' + horaDe(t, true) : 'Ya salió · ' + horaDe(t, false))
      : estado === 'sale_hoy'
        ? (en ? 'Today · ' + horaDe(t, true) : 'Sale hoy · ' + horaDe(t, false))
        : (en ? 'Draft in their week' : 'Borrador en su semana');
    hoy = { estado, post_id: hoyPost.id, titulo: conserjeRevision.tituloDe(hoyPost), hora: horaDe(t, en), linea, img, fecha_key: hoyKey };
  } else {
    // Las dos caras de su tarjeta vacía (pzHoyVaciaPromesaHTML):
    // antes de las 9:00 de SU zona, la promesa; desde las 9:00, el
    // armado. El espejo dice lo mismo que su pantalla.
    let hh = -1;
    try { hh = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(nowMs)), 10); } catch (e) {}
    if (!(hh >= 0 && hh <= 23)) hh = new Date(nowMs).getHours();
    hoy = hh < 9
      ? { estado: 'antes_de_las_9', post_id: null, titulo: '', hora: '', linea: en ? 'Your next post · available at 9:00 AM' : 'Tu próximo posteo · disponible a las 9:00', img: '', fecha_key: hoyKey }
      : { estado: 'en_armado', post_id: null, titulo: '', hora: '', linea: en ? "Today's post · is being built" : 'Tu posteo de hoy · está en armado', img: '', fecha_key: hoyKey };
  }
  // --- 2 · sus pedidos abiertos (el helper compartido) ---
  const pedidos = pedidosAbiertosDe(db, uid, o, nowMs);
  // --- 3 · lo próximo que todavía no vio: primero la pieza cargada
  // que su producto esconde (la cola de revisión); si no hay, la
  // pieza de su plan de prueba que sigue en preparación. ---
  let siguiente = null;
  // (LOTE CONSERJE-RECHAZO-FUERA · regla del dueño 24/11: «si es vieja,
  // no tiene que aparecer más en el conserje») La pieza «próxima» nunca
  // es una rechazada ni una cuya fecha de salida ya pasó: se recorren
  // las candidatas en orden de salida y se toma la primera vigente.
  // El borrador sin fecha (el que volvió por «arreglar») sí es vigente:
  // esta tarjeta es su puerta de re-decisión.
  const candidatas = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND COALESCE(needs_review, 0) = 1 AND status IN ('scheduled', 'draft')
     AND COALESCE(approval, 'pending') <> 'rejected'
     ORDER BY COALESCE(scheduled_at, created_at) ASC LIMIT 8`).all(uid), []);
  let invisible = null;
  for (const cand of candidatas) {
    if (cand.scheduled_at) {
      const tCand = toMs(cand.scheduled_at);
      const kCand = Number.isFinite(tCand) ? safe(() => dayKeyInTz(new Date(tCand), tz), '') : '';
      if (kCand && hoyKey && kCand < hoyKey) continue;
    }
    invisible = cand;
    break;
  }
  if (invisible) {
    const t = toMs(invisible.scheduled_at || invisible.created_at);
    const k = Number.isFinite(t) ? safe(() => dayKeyInTz(new Date(t), tz), '') : '';
    siguiente = {
      estado: 'en_revision', post_id: invisible.id, titulo: conserjeRevision.tituloDe(invisible),
      fecha: k ? fechaCortaDeKey(k) : '', fecha_key: k || '', hora: horaDe(t, false),
      detalle: 'Está en la cola de revisión: sale cuando lo aceptás.',
    };
  } else {
    const planInfo = planDePrueba(db, u);
    const slot = planInfo && planInfo.plan.slots.find((s) => s.estado !== 'listo');
    if (slot) {
      siguiente = {
        estado: 'en_preparacion', post_id: null, titulo: slot.nombre || '',
        fecha: slot.fecha || '', hora: slot.hora || '',
        detalle: 'Pieza de su prueba en preparación: todavía no se cargó a su producto.',
      };
    }
  }
  // --- 4 · lo prometido contra lo real · 5 · su Instagram real ·
  // 6 · si el cliente está mirando ---
  const promesas = promesasDe(db, u, tz, nowMs, hoyKey, hoyPost, en, horaDe);
  const igReal = igRealDe(db, uid, nowMs);
  const actividad = actividadDe(db, uid, nowMs);
  return {
    ok: true, user_id: uid, lang: en ? 'en' : 'es',
    business_name: u.business_name || '', ig_username: u.ig_username || '',
    hoy, pedidos: pedidos.slice(0, 8), siguiente, promesas, ig_real: igReal, actividad,
    dueno_chat: duenoChatDe(db, uid, nowMs),
  };
}

module.exports = {
  catalogoTratamientos,
  tratamientoDe,
  asignarTratamiento,
  planDePrueba,
  finEfectivoPrueba,
  claseDeCuenta,
  produccionManana,
  rachaDe,
  pendientesDe,
  usuariosAtendidos,
  filaRoster,
  resumenHoy,
  decisiones,
  ultimasDecisiones,
  colaProduccion,
  semanaDe,
  posteosDe,
  mediaDePosteo,
  cliente,
  producto,
  marcarVozResuelto,
  abrirOrdenProduccion,
  cerrarCaso,
  duenoChatAgregar,
  duenoChatDe,
  vista,
};
