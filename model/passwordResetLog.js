const mongoose = require("mongoose");

const PasswordResetLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "admin", required: true, index: true },
  email: { type: String, required: true },
  // Only the super-admin history endpoint explicitly selects this field.
  newPassword: { type: String, required: true, select: false },
  resetDate: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

module.exports = mongoose.model("PasswordResetLog", PasswordResetLogSchema);
