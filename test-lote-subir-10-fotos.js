// test-lote-subir-10-fotos.js — LOTE SUBIR-10-FOTOS (base v778).
// Reportado por Valentino 7/11 21:03 con captura: aprieta el botón de
// "subir foto" en el chat y el picker del sistema le deja elegir, pero
// solo suben 4 en silencio. Causa: chatUploadPhotos cortaba a 4 con
// .slice(0, 4) sin avisar. El 10 es el máximo de un carrusel de IG.
// Fix: tope 10 + aviso claro en el chat cuando sobran o cuando algún
// archivo no era foto/video; HEIC de iPhone (type vacío) no se descarta
// en silencio ni en el chat ni en el álbum (#mediaFiles usaba
// f.type.startsWith y lo tiraba sin decir nada); mismo picker #chatFile
// en escritorio (Finder/Explorer) con multi-selección hasta 10.
// La burbuja «✦ veo ...» de la captura es un mensaje VIEJO (pre-v757,
// guardado en chat_messages y re-renderizado del historial): el código
// v778 ya no la compone (B11 lo verifica) — no es fuga viva.
// Parte A: servidor real (contrato HEIC). Parte B: chatUploadPhotos +
// helper + handler del álbum en vm con stubs. Parte C: auditoría de
// funciones. Parte D: checks estáticos (tope, filtro álbum, triggers
// del picker en escritorio, sin «✦ veo»).
// Uso: node test-lote-subir-10-fotos.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const DIR = TREE;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 500) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Parte A: servidor real ----------
const PORT = 34564;
const TEST_KEY = 'boot-test-key-subir10';
const ADMIN_TOKEN = 'test-admin-token-subir10';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subir10-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
// PNG 1x1 válido (bytes reales de imagen; la etiqueta HEIC es del header).
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function reqRaw(p, body, contentType, cookie) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: 'POST', headers, body });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
async function reqJson(method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}

