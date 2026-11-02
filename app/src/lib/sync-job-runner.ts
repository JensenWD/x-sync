import type { SyncJob, SyncRun } from '../types';
import type { AutoTagResult } from './auto-tag';
import { type JobRequest, SyncJobStore } from './sync-jobs';

export interface JobHandlers {
  sync: (request: JobRequest, onStart: (id: number) => void) => Promise<SyncRun>;
  notes: () => Promise<unknown>;
  organize: (progress: (done: number, total: number) => void) => Promise<AutoTagResult>;
}

/** No request/browser lifetime dependency. The worker owns this entire pipeline. */
export async function executeSyncJob(store: SyncJobStore, job: SyncJob, owner: string, handlers: JobHandlers) {
  const result = job.result ?? { sync: null, auto_tag: null };
  try {
    if (job.stage === 'importing') {
      result.sync = await handlers.sync(store.request(job.id), (id) => store.update(job.id, owner, { sync_run_id: id }));
      store.update(job.id, owner, { stage: 'notes', result_json: JSON.stringify(result) });
    }
    if (job.stage === 'importing' || job.stage === 'notes') {
      try { result.community_notes = await handlers.notes(); }
      catch { result.community_notes = { status: 'failed', error: 'Community Notes refresh failed. Saved bookmarks are safe.' }; }
      store.update(job.id, owner, { stage: 'organizing', result_json: JSON.stringify(result) });
    }
    try {
      result.auto_tag = await handlers.organize((done, total) => store.update(job.id, owner, {
        progress_done: job.progress_done + done, progress_total: job.progress_done + total,
      }));
    } catch {
      // Do not publish raw model output or CLI errors into the UI/log.
      result.auto_tag = { status: 'failed', queued: store.get(job.id).progress_total,
        tagged: store.get(job.id).progress_done, assignments: 0, model: null,
        error: 'Automatic organization could not finish. Retry organization to continue without calling X.' };
    }
    store.update(job.id, owner, { status: result.auto_tag.status === 'failed' ? 'partial' : 'success',
      stage: 'complete', result_json: JSON.stringify(result) });
  } catch (error) {
    const known = error as { code?: unknown; message?: unknown; details?: unknown };
    const code = typeof known.code === 'string' ? known.code.slice(0, 100) : 'sync_job_failed';
    store.update(job.id, owner, { status: 'failed', error_code: code,
      error_message: typeof known.code === 'string' && typeof known.message === 'string'
        ? known.message.slice(0, 500) : 'Bookmark import failed. Saved bookmarks are safe; open sync to retry.',
      error_details_json: JSON.stringify(code === 'x_full_sync_anomaly' ? known.details ?? null : null),
      result_json: JSON.stringify(result) });
  }
}
