#!/usr/bin/env node
// test-lotesubirfototodo.js — LOTE SUBIR-FOTO-TODO: subir fotos con las
// 24 mejoras, en la app real, sin que subir cree un posteo solo.
// Regla madre: una foto subida NUNCA genera titular/caption ni posteo
// hasta elegir con un toque; la propuesta se muestra ANTES de crear.
// Uso: node test-lotesubirfototodo.js   (desde la raíz del árbol)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
};
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

function extractFn(src, name) {
  const i = src.indexOf('function ' + name);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  if (open < 0) return null;
  let d = 0, q = null, esc = false;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (q) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const app = read('public/app.js');
const srv = read('server.js');
const db = read('db.js');
const css = read('public/styles.css');
const aju = read('public/chunk-ajustes.js');

console.log('== servidor: se cierra el festejo automático ==');
ok('sin llamada a celebratePhotoPost en la subida', !srv.includes('celebratePhotoPost(uid, assetId, filePath);'));
ok('sin llamada a celebrateVideoPost en la subida', !srv.includes('celebrateVideoPost(uid, ing.id, ing.path);'));
ok('definiciones del festejo quedan sin llamadores en la subida (código muerto documentado)', count(srv, 'celebratePhotoPost(') >= 1 && !srv.includes('celebratePhotoPost(uid, assetId, filePath);'));
ok('db: columna upload_choice', db.includes('ADD COLUMN upload_choice TEXT'));
ok('db: columna album_vision', db.includes('ADD COLUMN album_vision TEXT'));
ok('db: columna sft_default', db.includes('ADD COLUMN sft_default TEXT'));
ok('album GET incluye upload_choice y album_vision', srv.includes('upload_choice, album_vision FROM assets'));

console.log('== servidor: endpoints nuevos ==');
ok('POST /api/album/carrusel', srv.includes("app.post('/api/album/carrusel'"));
ok('POST /api/album/:id/choice', srv.includes("app.post('/api/album/:id/choice'"));
ok('POST /api/album/:id/vision', srv.includes("app.post('/api/album/:id/vision'"));
ok('POST /api/album/:id/propuesta', srv.includes("app.post('/api/album/:id/propuesta'"));
ok('POST /api/album/:id/crear', srv.includes("app.post('/api/album/:id/crear'"));
ok('GET /api/posts/:id/rendimiento', srv.includes("app.get('/api/posts/:id/rendimiento'"));
ok('GET/POST /api/settings/fotos-default', srv.includes("app.get('/api/settings/fotos-default'") && srv.includes("app.post('/api/settings/fotos-default'"));
ok('albumCrearFoto (texto aprobado, sin gate semanal)', srv.includes('async function albumCrearFoto'));
ok('albumPropuesta (solo texto, sin insert)', srv.includes('async function albumPropuesta'));
ok('albumCrearFoto: gate duro cortada sin acepta', srv.includes("issues.includes('cortada') && !(approved && approved.acepta)"));
ok('carrusel: insert con carousel_paths y needs_review 1', srv.includes("media_type, carousel_paths, needs_review, source, week_key, tipo, strategy_why") || srv.includes("'draft', 'carousel'"));
ok('video: texto aprobado salta la generación', srv.includes('if (over && over.caption)'));
ok('video: ánimo del cliente (upbeat/chill/groove)', srv.includes("['upbeat', 'chill', 'groove'].includes(String(over.mood"));
ok('video: archivo procesado', srv.includes('over.procesadoAbs'));
ok('video: silenceremove real', srv.includes('silenceremove=start_periods=1'));
ok('video: cámara lenta setpts con tope 90s', srv.includes('setpts=2.0*PTS') && srv.includes('dur * 2 <= 90'));
ok('video: lenta no aplicada se devuelve (nunca en silencio)', srv.includes("lenta = 'no-aplicada-duracion'"));
ok('rendimiento: lee post_metrics (likes/comments/reach)', srv.includes('pm.likes AS likes') && srv.includes('pm.reach AS reach'));
ok('staging fusionado: endpoints staging presentes', srv.includes("app.post('/api/staging/analizar'") && srv.includes("app.post('/api/staging/elegir'"));

console.log('== cliente: pantalla de subir fotos ==');
const fns = ['pzSftAbrir', 'pzSftCerrar', 'pzSftSel', 'pzSftQuitar', 'pzSftAplicar', 'pzSftAplicarTodas', 'pzSftDecidoDespues', 'pzSftIrAPropuesta', 'pzSftOtraVersion', 'pzSftPedirCambio', 'pzSftAprobar', 'pzSftVerBorrador', 'pzSftRendimiento', 'pzSftEscena', 'pzSftElegirEscena', 'pzSftEscenaCarrusel', 'pzSftPendientes', 'pzSftPicker', 'pzSftPickerGo', 'pzSftDespuesDeSubir', 'pzSftDespuesDeSubirChat', 'pzSftColaReintentar', 'pzSftEncolar', 'pzSftGuardarDefault', 'pzSftModoCarrusel', 'pzSftMoverOrden', 'pzSftSetCover', 'pzSftIrAPropuestaCarrusel', 'pzSftMic', 'pzSftRecomendar', 'pzSftKind', 'pzSftMover', 'pzSftAnimoAMood'];
for (const f of fns) ok('app: función ' + f, app.includes('function ' + f));
ok('pantalla 1: elegir', app.includes('pzSftHTMLElegir'));
ok('pantalla 2: propuesta', app.includes('pzSftHTMLPropuesta'));
ok('pantalla éxito: Ver borrador', app.includes('pzSftHTMLExito') && app.includes('Ver borrador'));
ok('renombre: Solo guardarla', app.includes('Solo guardarla'));
ok('renombre: Usarla en la semana', app.includes('Usarla en la semana'));
ok('renombre: etiquetas viejas ausentes del bundle', !app.includes('Así nomás') && !app.includes('Guardala para la semana'));
ok('promesa vieja ausente: convirtiendo en un posteo', !app.includes('convirtiendo en un posteo'));
ok('misión del álbum actualizada', app.includes('Posty te pregunta qué hacer con ella.'));
ok('álbum: botón Pendientes de decidir', app.includes('albumPendientesBtn'));
ok('álbum: botón picker del álbum', app.includes('albumPickerBtn'));
ok('wire: onDone va por la pantalla (no a los 2,5 s)', app.includes('pzSftDespuesDeSubir(subidos, { onDone })'));
ok('chat: filtro por extensión, nunca mudo', app.includes('pzSftEsArchivoMedio(f)'));
ok('chat: se guarda el File original', app.includes('file: f }') || app.includes('file: f}'));
ok('chat: pregunta tras subir', app.includes('pzSftDespuesDeSubirChat()'));
ok('chat: hook texto-como-instrucción en chatSend', app.includes('pzSftChatTexto(sendText)'));
ok('entrada directa: nuevas funciones', ['pzSftChatProponer', 'pzSftChatAprobar', 'pzSftChatOpciones', 'pzSftChatDespues', 'pzSftChatTexto', 'pzSftFotoAlChat', 'pzSftChatMejorUso'].every((f) => app.includes('function ' + f)));
ok('entrada directa: pzSftDespuesDeSubirChat redefinido (viejo + nuevo, manda el nuevo)', count(app, 'async function pzSftDespuesDeSubirChat') === 2);
ok('entrada directa: pzSftCerrar redefinido con origen chat', count(app, 'function pzSftCerrar()') === 2 && app.includes('st.origen === "chat"'));
ok('entrada directa: dock + ya no abre el picker del Álbum', !app.includes('plus.onclick = clickUp') && app.includes('plus.onclick = pzSftMzPlus'));
ok('entrada directa: botones del chat (Aprobar/Otras/Decido)', app.includes('pzSftChatAprobar()') && app.includes('pzSftChatOpciones()') && app.includes('pzSftChatDespues()'));
ok('entrada directa: pantalla elegir sigue viva (Otras opciones / Álbum)', app.includes('pzSftHTMLElegir') && app.includes('pzSftChatOpciones'));
ok('propuesta: checkbox fecha/marca quemada', app.includes('pzSftFechaMarca') && app.includes('pzSftFechaCheck'));
ok('carrusel: quitar la portada no deja cover fuera de rango', app.includes('if (PZ_SFT.cover >= PZ_SFT.orden.length)'));
ok('gate: marcaQuemada bloquea aprobar', app.includes('it.marcaQuemada') && app.includes('it.caraSinPermiso || it.marcaQuemada'));
ok('voz: SpeechRecognition en la corrección de visión', app.includes('SpeechRecognition') && app.includes('pzSftMic'));
ok('magia solo en la entrada (clase pz-sft-magia)', app.includes('pz-sft-magia'));
ok('campo 17px en la pantalla (sin zoom iOS)', app.includes('font-size:17px'));

console.log('== Ajustes + estilos ==');
ok('Ajustes: select Cuando subo fotos', aju.includes('sftDefaultSel'));
ok('Ajustes: lee y guarda fotos-default', aju.includes("/api/settings/fotos-default"));
ok('CSS: tarjeta glass celeste', css.includes('.pz-sft-card'));
ok('CSS: magia con reduced-motion', css.includes('.pz-sft-magia') && css.includes('prefers-reduced-motion: reduce'));

console.log('== M78: toda función llamada desde la UI existe definida ==');
const llamados = new Set();
// valores de atributos on* (con escape \" o sin él) + handlers pasados
// como string a constructores de tarjetas + onclick asignado en JS.
for (const m of app.matchAll(/on(?:click|change|input|blur|focus)\s*=\s*\\?"((?:[^"\\]|\\.)*?)"/g)) {
  for (const n of m[1].matchAll(/(pzSft\w+)\s*\(/g)) llamados.add(n[1]);
}
for (const m of app.matchAll(/\.onclick\s*=\s*\(\)\s*=>\s*\{[^}]*?(pzSft\w+)\s*\(/g)) llamados.add(m[1]);
for (const m of app.matchAll(/"(pzSft\w+)\s*\(/g)) llamados.add(m[1]);
let m78ok = true;
for (const f of llamados) {
  if (!app.includes('function ' + f)) { m78ok = false; console.log('  ✗ M78 sin definir:', f); }
}
ok('M78: ' + llamados.size + '/' + llamados.size + ' funciones UI definidas', m78ok && llamados.size >= 30, 'llamados=' + [...llamados].join(','));

console.log('== lógica pura en VM ==');
const helpers = ['pzSftEn', 'pzSftT', 'pzSftEtiqueta', 'pzSftIssueTexto', 'pzSftTagTexto', 'pzSftKind', 'pzSftHuella', 'pzSftMover', 'pzSftAnimoAMood', 'pzSftRecomendar', 'pzSftChatMejorUso'];
let code = '';
for (const h of helpers) {
  const fn = extractFn(app, h);
  ok('extrae ' + h, !!fn);
  if (fn) code += fn + '\n';
}
const sandbox = { ME: { lang: 'es' }, localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = v; } }, console };
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox);
  ok('etiqueta ES guardar', sandbox.pzSftEtiqueta('guardar') === 'Solo guardarla');
  ok('etiqueta ES semana', sandbox.pzSftEtiqueta('semana') === 'Usarla en la semana');
  ok('etiqueta ES armar', sandbox.pzSftEtiqueta('armar') === 'Que Posty lo arme');
  ok('etiqueta ES despues', sandbox.pzSftEtiqueta('despues') === 'Decido después');
  sandbox.ME.lang = 'en';
  ok('etiqueta EN guardar', sandbox.pzSftEtiqueta('guardar') === 'Just save it');
  ok('etiqueta EN semana', sandbox.pzSftEtiqueta('semana') === 'Use it for the week');
  sandbox.ME.lang = 'es';
  ok('kind HEIC sin type', (() => { const k = sandbox.pzSftKind({ name: 'foto.HEIC', type: '' }); return k.kind === 'photo' && k.mime === 'image/heic'; })());
  ok('kind MOV sin type', (() => { const k = sandbox.pzSftKind({ name: 'vid.mov', type: '' }); return k.kind === 'video' && k.mime === 'video/quicktime'; })());
  ok('kind jpg con type', (() => { const k = sandbox.pzSftKind({ name: 'a.jpg', type: 'image/jpeg' }); return k.kind === 'photo'; })());
  ok('kind mp4 con type', (() => { const k = sandbox.pzSftKind({ name: 'a.mp4', type: 'video/mp4' }); return k.kind === 'video'; })());
  ok('mover atrás', JSON.stringify(sandbox.pzSftMover(['a', 'b', 'c'], 1, -1)) === JSON.stringify(['b', 'a', 'c']));
  ok('mover adelante', JSON.stringify(sandbox.pzSftMover(['a', 'b', 'c'], 1, 1)) === JSON.stringify(['a', 'c', 'b']));
  ok('mover fuera de rango no cambia', JSON.stringify(sandbox.pzSftMover(['a', 'b'], 0, -1)) === JSON.stringify(['a', 'b']));
  ok('ánimo alegre→upbeat', sandbox.pzSftAnimoAMood('alegre') === 'upbeat');
  ok('ánimo tranquilo→chill', sandbox.pzSftAnimoAMood('tranquilo') === 'chill');
  ok('ánimo enérgico→groove', sandbox.pzSftAnimoAMood('energetico') === 'groove');
  ok('recomienda: duplicada→guardar', sandbox.pzSftRecomendar({ tag: 'producto', issues: [], duplicada: true }, 'preguntar').choice === 'guardar');
  ok('recomienda: cortada→guardar', sandbox.pzSftRecomendar({ tag: 'producto', issues: ['cortada'], duplicada: false }, 'preguntar').choice === 'guardar');
  ok('recomienda: oscura→guardar', sandbox.pzSftRecomendar({ tag: '', issues: ['oscura'], duplicada: false }, 'preguntar').choice === 'guardar');
  ok('recomienda: producto limpio→armar', sandbox.pzSftRecomendar({ tag: 'producto', issues: [], duplicada: false }, 'preguntar').choice === 'armar');
  ok('recomienda: default semana sin señales→semana', sandbox.pzSftRecomendar({ tag: '', issues: [], duplicada: false }, 'semana').choice === 'semana');
  ok('recomienda: sin señales y preguntar→null', sandbox.pzSftRecomendar({ tag: '', issues: [], duplicada: false }, 'preguntar') === null);
  ok('recomienda: porqué real en duplicada', sandbox.pzSftRecomendar({ tag: '', issues: [], duplicada: true }, 'preguntar').why.indexOf('antes') >= 0);
  ok('entrada directa: sin recomendación el mejor uso es armar', sandbox.pzSftChatMejorUso(null).choice === 'armar');
  ok('entrada directa: con recomendación se respeta', sandbox.pzSftChatMejorUso({ choice: 'guardar', why: 'x' }).choice === 'guardar');
} catch (e) {
  ok('VM de helpers sin errores', false, e.message);
}

console.log(`\nTOTAL: ${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);
