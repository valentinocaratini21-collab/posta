'use strict';
/* test-lote-posteo-hoy-compacto-v859.js — LOTE POSTEO-HOY-COMPACTO · LA TARJETA DE HOY, HORIZONTAL (base v851).
 * Aprobado por Valentino 9/11 21:48 («me encanto! hacelo asi») sobre el mock
 * ~/workspace/.mock-posteo-hoy-compacto/ (tarjeta 282 px → 197 px, −30% a 390px).
 * El problema: el caption aparecía DOS veces (blanco sobre la foto + oscuro
 * abajo) y todo se apilaba en vertical; la tarjeta dominaba media pantalla.
 * El fix: pzHoyCardHTML rinde una fila horizontal — miniatura 96×120 4:5 a la
 * izquierda (se ve entera, con su titular; se toca para ver el detalle) +
 * columna de texto con el caption UNA sola vez (clamp 4) + «Tocá la foto para
 * ver el detalle →». La cabecera («EL POSTEO DE HOY» + «hoy · 19:00» +
 * «sale en 7 h 10 min») y los dos botones quedan IGUALES (mismo tamaño,
 * mismo verde #22C55E, mismo orden). Mueren: la chapita del caption sobre
 * la foto (.pz-hoy-cap / cap1), .pz-hoy-body y el degradado ::after del
 * thumb. pzHoyHoyHTML no se toca (la cabecera es la misma).
 * Cubre, con el código real extraído de public/app.js y un DOM falso mínimo,
 * con reloj mutable, y con boot aislado (DB temporal, sin tocar producción):
 *  A) estáticos: BUILD v859 ×1, cero v851; ?v=587 ×1 en el index ES;
 *     styles?v=20261226 ×1 en AMBOS index (mismo valor); la chapita
 *     .pz-hoy-cap y .pz-hoy-body mueren (regla ×0); el thumb es 96×120
 *     4:5 con radio 14; el caption va con clamp 4; los botones no cambian
 *     (padding 12px, verde #22C55E en #inicioView); CHUNK_V sin cambio;
 *  B) la tarjeta real (VM): fila horizontal (thumb antes que el caption),
 *     caption UNA sola vez, sin chapita sobre la foto, sin .pz-hoy-body,
 *     cabecera igual (pill + cuenta con data-pz-cuenta-sale), botones
 *     iguales (verde + fantasma, mismo orden), meta «Tocá la foto…»;
 *     EN en espejo; borrador sin imagen; aprobado sin botones + notaOk;
 *     formatos video/carrusel/historia; el camino cartita (dormante)
 *     sigue rindiendo pill + cuenta en horizontal;
 *  C) auditoría M78: todo lo que las funciones tocadas llaman existe
 *     definido en el bundle;
 *  D) boot: /api/version v859, el index sirve app.js?v=587 +
 *     styles?v=20261226, app.js y styles.css servidos = los del árbol;
 *  E) render real a 390px (Playwright, si está disponible; si no, SKIP):
 *     la tarjeta mide ≤ 210 px de alto (mock: 197 px con padding 10px en
 *     botones; el lote mantiene 12px por «botones iguales» → ~201 px),
 *     el thumb mide 96×120, y no hay desborde horizontal (scrollWidth ≤ 390).
 * En el árbol prístino v851 los tests nuevos deben FALLAR (cazan el cambio).
 * Uso: node test-lote-posteo-hoy-compacto-v859.js — sale 0 si todo pasa.
 *   PHC_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const TREE = path.resolve(process.env.PHC_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX_ES = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0, skipN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};
const skip = (name, why) => { skipN++; console.log('– SKIP', name, why ? '(' + why + ')' : ''); };

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Hoy del lote: lunes 9/11/2026. Semana: lun 9/11 – dom 15/11.
let NOW_MS = Date.parse('2026-11-09T15:00:00.000Z'); // lun 9/11 10:00 EST
const setNow = (iso) => { NOW_MS = Date.parse(iso); };
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- DOM falso mínimo ----------
class El {
  constructor(tag) {
    this.tagName = tag || 'div';
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.removed = false;
    this.innerHTML = '';
    this.textContent = '';
    this._l = {};
    this._q = {};
    this.className = '';
    this.id = '';
    this.children = [];
    this._cls = new Set();
    this.classList = {
      toggle: (c, f) => { if (f === undefined) { if (this._cls.has(c)) this._cls.delete(c); else this._cls.add(c); } else if (f) this._cls.add(c); else this._cls.delete(c); },
      add: (c) => this._cls.add(c),
      remove: (c) => this._cls.delete(c),
      contains: (c) => this._cls.has(c),
    };
  }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  querySelector(sel) { return this._q[sel] || null; }
  querySelectorAll(sel) { return this._q[sel + ':all'] || []; }
  setAttribute(k, v) { this['attr_' + k] = v; }
  getAttribute(k) { return this['attr_' + k]; }
  remove() { this.removed = true; }
}

// ---------- Sandbox ----------
const TZ = 'America/New_York';
const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date: FakeDate, Math, JSON, Intl, Map, Set,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
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
    createElement: (tag) => new El(tag),
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
// NOTA: pzHoySaludoTxt murió en v846 y pzHoySemanaInsightHTML murió en v846
// (Impulsar la reemplazó); no van en la lista.
const FUNCS = [
  'pzHoyDiaKey', 'pzHoyDowKey', 'pzHoyPostDiaKey', 'pzHoyMoverKey',
  'pzHoySemana', 'pzHoyPendientes', 'pzWhenRelDay', 'hfChipText',
  'pzHoyHoraCorta', 'pzHoyCuandoCorto',
  'pzHoyPillSalida', 'pzRitualCuentaTxt', 'pzHoyCuentaSaleTxt',
  'pzHoySpeechHTML',
  'pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoyTiraHTML',
  'pzHoyTiraBindDetalle', 'pzHoyTiraBind',
  'pzHoyParaAprobarHTML',
  'pzHoyCardHTML', 'pzHoyHoyHTML',
];
console.log('— §0: bloques');
for (const f of FUNCS) {
  const code = extractFunc(f);
  if (!code) continue;
  try { vm.runInContext(code, sb); t(true, '§0: ' + f + ' cargada'); }
  catch (e) { t(false, '§0: ' + f + ' no corre en VM', e.message); }
}
try {
  vm.runInContext("var PZ_HOY_TIRA_SEL = ''; var PZ_HOY_TIRA_DIAS = []; var PZ_HOY_POST_ID = '';", sb);
  t(true, '§0: PZ_HOY_TIRA_SEL/DÍAS/POST_ID declaradas');
} catch (e) { t(false, '§0: vars de tira', e.message); }

// ---------- §A: estáticos del lote ----------
console.log('— §A: estáticos');
const count = (hay, needle) => (hay.split(needle).length - 1);
t(count(SRV, "'20261105-v859'") === 1, '§A: BUILD 20261105-v859 ×1 en server.js');
t(count(SRV, '20261105-v851') === 0, '§A: cero 20261105-v851 en server.js');
t(count(SRV, '20261105-v85') === 1, '§A: server.js trae un solo BUILD de la serie v85x (el v859)');
t(count(IDX_ES, 'app.js?v=587') === 1, '§A: ?v=587 ×1 en el index ES');
t(count(IDX_ES, 'app.js?v=581') === 0, '§A: cero app.js?v=581 en el index ES');
t(count(IDX_ES, 'styles.css?v=20261226') === 1, '§A: styles?v=20261226 ×1 en el index ES');
t(count(IDX_EN, 'styles.css?v=20261226') === 1, '§A: styles?v=20261226 ×1 en el index EN (mismo valor que ES)');
t(count(IDX_EN, 'styles.css?v=20261225') === 0, '§A: cero styles?v=20261225 en el index EN');
t(count(IDX_EN, 'app.js?v=') === 0, '§A: el index EN no referencia app.js?v= (nunca lo hizo)');
t(!APP.includes('pz-hoy-cap">'), '§A: la chapita <span class="pz-hoy-cap"> muere en app.js (×0)');
t(!APP.includes('pz-hoy-body'), '§A: .pz-hoy-body muere en app.js (×0)');
t(!extractFunc('pzHoyCardHTML').replace(/\/\/[^\n]*/g, '').includes('cap1'), '§A: cap1 muere dentro de pzHoyCardHTML (la chapita ya no se calcula; el comentario v859 la nombra pero no es código)');
t(extractFunc('pzHoyCardHTML').includes('pz-hoy-row') && extractFunc('pzHoyCardHTML').includes('pz-hoy-col'),
  '§A: pzHoyCardHTML rinde la fila horizontal (.pz-hoy-row + .pz-hoy-col)');
