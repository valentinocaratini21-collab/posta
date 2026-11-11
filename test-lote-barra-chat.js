// test-lote-barra-chat.js — LOTE BARRA-CHAT v903 (11/11 · orden Valentino
// «tenemos que mejorar esto»: la barra de entrada del chat se ve vacía y
// sin terminar — barra blanca grande y redondeada con solo la camarita
// (círculo beige chico) y el micrófono azul grande al lado, y el resto
// en blanco, con mucho espacio vacío a la derecha).
// El lote: en la pestaña Chat (noVoiceTxt) la barra ahora lleva una pista
// corta en el medio («tocá el micrófono y hablame» / «tap the mic and talk
// to me») para que se lea terminada y con sentido. El chat sigue siendo
// SOLO VOZ, sin teclado: no se agrega ningún input de texto; la camarita
// y el micrófono hacen exactamente lo mismo que hoy; las otras superficies
// conservan su texto completo. Solo cambian app.js (1 línea + comentario),
// styles.css (+3 líneas) y el estampado.
// La verificación visual (antes/después, Playwright) la hace
// render/render.py y deja render/measurements.json; esta suite afirma el
// código y afirma las medidas desde ese JSON.
// Uso: node test-lote-barra-chat.js (desde el scratch; corre contra
// release/ si existe, si no contra work/). Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
};

const ROOT = __dirname;
const TREE = fs.existsSync(path.join(ROOT, 'release', 'public', 'styles.css'))
  ? path.join(ROOT, 'release')
  : (fs.existsSync(path.join(ROOT, 'work', 'public', 'styles.css')) ? path.join(ROOT, 'work') : ROOT);
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const APPJS = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const ENINDEX = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

// La barra de voz: del <div class="pz-voicebar"> al cierre de la barra.
const vbStart = APPJS.indexOf('<div class="pz-voicebar">');
const vbEnd = APPJS.indexOf('</div>', APPJS.indexOf('pz-voice-hint', vbStart) === -1
  ? APPJS.indexOf('chatFile', vbStart) : APPJS.indexOf('pz-voice-hint', vbStart));
const vb = APPJS.slice(vbStart, APPJS.indexOf('</div>', vbEnd) + 6);

// A. El nuevo diseño de la barra presente.
t('A1: la pista corta existe en la rama noVoiceTxt (pz-voice-txt--corto)',
  APPJS.includes('pz-voice-txt--corto'));
t('A2: texto ES de la pista «tocá el micrófono y hablame»',
  count(APPJS, 'tocá el micrófono y hablame') === 1);
t('A3: texto EN de la pista «tap the mic and talk to me»',
  count(APPJS, 'tap the mic and talk to me') === 1);
t('A4: la pista usa gzT (ES + EN en la misma llamada)',
  APPJS.includes("gzT('tocá el micrófono y hablame', 'tap the mic and talk to me')"));
t('A5: el ternario viejo de .pz-voice-txt (rama vacía) ya no existe; el del hint de abajo se conserva x1',
  !APPJS.includes("${noVoiceTxt ? '' : `<div class=\"pz-voice-txt\">") &&
  count(APPJS, "noVoiceTxt ? ''") === 1);
t('A6: CSS .pz-voice-txt--corto llena el medio (flex + align-items:center)',
  CSS.includes('.pz-voice-txt--corto{display:flex;align-items:center}'));
t('A7: CSS .pz-voice-txt--corto span (14px, 700, var(--mut))',
  CSS.includes('.pz-voice-txt--corto span{font-size:14px;font-weight:700;color:var(--mut);line-height:1.35}'));
t('A8: orden en la barra: camarita < pista < micrófono',
  APPJS.indexOf('id="chatPhotoBtn"') < APPJS.indexOf('pz-voice-txt--corto') &&
  APPJS.indexOf('pz-voice-txt--corto') < APPJS.indexOf('id="chatMicSend"'));
t('A9: la pista está dentro de .pz-voice-primary (la barra blanca)',
  vb.includes('pz-voice-txt--corto'));

// B. El chat sigue siendo solo voz, sin teclado.
t('B1: la barra de voz tiene un solo <input> y es #chatFile (file, hidden)',
  count(vb, '<input') === 1 &&
  vb.includes('<input type="file" id="chatFile"') &&
  vb.includes('hidden'));
t('B2: ningún input de texto en la barra de voz',
  !vb.includes('type="text"') && !vb.includes("type='text'"));
t('B3: id="chatInput" sigue siendo UNO solo en todo app.js (el de la landing, sin sesión)',
  count(APPJS, 'id="chatInput"') === 1);
