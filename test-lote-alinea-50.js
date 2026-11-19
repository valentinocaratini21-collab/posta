/* LOTE ALINEA-50 — la regla fundadora alineada EN TODOS LADOS (decisión de
   Valentino 2026-11-18 15:17: «alinealo en todos lados. Los primeros 50 sale
   199 USD»). Regla final: cohorte fundadora = los PRIMEROS 50 clientes ·
   US$199/mes · conservado PARA SIEMPRE (sin 200, sin ventana de 12 meses).
   Pines estáticos sobre los archivos construidos (sin servidor):
   1. server.js: el cap funcional FOUNDERS_TOTAL = 50 y NINGUNA ventana de
      365 días aplicada al precio fundador (checkout MP y checkout Stripe);
      el header de la cohorte dice «Los Primeros 50».
   2. fundadores.html / en-fundadores.html: título, meta, og, H1, contador
      «/ 50» y cuerpo con la regla nueva (50 · US$199 · para siempre), y
      ninguna frase de la regla vieja.
   3. chunk-ajustes.js (superficie in-app «Mi plan»): distintivo «de Los
      Primeros 50» / «of The First 50» y línea de precio «para siempre» /
      «forever», sin «12 meses» / «12 months».
   4. Comentarios de mecánica alineados (db.js, stripe-billing.js,
      visibility.js): sin «Primeros 200» / «First 200» / «durante 12 meses».
   5. FUERA DE ALCANCE A PROPÓSITO (pin de no-tocado): el párrafo .pc-founder
      de #planes (public/app.js ES · public/en/index.html EN) sigue como en
      el HEAD porque YA fue alineado por el lote ANCLA-PRECIO, liberado
      antes que este — este lote NO lo pisa. (Pin re-fijado en la liberación
      de ALINEA-50 sobre el HEAD 1a9fa570: se verifica el texto alineado de
      ANCLA presente y el texto viejo ausente.) */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function read(p) { return fs.readFileSync(p, 'utf8'); }

const server = read(path.join(ROOT, 'server.js'));
const dbjs = read(path.join(ROOT, 'db.js'));
const stripeBilling = read(path.join(ROOT, 'stripe-billing.js'));
const visibility = read(path.join(ROOT, 'visibility.js'));
const fundES = read(path.join(PUB, 'fundadores.html'));
const fundEN = read(path.join(PUB, 'en-fundadores.html'));
const ajustes = read(path.join(PUB, 'chunk-ajustes.js'));
const appjs = read(path.join(PUB, 'app.js'));
const enIdx = read(path.join(PUB, 'en/index.html'));

// 1 — server.js: cap + ventanas
t('server: FOUNDERS_TOTAL = 50', server.includes('const FOUNDERS_TOTAL = 50;'));
t('server: sin FOUNDERS_TOTAL = 200', !server.includes('const FOUNDERS_TOTAL = 200;'));
t('server: header de cohorte «Los Primeros 50»', server.includes('Los Primeros 50 + campañas'));
t('server: página pública «Los Primeros 50»', server.includes('Los Primeros 50: página pública de la cohorte fundadora'));
t('server: checkout MP sin ventana 365d en precio fundador', !server.includes('founder_price_at)) < 365'));
t('server: checkout Stripe sin ventana 365d en precio fundador', (server.match(/founder_price_at/g) || []).length >= 2 && !/founder_price_at\) > 0 && \(Date\.now\(\)/.test(server));
t('server: la única ventana 365d que queda es la cookie de sesión', (server.match(/365 \* 24 \* 3600 \* 1000/g) || []).length === 1 && server.includes('maxAge: 365 * 24 * 3600 * 1000'));
t('server: stampFounder sigue cortando por el cap', server.includes('if (next > FOUNDERS_TOTAL) return 0;'));
t('server: /api/founders publica el total del cap', server.includes('total: FOUNDERS_TOTAL'));
t('server: sin «Primeros 200» en todo el archivo', !server.includes('Primeros 200') && !server.includes('Primeros200'));
t('server: sin «12 meses» en todo el archivo', !server.includes('12 meses'));

