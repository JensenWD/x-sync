// Helpers for the comma-separated URL filter contract documented in
// AGENTS.md. The sidebar, grid toolbar, and chip rows all read the same
// `folder_id` / `tag` params, so the parsing lives here to keep semantics
// in lockstep.

export function parseStringList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseIdList(value: string | null): number[] {
  return parseStringList(value)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}
