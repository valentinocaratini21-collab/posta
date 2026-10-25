// test-gamificacion-mas.js — 6 mejoras de gamificación + copy humano (v470).
// 1) Llenado en vivo: el mount recuerda el avance previo y anima desde ahí.
// 2) Una sola fila: desafio + prueba viven en el detalle desplegable de la
//    tira; la tira colapsada sigue fina (sin filas hermanas permanentes).
// 3) Mini-festejo por desafío: chispa + línea dentro de la tira, sin modal.
// 4) Jardín antes/hoy en Mi negocio, solo con fotos reales publicadas.
// 5) Vitrina de niveles en Mi negocio, solo con fechas reales del río.
// 6) Desafio en el chat: Posty lo propone conversando + «¡Dale!» de un toque.
// + Copy: la prueba L2 ya no dice «sabe que X ofrece Y» en ningún idioma.
// Guardas: mismo endpoint de nivel; sin puntajes ni porcentajes en texto;
// sin lenguaje de fracaso; la celebración única por nivel no se toca.
'use strict';
const fs = require('fs');
const path = require('path');
const niveles = require('./niveles');

let ok = 0, fail = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function fnBody(src, name) {
  const i = src.indexOf('function ' + name);
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 1);
  return j < 0 ? src.slice(i) : src.slice(i, j);
}

console.log('— copy humano de la prueba (nunca «sabe que X ofrece Y») —');
const dItem = { item: 'medialunas artesanales', business: 'Café Aroma' };
const pEs = niveles.pruebaPara({ nivel: 2 }, dItem);
t(pEs && pEs.es === 'Posty ya conoce tu oferta: medialunas artesanales.', 'L2 ES: «Posty ya conoce tu oferta: medialunas artesanales.»');
t(pEs && pEs.en === 'Posty already knows your offer: medialunas artesanales.', 'L2 EN: «Posty already knows your offer: medialunas artesanales.»');
t(!/ofrece|offers/.test(pEs.es + ' ' + pEs.en), 'L2: sin «ofrece» ni «offers»');
const pTema = niveles.pruebaPara({ nivel: 2 }, { tema: 'café de especialidad' });
t(pTema && pTema.es === 'Posty ya conoce de tu feed el tema café de especialidad.', 'L2 tema ES intacto (ya era humano, sin cambio)');
const app0 = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
t(!app0.includes('Posty ya sabe que'), 'bundle: 0 ocurrencias de la fórmula vieja');
const srv0 = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
t(!srv0.includes('Posty ya sabe que'), 'server: 0 ocurrencias de la fórmula vieja');

console.log('— vitrina: historial solo con fechas reales —');
const NOMBRES = ['Nuevo en tu feed', 'Leyendo tu mundo', 'De la casa', 'Mano derecha de tu Instagram', 'Tu socio de contenido'];
let h = niveles.historialNiveles([
  { registro_ref: 'nivel:posty:2:abc', ts: 1700000000000 },
  { registro_ref: 'nivel:posty:2:dup', ts: 1700000001000 },
  { registro_ref: 'nivel:posty:3:xyz', ts: 1700000002000 },
  { registro_ref: 'nivel:posty:9:nope', ts: 1700000003000 },
  { registro_ref: 'otra-cosa', ts: 1700000004000 },
], 1699999999000, NOMBRES);
t(h.length === 3, 'historial: L1 (primer evento) + L2 + L3, sin L9 ni refs ajenas');
t(h[0].nivel === 1 && h[0].ts === 1699999999000 && h[0].nombre_nivel === 'Nuevo en tu feed', 'L1 fecha = primer evento del río');
t(h[1].nivel === 2 && h[1].ts === 1700000000000, 'L2 fecha = primer registro (duplicado ignorado)');
t(h[2].nivel === 3 && h[2].nombre_nivel === 'De la casa', 'L3 con nombre real');
t(niveles.historialNiveles([], null, NOMBRES).length === 0, 'sin registros: vitrina vacía, sin insignias inventadas');

console.log('— una sola fila: detalle dentro de la tira —');
const strip = fnBody(app0, 'pzNivelStripHTML');
t(strip.includes('id="pzNivelDetalle"') && strip.includes('hidden'), 'la tira incluye el detalle oculto por defecto');
t(strip.includes('pz-strip-chev') && strip.includes('aria-expanded'), 'la tira tiene chevron + aria-expanded');
t(strip.includes('data-pz-col'), 'la columna de la tira tiene data-pz-col (mini-festejo)');
t(strip.includes('${pzNivelDetalleHTML(nv, en)}'), 'la tira renderiza su detalle');
const det = fnBody(app0, 'pzNivelDetalleHTML');
t(det.includes('pz-desafio') && det.includes('pz-prueba'), 'el detalle contiene desafio + prueba');
t(det.includes('data-pz-nivel-accion="#/app/negocio"'), 'el detalle enlaza a Mi negocio');
const extra = fnBody(app0, 'pzNivelExtraHTML');
t(!extra.includes('pz-desafio') && !extra.includes('pz-prueba'), 'las hermanas ya no apilan desafio ni prueba');
t(extra.includes('pzNivelBrote') && extra.includes('pzNivelAusencia'), 'las hermanas conservan brote + ausencia');
t(app0.includes('function pzNivelToggleDetalle()'), 'definida pzNivelToggleDetalle');
t(!/location\.hash = '#\/app\/negocio';\n    \}\);/.test(fnBody(app0, 'pzNivelMount')), 'el click en la tira ya no salta directo a negocio (despliega)');

