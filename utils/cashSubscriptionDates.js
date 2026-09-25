const parseCashSubscriptionDates = (body = {}) => {
  if (body.startsAt === undefined && body.endsAt === undefined) return {};
  const startsAt = typeof body.startsAt === 'string' && body.startsAt.trim() ? new Date(body.startsAt) : new Date(NaN);
  const endsAt = typeof body.endsAt === 'string' && body.endsAt.trim() ? new Date(body.endsAt) : new Date(NaN);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    throw new Error('Enter valid subscription dates with the end date after the start date.');
  }
  return { startsAt, endsAt };
};
module.exports = { parseCashSubscriptionDates };
