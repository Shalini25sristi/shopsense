#!/usr/bin/env node
/**
 * Supplemental catalogue of well-known branded products across every vertical.
 * Deterministic; merged into the main catalogue at seed time so the storefront
 * has more, better-known products to search and recommend.
 *
 * Run: node scripts/generate-extra.js   -> data/extra-products.json
 */
const fs = require("fs");
const path = require("path");
const { attachOffers } = require("./generate-catalog");

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const COLORS = ["Black", "White", "Blue", "Red", "Green", "Grey", "Beige", "Navy", "Pink", "Brown"];
const MATERIALS = ["Cotton", "Leather", "Mesh", "Polyester", "Synthetic", "Denim", "Silk", "Stainless Steel"];

/** { category, path, brands, adjectives, nouns, tags, price, rating, kind } */
const TYPES = [
  { category: "Running Shoes", path: ["Footwear", "Sports Shoes", "Running Shoes"], brands: ["Nike", "Adidas", "Puma", "Reebok", "New Balance", "Asics", "Skechers", "Under Armour"], adjectives: ["Air Zoom", "Ultraboost", "Cloudfoam", "Fresh Foam", "Gel", "Go Run", "Dynamo", "Revolution"], nouns: ["Pegasus", "Runner", "Floatride", "Guide", "Endorphin", "Velocity", "Glide"], tags: ["running", "shoes", "running shoes", "sports", "cushioned", "lightweight", "breathable", "road", "gym", "marathon"], price: [2499, 12999], rating: [4.0, 4.8], kind: "footwear" },
  { category: "Sneakers", path: ["Footwear", "Casual Shoes", "Sneakers"], brands: ["Nike", "Adidas", "Puma", "Converse", "Vans", "Reebok", "Fila", "Superga"], adjectives: ["Classic", "Retro", "Court", "Street", "Canvas", "Chunky", "OG", "Low"], nouns: ["Sneaker", "Superstar", "Chuck Taylor", "Old Skool", "Stan Smith", "Air Force", "Runner"], tags: ["sneakers", "casual", "shoes", "street", "everyday", "fashion", "canvas", "unisex", "comfort"], price: [1999, 9999], rating: [4.0, 4.7], kind: "footwear" },
  { category: "Casual Shoes", path: ["Footwear", "Casual Shoes", "Loafers"], brands: ["Clarks", "Hush Puppies", "Woodland", "Bata", "Red Tape", "Louis Philippe"], adjectives: ["Formal", "Slip-On", "Leather", "Everyday", "Comfort", "Derby", "Moccasin"], nouns: ["Loafer", "Shoe", "Derby", "Oxford", "Slip-On"], tags: ["casual shoes", "loafers", "formal", "leather", "office", "comfort", "men"], price: [1499, 6999], rating: [3.9, 4.6], kind: "footwear" },
  { category: "T-Shirts", path: ["Fashion", "Mens Clothing", "T-Shirts"], brands: ["Levi's", "U.S. Polo Assn.", "Tommy Hilfiger", "Calvin Klein", "H&M", "Jack & Jones", "Allen Solly"], adjectives: ["Solid", "Graphic", "Polo", "Slim Fit", "Cotton", "Pima", "Everyday", "V-Neck"], nouns: ["T-Shirt", "Polo", "Tee", "Henley"], tags: ["t-shirt", "tshirt", "cotton", "casual", "men", "polo", "solid", "slim fit"], price: [499, 2999], rating: [3.9, 4.6], kind: "apparel" },
  { category: "Shirts", path: ["Fashion", "Mens Clothing", "Shirts"], brands: ["Allen Solly", "Van Heusen", "Peter England", "Louis Philippe", "Arrow", "Raymond", "U.S. Polo Assn."], adjectives: ["Formal", "Slim Fit", "Checked", "Striped", "Cotton", "Linen", "Casual", "Mandarin"], nouns: ["Shirt", "Oxford Shirt", "Dress Shirt", "Casual Shirt"], tags: ["shirt", "formal", "casual", "cotton", "checked", "striped", "men", "office"], price: [799, 3999], rating: [3.9, 4.6], kind: "apparel" },
  { category: "Jeans", path: ["Fashion", "Mens Clothing", "Jeans"], brands: ["Levi's", "Lee", "Wrangler", "Pepe Jeans", "Diesel", "Calvin Klein"], adjectives: ["Slim Fit", "Straight Fit", "Skinny", "Tapered", "Stretch", "Distressed", "Regular"], nouns: ["Jeans", "Denim", "Trousers"], tags: ["jeans", "denim", "slim fit", "men", "casual", "blue", "stretch"], price: [999, 5999], rating: [3.9, 4.6], kind: "apparel" },
  { category: "Dresses", path: ["Fashion", "Womens Clothing", "Dresses"], brands: ["Zara", "H&M", "Biba", "W", "AND", "Only", "Vero Moda"], adjectives: ["Floral", "A-Line", "Maxi", "Midi", "Bodycon", "Wrap", "Party", "Casual"], nouns: ["Dress", "Gown", "Frock"], tags: ["dress", "women", "party", "floral", "maxi", "midi", "casual", "fashion"], price: [899, 4999], rating: [3.9, 4.6], kind: "apparel" },
  { category: "Handbags", path: ["Fashion", "Womens Accessories", "Handbags"], brands: ["Lavie", "Caprese", "Hidesign", "Baggit", "Allen Solly", "Van Heusen"], adjectives: ["Tote", "Sling", "Satchel", "Hobo", "Structured", "Vegan Leather", "Everyday"], nouns: ["Handbag", "Bag", "Tote", "Sling"], tags: ["handbag", "bag", "women", "tote", "sling", "accessories", "fashion"], price: [899, 6999], rating: [3.9, 4.6], kind: "apparel" },
  { category: "Sunglasses", path: ["Accessories", "Sunglasses"], brands: ["Ray-Ban", "Oakley", "Fastrack", "Titan", "Police", "Idee"], adjectives: ["Aviator", "Wayfarer", "Polarized", "Round", "Cat-Eye", "Sport", "Clubmaster"], nouns: ["Sunglasses", "Shades", "Glasses"], tags: ["sunglasses", "shades", "polarized", "uv protection", "aviator", "wayfarer", "accessories"], price: [999, 12999], rating: [4.0, 4.7], kind: "accessory" },
  { category: "Smartphones", path: ["Electronics", "Mobiles", "Smartphones"], brands: ["Apple", "Samsung", "OnePlus", "Xiaomi", "Realme", "Oppo", "Vivo", "Google", "Nothing"], adjectives: ["5G", "Pro", "Ultra", "Lite", "Plus", "Max", "Prime", "Neo"], nouns: ["Phone", "Smartphone", "Mobile"], tags: ["smartphone", "mobile", "5g", "camera", "android", "ios", "battery", "electronics"], price: [9999, 89999], rating: [4.0, 4.8], kind: "electronics" },
  { category: "Wireless Earbuds", path: ["Electronics", "Audio", "Wireless Earbuds"], brands: ["boAt", "JBL", "Sony", "Samsung", "OnePlus", "Nothing", "Realme", "Oppo"], adjectives: ["Noise Cancelling", "True Wireless", "Sport", "Bass", "Compact", "Pro", "Air"], nouns: ["Earbuds", "Buds", "Pods", "Beats"], tags: ["earbuds", "wireless", "audio", "anc", "bluetooth", "battery", "tws", "electronics"], price: [999, 19999], rating: [3.9, 4.7], kind: "electronics" },
  { category: "Headphones", path: ["Electronics", "Audio", "Headphones"], brands: ["Sony", "JBL", "Bose", "Sennheiser", "boAt", "Audio-Technica"], adjectives: ["Noise Cancelling", "Studio", "Wireless", "Over-Ear", "Hi-Res", "Gaming"], nouns: ["Headphones", "Cans", "Monitor"], tags: ["headphones", "over ear", "audio", "anc", "wireless", "studio", "electronics"], price: [1499, 34999], rating: [4.0, 4.8], kind: "electronics" },
  { category: "Laptops", path: ["Electronics", "Computers", "Laptops"], brands: ["Apple", "Dell", "HP", "Lenovo", "Asus", "Acer", "MSI"], adjectives: ["Ultrabook", "Gaming", "Thin & Light", "Business", "Creator", "Touchscreen"], nouns: ["Laptop", "Notebook", "Book"], tags: ["laptop", "notebook", "computer", "ssd", "gaming", "electronics", "windows", "macbook"], price: [32999, 189999], rating: [4.0, 4.7], kind: "electronics" },
  { category: "Smartwatches", path: ["Watches", "Smartwatches"], brands: ["Apple", "Samsung", "Noise", "boAt", "Fire-Boltt", "Amazfit", "Garmin"], adjectives: ["AMOLED", "Bluetooth Calling", "Fitness", "GPS", "Sport", "Classic"], nouns: ["Smartwatch", "Watch"], tags: ["smartwatch", "watch", "fitness", "amoled", "bluetooth calling", "wearable", "electronics"], price: [1499, 49999], rating: [3.9, 4.7], kind: "electronics" },
  { category: "Wrist Watches", path: ["Watches", "Wrist Watches"], brands: ["Titan", "Fastrack", "Fossil", "Casio", "Daniel Wellington", "Rolex", "Rado"], adjectives: ["Chronograph", "Analog", "Leather Strap", "Steel", "Automatic", "Minimal"], nouns: ["Watch", "Chronograph", "Timepiece"], tags: ["watch", "wrist watch", "chronograph", "analog", "leather", "steel", "watches"], price: [1999, 59999], rating: [4.0, 4.8], kind: "accessory" },
  { category: "Perfume", path: ["Beauty", "Fragrances", "Perfume"], brands: ["Armaf", "Davidoff", "Calvin Klein", "Park Avenue", "Wild Stone", "Engage", "Bella Vita"], adjectives: ["Eau de Parfum", "Long Lasting", "Woody", "Fresh", "Citrus", "Oud", "Musk"], nouns: ["Perfume", "Fragrance", "Deo", "Body Spray"], tags: ["perfume", "fragrance", "deodorant", "long lasting", "eau de parfum", "beauty"], price: [299, 4999], rating: [3.9, 4.6], kind: "beauty" },
  { category: "Moisturizer", path: ["Beauty", "Skincare", "Moisturizer"], brands: ["Nivea", "Garnier", "L'Oréal Paris", "Pond's", "Himalaya", "Cetaphil", "Neutrogena"], adjectives: ["Hydrating", "Oil-Free", "SPF", "Night Repair", "Brightening", "Ceramide"], nouns: ["Moisturizer", "Cream", "Gel", "Lotion"], tags: ["moisturizer", "skincare", "cream", "dry skin", "hydrating", "beauty"], price: [199, 1299], rating: [3.9, 4.7], kind: "beauty" },
  { category: "Shampoo", path: ["Beauty", "Haircare", "Shampoo"], brands: ["Head & Shoulders", "Dove", "Tresemmé", "L'Oréal Paris", "Garnier", "Pantene", "Himalaya"], adjectives: ["Anti-Dandruff", "Smooth", "Repair", "Volumizing", "Nourishing", "Scalp Care"], nouns: ["Shampoo", "Cleanser"], tags: ["shampoo", "hair", "haircare", "anti dandruff", "smooth", "beauty"], price: [149, 799], rating: [3.9, 4.6], kind: "beauty" },
  { category: "Lipstick", path: ["Beauty", "Makeup", "Lipstick"], brands: ["Maybelline", "Lakmé", "L'Oréal Paris", "MAC", "Colorbar", "Nykaa"], adjectives: ["Matte", "Liquid", "Satin", "Long Stay", "Transfer-Proof", "Nude"], nouns: ["Lipstick", "Lip Color", "Lip Crayon"], tags: ["lipstick", "makeup", "lip color", "matte", "long stay", "beauty"], price: [199, 1999], rating: [3.9, 4.7], kind: "beauty" },
  { category: "Sunscreen", path: ["Beauty", "Skincare", "Sunscreen"], brands: ["Neutrogena", "Aqualogica", "Dot & Key", "Mamaearth", "The Derma Co", "Lakmé"], adjectives: ["SPF 50", "Gel", "Matte", "No White Cast", "Mineral", "Water Resistant"], nouns: ["Sunscreen", "Sunblock", "Gel"], tags: ["sunscreen", "spf", "skincare", "sun protection", "gel", "beauty"], price: [199, 1499], rating: [4.0, 4.7], kind: "beauty" },
  { category: "Cookware", path: ["Home", "Kitchen", "Cookware"], brands: ["Prestige", "Hawkins", "Pigeon", "Cello", "Borosil", "Wonderchef"], adjectives: ["Non-Stick", "Hard Anodized", "Induction", "Stainless Steel", "Granite", "Ceramic"], nouns: ["Kadai", "Pan", "Cookware Set", "Tawa", "Pressure Cooker"], tags: ["cookware", "kitchen", "non stick", "induction", "pan", "home"], price: [499, 6999], rating: [3.9, 4.6], kind: "home" },
  { category: "Kitchen Appliances", path: ["Home", "Kitchen", "Appliances"], brands: ["Philips", "Prestige", "Havells", "Bajaj", "Pigeon", "Milton"], adjectives: ["Mixer Grinder", "Air Fryer", "Electric Kettle", "Toaster", "Induction", "Iron"], nouns: ["Appliance", "Mixer", "Kettle", "Fryer"], tags: ["kitchen appliance", "mixer grinder", "air fryer", "kettle", "home", "kitchen"], price: [999, 14999], rating: [3.9, 4.6], kind: "home" },
  { category: "Sports Accessories", path: ["Sports", "Fitness"], brands: ["Nike", "Adidas", "Puma", "Yonex", "Cosco", "Nivia"], adjectives: ["Gym", "Yoga", "Training", "Football", "Cricket", "Running"], nouns: ["Dumbbell", "Yoga Mat", "Ball", "Racket", "Skipping Rope", "Gloves"], tags: ["sports", "fitness", "gym", "yoga", "training", "accessories"], price: [299, 5999], rating: [3.9, 4.6], kind: "sport" },
];

