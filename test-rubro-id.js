'use strict';
/* test-rubro-id.js — IDENTIFICACIÓN ESPECIALISTA DE RUBRO (v235, 2026-10-19)
 * La regla de Valentino: "si no estamos 100% seguros de su rubro, Posty
 * pregunta" — y en la prueba la pregunta va ANTES de generar. Este test
 * re-corre las 20 fixtures de la auditoría de detección
 * (equipo-posty/hidden_files/auditoria-deteccion-rubro-2026-10-18.md)
 * contra el clasificador nuevo (rubro-id.js), más la cadena completa:
 * pregunta en /prueba → digest → siembra → pool de prompts.
 * Costo IA: CERO (sin llamadas: la visión desempate no se ejercita acá).
 * Corre con: node test-rubro-id.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-rubro-'));
process.env.DATA_DIR = TMP;

const rubroId = require('./rubro-id');
const clientDigest = require('./client-digest');
const demo = require('./demo');
const IS = require('./image-styles');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
const res = (sig) => rubroId.resolveRubro({ cls: rubroId.classifyBusiness(sig) });

console.log('== (a) Las 20 fixtures de la auditoría: ANTES (regex único) → DESPUÉS (voto multi-señal) ==');
// [nombre, señales, rubro esperado, subrubro esperado, modo, ANTES según la auditoría]
// modo 'segura': cierra sin pregunta · 'top': candidata 1 correcta, duda honesta permitida
const FIXTURES = [
  ['veterinaria', { bio: 'Clínica veterinaria · Vacunas, consultas y cirugías · Urgencias 24h', captions: ['Vacunas al día para tu perro', 'Castración y consultas para gatos'] }, 'mascotas', 'veterinaria', 'segura', 'belleza ✗'],
  ['ferretería', { bio: 'Ferretería y herramientas · Algunas ofertas de la semana · Pinturas y tornillos' }, 'hogar', '', 'top', 'belleza ✗'],
  ['petshop c/ peluquería canina', { bio: 'Pet shop · Alimento balanceado · Peluquería canina y baño · Juguetes para perros y gatos', captions: ['Baño canino y alimento balanceado para tu mascota'] }, 'mascotas', 'petshop', 'segura', 'barberia ✗'],
  ['muebles de cocina', { bio: 'Fábrica de muebles de cocina a medida · Melamina y laqueados', formText: 'Hacemos muebles de cocina y placares a medida' }, 'hogar', '', 'top', 'gastronomia ✗'],
  ['makeup bio flaca (Mili)', { bio: 'Novias & eventos ✨', handle: 'milicaratinimakeup', captions: ['Maquillaje para novias: prueba y maquillaje el gran día', 'Makeup social para eventos, maquillaje profesional', 'Maquillaje de fiesta que dura toda la noche'] }, 'belleza', 'makeup', 'segura', 'otro ✗'],
  ['constructora', { bio: 'Constructora · Obras y reformas integrales · Construcción de viviendas', captions: ['Obra en curso: reformas integrales y construcción'] }, 'inmobiliaria', 'constructora', 'segura', 'otro ✗'],
  ['entrenador personal', { bio: 'Entrenador personal online · Planes de entrenamiento personalizados · Preparador físico', captions: ['Entrenamiento personalizado para vos'] }, 'fitness', 'entrenador', 'segura', 'otro ✗'],
  ['vivero', { bio: 'Vivero · Plantas, macetas y suculentas · Todo para tu jardín', captions: ['Llegaron suculentas y plantas de interior'] }, 'flores', 'vivero', 'segura', 'otro ✗'],
  ['peluquería femenina', { bio: 'Peluquería femenina · Balayage, mechas y color · Peinados para eventos', captions: ['Balayage y color para ella'] }, 'belleza', 'peluqueria', 'segura', 'barberia ~'],
  ['uñas', { bio: 'Nail studio · Uñas esculpidas y esmaltado semipermanente · Manicuría', captions: ['Uñas esculpidas con semipermanente'] }, 'belleza', 'unas', 'segura', 'belleza sin subrubro ~'],
  ['sushi', { bio: 'Sushi y cocina nikkei · Omakase, rolls y nigiris frescos', captions: ['Rolls y nigiris de autor #sushi'] }, 'gastronomia', 'sushi', 'segura', 'gastronomia ~'],
  ['restaurante de pastas', { bio: 'Restaurante de pastas · Cocina italiana, menú del día y chef propio', captions: ['Pastas caseras y menú del día'] }, 'gastronomia', '', 'top', 'gastronomia ~'],
  ['café de especialidad', { bio: 'Café de especialidad · Espresso y flat white · Baristas', captions: ['Espresso y latte art de nuestros baristas'] }, 'cafeteria', 'cafe', 'segura', 'cafeteria'],
  ['panadería', { bio: 'Panadería y pastelería · Facturas, medialunas y tortas por encargo', captions: ['Medialunas recién horneadas y facturas'] }, 'cafeteria', 'panaderia', 'segura', 'cafeteria ~'],
  ['taller mecánico', { bio: 'Taller mecánico · Service, frenos y diagnóstico · Reparamos tu auto', captions: ['Service y frenos para tu auto'] }, 'autos', 'taller', 'segura', 'autos ~'],
  ['repuestos', { bio: 'Repuestos y autopartes · Venta de repuestos originales · Baterías y neumáticos', captions: ['Repuestos originales y autopartes'] }, 'autos', 'repuestos', 'segura', 'autos ~'],
  ['odontología', { bio: 'Odontología integral · Implantes y ortodoncia · Clínica dental', captions: ['Salud bucal: implantes y limpieza dental'] }, 'salud', '', 'top', 'salud ✓'],
  ['barbería', { bio: 'Barbería · Cortes, fade y arreglo de barba con navaja', captions: ['Fade y barba con navaja'] }, 'barberia', '', 'segura', 'barberia'],
  ['gimnasio', { bio: 'Gimnasio · Musculación, crossfit y clases de funcional', captions: ['Musculación y crossfit todos los días'] }, 'fitness', 'gimnasio', 'segura', 'fitness'],
  ['florería', { bio: 'Florería · Ramos y arreglos florales · Flores frescas todos los días', captions: ['Ramos frescos y arreglos florales'] }, 'flores', 'floreria', 'segura', 'flores'],
  ['inmobiliaria', { bio: 'Inmobiliaria · Venta y alquiler de propiedades · Tasaciones', captions: ['Propiedades en venta y alquiler · Tasaciones sin cargo'] }, 'inmobiliaria', 'inmobiliaria', 'segura', 'inmobiliaria'],
  ['parrilla', { bio: 'Parrilla libre · Asado, vacío y achuras · Bodegón de barrio', captions: ['Asado y vacío a la parrilla'] }, 'gastronomia', 'parrilla', 'segura', 'gastronomia'],
];
for (const [name, sig, wantRubro, wantSub, modo, antes] of FIXTURES) {
  const cls = rubroId.classifyBusiness(sig);
  const r = rubroId.resolveRubro({ cls });
  const topOk = cls.candidatas.length && cls.candidatas[0].rubro === wantRubro;
  ok(topOk, `${name}: candidata 1 = ${cls.candidatas[0] && cls.candidatas[0].rubro} (antes: ${antes})`);
  ok(cls.rubro !== 'belleza' || wantRubro === 'belleza', `${name}: jamás belleza por error de borde`);
  if (modo === 'segura') {
    ok(cls.segura === true, `${name}: cierra SIN pregunta (conf ${cls.confianza})`);
    ok(r.category === wantRubro && r.subcat === wantSub, `${name}: resuelto ${r.category}/${r.subcat || '—'} = ${wantRubro}/${wantSub || '—'}`);
  } else {
    ok(r.category === wantRubro, `${name}: la resolución cae al padre correcto ${r.category}`);
    ok(r.subcat === wantSub, `${name}: sin subrubro inventado (subcat='${r.subcat}')`);
  }
}
// La peluquería femenina NUNCA es barbería cuando la bio lo dice:
{
  const cls = rubroId.classifyBusiness({ bio: 'Peluquería femenina · Balayage, mechas y color' });
  ok(cls.rubro === 'belleza', 'peluquería femenina ≠ barbería (rubro belleza)');
}

console.log('== (a2) Fixes del regex legado (demo.categoryFromText) ==');
{
  ok(demo.categoryFromText('Clínica veterinaria · Vacunas y castraciones') === 'mascotas', '"vacunas" ya no es uñas: veterinaria → mascotas');
  ok(demo.categoryFromText('Ferretería · Algunas ofertas de la semana') !== 'belleza', '"algunas" ya no es uñas');
  ok(demo.categoryFromText('Pet shop con peluquería canina y baño') === 'mascotas', 'peluquería canina → mascotas (fuera de barbería)');
  ok(demo.categoryFromText('Fábrica de muebles de cocina a medida') === 'hogar', 'muebles de cocina → hogar, no gastronomía');
  ok(demo.categoryFromText('Constructora · obras y reformas') === 'inmobiliaria', 'constructora → inmobiliaria');
  ok(demo.categoryFromText('Entrenador personal · preparador físico') === 'fitness', 'entrenador → fitness');
  ok(demo.categoryFromText('Vivero · plantas y macetas') === 'flores', 'vivero → flores');
}

console.log('== (a3) JSON-LD: el @type de la web vota primero ==');
{
  ok(rubroId.jsonldVote('VeterinaryCare').rubro === 'mascotas', 'jsonldVote VeterinaryCare → mascotas');
  ok(rubroId.jsonldVote('HairSalon').subrubro === 'peluqueria', 'jsonldVote HairSalon → belleza/peluqueria');
  ok(rubroId.jsonldVote('Store') === null, 'jsonldVote Store genérico → sin voto');
  const cls = rubroId.classifyBusiness({ jsonldType: 'VeterinaryCare', webText: 'Bienvenidos a nuestra clínica' });
  ok(cls.segura && cls.rubro === 'mascotas' && cls.subrubro === 'veterinaria', 'JSON-LD + web: mascotas/veterinaria segura (auto-declaración = doble familia)');
  const weSrc = fs.readFileSync('web-extract.js', 'utf8');
  ok(weSrc.includes('categoryHint:'), 'web-extract DEVUELVE categoryHint (la cabecera lo prometía desde v209)');
}

console.log('== (b) Mili: jamás pelo — la cadena entra al spec con mundo makeup ==');
{
  const sig = { bio: 'Novias & eventos ✨', handle: 'milicaratinimakeup', captions: ['Maquillaje para novias', 'Makeup social para eventos', 'Maquillaje profesional para fiestas'] };
  const cls = rubroId.classifyBusiness(sig);
  ok(cls.rubro === 'belleza' && (cls.subrubro === 'makeup' || (cls.candidatas[0] && cls.candidatas[0].subrubro === 'makeup')), `Mili → belleza/makeup (o makeup candidata 1): ${cls.rubro}/${cls.subrubro}`);
  const r = rubroId.resolveRubro({ cls });
  const digest = clientDigest.buildFromParts({ business: 'Mili Makeup', feed: { bio: sig.bio, captions: sig.captions, name: 'Mili', handle: sig.handle }, rubroId: r.rubroId, category: r.category, subcat: r.subcat });
  ok(digest.subcat === 'makeup', `digest.subcat = ${digest.subcat} (en clientes ya no es '')`);
  ok(digest.rubro_id && digest.rubro_id.rubro === 'belleza', 'digest.rubro_id persistido y versionado');
  const spec = demo.buildDemoSpec({ business: 'Mili Makeup', category: 'belleza', country: 'AR', tone: 'vos', count: 3, bioText: sig.bio, digest });
  ok(spec.subcat === 'makeup', `spec.subcat = ${spec.subcat}: los temas salen del banco makeup, no del de pelo`);
  const ctx = demo.photoGateCtx({ category: 'belleza', subcat: 'makeup', topic: null });
  ok(ctx.world.has('makeup') && !ctx.world.has('pelo'), 'mundo visual makeup (sin pelo)');
  const ctxN = demo.photoGateCtx({ category: 'belleza', subcat: '', topic: null, neutralDefault: true });
  ok(!ctxN.world.has('pelo') && !ctxN.world.has('makeup') && ctxN.world.has('local'), 'belleza SIN subrubro confirmado (contexto cliente) → mundo NEUTRO');
  const ctxLegacy = demo.photoGateCtx({ category: 'belleza', subcat: '', topic: null });
  ok(ctxLegacy.world.has('pelo'), 'harness legacy sin digest conserva su default (compat de tests)');
}

console.log('== (c) Flujo de prueba: la pregunta va ANTES de generar ==');
{
  // Duda de subrubro (makeup/unas/estética empatados, rubro firme):
  const duda = rubroId.classifyBusiness({ bio: 'Belleza integral: maquillaje, uñas y estética corporal', captions: ['Seguinos para más tips de belleza'] });
  const rd = rubroId.resolveRubro({ cls: duda });
  ok(rd.rubroCheck.needed === true, 'fixture dudosa → rubro_check.needed = true');
  ok(rd.rubroCheck.options.length >= 2, `opciones de un toque: ${rd.rubroCheck.options.map((o) => o.label).join(' · ')}`);
  ok(rd.category === 'belleza' && rd.subcat === '', 'sin respuesta: padre seguro + subrubro vacío');
  ok(rd.rubroId.sin_confirmar === true && rd.rubroId.needs_question === true, 'queda registrado como SIN CONFIRMAR');
  // Segura: cero fricción.
  const segura = rubroId.classifyBusiness({ bio: 'Sushi y cocina nikkei · Omakase, rolls y nigiris', captions: ['Rolls y nigiris de autor'] });
  const rs = rubroId.resolveRubro({ cls: segura });
  ok(rs.rubroCheck.needed === false && rs.rubroId.fuente === 'deteccion', 'fixture segura → needed=false, genera directo');
  // Confirmación por pregunta: manda sobre el voto.
  const rc = rubroId.resolveRubro({ confirmed: { rubro: 'belleza', subrubro: 'unas', fuente: 'pregunta' }, cls: duda });
  ok(rc.category === 'belleza' && rc.subcat === 'unas' && rc.rubroId.fuente === 'pregunta' && rc.rubroCheck.needed === false, 'la confirmación de la pregunta manda (fuente pregunta)');
  // Orden en las fuentes: la pregunta gatilla antes de runGeneration y
  // el server resuelve el rubro antes de armar el spec.
  const html = fs.readFileSync('public/prueba.html', 'utf8');
  ok(html.includes('id="rubroCard"'), '/prueba tiene la tarjeta de la pregunta');
  ok(html.includes('const TRIAL_ENGINE_V = 24;'), 'TRIAL_ENGINE_V = 24');
  const segPrefill = html.slice(html.indexOf('function startTrialPrefill'), html.indexOf('function startTrialPrefill') + 900);
  ok(segPrefill.indexOf('PENDING_RUBRO') > -1 && segPrefill.indexOf('PENDING_RUBRO') < segPrefill.indexOf('runGeneration'), 'startTrialPrefill: la pregunta precede a runGeneration');
  const segWeb = html.slice(html.indexOf('function startTrialWeb'), html.indexOf('function startTrialWeb') + 900);
  ok(segWeb.indexOf('PENDING_RUBRO') > -1 && segWeb.indexOf('PENDING_RUBRO') < segWeb.indexOf('runGeneration'), 'startTrialWeb: la pregunta precede a runGeneration');
  ok(html.includes("fd.append('rubro_src'"), 'la confirmación viaja en el formulario (rubro_src/subcat)');
  const srv = fs.readFileSync('server.js', 'utf8');
  ok(srv.includes('rubro_check: hasVotes ? resolved.rubroCheck'), 'prefill devuelve rubro_check');
  ok(srv.includes('rubro_check: wHasVotes ? wresolved.rubroCheck'), 'web-prefill devuelve rubro_check');
  ok(srv.indexOf('const rubroRes = resolveTrialRubro') > -1 && srv.indexOf('const rubroRes = resolveTrialRubro') < srv.indexOf('demo.buildDemoSpec({ business, category: effCategory'), 'generate-stream: el rubro se resuelve ANTES de buildDemoSpec');
  ok(srv.includes("src === 'skip'"), 'skip registrado server-side (padre seguro, sin inventar)');
  // question_candidates tipo 'rubro' en el digest:
  const dDuda = clientDigest.buildFromParts({ business: 'Belleza Integral', rubroId: rd.rubroId, category: rd.category });
  const qc = (dDuda.question_candidates || []).find((q) => q.tipo === 'rubro');
  ok(!!qc && Array.isArray(qc.opciones) && qc.opciones.length >= 2, 'question_candidates suma el tipo rubro con sus opciones');
}

console.log('== (e) Pool de moda nunca vacío (alias ropa⇒moda) ==');
{
  const byRopa = IS.STYLES.filter((s) => IS.rubroMatch(s, 'ropa')).length;
  const byModa = IS.STYLES.filter((s) => IS.rubroMatch(s, 'moda')).length;
  ok(byRopa > 0 && byModa > 0, `rubroMatch: 'ropa' → ${byRopa} presets · 'moda' → ${byModa} presets`);
  const pick = IS.pickStyle({ rubro: 'moda', theme: 'novedad de temporada', tipo: 'social' });
  ok(!!(pick && pick.style), 'pickStyle con rubro moda devuelve preset');
  const srv = fs.readFileSync('server.js', 'utf8');
  ok(srv.includes("moda: 'moda'"), "catMap resuelto en la fuente: moda → 'moda'");
}

console.log('== (f) NEGATIVO: señales débiles contradictorias NO forzan confianza ==');
{
  const cls = rubroId.classifyBusiness({ bio: 'Cosas lindas para vos ✨', formText: 'Vendemos un poco de todo: ropa y comida rica para llevar' });
  ok(cls.segura === false && cls.confianza < 0.8, `queda duda (conf ${cls.confianza}) — Posty pregunta`);
  const vacio = rubroId.classifyBusiness({});
  ok(vacio.rubro === 'otro' && vacio.confianza === 0 && vacio.segura === false, "sin señales: 'otro' honesto con confianza 0 (no comodín silencioso)");
  ok(rubroId.needsVisionTiebreak(cls) === false || cls.candidatas.length >= 2, 'el desempate por visión solo se habilita con voto cerca');
}

(async () => {
  console.log('== (d) La confirmación viaja: prueba → registro → perfil ==');
  const PORT = 18778;
  const BASE = `http://127.0.0.1:${PORT}`;
  const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken235' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    let booted = false;
    for (let i = 0; i < 60 && !booted; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) booted = true; } catch (e) {}
      if (!booted) await new Promise((r) => setTimeout(r, 500));
    }
    ok(booted, 'server booteó');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261019-v237', `/api/version = ${ver.build}`);
    const rc = rubroId.resolveRubro({ confirmed: { rubro: 'belleza', subrubro: 'makeup', fuente: 'pregunta' }, cls: null });
    const digest = clientDigest.buildFromParts({
      business: 'Mili Makeup', category: rc.category, subcat: rc.subcat, rubroId: rc.rubroId,
      web: { name: 'Mili Makeup', description: 'Maquillaje profesional para novias y eventos', services: ['Maquillaje social', 'Maquillaje para novias'], city: '', palette: [], url: '' },
      feed: { bio: 'Novias & eventos ✨', captions: ['Maquillaje para novias'], name: 'Mili', handle: 'milifixture' },
    });
    ok(digest.subcat === 'makeup' && digest.rubro_id.fuente === 'pregunta', 'digest armado con lo confirmado por pregunta');
    const payload = JSON.stringify({
      ok: true, engine: demo.DEMO_ENGINE_V, business: 'Mili Makeup', category: 'belleza', subcat: 'makeup',
      digest,
      profile: { handle: 'milifixture', name: 'Mili', bio: 'Novias & eventos ✨', captions: ['Maquillaje para novias'] },
      posts: [{ type: 'image', image: TINY_JPG, caption: 'Maquillaje para novias que dura toda la fiesta', hashtags: '#makeup' }],
      design: { posts: [{ style: 'centro', kind: 'novedad', headline: 'Dura toda la fiesta' }], styles: [], photos: [], videoIdx: 0, count: 1, engine: demo.DEMO_ENGINE_V },
      week: [],
    });
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)').run('milifixture', payload, Date.now());
    const r = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mili-fixture@example.com', password: 'secreto1', trial_ig: 'milifixture' }),
    });
    ok(r.ok, `register (${r.status})`);
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get('mili-fixture@example.com');
    const prof = db.prepare('SELECT category, subrubro FROM profiles WHERE user_id = ?').get(u.id);
    ok(prof && prof.category === 'belleza', `profiles.category = ${prof && prof.category}`);
    ok(prof && prof.subrubro === 'makeup', `profiles.subrubro = ${prof && prof.subrubro} (sembrado desde lo confirmado)`);
    const drow = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(u.id);
    const saved = drow ? JSON.parse(drow.digest_json) : {};
    ok(saved.subcat === 'makeup' && saved.rubro_id && saved.rubro_id.fuente === 'pregunta', 'digest persistido: subcat makeup + fuente pregunta');
    db.close();
  } catch (e) {
    fails++;
    console.error('  ✗ excepción en (d):', e.message);
    console.error(srvLog.slice(-1200));
  } finally {
    srv.kill('SIGKILL');
  }
  console.log(fails ? `\n✗ ${fails} fallas` : '\n✓ TODO VERDE — test-rubro-id');
  process.exit(fails ? 1 : 0);
})();
