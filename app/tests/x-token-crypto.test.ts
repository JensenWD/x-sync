import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptToken, encryptToken } from '../src/lib/x-api/token-crypto';

test('OAuth tokens round-trip through authenticated encryption', () => {
  const encrypted = encryptToken('access-token-value', 'client-secret');
  assert.notEqual(encrypted, 'access-token-value');
  assert.equal(decryptToken(encrypted, 'client-secret'), 'access-token-value');
});

test('OAuth tokens cannot be decrypted with a different client secret', () => {
  const encrypted = encryptToken('access-token-value', 'client-secret');
  assert.throws(() => decryptToken(encrypted, 'wrong-secret'), /Reconnect the X account/);
});
