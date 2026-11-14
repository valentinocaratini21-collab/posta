// test-lote-voz-fundador-emails.js — LOTE VOZ-FUNDADOR (13/11/2026).
// Orden de Valentino: «el email que mandamos a los negocios, tenemos que
// mandarlo como que lo escribo yo y estoy presentando a posty. para que
// confien mas». Con un Resend falso local (patrón de test-lang-email-ops)
// verifica, para cada plantilla tocada por el lote:
//  1. Voz del fundador: saludo/firma de Valentino Caratini, fundador.
//  2. Plural de equipo: el trabajo se atribuye a «armamos / publicamos»,
//     nunca a «Posty arma» en tercera persona ni a un «yo» solitario.
//  3. Cero rayas largas (—) en el cuerpo de las plantillas reescritas.
//  4. Línea de fan hacia el negocio donde la plantilla la lleva.
//  5. Datos duros intactos: asuntos funcionales conservados, links, CTA,
//     plazos (72 horas), precios y condiciones byte a byte.
//  6. Clase (b): el cuerpo transaccional no cambia; solo la firma o el
//     saludo de marca pasa a la firma del fundador.
// Control: corrida contra base/ (la voz de marca) esta suite FALLA en los
// puntos de voz, que es lo que prueba que mide el cambio.
'use strict';
const http = require('http');
const fs = require('fs'), os = require('os'), path = require('path');

let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) { ok++; console.log('  ✓', name); } else { bad++; console.log('  ✗', name); } };
const DASH = '—';

