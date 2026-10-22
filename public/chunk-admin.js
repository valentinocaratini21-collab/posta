/* chunk-admin.js — Lazy chunk de Posty.
 * Se carga bajo demanda vía loadChunk('admin') desde app.js (NO va con <script> en index.html:
 * cargarlo ahí anularía el ahorro del primer pantallazo).
 * Es un <script> clásico: comparte el scope global con app.js; las funciones declaradas
 * acá quedan disponibles como globales una vez cargado el chunk.
 * REGLA: no agregar top-level let/const/var con nombres que ya existan en app.js u otro chunk
 * (duplicar un let/const entre scripts clásicos es SyntaxError).
 * Versión del archivo: ?v=PLACEHOLDER — la reemplaza el coordinador al armar el zip.
 */


/* ---------- 📊 Panel de analytics (solo equipo Posta) ---------- */
// Ruta oculta #/app/admin. Gate: token de admin (el mismo ADMIN_TOKEN del servidor).
function adminToken() { try { return localStorage.getItem('posta_admin_token') || ''; } catch (e) { return ''; } }
async function adminApi(path, method, data) {
  const t = adminToken();
  const url = '/api/admin/' + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
  try {
    if (method === 'POST') return await api.post(url, data || {});
    return await api.get(url);
  } catch (e) {
    if (e && (e.status === 403 || e.status === 401)) {
      try { localStorage.removeItem('posta_admin_token'); } catch (ee) {}
      try { sessionStorage.setItem('posta_admin_msg', 'El token guardado no funcionó. Pegá el token actual (variable ADMIN_TOKEN en Railway).'); } catch (ee2) {}
      location.reload();
      const err = new Error('admin_auth'); err.adminAuthFailed = true; throw err;
    }
    throw e;
  }
}
async function adminView() {
  return `<div class="page-head"><div class="ph-ico">📊</div><div class="ph-txt"><h1>Analytics</h1><p class="sub">Cómo se usa Posty — solo equipo</p></div></div>
  <div class="card" id="adminCard"><div class="d">⏳ Cargando…</div></div>`;
}
async function bindAdmin() {
  const card = $('#adminCard'); if (!card) return;
  if (!adminToken()) {
    let gateMsg = '';
    try { gateMsg = sessionStorage.getItem('posta_admin_msg') || ''; sessionStorage.removeItem('posta_admin_msg'); } catch (e) {}
    card.innerHTML = `<h3 style="margin:0 0 8px">🔒 Acceso restringido</h3>
      ${gateMsg ? `<div class="err" style="margin-bottom:10px">${gateMsg}</div>` : ''}
      <p class="d">Pegá el token de admin del servidor (ADMIN_TOKEN).</p>
      <div class="field"><input id="adTok" type="password" placeholder="token" style="width:100%;font-size:16px"></div>
      <button class="btn btn-primary" id="adTokGo">Entrar</button>
      <div id="adTokMsg" style="margin-top:8px"></div>`;
    $('#adTokGo').onclick = async () => {
      const v = ($('#adTok').value || '').trim();
      if (!v) return;
      try { localStorage.setItem('posta_admin_token', v); } catch (e) {}
      try { await adminApi('funnel?days=7'); bindAdmin(); }
      catch (e) {
        if (e && e.adminAuthFailed) return;
        try { localStorage.removeItem('posta_admin_token'); } catch (ee) {}
        $('#adTokMsg').innerHTML = `<div class="err">Token inválido.</div>`;
      }
    };
    return;
  }
  card.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-soft btn-sm" data-atab="launch">🚀 Lanzamiento</button>
      <button class="btn btn-soft btn-sm" data-atab="home">🏠 Panel</button>
      <button class="btn btn-soft btn-sm" data-atab="funnel">Funnel /prueba</button>
      <button class="btn btn-soft btn-sm" data-atab="activity">Actividad</button>
      <button class="btn btn-soft btn-sm" data-atab="users">Por usuario</button>
      <button class="btn btn-soft btn-sm" data-atab="review">✨ Revisión</button>
      <button class="btn btn-soft btn-sm" data-atab="money">💰 Plata</button>
      <button class="btn btn-soft btn-sm" data-atab="referrals">🔗 Referidos</button>
      <button class="btn btn-soft btn-sm" data-atab="content">📊 Contenido</button>
      <button class="btn btn-soft btn-sm" data-atab="cohorts">🔁 Cohorts</button>
      <button class="btn btn-soft btn-sm" data-atab="churn">⚠️ En riesgo</button>
      <button class="btn btn-soft btn-sm" data-atab="health">🩺 Salud</button>
      <button class="btn btn-soft btn-sm" id="adExport">📥 Planilla</button>
      <button class="btn btn-soft btn-sm" id="adLogout">🔑 Cambiar token</button>
      <select id="adDays" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px">
        <option value="7">7 días</option><option value="30" selected>30 días</option>
      </select>
    </div>
    <div id="adBody"><div class="d">⏳ Cargando…</div></div>`;
  const body = $('#adBody');
  const days = () => ($('#adDays') && $('#adDays').value) || '30';
  const lo = $('#adLogout');
  if (lo) lo.onclick = () => { try { localStorage.removeItem('posta_admin_token'); } catch (e) {} location.reload(); };
  const dl = $('#adExport');
  if (dl) dl.onclick = () => {
    const a = document.createElement('a');
    a.href = '/api/admin/export?days=' + days() + '&token=' + encodeURIComponent(adminToken());
    document.body.appendChild(a); a.click(); a.remove();
  };
  const bar = (pct) => `<div style="height:10px;background:var(--bg2);border-radius:99px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${Math.max(1, Math.min(100, pct))}%;background:var(--cel);border-radius:99px"></div></div>`;
  const adm$ = (v) => '$' + Math.round(v || 0).toLocaleString('es-AR');
  // ---------- Panel principal (v170): PLATA → pulso → clientes → ficha ----------
  // Una sola pantalla, dos niveles máximo. Todo sale de /api/admin/overview y
  // /api/admin/client/:id.
  async function showHome() {
    body.innerHTML = `<div class="d">⏳ Cargando panel…</div>`;
    let r;
    try { r = await adminApi('overview'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar el panel.</div>`; return; }
    const M = r.money || {}, P = r.pulse || {};
    const moneyBlock = (m, title, big) => `
      <div style="flex:1;min-width:240px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px">
        <div style="font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.4px">${title} · ${esc(m.label || '')}</div>
        <div style="font-size:${big ? '32px' : '24px'};font-weight:800;margin:6px 0 2px">${adm$(m.net_ars)}</div>
        <div style="font-size:11px;color:var(--mut);margin-bottom:10px">neto en limpio</div>
        ${[
          ['Ingresos · suscripciones (estimado)', adm$(m.subs_estimated_ars)],
          ['Ingresos · comisiones de pauta (cobrado)', adm$(m.fees_ars)],
          ['Gasto IA', 'US$ ' + (m.ai_usd || 0) + ' ≈ ' + adm$(m.ai_ars)],
          ['Gastos fijos', adm$(m.fixed_ars)],
        ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line)"><span style="color:var(--mut)">${k}</span><b>${v}</b></div>`).join('')}
      </div>`;
    const planChips = (P.active_by_plan || []).map(p => `<span style="background:var(--bg2);border:1px solid var(--line);border-radius:99px;padding:3px 10px;font-size:12px"><b>${esc(p.plan)}</b> · ${p.n}</span>`).join(' ') || '<span class="d">Sin suscripciones activas</span>';
    body.innerHTML = `
      <h4 style="margin:0 0 8px">💰 Plata</h4>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px">
        ${moneyBlock(M.current || {}, 'Este mes', true)}
        ${moneyBlock(M.previous || {}, 'Mes pasado', false)}
      </div>
      <p class="d" style="margin:0 0 14px">Suscripciones: estimado por suscripciones activas (MercadoPago no registra cada cobro en nuestra base). Comisiones de pauta: cobradas, se reconocen cuando el cliente carga crédito. IA convertida a ${adm$(M.rate || 1425)}/US$.</p>
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:16px">
        <b style="font-size:13px">Gastos fijos del mes</b>
        ${(M.fixed_expenses || []).map(f => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(f.label)}</span><span><b>${adm$(f.amount_ars)}</b> <button class="btn btn-soft btn-sm" data-fxdel="${f.id}" style="margin-left:6px">✕</button></span></div>`).join('') || '<div class="d" style="margin-top:6px">Sin gastos fijos cargados: el neto todavía no los descuenta. Cargá Railway, dominio y lo que pagues todos los meses.</div>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <input id="fxLabel" type="text" placeholder="Ej: Railway" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;flex:1;min-width:130px">
          <input id="fxAmt" type="number" min="0" step="any" placeholder="$ /mes" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:120px">
          <button class="btn btn-primary btn-sm" id="fxAdd">Agregar</button>
        </div>
        <div id="fxMsg" style="font-size:12px;margin-top:6px"></div>
      </div>
      <h4 style="margin:0 0 8px">📈 Pulso</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:10px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Clientes</div><div style="font-size:19px;font-weight:800">${P.total_users || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Trials activos</div><div style="font-size:19px;font-weight:800">${P.trials_active || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Publicados esta semana</div><div style="font-size:19px;font-weight:800">${P.published_this_week || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Programados</div><div style="font-size:19px;font-weight:800">${P.scheduled || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">QA imágenes 7d</div><div style="font-size:19px;font-weight:800">${P.qa_7d ? P.qa_7d.pct + '%' : '—'}</div><div style="font-size:11px;color:var(--mut)">${P.qa_7d ? P.qa_7d.ok + '/' + P.qa_7d.n + ' aprobadas' : 'sin datos'}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Disco libre</div><div style="font-size:19px;font-weight:800">${P.disk_free_mb != null ? P.disk_free_mb + ' MB' : '—'}</div></div>
      </div>
      <div style="margin-bottom:6px;font-size:12.5px;color:var(--mut)">Suscripciones activas por plan</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:${(P.next_trial_expiries || []).length ? '10' : '16'}px">${planChips}</div>
      ${(P.next_trial_expiries || []).length ? `<div style="font-size:12.5px;margin-bottom:16px;color:var(--mut)">⏳ Próximos vencimientos de prueba: ${P.next_trial_expiries.map(t => `${esc(t.email)} (${esc(t.ends_at)})`).join(' · ')}</div>` : ''}
      <h4 style="margin:0 0 8px">👥 Clientes</h4>
      <div class="field"><input id="adCliQ" placeholder="Buscar por negocio, email o @IG…" style="width:100%;font-size:16px"></div>
      <div id="adCliList"></div>`;
    const fxAdd = $('#fxAdd');
    if (fxAdd) fxAdd.onclick = async () => {
      const label = ($('#fxLabel').value || '').trim();
      const amt = parseFloat($('#fxAmt').value);
      const msg = $('#fxMsg');
      if (!label || !(amt >= 0)) { msg.innerHTML = `<span style="color:var(--red-d)">Nombre y monto válido.</span>`; return; }
      try { await adminApi('fixed-expenses', 'POST', { label, amount_ars: amt }); showHome(); }
      catch (e) { msg.innerHTML = `<span style="color:var(--red-d)">No se pudo guardar.</span>`; }
    };
    body.querySelectorAll('[data-fxdel]').forEach(b => b.onclick = async () => {
      try { await adminApi('fixed-expenses/delete', 'POST', { id: Number(b.dataset.fxdel) }); showHome(); }
      catch (e) { alert('No se pudo borrar'); }
    });
    const clients = r.clients || [];
    const listEl = $('#adCliList');
    const renderClients = (q) => {
      const qq = (q || '').trim().toLowerCase();
      const rows = clients.filter(u => !qq || [u.business_name || '', u.email || '', u.ig_username || ''].join(' ').toLowerCase().includes(qq));
      listEl.innerHTML = rows.map(u => {
        const st = u.plan_status === 'trial' ? '🟡 trial' + (u.trial_ends_at ? ' · vence ' + new Date(Number(u.trial_ends_at)).toISOString().slice(0, 10) : '')
          : u.plan_status === 'active' ? '🟢 activo' : esc(u.plan_status || '');
        return `
        <button class="btn btn-ghost btn-block" data-cli="${u.id}" style="text-align:left;margin-bottom:6px">
          <b>${esc(u.business_name || u.email)}</b>${u.ig_username ? ' <span style="color:var(--mut)">@' + esc(String(u.ig_username).replace(/^@/, '')) + '</span>' : ''}<br>
          <span style="font-size:11px;color:var(--mut)">${esc(u.plan || '')} · ${st} · ${u.ig_connected ? '📷 IG conectado' : 'sin IG'} · ${u.posts_published || 0} publicados · últ. act. ${esc((u.last_activity || u.created_at || '').slice(0, 10))}</span>
        </button>`;
      }).join('') || '<div class="d">Sin clientes para ese criterio.</div>';
      listEl.querySelectorAll('[data-cli]').forEach(b => b.onclick = () => showClient(Number(b.dataset.cli)));
    };
    renderClients('');
    const qIn = $('#adCliQ');
    if (qIn) qIn.oninput = () => renderClients(qIn.value);
  }
  async function showClient(uid) {
    body.innerHTML = `<div class="d">⏳ Cargando ficha…</div>`;
    let r;
    try { r = await adminApi('client/' + uid); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar la ficha.</div>`; return; }
    const u = r.user || {}, pr = r.profile || {};
    const cents$ = (c) => adm$((Number(c) || 0) / 100);
    const stIco = { published: '🟢', scheduled: '🗓', draft: '📝', failed: '🔴', publishing: '⏳' };
    body.innerHTML = `
      <button class="btn btn-soft btn-sm" id="cliBack" style="margin-bottom:12px">← Volver al panel</button>
      <div style="margin-bottom:14px">
        <div style="font-size:19px;font-weight:800">${esc(pr.business_name || u.email)}</div>
        <div style="font-size:12.5px;color:var(--mut)">${esc(u.email)}${pr.ig_username ? ' · @' + esc(String(pr.ig_username).replace(/^@/, '')) : ''}${pr.category ? ' · ' + esc(pr.category) : ''} · cliente desde ${esc((u.created_at || '').slice(0, 10))}</div>
        ${pr.description ? `<div style="font-size:12.5px;margin-top:6px">${esc(pr.description)}</div>` : ''}
        ${pr.monthly_goal ? `<div style="font-size:12.5px;margin-top:4px">🎯 Foco del mes: ${esc(pr.monthly_goal)}</div>` : ''}
      </div>
      <h4 style="margin:0 0 8px">💳 Suscripción</h4>
      <div style="font-size:13px;margin-bottom:16px;line-height:1.9">
        Plan <b>${esc(u.plan_name || u.plan || '')}</b> (${adm$(u.plan_price)}/mes) · Estado <b>${esc(u.plan_status || '')}</b><br>
        ${u.plan_status === 'trial' ? `Trial vence: <b>${u.trial_ends_at ? esc(new Date(Number(u.trial_ends_at)).toISOString().slice(0, 10)) : '—'}</b><br>` : ''}
        ${r.referrer_email ? `Referido por: ${esc(r.referrer_email)}<br>` : ''}
        Piloto automático: ${u.autopilot_enabled ? 'ON' : 'off'} · Seguidores IG: ${u.ig_followers || 0}
      </div>
      <h4 style="margin:0 0 8px">📸 Posteos (${(r.posts || []).length} recientes)</h4>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
        ${(r.posts || []).map(p => `
          <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">
            ${p.image_url ? `<img src="${esc(p.image_url)}" style="width:100%;aspect-ratio:4/5;object-fit:cover;display:block" loading="lazy">` : '<div style="aspect-ratio:4/5;background:var(--bg2)"></div>'}
            <div style="padding:6px;font-size:10.5px;line-height:1.5">
              <div>${stIco[p.status] || '•'} ${esc(p.status)}${p.media_type === 'video' ? ' 🎬' : ''}</div>
              <div style="color:var(--mut)">${esc((p.published_at || p.scheduled_at || p.created_at || '').slice(0, 10))}</div>
              <div>❤️ ${p.m_likes != null ? p.m_likes : (p.ig_likes || 0)} · 💬 ${p.m_comments != null ? p.m_comments : (p.ig_comments || 0)}${p.reach ? ' · 👁 ' + p.reach : ''}</div>
              <div style="color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((p.caption || '').split('\n')[0])}</div>
            </div>
          </div>`).join('') || '<div class="d">Sin posteos todavía.</div>'}
      </div>
      <h4 style="margin:0 0 8px">💸 Su plata con Posty</h4>
      <div style="font-size:13px;line-height:1.9;margin-bottom:6px">
        Gasto IA total: <b>US$ ${r.ai ? r.ai.total_usd : 0}</b> · este mes: <b>US$ ${r.ai ? r.ai.month_usd : 0}</b> (${r.ai ? r.ai.calls : 0} llamadas)<br>
        ${r.ai && r.ai.by_feature && r.ai.by_feature.length ? r.ai.by_feature.map(f => `<span style="font-size:11.5px;color:var(--mut)">${esc(f.feature)}: US$ ${f.usd}</span>`).join(' · ') + '<br>' : ''}
        Billetera de pauta: <b>${r.ads && r.ads.wallet ? cents$(r.ads.wallet.balance_cents) : '$0'}</b>
      </div>
      ${((r.ads && r.ads.boosts) || []).map(b => `<div style="font-size:12px;padding:5px 0;border-bottom:1px solid var(--line)">🚀 Boost #${b.id} · ${esc(b.status)} · presupuesto ${cents$(b.budget_cents)} · fee ${cents$(b.fee_cents)} · gastado ${cents$(b.last_spend_cents)} · alcance ${b.last_reach || 0}${b.error ? ' · <span style="color:var(--red-d)">' + esc(String(b.error).slice(0, 80)) + '</span>' : ''}</div>`).join('')}
      <h4 style="margin:16px 0 8px">📥 Bandejas pendientes</h4>
      <div style="font-size:13px;margin-bottom:16px">💬 Comentarios: <b>${r.queues ? r.queues.comments : 0}</b> · 📩 DMs: <b>${r.queues ? r.queues.dms : 0}</b> · ⭐ Reseñas: <b>${r.queues ? r.queues.reviews : 0}</b></div>
      <h4 style="margin:0 0 8px">🕐 Actividad reciente</h4>
      ${(r.activity || []).map(e => `<div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px"><span style="color:var(--mut);font-size:10.5px">${esc((e.created_at || '').slice(5, 16).replace(' ', ' · '))}</span> <b style="font-family:monospace;font-size:11.5px">${esc(e.name)}</b></div>`).join('') || '<div class="d">Sin actividad registrada.</div>'}
      <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
        <button class="btn btn-soft btn-sm" id="cliStop">🛑 Frenar publicación de este cliente</button>
        <span id="cliStopMsg" style="font-size:12px;margin-left:8px"></span>
      </div>`;
    const back = $('#cliBack');
    if (back) back.onclick = showHome;
    const stop = $('#cliStop');
    if (stop) stop.onclick = async () => {
      if (!confirm('¿Frenar la publicación? Lo programado vuelve a borrador y se apaga el piloto automático.')) return;
      try {
        const rr = await adminApi('stop-publishing', 'POST', { user_id: uid });
        $('#cliStopMsg').innerHTML = `<span style="color:var(--green-d)">Frenado ✅ (${rr.unscheduled || 0} desprogramados)</span>`;
      } catch (e) { $('#cliStopMsg').innerHTML = `<span style="color:var(--red-d)">No se pudo frenar.</span>`; }
    };
  }
  async function showFunnel() {
    body.innerHTML = `<div class="d">⏳ Cargando funnel…</div>`;
    let r;
    try { r = await adminApi('funnel?days=' + days()); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar. Revisá el token.</div>`; return; }
    const f = r.funnel || [];
    const g = r.goal || {};
    const tr = r.trends || {};
    const ttv = r.ttv || {};
    // Paso con mayor pérdida relativa (se marca en rojo)
    let worst = -1, worstDrop = 0;
    f.forEach((s, i) => { if (i > 0 && s.pct_prev < 100 - worstDrop) { worstDrop = 100 - s.pct_prev; worst = i; } });
    const gpct = g.target ? Math.min(100, Math.round(g.subscribers / g.target * 1000) / 10) : 0;
    const mrrFmt = '$' + Math.round(g.mrr || 0).toLocaleString('es-AR');
    const trendArrow = (t) => {
      if (!t || t.prev === 0) return '';
      const d = t.delta, up = d >= 0;
      return `<span style="font-size:11px;font-weight:800;color:${up ? 'var(--green-d)' : 'var(--red-d)'}">${up ? '▲' : '▼'} ${Math.abs(d)}%</span>`;
    };
    body.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
          <b>🎯 Meta: ${g.subscribers || 0}/${g.target || 200} suscriptores</b>
          <span style="font-size:17.5px;font-weight:800">${gpct}%</span>
        </div>
        ${bar(gpct)}
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--mut)">
          <span>💰 MRR <b style="color:var(--txt)">${mrrFmt}</b></span>
          <span>📈 Trial→pago <b style="color:var(--txt)">${g.trial_to_paid || 0}%</b></span>
          <span>🆕 Nuevos (30d) <b style="color:var(--txt)">${g.new_30d || 0}</b></span>
        </div>
      </div>
      ` + f.map((s, i) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--line)${i === worst ? ';border-left:4px solid var(--red);padding-left:10px' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b>${i + 1}. ${esc(s.label)}${i === worst ? ' <span style="font-size:10.5px;color:var(--red);font-weight:800">· MAYOR PÉRDIDA</span>' : ''}</b>
          <span style="font-size:17.5px;font-weight:800">${s.users} ${trendArrow(tr[s.key])}</span>
        </div>
        ${bar(s.pct_first)}
        <div style="font-size:11.5px;color:var(--mut);margin-top:4px">${s.pct_prev}% del paso anterior · ${s.pct_first}% del inicio</div>
      </div>`).join('') || `<div class="d">Todavía no hay datos.</div>`;
    if (ttv.n) {
      body.insertAdjacentHTML('beforeend', `
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:16px">
        <b>⏱ Time-to-value</b>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12.5px;color:var(--mut)">
          <span>Promedio <b style="color:var(--txt)">${ttv.avg_h}h</b></span>
          <span>Mediana <b style="color:var(--txt)">${ttv.med_h}h</b></span>
          <span>En 24h <b style="color:var(--txt)">${ttv.d1_pct}%</b></span>
          <span style="color:var(--dim)">(${ttv.n} usuarios)</span>
        </div>
      </div>`);
    }
  }
  async function showActivity() {
    body.innerHTML = `<div class="d">⏳ Cargando actividad…</div>`;
    let r;
    try { r = await adminApi('activity?days=' + days()); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const dau = (r.dau || []).slice(0, 14).reverse();
    const maxD = Math.max(1, ...dau.map(x => x.n));
    const tops = Object.entries(r.totals || {}).slice(0, 20);
    body.innerHTML = `
      <h4 style="margin:0 0 8px">Usuarios activos por día</h4>
      <div style="display:flex;align-items:flex-end;gap:4px;height:90px;margin-bottom:16px">
        ${dau.map(x => `<div title="${esc(x.d)}: ${x.n}" style="flex:1;background:var(--cel);border-radius:4px 4px 0 0;height:${Math.max(3, x.n / maxD * 88)}px;min-width:8px"></div>`).join('')}
      </div>
      <h4 style="margin:0 0 8px">Eventos más comunes</h4>
      ${tops.map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span style="font-family:monospace;font-size:11.5px">${esc(k)}</span><b>${v}</b></div>`).join('') || '<div class="d">Sin datos.</div>'}`;
  }
  async function showMoney() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const m = (r.growth && r.growth.money) || {};
    const cr = (r.growth && r.growth.cancel_reasons) || [];
    const cac = (r.growth && r.growth.cac) || null;
    const spendRecent = (r.growth && r.growth.spend_recent) || [];
    const rd = (r.growth && r.growth.readiness) || null;
    const fmt$ = (v) => '$' + Math.round(v || 0).toLocaleString('es-AR');
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">MRR</div><div style="font-size:19px;font-weight:800">${fmt$(m.mrr)}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Gasto IA hoy</div><div style="font-size:19px;font-weight:800">US$ ${m.ai_today_usd || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Gasto IA 30d</div><div style="font-size:19px;font-weight:800">US$ ${m.ai_30d_usd || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Costo IA / cliente</div><div style="font-size:19px;font-weight:800">US$ ${m.cost_per_user_usd || 0}</div></div>
      </div>
      <h4 style="margin:0 0 8px">Por qué se van</h4>
      ${cr.map(x => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(x.reason)}</span><b>${x.n}</b></div>`).join('') || '<div class="d">Sin cancelaciones con motivo todavía.</div>'}
      ${rd ? (() => {
        const chk = (ok, label, detail) => `<div style="display:flex;gap:8px;align-items:baseline;padding:5px 0;font-size:12.5px"><span>${ok ? '✅' : '⬜'}</span><span>${label}${detail ? ` <span style="color:var(--mut)">(${detail})</span>` : ''}</span></div>`;
        const checks = [
          chk(rd.trials_30d >= 30, 'Suficientes trials para medir', `${rd.trials_30d}/30 en 30d`),
          chk(rd.trial_paid_pct >= 15, 'Conversión trial → pago sana', `${rd.trial_paid_pct}% (meta 15%)`),
          chk(rd.retention_n >= 5 && rd.retention_old_pct >= 50, 'La gente se queda', rd.retention_n >= 5 ? `${rd.retention_old_pct}% activos de +35 días` : 'faltan datos'),
          chk(rd.gen_rate >= 95 && !rd.failed_30d && !rd.stuck, 'Sistema sano', `gen ${rd.gen_rate}% · ${rd.failed_30d} fallidos · ${rd.stuck} atascados`),
          chk(rd.cac_measured, 'CAC medido con test chico', rd.cac_measured ? 'sí' : 'cargá gasto en ads'),
        ];
        const autoOk = rd.trials_30d >= 30 && rd.trial_paid_pct >= 15 && rd.retention_n >= 5 && rd.retention_old_pct >= 50 && rd.gen_rate >= 95 && !rd.failed_30d && !rd.stuck && rd.cac_measured;
        return `<h4 style="margin:16px 0 8px">🚀 ¿Listo para los $5000/mes?</h4>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px">
          ${checks.join('')}
          ${chk(false, 'Meta App Review aprobado', 'lo confirmás vos')}
          ${chk(false, 'Pago real de MercadoPago verificado', 'lo confirmás vos')}
          <div style="margin-top:10px;font-size:13.5px;font-weight:800">${autoOk ? '🟢 Los números dicen que SÍ. Avisame y lo hablamos.' : '🔴 Todavía no — los números mandan.'}</div>
        </div>`;
      })() : ''}
      <h4 style="margin:16px 0 8px">💵 CAC — costo de adquisición</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:12px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Gasto ads 30d</div><div style="font-size:19px;font-weight:800">US$ ${cac ? cac.spend_30d : 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Pagos 30d</div><div style="font-size:19px;font-weight:800">${cac ? cac.paid_30d : 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">CAC</div><div style="font-size:19px;font-weight:800">${cac && cac.cac ? 'US$ ' + cac.cac : '—'}</div></div>
      </div>
      ${cac && cac.paid_by_utm && cac.paid_by_utm.length ? `<div class="d" style="margin-bottom:8px">Pagos por campaña (UTM, 90d)</div>
      ${cac.paid_by_utm.map(x => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span style="font-size:12.5px">${esc(x.campaign)}</span><b>${x.n}</b></div>`).join('')}` : ''}
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:12px">
        <b style="font-size:13px">Registrar gasto en ads</b>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <input id="spDate" type="date" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px" value="${new Date().toISOString().slice(0, 10)}">
          <input id="spCamp" type="text" placeholder="Campaña (opcional)" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;flex:1;min-width:140px">
          <input id="spAmt" type="number" min="0" step="0.01" placeholder="US$" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:110px">
          <button class="btn btn-primary btn-sm" id="spAdd">Guardar</button>
        </div>
        <div id="spMsg" style="font-size:12px;margin-top:6px"></div>
        ${spendRecent.length ? `<div class="d" style="margin:10px 0 4px">Últimos gastos</div>` + spendRecent.map(s => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(s.date)}${s.campaign ? ' · ' + esc(s.campaign) : ''}</span><b>US$ ${s.amount_usd}</b></div>`).join('') : ''}
      </div>
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:12px">
        <b style="font-size:13px">🧮 Simulador de CAC</b>
        <p class="d" style="margin:4px 0 10px">Jugá con los números antes de gastar en diciembre.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">
          <label style="font-size:11.5px;color:var(--mut)">CPC (US$)<input id="simCpc" type="number" min="0" step="0.1" value="2" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">Click → trial %<input id="simC2t" type="number" min="0.1" step="0.5" value="5" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">Trial → pago %<input id="simT2p" type="number" min="0.1" step="1" value="20" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">ARPU mensual (US$)<input id="simArpu" type="number" min="1" step="1" value="52" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
          <label style="font-size:11.5px;color:var(--mut)">Meses que se queda<input id="simMos" type="number" min="1" step="1" value="6" style="font-size:16px;border:2px solid var(--line);border-radius:10px;padding:8px;width:100%;margin-top:4px"></label>
        </div>
        <div id="simOut" style="margin-top:12px"></div>
      </div>`;
    const spAdd = $('#spAdd');
    if (spAdd) spAdd.onclick = async () => {
      const d = $('#spDate').value, c = $('#spCamp').value.trim(), a = parseFloat($('#spAmt').value);
      const msg = $('#spMsg');
      if (!d || !(a > 0)) { msg.innerHTML = `<span style="color:var(--red-d)">Fecha y monto válido.</span>`; return; }
      try {
        await adminApi('ad-spend', 'POST', { date: d, campaign: c, amount_usd: a });
        msg.innerHTML = `<span style="color:var(--green-d)">Guardado ✅</span>`;
        setTimeout(showMoney, 900);
      } catch (e) { msg.innerHTML = `<span style="color:var(--red-d)">No se pudo guardar.</span>`; }
    };
    // Simulador de CAC
    const simCalc = () => {
      const v = (id) => parseFloat(($('#' + id) || {}).value) || 0;
      const cpc = v('simCpc'), c2t = v('simC2t') / 100, t2p = v('simT2p') / 100, arpu = v('simArpu'), mos = v('simMos');
      const out = $('#simOut');
      if (!cpc || !c2t || !t2p || !arpu || !mos) { out.innerHTML = `<div class="d">Completá todos los valores.</div>`; return; }
      const cac = cpc / c2t / t2p;
      const ltv = arpu * mos;
      const ratio = ltv / cac;
      const payback = cac / arpu;
      const clients = Math.floor(5000 / cac);
      const verdict = ratio >= 3 ? ['🟢', 'Negocio sano: cada dólar en ads vuelve x' + ratio.toFixed(1) + '.']
        : ratio >= 1 ? ['🟡', 'Ajustado: ganás, pero hay poco margen para errores.']
        : ['🔴', 'Perdés plata con cada cliente. No escales así.'];
      out.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
          <div><div style="font-size:11px;color:var(--mut)">CAC</div><div style="font-size:19px;font-weight:800">US$ ${cac.toFixed(0)}</div></div>
          <div><div style="font-size:11px;color:var(--mut)">LTV</div><div style="font-size:19px;font-weight:800">US$ ${ltv.toFixed(0)}</div></div>
          <div><div style="font-size:11px;color:var(--mut)">LTV : CAC</div><div style="font-size:19px;font-weight:800">${ratio.toFixed(1)} : 1</div></div>
          <div><div style="font-size:11px;color:var(--mut)">Payback</div><div style="font-size:19px;font-weight:800">${payback.toFixed(1)} meses</div></div>
          <div><div style="font-size:11px;color:var(--mut)">Clientes con $5000</div><div style="font-size:19px;font-weight:800">${clients}</div></div>
        </div>
        <div style="margin-top:10px;font-size:13px"><b>${verdict[0]}</b> ${verdict[1]}</div>`;
    };
    ['simCpc', 'simC2t', 'simT2p', 'simArpu', 'simMos'].forEach(id => { const el = $('#' + id); if (el) el.oninput = simCalc; });
    simCalc();
  }
  async function showReferrals() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const rf = (r.growth && r.growth.referrals) || {};
    const rc = (r.growth && r.growth.ref_clicks) || [];
    const clickByCode = {}; rc.forEach(c => { clickByCode[c.code] = c.n; });
    const conv = rf.signups ? Math.round(rf.paying / rf.signups * 1000) / 10 : 0;
    const totalClicks = rc.reduce((s, c) => s + c.n, 0);
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Clicks en links</div><div style="font-size:19px;font-weight:800">${totalClicks}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Registros por referido</div><div style="font-size:19px;font-weight:800">${rf.signups || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">De esos, pagan</div><div style="font-size:19px;font-weight:800">${rf.paying || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Conversión referido</div><div style="font-size:19px;font-weight:800">${conv}%</div></div>
      </div>
      <h4 style="margin:0 0 8px">Top referidores (clicks → registros)</h4>
      ${((rf.top || []).map(t => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(t.email)}</span><b>${clickByCode[t.code] || 0} clicks → ${t.n} reg.</b></div>`).join('')) || '<div class="d">Todavía nadie refirió.</div>'}`;
  }
  async function showContent() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const c = (r.growth && r.growth.content) || {};
    const th = (r.growth && r.growth.chat_themes) || [];
    const ts = (r.growth && r.growth.taste) || [];
    const maxT = Math.max(1, ...th.map(t => t.n));
    body.innerHTML = `
      <h4 style="margin:0 0 8px">Rendimiento en Instagram (30 días)</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Publicados</div><div style="font-size:19px;font-weight:800">${c.published_30d || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Alcance prom.</div><div style="font-size:19px;font-weight:800">${c.avg_reach || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Likes prom.</div><div style="font-size:19px;font-weight:800">${c.avg_likes || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Comentarios prom.</div><div style="font-size:19px;font-weight:800">${c.avg_comments || 0}</div></div>
      </div>
      <h4 style="margin:0 0 8px">Qué le piden a Posty (temas del chat)</h4>
      ${th.map(t => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span style="width:110px;font-size:12.5px">${esc(t.word)}</span><div style="flex:1;height:8px;background:var(--bg2);border-radius:99px;overflow:hidden"><div style="height:100%;width:${Math.round(t.n / maxT * 100)}%;background:var(--cel);border-radius:99px"></div></div><b style="font-size:12px">${t.n}</b></div>`).join('') || '<div class="d">Sin mensajes todavía.</div>'}
      <h4 style="margin:16px 0 8px">👍/👎 Qué rechazan (90 días)</h4>
      ${ts.map(t => `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--line)"><span style="font-size:12.5px">${esc(t.template)}</span><span style="font-size:12px;color:${t.reject_pct >= 30 ? 'var(--red-d)' : 'var(--mut)'}"><b>${t.reject_pct}%</b> rechazo · ${t.ok}👍 ${t.no}👎</span></div>`).join('') || '<div class="d">Sin señales todavía.</div>'}`;
  }
  async function showHealth() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const h = (r.growth && r.growth.health) || {};
    const ok = (v, good, warn) => v >= good ? 'var(--green-d)' : v >= warn ? 'var(--txt)' : 'var(--red-d)';
    body.innerHTML = `
      <h4 style="margin:0 0 4px">🩺 Salud del sistema (30 días)</h4>
      <p class="d" style="margin:0 0 12px">Fallos que ningún usuario te reporta.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Generación exitosa</div><div style="font-size:19px;font-weight:800;color:${ok(h.gen_rate || 0, 95, 80)}">${h.gen_rate || 0}%</div><div style="font-size:11px;color:var(--mut)">${h.gen_done_30d || 0}/${h.gen_start_30d || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Posts fallidos</div><div style="font-size:19px;font-weight:800;color:${(h.failed_posts_30d || 0) ? 'var(--red-d)' : 'var(--green-d)'}">${h.failed_posts_30d || 0}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">Atascados publicando</div><div style="font-size:19px;font-weight:800;color:${(h.stuck_count || 0) ? 'var(--red-d)' : 'var(--green-d)'}">${h.stuck_count || 0}</div><div style="font-size:11px;color:var(--mut)">+60 min en "publishing"</div></div>
      </div>
      ${(h.stuck_recent && h.stuck_recent.length) ? `<h4 style="margin:0 0 8px">Atascados</h4>` + h.stuck_recent.map(p => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(p.email)} · post #${p.id}</span><span style="color:var(--mut)">desde ${esc(p.at || '')}</span></div>`).join('') : ''}
      ${(h.failed_recent && h.failed_recent.length) ? `<h4 style="margin:16px 0 8px">Últimos fallidos</h4>` + h.failed_recent.map(p => `<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(p.email)}</b> · post #${p.id}<div style="color:var(--mut);font-size:11.5px">${esc(p.error || 'sin detalle')}</div></div>`).join('') : ''}
      ${!(h.stuck_count || h.failed_posts_30d) ? '<div class="d">🎉 Todo sano: nada falló ni se atascó.</div>' : ''}`;
  }
  async function showChurn() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const ch = (r.growth && r.growth.churn) || [];
    body.innerHTML = `
      <h4 style="margin:0 0 4px">⚠️ En riesgo de irse</h4>
      <p class="d" style="margin:0 0 12px">Clientes activos o en trial sin publicar hace 7+ días. Escribiles antes de que cancelen.</p>
      ${ch.map(c => `
      <div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <b style="font-size:12.5px">${esc(c.email)}</b>
          <span style="font-size:11px;color:var(--mut)">${esc(c.plan)} · ${esc(c.status)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--mut);margin-top:3px">
          ${c.last_pub ? `Última publicación: hace ${Math.max(0, Math.round((Date.now() - new Date(c.last_pub.replace(' ', 'T') + 'Z').getTime()) / 864e5))} días` : 'Nunca publicó'} · registrado hace ${c.days_since_signup} días
        </div>
      </div>`).join('') || '<div class="d">🎉 Nadie en riesgo. Todos publicando.</div>'}`;
  }
  async function showCohorts() {
    body.innerHTML = `<div class="d">⏳ Cargando…</div>`;
    let r;
    try { r = await adminApi('growth'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const ch = (r.growth && r.growth.cohorts) || [];
    body.innerHTML = `
      <h4 style="margin:0 0 4px">Retención por semana de registro</h4>
      <p class="d" style="margin:0 0 12px">% que sigue con suscripción activa hoy.</p>
      ${ch.map(c => `
      <div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
          <b style="font-size:12.5px">Semana ${esc(c.week)}</b>
          <span style="font-size:12.5px;color:var(--mut)">${c.active}/${c.total} · <b style="color:${c.pct >= 50 ? 'var(--green-d)' : c.pct >= 25 ? 'var(--txt)' : 'var(--red-d)'}">${c.pct}%</b></span>
        </div>
        ${bar(c.pct)}
      </div>`).join('') || '<div class="d">Sin datos.</div>'}`;
  }
  async function showUsers() {
    body.innerHTML = `
      <div class="field" style="display:flex;gap:8px"><input id="adQ" placeholder="email del usuario…" style="flex:1;font-size:16px"><button class="btn btn-primary btn-sm" id="adQGo">Buscar</button></div>
      <div id="adUsers"></div><div id="adTimeline" style="margin-top:12px"></div>`;
    const go = async () => {
      const q = ($('#adQ').value || '').trim();
      if (!q) return;
      $('#adUsers').innerHTML = `<div class="d">⏳ Buscando…</div>`;
      let r;
      try { r = await adminApi('users?q=' + encodeURIComponent(q)); }
      catch (e) { $('#adUsers').innerHTML = `<div class="err">Error.</div>`; return; }
      $('#adUsers').innerHTML = (r.users || []).map(u => `
        <button class="btn btn-ghost btn-block" data-uid="${u.id}" style="text-align:left;margin-bottom:6px">
          <b>${esc(u.email)}</b><br><span style="font-size:10.5px;color:var(--mut)">${esc(u.plan || '')} · ${esc(u.plan_status || '')} · desde ${esc((u.created_at || '').slice(0, 10))}</span>
        </button>`).join('') || `<div class="d">Sin resultados.</div>`;
      $$('#adUsers [data-uid]').forEach(b => b.onclick = async () => {
        $('#adTimeline').innerHTML = `<div class="d">⏳ Cargando línea de tiempo…</div>`;
        let t;
        try { t = await adminApi('events?user_id=' + b.dataset.uid + '&days=' + days() + '&limit=200'); }
        catch (e) { $('#adTimeline').innerHTML = `<div class="err">Error.</div>`; return; }
        $('#adTimeline').innerHTML = `<h4 style="margin:0 0 8px">Línea de tiempo</h4>` + ((t.events || []).map(e => {
          let pr = '';
          try { const o = JSON.parse(e.props || '{}'); const ks = Object.keys(o).slice(0, 4); if (ks.length) pr = ' <span style="color:var(--mut)">(' + ks.map(k => k + ': ' + String(o[k]).slice(0, 24)).join(', ') + ')</span>'; } catch (ee) {}
          return `<div style="padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px"><span style="color:var(--mut);font-size:10.5px">${esc((e.created_at || '').slice(5, 16).replace(' ', ' · '))}</span> <b style="font-family:monospace;font-size:11.5px">${esc(e.name)}</b>${pr}</div>`;
        }).join('') || `<div class="d">Sin eventos.</div>`);
      });
    };
    $('#adQGo').onclick = go;
    $('#adQ').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }
  // Cola de revisión de la "primera semana con rueditas": borradores con
  // needs_review=1. Aprobar → visible al cliente + golden example. Editar →
  // aplica caption, aprueba y guarda el golden con lo final. Rechazar → nota
  // que alimenta el aprendizaje y regenera el borrador con otro enfoque.
  async function showReview() {
    body.innerHTML = `<div class="d">⏳ Cargando cola de revisión…</div>`;
    let r;
    try { r = await adminApi('review-queue'); }
    catch (e) { body.innerHTML = `<div class="err">No se pudo cargar.</div>`; return; }
    const q = r.queue || [];
    if (!q.length) { body.innerHTML = `<div class="d">✨ Nada pendiente. La cola está vacía.</div>`; return; }
    body.innerHTML = `<div style="margin-bottom:10px;font-size:13px;color:var(--mut)">${q.length} borrador${q.length > 1 ? 'es' : ''} esperando revisión</div>` +
      q.map(p => `
      <div data-rev="${p.id}" style="border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px">
          <b style="font-size:14px">${esc(p.business_name || p.email || ('Usuario ' + p.user_id))}</b>
          <span style="font-size:11px;color:var(--mut)">${esc((p.created_at || '').slice(0, 16))} · ${esc(p.tipo || p.media_type || '')}</span>
        </div>
        ${p.image_url ? `<img src="${esc(p.image_url)}" style="width:100%;border-radius:10px;margin-bottom:8px" loading="lazy">` : ''}
        <div style="font-size:13.5px;white-space:pre-wrap;margin-bottom:4px">${esc(p.caption || '')}</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:10px">${esc(p.hashtags || '')}</div>
        <textarea data-rev-note rows="2" placeholder="Nota para el rechazo (¿qué hay que cambiar?)" style="font-size:16px;width:100%;border:2px solid var(--line);border-radius:10px;padding:8px;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-rev-approve="${p.id}">✅ Aprobar</button>
          <button class="btn btn-soft btn-sm" data-rev-edit="${p.id}">✏️ Aprobar con edición</button>
          <button class="btn btn-soft btn-sm" data-rev-reject="${p.id}">🔄 Rechazar y regenerar</button>
        </div>
      </div>`).join('');
    body.querySelectorAll('[data-rev-approve]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revApprove + '/approve', 'POST'); showReview(); }
      catch (e) { alert('No se pudo aprobar'); b.disabled = false; }
    });
    body.querySelectorAll('[data-rev-edit]').forEach(b => b.onclick = async () => {
      const orig = (q.find(x => String(x.id) === String(b.dataset.revEdit)) || {});
      const cap = prompt('Caption final:', orig.caption || '');
      if (cap === null) return;
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revEdit + '/edit', 'POST', { caption: cap }); showReview(); }
      catch (e) { alert('No se pudo guardar'); b.disabled = false; }
    });
    body.querySelectorAll('[data-rev-reject]').forEach(b => b.onclick = async () => {
      const card = body.querySelector(`[data-rev="${b.dataset.revReject}"]`);
      const note = card && card.querySelector('[data-rev-note]') ? card.querySelector('[data-rev-note]').value.trim() : '';
      if (!note) { alert('Escribí una nota: ¿qué hay que cambiar?'); return; }
      b.disabled = true;
      try { await adminApi('review/' + b.dataset.revReject + '/reject', 'POST', { note }); showReview(); }
      catch (e) { alert('No se pudo rechazar'); b.disabled = false; }
    });
  }
  // ---------- (v322) LANZAMIENTO: Portada · Semana · Negocio · Posteos ----------
  let launchEra = 'launch';
  const seenAlerts = () => { try { return JSON.parse(localStorage.getItem('posta_admin_alerts_seen') || '[]'); } catch (e) { return []; } };
  const healthChip = (lv) => lv === 'rojo' ? '<span style="background:#fee2e2;border:1px solid #fca5a5;border-radius:99px;padding:2px 9px;font-size:11.5px;font-weight:700">🔴 rojo</span>'
    : lv === 'amarillo' ? '<span style="background:#fef9c3;border:1px solid #fde047;border-radius:99px;padding:2px 9px;font-size:11.5px;font-weight:700">🟡 amarillo</span>'
    : lv === 'nuevo' ? '<span style="background:var(--bg2);border:1px solid var(--line);border-radius:99px;padding:2px 9px;font-size:11.5px">⚪ nuevo</span>'
    : '<span style="background:#dcfce7;border:1px solid #86efac;border-radius:99px;padding:2px 9px;font-size:11.5px;font-weight:700">🟢 verde</span>';
  const deltaTxt = (d) => { if (!d) return ''; if (!d.has_prev) return '<span style="color:var(--mut)">· sin período anterior</span>';
    const up = d.delta_pct >= 0; return `<span style="color:${up ? '#16a34a' : '#dc2626'};font-weight:700">${up ? '▲' : '▼'} ${Math.abs(d.delta_pct)}%</span> <span style="color:var(--mut)">vs período anterior (${d.prev})</span>`; };
  const usd = (v) => v == null ? '—' : 'US$ ' + (Math.round(v * 100) / 100).toLocaleString('es-AR');
  const imgTag = (url, tok) => url ? `<img src="${esc(url)}?token=${encodeURIComponent(tok)}" style="width:54px;height:68px;object-fit:cover;border-radius:8px" loading="lazy">` : '';
  async function showLaunch(sub) {
    sub = sub || 'portada';
    body.innerHTML = `<div class="d">⏳ Cargando el tablero de lanzamiento…</div>`;
    const tok = adminToken();
    const eraSel = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <button class="btn btn-soft btn-sm" data-lsub="portada">☀️ Portada</button>
        <button class="btn btn-soft btn-sm" data-lsub="semana">📬 Semana</button>
        <button class="btn btn-soft btn-sm" data-lsub="negocio">📈 Negocio</button>
        <button class="btn btn-soft btn-sm" data-lsub="posteos">🖼️ Posteos por cuenta</button>
        <span style="flex:1"></span>
        <label style="font-size:12px;color:var(--mut)">Medición:
          <select id="laEra" style="font-size:14px;border:2px solid var(--line);border-radius:8px;padding:4px">
            <option value="launch" ${launchEra === 'launch' ? 'selected' : ''}>desde el lanzamiento (1/1/2027)</option>
            <option value="all" ${launchEra === 'all' ? 'selected' : ''}>todo, incl. era de prueba</option>
          </select></label>
      </div><div id="laBody"></div>`;
    body.innerHTML = eraSel;
    const lb = $('#laBody');
    body.querySelectorAll('[data-lsub]').forEach(b => { if (b.dataset.lsub === sub) b.classList.add('btn-primary'); b.onclick = () => showLaunch(b.dataset.lsub); });
    const es = $('#laEra'); if (es) es.onchange = () => { launchEra = es.value; showLaunch(sub); };
    const q = 'era=' + launchEra;
    if (sub === 'portada') {
      let r; try { r = await adminApi('morning?' + q); } catch (e) { lb.innerHTML = '<div class="err">No se pudo cargar la portada.</div>'; return; }
      const M = r.morning || {}; const A = M.attention || {}; const Y = M.yesterday || {}; const T = M.today || {}; const P = M.pulse || {};
      const seen = seenAlerts();
      const alertsHtml = (A.alerts || []).map(a => `<div style="font-size:13px;padding:7px 0;border-bottom:1px solid var(--line)">${seen.includes(a.key) ? '' : '<b style="color:#dc2626">NUEVA</b> '}${esc(a.title)}<div style="font-size:12px;color:var(--mut)">${esc(a.detail || '')}</div></div>`).join('') || '<div class="d">Sin alertas activas. 🎉</div>';
      const riskHtml = (A.risk_accounts || []).map(a => `<div style="display:flex;gap:8px;align-items:center;font-size:13px;padding:6px 0;border-bottom:1px solid var(--line)">${healthChip(a.level)}<b>${esc(a.business_name || '')}</b><span style="color:var(--mut)">${esc(a.cause_why || '')}</span>${a.founder_decision ? '<b style="color:#dc2626">⭐ decisión del fundador</b>' : ''}${a.play ? `<span style="font-size:11.5px;color:var(--mut)">jugada: ${esc(a.play)}</span>` : ''}</div>`).join('') || '<div class="d">Ninguna cuenta en amarillo o rojo.</div>';
      const cnt = Y.counts || {}, dl = Y.deltas || {};
      const cntRow = (label, key) => `<div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">${label}</div><div style="font-size:20px;font-weight:800">${cnt[key] || 0}</div><div style="font-size:11.5px">${deltaTxt(dl[key])}</div></div>`;
      const byAcct = {};
      (Y.published || []).forEach(p => { (byAcct[p.business_name || ('cuenta ' + p.user_id)] = byAcct[p.business_name || ('cuenta ' + p.user_id)] || []).push(p); });
      lb.innerHTML = `
      <h4 style="margin:2px 0 8px">🚨 Atención primero</h4>
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:6px">${alertsHtml}
      <button class="btn btn-soft btn-sm" id="laSeen" style="margin-top:8px">Marcar alertas como vistas</button></div>
      <div style="margin-bottom:16px">${riskHtml}</div>
      <h4 style="margin:0 0 8px">🌙 Lo que pasó desde ayer <span style="font-size:11px;color:var(--mut)">(${esc(M.day_basis || '')})</span></h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px;margin-bottom:10px">
        ${cntRow('Pagos', 'payments')}${cntRow('Pruebas iniciadas', 'trials_started')}${cntRow('Pruebas completadas', 'trials_completed')}${cntRow('Registros', 'registers')}${cntRow('Publicados', 'published')}${cntRow('Fallidos', 'failed')}${cntRow('Semanas generadas', 'weeks_generated')}
      </div>
      ${(Y.payments || []).length ? `<div style="font-size:13px;margin-bottom:8px">🎉 Pagos: ${(Y.payments || []).map(p => '<b>' + esc(p.business_name || 'cuenta ' + p.user_id) + '</b>').join(' · ')}</div>` : ''}
      ${(Y.registers || []).length ? `<div style="font-size:13px;margin-bottom:8px">🆕 Registros: ${(Y.registers || []).map(p => esc(p.business_name || p.email)).join(' · ')}</div>` : ''}
      ${Object.entries(byAcct).map(([name, ps]) => `<div style="margin-bottom:8px"><div style="font-size:12.5px;color:var(--mut);margin-bottom:4px">${esc(name)}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${ps.map(p => imgTag(p.image_url, tok)).join('')}</div></div>`).join('')}
      ${(Y.failed || []).length ? `<div style="font-size:13px;color:#dc2626;margin-bottom:12px">❌ Fallos: ${(Y.failed || []).map(f => esc(f.business_name || '') + ' — ' + esc(f.cause || '')).join(' · ')}</div>` : '<div style="font-size:13px;margin-bottom:12px">Sin posteos fallidos ayer. ✅</div>'}
      <h4 style="margin:0 0 8px">📅 Lo que pasa hoy</h4>
      ${(T.posts || []).length ? (T.posts || []).map(p => `<div style="display:flex;gap:10px;align-items:center;font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)">${imgTag(p.image_url, tok)}<span><b>${esc(p.time_art || '')}</b> · ${esc(p.business_name || '')} · ${esc(p.tipo || p.media_type || '')}</span></div>`).join('') : '<div class="d">Hoy no sale ningún posteo programado.</div>'}
      ${(T.pending_approval_weeks || []).length ? `<div style="font-size:13px;margin-top:8px">⏳ Semanas esperando aprobación del cliente: ${(T.pending_approval_weeks || []).map(w => esc(w.business_name || '') + ' (' + w.pending + ')').join(' · ')}</div>` : ''}
      <div style="font-size:12px;color:var(--mut);margin-top:6px">Preguntas radar sin responder: ${T.radar_pending == null ? 'sin fuente consultable todavía (se declara, no se inventa)' : T.radar_pending}</div>
      <h4 style="margin:14px 0 8px">💓 El pulso</h4>
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px">
        <div style="font-size:13px">Suscriptores pagos: <b style="font-size:19px">${(P.subscribers || {}).payers || 0}</b> / 200 (${(P.subscribers || {}).pct || 0}%)</div>
        ${bar((P.subscribers || {}).pct || 0)}
        <div style="font-size:12.5px;color:var(--mut);margin-top:8px">${esc((P.subscribers || {}).basis || (P.subscribers || {}).reason || '')}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:13px">
          <span>Gasto IA ayer: <b>${usd(P.ai_cost_yesterday_usd)}</b></span>
          <span>Acumulado histórico: <b>${usd(P.ai_cost_all_time_usd)}</b></span>
        </div>
        <div style="font-size:11.5px;color:var(--mut);margin-top:4px">${esc(P.ai_note || '')}</div>
      </div>`;
      const sb = $('#laSeen'); if (sb) sb.onclick = () => { try { localStorage.setItem('posta_admin_alerts_seen', JSON.stringify((A.alerts || []).map(a => a.key))); } catch (e) {} showLaunch('portada'); };
      return;
    }
    if (sub === 'semana') {
      let r; try { r = await adminApi('founder-letter?' + q); } catch (e) { lb.innerHTML = '<div class="err">No se pudo cargar la carta.</div>'; return; }
      const L = r.letter || {};
      lb.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><b>📬 Carta del lunes — semana del ${esc(L.week_key || '')}</b><span style="font-size:11.5px;color:var(--mut)">${L.cached ? 'guardada' : 'recién generada'} ${esc((L.generated_at || '').slice(0, 16))}</span><button class="btn btn-soft btn-sm" id="laRegen">↻ Regenerar</button></div>
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:16px;white-space:pre-wrap;font-size:14px;line-height:1.55">${esc(L.text || '')}</div>`;
      const rb = $('#laRegen'); if (rb) rb.onclick = async () => { try { await adminApi('founder-letter?' + q + '&regen=1'); showLaunch('semana'); } catch (e) { alert('No se pudo regenerar'); } };
      return;
    }
    if (sub === 'negocio') {
      let r; try { r = await adminApi('launch-board?' + q + '&days=' + days()); } catch (e) { lb.innerHTML = '<div class="err">No se pudo cargar el tablero.</div>'; return; }
      const B = r.board || {}; const F = B.funnel || {}; const Mo = B.money || {}; const Q = B.quality || {}; const Tx = Q.taxonomy || {};
      const stepRows = (F.steps || []).map(st => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(st.label)}</span><span><b>${st.users}</b> ${deltaTxt(st.delta)}</span></div>`).join('');
      const dimTable = (title, obj) => { const keys = Object.keys(obj || {}); if (!keys.length) return ''; return `<div style="font-size:12.5px;color:var(--mut);margin:10px 0 4px">${title}</div>` + keys.map(k => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;border-bottom:1px solid var(--line)"><span>${esc(k)}</span><span>${(F.steps || []).map(st => (obj[k][st.key] || 0)).join(' → ')}</span></div>`).join(''); };
      lb.innerHTML = `
      ${B.window && B.window.prev_note ? `<div style="font-size:12px;color:#b45309;margin-bottom:8px">⚠️ ${esc(B.window.prev_note)}</div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px">
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">⏱️ Time-to-value</div><div style="font-size:19px;font-weight:800">${B.ttv && B.ttv.n ? (B.ttv.med_h + ' h') : '—'}</div><div style="font-size:11.5px;color:var(--mut)">${B.ttv && B.ttv.n ? ('mediana registro → primer posteo publicado · promedio ' + B.ttv.avg_h + ' h · ' + B.ttv.d1_pct + '% en 24 h · n=' + B.ttv.n) : 'sin publicaciones medidas en la ventana'}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">🎯 Rumbo a los 200</div><div style="font-size:19px;font-weight:800">${(B.projection || {}).payers || 0} / 200</div><div style="font-size:11.5px;color:var(--mut)">${esc((B.projection || {}).basis || (B.projection || {}).reason || '')}</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">💰 Margen del período</div><div style="font-size:19px;font-weight:800">${usd((Mo.totals || {}).margin_period_usd)}</div><div style="font-size:11.5px;color:var(--mut)">ingresos ${usd((Mo.totals || {}).revenue_period_usd)} − IA ${usd((Mo.totals || {}).cost_period_usd)} · acumulado IA histórico ${usd((Mo.totals || {}).cost_all_time_usd)} (nunca reseteado)</div></div>
        <div class="card" style="padding:12px"><div style="font-size:11px;color:var(--mut)">✨ Calidad a la primera</div><div style="font-size:19px;font-weight:800">${Q.first_pass_pct == null ? '—' : Q.first_pass_pct + '%'}</div><div style="font-size:11.5px;color:var(--mut)">${Q.first_pass || 0}/${Q.total || 0} piezas sin toques · tendencia ${Q.trend ? (Q.trend.first_half_pct + '% → ' + Q.trend.second_half_pct + '%') : '—'} · ediciones/cuenta/semana: ${Q.edits_per_account_week == null ? '—' : Q.edits_per_account_week}</div></div>
      </div>
      <h4 style="margin:0 0 6px">🧭 Funnel (${esc((B.window || {}).days || '')} días)</h4>${stepRows}
      ${dimTable('Por canal (src)', F.by_src)}${dimTable('Por idioma', F.by_lang)}
      <h4 style="margin:14px 0 6px">🏷️ Qué mejorar primero (taxonomía de rechazos)</h4>
      ${(Tx.improve_first || []).length ? (Tx.improve_first || []).map(t => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(t.cause)}</span><b>${t.n}</b></div>`).join('') : '<div class="d">Sin ediciones/rechazos clasificados en la ventana.</div>'}
      <div style="font-size:11.5px;color:var(--mut)">${esc(((Tx.rules || []).join(' · ')))}</div>
      <h4 style="margin:14px 0 6px">💸 Costo de IA por cuenta y margen por plan</h4>
      ${(Mo.accounts || []).slice(0, 15).map(a => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(a.email)} · ${esc(a.plan || '')}</span><span>IA ${usd(a.cost_period_usd)} · histórico ${usd(a.cost_all_time_usd)} · margen ${usd(a.margin_period_usd)}</span></div>`).join('') || '<div class="d">Sin costos en la ventana.</div>'}
      ${(Mo.by_plan || []).map(p => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line)"><span>plan ${esc(p.plan)} · ${p.subs} subs</span><span>ingresos ${p.revenue_known ? usd(p.revenue_usd) : '—'} · margen ${usd(p.margin_usd)}</span></div>`).join('')}
      ${(Mo.by_rubro || []).length ? '<div style="font-size:12.5px;color:var(--mut);margin:8px 0 2px">Por rubro</div>' + (Mo.by_rubro || []).map(p => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(p.rubro)} · ${p.subs} subs</span><span>margen ${usd(p.margin_usd)}</span></div>`).join('') : ''}
      <div style="font-size:12.5px;margin-top:8px">LTV: ${Mo.ltv ? (usd(Mo.ltv.ltv_usd) + ' (precio prom. ' + usd(Mo.ltv.avg_price_usd) + ' × ' + Mo.ltv.avg_months_retained + ' meses retenidos, n=' + Mo.ltv.payers + ')') : 'sin dato todavía'} · CAC: ${Mo.cac && Mo.cac.cac_usd != null ? usd(Mo.cac.cac_usd) : 'sin dato'} <span style="color:var(--mut)">${esc((Mo.cac || {}).by_channel_note || '')}</span></div>
      <h4 style="margin:14px 0 6px">🔁 Cohortes semanales</h4>
      ${(B.cohorts || []).map(c => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line)"><span>semana ${esc(c.week)}</span><span>${c.signups} altas · conv. ${c.conversion_pct}% · retención ${c.retention_pct == null ? 'todavía no medible' : c.retention_pct + '%'} · IA ${usd(c.ai_cost_usd)}</span></div>`).join('') || '<div class="d">Sin altas en la ventana.</div>'}
      <h4 style="margin:14px 0 6px">🌡️ Rescate por causa (rojo → verde)</h4>
      ${((B.health || {}).rescue_by_cause || []).map(x => `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(x.cause)} · ${esc(x.play)}</span><span>${x.resueltas}/${x.total} rescatadas (${x.rescate_pct}%)${x.avg_days != null ? ' · ' + x.avg_days + ' días prom.' : ''} · abiertas ${x.abiertas}</span></div>`).join('') || '<div class="d">Todavía no hubo intervenciones registradas.</div>'}
      <div style="font-size:12.5px;margin-top:6px">Autopsia de bajas: ${(B.churn || {}).n ? ((B.churn || {}).n + ' foto(s) finales guardadas · con intervención previa: ' + (B.churn || {}).with_prior_intervention) : esc((B.churn || {}).note || '')}</div>
      <div style="font-size:12.5px;margin-top:6px">Loop de aprendizaje: ${esc(((B.learning || {}).note || ''))}</div>
      ${((B.dictionary || {}).unregistered || []).length ? `<div style="font-size:12.5px;color:#b45309;margin-top:6px">📖 Eventos sin registrar en el diccionario (legado): ${esc(((B.dictionary || {}).unregistered || []).join(', '))}</div>` : ''}`;
      return;
    }
    // posteos por cuenta
    let r; try { r = await adminApi('accounts-posts'); } catch (e) { lb.innerHTML = '<div class="err">No se pudo cargar la vista de posteos.</div>'; return; }
    const accs = r.accounts || [];
    lb.innerHTML = `<div style="font-size:12.5px;color:var(--mut);margin-bottom:8px">Orden: primero las cuentas que necesitan ojos. 🔴 ${(r.by_level || {}).rojo || 0} · 🟡 ${(r.by_level || {}).amarillo || 0} · 🟢 ${(r.by_level || {}).verde || 0} · ⚪ ${(r.by_level || {}).nuevo || 0}</div>
    <div style="font-size:11.5px;color:var(--mut);margin-bottom:10px">${(r.rules || []).map(esc).join(' · ')}</div>
    <div id="laAccList">${accs.map(a => `<button class="btn btn-ghost btn-block" data-acc="${a.user_id}" style="text-align:left;margin-bottom:6px">${healthChip(a.health)} <b>${esc(a.business_name || a.email)}</b> <span style="color:var(--mut)">@${esc(a.ig_username || '—')} · ${esc(a.plan || '')}/${esc(a.plan_status || '')} · aprueba ${a.signals.approved} · edita ${a.signals.edited} · rechaza ${a.signals.rejected}${a.signals.approval_rate != null ? ' · aprobación ' + a.signals.approval_rate + '%' : ''}${a.founder_decision ? ' · ⭐ decisión del fundador' : ''}<br><span style="font-size:11.5px">${esc((a.reasons || []).join(' · '))}</span></span></button>`).join('') || '<div class="d">Sin cuentas.</div>'}</div>
    <div id="laAccDetail"></div>`;
    lb.querySelectorAll('[data-acc]').forEach(b => b.onclick = async () => {
      const det = $('#laAccDetail'); det.innerHTML = '<div class="d">⏳ Cargando posteos…</div>';
      let dr; try { dr = await adminApi('user-posts?user_id=' + b.dataset.acc); } catch (e) { det.innerHTML = '<div class="err">No se pudo cargar la cuenta.</div>'; return; }
      const D = dr.detail || {}; const S = D.signals || {};
      det.innerHTML = `<div style="border:1.5px solid var(--line);border-radius:14px;padding:14px;margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b>${esc((D.user || {}).business_name || (D.user || {}).email || '')}</b>
        <button class="btn btn-soft btn-sm" id="laGoReview">✨ Ir a la cola de Revisión</button></div>
        <div style="font-size:12.5px;color:var(--mut);margin:6px 0">Señales 30 días — aprueba ${S.approved || 0} · edita ${S.edits || 0} · rechaza ${(S.rejected || 0) + (S.rating_low || 0)} · aprobación ${S.approval_rate == null ? '—' : S.approval_rate + '%'} · regeneraciones ${(S.posts || {}).img_redos || 0} · sin ancla ${(S.posts || {}).sin_ancla || 0}</div>
        ${(D.interventions || []).length ? `<div style="font-size:12.5px;margin-bottom:8px">Intervenciones: ${(D.interventions || []).map(i => esc(i.cause) + ' → ' + esc(i.play) + ' (' + esc(i.status) + ', ' + esc(String(i.created_at).slice(0, 10)) + ')').join(' · ')}</div>` : ''}
        ${(D.posts || []).map(p => `<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
          ${imgTag(p.image_url, tok)}
          <div style="flex:1;font-size:12.5px">
            <b>${esc(p.tipo || p.media_type || '')}</b> · ${esc(p.status)}${p.approval ? ' · ' + esc(p.approval) : ''} · ${esc((p.scheduled_at || p.published_at || p.created_at || '').slice(0, 16))}
            ${(p.flags || []).map(f => `<span style="background:#fee2e2;border-radius:99px;padding:1px 8px;font-size:11px;font-weight:700;margin-left:4px">⚠️ ${esc(f)}</span>`).join('')}
            <div style="white-space:pre-wrap;margin-top:3px">${esc((p.caption || '').slice(0, 220))}</div>
            ${p.why ? `<div style="color:var(--mut);margin-top:3px">Por qué: ${esc(p.why)}</div>` : ''}
            ${p.error ? `<div style="color:#dc2626;margin-top:3px">${esc(p.error)}</div>` : ''}
          </div></div>`).join('') || '<div class="d">Sin posteos.</div>'}
        <div style="font-size:11.5px;color:var(--mut);margin-top:8px">${esc(D.review_note || '')}</div></div>`;
      const gb = $('#laGoReview'); if (gb) gb.onclick = () => { const rb = $('#adminCard [data-atab="review"]'); if (rb) rb.click(); };
      det.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  $$('#adminCard [data-atab]').forEach(b => b.onclick = () => {
    $$('#adminCard [data-atab]').forEach(x => x.classList.remove('btn-primary'));
    b.classList.add('btn-primary');
    ({ launch: showLaunch, home: showHome, funnel: showFunnel, activity: showActivity, users: showUsers, review: showReview, money: showMoney, referrals: showReferrals, content: showContent, cohorts: showCohorts, churn: showChurn, health: showHealth })[b.dataset.atab]();
  });
  // Banner de alertas: la info tiene que buscar al dueño
  try {
    const gr = await adminApi('growth');
    const al = (gr.growth && gr.growth.alerts) || [];
    if (al.length) {
      const bar = document.createElement('div');
      bar.style.cssText = 'margin-bottom:12px;border-radius:12px;padding:12px 14px;background:#fff7ed;border:1.5px solid #fdba74';
      bar.innerHTML = '<b style="font-size:13px">🔔 Alertas</b>' + al.map(a =>
        `<div style="font-size:12.5px;margin-top:6px;${a.sev === 'high' ? 'color:var(--red-d);font-weight:700' : ''}">• ${esc(a.text)}</div>`).join('');
      card.insertBefore(bar, card.firstChild);
    }
  } catch (e) {}
  const f0 = $('#adminCard [data-atab="launch"]'); if (f0) f0.click();
  const dd = $('#adDays'); if (dd) dd.onchange = () => { const cur = $('#adminCard .btn-primary[data-atab]'); if (cur) cur.click(); };
}
