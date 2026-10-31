'use strict';
/* test-feed-16-17.js — Feed patch16+17 ADAPTADO v496.
   Cubre SOLO lo aprobado (Valentino 31/10: «Afuera, respeto el veto»):
     patch16 ítem 2 (borrador a simple vista) · ítem 3 (día relativo
     del programado) · ítem 6 (modo noche automático)
     patch17 ítem 2 (el que despega se ilumina) · ítem 3 (racha de
     constancia) · ítem 6 (próximo en salir destacado)
   + (A) tirita con cara de Posty (regresión: la cara canónica sigue
   ahí) + NEGATIVOS de veto (ítems 1, 4, 5 del ítem 16: chat fijo en
   escritorio, tirita próxima hoja, perfil 92 px — NO están) +
   NO TOCADO (gestos de aprobar, hfWhenChip Hoy/Mañana, gating
   visitante, hfPeekHTML).
   Las secciones de veto de las suites originales (burbuja patch7,
   next-leaf, 92 px) se DROPEAN, no se adaptan: ese código no existe
   en HEAD v496 (la tile usa hfWhenChip, no pzWhenBubble).
   Repo-ejecutable: node test-feed-16-17.js (desde la raíz del repo).
   Lee ./public/app.js y ./public/styles.css. Sin dependencias. */
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}
function count(src, pat) { return src.split(pat).length - 1; }

/* Extractor por llaves con estado de cadena simple (' " ` con escape).
   Suficiente para estas funciones: no tienen backticks anidados ni
   llaves dentro de cadenas literales. Devuelve null si no encuentra. */
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

/* ---------- §0. Extracción de las funciones nuevas ---------- */
const PURE = ['pzWhenRelDay', 'pzMedian17', 'pzReachNum17', 'pzIsDemo17',
  'pzDespegueIds', 'pzWeekKey17', 'pzRachaSemanas', 'pzNextScheduledId'];
const pureSrc = {};
for (const n of PURE) {
  pureSrc[n] = extractFn(app, 'function ' + n);
  ok('extrae ' + n, !!pureSrc[n]);
  ok(n + ' definida 1 vez', count(app, 'function ' + n + '(') === 1);
  ok(n + ' tiene al menos un uso', count(app, n) >= 2, 'total=' + count(app, n));
}
const hfSrc = extractFn(app, 'function hfWhenChip');
ok('extrae hfWhenChip', !!hfSrc && hfSrc.indexOf('pzWhenRelDay') >= 0);

/* ---------- §1. Ítem 3-16: día relativo (unidades) ---------- */
const relFn = new Function(pureSrc.pzWhenRelDay + '; return pzWhenRelDay;')();
/* Fecha N días adelante en zona America/New_York, a las 15:00 UTC
   (= 10:00/11:00 NY): el día NY es estable aunque la VM esté en otra
   zona y aunque cruce el cambio de hora del 1/11. */
function nyDaysOut(n) {
  const todayNY = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) + 'T15:00:00Z');
  const d = new Date(todayNY);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
ok('rel hoy ES', relFn(nyDaysOut(0), 'America/New_York', false) === 'hoy');
ok('rel hoy EN', relFn(nyDaysOut(0), 'America/New_York', true) === 'today');
ok('rel mañana ES', relFn(nyDaysOut(1), 'America/New_York', false) === 'mañana');
ok('rel mañana EN', relFn(nyDaysOut(1), 'America/New_York', true) === 'tomorrow');
for (const n of [2, 3, 4, 5, 6]) {
  ok('rel +' + n + ' ES', relFn(nyDaysOut(n), 'America/New_York', false) === 'en ' + n + ' días');
  ok('rel +' + n + ' EN', relFn(nyDaysOut(n), 'America/New_York', true) === 'in ' + n + ' days');
}
ok('rel +7 fuera de rango', relFn(nyDaysOut(7), 'America/New_York', false) === '');
ok('rel pasado fuera de rango', relFn(nyDaysOut(-1), 'America/New_York', false) === '');
ok('rel inválido', relFn(null, 'America/New_York', false) === '' && relFn(new Date('xxx'), 'America/New_York', false) === '');

