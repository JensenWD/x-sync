import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { SyncJob } from '../types';
import type { ReconciliationConfirmation, SyncMode } from './x-sync/types';

export interface JobRequest {
  action: 'official' | 'organize';
  mode: SyncMode;
  reconciliation_confirmation: ReconciliationConfirmation | null;
}

const active = "status IN ('queued', 'running')";
const now = () => Math.floor(Date.now() / 1000);

export class SyncJobStore {
  constructor(private sqlite: Database.Database) {}

  get(id: number): SyncJob {
    const row = this.sqlite.prepare(`SELECT id, status, stage, sync_run_id, progress_done, progress_total,
      created_at, updated_at, error_code, error_message, result_json, error_details_json FROM sync_jobs WHERE id = ?`).get(id) as
      (Omit<SyncJob, 'result' | 'error_details'> & { result_json: string | null; error_details_json: string | null }) | undefined;
    if (!row) throw new Error('Sync job not found');
    const { result_json, error_details_json, ...job } = row;
    return { ...job, result: result_json ? JSON.parse(result_json) : null,
      error_details: error_details_json ? JSON.parse(error_details_json) : null };
  }

  latest() {
    const row = this.sqlite.prepare('SELECT id FROM sync_jobs ORDER BY id DESC LIMIT 1').get() as { id: number } | undefined;
    return row ? this.get(row.id) : null;
  }

  enqueue(requestId: string, request: JobRequest) {
    const input = JSON.stringify(request);
    const hash = createHash('sha256').update(input).digest('hex');
    return this.sqlite.transaction(() => {
      const prior = this.sqlite.prepare('SELECT id, request_hash FROM sync_jobs WHERE request_id = ?').get(requestId) as
        { id: number; request_hash: string } | undefined;
      if (prior) {
        if (prior.request_hash !== hash) throw new Error('Request ID was already used for a different job');
        return this.get(prior.id);
      }
      const existing = this.sqlite.prepare(`SELECT id FROM sync_jobs WHERE ${active} LIMIT 1`).get() as { id: number } | undefined;
      if (existing) return this.get(existing.id);
      // Do not overlap with the parked extension or a legacy importer.
      const legacy = this.sqlite.prepare("SELECT id FROM sync_runs WHERE status = 'running' AND heartbeat_at >= ? LIMIT 1").get(now() - 600);
      if (legacy) throw new Error('A bookmark import is already running');
      const timestamp = now();
      const inserted = this.sqlite.prepare(`INSERT INTO sync_jobs
        (request_id, request_hash, input_json, status, stage, created_at, updated_at)
        VALUES (?, ?, ?, 'queued', ?, ?, ?)`)
        .run(requestId, hash, input, request.action === 'organize' ? 'organizing' : 'importing', timestamp, timestamp);
      return this.get(Number(inserted.lastInsertRowid));
    }).immediate();
  }

  claim(owner: string) {
    return this.sqlite.transaction(() => {
      if (this.sqlite.prepare("SELECT id FROM sync_jobs WHERE status = 'running'").get()) return null;
      const row = this.sqlite.prepare("SELECT id FROM sync_jobs WHERE status = 'queued' ORDER BY id LIMIT 1").get() as { id: number } | undefined;
      if (!row) return null;
      this.sqlite.prepare("UPDATE sync_jobs SET status = 'running', owner = ?, updated_at = ? WHERE id = ?")
        .run(owner, now(), row.id);
      return this.get(row.id);
    }).immediate();
  }

  request(id: number): JobRequest {
    return JSON.parse((this.sqlite.prepare('SELECT input_json FROM sync_jobs WHERE id = ?').get(id) as { input_json: string }).input_json);
  }

  update(id: number, owner: string, patch: Partial<Pick<SyncJob,
    'status' | 'stage' | 'sync_run_id' | 'progress_done' | 'progress_total' | 'error_code' | 'error_message'>> &
    { result_json?: string; error_details_json?: string }) {
    const fields = Object.entries(patch);
    const allowed = new Set(['status', 'stage', 'sync_run_id', 'progress_done', 'progress_total',
      'error_code', 'error_message', 'result_json', 'error_details_json']);
    if (fields.some(([key]) => !allowed.has(key))) throw new Error('Unknown job update field');
    const result = this.sqlite.prepare(`UPDATE sync_jobs SET ${fields.map(([key]) => `${key} = ?`).concat('updated_at = ?').join(', ')}
      WHERE id = ? AND owner = ? AND status = 'running'`)
      .run(...fields.map(([, value]) => value ?? null), now(), id, owner);
    if (!result.changes) throw new Error('Sync job lease was lost');
  }

  heartbeat(id: number, owner: string) { this.update(id, owner, {}); }

  /** Only the worker recovers expired leases. Never replay an uncertain paid import. */
  recover(recoverImport: (job: SyncJob) => string | null, timestamp = now()) {
    this.sqlite.transaction(() => {
      const rows = this.sqlite.prepare("SELECT id FROM sync_jobs WHERE status = 'running' AND updated_at < ?")
        .all(timestamp - 60) as { id: number }[];
      for (const row of rows) {
        const job = this.get(row.id);
        if (job.stage === 'importing') {
          const completed = recoverImport(job);
          if (completed) {
            this.sqlite.prepare("UPDATE sync_jobs SET status = 'queued', stage = 'notes', result_json = ?, owner = NULL, updated_at = ? WHERE id = ?")
              .run(completed, timestamp, job.id);
          } else {
            this.sqlite.prepare(`UPDATE sync_jobs SET status = 'failed', owner = NULL, updated_at = ?,
              error_code = 'import_interrupted', error_message = 'Import interrupted by a server restart. Saved bookmarks are safe. Start a new sync to continue; X was not automatically called again.' WHERE id = ?`)
              .run(timestamp, job.id);
          }
        } else {
          this.sqlite.prepare("UPDATE sync_jobs SET status = 'queued', owner = NULL, updated_at = ? WHERE id = ?")
            .run(timestamp, job.id);
        }
      }
    }).immediate();
  }
}
