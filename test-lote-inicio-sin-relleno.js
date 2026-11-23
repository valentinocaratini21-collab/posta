'use strict';
/* LOTE INICIO-SIN-RELLENO — muere la tarjeta «Tu semana ya está aprobada.
 * Posty se ocupa de publicarla.» Orden del dueño 22/11 22:24 con captura:
 * «Eliminar esto. Completamente de mas.»
 *
 * El mensaje «semana aprobada» vive en Inicio en DOS renderers del mismo
 * hecho (censo completo en ~/workspace/.lote-inicio-sin-relleno/CENSO.md):
 * la burbuja pzHoySpeechHTML (la tarjeta de la captura) y la línea
 * pzSemanaAprobadaHTML sobre la grilla. Mueren SOLO los estados «todo
 * bien, nada para hacer» (semana aprobada, con IG conectado); quedan
 * todos los estados accionables (invitado sin conexión, armar la
 * semana) y los que traen un hecho nuevo (el de hoy ya salió con su
 * hora; la semana en curso con su aviso de 30 min).
 *
 * A · Estática: las 4 frases-relleno (ES/EN × 2 superficies) están en la
 *     base y NO están en el release; funciones definidas 1 vez con sus
 *     llamadores; diff de árboles = solo app.js + esta suite.
 * B · VM (base y release): pzHoySpeechHTML y pzSemanaAprobadaHTML
 *     ejercitadas en TODOS sus estados — los dos que mueren dan el
 *     texto en la base y '' en el release; todos los demás dan lo
 *     mismo en ambos árboles.
 * C · Control (Chromium, árbol prístino, semana aprobada sembrada):
 *     Inicio muestra la tarjeta de la captura, palabra por palabra.
 * D · Release (Chromium): casa y cliente con la semana aprobada —
 *     Inicio sin la tarjeta ni su texto, sin fila ni línea, sin hueco
 *     (la altura de Hoy se cierra respecto del control); un cliente
 *     sin semana sigue viendo su superficie accionable («¿Armamos tu
 *     semana?»).
 *
 * El árbol prístino se busca en PZ_PRISTINE_DIR o en ../base (el scratch
 * del lote); sin él, el control y el diff se omiten con nota.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const PRISTINE = process.env.PZ_PRISTINE_DIR || path.resolve(ROOT, '..', 'base');
const HAY_BASE = fs.existsSync(path.join(PRISTINE, 'public', 'app.js'));

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 21511; p < 21611; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}

// Lunes de la semana corriente en la zona por defecto de albumMondayKey.
function mondayKeyBA() {
  const tz = 'America/Argentina/Buenos_Aires';
  const now = new Date();
  const ymd = now.toLocaleDateString('en-CA', { timeZone: tz });
  const wd = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[wd] || 0;
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
const fmtDT = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

function seedBootDir(dir, root) {
  const wk = mondayKeyBA();
  const mas36 = fmtDT(new Date(Date.now() + 36 * 3600 * 1000));
  const mas60 = fmtDT(new Date(Date.now() + 60 * 3600 * 1000));
  const ayer = fmtDT(new Date(Date.now() - 24 * 3600 * 1000));
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const dbm = require(${JSON.stringify(path.join(root, 'db.js'))});
    const db = dbm.db || dbm;
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('clave-prueba-1', 10);
    try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
    const insPost = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, scheduled_at, published_at, approval, week_key) VALUES (?, '/x.jpg', ?, ?, ?, ?, ?, ?)");
    function semanaAprobada(uid) {
      // Semana aprobada y nada para hacer: 2 programados APROBADOS
      // (mañana y pasado, nunca hoy), 0 pendientes, 1 publicado ayer.
      insPost.run(uid, 'Pieza de mañana', 'scheduled', ${JSON.stringify(mas36)}, null, 'approved', ${JSON.stringify(wk)});
      insPost.run(uid, 'Pieza de pasado', 'scheduled', ${JSON.stringify(mas60)}, null, 'approved', ${JSON.stringify(wk)});
      insPost.run(uid, 'Pieza de ayer', 'published', ${JSON.stringify(ayer)}, ${JSON.stringify(ayer)}, 'approved', ${JSON.stringify(wk)});
    }
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (12, 'casa@posty.example', ?)").run(hash);
    db.prepare("UPDATE users SET plan = 'free', plan_status = 'active', bambooty_shell = 1 WHERE id = 12").run();
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (12, 'Posty', 'community manager', 'amable', 'posty.communitymanager', 1)").run();
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (12, 'IGCASA', 'tok-falso')").run();
    semanaAprobada(12);
    const rc = db.prepare("INSERT INTO users (email, password_hash) VALUES ('dueno@coffee.example', ?)").run(hash);
    const uidC = Number(rc.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active', bambooty_shell = 0 WHERE id = ?").run(uidC);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run(uidC);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uidC);
    semanaAprobada(uidC);
    const r2 = db.prepare("INSERT INTO users (email, password_hash) VALUES ('nuevo@bakery.example', ?)").run(hash);
    const uidN = Number(r2.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active', bambooty_shell = 0 WHERE id = ?").run(uidN);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'Bakery Nueva', 'panaderia', 'amable', 'bakerynueva', 1)").run(uidN);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGNEW', 'tok-falso')").run(uidN);
    console.log('SEEDED casa=12 cliente=' + uidC + ' sinSemana=' + uidN + ' wk=' + ${JSON.stringify(wk)});
  `;
  const out = execFileSync('node', ['-e', seed], { cwd: root, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  return out.trim();
}

async function bootServer(dir, root) {
  const port = freePort();
  const proc = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, MEDIA_DIR: path.join(dir, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
  return { proc, port, base, up, log: () => log };
}
async function killBoot(b, nombre) {
  // PID exacto siempre; SIGTERM primero y SIGKILL de escalada: un boot
  // de esta app puede quedar girando y no atender el TERM (pasó en la
  // primera corrida: el zombie del control siguió sirviendo en su
  // puerto y contaminó la sección D).
  try { process.kill(b.proc.pid, 'SIGTERM'); } catch (e) {}
  let libre = false;
  for (let i = 0; i < 8 && !libre; i++) { await sleep(500); libre = portFree(b.port); }
  if (!libre) {
    try { process.kill(b.proc.pid, 'SIGKILL'); } catch (e) {}
    for (let i = 0; i < 8 && !libre; i++) { await sleep(500); libre = portFree(b.port); }
  }
  t(nombre + ': el boot muere por PID exacto y el puerto queda libre', libre);
}
// Guardia de identidad: el servidor levantado sirve el app.js del árbol
// que se está probando (la frase-relleno está si y solo si es el prístino).
async function guardiaIdentidad(b, esperaRelleno, nombre) {
  const js = await (await fetch(b.base + '/app.js')).text();
  const tiene = js.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.');
  t(nombre + ': el boot sirve el app.js del árbol correcto', tiene === esperaRelleno,
    'rellenoEnServido=' + tiene);
}
async function login(base, email) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'clave-prueba-1' }) });
  const ck = (r.headers.get('set-cookie') || '').split(';')[0];
  const i = ck.indexOf('=');
  return { ok: r.ok, cookie: ck, name: ck.slice(0, i), value: ck.slice(i + 1) };
}
function loadPw() {
  for (const p of ['/tmp/pw-boot/node_modules/playwright-core', path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { return require(p); } catch (e) {}
  }
  return null;
}
function chromiumExe() {
  const dir = path.join(os.homedir(), '.cache/ms-playwright');
  const fsx = fs.readdirSync(dir).filter((d) => d.startsWith('chromium') && !d.includes('headless'));
  for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
    const cand = path.join(dir, fsx[0], sub);
    if (fs.existsSync(cand)) return cand;
  }
  return '';
}
async function abrirInicio(browser, base, sesion) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: sesion.name, value: sesion.value, domain: '127.0.0.1', path: '/' }]);
  const page = await ctx.newPage();
  await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#inicioView', { timeout: 30000 }).catch(() => {});
  await sleep(3500);
  const data = await page.evaluate(() => ({
    texto: document.body.innerText || '',
    speechRow: !!document.querySelector('.pz-hoy-speech-row'),
    hfOk: !!document.getElementById('hfSemanaOk'),
    tira: !!document.getElementById('pzHoyTira'),
    grid: !!document.querySelector('.hf-grid'),
    hoyAlto: (() => { const el = document.getElementById('pzHoyAprobar'); return el ? Math.round(el.getBoundingClientRect().height) : -1; })(),
  }));
  return { ctx, page, data };
}

// ---- VM: extrae las dos funciones del bundle y las ejercita por estado.
function cargarFunciones(appJs) {
  const i1 = appJs.indexOf('function pzHoySpeechHTML(o) {');
  const i2 = appJs.indexOf('function pzHoySetView');
  const j1 = appJs.indexOf('function pzSemanaAprobadaState');
  const j2 = appJs.indexOf('function pzAcceptAllWeekMark');
  if (i1 < 0 || i2 < 0 || j1 < 0 || j2 < 0) throw new Error('no se encontraron las funciones');
  const ctx = {
    console,
    __guest: false,
    PROFILE: { ig_connected: 1 },
    esc: (s) => String(s),
    pzIc: () => '◉',
    pzIsPubReal: (p) => !!(p && p.status === 'published'),
    pzHoyHoraCorta: () => '21:24',
  };
  ctx.pzIsGuest = () => ctx.__guest;
  vm.createContext(ctx);
  vm.runInContext(appJs.slice(i1, i2), ctx);
  vm.runInContext(appJs.slice(j1, j2), ctx);
  return ctx;
}
function vmEstados(appJs, esRelease, etiqueta) {
  const ctx = cargarFunciones(appJs);
  const speech = (o) => ctx.pzHoySpeechHTML(Object.assign({ hoyPost: null, pendientes: 0, needOK: 0, schedSolo: 0, haySemana: false, en: false, manual: false, insight: '' }, o || {}));
  const hf = (en) => ctx.pzSemanaAprobadaHTML(!!en);
  const conectado = () => { ctx.__guest = false; ctx.PROFILE.ig_connected = 1; };
  const invSinIg = () => { ctx.__guest = true; ctx.PROFILE.ig_connected = 0; };

  conectado();
  const fEs = speech({ haySemana: true, en: false });
  const fEn = speech({ haySemana: true, en: true });
  if (esRelease) {
    t(etiqueta + ' VM9 burbuja semana-aprobada ES: NO se rinde', fEs === '', JSON.stringify(fEs).slice(0, 120));
    t(etiqueta + ' VM9 burbuja semana-aprobada EN: NO se rinde', fEn === '', JSON.stringify(fEn).slice(0, 120));
  } else {
    t(etiqueta + ' VM9 control: la burbuja de la captura EXISTE (ES)', fEs.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.'));
    t(etiqueta + ' VM9 control: la burbuja de la captura EXISTE (EN)', fEn.includes('Your week is approved. Posty takes care of publishing it.'));
  }
  invSinIg();
  t(etiqueta + ' VM8 invitado sin IG conserva su problema accionable (burbuja)',
    speech({ haySemana: true, en: false }).includes('conectalo: sin conexión, Posty no puede publicarla.'));
  conectado();
  t(etiqueta + ' VM7 semana en curso (autopilot) conserva su texto con el aviso de 30 min',
    speech({ haySemana: true, pendientes: 2, needOK: 0, en: false }).includes('salen solos a su hora'));
  invSinIg();
  t(etiqueta + ' VM6 pendientes del invitado sin IG conservan su texto accionable',
    speech({ haySemana: true, pendientes: 2, needOK: 0, en: false }).includes('conectalo: sin conexión no sale ninguno'));
  conectado();
  t(etiqueta + ' VM10 sin semana: la superficie de armar sigue',
    speech({ haySemana: false, en: false }).includes('¿Armamos tu semana?'));
  t(etiqueta + ' VM1 el de hoy ya salió: sigue con su hora real',
    speech({ hoyPost: { status: 'published', approval: 'approved', published_at: '2026-11-22 21:24:00' }, haySemana: true, en: false }).includes('El de hoy ya salió'));
  t(etiqueta + ' VM2 borrador: sigue sin burbuja', speech({ hoyPost: { status: 'draft' }, haySemana: true, en: false }) === '');
  t(etiqueta + ' VM3 programado que sale solo: sigue sin burbuja',
    speech({ hoyPost: { status: 'scheduled', approval: 'pending' }, haySemana: true, manual: false, en: false }) === '');
  t(etiqueta + ' VM5 pendientes con needOK: sigue sin burbuja',
    speech({ haySemana: true, pendientes: 2, needOK: 2, en: false }) === '');

  conectado();
  const hEs = hf(false);
  const hEn = hf(true);
  if (esRelease) {
    t(etiqueta + ' VM12 línea hf semana-aprobada ES: NO se rinde', hEs === '', JSON.stringify(hEs).slice(0, 120));
    t(etiqueta + ' VM12 línea hf semana-aprobada EN: NO se rinde', hEn === '', JSON.stringify(hEn).slice(0, 120));
  } else {
    t(etiqueta + ' VM12 control: la línea hf de la semana aprobada EXISTE (ES)', hEs.includes('Tu semana está aprobada. Posty se ocupa de publicarla.'));
    t(etiqueta + ' VM12 control: la línea hf de la semana aprobada EXISTE (EN)', hEn.includes('Your week is approved. Posty will take care of publishing it.'));
  }
  invSinIg();
  t(etiqueta + ' VM11 línea hf del invitado sin IG conserva su problema accionable',
    hf(false).includes('conectá tu Instagram'));
  conectado();
  const wk = mondayKeyBA();
  const item = (approval) => [{ kind: 'post', post: { status: 'scheduled', week_key: wk, approval } }];
  t(etiqueta + ' VM13 la puerta del estado no cambió (aprobada → show, pendiente → no)',
    ctx.pzSemanaAprobadaState(item('approved'), wk).show === true
    && ctx.pzSemanaAprobadaState(item('pending'), wk).show === false);
}

(async () => {
  // ---------------------------------------------------------- A
  seccion('A · Estática — las frases-relleno fuera del release, la puerta intacta');
  const appRel = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const FRASES = [
    'Tu semana ya está aprobada. Posty se ocupa de publicarla.',
    'Your week is approved. Posty takes care of publishing it.',
    'Tu semana está aprobada. Posty se ocupa de publicarla.',
    'Your week is approved. Posty will take care of publishing it.',
  ];
  for (const f of FRASES) t('A release: fuera «' + f.slice(0, 44) + '…»', !appRel.includes(f));
  t('A release: pzHoySpeechHTML definida exactamente 1 vez', (appRel.match(/function pzHoySpeechHTML/g) || []).length === 1);
  t('A release: pzSemanaAprobadaHTML definida exactamente 1 vez', (appRel.match(/function pzSemanaAprobadaHTML/g) || []).length === 1);
  t('A release: los llamadores siguen (inicioView y el sync)',
    appRel.includes('pzHoySpeechHTML({ hoyPost: hoyPostR1') && appRel.includes('pzSemanaAprobadaHTML((typeof f3En'));
  t('A release: las variantes accionables del invitado siguen en el bundle',
    appRel.includes('conectalo: sin conexión, Posty no puede publicarla.')
    && appRel.includes('conectá tu Instagram: sin conexión no se publica.'));
  if (HAY_BASE) {
    const appBase = fs.readFileSync(path.join(PRISTINE, 'public', 'app.js'), 'utf8');
    for (const f of FRASES) t('A base: la frase EXISTE en el prístino «' + f.slice(0, 44) + '…»', appBase.includes(f));
    let difOut = '';
    try { difOut = execFileSync('diff', ['-rq', '--exclude=node_modules', PRISTINE, ROOT], { encoding: 'utf8' }); }
    catch (e) { difOut = e.stdout || ''; }
    const dif = difOut.split('\n').filter(Boolean)
      .map((l) => {
        let m = l.match(/^Files .*? and (.*?) differ$/);
        if (m) return m[1];
        m = l.match(/^Only in (.*?): (.*)$/);
        if (m) return path.join(m[1], m[2]);
        return l;
      });
    const rel = dif.map((l) => path.relative(ROOT, l)).sort();
    t('A: el diff de árboles es solo public/app.js + esta suite',
      JSON.stringify(rel) === JSON.stringify(['public/app.js', 'test-lote-inicio-sin-relleno.js'].sort()), rel.join(' · '));
  } else {
    console.log('  (sin árbol prístino al lado: controles de base omitidos)');
  }

  // ---------------------------------------------------------- B · VM
  seccion('B · VM — todos los estados del componente, en ambos árboles');
  vmEstados(appRel, true, 'B-release');
  if (HAY_BASE) vmEstados(fs.readFileSync(path.join(PRISTINE, 'public', 'app.js'), 'utf8'), false, 'B-base');
  else console.log('  (sin árbol prístino: VM de control omitida)');

  const pw = loadPw();
  t('playwright-core disponible', !!pw);
  if (!pw) { console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(mal ? 1 : 0); }
  const browser = await pw.chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });

  // ---------------------------------------------------------- C · control
  // Los DATA_DIR de los boots viven en el scratch, no en /tmp (tmpfs de
  // 512M compartido: la primera corrida murió por ENOSPC ajeno).
  const BOOTS = path.resolve(ROOT, '..', 'boots');
  fs.mkdirSync(BOOTS, { recursive: true });
  let altoControl = -1;
  if (HAY_BASE) {
    seccion('C · Control prístino — la captura del dueño, reproducida');
    const dirC = fs.mkdtempSync(path.join(BOOTS, 'ctl-'));
    console.log('  seed C:', seedBootDir(dirC, PRISTINE));
    const bC = await bootServer(dirC, PRISTINE);
    t('C0 el boot prístino levanta', bC.up, bC.log().slice(-200));
    await guardiaIdentidad(bC, true, 'C0');
    const sesC = await login(bC.base, 'casa@posty.example');
    t('C0 login de la casa', sesC.ok);
    const c = await abrirInicio(browser, bC.base, sesC);
    altoControl = c.data.hoyAlto;
    t('C1 la tarjeta de la captura ESTÁ en Inicio (texto exacto)',
      c.data.texto.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.'),
      c.data.texto.slice(0, 200));
    t('C1 la fila de la burbuja existe en el prístino', c.data.speechRow);
    await c.ctx.close();
    await killBoot(bC, 'C');
  } else {
    console.log('\n== C · Control omitido (sin árbol prístino) ==');
  }

  // ---------------------------------------------------------- D · release
  seccion('D · Release — semana aprobada sin narración; lo accionable, vivo');
  const dirD = fs.mkdtempSync(path.join(BOOTS, 'rel-'));
  console.log('  seed D:', seedBootDir(dirD, ROOT));
  const bD = await bootServer(dirD, ROOT);
  t('D0 el boot del release levanta', bD.up, bD.log().slice(-200));
  await guardiaIdentidad(bD, false, 'D0');
  const sesCasa = await login(bD.base, 'casa@posty.example');
  t('D0 login de la casa', sesCasa.ok);
  const sesCli = await login(bD.base, 'dueno@coffee.example');
  t('D0 login del cliente', sesCli.ok);
  const sesNuevo = await login(bD.base, 'nuevo@bakery.example');
  t('D0 login del cliente sin semana', sesNuevo.ok);

  for (const [nombre, ses] of [['casa', sesCasa], ['cliente', sesCli]]) {
    const r = await abrirInicio(browser, bD.base, ses);
    t('D ' + nombre + ': Inicio sano (vista, tira y grilla)', !!r.data.tira && !!r.data.grid && r.data.texto.length > 0);
    t('D ' + nombre + ': Inicio SIN la tarjeta ni su texto (ES)',
      !r.data.texto.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.')
      && !r.data.texto.includes('Tu semana está aprobada. Posty se ocupa de publicarla.'));
    t('D ' + nombre + ': sin fila de burbuja y sin línea hf (sin huecos en el DOM)', !r.data.speechRow && !r.data.hfOk);
    if (nombre === 'casa' && altoControl > 0 && r.data.hoyAlto > 0) {
      t('D casa: el espacio se cerró — Hoy mide menos que en el control',
        r.data.hoyAlto < altoControl - 25, 'control=' + altoControl + ' release=' + r.data.hoyAlto);
    }
    await r.ctx.close();
  }
  const n = await abrirInicio(browser, bD.base, sesNuevo);
  t('D sin-semana: la superficie accionable sigue («¿Armamos tu semana?»)',
    n.data.texto.includes('¿Armamos tu semana?'), n.data.texto.slice(0, 200));
  await n.ctx.close();
  await killBoot(bD, 'D');

  await browser.close();
  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
