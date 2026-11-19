/* LOTE TEXTO-IMPULSAR-APP — micro-lote de copy (decisión de Valentino
   18/11 21:36 + su extensión a la app 21:45: «cambialo también en la
   app»). La hoja REAL de impulso dentro de la app (la tarjeta de
   audiencia, pzAdsAudienciaHTML) confirmaba con «Sale así 🚀» /
   «Go with this 🚀»; pasa a decir «Impulsar este posteo con Ads» /
   «Boost this post with Ads» — la misma etiqueta que el micro-lote
   TEXTO-IMPULSAR pone en la vidriera, para que las dos superficies
   hablen un solo idioma. Pines sobre los archivos construidos:
   1. El botón de confirmación de la hoja (onclick pzAdsAudienciaSale)
      lleva la etiqueta nueva ES+EN (sin el cohete: la etiqueta es la
      misma que la del website, exacta), y la nota de la hoja que la
      cita la nombra con el texto nuevo en los dos idiomas.
   2. El toast del camino de la diferencia (pzAdsAudienciaCargar-
      Diferencia) que nombra el botón al terminar la carga cita la
      etiqueta nueva — es la tercera y última cadena de runtime del
      flujo que presentaba la etiqueta vieja; las cadenas viejas de
      runtime del flujo quedan en 0.
   3. El resto del flujo NO se toca: el botón propio de la diferencia
      («Cargar los $X que faltan» / «Top up the missing $X») conserva
      su etiqueta, la compuerta de la diferencia en pzAdsAudienciaSale
      sigue, y el camino que gasta (pzBoostConfirmar →
      /api/ads/billetera/impulsar) y el de la carga (/cargar) quedan
      intactos — el diff del lote son 3 líneas de app.js.
   4. Disciplina de alcance — las OTRAS superficies que dicen «Sale
      así» quedan intactas y declaradas: la escena de la landing en
      app.js (×2, es el micro-lote TEXTO-IMPULSAR del website), la
      escena de la mañana (mv-btn-p), el botón de subir-foto, el botón
      del ritual (pz-ritual-ok) y el de la tarjeta del chat — ninguno
      es la confirmación del impulso. Los comentarios del código que
      nombran el gesto («Sale así» ×40 restantes en app.js = 43 del
      HEAD de liberación − 3 de runtime de este flujo) son documentación histórica
      y no se reescriben. en/index.html no se toca (sus ×2 «Go with
      this» son la escena EN del website, del lote hermano).
      NOTA DE RE-BASE — APLICADA EN LA LIBERACIÓN (base 13c28206,
      PURGA-HANDLES): TEXTO-IMPULSAR (website) aterrizó antes, así que
      el liberador re-fijó los pines por orden de aterrizaje: el conteo
      total de «Sale así» en app.js es 40 (43 en HEAD − 3 de runtime de
      este flujo), la etiqueta nueva ES suma ×5 (×3 de este flujo + ×2
      de la escena de la landing ya aterrizada), el pin de la escena de
      la landing se dio vuelta (ya trae la etiqueta nueva) y el pin de
      en/index.html refleja la escena EN ya aterrizada («Go with this»
      = 0 · etiqueta nueva ×2). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PUB = path.join(__dirname, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function cuenta(s, x) { return s.split(x).length - 1; }
function rebanada(s, desde, hasta) {
  const a = s.indexOf(desde); const b = s.indexOf(hasta, a);
  return (a < 0 || b < 0) ? '' : s.slice(a, b);
}

const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const enIdx = fs.readFileSync(path.join(PUB, 'en/index.html'), 'utf8');

const hoja = rebanada(appjs, 'function pzAdsAudienciaHTML()', 'function pzAdsAudienciaPintar');
const cargaDif = rebanada(appjs, 'async function pzAdsAudienciaCargarDiferencia', 'function pzAdsAudienciaHTML()');
const sale = rebanada(appjs, 'async function pzAdsAudienciaSale', '// (LOTE ADS-CREACIÓN-2)');
const confirmar = rebanada(appjs, 'async function pzBoostConfirmar', 'function pzBoostMarcarImpulsado');
const difHTML = rebanada(appjs, 'function pzAdsAudienciaDiferenciaHTML()', '// Carga la diferencia exacta');

// 1 — la etiqueta nueva en el botón y en la nota de la hoja
t('hoja: la rebanada existe', hoja.length > 1000);
t('hoja: botón con onclick intacto y etiqueta nueva exacta ES+EN',
  hoja.includes('onclick="pzAdsAudienciaSale(this)"') &&
  hoja.includes("en ? 'Boost this post with Ads' : 'Impulsar este posteo con Ads'"));
t('hoja: nota ES cita la etiqueta nueva', hoja.includes('nada sale hasta que digas «Impulsar este posteo con Ads».'));
t('hoja: nota EN cita la etiqueta nueva', hoja.includes('nothing runs until you say “Boost this post with Ads”.'));
t('hoja: cadenas viejas de runtime = 0 en la hoja',
  !hoja.includes('Sale así 🚀') && !hoja.includes('Go with this 🚀') &&
  !hoja.includes('digas «Sale así»') && !hoja.includes('say “Go with this”'));
t('hoja: la tarjeta sigue armada igual (dinero + diferencia + error + grupos)',
  hoja.includes('${pzAdsAudienciaDineroHTML()}') && hoja.includes('${pzAdsAudienciaDiferenciaHTML()}') &&
  hoja.includes('<div id="pzAdsAudienciaError">') && hoja.includes('¿A quién le llega tu anuncio?') && hoja.includes('Who will see your ad?'));

// 2 — el toast de la diferencia nombra la etiqueta nueva
t('toast: ES cita la etiqueta nueva', cargaDif.includes('Tocá «Impulsar este posteo con Ads» y sale.'));
t('toast: EN cita la etiqueta nueva', cargaDif.includes('Tap “Boost this post with Ads” and it runs.'));
t('toast: citas viejas = 0 en todo app.js', !appjs.includes('Tocá «Sale así» y sale.') && !appjs.includes('Tap “Go with this” and it runs.'));

// conteos globales del flujo
t('app.js: etiqueta nueva ES ×5 (botón + nota + toast de este flujo + botón y nota de la landing ya aterrizada)', cuenta(appjs, 'Impulsar este posteo con Ads') === 5);
t('app.js: etiqueta nueva EN ×3 (botón + nota + toast)', cuenta(appjs, 'Boost this post with Ads') === 3);
t('app.js: «Go with this» = 0 (las 3 eran del flujo de impulso)', cuenta(appjs, 'Go with this') === 0);
t('app.js: «Sale así» = 40 (43 en HEAD tras TEXTO-IMPULSAR − 3 de runtime de este flujo)', cuenta(appjs, 'Sale así') === 40);

// 3 — el resto del flujo, intacto
t('diferencia: su botón propio conserva su etiqueta ES+EN',
  difHTML.includes('Cargar los ') && difHTML.includes('que faltan') && difHTML.includes('Top up the missing') &&
  difHTML.includes('onclick="pzAdsAudienciaCargarDiferencia(this)"'));
t('diferencia: la carga sigue por /api/ads/billetera/cargar', cargaDif.includes("api.post('/api/ads/billetera/cargar'"));
t('sale: la compuerta de la diferencia sigue (no gasta sin saldo)', sale.includes("motivo: 'diferencia_pendiente'") && sale.includes('pzAdsDiferencia()'));
t('sale: el camino que gasta sigue por pzBoostConfirmar', sale.includes('pzBoostConfirmar(btn)'));
t('confirmar: el gasto sigue por /api/ads/billetera/impulsar', confirmar.includes("api.post('/api/ads/billetera/impulsar', body)"));
t('hoja vieja de montos: sus botones no son esta confirmación y quedan',
  appjs.includes("gzT('RECOMENDADO · 7 DÍAS', 'RECOMMENDED · 7 DAYS')") && appjs.includes('pzBoostImpulsarMonto'));

// 4 — disciplina de alcance: las otras superficies «Sale así» intactas
t('landing en app.js: la escena ya trae la etiqueta nueva (TEXTO-IMPULSAR aterrizó antes)', appjs.includes('data-av-sale>Impulsar este posteo con Ads</button>'));
t('mañana: la escena conserva su botón', appjs.includes('<div class="mv-btn-p">Sale así</div>'));
t('ritual + subir-foto: sus botones «Sale así»/«Post it like this» intactos ×2', cuenta(appjs, "'Post it like this' : 'Sale así'") === 2);
t('chat: su botón «Sale así ✓» intacto', appjs.includes("'Post it ✓' : 'Sale así ✓'"));
t('en/index.html: sin tocar por este lote (la escena EN ya trae la etiqueta nueva ×2 de TEXTO-IMPULSAR, «Go with this» = 0)',
  cuenta(enIdx, 'Go with this') === 0 && cuenta(enIdx, 'Boost this post with Ads') === 2);

// 5 — VM: la hoja REAL se rinde con la etiqueta nueva (ES+EN) y la
// diferencia conserva la suya en el mismo rendido
try {
  const bloque = rebanada(appjs, 'const PZ_AUD_CHIP', 'function pzAdsAudienciaPintar');
  t('VM: bloque del flujo extraído', bloque.length > 5000);
  const mk = (lang) => {
    const ctx = {
      ME: { lang },
      esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      pzBoostState: {
        rielAds: 'billetera',
        billetera: { currency: 'USD', balance_cents: 3000 },
        selMonto: 50,
        boostError: null,
        audienciaProp: {
          geo: { ciudad: 'Austin' },
          objetivo_label: 'Ventas',
          opciones: { radios: [2, 5, 10], edades: [[18, 65], [25, 44]], generos: ['todos', 'mujeres', 'hombres'], alcances: ['cerca', 'ciudad', 'pais', 'todos'], objetivos: [] },
          audiencia: { genero: 'mujeres', edad_min: 25, edad_max: 44, alcance: 'cerca', radio_km: 5, parecidos: false },
        },
        audienciaSel: { genero: 'mujeres', edad_min: 25, edad_max: 44, alcance: 'cerca', radio_km: 5, parecidos: false },
      },
      pzBoostEsMP: () => false,
      pzBoostFmtMonto: (n) => String(n),
      pzBoostKey: () => 'k',
    };
    vm.createContext(ctx);
    vm.runInContext(bloque + '\nthis.__html = pzAdsAudienciaHTML();', ctx);
    return ctx.__html;
  };
  const hES = mk('es');
  const hEN = mk('en');
  t('VM ES: el botón rendido dice la etiqueta nueva', hES.includes('>Impulsar este posteo con Ads</button>'));
  t('VM EN: el botón rendido dice la etiqueta nueva', hEN.includes('>Boost this post with Ads</button>'));
  t('VM ES+EN: el rendido no muestra la etiqueta vieja', !hES.includes('Sale así') && !hEN.includes('Go with this'));
  t('VM ES: la diferencia rendida conserva su botón propio', hES.includes('Cargar los US$20 que faltan'));
  t('VM EN: la diferencia rendida conserva su botón propio', hEN.includes('Top up the missing US$20'));
} catch (e) {
  mal++; console.log('  MAL: VM explotó:', e && e.message);
}

console.log(`TEXTO-IMPULSAR-APP: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
