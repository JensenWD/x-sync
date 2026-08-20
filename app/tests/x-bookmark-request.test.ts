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
