'use strict';
/* =====================================================================
 * ideas-email.js — Email "3 ideas para tu Instagram" (los lunes 9:00 ART)
 * Frente #2 del playbook (contenido de valor gratis). Diseño completo:
 * equipo-posty/contenidos-playbook/email/sistema-email-ideas.md
 *
 * Piezas:
 *  - Tabla ideas_subscribers (también creada en db.js; acá se asegura
 *    por si el módulo corre contra una DB sin el boot completo).
 *  - subscribe(): CAPTURA SIMPLE (decisión de Valentino 2026-10-21,
 *    unificación v321): quien deja el email queda 'confirmed' EN EL
 *    ACTO, con o sin sesión. NO hay doble opt-in: nadie queda
 *    'pending' ni sale email de confirmación.
 *  - Unificación de tablas: ensureIdeasTables() migra los leads de la
 *    tabla legada idea_subscribers (el hotfix inline que vivía en
 *    server.js) a ideas_subscribers — INSERT OR IGNORE por email,
 *    todos 'confirmed', con token de baja generado. Idempotente:
 *    ningún lead capturado se pierde ni se duplica.
 *  - confirmByToken() / unsubscribeByToken(): un clic, sin login, con
 *    token propio del suscriptor (mismo espíritu que email_tokens).
 *    La ruta /api/ideas/confirm queda como compatibilidad inofensiva
 *    (todo suscriptor ya está confirmado). La baja es TOTAL: sale de
 *    ideas y marca email_opt_out en users.
 *  - sendIdeasEmails(db): el job de los lunes. Sin RESEND_API_KEY omite
 *    en silencio y registra (patrón de email.js) — jamás rompe el
 *    scheduler. Envía POR RUBRO: cada suscriptor recibe la edición que
 *    le sigue de SU segmento; si esa edición no existe, se salta (nunca
 *    relleno). La edición se marca como enviada ANTES de enviar (patrón
 *    anti-duplicado de la casa).
 *  - registerIdeasRoutes(app, db): POST /api/ideas/subscribe,
 *    GET /api/ideas/confirm, GET /api/ideas/unsubscribe.
 *
 * Remitente del newsletter: Posty <ideas@postycommunitymanager.com> (dominio
 * verificado en Resend; separa la reputación de marketing de la
 * transaccional de hola@). Reply-to: hola@postycommunitymanager.com.
 * ===================================================================== */

const crypto = require('crypto');
const { sendEmail, emailConfigured, emailFaceHeader } = require('./email');
const { EDITIONS, editionFor } = require('./ideas-editions');
const { RUBROS, SUBRUBROS } = require('./rubro-id');

const SOURCES = ['prueba', 'landing', 'invitacion'];
const GENERIC_SEGMENT = 'negocios-locales';

// Claves canónicas aceptadas como rubro confirmado: rubros + subrubros.
const KNOWN_KEYS = new Set([...RUBROS, ...Object.values(SUBRUBROS).flat(), GENERIC_SEGMENT]);
// subrubro -> rubro padre (para caer a la edición del padre si el
// subrubro no tiene edición propia).
const PARENT_OF = {};
for (const [parent, subs] of Object.entries(SUBRUBROS)) {
  for (const s of subs) PARENT_OF[s] = parent;
}

function baseUrl() {
  return (process.env.BASE_URL || 'https://postycommunitymanager.com').replace(/\/$/, '');
}
function ideasFrom() {
  return process.env.IDEAS_EMAIL_FROM || 'Posty <ideas@postycommunitymanager.com>';
}
const IDEAS_REPLY_TO = 'hola@postycommunitymanager.com';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
}
function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

// El segmento de envío de un rubro confirmado: su propia edición si
// existe; si es un subrubro sin edición, la del rubro padre; si no, la
// genérica de negocios locales (hoy sin ediciones: el job salta).
function segmentFor(rubroKey) {
  const k = String(rubroKey || '').trim();
  if (!k) return '';
  if (EDITIONS[k]) return k;
  const parent = PARENT_OF[k];
  if (parent && EDITIONS[parent]) return parent;
  if (EDITIONS[GENERIC_SEGMENT]) return GENERIC_SEGMENT;
  return k; // sin edición cargada: editionFor() devuelve null y se salta
}

function ensureIdeasTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ideas_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    rubro TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'landing',
    business_name TEXT NOT NULL DEFAULT '',
    ig_handle TEXT NOT NULL DEFAULT '',
    token TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT DEFAULT '',
    unsubscribed_at TEXT DEFAULT '',
    last_edition INTEGER NOT NULL DEFAULT 0,
    last_sent_at TEXT DEFAULT ''
  )`);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_ideas_subs_status ON ideas_subscribers(status, rubro)`); } catch (e) {}
  migrateLegacyIdeaSubscribers(db);
}

// Migración de la tabla legada idea_subscribers (hotfix inline de
// server.js, captura simple) hacia la tabla del sistema. Corre en cada
// ensure: es idempotente y nunca duplica (email UNIQUE + OR IGNORE).
// También promueve cualquier 'pending' histórico a 'confirmed' y
// completa el token de baja de las filas que no lo tengan.
function migrateLegacyIdeaSubscribers(db) {
  try {
    const legacy = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'idea_subscribers'").get();
    if (legacy) {
      const cols = db.prepare('PRAGMA table_info(idea_subscribers)').all().map((c) => c.name);
      if (cols.includes('email')) {
        const col = (n, dflt) => (cols.includes(n) ? n : dflt);
        // La legada guardaba created_at como epoch ms (Date.now()): se
        // convierte a texto fecha; si ya era texto, pasa tal cual.
        const createdExpr = cols.includes('created_at')
          ? "CASE WHEN typeof(created_at) IN ('integer', 'real') THEN datetime(created_at / 1000, 'unixepoch') ELSE created_at END"
          : "datetime('now')";
        db.exec(`INSERT OR IGNORE INTO ideas_subscribers
          (email, rubro, source, business_name, ig_handle, token, status, created_at, confirmed_at)
          SELECT lower(trim(email)),
                 ${col('rubro', "''")}, ${col('source', "'landing'")},
                 ${col('business_name', "''")}, ${col('ig_handle', "''")},
                 '', 'confirmed', ${createdExpr}, datetime('now')
          FROM idea_subscribers
          WHERE email IS NOT NULL AND trim(email) <> ''`);
      }
    }
  } catch (e) { console.error('[ideas] migración idea_subscribers:', e.message); }
  try { db.exec(`UPDATE ideas_subscribers SET token = lower(hex(randomblob(24))) WHERE token = '' OR token IS NULL`); } catch (e) {}
  try {
    db.exec(`UPDATE ideas_subscribers
      SET status = 'confirmed',
          confirmed_at = CASE WHEN confirmed_at IS NULL OR confirmed_at = '' THEN datetime('now') ELSE confirmed_at END
      WHERE status = 'pending'`);
  } catch (e) {}
}

function getSubscriberByEmail(db, email) {
  return db.prepare('SELECT * FROM ideas_subscribers WHERE email = ?').get(email) || null;
}
function getSubscriberByToken(db, token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM ideas_subscribers WHERE token = ?').get(String(token)) || null;
}

/* ------------------------- emails (HTML) ------------------------- */

