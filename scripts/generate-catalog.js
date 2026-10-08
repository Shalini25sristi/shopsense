#!/usr/bin/env node
/**
 * Deterministic catalogue generator.
 * Produces data/products.json with a realistic multi-category product set.
 *
 * Run: node scripts/generate-catalog.js
 */
const fs = require("fs");
const path = require("path");
const { merchantSearchUrl } = require("../src/store/merchantUrls");

/* ---------- deterministic RNG (mulberry32) ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = [
  {
    key: "running-shoes",
    category: "Running Shoes",
    path: ["Footwear", "Sports Shoes", "Running Shoes"],
    brands: ["Stride", "MoveOn", "AeroFit", "TrailBlaze", "PacePro", "ArchFit"],
    adjectives: ["Support", "Cushion", "Lightweight", "Trail", "Daily", "Performance", "Stability", "Speed"],
    nouns: ["Runner", "Trainer", "Sprint", "Dash", "Motion", "Glide", "Tempo", "Bolt"],
    suffixes: ["Pro", "Max", "Plus", "Lite", "X", "Elite"],
    tags: ["running", "shoes", "cushioned", "breathable", "road", "training", "sports", "flat feet", "long distance", "lightweight", "marathon", "gym"],
    price: [1499, 8999],
    rating: [3.9, 4.8],
    attrs: (r) => ({
      support: pick(r, ["high", "medium"]),
      terrain: pick(r, ["road", "trail", "track"]),
      arch: pick(r, ["neutral", "flat feet", "high arch"]),
      drop_mm: pick(r, [6, 8, 10, 12]),
      weight_grams: Math.round(230 + r() * 90),
    }),
    desc: (a) => `A ${a.support}-support running shoe built for ${a.terrain} runs with a ${a.drop_mm}mm drop, tuned for ${a.arch} arches.`,
  },
  {
    key: "sneakers",
    category: "Sneakers",
    path: ["Footwear", "Casual Shoes", "Sneakers"],
    brands: ["UrbanStep", "Campus", "NeoWalk", "Streetly", "Vibe", "DailyKicks"],
    adjectives: ["Classic", "Retro", "Street", "Everyday", "Canvas", "Court", "Chunky", "Minimal"],
    nouns: ["Sneaker", "Kick", "Low", "Court", "Canvas", "Runner", "Edge", "Move"],
    suffixes: ["Low", "Mid", "OG", "V2", "Classic", "Court"],
    tags: ["sneakers", "casual", "shoes", "street", "everyday", "fashion", "canvas", "comfort", "unisex"],
    price: [999, 5999],
    rating: [3.8, 4.7],
    attrs: (r) => ({
      material: pick(r, ["canvas", "leather", "mesh", "synthetic"]),
      sole: pick(r, ["rubber", "foam", "gum"]),
      closure: pick(r, ["lace-up", "slip-on"]),
      weight_grams: Math.round(260 + r() * 120),
    }),
    desc: (a) => `A ${a.material} sneaker with a ${a.sole} sole and ${a.closure} fit for everyday wear.`,
  },
  {
    key: "earbuds",
    category: "Wireless Earbuds",
    path: ["Electronics", "Audio", "Wireless Earbuds"],
    brands: ["SonicPods", "AudioArc", "BassLine", "ClearTone", "Pulse", "NovaSound"],
    adjectives: ["Noise Cancelling", "True Wireless", "Sport", "Studio", "Bass", "Compact", "Pro", "Everyday"],
    nouns: ["Buds", "Pods", "Beats", "Sound", "Air", "Tune", "Wave"],
    suffixes: ["Pro", "Air", "Plus", "2", "ANC", "Lite"],
    tags: ["earbuds", "wireless", "audio", "noise cancellation", "anc", "bluetooth", "battery life", "calls", "work from home", "gym", "sport", "bass"],
    price: [799, 14999],
    rating: [3.7, 4.8],
    attrs: (r) => ({
      battery_hours: Math.round(4 + r() * 10),
      anc: r() > 0.5,
      bluetooth: pick(r, ["5.2", "5.3"]),
      ipx: pick(r, ["IPX4", "IPX5", "IPX7"]),
      driver_mm: pick(r, [6, 10, 11, 12]),
    }),
    desc: (a) => `True wireless earbuds with ${a.battery_hours}h battery${a.anc ? ", active noise cancellation" : ""}, Bluetooth ${a.bluetooth} and ${a.ipx} water resistance.`,
  },
  {
    key: "headphones",
    category: "Over-Ear Headphones",
    path: ["Electronics", "Audio", "Over-Ear Headphones"],
    brands: ["AudioArc", "ClearTone", "NovaSound", "BassLine", "StudioOne", "Pulse"],
    adjectives: ["Noise Cancelling", "Studio", "Wireless", "Hi-Res", "Comfort", "Reference", "Gaming", "Premium"],
    nouns: ["Headphones", "Cans", "Monitor", "Sound", "Tune", "Wave"],
    suffixes: ["Pro", "Max", "Studio", "ANC", "X", "Plus"],
    tags: ["headphones", "over ear", "audio", "noise cancellation", "anc", "wireless", "studio", "gaming", "battery life", "comfort", "music"],
    price: [1299, 29999],
    rating: [3.9, 4.9],
    attrs: (r) => ({
      battery_hours: Math.round(20 + r() * 40),
      anc: r() > 0.4,
      wired: r() > 0.7,
      weight_grams: Math.round(180 + r() * 160),
      impedance_ohm: pick(r, [16, 32, 64]),
    }),
    desc: (a) => `Over-ear headphones with ${a.battery_hours}h battery${a.anc ? ", adaptive noise cancellation" : ""} and ${a.weight_grams}g comfort fit.`,
  },
  {
    key: "speakers",
    category: "Bluetooth Speakers",
    path: ["Electronics", "Audio", "Bluetooth Speakers"],
    brands: ["BoomBox", "AudioArc", "BassLine", "WaveTech", "Pulse", "NovaSound"],
    adjectives: ["Portable", "Party", "Waterproof", "Compact", "Bass", "Outdoor", "Smart", "Loud"],
    nouns: ["Speaker", "Boom", "Box", "Wave", "Beat", "Sound"],
    suffixes: ["Mini", "Max", "Go", "Plus", "2", "Pro"],
    tags: ["speaker", "bluetooth", "audio", "portable", "waterproof", "outdoor", "party", "bass", "battery life", "travel"],
    price: [999, 19999],
    rating: [3.8, 4.7],
    attrs: (r) => ({
      output_watts: pick(r, [5, 10, 20, 30, 50]),
      battery_hours: Math.round(6 + r() * 18),
      waterproof: r() > 0.4,
      weight_grams: Math.round(300 + r() * 1500),
    }),
    desc: (a) => `Portable ${a.output_watts}W speaker with ${a.battery_hours}h playback${a.waterproof ? " and waterproof body" : ""}.`,
  },
  {
    key: "smartphones",
    category: "Smartphones",
    path: ["Electronics", "Mobiles", "Smartphones"],
    brands: ["Nexus", "Pixelon", "ZenFone", "Orbit", "Vertex", "Lumen"],
    adjectives: ["5G", "Budget", "Flagship", "Gaming", "Camera", "Compact", "Premium", "Long Battery"],
    nouns: ["Phone", "Edge", "Ultra", "Pro", "Note", "Prime", "Neo"],
    suffixes: ["5G", "Pro", "Ultra", "Lite", "Max", "Plus"],
    tags: ["smartphone", "mobile", "5g", "camera", "battery life", "gaming", "budget", "premium", "android", "fast charging", "display"],
    price: [8999, 89999],
    rating: [3.8, 4.8],
    attrs: (r) => ({
      ram_gb: pick(r, [4, 6, 8, 12]),
      storage_gb: pick(r, [64, 128, 256, 512]),
      battery_mah: pick(r, [4500, 5000, 6000]),
      camera_mp: pick(r, [13, 48, 50, 108]),
      refresh_hz: pick(r, [60, 90, 120]),
      five_g: r() > 0.3,
    }),
    desc: (a) => `${a.ram_gb}GB/${a.storage_gb}GB smartphone with a ${a.camera_mp}MP camera, ${a.battery_mah}mAh battery and ${a.refresh_hz}Hz display${a.five_g ? " with 5G" : ""}.`,
  },
  {
    key: "laptops",
    category: "Laptops",
    path: ["Electronics", "Computers", "Laptops"],
    brands: ["Vertex", "Nexus", "Orbit", "AeroBook", "Zenith", "Lumen"],
    adjectives: ["Thin", "Gaming", "Business", "Student", "Creator", "Ultrabook", "Convertible", "Performance"],
    nouns: ["Book", "Laptop", "Air", "Pro", "Note", "Edge"],
    suffixes: ["14", "15", "Air", "Pro", "Plus", "X"],
    tags: ["laptop", "computer", "gaming", "student", "business", "thin", "lightweight", "ssd", "ram", "battery life", "work from home", "creator"],
    price: [24999, 149999],
    rating: [3.9, 4.8],
    attrs: (r) => ({
      ram_gb: pick(r, [8, 16, 32]),
      storage_gb: pick(r, [256, 512, 1024]),
      cpu: pick(r, ["Intel i5", "Intel i7", "AMD Ryzen 5", "AMD Ryzen 7", "Apple M-series"]),
      gpu: pick(r, ["integrated", "dedicated"]),
      screen_inch: pick(r, [13.3, 14, 15.6, 16]),
      weight_kg: Math.round((1.1 + r() * 1.4) * 10) / 10,
    }),
    desc: (a) => `${a.cpu} laptop with ${a.ram_gb}GB RAM, ${a.storage_gb}GB SSD, ${a.screen_inch}" display and ${a.gpu} graphics.`,
  },
  {
    key: "smartwatches",
    category: "Smartwatches",
    path: ["Electronics", "Wearables", "Smartwatches"],
    brands: ["Pulse", "Orbit", "FitBand", "NovaWear", "Chrono", "Vertex"],
    adjectives: ["Fitness", "AMOLED", "Rugged", "Sport", "Classic", "GPS", "Health", "Kids"],
    nouns: ["Watch", "Band", "Tracker", "Fit", "Pulse", "Chrono"],
    suffixes: ["Pro", "2", "Lite", "Sport", "Plus", "GPS"],
    tags: ["smartwatch", "fitness", "wearable", "gps", "health", "heart rate", "amoled", "battery life", "sport", "tracker", "calls"],
    price: [1499, 39999],
    rating: [3.7, 4.7],
    attrs: (r) => ({
      display: pick(r, ["AMOLED", "LCD", "Retina"]),
      battery_days: Math.round(2 + r() * 12),
      gps: r() > 0.4,
      heart_rate: true,
      waterproof: r() > 0.3,
    }),
    desc: (a) => `${a.display} smartwatch with ${a.battery_days}-day battery, heart-rate tracking${a.gps ? " and built-in GPS" : ""}.`,
  },
  {
    key: "face-wash",
    category: "Face Wash",
    path: ["Beauty", "Skincare", "Face Wash"],
    brands: ["GlowLab", "DermaPure", "ClearSkin", "Aqualis", "Botanica", "SkinTheory"],
    adjectives: ["Hydrating", "Gentle", "Foaming", "Brightening", "Oil Control", "Soothing", "Exfoliating", "Daily"],
    nouns: ["Cleanser", "Face Wash", "Wash", "Cleanse", "Refresh"],
    suffixes: ["100ml", "150ml", "200ml", "Refill"],
    tags: ["face wash", "cleanser", "skincare", "oily skin", "dry skin", "acne", "sensitive skin", "hydrating", "brightening", "daily", "gentle", "oil control"],
    price: [149, 899],
    rating: [3.8, 4.8],
    attrs: (r) => ({
      skin_type: pick(r, ["oily skin", "dry skin", "combination skin", "sensitive skin", "all skin types"]),
      key_ingredient: pick(r, ["salicylic acid", "niacinamide", "hyaluronic acid", "ceramides", "vitamin C", "aloe vera"]),
      fragrance_free: r() > 0.5,
      volume_ml: pick(r, [100, 150, 200]),
    }),
    desc: (a) => `A ${a.skin_type} face wash with ${a.key_ingredient}, ${a.fragrance_free ? "fragrance-free and " : ""}suitable for daily use.`,
  },
  {
    key: "sunscreen",
    category: "Sunscreen",
    path: ["Beauty", "Skincare", "Sunscreen"],
    brands: ["SunGuard", "DermaPure", "Aqualis", "GlowLab", "SkinTheory", "Botanica"],
    adjectives: ["Matte", "Hydrating", "Mineral", "Gel", "Invisible", "Lightweight", "Tinted", "Water-Resistant"],
    nouns: ["Sunscreen", "Sunblock", "SPF", "UV Fluid", "Sun Gel"],
    suffixes: ["SPF50", "SPF30", "50ml", "100ml", "PA+++"],
    tags: ["sunscreen", "spf", "sunblock", "skincare", "oily skin", "no white cast", "matte", "mineral", "daily", "uv protection", "sensitive skin", "gel"],
    price: [199, 1499],
    rating: [3.9, 4.9],
    attrs: (r) => ({
      spf: pick(r, [30, 50]),
      pa: pick(r, ["PA++", "PA+++", "PA++++"]),
      white_cast: r() > 0.6,
      mineral: r() > 0.7,
      volume_ml: pick(r, [50, 100]),
    }),
    desc: (a) => `Broad-spectrum SPF ${a.spf} ${a.pa} sunscreen${a.white_cast ? "" : " with no white cast"}, ideal for daily use.`,
  },
  {
    key: "moisturizer",
    category: "Moisturizer",
    path: ["Beauty", "Skincare", "Moisturizer"],
    brands: ["DermaPure", "GlowLab", "Aqualis", "CeramideCo", "SkinTheory", "Botanica"],
    adjectives: ["Hydrating", "Oil-Free", "Barrier Repair", "Night", "Soothing", "Lightweight", "Rich", "Gel"],
    nouns: ["Moisturizer", "Cream", "Lotion", "Gel", "Moisturiser"],
    suffixes: ["50ml", "100ml", "200ml", "Refill"],
    tags: ["moisturizer", "moisturiser", "cream", "skincare", "dry skin", "oily skin", "acne", "barrier repair", "hydrating", "night", "ceramides", "hyaluronic acid", "non comedogenic"],
    price: [199, 1999],
    rating: [3.9, 4.9],
    attrs: (r) => ({
      skin_type: pick(r, ["oily skin", "dry skin", "combination skin", "sensitive skin", "all skin types"]),
      key_ingredient: pick(r, ["ceramides", "hyaluronic acid", "niacinamide", "squalane", "glycerin"]),
      non_comedogenic: r() > 0.4,
      texture: pick(r, ["gel", "cream", "lotion"]),
      volume_ml: pick(r, [50, 100, 200]),
    }),
    desc: (a) => `A ${a.texture} moisturizer with ${a.key_ingredient} for ${a.skin_type}${a.non_comedogenic ? ", non-comedogenic" : ""}.`,
  },
  {
    key: "whey-protein",
    category: "Whey Protein",
    path: ["Health", "Supplements", "Whey Protein"],
    brands: ["PureFuel", "MaxGain", "ProBuild", "VitalWhey", "NutriCore", "IronMass"],
    adjectives: ["Isolate", "Concentrate", "Hydrolyzed", "Unflavoured", "Lean", "Mass", "Daily", "Recovery"],
    nouns: ["Whey", "Protein", "Isolate", "Gain", "Fuel", "Mass"],
    suffixes: ["1kg", "2kg", "5lb", "Chocolate", "Vanilla"],
    tags: ["whey protein", "protein", "supplement", "gym", "muscle", "recovery", "fitness", "chocolate", "vanilla", "unflavoured", "isolate", "mass gainer"],
    price: [1299, 9999],
    rating: [3.8, 4.8],
    attrs: (r) => ({
      protein_per_serving_g: pick(r, [20, 24, 27, 30]),
      type: pick(r, ["isolate", "concentrate", "blend", "hydrolyzed"]),
      flavour: pick(r, ["chocolate", "vanilla", "unflavoured", "cookies"]),
      servings: pick(r, [30, 60, 90]),
    }),
    desc: (a) => `${a.type} whey protein with ${a.protein_per_serving_g}g protein per serving in ${a.flavour} flavour.`,
  },
  {
    key: "hair-oils",
    category: "Hair Oils",
    path: ["Beauty", "Haircare", "Hair Oils"],
    brands: ["Soulflower", "Mamaearth", "Indulekha", "Parachute", "WOW Skin Science", "Bajaj Almond Drops"],
    adjectives: ["Rosemary", "Onion", "Argan", "Coconut", "Bhringraj", "Amla", "Anti-Hairfall", "Nourishing"],
    nouns: ["Hair Oil", "Oil", "Elixir", "Drops", "Hair Serum"],
    suffixes: ["200ml", "100ml", "250ml", "Combo"],
    tags: ["hair oil", "hair growth", "hairfall", "rosemary", "onion", "scalp", "argan", "coconut", "nourishing", "ayurvedic", "frizz", "dry scalp"],
    price: [149, 899],
    rating: [3.8, 4.8],
    attrs: (r) => ({
      concern: pick(r, ["hairfall", "hair growth", "dandruff", "dry scalp", "frizz"]),
      key_ingredient: pick(r, ["rosemary", "onion", "argan", "bhringraj", "coconut", "amla"]),
      volume_ml: pick(r, [100, 200, 250]),
      hair_type: pick(r, ["all hair types", "dry hair", "oily scalp"]),
    }),
    desc: (a) => `${a.key_ingredient} hair oil targeting ${a.concern}, suitable for ${a.hair_type}.`,
  },
  {
    key: "face-serum",
    category: "Face Serum",
    path: ["Beauty", "Skincare", "Face Serum"],
    brands: ["Minimalist", "The Ordinary", "Plum", "Dot & Key", "Deconstruct", "Foxtale"],
    adjectives: ["Niacinamide", "Vitamin C", "Hyaluronic", "Retinol", "Salicylic", "Brightening", "Hydrating", "Barrier"],
    nouns: ["Serum", "Booster", "Drops", "Concentrate", "Ampoule"],
    suffixes: ["30ml", "20ml", "10ml", "Refill"],
    tags: ["serum", "skincare", "niacinamide", "vitamin c", "hyaluronic acid", "retinol", "salicylic acid", "brightening", "acne", "oily skin", "anti aging", "hydrating"],
    price: [199, 1999],
    rating: [3.8, 4.9],
    attrs: (r) => ({
      skin_type: pick(r, ["oily skin", "dry skin", "combination skin", "sensitive skin", "all skin types"]),
      key_ingredient: pick(r, ["niacinamide", "vitamin C", "hyaluronic acid", "retinol", "salicylic acid"]),
      concentration: pick(r, ["5%", "10%", "15%", "20%"]),
      volume_ml: pick(r, [10, 20, 30]),
    }),
    desc: (a) => `${a.concentration} ${a.key_ingredient} serum for ${a.skin_type}.`,
  },
  {
    key: "body-lotion",
    category: "Body Lotion",
    path: ["Beauty", "Bath & Body", "Body Lotion"],
    brands: ["Nivea", "Vaseline", "Cetaphil", "Plum", "Mamaearth", "WOW Skin Science"],
    adjectives: ["Nourishing", "Deep Moisture", "SPF", "Aloe", "Shea", "Vitamin E", "Repairing", "Daily"],
    nouns: ["Body Lotion", "Lotion", "Body Milk", "Moisturizer", "Cream"],
    suffixes: ["200ml", "400ml", "250ml", "Refill"],
    tags: ["body lotion", "moisturizer", "dry skin", "nourishing", "spf", "shea butter", "vitamin e", "aloe vera", "daily", "body care"],
    price: [149, 899],
    rating: [3.8, 4.8],
    attrs: (r) => ({
      skin_type: pick(r, ["dry skin", "normal skin", "sensitive skin", "all skin types"]),
      key_ingredient: pick(r, ["shea butter", "vitamin E", "aloe vera", "glycerin", "ceramides"]),
      spf: r() > 0.6,
      volume_ml: pick(r, [200, 250, 400]),
    }),
    desc: (a) => `Nourishing body lotion with ${a.key_ingredient} for ${a.skin_type}${a.spf ? " with SPF" : ""}.`,
  },
];

function pick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

/* ---------- merchants & multi-store offers ---------- */
const MERCHANTS = [
  { name: "Amazon", slug: "amazon", domain: "amazon.in", coupon: null, delivery: 2 },
  { name: "Flipkart", slug: "flipkart", domain: "flipkart.com", coupon: "Extra 10% off with bank cards", delivery: 3 },
  { name: "Myntra", slug: "myntra", domain: "myntra.com", coupon: "Buy 2 get 10% off", delivery: 4 },
  { name: "Nykaa", slug: "nykaa", domain: "nykaa.com", coupon: "Flat 5% off on first order", delivery: 3 },
  { name: "Croma", slug: "croma", domain: "croma.com", coupon: null, delivery: 2 },
  { name: "Ajio", slug: "ajio", domain: "ajio.com", coupon: "Flat 15% off", delivery: 5 },
  { name: "Tata Cliq", slug: "tata-cliq", domain: "tatacliq.com", coupon: null, delivery: 4 },
  { name: "Meesho", slug: "meesho", domain: "meesho.com", coupon: null, delivery: 6 },
];

