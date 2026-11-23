// =====================================================================
// LOTE SUBIR-BOTON-IGUAL — suite propia (boot real + Chromium)
// Pedido del dueño (22/11 23:55): «el boton de subir no esta como los
// otros botones de inicio y ads. esta sin el icono, y la palabra esta
// mas grande... podes corregir eso?»
// Base: HEAD 98fc4a63 (BUILD 20261105-v1243 · BANDEJA-VERDAD).
//
// La diferencia medida en la base: en las DOS cáscaras que pintan la
// navegación Inicio · Subir · Ads, el botón Subir es un caso especial
// de palabra sola — sin ícono — con la palabra a 15.5px/800 (bb) y
// 15px/800 (mz) contra los 11px de sus vecinas. El caso especial nació
// de la enmienda BARRA-VIVA (21/11); la palabra del dueño del 22/11 la
// reemplaza: Subir queda EXACTAMENTE como Inicio y Ads (mismo sistema
// de ícono, misma tipografía y tamaño de palabra, mismos estados),
// sin tocar su comportamiento ni su destino (#/app/subir).
//
//   A · Estática — los casos especiales murieron en app.js y en
//       styles.css; los glifos de Subir de cada juego existen; M78.
//   B · Boot real + HTTP — el servidor levanta y las sesiones entran.
//   C · Chromium — paridad MEDIDA en las dos cáscaras (ícono presente
//       con el mismo tamaño computado, font-size de la palabra
//       Subir == Inicio == Ads, alturas iguales, estados activo e
//       inactivo con el mismo tratamiento) y destinos intactos.
// En la base prístina, §A falla en los casos especiales y §C reproduce
// la diferencia del dueño (Subir sin svg, palabra a 15.5px/15px).
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
function buscarPuerto() {
  for (let p = 36400; p < 36600; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}
function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  } catch (e) { return true; }
}

// ---------------------------------------------------------------------
seccion('A · Estática');
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A0 node --check public/app.js', true); }
catch (e) { t('A0 node --check public/app.js', false, String(e.message).slice(0, 200)); }

const bbSlice = appJs.slice(appJs.indexOf('function bbShell('), appJs.indexOf('async function bbLoadEstado'));
const mzSlice = appJs.slice(appJs.indexOf('function mzTabsHTML('), appJs.indexOf('function pzDockMasBtn'));
t('A1 bb: el caso especial de palabra sola murió (sin rama k === \'subir\' ni clase bb-tab-subir en tabBtn)',
  !bbSlice.includes("k === 'subir'") && !bbSlice.includes('bb-tab-subir') && !appJs.includes('bb-tab-subir-word'));
t('A2 mz: el caso especial de palabra sola murió (sin ternario key === \'subir\' ni clase mz-tab-subir)',
  !mzSlice.includes("key === 'subir'") && !mzSlice.includes('mz-tab-subir') && !appJs.includes('mz-tab-subir-word'));
t('A3 los glifos de Subir de cada juego están: el «+» trazo 1.5 del mapa ic de bbShell y el masHilo de Hilo en mz',
  /subir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1\.5"/.test(bbSlice)
  && bbSlice.includes('M12 4.8v14.4M4.8 12h14.4')
  && mzSlice.includes("pzIcHilo('masHilo')"));
t('A4 CSS: las reglas de la palabra grande murieron y las de la pestaña común quedan intactas',
  !css.includes('.bb-tab-subir-word') && !css.includes('.mz-tab-subir-word')
  && !css.includes('.bb-tab-subir{') && !css.includes('.mz-tab-subir{')
  && css.includes('.bb-tab{position:relative;background:none;border:0;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px')
  && css.includes('.bb-tab .bb-tab-ic svg{width:24px;height:24px}')
  && css.includes('.mz-tab{flex:1;text-align:center;font-size:11px'));
