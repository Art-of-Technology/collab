import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';

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

    if (!app.oauthClient.apiKey) {
      return NextResponse.json({ error: 'No API key available' }, { status: 404 });
    }

    if (app.userId && app.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.appOAuthClient.update({
      where: { id: app.oauthClient.id },
      data: { apiKeyRevealed: true }
    });

    return NextResponse.json({
      success: true
    });

  } catch (error) {
    console.error('Error marking API key as revealed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

