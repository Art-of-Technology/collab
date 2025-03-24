import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const body = await req.json();
    const { name, team, currentFocus, expertise, slackId } = body;
    
    // Validate the input
    if (name && typeof name !== "string") {
      return new NextResponse("Invalid name", { status: 400 });
    }
    
    if (team && typeof team !== "string") {
      return new NextResponse("Invalid team", { status: 400 });
    }
    
    if (currentFocus && typeof currentFocus !== "string") {
      return new NextResponse("Invalid currentFocus", { status: 400 });
    }
    
    if (expertise && !Array.isArray(expertise)) {
      return new NextResponse("Invalid expertise", { status: 400 });
    }
    
    if (slackId && typeof slackId !== "string") {
      return new NextResponse("Invalid slackId", { status: 400 });
    }
    
    // Update the user
    const updatedUser = await prisma.user.upsert({
      where: {
        id: user.id,
      },
      update: {
        name: name || undefined,
        team: team || undefined,
        currentFocus: currentFocus || undefined,
        expertise: expertise || undefined,
        slackId: slackId || undefined,
      },
      create: {
        id: user.id,
        name: name || null,
        email: user.email || null,
        role: user.role || "developer",
        team: team || null,
        currentFocus: currentFocus || null,
        expertise: expertise || [],
        slackId: slackId || null,
      },
    });
    
    return NextResponse.json({
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        team: updatedUser.team,
        currentFocus: updatedUser.currentFocus,
        expertise: updatedUser.expertise,
        slackId: updatedUser.slackId,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 