t('A5 los destinos y las llamadas quedan como hoy (bbGo a #/app/subir; mz con data-tab subir)',
  bbSlice.includes("tabBtn('subir', '#/app/subir', gzT('Subir', 'Upload'))")
  && bbSlice.includes('onclick="bbGo(\'${hash}\')"')
  && mzSlice.includes("t('subir', 'subir', pzIcHilo('masHilo'), gzT('Subir', 'Upload'))"));
const auditadas = ['bbGo', 'pzIcHilo', 'gzT', 'bbShell', 'mzTabsHTML', 'appShell'];
const malDef = auditadas.filter((f) => (appJs.match(new RegExp('function ' + f + '\\(', 'g')) || []).length !== 1);
t('A6 M78: las 6 funciones llamadas desde la barra existen definidas exactamente una vez',
  malDef.length === 0, malDef.join(','));

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) { /* ya existe */ }
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, shell, nombre, ig) {
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
    VALUES (?, ?, ?, 'posty', 'active', 0, 0, 0, NULL, NULL, ?, 'es', 1, '2026-09-01 10:00:00')\`).run(id, email, hash, shell);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)')
    .run(id, nombre, ig, 'café');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(601, 'bb@subir.test', 1, 'Café Barra BB', 'cafebb');
usuario(602, 'mz@subir.test', 0, 'Café Barra MZ', 'cafemz');
const f = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
for (const uid of [601, 602]) {
  for (let d = 1; d <= 3; d++) {
    const cuando = new Date(Date.now() - d * 86400000);
    db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at, created_at)
      VALUES (?, '/media/semilla.jpg', ?, 'published', 'image', ?, ?, ?)\`)
      .run(uid, 'El posteo del día ' + d + '.', f(cuando), f(cuando), f(cuando));
  }
}
console.log('semilla ok');
`;

// La medición de una barra: por botón, texto, svg (presencia y caja),
// tamaño y peso computados de la palabra y la caja del botón.
const MEDIR_BB = () => {
  const btns = [...document.querySelectorAll('.bb-bar .bb-tab')];
  return btns.map((b) => {
    const svg = b.querySelector('svg');
    const spans = [...b.querySelectorAll('span')];
    const palabra = spans[spans.length - 1];
    const cs = getComputedStyle(palabra);
    const r = b.getBoundingClientRect();
    const sr = svg ? svg.getBoundingClientRect() : null;
    return {
      txt: b.textContent.trim(), clases: b.className,
      on: b.classList.contains('on'),
      svg: !!svg, svgW: sr ? Math.round(sr.width) : 0, svgH: sr ? Math.round(sr.height) : 0,
      fs: cs.fontSize, fw: cs.fontWeight, color: cs.color,
      h: Math.round(r.height),
    };
  });
};
const MEDIR_MZ = () => {
  const btns = [...document.querySelectorAll('.mz-tabs .mz-tab')];
  return btns.map((b) => {
    const svg = b.querySelector('svg');
    // La palabra: en el markup común es un nodo de texto del botón; en el
    // caso especial prístino vive en su propio span — se mide el elemento
    // que la pinta, para que el control reproduzca la diferencia real.
    const wordSpan = [...b.querySelectorAll('span')].find((s) => !s.querySelector('svg') && s.textContent.trim() === b.textContent.trim());
    const cs = getComputedStyle(wordSpan || b);
    const r = b.getBoundingClientRect();
    const sr = svg ? svg.getBoundingClientRect() : null;
    return {
      txt: b.textContent.trim(), clases: b.className, tab: b.getAttribute('data-tab'),
      on: b.classList.contains('on'),
      svg: !!svg, svgW: sr ? Math.round(sr.width) : 0, svgH: sr ? Math.round(sr.height) : 0,
      fs: cs.fontSize, fw: cs.fontWeight, color: cs.color,
      h: Math.round(r.height),
    };
  });
};

async function main() {
  seccion('B · Boot real + HTTP');
  const PORT = buscarPuerto();
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'subir-boton-boot-'));
  const seedFile = path.join(os.tmpdir(), 'subir-boton-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-subir', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverPid = child.pid;
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += String(d); });
  child.stderr.on('data', (d) => { serverLog += String(d); });
  const base = 'http://127.0.0.1:' + PORT;

  async function login(email) {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ClaveQA123' }),
    });
    const setCookie = r.headers.get('set-cookie') || '';
    const m = setCookie.match(/^([^=]+)=([^;]+)/);
    return { status: r.status, cookie: m ? { name: m[1], value: m[2] } : null };
  }

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));
    const sesBB = await login('bb@subir.test');
    const sesMZ = await login('mz@subir.test');
    t('B2 login de las dos sesiones (cáscara bb y cáscara mz)', !!(sesBB.cookie && sesMZ.cookie),
      'bb ' + sesBB.status + ' · mz ' + sesMZ.status);

    // ---------------- C · Chromium ----------------
    seccion('C · Chromium — paridad medida');
    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); if (pw) break; } catch (e) { /* siguiente */ }
    }
    t('C0 playwright-core disponible', !!pw);
    if (pw) {
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      let exe = null;
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
      const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const mkCtx = async (ses) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await ctx.addCookies([{ name: ses.cookie.name, value: ses.cookie.value, url: base }]);
        return ctx;
      };

      // — Cáscara BB (la del teléfono del dueño) —
      const ctxBB = await mkCtx(sesBB);
      const pBB = await ctxBB.newPage();
      await pBB.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pBB.waitForSelector('.bb-bar .bb-tab', { timeout: 20000 });
      const bbIni = await pBB.evaluate(MEDIR_BB);
      t('C1 BB: la barra pinta Inicio · Subir · Ads en ese orden',
        bbIni.length === 3 && bbIni[0].txt === 'Inicio' && bbIni[1].txt === 'Subir' && bbIni[2].txt === 'Ads',
        JSON.stringify(bbIni.map((x) => x.txt)));
      t('C2 BB: Subir TIENE ícono, del mismo tamaño computado que Inicio y Ads (24×24)',
        bbIni[1].svg && bbIni[1].svgW === 24 && bbIni[1].svgH === 24
        && bbIni[0].svgW === 24 && bbIni[2].svgW === 24,
        JSON.stringify(bbIni.map((x) => [x.svg, x.svgW, x.svgH])));
      t('C3 BB: la palabra de Subir mide igual que la de Inicio y Ads (11px)',
        bbIni[1].fs === '11px' && bbIni[0].fs === '11px' && bbIni[2].fs === '11px',
        JSON.stringify(bbIni.map((x) => x.fs)));
      t('C4 BB: ningún botón lleva la clase del caso especial y las tres cajas miden el mismo alto',
        bbIni.every((x) => !/tab-subir/.test(x.clases)) && bbIni[0].h === bbIni[1].h && bbIni[1].h === bbIni[2].h,
        JSON.stringify(bbIni.map((x) => [x.clases, x.h])));
      const bbOnIni = bbIni[0];
      t('C5 BB: en Inicio, Inicio está activo (peso 700) y Subir inactivo pesa como Ads inactivo',
        bbOnIni.on && bbOnIni.fw === '700' && bbIni[1].fw === bbIni[2].fw && !bbIni[1].on,
        JSON.stringify(bbIni.map((x) => [x.on, x.fw])));
      await pBB.evaluate(() => { document.querySelectorAll('.bb-bar .bb-tab')[1].click(); });
      await pBB.waitForFunction(() => location.hash === '#/app/subir', null, { timeout: 15000 });
      await pBB.waitForFunction(() => { const b = document.querySelectorAll('.bb-bar .bb-tab'); return b.length === 3 && b[1].classList.contains('on'); }, null, { timeout: 20000 });
      const bbSub = await pBB.evaluate(MEDIR_BB);
      t('C6 BB: el toque en Subir navega a #/app/subir (destino intacto) y Subir activo recibe el mismo tratamiento que Inicio activo (peso y color)',
        bbSub[1].on && bbSub[1].fw === bbOnIni.fw && bbSub[1].color === bbOnIni.color && bbSub[1].fs === '11px',
        JSON.stringify([bbSub[1], bbOnIni]));
      await pBB.evaluate(() => { document.querySelectorAll('.bb-bar .bb-tab')[2].click(); });
      await pBB.waitForFunction(() => location.hash === '#/app/ads', null, { timeout: 15000 });
      t('C7 BB: el toque en Ads sigue yendo a #/app/ads', true);

      // — Cáscara MZ (la web sin shell bb) —
      const ctxMZ = await mkCtx(sesMZ);
      const pMZ = await ctxMZ.newPage();
      await pMZ.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pMZ.waitForSelector('.mz-tabs .mz-tab', { timeout: 20000 });
      const mzIni = await pMZ.evaluate(MEDIR_MZ);
      t('C8 MZ: la barra pinta Inicio · Subir · Ads con data-tab subir en el centro',
        mzIni.length === 3 && mzIni[0].txt === 'Inicio' && mzIni[1].txt === 'Subir' && mzIni[2].txt === 'Ads' && mzIni[1].tab === 'subir',
        JSON.stringify(mzIni.map((x) => [x.txt, x.tab])));
      t('C9 MZ: Subir TIENE ícono, del mismo tamaño computado que Inicio y Ads (24×24)',
        mzIni[1].svg && mzIni[1].svgW === 24 && mzIni[1].svgH === 24
        && mzIni[0].svgW === 24 && mzIni[2].svgW === 24,
        JSON.stringify(mzIni.map((x) => [x.svg, x.svgW, x.svgH])));
      t('C10 MZ: la palabra de Subir mide igual que la de Inicio y Ads (11px) y ningún botón lleva la clase del caso especial',
        mzIni[1].fs === '11px' && mzIni[0].fs === '11px' && mzIni[2].fs === '11px'
        && mzIni.every((x) => !/tab-subir/.test(x.clases)),
        JSON.stringify(mzIni.map((x) => [x.fs, x.clases])));
      const mzOnIni = mzIni[0];
      // La cáscara mz enlaza el onclick de las pestañas en bindApp, tras
      // pintar: se espera el enlace real antes de tocar (en bb el onclick
      // es en línea y no hace falta).
      await pMZ.waitForFunction(() => { const b = document.querySelectorAll('.mz-tabs .mz-tab')[1]; return b && typeof b.onclick === 'function'; }, null, { timeout: 20000 });
      await pMZ.evaluate(() => { document.querySelectorAll('.mz-tabs .mz-tab')[1].click(); });
      await pMZ.waitForFunction(() => location.hash === '#/app/subir', null, { timeout: 15000 });
      await pMZ.waitForFunction(() => { const b = document.querySelectorAll('.mz-tabs .mz-tab'); return b.length === 3 && b[1].classList.contains('on'); }, null, { timeout: 20000 });
      const mzSub = await pMZ.evaluate(MEDIR_MZ);
      t('C11 MZ: el toque en Subir navega a #/app/subir y Subir activo recibe el mismo tratamiento que Inicio activo (color)',
        mzSub[1].on && mzSub[1].color === mzOnIni.color && mzSub[1].fs === '11px',
        JSON.stringify([mzSub[1], mzOnIni]));
      await browser.close();
    }
  } catch (e) {
    t('B/C sin excepción', false, String(e && e.message || e));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((res) => setTimeout(res, 1200));
    let vivo = true;
    try { process.kill(serverPid, 0); } catch (e) { vivo = false; }
    if (vivo) { try { process.kill(serverPid, 'SIGKILL'); } catch (e) { /* nada */ } }
    t('B3 el boot murió por su PID exacto y el puerto quedó libre', !vivo && puertoLibre(PORT));
    try { fs.unlinkSync(seedFile); } catch (e) { /* nada */ }
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}

main();
