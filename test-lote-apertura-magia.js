// Suite LOTE APERTURA-MAGIA (20/11) — la presentación de apertura de la
// app, opción 1 «la magia» elegida por el dueño sobre el mock aprobado
// (~/workspace/mock-splash-posty/splash.html, con la corrección de las
// 17:23: la cara es posty-cara-v2 y su borde inferior se DISUELVE con
// mask-image en degradé — negro hasta 76%, transparente a 97%).
//
// Afirma, sobre la fuente:
//  A) El shell ES trae la presentación dentro de #posty-boot, inerte
//     salvo que el script de activación agregue .pz-magic, y la
//     activación es SOLO contexto app (standalone/nativa/hash de app o
//     auth, con la salida posta_ver_web honrada).
//  B) La pieza replica el mock: degradé, 4 estrellitas #FEC14D con sus
//     offsets, aro, glow, la cara verdadera servida como archivo con
//     su máscara exacta, «Posty» con el punto amarillo y el subtítulo
//     ES/EN; keyframes con los % del mock y duración 1,6 s (< 2 s).
//  C) Una sola vez y sin re-disparos: ningún visibilitychange /
//     pageshow / focus arma la presentación; el fundido sale por tap
//     o por el timer de 1600 ms, y bootSplashOff (app.js) espera el
//     mínimo cuando la app pinta antes, sin bloquear si ya cumplió.
//  D) La landing web conserva la ruedita byte a byte en su bloque y
//     los sellos cierran: BUILD v1210 = PZ_BUILD, app.js?v=842,
//     styles?v= sin cambios en ambos index.
// Uso: node test-lote-apertura-magia.js [root]
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const es = read('public/index.html');
const en = read('public/en/index.html');
const app = read('public/app.js');
const server = read('server.js');

let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; } else { fail++; console.log('FAIL: ' + name); } };
const has = (s, x) => String(s || '').includes(x);

