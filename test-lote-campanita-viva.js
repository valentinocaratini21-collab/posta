// =====================================================================
// LOTE CAMPANITA-VIVA — suite propia (estática + boot real + Chromium +
// control prístino). La campana de notificaciones de la barra viva,
// viva: con sin-leer (> 0, el número de GET /api/bandeja/count que ya
// pinta CAMPANA-BADGE) el círculo de vidrio se tiñe del amarillo de
// marca con un brillo suave, la campana suena en un ciclo CSS de 5 s
// (meneíto en el primer ~20%, descanso el resto), suena en el momento
// en que SUBE el conteo (el ciclo se reinicia) y el numerito entra con
// un saltito cuando cambia. En cero, todo se apaga. Con
// prefers-reduced-motion, nada se mueve. La lógica de notificaciones
// no se toca: solo presentación y clases de estado en
// pzCampanaBadgePintar + la siembra de pzShellHeadHTML.
//
//   A · Estática — las reglas y los keyframes en styles.css (con su
//       tramo de descanso medido), el cableado en app.js y el gate
//       M78 de la familia de la campana.
//   B · Boot real — el bundle SERVIDO trae el lote (styles.css y
//       app.js por HTTP) y /api/version responde.
//   C · Chromium 390px — transiciones reales sobre la campana de la
//       app: 0 → 3 (tinte, insignia, pop, ciclo corriendo) → sube a 5
//       (el ciclo se REINICIA: suena al llegar) → baja a 2 (no se
//       reinicia) → 0 (todo se apaga) · los keyframes leídos por CSSOM
//       descansan desde el 22% · contexto con reduced-motion: la
//       clase se aplica pero nada se anima.
//   D · Control prístino — la base (HEAD 98fc4a63, sin el lote): el
//       bundle servido no conoce el lote y, con el mismo conteo 3, la
//       insignia se pinta como hoy pero la campana queda ESTÁTICA,
//       sin tinte ni ciclo: el estado de hoy, reproducido.
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  } catch (e) { return true; }
}
function buscarPuerto() {
  for (let p = 36800; p < 37000; p++) { if (puertoLibre(p)) return p; }
  return 0;
}
function arrancarBoot(root, puerto, tmpD) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(puerto), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-campanita', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += String(d); });
  child.stderr.on('data', (d) => { log += String(d); });
  return { child, pid: child.pid, log: () => log };
}
async function esperarUp(base) {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(base + '/api/version'); if (r.status === 200) return true; } catch (e) { /* todavía */ }
    await sleep(500);
  }
  return false;
}
async function matarBoot(b, puerto) {
  try { b.child.kill('SIGTERM'); } catch (e) { /* ya murió */ }
  await sleep(1200);
  let vivo = true;
  try { process.kill(b.pid, 0); } catch (e) { vivo = false; }
  if (vivo) { try { process.kill(b.pid, 'SIGKILL'); } catch (e) { /* nada */ } await sleep(400); vivo = false; try { process.kill(b.pid, 0); vivo = true; } catch (e) { vivo = false; } }
  return !vivo && puertoLibre(puerto);
}
async function login(base, email) {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ClaveQA123' }),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const m = setCookie.match(/^([^=]+)=([^;]+)/);
  return { status: r.status, cookie: m ? { name: m[1], value: m[2] } : null };
}
function cargarPw() {
  for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
    path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { const pw = require(cand); if (pw) return pw; } catch (e) { /* siguiente */ }
  }
  return null;
}
function exeChromium() {
  const basePw = path.join(os.homedir(), '.cache/ms-playwright');
  for (const dir of fs.readdirSync(basePw)) {
    if (!dir.startsWith('chromium') || dir.includes('headless')) continue;
    for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const p = path.join(basePw, dir, sub);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) { /* ya existe */ }
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
  VALUES (601, 'cliente@campanita.test', ?, 'total', 'active', 0, 0, 0, NULL, NULL, 1, 'es', 1, '2026-09-01 10:00:00')\`).run(hash);
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (601, ?, ?, ?, 1)')
  .run('The Coffee Bar', 'thecoffeebardc', 'café');
db.prepare("INSERT INTO settings (user_id, timezone, ig_user_id, ig_access_token) VALUES (601, 'America/New_York', 'IGBIZ', 'tok-falso')").run();
console.log('semilla ok');
`;
function sembrar(root) {
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'campanita-viva-'));
  const seedFile = path.join(os.tmpdir(), 'campanita-viva-seed-' + process.pid + '-' + Math.floor(Math.random() * 1e6) + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, root], { stdio: 'pipe' });
  fs.unlinkSync(seedFile);
  return tmpD;
}

