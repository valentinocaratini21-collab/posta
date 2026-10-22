# EVENT-DICTIONARY.md — Diccionario de eventos de Posty (v322)

Registro único que gobierna el tracking (mandato de Valentino, 2026-10-22:
"trackear todo para ir perfeccionando" — con gobierno: **se guarda todo crudo,
se muestra poco; cada evento nuevo entra solo con nombre, dueño y el número
que alimenta**).

Reglas:
1. Todo evento nuevo se anota acá ANTES de emitirse: nombre (`snake_case`,
   2–40 caracteres, lo valida `/api/track`), dueño y número que alimenta.
2. Un evento que no alimenta ningún número queda marcado **legado**: se sigue
   guardando (la historia no se borra), pero no entra a ninguna vista nueva.
3. La lista espejo en código vive en `launch-analytics.js` (`EVENT_DICTIONARY`);
   el admin marca solo, en la vista Negocio, los eventos presentes en la base
   que no están registrados acá.
4. Todo evento del funnel lleva `src` (canal: `email` · `dm` · `referido` ·
   `clinica` · `organico` · `directo` · `otro`) e idioma (`lang`). La captura
   nace en `/prueba` (`?src=`), persiste en el navegador y se hereda al
   registro y al pago; los eventos viejos quedan con `src` nulo (era de prueba).

| Evento | Dueño | Número que alimenta |
|---|---|---|
| `prueba_view` | funnel | Tablero: visitas a la prueba (portada y funnel) |
| `prueba_complete` | funnel | Tablero: conversión del formulario de prueba |
| `prueba_register` | funnel | Tablero: registros desde la prueba |
| `ig_connect` | producto | Tablero: activación (IG conectado) |
| `week_generate_start` | generación | Salud del sistema: tasa de generación |
| `week_generate_done` | generación | Tablero: semanas generadas · alerta de semana atrasada |
| `post_publish` | publicación | Tablero: time-to-value |
| `post_failed` | publicación | Alertas: publicación fallida · termómetro (causa culpa nuestra) |
| `payment_ok` | billing | Tablero: pagos · alertas · rumbo a los 200 |
| `payment_failed` | billing | Alertas: pago fallido · termómetro (causa comercial) |
| `account_created` | auth | Funnel legacy: registro |
| `ref_click` | growth | Referidos: clicks por código |
| `schedule_all` | producto | Funnel legacy: semana aceptada completa |

## Época de lanzamiento

Desde el 1/1/2027 00:00 ART (configurable: `POSTY_LAUNCH_EPOCH_ISO`) toda
lectura de medición filtra "desde la época" por defecto; la era de prueba se
consulta con el toggle `era=all`. **Excepción dura: el ledger de costos de IA
(`api_costs`) nunca se filtra por época** — el dinero gastado se lee completo
desde el día uno. Los datos de producto jamás se tocan.
