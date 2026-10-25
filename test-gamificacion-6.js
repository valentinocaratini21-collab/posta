// test-gamificacion-6.js — LOS 6 AGREGADOS DE GAMIFICACIÓN (v459).
// 1) Primera subida: el puente vive en GET /api/oficina/nivel (estático:
//    digest con fundamento + sin evento fundamento_leido => emite el puente).
// 2) Desafío de la semana: una clave por nudo, con su acción de un toque.
// 3) Prueba del nivel: UN ejemplo real por nivel; sin dato real, null.
// 4) La familia festeja: solo 4 poderes + Bambooty (jamás especialistas).
// 5) Brote sorpresa: solo hecho real nuevo (fundamento o diff del digest).
// 6) Mientras no estabas: solo tras 3+ días y solo con progreso real.
// Sin puntajes, sin rachas, sin lenguaje de fracaso en el bloque nuevo.
'use strict';
const fs = require('fs');
const path = require('path');
const niveles = require('./niveles');

let ok = 0, fail = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const sch = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');

console.log('— desafio: una clave por nudo, con acción de un toque —');
const claves = new Set();
for (const L of [2, 3, 4, 5]) for (const r of (niveles.PODERES.posty.gates[L] || [])) claves.add(r.evento);
t(claves.size === 7, 'posty tiene 7 claves de nudo en sus gates');
for (const c of claves) {
  const niv = { nivel: 1, gate: { pendientes: [{ clave: c, falta: 'x' }] } };
  const d = niveles.desafioPara(niv);
  t(!!d && d.clave === c && typeof d.accion === 'string' && d.accion.startsWith('#/app/') && d.titulo.es && d.titulo.en && d.texto.es && d.texto.en && d.semana, 'desafio para ' + c);
}
t(niveles.desafioPara({ nivel: 5, gate: { pendientes: [] } }) === null, 'L5: sin desafio');
t(niveles.desafioPara({ nivel: 2, gate: { pendientes: [{ clave: 'clave_inventada' }] } }) === null, 'clave desconocida: sin desafio');

console.log('— prueba del nivel: un ejemplo real, o nada —');
t(niveles.pruebaPara({ nivel: 1, eventos: {} }, {}) === null, 'L1: sin prueba');
const p2 = niveles.pruebaPara({ nivel: 2, eventos: {} }, { business: 'Café Aroma', item: 'Brunch para dos' });
t(!!p2 && p2.es.includes('Brunch para dos') && p2.en.includes('Brunch para dos'), 'L2: prueba con rubro/oferta real');
t(niveles.pruebaPara({ nivel: 2, eventos: {} }, {}) === null, 'L2 sin dato real: sin prueba (no se inventa)');
const p3 = niveles.pruebaPara({ nivel: 3, eventos: {} }, { ultimaSemana: { fecha: '20/10/2026' } });
t(!!p3 && p3.es.includes('20/10/2026'), 'L3: prueba con la semana real generada');
t(niveles.pruebaPara({ nivel: 3, eventos: {} }, {}) === null, 'L3 sin semana generada: sin prueba');
const p4 = niveles.pruebaPara({ nivel: 4, eventos: { pieza_aceptada_primera: 3 } }, {});
t(!!p4 && p4.es.includes('3 piezas'), 'L4: prueba con piezas reales aceptadas sin cambios');
const p5 = niveles.pruebaPara({ nivel: 5, eventos: { semana_publicada: 4, pregunta_respondida: 2 } }, {});
t(!!p5 && p5.es.includes('4 semanas') && p5.es.includes('2 preguntas'), 'L5: prueba con semanas y preguntas reales');
t(niveles.pruebaPara({ nivel: 5, eventos: {} }, {}) === null, 'L5 sin semanas publicadas: sin prueba');

