import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isUUID } from '@/lib/url-utils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const value = searchParams.get('value');
  const type = searchParams.get('type'); // 'workspace-slug' or 'board-slug'
  const workspaceSlugOrId = searchParams.get('workspaceSlugOrId'); // For board resolution

  if (!value || !type) {
    return NextResponse.json({ error: 'Missing value or type parameter' }, { status: 400 });
  }

  if (!['workspace-slug', 'board-slug'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  }

  try {
    let result: string | null = null;
    console.log('🔍 API Debug - resolving:', { type, value, workspaceSlugOrId });

    if (type === 'workspace-slug') {
      // Get workspace slug from ID or return slug if already a slug
      if (isUUID(value)) {
        const workspace = await prisma.workspace.findUnique({
          where: { id: value },
          select: { slug: true }
        });
        result = workspace?.slug || null;
      } else {
        // Already a slug, just return it
        result = value;
      }
      console.log('📍 Workspace slug result:', result);
    } else if (type === 'board-slug') {
      if (!workspaceSlugOrId) {
        return NextResponse.json({ error: 'workspaceSlugOrId required for board resolution' }, { status: 400 });
      }
      
      // First resolve workspace to ID if needed
      let workspaceId = workspaceSlugOrId;
      if (!isUUID(workspaceSlugOrId)) {
        const workspace = await prisma.workspace.findUnique({
          where: { slug: workspaceSlugOrId },
          select: { id: true }
        });
        workspaceId = workspace?.id || workspaceSlugOrId;
      }
      
      // Get board slug from ID or return slug if already a slug
      if (isUUID(value)) {
        const board = await prisma.taskBoard.findFirst({
          where: { 
            id: value,
            workspaceId: workspaceId
          },
          select: { slug: true }
        });
        result = board?.slug || null;
      } else {
        // Already a slug, just return it
        result = value;
      }
      console.log('📋 Board slug result:', result);
    }

    console.log('✅ API returning result:', result);
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Slug resolution error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 