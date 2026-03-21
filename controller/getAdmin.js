const User = require("../model/loginmodel");

const getAdmins = async (req, res) => {
  try {
    const users = await User.find({ role: "admin" }).select(
      "username email role twilioaccountsid twilioauthtoken twiliophonenumber whatsappid whatsapptoken whatsappbussiness metaappid metaappsecret metaredirecturi metauseraccesstoken metaadaccountid metaapiversion metajwtsecret phonenumber missedcallwebhook"
    );

    const formattedUsers = users.map((u) => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      role: u.role,
      twilioAccountSid: u.twilioaccountsid || "",
      twilioAuthToken: u.twilioauthtoken || "",
      twilioPhoneNumber: u.twiliophonenumber || u.phonenumber || "",
      whatsappId: u.whatsappid || "",
      whatsappToken: u.whatsapptoken || "",
      whatsappBusiness: u.whatsappbussiness || "",
      metaAppId: u.metaappid || "",
      metaAppSecret: u.metaappsecret || "",
      metaRedirectUri: u.metaredirecturi || "",
      metaUserAccessToken: u.metauseraccesstoken || "",
      metaAdAccountId: u.metaadaccountid || "",
      metaApiVersion: u.metaapiversion || "",
      metaJwtSecret: u.metajwtsecret || "",
      phoneNumber: u.phonenumber || "",
      missedCallWebhook: u.missedcallwebhook || "",
    }));

    return res.status(200).json({ users: formattedUsers });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch admins", error: err.message });
  }
};

module.exports = getAdmins;



