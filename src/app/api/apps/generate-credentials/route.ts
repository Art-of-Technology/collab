import { NextRequest, NextResponse } from 'next/server';
import { generateClientCredentials } from '@/lib/apps/crypto';
import { getAuthSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Generate secure client credentials
    const credentials = await generateClientCredentials();

    return NextResponse.json({
      success: true,
      credentials: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret
      }
    });

  } catch (error) {
    console.error('Error generating credentials:', error);
    return NextResponse.json(
      { error: 'Failed to generate credentials' },
      { status: 500 }
    );
  }
}
