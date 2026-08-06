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

const twilioClient = () => {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN || "").trim();
  return require("twilio")(sid, token);
};

const getTwilioVerifySid = () =>
  String(process.env.TWILIO_VERIFY_SID || process.env.TWILIO_SERVICE_SID || "").trim();

const getMissingTwilioConfig = () => {
  const missing = [];
  if (!String(process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID || "").trim()) {
    missing.push("TWILIO_ACCOUNT_SID");
  }
  if (!String(process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_TOKEN || "").trim()) {
    missing.push("TWILIO_AUTH_TOKEN");
  }
  if (!getTwilioVerifySid()) {
    missing.push("TWILIO_VERIFY_SID");
  }
  return missing;
};

const normalizePhoneNumber = (value) => String(value || "").trim();
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

const buildEmailTransporter = () => {
  const provider = String(process.env.BULK_EMAIL_PROVIDER || "").toLowerCase();
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();

  if (provider === "resend" && resendApiKey) {
    return { type: "resend", apiKey: resendApiKey };
  }

  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(String(process.env.SMTP_PORT || "587").trim() || 587);
  const secure = String(process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true";
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  if (!host || !user || !pass) {
    return { type: "none" };
  }

  return {
    type: "smtp",
    transporter: require("nodemailer").createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    })
  };
};

const sendOtpEmail = async ({ to, code }) => {
  const from =
    String(process.env.SMTP_FROM || "").trim() ||
    String(process.env.SMTP_USER || "").trim() ||
    String(process.env.EMAIL_FROM || "").trim() ||
    String(process.env.EMAIL_USER || "").trim();

  if (!from) {
    throw new Error("No email sender is configured for OTP fallback");
  }

  const subject = "Your Nexion login code";
  const text = [
    "Use this code to sign in to Nexion:",
    "",
    code,
    "",
    "This code expires in 10 minutes."
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102042">
      <h2 style="margin:0 0 12px">Your Nexion login code</h2>
      <p>Use this code to sign in:</p>
      <div style="display:inline-block;padding:12px 18px;background:#eff6ff;border-radius:10px;font-size:24px;font-weight:700;letter-spacing:4px">${code}</div>
      <p>This code expires in 10 minutes.</p>
    </div>
  `;

  const emailTransport = buildEmailTransporter();
  if (emailTransport.type === "resend") {
    await require("axios").post(
      "https://api.resend.com/emails",
      { from, to: [to], subject, text, html },
      {
        headers: {
          Authorization: `Bearer ${emailTransport.apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
    return;
  }

  if (emailTransport.type === "smtp") {
    await emailTransport.transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });
    return;
  }

  throw new Error("No email provider is configured for OTP fallback");
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

    const missingTwilioConfig = getMissingTwilioConfig();
    if (missingTwilioConfig.length > 0) {
      const fallbackCode = String(Math.floor(100000 + Math.random() * 900000));
      const user = await User.findOne({ phonenumber: phoneNumber });
      if (!user?.email) {
        return res.status(503).json({
          message: "OTP service is not configured",
          error: `Missing Twilio env vars: ${missingTwilioConfig.join(", ")}`
        });
      }

      storeFallbackOtp(phoneNumber, fallbackCode);
      await sendOtpEmail({ to: user.email, code: fallbackCode });

      return res.json({
        success: true,
        status: "sent",
        provider: "email_fallback"
      });
    }

    const verifySid = getTwilioVerifySid();
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
    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    const code = normalizePhoneNumber(req.body?.code);
    if (!phoneNumber || !code) {
      return res.status(400).json({ message: "phoneNumber and code are required" });
    }

    const missingTwilioConfig = getMissingTwilioConfig();
    if (missingTwilioConfig.length > 0) {
      const cachedOtp = readFallbackOtp(phoneNumber);
      if (!cachedOtp || cachedOtp.codeHash !== hashOtp(code)) {
        return res.status(401).json({ message: "Invalid OTP" });
      }
    } else {
      const verifySid = getTwilioVerifySid();
      const client = twilioClient();
      const check = await client.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: phoneNumber, code });

      if (check.status !== "approved") {
        return res.status(401).json({ message: "Invalid OTP" });
      }
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
