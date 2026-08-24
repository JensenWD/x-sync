import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type {
  BrowserPageRecordResult,
  DurableSyncStatus,
  EffectiveSyncMode,
  ParsedTimelinePage,
  ReconciliationConfirmation,
  SyncMode,
  SyncResult,
  SyncRunSummary,
  XBookmarkRecord,
} from './types';

const FULL_SYNC_INTERVAL_SECONDS = 7 * 24 * 60 * 60;
const STALE_RUN_SECONDS = 10 * 60;
const FIRST_PAGE_CURSOR_KEY = 'first-page';
const RECONCILIATION_CONFIRMATION_SECONDS = 24 * 60 * 60;
const MASS_ARCHIVE_MINIMUM_BASELINE = 100;
const MASS_ARCHIVE_REMAINING_RATIO = 0.8;

interface SyncStateRow {
  last_successful_run_id: number | null;
  last_synced_at: number | null;
  last_full_synced_at: number | null;
  last_error: string | null;
  reconciliation_candidate_fingerprint: string | null;
  reconciliation_candidate_count: number | null;
  reconciliation_candidate_at: number | null;
}

interface StoredPageRow {
  request_cursor: string | null;
  next_cursor: string | null;
  known_page: number;
  empty_page: number;
}

export class SyncAlreadyRunningError extends Error {
  constructor(public readonly run: SyncRunSummary) {
    super('A bookmark sync is already running');
    this.name = 'SyncAlreadyRunningError';
  }
}

export class SyncRunNotFoundError extends Error {
  constructor(public readonly runId: number) {
    super(`Sync run ${runId} was not found`);
    this.name = 'SyncRunNotFoundError';
  }
}

export class SyncRunStateError extends Error {
  constructor(public readonly run: SyncRunSummary) {
    super(`Sync run ${run.id} is ${run.status}`);
    this.name = 'SyncRunStateError';
  }
}

export class SyncCursorMismatchError extends Error {
  constructor() {
    super('The browser uploaded bookmark pages out of order');
    this.name = 'SyncCursorMismatchError';
  }
}

export class SyncReconciliationBlockedError extends Error {
  constructor(
    public readonly run: SyncRunSummary,
    public readonly baselineCount: number,
    public readonly observedCount: number,
    public readonly fingerprint: string,
  ) {
    super(
      `Full sync saw ${observedCount} bookmarks versus the prior ${baselineCount}; no bookmarks were archived. Explicit confirmation is required before reconciling this result.`,
    );
    this.name = 'SyncReconciliationBlockedError';
  }
}

export function resolveSyncMode(
  requestedMode: SyncMode,
  totalRemoteBookmarks: number,
  lastFullSyncedAt: number | null,
  now: number,
): EffectiveSyncMode {
  if (requestedMode === 'full') return 'full';
  if (totalRemoteBookmarks === 0 || !lastFullSyncedAt) return 'full';
  if (requestedMode === 'incremental') return 'incremental';
  return now - lastFullSyncedAt >= FULL_SYNC_INTERVAL_SECONDS ? 'full' : 'incremental';
}

export function shouldStopIncremental(consecutiveKnownPages: number) {
  return consecutiveKnownPages >= 2;
}

function cursorKey(cursor: string | null) {
  return cursor === null ? FIRST_PAGE_CURSOR_KEY : `cursor:${cursor}`;
}

export class BookmarkSyncStore {
  constructor(private readonly sqlite: Database.Database) {}

  startRun(requestedMode: SyncMode, now: number): SyncRunSummary {
    const start = this.sqlite.transaction(() => {
      const staleMessage = 'The previous sync was interrupted before it finished.';
      this.sqlite
        .prepare(
          `UPDATE sync_runs
           SET status = 'failed', finished_at = ?, heartbeat_at = ?,
               error_code = 'sync_interrupted', error_message = ?, stop_reason = 'stale_run'
           WHERE status = 'running' AND heartbeat_at < ?`,
        )
        .run(now, now, staleMessage, now - STALE_RUN_SECONDS);
      this.sqlite.exec(`
        DELETE FROM sync_run_seen_tweets
        WHERE run_id IN (SELECT id FROM sync_runs WHERE status <> 'running')
      `);

      const active = this.sqlite
        .prepare(`SELECT * FROM sync_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1`)
        .get() as SyncRunSummary | undefined;
      if (active) throw new SyncAlreadyRunningError(active);

      this.sqlite
        .prepare(
          `INSERT OR IGNORE INTO sync_state
             (id, last_successful_run_id, last_synced_at, last_full_synced_at, last_error, updated_at)
           VALUES (1, NULL, NULL, NULL, NULL, ?)`,
        )
        .run(now);
      const state = this.sqlite
        .prepare(`SELECT * FROM sync_state WHERE id = 1`)
        .get() as SyncStateRow;
      const totalRemote = (
        this.sqlite
          .prepare(`SELECT COUNT(*) AS count FROM bookmarks WHERE remote_present = 1`)
          .get() as { count: number }
      ).count;
      const mode = resolveSyncMode(requestedMode, totalRemote, state.last_full_synced_at, now);
      const result = this.sqlite
        .prepare(
          `INSERT INTO sync_runs
             (requested_mode, mode, status, started_at, heartbeat_at, baseline_remote_count)
           VALUES (?, ?, 'running', ?, ?, ?)`,
        )
        .run(requestedMode, mode, now, now, totalRemote);
      return this.getRun(Number(result.lastInsertRowid));
    });

    return start.immediate();
  }

