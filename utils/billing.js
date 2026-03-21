const PlanPricing = require("../model/planPricing");
const Subscription = require("../model/subscription");
const MetaDocument = require("../model/metaDocument");

const TRIAL_DAYS = 3;
const TRIAL_LIMITS = {
  whatsappMessages: 50,
  voiceCalls: 20
};

const PLAN_FEATURES = {
  trial: {
    missedCall: true,
    teamInbox: true,
    broadcastMessaging: true,
    voiceCampaign: true,
    inboundAutomation: true,
    ivr: true,
    analytics: true,
    workflowAutomation: true,
    adsManager: true,
    outboundVoice: false
  },
  basic: {
    missedCall: true,
    teamInbox: true,
    broadcastMessaging: true,
    voiceCampaign: true,
    inboundAutomation: false,
    ivr: false,
    analytics: false,
    workflowAutomation: false,
    adsManager: false,
    outboundVoice: false
  },
  growth: {
    missedCall: true,
    teamInbox: true,
    broadcastMessaging: true,
    voiceCampaign: true,
    inboundAutomation: true,
    ivr: true,
    analytics: true,
    workflowAutomation: true,
    adsManager: true,
    outboundVoice: false
  },
  enterprise: {
    missedCall: true,
    teamInbox: true,
    broadcastMessaging: true,
    voiceCampaign: true,
    inboundAutomation: true,
    ivr: true,
    analytics: true,
    workflowAutomation: true,
    adsManager: true,
    outboundVoice: true
  }
};

