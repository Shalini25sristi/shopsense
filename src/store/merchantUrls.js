"use strict";
/**
 * Merchant deep-link builders.
 *
 * In a production affiliate integration, each offer would carry the exact
 * product URL returned by the merchant's affiliate API (e.g. Amazon PA-API
 * /dp/<ASIN>). Our catalogue is synthetic, so we build the best available
 * deep link: the merchant's product search for the exact product title.
 * Swap `merchantSearchUrl` for the API-provided product URL to get true
 * direct product pages.
 */

const MERCHANT_SEARCH = {
  amazon: (q) => `https://www.amazon.in/s?k=${q}&tag=shopsense-21`,
  flipkart: (q) => `https://www.flipkart.com/search?q=${q}&affid=shopsense`,
  myntra: (q) => `https://www.myntra.com/search?rawQuery=${q}`,
  nykaa: (q) => `https://www.nykaa.com/search/result/?q=${q}`,
  croma: (q) => `https://www.croma.com/searchB?q=${q}`,
  ajio: (q) => `https://www.ajio.com/search/?text=${q}`,
  "tata-cliq": (q) => `https://www.tatacliq.com/search/?searchCategory=all&text=${q}`,
  meesho: (q) => `https://www.meesho.com/search?q=${q}`,
};

/** Allowed destination hosts (protects /go against open-redirect abuse). */
const MERCHANT_HOSTS = new Set([
  "amazon.in",
  "flipkart.com",
  "myntra.com",
  "nykaa.com",
  "croma.com",
  "ajio.com",
  "tatacliq.com",
  "meesho.com",
]);

function merchantSearchUrl(slug, query) {
  const build = MERCHANT_SEARCH[slug] || MERCHANT_SEARCH.amazon;
  return build(encodeURIComponent(query));
}

/** Precise search query for a product: brand + title (avoids duplicating a brand already in the title). */
function productQuery(product) {
  if (!product) return "";
  const title = String(product.title || "").trim();
  const brand = String(product.brand || "").trim();
  if (!brand) return title;
  if (!title) return brand;
  if (title.toLowerCase().startsWith(brand.toLowerCase())) return title;
  return `${brand} ${title}`;
}

/**
 * Best available destination for a "Buy" click on a given merchant.
 * Priority: an explicit product URL carried by the offer, otherwise the
 * merchant's product search for the exact brand + title.
 * (Real direct product URLs come from a merchant affiliate API; see README.)
 */
function bestOfferUrl(slug, product, offer) {
  if (offer && offer.productUrl && isAllowedMerchantUrl(offer.productUrl)) return offer.productUrl;
  const q = productQuery(product) || (product && product.title) || "";
  return merchantSearchUrl(slug, q);
}

/** True if a URL points at an allowed merchant host. */
function isAllowedMerchantUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.replace(/^www\./, "");
    return MERCHANT_HOSTS.has(host);
  } catch {
    return false;
  }
}

module.exports = { merchantSearchUrl, productQuery, bestOfferUrl, isAllowedMerchantUrl, MERCHANT_SEARCH, MERCHANT_HOSTS };
