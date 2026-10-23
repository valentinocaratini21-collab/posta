// visibility.js — CAPA DE VISIBILIDAD POSTY (2026-10-21, mandato de Valentino
// "que cada cliente cerrado atraiga más clientes").
//
// Piezas server-side de los mecanismos 1·3·4·5:
//  · Estado de superficies con CAP DE FRECUENCIA (mecanismo 4): la línea de
//    referidos puede aparecer máx. 1 vez por semana por superficie
//    ('ref_schedule' tras aceptar la semana, 'ref_letter' bajo la Carta del
//    Domingo) y NUNCA en dos superficies el mismo día.
//  · Sello de bio opt-in (mecanismo 5): el estado vive en profiles.bio_seal
//    ('' = nunca ofrecido · 'accepted' · 'dismissed'). Jamás se escribe la
//    bio del cliente desde acá: es SU perfil, el sello se copia a mano.
//  · Disparador FOMO (mecanismo 3): cuando una cuenta pasa a PAGA
//    (plan_status='active' con plan real), un barrido idempotente descubre
//    competidores directos (mismo rubro + zona, Google Places) y los ENCOLA
//    en fomo_queue para la radiografía-invitación del sistema de ataque por
//    email. Este módulo NO envía emails: el envío vive en el sistema de
//    ataque con TODOS sus frenos (sin RESEND_API_KEY no sale nada, topes
//    diarios y calentamiento). La cola queda visible en el admin.
//  · Follow a clientes pagos (mecanismo 11): cuando una cuenta pasa a PAGA,
//    Posty la sigue en Instagram — el "siguiendo" de @posty.hacetodo /
//    @posty.doeseverything es prueba social pública de los negocios reales
//    que trabajan con Posty, y el follow-back viene solo. CAPACIDAD REAL
//    (verificado 2026-10-21): el conector de Instagram NO puede seguir
//    cuentas (CONNECTOR.md: "cannot follow, unfollow…"; el CLI responde
//    `unknown command 'follow'`). Por eso la DETECCIÓN y el REGISTRO son
//    automáticos (mismo barrido de activaciones) y el follow queda como
//    tarea del día en el panel admin: el operador lo hace desde la app y lo
//    marca hecho acá. REGLA: si el cliente cancela, NO se deja de seguir
//    (un unfollow visible es mala señal) — no existe tarea ni endpoint de
//    unfollow, a propósito.
//  · Regla de verdad: el copy FOMO no nombra al cliente que disparó la cola
//    (default sin permiso) y no inventa datos del competidor.
//
// El cliente (mecanismo 1, tarjeta compartible) se arma en el navegador con
// los datos reales de la carta; no necesita endpoint.

'use strict';

const REFERRALS_NEEDED = 2; // espejo de server.js: 2 referidos activos = 50% off
const REF_SURFACES = ['ref_schedule', 'ref_letter'];

