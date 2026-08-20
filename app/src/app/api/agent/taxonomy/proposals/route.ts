import { rawDb } from '@/lib/db/client';
import { createTaxonomyProposals, listTaxonomyProposals } from '@/lib/agent-taxonomy';
import { AGENT_HEADERS, agentError, requestBody } from '../_response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return Response.json(listTaxonomyProposals(rawDb, new URL(request.url).searchParams), {
      headers: AGENT_HEADERS,
    });
  } catch (error) {
    return agentError(error);
  }
}

export async function POST(request: Request) {
  try {
    const result = createTaxonomyProposals(rawDb, await requestBody(request));
    return Response.json(result, { status: 201, headers: AGENT_HEADERS });
  } catch (error) {
    return agentError(error);
  }
}
