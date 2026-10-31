#!/usr/bin/env node
"use strict";
/**
 * Seed existing catalog, users, and interactions directly into Supabase.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-supabase.js
 * Or with a .env file:
 *   npm run db:supabase:seed
 */
const fs = require("fs");
const path = require("path");
const { getSupabaseClient, isSupabaseConfigured } = require("../src/db/supabaseClient");
const { ensureSeedFiles } = require("../src/db/database");
const { dedupeAndNormalize } = require("../src/catalog/categories");
const { hashPassword } = require("../src/auth/auth");

const DATA_DIR = path.join(__dirname, "..", "data");
const DEMO_PASSWORD = "password123";
const ADMIN_EMAIL = "admin@shopsense.dev";
const ADMIN_PASSWORD = "admin123";

function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function chunkUpsert(supabase, table, items, chunkSize = 100) {
  let total = 0;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk);
    if (error) {
      throw new Error(`Failed to insert into ${table} (chunk ${i}-${i + chunk.length}): ${error.message}`);
    }
    total += chunk.length;
    process.stdout.write(`\r  [${table}] Synced ${total}/${items.length} records...`);
  }
  process.stdout.write("\n");
  return total;
}

async function main() {
  // If dotenv is available, load it
  try {
    const envPath = path.join(__dirname, "..", ".env");
    if (fs.existsSync(envPath)) {
      const dotenvContent = fs.readFileSync(envPath, "utf8");
      for (const line of dotenvContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch (err) {
    // Ignore error loading .env
  }

  if (!isSupabaseConfigured()) {
    console.error("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env or environment.");
    console.error("   Example:");
    console.error("   SUPABASE_URL=https://xyzcompany.supabase.co");
    console.error("   SUPABASE_SERVICE_ROLE_KEY=eyJh...");
    process.exit(1);
  }

  const supabase = getSupabaseClient();
  ensureSeedFiles();

  console.log("🚀 Starting Supabase Seeding...\n");

  // 1. Prepare Users
  console.log("1️⃣ Seeding users...");
  const rawUsers = readJSON(path.join(DATA_DIR, "users.json"));
  const hashedDemo = hashPassword(DEMO_PASSWORD);
  const userRecords = rawUsers.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email || `${u.id}@example.com`,
    password_hash: hashedDemo,
    role: "user",
    cold_start: Boolean(u.coldStart),
    phone: u.phone || null,
    profession: u.profession || null,
    preferences: u.preferences || {},
    is_seed: true,
  }));

  // Ensure Admin User
  const hashedAdmin = hashPassword(ADMIN_PASSWORD);
  userRecords.unshift({
    id: "u_admin",
    name: "ShopSense Admin",
    email: ADMIN_EMAIL,
    password_hash: hashedAdmin,
    role: "admin",
    cold_start: false,
    phone: "+91 99999 00000",
    profession: "Platform Lead",
    preferences: { interests: ["admin", "analytics"] },
    is_seed: true,
  });

  await chunkUpsert(supabase, "users", userRecords, 100);

  // 2. Prepare Products
  console.log("2️⃣ Seeding products...");
  const baseProducts = readJSON(path.join(DATA_DIR, "products.json"));
  const extraProducts = readJSON(path.join(DATA_DIR, "extra-products.json"));
  const combined = dedupeAndNormalize([...baseProducts, ...extraProducts]);

  const productRecords = combined.map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brand || null,
    category: p.category || null,
    price: p.price != null ? Number(p.price) : null,
    mrp: p.mrp != null ? Number(p.mrp) : null,
    currency: p.currency || "INR",
    rating: p.rating != null ? Number(p.rating) : null,
    rating_count: p.ratingCount != null ? Number(p.ratingCount) : 0,
    data: p,
    updated_at: new Date().toISOString(),
  }));

  await chunkUpsert(supabase, "products", productRecords, 100);

  // 3. Prepare Interactions
  console.log("3️⃣ Seeding interactions...");
  const rawInteractions = readJSON(path.join(DATA_DIR, "interactions.json"));
  const interactionRecords = rawInteractions.map((i) => ({
    id: i.id || `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: i.userId || null,
    product_id: i.productId,
    type: i.type || "view",
    ts: i.ts || new Date().toISOString(),
    session_id: i.sessionId || null,
  }));

  await chunkUpsert(supabase, "interactions", interactionRecords, 200);

  console.log("\n✅ Supabase database successfully seeded!");
  console.log(`   - Users:        ${userRecords.length}`);
  console.log(`   - Products:     ${productRecords.length}`);
  console.log(`   - Interactions: ${interactionRecords.length}`);
}

main().catch((err) => {
  console.error("\n❌ Seeding failed:", err);
  process.exit(1);
});
