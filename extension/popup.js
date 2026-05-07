const btn = document.getElementById('sync-btn');
const btnText = document.getElementById('btn-text');
const statusEl = document.getElementById('status');
const lastSyncedEl = document.getElementById('last-synced');

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
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

function updateLastSynced() {
  chrome.storage.local.get(['lastSyncAt'], (result) => {
    if (result.lastSyncAt) {
      lastSyncedEl.textContent = `Last synced: ${formatRelativeTime(result.lastSyncAt)}`;
    } else {
      lastSyncedEl.textContent = '';
    }
  });
}

updateLastSynced();

btn.addEventListener('click', () => {
  setLoading(true);
  setStatus('Connecting to dashboard…', 'info');

  chrome.runtime.sendMessage({ type: 'SYNC_BOOKMARKS' }, (response) => {
    setLoading(false);

    if (chrome.runtime.lastError) {
      setStatus('✗ Extension error: ' + chrome.runtime.lastError.message, 'error');
      return;
    }

    if (!response) {
      setStatus('✗ No response — try reloading the extension.', 'error');
      return;
    }

    if (response.success) {
      const now = Date.now();
      chrome.storage.local.set({ lastSyncAt: now });
      lastSyncedEl.textContent = 'Last synced: just now';

      if (response.alreadyRunning) {
        setStatus('↺ Already syncing — check the dashboard', 'info');
      } else {
        setStatus('✓ Done! Open the dashboard to browse', 'success');
      }
    } else {
      setStatus('✗ ' + (response.error || 'Unknown error'), 'error');
    }
  });
});
