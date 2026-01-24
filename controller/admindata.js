const User = require("../model/loginmodel");

// Save Twilio & WhatsApp info for the logged-in user
const admindata = async (req, res) => {
  try {
    const { twilioId, whatsappId, whatsappToken, whatsappBusiness } = req.body;

    // Validation
    if (!twilioId || !whatsappId || !whatsappToken || !whatsappBusiness) {
      return res.status(400).json({
        message: "All Twilio and WhatsApp fields are required",
      });
    }

    // Get logged-in user from JWT middleware
    const userId = req.user.id;
    const username = req.user.username;

    // Update ONLY the logged-in user's record
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        twilioid: twilioId,
        whatsappid: whatsappId,
        whatsapptoken: whatsappToken,
        whatsappbussiness: whatsappBusiness,
        createdBy: userId,
        createdByName: username,
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ INCLUDE SAVED DATA IN RESPONSE
    res.status(200).json({
      message: "Twilio & WhatsApp data saved successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,

        // 👇 Added fields
        twilioid: updatedUser.twilioid,
        whatsappid: updatedUser.whatsappid,
        whatsapptoken: updatedUser.whatsapptoken,
        whatsappbussiness: updatedUser.whatsappbussiness,

        createdBy: updatedUser.createdBy,
        createdByName: updatedUser.createdByName,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to save admin data",
      error: error.message,
    });
  }
};

module.exports = admindata;
