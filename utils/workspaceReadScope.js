const User = require('../model/loginmodel');

// Membership comes from stored account relationships, never from request filters.
const getWorkspaceReadUserIds = async (user, companyRole) => {
  const ownId = String(user._id || '');
  if (!ownId || !['admin', 'manager'].includes(String(companyRole || user.role).toLowerCase())) return ownId ? [ownId] : [];
  const agents = await User.find({
    ...(user.companyId ? { companyId: user.companyId } : {}),
    $or: [{ createdBy: user._id }, { ownerId: user._id }, { parentUserId: user._id }]
  }).select('_id').lean();
  return [...new Set([ownId, ...agents.map((agent) => String(agent._id))])];
};

module.exports = { getWorkspaceReadUserIds };
