import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * Secure endpoint to get authentication token for "Try it" functionality
 * This endpoint validates the user's session server-side before returning any token info
 */
export async function GET(request: NextRequest) {
  try {
    // Validate user session server-side
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Return a placeholder token since we don't store OAuth access tokens
    // Users need to obtain their OAuth access token through the OAuth flow
    // and enter it manually in the "Try it" modal
    return NextResponse.json({
      token: null,
      message: 'Please obtain your OAuth access token through the OAuth flow and enter it manually in the Authorization header.'
    });
  } catch (error) {
    console.error('Error fetching auth token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

