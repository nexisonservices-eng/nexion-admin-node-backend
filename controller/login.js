const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../model/loginmodel");

const loginuser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    /* =====================================================
       SUPER ADMIN LOGIN (DEFAULT)
    ===================================================== */
    if (
      email === "superadmin@technova.com" &&
      password === "Super@123"
    ) {
      const token = jwt.sign(
        {
          id: "superadmin-id",
          email,
          role: "superadmin",
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.status(200).json({
        message: "Super admin login successful",
        token,
        user: {
          id: "superadmin-id",
          username: "Super Admin",
          email,
          role: "superadmin",
        },
      });
    }

    /* =====================================================
       NORMAL USER / ADMIN LOGIN
    ===================================================== */

    // 1. Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 2. Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // 3. Create token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role, // user | admin
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 4. Response
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Login failed",
      error: error.message,
    });
  }
};

module.exports = loginuser;
