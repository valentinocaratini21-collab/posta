'use strict';
/* LOTE VIDEO-VIVO — ningún video se muestra sin su imagen en la app, y
   el reel de la tarjeta de hoy corre solo.
   A. Estáticos del mecanismo (servidor + cliente).
   B. Boot real: la portada nace por pieza a mano y por sesión; la
      proyección del cliente (GET /api/posts) rellena y PERSISTE la
      portada de un video viejo sin portada (la vía del operador para
      los vivos 695/742: ninguna operación manual, la primera lectura);
      un video cuyo archivo no existe sale SIN portada inventada; el
      feed del selector de Ads ofrece la portada, nunca el .mp4.
   C. Chromium (390px): la tarjeta héroe muestra el reel CORRIENDO
      (estado de reproducción comprobado), la celda de la grilla pinta
      la portada (imagen cargada, no blanco), la celda del video sin
      archivo rinde el respaldo de marca (no blanco) y no hay desborde. */
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name); console.log('  ✗', name, extra ? '— ' + extra : ''); }
}
function section(t) { console.log('\n== ' + t); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) throw new Error('timeout: ' + label); await sleep(250); }
}

async function main() {
  section('A · estáticos');
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const hoyFn = (app.split('function pzHoyCardHTML')[1] || '').split('\nfunction ')[0];
  ok('A1 · el héroe de hoy rinde el video con autoplay y su portada de poster',
    /data-pz-video-vivo="hero"/.test(hoyFn) && /autoplay muted loop playsinline preload="auto"/.test(hoyFn) && /poster=/.test(hoyFn));
  ok('A2 · el héroe ya no superpone el botón de play (se ve corriendo)',
    !/pz-hoy-hero-play/.test(hoyFn));
  const postsRoute = server.slice(server.indexOf("app.get('/api/posts'"), server.indexOf("app.get('/api/posts'") + 12000);
  ok('A3 · GET /api/posts garantiza la portada con el mecanismo de siempre',
    /asegurarCoverDeVideo\(p\)/.test(postsRoute));
  ok('A4 · la pieza a mano deriva la portada si el operador no la manda',
    /mt === 'video' && !coverPath/.test(server) && /asegurarCoverDeVideo\(\{ id: newId, media_type: 'video', image_path: imagePath/.test(server));
  ok('A5 · el video de sesión nace con portada',
    /if \(mt === 'video'\) \{ try \{ asegurarCoverDeVideo\(\{ id: newId/.test(server));
  const adsRoute = server.slice(server.indexOf("app.get('/api/ads/billetera/feed'"), server.indexOf("app.get('/api/ads/billetera/feed'") + 5000);
  ok('A6 · el feed de Ads trae cover_path y ofrece la portada como imagen',
    /cover_path/.test(adsRoute) && /r\.image_path = c/.test(adsRoute));
  ok('A7 · las superficies de la familia llevan poster (detalle, agenda, plan, aprobación, mi-zona)',
    (app.match(/poster="\$\{esc\(/g) || []).length >= 5, 'posters: ' + (app.match(/poster="\$\{esc\(/g) || []).length);
  ok('A8 · sin cambios de BUILD (lo estampa el liberador)',
    !/v1220/.test(server) && !/v1220/.test(app));

  section('B · boot real');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-'));
  const mediaDir = path.join(tmpDir, 'media'); fs.mkdirSync(mediaDir, { recursive: true });
  // Videos reales (el frame 0 es un patrón de color: la portada se puede verificar como imagen).
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=10:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(mediaDir, 'vv-reel.mp4')]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'smptebars=size=720x1280:rate=10:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(mediaDir, 'vv-viejo.mp4')]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=10:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(mediaDir, 'vv-sesion.mp4')]);
  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  const ADMIN = 'vv-admin-token';
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', d => { bootLog += d; });
  child.stderr.on('data', d => { bootLog += d; });
  const { DatabaseSync } = require('node:sqlite');
  let dbPath = path.join(tmpDir, 'posta.db');
  try {
    await waitFor(async () => { const r = await fetch(BASE + '/api/version'); return r.ok; }, 30000, 'boot');
    ok('B0 · el servidor levanta', true);
    // Registro de la dueña de la sandbox.
    const reg = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'duena-video@example.com', password: 'ClaveVideo123' }) });
    const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
    ok('B1 · registro de la dueña', reg.ok && !!cookie, 'status ' + reg.status);
    const me = await (await fetch(BASE + '/api/auth/me', { headers: { Cookie: cookie } })).json();
    const uid = me.user.id;
    const db = new DatabaseSync(dbPath);
    db.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?, ?, ?)').run(uid, '/media/vv-reel.mp4', 'video');
    db.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?, ?, ?)').run(uid, '/media/vv-sesion.mp4', 'video');
    // Formato de fecha de la puerta real del operador (espacio, sin Z):
    // con ISO-Z la fila queda fuera de la ventana de la agenda (date() de
    // SQLite no parsea la Z) — es el formato con el que nació el 742.
    const hoy2359 = new Date().toISOString().slice(0, 10) + ' 23:59:00';
    const maniana = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ');

    // B2 · nacimiento por pieza a mano SIN portada del operador (el caso del 742).
    const cp = await fetch(BASE + '/api/admin/posts/cargar-pieza?token=' + ADMIN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: uid, image_path: '/media/vv-reel.mp4', caption: 'El reel de hoy, en vivo', media_type: 'video', scheduled_at: hoy2359 }) });
    const cpJ = await cp.json().catch(() => ({}));
    ok('B2 · cargar-pieza acepta el video', cp.ok && cpJ.ok, JSON.stringify(cpJ).slice(0, 160));
    ok('B3 · la pieza nace CON portada derivada del propio video',
      !!(cpJ.post && String(cpJ.post.cover_path || '').endsWith('vv-reel-cover.jpg')), JSON.stringify(cpJ.post || {}).slice(0, 200));
    const coverFile = path.join(mediaDir, 'vv-reel-cover.jpg');
    ok('B4 · el archivo de portada existe y es un JPEG real',
      fs.existsSync(coverFile) && fs.readFileSync(coverFile)[0] === 0xFF && fs.readFileSync(coverFile)[1] === 0xD8);
    const idHoy = Number(cpJ.id);
    // El lint de la sandbox marca la pieza en revisión y la proyección
    // del cliente no muestra filas en revisión (needs_review=1). El 742
    // real vive con needs_review=0: se siembra ese estado, que es el
    // que esta suite audita (la revisión es ortogonal a este lote).
    db.prepare('UPDATE posts SET needs_review = 0 WHERE id = ?').run(idHoy);

    // B5 · nacimiento por sesión (otra semana: el cupo de video del plan es semanal).
    const otraSemana = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + ' 23:59:00';
    const sp = await fetch(BASE + '/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ image_path: '/media/vv-sesion.mp4', caption: 'Video nacido por sesión', media_type: 'video', scheduled_at: otraSemana }) });
    const spJ = await sp.json().catch(() => ({}));
    const idSesion = Number(spJ.id || spJ.post_id || 0);
    ok('B5 · el video de sesión se crea', sp.ok && idSesion > 0, 'status ' + sp.status + ' ' + JSON.stringify(spJ).slice(0, 140));
    const filaSesion = idSesion ? db.prepare('SELECT cover_path FROM posts WHERE id = ?').get(idSesion) : null;
    ok('B6 · y nace con la portada persistida', !!filaSesion && String(filaSesion.cover_path || '').endsWith('vv-sesion-cover.jpg'), JSON.stringify(filaSesion || {}));

    // B7 · video VIEJO sin portada (el caso del 695): la proyección lo rellena y lo persiste.
    const insViejo = db.prepare("INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, media_type, source, cover_path) VALUES (?, '/media/vv-viejo.mp4', 'Video viejo sin portada', ?, 'scheduled', 'video', 'pieza-mano', '')").run(uid, maniana);
    const idViejo = Number(insViejo.lastInsertRowid);
    const insFantasma = db.prepare("INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, media_type, source, cover_path) VALUES (?, '/media/vv-fantasma.mp4', 'Video sin archivo', ?, 'scheduled', 'video', 'pieza-mano', '')").run(uid, maniana);
    const idFantasma = Number(insFantasma.lastInsertRowid);
    const lista = await (await fetch(BASE + '/api/posts', { headers: { Cookie: cookie } })).json();
    const rowViejo = Array.isArray(lista) ? lista.find(p => Number(p.id) === idViejo) : null;
    const rowFantasma = Array.isArray(lista) ? lista.find(p => Number(p.id) === idFantasma) : null;
    const rowHoy = Array.isArray(lista) ? lista.find(p => Number(p.id) === idHoy) : null;
    ok('B7 · la proyección del cliente trae la portada del video de hoy', !!rowHoy && String(rowHoy.cover_path || '').endsWith('vv-reel-cover.jpg'), JSON.stringify(rowHoy || null).slice(0, 200));
    ok('B8 · la proyección RELLENA la portada del video viejo sin portada', !!rowViejo && String(rowViejo.cover_path || '').endsWith('vv-viejo-cover.jpg'), JSON.stringify(rowViejo || {}).slice(0, 160));
    const filaViejo = db.prepare('SELECT cover_path FROM posts WHERE id = ?').get(idViejo);
    ok('B9 · y queda PERSISTIDA (la vía del operador: la primera lectura, sin operación manual)',
      !!filaViejo && String(filaViejo.cover_path || '').endsWith('vv-viejo-cover.jpg'));
    ok('B10 · el video sin archivo sale SIN portada inventada (la superficie rinde su respaldo)',
      !!rowFantasma && String(rowFantasma.cover_path || '') === '', JSON.stringify(rowFantasma || {}).slice(0, 160));
    const coverResp = await fetch(BASE + '/media/vv-viejo-cover.jpg');
    ok('B11 · la portada rellenada se sirve como imagen', coverResp.ok && /image/.test(coverResp.headers.get('content-type') || ''));

    // B12 · el selector de Ads ofrece la portada, nunca el .mp4.
    db.prepare("UPDATE posts SET status = 'published', ig_media_id = '17900000000000001', published_at = datetime('now') WHERE id = ?").run(idHoy);
    const feed = await (await fetch(BASE + '/api/ads/billetera/feed', { headers: { Cookie: cookie } })).json();
    const feedRow = feed && Array.isArray(feed.posts) ? feed.posts.find(p => Number(p.post_id) === idHoy) : null;
    ok('B12 · el feed de Ads trae el video publicado', !!feedRow, JSON.stringify(feed).slice(0, 160));
    ok('B13 · y su imagen es la PORTADA (no el .mp4)', !!feedRow && String(feedRow.image_path || '').endsWith('vv-reel-cover.jpg'), feedRow ? String(feedRow.image_path) : '');
    db.close();

    section('C · Chromium 390px');
    let pw = null, exe = '';
    try { pw = require('/home/hatch/workspace/posty-stores/tools/node_modules/playwright-core'); } catch (e) {}
    const cand = '/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
    if (pw && fs.existsSync(cand)) exe = cand;
    if (pw && exe) {
      const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(async ({ email, password }) => {
        await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      }, { email: 'duena-video@example.com', password: 'ClaveVideo123' });
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.pzHoyCardHTML === 'function' && typeof window.homeTileHTML === 'function', null, { timeout: 20000 }).catch(() => {});
      const listo = await page.evaluate(() => typeof window.pzHoyCardHTML === 'function' && typeof window.homeTileHTML === 'function');
      ok('C1 · el bundle carga las funciones de render', listo);
      if (listo) {
        const render = await page.evaluate(async () => {
          const rows = await (await fetch('/api/posts')).json();
          const hoy = rows.find(p => String(p.image_path || '').includes('vv-reel'));
          const fantasma = rows.find(p => String(p.image_path || '').includes('vv-fantasma'));
          const host = document.createElement('div');
          host.style.width = '390px';
          host.innerHTML = window.pzHoyCardHTML(hoy, { hero: true, mode: 'auto' });
          document.body.appendChild(host);
          const grid = document.createElement('div');
          grid.innerHTML = window.homeTileHTML({ kind: 'post', post: hoy, ymd: String(hoy.scheduled_at || '').slice(0, 10) }, new Set(), new Map());
          document.body.appendChild(grid);
          const gridF = document.createElement('div');
          gridF.innerHTML = window.homeTileHTML({ kind: 'post', post: fantasma, ymd: String(fantasma.scheduled_at || '').slice(0, 10) }, new Set(), new Map());
          document.body.appendChild(gridF);
          return { hoyCover: hoy.cover_path, fantasmaCover: fantasma.cover_path };
        });
        ok('C2 · el payload en el navegador trae la portada', String(render.hoyCover || '').endsWith('vv-reel-cover.jpg'), JSON.stringify(render));
        // El reel CORRE SOLO: estado de reproducción comprobado.
        const playing = await page.waitForFunction(() => {
          const v = document.querySelector('video[data-pz-video-vivo="hero"]');
          return v && !v.paused && v.readyState >= 2 && v.currentTime > 0.05;
        }, null, { timeout: 15000 }).then(() => true).catch(() => false);
        const vstate = await page.evaluate(() => {
          const v = document.querySelector('video[data-pz-video-vivo="hero"]');
          return v ? { paused: v.paused, t: v.currentTime, rs: v.readyState, poster: v.getAttribute('poster') || '', autoplay: v.autoplay, muted: v.muted } : null;
        });
        ok('C3 · la tarjeta de hoy muestra el reel CORRIENDO SOLO', playing, JSON.stringify(vstate));
        ok('C4 · el video del héroe lleva la portada como poster', !!vstate && String(vstate.poster).endsWith('vv-reel-cover.jpg'), JSON.stringify(vstate));
        ok('C5 · sin botón de play superpuesto en el héroe', await page.evaluate(() => !document.querySelector('.pz-hoy-hero-media .pz-hoy-hero-play')));
        // La celda de la grilla pinta la portada (imagen cargada), no blanco.
        const tile = await page.evaluate(async () => {
          const img = document.querySelector('.hf-tile img[data-hf-cover]');
          if (img && !img.complete) await new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 4000); });
          const tileEl = document.querySelector('.hf-tile');
          return { has: !!img, nw: img ? img.naturalWidth : 0, src: img ? img.getAttribute('src') : '', tileBg: tileEl ? getComputedStyle(tileEl).backgroundColor : '' };
        });
        ok('C6 · la celda de la grilla muestra la PORTADA como imagen cargada', tile.has && tile.nw > 0 && String(tile.src).includes('vv-reel-cover.jpg'), JSON.stringify(tile));
        // El video sin archivo: el respaldo declarado del código es
        // __vidFb — la carta de marca (hf-tile-under: estrellita + el
        // texto del posteo) en el lugar del video que no cargó. Nunca
        // el blanco vacío ni un <img> apuntando al .mp4.
        await page.waitForFunction(() => {
          const tiles = document.querySelectorAll('.hf-tile');
          const el = tiles[tiles.length - 1];
          return el && !!el.querySelector('.hf-tile-under');
        }, null, { timeout: 8000 }).catch(() => {});
        const tileF = await page.evaluate(() => {
          const tiles = document.querySelectorAll('.hf-tile');
          const el = tiles[tiles.length - 1];
          if (!el) return null;
          const under = el.querySelector('.hf-tile-under');
          const imgMp4 = !!el.querySelector('img[src$=".mp4"]');
          return { under: !!under, texto: under ? under.textContent.trim().slice(0, 40) : '', imgMp4, videoVivo: !!el.querySelector('video') };
        });
        ok('C7 · la celda del video sin archivo rinde el respaldo de marca (__vidFb: carta con texto, no blanco)',
          !!tileF && tileF.under && !tileF.imgMp4 && !tileF.videoVivo, JSON.stringify(tileF));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 390);
        ok('C8 · 390px sin desborde horizontal', overflow <= 1, 'overflow ' + overflow);
        await page.screenshot({ path: path.join(os.tmpdir(), 'vv-heroe.png') }).catch(() => {});
      }
      await browser.close();
    } else {
      console.log('  (playwright no disponible: sección C no corrida)');
      ok('C0 · playwright disponible', false, 'no se encontró playwright-core/chromium');
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { if (child.exitCode === null) child.kill('SIGKILL'); } catch (e) {}
  }
  // Puerto libre después de matar el boot por su PID.
  const libre = await new Promise(res => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(PORT, '127.0.0.1', () => s.close(() => res(true))); });
  ok('B14 · el puerto del boot queda libre al cerrar', libre);
  console.log(`\nTOTAL: ${pass} ✓ · ${fail} ✗`);
  if (fails.length) console.log('Fallaron:', fails.join(' · '));
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('ERROR', e); process.exit(2); });
