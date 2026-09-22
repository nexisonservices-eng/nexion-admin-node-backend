const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const adminId = "123456789012345678901234";
const loadController = (parent = null) => {
  const writes = [];
  const User = {
    findById: () => ({ lean: async () => parent }),
    findOne: async () => null,
    create: async (data) => {
      writes.push(data);
      return { toObject: () => ({ ...data, _id: "agent-id" }) };
    }
  };
  const mocks = {
    bcryptjs: { hash: async () => "hashed-password" },
    mongoose: { Types: { ObjectId: { isValid: (id) => /^[a-f0-9]{24}$/i.test(id) } } },
    "../model/loginmodel": User,
    "../utils/agentAccess": { buildAgentAccessPayload: (user) => ({ isEnabled: user.isEnabled }) }
  };
  const context = { module: { exports: {} }, require: (name) => {
    assert.ok(mocks[name], `Unexpected dependency: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../controller/agentManagement.js"), "utf8"), context);
  return { controller: context.module.exports, writes };
};

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

for (const action of ["listAgents", "createAgent", "updateAgent"]) {
  test(`${action}: virtual superadmin gets workspace instructions`, async () => {
    const { controller, writes } = loadController();
    const res = response();
    await controller[action]({ user: { id: "superadmin-id", role: "superadmin" } }, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /company admin account/);
    assert.equal(writes.length, 0);
  });

  test(`${action}: missing admin requires a fresh login`, async () => {
    const { controller } = loadController();
    const res = response();
    await controller[action]({ user: { id: adminId, role: "admin" } }, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /sign in again/);
  });
}

test("company admin creates an enabled agent owned by that admin", async () => {
  const { controller, writes } = loadController({ _id: adminId, role: "admin", companyId: "company-id" });
  const res = response();
  await controller.createAgent({ user: { id: adminId }, body: {
    fullName: "Test Agent", email: "agent@example.com", password: "test-password", role: "Agent"
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].createdBy, adminId);
  assert.equal(writes[0].companyId, "company-id");
  assert.equal(writes[0].password, "hashed-password");
  assert.equal(writes[0].isEnabled, true);
});

test("ordinary users cannot create agents", async () => {
  const { controller, writes } = loadController({ _id: adminId, role: "user", companyRole: "user" });
  const res = response();
  await controller.createAgent({ user: { id: adminId } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(writes.length, 0);
});
