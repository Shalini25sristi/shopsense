"use strict";
/** Shared HTTP helpers for the JSON API. */

function sendJSON(res, status, body, extraHeaders = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Access-Control-Allow-Origin": "*",
    ...extraHeaders,
  });
  res.end(data);
}

function sendError(res, status, message, extra = {}) {
  return sendJSON(res, status, { error: message, ...extra });
}

/** Read and parse a JSON request body (max 1 MB by default). */
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

module.exports = { sendJSON, sendError, readBody };
