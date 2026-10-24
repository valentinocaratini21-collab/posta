// test-lang-email-access.js — v369 paridad de idioma en emails de ACCESO.
// Verifica con un Resend falso local (RESEND_API_URL) que:
//  1. magicLinkEmail(..., 'en') sale con asunto y cuerpo en inglés (sin pie ES).
//  2. magicLinkEmail(...) sin lang conserva el ES histórico exacto.
//  3. El shell con lang='en' traduce el pie; sin lang queda el ES de siempre.
const http = require('http');

let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) { ok++; console.log('  ✓', name); } else { bad++; console.log('  ✗', name); } };

async function main() {
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
  process.env.RESEND_API_KEY = 're_test_stub';
  process.env.RESEND_API_URL = `http://127.0.0.1:${stub.address().port}/emails`;
  process.env.EMAIL_FROM = 'Posty <hola@postycommunitymanager.com>';

  const { magicLinkEmail, emailShell } = require('./email');

  const rEn = await magicLinkEmail('en-user@example.com', 'https://postycommunitymanager.com/api/auth/magic?token=x', 'en');
  t('EN: envío aceptado por el proveedor', rEn && rEn.ok === true);
  const en = captured[captured.length - 1];
  t('EN: asunto en inglés', en.subject === 'Sign in to Posty — no password needed ✨');
  t('EN: cuerpo en inglés', /Tap it and you're in/.test(en.html) && /Sign in to Posty ✨/.test(en.html));
  t('EN: sin pie en español', !/Te avisamos/.test(en.html) && /We're writing because you have content pending/.test(en.html));

  const rEs = await magicLinkEmail('es-user@example.com', 'https://postycommunitymanager.com/api/auth/magic?token=x');
  t('ES: envío aceptado por el proveedor', rEs && rEs.ok === true);
  const es = captured[captured.length - 1];
  t('ES: asunto histórico intacto', es.subject === 'Entrá a Posty sin contraseña ✨');
  t('ES: cuerpo y pie históricos', /Tocalo y entrás directo/.test(es.html) && /Te avisamos porque tenés contenido pendiente/.test(es.html));

  t('shell default = pie ES', /Te avisamos/.test(emailShell('<p>x</p>')));
  t('shell en = pie EN', /We're writing because/.test(emailShell('<p>x</p>', 'en')));

  stub.close();
  console.log(`\n== test-lang-email-access: ${ok} ok · ${bad} fallas ==`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