async function parteA() {
  console.log('— A) servidor: contrato HEIC en /api/media y /api/assets —');
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
    check('A0 el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'subir10-test', device: 'test-device-subir10' });
    check('A0b join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';

    // A1: HEIC con Content-Type image/heic se normaliza a JPEG y sube.
    const heic = await reqRaw('/api/media', PNG_1X1, 'image/heic', cookie);
    check('A1 /api/media con image/heic sube y normaliza a .jpg', heic.status === 200 && heic.json && typeof heic.json.path === 'string' && heic.json.path.endsWith('.jpg'), JSON.stringify(heic.json));
    // A2: octet-stream NO lo parsea express.raw (por eso el cliente debe
    // mandar el mime real, no application/octet-stream).
    const oct = await reqRaw('/api/media', PNG_1X1, 'application/octet-stream', cookie);
    check('A2 /api/media con application/octet-stream da 400', oct.status === 400, JSON.stringify(oct.json));
    // A3: el álbum (/api/assets) también acepta image/heic.
    const ass = await reqRaw('/api/assets?kind=photo', PNG_1X1, 'image/heic', cookie);
    check('A3 /api/assets con image/heic sube ok', ass.status === 200 && ass.json && ass.json.ok === true, JSON.stringify(ass.json));
    // A4: bytes ilegibles no pierden la subida (fallback histórico).
    const bas = await reqRaw('/api/media', Buffer.from('esto no es una imagen', 'utf8'), 'image/png', cookie);
    check('A4 /api/media con bytes rotos igual responde 200 (fallback)', bas.status === 200 && bas.json && typeof bas.json.path === 'string', JSON.stringify(bas.json));
  } finally { kill(); }
}

// ---------- Utilidades vm ----------
function sliceFn(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('no se encontró: ' + startMarker);
  const j = endMarker ? src.indexOf(endMarker, i + startMarker.length) : src.length;
  if (j < 0) throw new Error('no se encontró fin: ' + endMarker);
  return src.slice(i, j);
}
function escFn(src) {
  // La definición global de esc: `const esc = (s) => ...` en la línea 4.
  const m = src.match(/^const esc = \(s\) => [^\n]*\n/m);
  if (!m) throw new Error('no se encontró esc global');
  return m[0];
}
class FakeEl {
  constructor(sel) {
    this.sel = sel;
    this._html = '';
    this.value = '';
    this.disabled = false;
    this.files = [];
    this.onclick = null;
    this.onchange = null;
    this.writes = [];
  }
  set innerHTML(v) { this._html = String(v); this.writes.push(String(v)); }
  get innerHTML() { return this._html; }
  insertAdjacentHTML(pos, html) { this.writes.push(String(html)); this._html += String(html); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  remove() {}
}
function makeFiles(n, kind) {
  // kind: 'photo' | 'video' | 'heic' | 'heicUpper' | 'pdf' | 'mix'
  const out = [];
  for (let i = 0; i < n; i++) {
    if (kind === 'video' && i === n - 1) out.push({ name: 'clip.mp4', type: 'video/mp4', size: 1000 });
    else if (kind === 'heic') out.push({ name: 'IMG_00' + (i + 1) + '.HEIC', type: '', size: 1000 });
    else if (kind === 'heicUpper') out.push({ name: 'IMG_00' + (i + 1) + '.HEIC', type: 'image/heic', size: 1000 });
    else if (kind === 'pdf') out.push({ name: 'doc.pdf', type: 'application/pdf', size: 1000 });
    else out.push({ name: 'foto-' + (i + 1) + '.jpg', type: 'image/jpeg', size: 1000 });
  }
  return out;
}

async function parteB() {
  console.log('— B) chatUploadPhotos + helper + álbum en vm —');
  const appSrc = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
  const escSrc = escFn(appSrc);
  const kindSrc = sliceFn(appSrc, 'function pzSftKind(f) {', 'function pzSftHuella(f)');
  const medioSrc = sliceFn(appSrc, 'function pzSftEsArchivoMedio(f) {', 'function pzSftCoverItem()');
  const tSrc = sliceFn(appSrc, 'function pzSftT(es, en) {', 'function pzSftEtiqueta(c)');
  const enSrc = sliceFn(appSrc, 'function pzSftEn() {', 'function pzSftT(es, en)');
  let partirSrc = '';
  try { partirSrc = sliceFn(appSrc, 'const CHAT_FOTOS_MAX', 'async function chatUploadPhotos(files) {'); } catch (e) { partirSrc = ''; }
  const chatUpSrc = sliceFn(appSrc, 'async function chatUploadPhotos(files) {', '// Estilos disponibles para los ejemplos');
  const saySrc = sliceFn(appSrc, 'function chatSay(text) {', '// Opciones tocables que propone la IA');
  const renderPhotosSrc = sliceFn(appSrc, 'function renderChatPhotos() {', "// Miniatura liviana (para que la IA");

  function buildSandbox(lang) {
    const els = {};
    const said = [];
    const fetched = [];
    const getEl = (sel) => (els[sel] || (els[sel] = new FakeEl(sel)));
    const sandbox = {
      console,
      ME: { lang: lang || 'es' },
      CHAT: [],
      CHAT_PHOTOS: [],
      CHAT_IDEA: null,
      CHAT_PHOTO_IDX: 0,
      PZ_SFT_CHAT_START: 0,
      PZ_SFT_COLA: [],
      ASSETS: [],
      MC_ISSUE_ES: {},
      fetched,
      $: (sel) => getEl(sel),
      $$: () => [],
      document: { getElementById: (id) => getEl('#' + id), querySelectorAll: () => [] },
      fetch: async (url, opts) => {
        fetched.push({ url: String(url), headers: (opts && opts.headers) || {}, method: (opts && opts.method) || 'GET' });
        const isVid = String(url).includes('kind=video');
        return { ok: true, status: 200, json: async () => ({ path: isVid ? '/media/v.mp4' : '/media/f.jpg', ok: true, id: 1 }) };
      },
      fileToThumb: async () => null,
      fileToVideoThumb: async () => null,
      renderChatPreviews: () => {},
      renderChatStoryboard: () => {},
      chatUpdateSendBtn: () => {},
      pzSftDespuesDeSubirChat: () => { sandbox._despues = true; },
      pzIc: () => '',
      postyNotify: () => {},
      chatMsgHtml: (role, text) => '<div>' + String(text) + '</div>',
      chatScroll: () => {},
      AbortSignal: { timeout: () => ({}) },
      api: { get: async () => [], post: async () => ({ ok: true }) },
      mcEn: () => (lang || 'es') === 'en',
      mcAlbumToolsBind: () => {},
      mcPaintBadges: () => {},
      render: () => {},
      _despues: false,
      _els: els,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const boot = escSrc + '\n' + enSrc + '\n' + tSrc + '\n' + kindSrc + '\n' + medioSrc + '\n'
      + (partirSrc ? partirSrc + '\n' : '')
      + renderPhotosSrc + '\n' + saySrc + '\n' + chatUpSrc;
    vm.runInContext(boot, sandbox, { filename: 'chat-upload-vm.js' });
    return sandbox;
  }
  // Nota: los File-like se pasan por el contexto vm vía __files.
  function said(sb) { return sb.CHAT.filter((m) => m.role === 'assistant').map((m) => m.text); }
  async function uploadWith(sb, files) {
    sb.__files = files;
    await vm.runInContext('chatUploadPhotos(__files)', sb);
    return sb;
  }

  // B1: 10 fotos → suben 10, sin aviso de sobra.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(10, 'photo'));
    check('B1 elegir 10 fotos → suben 10 y se ven en el chat', sb.fetched.length === 10 && sb.CHAT_PHOTOS.length === 10, `fetch=${sb.fetched.length} photos=${sb.CHAT_PHOTOS.length}`);
    check('B1b el conteo dice "10 fotos"', sb._els['#chatMsg'] && sb._els['#chatMsg'].writes.some((w) => w.includes('10 fotos')), JSON.stringify(sb._els['#chatMsg'] ? sb._els['#chatMsg'].writes : []));
    check('B1c sin aviso de sobra al elegir justo 10', !said(sb).some((t) => /primeras 10|no entraron/i.test(t)), JSON.stringify(said(sb)));
    check('B1d "📸 agregado!" se muestra', said(sb).some((t) => t.includes('📸 agregado')), JSON.stringify(said(sb)));
  }
  // B2: 12 fotos → 10 + aviso claro.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(12, 'photo'));
    check('B2 elegir 12 fotos → suben solo 10', sb.fetched.length === 10 && sb.CHAT_PHOTOS.length === 10, `fetch=${sb.fetched.length} photos=${sb.CHAT_PHOTOS.length}`);
    check('B2b avisa claro "elegiste 12, subo las primeras 10"', said(sb).some((t) => t.includes('elegiste 12') && t.includes('primeras 10')), JSON.stringify(said(sb)));
  }
  // B2-EN: el aviso sale en inglés.
  {
    const sb = buildSandbox('en');
    await uploadWith(sb, makeFiles(12, 'photo'));
    check('B2c en inglés el aviso dice "you picked 12" + "first 10"', said(sb).some((t) => /you picked 12/i.test(t) && /first 10/i.test(t)), JSON.stringify(said(sb)));
  }
  // B3: 1 foto → 1.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(1, 'photo'));
    check('B3 elegir 1 foto → sube 1, sin aviso', sb.fetched.length === 1 && sb.CHAT_PHOTOS.length === 1 && !said(sb).some((t) => /primeras 10|no entraron/i.test(t)), `fetch=${sb.fetched.length}`);
  }
  // B4: 9 fotos + 1 video → 10, conteo bien, video por su puerta.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(10, 'video'));
    check('B4 9 fotos y 1 video → 10 subidas, el video va a /api/assets?kind=video', sb.fetched.length === 10 && sb.fetched.some((f) => String(f.url).includes('/api/assets?kind=video')) && sb.fetched.filter((f) => String(f.url) === '/api/media?from=chat').length === 9, JSON.stringify(sb.fetched.map((f) => f.url)));
    check('B4b el conteo dice "9 fotos y 1 video"', sb._els['#chatMsg'] && sb._els['#chatMsg'].writes.some((w) => w.includes('9 fotos y 1 video')), JSON.stringify(sb._els['#chatMsg'] ? sb._els['#chatMsg'].writes : []));
  }
  // B5: HEIC con type vacío → se acepta y se manda como image/heic.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(3, 'heic'));
    check('B5 HEIC con type vacío (biblioteca iPhone) → sube como image/heic', sb.fetched.length === 3 && sb.fetched.every((f) => f.headers['Content-Type'] === 'image/heic'), JSON.stringify(sb.fetched.map((f) => f.headers)));
    check('B5b HEIC no se descarta en silencio (3 fotos en el chat)', sb.CHAT_PHOTOS.length === 3, `photos=${sb.CHAT_PHOTOS.length}`);
  }
  // B6: HEIC con type image/heic → también sube.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(2, 'heicUpper'));
    check('B6 HEIC con type image/heic → sube', sb.fetched.length === 2 && sb.CHAT_PHOTOS.length === 2, `fetch=${sb.fetched.length}`);
  }
  // B7: archivo que no es medio → se avisa, no se traga en silencio.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, [...makeFiles(2, 'photo'), { name: 'doc.pdf', type: 'application/pdf', size: 10 }]);
    check('B7 2 fotos + 1 pdf → suben 2 y se avisa del pdf', sb.fetched.length === 2 && said(sb).some((t) => /no era foto ni video|no eran fotos ni videos/i.test(t)), JSON.stringify(said(sb)));
  }
  // B8: solo archivos no-medios → error claro, 0 subidas.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(1, 'pdf'));
    check('B8 solo un pdf → 0 subidas y error claro en #chatMsg', sb.fetched.length === 0 && sb._els['#chatMsg'] && sb._els['#chatMsg'].writes.some((w) => w.includes('No pude usar esos archivos')), JSON.stringify(sb._els['#chatMsg'] ? sb._els['#chatMsg'].writes : []));
  }
  // B9: 13 elegidas (12 válidas + 1 pdf) → 10 + aviso de sobra y del pdf.
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, [...makeFiles(12, 'photo'), { name: 'doc.pdf', type: 'application/pdf', size: 10 }]);
    check('B9 12 válidas + 1 pdf → 10 subidas y aviso de ambas cosas', sb.fetched.length === 10 && said(sb).some((t) => t.includes('primeras 10')) && said(sb).some((t) => /no era foto ni video/i.test(t)), JSON.stringify(said(sb)));
  }
  // B10: el helper parte bien (sin tope = todo lo válido).
  {
    const sb = buildSandbox('es');
    let r = null, r2 = null, rErr = '';
    try { r = vm.runInContext(`pzSftPartirMedios([{name:'a.jpg',type:'image/jpeg'},{name:'b.HEIC',type:''},{name:'c.pdf',type:'application/pdf'}])`, sb); } catch (e) { rErr = e.message; }
    check('B10 helper: 2 válidas (HEIC vacío incluido) + 1 descartada', r && r.items.length === 2 && r.descartadas === 1 && r.elegidas === 2, r ? JSON.stringify(r) : rErr);
    try { r2 = vm.runInContext(`pzSftPartirMedios(${JSON.stringify(makeFiles(12, 'photo').map((f) => ({ name: f.name, type: f.type })))}, 10)`, sb); } catch (e) { rErr = e.message; }
    check('B10b helper con tope 10: 12 → 10 + sobran 2', r2 && r2.items.length === 10 && r2.sobran === 2, r2 ? JSON.stringify(r2) : rErr);
  }
  // B11: ninguna burbuja trae la visión cruda (fuga v757, no viva).
  {
    const sb = buildSandbox('es');
    await uploadWith(sb, makeFiles(10, 'photo'));
    await uploadWith(sb, makeFiles(12, 'photo'));
    check('B11 ningún mensaje del flujo trae «✦ veo»', !said(sb).some((t) => t.includes('✦ veo')), JSON.stringify(said(sb)));
  }
  // B12: el handler del álbum usa el mismo filtro (dinámica con vm).
  {
    const appSrc2 = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
    const bindSrc = sliceFn(appSrc2, 'function bindMediaCard() {', 'function mcAlbumToolsBind()');
    const sb = buildSandbox('es');
    // Stubs propios del álbum dentro del mismo sandbox.
    sb.$ = (sel) => sb._els[sel] || (sb._els[sel] = new FakeEl(sel));
    sb.$$ = () => [];
    vm.runInContext(bindSrc, sb, { filename: 'bind-media-vm.js' });
    vm.runInContext('bindMediaCard()', sb);
    const inp = sb._els['#mediaFiles'];
    const add = sb._els['#btnMediaAdd'];
    // #mediaMsg se crea perezoso dentro del onchange: leerlo al momento.
    const msgEl = () => sb._els['#mediaMsg'];
    // Caso 1: 2 HEIC con type vacío → se suben (antes se tiraban en silencio).
    inp.files = makeFiles(2, 'heic');
    await inp.onchange();
    const subidosAlbum = () => sb.fetched.filter((f) => String(f.url).startsWith('/api/assets'));
    const msgHtml = () => (msgEl() && msgEl().innerHTML) || '';
    check('B12 álbum: 2 HEIC con type vacío → se suben (no se tiran)', subidosAlbum().length === 2, JSON.stringify(sb.fetched.map((f) => f.url + ' ' + JSON.stringify(f.headers))));
    check('B12b álbum: el HEIC va con Content-Type image/heic (no octet-stream)', subidosAlbum().length === 2 && subidosAlbum().every((f) => f.headers['Content-Type'] === 'image/heic'), JSON.stringify(sb.fetched.map((f) => f.headers)));
    check('B12c álbum: mensaje de éxito "2 agregados"', msgHtml().includes('2 agregados'), msgHtml());
    // Caso 2: solo un pdf → mensaje claro, 0 subidas.
    const before = sb.fetched.length;
    inp.files = makeFiles(1, 'pdf');
    await inp.onchange();
    check('B12d álbum: solo un pdf → 0 subidas y mensaje claro', sb.fetched.length === before && /No pude usar esos archivos/.test(msgHtml()), msgHtml());
    // Caso 3: 2 fotos + 1 pdf → suben 2 y se avisa del pdf.
    inp.files = [...makeFiles(2, 'photo'), { name: 'doc.pdf', type: 'application/pdf', size: 10 }];
    await inp.onchange();
    check('B12e álbum: 2 fotos + 1 pdf → suben 2 y se avisa del pdf', subidosAlbum().length === 4 && /no era foto ni video/.test(msgHtml()), msgHtml());
  }
}

