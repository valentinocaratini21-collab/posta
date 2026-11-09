// test-lote-chat-mejora.js — LOTE CHAT-MEJORA (v804): 6 fixes.
// 1) Placeholder que se pisa: rotación instantánea, sin fundido, sin
//    avanzar con foco ni con texto (pzPhAdvanceOne / pzPhAdvanceDock).
// 2) Tarjeta del tema colapsa a una línea al responder; «Nada
//    pendiente» también compacto (pzTemaMiniHTML / pzTemaColapsar).
// 3) «¿Algo puntual…?» sale de la tarjeta y Posty lo dice como mensaje
//    del chat; el scroll a abajo corre DESPUÉS del colapso.
// 4) Saludo de Hoy: un solo mensaje (nota pz-hoy-nota suprimida, su
//    contenido fusionado en el cuerpo; rama haySemana sin cambio).
// 5) Álbum sin repetidas: dedupe por miniatura resuelta antes del
//    slice a 4 + cantidad de únicas bajo TU ÁLBUM.
// 6) Borrar foto del álbum: × en cada miniatura de TU ÁLBUM +
//    DELETE /api/album/:id con guard honesto (si está en un posteo,
//    409 y no se borra). Confirmación: tarjeta inline en la tarjeta
//    «Subir» (mock v2), NO window.confirm() (decisión del tablero 8/11).
//    La pantalla completa del álbum (bindAlbumRow)
//    ya tenía su propia × (DELETE /api/assets/:id) y no comparte el
//    render con esta tarjeta: no se toca.
// Rojo-primero: falla en base v803, pasa en el árbol del lote.
// Uso: node test-lote-chat-mejora.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
function sliceFn(src, from, to) {
  const a = src.indexOf(from); if (a === -1) throw new Error('no se encontró: ' + from);
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  if (b === -1) throw new Error('no se encontró fin: ' + to);
  return src.slice(a, b);
}
function sliceOk(src, from, to) {
  try { return sliceFn(src, from, to); } catch (e) { return ''; }
}

const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');

// ---------- Parte 0: pines ----------
console.log('— 0) pines —');
check('0a app.js cambió vs base v803', md5(app) !== 'bc53ff30fa777f87d03b8d83d224939c', md5(app));
check('0b styles.css cambió vs base v803', md5(css) !== '5293bc2a7c2756ae9a37c55f9ee459f7', md5(css));
check('0c server.js cambió vs base v803 SOLO por el DELETE del álbum (BUILD v820 estampado)',
  md5(srv) !== '34104ab6825bb23d3af6b43129496082' && srv.includes("app.delete('/api/album/:id'") && srv.includes("const BUILD_ID = '20261105-v820'"), md5(srv));

// ---------- Parte 1: estática — fix 1 (placeholder) ----------
console.log('— 1) estática: placeholder —');
check('1a guarda de foco en pzPhAdvanceOne (document.activeElement)', app.includes('document.activeElement === el'));
check('1b nunca se agrega la clase pz-ph-fading', cnt(app, "classList.add('pz-ph-fading')") === 0);
check('1c swap instantáneo del placeholder (sin setTimeout en pzPhAdvanceOne)',
  (() => { const f = sliceOk(app, 'function pzPhAdvanceOne', 'function pzPhKnown'); return f.includes('el.placeholder = list[i]') && !f.includes('setTimeout'); })());
check('1d swap instantáneo del dock (sin setTimeout en pzPhAdvanceDock)',
  (() => { const f = sliceOk(app, 'function pzPhAdvanceDock', 'function pzPhTick'); return f.includes('el.textContent = list[i]') && !f.includes('setTimeout'); })());
check('1e la rotación sigue cada 4 s (PZ_PH_T = setInterval 4000)', app.includes('setInterval(pzPhTick, 4000)') || app.includes('PZ_PH_T = setInterval(pzPhTick, 4000)'));

// ---------- Parte 2: estática — fix 2 y 3 (tarjeta + puntual) ----------
console.log('— 2) estática: tarjeta colapsada + puntual —');
check('2a pzTemaMiniHTML y pzTemaColapsar definidas', app.includes('function pzTemaMiniHTML') && app.includes('function pzTemaColapsar'));
check('2b la línea «¿Algo puntual…?» no existe en ninguna tarjeta', cnt(app, 'pz-tema-hint') === 0);
check('2c estado !tema usa la tira compacta (sin botones fin-hoy/fin-nivel)',
  app.includes('pzTemaMiniHTML(pzTemaT(\'Nada pendiente') && !app.includes("id: 'fin-hoy'") && !app.includes("id: 'fin-nivel'"));
check('2d al guardar el lunes colapsa + Posty pregunta lo puntual',
  app.includes('pzTemaColapsar(pzTemaT(\'La pregunta de los lunes\'') && app.includes("chatSay(pzTemaT('¿Algo puntual sobre este tema? Escribímelo acá abajo.'"));
check('2e el scroll corre DESPUÉS del colapso (chatScroll(true) en pzTemaColapsar)',
  (() => { const f = sliceOk(app, 'function pzTemaColapsar', 'function pzTemaPintar'); return f.includes('wrap.innerHTML = pzTemaMiniHTML') && f.indexOf('chatScroll(true)') > f.indexOf('wrap.innerHTML'); })());
check('2f CSS: tira .pz-tema-mini + check .pz-tema-ok (vidrio, radio 14px)',
  css.includes('.pz-tema-mini{') && css.includes('border-radius:14px') && css.includes('.pz-tema-ok{'));

