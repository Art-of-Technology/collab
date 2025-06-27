import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { BoardImportData, ImportResult } from "@/types/board-import";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { importData, workspaceId }: { importData: BoardImportData; workspaceId: string } = await request.json();

    if (!importData || !workspaceId) {
      return NextResponse.json(
        { error: "Import data and workspace ID are required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 403 }
      );
    }

    const result: ImportResult = {
      success: false,
      errors: [],
      warnings: [],
      created: {
        columns: 0,
        milestones: 0,
        epics: 0,
        stories: 0,
        tasks: 0
      }
    };

    // Use transaction to ensure data consistency
    await prisma.$transaction(async (tx) => {
      // 1. Create Board
      const board = await tx.taskBoard.create({
        data: {
          name: importData.board.name,
          description: importData.board.description,
          issuePrefix: importData.board.issuePrefix,
          nextIssueNumber: 1,
          workspaceId,
          isDefault: false
        }
      });

      result.boardId = board.id;
      result.created.board = board;

      // 2. Create Columns (if provided, otherwise use defaults)
      const columnsToCreate = importData.columns || [
        { name: "To Do", order: 0, color: "#6366F1" },
        { name: "In Progress", order: 1, color: "#EC4899" },
        { name: "Review", order: 2, color: "#F59E0B" },
        { name: "Done", order: 3, color: "#10B981" },
      ];

      const createdColumns = await Promise.all(
        columnsToCreate.map(col => 
          tx.taskColumn.create({
            data: {
              name: col.name,
              order: col.order,
              color: col.color || "#6366F1",
              description: col.description,
              taskBoardId: board.id
            }
          })
        )
      );

      result.created.columns = createdColumns.length;

      // Create column name to ID mapping
      const columnMap = new Map<string, string>();
      createdColumns.forEach(col => columnMap.set(col.name, col.id));

      // Helper function to find user by email
      const findUserByEmail = async (email?: string) => {
        if (!email) return null;
        return await tx.user.findUnique({
          where: { email },
          select: { id: true }
        });
      };

      // Helper function to create or find labels
      const createOrFindLabels = async (labelNames: string[]) => {
        if (!labelNames || labelNames.length === 0) return [];
        
        const labelIds = await Promise.all(
          labelNames.map(async (name) => {
            const existing = await tx.taskLabel.findFirst({
              where: { name, workspaceId }
            });
            
            if (existing) {
              return existing.id;
            }
            
            const newLabel = await tx.taskLabel.create({
              data: {
                name,
                color: "#6366F1",
                workspaceId
              }
            });
            
            return newLabel.id;
          })
        );
        
        return labelIds;
      };

      // 3. Create Milestones
      for (const [milestoneIndex, milestoneData] of importData.milestones.entries()) {
        const assignee = await findUserByEmail(milestoneData.assigneeEmail);
        const columnId = milestoneData.columnName ? columnMap.get(milestoneData.columnName) : null;
        const labelIds = await createOrFindLabels(milestoneData.labels || []);

        // Generate issue key for milestone
        let issueKey = null;
        if (board.issuePrefix) {
          const updatedBoard = await tx.taskBoard.update({
            where: { id: board.id },
            data: { nextIssueNumber: { increment: 1 } }
          });
          issueKey = `${board.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
        }

        const milestone = await tx.milestone.create({
          data: {
            title: milestoneData.title,
            description: milestoneData.description,
            status: milestoneData.status || "planned",
            startDate: milestoneData.startDate ? new Date(milestoneData.startDate) : null,
            dueDate: milestoneData.dueDate ? new Date(milestoneData.dueDate) : null,
            color: milestoneData.color || "#6366F1",
            columnId,
            position: milestoneData.position ?? milestoneIndex,
            assigneeId: assignee?.id,
            reporterId: session.user.id,
            taskBoardId: board.id,
            workspaceId,
            issueKey,
            labels: labelIds.length > 0 ? {
              connect: labelIds.map(id => ({ id }))
            } : undefined
          }
        });

        result.created.milestones++;

        // 4. Create Epics for this milestone
        for (const [epicIndex, epicData] of milestoneData.epics.entries()) {
          const epicAssignee = await findUserByEmail(epicData.assigneeEmail);
          const epicColumnId = epicData.columnName ? columnMap.get(epicData.columnName) : columnId;
          const epicLabelIds = await createOrFindLabels(epicData.labels || []);

          // Generate issue key for epic
          let epicIssueKey = null;
          if (board.issuePrefix) {
            const updatedBoard = await tx.taskBoard.update({
              where: { id: board.id },
              data: { nextIssueNumber: { increment: 1 } }
            });
            epicIssueKey = `${board.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
          }

          const epic = await tx.epic.create({
            data: {
              title: epicData.title,
              description: epicData.description,
              status: epicData.status || "backlog",
              priority: epicData.priority || "medium",
              startDate: epicData.startDate ? new Date(epicData.startDate) : null,
              dueDate: epicData.dueDate ? new Date(epicData.dueDate) : null,
              color: epicData.color || "#8B5CF6",
              columnId: epicColumnId,
              position: epicData.position ?? epicIndex,
              assigneeId: epicAssignee?.id,
              reporterId: session.user.id,
              milestoneId: milestone.id,
              taskBoardId: board.id,
              workspaceId,
              issueKey: epicIssueKey,
              labels: epicLabelIds.length > 0 ? {
                connect: epicLabelIds.map(id => ({ id }))
              } : undefined
            }
          });

          result.created.epics++;

          // 5. Create Stories for this epic
          for (const [storyIndex, storyData] of epicData.stories.entries()) {
            const storyAssignee = await findUserByEmail(storyData.assigneeEmail);
            const storyColumnId = storyData.columnName ? columnMap.get(storyData.columnName) : epicColumnId;
            const storyLabelIds = await createOrFindLabels(storyData.labels || []);

            // Generate issue key for story
            let storyIssueKey = null;
            if (board.issuePrefix) {
              const updatedBoard = await tx.taskBoard.update({
                where: { id: board.id },
                data: { nextIssueNumber: { increment: 1 } }
              });
              storyIssueKey = `${board.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
            }

            const story = await tx.story.create({
              data: {
                title: storyData.title,
                description: storyData.description,
                status: storyData.status || "backlog",
                priority: storyData.priority || "medium",
                type: storyData.type || "user-story",
                storyPoints: storyData.storyPoints,
                color: storyData.color || "#3B82F6",
                columnId: storyColumnId,
                position: storyData.position ?? storyIndex,
                assigneeId: storyAssignee?.id,
                reporterId: session.user.id,
                epicId: epic.id,
                taskBoardId: board.id,
                workspaceId,
                issueKey: storyIssueKey,
                labels: storyLabelIds.length > 0 ? {
                  connect: storyLabelIds.map(id => ({ id }))
                } : undefined
              }
            });

            result.created.stories++;

            // 6. Create Tasks for this story
            for (const [taskIndex, taskData] of storyData.tasks.entries()) {
              const taskAssignee = await findUserByEmail(taskData.assigneeEmail);
              const taskColumnId = taskData.columnName ? columnMap.get(taskData.columnName) : storyColumnId;
              const taskLabelIds = await createOrFindLabels(taskData.labels || []);

              // Generate issue key for task
              let taskIssueKey = null;
              if (board.issuePrefix) {
                const updatedBoard = await tx.taskBoard.update({
                  where: { id: board.id },
                  data: { nextIssueNumber: { increment: 1 } }
                });
                taskIssueKey = `${board.issuePrefix}-${updatedBoard.nextIssueNumber - 1}`;
              }

              await tx.task.create({
                data: {
                  title: taskData.title,
                  description: taskData.description,
                  status: taskData.status,
                  priority: taskData.priority || "medium",
                  type: taskData.type || "task",
                  storyPoints: taskData.storyPoints,
                  dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
                  columnId: taskColumnId,
                  position: taskData.position ?? taskIndex,
                  assigneeId: taskAssignee?.id,
                  reporterId: session.user.id,
                  storyId: story.id,
                  epicId: epic.id,
                  milestoneId: milestone.id,
                  taskBoardId: board.id,
                  workspaceId,
                  issueKey: taskIssueKey,
                  labels: taskLabelIds.length > 0 ? {
                    connect: taskLabelIds.map(id => ({ id }))
                  } : undefined,
                  activity: {
                    create: {
                      action: "created",
                      userId: session.user.id,
                    },
                  },
                }
              });

              result.created.tasks++;
            }
          }
        }
      }
    });

    result.success = true;

    return NextResponse.json(result, { status: 201 });

  } catch (error) {
    console.error("Error importing board data:", error);
    return NextResponse.json(
      { 
        error: "Failed to import board data",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 