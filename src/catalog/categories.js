"use strict";
/**
 * Catalogue categorisation.
 *
 * The upstream sources bucket many products under loose or wrong verticals
 * (e.g. shirts and bags landing in "Electronics"), so we map each leaf category
 * to a clean top-level vertical. Applied at seed time and on startup so existing
 * databases are corrected too.
 */

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Leaf category (normalised) -> top-level vertical. */
const CATEGORY_VERTICAL = {
  // Beauty & personal care
  beauty: "Beauty",
  "skin care": "Beauty",
  skincare: "Beauty",
  fragrances: "Beauty",
  "hair oils": "Beauty",
  shampoo: "Beauty",
  conditioner: "Beauty",
  "hair mask": "Beauty",
  "face cream": "Beauty",
  moisturizer: "Beauty",
  sunscreen: "Beauty",
  "body lotion": "Beauty",
  "face serum": "Beauty",
  serum: "Beauty",
  "face wash": "Beauty",
  lipstick: "Beauty",
  perfume: "Beauty",
  makeup: "Beauty",

  // Electronics
  smartphones: "Electronics",
  tablets: "Electronics",
  laptops: "Electronics",
  "mobile accessories": "Electronics",

  // Fashion & accessories
  "mens shirts": "Fashion",
  tops: "Fashion",
  "womens dresses": "Fashion",
  "womens bags": "Fashion",
  "womens jewellery": "Fashion",
  "mens shoes": "Footwear",
  "womens shoes": "Footwear",
  sunglasses: "Accessories",
  "mens watches": "Watches",
  "womens watches": "Watches",

  // Home & kitchen
  "kitchen accessories": "Home",
  furniture: "Home",
  "home decoration": "Home",

  // Grocery
  groceries: "Grocery",

  // Automotive
  motorcycle: "Automotive",
  vehicle: "Automotive",

  // Sports
  "sports accessories": "Sports",
};

/** Preferred display order for the storefront. */
const VERTICAL_ORDER = [
  "Beauty",
  "Electronics",
  "Fashion",
  "Footwear",
  "Watches",
  "Accessories",
  "Home",
  "Grocery",
  "Sports",
  "Automotive",
];

function verticalFor(product) {
  const mapped = CATEGORY_VERTICAL[norm(product.category)];
  if (mapped) return mapped;
  if (product.categoryPath && product.categoryPath[0]) return product.categoryPath[0];
  return "Other";
}

/**
 * Fix a product's categoryPath in place.
 * @returns {boolean} true when something changed.
 */
function recategorize(product) {
  const vertical = verticalFor(product);
  const path = [vertical, product.category].filter(Boolean);
  const current = product.categoryPath || [];
  if (current[0] !== path[0] || current[1] !== path[1] || current.length !== path.length) {
    product.categoryPath = path;
    return true;
  }
  return false;
}

module.exports = { norm, verticalFor, recategorize, CATEGORY_VERTICAL, VERTICAL_ORDER };
