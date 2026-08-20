import { NextRequest, NextResponse } from 'next/server';
import { requestTargetsHost } from '@/lib/http/request-host';
import { createAuthorizationRequest } from '@/lib/x-api/oauth';

export const dynamic = 'force-dynamic';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/api/x/oauth/callback',
  maxAge: 10 * 60,
};

export async function GET(request: NextRequest) {
  try {
    const authorization = createAuthorizationRequest();
    const callbackUrl = new URL(authorization.redirectUri);
    if (!requestTargetsHost(request, callbackUrl.host)) {
      return NextResponse.redirect(new URL('/api/x/oauth/start', callbackUrl.origin));
    }

    const response = NextResponse.redirect(authorization.url);
    response.cookies.set('x_oauth_state', authorization.state, COOKIE_OPTIONS);
    response.cookies.set('x_oauth_verifier', authorization.verifier, COOKIE_OPTIONS);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'X OAuth could not start.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
