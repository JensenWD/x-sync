import { AgentContractError } from '@/lib/agent-taxonomy';

export const AGENT_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function agentError(error: unknown) {
  if (error instanceof AgentContractError) {
    return Response.json(
      {
        error: {
          code: 'invalid_agent_taxonomy_request',
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status, headers: AGENT_HEADERS },
    );
  }
  console.error('Agent taxonomy request failed', error);
  return Response.json(
    { error: { code: 'agent_taxonomy_failed', message: 'Agent taxonomy request failed' } },
    { status: 500, headers: AGENT_HEADERS },
  );
}

export async function requestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AgentContractError('Request body must be valid JSON');
  }
}
