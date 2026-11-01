'use strict';
/* test-lotefechahora.js — LOTE FECHA/HORA (1/11, reporte de Valentino:
   «el día y la hora de posteo todavía está mal en el celular»).
   Causa: «mañana» se calculaba como now + 86400000 absoluto. En días DST
   eso cae mal: 1/11/2026 (25 h, atraso US) 00:00–01:00 EDT → el +24 h cae
   el mismo día y la chapita decía «Lun 2/11» en vez de «Mañana 2/11»;
   en adelanto (23 h) el espejo es 23:00–24:00 EST del día previo.
   Fix: pcDayKeyShift — día calendario en la zona de la cuenta, por partes
   y/m/d en la zona + avance por fecha UTC (sin DST). La zona que manda
   es la de la cuenta (pcTz / SETTINGS.timezone); fmtDate pasaba a hora
   local del dispositivo y disentía de la chapita.
   Repo-ejecutable: node test-lotefechahora.js (desde la raíz del repo).
   Lee ./public/app.js. Sin dependencias. */
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}
function count(src, pat) { return src.split(pat).length - 1; }

/* Extractor por llaves con estado de cadena (mismo patrón que
   test-feed-16-17.js). */
function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  let depth = 0, j = i, q = null, esc = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = null;
    } else {
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
  }
  if (depth !== 0) return null;
  return src.slice(i, j + 1);
}

const FNS = ['pcDayKeyShift', 'hfWhenChip', 'hfPlanChip', 'hfChipText',
  'fmtDate', 'pcTz', 'pcParseDate', 'chatAgendaKit', 'chatSchedSummary',
  'apvWhenText', 'apvEditPrompt', 'apvHM', 'apvDayKey'];
const src = {};
for (const n of FNS) { src[n] = extractFn(app, 'function ' + n); ok('extrae ' + n, !!src[n]); }

/* Date falsificado: subclase real (Intl funciona) con instante fijo
   reasignable, para probar los instantes DST sin tocar el reloj. */
let FIXED = Date.parse('2026-11-01T04:30:00Z');
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
}
const ME = { lang: 'es' };
const SETTINGS = { timezone: 'America/New_York' };
const slotHour = () => 19;
const scopeSrc = FNS.map((n) => src[n]).join('\n') +
  '\nreturn { pcDayKeyShift, hfWhenChip, hfPlanChip, hfChipText, fmtDate, chatAgendaKit, chatSchedSummary, apvWhenText, apvEditPrompt };';
const F = new Function('Date', 'ME', 'SETTINGS', 'slotHour', scopeSrc)(FakeDate, ME, SETTINGS, slotHour);
const NY = 'America/New_York';
const setFixed = (iso) => { FIXED = Date.parse(iso); };

/* ---------- §1. Helper: día calendario en la zona, sin DST ---------- */
ok('helper 25h: 1/11 00:30 EDT +1 = 2/11',
  F.pcDayKeyShift(new Date('2026-11-01T04:30:00Z'), NY, 1) === '2026-11-02',
  F.pcDayKeyShift(new Date('2026-11-01T04:30:00Z'), NY, 1));
ok('helper 23h: 7/3 23:30 EST +1 = 8/3',
  F.pcDayKeyShift(new Date('2026-03-08T04:30:00Z'), NY, 1) === '2026-03-08',
  F.pcDayKeyShift(new Date('2026-03-08T04:30:00Z'), NY, 1));
ok('helper día de adelanto: 8/3 00:30 EST +1 = 9/3',
  F.pcDayKeyShift(new Date('2026-03-08T05:30:00Z'), NY, 1) === '2026-03-09');
ok('helper n=0 identidad', F.pcDayKeyShift(new Date('2026-11-01T04:30:00Z'), NY, 0) === '2026-11-01');
ok('helper n=6', F.pcDayKeyShift(new Date('2026-11-01T04:30:00Z'), NY, 6) === '2026-11-07');

/* ---------- §2. Chapita de la tile (el bug reportado) ---------- */
const chip = (sched, now) => F.hfWhenChip({ scheduled_at: sched }, new Date(now));
ok('tile 25h: mañana 2/11 en ventana 00:30 EDT',
  chip('2026-11-02T23:00:00Z', '2026-11-01T04:30:00Z') === 'Mañana 2/11 · 18:00',
  chip('2026-11-02T23:00:00Z', '2026-11-01T04:30:00Z'));
ok('tile fuera de ventana: sigue mañana',
  chip('2026-11-02T23:00:00Z', '2026-11-01T17:00:00Z') === 'Mañana 2/11 · 18:00');
ok('tile hoy',
  chip('2026-11-01T23:00:00Z', '2026-11-01T04:30:00Z') === 'Hoy 1/11 · 18:00');
ok('tile borde 23:30: sigue hoy',
  chip('2026-11-02T04:30:00Z', '2026-11-01T04:30:00Z') === 'Hoy 1/11 · 23:30');
ok('tile borde 00:30: ya es mañana',
  chip('2026-11-02T05:30:00Z', '2026-11-01T04:30:00Z') === 'Mañana 2/11 · 0:30',
  chip('2026-11-02T05:30:00Z', '2026-11-01T04:30:00Z'));
ok('tile día de semana',
  chip('2026-11-04T23:00:00Z', '2026-11-01T04:30:00Z') === 'Mié 4/11 · 18:00',
  chip('2026-11-04T23:00:00Z', '2026-11-01T04:30:00Z'));
