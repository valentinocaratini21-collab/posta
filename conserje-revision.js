'use strict';
// conserje-revision.js — REVISIÓN DE LA NOCHE DEL CONSERJE (lote conserje-revision, base v748).
//
// Valentino + Posty revisan juntos, DE NOCHE (19:00–00:00 hora del dueño),
// los posteos DEL DÍA SIGUIENTE y deciden qué posteo va en cada perfil.
// La revisión es el corazón del conserje: una cola por perfil (uno tras
// otro), una decisión por perfil (sale así / pedir arreglo / no sale),
// progreso (X de Y revisados), y a las 00:00 todo decidido o retenido.
//
// Reglas decididas en este lote (ver STATUS.md del lote para el porqué):
// · Una decisión por perfil y fecha (la última vale; se puede cambiar).
// · 'sale' aprueba: la elección ES la revisión (igual que el pick del ritual).
// · 'arreglar' devuelve el posteo a borrador + guarda la nota como regla de
//   estilo; el reemplazo lo hace la pipeline de la mañana (generarlo de
//   noche y que la mañana genere otro sería doble gasto).
// · 'no_sale' rechaza el posteo y lo saca del slot (borrador). "No sale"
//   significa "este posteo no", no "nada ese día": la pipeline siempre
//   garantiza un posteo por día (ensureTodayPost genera uno si falta).
// · A las 00:00, lo sin revisar CON problema queda retenido (no sale);
//   lo limpio sin revisar lo decide el cliente a las 9:00 con su ritual.
//   La revisión del dueño es una capa extra, nunca un veto sobre el
//   ritual del cliente.
// · La ventana 19:00–00:00 es una guía, no un candado: decidir fuera de
//   hora también vale (el dueño puede revisar antes).
// · Sin push en este lote: la cola ya trae todo lo que un aviso
//   necesitaría (por perfil + motivo); el push se agrega después.
// · La cola nunca hardcodea clientes ni posteos: lee lo vivo.

const { dayKeyInTz } = require('./morning-post-push');
const clientDigest = require('./client-digest'); // fundamento: productos, paleta, onboarding q1–q8

const OWNER_USER_ID = 12; // Valentino: su cuenta; su zona horaria manda la ventana.
const VENTANA_ABRE_HORA = 19; // 19:00
const VENTANA_CIERRA_HORA = 0; // 00:00
const DECISIONES = ['sale', 'arreglar', 'no_sale', 'retenido', 'pedir'];
const DECISION_LABEL = {
  sale: 'Sale así', arreglar: 'Pedir que lo arregle', no_sale: 'No sale',
  retenido: 'Retenido', pedir: 'Posty lo arma',
};

// Frases de chrome de tienda que nunca son el producto: si aparecen en el
// título o en el caption, el posteo necesita atención. Lista corta y
// deliberada (solo marcadores inequívocos; un "Shop now" en el caption es
// un llamado válido, no un marcador — por eso el título se escanea con la
// lista completa y el caption solo con los marcadores fuertes).
const CHROME_TITULO = [
  'country/region', 'country / region', 'your bag', 'shopping bag',
  'shopping cart', 'new arrivals', 'shop all', 'shop now', 'my account',
  'my cart', 'my wishlist', 'track order', 'track your order', 'sign in',
  'log in', 'join our tribe', 'join the tribe', 'wishlist',
];
const CHROME_CAPTION = [
  'country/region', 'country / region', 'your bag', 'shopping bag',
  'shopping cart', 'new arrivals', 'my account', 'my cart',
  'track order', 'track your order', 'sign in', 'log in', 'join our tribe',
  'join the tribe',
];

function safe(fn, fallback) { try { const r = fn(); return r === undefined ? fallback : r; } catch (e) { return fallback; } }
function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) : s; }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

// "2026-11-08 17:00" como hora local en tz → ISO UTC (mismo algoritmo que
// zonedWallToUtc de server.js; este módulo no puede requerir server.js).
function wallToUtc(s, tz) {
  try {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!m) return null;
    const Y = +m[1], Mo = +m[2], D = +m[3], h = +m[4], mi = +m[5];
    if (Y < 2026 || Y > 2030 || Mo < 1 || Mo > 12 || D < 1 || D > 31 || h > 23 || mi > 59) return null;
    const zone = tz || 'America/Argentina/Buenos_Aires';
    const guess = Date.UTC(Y, Mo - 1, D, h, mi);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = {};
    for (const p of fmt.formatToParts(new Date(guess))) parts[p.type] = p.value;
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, (+parts.hour % 24), +parts.minute, +parts.second);
    return new Date(guess - (asUtc - guess)).toISOString();
  } catch (e) { return null; }
}

function shiftDays(ymd, n) {
  try {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  } catch (e) { return ''; }
}

function ensureRevisionTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS conserje_revision (
      user_id INTEGER NOT NULL,
      fecha_posteo TEXT NOT NULL,
      post_id INTEGER,
      decision TEXT NOT NULL,
      nota TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT 'dueno',
      decided_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, fecha_posteo)
    )`);
  } catch (e) { /* tabla vieja sin permisos: el llamador lo registra */ }
}

// Zona horaria de una cuenta (settings.timezone; mismo respaldo que userTz).
function accountTz(db, uid) {
  return safe(() => {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(Number(uid));
    return (r && String(r.timezone || '').trim()) || 'America/Argentina/Buenos_Aires';
  }, 'America/Argentina/Buenos_Aires');
}

function bestHourOf(db, uid) {
  const h = safe(() => {
    const r = db.prepare('SELECT best_hour FROM users WHERE id = ?').get(Number(uid));
    return r ? Number(r.best_hour) : NaN;
  }, NaN);
  return Number.isFinite(h) && h >= 9 && h <= 21 ? h : 19;
}

function ownerTz(db) {
  return safe(() => {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(OWNER_USER_ID);
    return (r && String(r.timezone || '').trim()) || 'America/New_York';
  }, 'America/New_York');
}

// Estado de la ventana de revisión (hora del dueño). Abierta 19:00–23:59;
// de 00:00 a 18:59 está cerrada (la próxima abre a las 19:00).
function estadoVentana(db, nowMs) {
  const tz = ownerTz(db);
  const now = new Date(Number(nowMs) || Date.now());
  let hh = NaN;
  try {
    hh = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now));
    if (hh === 24) hh = 0;
  } catch (e) { hh = now.getUTCHours(); }
  const hoy = safe(() => dayKeyInTz(now, tz), '') || '';
  const manana = shiftDays(hoy, 1);
  let horaTxt = '';
  try {
    horaTxt = new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  } catch (e) { horaTxt = ''; }
  return {
    zona: tz, hoy, fecha: manana, abre: '19:00', cierra: '00:00',
    ahora: horaTxt, estado: (hh >= VENTANA_ABRE_HORA) ? 'abierta' : 'cerrada',
  };
}

// Fecha de los posteos que se revisan esta noche (mañana en la zona del dueño).
function fechaRevision(db, nowMs) {
  return estadoVentana(db, nowMs).fecha || '';
}

// Título visible de un posteo: primera línea del caption, o el tema.
function tituloDe(post) {
  const cap = String((post && post.caption) || '').split('\n').map((x) => x.trim()).find(Boolean) || '';
  if (cap) return cap.slice(0, 90);
  return String((post && post.source_topic) || '').trim().slice(0, 90) || 'Posteo sin título';
}

// ¿Este posteo necesita atención? Puro (sin DB, salvo opts.casoAbierto).
// Devuelve { atento, motivo } — motivo corto, en palabras llanas.
function necesitaAtencion(post, opts) {
  const o = opts || {};
  if (!post) return { atento: false, motivo: '' };
  // El motivo más útil para quien revisa es el concreto de ESTE posteo
  // (el marcador en el título/caption); el caso abierto y la marca de
  // revisión se dicen después (el caso además vive en la ficha, como
  // próximo paso).
  const titulo = norm(tituloDe(post));
  for (const f of CHROME_TITULO) {
    if (titulo.includes(f)) return { atento: true, motivo: 'Dice «' + f + '» en vez del producto' };
  }
  const cap = norm(post.caption || '');
  for (const f of CHROME_CAPTION) {
    if (cap.includes(f)) return { atento: true, motivo: 'Dice «' + f + '» en vez del producto' };
  }
  if (Number(post.needs_review || 0) === 1) return { atento: true, motivo: 'Marcado para revisar' };
  if (post.attention === true || (Array.isArray(post.flags) && post.flags.length)) {
    return { atento: true, motivo: 'Con banderas de atención' };
  }
  if (o.casoAbierto) return { atento: true, motivo: 'Caso abierto en el conserje' };
  return { atento: false, motivo: '' };
}

// Clientes de la revisión: cuentas activas con negocio (no free, no
// frenadas, no cuentas de prueba conocidas). Las cuentas de prueba con
// email realista pueden aparecer: se ven como cualquier cliente, nunca se
// esconden en silencio — el dueño las ignora.
function clientesRevision(db) {
  return safe(() => db.prepare(
    `SELECT u.id, u.email, u.plan, u.plan_status, p.business_name, p.ig_username
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.plan_status IN ('active', 'trial')
       AND COALESCE(u.plan, '') <> 'free'
       AND COALESCE(p.business_name, '') <> ''
       AND COALESCE(u.publishing_stopped, 0) = 0
       AND u.email NOT LIKE '%postatest.com'
       AND u.email NOT LIKE 'qa-%'
       AND u.email NOT LIKE 'postyqa%'
     ORDER BY p.business_name ASC`).all(), []);
}

function revisionDe(db, userId, fechaPosteo) {
  ensureRevisionTable(db);
  const r = safe(() => db.prepare(
    'SELECT * FROM conserje_revision WHERE user_id = ? AND fecha_posteo = ?').get(Number(userId), String(fechaPosteo || '')), null);
  if (!r) return null;
  return {
    decision: r.decision, nota: r.nota || '', actor: r.actor || 'dueno',
    decided_at: r.decided_at || '', post_id: r.post_id || null,
    etiqueta: DECISION_LABEL[r.decision] || r.decision,
  };
}

function guardarDecision(db, userId, fechaPosteo, postId, decision, nota, actor) {
  ensureRevisionTable(db);
  db.prepare(`INSERT INTO conserje_revision (user_id, fecha_posteo, post_id, decision, nota, actor, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, fecha_posteo) DO UPDATE SET
      post_id = excluded.post_id, decision = excluded.decision,
      nota = excluded.nota, actor = excluded.actor, decided_at = datetime('now')`)
    .run(Number(userId), String(fechaPosteo), postId ? Number(postId) : null,
      decision, trunc(nota || '', 500), actor || 'dueno');
}

function logRevision(db, userId, postId, action, detalle) {
  try {
    db.prepare(`INSERT INTO support_team_log (actor, action, user_id, post_id, case_id, detalle)
      VALUES ('dueno', ?, ?, ?, NULL, ?)`)
      .run(action, Number(userId), postId ? Number(postId) : null, trunc(detalle || '', 500));
  } catch (e) { /* el registro nunca bloquea la decisión */ }
}

// El posteo de mañana para un perfil: el programado para esa fecha, o la
// propuesta (el borrador más reciente con foto, sin rechazar, sin frenar).
// Los borradores marcados para revisar SÍ se proponen (la revisión es
// justamente el lugar para decidirlos) y salen primeros por atención.
function posteoDeManana(db, uid, fecha, tz) {
  const sched = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL ORDER BY scheduled_at ASC`).all(Number(uid)), []);
  for (const p of sched) {
    let k = '';
    try { k = dayKeyInTz(new Date(String(p.scheduled_at).replace(' ', 'T')), tz); } catch (e) {}
    if (k === fecha) return { post: p, origen: 'programado' };
  }
  const draft = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status = 'draft'
     AND image_path LIKE '/media/%' AND media_type IN ('image', 'carousel')
     AND COALESCE(approval, 'pending') != 'rejected'
     AND COALESCE(user_stopped, 0) = 0
     ORDER BY id DESC LIMIT 1`).get(Number(uid)), null);
  if (draft) return { post: draft, origen: 'propuesta' };
  return { post: null, origen: 'sin_posteo' };
}

function siguientePosteo(db, uid, fecha, tz) {
  const sched = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL ORDER BY scheduled_at ASC`).all(Number(uid)), []);
  for (const p of sched) {
    let k = '';
    try { k = dayKeyInTz(new Date(String(p.scheduled_at).replace(' ', 'T')), tz); } catch (e) {}
    if (k && k > fecha) return p;
  }
  return null;
}

