#!/usr/bin/env node
/**
 * Seed the catalogue and interactions.
 * Tries to fetch a REAL product catalogue (with real images) from DummyJSON.
 * If the network is unavailable, falls back to the deterministic generator.
 *
 * Run: node scripts/seed.js   (or `npm run seed`)
 */
const fs = require("fs");
const path = require("path");

async function seed() {
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const productsFile = path.join(dataDir, "products.json");

  let source = "generated (offline)";
  try {
    const { main: fetchCatalog } = require("./fetch-catalog");
    await fetchCatalog();
    source = "DummyJSON (real products + images)";
  } catch (e) {
    console.warn(`! Real catalogue unavailable (${e.message}); using generated catalogue.`);
    const { generateCatalog } = require("./generate-catalog");
    fs.writeFileSync(productsFile, JSON.stringify(generateCatalog(), null, 2));
  }

  const { generate } = require("./generate-interactions");
  const { users, interactions } = generate();
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(users, null, 2));
  fs.writeFileSync(path.join(dataDir, "interactions.json"), JSON.stringify(interactions, null, 2));

  // Supplemental well-known-brand catalogue.
  const { generateExtra } = require("./generate-extra");
  const extra = generateExtra();
  fs.writeFileSync(path.join(dataDir, "extra-products.json"), JSON.stringify(extra, null, 2));

  console.log(`Seeded from ${source}: ${users.length} users, ${interactions.length} interactions, ${extra.length} extra products.`);
}

seed().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});
