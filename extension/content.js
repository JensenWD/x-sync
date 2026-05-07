// ISOLATED world content script — runs on x.com at document_start.
// 1. Relays captured bookmarks from MAIN world (intercept.js) to the service worker
//    in small chunks to avoid message size limits
// 2. Auto-scrolls the bookmarks page when a sync is triggered

(function () {
  let scrolling = false;
  let scrollDone = false;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === '__X_SYNC_BOOKMARKS__') {
      const bookmarks = event.data.bookmarks;
      // Send one bookmark at a time to avoid chrome.runtime.sendMessage size limits
      for (const bookmark of bookmarks) {
        chrome.runtime.sendMessage({
          type: 'BOOKMARK',
          bookmark,
        }).catch(() => {});
      }
    }

    if (event.data?.type === '__X_SYNC_PAGE_EMPTY__') {
      scrollDone = true;
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'START_SCROLL') {
      if (scrolling) {
        sendResponse({ started: false, reason: 'already_scrolling' });
        return;
      }
      scrolling = true;
      scrollDone = false;
      autoScroll().then((result) => {
        chrome.runtime.sendMessage({ type: 'SCROLL_COMPLETE', ...result }).catch(() => {});
      });
      sendResponse({ started: true });
    }
  });

  async function autoScroll() {
    const SCROLL_DELAY = 1500;
    const MAX_SCROLLS = 500;
    let scrollCount = 0;
    let lastHeight = 0;
    let staleCount = 0;

    while (scrollCount < MAX_SCROLLS) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, SCROLL_DELAY));
      scrollCount++;

      if (scrollDone) break;

      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) {
        staleCount++;
        if (staleCount >= 3) break;
      } else {
        staleCount = 0;
      }
      lastHeight = newHeight;
    }

    scrolling = false;
    return { scrollCount, finished: scrollDone || staleCount >= 3 };
  }
})();
