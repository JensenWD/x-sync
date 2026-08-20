(function installBookmarkCapture(root) {
  const GLOBAL_KEY = '__JOHNNY_X_BOOKMARK_CAPTURE__';
  const VERSION = '1.2.0';
  const MAX_QUEUED_PAGES = 20;

  function toUrl(value, base = 'https://x.com/') {
    try {
      return new URL(value, base);
    } catch {
      return null;
    }
  }

  function isBookmarkRequest(value, base) {
    const url = toUrl(value, base);
    return Boolean(
      url &&
        /\/i\/api\/graphql\/[^/]+\/Bookmarks$/.test(url.pathname),
    );
  }

  function requestCursor(value, base) {
    const url = toUrl(value, base);
    if (!url) return null;
    try {
      const variables = JSON.parse(url.searchParams.get('variables') || '{}');
      return typeof variables.cursor === 'string' && variables.cursor.length > 0
        ? variables.cursor
        : null;
    } catch {
      return null;
    }
  }

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { isBookmarkRequest, requestCursor };
    }
    return;
  }

  if (root[GLOBAL_KEY]?.version === VERSION) return;

  const queue = [];
  const capturedCursorKeys = new Set();
  const pageBase = root.location.href;

  function keyForCursor(cursor) {
    return cursor === null ? 'first-page' : `cursor:${cursor}`;
  }

  function capturePayload(requestUrl, httpStatus, payload) {
    const cursor = requestCursor(requestUrl, pageBase);
    const key = keyForCursor(cursor);
    if (capturedCursorKeys.has(key)) return;
    capturedCursorKeys.add(key);
    queue.push({ cursor, httpStatus, payload });
    if (queue.length > MAX_QUEUED_PAGES) queue.shift();
  }

  const nativeFetch = root.fetch;
  if (typeof nativeFetch === 'function') {
    root.fetch = function capturedFetch(...args) {
      const input = args[0];
      const requestUrl = typeof input === 'string' || input instanceof URL
        ? String(input)
        : input?.url;
      const result = Reflect.apply(nativeFetch, this, args);
      if (requestUrl && isBookmarkRequest(requestUrl, pageBase)) {
        Promise.resolve(result).then(
          (response) => {
            try {
              const copy = response.clone();
              void copy.json().then(
                (payload) => capturePayload(requestUrl, response.status, payload),
                () => {},
              );
            } catch {
              // Never interfere with X's own request if a response cannot be cloned.
            }
          },
          () => {},
        );
      }
      return result;
    };
  }

  const xhrPrototype = root.XMLHttpRequest?.prototype;
  if (xhrPrototype) {
    const nativeOpen = xhrPrototype.open;
    const nativeSend = xhrPrototype.send;
    const requestUrls = new WeakMap();

    xhrPrototype.open = function capturedOpen(method, url, ...rest) {
      if (String(method).toUpperCase() === 'GET') requestUrls.set(this, String(url));
      return Reflect.apply(nativeOpen, this, [method, url, ...rest]);
    };
    xhrPrototype.send = function capturedSend(...args) {
      const requestUrl = requestUrls.get(this);
      if (requestUrl && isBookmarkRequest(requestUrl, pageBase)) {
        this.addEventListener(
          'load',
          () => {
            try {
              const payload = this.responseType === 'json'
                ? this.response
                : JSON.parse(this.responseText);
              capturePayload(requestUrl, this.status, payload);
            } catch {
              // X still receives its untouched response.
            }
          },
          { once: true },
        );
      }
      return Reflect.apply(nativeSend, this, args);
    };
  }

  root[GLOBAL_KEY] = {
    version: VERSION,
    probe() {
      return {
        ready: true,
        url: root.location.href,
        queuedCursors: queue.map((page) => page.cursor),
      };
    },
    takePage(cursor) {
      const key = keyForCursor(cursor);
      const index = queue.findIndex((page) => keyForCursor(page.cursor) === key);
      if (index < 0) return null;
      return queue.splice(index, 1)[0];
    },
    scrollForMore() {
      const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
      const lastCell = cells[cells.length - 1];
      lastCell?.scrollIntoView({ block: 'end', inline: 'nearest' });
      const scrollingElement = document.scrollingElement || document.documentElement;
      root.scrollTo(0, scrollingElement.scrollHeight);
      root.dispatchEvent(new Event('scroll'));
      return { height: scrollingElement.scrollHeight, cells: cells.length };
    },
  };
})(globalThis);