// Shell visual del newsletter: misma identidad que el resto de los
// emails de Posty (cabecera celeste, tarjeta clara) con el pie propio
// del sistema de ideas (por qué lo recibe + baja en un clic).
function ideasShell(inner, unsubUrl) {
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
  ${emailFaceHeader()}
  <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
    ${inner}
    <p style="font-size:12px;line-height:1.6;color:#47617A;margin:20px 0 0">
      Te llega los lunes porque te suscribiste en postycommunitymanager.com · Posty, tu community manager.<br>
      ¿No lo querés más? <a href="${unsubUrl}" style="color:#2793C8;font-weight:700">Date de baja en un clic</a>, sin vueltas.
    </p>
  </div>
</div>`;
}

// La edición semanal ya renderizada para un suscriptor.
function weeklyIdeasEmail(sub, edition) {
  const base = baseUrl();
  const unsub = `${base}/api/ideas/unsubscribe?token=${encodeURIComponent(sub.token)}`;
  const ideasHtml = edition.ideas.map((it, i) => `
    <div style="background:#fff;border:1.5px solid #D7E6F2;border-radius:12px;padding:16px 18px;margin:0 0 14px">
      <p style="font-size:13px;font-weight:800;letter-spacing:.4px;color:#2793C8;margin:0 0 4px">IDEA ${i + 1}</p>
      <p style="font-size:17px;font-weight:800;margin:0 0 8px;color:#0A1E33">${esc(it.titular)}</p>
      <p style="font-size:14.5px;line-height:1.6;margin:0 0 12px;color:#47617A">${esc(it.idea)}</p>
      <div style="background:#F4F8FB;border-radius:10px;padding:12px 14px;margin:0 0 10px">
        <p style="font-size:12px;font-weight:800;color:#2793C8;margin:0 0 4px">EL POSTEO, LISTO PARA COPIAR</p>
        <p style="font-size:14px;margin:0 0 6px;color:#0A1E33">Titular de imagen: <b>${esc(it.imagen)}</b></p>
        <p style="font-size:14px;line-height:1.6;margin:0;color:#0A1E33">${esc(it.caption)}</p>
      </div>
      <p style="font-size:13.5px;margin:0 0 4px;color:#47617A">🗓️ <b>Cuándo lo publicás:</b> ${esc(it.cuando)}</p>
      <p style="font-size:13.5px;line-height:1.55;margin:0;color:#47617A">💡 <b>Por qué funciona:</b> ${esc(it.porque)}</p>
    </div>`).join('');
  const html = `
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(edition.preheader)}</div>
${ideasShell(`
    <p style="font-size:16px;margin:0 0 6px">Hola, soy Posty 🐾</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">${esc(edition.intro)}</p>
    ${ideasHtml}
    <p style="font-size:15px;line-height:1.6;margin:6px 0 20px;color:#47617A">
      Estas 3 ideas son gratis y son tuyas. Si querés, las hago por vos: armo tu semana
      completa con tus productos, tus fotos y tus colores, la publico y atiendo tus mensajes.
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${base}/prueba" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Probá Posty gratis 3 días →</a>
    </p>`, unsub)}`;
  return sendEmail({ to: sub.email, subject: edition.subject, html, from: ideasFrom(), replyTo: IDEAS_REPLY_TO });
}

/* ------------------------- suscripción ------------------------- */

// Alta (o re-alta) de un suscriptor — CAPTURA SIMPLE (v321): queda
// 'confirmed' en el acto, siempre. Sin email de confirmación.
// input: { email, rubro, source, business_name, ig_handle }
// opts.sessionUser: fila de users si hay sesión (el toque dentro de
// /prueba o la app); si falta el email, lo toma de la cuenta.
// Devuelve { ok, status: 'confirmed', subscriber, already }.
async function subscribe(db, input, opts = {}) {
  ensureIdeasTables(db);
  const su = opts.sessionUser || null;
  const email = String((input && input.email) || (su && su.email) || '').trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'email_invalido' };
  let rubro = String((input && input.rubro) || '').trim();
  if (rubro && !KNOWN_KEYS.has(rubro)) rubro = ''; // rubro no canónico = no confirmado (nunca se adivina)
  let source = String((input && input.source) || '').trim();
  if (!SOURCES.includes(source)) source = su ? 'prueba' : 'landing';
  const business = String((input && input.business_name) || '').replace(/</g, '&lt;').slice(0, 120);
  const ig = String((input && input.ig_handle) || '').replace(/^@+/, '').replace(/[^\w.]/g, '').slice(0, 60);
  const existing = getSubscriberByEmail(db, email);
  if (existing && existing.status === 'confirmed') {
    // Ya está adentro: si trajo un rubro confirmado y no tenía, se completa.
    if (rubro && !existing.rubro) {
      db.prepare('UPDATE ideas_subscribers SET rubro = ? WHERE id = ?').run(rubro, existing.id);
      existing.rubro = rubro;
    }
    return { ok: true, status: 'confirmed', subscriber: existing, already: true };
  }

  let sub;
  if (existing) {
    // Re-alta (estaba de baja o histórico): vuelve a 'confirmed' en el acto.
    db.prepare(`UPDATE ideas_subscribers
      SET rubro = ?, source = ?, business_name = ?, ig_handle = ?, status = 'confirmed',
          confirmed_at = datetime('now'), unsubscribed_at = '',
          token = CASE WHEN token = '' THEN ? ELSE token END
      WHERE id = ?`).run(rubro || existing.rubro, source, business || existing.business_name, ig || existing.ig_handle, newToken(), existing.id);
    sub = getSubscriberByEmail(db, email);
  } else {
    db.prepare(`INSERT INTO ideas_subscribers (email, rubro, source, business_name, ig_handle, token, status, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'confirmed', datetime('now'))`)
      .run(email, rubro, source, business, ig, newToken());
    sub = getSubscriberByEmail(db, email);
  }
  return { ok: true, status: 'confirmed', subscriber: sub };
}

function confirmByToken(db, token) {
  ensureIdeasTables(db);
  const sub = getSubscriberByToken(db, token);
  if (!sub) return { ok: false, error: 'token_invalido' };
  if (sub.status === 'unsubscribed') return { ok: false, error: 'ya_dado_de_baja', subscriber: sub };
  if (sub.status !== 'confirmed') {
    db.prepare(`UPDATE ideas_subscribers SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?`).run(sub.id);
    sub.status = 'confirmed';
  }
  return { ok: true, subscriber: sub };
}

// Baja en un clic: inmediata y total (ideas + opt-out global de emails
// de producto si el email tiene cuenta).
function unsubscribeByToken(db, token) {
  ensureIdeasTables(db);
  const sub = getSubscriberByToken(db, token);
  if (!sub) return { ok: false, error: 'token_invalido' };
  if (sub.status !== 'unsubscribed') {
    db.prepare(`UPDATE ideas_subscribers SET status = 'unsubscribed', unsubscribed_at = datetime('now') WHERE id = ?`).run(sub.id);
    sub.status = 'unsubscribed';
  }
  try { db.prepare('UPDATE users SET email_opt_out = 1 WHERE email = ?').run(sub.email); } catch (e) { /* users puede no existir en DBs parciales */ }
  return { ok: true, subscriber: sub };
}

/* ------------------------- job de los lunes ------------------------- */

// Envío semanal (lunes 9:00 ART, lo agenda scheduler.js).
// opts.delayMs: pausa entre envíos (default 400, patrón de la casa).
async function sendIdeasEmails(db, opts = {}) {
  if (!emailConfigured()) {
    console.log('[ideas] sin RESEND_API_KEY: no se envía la edición de esta semana');
    return { sent: 0, failed: 0, skipped: 0, unconfigured: true };
  }
  ensureIdeasTables(db);
  const delayMs = typeof opts.delayMs === 'number' ? opts.delayMs : 400;
  const subs = db.prepare(`SELECT * FROM ideas_subscribers WHERE status = 'confirmed'`).all();
  let sent = 0, failed = 0, skipped = 0;
  for (const sub of subs) {
    try {
      const segment = segmentFor(sub.rubro);
      const next = (sub.last_edition || 0) + 1;
      const edition = segment ? editionFor(segment, next) : null;
      if (!edition) { skipped++; continue; } // sin edición de su rubro: no se manda relleno
      // Marca ANTES de enviar (anti-duplicado si el proceso cae a mitad de tanda).
      const claim = db.prepare('UPDATE ideas_subscribers SET last_edition = ?, last_sent_at = datetime(\'now\') WHERE id = ? AND COALESCE(last_edition, 0) < ?')
        .run(next, sub.id, next);
      if (!claim || !claim.changes) { skipped++; continue; }
      const r = await weeklyIdeasEmail(sub, edition);
      if (r && r.ok) sent++; else { failed++; console.error('[ideas] envío fallido a', sub.email, (r && r.error) || ''); }
    } catch (e) {
      failed++;
      console.error('[ideas] falló', sub.email, e.message);
    }
    if (delayMs > 0) await new Promise((res) => setTimeout(res, delayMs));
  }
  console.log(`[ideas] edición de los lunes: enviados ${sent}, fallidos ${failed}, salteados ${skipped}, confirmados ${subs.length}`);
  return { sent, failed, skipped };
}

/* ------------------------- rutas HTTP ------------------------- */

function resultPage(title, bodyHtml) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Posty</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#F2F9FD;color:#0A1E33">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
  <div style="background:#2793C8;padding:22px 26px;border-radius:14px 14px 0 0"><div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div></div>
  <div style="background:#fff;padding:28px 26px;border-radius:0 0 14px 14px">
    <h1 style="font-size:21px;margin:0 0 12px">${esc(title)}</h1>
    ${bodyHtml}
  </div>
</div></body></html>`;
}