const MERCHANT_POOLS = {
  Beauty: ["nykaa", "amazon", "myntra", "flipkart", "ajio"],
  Footwear: ["myntra", "amazon", "flipkart", "ajio", "meesho"],
  Electronics: ["amazon", "flipkart", "croma", "tata-cliq"],
  Health: ["amazon", "nykaa", "flipkart", "meesho"],
  Grocery: ["amazon", "flipkart", "meesho"],
  Home: ["amazon", "flipkart", "croma", "meesho"],
};

function merchantsFor(product) {
  const vertical = (product.categoryPath && product.categoryPath[0]) || "Electronics";
  const slugs = MERCHANT_POOLS[vertical] || MERCHANT_POOLS.Electronics;
  return slugs.map((s) => MERCHANTS.find((m) => m.slug === s)).filter(Boolean);
}

/**
 * Attach a deterministic set of multi-store offers to each product.
 * The product's `price` is the lowest across stores; other offers are marked up.
 */
function attachOffers(products, seed = 999) {
  const r = mulberry32(seed);
  for (const p of products) {
    const pool = merchantsFor(p);
    const count = Math.max(2, Math.min(pool.length, 2 + Math.floor(r() * 4)));
    const chosen = pool
      .map((m) => ({ m, ord: r() }))
      .sort((a, b) => a.ord - b.ord)
      .slice(0, count)
      .map((x) => x.m);

    const base = p.price;
    const offers = chosen
      .map((m, idx) => {
        const price = idx === 0 ? base : Math.round(base * (1.02 + r() * 0.18));
        return {
          merchant: m.name,
          merchantSlug: m.slug,
          domain: m.domain,
          price,
          mrp: p.mrp,
          currency: "INR",
          coupon: m.coupon,
          inStock: r() > 0.08,
          deliveryDays: m.delivery,
          url: merchantSearchUrl(m.slug, [p.brand, p.title].filter(Boolean).join(" ")),
          productUrl: null, // populated by a real affiliate API when available
          checkedAt: new Date(Date.now() - Math.floor(r() * 6 * 3600 * 1000)).toISOString(),
        };
      })
      .sort((a, b) => a.price - b.price);

    offers[0].price = base; // guarantee lowest equals the canonical price
    p.offers = offers;
    p.price = offers[0].price;
    p.mrp = Math.max(p.mrp, offers[0].price);
    p.lowestMerchant = offers[0].merchantSlug;
  }
  return products;
}

