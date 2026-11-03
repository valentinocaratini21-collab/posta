// LOTE AJUSTES-SIMPLE-2 — suite nueva (node, sin dependencias).
// Uso: node test-loteajustessimple2.js [dir-base]  (default: el work del lote)
// Cubre: orden visible, contenido de Más, tarjeta Posty última, ES/EN,
// upsell eliminado, Gesty contratado/trial conservados, toggle real, M78.
const fs = require('fs');
const path = require('path');
const base = process.argv[2] || __dirname;
let ok = 0, bad = 0;
function t(name, cond) {
  if (cond) { ok++; }
  else { bad++; console.log('FAIL: ' + name); }
}
const aj = fs.readFileSync(path.join(base, 'public/chunk-ajustes.js'), 'utf8');
const app = fs.readFileSync(path.join(base, 'public/app.js'), 'utf8');

// 1) Orden final del template: notif, negocio, plan, mas2, wrap, salir, gz, posty.
const order = ['ajsec-notif', 'ajsec-negocio', 'ajsec-plan', 'ajsec-mas2',
  'ajsec-mas2-wrap', 'ajsec-auto', 'ajsec-conex', 'ajsec-marca',
  'ajsec-pagina', 'ajsec-semana', 'int-advanced', 'btnLogoutAj',
  'gzAjustesBox', 'ajsec-posty'];
const pos = order.map((id) => aj.indexOf(id));
t('todas las marcas presentes', pos.every((p) => p >= 0));
t('orden final correcto', pos.every((p, k) => k === 0 || p > pos[k - 1]));

// 2) El wrap contiene el resto y NADA de lo visible ni de Salir/Posty.
const wrap = aj.slice(aj.indexOf('id="ajsec-mas2-wrap"'), aj.indexOf('btnLogoutAj'));
for (const id of ['ajsec-auto', 'ajsec-conex', 'ajsec-marca', 'ajsec-pagina',
  'ajsec-semana', 'ajsec-referidos', 'int-advanced', 'data-ajmas="preview"'])
  t('wrap contiene ' + id, wrap.includes(id));
for (const id of ['ajsec-notif', 'ajsec-negocio', 'ajsec-plan', 'btnLogoutAj',
  'gzAjustesBox', 'ajsec-posty'])
  t('wrap NO contiene ' + id, !wrap.includes(id));
t('wrap nace oculto', aj.includes('id="ajsec-mas2-wrap" hidden'));
t('menú Más viejo eliminado', !aj.includes('id="ajsec-mas"'));

// 3) ES/EN espejo.
for (const s of ['Más ajustes', 'Menos ajustes', 'More settings',
  'Fewer settings', 'Tu agente', 'Your agent',
  'Posty · Community Manager']) t('texto presente: ' + s, aj.includes(s));

// 4) Upsell eliminado de app.js.
for (const s of ['Sumar un agente', 'Probar Gesty gratis', 'Gesty · Recepción',
  'Gesty · Reception', 'Add an agent', 'Try Gesty free'])
  t('sin upsell: ' + s, !app.includes(s));
t('rama solo-Posty deja la caja vacía',
  app.includes("if (!contratado && !pruebaActiva) { box.innerHTML = ''; return; }"));

