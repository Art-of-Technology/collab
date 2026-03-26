import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getAuthSession } from '@/lib/auth';
import { verifyWorkspaceAccess, getWorkspaceSlugOrId } from '@/lib/workspace-helpers';
import { Skeleton } from '@/components/ui/skeleton';
import CoclawDashboard from '@/components/coclaw/CoclawDashboard';

export const metadata: Metadata = {
  title: 'Coclaw',
  description: 'Manage your Coclaw AI assistant',
};

function CoclawPageSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-4 w-72 ml-11 mt-1" />
      </div>

      <Skeleton className="h-10 w-96 mb-4" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

async function CoclawPageContent({ workspaceId }: { workspaceId: string }) {
  return <CoclawDashboard workspaceId={workspaceId} />;
}

export default async function CoclawPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId: workspaceIdParam } = await params;
  const session = await getAuthSession();

  if (!session?.user) {
    redirect('/login');
  }

  let workspaceId = '';
  try {
    workspaceId = await verifyWorkspaceAccess(session.user);
  } catch {
    redirect('/welcome');
  }

  return (
    <Suspense fallback={<CoclawPageSkeleton />}>
      <CoclawPageContent workspaceId={workspaceId} />
    </Suspense>
  );
}
