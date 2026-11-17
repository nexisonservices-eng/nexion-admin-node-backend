const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../model/loginmodel");
const PasswordResetLog = require("../model/passwordResetLog");

const resetPassword = async (req, res) => {
  let passwordUpdated = false;
  try {
    const { token } = req.params;
    const { password } = req.body || {};

    if (typeof password !== "string" || password.length < 6 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must contain at least 6 characters and no more than 72 UTF-8 bytes." });
    }

    
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;

    
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    passwordUpdated = true;

    await PasswordResetLog.create({
      userId: user._id,
      email: user.email,
      newPassword: password,
      resetDate: user.passwordChangedAt
    });

    res.status(200).json({ message: "Password reset successful" });

  } catch (error) {
    res.status(500).json({ message: passwordUpdated
      ? "Your password was changed, but reset history could not be saved. Sign in with your new password."
      : "Reset password failed" });
  }
};

module.exports = resetPassword;