// ---------- Parte C: auditoría de funciones ----------
function parteC() {
  console.log('— C) auditoría de funciones llamadas desde las superficies tocadas —');
  const appSrc = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
  const needed = ['pzSftEsArchivoMedio', 'pzSftKind', 'pzSftT', 'pzSftPartirMedios', 'pzSftAvisoSubida', 'pzSftEn',
    'esc', 'renderChatPhotos', 'renderChatPreviews', 'renderChatStoryboard', 'chatSay',
    'pzSftDespuesDeSubirChat', 'fileToThumb', 'fileToVideoThumb', 'chatUploadPhotos',
    'bindMediaCard', 'mcEn', 'pzIc'];
  const missing = needed.filter((n) => !new RegExp(`function ${n}\\s*\\(|(?:var|const|let) ${n}\\s*=`).test(appSrc));
  check(`C1 funciones auditadas: ${needed.length - missing.length}/${needed.length}`, missing.length === 0, 'faltan: ' + missing.join(', '));
}

// ---------- Parte D: checks estáticos ----------
function parteD() {
  console.log('— D) estáticos: tope, filtro álbum, picker escritorio, sin visión —');
  const appSrc = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
  const chatUp = sliceFn(appSrc, 'async function chatUploadPhotos(files) {', '// Estilos disponibles para los ejemplos');
  check('D1 chatUploadPhotos ya no corta a 4 en silencio', !/slice\(0, 4\)/.test(chatUp), chatUp.slice(0, 200));
  check('D2 el tope es 10 (const CHAT_FOTOS_MAX = 10 y se usa en el chat)', /const CHAT_FOTOS_MAX\s*=\s*10/.test(appSrc) && /pzSftPartirMedios\(files,\s*CHAT_FOTOS_MAX\)/.test(chatUp), chatUp.slice(0, 300));
  check('D3 chatUploadPhotos llama a pzSftAvisoSubida y el aviso dice "primeras 10"', /pzSftAvisoSubida\(partes\)/.test(chatUp) && /primeras 10/.test(appSrc), '');
  const sinComent = (t) => t.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check('D4 pzSftChatProponer no compone «✦ veo» (código, sin comentarios)', !/✦ veo/.test(sinComent(sliceFn(appSrc, 'async function pzSftChatProponer() {', '/* Un toque aprueba'))), '');
  const bind = sliceFn(appSrc, 'function bindMediaCard() {', 'function mcAlbumToolsBind()');
  check('D5 el álbum usa el helper pzSftPartirMedios (no f.type.startsWith)', /pzSftPartirMedios\(inp\.files\)/.test(bind) && !/f\.type\.startsWith\('image\/'\)/.test(bind), '');
  check('D6 el álbum manda el mime de pzSftKind (no octet-stream)', /pzSftKind\(f\)\.mime/.test(bind) && !/application\/octet-stream/.test(bind), '');
  check('D7 el álbum avisa cuando nada es usable', /No pude usar esos archivos/.test(bind), '');
  const input = appSrc.match(/<input type="file" id="chatFile"[^>]*>/);
  check('D8 #chatFile tiene multiple + accept image/*,video/*', !!input && /multiple/.test(input[0]) && /image\/\*,video\/\*/.test(input[0]), input ? input[0] : 'sin input');
  const triggers = [
    /chatPhotoDelegar[\s\S]{0,800}picker\.click\(\)/,
    /pzDockMas[\s\S]{0,600}#chatFile/,
    /document\.getElementById\(['"]chatFile['"]\)/,
  ];
  check('D9 la camarita y el dock disparan el MISMO picker #chatFile (móvil y escritorio)', triggers.every((re) => re.test(appSrc)), '');
  check('D10 bindChat conecta #chatFile.onchange → chatUploadPhotos', /file\.onchange\s*=\s*\(\)\s*=>\s*\{\s*chatUploadPhotos\(file\.files\)/.test(appSrc), '');
  const serverSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
  const retPropuesta = sliceFn(serverSrc, 'return { headline, caption, hashtags, tag: asset.album_tag', ';');
  check('D11 la propuesta del servidor no devuelve la visión al cliente', /NUNCA viaja al cliente/.test(serverSrc) && !/vision/i.test(retPropuesta), retPropuesta);
}

(async () => {
  try {
    await parteA();
    await parteB();
    parteC();
    parteD();
  } catch (e) {
    console.error('ERROR DE HARNESS:', e);
    fail++;
    fails.push('harness: ' + (e && e.message));
  }
  console.log(`\nSUBIR-10-FOTOS: ${pass} ok / ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
