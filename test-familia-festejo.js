// test-familia-festejo.js — CELEBRACIÓN «LA OFICINA FESTEJA» REAL (2026-10-25).
// La celebración refleja la oficina REAL del cliente: solo los poderes
// CONTRATADOS + Bambooty siempre como cierre. Cliente solo-Posty: ninguna
// fila de poder (ni Venty, ni Gesty, ni Atenty), solo el cierre dorado.
// Sin registro no hay mensaje: ni supuesto, ni fixture, ni nivel.
// Los especialistas jamás entran (lista cerrada, sin pliegue).
'use strict';
const fs = require('fs');
const path = require('path');
const niveles = require('./niveles');

let ok = 0, fail = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}

// ---------- Servidor: poderesContratados (stub de db, sin sqlite) ----------
function stubDb(tableRows, throwOn) {
  return {
    prepare(sql) {
      if (throwOn && sql.includes(throwOn)) throw new Error('boom');
      if (sql.includes('poderes_contratados')) return { all: () => tableRows };
      return { get: () => ({ plan_status: 'trial' }) };
    },
  };
}
t(JSON.stringify(niveles.poderesContratados(stubDb([]))) === '["posty"]', 'solo-Posty: sin filas => solo posty');
t(JSON.stringify(niveles.poderesContratados(stubDb([{ poder: 'venty' }]))) === '["posty","venty"]', 'Posty+Venty: venty se suma');
t(JSON.stringify(niveles.poderesContratados(stubDb([{ poder: 'venty' }, { poder: 'gesty' }, { poder: 'atenty' }]))) === '["posty","venty","atenty","gesty"]', 'los 4 poderes en orden canónico');
t(JSON.stringify(niveles.poderesContratados(stubDb([{ poder: 'desy' }, { poder: 'talenty' }, { poder: 'growty' }, { poder: 'bossty' }]))) === '["posty"]', 'especialistas ignorados (talenty NO es gesty: sin pliegue)');
t(JSON.stringify(niveles.poderesContratados(stubDb([{ poder: 'fulano' }, { poder: 'VENTY' }, { poder: 'venty' }]))) === '["posty","venty"]', 'desconocido ignorado, mayúscula normalizada, sin duplicados');
t(JSON.stringify(niveles.poderesContratados(stubDb([], 'poderes_contratados'))) === '["posty"]', 'tabla ausente => falla cerrada a solo Posty');

// ---------- Cliente: pzNivelFamiliaHTML ejecutada de verdad ----------
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const famSrc = app.slice(app.indexOf('function pzNivelFamiliaHTML'), app.indexOf('function pzNivelBroteVisto'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pzNivelFamiliaHTML = new Function('esc', famSrc + '\nreturn pzNivelFamiliaHTML;')(esc);
const rows = (h) => (h.match(/pz-fam-row/g) || []).length;

let h = pzNivelFamiliaHTML({ poderes: ['posty'] }, false);
t(rows(h) === 0 && h.includes('LA OFICINA FESTEJA') && h.includes('Toda tu oficina festeja con vos') && !/Venty|Gesty|Atenty/.test(h), 'solo-Posty ES: 0 filas, título + cierre dorado, ningún poder inventado');
h = pzNivelFamiliaHTML({ poderes: ['posty', 'venty'] }, false);
t(rows(h) === 1 && h.includes('Venty') && !/Gesty|Atenty/.test(h), 'Posty+Venty ES: solo la fila Venty');
h = pzNivelFamiliaHTML({ poderes: ['posty', 'venty', 'gesty', 'atenty'] }, false);
t(rows(h) === 3 && h.includes('Venty') && h.includes('Gesty') && h.includes('Atenty'), 'los 4 ES: las 3 filas');
h = pzNivelFamiliaHTML({}, false);
t(rows(h) === 0 && h.includes('Toda tu oficina festeja con vos'), 'sin nv.poderes: falla cerrada a solo Posty (cierre intacto)');
h = pzNivelFamiliaHTML({ poderes: [] }, false);
t(rows(h) === 0, 'poderes vacío: ninguna fila');
h = pzNivelFamiliaHTML({ poderes: ['posty', 'desy', 'talenty'] }, false);
t(rows(h) === 0 && !/Desy|Talenty/.test(h), 'especialistas en poderes: filtrados, jamás renderizan');
h = pzNivelFamiliaHTML({ poderes: ['posty'] }, true);
t(h.includes('THE OFFICE CELEBRATES') && h.includes('Your whole office celebrates with you') && rows(h) === 0, 'solo-Posty EN: título + cierre en inglés, 0 filas');
h = pzNivelFamiliaHTML({ poderes: ['posty', 'atenty'] }, true);
t(rows(h) === 1 && h.includes('Atenty') && h.includes('Customer care'), 'Posty+Atenty EN: solo Atenty, copy en inglés');

// ---------- Cableado ----------
t(app.includes('pzNivelFamiliaHTML(nv, en)'), 'la celebración pasa nv (con poderes) a la familia');
t(!/pzNivelFamiliaHTML\(en\)/.test(app), 'ningún llamador viejo con solo (en)');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
t(srv.includes('poderes: oficina.niveles.poderesContratados(db, uid)'), 'GET /api/oficina/nivel sirve poderes');
t(srv.includes('CREATE TABLE IF NOT EXISTS poderes_contratados'), 'DDL poderes_contratados presente');

console.log(`\ntest-familia-festejo: ${ok} ok / ${fail} fallas`);
process.exit(fail ? 1 : 0);
