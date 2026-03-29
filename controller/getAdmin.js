const User = require("../model/loginmodel");
const Subscription = require("../model/subscription");
const { resolveSubscriptionStatus } = require("../utils/billing");

const getAdmins = async (req, res) => {
  try {
    const users = await User.find({ role: "admin" }).select(
      "username email role twilioaccountsid twilioauthtoken twiliophonenumber whatsappid whatsapptoken whatsappbussiness metaappid metaappsecret metaredirecturi metauseraccesstoken metaadaccountid metaapiversion metajwtsecret phonenumber missedcallwebhook"
    );

    const subscriptions = await Subscription.find({
      companyId: { $in: users.map((u) => u.companyId).filter(Boolean) }
    })
      .sort({ createdAt: -1 })
      .lean();
    const latestByCompany = new Map();
    subscriptions.forEach((sub) => {
      const key = String(sub.companyId || "");
      if (key && !latestByCompany.has(key)) latestByCompany.set(key, sub);
    });

    const formattedUsers = await Promise.all(users.map(async (u) => ({
      ...((await resolveSubscriptionStatus(latestByCompany.get(String(u.companyId || "")))) || {}),
      _id: u._id,
      username: u.username,
      email: u.email,
      role: u.role,
      companyId: u.companyId || null,
      companyRole: u.companyRole || "admin",
      companyName: u.companyName || "",
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
    })));

    return res.status(200).json({ users: formattedUsers });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch admins", error: err.message });
  }
};

module.exports = getAdmins;



