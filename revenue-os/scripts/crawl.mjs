#!/usr/bin/env node
// Owner-approved real-site evidence capture CLI (Live Bridge Patch 2's required CLI surface).
// Takes a project file naming up to 3 owner-approved sites (matching
// SERVICE_CATALOG.FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC's siteCount:3), runs the real crawler
// provider against each one, runs the existing 18-check engine against what it captured, and
// writes a signed evidence pack the diagnostic factory can import.
//
// This script never enables the crawler on its own -- `enabled:true` is passed here, but the
// crawler provider itself still requires the project file's own allowlist and ownerApproval object
// to be present and well-formed, or construction throws before any network activity happens. There
// is no flag on this CLI that bypasses that.
//
// Usage:
//   node revenue-os/scripts/crawl.mjs --project <path-to-project.json> [--out <path>]
//     [--secret-env <ENV_VAR_NAME>] [--allow-local]
//
// Project file shape:
//   {
//     "sites": [{"id": "site1", "url": "https://..."}, ... up to 3],
//     "allowlist": ["example.com", ...],
//     "ownerApproval": {"approvedBy": "...", "approvedAt": "2026-01-01T00:00:00.000Z", "note": "..."}
//   }
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRealCrawlerProvider } from '../src/providers/real-crawler.mjs';
import { runChecksForPage } from '../src/checks.mjs';
import { buildDefectCards } from '../src/defects.mjs';
import { signReportManifest } from '../src/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { flags[key] = true; }
      else { flags[key] = next; i += 1; }
    }
  }
  return flags;
}

class CrawlCliError extends Error {}

function validateProject(project) {
  if (!project || typeof project !== 'object') throw new CrawlCliError('project file must be a JSON object');
  if (!Array.isArray(project.sites) || project.sites.length === 0) throw new CrawlCliError('project.sites must be a non-empty array');
  if (project.sites.length > 3) throw new CrawlCliError(`project.sites has ${project.sites.length} entries -- this CLI is for the owner-approved three-site project (max 3)`);
  for (const site of project.sites) {
    if (!site?.id || !site?.url) throw new CrawlCliError(`every site needs an id and a url: ${JSON.stringify(site)}`);
  }
  if (!Array.isArray(project.allowlist) || project.allowlist.length === 0) throw new CrawlCliError('project.allowlist must be a non-empty array');
  if (!project.ownerApproval?.approvedBy || !project.ownerApproval?.approvedAt) throw new CrawlCliError('project.ownerApproval must include approvedBy and approvedAt -- this is the explicit owner-approval gate, not optional');
}

async function captureSite(crawler, site) {
  const page = await crawler.fetchPage(site.url);
  const checkResults = page.limitation ? [] : await runChecksForPage(page);
  const defectCards = checkResults.length ? buildDefectCards(checkResults, { websiteId: site.id }) : [];
  return {
    id: site.id, url: site.url,
    capture: {
      ok: page.ok, status: page.status, finalUrl: page.finalUrl, title: page.title || null,
      htmlHash: page.htmlHash || null, screenshotHash: page.screenshotHash || null,
      responseTimeMs: page.responseTimeMs, redirectChain: page.redirectChain || [],
      capturedAt: page.capturedAt, limitation: page.limitation || null
    },
    checkResults, defectCards
  };
}

export async function runCrawlCli({ projectPath, outPath, secretEnv = 'REVENUE_OS_EVIDENCE_SIGNING_SECRET', allowLocal = false, crawlerOptions = {} }) {
  const projectRaw = await fs.readFile(projectPath, 'utf8');
  let project;
  try { project = JSON.parse(projectRaw); } catch (error) { throw new CrawlCliError(`project file is not valid JSON: ${error.message}`); }
  validateProject(project);

  const secret = process.env[secretEnv];
  if (!secret) throw new CrawlCliError(`evidence pack signing secret not found in env var ${secretEnv} -- set it before running (never pass a secret on the command line)`);

  const crawler = createRealCrawlerProvider({
    enabled: true, allowlist: project.allowlist, ownerApproval: project.ownerApproval, allowLocal, ...crawlerOptions
  });

  const sites = [];
  for (const site of project.sites) sites.push(await captureSite(crawler, site));

  const evidencePack = {
    generatedAt: new Date().toISOString(),
    project: { sites: project.sites.map(s => ({ id: s.id, url: s.url })), allowlist: project.allowlist, ownerApproval: project.ownerApproval },
    crawlerName: crawler.name,
    sites
  };
  const manifest = signReportManifest(evidencePack, secret);
  const signed = { ...evidencePack, manifest };

  if (outPath) await fs.writeFile(outPath, JSON.stringify(signed, null, 2));
  return signed;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.project) {
    console.log('Usage: crawl.mjs --project <path-to-project.json> [--out <path>] [--secret-env <ENV_VAR_NAME>] [--allow-local]');
    process.exitCode = 1;
    return;
  }
  const outPath = flags.out || path.join(HERE, '..', 'demo-output', 'evidence-pack.json');
  const signed = await runCrawlCli({
    projectPath: flags.project, outPath, secretEnv: flags['secret-env'] || 'REVENUE_OS_EVIDENCE_SIGNING_SECRET',
    allowLocal: Boolean(flags['allow-local'])
  });
  const limitations = signed.sites.filter(s => s.capture.limitation).length;
  const defects = signed.sites.reduce((n, s) => n + s.defectCards.length, 0);
  console.log(`Captured ${signed.sites.length} site(s), ${limitations} limitation(s), ${defects} defect card(s).`);
  console.log(`Signed evidence pack written to ${outPath}`);
  console.log(`Signature: ${signed.manifest.signature}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
