const assert = require('node:assert/strict');
const test = require('node:test');
const protocol = require('./sync-protocol.js');

test('normalizes a completed sync response', () => {
  const result = protocol.normalize(200, {
    status: 'success',
    run: { bookmarks_inserted: 2, bookmarks_existing: 10, pages_fetched: 1 },
  });
  assert.equal(result.success, true);
  assert.equal(result.alreadyRunning, false);
});

test('normalizes a durable already-running response without claiming completion', () => {
  const result = protocol.normalize(409, { status: 'already_running', run: { id: 4 } });
  assert.equal(result.success, true);
  assert.equal(result.alreadyRunning, true);
  assert.equal(result.run.id, 4);
});

test('preserves safe server errors', () => {
  assert.deepEqual(protocol.normalize(401, { code: 'x_session_rejected', error: 'Log in again.' }), {
    success: false,
    code: 'x_session_rejected',
    error: 'Log in again.',
  });
});

test('formats truthful run metrics', () => {
  assert.equal(
    protocol.runSummary({
      mode: 'full',
      bookmarks_inserted: 3,
      bookmarks_existing: 7,
      remote_removed: 2,
      pages_fetched: 1,
    }),
    '3 new · 7 existing · 2 archived · 1 page',
  );
});
