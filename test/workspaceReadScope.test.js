const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('membership is read from stored parent relationships and restricted to company', async () => {
  let query;
  const context = { module: { exports: {} }, require: () => ({ find: (filter) => {
    query = filter;
    return { select: () => ({ lean: async () => [{ _id: 'agent' }] }) };
  } }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/workspaceReadScope.js'), 'utf8'), context);
  const resolve = context.module.exports.getWorkspaceReadUserIds;
  assert.deepEqual(Array.from(await resolve({ _id: 'admin', companyId: 'company' }, 'admin')), ['admin', 'agent']);
  assert.equal(query.companyId, 'company');
  assert.equal(query.$or.length, 3);
  assert.ok(query.$or.every((clause) => Object.values(clause)[0] === 'admin'));
  query = null;
  assert.deepEqual(Array.from(await resolve({ _id: 'agent' }, 'user')), ['agent']);
  assert.equal(query, null);
});
