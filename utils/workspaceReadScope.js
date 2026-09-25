const User = require('../model/loginmodel');

// Membership comes from stored account relationships, never from request filters.
const getWorkspaceCreators = async (user, companyRole) => {
  const ownId = String(user._id || '');
  const describe = (account) => ({ id: String(account._id), name: account.username || account.email || '', email: account.email || '', role: account.companyRole || account.role || 'user' });
  if (!ownId || !['admin', 'manager'].includes(String(companyRole || user.role).toLowerCase())) return ownId ? [describe(user)] : [];
  const agents = await User.find({
    ...(user.companyId ? { companyId: user.companyId } : {}),
    $or: [{ createdBy: user._id }, { ownerId: user._id }, { parentUserId: user._id }]
  }).select('_id username email role companyRole').lean();
  return [...new Map([user, ...agents].map((account) => [String(account._id), describe(account)])).values()];
};
const getWorkspaceReadUserIds = async (user, companyRole) => (await getWorkspaceCreators(user, companyRole)).map((creator) => creator.id);

module.exports = { getWorkspaceReadUserIds, getWorkspaceCreators };
