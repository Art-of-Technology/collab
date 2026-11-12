import { NextRequest } from 'next/server';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { authenticateAppRequest, createAuthErrorResponse } from '@/lib/apps/auth-middleware';
import { hasAllScopes, hasAnyScope } from '@/lib/oauth-scopes';
import { bearerChallenge } from '@/lib/mcp-oauth';
import { INSTRUCTIONS, callTool, tools } from '@/lib/mcp-tools';

// POST /api/mcp - the MCP endpoint (Streamable HTTP, stateless). See docs/mcp-remote.md.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The factory runs once per request, so each request sees only the tools its own token may use.
const handler = createMcpHandler(({ authInfo, requestInfo }) => {
  // A token's tool list never changes, so no client needs to keep a change subscription open.
  const server = new McpServer({ name: 'collab', version: '1.0.0' }, { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS });
  const granted = authInfo?.scopes ?? [];
  for (const tool of tools) {
    if (!(tool.anyScope ? hasAnyScope(tool.scopes, granted) : hasAllScopes(tool.scopes, granted))) continue;
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input, annotations: { readOnlyHint: tool.method === 'GET' } },
      args => callTool(tool, args as Record<string, unknown>, `Bearer ${authInfo!.token}`, requestInfo!.url),
    );
  }
  return server;
}, { maxRequestBodySize: 1024 * 1024, onerror: error => console.error('MCP request failed:', error.message) });

export async function POST(request: NextRequest) {
  // Authenticate before the MCP layer reads anything: a 401 here is what starts a client's sign-in.
  const auth = await authenticateAppRequest(request);
  if (!auth.success) {
    const response = createAuthErrorResponse(auth.error!);
    if (auth.error!.statusCode === 401) response.headers.set('WWW-Authenticate', bearerChallenge());
    return response;
  }
  return handler.fetch(request, {
    authInfo: { token: request.headers.get('Authorization')!.slice('Bearer '.length), clientId: auth.context!.app.slug, scopes: auth.context!.token.scopes },
  });
}
