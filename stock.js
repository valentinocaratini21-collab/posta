'use strict';
// Biblioteca de fotos reales curadas (Pexels, licencia de uso comercial libre).
// Jerarquía de fotos de Posty: 1) la foto propia del cliente, 2) la imagen IA,
// 3) el stock curado — SOLO como complemento, nunca como fuente principal:
// fondos de historias sin foto y salvavidas cuando la imagen IA falla tras
// todos los reintentos (una foto real del rubro, jamás un bloque de color).
// Catálogo: stock/catalog.json → { rubro: [{ file, alt, page_url, license }] }.
const fs = require('fs');
const path = require('path');

const STOCK_DIR = path.join(__dirname, 'stock');
let CATALOG = null;
function catalog() {
  if (CATALOG) return CATALOG;
  try { CATALOG = JSON.parse(fs.readFileSync(path.join(STOCK_DIR, 'catalog.json'), 'utf8')); }
  catch (e) { CATALOG = {}; }
  return CATALOG;
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const ALIASES = {
  restaurante: 'gastronomia', restaurant: 'gastronomia', comida: 'gastronomia', cocina: 'gastronomia',
  cafe: 'cafeteria', 'cafe de especialidad': 'cafeteria',
  peluqueria: 'belleza', salon: 'belleza', 'salon de belleza': 'belleza', unas: 'belleza',
  manicura: 'belleza', estetica: 'belleza', spa: 'belleza', maquillaje: 'belleza',
  gimnasio: 'fitness', gym: 'fitness', entrenamiento: 'fitness', crossfit: 'fitness', yoga: 'fitness', pilates: 'fitness',
  'tienda de mascotas': 'mascotas', 'pet shop': 'mascotas', veterinaria: 'mascotas', mascota: 'mascotas',
  ropa: 'moda', indumentaria: 'moda', calzado: 'moda', zapatos: 'moda',
  pizza: 'pizzeria', helados: 'heladeria',
  pasteleria: 'panaderia', panificado: 'panaderia',
  flores: 'floreria', decoracion: 'deco', hogar: 'deco', muebles: 'deco', interiorismo: 'deco',
  barbero: 'barberia',
};

function stockRubroFor(category) {
  const cat = catalog();
  const n = norm(category);
  if (!n) return null;
  if (cat[n] && cat[n].length) return n;
  if (ALIASES[n] && cat[ALIASES[n]]) return ALIASES[n];
  for (const k of Object.keys(cat)) { if (k && (n.includes(k) || k.includes(n))) return k; }
  for (const [a, t] of Object.entries(ALIASES)) { if (n.includes(a) && cat[t]) return t; }
  return null;
}

function hashSeed(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h * 31) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// pickStockPhoto(category, seed) → ruta absoluta de una foto del rubro, o
// null si el rubro no tiene biblioteca. Determinístico por seed (uid +
// semana + tema) para que el mismo cliente no vea siempre la misma foto.
function pickStockPhoto(category, seed) {
  const rubro = stockRubroFor(category);
  if (!rubro) return null;
  const items = catalog()[rubro] || [];
  if (!items.length) return null;
  const it = items[hashSeed(seed || rubro) % items.length];
  const abs = path.join(STOCK_DIR, it.file);
  return fs.existsSync(abs) ? abs : null;
}

module.exports = { pickStockPhoto, stockRubroFor, STOCK_DIR };