function casoConserjeAbierto(db, uid) {
  return safe(() => {
    const r = db.prepare(
      `SELECT id FROM support_cases WHERE user_id = ? AND tipo = 'conserje' AND estado <> 'cerrado' ORDER BY id DESC LIMIT 1`).get(Number(uid));
    return !!r;
  }, false);
}

function itemView(db, c, fecha, opts) {
  const o = opts || {};
  const tz = accountTz(db, c.id);
  const abs = typeof o.absImageUrl === 'function' ? o.absImageUrl : null;
  const { post, origen } = posteoDeManana(db, c.id, fecha, tz);
  const decision = revisionDe(db, c.id, fecha);
  const caso = casoConserjeAbierto(db, c.id);
  const att = post ? necesitaAtencion(post, { casoAbierto: caso }) : { atento: false, motivo: '' };
  const sig = siguientePosteo(db, c.id, fecha, tz);
  let cuando = '';
  if (post && post.scheduled_at) {
    try {
      const d = new Date(String(post.scheduled_at).replace(' ', 'T'));
      const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
      const hh = new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
      cuando = dias[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + ' · ' + hh;
    } catch (e) { cuando = ''; }
  }
  return {
    user_id: c.id,
    business_name: c.business_name || '',
    ig_username: c.ig_username || '',
    origen,
    necesita_atencion: att.atento,
    motivo_atencion: att.motivo,
    decision,
    post: post ? {
      id: post.id,
      titulo: tituloDe(post),
      caption: String(post.caption || ''),
      image_url: abs ? abs(c.id, post.image_path) : String(post.image_path || ''),
      tiene_foto: !!String(post.image_path || '').trim(),
      media_type: post.media_type || 'image',
      tipo: post.tipo || '',
      scheduled_at: post.scheduled_at || null,
      status: post.status || '',
      approval: post.approval || 'pending',
      cuando,
    } : null,
    siguiente: sig ? {
      id: sig.id, titulo: tituloDe(sig), scheduled_at: sig.scheduled_at || null,
      image_url: abs ? abs(c.id, sig.image_path) : String(sig.image_path || ''),
    } : null,
  };
}

// La cola de revisión de la noche: para la fecha dada (por defecto,
// mañana en la zona del dueño), un ítem por perfil con su posteo.
function colaRevision(db, opts) {
  const o = opts || {};
  ensureRevisionTable(db);
  const ventana = estadoVentana(db, o.nowMs);
  const fecha = (typeof o.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha)) ? o.fecha : ventana.fecha;
  const clientes = clientesRevision(db);
  const items = clientes.map((c) => itemView(db, c, fecha, o));
  const conPosteo = items.filter((i) => i.post);
  const sinPosteo = items.filter((i) => !i.post);
  const atencion = conPosteo.filter((i) => i.necesita_atencion);
  // Orden: primero lo que necesita atención, después el resto (por nombre).
  const ordenados = [...conPosteo].sort((a, b) => {
    if (a.necesita_atencion !== b.necesita_atencion) return a.necesita_atencion ? -1 : 1;
    return String(a.business_name).localeCompare(String(b.business_name));
  });
  const decididos = conPosteo.filter((i) => i.decision).length;
  // La ficha de cada cliente viaja con su ítem: cuando se decide el
  // posteo de un perfil, su ficha está ahí mismo (adenda 7/11 ~02:40).
  // Sin ficha, la revisión decidiría a ciegas.
  for (const it of [...ordenados, ...sinPosteo]) {
    it.ficha = fichaCliente(db, it.user_id, { fecha, nowMs: o.nowMs, item: it });
  }
  return {
    ok: true,
    fecha,
    ventana,
    resumen: {
      total: conPosteo.length,
      decididos,
      pendientes: conPosteo.length - decididos,
      necesitan_atencion: atencion.length,
      atencion_sin_decidir: atencion.filter((i) => !i.decision).length,
      sin_posteo: sinPosteo.length,
      todo_decidido: conPosteo.length > 0 && decididos === conPosteo.length,
    },
    items: ordenados,
    sin_posteo: sinPosteo,
  };
}

