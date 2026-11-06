// test-lote-venty-web1-email.js — VENTY slice 1-web: ventyCodeEmail (email.js)
// con fetch global stubbeado. Uso: RESEND_API_KEY=test-key node test-lote-venty-web1-email.js
const email = require('./email');
let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

(async () => {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ id: 'msg_1' }), text: async () => '{}' };
  };
  const link = 'https://ventysalesmanager.com/app/?code=abcdef1234567890';
  const r = await email.ventyCodeEmail('cliente@test.com', link, 'es');
  ok(r && r.ok, 'ventyCodeEmail ES: envía ok');
  ok(calls.length === 1, '1 llamada a Resend');
  const body = JSON.parse(calls[0].opts.body);
  ok(calls[0].url === 'https://api.resend.com/emails', 'URL api.resend.com/emails');
  ok(Array.isArray(body.to) && body.to[0] === 'cliente@test.com', 'destinatario correcto (array Resend)');
  ok(body.subject === 'Entrá a tu Venty ✨', 'asunto ES');
  ok(String(body.html).includes(link), 'html incluye el link con el código');
  ok(String(body.html).includes('5 minutos'), 'html menciona los 5 minutos');
  ok(String(body.html).includes('#4CAF50'), 'html usa el verde de Venty');
  ok(typeof body.from === 'string' && body.from.includes('@'), 'remitente canónico de Posta');

  calls.length = 0;
  await email.ventyCodeEmail('client@test.com', link, 'en');
  const bodyEn = JSON.parse(calls[0].opts.body);
  ok(bodyEn.subject === 'Sign in to Venty — no password needed ✨', 'asunto EN');
  ok(String(bodyEn.html).includes('5 minutes'), 'html EN menciona los 5 minutos');

  console.log(`\n— venty slice 1-web (email): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})();
