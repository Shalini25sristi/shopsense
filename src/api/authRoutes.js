"use strict";
/** Authentication endpoints: register, login and current-user. */
const crypto = require("crypto");
const { sendJSON, sendError, readBody } = require("./http");
const { hashPassword, verifyPassword, signToken, publicUser } = require("../auth/auth");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newUserId() {
  return "u_" + crypto.randomBytes(6).toString("hex");
}

/**
 * @returns {Promise<boolean>} true when the request matched an auth route.
 */
async function handle(req, res, url, ctx) {
  const { pathname } = url;
  const method = req.method.toUpperCase();

  if (pathname === "/api/auth/register" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim();
    const profession = String(body.profession || "").trim();
    if (name.length < 2) return sendError(res, 400, "name must be at least 2 characters");
    if (!EMAIL_RE.test(email)) return sendError(res, 400, "a valid email is required");
    if (password.length < 6) return sendError(res, 400, "password must be at least 6 characters");
    if (phone && !/^[+]?[\d\s-]{7,15}$/.test(phone)) return sendError(res, 400, "phone number looks invalid");
    if (ctx.repo.users.getByEmail(email)) return sendError(res, 409, "email already registered");

    const user = ctx.repo.users.insert({
      id: newUserId(),
      name,
      email,
      passwordHash: hashPassword(password),
      role: "user",
      phone: phone || null,
      profession: profession || null,
      coldStart: true,
      preferences: null,
      isSeed: false,
    });
    const created = publicUser(user);
    ctx.store.addUser(created);
    const token = signToken(created.id, { role: created.role });
    return sendJSON(res, 201, { token, user: created });
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const row = ctx.repo.users.getByEmail(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return sendError(res, 401, "invalid email or password");
    }
    const token = signToken(row.id, { role: row.role });
    return sendJSON(res, 200, { token, user: publicUser(row) });
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    if (!ctx.user) return sendError(res, 401, "authentication required");
    return sendJSON(res, 200, { user: ctx.user });
  }

  return false;
}

module.exports = { handle };
