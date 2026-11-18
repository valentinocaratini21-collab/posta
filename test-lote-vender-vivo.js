// LOTE VENDER-VIVO — suite propia: la sección «Cada posteo está pensado para vender»
// pasa de 3 tarjetas de texto a 3 escenas vivas (ES en app.js, EN en en/index.html).
// Uso: node test-lote-vender-vivo.js [root]   (root = carpeta del lote; default __dirname)
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || __dirname;
let ok = 0, mal = 0;
function chk(cond, label) { if (cond) { ok++; } else { mal++; console.log('  ✗ ' + label); } }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function n(t, s) { return t.split(s).length - 1; }

const app = read('public/app.js');
const en = read('public/en/index.html');
const css = read('public/styles.css');
const idx = read('public/index.html');

console.log('— ES (app.js) —');
chk(n(app, 'vd-kick">ASÍ VENDE CADA POSTEO<') === 1, 'kicker ES');
chk(n(app, '<h2>Cada posteo está pensado para vender.</h2>') === 1, 'título ES intacto');
for (const s of ['Una pieza, un producto', 'Nos conectamos a lo que ya usás', 'Preguntamos solo lo que falta'])
  chk(n(app, s) >= 1, 'escena ES: ' + s);
for (const s of ['vd-messy', '¡OFERTA!', '2x1 HOY', 'todo junto, sin nombre', 'lp-vender-berry.jpg', 'vd-tag', '$18',
                 'Una sola cosa, con nombre y precio. Nada genérico.',
                 'vd-plugs', 'Tiendanube', 'Tu tienda', 'el que más vendés, manda', 'sin stock · no sale',
                 'Con el login oficial de Meta, sin contraseñas.',
                 '¿La Berry sale también sin gluten?', 'Guardado · no te lo volvemos a preguntar',
                 'Una pregunta por semana, como máximo.'])
  chk(n(app, s) >= 1, 'interno ES: ' + s);
chk(n(app, 'onclick="vdAns(this)"') === 2, 'botones Sí/No con vdAns');
chk(n(app, 'function vdAns(btn)') === 1, 'vdAns definida 1 vez en app.js');
chk(n(app, 'class="vd-btnglass" href="/prueba">Empezar mi prueba gratis<') === 1, 'CTA glass ES');
for (const s of ['Cada pieza vende una sola cosa', 'si una pieza podría salir igual en otra cuenta',
                 'Tu Instagram se conecta con el login oficial de Meta', 'con opciones de un toque',
                 'no te la volvemos a hacer', 'class="steps"', 'class="step"'])
  chk(n(app, s) === 0, 'censo viejo ES = 0: ' + s);

console.log('— EN (en/index.html) —');
chk(n(en, 'vd-kick">HOW EVERY POST SELLS<') === 1, 'kicker EN');
chk(n(en, '<h2>Every post is made to sell.</h2>') === 1, 'título EN intacto');
for (const s of ['One piece, one product', 'We plug into what you already use', "We only ask what's missing"])
  chk(n(en, s) >= 1, 'escena EN: ' + s);
for (const s of ['vd-messy', 'SALE!', '2x1 TODAY', 'everything at once, no name', 'lp-vender-berry.jpg', '$18',
                 'One single thing, with its name and price. Nothing generic.',
                 'vd-plugs', 'Tiendanube', 'Your store', 'your best seller leads', "out of stock · it doesn't run",
                 "With Meta's official login — no passwords, ever.",
                 'Does the Berry also come gluten-free?', "Saved · we won't ask you again",
                 'One question a week, at most.'])
  chk(n(en, s) >= 1, 'interno EN: ' + s);
chk(n(en, 'onclick="vdAns(this)"') === 2, 'botones Yes/No con vdAns');
chk(n(en, 'function vdAns(btn)') === 1, 'vdAns definida 1 vez en EN');
chk(n(en, 'class="vd-btnglass" href="/en/prueba">Start my free trial<') === 1, 'CTA glass EN');
for (const s of ['Every piece sells one thing', 'could run unchanged on another account',
                 "Your Instagram connects with Meta's official login", 'with one-tap options',
                 "we won't ask it again", 'class="steps"', 'class="step"'])
  chk(n(en, s) === 0, 'censo viejo EN = 0: ' + s);

console.log('— estilos + stamps + asset —');
for (const s of ['.vd-cols{', '.vd-panel{', '.vd-btnglass{', '.vd-chipglass{', '@keyframes vdflow',
                 'prefers-reduced-motion: reduce){ .vd-wire path{animation:none}', '@media (max-width:980px)'])
  chk(n(css, s) >= 1, 'css: ' + s);
chk(n(idx, 'app.js?v=792') === 1 && n(idx, 'styles.css?v=20261298') === 1, 'stamps ES preparados');
chk(n(en, 'styles.css?v=20261298') === 1, 'stamp styles EN preparado');
chk(fs.existsSync(path.join(ROOT, 'public/lp-vender-berry.jpg')), 'asset lp-vender-berry.jpg presente');

console.log(`\nVENDER-VIVO: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
