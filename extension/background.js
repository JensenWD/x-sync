const DASHBOARD_URL = 'https://agentmac.tailf5c3be.ts.net:3000';
const BOOKMARKS_URL = 'https://x.com/i/bookmarks';
const DASHBOARD_TIMEOUT_MS = 60_000;
const X_PAGE_TIMEOUT_MS = 45_000;
const CAPTURE_GLOBAL = '__JOHNNY_X_BOOKMARK_CAPTURE__';

let activeSyncPromise = null;

class ExtensionSyncError extends Error {
  constructor(code, message, keepXTab = false) {
    super(message);
    this.name = 'ExtensionSyncError';
    this.code = code;
    this.keepXTab = keepXTab;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dashboardFetch(path, options = {}, timeoutMs = DASHBOARD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${DASHBOARD_URL}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function dashboardRequest(body) {
  const response = await dashboardFetch('/api/x/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { httpStatus: response.status, payload: await readJson(response) };
}

async function setBadge(text, color, title) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  if (title) await chrome.action.setTitle({ title });
}

async function waitForTabLoad(tabId, timeoutMs = 30_000) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === 'complete') return current;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new ExtensionSyncError('x_tab_timeout', 'X did not finish opening.', true));
    }, timeoutMs);
    function onUpdated(updatedTabId, changeInfo, tab) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(tab);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function callCapture(tabId, command, argument = null) {
  let results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (globalKey, method, value) => {
      const capture = globalThis[globalKey];
      if (!capture || typeof capture[method] !== 'function') return { bridgeMissing: true };
      return capture[method](value);
    },
    args: [CAPTURE_GLOBAL, command, argument],
  });
  if (!results[0]?.result?.bridgeMissing) return results[0]?.result ?? null;

  // This fallback handles an already-open tab after an extension reload. New
  // sync tabs receive the same script at document_start through the manifest.
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['page-capture.js'],
  });
  results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (globalKey, method, value) => globalThis[globalKey]?.[method]?.(value) ?? null,
    args: [CAPTURE_GLOBAL, command, argument],
  });
  return results[0]?.result ?? null;
}

function isLoginUrl(url) {
  return typeof url === 'string' && /\/i\/flow\/(login|signup)|\/login(?:\?|$)/.test(url);
}

async function waitForCapturedPage(tabId, cursor) {
  const deadline = Date.now() + X_PAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const page = await callCapture(tabId, 'takePage', cursor);
    if (page) return page;

    const tab = await chrome.tabs.get(tabId);
    if (isLoginUrl(tab.url)) {
      throw new ExtensionSyncError(
        'missing_x_session',
        'Log into X in the opened tab, then click Sync Bookmarks again.',
        true,
      );
    }
    await callCapture(tabId, 'scrollForMore');
    await delay(600);
  }
  throw new ExtensionSyncError(
    cursor === null ? 'x_bookmarks_not_ready' : 'x_page_timeout',
    cursor === null
      ? 'X did not load the Bookmarks timeline. Check the opened X tab and retry.'
      : 'X stopped loading the next bookmark page. Sync stopped safely.',
    true,
  );
}

function assertXPage(page) {
  if (page.httpStatus >= 200 && page.httpStatus < 300 && page.payload) return;
  if (page.httpStatus === 401 || page.httpStatus === 403) {
    throw new ExtensionSyncError(
      'x_session_rejected',
      'X rejected the active browser session. Log into X and retry.',
      true,
    );
  }
  if (page.httpStatus === 429) {
    throw new ExtensionSyncError(
      'x_rate_limited',
      'X rate-limited the Bookmarks page. Wait a few minutes and retry.',
      true,
    );
  }
  throw new ExtensionSyncError(
    'x_upstream_error',
    `X returned HTTP ${page.httpStatus || 'unknown'} while loading bookmarks.`,
    true,
  );
}

async function reportFailure(runId, error) {
  if (!runId) return;
  try {
    await dashboardRequest({
      action: 'fail',
      run_id: runId,
      code: error.code || 'extension_sync_failed',
      error: error.message || 'Browser-assisted sync failed.',
    });
  } catch {
    // The durable run will be marked interrupted if AgentMac became unreachable.
  }
}

