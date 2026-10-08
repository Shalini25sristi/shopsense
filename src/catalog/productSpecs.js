"use strict";
/**
 * Deterministic product-specification builder.
 *
 * The catalogue comes from public sources that only expose a handful of fields,
 * so we normalise what is available and derive the rest from the product's
 * category and a stable hash of its id. Values are stable across requests and
 * restarts (no database migration required) and are clearly presentation data.
 */
const { mulberry32 } = require("../utils/rng");

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function titleCase(s) {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

const ATTR_LABELS = {
  brand: "Brand",
  category: "Category",
  ingredients: "Ingredients",
  source: "Data Source",
  stock: "Stock",
  weight: "Item Weight",
  dimensions: "Dimensions",
  warranty: "Warranty",
  return_policy: "Return Policy",
  availability: "Availability",
  sku: "SKU",
  material: "Material",
  color: "Colour",
  size: "Size",
};

function formatAttr(key, value) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "weight") return `${value} g`;
  if (key === "dimensions") return `${value} cm`;
  if (key === "stock") return `${value} units`;
  return String(value);
}

/** Pick the top-level vertical, e.g. "Beauty", "Electronics", "Grocery". */
function verticalFor(product) {
  const path = product.categoryPath || [];
  return (path[0] || product.category || "").toLowerCase();
}

function findColour(product) {
  const haystack = `${product.title} ${(product.tags || []).join(" ")}`.toLowerCase();
  const colours = ["black", "white", "blue", "red", "green", "pink", "beige", "brown", "grey", "gray", "gold", "silver", "purple", "yellow", "orange", "maroon", "navy"];
  return colours.find((c) => haystack.includes(c)) || null;
}

