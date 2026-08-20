import 'server-only';

const REQUEST_TIMEOUT_MS = 20_000;

export async function fetchWithDeadline(
  input: string | URL,
  init: RequestInit = {},
  retries = 0,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status < 500 || attempt === retries) return response;
      lastError = new Error(`Remote service returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 3 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('Remote request failed');
}
