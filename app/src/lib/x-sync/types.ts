export type SyncMode = 'auto' | 'incremental' | 'full';
export type EffectiveSyncMode = Exclude<SyncMode, 'auto'>;

export interface ReconciliationConfirmation {
  fingerprint: string;
  observed_count: number;
}

/**
 * One `t.co` link found in a post, resolved back to where it actually points.
 * `kind` separates real outbound links from the two `t.co`s X appends for its
 * own attachments, which the reader renders as a media block or a quote card
 * rather than as link text.
 */
export interface XBookmarkLink {
  url: string;
  expanded_url: string | null;
  display_url: string | null;
  title: string | null;
  description: string | null;
  kind: 'link' | 'media' | 'quote';
}

export interface XBookmarkRecord {
  tweetId: string;
  fullText: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string | null;
  tweetUrl: string;
  mediaUrls: string | null;
  mediaMetadata: string | null;
  quotedTweet: string | null;
  tweetCreatedAt: number | null;
  /** Serialized `XBookmarkLink[]`. Optional so the parked extension parser still type-checks. */
  links?: string | null;
  conversationId?: string | null;
  likeCount?: number | null;
  replyCount?: number | null;
  retweetCount?: number | null;
  quoteCount?: number | null;
  bookmarkCount?: number | null;
  impressionCount?: number | null;
}

export interface ParsedTimelinePage {
  bookmarks: XBookmarkRecord[];
  nextCursor: string | null;
  timelineFound: boolean;
  timelineEntryCount: number;
  skippedTweetCount: number;
}

export interface SyncRunSummary {
  id: number;
  requested_mode: SyncMode;
  mode: EffectiveSyncMode;
  status: 'running' | 'success' | 'failed' | 'quarantined';
  started_at: number;
  heartbeat_at: number;
  finished_at: number | null;
  pages_fetched: number;
  bookmarks_fetched: number;
  bookmarks_inserted: number;
  bookmarks_existing: number;
  remote_removed: number;
  baseline_remote_count: number;
  skipped_tweet_count: number;
  reconciliation_fingerprint: string | null;
  stop_reason: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface SyncResult extends SyncRunSummary {
  total_bookmarks: number;
  auto_tag?: {
    status: 'success' | 'skipped' | 'failed';
    queued: number;
    tagged: number;
    assignments: number;
    model: string | null;
    error: string | null;
  };
}

export interface BrowserPageRecordResult {
  run: SyncRunSummary;
  nextCursor: string | null;
  consecutiveKnownPages: number;
  consecutiveEmptyPages: number;
  repeatedCursor: boolean;
  duplicateUpload: boolean;
}

export type BrowserSyncPageResult =
  | { status: 'continue'; run: SyncRunSummary; cursor: string }
  | { status: 'success'; run: SyncResult };

export interface DurableSyncStatus {
  in_progress: boolean;
  last_synced_at: number | null;
  last_full_synced_at: number | null;
  total_bookmarks: number;
  last_error: string | null;
  active_run: SyncRunSummary | null;
  last_run: SyncRunSummary | null;
}
