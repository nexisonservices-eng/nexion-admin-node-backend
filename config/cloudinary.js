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

const buildCompanyCloudinaryRoot = ({ companyName, companySlug, companyId }) => {
  const safeCompanyId = String(companyId || "").trim();
  if (!safeCompanyId) return "";

  const slug = sanitizeCompanyName(companySlug || companyName || "");
  return `technova/${slug || "company"}_${safeCompanyId}`;
};

const buildCompanyCloudinaryFolders = ({ companyName, companySlug, companyId }) => {
  const root = buildCompanyCloudinaryRoot({ companyName, companySlug, companyId });
  if (!root) return { root: "", folders: [] };

  const folders = [
    root,
    `${root}/audio`,
    `${root}/audio/ivr-audio`,
    `${root}/audio/broadcast-audio`,
    `${root}/user-documents`,
    `${root}/meta-ads`,
    `${root}/meta-template-images`,
    `${root}/inbox`,
    `${root}/inbox/sent`,
    `${root}/inbox/received`,
    `${root}/crm`,
    `${root}/crm/contacts`
  ];

  return { root, folders };
};

const ensureCompanyFolders = async ({ companyName, companySlug, companyId }) => {
  if (!isCloudinaryConfigured()) return null;
  configureCloudinary();

  const { root, folders } = buildCompanyCloudinaryFolders({ companyName, companySlug, companyId });
  if (!root) return null;

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

const buildCompanyCloudinaryPaths = ({ companyName, companySlug, companyId }) => {
  const root = buildCompanyCloudinaryRoot({ companyName, companySlug, companyId });
  return {
    root,
    audioRoot: `${root}/audio`,
    ivrAudioFolder: `${root}/audio/ivr-audio`,
    broadcastAudioFolder: `${root}/audio/broadcast-audio`,
    userDocumentsFolder: `${root}/user-documents`,
    metaAdsFolder: `${root}/meta-ads`,
    metaTemplateImagesFolder: `${root}/meta-template-images`,
    inboxSentFolder: `${root}/inbox/sent`,
    inboxReceivedFolder: `${root}/inbox/received`,
    crmContactsFolder: `${root}/crm/contacts`
  };
};

module.exports = {
  cloudinary,
  configureCloudinary,
  isCloudinaryConfigured,
  sanitizeCompanyName,
  buildCompanyCloudinaryRoot,
  buildCompanyCloudinaryFolders,
  buildCompanyCloudinaryPaths,
  ensureCompanyFolders,
};
