// controllers/logoutController.js

// In-memory blacklist for demo (use Redis or DB in production)
const blacklistedTokens = [];

const logout = (req, res) => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(400).json({ success: false, message: "Token required" });
    }

    // Add token to blacklist
    blacklistedTokens.push(token);

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
};

module.exports = { logout, blacklistedTokens };
