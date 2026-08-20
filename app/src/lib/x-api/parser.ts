import type { ParsedTimelinePage, XBookmarkRecord } from '@/lib/x-sync/types';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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

function quotedTweet(
  tweet: JsonObject,
  tweets: Map<string, JsonObject>,
  users: Map<string, JsonObject>,
  media: Map<string, JsonObject>,
) {
  const reference = objectArray(tweet.referenced_tweets).find(
    (item) => asString(item.type) === 'quoted',
  );
  const quotedId = asString(reference?.id);
  const quoted = quotedId ? tweets.get(quotedId) : undefined;
  if (!quotedId || !quoted) return null;

  const author = users.get(asString(quoted.author_id) ?? '');
  const authorHandle = asString(author?.username) ?? '';
  const attachmentKeys = Array.isArray(asObject(quoted.attachments)?.media_keys)
    ? (asObject(quoted.attachments)?.media_keys as unknown[]).map(asString).filter(Boolean) as string[]
    : [];
  const mediaItems = attachmentKeys
    .map((key) => media.get(key))
    .filter(Boolean)
    .map((item) => ({
      media_key: asString(item?.media_key),
      type: asString(item?.type),
      url: asString(item?.url),
      preview_image_url: asString(item?.preview_image_url),
    }));
  return {
    tweet_id: quotedId,
    full_text: fullText(quoted),
    author_name: asString(author?.name) ?? '',
    author_handle: authorHandle,
    author_avatar: asString(author?.profile_image_url),
    tweet_url: authorHandle
      ? `https://x.com/${authorHandle}/status/${quotedId}`
      : `https://x.com/i/web/status/${quotedId}`,
    created_at: asString(quoted.created_at),
    media: mediaItems,
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
    const attachmentKeys = Array.isArray(asObject(tweet.attachments)?.media_keys)
      ? (asObject(tweet.attachments)?.media_keys as unknown[])
          .map(asString)
          .filter(Boolean) as string[]
      : [];
    const mediaItems = attachmentKeys
      .map((key) => media.get(key))
      .filter(Boolean)
      .map((item) => ({
        media_key: asString(item?.media_key),
        type: asString(item?.type),
        url: asString(item?.url),
        preview_image_url: asString(item?.preview_image_url),
      }));
    const mediaUrls = [...new Set(mediaItems.map((item) => item.url ?? item.preview_image_url).filter(Boolean))] as string[];
    const createdAt = asString(tweet.created_at);
    const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;
    const quote = quotedTweet(tweet, includedTweets, users, media);

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
      tweetCreatedAt: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : null,
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
