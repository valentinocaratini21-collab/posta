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
  // (AJUSTES-CARPETAS) Ajustes es un menú estilo Instagram: una lista de
  // filas agrupadas por tema; cada fila abre su sección en su propia
  // pantalla (#ajDetail) con botón ‹ para volver. Los deep-links
  // (?plan, ?ig, ...) abren la pantalla destino en bindSettings (ajDeepSec
  // + ajFoldAbrir); ajustesView ya nace en esa pantalla si la URL la trae.
  const igMsg = q.get('ig') === 'ok' ? `<div class="okmsg">${pzIc('checkCircle', 15)} Instagram conectado: @${esc(p.ig_username)}</div>`
    : q.get('ig') === 'error' ? `<div class="err">${pzIc('reject', 15)} ${esc(q.get('msg') || 'Error al conectar')}</div>` : '';
  const ttMsg = q.get('tiktok') === 'ok' ? `<div class="okmsg">${pzIc('checkCircle', 15)} ¡TikTok conectado! Ya podés compartir tus posteos</div>`
    : q.get('tiktok') === 'error' ? `<div class="err">${pzIc('reject', 15)} ${esc(q.get('msg') || 'Error al conectar TikTok')}</div>` : '';
  const ggMsg = q.get('google') === 'ok' ? `<div class="okmsg">${pzIc('checkCircle', 15)} ¡Google conectado! Ya podés responder tus reseñas</div>`
    : q.get('google') === 'error' ? `<div class="err">${pzIc('reject', 15)} ${esc(q.get('msg') || 'Error al conectar Google')}</div>` : '';
  const tnMsg = q.get('tn') === 'ok' ? `<div class="okmsg">${pzIc('checkCircle', 15)} ¡Tiendanube conectada! Posty ya lee tu catálogo, tu stock y tus ventas</div>`
    : q.get('tn') === 'error' ? `<div class="err">${pzIc('reject', 15)} No pudimos conectar tu Tiendanube. Probá de nuevo desde Conexiones.</div>` : '';
  const planMsg = IS_NATIVE ? '' : q.get('plan') === 'ok' ? `<div class="okmsg" id="planConfirmMsg">${pzIc('clock', 15)} Confirmando tu pago…</div>`
    : q.get('plan') === 'pending' ? `<div class="okmsg">${pzIc('clock', 15)} Tu pago está en proceso. Te avisamos cuando se acredite.</div>`
    // (ARMA TODO ítem 1) plan=error: aviso AMABLE arriba, sin rojo ni ❌ — no
    // hubo cargo y el reintento vive en Mi plan (esta misma vista scrollea
    // hasta ahí). El parámetro se limpia en bindSettings tras el scroll.
    : q.get('plan') === 'error' ? `<div id="planErrorMsg" style="margin:0 0 12px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.55">${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? "The payment wasn't completed — no charge was made. Whenever you're ready, we can try again from My plan." : 'El pago no se completó — no se hizo ningún cargo. Cuando quieras, lo intentamos de nuevo desde Mi plan.'}</div>` : '';
  const tokenWarn = s.ig_token_warning ? `<div class="err" style="margin-bottom:18px">${pzIc('alert', 15)} <b>Tu conexión con Instagram necesita atención:</b> no pudimos renovar tu token automáticamente. Reconectá tu cuenta abajo.</div>` : '';
  const bc = brandColors();
  // Resúmenes de estado en el título de cada sección (v257): texto chico a la
  // derecha del título. Todo con guardas: si el dato no está, no se muestra nada.
  let stIg = '', stPlan = '', stBrand = '', stPage = '';
  try { stIg = `<span class="ajsec-st">${p.ig_connected ? (p.ig_username ? 'Conectada · @' + esc(p.ig_username) : 'Conectada') : 'Sin conectar'}</span>`; } catch (e) {}
  try { if (typeof ME !== 'undefined' && ME && ME.plan) { const __pn = String(ME.plan); const __nm = __pn.charAt(0).toUpperCase() + __pn.slice(1); const __tl = (ME.is_trial && ME.trial_days_left) ? ` · quedan ${ME.trial_days_left} día${ME.trial_days_left === 1 ? '' : 's'}` : ''; stPlan = `<span class="ajsec-st">${esc(__nm)}${__tl}</span>`; } } catch (e) {}
  try { stBrand = `<span class="ajsec-st">${assetLogo() ? 'Logo cargado' : 'Sin logo'}</span>`; } catch (e) {}
  try { if (p.page_slug) stPage = `<span class="ajsec-st">${esc(p.page_slug)}</span>`; } catch (e) {}
  // (AJUSTES-CARPETAS) Si la URL trae un deep-link (?referidos=1, ?plan=1,
  // ...), la pantalla de detalle de esa sección nace abierta y el menú
  // nace oculto, sin flash: ajHid esconde las demás tarjetas desde el
  // primer render; bindSettings solo re-abre la misma vía ajFoldAbrir.
  const ajInitSec = q.get('plan') || q.get('plan_sel') ? 'plan'
    : (q.get('ig') || q.get('tiktok') || q.get('google') || q.get('tn') || q.get('conex')) ? 'conex'
    : q.get('auto') ? 'auto'
    : (q.get('avisos') || q.get('notif')) ? 'notif'
    : q.get('pagina') ? 'pagina'
    : (q.get('estilos') || q.get('marca')) ? 'marca'
    : q.get('referidos') ? 'referidos'
    : q.get('negocio') ? 'negocio'
    : q.get('avanzado') ? 'avanzado' : '';
  const ajHid = (s) => (ajInitSec && ajInitSec !== s) ? ' hidden' : '';
  // Resúmenes de una línea para las filas de la vista plana (texto plano, sin HTML).
  let stPlanTx = '', stBrandTx = '', stPageTx = '';
  try { if (typeof ME !== 'undefined' && ME && ME.plan) { const __pn = String(ME.plan); stPlanTx = __pn.charAt(0).toUpperCase() + __pn.slice(1) + ((ME.is_trial && ME.trial_days_left) ? ` · quedan ${ME.trial_days_left} día${ME.trial_days_left === 1 ? '' : 's'}` : ''); } } catch (e) {}
  try { stBrandTx = assetLogo() ? 'Logo cargado' : 'Sin logo'; } catch (e) {}
  try { stPageTx = p.page_slug || ''; } catch (e) {}
  const ajEn = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
  // (REDISEÑO SIMPLE RS-1) Fila "Pago": el riel que cobra esta cuenta
  // (ME.billing_provider: 'stripe' | 'mp' | null). Sin suscripción: todavía no hay pago.
  const rsPagoTx = (typeof ME !== 'undefined' && ME && ME.billing_provider === 'stripe') ? (ajEn ? 'Saved card' : 'Tarjeta guardada')
    : (typeof ME !== 'undefined' && ME && ME.billing_provider === 'mp') ? 'MercadoPago'
    : (ajEn ? 'No payment yet' : 'Sin pago todavía');
  // --- Bloque Instagram (vive dentro de "🔌 Conexiones") ---
  // Conectado y sano (con @ y sin aviso de token): colapsa a la fila de estado
  // + el botón de actualizar lo que Posty sabe. Con cualquier problema (o sin conectar) vuelve
  // el bloque completo: checklist, modo Demo/Real y guía profesional.
  const igHealthy = !!(p.ig_connected && p.ig_username && !s.ig_token_warning);
  const igCuentaRow = `
    <div class="set-row"><div><div class="t">Cuenta conectada</div>
      <div class="d">${p.ig_connected ? `${pzIc('checkCircle', 15)} @${esc(p.ig_username)} — lista para publicar${igSince(s) ? ` · conectada el ${igSince(s)}` : ''} · <a href="https://www.instagram.com/${esc(p.ig_username)}/" target="_blank" rel="noopener" style="color:var(--cel);font-weight:700">ver perfil</a>` : 'Todavía no conectaste tu Instagram. Necesitás una <b>cuenta profesional</b> (Business o Creator). <a href="#" id="igProLink" style="color:var(--cel);font-weight:700">¿Cómo la hago profesional?</a>'}</div>
      <div class="hint" style="margin-top:6px">${pzIc('lock', 15)} Posty puede publicar fotos y videos, y leer tu perfil. Nunca vemos ni guardamos tu contraseña.${p.ig_connected ? '<br>' + pzIc('key', 15) + ' Si cambiás tu contraseña de Instagram, reconectá tu cuenta acá para que los posteos sigan saliendo.' : ''}</div></div>
      ${p.ig_connected ? `<div style="display:flex;gap:8px;flex-wrap:wrap;flex:none"><button class="btn btn-soft btn-sm" id="btnIgVerify">${pzIc('search', 15)} Verificar conexión</button><button class="btn btn-danger btn-sm" id="btnIgDisc">Desconectar</button></div>` : `<button class="btn btn-primary btn-sm" id="btnIgConn">Conectar Instagram</button>`}
    </div>
    <div id="igVerifyMsg" style="margin-top:10px"></div>`;
  const igKnowRow = `
    <div style="margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-soft btn-sm" id="btnKnowUpdate">${pzIc('refresh', 18)} Actualizar lo que Posty sabe de mí</button>
      <span class="hint" id="knowMsg"></span>
    </div>
    <div class="hint" style="margin-top:6px">Relee tu Instagram completo: tu estilo visual, cómo escribís y tu brief — en ese orden.</div>`;
  const igBody = igHealthy ? `${igCuentaRow}${igKnowRow}
    <div id="igMsg"></div>` : `
    <div class="ig-checklist">
      <div class="t">Tu Instagram está listo cuando:</div>
      <div class="ig-check ${(p.ig_connected && p.ig_username) ? 'ok' : ''}">${(p.ig_connected && p.ig_username) ? pzIc('checkCircle', 15) : pzIc('circleEmpty', 15)} Cuenta profesional conectada</div>
      <div class="ig-check ${!s.demo_mode ? 'ok' : ''}">${!s.demo_mode ? pzIc('checkCircle', 15) : pzIc('circleEmpty', 15)} Modo demo apagado</div>
      <div class="ig-check ${IG_VERIFIED_AT ? 'ok' : ''}">${IG_VERIFIED_AT ? pzIc('checkCircle', 15) : pzIc('circleEmpty', 15)} Conexión verificada${IG_VERIFIED_AT ? ` <span style="color:var(--dim);font-weight:400">(${IG_VERIFIED_AT})</span>` : ''}</div>
    </div>
    <div class="set-row"><div><div class="t">${s.demo_mode ? `${pzIc('flask', 16)} Modo Demo` : `${pzIc('rocket', 16)} Modo Real`}</div>
      <div class="d">${s.demo_mode ? 'Posty <b>simula</b> las publicaciones: probás el flujo completo sin que salga nada real.' : 'Al conectar tu Instagram, Posty publica <b>de verdad</b>.'}</div></div>
      <button class="btn btn-soft btn-sm" id="${s.demo_mode ? 'igModeToReal' : 'igModeToDemo'}" style="flex:none">${s.demo_mode ? `Pasar a Real ${pzIc('rocket', 16)}` : `Volver a Demo ${pzIc('flask', 16)}`}</button>
    </div>
    ${IG_MODE_WARN ? `<div class="ig-warn" style="margin-bottom:14px">${pzIc('alert', 16)} Elegiste el modo <b>Real</b> pero todavía no conectaste tu Instagram. Conectalo abajo para publicar de verdad.</div>` : ''}
    ${igCuentaRow}
    ${p.ig_connected ? '' : `<div style="margin-top:14px">
      <div style="font-weight:700;font-size:13px">¿Todavía no conectás?</div>
      <p style="color:var(--mut);font-size:11.5px;margin:4px 0 10px">Escribí tu @ y te analizo igual — tu estilo, tus horarios y tu competencia — sin conectar nada.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:170px;margin:0"><input id="s_iguser" value="${esc(p.ig_username)}" placeholder="tu_usuario" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
        <button class="btn btn-primary btn-sm" id="btnIgUserSave" style="flex:none">Guardar @</button>
        <span id="igUserMsg"></span>
      </div>
    </div>`}
    ${igKnowRow}
    <div id="igProGuide" style="display:none;margin-top:4px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#F2F9FD">
      <div style="font-weight:800;margin-bottom:10px">${pzIc('phone', 16)} Hacé tu cuenta profesional <span style="font-weight:400;color:var(--dim);font-size:11.5px">(gratis, 30 segundos)</span></div>
      <ol style="margin:0 0 12px 20px;padding:0;font-size:11.5px;color:var(--mut);line-height:1.8">
        <li>Abrí Instagram y andá a tu perfil</li>
        <li>Tocá <b>☰</b> → <b>Configuración y privacidad</b></li>
        <li><b>Tipo de cuenta y herramientas</b> → <b>Cambiar a cuenta profesional</b></li>
        <li>Elegí <b>Creator</b> o <b>Business</b> y completá los pasos</li>
      </ol>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn-soft btn-sm" href="https://www.instagram.com/" target="_blank" rel="noopener">${pzIc('install', 18)} Abrir Instagram</a>
        <button class="btn btn-primary btn-sm" id="btnIgRetry">${pzIc('refresh', 18)} Ya la hice profesional — conectar</button>
      </div>
      <div class="hint" style="margin-top:8px">Instagram no permite hacer este cambio desde otra app: se hace dentro de Instagram, por eso te llevamos hasta ahí.</div>
    </div>
    <div id="igMsg"></div>`;
  return `<div class="page-head aj-head"><div class="ph-ico">${pzIc('gear', 26)}</div><div class="ph-txt"><h1>Ajustes</h1><p class="sub">${ajEn ? 'Billing, language and connections only. Your business is not edited here.' : 'Solo facturación, idioma y conexiones. Acá no se edita tu negocio.'}</p></div></div>
  ${igMsg}${ttMsg}${ggMsg}${tnMsg}${planMsg}${tokenWarn}
  <div id="ajMenu"${ajInitSec ? ' hidden' : ''}>
    <div class="insight chat-fix">
      ${pzIc('chat', 18)}
      <p><b>${ajEn ? 'Something Posty knows about you is wrong?' : '¿Algo de lo que Posty sabe de vos está mal?'}</b> ${ajEn ? 'What you sell, your tone, a promo or prices are not changed with a form: tell Posty in the chat and it fixes it.' : 'Qué vendés, tu tono, una promo o los precios no se cambian con un formulario: decíselo por el chat y Posty lo corrige.'}</p>
    </div>
    <button type="button" class="big-ghost" onclick="bbGo('#/app/chat')">${ajEn ? 'Fix it in the chat →' : 'Corregirlo en el chat →'}</button>
    <div class="sec-head"><h2>${ajEn ? 'Billing' : 'Facturación'}</h2></div>
    <div class="know">
      <div class="row" data-ajnav="plan"><span class="k">${ajEn ? 'Plan' : 'Plan'}</span><span class="v" id="rsPlanVal">${esc(stPlanTx) || (ajEn ? 'Monthly' : 'Mensual')}</span><button type="button" class="linklike">${ajEn ? 'View' : 'Ver'}</button></div>
      <div class="row" data-ajnav="plan"><span class="k">${ajEn ? 'Payment' : 'Pago'}</span><span class="v">${esc(rsPagoTx)}</span><button type="button" class="linklike">${ajEn ? 'Change' : 'Cambiar'}</button></div>
      <div class="row" onclick="bbGo('#/app/ads')"><span class="k">${ajEn ? 'Balance' : 'Saldo'}</span><span class="v" id="rsSaldoVal">${ajEn ? 'To boost · loading…' : 'Para impulsar · cargando…'}</span><button type="button" class="linklike">${ajEn ? 'Top up' : 'Cargar'}</button></div>
    </div>
    <div class="sec-head"><h2>${ajEn ? 'Language' : 'Idioma'}</h2></div>
    <div class="know">
      <div class="row"><span class="k">${ajEn ? 'Language' : 'Idioma'}</span><span class="v" id="rsLangVal">${ajEn ? 'English' : 'Español'}</span><button type="button" class="linklike" id="rsLangBtn">${ajEn ? 'Change' : 'Cambiar'}</button></div>
    </div>
    <div class="sec-head"><h2>${ajEn ? 'Connections' : 'Conexiones'}</h2></div>
    <div class="know">
      <div class="row" data-ajnav="conex"><span class="k">Instagram</span><span class="v">${esc(p.ig_username ? '@' + p.ig_username : (ajEn ? 'Not connected' : 'Sin conectar'))}</span><span class="st ${p.ig_connected ? 'st-ok' : 'st-off'}">${p.ig_connected ? (ajEn ? 'Connected' : 'Conectado') : (ajEn ? 'Not connected' : 'Sin conectar')}</span><span class="chev">›</span></div>
      <div class="row" data-ajnav="notif"><span class="k">${ajEn ? 'Alerts' : 'Avisos'}</span><span class="v">${ajEn ? 'Before every post' : 'Antes de cada posteo'}</span><span class="st st-ok" id="rsAvisosChip">…</span><span class="chev">›</span></div>
    </div>
    <div class="sec-head"><h2>${ajEn ? 'More' : 'Más'}</h2></div>
    <div class="know">
      <div class="row" data-ajnav="auto"><span class="k">${ajEn ? 'Posty on autopilot' : 'Posty en automático'}</span><span class="v" id="ajStAutoMenu"></span><span class="chev">›</span></div>
      <div class="row" data-ajnav="marca"><span class="k">${ajEn ? 'Your brand' : 'Tu marca'}</span><span class="v">${esc(stBrandTx)}</span><span class="chev">›</span></div>
      <div class="row" data-ajnav="pagina"><span class="k">${ajEn ? 'Your page' : 'Tu página'}</span><span class="v">${esc(stPageTx) || (ajEn ? 'Your link in bio' : 'Tu link en la bio')}</span><span class="chev">›</span></div>
      <div class="row" data-ajnav="avanzado"><span class="k">${ajEn ? 'Advanced settings' : 'Configuración avanzada'}</span><span class="v">${ajEn ? 'Meta embed URL' : 'Dirección de embed de Meta'}</span><span class="chev">›</span></div>
    </div>
    <div class="know" style="margin-top:14px">
      <div class="row" id="btnLogoutAj"><span class="k" style="color:var(--red)">${ajEn ? 'Log out' : 'Salir'}</span><span class="chev">›</span></div>
    </div>
  </div>
  <div id="ajDetail"${ajInitSec ? '' : ' hidden'}>
    <button type="button" class="ajback" id="ajBackBtn">‹ ${ajEn ? 'Settings' : 'Ajustes'}</button>
  <div class="card ajsec ajflat"${ajHid('notif')} id="ajsec-notif"><div class="ajsec-h"><h3>${pzIc('bell', 20)} ${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Notifications' : 'Notificaciones'}</h3><span class="ajsec-st" id="ajStAvisos"></span></div><div class="ajsec-b">
    <div id="avisosPushHint" style="margin-bottom:12px">
      <div id="ajPushOff">
        <p id="ajPushOffTxt" style="color:var(--mut);font-size:11.5px;margin-bottom:10px">${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'You have not turned on notifications on your phone yet: your alerts are on, but they have nowhere to go.' : 'Todavía no activaste las notificaciones en tu celu: los avisos quedan prendidos, pero no tienen dónde llegar.'}</p>
        <button class="btn btn-primary" id="btnPushEnable">${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Activate notifications' : 'Activar notificaciones'}</button>
        <div class="err" id="pzPushErr" style="display:none;margin-top:8px"></div> <!-- (LOTE PUSH-ERROR-VISIBLE) -->
        <div class="hint" id="ajPushOffHint" style="margin-top:8px">${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'When Posty asks permission to send notifications, tap Allow.' : 'Cuando Posty te pida permiso para mandar notificaciones, tocá Permitir.'}</div>
      </div>
      <div id="ajPushOn" style="display:none">${pzIc('checkCircle', 15)} ${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Notifications on in your phone.' : 'Notificaciones activadas en tu celu.'}</div>
    </div>
        <div style="font-weight:800;margin-bottom:6px">Aviso antes de publicar</div>
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:10px">Te aviso 30 minutos antes de que salga cada posteo automático, para que puedas frenarlo desde Schedule si querés.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnPreNotifyToggle">Cargando...</button>
      <span id="preNotifyStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="font-weight:800;margin:12px 0 6px">${pzIc('mail', 16)} Tu carta del domingo</div>
        <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnLetterToggle">Cargando...</button>
      <span id="letterNotifyStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="font-weight:800;margin:12px 0 6px">${pzIc('alert', 16)} Si un posteo no pudo salir</div>
        <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnFailToggle">Cargando...</button>
      <span id="failNotifyStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="font-weight:800;margin:12px 0 6px">Tu carta por WhatsApp</div>
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:10px">Cada domingo a la noche, con el botón para aprobar tu semana en un toque.</p>
    <div class="field"><label>Tu número de WhatsApp</label><input id="s_waNotify" placeholder="Ej.: 5491123456789" inputmode="tel" maxlength="20" autocomplete="off"><div class="hint">Con código de país (Argentina: 54 9 + tu número). Solo lo uso para mandarte tu carta y avisos de tu semana.</div></div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
      <button class="btn btn-ghost" id="btnWaNotifyToggle">Cargando...</button>
      <span id="waNotifyStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div class="hint" id="waNotifyGateHint" style="display:none;margin-top:10px">WhatsApp todavía no está encendido del lado de Posty: podés dejar tu número y tu permiso guardados, y te llega apenas se encienda. Mientras tanto, tu carta llega por notificación y en Estrategia.</div>
  </div></div>
  <div class="card ajsec ajflat"${ajHid('plan')} id="ajsec-plan"><div class="ajsec-h"><h3>${pzIc('card', 20)} Mi plan</h3>${stPlan}</div><div class="ajsec-b">
    <div id="planZone"><p style="color:var(--dim)">Cargando...</p></div>
    <p style="font-size:11.5px;color:var(--mut);margin-top:12px">${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? "If your first week doesn't convince you, we'll redo the whole week for you, free." : 'Si tu primera semana no te convence, te la rehacemos entera, gratis.'}</p>
    <div id="founderZone"></div>
  </div></div>
<div class="card ajsec ajflat"${ajHid('auto')} id="ajsec-auto"><div class="ajsec-h"><h3>${pzIc('bolt', 20)} Posty en automático</h3><span class="ajsec-st" id="ajStAuto"></span></div><div class="ajsec-b">
    <div style="font-weight:800;margin-bottom:8px">⏸ Pausar todo</div>
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:12px">Lo programado vuelve a borrador y nada sale hasta que reanudes.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnPauseAll">Cargando...</button>
      <span id="pauseStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="border-bottom:1px solid var(--line);margin:18px 0"></div>
    <div style="font-weight:800;margin-bottom:8px">Publicación</div>
        <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnAutopilotToggle">Cargando...</button>
      <span id="autopilotStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div id="autopilotInfo" style="font-size:11.5px;color:var(--dim);margin-top:8px"></div>
    <div style="font-weight:800;margin:12px 0 6px">Tu semana</div>
        <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnAutoWeekToggle">Cargando...</button>
      <span id="autoWeekStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="font-weight:800;margin:12px 0 6px">Cuando subo fotos</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <select id="sftDefaultSel" style="font-size:14px;border-radius:10px;padding:9px 12px;border:1px solid rgba(10,30,51,.15);background:#fff;color:#0A1E33;max-width:100%">
        <option value="preguntar">Preguntar siempre</option>
        <option value="guardar">Solo guardarla</option>
        <option value="semana">Usarla en la semana</option>
        <option value="armar">Que Posty lo arme</option>
      </select>
      <span id="sftDefaultStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
    <div style="font-weight:800;margin:12px 0 6px">${pzIc('globe', 16)} Tu semana en dos idiomas</div>
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:12px">No cambia el idioma de la app.</p>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="btn btn-ghost" id="btnBilingualWeekToggle">Cargando...</button>
      <span id="bilingualWeekStatus" style="font-size:12px;color:var(--dim)"></span>
    </div>
  </div></div>
<div class="card ajsec ajflat"${ajHid('conex')} id="ajsec-conex"><div class="ajsec-h"><h3>${pzIc('plug', 20)} Conexiones</h3>${stIg}</div><div class="ajsec-b">
    <div style="font-weight:800;margin-bottom:8px">${pzIc('camera', 16)} Instagram</div>
    ${igBody}
    <div id="pzBioSealSlot"></div>
    <div style="font-weight:800;margin:12px 0 6px">${pzIc('music', 16)} TikTok</div>
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:12px">Cada posteo publicado suma el botón <b>${pzIc('music', 16)} Compartir en TikTok</b>. Posty nunca publica ahí sin que lo pidas.</p>
    <div id="ttZone"><p class="hint">Cargando…</p></div>
    <div id="ttMsg"></div>
    <div style="font-weight:800;margin:12px 0 6px">Google · Reseñas</div>
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:12px">Respondé las reseñas de tu ficha de Google sin salir de Posty: escribí <b>reseñas</b> en el chat y Posty te deja cada respuesta lista para mandar con un toque.</p>
    <div id="ggZone"><p class="hint">Cargando…</p></div>
    <div id="ggMsg"></div>
    <div style="font-weight:800;margin:12px 0 6px">${pzIc('bag', 16)} Tiendanube</div>
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:12px">Posty lee tu catálogo y stock para postear solo lo que tenés. Solo lee: nunca toca precios ni stock.</p>
    <div id="tnZone"><p class="hint">Cargando…</p></div>
    <div id="tnMsg"></div>
  </div></div>
  <div class="card ajsec ajflat"${ajHid('marca')} id="ajsec-marca"><div class="ajsec-h"><h3>${pzIc('palette', 20)} Tu marca</h3>${stBrand}</div><div class="ajsec-b">
        <div class="row2">
      <div class="field"><label>Logo</label>
        <div style="display:flex;gap:10px;align-items:center">
          ${assetLogo() ? `<img src="${assetLogo().file_path}" style="max-height:48px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:4px">` : '<span style="color:var(--dim);font-size:11.5px">Sin logo</span>'}
          <button class="btn btn-ghost btn-sm" id="btnBrandLogo">${pzIc('share', 18)} ${assetLogo() ? 'Cambiar' : 'Subir'}</button>
          ${assetLogo() ? '<button class="btn btn-ghost btn-sm" id="btnBrandLogoDel">' + pzIc('trash', 18) + ' Quitar</button>' : ''}
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
      <div class="hint">Subí tu logo y detectamos tus colores, o elegilos a mano. El principal domina los diseños, el secundario lo acompaña y el acento va en detalles.</div>
    </div>
    <div class="field"><label>${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Headline font' : 'Tipografía de tus titulares'}</label>
      <div style="font-size:11.5px;color:var(--mut);margin-bottom:10px">${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'It changes only the headline inside your post images.' : 'Solo cambia el titular dentro de tus posteos.'}</div>
      <div id="fontRow" style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px"></div>
      <div class="hint">${(typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Applies to new weeks and regenerations. Published posts keep their look.' : 'Aplica a semanas nuevas y regeneraciones. Los posteos ya publicados conservan su look.'}</div>
    </div>
    <div class="field"><label>Vista previa</label>
      <div id="brandPrev"></div>
          </div>
    <div class="field"><label>Foto de perfil</label>
      <div style="display:flex;gap:12px;align-items:center">
        <div class="brand-pf" id="brandPf"></div>
              </div>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnSaveBrand">Guardar marca</button> <span id="brandMsg"></span>
      <span id="brandDirty" style="display:none;color:var(--yel);font-size:11.5px;font-weight:700">● Tenemos cambios sin guardar</span>
    </div>
    <div style="margin-top:10px"><button class="linklike" id="btnResetBrand" style="font-size:11.5px;color:var(--mut);text-decoration:underline;background:none;border:0;cursor:pointer;padding:0">Reiniciar todo</button></div>
  </div></div>
  <div class="card ajsec ajflat"${ajHid('pagina')} id="ajsec-pagina"><div class="ajsec-h"><h3>${pzIc('globe', 20)} Tu página</h3>${stPage}</div><div class="ajsec-b">
    <p style="color:var(--mut);font-size:11.5px;margin-bottom:12px">Tu link para la <b>bio de Instagram</b>: tu negocio y tus posteos ya publicados, con botón a tu WhatsApp.</p>
    <div class="field"><label>Tu dirección</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:13.5px;color:var(--mut)">postycommunitymanager.com/p/</span>
        <input id="s_slug" value="${esc(p.page_slug || '')}" maxlength="40" style="flex:1;min-width:150px" autocomplete="off" autocapitalize="none">
        <button class="btn btn-ghost btn-sm" id="btnCopyPage" type="button" style="flex:none">${pzIc('copy', 18)} Copiar link</button>
      </div>
      <div class="hint">Solo letras minúsculas, números y guiones. Si la dirección está libre, queda para vos.</div></div>
    <div class="field"><label>${pzIc('chat', 16)} WhatsApp de tu negocio</label><input id="s_whats" value="${esc(p.whatsapp || '')}" placeholder="Ej.: 5491123456789" inputmode="tel" maxlength="20" autocomplete="off"><div class="hint">El número al que te escriben tus clientes, con código de país (Argentina: 54 9 + tu número). Aparece como botón grande en tu página.</div></div>
    <div class="field"><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="s_pageon" ${p.page_enabled === 0 ? '' : 'checked'}> Página visible para todos</label><div class="hint">Si la apagás, tu link muestra "página no disponible". Solo se ven posteos ya publicados — nunca borradores.</div></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="btnSavePage" type="button">Guardar página</button>
      <span id="pageMsg"></span>
      <a href="/p/${esc(p.page_slug || '')}" target="_blank" rel="noopener" id="pagePreviewLink" style="font-size:13.5px;font-weight:700">Ver mi página ${pzIc('arrowRight', 13)}</a>
    </div>
  </div></div>
  <details class="card int-advanced"${ajHid('avanzado')} id="ajsec-avanzado"${ajInitSec === 'avanzado' ? ' open' : ''}><summary>${pzIc('gear', 16)} Configuración avanzada</summary>
    <p class="hint" style="margin:12px 0">Solo si necesitás pegar la dirección de embed que Meta genera para tu Instagram. La mayoría no tiene que tocar nada acá.</p>
    <div class="int-block"><h4>Instagram Embed URL</h4>
      <div class="field"><label>Instagram Embed URL</label>
        <input id="s_igembed" value="${esc(s.ig_embed_url)}" placeholder="https://www.instagram.com/oauth/authorize?...">
        <p class="hint">La dirección que Meta genera para conectar tu Instagram. Se copia del dashboard de Meta: caso de uso Instagram → "API setup with Instagram login".</p></div>
    </div>
    <button class="btn btn-primary" id="btnSaveSettings">Guardar</button> <span id="setMsg"></span>
  </details>
  </div>
  <div id="gzAjustesBox"></div>`;
}


