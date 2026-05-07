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

// Check if a sync is already in progress when popup opens
chrome.runtime.sendMessage({ type: 'GET_SYNC_STATE' }, (state) => {
  if (state?.active) {
    setLoading(true);
    setStatus(`Scrolling bookmarks… found ${state.count} so far`, 'info');
  }
});

// Listen for progress updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SYNC_PROGRESS') {
    setLoading(true);
    setStatus(`Scrolling bookmarks… found ${message.count} so far`, 'info');
  }

  if (message.type === 'SYNC_SAVING') {
    setStatus('Saving to dashboard…', 'info');
  }

  if (message.type === 'SYNC_COMPLETE') {
    setLoading(false);
    const now = Date.now();
    chrome.storage.local.set({ lastSyncAt: now });
    lastSyncedEl.textContent = 'Last synced: just now';
    const count = message.synced_count ?? 0;
    setStatus(`Synced ${count} bookmarks — open the dashboard to browse`, 'success');
  }

  if (message.type === 'SYNC_FAILED') {
    setLoading(false);
    setStatus(message.error || 'Unknown error', 'error');
  }
});

btn.addEventListener('click', () => {
  if (!chrome.runtime?.id) {
    setStatus('Extension context lost — please reload from chrome://extensions.', 'error');
    return;
  }

  setLoading(true);
  setStatus('Opening bookmarks page…', 'info');

  chrome.runtime.sendMessage({ type: 'SYNC_BOOKMARKS' }, (response) => {
    if (chrome.runtime.lastError) {
      setLoading(false);
      setStatus('Extension error: ' + chrome.runtime.lastError.message, 'error');
      return;
    }

    if (response?.status === 'already_running') {
      setStatus('Already syncing — scroll is in progress', 'info');
    }
  });
});
