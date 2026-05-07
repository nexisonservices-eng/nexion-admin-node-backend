const mongoose = require("mongoose");

const EmailHistoryEntrySchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "company", index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "admin", index: true },
    subject: { type: String, required: true },
    preview: { type: String, default: "" },
    sourceName: { type: String, default: "Email Automation" },
    totalRecipients: { type: Number, default: 0, min: 0 },
    sentCount: { type: Number, default: 0, min: 0 },
    deliveredCount: { type: Number, default: 0, min: 0 },
    replyCount: { type: Number, default: 0, min: 0 },
    failedCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["sent", "draft", "queued", "sending", "failed", "partial"],
      default: "sent",
      index: true
    },
    sentAt: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

EmailHistoryEntrySchema.index({ companyId: 1, sentAt: -1 });
EmailHistoryEntrySchema.index({ userId: 1, sentAt: -1 });

module.exports = mongoose.model("emailHistoryEntry", EmailHistoryEntrySchema);
