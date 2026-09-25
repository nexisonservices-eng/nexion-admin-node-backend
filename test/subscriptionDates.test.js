const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const run = async (body, subscription, id = "123456789012345678901234") => {
  let saved = false;
  const context = { module: { exports: {} }, require: (name) => {
    if (name === "mongoose") return { Types: { ObjectId: { isValid: (value) => /^[a-f0-9]{24}$/.test(value) } } };
    if (name === "../model/subscription") return { findById: async () => subscription && { ...subscription, save: async () => { saved = true; } } };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controller/billingController.js"), "utf8"), context);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  await context.module.exports.updateSubscriptionDates({ body, params: { id }, app: { get: () => null } }, res);
  return { res, saved };
};

test("rejects missing, invalid and reversed dates without saving", async () => {
  for (const body of [{}, { startsAt: null, endsAt: null }, { startsAt: "bad", endsAt: "2030-01-01" }, { startsAt: "2030-02-01", endsAt: "2030-01-01" }]) {
    const { res, saved } = await run(body, {});
    assert.equal(res.code, 400);
    assert.equal(saved, false);
  }
});

test("handles missing subscriptions and invalid identifiers", async () => {
  const body = { startsAt: "2030-01-01", endsAt: "2030-02-01" };
  assert.equal((await run(body, null)).res.code, 404);
  assert.equal((await run(body, {}, "invalid")).res.code, 400);
});

test("saves dates, restores expired plans and preserves cancelled status", async () => {
  for (const [status, planCode, expected] of [["expired", "basic", "active"], ["expired", "trial", "trialing"], ["cancelled", "basic", "cancelled"]]) {
    const { res, saved } = await run({ startsAt: "2020-01-01", endsAt: "2099-02-01" }, { status, planCode });
    assert.equal(res.code, 200);
    assert.equal(saved, true);
    assert.equal(res.body.data.status, expected);
    assert.equal(res.body.data.endsAt.toISOString(), "2099-02-01T00:00:00.000Z");
  }
});
