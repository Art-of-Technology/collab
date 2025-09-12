import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession } from "@/lib/auth";
import { createPersonalWorkspaceForUser, userHasWorkspace } from "@/lib/onboarding-helpers";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to create a workspace.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { userId, userName } = body;

    // Verify the user is creating workspace for themselves
    if (userId !== session.user.id) {
      return NextResponse.json(
        { error: 'You can only create a workspace for yourself.' },
        { status: 403 }
      );
    }

    // Check if user already has a workspace
    const hasExistingWorkspace = await userHasWorkspace(userId);
    if (hasExistingWorkspace) {
      return NextResponse.json(
        { error: 'You already have a workspace. Redirecting...' },
        { status: 409 }
      );
    }

    // Create the personal workspace with project and view
    console.log(`🏗️  Creating personal workspace for user: ${session.user.email}`);
    
    const result = await createPersonalWorkspaceForUser(userId, userName || 'User');
    
    console.log(`✅ Successfully created workspace: ${result.workspace.name}`);

    // Set the new workspace as the current workspace in cookies
    const cookieStore = await cookies();
    cookieStore.set('currentWorkspaceId', result.workspace.id, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    // Return the created workspace details
    return NextResponse.json({
      success: true,
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        slug: result.workspace.slug,
      },
      project: {
        id: result.project.id,
        name: result.project.name,
        slug: result.project.slug,
      },
      view: {
        id: result.view.id,
        name: result.view.name,
        slug: result.view.slug,
      },
      welcomeIssue: {
        id: result.welcomeIssue.id,
        title: result.welcomeIssue.title,
        issueKey: result.welcomeIssue.issueKey,
      }
    }, { status: 201 });

  } catch (error) {
    console.error('❌ Error creating personal workspace:', error);
    
    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return NextResponse.json(
          { error: 'A workspace with this name already exists. Please try again.' },
          { status: 409 }
        );
      }
      
      if (error.message.includes('No workspace available')) {
        return NextResponse.json(
          { error: 'Unable to create workspace. Please contact support.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while creating your workspace. Please try again.' },
      { status: 500 }
    );
  }
}
