const crypto = require("crypto");
const axios = require("axios");
const nodemailer = require("nodemailer");
const User = require("../model/loginmodel");

const getEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const toCleanString = (value) => String(value || "").trim();

const normalizeFrontendBaseUrl = (value) => {
  const raw = toCleanString(value).replace(/\/+$/, "");
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return raw;
  }
};

const getFrontendBaseUrl = (req) => {
  const configured = normalizeFrontendBaseUrl(
    getEnv("FRONTEND_URL", "PUBLIC_FRONTEND_URL", "APP_FRONTEND_URL")
  );
  if (configured) return configured;

  const origin = toCleanString(req?.headers?.origin || req?.get?.("origin"));
  if (!origin) return "http://localhost:5173";

  try {
    const parsed = new URL(origin);
    if (/(\.|^)technovahub\.in$/i.test(parsed.hostname)) {
      return `${parsed.origin}/nexion`;
    }
    return parsed.origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
};

const buildResetPasswordUrl = (req, token) => {
  const baseUrl = getFrontendBaseUrl(req);
  return `${baseUrl}/reset-password/${token}`;
};

const buildEmailProvider = () => {
  const provider = String(getEnv("BULK_EMAIL_PROVIDER") || "").toLowerCase();
  const resendApiKey = getEnv("RESEND_API_KEY");

  if (provider === "resend" && resendApiKey) {
    return { type: "resend", apiKey: resendApiKey };
  }

  return { type: "smtp" };
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

const sendResetEmail = async ({ to, resetUrl }) => {
  const provider = buildEmailProvider();
  const from = getEnv("SMTP_FROM", "MAIL_FROM", "EMAIL_FROM") || getEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
  const subject = "Reset your Nexion password";
  const text = [
    "We received a request to reset your Nexion password.",
    "",
    `Reset it here: ${resetUrl}`,
    "",
    "This link expires in 15 minutes.",
    "If you did not request this, you can safely ignore this email."
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#102042">
      <h2 style="margin:0 0 12px">Reset your Nexion password</h2>
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Reset Password</a></p>
      <p style="word-break:break-word">Or paste this link into your browser:<br>${resetUrl}</p>
      <p>This link expires in 15 minutes.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  if (provider.type === "resend") {
    const response = await axios.post(
      "https://api.resend.com/emails",
      { from, to: [to], subject, text, html },
      {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: Number(getEnv("RESEND_TIMEOUT_MS") || 15000)
      }
    );

    return response?.data?.id || null;
  }

  const { transporter, missing } = buildTransporter();
  if (!transporter) {
    throw new Error(`SMTP is not configured. Missing: ${missing.join(", ")}`);
  }

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });

  return info?.messageId || null;
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 min

    await user.save();

    const resetUrl = buildResetPasswordUrl(req, resetToken);
    await sendResetEmail({ to: user.email, resetUrl });

    res.status(200).json({
      message: "Password reset link sent to email",
    });

  } catch (error) {
    res.status(500).json({ message: error?.message || "Forgot password failed" });
  }
};

module.exports = forgotPassword;
