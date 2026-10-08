#!/usr/bin/env node
/**
 * Build a REAL product catalogue from free, no-key public APIs:
 *   - DummyJSON          -> general products (electronics, fashion, grocery, ...)
 *   - Open Beauty Facts  -> beauty & personal care (hair oils, shampoos, skincare, ...)
 *
 * Both sources provide real product images. Results are normalised into the
 * ShopSense schema and written to data/products.json.
 *
 * Run: node scripts/fetch-catalog.js
 * Falls back to the synthetic generator if the network is unavailable (seed.js).
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { attachOffers } = require("./generate-catalog");

const UA = "shopsense-demo/1.0 (educational project)";

const DUMMY_SELECT = [
  "id", "title", "description", "category", "price", "discountPercentage",
  "rating", "stock", "tags", "brand", "thumbnail", "images",
  "weight", "dimensions", "warrantyInformation", "returnPolicy",
  "availabilityStatus", "sku",
].join(",");

const VERTICAL = {
  beauty: "Beauty", "skin-care": "Beauty", fragrances: "Beauty",
  "mens-shoes": "Footwear", "womens-shoes": "Footwear",
  laptops: "Electronics", smartphones: "Electronics", tablets: "Electronics",
  "mobile-accessories": "Electronics", "mens-watches": "Electronics", "womens-watches": "Electronics",
  groceries: "Grocery", "kitchen-accessories": "Home", furniture: "Home", "home-decoration": "Home",
};

/** Open Beauty Facts categories to pull (real beauty products + images). */
const BEAUTY_CATEGORIES = [
  { tag: "hair-oils", category: "Hair Oils", tags: ["hair", "oil", "hair oil", "haircare"], limit: 60 },
  { tag: "shampoos", category: "Shampoo", tags: ["shampoo", "hair", "haircare"], limit: 40 },
  { tag: "conditioners", category: "Conditioner", tags: ["conditioner", "hair", "haircare"], limit: 30 },
  { tag: "hair-masks", category: "Hair Mask", tags: ["hair mask", "hair", "haircare"], limit: 25 },
  { tag: "face-creams", category: "Face Cream", tags: ["face", "cream", "skincare"], limit: 40 },
  { tag: "moisturizers", category: "Moisturizer", tags: ["moisturizer", "skincare"], limit: 40 },
  { tag: "sunscreens", category: "Sunscreen", tags: ["sunscreen", "spf", "skincare"], limit: 25 },
  { tag: "body-lotions", category: "Body Lotion", tags: ["body", "lotion", "skincare"], limit: 35 },
  { tag: "serums", category: "Face Serum", tags: ["serum", "skincare"], limit: 30 },
  { tag: "face-washes", category: "Face Wash", tags: ["face", "wash", "cleanser", "skincare"], limit: 25 },
  { tag: "lipsticks", category: "Lipstick", tags: ["lipstick", "makeup"], limit: 25 },
  { tag: "perfumes", category: "Perfume", tags: ["perfume", "fragrance"], limit: 25 },
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, Accept: "application/json" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
}

const prettify = (s) => String(s).split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const hashNum = (str, min, max) => {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  return min + (h % (max - min + 1));
};

/* ---------------- DummyJSON ---------------- */
function normaliseDummy(p) {
  const category = prettify(p.category);
  const vertical = VERTICAL[p.category] || "Electronics";
  const price = Math.max(1, Math.round(p.price * 80));
  const mrp = p.discountPercentage > 0
    ? Math.round((p.price / (1 - p.discountPercentage / 100)) * 80)
    : Math.round(price * 1.2);
  const brand = p.brand || p.title.split(" ")[0] || "Generic";
  return {
    id: "p_" + p.id,
    title: p.title,
    brand,
    category,
    categoryPath: [vertical, category],
    price,
    mrp: Math.max(mrp, price + 1),
    currency: "INR",
    rating: p.rating,
    ratingCount: 50 + ((p.id * 7919) % 5000),
    description: p.description,
    attributes: {
      stock: p.stock,
      weight: p.weight,
      dimensions: p.dimensions ? `${p.dimensions.width} x ${p.dimensions.height} x ${p.dimensions.depth}` : undefined,
      warranty: p.warrantyInformation,
      return_policy: p.returnPolicy,
      availability: p.availabilityStatus,
      sku: p.sku,
    },
    tags: Array.from(new Set([...(p.tags || []), category.toLowerCase()])),
    image: p.thumbnail,
    images: p.images || [],
    inStock: (p.stock || 0) > 0,
    source: "DummyJSON",
  };
}

async function fetchDummyJSON() {
  const data = await fetchJSON(`https://dummyjson.com/products?limit=0&select=${DUMMY_SELECT}`);
  if (!data.products || !data.products.length) throw new Error("empty DummyJSON response");
  return data.products.map(normaliseDummy);
}

/* ---------------- Open Beauty Facts ---------------- */
function normaliseBeauty(p, def) {
  const title = (p.product_name || "").trim();
  if (!title || !p.image_url) return null;
  const brand = (p.brands || "Generic").split(",")[0].trim() || "Generic";
  const price = Math.round(hashNum(p.code, 149, 1499) / 10) * 10;
  const rating = Math.round((3.7 + hashNum(p.code + "r", 0, 11) / 10) * 10) / 10;
  const ingredients = (p.ingredients_text || "").replace(/\s+/g, " ").slice(0, 220);
  const catTokens = (p.categories || "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return {
    id: "obf_" + p.code,
    title,
    brand,
    category: def.category,
    categoryPath: ["Beauty", def.category],
    price,
    mrp: Math.round(price * 1.3),
    currency: "INR",
    rating,
    ratingCount: 40 + hashNum(p.code + "c", 0, 4000),
    description: ingredients ? `${def.category} by ${brand}. Ingredients: ${ingredients}` : `${def.category} by ${brand}.`,
    attributes: {
      brand,
      category: def.category,
      ingredients: ingredients.slice(0, 120) || "see pack",
      source: "Open Beauty Facts",
    },
    tags: Array.from(new Set([...def.tags, ...catTokens, def.category.toLowerCase()])),
    image: p.image_url,
    images: [p.image_url],
    inStock: true,
    source: "OpenBeautyFacts",
  };
}

async function fetchOpenBeautyFacts() {
  const fields = "code,product_name,brands,image_url,categories,ingredients_text";
  const out = [];
  for (const def of BEAUTY_CATEGORIES) {
    try {
      const url = `https://world.openbeautyfacts.org/api/v2/search?categories_tags=en:${def.tag}&fields=${fields}&page_size=${def.limit}`;
      const data = await fetchJSON(url);
      for (const p of data.products || []) {
        const n = normaliseBeauty(p, def);
        if (n) out.push(n);
      }
    } catch (e) {
      console.warn(`  ! beauty category "${def.tag}" failed: ${e.message}`);
    }
  }
  return out;
}

/* ---------------- main ---------------- */
async function main() {
  const [dummy, beauty] = await Promise.all([
    fetchDummyJSON(),
    fetchOpenBeautyFacts().catch((e) => {
      console.warn(`! Open Beauty Facts unavailable (${e.message})`);
      return [];
    }),
  ]);
  const products = [...dummy, ...beauty];
  attachOffers(products, 999);
  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "products.json"), JSON.stringify(products, null, 2));
  console.log(`Fetched ${products.length} real products (${dummy.length} general + ${beauty.length} beauty) -> data/products.json`);
  return products;
}

module.exports = { main };

if (require.main === module) {
  main().catch((e) => {
    console.error("fetch-catalog failed:", e.message);
    process.exit(1);
  });
}
