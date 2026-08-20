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

export interface QuotedTweet {
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
}

export interface Bookmark {
  id: number;
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  tweet_url: string;
  media_urls: string[];
  quoted_tweet: QuotedTweet | null;
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
