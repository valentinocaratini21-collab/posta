// test-frente3c-feed.js — Frente 3 · suma 2: SEGUNDA TANDA DEL FEED.
// Ítem 1: reels vivos (preview muda en loop SOLO con press-and-hold, sin
//         autoplay, preload none, la fuente es el <video> vigente).
// Ítem 2: chapita de programación «🕐 vie 31 · 18:00» solo en futuros
//         programados, desde el scheduled_at real, ES/EN.
// Ítem 3: hoja de acciones en futuros (Editar · Frenar · Reprogramar)
//         con precedencia de gestos documentada: FUTURO → hoja (600ms);
//         reel NO futuro → preview (350ms). El tap no cambia.
// Ítem 4: la semana «cae» en la grilla una sola vez por generación
//         (marca localStorage semana+huella), con prefers-reduced-motion.
// Uso: node test-frente3c-feed.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

// ---------- Parte 1: bloque HOME_FEED extraído (puro, como test-v331) ----------
console.log('— frente3c: HOME_FEED extraído (chapita + tiles)');
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
ok(a > 0 && b > a, 'bloque HOME_FEED delimitado');
const mkSandbox = (lang) => {
  const sb = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (p) => p,
    pcTz: () => 'America/Argentina/Buenos_Aires',
    pcParseDate: (s0) => {
      const s = String(s0 || '');
      if (!s) return null;
      let x = s.replace(' ', 'T');
      if (s.length !== 16 && !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z';
      const d = new Date(x);
      return isNaN(d) ? null : d;
    },
    ME: lang ? { lang } : undefined,
  };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b), sb);
  return sb;
};
const es = mkSandbox(null);
const en = mkSandbox('en');
ok(typeof es.hfChipText === 'function' && typeof es.homeTileHTML === 'function', 'hfChipText + homeTileHTML cargan en el bloque puro');
// 2026-07-31T21:00Z = viernes 31, 18:00 en Buenos Aires.
ok(es.hfChipText('2026-07-31T21:00:00.000Z') === 'vie 31 · 18:00', `ES: «vie 31 · 18:00» (vino «${es.hfChipText('2026-07-31T21:00:00.000Z')}»)`);
ok(en.hfChipText('2026-07-31T21:00:00.000Z') === 'fri 31 · 18:00', `EN: «fri 31 · 18:00» (vino «${en.hfChipText('2026-07-31T21:00:00.000Z')}»)`);
// 2026-10-31T21:00Z = sábado 31, 18:00 en Buenos Aires.
ok(es.hfChipText('2026-10-31T21:00:00.000Z') === 'sáb 31 · 18:00', 'ES: «sáb 31 · 18:00» (sábado localizado)');
ok(en.hfChipText('2026-10-31T21:00:00.000Z') === 'sat 31 · 18:00', 'EN: «sat 31 · 18:00»');
ok(es.hfChipText('') === '' && es.hfChipText(null) === '' && es.hfChipText('basura') === '', 'sin fecha real o inválida: sin chapita (nada inventado)');
// La hora sale de LA fecha del posteo, no de una constante:
ok(es.hfChipText('2026-07-31T12:30:00.000Z') === 'vie 31 · 09:30', 'la hora se calcula del scheduled_at (09:30 BA desde 12:30Z)');

