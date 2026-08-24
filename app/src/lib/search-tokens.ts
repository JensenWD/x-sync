/**
 * One tokenizer for search, shared by the SQL that builds the FTS query and the
 * client that marks what matched.
 *
 * These have to agree: highlighting words the index did not match on (or
 * missing ones it did) is silently wrong rather than loudly broken, so the
 * query builders and the highlighter read their terms from here.
 *
 * Lowercasing and de-duplication are no-ops against FTS5's `unicode61`
 * tokenizer — it folds case itself, and a repeated term adds nothing to an
 * AND/OR join — but they make the token list directly usable for matching text
 * in the browser.
 */
export function searchTokens(query: string): string[] {
  if (!query) return [];
  const tokens = query.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(tokens.slice(0, 32))];
}

/** `foo bar` → `"foo"* AND "bar"*` — prefix matching on every term. */
export function ftsPrefixQuery(tokens: string[]): string {
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ');
}
