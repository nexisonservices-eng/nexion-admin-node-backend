const mongoose = require("mongoose");

const CustomPackageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
      required: true,
      index: true
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "company",
      required: true,
      index: true
    },
    featureLabels: {
      type: [String],
      default: []
    },
    amount: {
      type: Number,
      default: 0,
      min: 0
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly"
    },
    status: {
      type: String,
      enum: ["draft", "payment_link_created", "paid", "expired", "cancelled"],
      default: "draft",
      index: true
    },
    startsAt: {
      type: Date,
      default: null
    },
    endsAt: {
      type: Date,
      default: null
    },
    razorpayPaymentLinkId: {
      type: String,
      default: ""
    },
    razorpayPaymentLinkUrl: {
      type: String,
      default: ""
    },
    razorpayOrderId: {
      type: String,
      default: ""
    },
    razorpayPaymentId: {
      type: String,
      default: ""
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "admin",
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("custompackage", CustomPackageSchema);
