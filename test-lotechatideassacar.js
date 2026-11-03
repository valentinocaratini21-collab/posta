// test-lotechatideassacar.js — SACAR «IDEAS» DEL CHAT (decisión Valentino 3/11).
// Captura del chat de Posty 3/11: arriba del campo, dos píldoras («Subir
// fotos o video» e «Ideas» con contador). Valentino: «No quiero que
// aparezca mas». Fix: la píldora «Ideas» se ELIMINA por completo del
// render de la barra compartida (chatCardHTML, solo cuando schedMode):
// botón, ícono, texto y contador. NO se oculta con CSS: se saca el
// render, sus dos cableados (toggle en Semana y salto a Semana desde
// el chat full) y sus reglas CSS (.ideas-chip/.ideas-badge).
// ALCANCE DELIBERADO: el panel de ideas de Semana (hs-ideas, enhanceIdeas,
// Hacelo/Ahora no, competidores) NO se toca: es otra superficie y
// Valentino no pidió sacarlo. Consecuencia honesta: el panel queda sin
// botón que lo abra (IDEAS_PANEL_OPEN ya no puede pasar a true desde
// la UI); su código sigue, sin llamadores visibles, y el slot sigue
// pintándose cerrado. Si Valentino quiere sacar también el panel, es
// otro lote. «Subir fotos o video», campo, micrófono e historial:
// intactos. Node puro, lee el árbol.
// Uso: node test-lotechatideassacar.js
// Pines de versión: base v583 servida (app.js aba41c67, styles f432de55);
// rotados al liberar a v584 con causa (BUILD, ?v=, CHUNK_V v583, censo /aprobar 17).
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- Versiones + censo (base v584; rotados al liberar con causa) ----------
t(srv.includes("const BUILD_ID = '20261101-v584'"), 'BUILD v584 en server.js');
t(idx.includes('app.js?v=391'), 'index ES: app.js?v=391');
t(idx.includes('styles.css?v=20261104'), 'index ES: styles 20261104');
t(app.includes("const CHUNK_V = '20261101-v589'"), 'CHUNK_V sigue v589 (tanda Estrategia lo bumpea)'); // (ESTRATEGIA ×6 + CARTA-MANO + CARTA-PERSONALIZADA · 3/11, con causa) pin v583→v589: la tanda toca chunk-analisis.js; el resto de pines rancios del archivo (BUILD v584, ?v=391, styles 20261104) se dejan como estaban, ya fallaban en base
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 17, 'censo server: marcador 17 (v582: ruta espejo)');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');

// ---------- La píldora Ideas NO se renderiza ----------
const card = sliceFn(app, 'function chatCardHTML(', '\n}\n');
t(card.length > 1000, 'chatCardHTML presente para auditar');
t(!card.includes('id="ideasChip"'), 'SACAR-IDEAS: chatCard sin id ideasChip');
t(!card.includes('id="ideasBadge"'), 'SACAR-IDEAS: chatCard sin id ideasBadge');
t(!card.includes('ideas-chip'), 'SACAR-IDEAS: chatCard sin clase ideas-chip');
t(!card.includes('ideas-badge'), 'SACAR-IDEAS: chatCard sin clase ideas-badge');
t(!card.includes('${ideasChip}'), 'SACAR-IDEAS: sin interpolación de la píldora');
t(!app.includes("$('#ideasChip')"), 'SACAR-IDEAS: sin cableados a #ideasChip en app.js');
t(!app.includes('ideasChipBtn'), 'SACAR-IDEAS: sin variable ideasChipBtn');
t(!css.includes('.ideas-chip'), 'SACAR-IDEAS: styles sin .ideas-chip');
t(!css.includes('.ideas-badge'), 'SACAR-IDEAS: styles sin .ideas-badge');
// El único rastro permitido: los getElementById guardados de
// paintIdeasChrome (sistema del panel, que se conserva) — nunca un render.
t(app.includes("document.getElementById('ideasChip')"), 'panel intacto: paintIdeasChrome conserva su lookup guardado');

// ---------- «Subir fotos o video» y el resto del chat, intactos ----------
t(card.includes('id="agUploadBtn"'), 'intacto: botón Subir fotos o video');
t(card.includes('Subir fotos o video'), 'intacto: texto Subir fotos o video');
t(card.includes('id="albumFile"'), 'intacto: input de álbum');
t(card.includes('id="chatInput"'), 'intacto: campo de entrada');
t(card.includes('id="chatBox"'), 'intacto: caja de mensajes');
t(card.includes('id="chatMicSend"'), 'intacto: micrófono');
t(card.includes('sched-up-row') || card.includes('sched-chips-row'), 'intacto: la fila de subida sigue existiendo');

// ---------- El panel de Semana NO se tocó (otra superficie) ----------
t(app.includes('function enhanceIdeas'), 'panel intacto: enhanceIdeas presente');
t(app.includes('function wireIdeasBlock'), 'panel intacto: wireIdeasBlock presente');
t(app.includes('function paintIdeasChrome'), 'panel intacto: paintIdeasChrome presente');
t(app.includes('id="hs-ideas"'), 'panel intacto: slot hs-ideas en Semana');
t(app.includes('/api/ideas'), 'panel intacto: /api/ideas sigue cableado');
t(css.includes('#hs-ideas.ideas-closed'), 'panel intacto: CSS de slot cerrado');

console.log(`${ok} ok / ${bad} fallas`);
process.exit(bad ? 1 : 0);
