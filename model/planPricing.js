const mongoose = require("mongoose");

const PlanPricingSchema = new mongoose.Schema(
  {
    planCode: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    monthlyPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    yearlyPrice: {
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
    features: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("planpricing", PlanPricingSchema);
