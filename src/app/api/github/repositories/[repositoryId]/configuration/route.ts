import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/github/repositories/[repositoryId]/configuration - Update repository configuration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { repositoryId } = await params;
    const body = await request.json();

    // Validate the repository exists and user has access
    const repository = await prisma.repository.findFirst({
      where: {
        id: repositoryId,
        project: {
          workspace: {
            OR: [
              { ownerId: session.user.id },
              { members: { some: { userId: session.user.id } } },
            ],
          },
        },
      },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Validate the request body
    const {
      versioningStrategy,
      developmentBranch,
      branchEnvironmentMap,
      issueTypeMapping,
    } = body;

    // Validate versioning strategy
    if (versioningStrategy && !['SINGLE_BRANCH', 'MULTI_BRANCH'].includes(versioningStrategy)) {
      return NextResponse.json(
        { error: "Invalid versioning strategy" },
        { status: 400 }
      );
    }

    // Validate issue type mapping values
    if (issueTypeMapping) {
      const validVersionBumps = ['MAJOR', 'MINOR', 'PATCH'];
      for (const [issueType, versionBump] of Object.entries(issueTypeMapping)) {
        if (!validVersionBumps.includes(versionBump as string)) {
          return NextResponse.json(
            { error: `Invalid version bump '${versionBump}' for issue type '${issueType}'` },
            { status: 400 }
          );
        }
      }
    }

    // Update the repository configuration
    const updatedRepository = await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        versioningStrategy: versioningStrategy || repository.versioningStrategy,
        developmentBranch: versioningStrategy === 'MULTI_BRANCH' ? developmentBranch : null,
        branchEnvironmentMap: branchEnvironmentMap || repository.branchEnvironmentMap,
        issueTypeMapping: issueTypeMapping || repository.issueTypeMapping,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        versioningStrategy: true,
        developmentBranch: true,
        branchEnvironmentMap: true,
        issueTypeMapping: true,
        updatedAt: true,
      },
    });

    console.log(`Updated repository configuration for ${repository.fullName}:`, {
      versioningStrategy: updatedRepository.versioningStrategy,
      developmentBranch: updatedRepository.developmentBranch,
      branchEnvironmentMap: updatedRepository.branchEnvironmentMap,
      issueTypeMapping: updatedRepository.issueTypeMapping,
    });

    return NextResponse.json({
      success: true,
      repository: updatedRepository,
    });

  } catch (error) {
    console.error('[REPOSITORY_CONFIG_UPDATE]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
