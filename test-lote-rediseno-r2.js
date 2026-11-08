#!/usr/bin/env node
/* LOTE REDISENO-R2 · FEED — suite rojo-primero.
   Decisión Valentino 8/11 00:07 (el mock posty-app-design es el nuevo
   diseño del TestFlight, con el motor real adentro); tablero §5.5:
   paralelo con re-base por lote. Spec: PLAN-REDISENO-MOCK.md §1.2 + §4 R2.
   - «Mi feed» pasa a pantalla propia (#/app/feed) con el feed LITERAL:
     fijados primero, no publicados por fecha DESC, ya salidos por fecha
     DESC (homeGridCompose, la misma composición de Inicio — nunca se
     reordena en Feed); si se elimina en IG desaparece al abrir/refrescar
     (hfLiveRevalidateFeed generalizada); posteo del día PRIMERO con magia
     + latido SOLO brillo, sin escala (.hf-carta-magia); producto entero,
     nunca cortado, con la marca del cliente visible (las mismas tiles).
   - Cabecera de stats SOLO con datos reales: posteos = conteo real;
     consultas de la semana = lo contado por Posty (/api/weekly-report,
     comentarios) — lo reportado por el cliente en la pregunta semanal NO
     existe guardado en v793 y NO se suma nada inventado; seguidores =
     últimos, nunca titular; sello AL DÍA solo si el feed está al día de
     verdad (un posteo publicado hoy).
   - Detalle del posteo (el vigente) + imagen en grande (el lightbox de
     siempre) + botón «Ver en el feed» (el posteo en su posición final y
     destacado). Mínimo de los lotes en vuelo v775 e imagen-grande-y-feed.
   - Sin server.js: todo se compone en el cliente desde endpoints
     existentes. Uso: node test-lote-rediseno-r2.js [árbol] — por defecto
     el dir del archivo. Boot real con DATA_DIR temporal + join trial
     (sin clave IA). */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] || __dirname;
const PORT = 34794;
const TEST_KEY = 'rediseno-r2-feed';

let PASS = 0, FAIL = 0;
const failed = [];
function check(name, cond, detail) {
  if (cond) { PASS++; console.log('  ok  ' + name); }
  else { FAIL++; failed.push(name); console.log('  FALLO ' + name + (detail ? ' — ' + detail : '')); }
}
const appSrc = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const slice = (from, to) => {
  const a = appSrc.indexOf(from);
  const b = to ? appSrc.indexOf(to, a) : appSrc.length;
  return (a < 0 || b < 0) ? '' : appSrc.slice(a, b);
};
const fnSrc = (name) => {
  const a = appSrc.indexOf('function ' + name + '(');
  if (a < 0) return '';
  const b = appSrc.indexOf('{', a);
  if (b < 0) return '';
  let d = 0;
  for (let i = b; i < appSrc.length; i++) {
    if (appSrc[i] === '{') d++;
    else if (appSrc[i] === '}') { d--; if (d === 0) return appSrc.slice(a, i + 1); }
  }
  return '';
};

