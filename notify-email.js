// notify-email.js — "Posty te avisa": avisos de aprobación por email (Resend).
//
// Exports:
//   sendApprovalEmail(db, post) — aviso 3h antes con botones Aceptar/Rechazar firmados (válidos 4h).
//   sendMissedEmail(db, post)   — aviso "no se publicó porque no lo aprobaste", con CTA firmado (un tap, sin login).
// Ambas: async, nunca tiran (try/catch + log), retornan {ok:false, reason} en silencio
// si no hay email configurado o el usuario no tiene email (el push cubre).
'use strict';

const { sendEmail, emailConfigured } = require('./email');
const { signAction, signWeekAction, absoluteMediaUrl, userHourLabel } = require('./approval');

const BASE_URL = () => process.env.APP_URL || 'https://postyhacetodo.com';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getUser(db, userId) {
  try {
    const r = db.prepare('SELECT email, name FROM users WHERE id = ?').get(userId);
    return r || null;
  } catch (e) {
    return null;
  }
}

function getImageBaseUrl(db, userId) {
  try {
    const r = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(userId);
    return (r && r.image_base_url) || '';
  } catch (e) {
    return '';
  }
}

// Misma cabecera visual que los emails de email.js (posty. en celeste + fondo claro).
function emailShell(inner) {
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
  <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
    <div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div>
  </div>
  <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
    ${inner}
    <p style="font-size:12px;line-height:1.6;color:#47617A;margin:20px 0 0">
      Te avisamos porque tenés contenido pendiente en Posty.<br>
      ¿No querés recibir estos avisos? Escribinos a <a href="mailto:hola@postahacetodo.com" style="color:#2793C8">hola@postahacetodo.com</a>.
    </p>
  </div>
</div>`;
}

// "lun 18:00": día + hora del posteo en el timezone del usuario.
// userHourLabel de approval.js da solo la hora; acá sumamos el día corto.
function dayHourLabel(db, userId, isoUtc) {
  let tz = 'America/Argentina/Buenos_Aires';
  try {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    if (r && r.timezone) tz = r.timezone;
  } catch (e) { /* default */ }
  try {
    const s = String(isoUtc || '').trim();
    if (!s) return '';
    const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('es-AR', {
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).formatToParts(d);
    const get = (t) => ((parts.find((p) => p.type === t) || {}).value || '').replace(/\.$/, '');
    const wd = get('weekday'), hh = get('hour'), mm = get('minute');
    return wd && hh ? `${wd} ${hh}:${mm}` : '';
  } catch (e) {
    return '';
  }
}

function checkSendable(db, post) {
  if (!emailConfigured()) return { ok: false, reason: 'email no configurado' };
  const user = getUser(db, post.user_id);
  if (!user || !String(user.email || '').trim()) return { ok: false, reason: 'usuario sin email' };
  return { ok: true, user };
}

// Aviso "tu posteo está listo, aprobalo con un toque".
async function sendApprovalEmail(db, post) {
  try {
    const gate = checkSendable(db, post);
    if (!gate.ok) return gate;

    const base = BASE_URL();
    const hhmm = userHourLabel(db, post.user_id, post.scheduled_at) || '';
    const subject = `Tu posteo de las ${hhmm} está listo 👀`;

    const a = signAction(post.id, 'approve', 4);
    const r = signAction(post.id, 'reject', 4);
    const approveUrl = `${base}/api/posts/${post.id}/approve?sig=${a.sig}&exp=${a.exp}`;
    const rejectUrl = `${base}/api/posts/${post.id}/reject?sig=${r.sig}&exp=${r.exp}`;

    const img = absoluteMediaUrl(post.image_path, getImageBaseUrl(db, post.user_id));
    const caption = String(post.caption || '').trim();
    const captionHtml = esc(caption.slice(0, 200)) + (caption.length > 200 ? '…' : '');

    const html = emailShell(`
    <p style="font-size:16px;margin:0 0 16px">Te lo muestro para que lo apruebes con un toque 👇</p>
    ${img ? `<img src="${esc(img)}" alt="Posteo" style="width:100%;border-radius:12px;display:block;margin:0 0 16px">` : ''}
    ${captionHtml ? `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#0A1E33">${captionHtml}</p>` : ''}
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#0A1E33"><b>Sale hoy a las ${esc(hhmm)}</b></p>
    <p style="text-align:center;margin:0 0 12px">
      <a href="${approveUrl}" style="display:inline-block;min-width:200px;background:#2793C8;color:#fff;font-weight:800;font-size:17px;padding:16px 40px;border-radius:999px;text-decoration:none">✅ Aceptar</a>
    </p>
    <p style="text-align:center;margin:0 0 20px">
      <a href="${rejectUrl}" style="display:inline-block;min-width:200px;background:#fff;color:#47617A;font-weight:800;font-size:17px;padding:16px 40px;border-radius:999px;text-decoration:none;border:2px solid #B9CBD9">❌ Rechazar</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#47617A;margin:0;text-align:center">Si no hacés nada, sale solo en 3 horas. — <b>Posty</b> 🤖</p>`);
    return await sendEmail({ to: gate.user.email, subject, html });
  } catch (e) {
    console.error(`[notify-email] aprobación post #${post && post.id}:`, e.message);
    return { ok: false, error: e.message };
  }
}

