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
  const from = process.env.EMAIL_FROM || 'Posta <hola@postahacetodo.com>';
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
function weeklyReminderEmail(user, baseUrl) {
  const name = (user.email || '').split('@')[0];
  const cta = `${baseUrl}/#/app/semana`;
  const subject = 'Armá los posteos de tu semana 📱';
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
  <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
    <div style="font-size:22px;font-weight:800;color:#fff">Posta<span style="color:#FEC14D">.</span></div>
  </div>
  <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
    <p style="font-size:16px;margin:0 0 12px">Hola${name ? `, ${name}` : ''} 👋</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#47617A">
      Nueva semana, nuevos posteos. Entrá a Posta y armá los de tu negocio en 1 minuto:
      nosotros los diseñamos y los publicamos por vos.
    </p>
    <p style="text-align:center;margin:0 0 20px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Armar mi semana</a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#47617A;margin:0">
      Te llega este recordatorio porque tenés cuenta en Posta y todavía no instalaste la app en tu teléfono.
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
    <div style="font-size:22px;font-weight:800;color:#fff">Posta<span style="color:#FEC14D">.</span></div>
  </div>
  <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
    ${inner}
    <p style="font-size:12px;line-height:1.6;color:#47617A;margin:20px 0 0">
      Te avisamos porque tenés contenido pendiente en Posta.<br>
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
      Ya los armamos con tu marca y tu estilo. Entrá y programalos con un clic —
      o editá lo que quieras antes de que salgan.
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">Programar mis posteos</a>
    </p>`);
  return sendEmail({ to: user.email, subject, html });
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
      botón y los armamos por vos — textos, diseños y reel con tu marca y tu estilo.
    </p>
    <p style="text-align:center;margin:0 0 8px">
      <a href="${cta}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 32px;border-radius:999px;text-decoration:none">⚡ Armar mi semana</a>
    </p>`);
  return sendEmail({ to: user.email, subject, html });
}

module.exports = { emailConfigured, sendEmail, weeklyReminderEmail, draftsNudgeEmail, emptyWeekEmail };
