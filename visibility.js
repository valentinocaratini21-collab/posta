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
      `Pedilo respondiendo este email o probá Posty gratis 3 días en postyhacetodo.com/prueba — ponés tu @ y en minutos ves tu semana armada.`,
      '',
      `— Equipo Posty`,
      `hola@postyhacetodo.com`,
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
      `Just reply to this email, or try Posty free for 3 days at postyhacetodo.com/en/prueba — enter your @ and see your week built in minutes.`,
      '',
      `— The Posty team`,
      `hello@postyhacetodo.com`,
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

function startVisibilityJobs(db) {
  const run = () => { sweepNewPaidUsers(db).catch(() => {}); };
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
      res.json({ ok: true, email_configured: emailConfigured, counts, rows, triggers,
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
  }
}

module.exports = {
  initSchema,
  registerVisibility,
  startVisibilityJobs,
  sweepNewPaidUsers,
  enqueueForClient,
  visibilityState,
  _internal: { refSurfaceState, markShown, referralCount, mondayOf, localYmd, FOMO_COPY, discoverCompetitors },
};
