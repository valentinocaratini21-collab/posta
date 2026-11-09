'use strict';
/* test-lote-rediseno-rs2.js — LOTE REDISEÑO RS-2 · HOY DEL MOCK v10 + SALUDO AUTOPILOT (base v830).
 * Spec: mock posty-app-simple v10 (congelada) + REGLA 02:40 (autopilot:
 * el posteo sale solo; 30 min antes un push avisa por si quieren
 * frenarlo; al salir, otro aviso). NO el saludo del mock.
 * Cubre, con el código real extraído de public/app.js (bloque RS-2 +
 * saludo + helpers de Hoy) y un DOM falso mínimo, con reloj mutable,
 * y con boot aislado (DB temporal, sin tocar producción):
 *  A) tira de 7 días una por una: hoy completo; mañana visible apenas
 *     sale el de hoy (cartita sin velo); el resto solo los días; la
 *     semana no se congela el domingo (la tira se calcula sobre la
 *     semana corriente cada vez que se pinta); las historias NO van
 *     a la tira; un día pasado sin publicado queda bloqueado con su
 *     mensaje (no se inventa un posteo);
 *  B) tira HTML: 7 botones (LUN–DOM), .sel en el seleccionado, .done
 *     solo en días publicados, .wait (punteado) solo en días futuros
 *     bloqueados; detalle del día con foto + título + día/hora +
 *     estado; botón Impulsar (contrato RS-4: data-pz-boost-post) solo
 *     en días publicados; mensajes de bloqueado del mock;
 *  C) saludo autopilot (REGLA 02:40): programado pendiente en
 *     autopilot → «sale solo» + aviso de 30 min; en manual →
 *     «sale cuando vos lo aprobás» (sin el absoluto viejo);
 *     borrador → «está listo para las HH:MM»; publicado →
 *     «ya salió»; sin posteo hoy y con pendientes → el número real
 *     (needOK); sin nada → invitación a armar la semana. 0
 *     referencias al saludo viejo («Sin tu OK, no sale nada») en
 *     todo lo que se rinde;
 *  D) línea de insight (sin Análisis): 0/7, n/7, 7/7 y domingo;
 *  E) «Para aprobar · N»: solo si N > 0 (N = los pendientes
 *     visibles en Hoy, la tarjeta de hoy: 0 o 1);
 *  F) auditoría M78: todo lo que el Hoy nuevo llama existe definido
 *     en el bundle; el Hoy no rinde «Aprobar todo» ni la tarjeta de
 *     subida ni la semana grande;
 *  G) cableado de la tira (DOM falso): tocar un día selecciona y
 *     re-pinta tira + detalle en su lugar;
 *  H) boot: endpoints reales (approve de un posteo, /api/autopilot,
 *     /api/posts) con datos reales, y el app.js servido es el del
 *     árbol (md5 igual) sin el saludo viejo ni las funciones muertas.
 * En el árbol prístino v830 los tests nuevos deben FALLAR (cazan el
 * cambio). Uso: node test-lote-rediseno-rs2.js — sale 0 si todo pasa.
 *   RS2_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.env.RS2_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Hoy del lote: lunes 9/11/2026. Semana: lun 9/11 – dom 15/11.
let NOW_MS = Date.parse('2026-11-09T15:00:00.000Z'); // lun 9/11 10:00 EST
const setNow = (iso) => { NOW_MS = Date.parse(iso); };
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- DOM falso mínimo ----------
class El {
  constructor(tag) {
    this.tagName = tag || 'div';
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.removed = false;
    this.innerHTML = '';
    this.textContent = '';
    this._l = {};
    this._q = {};
    this.className = '';
    this.id = '';
    this.children = [];
    this._cls = new Set();
    this.classList = {
      toggle: (c, f) => { if (f === undefined) { if (this._cls.has(c)) this._cls.delete(c); else this._cls.add(c); } else if (f) this._cls.add(c); else this._cls.delete(c); },
      add: (c) => this._cls.add(c),
      remove: (c) => this._cls.delete(c),
      contains: (c) => this._cls.has(c),
    };
  }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  querySelector(sel) { return this._q[sel] || null; }
  querySelectorAll(sel) { return this._q[sel + ':all'] || []; }
  setAttribute(k, v) { this['attr_' + k] = v; }
  getAttribute(k) { return this['attr_' + k]; }
  remove() { this.removed = true; }
}

// ---------- Sandbox ----------
const TZ = 'America/New_York';
const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date: FakeDate, Math, JSON, Intl, Map, Set,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pzIc: () => '',
  pcTz: () => TZ,
  pcParseDate: (s0) => { const s = String(s0 || '').replace(' ', 'T'); if (!s) return null; const x = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; const d = new FakeDate(x); return isNaN(d) ? null : d; },
  schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
  slotHour: () => 17,
  ME: { lang: 'es' },
  document: {
    hidden: false, activeElement: null,
    body: { appendChild: () => {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new El(tag),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {}, scrollTo: () => {} },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  bbGo: () => {},
  pzBoostOpenById: () => {},
  HF_VISITOR: false,
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
  'pzHoySemana', 'pzHoyPendientes', 'pzWhenRelDay', 'hfChipText',
  'pzHoySaludoTxt', 'pzHoyHoraCorta', 'pzHoyCuandoCorto',
  'pzHoyPillSalida', 'pzRitualCuentaTxt', 'pzHoyCuentaSaleTxt',
  'pzHoySpeechHTML',
  'pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoyTiraHTML',
  'pzHoyTiraBindDetalle', 'pzHoyTiraBind',
  'pzHoyParaAprobarHTML', 'pzHoySemanaInsightHTML',
];
console.log('— §0: bloques');
for (const f of FUNCS) {
  const code = extractFunc(f);
  if (!code) continue;
  try { vm.runInContext(code, sb); t(true, '§0: ' + f + ' cargada'); }
  catch (e) { t(false, '§0: ' + f + ' no corre en VM', e.message); }
}
// Las variables de sesión de la tira (var, no function).
try {
  vm.runInContext("var PZ_HOY_TIRA_SEL = ''; var PZ_HOY_TIRA_DIAS = [];", sb);
  t(true, '§0: PZ_HOY_TIRA_SEL/DÍAS declaradas');
} catch (e) { t(false, '§0: vars de tira', e.message); }
t(APP.includes('pzHoyTiraHTML'), '§0: app.js trae pzHoyTiraHTML');
t(!APP.includes('Sin tu OK, no sale nada'), '§0: 0 referencias al saludo viejo en app.js');
t(!APP.includes('pzHoyUploadHTML') && !APP.includes('pzHoySemanaHTML'),
  '§0: 0 referencias a las funciones muertas (subida / semana grande)');
t(APP.includes('function pzHoySemanaMiniHTML(sem, en, pendProg)') && !APP.includes('pzHoySemanaMiniHTML(semR1'),
  '§0: la mini de v833 queda definida pero SIN USO en Hoy (su baja es otro lote)');
t(CSS.includes('.pz-semana-mini') && CSS.includes('.pz-hoy-tira-detalle') && CSS.includes('.pz-hoy-chatghost') && CSS.includes('.pz-hoy-para'),
  '§0: styles.css trae las clases RS-2 (tira, detalle, chatghost, para)');
t(!SRV.includes('pzHoyTira'), '§0: server.js sin tocar por RS-2 (solo BUILD en el re-estampado)');

// ---------- Datos de prueba ----------
// 19:00 EST = 00:00 UTC del día siguiente.
const at19 = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 24)).toISOString(); };
const P = (id, extra) => Object.assign({ id, user_id: 12, image_path: '/media/' + id + '.jpg', caption: 'Posteo ' + id, hashtags: '', scheduled_at: null, published_at: null, status: 'scheduled', tipo: 'social', media_type: 'image', week_key: '2026-11-09', approval: 'pending', created_at: '2026-11-08 10:00:00' }, extra || {});
const HOY = P(701, { caption: 'El de hoy', scheduled_at: at19('2026-11-09'), status: 'scheduled', approval: 'pending' });
const HOY_PUB = P(701, { caption: 'El de hoy', scheduled_at: at19('2026-11-09'), published_at: at19('2026-11-09'), status: 'published', approval: 'approved' });
const MANANA = P(702, { caption: 'El de mañana', scheduled_at: at19('2026-11-10'), status: 'scheduled', approval: 'pending' });
const MIERCOLES = P(703, { caption: 'El miércoles', scheduled_at: at19('2026-11-11'), status: 'scheduled', approval: 'pending' });
const BORRADOR = P(704, { caption: 'Borrador sin fecha', scheduled_at: null, status: 'draft', approval: 'pending' });
const STORY = P(705, { caption: 'Historia de hoy', scheduled_at: at19('2026-11-09'), media_type: 'story', status: 'scheduled' });
const semPub = sb.pzHoySemana([HOY_PUB], TZ, new FakeDate());
const semVacia = sb.pzHoySemana([], TZ, new FakeDate());
t(semPub.n === 1 && semPub.lunes === '2026-11-09' && semPub.dias.length === 7 && semPub.dias[0].estado === 'pub',
  '§0: pzHoySemana real: lun 9/11 publicado, n=1', JSON.stringify(semPub));

// ---------- §1: tira de 7 días, una por una ----------
console.log('— §1: tira (reveal)');
const tiraPub = sb.pzHoyTiraDias(semPub, [HOY_PUB, MANANA, MIERCOLES, BORRADOR, STORY], '2026-11-09', TZ);
t(tiraPub.length === 7, '§1: la tira tiene 7 días');
t(tiraPub[0].esHoy && tiraPub[0].revelado && tiraPub[0].post && tiraPub[0].post.id === 701,
  '§1: hoy (lun) revelado con su posteo publicado');
t(tiraPub[1].esManana && tiraPub[1].revelado && tiraPub[1].post && tiraPub[1].post.id === 702,
  '§1: mañana (mar) revelado apenas salió el de hoy, con su posteo');
t(tiraPub[2].post && tiraPub[2].post.id === 703 && !tiraPub[2].revelado,
  '§1: miércoles tiene posteo pero sigue bloqueado (futuro)');
t(tiraPub[3].post === null && !tiraPub[3].revelado && tiraPub[6].post === null && !tiraPub[6].revelado,
  '§1: jueves y domingo sin posteo, bloqueados (no se inventa nada)');
t(!tiraPub.some((d) => d.post && d.post.id === 705), '§1: la historia NO va a la tira');
t(!tiraPub.some((d) => d.post && d.post.id === 704), '§1: el borrador sin fecha no ocupa ningún día');
// Hoy pendiente (no salió): mañana sigue bloqueado.
const tiraPend = sb.pzHoyTiraDias(semVacia, [HOY, MANANA, MIERCOLES], '2026-11-09', TZ);
t(tiraPend[0].revelado && tiraPend[0].post && tiraPend[0].post.id === 701, '§1: hoy pendiente revelado (es hoy)');
t(!tiraPend[1].revelado && tiraPend[1].post && tiraPend[1].post.id === 702,
  '§1: mañana BLOQUEADO mientras el de hoy no sale');
t(tiraPend[2].post && tiraPend[2].post.id === 703 && !tiraPend[2].revelado, '§1: miércoles bloqueado (futuro)');
// Sin posteo hoy: mañana se revela (no hay nada que esperar).
const tiraSinHoy = sb.pzHoyTiraDias(semVacia, [MANANA, MIERCOLES], '2026-11-09', TZ);
t(tiraSinHoy[1].revelado && tiraSinHoy[1].post && tiraSinHoy[1].post.id === 702,
  '§1: sin posteo hoy, mañana se revela');
// Domingo (la semana no se congela): hoy domingo, el lunes que viene no está en la tira.
setNow('2026-11-15T15:00:00.000Z'); // dom 15/11 10:00 EST
const semDom = sb.pzHoySemana([HOY_PUB], TZ, new FakeDate());
const tiraDom = sb.pzHoyTiraDias(semDom, [HOY_PUB], '2026-11-15', TZ);
t(semDom.lunes === '2026-11-09' && semDom.dias[6].estado === 'hoy' && tiraDom[6].esHoy && tiraDom[6].revelado,
  '§1: domingo: la tira sigue siendo lun 9/11–dom 15/11, hoy es domingo');
t(tiraDom[0].revelado && tiraDom[0].post && tiraDom[0].post.id === 701,
  '§1: domingo: el lunes pasado publicado sigue revelado');
setNow('2026-11-09T15:00:00.000Z'); // vuelta al lunes

// ---------- §2: tira HTML ----------
console.log('— §2: tira HTML');
const htmlPub = sb.pzHoyTiraHTML(tiraPub, { en: false, tz: TZ, hoyKey: '2026-11-09', sel: '2026-11-09' });
t((htmlPub.match(/data-pz-hoy-tira-dia=/g) || []).length === 7, '§2: 7 botones de día (LUN–DOM)', htmlPub.slice(0, 200));
t(htmlPub.includes('pz-semana-dia done sel'),
  '§2: hoy publicado lleva .done y .sel (publicado manda sobre .today)', htmlPub.slice(0, 600));
const htmlPend = sb.pzHoyTiraHTML(tiraPend, { en: false, tz: TZ, hoyKey: '2026-11-09', sel: '2026-11-09' });
t(htmlPend.includes('pz-semana-dia today sel'),
  '§2: hoy pendiente lleva .today y .sel', htmlPend.slice(0, 600));
t(htmlPub.includes('pz-semana-dia done'), '§2: el día publicado lleva .done');
t((htmlPub.match(/pz-semana-dia wait/g) || []).length === 5, '§2: 5 días futuros bloqueados llevan .wait (mié–dom)');
t(htmlPub.includes('El de hoy') && htmlPub.includes('Hoy 19:00'), '§2: el detalle de hoy trae título + día/hora', htmlPub.slice(htmlPub.indexOf('pz-hoy-tira-detalle')));
t(htmlPub.includes('data-pz-boost-post="701"') && htmlPub.includes('Impulsar'), '§2: el día publicado trae botón Impulsar (contrato RS-4)');
t(!htmlPub.includes('Es el posteo de arriba'), '§2: el día publicado NO trae la nota «es el posteo de arriba» (ya salió, no hay tarjeta arriba que aprobar)');
t(htmlPend.includes('Es el posteo de arriba: aprobalo ahí o desde el chat.'), '§2: el día de hoy pendiente SÍ trae la nota (la tarjeta está arriba)');
t(!htmlPub.includes('data-pz-boost-post="702"'), '§2: el día no publicado NO trae Impulsar');
const htmlManana = sb.pzHoyTiraHTML(tiraPub, { en: false, tz: TZ, hoyKey: '2026-11-09', sel: '2026-11-10' });
t(htmlManana.includes('El de mañana') && htmlManana.includes('Mañana 19:00') && htmlManana.includes('Se postea mañana'),
  '§2: el detalle de mañana (cartita) trae título + día/hora + pill', htmlManana.slice(htmlManana.indexOf('pz-hoy-tira-detalle')));
const htmlFut = sb.pzHoyTiraHTML(tiraPend, { en: false, tz: TZ, hoyKey: '2026-11-09', sel: '2026-11-11' });
t(htmlFut.includes('Todavía no hay posteo acá: los de la semana salen uno por uno, día por día.'),
  '§2: el día futuro bloqueado trae el mensaje del mock');
const htmlMananaBloq = sb.pzHoyTiraHTML(tiraPend, { en: false, tz: TZ, hoyKey: '2026-11-09', sel: '2026-11-10' });
t(htmlMananaBloq.includes('Su posteo se ve apenas salga el de hoy.'),
  '§2: mañana bloqueado (hoy no salió) trae su mensaje');
const htmlSinPost = sb.pzHoyTiraHTML(sb.pzHoyTiraDias(semVacia, [], '2026-11-09', TZ), { en: false, tz: TZ, hoyKey: '2026-11-09', sel: '2026-11-09' });
t(htmlSinPost.includes('Hoy todavía no hay posteo') && htmlSinPost.includes('Abrir el chat'),
  '§2: hoy vacío trae invitación al chat');
t(!htmlPub.includes('Aprobar todo') && !htmlPub.includes('pzHoyUploadHTML') && !htmlPub.includes('pzHoySemanaHTML'),
  '§2: la tira no rinde «Aprobar todo» ni subida ni semana grande');

// ---------- §3: saludo autopilot ----------
console.log('— §3: saludo autopilot (REGLA 02:40)');
const speech = (o) => sb.pzHoySpeechHTML(Object.assign({ en: false, tz: TZ }, o));
const sAuto = speech({ hoyPost: HOY, pendientes: 1, haySemana: true, manual: false, needOK: 0, schedSolo: 1 });
t(sAuto.includes('El de hoy sale a las 19:00 solo') && sAuto.includes('te aviso 30 min antes por si querés frenarlo') && sAuto.includes('te aviso cuando salga'),
  '§3: autopilot, programado pendiente: sale solo + aviso 30 min + aviso al salir', sAuto);
t(!sAuto.includes('Sin tu OK, no sale nada'), '§3: autopilot: 0 saludo viejo');
const sMan = speech({ hoyPost: HOY, pendientes: 1, haySemana: true, manual: true, needOK: 1, schedSolo: 0 });
t(sMan.includes('sale cuando vos lo aprobás') && !sMan.includes('Sin tu OK, no sale nada'),
  '§3: manual, programado pendiente: sale cuando vos lo aprobás (sin el absoluto)', sMan);
const sDraft = speech({ hoyPost: BORRADOR, pendientes: 1, haySemana: true, manual: false, needOK: 1, schedSolo: 0 });
t(sDraft.includes('Está listo para las') && sDraft.includes('queda programado para salir'),
  '§3: borrador: está listo para las HH:MM y queda programado al aprobar', sDraft);
const sPub = speech({ hoyPost: HOY_PUB, pendientes: 0, haySemana: true, manual: false, needOK: 0, schedSolo: 0 });
t(sPub.includes('El de hoy ya salió') && sPub.includes('salió a las 19:00') && !sPub.includes('El de hoy sale a las'),
  '§3: publicado: ya salió (no «sale a las»)', sPub);
const sPubPend = speech({ hoyPost: HOY_PUB, pendientes: 2, haySemana: true, manual: false, needOK: 2, schedSolo: 0 });
t(sPubPend.includes('Tenés 2 posteos para revisar en tu feed'),
  '§3: publicado + 2 pendientes: los menciona con el número real', sPubPend);
const sPend = speech({ hoyPost: null, pendientes: 2, haySemana: true, manual: false, needOK: 2, schedSolo: 1 });
t(sPend.includes('Tenés 2 posteos para revisar') && sPend.includes('Los que ya están programados salen solos a su hora.'),
  '§3: sin posteo hoy, 2 por revisar + 1 programado que sale solo', sPend);
const sPend1 = speech({ hoyPost: null, pendientes: 1, haySemana: true, manual: false, needOK: 1, schedSolo: 0 });
t(sPend1.includes('Tenés 1 posteo para revisar'), '§3: 1 por revisar (singular)');
const sSolo = speech({ hoyPost: null, pendientes: 1, haySemana: true, manual: false, needOK: 0, schedSolo: 1 });
t(sSolo.includes('los posteos salen solos a su hora') && sSolo.includes('Te aviso 30 min antes'),
  '§3: solo programados pendientes en autopilot: salen solos + aviso 30 min', sSolo);
const sOk = speech({ hoyPost: null, pendientes: 0, haySemana: true, manual: false, needOK: 0, schedSolo: 0 });
t(sOk.includes('Tu semana ya está aprobada'), '§3: semana aprobada, sin pendientes');
const sVacia = speech({ hoyPost: null, pendientes: 0, haySemana: false, manual: false, needOK: 0, schedSolo: 0 });
t(sVacia.includes('¿Armamos tu semana?'), '§3: sin semana: invitación a armarla');
const sEn = sb.pzHoySpeechHTML({ hoyPost: HOY, pendientes: 1, haySemana: true, en: true, tz: TZ, manual: false, needOK: 0, schedSolo: 1 });
t(sEn.includes("Today's goes out") && sEn.includes('on its own') && sEn.includes('30 min before'),
  '§3: EN: el saludo autopilot también está en inglés', sEn);

// ---------- §4: insight ----------
console.log('— §4: insight');
const ins0 = sb.pzHoySemanaInsightHTML(semVacia, false, 0);
t(ins0.includes('Tu semana recién arranca') && ins0.includes('Abrir el chat'),
  '§4: 0/7: recién arranca + botón al chat', ins0);
const ins3 = sb.pzHoySemanaInsightHTML(semPub, false, 1);
t(ins3.includes('1/7 posteos, tu semana viene en camino') && ins3.includes('Los próximos están en tu feed, con su día y su hora.'),
  '§4: 1/7 + programados: la acción es honesta (están en el feed)', ins3);
const sem7 = { n: 7, lunes: '2026-11-09', dias: semPub.dias.map((d) => Object.assign({}, d, { estado: 'pub' })) };
const ins7 = sb.pzHoySemanaInsightHTML(sem7, false, 0);
t(ins7.includes('¡Semana completa!') && ins7.includes('mañana arranca una nueva semana'),
  '§4: 7/7: semana completa', ins7);
const semDom7 = { n: 3, lunes: '2026-11-09', dias: semPub.dias.map((d, i) => Object.assign({}, d, { estado: i === 6 ? 'hoy' : (i < 3 ? 'pub' : 'vacio') })) };
const insDom = sb.pzHoySemanaInsightHTML(semDom7, false, 0);
t(insDom.includes('esta semana cumplimos 3/7 posteos'), '§4: domingo: «esta semana cumplimos N/7»', insDom);

// ---------- §5: Para aprobar ----------
console.log('— §5: Para aprobar');
t(sb.pzHoyParaAprobarHTML(1, false).includes('Para aprobar · <span>1</span>'), '§5: N=1 se rinde');
t(sb.pzHoyParaAprobarHTML(0, false) === '', '§5: N=0 no se rinde');
t(sb.pzHoyParaAprobarHTML(1, true).includes('To approve'), '§5: EN');

// ---------- §6: auditoría M78 ----------
console.log('— §6: auditoría M78');
const CALLS = [
  'pzHoyTiraDias', 'pzHoyTiraHTML', 'pzHoyTiraDetalleHTML', 'pzHoyTiraBind',
  'pzHoyParaAprobarHTML', 'pzHoySemanaInsightHTML', 'pzHoySpeechHTML',
  'pzHoyHoyHTML', 'pzHoyPendientes', 'pzHoySemana', 'pzHoyPostDiaKey',
  'pzHoyMoverKey', 'pzHoySaludoTxt', 'pzHoyHoraCorta', 'pzHoyCuandoCorto',
  'pzHoyPillSalida', 'pzHoyCuentaSaleTxt', 'pzIc', 'f3ApprovalMode',
  'pzBoostOpenById', 'pzHoyConserjeHTML', 'pzHoyAprobarUno', 'pzHoyCambiar',
];
for (const f of CALLS) {
  t(new RegExp('function ' + f + '\\s*\\(').test(APP), '§6: ' + f + ' definida en app.js');
}
const HOY_HTML = APP.slice(APP.indexOf("const hoyAprobarHTML ="), APP.indexOf("const hoyAprobarHTML =") + 3000);
t(!HOY_HTML.includes('pzHoyUploadHTML') && !HOY_HTML.includes('pzHoySemanaHTML') && !HOY_HTML.includes('cardsR1') && !HOY_HTML.includes('vacioR1') && !HOY_HTML.includes('pzAcceptWeek'),
  '§6: la composición de Hoy no llama a subida, semana grande, tarjetas ni Aprobar todo');
t(HOY_HTML.includes('pzHoyTiraHTML') && HOY_HTML.includes('pzHoySemanaInsightHTML') && HOY_HTML.includes('pz-hoy-chatghost'),
  '§6: la composición de Hoy llama a tira + insight + botón fantasma del chat');
t(!APP.includes("hfProfileActionsHTML(enHome, pzAcceptWeekHTML)"),
  '§6: Inicio ya no pasa la barra «Aprobar todo» al encabezado');

// ---------- §7: cableado de la tira (DOM falso) ----------
console.log('— §7: bind de la tira');
try {
  vm.runInContext("PZ_HOY_TIRA_DIAS = " + JSON.stringify(tiraPub.map((d) => ({ key: d.key, idx: d.idx, estado: d.estado, revelado: d.revelado, esHoy: d.esHoy, esManana: d.esManana, esPasado: d.esPasado, post: d.post ? { id: d.post.id, caption: d.post.caption, status: d.post.status, scheduled_at: d.post.scheduled_at, published_at: d.post.published_at, image_path: d.post.image_path, approval: d.post.approval } : null }))) + ";", sb);
  const root = new El('div');
  const cont = new El('div');
  cont.id = 'pzHoyTira';
  root._q['#pzHoyTira'] = cont;
  const mkBtn = (key) => { const b = new El('button'); b.setAttribute('data-pz-hoy-tira-dia', key); return b; };
  const bLun = mkBtn('2026-11-09'), bMar = mkBtn('2026-11-10'), bMie = mkBtn('2026-11-11');
  cont._q['[data-pz-hoy-tira-dia]:all'] = [bLun, bMar, bMie];
  cont._q['[data-pz-hoy-chat]:all'] = [];
  cont._q['[data-pz-boost-post]:all'] = [];
  sb.pzHoyTiraBind(root);
  t(typeof bMar.onclick === 'function', '§7: los días de la tira quedan cableados');
  vm.runInContext("PZ_HOY_TIRA_SEL = '2026-11-09';", sb);
  bMar.onclick();
  const sel = vm.runInContext('PZ_HOY_TIRA_SEL', sb);
  t(sel === '2026-11-10', '§7: tocar martes selecciona martes', sel);
  t(cont.innerHTML.includes('El de mañana') && cont.innerHTML.includes('Mañana 19:00'),
    '§7: al tocar martes, el detalle re-pintado muestra el posteo de mañana', cont.innerHTML.slice(0, 300));
} catch (e) { t(false, '§7: bind de la tira', e.message + '\n' + (e.stack || '')); }

// ---------- §8: boot ----------
console.log('— §8: boot');
const PORT = 34584;
const SECRET = 'lote-rediseno-rs2-secret';
const TOKEN = 'boot-test-token-rs2';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rediseno-rs2-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(sid, method, p, body, token) {
  const url = `http://127.0.0.1:${PORT}${p}${token ? (p.includes('?') ? '&' : '?') + 'token=' + token : ''}`;
  const r = await fetch(url, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
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
    ADMIN_TOKEN: 'boot-admin-rs2',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'sk-test-rs2',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§8: el servidor levanta con el lote RS-2 (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));
    const TODAY = dayKeyInTz(new Date(), TZ);
    const shiftDays = (ymd, n) => {
      const [y, m, d] = ymd.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12));
      dt.setUTCDate(dt.getUTCDate() + n);
      return dt.toISOString().slice(0, 10);
    };
    const MON = shiftDays(TODAY, -(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));
    const ver = await api('x', 'GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v843',
      '§8: /api/version trae el BUILD v843', JSON.stringify(ver.json));
    const appJs = await apiText('/app.js?v=999');
    t(appJs.status === 200 && appJs.text.includes('pzHoyTiraHTML') && appJs.text.includes('pzHoySemanaInsightHTML')
      && appJs.text.includes('pzHoyParaAprobarHTML') && appJs.text.includes('PZ_HOY_TIRA_SEL'),
      '§8: el app.js servido trae el bloque RS-2');
    t(appJs.status === 200 && !appJs.text.includes('Sin tu OK, no sale nada'),
      '§8: el app.js servido NO trae el saludo viejo');
    t(appJs.status === 200 && !appJs.text.includes('pzHoyUploadHTML') && !appJs.text.includes('pzHoySemanaHTML'),
      '§8: el app.js servido NO trae las funciones muertas (subida / semana grande)');
    t(md5(appJs.text) === md5(APP), '§8: el app.js servido es el del árbol RS-2 (md5 igual)');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    let schemaOk = false;
    for (let i = 0; i < 30; i++) {
      try {
        const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get();
        if (row) { schemaOk = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(schemaOk, '§8: el schema está listo (tabla users) antes de sembrar');
    if (!schemaOk) throw new Error('sin schema');
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 7 * 24 * 3600 * 1000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' },
      userId: uid,
    });
    const at2200Z = (ymd) => ymd + 'T22:00:00.000Z';
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (12, 'rs2-12@test.invalid', 'x', 'posty', 'active', 17)`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username) VALUES (12, 'Negocio RS-2', 'rs2test')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type, week_key, approval, created_at) VALUES (701, 12, '/media/701.jpg', 'Lunes', '', ?, ?, 'published', 'social', 'image', ?, 'approved', ?)`).run(at2200Z(shiftDays(TODAY, -6)), at2200Z(shiftDays(TODAY, -6)), MON, at2200Z(shiftDays(TODAY, -7)));
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (704, 12, '/media/704.jpg', 'Hoy', '', ?, 'scheduled', 'social', 'image', ?, 'pending', ?)`).run(shiftDays(TODAY, 1) + 'T00:30:00.000Z', MON, shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (705, 12, '/media/705.jpg', 'Mañana', '', ?, 'scheduled', 'social', 'image', ?, 'pending', ?)`).run(shiftDays(TODAY, 2) + 'T00:00:00.000Z', shiftDays(MON, 7), shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (706, 12, '/media/706.jpg', 'Borrador', '', NULL, 'draft', 'social', 'image', ?, 'pending', ?)`).run(MON, shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('rs2-12', sessJson(12), exp);
    const posts = await api('rs2-12', 'GET', '/api/posts');
    const list = (posts.json && (posts.json.posts || posts.json.items || posts.json)) || [];
    const byId = (id) => (Array.isArray(list) ? list.find((p) => Number(p.id) === id) : null);
    t(posts.status === 200 && byId(704) && byId(705) && byId(706),
      '§8: /api/posts trae hoy (704), mañana (705) y el borrador (706)', JSON.stringify(posts.json && posts.json.error));
    t(byId(701) && byId(701).status === 'published',
      '§8: /api/posts trae el publicado de la semana (701) — la materia de la tira');
    const auto = await api('rs2-12', 'GET', '/api/autopilot');
    t(auto.status === 200 && auto.json && typeof auto.json.enabled === 'boolean',
      '§8: GET /api/autopilot responde (el modo que lee el saludo)', JSON.stringify(auto.json));
    const ap = await api('rs2-12', 'POST', '/api/posts/705/approve', {});
    t(ap.status === 200 && ap.json && ap.json.ok === true,
      '§8: «Dale» del posteo de mañana: POST /api/posts/705/approve → 200 ok', JSON.stringify(ap.json));
    const posts2 = await api('rs2-12', 'GET', '/api/posts');
    const list2 = (posts2.json && (posts2.json.posts || posts2.json.items || posts2.json)) || [];
    const p705 = Array.isArray(list2) ? list2.find((p) => Number(p.id) === 705) : null;
    t(p705 && p705.approval === 'approved', '§8: el posteo 705 queda aprobado en la DB');
  } catch (e) {
    t(false, '§8: boot', e.message);
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nRS-2: ${okN} ok, ${badN} fallos`);
  process.exit(badN ? 1 : 0);
})();
