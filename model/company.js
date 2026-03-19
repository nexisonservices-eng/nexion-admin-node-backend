const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, index: true },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active"
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "admin" },
    trialStart: Date,
    trialEnd: Date,
    metaVerified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

CompanySchema.index({ slug: 1 });

module.exports = mongoose.model("company", CompanySchema);
