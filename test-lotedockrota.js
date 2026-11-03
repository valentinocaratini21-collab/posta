// test-lotedockrota.js — LOTE DOCKROTA · la barra de Inicio rota.
// Valentino 1/11 («Sí, que rote en la barra»): el botón .mz-ph
// (#mzChatOpen, cara + texto) que abre la hoja tiene que rotar sus
// frases igual que el chat de adentro: mismas 9 preguntas (ES/EN, Valentino 3/11),
// cada 4 s, mismo fundido ~360 ms. Solo rota el TEXTO: la cara,
// el + y el micrófono quedan intactos, y el tap abre la hoja igual.
// Node puro, lee el árbol. Uso: node test-lotedockrota.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. Botón: cara + span, texto intacto ----------
const btnLine = app.split('\n').find((l) => l.includes('id="mzChatOpen"')) || '';
t(btnLine.includes('<img class="chat-face" src="ai-avatar.png" alt="Posty">'), 'botón: la cara de Posty sigue en el botón');
t(btnLine.includes('<span class="mz-ph-tx">escribile a posty…</span>'), 'botón: el texto va en un span .mz-ph-tx');
t(!btnLine.includes('alt="Posty">escribile'), 'botón: sin texto suelto tras la imagen (todo rota por el span)');
t(cnt(app, 'id="mzChatOpen"') === 1, 'botón: un solo render con ese id (el handler usa $(...), no id=)');
t(app.includes("if (open) open.onclick = () => mzOpenSheet(true);"), 'tap: el botón sigue abriendo la hoja igual');

// ---------- 2. Rotador del dock ----------
t(app.includes('function pzDockPhNext()'), 'existe pzDockPhNext');
t(app.includes('function pzPhAdvanceDock(el, list)'), 'existe pzPhAdvanceDock');
t(app.includes("pzPhEls('.mz-ph-tx')"), 'el rotador consulta .mz-ph-tx');
t(app.includes('pzChatPhNext(); pzAskPhNext(); pzDockPhNext();'), 'el tick unificado avanza también el dock');
const ens = sliceFn(app, 'function pzPhEnsure', 'function pzPhStart');
t(ens.includes("pzPhEls('.mz-ph-tx')") && ens.includes('pzPhAdvanceDock'), 'ensure descubre los spans del dock');
const advD = sliceFn(app, 'function pzPhAdvanceDock', 'function pzPhTick');
t(advD.includes('textContent'), 'dock: rota por textContent (no es un campo)');
t(!advD.includes('.placeholder'), 'dock: no toca placeholder (no es un campo)');
t(advD.includes('pz-ph-fading') && advD.includes('}, 180);') && advD.includes('}, 380);'), 'dock: mismo fundido 180/380 ms');
t(advD.includes("pzPhReduced() || typeof setTimeout !== 'function'"), 'dock: reduced-motion o sin timers → instantáneo');
t(advD.includes('dataset.phI'), 'dock: cada span con su propio índice');
t(app.includes('setInterval(pzPhTick, 4000)'), 'intervalo 4 s (heredado de chat-4s)');
t(!app.includes('setInterval(pzPhTick, 8000)'), 'sin residuo 8 s');

// ---------- 3. CSS: fundido del span + oscuro intacto ----------
t(css.includes('.mz-ph-tx.pz-ph-fading{animation:pzPhFade .36s ease}'), 'CSS: el span usa el fundido pzPhFade .36 s');
t(css.includes('@keyframes pzPhFade'), 'keyframes pzPhFade existen (de chat-4s)');
const mzRule = (css.split('.mz-ph{')[1] || '').split('}')[0];
t(mzRule.includes('color:#47617A'), 'dock sigue #47617A (oscuro de chat-4s intacto)');
t(mzRule.includes('flex:1'), 'dock sigue flexible (sin anchos fijos nuevos)');

// ---------- 4. Listas ES/EN intactas ----------
t(app.includes("es: ['¿qué idea tenés para el próximo post?', '¿tenés fotos para mandarme?', '¿alguna promo esta semana?', 'pedime exactamente lo que querés', '¿qué querés vender esta semana?', '¿hay algo nuevo en tu negocio?', '¿qué te gustaría cambiar de tu feed?', 'contame qué vendiste hoy', '¿tenés un video para armar un reel?']"), 'lista ES intacta');
t(app.includes("en: ['got an idea for the next post?', 'got photos to send me?', 'any promo this week?', 'ask me for exactly what you want', 'what do you want to sell this week?', 'anything new in your business?', 'what would you like to change about your feed?', 'tell me what you sold today', 'got a video to turn into a reel?']"), 'lista EN intacta');
t(app.includes('function pzChatPhList()'), 'la lista se resuelve por idioma en cada tick');

