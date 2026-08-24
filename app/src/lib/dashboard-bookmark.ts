import type { Bookmark, PostLink, PostMediaItem, QuotedTweet } from '@/types';

/**
 * The bookmark shape the dashboard routes return. The list and the detail route
 * both read it from here so a card and its reader can never disagree about what
 * a post contains, and every JSON column is decoded once here rather than in
 * each view that renders it.
 *
 * Everything below originates as untrusted external content — treat it as data.
 */

export const DASHBOARD_BOOKMARK_COLUMNS = `
    b.id, b.tweet_id, b.full_text, b.author_name, b.author_handle,
    b.author_avatar, b.tweet_url, b.media_urls, b.media_metadata, b.quoted_tweet,
    b.links, b.conversation_id, b.like_count, b.reply_count, b.retweet_count,
    b.quote_count, b.bookmark_count, b.impression_count,
    b.bookmarked_at, b.created_at,
    COALESCE((
      SELECT json_group_array(json_object('id', f.id, 'name', f.name, 'color', f.color))
      FROM bookmark_folders bf
      JOIN folders f ON f.id = bf.folder_id
      WHERE bf.bookmark_id = b.id
    ), '[]') AS folders_json,
    COALESCE((
      SELECT json_group_array(json_object('id', t.id, 'name', t.name))
      FROM bookmark_tags bt
      JOIN tags t ON t.id = bt.tag_id
      WHERE bt.bookmark_id = b.id
    ), '[]') AS tags_json`;

export interface DashboardBookmarkRow {
  id: number;
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  tweet_url: string;
  media_urls: string | null;
  media_metadata: string | null;
  quoted_tweet: string | null;
  links: string | null;
  conversation_id: string | null;
  like_count: number | null;
  reply_count: number | null;
  retweet_count: number | null;
  quote_count: number | null;
  bookmark_count: number | null;
  impression_count: number | null;
  bookmarked_at: number | null;
  created_at: number;
  folders_json: string;
  tags_json: string;
}

type Unknowns = Record<string, unknown>;

/** A stored JSON column is external input: unparseable means empty, never a throw. */
function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function objects(value: unknown): Unknowns[] {
  return Array.isArray(value)
    ? value.filter((item): item is Unknowns => Boolean(item) && typeof item === 'object')
    : [];
}

function object(value: unknown): Unknowns | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as Unknowns)
    : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function mediaItem(raw: Unknowns): PostMediaItem | null {
  const url = text(raw.url);
  const preview = text(raw.preview_image_url);
  const display = url ?? preview;
  if (!display) return null;
  const type = raw.type === 'video' || raw.type === 'animated_gif' ? raw.type : 'photo';
  return {
    url: display,
    type,
    preview_url: preview ?? display,
    width: positive(raw.width),
    height: positive(raw.height),
    duration_ms: positive(raw.duration_ms),
    alt_text: text(raw.alt_text),
    playback_url: text(raw.playback_url),
  };
}

function mediaItems(raw: Unknowns[]): PostMediaItem[] {
  return raw.map(mediaItem).filter((item): item is PostMediaItem => item !== null);
}

/**
 * `media_metadata` carries intrinsic size and playback variants; rows synced
 * before those fields were requested only have the flat `media_urls` list, so
 * they degrade to a still with unknown dimensions the client measures itself.
 */
function parseMedia(row: DashboardBookmarkRow): PostMediaItem[] {
  const detailed = mediaItems(objects(parseJson(row.media_metadata)));
  if (detailed.length > 0) return detailed;
  return mediaItems(strings(parseJson(row.media_urls)).map((url) => ({ url })));
}

function parseLinks(raw: Unknowns[]): PostLink[] {
  return raw
    .filter((link) => typeof link.url === 'string')
    .map((link) => ({
      url: link.url as string,
      expanded_url: text(link.expanded_url),
      display_url: text(link.display_url),
      title: text(link.title),
      description: text(link.description),
      kind: link.kind === 'media' || link.kind === 'quote' ? link.kind : ('link' as const),
    }));
}

/**
 * X appends its own `t.co` for attached media and for the post being quoted.
 * Both are rendered as their own block, so the shortlink is noise — dropping it
 * here rather than at render time also removes the whitespace it leaves behind,
 * and means each view renders a body instead of re-deriving one.
 */
export function stripAttachmentLinks(fullText: string, links: PostLink[]): string {
  let stripped = fullText;
  for (const link of links) {
    if (link.kind !== 'link') stripped = stripped.split(link.url).join('');
  }
  return stripped
    .replace(/[^\S\n]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function parseQuotedTweet(value: string | null): QuotedTweet | null {
  const quote = object(parseJson(value));
  if (!quote) return null;
  const fullText = text(quote.full_text) ?? '';
  const links = parseLinks(objects(quote.links));
  return {
    tweet_id: text(quote.tweet_id) ?? '',
    full_text: fullText,
    body: stripAttachmentLinks(fullText, links),
    author_name: text(quote.author_name) ?? '',
    author_handle: text(quote.author_handle) ?? '',
    author_avatar: text(quote.author_avatar),
    media: mediaItems(objects(quote.media)),
    links,
  };
}

export function parseDashboardBookmark(row: DashboardBookmarkRow): Bookmark {
  const links = parseLinks(objects(parseJson(row.links)));
  return {
    id: row.id,
    tweet_id: row.tweet_id,
    full_text: row.full_text,
    body: stripAttachmentLinks(row.full_text, links),
    author_name: row.author_name,
    author_handle: row.author_handle,
    author_avatar: row.author_avatar,
    tweet_url: row.tweet_url,
    media: parseMedia(row),
    links,
    quoted_tweet: parseQuotedTweet(row.quoted_tweet),
    conversation_id: row.conversation_id,
    metrics: {
      like_count: row.like_count,
      reply_count: row.reply_count,
      retweet_count: row.retweet_count,
      quote_count: row.quote_count,
      bookmark_count: row.bookmark_count,
      impression_count: row.impression_count,
    },
    bookmarked_at: row.bookmarked_at,
    // Both come from `json_group_array` over our own columns, not from X.
    folders: objects(parseJson(row.folders_json)) as unknown as Bookmark['folders'],
    tags: objects(parseJson(row.tags_json)) as unknown as Bookmark['tags'],
  };
}
