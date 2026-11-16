'use strict';
/* LOTE COPY-SIN-BILLETERA — la home (ES + EN) deja de describir el modelo de
 * billetera, descartado por la decisión de Ads del 13/11, y pasa a describir
 * el modelo decidido: la pauta se paga desde la cuenta de Meta del propio
 * cliente y la gestión de Posty se cobra al impulsar con la tarjeta guardada.
 * Solo copy público de la home: landingView + lpAdsHTML en app.js, el JSON-LD
 * de public/index.html y la home EN estática. El código interno del riel
 * legado (tab Ads de la app, chunks internos, server) NO se toca: por eso
 * varias aserciones son por FRASE y no por palabra (app.js conserva
 * «billetera» en la app interna, fuera de este lote).
 * Control: con LOTE_BASE_DIR=<árbol base> se prueba que la base trae las
 * frases viejas (el hueco) y que deshacer los reemplazos sobre el release
 * devuelve los tres archivos byte a byte a la base (diff mínimo probado).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BASE = process.env.LOTE_BASE_DIR || null;
let ok = 0, mal = 0;
function t(cond, label) { if (cond) { ok++; } else { mal++; console.log('  MAL:', label); } }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function count(src, s) { return src.split(s).length - 1; }

const ES_CORTA_OLD = 'lo impulsás por billetera, aparte del plan';
const ES_CORTA_NEW = 'lo impulsás desde tu cuenta de Meta, aparte del plan';
const ES_FAQ_OLD = 'Sí. Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo: cargás crédito en tu billetera —aparte de la suscripción— y Posty elige el posteo, el público y lo gestiona, siempre con tu OK en un toque.';
const ES_FAQ_NEW = 'Sí. Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo: la pauta se paga desde tu propia cuenta de Meta, aparte de la suscripción, y Posty elige el posteo, el público y lo gestiona, siempre con tu OK en un toque.';
const EN_CORTA_OLD = 'you boost it from your wallet, separate from the plan';
const EN_CORTA_NEW = 'you boost it from your own Meta account, separate from the plan';
const EN_FAQ_OLD = 'Yes. When a post takes off, Posty flags it and proposes boosting it: you load credit into your wallet — separate from the subscription — and Posty picks the post, the audience and runs it, always with your one-tap OK.';
const EN_FAQ_NEW = 'Yes. When a post takes off, Posty flags it and proposes boosting it: the ad spend is paid from your own Meta account, separate from the subscription, and Posty picks the post, the audience and runs it, always with your one-tap OK.';

const app = read(path.join(ROOT, 'public', 'app.js'));
const idx = read(path.join(ROOT, 'public', 'index.html'));
const en = read(path.join(ROOT, 'public', 'en', 'index.html'));

// ---------- A. ES app.js (landingView + lpAdsHTML): frases nuevas ----------
t(count(app, ES_CORTA_NEW) === 3, 'ES app: frase corta nueva ×3 (cierre + 2 FAQ), vino ' + count(app, ES_CORTA_NEW));
t(count(app, ES_FAQ_NEW) === 1, 'ES app: FAQ publicidad nueva ×1');
t(count(app, 'La pauta se paga desde tu propia cuenta de Meta, aparte de la suscripción, y Posty elige el posteo, el público y lo gestiona.') === 1, 'ES app: cap-exp nueva ×1');
t(count(app, 'La pauta va por tu cuenta de Meta, aparte de los $199.') === 1, 'ES app: li monto nuevo ×1');
t(count(app, 'Tu cuenta de Meta · $20') === 1, 'ES app: mock nuevo ×1');
t(count(app, 'la gestión se cobra al impulsar con tu tarjeta guardada') === 1, 'ES app: cap-note con gestión al impulsar ×1');
// ---------- B. ES app.js: frases viejas fuera ----------
[ES_CORTA_OLD, ES_FAQ_OLD, 'cargás crédito en tu billetera', 'La plata es tu billetera',
 'Billetera $20', 'Automática ON', 'Podés dejar la carga en automático desde tu banco',
].forEach((s) => t(count(app, s) === 0, 'ES app: fuera «' + s.slice(0, 44) + '»'));
// ---------- C. ES index.html (JSON-LD): espejo exacto ----------
t(count(idx, ES_CORTA_NEW) === 2, 'ES index JSON-LD: frase corta nueva ×2, vino ' + count(idx, ES_CORTA_NEW));
t(count(idx, ES_FAQ_NEW) === 1, 'ES index JSON-LD: FAQ publicidad nueva ×1');
t(count(idx, 'billetera') === 0, 'ES index: «billetera» ×0 (solo vivía en el JSON-LD)');
// ---------- D. EN index.html: espejo ----------
t(count(en, EN_CORTA_NEW) === 4, 'EN: frase corta nueva ×4 (JSON-LD ×2 + FAQ ×2), vino ' + count(en, EN_CORTA_NEW));
t(count(en, EN_FAQ_NEW) === 2, 'EN: FAQ publicidad nueva ×2 (JSON-LD + visible), vino ' + count(en, EN_FAQ_NEW));
t(count(en, 'The ad spend is paid from your own Meta account, separate from the subscription, and Posty picks the post, the audience and runs it.') === 1, 'EN: cap-exp nueva ×1');
t(count(en, 'The spend runs on your Meta account, separate from the $199.') === 1, 'EN: li monto nuevo ×1');
t(count(en, 'Your Meta account · $20') === 1, 'EN: mock nuevo ×1');
t(count(en, "Posty's management is charged when you boost, on your saved card") === 1, 'EN: cap-note con gestión al impulsar ×1');
t(count(en, 'it runs on your own Meta account and you pick the post') === 1, 'EN: cierre nuevo ×1');
t(count(en, 'wallet') === 0, 'EN: «wallet» ×0 en toda la home');
// ---------- E. El copy nuevo no trae rayas largas ni promete carga ----------
[ES_CORTA_NEW, ES_FAQ_NEW, EN_CORTA_NEW, EN_FAQ_NEW,
 'La pauta se paga desde tu propia cuenta de Meta, aparte de la suscripción, y Posty elige el posteo, el público y lo gestiona.',
 'The ad spend is paid from your own Meta account, separate from the subscription, and Posty picks the post, the audience and runs it.',
].forEach((s) => t(!s.includes('—'), 'sin raya larga en frase nueva: «' + s.slice(0, 34) + '»'));

// ---------- F. Control contra la base + cirugía byte a byte ----------
if (BASE) {
  const bApp = read(path.join(BASE, 'public', 'app.js'));
  const bIdx = read(path.join(BASE, 'public', 'index.html'));
  const bEn = read(path.join(BASE, 'public', 'en', 'index.html'));
  t(count(bApp, ES_CORTA_OLD) === 3 && count(bApp, ES_FAQ_OLD) === 1, 'CONTROL base: app.js trae las frases viejas (el hueco)');
  t(count(bIdx, ES_CORTA_OLD) === 2 && count(bIdx, ES_FAQ_OLD) === 1, 'CONTROL base: index JSON-LD viejo');
  t(count(bEn, EN_CORTA_OLD) === 4 && count(bEn, EN_FAQ_OLD) === 2, 'CONTROL base: EN trae las frases viejas');
  // Deshacer los reemplazos (NEW->OLD, conteos asertados) = base byte a byte.
  function undo(src, pairs) {
    let out = src;
    for (const [n, o, c] of pairs) {
      if (count(out, n) !== c) return null;
      out = out.split(n).join(o);
    }
    return out;
  }
  const uApp = undo(app, [
    ['Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo. La pauta se paga desde tu propia cuenta de Meta, aparte de la suscripción, y Posty elige el posteo, el público y lo gestiona.',
     'Cuando un posteo anda muy bien, Posty te lo marca y te propone potenciarlo. Cargás crédito en tu billetera —aparte de la suscripción— y Posty elige el posteo, el público y lo gestiona. Podés dejar la carga en automático desde tu banco.', 1],
    ['<b>Vos ponés el monto, nada más.</b> $20, $50 o $100. La pauta va por tu cuenta de Meta, aparte de los $199.',
     '<b>Vos ponés el monto, nada más.</b> $20, $50 o $100. La plata es tu billetera, aparte de los $199.', 1],
    ['Tu cuenta de Meta · $20', 'Billetera $20 · Automática ON', 1],
    ['La pauta va por tu cuenta de Meta, aparte de la suscripción, y la gestión se cobra al impulsar con tu tarjeta guardada. Nada se gasta sin tu OK.',
     'La plata es tu billetera, aparte de la suscripción. Nada se gasta sin tu OK.', 1],
    [ES_CORTA_NEW, ES_CORTA_OLD, 3],
    [ES_FAQ_NEW, ES_FAQ_OLD, 1],
  ]);
  t(uApp !== null && uApp === bApp, 'CIRUGÍA: app.js sin el cambio == base byte a byte');
  const uIdx = undo(idx, [[ES_CORTA_NEW, ES_CORTA_OLD, 2], [ES_FAQ_NEW, ES_FAQ_OLD, 1]]);
  t(uIdx !== null && uIdx === bIdx, 'CIRUGÍA: index.html sin el cambio == base byte a byte');
  const uEn = undo(en, [
    ['When a post takes off, Posty flags it and proposes boosting it. The ad spend is paid from your own Meta account, separate from the subscription, and Posty picks the post, the audience and runs it.',
     'When a post takes off, Posty flags it and proposes boosting it. You load credit into your wallet — separate from the subscription — and Posty picks the post, the audience and runs it. You can leave top-ups on automatic from your bank.', 1],
    ["<b>You set the amount, that's it.</b> $20, $50 or $100. The spend runs on your Meta account, separate from the $199.",
     "<b>You set the amount, that's it.</b> $20, $50 or $100. The money is your wallet, separate from the $199.", 1],
    ['Your Meta account · $20', 'Wallet $20 · Auto top-up ON', 1],
    ["The spend runs on your Meta account, separate from the subscription, and Posty's management is charged when you boost, on your saved card. Nothing is spent without your OK.",
     'The money is your wallet, separate from the subscription. Nothing is spent without your OK.', 1],
    ['Boosting a post is separate: it runs on your own Meta account and you pick the post.',
     'Boosting a post is separate: you load your wallet and pick the post.', 1],
    [EN_CORTA_NEW, EN_CORTA_OLD, 4],
    [EN_FAQ_NEW, EN_FAQ_OLD, 2],
  ]);
  t(uEn !== null && uEn === bEn, 'CIRUGÍA: en/index.html sin el cambio == base byte a byte');
} else {
  console.log('  (sin LOTE_BASE_DIR: control y cirugía omitidos)');
}

// ---------- G. Boot smoke: lo servido trae el copy nuevo ----------
const PORT = 35231;
function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => res({ code: r.statusCode, body: d }));
    }).on('error', rej);
  });
}
async function boot() {
  const dataDir = fs.mkdtempSync('/tmp/posta-copy-billetera-');
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: dataDir }),
    stdio: 'ignore',
  });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const v = await get('/api/version'); up = v.code === 200; } catch (e) { /* espera */ }
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    t(up, 'BOOT: server responde /api/version');
    if (up) {
      const js = await get('/app.js');
      t(js.code === 200 && js.body.includes(ES_FAQ_NEW) && !js.body.includes(ES_FAQ_OLD), 'BOOT: /app.js servido con la FAQ nueva y sin la vieja');
      const home = await get('/');
      t(home.code === 200 && home.body.includes(ES_FAQ_NEW), 'BOOT: / sirve el JSON-LD con la FAQ nueva');
      const enH = await get('/en/index.html');
      t(enH.code === 200 && enH.body.includes(EN_FAQ_NEW) && !enH.body.includes(EN_FAQ_OLD), 'BOOT: home EN servida con la FAQ nueva y sin la vieja');
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

boot().then(() => {
  console.log('COPY-SIN-BILLETERA: ' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
}).catch((e) => { console.log('ERROR boot:', e && e.message); console.log('COPY-SIN-BILLETERA: ' + ok + ' ok · ' + (mal + 1) + ' mal'); process.exit(1); });
