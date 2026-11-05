/* chunk-venty.js — Lazy chunk de Venty: ventas y crecimiento (slice 1, Modo Prueba).
 * Se carga bajo demanda vía loadChunk('venty') desde app.js (router: tab 'venty').
 * Es un <script> clásico: comparte el scope global con app.js; las funciones
 * declaradas acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA (la de todos los chunks): no agregar top-level let/const/var con nombres
 * que ya existan en app.js u otro chunk — por eso TODO acá lleva prefijo vt,
 * y el estado vive en window.VT (creado acá abajo con guarda).
 *
 * ventyView() devuelve la cáscara con un loading amable; bindVenty() pide
 * /api/venty/* y pinta la pantalla. Sub-rutas por hash: #/app/venty (Ventas),
 * #/app/venty/chat/:id (venta individual), #/app/venty/buscar,
 * #/app/venty/resumen, #/app/venty/negocio. Las 3 pestañas del mock
 * (Ventas · Buscar clientes · Resumen) son tabs internas de esta vista.
 *
 * Valores vivos (mandan sobre cualquier doc viejo): USD 300 plan único,
 * estreno 2/11/2027, Clásico #4CAF50, profunda #2E7D32, navy #0A1E33.
 * La caza es EJEMPLO ROTULADO hasta el slice 4; todo número sale de
 * /api/venty/* o va rotulado «ejemplo». La voz de Venty: minúsculas, sin ¿/¡.
 */
window.VT = window.VT || { tab: 'ventas', chatId: null, filtro: 'todas', q: '', datos: null };