async function runBrowserSync(mode) {
  let tabId = null;
  let runId = null;
  let preserveXTab = false;
  try {
    await setBadge('…', '#1d9bf0', 'X Bookmark Sync — opening X');
    const tab = await chrome.tabs.create({ url: BOOKMARKS_URL, active: false });
    if (!tab.id) throw new ExtensionSyncError('x_tab_failed', 'Chrome could not open X.');
    tabId = tab.id;
    await waitForTabLoad(tabId);

    let xPage = await waitForCapturedPage(tabId, null);
    assertXPage(xPage);

    const start = await dashboardRequest({ action: 'start', mode });
    if (start.payload?.status === 'already_running') {
      await setBadge('↻', '#1d9bf0', 'X Bookmark Sync — already running');
      return { success: true, alreadyRunning: true, run: start.payload.run || null };
    }
    if (start.httpStatus < 200 || start.httpStatus >= 300 || start.payload?.status !== 'ready') {
      throw new ExtensionSyncError(
        start.payload?.code || 'dashboard_error',
        start.payload?.error || `Dashboard returned HTTP ${start.httpStatus}`,
      );
    }
    runId = start.payload.run.id;
    let cursor = null;

    while (true) {
      assertXPage(xPage);
      const uploaded = await dashboardRequest({
        action: 'page',
        run_id: runId,
        cursor,
        payload: xPage.payload,
      });
      if (uploaded.httpStatus < 200 || uploaded.httpStatus >= 300) {
        throw new ExtensionSyncError(
          uploaded.payload?.code || 'dashboard_error',
          uploaded.payload?.error || `Dashboard returned HTTP ${uploaded.httpStatus}`,
          uploaded.payload?.code?.startsWith('x_'),
        );
      }
      if (uploaded.payload?.status === 'success') {
        await setBadge('✓', '#00ba7c', 'X Bookmark Sync — complete');
        return { success: true, alreadyRunning: false, run: uploaded.payload.run };
      }
      if (uploaded.payload?.status !== 'continue' || !uploaded.payload.cursor) {
        throw new ExtensionSyncError('invalid_dashboard_response', 'Dashboard returned an invalid sync response.');
      }

      cursor = uploaded.payload.cursor;
      const pages = uploaded.payload.run?.pages_fetched || 0;
      await setBadge(String(Math.min(pages, 99)), '#1d9bf0', `X Bookmark Sync — ${pages} pages`);
      await delay(300);
      xPage = await waitForCapturedPage(tabId, cursor);
    }
  } catch (error) {
    const safeError = error instanceof ExtensionSyncError
      ? error
      : new ExtensionSyncError(
          error?.name === 'AbortError' ? 'dashboard_timeout' : 'extension_sync_failed',
          error?.name === 'AbortError'
            ? 'AgentMac did not respond in time.'
            : 'Browser-assisted bookmark sync failed.',
        );
    await reportFailure(runId, safeError);
    await setBadge('!', '#f4212e', `X Bookmark Sync — ${safeError.message}`);
    if (tabId && safeError.keepXTab) {
      preserveXTab = true;
      try {
        await chrome.tabs.update(tabId, { active: true });
      } catch {}
    }
    return { success: false, code: safeError.code, error: safeError.message };
  } finally {
    if (tabId && !preserveXTab) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {}
    }
  }
}

async function handleSync(mode) {
  if (activeSyncPromise) {
    const status = await handleStatus();
    return {
      success: true,
      alreadyRunning: true,
      run: status.success ? status.status.active_run : null,
    };
  }
  activeSyncPromise = runBrowserSync(mode);
  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

async function handleStatus() {
  try {
    const response = await dashboardFetch('/api/sync/status', {}, 10_000);
    const payload = await readJson(response);
    if (!response.ok || !payload) {
      return { success: false, error: `Dashboard returned HTTP ${response.status}` };
    }
    return { success: true, status: payload };
  } catch (error) {
    return {
      success: false,
      error: error?.name === 'AbortError'
        ? 'Dashboard status timed out.'
        : 'Cannot reach the dashboard. Check Tailscale and AgentMac.',
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!['SYNC_BOOKMARKS', 'GET_SYNC_STATUS'].includes(message.type)) return false;

  (async () => {
    const result = message.type === 'GET_SYNC_STATUS'
      ? await handleStatus()
      : await handleSync(message.mode === 'full' ? 'full' : 'auto');
    sendResponse(result);
  })();

  return true;
});
