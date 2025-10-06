'use client';

import { ChangelogPage } from '@/components/github/ChangelogPage';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';

interface ChangelogPageClientProps {
  repositoryId: string;
  projectName: string;
  workspaceId: string;
  projectSlug: string;
}

export function ChangelogPageClient({ 
  repositoryId, 
  projectName, 
  workspaceId, 
  projectSlug 
}: ChangelogPageClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const handleBack = () => {
    // Get workspace slug from current URL (first segment after domain)
    const pathSegments = window.location.pathname.split('/');
    const workspaceSlug = pathSegments[1];
    router.push(`/${workspaceSlug}/projects/${projectSlug}`);
  };

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header with back button */}
      <div className="border-b border-[#21262d] p-6">
        <div className="flex items-center gap-4">
          <Button
            onClick={handleBack}
            variant="ghost"
            size="sm"
            className="text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
          <div className="h-6 w-px bg-[#21262d]" />
          <div>
            <h1 className="text-xl font-semibold text-[#e6edf3]">
              {projectName} Changelog
            </h1>
            <p className="text-sm text-[#8b949e]">
              AI-enhanced release notes and version history
            </p>
          </div>
        </div>
      </div>

      {/* Changelog content */}
      <div className="flex-1 overflow-auto p-6">
        <ChangelogPage 
          repositoryId={repositoryId} 
          projectName={projectName} 
        />
      </div>
    </div>
  );
}
