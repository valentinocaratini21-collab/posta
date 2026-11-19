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

function usuariosAtendidos(db) {
  const rows = safe(() => db.prepare(
    `SELECT u.id, u.email, u.plan, u.plan_status, u.is_guest, u.guest_ig, u.guest_domain,
            u.concierge, u.publishing_stopped, u.trial_ends_at, u.created_at,
            p.business_name, p.ig_username, p.category
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE (u.id = ${conserjeRevision.OWNER_USER_ID}
        OR COALESCE(u.concierge, 0) = 1
        OR (u.plan_status IN ('active', 'trial') AND COALESCE(u.plan, '') <> 'free' AND COALESCE(p.business_name, '') <> '')
        OR EXISTS (SELECT 1 FROM support_cases c WHERE c.user_id = u.id AND c.estado <> 'cerrado')
        OR COALESCE(u.is_guest, 0) = 1)
       AND (${EXCLUYE_EMAIL} OR u.id = ${conserjeRevision.OWNER_USER_ID})
     ORDER BY u.id ASC`).all(), []);
  // El invitado de la puerta entra solo si su prueba existe de verdad:
  // semana en trial_cache, posteos o un caso abierto. La puerta deja
  // cuentas a medio abrir que nadie atiende; no son roster.
  return rows.filter((u) => {
    if (!u.is_guest || u.id === conserjeRevision.OWNER_USER_ID) return true;
    if (u.concierge || (u.plan_status === 'active')) return true;
    const conCasos = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM support_cases WHERE user_id = ? AND estado <> 'cerrado'`).get(u.id), { c: 0 }).c > 0;
    if (conCasos) return true;
    const conPosts = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM posts WHERE user_id = ?`).get(u.id), { c: 0 }).c > 0;
    if (conPosts) return true;
    return !!planDePrueba(db, u);
  });
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
  // La línea de estado: el hecho más urgente, en palabras llanas.
  let dot = 'grey', estado = '';
  if (etapa && etapa.clave === 'en_rojo') { dot = 'yellow'; estado = etapa.motivo || 'Necesita atención'; }
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
    business_name: u.business_name || u.guest_ig || u.email || '',
    ig_username: u.ig_username || u.guest_ig || '',
    email: u.email || '',
    categoria: u.category || '',
    plan: u.plan || '', plan_status: u.plan_status || '',
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
    pruebas_activas: filas.filter((f) => f.plan_status === 'trial').length,
    decisiones_pendientes: decisionesList.length,
    suscriptores,
    meta_marzo: 30,
    disco_mb: (o.diskFreeMB != null ? o.diskFreeMB : null),
  };
}