function vtEsc(s) {
  if (typeof esc === 'function') return esc(s);
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function vtT(es, en) { return (typeof gzT === 'function') ? gzT(es, en) : es; }
function vtPesos(n) {
  const s = String(Math.round(Number(n) || 0));
  return '$' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function vtRuta() {
  const h = String(location.hash || '');
  const p = h.split('?')[0].split('/');
  // ['#','app','venty', sub, id]
  return { sub: p[3] || '', id: p[4] || '' };
}
function ventyView() {
  return '<div class="vt-wrap" id="vtRoot">'
    + '<div class="card" style="text-align:center;padding:28px 12px"><p class="hint">Abriendo Venty…</p></div>'
    + '</div>';
}

async function vtGet(p) { return api.get(p); }
async function vtPost(p, b) { return api.post(p, b || {}); }

function vtTabsHTML(tab) {
  const t = (id, label) => '<button class="vt-tab' + (tab === id ? ' on' : '') + '" data-vt-tab="' + id + '">' + label + '</button>';
  return '<div class="vt-tabs" role="tablist">'
    + t('ventas', vtT('Ventas', 'Sales'))
    + t('buscar', vtT('Buscar clientes', 'Find customers'))
    + t('resumen', vtT('Resumen', 'Summary'))
    + '</div>';
}

function vtBandejaCardHTML(j) {
  const pr = j.propuesta || {};
  const que = vtEsc(j.propuesta && j.propuesta.que ? j.propuesta.que : (j.tipo || ''));
  const monto = pr.monto_con_descuento ? ' · ' + vtPesos(pr.monto_con_descuento) : '';
  return '<div class="vt-bcard" data-vt-jugada="' + j.id + '">'
    + '<div class="vt-bcard-que">' + que + monto + '</div>'
    + '<div class="vt-bcard-porque">' + vtEsc(j.porque || '') + '</div>'
    + '<div class="vt-bcard-acciones">'
    + '<button class="vt-btn vt-btn-ok" data-vt-accion="aceptar" data-vt-id="' + j.id + '">Aceptar</button>'
    + '<button class="vt-btn vt-btn-no" data-vt-accion="rechazar" data-vt-id="' + j.id + '">No</button>'
    + '<button class="vt-btn vt-btn-ghost" data-vt-accion="cambio" data-vt-id="' + j.id + '">Pedir un cambio</button>'
    + '</div>'
    + '<div class="vt-cambio" hidden><textarea rows="2" placeholder="qué cambiarías" data-vt-nota="' + j.id + '"></textarea>'
    + '<button class="vt-btn vt-btn-ok" data-vt-accion="cambio-enviar" data-vt-id="' + j.id + '">Enviar cambio</button></div>'
    + '</div>';
}

function vtPartidaRowHTML(p, needsYou) {
  const ultimo = (p.mensajes && p.mensajes.length) ? p.mensajes[p.mensajes.length - 1].texto : '';
  const estadoTxt = { viva: 'viva', cerrada_ganada: 'cerrada · ganada', cerrada_perdida: 'cerrada · perdida', tomada: 'la tenés vos', escalada: 'escalada' }[p.estado] || p.estado;
  const seg = p.seguimiento_toque ? ' · toque ' + p.seguimiento_toque + ' de 3' : '';
  const monto = (p.estado === 'cerrada_ganada' && p.monto) ? ' · ' + vtPesos(p.monto) + ' cobrados' : '';
  return '<div class="vt-row' + (needsYou ? ' vt-row-need' : '') + '" data-vt-partida="' + p.id + '" role="button" tabindex="0">'
    + '<div class="vt-row-top"><b>' + vtEsc(p.cliente_nombre) + '</b><span class="vt-row-estado">' + vtEsc(estadoTxt) + '</span></div>'
    + '<div class="vt-row-ultima">' + vtEsc(ultimo) + '</div>'
    + '<div class="vt-row-meta">' + vtEsc(p.origen || p.canal || '') + seg + monto + '</div>'
    + '</div>';
}

function vtVentasHTML(d) {
  const est = d.estado || {};
  const frase = d.frase || {};
  const band = d.bandeja || [];
  const parts = d.partidas || [];
  const mens = d.mensajesHoy || [];
  const tasa = frase.tasa_cierre_pct === null || frase.tasa_cierre_pct === undefined ? '—' : frase.tasa_cierre_pct + '%';
  const pr = frase.primera_respuesta_seg === null || frase.primera_respuesta_seg === undefined ? '—' : frase.primera_respuesta_seg + ' s';
  const frenoBtn = est.freno && est.freno.pausado ? 'Reanudar' : 'Pausar';
  let h = '<div class="vt-head"><h1 class="vt-titulo">Ventas</h1>'
    + '<div class="vt-head-btns">'
    + '<button class="vt-btn vt-btn-ghost" data-vt-posty>Ver Posty</button>'
    + '<button class="vt-btn vt-btn-ghost" data-vt-freno>' + frenoBtn + '</button>'
    + '</div></div>';
  if (est.freno && est.freno.pausado) h += '<div class="vt-pausa">Venty en pausa · no sale ningún mensaje ni contacto nuevo, los turnos agendados siguen.</div>';
  h += '<div class="vt-frase"><div class="vt-frase-txt">' + vtEsc(frase.frase || '') + '</div>'
    + '<div class="vt-norte"><div class="vt-norte-num"><b>' + tasa + '</b><span>tasa de cierre</span></div>'
    + '<div class="vt-norte-num"><b>' + pr + '</b><span>primera respuesta</span></div></div></div>';
  h += '<section class="vt-bloque"><h2>Necesita tu ojo</h2>';
  if (!band.length) h += '<p class="vt-vacio">Nada necesita tu ojo hoy.</p>';
  else h += band.map(vtBandejaCardHTML).join('');
  h += '</section>';
  h += '<div class="vt-filtros">'
    + '<button class="vt-chip' + (window.VT.filtro === 'todas' ? ' on' : '') + '" data-vt-filtro="todas">Todas</button>'
    + '<button class="vt-chip' + (window.VT.filtro === 'need' ? ' on' : '') + '" data-vt-filtro="need">Te necesitan</button>'
    + '<input class="vt-buscador" type="search" placeholder="Buscar por nombre" value="' + vtEsc(window.VT.q || '') + '" data-vt-buscador>'
    + '</div>';
  h += '<div class="vt-lista">';
  if (!parts.length) h += '<p class="vt-vacio">Todavía no hay ventas acá.</p>';
  else h += parts.map((p) => vtPartidaRowHTML(p, window.VT.filtro === 'need')).join('');
  h += '</div>';
  h += '<section class="vt-bloque"><h2>Mensajes de hoy · lo que mandó Venty</h2>';
  if (!mens.length) h += '<p class="vt-vacio">Venty todavía no mandó mensajes hoy.</p>';
  else h += '<div class="vt-msglog">' + mens.map((m) => '<div class="vt-msg"><div class="vt-msg-top"><b>' + vtEsc(m.cliente) + '</b><span>' + vtEsc(m.canal) + ' · ' + vtEsc(m.hora) + '</span><span class="vt-sololectura">Solo lectura</span></div><div class="vt-msg-txt">' + vtEsc(m.texto) + '</div><button class="vt-link" data-vt-ver="' + m.partida_id + '">Ver venta →</button></div>').join('') + '</div>';
  h += '<p class="vt-nota">Para corregir algo, entrá a la venta o decíselo a Venty en el chat.</p></section>';
  h += '<div class="vt-estado">Modo Prueba · Simulación · última lectura de fuentes: lista cargada' + (est.ultima_lectura && est.ultima_lectura.ts ? ' (' + vtEsc(est.ultima_lectura.ts) + ')' : '') + '</div>';
  return h;
}

function vtChatHTML(d) {
  const p = d.partida;
  if (!p) return '<div class="card"><p>No pude abrir esta venta.</p><button class="vt-btn" onclick="render()">Reintentar</button></div>';
  const estadoTxt = { viva: 'viva', cerrada_ganada: 'cerrada · ganada', cerrada_perdida: 'cerrada · perdida', tomada: 'la tenés vos', escalada: 'escalada' }[p.estado] || p.estado;
  let h = '<button class="vt-link" data-vt-volver>← Ventas</button>'
    + '<div class="vt-head"><h1 class="vt-titulo">' + vtEsc(p.cliente_nombre) + '</h1><span class="vt-row-estado">' + vtEsc(estadoTxt) + '</span></div>'
    + '<div class="vt-meta">' + vtEsc(p.canal || '') + ' · ' + vtEsc(p.origen || '') + (p.monto ? ' · ' + vtPesos(p.monto) : '') + (p.forma_cierre ? ' · ' + vtEsc(p.forma_cierre) : '') + '</div>';
  if (p.origen === 'caza') h += '<div class="vt-nota">Origen: caza · Tier A (ejemplo en modo prueba).</div>';
  h += '<div class="vt-hilo">';
  (p.mensajes || []).forEach((m) => {
    h += '<div class="vt-burbuja ' + (m.autor === 'venty' ? 'vt-bub-venty' : 'vt-bub-cliente') + '"><div class="vt-bub-txt">' + vtEsc(m.texto) + '</div>' + (m.fuente_precio ? '<div class="vt-bub-fuente">' + vtEsc(m.fuente_precio) + '</div>' : '') + '</div>';
  });
  h += '</div>';
  if (p.estado === 'viva') h += '<div class="vt-verbos"><button class="vt-btn vt-btn-ok" data-vt-tomar="' + p.id + '">Tomar</button><span class="vt-nota">Venty sigue escribiendo. Tomar es escribir vos.</span></div>';
  if (p.estado === 'tomada') h += '<div class="vt-verbos"><button class="vt-btn vt-btn-ok" data-vt-seguir="' + p.id + '">Que siga Venty</button><span class="vt-nota">La tenés vos. Venty no escribe hasta que se la devuelvas.</span></div>';
  h += '<section class="vt-bloque"><h2>Hablarle a Venty</h2>'
    + '<div class="vt-chatbox"><input class="vt-input" type="text" placeholder="Decile algo a Venty…" data-vt-chat-input>'
    + '<button class="vt-btn vt-btn-ok" data-vt-chat-enviar>Enviar</button>'
    + '<button class="vt-btn vt-btn-ghost" data-vt-mic title="Hablar">🎙️</button></div>'
    + '<div class="vt-chips" data-vt-chips></div>'
    + '<div class="vt-chat-resp" data-vt-chat-resp></div></section>';
  h += '<section class="vt-bloque"><h2>Panel de prueba · simulación</h2>'
    + '<p class="vt-nota">Acá jugás como el cliente. Nada de esto sale a un cliente real.</p>'
    + '<div class="vt-chatbox"><input class="vt-input" type="text" placeholder="Escribí como el cliente…" data-vt-sim-input>'
    + '<button class="vt-btn vt-btn-ok" data-vt-sim-enviar>Enviar como cliente</button></div>'
    + '<button class="vt-btn vt-btn-ghost" data-vt-sim-nueva>Nueva consulta simulada</button>'
    + '<div class="vt-sim-resp" data-vt-sim-resp></div></section>';
  return h;
}

function vtBuscarHTML(d) {
  const c = d.caza || {};
  const cupo = c.cupo_semanal || {};
  const pct = cupo.tope ? Math.round((cupo.usados / cupo.tope) * 100) : 0;
  let h = '<div class="vt-head"><h1 class="vt-titulo">Buscar clientes</h1></div>'
    + '<p class="vt-nota">En modo prueba, la caza es de ejemplo; la caza real llega con el slice 4.</p>';
  h += '<div class="vt-cupo"><div class="vt-cupo-txt">Cupo semanal: ' + (cupo.usados || 0) + ' de ' + (cupo.tope || 0) + ' contactos</div>'
    + '<div class="vt-cupo-bar"><div class="vt-cupo-fill" style="width:' + pct + '%"></div></div>'
    + '<p class="vt-nota">El freno es duro: al llegar al tope, Venty no contacta a nadie más esta semana.</p></div>';
  (c.zonas || []).forEach((z) => {
    h += '<div class="vt-zona"><b>' + vtEsc(z.nombre) + '</b> · ' + vtEsc(z.estado === 'en_curso' ? 'en curso' : 'siguiente')
      + '<div class="vt-zona-nums">' + (z.estudiados ? z.estudiados + ' estudiados · ' + z.tier_a + ' Tier A · ' + z.contactados + ' contactados' : (z.relevados || 0) + ' relevados · ' + (z.pre_puntuados || 0) + ' pre-puntuados') + '</div></div>';
  });
  h += '<section class="vt-bloque"><h2>Prospectos Tier A</h2>';
  (c.prospectos || []).forEach((pr) => {
    h += '<div class="vt-prosp"><div class="vt-prosp-top"><b>' + vtEsc(pr.nombre) + '</b><span class="vt-tier">Tier ' + vtEsc(pr.tier) + ' · ' + (pr.puntaje || '') + '</span></div>'
      + '<div class="vt-prosp-porque">' + vtEsc(pr.porque || '') + '</div>'
      + '<div class="vt-prosp-estado">' + vtEsc(pr.estado || '') + '</div></div>';
  });
  h += '</section>';
  return h;
}

function vtResumenHTML(d) {
  const p = d.parte || {};
  let h = '<div class="vt-head"><h1 class="vt-titulo">Resumen del viernes</h1></div>';
  if (!p.emitido) {
    h += '<div class="card"><p>Todavía no hay datos para el parte de esta semana.</p><p class="vt-nota">Sin datos, el parte no se emite.</p></div>';
    return h;
  }
  const linea = (k, v) => '<div class="vt-kv"><span>' + k + '</span><b>' + v + '</b></div>';
  h += '<div class="vt-parte">'
    + linea('Consultas', p.consultas) + linea('Calificadas', p.calificadas) + linea('Cotizadas', p.cotizadas)
    + linea('Ventas', p.ventas) + linea('Monto', vtPesos(p.monto)) + linea('Turnos', p.turnos) + linea('No-shows', p.no_shows)
    + linea('Primera respuesta', (p.primera_respuesta_seg === null || p.primera_respuesta_seg === undefined) ? '—' : p.primera_respuesta_seg + ' s')
    + linea('Tasa de cierre', (p.tasa_cierre_pct === null || p.tasa_cierre_pct === undefined) ? '—' : p.tasa_cierre_pct + '%')
    + '</div>';
  if (p.objecion_mas_frecuente) h += '<section class="vt-bloque"><h2>La objeción que más frenó</h2><p>«' + vtEsc(p.objecion_mas_frecuente) + '»</p></section>';
  if (p.ajuste) h += '<section class="vt-bloque"><h2>Qué ajustó Venty</h2><p>' + vtEsc(p.ajuste) + '</p></section>';
  h += '<p class="vt-nota">Semana del ' + vtEsc(p.semana || '') + ' · modo prueba.</p>';
  return h;
}

function vtNegocioHTML(d) {
  const f = d.fundamento || {};
  if (!f || !f.rubro) return '<div class="card"><p>No pude abrir tu negocio.</p><button class="vt-btn" onclick="render()">Reintentar</button></div>';
  let h = '<div class="vt-head"><h1 class="vt-titulo">Tu negocio</h1></div>';
  h += '<section class="vt-bloque"><h2>Tu fundamento</h2>'
    + '<div class="vt-kv"><span>Rubro</span><b>' + vtEsc(f.rubro || '') + '</b></div>'
    + '<div class="vt-kv"><span>Estrella</span><b>' + vtEsc(f.estrella || '') + '</b></div>'
    + '<div class="vt-kv"><span>Tono</span><b>' + vtEsc(f.tono || '') + '</b></div></section>';
  h += '<section class="vt-bloque"><h2>Precios vigentes</h2>';
  (f.precios || []).forEach((p) => { h += '<div class="vt-kv"><span>' + vtEsc(p.item) + '</span><b>' + vtPesos(p.precio) + '</b></div>'; });
  h += '</section>';
  h += '<section class="vt-bloque"><h2>Límites</h2>'
    + '<div class="vt-kv"><span>Descuento máximo</span><b>' + (f.limites && f.limites.descuento_max_pct !== undefined ? f.limites.descuento_max_pct + '%' : '—') + '</b></div>'
    + '<div class="vt-kv"><span>Grupos que escalan</span><b>' + (f.limites && f.limites.grupo_escala_desde ? 'desde ' + f.limites.grupo_escala_desde + ' personas' : '—') + '</b></div></section>';
  if (f.derechos) h += '<section class="vt-bloque"><h2>Tu plan</h2><div class="vt-kv"><span>Venty</span><b>USD ' + (f.derechos.precio_contratado_usd || 300) + ' / mes</b></div><p class="vt-nota">Lo vendido no se retira: tu precio contratado queda.</p></section>';
  h += '<p class="vt-nota">Esto se mira, no se opera. Para cambiar algo, decíselo a Venty en el chat y se confirma en la Bandeja.</p>';
  return h;
}

function vtErrorHTML() {
  return '<div class="card" style="text-align:center;padding:28px 12px"><p>No pude abrir Venty.</p><button class="vt-btn vt-btn-ok" onclick="render()">Reintentar</button></div>';
}

function vtPaint() {
  const root = document.getElementById('vtRoot');
  if (!root) return;
  const d = window.VT.datos || {};
  const ruta = vtRuta();
  let h = vtTabsHTML(ruta.sub === 'buscar' ? 'buscar' : ruta.sub === 'resumen' ? 'resumen' : 'ventas');
  if (ruta.sub === 'chat' && ruta.id) h += vtChatHTML(d);
  else if (ruta.sub === 'buscar') h += vtBuscarHTML(d);
  else if (ruta.sub === 'resumen') h += vtResumenHTML(d);
  else if (ruta.sub === 'negocio') h += vtNegocioHTML(d);
  else h += vtVentasHTML(d);
  root.innerHTML = h;
  vtWire();
}

async function vtCargar() {
  const ruta = vtRuta();
  const d = { estado: null, frase: null, bandeja: [], partidas: [], mensajesHoy: [], caza: null, parte: null, fundamento: null, partida: null };
  try {
    const r = await Promise.all([
      vtGet('/api/venty/estado').catch(() => null),
      vtGet('/api/venty/frase').catch(() => null),
      vtGet('/api/venty/bandeja').catch(() => null),
      vtGet('/api/venty/partidas?filtro=' + encodeURIComponent(window.VT.filtro || 'todas') + (window.VT.q ? '&q=' + encodeURIComponent(window.VT.q) : '')).catch(() => null),
      vtGet('/api/venty/mensajes-hoy').catch(() => null),
    ]);
    d.estado = r[0]; d.frase = r[1]; d.bandeja = (r[2] && r[2].jugadas) || [];
    d.partidas = (r[3] && r[3].partidas) || []; d.mensajesHoy = (r[4] && r[4].mensajes) || [];
    if (ruta.sub === 'chat' && ruta.id) {
      const f = await vtGet('/api/venty/partidas/' + encodeURIComponent(ruta.id)).catch(() => null);
      d.partida = (f && f.partida) || null;
    }
    if (ruta.sub === 'buscar') d.caza = await vtGet('/api/venty/caza').catch(() => null);
    if (ruta.sub === 'resumen') d.parte = await vtGet('/api/venty/parte').catch(() => null);
    if (ruta.sub === 'negocio') {
      const f = await vtGet('/api/venty/fundamento').catch(() => null);
      d.fundamento = (f && f.fundamento) || null;
    }
  } catch (e) { /* cada pantalla muestra su error amable */ }
  window.VT.datos = d;
}

async function bindVenty() {
  const root = document.getElementById('vtRoot');
  if (!root) return;
  await vtCargar();
  const d = window.VT.datos || {};
  if (!d.estado) { root.innerHTML = vtErrorHTML(); return; }
  vtPaint();
}

function vtWire() {
  const root = document.getElementById('vtRoot');
  if (!root) return;
  root.querySelectorAll('[data-vt-tab]').forEach((b) => {
    b.onclick = () => { location.hash = '#/app/venty' + (b.dataset.vtTab === 'ventas' ? '' : '/' + b.dataset.vtTab); };
  });
  root.querySelectorAll('[data-vt-partida]').forEach((el) => {
    const go = () => { location.hash = '#/app/venty/chat/' + el.dataset.vtPartida; };
    el.onclick = go;
    el.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
  root.querySelectorAll('[data-vt-ver]').forEach((b) => { b.onclick = () => { location.hash = '#/app/venty/chat/' + b.dataset.vtVer; }; });
  const volver = root.querySelector('[data-vt-volver]');
  if (volver) volver.onclick = () => { location.hash = '#/app/venty'; };
  root.querySelectorAll('[data-vt-filtro]').forEach((b) => {
    b.onclick = () => { window.VT.filtro = b.dataset.vtFiltro; bindVenty(); };
  });
  const busc = root.querySelector('[data-vt-buscador]');
  if (busc) {
    busc.onchange = () => { window.VT.q = busc.value.trim(); bindVenty(); };
    busc.onkeydown = (e) => { if (e.key === 'Enter') { window.VT.q = busc.value.trim(); bindVenty(); } };
  }
  root.querySelectorAll('[data-vt-accion]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.vtId, acc = b.dataset.vtAccion;
      b.disabled = true;
      try {
        if (acc === 'cambio') {
          const box = root.querySelector('.vt-cambio');
          if (box) box.hidden = false;
          b.disabled = false;
          return;
        }
        if (acc === 'cambio-enviar') {
          const nota = (root.querySelector('[data-vt-nota="' + id + '"]') || {}).value || '';
          await vtPost('/api/venty/bandeja/' + id + '/cambio', { nota });
          if (typeof bbToast === 'function') bbToast('Cambio pedido ✓ Quedó registrado.');
        } else {
          await vtPost('/api/venty/bandeja/' + id + '/' + (acc === 'aceptar' ? 'aceptar' : 'rechazar'), acc === 'rechazar' ? { nota: '' } : {});
          if (typeof bbToast === 'function') bbToast(acc === 'aceptar' ? 'Aceptado ✓ Quedó registrado.' : 'Descartado.');
        }
        bindVenty();
      } catch (e) {
        if (typeof bbToast === 'function') bbToast('No se guardó. Probá de nuevo en un toque.');
        b.disabled = false;
      }
    };
  });
  const frenoBtn = root.querySelector('[data-vt-freno]');
  if (frenoBtn) {
    frenoBtn.onclick = async () => {
      try {
        const pausado = !(window.VT.datos && window.VT.datos.estado && window.VT.datos.estado.freno && window.VT.datos.estado.freno.pausado);
        await vtPost('/api/venty/freno', { pausado });
        if (typeof bbToast === 'function') bbToast(pausado ? 'Venty en pausa.' : 'Venty de vuelta.');
        bindVenty();
      } catch (e) { if (typeof bbToast === 'function') bbToast('No se guardó. Probá de nuevo en un toque.'); }
    };
  }
  const postyBtn = root.querySelector('[data-vt-posty]');
  if (postyBtn) postyBtn.onclick = vtIrAPosty;
  const tomar = root.querySelector('[data-vt-tomar]');
  if (tomar) tomar.onclick = async () => { try { await vtPost('/api/venty/partidas/' + tomar.dataset.vtTomar + '/tomar', {}); bindVenty(); } catch (e) { if (typeof bbToast === 'function') bbToast('No se guardó. Probá de nuevo en un toque.'); } };
  const seguir = root.querySelector('[data-vt-seguir]');
  if (seguir) seguir.onclick = async () => { try { await vtPost('/api/venty/partidas/' + seguir.dataset.vtSeguir + '/seguir', {}); bindVenty(); } catch (e) { if (typeof bbToast === 'function') bbToast('No se guardó. Probá de nuevo en un toque.'); } };
  const chatEnviar = root.querySelector('[data-vt-chat-enviar]');
  if (chatEnviar) chatEnviar.onclick = () => vtEnviarChat();
  const chatInput = root.querySelector('[data-vt-chat-input]');
  if (chatInput) chatInput.onkeydown = (e) => { if (e.key === 'Enter') vtEnviarChat(); };
  const mic = root.querySelector('[data-vt-mic]');
  if (mic) mic.onclick = () => vtVoiceToggle(mic);
  const simEnviar = root.querySelector('[data-vt-sim-enviar]');
  if (simEnviar) simEnviar.onclick = () => vtEnviarSimulacion();
  const simInput = root.querySelector('[data-vt-sim-input]');
  if (simInput) simInput.onkeydown = (e) => { if (e.key === 'Enter') vtEnviarSimulacion(); };
  const simNueva = root.querySelector('[data-vt-sim-nueva]');
  if (simNueva) simNueva.onclick = async () => {
    try {
      const r = await vtPost('/api/venty/simulacion/nueva', { cliente_nombre: 'Cliente de prueba', canal: 'simulacion' });
      if (r && r.partida_id) location.hash = '#/app/venty/chat/' + r.partida_id;
    } catch (e) { if (typeof bbToast === 'function') bbToast('No se pudo crear la consulta. Probá de nuevo.'); }
  };
}

async function vtEnviarChat() {
  const root = document.getElementById('vtRoot');
  if (!root) return;
  const input = root.querySelector('[data-vt-chat-input]');
  const texto = (input && input.value || '').trim();
  if (!texto) return;
  const resp = root.querySelector('[data-vt-chat-resp]');
  const chips = root.querySelector('[data-vt-chips]');
  if (resp) resp.textContent = '…';
  try {
    const r = await vtPost('/api/venty/chat', { text: texto });
    if (input) input.value = '';
    if (resp) resp.textContent = r.reply || '';
    if (chips) {
      chips.innerHTML = '';
      (r.options || []).forEach((op) => {
        const b = document.createElement('button');
        b.className = 'vt-chip';
        b.textContent = op;
        b.onclick = () => { if (input) input.value = op; vtEnviarChat(); };
        chips.appendChild(b);
      });
    }
  } catch (e) {
    if (resp) resp.textContent = 'No te escuché bien, ¿me lo decís de nuevo?';
  }
}

async function vtEnviarSimulacion() {
  const root = document.getElementById('vtRoot');
  if (!root) return;
  const input = root.querySelector('[data-vt-sim-input]');
  const texto = (input && input.value || '').trim();
  if (!texto) return;
  const ruta = vtRuta();
  const resp = root.querySelector('[data-vt-sim-resp]');
  if (resp) resp.textContent = '…';
  try {
    const r = await vtPost('/api/venty/simulacion/mensaje', { partida_id: Number(ruta.id), texto });
    if (input) input.value = '';
    if (resp) resp.textContent = (r.respuestas || []).join(' · ');
    bindVenty();
  } catch (e) {
    if (resp) resp.textContent = (e && e.data && e.data.kind === 'en_pausa') ? 'Venty está en pausa.' : 'No se pudo mandar. Probá de nuevo.';
  }
}

async function vtIrAPosty() {
  try {
    const n = await vtGet('/api/oficina/nivel');
    const poderes = (n && n.poderes) || [];
    if (poderes.includes('posty')) { if (typeof bbGo === 'function') bbGo('#/app/inicio'); else location.hash = '#/app/inicio'; return; }
  } catch (e) { /* si no se pudo leer, igual se muestra Posty */ }
  if (typeof bbGo === 'function') bbGo('#/app/ajustes?plan=1');
  else location.hash = '#/app/ajustes?plan=1';
  if (typeof bbToast === 'function') bbToast('Posty todavía no está en tu equipo — sumalo en Ajustes.');
}

async function vtVoiceToggle(btn) {
  const root = document.getElementById('vtRoot');
  const resp = root && root.querySelector('[data-vt-chat-resp]');
  if (window.VT.rec) {
    try { window.VT.rec.stop(); } catch (e) {}
    return;
  }
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    if (typeof bbToast === 'function') bbToast('No pude usar el micrófono.');
    return;
  }
  try {
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = async () => {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      window.VT.rec = null;
      if (btn) btn.textContent = '🎙️';
      const blob = new Blob(parts, { type: 'audio/webm' });
      const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      if (resp) resp.textContent = '…';
      try {
        const r = await vtPost('/api/venty/chat/audio', { audioDataUrl: dataUrl }, { timeout: 90000 });
        if (resp) resp.textContent = (r.transcript ? '«' + r.transcript + '» · ' : '') + (r.reply || '');
      } catch (e) {
        if (resp) resp.textContent = 'No te escuché bien, ¿me lo decís de nuevo?';
      }
    };
    rec.start();
    window.VT.rec = rec;
    if (btn) btn.textContent = '⏹️';
    setTimeout(() => { try { if (window.VT.rec) window.VT.rec.stop(); } catch (e) {} }, 90000);
  } catch (e) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch (err) {}
    window.VT.rec = null;
    if (typeof bbToast === 'function') bbToast('No pude grabar.');
  }
}
