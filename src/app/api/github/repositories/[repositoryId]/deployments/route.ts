import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/github/repositories/[repositoryId]/deployments - Get deployment data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repositoryId: string }> }
) {
  try {
    const { repositoryId } = await params;

    // Get all deployments grouped by environment
    const deployments = await prisma.deployment.findMany({
      where: { repositoryId },
      orderBy: { deployedAt: 'desc' },
      include: {
        version: {
          select: {
            id: true,
            version: true,
          },
        },
        release: {
          select: {
            tagName: true,
          },
        },
      },
    });

    // Get current version for each environment
    const currentVersions = await prisma.deployment.findMany({
      where: {
        repositoryId,
        status: 'SUCCESS',
      },
      orderBy: { deployedAt: 'desc' },
      distinct: ['environment'],
      include: {
        version: {
          select: {
            version: true,
          },
        },
      },
    });

    // Group deployments by environment
    const environments = ['development', 'staging', 'production'].map(env => {
      const envDeployments = deployments.filter(d => d.environment === env);
      const currentVersion = currentVersions.find(d => d.environment === env);

      return {
        environment: env,
        currentVersion: currentVersion?.version?.version,
        lastDeployment: envDeployments[0] ? {
          id: envDeployments[0].id,
          environment: envDeployments[0].environment,
          status: envDeployments[0].status,
          deployedAt: envDeployments[0].deployedAt?.toISOString(),
          deployedBy: envDeployments[0].deployedBy,
          commitSha: envDeployments[0].commitSha,
          buildUrl: envDeployments[0].buildUrl,
          errorMessage: envDeployments[0].errorMessage,
          version: envDeployments[0].version ? {
            id: envDeployments[0].version.id,
            version: envDeployments[0].version.version,
            tagName: envDeployments[0].release?.tagName,
          } : undefined,
        } : null,
        history: envDeployments.slice(0, 10).map(d => ({
          id: d.id,
          environment: d.environment,
          status: d.status,
          deployedAt: d.deployedAt?.toISOString(),
          deployedBy: d.deployedBy,
          commitSha: d.commitSha,
          buildUrl: d.buildUrl,
          errorMessage: d.errorMessage,
          version: d.version ? {
            id: d.version.id,
            version: d.version.version,
          } : undefined,
        })),
      };
    });

    return NextResponse.json({ environments });
  } catch (error) {
    console.error('[DEPLOYMENTS_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