const P = (id, status, extra) => Object.assign({ id, status, media_type: 'image', image_path: '/media/p' + id + '.jpg' }, extra || {});
const tileSched = es.homeTileHTML({ kind: 'post', post: P(7, 'scheduled', { scheduled_at: '2026-07-31T21:00:00.000Z' }), day: '2026-07-31', isNew: false }, 0);
ok(tileSched.includes('hf-chip') && tileSched.includes('🕐 vie 31 · 18:00'), 'tile futura programada: chapita con su fecha real');
ok(!tileSched.includes('hf-new'), 'tile programada: sin pill NUEVO (la chapita es la única señal)');
ok(tileSched.includes('data-status="scheduled"') && tileSched.includes('data-sched-at="2026-07-31T21:00:00.000Z"'), 'tile programada: data-status/data-sched-at para los gestos');
const tilePub = es.homeTileHTML({ kind: 'post', post: P(8, 'published', { published_at: '2026-07-20T15:00:00.000Z' }), day: null, isNew: false }, 1);
ok(!tilePub.includes('hf-chip'), 'tile publicada: sin chapita');
const tileDraft = es.homeTileHTML({ kind: 'post', post: P(9, 'draft'), day: '2026-08-01', isNew: true }, 2);
ok(!tileDraft.includes('hf-chip') && tileDraft.includes('hf-new'), 'tile borrador: sin chapita (no está programada), su NUEVO de siempre');
const tileReel = es.homeTileHTML({ kind: 'post', post: P(10, 'published', { media_type: 'video', image_path: '/media/r10.mp4', published_at: '2026-07-20T15:00:00.000Z' }), day: null, isNew: false }, 0);
ok(tileReel.includes('data-hf-reel="1"') && tileReel.includes('preload="none"'), 'tile de reel: <video> vigente marcado, preload="none" (carga con el gesto)');
ok(!tileReel.includes('autoplay'), 'tile de reel: SIN autoplay');
ok(tileReel.includes('loop') && tileReel.includes('muted') && tileReel.includes('playsinline'), 'tile de reel: loop + muted + playsinline');
ok(!tileReel.includes('hf-chip'), 'reel publicado: sin chapita');
const tileReelFut = es.homeTileHTML({ kind: 'post', post: P(11, 'scheduled', { media_type: 'video', image_path: '/media/r11.mp4', scheduled_at: '2026-07-31T21:00:00.000Z' }), day: '2026-07-31', isNew: false }, 1);
ok(tileReelFut.includes('hf-chip') && tileReelFut.includes('data-hf-reel="1"'), 'reel FUTURO: chapita + video (la hoja manda por precedencia, ver Parte 2)');
const tileFall = es.homeTileHTML({ kind: 'post', post: P(12, 'draft'), day: '2026-08-03', isNew: true, fall: true, fallDelay: 90 }, 0);
ok(tileFall.includes('hf-fall') && tileFall.includes('--hfd:90ms'), 'tile marcada por hfFallMark: clase hf-fall + delay en cascada');
const tileNoFall = es.homeTileHTML({ kind: 'post', post: P(13, 'draft'), day: '2026-08-03', isNew: true }, 1);
ok(!tileNoFall.includes('hf-fall'), 'tile sin marca: sin animación de caída');

