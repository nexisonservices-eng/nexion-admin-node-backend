const Subscription = require("../model/subscription");
const { PLAN_FEATURES, resolveFeatureFlagsForPlan } = require("./billing");

const PLAN_LIMITS = {
  trial: { voiceCalls: 20, whatsappMessages: 50, campaigns: 5 },
  basic: { voiceCalls: 1000, whatsappMessages: 2000, campaigns: 100 },
  growth: { voiceCalls: 5000, whatsappMessages: 10000, campaigns: 500 },
  enterprise: { voiceCalls: 999999, whatsappMessages: 999999, campaigns: 999999 }
};

const getDefaultTrial = () => {
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 3);
  return {
    planCode: "trial",
    trialStart: now,
    trialEnd,
    featureFlags: PLAN_FEATURES.trial,
    limits: PLAN_LIMITS.trial
  };
};

const buildPlanContext = async (companyId) => {
  if (!companyId) {
    return {
      planCode: "trial",
      featureFlags: PLAN_FEATURES.trial,
      subscriptionStatus: "trial",
      limits: PLAN_LIMITS.trial
    };
  }

  const subscription = await Subscription.findOne({ companyId })
    .sort({ createdAt: -1 })
    .lean();

  if (!subscription) {
    return {
      planCode: "trial",
      featureFlags: PLAN_FEATURES.trial,
      subscriptionStatus: "trial",
      limits: PLAN_LIMITS.trial
    };
  }

  const planCode = String(subscription.planCode || "trial").toLowerCase();
  const featureFlags = await resolveFeatureFlagsForPlan(planCode);
  const limits =
    subscription.limits || PLAN_LIMITS[planCode] || PLAN_LIMITS.trial;
  const status = subscription.status || "active";

  return {
    planCode,
    featureFlags,
    subscriptionStatus: status,
    limits
  };
};

module.exports = {
  PLAN_FEATURES,
  PLAN_LIMITS,
  buildPlanContext,
  getDefaultTrial
};
