import { redirect } from 'next/navigation';

export default async function ProjectBoardPage({ params }: {
  params: Promise<{ workspaceId: string; projectSlug: string }>;
}) {
  const { workspaceId, projectSlug } = await params;
  redirect(`/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectSlug)}?tab=work&view=forge`);
}
