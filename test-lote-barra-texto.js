// =====================================================================
// LOTE BARRA-TEXTO — suite propia (boot real + Chromium)
// La línea de estado de la barra viva deja de decir el eslogan vago
// «todo al día» / «all up to date» (palabra del dueño 22/11 16:04:
// «que quiere decir "todo el dia"? esta un poco confuso. no me
// gusta») y dice el hecho concreto, un estado por hecho:
//   · ya salió (publicado_hoy) → «tu posteo de hoy ya salió» /
//     «today's post is out»
//   · listo (revelado) → el hecho con la hora que trae la carta
//     recomendada del ritual (hora_salida, la salida real en la zona
//     de la cuenta, formateada por idioma en el servidor):
//     «tu posteo de hoy sale a las 19:00» / «today's post goes out
//     at 7:00 PM»; sin ese dato, «tu posteo de hoy está listo» /
//     «today's post is ready»
// Los demás estados (pedido en curso, arranque honesto, armando)
// quedan byte-intactos. Base: HEAD 7636fb2b (SUBIR-BOTON-FIX).
//
//   A · Estática — la función existe una vez, el estado vago no está
//       en NINGÚN lugar del bundle (grep entero), los textos nuevos
//       existen, los estados intactos conservan su línea exacta y
//       la hora se lee del dato (recomendada.hora_salida).
//   B · HTTP contra el boot real — las fuentes del estado: el ritual
//       de cada semilla (publicado_hoy; hora_salida «19:00» ES y
//       «7:00 PM» EN, la misma salida de las 19:00 de Nueva York).
//   C · Chromium — los estados pintados en las dos lenguas por el
//       camino real (sesión → ritual → barra) y el ejercicio directo
//       de pzBarraEstadoComputar rama por rama en página ES y EN
//       (la paridad se ejercita, no se supone), incluida la hora
//       sintética distinta: la hora sale del dato, no está fija.
// Nota de hora: el estado «listo» pintado por el camino real supone
// que ya pasó la revelación de las 9:00 de la cuenta (abre_a); las
// ramas se ejercitan además de forma directa, sin depender del reloj.
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
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A0 node --check public/app.js', true); }
catch (e) { t('A0 node --check public/app.js', false, String(e.message).slice(0, 200)); }

