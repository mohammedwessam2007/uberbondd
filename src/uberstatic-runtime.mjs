import http from 'node:http';
import path from 'node:path';
import {
  readUberStaticAsset,
  readUberStaticPointer,
  verifyUberStaticDeployment,
  verifyUberStaticPassword
} from './uberstatic.mjs';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.wasm', 'application/wasm'],
  ['.pdf', 'application/pdf']
]);

function json(res, statusCode, body) {
  const bytes = Buffer.from(`${JSON.stringify(body)}\n`);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': bytes.byteLength,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(bytes);
}

function suppliedPassword(req) {
  const direct = req.headers['x-uberstatic-password'];
  if (typeof direct === 'string') return direct;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function candidatePaths(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return []; }
  if (decoded.includes('\0')) return [];
  const withoutQuery = decoded.split('?')[0].split('#')[0];
  const clean = withoutQuery.replace(/^\/+/, '');
  if (!clean) return ['index.html'];
  if (clean.endsWith('/')) return [`${clean}index.html`];
  const out = [clean];
  if (!path.posix.extname(clean)) out.push(`${clean}/index.html`, `${clean}.html`);
  return out;
}

export function createUberStaticHandler({ rootDir } = {}) {
  if (!rootDir) throw new Error('uberstatic-root-required');
  return (req, res) => {
    try {
      const pointer = readUberStaticPointer({ rootDir });
      if (!pointer) return json(res, 503, { ok: false, status: 'UBERSTATIC_NO_ACTIVE_DEPLOYMENT' });
      const verified = verifyUberStaticDeployment({ rootDir, deploymentId: pointer.deploymentId });
      if (!verified.ok) return json(res, 503, { ok: false, status: 'UBERSTATIC_ACTIVE_DEPLOYMENT_INVALID', reasonCodes: verified.reasonCodes });

      const requestUrl = new URL(req.url || '/', 'http://uberstatic.local');
      if (requestUrl.pathname === '/__uberstatic/health') {
        return json(res, 200, {
          ok: true,
          status: 'UBERSTATIC_HEALTHY',
          deploymentId: pointer.deploymentId,
          activationId: pointer.activationId,
          sourceCommit: pointer.sourceCommit,
          protected: Boolean(pointer.accessPolicy?.protected)
        });
      }

      if (!verifyUberStaticPassword(pointer, suppliedPassword(req))) {
        res.setHeader('www-authenticate', 'Bearer realm="uberstatic"');
        return json(res, 401, { ok: false, status: 'UBERSTATIC_PASSWORD_REQUIRED' });
      }

      for (const assetPath of candidatePaths(requestUrl.pathname)) {
        let asset;
        try { asset = readUberStaticAsset({ rootDir, deploymentId: pointer.deploymentId, assetPath }); } catch { asset = null; }
        if (!asset) continue;
        const contentType = MIME.get(path.posix.extname(asset.entry.path).toLowerCase()) || 'application/octet-stream';
        res.writeHead(200, {
          'content-type': contentType,
          'content-length': asset.bytes.byteLength,
          'cache-control': asset.entry.path === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
          'etag': `"${asset.entry.digest.slice('sha256:'.length)}"`,
          'x-uberstatic-deployment': pointer.deploymentId,
          'x-content-type-options': 'nosniff'
        });
        if (req.method === 'HEAD') return res.end();
        return res.end(asset.bytes);
      }
      return json(res, 404, { ok: false, status: 'UBERSTATIC_ASSET_NOT_FOUND' });
    } catch (error) {
      return json(res, 500, { ok: false, status: 'UBERSTATIC_RUNTIME_ERROR', reason: error?.message || 'unknown-error' });
    }
  };
}

export function startUberStaticServer({ rootDir, host = '127.0.0.1', port = 0 } = {}) {
  const server = http.createServer(createUberStaticHandler({ rootDir }));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve({
        server,
        host,
        port: typeof address === 'object' && address ? address.port : port,
        url: `http://${host}:${typeof address === 'object' && address ? address.port : port}`
      });
    });
  });
}