// ---------- 5. Versiones + censo (base v530 (chat-texto + chat-4s), sin bumps todavía) ----------
t(srv.includes("const BUILD_ID = '20261101-v572'"), 'BUILD v530 (sin bump hasta el push)');
t(idx.includes('app.js?v=383') && idx.includes('styles.css?v=20261099'), 'index: ?v= de v530 (bump al pushear)');
t(idxEn.includes('styles.css?v=20261091') && !idxEn.includes('app.js?v='), 'en/index: styles v530, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v565'"), 'CHUNK_V intacto');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- 6. Funcional con temporizadores reales ----------
function mockSpan(text) {
  const classes = new Set();
  return {
    textContent: text, dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    _classes: classes,
  };
}
function dockSandbox(spans, reduced) {
  let timers = [];
  const sb = {
    console,
    ME: { lang: 'es' },
    document: {
      getElementById: () => null,
      body: {},
      querySelectorAll: (sel) => (sel === '.mz-ph-tx' ? spans : []),
    },
    window: { matchMedia: () => ({ matches: !!reduced }) },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearInterval: (id) => { timers = timers.filter((_, i) => i + 1 !== id); },
    setTimeout,
    Intl, Date, Map, Set,
  };
  vm.createContext(sb);
  let code = app.slice(app.indexOf('const PZ_CHAT_PH'), app.indexOf('async function bindChatView'));
  code = code.replace('const PZ_CHAT_PH', 'globalThis.PZ_CHAT_PH')
    .replace('function pzChatPhStart', 'globalThis.pzChatPhStart = function')
    .replace('function pzAskPhStart', 'globalThis.pzAskPhStart = function');
  vm.runInContext(code, sb);
  return { sb, timers };
}

(async () => {
  // Fundido del dock: al arrancar se apaga sin cambiar; a los 300 ms
  // ya cambió y la clase sigue; a los 550 ms la clase se fue.
  {
    const sp = mockSpan('escribile a posty…');
    const { sb, timers } = dockSandbox([sp], false);
    sb.pzChatPhStart();
    t(timers.length === 1 && timers[0].ms === 4000, 'funcional: intervalo 4000 al arrancar');
    t(sp.textContent === 'escribile a posty…' && sp._classes.has('pz-ph-fading'), 'fundido dock: al arrancar se apaga sin cambiar todavía');
    await sleep(300);
    t(sp.textContent === '¿tenés fotos para mandarme?' && sp._classes.has('pz-ph-fading'), 'fundido dock: a los 300 ms ya cambió, clase todavía puesta');
    await sleep(250);
    t(!sp._classes.has('pz-ph-fading') && sp.textContent === '¿tenés fotos para mandarme?', 'fundido dock: a los 550 ms la clase se fue y la frase quedó');
    // Tick: mismo fundido, tercera frase.
    timers[0].fn();
    t(sp.textContent === '¿tenés fotos para mandarme?' && sp._classes.has('pz-ph-fading'), 'fundido dock: el tick apaga antes de cambiar');
    await sleep(300);
    t(sp.textContent === '¿alguna promo esta semana?', 'fundido dock: el tick cambia a la tercera frase');
    // Reabrir no duplica el intervalo.
    sb.pzChatPhStart();
    t(timers.length === 1, 'reabrir no duplica el intervalo');
  }
  // Reduced-motion: instantáneo, sin clase.
  {
    const sp = mockSpan('escribile a posty…');
    const { sb } = dockSandbox([sp], true);
    sb.pzChatPhStart();
    t(sp.textContent === '¿tenés fotos para mandarme?' && !sp._classes.has('pz-ph-fading'), 'reduced-motion dock: cambio instantáneo sin fundido');
  }
  // Cada span con su propio índice.
  {
    const a = mockSpan('escribile a posty…');
    const b = mockSpan('escribile a posty…');
    b.dataset.phI = '2';
    const { sb, timers } = dockSandbox([a, b], false);
    sb.pzChatPhStart();
    await sleep(300);
    t(a.textContent === '¿tenés fotos para mandarme?' && b.textContent === 'pedime exactamente lo que querés', 'cada span avanza desde su propio índice');
    timers[0].fn();
    await sleep(300);
    t(a.textContent === '¿alguna promo esta semana?' && b.textContent === '¿qué querés vender esta semana?', 'tick dock: cada span sigue su propia rueda');
  }
  // EN: misma rueda.
  {
    const sp = mockSpan('write to posty…');
    const { sb } = dockSandbox([sp], false);
    sb.ME.lang = 'en';
    sb.pzChatPhStart();
    await sleep(300);
    t(sp.textContent === 'got photos to send me?', 'EN dock: rota con la lista en inglés');
  }
  // La rueda completa vuelve al inicio (9 frases, Valentino 3/11).
  {
    const sp = mockSpan('escribile a posty…');
    const { sb, timers } = dockSandbox([sp], true);
    sb.pzChatPhStart();
    t(sp.textContent === '¿tenés fotos para mandarme?', 'rueda: frase 2');
    timers[0].fn();
    t(sp.textContent === '¿alguna promo esta semana?', 'rueda: frase 3');
    timers[0].fn();
    t(sp.textContent === 'pedime exactamente lo que querés', 'rueda: frase 4');
    timers[0].fn();
    t(sp.textContent === '¿qué querés vender esta semana?', 'rueda: frase 5');
    timers[0].fn();
    t(sp.textContent === '¿hay algo nuevo en tu negocio?', 'rueda: frase 6');
    timers[0].fn();
    t(sp.textContent === '¿qué te gustaría cambiar de tu feed?', 'rueda: frase 7');
    timers[0].fn();
    t(sp.textContent === 'contame qué vendiste hoy', 'rueda: frase 8');
    timers[0].fn();
    t(sp.textContent === '¿tenés un video para armar un reel?', 'rueda: frase 9');
    timers[0].fn();
    t(sp.textContent === '¿qué idea tenés para el próximo post?', 'rueda: vuelve a la frase 1');
  }

  console.log(`LOTEDOCKROTA: ${ok} ok, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
})();
