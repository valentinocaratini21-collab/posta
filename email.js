// Email — recordatorios semanales vía Resend (usa fetch nativo, sin dependencias nuevas).
//
// Para que los emails salgan de verdad, configurar en Railway:
//   RESEND_API_KEY = (clave de https://resend.com)
//   EMAIL_FROM     = Posta <hola@postahacetodo.com>   (opcional; el dominio debe estar verificado en Resend)
// Sin RESEND_API_KEY el envío se omite y solo queda registrado en el log (no rompe nada).

const RESEND_URL = 'https://api.resend.com/emails';

function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] sin RESEND_API_KEY: no se envía a ${to} (asunto: ${subject})`);
    return { ok: false, skipped: true };
  }
  const from = process.env.EMAIL_FROM || 'Posty <hola@postahacetodo.com>';
  let r;
  try {
    r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error(`[email] error de red enviando a ${to}:`, e.message);
    return { ok: false, error: e.message };
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    console.error(`[email] Resend rechazó el envío a ${to} (HTTP ${r.status}):`, body.slice(0, 300));
    return { ok: false, error: `HTTP ${r.status}` };
  }
  return { ok: true };
}

// Recordatorio semanal: armar los posteos de la semana.
// Va a quienes tienen cuenta pero NO instalaron la app en el teléfono
// (los que la instalaron reciben push en el futuro, no emails).
// Si el usuario tiene racha activa, el asunto la celebra: "Tu racha sigue viva 🔥".
// mission: array de 3 fotos de la misión semanal (si se pudo generar).
function weeklyReminderEmail(user, baseUrl, streak, mission) {
  const name = (user.email || '').split('@')[0];
  const cta = `${baseUrl}/#/app/semana`;
  const hasStreak = streak && streak.current > 0 && streak.level;
  const subject = hasStreak ? `Tu racha sigue viva ${streak.level.emoji}` : 'Armá los posteos de tu semana 📱';
  const streakLine = hasStreak ? `
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Llevás <b>${streak.current} ${streak.current === 1 ? 'semana seguida' : 'semanas seguidas'}</b> ${streak.level.emoji} — armá esta semana y la racha sigue creciendo.
    </p>` : '';
  const missionLine = (mission && mission.length) ? `
    <div style="background:#fff;border:1.5px dashed #FEC14D;border-radius:12px;padding:16px 18px;margin:0 0 20px">
      <p style="font-size:15px;font-weight:800;margin:0 0 8px;color:#0A1E33">📸 Tu misión de fotos de esta semana</p>
      ${mission.map((s, i) => `<p style="font-size:14px;line-height:1.5;margin:0 0 6px;color:#47617A"><b>${i + 1}.</b> ${s}</p>`).join('')}
      <p style="font-size:13px;line-height:1.5;margin:8px 0 0;color:#47617A">Subilas en la app — van a protagonizar tus posteos. Con contenido real, todo sale muchísimo mejor.</p>
    </div>` : '';
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
  <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
    <div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div>
  </div>
  <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
    <p style="font-size:16px;margin:0 0 12px">Hola${name ? `, ${name}` : ''} 👋</p>
    ${streakLine}
    ${missionLine}
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Nueva semana, nuevos posteos. Entrá y armá los de tu negocio en 1 minuto:
      yo los diseño y los publico por vos.<br>
      <span style="font-size:13px">Te lo dice <b>Posty</b>, tu community manager 🤖</span>
    </p>
    <p style="text-align:center;margin:0 0 20px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Armar mi semana</a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#47617A;margin:0">
      Te llega este recordatorio porque tenés cuenta en Posty y todavía no instalaste la app en tu teléfono.
      Cuando la instales, estos mails se apagan solos.<br>
      ¿No querés recibirlos más? Escribinos a <a href="mailto:hola@postahacetodo.com" style="color:#2793C8">hola@postahacetodo.com</a>.
    </p>
  </div>