// ---------- Parte A: estático — ruta, pantalla, detalle, CSS ----------
console.log('== Parte A: estático — ruta y pantalla ==');
const dispatch = slice("let tab = tabRaw || 'inicio'", "bootSplashOff();");
check('A1 ruta #/app/feed → feedView()', dispatch.includes("tab === 'feed'") && dispatch.includes('feedView()'));
check('A2 bindApp: tab feed → bindFeed()', appSrc.includes("if (tab === 'feed') bindFeed()"));
check('A3 bbShell: feed en bb-glass-pantallas', slice('function bbShell(tab, content)', 'function mxTabKey').includes("tab === 'feed'"));
check('A4 feedView definida y usa homeGridCompose', fnSrc('feedView').includes('homeGridCompose('));
check('A5 feedView: sin reorden propio (sin .sort() sobre tiles)', !fnSrc('feedView').includes('tiles.sort') && !fnSrc('feedView').includes('.sort((a, b)'));
check('A6 feedView: posteos del perfil + fallback publicados', fnSrc('feedView').includes('posts_count') && fnSrc('feedView').includes('published.length'));
check('A7 feedView: consultas desde /api/weekly-report', fnSrc('feedView').includes("api.get('/api/weekly-report')") && fnSrc('feedView').includes('totals.comments'));
check('A8 feedView: seguidores del perfil con fallback /api/stats/ig', fnSrc('feedView').includes("api.get('/api/stats/ig')") && fnSrc('feedView').includes('followers'));
check('A9 feedView: sello AL DÍA por pzFeedAlDia (publicado hoy)', fnSrc('feedView').includes('pzFeedAlDia(allPosts, tz)') && fnSrc('pzFeedAlDia').includes("status !== 'published'"));
check('A10 feedView: cero números demo del mock (128 / 1.240)', !fnSrc('feedView').includes('128') && !fnSrc('feedView').includes('1.240') && !fnSrc('feedView').includes('1,240'));
check('A11 feedView: copy del mock (cabecera + nota)', fnSrc('feedView').includes('Esto ven hoy tus clientes en Instagram') && fnSrc('feedView').includes('Tocá cualquier posteo para ver cómo rindió.'));
check('A12 feedView: cofre #scfVault para el detalle de escritorio', fnSrc('feedView').includes('scfVault') && fnSrc('feedView').includes('weekCardHTML('));
check('A13 feedView: revalidación IG al abrir (borrado desaparece)', fnSrc('feedView').includes('hfLiveRevalidateFeed()'));
check('A14 bindFeed: detalle + gestos + capa + lightbox + highlight', fnSrc('bindFeed').includes('hfDetailBind(root)') && fnSrc('bindFeed').includes('hfFeedGesturesBind(root)') && fnSrc('bindFeed').includes('bindScfMinis(root)') && fnSrc('bindFeed').includes('lbOpenFrom(el)') && fnSrc('bindFeed').includes('hfFeedHighlightApply()'));
check('A15 «Ver en el feed»: botón solo en publicados', fnSrc('hfDetailHTML').includes("String(p.status) === 'published'") && fnSrc('hfDetailHTML').includes('data-hfd-act="verfeed"') && fnSrc('hfDetailHTML').includes('Ver en el feed'));
check('A16 «Ver en el feed»: ES + EN en el botón verfeed (distinto del «Ver en el inicio»)', (() => { const i = appSrc.indexOf('data-hfd-act="verfeed"'); if (i < 0) return false; const s = appSrc.slice(Math.max(0, i - 120), i + 320); return s.includes('See it in the feed') && s.includes('Ver en el feed') && appSrc.includes('data-hfd-act="followers"'); })());
check('A17 «Ver en el feed»: acción cierra detalle y va a #/app/feed con highlight', appSrc.includes("name === 'verfeed'") && appSrc.includes('HF_FEED_HIGHLIGHT') && appSrc.includes("location.hash = '#/app/feed'"));
check('A18 detalle: foto en grande usa openLightbox', fnSrc('hfDetailWire').includes('openLightbox(') && fnSrc('hfDetailWire').includes('.hf-d-media'));
check('A19 detalle: el video sigue con play/pausa (no lo rompe el lightbox)', fnSrc('hfDetailWire').includes("q('.hf-d-media video')"));
check('A20 «Ver en el inicio» (vista de seguidor) intacto', fnSrc('hfDetailHTML').includes("data-hfd-act=\"followers\"") && appSrc.includes("if (name === 'followers') { hfFollowerOpen(post); return; }"));
check('A21 revalidación IG cubre #/app/feed además de Inicio', fnSrc('hfLiveRevalidateFeed').includes("#/app/feed"));
check('A22 espejo vivo parchea #feedView cuando está montada', fnSrc('hfLiveApply').includes("document.getElementById('feedView')"));
check('A23 puerta en Hoy: el seg «Mi feed» es un enlace real a #/app/feed (RE-BASE R1 sobre v794: reemplaza la puerta pzFeedEntryHTML)', appSrc.includes('data-pz-hoy-view="feed"') && appSrc.includes('href="#/app/feed"'));
check('A24 sin server.js nuevo (cero endpoints de Feed)', !serverSrc.includes('feedView') && !serverSrc.includes('pzFeed') && !serverSrc.includes('/api/feed'));
check('A24b appShell: Feed abre sin checklist arriba (como el mock)', appSrc.includes("tab === 'feed') ? '' : setupChecklistHtml(undefined)"));

