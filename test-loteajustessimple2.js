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

// 1) Orden final del template: filas del menú (data-ajnav) en orden, Salir
// como fila del menú, detalle (#ajDetail) con las 9 secciones en orden, gz.
// (ACTUALIZADO lote ajustes-carpetas 7/11: el botón «Más ajustes» y su
// desplegable salen; cada sección abre su propia pantalla de detalle.)
const order = ['data-ajnav="referidos"', 'data-ajnav="notif"', 'data-ajnav="negocio"',
  'data-ajnav="plan"', 'data-ajnav="auto"', 'data-ajnav="conex"', 'data-ajnav="marca"',
  'data-ajnav="pagina"', 'data-ajnav="avanzado"', 'btnLogoutAj', 'id="ajDetail"',
  'ajsec-referidos', 'ajsec-notif', 'ajsec-negocio', 'ajsec-plan', 'ajsec-auto',
  'ajsec-conex', 'ajsec-marca', 'ajsec-pagina', 'ajsec-avanzado',
  'gzAjustesBox'];
const pos = order.map((id) => aj.indexOf(id));
t('todas las marcas presentes', pos.every((p) => p >= 0));
t('orden final correcto', pos.every((p, k) => k === 0 || p > pos[k - 1]));

// 2) El detalle contiene las 9 secciones y el botón ‹; el menú, las 9 filas
// y Salir. (ACTUALIZADO lote ajustes-carpetas 7/11: el wrap sale; el detalle
// es #ajDetail y el menú es #ajMenu.)
const det = aj.slice(aj.indexOf('id="ajDetail"'), aj.indexOf('id="gzAjustesBox"'));
for (const id of ['ajsec-referidos', 'ajsec-notif', 'ajsec-negocio', 'ajsec-plan',
  'ajsec-auto', 'ajsec-conex', 'ajsec-marca', 'ajsec-pagina', 'ajsec-avanzado'])
  t('detalle contiene ' + id, det.includes('id="' + id + '"'));
t('detalle contiene el botón ‹', det.includes('id="ajBackBtn"'));
const menu = aj.slice(aj.indexOf('id="ajMenu"'), aj.indexOf('id="ajDetail"'));
for (const id of ['referidos', 'notif', 'negocio', 'plan', 'auto', 'conex', 'marca',
  'pagina', 'avanzado'])
  t('menú contiene fila ' + id, menu.includes('data-ajnav="' + id + '"'));
t('menú contiene Salir', menu.includes('id="btnLogoutAj"'));
t('detalle nace oculto salvo deep-link', aj.includes("id=\"ajDetail\"${ajInitSec ? '' : ' hidden'}"));
t('menú Más viejo eliminado', !aj.includes('id="ajsec-mas"'));
t('avanzado conserva su clase', aj.includes('class="card int-advanced"'));

// 3) ES/EN espejo. (ACTUALIZADO lote ajustes-carpetas 7/11: «Más ajustes»
// sale con el botón; el espejo vive ahora en las filas del menú.)
for (const s of ['Referidos · 50% off', 'Notifications', 'My plan',
  'Posty on autopilot', 'Advanced settings', 'Log out']) t('texto presente: ' + s, aj.includes(s));

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

  // 6) Navegación ajNav, real, con DOM falso.
  // (ACTUALIZADO lote ajustes-carpetas 7/11: el toggle de «Más ajustes» sale
  // con el desplegable; la navegación es ajNav sobre #ajMenu/#ajDetail.)
  const hStart = aj.indexOf('const AJ_SECCIONES');
  const hEnd = aj.indexOf('function bindSettings()');
  t('helpers extraíbles', hStart >= 0 && hEnd > hStart);
  if (hStart < 0 || hEnd <= hStart) {
    t('helpers ausentes en prístino (control negativo)', false);
    console.log(`AJUSTES-SIMPLE-2: ${ok} ok, ${bad} mal`);
    process.exit(1);
  }
  const hSrc = aj.slice(hStart, hEnd);
  const mkNav = () => {
    const els = {};
    const mkEl = (id) => (els[id] = { hidden: false, open: false });
    const menuEl = mkEl('ajMenu'); const detEl = mkEl('ajDetail');
    const cards = {};
    for (const s of ['referidos', 'notif', 'negocio', 'plan', 'auto', 'conex', 'marca', 'pagina', 'avanzado']) cards[s] = mkEl('ajsec-' + s);
    const sandbox = {
      document: { getElementById: (id) => els[id] || null },
      window: { scrollTo: () => {} },
    };
    const mk = new Function('document', 'window', hSrc + '; return { ajNav, ajFoldAbrir };');
    return { f: mk(sandbox.document, sandbox.window), menuEl, detEl, cards };
  };
  const n1 = mkNav();
  n1.f.ajNav('plan');
  t('ajNav plan: menú oculto', n1.menuEl.hidden === true);
  t('ajNav plan: detalle visible', n1.detEl.hidden === false);
  t('ajNav plan: solo plan visible', n1.cards.plan.hidden === false
    && ['referidos', 'notif', 'negocio', 'auto', 'conex', 'marca', 'pagina', 'avanzado'].every((s) => n1.cards[s].hidden === true));
  const n2 = mkNav();
  n2.f.ajNav('avanzado');
  t('ajNav avanzado: abre el details', n2.cards.avanzado.open === true);
  const n3 = mkNav();
  n3.f.ajNav('noexiste');
  t('ajNav desconocido: no toca nada', n3.menuEl.hidden === false && n3.detEl.hidden === false);
  const n4 = mkNav();
  n4.f.ajFoldAbrir('plan');
  t('ajFoldAbrir plan: abre como ajNav', n4.menuEl.hidden === true && n4.cards.plan.hidden === false);

  // 7) M78: cada helper definido 1 vez, con llamador real.
  t('ajNav definida 1 vez', (aj.match(/function ajNav\(/g) || []).length === 1);
  t('ajFoldAbrir definida 1 vez', (aj.match(/function ajFoldAbrir\(/g) || []).length === 1);
  t('ajNav con llamador real (ajFoldAbrir)', (aj.match(/ajNav\(id\);/g) || []).length === 1);
  t('pzAjMas2Mostrar eliminada', (aj.match(/pzAjMas2Mostrar/g) || []).length === 0);
  t('pzAjMas2Toggle eliminada', (aj.match(/pzAjMas2Toggle/g) || []).length === 0);
  t('ajsec-mas2-wrap eliminado', (aj.match(/ajsec-mas2-wrap/g) || []).length === 0);

  console.log(`AJUSTES-SIMPLE-2: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('ERROR', e); process.exit(1); });
