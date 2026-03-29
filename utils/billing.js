const PlanPricing = require("../model/planPricing");
const Subscription = require("../model/subscription");
const MetaDocument = require("../model/metaDocument");
const CustomPackage = require("../model/customPackage");

const TRIAL_DAYS = 3;
const TRIAL_LIMITS = {
  whatsappMessages: 50,
  voiceCalls: 20
};

const FEATURE_FLAG_DEFAULTS = {
  adsManager: false,
  analytics: false,
  metaConnect: false,
  broadcastDashboard: false,
  teamInbox: false,
  broadcastMessaging: false,
  templates: false,
  contacts: false,
  voiceCampaign: false,
  inboundAutomation: false,
  ivr: false,
  outboundVoice: false,
  callAnalytics: false,
  missedCall: false,
  workflowAutomation: false
};

const FEATURE_LABEL_ALIASES = {
  Inbound: "Inbound Calls / IVR",
  Outbound: "Outbound Voice",
  Missed: "Missed Call",
  Email: "Email Automation"
};

const normalizeFeatureLabel = (label) => {
  const normalized = String(label || "").trim();
  return FEATURE_LABEL_ALIASES[normalized] || normalized;
};

const FEATURE_LABEL_TO_FLAGS = {
  "Ads Manager": { adsManager: true },
  Insights: { analytics: true },
  "Connect Meta": { metaConnect: true },
  "Broadcast Dashboard": { broadcastDashboard: true },
  "Team Inbox": { teamInbox: true },
  Broadcast: { broadcastMessaging: true },
  Templates: { templates: true },
  Contacts: { contacts: true },
  "Voice Broadcast": { voiceCampaign: true },
  "Inbound Calls / IVR": { inboundAutomation: true, ivr: true },
  Outbound: { outboundVoice: true },
  "Outbound Voice": { outboundVoice: true },
  "Call Analytics": { callAnalytics: true },
  Missed: { missedCall: true },
  "Missed Call": { missedCall: true },
  Email: { workflowAutomation: true },
  "Email Automation": { workflowAutomation: true }
};

const FEATURE_CATALOG = {
  metaAds: ["Ads Manager", "Insights", "Connect Meta"],
  bulkMessage: ["Broadcast Dashboard", "Team Inbox", "Broadcast", "Templates", "Contacts"],
  voice: ["Voice Broadcast", "Inbound Calls / IVR", "Outbound Voice", "Call Analytics"],
  standalone: ["Missed Call", "Email Automation"]
};

const DEFAULT_PLAN_FEATURE_LABELS = {
  basic: [
    "Broadcast Dashboard",
    "Team Inbox",
    "Broadcast",
    "Templates",
    "Contacts",
    "Voice Broadcast",
    "Missed Call"
  ],
  growth: [
    "Ads Manager",
    "Insights",
    "Connect Meta",
    "Broadcast Dashboard",
    "Team Inbox",
    "Broadcast",
    "Templates",
    "Contacts",
    "Voice Broadcast",
    "Inbound Calls / IVR",
    "Call Analytics",
    "Missed Call",
    "Email Automation"
  ],
  enterprise: [
    "Ads Manager",
    "Insights",
    "Connect Meta",
    "Broadcast Dashboard",
    "Team Inbox",
    "Broadcast",
    "Templates",
    "Contacts",
    "Voice Broadcast",
    "Inbound Calls / IVR",
    "Outbound Voice",
    "Call Analytics",
    "Missed Call",
    "Email Automation"
  ]
};

const buildFeatureFlagsFromLabels = (labels = []) => {
  const next = { ...FEATURE_FLAG_DEFAULTS };
  const uniqueLabels = Array.from(
    new Set(
      (Array.isArray(labels) ? labels : [])
        .map((label) => normalizeFeatureLabel(label))
        .filter(Boolean)
    )
  );
  uniqueLabels.forEach((label) => {
    Object.assign(next, FEATURE_LABEL_TO_FLAGS[label] || {});
  });
  return next;
};

const mergeFeatureFlags = (baseFlags = {}, extraFlags = {}) => {
  const merged = { ...FEATURE_FLAG_DEFAULTS, ...baseFlags };
  Object.entries(extraFlags || {}).forEach(([key, value]) => {
    if (value) merged[key] = true;
  });
  return merged;
};

const PLAN_FEATURES = {
  trial: buildFeatureFlagsFromLabels([
    "Ads Manager",
    "Insights",
    "Connect Meta",
    "Broadcast Dashboard",
    "Team Inbox",
    "Broadcast",
    "Templates",
    "Contacts",
    "Voice Broadcast",
    "Inbound Calls / IVR",
    "Call Analytics",
    "Missed Call",
    "Email Automation"
  ]),
  basic: buildFeatureFlagsFromLabels(DEFAULT_PLAN_FEATURE_LABELS.basic),
  growth: buildFeatureFlagsFromLabels(DEFAULT_PLAN_FEATURE_LABELS.growth),
  enterprise: buildFeatureFlagsFromLabels(DEFAULT_PLAN_FEATURE_LABELS.enterprise)
};

