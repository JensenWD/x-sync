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
        conversation_id: '99',
        created_at: '2026-08-20T05:00:00.000Z',
        attachments: { media_keys: ['3_photo', '7_video'] },
        referenced_tweets: [{ type: 'quoted', id: '200' }],
        public_metrics: {
          like_count: 412,
          reply_count: 8,
          retweet_count: 31,
          quote_count: 2,
          bookmark_count: 57,
          impression_count: 91_000,
        },
      },
    ],
    includes: {
      users: [
        { id: '10', name: 'Author', username: 'author', profile_image_url: 'avatar.jpg' },
        { id: '20', name: 'Quoted', username: 'quoted', profile_image_url: 'quote.jpg' },
      ],
      tweets: [{ id: '200', text: 'quoted text', author_id: '20', created_at: '2026-08-19T05:00:00.000Z' }],
      media: [
        { media_key: '3_photo', type: 'photo', url: 'photo.jpg', width: 1600, height: 2400 },
        {
          media_key: '7_video',
          type: 'video',
          preview_image_url: 'video.jpg',
          width: 1280,
          height: 720,
          duration_ms: 42_000,
          variants: [
            { content_type: 'application/x-mpegURL', url: 'stream.m3u8' },
            { content_type: 'video/mp4', bit_rate: 632_000, url: 'low.mp4' },
            { content_type: 'video/mp4', bit_rate: 2_176_000, url: 'high.mp4' },
          ],
        },
      ],
    },
    meta: { result_count: 1, next_token: 'next-page' },
  });

  assert.equal(page.timelineFound, true);
  assert.equal(page.nextCursor, 'next-page');
  assert.equal(page.bookmarks.length, 1);
  assert.equal(page.bookmarks[0].fullText, 'complete long-form text');
  assert.equal(page.bookmarks[0].tweetUrl, 'https://x.com/author/status/100');
  assert.equal(page.bookmarks[0].conversationId, '99');
  assert.deepEqual(JSON.parse(page.bookmarks[0].mediaUrls ?? '[]'), ['photo.jpg', 'video.jpg']);
  assert.deepEqual(JSON.parse(page.bookmarks[0].mediaMetadata ?? '[]'), [
    {
      media_key: '3_photo',
      type: 'photo',
      url: 'photo.jpg',
      preview_image_url: null,
      width: 1600,
      height: 2400,
      duration_ms: null,
      alt_text: null,
      playback_url: null,
    },
    {
      media_key: '7_video',
      type: 'video',
      url: null,
      preview_image_url: 'video.jpg',
      width: 1280,
      height: 720,
      duration_ms: 42_000,
      alt_text: null,
      // The highest-bitrate MP4 wins; the HLS variant no <video> can play is skipped.
      playback_url: 'high.mp4',
    },
  ]);
  assert.deepEqual(JSON.parse(page.bookmarks[0].quotedTweet ?? '{}'), {
    tweet_id: '200',
    full_text: 'quoted text',
    author_name: 'Quoted',
    author_handle: 'quoted',
    author_avatar: 'quote.jpg',
    tweet_url: 'https://x.com/quoted/status/200',
    created_at: '2026-08-19T05:00:00.000Z',
    media: [],
    links: [],
  });
});

test('captures public metrics from the same bookmark request', () => {
  const page = parseOfficialBookmarkPage({
    data: [
      {
        id: '100',
        text: 'metrics',
        author_id: '10',
        public_metrics: { like_count: 412, reply_count: 0, retweet_count: 31 },
      },
      { id: '101', text: 'no metrics at all', author_id: '10' },
    ],
    includes: { users: [{ id: '10', name: 'Author', username: 'author' }] },
  });

  const [withMetrics, withoutMetrics] = page.bookmarks;
  assert.equal(withMetrics.likeCount, 412);
  // A real zero must survive as 0, not collapse into "never observed".
  assert.equal(withMetrics.replyCount, 0);
  assert.equal(withMetrics.retweetCount, 31);
  assert.equal(withMetrics.quoteCount, null);
  assert.equal(withMetrics.impressionCount, null);
  assert.equal(withoutMetrics.likeCount, null);
});

