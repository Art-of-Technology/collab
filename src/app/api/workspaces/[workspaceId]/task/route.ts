// src/app/api/workspaces/[workspaceId]/tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 });
    }

    // Get all tasks in workspace
    const tasks = await prisma.task.findMany({
      where: {
        workspaceId: workspaceId
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        issueKey: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(tasks);
    
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = await params;
    const body = await request.json();
    
    // Extract task data and relations
    const {
      title,
      description,
      status = 'TODO',
      priority,
      dueDate,
      assigneeId,
      // Relations from creation form
      epicIds = [],
      storyIds = [],
      milestoneIds = [],
      parentTaskIds = []
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 404 });
    }

    // Create task (removed createdById field)
    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : null,
        workspaceId,
        assigneeId
        // Removed createdById since it doesn't exist in schema
      }
    });

    // ✅ Create relations in TaskRelations table (fixed types)
    const relationPromises: Promise<any>[] = [];

    // Epic relations
    (epicIds as string[]).forEach((epicId: string) => {
      relationPromises.push(
        prisma.taskRelations.create({
          data: {
            taskId: task.id,
            relatedItemId: epicId,
            relatedItemType: 'EPIC'
          }
        })
      );
    });

    // Story relations  
    (storyIds as string[]).forEach((storyId: string) => {
      relationPromises.push(
        prisma.taskRelations.create({
          data: {
            taskId: task.id,
            relatedItemId: storyId,
            relatedItemType: 'STORY'
          }
        })
      );
    });

    // Milestone relations
    (milestoneIds as string[]).forEach((milestoneId: string) => {
      relationPromises.push(
        prisma.taskRelations.create({
          data: {
            taskId: task.id,
            relatedItemId: milestoneId,
            relatedItemType: 'MILESTONE'
          }
        })
      );
    });

    // Parent task relations
    (parentTaskIds as string[]).forEach((parentTaskId: string) => {
      relationPromises.push(
        prisma.taskRelations.create({
          data: {
            taskId: task.id,
            relatedItemId: parentTaskId,
            relatedItemType: 'PARENT_TASK'
          }
        })
      );
    });

    // Execute all relation creations
    if (relationPromises.length > 0) {
      await Promise.all(relationPromises);
      console.log(`✅ Created ${relationPromises.length} relations for task ${task.id}`);
    }

    return NextResponse.json(task, { status: 201 });
    
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}