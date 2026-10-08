#!/usr/bin/env node
/**
 * Drop the SQLite database and rebuild it from the JSON seed files.
 * Run: node scripts/reset-db.js   (or `npm run db:reset`)
 */
const fs = require("fs");
const { DB_FILE, openDatabase } = require("../src/db/database");

for (const suffix of ["", "-wal", "-shm"]) {
  try {
    fs.unlinkSync(DB_FILE + suffix);
  } catch {
    /* not present */
  }
}

const db = openDatabase();
const products = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
const users = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
const interactions = db.prepare("SELECT COUNT(*) AS n FROM interactions").get().n;
db.close();
console.log(`Reset ${DB_FILE}: ${products} products, ${users} users, ${interactions} interactions.`);