test('resolves t.co links and marks the ones X appends for its own attachments', () => {
  const page = parseOfficialBookmarkPage({
    data: [
      {
        id: '100',
        text: 'read this https://t.co/article and see https://t.co/pic plus https://t.co/quote',
        author_id: '10',
        referenced_tweets: [{ type: 'quoted', id: '200' }],
        entities: {
          urls: [
            {
              url: 'https://t.co/article',
              expanded_url: 'https://example.com/post',
              display_url: 'example.com/post',
              title: 'A post',
              description: 'About something',
            },
            {
              url: 'https://t.co/pic',
              expanded_url: 'https://x.com/author/status/100/photo/1',
              display_url: 'pic.x.com/abc',
              media_key: '3_photo',
            },
            {
              url: 'https://t.co/quote',
              expanded_url: 'https://x.com/quoted/status/200',
              display_url: 'x.com/quoted/status…',
            },
          ],
        },
      },
    ],
    includes: {
      users: [{ id: '10', name: 'Author', username: 'author' }],
      tweets: [{ id: '200', text: 'quoted', author_id: '10' }],
    },
  });

  assert.deepEqual(JSON.parse(page.bookmarks[0].links ?? '[]'), [
    {
      url: 'https://t.co/article',
      expanded_url: 'https://example.com/post',
      display_url: 'example.com/post',
      title: 'A post',
      description: 'About something',
      kind: 'link',
    },
    {
      url: 'https://t.co/pic',
      expanded_url: 'https://x.com/author/status/100/photo/1',
      display_url: 'pic.x.com/abc',
      title: null,
      description: null,
      kind: 'media',
    },
    {
      url: 'https://t.co/quote',
      expanded_url: 'https://x.com/quoted/status/200',
      display_url: 'x.com/quoted/status…',
      title: null,
      description: null,
      kind: 'quote',
    },
  ]);
});

test('merges the entity set a long post carries alongside its truncated text', () => {
  const page = parseOfficialBookmarkPage({
    data: [
      {
        id: '100',
        text: 'truncated… https://t.co/short',
        author_id: '10',
        entities: { urls: [{ url: 'https://t.co/short', expanded_url: 'https://x.com/i/web/status/100' }] },
        note_tweet: {
          text: 'the whole thing https://t.co/deep',
          entities: {
            urls: [{ url: 'https://t.co/deep', expanded_url: 'https://example.com/deep', display_url: 'example.com/deep' }],
          },
        },
      },
    ],
    includes: { users: [{ id: '10', name: 'Author', username: 'author' }] },
  });

  const links = JSON.parse(page.bookmarks[0].links ?? '[]') as { url: string }[];
  assert.deepEqual(links.map((link) => link.url), ['https://t.co/short', 'https://t.co/deep']);
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

test('a quoted post carries its own resolved links for the quote card', () => {
  const page = parseOfficialBookmarkPage({
    data: [{ id: '100', text: 'look', author_id: '10', referenced_tweets: [{ type: 'quoted', id: '200' }] }],
    includes: {
      users: [{ id: '10', name: 'Author', username: 'author' }],
      tweets: [
        {
          id: '200',
          text: 'the source https://t.co/src',
          author_id: '10',
          entities: {
            urls: [
              { url: 'https://t.co/src', expanded_url: 'https://example.com/src', display_url: 'example.com/src' },
            ],
          },
        },
      ],
    },
  });

  const quote = JSON.parse(page.bookmarks[0].quotedTweet ?? '{}');
  assert.deepEqual(quote.links, [
    {
      url: 'https://t.co/src',
      expanded_url: 'https://example.com/src',
      display_url: 'example.com/src',
      title: null,
      description: null,
      kind: 'link',
    },
  ]);
});
