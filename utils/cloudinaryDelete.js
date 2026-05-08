const { cloudinary, configureCloudinary, isCloudinaryConfigured } = require("../config/cloudinary");

const extractPublicIdFromUrl = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/(?:image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?([^?]+?)(?:\.[a-zA-Z0-9]+)?(?:\?|$)/);
  if (!match) return raw.startsWith("http") ? "" : raw.replace(/\.(mp3|wav|m4a|ogg|pdf|docx?|xlsx?|png|jpe?g|webp|mp4|mov)$/i, "");
  return decodeURIComponent(match[1]).replace(/\.(mp3|wav|m4a|ogg|pdf|docx?|xlsx?|png|jpe?g|webp|mp4|mov)$/i, "");
};

const deleteCloudinaryAssets = async (assets = []) => {
  const summary = { attempted: 0, deleted: 0, skipped: 0, warnings: [] };
  if (!isCloudinaryConfigured()) return { ...summary, skipped: assets.length };
  configureCloudinary();

  const seen = new Set();
  for (const asset of assets) {
    const publicId = extractPublicIdFromUrl(asset?.publicId || asset?.url);
    if (!publicId || seen.has(publicId)) {
      summary.skipped += 1;
      continue;
    }
    seen.add(publicId);
    summary.attempted += 1;
    for (const resourceType of ["image", "video", "raw"]) {
      try {
        const result = await cloudinary.uploader.destroy(publicId, {
          resource_type: resourceType,
          type: "upload",
          invalidate: true
        });
        if (result?.result === "ok") {
          summary.deleted += 1;
          break;
        }
      } catch (error) {
        summary.warnings.push(`Failed deleting ${publicId} as ${resourceType}: ${error.message}`);
      }
    }
  }

  return summary;
};

const deleteCloudinaryPrefix = async (prefix) => {
  const warnings = [];
  if (!prefix || !isCloudinaryConfigured()) return { skipped: true, warnings };
  configureCloudinary();
  for (const resourceType of ["image", "video", "raw"]) {
    try {
      await cloudinary.api.delete_resources_by_prefix(prefix, { resource_type: resourceType, invalidate: true });
    } catch (error) {
      warnings.push(`Failed deleting ${resourceType} resources by prefix ${prefix}: ${error.message}`);
    }
  }
  return { prefix, warnings };
};

module.exports = {
  extractPublicIdFromUrl,
  deleteCloudinaryAssets,
  deleteCloudinaryPrefix
};
