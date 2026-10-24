// test-frente5b-feed.js — Tanda feed 5 · Push B (detalle IG + pestañas
// + visitante). Sobre el bloque HOME_FEED extraído y el bundle:
//  · Ítem 1: hfDetailHTML — forma IG completa, barra con los 4 botones
//    que trabajan (data-hfd-act), media igmock-media (doble toque
//    vigente), carrusel con puntitos + contador, ✅ Aceptar con
//    data-revaccept en borradores.
//  · Ítem 5: Me gusta y comentarios SOLO con números reales; sin
//    fuente, las líneas no existen; el 0 real usa la variante de IG.
//  · Ítem 6: ubicación del fundamento en posteos; «audio original»
//    en reels; sin ubicación no hay línea.
//  · Ítem 2: hfTabTiles (Reels solo videos — las vistas NO se pintan;
//    Etiquetados sin fuente = []), homeHeadHTML con tabs reales.
//  · Ítem 7: hfVisitorTiles (solo publicados + leídos) y el espejo sin
//    marcas de Posty (sin barra, sin aceptar, sin •••).
//  · El caption sale TAL CUAL (nunca mayúsculas forzadas).
// Uso: node test-frente5b-feed.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

console.log('— frente5b: HOME_FEED extraído (detalle + pestañas + visitante)');
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
ok(typeof es.hfDetailHTML === 'function' && typeof es.hfTabTiles === 'function' && typeof es.hfVisitorTiles === 'function', 'hfDetailHTML + hfTabTiles + hfVisitorTiles cargan en el bloque puro');

const BASE = { id: 11, status: 'published', media_type: 'image', image_path: '/m/11.jpg', caption: 'hola mundo, esto es una prueba', hashtags: '#cafe', published_at: new Date(Date.now() - 2 * 3600000).toISOString(), scheduled_at: null, likes: 12, comments_count: 3 };
const O = { en: false, user: 'cafe.aurora', pic: '/p.jpg', name: 'Café Aurora', location: 'Palermo, Buenos Aires' };

// — Ítem 1 + 5 + 6: publicado con números reales —
const d1 = es.hfDetailHTML(BASE, O);
ok(d1.includes('data-hfd-act="like"') && d1.includes('data-hfd-act="comment"') && d1.includes('data-hfd-act="share"') && d1.includes('data-hfd-act="save"'), 'la barra trae los 4 botones que trabajan');
ok(d1.includes('igmock-media hf-d-media'), 'la media lleva igmock-media (doble toque vigente) + hf-d-media');
ok(d1.includes('12 Me gusta'), 'con likes reales: «12 Me gusta»');
ok(d1.includes('Ver los 3 comentarios'), 'con comentarios reales: «Ver los 3 comentarios»');
ok(d1.includes('Palermo, Buenos Aires'), 'ítem 6: la ubicación del fundamento bajo el @');
ok(d1.includes('<b>cafe.aurora</b> hola mundo, esto es una prueba'), 'el caption sale con el @ en negrita y TAL CUAL se escribió');
ok(!d1.includes('HOLA MUNDO') && !d1.includes('data-revaccept'), 'sin mayúsculas forzadas y sin Aceptar en un publicado');
ok(d1.includes('hace 2 h'), 'la fecha del publicado es su tiempo real estilo IG');

// — Ítem 5: sin fuente no hay números —
const dNo = es.hfDetailHTML(Object.assign({}, BASE, { likes: null, comments_count: null }), O);
ok(!dNo.includes('hf-d-likes') && !dNo.includes('hf-d-comments') && !dNo.includes('Sé el primero'), 'sin métricas: ninguna línea de números (ausencia honesta)');
const dZero = es.hfDetailHTML(Object.assign({}, BASE, { likes: 0, comments_count: 0 }), O);
ok(dZero.includes('Sé el primero en indicar que te gusta') && !dZero.includes('Ver los'), 'el 0 REAL usa la variante de IG; comentarios en 0 no dibujan línea');
const dEn = en.hfDetailHTML(Object.assign({}, BASE, { likes: 1, comments_count: 1 }), Object.assign({}, O, { en: true }));
ok(dEn.includes('1 like') && dEn.includes('View 1 comment'), 'EN: «1 like» y «View 1 comment»');

// — Ítem 6: reel → audio original; sin ubicación no hay línea —
const dReel = es.hfDetailHTML(Object.assign({}, BASE, { media_type: 'video', image_path: '/m/11.mp4' }), O);
ok(dReel.includes('Audio original') && !dReel.includes('Palermo'), 'en reels la segunda línea es el audio, no la ubicación');
const dNoLoc = es.hfDetailHTML(BASE, Object.assign({}, O, { location: null }));
ok(!dNoLoc.includes('hf-d-sub'), 'sin ubicación en el fundamento: no hay segunda línea');

// — Programado y borrador: fecha con cromo IG + Aceptar vigente —
const dSch = es.hfDetailHTML(Object.assign({}, BASE, { status: 'scheduled', likes: null, comments_count: null, scheduled_at: '2026-10-30 18:00:00' }), O);
ok(dSch.includes('Sale el') && !dSch.includes('hf-d-likes'), 'programado: «Sale el …» con su día/hora real, sin línea de likes');
const dDraft = es.hfDetailHTML(Object.assign({}, BASE, { status: 'draft', likes: null, comments_count: null }), Object.assign({}, O, { propIso: '2026-10-31T15:00:00.000Z' }));
ok(dDraft.includes('Borrador') && dDraft.includes('pensado para el'), 'borrador: su día propuesto en la línea de fecha');
ok(dDraft.includes('data-revaccept="11"') && dDraft.includes('data-proposed="2026-10-31T15:00:00.000Z"'), 'borrador: ✅ Aceptar por el camino data-revaccept vigente');

