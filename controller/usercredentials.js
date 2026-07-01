const mongoose = require('mongoose');
const User = require('../model/loginmodel');
const Company = require('../model/company');
const { buildAgentAccessPayload } = require('../utils/agentAccess');
const { buildCompanyCloudinaryRoot } = require('../config/cloudinary');
const { buildSubscriptionContext } = require('./billingController');

const credentialFieldMap = {
  twilioAccountSid: 'twilioaccountsid',
  twilioAuthToken: 'twilioauthtoken',
  twilioPhoneNumber: 'twiliophonenumber',
  whatsappId: 'whatsappid',
  whatsappToken: 'whatsapptoken',
  whatsappBusiness: 'whatsappbussiness',
  metaAppId: 'metaappid',
  metaAppSecret: 'metaappsecret',
  metaRedirectUri: 'metaredirecturi',
  metaUserAccessToken: 'metauseraccesstoken',
  metaAdAccountId: 'metaadaccountid',
  metaApiVersion: 'metaapiversion',
  metaJwtSecret: 'metajwtsecret',
  phoneNumber: 'phonenumber',
  missedCallWebhook: 'missedcallwebhook'
};

const toStr = (v = '') => String(v || '').trim();
const isNonEmpty = (v) => toStr(v).length > 0;
const normalizePhone = (v) => toStr(v).replace(/\D/g, '');

const resolveCompanyRole = (user = {}) => {
  const role = toStr(user.role).toLowerCase();
  const companyRole = toStr(user.companyRole).toLowerCase();
  if (role === 'superadmin' || role === 'admin') return 'admin';
  if (user.canAccessUserManagement === true || user.canAccessAgentManagement === true) return 'admin';
  if (companyRole === 'admin') return 'admin';
  if (user.isAgentWorkspace === true || role === 'agent' || role === 'user' || companyRole === 'user') return 'user';
  if (user.createdBy || user.ownerId || user.parentUserId) return 'user';
  return user.companyId ? 'admin' : 'user';
};

const resolveCompanySnapshot = async (user = {}) => {
  if (!user.companyId || !mongoose.Types.ObjectId.isValid(String(user.companyId))) {
    return { companyName: user.companyName || '', companySlug: '', cloudinaryFolderRoot: '' };
  }
  const company = await Company.findById(user.companyId).select('name slug cloudinaryFolderRoot').lean();
  if (!company) return { companyName: user.companyName || '', companySlug: '', cloudinaryFolderRoot: '' };
  return {
    companyName: company.name || user.companyName || '',
    companySlug: company.slug || '',
    cloudinaryFolderRoot: company.cloudinaryFolderRoot || buildCompanyCloudinaryRoot({
      companyName: company.name,
      companySlug: company.slug,
      companyId: user.companyId
    })
  };
};

const resolveCredentialSource = async (user = {}) => {
  const ids = [user.createdBy, user.parentUserId, user.ownerId].map(toStr).filter(Boolean);
  for (const id of ids) {
    if (!mongoose.Types.ObjectId.isValid(id)) continue;
    const src = await User.findById(id).lean();
    if (src) return src;
  }
  if (user.companyId && mongoose.Types.ObjectId.isValid(String(user.companyId))) {
    const src = await User.findOne({
      companyId: user.companyId,
      _id: { $ne: user._id },
      $or: [{ companyRole: 'admin' }, { role: 'admin' }]
    }).lean();
    if (src) return src;
  }
  return null;
};

const buildCredentialSnapshot = async (user = {}) => {
  const inherited = await resolveCredentialSource(user);
  const creds = {};
  for (const [publicKey, dbKey] of Object.entries(credentialFieldMap)) {
    const primary = user?.[dbKey];
    const fallback = inherited?.[dbKey];
    creds[publicKey] = isNonEmpty(primary) ? toStr(primary) : isNonEmpty(fallback) ? toStr(fallback) : '';
  }
  return { credentials: creds, inheritedSource: inherited };
};

