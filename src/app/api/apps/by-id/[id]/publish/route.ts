import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const PublishRequestSchema = z.object({
  status: z.enum(['PUBLISHED', 'DRAFT', 'SUSPENDED'])
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Parse and validate request body
    const body = await request.json();
    const { status } = PublishRequestSchema.parse(body);

    // Check if app exists
    const existingApp = await prisma.app.findUnique({
      where: { id }
    });

    if (!existingApp) {
      return NextResponse.json(
        { error: 'App not found' },
        { status: 404 }
      );
    }

    // Update app status
    const updatedApp = await prisma.app.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      app: {
        id: updatedApp.id,
        name: updatedApp.name,
        slug: updatedApp.slug,
        status: updatedApp.status,
        updatedAt: updatedApp.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating app status:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
