import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { getUserWorkspaces } from '@/actions/workspace';
import { getPendingInvitations } from '@/actions/invitation';
import WorkspacesClient from '@/components/workspace/WorkspacesClient';

export const dynamic = 'force-dynamic';

export default async function WorkspacesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  try {
    // Fetch initial data using server actions
    const [workspacesData, pendingInvitations] = await Promise.all([
      getUserWorkspaces(),
      getPendingInvitations(session.user.email || '')
    ]);

    return (
      <div className="h-full bg-[#101011]">
        <WorkspacesClient 
          initialWorkspaces={workspacesData.all} 
          initialInvitations={pendingInvitations}
          userId={session.user.id}
        />
      </div>
    );
  } catch (error) {
    console.error("Error loading workspace data:", error);
    
    // In case of an error, return the client component with empty initial data
    return (
      <div className="h-full bg-[#101011]">
        <WorkspacesClient 
          initialWorkspaces={[]} 
          initialInvitations={[]}
          userId={session.user.id}
        />
      </div>
    );
  }
} 