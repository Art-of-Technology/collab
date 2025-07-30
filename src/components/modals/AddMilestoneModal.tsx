import { useState, useEffect } from "react";
import { BaseRelationModal } from "./BaseRelationModal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRelationsApi } from "@/hooks/useRelationsApi";

interface Milestone {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
}

interface AddMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMilestone: (milestoneId: string) => Promise<void>;
  onAddMultipleMilestones?: (milestoneIds: string[]) => Promise<void>; // New prop for multiple milestones
  currentMilestoneIds?: string[]; // Array of currently linked milestone IDs to exclude from list
}

export function AddMilestoneModal({
  isOpen,
  onClose,
  onAddMilestone,
  onAddMultipleMilestones,
  currentMilestoneIds = []
}: AddMilestoneModalProps) {
  const { currentWorkspace } = useWorkspace();
  const relationsApi = useRelationsApi({ workspaceId: currentWorkspace?.id || '' });

  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [filteredMilestones, setFilteredMilestones] = useState<Milestone[]>([]);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMilestones, setIsLoadingMilestones] = useState(false);

  // Fetch milestones when modal opens
  useEffect(() => {
    if (isOpen && currentWorkspace) {
      fetchMilestones();
    }
  }, [isOpen, currentWorkspace]);

  // Filter milestones based on search term and exclude already linked milestones
  useEffect(() => {
    const filtered = milestones.filter(milestone =>
      milestone.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !currentMilestoneIds.includes(milestone.id) // Exclude currently linked milestones
    );
    setFilteredMilestones(filtered);
  }, [milestones, searchTerm, currentMilestoneIds]);

  const fetchMilestones = async () => {
    if (!currentWorkspace?.id) return;

    setIsLoadingMilestones(true);
    try {
      const fetchedMilestones = await relationsApi.fetchMilestones();
      setMilestones(fetchedMilestones);
    } finally {
      setIsLoadingMilestones(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedMilestoneIds.length === 0) return;

    setIsLoading(true);
    try {
      if (selectedMilestoneIds.length === 1) {
        // Single milestone
        await onAddMilestone(selectedMilestoneIds[0]);
      } else if (onAddMultipleMilestones) {
        // Multiple milestones - use batch function if available
        await onAddMultipleMilestones(selectedMilestoneIds);
      } else {
        // Fallback: add one by one
        for (const milestoneId of selectedMilestoneIds) {
          await onAddMilestone(milestoneId);
        }
      }
      handleClose();
    } catch (error) {
      console.error("Failed to add milestones:", error);

    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedMilestoneIds([]);
    setSearchTerm("");
    onClose();
  };

  const toggleMilestoneSelection = (milestoneId: string) => {
    setSelectedMilestoneIds(prev =>
      prev.includes(milestoneId)
        ? prev.filter(id => id !== milestoneId)
        : [...prev, milestoneId]
    );
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const statusColors = {
      'DONE': 'bg-green-500',
      'IN_PROGRESS': 'bg-blue-500',
      'TODO': 'bg-gray-500',
      'BACKLOG': 'bg-gray-500',
    };

    const color = statusColors[status as keyof typeof statusColors] || 'bg-gray-500';

    return (
      <Badge className={`${color} text-white text-xs`}>
        {status}
      </Badge>
    );
  };

  return (
    <BaseRelationModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Milestone"
      onConfirm={handleConfirm}
      onCancel={handleClose}
      confirmText={selectedMilestoneIds.length === 0 ? "Add Milestone" : `Add ${selectedMilestoneIds.length} Milestone${selectedMilestoneIds.length > 1 ? 's' : ''}`}
      isConfirmDisabled={selectedMilestoneIds.length === 0}
      isLoading={isLoading}
    >
      <div className="space-y-4">
        {/* Search Input */}
        <div>
          <Input
            placeholder="Search milestones..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Milestone List */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Select milestones to link:
          </p>

          {isLoadingMilestones ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Loading milestones...</p>
            </div>
          ) : filteredMilestones.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "No milestones found matching your search." : "No available milestones."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-2 space-y-2">
                {filteredMilestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${selectedMilestoneIds.includes(milestone.id)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                      }`}
                    onClick={() => toggleMilestoneSelection(milestone.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                          {milestone.issueKey || "Milestone"}
                        </Badge>
                        <span className="text-sm truncate">{milestone.title}</span>
                      </div>
                      {getStatusBadge(milestone.status)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {selectedMilestoneIds.length > 0 && (
          <div className="p-3 bg-muted/20 rounded-md">
            <p className="text-sm text-muted-foreground">
              {selectedMilestoneIds.length} milestone{selectedMilestoneIds.length > 1 ? 's' : ''} selected
            </p>
          </div>
        )}
      </div>
    </BaseRelationModal>
  );
}