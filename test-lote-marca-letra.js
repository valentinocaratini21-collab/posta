'use strict';
/* LOTE MARCA-LETRA — la palabra «Posty.» de la app se escribe con la misma
 * letra que usa el website arriba a la izquierda. Orden del dueño 22/11
 * 22:27 con captura del encabezado de la app: «Me gustaria que la letra de
 * "posty." sea la misma a la que esta en el website arriba a la izquierda.»
 *
 * LA VERDAD DE MARCA (verificada contra el sitio vivo y su árbol):
 * el website carga Montserrat 700;800 por Google Fonts en AMBOS índices
 * (css2?family=Inter:wght@400;700&family=Montserrat:wght@700;800), su
 * especificación de logo en texto es .logo{font-weight:800;
 * letter-spacing:-.02em} y su logo actual de arriba a la izquierda
 * (/posty-logo.png, 226×62) trae el wordmark «posty.» cuyas letras son
 * Montserrat ExtraBold (comparación de formas contra renders 700/800/900:
 * gana 800). La apertura de la app (.pzsp-word) ya vive en Montserrat 800.
 * En cambio las tres firmas «Posty.» de la app heredaban Nunito (la fuente
 * base de .bb-app/.app-shell) sin peso declarado.
 *
 * A · Estática: las tres reglas de la firma llevan la letra de marca en el
 *     release y no en el prístino; la línea de estado no se tocó; app.js e
 *     índices byte-idénticos; diff de árboles = styles.css + esta suite.
 * B · Control (prístino, Chromium, boot real): el «Posty.» del encabezado
 *     computa Nunito — el «antes» de la captura del dueño.
 * C · Release (Chromium, boot real): el «Posty.» del encabezado computa
 *     Montserrat 800 CARGADA (document.fonts.check), igual en la firma del
 *     chat; la línea de estado sigue en su letra de siempre.
 *
 * El árbol prístino se busca en PZ_PRISTINE_DIR o en ../base (el scratch
 * del lote); las capturas van a PZ_MARCA_SHOTS o al scratch.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const PRISTINE = process.env.PZ_PRISTINE_DIR || path.resolve(ROOT, '..', 'base');
const SHOTS = process.env.PZ_MARCA_SHOTS || path.resolve(ROOT, '..');
const HAY_BASE = fs.existsSync(path.join(PRISTINE, 'public', 'styles.css'));

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for ( let p = 21511; p < 21611; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}

function seedBootDir(dir, root) {
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const dbm = require(${JSON.stringify(path.join(root, 'db.js'))});
    const db = dbm.db || dbm;
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('clave-prueba-1', 10);
    try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
    try { db.exec('ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0'); } catch (e) {}
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (12, 'casa@posty.example', ?)").run(hash);
    db.prepare("UPDATE users SET plan = 'free', plan_status = 'active', bambooty_shell = 1 WHERE id = 12").run();
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (12, 'Posty', 'community manager', 'amable', 'posty.communitymanager', 1)").run();
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (12, 'IGCASA', 'tok-falso')").run();
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (12, '/x.jpg', 'Esto es Posty', 'published', datetime('now'))").run();
    const rg = db.prepare("INSERT INTO users (email, password_hash) VALUES ('invitado@posty.example', ?)").run(hash);
    const uidG = Number(rg.lastInsertRowid);
    db.prepare("UPDATE users SET is_guest = 1, plan = 'free', plan_status = 'active' WHERE id = ?").run(uidG);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'Invitado', 'cafe', 'amable', '', 0)").run(uidG);
    console.log('SEEDED casa=12 invitado=' + uidG);
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
  try { process.kill(b.proc.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  t(nombre + ': el boot muere por PID exacto y el puerto queda libre', portFree(b.port));
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
  await page.waitForSelector('.pz-shell-who b', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  return { ctx, page };
}
async function estiloDe(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { familia: cs.fontFamily, peso: cs.fontWeight, ls: cs.letterSpacing, texto: el.textContent };
  }, sel);
}

(async () => {
  // ---------------------------------------------------------- A
  seccion('A · Estática — la letra de marca en las tres firmas, nada más');
  const cssRel = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  const MARCA = 'font-family:Montserrat,Inter,system-ui,-apple-system,sans-serif';
  const reglas = ['.pz-shell-who b{', '.hs-top b{', '.pz-chatfull-tit b{'];
  for (const r of reglas) {
    const i = cssRel.indexOf(r);
    const seg = i >= 0 ? cssRel.slice(i, cssRel.indexOf('}', i)) : '';
    t('A: «' + r + '» lleva Montserrat 800 y -.02em en el release',
      seg.includes(MARCA) && seg.includes('font-weight:800') && seg.includes('letter-spacing:-.02em'), seg.slice(0, 160));
  }
  const idxEs = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const idxEn = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
  t('A: el índice ES carga Montserrat 700;800 por Google Fonts (el mecanismo del website)',
    idxEs.includes('family=Montserrat:wght@700;800'));
  t('A: el índice EN carga Montserrat 700;800 por Google Fonts',
    idxEn.includes('family=Montserrat:wght@700;800'));
  t('A: la apertura ya vivía en Montserrat (precedente intacto)',
    idxEs.includes('.pzsp-stage') && idxEs.includes('font-family:Montserrat,Inter,system-ui,-apple-system,sans-serif'));
  if (HAY_BASE) {
    const cssBase = fs.readFileSync(path.join(PRISTINE, 'public', 'styles.css'), 'utf8');
    for (const r of reglas) {
      const i = cssBase.indexOf(r);
      const seg = i >= 0 ? cssBase.slice(i, cssBase.indexOf('}', i)) : '';
      t('A: control — «' + r + '» NO lleva Montserrat en el prístino', !seg.includes('Montserrat'), seg.slice(0, 120));
    }
    const reglaSmall = (css) => { const m = css.match(/\.pz-shell-who small\{[^}]*\}/); return m ? m[0] : ''; };
    t('A: la línea de estado (.pz-shell-who small) queda byte-idéntica — no se tocó',
      reglaSmall(cssRel) !== '' && reglaSmall(cssRel) === reglaSmall(cssBase));
    const md5 = (p) => execFileSync('md5sum', [p], { encoding: 'utf8' }).split(' ')[0];
    t('A: public/app.js byte-idéntico (el lote no toca JS)',
      md5(path.join(PRISTINE, 'public', 'app.js')) === md5(path.join(ROOT, 'public', 'app.js')));
    t('A: ambos índices byte-idénticos (la fuente ya se cargaba; no hizo falta tocarlos)',
      md5(path.join(PRISTINE, 'public', 'index.html')) === md5(path.join(ROOT, 'public', 'index.html')) &&
      md5(path.join(PRISTINE, 'public', 'en', 'index.html')) === md5(path.join(ROOT, 'public', 'en', 'index.html')));
    let difOut = '';
    try { difOut = execFileSync('diff', ['-rq', '--exclude=node_modules', PRISTINE, ROOT], { encoding: 'utf8' }); }
    catch (e) { difOut = e.stdout || ''; }
    const rel = difOut.split('\n').filter(Boolean).map((l) => {
      let m = l.match(/^Files .*? and (.*?) differ$/); if (m) return path.relative(ROOT, m[1]);
      m = l.match(/^Only in (.*?): (.*)$/); if (m) return path.relative(ROOT, path.join(m[1], m[2]));
      return l;
    }).sort();
    t('A: el diff de árboles es solo styles.css + esta suite',
      JSON.stringify(rel) === JSON.stringify(['public/styles.css', 'test-lote-marca-letra.js'].sort()), rel.join(' · '));
  } else {
    console.log('  (sin árbol prístino al lado: controles de base omitidos)');
  }

  const pw = loadPw();
  t('playwright-core disponible', !!pw);
  if (!pw) { console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(mal ? 1 : 0); }
  const browser = await pw.chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });

  // ---------------------------------------------------------- B · control
  if (HAY_BASE) {
    seccion('B · Control prístino — el «antes» de la captura del dueño');
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-letra-ctl-'));
    console.log('  seed B:', seedBootDir(dirB, PRISTINE));
    const bB = await bootServer(dirB, PRISTINE);
    t('B0 el boot prístino levanta', bB.up, bB.log().slice(-200));
    const sesB = await login(bB.base, 'casa@posty.example');
    t('B0 login de la casa', sesB.ok);
    const aB = await abrirInicio(browser, bB.base, sesB);
    const eB = await estiloDe(aB.page, '.pz-shell-who b');
    t('B: el «Posty.» prístino computa la letra heredada (Nunito), NO Montserrat',
      !!eB && /Nunito/.test(eB.familia) && !/^"?Montserrat/.test(eB.familia), eB && (eB.familia + ' · ' + eB.peso));
    const headB = await aB.page.$('.pz-shell-head');
    if (headB) await headB.screenshot({ path: path.join(SHOTS, 'captura-antes-header.png') });
    t('B: captura del encabezado prístino guardada', !!headB);
    await aB.ctx.close();
    await killBoot(bB, 'B');
  }

  // ---------------------------------------------------------- C · release
  seccion('C · Release — el «Posty.» con la letra del website');
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-letra-rel-'));
  console.log('  seed C:', seedBootDir(dirC, ROOT));
  const bC = await bootServer(dirC, ROOT);
  t('C0 el boot del release levanta', bC.up, bC.log().slice(-200));
  const sesC = await login(bC.base, 'casa@posty.example');
  t('C0 login de la casa', sesC.ok);
  const aC = await abrirInicio(browser, bC.base, sesC);
  const eC = await estiloDe(aC.page, '.pz-shell-who b');
  t('C: el «Posty.» del encabezado computa Montserrat como primera familia',
    !!eC && /^"?Montserrat/.test(eC.familia), eC && eC.familia);
  t('C: el «Posty.» del encabezado computa peso 800', !!eC && eC.peso === '800', eC && eC.peso);
  const fuenteCargada = await aC.page.evaluate(() => { try { return document.fonts.check('800 20px Montserrat'); } catch (e) { return false; } });
  t('C: Montserrat 800 está CARGADA en el documento (la misma Google Fonts del website)', fuenteCargada === true);
  const eSmall = await estiloDe(aC.page, '.pz-shell-who small');
  t('C: la línea de estado NO cambió de letra (sigue sin Montserrat al frente)',
    !!eSmall && !/^"?Montserrat/.test(eSmall.familia), eSmall && eSmall.familia);
  const headC = await aC.page.$('.pz-shell-head');
  if (headC) await headC.screenshot({ path: path.join(SHOTS, 'captura-despues-header.png') });
  t('C: captura del encabezado del release guardada', !!headC);
  await aC.ctx.close();
  // La firma del chat completo es la vista del INVITADO (la ruta #/app/chat
  // rebota al cliente registrado a Inicio desde TAB-SUBIR): se entra con la
  // sesión invitada sembrada. La tercera firma (.hs-top, chatView) no tiene
  // llamadores vivos hoy: su unificación se verifica en la estática (A).
  const sesG = await login(bC.base, 'invitado@posty.example');
  t('C0 login del invitado', sesG.ok);
  const ctxG = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctxG.addCookies([{ name: sesG.name, value: sesG.value, domain: '127.0.0.1', path: '/' }]);
  const pageG = await ctxG.newPage();
  await pageG.goto(bC.base + '/#/app/chat', { waitUntil: 'domcontentloaded' });
  await pageG.waitForSelector('.pz-chatfull-tit b', { timeout: 30000 }).catch(() => {});
  await sleep(2000);
  const eChat = await estiloDe(pageG, '.pz-chatfull-tit b');
  t('C: la firma «Posty.» del chat (vista del invitado) computa Montserrat 800',
    !!eChat && /^"?Montserrat/.test(eChat.familia) && eChat.peso === '800', eChat && (eChat.familia + ' · ' + eChat.peso));
  const headChat = await pageG.$('.pz-chatfull-head');
  if (headChat) await headChat.screenshot({ path: path.join(SHOTS, 'captura-despues-chat.png') });
  t('C: captura del encabezado de chat guardada', !!headChat);
  await ctxG.close();
  await killBoot(bC, 'C');

  await browser.close();
  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
