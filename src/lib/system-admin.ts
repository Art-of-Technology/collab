import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

/**
 * The signed-in system admin's user id, or null. The role is read from the database,
 * so a session issued before someone stopped being an admin does not count.
 */
export async function systemAdminId() {
  const id = (await getServerSession(authOptions))?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  return user?.role === 'SYSTEM_ADMIN' ? id : null;
}
