"use strict";
/** Wishlist endpoints (token-authenticated, persisted per user). */
const { sendJSON, sendError, readBody } = require("./http");

function buildWishlist(store, repo, userId) {
  const rows = repo.wishlist.list(userId);
  const items = rows.map((r) => store.search.product(r.productId)).filter(Boolean);
  return { userId, count: items.length, ids: items.map((p) => p.id), items };
}

/**
 * @returns {Promise<boolean>} true when the request matched a wishlist route.
 */
async function handle(req, res, url, ctx) {
  const { pathname } = url;
  const method = req.method.toUpperCase();
  if (!pathname.startsWith("/api/wishlist") && pathname !== "/api/me/wishlist") return false;
  if (!ctx.user) return sendError(res, 401, "authentication required");

  const itemMatch = pathname.match(/^\/api\/wishlist\/([^/]+)$/);

  if ((pathname === "/api/wishlist" || pathname === "/api/me/wishlist") && method === "GET") {
    return sendJSON(res, 200, buildWishlist(ctx.store, ctx.repo, ctx.user.id));
  }

  if (pathname === "/api/wishlist" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const productId = String(body.productId || "");
    if (!productId) return sendError(res, 400, "productId is required");
    const product = ctx.store.search.product(productId);
    if (!product) return sendError(res, 404, "product not found");
    ctx.repo.wishlist.add(ctx.user.id, productId);
    ctx.repo.events.insert({ userId: ctx.user.id, productId, type: "wishlist" });
    return sendJSON(res, 201, { ok: true, item: product, ids: ctx.repo.wishlist.ids(ctx.user.id) });
  }

  if (itemMatch && method === "DELETE") {
    const productId = decodeURIComponent(itemMatch[1]);
    ctx.repo.wishlist.remove(ctx.user.id, productId);
    return sendJSON(res, 200, { ok: true, ids: ctx.repo.wishlist.ids(ctx.user.id) });
  }

  return false;
}

module.exports = { handle, buildWishlist };
