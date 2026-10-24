'use strict';
/* v379 — Fase B «Arma todo!»: (4) packshot anclado a la foto subida con la
   compuerta de fidelidad de cuentas, (5) diagnóstico express en la espera
   de la prueba (evento SSE + bloque, costo $0), (6) compartir por
   WhatsApp en resultados. ES + EN. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const prueba = fs.readFileSync(path.join(__dirname, 'public/prueba.html'), 'utf8');
const enPrueba = fs.readFileSync(path.join(__dirname, 'public/en-prueba.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const enHtml = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');

/* ---------- ítem 5: diagnóstico express (server) ---------- */
ok(serverJs.includes("send('diagnosis', trialDiagnosis)"), 'server: evento SSE diagnosis emitido');
ok(serverJs.includes('diagnosis: trialDiagnosis'), 'server: diagnosis viaja en el payload final');
ok(serverJs.includes("if (cachedOut.diagnosis) send('diagnosis', cachedOut.diagnosis)"), 'server: la rama de caché también emite diagnosis');
ok(serverJs.includes('temas_feed'), 'server: la línea sale de los temas del fundamento');
ok(serverJs.includes('feedPalette.principal'), 'server: la paleta del diagnóstico es la del feed (extractFeedPalette)');

/* ---------- ítem 4: packshot anclado (server) ---------- */
ok(serverJs.includes("trialPhotoEntries([{ url: 'upload://foto', path: photoPath }], upItemNames)"), 'server: la subida se clasifica con el mapa foto→producto');
ok(serverJs.includes("refRoles.buildRefNote(['product'])"), 'server: la generación usa el rol product');
ok(serverJs.includes('Studio packshot: THE EXACT product from the reference photo'), 'server: prompt de packshot con el producto exacto');
ok(serverJs.includes('refRoles.FIDELITY_CLAUSE'), 'server: cláusula de fidelidad en el prompt');
ok(serverJs.includes('refRoles.FIDELITY_REINFORCE'), 'server: reintento con cláusula reforzada');
ok((serverJs.match(/qaFidelityB64\(origB64/g) || []).length >= 2, 'server: QA de fidelidad sobre la generación y su reintento');
ok(serverJs.includes('upload_product: uploadProduct'), 'server: trazabilidad upload_product en el payload');
ok(serverJs.includes('upload_anchored = true'), 'server: la pieza reemplazada queda marcada upload_anchored');
ok(serverJs.includes("uploadProduct = { classified: false }"), 'server: sin clasificación no hay ancla (fallback literal)');

/* ---------- ítems 5+6: front ES/EN ---------- */
for (const [src, label, wa, diag] of [
  [prueba, 'ES', 'Compartir por WhatsApp', 'Ya leí tu Instagram'],
  [enPrueba, 'EN', 'Share on WhatsApp', 'I already read your Instagram'],
]) {
  ok(src.includes('id="diagBox"'), label + ': bloque #diagBox en resultados');
  ok(src.includes('diagnosis: onStreamDiagnosis'), label + ': handler diagnosis cableado en readSSE');
  ok(src.includes('function renderDiagnosis('), label + ': renderDiagnosis definida');
  ok(src.includes('function onStreamDiagnosis('), label + ': onStreamDiagnosis definida');
  ok(src.includes('STREAM_FIRST_POST'), label + ': el posteo 1 alimenta el slot del diagnóstico');
  ok(src.includes(diag), label + ': título del diagnóstico en su idioma');
  ok(src.includes('id="btnShareWa"'), label + ': botón de WhatsApp junto al compartir actual');
  ok(src.includes(wa), label + ': etiqueta del botón WhatsApp');
  ok(src.includes('function shareWeekWhatsApp('), label + ': shareWeekWhatsApp definida');
  ok(src.includes('https://wa.me/?text='), label + ': fallback wa.me presente');
  ok(src.includes('navigator.share'), label + ': Web Share API primero');
  ok(!/wa.me[^"']*Gesty|wa.me[^"']*Venty/i.test(src), label + ': el mensaje compartido no menciona a otros agentes (vidriera)');
}

/* ---------- cadena de invariantes ---------- */
ok(appJs.includes('hasSessionContext'), 'invariante: guarda del hotfix v371');
ok(appJs.includes('Posty trabaja completo por sí solo'), 'invariante v376: autonomía ES');
ok(enHtml.includes('Does Posty work on its own, or do I need to hire anything else?'), 'invariante v376: autonomía EN');
const av = fs.readFileSync(path.join(__dirname, 'public/ai-avatar.png'));
ok(crypto.createHash('sha256').update(av).digest('hex').startsWith('c8feaff7'), 'invariante: avatar placa corregida (sha c8feaff7…)');
ok(serverJs.includes("BUILD_ID = '20261024-v388'"), 'BUILD_ID 20261024-v388');

console.log(`test-trial-v379: ${okN} ok / ${failN} fallas`);
process.exit(failN ? 1 : 0);
