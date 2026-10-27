const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../model/loginmodel");
const Company = require("../model/company");

const customerQuery = { role: { $ne: "superadmin" }, isAgentWorkspace: { $ne: true }, companyRole: "admin" };
const agentOwnerQuery = (customer) => ({
  isAgentWorkspace: true,
  role: { $ne: "superadmin" },
  $or: [
    { createdBy: customer._id },
    { ownerId: customer._id },
    { parentUserId: customer._id },
    ...(customer.companyId ? [{ companyId: customer.companyId }] : [])
  ]
});

const accountStatus = (user, company, isAgent = false) => {
  if (company?.status === "disabled" || user?.isActive === false || (isAgent && user?.isEnabled === false)) return "Inactive";
  return "Active";
};

const customerSummary = (user, company, agentCount = 0) => ({
  id: String(user._id),
  name: String(company?.name || user.username || user.email || "Customer"),
  email: user.email || "",
  companyId: company?._id ? String(company._id) : null,
  agentCount,
  status: accountStatus(user, company),
  createdAt: user.createdAt || null,
  lastLoginAt: user.lastLoginAt || null,
  passwordChangedAt: user.passwordChangedAt || null
});

const agentSummary = (agent) => ({
  id: String(agent._id),
  name: agent.username || agent.email || "Agent",
  email: agent.email || "",
  status: accountStatus(agent, null, true),
  createdAt: agent.createdAt || null,
  lastLoginAt: agent.lastLoginAt || null,
  passwordChangedAt: agent.passwordChangedAt || null
});

const findCustomer = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return User.findOne({ _id: id, ...customerQuery }).select("_id username email companyId createdAt lastLoginAt passwordChangedAt isEnabled isActive").lean();
};

const listCustomers = async (_req, res) => {
  try {
    const users = await User.find(customerQuery)
      .select("_id username email companyId createdAt lastLoginAt passwordChangedAt isEnabled isActive")
      .sort({ createdAt: -1 }).lean();
    const companyIds = [...new Set(users.map((user) => String(user.companyId || "")).filter(Boolean))];
    const companies = await Company.find({ _id: { $in: companyIds } }).select("_id name status").lean();
    const companyById = new Map(companies.map((company) => [String(company._id), company]));
    const customerIds = users.map((user) => user._id);
    const agents = await User.find({ isAgentWorkspace: true, $or: [
      { createdBy: { $in: customerIds } }, { ownerId: { $in: customerIds } }, { parentUserId: { $in: customerIds } },
      ...(companyIds.length ? [{ companyId: { $in: companyIds } }] : [])
    ] }).select("_id createdBy ownerId parentUserId companyId").lean();
    const counts = new Map();
    for (const agent of agents) {
      const owner = [agent.createdBy, agent.ownerId, agent.parentUserId].find((id) => id && customerIds.some((customerId) => String(customerId) === String(id)));
      const customer = owner ? String(owner) : users.find((entry) => String(entry.companyId || "") === String(agent.companyId || ""))?._id?.toString();
      if (customer) counts.set(customer, (counts.get(customer) || 0) + 1);
    }
    return res.json({ success: true, data: users.map((user) => customerSummary(user, companyById.get(String(user.companyId || "")), counts.get(String(user._id)) || 0)) });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load customers." });
  }
};

const getCustomer = async (req, res) => {
  try {
    const customer = await findCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
    const company = customer.companyId ? await Company.findById(customer.companyId).select("_id name status").lean() : null;
    const agents = await User.find(agentOwnerQuery(customer)).select("_id username email createdAt lastLoginAt passwordChangedAt isEnabled isActive").sort({ createdAt: -1 }).lean();
    return res.json({ success: true, customer: customerSummary(customer, company, agents.length), agents: agents.map(agentSummary) });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to load customer details." });
  }
};

const getAgent = async (req, res) => {
  try {
    const { customerId, agentId } = req.params;
    const customer = await findCustomer(customerId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
    if (!mongoose.Types.ObjectId.isValid(agentId)) return res.status(404).json({ success: false, message: "Agent not found." });
    const agent = await User.findOne({ _id: agentId, ...agentOwnerQuery(customer) })
      .select("_id username email createdBy ownerId parentUserId companyId createdAt lastLoginAt passwordChangedAt isEnabled isActive")
      .lean();
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found for this customer." });
    const company = customer.companyId ? await Company.findById(customer.companyId).select("name").lean() : null;
    return res.json({ success: true, agent: { ...agentSummary(agent), customerId: String(customer._id), customerName: company?.name || customer.username || customer.email || "Customer" } });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to load agent details." });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { customerId, agentId } = req.params;
    let target;
    if (agentId) {
      const customer = await findCustomer(customerId);
      if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
      target = await User.findOne({ _id: agentId, ...agentOwnerQuery(customer) });
    } else {
      target = mongoose.Types.ObjectId.isValid(customerId)
        ? await User.findOne({ _id: customerId, ...customerQuery })
        : null;
    }
    if (!target) return res.status(404).json({ success: false, message: agentId ? "Agent not found for this customer." : "Customer not found." });
    const temporaryPassword = crypto.randomBytes(18).toString("base64url");
    target.password = await bcrypt.hash(temporaryPassword, 12);
    target.passwordChangedAt = new Date();
    target.mustChangePassword = true;
    await target.save();
    return res.json({ success: true, temporaryPassword, message: "Temporary password generated. It will only be shown once." });
  } catch {
    return res.status(500).json({ success: false, message: "Password reset failed." });
  }
};

const changeOwnPassword = async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    if (password.length < 10) return res.status(400).json({ success: false, message: "Password must be at least 10 characters." });
    const user = await User.findById(req.user.id);
    if (!user || !user.password || user.authProvider !== "email") return res.status(400).json({ success: false, message: "Password change is unavailable for this account." });
    user.password = await bcrypt.hash(password, 12);
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await user.save();
    return res.json({ success: true, message: "Password changed successfully." });
  } catch {
    return res.status(500).json({ success: false, message: "Password change failed." });
  }
};

module.exports = { listCustomers, getCustomer, getAgent, resetPassword, changeOwnPassword };