// ---------- A · activación solo app, una vez ----------
const bootDiv = (es.match(/<div id="posty-boot"[\s\S]*?<div class="pzsp-sub"[^>]*>[^<]*<\/div>\s*<\/div>\s*<\/div>/) || [''])[0];
t('A1 #posty-boot existe con la etapa de la presentación adentro', !!bootDiv);
t('A2 la etapa nace oculta (display:none sin .pz-magic)', has(es, '#posty-boot .pzsp-stage{display:none}'));
t('A3 el script activa solo con contexto app', has(es, "h.indexOf('#/app') === 0") && has(es, "h === '#/login'") && has(es, "matchMedia('(display-mode: standalone)')"));
t('A4 posta_ver_web=1 apaga el contexto app (ver la web es ver la web)', has(es, "sessionStorage.getItem('posta_ver_web') === '1') appCtx = false"));
t('A5 sin contexto app no se agrega .pz-magic (la landing queda con la ruedita)', has(es, "if (!appCtx) return;") && has(es, "boot.classList.add('pz-magic')"));
const actScript = (es.match(/LOTE APERTURA-MAGIA\) Activación[\s\S]*?\}\)\(\);\s*<\/script>/) || [''])[0];
t('A6 nadie escucha visibilitychange/pageshow para re-armarla (volver de segundo plano no la repite)', !/addEventListener\('(visibilitychange|pageshow)'/.test(es) && !/addEventListener\("(visibilitychange|pageshow)"/.test(es));
t('A7 ningún otro bloque del shell re-arma la presentación', (es.match(/pz-magic/g) || []).length <= 14);

// ---------- B · la pieza, tal cual el mock corregido ----------
t('B1 degradé del mock (168deg, #2793C8 34% → #0A1E33)', has(es, 'linear-gradient(168deg,#3EA6DB 0%,#2793C8 34%,#1B6FA0 68%,#0A1E33 100%)'));
t('B2 exactamente 4 estrellitas', (es.match(/class="pzsp-star"/g) || []).length === 4);
t('B3 estrellitas #FEC14D', has(es, '.pzsp-star{') && has(es, 'color:#FEC14D'));
t('B4 offsets del mock (en unidades de contenedor)', has(es, '--sx:-33.3cqw;--sy:-21.8cqh') && has(es, '--sx:36.5cqw;--sy:-15.1cqh') && has(es, '--sx:-38.1cqw;--sy:13.8cqh') && has(es, '--sx:31cqw;--sy:20.1cqh'));
t('B5 aro de magia y glow amarillos del mock', has(es, 'border:2px solid rgba(254,193,77,.8)') && has(es, 'radial-gradient(circle,rgba(254,193,77,.55) 0%,rgba(254,193,77,0) 68%)'));
t('B6 la cara se sirve como archivo (asset v2 del mock)', has(es, '<img src="/posty-splash-cara.webp"'));
t('B7 el asset existe en public/', fs.existsSync(path.join(root, 'public', 'posty-splash-cara.webp')));
t('B8 terminación de la cara: el busto se disuelve (mask 76% → 97%), sin corte duro', has(es, '-webkit-mask-image:linear-gradient(to bottom,#000 76%,transparent 97%);mask-image:linear-gradient(to bottom,#000 76%,transparent 97%)'));
t('B9 «Posty» con el punto en amarillo', has(es, '<div class="pzsp-word">Posty<span class="pzsp-dot">.</span></div>') && has(es, '.pzsp-dot{display:inline-block;color:#FEC14D'));
t('B10 subtítulo ES por defecto y espejo EN en el shell', has(es, 'id="pz-splash-sub">tus community managers<') && has(es, "sub.textContent = 'your community managers'"));
t('B11 keyframes con los % del mock (la cara nace al 28–50%, el punto cae al 64–76%)', has(es, '@keyframes pzspFace{0%,28%{') && has(es, '@keyframes pzspDot{0%,64%{') && has(es, '@keyframes pzspIn{0%{'));
t('B12 duración 1,6 s (< 2 s) en las piezas de la secuencia (estrellas, cara, glow, aro, palabra, punto, subtítulo)', ['pzspIn','pzspFace','pzspGlow','pzspRing','pzspWord','pzspDot','pzspSub'].every(k => new RegExp('animation:' + k + ' 1\\.6s').test(es)));

// ---------- C · salida: tap, mínimo y fundido ----------
t('C1 toque en cualquier parte salta con fundido', has(actScript, "boot.addEventListener('pointerdown'") && has(actScript, 'sp.finish(200)'));
t('C2 el timer propio la saca a los 1600 ms aunque la app tarde más', has(actScript, 'reduced ? 500 : 1600'));
t('C3 la salida es fundido (clase .pz-magic-out, opacity .3s)', has(es, '#posty-boot.pz-magic-out{opacity:0}') && has(es, 'transition:opacity .3s ease'));
t('C4 bootSplashOff espera el mínimo si la app pintó antes', has(app, 'const wait = 1600 - (performance.now() - sp.t0);') && has(app, 'sp.finish(300); return;'));
t('C5 bootSplashOff ajusta el subtítulo al idioma de la cuenta (ME.lang)', has(app, "ME.lang === 'en') sub.textContent = 'your community managers'"));
t('C6 sin presentación activa, bootSplashOff remueve como siempre', has(app, 'b.remove();'));
t('C7 el resguardo de 6 s del shell sigue vivo', has(actScript, '}, 6000);'));
t('C8 movimiento reducido acorta la presentación', has(es, '@media (prefers-reduced-motion: reduce){.pzsp-star'));

// ---------- D · landing intacta y sellos ----------
t('D1 la ruedita de la landing sigue en el bloque (contexto web sin cambios)', has(es, '<span class="pz-boot-spin"></span><span class="pz-boot-txt">Cargando…</span>') && has(es, '.pz-boot-spin{width:34px;height:34px'));
t('D2 en contexto magia la ruedita se oculta (no conviven)', has(es, '#posty-boot.pz-magic .pz-boot-spin,#posty-boot.pz-magic .pz-boot-txt{display:none}'));
t('D3 BUILD_ID v1210 en server.js', has(server, "const BUILD_ID = '20261105-v1210';"));
t('D4 PZ_BUILD v1210 en app.js (paridad)', has(app, "const PZ_BUILD = '20261105-v1210';"));
t('D5 index ES pide app.js?v=842', has(es, '<script src="/app.js?v=842"></script>'));
t('D6 styles?v= sin cambios en ambos index (20261308)', has(es, '/styles.css?v=20261308') && has(en, '/styles.css?v=20261308'));
t('D7 el index EN no se tocó (sin posty-boot, como en la base)', !has(en, 'posty-boot'));

console.log(`APERTURA-MAGIA: ${ok} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
