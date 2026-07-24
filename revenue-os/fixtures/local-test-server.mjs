// Local, loopback-only (127.0.0.1) HTTP test server for real-crawler.mjs's tests -- this is the
// "local controlled test server" the mission requires the crawler's tests to use instead of the
// real internet. It never binds to a non-loopback address and the test process never resolves or
// connects to any real external host.
import http from 'node:http';

const ROUTES = {
  '/': () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html><html><head><title>Local Test Page</title></head><body><h1>Hello</h1></body></html>' }),
  '/robots.txt': () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'User-agent: *\nDisallow: /private\n' }),
  '/private/secret': () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html><body>should be blocked by robots.txt</body></html>' }),
  '/slow': async () => { await new Promise(r => setTimeout(r, 3000)); return { status: 200, headers: {}, body: '<html><body>slow</body></html>' }; },
  '/huge': () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: `<html><body>${'x'.repeat(2_000_000)}</body></html>` })
};
// A finite 6-hop redirect chain (/redirect/1 -> /redirect/2 -> ... -> /redirect/6 -> /), well under
// Chromium's own internal redirect cap, so navigation actually completes and this module's own
// redirect-count limit (not Chromium's) is what fires in the excessive-redirects test.
for (let i = 1; i <= 6; i++) {
  ROUTES[`/redirect/${i}`] = () => ({ status: 302, headers: { location: i < 6 ? `/redirect/${i + 1}` : '/' }, body: '' });
}

/** Starts the server on a random loopback port, resolves with { server, port, baseUrl }. Caller
 * is responsible for calling server.close(). */
export function startLocalTestServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const handler = ROUTES[req.url];
      if (!handler) { res.writeHead(404); res.end('not found'); return; }
      try {
        const { status, headers, body } = await handler();
        res.writeHead(status, headers);
        res.end(body);
      } catch (error) {
        res.writeHead(500);
        res.end(String(error));
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

/** A second server variant with no /robots.txt handler at all (404s), to prove the "404 means
 * unrestricted" convention independently of the main server's own robots.txt. */
export function startLocalTestServerWithoutRobots() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/robots.txt') { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><title>No Robots File</title></head><body>ok</body></html>');
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}
