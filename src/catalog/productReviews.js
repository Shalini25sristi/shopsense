"use strict";
/**
 * Deterministic review synthesizer.
 *
 * Real marketplaces don't expose their review text through free APIs, so this
 * module generates stable, clearly-labelled *sample* reviews aggregated across
 * the partner stores the product is listed on. Ratings and source breakdowns
 * are derived from the catalogue rating so the numbers stay internally
 * consistent; the review text is illustrative demo content.
 */
const { mulberry32 } = require("../utils/rng");
const { hashSeed } = require("./productSpecs");

const SOURCES = [
  { source: "Amazon", domain: "amazon.in" },
  { source: "Flipkart", domain: "flipkart.com" },
  { source: "Myntra", domain: "myntra.com" },
  { source: "Nykaa", domain: "nykaa.com" },
  { source: "Croma", domain: "croma.com" },
  { source: "Ajio", domain: "ajio.com" },
  { source: "Tata Cliq", domain: "tatacliq.com" },
  { source: "Meesho", domain: "meesho.com" },
];

const AUTHORS = [
  ["Aarav S.", "Mumbai"], ["Diya P.", "Delhi"], ["Vivaan R.", "Bengaluru"], ["Ananya M.", "Pune"],
  ["Aditya K.", "Hyderabad"], ["Ishita G.", "Chennai"], ["Kabir N.", "Kolkata"], ["Saanvi T.", "Jaipur"],
  ["Arjun D.", "Ahmedabad"], ["Myra V.", "Lucknow"], ["Reyansh B.", "Indore"], ["Aadhya J.", "Bhopal"],
  ["Krishna H.", "Surat"], ["Anika L.", "Nagpur"], ["Ishaan Q.", "Kochi"], ["Navya F.", "Chandigarh"],
];

const BODIES = {
  positive: [
    "Exactly as described. Quality feels premium and the packaging was neat.",
    "Genuine product at a great price. Delivery was quick and hassle-free.",
    "Excellent pick! Works/feels just like the listing promised. Will reorder.",
    "Really happy with this purchase — value for money and worth recommending.",
    "Loved the quality and finish. The seller packed it very securely.",
    "Better than expected. Great experience buying from this store.",
  ],
  neutral: [
    "Product is fine and matches the description. Nothing extraordinary though.",
    "Decent quality for the price. Packaging could have been a bit better.",
    "Does the job. Delivery took a little longer than promised.",
    "Okay overall — average finish, but usable for the price paid.",
  ],
  negative: [
    "Slightly disappointed; the quality didn't match my expectations for this price.",
    "Item arrived late and the outer packaging was damaged.",
    "Not quite like the photos. Considering returning it.",
    "Average product with a few issues. Expected better build quality.",
  ],
};

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Star distribution weights shaped by the product's average rating. */
function distributionWeights(avg) {
  if (avg >= 4.4) return { 5: 70, 4: 20, 3: 6, 2: 2, 1: 2 };
  if (avg >= 4) return { 5: 55, 4: 28, 3: 10, 2: 4, 1: 3 };
  if (avg >= 3.5) return { 5: 40, 4: 30, 3: 18, 2: 7, 1: 5 };
  if (avg >= 3) return { 5: 28, 4: 26, 3: 24, 2: 12, 1: 10 };
  return { 5: 18, 4: 20, 3: 26, 2: 18, 1: 18 };
}

function buildDistribution(weights, total) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const dist = {};
  let assigned = 0;
  for (const star of [5, 4, 3, 2, 1]) {
    const n = Math.round((weights[star] / sum) * total);
    dist[star] = n;
    assigned += n;
  }
  dist[5] += total - assigned; // fix rounding drift
  return dist;
}

function ratingFromWeights(rng, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let target = rng() * total;
  for (const star of [5, 4, 3, 2, 1]) {
    target -= weights[star];
    if (target <= 0) return star;
  }
  return 3;
}

function bodyFor(rng, rating) {
  if (rating >= 4) return pick(rng, BODIES.positive);
  if (rating === 3) return pick(rng, BODIES.neutral);
  return pick(rng, BODIES.negative);
}

function titleFor(rating) {
  return { 5: "Excellent", 4: "Very good", 3: "Decent", 2: "Could be better", 1: "Disappointed" }[rating];
}

/**
 * Build a review summary + a page of reviews for a product.
 * @param {object} product
 * @param {{limit?:number, source?:string, minRating?:number, sort?:string}} [options]
 */
function productReviews(product, options = {}) {
  if (!product) return { summary: null, reviews: [] };
  const { limit = 8, source = null, minRating = 0, sort = "recent" } = options;
  const rng = mulberry32(hashSeed((product.id || product.title || "x") + "#reviews"));

  const avg = Number(product.rating) || 4;
  const total = Math.max(Number(product.ratingCount) || 12, 3);
  const weights = distributionWeights(avg);
  const distribution = buildDistribution(weights, total);

  // Choose 4–6 stores this product is listed on and split the ratings across them.
  const sourceCount = 4 + Math.floor(rng() * 3);
  const start = Math.floor(rng() * SOURCES.length);
  const chosen = [];
  for (let i = 0; i < sourceCount; i++) chosen.push(SOURCES[(start + i * 2) % SOURCES.length]);

  const shares = chosen.map(() => 0.4 + rng());
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const bySource = chosen.map((s, i) => {
    const count = Math.max(1, Math.round((shares[i] / shareSum) * total));
    const sourceAvg = Math.min(5, Math.max(1, Math.round((avg + (rng() - 0.4) * 0.6) * 10) / 10));
    return { source: s.source, domain: s.domain, count, average: sourceAvg };
  });

  // Generate the paginated review list.
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const reviews = [];
  for (let i = 0; i < limit; i++) {
    const src = bySource[i % bySource.length];
    const rating = ratingFromWeights(rng, weights);
    const [author, location] = AUTHORS[Math.floor(rng() * AUTHORS.length)];
    const daysAgo = Math.floor(rng() * 720);
    const date = new Date(now - daysAgo * DAY).toISOString();
    reviews.push({
      id: `${product.id || "p"}_rv_${i + 1}`,
      source: src.source,
      domain: src.domain,
      merchant: src.source,
      author,
      location,
      rating,
      title: titleFor(rating),
      body: bodyFor(rng, rating),
      date,
      verified: rng() > 0.25,
      helpful: Math.floor(rng() * 140),
    });
  }

  let filtered = reviews;
  if (source) filtered = filtered.filter((r) => r.source.toLowerCase() === String(source).toLowerCase());
  if (minRating) filtered = filtered.filter((r) => r.rating >= Number(minRating));
  if (sort === "helpful") filtered = filtered.slice().sort((a, b) => b.helpful - a.helpful);
  else if (sort === "rating") filtered = filtered.slice().sort((a, b) => b.rating - a.rating);
  else filtered = filtered.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  const percentages = {};
  for (const star of [5, 4, 3, 2, 1]) percentages[star] = total ? Math.round((distribution[star] / total) * 1000) / 10 : 0;

  return {
    summary: {
      average: Math.round(avg * 10) / 10,
      total,
      distribution,
      percentages,
      bySource,
    },
    reviews: filtered,
  };
}

module.exports = { productReviews, SOURCES };
