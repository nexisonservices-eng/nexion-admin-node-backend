const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const adminId = "123456789012345678901234";
const loadController = (parent = null, existingAgents = []) => {
  const writes = [];
  const scopes = [];
  const User = {
    init: async () => {},
    find: (scope) => {
      scopes.push(scope);
      return { select: () => ({ lean: async () => [...existingAgents, ...writes] }) };
    },
    findById: () => ({ lean: async () => parent }),
    findOne: async () => null,
    create: async (data) => {
      if (writes.some((entry) => entry.agentWorkspaceSlot === data.agentWorkspaceSlot)) {
        throw Object.assign(new Error("Duplicate slot"), { code: 11000, keyPattern: { agentWorkspaceKey: 1 } });
      }
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
  return { controller: context.module.exports, writes, scopes };
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

const agentRequest = { user: { id: adminId }, body: {
  fullName: "Agent", email: "agent@example.com", password: "password", role: "Agent"
} };

test("five existing accounts, including disabled agents, block creation", async () => {
  const { controller, writes, scopes } = loadController(
    { _id: adminId, role: "admin", companyId: "shared-company" },
    Array.from({ length: 5 }, () => ({ isEnabled: false }))
  );
  const res = response();
  await controller.createAgent(agentRequest, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "AGENT_LIMIT_REACHED");
  assert.equal(writes.length, 0);
  assert.equal(scopes[0].companyId, "shared-company");
  assert.equal(scopes[0].createdBy, undefined);
  assert.equal(scopes[0].isEnabled, undefined);
});

test("concurrent requests with four legacy agents only create the fifth", async () => {
  const { controller, writes, scopes } = loadController(
    { _id: adminId, role: "admin" }, Array.from({ length: 4 }, () => ({}))
  );
  const responses = [response(), response(), response()];
  await Promise.all(responses.map((res) => controller.createAgent(agentRequest, res)));
  assert.deepEqual(responses.map((res) => res.statusCode).sort(), [201, 403, 403]);
  assert.equal(writes.length, 1);
  assert.equal(scopes[0].createdBy, adminId);
});