t('A1 pzBarraEstadoComputar existe definida exactamente una vez',
  (appJs.match(/function pzBarraEstadoComputar\(/g) || []).length === 1);
t('A2 el estado vago no aparece en NINGÚN lugar del bundle',
  !appJs.includes('todo al día') && !appJs.includes('all up to date'));
const nuevos = ['tu posteo de hoy ya salió', "today's post is out",
  'tu posteo de hoy sale a las ', "today's post goes out at ",
  'tu posteo de hoy está listo', "today's post is ready"];
t('A3 los textos nuevos existen (las dos lenguas, las tres formas)',
  nuevos.every((s) => appJs.includes(s)), nuevos.filter((s) => !appJs.includes(s)).join(','));
const intactos = [
  "return en ? 'working on your request…' : 'trabajando en tu pedido…';",
  "return en ? 'working for you…' : 'trabajando para vos…';",
  'return en ? "putting today\'s post together…" : \'armando el posteo de hoy…\';',
];
t('A4 los estados intactos conservan su línea exacta (pedido, arranque, armando ×2)',
  intactos.every((s) => appJs.includes(s))
  && (appJs.match(/putting today's post together…/g) || []).length >= 2,
  intactos.filter((s) => !appJs.includes(s)).join(' | '));
t('A5 la hora se lee del dato: ritual.recomendada.hora_salida',
  appJs.includes('ritual.recomendada.hora_salida'));

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) { /* ya existe (la crea oficina.js al bootear) */ }
require(path.join(ROOT, 'guest-trial')).ensureSchema(db); // columnas del invitado (is_guest, guest_ig, guest_domain)
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, lang, extra) {
  const e = extra || {};
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
    VALUES (?, ?, ?, 'posty', 'active', 0, 0, 0, NULL, NULL, 1, ?, 1, '2026-09-01 10:00:00')\`).run(id, email, hash, lang);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)')
    .run(id, e.nombre || '', e.ig || '', 'café');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(601, 'salio@barratexto.test', 'es', { nombre: 'Café Salió', ig: 'cafesalio' });
usuario(602, 'listo@barratexto.test', 'es', { nombre: 'Café Listo', ig: 'cafelisto2' });
usuario(603, 'out@barratexto.test', 'en', { nombre: 'Out Café', ig: 'outcafe' });
usuario(604, 'ready@barratexto.test', 'en', { nombre: 'Ready Café', ig: 'readycafe' });
const f = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
// La pared de hoy 19:00 en America/New_York, como instante UTC.
function hoyParedUtc(hhmm, tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (k) => parts.find((p) => p.type === k).value;
  const fecha = g('year') + '-' + g('month') + '-' + g('day');
  const guess = new Date(fecha + 'T' + hhmm + ':00Z');
  const enTz = new Date(guess.toLocaleString('en-US', { timeZone: tz }));
  const enUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() + (enUtc - enTz));
}
const salidaHoy = hoyParedUtc('19:00', 'America/New_York');
// 601 y 603 · el posteo de hoy YA SALIÓ (publicado hace ~1 hora)
const hace1h = new Date(Date.now() - 3600000);
for (const uid of [601, 603]) {
  db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at, created_at)
    VALUES (?, '/media/semilla.jpg', 'El posteo de hoy, como todos los días.', 'published', 'image', ?, ?, ?)\`)
    .run(uid, f(new Date()), f(hace1h), f(hace1h));
}
// 602 y 604 · el posteo de hoy está LISTO: programado para hoy 19:00 NY
for (const uid of [602, 604]) {
  db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, created_at)
    VALUES (?, '/media/semilla.jpg', 'El posteo de hoy, listo para salir.', 'scheduled', 'image', ?, ?)\`)
    .run(uid, f(salidaHoy), f(new Date()));
}
console.log('semilla ok · salida de hoy (UTC): ' + salidaHoy.toISOString());
`;

async function main() {
  seccion('B · Boot real + HTTP');
  const PORT = buscarPuerto();
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'barra-texto-boot-'));
  const seedFile = path.join(os.tmpdir(), 'barra-texto-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-barratexto', DEMO_AI_DAILY_CAP_USD: '0' },
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
    return { status: r.status, cookie: m ? { name: m[1], value: m[2] } : null, header: setCookie.split(';')[0] };
  }
  async function getJson(p, cookieHeader) {
    const r = await fetch(base + p, { headers: cookieHeader ? { Cookie: cookieHeader } : {} });
    let j = null; try { j = await r.json(); } catch (e) { /* no json */ }
    return { status: r.status, json: j };
  }

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));

    const ses601 = await login('salio@barratexto.test');
    const ses602 = await login('listo@barratexto.test');
    const ses603 = await login('out@barratexto.test');
    const ses604 = await login('ready@barratexto.test');
    t('B2 login de las cuatro semillas (ES y EN)',
      !!(ses601.cookie && ses602.cookie && ses603.cookie && ses604.cookie),
      [ses601.status, ses602.status, ses603.status, ses604.status].join('/'));

    const rit601 = await getJson('/api/ritual/hoy', ses601.header);
    t('B3 la fuente del estado «ya salió»: el ritual de 601 marca publicado_hoy',
      !!(rit601.json && rit601.json.publicado_hoy === true), JSON.stringify(rit601.json).slice(0, 200));
    const rit602 = await getJson('/api/ritual/hoy', ses602.header);
    t('B4 la fuente del estado «listo con hora» ES: recomendada.hora_salida = «19:00» y no publicó',
      !!(rit602.json && rit602.json.publicado_hoy === false && rit602.json.recomendada
        && rit602.json.recomendada.hora_salida === '19:00'),
      JSON.stringify(rit602.json && rit602.json.recomendada).slice(0, 200));
    const rit604 = await getJson('/api/ritual/hoy', ses604.header);
    t('B5 la fuente del estado «listo con hora» EN: la MISMA salida, hora_salida = «7:00 PM»',
      !!(rit604.json && rit604.json.publicado_hoy === false && rit604.json.recomendada
        && rit604.json.recomendada.hora_salida === '7:00 PM'),
      JSON.stringify(rit604.json && rit604.json.recomendada).slice(0, 200));

    // ---------------- C · Chromium ----------------
    seccion('C · Chromium');
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
      const esperarEstado = async (page, texto, ms) => {
        try {
          await page.waitForFunction((tx) => {
            const el = document.getElementById('pzShellState');
            return el && el.textContent.trim() === tx;
          }, texto, { timeout: ms || 30000 });
          return true;
        } catch (e) { return false; }
      };
      const abrir = async (ses) => {
        const ctx = await mkCtx(ses);
        const page = await ctx.newPage();
        await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.pz-shell-head', { timeout: 20000 });
        return page;
      };

      // — el camino real, las dos lenguas —
      const p601 = await abrir(ses601);
      t('C1 ES pintado: el posteo de hoy ya salió',
        await esperarEstado(p601, 'tu posteo de hoy ya salió'),
        await p601.evaluate(() => (document.getElementById('pzShellState') || {}).textContent));
      const p602 = await abrir(ses602);
      t('C2 ES pintado: listo con la hora del dato («sale a las 19:00»)',
        await esperarEstado(p602, 'tu posteo de hoy sale a las 19:00'),
        await p602.evaluate(() => (document.getElementById('pzShellState') || {}).textContent));
      const p603 = await abrir(ses603);
      t("C3 EN pintado: today's post is out",
        await esperarEstado(p603, "today's post is out"),
        await p603.evaluate(() => (document.getElementById('pzShellState') || {}).textContent));
      const p604 = await abrir(ses604);
      t("C4 EN pintado: listo con la hora del dato («goes out at 7:00 PM»)",
        await esperarEstado(p604, "today's post goes out at 7:00 PM"),
        await p604.evaluate(() => (document.getElementById('pzShellState') || {}).textContent));

      // — el ejercicio directo de la función, rama por rama —
      const ramas = (horaPropia) => ({
        lang: (typeof ME !== 'undefined' && ME && ME.lang) || '',
        publicado: pzBarraEstadoComputar({ ok: true, publicado_hoy: true }, null),
        listoHora: pzBarraEstadoComputar({ ok: true, hoy: '2026-11-22', recomendada: { hora_salida: horaPropia } }, null),
        listoSinHora: pzBarraEstadoComputar({ ok: true, hoy: '2026-11-22', recomendada: {} }, null),
        armando: pzBarraEstadoComputar({ ok: true, hoy: null, recomendada: null }, null),
        pedido: pzBarraEstadoComputar({ ok: true, hoy: '2026-11-22', recomendada: {} }, { estado: 'recibida' }),
        arranque: pzBarraEstadoComputar(null, null),
      });
      const rEs = await p601.evaluate(ramas, '20:00');
      t('C5 la función en página ES: las seis ramas dicen su hecho (la hora sintética 20:00 sale del dato)',
        rEs.lang === 'es'
        && rEs.publicado === 'tu posteo de hoy ya salió'
        && rEs.listoHora === 'tu posteo de hoy sale a las 20:00'
        && rEs.listoSinHora === 'tu posteo de hoy está listo'
        && rEs.armando === 'armando el posteo de hoy…'
        && rEs.pedido === 'trabajando en tu pedido…'
        && rEs.arranque === 'trabajando para vos…',
        JSON.stringify(rEs));
      const rEn = await p603.evaluate(ramas, '8:00 PM');
      t('C6 la función en página EN: las seis ramas dicen su hecho (paridad ejercitada)',
        rEn.lang === 'en'
        && rEn.publicado === "today's post is out"
        && rEn.listoHora === "today's post goes out at 8:00 PM"
        && rEn.listoSinHora === "today's post is ready"
        && rEn.armando === "putting today's post together…"
        && rEn.pedido === 'working on your request…'
        && rEn.arranque === 'working for you…',
        JSON.stringify(rEn));
      const todos = [rEs, rEn].flatMap((r) => Object.values(r));
      t('C7 ningún estado computado ni pintado contiene el eslogan vago',
        todos.every((s) => !String(s).includes('todo al día') && !String(s).includes('all up to date')));
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
    t('B6 el boot murió por su PID exacto y el puerto quedó libre', !vivo && puertoLibre(PORT));
    try { fs.unlinkSync(seedFile); } catch (e) { /* nada */ }
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}

main();
