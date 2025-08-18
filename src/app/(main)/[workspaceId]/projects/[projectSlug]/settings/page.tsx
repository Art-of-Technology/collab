import { redirect } from 'next/navigation';
import ProjectSettingsClient from './ProjectSettingsClient';
import { authConfig } from '@/lib/auth';
import { getServerSession } from 'next-auth/next';

interface ProjectSettingsPageProps {
  params: Promise<{
    workspaceId: string;
    projectSlug: string;
  }>;
}

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { workspaceId, projectSlug } = await params;
  const session = await getServerSession(authConfig);

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <ProjectSettingsClient 
      workspaceId={workspaceId}
      projectSlug={projectSlug}
    />
  );
}