t('B4: camarita con el mismo id y el mismo título (chatPhotoBtn)',
  count(APPJS, 'id="chatPhotoBtn"') === 1 &&
  APPJS.includes('title="Mandar una foto o video"'));
t('B5: micrófono con el mismo id y el mismo aria-label (chatMicSend)',
  count(APPJS, 'id="chatMicSend"') === 1 &&
  APPJS.includes('aria-label="Hablarle a Posty: tocá para grabar"'));
t('B6: la delegación de la camarita sigue viva (#chatPhotoBtn en chatPhotoDelegar)',
  APPJS.includes("closest('#chatPhotoBtn')"));
t('B7: el micrófono sigue cableado (vozMicEl lee chatMicSend)',
  APPJS.includes("getElementById('chatMicSend')"));
t('B8: el resto del chat intacto (chatBox, chips, propuesta, saludo)',
  APPJS.includes('id="chatBox"') &&
  APPJS.includes('id="chatChips"') &&
  APPJS.includes('id="chatProposal"') &&
  APPJS.includes('hola! soy Posty. decime qué necesitás'));

// C. Las otras superficies conservan su texto completo.
t('C1: la rama con texto completo sigue presente («Hablarle a Posty»)',
  APPJS.includes("gzT('Hablarle a Posty', 'Talk to Posty')"));
t('C2: el subtítulo completo sigue presente («Tocá el micrófono grande…»)',
  APPJS.includes('Tocá el micrófono grande y decile lo que sea, como en WhatsApp.'));
t('C3: el hint de abajo sigue presente («Todo se responde tocando o hablando.»)',
  APPJS.includes('Todo se responde tocando o hablando.'));
t('C4: las 5 llamadas a chatCardHTML siguen existiendo (4 con texto + 1 Chat)',
  count(APPJS, 'chatCardHTML(true, true, true') === 5);
t('C5: solo la pestaña Chat pasa noVoiceTxt (la llamada de 8 true)',
  count(APPJS, 'chatCardHTML(true, true, true, true, true, true, true, true)') === 1);

// D. Medidas del render (render/measurements.json, Playwright).
const MEAS_PATH = path.join(ROOT, 'render', 'measurements.json');
t('D0: existe render/measurements.json (correr render/render.py primero)',
  fs.existsSync(MEAS_PATH));
if (fs.existsSync(MEAS_PATH)) {
  const rows = JSON.parse(fs.readFileSync(MEAS_PATH, 'utf8'));
  const after = rows.filter(r => r.tag === 'DESPUES-v903');
  const before = rows.filter(r => r.tag === 'ANTES-v899');
  t('D1: DESPUES tiene 2 medidas (390 y 1280)',
    after.length === 2, 'n=' + after.length);
  t('D2: DESPUES la pista llena el medio (>=100px) y dice el texto exacto',
    after.length === 2 && after.every(r =>
      r.hint && r.hint.w >= 100 && r.hintText === 'tocá el micrófono y hablame'),
    JSON.stringify(after.map(r => [r.w, r.hint && r.hint.w, r.hintText])));
  t('D3: DESPUES el mic queda pegado al borde derecho (hueco <=13px = padding)',
    after.length === 2 && after.every(r => r.gapRight !== null && r.gapRight <= 13),
    JSON.stringify(after.map(r => [r.w, r.gapRight])));
  t('D4: DESPUES sin teclado (el único input de la barra es file:hidden)',
    after.length === 2 && after.every(r =>
      JSON.stringify(r.inputs) === JSON.stringify(['file:hidden'])),
    JSON.stringify(after.map(r => r.inputs)));
  t('D5: ANTES reproduce el problema (hueco vacío >100px en los 2 casos)',
    before.length === 2 && before.every(r => r.gapRight !== null && r.gapRight > 100),
    JSON.stringify(before.map(r => [r.w, r.gapRight])));
  t('D6: DESPUES la barra tiene el mismo alto que ANTES (80px, sin crecer)',
    after.length === 2 && before.length === 2 &&
    after.every(a => {
      const b = before.find(x => x.w === a.w);
      return b && a.bar.h === b.bar.h && a.bar.h === 80;
    }),
    JSON.stringify(after.map(r => [r.w, r.bar.h])));
}

// E. Estampado v903.
t('E1: BUILD v903 x1 en server.js',
  count(SERVER, "20261105-v903") === 1);
t('E2: app.js?v=616 x1 en el index ES',
  count(INDEX, 'app.js?v=616') === 1);
t('E3: styles.css?v=20261241 x1 en el index ES y x1 en el EN',
  count(INDEX, 'styles.css?v=20261241') === 1 &&
  count(ENINDEX, 'styles.css?v=20261241') === 1);
t('E4: el index EN no lleva app.js?v=',
  !ENINDEX.includes('app.js?v='));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