console.log('— cableado en el servidor (emisores reales, con dedupe) —');
t(srv.includes('puente:prueba') && srv.includes('hasFoundation'), 'puente primera subida: digest con fundamento => fundamento_leido');
t(srv.includes("nivelEmitir(db, uid, 'semana_generada'"), 'emisor semana_generada en generateWeekDrafts');
t(srv.includes("nivelEmitir(db, uid, 'pieza_aceptada_primera'"), 'emisor pieza_aceptada_primera en acceptAllDrafts (sin señal edited)');
t(srv.includes("nivelEmitir(db, uid, 'semana_aceptada'"), 'emisor semana_aceptada en accept-all y /aprobar');
t(srv.includes("nivelEmitir(db, req.session.userId, 'pregunta_respondida'"), 'emisor pregunta_respondida en onboarding/responder');
t(sch.includes("evento: 'semana_publicada'") && sch.includes('semana-publicada:'), 'emisor semana_publicada en scheduler al completar la semana');
t(sch.includes('!result.demo') && sch.includes('!opts.house'), 'semana_publicada: nunca demo ni house');
t(srv.includes("app.post('/api/oficina/nivel/brote-visto'"), 'endpoint brote-visto');
t(srv.includes('nivel_visitas') && srv.includes('3 * 24 * 3600 * 1000'), 'ausencia: visita registrada + umbral 3 días');
t(srv.includes("registro_ref NOT LIKE 'puente:%'"), 'ausencia: el puente no cuenta como progreso');
t(srv.includes('desafio:') && srv.includes('prueba:') && srv.includes('brote:') && srv.includes('ausencia'), 'GET /api/oficina/nivel sirve desafio + prueba + brote + ausencia');

console.log('— cliente: tira extra + familia festeja —');
for (const f of ['pzNivelExtraHTML', 'pzNivelFamiliaHTML', 'pzNivelBroteVisto']) {
  t(app.includes('function ' + f + '('), 'definida ' + f);
}
t(app.includes('pzNivelExtraHTML(nv, en)') && app.includes('pzNivelFamiliaHTML(nv, en)'), 'tira y celebración llaman a las funciones nuevas (familia recibe nv)');
t(app.includes('LA OFICINA FESTEJA') && app.includes('Venty') && app.includes('Gesty') && app.includes('Atenty'), 'familia: filas Venty + Gesty + Atenty existen como datos (se filtran por poderes)');
t(app.includes('Toda tu oficina festeja con vos'), 'familia: cierre dorado de Bambooty');
const famRaw = app.slice(app.indexOf('function pzNivelFamiliaHTML'), app.indexOf('function pzNivelBroteVisto'));
t(!/Desy|Growty|Talenty|Bossty/.test(famRaw), 'familia: jamás especialistas por proyecto');
t(famRaw.includes('poderes.includes(r[0])'), 'familia: filas filtradas por poderes contratados (no se renderiza lo no contratado)');
t(famRaw.includes("['posty']"), 'familia: falla cerrada a solo Posty sin poderes válidos');
t(srv.includes('poderes: oficina.niveles.poderesContratados(db, uid)'), 'GET /api/oficina/nivel sirve poderes contratados');
t(srv.includes('CREATE TABLE IF NOT EXISTS poderes_contratados'), 'tabla poderes_contratados creada en nivelTablasEnsure');
t(app.includes('Desafío de esta semana') && app.includes('La prueba de tu nivel:') && app.includes('Brote sorpresa:') && app.includes('Mientras no estabas'), 'tira: desafio + prueba + brote + ausencia renderizados');
for (const c of ['.pz-desafio', '.pz-prueba', '.pz-brote', '.pz-ausencia', '.pz-fam']) t(css.includes(c), 'estilo ' + c);
const blockRaw = app.slice(app.indexOf('TIRA DE NIVEL POSTY'), app.indexOf('function mzOpenSheet'));
const block = blockRaw.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
t(!/puntos|racha|fracaso|perdiste/i.test(block), 'el bloque nuevo no tiene puntajes, rachas ni lenguaje de fracaso');

console.log(`\ntest-gamificacion-6: ${ok} ok / ${fail} fallas`);
process.exit(fail ? 1 : 0);
