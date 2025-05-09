import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Define the type for the user search result based on the Prisma select
type UserSearchResult = {
  id: string;
  name: string | null;
  image: string | null;
  email: string | null;
  useCustomAvatar: boolean;
  avatarAccessory: number | null;
  avatarBrows: number | null;
  avatarEyes: number | null;
  avatarEyewear: number | null;
  avatarHair: number | null;
  avatarMouth: number | null;
  avatarNose: number | null;
  avatarSkinTone: number | null;
};

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
    
    if (!query || query.length < 1) {
      return NextResponse.json([]);
    }
    
    // Get the workspace context if available
    const workspaceId = url.searchParams.get("workspaceId");
    
    // Basic search query to search by name or email
    let users: UserSearchResult[];
    
    if (workspaceId) {
      // If we have a workspace ID, only search for users within that workspace
      users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
          AND: [
            { id: { not: currentUser.id } },  // Exclude the current user
            {
              OR: [
                { ownedWorkspaces: { some: { id: workspaceId } } },
                { workspaceMemberships: { some: { workspaceId } } }
              ]
            }
          ]
        },
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
      // If no workspaceId is specified, return an empty array as requested
      users = [];
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