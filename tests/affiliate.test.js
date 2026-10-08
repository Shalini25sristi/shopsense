"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { applyTracking, resolveProductUrl } = require("../src/affiliate/affiliate");

test("applyTracking adds the configured affiliate tag", () => {
  process.env.AFFILIATE_AMAZON_TAG = "mytag-21";
  const out = applyTracking("amazon", "https://www.amazon.in/s?k=shoes");
  assert.match(out, /tag=mytag-21/);
  delete process.env.AFFILIATE_AMAZON_TAG;
});

test("applyTracking does not overwrite an existing tag", () => {
  process.env.AFFILIATE_AMAZON_TAG = "mytag-21";
  const out = applyTracking("amazon", "https://www.amazon.in/s?k=shoes&tag=existing-21");
  assert.match(out, /tag=existing-21/);
  assert.ok(!out.includes("mytag-21"));
  delete process.env.AFFILIATE_AMAZON_TAG;
});

test("resolveProductUrl is a no-op without a configured resolver", async () => {
  delete process.env.AFFILIATE_RESOLVER_URL;
  assert.equal(await resolveProductUrl("amazon", { brand: "X", title: "Y" }), null);
});

test("resolveProductUrl calls the resolver, tracks and validates the host", async () => {
  process.env.AFFILIATE_RESOLVER_URL = "https://resolver.test/lookup";
  process.env.AFFILIATE_AMAZON_TAG = "mytag-21";

  const fake = async (url, opts) => {
    assert.equal(url, "https://resolver.test/lookup");
    assert.equal(JSON.parse(opts.body).merchant, "amazon");
    return { ok: true, json: async () => ({ url: "https://www.amazon.in/dp/B0TEST" }) };
  };
  const out = await resolveProductUrl("amazon", { brand: "X", title: "Y" }, fake);
  assert.ok(out.startsWith("https://www.amazon.in/dp/B0TEST"));
  assert.match(out, /tag=mytag-21/);

  const evil = async () => ({ ok: true, json: async () => ({ url: "https://evil.example.com/x" }) });
  assert.equal(await resolveProductUrl("amazon", { brand: "X", title: "Y" }, evil), null);

  delete process.env.AFFILIATE_RESOLVER_URL;
  delete process.env.AFFILIATE_AMAZON_TAG;
});