console.log('== Parte A2: estático — CSS ==');
check('A25 CSS: cabecera .pz-feed-head + stats .pz-feed-stats', cssSrc.includes('.pz-feed-head') && cssSrc.includes('.pz-feed-stats'));
check('A26 CSS: sello .pz-feed-aldia', cssSrc.includes('.pz-feed-aldia'));
check('A27 CSS: grilla de Feed transparente como Inicio', cssSrc.includes('#feedView .hf-grid'));
check('A28 CSS: destacado .pz-feed-flash con keyframes', cssSrc.includes('.pz-feed-flash') && cssSrc.includes('@keyframes pz-feed-flash'));
const flashBlock = cssSrc.slice(cssSrc.indexOf('@keyframes pz-feed-flash'), cssSrc.indexOf('@keyframes pz-feed-flash') + 200);
check('A29 destacado SOLO brillo: sin scale ni transform', !flashBlock.includes('scale(') && !flashBlock.includes('transform'));
check('A30 destacado respeta reduced-motion', cssSrc.includes('prefers-reduced-motion:reduce') && cssSrc.slice(cssSrc.indexOf('pz-feed-flash')).includes('animation:none'));

// ---------- Parte B: VM — formato, AL DÍA y orden literal ----------
console.log('== Parte B: VM — formato, AL DÍA y orden literal ==');
const FIXED_NOW = Date.UTC(2026, 10, 8, 12, 0, 0); // dom 2026-11-08 12:00 UTC
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
}
const sandbox = {
  console, Date: FakeDate, Math, JSON,
  pcTz: () => 'UTC',
  pcParseDate: (s) => { if (!s) return null; const d = new Date(String(s).replace(' ', 'T') + 'Z'); return isNaN(d) ? null : d; },
  schedDayKeyOf: (d) => { try { return d.toISOString().slice(0, 10); } catch (e) { return ''; } },
  schedYmdToDate: (ymd) => { const d = new Date(String(ymd) + 'T00:00:00Z'); return isNaN(d) ? null : d; },
};
vm.createContext(sandbox);
const runInVm = (src) => vm.runInContext(src, sandbox);
for (const n of ['hfIgShortcode', 'hfFeedSortKey', 'hfCmpDescKey', 'homeGridCompose', 'pzFeedFmtN', 'pzFeedAlDia']) {
  const s = fnSrc(n);
  check('B0 función extraíble: ' + n, s.length > 50, 'largo ' + s.length);
  if (s) runInVm(s + '\nthis.' + n + ' = ' + n + ';');
}
check('B1 fmtN: 9999 completo, 12400 abreviado ES', typeof sandbox.pzFeedFmtN === 'function' && sandbox.pzFeedFmtN(9999, false) === '9.999' && sandbox.pzFeedFmtN(12400, false) === '12,4 mil' && sandbox.pzFeedFmtN(12400, true) === '12.4K');
check('B2 AL DÍA: true con publicado hoy', typeof sandbox.pzFeedAlDia === 'function' && sandbox.pzFeedAlDia([{ status: 'published', published_at: '2026-11-08 09:00:00' }], 'UTC') === true);
check('B3 AL DÍA: false sin publicado hoy (ayer no vale)', typeof sandbox.pzFeedAlDia === 'function' && sandbox.pzFeedAlDia([{ status: 'published', published_at: '2026-11-07 19:30:00' }], 'UTC') === false);
check('B4 AL DÍA: false con programado hoy sin salir', typeof sandbox.pzFeedAlDia === 'function' && sandbox.pzFeedAlDia([{ status: 'scheduled', scheduled_at: '2026-11-08 19:30:00' }], 'UTC') === false);
{
  const S1 = { id: 11, status: 'scheduled', media_type: 'image', image_path: 's1.jpg', caption: 'hoy 15', scheduled_at: '2026-11-08 15:00:00', created_at: '2026-11-07 10:00:00' };
  const S2 = { id: 12, status: 'scheduled', media_type: 'image', image_path: 's2.jpg', caption: 'hoy 19', scheduled_at: '2026-11-08 19:00:00', created_at: '2026-11-07 10:00:00' };
  const S3 = { id: 13, status: 'scheduled', media_type: 'image', image_path: 's3.jpg', caption: 'futuro', scheduled_at: '2026-11-13 19:00:00', created_at: '2026-11-07 10:00:00' };
  const P1 = { id: 21, status: 'published', media_type: 'image', image_path: 'p1.jpg', caption: 'ayer', published_at: '2026-11-07 10:00:00', created_at: '2026-11-06 10:00:00' };
  const P2 = { id: 22, status: 'published', media_type: 'image', image_path: 'p2.jpg', caption: 'viejo', published_at: '2026-10-01 10:00:00', created_at: '2026-09-30 10:00:00' };
  const P3 = { id: 23, status: 'published', media_type: 'image', image_path: 'p3.jpg', caption: 'fijado', published_at: '2026-10-15 10:00:00', pinned: true, pinned_at: '2026-10-20 10:00:00', created_at: '2026-10-14 10:00:00' };
  const R1 = { img: 'r1.jpg', type: 'image', taken_at: Date.UTC(2026, 8, 1) / 1000, shortcode: 'r1' };
  const tiles = (typeof sandbox.homeGridCompose === 'function') ? sandbox.homeGridCompose({
    upcoming: [{ p: S1, ymd: '2026-11-08' }, { p: S2, ymd: '2026-11-08' }, { p: S3, ymd: '2026-11-13' }],
    published: [P1, P2, P3], recents: [R1], ritual: null, all: [S1, S2, S3, P1, P2, P3],
  }) : [];
  const key = (t) => t.kind === 'oculta' ? 'oculta:' + t.post.id : t.kind === 'ig' ? 'ig:r1' : 'post:' + t.post.id;
  const got = tiles.map(key).join(' > ');
  check('B5 orden literal: oculta primero, fijado, no publicado, publicados DESC, IG último', tiles.length === 6 && got === 'oculta:11 > post:23 > post:12 > post:21 > post:22 > ig:r1', got);
  check('B6 el programado futuro (+5d) que no es próximo NO rinde como tile', !tiles.some((t) => t.post && t.post.id === 13 && t.kind === 'post'));
  check('B7 la carta del próximo lleva magia (clase en homeTileHTML, no escala)', appSrc.includes('hf-carta-magia') && cssSrc.includes('.hf-tile.hf-carta-magia'));
}

