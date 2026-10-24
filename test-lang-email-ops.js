// test-lang-email-ops.js — v373 paridad total en emails OPERATIVOS.
// Con un Resend falso local (RESEND_API_URL) verifica, para TODA la familia
// operativa (email.js ×9, notify-email.js ×5, línea de referido de wins.js):
//  1. Cuenta EN (users.lang='en' / payload lang / parámetro lang) recibe
//     asunto y cuerpo en inglés, sin marcadores ES.
//  2. Cuenta ES (sin lang) recibe EXACTAMENTE los asuntos históricos y el
//     copy ES de siempre (la invariante byte a byte se prueba además en el
//     harness es-diff del build, original vs nuevo).
//  3. El registro durable (setSendLogger → email_send_log) guarda el asunto
//     en el idioma correcto por intento.
// Ninguna corrida toca Resend real ni la DB de producción.
'use strict';
const http = require('http');
const fs = require('fs'), os = require('os'), path = require('path');

let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) { ok++; console.log('  ✓', name); } else { bad++; console.log('  ✗', name); } };

async function main() {
  // DB descartable: si algún require perezoso (server.js vía sendWeekPreview)
  // inicializa la base, que sea una temporal y nunca la del árbol.
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-ops-data-'));
  const captured = [];
  const logRows = [];
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      captured.push(JSON.parse(body || '{}'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'stub-' + captured.length }));
    });
  });
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  process.env.RESEND_API_KEY = 'test-key';
  process.env.RESEND_API_URL = `http://127.0.0.1:${stub.address().port}/emails`;
  process.env.EMAIL_FROM = 'Posty <hola@postycommunitymanager.com>';
  process.env.APPROVAL_SECRET = 'lang-ops-secret';
  delete process.env.BASE_URL; delete process.env.APP_URL;

  const E = require('./email');
  E.setSendLogger((row) => logRows.push(row));
  const base = 'https://postycommunitymanager.com';
  const last = () => captured[captured.length - 1];
  const ES_MARK = /(Armá|Tus posteos|Te avisamos|Todavía no|Mañana se termina|Publicalo|Suscribite|pagás|tenés|querés)/;

  // ---------- email.js: las 9 plantillas ----------
  console.log('— email.js · recordatorio semanal —');
  await E.weeklyReminderEmail({ email: 'en@x.com', lang: 'en' }, base, { current: 3, level: { emoji: '🔥' } }, ['A photo of your storefront']);
  t('EN asunto racha', last().subject === 'Your streak is still alive 🔥');
  t('EN cuerpo', /Build my week/.test(last().html) && /weeks? in a row/.test(last().html) && !ES_MARK.test(last().html));
  await E.weeklyReminderEmail({ email: 'es@x.com' }, base, null, null);
  t('ES asunto histórico', last().subject === 'Armá los posteos de tu semana 📱');
  t('ES cuerpo histórico', /Armar mi semana/.test(last().html));

  console.log('— email.js · nudge de borradores / semana vacía —');
  await E.draftsNudgeEmail({ email: 'en@x.com', name: 'Ana', count: 5, lang: 'en' }, base);
  t('EN asunto borradores', last().subject === 'Your Instagram posts for this week are ready 👀');
  t('EN cuerpo + pie EN', /Schedule my posts/.test(last().html) && /We're writing because/.test(last().html));
  await E.draftsNudgeEmail({ email: 'es@x.com', name: 'Ana', count: 5 }, base);
  t('ES asunto histórico', last().subject === 'Tus posteos de la semana para Instagram ya están listos 👀');
  await E.emptyWeekEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, base);
  t('EN asunto semana vacía', last().subject === 'Your posts for the week, ready in 2 minutes ⚡');
  await E.emptyWeekEmail({ email: 'es@x.com', name: 'Ana' }, base);
  t('ES asunto histórico', last().subject === 'Tus posteos de la semana, listos en 2 minutos ⚡');

  console.log('— email.js · abandono de prueba (lead, lang del payload) —');
  await E.trialAbandonEmail({ email: 'lead@x.com' }, base, 'Sun Café', base + '/en/prueba?ig=sun.cafe', 'en');
  t('EN asunto abandono', last().subject === 'Your week is still saved 👀');
  t('EN cuerpo + link EN', /See my week/.test(last().html) && /\/en\/prueba\?ig=sun\.cafe/.test(last().html) && !ES_MARK.test(last().html));
  await E.trialAbandonEmail({ email: 'lead@x.com' }, base, 'Café Sol', base + '/prueba?ig=cafe.sol');
  t('ES asunto histórico', last().subject === 'Tu semana sigue guardada 👀');

  console.log('— email.js · posteo publicado + referido —');
  await E.publishedEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, { media_type: 'image' }, base, 'https://instagram.com/p/ABC', true, base + '/?ref=xyz');
  t('EN asunto publicado', last().subject === '✅ Your post is live on Instagram');
  t('EN primer posteo + referido', /first post with me/.test(last().html) && /you both get 50% off/.test(last().html));
  await E.publishedEmail({ email: 'en@x.com', lang: 'en' }, { media_type: 'video' }, base, '', false, '');
  t('EN asunto reel', last().subject === '✅ Your reel is live on Instagram');
  await E.publishedEmail({ email: 'es@x.com', name: 'Ana' }, { media_type: 'image' }, base, '', false, '');
  t('ES asunto histórico', last().subject === '✅ Tu posteo ya salió en Instagram');

  console.log('— email.js · reporte semanal —');
  const rows = [
    { caption: 'Promo del finde', media_type: 'image', reach: 12345, likes: 100, comments: 5 },
    { caption: '', media_type: 'story', reach: 300, likes: 0, comments: 0 },
    { caption: 'Reel nuevo', media_type: 'video', reach: 999, likes: 42, comments: 3 },
  ];
  await E.weeklyReportEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, base, rows);
  t('EN asunto con formato en-US', last().subject === '📊 Your week in numbers: 13,644 people reached');
  t('EN etiquetas', />reach</.test(last().html) && />likes</.test(last().html) && /Story/.test(last().html) && !/alcance/.test(last().html));
  await E.weeklyReportEmail({ email: 'es@x.com', name: 'Ana' }, base, rows);
  t('ES asunto con formato es-AR', last().subject === '📊 Tu semana en números: 13.644 personas alcanzadas');

  console.log('— email.js · expiración / primer posteo / ritual —');
  await E.trialExpiryEmail({ email: 'en@x.com', lang: 'en' }, base);
  t('EN asunto expiración', last().subject === 'Your trial ends tomorrow 🥹');
  await E.trialExpiryEmail({ email: 'es@x.com' }, base);
  t('ES asunto histórico', last().subject === 'Mañana se termina tu prueba 🥹');
  await E.firstPublishNudgeEmail({ email: 'en@x.com', name: 'Ana', drafts: 3, lang: 'en' }, base);
  t('EN asunto primer posteo', last().subject === 'Your first post is ready to go live 🚀');
  t('EN cuerpo con borradores', /live on your Instagram/.test(last().html));
  await E.firstPublishNudgeEmail({ email: 'en@x.com', name: 'Ana', drafts: 0, lang: 'en' }, base);
  t('EN cuerpo sin borradores', /build your first post on the spot/.test(last().html));
  await E.firstPublishNudgeEmail({ email: 'es@x.com', name: 'Ana', drafts: 3 }, base);
  t('ES asunto histórico', last().subject === 'Tu primer posteo está listo para salir 🚀');
  await E.photoRitualEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, base, 'Take a photo of your star dish 📸');
  t('EN asunto ritual', last().subject === 'This week, can you send me 3 to 5 photos of your business? 📸');
  t('EN cuerpo ritual', /Upload my photos/.test(last().html) && /Idea of the week/.test(last().html));
  await E.photoRitualEmail({ email: 'es@x.com', name: 'Ana' }, base, 'Sacale una foto a tu plato estrella 📸');
  t('ES asunto histórico', last().subject === 'Esta semana, ¿me pasás 3 a 5 fotos de tu negocio? 📸');

  console.log('— registro durable: el asunto guardado va en el idioma del intento —');
  t('log con asuntos EN', logRows.some((r) => r.subject === 'Your trial ends tomorrow 🥹' && r.status === 'sent'));
  t('log con asuntos ES', logRows.some((r) => r.subject === 'Mañana se termina tu prueba 🥹' && r.status === 'sent'));

  // ---------- notify-email.js: los 5 avisos ----------
  console.log('— notify-email.js · avisos de aprobación y publicación —');
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-ops-'));
  const db = new DatabaseSync(path.join(dir, 't.db'));
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '');
CREATE TABLE settings (user_id INTEGER, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires', image_base_url TEXT DEFAULT '');`);
  db.prepare('INSERT INTO users (id, email, lang, client_name) VALUES (2, ?, ?, ?)').run('es@test.dev', 'es', 'Negocio ES');
  db.prepare('INSERT INTO users (id, email, lang, client_name) VALUES (7, ?, ?, ?)').run('en@test.dev', 'en', 'EN Biz');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (2, ?)').run('America/Argentina/Buenos_Aires');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (7, ?)').run('America/New_York');
  const NE = require('./notify-email');
  const sqlIn = (min) => new Date(Date.now() + min * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const postEn = { id: 777, user_id: 7, caption: 'Launch promo', image_path: '/media/e.jpg', scheduled_at: sqlIn(180) };
  const postEs = { id: 778, user_id: 2, caption: 'Promo', image_path: '/media/s.jpg', scheduled_at: sqlIn(180) };

  await NE.sendApprovalEmail(db, postEn);
  t('EN asunto aprobación', /^Your \d{2}:\d{2} post is ready 👀$/.test(last().subject));
  t('EN cuerpo aprobación', /approve it in one tap/.test(last().html) && />✅ Approve</.test(last().html) && /We're writing because/.test(last().html));
  await NE.sendApprovalEmail(db, postEs);
  t('ES asunto aprobación histórico', /^Tu posteo de las \d{2}:\d{2} está listo 👀$/.test(last().subject));
  await NE.sendMissedEmail(db, postEn);
  t('EN asunto no publicado', /^I didn't publish your \d{2}:\d{2} post 😅$/.test(last().subject));
  await NE.sendMissedEmail(db, postEs);
  t('ES asunto no publicado histórico', /^No publiqué tu posteo de las \d{2}:\d{2} 😅$/.test(last().subject));
  await NE.sendWeekReady(db, 7, 5);
  t('EN asunto semana lista', last().subject === 'Your week is ready 🎉');
  t('EN cuerpo semana lista', /I built your week and already scheduled it/.test(last().html));
  await NE.sendWeekReady(db, 2, 5);
  t('ES asunto semana lista histórico', last().subject === 'Tu semana está lista 🎉');
  const draftsEn = [{ id: 1, image_path: '/media/a.jpg', caption: 'One', scheduled_at: sqlIn(60 * 26) }];
  await NE.sendWeekPreview(db, 7, '2026-10-19', draftsEn);
  t('EN asunto preview', last().subject === 'Your week is ready ✨');
  t('EN cuerpo preview + día en inglés', /I built your week/.test(last().html) && /📅 (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{2}:\d{2}/.test(last().html) && /🚀 Publish week/.test(last().html));
  await NE.sendWeekPreview(db, 2, '2026-10-19', draftsEn);
  t('ES preview: día en español', /📅 (lun|mar|mié|jue|vie|sáb|dom) \d{2}:\d{2}/.test(last().html));
  await NE.sendUpcomingEmail(db, postEn, { mode: 'manual' });
  t('EN asunto upcoming manual', last().subject === '⏰ Going out in 30 minutes: shall we publish it?');
  t('EN cuerpo upcoming manual', /✅ Yes, publish it/.test(last().html) && /\(your account's time\)/.test(last().html));
  await NE.sendUpcomingEmail(db, postEn, { mode: 'autopilot' });
  t('EN asunto upcoming autopilot', last().subject === '⏰ Your post goes out in 30 minutes');
  await NE.sendUpcomingEmail(db, postEs, { mode: 'manual' });
  t('ES asunto upcoming manual histórico', last().subject === '⏰ Sale en 30 minutos: ¿lo publicamos?');
  await NE.sendUpcomingEmail(db, postEs, { mode: 'autopilot' });
  t('ES asunto upcoming autopilot histórico', last().subject === '⏰ Tu posteo sale en 30 minutos');

  // ---------- wins.js: línea de referido del festejo ----------
  console.log('— wins.js · línea de referido —');
  const W = require('./wins');
  const fakeDb = { prepare: () => ({ get: () => ({ n: 0 }) }) };
  t('ES línea histórica exacta', W.referralWinLine(fakeDb, 1, 'abc123', 'https://postycommunitymanager.com') === '\nconocés a alguien con negocio? los dos ganan 50% off 👇\nhttps://postycommunitymanager.com/?ref=abc123');
  t('EN línea en inglés', W.referralWinLine(fakeDb, 1, 'abc123', 'https://postycommunitymanager.com', 'en') === '\nknow someone with a business? you both get 50% off 👇\nhttps://postycommunitymanager.com/?ref=abc123');

  stub.close();
  console.log(`\n== test-lang-email-ops: ${ok} ok · ${bad} fallas ==`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
