import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { z } from "zod";

// Validation schema for user lookup
const userLookupSchema = z.object({
  usernames: z.array(z.string()).min(1, "At least one username is required"),
  workspaceId: z.string().optional(),
});

// POST /api/users/lookup - Look up users by username
export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Validate request body
    const body = await req.json();
    const validationResult = userLookupSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { usernames, workspaceId } = validationResult.data;
    
    // Look up users by usernames
    // We use email to match username parts for simplicity
    // email is in format username@domain.com
    const users = await prisma.user.findMany({
      where: {
        OR: usernames.map(username => ({
          OR: [
            { name: { equals: username, mode: 'insensitive' } },
            { email: { contains: username, mode: 'insensitive' } }
          ]
        })),
        ...(workspaceId ? {
          OR: [
            { ownedWorkspaces: { some: { id: workspaceId } } },
            { workspaceMemberships: { some: { workspaceId } } }
          ]
        } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });
    
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error looking up users:", error);
    return NextResponse.json(
      { error: "Failed to look up users" },
      { status: 500 }
    );
  }
} 