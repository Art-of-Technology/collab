import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Find the default view for the project
    const defaultView = await prisma.view.findFirst({
      where: {
        projectIds: { has: projectId },
        isDefault: true
      },
      select: {
        id: true,
        slug: true,
        name: true
      }
    });

    if (!defaultView) {
      return NextResponse.json({ error: 'No default view found' }, { status: 404 });
    }

    return NextResponse.json({
      id: defaultView.id,
      slug: defaultView.slug,
      name: defaultView.name
    });

  } catch (error) {
    console.error('Error finding default view for project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
