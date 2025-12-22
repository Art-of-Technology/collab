'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  GitPullRequest,
  Tag,
  Settings,
  GitBranch,
  Zap,
  BookOpen,
} from 'lucide-react';

interface QuickActionsProps {
  repository: {
    id: string;
    fullName: string;
    owner: string;
    name: string;
  };
  projectSlug: string;
  workspaceSlug: string;
}

export function QuickActions({ repository, projectSlug, workspaceSlug }: QuickActionsProps) {
  const router = useRouter();

  const actions = [
    {
      label: 'View on GitHub',
      icon: ExternalLink,
      href: `https://github.com/${repository.fullName}`,
      external: true,
      variant: 'outline' as const,
    },
    {
      label: 'Pull Requests',
      icon: GitPullRequest,
      href: `https://github.com/${repository.fullName}/pulls`,
      external: true,
      variant: 'outline' as const,
    },
    {
      label: 'Create Release',
      icon: Tag,
      href: `https://github.com/${repository.fullName}/releases/new`,
      external: true,
      variant: 'outline' as const,
    },
    {
      label: 'Branches',
      icon: GitBranch,
      href: `https://github.com/${repository.fullName}/branches`,
      external: true,
      variant: 'outline' as const,
    },
    {
      label: 'Legacy Changelog',
      icon: BookOpen,
      onClick: () => router.push(`/${workspaceSlug}/projects/${projectSlug}/changelog`),
      variant: 'secondary' as const,
    },
    {
      label: 'Configure',
      icon: Settings,
      onClick: () => router.push(`/${workspaceSlug}/projects/${projectSlug}/settings`),
      variant: 'secondary' as const,
    },
  ];

  return (
    <Card className="bg-[#0d1117] border-[#21262d]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          <CardTitle className="text-lg text-[#e6edf3]">Quick Actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant}
              size="sm"
              className={`justify-start h-auto py-2 px-3 ${
                action.variant === 'outline'
                  ? 'border-[#30363d] bg-transparent hover:bg-[#21262d]'
                  : 'bg-[#21262d] hover:bg-[#30363d]'
              }`}
              onClick={action.onClick}
              asChild={action.external}
            >
              {action.external ? (
                <a
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <action.icon className="h-4 w-4" />
                  <span className="text-xs">{action.label}</span>
                </a>
              ) : (
                <>
                  <action.icon className="h-4 w-4" />
                  <span className="text-xs">{action.label}</span>
                </>
              )}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