// ---------------------------------------------------------------------
// DECISIONES — todo lo que espera al equipo, de fuentes reales
// ---------------------------------------------------------------------
function decisiones(db, filas, opts, nowMs) {
  const o = opts || {};
  const abs = typeof o.absImageUrl === 'function' ? o.absImageUrl : null;
  const porId = {};
  for (const f of filas) porId[f.user_id] = f;
  const out = [];

  // 1 · Pedidos por voz sin revisión (la misma lista que lee la
  // superficie de pedidos-voz: transcripción + lo que Posty entendió).
  try {
    const vr = supportCases.voiceRequests(db, { limit: 60, absImageUrl: o.absImageUrl, posterUrlFor: o.posterUrlFor });
    for (const p of (vr.pedidos || [])) {
      if (!p.revision || p.revision.estado !== 'pendiente') continue;
      const f = porId[p.user_id];
      out.push({
        tipo: 'voz', id: 'voz-' + p.id, user_id: p.user_id,
        business_name: (f && f.business_name) || p.business_name || '',
        ig_username: (f && f.ig_username) || p.ig_username || '',
        titulo: 'Nota de voz', ambito: p.ambito, cuando: p.cuando || '',
        pedido: p.pedido || '', respuesta: p.respuesta || '',
        message_id: p.id, posteo: p.posteo || null,
      });
    }
  } catch (e) { /* sin lista de voz: las demás decisiones igual salen */ }

  // 2 · La cola de la noche: el posteo de mañana sin decidir, y el
  // perfil que mañana no tiene posteo (decisión «Posty lo arma»).
  try {
    const cola = conserjeRevision.colaRevision(db, { fecha: o.fechaRevision, absImageUrl: o.absImageUrl, posterUrlFor: o.posterUrlFor, nowMs });
    for (const it of (cola.items || [])) {
      if (!it.post || it.decision) continue;
      out.push({
        tipo: 'pieza', id: 'pieza-' + it.user_id + '-' + cola.fecha,
        user_id: it.user_id, business_name: it.business_name || '', ig_username: it.ig_username || '',
        titulo: it.post.titulo || 'Posteo de mañana', texto: trunc(it.post.caption || '', 400),
        image_url: it.post.image_url || '', poster_url: it.post.poster_url || '',
        media_type: it.post.media_type || 'image',
        necesita_atencion: !!it.necesita_atencion, motivo_atencion: it.motivo_atencion || '',
        cuando: it.post.cuando || '', fecha: cola.fecha, post_id: it.post.id, origen: it.origen || '',
      });
    }
    for (const it of (cola.sin_posteo || [])) {
      if (it.decision) continue;
      out.push({
        tipo: 'pieza_falta', id: 'falta-' + it.user_id + '-' + cola.fecha,
        user_id: it.user_id, business_name: it.business_name || '', ig_username: it.ig_username || '',
        titulo: 'Mañana sin posteo', texto: 'Este perfil no tiene posteo para mañana. La decisión «Posty lo arma» lo deja registrado para producción.',
        fecha: cola.fecha,
      });
    }
  } catch (e) { /* sin cola legible: no se fabrican piezas */ }

  // 3 · Impulsos en error (ad_boosts): el hecho y su motivo, tal cual
  // quedó guardado. Lo ya visto por el equipo (registro «impulso_visto»
  // con el id del impulso en el detalle) no vuelve a pedir decisión.
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
      out.push({
        tipo: 'impulso', id: 'impulso-' + b.id, user_id: b.user_id,
        business_name: (f && f.business_name) || b.business_name || '',
        ig_username: (f && f.ig_username) || b.ig_username || '',
        titulo: 'Impulso en error', texto: String(b.error || 'Meta rechazó la creación del impulso.'),
        post_id: b.post_id || null, boost_id: b.id,
        budget_cents: b.budget_cents || 0, fee_cents: b.fee_cents || 0,
        created_at: b.created_at || '',
      });
    }
  } catch (e) { /* sin tabla de impulsos legible: nada que mostrar */ }

  // 4 · Alertas de hecho: disco bajo y posteos de video publicados sin
  // portada (la portada se lee de la columna guardada: esta vista no
  // extrae frames ni toca los posteos). Lo de portada ya visto por el
  // equipo (registro «portada_vista») no se repite.
  if (o.diskFreeMB != null && o.diskFreeMB < 1024) {
    out.push({
      tipo: 'alerta', id: 'alerta-disco', user_id: null,
      business_name: '', ig_username: '',
      titulo: 'Disco del servidor bajo',
      texto: 'Quedan ' + o.diskFreeMB + ' MB libres. Si se llena, la app deja de guardar posteos.',
      kind: 'disco', disco_mb: o.diskFreeMB,
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
          tipo: 'alerta', id: 'portada-' + r.id, user_id: r.user_id,
          business_name: (f && f.business_name) || '', ig_username: (f && f.ig_username) || '',
          titulo: 'Posteo de video sin portada',
          texto: 'El posteo #' + r.id + ' se publicó sin imagen de portada: en su grilla se ve un ícono genérico.',
          kind: 'portada', post_id: r.id,
        });
      }
    }
  } catch (e) { /* sin lectura de portadas: la alerta no se fabrica */ }

  // 5 · Casos abiertos (las necesidades): todo caso que no sea la
  // producción a mano (esa vive en la cola) espera una decisión.
  try {
    const casos = supportCases.listCases(db, { estado: 'abierto', limit: 50 });
    for (const c of casos) {
      if (c.tipo === 'prueba_linea_mano') continue;
      const f = porId[c.user_id];
      out.push({
        tipo: 'caso', id: 'caso-' + c.id, user_id: c.user_id,
        business_name: (f && f.business_name) || c.business_name || '',
        ig_username: (f && f.ig_username) || c.ig_username || '',
        titulo: c.titulo || 'Caso abierto',
        texto: trunc(c.detalle || '', 400),
        siguiente_paso: c.siguiente_paso || '', dueno: c.dueno || '',
        case_id: c.id, caso_tipo: c.tipo || '', created_at: c.created_at || '',
      });
    }
  } catch (e) { /* sin casos: la columna queda con lo demás */ }

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
     WHERE c.tipo = 'prueba_linea_mano' AND c.estado <> 'cerrado'
     ORDER BY c.id ASC`).all(), []);
  for (const c of casos) {
    const f = porId[c.user_id];
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
  const rows = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status IN ('published', 'scheduled', 'draft')
     ORDER BY COALESCE(scheduled_at, published_at, created_at) DESC LIMIT 12`).all(Number(uid)), []);
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

function cliente(db, userId, opts) {
  const o = opts || {};
  const uid = Number(userId) || 0;
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const u = safe(() => db.prepare(
    `SELECT u.id, u.email, u.plan, u.plan_status, u.is_guest, u.guest_ig, u.guest_domain,
            u.concierge, u.publishing_stopped, u.trial_ends_at, u.created_at,
            p.business_name, p.ig_username, p.category
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`).get(uid), null);
  if (!u) return { ok: false, error: 'sin_usuario' };
  const tz = conserjeRevision.accountTz(db, uid);
  const nowMs = Number(o.nowMs) || Date.now();
  const fila = filaRoster(db, u, o, nowMs);
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
  const usuarios = usuariosAtendidos(db);
  const filas = usuarios.map((u) => filaRoster(db, u, o, nowMs));
  const decs = decisiones(db, filas, o, nowMs);
  const cat = catalogoTratamientos(db);
  return {
    ok: true,
    generado_en: new Date(nowMs).toISOString(),
    hoy: resumenHoy(db, filas, decs, o, nowMs),
    clientes: filas,
    decisiones: decs,
    ultimas: ultimasDecisiones(db, 15),
    cola: colaProduccion(db, filas),
    familias: cat.familias,
  };
}

module.exports = {
  catalogoTratamientos,
  tratamientoDe,
  asignarTratamiento,
  planDePrueba,
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
  cliente,
  marcarVozResuelto,
  abrirOrdenProduccion,
  cerrarCaso,
  vista,
};
