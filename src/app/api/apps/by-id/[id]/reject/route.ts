import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';

import { prisma } from '@/lib/prisma';


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

    // Update app status to rejected, but only the review that was read: an approval that landed in
    // between stands, and its version stays the approved one.
    const rejected = await prisma.app.updateMany({
      where: { id, status: 'IN_REVIEW', updatedAt: app.updatedAt },
      data: { 
        status: 'REJECTED',
        approvedVersionId: null,
        // You might want to store the rejection reason in a separate field
        // For now, we'll just update the status
      }
    });
    if (rejected.count !== 1) {
      return NextResponse.json({ error: 'App changed during review' }, { status: 409 });
    }

    // TODO: Send notification to app developer about rejection
    // This could be implemented later with an email service or in-app notifications


    return NextResponse.json({ 
      success: true, 
      message: 'App rejected successfully' 
    });

  } catch (error) {
    console.error('Error rejecting app:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
