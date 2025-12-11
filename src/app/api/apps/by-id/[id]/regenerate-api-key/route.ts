import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';
import { generateClientCredentials } from '@/lib/apps/crypto';

const prisma = new PrismaClient();

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

    const app = await prisma.app.findUnique({
      where: { id },
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

    if (app.userId && app.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const credentials = await generateClientCredentials();

    await prisma.appOAuthClient.update({
      where: { id: app.oauthClient.id },
      data: {
        apiKey: credentials.apiKey,
        apiKeyRevealed: false
      } 
    });

    return NextResponse.json({
      success: true,
      apiKey: credentials.apiKey,
      warning: 'The old API key has been invalidated. Store this new key securely.'
    });

  } catch (error) {
    console.error('Error regenerating API key:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

