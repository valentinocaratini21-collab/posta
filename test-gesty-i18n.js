// test-gesty-i18n.js — Gesty bilingüe ES/EN: variantes, endpoints y frontend.
// La app cambia total entre ES/EN con ME.lang; nunca mezcla.
'use strict';
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let ok = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { ok++; }
  else { fail++; console.log('FALLO:', name, extra || ''); }
}

const variantes = require('./gesty-variantes');
// 1. Variantes EN: las 8 + genérico
const EN = {
  cafe: 'Your table is ready', peluqueria: "You're up", clinica: 'Please go to the consulting room',
  estetica: 'Please go to the treatment room', veterinaria: 'Please go to the consulting room',
  taller: "You're up", entrenamiento: "You're up", estudio: 'Please go to the office',
};
for (const [id, llamarEn] of Object.entries(EN)) {
  t(`variante EN ${id}`, variantes.llamarPara(id, 'en') === llamarEn, variantes.llamarPara(id, 'en'));
  t(`variante ES ${id} intacta`, typeof variantes.llamarPara(id) === 'string' && variantes.llamarPara(id).length > 0);
}
t('genérico EN', variantes.llamarPara('', 'en') === 'You can come in now');
t('genérico ES intacto', variantes.llamarPara('') === 'Ya puede pasar');
t('lista trae nombre_en y llamar_en', (() => {
  const l = variantes.lista();
  return l.length === 8 && l.every((v) => v.nombre_en && v.llamar_en);
})());

// 2. Backend: recepcion llamar_texto_en + frase_en + probar mensaje_en + espejo mensaje_vacio_en
const gesty = require('./gesty.js');
const vistas = require('./gesty-vistas.js');
const prueba = require('./gesty-prueba.js');
const HOY = '2027-03-02';
function dbNueva() {
  const db = new DatabaseSync(':memory:');
  gesty.initGesty(db);
  gesty.setPack(db, 1, 'completa', { origen: 'test' });
  return db;
}
try {
  const db = dbNueva();
  const rec = vistas.vistaRecepcion(db, 1, { hoy: HOY });
  t('recepcion trae llamar_texto_en', typeof rec.secciones.turnos.llamar_texto_en === 'string' && rec.secciones.turnos.llamar_texto_en.length > 0, rec.secciones.turnos.llamar_texto_en);
  t('recepcion llamar_texto ES intacto', rec.secciones.turnos.llamar_texto === 'Ya puede pasar');
  const hoy = vistas.gestyHoy(db, 1, { hoy: HOY });
  t('gestyHoy trae frase_en', typeof hoy.frase_en === 'string' && hoy.frase_en.length > 0, hoy.frase_en);
  for (const s of vistas.SUPERFICIES) {
    const r = vistas.probarSuperficie(db, 1, s, {});
    t(`probar ${s} trae mensaje_en`, typeof r.mensaje_en === 'string' && r.mensaje_en.length > 0, r.mensaje_en);
  }
  prueba.iniciar(db, 1, { contacto: 'Dueno@Test.com' });
  const esp = prueba.espejoAyer(db, 1, {});
  t('espejo trae mensaje_vacio_en', typeof esp.mensaje_vacio_en === 'string');
  db.close();
} catch (e) {
  t('backend i18n sin excepciones', false, e.stack.split('\n').slice(0, 3).join(' | '));
}

// 3. Frontend: gzT + picks por idioma + textos EN clave
const app = fs.readFileSync('./public/app.js', 'utf8');
t('helper gzT definido', app.includes('function gzT(es, en)'));
const gzStart = app.indexOf('function gzAvatar()');
const gzEnd = app.indexOf('async function bbChatSend()');
const gz = app.slice(gzStart, gzEnd);
for (const s of ['llamar_texto_en', 'frase_en', 'mensaje_en', 'mensaje_vacio_en', 'nombre_en', 'llamar_en']) {
  t(`frontend usa ${s}`, gz.includes(s));
}
for (const s of ['Client arrived', 'Waiting now', 'Try Gesty free', 'Business type', 'Gesty trial', 'Record payment', 'Morning queue', "Today's payments", 'Add an agent']) {
  t(`texto EN presente: ${s}`, gz.includes(s), s);
}
// 4. Sin español crudo en botones clave del bloque (los que traduce gzT)
for (const s of ['>Confirmar</button>', '>Atendido</button>', '>El cliente llegó</button>', '>Devolver</button>', '>Guardar tipo</button>', '>Probar Gesty gratis</button>']) {
  t(`sin botón ES crudo: ${s}`, !gz.includes(s), s);
}

console.log(`\nI18N: ${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
