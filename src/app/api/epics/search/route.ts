import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '';
    const workspace = url.searchParams.get('workspace');

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace parameter is required' }, { status: 400 });
    }

    // Check workspace access
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const workspaceAccess = await prisma.workspace.findFirst({
      where: {
        id: workspace,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      }
    });

    if (!workspaceAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Search epics
    const epics = await prisma.epic.findMany({
      where: {
        workspaceId: workspace,
        title: {
          contains: query,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        title: true,
        issueKey: true,
        status: true,
        priority: true,
        taskBoard: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: [
        // Exact matches first
        {
          title: 'asc'
        }
      ],
      take: 50
    });

    return NextResponse.json(epics);
  } catch (error) {
    console.error('Error searching epics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 