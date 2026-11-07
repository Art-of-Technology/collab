import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { generateClientCredentials, encryptToken } from '@/lib/apps/crypto';
import { validateJWKS } from '@/lib/apps/jwks';
import { isDeepStrictEqual } from 'node:util';

import { prisma } from '@/lib/prisma';

class ApprovalChanged extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Get the app
    const app = await prisma.app.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        oauthClient: true
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    if (app.status !== 'IN_REVIEW') {
      return NextResponse.json({ 
        error: 'App must be in review status to be approved' 
      }, { status: 400 });
    }

    const latestVersion = app.versions[0];
    if (!latestVersion) {
      return NextResponse.json({ error: 'App has no versions' }, { status: 400 });
    }

    const manifest = latestVersion.manifest as any;

    // External validation and key derivation do not need a database connection.
    const createClient = Boolean(manifest.oauth && !app.oauthClient);
    const clientType = manifest.oauth?.client_type?.toLowerCase() === 'public' ? 'public' : 'confidential';
    const authMethod = manifest.oauth?.token_endpoint_auth_method ||
      (clientType === 'public' ? 'none' : 'client_secret_basic');
    let jwksValidated = false;
    if (createClient && authMethod === 'private_key_jwt' && manifest.oauth.jwks_uri) {
      const validation = await validateJWKS(manifest.oauth.jwks_uri);
      if (!validation.valid) throw new Error(`JWKS validation failed: ${validation.error}`);
      jwksValidated = true;
    }
    const credentials = createClient ? await generateClientCredentials() : null;
    const clientSecret = credentials && clientType === 'confidential' && authMethod === 'client_secret_basic'
      ? await encryptToken(credentials.clientSecret) : null;

    // Start transaction
    await prisma.$transaction(async (tx) => {
      // Prevent a concurrent manifest/client change from invalidating the external check.
      await tx.$queryRaw`SELECT id FROM "App" WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "AppVersion" WHERE "appId" = ${id} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "AppOAuthClient" WHERE "appId" = ${id} FOR SHARE`;
      const current = await tx.app.findUnique({
        where: { id },
        include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 }, oauthClient: true }
      });
      if (!current || current.status !== 'IN_REVIEW' || current.versions[0]?.id !== latestVersion.id ||
          !isDeepStrictEqual(current.versions[0].manifest, latestVersion.manifest) ||
          !isDeepStrictEqual(current.oauthClient, app.oauthClient)) throw new ApprovalChanged();

      // Update app status
      await tx.app.update({
        where: { id },
        data: { status: 'DRAFT' }
      });

      // Generate OAuth credentials if needed and not already present
      if (credentials) {
        await tx.appOAuthClient.create({
          data: {
            appId: id,
            clientId: credentials.clientId,
            clientSecret: clientSecret,
            clientType: clientType,
            tokenEndpointAuthMethod: authMethod,
            jwksUri: manifest.oauth.jwks_uri || null,
            jwksValidated: jwksValidated,
            redirectUris: manifest.oauth.redirect_uris || [],
            postLogoutRedirectUris: manifest.oauth.post_logout_redirect_uris || [],
            responseTypes: manifest.oauth.response_types || ["code"],
            grantTypes: manifest.oauth.grant_types || ["authorization_code", "refresh_token"]
          }
        });
      }

      // Update scopes if they exist in manifest
      if (manifest.scopes && Array.isArray(manifest.scopes)) {
        // Delete existing scopes
        await tx.appScope.deleteMany({
          where: { appId: id }
        });

        // Create new scopes
        await tx.appScope.createMany({
          data: manifest.scopes.map((scope: string) => ({
            appId: id,
            scope
          }))
        });
      }
    });


    return NextResponse.json({ 
      success: true, 
      message: 'App approved successfully' 
    });

  } catch (error) {
    if (error instanceof ApprovalChanged) {
      return NextResponse.json({ error: 'App changed during approval; review and try again' }, { status: 409 });
    }
    console.error('Error approving app:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
