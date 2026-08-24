import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookmarkRequestUrl,
  X_BOOKMARK_PAGE_SIZE,
} from '../src/lib/x-api/bookmark-request';

test('uses the reliable 50-item X bookmark page size', () => {
  const url = bookmarkRequestUrl('user/id', null);

  assert.equal(X_BOOKMARK_PAGE_SIZE, 50);
  assert.equal(url.pathname, '/2/users/user%2Fid/bookmarks');
  assert.equal(url.searchParams.get('max_results'), '50');
  assert.equal(url.searchParams.has('pagination_token'), false);
});

test('passes X continuation tokens through unchanged', () => {
  const url = bookmarkRequestUrl('123', 'cursor+/=');

  assert.equal(url.searchParams.get('pagination_token'), 'cursor+/=');
});

test('takes every field the same bookmark request can carry for free', () => {
  const url = bookmarkRequestUrl('123', null);
  const tweetFields = url.searchParams.get('tweet.fields')?.split(',') ?? [];
  const mediaFields = url.searchParams.get('media.fields')?.split(',') ?? [];

  // Widening the field set costs no extra call and no extra rate limit, so
  // anything the dashboard can use should already be on the wire.
  for (const field of ['entities', 'public_metrics', 'conversation_id', 'note_tweet']) {
    assert.ok(tweetFields.includes(field), `expected tweet.fields to request ${field}`);
  }
  for (const field of ['variants', 'width', 'height', 'duration_ms', 'alt_text']) {
    assert.ok(mediaFields.includes(field), `expected media.fields to request ${field}`);
  }
});
