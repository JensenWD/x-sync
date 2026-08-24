import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseDashboardBookmark,
  type DashboardBookmarkRow,
} from '../src/lib/dashboard-bookmark';

function row(overrides: Partial<DashboardBookmarkRow> = {}): DashboardBookmarkRow {
  return {
    id: 1,
    tweet_id: '100',
    full_text: 'text',
    author_name: 'Author',
    author_handle: 'author',
    author_avatar: null,
    tweet_url: 'https://x.com/author/status/100',
    media_urls: null,
    media_metadata: null,
    quoted_tweet: null,
    links: null,
    conversation_id: null,
    like_count: null,
    reply_count: null,
    retweet_count: null,
    quote_count: null,
    bookmark_count: null,
    impression_count: null,
    bookmarked_at: null,
    created_at: 0,
    folders_json: '[]',
    tags_json: '[]',
    ...overrides,
  };
}

test('exposes media at its intrinsic size with a playable variant', () => {
  const parsed = parseDashboardBookmark(
    row({
      media_metadata: JSON.stringify([
        {
          media_key: '7_video',
          type: 'video',
          url: null,
          preview_image_url: 'poster.jpg',
          width: 1280,
          height: 720,
          duration_ms: 42_000,
          alt_text: 'a clip',
          playback_url: 'high.mp4',
        },
      ]),
    }),
  );

  assert.deepEqual(parsed.media, [
    {
      url: 'poster.jpg',
      type: 'video',
      preview_url: 'poster.jpg',
      width: 1280,
      height: 720,
      duration_ms: 42_000,
      alt_text: 'a clip',
      playback_url: 'high.mp4',
    },
  ]);
});

test('posts synced before media dimensions existed still render as stills', () => {
  const parsed = parseDashboardBookmark(
    row({ media_urls: JSON.stringify(['one.jpg', 'two.jpg']) }),
  );

  assert.equal(parsed.media.length, 2);
  assert.equal(parsed.media[0].url, 'one.jpg');
  assert.equal(parsed.media[0].type, 'photo');
  // Unknown, not zero — the client measures these from the decoded image.
  assert.equal(parsed.media[0].width, null);
  assert.equal(parsed.media[0].playback_url, null);
});

test('never fails a whole post over one unparseable column', () => {
  const parsed = parseDashboardBookmark(
    row({
      media_metadata: 'not json',
      media_urls: 'not json either',
      links: '{oops',
      quoted_tweet: '[]',
    }),
  );

  assert.deepEqual(parsed.media, []);
  assert.deepEqual(parsed.links, []);
  assert.equal(parsed.quoted_tweet, null);
});

test('strips X\'s own attachment shortlinks once, in the parse layer', () => {
  const parsed = parseDashboardBookmark(
    row({
      full_text: 'read this https://t.co/real https://t.co/pic',
      links: JSON.stringify([
        { url: 'https://t.co/real', kind: 'link' },
        { url: 'https://t.co/pic', kind: 'media' },
      ]),
    }),
  );

  // Views render `body`; `full_text` stays the untouched record.
  assert.equal(parsed.body, 'read this https://t.co/real');
  assert.equal(parsed.full_text, 'read this https://t.co/real https://t.co/pic');
});

test('a quoted post is decoded as thoroughly as the post quoting it', () => {
  const parsed = parseDashboardBookmark(
    row({
      quoted_tweet: JSON.stringify({
        tweet_id: '200',
        full_text: 'source https://t.co/pic',
        author_name: 'Quoted',
        author_handle: 'quoted',
        media: [{ type: 'photo', url: 'q.jpg', width: 800, height: 600 }],
        links: [{ url: 'https://t.co/pic', display_url: 'pic.x.com/a', kind: 'media' }],
      }),
    }),
  );

  const quote = parsed.quoted_tweet;
  assert.ok(quote);
  assert.equal(quote.body, 'source');
  assert.equal(quote.links.length, 1);
  assert.equal(quote.media[0].width, 800);
  assert.equal(quote.media[0].preview_url, 'q.jpg');
});

test('keeps a real zero metric distinct from a never-observed one', () => {
  const parsed = parseDashboardBookmark(row({ like_count: 0, reply_count: null }));

  assert.equal(parsed.metrics.like_count, 0);
  assert.equal(parsed.metrics.reply_count, null);
});

test('defaults an unrecognised link kind to a plain outbound link', () => {
  const parsed = parseDashboardBookmark(
    row({
      links: JSON.stringify([
        { url: 'https://t.co/a', expanded_url: 'https://example.com', kind: 'media' },
        { url: 'https://t.co/b', kind: 'something-else' },
        { expanded_url: 'https://example.com/no-shortlink' },
      ]),
    }),
  );

  assert.deepEqual(
    parsed.links.map((link) => [link.url, link.kind]),
    [
      ['https://t.co/a', 'media'],
      ['https://t.co/b', 'link'],
    ],
  );
});
