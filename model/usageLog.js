const mongoose = require("mongoose");

const UsageLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "company", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "admin" },
    usageType: { type: String, required: true },
    count: { type: Number, default: 1 },
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

UsageLogSchema.index({ companyId: 1, usageType: 1, createdAt: -1 });

module.exports = mongoose.model("usage_log", UsageLogSchema);
