#!/usr/bin/env node
// test-lote-subir-foto-cambio.js — LOTE SUBIR-FOTO-CAMBIO v844 (BUG DE LA MAÑANA).
// Tres partes del arreglo:
//   (1) el cambio se MUESTRA antes de programar (tarjeta foto + caption +
//       [Sale así] / [Cambiar algo] (v846: [Editar texto] murió; el
//       cambio se pide por voz); solo [Sale así]
//       programa; si el cambio falla, se dice qué falló y se ofrece la
//       original) — en subir-foto, en el ritual y en el carril exprés.
//   (2) [Cambiar algo] abre la NOTA DE VOZ primero (la nota transcrita es
//       la instrucción del cambio (v846: ya no hay alternativa de texto).
//   (3) «Programándolo…» nunca queda colgado: progreso real por fases y
//       salida honesta en timeout/error/cancelar.
// El lote reutiliza la doctrina del 7/11 (BUG CHAT CON FOTO: PZ_SFT +
// express armar/publicar + VOZ-EJECUTA + ancla/r.edit) en vez de inventar
// un patrón nuevo.
// Corre con: node test-lote-subir-foto-cambio.js
// Boot real en la parte D (puerto 34587; hereda OPENAI_API_KEY y
// FAL_API_KEY del entorno para probar los caminos con IA de verdad).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const DIR = __dirname;
const APP = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
let okN = 0, badN = 0;
function t(cond, name, extra) {
  if (cond) { okN++; console.log('✓', name); }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 500) : ''); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- Parte A: pins estáticos (server + cliente) ----------
console.log('— A) pins estáticos: generar vs programar, tarjeta, voz, no-colgado —');
// A1. El endpoint nuevo existe y el viejo se partió en dos modos.
t(SRV.includes("app.post('/api/subir-foto/generar'"), 'A1: POST /api/subir-foto/generar existe');
t(SRV.includes("async function subirFotoGenerar(uid, body, lang)"), 'A1b: subirFotoGenerar existe');
t(SRV.includes("app.post('/api/subir-foto/programar'"), 'A1c: POST /api/subir-foto/programar existe');
// A2. generar NUNCA programa: dentro de subirFotoGenerar no hay UPDATE a
//     scheduled ni scheduleLintForPost (el INSERT es borrador).
const genStart = SRV.indexOf('async function subirFotoGenerar(uid, body, lang)');
const genEnd = SRV.indexOf("app.post('/api/subir-foto/generar'", genStart);
const genBody = SRV.slice(genStart, genEnd);
t(genBody.includes("'draft'") && !genBody.includes("status = 'scheduled'") && !genBody.includes('scheduleLintForPost'),
  'A2: generar crea borrador y nunca programa (sin UPDATE a scheduled ni lint)', genBody.slice(0, 200));
t(genBody.includes("return { ok: true, postId, post, when, whenLabel, title, caption, hashtags, applied, notes }"),
  'A2b: generar devuelve la vista previa (postId + foto + caption + applied + notes)');
// A3. El cambio fallido devuelve la original para ofrecerla.
t(genBody.includes("fail('cambio_fallo'") && genBody.includes('image_path: post.image_path') && genBody.includes('caption: post.caption'),
  'A3: cambio_fallo devuelve postId + image_path + caption de la original');
// A4. Confirmar exige borrador de subir-foto, hora futura, cupo de la
//     semana destino y lint; es idempotente.
const progStart = SRV.indexOf("app.post('/api/subir-foto/programar'", genStart);
const progBody = SRV.slice(progStart, progStart + 12000);
t(progBody.includes("post.source_topic !== 'subir-foto-preguntas'") && progBody.includes("post.status !== 'draft'"),
  'A4: confirmar solo acepta borrador de subir-foto-preguntas');
t(progBody.includes("'when_pasado'") && progBody.includes('quotaForWeek') && progBody.includes('scheduleLintForPost'),
  'A4b: confirmar re-chequea hora futura + cupo de la semana destino + lint');
