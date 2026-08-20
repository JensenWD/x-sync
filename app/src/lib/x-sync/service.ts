import 'server-only';
import { rawDb } from '@/lib/db/client';
import { getGraphqlErrorMessage, parseBookmarkTimeline } from './parser';
import {
  BookmarkSyncStore,
  shouldStopIncremental,
  SyncAlreadyRunningError,
  SyncCursorMismatchError,
  SyncRunNotFoundError,
  SyncReconciliationBlockedError,
  SyncRunStateError,
} from './store';
import type { BrowserSyncPageResult, ParsedTimelinePage, SyncMode } from './types';

const MAX_PAGES = 2_000;
const MAX_EMPTY_PAGES_WITH_CURSOR = 3;

export class BrowserSyncError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 502,
  ) {
    super(message);
    this.name = 'BrowserSyncError';
  }
}

export { SyncAlreadyRunningError, SyncRunNotFoundError };

function now() {
  return Math.floor(Date.now() / 1000);
}

function failAndThrow(
  store: BookmarkSyncStore,
  runId: number,
  code: string,
  message: string,
  httpStatus = 502,
): never {
  store.failRun(runId, code, message, now());
  throw new BrowserSyncError(code, message, httpStatus);
}

export function getSyncStatus() {
  return new BookmarkSyncStore(rawDb).getStatus();
}

export function startBrowserSync(requestedMode: SyncMode) {
  return new BookmarkSyncStore(rawDb).startRun(requestedMode, now());
}

export function failBrowserSync(runId: number, code: string, message: string) {
  return new BookmarkSyncStore(rawDb).failRun(runId, code, message, now());
}

export function ingestBrowserPage(
  runId: number,
  requestCursor: string | null,
  payload: unknown,
): BrowserSyncPageResult {
  const store = new BookmarkSyncStore(rawDb);
  const currentRun = store.getRun(runId);
  if (currentRun.status === 'success') {
    return { status: 'success', run: store.getRunResult(runId) };
  }
  if (currentRun.status === 'failed') {
    throw new BrowserSyncError(
      currentRun.error_code ?? 'sync_failed',
      currentRun.error_message ?? 'Bookmark sync failed.',
      409,
    );
  }

  const graphqlError = getGraphqlErrorMessage(payload);
  if (graphqlError) {
    const rejected = /auth|session|login|permission/i.test(graphqlError);
    failAndThrow(
      store,
      runId,
      rejected ? 'x_session_rejected' : 'x_graphql_error',
      rejected
        ? 'X rejected the active browser session. Log into x.com and retry.'
        : 'X returned a GraphQL error while loading bookmarks.',
      rejected ? 401 : 502,
    );
  }

  const page = parseBookmarkTimeline(payload);
  if (!page.timelineFound) {
    failAndThrow(
      store,
      runId,
      'x_payload_changed',
      'X returned an unexpected bookmarks payload; sync stopped safely.',
    );
  }

  return ingestParsedPage(runId, requestCursor, page);
}

export function ingestParsedPage(
  runId: number,
  requestCursor: string | null,
  page: ParsedTimelinePage,
): BrowserSyncPageResult {
  const store = new BookmarkSyncStore(rawDb);
  const currentRun = store.getRun(runId);
  if (currentRun.status === 'success') {
    return { status: 'success', run: store.getRunResult(runId) };
  }
  if (currentRun.status === 'failed') {
    throw new BrowserSyncError(
      currentRun.error_code ?? 'sync_failed',
      currentRun.error_message ?? 'Bookmark sync failed.',
      409,
    );
  }

  let pageResult;
  try {
    pageResult = store.recordBrowserPage(runId, requestCursor, page, now());
  } catch (error) {
    if (error instanceof SyncCursorMismatchError) {
      failAndThrow(
        store,
        runId,
        'x_cursor_mismatch',
        'X loaded bookmark pages out of order; sync stopped safely.',
      );
    }
    if (error instanceof SyncRunStateError && error.run.status === 'success') {
      return { status: 'success', run: store.getRunResult(runId) };
    }
    throw error;
  }

  if (!pageResult.nextCursor) {
    try {
      return {
        status: 'success',
        run: store.completeRun(runId, 'end_of_timeline', now()),
      };
    } catch (error) {
      if (error instanceof SyncReconciliationBlockedError) {
        throw new BrowserSyncError('x_full_sync_anomaly', error.message, 409);
      }
      throw error;
    }
  }
  if (pageResult.repeatedCursor) {
    failAndThrow(
      store,
      runId,
      'x_repeated_cursor',
      'X repeated a timeline cursor; sync stopped safely.',
    );
  }
  if (pageResult.consecutiveEmptyPages >= MAX_EMPTY_PAGES_WITH_CURSOR) {
    failAndThrow(
      store,
      runId,
      'x_unparseable_pages',
      'X returned three bookmark pages that could not be parsed; sync stopped safely.',
    );
  }
  if (
    pageResult.run.mode === 'incremental' &&
    shouldStopIncremental(pageResult.consecutiveKnownPages)
  ) {
    return {
      status: 'success',
      run: store.completeRun(runId, 'known_boundary', now()),
    };
  }
  if (pageResult.run.pages_fetched >= MAX_PAGES) {
    failAndThrow(
      store,
      runId,
      'x_page_limit_reached',
      `Sync reached the ${MAX_PAGES}-page safety limit before X reached the end of the timeline.`,
    );
  }

  return {
    status: 'continue',
    run: pageResult.run,
    cursor: pageResult.nextCursor,
  };
}
