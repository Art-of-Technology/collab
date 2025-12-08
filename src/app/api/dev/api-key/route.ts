import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

// Rate limiting: Simple in-memory store
// NOTE: This implementation is suitable for single-instance deployments.
// For production with multiple instances, use a persistent store like Redis
// to ensure rate limiting works correctly across all instances.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  
  // Cleanup expired entries periodically (every 100 calls to prevent memory leak)
  if (rateLimitMap.size > 0 && Math.random() < 0.01) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }
  
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userLimit.count++;
  return true;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting
    if (!checkRateLimit(session.user.id)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Get user's most recently created app with an API key
    // Only return API key if the app belongs to the authenticated user
    const app = await prisma.app.findFirst({
      where: {
        userId: session.user.id, // Critical: Ensure user owns the app
        oauthClient: {
          apiKey: {
            not: null
          }
        }
      },
      include: {
        oauthClient: {
          select: {
            apiKey: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!app?.oauthClient?.apiKey) {
      return NextResponse.json({ apiKey: null });
    }

    // API key is a public identifier for third-party apps (similar to OAuth client ID)
    // It's safe to display in code examples as it's meant to be used by developers
    // Only the app owner can see their own API keys
    return NextResponse.json({ apiKey: app.oauthClient.apiKey });
  } catch (error) {
    console.error('Error fetching API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

