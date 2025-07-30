import { useState, useEffect } from "react";
import { BaseRelationModal } from "./BaseRelationModal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRelationsApi } from "@/hooks/useRelationsApi";

interface Epic {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
}

interface AddEpicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEpic: (epicId: string) => Promise<void>;
  onAddMultipleEpics?: (epicIds: string[]) => Promise<void>; // New prop for multiple epics
  currentEpicIds?: string[]; // Array of currently linked epic IDs to exclude from list
}

export function AddEpicModal({ 
  isOpen, 
  onClose, 
  onAddEpic, 
  onAddMultipleEpics,
  currentEpicIds = [] 
}: AddEpicModalProps) {
  const { currentWorkspace } = useWorkspace();
  const relationsApi = useRelationsApi({ workspaceId: currentWorkspace?.id || '' });
  
  const [epics, setEpics] = useState<Epic[]>([]);
  const [filteredEpics, setFilteredEpics] = useState<Epic[]>([]);
  const [selectedEpicIds, setSelectedEpicIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingEpics, setIsLoadingEpics] = useState(false);

  // Fetch epics when modal opens
  useEffect(() => {
    if (isOpen && currentWorkspace) {
      fetchEpics();
    }
  }, [isOpen, currentWorkspace]);

  // Filter epics based on search term and exclude already linked epics
  useEffect(() => {
    const filtered = epics.filter(epic => 
      epic.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !currentEpicIds.includes(epic.id) // Exclude currently linked epics
    );
    setFilteredEpics(filtered);
  }, [epics, searchTerm, currentEpicIds]);

  const fetchEpics = async () => {
    if (!currentWorkspace?.id) return;
    
    setIsLoadingEpics(true);
    try {
      const fetchedEpics = await relationsApi.fetchEpics();
      setEpics(fetchedEpics);
    } catch (error) {
      console.error("Failed to fetch epics:", error);
      setEpics([]); // Set empty array on error
    } finally {
      setIsLoadingEpics(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedEpicIds.length === 0) return;
    
    setIsLoading(true);
    try {
      if (selectedEpicIds.length === 1) {
        // Single epic
        await onAddEpic(selectedEpicIds[0]);
      } else if (onAddMultipleEpics) {
        // Multiple epics - use batch function if available
        await onAddMultipleEpics(selectedEpicIds);
      } else {
        // Fallback: add one by one (but this causes state batching issues)
        for (const epicId of selectedEpicIds) {
          await onAddEpic(epicId);
        }
      }
      handleClose();
    } catch (error) {
      console.error("Failed to add epics:", error);
      
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedEpicIds([]);
    setSearchTerm("");
    onClose();
  };

  const toggleEpicSelection = (epicId: string) => {
    setSelectedEpicIds(prev => 
      prev.includes(epicId) 
        ? prev.filter(id => id !== epicId)
        : [...prev, epicId]
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
      title="Add Epic"
      onConfirm={handleConfirm}
      onCancel={handleClose}
      confirmText="Add Epic"
      isLoading={isLoading}
    >
      <div className="space-y-4">
        {/* Search Input */}
        <div>
          <Input
            placeholder="Search epics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Epic List */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Select an epic to link:
          </p>
          
          {isLoadingEpics ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Loading epics...</p>
            </div>
          ) : filteredEpics.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "No epics found matching your search." : "No available epics."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-2 space-y-2">
                {filteredEpics.map((epic) => (
                  <div
                    key={epic.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedEpicIds.includes(epic.id)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleEpicSelection(epic.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          {epic.issueKey || "Epic"}
                        </Badge>
                        <span className="text-sm truncate">{epic.title}</span>
                      </div>
                      {getStatusBadge(epic.status)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {selectedEpicIds.length > 0 && (
          <div className="p-3 bg-muted/20 rounded-md">
            <p className="text-sm text-muted-foreground">
              {selectedEpicIds.length} epic{selectedEpicIds.length > 1 ? 's' : ''} selected
            </p>
          </div>
        )}
      </div>
    </BaseRelationModal>
  );
}