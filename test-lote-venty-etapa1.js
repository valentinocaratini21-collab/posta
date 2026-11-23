// test-lote-venty-etapa1.js — Suite del LOTE VENTY-ETAPA-1 (22/11/2026):
// la primera etapa de la máquina interna de Venty, aprobada por el
// dueño el 22/11 (diseño venty-vende-posty-diseno.md §0/§2/§3).
//
//   A · El generador (tools/venty-consola-sync.js) lee las fuentes
//       reales de la operación de representantes y produce los
//       números del inventario verificado del diseño; el JSON del
//       repo (venty-data/consola.json) es esa misma salida.
//   B · Boot real: la puerta de la consola es la identidad de casa
//       (esCuentaPropia) — la casa y su espejo por IG entran; el
//       cliente Total, el trial ajeno y el anónimo quedan fuera.
//   C · Chromium 390px: la casa ve el conmutador, entra a Venty y
//       lee Listas y Capacidad con los números de las fuentes, pasa
//       por Gesty y vuelve a Posty; un cliente no ve a Venty en
//       ningún lado y su barra es la de siempre.
//
//   REVISIÓN DE DISEÑO (22/11, el mismo día; aprobada por el dueño
//   en dos tandas, la segunda con «Aplicá las cinco»): la consola
//   fría pasa a ser la pantalla BUSCAR y el modo Venty gana su cara
//   propia — Hoy (hecho de hoy, cara, frase del día, norte con
//   movimientos semanales de las fuentes, próximo paso, necesita tu
//   ojo, Partidas en una línea), Partidas y Estrategia con su
//   estado real, barra inferior propia del modo, flotante-cara solo
//   fuera de Hoy, y el VERDE de Venty en el punto y los acentos.
//   La parte A suma los movimientos (con fecha fijada: --hoy), la
//   frase del día y el próximo paso; la C suma los casos de Hoy,
//   Partidas, Estrategia y el de «sin dato, sin flecha» (JSON
//   recortado: sin frase, sin paso, sin movimientos, banda en
//   cuenta regresiva).
//   CONTROL (VENTY_CONTROL=1, contra la base prístina): los
//   endpoints no existen (404) y la barra de la casa es la clásica,
//   sin conmutador ni hoja.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const CONTROL = process.env.VENTY_CONTROL === '1';
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------ A
if (CONTROL) console.log('\nA · (control contra la base prístina: sin generador ni datos — la parte A se omite)');
else {
console.log('\nA · El generador lee las fuentes reales de la operación');
const tmpJson = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'venty-sync-')), 'consola.json');
let gen = null;
try {
  const out = execFileSync('node', [path.join(ROOT, 'tools', 'venty-consola-sync.js'), '--hoy', '2026-11-22', '--salida', tmpJson], { encoding: 'utf8' });
  gen = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
  console.log('  ', out.trim().split('\n').join('\n   '));
} catch (e) { ok('A0 el generador corre contra las fuentes reales', false, String(e.message || e).slice(0, 200)); }
if (gen) {
  const L = gen.listas, C = gen.capacidad;
  ok('A1 Tier A estricto = 697 (la suma por ciudad cierra contra el TOTAL declarado)',
    L.tier_a_total === 697 && L.tier_a_por_ciudad.reduce((a, c) => a + c.total, 0) === 697,
    JSON.stringify(L.tier_a_por_ciudad.map(c => [c.ciudad, c.total])));
  ok('A2 Tier A por ciudad: NYC 170 · Bay Area 259 · LA 50 · Chicago 33 · Miami 30 · Boston 155',
    JSON.stringify(L.tier_a_por_ciudad.map(c => c.total)) === JSON.stringify([170, 259, 50, 33, 30, 155]));
  ok('A3 universo registrado 4.378 · con IG 2.589 (inventario del diseño, asiento del tablero 20/11)',
    L.registrados === 4378 && L.con_ig === 2589, L.registrados + '/' + L.con_ig);
  ok('A4 Tier B contado ≈490 · cola 893 (503 con IG) · pool sin-IG 592',
    L.tier_b_contado === 490 && L.cola.total === 893 && L.cola.con_ig === 503 && L.pool_sin_ig === 592);
  ok('A5 grilla Argentina: 5.267 puestos · 229 rubros · 23 territorios · todos dormidos (conteo CSV real)',
    L.grilla_argentina.puestos === 5267 && L.grilla_argentina.rubros === 229 && L.grilla_argentina.territorios === 23 && L.grilla_argentina.dormidos === 5267,
    JSON.stringify(L.grilla_argentina));
  ok('A6 identidades de representante = 5.496 (conteo CSV real)',
    L.identidades_representante === 5496, String(L.identidades_representante));
  ok('A7 capacidad de hoy = 250/día (techo de la rampa) · meta 1.800/día (50.000/mes)',
    C.capacidad_hoy === 250 && C.meta_diaria === 1800 && C.meta_mes === 50000);
  ok('A8 calentamiento real: 300 envíos registrados, 300 OK, dominio postyforbusiness.com',
    C.calentamiento.envios === 300 && C.calentamiento.envios_ok === 300 && C.calentamiento.dominio === 'postyforbusiness.com',
    JSON.stringify(C.calentamiento));
  ok('A10 movimientos semanales con fecha (al 22/11): la rampa subió +55 desde el 16/11 (20→75 por día)',
    !!(gen.movimientos && gen.movimientos.capacidad && gen.movimientos.capacidad.delta === 55 && gen.movimientos.capacidad.desde === '2026-11-16'),
    JSON.stringify(gen.movimientos));
  ok('A11 el Tier A bajó −712 en la semana (1.409→697) CON su causa leída de la fuente: la vara nueva del 16/11',
    !!(gen.movimientos && gen.movimientos.tier_a && gen.movimientos.tier_a.delta === -712 && gen.movimientos.tier_a.causa_es === 'la vara nueva del 16/11'),
    JSON.stringify(gen.movimientos && gen.movimientos.tier_a));
  ok('A12 el universo con IG NO lleva movimiento: ninguna fuente trae su serie fechada (sin dato, sin flecha — nunca inventado)',
    !!(gen.movimientos && !('con_ig' in gen.movimientos)), JSON.stringify(gen.movimientos));
  ok('A13 la frase del día existe, está en minúscula (la voz de Venty) y dice un hecho real de las fuentes',
    !!(gen.frase_del_dia && gen.frase_del_dia.es === gen.frase_del_dia.es.toLowerCase() && /(día|correos|negocios)/.test(gen.frase_del_dia.es)),
    gen.frase_del_dia && gen.frase_del_dia.es);
  ok('A14 el próximo paso de Venty sale de la fuente de la operación: sumar negocios con IG, meta de diciembre ~15–17 mil',
    !!(gen.proximo_paso && /15–17/.test(gen.proximo_paso.meta_es) && /Instagram/.test(gen.proximo_paso.frente_es)),
    JSON.stringify(gen.proximo_paso));
  const tmpJson16 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'venty-sync16-')), 'consola.json');
  const gen16 = JSON.parse(execFileSync('node', [path.join(ROOT, 'tools', 'venty-consola-sync.js'), '--hoy', '2026-11-16', '--salida', tmpJson16], { encoding: 'utf8' }) && fs.readFileSync(tmpJson16, 'utf8'));
  ok('A15 al 16/11 (el día que la rampa nació) la capacidad NO tiene movimiento: un solo punto no es un avance',
    !!(gen16.movimientos && !gen16.movimientos.capacidad), JSON.stringify(gen16.movimientos));
  const repo = JSON.parse(fs.readFileSync(path.join(ROOT, 'venty-data', 'consola.json'), 'utf8'));
  const repoHoy = String(repo.generado_en || '').slice(0, 10);
  const tmpJsonRepo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'venty-syncrepo-')), 'consola.json');
  execFileSync('node', [path.join(ROOT, 'tools', 'venty-consola-sync.js'), '--hoy', repoHoy, '--salida', tmpJsonRepo], { encoding: 'utf8' });
  const genRepo = JSON.parse(fs.readFileSync(tmpJsonRepo, 'utf8'));
  ok('A9 el JSON del repo es la salida del generador (listas, capacidad, movimientos, frase y paso — sin copia a mano)',
    JSON.stringify(repo.listas) === JSON.stringify(genRepo.listas) && JSON.stringify(repo.capacidad) === JSON.stringify(genRepo.capacidad)
    && JSON.stringify(repo.movimientos) === JSON.stringify(genRepo.movimientos) && JSON.stringify(repo.frase_del_dia) === JSON.stringify(genRepo.frase_del_dia)
    && JSON.stringify(repo.proximo_paso) === JSON.stringify(genRepo.proximo_paso));
}
}

