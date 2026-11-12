import { pathToFileURL } from 'node:url';
import { scopes } from '../packages/cli/src/commands.mjs';

export const definition = {
  name: 'Collab CLI', slug: 'collab-cli', publisherId: 'system', status: 'PUBLISHED', visibility: 'PUBLIC', isSystemApp: true,
  oauthClient: { clientId: 'collab-cli', clientType: 'public', tokenEndpointAuthMethod: 'none', redirectUris: ['http://127.0.0.1:19400/callback'], postLogoutRedirectUris: [], responseTypes: ['code'], grantTypes: ['authorization_code', 'refresh_token'] },
  scopes,
};

// A distinct app avoids rotating the existing MCP integration's per-user token.
// Existing conflicting registrations are refused, never silently reconfigured.
export async function provisionIn(tx, def) {
  const existing = await tx.app.findUnique({ where: { slug: def.slug }, include: { oauthClient: true, scopes: true } });
  if (existing) {
    // An app defined without an OAuth client must not have gained one.
    const client = def.oauthClient
      ? Object.entries(def.oauthClient).every(([key, value]) => JSON.stringify(existing.oauthClient?.[key]) === JSON.stringify(value)) &&
        existing.oauthClient?.clientSecret == null && existing.oauthClient?.apiKey == null
      : existing.oauthClient == null;
    const matches = client && ['name', 'publisherId', 'status', 'visibility', 'isSystemApp'].every(key => existing[key] === def[key]) &&
      JSON.stringify(existing.scopes.map(row => row.scope).sort()) === JSON.stringify([...def.scopes].sort());
    if (!matches) throw new Error(`Existing ${def.slug} registration differs; review it before changing anything.`);
    return { created: false, appId: existing.id, clientId: def.oauthClient?.clientId };
  }
  const { oauthClient, scopes: requested, ...app } = def;
  const created = await tx.app.create({ data: { ...app, ...(oauthClient && { oauthClient: { create: oauthClient } }), scopes: { create: requested.map(scope => ({ scope })) } }, select: { id: true } });
  return { created: true, appId: created.id, clientId: oauthClient?.clientId };
}

export const provision = prisma => prisma.$transaction(tx => provisionIn(tx, definition));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 2) console.log(JSON.stringify({ dryRun: true, app: definition.slug, scopes }));
  else if (process.argv.length === 3 && process.argv[2] === '--apply') {
    // Plan mode above imports no Prisma or environment loader.
    let prisma;
    try {
      if (!process.env.DATABASE_URL) throw new Error('Database configuration required.');
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      console.log(JSON.stringify(await provision(prisma)));
    } catch { console.error('CLI registration failed. No token or database error details emitted.'); process.exitCode = 1; }
    finally { await prisma?.$disconnect(); }
  } else { console.error('Usage: node scripts/setup-cli-oauth-client.mjs [--apply]'); process.exitCode = 2; }
}
