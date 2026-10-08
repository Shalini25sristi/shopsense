#!/usr/bin/env node
/**
 * Deterministic interaction + user generator.
 * Produces data/users.json and data/interactions.json so the recommender has
 * realistic implicit-feedback signal (views, clicks, carts, wishlist, purchases).
 *
 * Run: node scripts/generate-interactions.js
 */
const fs = require("fs");
const path = require("path");
const { generateCatalog } = require("./generate-catalog");

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

const NAMES = [
  "Aarav", "Diya", "Vivaan", "Ananya", "Aditya", "Ishita", "Kabir", "Saanvi",
  "Arjun", "Myra", "Reyansh", "Aadhya", "Krishna", "Anika", "Ishaan", "Navya",
  "Rohan", "Pari", "Karan", "Riya", "Dev", "Kiara", "Ayaan", "Avni",
  "Vihaan", "Sara", "Om", "Meera", "Yash", "Tara", "Neel", "Zara",
  "Aryan", "Naina", "Rudra", "Aisha", "Shaurya", "Kavya", "Atharv", "Nitya",
];

const EVENT_WEIGHTS = { view: 1, click: 2, wishlist: 3, cart: 4, purchase: 5 };

function weightedSample(r, items, weights, k) {
  const pool = items.map((it, i) => ({ it, w: weights[i] }));
  const out = [];
  for (let n = 0; n < k && pool.length; n++) {
    let total = pool.reduce((s, p) => s + p.w, 0);
    let target = r() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      target -= pool[idx].w;
      if (target <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return out;
}

function generate(seed = 77123) {
  const r = mulberry32(seed);
  let products;
  const pfile = path.join(__dirname, "..", "data", "products.json");
  if (fs.existsSync(pfile)) {
    products = JSON.parse(fs.readFileSync(pfile, "utf8"));
  } else {
    products = generateCatalog();
  }

  const categories = Array.from(new Set(products.map((p) => p.category)));
  const tags = Array.from(new Set(products.flatMap((p) => p.tags)));

  const users = [];
  const interactions = [];
  let iid = 1;
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;

  for (let u = 0; u < NAMES.length; u++) {
    const id = "u_" + (u + 1);
    const prefCategory = categories[Math.floor(r() * categories.length)];
    const secondCategory = r() > 0.5 ? categories[Math.floor(r() * categories.length)] : null;
    const priceBand = r() < 0.33 ? "budget" : r() < 0.66 ? "mid" : "premium";
    const likedTags = [tags[Math.floor(r() * tags.length)], tags[Math.floor(r() * tags.length)]];

    // ~10% of users are "cold" (no history) to exercise cold-start handling
    const isCold = r() < 0.1;

    users.push({
      id,
      name: NAMES[u],
      preferences: {
        category: prefCategory,
        secondCategory,
        priceBand,
        likedTags,
      },
      coldStart: isCold,
      createdAt: new Date(now - (30 + Math.floor(r() * 300)) * DAY).toISOString(),
    });

    if (isCold) continue;

    const priceScore = (p) => {
      if (priceBand === "budget") return p.price < 2500 ? 1.5 : p.price < 8000 ? 0.8 : 0.2;
      if (priceBand === "mid") return p.price >= 2500 && p.price < 20000 ? 1.4 : 0.6;
      return p.price >= 15000 ? 1.6 : 0.4;
    };
    const weights = products.map((p) => {
      let w = 0.15;
      if (p.category === prefCategory) w += 3;
      if (secondCategory && p.category === secondCategory) w += 1.2;
      w += priceScore(p);
      const overlap = p.tags.filter((t) => likedTags.includes(t)).length;
      w += overlap * 0.8;
      return Math.max(0.05, w);
    });

    const chosen = weightedSample(r, products, weights, 10 + Math.floor(r() * 16));
    let session = 0;
    for (const p of chosen) {
      session++;
      const sessionId = `s_${u + 1}_${session}`;
      const baseTs = now - Math.floor(r() * 60) * DAY - Math.floor(r() * DAY);
      const steps = [{ type: "view", dt: 0 }];
      if (r() < 0.7) steps.push({ type: "click", dt: 2000 + Math.floor(r() * 8000) });
      if (r() < 0.35) steps.push({ type: "wishlist", dt: 5000 + Math.floor(r() * 20000) });
      if (r() < 0.3) steps.push({ type: "cart", dt: 10000 + Math.floor(r() * 30000) });
      if (r() < 0.18) steps.push({ type: "purchase", dt: 20000 + Math.floor(r() * 60000) });
      let t = baseTs;
      for (const s of steps) {
        t += s.dt;
        interactions.push({
          id: "i_" + iid++,
          userId: id,
          productId: p.id,
          type: s.type,
          ts: new Date(t).toISOString(),
          sessionId,
        });
      }
    }
  }

  interactions.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return { users, interactions };
}

function main() {
  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const { users, interactions } = generate();
  fs.writeFileSync(path.join(outDir, "users.json"), JSON.stringify(users, null, 2));
  fs.writeFileSync(path.join(outDir, "interactions.json"), JSON.stringify(interactions, null, 2));
  console.log(`Generated ${users.length} users and ${interactions.length} interactions -> ${outDir}`);
}

module.exports = { generate, EVENT_WEIGHTS, main };

if (require.main === module) main();
