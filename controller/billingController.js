const crypto = require("crypto");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const Payment = require("../model/payment");
const PlanPricing = require("../model/planPricing");
const Subscription = require("../model/subscription");
const UsageLog = require("../model/usageLog");
const MetaDocument = require("../model/metaDocument");
const CustomPackage = require("../model/customPackage");
const {
  TRIAL_LIMITS,
  FEATURE_LABEL_TO_FLAGS,
  DEFAULT_PLAN_FEATURE_LABELS,
  normalizeFeatureLabel,
  buildFeatureFlagsFromLabels,
  addBillingCycle,
  buildBillingAccessContext,
  createTrialSubscription,
  ensurePlanPricingSeed,
  getLatestSubscriptionForCompany,
  resolveDocumentStatus,
  resolveSubscriptionStatus,
  resolveWorkspaceAccessState
} = require("../utils/billing");

const getIo = (req) => req.app.get("io");
const emitEvent = (req, event, payload) => {
  const io = getIo(req);
  if (io) io.emit(event, payload);
};

const getRazorpayClient = () => {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const normalizePlan = (value) => String(value || "").trim().toLowerCase();
const normalizeCycle = (value) =>
  String(value || "monthly").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
const normalizeFeatureLabelsInput = (features = []) =>
  Array.from(
    new Set(
      (Array.isArray(features) ? features : [])
        .map((feature) => normalizeFeatureLabel(feature))
        .filter((feature) => feature && FEATURE_LABEL_TO_FLAGS[feature])
    )
  );

const toObjectIdString = (value) => (value ? String(value) : null);
const getActorObjectIdOrNull = (req) => {
  const actorId = req.user?.id || req.user?.userId || null;
  if (!actorId) return null;
  return mongoose.Types.ObjectId.isValid(actorId) ? actorId : null;
};

const ensureBillingWorkspace = async (user) => {
  if (user.companyId) return user.companyId;

  const name = user.username ? `${user.username}'s Workspace` : "New Workspace";
  const company = await Company.create({
    name,
    slug: String(name || "workspace")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
    createdBy: user._id,
    status: "active"
  });

  user.companyId = company._id;
  user.companyRole = user.companyRole || "admin";
  await user.save();
  return company._id;
};

const ensureTrialForUser = async (user) => {
  const companyId = await ensureBillingWorkspace(user);
  const subscription = await getLatestSubscriptionForCompany(companyId);
  if (!subscription) {
    await createTrialSubscription({ companyId, userId: user._id });
  }
};

const buildSubscriptionContext = async (user) => {
  if (!user) {
    return {
      companyId: null,
      companyRole: "user",
      planCode: "trial",
      featureFlags: {},
      subscriptionStatus: "payment_pending",
      trialStart: null,
      trialEnd: null,
      trialUsage: { whatsappMessages: 0, voiceCalls: 0 },
      trialLimits: TRIAL_LIMITS,
      documentStatus: "not_required",
      workspaceAccessState: "paid_pending_documents",
      canPerformActions: false,
      canViewAnalytics: true
    };
  }

  const company = user.companyId ? await Company.findById(user.companyId).lean() : null;
  const documents = user.companyId
    ? await MetaDocument.find({ companyId: user.companyId }).sort({ createdAt: -1 }).lean()
    : [];
  const context = await buildBillingAccessContext({
    user,
    company,
    documents
  });

  return {
    companyId: user.companyId || null,
    companyRole: user.companyRole || "admin",
    ...context
  };
};

const listPublicPlanPricing = async (req, res) => {
  try {
    await ensurePlanPricingSeed();
    const rows = await PlanPricing.find({}).sort({ planCode: 1 }).lean();
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load plan pricing", error: error.message });
  }
};

const listAdminPlanPricing = async (req, res) => listPublicPlanPricing(req, res);

const updatePlanPricing = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ message: "Pricing items are required" });
    }

    const updates = [];
    for (const item of items) {
      const planCode = normalizePlan(item.planCode);
      if (!["basic", "growth", "enterprise"].includes(planCode)) {
        return res.status(400).json({ message: `Invalid planCode: ${item.planCode}` });
      }
      const features = Array.isArray(item.features)
        ? Array.from(
            new Set(
              item.features
                .map((feature) => normalizeFeatureLabel(feature))
                .filter((feature) => feature && FEATURE_LABEL_TO_FLAGS[feature])
            )
          )
        : DEFAULT_PLAN_FEATURE_LABELS[planCode] || [];
      updates.push(
        PlanPricing.findOneAndUpdate(
          { planCode },
          {
            $set: {
              monthlyPrice: Number(item.monthlyPrice || 0),
              yearlyPrice: Number(item.yearlyPrice || 0),
              currency: String(item.currency || "INR").trim().toUpperCase() || "INR",
              features
            }
          },
          { upsert: true, new: true }
        )
      );
    }

    const rows = await Promise.all(updates);
    emitEvent(req, "plan.pricing.updated", { updatedAt: new Date().toISOString() });
    return res.json({ success: true, message: "Pricing updated successfully.", data: rows });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update plan pricing", error: error.message });
  }
};

