import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { issueAccessWhere } from '@/lib/issue-finder';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const issueKey = searchParams.get('issueKey');

    if (!issueKey) {
      return NextResponse.json({ error: 'Issue key is required' }, { status: 400 });
    }

    // Find the issue and its workspace
    const issue = await prisma.issue.findFirst({
      // Only in a workspace the caller can use; the same key can exist in another one.
      where: {
        issueKey: issueKey,
        ...issueAccessWhere(user.id)
      },
      include: {
        project: {
          include: {
            workspace: {
              select: {
                id: true,
                slug: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    if (!issue.project?.workspace) {
      return NextResponse.json({ error: 'Issue workspace not found' }, { status: 404 });
    }

    return NextResponse.json({
      issueKey: issue.issueKey,
      issueId: issue.id,
      workspace: {
        id: issue.project.workspace.id,
        slug: issue.project.workspace.slug,
        name: issue.project.workspace.name
      },
      project: {
        id: issue.project.id,
        name: issue.project.name,
        slug: issue.project.slug
      }
    });

  } catch (error) {
    console.error('Error resolving issue:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
