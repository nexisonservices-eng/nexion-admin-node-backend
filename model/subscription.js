const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "company", required: true, index: true },
    planCode: { type: String, required: true },
    status: { type: String, default: "active" },
    billingCycle: { type: String, default: "monthly" },
    startsAt: Date,
    endsAt: Date,
    featureFlags: { type: mongoose.Schema.Types.Mixed, default: {} },
    limits: { type: mongoose.Schema.Types.Mixed, default: {} },
    provider: { type: String, default: "razorpay" },
    providerSubscriptionId: String
  },
  { timestamps: true }
);

SubscriptionSchema.index({ companyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("subscription", SubscriptionSchema);
