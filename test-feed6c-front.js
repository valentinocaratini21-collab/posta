'use strict';
/* test-feed6c-front.js — Tanda feed 6C · piezas puras de los ítems
 * 6 (portada de reel), 9 (plan de arrastre) y 10 (lista de comentarios)
 * sobre el bloque HOME_FEED real extraído de public/app.js:
 *  · hfCoverState/hfCoverGeom/hfCoverOriginAt y la tile con portada
 *    (imagen + encuadre + glyph, sin video pelado).
 *  · hfDetailHTML: fila de portada en reels no publicados (y su
 *    «Volver al video» solo con portada del dueño) + contenedor lazy
 *    de comentarios solo en publicados.
 *  · hfDragEligible/hfDragEffectiveIso/hfDragPlan/hfDragRestoreBody.
 *  · hfCommentsListHTML (autor en negrita + texto tal cual + relativo).
 *  · el espejo vivo detecta cambios de portada (hfLiveSnapshot/Diff).
 * Uso: node test-feed6c-front.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
ok(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');

const sb = {
  console, Date, Math, JSON,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pcTz: () => 'America/Argentina/Buenos_Aires',
  pcParseDate: (s0) => { const s = String(s0 || ''); if (!s) return null; let x = s.replace(' ', 'T'); if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
  ME: undefined,
};
vm.createContext(sb);
vm.runInContext(APP.slice(a, b), sb);
ok(typeof sb.hfCoverState === 'function' && typeof sb.hfDragPlan === 'function' && typeof sb.hfCommentsListHTML === 'function',
  'piezas puras 6C cargan en el sandbox');

// — Ítem 6: estado de portada —
const user = sb.hfCoverState({ cover_path: '/media/cover-7-x.jpg', cover_origin: 'frame@12.3', cover_pos: 20 });
ok(user.has && user.user && user.pos === 20 && user.path === '/media/cover-7-x.jpg', 'portada del dueño: has/user/pos/path');
const dir = sb.hfCoverState({ cover_path: '/media/feedcover-7.jpg', cover_origin: '', cover_pos: null });
ok(dir.has && !dir.user && dir.pos === 50, 'portada del director: has, NO user, pos default 50');
ok(!sb.hfCoverState({}).has && !sb.hfCoverState(null).has, 'sin portada: has=false');
ok(sb.hfCoverState({ cover_path: '/m.jpg', cover_pos: 250 }).pos === 100 && sb.hfCoverState({ cover_path: '/m.jpg', cover_pos: -4 }).pos === 0,
  'cover_pos se clampea a 0–100');

// — Ítem 6: geometría de captura + origen —
const g1 = sb.hfCoverGeom(1920, 1080);
ok(g1.w === 1080 && g1.h === 608, 'hfCoverGeom: 1920×1080 → 1080×608 (tope de ancho)');
const g2 = sb.hfCoverGeom(720, 1280);
ok(g2.w === 720 && g2.h === 1280, 'hfCoverGeom: un frame angosto no se agranda');
ok(sb.hfCoverGeom(0, 0).w === 0, 'hfCoverGeom: sin dimensiones → 0');
ok(sb.hfCoverOriginAt(12.34) === 'frame@12.3' && sb.hfCoverOriginAt(0) === 'frame@0' && sb.hfCoverOriginAt(-2) === 'frame@0',
  'hfCoverOriginAt: frame@<seg con 1 decimal>');

// — Ítem 6: la tile con portada —
const reelCover = { id: 7, status: 'draft', media_type: 'video', image_path: '/media/r7.mp4', cover_path: '/media/cover-7-x.jpg', cover_origin: 'frame@3', cover_pos: 20 };
const tileCover = sb.homeTileHTML({ kind: 'post', post: reelCover }, 0);
ok(tileCover.includes('data-hf-cover="1"') && tileCover.includes('object-position:50% 20%') && !tileCover.includes('<video'),
  'tile de reel con portada: imagen con su encuadre, sin video pelado');
ok(tileCover.includes('hf-glyph'), 'tile de reel con portada: el glyph de reel sigue marcándola');
const reelBare = { id: 8, status: 'draft', media_type: 'video', image_path: '/media/r8.mp4' };
const tileBare = sb.homeTileHTML({ kind: 'post', post: reelBare }, 1);
ok(tileBare.includes('<video') && tileBare.includes('data-hf-reel="1"') && !tileBare.includes('data-hf-cover'),
  'tile de reel sin portada: comportamiento de hoy (video)');

// — Ítem 6+10: el detalle —
const det = sb.hfDetailHTML(reelCover, { en: false, user: 'cafesol' });
ok(det.includes('data-hfd-act="cover"') && det.includes('Elegir la portada del reel') === false && det.includes('Cambiar la portada del reel'),
  'detalle de reel con portada: acción Cambiar la portada');
ok(det.includes('data-hfd-act="cover-clear"') && det.includes('Volver al video'), 'detalle: «Volver al video» con portada del dueño');
ok(det.includes('poster="/media/cover-7-x.jpg"'), 'detalle: el video lleva la portada como poster');
const detBare = sb.hfDetailHTML(reelBare, { en: false, user: 'cafesol' });
ok(detBare.includes('data-hfd-act="cover"') && detBare.includes('Elegir la portada del reel') && !detBare.includes('cover-clear'),
  'detalle de reel sin portada: Elegir, sin «Volver al video»');
const detEn = sb.hfDetailHTML(reelBare, { en: true, user: 'cafesol' });
ok(detEn.includes('Choose the reel cover'), 'detalle EN: gemelo «Choose the reel cover»');
const pub = { id: 9, status: 'published', media_type: 'video', image_path: '/media/r9.mp4', published_at: new Date(Date.now() - 3600e3).toISOString(), likes: 5, comments_count: 2 };
const detPub = sb.hfDetailHTML(pub, { en: false, user: 'cafesol' });
ok(!detPub.includes('data-hfd-act="cover"'), 'detalle de reel publicado: sin acción de portada');
ok(detPub.includes('data-hfd-comments'), 'detalle de publicado: contenedor lazy de comentarios presente');
ok(!det.includes('data-hfd-comments'), 'detalle de borrador: sin contenedor de comentarios');

// — Ítem 9: elegibilidad y plan —
ok(sb.hfDragEligible({ status: 'draft', media_type: 'image' }) && sb.hfDragEligible({ status: 'scheduled', media_type: 'video' }),
  'arrastrables: draft y scheduled de la semana');
ok(!sb.hfDragEligible({ status: 'published', media_type: 'image' }) && !sb.hfDragEligible({ status: 'draft', media_type: 'story' }) && !sb.hfDragEligible(null),
  'no arrastrables: publicados, historias, null');
ok(sb.hfDragEffectiveIso({ scheduled_at: '2999-01-01T12:00:00.000Z' }, '2999-01-03T12:00:00.000Z') === '2999-01-01T12:00:00.000Z',
  'tiempo efectivo: manda el scheduled_at propio');
ok(sb.hfDragEffectiveIso({ scheduled_at: '' }, '2999-01-03T12:00:00.000Z') === '2999-01-03T12:00:00.000Z',
  'tiempo efectivo: el borrador usa la propuesta');
ok(sb.hfDragEffectiveIso({}, 'no-es-fecha') === '' && sb.hfDragEffectiveIso({}, null) === '',
  'tiempo efectivo: sin fecha válida → vacío');
const pA = { id: 7, status: 'draft', media_type: 'image' };
const pB = { id: 8, status: 'scheduled', media_type: 'image', scheduled_at: '2999-01-01T12:00:00.000Z' };
const plan = sb.hfDragPlan(pA, pB, '2999-01-03T12:00:00.000Z', null);
ok(plan && plan.a === 7 && plan.b === 8 && plan.a_to === '2999-01-01T12:00:00.000Z' && plan.b_to === '2999-01-03T12:00:00.000Z'
  && plan.a_status === 'scheduled' && plan.b_status === 'scheduled',
  'hfDragPlan: los tiempos efectivos se cruzan y ambos quedan programados');
ok(sb.hfDragPlan(pA, pA, '2999-01-03T12:00:00.000Z', '2999-01-03T12:00:00.000Z') === null, 'hfDragPlan: el mismo posteo → null');
ok(sb.hfDragPlan(pA, { id: 9, status: 'published', media_type: 'image' }, '2999-01-03T12:00:00.000Z', '2999-01-04T12:00:00.000Z') === null,
  'hfDragPlan: un publicado en el par → null');
ok(sb.hfDragPlan(pA, pB, null, null) === null, 'hfDragPlan: sin tiempos efectivos → null');
const undo = sb.hfDragRestoreBody({ aId: 7, aAt: null, aStatus: 'draft', bId: 8, bAt: '2999-01-01T12:00:00.000Z', bStatus: 'scheduled' });
ok(undo && undo.a_to === null && undo.a_status === 'draft' && undo.b_to === '2999-01-01T12:00:00.000Z' && undo.b_status === 'scheduled',
  'hfDragRestoreBody: el borrador vuelve a borrador sin fecha; el programado, a su horario');

// — Ítem 10: lista de comentarios —
const at = new Date(Date.now() - 3600e3).toISOString();
const list = sb.hfCommentsListHTML([{ author: 'ana', text: '¡Hermoso! ¿Precio?', at }, { author: 'luis', text: '<b>ojo</b>', at: '' }], false);
ok(list.includes('<b>ana</b>') && list.includes('¡Hermoso! ¿Precio?') && list.includes('hace 1 h'), 'comentarios: autor en negrita + texto + relativo ES');
ok(list.includes('&lt;b&gt;ojo&lt;/b&gt;') && !list.includes('<b>ojo</b>'), 'comentarios: el texto viene escapado');
ok(sb.hfCommentsListHTML(null, false) === '' && sb.hfCommentsListHTML([], false) === '', 'comentarios: sin lista no hay sección');
const listEn = sb.hfCommentsListHTML([{ author: 'ana', text: 'Nice!', at }], true);
ok(listEn.includes('1h') && !listEn.includes('hace'), 'comentarios EN: relativo en inglés');

// — Ítem 4 (regresión 6C): el espejo vivo vigila la portada —
const snap1 = sb.hfLiveSnapshot([{ kind: 'post', post: { id: 7, status: 'draft', image_path: '/m.jpg', cover_path: '', cover_pos: 50 } }], {});
const snap2 = sb.hfLiveSnapshot([{ kind: 'post', post: { id: 7, status: 'draft', image_path: '/m.jpg', cover_path: '/media/cover-7.jpg', cover_pos: 20 } }], {});
const d = sb.hfLiveDiff(snap1, snap2);
ok(d.changed.includes('7'), 'espejo vivo: un cambio de portada marca la tile como cambiada');
const d0 = sb.hfLiveDiff(snap1, sb.hfLiveSnapshot([{ kind: 'post', post: { id: 7, status: 'draft', image_path: '/m.jpg', cover_path: '', cover_pos: 50 } }], {}));
ok(!d0.changed.length && !d0.countsChanged, 'espejo vivo: misma portada → sin cambios');

console.log(`\ntest-feed6c-front: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
