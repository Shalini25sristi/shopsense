"use strict";
/** REST API handlers. */
const { productImageSVG } = require("../media/productImage");
const { productSpecs } = require("../catalog/productSpecs");
const { productReviews } = require("../catalog/productReviews");
const { buildHome } = require("../catalog/home");
const { sendJSON, readBody } = require("./http");
const { authenticate } = require("../auth/auth");
const authRoutes = require("./authRoutes");
const cartRoutes = require("./cartRoutes");
const orderRoutes = require("./orderRoutes");
const adminRoutes = require("./adminRoutes");
const wishlistRoutes = require("./wishlistRoutes");

function categories(store) {
  const map = new Map();
  for (const p of store.products) {
    if (!map.has(p.category)) {
      map.set(p.category, { category: p.category, path: p.categoryPath, count: 0, brands: new Set() });
    }
    const c = map.get(p.category);
    c.count++;
    c.brands.add(p.brand);
  }
  return Array.from(map.values()).map((c) => ({
    category: c.category,
    path: c.path,
    count: c.count,
    brands: Array.from(c.brands).sort(),
  }));
}

async function handleApi(req, res, url, store) {
  const { pathname, searchParams } = url;
  const method = req.method.toUpperCase();

  const ctx = {
    store,
    db: store.db,
    repo: store.repo,
    user: store.db ? authenticate(req, store.db) : null,
  };

  // --- Auth / cart / orders / admin sub-routers ------------------------------
  // Handlers return false only when the route did not match; anything else
  // (including undefined after sending a response) means it was handled.
  for (const router of [authRoutes, cartRoutes, orderRoutes, adminRoutes, wishlistRoutes]) {
    if ((await router.handle(req, res, url, ctx)) !== false) return;
  }

  // GET /api/health
  if (pathname === "/api/health" && method === "GET") {
    return sendJSON(res, 200, { ok: true, uptime: process.uptime(), products: store.products.length });
  }

  // GET /api/categories
  if (pathname === "/api/categories" && method === "GET") {
    return sendJSON(res, 200, { categories: categories(store) });
  }

  // GET /api/home  (featured brands + category shelves)
  if (pathname === "/api/home" && method === "GET") {
    const limit = Number(searchParams.get("limit")) || 10;
    const perCategory = Number(searchParams.get("perCategory")) || 5;
    return sendJSON(res, 200, buildHome(store, { featuredLimit: limit, perCategory }));
  }

  // GET /api/users  (registered customers only; generated demo accounts are hidden)
  if (pathname === "/api/users" && method === "GET") {
    return sendJSON(res, 200, {
      users: store.users
        .filter((u) => !u.isSeed && u.role !== "admin")
        .map((u) => ({ id: u.id, name: u.name, coldStart: !!u.coldStart, preferences: u.preferences })),
    });
  }

  // GET /api/search
  if (pathname === "/api/search" && method === "GET") {
    const params = Object.fromEntries(searchParams.entries());
    const result = store.search.search(params);
    store.recordSearch(result.query, result.total, params.clickedId || null);
    if (ctx.user && result.query) store.repo.searchHistory.add(ctx.user.id, result.query, result.total);
    return sendJSON(res, 200, result);
  }

  // GET /api/search/suggest?q=
  if (pathname === "/api/search/suggest" && method === "GET") {
    const q = searchParams.get("q") || "";
    const limit = Number(searchParams.get("limit")) || 8;
    return sendJSON(res, 200, { query: q, suggestions: store.search.suggest(q, limit) });
  }

  // GET /api/images/:id.svg  -> deterministic product illustration
  const imgMatch = pathname.match(/^\/api\/images\/([^/]+)\.svg$/);
  if (imgMatch && method === "GET") {
    const product = store.search.product(decodeURIComponent(imgMatch[1]));
    if (!product) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const svg = productImageSVG(product);
    res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" });
    return res.end(svg);
  }

  // GET /api/products/:id  and sub-resources
  const productMatch = pathname.match(/^\/api\/products\/([^/]+)(?:\/(similar|recommendations|prices|specs|reviews))?$/);
  if (productMatch && method === "GET") {
    const id = decodeURIComponent(productMatch[1]);
    const sub = productMatch[2];
    const product = store.search.product(id);
    if (!product) return sendJSON(res, 404, { error: "Product not found" });
    const limit = Number(searchParams.get("limit")) || 6;
    const offers = (product.offers || []).slice().sort((a, b) => a.price - b.price);
    if (sub === "prices") {
      return sendJSON(res, 200, {
        product: { id: product.id, title: product.title, currency: product.currency },
        stores: offers.length,
        lowest: offers[0] || null,
        offers,
      });
    }
    if (sub === "specs") {
      return sendJSON(res, 200, { product: { id: product.id, title: product.title }, specs: productSpecs(product) });
    }
    if (sub === "reviews") {
      const reviews = productReviews(product, {
        limit: Number(searchParams.get("limit")) || 10,
        source: searchParams.get("source"),
        minRating: Number(searchParams.get("minRating")) || 0,
        sort: searchParams.get("sort") || "recent",
      });
      return sendJSON(res, 200, { product: { id: product.id, title: product.title }, ...reviews });
    }
    if (sub === "similar") {
      return sendJSON(res, 200, { product, items: store.recs.similar(id, limit) });
    }
    if (sub === "recommendations") {
      return sendJSON(res, 200, { product, items: store.recs.alsoViewed(id, limit) });
    }
    return sendJSON(res, 200, {
      product,
      specs: productSpecs(product),
      offers,
      lowest: offers[0] || null,
      stores: offers.length,
      reviews: productReviews(product, { limit: 6 }),
      similar: store.recs.similar(id, 6),
      alsoViewed: store.recs.alsoViewed(id, 6),
      rankedIn: store.curatedLists
        .filter((l) => l.items.some((it) => it.product.id === id))
        .map((l) => ({ id: l.id, title: l.title, rank: l.items.find((it) => it.product.id === id).rank })),
    });
  }

  // GET /api/recommendations/trending
  if (pathname === "/api/recommendations/trending" && method === "GET") {
    const category = searchParams.get("category") || null;
    const limit = Number(searchParams.get("limit")) || 12;
    return sendJSON(res, 200, { items: store.recs.trending({ category, limit }) });
  }

  // GET /api/recommendations?userId=
  if (pathname === "/api/recommendations" && method === "GET") {
    const userId = (ctx.user && ctx.user.id) || searchParams.get("userId") || null;
    const limit = Number(searchParams.get("limit")) || 10;
    if (!userId) {
      return sendJSON(res, 200, {
        strategy: "trending",
        items: store.recs.trending({ limit }),
      });
    }
    const user = store.users.find((u) => u.id === userId);
    const cold = !user || user.coldStart;
    const history = store.repo ? store.repo.searchHistory.recent(userId, 10) : [];
    const items = store.recs.forUser(userId, { limit, queries: history.map((h) => h.query) });
    const strategy = history.length && cold ? "search-based" : cold ? "cold-start" : "hybrid";
    return sendJSON(res, 200, {
      strategy,
      user: user ? { id: user.id, name: user.name } : null,
      basedOn: history.map((h) => h.query),
      items,
    });
  }

  // GET /api/curated-lists
  if (pathname === "/api/curated-lists" && method === "GET") {
    const category = searchParams.get("category");
    let lists = store.curatedLists;
    if (category) lists = lists.filter((l) => l.category === category);
    return sendJSON(res, 200, {
      lists: lists.map((l) => ({
        id: l.id,
        title: l.title,
        category: l.category,
        intro: l.intro,
        count: l.items.length,
      })),
    });
  }

  // GET /api/curated-lists/:id
  const listMatch = pathname.match(/^\/api\/curated-lists\/([^/]+)$/);
  if (listMatch && method === "GET") {
    const list = store.curatedById.get(decodeURIComponent(listMatch[1]));
    if (!list) return sendJSON(res, 404, { error: "List not found" });
    return sendJSON(res, 200, list);
  }

  // GET /api/me/wishlist is handled by wishlistRoutes (token-authenticated).

  // GET /api/stats
  if (pathname === "/api/stats" && method === "GET") {
    return sendJSON(res, 200, store.analytics());
  }

  // POST /api/events
  if (pathname === "/api/events" && method === "POST") {
    try {
      const body = await readBody(req);
      const record = store.recordEvent(body);
      return sendJSON(res, 202, { ok: true, event: record });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  // POST /api/ratings
  if (pathname === "/api/ratings" && method === "POST") {
    try {
      const body = await readBody(req);
      if (!body.productId || body.value == null) {
        return sendJSON(res, 400, { error: "productId and value required" });
      }
      store.recordEvent({ productId: body.productId, userId: body.userId, type: "rating" });
      return sendJSON(res, 201, { ok: true, rating: { productId: body.productId, value: Number(body.value) } });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  return sendJSON(res, 404, { error: "Not found", path: pathname });
}

module.exports = { handleApi, sendJSON };