t(extractFunc('pzHoyCardHTML').includes('Tocá la foto para ver el detalle'),
  '§A: pzHoyCardHTML rinde la meta «Tocá la foto para ver el detalle →»');
t(!CSS.includes('.pz-hoy-cap{'), '§A: la regla .pz-hoy-cap muere en styles.css (×0)');
t(!CSS.includes('.pz-hoy-body{'), '§A: la regla .pz-hoy-body muere en styles.css (×0; el comentario v859 la nombra pero no es regla)');
t(!CSS.includes('.pz-hoy-thumb::after'), '§A: el degradado .pz-hoy-thumb::after muere en styles.css (×0)');
t(CSS.includes('.pz-hoy-row{display:flex;gap:12px;align-items:stretch}'),
  '§A: styles.css trae .pz-hoy-row (flex, gap 12, stretch)');
t(CSS.includes('.pz-hoy-thumb{flex:0 0 96px;width:96px;height:120px;border-radius:14px'),
  '§A: styles.css trae la miniatura 96×120 4:5 con radio 14');
t(CSS.includes('.pz-hoy-col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}'),
  '§A: styles.css trae .pz-hoy-col (flex 1, min-width 0, centrada)');
t(CSS.includes('.pz-hoy-col p{') && CSS.includes('-webkit-line-clamp:4'),
  '§A: el caption en la columna va con clamp 4');
