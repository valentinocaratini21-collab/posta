// test-lotedetallesimple.js — LOTE DETALLE-SIMPLE (decisión Valentino 2/11 ~08:53)
// Uso: node test-lotedetallesimple.js [dir]  (dir = raíz del árbol; default: __dirname)
// Captura (app iOS): hoja de detalle de un posteo programado con ✕, nombre,
// •••, chip de fecha, píldora "Programado", ícono de grilla, foto grande,
// fila de 5 íconos tipo IG, caja de caption en modo edición, Guardar/Cancelar,
// Frenar a todo lo ancho y Pedir un cambio. Decisión: "Esto hay que
// mejorarlo muchisimo. Esta todo muy grande. Tiene que ser mucho mas simple
// todo." Forma simple: foto limpia NUNCA cortada + caption en texto (sin
// caja por defecto) + día/hora reales en una línea chica + estado en texto
// chico + UN solo primario fijo abajo (Aceptar, como detalle-3) + todo lo
// demás en un solo menú ••• (Frenar, Pedir un cambio, Editar, Eliminar,
// No me gusta). FUERA: fila de 5 íconos IG, caja de edición por defecto,
// mini-chat propio del detalle (SUPERSEDE solo para el detalle la parte del
// mini-chat del lote simplificar-detalle: Pedir un cambio abre el flujo
// simple del lote cambio-simple vía pcAskChange → hfOpenChatForPost).
// Superficie: weekCardHTML en el pop .scf-pop (cofre #scfVault). NO se tocan
// approvalPostView, hfDetailHTML ni el rail de agenda (weekCardHTML sin simple).
// Node puro, lee el árbol + vm con DOM falso para el bloque nuevo.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

