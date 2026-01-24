const crypto = require("crypto");
const User = require("../model/loginmodel");

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

   
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    
    const resetToken = crypto.randomBytes(32).toString("hex");

    
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 min

    await user.save();

   
    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;

    
    console.log("Reset Password Link:", resetUrl);

    res.status(200).json({
      message: "Password reset link sent to email",
    });

  } catch (error) {
    res.status(500).json({ message: "Forgot password failed" });
  }
};

module.exports = forgotPassword;
