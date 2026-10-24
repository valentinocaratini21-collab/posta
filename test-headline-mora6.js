// test-headline-mora6.js — MORA-6 (2026-10-24): el titular declarativo
// cortado que termina en INFINITIVO colgado ("Te voy a ser honesto:
// tener", id real 498 — 3ª ocurrencia de la clase tras 482/473) ya no
// sale disfrazado de frase completa: makeHeadline paso 9b lo cierra
// con "…" (regla de la casa: corte visible, nunca cierre falso).
// Banco de casos reales + fronteras de la regla + paridad de espejos
// (server.js ↔ generator.js) + ejemplo real en el prompt del QA.
// Uso: node test-headline-mora6.js
'use strict';

const fs = require('fs');
const path = require('path');
const generator = require('./generator.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
}
const mh = (t, rubro) => generator.makeHeadline(t, 6, 70, rubro || null);

console.log('— banco real de la clase TITULAR INCOMPLETO (Mora)');
{
  const out498 = mh('Te voy a ser honesto: tener un termotanque eficiente te ahorra plata');
  check('id 498: infinitivo colgado cierra con "…"', out498 === 'Te voy a ser honesto: tener…', out498);
  const out482 = mh('Halloween: tu Instagram, el alma de la fiesta');
  check('id 482 (paso 9): complemento con "de" cierra con "…"', out482 === 'Halloween: tu Instagram, el alma…', out482);
  const out473 = mh('Llegó Muebles a medida, ideales para tu comedor');
  check('id 473 (paso 9): adjetivo con "para" cierra con "…"', out473 === 'Llegó Muebles a medida, ideales…', out473);
}

console.log('— paso 9b: variantes del infinitivo colgado');
{
  const hacer = mh('Todo lo que podés hacer en tu cocina con poco presupuesto');
  check('"hacer" colgado → "…"', hacer === 'Todo lo que podés hacer…', hacer);
  const excl = mh('¡Hoy podés empezar a vender sin vueltas ni excusas!');
  check('exclamación cortada en infinitivo: "…" reemplaza al "!"', excl.endsWith('vender…') && !excl.endsWith('!'), excl);
}

console.log('— reglas hermanas intactas');
{
  const q413 = mh('¿Listo para que tu Instagram sea el alma de la fiesta este Halloween?');
  check('413: pregunta cortada = "…" y sin "?"', q413.endsWith('…') && !q413.endsWith('?'), q413);
  const qFull = mh('¿Ya probaste nuestro blend?');
  check('pregunta que entra entera: "?" normal, sin "…"', qFull.endsWith('?') && !qFull.includes('…'), qFull);
  const nominal = mh('Ramos frescos, hechos hoy en el local del barrio');
  check('nominal completo (adjunto cortado): sin "…"', nominal === 'Ramos frescos, hechos hoy', nominal);
  const precio = mh('La docena de facturas a $12.500 recién salida del horno', 'gastronomia');
  check('precio entero intacto, sin "…"', precio.includes('$12.500') && !precio.includes('…'), precio);
}

console.log('— fronteras del paso 9b (la lista es cerrada y exige prefijo propio)');
{
  const entera1 = mh('Animate a crear');
  check('oración ENTERA que termina en infinitivo de la lista: intacta', entera1 === 'Animate a crear', entera1);
  const entera2 = mh('Aprendé a vender online');
  check('oración entera con "vender": intacta', entera2 === 'Aprendé a vender online', entera2);
  const fuera = mh('Sesiones de estiramiento para mejorar tu postura corporal');
  check('infinitivo FUERA de la lista cerrada ("mejorar"): sin "…"', fuera === 'Sesiones de estiramiento para mejorar', fuera);
}

console.log('— paridad de espejos y prompt del QA');
{
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const genSrc = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
  const setOf = (src) => {
    const m = src.match(/HEADLINE_INFINITIVES = new Set\(\[([^\]]*)\]\)/);
    return m ? m[1].split(',').map(s => s.trim().replace(/'/g, '')).sort().join(',') : null;
  };
  check('HEADLINE_INFINITIVES existe en generator.js', !!setOf(genSrc));
  check('HEADLINE_INFINITIVES idéntico en server.js (espejo)', setOf(serverSrc) !== null && setOf(serverSrc) === setOf(genSrc));
  check('gatillo 9b en generator.js', genSrc.includes('HEADLINE_INFINITIVES.has(ow[ow.length - 1])'));
  check('gatillo 9b en server.js (espejo)', serverSrc.includes('HEADLINE_INFINITIVES.has(ow[ow.length - 1])'));
  check('prompt QA: ejemplo real 498 que DEBE rechazarse',
    serverSrc.includes('"Te voy a ser honesto: tener" (id real 498) es INCOMPLETO'));
}

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