/* Comportamiento de hfWhenChip con stubs ME/pcTz (la función real). */
const MEes = { lang: 'es' }, MEen = { lang: 'en' };
const pcTz = () => 'America/New_York';
function mkChip(ME) {
  return new Function('ME', 'pcTz', pureSrc.pzWhenRelDay + '\n' + hfSrc + '\n; return hfWhenChip;')(ME, pcTz);
}
const chipEs = mkChip(MEes), chipEn = mkChip(MEen);
function schedPost(n) { return { status: 'scheduled', scheduled_at: nyDaysOut(n).toISOString() }; }
ok('chip hoy ES día+fecha+hora', /^Hoy \d{1,2}\/\d{1,2} · \d{1,2}:\d{2}$/.test(chipEs(schedPost(0))), chipEs(schedPost(0)));
ok('chip mañana ES día+fecha+hora', /^Mañana \d{1,2}\/\d{1,2} · \d{1,2}:\d{2}$/.test(chipEs(schedPost(1))), chipEs(schedPost(1)));
ok('chip +3 ES día+fecha+hora (sin relativo)', /^\S+ \d{1,2}\/\d{1,2} · \d{1,2}:\d{2}$/.test(chipEs(schedPost(3))) && chipEs(schedPost(3)).indexOf('en 3 días') < 0, chipEs(schedPost(3)));
ok('chip +6 ES día+fecha+hora (sin relativo)', /^\S+ \d{1,2}\/\d{1,2} · \d{1,2}:\d{2}$/.test(chipEs(schedPost(6))) && chipEs(schedPost(6)).indexOf('en 6 días') < 0, chipEs(schedPost(6)));
ok('chip +3 EN día+fecha+hora (sin relativo)', /^\S+ \d{1,2}\/\d{1,2} · \d{1,2}:\d{2} [AP]M$/.test(chipEn(schedPost(3))) && chipEn(schedPost(3)).indexOf('in 3 days') < 0, chipEn(schedPost(3)));
ok('chip +7 ES día corto (no relativo)', chipEs(schedPost(7)) !== '' && chipEs(schedPost(7)).indexOf('en 7 días') < 0, chipEs(schedPost(7)));
ok('chip borrador sin fecha vacío', chipEs({ status: 'draft' }) === '');
ok('chip borrador con fecha NO usa relativo', chipEs({ status: 'draft', scheduled_at: nyDaysOut(3).toISOString() }).indexOf('en 3 días') < 0);

/* ---------- §2. Ítem 2-16: borrador a simple vista (estático) ---------- */
ok('tile SIN draftChip (LOTE 1: solo borde)', app.indexOf("const draftChip = p.status === 'draft'") < 0);
ok('tile NO usa draftChip', app.indexOf('${draftChip}') < 0);
ok('tile clase hf-tile-draft', app.indexOf("p.status === 'draft' ? ' hf-tile-draft' : ''") >= 0);
ok('tarjeta define draftChipCard', app.indexOf("const draftChipCard = (d.status === 'draft' && !isPending)") >= 0);
ok('tarjeta usa draftChipCard', app.indexOf('${draftChipCard}') >= 0);
ok('tarjeta clase igmock-draft', app.indexOf("d.status === 'draft' && !isPending ? ' igmock-draft' : ''") >= 0);
ok('css .hf-tile.hf-tile-draft', css.indexOf('.hf-tile.hf-tile-draft{outline:2px dashed #2793C8') >= 0);
ok('css .igmock.igmock-draft', css.indexOf('.igmock.igmock-draft{outline:2px dashed #2793C8') >= 0);
ok('css .pz-draft-chip', css.indexOf('.pz-draft-chip{position:absolute;top:6px;left:6px') >= 0);

/* ---------- §3. Ítem 6-16: modo noche automático (estático) ---------- */
ok('css 2 bloques prefers-color-scheme', count(css, '@media (prefers-color-scheme: dark){') === 2, 'total=' + count(css, '@media (prefers-color-scheme: dark){'));
ok('css oscuro fondo navy', css.indexOf('.hf-wrap{background:#0A1E33}') >= 0);
ok('css oscuro acento celeste', css.indexOf('.hf-tab.on{color:#2793C8;border-top-color:#2793C8}') >= 0);
ok('css oscuro sin negro', (function () {
  const a = css.indexOf('/* (6 mejoras del feed · ADAPTADO v496');
  const b = css.indexOf('/* (2-3-6 del feed', a + 1);
  const block = css.slice(a, b < 0 ? undefined : b);
  return block.indexOf('#000') < 0 && !/:\s*black\b/.test(block);
})());

/* ---------- §4. Ítem 2-17: despegue (puro + estático) ---------- */
const despFn = new Function(
  [pureSrc.pzMedian17, pureSrc.pzReachNum17, pureSrc.pzIsDemo17, pureSrc.pzDespegueIds].join('\n') + '; return pzDespegueIds;')();