async function main() {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-fundador-data-'));
  const captured = [];
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
  process.env.APPROVAL_SECRET = 'voz-fundador-secret';
  delete process.env.EMAIL_FROM; delete process.env.IDEAS_EMAIL_FROM;
  delete process.env.BASE_URL; delete process.env.APP_URL; delete process.env.PUBLIC_BASE_URL;

  const E = require('./email');
  const base = 'https://postycommunitymanager.com';
  const last = () => captured[captured.length - 1];
  const FOUNDER_FROM = 'Valentino Caratini <hola@postycommunitymanager.com>';

  // ---------- clase (a) · recordatorio semanal ----------
  console.log('— email.js · recordatorio semanal (a) —');
  await E.weeklyReminderEmail({ email: 'es@x.com' }, base, { current: 3, level: { emoji: '🔥' } }, null);
  t('ES asunto conservado (racha)', last().subject === 'Tu racha sigue viva 🔥');
  t('ES remitente fundador', last().from === FOUNDER_FROM);
  t('ES saludo fundador', /Soy Valentino, el fundador de Posty/.test(last().html));
  t('ES plural de equipo', /Armamos los de esta semana/.test(last().html) && /los publicamos por vos/.test(last().html));
  t('ES línea de fan', /Somos fans de lo que hacés/.test(last().html));
  t('ES sin rayas', !last().html.includes(DASH));
  t('ES link intacto', last().html.includes(base + '/#/app/semana'));
  await E.weeklyReminderEmail({ email: 'en@x.com', lang: 'en' }, base, { current: 3, level: { emoji: '🔥' } }, null);
  t('EN asunto conservado', last().subject === 'Your streak is still alive 🔥');
  t('EN remitente fundador', last().from === FOUNDER_FROM);
  t('EN plural de equipo', /We build this week's posts/.test(last().html) && /we publish them for you/.test(last().html));
  t('EN línea de fan', /We're fans of what you do/.test(last().html));
  t('EN sin rayas', !last().html.includes(DASH));

  // ---------- clase (a) · abandono de prueba ----------
  console.log('— email.js · abandono de prueba (a) —');
  await E.trialAbandonEmail({ email: 'lead@x.com' }, base, 'Café Sol', base + '/prueba?ig=cafe.sol');
  t('ES asunto conservado', last().subject === 'Tu semana sigue guardada 👀');
  t('ES remitente fundador', last().from === FOUNDER_FROM);
  t('ES plural + fan + negocio', /La armamos para <b>Café Sol<\/b>/.test(last().html) && /Somos fans de lo que hacés/.test(last().html));
  t('ES plazo 72 h intacto', /se borra sola en 72 horas/.test(last().html));
  t('ES link intacto', last().html.includes(base + '/prueba?ig=cafe.sol'));
  t('ES sin rayas', !last().html.includes(DASH));
  await E.trialAbandonEmail({ email: 'lead@x.com' }, base, 'Sun Café', base + '/en/prueba?ig=sun.cafe', 'en');
  t('EN asunto conservado', last().subject === 'Your week is still saved 👀');
  t('EN plural + fan + negocio', /We built it for <b>Sun Café<\/b>/.test(last().html) && /We're fans of what you do/.test(last().html));
  t('EN link intacto', last().html.includes(base + '/en/prueba?ig=sun.cafe'));
  t('EN sin rayas', !last().html.includes(DASH));

  // ---------- clase (a) · posteo de mañana listo ----------
  console.log('— email.js · posteo de mañana listo (a) —');
  await E.trialPostReadyEmail({ email: 'lead@x.com' }, base, 'Café Sol', base + '/prueba?ig=cafe.sol');
  t('ES asunto conservado', last().subject === 'Tu posteo de mañana está listo');
  t('ES remitente fundador', last().from === FOUNDER_FROM);
  t('ES plural + fan', /Lo armamos para <b>Café Sol<\/b>/.test(last().html) && /Somos fans de lo que hacés/.test(last().html));
  t('ES sin rayas', !last().html.includes(DASH));
  await E.trialPostReadyEmail({ email: 'lead@x.com' }, base, 'Sun Café', base + '/en/prueba?ig=sun.cafe', 'en');
  t('EN asunto conservado', last().subject === 'Your post for tomorrow is ready');
  t('EN plural + fan', /We built it for <b>Sun Café<\/b>/.test(last().html) && /We're fans of what you do/.test(last().html));
  t('EN sin rayas', !last().html.includes(DASH));

  // ---------- clase (a) · semana vacía ----------
  console.log('— email.js · semana vacía (a) —');
  await E.emptyWeekEmail({ email: 'es@x.com', name: 'Ana' }, base);
  t('ES asunto conservado', last().subject === 'Tus posteos de la semana, listos en 2 minutos ⚡');
  t('ES remitente fundador', last().from === FOUNDER_FROM);
  t('ES plural + fan', /los armamos por vos/.test(last().html) && /Somos fans de lo que hacés/.test(last().html));
  t('ES CTA intacto', last().html.includes(base + '/#/app/ideas') && /Armemos tu semana/.test(last().html));
  t('ES sin rayas', !last().html.includes(DASH));
  await E.emptyWeekEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, base);
  t('EN asunto conservado', last().subject === 'Your posts for the week, ready in 2 minutes ⚡');
  t('EN plural + fan', /we build them for you/.test(last().html) && /We're fans of what you do/.test(last().html));
  t('EN sin rayas', !last().html.includes(DASH));

  // ---------- clase (a) · fin de prueba / primer posteo ----------
  console.log('— email.js · expiración y primer posteo (a) —');
  await E.trialExpiryEmail({ email: 'es@x.com' }, base);
  t('ES asunto conservado', last().subject === 'Mañana se termina tu prueba 🥹');
  t('ES fundador + plural', /soy Valentino, el fundador de Posty/.test(last().html) && /nosotros publicamos/.test(last().html));
  t('ES CTA intacto', last().html.includes(base + '/#/app/ajustes'));
  t('ES sin rayas', !last().html.includes(DASH));
  await E.trialExpiryEmail({ email: 'en@x.com', lang: 'en' }, base);
  t('EN asunto conservado', last().subject === 'Your trial ends tomorrow 🥹');
  t('EN fundador + plural', /I'm Valentino, founder of Posty/.test(last().html) && /you approve, we publish/.test(last().html));
  t('EN sin rayas', !last().html.includes(DASH));
  await E.firstPublishNudgeEmail({ email: 'es@x.com', name: 'Ana', drafts: 2 }, base);
  t('ES con borradores: plural', /Ya dejamos tus posteos armados/.test(last().html) && /nosotros nos ocupamos del resto/.test(last().html));
  t('ES CTA intacto', last().html.includes(base + '/#/app/schedule'));
  t('ES sin rayas', !last().html.includes(DASH));
  await E.firstPublishNudgeEmail({ email: 'es@x.com', name: 'Ana', drafts: 0 }, base);
  t('ES sin borradores: plural', /armamos tu primer posteo al toque/.test(last().html));
  t('ES sin rayas (rama 0)', !last().html.includes(DASH));
  await E.firstPublishNudgeEmail({ email: 'en@x.com', name: 'Ana', drafts: 2, lang: 'en' }, base);
  t('EN con borradores: plural', /We already built your posts/.test(last().html) && /we take care of the rest/.test(last().html));
  t('EN sin rayas', !last().html.includes(DASH));

  // ---------- clase (a) · ritual de fotos ----------
  console.log('— email.js · ritual de fotos (a) —');
  await E.photoRitualEmail({ email: 'es@x.com', name: 'Ana' }, base, 'Sacale una foto a tu plato estrella 📸');
  t('ES asunto en plural (nos)', last().subject === 'Esta semana, ¿nos pasás 3 a 5 fotos de tu negocio? 📸');
  t('ES fundador + plural + fan', /Soy Valentino, el fundador de Posty/.test(last().html) && /Estamos armando los posteos/.test(last().html) && /Somos fans de lo que hacés/.test(last().html));
  t('ES idea intacta + CTA intacto', last().html.includes('Sacale una foto a tu plato estrella') && last().html.includes(base + '/#/app/schedule?fotos=semana'));
  t('ES sin rayas', !last().html.includes(DASH));
  await E.photoRitualEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, base, 'Take a photo of your star dish 📸');
  t('EN asunto en plural (us)', last().subject === 'This week, can you send us 3 to 5 photos of your business? 📸');
  t('EN fundador + plural + fan', /I'm Valentino, founder of Posty/.test(last().html) && /We're building this week's posts/.test(last().html) && /We're fans of what you do/.test(last().html));
  t('EN sin rayas', !last().html.includes(DASH));

  // ---------- clase (a) · cierre de prueba ----------
  console.log('— email.js · cierre de prueba (a) —');
  await E.trialClosedEmail({ email: 'es@x.com', name: 'Ana', biz: 'Café Sol' }, base);
  t('ES asunto conservado', last().subject === 'Tu prueba terminó — tu semana quedó guardada 💙');
  t('ES remitente fundador', last().from === FOUNDER_FROM);
  t('ES fundador + fan + negocio', /Soy Valentino, el fundador de Posty/.test(last().html) && /Somos fans de lo que hacés/.test(last().html) && last().html.includes('Café Sol'));
  t('ES link de plan intacto', last().html.includes(base + '/#/app/ajustes?plan=1'));
  t('ES cuerpo sin rayas', !last().html.includes(DASH));
  await E.trialClosedEmail({ email: 'en@x.com', name: 'Ana', lang: 'en', biz: 'Sun Café' }, base);
  t('EN asunto conservado', last().subject === 'Your trial ended — your week is saved 💙');
  t('EN fundador + fan', /I'm Valentino, founder of Posty/.test(last().html) && /We're fans of what you do/.test(last().html));
  t('EN cuerpo sin rayas', !last().html.includes(DASH));

  // ---------- clase (a) · toque del fundador (borrador, ajuste acotado) ----------
  console.log('— email.js · toque del fundador (a, ajuste acotado) —');
  const weekLink = base + '/#/semana/tok123';
  const tEs = E.founderTouchEmail({ email: 'es@x.com', biz: 'Café Sol' }, base, weekLink);
  t('ES asunto sin raya (re-pin micro-lote rayas-foundertouch)', tEs.subject === 'Soy Valentino, te escribo yo');
  t('ES párrafo de capacidades en plural', /armamos y publicamos tus posteos/.test(tEs.text) && !/Posty es ese miembro del equipo/.test(tEs.text));
  t('ES línea de fan con el negocio', /Somos fans de lo que hacés en Café Sol/.test(tEs.text));
  t('ES fan antes de la oferta', tEs.text.indexOf('Somos fans') > -1 && tEs.text.indexOf('Somos fans') < tEs.text.indexOf('Tu semana ya está armada'));
  t('ES link + firma aprobados intactos', tEs.text.includes(weekLink) && /Valentino Caratini\nFundador de Posty/.test(tEs.text));
  const tEsGen = E.founderTouchEmail({ email: 'es@x.com' }, base, weekLink);
  t('ES fan genérica sin negocio', /Somos fans de lo que hacés: tu producto se merece/.test(tEsGen.text));
  const tEn = E.founderTouchEmail({ email: 'en@x.com', lang: 'en', business: 'Sun Café' }, base, weekLink, 'en');
  t('EN asunto sin raya (re-pin micro-lote rayas-foundertouch)', tEn.subject === "I'm Valentino, writing to you myself");
  t('EN párrafo de capacidades en plural', /build and publish your posts/.test(tEn.text) && !/Posty is that team member/.test(tEn.text));
  t('EN línea de fan con el negocio', /We're fans of what you do at Sun Café/.test(tEn.text));
  t('EN firma aprobada intacta', /Valentino Caratini\nFounder of Posty/.test(tEn.text));
  // (MICRO-LOTE RAYAS-FOUNDERTOUCH) La carta no conserva ninguna raya larga:
  // ni en el cuerpo ni en los asuntos, ES y EN (incluye la fan genérica).
  t('founderTouch sin rayas en cuerpo ni asuntos (ES+EN)', !tEs.subject.includes(DASH) && !tEs.text.includes(DASH) && !tEsGen.subject.includes(DASH) && !tEsGen.text.includes(DASH) && !tEn.subject.includes(DASH) && !tEn.text.includes(DASH));

  // ---------- clase (b) · firma del fundador, cuerpo intacto ----------
  console.log('— email.js · transaccionales (b): solo la firma —');
  await E.draftsNudgeEmail({ email: 'es@x.com', name: 'Ana', count: 5 }, base);
  t('ES borradores: asunto histórico', last().subject === 'Tus posteos de la semana para Instagram ya están listos 👀');
  t('ES borradores: cuerpo intacto', /Ya los armé con tu marca y tu estilo/.test(last().html) && /Programar mis posteos/.test(last().html));
  t('ES borradores: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder de Posty') && !last().html.includes('<b>Posty</b> 🤖'));
  await E.draftsNudgeEmail({ email: 'en@x.com', name: 'Ana', count: 5, lang: 'en' }, base);
  t('EN borradores: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder of Posty') && !last().html.includes('<b>Posty</b> 🤖'));
  await E.publishedEmail({ email: 'es@x.com', name: 'Ana' }, { media_type: 'image' }, base, 'https://instagram.com/p/ABC', true, '');
  t('ES publicado: asunto histórico', last().subject === '✅ Tu posteo ya salió en Instagram');
  t('ES publicado: firma fundador', /Con cariño, <b>Valentino Caratini<\/b>, Founder de Posty/.test(last().html) && !last().html.includes('<b>Posty</b> 🤖'));
  t('ES publicado: permalink intacto', last().html.includes('https://instagram.com/p/ABC'));
  await E.publishedEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, { media_type: 'image' }, base, '', false, '');
  t('EN publicado: firma fundador', /With love, <b>Valentino Caratini<\/b>, Founder of Posty/.test(last().html));
  const rows = [{ caption: 'Promo del finde', media_type: 'image', reach: 100, likes: 3, comments: 1 }];
  await E.weeklyReportEmail({ email: 'es@x.com', name: 'Ana' }, base, rows);
  t('ES reporte: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder de Posty') && !/Tu community manager, <b>Posty<\/b>/.test(last().html));
  await E.weeklyReportEmail({ email: 'en@x.com', name: 'Ana', lang: 'en' }, base, rows);
  t('EN reporte: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder of Posty') && !/Your community manager, <b>Posty<\/b>/.test(last().html));
  await E.magicLinkEmail('es@x.com', base + '/entrar?token=TOK', 'es');
  t('ES magic link: firma fundador + link intacto', /Te lo manda <b>Valentino Caratini<\/b>, Founder de Posty/.test(last().html) && last().html.includes(base + '/entrar?token=TOK'));
  await E.magicLinkEmail('en@x.com', base + '/entrar?token=TOK', 'en');
  t('EN magic link: firma fundador', /Sent to you by <b>Valentino Caratini<\/b>, Founder of Posty/.test(last().html));
  await E.ventyCodeEmail('es@x.com', 'https://venty.example/entrar?code=1', 'es');
  t('Venty intacto (otro producto)', last().html.includes('<b>Venty</b>'));

  // ---------- notify-email.js · firmas y saludos (b) ----------
  console.log('— notify-email.js · avisos (b) —');
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-fundador-'));
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
  await NE.sendApprovalEmail(db, postEs);
  t('ES aprobación: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder de Posty') && !last().html.includes('<b>Posty</b> 🤖'));
  await NE.sendApprovalEmail(db, postEn);
  t('EN aprobación: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder of Posty') && !last().html.includes('<b>Posty</b> 🤖'));
  await NE.sendMissedEmail(db, postEs);
  t('ES no publicado: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder de Posty') && !last().html.includes('<b>Posty</b> 🤖'));
  await NE.sendMissedEmail(db, postEn);
  t('EN no publicado: firma fundador', last().html.includes('<b>Valentino Caratini</b>, Founder of Posty'));
  await NE.sendWeekReady(db, 2, 5);
  t('ES semana lista: asunto histórico', last().subject === 'Tu semana está lista 🎉');
  t('ES semana lista: saludo fundador', /Soy Valentino, fundador de Posty/.test(last().html) && !/Soy Posty/.test(last().html));
  await NE.sendWeekReady(db, 7, 5);
  t('EN semana lista: saludo fundador', /I'm Valentino, founder of Posty/.test(last().html) && !/I'm Posty/.test(last().html));
  // sendWeekPreview carga server.js (necesita node_modules del repo real,
  // que no existe en el scratch): se verifica por la vía directa del
  // constructor v4, y los saludos del preview por pin de fuente.
  const V4 = require('./email-semana-v4');
  const v4es = V4.buildWeekEmailV4({ biz: 'Café Sol', lang: 'es', baseUrl: base, posts: [{ id: 1, caption: 'Promo', tipo: 'foto', scheduled_at: sqlIn(60 * 26) }] });
  t('ES preview v4: pie fundador', v4es.html.includes('Valentino Caratini, Founder de Posty') && !v4es.html.includes('Posty — tu community manager'));
  t('ES preview v4: asunto y tarjetas intactos', v4es.subject === 'Tu semana está lista: 1 posteos' && v4es.html.includes('Promo'));
  const v4en = V4.buildWeekEmailV4({ biz: 'Sun Café', lang: 'en', baseUrl: base, posts: [{ id: 1, caption: 'Launch', tipo: 'foto', scheduled_at: sqlIn(60 * 26) }] });
  t('EN preview v4: pie fundador', v4en.html.includes('Valentino Caratini, Founder of Posty') && !v4en.html.includes('Posty — your community manager'));
  const neSrc = fs.readFileSync(path.join(__dirname, 'notify-email.js'), 'utf8');
  t('preview ES: saludo fundador (pin fuente)', neSrc.includes('Soy Valentino, fundador de Posty') && !neSrc.includes('Soy Posty 🤖'));
  t('preview EN: saludo fundador (pin fuente)', neSrc.includes("I'm Valentino, founder of Posty") && !neSrc.includes("I'm Posty 🤖"));

  // ---------- ideas-email.js · marco del newsletter (a, solo el marco) ----------
  console.log('— ideas-email.js · newsletter de ideas (a, marco) —');
  const IE = require('./ideas-email');
  const edition = {
    subject: '3 ideas para tu negocio esta semana',
    preheader: 'Preheader de la edición',
    intro: 'Intro editorial de la edición, sin tocar.',
    ideas: [{ titular: 'Titular', idea: 'La idea.', imagen: 'Imagen', caption: 'Caption', cuando: 'Lunes 10:00', porque: 'Porque funciona.' }],
  };
  await IE.weeklyIdeasEmail({ email: 'sub@x.com', token: 'TOK123' }, edition);
  t('remitente con nombre del fundador', last().from === 'Valentino Caratini <ideas@postycommunitymanager.com>');
  t('saludo fundador', /Hola, soy Valentino, el fundador de Posty\./.test(last().html));
  t('cierre en plural + fan', /Somos fans de lo que hacés/.test(last().html) && /armamos tu semana/.test(last().html) && /la\s+publicamos y atendemos tus mensajes/.test(last().html));
  t('contenido editorial intacto', last().subject === edition.subject && last().html.includes('Intro editorial de la edición, sin tocar.') && last().html.includes('Titular'));
  t('links duros intactos', last().html.includes(base + '/prueba') && last().html.includes('/api/ideas/unsubscribe?token=TOK123'));
  t('pie con firma del fundador', /Te lo manda Valentino Caratini, Founder de Posty/.test(last().html));

  // ---------- server.js · saludo de recuperar contraseña (b, pin de fuente) ----------
  console.log('— server.js · recuperar contraseña (b, pin de fuente) —');
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  t('saludo ES fundador', srv.includes('¡Hola! Soy Valentino, de Posty. Me pediste cambiar tu contraseña.'));
  t('saludo EN fundador', srv.includes("Hi! I'm Valentino, from Posty. You asked to reset your password."));
  t('sin saludo de marca en el reset', !srv.includes('Soy Posty 🤖 Me pediste') && !srv.includes("I'm Posty 🤖 You asked"));

  stub.close();
  console.log(`\n== test-lote-voz-fundador-emails: ${ok} ok · ${bad} fallas ==`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