t(progBody.includes('already: true'), 'A4c: confirmar es idempotente (already: true)');
t(SRV.slice(progStart - 1200, progStart).includes('LEGADO'), 'A4d: el modo legado para bundles viejos está marcado');
// A5. El cliente genera primero y solo [Sale así] programa.
t(APP.includes("api.post('/api/subir-foto/generar'"), 'A5: pzSubirCompletar llama /api/subir-foto/generar');
const compStart = APP.indexOf('async function pzSubirCompletar');
const compEnd = APP.indexOf('function pzSubirTarjetaPrevia', compStart);
const compBody = APP.slice(compStart, compEnd);
t(!compBody.includes("api.post('/api/subir-foto/programar'"), 'A5b: pzSubirCompletar ya NO programa con las respuestas');
t(APP.split("api.post('/api/subir-foto/programar'").length - 1 === 1, 'A5b2: programar se llama desde un solo lugar ([Sale así])');
t(!compBody.includes('Programándolo…'), 'A5c: el spinner congelado «Programándolo…» ya no está en pzSubirCompletar');
t(APP.includes('function pzSubirFases') && APP.includes('function pzSubirTarjetaPrevia') && APP.includes('function pzSubirTarjetaOriginal')
  && APP.includes('function pzSubirPreviaProgramar') && APP.includes('function pzSubirReintentar'),
  'A5d: existen pzSubirFases + TarjetaPrevia + TarjetaOriginal + PreviaProgramar + Reintentar');
t(APP.includes("api.post('/api/subir-foto/programar', { postId: pid"), 'A5e: solo [Sale así] programa, con {postId}');
// A6. api.req admite signal externo (el botón Cancelar aborta la generación).
t(APP.includes('opts.signal') && APP.includes('AbortController'), 'A6: api.req admite opts.signal (Cancelar aborta)');
// A7. La tarjeta de vista previa tiene los 3 botones.
const btnStart = APP.indexOf('function pzSubirPreviaBotones');
const btnBody = APP.slice(btnStart, btnStart + 2500);
t(btnBody.includes('Sale así') && btnBody.includes('Cambiar algo') && !btnBody.includes('Editar texto'),
  'A7: la tarjeta previa trae [Sale así] / [Cambiar algo], sin [Editar texto] (v846)');
t(btnBody.includes('pzCambioVoz('), 'A7b: [Cambiar algo] de la previa abre la voz (pzCambioVoz)');
// A8. La voz es la instrucción del cambio (las tres superficies).
t(APP.includes('function pzCambioVoz(') && APP.includes('function pzCambioVozPrompt(') && APP.includes('function pzCambioVozPromptDeliver('),
  'A8: existen pzCambioVoz + Prompt + PromptDeliver');
const ritStart = APP.indexOf('function pzRitualPedirCambio');
const ritBody = APP.slice(ritStart, ritStart + 800);
t(ritBody.includes('pzCambioVoz(id)') && !ritBody.includes("HF_ASK_TEXT_PENDING = "),
  'A8b: [Cambiar algo] del ritual abre la voz (ya no manda solo el texto)');
t(APP.includes("onclick=\"pzCambioVoz(${pid})\"") && APP.includes('Change something'),
  'A8c: la tarjeta exprés tiene [Cambiar algo] con pzCambioVoz (ES+EN)');
// A9. El cambio por chat vuelve a la tarjeta (r.edit) y el prompt se
//     entrega al abrir el chat.
t(APP.includes('pzCambioRefrescarTarjeta();'), 'A9: el handler r.edit refresca la tarjeta con la versión nueva');
t(APP.includes('pzCambioVozPromptDeliver();'), 'A9b: bindInicio entrega el prompt de voz al abrir el chat');
// A10. Espejo ES+EN en los textos nuevos del lote.
t(APP.includes('Grabar nota de voz') && APP.includes('Record a voice note') && APP.includes('Decime con tu voz qué le cambio') && APP.includes('Tell me with your voice what to change'),
  'A10: el prompt de voz tiene espejo ES+EN');
t(APP.includes('cancelado, no se programó nada') && APP.includes('Cancelled — nothing was scheduled'),
  'A10b: el mensaje de cancelar tiene espejo ES+EN');

