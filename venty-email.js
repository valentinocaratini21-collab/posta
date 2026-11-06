// venty-email.js — VENTY-CONECTAR-4: email por negocio (reenvío + salida).
// Dos piezas separadas, como en Gesty (gesty-buzon.js):
//   A. DIRECCIÓN DE REENVÍO por negocio: respuestas de prospectos y
//      rebotes llegan a venty+<token>@ventysalesmanager.com y se resuelven
//      por huella sha256 (la dirección ES una credencial: el token jamás
//      se guarda en claro ni aparece en logs; solo su huella corta).
//      La ingesta queda registrada (venty_email_ingestas). NO hay lector
//      de buzón real: hola-inbox.js declara pollInbox sin fuente
//      ({available:false}). Acá queda el registro de la dirección y el
//      camino de lectura documentado (ver STATUS.md, pendiente de
//      infraestructura); no se inventa un lector que no existe.
//   B. SALIDA: el transporte es email.js sendEmail() (único punto de
//      salida, Resend). La plantilla HTML la construye ESTE módulo con la
//      PALETA DEL NEGOCIO (del fundamento: website_url → paleta; nunca los
//      colores de Venty ni de Posty). Reglas: una idea por email, link de
//      baja en el pie, tabla de supresión (opt-out por destinatario), y
//      todo envío real pasa por espejo + Bandeja (jugada aceptada) + cupo
//      del gobernador. Fail-closed: sin jugada aceptada no sale nada.
'use strict';

const crypto = require('crypto');
const gobernador = require('./venty-gobernador');

const DOMINIO_REENVIO = 'ventysalesmanager.com';
const PREFIJO_LOCAL = 'venty+';
const TOKEN_BYTES = 24; // 24 bytes aleatorios → 48 hex

function fail(m) { const e = new Error(m); e.ventyEmail = true; throw e; }
function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function normEmail(v) { return String(v || '').trim().toLowerCase().slice(0, 200); }
function emailValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '')); }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_email_direccion (
    user_id INTEGER PRIMARY KEY,
    huella TEXT NOT NULL DEFAULT '',
    huella_corta TEXT NOT NULL DEFAULT '',
    generada_en TEXT NOT NULL DEFAULT '',
    generacion INTEGER NOT NULL DEFAULT 0,
    activa INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_venty_email_dir_huella ON venty_email_direccion(huella) WHERE huella <> \'\'');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_email_ingestas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    huella_corta TEXT NOT NULL DEFAULT '',
    de TEXT NOT NULL DEFAULT '',
    asunto TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'recibida',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_email_ing_user ON venty_email_ingestas(user_id, id)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_email_supresion (
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    motivo TEXT NOT NULL DEFAULT 'baja',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, email)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_email_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    jugada_id INTEGER,
    para_email TEXT NOT NULL DEFAULT '',
    asunto TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

// --- A. Dirección de reenvío ---------------------------------------------
// Generar (o regenerar: mata la anterior en el acto). Devuelve la
// dirección completa UNA sola vez; después solo se muestra enmascarada.
function generarDireccion(db, userId) {
  ensureSchema(db);
  const previa = db.prepare('SELECT * FROM venty_email_direccion WHERE user_id = ?').get(userId);
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const huella = sha256Hex(token);
  const huellaCorta = huella.slice(0, 8);
  const generadaEn = ahoraIso();
  const generacion = previa ? Number(previa.generacion || 0) + 1 : 1;
  db.prepare(`INSERT INTO venty_email_direccion (user_id, huella, huella_corta, generada_en, generacion, activa, updated_at)
    VALUES (?,?,?,?,?,1,?)
    ON CONFLICT(user_id) DO UPDATE SET huella = excluded.huella, huella_corta = excluded.huella_corta,
      generada_en = excluded.generada_en, generacion = excluded.generacion, activa = 1, updated_at = excluded.updated_at`)
    .run(userId, huella, huellaCorta, generadaEn, generacion, generadaEn);
  return {
    direccion: `${PREFIJO_LOCAL}${token}@${DOMINIO_REENVIO}`,
    huella_corta: huellaCorta, generada_en: generadaEn, generacion,
    mato_anterior: !!previa,
  };
}

