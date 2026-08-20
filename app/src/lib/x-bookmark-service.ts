// Compatibility entry point for existing imports. Sync implementation is split by concern in x-sync/.
export {
  BrowserSyncError,
  failBrowserSync,
  getSyncStatus,
  ingestBrowserPage,
  startBrowserSync,
  SyncAlreadyRunningError,
  SyncRunNotFoundError,
} from './x-sync/service';
export type { SyncMode } from './x-sync/types';
