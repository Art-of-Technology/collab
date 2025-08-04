// src/app/api/workspaces/[workspaceId]/tasks/[taskId]/relations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{
    workspaceId: string;
    taskId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, taskId } = await params;

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get all task relations
    const relations = await prisma.taskRelations.findMany({
      where: { taskId },
      select: {
        relatedItemId: true,
        relatedItemType: true,
        createdAt: true
      }
    });

    // Group by relation type
    const epicIds = relations.filter(r => r.relatedItemType === 'EPIC').map(r => r.relatedItemId);
    const storyIds = relations.filter(r => r.relatedItemType === 'STORY').map(r => r.relatedItemId);
    const milestoneIds = relations.filter(r => r.relatedItemType === 'MILESTONE').map(r => r.relatedItemId);
    const parentTaskIds = relations.filter(r => r.relatedItemType === 'PARENT_TASK').map(r => r.relatedItemId);

    // Fetch all details in parallel
    const [epics, stories, milestones, parentTasks] = await Promise.all([
      epicIds.length > 0 ? prisma.epic.findMany({
        where: { 
          id: { in: epicIds },
          workspaceId
        },
        select: {
          id: true,
          title: true,
          status: true,
          issueKey: true,
          description: true
        }
      }) : [],
      
      storyIds.length > 0 ? prisma.story.findMany({
        where: { 
          id: { in: storyIds },
          workspaceId
        },
        select: {
          id: true,
          title: true,
          status: true,
          issueKey: true,
          description: true
        }
      }) : [],
      
      milestoneIds.length > 0 ? prisma.milestone.findMany({
        where: { 
          id: { in: milestoneIds },
          workspaceId
        },
        select: {
          id: true,
          title: true,
          status: true,
          description: true,
          dueDate: true
        }
      }) : [],
      
      parentTaskIds.length > 0 ? prisma.task.findMany({
        where: { 
          id: { in: parentTaskIds },
          workspaceId
        },
        select: {
          id: true,
          title: true,
          status: true,
          issueKey: true,
          description: true
        }
      }) : []
    ]);

    return NextResponse.json({
      epics,
      stories,
      milestones,
      parentTasks
    });

  } catch (error) {
    console.error('Get task relations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, taskId } = await params;
    const body = await request.json();
    const { relatedItemId, relatedItemType } = body;

    if (!relatedItemId || !relatedItemType) {
      return NextResponse.json(
        { error: 'relatedItemId and relatedItemType are required' },
        { status: 400 }
      );
    }

    // Validate relation type
    const validTypes = ['EPIC', 'STORY', 'MILESTONE', 'PARENT_TASK'];
    if (!validTypes.includes(relatedItemType)) {
      return NextResponse.json(
        { error: 'Invalid relatedItemType' },
        { status: 400 }
      );
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify item belongs to workspace (could be task, epic, story, or milestone)
let sourceItem;
const itemChecks = [
  prisma.task.findFirst({ where: { id: taskId, workspaceId } }),
  prisma.epic.findFirst({ where: { id: taskId, workspaceId } }),
  prisma.story.findFirst({ where: { id: taskId, workspaceId } }),
  prisma.milestone.findFirst({ where: { id: taskId, workspaceId } })
];

const results = await Promise.all(itemChecks);
sourceItem = results.find(item => item !== null);

if (!sourceItem) {
  return NextResponse.json({ error: 'Source item not found' }, { status: 404 });
}

    // Verify related item exists and belongs to workspace
    let relatedItem;
    switch (relatedItemType) {
      case 'EPIC':
        relatedItem = await prisma.epic.findFirst({
          where: { id: relatedItemId, workspaceId }
        });
        break;
      case 'STORY':
        relatedItem = await prisma.story.findFirst({
          where: { id: relatedItemId, workspaceId }
        });
        break;
      case 'MILESTONE':
        relatedItem = await prisma.milestone.findFirst({
          where: { id: relatedItemId, workspaceId }
        });
        break;
      case 'PARENT_TASK':
        relatedItem = await prisma.task.findFirst({
          where: { id: relatedItemId, workspaceId }
        });
        break;
    }

    if (!relatedItem) {
      return NextResponse.json({ error: 'Related item not found' }, { status: 404 });
    }

    // Check if relation already exists
    const existingRelation = await prisma.taskRelations.findFirst({
      where: {
        taskId,
        relatedItemId,
        relatedItemType
      }
    });

    if (existingRelation) {
      return NextResponse.json({ error: 'Relation already exists' }, { status: 409 });
    }

    // Create new relation
    const relation = await prisma.taskRelations.create({
      data: {
        taskId,
        relatedItemId,
        relatedItemType
      }
    });

    return NextResponse.json({
      success: true,
      relation: {
        id: relation.id,
        relatedItemType: relation.relatedItemType,
        relatedItem
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Create task relation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, taskId } = await params;
    const body = await request.json();
    const { relatedItemId, relatedItemType } = body;

    if (!relatedItemId || !relatedItemType) {
      return NextResponse.json(
        { error: 'relatedItemId and relatedItemType are required' },
        { status: 400 }
      );
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete relation
    const deletedRelation = await prisma.taskRelations.deleteMany({
      where: {
        taskId,
        relatedItemId,
        relatedItemType
      }
    });

    if (deletedRelation.count === 0) {
      return NextResponse.json({ error: 'Relation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Delete task relation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}