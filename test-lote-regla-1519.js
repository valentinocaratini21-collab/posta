'use strict';
/* =====================================================================
   LOTE REGLA-15-19 — suite propia (26/11/2026)
   La regla del dueño: «si hacen el posteo antes de 3pm, ese posteo
   sale ese mismo día 7pm. Con 4 hrs de anticipación, podemos
   lograrlo.» Nació de la corrida ×10: el plan que veía el cliente
   decía «viernes 12:30» para un posteo que salía el jueves 19:00.

   Pines:
   A. LA REGLA (unidad, instantes fijos): lista antes de las 15:00
      (hora del negocio) → hoy es elegible; a las 15:00 o después →
      no, aunque el horario de salida todavía no haya pasado.
   B. LAS ETIQUETAS DE LA VERDAD (unidad): etiquetasPara deriva
      día/fecha/hora/«sale hoy» de un instante real en la zona de
      la cuenta, en el idioma del plan.
   C. EL ARRANQUE DE LA CÁSCARA (unidad): offset 0 antes del corte,
      1 después, en las dos zonas de la cáscara.
   D. EL CABLEADO (estático): el agendado de la prueba consulta el
      corte, mi-plan pisa las etiquetas con la agenda real y la
      cáscara usa el offset de la regla; sellos en paridad.
   E. ARRANQUE REAL: un invitado cuyo payload promete «viernes
      12:30» pero cuyo posteo está agendado HOY 19:00 ve en mi-plan
      el día y la hora REALES de su agenda.
   Control: contra el árbol anterior (REGLA1519_ROOT=<base>) la
   suite falla en los pines del lote.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.env.REGLA1519_ROOT || path.resolve(__dirname);
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok ·', label); }
  else { fail++; fails.push(label); console.log('  XX ·', label, extra ? '→ ' + String(extra).slice(0, 220) : ''); }
}

const MN = require(path.join(ROOT, 'modelo-nuevo.js'));
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

/* ---------------- A. La regla del corte ---------------- */
console.log('\n— A. saleHoySiListoAntesDe: el corte de las 4 horas —');
const NY = 'America/New_York';
const BA = 'America/Argentina/Buenos_Aires';
// Jueves 26/11/2026. Nueva York = UTC−5; Buenos Aires = UTC−3.
ok(MN.saleHoySiListoAntesDe(NY, 19, Date.UTC(2026, 10, 26, 19, 59)) === true, 'A1 · NY 14:59 (antes del corte) → hoy es elegible');
ok(MN.saleHoySiListoAntesDe(NY, 19, Date.UTC(2026, 10, 26, 20, 0)) === false, 'A2 · NY 15:00 (el corte) → hoy ya no');
ok(MN.saleHoySiListoAntesDe(NY, 19, Date.UTC(2026, 10, 26, 23, 30)) === false, 'A3 · NY 18:30 → no sale a las 19:00 con media hora de aire');
ok(MN.saleHoySiListoAntesDe(NY, 19, Date.UTC(2026, 10, 26, 14, 0)) === true, 'A4 · NY 09:00 → hoy es elegible');
ok(MN.saleHoySiListoAntesDe(BA, 19, Date.UTC(2026, 10, 26, 17, 59)) === true, 'A5 · BA 14:59 → hoy es elegible');
ok(MN.saleHoySiListoAntesDe(BA, 19, Date.UTC(2026, 10, 26, 18, 0)) === false, 'A6 · BA 15:00 → hoy ya no');
ok(MN.saleHoySiListoAntesDe(NY, 12, Date.UTC(2026, 10, 26, 12, 59)) === true, 'A7 · el corte sigue a la hora de salida: salida 12:00, NY 07:59 → elegible');
ok(MN.saleHoySiListoAntesDe(NY, 12, Date.UTC(2026, 10, 26, 13, 0)) === false, 'A8 · salida 12:00, NY 08:00 (su corte) → no');

