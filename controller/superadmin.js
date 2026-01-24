const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

/**
 * SUPER ADMIN LOGIN
 * Email & password are fixed from ENV
 */
const superAdminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Check email
    if (email !=="superadmin@technova@gmail.com") {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Compare password (plain vs env)
    const isMatch = password === "Super@123";

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create JWT
    const token = jwt.sign(
      {
        id: "superadmin-id",
        username: "Super Admin",
        role: "superadmin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Super admin login successful",
      token,
      user: {
        id: "superadmin-id",
        username: "Super Admin",
        email,
        role: "superadmin",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { superAdminLogin };
