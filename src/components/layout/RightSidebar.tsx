"use client";

import { useState } from 'react';
import { useViewFilters } from '@/context/ViewFiltersContext';
import ViewFilters from '@/components/views/shared/ViewFilters';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function RightSidebar() {
  const { 
    isOpen, 
    setIsOpen, 
    filters, 
    setFilters, 
    currentView, 
    issues, 
    workspace, 
    currentUser,
    onAssigneesChangeFromViewOptions
  } = useViewFilters();
  
  const { toast } = useToast();
  const router = useRouter();

  // Delete view state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get the view type for ViewFilters
  const viewType = (currentView?.displayType || 'LIST').toLowerCase() as 'kanban' | 'list' | 'timeline';

  const handleDeleteConfirm = async () => {
    if (!currentView || !workspace) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${currentView.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'View deleted successfully'
        });
        
        // Navigate back to views list
        router.push(`/${workspace.slug || workspace.id}/views`);
      } else {
        throw new Error('Failed to delete view');
      }
    } catch (error) {
      console.error('Error deleting view:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete view',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div 
      className={`
        flex-shrink-0 bg-[#090909] transition-[width,opacity] duration-300 ease-in-out overflow-hidden
        ${isOpen && currentView ? 'w-80 opacity-100' : 'w-0 opacity-0'}
      `}
    >
      <div className="h-full w-80">
        {isOpen && currentView && (
          <div className="h-full animate-in fade-in-0 slide-in-from-right-2 duration-300 delay-75">
            <ViewFilters
        issues={issues}
        workspace={workspace}
        view={currentView}
        currentUser={currentUser}
        isOpen={isOpen}
        onToggle={() => setIsOpen(false)}
        selectedFilters={filters}
        onFiltersChange={setFilters}
        viewType={viewType}
        onAssigneesChangeFromViewOptions={onAssigneesChangeFromViewOptions}
        onVisibilityChange={async (visibility) => {
          try {
            const response = await fetch(`/api/workspaces/${workspace.id}/views/${currentView.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                visibility
              })
            });

            if (response.ok) {
              toast({
                title: 'Success',
                description: 'View visibility updated successfully'
              });
              
              // Refresh the page to reflect changes
              window.location.reload();
            } else {
              throw new Error('Failed to update visibility');
            }
          } catch (error) {
            console.error('Error updating visibility:', error);
            toast({
              title: 'Error',
              description: 'Failed to update view visibility',
              variant: 'destructive'
            });
          }
        }}
        onOwnerChange={async (ownerId) => {
          try {
            const response = await fetch(`/api/workspaces/${workspace.id}/views/${currentView.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ownerId
              })
            });

            if (response.ok) {
              toast({
                title: 'Success',
                description: 'View owner updated successfully'
              });
              
              // Refresh the page to reflect changes
              window.location.reload();
            } else {
              throw new Error('Failed to update owner');
            }
          } catch (error) {
            console.error('Error updating owner:', error);
            toast({
              title: 'Error',
              description: 'Failed to update view owner',
              variant: 'destructive'
            });
          }
        }}
        onDeleteView={() => setShowDeleteDialog(true)}
        onNameChange={async (name) => {
          try {
            const response = await fetch(`/api/workspaces/${workspace.id}/views/${currentView.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name
              })
            });

            if (response.ok) {
              toast({
                title: 'Success',
                description: 'View name updated successfully'
              });
              
              // Refresh the page to reflect changes
              window.location.reload();
            } else {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to update name');
            }
          } catch (error) {
            console.error('Error updating name:', error);
            toast({
              title: 'Error',
              description: 'Failed to update view name',
              variant: 'destructive'
            });
          }
        }}
      />
          </div>
        )}
      </div>

      {/* Delete View Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete View"
        description="Are you sure you want to delete this view? This action cannot be undone."
        variant="danger"
        confirmText="Delete View"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        metadata={currentView ? {
          title: currentView.name
        } : undefined}
      />
    </div>
  );
}
