// test-lote-ads-credenciales.js — LOTE ADS-CREDENCIALES
// ANCLA: 16/11 10:14, verificado en vivo por bamboo — el toque en
// «Conectar mi cuenta publicitaria» falla «Invalid App ID»: el diálogo
// de Facebook Login for Business (FLB) se compone con client_id = la
// app de INSTAGRAM (1584442866759512) en vez de la app de Facebook
// «Posty» (1071964178986518), dueña del META_FLB_CONFIG_ID («Posty
// clientes», paquete de Meta de Valentino completo el 15/11).
// CAUSA (censo sobre v1133): unifiedCfgFor (server.js) resolvía la app
// del login unificado igual que el callback de Instagram —
// settings.meta_app_id → IG_APP_ID → META_APP_ID — y en producción
// ganaba IG_APP_ID. El config_id y la app son pareja inseparable:
// un config_id de FLB solo sirve con la app bajo la que se creó.
// EL LOTE: unifiedCfgFor lee SOLO las variables dedicadas
//   META_FLB_APP_ID / META_FLB_APP_SECRET (junto a la ya existente
//   META_FLB_CONFIG_ID). Sin ellas, unifiedReady = false y un hit a
//   /api/ig/unified/go responde el error claro de buildUnifiedAuth:
//   falla cerrado, jamás compone el diálogo con la app de IG.
// Los flujos de Instagram NO se tocan (su resolución sigue intacta).
//
// Qué prueba:
//  A (estático): unifiedCfgFor lee las dedicadas y ya no contiene
//     ninguna caída a IG/META/settings; la resolución del callback de
//     IG y buildIgAuth quedan byte-presentes como en el prístino.
//  B (boot con entorno tipo producción: dedicadas + IG + META puestas):
//     [FIX] /api/ig/unified/go → 302 al diálogo FLB con
//     client_id = META_FLB_APP_ID (ni el de IG ni el de META) y el
//     config_id; [INVARIANTE] /api/ig/start sigue resolviendo la app
//     de IG desde la Embed URL, igual que siempre.
//  C (boot SIN dedicadas pero con TODO el fallback viejo disponible):
//     [FIX] /api/ig/unified/go → 400 con el mensaje claro y SIN
//     redirect a facebook: el intento de conexión falla cerrado.
//     En el control prístino, B-[FIX] y C-[FIX] fallan reproduciendo
//     el defecto (302 con client_id de la app de IG); los
//     [INVARIANTE] pasan en ambos árboles.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-credenciales.js
// (desde release/; para el control, copiar a pristine/ y correr ahí.)
// Boots reales en puertos 35177/35178 con DATA_DIR temporal en /tmp:
// no crea data/ en el árbol ni llama a Meta (solo se lee el redirect).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT1 = 35177;
const PORT2 = 35178;

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// ---------- A. Estático ----------
console.log('== A. Estático: la resolución del login unificado ==');
const SRV = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const iCfg = SRV.indexOf('function unifiedCfgFor(userId)');
t(iCfg >= 0, 'A0 unifiedCfgFor existe');
const cfgBody = iCfg >= 0 ? SRV.slice(iCfg, SRV.indexOf('\n}\n', iCfg)) : '';
t(cfgBody.includes('process.env.META_FLB_APP_ID'), 'A1 unifiedCfgFor lee META_FLB_APP_ID', cfgBody.slice(0, 200));
t(cfgBody.includes('process.env.META_FLB_APP_SECRET'), 'A2 unifiedCfgFor lee META_FLB_APP_SECRET');
t(cfgBody.includes('process.env.META_FLB_CONFIG_ID'), 'A3 unifiedCfgFor sigue leyendo META_FLB_CONFIG_ID');
t(!cfgBody.includes('process.env.IG_APP_ID') && !cfgBody.includes('process.env.IG_APP_SECRET'), 'A4 [FIX] unifiedCfgFor ya NO cae a IG_APP_ID/IG_APP_SECRET');
t(!cfgBody.includes('process.env.META_APP_ID') && !cfgBody.includes('process.env.META_APP_SECRET'), 'A5 [FIX] unifiedCfgFor ya NO cae a META_APP_ID/META_APP_SECRET');
t(!cfgBody.includes('meta_app_id') && !cfgBody.includes('meta_app_secret'), 'A6 [FIX] unifiedCfgFor ya NO usa el override por settings del usuario');
t(SRV.includes('const appId = s.meta_app_id || process.env.IG_APP_ID || process.env.META_APP_ID;'), 'A7 [INVARIANTE] el callback de Instagram conserva su resolución (settings → IG → META)');
t(SRV.includes('process.env.META_IG_EMBED_URL || process.env.IG_EMBED_URL || s.ig_embed_url'), 'A8 [INVARIANTE] buildIgAuth conserva la precedencia de la Embed URL');
const iReady = SRV.indexOf('function unifiedReady(userId)');
const readyBody = iReady >= 0 ? SRV.slice(iReady, SRV.indexOf('\n}\n', iReady)) : '';
t(readyBody.includes('c.configId && c.appId && c.appSecret'), 'A9 unifiedReady sigue exigiendo config_id + app + secreto');