// TikTok semanal (Lote 7): fila de opt-in dentro de la zona TikTok.
// El toggle guarda solo la preferencia; publicar exige conexión +
// auditoría (TIKTOK_AUDITED=1), y la UI lo dice sin prometer nada.
function ttSemanalRow(sem, connected) {
  const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
  const on = !!(sem && sem.optin);
  const aud = !!(sem && sem.audited);
  const nota = !aud
    ? (en ? 'Weekly TikTok is not live yet: TikTok\'s audit is still pending. Your preference is saved and videos will start going out on their own once it is approved.'
           : 'TikTok semanal todavía no está activo: falta la auditoría de TikTok. Tu preferencia queda guardada y los videos empiezan a salir solos cuando se apruebe.')
    : !connected
    ? (en ? 'Connect your TikTok so your weekly videos can go out on their own.'
           : 'Falta conectar tu TikTok para que tus videos semanales salgan solos.')
    : on
    ? (en ? 'Your weekly videos go out on TikTok on their own.'
           : 'Tus videos semanales salen solos en TikTok.')
    : (en ? 'Your weekly videos do NOT go to TikTok unless you ask.'
           : 'Tus videos semanales NO salen en TikTok salvo que lo pidas.');
  const last = (sem && Array.isArray(sem.last) && sem.last.length)
    ? `<div class="hint" style="margin-top:6px">${(sem.last || []).map(r => `${esc(r.status || '')}${r.privacy ? ' · ' + esc(r.privacy) : ''}${r.created_at ? ' · ' + esc(String(r.created_at).slice(0, 10)) : ''}`).join('<br>')}</div>`
    : '';
  return `<div class="set-row" style="margin-top:12px"><div><div class="t">TikTok semanal (opcional)</div>
    <div class="d">${nota}</div>${last}</div>
    <button class="btn ${on ? 'btn-danger' : 'btn-primary'} btn-sm" id="btnTtSemanal" style="flex:none">${on ? (en ? 'Turn off weekly TikTok' : 'Desactivar TikTok semanal') : (en ? 'Turn on weekly TikTok' : 'Activar TikTok semanal')}</button></div>`;
}
async function ttSemanalToggle() {
  try {
    const st = await api.get('/api/tiktok/status');
    const cur = !!(st && st.semanal && st.semanal.optin);
    await api.post('/api/tiktok/optin', { opt_in: !cur });
  } catch (e) {}
  ttZoneLoad();
}

