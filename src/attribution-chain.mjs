// Canon/V3 integration -- PR #7 repair, finding C-P0-006 / C-P1 attribution.
//
// The pre-repair version proved attribution with counts only (how many opportunities, how many
// replies, ...) -- it never demonstrated that any ONE reservation could be traced back to its
// source evidence, opportunity, experiment, message, and sender, because reservations simply
// didn't carry those ids. Now that autonomous-cycle.mjs#runSendPlanning patches every reservation
// with its full canonical identity (opportunityId, sourceEvidenceId, experimentId, lane,
// messageVariantId, cohortApprovalId, organizationDomain, prospectId), this module reconstructs
// the real chain: source -> evidence -> opportunity -> lane -> prospect -> cohort -> variant ->
// sender -> reservation -> event -> reply -> proposal -> payment -> recurring revenue.
export async function reconstructAttributionChain(store, reservationId) {
  const reservation = await store.get('outboundReservations', reservationId);
  if (!reservation) return null;

  const opportunity = reservation.opportunityId ? await store.get('opportunities', reservation.opportunityId) : null;
  const sourceEvidence = reservation.sourceEvidenceId ? await store.get('sourceEvidence', reservation.sourceEvidenceId) : null;
  const experiment = reservation.experimentId ? await store.get('experiments', reservation.experimentId) : null;
  const messageVariant = reservation.messageVariantId ? await store.get('messageVariants', reservation.messageVariantId) : null;
  const cohortMembers = reservation.cohortApprovalId
    ? await store.list('campaignCohortMembers', { filters: { approvalId: reservation.cohortApprovalId } })
    : [];
  const cohortMember = cohortMembers.find(member => member.firstTouchReservationId === reservationId) || null;
  const outboundEvents = (await store.list('outboundEvents', { filters: { recipientEmail: reservation.recipientEmail } }))
    .filter(event => event.detail?.reservationId === reservationId);
  const replies = reservation.prospectId ? await store.list('replies', { filters: { prospectId: reservation.prospectId } }) : [];
  const orders = reservation.prospectId ? await store.list('orders', { filters: { prospectId: reservation.prospectId } }) : [];
  const subscriptions = reservation.prospectId ? await store.list('subscriptions', { filters: { prospectId: reservation.prospectId } }) : [];

  const requiredLinks = {
    opportunityId: reservation.opportunityId || null,
    sourceEvidenceId: reservation.sourceEvidenceId || null,
    experimentId: reservation.experimentId || null,
    lane: reservation.lane || null,
    messageVariantId: reservation.messageVariantId || null,
    cohortApprovalId: reservation.cohortApprovalId || null,
    sender: reservation.inbox || null,
    recipient: reservation.recipientEmail || null
  };
  const complete = Object.values(requiredLinks).every(value => value !== null && value !== '');

  return {
    reservationId,
    prospectId: reservation.prospectId || null,
    ...requiredLinks,
    firstTouch: Boolean(cohortMember),
    complete,
    chain: { opportunity, sourceEvidence, experiment, messageVariant, cohortMember, outboundEvents, replies, orders, subscriptions }
  };
}
