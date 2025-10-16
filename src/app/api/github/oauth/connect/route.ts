import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { createRepositoryWebhook, getRepositoryDetails } from "@/lib/github/oauth-config";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { EncryptionService } from "@/lib/encryption";

/**
 * Connect a GitHub repository to a project with one click
 * POST /api/github/oauth/connect
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, repositoryId, owner, name } = body;

    if (!projectId || !repositoryId || !owner || !name) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, repositoryId, owner, name" },
        { status: 400 }
      );
    }

    // Get user's GitHub access token
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return NextResponse.json(
        { error: "GitHub account not connected" },
        { status: 400 }
      );
    }

    // Decrypt the access token
    const accessToken = EncryptionService.decrypt(user.githubAccessToken);

    // Verify user has access to the project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } },
          ],
        },
      },
      include: { repository: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    if (project.repository) {
      return NextResponse.json(
        { error: "Project already has a connected repository" },
        { status: 400 }
      );
    }

    // Check if repository is already connected to another project
    const existingRepo = await prisma.repository.findFirst({
      where: { githubRepoId: repositoryId.toString() },
      include: { project: true },
    });

    if (existingRepo) {
      return NextResponse.json(
        { 
          error: `Repository is already connected to project "${existingRepo.project.name}"` 
        },
        { status: 400 }
      );
    }

    // Get repository details from GitHub to verify access
    const repoDetails = await getRepositoryDetails(accessToken, owner, name);

    // Check if user has admin access to create webhooks
    if (!repoDetails.permissions?.admin) {
      return NextResponse.json(
        { 
          error: "You need admin access to this repository to connect it. Please contact the repository owner." 
        },
        { status: 403 }
      );
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    
    // Create webhook URL - use public tunnel URL if available, otherwise fall back to NEXTAUTH_URL
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL;
    const webhookUrl = `${webhookBaseUrl}/api/github/webhooks/events`;
    
    console.log('Using webhook URL:', webhookUrl);

    // Create webhook in GitHub repository
    let webhookId: number | null = null;
    let webhookWarning: string | null = null;
    
    try {
      const webhook = await createRepositoryWebhook(
        accessToken,
        owner,
        name,
        webhookUrl,
        webhookSecret
      );
      webhookId = webhook.id;
      console.log(`Webhook created successfully for ${owner}/${name}: ${webhook.id}`);
    } catch (error) {
      console.error('Failed to create webhook:', error);
      
      // Check if this is a localhost development issue (only if no public tunnel is configured)
      const isLocalhost = (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')) && !process.env.WEBHOOK_BASE_URL;
      
      if (error instanceof Error) {
        if (error.message.includes('Hook already exists')) {
          return NextResponse.json(
            { error: "A webhook for this URL already exists on this repository" },
            { status: 400 }
          );
        }
        
        if (error.message.includes('Not Found')) {
          return NextResponse.json(
            { error: "Repository not found or you don't have access to it" },
            { status: 404 }
          );
        }
        
        // For localhost development, allow connection without webhook
        if (isLocalhost && error.message.includes('cannot reach localhost')) {
          webhookWarning = 'Repository connected successfully, but webhook creation was skipped for localhost development. Real-time GitHub events will not work until you deploy to a public URL or use ngrok.';
          console.warn('Webhook creation skipped for localhost development');
        } else {
          // For other errors, still fail the connection
          return NextResponse.json(
            { error: error.message || "Failed to create webhook. Please check your repository permissions." },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Failed to create webhook. Please check your repository permissions." },
          { status: 500 }
        );
      }
    }

    // Create repository connection in database
    const repository = await prisma.repository.create({
      data: {
        projectId,
        githubRepoId: repositoryId.toString(),
        owner,
        name,
        fullName: repoDetails.full_name,
        defaultBranch: repoDetails.default_branch,
        webhookSecret,
        webhookId: webhookId?.toString() || null,
        isActive: true,
        syncedAt: new Date(),
      },
    });

    // Initialize default version for the repository
    await prisma.version.create({
      data: {
        repositoryId: repository.id,
        version: '0.0.0',
        major: 0,
        minor: 0,
        patch: 0,
        releaseType: 'PATCH',
        status: 'READY',
        environment: 'development',
      },
    });

    return NextResponse.json({
      success: true,
      repository: {
        id: repository.id,
        projectId: repository.projectId,
        owner: repository.owner,
        name: repository.name,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        isActive: repository.isActive,
        syncedAt: repository.syncedAt,
      },
      warning: webhookWarning,
      webhook: {
        id: webhookId,
        url: webhookUrl,
      },
    });

  } catch (error) {
    console.error('GitHub repository connection error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Failed to connect repository" 
      },
      { status: 500 }
    );
  }
}

