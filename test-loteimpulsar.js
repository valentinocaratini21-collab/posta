// test-loteimpulsar.js — LOTE IMPULSAR EN ESTRATEGIA.
// La carta de Estrategia recomienda el mejor posteo de LA SEMANA por dato
// real de IG y ofrece impulsarlo ($20/$50/$100, 7 días) por la plomería
// existente (Stripe off-session). Gates intactos: sin tasa USD→ARS no se
// cobra; sin reembolso automático si el anuncio falla tras el cobro.
// Node puro, lee el árbol. Uso: node test-loteimpulsar.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dest = fs.readFileSync(path.join(__dirname, 'public/destacado.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

// ---------- Versiones + censo (referencia v523) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v523 en server.js');
t(idx.includes('app.js?v=355') && idx.includes('styles.css?v=20261074'), 'index: app 345 + styles 20261066');
t(idxEn.includes('styles.css?v=20261074') && !idxEn.includes('app.js?v='), 'en/index: styles 20261066, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V v523 (chunk-analisis tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- Selección pura: mejor posteo de la semana ----------
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
const sb = { console };
vm.createContext(sb);
const codeSel = extractFn(srv, 'elegirMejorPosteoSemana');
t(codeSel.length > 0, 'existe elegirMejorPosteoSemana');
if (codeSel) vm.runInContext(codeSel.replace('function elegirMejorPosteoSemana', 'globalThis.elegirMejorPosteoSemana = function'), sb);
if (sb.elegirMejorPosteoSemana) {
  const f = sb.elegirMejorPosteoSemana;
  t(f([]) === null && f(null) === null, 'sin filas = sin recomendación');
  t(f([{ id: 1, likes: 0, comments: 0, saved: 0, reach: 500 }]) === null, 'interacción 0 = sin recomendación (nunca un mejor inventado)');
  t(f([{ id: 1, likes: 0, comments: 0, saved: 0 }]) === null, 'sin fila de métricas útil = null');
  const win = f([
    { id: 1, likes: 10, comments: 2, saved: 0, reach: 300 },
    { id: 2, likes: 5, comments: 9, saved: 0, reach: 900 },
    { id: 3, likes: 8, comments: 4, saved: 0, reach: 100 },
  ]);
  t(win && win.id === 2, 'gana la mayor interacción (14), no el mayor alcance');
  const tie = f([
    { id: 1, likes: 5, comments: 5, saved: 0, reach: 100 },
    { id: 2, likes: 5, comments: 5, saved: 0, reach: 400 },
  ]);
  t(tie && tie.id === 2, 'empate de interacción: desempata el alcance');
  const tie2 = f([
    { id: 1, likes: 5, comments: 5, saved: 0, reach: 100 },
    { id: 2, likes: 5, comments: 5, saved: 0, reach: 100 },
  ]);
  t(tie2 && tie2.id === 2, 'empate total: desempata el más reciente (id mayor)');
}

// ---------- Endpoint mejor-posteo: forma y filtros ----------
t(srv.includes("app.get('/api/estrategia/mejor-posteo'"), 'existe GET /api/estrategia/mejor-posteo');
t(srv.includes('JOIN post_metrics m ON m.post_id = p.id'), 'mejor-posteo: JOIN (solo con fila de métricas)');
t(srv.includes("AND p.status = 'published'") && srv.includes('AND p.week_key = ?'), 'mejor-posteo: publicados de la semana (week_key)');
t(srv.includes('mondayKeyOf(tzToday(userTz(uid)))'), 'mejor-posteo: semana = lunes actual en zona de la cuenta');
t(srv.includes('boostHabilitado: destacadoSemana.boostHabilitado(process.env)'), 'mejor-posteo: expone boostHabilitado (sin botones muertos)');

// ---------- Impulsar con posteoId: validación, gates en orden ----------
t(srv.includes('const posteoIdReq = Number(req.body.posteoId) || 0'), 'impulsar: acepta posteoId opcional');
t(srv.includes("motivo: 'posteo_no_encontrado'"), 'impulsar: posteo ajeno/inexistente → 404');
t(srv.includes('semana: { destacadoId: targetId }'), 'impulsar: el objetivo es el posteo elegido');
t(srv.includes("if (!posteoIdReq && !st.destacadoPublicado)"), 'impulsar: flujo viejo intacto sin posteoId');
t(!dest.includes('anaBoostRec') && !dest.includes('estrategia'), 'destacado.js intacto: sin código de la carta (el detalle conserva su Impulsar)');
t(!chunk.includes('destacado-dec'), 'la carta no duplica el botón del detalle');

// ---------- Gates del cobro (módulo real, sin Stripe) ----------
const ds = require(path.join(__dirname, 'destacado-semana.js'));
(async () => {
  const base = { semana: { destacadoId: 7 }, monto: 50, clienteId: 1, zona: 'AR',
    env: { DESTACADO_BOOST_ENABLED: '1' }, adsConfigurado: true, paginaAutorizada: true,
    posteoPublicado: true, registrar: async () => {} };
  let cobroLlamado = false;
  const r1 = await ds.procesarImpulso({ ...base, conversionARS: null,
    cobrar: async () => { cobroLlamado = true; return { ok: true, cobroId: 'pi_x' }; },
    publicarAnuncio: async () => ({ ok: true }) });
  t(r1 && !r1.ok && r1.motivo === 'conversion_pendiente', 'gate: sin tasa → conversion_pendiente');
  t(!cobroLlamado, 'gate: sin tasa → NO se cobra (fail-closed antes del cobro)');
  const r2 = await ds.procesarImpulso({ ...base, conversionARS: () => 500000,
    cobrar: async () => ({ ok: true, cobroId: 'pi_x' }),
    publicarAnuncio: async () => ({ ok: true, anuncioId: 'c1', campaignId: 'c1', adsetId: 'a1', adId: 'd1' }) });
  t(r2 && r2.ok && r2.posteoId === 7 && r2.montoUSD === 50, 'con tasa: el flujo completo sigue funcionando');
  const r3 = await ds.procesarImpulso({ ...base, conversionARS: () => 500000,
    cobrar: async () => ({ ok: true, cobroId: 'pi_y' }),
    publicarAnuncio: async () => { throw new Error('meta caído'); } });
  t(r3 && !r3.ok && r3.motivo === 'anuncio_fallido' && r3.cobroId === 'pi_y', 'anuncio fallido tras cobro: motivo + cobroId, sin reembolso automático');
  t(ds.validarMonto(20) && ds.validarMonto(50) && ds.validarMonto(100) && !ds.validarMonto(30), 'montos: solo 20/50/100');

  // ---------- Cliente: tarjeta, motivos, estilos ----------
  const sb2 = { console, anaLang: 'es', anaPastMode: false,
    anaT: (es) => es,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  vm.createContext(sb2);
  for (const n of ['anaBoostRecPartes', 'anaBoostRecMotivo', 'anaBoostRecHTML']) {
    const c = extractFn(chunk, n);
    t(c.length > 0, 'existe ' + n);
    if (c) vm.runInContext(c.replace('function ' + n, 'globalThis.' + n + ' = function'), sb2);
  }
  if (sb2.anaBoostRecPartes) {
    const p = sb2.anaBoostRecPartes({ likes: 12, comments: 0, saved: 3, reach: 400 });
    t(p.join('|') === '12 me gusta|3 guardados|alcance 400', 'porqué: solo métricas > 0, sin ceros');
  }
  if (sb2.anaBoostRecMotivo) {
    const m1 = sb2.anaBoostRecMotivo('conversion_pendiente', 50, null);
    t(m1.includes('No se cobró nada') && m1.includes('conversión'), 'motivo conversion_pendiente: armado, sin cobro, sin tasa inventada');
    const m2 = sb2.anaBoostRecMotivo('anuncio_fallido', 50, 'pi_y');
    t(m2.includes('sin reembolso automático') && m2.includes('pi_y'), 'motivo anuncio_fallido: sin reembolso automático + cobroId');
  }
  if (sb2.anaBoostRecHTML) {
    const h = sb2.anaBoostRecHTML({ mejor: { post_id: 9, image_path: 'x.jpg', caption: 'Hola', reach: 400, likes: 12, comments: 3, saved: 0 }, boostHabilitado: true });
    t(h.includes('Tu mejor posteo de la semana') && h.includes('$20') && h.includes('$50') && h.includes('$100') && h.includes('12 me gusta'), 'tarjeta: título + 3 montos + porqué con datos');
    const hOff = sb2.anaBoostRecHTML({ mejor: { post_id: 9, image_path: '', caption: '', reach: 10, likes: 2, comments: 0, saved: 0 }, boostHabilitado: false });
    t(!hOff.includes('$20') && hOff.includes('todavía no está habilitado'), 'flag off: sin botones muertos, nota honesta');
  }
  t(cnt(chunk, 'id="anaBoostRec"') === 2, 'placeholder en ambas ramas de la carta');
  t(chunk.includes('anaBoostRecLoad()') && chunk.includes('async function anaBoostRecLoad'), 'loader conectado al render (anaLoad + anaBackCurrent)');
  t(chunk.includes("api.get('/api/estrategia/mejor-posteo')"), 'loader: pide mejor-posteo');
  t(chunk.includes("api.post('/api/destacado/impulsar'"), 'confirmar: postea impulsar con posteoId');
  t(chunk.includes('anaPastMode') && chunk.includes('if (!box || anaPastMode) return'), 'cartas anteriores: sin tarjeta');
  t(css.includes('.ana-boostrec{') && css.includes('.ana-boostrec-img'), 'estilos de la tarjeta presentes');

  console.log(`\ntest-loteimpulsar: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e.message); process.exit(1); });
