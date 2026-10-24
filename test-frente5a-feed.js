// test-frente5a-feed.js — Tanda feed 5 · Push A (fijados + anillo +
// micro-cromo). Cubre, sobre el bloque HOME_FEED extraído y el bundle:
//  · Ítem 3 (fijados): homeGridCompose rinde las piezas propias con
//    pinned PRIMERAS en su orden de fijado; sin fijadas, la composición
//    es la vigente; la tile lleva data-pinned y el glyph 📌; la hoja de
//    acciones ofrece Fijar/Desfijar y hfPinToggle pega al PATCH.
//  · Ítem 4 (anillo): homeHeadHTML con storyRing 'live' → degradé +
//    avatar-botón; 'past' → gris; '' → sin anillo ni botón; abrir el
//    visor marca la sesión como vista.
//  · Ítem 8 (cromo): tira de Panel profesional en inicioView (sin
//    números inventados); links múltiples SOLO con links[] en el
//    payload; chip de Threads SOLO con threads en el payload.
// Uso: node test-frente5a-feed.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const DB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');

console.log('— frente5a: HOME_FEED extraído (fijados + anillo + cromo)');
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
ok(a > 0 && b > a, 'bloque HOME_FEED delimitado');
const TZ = 'America/Argentina/Buenos_Aires';
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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
ok(typeof es.homeGridCompose === 'function' && typeof es.homeTileHTML === 'function' && typeof es.homeHeadHTML === 'function', 'compose/tile/head cargan en el bloque puro');

// — Ítem 3: composición sin fijados = la vigente —
const P = (id, status, extra) => Object.assign({ id, status, media_type: 'image', image_path: '/m/' + id + '.jpg', caption: 'c' + id, scheduled_at: '2026-10-2' + id + ' 15:00:00', published_at: status === 'published' ? '2026-10-1' + id + ' 15:00:00' : null }, extra || {});
const baseIn = {
  upcoming: [{ p: P(1, 'draft'), ymd: '2026-10-21' }, { p: P(2, 'scheduled'), ymd: '2026-10-22' }],
  published: [P(3, 'published'), P(4, 'published')],
  recents: [{ img: '/r/9.jpg', type: 'image', taken_at: 1700000000, likes: 5, comments: 1 }],
};
const base = es.homeGridCompose(baseIn);
ok(base.length === 5 && base[0].post.id === 1 && base[1].post.id === 2 && base[2].post.id === 4 && base[3].post.id === 3 && base[4].kind === 'ig', 'sin fijados: orden vigente (semana → publicados por fecha desc → leídos)');

// — Ítem 3: con fijados, primeros en orden de fijado —
const pinIn = {
  upcoming: [{ p: P(1, 'draft'), ymd: '2026-10-21' }, { p: P(2, 'scheduled'), ymd: '2026-10-22' }],
  published: [P(3, 'published', { pinned: 1, pinned_at: '2026-10-20 10:00:00' }), P(4, 'published', { pinned: 1, pinned_at: '2026-10-19 10:00:00' })],
  recents: baseIn.recents,
};
const pins = es.homeGridCompose(pinIn);
ok(pins[0].post.id === 4 && pins[1].post.id === 3, 'fijados primeros, en orden de fijado (pinned_at asc)');
ok(pins[2].post.id === 1 && pins[3].post.id === 2 && pins[4].kind === 'ig', 'el resto conserva su orden tras los fijados');
const capIn = { upcoming: [], published: Array.from({ length: 30 }, (_, i) => P(100 + i, 'published', i === 29 ? { pinned: 1, pinned_at: '2026-10-01 00:00:00' } : {})), recents: [] };
const capped = es.homeGridCompose(capIn);
ok(capped.length === 24 && capped[0].post.id === 129, 'el tope de grilla se respeta y el fijado entra primero');

