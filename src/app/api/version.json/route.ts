import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { repositoryAccessWhere } from "@/lib/github/access";
import { versionAccessWhere } from "@/lib/github/version-access";
import { prisma } from "@/lib/prisma";

// GET /api/version.json - Authenticated project version information
export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project');
    const environment = searchParams.get('environment') || 'production';

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    // Find the project and its repository
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspace: postWorkspaceAccessWhere(actor.id) },
      include: {
        repository: { select: { id: true } },
      },
    });

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!project.repository) {
      return NextResponse.json(
        {
          version: "0.0.0",
          buildTime: new Date().toISOString(),
          environment,
          features: [],
          bugfixes: [],
          commit: "",
          fallback: {
            version: "0.0.0",
            lastKnown: new Date().toISOString(),
          },
        },
        { 
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Get the latest version file for the environment
    const versionFile = await prisma.versionFile.findFirst({
      where: {
        repositoryId: project.repository.id,
        environment,
        isActive: true,
        repository: repositoryAccessWhere(actor.id),
        version: versionAccessWhere(actor.id),
      },
      include: {
        version: true,
      },
      orderBy: { deployedAt: 'desc' },
    });

    if (versionFile) {
      return NextResponse.json(versionFile.content, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    // Fallback: get latest released version
    const latestVersion = await prisma.version.findFirst({
      where: {
        repositoryId: project.repository.id,
        environment,
        status: 'RELEASED',
        ...versionAccessWhere(actor.id),
      },
      include: {
        issues: {
          include: {
            issue: {
              select: {
                issueKey: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: [
        { major: 'desc' },
        { minor: 'desc' },
        { patch: 'desc' },
      ],
    });

    if (latestVersion) {
      // Generate fallback version.json
      const versionData = {
        version: latestVersion.version,
        buildTime: latestVersion.releasedAt || latestVersion.createdAt,
        environment,
        features: latestVersion.issues
          .filter(vi => ['TASK', 'STORY', 'EPIC'].includes(vi.issue.type))
          .map(vi => vi.issue.issueKey)
          .filter(Boolean),
        bugfixes: latestVersion.issues
          .filter(vi => vi.issue.type === 'BUG')
          .map(vi => vi.issue.issueKey)
          .filter(Boolean),
        commit: "",
        fallback: {
          version: latestVersion.version,
          lastKnown: latestVersion.releasedAt || latestVersion.createdAt,
        },
      };

      return NextResponse.json(versionData, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    // Final fallback
    return NextResponse.json(
      {
        version: "0.0.0+",
        buildTime: new Date().toISOString(),
        environment,
        features: [],
        bugfixes: [],
        commit: "",
        fallback: {
          version: "0.0.0",
          lastKnown: new Date().toISOString(),
        },
      },
      { 
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch {
    console.error('[VERSION_JSON_GET]');
    
    // Return safe fallback even on error
    return NextResponse.json(
      {
        version: "0.0.0+",
        buildTime: new Date().toISOString(),
        environment: "unknown",
        features: [],
        bugfixes: [],
        commit: "",
        error: "Version fetch failed",
        fallback: {
          version: "0.0.0",
          lastKnown: new Date().toISOString(),
        },
      },
      { 
        status: 200, // Don't break deployments
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
