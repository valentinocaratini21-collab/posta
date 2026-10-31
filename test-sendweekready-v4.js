'use strict';
// test-sendweekready-v4.js — Cableado de sendWeekReady → plantilla v4.
// Se corre con: node test-sendweekready-v4.js (sin DB real ni email real:
// fakeDb + stubs de ./email y ./approval vía Module._load).
const Module = require('module');
const origLoad = Module._load;
let sent = null;
Module._load = function (request, parent, isMain) {
  if (request === './email') {
    return {
      sendEmail: async (o) => { sent = o; return { ok: true }; },
      emailConfigured: () => true,
      emailFaceHeader: () => '',
    };
  }
  if (request === './approval') {
    return {
      signAction: () => ({}),
      signWeekAction: () => ({ sig: 'SIG', exp: 123 }),
      absoluteMediaUrl: () => '',
      userHourLabel: () => '',
    };
  }
  return origLoad.apply(this, arguments);
};
const { sendWeekReady } = require('./notify-email');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

function makeDb(rows) {
  return {
    prepare(sql) {
      if (sql.includes('FROM users')) return { get: () => ({ email: 'a@b.com', lang: 'es', name: 'Juan' }) };
      if (sql.includes('FROM settings')) return { get: () => ({ timezone: 'America/Argentina/Buenos_Aires' }) };
      if (sql.includes('FROM profiles')) return { get: () => ({ business_name: 'Gesty' }) };
      if (sql.includes('FROM posts')) return { all: () => rows };
      throw new Error('SQL inesperado: ' + sql);
    },
  };
}

const rows = [2, 3, 4, 5, 6, 7, 8, 9].map((d, i) => ({
  id: 480 + i,
  caption: `Posteo real ${d} de noviembre, texto completo.`,
  tipo: 'novedad',
  scheduled_at: `2026-11-${String(d).padStart(2, '0')} 22:00:00`,
  week_key: '2026-11-02',
}));

(async () => {
  // Caso 1: semana programada → v4 con datos reales.
  sent = null;
  const r1 = await sendWeekReady(makeDb(rows), 81, 8);
  ok(r1 && r1.ok, 'v4: sendWeekReady ok');
  ok(sent && sent.to === 'a@b.com', 'v4: destinatario real');
  ok(sent && sent.subject === 'Tu semana está lista: 8 posteos', 'v4: subject v4');
  ok(sent && sent.html.includes('La semana de Gesty está lista'), 'v4: título con business_name de profiles');
  ok(sent && sent.html.includes('Posteo real 2 de noviembre, texto completo.'), 'v4: pie real en la tarjeta');
  ok(sent && sent.html.includes('/#/app/post/480'), 'v4: deep link por posteo');
  ok(sent && sent.html.includes('/api/week/2026-11-02/publish?uid=81'), 'v4: botón aprobar = publish firmado de la semana');
  ok(sent && sent.html.includes('LUN 2 NOV · 19:00'), 'v4: fecha real por posteo');
  ok(sent && !sent.html.includes('<img src="http'), 'v4: cero imágenes externas');

  // Caso 2: sin posteos programados → aviso viejo (fallback, sin romper).
  sent = null;
  const r2 = await sendWeekReady(makeDb([]), 81, 0);
  ok(r2 && r2.ok, 'fallback: sendWeekReady ok');
  ok(sent && sent.subject === 'Tu semana está lista 🎉', 'fallback: subject viejo');
  ok(sent && sent.html.includes('0 posteos salen solos'), 'fallback: conteo viejo');

  console.log(`test-sendweekready-v4: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
