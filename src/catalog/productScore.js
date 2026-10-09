"use strict";
/**
 * Deterministic "AI spec score" (0-100).
 *
 * The project runs with zero runtime dependencies and no external model, so the
 * score is a transparent, reproducible evaluation of a product's *specifications*
 * together with its catalogue quality signals. Same input always yields the same
 * score, which lets us compute it once and cache it on the product object.
 *
 * Signals:
 *   - specifications : how complete/rich the aggregated spec sheet is (30)
 *   - quality        : the marketplace rating, normalised to 5 stars    (30)
 *   - confidence     : review volume, log-scaled (more reviews = surer) (15)
 *   - value          : discount off MRP                                  (15)
 *   - availability   : in-stock state and stock depth                   (10)
 */
const { productSpecs } = require("./productSpecs");

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const WEIGHTS = { specs: 30, quality: 30, confidence: 15, value: 15, availability: 10 };

/** Number of distinct, non-empty specification rows we treat as a full spec sheet. */
const SPEC_TARGET = 16;

const LABELS = {
  specs: "Specification completeness",
  quality: "Ratings quality",
  confidence: "Review confidence",
  value: "Value for money",
  availability: "Availability",
};

function specCoverage(product) {
  let filled = 0;
  for (const group of productSpecs(product)) {
    for (const item of group.items) {
      const v = item.value;
      if (v == null) continue;
      const s = String(v).trim();
      if (s === "" || s === "—" || s === "-") continue;
      filled++;
    }
  }
  return clamp(filled / SPEC_TARGET, 0, 1);
}

function availabilityScore(product) {
  if (product.inStock === false) return 0;
  const stock = product.attributes && product.attributes.stock;
  if (typeof stock === "number" && Number.isFinite(stock)) return clamp(stock / 50, 0.2, 1);
  return product.inStock === true ? 0.9 : 0.6;
}

function gradeFor(score) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "E";
}

/**
 * Score a product's specifications and quality signals.
 * @param {object} product
 * @returns {{score:number, grade:string, label:string, breakdown:object, weights:object}|null}
 */
function aiSpecScore(product) {
  if (!product) return null;

  const rating = clamp(Number(product.rating) || 0, 0, 5) / 5;
  const reviewCount = Math.max(0, Number(product.ratingCount) || 0);
  const confidence = clamp(Math.log10(reviewCount + 1) / 3, 0, 1);
  const price = Number(product.price) || 0;
  const mrp = Number(product.mrp) || price;
  const value = mrp > price && mrp > 0 ? clamp((mrp - price) / mrp, 0, 1) : 0;

  const parts = {
    specs: specCoverage(product) * WEIGHTS.specs,
    quality: rating * WEIGHTS.quality,
    confidence: confidence * WEIGHTS.confidence,
    value: value * WEIGHTS.value,
    availability: availabilityScore(product) * WEIGHTS.availability,
  };

  const score = clamp(Math.round(Object.values(parts).reduce((a, b) => a + b, 0)), 0, 100);
  const breakdown = {};
  for (const [k, v] of Object.entries(parts)) {
    breakdown[k] = { label: LABELS[k], value: Math.round(v * 10) / 10, max: WEIGHTS[k] };
  }

  return { score, grade: gradeFor(score), label: "AI spec score", breakdown, weights: WEIGHTS };
}

/** Attach (or refresh) an `aiScore` on every product in place. */
function annotateAiScores(products) {
  for (const product of products) product.aiScore = aiSpecScore(product);
  return products;
}

module.exports = { aiSpecScore, annotateAiScores, gradeFor, WEIGHTS };
