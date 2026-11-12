// test-lote-l3-estrella-dueno.js — LOTE L3: VALIDAR LA ESTRELLA DEL DUEÑO.
// La estrella declarada por el dueño en el formulario se confiaba a
// ciegas: effectiveStarOf la devolvía sin validar nada (Veja 12/11:
// el digest inferido dio estrella null CORRECTO, pero lo respondido
// en el formulario —«proyecto», un genérico— mandó y todo el primer
// posteo se ancló en eso). Ahora solo manda si CALZA con lo
// evidenciado (producto/servicio del digest o ventas reales); sin
// calce se trata como NO declarada: cae a la inferida (o a ventas)
// y, si no hay, null. La estrella del dueño que SÍ calza se respeta
// como antes (primera señal; pin D4 de v924 intacto).
// Autónomo (patrón de las suites del repo): fixtures, sin red ni claves.
// Se corre desde la raíz del árbol a probar (release/):
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-l3-estrella-dueno.js
// Cubre: (A) estático + alcance, (B) duenoStarEvidenceMatch (regla de
// calce), (C) effectiveStarOf, (D) deriveTopics, (E) boot local
// /api/version v932 5/5, (F) limpieza. Estampado por el preparador:
// BUILD v932 (sin estampar acá).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const http = require('http');

process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';

const ROOT = process.cwd();
const BASE = path.join(ROOT, '..', 'base-v932');
// La DB del require va a un DATA_DIR temporal: no ensuciar el árbol
// (demo.js abre la DB al hacer require — sin esto crea release/data/).
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'l3-suite-'));
process.env.DATA_DIR = tmpData;
try { require('module').Module._initPaths(); } catch (e) {}

const cdSrc = fs.readFileSync(path.join(ROOT, 'client-digest.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const cd = require(path.join(ROOT, 'client-digest.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; failed.push(name); console.log('  FAIL -', name, extra !== undefined ? '(' + JSON.stringify(extra) + ')' : ''); }
}
function eq(got, want, name) { ok(got === want, name + ' (got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want) + ')'); }
function count(re, src) { return (src.match(re) || []).length; }
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }

function mkDigest(o) {
  return {
    business: o.business || 'Veja', category: o.category || 'ropa', subcat: o.subcat || 'calzado',
    productos: (o.productos || []).map((n) => ({ nombre: n })),
    servicios: (o.servicios || []).map((n) => ({ nombre: n })),
    temas_feed: o.temas_feed || ['sneakers responsables', 'cuero reciclado'],
    inferred_star: o.inferred_star === undefined ? null : o.inferred_star,
    dueno: o.dueno === undefined ? null : o.dueno,
    onboarding: null, etapa: '', lanzamiento_fecha: null,
    connections: o.connections || null,
  };
}
// Digest de Veja de la corrida real (diagnóstico Q2): el strip no peló
// el menú-cuerpo; la inferida es null CORRECTO; lo que mandó fue la
// respuesta del formulario.
function vejaDigestLive() {
  return mkDigest({
    productos: ['RUNNING', 'SANDALES', 'accessoires', 'NOUVEAUTés', 'PROJET'],
    inferred_star: null, dueno: { estrella: 'proyecto' },
  });
}
const TN_BLOCK = {
  store_name: 'Mi Tienda', products_total: 4,
  star: { name: 'Remera Sol', units_30d: 7 },
  out_of_stock: ['Buzo Luna'], quiet: ['Gorra Río'],
  top_sellers: [{ name: 'Remera Sol', units: 7 }],
};

