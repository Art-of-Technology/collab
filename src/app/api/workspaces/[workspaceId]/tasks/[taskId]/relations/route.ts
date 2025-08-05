// src/app/api/workspaces/[workspaceId]/tasks/[taskId]/relations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, taskId } = await params;

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Load task along with its related entities
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: {
        epic: {
          select: {
            id: true,
            title: true,
            status: true,
            issueKey: true,
            description: true,
          },
        },
        story: {
          select: {
            id: true,
            title: true,
            status: true,
            issueKey: true,
            description: true,
          },
        },
        milestone: {
          select: {
            id: true,
            title: true,
            status: true,
            description: true,
            dueDate: true,
          },
        },
        parentTask: {
          select: {
            id: true,
            title: true,
            status: true,
            issueKey: true,
            description: true,
          },
        },
        subtasks: {
          select: {
            id: true,
            title: true,
            status: true,
            issueKey: true,
            description: true,
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      epics: task.epic ? [task.epic] : [],
      stories: task.story ? [task.story] : [],
      milestones: task.milestone ? [task.milestone] : [],
      parentTasks: task.parentTask ? [task.parentTask] : [],
      subtasks: task.subtasks,
    });
  } catch (error) {
    console.error("Get task relations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, taskId } = await params;
    const body = await request.json();
    const { relatedItemId, relatedItemType } = body;

    if (!relatedItemId || !relatedItemType) {
      return NextResponse.json(
        { error: "relatedItemId and relatedItemType are required" },
        { status: 400 }
      );
    }

    // Validate relation type
    const validTypes = ["EPIC", "STORY", "MILESTONE", "PARENT_TASK"];
    if (!validTypes.includes(relatedItemType)) {
      return NextResponse.json(
        { error: "Invalid relatedItemType" },
        { status: 400 }
      );
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify task belongs to workspace
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Verify related item exists and belongs to workspace
    let relatedItem;
    switch (relatedItemType) {
      case "EPIC":
        relatedItem = await prisma.epic.findFirst({
          where: { id: relatedItemId, workspaceId },
        });
        break;
      case "STORY":
        relatedItem = await prisma.story.findFirst({
          where: { id: relatedItemId, workspaceId },
        });
        break;
      case "MILESTONE":
        relatedItem = await prisma.milestone.findFirst({
          where: { id: relatedItemId, workspaceId },
        });
        break;
      case "PARENT_TASK":
        relatedItem = await prisma.task.findFirst({
          where: { id: relatedItemId, workspaceId },
        });
        break;
    }

    if (!relatedItem) {
      return NextResponse.json(
        { error: "Related item not found" },
        { status: 404 }
      );
    }

    // Update the task with the new relation
    let updateData: Record<string, any> = {};
    switch (relatedItemType) {
      case "EPIC":
        if (task.epicId === relatedItemId) {
          return NextResponse.json(
            { error: "Relation already exists" },
            { status: 409 }
          );
        }
        updateData = { epicId: relatedItemId };
        break;
      case "STORY":
        if (task.storyId === relatedItemId) {
          return NextResponse.json(
            { error: "Relation already exists" },
            { status: 409 }
          );
        }
        updateData = { storyId: relatedItemId };
        break;
      case "MILESTONE":
        if (task.milestoneId === relatedItemId) {
          return NextResponse.json(
            { error: "Relation already exists" },
            { status: 409 }
          );
        }
        updateData = { milestoneId: relatedItemId };
        break;
      case "PARENT_TASK":
        if (task.parentTaskId === relatedItemId) {
          return NextResponse.json(
            { error: "Relation already exists" },
            { status: 409 }
          );
        }
        updateData = { parentTaskId: relatedItemId };
        break;
    }

    await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    return NextResponse.json(
      {
        success: true,
        relation: {
          relatedItemType,
          relatedItem,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create task relation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, taskId } = await params;
    const body = await request.json();
    const { relatedItemId, relatedItemType } = body;

    if (!relatedItemId || !relatedItemType) {
      return NextResponse.json(
        { error: "relatedItemId and relatedItemType are required" },
        { status: 400 }
      );
    }

    // Check workspace membership
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify task belongs to workspace
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let updateData: Record<string, any> = {};
    switch (relatedItemType) {
      case "EPIC":
        if (task.epicId !== relatedItemId) {
          return NextResponse.json(
            { error: "Relation not found" },
            { status: 404 }
          );
        }
        updateData = { epicId: null };
        break;
      case "STORY":
        if (task.storyId !== relatedItemId) {
          return NextResponse.json(
            { error: "Relation not found" },
            { status: 404 }
          );
        }
        updateData = { storyId: null };
        break;
      case "MILESTONE":
        if (task.milestoneId !== relatedItemId) {
          return NextResponse.json(
            { error: "Relation not found" },
            { status: 404 }
          );
        }
        updateData = { milestoneId: null };
        break;
      case "PARENT_TASK":
        if (task.parentTaskId !== relatedItemId) {
          return NextResponse.json(
            { error: "Relation not found" },
            { status: 404 }
          );
        }
        updateData = { parentTaskId: null };
        break;
    }

    await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete task relation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
