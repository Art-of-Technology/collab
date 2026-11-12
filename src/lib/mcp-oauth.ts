import { NextResponse } from 'next/server';

// Discovery for the MCP endpoint: how a client finds the OAuth endpoints that guard it (RFC 9728, RFC 8414).
export const MCP_PATH = '/api/mcp';

// What the MCP tools need. scripts/setup-agent-apps.mjs grants the connector app the same list:
// authorize() refuses a request for any scope outside the app's grant.
export const MCP_SCOPES = ['user:read', 'workspace:read', 'projects:read', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read'] as const;

// Read per request and never taken from request headers: a spoofed Host must not become the issuer.
function publicOrigin(): string | null {
  try {
    return new URL(process.env.NEXTAUTH_URL ?? '').origin;
  } catch {
    return null;
  }
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
  };
}

// The MCP endpoints accept only public system clients with PKCE, so this document describes those,
// not the generic /api/oauth/* endpoints for installed apps.
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/mcp/authorize`,
    token_endpoint: `${origin}/api/oauth/mcp/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...MCP_SCOPES],
  };
}

/** Serve a discovery document, or 503 rather than a document built from a missing origin. */
export function discovery(build: (origin: string) => object) {
  const origin = publicOrigin();
  return origin
    ? NextResponse.json(build(origin))
    : NextResponse.json({ error: 'server_error', error_description: 'The public origin is not configured' }, { status: 503 });
}

/** WWW-Authenticate value for a 401 from the MCP endpoint. */
export function bearerChallenge(): string {
  const origin = publicOrigin();
  return origin ? `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${MCP_PATH}"` : 'Bearer';
}
