"use strict";
/** Shopping-cart endpoints (all require authentication). */
const { sendJSON, sendError, readBody } = require("./http");

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Materialise the cart with product documents and totals. */
function buildCart(store, repo, userId) {
  const rows = repo.cart.list(userId);
  const items = [];
  let subtotal = 0;
  let itemCount = 0;
  let currency = "INR";
  for (const row of rows) {
    const product = store.search.product(row.productId);
    if (!product) continue;
    const lineTotal = round2((product.price || 0) * row.quantity);
    subtotal += lineTotal;
    itemCount += row.quantity;
    currency = product.currency || currency;
    items.push({ product, quantity: row.quantity, lineTotal, addedAt: row.addedAt });
  }
  return { userId, items, itemCount, subtotal: round2(subtotal), currency };
}

/**
 * @returns {Promise<boolean>} true when the request matched a cart route.
 */
async function handle(req, res, url, ctx) {
  const { pathname } = url;
  const method = req.method.toUpperCase();
  if (!pathname.startsWith("/api/cart")) return false;
  if (!ctx.user) return sendError(res, 401, "authentication required");

  const itemMatch = pathname.match(/^\/api\/cart\/([^/]+)$/);

  // GET /api/cart
  if (pathname === "/api/cart" && method === "GET") {
    return sendJSON(res, 200, buildCart(ctx.store, ctx.repo, ctx.user.id));
  }

  // POST /api/cart  { productId, quantity }
  if (pathname === "/api/cart" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const productId = String(body.productId || "");
    const quantity = body.quantity == null ? 1 : Number(body.quantity);
    if (!productId) return sendError(res, 400, "productId is required");
    if (!Number.isInteger(quantity) || quantity < 1) return sendError(res, 400, "quantity must be a positive integer");
    const product = ctx.store.search.product(productId);
    if (!product) return sendError(res, 404, "product not found");
    ctx.repo.cart.add(ctx.user.id, productId, quantity);
    ctx.repo.events.insert({ userId: ctx.user.id, productId, type: "cart" });
    return sendJSON(res, 201, buildCart(ctx.store, ctx.repo, ctx.user.id));
  }

  // DELETE /api/cart  (clear)
  if (pathname === "/api/cart" && method === "DELETE") {
    ctx.repo.cart.clear(ctx.user.id);
    return sendJSON(res, 200, buildCart(ctx.store, ctx.repo, ctx.user.id));
  }

  // PATCH /api/cart/:productId  { quantity }
  if (itemMatch && method === "PATCH") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const productId = decodeURIComponent(itemMatch[1]);
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) return sendError(res, 400, "quantity must be a non-negative integer");
    if (quantity === 0) {
      ctx.repo.cart.remove(ctx.user.id, productId);
    } else if (!ctx.repo.cart.setQuantity(ctx.user.id, productId, quantity)) {
      return sendError(res, 404, "item not in cart");
    }
    return sendJSON(res, 200, buildCart(ctx.store, ctx.repo, ctx.user.id));
  }

  // DELETE /api/cart/:productId
  if (itemMatch && method === "DELETE") {
    const productId = decodeURIComponent(itemMatch[1]);
    if (!ctx.repo.cart.remove(ctx.user.id, productId)) return sendError(res, 404, "item not in cart");
    return sendJSON(res, 200, buildCart(ctx.store, ctx.repo, ctx.user.id));
  }

  return false;
}

module.exports = { handle, buildCart };
