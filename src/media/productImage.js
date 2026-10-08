"use strict";
/**
 * Deterministic SVG "product image" generator.
 *
 * The catalogue has no real photography, so each product gets a clean vector
 * illustration based on its category (bottle, tube, shoe, earbuds, phone,
 * laptop, watch, ...) on a brand-coloured gradient. This keeps the storefront
 * self-contained (no external image host, no network dependency) while still
 * showing a real product visual instead of a bare initial.
 */

const SHAPES = {
  tube: `
    <rect x="155" y="118" width="90" height="204" rx="36" fill="#ffffff"/>
    <rect x="185" y="86" width="30" height="40" rx="6" fill="#ffffff" opacity="0.85"/>
    <rect x="150" y="150" width="100" height="34" rx="10" fill="rgba(0,0,0,0.12)"/>`,
  jar: `
    <rect x="138" y="178" width="124" height="124" rx="22" fill="#ffffff"/>
    <rect x="150" y="146" width="100" height="42" rx="14" fill="#ffffff" opacity="0.88"/>
    <ellipse cx="200" cy="146" rx="50" ry="12" fill="rgba(0,0,0,0.12)"/>`,
  dropper: `
    <rect x="166" y="150" width="68" height="172" rx="14" fill="#ffffff"/>
    <rect x="186" y="108" width="28" height="48" rx="6" fill="#ffffff" opacity="0.85"/>
    <rect x="181" y="86" width="38" height="28" rx="8" fill="rgba(0,0,0,0.14)"/>
    <rect x="176" y="205" width="48" height="66" rx="6" fill="rgba(0,0,0,0.10)"/>`,
  bottle: `
    <rect x="158" y="138" width="84" height="184" rx="18" fill="#ffffff"/>
    <rect x="185" y="102" width="30" height="42" rx="5" fill="#ffffff" opacity="0.85"/>
    <rect x="177" y="82" width="46" height="26" rx="7" fill="rgba(0,0,0,0.14)"/>
    <rect x="172" y="200" width="56" height="62" rx="6" fill="rgba(0,0,0,0.10)"/>`,
  shoe: `
    <path d="M108 262 q0 -44 44 -50 l42 -6 q30 -4 46 16 l16 24 q62 8 76 30 q6 12 -10 16 l-198 0 q-16 0 -16 -16 z" fill="#ffffff"/>
    <path d="M112 268 h188" stroke="rgba(0,0,0,0.16)" stroke-width="8" stroke-linecap="round"/>
    <path d="M170 224 l22 34 M206 218 l22 34" stroke="rgba(0,0,0,0.14)" stroke-width="7" stroke-linecap="round"/>`,
  earbuds: `
    <circle cx="166" cy="178" r="30" fill="#ffffff"/>
    <rect x="151" y="198" width="30" height="72" rx="15" fill="#ffffff"/>
    <circle cx="244" cy="178" r="30" fill="#ffffff"/>
    <rect x="229" y="198" width="30" height="72" rx="15" fill="#ffffff"/>
    <rect x="168" y="292" width="74" height="42" rx="14" fill="rgba(255,255,255,0.85)"/>`,
  headphones: `
    <path d="M118 214 v-34 a82 82 0 0 1 164 0 v34" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round"/>
    <rect x="98" y="202" width="48" height="84" rx="22" fill="#ffffff"/>
    <rect x="254" y="202" width="48" height="84" rx="22" fill="#ffffff"/>`,
  speaker: `
    <rect x="138" y="116" width="124" height="208" rx="22" fill="#ffffff"/>
    <circle cx="200" cy="178" r="36" fill="rgba(0,0,0,0.16)"/>
    <circle cx="200" cy="272" r="22" fill="rgba(0,0,0,0.16)"/>`,
  phone: `
    <rect x="150" y="88" width="100" height="212" rx="20" fill="#ffffff"/>
    <rect x="162" y="106" width="76" height="162" rx="8" fill="rgba(0,0,0,0.16)"/>
    <circle cx="200" cy="284" r="8" fill="rgba(0,0,0,0.22)"/>`,
  laptop: `
    <rect x="140" y="108" width="160" height="112" rx="10" fill="#ffffff"/>
    <rect x="150" y="118" width="140" height="92" rx="4" fill="rgba(0,0,0,0.16)"/>
    <path d="M108 228 h224 l16 36 q4 10 -8 10 h-240 q-12 0 -8 -10 z" fill="#ffffff"/>`,
  watch: `
    <rect x="168" y="104" width="64" height="192" rx="28" fill="rgba(255,255,255,0.5)"/>
    <rect x="148" y="148" width="104" height="104" rx="28" fill="#ffffff"/>
    <rect x="164" y="164" width="72" height="72" rx="16" fill="rgba(0,0,0,0.16)"/>`,
  tub: `
    <rect x="138" y="158" width="124" height="152" rx="16" fill="#ffffff"/>
    <ellipse cx="200" cy="158" rx="62" ry="18" fill="#ffffff" opacity="0.88"/>
    <rect x="150" y="148" width="100" height="30" rx="10" fill="rgba(0,0,0,0.12)"/>`,
  box: `
    <rect x="148" y="138" width="104" height="156" rx="14" fill="#ffffff"/>
    <rect x="148" y="138" width="104" height="42" rx="14" fill="rgba(0,0,0,0.12)"/>`,
};

const CATEGORY_SHAPE = {
  "Face Wash": "tube",
  Sunscreen: "tube",
  "Face Serum": "dropper",
  Moisturizer: "jar",
  "Hair Oils": "bottle",
  "Body Lotion": "bottle",
  "Running Shoes": "shoe",
  Sneakers: "shoe",
  "Wireless Earbuds": "earbuds",
  "Over-Ear Headphones": "headphones",
  "Bluetooth Speakers": "speaker",
  Smartphones: "phone",
  Laptops: "laptop",
  Smartwatches: "watch",
  "Whey Protein": "tub",
};

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function hueFor(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) % 360;
  return h;
}

function productImageSVG(product, { size = 400 } = {}) {
  const hue = hueFor(product.brand);
  const hue2 = (hue + 40) % 360;
  const shape = SHAPES[CATEGORY_SHAPE[product.category]] || SHAPES.box;
  const brand = xmlEscape(product.brand);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 400 400" role="img" aria-label="${xmlEscape(product.title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},52%,44%)"/>
      <stop offset="1" stop-color="hsl(${hue2},52%,28%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <ellipse cx="200" cy="330" rx="120" ry="26" fill="rgba(0,0,0,0.16)"/>
  <g>${shape}</g>
  <text x="200" y="378" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="rgba(255,255,255,0.92)">${brand}</text>
</svg>`;
}

module.exports = { productImageSVG, CATEGORY_SHAPE };
