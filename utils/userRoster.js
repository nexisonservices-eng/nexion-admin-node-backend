const serializeUserRosterUser = (user = {}) => ({
  _id: user._id,
  id: String(user._id || ''),
  userId: String(user._id || ''),
  name: user.username || user.email || '',
  displayName: user.username || user.email || '',
  email: user.email || '',
  role: user.role || '',
  companyRole: user.companyRole || '',
  companyId: user.companyId,
  isEnabled: user.isEnabled !== false,
  isActive: user.isActive !== false
});

module.exports = { serializeUserRosterUser };
