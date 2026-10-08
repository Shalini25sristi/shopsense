"use strict";
/**
 * Fuzzy string matching for typo tolerance and spell correction.
 * Uses Levenshtein edit distance (dynamic programming, O(n*m)).
 */

function levenshtein(a, b) {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Find vocabulary terms within maxDist of `term`, ranked by distance then length. */
function nearestTerms(term, vocabulary, maxDist = 2, limit = 3) {
  const out = [];
  for (const v of vocabulary) {
    if (Math.abs(v.length - term.length) > maxDist) continue;
    const d = levenshtein(term, v);
    if (d <= maxDist) out.push({ term: v, distance: d });
  }
  out.sort((a, b) => a.distance - b.distance || b.term.length - a.term.length);
  return out.slice(0, limit);
}

/**
 * Given query tokens and a vocabulary set, return corrected tokens plus the
 * corrections applied. Tokens already in vocabulary are kept as-is.
 */
function correctQuery(tokens, vocabSet, maxDist = 1) {
  const corrected = [];
  const fixes = [];
  for (const t of tokens) {
    if (vocabSet.has(t)) {
      corrected.push(t);
      continue;
    }
    const nearest = nearestTerms(t, vocabSet, maxDist, 1)[0];
    if (nearest && nearest.distance <= maxDist) {
      corrected.push(nearest.term);
      fixes.push({ from: t, to: nearest.term });
    } else {
      corrected.push(t);
    }
  }
  return { tokens: corrected, fixes };
}

module.exports = { levenshtein, nearestTerms, correctQuery };
