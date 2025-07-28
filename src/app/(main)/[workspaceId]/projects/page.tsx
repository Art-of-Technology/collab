import { Metadata } from "next";
import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProjectList from "@/components/projects/ProjectList";
import { TasksProvider } from "@/context/TasksContext";

export const metadata: Metadata = {
  title: "Projects",
  description: "Manage your projects and organize your work",
};

interface ProjectsPageProps {
  params: {
    workspaceId: string;
  };
}

export default async function ProjectsPage({ params }: ProjectsPageProps) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/auth/signin");
  }

  const { workspaceId } = params;

  return (
    <TasksProvider workspaceId={workspaceId}>
      <div className="container mx-auto p-6">
        <ProjectList workspaceId={workspaceId} />
      </div>
    </TasksProvider>
  );
}