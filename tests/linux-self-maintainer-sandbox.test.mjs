import test from 'node:test';
import assert from 'node:assert/strict';
import { hasKernelNetworkRoutes } from '../src/linux-self-maintainer-sandbox.mjs';

const IPV4_HEADER = 'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\n';

test('Linux namespace route probe accepts the proc header with zero IPv4 routes', () => {
  assert.equal(hasKernelNetworkRoutes({ ipv4RouteText: IPV4_HEADER, ipv6RouteText: '' }), false);
});

test('Linux namespace route probe rejects a real IPv4 route after the proc header', () => {
  const route = 'eth0\t00000000\t01020304\t0003\t0\t0\t0\t00000000\t0\t0\t0\n';
  assert.equal(hasKernelNetworkRoutes({ ipv4RouteText: `${IPV4_HEADER}${route}`, ipv6RouteText: '' }), true);
});

test('Linux namespace route probe rejects any IPv6 route row', () => {
  const ipv6Route = '00000000000000000000000000000000 00 00000000000000000000000000000000 00 00000000000000000000000000000000 00000000 00000000 00000000 00000001 lo\n';
  assert.equal(hasKernelNetworkRoutes({ ipv4RouteText: IPV4_HEADER, ipv6RouteText: ipv6Route }), true);
});