// ---------- Parte C: boot real ----------
console.log('== Parte C: boot real ==');
function req(method, p, body, ctype, cookie) {
  return new Promise((resolve) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: { ...(ctype ? { 'Content-Type': ctype } : {}), ...(cookie ? { Cookie: cookie } : {}) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ st: res.statusCode, txt: d, headers: res.headers })); });
    r.on('error', (e) => resolve({ st: 0, txt: 'ERR ' + e.message, headers: {} }));
    r.setTimeout(120000, () => { try { r.destroy(); } catch (e) {} resolve({ st: 0, txt: 'TIMEOUT', headers: {} }); });
    if (body) r.write(body);
    r.end();
  });
}
const j = (s) => { try { return JSON.parse(s); } catch (e) { return null; }; };
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    const r = await req('GET', '/api/version');
    if (r.st === 200) return j(r.txt);
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  return null;
}
async function joinUser(ig) {
  const r = await req('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
    Buffer.from(JSON.stringify({ kind: 'join', ig, device: 'probe' })), 'application/json');
  const b = j(r.txt);
  if (!b || !b.ok) throw new Error('join falló: ' + r.txt.slice(0, 200));
  const sc = r.headers['set-cookie'];
  const cookie = Array.isArray(sc) ? sc[0].split(';')[0] : String(sc || '').split(';')[0];
  return { cookie, userId: b.user_id };
}
const fmtDT = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
async function main() {
  const serverSrc2 = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
  const buildTree = (serverSrc2.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '?';
  console.log('árbol: ' + TREE + ' BUILD ' + buildTree);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rediseno-r2-'));
  const mediaDir = path.join(tmp, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmp, MEDIA_DIR: mediaDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    ADMIN_TOKEN: 'test-r2', OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const proc = spawn('node', ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  proc.stdout.on('data', (d) => { serverLog += d.toString(); });
  proc.stderr.on('data', (d) => { serverLog += d.toString(); });
  try {
    const ver = await waitUp();
    check('C1 boot: /api/version responde el BUILD del árbol', !!ver && String(ver.version || ver.build || '').includes(buildTree), ver ? JSON.stringify(ver).slice(0, 120) : 'sin respuesta');
    const u1 = await joinUser('feed-r2');
    check('C2 join trial ok', !!u1.cookie && !!u1.userId);
    const now = new Date();
    const todayPub = fmtDT(now);
    const seed = new DatabaseSync(path.join(tmp, 'posta.db'));
    const ins = (st, img, cap, pub, sched, pin) => seed.prepare(
      `INSERT INTO posts (user_id, image_path, caption, status, media_type, published_at, scheduled_at, pinned, pinned_at) VALUES (?, ?, ?, ?, 'image', ?, ?, ?, ?)`
    ).run(u1.userId, img, cap, st, pub, sched, pin ? 1 : 0, pin ? '2026-11-01 10:00:00' : '');
    const idHoy = Number(ins('published', 'hoy.jpg', 'publicado hoy', todayPub, null, false).lastInsertRowid);
    const idAyer = Number(ins('published', 'ayer.jpg', 'publicado ayer', fmtDT(new Date(now.getTime() - 86400000)), null, false).lastInsertRowid);
    const idPin = Number(ins('published', 'pin.jpg', 'fijado', fmtDT(new Date(now.getTime() - 5 * 86400000)), null, true).lastInsertRowid);
    const idSched = Number(ins('scheduled', 'sched.jpg', 'programado hoy', null, fmtDT(new Date(now.getTime() + 3 * 3600000)), false).lastInsertRowid);
    const idFut = Number(ins('scheduled', 'fut.jpg', 'futuro', null, fmtDT(new Date(now.getTime() + 2 * 86400000)), false).lastInsertRowid);
    const insM = (id, likes, comments, saved) => seed.prepare(
      `INSERT INTO post_metrics (post_id, reach, likes, comments, saved, fetched_at) VALUES (?, 100, ?, ?, ?, datetime('now'))`
    ).run(id, likes, comments, saved);
    insM(idHoy, 96, 14, 5);
    insM(idAyer, 61, 8, 3);
    insM(idPin, 40, 2, 1);
    seed.close();
    const posts = j((await req('GET', '/api/posts', null, null, u1.cookie)).txt);
    check('C3 /api/posts: trae los 5 sembrados', Array.isArray(posts) && posts.length >= 5, Array.isArray(posts) ? 'n=' + posts.length : 'no array');
    const wr = j((await req('GET', '/api/weekly-report', null, null, u1.cookie)).txt);
    check('C4 /api/weekly-report: comentarios contados = 14+8+2 = 24', !!wr && wr.totals && wr.totals.comments === 24, wr ? JSON.stringify(wr.totals) : 'sin respuesta');
    const hp = j((await req('GET', '/api/home/profile', null, null, u1.cookie)).txt);
    check('C5 /api/home/profile: responde ok', !!hp && hp.ok === true, hp ? JSON.stringify(hp).slice(0, 120) : 'sin respuesta');
    const st = j((await req('GET', '/api/stats/ig', null, null, u1.cookie)).txt);
    check('C6 /api/stats/ig: responde con followers numérico', !!st && typeof st.followers === 'number', st ? JSON.stringify(st).slice(0, 120) : 'sin respuesta');
    const servedApp = (await req('GET', '/app.js')).txt;
    check('C7 servido: app.js trae feedView + verfeed', servedApp.includes('async function feedView()') && servedApp.includes('data-hfd-act="verfeed"'));
    check('C8 servido: app.js trae la puerta «Mi feed» en Hoy', servedApp.includes('data-pz-hoy-view="feed"') && servedApp.includes('href="#/app/feed"'));
    const servedCss = (await req('GET', '/styles.css')).txt;
    check('C9 servido: styles.css trae pz-feed-flash', servedCss.includes('pz-feed-flash') && servedCss.includes('@keyframes pz-feed-flash'));
    const idx = (await req('GET', '/')).txt;
    check('C10 servido: index.html sirve la app', idx.includes('app.js'));
  } finally {
    try { proc.kill('SIGTERM'); } catch (e) {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nTOTAL: ${PASS} ok / ${FAIL} fallos${FAIL ? ' — ' + failed.join(' | ') : ''}`);
  process.exit(FAIL ? 1 : 0);
}
main().catch((e) => { console.log('ERROR: ' + (e && e.stack || e)); process.exit(2); });
