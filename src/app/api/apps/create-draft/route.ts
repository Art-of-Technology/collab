import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';
import { generateClientCredentials, encryptToken } from '@/lib/apps/crypto';
import { z } from 'zod';
import { isReservedSlug } from '@/lib/apps/validation';

const prisma = new PrismaClient();

// Schema for creating a draft app
const CreateDraftAppSchema = z.object({
  name: z.string()
    .min(1, 'App name is required')
    .max(100, 'App name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'App name contains invalid characters'),
  publisherId: z.string().min(1, 'Publisher ID is required').optional()
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validation = CreateDraftAppSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, publisherId } = validation.data;

    // Generate a slug from the app name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Reserved slugs that cannot be used
    const reservedSlug = isReservedSlug(slug);
    
    if (reservedSlug) {
      return NextResponse.json(
        { error: `The slug "${slug}" is reserved and cannot be used` },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existingApp = await prisma.app.findUnique({
      where: { slug }
    });

    if (existingApp) {
      return NextResponse.json(
        { error: `An app with slug "${slug}" already exists. Please choose a different name.` },
        { status: 409 }
      );
    }

    // Generate OAuth credentials
    const credentials = await generateClientCredentials();
    
    // Encrypt the client secret for storage
    const encryptedSecret = await encryptToken(credentials.clientSecret);

    // Create app with OAuth credentials in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the app in DRAFT status
      const newApp = await tx.app.create({
        data: {
          name,
          slug,
          manifestUrl: null, // Will be set when manifest is submitted
          publisherId: publisherId || session.user.id,
          userId: session.user.id,
          status: 'DRAFT',
          visibility: 'PRIVATE'
        }
      });

      // Create OAuth client with credentials
      const oauthClient = await tx.appOAuthClient.create({
        data: {
          appId: newApp.id,
          clientId: credentials.clientId,
          clientSecret: encryptedSecret,
          clientType: 'confidential',
          tokenEndpointAuthMethod: 'client_secret_basic',
          redirectUris: [],
          postLogoutRedirectUris: [],
          responseTypes: ['code'],
          grantTypes: ['authorization_code', 'refresh_token'],
          apiKey: credentials.apiKey
        }
      });

      return { app: newApp, oauthClient, plainSecret: credentials.clientSecret };
    });

    await prisma.$disconnect();

    // Return the app data and credentials (IMPORTANT: plainSecret is only shown once)
    return NextResponse.json({
      success: true,
      app: {
        id: result.app.id,
        name: result.app.name,
        slug: result.app.slug,
        status: result.app.status,
        createdAt: result.app.createdAt
      },
      credentials: {
        clientId: credentials.clientId,
        clientSecret: result.plainSecret, // Only returned on creation
        apiKey: credentials.apiKey
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating draft app:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

