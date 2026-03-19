const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../model/loginmodel");
const { buildPlanContext } = require("../utils/planUtils");

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
      const superAdminUserId = "superadmin-id";
      const token = jwt.sign(
        {
          id: superAdminUserId,
          userId: superAdminUserId,
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
          id: superAdminUserId,
          userId: superAdminUserId,
          username: "Super Admin",
          email,
          role: "superadmin",
          twilioAccountSid: "",
          whatsappId: "",
          whatsappToken: "",
          whatsappBusiness: "",
          phoneNumber: "",
          missedCallWebhook: "",
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
    const planContext = await buildPlanContext(user.companyId);
    const token = jwt.sign(
      {
        userId: user._id,
        id: user._id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyRole: user.companyRole,
        planCode: planContext.planCode,
        featureFlags: planContext.featureFlags,
        subscriptionStatus: planContext.subscriptionStatus
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
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        twilioAccountSid: user.twilioaccountsid || "",
        twilioAuthToken: user.twilioauthtoken || "",
        twilioPhoneNumber: user.twiliophonenumber || user.phonenumber || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
        phoneNumber: user.phonenumber || "",
        missedCallWebhook: user.missedcallwebhook || "",
        companyId: user.companyId || null,
        companyRole: user.companyRole || "user",
        planCode: planContext.planCode,
        featureFlags: planContext.featureFlags,
        subscriptionStatus: planContext.subscriptionStatus
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


