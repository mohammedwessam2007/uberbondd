// The one concentration cap shared by the distribution control plane and the
// lawful channel router: no single motion or channel may carry more than half
// of a portfolio or cohort. It lives on its own so the router can use it
// without wiring the control plane, which stays deliberately unwired until
// outbound is authorized (config/reachability-classification.json).
export const DISTRIBUTION_MAX_MOTION_SHARE = 0.50;