const createSubscriptionOrder = async (req, res) => {
  try {
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ message: "Razorpay is not configured" });
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(403).json({
        message: "Only registered workspace users can start checkout. Please login with a user account."
      });
    }
    if (String(req.user?.role || "").toLowerCase() === "superadmin") {
      return res.status(403).json({
        message: "Superadmin accounts cannot create subscription orders."
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await ensureTrialForUser(user);
    if (!user.companyId) {
      return res.status(400).json({ message: "Workspace billing company is missing for this user" });
    }

    const planCode = normalizePlan(req.body?.planCode);
    const billingCycle = normalizeCycle(req.body?.billingCycle);
    if (!["basic", "growth"].includes(planCode)) {
      return res.status(400).json({ message: "Only Basic and Growth plans are available for direct checkout" });
    }

    await ensurePlanPricingSeed();
    const pricing = await PlanPricing.findOne({ planCode }).lean();
    if (!pricing) {
      return res.status(404).json({ message: "Pricing not configured for selected plan" });
    }

    const amount = Number(billingCycle === "yearly" ? pricing.yearlyPrice : pricing.monthlyPrice);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Selected plan is not available for direct checkout" });
    }

    const receipt = `nexion_${planCode}_${billingCycle}_${Date.now()}`;
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: pricing.currency || "INR",
      receipt,
      notes: {
        companyId: String(user.companyId),
        userId: String(user._id),
        planCode,
        billingCycle
      }
    });

    const existingSubscription = await getLatestSubscriptionForCompany(user.companyId);
    const payment = await Payment.create({
      companyId: user.companyId,
      userId: user._id,
      subscriptionId: existingSubscription?._id || null,
      planCode,
      billingCycle,
      status: "created",
      amount,
      currency: pricing.currency || "INR",
      orderId: order.id,
      receipt,
      notes: {
        companyId: String(user.companyId),
        userId: String(user._id)
      }
    });

    if (existingSubscription) {
      existingSubscription.currentOrderId = order.id;
      await existingSubscription.save();
    }

    return res.json({
      success: true,
      data: {
        orderId: order.id,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        planCode,
        billingCycle,
        paymentRecordId: payment._id
      }
    });
  } catch (error) {
    console.error("createSubscriptionOrder failed", {
      userId: req.user?.id || req.user?.userId || null,
      role: req.user?.role || null,
      planCode: req.body?.planCode || null,
      billingCycle: req.body?.billingCycle || null,
      message: error?.message || "Unknown error",
      razorpayDescription: error?.error?.description || null,
      stack: error?.stack || null
    });
    return res.status(500).json({
      message: "Failed to create subscription order",
      error: error?.error?.description || error?.message || "Unknown server error"
    });
  }
};

