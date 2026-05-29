const toBoolean = (value) => value === true || value === "true" || value === 1 || value === "1";

const normalizeUserId = (user = {}) => String(user?._id || user?.id || user?.userId || "").trim();

const resolveAgentAccessState = (user = {}) => {
  if (typeof user?.isEnabled === "boolean") {
    return user.isEnabled;
  }

  const normalizedRole = String(user?.role || "").toLowerCase();
  if (["superadmin", "admin", "manager"].includes(normalizedRole)) {
    return true;
  }

  if (
    typeof user?.canAccessAgentManagement === "boolean" ||
    typeof user?.canAccessUserManagement === "boolean"
  ) {
    return Boolean(user.canAccessAgentManagement || user.canAccessUserManagement);
  }

  if (normalizedRole === "superadmin") {
    return true;
  }

  const appearsToOwnWorkspace =
    Boolean(user?.companyId) && !user?.createdBy && !user?.ownerId && !user?.parentUserId;
  if (appearsToOwnWorkspace) {
    return true;
  }

  return false;
};

const resolveAgentWorkspaceState = (user = {}) => {
  const normalizedRole = String(user?.role || "").toLowerCase();
  const normalizedCompanyRole = String(user?.companyRole || "").toLowerCase();
  const hasWorkspaceManagementAccess =
    ["superadmin", "admin", "manager"].includes(normalizedRole) || normalizedCompanyRole === "admin";

  if (hasWorkspaceManagementAccess) {
    return false;
  }

  const appearsToOwnWorkspace =
    Boolean(user?.companyId) && !user?.createdBy && !user?.ownerId && !user?.parentUserId;
  if (appearsToOwnWorkspace) {
    return false;
  }

  return Boolean(
    user?.isAgentWorkspace === true ||
      normalizedRole === "agent" ||
      (normalizedCompanyRole === "user" && Boolean(user?.createdBy || user?.ownerId || user?.parentUserId)) ||
      String(user?.workspaceAccessState || "").trim() === "agent_workspace"
  );
};

const resolveWorkspaceManagementAccessState = (user = {}) => {
  const normalizedRole = String(user?.role || "").toLowerCase();
  const normalizedCompanyRole = String(user?.companyRole || "").toLowerCase();

  if (["superadmin", "admin", "manager"].includes(normalizedRole)) {
    return true;
  }

  if (normalizedCompanyRole === "admin") {
    return true;
  }

  const appearsToOwnWorkspace =
    Boolean(user?.companyId) && !user?.createdBy && !user?.ownerId && !user?.parentUserId;
  if (appearsToOwnWorkspace) {
    return true;
  }

  return false;
};

const resolveWorkspaceOwnerId = (user = {}) =>
  String(user?.createdBy || user?.ownerId || user?.parentUserId || normalizeUserId(user)).trim();

const buildAgentAccessPayload = (user = {}) => {
  const isEnabled = resolveAgentAccessState(user);
  const hasWorkspaceManagementAccess = resolveWorkspaceManagementAccessState(user);
  const isAgentWorkspace = hasWorkspaceManagementAccess ? false : resolveAgentWorkspaceState(user);
  const workspaceOwnerId = resolveWorkspaceOwnerId(user);

  return {
    isEnabled,
    canAccessUserManagement: hasWorkspaceManagementAccess,
    canAccessAgentManagement: hasWorkspaceManagementAccess,
    isAgentWorkspace,
    workspaceOwnerId
  };
};

const normalizeAgentAccessInput = (payload = {}) => {
  if (Object.prototype.hasOwnProperty.call(payload, "isEnabled")) {
    return toBoolean(payload.isEnabled);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "canAccessAgentManagement")) {
    return toBoolean(payload.canAccessAgentManagement);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "canAccessUserManagement")) {
    return toBoolean(payload.canAccessUserManagement);
  }

  return null;
};

module.exports = {
  buildAgentAccessPayload,
  normalizeAgentAccessInput,
  resolveAgentAccessState,
  resolveAgentWorkspaceState,
  resolveWorkspaceManagementAccessState,
  resolveWorkspaceOwnerId
};