/* ---------------- utilidades de fecha (semana ISO en la tz del cliente) --- */
function localYmd(tz, d) {
  const dt = d || new Date();
  try { return dt.toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }); }
  catch (e) { return dt.toISOString().slice(0, 10); }
}
function mondayOf(ymd) {
  const p = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function userTz(db, userId) {
  try {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    return (r && r.timezone) || 'America/Argentina/Buenos_Aires';
  } catch (e) { return 'America/Argentina/Buenos_Aires'; }
}

/* ---------------- schema ------------------------------------------------- */
function initSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS visibility_prompts (
    user_id INTEGER NOT NULL,
    surface TEXT NOT NULL,
    last_shown_day TEXT DEFAULT '',
    last_shown_week TEXT DEFAULT '',
    shown_count INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT '',
    PRIMARY KEY (user_id, surface)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS fomo_triggers (
    user_id INTEGER PRIMARY KEY,
    source TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS fomo_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_user_id INTEGER NOT NULL,
    competitor_key TEXT NOT NULL UNIQUE,
    name TEXT DEFAULT '',
    website TEXT DEFAULT '',
    email TEXT DEFAULT '',
    rubro TEXT DEFAULT '',
    zone TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'encolado',
    copy_subject TEXT DEFAULT '',
    copy_body TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS follow_triggers (
    user_id INTEGER PRIMARY KEY,
    source TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS client_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_user_id INTEGER NOT NULL,
    ig_handle TEXT NOT NULL DEFAULT '',
    posty_account TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'es',
    status TEXT NOT NULL DEFAULT 'pendiente',
    source TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    done_at TEXT DEFAULT '',
    done_by TEXT DEFAULT '',
    UNIQUE (client_user_id, posty_account)
  )`);
  try { db.exec(`ALTER TABLE profiles ADD COLUMN bio_seal TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
}

/* ---------------- mecanismo 4: caps de superficies de referidos ---------- */
function referralCount(db, userId) {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND plan_status = 'active'`).get(userId);
    return row ? row.n : 0;
  } catch (e) { return 0; }
}

function promptRow(db, userId, surface) {
  try { return db.prepare('SELECT * FROM visibility_prompts WHERE user_id = ? AND surface = ?').get(userId, surface) || null; }
  catch (e) { return null; }
}

// ¿Puede mostrarse la línea de referidos en esta superficie, hoy?
// Reglas: (a) el cliente todavía no llegó a la meta (si ya refirió 2+, la
// superficie agradece y no pide más — eso lo decide el cliente con `thanks`);
// (b) máx. 1 vez por semana por superficie; (c) nunca dos superficies el
// mismo día.
function refSurfaceState(db, userId, surface, ymd, week) {
  const row = promptRow(db, userId, surface);
  if (row && row.last_shown_week === week) return { show: false, reason: 'cap_semanal' };
  try {
    const anyToday = db.prepare(
      `SELECT 1 AS x FROM visibility_prompts WHERE user_id = ? AND surface IN ('ref_schedule','ref_letter') AND last_shown_day = ? LIMIT 1`
    ).get(userId, ymd);
    if (anyToday) return { show: false, reason: 'otra_superficie_hoy' };
  } catch (e) {}
  return { show: true };
}

function markShown(db, userId, surface, ymd, week) {
  db.prepare(`INSERT INTO visibility_prompts (user_id, surface, last_shown_day, last_shown_week, shown_count, updated_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, surface) DO UPDATE SET last_shown_day = excluded.last_shown_day,
      last_shown_week = excluded.last_shown_week, shown_count = shown_count + 1, updated_at = datetime('now')`)
    .run(userId, surface, ymd, week);
}

function visibilityState(db, userId) {
  const tz = userTz(db, userId);
  const ymd = localYmd(tz);
  const week = mondayOf(ymd);
  const count = referralCount(db, userId);
  const thanks = count >= REFERRALS_NEEDED;
  let bioSeal = '';
  try {
    const p = db.prepare('SELECT bio_seal FROM profiles WHERE user_id = ?').get(userId);
    bioSeal = (p && p.bio_seal) || '';
  } catch (e) {}
  const prompts = {};
  for (const s of REF_SURFACES) {
    // Con la meta cumplida, la superficie no pide: agradece (thanks) una vez
    // por semana como máximo y sin bloquear a la otra el mismo día.
    prompts[s] = thanks
      ? { show: !(promptRow(db, userId, s) && promptRow(db, userId, s).last_shown_week === week), thanks: true }
      : refSurfaceState(db, userId, s, ymd, week);
  }
  return {
    ok: true,
    referral: { count, needed: REFERRALS_NEEDED, thanks, discount_active: thanks },
    prompts,
    bio_seal: { state: bioSeal },
  };
}

/* ---------------- mecanismo 3: FOMO de competidores ---------------------- */
const FOMO_COPY = {
  es: {
    subject: (rubro, zone) => `Los negocios de ${rubro} en ${zone} ya están publicando todos los días`,
    body: (name, rubro, zone) => [
      `Hola${name ? ' ' + name : ''}:`,
      '',
      `Te escribo de Posty. Un negocio de ${rubro} en ${zone} ya publica todos los días en Instagram con Posty, su community manager automático: los posteos se arman, se programan y salen solos, con el estilo y los productos de ese negocio.`,
      '',
      `Antes de que la distancia se haga más grande, quiero regalarte lo mismo que lo convenció: el análisis completo de TU cuenta (qué publicar, qué dejar de hacer y cómo se vería tu semana) + 3 posteos de muestra hechos para tu negocio. Sin costo y sin compromiso.`,
      '',
      `Pedilo respondiendo este email o probá Posty gratis 3 días en postycommunitymanager.com/prueba — ponés tu @ y en minutos ves tu semana armada.`,
      '',
      `— Equipo Posty`,
      `hola@postycommunitymanager.com`,
      ``,
      `¿No querés recibir estos mensajes? Respondé "baja" y no te escribimos más.`,
    ].join('\n'),
  },
  en: {
    subject: (rubro, zone) => `${rubro} businesses in ${zone} are already posting every day`,
    body: (name, rubro, zone) => [
      `Hi${name ? ' ' + name : ''},`,
      '',
      `I'm writing from Posty. A ${rubro} business in ${zone} already posts on Instagram every day with Posty, its automatic community manager: posts are created, scheduled and published on their own, in that business's style and with its real products.`,
      '',
      `Before the gap gets wider, I'd like to give you the same thing that convinced them: the full analysis of YOUR account (what to post, what to stop doing and what your week would look like) + 3 sample posts made for your business. Free, no strings attached.`,
      '',
      `Just reply to this email, or try Posty free for 3 days at postycommunitymanager.com/en/prueba — enter your @ and see your week built in minutes.`,
      '',
      `— The Posty team`,
      `hello@postycommunitymanager.com`,
      ``,
      `Don't want these messages? Reply "stop" and we won't write again.`,
    ].join('\n'),
  },
};

