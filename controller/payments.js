const crypto = require("crypto");
const Payment = require("../model/payment");
const Subscription = require("../model/subscription");
const { PLAN_LIMITS } = require("../utils/planUtils");
const { resolveFeatureFlagsForPlan } = require("../utils/billing");

const verifyRazorpaySignature = (payload, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return expected === signature;
};

const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody;
    if (!signature || !verifyRazorpaySignature(rawBody, signature)) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = req.body;
    const paymentEntity = event?.payload?.payment?.entity;
    if (!paymentEntity) {
      return res.json({ received: true });
    }

    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;
    const status = paymentEntity.status;
    const notes = paymentEntity.notes || {};

    const payment = await Payment.findOneAndUpdate(
      { orderId },
      {
        status,
        paymentId,
        notes,
        signature
      },
      { new: true }
    );

    if (status === "captured" && notes?.companyId) {
      const featureFlags = await resolveFeatureFlagsForPlan(String(notes.planCode || "basic").toLowerCase());
      await Subscription.findOneAndUpdate(
        { companyId: notes.companyId },
        {
          status: "active",
          planCode: String(notes.planCode || "basic").toLowerCase(),
          billingCycle: notes.billingCycle || "monthly",
          featureFlags,
          limits:
            PLAN_LIMITS[String(notes.planCode || "basic").toLowerCase()] || {}
        },
        { upsert: true, new: true }
      );
    }

    res.json({ received: true, payment });
  } catch (error) {
    res.status(500).json({ message: "Webhook processing failed", error: error.message });
  }
};

module.exports = {
  razorpayWebhook
};