// ---------- Parte B: cliente en VM ----------
// DOM falso mínimo (con parse de innerHTML para botones con data-* e ids).
console.log('— B) cliente en VM: tarjeta previa, original, prompt de voz, ritual, exprés —');
const REG = new Map();
class El {
  constructor(tag) {
    this.tagName = tag || 'div';
    this.dataset = {}; this.style = {}; this.hidden = false; this.removed = false;
    this._html = ''; this.textContent = ''; this._l = {}; this._q = {};
    this.className = ''; this.id = ''; this.children = []; this.value = '';
    this._cls = new Set();
    this.classList = {
      toggle: (c, f) => { if (f === undefined) { if (this._cls.has(c)) this._cls.delete(c); else this._cls.add(c); } else if (f) this._cls.add(c); else this._cls.delete(c); },
      add: (c) => this._cls.add(c), remove: (c) => this._cls.delete(c), contains: (c) => this._cls.has(c),
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v == null ? '' : v);
    // Registrar botones con data-* e ids para querySelector/getElementById.
    const re = /<(\w+)([^>]*)>/g; let m;
    while ((m = re.exec(this._html)) !== null) {
      const attrs = m[2] || '';
      const idm = attrs.match(/\bid="([^"]+)"/);
      if (idm) { const el = new El(m[1]); el.id = idm[1]; REG.set(idm[1], el); }
      const dm = attrs.match(/\bdata-([a-z-]+)="1"/);
      if (dm && m[1] === 'button') { const el = new El('button'); el.dataset[dm[1]] = '1'; this._q['[data-' + dm[1] + ']'] = el; }
    }
  }
  appendChild(c) {
    this.children.push(c);
    if (c && c.id) REG.set(c.id, c);
    if (c && typeof c.innerHTML === 'string') this.innerHTML = this._html + `<${c.tagName || 'div'}>${c.innerHTML}</${c.tagName || 'div'}>`;
    return c;
  }
  insertAdjacentHTML(pos, html) { this.innerHTML = this._html + html; }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  querySelector(sel) { if (sel.startsWith('#')) return REG.get(sel.slice(1)) || null; return this._q[sel] || null; }
  querySelectorAll() { return []; }
  setAttribute(k, v) { this['attr_' + k] = v; }
  getAttribute(k) { return this['attr_' + k]; }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  click() { if (typeof this.onclick === 'function') this.onclick(); }
}
const chatBox = new El('div'); chatBox.id = 'chatBox'; REG.set('chatBox', chatBox);
const chatInput = new El('textarea'); chatInput.id = 'chatInput'; REG.set('chatInput', chatInput);
const calls = { voiceToggle: 0, hfAnchorForId: 0, pzHablarClick: 0, chatSay: [], chatScroll: 0 };
const sb = {
  console, setTimeout: (fn) => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date, Math, JSON, Intl, Map, Set,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  gzT: (es, en) => es,
  $: (s, el) => (el || sb.document).querySelector(s),
  ME: { lang: 'es' },
  document: {
    hidden: false, activeElement: null, body: { appendChild: () => {} },
    getElementById: (id) => REG.get(id) || null,
    querySelector: (sel) => (sel.startsWith('#') ? (REG.get(sel.slice(1)) || null) : null),
    querySelectorAll: () => [],
    createElement: (tag) => new El(tag),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {}, scrollTo: () => {}, __pzChatVoice: false },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  chatSay: (text) => { calls.chatSay.push(text); },
  pzIc: () => '',
  pcTz: () => 'America/New_York',
  chatStripCelebrate: (x) => x,
  FP_MARKER_RE: /$^/, LC_MARKER_RE: /$^/, FOTO_MARKER_RE: /$^/, VIDEO_LISTO_MARKER_RE: /$^/,
  chatStripFpMarker: (x) => x, chatStripLcMarker: (x) => x,
  linkifyEsc: (s) => sb.esc(s),
  chatScroll: () => { calls.chatScroll++; },
  voiceToggle: () => { calls.voiceToggle++; },
  VOICE_STATE: 'idle',
  HF_CHAT_ANCHOR: null,
  hfAnchorForId: (id) => { calls.hfAnchorForId++; },
  pzHablarClick: (id) => { calls.pzHablarClick++; },
  pzSftEn: () => false,
  pzSftChatDecir: () => {},
  pzSftChatBotones: () => '',
  render: () => {},
  api: {
    get: async () => ({}),
    post: async () => ({ ok: true }),
  },
};
vm.createContext(sb);
function extractFunc(name) {
  let i = APP.indexOf('function ' + name + '(');
  if (i < 0) { t(false, 'B0: falta function ' + name + ' en app.js'); return ''; }
  if (APP.slice(i - 6, i) === 'async ') i -= 6; // no perder el async
  const j = APP.indexOf('{', i);
  let d = 0, k = j;
  while (k < APP.length) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (d === 0) break; }
    k++;
  }
  if (d !== 0) { t(false, 'B0: llaves sin cerrar en ' + name); return ''; }
  return APP.slice(i, k + 1);
}
for (const f of ['pzChatHoraFmt', 'chatHoraHtml', 'chatAppendMsg', 'chatReplyQuoteHtml', 'chatMsgHtml', 'pzSubirFases', 'pzSubirPreviaBotones', 'pzSubirTarjetaPrevia', 'pzSubirTarjetaOriginal',
  'pzCambioVoz', 'pzCambioVozPrompt', 'pzCambioVozPromptDeliver', 'pzCambioRefrescarTarjeta',
  'pzRitualPedirCambio', 'pzSftChatTarjetaArmada']) {
  const code = extractFunc(f);
  if (!code) continue;
  try { vm.runInContext(code, sb); t(true, 'B0: ' + f + ' cargada en VM'); }
  catch (e) { t(false, 'B0: ' + f + ' no corre en VM', e.message); }
}
try {
  vm.runInContext('var PZ_SUBIR_PREVIA = {}; var PZ_SUBIR_ULTIMO = null; var PZ_SFT_ARMADOS = {}; var PZ_SFT_CHAT_PENDIENTE = null; var PZ_CAMBIO_VOZ_PENDING = 0; var HF_ASK_TEXT_PENDING = "";', sb);
  t(true, 'B0b: vars de sesión declaradas');
} catch (e) { t(false, 'B0b: vars de sesión', e.message); }