// Decidir sobre el posteo de mañana de un perfil.
// 'sale': aprueba (programado) o programa+aprueba (propuesta).
// 'arreglar': vuelve a borrador + regla de estilo con la nota.
// 'no_sale': rechazado + fuera del slot (borrador).
// 'pedir': Posty lo arma (sin posteo todavía) — queda registrado.
function decidirRevision(db, opts) {
  const o = opts || {};
  ensureRevisionTable(db);
  const uid = Number(o.user_id) || 0;
  const fecha = String(o.fecha_posteo || o.fecha || '');
  const decision = String(o.decision || '');
  const nota = trunc(String(o.nota || ''), 500);
  if (!uid) return { ok: false, error: 'sin_usuario' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: 'fecha_invalida' };
  if (!DECISIONES.includes(decision) || decision === 'retenido') return { ok: false, error: 'decision_invalida' };
  const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(uid), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const tz = accountTz(db, uid);
  const abs = typeof o.absImageUrl === 'function' ? o.absImageUrl : null;

  // Pedir que Posty lo arme: no hay posteo todavía; queda registrado y la
  // pipeline de la mañana lo genera (no se genera de noche: el cupo y el
  // momento de generar son de la mañana).
  if (decision === 'pedir') {
    guardarDecision(db, uid, fecha, null, 'pedir', nota, 'dueno');
    logRevision(db, uid, null, 'revision_noche', 'Revisión noche ' + fecha + ': Posty lo arma.');
    return { ok: true, decision: 'pedir', user_id: uid, fecha_posteo: fecha, post_id: null };
  }

  // Posteo objetivo: el que viene en el pedido, o el de la cola.
  let post = null;
  let origen = '';
  if (o.post_id) {
    post = safe(() => db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(Number(o.post_id), uid), null);
    if (!post) return { ok: false, error: 'no_encontrado' };
    origen = post.status === 'scheduled' ? 'programado' : (post.status === 'draft' ? 'propuesta' : post.status);
  } else {
    const r = posteoDeManana(db, uid, fecha, tz);
    post = r.post; origen = r.origen;
    if (!post) return { ok: false, error: 'sin_posteo' };
  }
  if (post.status === 'published') return { ok: false, error: 'ya_publicado' };
  if (post.status !== 'scheduled' && post.status !== 'draft') return { ok: false, error: 'estado' };

  try { db.exec('BEGIN IMMEDIATE'); } catch (e) { /* ya había transacción */ }
  try {
    if (decision === 'sale') {
      if (post.status === 'draft') {
        // Programar la propuesta para mañana a la mejor hora de la cuenta.
        const hh = bestHourOf(db, uid);
        const slot = wallToUtc(fecha + ' ' + String(hh).padStart(2, '0') + ':00', tz);
        if (!slot) throw new Error('slot_invalido');
        const ocupado = safe(() => db.prepare(
          `SELECT id FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL AND id <> ?`).all(uid, post.id)
          .some((p) => { try { return dayKeyInTz(new Date(String(p.scheduled_at).replace(' ', 'T')), tz) === fecha; } catch (e) { return false; } }), false);
        if (ocupado) throw new Error('slot_ocupado');
        db.prepare(`UPDATE posts SET status = 'scheduled', scheduled_at = ?, approval = 'approved', needs_review = 0 WHERE id = ?`)
          .run(slot, post.id);
      } else {
        db.prepare(`UPDATE posts SET approval = 'approved', needs_review = 0 WHERE id = ?`).run(post.id);
      }
    } else if (decision === 'arreglar') {
      // Vuelve a borrador sin fecha (igual que rehacer un programado) y la
      // nota queda como regla de estilo para que mañana no se repita.
      db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL, approval = 'pending', error = '' WHERE id = ?`).run(post.id);
      if (nota) {
        try {
          db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?, ?, ?, 1, 1)
            ON CONFLICT(user_id, rule_key) DO UPDATE SET rule_text = excluded.rule_text, active = 1, hits = hits + 1`)
            .run(uid, 'revision-noche-' + post.id, 'Revisión noche: ' + nota);
        } catch (e) { /* reglas opcionales: el arreglo no se frena */ }
      }
    } else if (decision === 'no_sale') {
      // Rechazado y fuera del slot ahora mismo (no espera a las 17:00):
      // la mañana genera otro si hace falta. El posteo queda como
      // borrador, no se borra.
      db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL, approval = 'rejected', error = '' WHERE id = ?`).run(post.id);
    }
    guardarDecision(db, uid, fecha, post.id, decision, nota, 'dueno');
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    const msg = String((e && e.message) || 'db');
    if (msg === 'slot_ocupado') return { ok: false, error: 'slot_ocupado' };
    if (msg === 'slot_invalido') return { ok: false, error: 'slot_invalido' };
    return { ok: false, error: 'db' };
  }
  logRevision(db, uid, post.id, 'revision_noche',
    'Revisión noche ' + fecha + ': ' + (DECISION_LABEL[decision] || decision) + ' — posteo #' + post.id + (nota ? ' — ' + nota : ''));
  const fresh = safe(() => db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id), post);
  return {
    ok: true, decision, user_id: uid, fecha_posteo: fecha, post_id: post.id,
    origen,
    post: {
      id: fresh.id, status: fresh.status, approval: fresh.approval || 'pending',
      scheduled_at: fresh.scheduled_at || null,
      image_url: abs ? abs(uid, fresh.image_path) : String(fresh.image_path || ''),
    },
  };
}

// Cierre de la noche (00:00 hora del dueño): lo que quedó sin revisar Y
// necesita atención queda retenido (fuera del slot, con decisión
// 'retenido'); lo limpio sin revisar queda para el cliente (su ritual de
// las 9:00 decide). Idempotente: con decisión ya puesta, no hace nada.
// Se llama cada minuto desde el tick del scheduler; fuera de la hora 00
// no hace nada.
function cierreNoche(db, opts) {
  const o = opts || {};
  ensureRevisionTable(db);
  const now = new Date(Number(o.nowMs) || Date.now());
  const tz = ownerTz(db);
  let hh = NaN;
  try {
    hh = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(now));
    if (hh === 24) hh = 0;
  } catch (e) { hh = now.getUTCHours(); }
  if (hh !== 0) return { ok: true, corridos: 0, razon: 'fuera_de_horario' };
  const fecha = safe(() => dayKeyInTz(now, tz), '') || '';
  if (!fecha) return { ok: false, error: 'sin_fecha' };
  const clientes = clientesRevision(db);
  const retenidos = [];
  for (const c of clientes) {
    if (revisionDe(db, c.id, fecha)) continue; // ya decidido: no se toca
    const ctz = accountTz(db, c.id);
    const { post } = posteoDeManana(db, c.id, fecha, ctz);
    if (!post) continue; // sin posteo: nada que retener
    const att = necesitaAtencion(post, { casoAbierto: casoConserjeAbierto(db, c.id) });
    if (!att.atento) continue; // limpio: lo decide el cliente a las 9:00
    try {
      if (post.status === 'scheduled') {
        db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL, approval = 'pending', error = '' WHERE id = ?`).run(post.id);
      }
      guardarDecision(db, c.id, fecha, post.id, 'retenido', 'Sin revisión a las 00:00: ' + att.motivo, 'sistema');
      logRevision(db, c.id, post.id, 'revision_noche',
        'Cierre 00:00 ' + fecha + ': retenido sin revisión — posteo #' + post.id + ' (' + att.motivo + ').');
      retenidos.push({ user_id: c.id, post_id: post.id, motivo: att.motivo });
    } catch (e) { /* un perfil no frena el resto */ }
  }
  return { ok: true, corridos: retenidos.length, fecha, retenidos };
}

