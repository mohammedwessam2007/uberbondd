import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCrawlCli } from '../../revenue-os/scripts/crawl.mjs';
import { verifyReportManifest } from '../../revenue-os/src/report.mjs';
import { startLocalTestServer } from '../../revenue-os/fixtures/local-test-server.mjs';

const SECRET = 'a-test-signing-secret-that-is-long-enough';

async function withServerAndDir(fn) {
  const { server, port, baseUrl } = await startLocalTestServer();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crawl-cli-'));
  try { await fn({ port, baseUrl, dir }); } finally { server.close(); }
}

async function writeProject(dir, project) {
  const projectPath = path.join(dir, 'project.json');
  await fs.writeFile(projectPath, JSON.stringify(project));
  return projectPath;
}

test('produces a signed evidence pack for an owner-approved three-site project, verifiable against the same secret', async () => {
  await withServerAndDir(async ({ port, baseUrl, dir }) => {
    const projectPath = await writeProject(dir, {
      sites: [{ id: 'site1', url: `${baseUrl}/` }, { id: 'site2', url: `${baseUrl}/` }, { id: 'site3', url: `${baseUrl}/private/secret` }],
      allowlist: [`127.0.0.1:${port}`],
      ownerApproval: { approvedBy: 'owner@test.invalid', approvedAt: new Date().toISOString(), note: 'three-site smoke test' }
    });
    const outPath = path.join(dir, 'evidence-pack.json');
    process.env.REVENUE_OS_EVIDENCE_SIGNING_SECRET = SECRET;
    const signed = await runCrawlCli({ projectPath, outPath, allowLocal: true });

    assert.equal(signed.sites.length, 3);
    assert.equal(signed.sites[0].capture.ok, true);
    assert.equal(signed.sites[0].checkResults.length > 0, true);
    assert.equal(signed.sites[2].capture.limitation.code, 'blocked-by-robots-txt');
    assert.equal(signed.sites[2].checkResults.length, 0);

    const written = JSON.parse(await fs.readFile(outPath, 'utf8'));
    assert.equal(written.manifest.algorithm, 'hmac-sha256');
    const { manifest, ...body } = written;
    const verified = verifyReportManifest(body, manifest, SECRET);
    assert.equal(verified.valid, true);

    const tampered = { ...body, project: { ...body.project, allowlist: ['attacker.invalid'] } };
    const tamperedCheck = verifyReportManifest(tampered, manifest, SECRET);
    assert.equal(tamperedCheck.valid, false);
  });
});

test('rejects a project with more than 3 sites', async () => {
  await withServerAndDir(async ({ port, baseUrl, dir }) => {
    const projectPath = await writeProject(dir, {
      sites: [1, 2, 3, 4].map(i => ({ id: `site${i}`, url: `${baseUrl}/` })),
      allowlist: [`127.0.0.1:${port}`],
      ownerApproval: { approvedBy: 'owner@test.invalid', approvedAt: new Date().toISOString() }
    });
    process.env.REVENUE_OS_EVIDENCE_SIGNING_SECRET = SECRET;
    await assert.rejects(() => runCrawlCli({ projectPath, outPath: null, allowLocal: true }), /three-site project/);
  });
});

test('rejects a project missing owner approval', async () => {
  await withServerAndDir(async ({ port, baseUrl, dir }) => {
    const projectPath = await writeProject(dir, {
      sites: [{ id: 'site1', url: `${baseUrl}/` }], allowlist: [`127.0.0.1:${port}`]
    });
    process.env.REVENUE_OS_EVIDENCE_SIGNING_SECRET = SECRET;
    await assert.rejects(() => runCrawlCli({ projectPath, outPath: null, allowLocal: true }), /ownerApproval/);
  });
});

test('refuses to run without a signing secret configured', async () => {
  await withServerAndDir(async ({ port, baseUrl, dir }) => {
    const projectPath = await writeProject(dir, {
      sites: [{ id: 'site1', url: `${baseUrl}/` }], allowlist: [`127.0.0.1:${port}`],
      ownerApproval: { approvedBy: 'owner@test.invalid', approvedAt: new Date().toISOString() }
    });
    delete process.env.REVENUE_OS_EVIDENCE_SIGNING_SECRET;
    await assert.rejects(() => runCrawlCli({ projectPath, outPath: null, allowLocal: true, secretEnv: 'REVENUE_OS_EVIDENCE_SIGNING_SECRET' }), /signing secret/);
  });
});
