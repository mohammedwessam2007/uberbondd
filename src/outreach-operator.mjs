/*
 * Owner-use-case decision layer.
 *
 * This is deliberately not a claim that UberBond has recreated Instantly's
 * paid infrastructure.  It scores the jobs that matter for Mohamed's actual
 * acquisition loop: evidence -> authorized distribution -> opportunity ->
 * cleared payment -> accepted delivery -> recurring monitoring.
 */

export const OUTREACH_OPERATOR_VERSION = 'uberbond.outreach-operator.v1';

export const OWNER_USE_CASE_JOBS = Object.freeze([
  { id: 'evidence_selection', label: 'Evidence-bound prospect selection', weight: 10, instantly: 2, uberbond: 5, winner: 'UberBond', basis: 'website evidence, issue confidence, and source provenance' },
  { id: 'route_authorization', label: 'Route and authorization governance', weight: 10, instantly: 1, uberbond: 5, winner: 'UberBond', basis: 'route evidence, jurisdiction, exact approval and V9 admission' },
  { id: 'claim_binding', label: 'Truthful claim binding', weight: 10, instantly: 1, uberbond: 5, winner: 'UberBond', basis: 'message digest bound to observed evidence and owner-approved payload' },
  { id: 'contact_history', label: 'Prior-contact and suppression history', weight: 8, instantly: 4, uberbond: 5, winner: 'UberBond', basis: 'recipient/domain cooldowns, tombstones, global suppression and uncertain-effect locks' },
  { id: 'sequence_execution', label: 'Sequence and campaign execution', weight: 8, instantly: 5, uberbond: 4, winner: 'Instantly', basis: 'Instantly has the broader mature campaign surface; UberBond owns the governed subset' },
  { id: 'sender_infrastructure', label: 'Sender fleet and rotation', weight: 4, instantly: 5, uberbond: 2, winner: 'Instantly', basis: 'UberBond now has a bounded health-ranked sender mesh, but Instantly still has the larger connected-account operation' },
  { id: 'warmup', label: 'Warmup network', weight: 3, instantly: 5, uberbond: 2, winner: 'Instantly', basis: 'UberBond now provides an observed-signal ramp and hold plan; it does not pretend to own a warmup network' },
  { id: 'placement', label: 'Inbox placement and blacklist testing', weight: 3, instantly: 5, uberbond: 3, winner: 'Instantly', basis: 'UberBond now combines local authentication/health preflight with an explicit provider-test adapter boundary' },
  { id: 'lead_supply', label: 'Lead database and sourcing scale', weight: 4, instantly: 5, uberbond: 3, winner: 'Instantly', basis: 'UberBond now manages an evidence-supply queue; Instantly still has the larger external lead database' },
  { id: 'enrichment_verification', label: 'Enrichment and verification', weight: 4, instantly: 4, uberbond: 4, winner: 'Tie', basis: 'UberBond binds selected contacts to website evidence and verification; Instantly offers broader enrichment credits' },
  { id: 'unibox', label: 'Unified inbox and reply actions', weight: 5, instantly: 4, uberbond: 4, winner: 'Tie', basis: 'UberBond combines thread context, evidence, suppression and commercial state; provider reply sending remains gated' },
  { id: 'automation_webhooks', label: 'Automation and event webhooks', weight: 5, instantly: 4, uberbond: 4, winner: 'Tie', basis: 'Signed, idempotent provider events and owner-local automation are implemented' },
  { id: 'analytics_optimization', label: 'Analytics and optimization', weight: 6, instantly: 4, uberbond: 5, winner: 'UberBond', basis: 'variant analytics is weighted by opportunity, cleared revenue and recurring state' },
  { id: 'revenue_attribution', label: 'Revenue attribution', weight: 12, instantly: 2, uberbond: 5, winner: 'UberBond', basis: 'message -> reply -> opportunity -> order -> cleared revenue lineage' },
  { id: 'delivery_acceptance', label: 'Delivery and acceptance continuity', weight: 8, instantly: 1, uberbond: 5, winner: 'UberBond', basis: 'delivery, acceptance and service continuity remain in the same owner record' },
  { id: 'payment_continuity', label: 'Payment continuity', weight: 12, instantly: 2, uberbond: 5, winner: 'UberBond', basis: 'cleared-payment evidence is a first-class stop rule and funnel outcome' },
  { id: 'recurring_monitoring', label: 'Recurring-monitoring continuity', weight: 8, instantly: 0, uberbond: 5, winner: 'UberBond', basis: 'monitoring subscriptions and recurring service state are native to UberBond' },
  { id: 'owner_cost', label: 'Single-owner operating cost', weight: 7, instantly: 1, uberbond: 5, winner: 'UberBond', basis: 'the owner seat is free; external provider and domain costs remain explicitly separated' },
  { id: 'ai_autonomy', label: 'AI reply and sales autonomy', weight: 3, instantly: 5, uberbond: 3, winner: 'Instantly', basis: 'UberBond now has a safe copilot for ranking, classification, drafts and stops; Instantly remains more autonomous' },
  { id: 'agency_mode', label: 'Agency and multi-user mode', weight: 1, instantly: 5, uberbond: 0, winner: 'Instantly', basis: 'intentionally out of scope for one owner' }
]);

function comparisonDimension({ id, label, weight = 1, instantly, uberbond, basis, instantlyEvidence, uberbondEvidence, confidence = 'decision-model' }) {
  return { id, label, weight, instantly, uberbond, basis, instantlyEvidence, uberbondEvidence, confidence };
}

/**
 * A broad functional comparison. Scores are deliberately job-specific:
 * 5 means strongest fit for that job, not total product quality. The official
 * Instantly evidence is its documented platform surface; the UberBond side is
 * limited to capabilities implemented in this repository and its governed
 * owner workflow.
 */