// =====================================================================
// FICHA DEL CLIENTE (adenda Valentino 7/11 ~02:40, misma versión).
// Una capa sobre la tarjeta de cada cliente: lo que vende, lo que le
// gusta, líneas rojas, paleta, plan, desde cuándo, etapa, estrategia en
// una línea + próximo paso, historial de decisiones de cada noche y una
// línea de notas opcional de Valentino. Todo se llena SOLO con lo que
// Posty ya sabe (fundamento/digest, onboarding q1–q8, aprobaciones,
// rechazos, estado de la prueba, reglas de estilo, gustos anotados).
// Valentino no carga nada, cero formularios. Sin fuente, el campo sale
// como "sin registrar" y se lista en `faltantes` — nunca inventado.
// =====================================================================

// Tipos de caso con severidad roja (mismo mapa que support-cases.js
// CASE_TYPES; la ficha no importa ese módulo para no acoplar la vista).
const CASOS_ROJOS = ['post_no_publicado', 'semana_error', 'push_9_sin_entregar'];

function ensureNotaTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS conserje_notas (
      user_id INTEGER PRIMARY KEY,
      nota TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) { /* tabla vieja sin permisos: la nota queda sin guardar */ }
}

function leerNota(db, uid) {
  ensureNotaTable(db);
  const r = safe(() => db.prepare('SELECT nota, updated_at FROM conserje_notas WHERE user_id = ?').get(Number(uid)), null);
  return r ? { texto: String(r.nota || ''), updated_at: r.updated_at || '' } : { texto: '', updated_at: '' };
}

