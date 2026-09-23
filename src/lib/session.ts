import { getServerSession } from '@/lib/request-session';
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

// Force dynamic rendering for all routes that use getCurrentUser
export const dynamic = 'force-dynamic';

export async function getCurrentUser() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return null;
    }
    
    const currentUser = await prisma.user.findUnique({
      where: {
        id: session.user.id
      }
    });
    
    if (!currentUser) {
      return null;
    }
    
    return {
      ...currentUser,
      createdAt: currentUser.createdAt.toISOString(),
      updatedAt: currentUser.updatedAt.toISOString(),
      emailVerified: currentUser.emailVerified?.toISOString() || null,
    };
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}