// ---------- Parte 2b: estática — fix 5 (álbum sin repetidas) ----------
console.log('— 2b) estática: álbum —');
check('2g dedupe del álbum por miniatura resuelta ANTES del slice',
  app.includes('const unicas = (Array.isArray(album)') && app.includes('a.thumb || a.thumb_path || a.path') && app.includes('unicas.slice(0, 4)'));
check('2h cantidad de únicas bajo TU ÁLBUM (ES/EN, singular/plural)',
  app.includes("(en ? '1 photo' : '1 foto')") && app.includes("(en ? unicas.length + ' photos' : unicas.length + ' fotos')") && app.includes('<small>${esc(cuenta)}</small>'));
check('2i CSS: la cantidad va debajo de la etiqueta (.pz-hoy-album-label small)',
  css.includes('.pz-hoy-album-label small{'));

// ---------- Parte 2c: estática — fix 6 (borrar foto del álbum) ----------
console.log('— 2c) estática: borrar foto del álbum —');
check('2j DELETE /api/album/:id con requireAuth + propiedad (sftAssetPropio)',
  srv.includes("app.delete('/api/album/:id', requireAuth") && srv.includes('sftAssetPropio(uid, req.params.id)'));
check('2k guard honesto: si está en un posteo (draft/scheduled/published, por foto_asset_id/image_path/carousel_paths) → 409 sin borrar',
  srv.includes("status IN ('draft','scheduled','published')") && srv.includes('foto_asset_id IN (SELECT id FROM assets WHERE user_id = ? AND file_path = ?)') && srv.includes('image_path = ?') && srv.includes('carousel_paths LIKE ?')
  && srv.includes("res.status(409).json({ ok: false, error: 'Esa foto ya está en un posteo' })"));
check('2l si solo está en el álbum: borra la FOTO (todas las filas con ese file_path, por si está duplicada) y los archivos (foto + miniaturas)',
  srv.includes("db.prepare('DELETE FROM assets WHERE user_id = ? AND file_path = ?').run(uid, asset.file_path)") && srv.includes('fs.unlinkSync(path.join(MEDIA_DIR, path.basename(f)))'));
check('2m × en cada miniatura de TU ÁLBUM (hermana del botón, no anidada; solo con id)',
  app.includes('class="pz-hoy-album-thumb-wrap"') && app.includes('class="pz-hoy-album-del"') && app.includes('data-album-del="${a.id}"') && app.includes('Number(a.id) > 0'));
check('2n tarjeta inline en pzHoyAlbumBorrar (texto del mock ES/EN, [Borrar]/[Cancelar]); cero window.confirm() en el flujo (los otros 2 borrados intactos)',
  app.includes('async function pzHoyAlbumBorrar') && app.includes('function pzHoyAlbumCuenta')
  && app.includes("className = 'pz-hoy-album-confirm'") && app.includes('pz-hoy-album-confirm-del') && app.includes('pz-hoy-album-confirm-no')
  && app.includes('¿Borrar esta foto del álbum?') && app.includes('Posty no la va a usar más.') && app.includes('Delete this photo from the album?') && app.includes("Posty won't use it anymore.")
  && app.includes("await api.delete('/api/album/' + encodeURIComponent(id))")
  && (() => { const f = sliceOk(app, 'async function pzHoyAlbumBorrar', 'function pzHoySemanaHTML'); return !f.includes('window.confirm('); })()
  && cnt(app, 'window.confirm(') === 2);
check('2o al salir bien saca la miniatura y actualiza la cantidad; si rechaza, muestra el mensaje y la foto sigue',
  app.includes('wrap.remove()') && app.includes('pzHoyAlbumCuenta(row)') && app.includes("toast('No se pudo borrar: ' + esc((e && e.message)"));
check('2p pzHoyBind cablea la × con stopPropagation (no abre la subida)',
  app.includes("root.querySelectorAll('[data-album-del]')") && app.includes('ev.stopPropagation'));
check('2q CSS: envoltorio relativo + × circular superpuesta en la esquina + tarjeta inline (borde dorado, [Borrar] rojo, [Cancelar])',
  css.includes('.pz-hoy-album-thumb-wrap{position:relative;flex:none}') && css.includes('.pz-hoy-album-del{position:absolute;top:-7px;right:-7px')
  && css.includes('.pz-hoy-album-confirm{') && css.includes('border:1.5px solid #F5C344') && css.includes('.pz-hoy-album-confirm-del{background:#D64545') && css.includes('.pz-hoy-album-confirm-no{background:#EEF3F7'));

// ---------- Parte 3: estática — fix 4 (saludo Hoy) ----------
console.log('— 3) estática: saludo de Hoy —');
check('3a la nota pz-hoy-nota no se renderiza', cnt(app, 'pz-hoy-nota') === 0);
check('3b cuerpo hoyPost HONESTO ES (singular: solo el posteo de hoy)',
  app.includes('Te armé el posteo de hoy.') && app.includes('miralo y dale «Dale» si te gusta. Sin tu OK, no sale nada.'));
check('3c cuerpo hoyPost HONESTO EN (singular)', app.includes("I put together today's post for you.") && app.includes('give it a «Publish it» if you like it. Without your OK, nothing goes out.'));
check('3d sin el texto viejo duplicado (fuera de comentarios)',
  !app.includes('¿Lo largamos?') && !app.includes('¿Los miramos?') && !app.includes('Your posts are ready!')
  && !sliceOk(app, 'function pzHoySpeechHTML', 'function pzHoyUploadHTML').includes('¡Ya te dejé los posteos listos!')
  && !app.includes('Te armé los posteos de esta semana') && !app.includes("I put together this week's posts"));