function normKey(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function domainOf(url) {
  try { return new URL(String(url || '')).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
}

function placesKey() { return String(process.env.GOOGLE_PLACES_KEY || '').trim(); }

async function placesFetch(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Posty/1.0', 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

// Descubrimiento de competidores directos: mismo rubro + zona vía Google
// Places (Text Search + Details para el website). Sin key o sin resultados
// devuelve [] — la cola queda vacía pero el trigger registrado (honesto).
async function discoverCompetitors(rubro, zone, client) {
  const key = placesKey();
  if (!key || !rubro || !zone) return [];
  const q = encodeURIComponent(`${rubro} en ${zone}`);
  const data = await placesFetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${key}&language=es`);
  const results = (data && data.results) || [];
  const clientName = normKey(client && client.business_name);
  const clientDomain = domainOf(client && client.website);
  const out = [];
  for (const r of results.slice(0, 12)) {
    if (!r || !r.name) continue;
    if (normKey(r.name) === clientName && clientName) continue;
    let website = '';
    try {
      const det = await placesFetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(r.place_id)}&fields=website&key=${key}`);
      website = (det && det.result && det.result.website) || '';
    } catch (e) {}
    const dom = domainOf(website);
    if (dom && clientDomain && dom === clientDomain) continue;
    out.push({ name: r.name, website, address: r.formatted_address || '' });
    if (out.length >= 10) break;
  }
  return out;
}

function clientRubroZone(db, userId) {
  const p = db.prepare('SELECT business_name, category, subrubro, ig_username FROM profiles WHERE user_id = ?').get(userId) || {};
  let dj = {};
  try {
    const d = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(userId);
    if (d && d.digest_json) dj = JSON.parse(d.digest_json) || {};
  } catch (e) {}
  const rubro = String(dj.rubro || dj.categoria || p.subrubro || p.category || '').trim();
  const zone = String(dj.ciudad || dj.zona || dj.city || '').trim();
  const website = String((dj.web && dj.web.url) || dj.website || '').trim();
  return { business_name: p.business_name || '', rubro, zone, website };
}