const verifySubscriptionPayment = async (req, res) => {
  try {
    const requesterId = req.user?.id || req.user?.userId;
    if (!requesterId || !mongoose.Types.ObjectId.isValid(requesterId)) {
      return res.status(403).json({
        message: "Only registered workspace users can verify payments."
      });
    }
    if (String(req.user?.role || "").toLowerCase() === "superadmin") {
      return res.status(403).json({
        message: "Superadmin accounts cannot verify subscription payments."
      });
    }

    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    } = req.body || {};

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ message: "Razorpay verification payload missing" });
    }

    const expected = crypto
      .createHmac("sha256", String(process.env.RAZORPAY_KEY_SECRET || ""))
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).json({ message: "Invalid Razorpay signature" });
    }

    const payment = await Payment.findOne({ orderId });
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    if (String(payment.userId || "") !== String(requesterId)) {
      return res.status(403).json({
        message: "You are not allowed to verify this payment."
      });
    }

    payment.paymentId = paymentId;
    payment.status = "captured";
    payment.capturedAt = new Date();
    await payment.save();

    let subscription = await getLatestSubscriptionForCompany(payment.companyId);
    const now = new Date();
    const endsAt = addBillingCycle(now, payment.billingCycle);

    if (subscription) {
      subscription.userId = payment.userId;
      subscription.planCode = payment.planCode;
      subscription.status = "active";
      subscription.billingCycle = payment.billingCycle;
      subscription.startsAt = now;
      subscription.endsAt = endsAt;
      subscription.currentOrderId = orderId;
      subscription.currentPaymentId = paymentId;
      subscription.trialLimits = subscription.trialLimits || TRIAL_LIMITS;
      subscription.trialUsage = subscription.trialUsage || { whatsappMessages: 0, voiceCalls: 0 };
      await subscription.save();
    } else {
      subscription = await Subscription.create({
        companyId: payment.companyId,
        userId: payment.userId,
        planCode: payment.planCode,
        status: "active",
        billingCycle: payment.billingCycle,
        startsAt: now,
        endsAt,
        currentOrderId: orderId,
        currentPaymentId: paymentId,
        trialLimits: TRIAL_LIMITS,
        trialUsage: { whatsappMessages: 0, voiceCalls: 0 }
      });
    }

    payment.subscriptionId = subscription._id;
    await payment.save();

    emitEvent(req, "payment.updated", {
      orderId,
      paymentId,
      companyId: String(payment.companyId),
      status: "captured"
    });

    const user = await User.findById(payment.userId);
    const context = user ? await buildSubscriptionContext(user) : null;

    return res.json({
      success: true,
      message: "Payment verified successfully",
      data: {
        paymentId,
        orderId,
        subscriptionStatus: "active",
        planCode: payment.planCode,
        billingCycle: payment.billingCycle,
        context
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify payment", error: error.message });
  }
};

const listPayments = async (req, res) => {
  try {
    const rows = await Payment.find({})
      .sort({ createdAt: -1 })
      .populate("userId", "username email")
      .populate("companyId", "name slug")
      .lean();
    return res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        username: row?.userId?.username || "",
        email: row?.userId?.email || "",
        companyName: row?.companyId?.name || "",
        companySlug: row?.companyId?.slug || ""
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch payments", error: error.message });
  }
};

const listUsers = async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    const companyIds = Array.from(
      new Set(users.map((user) => String(user.companyId || "")).filter(Boolean))
    );
    const companies = await Company.find({
      _id: { $in: companyIds }
    }).lean();
    const companyById = new Map(companies.map((company) => [String(company._id), company]));
    const subscriptions = await Subscription.find({
      companyId: { $in: companyIds }
    })
      .sort({ createdAt: -1 })
      .lean();
    const latestSubscriptionByCompanyId = new Map();
    for (const subscription of subscriptions) {
      const key = String(subscription.companyId || "");
      if (key && !latestSubscriptionByCompanyId.has(key)) {
        latestSubscriptionByCompanyId.set(key, subscription);
      }
    }
    const documents = await MetaDocument.find({
      companyId: { $in: companyIds }
    })
      .sort({ createdAt: -1 })
      .lean();
    const documentsByCompanyId = documents.reduce((acc, doc) => {
      const key = String(doc.companyId || "");
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {});

    const customPackages = await CustomPackage.find({
      companyId: { $in: companyIds },
      status: { $in: ["draft", "payment_link_created", "paid"] }
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    const latestCustomByUserId = new Map();
    customPackages.forEach((pkg) => {
      const key = String(pkg.userId || "");
      if (key && !latestCustomByUserId.has(key)) {
        latestCustomByUserId.set(key, pkg);
      }
    });

    const data = await Promise.all(users.map(async (user) => {
      const company = companyById.get(String(user.companyId || "")) || null;
      const latestSubscription = latestSubscriptionByCompanyId.get(String(user.companyId || "")) || null;
      const accessContext = await buildBillingAccessContext({
        user,
        company,
        documents: documentsByCompanyId[String(user.companyId || "")] || [],
        subscription: latestSubscription
      });
      const latestCustomPackage = latestCustomByUserId.get(String(user._id || ""));

      return {
        _id: user._id,
        username: user.username || "",
        email: user.email || "",
        role: user.role || "user",
        companyId: user.companyId || null,
        companyRole: user.companyRole || "user",
        companyName: company?.name || "",
        planCode: accessContext.planCode,
        subscriptionStatus: accessContext.subscriptionStatus,
        documentStatus: accessContext.documentStatus,
        workspaceAccessState: accessContext.workspaceAccessState,
        canPerformActions: accessContext.canPerformActions,
        canViewAnalytics: accessContext.canViewAnalytics,
        featureFlags: accessContext.featureFlags || {},
        effectiveFeatureLabels: Object.entries(accessContext.featureFlags || {})
          .filter(([, enabled]) => Boolean(enabled))
          .map(([flag]) => flag),
        customFeatureLabels: accessContext.customFeatureLabels || [],
        customPackageEndsAt: accessContext.customPackageEndsAt || null,
        customPackageStatus: latestCustomPackage?.status || null,
        activeCustomPackage: accessContext.activeCustomPackage || null,
        twilioAccountSid: user.twilioaccountsid || "",
        twilioAuthToken: user.twilioauthtoken || "",
        twilioPhoneNumber: user.twiliophonenumber || user.phonenumber || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
        metaAppId: user.metaappid || "",
        metaAppSecret: user.metaappsecret || "",
        metaRedirectUri: user.metaredirecturi || "",
        metaUserAccessToken: user.metauseraccesstoken || "",
        metaAdAccountId: user.metaadaccountid || "",
        metaApiVersion: user.metaapiversion || "",
        metaJwtSecret: user.metajwtsecret || "",
        phoneNumber: user.phonenumber || "",
        missedCallWebhook: user.missedcallwebhook || ""
      };
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};

const listSubscriptions = async (req, res) => {
  try {
    const rows = await Subscription.find({})
      .sort({ createdAt: -1 })
      .populate("userId", "username email")
      .lean();

    const companyIds = rows.map((row) => row.companyId).filter(Boolean);
    const docs = await MetaDocument.find({ companyId: { $in: companyIds } }).lean();
    const docsByCompanyId = docs.reduce((acc, doc) => {
      const key = String(doc.companyId || "");
      if (!acc[key]) acc[key] = [];
      acc[key].push(doc);
      return acc;
    }, {});

    const data = rows.map((row) => ({
      ...row,
      companyId: toObjectIdString(row.companyId),
      userId: row.userId,
      documentCount: (docsByCompanyId[String(row.companyId || "")] || []).length
    }));

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch subscriptions", error: error.message });
  }
};

const recordInternalUsage = async (req, res) => {
  try {
    const apiKey = String(req.headers["x-internal-api-key"] || "").trim();
    const expectedKey = String(process.env.ADMIN_INTERNAL_API_KEY || process.env.INTERNAL_API_KEY || "").trim();
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ message: "Unauthorized internal usage request" });
    }

    const companyId = String(req.body?.companyId || "").trim();
    const usageType = String(req.body?.usageType || "").trim();
    const count = Math.max(1, Number(req.body?.count || 1));
    const userId =
      req.body?.userId && mongoose.Types.ObjectId.isValid(req.body.userId) ? req.body.userId : null;

    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId) || !usageType) {
      return res.status(400).json({ message: "companyId and usageType are required" });
    }

    await UsageLog.create({
      companyId,
      userId,
      usageType,
      count
    });

    const subscription = await getLatestSubscriptionForCompany(companyId);
    if (
      subscription &&
      String(subscription.planCode) === "trial" &&
      String(subscription.status) === "trialing"
    ) {
      if (usageType === "whatsapp_message") {
        subscription.trialUsage.whatsappMessages =
          Number(subscription.trialUsage?.whatsappMessages || 0) + count;
      }
      if (usageType === "voice_call" || usageType === "voice_campaign") {
        subscription.trialUsage.voiceCalls =
          Number(subscription.trialUsage?.voiceCalls || 0) + count;
      }
      await subscription.save();
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to record usage", error: error.message });
  }
};

const saveCustomPackageDraft = async (req, res) => {
  try {
    const actorId = getActorObjectIdOrNull(req);
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: "User not found" });
    if (String(targetUser.role || "").toLowerCase() === "superadmin") {
      return res.status(400).json({ message: "Superadmin cannot have custom packages" });
    }

    if (!targetUser.companyId) {
      await ensureBillingWorkspace(targetUser);
    }

    const billingCycle = normalizeCycle(req.body?.billingCycle);
    const amount = Number(req.body?.amount || 0);
    const currency = String(req.body?.currency || "INR").trim().toUpperCase() || "INR";
    const featureLabels = normalizeFeatureLabelsInput(req.body?.featureLabels || req.body?.features);

    if (!featureLabels.length) {
      return res.status(400).json({ message: "Select at least one valid feature" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero" });
    }

    const draft = await CustomPackage.findOneAndUpdate(
      {
        userId: targetUser._id,
        companyId: targetUser.companyId,
        status: { $in: ["draft", "payment_link_created"] }
      },
      {
        $set: {
          featureLabels,
          amount,
          currency,
          billingCycle,
          status: "draft",
          startsAt: null,
          endsAt: null,
          razorpayPaymentLinkId: "",
          razorpayPaymentLinkUrl: "",
          razorpayOrderId: "",
          razorpayPaymentId: "",
          updatedBy: actorId
        },
        $setOnInsert: {
          createdBy: actorId
        }
      },
      { new: true, upsert: true }
    );

    emitEvent(req, "custom.package.updated", {
      userId: String(targetUser._id),
      companyId: String(targetUser.companyId || ""),
      status: "draft"
    });

    return res.json({ success: true, message: "Custom package draft saved", data: draft });
  } catch (error) {
    return res.status(500).json({ message: "Failed to save custom package draft", error: error.message });
  }
};

const createCustomPackagePaymentLink = async (req, res) => {
  try {
    const actorId = getActorObjectIdOrNull(req);
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ message: "Razorpay is not configured" });
    }

    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    const targetUser = await User.findById(userId).lean();
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    const draft = await CustomPackage.findOne({
      userId: targetUser._id,
      companyId: targetUser.companyId,
      status: "draft"
    }).sort({ updatedAt: -1 });

    if (!draft) {
      return res.status(400).json({ message: "No draft package found. Save draft first." });
    }

    const link = await razorpay.paymentLink.create({
      amount: Math.round(Number(draft.amount || 0) * 100),
      currency: draft.currency || "INR",
      description: `Nexion custom package for ${targetUser.username || targetUser.email || "user"}`,
      customer: {
        name: targetUser.username || "Nexion User",
        email: targetUser.email || undefined
      },
      notify: {
        email: Boolean(targetUser.email),
        sms: false
      },
      reminder_enable: true,
      notes: {
        customPackageId: String(draft._id),
        userId: String(targetUser._id),
        companyId: String(targetUser.companyId || ""),
        billingCycle: draft.billingCycle,
        kind: "custom_package"
      }
    });

    draft.status = "payment_link_created";
    draft.razorpayPaymentLinkId = String(link.id || "");
    draft.razorpayPaymentLinkUrl = String(link.short_url || link.reference_id || "");
    draft.updatedBy = actorId;
    await draft.save();

    emitEvent(req, "custom.package.link.created", {
      userId: String(targetUser._id),
      companyId: String(targetUser.companyId || ""),
      customPackageId: String(draft._id)
    });

    return res.json({
      success: true,
      message: "Payment link created",
      data: {
        customPackageId: draft._id,
        paymentLinkId: link.id,
        paymentLinkUrl: link.short_url || null,
        amount: draft.amount,
        currency: draft.currency,
        billingCycle: draft.billingCycle
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create payment link", error: error.message });
  }
};

const verifyCustomPackagePayment = async (req, res) => {
  try {
    const actorId = getActorObjectIdOrNull(req);
    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(500).json({ message: "Razorpay is not configured" });
    }

    const customPackageId = String(req.body?.customPackageId || "").trim();
    const paymentLinkId = String(req.body?.paymentLinkId || "").trim();
    if (!customPackageId || !mongoose.Types.ObjectId.isValid(customPackageId) || !paymentLinkId) {
      return res.status(400).json({ message: "customPackageId and paymentLinkId are required" });
    }

    const pkg = await CustomPackage.findById(customPackageId);
    if (!pkg) return res.status(404).json({ message: "Custom package not found" });

    const link = await razorpay.paymentLink.fetch(paymentLinkId);
    if (!link || String(link.status || "").toLowerCase() !== "paid") {
      return res.status(400).json({ message: "Payment link is not paid yet" });
    }

    const paymentId = Array.isArray(link.payments) && link.payments.length > 0 ? link.payments[0] : "";
    const now = new Date();

    pkg.status = "paid";
    pkg.startsAt = now;
    pkg.endsAt = addBillingCycle(now, pkg.billingCycle);
    pkg.razorpayPaymentLinkId = paymentLinkId;
    pkg.razorpayPaymentId = String(paymentId || "");
    pkg.updatedBy = actorId;
    await pkg.save();

    emitEvent(req, "custom.package.activated", {
      userId: String(pkg.userId || ""),
      companyId: String(pkg.companyId || ""),
      customPackageId: String(pkg._id)
    });
    emitEvent(req, "user.features.updated", {
      userId: String(pkg.userId || ""),
      companyId: String(pkg.companyId || "")
    });

    return res.json({
      success: true,
      message: "Custom package payment verified",
      data: {
        customPackageId: pkg._id,
        status: pkg.status,
        startsAt: pkg.startsAt,
        endsAt: pkg.endsAt,
        featureLabels: pkg.featureLabels
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify custom package payment", error: error.message });
  }
};

const resetCustomPackageAccess = async (req, res) => {
  try {
    const actorId = getActorObjectIdOrNull(req);
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    const targetUser = await User.findById(userId).lean();
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    await CustomPackage.updateMany(
      {
        userId: targetUser._id,
        companyId: targetUser.companyId,
        status: { $in: ["draft", "payment_link_created", "paid"] }
      },
      {
        $set: {
          status: "cancelled",
          updatedBy: actorId
        }
      }
    );

    emitEvent(req, "custom.package.reset", {
      userId: String(targetUser._id),
      companyId: String(targetUser.companyId || "")
    });
    emitEvent(req, "user.features.updated", {
      userId: String(targetUser._id),
      companyId: String(targetUser.companyId || "")
    });

    return res.json({ success: true, message: "User custom access reset to plan defaults" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to reset custom access", error: error.message });
  }
};

module.exports = {
  buildSubscriptionContext,
  createSubscriptionOrder,
  ensureBillingWorkspace,
  ensureTrialForUser,
  listAdminPlanPricing,
  listPayments,
  listPublicPlanPricing,
  listSubscriptions,
  listUsers,
  saveCustomPackageDraft,
  createCustomPackagePaymentLink,
  verifyCustomPackagePayment,
  resetCustomPackageAccess,
  recordInternalUsage,
  updatePlanPricing,
  verifySubscriptionPayment
};
