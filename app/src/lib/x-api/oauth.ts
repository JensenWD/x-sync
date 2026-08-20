import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { rawDb } from '@/lib/db/client';
import { decryptToken, encryptToken } from './token-crypto';
import { fetchWithDeadline } from './fetch';
import { assertSameXAccount, type XAccountIdentity } from './account-binding';

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me?user.fields=name,username,profile_image_url';
export const X_OAUTH_SCOPES = ['bookmark.read', 'tweet.read', 'users.read', 'offline.access'] as const;

interface XOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string;
  expiresIn: number;
}

interface StoredCredentials {
  user_id: string;
  username: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_type: string;
  scope: string;
  access_token_expires_at: number;
  connected_at: number;
  updated_at: number;
}

type AuthenticatedUser = XAccountIdentity;

function now() {
  return Math.floor(Date.now() / 1000);
}

export function getXOAuthConfig(): XOAuthConfig {
  const clientId = process.env.X_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.X_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.X_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('X OAuth is not configured on this server.');
  }
  return { clientId, clientSecret, redirectUri };
}

export function isXOAuthConfigured() {
  try {
    getXOAuthConfig();
    return true;
  } catch {
    return false;
  }
}

function base64Url(buffer: Buffer) {
  return buffer.toString('base64url');
}

export function createAuthorizationRequest() {
  const config = getXOAuthConfig();
  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', X_OAUTH_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return { url, state, verifier, redirectUri: config.redirectUri };
}

function tokenErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const object = payload as Record<string, unknown>;
    const description =
      typeof object.error_description === 'string'
        ? object.error_description
        : typeof object.error === 'string'
          ? object.error
          : null;
    if (description) return description.slice(0, 300);
  }
  return `X OAuth token request failed with HTTP ${status}.`;
}

async function postToken(params: URLSearchParams): Promise<TokenResponse> {
  const config = getXOAuthConfig();
  const response = await fetchWithDeadline(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(tokenErrorMessage(payload, response.status));

  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : null;
  const refreshToken = typeof payload?.refresh_token === 'string' ? payload.refresh_token : null;
  if (!accessToken) throw new Error('X OAuth did not return an access token.');
  return {
    accessToken,
    refreshToken,
    tokenType: typeof payload?.token_type === 'string' ? payload.token_type : 'bearer',
    scope: typeof payload?.scope === 'string' ? payload.scope : X_OAUTH_SCOPES.join(' '),
    expiresIn:
      typeof payload?.expires_in === 'number' && Number.isFinite(payload.expires_in)
        ? Math.max(60, Math.floor(payload.expires_in))
        : 7200,
  };
}

export function exchangeAuthorizationCode(code: string, verifier: string) {
  const config = getXOAuthConfig();
  return postToken(
    new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  );
}

export async function getAuthenticatedUser(accessToken: string): Promise<AuthenticatedUser> {
  const response = await fetchWithDeadline(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : null;
  if (!response.ok || typeof data?.id !== 'string' || typeof data.username !== 'string') {
    throw new Error(`X could not verify the connected account (HTTP ${response.status}).`);
  }
  return { id: data.id, username: data.username };
}

function readCredentials() {
  return rawDb
    .prepare(`SELECT * FROM x_oauth_credentials WHERE id = 1`)
    .get() as StoredCredentials | undefined;
}

function saveCredentials(
  user: AuthenticatedUser,
  token: TokenResponse,
  fallbackRefreshToken?: string,
) {
  const config = getXOAuthConfig();
  const refreshToken = token.refreshToken ?? fallbackRefreshToken;
  if (!refreshToken) {
    throw new Error('X did not return a refresh token. Reconnect with offline access enabled.');
  }
  const timestamp = now();
  rawDb
    .prepare(`
      INSERT INTO x_oauth_credentials
        (id, user_id, username, encrypted_access_token, encrypted_refresh_token,
         token_type, scope, access_token_expires_at, connected_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        username = excluded.username,
        encrypted_access_token = excluded.encrypted_access_token,
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        token_type = excluded.token_type,
        scope = excluded.scope,
        access_token_expires_at = excluded.access_token_expires_at,
        updated_at = excluded.updated_at
    `)
    .run(
      user.id,
      user.username,
      encryptToken(token.accessToken, config.clientSecret),
      encryptToken(refreshToken, config.clientSecret),
      token.tokenType,
      token.scope,
      timestamp + token.expiresIn,
      timestamp,
      timestamp,
    );
}

export function storeAuthorization(user: AuthenticatedUser, token: TokenResponse) {
  const existing = readCredentials();
  assertSameXAccount(existing, user);
  saveCredentials(user, token);
}

export function getXConnectionStatus() {
  const configured = isXOAuthConfigured();
  if (!configured) return { configured: false, connected: false, username: null, scope: null };
  const credentials = readCredentials();
  return {
    configured: true,
    connected: Boolean(credentials),
    username: credentials?.username ?? null,
    scope: credentials?.scope ?? null,
  };
}

export async function refreshXAccessToken() {
  const credentials = readCredentials();
  if (!credentials) throw new Error('Connect your X account before syncing bookmarks.');
  const config = getXOAuthConfig();
  const refreshToken = decryptToken(credentials.encrypted_refresh_token, config.clientSecret);
  const token = await postToken(
    new URLSearchParams({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
  );
  saveCredentials(
    { id: credentials.user_id, username: credentials.username },
    token,
    token.refreshToken ? undefined : refreshToken,
  );
  return token.accessToken;
}

export async function getValidXAccessToken() {
  const credentials = readCredentials();
  if (!credentials) throw new Error('Connect your X account before syncing bookmarks.');
  if (credentials.access_token_expires_at <= now() + 60) return refreshXAccessToken();
  return decryptToken(credentials.encrypted_access_token, getXOAuthConfig().clientSecret);
}

export function getConnectedXUserId() {
  const credentials = readCredentials();
  if (!credentials) throw new Error('Connect your X account before syncing bookmarks.');
  return credentials.user_id;
}