console.log('— llenado en vivo + mini-festejo —');
const mount = fnBody(app0, 'pzNivelMount');
t(mount.includes('PZ_NIVEL_PREV') && mount.includes('prev.pct'), 'el mount recuerda el avance previo');
t(mount.includes("fill.style.width = from + '%'"), 'la barrita arranca desde el avance previo, no desde 0');
t(mount.includes('pzMiniFestejoShow'), 'el mount dispara el mini-festejo al cambiar la clave del desafio');
t(mount.includes('prev.nivel === nv0.nivel'), 'el mini-festejo solo si el nivel NO subió (la subida tiene su propio festejo)');
t(app0.includes('function pzMiniFestejoShow(en)'), 'definida pzMiniFestejoShow');
t(fnBody(app0, 'pzMiniFestejoShow').includes("setTimeout") && !fnBody(app0, 'pzMiniFestejoShow').includes('pzNivelCelebShow'), 'el mini-festejo se auto-retira, sin modal de celebración');
const mini = fnBody(app0, 'pzMiniFestejoShow');
t(mini.includes('¡Desafío cumplido!') && mini.includes('Challenge done!'), 'mini-festejo ES/EN, línea corta');

console.log('— jardín + vitrina en Mi negocio —');
t(app0.includes('function pzJardinHTML(j, en)'), 'definida pzJardinHTML');
t(app0.includes('function pzVitrinaHTML(hist, en)'), 'definida pzVitrinaHTML');
t(app0.includes("api.get('/api/oficina/jardin')"), 'Mi negocio pide /api/oficina/jardin');
t(app0.includes('pzJardinHTML(jardin,'), 'Mi negocio monta el jardín solo con datos');
t(app0.includes('pzVitrinaHTML(nivJ.historial,'), 'Mi negocio monta la vitrina solo con historial');
const neg = fnBody(app0, 'bbNegocioContent');
t(neg.includes('jardin.antes.length') && neg.includes('jardin.hoy.length'), 'el jardín exige fotos en ambos lados');
t(neg.includes('nivJ.historial.length'), 'la vitrina exige historial no vacío');
t(srv0.includes("app.get('/api/oficina/jardin'"), 'server: endpoint /api/oficina/jardin');
t(srv0.includes("status = 'published'"), 'el jardín usa solo posteos publicados');
t(srv0.includes('antes: imgs.slice(0, 3), hoy: imgs.slice(-3).reverse()'), 'el jardín: 3 primeras + 3 últimas');

console.log('— desafio en el chat —');
t(app0.includes('function pzDesafioChatMaybe(box, shell)'), 'definida pzDesafioChatMaybe');
t(app0.includes('data-pz-desafio-chat-dale'), 'el reto en el chat tiene botón de un toque');
t(app0.includes("api.post('/api/oficina/nivel/desafio-aceptado'"), 'el «¡Dale!» acepta en el servidor');
t(app0.includes("pzDesafioChatMaybe(document.getElementById('bbChatBox'), true)"), 'el chat shell propone el reto');
t(app0.includes("pzDesafioChatMaybe(document.getElementById('chatBox'), false)"), 'el chat clásico propone el reto');
t(srv0.includes("app.post('/api/oficina/nivel/desafio-aceptado'"), 'server: endpoint desafio-aceptado');
t(srv0.includes('nivel_desafios_aceptados'), 'server: tabla nivel_desafios_aceptados');
t(srv0.includes('desafio_aceptado: nivelDesafioAceptado(db, uid)'), 'el endpoint de nivel devuelve desafio_aceptado');
t(srv0.includes('historial: nivelHistorial(db, uid, def)'), 'el endpoint de nivel devuelve historial');
t(srv0.includes('function nivelHistorial(') && srv0.includes('subida_nivel'), 'el historial se lee del río (subida_nivel)');

console.log('— guardas: sin puntajes, sin porcentajes, celebración intacta —');
for (const f of ['pzNivelCelebShow', 'pzNivelStoryShow', 'pzNivelFamiliaHTML']) {
  t(app0.includes('function ' + f), 'intacta ' + f);
}
t(fnBody(app0, 'pzNivelMount').includes("api.post('/api/oficina/nivel/celebrar'"), 'la celebración única por nivel sigue marcando en el servidor');
t(!/(\d+)%/.test(fnBody(app0, 'pzNivelStripHTML').replace(/width:\$\{pct\}%/g, '').replace(/data-pz-fill="\$\{pct\}"/g, '').replace(/height:100%/g, '').replace(/border-radius:50%/g, '')), 'la tira no muestra porcentajes en texto (solo dimensiones CSS)');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
for (const c of ['.pz-nivel-detalle', '.pz-strip-chev', '.pz-mini-festejo', '.pz-jardin', '.pz-vitrina']) {
  t(css.includes(c), 'CSS ' + c);
}

console.log('— pines v469 —');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
t(idx.includes('app.js?v=302'), 'index ES: app.js?v=302');
t(idx.includes('styles.css?v=20261038'), 'index ES: styles.css?v=20261038');
t(idxEn.includes('styles.css?v=20261038'), 'index EN: styles.css?v=20261038');
t(srv0.includes("BUILD_ID = '20261025-v471'"), 'server: BUILD_ID 20261025-v471');

console.log(`\n${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
