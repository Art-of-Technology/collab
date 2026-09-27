import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { appOwnerWhere } from '@/lib/apps/ownership';
import { prisma } from '@/lib/prisma';
import { generateClientCredentials } from '@/lib/apps/crypto';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await getCurrentUser();

    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const app = await prisma.app.findFirst({
      where: { id, ...appOwnerWhere(actor.id) },
      include: {
        oauthClient: true
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    if (!app.oauthClient) {
      return NextResponse.json({ error: 'App has no OAuth client' }, { status: 404 });
    }

    if (app.userId !== actor.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const credentials = await generateClientCredentials();

    const updated = await prisma.appOAuthClient.updateMany({
      where: { id: app.oauthClient.id, app: appOwnerWhere(actor.id) },
      data: {
        apiKey: credentials.apiKey,
        apiKeyRevealed: false
      } 
    });

    if (updated.count !== 1) {
      return NextResponse.json({ error: 'App access revoked' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      apiKey: credentials.apiKey,
      warning: 'The old API key has been invalidated. Store this new key securely.'
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error('Error regenerating API key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