// B1. Las fases son progreso real, no un spinner congelado.
//     pzSubirFases(f) toma el flujo (f.prop.lang, f.ans.change/text).
try {
  const fases = vm.runInContext(`pzSubirFases({ prop: { lang: 'es' }, ans: { change: 'otra-version', text: 'sin-texto' } })`, sb);
  t(Array.isArray(fases) && fases.length === 4, 'B1: pzSubirFases (otra-version) devuelve 4 fases', JSON.stringify(fases));
  t(fases[0].t.includes('escribiendo') && fases[0].ms === 0, 'B1b: la primera fase escribe el texto (0 ms)');
  t(fases[2].t.includes('otra versión') && fases[2].ms === 20000, 'B1c: la otra versión tiene su fase propia (20 s)');
  t(fases[3].t.includes('casi listo') && fases[3].ms === 180000, 'B1d: la última fase avisa que ya casi está (180 s)');
  const fasesRec = vm.runInContext(`pzSubirFases({ prop: { lang: 'es' }, ans: { change: 'recorte', text: 'con-titular' } })`, sb);
  t(fasesRec.length === 5 && fasesRec[2].t.includes('recorte') && fasesRec[2].ms === 20000 && fasesRec[3].t.includes('titular') && fasesRec[3].ms === 45000,
    'B1e: el recorte + titular tienen sus fases (20 s / 45 s)', JSON.stringify(fasesRec));
  const fasesEn = vm.runInContext(`pzSubirFases({ prop: { lang: 'en' }, ans: { change: 'ninguno', text: 'sin-texto' } })`, sb);
  t(fasesEn.length === 3 && fasesEn[0].t.includes('writing'), 'B1f: las fases tienen espejo EN');
} catch (e) { t(false, 'B1: pzSubirFases', e.message); }
// B2. La tarjeta de vista previa: foto + caption + «Sale {whenLabel}» + 3 botones.
try {
  vm.runInContext(`pzSubirTarjetaPrevia({ postId: 99, image_path: '/media/foto-nueva.jpg', caption: 'Caption nueva', hashtags: '#cafe', when: '2026-11-11 19:00', whenLabel: 'miércoles 11/11 a las 19:00', title: 'Café', applied: ['recorte'], notes: [], displayText: '' })`, sb);
  const html = chatBox.innerHTML;
  t(html.includes('/media/foto-nueva.jpg'), 'B2: la previa muestra la foto NUEVA (la cambiada)');
  t(html.includes('Caption nueva'), 'B2b: la previa muestra el caption nuevo');
  t(html.includes('miércoles 11/11 a las 19:00'), 'B2c: la previa muestra «Sale {whenLabel}»');
  t(html.includes('Sale así') && html.includes('Cambiar algo') && !html.includes('Editar texto'), 'B2d: la previa trae los 2 botones (v846: sin [Editar texto])');
  t(html.includes('pzSubirPreviaProgramar(99)'), 'B2e: solo [Sale así] programa (pzSubirPreviaProgramar)');
  t(vm.runInContext('!!PZ_SUBIR_PREVIA[99]', sb), 'B2f: la previa queda registrada por postId');
} catch (e) { t(false, 'B2: pzSubirTarjetaPrevia', e.message); }
// B3. La tarjeta de la original: motivo + foto original + [Programar la original] + [Probar de nuevo].
try {
  vm.runInContext(`pzSubirTarjetaOriginal({ postId: 100, image_path: '/media/foto-orig.jpg', caption: 'Caption orig', whenLabel: 'jueves 12/11 a las 19:00', displayText: '', message: 'no pude hacer la otra versión' })`, sb);
  const html = chatBox.innerHTML;
  t(html.includes('no pude hacer la otra versión'), 'B3: la tarjeta de la original dice qué falló');
  t(html.includes('/media/foto-orig.jpg'), 'B3b: la tarjeta de la original muestra la foto original');
  t(html.includes('Programar la original') && html.includes('Probar el cambio de nuevo'), 'B3c: la original ofrece [Programar la original] / [Probar el cambio de nuevo]');
} catch (e) { t(false, 'B3: pzSubirTarjetaOriginal', e.message); }
// B4. El prompt de voz: SOLO [Grabar nota de voz] (v846: [Escribir] murió); grabar llama a voiceToggle.
try {
  vm.runInContext('pzCambioVozPrompt(99)', sb);
  const prompt = REG.get('pzCambioVozPrompt');
  t(!!prompt, 'B4: el prompt de voz se pinta en el chat');
  const html = chatBox.innerHTML;
  t(html.includes('Grabar nota de voz') && !html.includes('Escribir'), 'B4b: el prompt trae SOLO [Grabar nota de voz] (v846)');
  const g = prompt.querySelector('[data-voz-grabar]');
  t(!!g && typeof g.onclick === 'function', 'B4c: [Grabar nota de voz] tiene su acción');
  const before = calls.voiceToggle;
  if (g) g.click();
  t(calls.voiceToggle === before + 1, 'B4d: tocar [Grabar nota de voz] abre la grabación (voiceToggle)');
  const w = prompt.querySelector('[data-voz-escribir]');
  t(!w, 'B4e: ya no hay botón [Escribir] en el prompt (v846)');
  t(chatInput.focused !== true, 'B4f: sin [Escribir] no hay foco al campo de texto (v846)');
} catch (e) { t(false, 'B4: pzCambioVozPrompt', e.message); }
// B5. pzCambioVoz con el chat abierto: ancla + prompt + graba directo.
//     (El chat abierto se simula con un #pzChatFull en el registro.)
try {
  const chatFull = new El('div'); chatFull.id = 'pzChatFull'; REG.set('pzChatFull', chatFull);
  calls.voiceToggle = 0; calls.hfAnchorForId = 0;
  vm.runInContext('pzCambioVoz(99)', sb);
  t(calls.hfAnchorForId === 1, 'B5: pzCambioVoz ancla el posteo en el chat');
  t(calls.voiceToggle === 1, 'B5b: pzCambioVoz graba directo (el tap es gesto del usuario)');
  t(chatBox.innerHTML.includes('Grabar nota de voz'), 'B5c: pzCambioVoz muestra el prompt de voz');
} catch (e) { t(false, 'B5: pzCambioVoz', e.message); }
// B6. [Cambiar algo] del ritual: abre la voz con el posteo (no manda texto solo).
try {
  calls.voiceToggle = 0; calls.hfAnchorForId = 0;
  vm.runInContext('pzRitualPedirCambio(77)', sb);
  t(calls.hfAnchorForId === 1 && calls.voiceToggle === 1, 'B6: pzRitualPedirCambio abre la voz con el posteo anclado');
} catch (e) { t(false, 'B6: pzRitualPedirCambio', e.message); }
// B7. La tarjeta exprés ahora tiene [Cambiar algo] (además de [Publicar hoy]).
try {
  vm.runInContext(`pzSftChatTarjetaArmada({ postId: 55, kind: 'photo', image_path: '/media/expres.jpg', caption: 'Exprés', hashtags: '', expres: true, dia_label: '', hora: '' })`, sb);
  const html = chatBox.innerHTML;
  t(html.includes('pzSftCard-55'), 'B7: la tarjeta exprés se pinta');
  t(html.includes('Publicar hoy'), 'B7b: la tarjeta exprés mantiene [Publicar hoy]');
  t(html.includes('Cambiar algo') && html.includes('pzCambioVoz(55)'), 'B7c: la tarjeta exprés tiene [Cambiar algo] con pzCambioVoz');
  t(!html.includes('Cambiar texto'), 'B7d: la tarjeta exprés YA NO trae [Cambiar texto] (v846)');
} catch (e) { t(false, 'B7: pzSftChatTarjetaArmada', e.message); }

