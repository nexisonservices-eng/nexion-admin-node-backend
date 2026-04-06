const cloudinary = require("cloudinary").v2;

const isCloudinaryConfigured = () =>
  !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

const configureCloudinary = () => {
  if (!isCloudinaryConfigured()) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
};

const sanitizeCompanyName = (name = "") =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

const ensureCompanyFolders = async ({ companyName, companyId }) => {
  if (!isCloudinaryConfigured()) return null;
  configureCloudinary();

  const slug = sanitizeCompanyName(companyName || "");
  const root = `technova/${slug || "company"}_${companyId}`;
  const folders = [
    root,
    `${root}/images`,
    `${root}/audio`,
    `${root}/audio/ivr-audio`,
    `${root}/audio/broadcast-audio`,
    `${root}/documents`,
    `${root}/campaigns`
  ];

  for (const folder of folders) {
    try {
      await cloudinary.api.create_folder(folder);
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.includes("already exists")) {
        throw error;
      }
    }
  }

  return { root, folders };
};

const ensureUserAudioFolders = async ({ username, userId }) => {
  if (!isCloudinaryConfigured()) return null;
  configureCloudinary();

  const safeUserId = String(userId || "").trim();
  if (!safeUserId) return null;

  const slug = sanitizeCompanyName(username || "user");
  const root = `technova/${slug || "user"}_${safeUserId}`;
  const folders = [
    root,
    `${root}/audio`,
    `${root}/audio/ivr-audio`,
    `${root}/audio/broadcast-audio`
  ];

  for (const folder of folders) {
    try {
      await cloudinary.api.create_folder(folder);
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.includes("already exists")) {
        throw error;
      }
    }
  }

  return {
    root,
    ivrAudioFolder: `${root}/audio/ivr-audio`,
    broadcastAudioFolder: `${root}/audio/broadcast-audio`
  };
};

module.exports = {
  cloudinary,
  configureCloudinary,
  isCloudinaryConfigured,
  sanitizeCompanyName,
  ensureCompanyFolders,
  ensureUserAudioFolders
};
