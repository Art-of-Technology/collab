"use client";

import React, { useState } from 'react';
import { Workspace } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import EditWorkspaceForm from './EditWorkspaceForm';

interface WorkspaceDetailsEditorProps {
  workspace: Workspace;
}

export default function WorkspaceDetailsEditor({ workspace }: WorkspaceDetailsEditorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button 
        size="sm"
        className="w-full mt-3 text-sm"
        onClick={() => setIsOpen(true)}
      >
        Edit Workspace Details
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Edit Workspace Details</DialogTitle>
            <DialogDescription className="text-sm">
              Update information about your workspace. Changes will be visible to all members.
            </DialogDescription>
          </DialogHeader>
          <EditWorkspaceForm workspace={workspace} />
        </DialogContent>
      </Dialog>
    </>
  );
} 