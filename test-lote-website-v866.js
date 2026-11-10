'use strict';
/* test-lote-website-v866.js — LOTE WEBSITE v866 (base v859).
 * Orden de Valentino 10/11 08:26-08:29. Tres arreglos, espejo ES+EN:
 *  1) videos 2.5 a la home: ES = landingView en public/app.js (la home ES
 *     viva la rinde app.js; index.html es solo el shell pre-JS) + EN =
 *     public/en/index.html (estatica, sin app.js). Seccion antes del form
 *     de #prueba, misma logica que /prueba. CSS .vp-* en linea junto a la
 *     seccion (styles.css NO se toca -> styles?v= queda en 20261226).
 *     ?v= 587 -> 591 PROVISORIO (590 es de v870 (hero+quiz) — NO usar 590; 0 ocurrencias en
 *     la cola; el re-estampador verifica antes de estampar).
 *  2) sacar la imagen mala de /prueba: solo el <section class="oc-workhero">
 *     de prueba.html y en-prueba.html. posty-disenando.webp sigue en uso
 *     (.tk-work) y no se borra; el CSS .oc-* queda muerto.
 *  3) rubros + flecha clickeables en "Semanas reales" de /prueba: CAUSA
 *     RAIZ: el IIFE del carrusel usaba track/prev/next/vp sin definirlos
 *     (no hay getElementById('ejTrack'|'ejPrev'|'ejNext'|'ejViewport') en
 *     ningun lado; los unicos var prev/next son locales de otras funciones).
 *     La 1a linea tira ReferenceError y el IIFE muere antes de cablear
 *     chips y flechas. FIX: definir los 4 por getElementById al abrir el
 *     IIFE, con guarda.
 * Cubre, con el codigo real del arbol y un DOM falso minimo, y con boot
 * aislado (DB temporal, sin tocar produccion):
 *  A) estaticos: BUILD v866 x1, cero v859; ?v=591 x1 en el index ES;
 *     styles.css?v=20261226 intacto en AMBOS index; seccion de videos
 *     2.5 en la home ES (app.js) y EN (en/index.html) con los 5 videos y
 *     sus posters; oc-workhero x0 en /prueba y /en/prueba; el IIFE ej
 *     define los 4 getElementById; styles.css sin .vp- (no se toco);
 *  B) el carrusel ej real (VM): no tira ReferenceError; pagina, avanza
 *     con la flecha, vuelve con la anterior; el chip filtra por rubro y
 *     'all' restaura; EN en espejo; CONTRA-PRUEBA: el IIFE pristino v859
 *     tira ReferenceError (track is not defined);
 *  C) auditoria M78: todo lo que landingView llama (directas, handlers
 *     on*, interpolaciones ${...}) existe definido en el bundle; el
 *     bloque nuevo de videos no trae handlers;
 *  D) boot: /api/version v866, index servido con app.js?v=591 +
 *     styles.css?v=20261226, app.js servido = el del arbol (md5), /en y
 *     /prueba y /en/prueba servidos con el lote, los 5 videos + 5
 *     posters con 200;
 *  E) render real a 390px (Playwright, si esta disponible; si no, SKIP):
 *     la home ES muestra la fila de videos 2.5 (5 videos, 148x263) sin
 *     desborde horizontal; la home EN igual; en /prueba el chip de rubro
 *     filtra de verdad y la flecha avanza el carrusel.
 * En el arbol pristino v859 los tests nuevos deben FALLAR (cazan el cambio).
 * Uso: node test-lote-website-v866.js — sale 0 si todo pasa.
 *   V866_TREE=<dir>  arbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const TREE = path.resolve(process.env.V866_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX_ES = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const PRUEBA = fs.readFileSync(path.join(TREE, 'public', 'prueba.html'), 'utf8');
const PRUEBA_EN = fs.readFileSync(path.join(TREE, 'public', 'en-prueba.html'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const count = (s, sub) => s.split(sub).length - 1;

let okN = 0, badN = 0, skipN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};
const skip = (name, why) => { skipN++; console.log('— SKIP', name, '-', why); };

// ---------- §A: estaticos ----------
console.log('— §A: estaticos');
t(count(SRV, '20261105-v866') === 1, '§A: BUILD v866 ×1 en server.js');
t(count(SRV, '20261105-v859') === 0, '§A: cero v859 en server.js');
t(count(IDX_ES, 'app.js?v=591') === 1, '§A: ?v=591 ×1 en el index ES');
t(count(IDX_ES, 'app.js?v=587') === 0, '§A: cero ?v=587 en el index ES');
t(count(IDX_ES, 'styles.css?v=20261226') === 1, '§A: styles.css?v=20261226 ×1 en el index ES');
t(count(IDX_EN, 'styles.css?v=20261226') === 1, '§A: styles.css?v=20261226 ×1 en el index EN');
t(!IDX_EN.includes('app.js?v='), '§A: el index EN no carga app.js (pagina estatica)');
t(count(CSS, 'vp-') === 0, '§A: styles.css sin .vp- (no se toco)');
for (const [nm, html, h3] of [['ES', APP, 'Un video premium cada semana'], ['EN', IDX_EN, 'One premium video every week']]) {
  t(count(html, h3) === 1, `§A: home ${nm} trae el titulo de videos 2.5`);
  for (const v of ['video-premium-cafe.mp4', 'video-premium-perfume.mp4', 'video-premium-sneaker.mp4', 'video-premium-pasteleria.mp4', 'video-premium-unas.mp4']) {
    t(count(html, v) === 1, `§A: home ${nm} trae ${v} ×1`);
  }
  for (const p of ['poster-cafe.jpg', 'poster-perfume.jpg', 'poster-sneaker.jpg', 'poster-pasteleria.jpg', 'poster-unas.jpg']) {
    t(count(html, p) === 1, `§A: home ${nm} trae ${p} ×1`);
  }
  t(count(html, 'vp-row vp-top') === 1, `§A: home ${nm} trae la fila vp-top ×1`);
}
t(count(APP, 'video-premium-cafe.mp4') === 1, '§A: app.js trae los videos 2.5 solo en la home (sin duplicar)');
for (const [nm, html] of [['ES', PRUEBA], ['EN', PRUEBA_EN]]) {
  t(count(html, 'class="oc-workhero"') === 0, `§A: /prueba ${nm} sin el section oc-workhero`);
  t(count(html, 'posty-disenando.webp') === 1, `§A: /prueba ${nm} sigue usando posty-disenando.webp solo en .tk-work`);
  t(count(html, "getElementById('ejTrack')") === 1, `§A: /prueba ${nm} define track por getElementById`);
  t(count(html, "getElementById('ejPrev')") === 1, `§A: /prueba ${nm} define prev por getElementById`);
  t(count(html, "getElementById('ejNext')") === 1, `§A: /prueba ${nm} define next por getElementById`);
  t(count(html, "getElementById('ejViewport')") === 1, `§A: /prueba ${nm} define vp por getElementById`);
  t(count(html, 'ej-chip') >= 13, `§A: /prueba ${nm} conserva las pildoras de rubro`);
}
t(count(PRUEBA, 'Así trabaja Posty por vos') === 0, '§A: /prueba ES sin el globo de la imagen mala');
t(count(PRUEBA_EN, 'This is how Posty works for you') === 0, '§A: /prueba EN sin el globo de la imagen mala');
for (const v of ['video-premium-cafe.mp4', 'video-premium-perfume.mp4', 'video-premium-sneaker.mp4', 'video-premium-pasteleria.mp4', 'video-premium-unas.mp4']) {
  t(fs.existsSync(path.join(TREE, 'public', 'videos', v)), '§A: existe en el arbol public/videos/' + v);
}
for (const p of ['poster-cafe.jpg', 'poster-perfume.jpg', 'poster-sneaker.jpg', 'poster-pasteleria.jpg', 'poster-unas.jpg']) {
  t(fs.existsSync(path.join(TREE, 'public', 'videos', p)), '§A: existe en el arbol public/videos/' + p);
}

// ---------- §B: carrusel ej real (VM + DOM falso) ----------
console.log('— §B: carrusel ej (VM)');
function extractEj(html) {
  const anchor = "var allCards=Array.prototype.slice.call(track.querySelectorAll('.ej-card'));";
  const i = html.indexOf(anchor);
  if (i < 0) return null;
  const start = html.lastIndexOf('(function(){', i);
  const endMark = 'upd();\n})();';
  const e = html.indexOf(endMark, i);
  if (start < 0 || e < 0) return null;
  return html.slice(start, e + endMark.length);
}
function mkEl(tag) {
  const el = {
    tagName: tag, children: [], style: {}, _cls: new Set(), _attrs: {}, _handlers: {},
    classList: null, className: '',
    addEventListener(ev, fn) { (el._handlers[ev] = el._handlers[ev] || []).push(fn); },
    click(ev) { (el._handlers[ev || 'click'] || []).forEach((fn) => fn.call(el, {})); },
    appendChild(c) { el.children.push(c); return c; },
    getAttribute(k) { return el._attrs[k]; },
    setAttribute(k, v) { el._attrs[k] = v; },
  };
  el.classList = {
    add(c) { el._cls.add(c); },
    remove(c) { el._cls.delete(c); },
    toggle(c, f) { if (f === undefined) f = !el._cls.has(c); if (f) el._cls.add(c); else el._cls.delete(c); },
    contains(c) { return el._cls.has(c); },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set(v) { if (v === '') el.children = []; },
  });
  return el;
}
function runEj(code) {
  const rubros = ['cafe', 'cafe', 'gym', 'gym', 'floreria', 'barberia', 'barberia', 'barberia', 'perfumeria', 'pasteleria', 'unas', 'cafe'];
  const cards = rubros.map((r) => { const c = mkEl('div'); c._attrs['data-rubro'] = r; c.className = 'ej-card'; return c; });
  const track = mkEl('div');
  track.querySelectorAll = (sel) => (sel === '.ej-card' ? cards : []);
  // El HTML estatico ya trae las 3 .ej-page pre-rendidas con las 12 tarjetas:
  // el IIFE no llama a build() al cargar, solo upd().
  for (let p = 0; p < 3; p++) {
    const pg = mkEl('div'); pg.className = 'ej-page';
    cards.slice(p * 4, p * 4 + 4).forEach((c) => pg.appendChild(c));
    track.appendChild(pg);
  }
  const prev = mkEl('button'), next = mkEl('button'), vp = mkEl('div');
  const chips = ['all', 'cafe', 'gym', 'floreria', 'barberia', 'perfumeria', 'pasteleria', 'unas'].map((f) => {
    const ch = mkEl('button'); ch._attrs['data-f'] = f; ch.className = 'ej-chip'; return ch;
  });
  const trkCalls = [];
  const ctx = {
    document: {
      querySelectorAll: (sel) => (sel === '#ejFilters .ej-chip' ? chips : []),
      getElementById: (id) => ({ ejTrack: track, ejPrev: prev, ejNext: next, ejViewport: vp })[id] || null,
      createElement: (tag) => mkEl(tag),
    },
    trk: (...a) => { trkCalls.push(a); },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const chip = (f) => chips.find((c) => c._attrs['data-f'] === f);
  return { track, prev, next, vp, chips, chip, trkCalls, cards };
}
for (const [nm, html] of [['ES', PRUEBA], ['EN', PRUEBA_EN]]) {
  const code = extractEj(html);
  t(code !== null, `§B: se extrae el IIFE ej de /prueba ${nm}`);
  if (!code) continue;
  let r = null, threw = null;
  try { r = runEj(code); } catch (e) { threw = e; }
  t(threw === null, `§B: el IIFE ej ${nm} NO tira ReferenceError`, threw && threw.message);
  if (!r) continue;
  t(r.track.children.length === 3, `§B ej ${nm}: 12 tarjetas en 3 paginas al cargar`, 'paginas=' + r.track.children.length);
  t(r.track.style.transform === 'translateX(0%)', `§B ej ${nm}: pagina 0 al cargar`, r.track.style.transform);
  t(r.prev.classList.contains('off') && !r.next.classList.contains('off'), `§B ej ${nm}: flecha prev apagada y next prendida en la pagina 0`);
  t(r.vp._handlers.touchstart && r.vp._handlers.touchstart.length === 1, `§B ej ${nm}: swipe tactil cableado en el viewport`);
  r.next.click();
  t(r.track.style.transform === 'translateX(-100%)', `§B ej ${nm}: la flecha › avanza a la pagina 1`, r.track.style.transform);
  t(!r.prev.classList.contains('off'), `§B ej ${nm}: prev se prende tras avanzar`);
  r.next.click();
  t(r.track.style.transform === 'translateX(-200%)', `§B ej ${nm}: la flecha › avanza a la pagina 2`, r.track.style.transform);
  t(r.next.classList.contains('off'), `§B ej ${nm}: next se apaga en la ultima pagina`);
  r.prev.click();
  t(r.track.style.transform === 'translateX(-100%)', `§B ej ${nm}: la flecha ‹ vuelve a la pagina 1`, r.track.style.transform);
  r.chip('cafe').click();
  t(r.track.children.length === 1, `§B ej ${nm}: el chip cafe deja 1 pagina`, 'paginas=' + r.track.children.length);
  t(r.track.children[0].children.length === 3 && r.track.children[0].children.every((c) => c._attrs['data-rubro'] === 'cafe'),
    `§B ej ${nm}: el chip cafe deja solo las 3 tarjetas de cafe`);
  t(r.chip('cafe').classList.contains('on') && !r.chip('all').classList.contains('on'), `§B ej ${nm}: el chip cafe queda marcado como activo`);
  t(r.trkCalls.length >= 1 && r.trkCalls[0][0] === 'prueba_rubro_chip', `§B ej ${nm}: el chip dispara el tracking`, JSON.stringify(r.trkCalls[0]));
  r.chip('barberia').click();
  t(r.track.children.length === 1 && r.track.children[0].children.length === 3, `§B ej ${nm}: el chip barberia deja sus 3 tarjetas`);
  r.chip('all').click();
  t(r.track.children.length === 3, `§B ej ${nm}: el chip Todos restaura las 3 paginas`, 'paginas=' + r.track.children.length);
}
// Contra-prueba: el IIFE pristino v859 tira ReferenceError (track sin definir)
const PRISTINE = path.resolve(TREE, '..', '..', '.reestampador-posteo-hoy-compacto-v859', 'release', 'public', 'prueba.html');
if (fs.existsSync(PRISTINE)) {
  const code0 = extractEj(fs.readFileSync(PRISTINE, 'utf8'));
  t(code0 !== null, '§B: se extrae el IIFE ej pristino v859');
  let threw0 = null;
  try { runEj(code0); } catch (e) { threw0 = e; }
  // OJO: el error nace en el realm del vm, instanceof ReferenceError del host da false.
  t(threw0 && threw0.name === 'ReferenceError' && /track is not defined/.test(threw0.message),
    '§B contra-prueba: el IIFE v859 tira ReferenceError (track is not defined)', threw0 && (threw0.name + ': ' + threw0.message));
} else {
  skip('§B contra-prueba v859', 'no esta el arbol pristino v859');
}

// ---------- §C: auditoria M78 ----------
console.log('— §C: auditoria M78');
function extractFunc(name) {
  const i = APP.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = APP.indexOf('{', i);
  let d = 0, k = j;
  while (k < APP.length) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (d === 0) break; }
    k++;
  }
  return APP.slice(i, k + 1);
}
const isDef = (n) => new RegExp('function ' + n + '\\s*\\(').test(APP)
  || new RegExp('window\\.' + n + '\\s*=').test(APP)
  || ['esc', 'mv', 'String', 'Number', 'Math', 'Date', 'JSON', 'Intl'].includes(n);
const API = ['encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'parseInt', 'parseFloat', 'querySelector', 'querySelectorAll', 'getElementById',
  'getElementsByClassName', 'setItem', 'getItem', 'removeItem', 'trim',
  'toLowerCase', 'toUpperCase', 'replace', 'split', 'join', 'push', 'slice',
  'indexOf', 'includes', 'map', 'filter', 'find', 'forEach', 'toLocaleString',
  'setAttribute', 'getAttribute', 'addEventListener', 'preventDefault',
  'scrollIntoView', 'focus', 'click', 'reload', 'fetch', 'setTimeout'];
const lvSrc = extractFunc('landingView');
t(lvSrc.length > 0, '§C: se extrae landingView del bundle');
const handlers = new Set();
for (const m of lvSrc.matchAll(/on(?:click|submit)="([^"]*)"/g)) {
  for (const f of m[1].matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) handlers.add(f[1]);
}
const codePart = lvSrc.replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/\/\/[^\n]*/g, '');
const direct = new Set();
for (const m of codePart.matchAll(/(^|[^.\w$])(pz[A-Za-z0-9_$]*|lp[A-Za-z0-9_$]*|planCardsHTML|cleanIgHandle|toggleMobileMenu)\s*\(/g)) direct.add(m[2]);
const interp = new Set();
for (const m of lvSrc.matchAll(/\$\{([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)) interp.add(m[1]);
const audSet = [...new Set([...handlers, ...direct, ...interp])].filter((n) => !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(n));
let audOk = 0;
for (const c of audSet) { if (isDef(c) || API.includes(c)) audOk++; else console.log('✗ §C NO DEFINIDA:', c); }
t(audSet.length > 0 && audOk === audSet.length, `§C: funciones auditadas: ${audOk}/${audSet.length} (todo lo que landingView llama existe)`, `${audOk}/${audSet.length}`);
const vpStart = APP.indexOf('Un video premium cada semana');
const vpEnd = APP.indexOf('lp-week-bridge', vpStart);
const vpBlock = vpStart >= 0 && vpEnd > vpStart ? APP.slice(vpStart, vpEnd) : '';
t(vpStart >= 0 && (vpBlock.match(/on(?:click|submit)=/g) || []).length === 0, '§C: el bloque nuevo de videos no trae handlers');

// ---------- §D: boot ----------
console.log('— §D: boot');
const PORT = 34671;
const SECRET = 'lote-website-v866-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-v866-'));
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
  return { status: r.status, text: await r.text(), type: r.headers.get('content-type') || '' };
}
async function apiHead(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'HEAD' });
  return { status: r.status, type: r.headers.get('content-type') || '' };
}
let bootOut = '';
async function startBoot() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-admin-v866',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'sk-test-v866',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { bootOut += String(d); });
  child.stderr.on('data', (d) => { bootOut += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
      if (r.ok) { up = true; break; }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { child, up };
}

// ---------- §E: render real a 390px (Playwright, si esta disponible) ----------
const PY_MEASURE = `
import json, sys
from playwright.sync_api import sync_playwright
base, out_path = sys.argv[1], sys.argv[2]
res = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.goto(base + '/', wait_until='networkidle')
    pg.wait_for_timeout(2500)
    res['home'] = pg.evaluate("""() => {
      const vp = document.querySelector('.lp-vp');
      const vids = vp ? vp.querySelectorAll('video') : [];
      const first = vids[0] ? vids[0].getBoundingClientRect() : null;
      return { vp: !!vp, videos: vids.length,
        firstW: first ? first.width : null, firstH: first ? first.height : null,
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
    }""")
    pg.goto(base + '/en', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    res['home_en'] = pg.evaluate("""() => {
      const vp = document.querySelector('.lp-vp');
      return { vp: !!vp, videos: vp ? vp.querySelectorAll('video').length : 0,
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
    }""")
    pg.goto(base + '/prueba', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    res['prueba'] = pg.evaluate("""() => {
      const chips = Array.from(document.querySelectorAll('#ejFilters .ej-chip'));
      const cafe = chips.find(c => c.getAttribute('data-f') === 'cafe');
      const before = document.querySelectorAll('#ejTrack .ej-card').length;
      const cafeTotal = document.querySelectorAll('#ejTrack .ej-card[data-rubro="cafe"]').length;
      if (cafe) cafe.click();
      const after = document.querySelectorAll('#ejTrack .ej-card').length;
      const allOn = cafe ? cafe.classList.contains('on') : false;
      const next = document.querySelector('#ejNext');
      if (next) { const all = document.querySelector('#ejFilters .ej-chip[data-f="all"]'); if (all) all.click(); }
      const beforeNav = document.querySelector('#ejTrack').style.transform;
      if (next) next.click();
      const afterNav = document.querySelector('#ejTrack').style.transform;
      return { ocWorkhero: !!document.querySelector('.oc-workhero'),
        chips: chips.length, before, cafeTotal, after, allOn,
        beforeNav, afterNav, scrollW: document.documentElement.scrollWidth };
    }""")
    b.close()
with open(out_path, 'w') as f:
    json.dump(res, f)
`;
function runRender(base) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v866-render-'));
    const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
    const pyPath = path.join(dir, 'measure.py');
    const outPath = path.join(dir, 'm.json');
    fs.writeFileSync(pyPath, PY_MEASURE);
    execFile('python3', [pyPath, base, outPath], { timeout: 120000 }, (err) => {
      if (err) { skip('§E: render a 390px', 'Playwright no disponible en este entorno (' + String(err.message || err).slice(0, 120) + ')'); cleanup(); return resolve(); }
      let m = null;
      try { m = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch (e) { t(false, '§E: no se leyo la medicion', e.message); cleanup(); return resolve(); }
      console.log('— §E: medicion real a 390px:', JSON.stringify(m));
      t(m.home && m.home.vp === true, '§E: la home ES muestra la fila de videos 2.5', JSON.stringify(m.home));
      t(m.home && m.home.videos === 5, '§E: la home ES muestra los 5 videos', 'videos=' + (m.home && m.home.videos));
      t(m.home && Math.abs(m.home.firstW - 148) <= 2 && Math.abs(m.home.firstH - 263) <= 2, '§E: el video mide 148×263 a 390px (fila con scroll)', `video=${m.home && m.home.firstW}×${m.home && m.home.firstH}`);
      t(m.home && m.home.scrollW <= 390, '§E: sin desborde horizontal en la home ES a 390px', 'scrollW=' + (m.home && m.home.scrollW));
      t(m.home_en && m.home_en.vp === true && m.home_en.videos === 5, '§E: la home EN muestra la fila de videos 2.5', JSON.stringify(m.home_en));
      t(m.home_en && m.home_en.scrollW <= 390, '§E: sin desborde horizontal en la home EN a 390px', 'scrollW=' + (m.home_en && m.home_en.scrollW));
      t(m.prueba && m.prueba.ocWorkhero === false, '§E: /prueba servida sin la imagen mala (sin .oc-workhero en el DOM)');
      t(m.prueba && m.prueba.chips >= 13, '§E: /prueba servida con las pildoras de rubro', 'chips=' + (m.prueba && m.prueba.chips));
      t(m.prueba && m.prueba.cafeTotal > 0 && m.prueba.after === m.prueba.cafeTotal, '§E: el chip de rubro filtra de verdad en /prueba (cafe)', `antes=${m.prueba && m.prueba.before} cafe=${m.prueba && m.prueba.cafeTotal} despues=${m.prueba && m.prueba.after}`);
      t(m.prueba && m.prueba.allOn === true, '§E: el chip clickeado queda marcado como activo en /prueba');
      t(m.prueba && m.prueba.beforeNav !== m.prueba.afterNav && /-100%/.test(m.prueba.afterNav || ''), '§E: la flecha › avanza el carrusel en /prueba', `antes=${m.prueba && m.prueba.beforeNav} despues=${m.prueba && m.prueba.afterNav}`);
      t(m.prueba && m.prueba.scrollW <= 390, '§E: sin desborde horizontal en /prueba a 390px', 'scrollW=' + (m.prueba && m.prueba.scrollW));
      cleanup();
      resolve();
    });
  });
}

