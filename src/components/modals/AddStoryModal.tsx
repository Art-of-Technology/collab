import { useState, useEffect } from "react";
import { BaseRelationModal } from "./BaseRelationModal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRelationsApi } from "@/hooks/useRelationsApi";

interface Story {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
}

interface AddStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStory: (storyId: string) => Promise<void>;
  onAddMultipleStories?: (storyIds: string[]) => Promise<void>; // New prop for multiple stories
  currentStoryIds?: string[]; // Array of currently linked story IDs to exclude from list
}

export function AddStoryModal({ 
  isOpen, 
  onClose, 
  onAddStory, 
  onAddMultipleStories,
  currentStoryIds = [] 
}: AddStoryModalProps) {
  const { currentWorkspace } = useWorkspace();
  const relationsApi = useRelationsApi({ workspaceId: currentWorkspace?.id || '' });
  
  const [stories, setStories] = useState<Story[]>([]);
  const [filteredStories, setFilteredStories] = useState<Story[]>([]);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStories, setIsLoadingStories] = useState(false);

  // Fetch stories when modal opens
  useEffect(() => {
    if (isOpen && currentWorkspace) {
      fetchStories();
    }
  }, [isOpen, currentWorkspace]);

  // Filter stories based on search term and exclude already linked stories
  useEffect(() => {
    const filtered = stories.filter(story => 
      story.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !currentStoryIds.includes(story.id) // Exclude currently linked stories
    );
    setFilteredStories(filtered);
  }, [stories, searchTerm, currentStoryIds]);

  const fetchStories = async () => {
    if (!currentWorkspace?.id) return;
    
    setIsLoadingStories(true);
    try {
      const fetchedStories = await relationsApi.fetchStories();
      setStories(fetchedStories);
    }  finally {
      setIsLoadingStories(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedStoryIds.length === 0) return;
    
    setIsLoading(true);
    try {
      if (selectedStoryIds.length === 1) {
        // Single story
        await onAddStory(selectedStoryIds[0]);
      } else if (onAddMultipleStories) {
        // Multiple stories - use batch function if available
        await onAddMultipleStories(selectedStoryIds);
      } else {
        // Fallback: add one by one
        for (const storyId of selectedStoryIds) {
          await onAddStory(storyId);
        }
      }
      handleClose();
    } catch (error) {
      console.error("Failed to add stories:", error);
      
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedStoryIds([]);
    setSearchTerm("");
    onClose();
  };

  const toggleStorySelection = (storyId: string) => {
    setSelectedStoryIds(prev => 
      prev.includes(storyId) 
        ? prev.filter(id => id !== storyId)
        : [...prev, storyId]
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
      title="Add Story"
      onConfirm={handleConfirm}
      onCancel={handleClose}
      confirmText="Add Story"
      isLoading={isLoading}
    >
      <div className="space-y-4">
        {/* Search Input */}
        <div>
          <Input
            placeholder="Search stories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Story List */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Select a story to link:
          </p>
          
          {isLoadingStories ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Loading stories...</p>
            </div>
          ) : filteredStories.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "No stories found matching your search." : "No available stories."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-2 space-y-2">
                {filteredStories.map((story) => (
                  <div
                    key={story.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedStoryIds.includes(story.id)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleStorySelection(story.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {story.issueKey || "Story"}
                        </Badge>
                        <span className="text-sm truncate">{story.title}</span>
                      </div>
                      {getStatusBadge(story.status)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {selectedStoryIds.length > 0 && (
          <div className="p-3 bg-muted/20 rounded-md">
            <p className="text-sm text-muted-foreground">
              {selectedStoryIds.length} stor{selectedStoryIds.length > 1 ? 'ies' : 'y'} selected
            </p>
          </div>
        )}
      </div>
    </BaseRelationModal>
  );
}