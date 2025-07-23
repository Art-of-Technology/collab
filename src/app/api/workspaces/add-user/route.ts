import { NextRequest, NextResponse } from 'next/server';
import { addUserToWorkspace } from '@/actions/invitation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, userId } = body;

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: 'WorkspaceId and UserId are required' },
        { status: 400 }
      );
    }

    const result = await addUserToWorkspace(workspaceId, userId);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error adding user to workspace:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 