(async () => {
  let boot = null;
  try {
    boot = await startBoot();
    t(boot.up, '§D: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!boot.up) {
      console.log('--- salida del servidor (ultimas 30 lineas) ---');
      console.log(bootOut.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await api('x', 'GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v866',
      '§D: /api/version trae el BUILD v866 (estampado)', JSON.stringify(ver.json));
    const idx = await apiText('/?cb=v866');
    t(idx.status === 200 && idx.text.includes('app.js?v=591') && idx.text.includes('styles.css?v=20261226'),
      '§D: el index servido trae app.js?v=591 + styles.css?v=20261226');
    const appJs = await apiText('/app.js?v=591');
    t(appJs.status === 200 && appJs.text.includes('Un video premium cada semana') && appJs.text.includes('video-premium-unas.mp4'),
      '§D: el app.js servido trae la seccion de videos 2.5 de la home');
    t(appJs.status === 200 && md5(appJs.text) === md5(APP), '§D: el app.js servido es el del arbol (md5 igual)');
    const css = await apiText('/styles.css?v=999');
    t(css.status === 200 && md5(css.text) === md5(CSS), '§D: el styles.css servido es el del arbol (md5 igual, sin tocar)');
    const idxEn = await apiText('/en?cb=v866');
    t(idxEn.status === 200 && idxEn.text.includes('One premium video every week') && idxEn.text.includes('video-premium-unas.mp4'),
      '§D: la home EN servida trae la seccion de videos 2.5');
    const pr = await apiText('/prueba?cb=v866');
    t(pr.status === 200 && !pr.text.includes('class="oc-workhero"') && !pr.text.includes('Así trabaja Posty por vos'),
      '§D: /prueba servida sin la imagen mala (el CSS .oc-* queda muerto, sin uso)');
    t(pr.status === 200 && pr.text.includes("getElementById('ejTrack')") && pr.text.includes("getElementById('ejNext')"),
      '§D: /prueba servida con el fix del carrusel (4 getElementById)');
    const prEn = await apiText('/en/prueba?cb=v866');
    t(prEn.status === 200 && !prEn.text.includes('class="oc-workhero"') && !prEn.text.includes('This is how Posty works for you'),
      '§D: /en/prueba servida sin la imagen mala (el CSS .oc-* queda muerto, sin uso)');
    for (const v of ['video-premium-cafe.mp4', 'video-premium-perfume.mp4', 'video-premium-sneaker.mp4', 'video-premium-pasteleria.mp4', 'video-premium-unas.mp4']) {
      const r = await apiHead('/videos/' + v);
      t(r.status === 200 && /video/.test(r.type), '§D: /videos/' + v + ' sirve 200 video', r.status + ' ' + r.type);
    }
    for (const p of ['poster-cafe.jpg', 'poster-perfume.jpg', 'poster-sneaker.jpg', 'poster-pasteleria.jpg', 'poster-unas.jpg']) {
      const r = await apiHead('/videos/' + p);
      t(r.status === 200 && /image/.test(r.type), '§D: /videos/' + p + ' sirve 200 imagen', r.status + ' ' + r.type);
    }
    const errLines = bootOut.split('\n').filter((l) => /^(Error|TypeError|ReferenceError)|Uncaught/i.test(l.trim()));
    t(errLines.length === 0, '§D: 0 errores en la salida del boot', errLines.slice(0, 3).join(' | '));
    await runRender(`http://127.0.0.1:${PORT}`);
  } catch (e) {
    t(false, '§D: boot', e.message);
  } finally {
    if (boot && boot.child) { try { boot.child.kill('SIGTERM'); } catch (e) {} }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nWEBSITE-V866: ${okN} ok, ${badN} fallos${skipN ? `, ${skipN} saltados` : ''}`);
  process.exit(badN ? 1 : 0);
})();
