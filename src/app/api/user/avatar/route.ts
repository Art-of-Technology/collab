import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/request-session";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { avatarUpdateSchema, avatarUserSelect } from '@/lib/avatar-settings';

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const parsed = avatarUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return new NextResponse('Invalid avatar settings', { status: 400 });
    }
    
    // Get the current user
    const currentUser = await prisma.user.findUnique({
      where: {
        id: session.user.id
      },
      select: { id: true }
    });
    
    if (!currentUser) {
      return new NextResponse("User not found", { status: 404 });
    }
    
    // Update the user's avatar settings
    const updatedUser = await prisma.user.update({
      where: {
        id: currentUser.id
      },
      data: parsed.data,
      select: avatarUserSelect
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
    console.error("[AVATAR_UPDATE_ERROR]");
    return new NextResponse("Internal error", { status: 500 });
  }
}
