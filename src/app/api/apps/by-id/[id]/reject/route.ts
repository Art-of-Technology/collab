import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ 
        error: 'Rejection reason is required' 
      }, { status: 400 });
    }

    // Get the app
    const app = await prisma.app.findUnique({
      where: { id }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    if (app.status !== 'IN_REVIEW') {
      return NextResponse.json({ 
        error: 'App must be in review status to be rejected' 
      }, { status: 400 });
    }

    // Update app status to rejected
    await prisma.app.update({
      where: { id },
      data: { 
        status: 'REJECTED',
        // You might want to store the rejection reason in a separate field
        // For now, we'll just update the status
      }
    });

    // TODO: Send notification to app developer about rejection
    // This could be implemented later with an email service or in-app notifications

    await prisma.$disconnect();

    return NextResponse.json({ 
      success: true, 
      message: 'App rejected successfully' 
    });

  } catch (error) {
    console.error('Error rejecting app:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