function attrsFor(kind, r) {
  const color = pick(r, COLORS);
  switch (kind) {
    case "footwear":
      return { material: pick(r, ["Mesh", "Leather", "Synthetic"]), colour: color, size: pick(r, ["UK6", "UK7", "UK8", "UK9", "UK10"]), sole: pick(r, ["Rubber", "EVA", "Foam"]) };
    case "apparel":
      return { material: pick(r, MATERIALS), colour: color, fit: pick(r, ["Slim Fit", "Regular Fit", "Relaxed"]), care: "Machine wash" };
    case "electronics":
      return { colour: color, warranty: pick(r, ["6 months", "1 year", "2 years"]), connectivity: pick(r, ["Bluetooth 5.3", "Wi-Fi", "USB-C", "5G"]) };
    case "beauty":
      return { type: pick(r, ["All Skin Types", "Dry Skin", "Oily Skin", "Normal"]), volume: pick(r, ["50 ml", "100 ml", "200 ml"]), country_of_origin: pick(r, ["India", "France", "USA"]) };
    case "home":
      return { material: pick(r, ["Stainless Steel", "Aluminium", "Glass", "Plastic"]), colour: color, warranty: pick(r, ["1 year", "2 years"]) };
    case "sport":
      return { material: pick(r, ["Rubber", "Foam", "Nylon"]), colour: color, ideal_for: pick(r, ["Home Gym", "Outdoor", "Training"]) };
    case "accessory":
      return { colour: color, material: pick(r, ["Metal", "Leather", "Acetate"]), warranty: "1 year" };
    default:
      return { colour: color };
  }
}