const formatUserPayload = async (user, billingOverride = null) => {
  const billing = billingOverride || (await buildSubscriptionContext(user));
  const { credentials } = await buildCredentialSnapshot(user);
  const companyRole = resolveCompanyRole(user);
  const companySnapshot = await resolveCompanySnapshot(user);
  return {
    userId: user._id,
    role: user.role,
    ...buildAgentAccessPayload({ ...user, companyRole, role: user.role || 'user' }),
    createdBy: user.createdBy || null,
    ownerId: user.ownerId || user.createdBy || null,
    parentUserId: user.parentUserId || user.createdBy || null,
    createdByName: user.createdByName || '',
    username: user.username || '',
    email: user.email || '',
    companyId: user.companyId || null,
    companyRole,
    ...companySnapshot,
    ...billing,
    twilioAccountSid: credentials.twilioAccountSid,
    twilioAuthToken: credentials.twilioAuthToken,
    twilioPhoneNumber: credentials.twilioPhoneNumber || credentials.phoneNumber,
    whatsappId: credentials.whatsappId,
    whatsappToken: credentials.whatsappToken,
    whatsappBusiness: credentials.whatsappBusiness,
    phoneNumber: credentials.phoneNumber,
    missedCallWebhook: credentials.missedCallWebhook,
    missedCallAutomationEnabled: typeof user.missedcallautomationenabled === 'boolean' ? user.missedcallautomationenabled : true,
    missedCallDelayMinutes: Number.isFinite(Number(user.missedcalldelayminutes)) ? Number(user.missedcalldelayminutes) : 5,
    missedCallAutomationMode: toStr(user.missedcallautomationmode) || 'immediate',
    missedCallNightHour: Number.isFinite(Number(user.missedcallnighthour)) ? Number(user.missedcallnighthour) : 21,
    missedCallNightMinute: Number.isFinite(Number(user.missedcallnightminute)) ? Number(user.missedcallnightminute) : 0,
    missedCallTimezone: toStr(user.missedcalltimezone) || 'Asia/Kolkata',
    missedCallTemplateName: user.missedcalltemplatename || '',
    missedCallTemplateLanguage: user.missedcalltemplatelanguage || 'en_US',
    missedCallTemplateVariables: Array.isArray(user.missedcalltemplatevariables) ? user.missedcalltemplatevariables : []
  };
};