// ---------- Versiones + censo (base v556; re-rotar a v558 al liberar) ----------
ok(srv.includes("const BUILD_ID = '20261101-v559'"), 'BUILD v559 en server.js');
ok(idx.includes('app.js?v=374'), 'index ES: app.js?v=374');
ok(idx.includes('styles.css?v=20261091'), 'index ES: styles 20261091');
ok(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
ok(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
ok(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
ok(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
ok(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
ok(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
ok(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
ok(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
ok(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');
ok(!srv.includes('detSimple') && !srv.includes('igmock-simple'), 'server.js sin tocar');
ok(!idx.includes('igmock-simple'), 'index.html sin tocar');

// ---------- Forma simple: gates en weekCardHTML ----------
ok(app.includes('function weekCardHTML(d, o)'), 'componente: weekCardHTML existe');
ok(app.includes('const simple = !!(o && o.simple);'), 'weekCardHTML: o.simple');
ok(app.includes('const igChrome = (!simple && !isPending && d.image_path)'), 'sin fila IG en simple (igChrome gate)');
ok(app.includes('const acts = simple ? \'\' : '), 'sin fila de actos en simple (acts gate)');
ok(app.includes('data-capfull="${esc(capFull)}"'), 'caption simple: texto plano con data-capfull');
ok(app.includes('const simpleWhenHTML = `<div class="igmock-when-simple">'), 'línea chica día/hora+estado');
ok(app.includes('const whenTopHTML = `<div class="igmock-when-top">'), 'when-top original preservado para no-simple');
ok(app.includes('${simple ? simpleWhenHTML : whenTopHTML}'), 'when-top: simple o original');
ok(app.includes("${simple ? menuBtnHTML : '<span class=\"igmock-dots\" aria-hidden=\"true\">•••</span>'}${simpleMenuHTML}"), 'head: ••• botón en simple, span original si no');
ok(app.includes('class="igmock-dots-btn" data-pc-act="det-menu"'), 'botón ••• real con det-menu');
ok(app.includes('${simple ? \'\' : hfAskChangeBtnHTML(d)}'), 'sin mini-chat propio en simple');
ok(app.includes('class="igmock-accept-fixed" data-revaccept='), 'primario fijo Aceptar con data-revaccept');
ok(cnt(app, "${(!simple && typeof hfCropOverlayHTML === 'function') ? hfCropOverlayHTML(4, 5, enW) : ''}") === 2, 'sin overlay de recorte en simple (2 sitios)');
ok(app.includes('igmock-fixed${simple ? \' igmock-simple\' : \'\' }') || app.includes("igmock-fixed${simple ? ' igmock-simple' : ''}"), 'raíz: clase igmock-simple');
ok(app.includes("${simpleAccept ? ' igmock-has-accept' : ''}"), 'raíz: clase igmock-has-accept solo con Aceptar');
// Cofres con simple, rail sin simple.
ok(cnt(app, 'simple: true') === 2, 'simple:true exactamente 2 veces (los dos cofres)');
ok(app.includes('weekCardHTML(p, { bizName, tz, prop, count: null, simple: true, user:'), 'cofre homeGridCompose con simple');
ok(app.includes('cards.push(weekCardHTML(p, { bizName, tz, prop, count: null, simple: true }));'), 'cofre f3RevealCheck con simple');
ok(app.includes('weekCardHTML(d, { bizName, tz, prop: proposedFor(d), count:'), 'rail de agenda SIN simple (intacto)');
// Superficies que NO se tocan.
ok(app.includes('function approvalPostView'), 'approvalPostView intacta (otra superficie)');
ok(app.includes('function hfDetailHTML'), 'hfDetailHTML intacto (otra superficie)');
ok(app.includes('function hfAskChangeBtnHTML'), 'hfAskChangeBtnHTML intacto (lo usa el flujo cambio-simple)');
ok(app.includes('function pcAskChange'), 'pcAskChange intacto (destino de Pedir un cambio)');

// ---------- pcOnClick: ramas nuevas + cierre de menú ----------
ok(cnt(app, "if (act === 'det-menu') { pzDetMenuToggle(root, el); return; }") === 1, 'pcOnClick: det-menu');
ok(cnt(app, "if (act === 'det-edit') { pzDetSimpleEdit(root); return; }") === 1, 'pcOnClick: det-edit');
ok(cnt(app, "if (act === 'det-save') { pzDetSimpleSave(root, id, el); return; }") === 1, 'pcOnClick: det-save');
ok(cnt(app, "if (act === 'det-del') { pzDetSimpleDel(id, el); return; }") === 1, 'pcOnClick: det-del');
ok(cnt(app, "if (act === 'det-dislike') { try { if (typeof pcDislikeOpen === 'function') pcDislikeOpen(id, el); } catch (e) {} return; }") === 1, 'pcOnClick: det-dislike');
ok(cnt(app, "root.querySelectorAll('.igmock-menu:not([hidden])')") === 1, 'pcOnClick: cierra menú en otros actos');
ok(!app.includes('onclick="pzDet') && !app.includes('onclick="detSimple'), 'M78: sin llamadores onclick (todo por delegación pcOnClick)');

// ---------- M78: 5 funciones nuevas, definidas una vez y referenciadas ----------
for (const fn of ['detSimpleMenuHTML', 'pzDetMenuToggle', 'pzDetSimpleEdit', 'pzDetSimpleSave', 'pzDetSimpleDel']) {
  ok(cnt(app, 'function ' + fn) === 1, 'M78: ' + fn + ' definida 1 vez');
}
ok(app.includes('detSimpleMenuHTML(d, { en: enW, canPubNow, igLink: d.ig_permalink })'), 'M78: detSimpleMenuHTML llamada desde weekCardHTML');
ok(app.includes('pzDetMenuToggle(root, el)') && app.includes('pzDetSimpleEdit(root)') && app.includes('pzDetSimpleSave(root, id, el)') && app.includes('pzDetSimpleDel(id, el)'), 'M78: pzDet* llamadas desde pcOnClick');
ok(app.includes('LOTE DETALLE-SIMPLE'), 'bloque marcado con el lote');

// ---------- CSS ----------
for (const rule of [
  '.igmock-simple .igmock-media img,.igmock-simple .igmock-media video,.igmock-simple .hf-d-slide img{object-fit:contain!important;aspect-ratio:auto!important',
  '.igmock-simple .igmock-when-simple{font-size:13px',
  '.igmock-simple .igmock-dots-btn{margin-left:auto',
  '.igmock-simple .igmock-menu{display:flex;flex-direction:column',
  '.igmock-simple .igmock-menu[hidden]{display:none}',
  '.igmock-simple .igmock-menu-btn{display:block;width:100%',
  '.igmock-simple .igmock-cap{cursor:default}',
  '.igmock-simple .igmock-edit-ta{display:block;width:100%;min-height:96px;font-size:16px',
  '.igmock-simple .igmock-edit-save{display:block;width:100%',
  '.scf-pop .igmock-simple .igmock-accept-fixed{position:fixed;left:50%',
  '.scf-pop .igmock-simple.igmock-has-accept{padding-bottom:96px}',
]) ok(css.includes(rule), 'CSS: ' + rule.slice(0, 60));

// ---------- VM: bloque nuevo con DOM falso ----------
const a = app.indexOf('/* ===== (LOTE DETALLE-SIMPLE');
const b = app.indexOf('/* ===== FIN LOTE DETALLE-SIMPLE ===== */', a);
const block = (a === -1 || b === -1) ? '' : app.slice(a, b);
ok(!!block && block.includes('function detSimpleMenuHTML'), 'bloque extraíble para VM');

function fakeEl(tag) {
  const el = {
    tagName: (tag || 'DIV').toUpperCase(), className: '', children: [], style: {},
    dataset: {}, _attrs: {}, _after: null, _removed: false, _focused: false,
    textContent: '', innerHTML: '', value: '',
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    after(node) { this._after = node; },
    remove() { this._removed = true; },
    focus() { this._focused = true; },
    setSelectionRange() {},
    querySelector() { return null; },
  };
  return el;
}

async function main() {
  if (!block) return;
  const flags = { patch: null, del: null, toast: [], pop: false, render: false, confirm: true };
  const sandbox = {
    console,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: (name) => '<i data-ic="' + name + '"></i>',
    document: { createElement: (tag) => fakeEl(tag) },
    api: {
      patch: async (url, body) => { flags.patch = { url, body }; },
      del: async (url) => { flags.del = url; },
    },
    toast: (m) => { flags.toast.push(m); },
    confirm: () => flags.confirm,
    scfClosePop: () => { flags.pop = true; },
    render: () => { flags.render = true; },
    window: {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  const run = (code) => vm.runInContext(code, sandbox);

  // Menú por estado (ES).
  run('this.__mSched = detSimpleMenuHTML({ id: 7, status: "scheduled", image_path: "x.jpg" }, { en: false, canPubNow: false });');
  const mSched = sandbox.__mSched;
  ok(mSched.includes('data-pc-act="hold"') && mSched.includes('Frenar'), 'menú programado: Frenar');
  ok(mSched.includes('data-pc-act="ask-change"') && mSched.includes('Pedir un cambio'), 'menú programado: Pedir un cambio');
  ok(mSched.includes('data-pc-act="det-edit"') && mSched.includes('Editar'), 'menú programado: Editar');
  ok(mSched.includes('data-pc-act="det-del"') && mSched.includes('Eliminar'), 'menú programado: Eliminar (det-del)');
  ok(mSched.includes('data-pc-act="det-dislike"') && mSched.includes('No me gusta'), 'menú programado: No me gusta');
  ok(!mSched.includes('pubnow') && !mSched.includes('del-draft'), 'menú programado: sin Publicar ahora ni del-draft');
  ok(mSched.startsWith('<div class="igmock-menu" hidden>'), 'menú: panel hidden por defecto');
  run('this.__mDraft = detSimpleMenuHTML({ id: 8, status: "draft", image_path: "x.jpg" }, { en: false, canPubNow: true });');
  const mDraft = sandbox.__mDraft;
  ok(mDraft.includes('data-pc-act="pubnow"') && mDraft.includes('Publicar ahora'), 'menú borrador: Publicar ahora');
  ok(mDraft.includes('data-pc-act="del-draft"') && mDraft.includes('data-del-confirm='), 'menú borrador: Eliminar con confirm (del-draft)');
  ok(!mDraft.includes('data-pc-act="hold"') && !mDraft.includes('data-pc-act="det-del"'), 'menú borrador: sin Frenar ni det-del');
  run('this.__mDraft2 = detSimpleMenuHTML({ id: 8, status: "draft" }, { en: false, canPubNow: false });');
  ok(!sandbox.__mDraft2.includes('pubnow'), 'menú borrador sin canPubNow: sin Publicar ahora');
  run('this.__mPub = detSimpleMenuHTML({ id: 9, status: "published", ig_permalink: "https://ig.example/p/1" }, { en: false });');
  const mPub = sandbox.__mPub;
  ok(mPub.includes('Ver en Instagram') && mPub.includes('https://ig.example/p/1'), 'menú publicado: Ver en Instagram');
  ok(mPub.includes('Pedir un cambio'), 'menú publicado: Pedir un cambio');
  ok(!mPub.includes('data-pc-act="hold"') && !mPub.includes('det-edit') && !mPub.includes('det-del') && !mPub.includes('del-draft') && !mPub.includes('det-dislike'), 'menú publicado: sin Frenar/Editar/Eliminar/No me gusta');
  run('this.__mPub2 = detSimpleMenuHTML({ id: 9, status: "published" }, { en: false });');
  ok(sandbox.__mPub2.includes('Pedir un cambio') && !sandbox.__mPub2.includes('Ver en Instagram'), 'menú publicado sin link: solo Pedir un cambio');
  run('this.__mEn = detSimpleMenuHTML({ id: 7, status: "scheduled" }, { en: true });');
  const mEn = sandbox.__mEn;
  ok(mEn.includes('Hold') && mEn.includes('Request a change') && mEn.includes('Edit') && mEn.includes('Delete') && mEn.includes('Dislike'), 'menú EN: etiquetas en inglés');
  ok(!mSched.includes('igmock-acts') && !mSched.includes('hf-ask-form') && !mSched.includes('edit-cap') && !mSched.includes('igmock-media'), 'menú: sin fila IG, sin mini-chat, sin edición por defecto, sin foto');

  // Toggle del menú.
  const panel = fakeEl(); panel.hidden = true;
  const mBtn = fakeEl('BUTTON');
  const cardT = { querySelector: (sel) => (sel === '.igmock-menu' ? panel : null) };
  sandbox.__cardT = cardT; sandbox.__mBtn = mBtn;
  run('pzDetMenuToggle(__cardT, __mBtn);');
  ok(panel.hidden === false && mBtn.getAttribute('aria-expanded') === 'true', 'toggle: abre panel + aria-expanded true');
  run('pzDetMenuToggle(__cardT, __mBtn);');
  ok(panel.hidden === true && mBtn.getAttribute('aria-expanded') === 'false', 'toggle: cierra panel + aria-expanded false');

  // Editar: abre campo + UN Guardar, sin Cancelar; segundo llamado no duplica.
  let wrapSeen = null;
  const cap = fakeEl(); cap.dataset.capfull = 'texto original'; cap.textContent = 'negocio texto original';
  cap.after = (node) => { wrapSeen = node; };
  const cardE = { querySelector: (sel) => (sel === '.igmock-cap' ? cap : (sel === '.igmock-edit' ? wrapSeen : null)) };
  sandbox.__cardE = cardE;
  run('pzDetSimpleEdit(__cardE);');
  ok(cap.style.display === 'none', 'editar: caption oculta');
  ok(wrapSeen && wrapSeen.className === 'igmock-edit' && wrapSeen.children.length === 2, 'editar: wrap con campo + botón');
  const ta = wrapSeen.children[0], saveBtn = wrapSeen.children[1];
  ok(ta.tagName === 'TEXTAREA' && ta.value === 'texto original' && ta.className === 'igmock-edit-ta', 'editar: textarea con el caption actual');
  ok(saveBtn.getAttribute('data-pc-act') === 'det-save' && saveBtn.textContent === 'Guardar', 'editar: UN Guardar (sin Cancelar)');
  ok(!JSON.stringify(wrapSeen.children).includes('Cancelar'), 'editar: ningún botón Cancelar');
  const wrapFirst = wrapSeen;
  run('pzDetSimpleEdit(__cardE);');
  ok(wrapSeen === wrapFirst, 'editar: segundo llamado no duplica');

  // Guardar: PATCH caption, actualiza caption en su lugar, quita el wrap.
  const ta2 = fakeEl('TEXTAREA'); ta2.value = '  nuevo caption  ';
  const wrap2 = { querySelector: (sel) => (sel === 'textarea' ? ta2 : null), _removed: false, remove() { this._removed = true; } };
  const cap2 = fakeEl(); cap2.querySelector = (sel) => (sel === 'b' ? { textContent: 'negocio' } : null);
  const cardS = { querySelector: (sel) => (sel === '.igmock-edit' ? wrap2 : (sel === '.igmock-cap' ? cap2 : null)) };
  const btnS = fakeEl('BUTTON');
  sandbox.__cardS = cardS; sandbox.__btnS = btnS; flags.patch = null; flags.toast = [];
  await run('pzDetSimpleSave(__cardS, 42, __btnS);');
  ok(flags.patch && flags.patch.url === '/api/posts/42' && flags.patch.body.caption === 'nuevo caption', 'guardar: PATCH caption recortado');
  ok(cap2.innerHTML === '<b class="igmock-cap-user">negocio</b> nuevo caption', 'guardar: caption actualizado en su lugar');
  ok(cap2.style.display === '' && wrap2._removed === true, 'guardar: caption visible + wrap quitado');
  // Guardar con fallo: queda abierto, botón habilitado, toast.
  sandbox.api.patch = async () => { throw new Error('boom'); };
  const ta3 = fakeEl('TEXTAREA'); ta3.value = 'otro';
  const wrap3 = { querySelector: (sel) => (sel === 'textarea' ? ta3 : null), _removed: false, remove() { this._removed = true; } };
  const cap3 = fakeEl();
  const cardS3 = { querySelector: (sel) => (sel === '.igmock-edit' ? wrap3 : (sel === '.igmock-cap' ? cap3 : null)) };
  const btnS3 = fakeEl('BUTTON');
  sandbox.__cardS3 = cardS3; sandbox.__btnS3 = btnS3; flags.toast = [];
  await run('pzDetSimpleSave(__cardS3, 43, __btnS3);');
  ok(wrap3._removed === false && btnS3.disabled === false && flags.toast.length === 1, 'guardar con fallo: queda abierto, botón libre, toast');

  // Eliminar programado: confirm sí → del + cierra pop + render; confirm no → nada.
  sandbox.__btnD = fakeEl('BUTTON'); flags.del = null; flags.pop = false; flags.render = false; flags.confirm = true;
  await run('pzDetSimpleDel(44, __btnD);');
  ok(flags.del === '/api/posts/44' && flags.pop === true && flags.render === true, 'eliminar: del + cierra pop + render');
  flags.del = null; flags.pop = false; flags.render = false; flags.confirm = false;
  await run('pzDetSimpleDel(45, __btnD);');
  ok(flags.del === null && flags.pop === false && flags.render === false, 'eliminar sin confirm: no hace nada');
}

main().then(() => {
  console.log(`\nLOTE DETALLE-SIMPLE: ${pass} ok, ${fail} fallos`);
  process.exitCode = fail ? 1 : 0;
}).catch((e) => {
  console.log('ERROR VM: ' + (e && e.stack || e));
  process.exitCode = 1;
});
