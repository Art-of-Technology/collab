import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import ChannelManager from '@/components/coclaw/ChannelManager';

interface CoclawChannelsPageProps {
  params: Promise<{ workspaceId: string }>;
}

async function CoclawChannelsPageContent({ workspaceId }: { workspaceId: string }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!workspace) {
    notFound();
  }

  // Verify membership
  const member = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: session.user.id,
        workspaceId: workspace.id,
      },
    },
  });

  if (!member) {
    notFound();
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <Link href={`/workspaces/${workspace.slug}/settings`}>
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to settings
          </Button>
        </Link>
      </div>

      <div className="border-b border-border/40 pb-3 mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Channel Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure messaging channels for your Coclaw agent in{' '}
          <strong>{workspace.name}</strong>. Each channel runs independently
          within your personal agent instance.
        </p>
      </div>

      <ChannelManager workspaceId={workspace.id} />
    </div>
  );
}

function CoclawChannelsPageSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="border-b border-border/40 pb-3 mb-6">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default async function CoclawChannelsPage({ params }: CoclawChannelsPageProps) {
  const { workspaceId } = await params;

  return (
    <Suspense fallback={<CoclawChannelsPageSkeleton />}>
      <CoclawChannelsPageContent workspaceId={workspaceId} />
    </Suspense>
  );
}
