import type { ParsedTimelinePage, XBookmarkRecord } from './types';

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function at(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    const object = asObject(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function unwrapTweetResult(value: unknown): JsonObject | null {
  let current = asObject(value);
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (asObject(current.legacy)) return current;
    const wrapped = asObject(current.tweet) ?? asObject(current.result);
    if (!wrapped || wrapped === current) return null;
    current = wrapped;
  }
  return null;
}

function extractMediaUrls(legacy: JsonObject): string[] {
  const extended = asObject(legacy.extended_entities);
  const entities = asObject(legacy.entities);
  const media = Array.isArray(extended?.media)
    ? extended.media
    : Array.isArray(entities?.media)
      ? entities.media
      : [];

  return [...new Set(media.map((item) => asString(asObject(item)?.media_url_https)).filter(Boolean))] as string[];
}

function extractQuotedTweet(value: unknown) {
  const quoted = unwrapTweetResult(value);
  const legacy = asObject(quoted?.legacy);
  const userLegacy = asObject(at(quoted, 'core', 'user_results', 'result', 'legacy'));
  if (!quoted || !legacy || !userLegacy) return null;

  return {
    tweet_id: asString(quoted.rest_id) ?? asString(legacy.id_str) ?? '',
    full_text:
      asString(at(quoted, 'note_tweet', 'note_tweet_results', 'result', 'text')) ??
      asString(legacy.full_text) ??
      '',
    author_name: asString(userLegacy.name) ?? '',
    author_handle: asString(userLegacy.screen_name) ?? '',
    author_avatar: asString(userLegacy.profile_image_url_https),
  };
}

export function extractTweetData(value: unknown): XBookmarkRecord | null {
  try {
    const result = unwrapTweetResult(value);
    const legacy = asObject(result?.legacy);
    const userLegacy = asObject(at(result, 'core', 'user_results', 'result', 'legacy'));
    if (!result || !legacy || !userLegacy) return null;

    const tweetId = asString(result.rest_id) ?? asString(legacy.id_str);
    if (!tweetId) return null;

    const authorHandle = asString(userLegacy.screen_name) ?? '';
    const mediaUrls = extractMediaUrls(legacy);
    const quotedTweet = extractQuotedTweet(at(result, 'quoted_status_result', 'result'));
    const createdAt = asString(legacy.created_at);
    const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;

    return {
      tweetId,
      fullText:
        asString(at(result, 'note_tweet', 'note_tweet_results', 'result', 'text')) ??
        asString(legacy.full_text) ??
        '',
      authorName: asString(userLegacy.name) ?? '',
      authorHandle,
      authorAvatar: asString(userLegacy.profile_image_url_https),
      tweetUrl: `https://x.com/${authorHandle}/status/${tweetId}`,
      mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      quotedTweet: quotedTweet ? JSON.stringify(quotedTweet) : null,
      tweetCreatedAt: Number.isFinite(createdAtMs) ? Math.floor(createdAtMs / 1000) : null,
    };
  } catch {
    return null;
  }
}

function collectInstructionEntries(instructions: unknown[]): JsonObject[] {
  const entries: JsonObject[] = [];
  for (const instructionValue of instructions) {
    const instruction = asObject(instructionValue);
    if (!instruction) continue;
    const directEntries = Array.isArray(instruction.entries)
      ? instruction.entries
      : Array.isArray(asObject(instruction.addEntries)?.entries)
        ? (asObject(instruction.addEntries)?.entries as unknown[])
        : [];
    for (const entry of directEntries) {
      const object = asObject(entry);
      if (object) entries.push(object);
    }
    const replacement = asObject(asObject(instruction.replaceEntry)?.entry);
    if (replacement) entries.push(replacement);
  }
  return entries;
}

function collectTweetResults(content: unknown, depth = 0): unknown[] {
  if (depth > 6) return [];
  const object = asObject(content);
  if (!object) return [];

  const direct = at(object, 'tweet_results', 'result');
  if (direct) return [direct];

  const results: unknown[] = [];
  for (const key of ['itemContent', 'item', 'content']) {
    if (object[key]) results.push(...collectTweetResults(object[key], depth + 1));
  }
  if (Array.isArray(object.items)) {
    for (const item of object.items) results.push(...collectTweetResults(item, depth + 1));
  }
  return results;
}

export function getGraphqlErrorMessage(payload: unknown): string | null {
  const errors = asObject(payload)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const messages = errors
    .map((error) => asString(asObject(error)?.message))
    .filter(Boolean)
    .slice(0, 3);
  return messages.length > 0 ? messages.join('; ') : 'X returned a GraphQL error';
}

export function parseBookmarkTimeline(payload: unknown): ParsedTimelinePage {
  const timeline =
    at(payload, 'data', 'bookmark_timeline_v2', 'timeline') ??
    at(payload, 'data', 'bookmark_timeline', 'timeline');
  const timelineObject = asObject(timeline);
  const instructions = Array.isArray(timelineObject?.instructions)
    ? timelineObject.instructions
    : [];
  const entries = collectInstructionEntries(instructions);
  const bookmarks: XBookmarkRecord[] = [];
  let nextCursor: string | null = null;
  let skippedTweetCount = 0;

  for (const entry of entries) {
    const entryId = asString(entry.entryId) ?? '';
    const content = asObject(entry.content);
    const cursorType = asString(content?.cursorType);
    if (entryId.includes('cursor-bottom') || cursorType === 'Bottom') {
      nextCursor = asString(content?.value) ?? nextCursor;
      continue;
    }

    for (const result of collectTweetResults(content)) {
      const bookmark = extractTweetData(result);
      if (bookmark) bookmarks.push(bookmark);
      else skippedTweetCount += 1;
    }
  }

  return {
    bookmarks,
    nextCursor,
    timelineFound: Boolean(timelineObject),
    timelineEntryCount: entries.length,
    skippedTweetCount,
  };
}
