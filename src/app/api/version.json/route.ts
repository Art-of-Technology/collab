import { getCurrentUser } from '@/lib/session';
import { issueAccessWhere } from '@/lib/issue-finder';
import { versionAccessWhere } from '@/lib/github/repository-access';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/version.json - Version information
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      where: { id: projectId, ...issueAccessWhere(user.id) },
      include: {
        repository: true,
      },
    });

    if (!project?.repository) {
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
            'Cache-Control': 'private, no-store',
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
        version: versionAccessWhere(user.id),
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
          'Cache-Control': 'private, no-store',
        },
      });
    }

    // Fallback: get latest released version
    const latestVersion = await prisma.version.findFirst({
      where: {
        repositoryId: project.repository.id,
        environment,
        status: 'RELEASED',
        ...versionAccessWhere(user.id),
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
          'Cache-Control': 'private, no-store',
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
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('[VERSION_JSON_GET]', error);
    
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
          'Cache-Control': 'private, no-store',
        },
      }
    );
  }
}