console.log(`— Resumen A+B: ${okN} ok, ${badN} mal —`);
if (badN) { process.exitCode = 1; console.log('FALLA en A+B: no se corre el boot'); process.exit(1); }

// ---------- Parte D: boot real — el camino del cambio, de verdad ----------
// Necesita OPENAI_API_KEY en el entorno para D3 (la otra-version es un
// restyle con IA real). Sin clave, D3 responde cambio_fallo y la suite
// FALLA ahí a propósito: no se inventa el éxito. Correr con el lanzador
// ~/workspace/.lote-subir-foto-cambio/run-suite-con-ia.py (surrogado del
// conector custom.openai, la clave real nunca se lee ni se imprime).
// D1 (recorte) y D4 (cambio fallido) pasan sin clave: el caption usa el
// fallback de plantilla y el recorte corre media-crops.py en local.
const PORT = 34587;
const TEST_KEY = 'boot-test-key-subir-foto-cambio';
const ADMIN_TOKEN = 'test-admin-token';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subir-foto-cambio-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
// Foto real de prueba (1080x1350, con contenido: gradiente + círculo +
// banda oscura) para que el recorte y el restyle tengan algo que mirar.
try {
  execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
img = Image.new('RGB', (1080, 1350), (240, 220, 190))
d = ImageDraw.Draw(img)
for y in range(1350):
    d.line([(0, y), (1080, y)], fill=(240 - y//12, 220 - y//15, 190 - y//20))
d.ellipse([340, 350, 740, 750], fill=(120, 70, 40))
d.rectangle([0, 1050, 1080, 1350], fill=(30, 30, 30))
d.ellipse([440, 450, 640, 650], fill=(250, 240, 220))
img.save('${mediaDir}/foto-cliente.jpg', quality=88)
`], { stdio: 'ignore' });
} catch (e) { console.log('no se pudo generar la foto de prueba:', e.message); }
fs.writeFileSync(path.join(mediaDir, 'mala.png'), 'esto no es una imagen');
t(fs.existsSync(path.join(mediaDir, 'foto-cliente.jpg')), 'D0: la foto de prueba existe');
t(fs.existsSync(path.join(mediaDir, 'mala.png')), 'D0b: la imagen rota de prueba existe');

async function reqJson(method, p, body, cookie, timeoutMs) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 30000) });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}
function seedDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      try { fn(db); return; }
      catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
    }
  } finally { try { db.close(); } catch (e) {} }
}
function postRow(dbPath, id) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return db.prepare('SELECT id, status, scheduled_at, source_topic, image_path, caption FROM posts WHERE id = ?').get(id); }
  finally { try { db.close(); } catch (e) {} }
}
function countPosts(dbPath, where, ...args) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${where}`).get(...args).n; }
  finally { try { db.close(); } catch (e) {} }
}
// Hoy es lunes 9/11/2026: 2 días = mié 11/11 (esta semana), 9 días =
// mié 18/11 (la que viene), 16 días = mié 25/11 (la siguiente). Cada
// generar va a una semana distinta para no chocar con el cupo.
const WHEN_REC = '2026-11-11 19:00';
const WHEN_OTRA = '2026-11-18 19:00';
const WHEN_FALLO = '2026-11-25 19:00';

