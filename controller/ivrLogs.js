const IVRConversation = require("../model/ivrConversation");

const recordConversation = async (req, res) => {
  try {
    const { companyId, userId, callId, conversation, metadata } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ message: "companyId is required" });
    }
    const entry = await IVRConversation.create({
      companyId,
      userId: userId || null,
      callId: callId || "",
      conversation: conversation || {},
      metadata: metadata || {}
    });
    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ message: "Failed to record IVR conversation", error: error.message });
  }
};

module.exports = { recordConversation };
