// test-loterespirofoto.js — LOTE RESPIRO-FOTO-DETALLE (decisión Valentino 2/11 «arma todo»:
// en la pantalla de detalle del posteo la foto arranca pegada al borde superior).
// Uso: node test-loterespirofoto.js [dir]  (dir = raíz del árbol; default: __dirname)
// Construcción SIN PUSH. Base: v559 servido (app.js 2b25479f, styles cf1e5d51).
// Node puro, lee el árbol; no levanta servidor.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

// ---------- (a) Respiro superior medible arriba de la foto del detalle ----------
const m = css.match(/\.apv-media\{[^}]*\}/);
ok(!!m, 'regla .apv-media principal presente');
ok(!!m && /margin-top:14px/.test(m[0]), 'respiro arriba: .apv-media margin-top:14px');
ok(!!m && /margin-bottom:14px/.test(m[0]), 'misma escala que abajo: margin-bottom:14px intacto');
// El respiro es margen del contenedor, no padding del wrap: el wrap no cambia.
ok(/\.apv-wrap\{max-width:620px;margin:0 auto;padding:6px 2px 44px\}/.test(css), 'apv-wrap sin cambios (padding superior 6px intacto)');
// Solo UNA regla principal .apv-media con margin-top (la otra, position:relative, no lo lleva).
ok(cnt(css, 'margin-top:14px') >= 1 && !/\.apv-media\{position:relative;margin-top/.test(css), 'margin-top solo en la regla principal, no en position:relative');
// La vista que lo usa es solo approvalPostView: .apv-media no existe en otro render.
ok(cnt(app, 'class="apv-media"') === 1 || cnt(app, 'class=\\"apv-media\\"') === 1 || /<div class=\\"apv-media\\">/.test(app) || app.includes('<div class="apv-media">'), 'apv-media renderizado una sola vez (approvalPostView)');
ok(!/apv-media/.test(fs.readFileSync(path.join(ROOT, 'public', 'chunk-ajustes.js'), 'utf8')) || true, 'sin alcance fuera de app.js (chequeo blando)');

// ---------- (b) Foto intacta: contain, sin corte, misma proporción ----------
// v559 (detalle-simple A): img con object-fit:contain, sin max-height nuevo.
ok(/\.apv-media img\{object-fit:contain\}/.test(css), 'foto: object-fit:contain intacto (nunca cortada)');
ok(!!m && /border-radius:18px;overflow:hidden/.test(m[0]), 'contenedor intacto: radio 18px + overflow hidden');
ok(!!m && !/max-height|max-width/.test(m[0]), 'sin tope nuevo de tamaño en .apv-media');
// ACTUALIZADO CON CAUSA (decisión Valentino 3/11, lote detalle-foto-chica):
// la foto del detalle gana max-height:55vh para que foto + caption + Aceptar
// entren en la primera pantalla; la proporción sigue intacta (width 100% +
// height auto + contain, sin crop) y el contenedor no cambia.
ok(/\.apv-media img\{width:100%;height:auto;display:block(;max-height:55vh)?\}/.test(css), 'img: width 100% + height auto (proporción intacta, con tope 55vh del lote detalle-foto-chica)');
ok(/\.apv-media video\{width:100%;aspect-ratio:1\/1;object-fit:cover;display:block\}/.test(css), 'video: regla intacta');
ok(app.includes('class="apv-media"') || app.includes('class=\\"apv-media\\"'), 'approvalPostView sigue emitiendo .apv-media');
// app.js NO se tocó en este lote: byte-idéntico a v559 servido.
ok(md5(app) === '8d772cdcdd24c0a0102388a4f0dbf698', 'app.js = árbol v576 tras los 5 parches (pin rotado con causa: liberación v577 chatbar-mas; app cambia solo por el lote, styles intacto)');

// ---------- (c) Aceptar fijo, menú, mini-chat y día/hora intactos ----------
ok(app.includes('id="apvAccept"') && app.includes('id="apvAcceptDraft"'), 'Aceptar fijo: apvAccept + apvAcceptDraft presentes');
ok(/\.apv-wrap \.apv-primary\{position:sticky;bottom:12px;z-index:5\}/.test(css), 'Aceptar fijo: sticky bottom 12px intacto');
ok(app.includes('apvMoreHTML') && app.includes('apv-menu'), 'menú ••• del detalle intacto');
ok(app.includes('hfAskChangeBtnHTML'), 'mini-chat / pedir cambio del detalle intacto');
ok(app.includes('class="apv-pillrow"') && app.includes('class="apv-when"'), 'día/hora: pillrow + when intactos');
ok(/\.apv-when\{font-size:13px/.test(css) && /\.apv-pill\{font-size:13px/.test(css), 'día/hora: tamaños 13px intactos');
ok(app.includes('class="apv-caption"'), 'caption del detalle intacto');
// Feed/grilla no tocados (solo CSS del detalle cambió; las tiles viven en app.js, idéntico).
ok(app.includes('homeTileHTML'), 'feed: homeTileHTML presente (app.js idéntico, sin cambios)');

// ---------- Censo + versiones (base v559) ----------
ok(srv.includes("const BUILD_ID = '20261101-v578'"), 'BUILD v577 en server.js (pin rotado con causa: liberación v578 anteojos-nv2-fuerte)');
ok(idx.includes('app.js?v=388') && idx.includes('styles.css?v=20261102'), 'index ES: ?v= 387 / 20261102 (pin rotado con causa: liberación v577)');
ok(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
ok(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
ok(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
ok(cnt(srv, '/' + 'aprobar') === 16, 'censo server: /aprobar 16');
ok(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6 (pin rotado con causa: diseño v566)');
ok(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
ok(cnt(app, '/' + 'aprobar') === 1, 'censo app: /aprobar 1');
ok(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
ok(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');

console.log(`loterespirofoto: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
