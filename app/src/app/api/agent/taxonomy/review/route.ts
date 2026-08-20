import { rawDb } from '@/lib/db/client';
import { reviewTaxonomyProposals } from '@/lib/agent-taxonomy';
import { AGENT_HEADERS, agentError, requestBody } from '../_response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    return Response.json(reviewTaxonomyProposals(rawDb, await requestBody(request)), {
      headers: AGENT_HEADERS,
    });
  } catch (error) {
    return agentError(error);
  }
}
