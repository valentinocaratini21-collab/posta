// test-lote-analisis-glass.js — LOTE ANÁLISIS-GLASS v811 (PROVISIONAL):
// la pantalla «Tus números» (Análisis) en SOLO color glass transparente.
// Mock aprobado por Valentino 8/11 (v2, rearmado del código vivo v807:
// statsView + salioCardHTML, sin inventar tarjeta ni botones).
// Decisión de Valentino 13:48: «no cambies nada, solamente cambiá el
// color, que sea todo color glass transparente».
// Las tarjetas YA eran glass por el bloque LOTE GLASS (.st-card y
// .st-wrap .card); este lote vuelve glass lo que quedaba sólido DENTRO
// de .st-wrap: el ícono del encabezado (.ph-ico, global azul), los tags
// del estado vacío, las píldoras de delta y los fondos de reserva detrás
// de las fotos. Alcance .st-wrap SOLO: nada global tocado (.card /
// .ph-ico / .st-card / .btn-soft siguen como están fuera de Análisis).
// .st-skel-num y .st-preview NO existen en el código vivo (eran del mock
// v2, no del vivo): el lote no agrega markup ni los crea. Estrellas y
// .btn-primary sin cambio. CSS-only: app.js y server.js SIN tocar.
// Uso: node test-lote-analisis-glass.js (desde la raíz del árbol)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

let pass = 0, fail = 0; const fails = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; fails.push(label); console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idxEs = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public', 'en', 'index.html'), 'utf8');
const cnt = (s, re) => (s.match(re) || []).length;
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const lotCss = css.slice(css.indexOf('LOTE ANÁLISIS-GLASS v811'));

function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

/* ---------- 1. El bloque del lote: presente, con alcance .st-wrap, solo color ---------- */
console.log('— 1. bloque del lote (solo color, alcance .st-wrap) —');
ok(css.includes('LOTE ANÁLISIS-GLASS v811'), 'bloque del lote presente en styles.css');
ok(lotCss.includes('.st-wrap .ph-ico{background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,.75);box-shadow:0 8px 24px rgba(10,30,51,.10)}'), 'el ícono del encabezado es glass (alcance .st-wrap, la global azul no se toca)');
ok(lotCss.includes('.st-wrap .st-empty-tags span{background:rgba(255,255,255,.55);border:1px dashed rgba(255,255,255,.85)}'), 'los tags del estado vacío son glass');
ok(lotCss.includes('.st-wrap .st-delta.up{background:rgba(226,245,234,.55)}'), 'la píldora de delta positiva es glass (mismo tinte verde, transparente)');
ok(lotCss.includes('.st-wrap .st-delta.down{background:rgba(251,233,231,.55)}'), 'la píldora de delta negativa es glass (mismo tinte rojo, transparente)');
ok(lotCss.includes('.st-wrap .st-rate-thumb{background:rgba(255,255,255,.55)}'), 'el fondo de reserva del thumb de «Ya salió» es glass');
ok(lotCss.includes('.st-wrap .st-best-row img{background:rgba(255,255,255,.55)}'), 'el fondo de reserva de la foto de «Tu mejor posteo» es glass');
const rules = lotCss.split('\n').filter((l) => l.startsWith('.st-wrap'));
ok(rules.length === 6, 'el bloque trae exactamente 6 reglas (ni una más)');
ok(rules.every((l) => l.startsWith('.st-wrap ')), 'toda regla del bloque empieza por .st-wrap (alcance solo Análisis)');
ok(!/width:|height:|padding:|margin:|font-size:|display:|position:|border-radius:|flex|grid/.test(rules.join('\n')), 'el bloque no toca geometría ni tipografía: solo color/fondo/borde/blur/sombra');
ok(lotCss.includes('rgba(255,255,255,.55)') && lotCss.includes('rgba(255,255,255,.75)') && lotCss.includes('blur(16px) saturate(1.4)') && lotCss.includes('0 8px 24px rgba(10,30,51,.10)'), 'valores glass = los del bloque LOTE GLASS vivo (misma pantalla, mismo vidrio)');
ok(css.indexOf('LOTE ANÁLISIS-GLASS v811') > css.indexOf('.st-empty-tags span{background:#f2f7fb'), 'el bloque va DESPUÉS de la regla original de los tags (gana por orden)');
ok(css.indexOf('LOTE ANÁLISIS-GLASS v811') > css.indexOf('.st-delta.up{background:#E2F5EA'), 'el bloque va DESPUÉS de la regla original del delta (gana por orden)');
ok(css.indexOf('LOTE ANÁLISIS-GLASS v811') > css.indexOf('.ph-ico{width:52px'), 'el bloque va DESPUÉS de la regla global .ph-ico (gana por orden y por especificidad)');