// Una línea de notas de Valentino (algo que solo él sabe del cliente).
// Máximo 200 caracteres, sin saltos de línea. Vacía = borra la nota.
function guardarNota(db, uid, nota) {
  ensureNotaTable(db);
  const texto = String(nota || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  if (!texto) {
    safe(() => db.prepare('DELETE FROM conserje_notas WHERE user_id = ?').run(Number(uid)), null);
    return { ok: true, nota: '' };
  }
  safe(() => db.prepare(`INSERT INTO conserje_notas (user_id, nota, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET nota = excluded.nota, updated_at = datetime('now')`).run(Number(uid), texto), null);
  return { ok: true, nota: texto };
}

function nombresDe(lista, n) {
  const out = [];
  for (const x of (lista || [])) {
    const s = String((x && (x.nombre || x.titulo || x)) || '').trim();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= (n || 3)) break;
  }
  return out;
}

function listaLineasRojas(onb, digest) {
  const out = [];
  const push = (s) => {
    for (const p of String(s || '').split(/[,;|·]/)) {
      const t = p.trim();
      if (t && t.toLowerCase() !== 'nada' && !out.includes(t)) out.push(t);
    }
  };
  push(onb.lineas_rojas || onb.q8 || '');
  for (const v of (digest.vetos || [])) push(v);
  return out.slice(0, 5);
}

