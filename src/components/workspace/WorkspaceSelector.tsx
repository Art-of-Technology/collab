"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PlusCircle, ChevronDown, Building2, Settings, UserPlus } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { useSession } from 'next-auth/react';
import { useCanManageWorkspace } from '@/hooks/use-permissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Extend the Workspace type from context to include ownerId
type WorkspaceWithOwner = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  ownerId?: string;
};

const WorkspaceSelector = () => {
  const { currentWorkspace, workspaces, switchWorkspace, isLoading } = useWorkspace();
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isWorkspaceOwner = (currentWorkspace as WorkspaceWithOwner)?.ownerId === session?.user?.id;
  const { hasPermission: canManageWorkspace } = useCanManageWorkspace(currentWorkspace?.id);
  const finalCanManage = canManageWorkspace || isWorkspaceOwner;

  if (isLoading || !currentWorkspace) {
    return (
      <div className="h-9 w-40 animate-pulse bg-background rounded-md"></div>
    );
  }

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center justify-between w-full h-9 px-3 gap-2"
        >
          <div className="flex items-center gap-2 truncate">
            {currentWorkspace.logoUrl ? (
              <div className="relative h-5 w-5 rounded-sm overflow-hidden">
                <Image
                  src={currentWorkspace.logoUrl}
                  alt={currentWorkspace.name}
                  fill
                  sizes="20px"
                  className="object-contain"
                />
              </div>
            ) : (
              <Building2 className="h-4 w-4 opacity-70" />
            )}
            <span className="truncate font-medium">{currentWorkspace.name}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            className={`cursor-pointer ${workspace.id === currentWorkspace.id ? 'bg-accent' : ''}`}
            onClick={() => {
              if (workspace.id !== currentWorkspace.id) {
                switchWorkspace(workspace.id);
              }
              setDropdownOpen(false);
            }}
          >
            <div className="flex items-center gap-2 w-full">
              {workspace.logoUrl ? (
                <div className="relative h-5 w-5 rounded-sm overflow-hidden">
                  <Image
                    src={workspace.logoUrl}
                    alt={workspace.name}
                    fill
                    sizes="20px"
                    className="object-contain"
                  />
                </div>
              ) : (
                <Building2 className="h-4 w-4 opacity-70" />
              )}
              <span className="truncate">{workspace.name}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />

        <Link href="/create-workspace">
          <DropdownMenuItem onClick={() => setDropdownOpen(false)} className="cursor-pointer">
            <PlusCircle className="mr-2 h-4 w-4" />
            <span>Create new workspace</span>
          </DropdownMenuItem>
        </Link>

        {finalCanManage ? (
          <Link href={`/workspaces/${currentWorkspace.id}`}>
            <DropdownMenuItem onClick={() => setDropdownOpen(false)} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Workspace settings</span>
            </DropdownMenuItem>
          </Link>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="px-2 py-1.5 text-sm opacity-50 flex items-center cursor-not-allowed">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Workspace settings</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Only workspace owners and admins can access settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <Link href={`/workspaces`}>
          <DropdownMenuItem onClick={() => setDropdownOpen(false)} className="cursor-pointer">
            <UserPlus className="mr-2 h-4 w-4" />
            <span>View all workspaces</span>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WorkspaceSelector; 