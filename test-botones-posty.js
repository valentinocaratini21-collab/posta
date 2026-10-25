// Test del sistema de botones Posty (barrido total 2026-10-25).
// Uso: node test-botones-posty.js <dir-del-repo> <BUILD> <APPV> <CSSV>
// p.ej.: node test-botones-posty.js . v468 299 20261036
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || '.';
const BUILD = process.argv[3], APPV = process.argv[4], CSSV = process.argv[5];
let ok = 0, bad = 0;
const t = (name, cond, extra = '') => {
  if (cond) { ok++; }
  else { bad++; console.log('FAIL:', name, extra); }
};
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
const css = read('public/styles.css');
const app = read('public/app.js');
const srv = read('server.js');
const rule = (src, sel) => {
  const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}'));
  return m ? m[0] : '';
};
// --- sistema app (styles.css) ---
t('primary celeste', /\.btn-primary\{background:var\(--cel\);color:#fff;/.test(css));
t('primary sin amarillo', !((css.match(/\.btn-primary\{[^}]*\}/g) || []).join('').match(/#FEC14D|254,193,77/)));
t('soft texto', /\.btn-soft\{background:transparent;color:var\(--cel\);border:none;/.test(css));
t('ghost texto', /\.btn-ghost\{background:transparent;color:var\(--cel\);border:none\}/.test(css));
t('danger quieto', /\.btn-danger\{background:transparent;color:var\(--dim\);border:none\}/.test(css));
t('wa texto', /\.btn-wa\{background:transparent;color:var\(--cel\);border:none\}/.test(css));
t('ig texto', /\.btn-ig\{background:transparent;color:var\(--cel\);border:none\}/.test(css));
t('x texto', /\.btn-x\{background:transparent;color:var\(--cel\);border:none\}/.test(css));
t('bb-btn primario', /\.bb-btn\{[^}]*background:var\(--cel\);color:#fff/.test(css));
t('bb-gold celeste', /\.bb-btn-gold\{background:var\(--cel\);color:#fff;/.test(css));
t('bb-ghost texto', /\.bb-btn-ghost\{background:transparent;border:none;color:var\(--cel\);/.test(css));
t('bb-mini texto', /\.bb-mini\{border:none;background:transparent;color:var\(--cel\);/.test(css));
t('pcard-actions texto', /\.pcard-actions button\{border:none;background:transparent;[^}]*color:var\(--cel\);/.test(css));
t('pcard-approve primario', /\.pcard-approve\{background:var\(--cel\) !important;color:#fff !important;/.test(css));
t('lp-gal-btn texto', /\.lp-gal-btn\{background:transparent;border:none;color:var\(--cel\);/.test(css));
t('saved-other sin punteado', /\.saved-other\{[^}]*border:none;/.test(css) && !/\.saved-other\{[^}]*dashed/.test(css));
t('src-re plano', /\.src-re\{[^}]*border:none;background:transparent;/.test(css));
t('sgal tint', /\.sgal-btn\{[^}]*background:rgba\(39,147,200,\.10\);/.test(css));
t('sgal-on celeste', /\.sgal-card\.on \.sgal-btn\{border-color:var\(--cel\);background:var\(--cel\);color:#fff\}/.test(css));
t('chat-chips tint', /\.chat-chips button\{border:none;background:rgba\(39,147,200,\.10\);color:var\(--cel\);/.test(css));
t('chat-quick tint', /background:rgba\(39,147,200,\.10\);[^}]*color:var\(--cel\)/.test(css));
t('country-on sin amarillo', !((css.match(/\.country-toggle button\.on\{[^}]*\}/g) || []).join('').match(/var\(--yl\)|254,193,77/)));
t('country-on celeste', /\.country-toggle button\.on\{[^}]*var\(--cel\)/.test(css));
t('radios 999', ['.apv-actions .btn', '.pubsheet-row .btn', '.chat-proposal-btns .btn', '.pause-btns .btn', '.igmock-accept,.igmock-now']
  .every((sel) => new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*border-radius:999px').test(css)));
t('hf-d-accept 999', /\.hf-d-accept\{[^}]*border-radius:999px/.test(css));
t('btn-lg existe', /\.btn-lg\{padding:16px 36px;font-size:16px\}/.test(css));
t('rv-mini existe', /\.rv-mini\{background:transparent;border:none;color:var\(--cel\);/.test(css));
t('lp-view-arrow existe', /\.lp-view-arrow\{background:transparent;border:none;color:var\(--cel\);/.test(css));
t('chatrm plano', /\[data-chatrm\]\{background:transparent;border:none;color:var\(--dim\);/.test(css));
t('fiesta chip tint', /\.flyerFiestaChip\{background:rgba\(39,147,200,\.10\);border:none;color:var\(--cel\)\}/.test(css));
t('sin fondos off-system en botones', !/(#22b95c|#141414|#EFE9DB|bb-gold-a|rgba\(239,68,68)/.test(
  (css.match(/\.btn-(wa|ig|x|danger)[^{]*\{[^}]*\}/g) || []).join('') +
  (css.match(/\.bb-btn[^{]*\{[^}]*\}/g) || []).join('')));
// excepciones declaradas intactas
t('igp mock intacto', /\.igp-btn\.primary\{background:#0095F6;color:#fff\}/.test(css));
t('btn-rec grabando intacto', /\.btn-rec \{ background:#D63A2F/.test(css));
// --- app.js ---
t('hero CTA sin padding inline', !/class="btn btn-primary"[^>]*style="font-size:(16px;padding:16px 36px|18px;padding:18px 44px)"/.test(app));
t('hero CTA btn-lg', (app.match(/btn btn-primary btn-lg/g) || []).length >= 4);
t('rev rv-mini x10', (app.match(/class="rv-mini" data-rev/g) || []).length === 10);
t('revdel pcard-del', /class="pcard-del" data-revdel/.test(app));
t('lc-yes celeste', /lc-yes" style="[^"]*background:#2793C8/.test(app));
t('lc-no transparente', /lc-no" style="[^"]*background:transparent;color:#2793C8/.test(app));
t('lp-view-arrow x2', (app.match(/class="lp-view-arrow" id="lpView/g) || []).length === 2);
t('CHUNK_V nuevo', BUILD ? app.includes(`CHUNK_V = '20261025-${BUILD}'`) : true);
// --- chunks ---
const cr = read('public/chunk-creator.js');
t('btnGen primario', /class="btn btn-primary" id="btnGen"/.test(cr));
t('btnUploadPhotos primario', /class="btn btn-primary" id="btnUploadPhotos"/.test(cr));
t('btnPickUpload primario', /class="btn btn-primary btn-block" id="btnPickUpload"/.test(cr));
t('talk-asset primario', /class="btn btn-primary btn-sm" data-talk-asset=/.test(read('public/chunk-reel.js')));
const aj = read('public/chunk-ajustes.js');
t('btnIgUserSave primario', /class="btn btn-primary btn-sm" id="btnIgUserSave"/.test(aj));
t('gusto-del con confirm', /data-gusto-del\]'\)\.forEach\(b => \{[^}]*confirm\(en \? 'Delete this taste\?' : '¿Borrar este gusto\?'\)/.test(aj));
// --- en/index ---
const en = read('public/en/index.html');
t('en plan CTA sin soft', !/btn btn-soft btn-block" href="\/en\/prueba">Try it free/.test(en));
t('en lp-view-arrow x2', (en.match(/class="lp-view-arrow" id="lpView/g) || []).length === 2);
t('en cssv nuevo', CSSV ? en.includes(`styles.css?v=${CSSV}`) : true);
// --- prueba ES/EN ---
for (const f of ['public/prueba.html', 'public/en-prueba.html']) {
  const p = read(f);
  t(f + ' primary celeste', /\.btn-primary\{background:var\(--cel\);color:#fff;/.test(p));
  t(f + ' ghost texto', /\.btn-ghost\{background:transparent;color:var\(--cel\);border:none\}/.test(p));
  t(f + ' share texto', /\.share-btn\{border:none;background:transparent;color:var\(--cel\);/.test(p));
  t(f + ' share-wa texto', /\.share-btn\.wa\{background:transparent;border:none;color:var\(--cel\);/.test(p));
  t(f + ' lb-btn celeste (no var(--blue))', /\.lb-btn\{[^}]*background:var\(--cel\);/.test(p) && !/\.lb-btn\{[^}]*var\(--blue\)/.test(p));
  t(f + ' lb-ghost texto', /\.lb-btn\.ghost\{background:transparent;color:var\(--cel\)\}/.test(p));
  t(f + ' pfp plano', /\.pfp-btn\{border:none;background:transparent;/.test(p));
  t(f + ' x sin bg2', !/\.x\{[^}]*background:var\(--bg2\)/.test(p));
  t(f + ' send celeste', /\.chat-input button\{[^}]*background:var\(--cel\);color:#fff;[^}]*border-radius:999px/.test(p));
  t(f + ' mini-cta celeste', /\.mini-cta\{[^}]*background:var\(--cel\);color:#fff;[^}]*border-radius:999px/.test(p));
  t(f + ' chips texto celeste', /\.chat-chips button\{[^}]*color:var\(--cel\);/.test(p));
  t(f + ' country-btn.on celeste', /\.country-btn\.on\{border:none;background:var\(--cel\);color:#fff\}/.test(p));
  t(f + ' pais-toggle.on celeste', /\.pz-pais-toggle button\.on\{border-color:var\(--cel\);box-shadow:0 0 0 3px var\(--cel\)\}/.test(p));
  t(f + ' btn radios 999', /\.btn\{border-radius:999px\}/.test(p) && /\.cta-row \.btn\{[^}]*border-radius:999px/.test(p));
  t(f + ' ghost sin padding inline', !/btn btn-ghost"[^>]*style="padding:1[23]px 26px/.test(p));
}
// --- server.js ---
t('email CTA sin amarillo', !/background:#FEC14D;color:#0A1E33/.test(srv));
t('email CTA celeste x3+', (srv.match(/background:#2793C8;color:#FFFFFF/g) || []).length >= 3);
t('BUILD nuevo', BUILD ? srv.includes(`20261025-${BUILD}`) : true);
// --- index.html ---
const ix = read('public/index.html');
t('index appv nuevo', APPV ? ix.includes(`app.js?v=${APPV}`) : true);
t('index cssv nuevo', CSSV ? ix.includes(`styles.css?v=${CSSV}`) : true);
console.log(`botones-posty: ${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
