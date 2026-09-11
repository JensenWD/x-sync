import type { ParsedTimelinePage, XBookmarkLink, XBookmarkRecord } from '@/lib/x-sync/types';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(asObject).filter(Boolean) as JsonObject[] : [];
}

function byStringId(values: JsonObject[]) {
  return new Map(
    values
      .map((value) => [asString(value.id), value] as const)
      .filter((entry): entry is readonly [string, JsonObject] => Boolean(entry[0])),
  );
}

function fullText(tweet: JsonObject) {
  return asString(asObject(tweet.note_tweet)?.text) ?? asString(tweet.text) ?? '';
}

/** Highest-bitrate progressive MP4 — the one variant a `<video>` element can play directly. */
function playbackUrl(item: JsonObject): string | null {
  let best: { bitRate: number; url: string } | null = null;
  for (const variant of objectArray(item.variants)) {
    const url = asString(variant.url);
    if (!url || asString(variant.content_type) !== 'video/mp4') continue;
    const bitRate = asCount(variant.bit_rate) ?? 0;
    if (!best || bitRate > best.bitRate) best = { bitRate, url };
  }
  return best?.url ?? null;
}

/**
 * Media carries its intrinsic size so the grid can lay a card out at the post's
 * own aspect ratio instead of cropping everything into one fixed box.
 */
function mediaItem(item: JsonObject) {
  return {
    media_key: asString(item.media_key),
    type: asString(item.type),
    url: asString(item.url),
    preview_image_url: asString(item.preview_image_url),
    width: asCount(item.width),
    height: asCount(item.height),
    duration_ms: asCount(item.duration_ms),
    alt_text: asString(item.alt_text),
    playback_url: playbackUrl(item),
  };
}

function mediaFor(tweet: JsonObject, media: Map<string, JsonObject>) {
  const keys = Array.isArray(asObject(tweet.attachments)?.media_keys)
    ? ((asObject(tweet.attachments)?.media_keys as unknown[]).map(asString).filter(Boolean) as string[])
    : [];
  return keys
    .map((key) => media.get(key))
    .filter((item): item is JsonObject => Boolean(item))
    .map(mediaItem);
}

function matchedMediaNotes(tweet: JsonObject) {
  return objectArray(tweet.matched_media_notes)
    .map((note) => ({
      note_id: asString(note.note_id),
      match_status: asString(note.match_status),
    }))
    .filter((note): note is { note_id: string; match_status: string | null } => Boolean(note.note_id));
}

/**
 * Resolves every `t.co` in a post back to its destination. A long post carries
 * its own entity set alongside the truncated one, so both are merged; the two
 * `t.co`s X appends for attached media and for a quoted post are marked so the
 * renderer can drop them rather than print a bare shortlink.
 */