function generateCatalog(seed = 20261005) {
  const r = mulberry32(seed);
  const products = [];
  let n = 1000;
  for (const c of CATEGORIES) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      // cycle through brands so every brand in a category is represented
      const brand = c.brands[i % c.brands.length];
      const adj = pick(r, c.adjectives);
      const noun = pick(r, c.nouns);
      const suf = pick(r, c.suffixes);
      const attrs = c.attrs(r);
      const price = Math.round((c.price[0] + r() * (c.price[1] - c.price[0])) / 10) * 10;
      const mrp = Math.round((price * (1.1 + r() * 0.6)) / 10) * 10;
      const rating = Math.round((c.rating[0] + r() * (c.rating[1] - c.rating[0])) * 10) / 10;
      const ratingCount = Math.round(50 + r() * 5000);
      const title = `${brand} ${adj} ${noun} ${suf}`;
      // shuffle a subset of tags for variety
      const tagPool = [...c.tags];
      const tags = [];
      const tagCount = 6 + Math.floor(r() * 4);
      for (let t = 0; t < tagCount && tagPool.length; t++) {
        tags.push(tagPool.splice(Math.floor(r() * tagPool.length), 1)[0]);
      }
      tags.push(c.category.toLowerCase());
      products.push({
        id: "p_" + n++,
        title,
        brand,
        category: c.category,
        categoryPath: c.path,
        price,
        mrp,
        currency: "INR",
        rating,
        ratingCount,
        description: c.desc(attrs),
        attributes: attrs,
        tags: Array.from(new Set(tags)),
        inStock: r() > 0.05,
      });
    }
  }
  return attachOffers(products, 999);
}

function main() {
  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const products = generateCatalog();
  const outFile = path.join(outDir, "products.json");
  fs.writeFileSync(outFile, JSON.stringify(products, null, 2));
  console.log(`Generated ${products.length} products -> ${outFile}`);
}

module.exports = { generateCatalog, attachOffers, CATEGORIES, MERCHANTS };

if (require.main === module) main();
