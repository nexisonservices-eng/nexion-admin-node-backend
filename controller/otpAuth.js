const jwt = require("jsonwebtoken");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const { buildAgentAccessPayload } = require("../utils/agentAccess");
const {
  ensureCompanyFolders,
  buildCompanyCloudinaryRoot,
  sanitizeCompanyName
} = require("../config/cloudinary");
const { createTrialSubscription, getLatestSubscriptionForCompany } = require("../utils/billing");
const { buildSubscriptionContext } = require("./billingController");

const twilioClient = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  return require("twilio")(sid, token);
};

const ensureOtpCompany = async (user) => {
  if (user.companyId) return user.companyId;

  const company = await Company.create({
    name: user.username || user.phonenumber || "Company",
    slug: sanitizeCompanyName(user.username || user.phonenumber || "company"),
    createdBy: user._id,
    status: "active"
  });

  const cloudinarySetup = await ensureCompanyFolders({
    companyName: company.name,
    companySlug: company.slug,
    companyId: company._id
  });
  company.cloudinaryFolderRoot =
    cloudinarySetup?.root ||
    buildCompanyCloudinaryRoot({ companyName: company.name, companySlug: company.slug, companyId: company._id });
  await company.save();
  await createTrialSubscription({ companyId: company._id, userId: user._id });

  user.companyId = company._id;
  user.companyRole = "admin";
  await user.save();
  return company._id;
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

    return res.json({ success: true, status: result.status });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start OTP", error: error.message });
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

    await ensureOtpCompany(user);
    const subscription = await getLatestSubscriptionForCompany(user.companyId);
    if (!subscription) {
      await createTrialSubscription({ companyId: user.companyId, userId: user._id });
    }
    const company = user.companyId ? await Company.findById(user.companyId).lean() : null;

    const billing = await buildSubscriptionContext(user);
    const token = jwt.sign(
      {
        userId: user._id,
        id: user._id,
        role: user.role,
        companyId: user.companyId,
        companyRole: user.companyRole,
        companyName: company?.name || "",
        companySlug: company?.slug || "",
        cloudinaryFolderRoot: company?.cloudinaryFolderRoot || "",
        planCode: billing.planCode,
        featureFlags: billing.featureFlags,
        subscriptionStatus: billing.subscriptionStatus,
        workspaceAccessState: billing.workspaceAccessState,
        canPerformActions: billing.canPerformActions,
        canViewAnalytics: billing.canViewAnalytics,
        ...buildAgentAccessPayload(user)
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyRole: user.companyRole,
        companyName: company?.name || "",
        companySlug: company?.slug || "",
        cloudinaryFolderRoot: company?.cloudinaryFolderRoot || "",
        ...billing,
        ...buildAgentAccessPayload(user)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify OTP", error: error.message });
  }
};

module.exports = { startOtp, verifyOtp };