</div>`;
  return sendEmail({ to: user.email, subject, html });
}

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

// Nudge "ya tenemos tus posteos listos": el usuario tiene borradores sin revisar.
// Solo se manda si los borradores existen de verdad (el mensaje tiene que ser verdad).
function draftsNudgeEmail(user, baseUrl) {
  const name = (user.name || '').trim();
  const n = user.count || 0;
  const cta = `${baseUrl}/#/app/ideas`;
  const subject = `Tus posteos de la semana para Instagram ya están listos 👀`;
  const html = emailShell(`
    <p style="font-size:16px;margin:0 0 12px">Hola${name ? `, ${name}` : ''} 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Ya los armé con tu marca y tu estilo. Entrá y programalos con un clic —
      o editá lo que quieras antes de que salgan. Te espero 😄<br>
      <span style="font-size:13px"><b>Posty</b> 🤖</span>
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Programar mis posteos</a>
    </p>`);
  return sendEmail({ to: user.email, subject, html });
}

// Nudge "tu semana te está esperando" (abandono de trial, 2026-09-30).
// Segmento: leads NO registrados que generaron su semana en /prueba, dejaron
// su email en la pantalla de resultados y no volvieron en ~24h. UN solo email
// por lead (trial_cache.abandon_sent). Si se registraron, no se manda.
// NO se solapa con los otros emails de este archivo: weeklyReminderEmail,
// draftsNudgeEmail, emptyWeekEmail, publishedEmail y weeklyReportEmail apuntan
// a users registrados (con cuenta); este apunta a trial_cache (sin cuenta).
// El email es único y transaccional; el opt-out es responder/escribir a hola@.
function trialAbandonEmail(lead, baseUrl, bizName, link) {
  const biz = String(bizName || 'tu negocio').replace(/</g, '&lt;').slice(0, 80);
  const subject = 'Tu semana sigue guardada 👀';
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
  <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
    <div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div>
  </div>
  <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
    <p style="font-size:16px;margin:0 0 12px">Che 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Tu semana sigue guardada 👀 La armé para <b>${biz}</b> y está buenísima.
      Mirala acá antes de que se borre:<br>
      <span style="font-size:13px">Te lo dice <b>Posty</b>, tu community manager 🤖</span>
    </p>
    <p style="text-align:center;margin:0 0 20px">
      <a href="${link}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Ver mi semana 👀</a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#47617A;margin:0">
      Este es el único aviso que te mando: tu semana se borra sola en 72 horas.
      Dejaste tu email en la prueba gratuita de Posty.<br>
      ¿No querés recibirlo? Escribinos a <a href="mailto:hola@postahacetodo.com" style="color:#2793C8">hola@postahacetodo.com</a>.
    </p>
  </div>
</div>`;
  return sendEmail({ to: lead.email, subject, html });
}

// Nudge "semana vacía": no hay borradores ni nada programado. Tono positivo y
// honesto: no promete posteos que no existen, vende lo fácil que es tenerlos.
function emptyWeekEmail(user, baseUrl) {
  const name = (user.name || '').trim();
  const cta = `${baseUrl}/#/app/ideas`;
  const subject = 'Tus posteos de la semana, listos en 2 minutos ⚡';
  const html = emailShell(`
    <p style="font-size:16px;margin:0 0 12px">Hola${name ? `, ${name}` : ''} 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#47617A">
      Esta semana tus posteos pueden estar listos sin que pienses en nada: tocá el
      botón y los armo por vos — textos, diseños y reel con tu marca y tu estilo.
      Dale, que la rompemos juntos 💪<br>
      <span style="font-size:13px"><b>Posty</b> 🤖</span>
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">⚡ Armemos tu semana</a>
    </p>`);
  return sendEmail({ to: user.email, subject, html });
}

