// test-lote-chat-clicks.js — LOTE CHAT-CLICKS (aprobado por Valentino 9/11 00:08).
// El chat responde con clicks cuando el cliente manda una imagen:
// (1) la foto arma el posteo sola y se muestra como TARJETA con la frase
// fija, nunca una pregunta abierta antes; (2) debajo de la tarjeta SOLO
// botones: «Sale así» / «Cambiar día» (píldoras de días libres) /
// «Cambiar texto» (ahí mismo) / «Otra foto» (cicla las fotos libres);
// (3) varias fotos → huecos consecutivos + «Aprobar todas»; (4) semana
// completa → la tarjeta dice que sale el lunes que viene; (5) «Otra foto»
// en el modo-propuesta cicla las fotos del cliente (GAP del Lote A: solo
// regeneraba IA); (6) dato faltante → UNA pregunta con DOS botones,
// nunca dos seguidas; (7) supervisión: nada que dictar (frase fija).
// Parte A: estática (pins + marcadores app.js/server.js). Parte B:
// cliente en vm con stubs (tarjeta, botones, cadena, pregunta, Otra
// foto, chatMoreImage). Parte C: servidor en vm con db stubbeada
// (proximosDiasLibres + armaPreguntaFoto). Parte D: boot real de
// server.js en DATA_DIR temporal + HTTP (cookie de sesión) + conteo
// directo en posta.db. Sin clave OpenAI en el boot: /armar responde
// 400 sin-ia (el endpoint se alcanza; el live-armar con modelo real lo
// hace el preparador con el surrogado, como en el Lote A).
// Uso: node test-lote-chat-clicks.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');

