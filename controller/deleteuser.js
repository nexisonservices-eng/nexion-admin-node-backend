const axios = require("axios");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const Subscription = require("../model/subscription");
const Payment = require("../model/payment");
const UsageLog = require("../model/usageLog");
const CustomPackage = require("../model/customPackage");
const MetaDocument = require("../model/metaDocument");
const IVRConversation = require("../model/ivrConversation");
const EmailHistoryEntry = require("../model/emailHistoryEntry");
const { buildCompanyCloudinaryRoot } = require("../config/cloudinary");
const { deleteCloudinaryAssets, deleteCloudinaryPrefix } = require("../utils/cloudinaryDelete");

const normalizeBaseUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const resolveServiceTargets = () => [
  {
    name: "broadcast",
    url: normalizeBaseUrl(
      process.env.BROADCAST_BACKEND_URL ||
        process.env.WHATSAPP_BACKEND_URL ||
        process.env.BROADCAST_SERVICE_URL ||
        ""
    )
  },
  {
    name: "voice",
    url: normalizeBaseUrl(
      process.env.VOICE_BACKEND_URL ||
        process.env.VOICE_SERVICE_URL ||
        process.env.VOICE_API_BASE_URL ||
        ""
    )
  }
].filter((target) => target.url);

const callCleanupService = async (target, payload, internalApiKey) => {
  const response = await axios.post(`${target.url}/internal/cleanup/user-delete`, payload, {
    headers: { "x-internal-api-key": internalApiKey },
    timeout: Number(process.env.USER_DELETE_CLEANUP_TIMEOUT_MS || 60000)
  });
  if (response?.data?.success === false) {
    throw new Error(response.data.error || `${target.name} cleanup failed`);
  }
  return response.data?.data || response.data || {};
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const internalApiKey = String(process.env.ADMIN_INTERNAL_API_KEY || process.env.INTERNAL_API_KEY || "").trim();
    if (!internalApiKey) {
      return res.status(500).json({ message: "Internal API key is not configured for cleanup" });
    }

    const target = await User.findById(userId).select("role username email companyId companyRole").lean();
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === "superadmin") {
      return res.status(400).json({ message: "Superadmin accounts cannot be deleted from this endpoint" });
    }

    const company = target.companyId ? await Company.findById(target.companyId).lean() : null;
    const companyUserCount = target.companyId ? await User.countDocuments({ companyId: target.companyId, role: { $ne: "superadmin" } }) : 0;
    const isCompanyOwner = company?.createdBy && String(company.createdBy) === String(target._id);
    const deleteCompanyScope = Boolean(target.companyId && (isCompanyOwner || companyUserCount <= 1));
    const cloudinaryFolderRoot =
      company?.cloudinaryFolderRoot ||
      (company ? buildCompanyCloudinaryRoot({ companyName: company.name, companySlug: company.slug, companyId: company._id }) : "");

    const serviceTargets = resolveServiceTargets();
    if (serviceTargets.length < 2) {
      return res.status(500).json({
        message: "Cleanup service URLs are not fully configured",
        required: ["BROADCAST_BACKEND_URL or WHATSAPP_BACKEND_URL", "VOICE_BACKEND_URL"]
      });
    }

    const cleanupPayload = {
      userId: String(target._id),
      companyId: target.companyId ? String(target.companyId) : "",
      deleteCompanyScope,
      companyName: company?.name || "",
      companySlug: company?.slug || "",
      cloudinaryFolderRoot
    };

    const downstream = {};
    for (const service of serviceTargets) {
      downstream[service.name] = await callCleanupService(service, cleanupPayload, internalApiKey);
    }

    const adminDocs = await MetaDocument.find(
      deleteCompanyScope && target.companyId ? { companyId: target.companyId } : { userId: target._id }
    ).select("url").lean();
    const cloudinary = await deleteCloudinaryAssets(adminDocs.map((doc) => ({ url: doc.url, resourceType: "auto" })));
    if (deleteCompanyScope && cloudinaryFolderRoot) {
      const prefixResult = await deleteCloudinaryPrefix(cloudinaryFolderRoot);
      cloudinary.warnings.push(...(prefixResult.warnings || []));
    }

    const counts = {};
    const adminFilter = deleteCompanyScope && target.companyId ? { companyId: target.companyId } : { userId: target._id };
    counts.metaDocuments = (await MetaDocument.deleteMany(adminFilter)).deletedCount || 0;
    counts.subscriptions = (await Subscription.deleteMany(adminFilter)).deletedCount || 0;
    counts.payments = (await Payment.deleteMany(adminFilter)).deletedCount || 0;
    counts.usageLogs = (await UsageLog.deleteMany(adminFilter)).deletedCount || 0;
    counts.customPackages = (await CustomPackage.deleteMany(adminFilter)).deletedCount || 0;
    counts.ivrConversations = (await IVRConversation.deleteMany(adminFilter)).deletedCount || 0;
    counts.emailHistory = (await EmailHistoryEntry.deleteMany(adminFilter)).deletedCount || 0;
    counts.users = deleteCompanyScope && target.companyId
      ? (await User.deleteMany({ companyId: target.companyId, role: { $ne: "superadmin" } })).deletedCount || 0
      : (await User.deleteOne({ _id: target._id })).deletedCount || 0;
    counts.companies = deleteCompanyScope && target.companyId
      ? (await Company.deleteOne({ _id: target.companyId })).deletedCount || 0
      : 0;

    return res.status(200).json({
      message: "Account and related data deleted successfully",
      deleteCompanyScope,
      user: {
        id: target._id,
        username: target.username,
        email: target.email,
        role: target.role
      },
      cleanup: {
        downstream,
        admin: { counts, cloudinary }
      }
    });
  } catch (error) {
    const status = error?.response?.status || 500;
    return res.status(status).json({
      message: "Failed to delete user; user was kept because cleanup did not complete",
      error: error?.response?.data?.error || error?.response?.data?.message || error.message
    });
  }
};

module.exports = deleteUser;
