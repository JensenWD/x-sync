import assert from 'node:assert/strict';
import test from 'node:test';
import { getGraphqlErrorMessage, parseBookmarkTimeline } from '../src/lib/x-sync/parser';

function tweetResult(id: string) {
  return {
    __typename: 'TweetWithVisibilityResults',
    tweet: {
      rest_id: id,
      legacy: {
        id_str: id,
        full_text: 'legacy text',
        created_at: 'Fri Aug 14 12:00:00 +0000 2026',
        extended_entities: {
          media: [
            { media_url_https: 'https://pbs.twimg.com/a.jpg' },
            { media_url_https: 'https://pbs.twimg.com/a.jpg' },
          ],
        },
      },
      note_tweet: { note_tweet_results: { result: { text: 'complete long-form text' } } },
      core: {
        user_results: {
          result: {
            legacy: {
              name: 'Example Author',
              screen_name: 'example',
              profile_image_url_https: 'https://pbs.twimg.com/avatar.jpg',
            },
          },
        },
      },
    },
  };
}

test('parses wrapped and module bookmarks plus the bottom cursor', () => {
  const payload = {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [
            {
              entries: [
                {
                  entryId: 'tweet-1',
                  content: { itemContent: { tweet_results: { result: tweetResult('1') } } },
                },
                {
                  entryId: 'module-2',
                  content: {
                    items: [
                      { item: { itemContent: { tweet_results: { result: tweetResult('2') } } } },
                    ],
                  },
                },
                {
                  entryId: 'cursor-bottom-0',
                  content: { cursorType: 'Bottom', value: 'next-page' },
                },
              ],
            },
          ],
        },
      },
    },
  };

  const page = parseBookmarkTimeline(payload);
  assert.equal(page.timelineFound, true);
  assert.equal(page.nextCursor, 'next-page');
  assert.deepEqual(page.bookmarks.map((bookmark) => bookmark.tweetId), ['1', '2']);
  assert.equal(page.bookmarks[0].fullText, 'complete long-form text');
  assert.equal(page.bookmarks[0].tweetUrl, 'https://x.com/example/status/1');
  assert.deepEqual(JSON.parse(page.bookmarks[0].mediaUrls ?? '[]'), ['https://pbs.twimg.com/a.jpg']);
});

test('counts unavailable tweet results without treating them as bookmarks', () => {
  const page = parseBookmarkTimeline({
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [
            {
              entries: [
                {
                  entryId: 'tweet-tombstone',
                  content: {
                    itemContent: { tweet_results: { result: { __typename: 'TweetTombstone' } } },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  });
  assert.equal(page.bookmarks.length, 0);
  assert.equal(page.skippedTweetCount, 1);
});

test('extracts safe GraphQL error messages for classification', () => {
  assert.equal(
    getGraphqlErrorMessage({ errors: [{ message: 'Authorization: Denied' }, { message: 'Second' }] }),
    'Authorization: Denied; Second',
  );
  assert.equal(getGraphqlErrorMessage({ data: {} }), null);
});

test('reports a missing timeline instead of silently succeeding', () => {
  const page = parseBookmarkTimeline({ data: {} });
  assert.equal(page.timelineFound, false);
  assert.equal(page.bookmarks.length, 0);
});
