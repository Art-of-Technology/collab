/**
 * MCP Token & Connection Diagnostics
 * 
 * Tests the full lifecycle:
 * 1. Generate a fresh Cleo token
 * 2. Validate via introspect endpoint
 * 3. Connect to MCP server (initialize)
 * 4. List tools (tools/list)
 * 
 * DELETE THIS FILE after debugging.
 */
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getMcpToken, getMcpServerUrl, invalidateMcpToken } from '@/lib/ai/mcp-token';

export async function GET() {
  const results: Record<string, unknown> = {};
  
  try {
    // Step 0: Auth
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Not authenticated. Login first.' }, { status: 401 });
    }
    results.user = { id: currentUser.id, name: currentUser.name, email: currentUser.email };

    // Find workspace
    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: currentUser.id } } },
      select: { id: true, name: true, slug: true },
    });
    if (!workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }
    results.workspace = workspace;

    // Step 1: Invalidate old tokens and generate fresh one
    await invalidateMcpToken(prisma, currentUser.id, workspace.id);
    const token = await getMcpToken(prisma, currentUser.id, workspace.id);
    results.token = {
      prefix: token.slice(0, 30) + '...',
      length: token.length,
      format: token.startsWith('collab_at_') ? 'correct (collab_at_)' : 'WRONG FORMAT',
    };

    // Step 2: Verify token exists in DB
    const dbToken = await prisma.appToken.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId: workspace.id,
        installationId: null,
        isRevoked: false,
      },
      include: {
        app: { include: { oauthClient: true } },
        workspace: { select: { id: true, slug: true, name: true } },
      },
    });
    results.dbToken = dbToken ? {
      id: dbToken.id,
      hasAppId: !!dbToken.appId,
      appId: dbToken.appId,
      hasApp: !!dbToken.app,
      appSlug: dbToken.app?.slug,
      hasOAuthClient: !!dbToken.app?.oauthClient,
      oauthClientId: dbToken.app?.oauthClient?.clientId,
      hasWorkspaceId: !!dbToken.workspaceId,
      workspaceId: dbToken.workspaceId,
      hasWorkspace: !!dbToken.workspace,
      userId: dbToken.userId,
      installationId: dbToken.installationId,
      scopes: dbToken.scopes,
      isRevoked: dbToken.isRevoked,
      tokenExpiresAt: dbToken.tokenExpiresAt,
      accessTokenLength: dbToken.accessToken?.length,
    } : 'NOT FOUND — THIS IS THE PROBLEM';

    // Step 3: Test introspect endpoint (local)
    const introspectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/oauth/introspect`;
    try {
      const introspectRes = await fetch(introspectUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
      });
      const introspectData = await introspectRes.json();
      results.introspect = {
        url: introspectUrl,
        status: introspectRes.status,
        response: introspectData,
      };
    } catch (err) {
      results.introspect = { url: introspectUrl, error: String(err) };
    }

    // Step 4: Test MCP server — Initialize
    const mcpUrl = `${getMcpServerUrl()}/api/mcp`;
    let mcpSessionId: string | null = null;

    try {
      const initRes = await fetch(mcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'collab-diagnostics', version: '1.0' },
          },
        }),
      });

      mcpSessionId = initRes.headers.get('mcp-session-id');
      const contentType = initRes.headers.get('content-type');

      let initData: unknown;
      if (contentType?.includes('text/event-stream')) {
        // Parse SSE response
        const text = await initRes.text();
        const dataLines = text.split('\n').filter(l => l.startsWith('data: '));
        initData = dataLines.map(l => {
          try { return JSON.parse(l.slice(6)); } catch { return l.slice(6); }
        });
      } else {
        initData = await initRes.json();
      }

      results.mcpInitialize = {
        url: mcpUrl,
        status: initRes.status,
        contentType,
        sessionId: mcpSessionId ? mcpSessionId.slice(0, 12) + '...' : 'MISSING — PROBLEM',
        response: initData,
      };
    } catch (err) {
      results.mcpInitialize = { url: mcpUrl, error: String(err) };
    }

    // Step 5: Test MCP server — tools/list (requires session ID)
    if (mcpSessionId) {
      try {
        const listRes = await fetch(mcpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': `Bearer ${token}`,
            'mcp-session-id': mcpSessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
          }),
        });

        const listContentType = listRes.headers.get('content-type');
        let listData: unknown;
        if (listContentType?.includes('text/event-stream')) {
          const text = await listRes.text();
          const dataLines = text.split('\n').filter(l => l.startsWith('data: '));
          listData = dataLines.map(l => {
            try { return JSON.parse(l.slice(6)); } catch { return l.slice(6); }
          });
        } else {
          listData = await listRes.json();
        }

        // Count tools if successful
        let toolCount = 0;
        if (Array.isArray(listData)) {
          const result = listData.find((d: any) => d?.result?.tools);
          toolCount = result?.result?.tools?.length || 0;
        } else if ((listData as any)?.result?.tools) {
          toolCount = (listData as any).result.tools.length;
        }

        results.mcpToolsList = {
          status: listRes.status,
          contentType: listContentType,
          toolCount,
          response: toolCount > 5
            ? `${toolCount} tools found (truncated). First 3: ${JSON.stringify(
                ((listData as any)?.result?.tools || (Array.isArray(listData) ? listData.find((d: any) => d?.result?.tools)?.result?.tools : []))
                  ?.slice(0, 3)
                  ?.map((t: any) => t.name)
              )}`
            : listData,
        };
      } catch (err) {
        results.mcpToolsList = { error: String(err) };
      }
    } else {
      results.mcpToolsList = { skipped: 'No session ID from initialize' };
    }

    // Step 6: Test MCP server — tool execution (actually validates token via introspect)
    if (mcpSessionId) {
      try {
        const callRes = await fetch(mcpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': `Bearer ${token}`,
            'mcp-session-id': mcpSessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
              name: 'get_current_user',
              arguments: {},
            },
          }),
        });

        const callContentType = callRes.headers.get('content-type');
        let callData: unknown;
        if (callContentType?.includes('text/event-stream')) {
          const text = await callRes.text();
          const dataLines = text.split('\n').filter(l => l.startsWith('data: '));
          callData = dataLines.map(l => {
            try { return JSON.parse(l.slice(6)); } catch { return l.slice(6); }
          });
        } else {
          callData = await callRes.json();
        }

        results.mcpToolCall = {
          tool: 'get_current_user',
          status: callRes.status,
          contentType: callContentType,
          response: callData,
          note: 'This step validates the token via introspect endpoint',
        };
      } catch (err) {
        results.mcpToolCall = { error: String(err) };
      }
    }

    // Summary
    const allGreen = results.introspect && (results.introspect as any).response?.active === true
      && results.mcpInitialize && (results.mcpInitialize as any).status === 200
      && results.mcpToolsList && (results.mcpToolsList as any).toolCount > 0;

    results.summary = allGreen
      ? '✅ Token + MCP server working. Issue is Anthropic connector transport, NOT auth.'
      : '❌ See failures above.';

    return NextResponse.json(results, { status: 200 });

  } catch (error) {
    return NextResponse.json({
      error: String(error),
      results,
    }, { status: 500 });
  }
}
