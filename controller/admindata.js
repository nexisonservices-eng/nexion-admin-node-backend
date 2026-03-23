const User = require("../model/loginmodel");
const mongoose = require("mongoose");

// Super Admin updates Twilio/WhatsApp credentials for a selected user/admin account.
const admindata = async (req, res) => {
  try {
    const {
      adminId,
      userId,
      twilioAccountSid,
      twilioAuthToken,
      twilioPhoneNumber,
      whatsappId,
      whatsappToken,
      whatsappBusiness,
      whatsappbussiness,
      metaAppId,
      metaappId,
      metaAppSecret,
      metaappSecret,
      metaRedirectUri,
      metaredirecturi,
      metaUserAccessToken,
      metauseraccesstoken,
      metaAdAccountId,
      metaadaccountid,
      metaApiVersion,
      metaapiVersion,
      metaJwtSecret,
      metajwtSecret,
      phoneNumber,
      phonenumber,
      missedCallWebhook,
      missedcallwebhook
    } = req.body;

    const normalizedWhatsappBusiness =
      typeof whatsappBusiness !== "undefined" ? whatsappBusiness : whatsappbussiness;
    const normalizedMetaAppId =
      typeof metaAppId !== "undefined" ? metaAppId : metaappId;
    const normalizedMetaAppSecret =
      typeof metaAppSecret !== "undefined" ? metaAppSecret : metaappSecret;
    const normalizedMetaRedirectUri =
      typeof metaRedirectUri !== "undefined" ? metaRedirectUri : metaredirecturi;
    const normalizedMetaUserAccessToken =
      typeof metaUserAccessToken !== "undefined" ? metaUserAccessToken : metauseraccesstoken;
    const normalizedMetaAdAccountId =
      typeof metaAdAccountId !== "undefined" ? metaAdAccountId : metaadaccountid;
    const normalizedMetaApiVersion =
      typeof metaApiVersion !== "undefined" ? metaApiVersion : metaapiVersion;
    const normalizedMetaJwtSecret =
      typeof metaJwtSecret !== "undefined" ? metaJwtSecret : metajwtSecret;
    const normalizedPhoneNumber =
      typeof phoneNumber !== "undefined" ? phoneNumber : phonenumber;
    const normalizedMissedCallWebhook =
      typeof missedCallWebhook !== "undefined" ? missedCallWebhook : missedcallwebhook;

    const targetUserId = adminId || userId;

    if (!targetUserId) {
      return res.status(400).json({ message: "adminId or userId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ message: "Invalid target user id" });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (String(targetUser.role || "").toLowerCase() === "superadmin") {
      return res.status(400).json({ message: "Superadmin credentials cannot be edited here" });
    }

    const updateData = {};
    if (typeof twilioAccountSid !== "undefined") updateData.twilioaccountsid = String(twilioAccountSid || "").trim();
    if (typeof twilioAuthToken !== "undefined") updateData.twilioauthtoken = String(twilioAuthToken || "").trim();
    if (typeof twilioPhoneNumber !== "undefined") updateData.twiliophonenumber = String(twilioPhoneNumber || "").trim();
    if (typeof whatsappId !== "undefined") updateData.whatsappid = String(whatsappId || "").trim();
    if (typeof whatsappToken !== "undefined") updateData.whatsapptoken = String(whatsappToken || "").trim();
    if (typeof normalizedWhatsappBusiness !== "undefined") {
      updateData.whatsappbussiness = String(normalizedWhatsappBusiness || "").trim();
    }
    if (typeof normalizedMetaAppId !== "undefined") {
      updateData.metaappid = String(normalizedMetaAppId || "").trim();
    }
    if (typeof normalizedMetaAppSecret !== "undefined") {
      updateData.metaappsecret = String(normalizedMetaAppSecret || "").trim();
    }
    if (typeof normalizedMetaRedirectUri !== "undefined") {
      updateData.metaredirecturi = String(normalizedMetaRedirectUri || "").trim();
    }
    if (typeof normalizedMetaUserAccessToken !== "undefined") {
      updateData.metauseraccesstoken = String(normalizedMetaUserAccessToken || "").trim();
    }
    if (typeof normalizedMetaAdAccountId !== "undefined") {
      updateData.metaadaccountid = String(normalizedMetaAdAccountId || "").trim();
    }
    if (typeof normalizedMetaApiVersion !== "undefined") {
      updateData.metaapiversion = String(normalizedMetaApiVersion || "").trim();
    }
    if (typeof normalizedMetaJwtSecret !== "undefined") {
      updateData.metajwtsecret = String(normalizedMetaJwtSecret || "").trim();
    }
    if (typeof normalizedPhoneNumber !== "undefined") {
      updateData.phonenumber = String(normalizedPhoneNumber || "").trim();
    }
    if (typeof normalizedMissedCallWebhook !== "undefined") {
      updateData.missedcallwebhook = String(normalizedMissedCallWebhook || "").trim();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No credential fields provided to update" });
    }

    const updatedUser = await User.findByIdAndUpdate(targetUserId, updateData, { new: true });

    return res.status(200).json({
      message: "User credentials updated successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        twilioAccountSid: updatedUser.twilioaccountsid || "",
        twilioAuthToken: updatedUser.twilioauthtoken || "",
        twilioPhoneNumber: updatedUser.twiliophonenumber || updatedUser.phonenumber || "",
        whatsappId: updatedUser.whatsappid || "",
        whatsappToken: updatedUser.whatsapptoken || "",
        whatsappBusiness: updatedUser.whatsappbussiness || "",
        metaAppId: updatedUser.metaappid || "",
        metaAppSecret: updatedUser.metaappsecret || "",
        metaRedirectUri: updatedUser.metaredirecturi || "",
        metaUserAccessToken: updatedUser.metauseraccesstoken || "",
        metaAdAccountId: updatedUser.metaadaccountid || "",
        metaApiVersion: updatedUser.metaapiversion || "",
        metaJwtSecret: updatedUser.metajwtsecret || "",
        phoneNumber: updatedUser.phonenumber || "",
        missedCallWebhook: updatedUser.missedcallwebhook || "",
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to save admin data",
      error: error.message,
    });
  }
};

module.exports = admindata;



