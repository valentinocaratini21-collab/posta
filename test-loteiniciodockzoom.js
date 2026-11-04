// LOTE INICIO-DOCK-ZOOM (3/11) — test del lote.
// 5 piezas de Valentino con captura de Inicio. Corre con node, sin deps.
//   node test-loteiniciodockzoom.js [dir-del-arbol]
//   PRISTINE_DIR=<arbol-pristino> : si se pasa, exige además que solo
//   styles.css haya cambiado (app.js, server.js y chunks byte-idénticos).
// La medición de anchos reales usa Chromium headless vía python3 +
// playwright (disponible en la VM); si no está, el test FALLA con
// mensaje claro (la medición es parte del lote, no opcional).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const os = require('os');

const TREE = process.argv[2] || path.dirname(__filename);
const PUB = path.join(TREE, 'public');
const css = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
let fails = 0;
function ok(cond, msg) {
  console.log((cond ? '  OK ' : '  FAIL ') + msg);
  if (!cond) fails++;
}
const count = (s, sub) => s.split(sub).length - 1;

// --- 1. Fuente: el bloque del lote existe una sola vez ---
ok(count(css, 'LOTE INICIO-DOCK-ZOOM') === 1, 'bloque INICIO-DOCK-ZOOM x1 en styles.css');
// Pieza 1: prow con wrap + stats con piso de contenido + contención
ok(css.includes('#inicioView:not(.hf-collapsed) .hf-prow{min-width:0;flex-wrap:wrap}'), 'pieza 1: prow con wrap');
ok(css.includes('#inicioView .hf-stats{min-width:max-content}'), 'pieza 1: stats con piso de contenido');
ok(css.includes('#inicioView{overflow-x:clip}'), 'pieza 1: clip de contención en #inicioView');
ok(css.includes('#inicioView .hf-stat span{font-size:12px}'), 'pieza 1: letra stats 12px en móvil');
ok(css.includes('#inicioView .hf-stat span{font-size:11px}'), 'pieza 1: letra stats 11px en angosto');
// Pieza 2: dock con caja de ícono de 24px
ok(css.includes('.mz-tab{display:flex;flex-direction:column;align-items:center;line-height:1.35}'), 'pieza 2: dock en columna');
ok(css.includes('.mz-tab-ic{display:flex;align-items:center;justify-content:center;height:24px;margin-bottom:2px}'), 'pieza 2: caja de ícono 24px');
// Pieza 3: + sin vidrio, mismo color que los otros
ok(css.includes('.mz-tab-mas-ic{background:transparent;border:0;box-shadow:none;'), 'pieza 3: + sin vidrio');
ok(css.includes('.mz-tab-mas-ic{background:transparent;border:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;color:#47617A}'), 'pieza 3: + color #47617A');
ok(css.includes('.bb-tab-mas-ic{background:transparent;border:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;color:#47617A}'), 'pieza 3: + bb mismo color');
// Pieza 4: aceptar arriba, una sola instancia, sin posición fixed
ok(css.includes('.hf-pacts-accept .hf-accept-bar{position:static}'), 'pieza 4: aceptar static en el encabezado');
ok(count(appjs, 'id="hfAcceptAllWeek"') === 1, 'pieza 4: una sola instancia #hfAcceptAllWeek en app.js');
ok(count(appjs, 'acceptBarHTML(') === 2, 'pieza 4: acceptBarHTML solo definición + 1 llamada');
// Pieza 5: tik oculto en la tile
ok(css.includes('#inicioView .hf-tile .hf-tik{display:none}'), 'pieza 5: tik oculto en la tile');
// Sin tocar: data/ no existe en el árbol de trabajo
ok(!fs.existsSync(path.join(TREE, 'data')), 'sin data/ en el árbol');
// Pristino (si se pasa): solo styles.css cambió
const PRISTINE = process.env.PRISTINE_DIR;
if (PRISTINE) {
  const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
  for (const rel of ['public/app.js', 'server.js', 'public/chunk-ajustes.js', 'public/chunk-analisis.js']) {
    ok(md5(path.join(TREE, rel)) === md5(path.join(PRISTINE, rel)), 'prístino intacto: ' + rel);
  }
} else {
  console.log('  SKIP pristine (sin PRISTINE_DIR): el liberador lo exige con el árbol fresco.');
}