// Encola competidores de un cliente que acaba de pasar a pago. Idempotente:
// un cliente dispara UNA sola vez en su vida (fomo_triggers). `discover` es
// inyectable para tests.
async function enqueueForClient(db, userId, source, discover) {
  const seen = db.prepare('SELECT user_id FROM fomo_triggers WHERE user_id = ?').get(userId);
  if (seen) return { already: true, queued: 0 };
  db.prepare('INSERT INTO fomo_triggers (user_id, source, note) VALUES (?, ?, ?)').run(userId, source || 'sweep', '');
  const info = clientRubroZone(db, userId);
  if (!info.rubro || !info.zone) {
    db.prepare('UPDATE fomo_triggers SET note = ? WHERE user_id = ?')
      .run(`sin_rubro_o_zona (rubro="${info.rubro}" zona="${info.zone}")`, userId);
    return { queued: 0, note: 'sin_rubro_o_zona' };
  }
  const disc = discover || discoverCompetitors;
  let found = [];
  try { found = await disc(info.rubro, info.zone, info) || []; } catch (e) { found = []; }
  const clientLang = (() => {
    try { const u = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId); return u && u.lang === 'en' ? 'en' : 'es'; }
    catch (e) { return 'es'; }
  })();
  const copy = FOMO_COPY[clientLang] || FOMO_COPY.es;
  let queued = 0;
  for (const c of found) {
    const dom = domainOf(c.website);
    const ckey = dom || (normKey(c.name) + '|' + normKey(info.zone));
    if (!ckey) continue;
    const r = db.prepare(`INSERT OR IGNORE INTO fomo_queue
      (client_user_id, competitor_key, name, website, rubro, zone, status, copy_subject, copy_body)
      VALUES (?, ?, ?, ?, ?, ?, 'encolado', ?, ?)`)
      .run(userId, ckey, c.name || '', c.website || '', info.rubro, info.zone,
        copy.subject(info.rubro, info.zone), copy.body('', info.rubro, info.zone));
    if (r && r.changes) queued++;
  }
  db.prepare('UPDATE fomo_triggers SET note = ? WHERE user_id = ?')
    .run(`rubro=${info.rubro} | zona=${info.zone} | encolados=${queued}`, userId);
  return { queued };
}

// Barrido: toda cuenta PAGA real sin trigger entra al disparador. Cubre los
// tres caminos de activación (webhook MP, webhook Stripe, alta manual del
// admin) sin tocarlos: el estado real en la DB es el evento.
async function sweepNewPaidUsers(db) {
  const rows = db.prepare(`SELECT id FROM users
    WHERE plan_status = 'active' AND plan IS NOT NULL AND plan != '' AND plan != 'free'
      AND id NOT IN (SELECT user_id FROM fomo_triggers)`).all();
  let processed = 0;
  for (const r of rows) {
    try { await enqueueForClient(db, r.id, 'sweep'); processed++; } catch (e) {}
  }
  return processed;
}

/* ---------------- mecanismo 11: follow a clientes pagos ------------------ */
// La cuenta de Posty que sigue depende del idioma del cliente: ES →
// @posty.hacetodo · EN → @posty.doeseverything (su "siguiendo" es la
// vidriera pública de clientes de cada mercado).
const POSTY_IG_ACCOUNTS = { es: '@posty.hacetodo', en: '@posty.doeseverything' };
// Tope anti-spam por cuenta y por día. El volumen esperado hacia la meta
// es ~2 altas/día: el tope NO debería morder nunca en operación normal;
// existe para que una activación masiva no dispare 30 follows en una hora.
// Configurable con POSTY_FOLLOW_DAILY_CAP.
const FOLLOW_DAILY_CAP = Math.max(1, parseInt(process.env.POSTY_FOLLOW_DAILY_CAP || '10', 10) || 10);

function normalizeHandle(s) {
  const h = String(s || '').trim().replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : '';
}

// El @ del cliente: primero el perfil (ig_username), después el fundamento.
function clientIgHandle(db, userId) {
  try {
    const p = db.prepare('SELECT ig_username FROM profiles WHERE user_id = ?').get(userId);
    const h = normalizeHandle(p && p.ig_username);
    if (h) return h;
  } catch (e) {}
  try {
    const d = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(userId);
    if (d && d.digest_json) {
      const dj = JSON.parse(d.digest_json) || {};
      return normalizeHandle(dj.ig_username || dj.ig || dj.instagram || '');
    }
  } catch (e) {}
  return '';
}

function userLang(db, userId) {
  try { const u = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId); return u && u.lang === 'en' ? 'en' : 'es'; }
  catch (e) { return 'es'; }
}

