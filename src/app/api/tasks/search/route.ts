import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// GET /api/tasks/search - Search for tasks to mention by title or key
export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Get the search query from URL params
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    
    // If no query provided, we'll return all tasks (with limit)
    const searchQuery = query?.trim() || "";
    
    // Get the workspace context if available
    const workspaceId = url.searchParams.get("workspace");
    
    // Basic search query to search by title or issueKey
    let tasks;
    
    if (workspaceId) {
      // If we have a workspace ID, only search for tasks within that workspace
      const whereCondition: any = {
        AND: [
          { workspaceId },
          { 
            taskBoard: {
              workspaceId
            }
          }
        ]
      };

      // Add search conditions only if we have a search query
      if (searchQuery.length > 0) {
        whereCondition.OR = [
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { issueKey: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      tasks = await prisma.task.findMany({
        where: whereCondition,
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
        take: 10,
        orderBy: [
          { updatedAt: 'desc' }
        ]
      });
    } else {
      // If no workspace is specified, search all tasks user has access to
      const whereCondition: any = {
        AND: [
          {
            OR: [
              { assigneeId: currentUser.id },
              { reporterId: currentUser.id },
              {
                taskBoard: {
                  workspace: {
                    OR: [
                      { ownerId: currentUser.id },
                      { members: { some: { userId: currentUser.id } } }
                    ]
                  }
                }
              }
            ]
          }
        ]
      };

      // Add search conditions only if we have a search query
      if (searchQuery.length > 0) {
        whereCondition.OR = [
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { issueKey: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      tasks = await prisma.task.findMany({
        where: whereCondition,
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
        take: 10,
        orderBy: [
          { updatedAt: 'desc' }
        ]
      });
    }
    
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error searching tasks:", error);
    return NextResponse.json(
      { error: "Failed to search tasks" },
      { status: 500 }
    );
  }
} 