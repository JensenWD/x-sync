import 'server-only';
import {
  BrowserSyncError,
  failBrowserSync,
  ingestParsedPage,
  startBrowserSync,
} from '@/lib/x-sync/service';
import type { ReconciliationConfirmation, SyncMode } from '@/lib/x-sync/types';
import { bookmarkRequestUrl } from './bookmark-request';
import { getOfficialApiError, parseOfficialBookmarkPage } from './parser';
import {
  getConnectedXUserId,
  getValidXAccessToken,
  refreshXAccessToken,
} from './oauth';
import { fetchWithDeadline } from './fetch';
import { createVerifiedDatabaseBackup } from '@/lib/db/backup';
import { rawDb } from '@/lib/db/client';

class XApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'XApiRequestError';
  }
}

async function fetchPage(userId: string, cursor: string | null, accessToken: string) {
  const response = await fetchWithDeadline(bookmarkRequestUrl(userId, cursor), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  }, 2);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = getOfficialApiError(payload);
    if (response.status === 401) {
      throw new XApiRequestError('x_oauth_rejected', 'X rejected the saved authorization.', 401);
    }
    if (response.status === 402 || response.status === 403) {
      throw new XApiRequestError(
        'x_api_access_denied',
        detail ?? 'X denied bookmark access. Check API credits and bookmark.read permission.',
        response.status,
      );
    }
    if (response.status === 429) {
      throw new XApiRequestError(
        'x_rate_limited',
        'X rate-limited the bookmark import. Retry after the current 15-minute window.',
        429,
      );
    }
    throw new XApiRequestError(
      'x_api_error',
      detail ?? `X bookmark API returned HTTP ${response.status}.`,
      response.status,
    );
  }

  const page = parseOfficialBookmarkPage(payload);
  if (!page.timelineFound) {
    throw new XApiRequestError(
      'x_api_payload_changed',
      getOfficialApiError(payload) ?? 'X returned an unexpected bookmark API payload.',
      502,
    );
  }
  return page;
}

export async function syncOfficialBookmarks(
  requestedMode: SyncMode,
  reconciliationConfirmation: ReconciliationConfirmation | null = null,
) {
  const userId = getConnectedXUserId();
  let accessToken = await getValidXAccessToken();
  const run = startBrowserSync(requestedMode);
  let cursor: string | null = null;

  try {
    if (run.mode === 'full') await createVerifiedDatabaseBackup(rawDb, 'pre-full-sync');
    while (true) {
      let page;
      try {
        page = await fetchPage(userId, cursor, accessToken);
      } catch (error) {
        if (!(error instanceof XApiRequestError) || error.status !== 401) throw error;
        accessToken = await refreshXAccessToken();
        page = await fetchPage(userId, cursor, accessToken);
      }

      const result = ingestParsedPage(run.id, cursor, page, reconciliationConfirmation);
      if (result.status === 'success') return result.run;
      cursor = result.cursor;
    }
  } catch (error) {
    if (error instanceof BrowserSyncError) throw error;
    const code = error instanceof XApiRequestError ? error.code : 'x_api_sync_failed';
    const message = error instanceof Error ? error.message : 'Official X bookmark sync failed.';
    failBrowserSync(run.id, code, message);
    throw new BrowserSyncError(
      code,
      message,
      error instanceof XApiRequestError ? error.status : 502,
    );
  }
}
