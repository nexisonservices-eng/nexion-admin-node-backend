const User = require("../model/loginmodel");
const mongoose = require("mongoose");

// Super Admin updates Twilio/WhatsApp credentials for a selected Admin account.
const admindata = async (req, res) => {
  try {
    const {
      adminId,
      twilioId,
      whatsappId,
      whatsappToken,
      whatsappBusiness,
      whatsappbussiness,
      phoneNumber,
      phonenumber,
      missedCallWebhook,
      missedcallwebhook
    } = req.body;

    const normalizedWhatsappBusiness =
      typeof whatsappBusiness !== "undefined" ? whatsappBusiness : whatsappbussiness;
    const normalizedPhoneNumber =
      typeof phoneNumber !== "undefined" ? phoneNumber : phonenumber;
    const normalizedMissedCallWebhook =
      typeof missedCallWebhook !== "undefined" ? missedCallWebhook : missedcallwebhook;

    if (!adminId) {
      return res.status(400).json({ message: "adminId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({ message: "Invalid adminId" });
    }

    const targetAdmin = await User.findOne({ _id: adminId, role: "admin" });
    if (!targetAdmin) {
      return res.status(404).json({ message: "Admin user not found" });
    }

    const updateData = {};
    if (typeof twilioId !== "undefined") updateData.twilioid = String(twilioId || "").trim();
    if (typeof whatsappId !== "undefined") updateData.whatsappid = String(whatsappId || "").trim();
    if (typeof whatsappToken !== "undefined") updateData.whatsapptoken = String(whatsappToken || "").trim();
    if (typeof normalizedWhatsappBusiness !== "undefined") {
      updateData.whatsappbussiness = String(normalizedWhatsappBusiness || "").trim();
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

    const updatedUser = await User.findByIdAndUpdate(adminId, updateData, { new: true });

    return res.status(200).json({
      message: "Admin credentials updated successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        twilioId: updatedUser.twilioid || "",
        whatsappId: updatedUser.whatsappid || "",
        whatsappToken: updatedUser.whatsapptoken || "",
        whatsappBusiness: updatedUser.whatsappbussiness || "",
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