function pub(id, daysAgo, reach, extra) {
  return Object.assign({ id: id, status: 'published', published_at: nyDaysOut(-daysAgo).toISOString(), reach: reach }, extra || {});
}
(function () {
  const priors = [];
  for (let d = 2; d <= 7; d++) priors.push(pub('p' + d, d, 100));
  const set = despFn(priors.concat([pub('cand', 1, 250)]));
  ok('despegue 2x mediana', set.has('cand'));
  ok('despegue <5 previos nunca', !despFn([pub('a', 2, 100), pub('b', 3, 100), pub('c', 4, 100), pub('d', 5, 100), pub('cand', 1, 1000)]).has('cand'));
  ok('despegue debajo de 2x no', !despFn(priors.concat([pub('cand', 1, 199)])).has('cand'));
  ok('despegue demo excluida', !despFn(priors.concat([pub('demo_x', 1, 9999)])).has('demo_x'));
  ok('despegue no publicado excluido', !despFn(priors.concat([{ id: 's1', status: 'scheduled', scheduled_at: nyDaysOut(1).toISOString(), reach: 9999 }])).has('s1'));
  ok('despegue reach nulo no', !despFn(priors.concat([pub('cand', 1, null)])).has('cand'));
  /* Ventana de 20 previos: 10 recientes reach 10, 10 siguientes reach
     1000, 5 viejos reach 10000. Mediana recientes-20 = (10+1000)/2 =
     505 → 1100 despega; con los 25 la mediana sería 1000 y no. */
  const window = [];
  for (let d = 2; d <= 11; d++) window.push(pub('r' + d, d, 10));
  for (let d = 12; d <= 21; d++) window.push(pub('m' + d, d, 1000));
  for (let d = 22; d <= 26; d++) window.push(pub('o' + d, d, 10000));
  ok('despegue ventana 20 recientes', despFn(window.concat([pub('cand', 1, 1100)])).has('cand'));
})();
ok('tile define despChip/despCls/nextCls', app.indexOf('const despChip = t.pzDespegue') >= 0 && app.indexOf("const despCls = t.pzDespegue ? ' hf-tile-despegue' : ''") >= 0 && app.indexOf("const nextCls = t.pzNext ? ' hf-tile-next' : ''") >= 0);
ok('tile usa despChip', app.indexOf('${despChip}') >= 0);
ok('css .hf-tile.hf-tile-despegue', css.indexOf('.hf-tile.hf-tile-despegue{outline:2px solid rgba(254,193,77,.9)') >= 0);
ok('css .pz-despegue-chip', css.indexOf('.pz-despegue-chip{position:absolute;top:6px;left:6px') >= 0);

/* ---------- §5. Ítem 3-17: racha (puro + perfil + estático) ---------- */
const rachaFn = new Function(
  [pureSrc.pzWeekKey17, pureSrc.pzRachaSemanas].join('\n') + '; return pzRachaSemanas;')();
function pubOn(iso) { return { status: 'published', published_at: iso }; }
(function () {
  const now = '2026-10-31T15:00:00Z'; /* sábado; semana actual = lun 26/10 */
  ok('racha 3 semanas', rachaFn([pubOn('2026-10-28T15:00:00Z'), pubOn('2026-10-21T15:00:00Z'), pubOn('2026-10-14T15:00:00Z')], now, 'America/New_York') === 3);
  ok('racha hueco corta en 1', rachaFn([pubOn('2026-10-28T15:00:00Z'), pubOn('2026-10-14T15:00:00Z')], now, 'America/New_York') === 1);
  ok('racha semana actual vacía arranca anterior', rachaFn([pubOn('2026-10-28T15:00:00Z'), pubOn('2026-10-21T15:00:00Z')], '2026-11-02T15:00:00Z', 'America/New_York') === 2);
  ok('racha futuro ignorado', rachaFn([pubOn('2026-10-28T15:00:00Z'), pubOn('2026-11-05T15:00:00Z')], now, 'America/New_York') === 1);
  ok('racha no publicado ignorado', rachaFn([pubOn('2026-10-28T15:00:00Z'), { status: 'scheduled', published_at: '2026-10-21T15:00:00Z' }], now, 'America/New_York') === 1);
  ok('racha vacía 0', rachaFn([], now, 'America/New_York') === 0);
  ok('racha 1 semana no muestra (N<2 es nada en UI)', rachaFn([pubOn('2026-10-28T15:00:00Z')], now, 'America/New_York') === 1);
})();
ok('perfil rachaHTML solo N>=2', app.indexOf("const rachaHTML = (opts && Number(opts.racha) >= 2)") >= 0);
ok('perfil usa rachaHTML', app.indexOf('${rachaHTML}') >= 0);
ok('inicioView pasa racha', app.indexOf('racha: pzRacha') >= 0);
ok('inicioView calcula racha con historial', app.indexOf('pzRacha = pzRachaSemanas(Array.isArray(allPosts) ? allPosts : [], new Date(), tz)') >= 0);
ok('css .hf-racha', css.indexOf('.hf-racha{font-size:13px;font-weight:700;color:#0A1E33') >= 0);
ok('css oscuro .hf-racha dorado', css.indexOf('.hf-racha{color:#FEC14D}') >= 0);

