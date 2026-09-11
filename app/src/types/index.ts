export interface Folder {
  id: number;
  name: string;
  color: string | null;
  bookmark_count?: number;
}

export interface Tag {
  id: number;
  name: string;
  bookmark_count?: number;
}

export interface CommunityNote {
  note_id: string;
  tweet_id: string;
  summary: string;
  classification: string | null;
  trustworthy_sources: boolean | null;
  is_media_note: boolean;
  is_collaborative_note: boolean;
  current_status: 'CURRENTLY_RATED_HELPFUL';
  created_at: number | null;
  status_updated_at: number | null;
  source_snapshot_date: string;
}

export interface ReferencedTweet {
  tweet_id: string;
  full_text: string;
  /** `full_text` with X's own attachment shortlinks removed — what views render. */
  body: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  media: PostMediaItem[];
  links: PostLink[];
  community_notes: CommunityNote[];
}

export type QuotedTweet = ReferencedTweet;

export interface PostMediaItem {
  url: string;
  type: 'photo' | 'video' | 'animated_gif';
  preview_url: string;
  /** Null on posts synced before media dimensions were requested; the client measures those. */
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  alt_text: string | null;
  playback_url: string | null;
}

/** A `t.co` resolved back to where it points. `kind` marks X's own attachment shortlinks. */
export interface PostLink {
  url: string;
  expanded_url: string | null;
  display_url: string | null;
  title: string | null;
  description: string | null;
  kind: 'link' | 'media' | 'quote';
}

/** Null means the metric was never observed — a real zero is 0. */
export interface PostMetrics {
  like_count: number | null;
  reply_count: number | null;
  retweet_count: number | null;
  quote_count: number | null;
  bookmark_count: number | null;
  impression_count: number | null;
}

export interface Bookmark {
  id: number;
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  tweet_url: string;
  /** `full_text` with X's own attachment shortlinks removed — what views render. */
  body: string;
  media: PostMediaItem[];
  links: PostLink[];
  metrics: PostMetrics;
  conversation_id: string | null;
  quoted_tweet: QuotedTweet | null;
  replied_to_tweet: ReferencedTweet | null;
  community_notes: CommunityNote[];
  bookmarked_at: number | null;
  folders: Folder[];
  tags: Tag[];
}

export interface BookmarkMeta {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

export interface BookmarksResponse {
  data: Bookmark[];
  meta: BookmarkMeta;
}

export interface SyncStatus {
  in_progress: boolean;
  last_synced_at: number | null;
  last_full_synced_at: number | null;
  total_bookmarks: number;
  last_error: string | null;
  active_run: SyncRun | null;
  last_run: SyncRun | null;
}

export interface SyncRun {
  id: number;
  requested_mode: 'auto' | 'incremental' | 'full';
  mode: 'incremental' | 'full';
  status: 'running' | 'success' | 'failed';
  started_at: number;
  heartbeat_at: number;
  finished_at: number | null;
  pages_fetched: number;
  bookmarks_fetched: number;
  bookmarks_inserted: number;
  bookmarks_existing: number;
  remote_removed: number;
  stop_reason: string | null;
  error_code: string | null;
  error_message: string | null;
  auto_tag?: {
    status: 'success' | 'skipped' | 'failed';
    queued: number;
    tagged: number;
    assignments: number;
    model: string | null;
    error: string | null;
  };
}

export interface XConnectionStatus {
  configured: boolean;
  connected: boolean;
  username: string | null;
  scope: string | null;
}