// 2 — fundadores ES
t('ES fundadores: título', fundES.includes('<title>Los Primeros 50 — Posty 💙</title>'));
t('ES fundadores: meta description', fundES.includes('los primeros 50 negocios que sumen a Posty como su community manager conservan los US$199/mes para siempre'));
t('ES fundadores: og:title', fundES.includes('Los Primeros 50 — la cohorte fundadora de Posty'));
t('ES fundadores: H1 50', fundES.includes('Los primeros <span class="hl">50</span>'));
t('ES fundadores: contador / 50', fundES.includes('<small> / 50</small>'));
t('ES fundadores: cuerpo «hasta el 50»', fundES.includes('hasta el 50.'));
t('ES fundadores: precio para siempre', fundES.includes('tu precio de fundador queda para siempre: los US$199/mes'));
t('ES fundadores: sin regla vieja', !fundES.includes('200') || fundES.includes('/api/founders'));
t('ES fundadores: cero «200» visibles', !/>200<|\/ 200|primeros 200|Primeros 200|hasta el 200/.test(fundES));
// 2 — fundadores EN
t('EN founders: title', fundEN.includes('<title>The First 50 — Posty 💙</title>'));
t('EN founders: meta description', fundEN.includes('the first 50 businesses to bring Posty on as their community manager keep US$199/month forever'));
t('EN founders: og:title', fundEN.includes("The First 50 — Posty's founding cohort"));
t('EN founders: H1 50', fundEN.includes('The first <span class="hl">50</span>'));
t('EN founders: counter / 50', fundEN.includes('<small> / 50</small>'));
t('EN founders: body «up to 50»', fundEN.includes('up to 50.'));
t('EN founders: price forever', fundEN.includes('your founder price is yours forever: the US$199/month'));
t('EN founders: cero «200» visibles', !/>200<|\/ 200|first 200|First 200|up to 200/.test(fundEN));

// 3 — chunk-ajustes (in-app)
t('ajustes: distintivo ES «de Los Primeros 50»', ajustes.includes('de Los Primeros 50'));
t('ajustes: distintivo EN «of The First 50»', ajustes.includes('of The First 50'));
t('ajustes: línea de precio ES para siempre', ajustes.includes('queda para siempre: no sube nunca'));
t('ajustes: línea de precio EN forever', ajustes.includes('is yours forever: it never goes up'));
t('ajustes: sin «Primeros 200»', !ajustes.includes('Primeros 200') && !ajustes.includes('First 200'));
t('ajustes: sin «12 meses» / «12 months»', !ajustes.includes('12 meses') && !ajustes.includes('12 months'));

// 4 — comentarios de mecánica
t('db.js: cohorte 1-50', dbjs.includes('lugar de fundador 1-50 asignado'));
t('db.js: precio fundador sin vencimiento', dbjs.includes('lo respetan PARA') && dbjs.includes('SIEMPRE, sin vencimiento'));
t('db.js: sin «Primeros 200» ni «durante 12 meses»', !dbjs.includes('Primeros 200') && !dbjs.includes('durante 12 meses'));
t('stripe-billing: header «Los Primeros 50»', stripeBilling.includes('el alta paga de Los Primeros 50'));
t('stripe-billing: sin «12 meses»', !stripeBilling.includes('12 meses'));
t('visibility: «Los Primeros 50»', visibility.includes('"Los Primeros 50"') && !visibility.includes('Primeros 200'));

// 5 — no-tocado deliberado (lote ANCLA-PRECIO, ya liberado: el HEAD trae el
// párrafo alineado; este lote no lo toca — pin re-fijado en la liberación)
t('app.js: .pc-founder alineado por ANCLA, intacto (este lote no lo toca)', appjs.includes('Precio fundador</b> para los primeros 50 clientes: los que entren ahora conservan los US$199 para siempre') && !appjs.includes('Los Primeros 200:</b>'));
t('en/index: .pc-founder alineado por ANCLA, intacto (este lote no lo toca)', enIdx.includes('Founder price</b> for the first 50 clients: join now and keep US$199 forever') && !enIdx.includes('The First 200:</b>'));
t('app.js: la línea fundadora alineada del HEAD sigue intacta', appjs.includes('Precio fundador:</b> solo para los primeros 50 clientes — los que entren ahora lo conservan para siempre'));

console.log(`ALINEA-50: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
