/* chunk-ajustes.js — Lazy chunk de Posty.
 * Se carga bajo demanda vía loadChunk('ajustes') desde app.js (NO va con <script> en index.html:
 * cargarlo ahí anularía el ahorro del primer pantallazo).
 * Es un <script> clásico: comparte el scope global con app.js; las funciones declaradas
 * acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA: no agregar top-level let/const/var con nombres que ya existan en app.js u otro chunk
 * (duplicar un let/const entre scripts clásicos es SyntaxError).
 * Versión del archivo: ?v=PLACEHOLDER — la reemplaza el coordinador al armar el zip.
 */


function ajustesView() {
  const p = PROFILE, s = SETTINGS;
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  // Orden nuevo (v282): Tu negocio primero y abierto por defecto; Instagram +
  // TikTok + Google + Tiendanube viven juntos en "Conexiones" (deep-links
  // ?ig/?tiktok/?google/?tn abren esa tarjeta).
  const openSec = q.get('plan') ? 'plan'
    : (q.get('ig') || q.get('tiktok') || q.get('google') || q.get('tn')) ? 'conex'
    : q.get('auto') ? 'auto'
    : q.get('avisos') ? 'avisos'
    : q.get('pagina') ? 'pagina'
    : (q.get('estilos') || q.get('marca')) ? 'marca'
    : q.get('referidos') ? 'referidos'
    : 'negocio';
  const igMsg = q.get('ig') === 'ok' ? `<div class="okmsg">✅ Instagram conectado: @${esc(p.ig_username)}</div>`
    : q.get('ig') === 'error' ? `<div class="err">❌ ${esc(q.get('msg') || 'Error al conectar')}</div>` : '';
  const ttMsg = q.get('tiktok') === 'ok' ? `<div class="okmsg">✅ ¡TikTok conectado! Ya podés compartir tus posteos 🎵</div>`
    : q.get('tiktok') === 'error' ? `<div class="err">❌ ${esc(q.get('msg') || 'Error al conectar TikTok')}</div>` : '';
  const ggMsg = q.get('google') === 'ok' ? `<div class="okmsg">✅ ¡Google conectado! Ya podés responder tus reseñas ⭐</div>`
    : q.get('google') === 'error' ? `<div class="err">❌ ${esc(q.get('msg') || 'Error al conectar Google')}</div>` : '';
  const tnMsg = q.get('tn') === 'ok' ? `<div class="okmsg">✅ ¡Tiendanube conectada! Posty ya lee tu catálogo, tu stock y tus ventas 🛍️</div>`
    : q.get('tn') === 'error' ? `<div class="err">❌ No pudimos conectar tu Tiendanube. Probá de nuevo desde Conexiones.</div>` : '';
  const planMsg = IS_NATIVE ? '' : q.get('plan') === 'ok' ? `<div class="okmsg" id="planConfirmMsg">⏳ Confirmando tu pago…</div>`
    : q.get('plan') === 'pending' ? `<div class="okmsg">⏳ Tu pago está en proceso. Te avisamos cuando se acredite.</div>`
    : q.get('plan') === 'error' ? ((typeof ME !== 'undefined' && ME && ME.lang === 'en')
      ? `<div class="err">❌ The payment was not completed. Tap <b>Subscribe</b> to try again.</div>`
      : `<div class="err">❌ El pago no se completó. Si fue por el email, tocá <b>Suscribirse</b> de nuevo y fijate que sea el mismo de tu cuenta de MercadoPago.</div>`) : '';
  const tokenWarn = s.ig_token_warning ? `<div class="err" style="margin-bottom:18px">⚠️ <b>Tu conexión con Instagram necesita atención:</b> no pudimos renovar tu token automáticamente. Reconectá tu cuenta abajo.</div>` : '';
  const bc = brandColors();
  // Resúmenes de estado en el título de cada sección (v257): texto chico a la
  // derecha del título. Todo con guardas: si el dato no está, no se muestra nada.
  let stIg = '', stPlan = '', stBiz = '', stBrand = '', stPage = '';
  try { stIg = `<span class="ajsec-st">${p.ig_connected ? (p.ig_username ? 'Conectada · @' + esc(p.ig_username) : 'Conectada') : 'Sin conectar'}</span>`; } catch (e) {}
  try { if (typeof ME !== 'undefined' && ME && ME.plan) { const __pn = String(ME.plan); const __nm = __pn.charAt(0).toUpperCase() + __pn.slice(1); const __tl = (ME.is_trial && ME.trial_days_left) ? ` · quedan ${ME.trial_days_left} día${ME.trial_days_left === 1 ? '' : 's'}` : ''; stPlan = `<span class="ajsec-st">${esc(__nm)}${__tl}</span>`; } } catch (e) {}
  try { if (p.business_name && String(p.business_name).trim()) stBiz = `<span class="ajsec-st">${esc(p.business_name)}</span>`; } catch (e) {}
  try { stBrand = `<span class="ajsec-st">${assetLogo() ? 'Logo cargado' : 'Sin logo'}</span>`; } catch (e) {}
  try { if (p.page_slug) stPage = `<span class="ajsec-st">${esc(p.page_slug)}</span>`; } catch (e) {}
  // --- Bloque Instagram (vive dentro de "🔌 Conexiones") ---
  // Conectado y sano (con @ y sin aviso de token): colapsa a la fila de estado
  // + el botón de re-análisis. Con cualquier problema (o sin conectar) vuelve
  // el bloque completo: checklist, modo Demo/Real y guía profesional.
  const igHealthy = !!(p.ig_connected && p.ig_username && !s.ig_token_warning);
  const igCuentaRow = `
    <div class="set-row"><div><div class="t">Cuenta conectada</div>
      <div class="d">${p.ig_connected ? `✅ @${esc(p.ig_username)} — lista para publicar${igSince(s) ? ` · conectada el ${igSince(s)}` : ''} · <a href="https://www.instagram.com/${esc(p.ig_username)}/" target="_blank" rel="noopener" style="color:var(--cel);font-weight:700">ver perfil</a>` : 'Todavía no conectaste tu Instagram. Necesitás una <b>cuenta profesional</b> (Business o Creator). <a href="#" id="igProLink" style="color:var(--cel);font-weight:700">¿Cómo la hago profesional?</a>'}</div>
      <div class="hint" style="margin-top:6px">🔒 Posty puede publicar fotos y videos, y leer tu perfil. Nunca vemos ni guardamos tu contraseña.${p.ig_connected ? '<br>🔑 Si cambiás tu contraseña de Instagram, reconectá tu cuenta acá para que los posteos sigan saliendo.' : ''}</div></div>
      ${p.ig_connected ? `<div style="display:flex;gap:8px;flex-wrap:wrap;flex:none"><button class="btn btn-soft btn-sm" id="btnIgVerify">🔍 Verificar conexión</button><button class="btn btn-danger btn-sm" id="btnIgDisc">Desconectar</button></div>` : `<button class="btn btn-primary btn-sm" id="btnIgConn">Conectar Instagram</button>`}
    </div>
    <div id="igVerifyMsg" style="margin-top:10px"></div>`;
  const igKnowRow = `
    <div style="margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-soft btn-sm" id="btnKnowUpdate">🔄 Actualizar lo que Posty sabe de mí</button>
      <span class="hint" id="knowMsg"></span>
    </div>
    <div class="hint" style="margin-top:6px">Relee tu Instagram completo: tu estilo visual, cómo escribís y tu brief — en ese orden.</div>`;
  const igBody = igHealthy ? `${igCuentaRow}${igKnowRow}
    <div id="igMsg"></div>` : `
    <div class="ig-checklist">
      <div class="t">Tu Instagram está listo cuando:</div>
      <div class="ig-check ${(p.ig_connected && p.ig_username) ? 'ok' : ''}">${(p.ig_connected && p.ig_username) ? '✅' : '⬜'} Cuenta profesional conectada</div>
      <div class="ig-check ${!s.demo_mode ? 'ok' : ''}">${!s.demo_mode ? '✅' : '⬜'} Modo demo apagado</div>
      <div class="ig-check ${IG_VERIFIED_AT ? 'ok' : ''}">${IG_VERIFIED_AT ? '✅' : '⬜'} Conexión verificada${IG_VERIFIED_AT ? ` <span style="color:var(--dim);font-weight:400">(${IG_VERIFIED_AT})</span>` : ''}</div>
    </div>
    <div class="set-row"><div><div class="t">${s.demo_mode ? '🧪 Modo Demo' : '🚀 Modo Real'}</div>
      <div class="d">${s.demo_mode ? 'Posty <b>simula</b> las publicaciones: probás el flujo completo sin que salga nada real.' : 'Al conectar tu Instagram, Posty publica <b>de verdad</b>.'}</div></div>
      <button class="btn btn-soft btn-sm" id="${s.demo_mode ? 'igModeToReal' : 'igModeToDemo'}" style="flex:none">${s.demo_mode ? 'Pasar a Real 🚀' : 'Volver a Demo 🧪'}</button>
    </div>
    ${IG_MODE_WARN ? `<div class="ig-warn" style="margin-bottom:14px">⚠️ Elegiste el modo <b>Real</b> pero todavía no conectaste tu Instagram. Conectalo abajo para publicar de verdad.</div>` : ''}
    ${igCuentaRow}
    ${p.ig_connected ? '' : `<div style="margin-top:14px">
      <div style="font-weight:700;font-size:13px">¿Todavía no conectás?</div>
      <p style="color:var(--mut);font-size:12.5px;margin:4px 0 10px">Escribí tu @ y te analizo igual — tu estilo, tus horarios y tu competencia — sin conectar nada.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:170px;margin:0"><input id="s_iguser" value="${esc(p.ig_username)}" placeholder="tu_usuario" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
        <button class="btn btn-soft btn-sm" id="btnIgUserSave" style="flex:none">Guardar @</button>
        <span id="igUserMsg"></span>
      </div>
    </div>`}
    ${igKnowRow}
    <div id="igProGuide" style="display:none;margin-top:4px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#F2F9FD">
      <div style="font-weight:800;margin-bottom:10px">📲 Hacé tu cuenta profesional <span style="font-weight:400;color:var(--dim);font-size:11.5px">(gratis, 30 segundos)</span></div>
      <ol style="margin:0 0 12px 20px;padding:0;font-size:12.5px;color:var(--mut);line-height:1.8">
        <li>Abrí Instagram y andá a tu perfil</li>
        <li>Tocá <b>☰</b> → <b>Configuración y privacidad</b></li>
        <li><b>Tipo de cuenta y herramientas</b> → <b>Cambiar a cuenta profesional</b></li>
        <li>Elegí <b>Creator</b> o <b>Business</b> y completá los pasos</li>
      </ol>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn-soft btn-sm" href="https://www.instagram.com/" target="_blank" rel="noopener">📲 Abrir Instagram</a>
        <button class="btn btn-primary btn-sm" id="btnIgRetry">🔄 Ya la hice profesional — conectar</button>
      </div>
      <div class="hint" style="margin-top:8px">Instagram no permite hacer este cambio desde otra app: se hace dentro de Instagram, por eso te llevamos hasta ahí.</div>
    </div>
    <div id="igMsg"></div>`;
  return `<div class="page-head"><div class="ph-ico">⚙️</div><div class="ph-txt"><h1>Ajustes</h1><p class="sub">Tu negocio, tu Instagram, tu plan y tu marca.</p></div></div>
  ${igMsg}${ttMsg}${ggMsg}${tnMsg}${planMsg}${tokenWarn}
  <div class="card ajsec${openSec==='negocio' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🏪 Tu negocio</h3>${stBiz}<span class="ajsec-c">⌄</span></div><div class="ajsec-b">
  <p style="color:var(--mut);font-size:12.5px;margin:-6px 0 14px">🤖 La IA usa estos datos para crear tus posteos.</p>
    <div class="field"><label>Nombre del negocio</label><input id="s_biz" value="${esc(p.business_name)}" placeholder="Mi Tienda"></div>
    <div class="row2">
      <div class="field"><label>Rubro</label><select id="s_cat">
        ${CATS.map(([v, ico, t]) => `<option ${catSel(p.category) === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
      </select></div>
      <div class="field" id="s_catother_w" style="${catSel(p.category) === 'otro' ? '' : 'display:none'}"><label>¿Cuál?</label><input id="s_catother" value="${esc(catCustom(p.category))}" placeholder="Ej: veterinaria, librería..." maxlength="40"></div>
      <div class="field"><label>Tono de la IA</label><select id="s_tone">
        ${TONES.map(([v, ico, t]) => `<option ${p.tone === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
      </select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Zona horaria <span style="color:var(--dim);font-weight:400">(para programar a la hora de tu país)</span></label><select id="s_tz">
        ${TIMEZONES.map(([v, l]) => `<option ${s.timezone === v ? 'selected' : ''} value="${v}">${l}</option>`).join('')}
      </select></div>
      <div class="field"><label>Objetivo</label><select id="s_goal">
        ${GOALS.map(([v, ico, t]) => `<option ${p.goal === v ? 'selected' : ''} value="${v}">${ico} ${t}</option>`).join('')}
      </select></div>
      <div class="field"><label>🎯 Foco de este mes</label><input id="s_mgoal" value="${esc(p.monthly_goal || '')}" placeholder="Ej.: vender más cortes los viernes" maxlength="120"><div class="hint">Lo que querés empujar ESTE mes. Posty inclina todos los posteos a esto — cambialo cuando quieras.</div></div>
    </div>
    <div class="field"><label>Descripción (para que la IA te conozca)</label><textarea id="s_desc" maxlength="600" placeholder="Vendemos ropa urbana para jóvenes en Palermo...">${esc(p.description)}</textarea>
      <div class="hint"><span id="s_desc_n">${(p.description || '').length}</span>/600 · Mientras más nos cuentes, mejores ideas creamos por vos.</div>
      </div>
    <div class="field"><label>Tus competidores</label>
      <div class="comp-box" id="s_compbox"><div class="comp-chips" id="s_chips"></div><input id="s_compin" name="compinput" placeholder="＋ Agregar competidor…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" readonly onfocus="this.removeAttribute('readonly')"></div>
      <div class="hint" id="compHint" style="display:none;color:#e5484d"></div>
      <div class="hint">Los estudiamos para crear ideas que te hagan destacar.</div></div>
    <div class="field" style="border-top:1px solid var(--line);padding-top:14px;margin-top:4px">
      <label style="font-size:13px">🧬 Lo que la IA sabe de tu negocio</label>
      <div class="hint" style="margin:-6px 0 12px">Completá lo que quieras: la IA lo usa para crear posteos que venden de verdad.</div>
      <div class="field"><label>Productos <span id="dnaChip_productos"></span> <span style="color:var(--dim);font-weight:400">(uno por línea: nombre — precio)</span></label>
        <textarea id="s_dna_productos" rows="3" placeholder="Remera oversize — $25.000&#10;Zapatillas retro — $89.900"></textarea></div>
      <div class="field"><label>Promos activas <span id="dnaChip_promos_activas"></span> <span style="color:var(--dim);font-weight:400">(una por línea)</span></label>
        <textarea id="s_dna_promos" rows="2" placeholder="2x1 en remeras esta semana"></textarea></div>
      <div class="row2">
        <div class="field"><label>Horarios <span id="dnaChip_horarios"></span></label><input id="s_dna_horarios" placeholder="Lun a Sáb 10 a 20 hs" autocomplete="off"></div>
        <div class="field"><label>Ubicación <span id="dnaChip_ubicacion"></span></label><input id="s_dna_ubicacion" placeholder="Palermo, CABA" autocomplete="off"></div>
      </div>
      <div class="field"><label>🚪 Días que cerrás</label>
        <div id="closedDaysRow" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        <div class="hint" id="closedDaysHint">Tocá los días en que tu negocio no abre: Posty no programa posteos esos días.</div>
      </div>
      <div class="hint">Estos datos se guardan con el botón <b>Guardar</b> de acá abajo, junto con todo tu negocio — un solo guardado para todo.</div>
      <div id="webDnaZone"></div>
      <div id="dnaFuentesZone"></div>
    </div>
    <div style="position:sticky;bottom:10px;z-index:6;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 12px;box-shadow:0 6px 20px rgba(10,30,51,.10);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnSaveProfile">Guardar</button> <span id="profMsg"></span>
      <span id="profDirty" style="display:none;color:var(--yel);font-size:11.5px;font-weight:700">● Tenemos cambios sin guardar</span>
      <span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" id="btnOnb">🧭 Retomar guía inicial</button>
      <button class="btn btn-ghost btn-sm" id="btnPreview">👁 Vista previa</button>
    </div>
    <div style="border-top:1px solid var(--line);margin-top:18px;padding-top:14px">
      <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;margin-bottom:10px">🧠 Lo que Posty sabe de tu negocio <span class="lvl-pill" id="lvlPill" style="display:none"><span class="lvl-num" id="lvlPillNum">Nivel 1</span><span class="lvl-name" id="lvlPillName"></span></span></div>
    <div class="lvl-block" id="lvlBlock"><p class="hint">Calculando tu nivel…</p></div>
    <p class="src-intro">Lo estudio solo para crear posteos que venden.</p>
    <div class="src-row" id="webZone"><p class="hint">Cargando…</p></div>
    <div class="src-row" id="storiesZone"><p class="hint">Cargando…</p></div>
    <div class="src-row" id="fbZone"><p class="hint">Cargando…</p></div>
    <div class="src-row" id="srcCommentsCard"><p class="hint">Cargando…</p></div>
    <div class="src-row" id="placesZone"><p class="hint">Cargando…</p></div>
    </div>
  </div></div>
  <div class="card ajsec${openSec==='conex' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🔌 Conexiones</h3>${stIg}<span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div style="font-weight:800;margin-bottom:8px">📸 Instagram</div>
    ${igBody}
    <div id="pzBioSealSlot"></div>
    <div style="font-weight:800;margin:18px 0 8px">🎵 TikTok</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Compartí tus posteos también en TikTok: con tu cuenta conectada, cada posteo publicado suma el botón <b>🎵 Compartir en TikTok</b>. Posty nunca publica ahí sin que lo pidas.</p>
    <div id="ttZone"><p class="hint">Cargando…</p></div>
    <div id="ttMsg"></div>
    <div style="font-weight:800;margin:18px 0 8px">⭐ Google · Reseñas</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Respondé las reseñas de tu ficha de Google sin salir de Posty: escribí <b>reseñas</b> en el chat y Posty te deja cada respuesta lista para mandar con un toque.</p>
    <div id="ggZone"><p class="hint">Cargando…</p></div>
    <div id="ggMsg"></div>
    <div style="font-weight:800;margin:18px 0 8px">🛍️ Tiendanube</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Tu tienda, conectada: Posty lee tu catálogo, tu stock y tus ventas para postear solo lo que tenés, con tu producto más vendido al frente. Solo lee: nunca toca precios ni stock.</p>
    <div id="tnZone"><p class="hint">Cargando…</p></div>
    <div id="tnMsg"></div>
  </div></div>
  <div class="card ajsec${openSec==='auto' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🚀 Posty en automático</h3><span class="ajsec-st" id="ajStAuto"></span><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div style="font-weight:800;margin-bottom:8px">⏸ Pausar todo</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">¿Vacaciones o una semana sin publicar? Frená todo con un toque: lo programado vuelve a borrador y nada sale hasta que reanudes. Tu semana y tus borradores quedan guardados, tal como están.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnPauseAll">Cargando...</button>
      <span id="pauseStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="border-bottom:1px solid var(--line);margin:18px 0"></div>
    <div style="font-weight:800;margin-bottom:8px">Publicación</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Posty programa y publica tus posteos solo, en sus mejores horarios — vos no tenés que aceptar nada. Si algo no pasa el filtro de calidad, queda en revisión y te avisa. Y cualquier posteo se puede frenar antes de que salga, desde Schedule.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnAutopilotToggle">Cargando...</button>
      <span id="autopilotStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div id="autopilotInfo" style="font-size:11.5px;color:var(--dim);margin-top:8px"></div>
    <div style="font-weight:800;margin:18px 0 8px">Tu semana</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Posty arma tu semana solo y la deja programada. Si no tocás nada en 24 horas, sale sola. Vos solo mirás y disfrutás.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnAutoWeekToggle">Cargando...</button>
      <span id="autoWeekStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
  </div></div>
  <div class="card ajsec${openSec==='avisos' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🔔 Avisos</h3><span class="ajsec-st" id="ajStAvisos"></span><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:14px">Posty te avisa por notificación en tu celu — solo cuando importa, nada de ruido.</p>
    <div style="font-weight:800;margin-bottom:8px">Aviso antes de publicar</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Te aviso 30 minutos antes de que salga cada posteo automático, para que puedas frenarlo desde Schedule si querés.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnPreNotifyToggle">Cargando...</button>
      <span id="preNotifyStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="font-weight:800;margin:18px 0 8px">📩 Tu carta del domingo</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Cada domingo a la noche te escribo tu carta: cómo viene tu Instagram y qué ya estoy haciendo por tu negocio. Te aviso apenas llega.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnLetterToggle">Cargando...</button>
      <span id="letterNotifyStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="font-weight:800;margin:18px 0 8px">😕 Si un posteo no pudo salir</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Si un posteo falla al publicar, te aviso en el momento. Nunca sale a medias: queda en borrador para que lo mires.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnFailToggle">Cargando...</button>
      <span id="failNotifyStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div class="hint" id="avisosPushHint" style="display:none;margin-top:14px">📱 Todavía no activaste las notificaciones en tu celu: los avisos quedan prendidos, pero no tienen dónde llegar. Cuando Posty te pida permiso para mandar notificaciones, tocá <b>Permitir</b>.</div>
  </div></div>
  <div class="card ajsec${openSec==='plan' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>💳 Mi plan</h3>${stPlan}<span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="planZone"><p style="color:var(--dim)">Cargando...</p></div>
    <div id="founderZone"></div>
  </div></div>
  <div class="card ajsec${openSec==='marca' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🎨 Tu marca y estilos</h3>${stBrand}<span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:16px">Acá definís tu logo y tus colores: todo lo que generemos sale con tu identidad.</p>
    <div class="row2">
      <div class="field"><label>Logo</label>
        <div style="display:flex;gap:10px;align-items:center">
          ${assetLogo() ? `<img src="${assetLogo().file_path}" style="max-height:48px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px">` : '<span style="color:var(--dim);font-size:12.5px">Sin logo</span>'}
          <button class="btn btn-ghost btn-sm" id="btnBrandLogo">📤 ${assetLogo() ? 'Cambiar' : 'Subir'}</button>
          ${assetLogo() ? '<button class="btn btn-ghost btn-sm" id="btnBrandLogoDel">🗑️ Quitar</button>' : ''}
        </div>
        <input type="file" id="s_logofile" accept="image/*,.pdf,.docx" style="display:none">
        <div class="hint" style="font-size:10.5px;color:var(--dim);margin-top:6px">Aceptamos imagen, PDF o Word.</div>
      </div>
    </div>
    <div class="field"><label>Colores de tu marca <span style="color:var(--dim);font-weight:400">(con 2 alcanza para activar "Mi marca")</span></label>
      <div style="font-size:10.5px;color:var(--dim);margin:0 0 10px">Tocá el rol de cada color para reordenarlos ↕</div>
      <div style="display:flex;gap:10px">
        ${[0, 1, 2].map(i => `
        <div style="display:flex;flex-direction:column;gap:4px;align-items:center">
          <input type="color" id="s_c${i}" value="${bc[i] || NEUTRAL_TRIO[i]}" style="width:56px;height:44px;border:1px solid var(--line);border-radius:12px;padding:4px;background:#fff;cursor:pointer">
          <input type="text" id="s_h${i}" value="${(bc[i] || NEUTRAL_TRIO[i]).toUpperCase()}" maxlength="7" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="#000000" style="width:88px;text-align:center;font-size:16px;font-family:monospace;padding:6px 4px;border:1px solid var(--line);border-radius:8px;text-transform:uppercase">
          <div style="position:relative">
            <select id="s_r${i}" aria-label="Rol del color ${i + 1}: tocá para reordenar" style="appearance:none;-webkit-appearance:none;font-size:16px;font-weight:700;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:9px 30px 9px 14px;background:#F2F9FD;max-width:150px;cursor:pointer">
              ${['Principal', 'Secundario', 'Acento'].map((r, ri) => `<option value="${ri}"${ri === i ? ' selected' : ''}>${r}</option>`).join('')}
            </select>
            <span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--dim);pointer-events:none">⌄</span>
          </div>
        </div>`).join('')}
      </div>
      <div class="hint">Subí tu logo y detectamos tus colores automáticamente, o elegilos a mano tocando el color o escribiendo su código. Con el menú de cada color elegís si es Principal, Secundario o Acento: se reordenan solos. El principal domina los diseños, el secundario lo acompaña y el acento va en botones y detalles.</div>
    </div>
    <div class="field"><label>Vista previa</label>
      <div id="brandPrev"></div>
      <div class="hint">Así se ve tu marca en tus posteos. Se actualiza sola cuando cambiás los colores.</div>
    </div>
    <div class="field"><label>Foto de perfil</label>
      <div style="display:flex;gap:12px;align-items:center">
        <div class="brand-pf" id="brandPf"></div>
        <div class="hint" style="margin:0">Así se ve tu logo recortado en círculo, como foto de perfil de Instagram.</div>
      </div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnSaveBrand">Guardar marca</button> <span id="brandMsg"></span>
      <span id="brandDirty" style="display:none;color:var(--yel);font-size:11.5px;font-weight:700">● Tenemos cambios sin guardar</span>
    </div>
    <div style="margin-top:10px"><button class="linklike" id="btnResetBrand" style="font-size:11.5px;color:var(--mut);text-decoration:underline;background:none;border:0;cursor:pointer;padding:0">Reiniciar todo</button></div>
    <div style="border-top:1px solid var(--line);margin-top:18px;padding-top:14px">
      <div style="font-weight:800;font-size:15px;margin-bottom:10px">🎨 Estilos de tus posteos</div>
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:6px">Elegí los que te gusten. Si no elegís, elijo yo por vos ✨</p>
    <p style="color:var(--dim);font-size:11.5px;margin-bottom:14px">Muestras de estilo: así se compone un posteo con cada uno — con una foto de tu rubro, tu nombre y tus colores. Marcá hasta 3 favoritos y tus posteos nuevos van a salir con esos looks primero.</p>
    <div id="styleGallery"><div style="color:var(--mut);font-size:12.5px">Cargando estilos…</div></div>
    <div class="hint" id="styleFavMsg" style="margin-top:10px"></div>
    </div>
  </div></div>
  <div class="card ajsec${openSec==='pagina' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🌐 Tu página</h3>${stPage}<span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <p style="color:var(--mut);font-size:12.5px;margin-bottom:12px">Tu link para la <b>bio de Instagram</b>: una página linda con tu negocio y tus posteos ya publicados, con botón directo a tu WhatsApp. Cada persona que la visita conoce Posty 🐾</p>
    <div class="field"><label>Tu dirección</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:13.5px;color:var(--mut)">postyhacetodo.com/p/</span>
        <input id="s_slug" value="${esc(p.page_slug || '')}" maxlength="40" style="flex:1;min-width:150px" autocomplete="off" autocapitalize="none">
        <button class="btn btn-ghost btn-sm" id="btnCopyPage" type="button" style="flex:none">📋 Copiar link</button>
      </div>
      <div class="hint">Solo letras minúsculas, números y guiones. Si la dirección está libre, queda para vos.</div></div>
    <div class="field"><label>💬 WhatsApp de tu negocio</label><input id="s_whats" value="${esc(p.whatsapp || '')}" placeholder="Ej.: 5491123456789" inputmode="tel" maxlength="20" autocomplete="off"><div class="hint">El número al que te escriben tus clientes, con código de país (Argentina: 54 9 + tu número). Aparece como botón grande en tu página.</div></div>
    <div class="field"><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="s_pageon" ${p.page_enabled === 0 ? '' : 'checked'}> Página visible para todos</label><div class="hint">Si la apagás, tu link muestra "página no disponible". Solo se ven posteos ya publicados — nunca borradores.</div></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="btnSavePage" type="button">Guardar página</button>
      <span id="pageMsg"></span>
      <a href="/p/${esc(p.page_slug || '')}" target="_blank" rel="noopener" id="pagePreviewLink" style="font-size:13.5px;font-weight:700">Ver mi página →</a>
    </div>
  </div></div>
  ${IS_NATIVE ? '' : `<div class="card ajsec${openSec==='referidos' ? ' open' : ''}"><div class="ajsec-h" role="button" tabindex="0"><h3>🎁 Referidos · 50% off</h3><span class="ajsec-c">⌄</span></div><div class="ajsec-b">
    <div id="refZone"><p style="color:var(--dim)">Cargando...</p></div>
  </div></div>`}
  <details class="card int-advanced"><summary>⚙️ Configuración avanzada</summary>
    <p class="hint" style="margin:12px 0">Solo si necesitás conectar tu propia app de Meta. La mayoría no tiene que tocar nada acá.</p>
    <div class="int-block"><h4>📸 App de Meta</h4>
      <div class="row2">
        <div class="field"><label>Meta App ID</label><input id="s_appid" value="${esc(s.meta_app_id)}" placeholder="123456789">
          <p class="hint">El número identificador de tu app en Meta.</p></div>
        <div class="field"><label>Meta App Secret</label><input id="s_appsecret" type="password" value="${esc(s.meta_app_secret)}" placeholder="••••••">
          <p class="hint">La clave secreta de tu app. Nunca la compartas.</p></div>
      </div>
      <p class="hint">Los encontrás en <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a> → tu app → Configuración.</p>
      <div class="field" style="margin-top:10px"><button class="btn btn-ghost" id="btnTestMeta" type="button">Probar conexión</button> <span id="metaTestMsg" style="font-size:11.5px"></span></div>
      <div class="field"><label>Instagram Embed URL</label>
        <input id="s_igembed" value="${esc(s.ig_embed_url)}" placeholder="https://www.instagram.com/oauth/authorize?...">
        <p class="hint">La dirección que Meta genera para conectar tu Instagram. Se copia del dashboard de Meta: caso de uso Instagram → "API setup with Instagram login".</p></div>
    </div>
    <button class="btn btn-primary" id="btnSaveSettings">Guardar</button> <span id="setMsg"></span>
  </details>
  <div class="card" style="margin-top:16px"><button class="btn btn-danger btn-block" id="btnLogoutAj">🚪 Salir</button></div>`;
}

// Zona TikTok: estado desde /api/tiktok/status (configurado / conectado).
async function ttZoneLoad() {
  const zone = $('#ttZone');
  if (!zone) return;
  let st = null;
  try { st = await api.get('/api/tiktok/status'); } catch (e) { /* queda el fallback */ }
  if (!st) { zone.innerHTML = '<p class="hint">No se pudo cargar el estado de TikTok.</p>'; return; }
  if (!st.configured) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">🎵 TikTok — Próximamente</div>
      <div class="d">Estamos terminando la conexión con TikTok. Cuando esté lista, vas a poder compartir tus posteos ahí con un toque, sin salir de Posty.</div></div></div>`;
    return;
  }
  if (!st.connected) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta de TikTok</div>
      <div class="d">Todavía no conectaste tu TikTok. Al conectar, Posty puede compartir tus posteos ahí cuando vos lo pidas — nunca publica solo.</div>
      <div class="hint" style="margin-top:6px">🔒 Entrás con el login oficial de TikTok. Nunca vemos ni guardamos tu contraseña.</div></div>
      <button class="btn btn-primary btn-sm" id="btnTtConn" style="flex:none">Conectar TikTok</button></div>`;
    const bc = $('#btnTtConn');
    if (bc) bc.onclick = () => { location.href = '/api/tiktok/connect'; };
    return;
  }
  zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta conectada</div>
    <div class="d">✅ ${st.username ? '@' + esc(st.username) : 'Tu TikTok'} — lista para compartir tus posteos 🎵</div>
    <div class="hint" style="margin-top:6px">En cada posteo publicado de tu Schedule vas a ver el botón <b>🎵 Compartir en TikTok</b>.</div></div>
    <button class="btn btn-danger btn-sm" id="btnTtDisc" style="flex:none">Desconectar</button></div>`;
  const bd = $('#btnTtDisc');
  if (bd) bd.onclick = async () => {
    if (!confirm('¿Desconectar tu TikTok de Posty?')) return;
    try { await api.post('/api/tiktok/disconnect'); } catch (e) {}
    ttZoneLoad();
  };
}

// Zona Google: estado desde /api/google/status (configurado / conectado).
async function ggZoneLoad() {
  const zone = $('#ggZone');
  if (!zone) return;
  let st = null;
  try { st = await api.get('/api/google/status'); } catch (e) { /* queda el fallback */ }
  if (!st) { zone.innerHTML = '<p class="hint">No se pudo cargar el estado de Google.</p>'; return; }
  if (!st.configured) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">⭐ Google — Próximamente</div>
      <div class="d">Estamos terminando la conexión con Google. Cuando esté lista, vas a poder responder las reseñas de tu negocio con un toque, sin salir de Posty.</div></div></div>`;
    return;
  }
  if (!st.connected) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta de Google</div>
      <div class="d">Todavía no conectaste tu Google. Al conectar, Posty trae las reseñas de tu ficha y te deja cada respuesta lista — nunca responde solo.</div>
      <div class="hint" style="margin-top:6px">🔒 Entrás con el login oficial de Google. Nunca vemos ni guardamos tu contraseña.</div></div>
      <button class="btn btn-primary btn-sm" id="btnGgConn" style="flex:none">Conectar Google</button></div>`;
    const bc = $('#btnGgConn');
    if (bc) bc.onclick = () => { location.href = '/api/google/connect'; };
    return;
  }
  zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta conectada</div>
    <div class="d">✅ ${st.businessName ? esc(st.businessName) : 'Tu ficha de Google'} — lista para responder reseñas ⭐</div>
    <div class="hint" style="margin-top:6px">Escribí <b>reseñas</b> en el chat y Posty te muestra las que faltan responder, con la respuesta lista.</div></div>
    <button class="btn btn-danger btn-sm" id="btnGgDisc" style="flex:none">Desconectar</button></div>`;
  const bd = $('#btnGgDisc');
  if (bd) bd.onclick = async () => {
    if (!confirm('¿Desconectar tu Google de Posty?')) return;
    try { await api.post('/api/google/disconnect'); } catch (e) {}
    ggZoneLoad();
  };
}