check('3e rama haySemana SIN cambio', app.includes('Tu semana ya está aprobada. Posty se ocupa de publicarla.'));
check('3f rama pendientes: número real (N=1 singular, N>1 plural, ES + EN)',
  app.includes('Tenés 1 posteo para revisar') && app.includes('Tenés ${pendientes} posteos para revisar')
  && app.includes("You've got 1 post to review") && app.includes("You've got ${pendientes} posts to review"));

// ---------- Parte 4: VM — fix 1 (placeholder) ----------
console.log('— 4) VM: placeholder —');
function escFn(src) {
  const m = src.match(/^const esc = \(s\) => [^\n]*\n/m);
  if (!m) throw new Error('no se encontró esc global');
  return m[0];
}
class PhEl {
  constructor() {
    this.dataset = {}; this.value = ''; this.placeholder = ''; this.textContent = '';
    this.classAdds = []; this.classRemoves = [];
    this.classList = { add: (c) => { this.classAdds.push(c); }, remove: (c) => { this.classRemoves.push(c); }, toggle: () => {}, contains: () => false };
  }
}
let PH = null;
try {
  PH = sliceFn(app, 'const PZ_CHAT_PH = {', 'function pzPhInstallObs() {');
} catch (e) { check('4x sección placeholder presente', false, e.message); }
if (PH) {
  const docStub = { activeElement: null, querySelectorAll: () => [] };
  const sb = { console, setTimeout, clearTimeout, ME: { lang: 'es' }, document: docStub };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(PH + '\nthis.__ph = { pzPhAdvanceOne, pzPhAdvanceDock, pzChatPhList };', sb);
  const R = sb.__ph;
  const list = R.pzChatPhList();
  const el = new PhEl();
  const ok1 = R.pzPhAdvanceOne(el, list);
  check('4a avanza instantáneo: placeholder cambia en la misma llamada', ok1 === true && el.placeholder === list[1], el.placeholder);
  check('4b sin fundido: nunca se agrega pz-ph-fading', el.classAdds.length === 0, JSON.stringify(el.classAdds));
  const phAntes = el.placeholder;
  docStub.activeElement = el;
  const okFoco = R.pzPhAdvanceOne(el, list);
  check('4c con foco no avanza (la frase queda fija)', okFoco === false && el.placeholder === phAntes);
  docStub.activeElement = null;
  el.value = 'escribiendo…';
  const okVal = R.pzPhAdvanceOne(el, list);
  check('4d con texto no avanza (nunca pisa lo escrito)', okVal === false && el.placeholder === phAntes);
  el.value = '';
  const el2 = new PhEl();
  for (let k = 0; k < 9; k++) R.pzPhAdvanceOne(el2, list);
  check('4e rota por las 9 frases y vuelve a la primera', el2.placeholder === list[0], el2.placeholder);
  const dock = new PhEl();
  const okD = R.pzPhAdvanceDock(dock, list);
  check('4f dock: texto cambia instantáneo, sin fundido', okD === true && dock.textContent === list[1] && dock.classAdds.length === 0, dock.textContent);
}