/* ---------- §6. Ítem 6-17: próximo en salir (puro + estático) ---------- */
const nextFn = new Function(pureSrc.pzNextScheduledId + '; return pzNextScheduledId;')();
(function () {
  const posts = [
    { id: 'past', status: 'scheduled', scheduled_at: nyDaysOut(-1).toISOString() },
    { id: 'far', status: 'scheduled', scheduled_at: nyDaysOut(5).toISOString() },
    { id: 'near', status: 'scheduled', scheduled_at: nyDaysOut(1).toISOString() },
    { id: 'draft', status: 'draft', scheduled_at: nyDaysOut(0).toISOString() },
    { id: 'pub', status: 'published', scheduled_at: nyDaysOut(0).toISOString() },
  ];
  ok('próximo es el futuro más cercano', nextFn(posts, new Date()) === 'near');
  ok('próximo sin futuro null', nextFn([{ id: 'past', status: 'scheduled', scheduled_at: nyDaysOut(-1).toISOString() }], new Date()) === null);
  ok('próximo fecha inválida ignorada', nextFn([{ id: 'bad', status: 'scheduled', scheduled_at: 'xxx' }, { id: 'near', status: 'scheduled', scheduled_at: nyDaysOut(2).toISOString() }], new Date()) === 'near');
})();
ok('css .hf-tile.hf-tile-next dorado exacto', css.indexOf('.hf-tile.hf-tile-next{outline:2px solid #FEC14D') >= 0);

/* ---------- §7. Tirita (A): cara canónica + NEGATIVO próxima-hoja ---------- */
(function () {
  const i = app.indexOf('function pzNivelStripHTML');
  const j = app.indexOf('\nfunction ', i + 1);
  const strip = j < 0 ? app.slice(i) : app.slice(i, j);
  ok('strip existe', i >= 0);
  ok('strip renderiza cara canónica', strip.indexOf('ai-avatar.png') >= 0);
  ok('strip NO renderiza próxima hoja', strip.indexOf('pz-next-leaf') < 0 && strip.indexOf('próxima hoja') < 0);
})();

/* ---------- §8. VETO negativo (ítems 1, 4, 5 del ítem 16) ---------- */
ok('VETO app.js sin pz-next-leaf', app.indexOf('pz-next-leaf') < 0);
ok('VETO app.js sin próxima hoja', app.indexOf('próxima hoja') < 0);
ok('VETO app.js sin Next leaf', app.indexOf('Next leaf') < 0);
ok('VETO css sin pz-next-leaf', css.indexOf('pz-next-leaf') < 0);
ok('VETO css sin min-width:821px (chat fijo escritorio)', css.indexOf('min-width:821px') < 0);
ok('VETO css sin selector desktop del chat fijo (regla original patch16)', css.indexOf('.hf-wrap:not(.hf-visitor).mz-chatbar{display:flex') < 0);
ok('nota: la regla .mz-chatbar fixed MÓVIL es preexistente (servida pre-push), no el veto', css.indexOf('.mz-chatbar{display:flex;align-items:center;gap:9px;position:fixed') >= 0);
ok('VETO css sin avatar 92px (.hf-ava-in)', css.indexOf('.hf-ava-in{width:92px') < 0);
ok('VETO css sin avatar 92px (.fp-ava)', css.indexOf('.fp-ava{width:92px') < 0);
ok('VETO app.js sin avatar 92px', app.indexOf('.hf-ava-in{width:92px') < 0 && app.indexOf('.fp-ava{width:92px') < 0);

/* ---------- §9. NO TOCADO ---------- */
ok('no tocado f3GestureApprove', app.indexOf('f3GestureApprove') >= 0);
ok('no tocado pcApprove', app.indexOf('pcApprove') >= 0);
ok('no tocado pzNivelStripHTML (strip, solo regresión §7)', app.indexOf('function pzNivelStripHTML') >= 0);
ok('no tocado hfWhenChip Hoy/Mañana', !!hfSrc && hfSrc.indexOf("'Today'") >= 0 && hfSrc.indexOf("'Mañana'") >= 0);
ok('no tocado hfPeekHTML', app.indexOf('hfPeekHTML') >= 0);
ok('no tocado gating visitante en grilla', (function () {
  const i = app.indexOf('HF_TILES = tiles;');
  const region = app.slice(i, i + 2000);
  return region.indexOf('if (!HF_VISITOR)') >= 0 && region.indexOf('pzDespegueIds') >= 0 && region.indexOf('pzNextScheduledId') >= 0;
})());

/* ---------- Runner ---------- */
console.log('test-feed-16-17: ' + pass + ' ok, ' + fail + ' fallos');
if (fails.length) { for (const f of fails) console.log('  FALLO: ' + f); }
process.exit(fail ? 1 : 0);
