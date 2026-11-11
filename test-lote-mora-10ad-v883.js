// test-lote-mora-10ad-v883.js — MORA-10a/d (2026-11-10, lote v883).
// MORA-10a: el titular declarativo cortado que termina en "para que +
// posesivo + sustantivo" sin verbo ("3 consejos para que tu Instagram",
// id real 566) ya no sale disfrazado de frase completa: makeHeadline
// paso 9c lo cierra con "…" (corte visible, nunca cierre falso).
// MORA-10d: el juez (qaImageB64) ya no deja pasar una pregunta cortada:
// "…" NUNCA cierra una "¿" — la 596 ("¿cuántas veces te pasó…") fue un
// falso pase y ahora está en el prompt como ejemplo de lo que NO pasa.
// Banco de casos reales + fronteras de la regla + paridad de espejos
// (server.js ↔ generator.js) + ejemplos reales en el prompt del QA.
// Uso: node test-lote-mora-10ad-v883.js
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

console.log('— MORA-10a: banco real (para que + posesivo + sustantivo)');
{
  const out566 = mh('3 consejos para que tu Instagram crezca sin pagar publicidad');
  check('id 566: "para que tu Instagram" cierra con "…"', out566 === '3 consejos para que tu Instagram…', out566);
  const outPlur = mh('3 consejos para que tus tiendas crezcan este mes sin parar');
  check('posesivo plural ("tus tiendas") cierra con "…"', outPlur === '3 consejos para que tus tiendas…', outPlur);
  const outMi = mh('Tres ideas para que mi salón se llene siempre');
  check('"para que mi salón" cierra con "…"', outMi === 'Tres ideas para que mi salón…', outMi);
  const outSu = mh('Para que tu negocio crezca necesitás constancia diaria');
  check('patrón NO al final ("…crezca necesitás"): completo, sin "…"', outSu === 'Para que tu negocio crezca necesitás', outSu);
}

console.log('— MORA-10a: fronteras (el verbo cierra la cláusula)');
{
  const verbo = mh('3 consejos para que tu vendas todos los días sin parar');
  check('verbo conjugado ("para que tu vendas"): completo, sin "…"', verbo === '3 consejos para que tu vendas', verbo);
  const verbo2 = mh('Consejos para que tu salón brille todo el día sin parar');
  check('verbo presente ("salón brille"): completo, sin "…"', verbo2 === 'Consejos para que tu salón brille', verbo2);
  const entera = mh('3 consejos para que tu Instagram');
  check('oración ENTERA (6 palabras, sin continuación): intacta, sin "…"', entera === '3 consejos para que tu Instagram', entera);
}

console.log('— reglas hermanas intactas (pasos 9, 9b, 5b)');
{
  const out498 = mh('Te voy a ser honesto: tener un termotanque eficiente te ahorra plata');
  check('id 498 (9b): infinitivo colgado cierra con "…"', out498 === 'Te voy a ser honesto: tener…', out498);
  const out482 = mh('Halloween: tu Instagram, el alma de la fiesta');
  check('id 482 (paso 9): complemento con "de" cierra con "…"', out482 === 'Halloween: tu Instagram, el alma…', out482);
  const out473 = mh('Llegó Muebles a medida, ideales para tu comedor');
  check('id 473 (paso 9): adjetivo con "para" cierra con "…"', out473 === 'Llegó Muebles a medida, ideales…', out473);
  const q413 = mh('¿Listo para que tu Instagram sea el alma de la fiesta este Halloween?');
  check('413 (5b): pregunta cortada = "…" y sin "?"', q413.endsWith('…') && !q413.endsWith('?'), q413);
  const qFull = mh('¿Ya probaste nuestro blend?');
  check('pregunta que entra entera: "?" normal, sin "…"', qFull.endsWith('?') && !qFull.includes('…'), qFull);
  const nominal = mh('Ramos frescos, hechos hoy en el local del barrio');
  check('nominal completo (adjunto cortado): sin "…"', nominal === 'Ramos frescos, hechos hoy', nominal);
  const precio = mh('La docena de facturas a $12.500 recién salida del horno', 'gastronomia');
  check('precio entero intacto, sin "…"', precio.includes('$12.500') && !precio.includes('…'), precio);
}

console.log('— paridad de espejos (server.js ↔ generator.js)');
{
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const genSrc = fs.readFileSync(path.join(__dirname, 'generator.js'), 'utf8');
  const norm = (s) => s.replace(/Espejo en (server|generator)\.js/g, 'Espejo en X.js');
  const fnOf = (src) => {
    const m = src.match(/const declarIsCut = \(\) => \{(.*?)\n  \};/s);
    return m ? norm(m[1]) : null;
  };
  const sFn = fnOf(serverSrc), gFn = fnOf(genSrc);
  check('declarIsCut existe en generator.js', !!gFn);
  check('declarIsCut idéntico en server.js (espejo, salvo ref. de espejo)', sFn !== null && sFn === gFn);
  const setOf = (src, name) => {
    const m = src.match(new RegExp(name + ' = new Set\\(\\[([^\\]]*)\\]\\)'));
    return m ? m[1].split(',').map(s => s.trim().replace(/'/g, '')).sort().join(',') : null;
  };
  check('HEADLINE_POSESIVOS_SING existe en generator.js', !!setOf(genSrc, 'HEADLINE_POSESIVOS_SING'));
  check('HEADLINE_POSESIVOS_SING idéntico en server.js (espejo)', setOf(serverSrc, 'HEADLINE_POSESIVOS_SING') !== null && setOf(serverSrc, 'HEADLINE_POSESIVOS_SING') === setOf(genSrc, 'HEADLINE_POSESIVOS_SING'));
  check('HEADLINE_POSESIVOS_PLUR idéntico en server.js (espejo)', setOf(serverSrc, 'HEADLINE_POSESIVOS_PLUR') !== null && setOf(serverSrc, 'HEADLINE_POSESIVOS_PLUR') === setOf(genSrc, 'HEADLINE_POSESIVOS_PLUR'));
  check('gatillo 9c en generator.js', genSrc.includes("r4 === 'para' && q3 === 'que'"));
  check('gatillo 9c en server.js (espejo)', serverSrc.includes("r4 === 'para' && q3 === 'que'"));
}

console.log('— prompt del QA (MORA-10d + ejemplo 566)');
{
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  check('MORA-10d: "…" NO cierra una "¿"',
    serverSrc.includes('"…" NO cierra una "¿"'));
  check('MORA-10d: ejemplo real 596 como falso pase',
    serverSrc.includes('¿cuántas veces te pasó…') && serverSrc.includes('id 596'));
  check('MORA-10a: ejemplo real 566 en el prompt',
    serverSrc.includes('"3 consejos para que tu Instagram" (id 566) es INCOMPLETO'));
  check('MORA-10d: la "…" solo vale para fragmento declarativo',
    serverSrc.includes('solo vale para un fragmento declarativo, nunca para una pregunta'));
}

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
