// oficina-fixture.js — CAFÉ AROMA, el negocio de prueba único del programa
// TestFlight. Fundamento completo cargado desde los documentos de flujo de
// cada poder (Venty: lista de precios, políticas, límites y objeciones;
// Atenty: políticas de cuidado y ficha del rubro; Desy: paleta). Una sola
// fuente: si un flujo difiere, manda este fundamento.
// NINGÚN cliente real se toca: esta cuenta es fixture del programa.
'use strict';

const FIXTURE_EMAIL = 'cafe.aroma@bambooty.test';
const NEGOCIO = 'Café Aroma';

// Capas del fundamento (doctrina FUNDAMENTO.md): negocio · identidad ·
// operación · dueño · historia (+ gerencia, la capa de dirección de Bossty).
// Cada hecho: { capa, clave, hecho, detalle, alcance: 'raiz'|'tallo', poder }
// alcance 'raiz' = compartido por toda la oficina; 'tallo' = de un poder.
const FUNDAMENTO = [
  // ——— El negocio ———
  { capa: 'negocio', clave: 'nombre', hecho: 'Café Aroma', detalle: 'Cafetería de especialidad en Palermo, CABA.', alcance: 'raiz' },
  { capa: 'negocio', clave: 'rubro', hecho: 'Rubro confirmado: gastronomía — cafetería de especialidad', detalle: 'Subrubro: café de especialidad con brunch. Confirmado, no adivinado.', alcance: 'raiz' },
  { capa: 'negocio', clave: 'instagram', hecho: '@cafearoma.palermo', detalle: 'Su vidriera principal; el brunch del fin de semana es su contenido fuerte.', alcance: 'raiz' },
  { capa: 'negocio', clave: 'zona', hecho: 'Palermo, CABA — radio de clientes de cercanía', detalle: 'La mayoría llega caminando o pide para llevar a oficinas de la zona.', alcance: 'raiz' },
  { capa: 'negocio', clave: 'estrella', hecho: 'Producto estrella: Brunch Aroma para dos — $24.000', detalle: 'El producto que sostiene la venta del fin de semana; ancla de las cotizaciones de Venty.', alcance: 'raiz' },
  { capa: 'negocio', clave: 'lista_precios', hecho: 'Lista de precios cargada y vigente (10 ítems)', detalle: 'Café con leche $4.800 · Cappuccino $5.200 · Flat white $5.500 · Medialuna $1.900 · Tostado de jamón y queso $7.500 · Brunch Aroma para dos $24.000 · Torta del día (porción) $6.800 · Limonada con menta y jengibre 1L $8.900 · Almuerzo del día (plato + bebida) $12.500 · Café en grano 250 g $15.000. Venty cotiza SOLO desde esta lista.', alcance: 'raiz' },
  { capa: 'negocio', clave: 'dias_fuertes', hecho: 'Días fuertes: sábado a la mañana (brunch) y mañanas de semana (para llevar a oficinas)', detalle: 'El pico de reclamos también es la mañana: desayuno para llevar.', alcance: 'raiz' },
  // ——— Su identidad ———
  { capa: 'identidad', clave: 'paleta', hecho: 'Paleta de la marca: Café #6F4A2F · Dorado #C9A24B · Crema #FAF3E7 · Verde bosque #2E4B3F', detalle: 'La paleta que Desy bloquea en cada pieza (deriva 0) y que Posty hereda del feed.', alcance: 'raiz' },
  { capa: 'identidad', clave: 'tono', hecho: 'Tono: cercano, rioplatense, sin humo y sin fórmulas de call center', detalle: '«Lamentamos los inconvenientes» está VETADO. Se habla como el equipo del café.', alcance: 'raiz' },
  { capa: 'identidad', clave: 'lexico', hecho: 'Léxico de la casa: medialuna, flat white, «para llevar», «de la casa»', detalle: 'Las palabras que el negocio usa con sus clientes, en todos los puestos.', alcance: 'raiz' },
  { capa: 'identidad', clave: 'protagonista', hecho: 'Protagonista: el mostrador y su equipo (no un dueño en cámara)', detalle: 'Las piezas muestran el café, las manos y el producto.', alcance: 'raiz' },
  // ——— Su operación ———
  { capa: 'operacion', clave: 'horarios', hecho: 'Horario: lunes a sábado 8–20 h · domingo 9–14 h', detalle: 'La cocina cierra 30 minutos antes.', alcance: 'raiz' },
  { capa: 'operacion', clave: 'politicas_comerciales', hecho: 'Reservas sin seña hasta 6 personas · grupos de 7+ con seña del 30% · cancelación sin cargo hasta 2 h antes', detalle: 'Las políticas que Venty aplica sin consultar.', alcance: 'raiz' },
  { capa: 'operacion', clave: 'politicas_cuidado', hecho: 'Pedido frío o incompleto → reposición sin cargo en el día o vale por el mismo pedido, a elección del cliente', detalle: 'Brunch con reserva: reprogramable sin costo hasta 2 h antes. Jamás prometido: «la próxima es gratis», descuentos no cargados, horarios de reposición no confirmados por cocina.', alcance: 'raiz' },
  { capa: 'operacion', clave: 'limites_dueno', hecho: 'Límites del dueño: descuento máximo 10% · grupos de más de 15 personas se escalan siempre a la Bandeja', detalle: 'Promesas prohibidas: catering fuera del local y exclusividad del salón. Fuera de estos límites, la propuesta va armada a la Bandeja.', alcance: 'raiz' },
  { capa: 'operacion', clave: 'objeciones', hecho: 'Banco de objeciones con respuesta aprobada (3)', detalle: '1) «Está caro» → anclar en el estrella (grano de especialidad, hecho al momento) y paso chico: probar con el flat white. 2) «¿Sin TACC?» → NO está en el fundamento: no se inventa; se confirma y se registra el hueco. 3) «Lo consulto» → seguimiento con dato concreto: la disponibilidad del brunch del fin de semana.', alcance: 'raiz', poder: 'venty' },
  { capa: 'operacion', clave: 'sistemas', hecho: 'Sistemas: Instagram conectado · pagos en el local · sin Tiendanube (declarado)', detalle: 'Sin stock conocido: ningún producto se inventa desde un sistema que no está.', alcance: 'raiz' },
  { capa: 'operacion', clave: 'ficha_rubro_atencion', hecho: 'Ficha del rubro (atención): tolerancia cero con faltantes · SLA interno: primera respuesta < 1 minuto', detalle: 'El pico de reclamos es la mañana (desayuno para llevar).', alcance: 'tallo', poder: 'atenty' },
  // ——— Su dueño ———
  { capa: 'dueño', clave: 'dueno', hecho: 'Dueño: Martín — decide rápido en la Bandeja, con la propuesta armada', detalle: 'No opera: acepta o pide un cambio. Sus límites están fijados una vez (capa operación).', alcance: 'raiz' },
  { capa: 'dueño', clave: 'prioridades', hecho: 'Prioridad declarada: que el brunch del sábado se llene sin bajar el precio', detalle: 'La estrella se defiende con valor, no con descuento (descuento máx. 10%).', alcance: 'raiz' },
  // ——— Su historia con Bambooty ———
  { capa: 'historia', clave: 'arranque', hecho: 'Fundamento cargado por el programa TestFlight (semana del 26/10 al 1/11)', detalle: 'Negocio de prueba único del programa; ningún cliente real se toca. La oficina corre sus flujos reales sobre este mundo.', alcance: 'raiz' },
  // ——— Gerencia (capa de dirección, la lee Bossty) ———
  { capa: 'gerencia', clave: 'objetivo_periodo', hecho: 'Objetivo del período de prueba: los 8 poderes corren su flujo central real sobre Café Aroma', detalle: 'Cada poder se marca ✅ solo con su flujo corrido en el build, con recibos. Lo que no exista, se declara.', alcance: 'raiz', poder: 'bossty' },
  { capa: 'gerencia', clave: 'linea_base', hecho: 'Línea de base: oficina recién creada — todo conteo nace de los registros de esta semana', detalle: 'Sin historia previa: la línea de base se construye con la primera semana dirigida.', alcance: 'raiz', poder: 'bossty' },
];