// ---------- harness de boot ----------
async function bootAndRun(port, envExtra, dropKeys, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-cred-'));
  const env = {
    ...process.env, PORT: String(port), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), NODE_PATH: NM,
    OPENAI_API_KEY: '',
    ...envExtra,
  };
  for (const k of dropKeys) delete env[k];
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += String(d); });
  child.stderr.on('data', (d) => { bootLog += String(d); });
  const dataDirAntes = fs.existsSync(path.join(ROOT, 'data'));
  async function req(method, p, body, cookie, manual) {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, {
      method, redirect: manual ? 'manual' : 'follow',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { status: r.status, json, text: txt, location: r.headers.get('location') || '', setCookie: r.headers.get('set-cookie') || '' };
  }
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, `boot en ${port} levanta`, bootLog.slice(-300));
    if (up) await fn(req, tmpDir);
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t(fs.existsSync(path.join(ROOT, 'data')) === dataDirAntes, `boot en ${port} no creó data/ en el árbol`);
}

async function main() {
  // ---------- B. Con las dedicadas (entorno tipo producción) ----------
  console.log('== B. Boot con META_FLB_APP_ID/SECRET (y el fallback viejo también puesto) ==');
  await bootAndRun(PORT1, {
    META_FLB_CONFIG_ID: 'cfg-posty-test',
    META_FLB_APP_ID: 'FBAPP999', META_FLB_APP_SECRET: 'fb-secret-test',
    IG_APP_ID: 'IGAPP111', IG_APP_SECRET: 'ig-secret-test',
    META_APP_ID: 'METAAPP222', META_APP_SECRET: 'meta-secret-test',
    IG_EMBED_URL: 'https://www.instagram.com/oauth/authorize?client_id=IGAPP111&redirect_uri=https%3A%2F%2Fplaceholder.invalid%2Fcb&response_type=code&scope=instagram_business_basic',
  }, [], async (req) => {
    const reg = await req('POST', '/api/auth/register', { email: 'cred-b@test.local', password: 'secreta123' });
    const cookie = String(reg.setCookie).split(';')[0];
    t(!!cookie && reg.status < 300, 'B0 registro con cookie de sesión', String(reg.status));

    const go = await req('GET', '/api/ig/unified/go', null, cookie, true);
    t(go.status === 302, 'B1 [FIX] /api/ig/unified/go redirige (302)', String(go.status) + ' ' + go.text.slice(0, 120));
    t(go.location.includes('facebook.com/v26.0/dialog/oauth'), 'B2 [FIX] el destino es el diálogo FLB de Meta', go.location.slice(0, 120));
    t(go.location.includes('client_id=FBAPP999'), 'B3 [FIX] el diálogo se compone con client_id = META_FLB_APP_ID (la app «Posty»)', go.location.slice(0, 200));
    t(go.location.includes('config_id=cfg-posty-test'), 'B4 [FIX] el config_id viaja junto a SU app', go.location.slice(0, 200));
    t(!go.location.includes('client_id=IGAPP111') && !go.location.includes('client_id=METAAPP222'), 'B5 [FIX] ni la app de IG ni META_APP_ID llegan al diálogo', go.location.slice(0, 200));

    const start = await req('GET', '/api/ig/start', null, cookie);
    t(start.status === 200 && start.json && String(start.json.url || '').includes('client_id=IGAPP111'), 'B6 [INVARIANTE] /api/ig/start sigue resolviendo la app de Instagram desde la Embed URL', JSON.stringify(start.json).slice(0, 200));
  });

  // ---------- C. Sin las dedicadas: falla cerrado ----------
  console.log('== C. Boot SIN META_FLB_APP_ID/SECRET (todo el fallback viejo disponible) ==');
  await bootAndRun(PORT2, {
    META_FLB_CONFIG_ID: 'cfg-posty-test',
    IG_APP_ID: 'IGAPP111', IG_APP_SECRET: 'ig-secret-test',
    META_APP_ID: 'METAAPP222', META_APP_SECRET: 'meta-secret-test',
  }, ['META_FLB_APP_ID', 'META_FLB_APP_SECRET'], async (req) => {
    const reg = await req('POST', '/api/auth/register', { email: 'cred-c@test.local', password: 'secreta123' });
    const cookie = String(reg.setCookie).split(';')[0];
    t(!!cookie && reg.status < 300, 'C0 registro con cookie de sesión', String(reg.status));

    const go = await req('GET', '/api/ig/unified/go', null, cookie, true);
    t(go.status === 400, 'C1 [FIX] sin las dedicadas, /api/ig/unified/go responde 400 (no compone diálogo)', String(go.status) + ' loc=' + go.location.slice(0, 120));
    t(go.text.includes('todavía no está habilitada'), 'C2 [FIX] el estado es claro: «La conexión publicitaria todavía no está habilitada en Posty.»', go.text.slice(0, 200));
    t(!go.location.includes('facebook.com') && !go.text.includes('client_id=IGAPP111'), 'C3 [FIX] la app de IG jamás llega a un diálogo FLB', go.location.slice(0, 120));
  });

  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  if (fails.length) { console.log('FALLAS:\n- ' + fails.join('\n- ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
