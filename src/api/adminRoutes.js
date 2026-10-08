"use strict";
/** Admin endpoints: product CRUD, catalogue import, user/order listing, analytics. */
const crypto = require("crypto");
const { sendJSON, sendError, readBody } = require("./http");
const { publicUser } = require("../auth/auth");
const { materialise } = require("./orderRoutes");

function newProductId() {
  return "p_" + crypto.randomBytes(5).toString("hex");
}

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

function normaliseProduct(body, existing = null) {
  const p = { ...(existing || {}), ...body };
  p.id = body.id || (existing && existing.id) || newProductId();
  p.title = String(p.title || "").trim();
  p.price = Number(p.price);
  p.mrp = p.mrp == null ? p.price : Number(p.mrp);
  p.rating = p.rating == null ? 0 : Number(p.rating);
  p.ratingCount = p.ratingCount == null ? 0 : Number(p.ratingCount);
  p.currency = p.currency || "INR";
  p.brand = p.brand || "Generic";
  p.category = p.category || "Uncategorised";
  p.categoryPath = Array.isArray(p.categoryPath) ? p.categoryPath : [p.category];
  p.tags = Array.isArray(p.tags) ? p.tags : [];
  p.offers = Array.isArray(p.offers) ? p.offers : [];
  p.images = Array.isArray(p.images) ? p.images : [];
  p.inStock = p.inStock !== false;
  return p;
}

function validateProduct(p) {
  if (!p.title) return "title is required";
  if (!Number.isFinite(p.price) || p.price < 0) return "price must be a non-negative number";
  return null;
}

/**
 * @returns {Promise<boolean>} true when the request matched an admin route.
 */
async function handle(req, res, url, ctx) {
  const { pathname, searchParams } = url;
  const method = req.method.toUpperCase();
  if (!pathname.startsWith("/api/admin")) return false;
  if (!ctx.user) return sendError(res, 401, "authentication required");
  if (ctx.user.role !== "admin") return sendError(res, 403, "admin access required");

  const productMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  const orderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);

  // GET /api/admin/products
  if (pathname === "/api/admin/products" && method === "GET") {
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
    const offset = Number(searchParams.get("offset")) || 0;
    const q = (searchParams.get("q") || "").toLowerCase();
    let products = ctx.repo.products.all();
    if (q) {
      products = products.filter(
        (p) => p.title.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q)
      );
    }
    return sendJSON(res, 200, { total: products.length, limit, offset, products: products.slice(offset, offset + limit) });
  }

  // POST /api/admin/products
  if (pathname === "/api/admin/products" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const product = normaliseProduct(body);
    const problem = validateProduct(product);
    if (problem) return sendError(res, 400, problem);
    if (ctx.repo.products.get(product.id)) return sendError(res, 409, "product id already exists");
    ctx.repo.products.save(product);
    ctx.store.reloadProducts();
    return sendJSON(res, 201, { product });
  }

  // PUT /api/admin/products/:id
  if (productMatch && method === "PUT") {
    const id = decodeURIComponent(productMatch[1]);
    const existing = ctx.repo.products.get(id);
    if (!existing) return sendError(res, 404, "product not found");
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const product = normaliseProduct({ ...body, id }, existing);
    const problem = validateProduct(product);
    if (problem) return sendError(res, 400, problem);
    ctx.repo.products.save(product);
    ctx.store.reloadProducts();
    return sendJSON(res, 200, { product });
  }

  // DELETE /api/admin/products/:id
  if (productMatch && method === "DELETE") {
    const id = decodeURIComponent(productMatch[1]);
    const removed = ctx.repo.products.remove(id);
    if (!removed) return sendError(res, 404, "product not found");
    ctx.store.reloadProducts();
    return sendJSON(res, 200, { ok: true, id });
  }

  // POST /api/admin/catalog/import
  if (pathname === "/api/admin/catalog/import" && method === "POST") {
    let body;
    try {
      body = await readBody(req, 5e6);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    let products;
    if (Array.isArray(body.products)) {
      products = body.products.map((p) => normaliseProduct(p));
    } else {
      const { generateCatalog } = require("../../scripts/generate-catalog");
      products = generateCatalog();
    }
    const invalid = products.find((p) => validateProduct(p));
    if (invalid) return sendError(res, 400, `invalid product: ${validateProduct(invalid)}`);
    const count = ctx.repo.products.saveMany(products);
    ctx.store.reloadProducts();
    return sendJSON(res, 200, { ok: true, imported: count, total: ctx.repo.products.count() });
  }

  // GET /api/admin/users
  if (pathname === "/api/admin/users" && method === "GET") {
    return sendJSON(res, 200, { users: ctx.repo.users.listReal().map(publicUser) });
  }

  // GET /api/admin/orders
  if (pathname === "/api/admin/orders" && method === "GET") {
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    return sendJSON(res, 200, { orders: ctx.repo.orders.listAll(limit).map((r) => materialise(ctx.repo, r)) });
  }

  // PATCH /api/admin/orders/:id  { status }
  if (orderMatch && method === "PATCH") {
    const id = decodeURIComponent(orderMatch[1]);
    if (!ctx.repo.orders.get(id)) return sendError(res, 404, "order not found");
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const status = String(body.status || "");
    if (!ORDER_STATUSES.includes(status)) return sendError(res, 400, `status must be one of: ${ORDER_STATUSES.join(", ")}`);
    ctx.repo.orders.updateStatus(id, status);
    return sendJSON(res, 200, { order: materialise(ctx.repo, ctx.repo.orders.get(id)) });
  }

  // GET /api/admin/analytics
  if (pathname === "/api/admin/analytics" && method === "GET") {
    const orders = ctx.repo.orders.listAll(500);
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    return sendJSON(res, 200, {
      catalogue: {
        products: ctx.repo.products.count(),
        search: ctx.store.search.stats(),
        recommender: ctx.store.recs.stats(),
      },
      users: ctx.repo.users.realCount(),
      interactions: ctx.repo.interactions.count(),
      orders: {
        total: orders.length,
        revenue: Math.round(revenue * 100) / 100,
        byStatus: orders.reduce((acc, o) => {
          acc[o.status] = (acc[o.status] || 0) + 1;
          return acc;
        }, {}),
      },
      events: ctx.repo.events.count(),
      topProducts: ctx.repo.events.popularProducts(10),
      search: {
        total: ctx.repo.searchLogs.count(),
        zeroResult: ctx.repo.searchLogs.zeroResultCount(),
        topQueries: ctx.repo.searchLogs.topQueries(10),
      },
    });
  }

  return false;
}

module.exports = { handle };
