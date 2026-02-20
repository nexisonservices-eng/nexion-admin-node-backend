const mongoose = require("mongoose");
const User = require("../model/loginmodel");

const getUserCredentials = async (req, res) => {
  try {
    const requesterId = req.user?.userId || req.user?.id;
    const requesterEmail = req.user?.email;
    const requesterRole = req.user?.role;
    const { adminId } = req.query;

    let user = null;

    // Super Admin can read credentials for a specific Admin by adminId.
    if (requesterRole === "superadmin" && adminId) {
      if (!mongoose.Types.ObjectId.isValid(adminId)) {
        return res.status(400).json({ message: "Invalid adminId" });
      }
      user = await User.findOne({ _id: adminId, role: "admin" }).lean();
      if (!user) {
        return res.status(404).json({ message: "Admin user not found" });
      }
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
        twilioId: user.twilioid || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
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
      error: error.message,
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

    return res.json({
      success: true,
      data: {
        userId: user._id,
        email: user.email || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to resolve user by whatsappId",
      error: error.message,
    });
  }
};

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').trim();
const normalizeAutomationMode = (value) => {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'nightly_batch' ? 'nightly_batch' : 'immediate';
};
const normalizeNightHour = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : 21;
};
const normalizeNightMinute = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 59 ? parsed : 0;
};
const normalizeTimezone = (value) => String(value || '').trim() || 'Asia/Kolkata';
const normalizeTemplateVariables = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, idx) => ({
      index: Number.isFinite(Number(item?.index)) ? Number(item.index) : idx + 1,
      source: String(item?.source || item?.sourceType || 'callerName').trim() || 'callerName',
      value: String(item?.value || item?.staticValue || '').trim()
    }))
    .sort((a, b) => a.index - b.index);
};

const phonesMatch = (a, b) => {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  if (left === right) return true;

  // Fallback for country-code variations (e.g., 9198... vs 98...)
  const l10 = left.slice(-10);
  const r10 = right.slice(-10);
  return l10.length === 10 && r10.length === 10 && l10 === r10;
};

const getUserByPhoneNumber = async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber is required" });
    }

    if (!normalizePhone(phoneNumber)) {
      return res.status(400).json({ message: "Invalid phoneNumber" });
    }

    const user = await User.find({ phonenumber: { $exists: true, $ne: '' } }).lean();
    const found = user.find((u) => phonesMatch(u.phonenumber, phoneNumber));

    if (!found) {
      return res.status(404).json({ message: "User not found for phoneNumber" });
    }

    return res.json({
      success: true,
      data: {
        userId: found._id,
        email: found.email || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to resolve user by phoneNumber",
      error: error.message,
    });
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
    if (Object.prototype.hasOwnProperty.call(payload, 'twilioId')) {
      setData.twilioid = String(payload.twilioId || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'whatsappId')) {
      setData.whatsappid = String(payload.whatsappId || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'whatsappToken')) {
      setData.whatsapptoken = String(payload.whatsappToken || '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'whatsappBusiness') ||
      Object.prototype.hasOwnProperty.call(payload, 'whatsappbussiness')
    ) {
      setData.whatsappbussiness = String(
        payload.whatsappBusiness ?? payload.whatsappbussiness ?? ''
      ).trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'phoneNumber') ||
      Object.prototype.hasOwnProperty.call(payload, 'phonenumber')
    ) {
      setData.phonenumber = String(payload.phoneNumber ?? payload.phonenumber ?? '').trim();
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, 'missedCallWebhook') ||
      Object.prototype.hasOwnProperty.call(payload, 'missedcallwebhook')
    ) {
      setData.missedcallwebhook = String(
        payload.missedCallWebhook ?? payload.missedcallwebhook ?? ''
      ).trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallAutomationEnabled')) {
      setData.missedcallautomationenabled = Boolean(payload.missedCallAutomationEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallDelayMinutes')) {
      const delay = Number(payload.missedCallDelayMinutes);
      if (!Number.isFinite(delay) || delay < 0) {
        return res.status(400).json({ message: "missedCallDelayMinutes must be a non-negative number" });
      }
      setData.missedcalldelayminutes = delay;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallAutomationMode')) {
      setData.missedcallautomationmode = normalizeAutomationMode(payload.missedCallAutomationMode);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallNightHour')) {
      const hour = Number(payload.missedCallNightHour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        return res.status(400).json({ message: "missedCallNightHour must be an integer between 0 and 23" });
      }
      setData.missedcallnighthour = hour;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallNightMinute')) {
      const minute = Number(payload.missedCallNightMinute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        return res.status(400).json({ message: "missedCallNightMinute must be an integer between 0 and 59" });
      }
      setData.missedcallnightminute = minute;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallTimezone')) {
      setData.missedcalltimezone = normalizeTimezone(payload.missedCallTimezone);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallTemplateName')) {
      setData.missedcalltemplatename = String(payload.missedCallTemplateName || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallTemplateLanguage')) {
      setData.missedcalltemplatelanguage = String(payload.missedCallTemplateLanguage || '').trim() || 'en_US';
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'missedCallTemplateVariables')) {
      setData.missedcalltemplatevariables = normalizeTemplateVariables(payload.missedCallTemplateVariables);
    }
    if (Object.keys(setData).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }
    Object.assign(user, setData);
    await user.save();
    return res.json({
      success: true,
      data: {
        userId: user._id,
        email: user.email || "",
        twilioId: user.twilioid || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
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
      message: "Failed to update user credentials by userId",
      error: error.message,
    });
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

    return res.json({
      success: true,
      data: {
        userId: user._id,
        email: user.email || "",
        twilioId: user.twilioid || "",
        whatsappId: user.whatsappid || "",
        whatsappToken: user.whatsapptoken || "",
        whatsappBusiness: user.whatsappbussiness || "",
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
      message: "Failed to fetch user credentials by userId",
      error: error.message,
    });
  }
};

module.exports = getUserCredentials;
module.exports.getUserByWhatsAppId = getUserByWhatsAppId;
module.exports.getUserByPhoneNumber = getUserByPhoneNumber;
module.exports.getUserCredentialsByUserId = getUserCredentialsByUserId;

module.exports.updateUserCredentialsByUserId = updateUserCredentialsByUserId;