// --- 2. Medición real con Chromium (anchos de caja, no declaraciones) ---
const HEART = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-9.5-9C.8 8.9 2.6 5 6 5c2 0 3.5 1 4.5 2.5C11.5 6 13 5 15 5c3.4 0 5.2 3.9 3.5 7C19 16.5 12 21 12 21z"/></svg>';
function tile(chip, on, tik, label) {
  const like = `<button type="button" class="hf-like hf-like-in" data-hf-like${on ? ' data-hf-on="1"' : ''}>${HEART}</button>`;
  const strip = chip ? `<span class="hf-strip"><span class="hf-chip"><span class="hf-chip-day">${label}</span></span>${like}</span>` : '';
  return `<span class="hf-cell"><span class="hf-tile${chip ? ' hf-has-chip' : ''}"><span style="display:block;aspect-ratio:3/4;background:#7ab8d9"></span>${strip}${chip ? '' : like}${tik ? '<span class="hf-tik" aria-hidden="true">✓</span>' : ''}</span></span>`;
}
const svg24 = '<svg width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor"/></svg>';
const tiles = tile(true, true, true, 'Dom · 19:00') + tile(true, false, false, 'Sáb · 19:00') + tile(false, true, false, '') + tile(false, false, false, '') + tile(true, true, false, 'Vie · 19:00') + tile(true, false, false, 'Jue · 19:00');
const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="styles.css"></head><body>
<div id="app"><div class="app-shell"><div class="main"><div id="inicioView" class="hf-wrap">
<div class="mx-port-top"><div id="pzNivelStrip" role="button" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#F4FAFE;border:1px solid #D8ECF7;border-radius:16px;box-sizing:border-box">
<span class="pz-mg"><span style="display:block;width:52px;height:52px;flex:none;border-radius:50%;background:#2793C8"></span></span>
<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px">
<strong style="font-size:16px;line-height:1.25;font-weight:600">Premios · Nv 2</strong>
<span style="display:block;height:7px;border-radius:999px;background:#C2E3F8;overflow:hidden"><span style="display:block;height:100%;width:40%;background:#2793C8;border-radius:999px"></span></span>
<span style="font-size:12px;line-height:1.3;color:#47617A">próximo: Bufanda celeste en nivel 3</span>
</span><span class="pz-strip-chev">⌄</span></div></div>
<div class="hf-head">
<div class="hf-user">posty.communitymanager<span class="hf-verified"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="#0095F6"/></svg></span></div>
<div class="hf-prow">
<div class="hf-ava"><div class="hf-ava-in"><span class="hf-ava-letter">P</span></div></div>
<div class="hf-stats"><div class="hf-stat"><b>11</b><span>publicaciones</span></div><div class="hf-stat"><b>8</b><span>seguidores</span></div><div class="hf-stat"><b>2</b><span>seguidos</span></div></div>
<span class="hf-head-icons"><button type="button" class="hf-head-ic">✎</button><button type="button" class="hf-head-ic">↗</button></span>
</div>
<div class="hf-name">Posty</div>
<div class="hf-bio">Posty postea por vos, todos los días, con tu producto real.</div>
<a class="hf-link" href="#">postycommunitymanager.com</a>
<div class="hf-racha"><button type="button" class="hf-info-row"><span class="hf-info-btn">i</span><span class="hf-info-row-txt">¿Cómo publica Posty?</span></button></div>
</div>
<div class="hf-pacts hf-pacts-accept"><button type="button" class="hf-accept-bar" id="hfAcceptAllWeek">✓ Aceptar todo <span class="accept-count">4</span></button><span class="hf-accept-note">❤️ Tocá el corazón para aprobar.</span></div>
<div class="hf-tabs"><button type="button" class="hf-tab on">▦</button><button type="button" class="hf-tab">▣</button><button type="button" class="hf-tab">◉</button></div>
<div class="hf-grid">${tiles}</div>
<div class="mz-bottomstack"><div class="mz-chatbar"><button type="button" class="mz-ph"><span class="mz-ph-tx">escribile a posty…</span></button><button type="button" class="mz-mic">🎤</button></div></div>
</div></div></div>
<nav class="mz-tabs"><button type="button" class="mz-tab on"><span class="mz-tab-ic">${svg24}</span>Inicio</button><button type="button" class="mz-tab"><span class="mz-tab-ic">${svg24}</span>Estrategia</button><button type="button" class="mz-tab mz-tab-mas"><span class="mz-tab-mas-ic">+</span><span class="mz-tab-mas-lb">Agregar</span></button><button type="button" class="mz-tab"><span class="mz-tab-ic">${svg24}</span>Premios</button><button type="button" class="mz-tab"><span class="mz-tab-ic">${svg24}</span>Ajustes</button></nav>
</div>
<script>
window.__m = function(){
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const rep = (el) => el ? {ow: el.offsetWidth, right: Math.round(el.getBoundingClientRect().right), top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom)} : null;
  const r = { viewport: window.innerWidth, bodyScrollW: document.body.scrollWidth };
  for (const [k, s] of [['inicio','#inicioView'],['head','.hf-head'],['prow','.hf-prow'],['stats','.hf-stats'],['pacts','.hf-pacts-accept'],['acceptBtn','#hfAcceptAllWeek'],['grid','.hf-grid'],['strip','#pzNivelStrip'],['chatbar','.mz-chatbar'],['dock','.mz-tabs']]) r[k] = rep(q(s));
  r.tiles = qa('.hf-tile').slice(0,3).map(rep);
  r.labelBoxes = qa('.hf-stat span').map(sp => { const b = sp.getBoundingClientRect(); return {left: Math.round(b.left), right: Math.round(b.right)}; });
  r.dockItems = qa('.mz-tabs .mz-tab, .mz-tabs .mz-tab-mas').map(el => {
    const b = el.getBoundingClientRect();
    const ic = el.querySelector('.mz-tab-ic, .mz-tab-mas-ic');
    const ib = ic ? ic.getBoundingClientRect() : null;
    let lt = null;
    const lb = el.querySelector('.mz-tab-mas-lb');
    if (lb) lt = Math.round(lb.getBoundingClientRect().top);
    else for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); lt = Math.round(rg.getBoundingClientRect().top); break; }
    return {w: Math.round(b.width), icH: ib ? Math.round(ib.height) : null, icTop: ib ? Math.round(ib.top) : null, labelTop: lt};
  });
  const cs = (el, p) => getComputedStyle(el)[p];
  r.plusColor = cs(q('.mz-tab-mas-ic'), 'color'); r.plusBg = cs(q('.mz-tab-mas-ic'), 'backgroundColor');
  r.acceptPos = cs(q('#hfAcceptAllWeek'), 'position');
  r.acceptCount = qa('#hfAcceptAllWeek').length;
  r.tileChecks = qa('.hf-cell').slice(0,4).map(cell => {
    const tik = cell.querySelector('.hf-tik');
    const tikRect = tik ? tik.getBoundingClientRect() : null;
    return {hearts: cell.querySelectorAll('.hf-like').length, tikDisp: tik ? cs(tik, 'display') : 'none', tikVisible: tikRect ? (tikRect.width > 0 && tikRect.height > 0) : false};
  });
  return r;
};
</script></body></html>`;

const PY = `
from playwright.sync_api import sync_playwright
import json, sys
fails = []
def check(cond, msg):
    print(('  OK ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    for vw in [360, 390, 430]:
        for mode, extra in [('normal', ''), ('sin-minwidth', '.main{min-width:auto!important}')]:
            pg = b.new_page(viewport={'width': vw, 'height': 844})
            pg.goto(sys.argv[1])
            if extra: pg.add_style_tag(content=extra)
            pg.wait_for_timeout(300)
            m = pg.evaluate("window.__m()")
            print(f'== vw {vw} modo {mode} ==')
            check(m['bodyScrollW'] <= vw, f"bodyScrollW {m['bodyScrollW']} <= {vw}")
            for k in ['inicio','head','prow','stats','pacts','grid','strip','chatbar','dock']:
                check(m[k]['right'] <= vw, f"{k} right {m[k]['right']} <= {vw}")
            check(m['prow']['right'] <= m['head']['right'], "prow dentro de head")
            lb = m['labelBoxes']
            check(all(lb[i]['right'] <= lb[i+1]['left'] + 1 for i in range(len(lb)-1)), f"labels sin solape {lb}")
            ts = m['tiles']
            check(ts[0]['top'] == ts[1]['top'] == ts[2]['top'], "3 tiles en una fila")
            check(max(t['ow'] for t in ts) - min(t['ow'] for t in ts) <= 1, f"tiles igual ancho {[t['ow'] for t in ts]}")
            di = m['dockItems']
            check(len(di) == 5, "dock 5 items")
            check(max(x['w'] for x in di) - min(x['w'] for x in di) <= 1, "dock igual ancho")
            check(max(x['icH'] for x in di) - min(x['icH'] for x in di) <= 0, f"dock iconos 24px {[x['icH'] for x in di]}")
            check(max(x['icTop'] for x in di) - min(x['icTop'] for x in di) <= 1, "dock iconos misma altura")
            check(max(x['labelTop'] for x in di) - min(x['labelTop'] for x in di) <= 1, "dock etiquetas misma base")
            check(m['plusColor'] == 'rgb(71, 97, 122)', f"+ color {m['plusColor']}")
            check(m['plusBg'] == 'rgba(0, 0, 0, 0)', "+ fondo transparente")
            check(m['acceptCount'] == 1, "una sola instancia Aceptar todo")
            check(m['acceptPos'] == 'static', "aceptar static")
            check(m['acceptBtn']['top'] < m['grid']['top'], "aceptar arriba del grid")
            check(m['acceptBtn']['bottom'] <= m['pacts']['bottom'], "aceptar dentro de su fila")
            tc = m['tileChecks']
            check(tc[0]['hearts'] == 1 and tc[0]['tikDisp'] == 'none' and not tc[0]['tikVisible'], "tile aprobada: 1 corazon, tik oculto")
            for i in [1, 2, 3]:
                check(tc[i]['hearts'] == 1, f"tile {i}: 1 corazon")
            pg.close()
    b.close()
print('MEDICION_FALLOS:' + str(len(fails)))
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idz-'));
fs.writeFileSync(path.join(tmp, 'styles.css'), css);
fs.writeFileSync(path.join(tmp, 'repro.html'), html);
fs.writeFileSync(path.join(tmp, 'medir.py'), PY);
try {
  const out = execFileSync('python3', [path.join(tmp, 'medir.py'), 'file://' + path.join(tmp, 'repro.html')], { encoding: 'utf8', timeout: 180000 });
  console.log(out);
  const m = out.match(/MEDICION_FALLOS:(\d+)/);
  if (!m || Number(m[1]) !== 0) { console.log('  FAIL medición Chromium'); fails++; }
} catch (e) {
  console.log('  FAIL no se pudo correr la medición Chromium (python3+playwright requeridos): ' + String(e.message).split('\n')[0]);
  fails++;
}
console.log(fails === 0 ? 'LOTE INICIO-DOCK-ZOOM: VERDE' : `LOTE INICIO-DOCK-ZOOM: ${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