/* ---------------- B. Las etiquetas de la verdad ---------------- */
console.log('\n— B. etiquetasPara: el plan lee la agenda real —');
const e1 = MN.etiquetasPara('en', NY, Date.UTC(2026, 10, 27, 0, 0), Date.UTC(2026, 10, 26, 17, 0));
ok(e1 && e1.dia_semana === 'Thursday' && e1.fecha === 'Nov 26' && e1.hora === '7:00 PM' && e1.sale_hoy === true, 'B1 · EN: jueves 26 nov, 7:00 PM, sale hoy', JSON.stringify(e1));
const e2 = MN.etiquetasPara('es', BA, Date.UTC(2026, 10, 27, 0, 0), Date.UTC(2026, 10, 26, 15, 0));
ok(e2 && e2.dia_semana === 'Jueves' && e2.fecha === '26 nov' && e2.hora === '21:00' && e2.sale_hoy === true, 'B2 · ES: el mismo instante en Buenos Aires es jueves 21:00', JSON.stringify(e2));
const e3 = MN.etiquetasPara('en', NY, Date.UTC(2026, 10, 27, 0, 0), Date.UTC(2026, 10, 28, 17, 0));
ok(e3 && e3.sale_hoy === false, 'B3 · dos días después ya no «sale hoy»');
const e4 = MN.etiquetasPara('en', NY, Date.UTC(2026, 10, 27, 14, 30), Date.UTC(2026, 10, 26, 17, 0));
ok(e4 && e4.hora === '9:30 AM' && e4.fecha === 'Nov 27', 'B4 · la hora sale del instante real, no de una etiqueta fija', JSON.stringify(e4));

/* ---------------- C. El arranque de la cáscara ---------------- */
console.log('\n— C. offsetDiaUnoCasara —');
ok(MN.offsetDiaUnoCasara('en', Date.UTC(2026, 10, 26, 14, 0)) === 0, 'C1 · cáscara EN a las 09:00 NY → día 1 hoy');
ok(MN.offsetDiaUnoCasara('en', Date.UTC(2026, 10, 26, 21, 0)) === 1, 'C2 · cáscara EN a las 16:00 NY → día 1 mañana');
ok(MN.offsetDiaUnoCasara('es', Date.UTC(2026, 10, 26, 17, 0)) === 0, 'C3 · cáscara ES a las 14:00 BA → día 1 hoy');
ok(MN.offsetDiaUnoCasara('es', Date.UTC(2026, 10, 26, 19, 0)) === 1, 'C4 · cáscara ES a las 16:00 BA → día 1 mañana');

/* ---------------- D. El cableado ---------------- */
console.log('\n— D. Cableado y sellos —');
ok(SRV.includes('modeloNuevo.saleHoySiListoAntesDe'), 'D1 · el agendado de la prueba consulta el corte');
ok(SRV.includes('modeloNuevo.etiquetasPara'), 'D2 · mi-plan pisa las etiquetas con la agenda real');
ok(SRV.includes('modeloNuevo.offsetDiaUnoCasara'), 'D3 · la cáscara usa el offset de la regla');
const mnSrc = fs.readFileSync(path.join(ROOT, 'modelo-nuevo.js'), 'utf8');
ok(!mnSrc.includes('slots[i].sale_hoy = false'), 'D4 · la reasignación de PLAN-MAGIA no existe más en la proyección');
const buildSrv = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1];
const buildApp = (APP.match(/const PZ_BUILD = '([^']+)'/) || [])[1];
ok(!!buildSrv && buildSrv === buildApp, 'D5 · BUILD_ID y PZ_BUILD en paridad', buildSrv + ' / ' + buildApp);
ok(IDX.includes('app.js?v=958'), 'D6 · el índice ES sirve el app.js del build');

