'use strict';
/* test-lote-tira-semana-estados.js — LOTE TIRA-SEMANA-ESTADOS (14/11).
 * Idea de Valentino (14/11 14:20 EST, con captura de la tira): (1) los
 * días cuyo posteo YA SALIÓ llevan el tick con fondo VERDE en vez de
 * azul; (2) el día de hoy late suavemente.
 * Regla de verdad vigente: un tick es una afirmación de que el posteo
 * salió — los estados se pintan por HECHO (status='published'), nunca
 * por posición en la semana ni por estar programado.
 * Cubre, con el código real extraído de public/app.js en VM (reloj
 * mutable), el CSS real de public/styles.css y boot aislado:
 *  §0: bloques (funciones de la tira + helpers) cargan; la capa de
 *      datos (pzHoySemana) cuenta SOLO published: un programado de un
 *      día pasado NO marca 'pub'.
 *  §1: escenario de la captura (sáb 14/11: lun–vie publicados, hoy
 *      programado sin salir, dom futuro): 5 .done sin .today, hoy
 *      .today sin .done con •, dom .wait; ✓ ×5, • ×1.
 *  §2: hoy YA publicado: el día lleva .done Y .today a la vez y su
 *      marca es ✓ (• ×0).
 *  §3: día pasado SIN posteo y día pasado con posteo solo programado:
 *      ninguno lleva .done ni ✓ (bola hueca muda, sin .wait); un
 *      futuro programado tampoco se pinta salido (.wait, sin ✓).
 *  §4: CSS: hecho = var(--green) (ya no var(--cel)); hoy late con
 *      @keyframes pzSemanaLatido (halo que respira, 2.6s); .done.today
 *      verde con latido verde (pzSemanaLatidoOk); con
 *      prefers-reduced-motion la animación se apaga.
 *  §5: stamps del árbol: BUILD ×1, app.js?v= solo ES, styles?v= en
 *      ambos index con el mismo valor.
 *  §6: boot: /api/version trae el BUILD del árbol y los app.js /
 *      styles.css servidos son los del árbol (md5 igual), con el
 *      latido presente en el CSS servido.
 * Control: contra la base v1077 esta suite FALLA (hecho azul
 * var(--cel), sin keyframes, hoy publicado pierde la clase .today).
 * Uso: node test-lote-tira-semana-estados.js — sale 0 si todo pasa.
 *   TIRA_ESTADOS_TREE=<dir>  árbol a probar (def: este directorio)
 *   TIRA_ESTADOS_PORT=<p>    puerto del boot (def: 35187; verificar
 *                            libre con ss antes de correr).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.TIRA_ESTADOS_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const BUILD = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '';

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Semana del lote: lun 9/11 – dom 15/11/2026. «Hoy» del lote: el
// sábado 14/11 de la captura de Valentino.
let NOW_MS = Date.parse('2026-11-14T15:00:00.000Z'); // sáb 14/11 10:00 EST
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- Sandbox ----------
const TZ = 'America/New_York';
const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date: FakeDate, Math, JSON, Intl, Map, Set,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  gzT: (es, en) => es,
  mv: (p) => p,
  pzIc: () => '',
  pcTz: () => TZ,
  pcParseDate: (s0) => { const s = String(s0 || '').replace(' ', 'T'); if (!s) return null; const x = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; const d = new FakeDate(x); return isNaN(d) ? null : d; },
  schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
  slotHour: () => 17,
  ME: { lang: 'es' },
  document: {
    hidden: false, activeElement: null,
    body: { appendChild: () => {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => null,
    addEventListener: () => {},
  },
  window: { addEventListener: () => {}, scrollTo: () => {} },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  bbGo: () => {},
  pzBoostOpenById: () => {},
  HF_VISITOR: false,
};
vm.createContext(sb);

// ---------- Extracción de funciones reales ----------
function extractFunc(name) {
  const i = APP.indexOf('function ' + name + '(');
  if (i < 0) { t(false, '§0: falta function ' + name + ' en app.js'); return ''; }
  const j = APP.indexOf('{', i);
  let d = 0, k = j;
  while (k < APP.length) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (d === 0) break; }
    k++;
  }
  if (d !== 0) { t(false, '§0: llaves sin cerrar en ' + name); return ''; }
  return APP.slice(i, k + 1);
}
const FUNCS = [
  'pzHoyDiaKey', 'pzHoyDowKey', 'pzHoyPostDiaKey', 'pzHoyMoverKey',
  'pzHoySemana', 'pzHoyPendientes', 'pzWhenRelDay', 'hfChipText',
  'pzHoyHoraCorta', 'pzHoyCuandoCorto',
  'pzHoyPillSalida', 'pzRitualCuentaTxt', 'pzHoyCuentaSaleTxt',
  'pzIsPubReal',
  'pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoyTiraHTML',
  'pzHoyTiraBindDetalle', 'pzHoyTiraBind',
];
console.log('— §0: bloques y capa de datos');
for (const f of FUNCS) {
  const code = extractFunc(f);
  if (!code) continue;
  try { vm.runInContext(code, sb); t(true, '§0: ' + f + ' cargada'); }
  catch (e) { t(false, '§0: ' + f + ' no corre en VM', e.message); }
}
try {
  vm.runInContext("var PZ_HOY_TIRA_SEL = ''; var PZ_HOY_TIRA_DIAS = []; var PZ_HOY_POST_ID = ''; var PZ_HOY_MEJOR = null;", sb);
  t(true, '§0: vars de tira declaradas');
} catch (e) { t(false, '§0: vars de tira', e.message); }

// ---------- Datos de prueba ----------
// 19:00 EST = 00:00 UTC del día siguiente.
const at19 = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 24)).toISOString(); };
const P = (id, extra) => Object.assign({ id, user_id: 12, image_path: '/media/' + id + '.jpg', caption: 'Posteo ' + id, hashtags: '', scheduled_at: null, published_at: null, status: 'scheduled', tipo: 'social', media_type: 'image', week_key: '2026-11-09', approval: 'pending', created_at: '2026-11-09 10:00:00' }, extra || {});
const pub = (id, ymd) => P(id, { scheduled_at: at19(ymd), published_at: at19(ymd), status: 'published', approval: 'approved' });
const sch = (id, ymd) => P(id, { scheduled_at: at19(ymd), status: 'scheduled', approval: 'pending' });

// Botones de la tira: [ { cls, key, mark } ] en orden LUN–DOM.
const botonesDe = (html) => [...html.matchAll(/<button type="button" class="(pz-semana-dia[^"]*)" data-pz-hoy-tira-dia="([^"]*)"[^>]*><span class="pz-semana-bola">([^<]*)<\/span>/g)]
  .map((m) => ({ cls: m[1], key: m[2], mark: m[3] }));

// ---------- §0b: la capa de datos solo cree en published ----------
// Se le pasa la lista COMPLETA (como llega de allPosts): un programado
// de un día pasado no puede marcar el día como salido.
{
  const todos = [pub(701, '2026-11-09'), sch(704, '2026-11-12'), sch(706, '2026-11-14')];
  const sem0 = sb.pzHoySemana(todos, TZ, new FakeDate());
  t(sem0.n === 1 && sem0.dias[0].estado === 'pub', '§0: pzHoySemana cuenta solo el lunes publicado (n=1)', JSON.stringify(sem0.dias));
  t(sem0.dias[3].estado === 'vacio', '§0: el jueves con posteo SOLO programado queda «vacio», no «pub»', sem0.dias[3].estado);
  t(sem0.dias[5].estado === 'hoy', '§0: hoy (sáb) sin publicado queda «hoy»', sem0.dias[5].estado);
}

// ---------- §1: la captura de Valentino ----------
console.log('— §1: lun–vie salidos, hoy sin salir, dom futuro');
{
  const posts = [
    pub(701, '2026-11-09'), pub(702, '2026-11-10'), pub(703, '2026-11-11'),
    pub(704, '2026-11-12'), pub(705, '2026-11-13'),
    sch(706, '2026-11-14'),
  ];
  const sem = sb.pzHoySemana(posts, TZ, new FakeDate());
  const tira = sb.pzHoyTiraDias(sem, posts, '2026-11-14', TZ);
  vm.runInContext("PZ_HOY_POST_ID = '706';", sb);
  const html = sb.pzHoyTiraHTML(tira, { en: false, tz: TZ, hoyKey: '2026-11-14', sel: '2026-11-14' });
  const b = botonesDe(html);
  t(b.length === 7, '§1: 7 botones de día (LUN–DOM)', 'n=' + b.length);
  t(b.slice(0, 5).every((x) => x.cls.includes(' done') && !x.cls.includes(' today')),
    '§1: lun–vie llevan .done y NO .today', JSON.stringify(b.map((x) => x.cls)));
  t(b.slice(0, 5).every((x) => x.mark === '✓'), '§1: lun–vie marcan ✓');
  t(b[5] && b[5].cls.includes(' today') && !b[5].cls.includes(' done'),
    '§1: hoy (sáb) lleva .today y NO .done (todavía no salió)', b[5] && b[5].cls);
  t(b[5] && b[5].mark === '•', '§1: hoy marca •');
  t(b[6] && b[6].cls.includes(' wait') && b[6].mark === '', '§1: dom futuro lleva .wait y bola vacía', b[6] && b[6].cls);
  t((html.match(/>✓</g) || []).length === 5, '§1: ✓ ×5 en toda la tira');
  t((html.match(/>•</g) || []).length === 1, '§1: • ×1 en toda la tira');
}

// ---------- §2: hoy ya salió ----------
console.log('— §2: hoy publicado = verde con ✓ que late');
{
  const posts = [
    pub(701, '2026-11-09'), pub(702, '2026-11-10'), pub(703, '2026-11-11'),
    pub(704, '2026-11-12'), pub(705, '2026-11-13'), pub(706, '2026-11-14'),
  ];
  const sem = sb.pzHoySemana(posts, TZ, new FakeDate());
  const tira = sb.pzHoyTiraDias(sem, posts, '2026-11-14', TZ);
  vm.runInContext("PZ_HOY_POST_ID = '706';", sb);
  const html = sb.pzHoyTiraHTML(tira, { en: false, tz: TZ, hoyKey: '2026-11-14', sel: '2026-11-14' });
  const b = botonesDe(html);
  t(b[5] && b[5].cls.includes(' done') && b[5].cls.includes(' today'),
    '§2: hoy publicado lleva .done Y .today a la vez', b[5] && b[5].cls);
  t(b[5] && b[5].mark === '✓', '§2: hoy publicado marca ✓');
  t((html.match(/>•</g) || []).length === 0, '§2: ningún • cuando hoy ya salió');
  t((html.match(/>✓</g) || []).length === 6, '§2: ✓ ×6 (lun–sáb)');
}

// ---------- §3: pasados sin hecho y futuro programado ----------
console.log('— §3: sin tick mentiroso');
{
  const posts = [
    pub(701, '2026-11-09'), pub(702, '2026-11-10'),
    // mié 11: sin posteo
    sch(704, '2026-11-12'), // jue: solo programado, nunca salió
    pub(705, '2026-11-13'),
    sch(706, '2026-11-14'), sch(707, '2026-11-15'),
  ];
  const sem = sb.pzHoySemana(posts, TZ, new FakeDate());
  t(sem.n === 3 && sem.dias[2].estado === 'vacio' && sem.dias[3].estado === 'vacio',
    '§3: pzHoySemana: n=3; mié (sin posteo) y jue (solo programado) quedan «vacio»', JSON.stringify(sem.dias));
  const tira = sb.pzHoyTiraDias(sem, posts, '2026-11-14', TZ);
  vm.runInContext("PZ_HOY_POST_ID = '706';", sb);
  const html = sb.pzHoyTiraHTML(tira, { en: false, tz: TZ, hoyKey: '2026-11-14', sel: '2026-11-14' });
  const b = botonesDe(html);
  t(b[2] && !b[2].cls.includes(' done') && !b[2].cls.includes(' today') && !b[2].cls.includes(' wait') && b[2].mark === '',
    '§3: mié pasado sin posteo: bola hueca muda (sin .done/.today/.wait, sin marca)', b[2] && b[2].cls);
  t(b[3] && !b[3].cls.includes(' done') && b[3].mark === '',
    '§3: jue con posteo solo programado: NO lleva .done ni ✓', b[3] && b[3].cls);
  t(b[6] && b[6].cls.includes(' wait') && !b[6].cls.includes(' done') && b[6].mark === '',
    '§3: dom futuro programado: .wait, no se pinta salido', b[6] && b[6].cls);
  t((html.match(/>✓</g) || []).length === 3, '§3: ✓ ×3 (solo los publicados reales)');
}

// ---------- §4: CSS de estados ----------
console.log('— §4: CSS');
{
  const i0 = CSS.indexOf('.pz-semana-mini{');
  const i1 = CSS.indexOf('.pz-semana-insight{');
  const bloque = (i0 >= 0 && i1 > i0) ? CSS.slice(i0, i1) : '';
  t(bloque.length > 400, '§4: bloque CSS de la tira presente', 'len=' + bloque.length);
  const reglaDone = (bloque.match(/\.pz-semana-dia\.done \.pz-semana-bola\{[^}]*\}/) || [''])[0];
  t(reglaDone.includes('background:var(--green)'), '§4: hecho = fondo VERDE var(--green)', reglaDone);
  t(!reglaDone.includes('var(--cel)'), '§4: hecho ya NO es azul var(--cel)');
  t(reglaDone.includes('color:#fff'), '§4: el tilde queda blanco sobre el verde');
  const reglaToday = (bloque.match(/\.pz-semana-dia\.today \.pz-semana-bola\{[^}]*\}/) || [''])[0];
  t(reglaToday.includes('background:var(--yl)'), '§4: hoy sin salir sigue amarillo var(--yl)', reglaToday);
  t(reglaToday.includes('animation:pzSemanaLatido 2.6s ease-in-out infinite'),
    '§4: hoy LATE: animation pzSemanaLatido 2.6s ease-in-out infinite', reglaToday);
  t(bloque.includes('@keyframes pzSemanaLatido{'), '§4: @keyframes pzSemanaLatido definido');
  t(bloque.includes('50%{box-shadow:0 0 0 9px rgba(254,193,77,.07)}'),
    '§4: el latido respira el halo (anillo que se abre y se apaga, sin saltos)');
  const reglaDoneToday = (bloque.match(/\.pz-semana-dia\.done\.today \.pz-semana-bola\{[^}]*\}/) || [''])[0];
  t(reglaDoneToday.includes('background:var(--green)') && reglaDoneToday.includes('animation-name:pzSemanaLatidoOk'),
    '§4: .done.today: bola verde con latido verde (animation-name pzSemanaLatidoOk)', reglaDoneToday);
  t(bloque.includes('@keyframes pzSemanaLatidoOk{') && bloque.includes('50%{box-shadow:0 0 0 9px rgba(34,197,94,.07)}'),
    '§4: @keyframes pzSemanaLatidoOk definido (halo verde)');
  t(bloque.includes('@media (prefers-reduced-motion:reduce)') && bloque.includes('.pz-semana-dia.today .pz-semana-bola{animation:none}'),
    '§4: prefers-reduced-motion apaga el latido');
}

// ---------- §5: stamps ----------
console.log('— §5: stamps');
t(!!BUILD, '§5: BUILD_ID presente en server.js', BUILD);
t((SRV.match(new RegExp(BUILD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 1, '§5: BUILD del árbol en server.js');
t((IDX.match(/app\.js\?v=\d+/g) || []).length === 1, '§5: app.js?v= ×1 en el index ES');
t(!(IDXEN.includes('app.js?v=')), '§5: el index EN no lleva app.js?v= (como siempre)');
{
  const sEs = (IDX.match(/styles\.css\?v=(\d+)/) || [])[1];
  const sEn = (IDXEN.match(/styles\.css\?v=(\d+)/) || [])[1];
  t(!!sEs && sEs === sEn, '§5: styles?v= igual en ambos index', sEs + ' / ' + sEn);
}

// ---------- §6: boot ----------
console.log('— §6: boot');
const PORT = Number(process.env.TIRA_ESTADOS_PORT || 35187);
const SECRET = 'lote-tira-semana-estados-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tira-semana-estados-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
async function apiText(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return { status: r.status, text: await r.text() };
}
(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: SECRET,
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§6: el servidor levanta (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await apiText('/api/version');
    let verJson = null; try { verJson = JSON.parse(ver.text); } catch (e) {}
    t(ver.status === 200 && verJson && verJson.build === BUILD,
      '§6: /api/version trae el BUILD del árbol (' + BUILD + ')', ver.text.slice(0, 200));
    const appJs = await apiText('/app.js');
    t(appJs.status === 200 && md5(appJs.text) === md5(APP), '§6: el app.js servido es el del árbol (md5 igual)');
    const cssS = await apiText('/styles.css');
    t(cssS.status === 200 && md5(cssS.text) === md5(CSS), '§6: el styles.css servido es el del árbol (md5 igual)');
    t(cssS.status === 200 && cssS.text.includes('@keyframes pzSemanaLatido'), '§6: el CSS servido trae el latido de hoy');
  } catch (e) {
    t(false, '§6: boot', e.message);
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`\nTIRA-SEMANA-ESTADOS: ${okN} ok, ${badN} fallos`);
  process.exit(badN ? 1 : 0);
})();