// Aviso "no publiqué tu posteo porque todavía no me aprobaste nada".
async function sendMissedEmail(db, post) {
  try {
    const gate = checkSendable(db, post);
    if (!gate.ok) return gate;

    const base = BASE_URL();
    const hhmm = userHourLabel(db, post.user_id, post.scheduled_at) || '';
    const subject = `No publiqué tu posteo de las ${hhmm} 😅`;
    // FASE 3 — CTA firmado con signAction: un toque aprueba sin login ni app
    // (GET /api/posts/:id/approve con firma válida aprueba directo y muestra
    // la página de confirmación). Antes llevaba a /#/app/post/:id, que exige login.
    const a = signAction(post.id, 'approve', 4);
    const cta = `${base}/api/posts/${post.id}/approve?sig=${a.sig}&exp=${a.exp}`;

    const html = emailShell(`
    <p style="font-size:16px;margin:0 0 12px">Todavía no lo publiqué 😅</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Como todavía no me aprobaste nada, prefiero no publicar sin tu OK.
      Cuando me apruebes los primeros, después salen solos. 🚀<br>
      <span style="font-size:13px"><b>Posty</b> 🤖</span>
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Aprobarlo ahora</a>
    </p>`);
    return await sendEmail({ to: gate.user.email, subject, html });
  } catch (e) {
    console.error(`[notify-email] missed post #${post && post.id}:`, e.message);
    return { ok: false, error: e.message };
  }
}

// Aviso "tu semana está lista 🎉": la semana se armó y programó sola.
// Se manda tras el auto-arm (signup, regla 24h, semana semanal).
async function sendWeekReady(db, userId, n) {
  try {
    if (!emailConfigured()) return { ok: false, reason: 'email no configurado' };
    const user = getUser(db, userId);
    if (!user || !String(user.email || '').trim()) return { ok: false, reason: 'usuario sin email' };
    const base = BASE_URL();
    const subject = 'Tu semana está lista 🎉';
    const html = emailShell(`
    <p style="font-size:18px;font-weight:800;margin:0 0 12px">¡Hola${user.name ? ' ' + esc(user.name) : ''}! Soy Posty 🤖</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#0A1E33">Armé tu semana y ya la dejé programada: <b>${n} ${n === 1 ? 'posteo sale solo' : 'posteos salen solos'}</b> en su horario ✨</p>
    <p style="text-align:center;margin:0 0 20px">
      <a href="${base}/#/app/schedule" style="display:inline-block;min-width:200px;background:#2793C8;color:#fff;font-weight:800;font-size:17px;padding:16px 40px;border-radius:999px;text-decoration:none">Ver mi semana 👀</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#47617A;margin:0;text-align:center">Si querés cambiar algo, lo ajustás desde tu semana con un toque 👇</p>`);
    return await sendEmail({ to: user.email, subject, html });
  } catch (e) {
    console.error(`[notify-email] semana lista usuario ${userId}:`, e.message);
    return { ok: false, error: e.message };
  }
}

