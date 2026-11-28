// test-lote-juli-v1399.js — CTA-VOSEO (Juli, 2026-11-28)
// La lista de señales de CTA de captionPasses solo conocía 8 formas y no
// veía los imperativos rioplatenses naturales: los ids reales 812
// («encargá el tuyo», Malvón), 820 («Probalo en Cadore») y 824 («Pasá a
// buscar la tuya», Atelier Fuerza) nacieron CON CTA el 28/11 y la puerta
// viva v1398 los rechazaba por «le falta un llamado a la acción» (15/15
// de la tanda ES rechazados; los otros 12 cierran en descripción o
// invitación y deben SEGUIR rechazados). Fix: CTA_SIGNALS suma encargá/
// probalo/pasá a/vení/sumate/escribime/llamanos/visitanos/pedila, con
// guardas ('encarga ' con espacio ≠ «la encargada»; sin 'proba' pelado
// ≠ «probablemente»), y repairCaptionLength mide el CTA sobre el texto
// normalizado, igual que la puerta.
const { captionPasses, repairCaptionLength } = require('./generator.js');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('ok -', name); }
  else { fail++; console.log('FAIL -', name); }
}
const c812 = 'Llegó el pan dulce de Malvón. El de siempre: masa suave, mucho chocolate y ese perfume que anuncia diciembre antes que el calendario. La preventa ya está abierta: encargá el tuyo y asegurate el de tu mesa.';
const c820 = 'Dulce Affogato: dulce de leche, biscotti con almendras y café. Una pasión argentina y una italiana se encuentran en el mismo cucurucho. Probalo en Cadore.';
const c824 = 'Volvió ella. La medialuna rellena de vitel toné, la más buscada todo el año. Hojaldre de manteca, relleno generoso y ese contraste que la hizo famosa. Pasá a buscar la tuya antes de que vuele.';
const c815 = 'La milanesa del Prefe: dorada, con su ensalada, su pan y su copa de vino. Un clásico de bodegón servido en la esquina rosa de Palermo, como se hizo siempre.';
check('812 real (encargá) pasa la puerta', captionPasses(c812, { business: 'Malvón' }).ok === true);
check('820 real (probalo) pasa la puerta', captionPasses(c820, { business: 'Cadore' }).ok === true);
check('824 real (pasá a buscar) pasa la puerta', captionPasses(c824, { business: 'Atelier Fuerza' }).ok === true);
check('815 real (cierra en descripción, sin CTA) sigue rechazado', captionPasses(c815, { business: 'El Preferido' }).ok === false);
check('«te esperamos» solo sigue sin ser CTA', captionPasses('El mostrador no para: entran y salen pizzas todo el día, como desde 1932. Nuestros maestros pizzeros y el horno siempre encendido. Te esperamos en Corrientes 1368.', { business: 'Güerrín' }).ok === false);
check('«la encargada del local» no es CTA (guarda de espacio)', captionPasses('La encargada del local arma cada pedido a mano, con la receta de siempre y los ingredientes del día, bien frescos.', { business: 'X' }).ok === false);
check('«probablemente» no es CTA (sin proba pelado)', captionPasses('Probablemente el mejor café del barrio: granos de origen, tostado de la semana y la medialuna que sale calentita.', { business: 'X' }).ok === false);
check('reservá (voseo acentuado) sigue pasando por normalización', captionPasses('La torta de pera salió del horno, dorada y húmeda, con la fruta bien presente. Reservá la tuya para el sábado.', { business: 'X' }).ok === true);
check('vení a / sumate / escribime cuentan como CTA', captionPasses('Este sábado abrimos el patio nuevo con música y la carta de siempre. Vení a conocerlo con quien quieras.', { business: 'X' }).ok === true && captionPasses('Ya somos mil en esta cuenta y lo festejamos con la torta de la casa. Sumate a la lista y enterate primero.', { business: 'X' }).ok === true && captionPasses('El menú del finde ya está listo: dos platos nuevos y el postre de siempre. Escribime y te paso la carta completa.', { business: 'X' }).ok === true);
check('sin CTA de ningún tipo sigue rechazado', captionPasses('Las medialunas de siempre. Manteca de verdad, hojaldre paciente y ese brillo que se reconoce de lejos. Salen todas las mañanas.', { business: 'X' }).ok === false);
// repairCaptionLength: la única oración con CTA en voseo no se corta
const largo = 'El pan dulce llegó con todo este año: masa suave, mucho chocolate y el perfume de siempre en cada porción generosa. ' + 'La receta viene de la casa de antes, con los ingredientes de siempre y el horno prendido desde temprano cada mañana. '.repeat(2) + 'Encargá el tuyo para la mesa de las fiestas.';
const rep = repairCaptionLength(largo);
check('repairCaptionLength conserva la oración con CTA en voseo', /Encargá el tuyo/.test(rep));
console.log(`${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