function paletaDe(digest) {
  const src = (digest.paleta && digest.paleta.length ? digest.paleta : digest.logo_paleta) || [];
  return src.slice(0, 5).map((p) => ({ hex: String((p && p.hex) || p || '').trim(), rol: String((p && p.rol) || '') })).filter((p) => /^#[0-9a-fA-F]{6}$/.test(p.hex));
}

// Etapa del cliente: prueba / primera semana / en ritmo / en rojo, con
// señal verde-amarillo-rojo. Reglas (ver STATUS): en rojo manda sobre
// todo (caso rojo abierto, publicación frenada, posteo fallado en 24 h,
// intervención de salud abierta); la prueba es amarilla (arrancando);
// la primera semana es amarilla (plan activo hace ≤7 días o primer
// posteo publicado hace ≤7 días); el resto, en ritmo (verde).
function etapaDe(db, uid, user, prof) {
  const planStatus = String((user && user.plan_status) || '');
  const frenado = Number((user && user.publishing_stopped) || 0) === 1;
  const casoRojo = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM support_cases WHERE user_id = ? AND estado <> 'cerrado' AND tipo IN (${CASOS_ROJOS.map(() => '?').join(',')})`).get(Number(uid), ...CASOS_ROJOS), { c: 0 });
  const interv = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM health_interventions WHERE user_id = ? AND status = 'abierta'`).get(Number(uid)), { c: 0 });
  const fallo24 = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND name = 'post_failed' AND datetime(created_at) >= datetime('now', '-1 day')`).get(Number(uid)), { c: 0 });
  if (frenado || (casoRojo && casoRojo.c > 0) || (interv && interv.c > 0) || (fallo24 && fallo24.c > 0)) {
    return {
      clave: 'en_rojo', etiqueta: 'En rojo', color: 'rojo',
      motivo: frenado ? 'Publicación frenada' : (casoRojo && casoRojo.c > 0) ? 'Caso rojo abierto'
        : (fallo24 && fallo24.c > 0) ? 'Un posteo falló en las últimas 24 h' : 'Intervención de salud abierta',
    };
  }
  if (planStatus === 'trial') {
    return { clave: 'prueba', etiqueta: 'En prueba', color: 'amarillo', motivo: 'Todavía no pagó el plan' };
  }
  const trialEnds = Number((user && user.trial_ends_at) || 0);
  const primeraPorPlan = trialEnds > 0 && (Date.now() - trialEnds) <= 7 * 24 * 3600 * 1000 && (Date.now() - trialEnds) >= 0;
  const primerPub = safe(() => db.prepare(
    `SELECT MIN(COALESCE(published_at, created_at)) AS f FROM posts WHERE user_id = ? AND status = 'published'`).get(Number(uid)), null);
  let primeraPorPub = false;
  if (primerPub && primerPub.f) {
    const t = Date.parse(String(primerPub.f).replace(' ', 'T'));
    primeraPorPub = Number.isFinite(t) && (Date.now() - t) <= 7 * 24 * 3600 * 1000 && (Date.now() - t) >= 0;
  }
  if (planStatus === 'active' && (primeraPorPlan || primeraPorPub)) {
    return { clave: 'primera_semana', etiqueta: 'Primera semana', color: 'amarillo', motivo: 'Recién empieza con el plan' };
  }
  return { clave: 'en_ritmo', etiqueta: 'En ritmo', color: 'verde', motivo: 'Publicando con el plan activo' };
}

// Estrategia en una línea: la semana vigente (cm_semana: tema +
// objetivo, lo que Posty propuso esta semana). Sin semana registrada,
// el porqué del último posteo aprobado/programado. Sin nada, sin datos
// (la ficha lo dice, no lo inventa). La aprobación del cliente se lee
// en el historial de decisiones + el ritual (su pick), no hay un
// registro explícito de "estrategia aprobada" (ver STATUS).
function estrategiaDe(db, uid) {
  const sem = safe(() => db.prepare(
    `SELECT week_key, tema, objetivo FROM cm_semana WHERE user_id = ? ORDER BY created_at DESC, week_key DESC LIMIT 1`).get(Number(uid)), null);
  if (sem && String(sem.tema || '').trim()) {
    const linea = String(sem.tema).trim() + (String(sem.objetivo || '').trim() ? ' — ' + String(sem.objetivo).trim() : '');
    return { linea: linea.slice(0, 240), tema: String(sem.tema).trim(), objetivo: String(sem.objetivo || '').trim(), week_key: sem.week_key || '', fuente: 'cm_semana' };
  }
  const p = safe(() => db.prepare(
    `SELECT strategy_why FROM posts WHERE user_id = ? AND status IN ('scheduled','published') AND COALESCE(strategy_why,'') <> '' ORDER BY id DESC LIMIT 1`).get(Number(uid)), null);
  if (p && String(p.strategy_why || '').trim()) {
    return { linea: String(p.strategy_why).trim().slice(0, 240), tema: '', objetivo: '', week_key: '', fuente: 'strategy_why' };
  }
  return { linea: '', tema: '', objetivo: '', week_key: '', fuente: 'sin_datos' };
}

// Próximo paso: lo primero que hay que hacer por este cliente, en orden:
// 1) el siguiente paso de su caso conserje abierto; 2) si no tiene
// posteo mañana, armarlo; 3) si el posteo de mañana necesita atención y
// sigue sin decidir, decidirlo en la revisión; 4) si está en prueba,
// terminarla; 5) seguir el ritmo.
function proximoPasoDe(db, uid, ctx) {
  const c = ctx || {};
  const caso = safe(() => db.prepare(
    `SELECT siguiente_paso FROM support_cases WHERE user_id = ? AND tipo = 'conserje' AND estado <> 'cerrado' AND COALESCE(siguiente_paso,'') <> '' ORDER BY id DESC LIMIT 1`).get(Number(uid)), null);
  if (caso) return { texto: String(caso.siguiente_paso).slice(0, 200), fuente: 'caso' };
  if (c.sinPosteo) return { texto: 'Posty arma el posteo de mañana', fuente: 'cola' };
  if (c.atencionSinDecidir) return { texto: 'Decidir el posteo de mañana en la revisión de la noche', fuente: 'cola' };
  const st = String((c.planStatus || ''));
  if (st === 'trial') return { texto: 'Terminar la prueba y pasar al plan', fuente: 'plan' };
  const n = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'scheduled' AND datetime(scheduled_at) >= datetime('now') AND datetime(scheduled_at) < datetime('now', '+7 days')`).get(Number(uid)), { c: 0 });
  return { texto: 'Seguir el ritmo: ' + ((n && n.c) || 0) + ' posteos programados esta semana', fuente: 'ritmo' };
}

// Historial de decisiones de cada noche (la memoria del conserje):
// aprobado / pedir arreglo / no sale / retenido, con el motivo.
function historialDecisiones(db, uid, limite) {
  ensureRevisionTable(db);
  const rows = safe(() => db.prepare(
    `SELECT fecha_posteo, decision, nota, decided_at, post_id FROM conserje_revision WHERE user_id = ? ORDER BY fecha_posteo DESC LIMIT ?`).all(Number(uid), Number(limite) || 10), []);
  return rows.map((r) => ({
    fecha_posteo: r.fecha_posteo, decision: r.decision,
    etiqueta: DECISION_LABEL[r.decision] || r.decision,
    nota: String(r.nota || ''), decided_at: r.decided_at || '', post_id: r.post_id || null,
  }));
}

