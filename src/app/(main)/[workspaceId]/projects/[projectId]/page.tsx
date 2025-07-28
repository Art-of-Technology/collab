import { Metadata } from "next";
import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProjectDetailClient from "@/components/projects/ProjectDetailClient";

interface ProjectDetailPageProps {
  params: {
    workspaceId: string;
    projectId: string;
  };
}

export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { projectId } = params;
  
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, description: true },
    });

    if (!project) {
      return {
        title: "Project Not Found",
      };
    }

    return {
      title: project.name,
      description: project.description || `Details for project: ${project.name}`,
    };
  } catch (error) {
    return {
      title: "Project",
    };
  }
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/auth/signin");
  }

  const { workspaceId, projectId } = params;

  // Verify the project exists and user has access
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspace: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      }
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
        }
      },
      _count: {
        select: {
          tasks: true,
          epics: true,
          milestones: true,
          stories: true,
          boardProjects: true,
        }
      }
    },
  });

  if (!project) {
    notFound();
  }

  return (
    <div className="container mx-auto p-6">
      <ProjectDetailClient 
        project={project}
        workspaceId={workspaceId}
      />
    </div>
  );
}