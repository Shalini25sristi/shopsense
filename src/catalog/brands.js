"use strict";
/**
 * Well-known brands used to surface a curated "Top brands" shelf on the home
 * page. Matching is accent/punctuation-insensitive so "L'Oréal Paris" matches
 * "L'Oreal", "levis" matches "Levi's", etc.
 */

const FEATURED_BRANDS = [
  // Tech
  "Apple", "Samsung", "Oppo", "Vivo", "Realme", "Xiaomi", "OnePlus", "Sony", "Bose", "JBL",
  "Sennheiser", "Dell", "HP", "Lenovo", "Asus", "Acer", "Logitech", "boAt", "Noise",
  // Watches
  "Rolex", "Rado", "Fossil", "Titan", "Fastrack", "Casio", "Daniel Wellington", "Michael Kors",
  // Fashion / footwear / bags
  "Nike", "Adidas", "Puma", "Reebok", "New Balance", "Asics", "Skechers", "Fila", "Woodland",
  "Bata", "Levi's", "Calvin Klein", "Tommy Hilfiger", "H&M", "Zara", "Allen Solly",
  "Van Heusen", "Peter England", "Louis Philippe", "U.S. Polo Assn.", "Jack & Jones",
  "Hidesign", "Lavie", "Caprese", "Baggit", "Ray-Ban", "Oakley",
  // Beauty & personal care
  "L'Oréal", "L'Oréal Paris", "Nivea", "Garnier", "Vaseline", "Johnson's", "Maybelline",
  "Max Factor", "Lakmé", "Mamaearth", "CeraVe", "Neutrogena", "Dove", "Ponds", "Armaf",
  "The Ordinary", "Plum", "WOW", "Biotique", "Himalaya",
  // Home
  "Philips", "LG", "Whirlpool", "Panasonic", "Prestige", "Pigeon", "Milton", "Cello",
  "Borosil", "Hawkins", "Dyson",
];

function normBrand(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const FEATURED_SET = new Set(FEATURED_BRANDS.map(normBrand));

/** True when a brand is a recognised, well-known brand. */
function isFeaturedBrand(brand) {
  const b = normBrand(brand);
  if (!b) return false;
  if (FEATURED_SET.has(b)) return true;
  // Allow "Apple India" / "Levi's Jeans" style variants for longer names.
  for (const known of FEATURED_SET) {
    if (known.length >= 5 && b.startsWith(known)) return true;
  }
  return false;
}

module.exports = { FEATURED_BRANDS, isFeaturedBrand, normBrand };