function tweetLinks(tweet: JsonObject, quotedId: string | null): XBookmarkLink[] {
  const entities = [
    ...objectArray(asObject(tweet.entities)?.urls),
    ...objectArray(asObject(asObject(tweet.note_tweet)?.entities)?.urls),
  ];
  const links: XBookmarkLink[] = [];
  const seen = new Set<string>();

  for (const entity of entities) {
    const url = asString(entity.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const expandedUrl = asString(entity.expanded_url);
    const displayUrl = asString(entity.display_url);
    const isMedia =
      typeof entity.media_key === 'string' || /^pic\.(x|twitter)\.com\//u.test(displayUrl ?? '');
    const isQuote = Boolean(quotedId && expandedUrl?.includes(`/status/${quotedId}`));

    links.push({
      url,
      expanded_url: expandedUrl,
      display_url: displayUrl,
      title: asString(entity.title),
      description: asString(entity.description),
      kind: isMedia ? 'media' : isQuote ? 'quote' : 'link',
    });
  }

  return links;
}

function referencedTweetId(tweet: JsonObject, type: 'quoted' | 'replied_to') {
  const reference = objectArray(tweet.referenced_tweets).find(
    (item) => asString(item.type) === type,
  );
  return asString(reference?.id);
}

function referencedTweet(
  referencedId: string | null,
  tweets: Map<string, JsonObject>,
  users: Map<string, JsonObject>,
  media: Map<string, JsonObject>,
) {
  const referenced = referencedId ? tweets.get(referencedId) : undefined;
  if (!referencedId || !referenced) return null;

  const author = users.get(asString(referenced.author_id) ?? '');
  const authorHandle = asString(author?.username) ?? '';
  return {
    tweet_id: referencedId,
    full_text: fullText(referenced),
    author_name: asString(author?.name) ?? '',
    author_handle: authorHandle,
    author_avatar: asString(author?.profile_image_url),
    tweet_url: authorHandle
      ? `https://x.com/${authorHandle}/status/${referencedId}`
      : `https://x.com/i/web/status/${referencedId}`,
    created_at: asString(referenced.created_at),
    media: mediaFor(referenced, media),
    matched_media_notes: matchedMediaNotes(referenced),
    // The quote card renders this text too, so it needs its own resolved links.
    links: tweetLinks(referenced, null),
  };
}

export function getOfficialApiError(payload: unknown): string | null {
  const errors = objectArray(asObject(payload)?.errors);
  if (errors.length === 0) return null;
  const messages = errors
    .map((error) => asString(error.detail) ?? asString(error.message) ?? asString(error.title))
    .filter(Boolean)
    .slice(0, 3);
  return messages.length > 0 ? messages.join('; ') : 'X returned an API error';
}

export function parseOfficialBookmarkPage(payload: unknown): ParsedTimelinePage {
  const root = asObject(payload);
  const includes = asObject(root?.includes);
  const users = byStringId(objectArray(includes?.users));
  const includedTweets = byStringId(objectArray(includes?.tweets));
  const media = new Map(
    objectArray(includes?.media)
      .map((item) => [asString(item.media_key), item] as const)
      .filter((entry): entry is readonly [string, JsonObject] => Boolean(entry[0])),
  );
  const data = objectArray(root?.data);
  const bookmarks: XBookmarkRecord[] = [];
  let skippedTweetCount = 0;

  for (const tweet of data) {
    const tweetId = asString(tweet.id);
    if (!tweetId) {
      skippedTweetCount += 1;
      continue;
    }
    const author = users.get(asString(tweet.author_id) ?? '');
    const authorHandle = asString(author?.username) ?? '';
    const mediaItems = mediaFor(tweet, media);
    const mediaUrls = [
      ...new Set(mediaItems.map((item) => item.url ?? item.preview_image_url).filter(Boolean)),
    ] as string[];
    const createdAt = asString(tweet.created_at);
    const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;
    const quotedId = referencedTweetId(tweet, 'quoted');
    const repliedToId = referencedTweetId(tweet, 'replied_to');
    const quote = referencedTweet(quotedId, includedTweets, users, media);
    const reply = referencedTweet(repliedToId, includedTweets, users, media);
    const noteMatches = matchedMediaNotes(tweet);
    const links = tweetLinks(tweet, quotedId);
    const metrics = asObject(tweet.public_metrics);

    bookmarks.push({
      tweetId,
      fullText: fullText(tweet),
      authorName: asString(author?.name) ?? '',
      authorHandle,
      authorAvatar: asString(author?.profile_image_url),
      tweetUrl: authorHandle
        ? `https://x.com/${authorHandle}/status/${tweetId}`
        : `https://x.com/i/web/status/${tweetId}`,
      mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      mediaMetadata: mediaItems.length > 0 ? JSON.stringify(mediaItems) : null,
      quotedTweet: quote ? JSON.stringify(quote) : null,
      repliedToTweet: reply ? JSON.stringify(reply) : null,
      matchedMediaNotes: noteMatches.length > 0 ? JSON.stringify(noteMatches) : null,
      tweetCreatedAt: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : null,
      links: links.length > 0 ? JSON.stringify(links) : null,
      conversationId: asString(tweet.conversation_id),
      likeCount: asCount(metrics?.like_count),
      replyCount: asCount(metrics?.reply_count),
      retweetCount: asCount(metrics?.retweet_count),
      quoteCount: asCount(metrics?.quote_count),
      bookmarkCount: asCount(metrics?.bookmark_count),
      impressionCount: asCount(metrics?.impression_count),
    });
  }

  const meta = asObject(root?.meta);
  return {
    bookmarks,
    nextCursor: asString(meta?.next_token),
    timelineFound: Array.isArray(root?.data) || Boolean(meta),
    timelineEntryCount: data.length,
    skippedTweetCount,
  };
}