t(CSS.includes('.pz-hoy-card{padding:12px;overflow:hidden}'),
  '§A: la tarjeta lleva padding 12px (antes 0, la foto sangraba)');
t(CSS.includes('.pz-hoy-actions .btn{flex:1;padding:12px 10px}'),
  '§A: los botones quedan IGUALES (padding 12px 10px, mismo tamaño)');
t(CSS.includes('#inicioView .pz-hoy-actions .btn-publish{background:#22C55E'),
  '§A: «Dale, publicalo ✓» sigue verde #22C55E en #inicioView');
t(APP.includes("const CHUNK_V = '20261105-v850'"),
  '§A: CHUNK_V sin cambio (v850: ningún chunk lazy se toca en este lote)');
t(!extractFunc('pzHoyHoyHTML').includes('pz-hoy-row'),
  '§A: pzHoyHoyHTML NO se toca (la cabecera es la misma; la fila vive en la tarjeta)');

// ---------- Datos de prueba ----------
// 19:00 EST = 00:00 UTC del día siguiente. Ids reales de la cuenta de
// Valentino (user 12): el posteo de hoy es el 583, con su caption real.
const at19 = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 24)).toISOString(); };
const CAPTION_FIT = '¿Cuántas veces te pasó de no tener idea qué postear para tu gimnasio? 🤔 Con Posty, tu semana de contenido sale sola, adaptada a lo que querés transmitir. Dejá que tu comunidad esté siempre activa mientras yo me encargo de los diseños, textos y hashtags. Escribime por DM y empecemos a trabajar juntos en tu Instagram.';
const P = (id, extra) => Object.assign({ id, user_id: 12, image_path: '/media/' + id + '.jpg', caption: 'Posteo ' + id, hashtags: '', scheduled_at: null, published_at: null, status: 'scheduled', tipo: 'social', media_type: 'image', week_key: '2026-11-09', approval: 'pending', created_at: '2026-11-08 10:00:00' }, extra || {});
const HOY = P(583, { caption: CAPTION_FIT, scheduled_at: at19('2026-11-09'), status: 'scheduled', approval: 'pending' });
const HOY_OK = P(583, { caption: CAPTION_FIT, scheduled_at: at19('2026-11-09'), status: 'scheduled', approval: 'approved' });
const BORRADOR = P(584, { caption: 'Borrador sin foto ni fecha', image_path: '', scheduled_at: null, status: 'draft', approval: 'pending' });
const MANANA = P(582, { caption: 'El de mañana', scheduled_at: at19('2026-11-10'), status: 'scheduled', approval: 'pending' });

