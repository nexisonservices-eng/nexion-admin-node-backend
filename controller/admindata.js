const User = require("../model/loginmodel");
const mongoose = require("mongoose");

// Super Admin updates Twilio/WhatsApp credentials for a selected Admin account.
const admindata = async (req, res) => {
  try {
    const { adminId, twilioId, whatsappId, whatsappToken, whatsappBusiness } = req.body;

    if (!adminId || !twilioId || !whatsappId || !whatsappToken || !whatsappBusiness) {
      return res.status(400).json({
        message: "adminId and all Twilio/WhatsApp fields are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({ message: "Invalid adminId" });
    }

    const targetAdmin = await User.findOne({ _id: adminId, role: "admin" });
    if (!targetAdmin) {
      return res.status(404).json({ message: "Admin user not found" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      adminId,
      {
        twilioid: twilioId,
        whatsappid: whatsappId,
        whatsapptoken: whatsappToken,
        whatsappbussiness: whatsappBusiness,
      },
      { new: true }
    );

    return res.status(200).json({
      message: "Admin credentials updated successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        twilioid: updatedUser.twilioid,
        whatsappid: updatedUser.whatsappid,
        whatsapptoken: updatedUser.whatsapptoken,
        whatsappbussiness: updatedUser.whatsappbussiness,
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
