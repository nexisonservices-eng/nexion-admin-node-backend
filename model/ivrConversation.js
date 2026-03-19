const mongoose = require("mongoose");

const IVRConversationSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "company", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "admin" },
    callId: String,
    conversation: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

IVRConversationSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model("ivr_conversation", IVRConversationSchema);