function descFor(kind, brand, category, a) {
  switch (kind) {
    case "footwear":
      return `${brand} ${category} with a ${a.material} upper, ${a.sole} sole and a comfortable ${a.size} fit.`;
    case "apparel":
      return `${brand} ${category} in ${a.material} (${a.colour}), ${a.fit} — an everyday wardrobe staple.`;
    case "electronics":
      return `${brand} ${category} with ${a.connectivity} connectivity, ${a.colour} finish and ${a.warranty} warranty.`;
    case "beauty":
      return `${brand} ${category} for ${a.type}, ${a.volume} pack.`;
    case "home":
      return `${brand} ${category} in durable ${a.material} (${a.colour}) with ${a.warranty} warranty.`;
    case "sport":
      return `${brand} ${category} made from ${a.material}, ideal for ${a.ideal_for}.`;
    default:
      return `${brand} ${category} in ${a.colour}.`;
  }
}

function generateExtra(seed = 424242) {
  const r = mulberry32(seed);
  const products = [];
  let n = 1;
  for (const t of TYPES) {
    const count = 8 + Math.floor(r() * 4); // 8–11 per type
    for (let i = 0; i < count; i++) {
      const brand = t.brands[i % t.brands.length];
      const adj = pick(r, t.adjectives);
      const noun = pick(r, t.nouns);
      const price = Math.round((t.price[0] + r() * (t.price[1] - t.price[0])) / 10) * 10;
      const mrp = Math.round((price * (1.1 + r() * 0.5)) / 10) * 10;
      const rating = Math.round((t.rating[0] + r() * (t.rating[1] - t.rating[0])) * 10) / 10;
      const ratingCount = Math.round(200 + r() * 8000);
      const attrs = attrsFor(t.kind, r);
      const tags = [...t.tags];
      products.push({
        id: "x_" + n++,
        title: `${brand} ${adj} ${noun}`,
        brand,
        category: t.category,
        categoryPath: t.path,
        price,
        mrp,
        currency: "INR",
        rating,
        ratingCount,
        description: descFor(t.kind, brand, t.category, attrs),
        attributes: attrs,
        tags: Array.from(new Set(tags)),
        inStock: r() > 0.05,
        source: "ShopSense",
      });
    }
  }
  return attachOffers(products, 4242);
}

function main() {
  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const products = generateExtra();
  const outFile = path.join(outDir, "extra-products.json");
  fs.writeFileSync(outFile, JSON.stringify(products, null, 2));
  console.log(`Generated ${products.length} extra branded products -> ${outFile}`);
}

module.exports = { generateExtra, TYPES };

if (require.main === module) main();