ok('tile 23h: mañana 8/3 en ventana 23:30 EST',
  chip('2026-03-08T22:00:00Z', '2026-03-08T04:30:00Z') === 'Mañana 8/3 · 18:00',
  chip('2026-03-08T22:00:00Z', '2026-03-08T04:30:00Z'));
ok('tile sin scheduled_at: sin chapita (regla Lote 1)',
  F.hfWhenChip({ status: 'draft' }, new Date('2026-11-01T04:30:00Z')) === '');
ME.lang = 'en';
ok('tile EN: mañana',
  chip('2026-11-02T23:00:00Z', '2026-11-01T04:30:00Z') === 'Tomorrow 11/2 · 6:00 PM',
  chip('2026-11-02T23:00:00Z', '2026-11-01T04:30:00Z'));
ME.lang = 'es';

/* ---------- §3. Detalle y tile coinciden ---------- */
ok('detalle mismo día y hora que la tile (2/11 18:00)',
  F.hfChipText('2026-11-02T23:00:00Z') === 'lun 2 · 18:00', F.hfChipText('2026-11-02T23:00:00Z'));
ok('detalle hoy (1/11 18:00)',
  F.hfChipText('2026-11-01T23:00:00Z') === 'dom 1 · 18:00', F.hfChipText('2026-11-01T23:00:00Z'));

/* ---------- §4. Chapita del plan (borradores sin scheduled_at) ---------- */
setFixed('2026-11-01T04:30:00Z');
ok('plan mañana en ventana 25h',
  F.hfPlanChip('2026-11-02') === 'Mañana 2/11 · 19:00', F.hfPlanChip('2026-11-02'));
ok('plan hoy', F.hfPlanChip('2026-11-01') === 'Hoy 1/11 · 19:00', F.hfPlanChip('2026-11-01'));
ok('plan inválido: sin chapita', F.hfPlanChip('nope') === '');

/* ---------- §5. Aprobación: «Sale mañana» ---------- */
ok('apv mañana en ventana 25h',
  F.apvWhenText(new Date('2026-11-02T23:00:00Z'), NY) === 'Sale mañana 18:00',
  F.apvWhenText(new Date('2026-11-02T23:00:00Z'), NY));
ok('apv prompt mañana',
  F.apvEditPrompt(new Date('2026-11-02T23:00:00Z'), NY) === 'Quiero editar el posteo que sale mañana a las 18:00',
  F.apvEditPrompt(new Date('2026-11-02T23:00:00Z'), NY));

/* ---------- §6. Chat: saludo + etiquetas de día ---------- */
setFixed('2026-11-01T23:00:00Z'); // 18:00 EST 1/11: el saludo de noche sí muestra mañana
const K = F.chatAgendaKit();
ok('chat saludo mañana',
  F.chatSchedSummary([{ scheduled_at: '2026-11-02T23:00:00Z', source_topic: 'Promo', caption: '' }]) === 'Mañana sale Promo a las 06:00 p. m. 📅',
  F.chatSchedSummary([{ scheduled_at: '2026-11-02T23:00:00Z', source_topic: 'Promo', caption: '' }]));
ok('chat dayLabel mañana con clave del helper',
  K.dayLabel(new Date('2026-11-02T23:00:00Z'), '2026-11-01', F.pcDayKeyShift(new Date('2026-11-01T23:00:00Z'), NY, 1)) === 'Mañana');

/* ---------- §7. fmtDate: zona de la cuenta, no del dispositivo ---------- */
const f1 = F.fmtDate('2026-11-02 23:00:00'); // UTC sin zona → 18:00 NY = 06:00 p. m. es-AR
ok('fmtDate UTC → hora de la cuenta (06:00 p. m., no 11:00 p. m.)',
  f1.includes('06:00 p. m.') && !f1.includes('11:00 p. m.'), f1);
ok('fmtDate input 16 (local) no se corre',
  F.fmtDate('2026-11-02T18:00').includes('06:00 p. m.'), F.fmtDate('2026-11-02T18:00'));

/* ---------- §8. Estático: el patrón viejo ya no está en estos sitios ---------- */
ok('sin +86400000 en hfWhenChip/hfPlanChip',
  !src.hfWhenChip.includes('86400000') && !src.hfPlanChip.includes('86400000'));
ok('sin +864e5 en chat/apv mañana',
  !src.chatSchedSummary.includes('864e5') && !src.apvWhenText.includes('864e5') && !src.apvEditPrompt.includes('864e5'));
const showWeek = extractFn(app, 'async function showWeekInChat');
ok('showWeekInChat usa el helper', !!showWeek && showWeek.includes('pcDayKeyShift(new Date(), K.tz, 1)'));
ok('M78: pcDayKeyShift definido 1 vez', count(app, 'function pcDayKeyShift') === 1);
ok('M78: 6 sitios llaman al helper y resuelven',
  count(app, 'pcDayKeyShift(') === 7, // 1 definición + 6 llamadas
  'llamadas: ' + (count(app, 'pcDayKeyShift(') - 1));

console.log(`\ntest-lotefechahora: ${pass} ok, ${fail} fallos`);
if (fails.length) { for (const f of fails) console.log('  FAIL: ' + f); process.exit(1); }
