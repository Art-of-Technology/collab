import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const user = await prisma.user.findUnique({
      where: {
        id: currentUser.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        team: true,
        currentFocus: true,
        expertise: true,
        createdAt: true,
      },
    });
    
    return NextResponse.json(user);
  } catch (error) {
    console.error("[USER_GET]", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const {
      name,
      team,
      currentFocus,
      expertise,
    } = body;
    
    const validFields: any = {};
    
    if (name !== undefined) validFields.name = name;
    if (team !== undefined) validFields.team = team;
    if (currentFocus !== undefined) validFields.currentFocus = currentFocus;
    if (expertise !== undefined && Array.isArray(expertise)) validFields.expertise = expertise;
    
    const updatedUser = await prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: validFields,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        team: true,
        currentFocus: true,
        expertise: true,
      },
    });
    
    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("[USER_PATCH]", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
} 