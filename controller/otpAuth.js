const crypto = require("crypto");
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

const resolveCompanyRoleForAuth = (user = {}) => {
  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  const explicitCompanyRole = String(user?.companyRole || "").trim().toLowerCase();
  const hasAgentWorkspaceOwnership =
    Boolean(user?.isAgentWorkspace === true) ||
    Boolean(user?.createdBy) ||
    Boolean(user?.ownerId) ||
    Boolean(user?.parentUserId);

  if (normalizedRole === "superadmin" || normalizedRole === "admin") {
    return "admin";
  }

  if (hasAgentWorkspaceOwnership) {
    return "user";
  }

  if (explicitCompanyRole === "admin" || explicitCompanyRole === "user") {
    return explicitCompanyRole;
  }

  return user?.companyId ? "admin" : "user";
};

const normalizePhoneNumber = (value) => String(value || "").trim();
const isValidTwilioAccountSid = (value) => /^AC[a-f0-9]{32}$/i.test(String(value || "").trim());
const otpCache = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;

const hashOtp = (code) =>
  crypto.createHash("sha256").update(String(code || "")).digest("hex");

const storeFallbackOtp = (phoneNumber, code) => {
  otpCache.set(normalizePhoneNumber(phoneNumber), {
    codeHash: hashOtp(code),
    expiresAt: Date.now() + OTP_TTL_MS
  });
};

const readFallbackOtp = (phoneNumber) => {
  const key = normalizePhoneNumber(phoneNumber);
  const entry = otpCache.get(key);
  if (!entry) return null;
  if (Number(entry.expiresAt || 0) <= Date.now()) {
    otpCache.delete(key);
    return null;
  }
  return entry;
};

const selectTwilioSource = (users = []) => {
  for (const user of users) {
    const accountSid = String(user?.twilioaccountsid || "").trim();
    const authToken = String(user?.twilioauthtoken || "").trim();
    const fromNumber = String(user?.twiliophonenumber || user?.phonenumber || "").trim();
    if (isValidTwilioAccountSid(accountSid) && authToken && fromNumber) {
      return { ...user, twilioaccountsid: accountSid, twilioauthtoken: authToken, twiliophonenumber: fromNumber };
    }
  }
  return null;
};

const getSuperAdminTwilioSource = async () => {
  const preferred = await User.findOne({
    $or: [
      { role: "superadmin" },
      { email: "admintechnova@gmail.com" },
      { username: "Super Admin" }
    ]
  })
    .select("username email role twilioaccountsid twilioauthtoken twiliophonenumber phonenumber")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const preferredTwilio = selectTwilioSource(preferred ? [preferred] : []);
  if (preferredTwilio) {
    return preferredTwilio;
  }

  const fallbackCandidates = await User.find({
    twilioaccountsid: { $exists: true, $ne: "" },
    twilioauthtoken: { $exists: true, $ne: "" },
    $or: [
      { role: "admin" },
      { role: "superadmin" }
    ]
  })
    .select("username email role twilioaccountsid twilioauthtoken twiliophonenumber phonenumber")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  return selectTwilioSource(fallbackCandidates);
};

const resolveTwilioCredentials = async () => {
  const source = await getSuperAdminTwilioSource();
  const accountSid = String(source?.twilioaccountsid || "").trim();
  const authToken = String(source?.twilioauthtoken || "").trim();
  const fromNumber = String(source?.twiliophonenumber || source?.phonenumber || "").trim();

  return {
    source,
    accountSid,
    authToken,
    fromNumber,
    isReady: Boolean(isValidTwilioAccountSid(accountSid) && authToken && fromNumber)
  };
};

const createTwilioClient = ({ accountSid, authToken }) => {
  return require("twilio")(accountSid, authToken);
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
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber is required" });
    }

    const twilio = await resolveTwilioCredentials();
    if (!twilio.isReady) {
      return res.status(503).json({
        message: "OTP service is not configured",
        error: "No valid Twilio credentials were found in the superadmin/admin records"
      });
    }

    const fallbackCode = String(Math.floor(100000 + Math.random() * 900000));
    storeFallbackOtp(phoneNumber, fallbackCode);

    const client = createTwilioClient(twilio);
    await client.messages.create({
      body: `Your Nexion OTP is ${fallbackCode}. It expires in 10 minutes.`,
      from: twilio.fromNumber,
      to: phoneNumber
    });

    return res.json({ success: true, status: "sent", provider: "superadmin_twilio" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start OTP", error: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    const code = normalizePhoneNumber(req.body?.code);
    if (!phoneNumber || !code) {
      return res.status(400).json({ message: "phoneNumber and code are required" });
    }

    const cachedOtp = readFallbackOtp(phoneNumber);
    if (!cachedOtp || cachedOtp.codeHash !== hashOtp(code)) {
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
    const companyRole = resolveCompanyRoleForAuth(user);
    const token = jwt.sign(
      {
        userId: user._id,
        id: user._id,
        role: user.role,
        companyId: user.companyId,
        companyRole,
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
        companyRole,
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