const DEFAULT_PRICING = [
  { planCode: "basic", monthlyPrice: 3999, yearlyPrice: 47988, currency: "INR" },
  { planCode: "growth", monthlyPrice: 6999, yearlyPrice: 83988, currency: "INR" },
  { planCode: "enterprise", monthlyPrice: 0, yearlyPrice: 0, currency: "INR" }
];

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addBillingCycle = (date, billingCycle) => {
  const next = new Date(date);
  if (billingCycle === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
};

const ensurePlanPricingSeed = async () => {
  for (const row of DEFAULT_PRICING) {
    await PlanPricing.findOneAndUpdate(
      { planCode: row.planCode },
      { $setOnInsert: row },
      { upsert: true, new: true }
    );
  }
};

const buildUsageSnapshot = (subscription) => ({
  whatsappMessages: Number(subscription?.trialUsage?.whatsappMessages || 0),
  voiceCalls: Number(subscription?.trialUsage?.voiceCalls || 0)
});

const buildTrialLimitsSnapshot = (subscription) => ({
  whatsappMessages: Number(
    subscription?.trialLimits?.whatsappMessages || TRIAL_LIMITS.whatsappMessages
  ),
  voiceCalls: Number(subscription?.trialLimits?.voiceCalls || TRIAL_LIMITS.voiceCalls)
});

const getLatestSubscriptionForCompany = async (companyId) => {
  if (!companyId) return null;
  return Subscription.findOne({ companyId }).sort({ createdAt: -1 });
};

const createTrialSubscription = async ({ companyId, userId }) => {
  const now = new Date();
  return Subscription.create({
    companyId,
    userId,
    planCode: "trial",
    status: "trialing",
    billingCycle: "trial",
    startsAt: now,
    endsAt: addDays(now, TRIAL_DAYS),
    trialLimits: TRIAL_LIMITS,
    trialUsage: {
      whatsappMessages: 0,
      voiceCalls: 0
    }
  });
};

const resolveSubscriptionStatus = (subscription) => {
  if (!subscription) {
    return {
      planCode: "trial",
      subscriptionStatus: "payment_pending",
      featureFlags: PLAN_FEATURES.trial,
      trialStart: null,
      trialEnd: null,
      trialUsage: buildUsageSnapshot(null),
      trialLimits: buildTrialLimitsSnapshot(null)
    };
  }

  const now = new Date();
  let status = String(subscription.status || "").toLowerCase();
  const planCode = String(subscription.planCode || "trial").toLowerCase();
  const startsAt = subscription.startsAt || null;
  const endsAt = subscription.endsAt || null;

  if (
    (status === "trialing" || status === "active") &&
    endsAt &&
    new Date(endsAt).getTime() < now.getTime()
  ) {
    status = "expired";
  }

  return {
    planCode,
    subscriptionStatus: status || "payment_pending",
    featureFlags: PLAN_FEATURES[planCode] || PLAN_FEATURES.trial,
    trialStart: startsAt,
    trialEnd: planCode === "trial" ? endsAt : null,
    trialUsage: buildUsageSnapshot(subscription),
    trialLimits: buildTrialLimitsSnapshot(subscription)
  };
};

const resolveDocumentStatus = (docs = [], planCode = "trial", subscriptionStatus = "") => {
  if (!["basic", "growth", "enterprise"].includes(String(planCode || "").toLowerCase())) {
    return "not_required";
  }

  if (!["active", "expired"].includes(String(subscriptionStatus || "").toLowerCase())) {
    return "not_required";
  }

  if (!docs.length) return "missing";
  if (docs.some((doc) => String(doc.status || "").toLowerCase() === "rejected")) {
    return "rejected";
  }
  if (docs.every((doc) => String(doc.status || "").toLowerCase() === "approved")) {
    return "approved";
  }
  return "pending_review";
};

const resolveWorkspaceAccessState = ({
  subscriptionStatus,
  documentStatus,
  companyStatus,
  planCode
}) => {
  if (String(companyStatus || "").toLowerCase() === "disabled") {
    return "disabled";
  }

  const normalizedSubscriptionStatus = String(subscriptionStatus || "").toLowerCase();
  const normalizedPlanCode = String(planCode || "").toLowerCase();

  if (normalizedSubscriptionStatus === "expired") {
    return "expired_readonly";
  }

  if (normalizedPlanCode === "trial" && normalizedSubscriptionStatus === "trialing") {
    return "trialing";
  }

  if (["basic", "growth", "enterprise"].includes(normalizedPlanCode)) {
    if (documentStatus === "missing") return "paid_pending_documents";
    if (documentStatus === "pending_review") return "paid_pending_review";
    if (documentStatus === "rejected") return "documents_rejected";
    if (documentStatus === "approved") return "active";
  }

  if (normalizedSubscriptionStatus === "active") {
    return "active";
  }

  return "paid_pending_documents";
};

const buildWorkspaceAccessContext = ({
  billing,
  documentStatus,
  companyStatus
}) => {
  const workspaceAccessState = resolveWorkspaceAccessState({
    subscriptionStatus: billing.subscriptionStatus,
    documentStatus,
    companyStatus,
    planCode: billing.planCode
  });

  const canViewAnalytics = workspaceAccessState !== "disabled";
  const canPerformActions = workspaceAccessState === "trialing" || workspaceAccessState === "active";

  return {
    ...billing,
    documentStatus,
    workspaceAccessState,
    canPerformActions,
    canViewAnalytics
  };
};

const buildBillingAccessContext = async ({ user, company = null, documents = null, subscription = null }) => {
  const resolvedSubscription =
    subscription || (user?.companyId ? await getLatestSubscriptionForCompany(user.companyId) : null);
  const billing = resolveSubscriptionStatus(resolvedSubscription);

  const resolvedDocuments =
    documents ||
    (user?.companyId
      ? await MetaDocument.find({ companyId: user.companyId }).sort({ createdAt: -1 }).lean()
      : []);

  const documentStatus = resolveDocumentStatus(
    resolvedDocuments,
    billing.planCode,
    billing.subscriptionStatus
  );

  return buildWorkspaceAccessContext({
    billing,
    documentStatus,
    companyStatus: company?.status || "active"
  });
};

module.exports = {
  TRIAL_DAYS,
  TRIAL_LIMITS,
  PLAN_FEATURES,
  addBillingCycle,
  buildBillingAccessContext,
  buildTrialLimitsSnapshot,
  buildUsageSnapshot,
  createTrialSubscription,
  ensurePlanPricingSeed,
  getLatestSubscriptionForCompany,
  resolveDocumentStatus,
  resolveSubscriptionStatus,
  resolveWorkspaceAccessState
};