// Zona Tiendanube: estado desde /api/connections/tiendanube/status
// (configured / connected / broken + datos de la última sync).
async function tnZoneLoad() {
  const zone = $('#tnZone');
  if (!zone) return;
  let st = null;
  try { st = await api.get('/api/connections/tiendanube/status'); } catch (e) { /* queda el fallback */ }
  if (!st) { zone.innerHTML = '<p class="hint">No se pudo cargar el estado de Tiendanube.</p>'; return; }
  if (!st.configured) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">🛍️ Tiendanube — Muy pronto</div>
      <div class="d">Estamos terminando la conexión con Tiendanube. Cuando esté lista, vas a poder conectar tu tienda con un toque y Posty va a postear solo lo que tenés en stock.</div></div></div>`;
    return;
  }
  if (!st.connected) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">Tu tienda de Tiendanube</div>
      <div class="d">Conectá tu tienda y Posty postea solo lo que tenés en stock, con tu producto más vendido al frente.</div>
      <div class="hint" style="margin-top:6px">🔒 Entrás con el login oficial de Tiendanube. Nunca vemos ni guardamos tu contraseña, y Posty solo lee: nunca toca precios ni stock.</div></div>
      <button class="btn btn-primary btn-sm" id="btnTnConn" style="flex:none">Conectar Tiendanube</button></div>`;
    const bc = $('#btnTnConn');
    if (bc) bc.onclick = () => { location.href = '/api/connections/tiendanube/start'; };
    return;
  }
  if (st.broken) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">🛍️ Tiendanube</div>
      <div class="d">⚠️ La conexión con ${st.store_name ? esc(st.store_name) : 'tu tienda'} se cortó. Volvé a conectarla para que Posty siga leyendo tu stock y tus ventas.</div></div>
      <button class="btn btn-primary btn-sm" id="btnTnConn" style="flex:none">Reconectar</button></div>`;
    const bc = $('#btnTnConn');
    if (bc) bc.onclick = () => { location.href = '/api/connections/tiendanube/start'; };
    return;
  }
  const datos = [];
  if (st.products_total != null) datos.push(`${st.products_total} productos`);
  if (st.star && st.star.name) datos.push(`⭐ tu más vendido: <b>${esc(st.star.name)}</b> (${st.star.units_30d} ventas en 30 días)`);
  let syncTxt = '';
  if (st.synced_at) {
    const d = new Date(String(st.synced_at).replace(' ', 'T'));
    if (!isNaN(d)) syncTxt = ` · Actualizado ${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  zone.innerHTML = `<div class="set-row"><div><div class="t">Tienda conectada</div>
    <div class="d">✅ ${st.store_name ? esc(st.store_name) : 'Tu Tiendanube'} — Posty lee tu catálogo, tu stock y tus ventas 🛍️</div>
    ${datos.length ? `<div class="hint" style="margin-top:6px">${datos.join(' · ')}${syncTxt}</div>` : ''}</div>
    <div style="display:flex;gap:8px;flex:none">
      <button class="btn btn-ghost btn-sm" id="btnTnSync">Actualizar ahora</button>
      <button class="btn btn-danger btn-sm" id="btnTnDisc">Desconectar</button>
    </div></div>`;
  const bs = $('#btnTnSync');
  if (bs) bs.onclick = async () => {
    bs.disabled = true; bs.textContent = 'Actualizando…';
    try { await api.post('/api/connections/tiendanube/sync'); } catch (e) {}
    tnZoneLoad();
  };
  const bd = $('#btnTnDisc');
  if (bd) bd.onclick = async () => {
    if (!confirm('¿Desconectar tu Tiendanube de Posty? Posty deja de leer tu tienda.')) return;
    try { await api.post('/api/connections/tiendanube/disconnect'); } catch (e) {}
    tnZoneLoad();
  };
}

