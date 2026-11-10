const toNonEmptyString = (value) => String(value || '').trim();

const hasCompleteWhatsAppCredentialTuple = (user = {}) =>
  Boolean(
    toNonEmptyString(user.whatsappid) &&
    toNonEmptyString(user.whatsapptoken) &&
    toNonEmptyString(user.whatsappbussiness)
  );

const sharesCredentialWorkspace = (requester = {}, candidate = {}) => {
  const requesterCompanyId = toNonEmptyString(requester.companyId);
  const candidateCompanyId = toNonEmptyString(candidate.companyId);
  return Boolean(requesterCompanyId && candidateCompanyId && requesterCompanyId === candidateCompanyId);
};

// WhatsApp token, WABA ID, and phone ID are one linked credential set. Never
// fill individual missing fields from a different owner.
const resolveWhatsAppCredentialTuple = (user = {}, inherited = null) => {
  const source = hasCompleteWhatsAppCredentialTuple(user)
    ? user
    : hasCompleteWhatsAppCredentialTuple(inherited || {}) &&
        sharesCredentialWorkspace(user, inherited)
      ? inherited
      : null;

  return {
    whatsappId: toNonEmptyString(source?.whatsappid),
    whatsappToken: toNonEmptyString(source?.whatsapptoken),
    whatsappBusiness: toNonEmptyString(source?.whatsappbussiness),
    credentialOwnerUserId: source?._id || null,
  };
};

module.exports = {
  hasCompleteWhatsAppCredentialTuple,
  resolveWhatsAppCredentialTuple,
  sharesCredentialWorkspace,
};
