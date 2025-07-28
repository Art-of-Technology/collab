import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import MultiBoardView from "@/components/boards/MultiBoardView";

interface MultiBoardPageProps {
  params: {
    workspaceId: string;
  };
  searchParams: {
    project?: string;
    boards?: string;
  };
}

export default async function MultiBoardPage({ params, searchParams }: MultiBoardPageProps) {
  const session = await getAuthSession();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  const { workspaceId } = params;
  const { project: projectId, boards: boardIds } = searchParams;

  return (
    <MultiBoardView 
      workspaceId={workspaceId}
      projectId={projectId}
      boardIds={boardIds?.split(',')}
    />
  );
}