/** Category/vertical-specific specification rows. */
function categorySpecs(product, rng) {
  const vertical = verticalFor(product);
  const category = (product.category || "").toLowerCase();
  const rows = [];

  if (vertical.includes("beauty")) {
    rows.push(
      ["Product Form", pick(rng, ["Cream", "Lotion", "Serum", "Oil", "Gel", "Spray", "Stick", "Liquid"])],
      ["Skin / Hair Type", pick(rng, ["All Types", "Dry", "Oily", "Combination", "Sensitive", "Normal"])],
      ["Concern", /sunscreen/.test(category) ? "Sun Protection" : /hair/.test(category) ? "Hair Care" : /lip/.test(category) ? "Makeup" : /perfume/.test(category) ? "Fragrance" : /serum|moisturi/.test(category) ? "Hydration & Glow" : "Daily Care"],
      ["Volume", pick(rng, ["30 ml", "50 ml", "75 ml", "100 ml", "150 ml", "200 ml"])],
      ["Fragrance", pick(rng, ["Floral", "Citrus", "Woody", "Musk", "Fresh", "Unscented"])],
      ["Shelf Life", pick(rng, ["18 months", "24 months", "36 months"])],
      ["Country of Origin", pick(rng, ["India", "France", "USA", "South Korea", "Germany", "United Kingdom"])],
      ["Gender", "Unisex"]
    );
    if (/sunscreen/.test(category)) rows.push(["SPF", pick(rng, ["SPF 30", "SPF 50", "SPF 50+", "SPF 15"])]);
  } else if (vertical.includes("electronic") || /phone|tablet|laptop|watch|accessor/.test(category)) {
    rows.push(
      ["Model", `${(product.brand || "ShopSense")} ${String(product.id).replace(/[^0-9a-z]/gi, "").slice(-6)}`.trim()],
      ["Connectivity", pick(rng, ["Bluetooth 5.3", "Wi-Fi 6", "4G / LTE", "5G", "USB-C", "Wi-Fi + Bluetooth"])],
      ["Battery", pick(rng, ["3000 mAh", "4000 mAh", "5000 mAh", "Up to 20 hours", "Li-ion, fast charging"])],
      ["Display", pick(rng, ['6.1" OLED', '6.5" AMOLED', '10.9" LCD', '13.3" Retina', "1.4\" Touch"])],
      ["Camera", pick(rng, ["12 MP + 12 MP", "48 MP Triple", "64 MP Quad", "8 MP Front"])],
      ["Operating System", pick(rng, ["Android 14", "iOS 17", "Windows 11", "Wear OS", "—"])],
      ["In the Box", "Device, Charger, User Manual, Warranty Card"],
      ["Country of Origin", pick(rng, ["China", "India", "Vietnam", "USA"])]
    );
  } else if (/shoe|dress|shirt|top|bag|jewellery|sunglass|watch/.test(category) || vertical.includes("fashion") || vertical.includes("footwear")) {
    rows.push(
      ["Material", pick(rng, ["Cotton", "Cotton Blend", "Polyester", "Leather", "Denim", "Silk", "Rayon", "Metal Alloy"])],
      ["Fit", pick(rng, ["Regular Fit", "Slim Fit", "Relaxed Fit", "Oversized"])],
      ["Pattern", pick(rng, ["Solid", "Printed", "Striped", "Checked", "Embroidered"])],
      ["Occasion", pick(rng, ["Casual", "Formal", "Party", "Sports", "Daily Wear"])],
      ["Care", pick(rng, ["Machine wash cold", "Hand wash only", "Dry clean only"])],
      ["Country of Origin", pick(rng, ["India", "Bangladesh", "Vietnam", "Italy"])]
    );
  } else if (vertical.includes("grocery")) {
    rows.push(
      ["Net Quantity", pick(rng, ["200 g", "500 g", "1 kg", "250 ml", "1 L"])],
      ["Diet Type", pick(rng, ["Vegetarian", "Vegan", "Vegetarian"])],
      ["Packaging", pick(rng, ["Pouch", "Bottle", "Box", "Jar"])],
      ["Shelf Life", pick(rng, ["6 months", "9 months", "12 months"])],
      ["Country of Origin", "India"]
    );
  } else if (vertical.includes("home")) {
    rows.push(
      ["Material", pick(rng, ["Plastic", "Stainless Steel", "Wood", "Glass", "Ceramic", "Metal", "Fabric"])],
      ["Assembly Required", pick(rng, ["No", "Yes"])],
      ["Care", "Wipe with a damp cloth"],
      ["Country of Origin", pick(rng, ["India", "China", "Germany"])]
    );
  } else {
    rows.push(
      ["Material", pick(rng, ["Premium blend", "Composite", "Metal", "Fabric"])],
      ["Country of Origin", pick(rng, ["India", "China"])]
    );
  }

  const colour = findColour(product);
  if (colour && !rows.some(([k]) => k === "Colour")) {
    rows.splice(Math.min(1, rows.length), 0, ["Colour", titleCase(colour)]);
  }
  return rows;
}

/**
 * Build specification groups for a product.
 * @returns {{ title: string, items: { label: string, value: string }[] }[]}
 */
function productSpecs(product) {
  if (!product) return [];
  const rng = mulberry32(hashSeed(product.id || product.title || "x"));

  const groups = [];

  const general = [];
  const attributes = product.attributes || {};
  for (const [key, value] of Object.entries(attributes)) {
    const formatted = formatAttr(key, value);
    if (formatted == null) continue;
    // Avoid duplicating brand/category which already appear in the header.
    if (key === "brand" || key === "category") continue;
    general.push({ label: ATTR_LABELS[key] || titleCase(key.replace(/_/g, " ")), value: formatted.length > 160 ? formatted.slice(0, 157) + "…" : formatted });
  }
  if (!attributes.brand && product.brand) general.unshift({ label: "Brand", value: product.brand });
  if (product.category) general.push({ label: "Category", value: product.category });
  if (general.length) groups.push({ title: "General", items: general });

  const specs = categorySpecs(product, rng).map(([label, value]) => ({ label, value }));
  if (specs.length) groups.push({ title: "Specifications", items: specs });

  return groups;
}

module.exports = { productSpecs, hashSeed };
