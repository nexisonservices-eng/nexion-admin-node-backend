const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const loadHandler = (user, billingRole) => {
  const dependencies = {
    mongoose: { Types: { ObjectId: { isValid: (id) => Boolean(id) } } },
    '../model/loginmodel': {
      findById: () => ({ lean: async () => user }),
    },
    '../model/company': {},
    '../utils/agentAccess': require('../utils/agentAccess'),
    '../config/cloudinary': {},
    './billingController': { buildSubscriptionContext: async () => ({
      companyRole: billingRole, planCode: 'growth', subscriptionStatus: 'active',
    }) },
    '../utils/workspaceReadScope': { getWorkspaceCreators: async (account, role) => [
      { id: account._id, name: account.username, role },
      ...(role === 'admin' ? [{ id: 'agent-id', name: 'lirisha', role: 'user' }] : []),
    ] },
  };
  const sandbox = { module: { exports: {} }, require: (id) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../controller/usercredentials'), 'utf8'), sandbox);
  return sandbox.module.exports;
};

test('admin credentials retain resolved admin access when billing contains legacy user role', async () => {
  const user = { _id: 'admin-id', username: 'Qtech services', role: 'user', companyRole: 'user', canAccessUserManagement: true };
  let body;
  const response = { json(value) { body = value; }, status(code) { throw new Error(`Unexpected HTTP ${code}`); } };
  await loadHandler(user, 'user')({ user: { userId: user._id }, query: {} }, response);
  assert.equal(body.data.companyRole, 'admin');
  assert.equal(body.data.canAccessUserManagement, true);
  assert.equal(body.data.workspaceReadUserIds.includes('agent-id'), true);
  assert.equal(body.data.planCode, 'growth');
});

test('agent credentials cannot acquire admin role from billing defaults', async () => {
  const user = { _id: 'agent-id', username: 'lirisha', role: 'user', companyRole: 'user', isAgentWorkspace: true };
  let body;
  await loadHandler(user, 'admin')({ user: { userId: user._id }, query: {} }, {
    json(value) { body = value; }, status(code) { throw new Error(`Unexpected HTTP ${code}`); },
  });
  assert.equal(body.data.companyRole, 'user');
  assert.equal(body.data.canAccessUserManagement, false);
  assert.equal(body.data.workspaceReadUserIds.length, 1);
});
