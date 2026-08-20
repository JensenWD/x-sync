import { rawDb } from '@/lib/db/client';
import { semanticSearch } from '@/lib/agent-enrichment';
import { AGENT_HEADERS, agentError, requestBody } from '../../taxonomy/_response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    return Response.json(semanticSearch(rawDb, await requestBody(request)), {
      headers: AGENT_HEADERS,
    });
  } catch (error) {
    return agentError(error);
  }
}
