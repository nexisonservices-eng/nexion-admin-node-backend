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

const buildEmailProvider = () => {
  const provider = String(getEnv("BULK_EMAIL_PROVIDER") || "").toLowerCase();
  const resendApiKey = getEnv("RESEND_API_KEY");

  if (provider === "resend" && resendApiKey) {
    return { type: "resend", apiKey: resendApiKey };
  }

  return { type: "smtp" };
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  if (errorCode === "ENOTFOUND" || (rawMessage.includes("domain") && rawMessage.includes("not found"))) {
    return "Email domain is invalid or unreachable.";
  }

  if (errorCode === "ETIMEDOUT" || rawMessage.includes("timeout")) {
    return "SMTP timeout on live server. Retry in a moment.";
  }

  if (responseCode === 554 || rawMessage.includes("rejected")) {
    return "Email rejected by recipient server.";
  }

  if (responseCode === 535 || rawMessage.includes("badcredentials")) {
    return "SMTP username/password not accepted.";
  }

  const status = Number(error?.response?.status || 0);
  if (status === 401 || status === 403) {
    return "Email provider API key is invalid or unauthorized.";
  }
  if (status === 422) {
    return "Sender/recipient validation failed with email provider.";
  }

  return "Could not deliver this email.";
};

const isRetryableSmtpError = (error) => {
  const code = String(error?.code || "").toUpperCase();
  return code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ECONNRESET" || code === "ECONNREFUSED";
};

const createAlternateGmailTransporter = () => {
  const host = getEnv("SMTP_HOST", "MAIL_HOST", "EMAIL_HOST");
  if (String(host || "").toLowerCase() !== "smtp.gmail.com") return null;

  const user = getEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
  const pass = getEnv("SMTP_PASS", "MAIL_PASS", "EMAIL_PASS", "EMAIL_PASSWORD");
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: Number(getEnv("SMTP_CONNECTION_TIMEOUT_MS") || 10000),
    greetingTimeout: Number(getEnv("SMTP_GREETING_TIMEOUT_MS") || 10000),
    socketTimeout: Number(getEnv("SMTP_SOCKET_TIMEOUT_MS") || 15000)
  });
};

const sendWithFallback = async (primaryTransporter, mailOptions) => {
  try {
    const info = await primaryTransporter.sendMail(mailOptions);
    return { info, fallbackUsed: false };
  } catch (firstError) {
    if (!isRetryableSmtpError(firstError)) {
      throw firstError;
    }

    const alternate = createAlternateGmailTransporter();
    if (!alternate) {
      throw firstError;
    }

    const info = await alternate.sendMail(mailOptions);
    return { info, fallbackUsed: true };
  }
};

const sendWithRetry = async (primaryTransporter, mailOptions) => {
  const maxAttempts = Number(getEnv("SMTP_SEND_MAX_ATTEMPTS") || 3);
  let lastError = null;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      return await sendWithFallback(primaryTransporter, mailOptions);
    } catch (error) {
      lastError = error;
      if (!isRetryableSmtpError(error) || attempt >= maxAttempts) {
        break;
      }
      // Small backoff for transient SMTP/network hiccups on live hosts.
      await sleep(700 * attempt);
    }
  }

  throw lastError || new Error("Failed to send mail after retries");
};

const sendWithResend = async ({ apiKey, from, to, subject, text, html }) => {
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing");
  }

  const response = await axios.post(
    "https://api.resend.com/emails",
    { from, to: [to], subject, text, html },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: Number(getEnv("RESEND_TIMEOUT_MS") || 15000)
    }
  );

  return {
    messageId: response?.data?.id || null,
    via: "resend-api"
  };
};

const getRetryAfterMs = (error) => {
  const retryAfter = Number(error?.response?.headers?.["retry-after"] || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return 0;
};

const isRetryableProviderError = (error) => {
  const status = Number(error?.response?.status || 0);
  return status === 429 || status >= 500;
};

const sendWithResendRetry = async (payload) => {
  const maxAttempts = Number(getEnv("RESEND_SEND_MAX_ATTEMPTS") || 5);
  const baseDelayMs = Number(getEnv("RESEND_RETRY_BASE_DELAY_MS") || 1200);
  let lastError = null;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      return await sendWithResend(payload);
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt >= maxAttempts) {
        break;
      }
      const retryAfterMs = getRetryAfterMs(error);
      const backoffMs = retryAfterMs || baseDelayMs * attempt;
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error("Failed to send with provider after retries");
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

    const provider = buildEmailProvider();
    const { transporter, missing } = buildTransporter();
    if (provider.type === "smtp" && !transporter) {
      return res.status(500).json({
        message: `SMTP is not configured. Missing: ${missing.join(", ")}. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM`
      });
    }

    const from = getEnv("SMTP_FROM", "MAIL_FROM", "EMAIL_FROM") || getEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
    const report = [];
    const normalizedTemplateMessage = normalizeTemplateText(templateMessage);
    // Provider calls can hit rate limits quickly; keep Resend safer by default.
    const sendConcurrency = provider.type === "resend"
      ? Number(getEnv("RESEND_BULK_CONCURRENCY") || 1)
      : Number(getEnv("SMTP_BULK_CONCURRENCY") || 1);

    await runWithConcurrency(normalizedRecipients, sendConcurrency, async (recipient) => {
      const personalizedText = applyTemplate(normalizedTemplateMessage, recipient);
      const personalizedHtml = applyTemplate(normalizedTemplateMessage, recipient)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");

      try {
        let delivery;
        if (provider.type === "resend") {
          delivery = await sendWithResendRetry({
            apiKey: provider.apiKey,
            from,
            to: recipient.email,
            subject: String(subject),
            text: personalizedText,
            html: personalizedHtml
          });
        } else {
          const { info, fallbackUsed } = await sendWithRetry(transporter, {
            from,
            to: recipient.email,
            subject: String(subject),
            text: personalizedText,
            html: personalizedHtml
          });
          delivery = {
            messageId: info.messageId || null,
            via: fallbackUsed ? "smtp-465-fallback" : "smtp-primary"
          };
        }

        report.push({
          email: recipient.email,
          status: "sent",
          messageId: delivery.messageId || null,
          via: delivery.via
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

    const sent = report.filter((item) => item.status === "sent").length;
    const failed = report.length - sent;

    return res.status(200).json({
      message: `Bulk email completed. Sent: ${sent}, Failed: ${failed}`,
      note: "Accepted by SMTP is not guaranteed delivered. Some recipients may bounce later.",
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
