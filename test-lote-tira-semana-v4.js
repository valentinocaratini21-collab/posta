'use strict';
/* test-lote-tira-semana-v4.js — LOTE TIRA DE LA SEMANA VARIANTE 4 · v874 (base v862).
 * Decisión Valentino 10/11 09:31 + 09:34 («armalo asi»): la tira de 7 días
 * de Hoy deja de ser la tarjeta blanca con 7 círculos iguales y pasa a la
 * variante 4 («solo puntos, sin tarjeta»), primera en Hoy, justo debajo
 * del encabezado fijo «Posty. / tu community manager», con una rayita
 * fina separándola del saludo. Mock: mock-tira-semana-v2.html.
 * Cubre, con el código real extraído de public/app.js y un DOM falso
 * mínimo, con reloj mutable, y con boot aislado (DB temporal):
 *  §0: bloques (funciones de la tira + helpers) y server.js sin tocar.
 *  §1: tira HTML v4: 7 botones; hecho = azul con ✓; hoy = amarillo con •;
 *      pendientes = punto hueco vacío (sin '·'); etiquetas ES/EN; el
 *      detalle de hoy NO se rinde cuando es el posteo principal; el
 *      detalle de mañana bloqueado sigue con su mensaje del mock.
 *  §2: CSS v4: sin tarjeta blanca, hairline #dfe6ec, bola 11px hueca,
 *      hecho var(--cel) 18px, hoy var(--yl) 20px con glow; 0 verde
 *      (#DDF5E3 / var(--green) / 22C55E), 0 bola 34px, 0 punteado, 0
 *      fondo de seleccionado (.sel).
 *  §3: posición: #pzHoyTira va ANTES del saludo (pzHoySpeechHTML) y
 *      del posteo de hoy e Impulsar, dentro de #pzHoyAprobar.
 *  §4: auditoría M78: todo lo que la tira y su bloque llaman existe
 *      definido en el bundle (11/11).
 *  §5: censo: BUILD v874 ×1, ?v=593, styles?v=20261228 en
 *      ambos index, ?v=590 ×0 (sin estampar: lo hace el preparador).
 *  §6: boot: /api/version v862; el app.js y el styles.css servidos son
 *      los del árbol (md5 igual) y traen la tira v4.
 * En el árbol prístino v862 los tests nuevos deben FALLAR (cazan el
 * cambio). Uso: node test-lote-tira-semana-v4.js — sale 0 si todo pasa.
 *   TIRA4_TREE=<dir>  árbol a probar (por defecto, este directorio)
 *   TIRA4_PORT=<puerto>  puerto del boot (por defecto 34811; verificar
 *   libre con ss antes de correr).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.TIRA4_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Hoy del lote: martes 10/11/2026 (el mock). Semana: lun 9/11 – dom 15/11.
let NOW_MS = Date.parse('2026-11-10T15:00:00.000Z'); // mar 10/11 10:00 EST
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
  'pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoyTiraHTML',
  'pzHoyTiraBindDetalle', 'pzHoyTiraBind',
];
console.log('— §0: bloques');
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
t(!SRV.includes('pzHoyTira'), '§0: server.js sin tocar por v874');
t((SRV.match(/20261105-v874/g) || []).length === 1, '§0: BUILD v874 ×1 en server.js');
t(!APP.includes('pzHoySemanaMiniHTML(semR1'), '§0: la mini de v833 sigue sin uso en Hoy');

// ---------- Datos de prueba ----------
// 19:00 EST = 00:00 UTC del día siguiente.
const at19 = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 24)).toISOString(); };
const P = (id, extra) => Object.assign({ id, user_id: 12, image_path: '/media/' + id + '.jpg', caption: 'Posteo ' + id, hashtags: '', scheduled_at: null, published_at: null, status: 'scheduled', tipo: 'social', media_type: 'image', week_key: '2026-11-09', approval: 'pending', created_at: '2026-11-09 10:00:00' }, extra || {});
const LUN_PUB = P(701, { caption: 'El del lunes', scheduled_at: at19('2026-11-09'), published_at: at19('2026-11-09'), status: 'published', approval: 'approved' });
const MAR = P(702, { caption: 'El de hoy', scheduled_at: at19('2026-11-10'), status: 'scheduled', approval: 'pending' });
const MIE = P(703, { caption: 'El del miércoles', scheduled_at: at19('2026-11-11'), status: 'scheduled', approval: 'pending' });
const sem = sb.pzHoySemana([LUN_PUB], TZ, new FakeDate());
t(sem.n === 1 && sem.lunes === '2026-11-09' && sem.dias.length === 7 && sem.dias[0].estado === 'pub',
  '§0: pzHoySemana real: lun 9/11 publicado, n=1', JSON.stringify(sem));
const tira = sb.pzHoyTiraDias(sem, [LUN_PUB, MAR, MIE], '2026-11-10', TZ);
t(tira.length === 7 && tira[0].post && tira[0].post.status === 'published' && tira[1].esHoy,
  '§0: pzHoyTiraDias real: lun con posteo publicado, mar es hoy');

// ---------- §1: tira HTML v4 ----------
console.log('— §1: tira HTML v4');
vm.runInContext("PZ_HOY_POST_ID = '702';", sb); // el posteo de hoy es el principal: su detalle NO se rinde
const htmlEs = sb.pzHoyTiraHTML(tira, { en: false, tz: TZ, hoyKey: '2026-11-10', sel: '2026-11-10' });
t((htmlEs.match(/data-pz-hoy-tira-dia=/g) || []).length === 7, '§1: 7 botones de día (LUN–DOM)');
t(htmlEs.includes('pz-semana-dia done'), '§1: el lunes publicado lleva .done');
t(htmlEs.includes('pz-semana-dia today sel'), '§1: hoy (mar) lleva .today + .sel');
t((htmlEs.match(/pz-semana-dia wait/g) || []).length === 5, '§1: 5 días futuros llevan .wait (mié–dom)');
t((htmlEs.match(/>✓</g) || []).length === 1, '§1: un solo ✓ (el lunes hecho)');
t((htmlEs.match(/>•</g) || []).length === 1, '§1: un solo • (hoy)');
t(!htmlEs.includes('>·<'), '§1: 0 marcas · — los pendientes son puntos huecos vacíos');
t((htmlEs.match(/class="pz-semana-bola"><\/span>/g) || []).length === 5, '§1: 5 bolas pendientes vacías');
for (const lb of ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']) t(htmlEs.includes(lb), '§1: etiqueta ES ' + lb);
const htmlEn = sb.pzHoyTiraHTML(tira, { en: true, tz: TZ, hoyKey: '2026-11-10', sel: '2026-11-10' });
for (const lb of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) t(htmlEn.includes(lb), '§1: etiqueta EN ' + lb);
t(!htmlEn.includes('LUN') && !htmlEn.includes('MIÉ'), '§1: EN sin etiquetas ES');
t(!htmlEs.includes('pz-hoy-tira-detalle'), '§1: el detalle de hoy NO se rinde (es el posteo principal)');
const htmlMie = sb.pzHoyTiraHTML(tira, { en: false, tz: TZ, hoyKey: '2026-11-10', sel: '2026-11-11' });
t(htmlMie.includes('pz-hoy-tira-detalle locked') && htmlMie.includes('Su posteo se ve apenas salga el de hoy.'),
  '§1: el detalle de mañana bloqueado sigue con su mensaje del mock');

// ---------- §2: CSS v4 ----------
console.log('— §2: CSS v4');
const tiraCss = CSS.slice(CSS.indexOf('LOTE TIRA-SEMANA-V4'), CSS.indexOf('.pz-semana-insight'));
t(tiraCss.length > 500, '§2: bloque CSS v874 presente', 'len=' + tiraCss.length);
t(tiraCss.includes('.pz-semana-mini{position:relative;background:none;border:none;border-bottom:1px solid #eee8db;'),
  '§2: la tira ya NO es tarjeta blanca (sin fondo, sin borde, sin sombra; rayita #eee8db debajo)');
t(tiraCss.includes('.pz-semana-mini::before') && tiraCss.includes('background:#dfe6ec') && tiraCss.includes('height:1.5px') && tiraCss.includes('top:19.5px'),
  '§2: hairline #dfe6ec de 1.5px uniendo los días (top 19.5px)');
t(tiraCss.includes('.pz-semana-bola{width:11px;height:11px') && tiraCss.includes('background:#fff;border:1.5px solid #c6d2dd'),
  '§2: punto pendiente hueco 11px, fondo blanco, borde #c6d2dd');
t(tiraCss.includes('.pz-semana-dia.done .pz-semana-bola{width:18px;height:18px;background:var(--cel);'),
  '§2: hecho = azul Posty 18px con tilde blanco');
t(tiraCss.includes('.pz-semana-dia.today .pz-semana-bola{width:20px;height:20px;background:var(--yl);') && tiraCss.includes('box-shadow:0 0 0 5px rgba(254,193,77,.25)'),
  '§2: hoy = amarillo 20px con glow');
t(tiraCss.includes('.pz-semana-dia.today{color:var(--txt)}'), '§2: la etiqueta de hoy va en navy');
t(!tiraCss.includes('DDF5E3') && !tiraCss.includes('var(--green)') && !tiraCss.includes('22C55E'),
  '§2: 0 verde en la tira (el tilde verde muere)');
t(!tiraCss.includes('34px') && !tiraCss.includes('EDF4FA') && !tiraCss.includes('dashed'),
  '§2: 0 bola 34px, 0 fondo celeste viejo, 0 punteado');
t(!tiraCss.includes('.pz-semana-dia.sel{'), '§2: 0 fondo de seleccionado (la selección la muestra el detalle)');

// ---------- §3: posición ----------
console.log('— §3: posición en Hoy');
const aproba = APP.slice(APP.indexOf('id="pzHoyAprobar"'));
const iTira = aproba.indexOf('pzHoyTiraHTML(tiraDiasR1');
const iSpeech = aproba.indexOf('pzHoySpeechHTML({');
const iHoy = aproba.indexOf('pzHoyHoyHTML(');
const iImp = aproba.indexOf('pzHoyImpulsarHTML(mejorHoy');
t(iTira > 0 && iSpeech > 0 && iHoy > 0 && iImp > 0, '§3: los 4 bloques existen en #pzHoyAprobar');
t(iTira < iSpeech && iSpeech < iHoy && iHoy < iImp,
  '§3: orden en Hoy: tira → saludo → posteo de hoy → Impulsar', `tira=${iTira} speech=${iSpeech} hoy=${iHoy} imp=${iImp}`);

// ---------- §4: auditoría M78 ----------
console.log('— §4: auditoría M78');
const AUDIT = ['pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoyTiraHTML', 'pzHoyTiraBindDetalle', 'pzHoyTiraBind', 'pzHoySpeechHTML', 'pzHoyParaAprobarHTML', 'pzHoyHoyHTML', 'pzHoyImpulsarHTML', 'pzBoostOpenById', 'bbGo'];
let auditOk = 0;
for (const f of AUDIT) { if (APP.includes('function ' + f + '(')) auditOk++; else console.log('✗ §4: falta function ' + f); }
t(auditOk === AUDIT.length, `§4: funciones auditadas ${auditOk}/${AUDIT.length}`);

// ---------- §5: censo ----------
console.log('— §5: censo');
t((SRV.match(/20261105-v874/g) || []).length === 1, '§5: BUILD v874 ×1 en server.js');
t((IDX.match(/app\.js\?v=593/g) || []).length === 1, '§5: ?v=593 ×1 en el index ES (estampado)');
t(IDX.includes('styles.css?v=20261228') && IDXEN.includes('styles.css?v=20261228'), '§5: styles?v=20261228 en ambos index (estampado)');
t(!APP.includes('?v=590') && !IDX.includes('?v=590'), '§5: ?v=590 ×0 (sin estampar: lo hace el preparador)');

// ---------- §6: boot ----------
console.log('— §6: boot');
const PORT = Number(process.env.TIRA4_PORT || 34811);
const SECRET = 'lote-tira-semana-v4-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tira-semana-v4-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
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
    ADMIN_TOKEN: 'boot-admin-tira4',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'sk-test-tira4',
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
    t(up, '§6: el servidor levanta con la tira v4 (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await apiText('/api/version');
    let verJson = null; try { verJson = JSON.parse(ver.text); } catch (e) {}
    t(ver.status === 200 && verJson && verJson.build === '20261105-v874',
      '§6: /api/version trae el BUILD v874', ver.text.slice(0, 200));
    const appJs = await apiText('/app.js?v=593');
    t(appJs.status === 200 && md5(appJs.text) === md5(APP), '§6: el app.js servido es el del árbol v874 (md5 igual)');
    t(appJs.status === 200 && appJs.text.indexOf('#pzHoyTira') < appJs.text.indexOf('pzHoySpeechHTML({ hoyPost'),
      '§6: el app.js servido trae la tira antes del saludo');
    const cssS = await apiText('/styles.css?v=20261228');
    t(cssS.status === 200 && md5(cssS.text) === md5(CSS), '§6: el styles.css servido es el del árbol v874 (md5 igual)');
    t(cssS.status === 200 && cssS.text.includes('.pz-semana-mini::before') && cssS.text.includes('rgba(254,193,77,.25)'),
      '§6: el CSS servido trae la hairline y el glow de hoy');
    t(cssS.status === 200 && !cssS.text.slice(cssS.text.indexOf('LOTE TIRA-SEMANA-V4'), cssS.text.indexOf('.pz-semana-insight')).includes('DDF5E3'),
      '§6: el CSS servido no trae verde en la tira');
  } catch (e) {
    t(false, '§6: boot', e.message);
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`\nTIRA-SEMANA-V4: ${okN} ok, ${badN} fallos`);
  process.exit(badN ? 1 : 0);
})();
