const mongoose = require("mongoose");
const User = require("../model/loginmodel");
const { buildSubscriptionContext } = require("./billingController");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "").trim();
const normalizeAutomationMode = (value) => {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "nightly_batch" ? "nightly_batch" : "immediate";
};
const normalizeNightHour = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 21;
};
const normalizeNightMinute = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 59 ? parsed : 0;
};
const normalizeTimezone = (value) => String(value || "").trim() || "Asia/Kolkata";
const normalizeTemplateVariables = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, idx) => ({
      index: Number.isFinite(Number(item?.index)) ? Number(item.index) : idx + 1,
      source: String(item?.source || item?.sourceType || "callerName").trim() || "callerName",
      value: String(item?.value || item?.staticValue || "").trim()
    }))
    .sort((a, b) => a.index - b.index);
};
const maskSecret = (value) => {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) return "*".repeat(text.length);
  return `${"*".repeat(text.length - 4)}${text.slice(-4)}`;
};

const phonesMatch = (a, b) => {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const l10 = left.slice(-10);
  const r10 = right.slice(-10);
  return l10.length === 10 && r10.length === 10 && l10 === r10;
};

const buildSuperadminBilling = () => ({
  planCode: "enterprise",
  featureFlags: {
    broadcastMessaging: true,
    teamInbox: true,
    voiceCampaign: true,
    inboundAutomation: true,
    ivr: true,
    analytics: true,
    workflowAutomation: true,
    adsManager: true,
    outboundVoice: true,
    missedCall: true
  },
  subscriptionStatus: "active",
  trialStart: null,
  trialEnd: null,
  trialUsage: { whatsappMessages: 0, voiceCalls: 0 },
  trialLimits: { whatsappMessages: 50, voiceCalls: 20 },
  documentStatus: "approved",
  workspaceAccessState: "active",
  canPerformActions: true,
  canViewAnalytics: true
});

const formatUserPayload = async (user, billingOverride = null) => {
  const billing = billingOverride || (await buildSubscriptionContext(user));
  return {
    userId: user._id,
    role: user.role,
    username: user.username || "",
    email: user.email || "",
    companyId: user.companyId || null,
    companyRole: user.companyRole || "user",
    companyName: user.companyName || "",
    ...billing,
    twilioAccountSid: user.twilioaccountsid || "",
    twilioAuthToken: user.twilioauthtoken || "",
    twilioPhoneNumber: user.twiliophonenumber || user.phonenumber || "",
    whatsappId: user.whatsappid || "",
    whatsappToken: user.whatsapptoken || "",
    whatsappBusiness: user.whatsappbussiness || "",
    phoneNumber: user.phonenumber || "",
    missedCallWebhook: user.missedcallwebhook || "",
    missedCallAutomationEnabled:
      typeof user.missedcallautomationenabled === "boolean" ? user.missedcallautomationenabled : true,
    missedCallDelayMinutes:
      Number.isFinite(Number(user.missedcalldelayminutes)) ? Number(user.missedcalldelayminutes) : 5,
    missedCallAutomationMode: normalizeAutomationMode(user.missedcallautomationmode),
    missedCallNightHour: normalizeNightHour(user.missedcallnighthour),
    missedCallNightMinute: normalizeNightMinute(user.missedcallnightminute),
    missedCallTimezone: normalizeTimezone(user.missedcalltimezone),
    missedCallTemplateName: user.missedcalltemplatename || "",
    missedCallTemplateLanguage: user.missedcalltemplatelanguage || "en_US",
    missedCallTemplateVariables: normalizeTemplateVariables(user.missedcalltemplatevariables)
  };
};

