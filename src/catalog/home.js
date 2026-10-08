"use strict";
/**
 * Home-page merchandising: a curated shelf of well-known brands plus
 * category (vertical) sections, each ranked by rating, popularity and value.
 */
const { isFeaturedBrand } = require("./brands");
const { VERTICAL_ORDER } = require("./categories");

function qualityScore(p, maxPop, popularity) {
  const popN = maxPop > 0 ? (popularity.get(p.id) || 0) / maxPop : 0;
  const ratingN = (p.rating || 0) / 5;
  const value = p.mrp > p.price ? (p.mrp - p.price) / p.mrp : 0;
  return 0.45 * ratingN + 0.3 * popN + 0.15 * (p.image ? 1 : 0) + 0.1 * value;
}

function buildHome(store, { featuredLimit = 12, perCategory = 5, maxCategories = 12 } = {}) {
  const products = store.products || [];
  const popularity = (store.recs && store.recs.popularity) || new Map();
  let maxPop = 1;
  for (const v of popularity.values()) if (v > maxPop) maxPop = v;

  const rank = (arr) =>
    arr.slice().sort((a, b) => qualityScore(b, maxPop, popularity) - qualityScore(a, maxPop, popularity));

  // One best product per well-known brand, so the shelf spans many brands.
  const featuredRanked = rank(products.filter((p) => isFeaturedBrand(p.brand)));
  const byBrand = new Map();
  for (const p of featuredRanked) if (!byBrand.has(p.brand)) byBrand.set(p.brand, p);
  const featuredBrands = Array.from(byBrand.keys());

  const groups = new Map();
  for (const p of products) {
    const v = (p.categoryPath && p.categoryPath[0]) || "Other";
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(p);
  }

  const verticals = [];
  const seen = new Set();
  const pushVertical = (v) => {
    const arr = groups.get(v);
    if (!arr || arr.length < 4 || seen.has(v)) return;
    seen.add(v);
    verticals.push({ vertical: v, count: arr.length, products: rank(arr).slice(0, perCategory) });
  };
  for (const v of VERTICAL_ORDER) pushVertical(v);
  for (const v of groups.keys()) pushVertical(v);

  return {
    featured: Array.from(byBrand.values()).slice(0, featuredLimit),
    featuredBrands: featuredBrands.slice(0, 20),
    verticals: verticals.slice(0, maxCategories),
  };
}

module.exports = { buildHome, qualityScore };
