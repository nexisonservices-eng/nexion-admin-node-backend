const User = require("../model/loginmodel");

const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, role, twilioData = {} } = req.body;

    const target = await User.findById(userId).select("role");
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "superadmin") {
      return res.status(400).json({ message: "Superadmin accounts cannot be updated from this endpoint" });
    }

    const updateData = {};
    if (typeof username !== "undefined") updateData.username = username;
    if (typeof email !== "undefined") updateData.email = email;
    if (typeof role !== "undefined") {
      const normalizedRole = String(role || "").trim().toLowerCase();
      if (!["user", "admin"].includes(normalizedRole)) {
        return res.status(400).json({ message: "Role must be either user or admin" });
      }
      updateData.role = normalizedRole;
    }

    // Accept both nested payload (twilioData) and top-level fields
    const normalizedTwilioAccountSid =
      typeof twilioData.twilioAccountSid !== "undefined" ? twilioData.twilioAccountSid : req.body.twilioAccountSid;
    const normalizedTwilioAuthToken =
      typeof twilioData.twilioAuthToken !== "undefined" ? twilioData.twilioAuthToken : req.body.twilioAuthToken;
    const normalizedTwilioPhoneNumber =
      typeof twilioData.twilioPhoneNumber !== "undefined" ? twilioData.twilioPhoneNumber : req.body.twilioPhoneNumber;
    const normalizedWhatsappId =
      typeof twilioData.whatsappId !== "undefined" ? twilioData.whatsappId : req.body.whatsappId;
    const normalizedWhatsappToken =
      typeof twilioData.whatsappToken !== "undefined"
        ? twilioData.whatsappToken
        : req.body.whatsappToken;
    const normalizedWhatsappBusiness =
      typeof twilioData.whatsappBusiness !== "undefined"
        ? twilioData.whatsappBusiness
        : req.body.whatsappBusiness;
    const normalizedPhoneNumber =
      typeof twilioData.phoneNumber !== "undefined"
        ? twilioData.phoneNumber
        : req.body.phoneNumber;
    const normalizedMissedCallWebhook =
      typeof twilioData.missedCallWebhook !== "undefined"
        ? twilioData.missedCallWebhook
        : req.body.missedCallWebhook;
    if (typeof normalizedTwilioAccountSid !== "undefined") {
      updateData.twilioaccountsid = String(normalizedTwilioAccountSid).trim();
    }
    if (typeof normalizedTwilioAuthToken !== "undefined") {
      updateData.twilioauthtoken = String(normalizedTwilioAuthToken).trim();
    }
    if (typeof normalizedTwilioPhoneNumber !== "undefined") {
      updateData.twiliophonenumber = String(normalizedTwilioPhoneNumber).trim();
    }
    if (typeof normalizedWhatsappId !== "undefined") {
      updateData.whatsappid = String(normalizedWhatsappId).trim();
    }
    if (typeof normalizedWhatsappToken !== "undefined") {
      updateData.whatsapptoken = String(normalizedWhatsappToken).trim();
    }
    if (typeof normalizedWhatsappBusiness !== "undefined") {
      updateData.whatsappbussiness = String(normalizedWhatsappBusiness).trim();
    }
    if (typeof normalizedPhoneNumber !== "undefined") {
      updateData.phonenumber = String(normalizedPhoneNumber).trim();
    }
    if (typeof normalizedMissedCallWebhook !== "undefined") {
      updateData.missedcallwebhook = String(normalizedMissedCallWebhook).trim();
    }

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });

    return res.status(200).json({
      message: "User updated successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        twilioAccountSid: updatedUser.twilioaccountsid || "",
        twilioAuthToken: updatedUser.twilioauthtoken || "",
        twilioPhoneNumber: updatedUser.twiliophonenumber || updatedUser.phonenumber || "",
        whatsappId: updatedUser.whatsappid || "",
        whatsappToken: updatedUser.whatsapptoken || "",
        whatsappBusiness: updatedUser.whatsappbussiness || "",
        phoneNumber: updatedUser.phonenumber || "",
        missedCallWebhook: updatedUser.missedcallwebhook || "",
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user", error: error.message });
  }
};

module.exports = updateUser;