// Qué poderes leyeron su fundamento al cargar (su lista de lectura quedó
// cubierta por el fixture). Talenty NO: su compartimento sellado se carga
// con su propio módulo y jamás en la capa compartida.
const LECTORES_INICIALES = ['posty', 'gesty', 'venty', 'atenty', 'desy', 'bossty'];

// Perfil para las tablas clásicas (profiles/settings/business_dna) — lo que
// el motor de Posty ya sabe leer el martes cuando genere la semana.
const PERFIL = {
  business_name: 'Café Aroma',
  category: 'gastronomia',
  tone: 'cercano',
  ig_username: 'cafearoma.palermo',
  description: 'Café Aroma es una cafetería de especialidad en Palermo (CABA). Su estrella es el Brunch Aroma para dos ($24.000): café de especialidad, medialunas de la casa y torta del día. A la mañana fuerte el para llevar a las oficinas de la zona (medialunas + café); el sábado a la mañana se llena el brunch. Tono cercano y rioplatense, sin humo. Paleta: café #6F4A2F, dorado #C9A24B, crema #FAF3E7, verde bosque #2E4B3F. Lista vigente: café con leche $4.800, cappuccino $5.200, flat white $5.500, medialuna $1.900, tostado de jamón y queso $7.500, brunch para dos $24.000, torta del día $6.800, limonada 1L $8.900, almuerzo del día $12.500, café en grano 250 g $15.000.',
  brand_colors: '#6F4A2F,#C9A24B,#FAF3E7,#2E4B3F',
};

module.exports = { FIXTURE_EMAIL, NEGOCIO, FUNDAMENTO, LECTORES_INICIALES, PERFIL };
