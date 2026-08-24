/**
 * What counts as an X handle, in one place: the dashboard route validates
 * `?author=` against it, and the filter hook validates the same value coming
 * back out of the URL. Two definitions would let a link the UI can produce be
 * rejected by the API that has to serve it.
 */
export const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

/** Strips the leading `@` people paste; returns null when it is not a handle. */
export function normalizeHandle(value: string | null | undefined): string | null {
  const handle = value?.trim().replace(/^@/, '') ?? '';
  return X_HANDLE_PATTERN.test(handle) ? handle : null;
}
