const UsageLog = require("../model/usageLog");

const recordUsage = async (req, res) => {
  try {
    const { companyId, usageType, count, metadata } = req.body || {};
    if (!companyId || !usageType) {
      return res.status(400).json({ message: "companyId and usageType are required" });
    }
    const usage = await UsageLog.create({
      companyId,
      userId: req.user?.id || null,
      usageType,
      count: Number(count || 1),
      metadata: metadata || {}
    });
    res.json({ success: true, data: usage });
  } catch (error) {
    res.status(500).json({ message: "Failed to record usage", error: error.message });
  }
};

module.exports = {
  recordUsage
};
