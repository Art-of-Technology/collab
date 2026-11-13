import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { generateClientCredentials, encryptToken } from '@/lib/apps/crypto';
import { validateJWKS } from '@/lib/apps/jwks';

import { prisma } from '@/lib/prisma';

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

    // Start transaction
    const approved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "App" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.app.findUnique({
        where: { id },
        include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } }
      });
      if (!current || current.status !== app.status || current.updatedAt.getTime() !== app.updatedAt.getTime() ||
          current.versions[0]?.id !== latestVersion.id) return false;
      // Update app status
      const updated = await tx.app.updateMany({
        where: { id, status: 'IN_REVIEW', updatedAt: app.updatedAt },
        // Approval is of this version: a version submitted later needs its own.
        data: { status: 'DRAFT', approvedVersionId: latestVersion.id }
      });

      if (updated.count !== 1) return false;

      // Generate OAuth credentials if needed and not already present
      if (manifest.oauth && !app.oauthClient) {
        const clientType = manifest.oauth.client_type?.toLowerCase() === 'public' ? 'public' : 'confidential';
        const authMethod = manifest.oauth.token_endpoint_auth_method || 
          (clientType === 'public' ? 'none' : 'client_secret_basic');
        
        // Validate JWKS for private_key_jwt clients
        let jwksValidated = false;
        if (authMethod === 'private_key_jwt' && manifest.oauth.jwks_uri) {
          const jwksValidation = await validateJWKS(manifest.oauth.jwks_uri);
          if (!jwksValidation.valid) {
            throw new Error(`JWKS validation failed: ${jwksValidation.error}`);
          }
          jwksValidated = true;
        }
        
        // Generate credentials based on auth method
        const credentials = await generateClientCredentials();
        let clientSecret: Awaited<ReturnType<typeof encryptToken>> | null = null;
        
        // Only generate and store client secret for client_secret_basic
        if (clientType === 'confidential' && authMethod === 'client_secret_basic') {
          clientSecret = (await encryptToken(credentials.clientSecret));
        }
        
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
      return true;
    });

    if (!approved) {
      return NextResponse.json({ error: 'App changed during approval' }, { status: 409 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'App approved successfully' 
    });

  } catch (error) {
    console.error('Error approving app:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