const DEFAULT_PRICING = [
  {
    planCode: "basic",
    monthlyPrice: 3999,
    yearlyPrice: 47988,
    currency: "INR",
    features: DEFAULT_PLAN_FEATURE_LABELS.basic
  },
  {
    planCode: "growth",
    monthlyPrice: 6999,
    yearlyPrice: 83988,
    currency: "INR",
    features: DEFAULT_PLAN_FEATURE_LABELS.growth
  },
  {
    planCode: "enterprise",
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: "INR",
    features: DEFAULT_PLAN_FEATURE_LABELS.enterprise
  }
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
    const existing = await PlanPricing.findOne({ planCode: row.planCode });
    if (!existing) {
      await PlanPricing.create(row);
      continue;
    }
    if (!Array.isArray(existing.features) || existing.features.length === 0) {
      existing.features = row.features;
      await existing.save();
    }
  }
};

const getPlanFeatureLabels = async (planCode) => {
  const normalizedPlanCode = String(planCode || "").toLowerCase();
  if (normalizedPlanCode === "trial") return [];
  await ensurePlanPricingSeed();
  const pricing = await PlanPricing.findOne({ planCode: normalizedPlanCode }).lean();
  if (Array.isArray(pricing?.features) && pricing.features.length > 0) {
    return pricing.features.map((feature) => normalizeFeatureLabel(feature)).filter(Boolean);
  }
  return DEFAULT_PLAN_FEATURE_LABELS[normalizedPlanCode] || [];
};

const resolveFeatureFlagsForPlan = async (planCode) => {
  const normalizedPlanCode = String(planCode || "trial").toLowerCase();
  if (normalizedPlanCode === "trial") {
    return PLAN_FEATURES.trial;
  }
  const labels = await getPlanFeatureLabels(normalizedPlanCode);
  return buildFeatureFlagsFromLabels(labels);
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

const resolveSubscriptionStatus = async (subscription) => {
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
    featureFlags: await resolveFeatureFlagsForPlan(planCode),
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
  const billing = await resolveSubscriptionStatus(resolvedSubscription);

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

  const now = new Date();
  const activeCustomPackage = user?._id
    ? await CustomPackage.findOne({
        userId: user._id,
        companyId: user.companyId || null,
        status: "paid",
        startsAt: { $lte: now },
        endsAt: { $gte: now }
      })
        .sort({ endsAt: -1, createdAt: -1 })
        .lean()
    : null;
  const customFeatureLabels = Array.isArray(activeCustomPackage?.featureLabels)
    ? activeCustomPackage.featureLabels.map((label) => normalizeFeatureLabel(label)).filter(Boolean)
    : [];
  const customFeatureFlags = buildFeatureFlagsFromLabels(customFeatureLabels);

  const workspaceContext = buildWorkspaceAccessContext({
    billing,
    documentStatus,
    companyStatus: company?.status || "active"
  });

  return {
    ...workspaceContext,
    featureFlags: mergeFeatureFlags(workspaceContext.featureFlags, customFeatureFlags),
    customFeatureLabels,
    customPackageEndsAt: activeCustomPackage?.endsAt || null,
    activeCustomPackage: activeCustomPackage
      ? {
          id: String(activeCustomPackage._id),
          status: activeCustomPackage.status,
          amount: Number(activeCustomPackage.amount || 0),
          currency: activeCustomPackage.currency || "INR",
          billingCycle: activeCustomPackage.billingCycle || "monthly",
          startsAt: activeCustomPackage.startsAt || null,
          endsAt: activeCustomPackage.endsAt || null
        }
      : null
  };
};

module.exports = {
  TRIAL_DAYS,
  TRIAL_LIMITS,
  FEATURE_CATALOG,
  FEATURE_FLAG_DEFAULTS,
  FEATURE_LABEL_ALIASES,
  FEATURE_LABEL_TO_FLAGS,
  DEFAULT_PLAN_FEATURE_LABELS,
  buildFeatureFlagsFromLabels,
  mergeFeatureFlags,
  normalizeFeatureLabel,
  PLAN_FEATURES,
  addBillingCycle,
  buildBillingAccessContext,
  buildTrialLimitsSnapshot,
  buildUsageSnapshot,
  createTrialSubscription,
  ensurePlanPricingSeed,
  getLatestSubscriptionForCompany,
  getPlanFeatureLabels,
  resolveDocumentStatus,
  resolveFeatureFlagsForPlan,
  resolveSubscriptionStatus,
  resolveWorkspaceAccessState
};
