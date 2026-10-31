// test-preguntas-posteos.js — Tests de PREGUNTAS→POSTEOS (node, sin deps).
// Uso: node test-preguntas-posteos.js [dir-con-copias-parcheadas]
//   Sin argumento: solo tests del módulo puro.
//   Con argumento: además verifica los marcadores del patch y que los
//   archivos parcheados pasen node --check (se corre desde verificar.sh).
// Criterio: 100% o nada. Cada fallo imprime su nombre y sale 1.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pp = require('./preguntas-posteos.js');

let n = 0;
let fails = [];
function t(nombre, cond, extra) {
  n += 1;
  if (cond) console.log('ok ' + n + ' - ' + nombre);
  else { console.log('FALLO ' + n + ' - ' + nombre + (extra ? ' :: ' + extra : '')); fails.push(nombre); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Fixture: comentarios reales simulados (forma del bundle IG) ---
const COMENTARIOS = [
  { username: 'ana', text: '¿Hacen envíos?' },
  { username: 'luis', text: 'hacen envios' },
  { username: 'mara', text: '¡Hacen envíos!!' },
  { username: 'ana', text: '¿Abren los domingos?' },
  { username: 'luis', text: '¿abren los domingos?' },
  { username: 'pedro', text: 'abren los domingos??' },
  { username: 'ana', text: 'qué rico todo' },
  { username: 'luis', text: 'me encanta este lugar' },
  { username: 'sola', text: '¿tienen promo?' },
  { username: 'sola', text: '¿tienen promo?' },
  { username: 'sola', text: '¿tienen promo?' },
  { username: 'juan', text: '¿hacen envíos a domicilio?' },
  { username: 'rosa', text: '¿hacen envíos a domicilio?' },
  { username: 'tito', text: '¿hacen envíos a domicilio?' },
];

// 1. Normalización: solo ortografía.
t('normaliza acentos/mayúsculas/signos', pp.normalizeQuestion('¿Hacen ENVÍOS?') === 'hacen envios');
t('isQuestion con ?', pp.isQuestion('¿hacen envíos?') === true);
t('isQuestion sin ? con verbo', pp.isQuestion('hacen envios') === true);
t('isQuestion sin ? con interrogativo', pp.isQuestion('cuando abren') === true);
t('elogio no es pregunta', pp.isQuestion('qué rico todo') === false);
t('afirmación no es pregunta', pp.isQuestion('me encanta este lugar') === false);
t('vacío no es pregunta', pp.isQuestion('') === false && pp.isQuestion('  ') === false);

// 2. Agrupación: variantes ortográficas = un grupo; 3 voces, 3 veces.
const grupos = pp.groupQuestions(COMENTARIOS);
const envios = grupos.find(g => g.clave === 'hacen envios');
const domingos = grupos.find(g => g.clave === 'abren los domingos');
const domicilio = grupos.find(g => g.clave === 'hacen envios a domicilio');
t('grupo envíos existe con 3 veces', !!envios && envios.veces === 3);
t('grupo envíos con 3 autores', !!envios && envios.autores.length === 3);
t('grupo envíos pregunta verbatim', !!envios && envios.pregunta === '¿Hacen envíos?');
t('grupo domingos existe con 3 veces', !!domingos && domingos.veces === 3);
t('grupo domicilio es grupo SEPARADO (sin fusión semántica)',
  !!domicilio && domicilio.veces === 3 && domicilio.clave !== 'hacen envios');

// 3. Umbral: 2 menciones no alcanzan; 1 autor 3 veces NO alcanza (anti-spam).
t('promo de un solo autor 3 veces queda FUERA', !grupos.find(g => g.clave === 'tienen promo'));
t('sin grupos de menos de 3', grupos.every(g => g.veces >= 3 && g.autores.length >= 2));
t('umbral exportado es 3/2', pp.UMBRAL_VECES === 3 && pp.MIN_AUTORES === 2);

// 4. Una pregunta por propuesta; tope; orden.
const props = pp.buildPropuestas(grupos, []);
t('una propuesta por grupo', props.length === grupos.length);
t('cada propuesta lleva una sola pregunta', props.every(p => typeof p.pregunta === 'string' && p.pregunta.length > 0));
t('todas pendientes', props.every(p => p.estado === 'pendiente'));
t('ninguna propuesta trae campo de publicación',
  props.every(p => !('publish' in p) && !('published' in p) && !('post_id' in p) && !('status' in p)));
t('orden por veces desc', props.map(p => p.veces).every((v, i, a) => i === 0 || v <= a[i - 1]));

// 5. Deduplicación contra la cola existente.
const props2 = pp.buildPropuestas(grupos, ['hacen envios']);
t('clave ya en cola no se duplica', props2.length === props.length - 1 && !props2.find(p => p.clave === 'hacen envios'));

// 6. Sin preguntas reales no hay propuestas (nada inventado).
t('entrada vacía → cero grupos y cero propuestas',
  pp.groupQuestions([]).length === 0 && pp.buildPropuestas([], []).length === 0);
t('solo elogios → cero propuestas',
  pp.propuestasDesdeComentarios([{ username: 'a', text: 'qué rico' }, { username: 'b', text: 'me encanta' }]).propuestas.length === 0);
t('entrada no-array no rompe', pp.groupQuestions(null).length === 0 && pp.groupQuestions(undefined).length === 0);

// 7. Ítem de Bandeja: un toque, sin publicar, sin inventar respuesta.
const item = pp.itemBandejaPara(props[0]);
t('ítem Bandeja poder posty', item.poder === 'posty');
t('ítem Bandeja tipo pregunta_posteo', item.contexto.tipo === 'pregunta_posteo');
t('ítem Bandeja sin push en ráfaga', item.push === false);
t('ítem Bandeja no inventa respuesta (lo dice)', /no inventa respuestas/.test(item.propuesta));
t('ítem Bandeja no trae publicar', !/publica/.test(item.que) && !/publica/.test(item.propuesta));

// 8. Efecto de aceptación: registra, no crea posteo ni publica.
const efOk = pp.efectoDecisionPregunta({ contexto: item.contexto, nota_dueno: 'Sí, enviamos a todo CABA' }, 'aceptar');
t('aceptar con nota registra pregunta+respuesta', efOk.tipo === 'pregunta_aceptada' && /todo CABA/.test(efOk.resumen));
const efSin = pp.efectoDecisionPregunta({ contexto: item.contexto, nota_dueno: '' }, 'aceptar');
t('aceptar sin nota dice respuesta_pendiente y que no se creó posteo',
  /respuesta_pendiente/.test(efSin.resumen) && /no se creó ningún posteo/i.test(efSin.resumen));
const efCambio = pp.efectoDecisionPregunta({ contexto: item.contexto, nota_dueno: 'otra foto' }, 'cambio');
t('cambio registra cambio_pedido', efCambio.tipo === 'pregunta_cambio');
t('ningún efecto menciona publicar/posteo creado como acción',
  [efOk, efSin, efCambio].every(e => !/se publicó|se creó un posteo|post_id/.test(e.resumen)));

// 9. El módulo no contiene ningún camino de publicación (auditoría textual).
const src = fs.readFileSync(path.join(__dirname, 'preguntas-posteos.js'), 'utf8');
t('módulo sin INSERT INTO posts', !/INSERT INTO posts/.test(src));
t('módulo sin publish(', !/\.publish\(|publishPost|publicar\(/.test(src));

// 10. Patch aplicado en las copias (solo si se pasa el dir).
const dir = process.argv[2];
if (dir) {
  const checks = [
    ['ig-comments.js', 'PP-PREGUNTAS-POSTEOS-IG', ['grupos_preguntas', "require('./preguntas-posteos')"]],
    ['server.js', 'PP-PREGUNTAS-POSTEOS-SERVER', ['/api/preguntas-posteos/propuestas', 'preguntasPosteos.buildPropuestas', 'itemBandejaPara']],
    ['posty-oficina.js', 'PP-PREGUNTAS-POSTEOS-OFICINA', ['pregunta_posteo', 'efectoDecisionPregunta']],
  ];
  for (const [f, mark, needles] of checks) {
    const p = path.join(dir, f);
    const txt = fs.readFileSync(p, 'utf8');
    t('patch presente en ' + f, txt.includes(mark) && needles.every(s => txt.includes(s)));
    // Sin camino de publicación agregado en el hook (solo el cuerpo de
    // hookBandeja: el resto del archivo ya tenía 'published' como estado
    // de posteos preexistente, que no es un camino de publicación nuevo).
    if (f === 'posty-oficina.js') {
      const h0 = txt.indexOf('function hookBandeja');
      const h1 = txt.indexOf('// El chat', h0);
      const hook = txt.slice(h0, h1 === -1 ? undefined : h1);
      t('hook sin INSERT INTO posts ni publish', hook.includes('pregunta_posteo') && !/INSERT INTO posts/.test(hook) && !/publish/.test(hook));
    }
  }
  // node --check de los 4 archivos (el módulo nuevo + los 3 parcheados).
  // server.js parcheado exige el módulo nuevo junto a él: se copia antes.
  for (const f of ['preguntas-posteos.js', 'ig-comments.js', 'server.js', 'posty-oficina.js']) {
    const p = f === 'preguntas-posteos.js' ? path.join(__dirname, f) : path.join(dir, f);
    try {
      execSync('node --check ' + JSON.stringify(p), { stdio: 'pipe' });
      t('node --check ' + f, true);
    } catch (e) { t('node --check ' + f, false, String(e.message).slice(0, 200)); }
  }
}

console.log('\n' + n + ' tests, ' + fails.length + ' fallos.');
if (fails.length) { console.log('FALLOS: ' + fails.join(' | ')); process.exit(1); }
console.log('PREGUNTAS→POSTEOS: TODOS LOS TESTS OK');
