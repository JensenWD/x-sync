import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTargetsHost } from '../src/lib/http/request-host';

function request(headers: Record<string, string>, internalUrl = 'http://127.0.0.1:3000') {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(internalUrl),
  };
}

test('accepts the public Host header when Next.js sees the reverse proxy origin', () => {
  assert.equal(
    requestTargetsHost(
      request({ host: 'agentmac.tailf5c3be.ts.net:3000' }),
      'agentmac.tailf5c3be.ts.net:3000',
    ),
    true,
  );
});

test('accepts the first forwarded host from a proxy chain', () => {
  assert.equal(
    requestTargetsHost(
      request({
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'agentmac.tailf5c3be.ts.net:3000, 127.0.0.1:3000',
      }),
      'agentmac.tailf5c3be.ts.net:3000',
    ),
    true,
  );
});

test('rejects a direct request to a non-callback host', () => {
  assert.equal(
    requestTargetsHost(request({ host: '127.0.0.1:3000' }), 'agentmac.tailf5c3be.ts.net:3000'),
    false,
  );
});
