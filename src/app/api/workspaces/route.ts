import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

// GET /api/workspaces - Get all workspaces where user is a member
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to access this resource.' },
        { status: 401 }
      );
    }

    // Get workspaces where user is a member or owner
    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

// POST /api/workspaces - Create a new workspace
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to access this resource.' },
        { status: 401 }
      );
    }
    
    // Check if user is an admin
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can create workspaces.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, slug, description, logoUrl } = body;

    // Validate required fields
    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Name and slug are required' },
        { status: 400 }
      );
    }

    // Check if slug is unique
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { slug }
    });

    if (existingWorkspace) {
      return NextResponse.json(
        { error: 'A workspace with this slug already exists' },
        { status: 400 }
      );
    }

    // Check user's workspace limit (free plan limit is 3)
    const ownedWorkspacesCount = await prisma.workspace.count({
      where: { ownerId: session.user.id }
    });

    if (ownedWorkspacesCount >= 3) {
      return NextResponse.json(
        { error: 'Free plan users can create a maximum of 3 workspaces. Please upgrade to create more.' },
        { status: 403 }
      );
    }

    // Create the workspace
    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug,
        description,
        logoUrl,
        ownerId: session.user.id,
        members: {
          create: {
            userId: session.user.id,
            role: 'owner'
          }
        }
      }
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    console.error('Error creating workspace:', error);
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500 }
    );
  }
} 