// OMNIA V9 P3 policy projection.
// This is a traceable executable projection of selected constitutional rules,
// not the full UberBond constitution.

forbid (
  principal,
  action == UberBondV9::Action::"execute",
  resource
)
when {
  !context.authorityResolved ||
  !context.identityResolved ||
  !context.evidenceResolved ||
  !context.policyBound ||
  !context.constitutionBound
};

forbid (
  principal,
  action == UberBondV9::Action::"execute",
  resource
)
when {
  context.proposalOrigin == "LEARNING" &&
  context.sovereigntyChange
};

permit (
  principal,
  action == UberBondV9::Action::"execute",
  resource
)
when {
  context.authorityResolved &&
  context.identityResolved &&
  context.evidenceResolved &&
  context.policyBound &&
  context.constitutionBound &&
  !(context.proposalOrigin == "LEARNING" && context.sovereigntyChange)
};