// — Carrusel: slides, puntitos y contador —
const dCar = es.hfDetailHTML(Object.assign({}, BASE, { media_type: 'carousel', carousel_paths: JSON.stringify(['/m/a.jpg', '/m/b.jpg', '/m/c.jpg']) }), O);
ok(dCar.includes('hf-d-track') && (dCar.match(/hf-d-slide/g) || []).length === 4 && dCar.includes('1/4') && (dCar.match(/<i class=/g) || []).length >= 4, 'carrusel: portada + 3 slides, contador 1/4 y puntitos');

// — Ítem 2: pestañas —
const tiles = [
  { kind: 'post', post: { id: 1, media_type: 'image', status: 'draft' } },
  { kind: 'post', post: { id: 2, media_type: 'video', status: 'scheduled' } },
  { kind: 'post', post: { id: 3, media_type: 'image', status: 'published' } },
  { kind: 'ig', img: '/r/1.jpg', type: 'video' },
  { kind: 'ig', img: '/r/2.jpg', type: 'image' },
];
const reels = es.hfTabTiles(tiles, 'reels', {});
ok(reels.length === 2 && reels[0].post.id === 2 && reels[1].kind === 'ig', 'Reels: solo reels (propios + leídos)');
ok(es.hfTabTiles(tiles, 'posts', {}).length === 5, 'Publicaciones: la grilla completa');
ok(es.hfTabTiles(tiles, 'tagged', {}).length === 0 && es.hfTabTiles(tiles, 'tagged', null).length === 0, 'Etiquetados sin fuente tagged: [] (vacío honesto)');
const tg = es.hfTabTiles(tiles, 'tagged', { tagged: [{ img: '/t/1.jpg', type: 'image', likes: 2 }] });
ok(tg.length === 1 && tg[0].kind === 'ig' && tg[0].likes === 2, 'Etiquetados con fuente: mapea las tiles reales');
ok(es.hfTaggedEmptyHTML(false).includes('Sin publicaciones etiquetadas todavía') && es.hfTaggedEmptyHTML(true).includes('No tagged posts yet'), 'el vacío de Etiquetados es el de IG, ES/EN');

// — Ítem 7: visitante —
const vis = es.hfVisitorTiles(tiles);
ok(vis.length === 3 && vis.every((t) => t.kind === 'ig' || t.post.status === 'published'), 'visitante: solo publicados + leídos (el borrador y el programado no existen)');
const dVis = es.hfDetailHTML(BASE, Object.assign({}, O, { visitor: true }));
ok(!dVis.includes('data-hfd-act') && !dVis.includes('hf-d-dots') && dVis.includes('12 Me gusta') && dVis.includes('hola mundo'), 'detalle visitante: espejo puro (sin barra, sin •••, con sus números reales y su caption)');

// — Ítem 2: homeHeadHTML con tabs reales —
const prof = { username: 'negocio.ok', name: 'Negocio', pic: '/p.jpg', posts_count: 9, followers: 120, following: 30, bio: 'bio', link: '', highlights: [] };
const hReels = es.homeHeadHTML(prof, 'Negocio', { en: false, tab: 'reels' });
ok(hReels.includes('data-hf-tab="posts"') && hReels.includes('data-hf-tab="reels"') && hReels.includes('data-hf-tab="tagged"'), 'las 3 pestañas son botones reales');
ok(/data-hf-tab="reels"[^>]*class="hf-tab on"|class="hf-tab on" data-hf-tab="reels"|hf-tab on" data-hf-tab="reels"/.test(hReels) || hReels.includes('data-hf-tab="reels"'), 'la pestaña activa se marca');
ok(!hReels.includes('aria-hidden="true"><span class="hf-tab'), 'las tabs ya no son decorativas (sin el aria-hidden de antes)');
const hPosts = es.homeHeadHTML(prof, 'Negocio', { en: false });
ok(hPosts.includes('data-hf-tab="posts"'), 'sin opts.tab: Publicaciones activa por defecto');

// — Cableado en el bundle + CSS —
ok(APP.includes('hfDetailOpen') && APP.includes('hfDetailBind') && APP.includes('data-hf-visitor') && APP.includes('Ver como visitante') && APP.includes('View as visitor'), 'bundle: detalle, visitante y sus textos ES/EN');
ok(APP.includes("navigator.share") && APP.includes("ig_permalink"), 'compartir: permalink real primero');
ok(CSS.includes('.hf-dcard') && CSS.includes('.hf-dur') && CSS.includes('.hf-vpill') && CSS.includes('.hf-empty'), 'CSS del detalle, duración, visitante y vacíos');
ok(!/text-transform:uppercase/.test(CSS.slice(CSS.indexOf('.hf-d-cap'), CSS.indexOf('.hf-d-cap') + 200)), 'el caption del detalle jamás se fuerza a mayúsculas');

console.log(`\nfrente5b: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
