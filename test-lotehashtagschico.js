// test-lotehashtagschico.js — LOTE HASHTAGS-CHICO (decisión Valentino 2/11 «arma todo»:
// en el detalle, los hashtags compiten con el caption y van en chico y suaves).
// Uso: node test-lotehashtagschico.js [dir]  (dir = raíz del árbol; default: __dirname)
// Node puro: lee el árbol y ejecuta el bloque REAL de construcción de capHTML de
// hfDetailHTML (extraído de app.js) con casos de caption/tags, más asserts de CSS.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const rule = (sel) => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}')); return m ? m[0] : ''; };
const px = (r) => { const m = r.match(/font-size:([\d.]+)px/); return m ? Number(m[1]) : null; };

// ---------- Pines v559 + censo (base de construcción, sin tocar en este lote) ----------
ok(srv.includes("const BUILD_ID = '20261101-v576'"), 'BUILD v576 en server.js (pin rotado con causa: liberación v576)');
ok(idx.includes('app.js?v=387'), 'index ES: app.js?v=387 (pin rotado con causa: liberación v576)');
ok(idx.includes('styles.css?v=20261102'), 'index ES: styles 20261102 (pin rotado con causa: liberación v576)');
ok(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
ok(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
ok(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
ok(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
ok(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6 (pin rotado con causa: diseño v566)');
ok(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
ok(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
ok(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
ok(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');

// ---------- R1: aprobación v559, solo CSS ----------
const apvCap = rule('.apv-caption'), apvTags = rule('.apv-tags');
ok(px(apvTags) === 12.5, 'apv-tags: 12.5px (antes 14px)');
ok(px(apvTags) < px(apvCap), 'apv-tags más chico que el caption (12.5 < 16)');
ok(apvTags.includes('color:var(--mut)'), 'apv-tags: gris suave var(--mut), no celeste');
ok(!apvTags.includes('var(--cel)'), 'apv-tags: sin celeste');
ok(apvCap.includes('font-size:16px'), 'apv-caption intacto en 16px');
ok(app.includes('<div class="apv-tags">${esc(tags)}</div>'), 'apv: el div de tags sigue rindiendo el mismo texto escapado');
ok(app.includes('id="apvAccept"') && app.includes('id="apvAcceptDraft"'), 'apv: Aceptar intacto');
ok(app.includes('hfAskChangeBtnHTML(p)'), 'apv: mini-chat intacto');
ok(app.includes('apvMoreHTML(p, st, canAct, isDraft, editPrompt)'), 'apv: menú ••• intacto');
ok(app.includes('<div class="apv-media">'), 'apv: foto intacta');

// ---------- R2: hoja de detalle hfDetailHTML, bloque REAL ejecutado ----------
const hfRegion = app.slice(app.indexOf('function hfDetailHTML(p, opts)'), app.indexOf('function hfIgUrl'));
const lines = hfRegion.split('\n').filter((l) => l.includes('const capFull = String(p.caption') || l.includes('const tags = String(p.hashtags') || l.includes('const capHTML = (capFull || tags)'));
ok(lines.length === 3, 'hfDetailHTML: bloque capHTML real de 3 líneas presente');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const renderCap = lines.length === 3
  ? new Function('p', 'user', 'esc', lines.join('\n') + '\nreturn capHTML;') // eslint-disable-line no-new-func
  : () => ''; // bloque ausente (prístino): los asserts del lote fallan limpio, sin crash
const r1 = renderCap({ caption: 'Nuestro sillón estrella', hashtags: '#muebles #living' }, 'negocio', esc);
ok(r1.includes('Nuestro sillón estrella'), 'hf-d: caption intacto');
ok(r1.includes('<span class="hf-d-tags">#muebles #living</span>'), 'hf-d: hashtags en su span propio');
ok(!/#muebles #living<\/div>/.test(r1), 'hf-d: hashtags ya no van como texto plano del caption');
ok(r1.indexOf('Nuestro sillón estrella') < r1.indexOf('hf-d-tags'), 'hf-d: caption antes, hashtags después');
const r2 = renderCap({ caption: 'Solo texto', hashtags: '' }, 'negocio', esc);
ok(r2.includes('Solo texto') && !r2.includes('hf-d-tags'), 'hf-d: sin hashtags no aparece nada nuevo');
const r3 = renderCap({ caption: '', hashtags: '#solo' }, 'negocio', esc);
ok(r3.includes('<span class="hf-d-tags">#solo</span>'), 'hf-d: solo hashtags rinde solo el span');
ok(renderCap({ caption: '', hashtags: '' }, 'negocio', esc) === '', 'hf-d: sin caption ni hashtags no rinde caption');
const r4 = renderCap({ caption: 'Oferta <b>hoy</b>', hashtags: '#a&b' }, 'negocio', esc);
ok(r4.includes('Oferta &lt;b&gt;hoy&lt;/b&gt;') && r4.includes('#a&amp;b'), 'hf-d: caption y hashtags siguen escapados');
ok(r1.includes('<b>negocio</b>'), 'hf-d: nombre en negrita intacto');
const hfCap = rule('.hf-d-cap'), hfTags = rule('.hf-d-tags');
ok(px(hfTags) === 12.5, 'hf-d-tags: 12.5px');
ok(px(hfTags) < px(hfCap), 'hf-d-tags más chico que el caption del detalle (12.5 < 14)');
ok(hfTags.includes('color:var(--mut)'), 'hf-d-tags: gris suave var(--mut)');
ok(hfCap.includes('font-size:14px'), 'hf-d-cap intacto en 14px');
ok(app.includes('function hfDetailHTML(p, opts)'), 'hfDetailHTML sigue definida');
ok(app.includes('data-hfd-act="comment"') && app.includes('data-hfd-act="redo"'), 'hf-d: barra y rehacer intactos');

// ---------- Fuera de alcance, intacto ----------
const homeR = app.slice(app.indexOf('function homeTileHTML'), app.indexOf('function homeTileHTML') + 8000);
ok(!homeR.includes('hf-d-tags') && !homeR.includes('apv-tags'), 'feed: tiles sin tocar');
ok(!app.includes('function pzHashtag') && cnt(app, 'function ') === cnt(fs.readFileSync(path.join(ROOT, '..', 'pristine-v575', 'public', 'app.js'), 'utf8'), 'function ') + 1 && cnt(app, 'function pzProximoPremioTira') === 1, 'M78: delta +1 = pzProximoPremioTira del lote hermano próximo-premio, mismo push (pin rotado con causa)');
const lbTags = (css.match(/#lightbox \.lb-cap-tags\{[^}]*\}/) || [''])[0];
ok(lbTags.includes('color:#2793C8'), 'visor lightbox fuera de alcance: .lb-cap-tags sigue celeste (otro lote lo alinea si se decide)');
ok(css.includes('#2793C8') && css.includes('#FEC14D') && css.includes('#0A1E33'), 'colores de marca Posty intactos');
ok(!/apv-tags|hf-d-tags/.test(fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')), 'index sin marcas del lote');
console.log('HASHTAGS-CHICO: ' + pass + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
