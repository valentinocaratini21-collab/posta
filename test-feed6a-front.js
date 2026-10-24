'use strict';
/* test-feed6a-front.js — Tanda feed 6A (front, extracción vm del bloque
 * HOME_FEED, patrón de test-frente5a/5b):
 *  · Ítem 1: hfWhenChip formatea Hoy/Mañana/día corto en la zona de la
 *    cuenta (now y tz fijados), la píldora NUEVO ya no existe y la
 *    chapita es ÚNICA (draft y scheduled con fecha; sin fecha, nada;
 *    publicados, nada).
 *  · Ítem 2: el botón 💬 está en la tile propia con data-hf-chat, y NO
 *    está en modo visitante ni en tiles leídas de IG.
 *  · Ítem 3 (UI): el contador se pinta en el detalle y en la barra de
 *    anclaje del chat, con sus gemelos EN; a 0, aviso + caminos gratis.
 * Uso: node test-feed6a-front.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const DB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');

const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
ok(a > 0 && b > a, 'bloque HOME_FEED delimitado');
const TZ = 'America/Argentina/Buenos_Aires';
const mkSandbox = (lang) => {
  const sb = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (p) => p,
    pcTz: () => TZ,
    pcParseDate: (s0) => { const s = String(s0 || ''); if (!s) return null; let x = s.replace(' ', 'T'); if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
    ME: lang ? { lang } : undefined,
  };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b), sb);
  return sb;
};
const es = mkSandbox(null);
const en = mkSandbox('en');
ok(typeof es.hfWhenChip === 'function' && typeof es.hfAnchorBarHTML === 'function' && typeof es.hfRedoLineHTML === 'function', 'hfWhenChip/hfAnchorBarHTML/hfRedoLineHTML cargan en el bloque puro');

// — Ítem 1: hfWhenChip con now fijado (sábado 2026-10-24 12:00 en BA) —
const NOW = new Date('2026-10-24T15:00:00.000Z');
const P = (extra) => Object.assign({ id: 1, status: 'scheduled', media_type: 'image', image_path: '/media/p1.jpg', caption: 'c' }, extra || {});
ok(es.hfWhenChip(P({ scheduled_at: '2026-10-24T21:30:00.000Z' }), NOW) === 'Hoy · 18:30', `ES hoy: «${es.hfWhenChip(P({ scheduled_at: '2026-10-24T21:30:00.000Z' }), NOW)}»`);
ok(en.hfWhenChip(P({ scheduled_at: '2026-10-24T21:30:00.000Z' }), NOW) === 'Today · 6:30 PM', `EN today: «${en.hfWhenChip(P({ scheduled_at: '2026-10-24T21:30:00.000Z' }), NOW)}»`);
ok(es.hfWhenChip(P({ scheduled_at: '2026-10-25T12:00:00.000Z' }), NOW) === 'Mañana · 9:00', `ES mañana: «${es.hfWhenChip(P({ scheduled_at: '2026-10-25T12:00:00.000Z' }), NOW)}»`);
ok(en.hfWhenChip(P({ scheduled_at: '2026-10-25T12:00:00.000Z' }), NOW) === 'Tomorrow · 9:00 AM', `EN tomorrow: «${en.hfWhenChip(P({ scheduled_at: '2026-10-25T12:00:00.000Z' }), NOW)}»`);
ok(es.hfWhenChip(P({ scheduled_at: '2026-10-27T21:30:00.000Z' }), NOW) === 'Mar · 18:30', `ES día corto: «${es.hfWhenChip(P({ scheduled_at: '2026-10-27T21:30:00.000Z' }), NOW)}»`);
ok(en.hfWhenChip(P({ scheduled_at: '2026-10-27T21:30:00.000Z' }), NOW) === 'Tue · 6:30 PM', `EN weekday: «${en.hfWhenChip(P({ scheduled_at: '2026-10-27T21:30:00.000Z' }), NOW)}»`);
ok(es.hfWhenChip(P({ scheduled_at: '' }), NOW) === '' && es.hfWhenChip(P({ scheduled_at: null }), NOW) === '' && es.hfWhenChip(P({ scheduled_at: 'basura' }), NOW) === '', 'sin fecha real o inválida: sin chapita');

// — Ítem 1: la tile (con el now real del sistema, fechas relativas a hoy en BA) —
const todayBA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const todayIso = todayBA + 'T21:30:00.000Z'; // 18:30 BA de hoy
const tileToday = es.homeTileHTML({ kind: 'post', post: P({ id: 21, status: 'scheduled', scheduled_at: todayIso }), day: todayBA, isNew: false }, 0);
ok(tileToday.includes('hf-chip') && tileToday.includes('🕐 Hoy · 18:30'), 'tile de hoy: chapita «Hoy · 18:30»');
ok(!tileToday.includes('NUEVO') && !tileToday.includes('hf-new'), 'la píldora NUEVO ya no existe en la tile');
const tileDraftFecha = es.homeTileHTML({ kind: 'post', post: P({ id: 22, status: 'draft', scheduled_at: todayIso }), day: todayBA, isNew: true }, 1);
ok(tileDraftFecha.includes('🕐 Hoy · 18:30'), 'borrador CON fecha: también lleva su chapita');
ok(!tileDraftFecha.includes('NUEVO'), 'borrador: sin NUEVO aunque venga marcado isNew');
const tileDraftSin = es.homeTileHTML({ kind: 'post', post: P({ id: 23, status: 'draft', scheduled_at: null }), day: todayBA, isNew: true }, 2);
ok(!tileDraftSin.includes('hf-chip'), 'borrador SIN fecha: sin chapita (declarado)');
const tilePub = es.homeTileHTML({ kind: 'post', post: P({ id: 24, status: 'published', published_at: '2026-10-20T15:00:00.000Z', scheduled_at: todayIso }), day: null, isNew: false }, 0);
ok(!tilePub.includes('hf-chip'), 'publicado: sin chapita, como siempre');

// — Ítem 2: botón 💬 —
ok(tileToday.includes('data-hf-chat="21"') && tileToday.includes('hf-tile-chat'), 'tile propia: botón 💬 con data-hf-chat="<id>"');
const tileVisitor = es.homeTileHTML({ kind: 'post', post: P({ id: 25, status: 'scheduled', scheduled_at: todayIso }), day: todayBA, isNew: false, visitor: true }, 0);
ok(!tileVisitor.includes('data-hf-chat'), 'modo visitante: sin botón 💬');
const tileIg = es.homeTileHTML({ kind: 'ig', img: '/r/1.jpg', type: 'image', taken_at: 1700000000, isNew: false }, 0);
ok(!tileIg.includes('data-hf-chat'), 'tile leída de IG: sin botón 💬');
ok(APP.includes('function hfChatBtnBind(') && APP.includes("closest('[data-hf-chat]')"), 'handler propio del 💬 (hfChatBtnBind) con stopPropagation');
ok(APP.includes('id="chatAnchor"') && APP.includes('anchor_post_id'), 'el chat lleva el monte de anclaje y manda anchor_post_id al servidor');
ok(CSS.includes('.hf-tile-chat{') && CSS.includes('right:6px;bottom:6px'), 'CSS: .hf-tile-chat circular abajo a la derecha');
ok(CSS.includes('.hf-anchor{') && CSS.includes('.hf-chipq{'), 'CSS: barra de anclaje y chips rápidos');

// — Ítem 2/3: barra de anclaje + contador —
const anchorPost = { id: 31, image_path: '/media/a31.jpg', caption: 'x', status: 'draft', media_type: 'image', redo_left: 2 };
const barEs = es.hfAnchorBarHTML(anchorPost, false);
ok(barEs.includes('Estás hablando de este posteo') && barEs.includes('data-hf-anchor-x'), 'ancla ES: texto + ✕ para quitarla');
ok(barEs.includes('Cambiar la foto') && barEs.includes('Cambiar el texto') && barEs.includes('Cambiar el día y hora') && barEs.includes('Rehacer'), 'ancla ES: los 4 chips rápidos');
ok(barEs.includes('Te quedan 2 de 3 rehaces'), 'ancla: el contador se pinta (2 de 3)');
const barEn = en.hfAnchorBarHTML(anchorPost, true);
ok(barEn.includes("You're talking about this post") && barEn.includes('Change the photo') && barEn.includes('Change the text') && barEn.includes('Change the day/time') && barEn.includes('Redo'), 'ancla EN: texto y chips gemelos');
ok(barEn.includes('You have 2 of 3 redos left'), 'ancla EN: contador gemelo');
const barZero = es.hfAnchorBarHTML(Object.assign({}, anchorPost, { redo_left: 0 }), false);
ok(barZero.includes('Ya usaste los 3 rehaces de este posteo') && /data-hf-chipq="redo" disabled/.test(barZero), 'ancla a 0: aviso + chip Rehacer deshabilitado');

// — Ítem 3: contador en el detalle —
const det = (sb, post, enFlag) => sb.hfDetailHTML(post, { en: enFlag, user: 'negocio', pic: '', name: 'Negocio', propIso: null, visitor: false });
const d2 = det(es, P({ id: 41, status: 'draft', redo_left: 2, scheduled_at: todayIso }), false);
ok(d2.includes('Te quedan 2 de 3 rehaces') && d2.includes('data-hfd-act="redo"'), 'detalle ES: contador (2) + botón Rehacer');
const d2en = det(en, P({ id: 41, status: 'draft', redo_left: 2, scheduled_at: todayIso }), true);
ok(d2en.includes('You have 2 of 3 redos left'), 'detalle EN: contador gemelo');
const d0 = det(es, P({ id: 42, status: 'scheduled', redo_left: 0, scheduled_at: todayIso }), false);
ok(d0.includes('Ya usaste los 3 rehaces de este posteo'), 'detalle a 0: aviso amable');
ok(d0.includes('data-hfd-act="myphoto"') && d0.includes('Mi foto') && d0.includes('data-hfd-act="retext"') && d0.includes('Retocar el texto') && d0.includes('data-hfd-act="keep"') && d0.includes('Dejarlo así'), 'detalle a 0: caminos Mi foto · Retocar el texto · Dejarlo así');
ok(!d0.includes('data-hfd-act="redo"'), 'detalle a 0: sin botón Rehacer activo');
const dPub = det(es, P({ id: 43, status: 'published', redo_left: 2, published_at: '2026-10-20T15:00:00.000Z' }), false);
ok(!dPub.includes('rehaces') && !dPub.includes('data-hfd-act="redo"'), 'detalle publicado: el contador no se pinta');
const dReel = det(es, P({ id: 44, status: 'draft', media_type: 'video', image_path: '/media/r.mp4', redo_left: 2 }), false);
ok(!dReel.includes('rehaces'), 'detalle reel: fuera del contador');

// — Cableado servidor (estático) —
ok(DB.includes('ADD COLUMN redo_left INTEGER NOT NULL DEFAULT 3'), 'db.js: migración redo_left DEFAULT 3');
ok(SRV.includes('UPDATE posts SET redo_left = redo_left - 1 WHERE id = ? AND user_id = ? AND redo_left > 0'), 'server: descuento atómico con changes verificado por consumeRedo');
ok(SRV.includes("error: 'redo_exhausted'"), 'server: error claro redo_exhausted');
ok(SRV.includes('anchor_post_id'), 'server: el chat recibe el anclaje y reordena el contexto');

console.log(`\ntest-feed6a-front: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
