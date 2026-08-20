const btn = document.getElementById('sync-btn');
const btnText = document.getElementById('btn-text');
const statusEl = document.getElementById('status');
const lastSyncedEl = document.getElementById('last-synced');
const fullSyncEl = document.getElementById('full-sync');

function formatRelativeTime(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type || 'idle';
}

function setLoading(loading) {
  btn.disabled = loading;
  fullSyncEl.disabled = loading;
  if (loading) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    btnText.textContent = '';
    btnText.appendChild(spinner);
    btnText.append(' Syncing…');
  } else {
    btnText.textContent = 'Sync Bookmarks';
  }
}

function updateLastSynced(timestampSeconds) {
  if (!timestampSeconds) {
    lastSyncedEl.textContent = 'Never synced';
    return;
  }
  lastSyncedEl.textContent = `Last synced: ${formatRelativeTime(timestampSeconds * 1000)}`;
}

function loadStatus() {
  chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) return;
    updateLastSynced(response.status.last_synced_at);
    if (response.status.in_progress && response.status.active_run) {
      const run = response.status.active_run;
      setStatus(`Syncing… ${run.pages_fetched} page${run.pages_fetched === 1 ? '' : 's'} fetched`, 'info');
    } else if (response.status.last_error) {
      setStatus(response.status.last_error, 'error');
    }
  });
}

loadStatus();

btn.addEventListener('click', () => {
  setLoading(true);
  setStatus(
    fullSyncEl.checked
      ? 'Opening X and scrolling through all bookmarks…'
      : 'Opening X and checking for new bookmarks…',
    'info',
  );

  chrome.runtime.sendMessage(
    { type: 'SYNC_BOOKMARKS', mode: fullSyncEl.checked ? 'full' : 'auto' },
    (response) => {
      setLoading(false);
      if (chrome.runtime.lastError) {
        setStatus(`Extension error: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      if (!response) {
        setStatus('No response. Reload the extension and try again.', 'error');
        return;
      }
      if (!response.success) {
        setStatus(response.error || 'Bookmark sync failed.', 'error');
        return;
      }
      if (response.alreadyRunning) {
        const pages = response.run?.pages_fetched || 0;
        setStatus(`A sync is already running (${pages} page${pages === 1 ? '' : 's'} fetched).`, 'info');
        return;
      }

      updateLastSynced(response.run?.finished_at);
      setStatus(XSyncProtocol.runSummary(response.run), 'success');
    },
  );
});
