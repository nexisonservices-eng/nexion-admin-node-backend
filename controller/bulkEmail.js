const nodemailer = require("nodemailer");

const getEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const buildTransporter = () => {
  const host = getEnv("SMTP_HOST", "MAIL_HOST", "EMAIL_HOST");
  const port = Number(getEnv("SMTP_PORT", "MAIL_PORT", "EMAIL_PORT") || 587);
  const secureRaw = getEnv("SMTP_SECURE", "MAIL_SECURE", "EMAIL_SECURE");
  const secure = String(secureRaw || "false").toLowerCase() === "true";
  const user = getEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
  const pass = getEnv("SMTP_PASS", "MAIL_PASS", "EMAIL_PASS", "EMAIL_PASSWORD");

  const missing = [];
  if (!host) missing.push("SMTP_HOST");
  if (!user) missing.push("SMTP_USER");
  if (!pass) missing.push("SMTP_PASS");

  if (missing.length) {
    return { transporter: null, missing };
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    }),
    missing
  };
};

const applyTemplate = (template, recipient) => {
  return template
    .replace(/{{\s*name\s*}}/gi, recipient.name)
    .replace(/{{\s*email\s*}}/gi, recipient.email);
};

const normalizeTemplateText = (value = "") => {
  return String(value)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
};

const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());

const sendBulkEmail = async (req, res) => {
  try {
    const { subject, templateMessage, recipients } = req.body || {};

    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ message: "subject is required" });
    }

    if (!templateMessage || !String(templateMessage).trim()) {
      return res.status(400).json({ message: "templateMessage is required" });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ message: "recipients array is required" });
    }

    if (recipients.length > 1000) {
      return res.status(400).json({ message: "Maximum 1000 recipients allowed per request" });
    }

    const normalizedRecipients = recipients
      .map((entry = {}) => ({
        name: String(entry.name || "").trim(),
        email: String(entry.email || "").trim().toLowerCase()
      }))
      .filter((entry) => entry.name && isValidEmail(entry.email));

    if (!normalizedRecipients.length) {
      return res.status(400).json({ message: "No valid recipients found" });
    }

    const { transporter, missing } = buildTransporter();
    if (!transporter) {
      return res.status(500).json({
        message: `SMTP is not configured. Missing: ${missing.join(", ")}. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM`
      });
    }

    const from = getEnv("SMTP_FROM", "MAIL_FROM", "EMAIL_FROM") || getEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
    const report = [];

    for (const recipient of normalizedRecipients) {
      const normalizedTemplateMessage = normalizeTemplateText(templateMessage);
      const personalizedText = applyTemplate(normalizedTemplateMessage, recipient);
      const personalizedHtml = applyTemplate(normalizedTemplateMessage, recipient)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");

      try {
        const info = await transporter.sendMail({
          from,
          to: recipient.email,
          subject: String(subject),
          text: personalizedText,
          html: personalizedHtml
        });

        report.push({
          email: recipient.email,
          status: "sent",
          messageId: info.messageId || null
        });
      } catch (error) {
        report.push({
          email: recipient.email,
          status: "failed",
          error: error.message || "Failed to send"
        });
      }
    }

    const sent = report.filter((item) => item.status === "sent").length;
    const failed = report.length - sent;

    return res.status(200).json({
      message: `Bulk email completed. Sent: ${sent}, Failed: ${failed}`,
      total: report.length,
      sent,
      failed,
      report
    });
  } catch (error) {
    console.error("Bulk email send error:", error);
    return res.status(500).json({
      message: "Bulk email send failed",
      error: error.message
    });
  }
};

module.exports = {
  sendBulkEmail
};