function estadoDireccion(db, userId) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM venty_email_direccion WHERE user_id = ?').get(userId);
  if (!r || !r.huella) {
    return { existe: false, activa: false, direccion_visible: '', huella_corta: '', generada_en: '', generacion: 0,
      nota: 'todavía no generaste tu dirección de reenvío: sin dirección no hay buzón de respuestas.' };
  }
  return { existe: true, activa: r.activa === 1,
    direccion_visible: `${PREFIJO_LOCAL}••••••••@${DOMINIO_REENVIO}`,
    huella_corta: r.huella_corta || '', generada_en: r.generada_en || '', generacion: Number(r.generacion || 0),
    nota: 'la dirección completa se muestra una sola vez, al generarla. si se perdió, regenerala: la anterior deja de funcionar en el acto.' };
}

// Resolver un token entrante por huella (comparación en tiempo constante
// sobre el índice único). Sin match: null (se descarta registrado).
function resolverToken(db, token) {
  ensureSchema(db);
  if (!token) return null;
  const huella = sha256Hex(String(token).toLowerCase());
  const row = db.prepare('SELECT * FROM venty_email_direccion WHERE huella = ? AND activa = 1').get(huella);
  return row ? Number(row.user_id) : null;
}

// Registrar una ingesta en la dirección de reenvío (el transporte que la
// alimenta — worker de email — es infraestructura pendiente; esta función
// es el punto donde ese worker enchufa, ver STATUS.md).
function registrarIngesta(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const r = db.prepare(`INSERT INTO venty_email_ingestas (user_id, huella_corta, de, asunto, estado, created_at) VALUES (?,?,?,?,?,?)`)
    .run(userId, String(o.huella_corta || '').slice(0, 8), normEmail(o.de), String(o.asunto || '').slice(0, 200), String(o.estado || 'recibida').slice(0, 40), ahoraIso());
  return Number(r.lastInsertRowid);
}

// --- Opt-out / supresión ---------------------------------------------------
function estaSuprimido(db, userId, email) {
  ensureSchema(db);
  const row = db.prepare('SELECT email FROM venty_email_supresion WHERE user_id = ? AND email = ?').get(userId, normEmail(email));
  return !!row;
}

function suprimir(db, userId, email, motivo) {
  ensureSchema(db);
  const em = normEmail(email);
  if (!emailValido(em)) fail('Email inválido.');
  db.prepare(`INSERT OR IGNORE INTO venty_email_supresion (user_id, email, motivo, created_at) VALUES (?,?,?,?)`)
    .run(userId, em, String(motivo || 'baja').slice(0, 80), ahoraIso());
  return { email: em, suprimido: true };
}

function quitarSupresion(db, userId, email) {
  ensureSchema(db);
  db.prepare('DELETE FROM venty_email_supresion WHERE user_id = ? AND email = ?').run(userId, normEmail(email));
  return { email: normEmail(email), suprimido: false };
}