// ---------- Parte 2: wiring estático de gestos / hoja / reprogramación ----------
console.log('— frente3c: wiring de gestos y hoja de acciones');
for (const fn of ['hfFallMark', 'hfIsEn', 'hfFeedGesturesBind', 'hfOpenActionsSheet', 'hfActionsAct', 'hfReschedQuotaOk', 'hfReschedule', 'hfChipText']) {
  ok(count(APP, 'function ' + fn + '(') === 1, `${fn}: definida exactamente 1 vez`);
}
ok(count(APP, 'hfFeedGesturesBind(document.getElementById(\'inicioView\'))') === 1, 'bindInicio cablea hfFeedGesturesBind sobre #inicioView');
ok(count(APP, 'try { hfFallMark(tiles); }') === 1, 'inicioView llama hfFallMark(tiles) tras componer');
// Precedencia documentada en asserts: futuro → hoja 600ms ANTES que preview 350ms en el código.
const g0 = APP.indexOf('function hfFeedGesturesBind');
const gBody = APP.slice(g0, APP.indexOf('/* ===== /(Frente 3 · suma 2)', g0));
ok(APP.slice(Math.max(0, g0 - 4200), g0).includes('REGLA DE PRECEDENCIA'), 'la regla de precedencia está documentada junto al binder');
ok(gBody.indexOf('if (isFuture)') > -1 && gBody.indexOf('if (isFuture)') < gBody.indexOf('else if (video)'), 'precedencia: la rama FUTURO se evalúa antes que la preview de reel');
ok(gBody.includes('}, 600);') && gBody.includes('hfOpenActionsSheet(tile)'), 'futuro: hold de 600ms abre la hoja de acciones');
ok(gBody.includes('}, 350);') && gBody.includes('video.play()') && gBody.includes('video.muted = true') && gBody.includes('video.loop = true'), 'reel no futuro: hold de 350ms reproduce preview muda en loop');
ok(gBody.includes('video.pause()'), 'al soltar: la preview se detiene (pause)');
ok(gBody.includes("'pointerup', 'pointercancel', 'pointerleave'"), 'la preview se detiene en pointerup/cancel/leave');
ok(gBody.includes('> 10') && gBody.includes('pointermove'), 'movimiento >10px cancela el hold (el scroll no se rompe)');
ok(gBody.includes("addEventListener('click'") && gBody.includes('_hfHoldAt') && gBody.includes('}, true);'), 'click post-hold suprimido en captura (el tap común no se toca)');
const sheet = APP.slice(APP.indexOf('function hfOpenActionsSheet'), APP.indexOf('function hfActionsAct'));
ok(sheet.includes('pcsheet-backdrop') && sheet.includes('pcsheet'), 'la hoja reusa el sistema vigente (.pcsheet-backdrop/.pcsheet)');
ok(sheet.includes('data-hf-act="edit"') && sheet.includes('data-hf-act="hold"') && sheet.includes('data-hf-act="resched"'), 'la hoja trae Editar · Frenar · Reprogramar');
ok(sheet.includes('type="datetime-local"') && sheet.includes('isoToLocalInput'), 'reprogramar: datetime-local precargado con la fecha actual (isoToLocalInput vigente)');
const acts = APP.slice(APP.indexOf('function hfActionsAct'), APP.indexOf('async function hfReschedQuotaOk'));
ok(acts.includes("pcHold(id)"), 'Frenar: el pcHold vigente (PATCH unschedule)');
ok(acts.includes('scfOpenPop(tile, true)') && acts.includes('edit-cap'), 'Editar: tarjeta vigente del cofre fijada en el feed + su editor (sin salir del feed)');
const resc = APP.slice(APP.indexOf('async function hfReschedule'), APP.indexOf('/* ===== /(Frente 3 · suma 2) FEED VIVO ===== */'));
ok(resc.includes("api.patch('/api/posts/' + encodeURIComponent(id), { scheduled_at: iso })"), 'Reprogramar: PATCH scheduled_at vigente');
ok(resc.includes('new Date(v)') && resc.includes('d.toISOString()'), 'Reprogramar: conversión del input como el flujo vigente (data-revwhen)');
ok(resc.includes('isPlanLimitErr(e)') && resc.includes('planLimitModal(e)'), 'Reprogramar: 403 plan_limit del servidor → planLimitModal');
const quota = APP.slice(APP.indexOf('async function hfReschedQuotaOk'), APP.indexOf('async function hfReschedule'));
ok(quota.includes('schedMondayOf') && quota.includes('quotaModal(') && quota.includes("api.get('/api/quota')"), 'Reprogramar: chequeo de cupo de la semana DESTINO con quotaModal');
ok(quota.includes('curDay >= tMon && curDay <= tSun'), 'Reprogramar dentro de su propia semana: no cambia el conteo (no se auto-bloquea)');
const fall = APP.slice(APP.indexOf('function hfFallMark'), APP.indexOf('function hfIsEn'));
ok(fall.includes("'posty_hf_fall_' + wk") && fall.includes('schedMondayOf(t.day)') && fall.includes('localStorage'), 'caída: marca localStorage por semana (lunes) + huella de ids');
ok(fall.includes("t.post.status !== 'draft' && t.post.status !== 'scheduled'"), 'caída: solo tiles de la semana (borradores/programados), nunca publicados');
// Sin autoplay en NINGUNA tile del feed (home): el único autoplay del
// bundle es el del lightbox, que es una vista que el usuario abrió.
const tileSrc = APP.slice(APP.indexOf('function homeTileHTML'), APP.indexOf('function homeHeadHTML'));
ok(!tileSrc.includes('autoplay'), 'homeTileHTML: ningún autoplay en tiles');

