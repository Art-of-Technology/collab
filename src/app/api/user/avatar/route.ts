import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const body = await req.json();
    const { 
      avatarSkinTone, 
      avatarEyes, 
      avatarBrows, 
      avatarMouth, 
      avatarNose, 
      avatarHair, 
      avatarEyewear, 
      avatarAccessory, 
      useCustomAvatar 
    } = body;
    
    // Get the current user
    const currentUser = await prisma.user.findUnique({
      where: {
        email: session.user.email
      }
    });
    
    if (!currentUser) {
      return new NextResponse("User not found", { status: 404 });
    }
    
    // Update the user's avatar settings
    const updatedUser = await prisma.user.update({
      where: {
        id: currentUser.id
      },
      data: {
        avatarSkinTone: avatarSkinTone !== undefined ? avatarSkinTone : currentUser.avatarSkinTone,
        avatarEyes: avatarEyes !== undefined ? avatarEyes : currentUser.avatarEyes,
        avatarBrows: avatarBrows !== undefined ? avatarBrows : currentUser.avatarBrows,
        avatarMouth: avatarMouth !== undefined ? avatarMouth : currentUser.avatarMouth,
        avatarNose: avatarNose !== undefined ? avatarNose : currentUser.avatarNose,
        avatarHair: avatarHair !== undefined ? avatarHair : currentUser.avatarHair,
        avatarEyewear: avatarEyewear !== undefined ? avatarEyewear : currentUser.avatarEyewear,
        avatarAccessory: avatarAccessory !== undefined ? avatarAccessory : currentUser.avatarAccessory,
        useCustomAvatar: useCustomAvatar !== undefined ? useCustomAvatar : currentUser.useCustomAvatar
      }
    });
    
    return NextResponse.json({
      user: {
        ...updatedUser,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
        emailVerified: updatedUser.emailVerified?.toISOString() || null,
      }
    });
  } catch (error) {
    console.error("[AVATAR_UPDATE_ERROR]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 