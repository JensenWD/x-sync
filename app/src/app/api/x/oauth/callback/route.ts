import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeAuthorizationCode,
  getAuthenticatedUser,
  getXOAuthConfig,
  storeAuthorization,
} from '@/lib/x-api/oauth';

export const dynamic = 'force-dynamic';

function homeRedirect(params: Record<string, string>) {
  const url = new URL('/', getXOAuthConfig().redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set('x_oauth_state', '', { path: '/api/x/oauth/callback', maxAge: 0 });
  response.cookies.set('x_oauth_verifier', '', { path: '/api/x/oauth/callback', maxAge: 0 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request: NextRequest) {
  const returnedError = request.nextUrl.searchParams.get('error');
  if (returnedError) {
    return clearOAuthCookies(homeRedirect({ x_error: 'X authorization was cancelled.' }));
  }

  const code = request.nextUrl.searchParams.get('code');
  const returnedState = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get('x_oauth_state')?.value;
  const verifier = request.cookies.get('x_oauth_verifier')?.value;
  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    return clearOAuthCookies(homeRedirect({ x_error: 'X authorization expired. Please retry.' }));
  }

  try {
    const token = await exchangeAuthorizationCode(code, verifier);
    const user = await getAuthenticatedUser(token.accessToken);
    storeAuthorization(user, token);
    return clearOAuthCookies(homeRedirect({ x_connected: user.username }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'X authorization failed.';
    return clearOAuthCookies(homeRedirect({ x_error: message.slice(0, 200) }));
  }
}
