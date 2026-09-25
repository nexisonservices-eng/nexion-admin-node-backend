const User = require('../model/loginmodel');
const EmailHistoryEntry = require('../model/emailHistoryEntry');
const { getWorkspaceReadUserIds } = require('../utils/workspaceReadScope');
const { createAgentActivityHandler } = require('../utils/agentActivity');

module.exports = createAgentActivityHandler({
  email: { model: EmailHistoryEntry, owner: 'userId', title: ['subject'], label: 'Email' }
}, async (req) => {
  const user = await User.findById(req.user.id || req.user.userId).lean();
  if (!user) return null;
  return { ...user, workspaceReadUserIds: await getWorkspaceReadUserIds(user, user.companyRole || user.role) };
});