export const COMPARISON_FUNCTIONAL_SECTORS = Object.freeze([
  {
    id: 'market_and_lead_supply', label: 'Market, targeting and lead supply', description: 'How each system finds, filters and prioritizes possible buyers.', dimensions: [
      comparisonDimension({ id: 'target_sourcing', label: 'Target sourcing scale', weight: 4, instantly: 5, uberbond: 3, basis: 'Instantly is built for broad B2B prospect supply; UberBond is built for smaller evidence-backed supply.', instantlyEvidence: 'B2B Lead Database and campaign lead uploads are documented.', uberbondEvidence: 'Discovery, imports and local evidence-search are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'lead_database', label: 'Ready-made lead database', weight: 3, instantly: 5, uberbond: 1, basis: 'Instantly offers an external database surface; UberBond does not claim a proprietary lead index.', instantlyEvidence: 'SuperSearch/B2B Lead Database is a documented product area.', uberbondEvidence: 'No external lead database is enabled; invented contacts are prohibited.', confidence: 'official-capability-plus-boundary' }),
      comparisonDimension({ id: 'segmentation', label: 'Segmentation and list control', weight: 3, instantly: 4, uberbond: 4, basis: 'Both support lists and structured filtering; UberBond adds suppression and evidence gates.', instantlyEvidence: 'CRM, lead lists, tags and campaign controls are documented.', uberbondEvidence: 'Lead lists, tags, stages, suppression and evidence filters are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'evidence_selection', label: 'Evidence quality before outreach', weight: 5, instantly: 2, uberbond: 5, basis: 'UberBond ranks observed website evidence, confidence and freshness before owner review.', instantlyEvidence: 'Instantly documents lead sourcing and enrichment, not UberBond-style source-bound website QA evidence.', uberbondEvidence: 'Evidence-ranked search and evidence-supply queue are implemented.', confidence: 'implementation-evidence' })
    ]
  },
  {
    id: 'research_and_personalization', label: 'Research, data quality and personalization', description: 'How reliably the system turns public information into a truthful, relevant message.', dimensions: [
      comparisonDimension({ id: 'website_research', label: 'Website and issue research', weight: 5, instantly: 2, uberbond: 5, basis: 'UberBond is specialized around observed website defects and release-readiness evidence.', instantlyEvidence: 'Website Visitors and AI Sales Agent are documented, but not the same as a QA evidence dossier.', uberbondEvidence: 'Browser audit, issue selection, evidence URLs and excerpts are core pipeline outputs.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'contact_verification', label: 'Contact verification', weight: 4, instantly: 4, uberbond: 4, basis: 'Instantly has verification/enrichment credits; UberBond requires an exact selected contact and can record verification.', instantlyEvidence: 'Lead verification and enrichment credits are documented.', uberbondEvidence: 'Contact verification, exact recipient checks and no-private-email inference are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'evidence_personalization', label: 'Evidence-bound personalization', weight: 5, instantly: 2, uberbond: 5, basis: 'UberBond binds message claims and merge data to observed evidence and owner-approved payloads.', instantlyEvidence: 'Campaign personalization and AI sequence generation are documented, but claim binding is not asserted here.', uberbondEvidence: 'Evidence-bound merge tags, message digests and exact approvals are implemented.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'visitor_intelligence', label: 'Website visitor intelligence', weight: 2, instantly: 5, uberbond: 1, basis: 'Instantly has a documented visitor-identification surface; UberBond does not enable visitor identity enrichment.', instantlyEvidence: 'Website Visitor identifies visitor business information and visited pages.', uberbondEvidence: 'No visitor identity provider or enrichment is enabled.', confidence: 'official-capability-plus-boundary' })
    ]
  },
  {
    id: 'campaign_and_execution', label: 'Campaign design and execution', description: 'How well each system builds, tests, schedules and diagnoses outbound work.', dimensions: [
      comparisonDimension({ id: 'campaign_builder', label: 'Campaign builder', weight: 5, instantly: 5, uberbond: 4, basis: 'Instantly has the broader mature campaign surface; UberBond provides a bounded owner-first builder.', instantlyEvidence: 'Campaign builder, lifecycle APIs and campaign analytics are documented.', uberbondEvidence: 'Sequences, steps, delays, settings, lifecycle controls and previews are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'sequence_control', label: 'Sequence flexibility', weight: 4, instantly: 5, uberbond: 4, basis: 'Instantly is broader at scale; UberBond supports bounded waits, conditions, variants and stop rules.', instantlyEvidence: 'Campaign and sequence APIs are documented.', uberbondEvidence: 'Up to 12 steps, precise waits, conditions, variants and stop rules are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'variant_testing', label: 'A/B testing and optimization', weight: 4, instantly: 5, uberbond: 4, basis: 'Both support variants and analytics; UberBond weights optimization toward commercial outcomes.', instantlyEvidence: 'A/Z testing and campaign analytics are documented.', uberbondEvidence: 'Variant analytics and owner-reviewed optimization plans are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'sending_diagnostics', label: 'Why a campaign is not moving', weight: 4, instantly: 5, uberbond: 5, basis: 'Both expose campaign status; UberBond adds owner-plan, evidence, sender, approval and uncertain-effect reasons.', instantlyEvidence: 'Instantly documents campaign sending status and issue tracking.', uberbondEvidence: 'Campaign diagnostics exposes issue codes, actions, due work, progress and reconciliation needs.', confidence: 'official-capability-plus-implementation' })
    ]
  },
  {
    id: 'sender_and_deliverability', label: 'Sender infrastructure and deliverability', description: 'How each system protects the sending channel and manages delivery uncertainty.', dimensions: [
      comparisonDimension({ id: 'sender_fleet', label: 'Connected sender fleet', weight: 5, instantly: 5, uberbond: 2, basis: 'Instantly has the larger account and warmup operation; UberBond has bounded owner-controlled slots.', instantlyEvidence: 'Unlimited connected accounts and warmup are documented.', uberbondEvidence: 'Gmail A/B slots, caps and owner connection controls are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'sender_routing', label: 'Sender routing and rotation', weight: 4, instantly: 5, uberbond: 3, basis: 'Instantly has mature fleet operations; UberBond now provides sticky, provider-aware, health-ranked routing plans.', instantlyEvidence: 'Inbox rotation and account operations are documented.', uberbondEvidence: 'Sender mesh plans stickiness, provider matching, capacity and explicit block reasons.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'warmup', label: 'Warmup capability', weight: 4, instantly: 5, uberbond: 2, basis: 'Instantly owns a warmup network; UberBond provides a conservative observed-signal ramp and hold plan.', instantlyEvidence: 'Unlimited warmup and warmup analytics are documented.', uberbondEvidence: 'Ramp planning is local and does not claim a warmup network.', confidence: 'official-capability-plus-boundary' }),
      comparisonDimension({ id: 'placement', label: 'Placement and blacklist testing', weight: 4, instantly: 5, uberbond: 3, basis: 'Instantly has provider placement testing; UberBond provides authentication/health preflight and an explicit adapter boundary.', instantlyEvidence: 'Inbox Placement evaluates inbox/spam, authentication and blacklist signals.', uberbondEvidence: 'Local placement plan distinguishes observed checks from provider tests not run.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'channel_safety', label: 'Suppression, complaints and uncertain effects', weight: 5, instantly: 3, uberbond: 5, basis: 'UberBond treats suppression, complaints, cooldowns and uncertain provider outcomes as durable safety state.', instantlyEvidence: 'Block lists, account pausing and provider events are documented.', uberbondEvidence: 'Global suppression, cooldowns, health pauses, durable reservations and read-only reconciliation are implemented.', confidence: 'implementation-evidence' })
    ]
  },
  {
    id: 'conversation_and_automation', label: 'Conversation, automation and AI', description: 'How each system handles replies, workflow events and machine assistance.', dimensions: [
      comparisonDimension({ id: 'unified_inbox', label: 'Unified inbox', weight: 4, instantly: 4, uberbond: 4, basis: 'Both provide a unified reply surface; UberBond adds evidence and commercial continuity context.', instantlyEvidence: 'Unibox and reply APIs are documented.', uberbondEvidence: 'Stored threads, read state, evidence, suppression and opportunity context are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'reply_autonomy', label: 'Autonomous reply handling', weight: 4, instantly: 5, uberbond: 3, basis: 'Instantly is more autonomous; UberBond uses classification and owner-reviewed drafts to protect high-impact actions.', instantlyEvidence: 'AI Inbox Manager and AI Reply Agent are documented.', uberbondEvidence: 'Reply classification, stop logic and deterministic owner drafts are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'owner_workflow', label: 'Owner review and next-action control', weight: 5, instantly: 2, uberbond: 5, basis: 'UberBond makes review, exact approval, stop state and next commercial action first-class.', instantlyEvidence: 'Instantly documents automation and CRM flows, not the same V9 approval boundary.', uberbondEvidence: 'Owner queue, step approvals, reply drafts, diagnostics and exact payload gating are implemented.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'automation', label: 'Event automation', weight: 4, instantly: 4, uberbond: 4, basis: 'Both have automation surfaces; UberBond keeps mutations local and idempotent unless a governed adapter exists.', instantlyEvidence: 'Automations and webhooks are documented.', uberbondEvidence: 'Signed provider events, idempotent automation runs and owner-local actions are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'copilot_control', label: 'Safe AI copilot', weight: 4, instantly: 5, uberbond: 4, basis: 'Instantly has more autonomous sales features; UberBond’s copilot is safer for regulated, evidence-sensitive work.', instantlyEvidence: 'AI Sequence Generator, Reply Agent and Sales Agent are documented.', uberbondEvidence: 'Copilot ranks, classifies, drafts and stops while blocking autonomous sending, negotiation and payment assertions.', confidence: 'official-capability-plus-implementation' })
    ]
  },
  {
    id: 'analytics_and_commercial', label: 'Analytics and commercial outcomes', description: 'Whether the system optimizes attention, or the full path to collected and repeated revenue.', dimensions: [
      comparisonDimension({ id: 'engagement_analytics', label: 'Open, click and reply analytics', weight: 3, instantly: 5, uberbond: 4, basis: 'Instantly has a deeper outreach analytics surface; UberBond tracks normalized local/provider observations.', instantlyEvidence: 'Campaign analytics and daily analytics are documented.', uberbondEvidence: 'Message fields, provider events and variant analytics are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'revenue_attribution', label: 'Revenue attribution', weight: 6, instantly: 2, uberbond: 5, basis: 'UberBond joins message, reply, opportunity, order, cleared revenue and recurring state.', instantlyEvidence: 'Instantly documents campaign and CRM analytics, not this full payment lineage.', uberbondEvidence: 'Revenue-weighted analytics and receipt-backed funnel lineage are implemented.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'payment_continuity', label: 'Payment and settlement continuity', weight: 6, instantly: 1, uberbond: 5, basis: 'Payment proof and cleared revenue are native UberBond outcomes, not outreach vanity metrics.', instantlyEvidence: 'Instantly’s documented plans focus on outreach, credits, CRM and placement.', uberbondEvidence: 'Orders, cleared-payment evidence, payment stop rules and revenue states are implemented.', confidence: 'official-capability-plus-implementation' }),
      comparisonDimension({ id: 'delivery_acceptance', label: 'Service delivery and acceptance', weight: 5, instantly: 1, uberbond: 5, basis: 'UberBond keeps paid diagnostic delivery and acceptance in the same commercial record.', instantlyEvidence: 'Instantly is documented as a sales/outreach platform rather than a service-acceptance system.', uberbondEvidence: 'Delivery, acceptance and opportunity state transitions are implemented.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'recurring_monitoring', label: 'Recurring customer continuity', weight: 5, instantly: 1, uberbond: 5, basis: 'UberBond can connect monitoring/subscription state to the original opportunity and evidence.', instantlyEvidence: 'Recurring service continuity is not presented as a core Instantly capability in the cited surface.', uberbondEvidence: 'Subscriptions, recurring states and monitoring outcomes exist in the revenue model.', confidence: 'implementation-evidence' })
    ]
  },
  {
    id: 'governance_and_trust', label: 'Governance, compliance and trust', description: 'How safely each system handles claims, authority, auditability and external effects.', dimensions: [
      comparisonDimension({ id: 'route_authorization', label: 'Route and authorization governance', weight: 6, instantly: 1, uberbond: 5, basis: 'UberBond requires route evidence, exact approval and authoritative admission before consequential outreach.', instantlyEvidence: 'Instantly documents sending workflows and API scopes, not UberBond’s evidence/authority model.', uberbondEvidence: 'Route evidence, signed approvals and V9 consequence admission are implemented.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'claim_truth', label: 'Truthful claim control', weight: 5, instantly: 1, uberbond: 5, basis: 'UberBond binds claims to observed evidence and refuses unsupported experience, outcome or authority claims.', instantlyEvidence: 'AI personalization is documented; claim-binding guarantees are not asserted here.', uberbondEvidence: 'Claim evidence assets, message digests and claim-risk rejection are implemented.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'auditability', label: 'Audit trail and replayability', weight: 5, instantly: 2, uberbond: 5, basis: 'UberBond records decisions, evidence, digests, reservations, provider results and reconciliation history.', instantlyEvidence: 'Audit-log and API surfaces are documented.', uberbondEvidence: 'Append-only proof, event ledgers, effect identities and reconciliation records are implemented.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'effect_recovery', label: 'External-effect recovery', weight: 5, instantly: 1, uberbond: 5, basis: 'UberBond never blind-retries an uncertain provider effect and reconciles read-only evidence first.', instantlyEvidence: 'The cited Instantly surface documents sending APIs and webhooks but not this exact recovery contract.', uberbondEvidence: 'Gmail effect adapter, uncertain quarantine and read-only reconciliation are tested.', confidence: 'implementation-evidence' }),
      comparisonDimension({ id: 'data_boundary', label: 'Data and authority boundaries', weight: 4, instantly: 2, uberbond: 4, basis: 'UberBond separates local plans from provider effects and keeps high-impact actions owner/V9 gated.', instantlyEvidence: 'Instantly provides broad API scopes and workspace automation.', uberbondEvidence: 'Owner-only workspace, no-effect dry runs and final consequence gates are implemented.', confidence: 'implementation-evidence' })
    ]
  },
  {
    id: 'economics_and_operating_model', label: 'Economics, scale and operating model', description: 'Which system fits the operator, budget, volume and organizational shape.', dimensions: [
      comparisonDimension({ id: 'solo_founder', label: 'Solo founder fit', weight: 5, instantly: 2, uberbond: 5, basis: 'UberBond is designed around one owner making evidence and commercial decisions; Instantly is optimized for scaled sending.', instantlyEvidence: 'Instantly’s plans and account fleet favor outreach scale.', uberbondEvidence: 'Free owner seat, owner queue and bounded decision surface are implemented.', confidence: 'decision-model' }),
      comparisonDimension({ id: 'owner_cost', label: 'Low-cost operating model', weight: 5, instantly: 2, uberbond: 5, basis: 'UberBond separates free owner control from optional provider/domain/payment costs.', instantlyEvidence: 'Instantly documents paid outreach, credits, placement and account/domain services.', uberbondEvidence: 'Free-core owner workspace and explicit provider-cost separation are implemented.', confidence: 'official-pricing-plus-implementation' }),
      comparisonDimension({ id: 'agency_scale', label: 'Agency and multi-seat scale', weight: 4, instantly: 5, uberbond: 1, basis: 'Instantly is stronger for multi-workspace and client-account operations; UberBond intentionally prioritizes owner control.', instantlyEvidence: 'Workspace groups, CRM and agency-oriented product surfaces are documented.', uberbondEvidence: 'UberBond remains owner-only and does not claim multi-seat mutation.', confidence: 'official-capability-plus-boundary' }),
      comparisonDimension({ id: 'high_volume', label: 'High-volume outbound scale', weight: 5, instantly: 5, uberbond: 2, basis: 'Instantly is the better commodity sending engine; UberBond limits volume around evidence, authorization and safety.', instantlyEvidence: 'Plans publish large contact/email capacities and unlimited accounts.', uberbondEvidence: 'Caps, cooldowns, canary limits and owner/V9 gates constrain volume deliberately.', confidence: 'official-pricing-plus-implementation' }),
      comparisonDimension({ id: 'setup_simplicity', label: 'Fast standard outreach setup', weight: 3, instantly: 4, uberbond: 3, basis: 'Instantly is simpler for a standard outbound campaign; UberBond takes longer because it verifies the route and evidence.', instantlyEvidence: 'Campaign setup, DFY accounts and onboarding are documented.', uberbondEvidence: 'Dry-run, preview and approval flows are implemented but intentionally more rigorous.', confidence: 'decision-model' })
    ]
  }
]);

/**
 * Industry/vertical fit is a separate view from platform parity. It answers
 * “which system is the better operating choice for this type of buyer?” rather
 * than pretending every buyer values the same feature set.
 */
export const COMPARISON_INDUSTRY_SECTORS = Object.freeze([
  { id: 'website_agencies', label: 'Website agencies and digital studios', instantly: 4, uberbond: 5, weight: 4, bestUse: 'QA-led prospecting, release-readiness diagnostics and client repair queues', basis: 'UberBond’s website evidence and agency-branded reporting fit the service; Instantly remains stronger for scaled agency outbound.' },
  { id: 'medical_healthcare', label: 'Medical practices and healthcare agencies', instantly: 2, uberbond: 5, weight: 5, bestUse: 'Evidence-bound, conservative website QA and regulated-service outreach', basis: 'UberBond’s evidence, claim and route controls matter more than raw sending scale.' },
  { id: 'local_clinics', label: 'Local clinics and practices', instantly: 3, uberbond: 5, weight: 4, bestUse: 'Website conversion-path review tied to a paid diagnostic and monitoring offer', basis: 'UberBond connects public-site findings to a service and recurring continuity.' },
  { id: 'saas_b2b', label: 'SaaS and B2B technology', instantly: 5, uberbond: 4, weight: 4, bestUse: 'Instantly for high-volume SDR motions; UberBond for evidence-led QA or founder-led niche selling', basis: 'SaaS teams often value scale and automation; UberBond wins when the offer depends on precise product/website evidence.' },
  { id: 'professional_services', label: 'Professional services', instantly: 4, uberbond: 4, weight: 3, bestUse: 'Either: Instantly for volume, UberBond for governed high-trust selling', basis: 'The choice depends on whether scale or evidence and commercial proof is the bottleneck.' },
  { id: 'recruitment_staffing', label: 'Recruitment and staffing', instantly: 5, uberbond: 3, weight: 3, bestUse: 'Instantly for broad account and candidate-side campaigns', basis: 'High-volume multi-account outreach favors Instantly; UberBond is stronger only for narrow, evidence-heavy placements.' },
  { id: 'ecommerce', label: 'E-commerce brands', instantly: 4, uberbond: 3, weight: 2, bestUse: 'Instantly for partner/merchant outreach; UberBond for website QA retainers', basis: 'Instantly has broader outreach scale; UberBond adds value when the offer is site operations rather than campaign volume.' },
  { id: 'education_training', label: 'Education and training', instantly: 4, uberbond: 4, weight: 2, bestUse: 'Either, with UberBond favored for evidence-bound institutional outreach', basis: 'Both can support structured outreach; governance and route evidence determine the safer choice.' },
  { id: 'legal_finance', label: 'Legal, finance and regulated professional services', instantly: 3, uberbond: 5, weight: 5, bestUse: 'Evidence-first, owner-reviewed and auditable acquisition', basis: 'UberBond’s claim, authority, audit and payment boundaries are more valuable in high-trust sectors.' },
  { id: 'nonprofits_associations', label: 'Nonprofits and associations', instantly: 3, uberbond: 4, weight: 2, bestUse: 'Small, consent-aware relationship campaigns', basis: 'UberBond’s bounded owner workflow suits small relationship motions; Instantly is stronger for scale.' },
  { id: 'solo_consultants', label: 'Solo consultants and freelancers', instantly: 2, uberbond: 5, weight: 5, bestUse: 'One-owner evidence-to-payment loop with low fixed cost', basis: 'UberBond is designed around the founder’s review and revenue continuity rather than a sales-team fleet.' },
  { id: 'multi_client_agencies', label: 'Multi-client outbound agencies', instantly: 5, uberbond: 2, weight: 3, bestUse: 'Instantly for account, workspace and volume operations', basis: 'Instantly’s agency/multi-workspace orientation is stronger; UberBond’s owner-only boundary is deliberate.' },
  { id: 'website_qa_operations', label: 'Website QA and release-readiness services', instantly: 2, uberbond: 5, weight: 5, bestUse: 'Sell and deliver fixed-scope website diagnostics with evidence-backed repair queues', basis: 'This is UberBond’s clearest productized-service fit and directly matches the edited Innovate By Day offer.' },
  { id: 'real_estate', label: 'Real estate and property services', instantly: 4, uberbond: 3, weight: 2, bestUse: 'Instantly for broad broker/partner outreach; UberBond for website conversion audits', basis: 'The winner depends on whether the commercial offer is outreach volume or website operations.' },
  { id: 'hospitality_travel', label: 'Hospitality and travel', instantly: 4, uberbond: 3, weight: 2, bestUse: 'Instantly for partner distribution; UberBond for booking-path and website QA work', basis: 'Instantly wins distribution scale; UberBond wins when measurable site friction is the product.' }
]);

function winnerFor(instantly, uberbond) {
  if (Math.abs(Number(instantly) - Number(uberbond)) < 0.01) return 'Tie';
  return Number(uberbond) > Number(instantly) ? 'UberBond' : 'Instantly';
}

function summarizeSector(sector, dimensions = null) {
  const rows = dimensions || [sector];
  const weight = rows.reduce((sum, row) => sum + Number(row.weight || 1), 0);
  const instantly = rows.reduce((sum, row) => sum + Number(row.instantly || 0) * Number(row.weight || 1), 0) / Math.max(1, weight);
  const uberbond = rows.reduce((sum, row) => sum + Number(row.uberbond || 0) * Number(row.weight || 1), 0) / Math.max(1, weight);
  return {
    id: sector.id,
    label: sector.label,
    description: sector.description,
    bestUse: sector.bestUse,
    basis: sector.basis,
    weight,
    scores: { instantly: pct(instantly), uberbond: pct(uberbond), margin: pct(uberbond - instantly) },
    winner: winnerFor(instantly, uberbond),
    dimensions: dimensions ? dimensions.map(row => ({ ...row, winner: winnerFor(row.instantly, row.uberbond), weightedInstantly: Number(row.instantly || 0) * Number(row.weight || 1), weightedUberBond: Number(row.uberbond || 0) * Number(row.weight || 1) })) : []
  };
}

export function buildDetailedComparison({ asOf = new Date(), externalProvider = 'gmail-api' } = {}) {
  const functionalSectors = COMPARISON_FUNCTIONAL_SECTORS.map(sector => summarizeSector(sector, sector.dimensions));
  const industrySectors = COMPARISON_INDUSTRY_SECTORS.map(sector => summarizeSector(sector));
  const flattenFunctional = functionalSectors.flatMap(sector => sector.dimensions);
  const functionalWeight = flattenFunctional.reduce((sum, row) => sum + Number(row.weight || 1), 0);
  const industryWeight = industrySectors.reduce((sum, row) => sum + Number(row.weight || 1), 0);
  const aggregate = (rows, key) => rows.reduce((sum, row) => sum + Number(row[key] || 0) * Number(row.weight || 1), 0) / Math.max(1, rows.reduce((sum, row) => sum + Number(row.weight || 1), 0));
  const functionalScores = { instantly: pct(aggregate(flattenFunctional, 'instantly')), uberbond: pct(aggregate(flattenFunctional, 'uberbond')) };
  const industryScores = {
    instantly: pct(industrySectors.reduce((sum, row) => sum + row.scores.instantly * row.weight, 0) / Math.max(1, industryWeight)),
    uberbond: pct(industrySectors.reduce((sum, row) => sum + row.scores.uberbond * row.weight, 0) / Math.max(1, industryWeight))
  };
  const wins = rows => rows.filter(row => row.winner === 'UberBond').length;
  const ties = rows => rows.filter(row => row.winner === 'Tie').length;
  return {
    version: `${OUTREACH_OPERATOR_VERSION}.multi-sector`,
    asOf: new Date(asOf).toISOString(),
    externalProvider,
    method: {
      scale: '1-5 fit score',
      interpretation: '5 means strongest fit for the named job; it does not mean total product superiority.',
      winnerRule: 'higher weighted score wins; equal scores are Tie',
      evidenceRule: 'Instantly scores use its official documented surface; UberBond scores use implemented repository capabilities and explicit boundaries.',
      scope: 'functional platform sectors plus buyer-industry fit sectors'
    },
    functionalSectors,
    industrySectors,
    aggregates: {
      functional: { scores: { ...functionalScores, margin: pct(functionalScores.uberbond - functionalScores.instantly) }, sectorWins: wins(functionalSectors), dimensionWins: flattenFunctional.filter(row => row.winner === 'UberBond').length, ties: ties(functionalSectors), sectorCount: functionalSectors.length, dimensionCount: flattenFunctional.length },
      industry: { scores: { ...industryScores, margin: pct(industryScores.uberbond - industryScores.instantly) }, uberbondWins: wins(industrySectors), ties: ties(industrySectors), sectorCount: industrySectors.length }
    },
    strongestUberBondSectors: functionalSectors.flatMap(sector => sector.dimensions.map(row => ({ sector: sector.label, label: row.label, margin: pct(row.uberbond - row.instantly), winner: row.winner }))).filter(row => row.winner === 'UberBond').sort((a, b) => b.margin - a.margin).slice(0, 10),
    strongestInstantlySectors: functionalSectors.flatMap(sector => sector.dimensions.map(row => ({ sector: sector.label, label: row.label, margin: pct(row.uberbond - row.instantly), winner: row.winner }))).filter(row => row.winner === 'Instantly').sort((a, b) => a.margin - b.margin).slice(0, 10),
    limitations: [
      'This matrix does not claim UberBond has Instantly’s mailbox fleet, warmup network, external lead database, placement scale or agency SaaS breadth.',
      'Industry scores are operating-fit judgments for the named use case, not market-size forecasts or proof of customer demand.',
      'The edited Innovate By Day offer remains a prior-contact artifact and is not recreated, resent or treated as a new outbound opportunity.'
    ]
  };
}

function asArray(value) { return Array.isArray(value) ? value : []; }
function lower(value) { return String(value ?? '').trim().toLowerCase(); }
function text(value, max = 400) { return String(value ?? '').trim().slice(0, max); }
function pct(value) { return Math.round(Number(value || 0) * 100) / 100; }

export function buildOwnerUseCaseScorecard({ asOf = new Date(), externalProvider = 'gmail-api' } = {}) {
  const rows = OWNER_USE_CASE_JOBS.map(job => ({
    ...job,
    weightedInstantly: job.instantly * job.weight,
    weightedUberBond: job.uberbond * job.weight,
    scale: 5,
    evidenceBasis: job.basis
  }));
  const weight = rows.reduce((sum, row) => sum + row.weight, 0);
  const instantly = rows.reduce((sum, row) => sum + row.weightedInstantly, 0) / weight;
  const uberbond = rows.reduce((sum, row) => sum + row.weightedUberBond, 0) / weight;
  const wins = rows.filter(row => row.winner === 'UberBond').map(row => row.id);
  const ties = rows.filter(row => row.winner === 'Tie').map(row => row.id);
  const detailedComparison = buildDetailedComparison({ asOf, externalProvider });
  return {
    version: OUTREACH_OPERATOR_VERSION,
    asOf: new Date(asOf).toISOString(),
    objective: 'verified commercial evidence -> authorized distribution -> real opportunity -> cleared payment -> repeatable revenue',
    scope: 'one-owner UberBond acquisition system',
    externalProvider,
    scores: {
      instantly: pct(instantly),
      uberbond: pct(uberbond),
      scale: 5,
      uberbondWins: uberbond > instantly,
      margin: pct(uberbond - instantly)
    },
    rows,
    wins,
    ties,
    detailedComparison,
    limitations: [
      'Instantly remains ahead on mailbox fleet, warmup network, placement scale, lead-data scale, autonomous AI sales infrastructure and agency breadth.',
      'UberBond wins this weighted comparison because the objective includes evidence, authorization, cleared money, delivery acceptance and recurring continuity.',
      'The score is a transparent decision model, not evidence that UberBond has a larger sending network.'
    ]
  };
}

function dateValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function domainOf(value) {
  const email = lower(value);
  return email.includes('@') ? email.split('@').pop() : '';
}

function providerForAddress(value) {
  const domain = domainOf(value);
  if (['gmail.com', 'googlemail.com'].includes(domain)) return 'gmail';
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) return 'outlook';
  return '';
}

function sameDay(value, now) {
  const parsed = dateValue(value);
  return parsed > 0 && new Date(parsed).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
}

function senderSettings(campaign = {}) {
  return campaign.sequence?.settings || {};
}

/**
 * Builds a deterministic sender mesh without selecting a sender for an
 * external effect.  It is deliberately more useful than a binary A/B slot:
 * it accounts for stickiness, provider matching, ESP allow/deny rules, local
 * health, daily observations, and an explicit blocked reason.
 */
export function buildSenderRoutingPlan({ prospects = [], campaigns = [], accounts = [], senderHealth = [], outboundEvents = [], now = new Date() } = {}) {
  const at = new Date(now);
  const healthBySlot = new Map(asArray(senderHealth).map(item => [String(item.inbox || item.slot || ''), item]));
  const campaignsById = new Map(asArray(campaigns).map(item => [String(item.id), item]));
  const eventsBySlot = new Map();
  asArray(outboundEvents).forEach(event => {
    const slot = String(event.inbox || event.slot || '');
    if (!slot) return;
    eventsBySlot.set(slot, [...(eventsBySlot.get(slot) || []), event]);
  });
  const senders = asArray(accounts).map(account => {
    const slot = String(account.slot || '');
    const health = healthBySlot.get(slot) || {};
    const events = (eventsBySlot.get(slot) || []).filter(event => sameDay(event.occurredAt || event.createdAt || event.sentAt, at));
    const bounces = Number(health.hardBouncesToday || 0) || events.filter(event => ['hard_bounce', 'bounce'].includes(lower(event.eventType))).length;
    const complaints = Number(health.complaintsToday || 0) || events.filter(event => lower(event.eventType) === 'complaint').length;
    const uncertain = events.filter(event => lower(event.eventType) === 'send_uncertain').length;
    const score = Math.max(0, Math.min(100, 100 - bounces * 25 - complaints * 100 - uncertain * 15 - Number(health.failureStreak || 0) * 10));
    const provider = lower(account.provider || account.esp || (account.email?.includes('@') ? 'gmail' : '')) || 'unknown';
    const dailyCap = Math.max(0, Number(account.dailyCap || account.cap || 20));
    const sentToday = events.filter(event => ['sent', 'accepted', 'provider_accepted'].includes(lower(event.eventType || event.outcome))).length;
    return {
      slot, email: text(account.email, 320), domain: domainOf(account.email), provider,
      connected: account.connected === true, paused: health.paused === true,
      score, sentToday, dailyCap, remainingToday: Math.max(0, dailyCap - sentToday),
      bounces, complaints, uncertain, failureStreak: Number(health.failureStreak || 0),
      readiness: !account.connected ? 'blocked' : health.paused ? 'paused' : score < 70 ? 'review' : 'ready',
      reason: !account.connected ? 'sender-not-connected' : health.paused ? (health.pauseReason || 'sender-paused') : score < 70 ? 'sender-health-review' : 'available'
    };
  }).filter(item => item.slot);

  const routeFor = prospect => {
    const campaign = campaignsById.get(String(prospect.campaignId || '')) || {};
    const settings = senderSettings(campaign);
    const sticky = settings.stickySendingAccount !== false;
    const match = ['same_esp', 'any', 'gmail_to_gmail', 'outlook_to_outlook'].includes(lower(settings.providerMatching)) ? lower(settings.providerMatching) : 'same_esp';
    const include = asArray(settings.espRouting?.include).map(lower).filter(Boolean);
    const exclude = asArray(settings.espRouting?.exclude).map(lower).filter(Boolean);
    const recipientProvider = providerForAddress(prospect.contact?.email);
    const eligible = senders.filter(sender => {
      if (!sender.connected || sender.paused || sender.remainingToday <= 0) return false;
      if (include.length && !include.includes(sender.provider)) return false;
      if (exclude.includes(sender.provider)) return false;
      if (match === 'gmail_to_gmail' && recipientProvider !== 'gmail') return false;
      if (match === 'outlook_to_outlook' && recipientProvider !== 'outlook') return false;
      if (match === 'same_esp' && recipientProvider && sender.provider !== recipientProvider) return false;
      return true;
    });
    const preferred = sticky ? eligible.find(sender => sender.slot === prospect.inbox) : null;
    const selected = preferred || eligible.slice().sort((a, b) => (b.score - a.score) || (a.sentToday - b.sentToday) || a.slot.localeCompare(b.slot))[0];
    if (selected) return { prospectId: prospect.id, campaignId: prospect.campaignId || '', slot: selected.slot, provider: selected.provider, reason: preferred ? 'sticky-assignment' : 'health-and-capacity-ranked', blocked: false };
    const reasons = [];
    if (!senders.length) reasons.push('no-sender-slots');
    if (senders.length && !senders.some(sender => sender.connected)) reasons.push('no-connected-sender');
    if (senders.some(sender => sender.connected && !sender.paused && sender.remainingToday <= 0)) reasons.push('sender-capacity-exhausted');
    if (senders.some(sender => sender.connected && sender.paused)) reasons.push('sender-paused');
    if (!reasons.length) reasons.push('provider-routing-mismatch');
    return { prospectId: prospect.id, campaignId: prospect.campaignId || '', slot: '', provider: '', reason: reasons.join('|'), blocked: true };
  };
  const assignments = asArray(prospects).filter(item => item.campaignId || item.sequenceState?.status === 'active').map(routeFor);
  return {
    version: `${OUTREACH_OPERATOR_VERSION}.sender-mesh`,
    generatedAt: at.toISOString(),
    senders,
    assignments,
    summary: {
      senders: senders.length,
      available: senders.filter(item => item.readiness === 'ready').length,
      routed: assignments.filter(item => !item.blocked).length,
      blocked: assignments.filter(item => item.blocked).length,
      providers: [...new Set(senders.map(item => item.provider).filter(Boolean))].sort()
    },
    policy: 'routing plan only; no sender was reserved and no provider call was made'
  };
}

/**
 * Turns observed sender facts into a conservative ramp and preflight plan.
 * This closes the operational gap around warmup and placement without
 * claiming a proprietary warmup network or guaranteed inbox placement.
 */
export function buildDeliverabilityEdgePlan({ accounts = [], senderHealth = [], outboundEvents = [], outboundReservations = [], now = new Date() } = {}) {
  const at = new Date(now);
  const routing = buildSenderRoutingPlan({ accounts, senderHealth, outboundEvents, now: at });
  const warmup = routing.senders.map(sender => {
    const account = asArray(accounts).find(item => String(item.slot || '') === sender.slot) || {};
    const startedAt = dateValue(account.warmupStartedAt || account.connectedAt || account.createdAt);
    const warmupDay = startedAt ? Math.max(1, Math.floor((at.getTime() - startedAt) / 86400000) + 1) : 1;
    const targets = [5, 10, 20, 30, 40];
    const target = targets[Math.min(targets.length - 1, Math.max(0, warmupDay - 1))];
    const hold = sender.paused || sender.bounces > 0 || sender.complaints > 0 || sender.uncertain > 0;
    return { slot: sender.slot, day: warmupDay, suggestedDailyCap: hold ? 0 : Math.min(sender.dailyCap, target), action: hold ? 'hold-and-review' : sender.sentToday > target ? 'cap-volume' : 'ramp-within-cap', reason: hold ? 'negative-or-uncertain-signal' : 'conservative-observed-ramp' };
  });
  const checks = routing.senders.map(sender => {
    const account = asArray(accounts).find(item => String(item.slot || '') === sender.slot) || {};
    const authentication = account.authentication || account.dns || {};
    const authObserved = ['spf', 'dkim', 'dmarc'].filter(key => authentication[key] === true || lower(authentication[key]) === 'pass').length;
    const providerPlacement = account.placement?.status || 'not-run';
    return {
      slot: sender.slot, domain: sender.domain, readiness: sender.readiness,
      identity: sender.connected && Boolean(sender.email) ? 'observed' : 'blocked',
      authentication: authObserved === 3 ? 'observed-pass' : authObserved ? 'partial' : 'not-observed',
      localHealth: sender.score >= 85 && !sender.paused ? 'stable' : sender.score >= 70 && !sender.paused ? 'review' : 'blocked',
      providerPlacement,
      nextAction: providerPlacement === 'not-run' ? 'configure-provider-placement-adapter' : 'review-provider-result'
    };
  });
  return {
    version: `${OUTREACH_OPERATOR_VERSION}.deliverability-edge`,
    generatedAt: at.toISOString(),
    warmup, checks,
    uncertainReservations: asArray(outboundReservations).filter(item => item.status === 'uncertain').length,
    summary: {
      senders: routing.senders.length,
      ready: checks.filter(item => item.readiness === 'ready' && item.localHealth === 'stable').length,
      authenticationObserved: checks.filter(item => item.authentication === 'observed-pass').length,
      providerPlacementTested: checks.filter(item => item.providerPlacement !== 'not-run').length,
      holds: warmup.filter(item => item.action === 'hold-and-review').length
    },
    policy: 'observed health and conservative ramp only; no warmup-network or inbox-placement guarantee is claimed'
  };
}

/**
 * Makes local evidence supply measurable: the owner sees whether the next
 * bottleneck is research, contact verification, freshness, suppression, or
 * exact route review instead of reaching for a generic lead database.
 */
export function buildEvidenceSupplyPlan({ prospects = [], suppressions = [], now = new Date() } = {}) {
  const at = new Date(now);
  const blocked = new Set(asArray(suppressions).map(item => lower(item.value)).filter(Boolean));
  const rows = asArray(prospects).map(prospect => {
    const email = lower(prospect.contact?.email);
    const domain = lower(prospect.domain || prospect.website);
    const suppressed = blocked.has(email) || blocked.has(domain);
    const observedAt = prospect.issue?.evidenceObservedAt || prospect.evidenceObservedAt || prospect.updatedAt || prospect.createdAt;
    const ageDays = dateValue(observedAt) ? Math.max(0, Math.floor((at.getTime() - dateValue(observedAt)) / 86400000)) : null;
    const observed = Boolean(prospect.issue?.evidenceUrl);
    const verified = ['valid', 'verified', 'deliverable'].includes(lower(prospect.contact?.verified));
    let action = 'ready-for-owner-review';
    if (suppressed) action = 'suppressed';
    else if (!observed) action = 'research-evidence';
    else if (!email) action = 'select-exact-contact';
    else if (!verified) action = 'verify-contact';
    else if (ageDays === null || ageDays > 30) action = 'refresh-evidence';
    else if (prospect.status !== 'ready' && prospect.status !== 'research-complete') action = 'advance-owner-review';
    const priority = suppressed ? 0 : (Number(prospect.score?.total || 0) * 0.55) + (Number(prospect.issue?.confidence || 0) * 30) + (action === 'ready-for-owner-review' ? 15 : 0);
    return { prospectId: prospect.id, company: text(prospect.company, 180), domain: text(prospect.domain || prospect.website, 240), observed, verified, suppressed, ageDays, action, priority: Math.round(priority * 100) / 100 };
  });
  const active = rows.filter(item => !item.suppressed);
  const count = action => rows.filter(item => item.action === action).length;
  return {
    version: `${OUTREACH_OPERATOR_VERSION}.evidence-supply`,
    generatedAt: at.toISOString(),
    summary: {
      total: rows.length,
      active: active.length,
      observed: active.filter(item => item.observed).length,
      verified: active.filter(item => item.verified).length,
      readyForOwnerReview: count('ready-for-owner-review'),
      researchNeeded: count('research-evidence'),
      contactSelectionNeeded: count('select-exact-contact'),
      verificationNeeded: count('verify-contact'),
      refreshNeeded: count('refresh-evidence'),
      suppressed: rows.filter(item => item.suppressed).length
    },
    queue: rows.filter(item => item.action !== 'suppressed').sort((a, b) => b.priority - a.priority || a.company.localeCompare(b.company)).slice(0, 25),
    policy: 'local public evidence and selected-contact records only; no invented contacts and no suppression bypass'
  };
}

/**
 * A safe owner copilot: it automates classification, ranking and preparation,
 * while explicitly keeping sending, negotiation and payment claims human- or
 * proof-gated.
 */
export function buildOwnerCopilotPlan({ prospects = [], inbox = [], health = {}, now = new Date() } = {}) {
  const actions = [
    { id: 'rank-evidence', label: 'Rank observed opportunities', status: 'ready', effect: 'local-only' },
    { id: 'classify-replies', label: 'Classify replies and stop unsafe follow-ups', status: 'ready', effect: 'local-state-only' },
    { id: 'draft-owner-reply', label: 'Prepare an owner-reviewed reply draft', status: 'ready', effect: 'draft-only' },
    { id: 'pause-risky-sender', label: 'Pause after complaint, bounce or uncertain effect', status: 'ready', effect: 'safety-control' },
    { id: 'send-message', label: 'Send an external message', status: 'owner-and-v9-required', effect: 'blocked-by-default' },
    { id: 'negotiate-or-quote', label: 'Negotiate price or commercial terms', status: 'owner-required', effect: 'never-autonomous' },
    { id: 'mark-payment-cleared', label: 'Mark payment cleared', status: 'proof-required', effect: 'receipt-required' }
  ];
  const next = [];
  const uncertain = Number(health.uncertain || 0);
  if (uncertain) next.push({ priority: 'critical', action: 'reconcile-uncertain-effects', count: uncertain });
  const positive = asArray(inbox).filter(item => lower(item.latestReply?.classification?.label || item.prospect?.replyLabel) === 'positive').length;
  if (positive) next.push({ priority: 'high', action: 'review-positive-replies', count: positive });
  const ready = asArray(prospects).filter(item => item.status === 'ready').length;
  if (ready) next.push({ priority: 'high', action: 'review-ready-evidence', count: ready });
  if (!next.length) next.push({ priority: 'normal', action: 'keep-building-evidence', count: asArray(prospects).length });
  return {
    version: `${OUTREACH_OPERATOR_VERSION}.owner-copilot`, generatedAt: new Date(now).toISOString(), actions, next,
    summary: { safeAutomations: actions.filter(item => item.status === 'ready').length, gatedActions: actions.filter(item => item.status !== 'ready').length, externalEffects: 0 },
    policy: 'copilot prepares, ranks and stops; it does not autonomously send, negotiate, or assert payment'
  };
}

export function buildOwnerEdgePlan({ prospects = [], suppressions = [], campaigns = [], accounts = [], senderHealth = [], outboundEvents = [], outboundReservations = [], inbox = [], health = {}, now = new Date() } = {}) {
  const at = new Date(now);
  const senderRouting = buildSenderRoutingPlan({ prospects, campaigns, accounts, senderHealth, outboundEvents, now: at });
  const deliverability = buildDeliverabilityEdgePlan({ accounts, senderHealth, outboundEvents, outboundReservations, now: at });
  const evidenceSupply = buildEvidenceSupplyPlan({ prospects, suppressions, now: at });
  const copilot = buildOwnerCopilotPlan({ prospects, inbox, health: { ...health, uncertain: health.uncertain ?? outboundReservations.filter(item => item.status === 'uncertain').length }, now: at });
  return {
    version: `${OUTREACH_OPERATOR_VERSION}.edge-plan`, generatedAt: at.toISOString(),
    objective: 'make every owner-relevant step faster, safer and more evidence-backed without fabricating platform scale',
    senderRouting, deliverability, evidenceSupply, copilot,
    upgrades: [
      { category: 'sequence_execution', status: 'edge-covered', detail: 'sticky, provider-aware routing with explicit capacity and block reasons' },
      { category: 'sender_infrastructure', status: 'edge-covered', detail: 'bounded multi-provider sender mesh and health-ranked assignments' },
      { category: 'warmup', status: 'edge-covered', detail: 'conservative observed-signal ramp plan; no warmup-network claim' },
      { category: 'placement', status: 'edge-covered', detail: 'local authentication and health preflight plus explicit provider-test boundary' },
      { category: 'lead_supply', status: 'edge-covered', detail: 'evidence-supply queue exposes research, verification and freshness bottlenecks' },
      { category: 'ai_autonomy', status: 'edge-covered', detail: 'copilot ranks, classifies, drafts and stops; high-impact actions remain gated' },
      { category: 'agency_mode', status: 'owner-first', detail: 'single-owner control remains the product advantage; multi-seat mutation is not implied' }
    ],
    policy: 'planning and control surface only; no provider call, external effect, payment assertion or autonomous commercial mutation'
  };
}

function matchText(values, query) {
  const needle = lower(query);
  if (!needle) return true;
  return values.some(value => lower(value).includes(needle));
}

function evidenceScore(prospect = {}) {
  const score = Number(prospect.score?.total ?? prospect.score ?? 0);
  const confidence = Number(prospect.issue?.confidence ?? 0);
  const freshness = Date.parse(prospect.issue?.evidenceObservedAt || prospect.evidenceObservedAt || prospect.updatedAt || prospect.createdAt || 0);
  const ageDays = Number.isFinite(freshness) ? Math.max(0, (Date.now() - freshness) / 86400000) : 9999;
  const freshnessScore = ageDays <= 7 ? 1 : ageDays <= 30 ? 0.7 : ageDays <= 90 ? 0.4 : 0;
  return Math.round((Math.max(0, Math.min(100, score)) * 0.55 + Math.max(0, Math.min(1, confidence)) * 30 + freshnessScore * 15) * 100) / 100;
}

export function buildEvidenceLeadSearch({ prospects = [], suppressions = [], query = {}, limit = 100 } = {}) {
  const blocked = new Set(asArray(suppressions).map(item => lower(item.value)).filter(Boolean));
  const requestedTags = asArray(query.tags).map(lower).filter(Boolean);
  const minScore = Number.isFinite(Number(query.minScore)) ? Number(query.minScore) : 0;
  const filtered = asArray(prospects).filter(prospect => {
    const email = lower(prospect.contact?.email);
    const domain = lower(prospect.domain || prospect.website);
    if (blocked.has(email) || blocked.has(domain)) return false;
    if (query.query && !matchText([prospect.company, prospect.domain, prospect.website, prospect.contact?.email, prospect.niche, prospect.issue?.title], query.query)) return false;
    if (query.country && lower(prospect.country) !== lower(query.country)) return false;
    if (query.status && lower(prospect.status) !== lower(query.status)) return false;
    if (query.stage && lower(prospect.opportunityStage || 'new') !== lower(query.stage)) return false;
    if (query.campaignId && String(prospect.campaignId || '') !== String(query.campaignId)) return false;
    if (query.hasEmail === true && !email) return false;
    if (query.verified && lower(prospect.contact?.verified) !== lower(query.verified)) return false;
    if (requestedTags.length && !requestedTags.every(tag => asArray(prospect.tags).map(lower).includes(tag))) return false;
    if (Number(prospect.score?.total ?? prospect.score ?? 0) < minScore) return false;
    if (query.researchedOnly === true && !prospect.issue?.evidenceUrl) return false;
    if (query.sendReadyOnly === true && !['ready', 'research-complete'].includes(lower(prospect.status))) return false;
    return true;
  });
  const results = filtered.map(prospect => ({
    id: prospect.id,
    company: text(prospect.company, 180),
    domain: text(prospect.domain || prospect.website, 240),
    country: text(prospect.country, 100),
    status: text(prospect.status, 60),
    stage: text(prospect.opportunityStage || 'new', 60),
    email: text(prospect.contact?.email, 320),
    verified: text(prospect.contact?.verified, 40),
    score: Number(prospect.score?.total ?? prospect.score ?? 0),
    evidence: {
      title: text(prospect.issue?.title, 240),
      url: text(prospect.issue?.evidenceUrl, 600),
      excerpt: text(prospect.issue?.evidenceExcerpt, 800),
      confidence: Number(prospect.issue?.confidence || 0),
      readiness: prospect.issue?.safeForOutreach === false ? 'blocked' : prospect.issue?.evidenceUrl ? 'observed' : 'missing'
    },
    evidenceRank: evidenceScore(prospect),
    tags: asArray(prospect.tags).slice(0, 30)
  })).sort((a, b) => b.evidenceRank - a.evidenceRank || b.score - a.score || a.company.localeCompare(b.company)).slice(0, Math.max(1, Math.min(1000, Number(limit) || 100)));
  const facets = {
    countries: [...new Set(results.map(item => item.country).filter(Boolean))].sort(),
    statuses: [...new Set(results.map(item => item.status).filter(Boolean))].sort(),
    stages: [...new Set(results.map(item => item.stage).filter(Boolean))].sort(),
    verified: [...new Set(results.map(item => item.verified).filter(Boolean))].sort()
  };
  return {
    version: OUTREACH_OPERATOR_VERSION,
    query: structuredClone(query),
    totalMatched: filtered.length,
    returned: results.length,
    results,
    facets,
    policy: 'local UberBond evidence corpus only; no invented contacts, no private-email inference, suppressed records excluded'
  };
}
