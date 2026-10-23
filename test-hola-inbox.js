#!/usr/bin/env node
// (Frente 4b) LECTOR DE RESPUESTAS A hola@ — clasificador SOLO LECTURA.
// · Clasificación por reglas auditables: interes / consulta / negativa /
//   otro, con señales nombradas (negativa tiene precedencia sobre consulta).
// · Asociación al envío: 'carta' (asunto de la Carta o remitente que está
//   en trial_cache como destinatario de la Carta) / 'toque' (marcadores del
//   fundador) / sin asociar → linked_kind vacío.
// · Ingesta idempotente: releer el mismo mensaje NO duplica filas (dedupe
//   por message_key: id del proveedor o hash estable).
// · HTTP: la bandeja de gestión vive en GET /api/admin/hola-replies
//   (ADMIN_TOKEN) y la ingesta en POST /api/admin/hola-replies/ingest.
// · LÍMITES: el módulo no conoce el envío de email (sin sendEmail, sin API
//   de Resend de envío) y pollInbox sin fuente responde available:false.
// Uso: node test-hola-inbox.js
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
};

(async () => {
  const inbox = require('./hola-inbox');
  const { DatabaseSync } = require('node:sqlite');

  // ── Unit: clasificación ──────────────────────────────────────────────────
  const cases = [
    [{ from: 'a@x.com', subject: 'Re: Tus posteos ya están listos, @cafe', body: 'Me interesa! ¿Cómo empiezo?' }, 'interes'],
    [{ from: 'b@x.com', subject: 'Consulta', body: 'Hola, quería consultar: ¿cuánto sale el plan?' }, 'consulta'],
    [{ from: 'c@x.com', subject: 'Re: Tus posteos', body: 'No me interesa, no gracias. ¿Cuánto salía? Igual no.' }, 'negativa'],
    [{ from: 'd@x.com', subject: 'Baja', body: 'Quiero darme de baja, unsubscribe' }, 'negativa'],
    [{ from: 'e@x.com', subject: 'Gracias', body: 'Gracias por la semana, quedó hermosa. Saludos!' }, 'otro'],
    [{ from: 'f@x.com', subject: 'Precio?', body: '¿Tienen planes para dos cuentas?' }, 'consulta'],
    [{ from: 'g@x.com', subject: 'Quiero', body: 'Quiero probar Posty esta semana' }, 'interes'],
    [{ from: 'h@x.com', subject: '', body: 'ok' }, 'otro'],
  ];
  for (const [msg, want] of cases) {
    const out = inbox.classifyReply(msg);
    ok(`clasifica "${(msg.body || '').slice(0, 34)}…" → ${want}`, out.classification === want, out);
    ok('  con señales auditables o vacío coherente', Array.isArray(out.signals), out);
  }
  const neg = inbox.classifyReply(cases[2][0]);
  ok('negativa gana a consulta (precedencia)', neg.classification === 'negativa' && neg.signals.some((s) => s.startsWith('neg_')), neg);

  // ── Unit: asociación + ingesta idempotente (DB temporal mínima) ─────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-hola-'));
  const db = new DatabaseSync(path.join(tmp, 't.db'));
  db.exec("CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL, email TEXT DEFAULT '', gift_state TEXT DEFAULT '')");
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at, email, gift_state) VALUES (?, ?, ?, ?, ?)')
    .run('cafe.sol', '{}', Date.now(), 'duena@cafe.com', 'sent');

  let link = inbox.determineLink(db, { from: 'otra@x.com', subject: 'Re: Tus posteos ya están listos, @cafe.sol', body: 'gracias' });
  ok('asociación por asunto de la Carta → carta', link.linked_kind === 'carta', link);
  link = inbox.determineLink(db, { from: 'duena@cafe.com', subject: 'Hola', body: 'me interesa' });
  ok('asociación por remitente en trial_cache → carta + ref ig', link.linked_kind === 'carta' && link.linked_ref === 'cafe.sol', link);
  link = inbox.determineLink(db, { from: 'x@x.com', subject: 'Re: tu mensaje', body: 'Valentino, gracias por tu toque del fundador' });
  ok('asociación por marcador del fundador → toque', link.linked_kind === 'toque', link);
  link = inbox.determineLink(db, { from: 'nadie@x.com', subject: 'Factura', body: 'adjunto la factura del mes' });
  ok('sin asociación → linked_kind null', link.linked_kind === null, link);

  const msgs = [
    { id: 'msg-1', from: 'duena@cafe.com', subject: 'Re: Tus posteos ya están listos, @cafe.sol', body: 'Me interesa! ¿Cómo empiezo?', received_at: '2026-10-23T10:00:00Z' },
    { id: 'msg-2', from: 'curioso@x.com', subject: 'Consulta', body: '¿Cuánto sale?', received_at: '2026-10-23T11:00:00Z' },
    { from: 'sinid@x.com', subject: 'No', body: 'No me interesa', received_at: '2026-10-23T12:00:00Z' },
  ];
  let out = inbox.ingestReplies(db, msgs);
  ok('ingesta: 3 insertados', out.inserted === 3 && out.skipped === 0, out);
  out = inbox.ingestReplies(db, msgs);
  ok('re-corrida: 0 duplicados (3 skipped)', out.inserted === 0 && out.skipped === 3, out);
  const rows = inbox.listReplies(db, {});
  ok('bandeja: 3 filas con remitente/asunto/extracto/clasificación', rows.length === 3 &&
    rows.every((r) => r.from_email && r.subject && r.excerpt && r.classification), rows);
  const carta = inbox.listReplies(db, { linked_kind: 'carta' });
  ok('filtro por envío: carta = 1 (msg-1 por asunto+remitente)', carta.length === 1 && carta[0].classification === 'interes', carta);
  const negs = inbox.listReplies(db, { classification: 'negativa' });
  ok('filtro por clasificación: negativa = 1 (sin id, dedupe por hash)', negs.length === 1 && negs[0].from_email === 'sinid@x.com', negs);

  // pollInbox: sin fuente → honesto; con fuente inyectada → ingiere.
  const noSrc = await inbox.pollInbox(db, null);
  ok('pollInbox sin fuente → available:false, sin inventar bandeja', noSrc.available === false && noSrc.inserted === 0, noSrc);
  const withSrc = await inbox.pollInbox(db, { fetchMessages: async () => [{ id: 'msg-9', from: 'nuevo@x.com', subject: 'Hola', body: 'Quiero sumarme' }] });
  ok('pollInbox con fuente inyectada → ingiere y clasifica', withSrc.available === true && withSrc.inserted === 1, withSrc);

  // Límites duros verificables en el código del módulo.
  const srcMod = fs.readFileSync(path.join(__dirname, 'hola-inbox.js'), 'utf8');
  ok('el lector NO envía: sin sendEmail ni endpoint de envío Resend', !/sendEmail|api\.resend\.com\/emails/.test(srcMod));
  ok('el lector NO importa el módulo de envío (email.js)', !/require\(['"]\.\/email['"]\)/.test(srcMod));
  ok('inboundConfigured() = false (acople real = resto declarado)', inbox.inboundConfigured() === false);
  db.close();

  // ── HTTP: bandeja admin + ingesta ────────────────────────────────────────
  const PORT = 3995;
  const BASE = `http://127.0.0.1:${PORT}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-hola-http-'));
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' };
  delete env.META_APP_SECRET; delete env.IG_APP_SECRET; delete env.RESEND_API_KEY;
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    assert(up, 'el servidor no levantó:\n' + log.slice(-1500));

    const noTok = await fetch(BASE + '/api/admin/hola-replies');
    ok('bandeja sin token → 403', noTok.status === 403, noTok.status);

    const ing = await fetch(BASE + '/api/admin/hola-replies/ingest?token=test-admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ id: 'http-1', from: 'lead@x.com', subject: 'Re: Tus posteos ya están listos, @bar', body: 'Me interesa, quiero empezar' }] }),
    });
    const ingBody = await ing.json();
    ok('ingesta HTTP → inserted 1', ing.status === 200 && ingBody.inserted === 1, ingBody);

    const ing2 = await fetch(BASE + '/api/admin/hola-replies/ingest?token=test-admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ id: 'http-1', from: 'lead@x.com', subject: 'Re: Tus posteos ya están listos, @bar', body: 'Me interesa, quiero empezar' }] }),
    });
    const ing2Body = await ing2.json();
    ok('ingesta HTTP repetida → 0 duplicados', ing2.status === 200 && ing2Body.inserted === 0 && ing2Body.skipped === 1, ing2Body);

    const list = await fetch(BASE + '/api/admin/hola-replies?token=test-admin');
    const listBody = await list.json();
    ok('bandeja HTTP: la respuesta clasificada y asociada a la Carta', list.status === 200 && listBody.replies.length === 1 &&
      listBody.replies[0].classification === 'interes' && listBody.replies[0].linked_kind === 'carta', listBody);
    ok('bandeja HTTP: inbound_configured=false (resto declarado visible)', listBody.inbound_configured === false, listBody);
  } finally { child.kill('SIGKILL'); }

  console.log(`\n${failed ? '✗' : '✓'} test-hola-inbox: ${passed} ok, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
