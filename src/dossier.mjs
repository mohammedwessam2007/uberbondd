import { now } from './utils.mjs';

export function buildDossier({
  prospect,
  crawl,
  audit = [],
  contact = null,
  score = { total: 0, tier: 'Reject', breakdown: {}, explanation: [] },
  issue = null,
  inbox = '',
  subject = '',
  draft = '',
  aiMeta = {},
  crawlQuality = null,
  minimumScore = 55,
  rejectionReason = ''
}) {
  const qualified = Boolean(issue && score.total >= Number(minimumScore || 0) && crawlQuality?.credible !== false);
  const evidence = audit.map(finding => ({
    code: finding.code,
    title: finding.title,
    url: finding.evidenceUrl,
    excerpt: finding.evidenceExcerpt,
    screenshotReference: finding.screenshotReference || finding.screenshots?.desktop || finding.screenshots?.mobile || '',
    confidence: finding.confidence,
    severity: finding.severity,
    estimatedImpact: finding.estimatedImpact || '',
    estimatedEffort: finding.estimatedEffort || '',
    safeForOutreach: finding.safeForOutreach !== false,
    evidenceSource: finding.evidenceSource || 'deterministic_rules'
  }));
  return {
    generatedAt: now(),
    company: {
      name: prospect.company,
      website: prospect.website,
      domain: crawl.domain,
      country: prospect.country || '',
      city: prospect.city || '',
      industry: prospect.niche || prospect.industry || ''
    },
    qualification: {
      qualified,
      score: score.total,
      minimumScore: Number(minimumScore || 0),
      tier: score.tier,
      breakdown: score.breakdown,
      explanation: score.explanation,
      rejectionReason: qualified ? '' : rejectionReason || (!issue ? 'no_credible_evidence' : 'score_below_campaign_threshold')
    },
    crawl: {
      engine: crawl.engine,
      pagesVisited: crawl.summary?.pagesVisited || crawl.pages?.length || 0,
      errors: crawl.errors || [],
      quality: crawlQuality || crawl.quality || null,
      publicAccess: crawl.publicAccess || null,
      completedAt: crawl.completedAt
    },
    primaryOpportunity: issue ? evidence.find(item => item.code === issue.code) || issue : null,
    evidence,
    observations: audit,
    contact: contact || null,
    routing: { inbox },
    outreach: { subject, draft },
    screenshots: (crawl.pages || []).map(page => ({ url: page.url, ...page.screenshots })),
    riskFlags: [
      ...(crawlQuality?.status === 'partial' ? ['Crawl completed with partial page coverage'] : []),
      ...(crawl.errors?.length ? [`${crawl.errors.length} categorized crawl error(s)`] : []),
      ...(!contact?.email ? ['No verified or public email selected'] : []),
      ...(!issue ? ['No outreach-safe finding met the campaign confidence threshold'] : []),
      ...(audit.some(finding => finding.requiresHumanReview) ? ['AI-enhanced observations require human review and are not outreach eligible'] : [])
    ],
    provenance: {
      rulesVersion: 'nightshift-rules-1.1',
      evidencePolicy: 'typed-crawled-page-evidence-only',
      aiProvider: aiMeta.provider || 'rules',
      aiModel: aiMeta.model || '',
      aiOutreachEligible: aiMeta.outreachEligible === true,
      promptVersion: 'audit-v1'
    }
  };
}