// FASE 2 — preview semanal con "Publicar semana" de un tap (CORAZÓN del
// autopilot): el usuario ve las tarjetas y publica sin login ni chat.
// Firma HMAC de 72h sobre (userId, weekKey). Asigna horarios propuestos a los
// borradores que no los tienen: lo que ve en el email = lo que se programa.
// Nunca tira: retorna {ok:false, reason} si no se puede enviar.
async function sendWeekPreview(db, userId, weekKey, drafts) {
  try {
    if (!emailConfigured()) return { ok: false, reason: 'email no configurado' };
    const user = getUser(db, userId);
    if (!user || !String(user.email || '').trim()) return { ok: false, reason: 'usuario sin email' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekKey || ''))) return { ok: false, reason: 'weekKey inválido' };
    let rows = (Array.isArray(drafts) && drafts.length) ? drafts : db.prepare(
      `SELECT * FROM posts WHERE user_id = ? AND week_key = ? AND status = 'draft'
         AND media_type IN ('image','carousel','video')
       ORDER BY created_at ASC`
    ).all(userId, weekKey);
    if (!rows.length) return { ok: false, reason: 'sin borradores' };
    // Horarios propuestos (misma política del autopilot): se persisten para
    // que el email muestre exactamente lo que el tap va a programar.
    try {
      const srv = require('./server'); // perezoso: evita ciclo de requires
      if (srv && typeof srv.assignScheduleSlots === 'function') {
        const missing = rows.filter((d) => !d.scheduled_at);
        if (missing.length) {
          const slots = srv.assignScheduleSlots(userId, missing);
          const upd = db.prepare('UPDATE posts SET scheduled_at = ? WHERE id = ? AND status = \'draft\'');
          for (const d of missing) {
            const iso = slots.get(d.id);
            if (iso) { upd.run(iso, d.id); d.scheduled_at = iso; }
          }
        }
      }
    } catch (e) { console.error('[notify-email] week preview slots:', e.message); }

    const base = BASE_URL();
    const { sig, exp } = signWeekAction(userId, weekKey, 72);
    const publishUrl = `${base}/api/week/${encodeURIComponent(weekKey)}/publish?uid=${encodeURIComponent(userId)}&sig=${sig}&exp=${exp}`;
    const subject = 'Tu semana está lista ✨';

    const cards = rows.map((d) => {
      const file = String(d.image_path || '').split('/').pop();
      const img = file ? absoluteMediaUrl(d.image_path, getImageBaseUrl(db, userId)) : '';
      const caption = String(d.caption || '').trim();
      const captionHtml = esc(caption.slice(0, 180)) + (caption.length > 180 ? '…' : '');
      const when = dayHourLabel(db, userId, d.scheduled_at);
      return `<div style="background:#fff;border-radius:12px;padding:16px;margin:0 0 16px;border:1px solid #DCE9F2">` +
        (img ? `<img src="${esc(img)}" alt="Posteo" style="width:100%;border-radius:8px;display:block;margin:0 0 12px">` : '') +
        (when ? `<p style="font-size:13px;font-weight:800;color:#2793C8;margin:0 0 8px;text-transform:uppercase">📅 ${esc(when)}</p>` : '') +
        (captionHtml ? `<p style="font-size:14px;line-height:1.6;margin:0;color:#0A1E33">${captionHtml}</p>` : '') +
        `</div>`;
    }).join('');

    const n = rows.length;
    const html = emailShell(`
    <p style="font-size:18px;font-weight:800;margin:0 0 12px">¡Hola${user.name ? ' ' + esc(user.name) : ''}! Soy Posty 🤖</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#0A1E33">Armé tu semana: <b>${n} ${n === 1 ? 'posteo' : 'posteos'}</b> listos para salir 👇</p>
    ${cards}
    <p style="text-align:center;margin:8px 0 12px">
      <a href="${publishUrl}" style="display:inline-block;min-width:220px;background:#2793C8;color:#fff;font-weight:800;font-size:18px;padding:18px 44px;border-radius:999px;text-decoration:none">🚀 Publicar semana</a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:#47617A;margin:0 0 8px;text-align:center">Un toque y quedan programados. Sin entrar a la app, sin chat. ✨</p>
    <p style="font-size:13px;line-height:1.6;color:#47617A;margin:0;text-align:center">¿Preferís cambiar algo o saltear esta semana? Ignorá este email: nada se publica sin tu OK.</p>`);
    return await sendEmail({ to: user.email, subject, html });
  } catch (e) {
    console.error(`[notify-email] week preview usuario ${userId}:`, e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendApprovalEmail, sendMissedEmail, sendWeekReady, sendWeekPreview };
