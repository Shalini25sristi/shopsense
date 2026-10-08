"use strict";
/**
 * Authentication primitives: password hashing (scrypt) and stateless JWT (HS256).
 * Implemented with node:crypto only, so the project keeps zero runtime dependencies.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const SECRET_FILE = path.join(DATA_DIR, ".jwt-secret");
const DEFAULT_TTL = 60 * 60 * 24 * 7; // 7 days

let cachedSecret = null;

/** Resolve the signing secret from env, or a generated file cached in data/. */
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (cachedSecret) return cachedSecret;
  try {
    cachedSecret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  } catch {
    cachedSecret = "";
  }
  if (!cachedSecret) {
    cachedSecret = crypto.randomBytes(48).toString("hex");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

/** Hash a plaintext password as `scrypt$<salt>$<derivedKey>`. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

/** Constant-time verification of a password against a stored hash. */
function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const expected = Buffer.from(hash, "hex");
  let derived;
  try {
    derived = crypto.scryptSync(String(password), salt, expected.length);
  } catch {
    return false;
  }
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

/** Sign a JWT for the given subject (user id) and optional claims. */
function signToken(subject, claims = {}, { expiresIn = DEFAULT_TTL } = {}) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: subject, ...claims, iat: now, exp: now + expiresIn };
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** Verify a JWT and return its payload, or null when invalid/expired. */
function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac("sha256", getSecret()).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** Extract a bearer token from an Authorization header. */
function bearerToken(req) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match ? match[1] : null;
}

/** Public (safe) view of a user row, never exposing the password hash. */
function publicUser(row) {
  if (!row) return null;
  let preferences = null;
  try {
    preferences = row.preferences ? JSON.parse(row.preferences) : null;
  } catch {
    preferences = null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    role: row.role || "user",
    phone: row.phone || null,
    profession: row.profession || null,
    coldStart: !!row.cold_start,
    preferences,
    createdAt: row.created_at || null,
  };
}

/** Resolve the authenticated user from a request, or null. */
function authenticate(req, db) {
  const token = bearerToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || !payload.sub) return null;
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  return row ? publicUser(row) : null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  bearerToken,
  publicUser,
  authenticate,
  DEFAULT_TTL,
};