// Aviso "ya salió": cada vez que un posteo se publica, el cliente recibe la prueba
// de que Posta cumple "se publica solo". Corto, con link al posteo.
// referralLink (opcional): si viene, se suma un bloque discreto de referido
// (solo se pasa cuando el usuario tiene <2 referidos activos).
function publishedEmail(user, post, baseUrl, permalink, isFirst, referralLink) {
  const name = (user.name || '').trim();
  const isVideo = post.media_type === 'video';
  const subject = `✅ Tu ${isVideo ? 'reel' : 'posteo'} ya salió en Instagram`;
  const html = emailShell(`
    <p style="font-size:16px;margin:0 0 12px">Hola${name ? `, ${name}` : ''} 👋</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 8px;color:#0A1E33"><b>Tu ${isVideo ? 'reel' : 'posteo'} ya está publicado en Instagram. ✅</b></p>
    ${isFirst ? `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#0A1E33">🎉 <b>¡Es tu primer posteo conmigo!</b> El primero de muchísimos — yo me ocupo de que cada semana salga mejor.</p>` : ''}
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      No tuviste que hacer nada — nosotros nos ocupamos de todo.<br>
      <span style="font-size:13px">Con cariño, <b>Posty</b> 🤖</span>
    </p>
    ${permalink ? `<p style="text-align:center;margin:0 0 8px">
      <a href="${permalink}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Ver en Instagram</a>
    </p>` : ''}
    ${referralLink ? `<p style="font-size:13px;line-height:1.6;margin:14px 0 0;color:#7B93A9;text-align:center">
      💛 ¿Conocés a alguien con negocio? Si entra con tu link, los dos ganan 50% off 👇<br>
      <a href="${referralLink}" style="color:#2793C8;text-decoration:underline">${referralLink}</a>
    </p>` : ''}`);
  return sendEmail({ to: user.email, subject, html });
}

// Reporte semanal de resultados: "Tu semana en números" (domingo 19:30).
// La prueba visible de que Posta funciona: alcance, likes y mejor posteo.
function weeklyReportEmail(user, baseUrl, rows) {
  const name = (user.name || '').trim();
  const tot = rows.reduce((a, r) => ({
    reach: a.reach + (r.reach || 0),
    likes: a.likes + (r.likes || 0),
    comments: a.comments + (r.comments || 0),
  }), { reach: 0, likes: 0, comments: 0 });
  const best = rows.slice().sort((a, b) => (b.reach || 0) - (a.reach || 0))[0];
  const bestCap = best ? String(best.caption || '').split('\n')[0].slice(0, 60) : '';
  const subject = `📊 Tu semana en números: ${tot.reach.toLocaleString('es-AR')} personas alcanzadas`;
  const cards = rows.map(r => {
    const cap = String(r.caption || '').split('\n')[0].slice(0, 70) || (r.media_type === 'story' ? 'Historia' : 'Posteo');
    const kind = r.media_type === 'video' ? '🎬' : r.media_type === 'story' ? '📱' : '🖼️';
    return `<div style="background:#F4F8FB;border-radius:12px;padding:12px 14px;margin:0 0 8px">
      <div style="font-size:14px;font-weight:700;color:#0A1E33;margin-bottom:4px">${kind} ${cap.replace(/</g, '&lt;')}</div>
      <div style="font-size:13px;color:#47617A">👁️ ${(r.reach || 0).toLocaleString('es-AR')} alcance &nbsp;•&nbsp; ❤️ ${r.likes || 0} &nbsp;•&nbsp; 💬 ${r.comments || 0}</div>
    </div>`;
  }).join('');
  const html = emailShell(`
    <p style="font-size:16px;margin:0 0 12px">Hola${name ? `, ${name}` : ''} 👋</p>
    <p style="font-size:17px;line-height:1.6;margin:0 0 12px;color:#0A1E33"><b>Así rindió tu semana en Instagram 📊</b></p>
    <div style="display:flex;gap:8px;margin:0 0 16px">
      <div style="flex:1;background:#0A1E33;color:#fff;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800">${tot.reach.toLocaleString('es-AR')}</div><div style="font-size:12px;opacity:.8">alcance</div></div>
      <div style="flex:1;background:#0A1E33;color:#fff;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800">${tot.likes.toLocaleString('es-AR')}</div><div style="font-size:12px;opacity:.8">likes</div></div>
      <div style="flex:1;background:#0A1E33;color:#fff;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800">${tot.comments.toLocaleString('es-AR')}</div><div style="font-size:12px;opacity:.8">comentarios</div></div>
    </div>
    ${bestCap ? `<p style="font-size:15px;margin:0 0 12px;color:#0A1E33">🏆 Tu mejor posteo: <b>"${bestCap.replace(/</g, '&lt;')}"</b></p>` : ''}
    ${cards}
    <p style="font-size:15px;line-height:1.6;margin:16px 0 20px;color:#47617A">
      Todo esto, mientras vos atendías tu negocio. La semana que viene, más. 🚀<br>
      <span style="font-size:13px">Tu community manager, <b>Posty</b> 🤖</span>
    </p>
    <p style="text-align:center;margin:0">
      <a href="${baseUrl}/" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Ver mi semana →</a>
    </p>`);
  return sendEmail({ to: user.email, subject, html });
}

// Aviso "mañana se termina tu prueba" (paywall, 2026-09-30).
// Solo a usuarios en trial cuyo fin efectivo cae en 20-28h. Un solo email por
// cuenta (users.trial_expiry_email_sent se setea ANTES de enviar).
function trialExpiryEmail(user, baseUrl) {
  const cta = `${baseUrl}/#/app/ajustes`;
  const subject = 'Mañana se termina tu prueba 🥹';
  const html = emailShell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Che, soy Posty. Mañana se termina tu prueba gratis — y no quiero que tus posteos frenen.
      Elegí tu plan y el lunes tu semana está lista como siempre: vos aprobás, yo publico. 💛
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Ver planes →</a>
    </p>`);
  return sendEmail({ to: user.email, subject, html });
}

// Email día 2 "publicá tu primero" (2026-09-30, mejora "garantizar el primer posteo").
// Solo a usuarios con 0 posteos publicados (el scheduler lo garantiza).
// CTA directo a publicar el primer borrador en la app (Schedule muestra el
// botón "🚀 Publicar mi primero"; si no hay borradores, el botón lo genera).
// El copy es honesto: cambia según haya borradores listos o no.
function firstPublishNudgeEmail(user, baseUrl) {
  const name = String(user.name || '').trim();
  const n = Number(user.drafts) || 0;
  const cta = `${baseUrl}/#/app/schedule`;
  const subject = 'Tu primer posteo está listo para salir 🚀';
  const body = n > 0
    ? `Ya dejé tus posteos armados con tu marca y tu estilo. Falta lo mejor:
      ver el primero <b>vivo en tu Instagram</b> 🚀<br>
      Publicalo con 1 tap — yo me ocupo del resto.`
    : `Tu prueba sigue corriendo y todavía no salió tu primer posteo — vamos a
      cambiar eso ya 🚀<br>
      Tocá el botón: armo tu primer posteo al toque y lo publicamos juntos, en 1 tap.`;
  const html = emailShell(`
    <p style="font-size:16px;margin:0 0 12px">Hola${name ? `, ${name}` : ''} 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      ${body}<br>
      <span style="font-size:13px">Te lo dice <b>Posty</b>, tu community manager 🤖</span>
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">🚀 Publicar mi primero</a>
    </p>`);
  return sendEmail({ to: user.email, subject, html });
}

// Magic link: entrar sin contraseña (vale 15 minutos, un solo uso).
function magicLinkEmail(email, link) {
  const subject = 'Entrá a Posty sin contraseña ✨';
  const html = emailShell(`
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Tocalo y entrás directo, sin contraseña 👇 (vale 15 minutos)<br>
      <span style="font-size:13px">Te lo manda <b>Posty</b> 🤖</span>
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${link}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Entrar a Posty ✨</a>
    </p>`);
  return sendEmail({ to: email, subject, html });
}

module.exports = { emailConfigured, sendEmail, weeklyReminderEmail, draftsNudgeEmail, emptyWeekEmail, publishedEmail, weeklyReportEmail, trialAbandonEmail, trialExpiryEmail, magicLinkEmail, firstPublishNudgeEmail };