// La ficha completa de un cliente. `ctx` (opcional) trae contexto de la
// cola (origen del posteo de mañana, atención, decisión) para el próximo
// paso; sin ctx se calcula solo.
function fichaCliente(db, userId, opts) {
  const o = opts || {};
  const uid = Number(userId) || 0;
  const user = safe(() => db.prepare('SELECT * FROM users WHERE id = ?').get(uid), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const prof = safe(() => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uid), null) || {};
  const digest = safe(() => clientDigest.getDigest(db, uid), null) || {};
  const onb = (digest.onboarding && typeof digest.onboarding === 'object') ? digest.onboarding : {};
  const faltantes = [];

  const estrella = String(onb.producto_estrella || onb.estrella || '').trim()
    || (digest.inferred_star && digest.inferred_star.item ? String(digest.inferred_star.item) : '')
    || (nombresDe(digest.productos, 1)[0] || '');
  if (!estrella) faltantes.push('producto_estrella');
  const productos = nombresDe(digest.productos, 3);
  const servicios = nombresDe(digest.servicios, 3);
  const diferencial = String(onb.diferencial || digest.diferencial || '').trim();
  const tono = String(prof.tone || onb.voz || onb.tono || '').trim();
  const gustos = safe(() => db.prepare(
    `SELECT senal, tema, angulo, formato FROM cm_gusto WHERE user_id = ? ORDER BY id DESC LIMIT 3`).all(uid), [])
    .map((g) => [g.senal, g.tema, g.angulo, g.formato].filter(Boolean).join(' · ')).filter(Boolean);
  const pidioCambiar = safe(() => db.prepare(
    `SELECT rule_text FROM style_rules WHERE user_id = ? AND COALESCE(active,0) = 1 ORDER BY hits DESC, rule_key ASC LIMIT 3`).all(uid), [])
    .map((r) => String(r.rule_text || '').trim()).filter(Boolean);
  const lineas = listaLineasRojas(onb, digest);
  if (!lineas.length) faltantes.push('lineas_rojas');
  const paleta = paletaDe(digest);
  if (!paleta.length) faltantes.push('paleta');

  const tz = accountTz(db, uid);
  const manana = o.fecha || fechaRevision(db, o.nowMs);
  const postManana = o.item ? null : posteoDeManana(db, uid, manana, tz);
  const ctx = o.item ? {
    sinPosteo: o.item.origen === 'sin_posteo',
    atencionSinDecidir: !!o.item.necesita_atencion && !o.item.decision,
    planStatus: String(user.plan_status || ''),
  } : {
    sinPosteo: postManana ? postManana.origen === 'sin_posteo' : false,
    atencionSinDecidir: postManana && postManana.post ? necesitaAtencion(postManana.post, { casoAbierto: casoConserjeAbierto(db, uid) }).atento && !revisionDe(db, uid, manana) : false,
    planStatus: String(user.plan_status || ''),
  };
  const estrategia = estrategiaDe(db, uid);
  if (!estrategia.linea) faltantes.push('estrategia');

  return {
    ok: true,
    user_id: uid,
    business_name: prof.business_name || '',
    ig_username: prof.ig_username || '',
    vende: {
      rubro: String(digest.category || prof.category || '').trim(),
      estrella,
      productos, servicios,
      diferencial,
      objetivo: String(onb.cta || onb.objetivo || '').trim(),
      promo: String(onb.promo || '').trim(),
      precios: String(onb.precios || '').trim(),
      audiencia: String(onb.audiencia || '').trim(),
    },
    gusta: { tono, gustos, pidio_cambiar: pidioCambiar },
    lineas_rojas: lineas,
    paleta,
    plan: {
      plan: String(user.plan || ''), plan_status: String(user.plan_status || ''),
      trial_ends_at: user.trial_ends_at || null,
      desde: String(user.created_at || '').slice(0, 10),
    },
    etapa: etapaDe(db, uid, user, prof),
    estrategia,
    proximo_paso: proximoPasoDe(db, uid, ctx),
    historial: historialDecisiones(db, uid, 10),
    nota: leerNota(db, uid),
    faltantes,
  };
}

module.exports = {
  OWNER_USER_ID,
  VENTANA_ABRE_HORA,
  VENTANA_CIERRA_HORA,
  DECISIONES,
  DECISION_LABEL,
  ensureRevisionTable,
  estadoVentana,
  fechaRevision,
  tituloDe,
  necesitaAtencion,
  clientesRevision,
  revisionDe,
  guardarDecision,
  posteoDeManana,
  siguientePosteo,
  casoConserjeAbierto,
  colaRevision,
  decidirRevision,
  cierreNoche,
  wallToUtc,
  accountTz,
  bestHourOf,
  ownerTz,
  // Ficha del cliente (adenda 7/11 ~02:40)
  fichaCliente,
  guardarNota,
  leerNota,
  historialDecisiones,
  etapaDe,
  estrategiaDe,
};