// Rate limit simple en memoria para el alta pública (anti-abuso):
// 10 intentos por IP por hora alcanza de sobra para el uso real.
const _rl = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (_rl.get(ip) || []).filter((t) => now - t < 3600000);
  arr.push(now);
  _rl.set(ip, arr);
  return arr.length > 10;
}

function registerIdeasRoutes(app, db) {
  ensureIdeasTables(db); // crea la tabla y migra la legada al boot
  app.post('/api/ideas/subscribe', async (req, res) => {
    try {
      const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
      if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Probá en un rato 😅' });
      const body = req.body || {};
      let sessionUser = null;
      if (req.session && req.session.userId) {
        try { sessionUser = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.session.userId) || null; } catch (e) {}
      }
      const r = await subscribe(db, {
        email: body.email, rubro: body.rubro, source: body.source,
        business_name: body.business_name, ig_handle: body.ig_handle,
        fromTrialSession: !!sessionUser,
      }, { sessionUser });
      if (!r.ok) return res.status(400).json({ ok: false, error: 'Revisá el email, que no parece válido 😅' });
      return res.json({ ok: true, status: 'confirmed', message: '¡Listo! Desde el lunes te llegan tus 3 ideas 💡' });
    } catch (e) {
      console.error('[ideas] subscribe:', e.message);
      return res.status(500).json({ ok: false, error: 'Me trabé un segundo 😅 Probá de nuevo.' });
    }
  });

  app.get('/api/ideas/confirm', (req, res) => {
    const r = confirmByToken(db, req.query && req.query.token);
    if (!r.ok) {
      return res.status(404).send(resultPage('Ese link no va más', `
        <p style="font-size:15px;line-height:1.6;color:#47617A;margin:0">Ese link no es válido o ya venció. Si querés tus 3 ideas de cada lunes, suscribite de nuevo desde <a href="${baseUrl()}/" style="color:#2793C8;font-weight:700">postycommunitymanager.com</a> — toma 10 segundos.</p>`));
    }
    return res.send(resultPage('¡Ya estás adentro! 💡', `
      <p style="font-size:15px;line-height:1.6;color:#47617A;margin:0 0 16px">Desde el próximo <b>lunes a las 9:00</b> te llegan tus <b>3 ideas para tu Instagram</b>: posteos concretos para tu rubro, listos para copiar. Gratis, siempre.</p>
      <p style="font-size:15px;line-height:1.6;color:#47617A;margin:0">Y si un lunes no tenés tiempo de hacerlas… para eso estoy yo 😉 <a href="${baseUrl()}/prueba" style="color:#2793C8;font-weight:700">Probá Posty gratis 3 días →</a></p>`));
  });

  app.get('/api/ideas/unsubscribe', (req, res) => {
    const r = unsubscribeByToken(db, req.query && req.query.token);
    if (!r.ok) {
      return res.status(404).send(resultPage('Ese link no va más', `
        <p style="font-size:15px;line-height:1.6;color:#47617A;margin:0">El link de baja no es válido. Si te siguen llegando emails, escribinos a <a href="mailto:hola@postycommunitymanager.com" style="color:#2793C8;font-weight:700">hola@postycommunitymanager.com</a> y te damos de baja a mano.</p>`));
    }
    return res.send(resultPage('Listo, no te escribimos más 💛', `
      <p style="font-size:15px;line-height:1.6;color:#47617A;margin:0">Ya está: no recibís más el email de ideas ni ningún otro envío nuestro. Si algún día querés volver, las ideas te esperan en <a href="${baseUrl()}/" style="color:#2793C8;font-weight:700">postycommunitymanager.com</a>.</p>`));
  });
}

module.exports = {
  ensureIdeasTables, subscribe, confirmByToken, unsubscribeByToken,
  sendIdeasEmails, registerIdeasRoutes, segmentFor,
  weeklyIdeasEmail, ideasShell,
};
