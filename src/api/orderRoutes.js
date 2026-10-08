"use strict";
/** Order endpoints: checkout from the cart, list and fetch orders. */
const crypto = require("crypto");
const { sendJSON, sendError } = require("./http");
const { buildCart } = require("./cartRoutes");

function round2(n) {
  return Math.round(n * 100) / 100;
}

function materialise(repo, row) {
  const items = repo.orders.items(row.id).map((it) => ({
    productId: it.product_id,
    title: it.title,
    price: it.price,
    quantity: it.quantity,
    lineTotal: round2((it.price || 0) * it.quantity),
  }));
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    total: row.total,
    currency: row.currency,
    itemCount: row.item_count,
    createdAt: row.created_at,
    items,
  };
}

/**
 * @returns {Promise<boolean>} true when the request matched an order route.
 */
async function handle(req, res, url, ctx) {
  const { pathname } = url;
  const method = req.method.toUpperCase();
  if (!pathname.startsWith("/api/orders")) return false;
  if (!ctx.user) return sendError(res, 401, "authentication required");

  const idMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);

  // POST /api/orders  (checkout the current cart)
  if (pathname === "/api/orders" && method === "POST") {
    const cart = buildCart(ctx.store, ctx.repo, ctx.user.id);
    if (cart.items.length === 0) return sendError(res, 400, "cart is empty");
    const order = {
      id: "ord_" + crypto.randomBytes(6).toString("hex"),
      userId: ctx.user.id,
      status: "confirmed",
      total: cart.subtotal,
      currency: cart.currency,
      itemCount: cart.itemCount,
      createdAt: new Date().toISOString(),
    };
    ctx.repo.orders.create(
      order,
      cart.items.map((it) => ({
        productId: it.product.id,
        title: it.product.title,
        price: it.product.price,
        quantity: it.quantity,
      }))
    );
    for (const it of cart.items) {
      ctx.repo.interactions.insert({ userId: ctx.user.id, productId: it.product.id, type: "purchase" });
      ctx.repo.events.insert({ userId: ctx.user.id, productId: it.product.id, type: "purchase" });
    }
    ctx.repo.cart.clear(ctx.user.id);
    return sendJSON(res, 201, { order: materialise(ctx.repo, ctx.repo.orders.get(order.id)) });
  }

  // GET /api/orders
  if (pathname === "/api/orders" && method === "GET") {
    const rows = ctx.repo.orders.listByUser(ctx.user.id);
    return sendJSON(res, 200, { orders: rows.map((r) => materialise(ctx.repo, r)) });
  }

  // GET /api/orders/:id
  if (idMatch && method === "GET") {
    const row = ctx.repo.orders.get(decodeURIComponent(idMatch[1]));
    if (!row) return sendError(res, 404, "order not found");
    if (row.user_id !== ctx.user.id && ctx.user.role !== "admin") {
      return sendError(res, 403, "not allowed to view this order");
    }
    return sendJSON(res, 200, { order: materialise(ctx.repo, row) });
  }

  return false;
}

module.exports = { handle, materialise };
