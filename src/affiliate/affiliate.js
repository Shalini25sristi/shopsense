"use strict";
/**
 * Affiliate integration.
 *
 * The catalogue is built from public product APIs that do not carry merchant
 * product URLs, so by default `Buy` links fall back to the merchant's search
 * for the exact brand + title. This module adds the two pieces needed to open
 * the real product page once affiliate credentials are available:
 *
 *   1. Tracking parameters — appended to every outbound merchant link
 *      (e.g. Amazon `tag`, Flipkart `affid`). Configured via environment.
 *   2. Product-link resolver — a pluggable HTTP endpoint that maps
 *      `{ merchant, brand, title, upc }` to a real product URL. Point it at an
 *      affiliate/aggregator service (Amazon PA-API wrapper, Rainforest, etc.).
 *      Resolved URLs are cached on `offer.productUrl` by
 *      `scripts/resolve-product-links.js`, so `/go` stays fast and offline.
 *
 * No credentials are required to run the app; without them the precise search
 * links are used.
 */
const { isAllowedMerchantUrl } = require("../store/merchantUrls");

/** Per-merchant affiliate tracking parameter (name of the query key + env var). */
const TRACKING = {
  amazon: { param: "tag", env: "AFFILIATE_AMAZON_TAG" },
  flipkart: { param: "affid", env: "AFFILIATE_FLIPKART_AFFID" },
  myntra: { param: "utm_source", env: "AFFILIATE_MYNTRA_SOURCE" },
  nykaa: { param: "utm_source", env: "AFFILIATE_NYKAA_SOURCE" },
  croma: { param: "utm_source", env: "AFFILIATE_CROMA_SOURCE" },
  ajio: { param: "utm_source", env: "AFFILIATE_AJIO_SOURCE" },
  "tata-cliq": { param: "utm_source", env: "AFFILIATE_TATACLIQ_SOURCE" },
  meesho: { param: "utm_source", env: "AFFILIATE_MEESHO_SOURCE" },
};

/** Append the configured affiliate/tracking parameter to a merchant URL. */
function applyTracking(merchantSlug, url) {
  const rule = TRACKING[merchantSlug];
  if (!rule || !url) return url;
  const value = process.env[rule.env];
  if (!value) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has(rule.param)) u.searchParams.set(rule.param, value);
    return u.toString();
  } catch {
    return url;
  }
}

function getResolverConfig() {
  const url = process.env.AFFILIATE_RESOLVER_URL || "";
  return {
    enabled: !!url,
    url,
    key: process.env.AFFILIATE_RESOLVER_KEY || null,
    delayMs: Number(process.env.AFFILIATE_RESOLVER_DELAY_MS) || 250,
  };
}

/**
 * Ask the configured resolver for a real product URL.
 * Expected request:  POST { merchant, brand, title, upc }
 * Expected response: { url }  (or { productUrl })
 * Returns a validated, tracked URL or null.
 */
async function resolveProductUrl(merchantSlug, product, fetchImpl = globalThis.fetch) {
  const cfg = getResolverConfig();
  if (!cfg.enabled || typeof fetchImpl !== "function") return null;
  try {
    const res = await fetchImpl(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
      },
      body: JSON.stringify({
        merchant: merchantSlug,
        brand: product.brand || null,
        title: product.title || null,
        upc: product.upc || null,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const url = data && (data.url || data.productUrl);
    if (!url || !isAllowedMerchantUrl(url)) return null;
    return applyTracking(merchantSlug, url);
  } catch {
    return null;
  }
}

module.exports = { applyTracking, resolveProductUrl, getResolverConfig, TRACKING };
