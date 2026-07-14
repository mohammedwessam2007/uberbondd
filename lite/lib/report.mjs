// Shapes a stored report from the production crawler + deterministic audit rules.
// Screenshots are stripped: GitHub Actions runners are ephemeral and the lite
// report is served entirely from PostgreSQL.
export function buildReport(crawl, findings = []) {
  const clean = (findings || [])
    .map(({ screenshots, safeForOutreach, ...rest }) => rest)
    .filter(f => f && f.title)
    .slice(0, 12);
  const deduction = clean.reduce((n, f) => n + Number(f.severity || 0) * Number(f.confidence || 0) * 4, 0);
  const score = clean.length ? Math.max(15, Math.min(94, Math.round(100 - deduction))) : 96;
  const grade = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Needs work' : 'Critical gaps';
  return {
    score,
    grade,
    summary: {
      grade,
      pagesVisited: crawl?.summary?.pagesVisited ?? crawl?.pages?.length ?? 0,
      pageErrors: crawl?.errors?.length || 0,
      findingCount: clean.length,
      topFixes: clean.slice(0, 3).map(f => f.title),
      engine: crawl?.engine || 'playwright',
      generatedAt: new Date().toISOString()
    },
    findings: clean
  };
}
