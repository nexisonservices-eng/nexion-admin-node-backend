const mongoose = require("mongoose");

const PasswordResetAuditSchema = new mongoose.Schema({
  adminId: { type: String, required: true, index: true },
  targetUserId: { type: String, required: true, index: true },
  targetAccountType: { type: String, default: "unknown" },
  tenantId: { type: String, default: null, index: true },
  action: { type: String, enum: ["PASSWORD_RESET"], default: "PASSWORD_RESET" },
  status: { type: String, enum: ["pending", "success", "failure"], required: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

module.exports = mongoose.model("PasswordResetAudit", PasswordResetAuditSchema);
