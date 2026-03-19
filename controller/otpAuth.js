const jwt = require("jsonwebtoken");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const Subscription = require("../model/subscription");
const { getDefaultTrial, buildPlanContext } = require("../utils/planUtils");
const { ensureCompanyFolders, sanitizeCompanyName } = require("../config/cloudinary");

const twilioClient = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  return require("twilio")(sid, token);
};

const startOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber is required" });
    }
    const verifySid = process.env.TWILIO_VERIFY_SID || "";
    const client = twilioClient();
    const result = await client.verify.v2
      .services(verifySid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    res.json({ success: true, status: result.status });
  } catch (error) {
    res.status(500).json({ message: "Failed to start OTP", error: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ message: "phoneNumber and code are required" });
    }
    const verifySid = process.env.TWILIO_VERIFY_SID || "";
    const client = twilioClient();
    const check = await client.verify.v2
      .services(verifySid)
      .verificationChecks.create({ to: phoneNumber, code });

    if (check.status !== "approved") {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    let user = await User.findOne({ phonenumber: phoneNumber });
    if (!user) {
      user = await User.create({
        username: phoneNumber,
        email: "",
        password: "OTP_LOGIN",
        role: "user",
        phonenumber: phoneNumber,
        authProvider: "otp"
      });
    }

    if (!user.companyId) {
      const trial = getDefaultTrial();
      const slug = sanitizeCompanyName(user.username || phoneNumber);
      const company = await Company.create({
        name: user.username || phoneNumber,
        slug,
        createdBy: user._id,
        status: "active",
        trialStart: trial.trialStart,
        trialEnd: trial.trialEnd
      });
      await ensureCompanyFolders({ companyName: company.name, companyId: company._id });
      await Subscription.create({
        companyId: company._id,
        planCode: "trial",
        status: "active",
        billingCycle: "trial",
        startsAt: trial.trialStart,
        endsAt: trial.trialEnd,
        featureFlags: trial.featureFlags,
        limits: trial.limits
      });
      user.companyId = company._id;
      user.companyRole = "admin";
      await user.save();
    }

    const planContext = await buildPlanContext(user.companyId);
    const token = jwt.sign(
      {
        userId: user._id,
        id: user._id,
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

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyRole: user.companyRole
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to verify OTP", error: error.message });
  }
};

module.exports = { startOtp, verifyOtp };