async function parteD() {
  console.log('— D) boot real: recorte y otra versión se MUESTRAN antes de programar —');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    t(up, 'D0c: el servidor levanta con el lote');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v849',
      'D0d: /api/version trae el BUILD v849 (estampado)', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    t(fs.existsSync(dbPath), 'D0e: la DB del boot existe en el DATA_DIR temporal');

    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'subir-foto-test', device: 'test-device-subir-foto' });
    t(join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, 'D0f: join del invitado ok', JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    let aFoto = 0, aMala = 0, dSemana = 0;
    seedDb(dbPath, (db) => {
      db.prepare(`UPDATE users SET is_guest = 0 WHERE id = ?`).run(uid);
      db.prepare(`UPDATE profiles SET business_name = ?, category = ?, tone = ?, description = ?, goal = ? WHERE user_id = ?`)
        .run('Café de Prueba', 'cafetería', 'cercano', 'Café de barrio con pastelería casera', 'que vengan', uid);
      aFoto = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/foto-cliente.jpg', 'photo', '').lastInsertRowid);
      aMala = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/mala.png', 'photo', '').lastInsertRowid);
      // Un posteo de la semana (no es de subir-foto): confirmar NO debe aceptarlo.
      dSemana = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source) VALUES (?,?,?,?, 'draft', 'image', '')`).run(uid, '/media/foto-cliente.jpg', 'Posteo de la semana', '').lastInsertRowid);
    });
    t(aFoto > 0 && aMala > 0 && dSemana > 0, 'D0g: semilla ok (foto + imagen rota + posteo de semana)', `aFoto=${aFoto} aMala=${aMala} dSemana=${dSemana}`);

    // D1. RECORTE: generar muestra la versión recortada ANTES de programar.
    const genRec = await reqJson('POST', '/api/subir-foto/generar',
      { assetPath: '/media/foto-cliente.jpg', media: 'photo',
        answers: { when: WHEN_REC, intent: 'vender', text: 'sin-texto', change: 'recorte', promo: 'sin-promo' } }, cookie, 300000);
    t(genRec.status === 200 && genRec.json && genRec.json.ok === true, 'D1: generar con recorte responde ok', JSON.stringify(genRec.json).slice(0, 400));
    if (!genRec.json || !genRec.json.ok) throw new Error('D1 sin vista previa: ' + JSON.stringify(genRec.json));
    const pRec = genRec.json.postId;
    t(typeof pRec === 'number' && pRec > 0, 'D1b: la vista previa trae postId', JSON.stringify(genRec.json));
    t(genRec.json.image_path && genRec.json.image_path !== '/media/foto-cliente.jpg',
      'D1c: la vista previa trae la foto RECORTADA (no la original)', JSON.stringify(genRec.json).slice(0, 300));
    t(genRec.json.caption && genRec.json.caption.length > 10, 'D1d: la vista previa trae caption', JSON.stringify(genRec.json).slice(0, 300));
    t(Array.isArray(genRec.json.applied) && genRec.json.applied.includes('recorte'),
      'D1e: applied incluye recorte', JSON.stringify(genRec.json.applied));
    const rowRec = postRow(dbPath, pRec);
    t(rowRec && rowRec.status === 'draft',
      'D1f: tras generar, el posteo sigue en BORRADOR (nada programado; scheduled_at lleva la fecha prevista desde el INSERT)', JSON.stringify(rowRec));
    t(rowRec && rowRec.source_topic === 'subir-foto-preguntas', 'D1g: el borrador es de subir-foto-preguntas');

    // D2. Solo [Sale así] programa: confirmar la vista previa.
    const progRec = await reqJson('POST', '/api/subir-foto/programar', { postId: pRec }, cookie, 30000);
    t(progRec.status === 200 && progRec.json && progRec.json.ok === true && progRec.json.scheduled === true,
      'D2: confirmar la vista previa programa el posteo', JSON.stringify(progRec.json).slice(0, 400));
    const rowRec2 = postRow(dbPath, pRec);
    t(rowRec2 && rowRec2.status === 'scheduled' && rowRec2.scheduled_at,
      'D2b: el posteo quedó scheduled con su fecha', JSON.stringify(rowRec2));
    const progRec2 = await reqJson('POST', '/api/subir-foto/programar', { postId: pRec }, cookie, 30000);
    t(progRec2.status === 200 && progRec2.json && progRec2.json.ok === true && progRec2.json.already === true,
      'D2c: confirmar dos veces es idempotente (already: true)', JSON.stringify(progRec2.json).slice(0, 300));

    // D3. OTRA VERSIÓN: generar muestra la foto nueva (restyle con IA) antes de programar.
    if (!process.env.OPENAI_API_KEY) console.log('AVISO: sin OPENAI_API_KEY en el entorno — D3 (otra-version) va a dar cambio_fallo; correr con run-suite-con-ia.py para la verificación completa.');
    const genOtra = await reqJson('POST', '/api/subir-foto/generar',
      { assetPath: '/media/foto-cliente.jpg', media: 'photo',
        answers: { when: WHEN_OTRA, intent: 'conozcan', text: 'sin-texto', change: 'otra-version', promo: 'sin-promo' } }, cookie, 300000);
    t(genOtra.status === 200 && genOtra.json && genOtra.json.ok === true, 'D3: generar con otra-version responde ok' + (genOtra.json && genOtra.json.error === 'cambio_fallo' && !process.env.OPENAI_API_KEY ? ' (SIN CLAVE: correr con run-suite-con-ia.py)' : ''), JSON.stringify(genOtra.json).slice(0, 400));
    if (!genOtra.json || !genOtra.json.ok) throw new Error('D3 sin vista previa: ' + JSON.stringify(genOtra.json));
    const pOtra = genOtra.json.postId;
    t(genOtra.json.image_path && genOtra.json.image_path !== '/media/foto-cliente.jpg',
      'D3b: la vista previa trae la foto NUEVA (restyle)', JSON.stringify(genOtra.json).slice(0, 300));
    t(genOtra.json.caption && genOtra.json.caption.length > 10, 'D3c: la vista previa trae caption');
    t(Array.isArray(genOtra.json.applied) && genOtra.json.applied.includes('otra-version'),
      'D3d: applied incluye otra-version', JSON.stringify(genOtra.json.applied));
    const rowOtra = postRow(dbPath, pOtra);
    t(rowOtra && rowOtra.status === 'draft',
      'D3e: tras generar otra-version, el posteo sigue en BORRADOR', JSON.stringify(rowOtra));
    const progOtra = await reqJson('POST', '/api/subir-foto/programar', { postId: pOtra }, cookie, 30000);
    t(progOtra.status === 200 && progOtra.json && progOtra.json.ok === true && progOtra.json.scheduled === true,
      'D3f: confirmar la otra versión la programa', JSON.stringify(progOtra.json).slice(0, 300));

    // D4. CAMBIO FALLIDO: con una imagen rota, el recorte falla y la
    //     respuesta ofrece la original (nada se programa).
    const genFallo = await reqJson('POST', '/api/subir-foto/generar',
      { assetPath: '/media/mala.png', media: 'photo',
        answers: { when: WHEN_FALLO, intent: 'conozcan', text: 'sin-texto', change: 'recorte', promo: 'sin-promo' } }, cookie, 300000);
    t(genFallo.status === 200 && genFallo.json && genFallo.json.ok === false && genFallo.json.error === 'cambio_fallo',
      'D4: el cambio que falla responde cambio_fallo (no ok silencioso)', JSON.stringify(genFallo.json).slice(0, 400));
    if (!genFallo.json || genFallo.json.error !== 'cambio_fallo') throw new Error('D4 sin cambio_fallo: ' + JSON.stringify(genFallo.json));
    const pFallo = genFallo.json.postId;
    t(typeof pFallo === 'number' && pFallo > 0, 'D4b: cambio_fallo trae el postId del borrador');
    t(genFallo.json.image_path === '/media/mala.png', 'D4c: cambio_fallo trae la foto ORIGINAL para ofrecerla');
    t(genFallo.json.caption && genFallo.json.caption.length > 10, 'D4d: cambio_fallo trae el caption de la original');
    t(genFallo.json.message && genFallo.json.message.length > 5, 'D4e: cambio_fallo dice qué falló');
    const rowFallo = postRow(dbPath, pFallo);
    t(rowFallo && rowFallo.status === 'draft',
      'D4f: el cambio fallido deja el posteo en BORRADOR (nada programado)', JSON.stringify(rowFallo));
    const progFallo = await reqJson('POST', '/api/subir-foto/programar', { postId: pFallo }, cookie, 30000);
    t(progFallo.status === 200 && progFallo.json && progFallo.json.ok === true && progFallo.json.scheduled === true,
      'D4g: [Programar la original] programa la foto original', JSON.stringify(progFallo.json).slice(0, 300));

    // D5. Foto no verificada: nada se crea (fail-closed).
    const antes = countPosts(dbPath, 'image_path = ?', '/media/no-existe.png');
    const genMala = await reqJson('POST', '/api/subir-foto/generar',
      { assetPath: '/media/no-existe.png', media: 'photo',
        answers: { when: WHEN_REC, intent: 'vender', text: 'sin-texto', change: 'ninguno', promo: 'sin-promo' } }, cookie, 30000);
    t(genMala.status === 200 && genMala.json && genMala.json.ok === false && genMala.json.error === 'foto_no_verificada',
      'D5: foto no verificada responde foto_no_verificada', JSON.stringify(genMala.json).slice(0, 300));
    t(countPosts(dbPath, 'image_path = ?', '/media/no-existe.png') === antes, 'D5b: la foto no verificada no crea ningún posteo');

    // D6. Confirmar no acepta lo que no es una vista previa de subir-foto.
    const progNo = await reqJson('POST', '/api/subir-foto/programar', { postId: 999999 }, cookie, 30000);
    t(progNo.status === 200 && progNo.json && progNo.json.ok === false && progNo.json.error === 'post_no_encontrado',
      'D6: confirmar un postId inexistente responde post_no_encontrado', JSON.stringify(progNo.json).slice(0, 300));
    const progSem = await reqJson('POST', '/api/subir-foto/programar', { postId: dSemana }, cookie, 30000);
    t(progSem.status === 200 && progSem.json && progSem.json.ok === false && progSem.json.error === 'post_no_programable',
      'D6b: confirmar un posteo de la semana responde post_no_programable', JSON.stringify(progSem.json).slice(0, 300));
    const rowSem = postRow(dbPath, dSemana);
    t(rowSem && rowSem.status === 'draft', 'D6c: el posteo de la semana sigue en borrador');
  } finally {
    kill();
    await sleep(500);
    try { execFileSync('ps', ['-p', String(child.pid)], { stdio: 'ignore' }); t(false, 'D-final: el boot murió por SIGTERM (PID exacto)', 'sigue vivo'); }
    catch (e) { t(true, 'D-final: el boot murió por SIGTERM (PID exacto)'); }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await parteD();
  console.log(`— Resumen total: ${okN} ok, ${badN} mal —`);
  process.exitCode = badN ? 1 : 0;
})().catch((e) => { console.error('ERROR en el boot:', e); process.exitCode = 1; });
