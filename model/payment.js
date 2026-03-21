const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
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
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "subscription",
      default: null
    },
    planCode: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true
    },
    status: {
      type: String,
      enum: ["created", "captured", "failed"],
      default: "created",
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true
    },
    orderId: {
      type: String,
      required: true,
      unique: true
    },
    paymentId: {
      type: String,
      default: "",
      index: true
    },
    receipt: {
      type: String,
      default: ""
    },
    notes: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    capturedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("payment", PaymentSchema);
