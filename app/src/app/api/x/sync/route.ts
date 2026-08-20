import {
  BrowserSyncError,
  failBrowserSync,
  ingestBrowserPage,
  startBrowserSync,
  SyncAlreadyRunningError,
  SyncRunNotFoundError,
  type SyncMode,
} from '@/lib/x-bookmark-service';
import { syncOfficialBookmarks } from '@/lib/x-api/sync';
import { NextRequest } from 'next/server';
import type { ReconciliationConfirmation } from '@/lib/x-sync/types';

export const maxDuration = 300;

const MODES = new Set<SyncMode>(['auto', 'incremental', 'full']);
const MAX_PAGE_BODY_BYTES = 16 * 1024 * 1024;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRunId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isCursor(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 10_000);
}

function isSafeCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_]{1,100}$/.test(value);
}

function reconciliationConfirmation(value: unknown): ReconciliationConfirmation | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) throw new Error('reconciliation_confirmation must be an object');
  const unknown = Object.keys(value).find(
    (key) => key !== 'fingerprint' && key !== 'observed_count',
  );
  if (unknown) throw new Error(`Unknown reconciliation_confirmation field: ${unknown}`);
  if (
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.fingerprint) ||
    !Number.isSafeInteger(value.observed_count) ||
    Number(value.observed_count) < 0
  ) {
    throw new Error(
      'reconciliation_confirmation requires a SHA-256 fingerprint and non-negative observed_count',
    );
  }
  return {
    fingerprint: value.fingerprint,
    observed_count: Number(value.observed_count),
  };
}

export async function POST(req: NextRequest) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ status: 'error', error: 'Content-Type must be application/json' }, 415);
  }
  const contentLength = Number.parseInt(req.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_PAGE_BODY_BYTES) {
    return json({ status: 'error', code: 'page_too_large', error: 'Bookmark page is too large' }, 413);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ status: 'error', error: 'Invalid JSON body' }, 400);
  }
  if (!isObject(body)) return json({ status: 'error', error: 'Invalid request body' }, 400);

  const action = body.action;
  if (action === undefined && ('auth_token' in body || 'ct0' in body)) {
    return json(
      {
        status: 'error',
        code: 'extension_outdated',
        error: 'This extension is outdated. Install the browser-assisted sync version.',
      },
      426,
    );
  }

  try {
    if (action === 'official') {
      const requestedMode = body.mode ?? 'auto';
      if (typeof requestedMode !== 'string' || !MODES.has(requestedMode as SyncMode)) {
        return json({ status: 'error', error: 'mode must be auto, incremental, or full' }, 400);
      }
      let confirmation: ReconciliationConfirmation | null;
      try {
        confirmation = reconciliationConfirmation(body.reconciliation_confirmation);
      } catch (error) {
        return json(
          { status: 'error', error: error instanceof Error ? error.message : 'Invalid confirmation' },
          400,
        );
      }
      if (confirmation && requestedMode !== 'full') {
        return json(
          { status: 'error', error: 'reconciliation_confirmation is only valid for full sync' },
          400,
        );
      }
      const run = await syncOfficialBookmarks(requestedMode as SyncMode, confirmation);
      return json({ status: 'success', run });
    }

    if (action === 'start') {
      const requestedMode = body.mode ?? 'auto';
      if (typeof requestedMode !== 'string' || !MODES.has(requestedMode as SyncMode)) {
        return json({ status: 'error', error: 'mode must be auto, incremental, or full' }, 400);
      }
      return json({ status: 'ready', run: startBrowserSync(requestedMode as SyncMode) });
    }

    if (action === 'page') {
      if (!isRunId(body.run_id) || !isCursor(body.cursor) || !('payload' in body)) {
        return json(
          { status: 'error', error: 'run_id, cursor, and payload are required' },
          400,
        );
      }
      const result = ingestBrowserPage(body.run_id, body.cursor, body.payload);
      return json(result);
    }

    if (action === 'fail') {
      if (!isRunId(body.run_id) || !isSafeCode(body.code) || typeof body.error !== 'string') {
        return json({ status: 'error', error: 'run_id, code, and error are required' }, 400);
      }
      const run = failBrowserSync(body.run_id, body.code, body.error);
      return json({ status: run.status, run });
    }

    return json({ status: 'error', error: 'action must be official, start, page, or fail' }, 400);
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return json({ status: 'already_running', run: error.run }, 409);
    }
    if (error instanceof SyncRunNotFoundError) {
      return json({ status: 'error', code: 'sync_run_not_found', error: error.message }, 404);
    }
    if (error instanceof BrowserSyncError) {
      return json(
        { status: 'error', code: error.code, error: error.message, details: error.details },
        error.httpStatus,
      );
    }
    return json({ status: 'error', code: 'sync_failed', error: 'Bookmark sync failed.' }, 500);
  }
}
