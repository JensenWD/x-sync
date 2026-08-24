export const X_BOOKMARK_PAGE_SIZE = 50;

export function bookmarkRequestUrl(userId: string, cursor: string | null) {
  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(userId)}/bookmarks`);

  // X currently drops the continuation token around the 200-item boundary when
  // max_results=100. Fifty-item pages continue through the complete library.
  url.searchParams.set('max_results', String(X_BOOKMARK_PAGE_SIZE));
  // Every field here rides the same request: widening the field set costs no
  // extra calls and no extra rate limit, so the sync takes everything it can
  // usefully store rather than going back to X for it later.
  url.searchParams.set(
    'tweet.fields',
    'attachments,author_id,conversation_id,created_at,entities,note_tweet,public_metrics,referenced_tweets',
  );
  url.searchParams.set(
    'expansions',
    'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id',
  );
  url.searchParams.set('user.fields', 'name,username,profile_image_url');
  url.searchParams.set(
    'media.fields',
    'media_key,type,url,preview_image_url,width,height,duration_ms,alt_text,variants',
  );
  if (cursor) url.searchParams.set('pagination_token', cursor);

  return url;
}
