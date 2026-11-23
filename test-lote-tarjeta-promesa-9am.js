'use strict';
/* test-lote-tarjeta-promesa-9am.js — LOTE TARJETA-PROMESA-9AM (23/11).
 * Pedido del dueño (22/11 00:57–00:58, con captura de la tarjeta del
 * día vacío: «Lunes · hoy / Todavía no hay posteo. / Que Posty lo
 * arme / subir algo mío»): en vez de «no hay posteo», la tarjeta
 * promete «tu próximo post disponible 9am». Diseño elegido por el
 * dueño entre 5 mocks (23/11 01:05: «me gustaa el 1. vamos con eso.
 * armalo») = la opción 1 «La promesa» de mock-post-9am/mock.html.
 * Corrección final del dueño (23/11 01:14): el aviso vive SOLO en
 * la tarjeta del día — en el feed no va nada.
 * La regla de verdad: la promesa es verdadera en cada momento —
 * hoy antes de las 9:00 (hora del negocio) va con la hora; pasadas
 * las 9:00 sin posteo va el estado honesto «está en armado.» sin
 * hora; un día futuro revelado anuncia su posteo a las 9:00.
 * Cubre, con el código real extraído de public/app.js en VM (reloj
 * mutable FakeDate, como las suites de la tira), el CSS real y
 * boot aislado:
 *  §0: bloques cargan (pzHoyVaciaPromesaHTML nueva + la rama).
 *  §1: hoy 07:30 ES — la promesa del mock: clase .promesa, reloj,
 *      «Tu próximo posteo», «disponible a las 9:00» con la hora en
 *      su span; SIN «Todavía no hay posteo.», SIN data-pz-hoy-armar
 *      ni .pz-hoy-glass-btn; «subir algo mío» intacto.
 *  §2: hoy 07:30 EN — «Your next post» / «available at 9:00 AM»
 *      (el patrón de horas vivo del EN: 12 h con AM/PM).
 *  §3: el borde: 08:59:59 promete; 09:00:00 ya es «en armado».
 *  §4: hoy 10:15 ES — «Tu posteo de hoy está en armado.» sin hora.
 *  §5: hoy 10:15 EN — «Today's post is being built.» sin hora.
 *  §6: mañana revelado sin posteo ES — «El posteo del martes
 *      llega a las 9:00».
 *  §7: mañana EN — «Tuesday's post arrives at 9:00 AM».
 *  §8: regresión del estado con motivo (TARJETA-HOY-MINIMA): con
 *      motivo de freno la tarjeta queda como estaba — motivo a la
 *      vista y su botón-reintento vivo; la promesa NO aparece
 *      (sería falsa bajo un freno).
 *  §9: regresión cuenta_propia: el freno de la casa sin botón,
 *      con su explicación, sin promesa.
 *  §10: regresión bloqueado: mañana sin revelar, su mensaje.
 *  §11: regresión con posteo: el día con posteo publicado rinde
 *      su tarjeta de siempre (sin .vacia ni promesa).
 *  §12: CSS: las medidas y colores exactos del mock.
 *  §13: auditoría: la función nueva existe una sola vez en el
 *      bundle y la rama la llama; el feed («Tu semana, planeada»)
 *      no gana ninguna pieza: 0 ocurrencias de las clases de la
 *      promesa fuera de la tarjeta del día (conteo de clases en
 *      app.js acotado a la rama y la función).
 *  §14: boot: /api/version del árbol y app.js/styles.css servidos
 *      idénticos al árbol, con la promesa en el bundle servido.
 * Control: contra la base prístina v1246 esta suite FALLA en
 * §0/§1–§7/§12/§13/§14 (no hay función ni diseño: el detalle rinde
 * la tarjeta de la captura) y PASA en §8–§11 (las regresiones son
 * el comportamiento de siempre).
 * Uso: node test-lote-tarjeta-promesa-9am.js — sale 0 si todo pasa.
 *   PROMESA9_TREE=<dir>  árbol a probar (def: este directorio)
 *   PROMESA9_PORT=<p>    puerto del boot (def: 35241; verificar
 *                        libre con ss antes de correr).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TREE = path.resolve(process.env.PROMESA9_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const BUILD = (SRV.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '';

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Semana del lote: lun 23/11/2026 (hoy) – mar 24/11 (mañana).
let NOW_MS = Date.parse('2026-11-23T12:30:00.000Z'); // lun 07:30 EST
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- Sandbox ----------
const TZ = 'America/New_York';
const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date: FakeDate, Math, JSON, Intl, Map, Set,
  // el esc REAL de app.js (línea 86), copiado fiel:
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  gzT: (es, en) => es,
  mv: (p) => p,
  pzIc: () => '',
  pcTz: () => TZ,
  pcParseDate: (s0) => { const s = String(s0 || '').replace(' ', 'T'); if (!s) return null; const x = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; const d = new FakeDate(x); return isNaN(d) ? null : d; },
  schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
};
vm.createContext(sb);

// ---------- Extracción de funciones reales ----------
function extractFunc(name) {
  const i = APP.indexOf('function ' + name + '(');
  if (i < 0) { t(false, '§0: falta function ' + name + ' en app.js'); return ''; }
  const j = APP.indexOf('{', i);
  let d = 0, k = j;
  while (k < APP.length) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (d === 0) break; }
    k++;
  }
  if (d !== 0) { t(false, '§0: llaves sin cerrar en ' + name); return ''; }
  return APP.slice(i, k + 1);
}
const FUNCS = [
  'pzHoyDiaKey', 'pzHoyDowKey', 'pzHoyPostDiaKey', 'pzHoyMoverKey',
  'pzWhenRelDay', 'hfChipText',
  'pzHoyHoraCorta', 'pzHoyCuandoPub', 'pzHoyCuandoCorto',
  'pzHoyPillSalida', 'pzRitualCuentaTxt', 'pzHoyCuentaSaleTxt',
  'pzIsPubReal', 'pzHoyMotivoTxt', 'pzHoyVaciaPromesaHTML',
  'pzHoyTiraDetalleHTML',
];
console.log('— §0: bloques');
for (const f of FUNCS) {
  const code = extractFunc(f);
  if (!code) continue;
  try { vm.runInContext(code, sb); t(true, '§0: ' + f + ' cargada'); }
  catch (e) { t(false, '§0: ' + f + ' no corre en VM', e.message); }
}
try {
  vm.runInContext("var PZ_HOY_TIRA_SEL = ''; var PZ_HOY_TIRA_DIAS = []; var PZ_HOY_POST_ID = ''; var PZ_HOY_MEJOR = null; var PZ_HOY_ARMAR_MOTIVO = '';", sb);
  t(true, '§0: vars de la tira y del motivo declaradas');
} catch (e) { t(false, '§0: vars', e.message); }

const detalle = (d, en) => sb.pzHoyTiraDetalleHTML(d, { en: !!en, tz: TZ, hoyKey: '2026-11-23' });
const setMotivo = (m) => vm.runInContext('PZ_HOY_ARMAR_MOTIVO = ' + JSON.stringify(m) + ';', sb);
const setNow = (iso) => { NOW_MS = Date.parse(iso); };

const HOY = { key: '2026-11-23', idx: 0, estado: 'hoy', post: null, revelado: true, esHoy: true, esManana: false, esPasado: false };
const MANANA = { key: '2026-11-24', idx: 1, estado: 'fut', post: null, revelado: true, esHoy: false, esManana: true, esPasado: false };
const MANANA_LOCK = { ...MANANA, revelado: false };

// ---------- §1: hoy antes de las 9:00, ES ----------
console.log('— §1: hoy 07:30 ES, la promesa');
setMotivo(''); setNow('2026-11-23T12:30:00.000Z');
{
  const h = detalle(HOY, false);
  t(h.includes('pz-hoy-tira-detalle vacia promesa'), '§1: la tarjeta lleva la clase .promesa', h.slice(0, 160));
  t(h.includes('Lunes · hoy'), '§1: el título del día queda', h.slice(0, 160));
  t(h.includes('pz-hoy-promesa-reloj'), '§1: el relojito del mock está');
  t(h.includes('Tu próximo posteo'), '§1: el titular del mock, «Tu próximo posteo»');
  t(h.includes('disponible a las') && h.includes('pz-hoy-promesa-hora">9:00<'), '§1: «disponible a las 9:00» con la hora en su span');
  t(!h.includes('Todavía no hay posteo'), '§1: NO dice «Todavía no hay posteo.»');
  t(!h.includes('data-pz-hoy-armar') && !h.includes('pz-hoy-glass-btn'), '§1: SIN botón «Que Posty lo arme»');
  t(h.includes('data-pz-hoy-subir="1"') && h.includes('subir algo mío'), '§1: «subir algo mío» intacto');
}

// ---------- §2: hoy antes de las 9:00, EN ----------
console.log('— §2: hoy 07:30 EN');
{
  const h = detalle(HOY, true);
  t(h.includes('Monday · today'), '§2: título EN', h.slice(0, 160));
  t(h.includes('Your next post'), '§2: «Your next post»');
  t(h.includes('available at') && h.includes('pz-hoy-promesa-hora">9:00 AM<'), '§2: «available at 9:00 AM» (patrón de horas EN de la app)');
  t(!h.includes('No post today yet') && !h.includes('data-pz-hoy-armar'), '§2: sin ausencia ni botón de armar');
  t(h.includes('upload my own'), '§2: «upload my own» intacto');
}

// ---------- §3: el borde de las 9:00 ----------
console.log('— §3: el borde 08:59:59 / 09:00:00');
{
  setNow('2026-11-23T13:59:59.000Z'); // 08:59:59 EST
  const antes = detalle(HOY, false);
  t(antes.includes('disponible a las') && antes.includes('9:00'), '§3: 08:59:59 todavía promete con la hora');
  setNow('2026-11-23T14:00:00.000Z'); // 09:00:00 EST
  const aLas9 = detalle(HOY, false);
  t(aLas9.includes('está en armado') && !aLas9.includes('9:00'), '§3: 09:00:00 ya es el estado honesto, sin hora');
}

// ---------- §4: hoy pasadas las 9:00 sin posteo, ES ----------
console.log('— §4: hoy 10:15 ES, en armado');
{
  setNow('2026-11-23T15:15:00.000Z'); // 10:15 EST
  const h = detalle(HOY, false);
  t(h.includes('promesa'), '§4: mismo diseño (.promesa)');
  t(h.includes('Tu posteo de hoy') && h.includes('está en armado.'), '§4: «Tu posteo de hoy está en armado.»');
  t(!h.includes('9:00'), '§4: sin la hora (la promesa no miente)');
  t(!h.includes('Todavía no hay posteo') && !h.includes('data-pz-hoy-armar'), '§4: sin ausencia ni botón');
  t(h.includes('data-pz-hoy-subir="1"'), '§4: «subir algo mío» intacto');
}

// ---------- §5: hoy pasadas las 9:00, EN ----------
console.log('— §5: hoy 10:15 EN');
{
  const h = detalle(HOY, true);
  t(h.includes('Today&#39;s post') && h.includes('is being built.'), '§5: «Today\'s post is being built.»', h.slice(0, 300));
  t(!h.includes('9:00 AM') && !h.includes('data-pz-hoy-armar'), '§5: sin hora ni botón');
}

// ---------- §6: mañana revelado sin posteo, ES ----------
console.log('— §6: mañana ES');
{
  setNow('2026-11-23T12:30:00.000Z');
  const h = detalle(MANANA, false);
  t(h.includes('Martes · mañana'), '§6: título del día futuro', h.slice(0, 160));
  t(h.includes('El posteo del martes'), '§6: «El posteo del martes» (el día en minúscula, mid-sentence)');
  t(h.includes('llega a las') && h.includes('pz-hoy-promesa-hora">9:00<'), '§6: «llega a las 9:00»');
  t(!h.includes('data-pz-hoy-armar') && h.includes('data-pz-hoy-subir="1"'), '§6: sin botón de armar, con subir');
}

// ---------- §7: mañana, EN ----------
console.log('— §7: mañana EN');
{
  const h = detalle(MANANA, true);
  t(h.includes('Tuesday&#39;s post'), '§7: «Tuesday\'s post»', h.slice(0, 300));
  t(h.includes('arrives at') && h.includes('pz-hoy-promesa-hora">9:00 AM<'), '§7: «arrives at 9:00 AM»');
}

// ---------- §8: regresión — el estado con motivo queda como estaba ----------
console.log('— §8: regresión motivo de freno');
{
  setNow('2026-11-23T12:30:00.000Z');
  setMotivo('plan_limit');
  const h = detalle(HOY, false);
  t(h.includes('Todavía no hay posteo.'), '§8: con motivo, la tarjeta conserva su línea de siempre');
  t(h.includes('llegaste al límite de posteos de tu plan esta semana.'), '§8: el motivo se dice en la tarjeta');
  t(h.includes('data-pz-hoy-armar') && h.includes('pz-hoy-glass-btn'), '§8: el botón-reintento del freno sigue vivo');
  t(!h.includes('promesa'), '§8: la promesa NO aparece bajo un freno (sería falsa)');
  setMotivo('dia_cerrado');
  const h2 = detalle(HOY, false);
  t(h2.includes('hoy tu negocio está cerrado: no sale posteo.') && !h2.includes('promesa'), '§8: día cerrado: motivo honesto, sin promesa');
  setMotivo('');
}

// ---------- §9: regresión — cuenta_propia ----------
console.log('— §9: regresión cuenta_propia');
{
  setMotivo('cuenta_propia');
  const h = detalle(HOY, false);
  t(h.includes('Los posteos de esta cuenta los arma el equipo a mano'), '§9: la explicación del freno de la casa queda');
  t(!h.includes('data-pz-hoy-armar') && !h.includes('promesa'), '§9: sin botón y sin promesa (el software no genera ahí)');
  t(h.includes('data-pz-hoy-subir="1"'), '§9: «subir algo mío» queda');
  setMotivo('');
}

// ---------- §10: regresión — día bloqueado ----------
console.log('— §10: regresión bloqueado');
{
  const h = detalle(MANANA_LOCK, false);
  t(h.includes('locked') && h.includes('Su posteo se ve apenas salga el de hoy.'), '§10: mañana sin revelar, su mensaje de siempre', h.slice(0, 200));
  t(!h.includes('promesa'), '§10: sin promesa en el bloqueado');
}

// ---------- §11: regresión — el día con posteo no se toca ----------
console.log('— §11: regresión con posteo');
{
  const conPost = { ...HOY, post: { id: 999, status: 'published', caption: 'La pieza de hoy', published_at: '2026-11-23 12:01:00', scheduled_at: '2026-11-23 12:00:00', ig_media_id: 'real123', image_path: '' } };
  const h = detalle(conPost, false);
  t(h.includes('pz-hoy-tira-detalle') && !h.includes('vacia'), '§11: el día con posteo rinde su tarjeta (sin .vacia)', h.slice(0, 200));
  t(h.includes('Publicado'), '§11: el pill «Publicado» de siempre');
  t(!h.includes('promesa') && !h.includes('Todavía no hay posteo'), '§11: sin promesa ni ausencia');
}

// ---------- §12: CSS del mock ----------
console.log('— §12: CSS');
{
  const bloque = (sel) => { const i = CSS.indexOf(sel); return i >= 0 ? CSS.slice(i, i + 320) : ''; };
  const card = bloque('.pz-hoy-tira-detalle.promesa{');
  t(card.includes('background:#fff') && card.includes('border-radius:30px') && card.includes('padding:26px 22px 24px'), '§12: la tarjeta toma la piel del mock (blanca, radio 30, su padding)', card.slice(0, 200));
  const tit = bloque('.pz-hoy-tira-detalle.promesa .t b{');
  t(tit.includes('font-size:20.5px') && tit.includes('font-weight:900') && tit.includes('color:#0A1E33'), '§12: el título del día como el .dia del mock');
  const rel = bloque('.pz-hoy-promesa-reloj{');
  t(rel.includes('width:30px') && rel.includes('height:30px') && rel.includes('color:#2793C8'), '§12: el reloj 30×30 en azul de marca');
  const gr = bloque('.pz-hoy-promesa-grande{');
  t(gr.includes('font-size:26px') && gr.includes('font-weight:900') && gr.includes('color:#0A1E33'), '§12: el titular 26px/900 navy del mock');
  const ln = bloque('.pz-hoy-promesa-linea{');
  t(ln.includes('font-size:16.5px') && ln.includes('color:#7C93A8'), '§12: la línea 16.5px en el gris del mock');
  const hr = bloque('.pz-hoy-promesa-hora{');
  t(hr.includes('color:#2793C8') && hr.includes('font-weight:900') && hr.includes('font-size:19px'), '§12: la hora en azul de marca, 19px/900');
}

// ---------- §13: auditoría ----------
console.log('— §13: auditoría');
{
  t((APP.match(/function pzHoyVaciaPromesaHTML\(/g) || []).length === 1, '§13: pzHoyVaciaPromesaHTML definida una sola vez en el bundle');
  t(APP.includes('if (!motivoTxt) return pzHoyVaciaPromesaHTML(d, { en, tz, nombre });'), '§13: la rama del día vacío llama a la promesa solo sin motivo');
  t((APP.match(/pz-hoy-promesa-/g) || []).length <= 12, '§13: las clases de la promesa viven solo en la función y su llamada (nada en el feed)', String((APP.match(/pz-hoy-promesa-/g) || []).length));
}

// ---------- §14: boot ----------
console.log('— §14: boot');
const PORT = Number(process.env.PROMESA9_PORT || 35241);
const SECRET = 'lote-tarjeta-promesa-9am-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarjeta-promesa-9am-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
async function apiText(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return { status: r.status, text: await r.text() };
}
(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: SECRET,
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'sk-test-dummy',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§14: el servidor levanta (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await apiText('/api/version');
    let verJson = null; try { verJson = JSON.parse(ver.text); } catch (e) {}
    t(ver.status === 200 && verJson && verJson.build === BUILD,
      '§14: /api/version trae el BUILD del árbol (' + BUILD + ')', ver.text.slice(0, 200));
    const appJs = await apiText('/app.js');
    t(appJs.status === 200 && md5(appJs.text) === md5(APP), '§14: el app.js servido es el del árbol (md5 igual)');
    t(appJs.status === 200 && appJs.text.includes('pzHoyVaciaPromesaHTML'), '§14: el bundle servido trae la promesa');
    const cssS = await apiText('/styles.css');
    t(cssS.status === 200 && md5(cssS.text) === md5(CSS), '§14: el styles.css servido es el del árbol (md5 igual)');
    t(cssS.status === 200 && cssS.text.includes('.pz-hoy-promesa-grande'), '§14: el CSS servido trae el diseño de la promesa');
  } catch (e) {
    t(false, '§14: boot', e.message);
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`\nTARJETA-PROMESA-9AM: ${okN} ok, ${badN} fallos`);
  process.exit(badN ? 1 : 0);
})();