// ---------- Parte 5: VM — fix 2 y 3 (tarjeta) ----------
console.log('— 5) VM: tarjeta colapsada —');
class FakeEl {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this.style = {};
    this._html = ''; this.value = ''; this.textContent = '';
    this.disabled = false; this.files = []; this.maxLength = 2000;
    this.placeholder = ''; this.title = ''; this.className = '';
    this.onclick = null; this.onchange = null; this.id = '';
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  set outerHTML(v) { this._html = String(v); }
  get outerHTML() { return this._html; }
  appendChild(c) { this.children.push(c); return c; }
  insertBefore(c) { this.children.unshift(c); return c; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  setAttribute() {}
  focus() {}
}
function makeDoc() {
  const reg = {};
  const input = new FakeEl('input'); input.id = 'chatInput';
  const box = new FakeEl('div'); box.id = 'chatBox';
  const wrap = new FakeEl('div'); wrap.id = 'pzTemaWrap';
  const row = new FakeEl('div'); row.className = 'chat-input-row';
  const mic = new FakeEl('button'); mic.id = 'chatMicSend';
  const file = new FakeEl('input'); file.id = 'chatFile';
  const card = new FakeEl('div'); card.id = 'chatCard';
  reg.chatInput = input; reg.chatBox = box; reg.pzTemaWrap = wrap; reg.chatMicSend = mic; reg.chatFile = file; reg.chatCard = card;
  const doc = {
    _reg: reg, _row: row, _created: [],
    getElementById: (id) => reg[id] || null,
    querySelector: (sel) => {
      const s = String(sel);
      if (s.includes('chat-input-row')) return row;
      if (s === '#chatBox') return box;
      if (s === '#chatMicSend') return mic;
      if (s === '#chatInput') return input;
      if (s === '#chatFile') return file;
      if (s === '#chatCard') return card;
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => {
      const el = new FakeEl(tag);
      doc._created.push(el);
      Object.defineProperty(el, 'id', {
        get() { return this._id || ''; },
        set(v) { this._id = String(v); if (v) reg[v] = el; },
        configurable: true,
      });
      return el;
    },
    addEventListener: () => {},
  };
  return { doc, input, box, wrap, row, mic, file, reg };
}
let vmAsync = Promise.resolve();
let R6OK = false;
let R6SRC = '';
try { R6SRC = sliceFn(app, '/* ===== LOTE REDISENO-R6', '/* ===== (LOTE CHAT-INICIO-DESLIZAR'); R6OK = true; }
catch (e) { check('5x sección R6 presente', false, e.message); }
if (R6OK) {
  const { doc, input, box, wrap } = makeDoc();
  const apiCalls = [];
  const said = [];
  const scrollCalls = [];
  let apiOk = true;
  const sandbox = {
    console, setTimeout, clearTimeout,
    document: doc,
    window: {},
    localStorage: { getItem: () => '', setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hash: '' },
    ME: { lang: 'es' },
    CHAT: [], CHAT_PHOTOS: [], ASSETS: [],
    HF_CHAT_ANCHOR: null,
    VOICE_STATE: 'idle',
    api: {
      get: async (u) => { apiCalls.push(['GET', u]); return {}; },
      post: async (u, b) => { apiCalls.push(['POST', u, b]); return apiOk ? { ok: true } : { ok: false, error: 'x' }; },
      patch: async (u, b) => { apiCalls.push(['PATCH', u, b]); return { ok: true }; },
    },
    pzIc: (n) => '[' + n + ']',
    chatSay: (t) => { said.push(t); },
    chatScroll: (f) => { scrollCalls.push(f); },
    chatUpdateSendBtn: () => {},
    f3ApprovalMode: async () => ({ manual: true, known: true }),
    assetPhotos: () => [],
    pcTz: () => 'America/New_York',
    vozEn: () => false,
    $: (s) => doc.querySelector(s),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(escFn(app) + '\n' + R6SRC + '\nthis.__cm = { pzTemaPintar, pzTemaElegir, pzTemaGuardarLunes, pzTemaOnSend, pzTemaColapsar: (typeof pzTemaColapsar !== "undefined" ? pzTemaColapsar : undefined), pzTemaMiniHTML: (typeof pzTemaMiniHTML !== "undefined" ? pzTemaMiniHTML : undefined) };', sandbox);
  const R = sandbox.__cm;
  sandbox.PZ_TEMA = { temas: [{ kind: 'lunes', week_key: '2026-11-02' }], idx: 0, stage: 'topic', cambio: null };
  R.pzTemaPintar();
  check('5a pinta lunes: título + 4 rangos, SIN la línea puntual',
    wrap.innerHTML.includes('La pregunta de los lunes') && wrap.innerHTML.includes("data-tema-op=\"lunes-0\"")
    && wrap.innerHTML.includes("data-tema-op=\"lunes-15+\"") && !wrap.innerHTML.includes('pz-tema-hint'), wrap.innerHTML.slice(0, 200));
  sandbox.PZ_TEMA = { temas: [{ kind: 'hoy', post: { id: 7, scheduled_at: '2026-11-08T19:30:00-05:00', imagen: 'x.jpg' }, hora: '19:30' }], idx: 0, stage: 'topic', cambio: null };
  R.pzTemaPintar();
  check('5b pinta hoy: SIN la línea puntual', wrap.innerHTML.includes('El posteo de hoy') && !wrap.innerHTML.includes('pz-tema-hint'));
  sandbox.PZ_TEMA = { temas: [{ kind: 'comentario', c: { id: 9, username: 'ana', text: 'hola', suggested: 'gracias' } }], idx: 0, stage: 'topic', cambio: null };
  R.pzTemaPintar();
  check('5c pinta comentario: SIN la línea puntual', wrap.innerHTML.includes('Responder un comentario') && !wrap.innerHTML.includes('pz-tema-hint'));
  sandbox.PZ_TEMA = { temas: [], idx: 0, stage: 'topic', cambio: null };
  R.pzTemaPintar();
  check('5d pinta fin: Nada pendiente compacto (una línea, sin botones)',
    wrap.innerHTML.includes('Nada pendiente') && wrap.innerHTML.includes('pz-tema-mini') && !wrap.innerHTML.includes('data-tema-op='), wrap.innerHTML.slice(0, 200));
  scrollCalls.length = 0;
  if (typeof R.pzTemaColapsar !== 'function') {
    check('5e colapsar: tira de una línea con el título y el estado', false, 'pzTemaColapsar ausente');
    check('5f colapsar: el scroll a abajo corre DESPUÉS (chatScroll(true))', false, 'pzTemaColapsar ausente');
  } else {
    R.pzTemaColapsar('La pregunta de los lunes', 'Anotado en Análisis');
    check('5e colapsar: tira de una línea con el título y el estado',
      wrap.innerHTML.includes('pz-tema-mini') && wrap.innerHTML.includes('La pregunta de los lunes') && wrap.innerHTML.includes('Anotado en Análisis'));
    check('5f colapsar: el scroll a abajo corre DESPUÉS (chatScroll(true))', scrollCalls.includes(true), JSON.stringify(scrollCalls));
  }
  vmAsync = (async () => {
    // Guardar lunes con éxito: colapsa + Posty pregunta lo puntual.
    sandbox.PZ_TEMA = { temas: [{ kind: 'lunes', week_key: '2026-11-02' }], idx: 0, stage: 'topic', cambio: null };
    apiCalls.length = 0; said.length = 0; scrollCalls.length = 0; apiOk = true;
    R.pzTemaPintar();
    vm.runInContext('this.__guardar = pzTemaGuardarLunes;', sandbox);
    await sandbox.__guardar('6-15', '6 a 15');
    await sleep(120);
    check('5g guardar lunes: POST /api/weekly-consultas 6-15', apiCalls.some((c) => c[0] === 'POST' && c[1] === '/api/weekly-consultas' && c[2] && c[2].rango === '6-15'), JSON.stringify(apiCalls));
    check('5h guardar lunes: la tarjeta colapsa a la tira', wrap.innerHTML.includes('pz-tema-mini') && wrap.innerHTML.includes('Anotado en Análisis'), wrap.innerHTML.slice(0, 200));
    check('5i guardar lunes: Posty dice lo puntual como mensaje del chat', said.some((t) => String(t).includes('¿Algo puntual sobre este tema?')), JSON.stringify(said));
    check('5j guardar lunes: el scroll forzado corre tras el colapso', scrollCalls.includes(true));
    await sleep(500);
    check('5k tras avanzar: estado final compacto (Nada pendiente, una línea)',
      wrap.innerHTML.includes('Nada pendiente') && wrap.innerHTML.includes('pz-tema-mini') && !wrap.innerHTML.includes('data-tema-op='), wrap.innerHTML.slice(0, 200));
    // Guardar lunes con fallo: NO colapsa, error honesto.
    sandbox.PZ_TEMA = { temas: [{ kind: 'lunes', week_key: '2026-11-02' }], idx: 0, stage: 'topic', cambio: null };
    apiCalls.length = 0; said.length = 0; apiOk = false;
    R.pzTemaPintar();
    await sandbox.__guardar('6-15', '6 a 15');
    await sleep(60);
    check('5l guardar lunes con fallo: NO colapsa (la tarjeta grande sigue)', wrap.innerHTML.includes('La pregunta de los lunes') && !wrap.innerHTML.includes('pz-tema-mini'));
    check('5m guardar lunes con fallo: error honesto en el chat', said.some((t) => String(t).includes('no pude guardarlo')), JSON.stringify(said));
  })();
}

// ---------- Parte 6: VM — fix 4 (saludo Hoy) ----------
console.log('— 6) VM: saludo de Hoy —');
let SP = '';
try {
  SP = sliceFn(app, 'function pzHoySaludoTxt', 'function pzHoyDiaKey')
    + '\n' + sliceFn(app, 'function pzHoyHoraCorta', 'function pzHoyCuandoCorto')
    + '\n' + sliceFn(app, 'function pzHoySpeechHTML', 'function pzHoyUploadHTML');
} catch (e) { check('6x funciones del saludo presentes', false, e.message); }
if (SP) {
  const sb = { console, Date, Intl, Math, JSON };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(escFn(app) + '\n' + SP + '\nthis.__sp = pzHoySpeechHTML;', sb);
  const speech = sb.__sp;
  const HOY_POST = { id: 610, status: 'scheduled', media_type: 'image', image_path: '/m/610.jpg', caption: 'El posteo de hoy', scheduled_at: '2026-11-09T00:30:00.000Z', pinned: 0, approval: 'pending' };
  const s1 = speech({ hoyPost: HOY_POST, pendientes: 3, en: false, tz: 'America/New_York' });
  check('6a hoyPost: UN solo mensaje, HONESTO en singular (el posteo de hoy, no la semana)',
    s1.includes('Te armé el posteo de hoy.') && s1.includes('El de hoy sale a las 19:30') && s1.includes('miralo y dale «Dale» si te gusta') && s1.includes('Sin tu OK, no sale nada') && s1.includes('data-pz-hoy-chat')
    && !s1.includes('pz-hoy-nota') && !s1.includes('¿Lo largamos?') && !s1.includes('¡Ya te dejé los posteos listos!') && !s1.includes('posteos de esta semana'), s1.slice(0, 300));
  const s1en = speech({ hoyPost: HOY_POST, pendientes: 3, en: true, tz: 'America/New_York' });
  check('6b hoyPost EN: mismo mensaje en singular',
    s1en.includes("I put together today's post for you.") && s1en.includes('goes out at') && s1en.includes('give it a «Publish it» if you like it') && s1en.includes('Without your OK, nothing goes out') && s1en.includes('Publish it')
    && !s1en.includes('pz-hoy-nota') && !s1en.includes('Shall we launch it?') && !s1en.includes("this week's posts"), s1en.slice(0, 300));
  const s2 = speech({ hoyPost: null, pendientes: 2, en: false, tz: 'America/New_York' });
  check('6c pendientes=2 sin hoyPost: número real «Tenés 2 posteos para revisar»',
    s2.includes('Tenés 2 posteos para revisar') && s2.includes('miralos y dale «Dale» a los que te gusten') && s2.includes('Sin tu OK, no sale nada') && !s2.includes('¿Los miramos?') && !s2.includes('pz-hoy-nota') && !s2.includes('posteos de esta semana'), s2.slice(0, 300));
  const s2b = speech({ hoyPost: null, pendientes: 1, en: false, tz: 'America/New_York' });
  check('6c2 pendientes=1 ES: singular «Tenés 1 posteo para revisar»',
    s2b.includes('Tenés 1 posteo para revisar') && s2b.includes('miralo y dale «Dale» si te gusta') && !s2b.includes('2 posteos') && !s2b.includes('pz-hoy-nota'), s2b.slice(0, 300));
  const s2en = speech({ hoyPost: null, pendientes: 2, en: true, tz: 'America/New_York' });
  check('6c3 pendientes=2 EN: «You\'ve got 2 posts to review»',
    s2en.includes("You've got 2 posts to review") && s2en.includes('give a «Publish it» to the ones you like') && s2en.includes('Without your OK, nothing goes out') && !s2en.includes("this week's posts"), s2en.slice(0, 300));
  const s2ben = speech({ hoyPost: null, pendientes: 1, en: true, tz: 'America/New_York' });
  check('6c4 pendientes=1 EN: singular «You\'ve got 1 post to review»',
    s2ben.includes("You've got 1 post to review") && s2ben.includes('give it a «Publish it» if you like it') && !s2ben.includes('2 posts'), s2ben.slice(0, 300));
  const s3 = speech({ hoyPost: null, pendientes: 0, haySemana: true, en: false, tz: 'America/New_York' });
  check('6d haySemana SIN cambio (sin instrucción Dale, sin nota)',
    s3.includes('Tu semana ya está aprobada') && !s3.includes('Sin tu OK') && !s3.includes('pz-hoy-nota'), s3.slice(0, 300));
  const s4 = speech({ hoyPost: null, pendientes: 0, en: false, tz: 'America/New_York' });
  check('6e sin nada: rama «¿Armamos tu semana?» intacta', s4.includes('¿Armamos tu semana?') && !s4.includes('pz-hoy-nota'));
}

// ---------- Parte 6b: VM — fix 5 (álbum sin repetidas) ----------
console.log('— 6b) VM: álbum —');
let UP = '';
try { UP = sliceFn(app, 'function pzHoyUploadHTML', 'function pzHoySemanaHTML'); }
catch (e) { check('6bx pzHoyUploadHTML presente', false, e.message); }
if (UP) {
  const sb = { console, esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), pzIc: () => '' };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(UP + '\nthis.__up = pzHoyUploadHTML;', sb);
  const up = sb.__up;
  const dup = [{ id: 1, path: '/m/a.jpg' }, { id: 2, path: '/m/b.jpg' }, { id: 3, path: '/m/a.jpg' }, { id: 4, path: '/m/b.jpg' }];
  const hDup = up(dup, false);
  check('6f álbum duplicado: cada foto UNA sola vez (2 thumbs, no 4)',
    cnt(hDup, 'class="pz-hoy-album-thumb"') === 2 && cnt(hDup, '/m/a.jpg') === 1 && cnt(hDup, '/m/b.jpg') === 1, hDup.slice(0, 300));
  check('6g álbum duplicado: cantidad correcta «2 fotos»', hDup.includes('2 fotos'));
  const hDupEn = up(dup, true);
  check('6h álbum duplicado EN: «2 photos»', hDupEn.includes('2 photos'));
  const hVacio = up([], false);
  check('6i álbum vacío: solo el «+» (sin thumbs, sin cantidad, como hoy)',
    cnt(hVacio, 'class="pz-hoy-album-thumb"') === 0 && !hVacio.includes('fotos') && hVacio.includes('TU ÁLBUM'));
  const cinco = [1, 2, 3, 4, 5].map((n) => ({ id: n, path: '/m/f' + n + '.jpg' }));
  const h5 = up(cinco, false);
  check('6j 5 únicas: 4 distintas en la fila + «5 fotos»',
    cnt(h5, 'class="pz-hoy-album-thumb"') === 4 && h5.includes('5 fotos'));
  const vid = [{ id: 1, kind: 'video', path: '/v/1.mp4', thumb_path: '/t/1.jpg' }, { id: 2, kind: 'video', path: '/v/1.mp4', thumb_path: '/t/1.jpg' }];
  const hVid = up(vid, false);
  check('6k video repetido: se dedupe por su miniatura (1 thumb, «1 foto»)',
    cnt(hVid, 'class="pz-hoy-album-thumb"') === 1 && cnt(hVid, '/t/1.jpg') === 1 && hVid.includes('1 foto'));
  const conId = up([{ id: 11, path: '/m/c.jpg' }, { id: 12, path: '/m/d.jpg' }], false);
  check('6l miniaturas con id: × con data-album-del y envoltorio (una por foto)',
    cnt(conId, 'pz-hoy-album-del') === 2 && conId.includes('data-album-del="11"') && conId.includes('data-album-del="12"') && cnt(conId, 'pz-hoy-album-thumb-wrap') === 2, conId.slice(0, 300));
  const sinId = up([{ path: '/m/e.jpg' }], false);
  check('6m sin id: no hay × (nunca data-album-del="undefined")',
    cnt(sinId, 'pz-hoy-album-del') === 0 && !sinId.includes('undefined'), sinId.slice(0, 300));
}

// ---------- Parte 6c: VM — fix 6 (borrar foto del álbum) ----------
console.log('— 6c) VM: borrar foto del álbum —');
let BORRAR = '';
try { BORRAR = sliceFn(app, 'async function pzHoyAlbumBorrar', 'function pzHoySemanaHTML'); }
catch (e) { check('6cx funciones de borrar presentes', false, e.message); }
if (BORRAR) {
  function makeBorrarSandbox() {
    let thumbsLeft = 2;
    const wrapRemoved = { v: false };
    const wrap = { remove() { wrapRemoved.v = true; thumbsLeft = Math.max(0, thumbsLeft - 1); } };
    const small = { textContent: '2 fotos', removed: false, remove() { this.removed = true; } };
    const inserted = { el: null };
    const delBtn = { disabled: false, onclick: null };
    const noBtn = { disabled: false, onclick: null };
    const elStub = {
      className: '', innerHTML: '', removed: false,
      querySelector: (sel) => (sel === '.pz-hoy-album-confirm-del' ? delBtn : (sel === '.pz-hoy-album-confirm-no' ? noBtn : null)),
      remove() { this.removed = true; },
    };
    const row = {
      querySelectorAll: (sel) => (sel === '.pz-hoy-album-thumb' ? Array.from({ length: thumbsLeft }, () => ({})) : []),
      querySelector: (sel) => (sel === '.pz-hoy-album-label small' ? small : null),
      after: (el) => { inserted.el = el; },
    };
    const card = { querySelector: () => null };
    const btn = {
      disabled: false,
      getAttribute: (k) => (k === 'data-album-del' ? '7' : null),
      closest: (sel) => (sel === '.pz-hoy-album-thumb-wrap' ? wrap : (sel === '.pz-hoy-album-row' ? row : (sel === '.pz-hoy-upload' ? card : null))),
    };
    const apiCalls = [];
    const toasts = [];
    const sb = {
      console, setTimeout, clearTimeout,
      ME: { lang: 'es' },
      toast: (t) => { toasts.push(t); },
      api: { delete: async (u) => { apiCalls.push(u); return { ok: true }; } },
      document: { createElement: () => elStub },
      window: {},
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(escFn(app) + '\n' + BORRAR + '\nthis.__borrar = { pzHoyAlbumBorrar, pzHoyAlbumCuenta };', sb);
    return { sb, btn, wrap, wrapRemoved, small, row, apiCalls, toasts, inserted, elStub, delBtn, noBtn, setThumbs: (n) => { thumbsLeft = n; } };
  }
  vmAsync = vmAsync.then(async () => {
    const t1 = makeBorrarSandbox();
    await t1.sb.__borrar.pzHoyAlbumBorrar(t1.btn);
    const cardOk = t1.inserted.el === t1.elStub && t1.elStub.className === 'pz-hoy-album-confirm'
      && t1.elStub.innerHTML.includes('¿Borrar esta foto del álbum?') && t1.elStub.innerHTML.includes('Posty no la va a usar más.')
      && t1.elStub.innerHTML.includes('Borrar') && t1.elStub.innerHTML.includes('Cancelar')
      && typeof t1.delBtn.onclick === 'function' && typeof t1.noBtn.onclick === 'function'
      && t1.apiCalls.length === 0;
    await t1.delBtn.onclick();
    check('6n × abre la tarjeta inline (texto del mock, [Borrar]/[Cancelar]) y [Borrar] borra: DELETE /api/album/7, miniatura fuera, cantidad «1 foto», tarjeta quitada',
      cardOk && t1.apiCalls.includes('/api/album/7') && t1.wrapRemoved.v === true && t1.small.textContent === '1 foto' && t1.elStub.removed === true,
      JSON.stringify(t1.apiCalls) + ' ' + t1.small.textContent);
    const t2 = makeBorrarSandbox();
    await t2.sb.__borrar.pzHoyAlbumBorrar(t2.btn);
    await t2.noBtn.onclick();
    check('6o [Cancelar] cierra la tarjeta: no llama a DELETE y la foto sigue', t2.apiCalls.length === 0 && t2.wrapRemoved.v === false && t2.elStub.removed === true);
    const t3 = makeBorrarSandbox();
    t3.sb.api.delete = async (u) => { t3.apiCalls.push(u); const e = new Error('Esa foto ya está en un posteo'); e.status = 409; throw e; };
    await t3.sb.__borrar.pzHoyAlbumBorrar(t3.btn);
    await t3.delBtn.onclick();
    check('6p foto en posteo: rechazo honesto, la foto sigue, botones reactivados, la tarjeta sigue para cancelar/reintentar',
      t3.wrapRemoved.v === false && t3.delBtn.disabled === false && t3.noBtn.disabled === false && t3.elStub.removed === false && t3.toasts.some((x) => String(x).includes('Esa foto ya está en un posteo')), JSON.stringify(t3.toasts));
    const t4 = makeBorrarSandbox();
    t4.setThumbs(0);
    t4.sb.__borrar.pzHoyAlbumCuenta(t4.row);
    check('6q cuenta 0: el «N fotos» desaparece', t4.small.removed === true);
    const t5 = makeBorrarSandbox();
    t5.setThumbs(1);
    t5.sb.__borrar.pzHoyAlbumCuenta(t5.row);
    check('6r cuenta 1: «1 foto» (singular)', t5.small.textContent === '1 foto', t5.small.textContent);
    const t6 = makeBorrarSandbox();
    t6.setThumbs(3);
    t6.sb.__borrar.pzHoyAlbumCuenta(t6.row);
    check('6s cuenta 3: «3 fotos»', t6.small.textContent === '3 fotos', t6.small.textContent);
  });
}

// ---------- Parte 7: boot real ----------
console.log('— 7) boot real —');
const PORT = 34572;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-mejora-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const TEST_KEY = 'boot-test-key-cm';

async function reqJson(method, p, body, cookie, contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body === undefined ? undefined : (contentType ? body : JSON.stringify(body)) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}

async function parteBoot() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    check('7a el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('7b /api/version = v820 (estampado)', ver && ver.build === '20261105-v820', JSON.stringify(ver));
    const appJs = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=555`)).text();
    check('7c el app.js servido trae el lote (colapsar + sin fundido + tarjeta inline del borrar)',
      appJs.includes('function pzTemaColapsar') && appJs.includes('function pzTemaMiniHTML') && !appJs.includes("classList.add('pz-ph-fading')")
      && appJs.includes('pz-hoy-album-confirm') && appJs.includes('pz-hoy-album-confirm-del'), 'len ' + appJs.length);
    const cssTxt = await (await fetch(`http://127.0.0.1:${PORT}/styles.css?v=20261204`)).text();
    check('7d el styles.css servido trae la tira colapsada', cssTxt.includes('.pz-tema-mini{') && cssTxt.includes('.pz-tema-ok{'), 'len ' + cssTxt.length);
    check('7e el styles.css servido trae la cantidad del álbum + la tarjeta inline', cssTxt.includes('.pz-hoy-album-label small{') && cssTxt.includes('.pz-hoy-album-confirm{'), 'len ' + cssTxt.length);
    check('7f el app.js servido trae el dedupe del álbum', appJs.includes('unicas.slice(0, 4)') && appJs.includes("a.thumb || a.thumb_path || a.path"), 'len ' + appJs.length);
    // Fix 6: DELETE /api/album/:id contra el servidor real.
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'cm-test', device: 'test-device-cm' });
    check('7g join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    const uid = join.json.user_id;
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    try { db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid); } catch (e) {}
    const insA = db.prepare("INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?, 'photo', '')").run(uid, '/media/cm-test-a.jpg');
    const idA = Number(insA.lastInsertRowid);
    // La foto A, duplicada (como llega del álbum real): borrarla tiene
    // que sacar TODAS sus filas, no solo la clickeada.
    const insA2 = db.prepare("INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?, 'photo', '')").run(uid, '/media/cm-test-a.jpg');
    const idA2 = Number(insA2.lastInsertRowid);
    const insB = db.prepare("INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?, 'photo', '')").run(uid, '/media/cm-test-b.jpg');
    const idB = Number(insB.lastInsertRowid);
    const postCols = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
    const pFields = ['user_id', 'image_path', 'caption', 'status', 'scheduled_at'];
    const pVals = [uid, '/media/cm-test-b.jpg', 'Posteo con la foto B', 'scheduled', new Date().toISOString().slice(0, 10) + 'T19:30:00-05:00'];
    if (postCols.includes('foto_asset_id')) { pFields.push('foto_asset_id'); pVals.push(idB); }
    if (postCols.includes('approval')) { pFields.push('approval'); pVals.push('pending'); }
    if (postCols.includes('media_type')) { pFields.push('media_type'); pVals.push('image'); }
    if (postCols.includes('tipo')) { pFields.push('tipo'); pVals.push(''); }
    db.prepare(`INSERT INTO posts (${pFields.join(',')}) VALUES (${pFields.map(() => '?').join(',')})`).run(...pVals);
    check('7h fotos A y B sembradas en el álbum', idA > 0 && idB > 0, `A=${idA} B=${idB}`);
    const delNoAuth = await reqJson('DELETE', '/api/album/' + idA);
    check('7i DELETE sin sesión → 401', delNoAuth.status === 401, String(delNoAuth.status));
    const delA = await reqJson('DELETE', '/api/album/' + idA, undefined, cookie);
    check('7j DELETE foto solo del álbum → ok', delA.status === 200 && delA.json && delA.json.ok === true, JSON.stringify(delA.json));
    const alb1 = await reqJson('GET', '/api/album', undefined, cookie);
    check('7k tras borrar: la foto A ya no está en GET /api/album (ni la duplicada)',
      alb1.status === 200 && Array.isArray(alb1.json.photos) && !alb1.json.photos.some((p) => p.path === '/media/cm-test-a.jpg'),
      JSON.stringify((alb1.json && alb1.json.photos || []).map((p) => p.path)));
    const rowA = db.prepare('SELECT id FROM assets WHERE id = ?').get(idA);
    const nA = db.prepare('SELECT COUNT(*) AS c FROM assets WHERE user_id = ? AND file_path = ?').get(uid, '/media/cm-test-a.jpg').c;
    check('7l tras borrar: la fila A ya no está en la DB y no queda ninguna duplicada', !rowA && nA === 0, `nA=${nA}`);
    const delB = await reqJson('DELETE', '/api/album/' + idB, undefined, cookie);
    check('7m DELETE foto en posteo programado → 409 honesto',
      delB.status === 409 && delB.json && String(delB.json.error || '').includes('ya está en un posteo'), JSON.stringify(delB.json));
    const rowB = db.prepare('SELECT id FROM assets WHERE id = ?').get(idB);
    const alb2 = await reqJson('GET', '/api/album', undefined, cookie);
    check('7n tras el 409: la foto B sigue en la DB y en GET /api/album',
      !!rowB && Array.isArray(alb2.json.photos) && alb2.json.photos.some((p) => Number(p.id) === idB),
      JSON.stringify((alb2.json && alb2.json.photos || []).map((p) => p.id)));
    const join2 = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'cm-test-2', device: 'test-device-cm-2' });
    const uid2 = join2.json && join2.json.user_id;
    const insC = db.prepare("INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?, 'photo', '')").run(uid2, '/media/cm-test-c.jpg');
    const idC = Number(insC.lastInsertRowid);
    const delC = await reqJson('DELETE', '/api/album/' + idC, undefined, cookie);
    check('7o DELETE foto de otro usuario → 404', delC.status === 404, JSON.stringify(delC.json));
    const delAgain = await reqJson('DELETE', '/api/album/' + idA, undefined, cookie);
    check('7p DELETE de la ya borrada → 404', delAgain.status === 404, JSON.stringify(delAgain.json));
  } finally { kill(); }
}

(async () => {
  try { await vmAsync; } catch (e) { check('5n VM async sin excepción', false, e.message); }
  try { await parteBoot(); } catch (e) { check('7x boot sin excepción', false, e.message); }
  console.log(`\nlote-chat-mejora: ${pass} ok, ${fail} mal`);
  if (fails.length) console.log('fallos:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