// Encola el follow de un cliente que acaba de pasar a pago. Idempotente:
// un cliente genera UNA sola tarea en su vida (follow_triggers), igual que
// el disparador FOMO pero con su propio registro (un cliente procesado por
// FOMO antes de que existiera este mecanismo igual recibe su follow).
// Si no se identifica ningún @, queda asentado en el trigger — nada se sigue
// "a ciegas" y ninguna cuenta de práctica se sigue como si fuera cliente.
function enqueueFollowForClient(db, userId, source) {
  const seen = db.prepare('SELECT user_id FROM follow_triggers WHERE user_id = ?').get(userId);
  if (seen) return { already: true, queued: 0 };
  db.prepare('INSERT INTO follow_triggers (user_id, source, note) VALUES (?, ?, ?)').run(userId, source || 'sweep', '');
  const lang = userLang(db, userId);
  const account = POSTY_IG_ACCOUNTS[lang];
  const handle = clientIgHandle(db, userId);
  if (!handle) {
    db.prepare('UPDATE follow_triggers SET note = ? WHERE user_id = ?').run('sin_ig_identificado', userId);
    return { queued: 0, note: 'sin_ig_identificado' };
  }
  const r = db.prepare(`INSERT OR IGNORE INTO client_follows
    (client_user_id, ig_handle, posty_account, lang, status, source)
    VALUES (?, ?, ?, ?, 'pendiente', ?)`)
    .run(userId, handle, account, lang, source || 'sweep');
  db.prepare('UPDATE follow_triggers SET note = ? WHERE user_id = ?')
    .run(`@${handle} ← ${account}`, userId);
  return { queued: r && r.changes ? 1 : 0 };
}

// Barrido de follows: corre con el MISMO ritmo que el de FOMO (boot + cada
// 10 min desde startVisibilityJobs) y detecta las mismas activaciones pagas
// reales. Una cancelación posterior NO genera nada: no hay unfollow.
async function sweepFollowQueue(db) {
  const rows = db.prepare(`SELECT id FROM users
    WHERE plan_status = 'active' AND plan IS NOT NULL AND plan != '' AND plan != 'free'
      AND id NOT IN (SELECT user_id FROM follow_triggers)`).all();
  let processed = 0;
  for (const r of rows) {
    try { enqueueFollowForClient(db, r.id, 'sweep'); processed++; } catch (e) {}
  }
  return processed;
}

