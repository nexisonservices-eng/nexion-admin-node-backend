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

module.exports = getUserCredentials;
module.exports.getUserByWhatsAppId = getUserByWhatsAppId;
