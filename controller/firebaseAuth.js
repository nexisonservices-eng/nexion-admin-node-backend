const jwt = require("jsonwebtoken");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const { buildAgentAccessPayload } = require("../utils/agentAccess");
const { getFirebaseAdmin } = require("../config/firebaseAdmin");
const {
  ensureCompanyFolders,
  buildCompanyCloudinaryRoot,
  sanitizeCompanyName
} = require("../config/cloudinary");
const { createTrialSubscription } = require("../utils/billing");
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

const resolveOrCreateCompany = async ({ user, displayName }) => {
  if (user.companyId) return user.companyId;

  const name = displayName || user.username || user.email || "Company";
  const company = await Company.create({
    name,
    slug: sanitizeCompanyName(name),
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

  await createTrialSubscription({
    companyId: company._id,
    userId: user._id
  });

  user.companyId = company._id;
  user.companyRole = user.companyRole || "admin";
  await user.save();

  return company._id;
};

const firebaseAuth = async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ message: "Firebase ID token is required" });
    }

    let admin;
    try {
      admin = getFirebaseAdmin();
    } catch (initError) {
      return res.status(503).json({
        message:
          "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
      });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = decoded.email || null;
    const emailVerified = decoded.email_verified === true;
    const displayName = decoded.name || "";

    if (!email || !emailVerified) {
      return res.status(401).json({ message: "Google account email is not verified" });
    }

    let user = await User.findOne({ googleId: decoded.uid });
    if (!user) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        username: displayName || email.split("@")[0],
        email,
        password: "GOOGLE_OAUTH",
        role: "user",
        googleId: decoded.uid,
        authProvider: "google"
      });
    } else {
      if (!user.googleId) user.googleId = decoded.uid;
      user.authProvider = "google";
      await user.save();
    }

    await resolveOrCreateCompany({ user, displayName });
    const company = user.companyId ? await Company.findById(user.companyId).lean() : null;
    const billing = await buildSubscriptionContext(user);
    const companyRole = resolveCompanyRoleForAuth(user);

    const token = jwt.sign(
      {
        userId: user._id,
        id: user._id,
        email: user.email,
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

    return res.status(200).json({
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
        companyRole,
        companyName: company?.name || "",
        companySlug: company?.slug || "",
        cloudinaryFolderRoot: company?.cloudinaryFolderRoot || "",
        ...billing,
        ...buildAgentAccessPayload(user)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Firebase auth failed", error: error.message });
  }
};

module.exports = firebaseAuth;
