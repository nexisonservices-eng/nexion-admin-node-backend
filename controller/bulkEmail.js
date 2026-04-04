const nodemailer = require("nodemailer");
const axios = require("axios");

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

const fetchVerificationData = async (apiKey, email) => {
  const endpoints = [
    "https://emailvalidation.abstractapi.com/v1/",
    "https://emailreputation.abstractapi.com/v1/"
  ];

  let hadUnauthorized = false;
  let lastErrorMessage = "";

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, {
        params: { api_key: apiKey, email },
        timeout: Number(getEnv("EMAIL_VERIFY_TIMEOUT_MS") || 9000)
      });
      return { ok: true, data: response?.data || {} };
    } catch (error) {
      if (Number(error?.response?.status) === 401) {
        hadUnauthorized = true;
      }
      lastErrorMessage = error?.message || "";
    }
  }

  if (hadUnauthorized) {
    return { ok: false, reason: "auth_failed", message: "Invalid verifier API key." };
  }
  return { ok: false, reason: "unavailable", message: lastErrorMessage || "Verification endpoint unavailable." };
};

const verifyEmailAddress = async (email) => {
  const apiKey = getEnv("ABSTRACT_EMAIL_VERIFY_API_KEY");
  if (!apiKey) {
    return { canSend: true, reasonCode: "verification_not_configured", userMessage: "" };
  }

  try {
    const verificationResponse = await fetchVerificationData(apiKey, email);
    if (!verificationResponse.ok) {
      if (verificationResponse.reason === "auth_failed") {
        return {
          canSend: false,
          reasonCode: "verification_auth_failed",
          userMessage: "Verifier API key is invalid."
        };
      }
      return {
        canSend: true,
        reasonCode: "verification_unavailable",
        userMessage: ""
      };
    }

    const data = verificationResponse.data || {};
    const deliverability = data?.email_deliverability || {};
    const formatValid = typeof deliverability?.is_format_valid === "boolean"
      ? deliverability.is_format_valid
      : Boolean(data?.is_valid_format?.value);
    const mxFound = typeof deliverability?.is_mx_valid === "boolean"
      ? deliverability.is_mx_valid
      : Boolean(data?.is_mx_found?.value);
    const smtpValid = typeof deliverability?.is_smtp_valid === "boolean"
      ? deliverability.is_smtp_valid
      : data?.is_smtp_valid?.value;
    const status = String(deliverability?.status || deliverability?.status_detail || data?.deliverability || "").toUpperCase();

    if (!formatValid) {
      return { canSend: false, reasonCode: "invalid_format", userMessage: "Invalid email format, cannot send." };
    }
    if (!mxFound) {
      return { canSend: false, reasonCode: "invalid_domain", userMessage: "Email domain is invalid, cannot send." };
    }
    if (smtpValid === false || status.includes("UNDELIVERABLE") || status.includes("INVALID")) {
      return { canSend: false, reasonCode: "invalid_mailbox", userMessage: "This email ID is invalid, cannot send." };
    }

    return { canSend: true, reasonCode: "deliverable", userMessage: "" };
  } catch (error) {
    return { canSend: true, reasonCode: "verification_error", userMessage: "" };
  }
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
    const verifierEnabled = String(getEnv("ENABLE_PRE_SEND_VERIFICATION") || "false").toLowerCase() === "true";
    const verifierKeyConfigured = Boolean(getEnv("ABSTRACT_EMAIL_VERIFY_API_KEY"));

    if (verifierEnabled && !verifierKeyConfigured) {
      return res.status(500).json({
        message: "Pre-send verification is enabled but verifier key is missing.",
        error: "Set ABSTRACT_EMAIL_VERIFY_API_KEY or disable ENABLE_PRE_SEND_VERIFICATION"
      });
    }

    await runWithConcurrency(normalizedRecipients, sendConcurrency, async (recipient) => {
      if (verifierEnabled && verifierKeyConfigured) {
        const verification = await verifyEmailAddress(recipient.email);
        if (!verification.canSend) {
          report.push({
            email: recipient.email,
            status: "failed",
            error: "Blocked before send",
            userMessage: verification.userMessage || "This email ID is invalid, cannot send."
          });
          return;
        }
      }

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
      note: verifierEnabled && verifierKeyConfigured
        ? "Pre-send verification is enabled. Accepted by SMTP is not guaranteed delivered."
        : "Accepted by SMTP is not guaranteed delivered. Some recipients may bounce later.",
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
