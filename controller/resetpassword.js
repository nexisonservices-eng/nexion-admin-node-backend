const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../model/loginmodel");

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    
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

    
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.status(200).json({ message: "Password reset successful" });

  } catch (error) {
    res.status(500).json({ message: "Reset password failed" });
  }
};

module.exports = resetPassword;