// ---------- §B: la tarjeta real (VM) ----------
console.log('— §B: la tarjeta real');
setNow('2026-11-09T16:50:00.000Z'); // lun 9/11 11:50 EST — la hora de la captura de Valentino
const main = sb.pzHoyHoyHTML(HOY, { en: false, tz: TZ });
t(main.includes('EL POSTEO DE HOY'), '§B: la principal lleva su cabecera', main.slice(0, 300));
t(main.includes('hoy · 19:00'), '§B: la principal lleva el pill «hoy · 19:00»', main.slice(0, 400));
t(main.includes('data-pz-cuenta-sale="2026-11-10T00:00:00.000Z"'), '§B: la cuenta es un span propio con data-pz-cuenta-sale', main.slice(0, 600));
t(main.includes('sale en 7 h 10 min'), '§B: a las 11:50 EST la cuenta dice «sale en 7 h 10 min» (como la captura)', main.slice(0, 600));
t((main.match(/19:00/g) || []).length === 1, '§B: la hora 19:00 aparece UNA sola vez en la tarjeta principal', main);
t(main.includes('pz-hoy-row') && main.includes('pz-hoy-thumb') && main.includes('pz-hoy-col'),
  '§B: la tarjeta es una fila horizontal (row + thumb + col)', main.slice(0, 900));
t(main.indexOf('pz-hoy-thumb') < main.indexOf('<p>'), '§B: la foto va ANTES que el caption (izquierda, luego texto)');
t(main.indexOf('pz-hoy-row') < main.indexOf('pz-hoy-actions'), '§B: la fila va antes que los botones');
t(main.includes('data-pz-hoy-detalle="583"'), '§B: la miniatura se toca para ver el detalle (data-pz-hoy-detalle=583)');
t(main.includes('class="pz-hoy-thumb-img"') && main.includes('/media/583.jpg'), '§B: la miniatura trae la imagen real del posteo');
t(main.includes('<span class="pz-hoy-fmt">📸 Post</span>'), '§B: la chapita de formato «📸 Post» sigue sobre la miniatura');
t(!main.includes('pz-hoy-cap'), '§B: SIN chapita de caption sobre la foto');
t(!main.includes('pz-hoy-body'), '§B: SIN .pz-hoy-body (la tarjeta ya no apila)');
t(!main.includes('class="pz-hoy-when"'), '§B: SIN el badge «Hoy 19:00» sobre la foto (sinCuando, como v848)');
t((main.match(/¿Cuántas veces te pasó/g) || []).length === 1, '§B: el caption aparece UNA sola vez (su primera frase ×1)', main);
t((main.match(/Con Posty, tu semana de contenido sale sola/g) || []).length === 1, '§B: el caption aparece UNA sola vez (su segunda frase ×1)', main);
t(main.includes('Tocá la foto para ver el detalle →'), '§B: la meta «Tocá la foto para ver el detalle →» está en la columna');
t(main.includes('Dale, publicalo ✓') && main.includes('Cambialo'), '§B: los dos botones siguen (publicar + cambiar)');
t((main.match(/Dale, publicalo ✓/g) || []).length === 1, '§B: «Dale, publicalo ✓» ×1');
t(main.indexOf('Dale, publicalo ✓') < main.indexOf('Cambialo'), '§B: el orden de los botones no cambia (publicar primero)');
t(main.includes('btn-publish') && main.includes('btn-ghost'), '§B: el botón de publicar sigue btn-publish (verde) y el otro btn-ghost');
t(main.includes('data-pz-hoy-aprobar="583"'), '§B: el botón «Dale» sigue llevando su data-pz-hoy-aprobar (flujo aprobar intacto)');
t(main.includes('data-pz-hoy-when="2026-11-10T00:00:00.000Z"'), '§B: el botón «Dale» sigue llevando su data-pz-hoy-when (metadata del flujo aprobar)');
const mainEn = sb.pzHoyHoyHTML(HOY, { en: true, tz: TZ });
t(mainEn.includes('TODAY\u2019S POST') && mainEn.includes('today · 07:00 PM') && mainEn.includes('goes out in 7 h 10 min'),
  '§B: EN: cabecera + pill + cuenta en espejo', mainEn.slice(0, 500));
