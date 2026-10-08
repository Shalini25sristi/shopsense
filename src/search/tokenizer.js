"use strict";
/**
 * Text processing for indexing and querying.
 * - lowercasing, punctuation stripping, stop-word removal
 * - light stemming (plurals / -ing / -ed)
 * - multi-word phrase detection (e.g. "flat feet" -> flat_feet)
 * - synonym expansion so queries match meaning (e.g. earphones -> earbuds)
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "is",
  "are", "was", "were", "be", "by", "at", "as", "it", "this", "that", "from",
  "best", "good", "top", "buy", "online", "price", "under", "over", "new",
]);

/** canonical expansions: token -> extra tokens to add */
const SYNONYMS = {
  earphone: ["earbuds"],
  earphones: ["earbuds"],
  headphone: ["headphones"],
  earbud: ["earbuds"],
  sneaker: ["sneakers", "shoes"],
  sneakers: ["sneakers", "shoes"],
  footwear: ["shoes"],
  shoe: ["shoes"],
  cheap: ["budget"],
  affordable: ["budget"],
  economical: ["budget"],
  expensive: ["premium"],
  costly: ["premium"],
  moisturiser: ["moisturizer"],
  cream: ["moisturizer"],
  sunblock: ["sunscreen"],
  spf: ["sunscreen"],
  anc: ["noise", "cancellation", "noise_cancellation"],
  jogging: ["running"],
  run: ["running"],
  runner: ["running"],
  mobile: ["smartphone", "phone"],
  mobiles: ["smartphone", "phone"],
  cellphone: ["smartphone", "phone"],
  notebook: ["laptop"],
  watch: ["smartwatch"],
  workout: ["gym", "fitness"],
  supplement: ["protein", "supplement"],
  cleanser: ["face", "wash", "cleanser"],
  wash: ["face", "cleanser"],
  lotion: ["moisturizer"],
  bass: ["bass"],
  nc: ["noise", "cancellation"],
};

const PHRASES = [
  "flat feet",
  "noise cancellation",
  "battery life",
  "long distance",
  "white cast",
  "oil control",
  "work from home",
  "fast charging",
  "mass gainer",
  "oil free",
  "non comedogenic",
  "water resistant",
  "over ear",
  "true wireless",
  "heart rate",
];

function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * Tokenize text into a list of index/query terms.
 * @param {string} text
 * @param {{expand?: boolean}} [opts]
 * @returns {string[]}
 */
function tokenize(text, opts = {}) {
  const expand = opts.expand !== false;
  const lower = String(text || "").toLowerCase();

  const tokens = [];

  // multi-word phrases first
  for (const phrase of PHRASES) {
    if (lower.includes(phrase)) tokens.push(phrase.replace(/\s+/g, "_"));
  }

  const words = lower
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const raw of words) {
    if (STOPWORDS.has(raw)) continue;
    const w = stem(raw);
    if (!w) continue;
    tokens.push(w);
    if (expand) {
      // look up synonyms by the raw form first, then the stemmed form
      const syn = SYNONYMS[raw] || SYNONYMS[w];
      if (syn) {
        for (const s of syn) {
          // keep phrase tokens (with underscores) intact, stem single words
          tokens.push(s.includes("_") ? s : stem(s));
        }
      }
    }
  }
  return tokens;
}

/** Build the searchable text blob for a product. */
function productText(p) {
  const attrs = p.attributes
    ? Object.values(p.attributes)
        .map((v) => (typeof v === "boolean" ? (v ? "yes" : "no") : String(v)))
        .join(" ")
    : "";
  return [
    p.title,
    p.brand,
    p.category,
    (p.categoryPath || []).join(" "),
    p.description,
    (p.tags || []).join(" "),
    attrs,
  ]
    .filter(Boolean)
    .join(" ");
}

module.exports = { tokenize, productText, stem, STOPWORDS, SYNONYMS, PHRASES };
