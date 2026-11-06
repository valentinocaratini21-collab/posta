'use strict';
/* LOTE ESTRATEGIA-APRENDE — «Posty aprendió» en Estrategia.
 * node test-loteestrategiaaprende.js (desde la raíz del árbol).
 * Cubre: una sola frase real desde semana-aprende (prioridad IG → aces →
 * preguntas → semana aceptada), nunca frase desde fechas ni preguntas sin
 * fecha, aislamiento por cliente, ES/EN, render del cliente y cableado. */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const sa = require('./semana-aprende');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

const BASE = {
  tiene: true, prev: '2026-10-19', target: '2026-10-26', piezas: [],
  aces: [], semanaAceptada: false, preguntas: [], preguntasRecientes: [],
  ig: [], fechasCubiertas: [], fechasPendientes: [],
};
const ap = (o) => Object.assign({}, BASE, o);

// ---------- 1. Prioridad y frases (ES) ----------
t('IG manda sobre aces y preguntas',
  sa.fraseAprendizaje(ap({
    ig: [{ tema: 'Turnos del sábado', comments: 4, saves: 3 }],
    aces: [{ tema: '2x1 de medialunas', tipo: 'promo', n: 2 }],
    preguntas: [{ texto: '¿abren el domingo?' }],
    semanaAceptada: true,
  }), 'es') === 'En Instagram, «Turnos del sábado» sumó 3 guardados y 4 comentarios.');
t('IG con solo guardados',
  sa.fraseAprendizaje(ap({ ig: [{ tema: 'Promo', comments: 0, saves: 5 }] }), 'es')
    === 'En Instagram, «Promo» sumó 5 guardados.');
t('IG elige el tema con más reacciones',
  sa.fraseAprendizaje(ap({ ig: [
    { tema: 'A', comments: 1, saves: 0 },
    { tema: 'B', comments: 2, saves: 2 },
  ] }), 'es') === 'En Instagram, «B» sumó 2 guardados y 2 comentarios.');
t('Sin IG: aces con conteo',
  sa.fraseAprendizaje(ap({ aces: [{ tema: '2x1 de medialunas', tipo: 'promo', n: 2 }] }), 'es')
    === 'Aceptados sin cambios la semana pasada: 2x1 de medialunas (2 veces).');
t('Sin IG ni aces: primera pregunta verbatim',
  sa.fraseAprendizaje(ap({ preguntas: [{ texto: '¿tienen opciones sin TACC?' }, { texto: '¿abren el domingo?' }] }), 'es')
    === 'Preguntas recibidas la semana pasada: «¿tienen opciones sin TACC?»');
t('Solo semana aceptada',
  sa.fraseAprendizaje(ap({ semanaAceptada: true }), 'es')
    === 'La semana del 2026-10-19 se aceptó entera.');

// ---------- 2. Nunca frase inventada ----------
t('tiene=false con preguntas recientes → null',
  sa.fraseAprendizaje(ap({ tiene: false, preguntasRecientes: [{ texto: '¿cuánto sale?' }] }), 'es') === null);
t('tiene=true solo por fechas cubiertas → null (las fechas son contexto)',
  sa.fraseAprendizaje(ap({ fechasCubiertas: [{ nombre: 'Día de la Madre', fecha: '2026-10-18' }] }), 'es') === null);
t('ap vacío → null',
  sa.fraseAprendizaje(null, 'es') === null && sa.fraseAprendizaje({}, 'es') === null);
t('fechas pendientes solas no generan frase',
  sa.fraseAprendizaje(ap({ tiene: true, fechasPendientes: [{ nombre: 'Navidad', fecha: '2026-12-24' }] }), 'es') === null);

// ---------- 3. EN (plantillas localizadas, datos verbatim) ----------
t('EN: IG',
  sa.fraseAprendizaje(ap({ ig: [{ tema: 'Turnos del sábado', comments: 4, saves: 3 }] }), 'en')
    === 'On Instagram, «Turnos del sábado» got 3 saves and 4 comments.');