// ---------- Parte 3: CSS ----------
console.log('— frente3c: CSS');
ok(CSS.includes('.hf-chip{') && CSS.includes('rgba(0,0,0,.55)'), '.hf-chip neutra estilo IG (sin colores de marca/estado)');
ok(CSS.includes('@keyframes hf-fall') && CSS.includes('.hf-tile.hf-fall{animation:hf-fall'), 'caída: keyframes hf-fall + clase');
ok(/@media \(prefers-reduced-motion:reduce\)\{\.hf-tile\.hf-fall\{animation:none\}\}/.test(CSS), 'caída: prefers-reduced-motion la apaga');
ok(CSS.includes('.hf-tile{touch-action:pan-y}'), 'tiles: touch-action pan-y (el scroll vertical manda)');
ok(CSS.includes('.hf-tile.pub img,.hf-tile.pub video{filter:brightness(.58) saturate(.85)}'), 'la atenuación .pub quedó INTACTA');
const chipCss = CSS.slice(CSS.indexOf('.hf-chip{'), CSS.indexOf('}', CSS.indexOf('.hf-chip{')));
ok(!/text-transform/i.test(chipCss), 'la chapita no fuerza mayúsculas');
ok(!/\.hf-(chip|fall)[^{]*\{[^}]*text-transform/i.test(CSS), 'nada de la suma 2 agrega text-transform sobre tiles/captions');

// ---------- Parte 4: boot + estáticos servidos ----------
console.log('— frente3c: boot');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-f3c-'));
const PORT = 18793;
const BASE = `http://127.0.0.1:${PORT}`;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    ok(await waitBoot(), 'server booteó');
    const v = await (await fetch(`${BASE}/api/version`)).json();
    ok(v.build === '20261023-v356', `BUILD_ID sigue en v356 (renumera el coordinador) — vino ${v.build}`);
    const js = await (await fetch(`${BASE}/app.js`)).text();
    ok(js.includes('hfOpenActionsSheet') && js.includes('hfChipText') && js.includes('hf-fall'), 'app.js servido trae la suma 2');
    const cssTxt = await (await fetch(`${BASE}/styles.css`)).text();
    ok(cssTxt.includes('.hf-chip{') && cssTxt.includes('@keyframes hf-fall'), 'styles.css servido trae la suma 2');
    // Un posteo programado real guarda su fecha: la chapita se alimenta de acá.
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'f3c@example.com', password: 'test1234', business_name: 'Test F3C' }),
    });
    const cookie = (rr.headers.getSetCookie ? rr.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    ok(rr.status === 200 || rr.status === 201, `registro ok (${rr.status})`);
    const cr = await fetch(`${BASE}/api/posts`, {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_path: '/media/x.jpg', caption: 'hola', scheduled_at: '2026-10-30T21:00:00.000Z', media_type: 'image' }),
    });
    const crj = await cr.json().catch(() => ({}));
    ok(cr.status === 200 && crj.ok !== false, `crear programado ok (${cr.status})`);
    // Verificación en la DB (como test-v331): las lecturas API filtran
    // needs_review — el lint vigente marca la imagen de prueba
    // inexistente; comportamiento baseline, ajeno a esta suma.
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const mine = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').get(crj.id);
    ok(!!mine && mine.status === 'scheduled' && String(mine.scheduled_at || '').startsWith('2026-10-30'), 'el posteo programado persiste su scheduled_at real (fuente de la chapita)');
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
  }
  console.log(fails ? `\n✗ ${fails}/${total} FALLOS` : `\n✓ ${total}/${total} OK`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
