'use strict';
/* test-feed6b-front.js — Tanda feed 6B (front, extracción vm del bloque
 * HOME_FEED, patrón test-feed6a-front):
 *  · Ítem 4: hfLiveSnapshot/hfLiveDiff puros (publicado nuevo, cambio
 *    de horario/imagen/fijado, altas/bajas, conteos, sin cambios → ∅)
 *    y el realce de sesión en la tile (hf-justpub + chapita).
 *  · Ítem 5: hfPeekHTML (estado, métricas SOLO con fuente, extracto del
 *    caption tal cual, acciones con contador de rehaces de la Fase A).
 *  · Ítem 7: geometría del recorte 3:4 (hfCropPct / hfCrop34Rect) y el
 *    overlay en detalle y tarjetas Día/Semana (weekCardHTML).
 *  · Ítem 8: hfFollowerHTML (líneas de Me gusta/comentarios solo con
 *    datos reales; «más» solo si el caption es largo; gemelos EN).
 * Uso: node test-feed6b-front.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.6);

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

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
for (const fn of ['hfLiveSnapshot', 'hfLiveDiff', 'hfCropPct', 'hfCrop34Rect', 'hfCropOverlayHTML', 'hfPeekHTML', 'hfFollowerHTML']) {
  ok(typeof es[fn] === 'function', `${fn} carga en el bloque puro`);
}

// ---------- Ítem 4: diff del espejo vivo ----------
console.log('— 6B ítem 4: hfLiveDiff');
const T = (id, extra) => ({ kind: 'post', post: Object.assign({ id, status: 'scheduled', scheduled_at: '2026-10-25T12:00:00.000Z', image_path: '/m/' + id + '.jpg', pinned: 0, published_at: '' }, extra || {}) });
const PROF = { posts_count: 10, followers: 200, following: 50 };
const snap1 = es.hfLiveSnapshot([T(1), T(2)], PROF);
const d0 = es.hfLiveDiff(snap1, es.hfLiveSnapshot([T(1), T(2)], PROF));
ok(d0.changed.length === 0 && d0.added.length === 0 && d0.removed.length === 0 && d0.justPublished.length === 0 && d0.countsChanged === false, 'sin cambios → diff vacío (cero mutaciones)');
const dPub = es.hfLiveDiff(snap1, es.hfLiveSnapshot([T(1, { status: 'published', published_at: '2026-10-24T15:00:00.000Z' }), T(2)], PROF));
ok(dPub.changed.includes('1') && dPub.justPublished.includes('1'), 'pasó a published → changed + justPublished');
const dNewPub = es.hfLiveDiff(snap1, es.hfLiveSnapshot([T(1), T(2), T(3, { status: 'published', published_at: '2026-10-24T15:00:00.000Z' })], PROF));
ok(dNewPub.added.includes('3') && dNewPub.justPublished.includes('3'), 'publicado nuevo que entra a la grilla → added + justPublished');
const dHour = es.hfLiveDiff(snap1, es.hfLiveSnapshot([T(1, { scheduled_at: '2026-10-26T12:00:00.000Z' }), T(2)], PROF));
ok(dHour.changed.includes('1') && dHour.justPublished.length === 0, 'cambio de horario → changed sin justPublished');
const dImg = es.hfLiveDiff(snap1, es.hfLiveSnapshot([T(1, { image_path: '/m/nueva.jpg' }), T(2, { pinned: 1 })], PROF));
ok(dImg.changed.includes('1') && dImg.changed.includes('2'), 'cambio de imagen y de fijado → changed en ambos');
const dRem = es.hfLiveDiff(snap1, es.hfLiveSnapshot([T(1)], PROF));
ok(dRem.removed.includes('2'), 'posteo que sale de la composición → removed');
const dCnt = es.hfLiveDiff(snap1, es.hfLiveSnapshot([T(1), T(2)], { posts_count: 11, followers: 200, following: 50 }));
ok(dCnt.countsChanged === true && dCnt.changed.length === 0, 'conteos distintos → countsChanged sin tocar tiles');
const dNull = es.hfLiveDiff(null, snap1);
ok(dNull.countsChanged === true && dNull.changed.length === 0, 'sin foto previa → no se parchea nada (se adopta la foto)');

// Realce de sesión en la tile
const tileJust = es.homeTileHTML({ kind: 'post', post: { id: 9, status: 'published', media_type: 'image', image_path: '/m/9.jpg', published_at: '2026-10-24T15:00:00.000Z' }, justPub: true }, 0);
ok(tileJust.includes('hf-justpub') && tileJust.includes('Recién publicado'), 'tile recién publicada: clase hf-justpub + chapita «Recién publicado»');
const tileJustEn = en.homeTileHTML({ kind: 'post', post: { id: 9, status: 'published', media_type: 'image', image_path: '/m/9.jpg', published_at: '2026-10-24T15:00:00.000Z' }, justPub: true }, 0);
ok(tileJustEn.includes('Just published'), 'chapita EN «Just published»');
const tilePlain = es.homeTileHTML({ kind: 'post', post: { id: 9, status: 'published', media_type: 'image', image_path: '/m/9.jpg', published_at: '2026-10-24T15:00:00.000Z' } }, 0);
ok(!tilePlain.includes('hf-justpub') && !tilePlain.includes('Recién publicado'), 'render común: sin realce ni chapita (solo sesión en vivo)');
ok(APP.includes('setInterval') && APP.includes('hfLiveTick') && APP.includes("api.get('/api/posts')") && APP.includes("api.get('/api/home/profile')"), 'el sondeo reusa los endpoints del payload del home');
ok(APP.includes('hfLiveBusy') && APP.includes('HF_LIVE.pending'), 'guardas del espejo: detalle/peek/chat/gesto difieren el parcheo');

// ---------- Ítem 5: peek ----------
console.log('— 6B ítem 5: hfPeekHTML');
const peekPub = es.hfPeekHTML({ id: 3, status: 'published', media_type: 'image', image_path: '/m/3.jpg', caption: 'Café de especialidad, recién molido', likes: 24, comments_count: 3, published_at: new Date(Date.now() - 3600e3).toISOString() }, false, {});
ok(peekPub.includes('Publicado') && peekPub.includes('24 Me gusta') && peekPub.includes('3 comentarios'), 'peek publicado CON fuente: estado + métricas reales');
ok(peekPub.includes('Café de especialidad, recién molido'), 'peek: extracto del caption tal cual');
const peekPubSin = es.hfPeekHTML({ id: 3, status: 'published', media_type: 'image', image_path: '/m/3.jpg', caption: 'Hola', likes: null, comments_count: null, published_at: new Date(Date.now() - 3600e3).toISOString() }, false, {});
ok(!peekPubSin.includes('Me gusta'), 'peek publicado SIN fuente: ninguna línea de métricas inventada');
const peekDraft = es.hfPeekHTML({ id: 4, status: 'draft', media_type: 'image', image_path: '/m/4.jpg', caption: 'Borrador', redo_left: 2 }, false, {});
ok(peekDraft.includes('data-hf-peek-act="chat"') && peekDraft.includes('data-hf-peek-act="pin"') && peekDraft.includes('data-hf-peek-act="followers"'), 'peek: acciones rápidas chat · fijar · vista de seguidor');
ok(peekDraft.includes('Rehacer · 2'), 'peek: rehacer con su contador de la Fase A (· 2)');
const peekDraft0 = es.hfPeekHTML({ id: 4, status: 'draft', media_type: 'image', image_path: '/m/4.jpg', caption: 'Borrador', redo_left: 0 }, false, {});
ok(peekDraft0.includes('disabled') && peekDraft0.includes('Ya usaste los 3 rehaces de este posteo'), 'peek a 0 rehaces: botón deshabilitado + línea amable de la Fase A');
const peekEn = en.hfPeekHTML({ id: 4, status: 'draft', media_type: 'image', image_path: '/m/4.jpg', caption: 'Draft', redo_left: 1 }, true, {});
ok(peekEn.includes('Draft') && peekEn.includes('Redo · 1') && peekEn.includes('Followers view'), 'peek EN: gemelos (Draft · Redo · Followers view)');
const peekVisitor = es.hfPeekHTML({ id: 4, status: 'draft', media_type: 'image', image_path: '/m/4.jpg', caption: 'x', redo_left: 1 }, false, { visitor: true });
ok(!peekVisitor.includes('data-hf-peek-act'), 'peek en modo visitante: sin acciones de Posty');
const peekSched = es.hfPeekHTML({ id: 5, status: 'scheduled', media_type: 'image', image_path: '/m/5.jpg', caption: 'Sale', scheduled_at: '2999-01-01T12:00:00.000Z', redo_left: 3 }, false, {});
ok(peekSched.includes('Sale el'), 'peek programado: línea de salida («Sale el…»)');

// ---------- Ítem 7: recorte 3:4 ----------
console.log('— 6B ítem 7: recorte de grilla 3:4');
const c45 = es.hfCropPct(4, 5);
ok(near(c45.w, 93.75) && near(c45.x, 3.125) && c45.y === 0 && c45.h === 100, `foto 4:5 en grilla 3:4: se conservan los lados (w=${c45.w}%, x=${c45.x}%)`);
const c34 = es.hfCropPct(3, 4);
ok(c34.w === 100 && c34.h === 100 && c34.x === 0 && c34.y === 0, 'foto ya 3:4: el marco es la foto entera');
const c169 = es.hfCropPct(16, 9);
ok(near(c169.w, 42.19) && near(c169.x, 28.9) && c169.h === 100, 'foto ancha 16:9: el marco 3:4 es central y angosto');
const cTall = es.hfCropPct(9, 16);
ok(cTall.w === 100 && near(cTall.h, 75) && near(cTall.y, 12.5), 'foto alta 9:16: el marco recorta arriba/abajo centrado');
const r1 = es.hfCrop34Rect(400, 500, 800, 1000);
ok(near(r1.x, 12.5) && near(r1.w, 375) && r1.y === 0 && near(r1.h, 500), 'hfCrop34Rect contain 4:5 en caja 4:5: marco en píxeles correcto');
const r2 = es.hfCrop34Rect(400, 500, 600, 1200);
ok(near(r2.w, 250) && near(r2.h, 1000 / 3, 1) && near(r2.x, 75) && near(r2.y, 250 / 3, 1), 'hfCrop34Rect foto alta con letterbox: marco centrado sobre la foto exhibida');
const rBad = es.hfCrop34Rect(0, 0, 0, 0);
ok(rBad.w === 0 && rBad.h === 0, 'sin dimensiones reales: marco vacío (nada inventado)');
const ovEs = es.hfCropOverlayHTML(4, 5, false);
ok(ovEs.includes('hf-cropov-frame') && ovEs.includes('width:93.75%') && ovEs.includes('Así se ve en la grilla'), 'overlay ES: marco % + rótulo «Así se ve en la grilla»');
const ovEn = en.hfCropOverlayHTML(4, 5, true);
ok(ovEn.includes('How it looks in the grid'), 'overlay EN: «How it looks in the grid»');
const det = es.hfDetailHTML({ id: 6, status: 'scheduled', media_type: 'image', image_path: '/m/6.jpg', caption: 'Detalle', scheduled_at: '2026-10-25T12:00:00.000Z', redo_left: 3 }, { en: false, user: 'cafesol' });
ok(det.includes('data-hf-crop') && det.includes('Ver cómo se recorta') && det.includes('hf-cropov'), 'detalle: interruptor «Ver cómo se recorta» + overlay en la media');
ok(det.includes('data-hfd-act="followers"'), 'detalle: acción «Ver en el inicio» en su barra (ítem 8)');
const detEn = en.hfDetailHTML({ id: 6, status: 'scheduled', media_type: 'image', image_path: '/m/6.jpg', caption: 'Detail', scheduled_at: '2026-10-25T12:00:00.000Z', redo_left: 3 }, { en: true, user: 'cafesol' });
ok(detEn.includes('See how it crops'), 'detalle EN: «See how it crops»');
ok(CSS.includes('.hf-cropov-frame') && CSS.includes('box-shadow:0 0 0 9999px'), 'CSS: el marco atenúa lo descartado con sombra envolvente');

// weekCardHTML (tarjetas Día/Semana): sandbox estilo test-feed-payload
const extractFn = (src, name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) break; } }
  return src.slice(i, j + 1);
};
const wctx = vm.createContext({
  console, Date, Math, Number, String, Array, Object, JSON,
  ME: { lang: 'es' }, PROFILE: { ig_username: 'cafesol' },
  LP_WEEK_ICONS: '<i>icons</i>', f3ThreadHTML: () => '',
  pcParseDate: () => null, pcFmtDayLong: () => '',
  assetLogo: () => null, brandColors: () => ['#2793C8'],
});
vm.runInContext(APP.slice(APP.indexOf('const esc ='), APP.indexOf('\n', APP.indexOf('const esc ='))), wctx);
vm.runInContext(extractFn(APP, 'igRelTime'), wctx);
vm.runInContext(extractFn(APP, 'hfCropPct'), wctx);
vm.runInContext(extractFn(APP, 'hfCropOverlayHTML'), wctx);
vm.runInContext(extractFn(APP, 'weekCardHTML'), wctx);
const wk = vm.runInContext(`weekCardHTML(${JSON.stringify({ id: 8, media_type: 'image', status: 'scheduled', image_path: '/m/8.jpg', caption: 'Semana', hashtags: '', scheduled_at: '2026-10-25T12:00:00.000Z', likes: null, comments_count: null })}, { bizName: 'Café Sol', user: 'cafesol', prop: { label: 'dom 25 · 9:00', iso: null } })`, wctx);
ok(wk.includes('data-hf-crop') && wk.includes('hf-cropov') && wk.includes('Así se ve en la grilla'), 'tarjeta Día/Semana: mini-interruptor de recorte + overlay 3:4 en su media');

// ---------- Ítem 8: ver en el inicio ----------
console.log('— 6B ítem 8: hfFollowerHTML');
const longCap = 'Este es un pie de foto bien largo que cuenta la historia completa del negocio, sus horarios, su propuesta y cómo reservar para el fin de semana que viene.';
const fv = es.hfFollowerHTML({ id: 7, status: 'published', media_type: 'image', image_path: '/m/7.jpg', caption: longCap, likes: 128, comments_count: 7, published_at: new Date(Date.now() - 2 * 3600e3).toISOString() }, { en: false, user: 'cafesol', name: 'Café Sol' });
ok(fv.includes('Así lo ven tus seguidores'), 'vista de seguidor: rótulo honesto ES');
ok(fv.includes('128 Me gusta') && fv.includes('Ver los 7 comentarios'), 'con fuente real: líneas de Me gusta y comentarios reales');
ok(fv.includes('data-hf-fv-more') && fv.includes('>más</button>'), 'caption largo: se corta con «más»');
ok(fv.includes('cafesol'), 'cabecera con el usuario de la cuenta');
const fvSin = es.hfFollowerHTML({ id: 7, status: 'published', media_type: 'image', image_path: '/m/7.jpg', caption: 'Corto', likes: null, comments_count: null, published_at: new Date(Date.now() - 3600e3).toISOString() }, { en: false, user: 'cafesol' });
ok(!fvSin.includes('Me gusta') && !fvSin.includes('Ver los') && !fvSin.includes('Sé el primero'), 'sin fuente: NO existen líneas de Me gusta/comentarios (regla tanda 5)');
ok(!fvSin.includes('data-hf-fv-more'), 'caption corto: sin «más»');
const fvCero = es.hfFollowerHTML({ id: 7, status: 'published', media_type: 'image', image_path: '/m/7.jpg', caption: 'Corto', likes: 0, comments_count: 0, published_at: new Date(Date.now() - 3600e3).toISOString() }, { en: false, user: 'cafesol' });
ok(fvCero.includes('Sé el primero en indicar que te gusta'), 'cero REAL (con fuente): variante de cero, como IG');
const fvEn = en.hfFollowerHTML({ id: 7, status: 'published', media_type: 'image', image_path: '/m/7.jpg', caption: longCap, likes: 5, comments_count: 1, published_at: new Date(Date.now() - 3600e3).toISOString() }, { en: true, user: 'cafesol' });
ok(fvEn.includes('How your followers see it') && fvEn.includes('5 likes') && fvEn.includes('View 1 comment') && fvEn.includes('>more</button>'), 'vista de seguidor EN: rótulo, métricas y «more»');
ok(APP.includes('data-hfdm="followers"'), 'el menú ••• del detalle también abre la vista de seguidor');
ok(CSS.includes('.hf-peek{') && CSS.includes('.hf-fv-card{') && CSS.includes('.hf-just-chip{'), 'CSS de peek, vista de seguidor y chapita en styles.css');

console.log(`\ntest-feed6b-front: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