const getUserCredentials = async (req, res) => {
  try {
    const requesterId = req.user?.userId || req.user?.id;
    const requesterEmail = req.user?.email;
    const requesterRole = toStr(req.user?.role).toLowerCase();
    const { adminId } = req.query;
    let user = null;

    if (requesterRole === 'superadmin' && adminId) {
      if (!mongoose.Types.ObjectId.isValid(adminId)) return res.status(400).json({ message: 'Invalid adminId' });
      user = await User.findOne({ _id: adminId, role: 'admin' }).lean();
      if (!user) return res.status(404).json({ message: 'Admin user not found' });
    } else if (requesterRole === 'superadmin') {
      user = { _id: requesterId || 'superadmin-id', role: 'superadmin', username: req.user?.username || 'Super Admin', email: requesterEmail || '', companyId: null, companyRole: 'superadmin' };
    } else {
      if (requesterId && mongoose.Types.ObjectId.isValid(requesterId)) user = await User.findById(requesterId).lean();
      if (!user && requesterEmail) user = await User.findOne({ email: requesterEmail }).lean();
      if (!user) return res.status(404).json({ message: 'User not found' });
    }

    const formattedUser = await formatUserPayload(user, user.role === 'superadmin' ? { planCode: 'enterprise', subscriptionStatus: 'active', featureFlags: {} } : null);
    const { credentials, inheritedSource } = await buildCredentialSnapshot(user);
    return res.json({
      success: true,
      data: {
        ...formattedUser,
        createdBy: user.createdBy || null,
        ownerId: user.ownerId || user.createdBy || null,
        parentUserId: user.parentUserId || user.createdBy || null,
        createdByName: user.createdByName || '',
        ...buildAgentAccessPayload({ ...user, companyRole: formattedUser.companyRole }),
        metaAppId: credentials.metaAppId,
        metaAppSecret: credentials.metaAppSecret,
        metaRedirectUri: credentials.metaRedirectUri,
        metaUserAccessToken: credentials.metaUserAccessToken,
        metaAdAccountId: credentials.metaAdAccountId,
        metaApiVersion: credentials.metaApiVersion,
        metaJwtSecret: credentials.metaJwtSecret,
        companyRole: formattedUser.companyRole,
        credentialOwnerUserId: inheritedSource?._id || user._id
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch user credentials', error: error.message });
  }
};

const simpleLookupResponse = async (user, res) => {
  if (!user) return res.status(404).json({ message: 'User not found' });
  const companySnapshot = await resolveCompanySnapshot(user);
  return res.json({ success: true, data: { userId: user._id, email: user.email || null, companyId: user.companyId || null, ...companySnapshot } });
};

const getUserByWhatsAppId = async (req, res) => {
  try {
    const whatsappId = toStr(req.params.whatsappId);
    if (!whatsappId) return res.status(400).json({ message: 'whatsappId is required' });
    const matches = await User.find({ whatsappid: whatsappId }).select('_id email companyId updatedAt createdAt').sort({ updatedAt: -1, createdAt: -1 }).lean();
    if (!matches.length) return res.status(404).json({ message: 'User not found for whatsappId' });
    const selectedUser = matches[0];
    const companySnapshot = await resolveCompanySnapshot(selectedUser);
    return res.json({ success: true, data: { userId: selectedUser._id, email: selectedUser.email || null, companyId: selectedUser.companyId || null, ...companySnapshot, duplicateCount: matches.length } });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to resolve user by whatsappId', error: error.message });
  }
};

const getUserByPhoneNumber = async (req, res) => {
  try {
    const phone = normalizePhone(req.params.phoneNumber);
    if (!phone) return res.status(400).json({ message: 'phoneNumber is required' });
    const matches = await User.find({ phonenumber: phone }).select('_id email companyId updatedAt createdAt').sort({ updatedAt: -1, createdAt: -1 }).lean();
    if (!matches.length) return res.status(404).json({ message: 'User not found for phoneNumber' });
    const selectedUser = matches[0];
    const companySnapshot = await resolveCompanySnapshot(selectedUser);
    return res.json({ success: true, data: { userId: selectedUser._id, email: selectedUser.email || null, companyId: selectedUser.companyId || null, ...companySnapshot, duplicateCount: matches.length } });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to resolve user by phone number', error: error.message });
  }
};

const getUserCredentialsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId' });
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ success: true, data: await formatUserPayload(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch user credentials', error: error.message });
  }
};

const updateUserCredentialsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId' });
    const updateData = {};
    for (const [publicKey, dbKey] of Object.entries(credentialFieldMap)) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, publicKey)) updateData[dbKey] = req.body[publicKey];
    }
    if (!Object.keys(updateData).length) return res.status(400).json({ message: 'No credential fields provided' });
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).lean();
    if (!updatedUser) return res.status(404).json({ message: 'User not found' });
    return res.json({ success: true, data: await formatUserPayload(updatedUser) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update user credentials', error: error.message });
  }
};

const getTwilioCredentialsByUserId = async (req, res) => {
  try {
    const user = mongoose.Types.ObjectId.isValid(req.params.userId) ? await User.findById(req.params.userId).lean() : null;
    if (!user) return res.status(404).json({ message: 'User not found' });
    const snap = await formatUserPayload(user);
    return res.json({ success: true, data: { twilioAccountSid: snap.twilioAccountSid, twilioAuthToken: snap.twilioAuthToken, twilioPhoneNumber: snap.twilioPhoneNumber, phoneNumber: snap.phoneNumber } });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch Twilio credentials', error: error.message });
  }
};

const getTwilioCredentialsByPhoneNumber = async (req, res) => {
  try {
    const user = await User.findOne({ phonenumber: normalizePhone(req.params.phoneNumber) }).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const snap = await formatUserPayload(user);
    return res.json({ success: true, data: { twilioAccountSid: snap.twilioAccountSid, twilioAuthToken: snap.twilioAuthToken, twilioPhoneNumber: snap.twilioPhoneNumber, phoneNumber: snap.phoneNumber } });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch Twilio credentials', error: error.message });
  }
};

module.exports = getUserCredentials;
module.exports.getUserCredentials = getUserCredentials;
module.exports.getUserByWhatsAppId = getUserByWhatsAppId;
module.exports.getUserByPhoneNumber = getUserByPhoneNumber;
module.exports.getUserCredentialsByUserId = getUserCredentialsByUserId;
module.exports.updateUserCredentialsByUserId = updateUserCredentialsByUserId;
module.exports.getTwilioCredentialsByUserId = getTwilioCredentialsByUserId;
module.exports.getTwilioCredentialsByPhoneNumber = getTwilioCredentialsByPhoneNumber;