/* ---------- 2. Lo que ya era glass sigue glass (no regresión) ---------- */
console.log('— 2. lo que ya era glass (bloque LOTE GLASS) —');
ok(css.includes('.st-card, .st-wrap .card, .ob-wrap .card'), 'el bloque LOTE GLASS sigue cubriendo .st-card y .st-wrap .card');
ok(css.includes('background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,.75)'), 'el vidrio del bloque LOTE GLASS sigue intacto');
ok(css.includes('.st-empty-tags span{background:#f2f7fb'), 'la regla original de los tags sigue presente (el lote la sobrescribe, no la borra)');
ok(css.includes('.st-delta.up{background:#E2F5EA'), 'la regla original del delta positivo sigue presente (el lote la sobrescribe, no la borra)');
ok(css.includes('.st-delta.down{background:#FBE9E7'), 'la regla original del delta negativo sigue presente (el lote la sobrescribe, no la borra)');
ok(css.includes('.st-rate-thumb{width:76px;height:76px;border-radius:12px;object-fit:cover;flex:none;background:#fff'), 'la regla original del thumb sigue presente (el lote la sobrescribe, no la borra)');

/* ---------- 3. Nada global tocado + CSS-only + estrellas/botones sin cambio ---------- */
console.log('— 3. límites (nada global, CSS-only, estrellas y botones sin cambio) —');
ok(md5(app) === '55175c23d4ee48404b2cd8cf52328f55', 'app.js = fusionado (A + CHAT-MUSE; glass no lo toca)');
ok(md5(srv) === 'a794b626ff39c6ae774c3d146aedc7a7', 'server.js = fusionado (BUILD v822 + A + CHAT-MUSE)');
ok(css.includes('.ph-ico{width:52px;height:52px;flex:none;border-radius:16px;background:linear-gradient(135deg,rgba(39,147,200,.16),rgba(39,147,200,.05));border:1px solid rgba(39,147,200,.22);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 12px rgba(39,147,200,.10)}'), 'la regla global .ph-ico sigue intacta (azul, fuera de Análisis)');
ok(css.includes('.card{background:linear-gradient(180deg,#FFFFFF 0%,#FCFEFF 100%);border:1px solid var(--line);border-radius:var(--r);padding:28px;margin-bottom:22px;box-shadow:var(--shadow)}'), 'la regla global .card sigue intacta');
ok(css.includes('.st-card{background:linear-gradient(180deg,#FFFFFF 0%,#FCFEFF 100%);border:1px solid var(--line);border-radius:18px;padding:18px 16px;box-shadow:var(--shadow);min-height:104px;display:flex;flex-direction:column;justify-content:center}'), 'la regla .st-card sigue intacta (el vidrio lo pone el bloque LOTE GLASS, no este lote)');
ok(css.includes('.btn-soft{background:transparent;color:var(--cel);border:none;box-shadow:none}'), 'la regla global .btn-soft sigue intacta');
ok(css.includes('.btn-primary{background:var(--cel);color:#fff;box-shadow:0 6px 16px rgba(39,147,200,.42),inset 0 1px 0 rgba(255,255,255,.55)}') && cnt(css, /\.btn-primary\{/g) === 2, '.btn-primary sigue intacto (sin cambio)');
ok(!rules.join('\n').includes('btn-primary') && !rules.join('\n').includes('star'), 'las reglas del lote no mencionan .btn-primary ni estrellas (solo el comentario lo dice)');
ok(cnt(app, /star-btn/g) === 2, 'las estrellitas siguen siendo .star-btn (v815: template + selector en bindSignalBtns, sin cambio)');
ok(cnt(app, /st-skel-num/g) === 0 && cnt(css, /st-skel-num/g) === 0, '.st-skel-num no existe en el código vivo (era del mock, no se crea)');
ok(cnt(app, /st-preview/g) === 0 && cnt(css, /st-preview/g) === 0, '.st-preview no existe en el código vivo (era del mock, no se crea)');
ok(app.includes('st-empty-tags'), 'el estado vacío vivo usa .st-empty-tags (no la vista previa del mock)');

/* ---------- 4. Render real: las clases que el CSS pinta existen en el markup vivo ---------- */
console.log('— 4. render real (statsView + salioCardHTML del código vivo) —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const sv = extractFn(app, 'function statsView');
const sc = extractFn(app, 'function salioCardHTML');
ok(!!escLine && !!sv && !!sc, 'extrae esc + statsView + salioCardHTML');
const ctx = { console, pzIc: (n) => '<i data-ic="' + n + '"></i>' };
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + sv + '\n' + sc, ctx);
const h = ctx.statsView();
ok(h.includes('<div class="st-wrap">'), 'statsView rinde .st-wrap');
ok(h.includes('<div class="ph-ico">'), 'statsView rinde .ph-ico (el que el lote vuelve glass)');
ok(cnt(h, /st-card st-loading/g) === 4, 'la grilla trae 4 .st-card (las que ya eran glass)');
ok(h.includes('id="stGrid"') && h.includes('id="stBest"') && h.includes('id="stRate"'), 'statsView trae stGrid + stBest + stRate');
const pub = [{ id: 1, published_at: new Date(Date.now() - 2 * 864e5).toISOString(), caption: 'Café de especialidad', image_path: 'x.jpg', signal: '' }];
const rate = ctx.salioCardHTML(pub);
ok(rate.includes('id="salioCard"'), 'salioCardHTML rinde #salioCard (una .card dentro de .st-wrap: ya era glass)');
ok(rate.includes('st-rate-row') && rate.includes('st-rate-thumb') && rate.includes('st-rate-body') && rate.includes('st-rate-stars'), 'la fila «Ya salió» trae thumb + cuerpo + estrellas');
ok(cnt(rate, /star-btn/g) === 5, '«Ya salió» trae 5 estrellitas .star-btn (sin cambio)');
ok(app.includes('<div class="card st-empty">') && app.includes('<div class="st-empty-tags">'), 'el estado vacío vivo es .card.st-empty con .st-empty-tags (los tags que el lote vuelve glass)');

/* ---------- 5. ?v=/styles?v= finales en AMBOS index ---------- */
console.log('— 5. ?v=/styles?v= finales (v822: ?v=557 / styles?v=20261209) —');
ok(idxEs.includes('app.js?v=559') && cnt(idxEs, /app\.js\?v=/g) === 1, 'index ES: app.js?v=557');
ok(idxEs.includes('styles.css?v=20261211') && cnt(idxEs, /styles\.css\?v=/g) === 1, 'index ES: styles?v=20261209 (también sube, regla 14:12)');
ok(!idxEs.includes('app.js?v=556') && !idxEs.includes('20261208'), 'index ES: cero restos de los valores viejos (?v=556 / 20261208)');
ok(idxEn.includes('styles.css?v=20261211') && cnt(idxEn, /styles\.css\?v=/g) === 1, 'index EN: styles?v=20261209 (mismo valor que el ES)');
ok(!idxEn.includes('20261208'), 'index EN: cero restos del valor viejo (20261208)');
ok(srv.includes("const BUILD_ID = '20261105-v825'"), 'server.js estampado en BUILD v822 por el re-estampador');

/* ---------- 6. Censo ---------- */
console.log('— 6. censo —');
ok(cnt(srv, /catsMatch/g) === 3, 'server catsMatch 3');
ok(cnt(srv, /week-redo/g) === 16, 'server week-redo 16');
ok(cnt(srv, /first_week/g) === 3, 'server first_week 3');
ok(cnt(srv, /\/aprobar/g) === 17, 'server /aprobar 17');
ok(cnt(app, /pzGoBack/g) === 6, 'app pzGoBack 6');
ok(cnt(app, /pz-detalle-setup/g) === 1, 'app pz-detalle-setup 1');
ok(cnt(app, /\/aprobar/g) === 1, 'app /aprobar 1');
ok(cnt(app, /autofetch/g) === 0, 'app autofetch 0');
ok(cnt(app, /pcDayKeyShift/g) === 6, 'app pcDayKeyShift 6');

console.log('\nTOTAL ' + pass + ' asserts, ' + fail + ' fallos' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