t(mainEn.includes('Tap the photo to see the detail →') && mainEn.includes('Publish it ✓') && mainEn.includes('Change it'),
  '§B: EN: meta + botones en espejo');
t((mainEn.match(/¿Cuántas veces te pasó/g) || []).length === 1, '§B: EN: el caption aparece UNA sola vez');
t(!mainEn.includes('pz-hoy-cap') && !mainEn.includes('pz-hoy-body'), '§B: EN: sin chapita ni body');
// Borrador sin imagen: no rompe, sin <img>, con botones (pendiente).
const cardDraft = sb.pzHoyCardHTML(BORRADOR, { cartita: false, sinCuando: true, en: false, tz: TZ });
t(cardDraft.includes('pz-hoy-row') && !cardDraft.includes('<img'), '§B: el borrador sin imagen rinde la fila sin <img> (nunca un bloque de color)');
t(cardDraft.includes('Borrador sin foto ni fecha') && cardDraft.includes('Dale, publicalo ✓'),
  '§B: el borrador trae su caption ×1 + botones (pendiente)');
// Aprobado (ya no pendiente): sin botones, con notaOk, en horizontal.
const cardOk = sb.pzHoyCardHTML(HOY_OK, { cartita: false, sinCuando: true, en: false, tz: TZ });
t(!cardOk.includes('Dale, publicalo ✓') && cardOk.includes('pz-hoy-ok'), '§B: el aprobado NO trae botones y trae la nota «✓ Agendado…»');
t(cardOk.includes('pz-hoy-row') && (cardOk.match(/¿Cuántas veces te pasó/g) || []).length === 1,
  '§B: el aprobado sigue horizontal y con el caption ×1');
// Formatos: video / carrusel / historia.
for (const [mt, fmt] of [['video', '🎬 Reel'], ['carousel', '🖼️ Carrusel'], ['story', '📸 Historia']]) {
  const c = sb.pzHoyCardHTML(P(590, { media_type: mt }), { cartita: false, sinCuando: true, en: false, tz: TZ });
  t(c.includes(fmt), '§B: formato ' + mt + ' lleva su chapita «' + fmt + '»');
}
// El camino cartita (dormante: ningún caller pasa cartita:true hoy) sigue
// rindiendo pill + cuenta, en horizontal.
const cardCartita = sb.pzHoyCardHTML(MANANA, { cartita: true, en: false, tz: TZ });
t(cardCartita.includes('Se postea mañana · 19:00'), '§B: la cartita sigue rindiendo su pill «Se postea mañana · 19:00»');
t(cardCartita.includes('data-pz-cuenta-sale'), '§B: la cartita sigue rindiendo su cuenta en vivo');
t(cardCartita.includes('pz-hoy-row'), '§B: la cartita también queda horizontal');