// v186: galería "🎨 Estilos de tus posteos" — muestras fieles (mismo motor
// de composición que los posteos) y hasta 3 favoritos persistidos. Todo
// opcional: sin favoritos, Posty elige como siempre.
async function styleGalleryLoad() {
  const box = document.getElementById('styleGallery');
  if (!box) return;
  const msg = document.getElementById('styleFavMsg');
  let data = null;
  try { data = await api.get('/api/image-styles'); } catch (e) {}
  const rec = (data && data.recommended) || [];
  let favs = ((data && data.favorites) || []).slice();
  if (!rec.length) {
    box.innerHTML = '<div style="color:var(--mut);font-size:12.5px">Por ahora no hay estilos para mostrarte — Posty sigue eligiendo por vos ✨</div>';
    return;
  }
  const paint = () => {
    box.innerHTML = '<div class="sgal-grid">' + rec.map((s) => {
      const on = favs.includes(s.code);
      return `<div class="sgal-card${on ? ' on' : ''}">
        <img class="sgal-img" src="/api/style-sample?style=${encodeURIComponent(s.code)}" alt="Muestra del estilo ${esc(s.name)}" loading="lazy" onerror="this.style.opacity='0'">
        <div class="sgal-name">${esc(s.name)}</div>
        <button type="button" class="sgal-btn" data-sgal-code="${esc(s.code)}">${on ? '⭐ Favorito' : '☆ Marcar favorito'}</button>
      </div>`;
    }).join('') + '</div>';
    box.querySelectorAll('[data-sgal-code]').forEach((b) => { b.onclick = () => toggle(b.getAttribute('data-sgal-code')); });
  };
  const toggle = async (code) => {
    let next;
    if (favs.includes(code)) next = favs.filter((c) => c !== code);
    else {
      if (favs.length >= 3) { if (msg) msg.textContent = 'Hasta 3 favoritos ⭐ — sacá uno para cambiarlo por otro.'; return; }
      next = favs.concat([code]);
    }
    try {
      const r = await api.put('/api/style-favorites', { favorites: next });
      if (r && r.ok) {
        favs = r.favorites || next;
        if (msg) msg.textContent = favs.length ? '⭐ Guardado: tus posteos nuevos van a preferir estos estilos.' : 'Listo: sin favoritos, Posty elige por vos ✨';
        paint();
      } else if (msg) msg.textContent = 'No se pudo guardar — probá de nuevo.';
    } catch (e) { if (msg) msg.textContent = 'No se pudo guardar — probá de nuevo.'; }
  };
  paint();
}

