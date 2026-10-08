#!/usr/bin/env node
/**
 * Backfill real merchant product URLs on each offer by calling the configured
 * affiliate resolver. Run once (or on a schedule) after setting:
 *
 *   AFFILIATE_RESOLVER_URL=https://your-resolver.example/lookup
 *   AFFILIATE_RESOLVER_KEY=...            (optional)
 *
 * Resolved URLs are stored on `offer.productUrl` and used by `/go`.
 *
 * Run: node scripts/resolve-product-links.js   (or `npm run affiliate:resolve`)
 */
const { openDatabase, createRepo } = require("../src/db/database");
const { resolveProductUrl, getResolverConfig } = require("../src/affiliate/affiliate");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cfg = getResolverConfig();
  if (!cfg.enabled) {
    console.error(
      "No affiliate resolver configured.\n" +
        "Set AFFILIATE_RESOLVER_URL (and optionally AFFILIATE_RESOLVER_KEY), then re-run.\n" +
        "See .env.example and the README 'Affiliate product links' section."
    );
    process.exit(1);
  }

  const db = openDatabase();
  const repo = createRepo(db);
  const products = repo.products.all();

  let resolved = 0;
  let offers = 0;
  for (const product of products) {
    let changed = false;
    for (const offer of product.offers || []) {
      offers++;
      if (offer.productUrl) continue;
      const url = await resolveProductUrl(offer.merchantSlug, product);
      if (url) {
        offer.productUrl = url;
        changed = true;
        resolved++;
      }
      await sleep(cfg.delayMs);
    }
    if (changed) repo.products.save(product);
  }

  db.close();
  console.log(`Resolved ${resolved}/${offers} offer URLs across ${products.length} products.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("resolve-product-links failed:", err);
  process.exit(1);
});
