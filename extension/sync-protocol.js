(function attachProtocol(root) {
  function runSummary(run) {
    if (!run) return 'Sync completed';
    const parts = [
      `${run.bookmarks_inserted || 0} new`,
      `${run.bookmarks_existing || 0} existing`,
    ];
    if (run.mode === 'full') parts.push(`${run.remote_removed || 0} archived`);
    parts.push(`${run.pages_fetched || 0} page${run.pages_fetched === 1 ? '' : 's'}`);
    return parts.join(' · ');
  }

  function normalize(httpStatus, payload) {
    if (payload && payload.status === 'already_running') {
      return { success: true, alreadyRunning: true, run: payload.run || null };
    }
    if (httpStatus >= 200 && httpStatus < 300 && payload && payload.status === 'success') {
      return { success: true, alreadyRunning: false, run: payload.run || null };
    }
    return {
      success: false,
      code: payload && payload.code ? payload.code : 'server_error',
      error: payload && payload.error ? payload.error : `Dashboard returned HTTP ${httpStatus}`,
    };
  }

  const protocol = { normalize, runSummary };
  root.XSyncProtocol = protocol;
  if (typeof module !== 'undefined' && module.exports) module.exports = protocol;
})(globalThis);