  recordBrowserPage(
    runId: number,
    requestCursor: string | null,
    page: ParsedTimelinePage,
    now: number,
  ): BrowserPageRecordResult {
    const record = this.sqlite.transaction(() => {
      const run = this.getRun(runId);
      if (run.status !== 'running') throw new SyncRunStateError(run);

      const requestCursorKey = cursorKey(requestCursor);
      const priorUpload = this.sqlite
        .prepare(
          `SELECT request_cursor, next_cursor, known_page, empty_page
           FROM sync_run_pages
           WHERE run_id = ? AND request_cursor_key = ?`,
        )
        .get(runId, requestCursorKey) as StoredPageRow | undefined;
      if (priorUpload) {
        return this.browserPageResult(runId, priorUpload.next_cursor, true);
      }

      const priorPage = this.sqlite
        .prepare(
          `SELECT request_cursor, next_cursor, known_page, empty_page
           FROM sync_run_pages
           WHERE run_id = ?
           ORDER BY page_index DESC
           LIMIT 1`,
        )
        .get(runId) as StoredPageRow | undefined;
      const expectedCursor = priorPage?.next_cursor ?? null;
      if (expectedCursor !== requestCursor) throw new SyncCursorMismatchError();

      let remotePosition = (
        this.sqlite
          .prepare(`SELECT COUNT(*) AS count FROM sync_run_seen_tweets WHERE run_id = ?`)
          .get(runId) as { count: number }
      ).count;
      const insertSeen = this.sqlite.prepare(
        `INSERT OR IGNORE INTO sync_run_seen_tweets (run_id, tweet_id, remote_position)
         VALUES (?, ?, ?)`,
      );
      const uniqueBookmarks: { bookmark: XBookmarkRecord; position: number }[] = [];
      for (const bookmark of page.bookmarks) {
        const inserted = insertSeen.run(runId, bookmark.tweetId, remotePosition);
        if (inserted.changes === 0) continue;
        uniqueBookmarks.push({ bookmark, position: remotePosition });
        remotePosition += 1;
      }

      const ids = uniqueBookmarks.map((row) => row.bookmark.tweetId);
      const existing = new Set<string>();
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const found = this.sqlite
          .prepare(`SELECT tweet_id FROM bookmarks WHERE tweet_id IN (${placeholders})`)
          .all(...ids) as { tweet_id: string }[];
        for (const row of found) existing.add(row.tweet_id);
      }

      const upsert = this.sqlite.prepare(`
        INSERT INTO bookmarks
          (tweet_id, full_text, author_name, author_handle, author_avatar,
           tweet_url, media_urls, media_metadata, quoted_tweet, bookmarked_at, synced_at,
           links, conversation_id, like_count, reply_count, retweet_count,
           quote_count, bookmark_count, impression_count,
           remote_present, removed_from_x_at,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, unixepoch(), unixepoch())
        ON CONFLICT(tweet_id) DO UPDATE SET
          full_text = excluded.full_text,
          author_name = excluded.author_name,
          author_handle = excluded.author_handle,
          author_avatar = excluded.author_avatar,
          tweet_url = excluded.tweet_url,
          media_urls = excluded.media_urls,
          media_metadata = excluded.media_metadata,
          quoted_tweet = excluded.quoted_tweet,
          bookmarked_at = excluded.bookmarked_at,
          synced_at = excluded.synced_at,
          -- COALESCE, not overwrite: an ingestion front-end that cannot supply
          -- these (the parked extension) must not erase what X already gave us.
          links = COALESCE(excluded.links, bookmarks.links),
          conversation_id = COALESCE(excluded.conversation_id, bookmarks.conversation_id),
          like_count = COALESCE(excluded.like_count, bookmarks.like_count),
          reply_count = COALESCE(excluded.reply_count, bookmarks.reply_count),
          retweet_count = COALESCE(excluded.retweet_count, bookmarks.retweet_count),
          quote_count = COALESCE(excluded.quote_count, bookmarks.quote_count),
          bookmark_count = COALESCE(excluded.bookmark_count, bookmarks.bookmark_count),
          impression_count = COALESCE(excluded.impression_count, bookmarks.impression_count),
          remote_present = 1,
          removed_from_x_at = NULL,
          updated_at = unixepoch()
      `);
      for (const row of uniqueBookmarks) {
        const item = row.bookmark;
        upsert.run(
          item.tweetId,
          item.fullText,
          item.authorName,
          item.authorHandle,
          item.authorAvatar,
          item.tweetUrl,
          item.mediaUrls,
          item.mediaMetadata,
          item.quotedTweet,
          item.tweetCreatedAt,
          now,
          item.links ?? null,
          item.conversationId ?? null,
          item.likeCount ?? null,
          item.replyCount ?? null,
          item.retweetCount ?? null,
          item.quoteCount ?? null,
          item.bookmarkCount ?? null,
          item.impressionCount ?? null,
        );
      }

      const inserted = uniqueBookmarks.filter((row) => !existing.has(row.bookmark.tweetId)).length;
      const existingCount = uniqueBookmarks.length - inserted;
      const knownPage = uniqueBookmarks.length > 0 && inserted === 0;
      const emptyPage = page.bookmarks.length === 0;
      this.sqlite
        .prepare(
          `INSERT INTO sync_run_pages
             (run_id, page_index, request_cursor_key, request_cursor, next_cursor,
              raw_bookmark_count, unique_bookmark_count, known_page, empty_page, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          runId,
          run.pages_fetched,
          requestCursorKey,
          requestCursor,
          page.nextCursor,
          page.bookmarks.length,
          uniqueBookmarks.length,
          knownPage ? 1 : 0,
          emptyPage ? 1 : 0,
          now,
        );
      this.sqlite
        .prepare(
          `UPDATE sync_runs
           SET pages_fetched = pages_fetched + 1,
               bookmarks_fetched = bookmarks_fetched + ?,
               bookmarks_inserted = bookmarks_inserted + ?,
               bookmarks_existing = bookmarks_existing + ?,
               skipped_tweet_count = skipped_tweet_count + ?,
               heartbeat_at = ?
           WHERE id = ? AND status = 'running'`,
        )
        .run(uniqueBookmarks.length, inserted, existingCount, page.skippedTweetCount, now, runId);

      return this.browserPageResult(runId, page.nextCursor, false);
    });

    return record.immediate();
  }

  completeRun(
    runId: number,
    stopReason: string,
    now: number,
    confirmation: ReconciliationConfirmation | null = null,
  ): SyncResult {
    const complete = this.sqlite.transaction(() => {
      const run = this.getRun(runId);
      if (run.status === 'success') {
        return { blocked: false as const, result: this.getRunResult(runId) };
      }
      if (run.status !== 'running') throw new SyncRunStateError(run);

      const seenRows = this.sqlite
        .prepare(
          `SELECT tweet_id FROM sync_run_seen_tweets WHERE run_id = ? ORDER BY remote_position`,
        )
        .all(runId) as { tweet_id: string }[];
      const observedCount = seenRows.length;
      const reconciliationFingerprint = createHash('sha256')
        .update(seenRows.map((row) => row.tweet_id).join('\n'))
        .digest('hex');
      const state = this.sqlite
        .prepare('SELECT * FROM sync_state WHERE id = 1')
        .get() as SyncStateRow;
      const suspiciousCountDrop =
        run.mode === 'full' &&
        run.baseline_remote_count >= MASS_ARCHIVE_MINIMUM_BASELINE &&
        observedCount < Math.ceil(run.baseline_remote_count * MASS_ARCHIVE_REMAINING_RATIO);
      const suspiciousSkippedItems =
        run.mode === 'full' &&
        run.skipped_tweet_count > Math.max(5, Math.ceil(Math.max(observedCount, 1) * 0.02));
      const isConfirmedRepeat =
        state.reconciliation_candidate_fingerprint === reconciliationFingerprint &&
        state.reconciliation_candidate_count === observedCount &&
        state.reconciliation_candidate_at !== null &&
        state.reconciliation_candidate_at >= now - RECONCILIATION_CONFIRMATION_SECONDS &&
        confirmation?.fingerprint === reconciliationFingerprint &&
        confirmation.observed_count === observedCount;

      if ((suspiciousCountDrop || suspiciousSkippedItems) && !isConfirmedRepeat) {
        const message =
          `Full sync saw ${observedCount} bookmarks versus the prior ${run.baseline_remote_count}; ` +
          'no bookmarks were archived. Explicit confirmation is required before reconciling this result.';
        this.sqlite
          .prepare(
            `UPDATE sync_runs
             SET status = 'quarantined', heartbeat_at = ?, finished_at = ?,
                 stop_reason = 'reconciliation_quarantined',
                 error_code = 'x_full_sync_anomaly', error_message = ?,
                 reconciliation_fingerprint = ?
             WHERE id = ? AND status = 'running'`,
          )
          .run(now, now, message, reconciliationFingerprint, runId);
        this.sqlite
          .prepare(
            `UPDATE sync_state
             SET last_error = ?, reconciliation_candidate_fingerprint = ?,
                 reconciliation_candidate_count = ?, reconciliation_candidate_at = ?,
                 updated_at = ?
             WHERE id = 1`,
          )
          .run(message, reconciliationFingerprint, observedCount, now, now);
        this.sqlite.prepare('DELETE FROM sync_run_seen_tweets WHERE run_id = ?').run(runId);
        return {
          blocked: true as const,
          run: this.getRun(runId),
          baselineCount: run.baseline_remote_count,
          observedCount,
        };
      }

      this.sqlite
        .prepare(
          `UPDATE bookmarks
           SET remote_order_run_id = ?,
               remote_order_position = (
                 SELECT seen.remote_position FROM sync_run_seen_tweets seen
                 WHERE seen.run_id = ? AND seen.tweet_id = bookmarks.tweet_id
               ),
               updated_at = unixepoch()
           WHERE EXISTS (
             SELECT 1 FROM sync_run_seen_tweets seen
             WHERE seen.run_id = ? AND seen.tweet_id = bookmarks.tweet_id
           )`,
        )
        .run(runId, runId, runId);

      let remoteRemoved = 0;
      if (run.mode === 'full') {
        const result = this.sqlite
          .prepare(
            `UPDATE bookmarks
             SET remote_present = 0, removed_from_x_at = ?, updated_at = unixepoch()
             WHERE remote_present = 1
               AND NOT EXISTS (
                 SELECT 1
                 FROM sync_run_seen_tweets seen
                 WHERE seen.run_id = ? AND seen.tweet_id = bookmarks.tweet_id
               )`,
          )
          .run(now, runId);
        remoteRemoved = result.changes;
      }

      this.sqlite
        .prepare(
          `UPDATE sync_runs
           SET status = 'success', heartbeat_at = ?, finished_at = ?, stop_reason = ?,
               remote_removed = ?, error_code = NULL, error_message = NULL
           WHERE id = ? AND status = 'running'`,
        )
        .run(now, now, stopReason, remoteRemoved, runId);
      this.sqlite
        .prepare(
          `UPDATE sync_runs SET reconciliation_fingerprint = ? WHERE id = ?`,
        )
        .run(reconciliationFingerprint, runId);
      this.sqlite
        .prepare(
          `INSERT INTO sync_state
             (id, last_successful_run_id, last_synced_at, last_full_synced_at, last_error, updated_at)
           VALUES (1, ?, ?, ?, NULL, ?)
           ON CONFLICT(id) DO UPDATE SET
             last_successful_run_id = excluded.last_successful_run_id,
             last_synced_at = excluded.last_synced_at,
             last_full_synced_at = CASE
               WHEN ? = 'full' THEN excluded.last_full_synced_at
               ELSE sync_state.last_full_synced_at
             END,
             last_error = NULL,
             reconciliation_candidate_fingerprint = CASE
               WHEN ? = 'full' THEN NULL ELSE sync_state.reconciliation_candidate_fingerprint END,
             reconciliation_candidate_count = CASE
               WHEN ? = 'full' THEN NULL ELSE sync_state.reconciliation_candidate_count END,
             reconciliation_candidate_at = CASE
               WHEN ? = 'full' THEN NULL ELSE sync_state.reconciliation_candidate_at END,
             updated_at = excluded.updated_at`,
        )
        .run(
          runId,
          now,
          run.mode === 'full' ? now : null,
          now,
          run.mode,
          run.mode,
          run.mode,
          run.mode,
        );
      this.sqlite
        .prepare(`DELETE FROM sync_run_seen_tweets WHERE run_id = ?`)
        .run(runId);

      return { blocked: false as const, result: this.getRunResult(runId) };
    });
    const result = complete.immediate();
    if (result.blocked) {
      throw new SyncReconciliationBlockedError(
        result.run,
        result.baselineCount,
        result.observedCount,
        result.run.reconciliation_fingerprint ?? '',
      );
    }
    return result.result;
  }

  failRun(runId: number, errorCode: string, errorMessage: string, now: number) {
    const safeCode = errorCode.slice(0, 100);
    const safeMessage = errorMessage.slice(0, 500);
    const fail = this.sqlite.transaction(() => {
      const run = this.getRun(runId);
      if (run.status !== 'running') return run;
      this.sqlite
        .prepare(
          `UPDATE sync_runs
           SET status = 'failed', heartbeat_at = ?, finished_at = ?, stop_reason = 'error',
               error_code = ?, error_message = ?
           WHERE id = ? AND status = 'running'`,
        )
        .run(now, now, safeCode, safeMessage, runId);
      this.sqlite
        .prepare(
          `INSERT INTO sync_state
             (id, last_successful_run_id, last_synced_at, last_full_synced_at, last_error, updated_at)
           VALUES (1, NULL, NULL, NULL, ?, ?)
           ON CONFLICT(id) DO UPDATE SET last_error = excluded.last_error, updated_at = excluded.updated_at`,
        )
        .run(safeMessage, now);
      this.sqlite
        .prepare(`DELETE FROM sync_run_seen_tweets WHERE run_id = ?`)
        .run(runId);
      return this.getRun(runId);
    });
    return fail.immediate();
  }

  getRun(runId: number) {
    const run = this.sqlite.prepare(`SELECT * FROM sync_runs WHERE id = ?`).get(runId) as
      | SyncRunSummary
      | undefined;
    if (!run) throw new SyncRunNotFoundError(runId);
    return run;
  }

  getRunResult(runId: number): SyncResult {
    return { ...this.getRun(runId), total_bookmarks: this.visibleBookmarkCount() };
  }

  getStatus(now = Math.floor(Date.now() / 1000)): DurableSyncStatus {
    const activeCandidate = this.sqlite
      .prepare(`SELECT * FROM sync_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1`)
      .get() as SyncRunSummary | undefined;
    const active = activeCandidate && activeCandidate.heartbeat_at >= now - STALE_RUN_SECONDS
      ? activeCandidate
      : null;
    const lastRun = this.sqlite
      .prepare(`SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1`)
      .get() as SyncRunSummary | undefined;
    const state = this.sqlite
      .prepare(`SELECT * FROM sync_state WHERE id = 1`)
      .get() as SyncStateRow | undefined;
    const interrupted = Boolean(activeCandidate && !active);

    return {
      in_progress: Boolean(active),
      last_synced_at: state?.last_synced_at ?? null,
      last_full_synced_at: state?.last_full_synced_at ?? null,
      total_bookmarks: this.visibleBookmarkCount(),
      last_error: interrupted
        ? 'The previous sync was interrupted before it finished.'
        : (state?.last_error ?? null),
      active_run: active,
      last_run: lastRun ?? null,
    };
  }

  private browserPageResult(
    runId: number,
    nextCursor: string | null,
    duplicateUpload: boolean,
  ): BrowserPageRecordResult {
    const recentPages = this.sqlite
      .prepare(
        `SELECT request_cursor, next_cursor, known_page, empty_page
         FROM sync_run_pages
         WHERE run_id = ?
         ORDER BY page_index DESC
         LIMIT 3`,
      )
      .all(runId) as StoredPageRow[];
    const consecutiveKnownPages = this.countConsecutive(recentPages, 'known_page');
    const consecutiveEmptyPages = this.countConsecutive(recentPages, 'empty_page');
    const repeatedCursor = Boolean(
      nextCursor !== null &&
        (recentPages[0]?.request_cursor === nextCursor ||
          this.sqlite
            .prepare(
              `SELECT 1 FROM sync_run_pages
               WHERE run_id = ? AND request_cursor_key = ?
               LIMIT 1`,
            )
            .get(runId, cursorKey(nextCursor))),
    );

    return {
      run: this.getRun(runId),
      nextCursor,
      consecutiveKnownPages,
      consecutiveEmptyPages,
      repeatedCursor,
      duplicateUpload,
    };
  }

  private countConsecutive(rows: StoredPageRow[], column: 'known_page' | 'empty_page') {
    let count = 0;
    for (const row of rows) {
      if (!row[column]) break;
      count += 1;
    }
    return count;
  }

  private visibleBookmarkCount() {
    return (
      this.sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM bookmarks
           WHERE remote_present = 1 AND hidden_at IS NULL`,
        )
        .get() as { count: number }
    ).count;
  }
}
