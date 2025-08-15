import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// GET /api/users/search - Search for users to mention by name or email
export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Get the search query from URL params
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    
    // If no query provided, we'll return all users (with limit)
    const searchQuery = query?.trim() || "";
    
    // Get the workspace context if available
    const workspaceId = url.searchParams.get("workspace");
    
    // Basic search query to search by name or email
    let users;
    
    if (workspaceId) {
      // Resolve workspace by ID or slug
      const workspace = await prisma.workspace.findFirst({
        where: {
          AND: [
            {
              OR: [
                { id: workspaceId },
                { slug: workspaceId }
              ]
            },
            {
              OR: [
                { ownerId: currentUser.id },
                { members: { some: { userId: currentUser.id } } }
              ]
            }
          ]
        },
        select: { id: true }
      });

      if (!workspace) {
        return NextResponse.json([], { status: 200 }); // Return empty array if workspace not found or no access
      }

      // If we have a workspace, only search for users within that workspace
      const whereCondition: any = {
        AND: [
          { id: { not: currentUser.id } },  // Exclude the current user
          {
            OR: [
              { ownedWorkspaces: { some: { id: workspace.id } } },
              { workspaceMemberships: { some: { workspaceId: workspace.id } } }
            ]
          }
        ]
      };

      // Add search conditions only if we have a search query
      if (searchQuery.length > 0) {
        whereCondition.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { email: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      users = await prisma.user.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          useCustomAvatar: true,
          avatarAccessory: true, 
          avatarBrows: true,
          avatarEyes: true,
          avatarEyewear: true,
          avatarHair: true,
          avatarMouth: true,
          avatarNose: true,
          avatarSkinTone: true,
        },
        take: 10,
      });
    } else {
      // If no workspace is specified, search all users
      const whereCondition: any = {
        AND: [
          { id: { not: currentUser.id } }  // Exclude the current user
        ]
      };

      // Add search conditions only if we have a search query
      if (searchQuery.length > 0) {
        whereCondition.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { email: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      users = await prisma.user.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          useCustomAvatar: true,
          avatarAccessory: true, 
          avatarBrows: true,
          avatarEyes: true,
          avatarEyewear: true,
          avatarHair: true,
          avatarMouth: true,
          avatarNose: true,
          avatarSkinTone: true,
        },
        take: 10,
      });
    }
    
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
} 