// ------------------------------------------------------------ B/C
function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 20151; p < 20251; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}
function seedBootDir(dir) {
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const dbm = require(${JSON.stringify(path.join(ROOT, 'db.js'))});
    const db = dbm.db || dbm;
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('clave-prueba-1', 10);
    function formaReal(uid, email, ig) {
      db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(uid, email, hash);
      db.prepare("UPDATE users SET plan = 'trial', plan_status = 'trial', trial_ends_at = 1791299328075, trial_extended_until = 1801413964874 WHERE id = ?").run(uid);
      try { db.prepare("UPDATE users SET publishing_stopped = 1 WHERE id = ?").run(uid); } catch (e) {}
      db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'Posty', 'community manager', 'amable', ?, 1)").run(uid, ig);
      db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, 'tok-falso')").run(uid, 'IG' + uid);
    }
    // LA CASA con LA FORMA REAL de producción (trial/trial, id 12).
    formaReal(12, 'casa@posty.example', 'posty.communitymanager');
    // LA CASA POR IG (espejo EN): id fuera de HOUSE_USER_IDS.
    formaReal(77, 'espejo@posty.example', 'postycommunitymanager');
    // EL TRIAL QUE NO ES LA CASA.
    formaReal(78, 'ana@panaderia.example', 'panaderia.ana');
    // EL CLIENTE Total activo.
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (79, 'dueno@coffee.example', ?)").run(hash);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = 79").run();
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (79, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run();
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (79, 'IG79', 'tok-falso')").run();
    console.log('SEEDED');
  `;
  return execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } }).trim();
}
async function boot(dir) {
  const port = freePort();
  ok('el puerto del boot está libre antes de arrancar (' + port + ')', portFree(port));
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, MEDIA_DIR: path.join(dir, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  proc.stdout.on('data', d => { bootLog += d; });
  proc.stderr.on('data', d => { bootLog += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
  return { proc, base, port, up, bootLog: () => bootLog };
}
async function killBoot(b, tag) {
  try { process.kill(b.proc.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  ok(tag + ' el boot muere por PID exacto y el puerto queda libre', portFree(b.port));
}
async function login(base, email) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'clave-prueba-1' }) });
  return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  console.log('\nB · Boot real: la puerta de la consola es la identidad de casa');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venty-etapa1-boot-'));
  console.log('  seed:', seedBootDir(dir));
  const b = await boot(dir);
  try {
    ok('B1 el servidor levanta', b.up, b.bootLog().slice(-300));
    if (b.up) {
      const lc = await login(b.base, 'casa@posty.example');
      const le = await login(b.base, 'espejo@posty.example');
      const lk = await login(b.base, 'dueno@coffee.example');
      const la = await login(b.base, 'ana@panaderia.example');
      ok('B2 login de las cuatro cuentas', [lc, le, lk, la].every(x => x.status === 200 && !!x.cookie));
      const H = (c) => ({ Cookie: c, 'Content-Type': 'application/json' });
      if (!CONTROL) {
        const pCasa = await (await fetch(b.base + '/api/venty/puerta', { headers: H(lc.cookie) })).json();
        ok('B3 /api/venty/puerta: la casa (id 12) = casa:true', pCasa.ok === true && pCasa.casa === true, JSON.stringify(pCasa));
        const pEspejo = await (await fetch(b.base + '/api/venty/puerta', { headers: H(le.cookie) })).json();
        ok('B4 /api/venty/puerta: la casa por IG (espejo EN, id fuera de la lista) = casa:true', pEspejo.casa === true, JSON.stringify(pEspejo));
        const pCli = await (await fetch(b.base + '/api/venty/puerta', { headers: H(lk.cookie) })).json();
        ok('B5 /api/venty/puerta: el cliente Total = casa:false', pCli.casa === false, JSON.stringify(pCli));
        const rCons = await fetch(b.base + '/api/venty/consola', { headers: H(lc.cookie) });
        const cons = await rCons.json().catch(() => ({}));
        ok('B6 /api/venty/consola: la casa lee Listas y Capacidad con los números de las fuentes',
          rCons.status === 200 && cons.ok === true && cons.listas.tier_a_total === 697 && cons.listas.registrados === 4378 && cons.capacidad.capacidad_hoy === 250 && cons.capacidad.meta_diaria === 1800,
          'status=' + rCons.status + ' body=' + JSON.stringify(cons).slice(0, 200));
        const rCli = await fetch(b.base + '/api/venty/consola', { headers: H(lk.cookie) });
        ok('B7 /api/venty/consola: el cliente Total queda fuera (403)', rCli.status === 403, 'status=' + rCli.status);
        const rTrial = await fetch(b.base + '/api/venty/consola', { headers: H(la.cookie) });
        ok('B8 /api/venty/consola: el trial que no es la casa queda fuera (403)', rTrial.status === 403, 'status=' + rTrial.status);
        const rAnon = await fetch(b.base + '/api/venty/consola');
        ok('B9 /api/venty/consola: sin sesión no entra (401)', rAnon.status === 401, 'status=' + rAnon.status);
        ok('B10 la consola declara su puerta de envío cerrada (nada envía nada)',
          cons.capacidad.puerta_envio === 'cerrada hasta el 1° de febrero de 2027', JSON.stringify(cons.capacidad.puerta_envio));
        ok('B10b la consola trae los datos de la pantalla Hoy: movimientos, frase del día y próximo paso',
          !!(cons.movimientos && cons.movimientos.capacidad && cons.movimientos.tier_a && cons.frase_del_dia && cons.frase_del_dia.es && cons.proximo_paso),
          JSON.stringify(Object.keys(cons)));
      } else {
        const rCons = await fetch(b.base + '/api/venty/consola', { headers: H(lc.cookie) });
        const rPue = await fetch(b.base + '/api/venty/puerta', { headers: H(lc.cookie) });
        ok('B-CONTROL la base prístina no conoce la consola ni la puerta (404/404)',
          rCons.status === 404 && rPue.status === 404, 'consola=' + rCons.status + ' puerta=' + rPue.status);
      }

      console.log('\nC · Chromium 390px: el conmutador y los modos de agente');
      await chromiumSuite(b.base, lc.cookie, lk.cookie);
    }
  } finally { await killBoot(b, 'B11'); }

  console.log(`\nRESULTADO: ${pass} ✓ · ${fail} ✗`);
  if (fails.length) { console.log('FALLAS:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(1); });

async function chromiumSuite(base, cookieCasa, cookieCliente) {
  let pw = null;
  for (const p of ['/tmp/pw-boot/node_modules/playwright-core', path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { pw = require(p); break; } catch (e) {}
  }
  if (!pw) { ok('C0 playwright-core disponible', false, 'no se encontró el módulo'); return; }
  const fsx = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright')).filter(d => d.startsWith('chromium') && !d.includes('headless'));
  let exe = '';
  for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
    const cand = path.join(os.homedir(), '.cache/ms-playwright', fsx[0], sub);
    if (fs.existsSync(cand)) { exe = cand; break; }
  }
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const repo = CONTROL ? null : JSON.parse(fs.readFileSync(path.join(ROOT, 'venty-data', 'consola.json'), 'utf8'));
    // ---------------- LA CASA ----------------
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const [n1, v1] = cookieCasa.split('=');
    await ctx.addCookies([{ name: n1, value: v1, url: base }]);
    const page = await ctx.newPage();
    await page.goto(base + '/#/app/inicio', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    if (!CONTROL) {
      const chev = await page.waitForSelector('.pz-shell-chev', { timeout: 30000 }).then(() => true).catch(() => false);
      ok('C1 la barra de la casa gana el conmutador (chevron junto a «Posty.»)', chev);
      await page.click('.pz-shell-ident');
      const hoja = await page.waitForSelector('#pzAgenteOv', { timeout: 10000 }).then(() => true).catch(() => false);
      const hojaTxt = hoja ? await page.evaluate(() => document.getElementById('pzAgenteOv').innerText) : '';
      ok('C2 un toque sobre el nombre abre la hoja-filtro con Posty, Gesty y Venty (Posty = «Estás acá»)',
        hoja && /Posty/.test(hojaTxt) && /Gesty/.test(hojaTxt) && /Venty/.test(hojaTxt) && /Estás acá/.test(hojaTxt), hojaTxt.slice(0, 200));
      await page.evaluate(() => { const rows = [...document.querySelectorAll('.pz-agente-row')]; const v = rows.find(r => /Venty/.test(r.textContent)); if (v) v.click(); });
      await page.waitForFunction(() => location.hash.startsWith('#/app/venty'), { timeout: 15000 }).catch(() => {});
      const enVenty = await page.waitForSelector('.pzv-cara', { timeout: 30000 }).then(() => true).catch(() => false);
      const barra = await page.evaluate(() => {
        const who = document.querySelector('.pz-shell-who b');
        const st = document.getElementById('pzShellState');
        return { nombre: who ? who.textContent : '', estado: st ? st.textContent : '' };
      });
      ok('C3 al elegir Venty se abre su pantalla HOY (la cara grande) y la barra dice «Venty.» con su hecho vivo (capacidad de hoy: 250 por día)',
        enVenty && /Venty/.test(barra.nombre) && /capacidad de envío hoy: 250 por día/.test(barra.estado),
        JSON.stringify(barra));
      // Las expectativas de Hoy salen del JSON del repo (las fuentes),
      // no de números escritos a mano en la suite.
      const rp = repo.capacidad.rampa_hoy || {};
      const diasVenta = (() => { const a = new Date(); return Math.round((Date.UTC(2027, 1, 1) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); })();
      const chipEsperado = diasVenta > 1 ? 'la venta abre en ' + diasVenta + ' días' : diasVenta === 1 ? 'la venta abre mañana' : diasVenta === 0 ? 'la venta abre hoy' : 'la puerta de envío está abierta';
      const hoy = await page.evaluate(() => {
        const t = (sel) => { const el = document.querySelector(sel); return el ? el.textContent : ''; };
        const cels = [...document.querySelectorAll('.pzv-cel')];
        return {
          banda: t('.pzv-banda'), chip: t('.pzv-chip'), frase: t('.pzv-frase'),
          cara: !!document.querySelector('.pzv-cara'), flotante: !!document.querySelector('.pzv-float'),
          norte: cels.map(c => c.textContent), movs: cels.map(c => !!c.querySelector('.pzv-mov')),
          texto: document.body.innerText || '',
          tabs: [...document.querySelectorAll('.pzv-tab')].map(b => ({ txt: b.textContent.trim(), on: b.classList.contains('on') })),
        };
      });
      ok('C4 Hoy se abre con el HECHO DE HOY en la banda (los correos de calentamiento de la rampa vigente) y el chip chico con la cuenta regresiva de la fecha real',
        hoy.banda.includes('hoy: ' + rp.total + ' correos de calentamiento') && hoy.banda.includes('día ' + rp.dia + ' de rampa') && hoy.chip === chipEsperado,
        hoy.banda + ' | chip: ' + hoy.chip + ' | esperado: ' + chipEsperado);
      ok('C5 la cara aparece UNA sola vez en Hoy (la grande; sin flotante) y su frase es la frase del día del generador, en minúscula',
        hoy.cara && !hoy.flotante && hoy.frase === repo.frase_del_dia.es && hoy.frase === hoy.frase.toLowerCase(),
        hoy.frase.slice(0, 120));
      ok('C6 Tu norte: los tres números con su contexto y su movimiento semanal de las fuentes (capacidad ↑55 · Tier A ↓712 con su causa · con IG SIN flecha)',
        hoy.norte.length === 3
        && hoy.norte[0].includes('250') && hoy.norte[0].includes('meta 1.800/día') && hoy.norte[0].includes('↑ 55 esta semana')
        && hoy.norte[1].includes('697') && hoy.norte[1].includes('↓ 712 esta semana') && hoy.norte[1].includes('la vara nueva del 16/11')
        && hoy.norte[2].includes('2.589') && hoy.norte[2].includes('de 4.378 registrados') && hoy.movs[0] === true && hoy.movs[1] === true && hoy.movs[2] === false,
        JSON.stringify(hoy.norte));
      ok('C7 Hoy trae el próximo paso DE VENTY (sumar negocios con IG · meta ~15–17 mil), el «Necesita tu ojo» de enero con su salida y Partidas en una línea',
        /PRÓXIMO PASO DE VENTY/.test(hoy.texto) && /Seguir sumando negocios con Instagram/.test(hoy.texto) && /15–17 mil con Instagram/.test(hoy.texto)
        && /NECESITA TU OJO/.test(hoy.texto) && /La plataforma de envío se decide en enero/.test(hoy.texto) && /Ver las opciones/.test(hoy.texto)
        && /Partidas/.test(hoy.texto) && /nada esperando tu toque/.test(hoy.texto),
        hoy.texto.slice(0, 300));
      ok('C8 la barra inferior es la del modo Venty (Hoy · Partidas · Buscar · Estrategia, con Hoy activa)',
        hoy.tabs.length === 4 && hoy.tabs[0].txt.includes('Hoy') && hoy.tabs[1].txt.includes('Partidas') && hoy.tabs[2].txt.includes('Buscar') && hoy.tabs[3].txt.includes('Estrategia') && hoy.tabs[0].on === true,
        JSON.stringify(hoy.tabs));
      const botonesEnvio = await page.evaluate(() => {
        const main = document.querySelector('.pzv-wrap');
        if (!main) return -1;
        return [...main.querySelectorAll('button')].filter(x => /enviar|send/i.test(x.textContent || '')).length;
      });
      ok('C8b Hoy no tiene ningún botón de envío (nada envía nada)', botonesEnvio === 0, 'botones=' + botonesEnvio);
      await page.screenshot({ path: path.join(ROOT, 'qa-venty-hoy-390.png'), fullPage: true });
      // La cara grande ES la entrada a la conversación con Venty.
      // (La conversación del registrado vive en Inicio: desde
      // TAB-SUBIR, 13/11, la ruta #/app/chat es solo del invitado y
      // al registrado lo devuelve a Inicio — verificado en el árbol.)
      await page.click('.pzv-cara');
      await page.waitForFunction(() => location.hash.startsWith('#/app/inicio'), { timeout: 15000 }).catch(() => {});
      const hashChat = await page.evaluate(() => location.hash);
      ok('C9 tocar la cara de Hoy abre la conversación (Inicio, donde el registrado habla con su agente; la cara es la entrada, con su pista)',
        hashChat.startsWith('#/app/inicio'), hashChat);
      await page.evaluate(() => { location.hash = '#/app/venty'; });
      await page.waitForSelector('.pzv-cara', { timeout: 30000 }).catch(() => {});
      // BUSCAR desde la barra del modo: la consola de la etapa 1
      await page.evaluate(() => { const t = [...document.querySelectorAll('.pzv-tab')].find(b => /Buscar/.test(b.textContent)); if (t) t.click(); });
      await page.waitForFunction(() => location.hash.startsWith('#/app/venty/buscar'), { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(() => /LISTAS DE NEGOCIOS/.test(document.body.innerText || ''), { timeout: 30000 }).catch(() => {});
      const buscar = await page.evaluate(() => ({
        texto: document.body.innerText || '',
        flotante: !!document.querySelector('.pzv-float'),
        tabOn: (() => { const t = [...document.querySelectorAll('.pzv-tab')].find(b => /Buscar/.test(b.textContent)); return t ? t.classList.contains('on') : false; })(),
      }));
      ok('C10 BUSCAR es la consola de siempre con su lenguaje nuevo: títulos en palabras llanas, su línea de qué es y los números byte a byte de las fuentes',
        /Buscar/.test(buscar.texto) && /LISTAS DE NEGOCIOS/.test(buscar.texto) && /Los negocios a los que Venty les va a vender Posty/.test(buscar.texto)
        && /4\.378/.test(buscar.texto) && /2\.589/.test(buscar.texto) && /Tier A estricto/.test(buscar.texto) && /697/.test(buscar.texto) && /Nueva York/.test(buscar.texto) && /170/.test(buscar.texto) && /5\.267/.test(buscar.texto)
        && /CAPACIDAD DE ENVÍO/.test(buscar.texto) && /Cuántos correos por día puede mandar la casa/.test(buscar.texto) && /250\/día/.test(buscar.texto) && /1\.800\/día/.test(buscar.texto) && /300/.test(buscar.texto) && /postyforbusiness\.com/.test(buscar.texto) && /cerrada hasta el 1° de febrero de 2027/.test(buscar.texto),
        buscar.texto.slice(0, 300));
      ok('C10b en Buscar vive el flotante-cara («hablar con venty», apoyado sobre la barra) y su pestaña es la activa',
        buscar.flotante && buscar.tabOn, JSON.stringify({ f: buscar.flotante, on: buscar.tabOn }));
      await page.screenshot({ path: path.join(ROOT, 'qa-venty-consola-390.png'), fullPage: true });
      // El flotante-cara también es la entrada a la conversación
      await page.click('.pzv-float');
      await page.waitForFunction(() => location.hash.startsWith('#/app/inicio'), { timeout: 15000 }).catch(() => {});
      const hashFloat = await page.evaluate(() => location.hash);
      ok('C10c el flotante-cara abre la conversación (Inicio), apoyado sobre la barra en las pantallas sin cara grande',
        hashFloat.startsWith('#/app/inicio'), hashFloat);
      await page.evaluate(() => { location.hash = '#/app/venty/buscar'; });
      await page.waitForFunction(() => /LISTAS DE NEGOCIOS/.test(document.body.innerText || ''), { timeout: 30000 }).catch(() => {});
      // PARTIDAS desde la barra del modo
      await page.evaluate(() => { const t = [...document.querySelectorAll('.pzv-tab')].find(b => /Partidas/.test(b.textContent)); if (t) t.click(); });
      await page.waitForFunction(() => location.hash.startsWith('#/app/venty/partidas'), { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(() => /Todavía no hay partidas/.test(document.body.innerText || ''), { timeout: 30000 }).catch(() => {});
      const partidas = await page.evaluate(() => ({
        texto: document.body.innerText || '',
        flotante: !!document.querySelector('.pzv-float'),
        pillEsBoton: (() => { const p = document.querySelector('.pzv-pill-tomar'); return p ? p.tagName === 'BUTTON' : null; })(),
      }));
      ok('C11 PARTIDAS muestra su estado real (todavía no hay: la puerta abre el 1° de febrero), sus canales y la mecánica Tomar / Que siga Venty como explicación — no como botones sin objeto',
        /Todavía no hay partidas/.test(partidas.texto) && /WhatsApp/.test(partidas.texto) && /Instagram/.test(partidas.texto) && /Email/.test(partidas.texto)
        && /Tomar la partida/.test(partidas.texto) && /Que siga Venty/.test(partidas.texto) && partidas.pillEsBoton === false && partidas.flotante,
        partidas.texto.slice(0, 240));
      // ESTRATEGIA desde el «Ver las opciones» de Hoy (la salida del ojo)
      await page.evaluate(() => { const t = [...document.querySelectorAll('.pzv-tab')].find(b => /Hoy/.test(b.textContent)); if (t) t.click(); });
      await page.waitForSelector('.pzv-btn', { timeout: 30000 }).catch(() => {});
      await page.click('.pzv-btn');
      await page.waitForFunction(() => location.hash.startsWith('#/app/venty/estrategia'), { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(() => /primer parte llega con la primera ola/.test(document.body.innerText || ''), { timeout: 30000 }).catch(() => {});
      const estrategia = await page.evaluate(() => ({ texto: document.body.innerText || '', flotante: !!document.querySelector('.pzv-float') }));
      ok('C12 «Ver las opciones» abre ESTRATEGIA: su primer parte llega con la primera ola y ahí vive la decisión de enero (con su flotante-cara)',
        /El primer parte llega con la primera ola/.test(estrategia.texto) && /La plataforma de envío se decide en enero/.test(estrategia.texto) && estrategia.flotante,
        estrategia.texto.slice(0, 240));
      // SIN DATO, SIN FLECHA: el mismo Hoy con un JSON recortado
      const repoPath = path.join(ROOT, 'venty-data', 'consola.json');
      const repoBak = fs.readFileSync(repoPath, 'utf8');
      try {
        const rec = JSON.parse(repoBak);
        delete rec.frase_del_dia; delete rec.proximo_paso; delete rec.movimientos; delete rec.capacidad.rampa_hoy;
        fs.writeFileSync(repoPath, JSON.stringify(rec, null, 2));
        await sleep(1300);
        await page.evaluate(() => { location.hash = '#/app/inicio'; });
        await sleep(800);
        await page.evaluate(() => { location.hash = '#/app/venty'; });
        await page.waitForSelector('.pzv-cara', { timeout: 30000 }).catch(() => {});
        await sleep(800);
        const sin = await page.evaluate(() => ({
          banda: (document.querySelector('.pzv-banda') || {}).textContent || '',
          chip: !!document.querySelector('.pzv-chip'),
          frase: !!document.querySelector('.pzv-frase'),
          movs: document.querySelectorAll('.pzv-mov').length,
          paso: /PRÓXIMO PASO/.test(document.body.innerText || ''),
        }));
        ok('C13 sin dato, sin flecha: sin rampa de hoy la banda cae a la cuenta regresiva (y el chip no se duplica); sin frase, paso ni movimientos en los datos, Hoy no inventa nada',
          /la venta abre|puerta de envío está abierta/.test(sin.banda) && !sin.chip && !sin.frase && sin.movs === 0 && !sin.paso,
          JSON.stringify(sin));
      } finally {
        fs.writeFileSync(repoPath, repoBak);
        await sleep(1300);
        await page.evaluate(() => { location.hash = '#/app/inicio'; });
        await sleep(600);
        await page.evaluate(() => { location.hash = '#/app/venty'; });
        await page.waitForSelector('.pzv-cara', { timeout: 30000 }).catch(() => {});
      }
      // Gesty desde el filtro
      await page.click('.pz-shell-ident');
      await page.waitForSelector('#pzAgenteOv', { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => { const rows = [...document.querySelectorAll('.pz-agente-row')]; const g = rows.find(r => /Gesty/.test(r.textContent)); if (g) g.click(); });
      await page.waitForFunction(() => location.hash.startsWith('#/app/gesty'), { timeout: 15000 }).catch(() => {});
      const pronto = await page.waitForSelector('.pzv-pronto', { timeout: 30000 }).then(() => true).catch(() => false);
      const barraG = await page.evaluate(() => { const who = document.querySelector('.pz-shell-who b'); return who ? who.textContent : ''; });
      const cuerpoG = await page.evaluate(() => document.body.innerText || '');
      ok('C14 Gesty en el filtro lleva a su tarjeta: barra «Gesty.» y «Llega el 2 de junio de 2027»',
        pronto && /Gesty/.test(barraG) && /Llega el 2 de junio de 2027/.test(cuerpoG), barraG + ' · ' + cuerpoG.slice(0, 160));
      // Vuelta a Posty desde el filtro
      await page.click('.pz-shell-ident');
      await page.waitForSelector('#pzAgenteOv', { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => { const rows = [...document.querySelectorAll('.pz-agente-row')]; const p = rows.find(r => /Posty/.test(r.textContent)); if (p) p.click(); });
      await page.waitForFunction(() => location.hash.startsWith('#/app/inicio'), { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      const barraP = await page.evaluate(() => { const who = document.querySelector('.pz-shell-who b'); return who ? who.textContent : ''; });
      ok('C15 el conmutador vuelve: elegir Posty regresa a Inicio con la barra «Posty.»', /Posty/.test(barraP), barraP);
    } else {
      await sleep(4000);
      const sinConmuta = await page.evaluate(() => !document.querySelector('.pz-shell-chev') && !document.querySelector('.pz-shell-ident[data-conmuta="1"]'));
      ok('C-CONTROL la casa en la base prístina NO tiene conmutador (la barra de siempre)', sinConmuta);
      await page.click('.pz-shell-ident');
      await sleep(1500);
      const sinHoja = await page.evaluate(() => !document.getElementById('pzAgenteOv'));
      ok('C-CONTROL tocar el nombre no abre ninguna hoja (navega como siempre)', sinHoja);
    }
    await ctx.close();

    // ---------------- EL CLIENTE ----------------
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const [n2, v2] = cookieCliente.split('=');
    await ctx2.addCookies([{ name: n2, value: v2, url: base }]);
    const page2 = await ctx2.newPage();
    await page2.goto(base + '/#/app/inicio', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(4000);
    if (!CONTROL) {
      const limpio = await page2.evaluate(() => ({
        chev: !!document.querySelector('.pz-shell-chev'),
        conmuta: !!document.querySelector('.pz-shell-ident[data-conmuta="1"]'),
        nombre: (document.querySelector('.pz-shell-who b') || {}).textContent || '',
        tabsVenty: document.querySelectorAll('.pzv-tab').length,
        flotante: !!document.querySelector('.pzv-float'),
      }));
      ok('C16 el cliente no ve el conmutador ni el modo Venty en ningún lado (sin chevron, sin rebind, sin pestañas de Venty, sin flotante, barra «Posty.»)',
        !limpio.chev && !limpio.conmuta && /Posty/.test(limpio.nombre) && limpio.tabsVenty === 0 && !limpio.flotante, JSON.stringify(limpio));
      await page2.click('.pz-shell-ident');
      await sleep(1500);
      const sinHoja2 = await page2.evaluate(() => !document.getElementById('pzAgenteOv'));
      ok('C17 tocar el nombre, para el cliente, navega como siempre (ninguna hoja)', sinHoja2);
      await page2.goto(base + '/#/app/venty', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await sleep(3000);
      const rebote = await page2.evaluate(() => ({ hash: location.hash, consola: /LISTAS DE NEGOCIOS|TU NORTE/.test(document.body.innerText || '') }));
      ok('C18 la ruta de Venty no existe para el cliente: rebota a Inicio y ninguna pantalla de Venty se pinta',
        rebote.hash.startsWith('#/app/inicio') && !rebote.consola, JSON.stringify(rebote));
    } else {
      const limpio = await page2.evaluate(() => !document.querySelector('.pz-shell-chev'));
      ok('C-CONTROL el cliente en la base tampoco tiene conmutador', limpio);
    }
    await ctx2.close();
  } finally { await browser.close(); }
}