// 5) gzAjustesFill real, con stubs (3 casos).
const gzStart = app.indexOf('async function gzAjustesFill() {');
const gzEnd = app.indexOf('async function gzTipoGuardar');
t('gzAjustesFill extraíble', gzStart >= 0 && gzEnd > gzStart);
async function runGz(con, blo, hoy, tipo, pr) {
  const box = { innerHTML: 'X' };
  const vals = [con, blo, hoy, tipo, pr];
  const sandbox = {
    document: { getElementById: () => box },
    api: { get: (u) => {
      const i = ['conexiones', 'bloqueos', 'hoy', 'negocio-tipo', 'prueba/estado']
        .findIndex((k) => u.includes(k));
      return Promise.resolve(vals[i] ?? null);
    } },
    gzT: (es) => es, esc: (s) => s, gzProbarBtn: () => '',
  };
  const src = app.slice(gzStart, gzEnd);
  const fn = new Function('document', 'api', 'gzT', 'esc', 'gzProbarBtn',
    src + '; return gzAjustesFill();');
  await fn(sandbox.document, sandbox.api, sandbox.gzT, sandbox.esc, sandbox.gzProbarBtn);
  return box.innerHTML;
}
(async () => {
  const solo = await runGz(null, null, { gesty_contratado: false }, null, { ok: false });
  t('solo-Posty: caja vacía', solo === '');
  const con = await runGz(
    { ok: true, conexiones: [], propuestas_pendientes: [] },
    { ok: true, activos: [] },
    { gesty_contratado: true },
    { ok: true, variantes: [{ id: 'x', nombre: 'X' }], rubro: 'x', llamar: 'Ya' },
    { ok: false });
  t('contratado: conserva Conexiones de Gesty', con.includes('Conexiones de Gesty'));
  t('contratado: conserva Agenda de Gesty', con.includes('Agenda de Gesty'));
  const trial = await runGz(null, null, { gesty_contratado: false },
    { ok: true, variantes: [{ id: 'x', nombre: 'X' }], rubro: 'x', llamar: 'Ya' },
    { ok: true, prueba: { estado: 'espejo' } });
  t('trial: conserva Tipo de negocio', trial.includes('Tipo de negocio'));
  t('trial: sin upsell ni conexiones', !trial.includes('Sumar un agente')
    && !trial.includes('Conexiones de Gesty'));

  // 6) Helpers del toggle, reales, con DOM falso.
  const hStart = aj.indexOf('function pzAjMas2Mostrar()');
  const hEnd = aj.indexOf('function bindSettings()');
  t('helpers extraíbles', hStart >= 0 && hEnd > hStart);
  if (hStart < 0 || hEnd <= hStart) {
    t('helpers ausentes en prístino (control negativo)', false);
    console.log(`AJUSTES-SIMPLE-2: ${ok} ok, ${bad} mal`);
    process.exit(1);
  }
  const hSrc = aj.slice(hStart, hEnd);
  for (const lang of ['es', 'en']) {
    const wrapEl = { hidden: true };
    const btn = { innerHTML: '' };
    const sandbox = {
      document: { getElementById: (id) =>
        (id === 'ajsec-mas2-wrap' ? wrapEl : id === 'btnAjMas2' ? btn : null) },
      ME: { lang },
    };
    const mk = new Function('document', 'ME', hSrc + '; return { pzAjMas2Mostrar, pzAjMas2Toggle };');
    const f = mk(sandbox.document, sandbox.ME);
    f.pzAjMas2Toggle();
    t(`toggle ${lang}: abre`, wrapEl.hidden === false);
    t(`toggle ${lang}: etiqueta menos`, btn.innerHTML.includes(lang === 'en' ? 'Fewer settings' : 'Menos ajustes'));
    f.pzAjMas2Toggle();
    t(`toggle ${lang}: cierra`, wrapEl.hidden === true);
    t(`toggle ${lang}: etiqueta más`, btn.innerHTML.includes(lang === 'en' ? 'More settings' : 'Más ajustes'));
  }

  // 7) M78: cada helper definido 1 vez, con llamador real.
  t('pzAjMas2Mostrar definida 1 vez', (aj.match(/function pzAjMas2Mostrar\(\)/g) || []).length === 1);
  t('pzAjMas2Toggle definida 1 vez', (aj.match(/function pzAjMas2Toggle\(\)/g) || []).length === 1);
  t('toggle con binding real', (aj.match(/pzAjMas2Toggle\(\);/g) || []).length === 1);
  t('mostrar con llamadores reales', (aj.match(/pzAjMas2Mostrar\(\);/g) || []).length >= 2);

  console.log(`AJUSTES-SIMPLE-2: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERROR', e); process.exit(1); });