function bindSettings() {
  // Acordeón de secciones en móvil
  $$('.ajsec-h').forEach(h => {
    const tg = () => h.parentElement.classList.toggle('open');
    h.onclick = tg;
    h.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tg(); } };
  });
  try { ttZoneLoad(); } catch (e) {}
  try { ggZoneLoad(); } catch (e) {}
  try { tnZoneLoad(); } catch (e) {}
  try { styleGalleryLoad(); } catch (e) {}
  // --- Página pública del negocio (v169) ---
  const btnCopyPage = $('#btnCopyPage');
  if (btnCopyPage) btnCopyPage.onclick = async () => {
    const slug = (($('#s_slug') && $('#s_slug').value.trim()) || (PROFILE && PROFILE.page_slug) || '');
    const url = 'https://postyhacetodo.com/p/' + slug.replace(/^\/+/, '');
    try { await navigator.clipboard.writeText(url); btnCopyPage.textContent = '✅ ¡Copiado!'; setTimeout(() => { btnCopyPage.textContent = '📋 Copiar link'; }, 1800); }
    catch (e) { window.prompt('Copiá tu link:', url); }
  };
  const btnSavePage = $('#btnSavePage');
  if (btnSavePage) btnSavePage.onclick = async () => {
    const msg = $('#pageMsg');
    btnSavePage.disabled = true;
    try {
      await api.put('/api/profile', {
        whatsapp: $('#s_whats') ? $('#s_whats').value : '',
        page_slug: $('#s_slug') ? $('#s_slug').value : '',
        page_enabled: $('#s_pageon') ? $('#s_pageon').checked : true,
      });
      PROFILE = await api.get('/api/profile');
      if ($('#s_slug') && PROFILE.page_slug) $('#s_slug').value = PROFILE.page_slug;
      const pv = $('#pagePreviewLink'); if (pv && PROFILE.page_slug) pv.href = '/p/' + PROFILE.page_slug;
      if (msg) msg.innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ ¡Página guardada!</span>';
    } catch (e) {
      if (msg) msg.innerHTML = '<span style="color:#c0392b;font-size:12.5px">' + esc((e && e.message) || 'No se pudo guardar 😅') + '</span>';
    }
    btnSavePage.disabled = false;
  };
  // v282: "Tus números" salió de Ajustes — vive en su pantalla propia (tab
  // numeros → statsView/bindStats en app.js). Acá ya no se bindea stats.
  // Resumen de estado en el título de "🚀 Posty en automático" (v257): se pinta
  // recién cuando AMBOS toggles cargaron su estado real; si algo falla, no se muestra nada.
  let __apOn = null, __awOn = null;
  let __pausedAll = false;
  const fmtPauseAt = (iso) => { try { let s = String(iso || '').trim().replace(' ', 'T'); if (!s) return ''; if (!/[zZ]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  const paintAjStAuto = () => { try { const el = $('#ajStAuto'); if (!el || __apOn === null || __awOn === null) return; el.textContent = (__apOn && __awOn) ? 'Activado' : (!__apOn && !__awOn) ? 'Desactivado' : 'Parcial'; } catch (e) {} };
  // --- Autopiloto (4 puntos, 2026-10-02) ---
  const btnAp = $('#btnAutopilotToggle');
  if (btnAp) {
    const loadAp = async () => {
      try {
        const r = await api.get('/api/autopilot');
        const on = !!(r && r.enabled);
        __apOn = on; paintAjStAuto();
        btnAp.disabled = false;
        btnAp.textContent = on ? '🟢 Activado' : '⚪ Activar';
        btnAp.classList.toggle('btn-primary', !on);
        const demoOn = !!((typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.demo_mode));
        $('#autopilotStatus').textContent = on
          ? (demoOn
            ? 'Tus posteos salen solos — pero estás en 🧪 modo Demo: por ahora se simulan, no sale nada real hasta que conectes tu Instagram.'
            : 'Tus posteos salen solos. Te aviso 30 min antes de cada uno, por si querés frenarlo.')
          : 'Modo manual: nada se publica sin tu aprobación.';
        $('#autopilotInfo').textContent = on
          ? 'El filtro de calidad chequea cada posteo antes de programarlo: imagen válida, caption con contenido, hashtags y que no sea duplicado.'
          : 'Al activarla, las semanas nuevas se programan solas. Lo ya programado a mano no se toca.';
        // Aviso pre-publicación (30 min): el server lo soporta desde siempre
        // (POST /api/autopilot/pre-notify) pero la UI no lo exponía. En nivel 1
        // es obligatorio (el server lo reporta siempre en true): se muestra
        // activado y bloqueado, con la explicación.
        const btnPn = $('#btnPreNotifyToggle');
        if (btnPn) {
          const pnOn = !!(r && r.pre_notify);
          const pnSt = $('#preNotifyStatus');
          if (((r && r.trust_level) || 0) >= 2) {
            btnPn.disabled = false;
            btnPn.textContent = pnOn ? '🟢 Activado' : '⚪ Activar';
            btnPn.classList.toggle('btn-primary', !pnOn);
            if (pnSt) pnSt.textContent = pnOn ? 'Te aviso 30 min antes de cada publicación automática.' : 'Sin aviso: los posteos automáticos salen directo.';
            btnPn.onclick = async () => {
              btnPn.disabled = true;
              try {
                const rr = await api.post('/api/autopilot/pre-notify', { enabled: !pnOn });
                if (rr && rr.ok) await loadAp(); else alert('No pude cambiarlo 😅');
              } catch (e) { alert('No pude cambiarlo 😅'); }
              btnPn.disabled = false;
            };
          } else {
            btnPn.disabled = true;
            btnPn.textContent = '🟢 Activado';
            if (pnSt) pnSt.textContent = 'En tu nivel el aviso es obligatorio: es tu freno de emergencia antes de cada publicación.';
          }
        }
        // ⏸ Pausar todo (v283): el estado sale de este mismo GET (paused /
        // paused_at / paused_count). Mientras dura la pausa, el estado del
        // autopiloto NO promete "salen solos": dice la verdad.
        __pausedAll = !!r.paused;
        const btnPause = $('#btnPauseAll');
        if (btnPause) {
          btnPause.disabled = false;
          btnPause.textContent = r.paused ? '▶️ Reanudar todo' : '⏸ Pausar todo';
          btnPause.classList.toggle('btn-primary', !!r.paused);
          const pSt = $('#pauseStatus');
          if (pSt) {
            if (r.paused) {
              const f = fmtPauseAt(r.paused_at);
              pSt.textContent = `Todo pausado${f ? ' desde el ' + f : ''} — nada va a salir hasta que reanudes.${r.paused_count ? ` ${r.paused_count} posteo${r.paused_count === 1 ? '' : 's'} en borrador, esperándote.` : ''}`;
            } else pSt.textContent = '';
          }
        }
        if (r.paused) {
          const apSt = $('#autopilotStatus');
          if (apSt) apSt.textContent = '⏸ Todo está pausado: nada va a salir hasta que reanudes.';
          const aws = $('#autoWeekStatus'); if (aws && __awOn) aws.textContent = '⏸ En pausa: tu semana no se arma mientras esté todo pausado.';
        }
      } catch (e) {
        btnAp.textContent = 'Error';
      }
    };
    btnAp.onclick = async () => {
      try {
        const r = await api.get('/api/autopilot');
        const next = !(r && r.enabled);
        btnAp.disabled = true;
        const r2 = await api.post('/api/autopilot', { enabled: next });
        if (r2 && r2.ok) await loadAp();
        else alert('No pude cambiarlo 😅');
      } catch (e) { alert('No pude cambiarlo 😅'); }
      btnAp.disabled = false;
    };
    const btnPauseAll = $('#btnPauseAll');
    if (btnPauseAll) {
      btnPauseAll.onclick = async () => {
        btnPauseAll.disabled = true;
        try {
          const r2 = __pausedAll
            ? await api.post('/api/autopilot/resume-all', {})
            : await api.post('/api/autopilot/pause-all', {});
          if (r2 && r2.ok) await loadAp();
          else alert('No pude cambiarlo 😅');
        } catch (e) { alert('No pude cambiarlo 😅'); }
        btnPauseAll.disabled = false;
      };
    }
    loadAp();
  }
  // --- 🔔 Avisos: carta del domingo + posteos fallidos (v283) ---
  // El aviso antes de publicar lo sigue pintando loadAp (su botón vive ahora
  // en esta tarjeta, con los mismos ids: btnPreNotifyToggle/preNotifyStatus).
  const loadNotifyPrefs = async () => {
    try {
      const r = await api.get('/api/settings/notify-prefs');
      if (!r || !r.ok) return;
      const hint = $('#avisosPushHint');
      if (hint) hint.style.display = r.has_push_sub ? 'none' : '';
      const paintT = (btn, st, on, onText, offText) => {
        if (!btn) return;
        btn.disabled = false;
        btn.textContent = on ? '🟢 Activado' : '⚪ Activar';
        btn.classList.toggle('btn-primary', !on);
        if (st) st.textContent = on ? onText : offText;
      };
      let letterOn = !!r.notify_letter, failOn = !!r.notify_failed;
      const btnL = $('#btnLetterToggle'), btnF = $('#btnFailToggle');
      paintT(btnL, $('#letterNotifyStatus'), letterOn, 'Te aviso el domingo apenas tu carta esté lista.', 'Sin aviso: la carta llega igual — la leés en Tu análisis.');
      paintT(btnF, $('#failNotifyStatus'), failOn, 'Te aviso apenas un posteo no pueda salir.', 'Sin aviso: los fallos los ves al entrar a tu semana.');
      const paintSum = () => {
        try {
          const el = $('#ajStAvisos');
          if (!el) return;
          const n = (r.pre_notify ? 1 : 0) + (letterOn ? 1 : 0) + (failOn ? 1 : 0);
          el.textContent = n === 3 ? 'Todos activos' : n === 0 ? 'Silenciados' : `${n} de 3 activos`;
        } catch (e) {}
      };
      paintSum();
      if (btnL) btnL.onclick = async () => {
        btnL.disabled = true;
        try {
          const r2 = await api.post('/api/settings/notify-prefs', { notify_letter: !letterOn });
          if (r2 && r2.ok) { letterOn = !!r2.notify_letter; paintT(btnL, $('#letterNotifyStatus'), letterOn, 'Te aviso el domingo apenas tu carta esté lista.', 'Sin aviso: la carta llega igual — la leés en Tu análisis.'); paintSum(); }
          else alert('No pude cambiarlo 😅');
        } catch (e) { alert('No pude cambiarlo 😅'); }
        btnL.disabled = false;
      };
      if (btnF) btnF.onclick = async () => {
        btnF.disabled = true;
        try {
          const r2 = await api.post('/api/settings/notify-prefs', { notify_failed: !failOn });
          if (r2 && r2.ok) { failOn = !!r2.notify_failed; paintT(btnF, $('#failNotifyStatus'), failOn, 'Te aviso apenas un posteo no pueda salir.', 'Sin aviso: los fallos los ves al entrar a tu semana.'); paintSum(); }
          else alert('No pude cambiarlo 😅');
        } catch (e) { alert('No pude cambiarlo 😅'); }
        btnF.disabled = false;
      };
    } catch (e) { /* sin prefs: los botones quedan en "Cargando..." solo si el GET falla */ }
  };
  loadNotifyPrefs();
  // --- Mi semana en automático (abrir y listo, 2026-10-03) ---
  const btnAw = $('#btnAutoWeekToggle');
  if (btnAw) {
    const loadAw = async () => {
      try {
        const r = await api.get('/api/settings/auto-week');
        const on = !!(r && r.enabled);
        __awOn = on; paintAjStAuto();
        btnAw.textContent = on ? '🟢 Activado' : '⚪ Activar';
        btnAw.classList.toggle('btn-primary', !on);
        $('#autoWeekStatus').textContent = (__pausedAll && on)
          ? '⏸ En pausa: tu semana no se arma mientras esté todo pausado.'
          : on
          ? 'Tu semana se arma y programa sola ✨'
          : 'Vos armás tu semana a mano.';
      } catch (e) { btnAw.textContent = 'Error'; }
    };
    btnAw.onclick = async () => {
      btnAw.disabled = true;
      try {
        const r = await api.get('/api/settings/auto-week');
        const r2 = await api.post('/api/settings/auto-week', { enabled: !(r && r.enabled) });
        if (r2 && r2.ok) await loadAw();
        else alert('No pude cambiarlo 😅');
      } catch (e) { alert('No pude cambiarlo 😅'); }
      btnAw.disabled = false;
    };
    loadAw();
  }
  const sCat = $('#s_cat');
  if (sCat) sCat.onchange = () => { $('#s_catother_w').style.display = sCat.value === 'otro' ? '' : 'none'; };
  const sDesc = $('#s_desc');
  if (sDesc) sDesc.oninput = () => { $('#s_desc_n').textContent = sDesc.value.length; };
  // --- competidores como chips ---
  let compChips = String((PROFILE && PROFILE.competitors) || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  let compPics = {};
  const compBox = $('#s_chips');
  const renderChips = () => {
    compBox.innerHTML = compChips.map((c, i) => {
      const pic = compPics[c.toLowerCase()];
      const av = pic ? `<img src="${esc(pic)}" class="comp-av" onerror="this.remove()">` : `<span class="comp-av comp-av-fb">📷</span>`;
      return `<span class="comp-chip">${av}${esc(c)}<b data-ci="${i}" style="cursor:pointer;margin-left:6px">×</b></span>`;
    }).join('');
    compBox.querySelectorAll('[data-ci]').forEach(x => x.onclick = () => { compChips.splice(+x.dataset.ci, 1); renderChips(); markDirty(); });
  };
  const fetchPic = async (name) => {
    const k = name.toLowerCase();
    if (compPics[k] !== undefined) return;
    compPics[k] = null;
    try {
      const r = await api.get('/api/ig/avatar?u=' + encodeURIComponent(name));
      if (r && r.pic_url) { compPics[k] = r.pic_url; renderChips(); }
    } catch (e) {}
  };
  const addChip = () => {
    const v = $('#s_compin').value.trim().replace(/^@+/, '');
    const cHint = $('#compHint');
    if (!v) return;
    if (v.includes('@')) {
      if (cHint) { cHint.textContent = 'Eso parece un email — poné el nombre o el usuario de Instagram del competidor.'; cHint.style.display = ''; }
      $('#s_compin').value = '';
      return;
    }
    if (cHint) cHint.style.display = 'none';
    if (compChips.length >= 10) { $('#s_compin').value = ''; return; }
    if (!compChips.some(c => c.toLowerCase() === v.toLowerCase())) { compChips.push(v); fetchPic(v); }
    $('#s_compin').value = ''; renderChips(); markDirty();
  };
  renderChips();
  compChips.forEach(fetchPic);
  $('#s_compin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addChip(); } });
  $('#s_compbox').addEventListener('click', e => { if (e.target.id !== 's_compin') $('#s_compin').focus(); });
  // --- cambios sin guardar ---
  let profDirty = false;
  const dirtyEl = $('#profDirty');
  function markDirty() { if (!profDirty) { profDirty = true; if (dirtyEl) dirtyEl.style.display = ''; } }
  // s_iguser ya no está en esta tarjeta (v282): vive en Conexiones con su
  // propio guardado, por eso no marca "cambios sin guardar" acá.
  ['s_biz', 's_cat', 's_catother', 's_tone', 's_tz', 's_goal', 's_mgoal', 's_desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', markDirty);
    if (el) el.addEventListener('change', markDirty);
  });
  // --- 🚪 Días de cierre (v283): selector Lun–Dom en Tu negocio. El estado
  // vive en profiles.closed_days (JSON de días ISO 1–7) y se guarda con el
  // Guardar único, por la rama parcial de PUT /api/profile. Los motores de
  // slots del servidor no programan posteos automáticos en esos días.
  const closedSel = new Set();
  try {
    const raw = (PROFILE && PROFILE.closed_days) || '';
    const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    if (Array.isArray(arr)) arr.forEach(d => { const n = Number(d); if (Number.isInteger(n) && n >= 1 && n <= 7) closedSel.add(n); });
  } catch (e) {}
  const closedRow = $('#closedDaysRow');
  if (closedRow) {
    const DAYLBL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const paintClosed = () => {
      closedRow.innerHTML = DAYLBL.map((lbl, i) => {
        const d = i + 1, on = closedSel.has(d);
        return `<button type="button" data-day="${d}" style="border:1px solid ${on ? 'var(--cel)' : 'var(--line)'};background:${on ? 'var(--cel)' : '#fff'};color:${on ? '#fff' : 'var(--mut)'};border-radius:999px;padding:7px 13px;font-size:12.5px;font-weight:700;cursor:pointer">${lbl}</button>`;
      }).join('');
      closedRow.querySelectorAll('button[data-day]').forEach(b => { b.onclick = () => { const d = Number(b.dataset.day); if (closedSel.has(d)) closedSel.delete(d); else closedSel.add(d); paintClosed(); markDirty(); }; });
      const hint = $('#closedDaysHint');
      if (hint) hint.textContent = closedSel.size === 0
        ? 'Tocá los días en que tu negocio no abre: Posty no programa posteos esos días.'
        : closedSel.size >= 7
          ? '⚠️ Marcaste todos los días: no se va a programar ningún posteo hasta que desmarques alguno.'
          : 'Los días marcados quedan libres de posteos. Si una semana no tiene días abiertos suficientes, sale con menos posteos.';
    };
    paintClosed();
  }
  $('#btnSaveProfile').onclick = async () => {
    const btnSave = $('#btnSaveProfile');
    if (!$('#s_biz').value.trim()) { $('#profMsg').innerHTML = '<div class="err">Poné el nombre de tu negocio</div>'; return; }
    const catOther = $('#s_catother').value.trim();
    btnSave.disabled = true;
    try {
      await api.put('/api/profile', {
        business_name: $('#s_biz').value, ig_username: ($('#s_iguser') ? $('#s_iguser').value.replace('@', '') : ((PROFILE && PROFILE.ig_username) || '')),
        category: ($('#s_cat').value === 'otro' && catOther) ? catOther.toLowerCase() : $('#s_cat').value,
        tone: $('#s_tone').value, description: $('#s_desc').value,
        competitors: compChips.join(', '), goal: $('#s_goal').value,
        monthly_goal: $('#s_mgoal') ? $('#s_mgoal').value : '',
        closed_days: [...closedSel].sort((a, b) => a - b),
      });
      await api.put('/api/settings', { timezone: $('#s_tz').value });
      // Guardado único (v282): el ADN se guarda en la misma pasada — ya no
      // hay un segundo botón "Guardar datos del negocio".
      await saveDnaNow();
      $('#profMsg').innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Guardado — negocio y datos de la IA</span>';
      profDirty = false; if (dirtyEl) dirtyEl.style.display = 'none';
      PROFILE = await api.get('/api/profile');
      SETTINGS = await api.get('/api/settings');
    } catch (e) {
      $('#profMsg').innerHTML = `<span style="color:#B3402E;font-size:12.5px">${esc((e && e.message) || 'No se pudo guardar')}</span>`;
    }
    btnSave.disabled = false;
  };
  // --- ADN del negocio (GET/PUT /api/dna): listas simples, sin fricción ---
  const dnaEls = { productos: $('#s_dna_productos'), promos: $('#s_dna_promos'), horarios: $('#s_dna_horarios'), ubicacion: $('#s_dna_ubicacion') };
  const splitNamePrice = (line) => {
    const m = String(line || '').match(/^(.*?)\s+[—–-]\s+(.*)$/);
    if (!m) return { nombre: String(line || '').trim(), precio: '' };
    return { nombre: m[1].trim(), precio: m[2].trim() };
  };
  const dnaArrLine = (it) => {
    if (typeof it === 'string') return it;
    const a = (it.nombre || it.titulo || '').trim();
    const b = (it.precio || it.detalle || '').trim();
    return b ? `${a} — ${b}` : a;
  };
  const paintDna = (dna) => {
    const d = dna || {};
    if (dnaEls.productos) dnaEls.productos.value = (Array.isArray(d.productos) ? d.productos : []).map(dnaArrLine).filter(Boolean).join('\n');
    if (dnaEls.promos) dnaEls.promos.value = (Array.isArray(d.promos_activas) ? d.promos_activas : []).map(dnaArrLine).filter(Boolean).join('\n');
    if (dnaEls.horarios) dnaEls.horarios.value = d.horarios || '';
    if (dnaEls.ubicacion) dnaEls.ubicacion.value = d.ubicacion || '';
    paintSrcChips(d);
  };
  // --- chips de fuente por bloque (Expertos en información): dna.fuentes = { campo: 'etiqueta' } ---
  // Si un campo no tiene fuente registrada, se muestra sin chip (defensivo).
  const DNA_SRC_STYLE = 'font-size:10px;font-weight:700;background:#E7F4FB;color:#166E9C;border-radius:999px;padding:2px 9px;white-space:nowrap';
  const dnaSrcChip = (fuentes, field) => {
    const t = (fuentes && typeof fuentes === 'object' && fuentes[field]) || '';
    return t ? `<span style="${DNA_SRC_STYLE}">${esc(String(t))}</span>` : '';
  };
  const paintSrcChips = (dna) => {
    const d = dna || {};
    for (const f of ['productos', 'promos_activas', 'horarios', 'ubicacion']) {
      const el = document.getElementById('dnaChip_' + f);
      if (el) el.innerHTML = dnaSrcChip(d.fuentes, f);
    }
  };
  // --- datos de la web dentro del ADN: read-only, con etiqueta "de tu web" ---
  const webDnaZone = $('#webDnaZone');
  const webArrOf = (v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return v.filter(x => x && String(typeof x === 'string' ? x : (x.nombre || x.titulo || '')).trim());
    return [v];
  };
  const paintWebDna = (dna) => {
    if (!webDnaZone) return;
    const d = dna || {};
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    const w = isObj(d.website) ? d.website : (isObj(d.web_data) ? d.web_data : {});
    const prods = webArrOf(w.productos || d.website_productos || d.web_productos);
    const precios = webArrOf(w.precios || d.website_precios || d.web_precios);
    const promos = webArrOf(w.promos || d.website_promos || d.web_promos);
    const groups = [['🛍️ Productos', prods], ['💲 Precios', precios], ['🎉 Promos', promos]].filter(([, a]) => a.length);
    if (!groups.length) { webDnaZone.innerHTML = ''; return; }
    const tag = '<span style="font-size:10px;font-weight:700;background:#E7F4FB;color:#166E9C;border-radius:999px;padding:2px 9px;white-space:nowrap">🌐 de tu web</span>';
    webDnaZone.innerHTML = `
      <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:16px">
        <div style="font-weight:800;font-size:12.5px;margin-bottom:10px">🌐 Lo que encontramos en tu web</div>
        ${groups.map(([t, arr]) => `
          <div class="field" style="margin-bottom:10px"><label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${t} ${tag}</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${arr.map(it => `<span class="comp-chip">${esc(dnaArrLine(it))}</span>`).join('')}</div>
          </div>`).join('')}
        <div class="hint">Se actualiza solo cuando volvés a analizar tu web en "🧠 Lo que Posty sabe de tu negocio".</div>
      </div>`;
  };
  const refreshWebDna = () => { api.get('/api/dna').then(r => paintWebDna(r && r.dna)).catch(() => {}); };
  // --- 📚 Datos de otras fuentes: bloques de solo lectura con su chip de fuente ---
  // Cada track (comentarios IG, Facebook, Google, MercadoLibre, historias) guarda sus campos
  // en el ADN con su etiqueta en dna.fuentes. Campos nuevos de otros tracks que todavía no
  // existan se cablean defensivo (título generado desde el nombre del campo).
  const DNA_INFO_BLOCKS = [
    ['producto_estrella', '⭐ Producto estrella'], ['cliente_ideal', '🎯 Cliente ideal'],
    ['diferencial', '✨ Diferencial'], ['servicios', '🛠️ Servicios'], ['promos', '🎉 Promos'],
    ['precio_rango', '💲 Rango de precios'], ['preguntas_frecuentes', '❓ Preguntas frecuentes'],
    ['objeciones', '🚧 Objeciones'], ['deseos', '💭 Deseos de tus clientes'],
    ['testimonios', '💬 Testimonios'], ['puntos_fuertes', '💪 Puntos fuertes'],
    ['descripcion_fb', '📘 Descripción de Facebook'], ['reviews_fb', '📘 Reviews de Facebook'],
    ['anuncios', '📣 Anuncios'], ['tono_ejemplos', '🗣️ Frases del dueño'],
  ];
  // Campos que ya tienen UI propia en esta tarjeta o no son mostrables.
  const DNA_INFO_SKIP = new Set(['fuentes', 'productos', 'promos_activas', 'horarios', 'ubicacion',
    'website', 'web_data', 'inspo', 'tono', 'series', 'paused_tipos', 'paused_series',
    'website_url', 'website_analyzed_at', 'website_partial', 'resumen']);
  const dnaHas = (v) => {
    if (v == null) return false;
    if (typeof v === 'string') return !!v.trim();
    if (Array.isArray(v)) return v.some(x => x && (typeof x === 'string' ? x.trim() : String(x.nombre || x.titulo || x.pregunta || x.texto || '').trim()));
    return true;
  };
  const dnaInfoLine = (it) => {
    if (it && typeof it === 'object') {
      const q = String(it.pregunta || '').trim();
      const a = String(it.respuesta || '').trim();
      if (q) return `<div style="margin:6px 0"><div style="font-weight:700;font-size:12.5px">❓ ${esc(q)}</div>${a ? `<div style="color:var(--mut);font-size:11.5px">💬 ${esc(a)}</div>` : ''}</div>`;
    }
    return `<span class="comp-chip">${esc(dnaArrLine(it))}</span>`;
  };
  const paintFuentesDna = (dna) => {
    const zone = $('#dnaFuentesZone');
    if (!zone) return;
    const d = dna || {};
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    const fuentes = isObj(d.fuentes) ? d.fuentes : {};
    const known = new Set(DNA_INFO_BLOCKS.map(([f]) => f));
    const blocks = [];
    for (const [field, title] of DNA_INFO_BLOCKS) {
      if (dnaHas(d[field])) blocks.push([field, title, d[field]]);
    }
    for (const field of Object.keys(fuentes)) {
      if (known.has(field) || DNA_INFO_SKIP.has(field) || !dnaHas(d[field])) continue;
      const title = '🧩 ' + field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      blocks.push([field, title, d[field]]);
    }
    if (!blocks.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = `
      <div style="border-top:1px solid var(--line);padding-top:14px;margin-top:16px">
        <div style="font-weight:800;font-size:12.5px;margin-bottom:10px">📚 Datos de otras fuentes</div>
        ${blocks.map(([field, title, v]) => `
          <div class="field" style="margin-bottom:10px">
            <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${esc(title)} ${dnaSrcChip(fuentes, field)}</label>
            <div style="margin-top:6px">${Array.isArray(v)
              ? v.slice(0, 6).map(dnaInfoLine).join('') + (v.length > 6 ? `<div class="hint">…y ${v.length - 6} más</div>` : '')
              : `<div style="font-size:12.5px">${esc(String(v))}</div>`}</div>
          </div>`).join('')}
        <div class="hint">La IA usa estos datos para crear posteos que venden de verdad.</div>
      </div>`;
  };
  // Guardado del ADN (v282): lo invoca el botón Guardar único de la tarjeta
  // (btnSaveProfile) — el ADN ya no tiene botón propio.
  async function saveDnaNow() {
    if (!dnaEls.productos) return;
    const productos = dnaEls.productos.value.split('\n').map(splitNamePrice).filter(p => p.nombre).map(p => ({ nombre: p.nombre, precio: p.precio }));
    const promos_activas = dnaEls.promos.value.split('\n').map(l => { const s = splitNamePrice(l); return s.nombre ? { titulo: s.nombre, detalle: s.precio } : null; }).filter(Boolean);
    const r = await api.put('/api/dna', {
      productos, promos_activas,
      horarios: dnaEls.horarios.value.trim(),
      ubicacion: dnaEls.ubicacion.value.trim(),
    });
    paintDna(r && r.dna);
  }
  if (dnaEls.productos) {
    api.get('/api/dna').then(r => { paintDna(r && r.dna); paintWebDna(r && r.dna); paintFuentesDna(r && r.dna); }).catch(() => {});
    // Los campos del ADN marcan "cambios sin guardar" como el resto del form.
    [dnaEls.productos, dnaEls.promos, dnaEls.horarios, dnaEls.ubicacion].forEach(el => {
      if (el) { el.addEventListener('input', markDirty); el.addEventListener('change', markDirty); }
    });
  }
  // --- 🌐 La web de tu negocio (GET /api/website/status · POST /api/website/analyze) ---
  let webStatus = null;
  const webZone = $('#webZone');
  const fmtWebAt = (at) => {
    try {
      let s = String(at || '').trim().replace(' ', 'T');
      if (!s) return '';
      if (!/[zZ]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'; // datetimes de SQLite vienen en UTC
      const d = new Date(s);
      if (isNaN(d)) return String(at);
      return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return String(at || ''); }
  };
  const normWebUrl = (u) => {
    let s = String(u || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
  };
  // --- 🧠 Lo que Posty sabe de tu negocio: 5 fuentes en filas compactas ---
  // Fila compacta: icono + nombre/estado + acción. El input va a full-width (src-full).
  const srcRow = (ico, name, state, actHtml, fullHtml) => `
    <div class="src-ico">${ico}</div>
    <div class="src-tx"><b>${name}</b><small>${state}</small></div>
    ${actHtml ? `<div class="src-act">${actHtml}</div>` : ''}
    ${fullHtml ? `<div class="src-full">${fullHtml}</div>` : ''}`;
  const srcRetryBtn = (id, title) => `<button class="src-re" id="${id}" title="${title}" aria-label="${title}">↻</button>`;
  const paintWebZone = (st, errMsg) => {
    if (st) webStatus = st;
    if (!webZone) return;
    if (!webStatus) {
      webZone.innerHTML = srcRow('🌐', 'Tu web', '⚠️ no se pudo cargar', srcRetryBtn('btnWebRetry', 'Reintentar'));
      const br = $('#btnWebRetry');
      if (br) br.onclick = () => api.get('/api/website/status').then(s2 => paintWebZone(s2)).catch(() => paintWebZone(null));
      return;
    }
    if (errMsg) {
      webZone.innerHTML = srcRow('🌐', 'Tu web', `⚠️ ${esc(errMsg)}`, srcRetryBtn('btnWebRe', 'Reintentar'));
      const b = $('#btnWebRe');
      if (b) b.onclick = () => runWebAnalyze({ force: true });
      return;
    }
    if (webStatus.ok) {
      webZone.innerHTML = srcRow('🌐', 'Tu web', `✅ al día · ${esc(fmtWebAt(webStatus.analyzed_at))}${webStatus.partial ? ' (parcial)' : ''}`, srcRetryBtn('btnWebRe', 'Analizar de nuevo'));
      const b = $('#btnWebRe');
      if (b) b.onclick = () => runWebAnalyze({ force: true });
    } else {
      const det = String(webStatus.url || '').trim();
      webZone.innerHTML = srcRow('🌐', 'Tu web', det ? '⚪ la detecté en tu bio 👇' : '⚪ pegá tu link y la estudio', '',
        `<input id="s_weburl" value="${esc(det)}" placeholder="https://tuweb.com" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="btn btn-primary btn-sm" id="btnWebGo">Analizar</button>`);
      const b = $('#btnWebGo');
      if (b) b.onclick = () => {
        const u = normWebUrl(($('#s_weburl') || {}).value);
        if (!u) { toast('Pegá la URL de tu web'); return; }
        runWebAnalyze({ url: u });
      };
    }
  };
  const runWebAnalyze = async (body) => {
    if (!webZone) return;
    webZone.innerHTML = srcRow('🌐', 'Tu web', '⏳ analizando…', '');
    try {
      await api.post('/api/website/analyze', body, { timeout: 240000 });
      try { webStatus = await api.get('/api/website/status'); } catch (e) { /* queda el anterior */ }
      paintWebZone(webStatus);
      refreshWebDna();
      toast('✅ <b>Ya estudiamos tu web.</b><br>Los datos quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintWebZone(webStatus, (e && e.message) || 'No se pudo analizar tu web');
    }
  };
  if (webZone) {
    api.get('/api/website/status').then(st => paintWebZone(st)).catch(() => paintWebZone(null));
    // refresco invocable desde el auto-análisis post-OAuth (?ig=ok)
    PZ_WEB_REFRESH = () => {
      api.get('/api/website/status').then(st => paintWebZone(st)).catch(() => {});
      refreshWebDna();
    };
  }
  // --- 📱 Tus historias recientes (GET /api/ig/stories-status · POST /api/ig/mine-stories) ---
  // Lee las historias de las últimas 24h y la IA saca promos y anuncios del texto visible.
  // Solo lee: nunca publica nada. Ojo: Instagram no da el archivo, solo las últimas 24h.
  let storiesStatus = null;
  const storiesZone = $('#storiesZone');
  const paintStoriesZone = (st, errMsg) => {
    if (st) storiesStatus = st;
    if (!storiesZone) return;
    if (!storiesStatus) {
      storiesZone.innerHTML = srcRow('📱', 'Historias', '⚠️ no se pudo cargar', srcRetryBtn('btnStoriesRetry', 'Reintentar'));
      const br = $('#btnStoriesRetry');
      if (br) br.onclick = () => api.get('/api/ig/stories-status').then(s2 => paintStoriesZone(s2)).catch(() => paintStoriesZone(null));
      return;
    }
    if (errMsg) {
      storiesZone.innerHTML = srcRow('📱', 'Historias', `⚠️ ${esc(errMsg)}`, srcRetryBtn('btnStoriesGo', 'Reintentar'));
      const b = $('#btnStoriesGo');
      if (b) b.onclick = runStoriesAnalyze;
      return;
    }
    if (storiesStatus.ok) {
      storiesZone.innerHTML = srcRow('📱', 'Historias', `✅ al día · ${esc(fmtWebAt(storiesStatus.analyzed_at))}`, srcRetryBtn('btnStoriesGo', 'Analizar de nuevo'));
      const b = $('#btnStoriesGo');
      if (b) b.onclick = runStoriesAnalyze;
    } else {
      storiesZone.innerHTML = srcRow('📱', 'Historias', '⚪ leo tus promos y anuncios', `<button class="btn btn-primary btn-sm" id="btnStoriesGo">Analizar</button>`);
      const b = $('#btnStoriesGo');
      if (b) b.onclick = runStoriesAnalyze;
    }
  };
  const runStoriesAnalyze = async () => {
    if (!storiesZone) return;
    storiesZone.innerHTML = srcRow('📱', 'Historias', '⏳ analizando…', '');
    try {
      await api.post('/api/ig/mine-stories', {}, { timeout: 240000 });
      try { storiesStatus = await api.get('/api/ig/stories-status'); } catch (e) { /* queda el anterior */ }
      paintStoriesZone(storiesStatus);
      refreshWebDna();
      toast('✅ <b>Ya leímos tus historias.</b><br>Los datos quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintStoriesZone(storiesStatus, (e && e.message) || 'No se pudieron analizar tus historias');
    }
  };
  if (storiesZone) {
    api.get('/api/ig/stories-status').then(st => paintStoriesZone(st)).catch(() => paintStoriesZone(null));
  }
  // --- 💬 Lo que preguntan tus seguidores (GET /api/ig/comments-status · POST /api/ig/mine-comments) ---
  // Lee los últimos ~20 posteos + comentarios y la IA saca preguntas frecuentes, objeciones y deseos.
  // Solo lee: nunca publica ni comenta nada. Conectá IG para usarlo.
  let srcCommentsStatus = null;
  const srcCommentsCard = $('#srcCommentsCard');
  const fmtSrcAt = (at) => {
    try {
      let s = String(at || '').trim().replace(' ', 'T');
      if (!s) return '';
      if (!/[zZ]$/.test(s) && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
      const d = new Date(s);
      if (isNaN(d)) return String(at);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return String(at || ''); }
  };
  const paintSrcComments = (st, errMsg) => {
    if (st) srcCommentsStatus = st;
    if (!srcCommentsCard) return;
    if (!srcCommentsStatus) {
      srcCommentsCard.innerHTML = srcRow('💬', 'Comentarios', '⚠️ no se pudo cargar', srcRetryBtn('btnSrcCommentsRetry', 'Reintentar'));
      const br = $('#btnSrcCommentsRetry');
      if (br) br.onclick = () => api.get('/api/ig/comments-status').then(s2 => paintSrcComments(s2)).catch(() => paintSrcComments(null));
      return;
    }
    if (errMsg) {
      srcCommentsCard.innerHTML = srcRow('💬', 'Comentarios', `⚠️ ${esc(errMsg)}`, srcRetryBtn('btnSrcCommentsGo', 'Reintentar'));
      const b = $('#btnSrcCommentsGo');
      if (b) b.onclick = () => runCommentsMine({});
      return;
    }
    if (srcCommentsStatus.ok) {
      const c = srcCommentsStatus.counts || {};
      const n = Number(c.comments || 0);
      srcCommentsCard.innerHTML = srcRow('💬', 'Comentarios', `✅ ${n} comentarios · ${esc(fmtSrcAt(srcCommentsStatus.analyzed_at))}`, srcRetryBtn('btnSrcCommentsRe', 'Analizar de nuevo'));
      const b = $('#btnSrcCommentsRe');
      if (b) b.onclick = () => runCommentsMine({ force: true });
    } else {
      srcCommentsCard.innerHTML = srcRow('💬', 'Comentarios', '⚪ descubro qué te preguntan', `<button class="btn btn-primary btn-sm" id="btnSrcCommentsGo">Analizar</button>`);
      const b = $('#btnSrcCommentsGo');
      if (b) b.onclick = () => runCommentsMine({});
    }
  };
  const runCommentsMine = async (body) => {
    if (!srcCommentsCard) return;
    srcCommentsCard.innerHTML = srcRow('💬', 'Comentarios', '⏳ analizando…', '');
    try {
      await api.post('/api/ig/mine-comments', body, { timeout: 240000 });
      try { srcCommentsStatus = await api.get('/api/ig/comments-status'); } catch (e) { /* queda el anterior */ }
      paintSrcComments(srcCommentsStatus);
      toast('✅ <b>Ya analizamos tus comentarios.</b><br>La IA ahora sabe qué te preguntan tus seguidores.');
    } catch (e) {
      paintSrcComments(srcCommentsStatus, (e && e.message) || 'No se pudieron analizar los comentarios');
    }
  };
  if (srcCommentsCard) {
    api.get('/api/ig/comments-status').then(st => paintSrcComments(st)).catch(() => paintSrcComments(null));
  }
  // --- ⭐ Lo que dicen tus clientes (GET /api/places/status · POST /api/places/analyze) ---
  let placesStatus = null;
  const placesZone = $('#placesZone');
  const paintPlacesZone = (st, errMsg) => {
    if (st) placesStatus = st;
    if (!placesZone) return;
    if (!placesStatus) {
      placesZone.innerHTML = srcRow('⭐', 'Reseñas', '⚠️ no se pudo cargar', srcRetryBtn('btnPlacesRetry', 'Reintentar'));
      const br = $('#btnPlacesRetry');
      if (br) br.onclick = () => api.get('/api/places/status').then(s2 => paintPlacesZone(s2)).catch(() => paintPlacesZone(null));
      return;
    }
    // Sin key: una línea, la clave se pide por chat.
    if (!placesStatus.has_key) {
      placesZone.innerHTML = srcRow('⭐', 'Reseñas', '⚪ falta', '', `<span class="hint">Pedime la clave de Google Places en el chat y la activo por vos.</span>`);
      return;
    }
    if (errMsg) {
      placesZone.innerHTML = srcRow('⭐', 'Reseñas', `⚠️ ${esc(errMsg)}`, srcRetryBtn('btnPlacesGo', 'Reintentar'));
      const b = $('#btnPlacesGo');
      if (b) b.onclick = () => runPlacesAnalyze({});
      return;
    }
    if (placesStatus.ok) {
      const rating = placesStatus.rating ? ` · ★ ${esc(String(placesStatus.rating))}` : '';
      placesZone.innerHTML = srcRow('⭐', 'Reseñas', `✅ al día · ${esc(fmtWebAt(placesStatus.analyzed_at))}${rating}`, srcRetryBtn('btnPlacesRe', 'Buscar de nuevo'));
      const b = $('#btnPlacesRe');
      if (b) b.onclick = () => runPlacesAnalyze({ force: true });
    } else {
      placesZone.innerHTML = srcRow('⭐', 'Reseñas', '⚪ busco tu negocio en Google', '',
        `<input id="s_placesq" placeholder="Ej: Pizzería Lo de Juan" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="btn btn-primary btn-sm" id="btnPlacesGo">Buscar</button>`);
      const b = $('#btnPlacesGo');
      if (b) b.onclick = () => runPlacesAnalyze({ query: (($('#s_placesq') || {}).value || '').trim() });
    }
  };
  const runPlacesAnalyze = async (body) => {
    if (!placesZone) return;
    placesZone.innerHTML = srcRow('⭐', 'Reseñas', '⏳ buscando…', '');
    try {
      await api.post('/api/places/analyze', body, { timeout: 240000 });
      try { placesStatus = await api.get('/api/places/status'); } catch (e) { /* queda el anterior */ }
      paintPlacesZone(placesStatus);
      toast('✅ <b>Ya leímos tus reseñas.</b><br>Los testimonios quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintPlacesZone(placesStatus, (e && e.message) || 'No se pudo buscar tu negocio');
    }
  };
  if (placesZone) {
    api.get('/api/places/status').then(st => paintPlacesZone(st)).catch(() => paintPlacesZone(null));
  }
  // --- 📘 Tu página de Facebook (GET /api/fb/status · POST /api/fb/analyze) ---
  let fbStatus = null;
  const fbZone = $('#fbZone');
  const paintFbZone = (st, errMsg) => {
    if (st) fbStatus = st;
    if (!fbZone) return;
    if (!fbStatus) {
      fbZone.innerHTML = srcRow('📘', 'Facebook', '⚠️ no se pudo cargar', srcRetryBtn('btnFbRetry', 'Reintentar'));
      const br = $('#btnFbRetry');
      if (br) br.onclick = () => api.get('/api/fb/status').then(s2 => paintFbZone(s2)).catch(() => paintFbZone(null));
      return;
    }
    if (errMsg) {
      fbZone.innerHTML = srcRow('📘', 'Facebook', `⚠️ ${esc(errMsg)}`, srcRetryBtn('btnFbGo', 'Reintentar'));
      const b = $('#btnFbGo');
      if (b) b.onclick = () => runFbAnalyze({});
      return;
    }
    if (fbStatus.ok) {
      fbZone.innerHTML = srcRow('📘', 'Facebook', `✅ al día · ${esc(fmtWebAt(fbStatus.analyzed_at))}${fbStatus.partial ? ' (parcial)' : ''}`, srcRetryBtn('btnFbRe', 'Analizar de nuevo'));
      const b = $('#btnFbRe');
      if (b) b.onclick = () => runFbAnalyze({ force: true });
    } else {
      fbZone.innerHTML = srcRow('📘', 'Facebook', '⚪ la estudio: horarios, ubicación y opiniones', '',
        `<input id="s_fbpage" placeholder="facebook.com/tu-negocio" inputmode="url" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="btn btn-primary btn-sm" id="btnFbGo">Analizar</button>`);
      const b = $('#btnFbGo');
      if (b) b.onclick = () => runFbAnalyze({ page: (($('#s_fbpage') || {}).value || '').trim() });
    }
  };
  const runFbAnalyze = async (body) => {
    if (!fbZone) return;
    fbZone.innerHTML = srcRow('📘', 'Facebook', '⏳ analizando…', '');
    try {
      await api.post('/api/fb/analyze', body, { timeout: 120000 });
      try { fbStatus = await api.get('/api/fb/status'); } catch (e) { /* queda el anterior */ }
      paintFbZone(fbStatus);
      refreshWebDna();
      toast('✅ <b>Ya estudiamos tu página de Facebook.</b><br>Los datos quedaron en "🧬 Lo que la IA sabe".');
    } catch (e) {
      paintFbZone(fbStatus, (e && e.message) || 'No se pudo analizar tu página');
    }
  };
  if (fbZone) {
    api.get('/api/fb/status').then(st => paintFbZone(st)).catch(() => paintFbZone(null));
  }
  // --- ⭐ Niveles de Posty (GET /api/posty/level) ---
  // Píldora "Nivel X" en el header de la tarjeta + barra de progreso + quests de 1 tap.
  // Si leveled_up: el backend ya guardó el mensaje de festejo en el chat; el frontend
  // SOLO muestra toast + postyConfetti (nunca chatSay: duplicaría el mensaje).
  const lvlPill = $('#lvlPill'), lvlPillNum = $('#lvlPillNum'), lvlPillName = $('#lvlPillName'), lvlBlock = $('#lvlBlock');
  const paintLevel = (lv) => {
    if (!lv || !lv.ok) { // backend sin /api/posty/level (o error): la tarjeta queda como estaba
      if (lvlPill) lvlPill.style.display = 'none';
      if (lvlBlock) lvlBlock.style.display = 'none';
      return;
    }
    const n = Math.max(1, Math.min(5, +lv.level || 1));
    if (lvlPill) {
      lvlPill.style.display = '';
      if (lvlPillNum) lvlPillNum.textContent = 'Nivel ' + n;
      if (lvlPillName) lvlPillName.textContent = String(lv.level_name || '');
    }
    if (lvlBlock) {
      lvlBlock.style.display = '';
      const pct = Math.max(0, Math.min(100, Math.round(+lv.progress_pct || 0)));
      const quests = Array.isArray(lv.next_missing) ? lv.next_missing : [];
      let html = `<div class="lvl-top"><span class="lvl-pct">${pct}%</span><div class="lvl-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div></div>`;
      if (!quests.length) {
        html += `<div class="lvl-done">Posty te conoce al 100% 🧠✨</div>`;
      } else {
        html += `<div class="lvl-qh">Para ${n < 5 ? 'el nivel ' + (n + 1) : 'completar el nivel máximo'} te falta:</div><div class="lvl-quests">` +
          quests.map(q => `<a class="lvl-quest" href="${esc(String(q.action || '#/app/ajustes'))}"><span>${esc(String(q.label || 'Completar'))}</span><b>→</b></a>`).join('') +
          `</div>`;
      }
      lvlBlock.innerHTML = html;
    }
    if (lv.leveled_up) { // una sola vez por nivel: el backend lo garantiza, el frontend no re-dispara
      try {
        toast('🎉 <b>¡Nivel ' + n + '!</b> ' + esc(String(lv.level_message || 'Posty te conoce cada vez mejor.')));
        postyCelebrate(); // confetti + coreografía de malabares
      } catch (e) {}
    }
  };
  const refreshLevel = () => { if (lvlPill) api.get('/api/posty/level').then(paintLevel).catch(() => paintLevel(null)); };
  PZ_LEVEL_REFRESH = refreshLevel; // enganche barato para otras acciones (logo/fotos, 👍/👎) si el parent lo conecta
  refreshLevel();
  const bOnb = $('#btnOnb');
  if (bOnb) bOnb.onclick = () => { OB = loadOB() || freshOB(); location.hash = '#/app/onboarding'; };
  const bPrev = $('#btnPreview');
  if (bPrev) bPrev.onclick = openPreview;
  function openPreview() {
    const catV = $('#s_cat').value;
    const catE = CATS.find(c => c[0] === catV) || ['otro', '🏷️', 'Otro'];
    const catTxt = catV === 'otro' ? ($('#s_catother').value.trim() || 'Otro') : catE[2];
    const toneE = TONES.find(t => t[0] === $('#s_tone').value) || ['', '🎭', '—'];
    const goalE = GOALS.find(g => g[0] === $('#s_goal').value) || ['', '🎯', '—', ''];
    const tzE = TIMEZONES.find(z => z[0] === $('#s_tz').value) || [];
    const biz = $('#s_biz').value.trim();
    const igu = (((($('#s_iguser') || {}).value) || (PROFILE && PROFILE.ig_username) || '')).trim().replace(/^@+/, '');
    const desc = $('#s_desc').value.trim();
    const row = (ico, lbl, val) => `<div class="pv-row"><span class="pv-ico">${ico}</span><div><div class="pv-lbl">${lbl}</div><div class="pv-val">${val}</div></div></div>`;
    const chips = compChips.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">` + compChips.map(c => {
          const pic = compPics[c.toLowerCase()];
          const av = pic ? `<img src="${esc(pic)}" class="comp-av" onerror="this.remove()">` : '';
          return `<span class="comp-chip">${av}${esc(c)}</span>`;
        }).join('') + `</div>`
      : `<span class="pv-warn">Todavía no sumaste competidores.</span>`;
    const tips = [];
    if (!desc) tips.push('una descripción de tu negocio');
    if (!compChips.length) tips.push('al menos un competidor');
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `
      <div class="modal-card" style="max-width:440px" role="dialog" aria-modal="true">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
          <h3 style="margin:0">🤖 Cómo me ve la IA</h3>
          <button class="btn btn-ghost btn-sm" id="pvX">✕</button>
        </div>
        <p style="color:var(--mut);font-size:11.5px;margin:0 0 8px">Con estos datos creamos tus ideas y posteos:</p>
        ${row('🏪', 'Negocio', esc(biz) || '<span class="pv-warn">Falta el nombre</span>')}
        ${row('📸', 'Instagram', igu ? '@' + esc(igu) : '<span class="pv-warn">Sin usuario</span>')}
        ${row(catE[1], 'Rubro', esc(catTxt))}
        ${row(toneE[1], 'Tono de la IA', esc(toneE[2]))}
        ${row(goalE[1], 'Objetivo', esc(goalE[2]) + (goalE[3] ? `<br><span style="font-weight:400;color:var(--mut);font-size:11.5px">${esc(goalE[3])}</span>` : ''))}
        ${row('🕐', 'Zona horaria', esc(tzE[1] || '—'))}
        ${row('📝', 'Descripción', desc ? esc(desc.length > 160 ? desc.slice(0, 160) + '…' : desc) : '<span class="pv-warn">Sin descripción.</span>')}
        ${row('⚔️', 'Competidores', chips)}
        ${tips.length ? `<div class="pv-tip">💡 <b>Tip:</b> sumá ${tips.join(' y ')} para ideas mucho mejores.</div>` : `<div class="pv-tip">✅ <b>Perfil completo:</b> la IA tiene todo lo que necesita.</div>`}
        <button class="btn btn-primary btn-block" id="pvOk" style="margin-top:12px">Entendido</button>
      </div>`;
    document.body.appendChild(ov);
    const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('#pvX').onclick = close;
    ov.querySelector('#pvOk').onclick = close;
  }
  // ⭐ Los Primeros 200 (growth ola 2): distintivo de fundador + captura del
  // permiso de aparición pública. Vive en Mi plan (la superficie post-pago) y
  // solo aparece para cuentas pagas con número de fundador asignado.
  (async () => {
    const z = $('#founderZone');
    if (!z) return;
    const en = typeof ME !== 'undefined' && ME && ME.lang === 'en';
    const n = (typeof ME !== 'undefined' && ME && ME.founder_number) || 0;
    if (!n) return;
    const pub = !!(ME && ME.founder_public);
    z.innerHTML = `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:16px">
      <div style="font-size:15px;font-weight:800">⭐ ${en ? 'Founder' : 'Fundador'} #${n} ${en ? 'of The First 200' : 'de Los Primeros 200'}</div>
      <p style="color:var(--mut);font-size:13px;line-height:1.55;margin:6px 0 10px">${en ? 'Your spot in the founding cohort is yours. Do you want your business on the public founders page, with its name, trade and city?' : 'Tu lugar en la cohorte fundadora ya es tuyo. ¿Te sumás a la página de fundadores con el nombre de tu negocio, su rubro y su ciudad?'}</p>
      <label style="display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:700;cursor:pointer"><input type="checkbox" id="founderPub" ${pub ? 'checked' : ''} style="width:18px;height:18px"> ${en ? 'Yes, list my business' : 'Sí, sumame a la página'}</label>
      <div id="founderPubMsg" style="font-size:12px;color:var(--dim);margin-top:6px"></div>
      <a href="${en ? '/en/founders' : '/fundadores'}" target="_blank" rel="noopener" style="font-size:12.5px;font-weight:700;color:var(--cel)">${en ? 'See the founders page →' : 'Ver la página de fundadores →'}</a>
    </div>`;
    const cb = document.getElementById('founderPub');
    if (cb) cb.onchange = async () => {
      const msg = document.getElementById('founderPubMsg');
      try {
        const r = await api.put('/api/founders/consent', { public: cb.checked });
        if (typeof ME !== 'undefined' && ME) ME.founder_public = !!(r && r.founder_public);
        if (msg) msg.textContent = cb.checked ? (en ? 'Done! You are on the page 💙' : '¡Listo! Ya estás en la página 💙') : (en ? 'Removed from the public page.' : 'Te saqué de la página pública.');
      } catch (e) { cb.checked = !cb.checked; if (msg) msg.textContent = en ? 'Could not save — try again.' : 'No se pudo guardar — probá de nuevo.'; }
    };
  })();
  // Mi plan
  (async () => {
    const z = $('#planZone');
    if (!z) return;
    // Carga de planes con reintento: es la pantalla de pago, no puede fallar en silencio.
    const loadPlans = async () => {
      let lastErr = null;
      for (let i = 0; i < 2; i++) {
        try { return await api.get('/api/billing/plans' + ((typeof ME !== 'undefined' && ME && ME.lang === 'en') ? '?country=US' : '')); }
        catch (e) { lastErr = e; console.error('[planes] intento ' + (i + 1) + ':', e.message); }
      }
      throw lastErr;
    };
    const showPlansError = (err) => {
      const detail = err && err.message ? `<br><small style="opacity:.65;font-size:11px">Motivo: ${esc(String(err.message)).slice(0, 160)}</small>` : '';
      z.innerHTML = `<div class="err">No se pudieron cargar los planes. Revisá tu conexión.${detail}<br><button class="btn btn-soft btn-sm" id="plansRetry" style="margin-top:8px">🔄 Reintentar</button></div>`;
      const rb = document.getElementById('plansRetry');
      if (rb) rb.onclick = () => { z.innerHTML = '<p style="color:var(--dim)">Cargando...</p>'; run(); };
    };
    const run = async () => {
    try {
      // IS_NATIVE (tiendas): sin ventas — solo nombre del plan y estado. Sin precios, sin botones, sin links de pago.
      if (IS_NATIVE) {
        let planName = (ME && ME.plan) || 'esencial';
        try {
          const d = await loadPlans();
          const p = (d.plans || []).find(x => x.id === planName) || (d.plans || [])[0];
          if (p && p.name) planName = p.name;
        } catch (e) {}
        const hasActive = ME && !ME.is_trial && ME.plan_status === 'active';
        const trialLeft = (ME && ME.trial_days_left) || 0;
        let estado = 'Activo';
        if (!hasActive) {
          if (ME && ME.plan_status === 'cancelled') estado = 'Cancelado';
          else if (ME && ME.trial_expired) estado = 'Tu prueba terminó.';
          else estado = trialLeft > 0 ? `Estás en tu prueba gratis: te quedan ${trialLeft} día${trialLeft === 1 ? '' : 's'}.` : 'En prueba';
        }
        z.innerHTML = `
        <div style="margin-bottom:16px">
          <div style="font-size:11.5px;color:var(--dim)">Tu plan actual</div>
          <div style="font-size:17.5px;font-weight:800">${esc(planName)}</div>
          <div style="font-size:12.5px;color:var(--dim);margin-top:4px">${estado}</div>
        </div>`;
        return;
      }
      const { plans, mp_configured, stripe_configured } = await loadPlans();
      const isUS = !!(ME && ME.lang === 'en');
      const cur = (ME && ME.plan) || 'esencial';
      const hasActive = ME && !ME.is_trial && ME.plan_status === 'active';
      const pcm = document.getElementById('planConfirmMsg');
      if (pcm) pcm.innerHTML = hasActive
        ? (isUS ? '✅ Payment received! Your plan is now active.' : '✅ ¡Pago recibido! Tu plan ya está activo.')
        : (isUS ? '⏳ Your payment is being confirmed with Stripe. In a few seconds your plan will activate on its own — nothing else to do.' : '⏳ Tu pago está confirmándose con MercadoPago. En unos segundos tu plan se activa solo — no hace falta que hagas nada.');
      const statusTag = !hasActive ? `<span style="font-size:11.5px;color:var(--dim)">(${ME && ME.plan_status === 'cancelled' ? 'cancelado' : (ME && ME.trial_expired) ? 'prueba terminada' : 'trial'})</span>` : '';
      const trialLeft = (ME && ME.trial_days_left) || 0;
      // refInfo se obtiene una sola vez acá: lo usan bindSub (clic Suscribirse) y los banners
      let refInfo = null;
      try { refInfo = await pzReferral(); } catch (e) {}
      let trialBanner = '';
      if (!hasActive && ME && ME.plan_status === 'trial') {
        if (ME.trial_expired) trialBanner = `<div class="pz-trial-exp">🔒 <b>Se terminó la prueba.</b> Elegí tu plan y seguimos publicando juntos 🥹</div>`;
        else if (trialLeft > 0) trialBanner = trialLeft <= 3
          ? `<div class="pz-trial-warn">⏰ <b>¡Te ${trialLeft === 1 ? 'queda 1 día' : `quedan ${trialLeft} días`} de prueba!</b> Suscribite para no frenar tus posteos.</div>`
          : `<div class="pz-trial-ok">🎁 Estás en tu prueba gratis: te quedan <b>${trialLeft} días</b>.</div>`;
      }
      const pmMixTxt = (pl) => [pl.postsPerWeek > 0 && `${pl.postsPerWeek} posteos`, pl.reelsPerWeek > 0 && `${pl.reelsPerWeek} reels`, pl.storiesPerWeek > 0 && `${pl.storiesPerWeek} historias`].filter(Boolean).join(' + ');
      const curPlan = plans.find(p => p.id === cur) || plans[0];
      // Mix semanal con iconos (solo lo que el plan incluye) + features sin duplicar el mix.
      const pmMixItem = (icon, n, label) => n > 0 ? `<span>${icon} <b>${n}</b> ${label}</span>` : '';
      const pmMixHTML = (p) => {
        const items = [
          pmMixItem('📝', p.postsPerWeek, p.postsPerWeek === 1 ? 'posteo' : 'posteos'),
          pmMixItem('🎬', p.reelsPerWeek, p.reelsPerWeek === 1 ? 'reel' : 'reels'),
          pmMixItem('📸', p.storiesPerWeek, p.storiesPerWeek === 1 ? 'historia' : 'historias'),
        ].filter(Boolean).join('');
        return items ? `<div class="pm-mix">${items}</div>` : '';
      };
      const pmMixDup = /(\d+\s*(posts?|reels|historias)\b|historias todos los días)/i;
      const planCard = (p) => {
        const pmSym = (p.currency === 'UYU' ? '$U ' : '$');
        const feats = (p.features || []).filter(f => !pmMixDup.test(f)).slice(0, 6);
        return `
          <div class="plan-mini${p.id === cur && hasActive ? ' cur' : ''}${p.highlighted ? ' rec' : ''}">
            ${p.highlighted ? '<div class="pm-flag">EL MÁS ELEGIDO</div>' : ''}
            <div class="pm-top"><b>${esc(p.name)}</b>${p.id === cur && hasActive ? '<span class="pm-cur-tag">Tu plan</span>' : ''}</div>
            ${p.tagline ? `<p class="pm-tagline">${esc(p.tagline)}</p>` : ''}
            <div class="pm-price">${esc(p.price_label)}<small>/mes</small></div>
            <div class="pm-perday">≈ ${pmSym}${Math.round(p.price / 30).toLocaleString('es-AR')} por día</div>
            ${pmMixHTML(p)}
            <ul class="pm-feats">${feats.map(f => `<li><span class="tick">✓</span><span>${esc(f)}</span></li>`).join('')}</ul>
            <button class="btn ${p.id === cur && hasActive ? 'btn-ghost' : 'btn-primary'} btn-sm btn-block" data-sub="${p.id}" ${p.id === cur && hasActive ? 'disabled' : ''}>${p.id === cur && hasActive ? 'Plan actual' : 'Suscribirse'}</button>
          </div>`;
      };
      const bindSub = () => {
        $$('#planList [data-sub]').forEach(b => b.onclick = async () => {
          track('plan_select', { plan: b.dataset.sub });
          // (v285) Cuentas US (lang=en): el cobro va por Stripe Checkout —
          // sin paso de email de MP; Stripe pide los datos en su página.
          if (isUS) {
            if (!stripe_configured) { $('#planMsg').innerHTML = `<div class="err">Payments are not configured yet.</div>`; return; }
            b.disabled = true;
            $('#planMsg').innerHTML = `<div style="font-size:12.5px;color:var(--mut)">⏳ Taking you to secure checkout…</div>`;
            try {
              const { url } = await api.post('/api/billing/stripe/checkout', { plan: b.dataset.sub });
              track('checkout_start', { plan: b.dataset.sub, kind: 'plan' }); trackBeacon();
              location.href = url;
            } catch (e) {
              b.disabled = false;
              $('#planMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
            }
            return;
          }
          if (!mp_configured) { $('#planMsg').innerHTML = `<div class="err">Pagos no configurados todavía.</div>`; return; }
          // Paso 1: pedir el email de la cuenta de MercadoPago (debe coincidir con la que paga)
          const preset = esc((ME && (ME.mp_payer_email || ME.email)) || '');
          const subPlan = plans.find(p => p.id === b.dataset.sub) || curPlan;
          const discLine = (refInfo && refInfo.discount_active)
            ? `<div class="pz-disc" style="margin:0 0 10px">🎉 Tenés <b>50% off</b> por referidos: este plan te queda en <b>$${Math.round(subPlan.price / 2).toLocaleString('es-AR')}/mes</b>.</div>`
            : (refInfo && refInfo.invited)
              ? `<div class="pz-disc" style="margin:0 0 10px">🎉 Tenés <b>20% off</b> de invitado: este plan te queda en <b>$${Math.round(subPlan.price * 0.8).toLocaleString('es-AR')}/mes</b>.</div>`
              : '';
          $('#planMsg').innerHTML = `
            <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:12px">
              ${discLine}
              <div style="font-weight:800;margin-bottom:6px">Un paso más 💳</div>
              <div style="font-size:12.5px;color:var(--mut);margin-bottom:10px">Ingresá el <b>email de tu cuenta de MercadoPago</b>.</div>
              <div style="font-size:11.5px;background:#FFF7E6;border:1px solid #FEC14D;border-radius:10px;padding:10px 12px;margin-bottom:10px">El comprobante de pago te va a llegar a <b>ese email</b>: fijate que sea el de tu cuenta de MercadoPago.</div>
              <div class="field"><input id="mpEmail" type="email" placeholder="tu@email.com" value="${preset}" autocomplete="email"></div>
              <button class="btn btn-primary btn-block" id="btnGoMP">Continuar al pago</button>
            </div>`;
          const emInput = $('#mpEmail');
          if (emInput) emInput.focus();
          $('#btnGoMP').onclick = async () => {
            const em = ($('#mpEmail').value || '').trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
              $('#planMsg').innerHTML = `<div class="err">Ingresá un email válido.</div>`;
              return;
            }
            const btn = $('#btnGoMP');
            btn.disabled = true; btn.textContent = '⏳ Redirigiendo a MercadoPago...';
            try {
              const { init_point } = await api.post('/api/billing/subscribe', { plan: b.dataset.sub, payer_email: em });
              track('checkout_start', { plan: b.dataset.sub, kind: 'plan' }); trackBeacon();
              location.href = init_point;
            } catch (e) {
              $('#planMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
            }
          };
        });
      };
      if (!hasActive) {
        // Compacto (v282): las tarjetas ya no salen abiertas de entrada — un
        // botón "Ver planes" las despliega. El flujo ?plan_sel= las
        // auto-despliega más abajo, antes de su click programático.
        z.innerHTML = `
        <div style="margin-bottom:16px">
          <div style="font-size:11.5px;color:var(--dim)">Plan actual</div>
          <div style="font-size:17.5px;font-weight:800">${esc(curPlan.name)} ${statusTag}</div>
        </div>
        ${trialBanner}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="btnShowPlans">Ver planes</button>
          <span style="font-size:12.5px;color:var(--dim)">${(ME && ME.trial_expired) ? 'Elegí tu plan y seguimos publicando juntos.' : 'Mirá los planes cuando quieras suscribirte.'}</span>
        </div>
        <div id="planAll" style="display:none">
          <div style="font-size:14px;font-weight:800;margin:14px 0 12px">Elegí tu plan para ${ME && ME.trial_expired ? 'seguir' : 'empezar'} 🚀</div>
          <div id="planList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${plans.map(planCard).join('')}</div>
          <p style="font-size:11.5px;color:var(--dim);margin-top:12px">Se renueva automáticamente cada mes. Podés cancelar cuando quieras.</p>
        </div>
        <div id="planMsg" style="margin-top:10px"></div>`;
        bindSub();
        const bsp = $('#btnShowPlans');
        if (bsp) bsp.onclick = () => {
          const pa = $('#planAll');
          if (!pa) return;
          const show = pa.style.display === 'none';
          pa.style.display = show ? '' : 'none';
          bsp.textContent = show ? 'Ocultar planes' : 'Ver planes';
        };
      } else if (ME && ME.plan === 'free') {
        z.innerHTML = `
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div class="plan-cur">
            <div class="pc-label">Plan actual</div>
            <div class="pc-name">Founder 🚀</div>
            <div class="pc-det">Gratis para siempre · 7 posteos + 5 reels + 7 historias/semana</div>
          </div>
        </div>
        <div id="planMsg" style="margin-top:10px"></div>`;
      } else {
        z.innerHTML = `
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <div class="plan-cur">
            <div class="pc-label">Plan actual</div>
            <div class="pc-name">${esc(curPlan.name)}</div>
            <div class="pc-det">${esc(curPlan.price_label)}/mes · ${pmMixTxt(curPlan)}/semana · se renueva solo cada mes</div>
          </div>
          ${(ME && ME.billing_provider === 'stripe')
            ? '<button class="btn btn-ghost btn-sm" id="btnStripePortal">Manage subscription</button>'
            : '<button class="btn btn-ghost btn-sm" id="btnCancelSub" style="color:#c0392b">Cancelar suscripción</button>'}
        </div>
        <div id="planMsg" style="margin-top:10px"></div>
        <p style="font-size:11.5px;color:var(--dim)">${(ME && ME.billing_provider === 'stripe') ? 'Manage or cancel your subscription in the secure Stripe portal.' : 'Para cambiar de plan, primero cancelá tu suscripción actual y después elegí el nuevo.'}</p>`;
        // (v285) Usuario Stripe: gestionar/cancelar vive en el Billing Portal.
        const btnPortal = $('#btnStripePortal');
        if (btnPortal) btnPortal.onclick = async () => {
          btnPortal.disabled = true; btnPortal.textContent = 'Opening…';
          try {
            const { url } = await api.post('/api/billing/stripe/portal', {});
            location.href = url;
          } catch (e) {
            $('#planMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
            btnPortal.disabled = false; btnPortal.textContent = 'Manage subscription';
          }
        };
        const btnCancel = $('#btnCancelSub');
        if (btnCancel) btnCancel.onclick = async () => {
          if (!confirm('¿Cancelar tu suscripción? Mantenés tu plan hasta el fin del período ya pago.')) return;
          const reasonRaw = prompt('¿Nos contás por qué te vas? (opcional)\n\n1 · Precio\n2 · No me sirvió el contenido\n3 · Prefiero hacerlo yo\n4 · Otro motivo', '');
          const reasonMap = { 1: 'Precio', 2: 'No me sirvió el contenido', 3: 'Prefiero hacerlo yo', 4: 'Otro motivo' };
          const reason = reasonRaw && reasonMap[reasonRaw.trim()] ? reasonMap[reasonRaw.trim()] : String(reasonRaw || '').slice(0, 60);
          const b = $('#btnCancelSub'); b.disabled = true; b.textContent = 'Cancelando...';
          try {
            await api.post('/api/billing/cancel', { reason });
            await refreshSession(); render();
          } catch (e) {
            $('#planMsg').innerHTML = `<div class="err">${esc(e.message)}</div>`;
            b.disabled = false; b.textContent = 'Cancelar suscripción';
          }
        };
      }
      // 🎁 50% off por referidos: se aplica automáticamente al suscribirte
      try {
        if (refInfo && refInfo.discount_active) {
          z.insertAdjacentHTML('afterbegin', `<div class="pz-disc">🎁 <b>50% off por referidos</b>: se aplica automáticamente al suscribirte.</div>`);
        } else if (refInfo && refInfo.invited && !hasActive) {
          z.insertAdjacentHTML('afterbegin', `<div class="pz-disc">🎉 <b>Tenés 20% off de invitado</b>: se aplica automáticamente al suscribirte, todos los meses.</div>`);
        }
      } catch (e) {}
      // Plan preseleccionado desde /prueba (?plan_sel=): click programático UNA vez
      if (!PZ_AUTO_PLAN && !hasActive) {
        const pq = new URLSearchParams(location.hash.split('?')[1] || '');
        const sel = (pq.get('plan_sel') || '').replace(/[^a-z]/g, '');
        if (sel) {
          PZ_AUTO_PLAN = true;
          try { history.replaceState(null, '', location.pathname + '#/app/ajustes'); } catch (e) {}
          localStorage.removeItem('posta_chosen_plan');
          // Con el plan compacto (v282) las tarjetas nacen plegadas: desplegar
          // antes del click programático para que el paso de pago se vea.
          const paAuto = document.getElementById('planAll');
          if (paAuto) paAuto.style.display = '';
          const bspAuto = document.getElementById('btnShowPlans');
          if (bspAuto) bspAuto.textContent = 'Ocultar planes';
          const btn = document.querySelector(`#planList [data-sub="${sel}"]`);
          if (btn && !btn.disabled) btn.click();
        }
      }
    } catch (e) {
      console.error('[planes] error final:', e);
      showPlansError(e);
    }
    };
    run();
  })();
  // 🎁 Referidos
  (async () => {
    const z = $('#refZone');
    if (!z) return;
    const info = await pzReferral();
    if (!info || !info.ok) { z.innerHTML = `<p style="color:var(--dim)">No se pudo cargar tu link de referidos.</p>`; return; }
    const n = info.referred_count || 0, need = info.needed || 2;
    const pct = Math.min(100, Math.round(n / need * 100));
    const missing = Math.max(0, need - n);
    // Precio concreto según el plan actual (o el del trial)
    let planPrice = 0;
    try {
      const pd = await api.get('/api/billing/plans');
      const pl = (pd.plans || []).find(x => x.id === ((ME && ME.plan) || 'esencial')) || (pd.plans || [])[0];
      if (pl) planPrice = pl.price || 0;
    } catch (e) {}
    const fmt$ = (v) => '$' + Math.round(v).toLocaleString('es-AR');
    const half$ = planPrice ? fmt$(planPrice / 2) : null;
    const shareMsg = `Uso Posty para el Instagram de mi negocio: crea y publica el contenido por mí. Con mi link ahorrás hasta $25.980 por mes en tu plan: ${info.link}`;
    const slots = Array.from({ length: need }, (_, i) =>
      `<span class="pz-slot${i < n ? ' on' : ''}">${i < n ? '\u2713' : (i + 1)}</span>`).join('');
    z.innerHTML = `
      <div class="pz-ref-hero">
        <div class="pz-ref-hero-t">🎁 Pagás la mitad, todos los meses</div>
        ${half$ ? `<div class="pz-ref-hero-p">Pasás de <s>${fmt$(planPrice)}</s> a <b>${half$}</b>/mes con ${need} referidos suscriptos.</div>`
          : `<div class="pz-ref-hero-p">Con <b>${need} referidos</b> suscriptos, tu plan te sale <b>la mitad</b>.</div>`}
      </div>
      <div class="pz-ref-steps">
        <div><span>1️⃣</span>Compartí tu link</div>
        <div><span>2️⃣</span>Ellos se suscriben con <b>20% off todos los meses</b></div>
        <div><span>3️⃣</span>Vos pagás la mitad mientras sigan suscriptos</div>
      </div>
      <div class="pz-ref-share">
        <button class="btn btn-wa btn-sm" data-share="wa">WhatsApp</button>
        <button class="btn btn-ig btn-sm" data-share="ig">Instagram</button>
        <button class="btn btn-x btn-sm" data-share="x">X</button>
        <button class="btn btn-primary btn-sm" id="pzRefNative" style="display:none">📤 Compartir</button>
        <button class="btn btn-ghost btn-sm" id="pzRefCopy">Copiar link</button>
        <button class="btn btn-ghost btn-sm" id="pzRefCopyMsg">Copiar mensaje</button>
      </div>
      <div class="pz-refrow">
        <input id="pzRefLink" readonly value="${esc(info.link)}" onclick="this.select()">
      </div>
      <details style="font-size:11.5px;color:var(--mut);margin:0 0 12px"><summary style="cursor:pointer;font-weight:700">👀 Vista previa del mensaje</summary><p style="background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0 0">${esc(shareMsg)}</p></details>
      <div class="pz-ref-slots">${slots}</div>
      <div class="pz-refbar"><div style="width:${pct}%"></div></div>
      <p style="font-size:12.5px;color:var(--mut)"><b>${n}/${need}</b> referidos</p>
      ${(info.joined && info.joined.length) ? `<div class="pz-ref-joined"><div class="pz-ref-joined-t">Se unieron con tu link 🎉</div>${info.joined.map(nm => `<div class="pz-ref-join">✓ ${esc(nm)}</div>`).join('')}</div>` : ''}
      ${(info.pending && info.pending.length) ? `<div class="pz-ref-joined"><div class="pz-ref-joined-t">En camino 🚶</div><div class="pz-ref-pending-sub">Se registraron con tu link y están en prueba. Un mensaje tuyo los convierte 👇</div>${info.pending.map((p, i) => `<div class="pz-ref-join">⏳ ${esc(p.name)}${p.days_left > 0 ? `<span class="pz-ref-days"> · le quedan ${p.days_left} día${p.days_left === 1 ? '' : 's'} de prueba</span>` : ''} <button class="btn btn-ghost btn-sm" data-nudge="${i}" style="margin-left:6px">📋 Copiar mensaje</button></div>`).join('')}</div>` : ''}
      ${info.discount_active
        ? `<div class="pz-disc">✅ Tenés <b>50% off activo</b>${half$ ? ` en tu suscripción: pagás <b>${half$}/mes</b>` : ' en tu suscripción'}.</div>`
        : `<p style="font-size:12.5px">${missing === 1 ? 'Nos falta <b>1</b> referido' : `Nos faltan <b>${missing}</b> referidos`}: cuando se suscriban con tu link, pagás la mitad.</p>`}
      <p class="pz-ref-auto">⚡ El descuento se aplica solo a tu suscripción, sin hacer nada.</p>
      <span id="pzRefMsg" style="font-size:11.5px"></span>`;
    const say = (t) => { const m = $('#pzRefMsg'); if (m) m.innerHTML = `<span style="color:var(--cel)">${t}</span>`; };
    const copyLink = async (okMsg) => {
      const v = $('#pzRefLink').value;
      try { await navigator.clipboard.writeText(v); }
      catch (e) {
        const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e2) {}
        t.remove();
      }
      say(okMsg || '✅ Link copiado');
    };
    $('#pzRefCopy').onclick = () => copyLink();
    const copyText = async (t, okMsg) => {
      try { await navigator.clipboard.writeText(t); }
      catch (e) {
        const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        ta.remove();
      }
      say(okMsg || '✅ Copiado');
    };
    $('#pzRefCopyMsg').onclick = () => copyText(shareMsg, '✅ Mensaje copiado: pegalo donde quieras');
    z.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => {
      const p = info.pending[Number(b.dataset.nudge)];
      if (!p) return;
      const who = (p.name && p.name !== 'Un referido') ? ` ${p.name}` : '';
      copyText(`Che${who}! Vi que empezaste tu prueba de Posty con mi link 🚀 Si te suscribís${p.days_left > 0 ? ` (te quedan ${p.days_left} día${p.days_left === 1 ? '' : 's'} de prueba)` : ''}, mantenés el 20% off todos los meses. Cualquier cosa me preguntás 👍`, '✅ Mensaje copiado: pegalo en WhatsApp');
    });
    const nativeBtn = $('#pzRefNative');
    if (nativeBtn && navigator.share) {
      nativeBtn.style.display = '';
      nativeBtn.onclick = async () => { try { await navigator.share({ title: 'Posty', text: shareMsg }); } catch (e) {} };
    }
    z.querySelectorAll('[data-share]').forEach(b => b.onclick = () => {
      const k = b.dataset.share;
      if (k === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(shareMsg), '_blank');
      else if (k === 'x') window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareMsg), '_blank');
      else if (k === 'ig') copyLink('✅ Link copiado: pegalo en tu historia o por DM');
    });
  })();
  // Marca
  const bBlog = $('#btnBrandLogo');
  if (bBlog) bBlog.onclick = () => $('#s_logofile').click();
  $$('[data-lightbox]').forEach(el => el.onclick = () => openLightbox(el.dataset.lightbox, el.dataset.video === '1'));
  // Si el creador ya tenía 6 opciones generadas, las regenera con los colores
  // nuevos para que el cambio se vea al instante (cero pasos extra).
  async function refreshCreatorWithNewColors(msgEl) {
    try {
      const cc = (typeof CREATOR !== 'undefined' && CREATOR) || null;
      if (!cc || !Array.isArray(cc.options) || cc.options.length !== 6 || !cc.topic) return false;
      if (msgEl) msgEl.innerHTML = '<span style="font-size:12.5px;color:var(--cel)">🎨 Actualizando tus diseños…</span>';
      const out = await api.post('/api/creator/options', { topic: cc.topic, productPhoto: cc.productPhoto || undefined });
      if (out && Array.isArray(out.options) && out.options.length === 6) {
        cc.options = out.options; cc.detected = out.detected || null;
        cc.recommendedIndex = out.recommendedIndex || 0;
        cc.recommendedReason = out.recommendedReason || '';
        cc.selected = []; cc.cardPhoto = {};
        return true;
      }
    } catch (e) { /* no bloquea el guardado */ }
    return false;
  }
  const slf = $('#s_logofile');
  if (slf) slf.onchange = async () => {
    const orig = slf.files[0]; slf.value = '';
    if (!orig) return;
    try {
      const nm = (orig.name || '').toLowerCase();
      if (nm.endsWith('.pdf') || nm.endsWith('.docx')) $('#brandMsg').innerHTML = '<span style="font-size:12.5px;color:var(--dim)">⏳ Convirtiendo tu archivo a imagen…</span>';
      const f = await logoFileToImage(orig);
      await uploadAssetFile(f, 'logo');
      try {
        const img = await loadImageFile(f);
        const cols = extractTopColors(img, 3);
        if (cols.length >= 2) await api.put('/api/settings', { brand_colors: cols });
      } catch (e) { /* el logo quedó; los colores se eligen a mano */ }
      SETTINGS = await api.get('/api/settings').catch(() => SETTINGS);
      const refreshed = await refreshCreatorWithNewColors($('#brandMsg'));
      if (refreshed) $('#brandMsg').innerHTML = '<span style="font-size:12.5px;color:var(--cel)">✅ Colores actualizados en tus diseños</span>';
      render();
    }
    catch (e) { $('#brandMsg').innerHTML = (e && e.cancelled) ? '' : `<span style="color:var(--red);font-size:12.5px">${esc(e.message)}</span>`; }
  };
  // --- vista previa de marca ---
  const lumInk = (hex) => {
    const n = parseInt(String(hex).slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#0A1E33' : '#FFFFFF';
  };
  function renderBrandPrev() {
    const logo = assetLogo();
    const pf = $('#brandPf');
    if (pf) pf.innerHTML = logo ? `<img src="${logo.file_path}" alt="logo">` : '';
    const box = $('#brandPrev');
    if (!box) return;
    const c = [$('#s_c0') && $('#s_c0').value, $('#s_c1') && $('#s_c1').value, $('#s_c2') && $('#s_c2').value].filter(Boolean);
    if (!c.length) { box.innerHTML = ''; return; }
    const biz = (PROFILE && PROFILE.business_name) || 'Tu negocio';
    const ink = lumInk(c[0]);
    box.innerHTML = `
      <div class="bp-card" style="background:linear-gradient(135deg,${c[0]},${c[1] || c[0]})">
        <div class="bp-head">${logo ? `<img src="${logo.file_path}">` : ''}<span style="color:${ink}">${esc(biz)}</span></div>
        <div class="bp-title" style="color:${ink}">¡NUEVA<br>COLECCIÓN!</div>
        <div><span class="bp-cta" style="background:${c[2] || c[1] || c[0]};color:${lumInk(c[2] || c[1] || c[0])}">Ver más →</span></div>
      </div>`;
  }
  let brandDirty = false;
  const bDirtyEl = $('#brandDirty');
  function markBrandDirty() { if (!brandDirty) { brandDirty = true; if (bDirtyEl) bDirtyEl.style.display = ''; } }
  const normHex = (v) => {
    let h = String(v || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
    return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toUpperCase() : null;
  };
  const syncHexFromPicker = (i) => { const hx = $('#s_h' + i); const pk = $('#s_c' + i); if (hx && pk) hx.value = pk.value.toUpperCase(); };
  ['s_c0', 's_c1', 's_c2'].forEach((id, i) => {
    const pick = document.getElementById(id);
    const hex = document.getElementById('s_h' + i);
    if (pick) pick.addEventListener('input', () => { syncHexFromPicker(i); markBrandDirty(); renderBrandPrev(); });
    if (hex && pick) {
      hex.addEventListener('input', () => {
        const n = normHex(hex.value);
        if (n) { pick.value = n; markBrandDirty(); renderBrandPrev(); }
      });
      hex.addEventListener('change', () => {
        const n = normHex(hex.value);
        hex.value = n || pick.value.toUpperCase();
        if (n) { pick.value = n; markBrandDirty(); renderBrandPrev(); }
      });
    }
  });
  // Reordenar roles: el menú de cada color permite elegir Principal/Secundario/Acento;
  // los colores se intercambian de lugar solos. El rol es posicional: el menú vuelve a su lugar.
  const swapBrandColors = (a, b) => {
    const pa = document.getElementById('s_c' + a), pb = document.getElementById('s_c' + b);
    if (!pa || !pb) return;
    const va = pa.value;
    pa.value = pb.value; pb.value = va;
    syncHexFromPicker(a); syncHexFromPicker(b);
    markBrandDirty(); renderBrandPrev();
  };
  [0, 1, 2].forEach((i) => {
    const sel = document.getElementById('s_r' + i);
    if (sel) sel.addEventListener('change', () => {
      const to = parseInt(sel.value, 10);
      sel.value = String(i);
      if (Number.isInteger(to) && to >= 0 && to <= 2 && to !== i) swapBrandColors(i, to);
    });
  });
  renderBrandPrev();
  const bBlogDel = $('#btnBrandLogoDel');
  if (bBlogDel) bBlogDel.onclick = async () => {
    if (!confirm('¿Quitar el logo de tu marca?')) return;
    const logo = assetLogo();
    if (logo && logo.id) { try { await api.del('/api/assets/' + logo.id); } catch (e) {} }
    ASSETS = await api.get('/api/assets').catch(() => []);
    render();
  };
  // Si hay logo pero no colores de marca: detectarlos del logo automáticamente
  (async () => {
    try {
      if (brandColors().length >= 2) return;
      const logo = assetLogo();
      if (!logo) return;
      const img = await loadImageUrl(logo.file_path);
      const cols = extractTopColors(img, 3);
      let filled = 0;
      cols.forEach((c, i) => { const inp = $('#s_c' + i); if (inp && c) { inp.value = c; syncHexFromPicker(i); filled++; } });
      if (filled >= 2) $('#brandMsg').innerHTML = '<span style="color:var(--mut);font-size:12.5px">🎨 Detectamos tus colores del logo — tocá Guardar marca para confirmar.</span>';
    } catch (e) { /* quedan los valores actuales */ }
  })();
  $('#btnSaveBrand').onclick = async () => {
    const colors = [$('#s_c0').value, $('#s_c1').value, $('#s_c2').value].filter((c, i, a) => a.indexOf(c) === i);
    const untouched = NEUTRAL_TRIO.every((d, i) => (colors[i] || '').toUpperCase() === d);
    if (untouched && !assetLogo()) { $('#brandMsg').innerHTML = `<span style="color:var(--red);font-size:12.5px">Subí tu logo o elegí tus colores 🙂</span>`; return; }
    await api.put('/api/settings', { brand_colors: colors });
    const brandMsgEl = $('#brandMsg');
    brandMsgEl.innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Marca guardada</span>';
    brandDirty = false; if (bDirtyEl) bDirtyEl.style.display = 'none';
    SETTINGS = await api.get('/api/settings');
    if (await refreshCreatorWithNewColors(brandMsgEl))
      brandMsgEl.innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Marca guardada — diseños actualizados</span>';
  };
  // Reiniciar todo: marca (logo, colores, nombre) + posteos pendientes (borradores y
  // programados). Para cuando se cambió de negocio/cuenta. El historial publicado no se toca.
  const btnResetBrand = $('#btnResetBrand');
  if (btnResetBrand) btnResetBrand.onclick = async () => {
    if (!confirm('¿Reiniciar todo? Se borran el logo, los colores, el nombre del negocio y los posteos pendientes (borradores y programados). El historial publicado no se toca.')) return;
    const brandMsgEl = $('#brandMsg');
    try {
      brandMsgEl.innerHTML = '<span style="color:var(--mut);font-size:12.5px">⏳ Reiniciando…</span>';
      await api.post('/api/brand/reset', {});
      ASSETS = await api.get('/api/assets').catch(() => []);
      SETTINGS = await api.get('/api/settings').catch(() => SETTINGS);
      await refreshSession();
      brandDirty = false; if (bDirtyEl) bDirtyEl.style.display = 'none';
      render();
    } catch (e) {
      brandMsgEl.innerHTML = `<span style="color:var(--red);font-size:12.5px">${esc(e.message)}</span>`;
    }
  };
  $('#btnSaveSettings').onclick = async () => {
    await api.put('/api/settings', {
      meta_app_id: $('#s_appid').value,
      meta_app_secret: $('#s_appsecret').value, ig_embed_url: $('#s_igembed').value,
    });
    $('#setMsg').innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Guardado</span>';
  };
  const btm = $('#btnTestMeta');
  if (btm) btm.onclick = async () => {
    const msg = $('#metaTestMsg');
    const appId = $('#s_appid').value.trim(), appSecret = $('#s_appsecret').value.trim();
    if (!appId || !appSecret) { msg.innerHTML = '<span style="color:var(--red)">Completá App ID y App Secret primero</span>'; return; }
    msg.textContent = 'Probando…';
    try {
      const r = await api.post('/api/settings/test-meta', { app_id: appId, app_secret: appSecret });
      msg.innerHTML = r.ok
        ? `<span style="color:var(--green-d)">✅ App válida: <b>${esc(r.app_name)}</b></span>`
        : `<span style="color:var(--red)">❌ ${esc(r.error)}</span>`;
    } catch (e) { msg.innerHTML = `<span style="color:var(--red)">❌ ${esc(e.message)}</span>`; }
  };
  const setDemoMode = async (v) => {
    await api.put('/api/settings', { demo_mode: v });
    if (typeof SETTINGS !== 'undefined' && SETTINGS) SETTINGS.demo_mode = v;
    IG_MODE_WARN = (!v && !(PROFILE && PROFILE.ig_connected));
    // Quedarse en Conexiones tras el re-render (el control vive ahí, v282).
    try { history.replaceState(null, '', location.pathname + '#/app/ajustes?ig=1'); } catch (e) {}
    render();
  };
  const mtr = $('#igModeToReal'); if (mtr) mtr.onclick = () => setDemoMode(false);
  const mtd = $('#igModeToDemo'); if (mtd) mtd.onclick = () => setDemoMode(true);
  const bc = $('#btnIgConn');
  if (bc) bc.onclick = igConnect;
  const bd = $('#btnIgDisc');
  if (bd) bd.onclick = async () => {
    const u = (PROFILE && PROFILE.ig_username) ? '@' + PROFILE.ig_username : 'tu cuenta';
    if (!confirm(`¿Desconectar ${u} de Posty?\n\nTus posteos programados se pausarán hasta que vuelvas a conectar.`)) return;
    track('ig_disconnect'); trackBeacon();
    await api.post('/api/ig/disconnect'); render();
  };
  const stampVerified = () => {
    const d = new Date();
    IG_VERIFIED_AT = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const bv = $('#btnIgVerify');
  if (bv) bv.onclick = async () => {
    const vm = $('#igVerifyMsg');
    if (vm) vm.innerHTML = '<div class="hint">🔍 Verificando tu conexión con Instagram…</div>';
    try {
      const r = await api.get('/api/ig/sync');
      if (r && r.username) {
        PROFILE.ig_username = r.username;
        stampVerified();
        render();
      } else if (vm) {
        vm.innerHTML = `<div class="err">❌ No se pudo verificar: ${esc((r && r.error) || 'respuesta vacía')}</div>`;
      }
    } catch (e) {
      if (vm) vm.innerHTML = `<div class="err">❌ La verificación falló: ${esc(e.message)}</div>`;
    }
  };
  const igProLink = $('#igProLink');
  if (igProLink) igProLink.onclick = (e) => { e.preventDefault(); const g = $('#igProGuide'); if (g) g.style.display = g.style.display === 'none' ? '' : 'none'; };
  try { pzFillBioSeal(); } catch (e) {}
  // Actualizar lo que Posty sabe de mí (v282): UN solo botón que corre los
  // tres re-análisis EN ORDEN — estilo visual → cómo escribo → brief (el
  // brief se compone de los otros dos: NEGOCIO + VOZ + VISUAL + MARCA, por
  // eso va último). Si un paso falla, se dice cuál y no se finge éxito.
  const bKnow = $('#btnKnowUpdate');
  if (bKnow) bKnow.onclick = async () => {
    const m = $('#knowMsg');
    const steps = [
      ['tu estilo visual', '/api/style-visual/analyze'],
      ['cómo escribís', '/api/caption-style/analyze'],
      ['tu brief', '/api/client-brief/refresh'],
    ];
    bKnow.disabled = true;
    for (let i = 0; i < steps.length; i++) {
      if (m) m.textContent = `Actualizando ${steps[i][0]}… (${i + 1} de ${steps.length})`;
      try {
        const r = await api.post(steps[i][1]);
        if (!r || !r.ok) {
          if (m) m.textContent = `Se cortó en ${steps[i][0]}: ${(r && r.error) || 'probá de nuevo'}.`;
          bKnow.disabled = false;
          return;
        }
      } catch (e) {
        if (m) m.textContent = `Se cortó en ${steps[i][0]}: probá de nuevo.`;
        bKnow.disabled = false;
        return;
      }
    }
    if (m) m.textContent = 'Listo ✅ Posty ya sabe quién sos: qué vendés, cómo hablás y cómo te ves.';
    bKnow.disabled = false;
  };
  // Carga manual del @ sin conectar (v282): el campo vive en Conexiones y
  // guarda solo. PUT /api/profile NO es parcial-safe (sin business_name
  // devuelve 400; con él, pisa todos los campos), así que se manda el perfil
  // vigente completo con el @ nuevo — las ediciones sin guardar de Tu
  // negocio no se tocan (siguen en su formulario, con su propio Guardar).
  const bIgU = $('#btnIgUserSave');
  if (bIgU) bIgU.onclick = async () => {
    const inp = $('#s_iguser');
    const m = $('#igUserMsg');
    const v = ((inp && inp.value) || '').trim().replace(/^@+/, '');
    bIgU.disabled = true;
    try {
      await api.put('/api/profile', {
        business_name: (PROFILE && PROFILE.business_name) || '',
        ig_username: v,
        category: (PROFILE && PROFILE.category) || 'otro',
        tone: (PROFILE && PROFILE.tone) || '',
        description: (PROFILE && PROFILE.description) || '',
        competitors: (PROFILE && PROFILE.competitors) || '',
        goal: (PROFILE && PROFILE.goal) || '',
        monthly_goal: (PROFILE && PROFILE.monthly_goal) || '',
      });
      PROFILE = await api.get('/api/profile');
      if (m) m.innerHTML = '<span style="color:var(--cel);font-size:12.5px">✅ Guardado — Posty te analiza con ese @.</span>';
    } catch (e) {
      if (m) m.innerHTML = `<span style="color:#B3402E;font-size:12.5px">${esc((e && e.message) || 'No se pudo guardar')}</span>`;
    }
    bIgU.disabled = false;
  };
  const igRetry = $('#btnIgRetry');
  if (igRetry) igRetry.onclick = () => igConnect();
  // Si está conectado pero el username quedó vacío: sincronizar solo (reintenta una vez a los 10s)
  if (PROFILE && PROFILE.ig_connected && !PROFILE.ig_username) {
    const doIgSync = async (isRetry) => {
      const m = $('#igMsg');
      const bindRetry = () => {
        const rb = $('#igSyncRetry');
        if (rb) rb.onclick = (ev) => { ev.preventDefault(); doIgSync(false); };
      };
      try {
        const r = await api.get('/api/ig/sync');
        if (r && r.username) { PROFILE.ig_username = r.username; render(); return; }
        throw new Error((r && r.error) || 'respuesta vacía');
      } catch (e) {
        if (!isRetry) {
          if (m) m.innerHTML = `<div class="hint">🔄 Sincronizando tu cuenta de Instagram…</div>`;
          setTimeout(() => doIgSync(true), 10000);
        } else {
          if (m) m.innerHTML = `<div class="err">⚠️ No se pudo leer tu @ de Instagram: ${esc(e.message)} <a href="#" id="igSyncRetry" style="color:var(--cel);font-weight:700">Reintentar</a></div>`;
          bindRetry();
        }
      }
    };
    doIgSync(false);
  }
  // Verificación silenciosa: conectado con username → tildar el checklist sin pedir taps
  if (PROFILE && PROFILE.ig_connected && PROFILE.ig_username && !IG_VERIFIED_AT) {
    (async () => {
      try {
        const r = await api.get('/api/ig/sync');
        if (r && r.username) { PROFILE.ig_username = r.username; stampVerified(); render(); }
      } catch (e) { /* queda sin verificar; el botón manual sigue disponible */ }
    })();
  }
}

/* ---------- Sello de bio opt-in (capa de visibilidad, mecanismo 5) ----------
 * Tarjeta UNA sola vez en Conexiones: si el dueño quiere, copia el sello y
 * lo pega ÉL en su bio (su perfil, su mano — jamás se escribe automático).
 * La decisión queda registrada (profiles.bio_seal) para medir adopción y
 * para no volver a ofrecerla. */
async function pzFillBioSeal() {
  const slot = document.getElementById('pzBioSealSlot');
  if (!slot) return;
  try {
    if (typeof pzVisibility !== 'function') return;
    const st = await pzVisibility();
    if (!st || !st.ok || !st.bio_seal || st.bio_seal.state !== '') return;
    const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
    const seals = en
      ? ['📲 Content: @posty.doeseverything', '✨ My content is made by @posty.doeseverything']
      : ['📲 Contenido: @posty.hacetodo', '✨ Mi contenido lo hace @posty.hacetodo'];
    slot.innerHTML = `<div style="border:1px dashed var(--line);border-radius:14px;padding:14px;background:#F8FBFD;margin-top:18px">
      <div style="font-weight:800;margin-bottom:4px">${en ? '🏷️ Your Posty seal (optional)' : '🏷️ Tu sello Posty (opcional)'}</div>
      <p style="color:var(--mut);font-size:12.5px;margin:0 0 10px">${en ? 'Some businesses add a line like this to their Instagram bio so followers know their content is cared for. It is your profile: you paste it by hand, only if you like it.' : 'Algunos negocios suman una línea así a su bio de Instagram para que sus seguidores sepan que su contenido está cuidado. Es tu perfil: la pegás vos a mano, solo si te gusta.'}</p>
      ${seals.map((s, i) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><code style="flex:1;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px">${esc(s)}</code><button class="btn btn-soft btn-sm" data-seal-copy="${i}">${en ? 'Copy' : 'Copiar'}</button></div>`).join('')}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;align-items:center">
        <button class="btn btn-primary btn-sm" id="pzSealOk">${en ? 'I added it 💙' : 'Ya lo sumé 💙'}</button>
        <button class="btn btn-ghost btn-sm" id="pzSealNo">${en ? 'Not now' : 'Ahora no'}</button>
        <span id="pzSealMsg" style="font-size:12px"></span>
      </div></div>`;
    slot.querySelectorAll('[data-seal-copy]').forEach((b) => {
      b.onclick = async () => {
        const t = seals[Number(b.dataset.sealCopy)];
        let copied = false;
        try { await navigator.clipboard.writeText(t); copied = true; } catch (e) {
          const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
          try { copied = document.execCommand('copy'); } catch (e2) {}
          ta.remove();
        }
        const m = document.getElementById('pzSealMsg');
        if (m) m.textContent = copied ? (en ? '✅ Copied — paste it in your bio' : '✅ Copiado — pegalo en tu bio') : t;
      };
    });
    const done = async (state, msg) => {
      try { await api.post('/api/visibility/bio-seal', { state }); } catch (e) {}
      if (typeof PZ_VIS_PROMISE !== 'undefined') PZ_VIS_PROMISE = null;
      slot.innerHTML = msg ? `<p class="hint" style="margin-top:14px">${msg}</p>` : '';
    };
    const okB = document.getElementById('pzSealOk');
    if (okB) okB.onclick = () => done('accepted', en ? '💙 Seal on — thanks for showing it!' : '💙 ¡Sello puesto! Gracias por mostrarlo.');
    const noB = document.getElementById('pzSealNo');
    if (noB) noB.onclick = () => done('dismissed', '');
  } catch (e) {}
}
