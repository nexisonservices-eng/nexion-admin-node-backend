const mongoose = require("mongoose");
const EmailHistoryEntry = require("../model/emailHistoryEntry");

const safeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const formatHistoryTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
};

const hasEmailProviderConfig = () => {
  const smtpConfigured = Boolean(
    String(process.env.SMTP_HOST || process.env.MAIL_HOST || process.env.EMAIL_HOST || "").trim() &&
      String(process.env.SMTP_USER || process.env.MAIL_USER || process.env.EMAIL_USER || "").trim() &&
      String(
        process.env.SMTP_PASS ||
          process.env.MAIL_PASS ||
          process.env.EMAIL_PASS ||
          process.env.EMAIL_PASSWORD ||
          ""
      ).trim()
  );
  const resendConfigured = Boolean(String(process.env.RESEND_API_KEY || "").trim());
  return smtpConfigured || resendConfigured;
};

const buildSystemStatus = () => {
  const dbConnected = mongoose.connection.readyState === 1;
  return [
    `Database ${dbConnected ? "Connected" : "Disconnected"}`,
    `Email Provider ${hasEmailProviderConfig() ? "Configured" : "Not Configured"}`,
    "History Logging Enabled"
  ];
};

const buildHistoryRow = (entry) => {
  const total = safeNumber(entry.totalRecipients || entry.total || entry.sentCount);
  const sent = safeNumber(entry.sentCount);
  const failed = safeNumber(entry.failedCount);
  const delivered = safeNumber(entry.deliveredCount || sent - failed);

  return {
    id: String(entry._id || `${entry.subject}-${entry.sentAt || entry.createdAt}`),
    subject: String(entry.subject || "Untitled email"),
    timestamp: formatHistoryTimestamp(entry.sentAt || entry.createdAt),
    total: String(total),
    sent: String(sent || delivered),
    failed: String(failed),
    status: entry.status || (failed > 0 ? "partial" : "sent"),
    preview: String(entry.preview || ""),
    sourceName: String(entry.sourceName || "Email Automation")
  };
};

const computeDashboardPayload = (entries) => {
  const rows = entries.map(buildHistoryRow);
  const totals = entries.reduce(
    (acc, entry) => {
      const total = safeNumber(entry.totalRecipients || entry.sentCount);
      const sent = safeNumber(entry.sentCount);
      const delivered = safeNumber(entry.deliveredCount || sent - safeNumber(entry.failedCount));
      const replies = safeNumber(entry.replyCount);
      const failed = safeNumber(entry.failedCount);

      acc.totalRecipients += total;
      acc.sent += sent;
      acc.delivered += delivered || sent;
      acc.replies += replies;
      acc.failed += failed;
      return acc;
    },
    { totalRecipients: 0, sent: 0, delivered: 0, replies: 0, failed: 0 }
  );

  const sentRate = totals.sent > 0 ? Math.round((totals.delivered / totals.sent) * 100) : 0;
  const replyRate = totals.sent > 0 ? Math.round((totals.replies / totals.sent) * 100) : 0;

  return {
    dashboardStats: [
      { label: "Sent Email", value: totals.sent, delta: "+0%", tone: "green", icon: "send" },
      { label: "Delivered", value: totals.delivered, delta: "+0%", tone: "blue", icon: "check" },
      { label: "Replies", value: totals.replies, delta: "+0%", tone: "violet", icon: "eye" },
      {
        label: "Failed",
        value: totals.failed,
        delta: totals.failed > 0 ? "-0%" : "+0%",
        tone: "red",
        icon: "alert"
      }
    ],
    performanceMetrics: [
      { label: "Avg Response Time", value: "N/A" },
      { label: "Response Rate", value: `${replyRate}%` },
      { label: "Customer Satisfaction", value: "0/5" }
    ],
    recentHistory: rows,
    messageAnalytics: [
      { icon: "send", label: "Sent", value: `${totals.sent} messages` },
      { icon: "check", label: "Delivered", value: `${totals.delivered} messages` },
      { icon: "eye", label: "Replies", value: `${totals.replies} messages` },
      { icon: "alert", label: "Failed", value: `${totals.failed} messages` },
      { icon: "trend", label: "Success Rate", value: `${sentRate}%` }
    ],
    systemStatus: buildSystemStatus(),
    summary: {
      totalRecipients: totals.totalRecipients,
      sent: totals.sent,
      delivered: totals.delivered,
      replies: totals.replies,
      failed: totals.failed,
      responseRate: replyRate,
      successRate: sentRate
    }
  };
};

const getScopeFilter = (req) => {
  const filters = [];
  if (req.user?.companyId) filters.push({ companyId: req.user.companyId });
  if (req.user?.id) filters.push({ userId: req.user.id });

  if (!filters.length) {
    return {};
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return { $or: filters };
};

const getOverview = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 8) || 8, 50));
    const filter = getScopeFilter(req);
    const entries = await EmailHistoryEntry.find(filter)
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: computeDashboardPayload(entries)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getHistory = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 20) || 20, 100));
    const filter = getScopeFilter(req);
    const entries = await EmailHistoryEntry.find(filter)
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: {
        items: entries.map(buildHistoryRow)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getOverview,
  getHistory
};
