const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "company",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
      required: true,
      index: true
    },
    planCode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["trialing", "active", "expired", "payment_pending", "cancelled"],
      default: "trialing",
      index: true
    },
    billingCycle: {
      type: String,
      enum: ["trial", "monthly", "yearly"],
      default: "trial"
    },
    startsAt: {
      type: Date,
      required: true
    },
    endsAt: {
      type: Date,
      required: true
    },
    trialLimits: {
      whatsappMessages: { type: Number, default: 50 },
      voiceCalls: { type: Number, default: 20 }
    },
    trialUsage: {
      whatsappMessages: { type: Number, default: 0 },
      voiceCalls: { type: Number, default: 0 }
    },
    currentOrderId: {
      type: String,
      default: ""
    },
    currentPaymentId: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

SubscriptionSchema.index({ companyId: 1, createdAt: -1 });
SubscriptionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("subscription", SubscriptionSchema);
