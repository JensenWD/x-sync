import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptToken, encryptToken } from '../src/lib/x-api/token-crypto';
import { assertSameXAccount } from '../src/lib/x-api/account-binding';

test('OAuth tokens round-trip through authenticated encryption', () => {
  const encrypted = encryptToken('access-token-value', 'client-secret');
  assert.notEqual(encrypted, 'access-token-value');
  assert.equal(decryptToken(encrypted, 'client-secret'), 'access-token-value');
});

test('OAuth tokens cannot be decrypted with a different client secret', () => {
  const encrypted = encryptToken('access-token-value', 'client-secret');
  assert.throws(() => decryptToken(encrypted, 'wrong-secret'), /Reconnect the X account/);
});

test('OAuth reconnect cannot silently replace the bound X account', () => {
  assert.doesNotThrow(() =>
    assertSameXAccount({ user_id: '1', username: 'johnny' }, { id: '1', username: 'johnny' }),
  );
  assert.throws(
    () => assertSameXAccount({ user_id: '1', username: 'johnny' }, { id: '2', username: 'other' }),
    /bound to @johnny/,
  );
});