// Token de baja por destinatario: HMAC con secreto de app (SESSION_SECRET
// o VENTY_EMAIL_UNSUB_SECRET). El link es /api/venty/email/baja?t=...&e=...
// Verificar sin guardar nada: el token es autocontenido.
function secretoBaja() {
  return process.env.VENTY_EMAIL_UNSUB_SECRET || process.env.SESSION_SECRET || '';
}
function tokenBaja(userId, email) {
  const sec = secretoBaja();
  if (!sec) return '';
  return crypto.createHmac('sha256', sec).update(String(userId) + '|' + normEmail(email)).digest('hex').slice(0, 32);
}
function verificarBaja(userId, email, token) {
  const esperado = tokenBaja(userId, email);
  if (!esperado || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- B. Plantilla con la paleta DEL NEGOCIO -------------------------------
// paleta: [{hex, rol}] del fundamento (client_digest / web-extract, máx 2
// hex) o [] → fallback neutro (grises, nunca colores de Venty/Posty).
// Una idea por email: el constructor recibe UNA idea; si le pasan más de
// una, usa la primera y lo declara (nunca mezcla dos ideas en un email).
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function paletaNegocio(paleta) {
  const lista = Array.isArray(paleta) ? paleta : [];
  const hexes = lista.map((p) => (typeof p === 'string' ? p : (p && p.hex) || '')).filter((h) => /^#[0-9a-fA-F]{6}$/.test(h));
  const principal = hexes[0] || '#5A6B7A';
  const acento = hexes[1] || principal;
  return { principal: principal.toUpperCase(), acento: acento.toUpperCase() };
}

function construirEmailNegocio(opts) {
  const o = opts || {};
  const pal = paletaNegocio(o.paleta);
  const nombre = String(o.negocio || 'tu negocio').slice(0, 80);
  const ideas = Array.isArray(o.ideas) ? o.ideas : (o.idea ? [o.idea] : []);
  const idea = ideas[0] || {};
  const ideaExtra = ideas.length > 1;
  const titulo = String(idea.titulo || o.asunto || '').slice(0, 120);
  const cuerpo = String(idea.cuerpo || o.cuerpo || '').slice(0, 2000);
  const ctaTexto = String(o.ctaTexto || '').slice(0, 60);
  const ctaUrl = String(o.ctaUrl || '').slice(0, 500);
  const bajaUrl = String(o.bajaUrl || '').slice(0, 500);
  const remitente = String(o.remitente || nombre).slice(0, 80);
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1F2A33">
  <div style="background:${pal.principal};padding:20px 28px;border-radius:14px 14px 0 0">
    <span style="font-size:17px;font-weight:800;color:#fff">${esc(nombre)}</span>
  </div>
  <div style="background:#F7F8F8;padding:28px;border-radius:0 0 14px 14px">
    ${titulo ? `<h1 style="font-size:20px;line-height:1.35;margin:0 0 12px">${esc(titulo)}</h1>` : ''}
    ${cuerpo ? `<p style="font-size:15px;line-height:1.65;margin:0 0 16px">${esc(cuerpo)}</p>` : ''}
    ${ctaTexto && ctaUrl ? `<p style="margin:20px 0"><a href="${esc(ctaUrl)}" style="display:inline-block;background:${pal.acento};color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${esc(ctaTexto)}</a></p>` : ''}
    <p style="font-size:12px;line-height:1.6;color:#6B7A86;margin:20px 0 0">te escribe ${esc(remitente)}.<br>
    ${bajaUrl ? `si no querés recibir estos emails, <a href="${esc(bajaUrl)}" style="color:${pal.principal}">darte de baja</a>.` : ''}</p>
  </div>
</div>`;
  const text = [titulo, '', cuerpo, '', ctaTexto && ctaUrl ? `${ctaTexto}: ${ctaUrl}` : '', bajaUrl ? `darse de baja: ${bajaUrl}` : ''].filter(Boolean).join('\n');
  return { html, text, paleta: pal, ideaExtra, ideaUsada: titulo };
}

// --- B2. Envío real (gated) ------------------------------------------------
// Puertas fail-closed, en orden: jugada aceptada en Bandeja (tipo
// 'email_prospecto') · destinatario no suprimido · conexión email viva ·
// cupo del gobernador. Transporte: email.js sendEmail(). Si el proveedor
// falla, el cupo se devuelve. opts: { emailMod, conexiones, venty }.
async function enviarEmail(db, userId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const venty = o.venty || require('./venty');
  const conexiones = o.conexiones || require('./venty-conexiones');
  const jugadaId = Number(o.jugadaId || 0);
  if (!jugadaId) return { ok: false, error: 'sin_jugada' };
  const jugada = db.prepare('SELECT * FROM venty_jugadas WHERE id = ? AND user_id = ?').get(jugadaId, userId);
  if (!jugada) return { ok: false, error: 'jugada_no_encontrada' };
  if (jugada.estado !== 'aceptada') return { ok: false, error: 'jugada_no_aceptada' };
  if (jugada.tipo !== 'email_prospecto') return { ok: false, error: 'jugada_tipo_invalido' };
  const propuesta = (() => { try { return JSON.parse(jugada.propuesta_json || '{}'); } catch (e) { return {}; } })();
  const para = normEmail(o.para || propuesta.para || '');
  if (!emailValido(para)) return { ok: false, error: 'email_invalido' };
  if (estaSuprimido(db, userId, para)) return { ok: false, error: 'suprimido' };
  const estado = conexiones.estadoCanal(db, userId, 'email');
  if (!estado || !estado.viva) return { ok: false, error: 'email_no_conectado' };
  const permiso = gobernador.pedirPermiso(db, userId, 'email', 1, 'email prospecto ' + para);
  if (!permiso.permitido) return { ok: false, error: 'cupo_diario_agotado', cupo: permiso };
  const fundamento = venty.leerFundamento ? venty.leerFundamento(db, userId) : null;
  const paleta = (fundamento && fundamento.paleta) || [];
  const bajaUrl = o.bajaUrlBase
    ? String(o.bajaUrlBase).replace(/\/$/, '') + '/api/venty/email/baja?t=' + tokenBaja(userId, para) + '&e=' + encodeURIComponent(para)
    : '';
  const pieza = construirEmailNegocio({
    negocio: (fundamento && (fundamento.negocio || '')) || propuesta.negocio || '',
    paleta, idea: { titulo: propuesta.titulo || o.asunto || '', cuerpo: propuesta.cuerpo || o.cuerpo || '' },
    asunto: propuesta.titulo || o.asunto || '',
    ctaTexto: propuesta.ctaTexto || '', ctaUrl: propuesta.ctaUrl || '',
    remitente: propuesta.remitente || '', bajaUrl,
  });
  const emailMod = o.emailMod || require('./email');
  let r;
  try {
    r = await emailMod.sendEmail({
      to: para,
      subject: String(propuesta.titulo || o.asunto || 'te escribo de ' + ((fundamento && fundamento.negocio) || 'tu negocio')).slice(0, 120),
      html: pieza.html, text: pieza.text,
    });
  } catch (e) {
    gobernador.devolverConsumo(db, userId, 'email', 1, 'sendEmail lanzó');
    return { ok: false, error: 'envio_fallo' };
  }
  if (!r || !r.ok) {
    gobernador.devolverConsumo(db, userId, 'email', 1, 'proveedor rechazó');
    return { ok: false, error: (r && r.error) || 'envio_fallo' };
  }
  db.prepare(`INSERT INTO venty_email_envios (user_id, jugada_id, para_email, asunto, estado, provider_id, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(userId, jugadaId, para, String(propuesta.titulo || o.asunto || '').slice(0, 120), 'sent', (r && r.id) || '', ahoraIso());
  try { venty.registrarEvento(db, userId, 'email_prospecto_enviado', null, { jugada_id: jugadaId, para }); } catch (e) {}
  return { ok: true, id: (r && r.id) || '', paleta: pieza.paleta };
}

module.exports = {
  DOMINIO_REENVIO, PREFIJO_LOCAL,
  ensureSchema, generarDireccion, estadoDireccion, resolverToken, registrarIngesta,
  estaSuprimido, suprimir, quitarSupresion, tokenBaja, verificarBaja,
  paletaNegocio, construirEmailNegocio, enviarEmail, emailValido,
};