// ---------------------------------------------------------------------
seccion('A · Estática');
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A0 node --check public/app.js', true); }
catch (e) { t('A0 node --check public/app.js', false, String(e.message).slice(0, 200)); }

t('A1 el tinte de estado existe: .pz-shell-bell.tiene-nuevas con el amarillo de marca y su brillo',
  css.includes('.pz-shell-bell.tiene-nuevas{') && css.includes('rgba(254,193,77,.30)') && css.includes('0 0 16px rgba(254,193,77,.50)'));
t('A2 el ciclo de la campana: el svg bajo la clase de estado, ciclo de 5 s infinito, pivote arriba',
  css.includes('.pz-shell-bell.tiene-nuevas svg{transform-origin:50% 0;animation:pzCampanaSuena 5s ease-in-out infinite}'));
const kmPos = css.indexOf('@keyframes pzCampanaSuena');
const km = kmPos >= 0 ? css.slice(kmPos, kmPos + 400) : null;
let descansoOk = false, picoOk = false;
if (km) {
  const cuerpo = km;
  const frames = [...cuerpo.matchAll(/([\d.,%\s]+)\{transform:rotate\((-?[\d.]+)deg\)\}/g)]
    .map((m) => ({ claves: m[1].split(',').map((s) => parseFloat(s)), rot: parseFloat(m[2]) }));
  const conMovimiento = frames.filter((f) => Math.abs(f.rot) > 0.5);
  const maxClaveMov = Math.max(...conMovimiento.flatMap((f) => f.claves));
  const hayCierre = frames.some((f) => f.rot === 0 && f.claves.includes(100));
  descansoOk = maxClaveMov <= 22 && hayCierre;
  picoOk = conMovimiento.some((f) => Math.abs(f.rot) >= 12);
}
t('A3 los keyframes medidos: el meneíto vive en el primer ≤22% del ciclo y el 100% es reposo (descanso ≥78%)',
  !!km && descansoOk, km ? km.slice(0, 120) : 'sin keyframes');
t('A4 el meneíto tiene cuerpo: algún frame pasa los 12° de oscilación', !!km && picoOk);
t('A5 el saltito del numerito: .pop con su keyframes de escala con rebote',
  css.includes('.pz-shell-bell-badge.pop{animation:pzCampanaPop .45s cubic-bezier(.2,2.2,.4,1)}')
  && css.includes('@keyframes pzCampanaPop{0%{transform:scale(.3)}100%{transform:scale(1)}}'));
t('A6 prefers-reduced-motion apaga las dos animaciones del lote',
  /@media \(prefers-reduced-motion: reduce\)\{\.pz-shell-bell\.tiene-nuevas svg\{animation:none\}\.pz-shell-bell-badge\.pop\{animation:none\}\}/.test(css));
t('A7 el pintor maneja la clase de estado y el conteo pintado (suena al subir, salta al cambiar, apaga en cero)',
  appJs.includes("b.classList.remove('tiene-nuevas')") && appJs.includes("b.classList.add('tiene-nuevas')")
  && appJs.includes('__pzCampanaBadgePintado') && appJs.includes("el.classList.add('pop')"));
t('A8 la barra siembra la clase de estado desde la caché (sin parpadeo al re-pintar el shell)',
  appJs.includes("const bellVivaIni") && appJs.includes('pz-shell-bell${bellVivaIni}'));
const familia = ['pzCampanaBadgePintar', 'pzCampanaBadgeRefrescar', 'pzBarraCampanaPintar', 'pzBarraCampana', 'pzShellHeadHTML', 'pzIc'];
const famMal = familia.filter((f) => (appJs.match(new RegExp('function ' + f + '\\(', 'g')) || []).length !== 1);
t('A9 gate M78 — la familia de la campana sigue definida exactamente una vez (' + (familia.length - famMal.length) + '/' + familia.length + ')',
  famMal.length === 0, famMal.join(','));
