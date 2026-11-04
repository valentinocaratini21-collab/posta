// test-lotepruebalogin.js — LOTE PRUEBA EN LOGIN · la prueba de 3 días
// gratis es la puerta principal de la pantalla de inicio de sesión.
// Valentino 1/11: el que descarga la app por primera vez no tiene cuenta,
// así que pedirle que entre es una pared. En #/login, botón principal
// grande «Probar 3 días gratis» (EN «Try 3 days free») que abre el flujo
// de un clic EXISTENTE (el mismo de /prueba; /en/prueba en EN). El login
// queda secundario abajo, intacto. Registro, olvido y reset: sin tocar.
// Node puro, lee el árbol. Uso: node test-lotepruebalogin.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const prueba = fs.readFileSync(path.join(__dirname, 'public/prueba.html'), 'utf8');
const pruebaEn = fs.readFileSync(path.join(__dirname, 'public/en-prueba.html'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- 1. Strings ES/EN exactos (AUTH_STR, espejo total) ----------
t(app.includes("trialCta: 'Probar 3 días gratis', trialOr: 'o entrá con tu cuenta',"), 'ES: trialCta + trialOr exactos');
t(app.includes("trialCta: 'Try 3 days free', trialOr: 'or log in to your account',"), 'EN: trialCta + trialOr exactos');
t(cnt(app, 'trialCta:') === 2, 'trialCta aparece exactamente 2 veces (ES + EN, sin duplicados)');
t(cnt(app, 'trialOr:') === 2, 'trialOr aparece exactamente 2 veces (ES + EN)');

// ---------- 2. El CTA en authView: puerta principal, solo login ----------
const av = sliceFn(app, 'function authView(mode) {', 'function forgotView()');
t(av.length > 1000, 'authView localizada');
t(cnt(app, 'id="btnTrialLogin"') === 1, 'un solo CTA btnTrialLogin en todo el bundle');
t(av.includes('isLogin ? `<a id="btnTrialLogin"'), 'el CTA vive dentro del ternario isLogin (registro no lo muestra)');
const ctaLine = av.split('\n').find((l) => l.includes('btnTrialLogin')) || '';
t(ctaLine.includes('class="btn btn-primary btn-block"'), 'CTA: botón principal grande (btn-primary btn-block)');
t(ctaLine.includes("href=\"${authLang() === 'en' ? '/en/prueba' : '/prueba'}\""), 'CTA: href por idioma de la superficie (EN → /en/prueba, ES → /prueba)');
t(ctaLine.includes('${S.trialCta}'), 'CTA: texto desde AUTH_STR (no hardcodeado)');
t(!ctaLine.includes('onclick') && !ctaLine.includes('javascript:'), 'CTA: <a> plano, sin handler JS (un toque navega; M78 0/0 por construcción)');
t(!ctaLine.includes('#/registro') && !ctaLine.includes('#/login'), 'CTA: NO apunta al registro con contraseña ni al login');
t(av.includes('<div class="social-div"><span>${S.trialOr}</span></div>'), 'divisor reutilizado .social-div con trialOr (cero CSS nuevo)');
t(!css.includes('btnTrialLogin'), 'cero CSS nuevo para el CTA');
t(av.indexOf('btnTrialLogin') < av.indexOf('id="socialBlock"'), 'CTA antes del bloque social');
t(av.indexOf('btnTrialLogin') < av.indexOf('id="authFormFields"'), 'CTA fuera de authFormFields (visible aunque haya cuentas guardadas)');

// ---------- 3. Rutas reales servidas por el servidor ----------
t(srv.includes("app.get('/prueba'") && srv.includes("public', 'prueba.html'"), 'servidor: /prueba sirve prueba.html');
t(srv.includes("app.get('/en/prueba'") && srv.includes("public', 'en-prueba.html'"), 'servidor: /en/prueba sirve en-prueba.html');

// ---------- 4. El flujo de un clic NO se tocó (se reutiliza, no se inventa) ----------
for (const [nm, f] of [['ES', prueba], ['EN', pruebaEn]]) {
  t(f.includes("entryPh: 'tu email o tu @'") || f.includes('entryPh'), nm + ': flujo de un clic con un solo campo (email o @)');
  t(f.includes("q1: '¿Qué es lo que más vendés?'") || f.includes('q1:'), nm + ': pregunta 1 presente');
  t(f.includes("q5: '¿Mostramos los precios en los posteos?'") || f.includes('q5:'), nm + ': pregunta 5 presente');
  t(f.includes('/api/auth/magic-request'), nm + ': el cierre de la prueba es magic link (sin contraseña)');
  t(f.includes('posta_trial_profile'), nm + ': puente /prueba → cuenta intacto');
}

// ---------- 5. Login intacto: formulario, pie, guardadas, social ----------
t(av.includes('id="f_email"') && av.includes('id="f_pass"') && av.includes('id="btnAuth"'), 'login: email + contraseña + Entrar intactos');
t(av.includes('id="f_remember"'), 'login: recordar intacto');
t(av.includes('id="savedAccounts"'), 'login: cuentas guardadas intactas');
t(av.includes('id="socialBlock"'), 'login: bloque social intacto');
t(app.includes("footLogin: '¿No tenés cuenta?"), 'pie login ES intacto (Registrate · Olvidé mi contraseña)');
t(app.includes("footLogin: 'No account yet?"), 'pie login EN intacto');
t(app.includes("footReg: '¿Ya tenés cuenta?"), 'pie registro intacto');
t(app.includes('function forgotView()') && app.includes('function resetView()'), 'forgot/reset existen (sin tocar)');
t(app.includes("root.innerHTML = authView(path.slice(2));"), 'router: login/registro siguen por authView');
t(app.includes('bindSavedAccounts();') && app.includes('pzSocialMount(pzParseProveedor());'), 'router: guardadas + social se montan igual');

// ---------- 6. Render real de authView (vm con stubs) ----------
const avSrc = av;
function render(mode, lang, strs) {
  const sandbox = {
    result: '',
    authStr: () => strs,
    authLang: () => lang,
    rememberPref: () => false,
  };
  vm.createContext(sandbox);
  vm.runInContext(avSrc + '\nresult = authView("' + mode + '");', sandbox);
  return sandbox.result;
}
const STR_ES = { loginH2: 'Bienvenido de vuelta', loginSub: 'Entrá para seguir automatizando.', regH2: 'Creá tu cuenta', regSub: 'Probalo gratis, sin tarjeta.', emailPh: 'tu@negocio.com', passLabel: 'Contraseña', passPh: 'Mínimo 6 caracteres', rememberLabel: 'Recordarme', navCreate: 'Crear cuenta', navLogin: 'Entrar', trialCta: 'Probar 3 días gratis', trialOr: 'o entrá con tu cuenta', btnLogin: 'Entrar', btnReg: 'Crear cuenta' };
const STR_EN = { loginH2: 'Welcome back', loginSub: 'Log in to keep automating.', regH2: 'Create your account', regSub: 'Try it free, no card needed.', emailPh: 'you@yourbusiness.com', passLabel: 'Password', passPh: 'At least 6 characters', rememberLabel: 'Save password on this device', navCreate: 'Create account', navLogin: 'Log in', trialCta: 'Try 3 days free', trialOr: 'or log in to your account', btnLogin: 'Log in', btnReg: 'Create account' };
const loginEs = render('login', 'es', STR_ES);
t(loginEs.includes('id="btnTrialLogin"'), 'render login ES: CTA presente');
t(loginEs.includes('href="/prueba"'), 'render login ES: href /prueba');
t(loginEs.includes('>Probar 3 días gratis</a>'), 'render login ES: texto exacto');
t(loginEs.includes('o entrá con tu cuenta'), 'render login ES: divisor exacto');
t(loginEs.indexOf('btnTrialLogin') < loginEs.indexOf('id="authFormFields"'), 'render login ES: CTA antes del formulario');
t(loginEs.includes('id="f_email"') && loginEs.includes('id="btnAuth"'), 'render login ES: formulario intacto debajo');
const loginEn = render('login', 'en', STR_EN);
t(loginEn.includes('href="/en/prueba"'), 'render login EN: href /en/prueba');
t(loginEn.includes('>Try 3 days free</a>'), 'render login EN: texto exacto');
t(loginEn.includes('or log in to your account'), 'render login EN: divisor exacto');
const regEs = render('registro', 'es', STR_ES);
t(!regEs.includes('btnTrialLogin'), 'render registro: SIN CTA (solo login)');
t(regEs.includes('id="f_email"') && regEs.includes('id="btnAuth"'), 'render registro: formulario intacto');

console.log(`lotepruebalogin: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
