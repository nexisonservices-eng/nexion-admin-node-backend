const Razorpay = require("razorpay");
const Subscription = require("../model/subscription");
const Payment = require("../model/payment");
const { PLAN_FEATURES, PLAN_LIMITS } = require("../utils/planUtils");

const getRazorpayClient = () => {
  const key_id = process.env.RAZORPAY_KEY_ID || "";
  const key_secret = process.env.RAZORPAY_KEY_SECRET || "";
  return new Razorpay({ key_id, key_secret });
};

const resolvePlanAmount = (planCode, billingCycle) => {
  const normalized = String(planCode || "").toLowerCase();
  const monthly = {
    basic: 3999,
    growth: 6999,
    enterprise: 0
  };
  const yearly = {
    basic: 3999 * 12,
    growth: 6999 * 12,
    enterprise: 0
  };
  return billingCycle === "yearly"
    ? yearly[normalized] || 0
    : monthly[normalized] || 0;
};

const createSubscription = async (req, res) => {
  try {
    const { planCode, billingCycle } = req.body;
    if (!planCode) {
      return res.status(400).json({ message: "planCode is required" });
    }
    const amount = resolvePlanAmount(planCode, billingCycle || "monthly");
    const razorpay = getRazorpayClient();

    const order = await razorpay.orders.create({
      amount: Math.max(amount, 0) * 100,
      currency: "INR",
      notes: {
        companyId: String(req.user.companyId || ""),
        userId: String(req.user.id || ""),
        planCode: String(planCode || ""),
        billingCycle: String(billingCycle || "monthly")
      }
    });

    await Payment.create({
      companyId: req.user.companyId,
      userId: req.user.id,
      amount,
      currency: "INR",
      status: "created",
      orderId: order.id,
      planCode,
      billingCycle
    });

    await Subscription.create({
      companyId: req.user.companyId,
      planCode: String(planCode).toLowerCase(),
      status: "pending",
      billingCycle: billingCycle || "monthly",
      featureFlags: PLAN_FEATURES[String(planCode).toLowerCase()] || {},
      limits: PLAN_LIMITS[String(planCode).toLowerCase()] || {}
    });

    res.json({ success: true, data: { order } });
  } catch (error) {
    res.status(500).json({ message: "Failed to create subscription", error: error.message });
  }
};

module.exports = {
  createSubscription
};
