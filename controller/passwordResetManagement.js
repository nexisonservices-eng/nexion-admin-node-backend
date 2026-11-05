const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const PasswordResetAudit = require("../model/passwordResetAudit");

const ROOT_SUPERADMIN = {
  id: "superadmin-id",
  username: "Super Admin",
  email: "superadmin@technova.com",
  role: "superadmin",
  companyId: null,
  companyName: "Nexion",
  phoneNumber: "",
  accountType: "Super Admin",
  status: "Active",
  createdAt: null,
  isProtected: true
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const accountTypeFor = (user) => {
  if (String(user?.role || "").toLowerCase() === "superadmin") return "Super Admin";
  if (user?.isAgentWorkspace === true) return "Employee";
  if (String(user?.role || "").toLowerCase() === "admin") return "Admin";
  if (String(user?.companyRole || "").toLowerCase() === "admin") return "Client";
  return "User";
};

const isActiveAccount = (user, company) =>
  user?.isActive !== false &&
  !(user?.isAgentWorkspace === true && user?.isEnabled === false) &&
  company?.status !== "disabled";

const canFilterRoot = ({ search, role, companyId, status }) => {
  if (role && role !== "superadmin") return false;
  if (companyId || status === "inactive") return false;
  return !search || [ROOT_SUPERADMIN.username, ROOT_SUPERADMIN.email, ROOT_SUPERADMIN.accountType]
    .some((value) => value.toLowerCase().includes(search.toLowerCase()));
};

const buildAccountQuery = ({ search, role, companyId, status }, disabledCompanyIds) => {
  const conditions = [];
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    conditions.push({ $or: [{ username: expression }, { email: expression }, { phonenumber: expression }] });
  }
  if (companyId) conditions.push({ companyId });
  if (role) {
    const roleQueries = {
      superadmin: { role: "superadmin" },
      admin: { role: "admin", isAgentWorkspace: { $ne: true } },
      client: { role: "user", companyRole: "admin", isAgentWorkspace: { $ne: true } },
      employee: { isAgentWorkspace: true },
      user: { role: "user", companyRole: { $ne: "admin" }, isAgentWorkspace: { $ne: true } }
    };
    if (roleQueries[role]) conditions.push(roleQueries[role]);
  }
  if (status === "active") {
    conditions.push({ isActive: { $ne: false } });
    conditions.push({ $or: [{ isAgentWorkspace: { $ne: true } }, { isEnabled: { $ne: false } }] });
    if (disabledCompanyIds.length) conditions.push({ companyId: { $nin: disabledCompanyIds } });
  } else if (status === "inactive") {
    const inactive = [{ isActive: false }, { isAgentWorkspace: true, isEnabled: false }];
    if (disabledCompanyIds.length) inactive.push({ companyId: { $in: disabledCompanyIds } });
    conditions.push({ $or: inactive });
  }
  return { $and: conditions };
};

const writeAudit = async ({ adminId, targetUserId, targetAccountType, tenantId, status }) => {
  try {
    await PasswordResetAudit.create({
      adminId: String(adminId || "unknown"),
      targetUserId: String(targetUserId || "unknown"),
      targetAccountType: targetAccountType || "unknown",
      tenantId: tenantId ? String(tenantId) : null,
      action: "PASSWORD_RESET",
      status
    });
  } catch (error) {
    console.error("[PASSWORD_RESET_AUDIT] Failed to write audit record", {
      targetUserId: String(targetUserId || "unknown"),
      status,
      message: error.message
    });
  }
};

const listAccounts = async (req, res) => {
  try {
    const search = String(req.query?.search || "").trim().slice(0, 120);
    const role = String(req.query?.role || "").trim().toLowerCase();
    const status = String(req.query?.status || "").trim().toLowerCase();
    const companyId = String(req.query?.companyId || "").trim();
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query?.page, 10) || 1));
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(req.query?.pageSize, 10) || 25));
    if (role && !["admin", "client", "employee", "user", "superadmin"].includes(role)) {
      return res.status(400).json({ success: false, message: "Unsupported account role filter." });
    }
    if (status && !["active", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Unsupported account status filter." });
    }
    if (companyId && !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ success: false, message: "Invalid tenant ID filter." });
    }

    const disabledCompanies = await Company.find({ status: "disabled" }).select("_id").lean();
    const disabledCompanyIds = disabledCompanies.map((company) => company._id);
    const query = buildAccountQuery({ search, role, companyId, status }, disabledCompanyIds);
    const includeRoot = canFilterRoot({ search, role, companyId, status });
    const totalDocuments = await User.countDocuments(query);
    const total = totalDocuments + (includeRoot ? 1 : 0);
    const dbSkip = Math.max(0, (page - 1) * pageSize - (includeRoot ? 1 : 0));
    const dbLimit = Math.max(0, pageSize - (includeRoot && page === 1 ? 1 : 0));

    const accounts = dbLimit
      ? await User.find(query)
          .select("_id username email phonenumber role companyRole companyId isAgentWorkspace isEnabled isActive createdAt")
          .sort({ createdAt: -1, _id: -1 })
          .skip(dbSkip)
          .limit(dbLimit)
          .lean()
      : [];
    const companyIds = [...new Set(accounts.map((account) => String(account.companyId || "")).filter(Boolean))];
    const companies = companyIds.length
      ? await Company.find({ _id: { $in: companyIds } }).select("_id name status").lean()
      : [];
    const companyById = new Map(companies.map((company) => [String(company._id), company]));

    const data = accounts.map((account) => {
      const company = companyById.get(String(account.companyId || ""));
      const accountType = accountTypeFor(account);
      return {
        id: String(account._id),
        name: account.username || account.email || "Unnamed account",
        email: account.email || "",
        phoneNumber: account.phonenumber || "",
        role: String(account.role || "user"),
        companyRole: String(account.companyRole || "user"),
        accountType,
        companyId: company?._id ? String(company._id) : null,
        companyName: company?.name || "Unassigned",
        status: isActiveAccount(account, company) ? "Active" : "Inactive",
        createdAt: account.createdAt || null,
        isProtected: accountType === "Super Admin"
      };
    });
    if (includeRoot && page === 1) data.unshift(ROOT_SUPERADMIN);

    const tenants = await Company.find({}).select("_id name").sort({ name: 1 }).lean();
    return res.json({
      success: true,
      data,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      filters: { tenants: tenants.map((tenant) => ({ id: String(tenant._id), name: tenant.name })) }
    });
  } catch (error) {
    console.error("[PASSWORD_RESET_MANAGEMENT] Failed to list accounts", { message: error.message });
    return res.status(500).json({ success: false, message: "Failed to load accounts." });
  }
};

