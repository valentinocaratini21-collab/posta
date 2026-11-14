'use strict';

// (LOTE L11 · CANDADO-INVITADO) Mutex por clave, en proceso, para
// /api/guest/start: el chequeo «ya tiene posteos / ya entró» y la
// importación de la semana tienen que ser atómicos para el mismo
// negocio. Sin esto, dos llamadas concurrentes para el mismo @ pueden
// pasar AMBAS el chequeo de «0 posteos» antes de que ninguna importe, y
// la semana se importa dos veces (el 4º posteo fantasma del diagnóstico
// de Veja, Q3/Q5). Con el candado, la segunda llamada ESPERA a que la
// primera termine su sección crítica (chequeo + import + entrega) y
// recién ahí corre sus chequeos contra el estado final: ve al invitado
// con sus posteos y sale por las guardas de siempre (409 / reuso), sin
// re-importar.
//
// Diseño:
// - Cadena de promesas por clave: cada acquire se encadena detrás del
//   anterior de la MISMA clave. Claves distintas no se frenan entre sí.
// - La espera tiene TOPE (waitMs): si el dueño del candado no libera a
//   tiempo (fallo patológico), el que espera sigue SIN el candado y se
//   anota en el log — una llamada legítima nunca queda colgada para
//   siempre. En el flujo normal el dueño libera en un finally, así que
//   un fallo a mitad de la sección también libera.
// - release() es idempotente y limpia la clave cuando la cadena queda
//   vacía (el Map no crece sin límite).

const tails = new Map(); // clave -> promesa cola de la cadena

function acquire(key, waitMs) {
  const k = String(key || '');
  const prev = tails.get(k) || Promise.resolve();
  let releaseInner = null;
  const held = new Promise((resolve) => { releaseInner = resolve; });
  const tail = prev.then(() => held);
  tails.set(k, tail);

  let released = false;
  function release() {
    if (released) return;
    released = true;
    releaseInner();
    // Limpieza diferida: si nadie se encadenó detrás, la clave sale del Map.
    Promise.resolve().then(() => {
      if (tails.get(k) === tail) tails.delete(k);
    });
  }

  const tope = Number(waitMs) > 0 ? Number(waitMs) : 30000;
  return Promise.race([
    prev.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), tope)),
  ]).then((got) => {
    if (!got) {
      console.error('[guest-start-lock] espera vencida (' + tope + 'ms) para ' + k + ' — sigue sin el candado');
      // Su release solo destraba la cadena; no toca la clave (ya no es suya).
      return function releaseTrasTope() {
        if (released) return;
        released = true;
        releaseInner();
      };
    }
    return release;
  });
}

module.exports = { acquire, _tails: tails };
