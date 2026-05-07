const DASHBOARD_URL = 'http://localhost:3000';
const X_DOMAINS = ['x.com', 'twitter.com'];

async function getAllCookies(domain) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain }, (cookies) => resolve(cookies || []));
  });
}

async function getXCookies() {
  for (const domain of X_DOMAINS) {
    const all = await getAllCookies(domain);
    console.log(
      `[x-sync] cookies for ${domain}:`,
      all.map((c) => ({ name: c.name, domain: c.domain, httpOnly: c.httpOnly, len: c.value.length })),
    );
    const authToken = all.find((c) => c.name === 'auth_token')?.value ?? null;
    const ct0 = all.find((c) => c.name === 'ct0')?.value ?? null;
    if (authToken && ct0) {
      return { auth_token: authToken, ct0, source_domain: domain };
    }
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'SYNC_BOOKMARKS') return false;

  // Return true to keep the message channel open for async sendResponse
  (async () => {
    try {
      const cookies = await getXCookies();
      if (!cookies) {
        sendResponse({
          success: false,
          error: 'Could not find X session cookies. Make sure you are logged into x.com.',
        });
        return;
      }

      const res = await fetch(`${DASHBOARD_URL}/api/x/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cookies),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 || res.status === 401) {
          sendResponse({
            success: false,
            error: 'Session expired. Please log into X and try again.',
          });
        } else {
          sendResponse({
            success: false,
            error: body.error || `Server error (${res.status})`,
          });
        }
        return;
      }

      const data = await res.json();
      if (data.status === 'already_running') {
        sendResponse({ success: true, alreadyRunning: true });
      } else {
        sendResponse({ success: true, synced_count: data.synced_count });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('fetch') || message.includes('network') || message.includes('Failed')) {
        sendResponse({
          success: false,
          error: 'Cannot reach the dashboard. Make sure the Next.js app is running on localhost:3000.',
        });
      } else {
        sendResponse({ success: false, error: message });
      }
    }
  })();

  return true; // keep channel open
});
