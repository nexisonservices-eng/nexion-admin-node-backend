const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../model/loginmodel");
const { buildAgentAccessPayload } = require("../utils/agentAccess");

const normalizeText = (value) => String(value || "").trim();

const normalizeAgentRole = (value) => {
  const role = normalizeText(value).toLowerCase();
  return role === "admin" ? "admin" : "user";
};

const canManageWorkspaceAgents = (user = {}) => {
  const normalizedRole = normalizeText(user?.role).toLowerCase();
  const normalizedCompanyRole = normalizeText(user?.companyRole).toLowerCase();

  return (
    normalizedRole === "superadmin" ||
    normalizedRole === "admin" ||
    normalizedCompanyRole === "admin"
  );
};

const resolveParentUser = async (req) => {
  const parentUserId = String(req.user?.userId || req.user?.id || "").trim();
  if (!parentUserId || !mongoose.Types.ObjectId.isValid(parentUserId)) {
    return null;
  }

  return User.findById(parentUserId).lean();
};

const buildAgentResponse = (agent) => {
  const companyRole = agent.companyRole === "admin" ? "admin" : "user";
  const displayRole = companyRole === "admin" ? "Admin" : "Agent";
  const accessPayload = buildAgentAccessPayload(agent);

  return {
    id: agent._id,
    _id: agent._id,
    username: agent.username || "",
    email: agent.email || "",
    role: agent.role || "user",
    companyRole,
    displayRole,
    ...accessPayload,
    isEnabled: accessPayload.isEnabled,
    createdBy: agent.createdBy || null,
    ownerId: agent.ownerId || agent.createdBy || null,
    parentUserId: agent.parentUserId || agent.createdBy || null,
    createdByName: agent.createdByName || "",
    companyId: agent.companyId || null,
    createdAt: agent.createdAt || null,
    updatedAt: agent.updatedAt || null
  };
};

const listAgents = async (req, res) => {
  try {
    const parentUser = await resolveParentUser(req);
    if (!parentUser) {
      return res.status(200).json({ success: true, data: [] });
    }

    if (!canManageWorkspaceAgents(parentUser)) {
      return res.status(403).json({ message: "Access denied. Admin workspace only." });
    }

    const agents = await User.find({
      createdBy: parentUser._id,
      isAgentWorkspace: true,
      role: { $ne: "superadmin" }
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: agents.map(buildAgentResponse)
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch agents", error: error.message });
  }
};

const createAgent = async (req, res) => {
  try {
    const parentUser = await resolveParentUser(req);
    if (!parentUser) {
      return res.status(404).json({ message: "Parent user not found" });
    }

    if (!canManageWorkspaceAgents(parentUser)) {
      return res.status(403).json({ message: "Access denied. Admin workspace only." });
    }

    const payload = req.body || {};
    const username = normalizeText(payload.fullName || payload.username);
    const email = normalizeText(payload.email).toLowerCase();
    const password = normalizeText(payload.password);
    const companyRole = normalizeAgentRole(payload.role);

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Full name, email, and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email is already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const agent = await User.create({
      username,
      email,
      password: hashedPassword,
      role: "user",
      companyRole,
      companyId: parentUser.companyId || null,
      authProvider: "email",
      createdBy: parentUser._id,
      ownerId: parentUser._id,
      parentUserId: parentUser._id,
      createdByName: parentUser.username || "",
      isAgentWorkspace: true,
      canAccessUserManagement: false,
      canAccessAgentManagement: false,
      isEnabled: true
    });

    return res.status(201).json({
      success: true,
      message: "Agent created successfully",
      data: buildAgentResponse(agent.toObject())
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create agent", error: error.message });
  }
};

const updateAgent = async (req, res) => {
  try {
    const parentUser = await resolveParentUser(req);
    if (!parentUser) {
      return res.status(404).json({ message: "Parent user not found" });
    }

    if (!canManageWorkspaceAgents(parentUser)) {
      return res.status(403).json({ message: "Access denied. Admin workspace only." });
    }

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Valid agent id is required" });
    }

    const agent = await User.findOne({ _id: id, createdBy: parentUser._id, isAgentWorkspace: true });
    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const payload = req.body || {};
    if (Object.prototype.hasOwnProperty.call(payload, "fullName") || Object.prototype.hasOwnProperty.call(payload, "username")) {
      const nextUsername = normalizeText(payload.fullName || payload.username);
      if (!nextUsername) {
        return res.status(400).json({ message: "Full name cannot be empty" });
      }
      agent.username = nextUsername;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "email")) {
      const nextEmail = normalizeText(payload.email).toLowerCase();
      if (!nextEmail) {
        return res.status(400).json({ message: "Email cannot be empty" });
      }
      const emailOwner = await User.findOne({ email: nextEmail, _id: { $ne: agent._id } }).lean();
      if (emailOwner) {
        return res.status(409).json({ message: "Email is already in use" });
      }
      agent.email = nextEmail;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "password")) {
      const nextPassword = normalizeText(payload.password);
      if (nextPassword) {
        agent.password = await bcrypt.hash(nextPassword, 10);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "role")) {
      agent.companyRole = normalizeAgentRole(payload.role);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "isEnabled")) {
      agent.isEnabled = Boolean(payload.isEnabled);
    }

    await agent.save();

    return res.json({
      success: true,
      message: "Agent updated successfully",
      data: buildAgentResponse(agent.toObject())
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update agent", error: error.message });
  }
};

module.exports = {
  listAgents,
  createAgent,
  updateAgent
};