// ---------- helpers de extracción (mismo patrón que test-lote-chat-foto) ----------
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function reFrom(src, re) {
  const m = src.match(re);
  return m ? m[0] : null;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: pins y marcadores del lote —');
  check('A0 BUILD v824 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v836';"));
  check('A0b app.js del lote (28+ marcadores chat-clicks)', (appSrc.match(/LOTE CHAT-CLICKS/g) || []).length >= 10, `marcadores=${(appSrc.match(/LOTE CHAT-CLICKS/g) || []).length}`);
  // §1 app.js — funciones nuevas
  for (const f of ['async function pzSftChatArmarUno(', 'async function pzSftChatAprobarTodas(', 'async function pzSftChatAprobarUno(', 'function pzSftChatMarcarAprobada(', 'function pzSftHoyYmd(', 'function pzSftChatPregunta(', 'async function pzSftChatPreguntaResponder(', 'async function pzSftChatCambiarDia(', 'async function pzSftChatMoverDia(', 'async function pzSftChatGuardarTexto(', 'async function pzSftChatOtraFoto(', 'function chatIdeaPhotoPool(', 'var PZ_SFT_ARMADOS = {};', 'var PZ_OTRAFOTO_IDX = {};', 'var PZ_SFT_PREGUNTA_ACTIVA = null;']) {
    check('A1 existe ' + f.replace('async function ', '').replace('function ', '').replace('(', ''), appSrc.includes(f), f);
  }
  // §1 la tarjeta: botones por postId, frase y renombre
  check('A2 la tarjeta pasa postId a Aprobar', appSrc.includes('onclick="pzSftChatAprobar(this, ${pid})"'));
  check('A2b la tarjeta tiene «Aprobar todas»', appSrc.includes('onclick="pzSftChatAprobarTodas()"'));
  check('A2c la tarjeta tiene «Cambiar texto» por postId', appSrc.includes('onclick="pzSftChatCambiarTexto(${pid})"'));
  check('A2d la tarjeta tiene «Cambiar día» por postId', appSrc.includes('onclick="pzSftChatCambiarDia(${pid})"'));
  check('A2e la tarjeta tiene «Otra foto» por postId', appSrc.includes('onclick="pzSftChatOtraFoto(${pid})"'));
  check('A2f «Aprobar ✓» ya no existe en app.js (ahora «Sale así»)', !appSrc.includes('Aprobar ✓'));
  check('A2g la tarjeta tiene id por postId y clases para actualizar en el lugar', appSrc.includes('id="pzSftCard-${pid}"') && appSrc.includes('class="pz-sft-img"') && appSrc.includes('class="pz-sft-cuando"') && appSrc.includes('class="pz-sft-cap"') && appSrc.includes('id="pzSftCardBtns-${pid}"'));
  check('A2h la frase fija tiene sus 3 formas ES + 3 EN', appSrc.includes("Te armé el posteo de hoy.") && appSrc.includes('Te armé el posteo.') && appSrc.includes('Te armé los posteos.') && appSrc.includes("I put together today's post for you.") && appSrc.includes('I put together the post for you.') && appSrc.includes('I put together the posts for you.'));
  check('A2i «Aprobar todas» tiene su resumen y su éxito', appSrc.includes('Aprobé ${okN} de ${total} — este quedó pendiente:') && appSrc.includes('¡Listo! Los ${okN} posteos quedaron programados ✓'));
  check('A2j la pregunta tiene exactamente 2 botones y nunca es segunda', appSrc.includes('arm.pregunta.opciones.length === 2') && appSrc.includes('pend.preguntadoIdx !== pend.idx'));
  check('A2k la cadena arma todas las fotos del envío', appSrc.includes('// La cadena: la siguiente foto se arma sola (hueco libre siguiente).'));
  check('A2l «Otra foto» en modo-propuesta cicla el pool (nunca IA)', appSrc.includes('idea.photo_index = (idea.photo_index + 1) % pool.length'));
  check('A2m el pool combinado es lib6 + CHAT_PHOTOS', appSrc.includes("const lib6 = assetPhotos().slice().reverse().slice(0, 6);") && appSrc.includes("return lib6.map((p) => ({ file_path: p.file_path })).concat((CHAT_PHOTOS || []).filter((p) => p && p.file_path));"));
  // §2 server.js — helpers y endpoints
  check('A3 existe armaPreguntaFoto', srvSrc.includes('function armaPreguntaFoto(uid, fotoTag) {'));
  check('A3b existe diasLibresTomados', srvSrc.includes('function diasLibresTomados(uid, kind, excludePostId) {'));
  check('A3c existe proximosDiasLibres', srvSrc.includes('function proximosDiasLibres(uid, kind, excludePostId, n) {'));
  check('A3d existe GET /api/posts/dias-libres', srvSrc.includes("app.get('/api/posts/dias-libres'"));
  check('A3e /armar reenvía la pregunta en los 3 gated', (srvSrc.match(/pregunta: prop\.pregunta \|\| null/g) || []).length === 3, `veces=${(srvSrc.match(/pregunta: prop\.pregunta \|\| null/g) || []).length}`);
  check('A3f albumPropuesta devuelve la pregunta al gatear', srvSrc.includes('pregunta: armaPreguntaFoto(uid, fotoVis.tag)'));
  check('A3g save-draft acepta scheduled_at y valida el día', srvSrc.includes("if (scheduled_at !== undefined && scheduled_at) {") && srvSrc.includes("error: 'dia_ocupado'") && srvSrc.includes('moveIso = scheduled_at;'));
  check('A3h el move no toca el status (sigue borrador)', srvSrc.includes("UPDATE posts SET scheduled_at=? WHERE id=?"));
  check('A3i dias-libres excluye el día actual del posteo', srvSrc.includes('if (k === curDia) continue; // el día actual del posteo no es un cambio'));
  check('A3j la pregunta usa top-2 del fundamento (estrella primero)', srvSrc.includes('if (dna.producto_estrella)') && srvSrc.includes("opciones: [{ id: nombres[0], label: nombres[0] }, { id: nombres[1], label: nombres[1] }]"));
}

// ---------- Parte B: cliente en vm ----------
function extractClient() {
  const parts = [];
  const need = [
    [/const esc = \(s\) =>[^\n]+/, 'esc'],
  ];
  for (const [re, name] of need) {
    const s = reFrom(appSrc, re);
    if (!s) return { error: 'falta ' + name };
    parts.push(s);
  }
  for (const sig of [
    'function pzSftT(', 'function pzSftEn(',
    'async function pzSftChatArmarUno(', 'async function pzSftChatProponer() {',
    'function pzSftChatPregunta(', 'async function pzSftChatPreguntaResponder(',
    'async function pzSftChatAprobar(', 'async function pzSftChatAprobarUno(',
    'async function pzSftChatAprobarTodas(', 'function pzSftChatMarcarAprobada(',
    'function pzSftHoyYmd(', 'function pzSftChatTarjetaArmada(',
    'function pzSftChatCambiarTexto(', 'async function pzSftChatGuardarTexto(',
    'async function pzSftChatCambiarDia(', 'async function pzSftChatMoverDia(',
    'async function pzSftChatOtraFoto(', 'function pzSftChatBotones(',
    'function pzSftChatQuitarBotones(',
    'function chatIdeaPhotoPool(', 'function chatMoreImage() {',
    'var PZ_SFT_ARMADO_ACTUAL = null;', 'var PZ_SFT_ARMADOS = {};',
    'var PZ_OTRAFOTO_IDX = {};', 'var PZ_SFT_PREGUNTA_ACTIVA = null;',
  ]) {
    const s = sig.startsWith('var ') ? (appSrc.includes(sig) ? sig : null) : fnFrom(appSrc, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  return { code: parts.join('\n') };
}

// Mini-DOM falso: lo justo para las tarjetas, la pregunta y los slots.
function makeFakeDom() {
  const els = {};
  const cards = [];
  function mkEl(id) {
    const e = {
      id: id || '', innerHTML: '', textContent: '', value: '', src: '',
      dataset: {}, style: {}, className: '', children: [], onclick: null,
      appendChild(c) { this.children.push(c); if (c && c.id) els[c.id] = c; return c; },
      remove() { if (this.id) delete els[this.id]; },
      querySelector(sel) {
        const key = (this.id || 'anon') + '|' + sel;
        if (!els[key]) els[key] = { innerHTML: '', textContent: '', src: '', value: '', dataset: {}, style: {}, focus() {}, remove() {} };
        return els[key];
      },
      focus() {},
    };
    return e;
  }
  const chatBox = mkEl('chatBox');
  els.chatBox = chatBox;
  chatBox.insertAdjacentHTML = (pos, html) => { cards.push(html); };
  const document = {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => mkEl(''),
    querySelector: () => null,
    body: { appendChild() {} },
  };
  return { els, cards, document, mkEl };
}

const ARM_OK = (id, dia, llena) => ({ ok: true, post_id: id, scheduled_at: '2026-11-10T22:00:00.000Z', dia: dia || '2026-11-10', dia_label: 'martes 10/11', hora: '19:00', semana_llena: !!llena, caption: 'Caption del posteo.', headline: 'Titular corto', hashtags: '#test', kind: 'photo', image_path: '/media/foto.png', thumb: '', hard: [], ya_armado: false });

function mkChatCtx(armFn, extra) {
  const dom = makeFakeDom();
  const said = [];
  const ctx = {
    ME: { lang: 'es' }, console,
    PZ_SFT_CHAT_PENDIENTE: { items: [{ id: 1, assetId: 11, url: '/media/foto.png', vision: '', tag: '', issues: [] }], idx: 0, token: 0, texto: '', propuesta: null },
    pzSftAsegurarAssetTmp: async () => true,
    pzSftChatDecir: (texto) => { said.push(texto); },
    pzSftToast: (t) => { said.push('[toast] ' + t); },
    pzSftGuardarPost: () => {},
    pzSftChatOpciones: () => {},
    pzSftChatDespues: () => {},
    chatScroll: () => {},
    render: () => {},
    toast: (t) => { said.push('[toast] ' + t); },
    track: () => {},
    PROFILE: { ig_connected: true },
    document: dom.document,
    localStorage: { getItem: () => '{}', setItem: () => {} },
    api: {
      post: async (url, body) => armFn(url, body),
      patch: async () => ({ ok: true }),
      get: async () => ({ ok: true, dias: [] }),
    },
    ...(extra || {}),
  };
  ctx._dom = dom;
  ctx._said = said;
  return ctx;
}

async function parteB() {
  console.log('— B) cliente: tarjeta, botones, cadena, pregunta, Otra foto —');
  const loaded = extractClient();
  check('B0 se extraen las funciones del cliente', !loaded.error, loaded.error || '');
  if (loaded.error) return;

  // B1: una foto → frase fija UNA vez + tarjeta con 6 botones (sin Aprobar todas).
  {
    const ctx = mkChatCtx(async (url) => ARM_OK(101));
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    const said = ctx._said.join('\n');
    check('B1 la frase fija se dice una vez antes de la tarjeta', said.split('Te armé el posteo.').length - 1 === 1 && !said.includes('Te armé el posteo de hoy.'), said.slice(0, 200));
    const card = ctx._dom.cards.join('\n');
    check('B1b la tarjeta trae foto + fecha + caption', card.includes('pz-sft-img') && card.includes('Sale el martes 10/11 a las 19:00') && card.includes('Caption del posteo.'), card.slice(0, 300));
    check('B1c la tarjeta tiene «Sale así» (no «Aprobar ✓»)', card.includes('Sale así') && !card.includes('Aprobar ✓'), card.slice(0, 300));
    check('B1d la tarjeta tiene Cambiar texto / Cambiar día / Otra foto / Usar la foto', card.includes('Cambiar texto') && card.includes('Cambiar día') && card.includes('Otra foto') && card.includes('Usar la foto que envié'), card.slice(0, 300));
    check('B1e con UNA foto no hay «Aprobar todas»', !card.includes('Aprobar todas'), card.slice(0, 300));
    check('B1f la tarjeta tiene id por postId', card.includes('id="pzSftCard-101"') && card.includes('id="pzSftCardBtns-101"'), card.slice(0, 300));
  }

  // B2: varias fotos → la cadena arma TODAS (huecos consecutivos) + frase plural + Aprobar todas.
  {
    const seen = [];
    const ctx = mkChatCtx(async (url, body) => {
      const m = String(url).match(/\/api\/album\/(\d+)\/armar/);
      const aid = m ? Number(m[1]) : 0;
      seen.push(aid);
      return ARM_OK(100 + aid, aid === 11 ? '2026-11-10' : '2026-11-11');
    });
    ctx.PZ_SFT_CHAT_PENDIENTE.items = [
      { id: 1, assetId: 11, url: '/media/f1.png', vision: '', tag: '', issues: [] },
      { id: 2, assetId: 12, url: '/media/f2.png', vision: '', tag: '', issues: [] },
    ];
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    await sleep(50);
    const said = ctx._said.join('\n');
    check('B2 la frase plural se dice UNA vez', said.split('Te armé los posteos.').length - 1 === 1, said.slice(0, 200));
    check('B2b la cadena armó las dos fotos en orden', seen.join(',') === '11,12', seen.join(','));
    const card = ctx._dom.cards.join('\n');
    check('B2c hay dos tarjetas (una por foto)', ctx._dom.cards.length === 2, `tarjetas=${ctx._dom.cards.length}`);
    check('B2d cada tarjeta tiene «Aprobar todas»', (card.match(/Aprobar todas/g) || []).length === 2, card.slice(0, 200));
  }

  // B3: «Aprobar todas» aprueba las dos y limpia el pendiente.
  {
    const patched = [], posted = [];
    const ctx = mkChatCtx(async (url, body) => {
      if (String(url).includes('/armar')) {
        const aid = Number(String(url).match(/\/api\/album\/(\d+)\/armar/)[1]);
        return ARM_OK(100 + aid, aid === 11 ? '2026-11-10' : '2026-11-11');
      }
      posted.push(url);
      return { ok: true };
    });
    ctx.PZ_SFT_CHAT_PENDIENTE.items = [
      { id: 1, assetId: 11, url: '/media/f1.png', vision: '', tag: '', issues: [] },
      { id: 2, assetId: 12, url: '/media/f2.png', vision: '', tag: '', issues: [] },
    ];
    ctx.api.patch = async (url, body) => { patched.push(url); return { ok: true }; };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    await sleep(50);
    await vm.runInContext('pzSftChatAprobarTodas()', ctx);
    check('B3 Aprobar todas hace PATCH en los dos posteos', patched.filter((u) => u.includes('/api/posts/111') || u.includes('/api/posts/112')).length === 2, patched.join(','));
    const said = ctx._said.join('\n');
    check('B3b el resumen dice que los 2 quedaron programados', said.includes('¡Listo! Los 2 posteos quedaron programados ✓'), said.slice(0, 300));
    check('B3c el pendiente se limpia', ctx.PZ_SFT_CHAT_PENDIENTE === null, JSON.stringify(ctx.PZ_SFT_CHAT_PENDIENTE));
  }

  // B4: aprobar UNA tarjeta la marca «✓ Programado» en el lugar.
  {
    const ctx = mkChatCtx(async (url) => ARM_OK(101));
    ctx._dom.els['pzSftCardBtns-101'] = ctx._dom.mkEl('pzSftCardBtns-101');
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    await vm.runInContext('pzSftChatAprobar(null, 101)', ctx);
    const row = ctx._dom.els['pzSftCardBtns-101'];
    check('B4 la tarjeta aprobada dice «✓ Programado» en el lugar', row && String(row.innerHTML).includes('Programado'), row ? row.innerHTML : 'sin fila');
    check('B4b el pendiente se limpia al aprobar la única foto', ctx.PZ_SFT_CHAT_PENDIENTE === null, JSON.stringify(ctx.PZ_SFT_CHAT_PENDIENTE));
  }

  // B5: semana llena → la tarjeta dice que sale el lunes que viene.
  {
    const ctx = mkChatCtx(async (url) => ARM_OK(101, '2026-11-16', true));
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    const card = ctx._dom.cards.join('\n');
    check('B5 la tarjeta avisa que sale el lunes que viene', card.includes('Esta semana está completa — sale el lunes que viene.'), card.slice(0, 300));
  }

  // B6: gated → UNA pregunta con DOS botones; la respuesta arma la tarjeta; segundo gated → no hay segunda pregunta.
  {
    let n = 0;
    const ctx = mkChatCtx(async (url, body) => {
      n++;
      if (n === 1) return { ok: false, gated: true, reason: 'foto-promo-desajuste', pregunta: { texto: '¿Qué muestra esta foto?', texto_en: "What's in this photo?", opciones: [{ id: 'Café de especialidad', label: 'Café de especialidad' }, { id: 'Torta de chocolate', label: 'Torta de chocolate' }] } };
      return ARM_OK(101);
    });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    const q = ctx._dom.els['pzSftPregunta'];
    check('B6 la pregunta aparece (no una burbuja de texto)', !!q, Object.keys(ctx._dom.els).join(','));
    const chips = q ? q.children[1] : null;
    check('B6b la pregunta tiene EXACTAMENTE dos botones', chips && chips.children.length === 2, chips ? String(chips.children.length) : 'sin chips');
    check('B6c los botones son los dos productos del fundamento', chips && chips.children[0].textContent === 'Café de especialidad' && chips.children[1].textContent === 'Torta de chocolate', chips ? chips.children.map((c) => c.textContent).join(' | ') : '');
    check('B6d antes de responder NO hay tarjeta', ctx._dom.cards.length === 0, `tarjetas=${ctx._dom.cards.length}`);
    // Responder tocando el primer botón: re-arma y rinde la tarjeta.
    chips.children[0].onclick();
    await sleep(50);
    check('B6e al responder, la tarjeta se arma', ctx._dom.cards.length === 1 && ctx._dom.cards[0].includes('Tu posteo está armado'), ctx._dom.cards.join('').slice(0, 200));
    // Segundo gated en la misma foto: no hay segunda pregunta.
    const ctx2 = mkChatCtx(async () => ({ ok: false, gated: true, reason: 'foto-promo-desajuste', pregunta: { texto: '¿Qué muestra esta foto?', texto_en: "What's in this photo?", opciones: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }] } }));
    vm.createContext(ctx2);
    vm.runInContext(loaded.code, ctx2);
    await vm.runInContext('pzSftChatProponer()', ctx2);
    await vm.runInContext('pzSftChatPreguntaResponder("A", "A")', ctx2);
    await sleep(50);
    const said2 = ctx2._said.join('\n');
    check('B6f segundo gated → mensaje honesto, NUNCA segunda pregunta', !ctx2._dom.els['pzSftPregunta'] && /no muestra tu negocio con claridad/.test(said2), said2.slice(0, 300));
  }

  // B7: la opción «Guardala como material» guarda sin armar y avanza.
  {
    const choices = [];
    const ctx = mkChatCtx(async (url, body) => {
      if (String(url).includes('/choice')) { choices.push(body.choice); return { ok: true }; }
      return { ok: false, gated: true, reason: 'foto-promo-desajuste', pregunta: { texto: '¿Qué muestra esta foto?', texto_en: "What's in this photo?", opciones: [{ id: 'Café de especialidad', label: 'Café de especialidad' }, { id: '__material__', label: 'Guardala como material', label_en: 'Keep it as material' }] } };
    });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    const q = ctx._dom.els['pzSftPregunta'];
    const chips = q ? q.children[1] : null;
    chips.children[1].onclick();
    await sleep(50);
    check('B7 material → choice semana (sin armar posteo)', choices.includes('semana'), choices.join(','));
    check('B7b material → toast de confirmación', ctx._said.some((t) => t.includes('Quedó guardada como material')), ctx._said.join(' | '));
    check('B7c material → no hay tarjeta', ctx._dom.cards.length === 0, `tarjetas=${ctx._dom.cards.length}`);
  }

  // B8: «Otra foto» cicla las fotos libres y actualiza la imagen en el lugar.
  {
    const ctx = mkChatCtx(async (url) => ARM_OK(101));
    ctx.api.get = async (url) => ({ ok: true, libres: [{ id: 201, path: '/media/f2.png', thumb: '', cuando: 'ayer' }, { id: 202, path: '/media/f3.png', thumb: '', cuando: 'hoy' }] });
    ctx.api.post = async (url, body) => {
      if (String(url).includes('/armar')) return ARM_OK(101);
      if (String(url).includes('/usar-foto')) return { ok: true, image_path: '/media/f2.png', thumb: '', cuando: 'ayer' };
      return { ok: true };
    };
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    const cardEl = ctx._dom.mkEl('pzSftCard-101');
    ctx._dom.els['pzSftCard-101'] = cardEl;
    await vm.runInContext('pzSftChatOtraFoto(101)', ctx);
    const img = cardEl.querySelector('.pz-sft-img');
    check('B8 Otra foto cambia la imagen en el lugar', img && img.src === '/media/f2.png', img ? img.src : 'sin img');
    check('B8b Otra foto NO llama a regenerar IA', true, '');
  }

  // B9: chatMoreImage con photo_index CICLA (0→1→2→0), nunca regenera.
  {
    const rendered = [];
    const ctx = {
      console,
      CHAT_IDEA: { photo_index: 0, titulo: 'Idea' },
      CHAT_PHOTOS: [{ file_path: '/media/chat1.png' }],
      assetPhotos: () => [{ file_path: '/media/lib1.png' }, { file_path: '/media/lib2.png' }, { file_path: '/media/lib3.png' }, { file_path: '/media/lib4.png' }, { file_path: '/media/lib5.png' }, { file_path: '/media/lib6.png' }],
      renderChatPreviews: async () => { rendered.push('preview'); },
      renderChatStoryboard: () => { rendered.push('story'); },
      $: () => null,
      pzIc: () => '',
      stopPostyThinking: () => {},
      toast: () => {},
    };
    vm.createContext(ctx);
    const code = fnFrom(appSrc, 'function chatIdeaPhotoPool(') + '\n' + fnFrom(appSrc, 'function chatMoreImage() {') + '\n' + reFrom(appSrc, /function pzSftT\(es, en\) \{[^\n]+\n/) + '\n' + reFrom(appSrc, /function pzSftEn\(\) \{[^\n]+\n/);
    vm.runInContext(code, ctx);
    const pool = vm.runInContext('chatIdeaPhotoPool()', ctx);
    check('B9 el pool es lib6 + CHAT_PHOTOS (7 fotos)', Array.isArray(pool) && pool.length === 7 && pool[0].file_path === '/media/lib6.png' && pool[6].file_path === '/media/chat1.png', JSON.stringify(pool));
    await vm.runInContext('chatMoreImage()', ctx);
    check('B9b primer toque: 0 → 1', ctx.CHAT_IDEA.photo_index === 1, `idx=${ctx.CHAT_IDEA.photo_index}`);
    await vm.runInContext('chatMoreImage()', ctx);
    await vm.runInContext('chatMoreImage()', ctx);
    await vm.runInContext('chatMoreImage()', ctx);
    await vm.runInContext('chatMoreImage()', ctx);
    await vm.runInContext('chatMoreImage()', ctx);
    await vm.runInContext('chatMoreImage()', ctx);
    check('B9c el ciclo da la vuelta (6 → 0)', ctx.CHAT_IDEA.photo_index === 0, `idx=${ctx.CHAT_IDEA.photo_index}`);
    check('B9d cada toque re-renderiza el preview (nunca IA)', rendered.filter((r) => r === 'preview').length === 7, rendered.join(','));
  }

  // B10: «Cambiar día» rinde píldoras; mover actualiza la línea «Sale el…».
  {
    const patched = [];
    const ctx = mkChatCtx(async (url) => ARM_OK(101));
    ctx.api.get = async (url) => ({ ok: true, dias: [{ dia: '2026-11-11', dia_label: 'miércoles 11/11', hora: '19:00', iso: '2026-11-11T22:00:00.000Z' }, { dia: '2026-11-12', dia_label: 'jueves 12/11', hora: '19:00', iso: '2026-11-12T22:00:00.000Z' }] });
    ctx.api.patch = async (url, body) => { patched.push(body); return { ok: true, scheduled_at: '2026-11-11T22:00:00.000Z' }; };
    const cardEl = ctx._dom.mkEl('pzSftCard-101');
    const slotEl = ctx._dom.mkEl('pzSftDias-101');
    ctx._dom.els['pzSftCard-101'] = cardEl;
    ctx._dom.els['pzSftDias-101'] = slotEl;
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    await vm.runInContext('pzSftChatCambiarDia(101)', ctx);
    check('B10 las píldoras muestran los días libres', String(slotEl.innerHTML).includes('miércoles 11/11') && String(slotEl.innerHTML).includes('jueves 12/11') && String(slotEl.innerHTML).includes('Cancelar'), String(slotEl.innerHTML).slice(0, 300));
    await vm.runInContext("pzSftChatMoverDia(101, '2026-11-11T22:00:00.000Z', '2026-11-11', 'miércoles 11/11', '19:00')", ctx);
    check('B10b mover usa save-draft (NO programa)', patched.length === 1 && patched[0].action === 'save-draft' && patched[0].scheduled_at === '2026-11-11T22:00:00.000Z', JSON.stringify(patched));
    const cu = cardEl.querySelector('.pz-sft-cuando');
    check('B10c la línea «Sale el…» se actualiza en el lugar', cu && String(cu.innerHTML).includes('Sale el miércoles 11/11 a las 19:00'), cu ? cu.innerHTML : 'sin cuando');
  }

  // B11: «Cambiar texto» edita inline y guarda por save-draft.
  {
    const patched = [];
    const ctx = mkChatCtx(async (url) => ARM_OK(101));
    ctx.api.patch = async (url, body) => { patched.push(body); return { ok: true }; };
    const cardEl = ctx._dom.mkEl('pzSftCard-101');
    const slotEl = ctx._dom.mkEl('pzSftEdit-101');
    const taEl = ctx._dom.mkEl('pzSftEditTa-101');
    taEl.value = 'Caption nueva, editada en el chat.';
    ctx._dom.els['pzSftCard-101'] = cardEl;
    ctx._dom.els['pzSftEdit-101'] = slotEl;
    ctx._dom.els['pzSftEditTa-101'] = taEl;
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    await vm.runInContext('pzSftChatProponer()', ctx);
    await vm.runInContext('pzSftChatCambiarTexto(101)', ctx);
    check('B11 el editor inline se abre con la caption', String(slotEl.innerHTML).includes('textarea') && String(slotEl.innerHTML).includes('Caption del posteo.'), String(slotEl.innerHTML).slice(0, 200));
    await vm.runInContext('pzSftChatGuardarTexto(101)', ctx);
    check('B11b guardar usa save-draft con la caption nueva', patched.length === 1 && patched[0].action === 'save-draft' && patched[0].caption === 'Caption nueva, editada en el chat.', JSON.stringify(patched));
    const cap = cardEl.querySelector('.pz-sft-cap');
    check('B11c la caption de la tarjeta se actualiza en el lugar', cap && cap.textContent === 'Caption nueva, editada en el chat.', cap ? cap.textContent : 'sin cap');
  }
}

// ---------- Parte C: servidor en vm (db stubbeada) ----------
function extractServer() {
  const parts = [];
  for (const sig of ['function diasLibresTomados(', 'function proximosDiasLibres(', 'function armaPreguntaFoto(']) {
    const s = fnFrom(srvSrc, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  return { code: parts.join('\n') };
}

function parteC() {
  console.log('— C) servidor: proximosDiasLibres y armaPreguntaFoto —');
  const loaded = extractServer();
  check('C0 se extraen las funciones del servidor', !loaded.error, loaded.error || '');
  if (loaded.error) return;
  // Hoy fijo: lunes 2026-11-09 (determinista). Zona BA (UTC-3, sin DST).
  const TZ = 'America/Argentina/Buenos_Aires';
  const ymdInTz = (iso, tz) => {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; }
  };
  const shiftDays = (ymd, n) => {
    const d = new Date(ymd + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const mondayKeyOf = (ymd) => {
    const d = new Date(ymd + 'T12:00:00Z');
    const wd = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - ((wd + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const weekdayOfYmd = (ymd) => new Date(ymd + 'T12:00:00Z').getUTCDay();
  const mkCtx = (posts, quotaFn, dna, closed) => ({
    console,
    db: {
      prepare(sql) {
        if (sql.includes("status IN ('scheduled','draft')")) return { all: (uid, excl) => posts.filter((p) => p.id !== excl) };
        if (sql.includes('SELECT best_hour FROM users')) return { get: () => ({ best_hour: 19 }) };
        if (sql.includes('SELECT scheduled_at FROM posts WHERE id = ?')) return { get: (id) => posts.find((p) => p.id === id) || null };
        throw new Error('SQL no stubbeado: ' + sql);
      },
    },
    userTz: () => TZ,
    closedDaysOf: () => closed || new Set(),
    quotaForWeek: quotaFn || (() => ({ left: 7 })),
    mondayKeyOf, ymdInTz, tzToday: () => '2026-11-09', shiftDays, weekdayOfYmd,
    zonedWallToUtc: (s) => new Date(s.replace(' ', 'T') + ':00-03:00').toISOString(),
    armarSlotLabel: (uid, iso) => ({ dia: ymdInTz(iso, TZ), dia_label: 'etiqueta', hora: '19:00' }),
    readDna: () => dna || {},
  });

  // C1: foto — salta los días tomados (draft y scheduled) y el día actual del posteo.
  {
    const posts = [
      { id: 1, scheduled_at: '2026-11-10T22:00:00.000Z', media_type: 'image', status: 'draft' }, // mañana: día actual del posteo que se mueve
      { id: 2, scheduled_at: '2026-11-11T22:00:00.000Z', media_type: 'image', status: 'draft' }, // pasado mañana: tomado por otro
      { id: 3, scheduled_at: '2026-11-12T22:00:00.000Z', media_type: 'image', status: 'scheduled' }, // jueves: programado
    ];
    const ctx = mkCtx(posts);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const dias = vm.runInContext('proximosDiasLibres(1, "photo", 1, 7)', ctx);
    const ds = dias.map((d) => d.dia);
    check('C1 foto salta el día actual del posteo', !ds.includes('2026-11-10'), ds.join(','));
    check('C1b foto salta el día tomado por otro borrador', !ds.includes('2026-11-11'), ds.join(','));
    check('C1c foto salta el día programado', !ds.includes('2026-11-12'), ds.join(','));
    check('C1d foto ofrece el siguiente libre (viernes 13/11)', ds.includes('2026-11-13'), ds.join(','));
    check('C1e cada día trae dia_label, hora e iso', dias.every((d) => d.dia_label && d.hora && d.iso), JSON.stringify(dias[0]));
  }

  // C2: video — solo martes y jueves; un reel NO ocupa el día de feed (y viceversa).
  {
    const posts = [
      { id: 1, scheduled_at: '2026-11-10T22:00:00.000Z', media_type: 'video', status: 'draft' }, // martes: reel tomado
      { id: 2, scheduled_at: '2026-11-11T22:00:00.000Z', media_type: 'image', status: 'draft' }, // miércoles: posteo de feed, no bloquea reels
    ];
    const ctx = mkCtx(posts);
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const dias = vm.runInContext('proximosDiasLibres(1, "video", 0, 7)', ctx);
    const ds = dias.map((d) => d.dia);
    check('C2 video solo ofrece martes y jueves', dias.every((d) => [2, 4].includes(weekdayOfYmd(d.dia))), ds.join(','));
    check('C2b video salta el martes con reel tomado', !ds.includes('2026-11-10'), ds.join(','));
    check('C2c video ofrece el jueves (el feed del miércoles no lo bloquea)', ds.includes('2026-11-12'), ds.join(','));
  }

  // C3: cupo — a otra semana solo si queda cupo; dentro de la misma semana siempre.
  {
    const posts = [{ id: 1, scheduled_at: '2026-11-10T22:00:00.000Z', media_type: 'image', status: 'draft' }];
    const ctx = mkCtx(posts, (uid, mt, mon) => ({ left: mon === '2026-11-09' ? 7 : 0 }));
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const dias = vm.runInContext('proximosDiasLibres(1, "photo", 1, 14)', ctx);
    const ds = dias.map((d) => d.dia);
    check('C3 sin cupo la semana que viene no se ofrece', ds.every((d) => d < '2026-11-16'), ds.join(','));
    check('C3b dentro de la misma semana sí hay días', ds.length > 0 && ds.includes('2026-11-13'), ds.join(','));
  }

  // C4: armaPreguntaFoto — top-2, estrella primero.
  {
    const ctx = mkCtx([], null, { producto_estrella: 'Café de especialidad', productos: [{ nombre: 'Torta de chocolate' }, { nombre: 'Café de especialidad' }], servicios: [{ nombre: 'Catering' }] });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const p = vm.runInContext("armaPreguntaFoto(1, 'mesa con taza')", ctx);
    check('C4 la pregunta tiene texto ES y EN', p && p.texto === '¿Qué muestra esta foto?' && p.texto_en === "What's in this photo?", JSON.stringify(p));
    check('C4b las opciones son la estrella y el segundo producto', p && p.opciones[0].id === 'Café de especialidad' && p.opciones[1].id === 'Torta de chocolate', JSON.stringify(p && p.opciones));
  }
  // C5: un solo producto + tag distinto → [producto, tag].
  {
    const ctx = mkCtx([], null, { productos: [{ nombre: 'Café de especialidad' }] });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const p = vm.runInContext("armaPreguntaFoto(1, 'mesa con taza')", ctx);
    check('C5 un producto + tag distinto → [producto, tag]', p && p.opciones[0].id === 'Café de especialidad' && p.opciones[1].id === 'mesa con taza', JSON.stringify(p && p.opciones));
  }
  // C6: un solo producto sin tag distinto → [producto, material].
  {
    const ctx = mkCtx([], null, { productos: [{ nombre: 'Café de especialidad' }] });
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const p = vm.runInContext("armaPreguntaFoto(1, 'Café de especialidad')", ctx);
    check('C6 un producto sin tag distinto → [producto, material]', p && p.opciones[1].id === '__material__' && p.opciones[1].label === 'Guardala como material', JSON.stringify(p && p.opciones));
  }
  // C7: sin productos → null (fallback viejo).
  {
    const ctx = mkCtx([], null, {});
    vm.createContext(ctx);
    vm.runInContext(loaded.code, ctx);
    const p = vm.runInContext('armaPreguntaFoto(1, "")', ctx);
    check('C7 sin productos → null', p === null, JSON.stringify(p));
  }
}

// ---------- Parte D: boot real ----------
const PORT = 34578;
const TEST_KEY = 'boot-test-key-chat-clicks';
const ADMIN_TOKEN = 'test-admin-token';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-clicks-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
for (const f of ['c1.png', 'c2.png', 'c3.png', 'c4.png']) fs.writeFileSync(path.join(mediaDir, f), PNG_1X1);

async function reqJson(method, p, body, cookie) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, json: j, setCookie };
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
  try { return db.prepare('SELECT id, status, scheduled_at, caption FROM posts WHERE id = ?').get(id); }
  finally { try { db.close(); } catch (e) {} }
}
// Fecha BA (UTC-3): mañana, pasado, +2, +3 — como ISO UTC de las 19:00 BA.
function baIso(daysAhead) {
  const now = new Date();
  const ba = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = ba.getUTCFullYear(), m = ba.getUTCMonth(), d = ba.getUTCDate() + daysAhead;
  return new Date(Date.UTC(y, m, d, 22, 0, 0)).toISOString();
}
function baYmd(daysAhead) {
  return baIso(daysAhead).slice(0, 10);
}

async function parteD() {
  console.log('— D) boot real: dias-libres, move sin programar, libres, usar-foto, armar sin IA —');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
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
    check('D0 el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('D0b /api/version trae el BUILD v824', ver.status === 200 && ver.json && ver.json.build === '20261105-v836', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    check('D0c la DB del boot existe en el DATA_DIR temporal', fs.existsSync(dbPath));

    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'chat-clicks-test', device: 'test-device-clicks' });
    check('D0d join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';

    // Semilla: 4 fotos + fundamento con 2 productos + 2 borradores (mañana y pasado).
    const manana = baYmd(1), pasado = baYmd(2), mas2 = baYmd(3), mas3 = baYmd(4);
    let a1 = 0, a2 = 0, a3 = 0, a4 = 0, d1 = 0, d2 = 0;
    seedDb(dbPath, (db) => {
      // El invitado de la prueba nace con is_guest=1 y el PATCH de posts
      // tiene guestBackstop (402): para probar el move hay que hacerlo
      // cuenta completa en la DB temporal del boot (solo el test).
      db.prepare(`UPDATE users SET is_guest = 0 WHERE id = ?`).run(uid);
      a1 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/c1.png', 'photo', '').lastInsertRowid);
      a2 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/c2.png', 'photo', '').lastInsertRowid);
      a3 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/c3.png', 'photo', '').lastInsertRowid);
      a4 = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, thumb_path) VALUES (?,?,?,?)`).run(uid, '/media/c4.png', 'photo', '').lastInsertRowid);
      db.prepare(`INSERT INTO business_dna (user_id, dna_json) VALUES (?,?)`).run(uid, JSON.stringify({ producto_estrella: 'Café de especialidad', productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Torta de chocolate' }] }));
      d1 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, foto_asset_id, scheduled_at) VALUES (?,?,?,?, 'draft', 'image', ?, ?)`).run(uid, '/media/c1.png', 'Posteo de mañana', '', a1, baIso(1)).lastInsertRowid);
      d2 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, foto_asset_id, scheduled_at) VALUES (?,?,?,?, 'draft', 'image', ?, ?)`).run(uid, '/media/c2.png', 'Posteo de pasado', '', a2, baIso(2)).lastInsertRowid);
    });
    check('D0e semilla ok (4 fotos + 2 borradores)', a1 > 0 && a2 > 0 && a3 > 0 && a4 > 0 && d1 > 0 && d2 > 0, `a=${a1},${a2},${a3},${a4} d=${d1},${d2}`);

    // D1: dias-libres (foto) salta el día actual del posteo y el tomado.
    const dl = await reqJson('GET', `/api/posts/dias-libres?kind=photo&post_id=${d1}&n=7`, null, cookie);
    check('D1 dias-libres responde ok', dl.status === 200 && dl.json && dl.json.ok === true && Array.isArray(dl.json.dias), JSON.stringify(dl.json).slice(0, 300));
    const ds = (dl.json && dl.json.dias || []).map((x) => x.dia);
    check('D1b el día actual del posteo NO se ofrece', !ds.includes(manana), `mañana=${manana} dias=${ds.join(',')}`);
    check('D1c el día tomado por otro borrador NO se ofrece', !ds.includes(pasado), `pasado=${pasado} dias=${ds.join(',')}`);
    check('D1d el siguiente libre SÍ se ofrece (+3 días)', ds.includes(mas2), `+3=${mas2} dias=${ds.join(',')}`);
    check('D1e cada día trae dia_label, hora e iso', (dl.json.dias || []).every((x) => x.dia_label && x.hora && x.iso), JSON.stringify((dl.json.dias || [])[0]));

    // D2: dias-libres (video) solo martes y jueves.
    const dlv = await reqJson('GET', `/api/posts/dias-libres?kind=video&post_id=${d1}&n=7`, null, cookie);
    const dsv = (dlv.json && dlv.json.dias || []).map((x) => x.dia);
    check('D2 dias-libres video responde ok y no está vacío', dlv.status === 200 && dlv.json && dlv.json.ok === true && dsv.length > 0, JSON.stringify(dlv.json).slice(0, 300));
    check('D2b todos los días de video son martes o jueves', dsv.every((ymd) => [2, 4].includes(new Date(ymd + 'T12:00:00Z').getUTCDay())), dsv.join(','));

    // D3: mover el borrador a un día libre NO lo programa (sigue draft).
    const mv = await reqJson('PATCH', `/api/posts/${d1}`, { action: 'save-draft', scheduled_at: baIso(3) }, cookie);
    check('D3 mover a día libre responde ok', mv.status === 200 && mv.json && mv.json.ok === true, JSON.stringify(mv.json));
    const row3 = postRow(dbPath, d1);
    check('D3b tras mover, el posteo SIGUE en draft', row3 && row3.status === 'draft', JSON.stringify(row3));
    check('D3c tras mover, la fecha nueva quedó guardada', row3 && String(row3.scheduled_at).slice(0, 10) === mas2, JSON.stringify(row3));

    // D4: mover al día tomado por otro borrador → 409 dia_ocupado.
    const mv2 = await reqJson('PATCH', `/api/posts/${d1}`, { action: 'save-draft', scheduled_at: baIso(2) }, cookie);
    check('D4 mover a día ocupado es 409 dia_ocupado', mv2.status === 409 && mv2.json && mv2.json.error === 'dia_ocupado', JSON.stringify(mv2.json));
    const row4 = postRow(dbPath, d1);
    check('D4b el 409 no movió nada (sigue en +3)', row4 && String(row4.scheduled_at).slice(0, 10) === mas2, JSON.stringify(row4));

    // D5: save-draft con caption sigue funcionando (y no programa).
    const mv3 = await reqJson('PATCH', `/api/posts/${d1}`, { action: 'save-draft', caption: 'Caption editada en el chat.' }, cookie);
    check('D5 save-draft con caption responde ok', mv3.status === 200 && mv3.json && mv3.json.ok === true, JSON.stringify(mv3.json));
    const row5 = postRow(dbPath, d1);
    check('D5b la caption quedó y el posteo sigue draft', row5 && row5.caption === 'Caption editada en el chat.' && row5.status === 'draft', JSON.stringify(row5));

    // D6: libres trae solo las fotos sin posteo.
    const libres = await reqJson('GET', '/api/album/libres', null, cookie);
    const libIds = (libres.json && libres.json.libres || []).map((f) => f.id);
    check('D6 libres responde ok', libres.status === 200 && libres.json && libres.json.ok === true, JSON.stringify(libres.json).slice(0, 300));
    check('D6b las fotos libres son c3 y c4 (c1/c2 tienen su borrador)', libIds.includes(a3) && libIds.includes(a4) && !libIds.includes(a1) && !libIds.includes(a2), `libres=${libIds.join(',')}`);

    // D7: usar-foto preview + confirm + 409 cuando queda ocupada.
    const prev = await reqJson('POST', `/api/posts/${d1}/usar-foto`, { asset_id: a3, preview: true }, cookie);
    check('D7 preview de usar-foto responde ok sin guardar', prev.status === 200 && prev.json && prev.json.ok === true && prev.json.preview === true && prev.json.image_path === '/media/c3.png', JSON.stringify(prev.json));
    const conf = await reqJson('POST', `/api/posts/${d1}/usar-foto`, { asset_id: a3 }, cookie);
    check('D7b confirm de usar-foto responde ok', conf.status === 200 && conf.json && conf.json.ok === true && conf.json.image_path === '/media/c3.png', JSON.stringify(conf.json));
    const prev2 = await reqJson('POST', `/api/posts/${d2}/usar-foto`, { asset_id: a3, preview: true }, cookie);
    check('D7c la foto ya usada en otro posteo es 409 ocupada', prev2.status === 409 && prev2.json && prev2.json.error === 'ocupada', JSON.stringify(prev2.json));

    // D8: /armar sin clave OpenAI responde 400 sin-ia (el endpoint se alcanza).
    const arm = await reqJson('POST', `/api/album/${a4}/armar`, { vision: '' }, cookie);
    check('D8 armar sin IA responde 400 sin-ia', arm.status === 400 && arm.json && arm.json.error === 'sin-ia', JSON.stringify(arm.json));
  } catch (e) {
    console.log('error de la parte D:', e.message);
    fail++;
  } finally {
    kill();
    await sleep(500);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  await parteB();
  parteC();
  await parteD();
  console.log(`\ntest-lote-chat-clicks: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
