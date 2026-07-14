import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { id, now } from './utils.mjs';

const SCREENSHOT_PREFIX = '/screenshots/';

function safeScreenshotPath(baseDir, publicPath) {
  if (!String(publicPath || '').startsWith(SCREENSHOT_PREFIX)) return null;
  const filename = path.basename(String(publicPath).slice(SCREENSHOT_PREFIX.length));
  if (!filename || !/^[a-z0-9._-]+$/i.test(filename)) return null;
  const base = path.resolve(baseDir);
  const file = path.resolve(base, filename);
  return file.startsWith(`${base}${path.sep}`) ? file : null;
}

export async function persistCrawlArtifacts(store, crawl, cfg, prospectId = '') {
  if (!crawl?.pages?.length || typeof store.putArtifact !== 'function' || cfg.storeBackend !== 'postgres') return crawl;
  const maxBytes = Math.max(1024, Number(cfg.artifacts?.maxBytes || 6 * 1024 * 1024));
  const retentionDays = Math.max(1, Number(cfg.artifacts?.retentionDays || 90));
  const deleteLocal = Boolean(cfg.artifacts?.deleteLocalAfterUpload);
  const expiresAt = new Date(Date.now() + retentionDays * 86400000).toISOString();
  const replacements = new Map();

  for (const page of crawl.pages) {
    for (const [viewport, publicPath] of Object.entries(page.screenshots || {})) {
      if (!publicPath || replacements.has(publicPath)) {
        if (replacements.has(publicPath)) page.screenshots[viewport] = replacements.get(publicPath);
        continue;
      }
      const file = safeScreenshotPath(cfg.screenshotDir, publicPath);
      if (!file) continue;
      let content;
      try { content = await fs.readFile(file); }
      catch { continue; }
      if (content.length > maxBytes) {
        await store.log('artifact_skipped_oversize', { prospectId, publicPath, bytes: content.length, maxBytes });
        continue;
      }
      const artifactId = id('artifact');
      await store.putArtifact({
        id: artifactId,
        contentType: 'image/png',
        content,
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        expiresAt,
        metadata: { prospectId, pageUrl: page.url, viewport, originalPath: publicPath, createdAt: now() }
      });
      const sharedPath = `/api/public/artifacts/${encodeURIComponent(artifactId)}`;
      replacements.set(publicPath, sharedPath);
      page.screenshots[viewport] = sharedPath;
      if (deleteLocal) await fs.unlink(file).catch(() => {});
    }
  }
  return crawl;
}
