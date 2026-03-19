const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "company", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "admin" },
    provider: { type: String, default: "razorpay" },
    status: { type: String, default: "created" },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    orderId: String,
    paymentId: String,
    signature: String,
    planCode: String,
    billingCycle: String,
    notes: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

PaymentSchema.index({ companyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("payment", PaymentSchema);
