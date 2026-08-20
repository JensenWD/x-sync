import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfficialApiError, parseOfficialBookmarkPage } from '../src/lib/x-api/parser';

test('parses official bookmarks with author, media, quote, and pagination data', () => {
  const page = parseOfficialBookmarkPage({
    data: [
      {
        id: '100',
        text: 'short text',
        note_tweet: { text: 'complete long-form text' },
        author_id: '10',
        created_at: '2026-08-20T05:00:00.000Z',
        attachments: { media_keys: ['3_photo', '7_video'] },
        referenced_tweets: [{ type: 'quoted', id: '200' }],
      },
    ],
    includes: {
      users: [
        { id: '10', name: 'Author', username: 'author', profile_image_url: 'avatar.jpg' },
        { id: '20', name: 'Quoted', username: 'quoted', profile_image_url: 'quote.jpg' },
      ],
      tweets: [{ id: '200', text: 'quoted text', author_id: '20' }],
      media: [
        { media_key: '3_photo', url: 'photo.jpg' },
        { media_key: '7_video', preview_image_url: 'video.jpg' },
      ],
    },
    meta: { result_count: 1, next_token: 'next-page' },
  });

  assert.equal(page.timelineFound, true);
  assert.equal(page.nextCursor, 'next-page');
  assert.equal(page.bookmarks.length, 1);
  assert.equal(page.bookmarks[0].fullText, 'complete long-form text');
  assert.equal(page.bookmarks[0].tweetUrl, 'https://x.com/author/status/100');
  assert.deepEqual(JSON.parse(page.bookmarks[0].mediaUrls ?? '[]'), ['photo.jpg', 'video.jpg']);
  assert.deepEqual(JSON.parse(page.bookmarks[0].quotedTweet ?? '{}'), {
    tweet_id: '200',
    full_text: 'quoted text',
    author_name: 'Quoted',
    author_handle: 'quoted',
    author_avatar: 'quote.jpg',
  });
});

test('accepts an empty official timeline and reports API errors safely', () => {
  const page = parseOfficialBookmarkPage({ meta: { result_count: 0 } });
  assert.equal(page.timelineFound, true);
  assert.deepEqual(page.bookmarks, []);
  assert.equal(page.nextCursor, null);
  assert.equal(
    getOfficialApiError({ errors: [{ title: 'Forbidden', detail: 'Missing bookmark.read' }] }),
    'Missing bookmark.read',
  );
});
