import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [
      totalUsers,
      totalWorkspaces,
      totalApps,
      systemApps,
      totalInstallations
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.app.count({ where: { status: 'PUBLISHED' } }),
      prisma.app.count({ where: { isSystemApp: true } }),
      prisma.appInstallation.count({ where: { status: 'ACTIVE' } })
    ]);

    return NextResponse.json({
      totalUsers,
      totalWorkspaces,
      totalApps,
      systemApps,
      totalInstallations
    });

  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
