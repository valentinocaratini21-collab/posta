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
    <div style="font-size:22px;font-weight:800;color:#fff">Posta<span style="color:#FEC14D">.</span></div>
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
      Ya los armé con tu marca y tu estilo. Entrá y programalos con un clic —
      o editá lo que quieras antes de que salgan. Te espero 😄<br>
      <span style="font-size:13px"><b>Posty</b> 🤖</span>
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
function publishedEmail(user, post, baseUrl, permalink, isFirst) {
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

module.exports = { emailConfigured, sendEmail, weeklyReminderEmail, draftsNudgeEmail, emptyWeekEmail, publishedEmail, weeklyReportEmail };