const getUserCredentials = async (req, res) => {
  try {
    const requesterId = req.user?.userId || req.user?.id;
    const requesterEmail = req.user?.email;
    const requesterRole = req.user?.role;
    const { adminId } = req.query;

    let user = null;
    const isRequesterSuperAdmin = String(requesterRole || "").toLowerCase() === "superadmin";

    if (isRequesterSuperAdmin && adminId) {
      if (!mongoose.Types.ObjectId.isValid(adminId)) {
        return res.status(400).json({ message: "Invalid adminId" });
      }
      user = await User.findOne({ _id: adminId, role: "admin" }).lean();
      if (!user) {
        return res.status(404).json({ message: "Admin user not found" });
      }
    } else if (isRequesterSuperAdmin) {
      user = {
        _id: requesterId || "superadmin-id",
        role: "superadmin",
        username: req.user?.username || "Super Admin",
        email: requesterEmail || "",
        companyId: null,
        companyRole: "superadmin",
        companyName: "Nexion"
      };
      return res.json({
        success: true,
        data: await formatUserPayload(user, buildSuperadminBilling())
      });
    } else {
      if (requesterId && mongoose.Types.ObjectId.isValid(requesterId)) {
        user = await User.findById(requesterId).lean();
      }

      if (!user && requesterEmail) {
        user = await User.findOne({ email: requesterEmail }).lean();
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    return res.json({
      success: true,
      data: {
        userId: user._id,
        role: user.role,
        email: user.email || "",
        companyId: user.companyId || null,
        companyRole: user.companyRole || "user",
        planCode: planContext.planCode,
        featureFlags: planContext.featureFlags,
        subscriptionStatus: planContext.subscriptionStatus,
        twilioAccountSid: user.twilioaccountsid || "",
        twilioAuthToken: user.twilioauthtoken || "",
        twilioPhoneNumber: user.twiliophonenumber || user.phonenumber || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
        metaAppId: user.metaappid || "",
        metaAppSecret: user.metaappsecret || "",
        metaRedirectUri: user.metaredirecturi || "",
        metaUserAccessToken: user.metauseraccesstoken || "",
        metaAdAccountId: user.metaadaccountid || "",
        metaApiVersion: user.metaapiversion || "",
        metaJwtSecret: user.metajwtsecret || "",
        phoneNumber: user.phonenumber || "",
        missedCallWebhook: user.missedcallwebhook || "",
        missedCallAutomationEnabled:
          typeof user.missedcallautomationenabled === "boolean"
            ? user.missedcallautomationenabled
            : true,
        missedCallDelayMinutes:
          Number.isFinite(Number(user.missedcalldelayminutes))
            ? Number(user.missedcalldelayminutes)
            : 5,
        missedCallAutomationMode: normalizeAutomationMode(user.missedcallautomationmode),
        missedCallNightHour: normalizeNightHour(user.missedcallnighthour),
        missedCallNightMinute: normalizeNightMinute(user.missedcallnightminute),
        missedCallTimezone: normalizeTimezone(user.missedcalltimezone),
        missedCallTemplateName: user.missedcalltemplatename || "",
        missedCallTemplateLanguage: user.missedcalltemplatelanguage || "en_US",
        missedCallTemplateVariables: normalizeTemplateVariables(user.missedcalltemplatevariables),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch user credentials",
      error: error.message
    });
  }
};

const getUserByWhatsAppId = async (req, res) => {
  try {
    const { whatsappId } = req.params;
    if (!whatsappId) {
      return res.status(400).json({ message: "whatsappId is required" });
    }

    const user = await User.findOne({ whatsappid: whatsappId }).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found for whatsappId" });
    }

    return res.json({ success: true, data: { userId: user._id, email: user.email || null } });
  } catch (error) {
    return res.status(500).json({ message: "Failed to resolve user by whatsappId", error: error.message });
  }
};

const getUserByPhoneNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber || !normalizePhone(phoneNumber)) {
      return res.status(400).json({ message: "Valid phoneNumber is required" });
    }

    const users = await User.find({ phonenumber: { $exists: true, $ne: "" } }).lean();
    const found = users.find((u) => phonesMatch(u.phonenumber, phoneNumber));
    if (!found) {
      return res.status(404).json({ message: "User not found for phoneNumber" });
    }

    return res.json({ success: true, data: { userId: found._id, email: found.email || null } });
  } catch (error) {
    return res.status(500).json({ message: "Failed to resolve user by phoneNumber", error: error.message });
  }
};

const updateUserCredentialsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const payload = req.body || {};
    const setData = {};
    if (Object.prototype.hasOwnProperty.call(payload, "twilioAccountSid")) setData.twilioaccountsid = String(payload.twilioAccountSid || "").trim();
    if (Object.prototype.hasOwnProperty.call(payload, "twilioAuthToken")) setData.twilioauthtoken = String(payload.twilioAuthToken || "").trim();
    if (Object.prototype.hasOwnProperty.call(payload, "twilioPhoneNumber")) setData.twiliophonenumber = String(payload.twilioPhoneNumber || "").trim();
    if (Object.prototype.hasOwnProperty.call(payload, "whatsappId")) setData.whatsappid = String(payload.whatsappId || "").trim();
    if (Object.prototype.hasOwnProperty.call(payload, "whatsappToken")) setData.whatsapptoken = String(payload.whatsappToken || "").trim();
    if (Object.prototype.hasOwnProperty.call(payload, "whatsappBusiness") || Object.prototype.hasOwnProperty.call(payload, "whatsappbussiness")) {
      setData.whatsappbussiness = String(payload.whatsappBusiness ?? payload.whatsappbussiness ?? "").trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'metaAppId') ||
      Object.prototype.hasOwnProperty.call(payload, 'metaappid')
    ) {
      setData.metaappid = String(payload.metaAppId ?? payload.metaappid ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'metaAppSecret') ||
      Object.prototype.hasOwnProperty.call(payload, 'metaappsecret')
    ) {
      setData.metaappsecret = String(payload.metaAppSecret ?? payload.metaappsecret ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'metaRedirectUri') ||
      Object.prototype.hasOwnProperty.call(payload, 'metaredirecturi')
    ) {
      setData.metaredirecturi = String(payload.metaRedirectUri ?? payload.metaredirecturi ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'metaUserAccessToken') ||
      Object.prototype.hasOwnProperty.call(payload, 'metauseraccesstoken')
    ) {
      setData.metauseraccesstoken = String(payload.metaUserAccessToken ?? payload.metauseraccesstoken ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'metaAdAccountId') ||
      Object.prototype.hasOwnProperty.call(payload, 'metaadaccountid')
    ) {
      setData.metaadaccountid = String(payload.metaAdAccountId ?? payload.metaadaccountid ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'metaApiVersion') ||
      Object.prototype.hasOwnProperty.call(payload, 'metaapiversion')
    ) {
      setData.metaapiversion = String(payload.metaApiVersion ?? payload.metaapiversion ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'metaJwtSecret') ||
      Object.prototype.hasOwnProperty.call(payload, 'metajwtsecret')
    ) {
      setData.metajwtsecret = String(payload.metaJwtSecret ?? payload.metajwtsecret ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'phoneNumber') ||
      Object.prototype.hasOwnProperty.call(payload, 'phonenumber')
    ) {
      setData.phonenumber = String(payload.phoneNumber ?? payload.phonenumber ?? '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallWebhook") || Object.prototype.hasOwnProperty.call(payload, "missedcallwebhook")) {
      setData.missedcallwebhook = String(payload.missedCallWebhook ?? payload.missedcallwebhook ?? "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallAutomationEnabled")) {
      setData.missedcallautomationenabled = Boolean(payload.missedCallAutomationEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallDelayMinutes")) {
      const delay = Number(payload.missedCallDelayMinutes);
      if (!Number.isFinite(delay) || delay < 0) {
        return res.status(400).json({ message: "missedCallDelayMinutes must be a non-negative number" });
      }
      setData.missedcalldelayminutes = delay;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallAutomationMode")) {
      setData.missedcallautomationmode = normalizeAutomationMode(payload.missedCallAutomationMode);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallNightHour")) {
      const hour = Number(payload.missedCallNightHour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return res.status(400).json({ message: "missedCallNightHour must be an integer between 0 and 23" });
      }
      setData.missedcallnighthour = hour;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallNightMinute")) {
      const minute = Number(payload.missedCallNightMinute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        return res.status(400).json({ message: "missedCallNightMinute must be an integer between 0 and 59" });
      }
      setData.missedcallnightminute = minute;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallTimezone")) setData.missedcalltimezone = normalizeTimezone(payload.missedCallTimezone);
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallTemplateName")) setData.missedcalltemplatename = String(payload.missedCallTemplateName || "").trim();
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallTemplateLanguage")) setData.missedcalltemplatelanguage = String(payload.missedCallTemplateLanguage || "").trim() || "en_US";
    if (Object.prototype.hasOwnProperty.call(payload, "missedCallTemplateVariables")) setData.missedcalltemplatevariables = normalizeTemplateVariables(payload.missedCallTemplateVariables);

    if (Object.keys(setData).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }

    Object.assign(user, setData);
    await user.save();
    const planContext = await buildPlanContext(user.companyId);
    return res.json({
      success: true,
      data: {
        userId: user._id,
        companyId: user.companyId || null,
        companyRole: user.companyRole || "user",
        planCode: planContext.planCode,
        featureFlags: planContext.featureFlags,
        subscriptionStatus: planContext.subscriptionStatus,
        email: user.email || "",
        twilioAccountSid: user.twilioaccountsid || "",
        twilioAuthToken: user.twilioauthtoken || "",
        twilioPhoneNumber: user.twiliophonenumber || user.phonenumber || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
        metaAppId: user.metaappid || "",
        metaAppSecret: user.metaappsecret || "",
        metaRedirectUri: user.metaredirecturi || "",
        metaUserAccessToken: user.metauseraccesstoken || "",
        metaAdAccountId: user.metaadaccountid || "",
        metaApiVersion: user.metaapiversion || "",
        metaJwtSecret: user.metajwtsecret || "",
        phoneNumber: user.phonenumber || "",
        missedCallWebhook: user.missedcallwebhook || "",
        missedCallAutomationEnabled:
          typeof user.missedcallautomationenabled === "boolean"
            ? user.missedcallautomationenabled
            : true,
        missedCallDelayMinutes:
          Number.isFinite(Number(user.missedcalldelayminutes))
            ? Number(user.missedcalldelayminutes)
            : 5,
        missedCallAutomationMode: normalizeAutomationMode(user.missedcallautomationmode),
        missedCallNightHour: normalizeNightHour(user.missedcallnighthour),
        missedCallNightMinute: normalizeNightMinute(user.missedcallnightminute),
        missedCallTimezone: normalizeTimezone(user.missedcalltimezone),
        missedCallTemplateName: user.missedcalltemplatename || "",
        missedCallTemplateLanguage: user.missedcalltemplatelanguage || "en_US",
        missedCallTemplateVariables: normalizeTemplateVariables(user.missedcalltemplatevariables),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user credentials by userId", error: error.message });
  }
};

const getUserCredentialsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const planContext = await buildPlanContext(user.companyId);
    return res.json({
      success: true,
      data: {
        userId: user._id,
        companyId: user.companyId || null,
        companyRole: user.companyRole || "user",
        planCode: planContext.planCode,
        featureFlags: planContext.featureFlags,
        subscriptionStatus: planContext.subscriptionStatus,
        email: user.email || "",
        twilioAccountSid: user.twilioaccountsid || "",
        twilioAuthToken: user.twilioauthtoken || "",
        twilioPhoneNumber: user.twiliophonenumber || user.phonenumber || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
        metaAppId: user.metaappid || "",
        metaAppSecret: user.metaappsecret || "",
        metaRedirectUri: user.metaredirecturi || "",
        metaUserAccessToken: user.metauseraccesstoken || "",
        metaAdAccountId: user.metaadaccountid || "",
        metaApiVersion: user.metaapiversion || "",
        metaJwtSecret: user.metajwtsecret || "",
        phoneNumber: user.phonenumber || "",
        missedCallWebhook: user.missedcallwebhook || "",
        missedCallAutomationEnabled:
          typeof user.missedcallautomationenabled === "boolean"
            ? user.missedcallautomationenabled
            : true,
        missedCallDelayMinutes:
          Number.isFinite(Number(user.missedcalldelayminutes))
            ? Number(user.missedcalldelayminutes)
            : 5,
        missedCallAutomationMode: normalizeAutomationMode(user.missedcallautomationmode),
        missedCallNightHour: normalizeNightHour(user.missedcallnighthour),
        missedCallNightMinute: normalizeNightMinute(user.missedcallnightminute),
        missedCallTimezone: normalizeTimezone(user.missedcalltimezone),
        missedCallTemplateName: user.missedcalltemplatename || "",
        missedCallTemplateLanguage: user.missedcalltemplatelanguage || "en_US",
        missedCallTemplateVariables: normalizeTemplateVariables(user.missedcalltemplatevariables),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch user credentials by userId", error: error.message });
  }
};

const buildTwilioCredentialPayload = (user) => ({
  userId: user._id,
  twilioAccountSid: user.twilioaccountsid || "",
  twilioAuthToken: user.twilioauthtoken || "",
  twilioPhoneNumber: user.twiliophonenumber || user.phonenumber || "",
  masked: {
    twilioAccountSid: maskSecret(user.twilioaccountsid || ""),
    twilioAuthToken: user.twilioauthtoken || "",
    twilioPhoneNumber: maskSecret(user.twiliophonenumber || user.phonenumber || "")
  }
});

const getTwilioCredentialsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const data = buildTwilioCredentialPayload(user);
    if (!data.twilioAccountSid || !data.twilioAuthToken || !data.twilioPhoneNumber) {
      return res.status(404).json({ message: "Twilio credentials not configured for user" });
    }

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch Twilio credentials by userId", error: error.message });
  }
};

const getTwilioCredentialsByPhoneNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber || !normalizePhone(phoneNumber)) {
      return res.status(400).json({ message: "Valid phoneNumber is required" });
    }

    const users = await User.find({
      $or: [
        { twiliophonenumber: { $exists: true, $ne: "" } },
        { phonenumber: { $exists: true, $ne: "" } }
      ]
    }).lean();
    const found = users.find((u) => phonesMatch(u.twiliophonenumber || u.phonenumber, phoneNumber));
    if (!found) return res.status(404).json({ message: "User not found for phoneNumber" });

    const data = buildTwilioCredentialPayload(found);
    if (!data.twilioAccountSid || !data.twilioAuthToken || !data.twilioPhoneNumber) {
      return res.status(404).json({ message: "Twilio credentials not configured for user" });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch Twilio credentials by phoneNumber", error: error.message });
  }
};

module.exports = getUserCredentials;
module.exports.getUserByWhatsAppId = getUserByWhatsAppId;
module.exports.getUserByPhoneNumber = getUserByPhoneNumber;
module.exports.getUserCredentialsByUserId = getUserCredentialsByUserId;
module.exports.getTwilioCredentialsByUserId = getTwilioCredentialsByUserId;
module.exports.getTwilioCredentialsByPhoneNumber = getTwilioCredentialsByPhoneNumber;
module.exports.updateUserCredentialsByUserId = updateUserCredentialsByUserId;
