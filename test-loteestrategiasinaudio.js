'use strict';
/* LOTE ESTRATEGIA-SIN-AUDIO (pedido Valentino 2/11 ~12:40): de la carta de
   Estrategia (#/app/analisis, chunk-analisis.js) desaparece el botón
   «Escuchá tu carta» / «Listen to your letter». Solo el botón: carta_url,
   la página firmada /carta/:token, el botón del email y todos los demás
   audios quedan intactos. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let okN = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { okN++; } else { failN++; console.log('  ✗', msg); } };

const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

/* 1. El botón ya no está en la carta de Estrategia (ES ni EN). */
ok(!chunk.includes('Escuchá tu carta'), 'chunk sin «Escuchá tu carta»');
ok(!chunk.includes('Listen to your letter'), 'chunk sin «Listen to your letter»');
ok(!chunk.includes('headphones'), 'chunk sin icono headphones de la carta');
ok(!chunk.includes('a.carta_url'), 'chunk sin referencia de código a a.carta_url (el botón era su único uso; solo queda la palabra en el comentario explicativo)');

/* 2. Todo lo demás de la carta sigue intacto. */
ok(chunk.includes('function anaLetterMinimalHTML'), 'anaLetterMinimalHTML sigue definida');
ok(chunk.includes('function anaLetterBodyHTML'), 'anaLetterBodyHTML sigue definida');
ok(chunk.includes('Ver mi estrategia completa'), '«Ver mi estrategia completa» intacto');
ok(chunk.includes('Compartir mi semana'), '«Compartir mi semana» intacto');
ok(chunk.includes('Verla en tu agenda'), '«Verla en tu agenda» intacto');
ok(chunk.includes('Cartas anteriores') || chunk.includes('anaHistoryHTML'), 'cartas anteriores intactas');

/* 3. Lo que NO se tocó: payload, página firmada, email. */
ok(serverJs.includes('carta_url'), 'server sigue sirviendo carta_url');
ok(serverJs.includes("app.get('/carta/:token'"), 'ruta de la página firmada intacta');
ok(serverJs.includes('Escuchá tu carta'), 'botón del email intacto en server.js');

/* 4. Render real de la carta mínima, ES y EN, con carta_url presente:
   saludo + cuerpo salen, ningún botón ni link de audio sale. */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ctx = vm.createContext({ esc, pzIc: () => '', console });
vm.runInContext(chunk, ctx);
const render = ctx.anaLetterMinimalHTML;
ok(typeof render === 'function', 'anaLetterMinimalHTML renderizable en VM');
if (typeof render === 'function') {
  const es = render({ letter: { v: 2, greeting: 'Hola, negocio.', body: [{ t: 'p', text: 'Tu semana rindió.' }] }, carta_url: '/carta/firmado', lang: 'es' });
  ok(es.includes('Hola, negocio.') && es.includes('Tu semana rindió.'), 'ES: saludo + cuerpo salen');
  ok(!es.includes('Escuchá') && !es.includes('/carta/') && !es.includes('<a '), 'ES: sin botón ni link de audio aunque venga carta_url');
  const en = render({ letter: { v: 2, greeting: 'Hi, shop.', body: [{ t: 'p', text: 'Your week worked.' }] }, carta_url: '/carta/firmado', lang: 'en' });
  ok(en.includes('Hi, shop.') && en.includes('Your week worked.'), 'EN: saludo + cuerpo salen');
  ok(!en.includes('Listen') && !en.includes('/carta/') && !en.includes('<a '), 'EN: sin botón ni link de audio aunque venga carta_url');
  const sinCarta = render({ letter: { v: 2, greeting: 'Hola.', body: [{ t: 'p', text: 'Texto.' }] }, lang: 'es' });
  ok(sinCarta.includes('Texto.'), 'sin carta_url la carta sale igual');
}

console.log(`test-loteestrategiasinaudio: ${okN} ok / ${failN} fallas`);
process.exit(failN ? 1 : 0);