// — Ítem 3: tile y glyph —
const tPin = es.homeTileHTML({ kind: 'post', post: P(7, 'scheduled', { pinned: 1 }), day: '2026-10-27', isNew: false }, 0);
ok(tPin.includes('data-pinned="1"'), 'tile fijada lleva data-pinned="1"');
ok(tPin.includes('M15.6 3.5l4.9'), 'tile fijada lleva el glyph 📌 de IG');
const tReel = es.homeTileHTML({ kind: 'post', post: P(8, 'scheduled', { media_type: 'video' }), day: '2026-10-28', isNew: false }, 1);
ok(tReel.includes('data-pinned="0"') && !tReel.includes('M15.6 3.5l4.9') && tReel.includes('hf-glyph'), 'reel sin fijar: data-pinned="0" y glyph de reel, sin 📌');

// — Ítem 4: anillo del avatar —
const prof = { username: 'negocio.ok', name: 'Negocio', pic: '/p.jpg', posts_count: 9, followers: 120, following: 30, bio: 'bio', link: '', highlights: [] };
const hLive = es.homeHeadHTML(prof, 'Negocio', { en: false, storyRing: 'live' });
ok(hLive.includes('hf-ava-in story') && !hLive.includes('story seen') && hLive.includes('data-hf-ava="1"'), 'anillo vivo: degradé + avatar-botón');
const hPast = es.homeHeadHTML(prof, 'Negocio', { en: false, storyRing: 'past' });
ok(hPast.includes('hf-ava-in story seen') && hPast.includes('data-hf-ava="1"'), 'anillo pasado/visto: gris + avatar-botón');
const hNone = es.homeHeadHTML(prof, 'Negocio', { en: false, storyRing: '' });
ok(!hNone.includes('hf-ava-in story') && !hNone.includes('data-hf-ava'), 'sin historias en la semana: sin anillo ni botón');
ok(APP.includes("sessionStorage.setItem('posty_hf_stories_seen', '1')"), 'abrir el visor marca las historias como vistas en la sesión');

// — Ítem 8: cromo condicional —
ok(!hNone.includes('hf-threads'), 'sin threads en el payload: no hay chip de Threads');
const hThr = es.homeHeadHTML(Object.assign({}, prof, { threads: '@negocio.ok' }), 'Negocio', { en: false });
ok(hThr.includes('hf-threads') && hThr.includes('negocio.ok'), 'con threads en el payload: el chip aparece junto al @');
const hLinks = es.homeHeadHTML(Object.assign({}, prof, { links: ['https://a.example', 'https://b.example/x'] }), 'Negocio', { en: false });
ok(hLinks.includes('hf-links') && hLinks.includes('a.example') && hLinks.includes('b.example/x'), 'links[] con 2+: se rinden todos');
const hOne = es.homeHeadHTML(prof, 'Negocio', { en: false });
ok(hOne.includes('instagram.com/negocio.ok') && !hOne.includes('hf-links'), 'sin links[]: el link de siempre (perfil de IG), sin lista');
ok(APP.includes('hf-prodash') && APP.includes('#/app/analisis'), 'inicioView trae la tira de Panel profesional → Análisis');
ok(!/Panel profesional[^<]*\d/.test(APP), 'la tira de Panel profesional no inventa ningún número');

// — Ítem 3: hoja de acciones + servidor —
ok(APP.includes('hfPinToggle') && APP.includes("'unpin' : 'pin'") && APP.includes('Desfijar de tu perfil'), 'la hoja de acciones ofrece Fijar/Desfijar y hfPinToggle existe');
ok(SRV.includes("action === 'pin'") && SRV.includes('pin_limit') && SRV.includes('owner_liked') && SRV.includes('owner_saved'), 'server: PATCH con pin (tope) + señales ♡/🔖');
ok(DB.includes('ADD COLUMN pinned INTEGER') && DB.includes('ADD COLUMN pinned_at') && DB.includes('ADD COLUMN owner_liked') && DB.includes('ADD COLUMN owner_saved'), 'db.js: columnas pinned/pinned_at/owner_liked/owner_saved');
ok(SRV.includes('payload.location') && SRV.includes('digest.ciudad'), 'server: /api/home/profile expone location desde la ciudad del fundamento');

console.log(`\nfrente5a: ${total - fails}/${total}`);
process.exit(fails ? 1 : 0);
