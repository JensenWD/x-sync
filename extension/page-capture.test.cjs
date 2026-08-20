const assert = require('node:assert/strict');
const test = require('node:test');
const capture = require('./page-capture.js');

test('matches only the X Bookmarks GraphQL operation', () => {
  assert.equal(
    capture.isBookmarkRequest('https://x.com/i/api/graphql/abc123/Bookmarks?variables=%7B%7D'),
    true,
  );
  assert.equal(
    capture.isBookmarkRequest('https://x.com/i/api/graphql/abc123/HomeTimeline?variables=%7B%7D'),
    false,
  );
  assert.equal(capture.isBookmarkRequest('https://example.com/Bookmarks'), false);
});

test('extracts the requested cursor without exposing any cookie data', () => {
  const variables = encodeURIComponent(JSON.stringify({ count: 20, cursor: 'cursor-value' }));
  assert.equal(
    capture.requestCursor(`https://x.com/i/api/graphql/id/Bookmarks?variables=${variables}`),
    'cursor-value',
  );
  assert.equal(
    capture.requestCursor('https://x.com/i/api/graphql/id/Bookmarks?variables=%7B%22count%22%3A20%7D'),
    null,
  );
});