// ---------- §C: auditoría M78 ----------
console.log('— §C: auditoría M78');
const isDef = (n) => new RegExp('function ' + n + '\\s*\\(').test(APP)
  || new RegExp('window\\.' + n + '\\s*=').test(APP)
  || ['esc', 'mv', 'String', 'Number', 'Math', 'Date', 'JSON', 'Intl'].includes(n);
let audN = 0, audOk = 0;
for (const fn of ['pzHoyCardHTML', 'pzHoyHoyHTML', 'pzHoyPillSalida', 'pzHoyCuandoCorto', 'pzHoyCuentaSaleTxt', 'pzHoyHoraCorta']) {
  const src = extractFunc(fn).replace(/\/\/[^\n]*/g, '').replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\])*'/g, "''");
  const cands = [...new Set(src.match(/\b(pz[A-Za-z0-9_$]*|hf[A-Za-z0-9_$]*|esc|mv)\s*\(/g) || [])]
    .map((s) => s.replace(/\s*\($/, ''))
    .filter((n) => n !== fn);
  for (const c of cands) {
    audN++;
    if (isDef(c)) audOk++;
    else t(false, '§C: ' + fn + ' llama a ' + c + ' pero NO está definida', c);
  }
}
t(audN > 0 && audOk === audN, `§C: funciones auditadas: ${audOk}/${audN} (todo lo que las funciones tocadas llaman existe)`, `${audOk}/${audN}`);
// La meta nueva no llama a nada: es texto fijo en la plantilla.

// ---------- §D: boot ----------
console.log('— §D: boot');
const PORT = 34634;
const SECRET = 'lote-posteo-hoy-compacto-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posteo-hoy-compacto-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(sid, method, p, body, token) {
  const url = `http://127.0.0.1:${PORT}${p}${token ? (p.includes('?') ? '&' : '?') + 'token=' + token : ''}`;
  const r = await fetch(url, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
async function apiText(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return { status: r.status, text: await r.text() };
}
async function runBoot() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-admin-phc',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'sk-test-phc',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§D: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await api('x', 'GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v859',
      '§D: /api/version trae el BUILD v859 (estampado)', JSON.stringify(ver.json));
    const idx = await apiText('/?cb=phc859');
    t(idx.status === 200 && idx.text.includes('app.js?v=587') && idx.text.includes('styles.css?v=20261226'),
      '§D: el index servido trae app.js?v=587 + styles?v=20261226');
    const appJs = await apiText('/app.js?v=999');
    t(appJs.status === 200 && appJs.text.includes('pz-hoy-row') && appJs.text.includes('Tocá la foto para ver el detalle'),
      '§D: el app.js servido trae el cableado del lote (fila + meta)');
    t(appJs.status === 200 && !appJs.text.includes('pz-hoy-cap">') && !appJs.text.includes('pz-hoy-body'),
      '§D: el app.js servido NO trae la chapita ni el body');
    t(md5(appJs.text) === md5(APP), '§D: el app.js servido es el del árbol (md5 igual)');
    const css = await apiText('/styles.css?v=999');
    t(css.status === 200 && css.text.includes('.pz-hoy-thumb{flex:0 0 96px;width:96px;height:120px') && !css.text.includes('.pz-hoy-cap{'),
      '§D: el styles.css servido trae la miniatura 96×120 y sin .pz-hoy-cap');
    t(md5(css.text) === md5(CSS), '§D: el styles.css servido es el del árbol (md5 igual)');
    const errLines = out.split('\n').filter((l) => /^(Error|TypeError|ReferenceError)|Uncaught/i.test(l.trim()));
    t(errLines.length === 0, '§D: 0 errores en la salida del boot', errLines.slice(0, 3).join(' | '));
  } catch (e) {
    t(false, '§D: boot', e.message);
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- §E: render real a 390px (Playwright, si está disponible) ----------
const PY_MEASURE = `
import json, sys
from playwright.sync_api import sync_playwright
html_path, out_path = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.goto('file://' + html_path)
    pg.wait_for_timeout(400)
    m = pg.evaluate("""() => {
      const card = document.querySelector('.pz-hoy-card');
      const thumb = document.querySelector('.pz-hoy-thumb');
      const r = card ? card.getBoundingClientRect() : null;
      const tr = thumb ? thumb.getBoundingClientRect() : null;
      return {
        cardH: r ? r.height : null,
        cardW: r ? r.width : null,
        thumbW: tr ? tr.width : null,
        thumbH: tr ? tr.height : null,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth
      };
    }""")
    b.close()
with open(out_path, 'w') as f:
    json.dump(m, f)
`;
function runRender() {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phc-render-'));
    const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
    setNow('2026-11-09T16:50:00.000Z');
    let cardHtml = '';
    try { cardHtml = sb.pzHoyHoyHTML(HOY, { en: false, tz: TZ }); }
    catch (e) { t(false, '§E: no se pudo rendir la tarjeta', e.message); cleanup(); return resolve(); }
    // La foto real no existe en el árbol de test: GIF 1×1 (la caja del
    // thumb es CSS fijo 96×120, no depende de la imagen).
    cardHtml = cardHtml.replace(/src="[^"]*"/, 'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"');
    // styles.css trae un «</style>» dentro de un comentario (línea 3907): al
    // inlinear el CSS hay que romper esa secuencia o el navegador cierra el
    // <style> ahí y las reglas de después (incluidas las del lote) no aplican.
    const CSS_INLINE = CSS.split('</style').join('<' + String.fromCharCode(92) + '/style');
    const page = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>\n'
      + CSS_INLINE + '\n</style></head><body style="margin:0;background:#F7F2E9"><div id="inicioView"><div style="width:390px;margin:0 auto;padding:18px 16px 28px;box-sizing:border-box">'
      + cardHtml + '</div></div><script>window.__imgFb=function(){};</script></body></html>';
    const htmlPath = path.join(dir, 'card.html');
    const pyPath = path.join(dir, 'measure.py');
    const outPath = path.join(dir, 'm.json');
    fs.writeFileSync(htmlPath, page);
    fs.writeFileSync(pyPath, PY_MEASURE);
    execFile('python3', [pyPath, htmlPath, outPath], { timeout: 60000 }, (err) => {
      if (err) { skip('§E: render a 390px', 'Playwright no disponible en este entorno (' + String(err.message || err).slice(0, 120) + ')'); cleanup(); return resolve(); }
      let m = null;
      try { m = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (e) { t(false, '§E: no se leyó la medición', e.message); cleanup(); return resolve(); }
      console.log('— §E: medición real a 390px:', JSON.stringify(m));
      t(typeof m.cardH === 'number' && m.cardH <= 210, '§E: la tarjeta mide ≤ 210 px de alto a 390px (mock: 197 px; el lote mantiene 12px en botones → ~201 px)', 'cardH=' + m.cardH);
      t(typeof m.cardH === 'number' && ((282 - m.cardH) / 282) >= 0.25, '§E: la tarjeta es ≥ 25% más baja que la vieja (282 px)', 'cardH=' + m.cardH);
      t(Math.abs(m.thumbW - 96) <= 1 && Math.abs(m.thumbH - 120) <= 1, '§E: la miniatura mide 96×120 en el render', 'thumb=' + m.thumbW + '×' + m.thumbH);
      t(typeof m.scrollW === 'number' && m.scrollW <= 390, '§E: sin desborde horizontal a 390px (scrollWidth ≤ 390)', 'scrollW=' + m.scrollW);
      cleanup();
      resolve();
    });
  });
}

(async () => {
  await runBoot();
  await runRender();
  console.log(`\nPOSTEO-HOY-COMPACTO: ${okN} ok, ${badN} fallos${skipN ? `, ${skipN} saltados` : ''}`);
  process.exit(badN ? 1 : 0);
})();
