import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { logAppInstallSuccess } from '@/lib/audit';

const prisma = new PrismaClient();

/**
 * POST /api/apps/installations/[id]/ack
 * 
 * Acknowledges successful installation after OAuth token exchange.
 * This endpoint is called by the third-party app after receiving tokens.
 * 
 * Requires: Bearer token authorization
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: installationId } = await params;
    
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const accessToken = authHeader.slice(7); // Remove "Bearer "

    // Find the installation with the provided access token
    // Note: In production, you'd decrypt and verify the token properly
    const installation = await prisma.appInstallation.findFirst({
      where: {
        id: installationId,
        status: 'ACTIVE', // Should be ACTIVE after token exchange
        accessToken: { not: null }
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    if (!installation) {
      return NextResponse.json(
        { error: 'Installation not found or not active' },
        { status: 404 }
      );
    }

    // TODO: Verify the access token matches the installation
    // For now, we'll trust that the installation exists and is active

    // Log successful installation completion
    await logAppInstallSuccess(
      installation.workspaceId, 
      installation.installedById, 
      installation.app.id, 
      installation.id,
      {
        flow: 'oauth',
        scopes: installation.scopes,
        acknowledgedAt: new Date()
      }
    );

    // Return installation details
    return NextResponse.json({
      success: true,
      installation: {
        id: installation.id,
        status: installation.status,
        scopes: installation.scopes,
        createdAt: installation.createdAt,
        updatedAt: installation.updatedAt
      },
      app: {
        id: installation.app.id,
        name: installation.app.name,
        slug: installation.app.slug
      },
      workspace: {
        id: installation.workspace.id,
        name: installation.workspace.name,
        slug: installation.workspace.slug
      }
    });

  } catch (error) {
    console.error('Error acknowledging installation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