function followsDoneToday(db, account, ymd) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM client_follows
      WHERE posty_account = ? AND status = 'hecho' AND date(done_at) = ?`).get(account, ymd);
    return r ? r.n : 0;
  } catch (e) { return 0; }
}

// Tareas del día por cuenta de Posty: pendientes en orden de llegada,
// recortadas por el tope diario (lo que no entra queda `deferred` y sale
// mañana — jamás se pierde).
function followTasksForToday(db, capOverride) {
  const cap = Math.max(1, capOverride || FOLLOW_DAILY_CAP);
  const ymd = new Date().toISOString().slice(0, 10);
  const out = {};
  for (const lang of ['es', 'en']) {
    const account = POSTY_IG_ACCOUNTS[lang];
    const done = followsDoneToday(db, account, ymd);
    const room = Math.max(0, cap - done);
    const pending = db.prepare(`SELECT * FROM client_follows
      WHERE posty_account = ? AND status = 'pendiente' ORDER BY created_at ASC, id ASC`).all(account);
    out[account] = { cap, done_today: done, tasks: pending.slice(0, room), deferred: Math.max(0, pending.length - room) };
  }
  return out;
}

// El operador marca el follow como hecho (tras hacerlo desde la app de
// Instagram). El tope diario también se aplica acá: ni a mano se supera.
function markFollowDone(db, id, doneBy, capOverride) {
  const row = db.prepare('SELECT * FROM client_follows WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status === 'hecho') return { ok: true, already: true };
  const cap = Math.max(1, capOverride || FOLLOW_DAILY_CAP);
  const ymd = new Date().toISOString().slice(0, 10);
  if (followsDoneToday(db, row.posty_account, ymd) >= cap) return { ok: false, error: 'cap_diario', cap };
  db.prepare(`UPDATE client_follows SET status = 'hecho', done_at = datetime('now'), done_by = ? WHERE id = ?`)
    .run(doneBy || 'operador', id);
  return { ok: true };
}

// La lista de clientes YA seguidos (fuente para la página de fundadores
// "Los Primeros 200": se publica solo con el permiso de cada cliente).
function followedClients(db) {
  try {
    return db.prepare(`SELECT cf.client_user_id, cf.ig_handle, cf.posty_account, cf.lang, cf.done_at,
        p.business_name FROM client_follows cf
        LEFT JOIN profiles p ON p.user_id = cf.client_user_id
        WHERE cf.status = 'hecho' ORDER BY cf.done_at ASC, cf.id ASC`).all()
      .map(r => ({ client_user_id: r.client_user_id, business: r.business_name || '', ig: '@' + r.ig_handle, seguido_por: r.posty_account, lang: r.lang, desde: r.done_at }));
  } catch (e) { return []; }
}

function startVisibilityJobs(db) {
  const run = () => { sweepNewPaidUsers(db).catch(() => {}); sweepFollowQueue(db).catch(() => {}); };
  const t0 = setTimeout(run, 45000); if (t0.unref) t0.unref();
  const iv = setInterval(run, 10 * 60 * 1000); if (iv.unref) iv.unref();
}

/* ---------------- endpoints ---------------------------------------------- */
function registerVisibility(app, db, guards) {
  const express = require('express');
  const json = express.json();
  const requireAuth = guards && guards.requireAuth;
  const requireAdminToken = guards && guards.requireAdminToken;

  app.get('/api/visibility/state', requireAuth, (req, res) => {
    try { res.json(visibilityState(db, req.session.userId)); }
    catch (e) { res.status(500).json({ ok: false, error: 'state_failed' }); }
  });

  app.post('/api/visibility/shown', requireAuth, json, (req, res) => {
    const surface = String((req.body || {}).surface || '');
    if (!REF_SURFACES.includes(surface)) return res.status(400).json({ ok: false, error: 'bad_surface' });
    try {
      const tz = userTz(db, req.session.userId);
      const ymd = localYmd(tz);
      markShown(db, req.session.userId, surface, ymd, mondayOf(ymd));
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: 'shown_failed' }); }
  });

  app.post('/api/visibility/bio-seal', requireAuth, json, (req, res) => {
    const state = String((req.body || {}).state || '');
    if (state !== 'accepted' && state !== 'dismissed') return res.status(400).json({ ok: false, error: 'bad_state' });
    try {
      // El sello es opt-in/opt-out explícito del dueño: queda registrado para
      // medir adopción. NUNCA escribimos su bio desde el servidor.
      const cur = db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get(req.session.userId);
      if (cur) db.prepare('UPDATE profiles SET bio_seal = ? WHERE user_id = ?').run(state, req.session.userId);
      else db.prepare('INSERT INTO profiles (user_id, bio_seal) VALUES (?, ?)').run(req.session.userId, state);
      res.json({ ok: true, state });
    } catch (e) { res.status(500).json({ ok: false, error: 'seal_failed' }); }
  });

  if (requireAdminToken) {
    app.get('/api/admin/visibility/fomo', requireAdminToken, (req, res) => {
      let emailConfigured = false;
      try { emailConfigured = !!require('./email').emailConfigured(); } catch (e) {}
      const counts = {};
      try {
        for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM fomo_queue GROUP BY status').all()) counts[r.status] = r.n;
      } catch (e) {}
      const rows = db.prepare('SELECT * FROM fomo_queue ORDER BY id DESC LIMIT 200').all();
      const triggers = db.prepare('SELECT * FROM fomo_triggers ORDER BY created_at DESC LIMIT 50').all();
      // (v322) ÉPOCA: las COLAS son operativas (trabajo pendiente del producto)
      // y NO se filtran — esconder trabajo por época sería un error. Lo que sí
      // se mide por época es el conteo de disparadores desde el lanzamiento.
      let era = null, triggersInEra = null;
      try {
        const LA = require('./launch-analytics');
        era = LA.eraInfo(LA.eraOf(req.query));
        const ec = LA.eraCond('created_at', LA.eraOf(req.query));
        triggersInEra = db.prepare(`SELECT COUNT(*) AS n FROM fomo_triggers WHERE ${ec.sql}`).get(...ec.params).n;
      } catch (e) {}
      res.json({ ok: true, email_configured: emailConfigured, counts, rows, triggers, era, triggers_since_epoch: triggersInEra,
        nota: emailConfigured ? '' : 'Envío bloqueado: falta RESEND_API_KEY — la cola espera, no sale nada.' });
    });

    app.get('/api/admin/visibility/fomo.csv', requireAdminToken, (req, res) => {
      const rows = db.prepare('SELECT * FROM fomo_queue ORDER BY id ASC').all();
      const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = ['id,cliente_id,competidor,website,email,rubro,zona,estado,asunto,creado'];
      for (const r of rows) lines.push([r.id, r.client_user_id, r.name, r.website, r.email, r.rubro, r.zone, r.status, r.copy_subject, r.created_at].map(esc).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(lines.join('\n'));
    });

    app.post('/api/admin/visibility/fomo-sweep', requireAdminToken, json, async (req, res) => {
      try { const n = await sweepNewPaidUsers(db); res.json({ ok: true, processed: n }); }
      catch (e) { res.status(500).json({ ok: false, error: 'sweep_failed' }); }
    });

    /* Mecanismo 11: follows a clientes pagos. La detección/encolado es
       automática; la EJECUCIÓN es manual (el conector de Instagram no puede
       seguir cuentas) — esta vista es la lista de tareas del día del
       operador, con el tope diario aplicado. */
    app.get('/api/admin/visibility/follows', requireAdminToken, (req, res) => {
      const counts = {};
      try {
        for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM client_follows GROUP BY status').all()) counts[r.status] = r.n;
      } catch (e) {}
      const rows = db.prepare('SELECT * FROM client_follows ORDER BY id DESC LIMIT 300').all();
      const triggers = db.prepare('SELECT * FROM follow_triggers ORDER BY created_at DESC LIMIT 50').all();
      res.json({ ok: true, ejecucion: 'manual',
        nota: 'El conector de Instagram NO puede seguir cuentas (verificado en su doc): la detección y la cola son automáticas, el follow lo hace el operador desde la app el mismo día y lo marca hecho acá. Si el cliente cancela, NO se deja de seguir.',
        cap_diario_por_cuenta: FOLLOW_DAILY_CAP, cuentas: POSTY_IG_ACCOUNTS,
        counts, hoy: followTasksForToday(db), rows, seguidos: followedClients(db), triggers });
    });

    app.get('/api/admin/visibility/follows.csv', requireAdminToken, (req, res) => {
      const rows = db.prepare('SELECT * FROM client_follows ORDER BY id ASC').all();
      const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = ['id,cliente_id,ig,cuenta_posty,idioma,estado,creado,hecho_el,hecho_por'];
      for (const r of rows) lines.push([r.id, r.client_user_id, '@' + r.ig_handle, r.posty_account, r.lang, r.status, r.created_at, r.done_at, r.done_by].map(esc).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(lines.join('\n'));
    });

    app.post('/api/admin/visibility/follow-done', requireAdminToken, json, (req, res) => {
      const id = Number((req.body || {}).id);
      if (!id) return res.status(400).json({ ok: false, error: 'bad_id' });
      const r = markFollowDone(db, id, 'admin');
      if (!r.ok) return res.status(r.error === 'cap_diario' ? 429 : 404).json({ ok: false, error: r.error, cap: r.cap });
      res.json({ ok: true, already: !!r.already });
    });

    app.post('/api/admin/visibility/follow-sweep', requireAdminToken, json, async (req, res) => {
      try { const n = await sweepFollowQueue(db); res.json({ ok: true, processed: n }); }
      catch (e) { res.status(500).json({ ok: false, error: 'sweep_failed' }); }
    });
  }
}

module.exports = {
  initSchema,
  registerVisibility,
  startVisibilityJobs,
  sweepNewPaidUsers,
  enqueueForClient,
  sweepFollowQueue,
  enqueueFollowForClient,
  followTasksForToday,
  markFollowDone,
  followedClients,
  visibilityState,
  _internal: { refSurfaceState, markShown, referralCount, mondayOf, localYmd, FOMO_COPY, discoverCompetitors,
    normalizeHandle, clientIgHandle, followsDoneToday, POSTY_IG_ACCOUNTS, FOLLOW_DAILY_CAP },
};
