const mongoose = require("mongoose");

const UsageLogSchema = new mongoose.Schema(
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
      default: null
    },
    usageType: {
      type: String,
      required: true,
      trim: true
    },
    count: {
      type: Number,
      default: 1,
      min: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("usagelog", UsageLogSchema);
