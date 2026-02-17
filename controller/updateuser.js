const User = require("../model/loginmodel");

const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, twilioData = {} } = req.body;

    const target = await User.findById(userId).select("role");
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role !== "admin") {
      return res.status(400).json({ message: "Only admin accounts can be updated from this endpoint" });
    }

    const updateData = {};
    if (typeof username !== "undefined") updateData.username = username;
    if (typeof email !== "undefined") updateData.email = email;

    // Accept both nested payload (twilioData) and top-level fields
    const normalizedTwilioId =
      typeof twilioData.twilioId !== "undefined" ? twilioData.twilioId : req.body.twilioId;
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

    if (typeof normalizedTwilioId !== "undefined") {
      updateData.twilioid = String(normalizedTwilioId).trim();
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

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true });

    return res.status(200).json({
      message: "Admin updated successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        twilioId: updatedUser.twilioid || "",
        whatsappId: updatedUser.whatsappid || "",
        whatsappToken: updatedUser.whatsapptoken || "",
        whatsappBusiness: updatedUser.whatsappbussiness || "",
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update user", error: error.message });
  }
};

module.exports = updateUser;