t('A10 el vidrio de la campana es el de siempre (.pz-shell-ic con blur) y la insignia conserva su lengua (#C2452D)',
  css.includes('.pz-shell-ic{') && css.includes('backdrop-filter:blur(16px) saturate(165%)')
  && css.includes('.pz-shell-bell-badge{') && css.includes('#C2452D') && css.includes('.pz-shell-bell{position:relative}'));

// ---------------------------------------------------------------------
async function main() {
  seccion('B · Boot real — el bundle servido');
  const PORT = buscarPuerto();
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'campanita-viva-boot-'));
  const boot = arrancarBoot(ROOT, PORT, tmpB);
  const base = 'http://127.0.0.1:' + PORT;
  try {
    const up = await esperarUp(base);
    t('B1 el servidor levanta en el puerto libre', up, boot.log().slice(-300));
    const cssSrv = await (await fetch(base + '/styles.css')).text();
    t('B2 el styles.css SERVIDO trae el lote (tinte, ciclo, pop, reduced-motion)',
      cssSrv.includes('@keyframes pzCampanaSuena') && cssSrv.includes('.pz-shell-bell.tiene-nuevas{')
      && cssSrv.includes('@keyframes pzCampanaPop') && cssSrv.includes('prefers-reduced-motion'));
    const appSrv = await (await fetch(base + '/app.js')).text();
    t('B3 el app.js SERVIDO trae el cableado (clase de estado, conteo pintado, siembra)',
      appSrv.includes('__pzCampanaBadgePintado') && appSrv.includes('tiene-nuevas') && appSrv.includes('bellVivaIni'));
  } catch (e) {
    t('B sin excepción', false, String(e && e.message || e));
  } finally {
    const murio = await matarBoot(boot, PORT);
    t('B4 el boot murió por su PID exacto y el puerto quedó libre', murio);
  }

  // ---- C · Chromium ----
  seccion('C · Chromium (390px) — la campana viva, medida');
  const pw = cargarPw();
  t('C0 playwright-core disponible', !!pw);
  if (pw) {
    const tmpD = sembrar(ROOT);
    const PORTC = buscarPuerto();
    const bootC = arrancarBoot(ROOT, PORTC, tmpD);
    const baseC = 'http://127.0.0.1:' + PORTC;
    let browser = null;
    try {
      const up = await esperarUp(baseC);
      t('C1 el boot de UI levanta', up, bootC.log().slice(-200));
      const ses = await login(baseC, 'cliente@campanita.test');
      t('C2 login del cliente de la semilla', !!ses.cookie);
      browser = await pw.chromium.launch({ executablePath: exeChromium() || undefined, args: ['--no-sandbox'] });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.addCookies([{ name: ses.cookie.name, value: ses.cookie.value, url: baseC }]);
      const page = await ctx.newPage();
      await page.goto(baseC + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#pzShellBell', { timeout: 25000 });
      // La barra viva hace su primer refresco al pintar: se espera a
      // que el conteo real (0) quede asentado antes de conducir.
      await page.waitForFunction(() => typeof window.__pzCampanaBadgeN === 'number', null, { timeout: 25000 }).catch(() => {});
      await sleep(1200);
      const pintar = (n) => page.evaluate((v) => { window.__pzCampanaBadgeN = v; pzCampanaBadgePintar(); }, n);
      const estado = () => page.evaluate(() => {
        const b = document.getElementById('pzShellBell');
        const el = document.getElementById('pzShellBellBadge');
        const svg = b ? b.querySelector('svg') : null;
        const cs = b ? getComputedStyle(b) : null;
        const csSvg = svg ? getComputedStyle(svg) : null;
        const anims = svg && svg.getAnimations ? svg.getAnimations() : [];
        return {
          clase: b ? b.classList.contains('tiene-nuevas') : null,
          badge: el ? el.textContent : null,
          pop: el ? el.classList.contains('pop') : null,
          fondo: cs ? cs.backgroundColor : null,
          animNombre: csSvg ? csSvg.animationName : null,
          animDur: csSvg ? csSvg.animationDuration : null,
          animT: anims.length ? anims[0].currentTime : null,
        };
      });
      const e0 = await estado();
      t('C3 en cero: sin insignia, sin clase de estado, sin animación (la campana de siempre)',
        e0.badge === null && e0.clase === false && e0.animNombre === 'none', JSON.stringify(e0));
      await pintar(3);
      const e3 = await estado();
      t('C4 llega a 3: la insignia aparece con el número y su saltito (.pop)',
        e3.badge === '3' && e3.pop === true, JSON.stringify(e3));
      // La geometría asentada de la insignia es la de siempre: el
      // saltito dura 0,45 s y al terminar la píldora vuelve a sus
      // 17px exactos de CAMPANA-BADGE (la vecina campana-badge mide
      // 17px — su D3 puede pescar el frame del rebote; acá se mide
      // el estado final, que es el que queda).
      await sleep(700);
      const geom = await page.evaluate(() => {
        const el = document.getElementById('pzShellBellBadge');
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { h: Math.round(r.height), bg: cs.backgroundColor, color: cs.color };
      });
      t('C4b asentado el saltito, la insignia es la de la casa: píldora #C2452D de 17px, número blanco',
        geom.h === 17 && geom.bg === 'rgb(194, 69, 45)' && geom.color === 'rgb(255, 255, 255)', JSON.stringify(geom));
      t('C5 llega a 3: el botón toma la clase de estado y el tinte amarillo medido en el estilo computado',
        e3.clase === true && /254,\s*193,\s*77/.test(e3.fondo || ''), JSON.stringify(e3));
      t('C6 el ciclo corre sobre el svg: animation-name pzCampanaSuena, duración 5s',
        e3.animNombre === 'pzCampanaSuena' && e3.animDur === '5s', JSON.stringify(e3));
      const frames = await page.evaluate(() => {
        const out = [];
        for (const sh of document.styleSheets) {
          let reglas; try { reglas = sh.cssRules; } catch (e) { continue; }
          for (const r of reglas) {
            if (r.type === 7 && r.name === 'pzCampanaSuena') {
              for (const k of r.cssRules) out.push({ clave: k.keyText, tf: k.style.transform || '' });
            }
          }
        }
        return out;
      });
      const conMov = frames.filter((f) => { const m = f.tf.match(/rotate\((-?[\d.]+)deg\)/); return m && Math.abs(parseFloat(m[1])) > 0.5; });
      const maxClave = conMov.length ? Math.max(...conMov.flatMap((f) => f.clave.split(',').map((s) => parseFloat(s)))) : 999;
      const cierre = frames.some((f) => f.clave.includes('100%') && /rotate\(0/.test(f.tf));
      t('C7 CSSOM: los keyframes servidos mueven solo hasta el ' + maxClave + '% del ciclo y el 100% es reposo',
        frames.length > 0 && maxClave <= 22 && cierre, JSON.stringify(frames).slice(0, 200));
      await sleep(1400);
      const tAntes = (await estado()).animT;
      await pintar(5);
      const e5 = await estado();
      t('C8 sube a 5: suena al llegar — el ciclo se reinició (currentTime vuelve a casi cero)',
        e5.badge === '5' && typeof e5.animT === 'number' && e5.animT < 700 && typeof tAntes === 'number' && tAntes > 1000,
        'antes=' + tAntes + ' después=' + e5.animT);
      await sleep(900);
      const tMedio = (await estado()).animT;
      await pintar(2);
      const e2 = await estado();
      t('C9 baja a 2: la insignia sigue al número, la clase queda, y el ciclo NO se reinicia',
        e2.badge === '2' && e2.clase === true && typeof e2.animT === 'number' && e2.animT > 700,
        'medio=' + tMedio + ' después=' + e2.animT);
      await pintar(0);
      const eFin = await estado();
      t('C10 vuelve a cero: la insignia se va, la clase se va, la animación se apaga',
        eFin.badge === null && eFin.clase === false && eFin.animNombre === 'none', JSON.stringify(eFin));
      // Reduced motion: la clase se aplica, nada se anima.
      const ctxRM = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      await ctxRM.addCookies([{ name: ses.cookie.name, value: ses.cookie.value, url: baseC }]);
      const pRM = await ctxRM.newPage();
      await pRM.goto(baseC + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pRM.waitForSelector('#pzShellBell', { timeout: 25000 });
      await sleep(800);
      const eRM = await pRM.evaluate(() => {
        window.__pzCampanaBadgeN = 4; pzCampanaBadgePintar();
        const b = document.getElementById('pzShellBell');
        const el = document.getElementById('pzShellBellBadge');
        const svg = b.querySelector('svg');
        return {
          clase: b.classList.contains('tiene-nuevas'), badge: el ? el.textContent : null,
          animSvg: getComputedStyle(svg).animationName,
          animBadge: el ? getComputedStyle(el).animationName : null,
        };
      });
      t('C11 prefers-reduced-motion: hay insignia y tinte, pero ni la campana ni el numerito se animan',
        eRM.clase === true && eRM.badge === '4' && eRM.animSvg === 'none' && eRM.animBadge === 'none', JSON.stringify(eRM));
      await ctxRM.close();
      await ctx.close();
    } catch (e) {
      t('C sin excepción', false, String(e && e.message || e).slice(0, 300));
    } finally {
      if (browser) { try { await browser.close(); } catch (e) { /* nada */ } }
      const murio = await matarBoot(bootC, PORTC);
      t('C12 el boot de UI murió por su PID exacto y el puerto quedó libre', murio);
    }
  }

  // ---- D · Control prístino ----
  seccion('D · Control prístino — la base sin el lote (el estado de hoy)');
  const appBase = fs.readFileSync(path.join(BASE, 'public/app.js'), 'utf8');
  const cssBase = fs.readFileSync(path.join(BASE, 'public/styles.css'), 'utf8');
  t('D1 la base no conoce el lote: ni keyframes, ni clase de estado, ni conteo pintado',
    !cssBase.includes('pzCampanaSuena') && !cssBase.includes('tiene-nuevas') && !appBase.includes('__pzCampanaBadgePintado'));
  if (pw) {
    const tmpP = sembrar(BASE);
    const PORTP = buscarPuerto();
    const bootP = arrancarBoot(BASE, PORTP, tmpP);
    const baseP = 'http://127.0.0.1:' + PORTP;
    let browserP = null;
    try {
      const up = await esperarUp(baseP);
      t('D2 el boot prístino levanta', up, bootP.log().slice(-200));
      const ses = await login(baseP, 'cliente@campanita.test');
      browserP = await pw.chromium.launch({ executablePath: exeChromium() || undefined, args: ['--no-sandbox'] });
      const ctxP = await browserP.newContext({ viewport: { width: 390, height: 844 } });
      await ctxP.addCookies([{ name: ses.cookie.name, value: ses.cookie.value, url: baseP }]);
      const pP = await ctxP.newPage();
      await pP.goto(baseP + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pP.waitForSelector('#pzShellBell', { timeout: 25000 });
      await sleep(1200);
      const eP = await pP.evaluate(() => {
        window.__pzCampanaBadgeN = 3; pzCampanaBadgePintar();
        const b = document.getElementById('pzShellBell');
        const el = document.getElementById('pzShellBellBadge');
        const svg = b.querySelector('svg');
        return {
          badge: el ? el.textContent : null,
          clase: b.classList.contains('tiene-nuevas'),
          animSvg: getComputedStyle(svg).animationName,
        };
      });
      t('D3 control: con el mismo conteo 3, la base pinta la insignia de hoy pero la campana queda estática, sin tinte ni ciclo',
        eP.badge === '3' && eP.clase === false && eP.animSvg === 'none', JSON.stringify(eP));
      await ctxP.close();
    } catch (e) {
      t('D sin excepción', false, String(e && e.message || e).slice(0, 300));
    } finally {
      if (browserP) { try { await browserP.close(); } catch (e) { /* nada */ } }
      const murio = await matarBoot(bootP, PORTP);
      t('D4 el boot prístino murió por su PID exacto y el puerto quedó libre', murio);
    }
  }

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}
main().catch((e) => { console.error('EXCEPCIÓN GLOBAL', e); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
