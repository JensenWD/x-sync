const DASHBOARD_URL = 'http://localhost:3000';
const BOOKMARKS_URL = 'https://x.com/i/bookmarks';
const BATCH_SIZE = 200;

let syncActive = false;
let collectedBookmarks = [];

async function sendToDashboard(bookmarks) {
  let totalSynced = 0;
  for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
    const batch = bookmarks.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${DASHBOARD_URL}/api/x/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookmarks: batch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Dashboard error (${res.status})`);
    }
    const data = await res.json();
    totalSynced += data.synced_count ?? batch.length;
  }
  return totalSynced;
}

// Train + classify runs once at the end of a sync so we don't re-train per batch.
// Failure here doesn't fail the sync — the dashboard exposes a "Sparkles" button
// to re-trigger classification manually.
async function triggerAutoTag() {
  try {
    await fetch(`${DASHBOARD_URL}/api/bookmarks/auto-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (err) {
    console.warn('[x-sync] auto-tag request failed:', err);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BOOKMARK') {
    if (syncActive) {
      collectedBookmarks.push(message.bookmark);
      // Broadcast progress to popup (small message, just a number)
      chrome.runtime.sendMessage({
        type: 'SYNC_PROGRESS',
        count: collectedBookmarks.length,
      }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'SCROLL_COMPLETE') {
    handleScrollComplete();
    return false;
  }

  if (message.type === 'SYNC_BOOKMARKS') {
    if (syncActive) {
      sendResponse({ status: 'already_running' });
      return false;
    }
    startSync();
    sendResponse({ status: 'started' });
    return false;
  }

  if (message.type === 'GET_SYNC_STATE') {
    sendResponse({ active: syncActive, count: collectedBookmarks.length });
    return false;
  }
});

async function openBookmarksTab() {
  const existing = await chrome.tabs.query({ url: 'https://x.com/i/bookmarks*' });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.tabs.reload(existing[0].id);
    return existing[0].id;
  }

  const xTabs = await chrome.tabs.query({ url: 'https://x.com/*' });
  if (xTabs.length > 0) {
    await chrome.tabs.update(xTabs[0].id, { active: true, url: BOOKMARKS_URL });
    return xTabs[0].id;
  }

  const tab = await chrome.tabs.create({ url: BOOKMARKS_URL });
  return tab.id;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function startSync() {
  syncActive = true;
  collectedBookmarks = [];
  chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS', count: 0 }).catch(() => {});

  try {
    const tabId = await openBookmarksTab();
    await waitForTabLoad(tabId);
    await new Promise((r) => setTimeout(r, 3000));

    chrome.tabs.sendMessage(tabId, { type: 'START_SCROLL' }, (response) => {
      if (chrome.runtime.lastError) {
        syncActive = false;
        chrome.runtime.sendMessage({
          type: 'SYNC_FAILED',
          error: 'Could not start scrolling. Make sure you are logged into x.com.',
        }).catch(() => {});
      }
    });
  } catch (err) {
    syncActive = false;
    chrome.runtime.sendMessage({
      type: 'SYNC_FAILED',
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  }
}

async function handleScrollComplete() {
  if (!syncActive) return;

  const bookmarks = collectedBookmarks;
  if (bookmarks.length === 0) {
    syncActive = false;
    chrome.runtime.sendMessage({ type: 'SYNC_COMPLETE', synced_count: 0 }).catch(() => {});
    return;
  }

  try {
    chrome.runtime.sendMessage({ type: 'SYNC_SAVING' }).catch(() => {});
    const synced_count = await sendToDashboard(bookmarks);
    // Fire-and-forget: don't block sync completion on classification.
    triggerAutoTag();
    chrome.runtime.sendMessage({ type: 'SYNC_COMPLETE', synced_count }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'SYNC_FAILED',
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  } finally {
    syncActive = false;
    collectedBookmarks = [];
  }
}
