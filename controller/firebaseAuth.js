const jwt = require("jsonwebtoken");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const Subscription = require("../model/subscription");
const { getFirebaseAdmin } = require("../config/firebaseAdmin");
const { buildPlanContext, getDefaultTrial } = require("../utils/planUtils");
const { ensureCompanyFolders, sanitizeCompanyName } = require("../config/cloudinary");

const resolveOrCreateCompany = async ({ user, displayName }) => {
  if (user.companyId) return user.companyId;

  const name = displayName || user.username || user.email || "Company";
  const slug = sanitizeCompanyName(name);
  const company = await Company.create({
    name,
    slug,
    createdBy: user._id,
    status: "active",
    trialStart: new Date(),
    trialEnd: getDefaultTrial().trialEnd
  });

  await ensureCompanyFolders({
    companyName: company.name,
    companyId: company._id
  });

  const trial = getDefaultTrial();
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
      console.error("Firebase Admin init error:", initError);
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
    if (!user) {
      user = await User.findOne({ email });
    }

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

    const companyId = await resolveOrCreateCompany({ user, displayName });
    const planContext = await buildPlanContext(companyId);

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
        companyRole: user.companyRole || "user",
        planCode: planContext.planCode,
        featureFlags: planContext.featureFlags,
        subscriptionStatus: planContext.subscriptionStatus
      }
    });
  } catch (error) {
    console.error("Firebase auth error:", error);
    return res.status(500).json({ message: "Firebase auth failed", error: error.message });
  }
};

module.exports = firebaseAuth;