async function main() {
  // ---------- A) Estático + alcance ----------
  console.log('== A) estático + alcance ==');
  ok(typeof cd.duenoStarEvidenceMatch === 'function', 'duenoStarEvidenceMatch exportada');
  eq(count(/duenoStarEvidenceMatch/g, cdSrc), 6, 'helper referenciada 6 veces (comentario+llamada en effectiveStarOf, definición, comentario+llamada en deriveTopics, export)');
  eq(count(/LOTE L3/g, cdSrc), 5, 'marcadores LOTE L3 ×5 (nada más tocado en client-digest.js)');
  eq(count(/20261105-v932/g, serverSrc), 1, 'BUILD v932 ×1 en server.js (sin estampar)');
  // Archivos fuera del lote: byte-idénticos a base-v932.
  if (fs.existsSync(BASE)) {
    for (const f of ['server.js', 'demo.js', 'deep-read.js', 'web-extract.js', 'public/app.js', 'public/index.html', 'public/en/index.html', 'public/styles.css']) {
      ok(md5(path.join(ROOT, f)) === md5(path.join(BASE, f)), 'sin tocar: ' + f + ' (md5 == base-v932)');
    }
    ok(md5(path.join(ROOT, 'client-digest.js')) !== md5(path.join(BASE, 'client-digest.js')), 'client-digest.js SÍ cambió (es el lote)');
  } else {
    console.log('  (sin base-v932 al lado: pins de md5 saltados)');
  }

  // ---------- B) duenoStarEvidenceMatch: la regla de calce ----------
  console.log('== B) duenoStarEvidenceMatch ==');
  const m = (d, s) => cd.duenoStarEvidenceMatch(d, s);
  const vea = mkDigest({ productos: ['Esplar', 'Campo', 'V-10'] });
  eq(m(vea, 'Esplar'), 'Esplar', 'B1 calce exacto → nombre evidenciado');
  eq(m(vea, 'esplar'), 'Esplar', 'B2 sin distinción de mayúsculas → canónico');
  eq(m(vea, 'mis zapatillas Esplar'), 'Esplar', 'B3 la respuesta nombra el ítem en una frase → calza');
  eq(m(mkDigest({ productos: ['Veja Esplar', 'Campo'] }), 'Esplar'), 'Veja Esplar', 'B4 el ítem contiene la respuesta → calza');
  eq(m(mkDigest({ productos: ['Mint Mojito', 'Tesora'] }), 'el mint mojito de la casa'), 'Mint Mojito', 'B5 todas las palabras distintivas del ítem en la respuesta → calza');
  eq(m(vejaDigestLive(), 'proyecto'), '', 'B6 VEJA: «proyecto» no calza con ningún ítem evidenciado (ni PROJET)');
  eq(m(vea, 'novedad'), '', 'B7 genérico sin calce → no valida');
  eq(m(mkDigest({ productos: ['Blend Patagonia'] }), 'el blend de la casa'), '', 'B8 nombrar solo una parte vaga del ítem no alcanza (falta la palabra distintiva)');
  eq(m(mkDigest({ productos: ['Customer Services', 'Esplar'] }), 'Customer Services'), '', 'B9 el cromo no es evidencia de producto');
  eq(m(mkDigest({ productos: ['Esplar'], servicios: ['Corte y color'] }), 'Corte y color'), 'Corte y color', 'B10 un servicio evidenciado también valida');
  eq(m(mkDigest({ productos: ['Campera Nube'], connections: { tiendanube: TN_BLOCK } }), 'Remera Sol'), 'Remera Sol', 'B11 un top seller de ventas reales también valida');
  eq(m(mkDigest({ productos: ['Buzo Luna', 'Remera Sol'], connections: { tiendanube: TN_BLOCK } }), 'Buzo Luna'), '', 'B12 lo SIN STOCK no valida');
  eq(m(mkDigest({ productos: [] }), 'Esplar'), '', 'B13 sin evidencia no hay calce (fail-closed)');
  eq(m(vea, ''), '', 'B14 sin declaración no hay calce');
  eq(m(vea, null), '', 'B14b declaración null → no calce');
  eq(m(mkDigest({ productos: ['HOMME'] }), 'HOMME'), 'HOMME', 'B15 el dueño que calza se respeta (pin D4 v924: HOMME en productos)');
  eq(m(mkDigest({ productos: ['Esplar', 'Campo'] }), 'esplares'), 'Esplar', 'B16 plural de la respuesta → calza por formas de palabra');

  // ---------- C) effectiveStarOf ----------
  console.log('== C) effectiveStarOf ==');
  const star = (d) => cd.effectiveStarOf(d);
  const c1 = star(vejaDigestLive());
  eq(c1, null, 'C1 VEJA en vivo: dueño «proyecto» sin calce + inferida null → null (no se inventa)');
  const c2 = star(mkDigest({
    productos: ['RUNNING', 'SANDALES', 'accessoires', 'NOUVEAUTés', 'PROJET'],
    inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
    dueno: { estrella: 'proyecto' },
  }));
  eq(c2 && c2.item, 'Esplar', 'C2 dueño sin calce + inferida Esplar → cae a la inferida');
  eq(c2 && c2.source, 'inferred', 'C2b la caída es a inferred, no a dueno');
  const c3 = star(mkDigest({ productos: ['Esplar', 'Campo'], dueno: { estrella: 'novedad' } }));
  eq(c3, null, 'C3 genérico «novedad» sin calce → null');
  const c4 = star(mkDigest({
    productos: ['Esplar', 'Campo'],
    inferred_star: { item: 'Campo', confidence: 0.8, fuente: 'inferido', evidence: [] },
    dueno: { estrella: 'Esplar' },
  }));
  eq(c4 && c4.item, 'Esplar', 'C4 dueño que calza → se respeta');
  eq(c4 && c4.source, 'dueno', 'C4b fuente dueno');
  const c5 = star(mkDigest({ productos: ['Esplar'], dueno: { estrella: 'esplar' } }));
  eq(c5 && c5.item, 'Esplar', 'C5 dueño en minúscula → nombre canónico del digest');
  const c6 = star(mkDigest({ productos: ['Esplar', 'Campo'], dueno: { estrella: 'mis zapatillas Esplar' } }));
  eq(c6 && c6.item, 'Esplar', 'C6 dueño que nombra el ítem en una frase → Esplar/dueno');
  const c7 = star(mkDigest({
    productos: ['HOMME'],
    inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
    dueno: { estrella: 'HOMME' },
  }));
  eq(c7 && c7.item, 'HOMME', 'C7 D4 v924 INTACTO: dueño HOMME con HOMME evidenciado manda');
  eq(c7 && c7.source, 'dueno', 'C7b D4: fuente dueno');
  const c8 = star(mkDigest({
    productos: ['Customer Services', 'Esplar'],
    inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
    dueno: { estrella: 'Customer Services' },
  }));
  eq(c8 && c8.item, 'Esplar', 'C8 dueño «Customer Services» (cromo) no valida → cae a la inferida');
  const c9 = star(mkDigest({
    productos: ['Esplar', 'Campo'],
    inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
  }));
  eq(c9 && c9.item, 'Esplar', 'C9 sin estrella del dueño → inferida como antes');
  eq(c9 && c9.source, 'inferred', 'C9b sin dueño: fuente inferred');
  const c9b = star(mkDigest({
    productos: ['HOMME', 'Esplar'],
    inferred_star: { item: 'HOMME', confidence: 0.9, fuente: 'inferido', evidence: [] },
  }));
  eq(c9b, null, 'C9c sin dueño + inferida HOMME (categoría) → null (pin v924 intacto)');
  const c10 = star(mkDigest({
    productos: ['Remera Sol', 'Campera Nube', 'Buzo Luna', 'Gorra Río'],
    connections: { tiendanube: TN_BLOCK }, dueno: { estrella: 'Campera Nube' },
  }));
  eq(c10 && c10.item, 'Campera Nube', 'C10 pin Tiendanube INTACTO: dueño Campera Nube pisa a ventas');
  eq(c10 && c10.source, 'dueno', 'C10b fuente dueno');
  const c11 = star(mkDigest({
    productos: ['Remera Sol', 'Campera Nube'],
    connections: { tiendanube: TN_BLOCK },
    inferred_star: { item: 'Campera Nube', confidence: 0.8, fuente: 'inferido', evidence: [] },
  }));
  eq(c11 && c11.item, 'Remera Sol', 'C11 sin dueño: ventas reales mandan sobre la inferida');
  eq(c11 && c11.source, 'sales', 'C11b fuente sales');
  const c12 = star(mkDigest({
    productos: ['Buzo Luna', 'Remera Sol'],
    connections: { tiendanube: TN_BLOCK }, dueno: { estrella: 'Buzo Luna' },
  }));
  eq(c12 && c12.item, 'Remera Sol', 'C12 dueño declara un SIN STOCK → no valida, cae a ventas reales');
  eq(c12 && c12.source, 'sales', 'C12b la caída es a sales');
  const c13 = star(mkDigest({
    productos: ['Esplar'], servicios: ['Corte y color'],
    dueno: { estrella: 'Corte y color' },
  }));
  eq(c13 && c13.item, 'Corte y color', 'C13 dueño que calza con un SERVICIO → se respeta');
  eq(c13 && c13.source, 'dueno', 'C13b fuente dueno');
  const c14 = star(mkDigest({
    productos: ['Remera Sol'],
    connections: { tiendanube: TN_BLOCK }, dueno: { estrella: 'Remera Sol' },
  }));
  eq(c14 && c14.item, 'Remera Sol', 'C14 dueño que calza con un top seller (no está en productos) → se respeta');
  const c15 = star(mkDigest({ productos: [], servicios: [], dueno: { estrella: 'Tesora' } }));
  eq(c15, null, 'C15 dueño sin ninguna evidencia en el digest → null (fail-closed)');

  // ---------- D) deriveTopics: la estrella del dueño solo lidera si calza ----------
  console.log('== D) deriveTopics ==');
  const anchorsOf = (topics) => topics.map((t) => t.digest_anchor || t.headline || '');
  const d1 = cd.deriveTopics(mkDigest({
    productos: ['Esplar', 'Campo', 'V-10'],
    inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
    dueno: { estrella: 'proyecto' },
  }), { count: 5, lang: 'en' });
  eq(d1.length > 0 && d1[0].digest_anchor, 'Esplar', 'D1 dueño «proyecto» no lidera: primer topic Esplar (inferida)');
  ok(!anchorsOf(d1).some((a) => String(a).toLowerCase().includes('proyecto')), 'D1b ningún topic ancla «proyecto»', anchorsOf(d1));
  const d2 = cd.deriveTopics(mkDigest({
    productos: ['Esplar', 'Campo', 'V-10'],
    inferred_star: { item: 'Campo', confidence: 0.8, fuente: 'inferido', evidence: [] },
    dueno: { estrella: 'Esplar' },
  }), { count: 5, lang: 'en' });
  eq(d2.length > 0 && d2[0].digest_anchor, 'Esplar', 'D2 dueño Esplar que calza → primer topic Esplar');
  ok(d2.length > 0 && d2[0]._star === 1, 'D2b el primer topic lleva marca _star', d2[0]);
  const d3 = cd.deriveTopics(mkDigest({
    productos: ['HOMME', 'Esplar', 'Campo'],
    inferred_star: null, dueno: { estrella: 'HOMME' },
  }), { count: 5, lang: 'en' });
  eq(d3.length > 0 && d3[0].digest_anchor, 'Esplar', 'D3 dueño HOMME no lidera topics (HOMME no es ítem anclable)');
  ok(!anchorsOf(d3).some((a) => String(a).toLowerCase().includes('homme')), 'D3b ningún topic ancla HOMME', anchorsOf(d3));
  const d4 = cd.deriveTopics(mkDigest({
    productos: ['Esplar', 'Campo'],
    inferred_star: null, dueno: { mas_vendido: 'proyecto' },
  }), { count: 5, lang: 'en' });
  eq(d4.length > 0 && d4[0].digest_anchor, 'Esplar', 'D4 mas_vendido «proyecto» sin calce → no lidera');
  const d5 = cd.deriveTopics(mkDigest({
    productos: ['Esplar', 'Campo'],
    inferred_star: null, dueno: { mas_vendido: 'Campo' },
  }), { count: 5, lang: 'en' });
  eq(d5.length > 0 && d5[0].digest_anchor, 'Campo', 'D5 mas_vendido Campo que calza → lidera');
  const d6 = cd.deriveTopics(mkDigest({
    business: 'Pelu', category: 'belleza', subcat: 'peluqueria',
    productos: [], servicios: ['Corte y color', 'Alisado'],
    inferred_star: null, dueno: { estrella: 'Corte y color' },
  }), { count: 5, lang: 'es' });
  eq(d6.length > 0 && d6[0].digest_anchor, 'Corte y color', 'D6 dueño que calza con un servicio → primer topic el servicio');

  // ---------- E) Boot local /api/version v932 5/5 ----------
  console.log('== E) boot local ==');
  const port = 34993;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l3-boot-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getVersion = () => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/version', timeout: 5000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
  let up = false;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await getVersion();
    if (r.status === 200) { up = true; break; }
  }
  ok(up, 'boot levanta y responde /api/version');
  if (up) {
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      const r = await getVersion();
      try { if (JSON.parse(r.body).build === '20261105-v932') hits++; } catch (e) {}
    }
    ok(hits === 5, '/api/version v932 5/5 (estampado)');
  }
  const errLines = bootLog.split('\n').filter((l) => /error|Error|EADDRINUSE|Cannot find|MODULE_NOT_FOUND/i.test(l) && !/no se pudo|sin voz/i.test(l));
  ok(errLines.length === 0, 'boot sin errores en el log', errLines.slice(0, 3).join(' | '));
  const pid = child.pid;
  child.kill('SIGTERM');
  await sleep(1500);
  let alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = false; }
  if (alive) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} await sleep(500); }
  ok(!alive || (() => { try { process.kill(pid, 0); return false; } catch (e) { return true; } })(), 'boot matado por PID exacto (' + pid + ')');
  await sleep(500);
  const after = await getVersion();
  ok(after.status === 0, 'puerto ' + port + ' libre tras matar el boot');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch (e) {}

  // ---------- F) El árbol queda limpio ----------
  ok(!fs.existsSync(path.join(ROOT, 'data')), 'sin release/data/ tras la suite');
  ok(!fs.existsSync(path.join(ROOT, 'node_modules')), 'sin node_modules/ en el release');

  console.log('\n== RESULTADO ==');
  console.log('pass:', pass, 'fail:', fail);
  if (failed.length) console.log('fallidos:', failed.join(' | '));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
