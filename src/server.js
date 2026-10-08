"use strict";
/**
 * ShopSense HTTP server: serves the REST API under /api and the static frontend.
 * Zero runtime dependencies (Node built-ins only).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createStore } = require("./store/store");
const { handleApi, sendJSON } = require("./api/routes");
const { merchantSearchUrl, bestOfferUrl, productQuery, isAllowedMerchantUrl } = require("./store/merchantUrls");
const { applyTracking } = require("./affiliate/affiliate");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webp": "image/webp",
};

const ROUTES = {
  "/": "index.html",
  "/search": "search.html",
  "/product": "product.html",
  "/list": "list.html",
  "/wishlist": "wishlist.html",
  "/admin": "admin.html",
};

/**
 * Outbound affiliate redirect (mimics flash.co's /go).
 * Resolves the destination in priority order:
 *   1. an explicit, host-validated `u` deep link
 *   2. the stored offer URL for the requested merchant
 *   3. a merchant product-search deep link built from the title
 * Then logs the click and issues a 302.
 */
function handleGo(res, url, store) {
  const merchant = url.searchParams.get("merchant") || "amazon";
  const productId = url.searchParams.get("product");
  const product = productId ? store.search.product(productId) : null;

  let target = url.searchParams.get("u");
  if (target && !isAllowedMerchantUrl(target)) target = null;

  const offer = product ? (product.offers || []).find((o) => o.merchantSlug === merchant) : null;

  // Prefer a direct product URL from the offer, otherwise the merchant's
  // product search for the exact brand + title.
  if (!target) {
    if (product) {
      target = bestOfferUrl(merchant, product, offer);
    } else {
      target = merchantSearchUrl(merchant, url.searchParams.get("q") || productQuery(product));
    }
  }

  target = applyTracking(merchant, target);

  if (product) store.recordEvent({ productId, type: "click", userId: url.searchParams.get("userId") });
  res.writeHead(302, { Location: target });
  res.end();
}

function serveStatic(res, pathname) {
  let file = null;
  if (ROUTES[pathname]) {
    file = path.join(PUBLIC_DIR, ROUTES[pathname]);
  } else {
    const safe = pathname.replace(/\.\./g, "");
    const candidate = path.join(PUBLIC_DIR, safe);
    if (candidate.startsWith(PUBLIC_DIR) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      file = candidate;
    }
  }
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  const data = fs.readFileSync(file);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(data);
}

function main() {
  const store = createStore();
  console.log("ShopSense starting...");
  console.log(`  catalogue: ${store.products.length} products`);
  console.log(`  users: ${store.users.length}, interactions: ${store.interactions.length}`);
  console.log(`  curated lists: ${store.curatedLists.length}`);
  console.log(`  search index: ${store.search.stats().vocabulary} terms`);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api")) {
      Promise.resolve(handleApi(req, res, url, store)).catch((err) => {
        console.error("API error:", err);
        if (!res.headersSent) sendJSON(res, 500, { error: "Internal error" });
      });
      return;
    }
    if (url.pathname === "/go") {
      handleGo(res, url, store);
      return;
    }
    serveStatic(res, url.pathname);
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  ShopSense running at http://localhost:${PORT}`);
    console.log(`  API base:            http://localhost:${PORT}/api`);
    console.log(`  Try: /search?q=running+shoes+for+flat+feet`);
    console.log(`       /api/recommendations?userId=u_1\n`);
  });
}

if (require.main === module) main();

module.exports = { main, handleGo };