t('EN: aces',
  sa.fraseAprendizaje(ap({ aces: [{ tema: 'Cortes de pelo', tipo: 'tip', n: 1 }] }), 'en')
    === 'Accepted unchanged last week: Cortes de pelo.');
t('EN: preguntas',
  sa.fraseAprendizaje(ap({ preguntas: [{ texto: 'Do you open Sundays?' }] }), 'en')
    === 'Questions received last week: «Do you open Sundays?»');
t('EN: semana aceptada',
  sa.fraseAprendizaje(ap({ semanaAceptada: true }), 'en')
    === 'The week of 2026-10-19 was accepted in full.');

// ---------- 4. Aislamiento por cliente (DB real en memoria) ----------
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, source_topic TEXT DEFAULT '',
  source_angle TEXT DEFAULT '', tipo TEXT DEFAULT '', status TEXT DEFAULT 'draft', week_key TEXT DEFAULT '');
CREATE TABLE oficina_nivel_eventos (id INTEGER PRIMARY KEY, user_id INTEGER, poder TEXT,
  evento TEXT, hecho TEXT DEFAULT '', registro_ref TEXT DEFAULT '', ts INTEGER);
CREATE TABLE comment_queue (id INTEGER PRIMARY KEY, user_id INTEGER, text TEXT DEFAULT '', created_at TEXT DEFAULT '');
CREATE TABLE dm_queue (id INTEGER PRIMARY KEY, user_id INTEGER, text TEXT DEFAULT '', created_at TEXT DEFAULT '');
CREATE TABLE piece_learning (post_id INTEGER PRIMARY KEY, user_id INTEGER, comments INTEGER DEFAULT 0, saves INTEGER DEFAULT 0);
`);
const insP = db.prepare('INSERT INTO posts (id, user_id, source_topic, source_angle, tipo, status, week_key) VALUES (?, ?, ?, ?, ?, ?, ?)');
insP.run(11, 1, '2x1 de medialunas', 'promo', 'promo', 'published', '2026-10-19');
insP.run(12, 1, 'Turnos del sábado', 'agenda', 'tip', 'published', '2026-10-19');
insP.run(21, 2, 'Cortes de pelo', 'estilo', 'tip', 'published', '2026-10-19');
const ms = Date.UTC(2026, 9, 21, 15);
const insE = db.prepare('INSERT INTO oficina_nivel_eventos (user_id, poder, evento, hecho, registro_ref, ts) VALUES (?, ?, ?, ?, ?, ?)');
insE.run(1, 'posty', 'pieza_aceptada_primera', 'aceptada sin cambios', 'pieza:11', ms);
insE.run(2, 'posty', 'pieza_aceptada_primera', 'aceptada sin cambios', 'pieza:21', ms);
db.prepare('INSERT INTO piece_learning (post_id, user_id, comments, saves) VALUES (12, 1, 4, 3)').run();
const f1 = sa.fraseAprendizaje(sa.aprendizajeSemanaAnterior(db, 1, '2026-10-26'), 'es');
const f2 = sa.fraseAprendizaje(sa.aprendizajeSemanaAnterior(db, 2, '2026-10-26'), 'es');
const f3 = sa.fraseAprendizaje(sa.aprendizajeSemanaAnterior(db, 3, '2026-10-26'), 'es');
t('cliente 1: frase IG propia', f1 === 'En Instagram, «Turnos del sábado» sumó 3 guardados y 4 comentarios.', f1);
t('cliente 2: frase de aces propia, sin tema del cliente 1',
  f2 === 'Aceptados sin cambios la semana pasada: Cortes de pelo.' && !f2.includes('medialunas'), f2);
t('cliente 1: sin tema del cliente 2', !f1.includes('Cortes de pelo'), f1);
t('cliente sin registros: null', f3 === null, f3);

// ---------- 5. Render del cliente (bloque real extraído del chunk) ----------
const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const m = chunk.match(/function anaAprendeHTML\(d\) \{[\s\S]*?\n\}/);
t('anaAprendeHTML existe en el chunk', !!m);
let anaLang = 'es';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const anaT = (es, enS) => (anaLang === 'en' ? enS : es);
let anaPastMode = false;
let anaAprendeHTML = null;
if (m) {
  const factory = new Function('esc', 'anaT', 'anaPastMode', `${m[0]}; return anaAprendeHTML;`);
  // anaPastMode se lee como global dentro de la función; se evalúa con el valor actual
  anaAprendeHTML = factory(esc, anaT, false);
}
if (anaAprendeHTML) {
  anaLang = 'es';
  const hEs = anaAprendeHTML({ aprendizaje: 'En Instagram, «X» sumó 2 guardados.' });
  t('render ES: etiqueta + frase', hEs.includes('Posty aprendió') && hEs.includes('«X» sumó 2 guardados.') && hEs.includes('ana-aprende'), hEs);
  anaLang = 'en';
  const hEn = anaAprendeHTML({ aprendizaje: 'Accepted unchanged last week: Y.' });
  t('render EN: etiqueta localizada', hEn.includes('Posty learned') && hEn.includes('Accepted unchanged'), hEn);
  anaLang = 'es';
  t('sin frase → vacío',
    anaAprendeHTML({ aprendizaje: '' }) === '' && anaAprendeHTML({}) === '' && anaAprendeHTML({ aprendizaje: null }) === '');
  t('frase con HTML se escapa',
    anaAprendeHTML({ aprendizaje: '<script>alert(1)</script>' }).includes('&lt;script&gt;'));
  // modo pasado: re-evaluar con anaPastMode=true
  const factoryPast = new Function('esc', 'anaT', 'anaPastMode', `${m[0]}; return anaAprendeHTML;`);
  // La función referencia anaPastMode global; se prueba con el flag global del módulo:
  globalThis.__anaPastModeTest = true;
  const srcPast = m[0].replaceAll('anaPastMode', 'globalThis.__anaPastModeTest');
  const fnPast = new Function('esc', 'anaT', `${srcPast}; return anaAprendeHTML;`)(esc, anaT);
  t('modo pasado → vacío', fnPast({ aprendizaje: 'En Instagram, «X» sumó 2 guardados.' }) === '');
  void factoryPast;
}

// ---------- 6. Cableado estático ----------
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
t('server: analysisPayload expone aprendizaje',
  serverJs.includes('aprendizaje,') && serverJs.includes('fraseAprendizaje'));
t('server: aprendizaje usa la semana actual zona cuenta y user_id',
  serverJs.includes('mondayKeyOf(tzToday(userTz(uid)))') && serverJs.includes('aprendizajeSemanaAnterior(db, uid, wk)'));
t('server: fail-closed (el aprendizaje nunca frena /api/analysis)',
  /catch \(e\) \{ aprendizaje = null; \}/.test(serverJs));
t('chunk: anaAprendeHTML llamada SOLO en la rama sin carta de anaCartaHTML (decisión 6/11: la carta termina en Compartir)',
  (chunk.match(/h \+= anaAprendeHTML\(d\);/g) || []).length === 1);
t('server: la carta anterior (:id) NO trae aprendizaje (doble guarda)',
  serverJs.includes('plan: plan.id, past: true, analysis: analysisEngine.gateForPlan(analysis, plan.id) })'));
t('styles: regla .ana-aprende', styles.includes('.ana-aprende{'));
t('Impulsar intacto en el chunk', chunk.includes('anaBoostRec'));
t('botón de audio de la carta AUSENTE (estrategia-sin-audio v565 aterrizó antes que la tanda; el assert del lote presuponía lo contrario)',
  !chunk.includes('Escuchá tu carta'));

console.log(`loteestrategiaaprende: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