const resetAccountPassword = async (req, res) => {
  const targetUserId = String(req.params?.userId || "");
  const { newPassword, mustChangePassword } = req.body || {};
  let target = null;
  let accountType = "unknown";
  let auditRecord = null;
  try {
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      await writeAudit({ adminId: req.user?.id, targetUserId, status: "failure" });
      return res.status(400).json({ success: false, message: "Invalid target account ID." });
    }
    if (typeof newPassword !== "string" || newPassword.length < 10 || Buffer.byteLength(newPassword, "utf8") > 72) {
      await writeAudit({ adminId: req.user?.id, targetUserId, status: "failure" });
      return res.status(400).json({ success: false, message: "Password must contain at least 10 characters and no more than 72 UTF-8 bytes." });
    }
    if (typeof mustChangePassword !== "boolean") {
      await writeAudit({ adminId: req.user?.id, targetUserId, status: "failure" });
      return res.status(400).json({ success: false, message: "mustChangePassword must be true or false." });
    }

    target = await User.findOne({ _id: targetUserId, role: { $ne: "superadmin" } });
    if (!target) {
      await writeAudit({ adminId: req.user?.id, targetUserId, status: "failure" });
      return res.status(404).json({ success: false, message: "Eligible account not found." });
    }
    accountType = accountTypeFor(target);
    if (accountType === "Super Admin") {
      await writeAudit({ adminId: req.user?.id, targetUserId, targetAccountType: accountType, tenantId: target.companyId, status: "failure" });
      return res.status(404).json({ success: false, message: "Eligible account not found." });
    }
    const expectedAccountType = String(req.body?.accountType || "").trim();
    if (expectedAccountType && expectedAccountType !== accountType) {
      await writeAudit({ adminId: req.user?.id, targetUserId, targetAccountType: accountType, tenantId: target.companyId, status: "failure" });
      return res.status(409).json({ success: false, message: "Account details changed. Refresh the account list and try again." });
    }

    auditRecord = await PasswordResetAudit.create({
      adminId: String(req.user?.id || "unknown"),
      targetUserId,
      targetAccountType: accountType,
      tenantId: target.companyId ? String(target.companyId) : null,
      action: "PASSWORD_RESET",
      status: "pending"
    });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    target.password = passwordHash;
    target.passwordChangedAt = new Date();
    target.mustChangePassword = mustChangePassword;
    await target.save();
    try {
      await PasswordResetAudit.updateOne({ _id: auditRecord._id }, { $set: { status: "success" } });
    } catch (auditError) {
      console.error("[PASSWORD_RESET_AUDIT] Password changed; audit completion update failed", {
        targetUserId,
        message: auditError.message
      });
    }
    return res.json({ success: true, message: "Account password updated successfully." });
  } catch (error) {
    if (auditRecord?._id) {
      try {
        await PasswordResetAudit.updateOne({ _id: auditRecord._id }, { $set: { status: "failure" } });
      } catch (auditError) {
        console.error("[PASSWORD_RESET_AUDIT] Failed to mark password reset failure", {
          targetUserId,
          message: auditError.message
        });
      }
    } else {
      await writeAudit({
        adminId: req.user?.id,
        targetUserId,
        targetAccountType: accountType,
        tenantId: target?.companyId,
        status: "failure"
      });
    }
    console.error("[PASSWORD_RESET_MANAGEMENT] Password update failed", {
      targetUserId,
      targetAccountType: accountType,
      message: error.message
    });
    return res.status(500).json({ success: false, message: "Failed to update account password." });
  }
};

module.exports = { listAccounts, resetAccountPassword };