/* ---------------- E. Arranque real: mi-plan dice la verdad ---------------- */
console.log('\n— E. Arranque real: el plan del invitado lee su agenda —');
const PORT = 19300 + (process.pid % 300);
const TKEY = 'regla-test-key';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regla1519-'));
function req(method, p, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const data = opts.body != null ? JSON.stringify(opts.body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': Buffer.byteLength(data) } : {}, opts.cookie ? { Cookie: opts.cookie } : {}) }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, headers: res.headers, json, text: buf }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-regla-suite',
    SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY: TKEY,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  });
  const srv = spawn('node', [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { try { const v = await req('GET', '/api/version'); up = v.status === 200; } catch (e) {} if (!up) await sleep(500); }
    ok(up, 'E0 · el servidor del lote arranca', srvLog.slice(-300));
    if (!up) throw new Error('sin servidor');

    // El payload promete cualquier cosa («Friday · Nov 27 · 12:30 PM»):
    // la agenda real del posteo manda sobre esa etiqueta.
    const payload = {
      lang: 'en', content_lang: 'en', linea_mano: true,
      posts: [0, 1, 2].map(() => ({ type: 'image', image: 'data:image/jpeg;base64,x', caption: 'pieza', headline: 'Pieza', mano: { cargada_at: Date.now() - 60000 } })),
      digest: { producto_estrella: 'Rad Na Talay' },
      design: null,
      week: [0, 1, 2].map((i) => ({ day: 'Friday', date: 'Nov 27', hour: '12:30 PM', post: i })),
    };
    const { DatabaseSync } = require('node:sqlite');
    const dbf = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    dbf.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('regla1519', JSON.stringify(payload), Date.now());
    dbf.close();

    const start = await req('POST', '/api/guest/start?test_key=' + TKEY, { body: { ig: 'regla1519', lang: 'en' } });
    const setc = (start.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
    ok(!!setc, 'E1 · la puerta entrega la cookie de sesión');

    // La agenda real: los 3 posteos existen y salen HOY a las 19:00
    // de la zona de la cuenta (instante calculado con las tablas
    // del propio módulo, ya pineadas en A–C contra valores fijos).
    const db2 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const u = db2.prepare("SELECT id FROM users WHERE guest_ig = 'regla1519'").get();
    ok(!!u, 'E2 · el invitado existe en la base');
    // La zona de la cuenta, de donde la lee userTz (settings).
    let tz = 'America/Argentina/Buenos_Aires';
    try { const s = db2.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(u.id); if (s && s.timezone) tz = s.timezone; } catch (e) {}
    const pNow = (() => { const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = {}; for (const x of f) g[x.type] = x.value; return { y: Number(g.year), mo: Number(g.month), d: Number(g.day) }; })();
    // 19:00 de hoy en tz → UTC, con el offset leído por diferencia.
    const hoy19 = (() => {
      const wall = Date.UTC(pNow.y, pNow.mo - 1, pNow.d, 19, 0, 0);
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(wall));
      const g = {}; for (const x of f) g[x.type] = x.value;
      const asUtc = Date.UTC(Number(g.year), Number(g.month) - 1, Number(g.day), Number(g.hour) % 24, Number(g.minute));
      return wall - (asUtc - wall);
    })();
    const schedIso = new Date(hoy19).toISOString();
    for (let i = 0; i < 3; i++) {
      db2.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source, scheduled_at) VALUES (?, ?, ?, '', 'scheduled', 'image', 'trial', ?)")
        .run(u.id, '/media/regla-' + i + '.jpg', 'pieza ' + i, new Date(hoy19 + i * 86400000).toISOString());
    }
    db2.close();

    const p0 = await req('GET', '/api/trial/mi-plan', { cookie: setc });
    const pl = p0.json && p0.json.plan;
    ok(p0.status === 200 && !!pl, 'E3 · mi-plan devuelve el plan');
    const exp = MN.etiquetasPara('en', tz, hoy19, Date.now());
    const s0 = pl && pl.slots && pl.slots[0];
    ok(!!s0 && s0.dia_semana === exp.dia_semana && s0.fecha === exp.fecha && s0.hora === exp.hora,
      'E4 · el slot 1 muestra el día y la hora de su AGENDA (' + exp.dia_semana + ' ' + exp.fecha + ' ' + exp.hora + '), no el «Friday Nov 27 12:30 PM» del payload',
      s0 ? (s0.dia_semana + '|' + s0.fecha + '|' + s0.hora) : 'sin slot');
    ok(!!s0 && s0.sale_hoy === true, 'E5 · el slot 1 dice «sale hoy» porque su agenda es hoy');
    ok(!!s0 && s0.post_id > 0 && s0.media === '/media/regla-0.jpg', 'E6 · el slot quedó enlazado a su posteo real');
    void schedIso;
  } catch (e) {
    ok(false, 'E · el arranque real completó', String(e && e.message || e).slice(0, 200));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\n===== REGLA-15-19: ${pass} ok · ${fail} fallos =====`);
  if (fails.length) { console.log('Fallos:'); fails.forEach((f) => console.log('  -', f)); }
  process.exit(fail ? 1 : 0);
})();