// Zona TikTok: estado desde /api/tiktok/status (configurado / conectado).
async function ttZoneLoad() {
  const zone = $('#ttZone');
  if (!zone) return;
  let st = null;
  try { st = await api.get('/api/tiktok/status'); } catch (e) { /* queda el fallback */ }
  if (!st) { zone.innerHTML = '<p class="hint">No se pudo cargar el estado de TikTok.</p>'; return; }
  if (!st.configured) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">${pzIc('music', 16)} TikTok — Próximamente</div>
      <div class="d">Estamos terminando la conexión con TikTok. Cuando esté lista, vas a poder compartir tus posteos ahí con un toque, sin salir de Posty.</div></div></div>`;
    return;
  }
  if (!st.connected) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta de TikTok</div>
      <div class="d">Todavía no conectaste tu TikTok. Al conectar, Posty puede compartir tus posteos ahí cuando vos lo pidas — nunca publica solo.</div>
      <div class="hint" style="margin-top:6px">${pzIc('lock', 15)} Entrás con el login oficial de TikTok. Nunca vemos ni guardamos tu contraseña.</div></div>
      <button class="btn btn-primary btn-sm" id="btnTtConn" style="flex:none">Conectar TikTok</button></div>`;
    const bc = $('#btnTtConn');
    if (bc) bc.onclick = () => { location.href = '/api/tiktok/connect'; };
    zone.innerHTML += ttSemanalRow(st.semanal, false);
    const bs = $('#btnTtSemanal');
    if (bs) bs.onclick = ttSemanalToggle;
    return;
  }
  zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta conectada</div>
    <div class="d">${pzIc('checkCircle', 15)} ${st.username ? '@' + esc(st.username) : 'Tu TikTok'} — lista para compartir tus posteos</div>
    <div class="hint" style="margin-top:6px">En cada posteo publicado de tu Schedule vas a ver el botón <b>${pzIc('music', 16)} Compartir en TikTok</b>.</div></div>
    <button class="btn btn-danger btn-sm" id="btnTtDisc" style="flex:none">Desconectar</button></div>`;
  const bd = $('#btnTtDisc');
  if (bd) bd.onclick = async () => {
    if (!confirm('¿Desconectar tu TikTok de Posty?')) return;
    try { await api.post('/api/tiktok/disconnect'); } catch (e) {}
    ttZoneLoad();
  };
  zone.innerHTML += ttSemanalRow(st.semanal, true);
  const bs2 = $('#btnTtSemanal');
  if (bs2) bs2.onclick = ttSemanalToggle;
}

// Zona Google: estado desde /api/google/status (configurado / conectado).
async function ggZoneLoad() {
  const zone = $('#ggZone');
  if (!zone) return;
  let st = null;
  try { st = await api.get('/api/google/status'); } catch (e) { /* queda el fallback */ }
  if (!st) { zone.innerHTML = '<p class="hint">No se pudo cargar el estado de Google.</p>'; return; }
  if (!st.configured) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">Google — Próximamente</div>
      <div class="d">Estamos terminando la conexión con Google. Cuando esté lista, vas a poder responder las reseñas de tu negocio con un toque, sin salir de Posty.</div></div></div>`;
    return;
  }
  if (!st.connected) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta de Google</div>
      <div class="d">Todavía no conectaste tu Google. Al conectar, Posty trae las reseñas de tu ficha y te deja cada respuesta lista — nunca responde solo.</div>
      <div class="hint" style="margin-top:6px">${pzIc('lock', 15)} Entrás con el login oficial de Google. Nunca vemos ni guardamos tu contraseña.</div></div>
      <button class="btn btn-primary btn-sm" id="btnGgConn" style="flex:none">Conectar Google</button></div>`;
    const bc = $('#btnGgConn');
    if (bc) bc.onclick = () => { location.href = '/api/google/connect'; };
    return;
  }
  zone.innerHTML = `<div class="set-row"><div><div class="t">Cuenta conectada</div>
    <div class="d">${pzIc('checkCircle', 15)} ${st.businessName ? esc(st.businessName) : 'Tu ficha de Google'} — lista para responder reseñas</div>
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
    zone.innerHTML = `<div class="set-row"><div><div class="t">${pzIc('bag', 16)} Tiendanube — Muy pronto</div>
      <div class="d">Estamos terminando la conexión con Tiendanube. Cuando esté lista, vas a poder conectar tu tienda con un toque y Posty va a postear solo lo que tenés en stock.</div></div></div>`;
    return;
  }
  if (!st.connected) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">Tu tienda de Tiendanube</div>
      <div class="d">Conectá tu tienda y Posty postea solo lo que tenés en stock, con tu producto más vendido al frente.</div>
      <div class="hint" style="margin-top:6px">${pzIc('lock', 15)} Entrás con el login oficial de Tiendanube. Nunca vemos ni guardamos tu contraseña, y Posty solo lee: nunca toca precios ni stock.</div></div>
      <button class="btn btn-primary btn-sm" id="btnTnConn" style="flex:none">Conectar Tiendanube</button></div>`;
    const bc = $('#btnTnConn');
    if (bc) bc.onclick = () => { location.href = '/api/connections/tiendanube/start'; };
    return;
  }
  if (st.broken) {
    zone.innerHTML = `<div class="set-row"><div><div class="t">${pzIc('bag', 16)} Tiendanube</div>
      <div class="d">${pzIc('alert', 15)} La conexión con ${st.store_name ? esc(st.store_name) : 'tu tienda'} se cortó. Volvé a conectarla para que Posty siga leyendo tu stock y tus ventas.</div></div>
      <button class="btn btn-primary btn-sm" id="btnTnConn" style="flex:none">Reconectar</button></div>`;
    const bc = $('#btnTnConn');
    if (bc) bc.onclick = () => { location.href = '/api/connections/tiendanube/start'; };
    return;
  }
  const datos = [];
  if (st.products_total != null) datos.push(`${st.products_total} productos`);
  if (st.star && st.star.name) datos.push(`tu más vendido: <b>${esc(st.star.name)}</b> (${st.star.units_30d} ventas en 30 días)`);
  let syncTxt = '';
  if (st.synced_at) {
    const d = new Date(String(st.synced_at).replace(' ', 'T'));
    if (!isNaN(d)) syncTxt = ` · Actualizado ${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  zone.innerHTML = `<div class="set-row"><div><div class="t">Tienda conectada</div>
    <div class="d">${pzIc('checkCircle', 15)} ${st.store_name ? esc(st.store_name) : 'Tu Tiendanube'} — Posty lee tu catálogo, tu stock y tus ventas</div>
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

// v186: galería "${pzIc('palette', 16)} Estilos de tus posteos" — muestras fieles (mismo motor
// de composición que los posteos) y hasta 3 favoritos persistidos. Todo
// opcional: sin favoritos, Posty elige como siempre.
// --- 📝 MEMORIA DE GUSTOS: «Lo que aprendí de vos» (GET /api/gustos) ---
async function gustosZoneLoad() {
  const zone = document.getElementById('gustosZone');
  if (!zone) return;
  const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
  let data = null;
  try { data = await api.get('/api/gustos'); } catch (e) { /* queda el fallback */ }
  const list = (data && Array.isArray(data.gustos)) ? data.gustos : [];
  if (!list.length) {
    zone.innerHTML = `<p class="hint">${en ? "I haven't learned any of your tastes yet. Correct me twice the same way and I'll offer to note it in the chat — or just tell me («no hashtags», «short texts») and I note it right away." : 'Todavía no aprendí ningún gusto tuyo. Cuando me corrijas dos veces lo mismo, te propongo anotarlo en el chat — y si me lo pedís directo («sin hashtags», «textos cortos»), lo anoto al instante.'}</p>`;
    return;
  }
  zone.innerHTML = list.map(g => `
    <div class="set-row" style="align-items:flex-start">
      <div><div class="t">${esc(g.label || '')}</div>
      <div class="d">${esc(g.origen_label || '')}${g.ejemplo ? `<br><span style="color:var(--dim)">«${esc(String(g.ejemplo).slice(0, 90))}»</span>` : ''}</div>
      ${g.estado === 'pausa_regla' ? `<div class="hint" style="margin-top:4px;color:#B3402E">⏸ ${en ? 'paused by a quality rule' : 'en pausa por regla de calidad'}: ${esc(g.regla || '')} — ${en ? 'the rule wins' : 'la regla manda'}</div>` : ''}</div>
      <button class="btn btn-danger btn-sm" style="flex:none" data-gusto-del="${esc(g.id)}">${pzIc('trash', 18)} ${en ? 'Delete' : 'Borrar'}</button>
    </div>`).join('');
  zone.querySelectorAll('[data-gusto-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm(en ? 'Delete this taste?' : '¿Borrar este gusto?')) return;       b.disabled = true;
      try { await api.delete('/api/gustos/' + encodeURIComponent(b.dataset.gustoDel)); } catch (e) {}
      gustosZoneLoad();
    };
  });
}

async function styleGalleryLoad() {
  const box = document.getElementById('styleGallery');
  if (!box) return;
  const msg = document.getElementById('styleFavMsg');
  let data = null;
  try { data = await api.get('/api/image-styles'); } catch (e) {}
  const rec = (data && data.recommended) || [];
  let favs = ((data && data.favorites) || []).slice();
  if (!rec.length) {
    box.innerHTML = '<div style="color:var(--mut);font-size:12.5px">Por ahora no hay estilos para mostrarte — Posty sigue eligiendo por vos</div>';
    return;
  }
  const paint = () => {
    box.innerHTML = '<div class="sgal-grid">' + rec.map((s) => {
      const on = favs.includes(s.code);
      return `<div class="sgal-card${on ? ' on' : ''}">
        <img class="sgal-img" src="/api/style-sample?style=${encodeURIComponent(s.code)}" alt="Muestra del estilo ${esc(s.name)}" loading="lazy" onerror="this.style.opacity='0'">
        <div class="sgal-name">${esc(s.name)}</div>
        <button type="button" class="sgal-btn" data-sgal-code="${esc(s.code)}">${on ? (pzIc('starFill', 18) + ' Favorito') : (pzIc('star', 18) + ' Marcar favorito')}</button>
      </div>`;
    }).join('') + '</div>';
    box.querySelectorAll('[data-sgal-code]').forEach((b) => { b.onclick = () => toggle(b.getAttribute('data-sgal-code')); });
  };
  const toggle = async (code) => {
    let next;
    if (favs.includes(code)) next = favs.filter((c) => c !== code);
    else {
      if (favs.length >= 3) { if (msg) msg.textContent = 'Hasta 3 favoritos — sacá uno para cambiarlo por otro.'; return; }
      next = favs.concat([code]);
    }
    try {
      const r = await api.put('/api/style-favorites', { favorites: next });
      if (r && r.ok) {
        favs = r.favorites || next;
        if (msg) msg.innerHTML = favs.length ? `${pzIc('star', 15)} Guardado: tus posteos nuevos van a preferir estos estilos.` : 'Listo: sin favoritos, Posty elige por vos';
        paint();
      } else if (msg) msg.textContent = 'No se pudo guardar — probá de nuevo.';
    } catch (e) { if (msg) msg.textContent = 'No se pudo guardar — probá de nuevo.'; }
  };
  paint();
}

// --- Compartir mi semana (v398): link público firmado de solo lectura ---
// (LOTE AJUSTES-SIMPLE) ¿El celu tiene suscripción NATIVA (apns/fcm)?
// Una suscripción web NO cuenta: no debe esconder el botón nativo.
// Sin campo (servidor viejo) o sin prefs: false -> fail-open, botón visible.
function ajPushNativeOn(r) {
  try {
    if (r && typeof r.has_native_push_sub === 'boolean') return r.has_native_push_sub;
  } catch (e) {}
  return false;
}

// (AJUSTES-CARPETAS) Menú estilo Instagram: cada sección vive en su propia
// pantalla de detalle dentro de #ajDetail; ajNav muestra una y oculta el
// menú, y el botón ‹ vuelve al menú navegando por hash (#/app/ajustes).
// Las filas del menú navegan por hash
// (#/app/ajustes?plan=1, ...) y ajustesView ya nace en la pantalla destino
// cuando la URL trae el deep-link, sin flash.
const AJ_SECCIONES = ['notif', 'plan', 'auto', 'conex', 'marca', 'pagina', 'avanzado'];
function ajNav(id) {
  if (!id || AJ_SECCIONES.indexOf(id) === -1) return;
  const menu = document.getElementById('ajMenu');
  const det = document.getElementById('ajDetail');
  if (!menu || !det) return;
  menu.hidden = true; det.hidden = false;
  AJ_SECCIONES.forEach((s) => { const c = document.getElementById('ajsec-' + s); if (c) c.hidden = (s !== id); });
  const av = document.getElementById('ajsec-avanzado');
  if (av && id === 'avanzado') av.open = true;
  try { window.scrollTo(0, 0); } catch (e) {}
}
// Compat: antes las secciones se plegaban en la misma página (AJ_FOLDABLE);
// ahora cada una abre su pantalla de detalle. ajFoldAbrir sigue siendo la
// puerta que usan los deep-links de bindSettings y app.js (tras pagar, abre
// Mi plan). ajFoldInit ya no pliega nada: queda como no-op para no romper
// a quien la llama.
const AJ_FOLDABLE = ['negocio', 'plan', 'auto', 'conex', 'marca', 'pagina'];
function ajFoldAbrir(id) { ajNav(id); }
function ajFoldInit() {}

function bindSettings() {
  // (ARMA TODO ítem 1) plan=error ya se mostró en ajustesView: limpiamos el
  // parámetro para que un refresh no resucite el aviso. Diferido a propósito:
  // render() usa el MISMO parámetro, apenas después de bindApp, para abrir la
  // sección Mi plan y scrollear hasta ella (su timeout es de 80 ms).
  try {
    const _pqErr = new URLSearchParams(location.hash.split('?')[1] || '');
    if (_pqErr.get('plan') === 'error') setTimeout(() => { try { if ((location.hash || '').indexOf('plan=error') > -1) history.replaceState(null, '', location.pathname + '#/app/ajustes'); } catch (e) {} }, 400);
  } catch (e) {}
  // Los deep-links (?plan, ?ig, ...) abren la pantalla de detalle destino
  // vía ajFoldAbrir. (?plan_sel= también aterriza en Mi plan; la zona del
  // plan sigue leyendo plan_sel para preseleccionar el tier.)
  const ajDeepSec = () => {
    try {
      const pq = new URLSearchParams(location.hash.split('?')[1] || '');
      if (pq.get('plan')) return 'plan';
      if (pq.get('plan_sel')) return 'plan';
      if (pq.get('ig') || pq.get('tiktok') || pq.get('google') || pq.get('tn')) return 'conex';
      if (pq.get('conex')) return 'conex';
      if (pq.get('auto')) return 'auto';
      if (pq.get('avisos')) return 'notif';
      if (pq.get('notif')) return 'notif';
      if (pq.get('pagina')) return 'pagina';
      if (pq.get('estilos') || pq.get('marca')) return 'marca';
      if (pq.get('referidos')) return 'referidos';
      if (pq.get('avanzado')) return 'avanzado';
    } catch (e) {}
    return '';
  };
  try { ajFoldInit(); } catch (e) {}
  const ajDeep = ajDeepSec();
  // (REDISEÑO SIMPLE RS-1) ?referidos=1 ya no abre una sección (se eliminó):
  // abre la hoja de referidos del shell. El resto sigue abriendo su detalle.
  if (ajDeep === 'referidos') setTimeout(() => { try { rsShareOpen(); } catch (e) {} }, 120);
  else if (ajDeep) setTimeout(() => { try { ajFoldAbrir(ajDeep); } catch (e) {} }, 120);
  const ajBack = document.getElementById('ajBackBtn');
  if (ajBack) ajBack.onclick = () => { location.hash = '#/app/ajustes'; };
  document.querySelectorAll('[data-ajnav]').forEach((b) => { b.onclick = () => { location.hash = '#/app/ajustes?' + b.dataset.ajnav + '=1'; }; });
  // (REDISEÑO SIMPLE RS-1 · mock v7) Vista plana: idioma + saldo.
  // Idioma: POST /api/settings/language y recarga (toda la UI localiza desde ME.lang).
  const rsLangBtn = document.getElementById('rsLangBtn');
  if (rsLangBtn) rsLangBtn.onclick = async () => {
    const cur = (typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'en' : 'es';
    const next = cur === 'en' ? 'es' : 'en';
    rsLangBtn.disabled = true;
    try {
      const r = await api.post('/api/settings/language', { lang: next });
      if (r && r.ok) { try { toast(next === 'en' ? 'Language: English' : 'Idioma: Español'); } catch (e) {} location.reload(); return; }
      alert('No pude cambiarlo');
    } catch (e) { alert('No pude cambiarlo'); }
    rsLangBtn.disabled = false;
  };
  // Saldo para impulsar (billetera de ads, USD): GET /api/ads/config.
  (async () => {
    const el = document.getElementById('rsSaldoVal');
    if (!el) return;
    const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
    try {
      const cfg = await api.get('/api/ads/config');
      const bal = Number((cfg && cfg.balance_cents) || 0) / 100;
      el.textContent = (en ? 'To boost · $' : 'Para impulsar · $') + bal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    } catch (e) { el.textContent = en ? 'To boost · —' : 'Para impulsar · —'; }
  })();
  try { ttZoneLoad(); } catch (e) {}
  try { ggZoneLoad(); } catch (e) {}
  try { tnZoneLoad(); } catch (e) {}
  try { styleGalleryLoad(); } catch (e) {}
  try { gustosZoneLoad(); } catch (e) {}
  // (fix chunk-ajustes v487) La caja Gesty vive en #gzAjustesBox (arriba, en ajustesView):
  // gzAjustesFill la llena con Tipo/Conexiones/Bloqueos (lote ajustes-simple-2:
  // sin upsell: sin Gesty contratado ni en prueba, la caja queda vacía).
  // POSTY SOLO (TestFlight build 4): sin caja Gesty ni upsell en Ajustes.
  // --- Página pública del negocio (v169) ---
  const btnCopyPage = $('#btnCopyPage');
  if (btnCopyPage) btnCopyPage.onclick = async () => {
    const slug = (($('#s_slug') && $('#s_slug').value.trim()) || (PROFILE && PROFILE.page_slug) || '');
    const url = 'https://postycommunitymanager.com/p/' + slug.replace(/^\/+/, '');
    try { await navigator.clipboard.writeText(url); btnCopyPage.innerHTML = pzIc('checkCircle', 15) + ' ¡Copiado!'; setTimeout(() => { btnCopyPage.innerHTML = pzIc('copy', 15) + ' Copiar link'; }, 1800); }
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
      if (msg) msg.innerHTML = '<span style="color:var(--cel);font-size:12.5px">' + pzIc('checkCircle', 15) + ' ¡Página guardada!</span>';
    } catch (e) {
      if (msg) msg.innerHTML = '<span style="color:#c0392b;font-size:12.5px">' + esc((e && e.message) || 'No se pudo guardar') + '</span>';
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
  const paintAjStAuto = () => { try { const el = $('#ajStAuto'); if (!el || __apOn === null || __awOn === null) return; el.textContent = (__apOn && __awOn) ? 'Activado' : (!__apOn && !__awOn) ? 'Desactivado' : 'Parcial'; const em = $('#ajStAutoMenu'); if (em) em.textContent = el.textContent; } catch (e) {} };
  // --- Autopiloto (4 puntos, 2026-10-02) ---
  const btnAp = $('#btnAutopilotToggle');
  if (btnAp) {
    const loadAp = async () => {
      try {
        const r = await api.get('/api/autopilot');
        const on = !!(r && r.enabled);
        __apOn = on; paintAjStAuto();
        btnAp.disabled = false;
        btnAp.innerHTML = on ? (pzIc('checkCircle', 15) + ' Activado') : (pzIc('circleEmpty', 15) + ' Activar');
        btnAp.classList.toggle('btn-primary', !on);
        const demoOn = !!((typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.demo_mode));
        $('#autopilotStatus').textContent = on
          ? (demoOn
            ? 'Tus posteos salen solos — pero estás en modo Demo: por ahora se simulan, no sale nada real hasta que conectes tu Instagram.'
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
            btnPn.innerHTML = pnOn ? (pzIc('checkCircle', 15) + ' Activado') : (pzIc('circleEmpty', 15) + ' Activar');
            btnPn.classList.toggle('btn-primary', !pnOn);
            if (pnSt) pnSt.textContent = pnOn ? 'Te aviso 30 min antes de cada publicación automática.' : 'Sin aviso: los posteos automáticos salen directo.';
            btnPn.onclick = async () => {
              btnPn.disabled = true;
              try {
                const rr = await api.post('/api/autopilot/pre-notify', { enabled: !pnOn });
                if (rr && rr.ok) await loadAp(); else alert('No pude cambiarlo');
              } catch (e) { alert('No pude cambiarlo'); }
              btnPn.disabled = false;
            };
          } else {
            btnPn.disabled = true;
            btnPn.innerHTML = pzDot('#22A06B', 12) + ' Activado';
            if (pnSt) pnSt.textContent = 'En tu nivel el aviso es obligatorio: es tu freno de emergencia antes de cada publicación.';
          }
          // (REDISEÑO SIMPLE RS-1) Chip "Avisos" de la vista plana: mismo estado.
          const rsAv = document.getElementById('rsAvisosChip');
          if (rsAv) { rsAv.textContent = pnOn ? ((typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Active' : 'Activo') : ((typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Off' : 'Apagado'); rsAv.classList.toggle('st-ok', pnOn); rsAv.classList.toggle('st-off', !pnOn); }
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
          const aws = $('#autoWeekStatus'); if (aws && __awOn) aws.textContent = `${pzIc('pause', 15)} En pausa: tu semana no se arma mientras esté todo pausado.`;
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
        else alert('No pude cambiarlo');
      } catch (e) { alert('No pude cambiarlo'); }
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
          else alert('No pude cambiarlo');
        } catch (e) { alert('No pude cambiarlo'); }
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
      if (!r || !r.ok) { const off0 = $('#ajPushOff'), on0 = $('#ajPushOn'); if (off0) off0.style.display = ''; if (on0) on0.style.display = 'none'; return; }
      // (LOTE AJUSTES-SIMPLE) La caja de push vive SIEMPRE visible arriba de
      // Notificaciones; solo cambia su interior: sin suscripción NATIVA
      // (apns/fcm) muestra el botón — una suscripción web NO lo esconde —;
      // con suscripción nativa muestra el estado Activado.
      const off = $('#ajPushOff'), on = $('#ajPushOn');
      const nativeOn = ajPushNativeOn(r);
      if (off) off.style.display = nativeOn ? 'none' : '';
      if (on) on.style.display = nativeOn ? '' : 'none';
      // (LOTE PUSH-FUNCIONANDO) Permiso negado: iOS no vuelve a preguntar,
      // así que el botón no puede reintentarlo. Ajustes lo dice claro desde
      // el primer render — con el camino exacto donde se arregla — en vez
      // del mensaje genérico de no-token.
      try {
        if (!nativeOn && (typeof pzPushRowDenied === 'function') && pzPushRowDenied()) {
          const ajEn = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
          const ajNat = (typeof pzNativePush === 'function') && pzNativePush();
          const t = $('#ajPushOffTxt'), h = $('#ajPushOffHint'), b = $('#btnPushEnable');
          if (t) t.textContent = ajNat
            ? (ajEn ? 'Notifications are off for Posty in your iPhone Settings. Open iPhone Settings → Posty → Notifications and turn them on.' : 'Las notificaciones están apagadas para Posty en tu iPhone. Abrí Ajustes del iPhone → Posty → Notificaciones y prendelas.')
            : (ajEn ? 'Notifications are blocked in your browser settings.' : 'Las notificaciones están bloqueadas en los ajustes de tu navegador.');
          if (h) h.textContent = ajNat
            ? (ajEn ? 'iPhone Settings → Posty → Notifications.' : 'Ajustes del iPhone → Posty → Notificaciones.')
            : (ajEn ? 'Allow notifications in your browser settings.' : 'Permitilas en los ajustes de notificaciones de tu navegador.');
          if (b) b.textContent = ajEn ? 'How to turn them on' : 'Cómo activarlas';
        }
      } catch (e) {}
      // (LOTE PUSH-ERROR-VISIBLE) Motivo legible cuando activar notificaciones falla.
      function pzPushErrTexto(pr, en) {
        if (!pr || pr.ok) return '';
        const r = pr.reason;
        // (LOTE PUSH-FUNCIONANDO) Denegado: iOS no vuelve a preguntar — el
        // mensaje dice DÓNDE se arregla (Ajustes del iPhone → Posty →
        // Notificaciones), no el genérico de no-token. En web, ajustes del navegador.
        if (r === 'denied') {
          const nat = (typeof pzNativePush === 'function') && pzNativePush();
          if (nat) return en ? 'Notifications are off for Posty in your iPhone Settings. Open iPhone Settings → Posty → Notifications and turn them on.' : 'Las notificaciones están apagadas para Posty en tu iPhone. Abrí Ajustes del iPhone → Posty → Notificaciones y prendelas.';
          return en ? 'Notifications are blocked in your browser settings.' : 'Las notificaciones están bloqueadas en los ajustes de tu navegador.';
        }
        // (LOTE PUSH-FUNCIONANDO) no_token con permiso en ON: el problema es
        // (b) registrationError o (c) entorno APNs. Si iOS dejó un error de
        // registro (PZ_NATIVE_LAST_ERROR), se muestra — antes se tragaba y
        // solo quedaba el genérico. Sin error, el genérico queda (reintento
        // automático al abrir la app).
        if (r === 'no_token') {
          let det = '';
          try { det = (typeof PZ_NATIVE_LAST_ERROR !== 'undefined' && PZ_NATIVE_LAST_ERROR) || ''; } catch (e) {}
          const base = en ? 'Your iPhone did not deliver the notifications token' : 'El iPhone no entregó el token de notificaciones';
          return det ? base + ': ' + String(det).slice(0, 120) : base;
        }
        if (r === 'pendiente') return en ? 'Your token is saved: it will be sent next time you open the app signed in' : 'Tu token quedó guardado: se manda solo la próxima vez que abras la app con sesión';
        let det = '';
        try { det = (typeof PZ_NATIVE_LAST_ERROR !== 'undefined' && PZ_NATIVE_LAST_ERROR) || ''; } catch (e) {}
        if (!det && r && r !== 'error') det = String(r);
        if (det) return (en ? 'Could not enable: ' : 'No se pudo activar: ') + String(det).slice(0, 120);
        return en ? 'Could not enable, try again' : 'No se pudo activar, probá de nuevo';
      }
      function pzPushErrMostrar(pr) {
        const el = (typeof $ === 'function') ? $('#pzPushErr') : null;
        const en = (typeof ME !== 'undefined' && ME && ME.lang === 'en');
        const t = pzPushErrTexto(pr, en);
        if (!el) return t;
        if (t) { el.textContent = t; el.style.display = ''; } else { el.textContent = ''; el.style.display = 'none'; }
        return t;
      }
      const btnPush = $('#btnPushEnable');
      if (btnPush) btnPush.onclick = async () => {
        // (LOTE PUSH-FUNCIONANDO) Permiso negado: no reintentar en silencio
        // (iOS no vuelve a preguntar y pzNativeEnableFlow volvería denied
        // sin hacer nada) — el botón lleva a la explicación con el camino.
        if ((typeof pzPushRowDenied === 'function') && pzPushRowDenied()) { pzPushErrMostrar({ ok: false, reason: 'denied' }); return; }
        btnPush.disabled = true;
        try {
          if (typeof pushEnableFlow === 'function') {
            const pr = await pushEnableFlow();
            if (pr && pr.ok) { pzPushErrMostrar(pr); await loadNotifyPrefs(); }
            else pzPushErrMostrar(pr || { ok: false, reason: 'error' });
          }
        } catch (e) { pzPushErrMostrar({ ok: false, reason: 'error' }); }
        btnPush.disabled = false;
      }; // (LOTE PUSH-ERROR-VISIBLE)
      const paintT = (btn, st, on, onText, offText) => {
        if (!btn) return;
        btn.disabled = false;
        btn.innerHTML = on ? (pzIc('checkCircle', 15) + ' Activado') : (pzIc('circleEmpty', 15) + ' Activar');
        btn.classList.toggle('btn-primary', !on);
        if (st) st.textContent = on ? onText : offText;
      };
      let letterOn = !!r.notify_letter, failOn = !!r.notify_failed;
      const btnL = $('#btnLetterToggle'), btnF = $('#btnFailToggle');
      paintT(btnL, $('#letterNotifyStatus'), letterOn, 'Te aviso el domingo apenas tu carta esté lista.', 'Sin aviso: la carta llega igual — la leés en Estrategia.');
      paintT(btnF, $('#failNotifyStatus'), failOn, 'Te aviso apenas un posteo no pueda salir.', 'Sin aviso: los fallos los ves al entrar a tu semana.');
      // --- 💬 WhatsApp: carta del domingo con botón de aprobar (whatsapp-aprobacion) ---
      // La UI nunca promete envío: si el server no tiene WhatsApp encendido, se avisa y solo se guarda número + permiso.
      let waOn = !!r.wa_opted_in;
      const waMasked = r.wa_number_masked || '';
      const btnWa = $('#btnWaNotifyToggle'), waSt = $('#waNotifyStatus'), waIn = $('#s_waNotify'), waGate = $('#waNotifyGateHint');
      if (waGate) waGate.style.display = r.wa_available ? 'none' : '';
      const paintWa = () => paintT(btnWa, waSt, waOn,
        waMasked ? ('Activado: tu carta llega al ' + waMasked + ' con el botón para aprobar.') : 'Activado: tu carta llega por WhatsApp con el botón para aprobar.',
        'Sin WhatsApp: tu carta llega por notificación y en Estrategia.');
      paintWa();
      if (btnWa) btnWa.onclick = async () => {
        btnWa.disabled = true;
        try {
          const body = waOn ? { wa_notify_optin: false } : { wa_notify_num: waIn ? waIn.value : '', wa_notify_optin: true };
          const r2 = await api.post('/api/settings/notify-prefs', body);
          if (r2 && r2.ok) {
            waOn = !!r2.wa_opted_in;
            paintT(btnWa, waSt, waOn,
              (r2.wa_number_masked || waMasked) ? ('Activado: tu carta llega al ' + (r2.wa_number_masked || waMasked) + ' con el botón para aprobar.') : 'Activado: tu carta llega por WhatsApp con el botón para aprobar.',
              'Sin WhatsApp: tu carta llega por notificación y en Estrategia.');
            if (waIn) waIn.value = '';
          } else alert((r2 && r2.error) || 'No pude cambiarlo');
        } catch (e) { alert('No pude cambiarlo'); }
        btnWa.disabled = false;
      };
      const paintSum = () => {
        try {
          const el = $('#ajStAvisos');
          if (!el) return;
          const n = (r.pre_notify ? 1 : 0) + (letterOn ? 1 : 0) + (failOn ? 1 : 0);
          el.textContent = n === 3 ? 'Todos activos' : n === 0 ? 'Silenciados' : `${n} de 3 activos`;
          const em = $('#ajStAvisosMenu');
          if (em) em.textContent = el.textContent;
        } catch (e) {}
      };
      paintSum();
      if (btnL) btnL.onclick = async () => {
        btnL.disabled = true;
        try {
          const r2 = await api.post('/api/settings/notify-prefs', { notify_letter: !letterOn });
          if (r2 && r2.ok) { letterOn = !!r2.notify_letter; paintT(btnL, $('#letterNotifyStatus'), letterOn, 'Te aviso el domingo apenas tu carta esté lista.', 'Sin aviso: la carta llega igual — la leés en Estrategia.'); paintSum(); }
          else alert('No pude cambiarlo');
        } catch (e) { alert('No pude cambiarlo'); }
        btnL.disabled = false;
      };
      if (btnF) btnF.onclick = async () => {
        btnF.disabled = true;
        try {
          const r2 = await api.post('/api/settings/notify-prefs', { notify_failed: !failOn });
          if (r2 && r2.ok) { failOn = !!r2.notify_failed; paintT(btnF, $('#failNotifyStatus'), failOn, 'Te aviso apenas un posteo no pueda salir.', 'Sin aviso: los fallos los ves al entrar a tu semana.'); paintSum(); }
          else alert('No pude cambiarlo');
        } catch (e) { alert('No pude cambiarlo'); }
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
        btnAw.innerHTML = on ? (pzIc('checkCircle', 15) + ' Activado') : (pzIc('circleEmpty', 15) + ' Activar');
        btnAw.classList.toggle('btn-primary', !on);
        $('#autoWeekStatus').innerHTML = (__pausedAll && on)
          ? `${pzIc('pause', 15)} En pausa: tu semana no se arma mientras esté todo pausado.`
          : on
          ? 'Tu semana se arma y programa sola'
          : 'Vos armás tu semana a mano.';
      } catch (e) { btnAw.textContent = 'Error'; }
    };
    btnAw.onclick = async () => {
      btnAw.disabled = true;
      try {
        const r = await api.get('/api/settings/auto-week');
        const r2 = await api.post('/api/settings/auto-week', { enabled: !(r && r.enabled) });
        if (r2 && r2.ok) await loadAw();
        else alert('No pude cambiarlo');
      } catch (e) { alert('No pude cambiarlo'); }
      btnAw.disabled = false;
    };
    loadAw();
  }
  // --- SUBIR-FOTO-TODO: default de subir fotos ---
  const sftSel = $('#sftDefaultSel');
  if (sftSel) {
    const loadSft = async () => { try { const r = await api.get('/api/settings/fotos-default'); sftSel.value = (r && r.default) || 'preguntar'; } catch (e) {} };
    sftSel.onchange = async () => { try { const r = await api.post('/api/settings/fotos-default', { default: sftSel.value }); const st = $('#sftDefaultStatus'); if (st) st.textContent = (r && r.ok) ? 'Guardado' : 'No se pudo guardar'; } catch (e) { const st = $('#sftDefaultStatus'); if (st) st.textContent = 'No se pudo guardar'; } };
    loadSft();
  }
  // --- SEMANA-DOS-IDIOMAS:START — Semana en dos idiomas (opt-in, apagado por defecto, 2026-10-30) ---
  const btnBw = $('#btnBilingualWeekToggle');
  if (btnBw) {
    const loadBw = async () => {
      try {
        const r = await api.get('/api/settings/bilingual-week');
        const on = !!(r && r.enabled);
        btnBw.innerHTML = on ? (pzIc('checkCircle', 15) + ' Activado') : (pzIc('circleEmpty', 15) + ' Activar');
        btnBw.classList.toggle('btn-primary', !on);
        $('#bilingualWeekStatus').textContent = on
          ? 'Tu semana sale en espa\u00f1ol y en ingl\u00e9s, con la misma idea en los dos idiomas.'
          : 'Solo en espa\u00f1ol. Activ\u00e1 para sumar la versi\u00f3n en ingl\u00e9s de la misma semana.';
      } catch (e) { btnBw.textContent = 'Error'; }
    };
    btnBw.onclick = async () => {
      btnBw.disabled = true;
      try {
        const r = await api.get('/api/settings/bilingual-week');
        const r2 = await api.post('/api/settings/bilingual-week', { enabled: !(r && r.enabled) });
        if (r2 && r2.ok) await loadBw();
        else alert('No pude cambiarlo \ud83d\ude05');
      } catch (e) { alert('No pude cambiarlo \ud83d\ude05'); }
      btnBw.disabled = false;
    };
    loadBw();
  }
  // --- SEMANA-DOS-IDIOMAS:END ---
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
    const fpN = Number((ME && ME.founder_price) || 0);
    const fpCur = (ME && ME.founder_currency) || '';
    const fpLbl = fpN ? ((fpCur === 'UYU' ? '$U ' : '$') + fpN.toLocaleString('es-AR') + (fpCur === 'USD' ? ' USD' : '')) : '';
    const fpLine = fpN ? (en ? `${pzIc('heart', 14)} Your founder price (${fpLbl}/mo) stays fixed for 12 months from your signup.` : `${pzIc('heart', 14)} Tu precio de fundador (${fpLbl}/mes) queda fijo por 12 meses desde tu alta.`) : '';
    z.innerHTML = `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:16px">
      <div style="font-size:15px;font-weight:800">${en ? 'Founder' : 'Fundador'} #${n} ${en ? 'of The First 200' : 'de Los Primeros 200'}</div>
      <p style="color:var(--mut);font-size:13px;line-height:1.55;margin:6px 0 10px">${en ? 'Your spot in the founding cohort is yours. Do you want your business on the public founders page, with its name, trade and city?' : 'Tu lugar en la cohorte fundadora ya es tuyo. ¿Te sumás a la página de fundadores con el nombre de tu negocio, su rubro y su ciudad?'}</p>
      ${fpLine ? `<p style="color:var(--mut);font-size:13px;line-height:1.55;margin:0 0 10px">${fpLine}</p>` : ''}
      <label style="display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:700;cursor:pointer"><input type="checkbox" id="founderPub" ${pub ? 'checked' : ''} style="width:18px;height:18px"> ${en ? 'Yes, list my business' : 'Sí, sumame a la página'}</label>
      <div id="founderPubMsg" style="font-size:12px;color:var(--dim);margin-top:6px"></div>
      <a href="${en ? '/en/founders' : '/fundadores'}" target="_blank" rel="noopener" style="font-size:12.5px;font-weight:700;color:var(--cel)">${en ? 'See the founders page ' + pzIc('arrowRight', 13) : 'Ver la página de fundadores ' + pzIc('arrowRight', 13)}</a>
    </div>`;
    const cb = document.getElementById('founderPub');
    if (cb) cb.onchange = async () => {
      const msg = document.getElementById('founderPubMsg');
      try {
        const r = await api.put('/api/founders/consent', { public: cb.checked });
        if (typeof ME !== 'undefined' && ME) ME.founder_public = !!(r && r.founder_public);
        if (msg) msg.textContent = cb.checked ? (en ? 'Done! You are on the page' : '¡Listo! Ya estás en la página') : (en ? 'Removed from the public page.' : 'Te saqué de la página pública.');
      } catch (e) { cb.checked = !cb.checked; if (msg) msg.textContent = en ? 'Could not save — try again.' : 'No se pudo guardar — probá de nuevo.'; }
    };
  })();
  /* PZ_CHECKOUT_DEEP_LINK:START — parser puro del deep link de checkout
   * (#/app/ajustes?plan_sel=1&agente=<poder|completo>&nivel=<esencial|
   * completa|total>&pais=<10>&moneda=<hint>). plan_sel numérico (el "1"
   * que mandan los sitios) es solo una marca: el tier lo da nivel, y si
   * nivel falta, un plan_sel con id de tier válido (legacy). Sin agente:
   * agente=null (modo legacy, auto-click intacto). Con agente presente
   * pero inválido: default posty/esencial/AR, sin romper. pais inválido
   * → AR. moneda es HINT de display: el servidor decide precio/riel por
   * país, así que nunca se usa para el precio. Puro: sin DOM ni storage,
   * para poder testearlo aislado. */
  function pzParseCheckoutDeepLink(hash) {
    const PZ_DL_PAISES = ['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'EU'];
    const PZ_DL_AGENTES = ['posty', 'venty', 'gesty', 'atenty', 'completo'];
    const PZ_DL_NIVELES = { esencial: 'esencial', completa: 'pro', pro: 'pro', total: 'total' };
    let qs = null;
    try { qs = new URLSearchParams(String(hash || '').split('?')[1] || ''); } catch (e) { return { agente: null, tier: null, pais: null, moneda: null }; }
    const hasAgente = qs.has('agente');
    if (!hasAgente) {
      const legacy = (qs.get('plan_sel') || '').replace(/[^a-z]/g, '');
      return { agente: null, tier: PZ_DL_NIVELES[legacy] || null, pais: null, moneda: null };
    }
    const agRaw = (qs.get('agente') || '').toLowerCase();
    const agente = PZ_DL_AGENTES.includes(agRaw) ? agRaw : 'posty';
    const nivRaw = (qs.get('nivel') || '').toLowerCase();
    let tier = PZ_DL_NIVELES[nivRaw] || null;
    if (!tier) {
      const sel = (qs.get('plan_sel') || '').replace(/[^a-z]/g, '');
      tier = PZ_DL_NIVELES[sel] || 'esencial';
    }
    const paisRaw = (qs.get('pais') || '').toUpperCase();
    const pais = PZ_DL_PAISES.includes(paisRaw) ? paisRaw : 'AR';
    const moneda = (qs.get('moneda') || '').toUpperCase() || null;
    return { agente, tier, pais, moneda };
  }
  /* PZ_CHECKOUT_DEEP_LINK:END */
  // Mi plan
  (async () => {
    const z = $('#planZone');
    if (!z) return;
    // (REDISEÑO SIMPLE RS-1) Fila "Plan" de la vista plana: el nombre del
    // plan actual (el mismo fetch de planes que usa este detalle).
    const setRsPlan = (name) => { const el = document.getElementById('rsPlanVal'); if (el && name) el.textContent = name; };
    // (pais-selector) País del paywall: el elegido en la home/prueba
    // ('posta-pais'); si no hay, lang en→US, si no AR. El RIEL lo decide el
    // país, no el idioma: GB/EU pagan por Stripe aunque el usuario hable ES.
    const PZ_PAY_PAISES = ['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'EU'];
    const PZ_PAY_STRIPE = ['US', 'GB', 'EU', 'BR', 'MX', 'CL', 'CO', 'PE'];
    // (Pagos lado app) Deep link: pais manda y también setea
    // localStorage 'posta-pais' (el servidor decide precio/riel por país;
    // moneda del link es solo hint y NO se usa para el precio).
    const pzDl = pzParseCheckoutDeepLink(location.hash);
    let pzPayCountry = 'AR';
    try {
      const g = localStorage.getItem('posta-pais');
      if (g && PZ_PAY_PAISES.includes(g)) pzPayCountry = g;
      else if (typeof ME !== 'undefined' && ME && ME.lang === 'en') pzPayCountry = 'US';
    } catch (e) { if (typeof ME !== 'undefined' && ME && ME.lang === 'en') pzPayCountry = 'US'; }
    if (pzDl.agente && pzDl.pais) {
      pzPayCountry = pzDl.pais;
      try { localStorage.setItem('posta-pais', pzDl.pais); } catch (e) {}
    }
    // Carga de planes con reintento: es la pantalla de pago, no puede fallar en silencio.
    const loadPlans = async () => {
      let lastErr = null;
      for (let i = 0; i < 2; i++) {
        try { return await api.get('/api/billing/plans?country=' + pzPayCountry); }
        catch (e) { lastErr = e; console.error('[planes] intento ' + (i + 1) + ':', e.message); }
      }
      throw lastErr;
    };
    const showPlansError = (err) => {
      const detail = err && err.message ? `<br><small style="opacity:.65;font-size:11px">Motivo: ${esc(String(err.message)).slice(0, 160)}</small>` : '';
      z.innerHTML = `<div class="err">No se pudieron cargar los planes. Revisá tu conexión.${detail}<br><button class="btn btn-soft btn-sm" id="plansRetry" style="margin-top:8px">${pzIc('refresh', 18)} Reintentar</button></div>`;
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
        setRsPlan(planName);
        const hasActive = ME && !ME.is_trial && ME.plan_status === 'active';
        const trialLeft = (ME && ME.trial_days_left) || 0;
        let estado = 'Activo';
        if (!hasActive) {
          if (ME && ME.plan_status === 'cancelled') estado = 'Cancelado';
          else if (ME && ME.trial_expired) estado = (ME && ME.lang === 'en') ? 'Your trial ended.' : 'Tu prueba terminó.';
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
      const billingData = await loadPlans();
      const { plans, mp_configured, stripe_configured } = billingData;
      const isUS = !!(ME && ME.lang === 'en');
      const isStripe = PZ_PAY_STRIPE.includes(pzPayCountry);
      // (2026-10-25 · pulido ítem 5) Los 5 países que pagan en USD sin
      // precio local todavía (BR/MX/CL/CO/PE) llevan «USD » en AMBOS
      // idiomas: en EN, «$199» se podía leer como moneda local.
      const pzUsd5 = ['BR', 'MX', 'CL', 'CO', 'PE'].includes(pzPayCountry);
      const symFor = (cur) => ({ ARS: '$', UYU: '$U ', USD: pzUsd5 ? 'USD ' : (isUS ? '$' : 'USD '), GBP: '\u00a3', EUR: '\u20ac', CAD: 'C$' }[cur] || '$');
      (plans || []).forEach((pp) => {
        const sym = symFor(pp.currency);
        // (Tabla nueva, 2026-10-25) Precio entero → 0 decimales (USD 199,
        // no 199.00). El por-día de planCard sigue con decimales aparte.
        const dec = Number.isInteger(Number(pp.price)) ? 0 : 2;
        pp.price_label = sym + Number(pp.price).toLocaleString(isUS ? 'en-US' : 'es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      });
      const cur = (ME && ME.plan) || 'esencial';
      const hasActive = ME && !ME.is_trial && ME.plan_status === 'active';
      const pcm = document.getElementById('planConfirmMsg');
      if (pcm) pcm.innerHTML = hasActive
        ? (isUS ? pzIc('checkCircle', 14) + ' Payment received! Your plan is now active.' : pzIc('checkCircle', 14) + ' ¡Pago recibido! Tu plan ya está activo.')
        : isStripe
        ? (isUS ? pzIc('clock', 14) + ' Your payment is being confirmed with Stripe. In a few seconds your plan will activate on its own — nothing else to do.' : pzIc('clock', 14) + ' Tu pago está confirmándose con Stripe. En unos segundos tu plan se activa solo — no hace falta que hagas nada.')
        : (isUS ? pzIc('clock', 14) + ' Your payment is being confirmed with MercadoPago. In a few seconds your plan will activate on its own — nothing else to do.' : pzIc('clock', 14) + ' Tu pago está confirmándose con MercadoPago. En unos segundos tu plan se activa solo — no hace falta que hagas nada.');
      const statusTag = !hasActive ? `<span style="font-size:11.5px;color:var(--dim)">(${ME && ME.plan_status === 'cancelled' ? 'cancelado' : (ME && ME.trial_expired) ? (isUS ? 'trial ended' : 'prueba terminada') : 'trial'})</span>` : '';
      const trialLeft = (ME && ME.trial_days_left) || 0;
      // refInfo se obtiene una sola vez acá: lo usan bindSub (clic Suscribirse) y los banners
      let refInfo = null;
      try { refInfo = await pzReferral(); } catch (e) {}
      let trialBanner = '';
      if (!hasActive && ME && ME.plan_status === 'trial') {
        if (ME.trial_expired) trialBanner = isUS ? `<div class="pz-trial-exp">${pzIc('lock', 14)} <b>Your trial ended.</b> Pick your plan and let's keep posting together</div>` : `<div class="pz-trial-exp">${pzIc('lock', 14)} <b>Se terminó la prueba.</b> Elegí tu plan y seguimos publicando juntos</div>`;
        else if (trialLeft > 0) trialBanner = trialLeft <= 3
          ? `<div class="pz-trial-warn">⏰ <b>¡Te ${trialLeft === 1 ? 'queda 1 día' : `quedan ${trialLeft} días`} de prueba!</b> Suscribite para no frenar tus posteos.</div>`
          : `<div class="pz-trial-ok">${pzIc('gift', 14)} Estás en tu prueba gratis: te quedan <b>${trialLeft} días</b>.</div>`;
      }
      const pmMixTxt = (pl) => [pl.postsPerWeek > 0 && `${pl.postsPerWeek} posteos`, pl.reelsPerWeek > 0 && `${pl.reelsPerWeek} reels`].filter(Boolean).join(' + ');
      const curPlan = plans.find(p => p.id === cur) || plans[0];
      setRsPlan(curPlan && curPlan.name ? curPlan.name : cur);
      // Mix semanal con iconos (solo lo que el plan incluye) + features sin duplicar el mix.
      const pmMixItem = (icon, n, label) => n > 0 ? `<span>${icon} <b>${n}</b> ${label}</span>` : '';
      const pmMixHTML = (p) => {
        const items = [
          pmMixItem(pzIc('post', 14), p.postsPerWeek, p.postsPerWeek === 1 ? 'posteo' : 'posteos'),
          pmMixItem(pzIc('reel', 14), p.reelsPerWeek, p.reelsPerWeek === 1 ? 'reel' : 'reels'),
        ].filter(Boolean).join('');
        return items ? `<div class="pm-mix">${items}</div>` : '';
      };
      const pmMixDup = /(\d+\s*(posts?|reels)\b)/i; // (COPY-2-REELS v732) el mix es posteos + reels: se filtra la feature que lo duplica
      const planCard = (p) => {
        const pmSym = ({ ARS: '$', UYU: '$U ', USD: isUS ? '$' : 'USD ', GBP: '\u00a3', EUR: '\u20ac', CAD: 'C$' })[p.currency] || '$';
        const pmDec = (p.currency === 'ARS' || p.currency === 'UYU') ? 0 : 2;
        const pmPer = (p.price / 30).toLocaleString(isUS ? 'en-US' : 'es-AR', { minimumFractionDigits: pmDec, maximumFractionDigits: pmDec });
        const feats = (p.features || []).filter(f => !pmMixDup.test(f)).slice(0, 6);
        return `
          <div class="plan-mini${p.id === cur && hasActive ? ' cur' : ''}${p.highlighted ? ' rec' : ''}">
            ${p.highlighted ? `<div class="pm-flag">${isUS ? 'RECOMMENDED' : 'RECOMENDADO'}</div>` : ''}
            <div class="pm-top"><b>${esc(p.name)}</b>${p.id === cur && hasActive ? '<span class="pm-cur-tag">Tu plan</span>' : ''}</div>
            ${p.tagline ? `<p class="pm-tagline">${esc(p.tagline)}</p>` : ''}
            <div class="pm-price">${esc(p.price_label)}<small>/mes</small></div>
            <div class="pm-perday">≈ ${pmSym}${pmPer} por día</div>
            ${pmMixHTML(p)}
            <ul class="pm-feats">${feats.map(f => `<li><span class="tick">${pzIc('check', 13)}</span><span>${esc(f)}</span></li>`).join('')}</ul>
            <button class="btn ${p.id === cur && hasActive ? 'btn-ghost' : 'btn-primary'} btn-sm btn-block" data-sub="${p.id}" ${p.id === cur && hasActive ? 'disabled' : ''}>${p.id === cur && hasActive ? 'Plan actual' : 'Suscribirse'}</button>
            ${(p.detail && p.detail.length) ? `<button type="button" class="pm-more" data-plan-more aria-expanded="false">${isUS ? 'See everything it does for you' : 'Ver todo lo que hace por vos'} <span class="pm-chev">▾</span></button>
            <div class="pm-detail" hidden>
              <div class="pm-detail-title">${isUS ? `Everything the ${esc(p.name)} plan does for you` : `Todo lo que el plan ${esc(p.name)} hace por vos`}</div>
              <ul class="pm-feats">${p.detail.map(f => `<li><span class="tick">${pzIc('check', 13)}</span><span>${esc(f)}</span></li>`).join('')}</ul>
              ${(p.id === cur && hasActive) ? '' : `<button class="btn btn-primary btn-sm btn-block" data-sub="${p.id}">${isUS ? 'Subscribe' : 'Suscribirse'}</button>`}
            </div>` : ''}
          </div>`;
      };
      const bindSub = () => {
        $$('#planList [data-sub], #planListDl [data-sub]').forEach(b => b.onclick = async () => {
          // (LOTE PRUEBA-ENTRADA-DIRECTA) Cuenta al primer toque: pagar
          // pide cuenta real (el cobro necesita un email). Al crearla, el
          // invitado queda en Mi plan y toca Suscribirse de nuevo.
          if (typeof pzIsGuest === 'function' && pzIsGuest()) { pzGuestAccountSheet(); return; }
          track('plan_select', { plan: b.dataset.sub });
          // (v285, pais-selector) Países Stripe (US/GB/EU): el cobro va por
          // Stripe Checkout — sin paso de email de MP; Stripe pide los datos
          // en su página. El idioma de los textos sigue siendo el del usuario.
          if (isStripe) {
            if (!stripe_configured) { $('#planMsg').innerHTML = `<div class="err">${isUS ? 'Payments are not configured yet.' : 'Pagos no configurados todavía.'}</div>`; return; }
            b.disabled = true;
            $('#planMsg').innerHTML = `<div style="font-size:12.5px;color:var(--mut)">${isUS ? '⏳ Taking you to secure checkout…' : '⏳ Llevándote al pago seguro…'}</div>`;
            try {
              const { url } = await api.post('/api/billing/stripe/checkout', { plan: b.dataset.sub, country: pzPayCountry, agente: (pzDl.agente || 'posty') });
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
          const discSym = ({ ARS: '$', UYU: '$U ', USD: isUS ? '$' : 'USD ', GBP: '\u00a3', EUR: '\u20ac', CAD: 'C$' })[subPlan.currency] || '$';
          const discLine = (refInfo && refInfo.discount_active)
            ? `<div class="pz-disc" style="margin:0 0 10px">${pzIc('gift', 14)} Tenés <b>50% off</b> por referidos: este plan te queda en <b>${discSym}${Math.round(subPlan.price / 2).toLocaleString(isUS ? 'en-US' : 'es-AR')}/mes</b>.</div>`
            : (refInfo && refInfo.invited)
              ? `<div class="pz-disc" style="margin:0 0 10px">${pzIc('gift', 14)} Tenés <b>20% off</b> de invitado: este plan te queda en <b>${discSym}${Math.round(subPlan.price * 0.8).toLocaleString(isUS ? 'en-US' : 'es-AR')}/mes</b>.</div>`
              : '';
          $('#planMsg').innerHTML = `
            <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:12px">
              ${discLine}
              <div style="font-weight:800;margin-bottom:6px">Un paso más ${pzIc('card', 14)}</div>
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
              const { init_point } = await api.post('/api/billing/subscribe', { plan: b.dataset.sub, payer_email: em, country: pzPayCountry, agente: (pzDl.agente || 'posty') });
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
          <span style="font-size:12.5px;color:var(--dim)">${(ME && ME.trial_expired) ? (isUS ? "Pick your plan and let's keep posting together." : 'Elegí tu plan y seguimos publicando juntos.') : 'Mirá los planes cuando quieras suscribirte.'}</span>
        </div>
        <div id="planAll" style="display:none">
          <div style="font-size:14px;font-weight:800;margin:14px 0 12px">${ME && ME.trial_expired ? (isUS ? 'Pick your plan to keep going' : 'Elegí tu plan para seguir') : (isUS ? 'Pick your plan to start' : 'Elegí tu plan para empezar')}</div>
          <div id="planList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${plans.map(planCard).join('')}</div>
          <p style="font-size:11.5px;color:var(--dim);margin-top:12px">Se renueva automáticamente cada mes. Podés cancelar cuando quieras.</p>
        </div>
        <div id="planMsg" style="margin-top:10px"></div>`;
        bindSub();
        // (v401) Tocar la tarjeta (sin tocar Suscribirse) despliega el detalle
        // «por vos» en el lugar; el botón del detalle usa el mismo data-sub.
        const pl = $('#planList');
        if (pl) pl.addEventListener('click', (e) => {
          if (e.target.closest('[data-sub]')) return;
          const card = e.target.closest('.plan-mini');
          if (!card) return;
          const det = card.querySelector('.pm-detail');
          if (!det) return;
          const more = card.querySelector('[data-plan-more]');
          const open = det.hidden;
          pl.querySelectorAll('.plan-mini').forEach(c => {
            if (c === card) return;
            const d = c.querySelector('.pm-detail');
            const m = c.querySelector('[data-plan-more]');
            if (d && !d.hidden) { d.hidden = true; c.classList.remove('open'); if (m) m.setAttribute('aria-expanded', 'false'); }
          });
          det.hidden = !open;
          card.classList.toggle('open', open);
          if (more) more.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
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
            <div class="pc-name">Founder</div>
            <div class="pc-det">Gratis para siempre · 7 posteos + 2 reels/semana</div>
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
          z.insertAdjacentHTML('afterbegin', `<div class="pz-disc">${pzIc('gift', 14)} <b>50% off por referidos</b>: se aplica automáticamente al suscribirte.</div>`);
        } else if (refInfo && refInfo.invited && !hasActive) {
          z.insertAdjacentHTML('afterbegin', `<div class="pz-disc">${pzIc('gift', 14)} <b>Tenés 20% off de invitado</b>: se aplica automáticamente al suscribirte, todos los meses.</div>`);
        }
      } catch (e) {}
      // (Pagos lado app) Deep link con agente: PRESELECCIÓN sin
      // auto-click a pago. Abre los planes, destaca la tarjeta del tier,
      // y muestra el banner «Estás contratando <Agente> — <Tier>» (para
      // completo, el precio completo fundador del servidor). Sin agente,
      // el auto-click legacy de abajo sigue intacto.
      if (pzDl.agente && !hasActive) {
        const paDl = document.getElementById('planAll');
        if (paDl) paDl.style.display = '';
        const bspDl = document.getElementById('btnShowPlans');
        if (bspDl) bspDl.textContent = 'Ocultar planes';
        const tierNameDl = (plans.find(p => p.id === pzDl.tier) || {}).name || pzDl.tier;
        const agNameDl = pzDl.agente === 'completo'
          ? (isUS ? 'Bambooty complete' : 'Bambooty completo')
          : (pzDl.agente.charAt(0).toUpperCase() + pzDl.agente.slice(1));
        let priceDl = (plans.find(p => p.id === pzDl.tier) || {}).price_label || '';
        if (pzDl.agente === 'completo' && billingData && billingData.completo) {
          const cl = billingData.completo.price_labels ? billingData.completo.price_labels[pzDl.tier] : null;
          if (billingData.completo.prices && billingData.completo.prices[pzDl.tier] != null) { const cpDl = Number(billingData.completo.prices[pzDl.tier]); priceDl = symFor(billingData.currency || 'USD') + cpDl.toLocaleString(isUS ? 'en-US' : 'es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
          else if (cl) priceDl = (pzUsd5 && cl.charAt(0) === '$') ? ('USD ' + cl.slice(1)) : cl;
        }
        const bannerDl = document.createElement('div');
        bannerDl.className = 'pz-dl-banner';
        bannerDl.style.cssText = 'background:#FFF7E6;border:1px solid #FEC14D;border-radius:12px;padding:12px 14px;margin:0 0 12px;font-size:13.5px;line-height:1.5';
        bannerDl.innerHTML = isUS
          ? `You are hiring <b>${esc(agNameDl)} — ${esc(tierNameDl)}</b>${priceDl ? ` · <b>${esc(priceDl)}/mo</b>` : ''}. Pick your plan below — nothing is charged until you confirm.`
          : `Estás contratando <b>${esc(agNameDl)} — ${esc(tierNameDl)}</b>${priceDl ? ` · <b>${esc(priceDl)}/mes</b>` : ''}. Elegí tu plan abajo — no se cobra nada hasta que confirmes.`;
        if (paDl) paDl.insertBefore(bannerDl, paDl.firstChild);
        document.querySelectorAll('#planList .plan-mini').forEach((card) => {
          const btnDl = card.querySelector('[data-sub]');
          if (btnDl && btnDl.dataset.sub === pzDl.tier) card.style.outline = '2px solid var(--cel, #2793C8)';
        });
      }
      // Plan preseleccionado desde /prueba (?plan_sel=): click programático UNA vez
      if (!PZ_AUTO_PLAN && !hasActive && !pzDl.agente) {
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
      // (Pagos lado app) Cuenta con plan activo + deep link de otro poder:
      // la rama activa no muestra planes; se agrega la sección de compra
      // del poder (mismas tarjetas, banner y preselección, sin auto-click).
      // Posty activo + agente posty no hace nada (la guardia lo bloquearía).
      if (pzDl.agente && pzDl.agente !== 'posty' && hasActive) {
        const tierNameA = (plans.find(p => p.id === pzDl.tier) || {}).name || pzDl.tier;
        const agNameA = pzDl.agente === 'completo' ? (isUS ? 'Bambooty complete' : 'Bambooty completo') : (pzDl.agente.charAt(0).toUpperCase() + pzDl.agente.slice(1));
        let priceA = (plans.find(p => p.id === pzDl.tier) || {}).price_label || '';
        if (pzDl.agente === 'completo' && billingData && billingData.completo) {
          const clA = billingData.completo.price_labels ? billingData.completo.price_labels[pzDl.tier] : null;
          if (billingData.completo.prices && billingData.completo.prices[pzDl.tier] != null) { const cpA = Number(billingData.completo.prices[pzDl.tier]); priceA = symFor(billingData.currency || 'USD') + cpA.toLocaleString(isUS ? 'en-US' : 'es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
          else if (clA) priceA = (pzUsd5 && clA.charAt(0) === '$') ? ('USD ' + clA.slice(1)) : clA;
        }
        const secA = document.createElement('div');
        secA.innerHTML = `
        <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:16px">
          <div style="background:#FFF7E6;border:1px solid #FEC14D;border-radius:12px;padding:12px 14px;margin:0 0 12px;font-size:13.5px;line-height:1.5">${isUS ? `You are hiring <b>${esc(agNameA)} — ${esc(tierNameA)}</b>${priceA ? ` · <b>${esc(priceA)}/mo</b>` : ''}.` : `Estás contratando <b>${esc(agNameA)} — ${esc(tierNameA)}</b>${priceA ? ` · <b>${esc(priceA)}/mes</b>` : ''}.`}</div>
          <div style="font-size:14px;font-weight:800;margin:0 0 12px">${isUS ? 'Choose your plan' : 'Elegí tu plan'}</div>
          <div id="planListDl" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${plans.map(planCard).join('')}</div>
        </div>`;
        z.appendChild(secA);
        bindSub();
        const plA = secA.querySelector('#planListDl');
        if (plA) plA.addEventListener('click', (e) => {
          if (e.target.closest('[data-sub]')) return;
          const card = e.target.closest('.plan-mini');
          if (!card) return;
          const det = card.querySelector('.pm-detail');
          if (!det) return;
          const more = card.querySelector('[data-plan-more]');
          const open = det.hidden;
          plA.querySelectorAll('.plan-mini').forEach(c => {
            if (c === card) return;
            const d = c.querySelector('.pm-detail');
            const m = c.querySelector('[data-plan-more]');
            if (d && !d.hidden) { d.hidden = true; c.classList.remove('open'); if (m) m.setAttribute('aria-expanded', 'false'); }
          });
          det.hidden = !open;
          card.classList.toggle('open', open);
          if (more) more.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        secA.querySelectorAll('.plan-mini').forEach((card) => {
          const btnA = card.querySelector('[data-sub]');
          if (btnA && btnA.dataset.sub === pzDl.tier) card.style.outline = '2px solid var(--cel, #2793C8)';
        });
      }
    } catch (e) {
      console.error('[planes] error final:', e);
      showPlansError(e);
    }
    };
    run();
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
      if (msgEl) msgEl.innerHTML = '<span style="font-size:12.5px;color:var(--cel)">' + pzIc('palette', 13) + ' Actualizando tus diseños…</span>';
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
      if (nm.endsWith('.pdf') || nm.endsWith('.docx')) $('#brandMsg').innerHTML = '<span style="font-size:12.5px;color:var(--dim)">Convirtiendo tu archivo a imagen…</span>';
      const f = await logoFileToImage(orig);
      await uploadAssetFile(f, 'logo');
      try {
        const img = await loadImageFile(f);
        const cols = extractTopColors(img, 3);
        if (cols.length >= 2) await api.put('/api/settings', { brand_colors: cols });
      } catch (e) { /* el logo quedó; los colores se eligen a mano */ }
      SETTINGS = await api.get('/api/settings').catch(() => SETTINGS);
      const refreshed = await refreshCreatorWithNewColors($('#brandMsg'));
      if (refreshed) $('#brandMsg').innerHTML = '<span style="font-size:12.5px;color:var(--cel)">' + pzIc('checkCircle', 13) + ' Colores actualizados en tus diseños</span>';
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
        <div class="bp-title" style="color:${ink};font-family:${(BRAND_FONT_OPTS.find(o => o.id === selFont) || BRAND_FONT_OPTS[0]).fam},sans-serif">¡NUEVA<br>COLECCIÓN!</div>
        <div><span class="bp-cta" style="background:${c[2] || c[1] || c[0]};color:${lumInk(c[2] || c[1] || c[0])}">Ver más ${pzIc('arrowRight', 13)}</span></div>
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
  // --- tipografía de titulares (2026-10-26, decisión Valentino) ---
  // 6 opciones, un toque cada una; la vista previa de marca re-renderiza
  // con la fuente elegida. selFont vive en bindSettings como brandDirty:
  // si se re-renderiza sin guardar, vuelve a lo guardado (igual que colores).
  const BRAND_FONT_OPTS = [
    { id: 'montserrat', name: 'Montserrat', fam: 'pz-montserrat', file: 'Montserrat-700.ttf', desc: (typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'The current one' : 'La actual' },
    { id: 'nunito', name: 'Nunito', fam: 'pz-nunito', file: 'Nunito-700.ttf', desc: (typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Round and friendly' : 'Redonda y amable' },
    { id: 'playfair', name: 'Playfair Display', fam: 'pz-playfair', file: 'PlayfairDisplay-700.ttf', desc: (typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Elegant serif' : 'Elegante con serif' },
    { id: 'oswald', name: 'Oswald', fam: 'pz-oswald', file: 'Oswald-700.ttf', desc: (typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Strong and condensed' : 'Fuerte y condensada' },
    { id: 'fredoka', name: 'Fredoka', fam: 'pz-fredoka', file: 'Fredoka-700.ttf', desc: (typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Playful' : 'Divertida' },
    { id: 'poppins', name: 'Poppins', fam: 'pz-poppins', file: 'Poppins-700.ttf', desc: (typeof ME !== 'undefined' && ME && ME.lang === 'en') ? 'Geometric' : 'Geométrica' },
  ];
  const brandFontValid = (f) => BRAND_FONT_OPTS.some(o => o.id === f) ? f : 'montserrat';
  let selFont = brandFontValid(SETTINGS && SETTINGS.brand_font);
  function ensureFontFaces() {
    if (document.getElementById('pzFontFaces')) return;
    const st = document.createElement('style');
    st.id = 'pzFontFaces';
    st.textContent = BRAND_FONT_OPTS.map(o => '@font-face{font-family:' + o.fam + ';src:url(/fonts/' + o.file + ') format("truetype");font-display:swap}').join('\n');
    document.head.appendChild(st);
  }
  function renderFontRow() {
    const row = $('#fontRow'); if (!row) return;
    ensureFontFaces();
    row.innerHTML = BRAND_FONT_OPTS.map(o => '<button type="button" data-font="' + o.id + '" style="border:2px solid ' + (o.id === selFont ? 'var(--cel)' : 'var(--line)') + ';border-radius:12px;padding:10px 8px;background:#fff;cursor:pointer;text-align:center;min-width:0">' +
      '<span style="display:block;font-family:' + o.fam + ',sans-serif;font-size:21px;font-weight:700;line-height:1.25;overflow-wrap:break-word">¡Nueva colección!</span>' +
      '<span style="display:block;font-size:12px;font-weight:700;margin-top:5px">' + (o.id === selFont ? pzIc('check', 14) + ' ' : '') + o.name + '</span>' +
      '<span style="display:block;font-size:11px;color:var(--dim)">' + o.desc + '</span></button>').join('');
    row.querySelectorAll('[data-font]').forEach(b => b.addEventListener('click', () => { selFont = b.dataset.font; markBrandDirty(); renderFontRow(); renderBrandPrev(); }));
  }
  renderBrandPrev(); renderFontRow();
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
      if (filled >= 2) $('#brandMsg').innerHTML = '<span style="color:var(--mut);font-size:12.5px">' + pzIc('palette', 13) + ' Detectamos tus colores del logo — tocá Guardar marca para confirmar.</span>';
    } catch (e) { /* quedan los valores actuales */ }
  })();
  $('#btnSaveBrand').onclick = async () => {
    const colors = [$('#s_c0').value, $('#s_c1').value, $('#s_c2').value].filter((c, i, a) => a.indexOf(c) === i);
    const untouched = NEUTRAL_TRIO.every((d, i) => (colors[i] || '').toUpperCase() === d);
    if (untouched && !assetLogo()) { $('#brandMsg').innerHTML = `<span style="color:var(--red);font-size:12.5px">Subí tu logo o elegí tus colores</span>`; return; }
    await api.put('/api/settings', { brand_colors: colors, brand_font: selFont });
    const brandMsgEl = $('#brandMsg');
    brandMsgEl.innerHTML = '<span style="color:var(--cel);font-size:12.5px">' + pzIc('checkCircle', 13) + ' Marca guardada</span>';
    brandDirty = false; if (bDirtyEl) bDirtyEl.style.display = 'none';
    SETTINGS = await api.get('/api/settings');
    if (await refreshCreatorWithNewColors(brandMsgEl))
      brandMsgEl.innerHTML = '<span style="color:var(--cel);font-size:12.5px">' + pzIc('checkCircle', 13) + ' Marca guardada — diseños actualizados</span>';
  };
  // Reiniciar todo: marca (logo, colores, nombre) + posteos pendientes (borradores y
  // programados). Para cuando se cambió de negocio/cuenta. El historial publicado no se toca.
  const btnResetBrand = $('#btnResetBrand');
  if (btnResetBrand) btnResetBrand.onclick = async () => {
    if (!confirm('¿Reiniciar todo? Se borran el logo, los colores, el nombre del negocio y los posteos pendientes (borradores y programados). El historial publicado no se toca.')) return;
    const brandMsgEl = $('#brandMsg');
    try {
      brandMsgEl.innerHTML = '<span style="color:var(--mut);font-size:12.5px">Reiniciando…</span>';
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
      ig_embed_url: $('#s_igembed').value,
    });
    $('#setMsg').innerHTML = '<span style="color:var(--cel);font-size:12.5px">' + pzIc('checkCircle', 13) + ' Guardado</span>';
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
    if (vm) vm.innerHTML = '<div class="hint">' + pzIc('search', 13) + ' Verificando tu conexión con Instagram…</div>';
    try {
      const r = await api.get('/api/ig/sync');
      if (r && r.username) {
        PROFILE.ig_username = r.username;
        stampVerified();
        render();
      } else if (vm) {
        vm.innerHTML = `<div class="err">${pzIc('reject', 13)} No se pudo verificar: ${esc((r && r.error) || 'respuesta vacía')}</div>`;
      }
    } catch (e) {
      if (vm) vm.innerHTML = `<div class="err">${pzIc('reject', 13)} La verificación falló: ${esc(e.message)}</div>`;
    }
  };
  const igProLink = $('#igProLink');
  if (igProLink) igProLink.onclick = (e) => { e.preventDefault(); const g = $('#igProGuide'); if (g) g.style.display = g.style.display === 'none' ? '' : 'none'; };
  try { pzFillBioSeal(); } catch (e) {}
  // Actualizar lo que Posty sabe de mí (v282): UN solo botón que corre los
  // tres actualizaciones EN ORDEN — estilo visual → cómo escribo → brief (el
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
    if (m) m.textContent = 'Listo Posty ya sabe quién sos: qué vendés, cómo hablás y cómo te ves.';
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
      if (m) m.innerHTML = '<span style="color:var(--cel);font-size:12.5px">' + pzIc('checkCircle', 13) + ' Guardado — Posty te analiza con ese @.</span>';
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
          if (m) m.innerHTML = `<div class="hint">${pzIc('refresh', 13)} Sincronizando tu cuenta de Instagram…</div>`;
          setTimeout(() => doIgSync(true), 10000);
        } else {
          if (m) m.innerHTML = `<div class="err">${pzIc('alert', 13)} No se pudo leer tu @ de Instagram: ${esc(e.message)} <a href="#" id="igSyncRetry" style="color:var(--cel);font-weight:700">Reintentar</a></div>`;
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
      ? ['📲 Content: @postycommunitymanager', '✨ My content is made by @postycommunitymanager']
      : ['📲 Contenido: @posty.communitymanager', '✨ Mi contenido lo hace @posty.communitymanager'];
    slot.innerHTML = `<div style="border:1px dashed var(--line);border-radius:14px;padding:14px;background:#F8FBFD;margin-top:18px">
      <div style="font-weight:800;margin-bottom:4px">${en ? pzIc('tag', 14) + ' Your Posty seal (optional)' : pzIc('tag', 14) + ' Tu sello Posty (opcional)'}</div>
      <p style="color:var(--mut);font-size:12.5px;margin:0 0 10px">${en ? 'Some businesses add a line like this to their Instagram bio so followers know their content is cared for. It is your profile: you paste it by hand, only if you like it.' : 'Algunos negocios suman una línea así a su bio de Instagram para que sus seguidores sepan que su contenido está cuidado. Es tu perfil: la pegás vos a mano, solo si te gusta.'}</p>
      ${seals.map((s, i) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><code style="flex:1;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px">${esc(s)}</code><button class="btn btn-soft btn-sm" data-seal-copy="${i}">${en ? 'Copy' : 'Copiar'}</button></div>`).join('')}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;align-items:center">
        <button class="btn btn-primary btn-sm" id="pzSealOk">${en ? pzIc('heart', 13) + ' I added it' : pzIc('heart', 13) + ' Ya lo sumé'}</button>
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
        if (m) m.textContent = copied ? (en ? 'Copied — paste it in your bio' : 'Copiado — pegalo en tu bio') : t;
      };
    });
    const done = async (state, msg) => {
      try { await api.post('/api/visibility/bio-seal', { state }); } catch (e) {}
      if (typeof PZ_VIS_PROMISE !== 'undefined') PZ_VIS_PROMISE = null;
      slot.innerHTML = msg ? `<p class="hint" style="margin-top:14px">${msg}</p>` : '';
    };
    const okB = document.getElementById('pzSealOk');
    if (okB) okB.onclick = () => done('accepted', en ? pzIc('heart', 14) + ' Seal on — thanks for showing it!' : pzIc('heart', 14) + ' ¡Sello puesto! Gracias por mostrarlo.');
    const noB = document.getElementById('pzSealNo');
    if (noB) noB.onclick = () => done('dismissed', '');
  } catch (e) {}
}
