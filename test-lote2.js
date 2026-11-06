/* LOTE 2 — checks: doble toque/corazón + MORA-7 + semana dos idiomas.
   Uso: node test-lote2.js (desde la raíz del árbol). Sin dependencias. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

const app = read('public/app.js');
const srv = read('server.js');
const idx = read('public/index.html');
const enidx = read('public/en/index.html');
const ana = read('public/chunk-analisis.js');
const aju = read('public/chunk-ajustes.js');
const wb = read('week-bilingual.js');

console.log('== ÍTEM 1: doble toque/corazón (SACAR-CORAZÓN 6/11) ==');
check('hfTileApprove ELIMINADA (0 veces)', count(app, 'async function hfTileApprove(') === 0 && count(app, 'hfTileApprove') === 0);
check('hfDblReset definida 1 vez', count(app, 'function hfDblReset(') === 1);
check('ventana 300ms en handler', app.includes('dblNow - HF_DBL.t < 300'));
check('doble toque: ya NO aprueba (sin hfTileApprove, sin burst en la tile)', !app.includes('hfTileApprove(tile, t.post)') && app.includes('abre el detalle como un'));
check('timer navega al detalle', app.includes('hfDetailOpen(pend.post, pend.tile)'));
check('guardia hash sin cambio', app.includes('location.hash === pend.hash'));
check('OPCION A 2/11: corazon apv-like eliminado (Aprobar ya es el Aceptar primario, sin duplicado)', app.includes('id="apvAccept"') && count(app, 'class="apv-sec-btn apv-like"') === 0);
check('binding corazón por clase ELIMINADO', !app.includes("querySelectorAll('.apv-like')"));
check('icono corazón pzIc heart (queda en carrusel Aprobar escena + likes)', app.includes("pzIc('heart', 20)"));
check('M78: hfTileApprove 0, hfDblReset 1 vez', count(app, 'async function hfTileApprove(') === 0 && count(app, 'function hfDblReset(') === 1);
console.log('== Lote 1 intacto ==');
check('tab jardin', app.includes("tabBtn('jardin', '#/app/jardin-posty'"));
check('sin tab semana', !app.includes("tabBtn('semana'"));
check('flecha atrás', app.includes('function pzGoBack('));
check('menú posteo', app.includes('function apvMoreHTML('));
check('próximo análisis', ana.includes('anaProximoAnalisisHTML'));
check('ajustes sin Meta App ID', !aju.includes('Meta App ID'));
console.log('== Velocidad intacta ==');
check('esqueleto', app.includes('pzPaintSkeleton'));
check('caché GET', app.includes('pzCacheGet'));
check('precarga idle', app.includes('pzPrefetchKick'));

console.log('== ÍTEM 2: MORA-7 ==');
const MORA7 = " Screens, tablets and phones in the scene show a BLANK screen or abstract color blocks — never a lone symbol, letter or glyph (#, @, stray letters) as screen content.";
check('frase MORA-7 en server.js 1 vez', count(srv, MORA7.trim()) === 1);
check('comentario MORA-7 1 vez', count(srv, 'MORA-7, 2026-10-25, id real 547') === 1);
check('frase dentro del estándar v231', srv.indexOf('const PROMPT_SCENE_STANDARD') < srv.indexOf(MORA7.trim()) && srv.indexOf(MORA7.trim()) < srv.indexOf('function rubroAvoidFor'));
check('assembleImagePrompt usa el estándar', srv.includes('parts.push(PROMPT_SCENE_STANDARD + rubroAvoidFor(category))'));

console.log('== ÍTEM 3: dos idiomas ==');
check('traductor definido 1 vez', count(srv, 'function bilingualTranslateFnFor(') === 1);
check('traductor usa prompt fiel', srv.includes('weekBilingual.FAITHFUL_TRANSLATION_PROMPT'));
check('hook en generateWeekDrafts', srv.includes('bilingualizeWeek(db, uid, bRows, bFn)'));
check('hook tras piloto automático', srv.indexOf('piloto automático:') < srv.indexOf('bilingualizeWeek(db, uid, bRows, bFn)'));
check('hook solo piezas sin EN previo', srv.includes('bilingual_status IS NULL'));
check('módulo: sin opt-in no escribe', wb.includes("if (!isBilingualWeekEnabled(db, uid)) return { ok: true, skipped: 'disabled'"));
check('BUILD v522', srv.includes("BUILD_ID = '20261101-v533'"));
check('index raíz app.js?v=355; en/index estática sin app.js', idx.includes('app.js?v=355') && !enidx.includes('app.js?v='));
check('styles ?v= 20261064', idx.includes('styles.css?v=20261074') && enidx.includes('styles.css?v=20261074'));
console.log('== Censo (sin cambios que explicar) ==');
const c = (s, m) => (s.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
check('server.js 3/16/3/16 (lote 7: WhatsApp Sunday-letter reusa /aprobar/:token, sin ruta nueva)', c(srv, 'catsMatch') === 3 && c(srv, 'week-redo') === 16 && c(srv, 'first_week') === 3 && c(srv, '/aprobar') === 16,
  `cats=${c(srv, 'catsMatch')} redo=${c(srv, 'week-redo')} fw=${c(srv, 'first_week')} ap=${c(srv, '/aprobar')}`);
check('app.js 0/0/4/1', c(app, 'catsMatch') === 0 && c(app, 'week-redo') === 0 && c(app, 'first_week') === 4 && c(app, '/aprobar') === 1);
check('autofetch 0', c(srv, 'autofetch') === 0 && c(app, 'autofetch') === 0);

async function main() {
  console.log('== FUNCIONALES (vm) ==');
  // --- hfTileApprove: ELIMINADA (SACAR-CORAZÓN 6/11) ---
  // La aprobación desde el feed ya no existe: ni doble toque en la tile
  // ni botón corazón. La única aprobación del posteo del día es [Sale así]
  // en el ritual. Acá solo se verifica la ausencia + que el defer de 300ms
  // y la navegación al detalle siguen (hfDetailBind extraído y corrido).
  check('hfTileApprove ausente del bundle', !app.includes('hfTileApprove'));
  try {
    const src = app;
    const i = src.indexOf('function hfDetailBind(root)');
    if (i < 0) throw new Error('no fn hfDetailBind');
    let j = src.indexOf('{', i), d = 0, k = j;
    for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
    const fnSrc = src.slice(i, k + 1);
    check('hfDetailBind: sin hfTileApprove dentro', !fnSrc.includes('hfTileApprove'));
    check('hfDetailBind: defer 300ms intacto', fnSrc.includes(', 300)'));
    check('hfDetailBind: navega al detalle por hash', fnSrc.includes("location.hash = '#/app/post/'"));
    check('hfDetailBind: guard del botón 💬 intacto', fnSrc.includes("[data-hf-chat]"));
    check('hfDetailBind: sin guard de corazón', !fnSrc.includes('[data-hf-like]'));
  } catch (e) { check('hfDetailBind vm', false, String((e && e.stack) || e).slice(0, 300)); }

  // --- bilingualizeWeek con db falsa ---
  try {
    const wbl = require('./week-bilingual');
    function fakeDb(enabled) {
      const writes = [];
      return { writes, prepare: (sql) => ({
        get: () => ({ bilingual_week: enabled ? 1 : 0 }),
        run: (...args) => { writes.push({ sql, args }); return {}; },
        all: () => [],
      }) };
    }
    const rows = [{ id: 11, caption: 'Promo 2x1 hoy en tu peluquería', headline: 'Promo 2x1', idea: 'promo', text_band: '', cta_button_drawn: false }];
    // 1. opt-in + traductor fiel -> EN escrito, ready
    let db1 = fakeDb(true);
    let r1 = await wbl.bilingualizeWeek(db1, 1, rows, async () => ({ caption: '2x1 promo today at your barbershop', headline: '2x1 promo' }));
    const enWrite = db1.writes.find((w) => w.sql.includes('caption_en'));
    check('bilingüe fiel: EN escrito ready', r1.done === 1 && !!enWrite && enWrite.args[2] === 'ready', JSON.stringify(r1) + ' ' + JSON.stringify(db1.writes));
    // 2. opt-in + traductor que agrega un hecho -> bloqueado, sin EN
    let db2 = fakeDb(true);
    let r2 = await wbl.bilingualizeWeek(db2, 1, rows, async () => ({ caption: '2x1 promo today only $99 at your barbershop', headline: '2x1 promo' }));
    check('bilingüe con hecho nuevo: bloqueado sin EN', r2.blocked === 1 && !db2.writes.some((w) => w.sql.includes('caption_en')), JSON.stringify(r2));
    // 3. opt-in apagado -> traductor nunca llamado, nada escrito
    let db3 = fakeDb(false); let called = 0;
    let r3 = await wbl.bilingualizeWeek(db3, 1, rows, async () => { called++; return { caption: 'x', headline: 'y' }; });
    check('opt-in apagado: sin llamadas ni escrituras', r3.skipped === 'disabled' && called === 0 && db3.writes.length === 0, JSON.stringify(r3));
  } catch (e) { check('bilingualizeWeek vm', false, String((e && e.stack) || e).slice(0, 300)); }

  console.log(`\nLOTE2: ${ok} OK, ${fail} FAIL${fails.length ? ' :: ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
