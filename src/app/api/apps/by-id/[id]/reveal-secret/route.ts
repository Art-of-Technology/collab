import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';
import { decryptToken } from '@/lib/apps/crypto';

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

    // Get the app with OAuth client
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

    if (app.oauthClient.clientType !== 'confidential') {
      return NextResponse.json({ error: 'Only confidential clients have secrets' }, { status: 400 });
    }

    if (app.oauthClient.tokenEndpointAuthMethod !== 'client_secret_basic') {
      return NextResponse.json({ 
        error: 'Client secret is only available for client_secret_basic authentication method' 
      }, { status: 400 });
    }

    if (!app.oauthClient.clientSecret) {
      return NextResponse.json({ error: 'No client secret available' }, { status: 404 });
    }

    try {
      // Decrypt the client secret
      const decryptedSecret = await decryptToken(Buffer.from(app.oauthClient.clientSecret));

      // Mark the secret as revealed so it can't be shown again
      await prisma.appOAuthClient.update({
        where: { id: app.oauthClient.id },
        data: { secretRevealed: true }
      });

      return NextResponse.json({
        success: true,
        clientSecret: decryptedSecret,
        warning: 'This client secret will not be shown again. Store it securely.'
      });

    } catch (decryptionError) {
      console.error('Failed to decrypt client secret:', decryptionError);
      return NextResponse.json({ 
        error: 'Failed to decrypt client secret' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error revealing client secret:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
