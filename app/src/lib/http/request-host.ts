interface RequestHostSource {
  headers: Pick<Headers, 'get'>;
  nextUrl: Pick<URL, 'host'>;
}

function firstForwardedValue(value: string | null) {
  return value?.split(',', 1)[0]?.trim().toLowerCase() || null;
}

export function requestTargetsHost(request: RequestHostSource, expectedHost: string) {
  const normalizedExpectedHost = expectedHost.trim().toLowerCase();
  const candidateHosts = [
    firstForwardedValue(request.headers.get('x-forwarded-host')),
    firstForwardedValue(request.headers.get('host')),
    request.nextUrl.host.trim().toLowerCase(),
  ];

  return candidateHosts.includes(normalizedExpectedHost);
}
