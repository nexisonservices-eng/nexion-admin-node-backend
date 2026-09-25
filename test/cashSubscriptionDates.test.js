const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseCashSubscriptionDates } = require('../utils/cashSubscriptionDates');

test('cash dates are optional for existing clients but validate both fields when provided', () => {
  assert.deepEqual(parseCashSubscriptionDates({}), {});
  for (const body of [{ startsAt: '' }, { startsAt: null, endsAt: null }, { startsAt: 'invalid', endsAt: '2030-01-01' }, { startsAt: '2030-02-01', endsAt: '2030-01-01' }, { startsAt: '2030-01-01', endsAt: '2030-01-01' }]) {
    assert.throws(() => parseCashSubscriptionDates(body), /valid subscription dates/);
  }
  assert.equal(parseCashSubscriptionDates({ startsAt: '2030-01-01T00:00:00.000Z', endsAt: '2030-02-01T23:59:59.999Z' }).endsAt.toISOString(), '2030-02-01T23:59:59.999Z');
});

test('activation persists custom dates instead of replacing them with today', async () => {
  let saved = false;
  const subscription = { save: async () => { saved = true; } };
  const context = { module: { exports: {} }, require: (name) => {
    if (name === '../utils/cashSubscriptionDates') return { parseCashSubscriptionDates };
    if (name === '../model/loginmodel') return { findById: async () => null };
    if (name === '../utils/billing') return {
      getLatestSubscriptionForCompany: async () => subscription,
      addBillingCycle: () => { throw new Error('Custom end date must be used'); }
    };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controller/billingController.js'), 'utf8') + '\nmodule.exports.activate = activatePaidSubscription;', context);
  const dates = parseCashSubscriptionDates({ startsAt: '2026-09-25T00:00:00Z', endsAt: '2099-09-25T23:59:59Z' });
  await context.module.exports.activate({ payment: { save: async () => {}, planCode: 'growth', billingCycle: 'yearly' }, paymentMethod: 'cash', ...dates });
  assert.equal(saved, true);
  assert.equal(subscription.startsAt, dates.startsAt);
  assert.equal(subscription.endsAt, dates.endsAt);
  assert.equal(subscription.status, 'active');
  const expired = parseCashSubscriptionDates({ startsAt: '2020-01-01', endsAt: '2020-02-01' });
  await context.module.exports.activate({ payment: { save: async () => {} }, ...expired });
  assert.equal(subscription.status, 'expired');
});
