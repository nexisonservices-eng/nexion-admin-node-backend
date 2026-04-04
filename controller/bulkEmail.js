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
      auth: { user, pass },
      // Fail fast when SMTP is unreachable or blocked to avoid long UI hangs.
      connectionTimeout: Number(getEnv("SMTP_CONNECTION_TIMEOUT_MS") || 10000),
      greetingTimeout: Number(getEnv("SMTP_GREETING_TIMEOUT_MS") || 10000),
      socketTimeout: Number(getEnv("SMTP_SOCKET_TIMEOUT_MS") || 15000)
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

const classifyEmailSendError = (error) => {
  const rawMessage = String(error?.message || "").toLowerCase();
  const responseCode = Number(error?.responseCode || 0);
  const errorCode = String(error?.code || "").toUpperCase();

  if (
    responseCode === 550 ||
    rawMessage.includes("5.1.1") ||
    rawMessage.includes("address not found") ||
    rawMessage.includes("user unknown") ||
    rawMessage.includes("mailbox unavailable")
  ) {
    return "This email is incorrect, cannot be sent.";
  }

  if (errorCode === "ENOTFOUND" || rawMessage.includes("domain") && rawMessage.includes("not found")) {
    return "Email domain is invalid or unreachable.";
  }

  if (errorCode === "ETIMEDOUT" || rawMessage.includes("timeout")) {
    return "SMTP server timeout while sending.";
  }

  if (responseCode === 554 || rawMessage.includes("rejected")) {
    return "Email rejected by recipient server.";
  }

  return "Could not deliver this email.";
};

const runWithConcurrency = async (items, concurrency, worker) => {
  const queue = [...items];
  const runners = [];

  const runner = async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  };

  const size = Math.max(1, Math.min(concurrency, items.length));
  for (let i = 0; i < size; i += 1) {
    runners.push(runner());
  }
  await Promise.all(runners);
};

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
    const normalizedTemplateMessage = normalizeTemplateText(templateMessage);
    const sendConcurrency = Number(getEnv("SMTP_BULK_CONCURRENCY") || 5);

    await runWithConcurrency(normalizedRecipients, sendConcurrency, async (recipient) => {
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
          error: error.message || "Failed to send",
          userMessage: classifyEmailSendError(error)
        });
      }
    });

    const accepted = report.filter((item) => item.status === "sent").length;
    const failed = report.filter((item) => item.status === "failed").length;

    return res.status(200).json({
      message: `Bulk email processed. Accepted by SMTP: ${accepted}, Failed at send time: ${failed}`,
      note: "Accepted by SMTP is not guaranteed delivered. Some recipients may bounce later.",
      total: report.length,
      sent: accepted,
      accepted,
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
