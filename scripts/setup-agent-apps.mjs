import { pathToFileURL } from 'node:url';
import { scopes as cliScopes } from '../packages/cli/src/commands.mjs';
import { provisionIn } from './setup-cli-oauth-client.mjs';

const system = { publisherId: 'system', status: 'PUBLISHED', visibility: 'PRIVATE', isSystemApp: true };
// What the MCP tools need. src/lib/mcp-oauth.ts advertises the same list.
const mcpScopes = ['user:read', 'workspace:read', 'projects:read', 'issues:read', 'issues:write', 'context:read', 'context:write', 'prompts:read'];

export const definitions = [
  // Named tokens minted in workspace settings. No OAuth client: nothing can sign in as this app.
  { ...system, name: 'Collab agent tokens', slug: 'collab-agent', scopes: cliScopes },
  // Personal sign-in from Claude connectors. Loopback callbacks (Claude Code) are already allowed for system apps.
  { ...system, name: 'Collab MCP', slug: 'collab-connector', scopes: mcpScopes,
    oauthClient: { clientId: 'collab-connector', clientType: 'public', tokenEndpointAuthMethod: 'none', redirectUris: ['https://claude.ai/api/mcp/auth_callback'], postLogoutRedirectUris: [], responseTypes: ['code'], grantTypes: ['authorization_code', 'refresh_token'] } },
  // Tokens the in-app assistant mints for the signed-in user.
  { ...system, name: 'Collab assistant', slug: 'collab-assistant', scopes: mcpScopes },
];

// One transaction: a differing registration refuses the whole run.
export async function provisionAll(prisma) {
  return prisma.$transaction(async tx => {
    const results = [];
    for (const def of definitions) results.push({ app: def.slug, ...await provisionIn(tx, def) });
    return results;
  });
}

// A refusal names the registration that differs and carries no secret; any other failure stays private.
export const failureMessage = error => /registration differs/.test(error?.message ?? '')
  ? error.message
  : 'Agent app registration failed. Nothing was changed; no token or database error details emitted.';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 2) {
    console.log(JSON.stringify({ dryRun: true, apps: definitions.map(def => ({ app: def.slug, scopes: def.scopes, clientId: def.oauthClient?.clientId, redirectUris: def.oauthClient?.redirectUris })) }));
  } else if (process.argv.length === 3 && process.argv[2] === '--apply') {
    // Plan mode above imports no Prisma or environment loader.
    let prisma;
    try {
      if (!process.env.DATABASE_URL) throw new Error('Database configuration required.');
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      for (const result of await provisionAll(prisma)) console.log(JSON.stringify(result));
    } catch (error) { console.error(failureMessage(error)); process.exitCode = 1; }
    finally { await prisma?.$disconnect(); }
  } else { console.error('Usage: node scripts/setup-agent-apps.mjs [--apply]'); process.exitCode = 2; }
}
