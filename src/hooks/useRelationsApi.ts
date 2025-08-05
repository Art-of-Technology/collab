// src/hooks/useRelationsApi.ts - Final simple approach
interface Epic {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
  description?: string;
}

interface Story {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
  description?: string;
}

interface Task {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
  description?: string;
}

interface Milestone {
  id: string;
  title: string;
  status?: string;
  description?: string;
  dueDate?: string;
}

interface TaskRelationsResponse {
  epics: Epic[];
  stories: Story[];
  milestones: Milestone[];
  parentTasks: Task[];
  subtasks: Task[];
}

interface UseRelationsApiProps {
  workspaceId: string;
}

export function useRelationsApi({ workspaceId }: UseRelationsApiProps) {
  
  // Get relations for any item (task, epic, story, milestone)
  // Always use /tasks/ endpoint - itemId can be any item type
  const getTaskRelations = async (itemId: string): Promise<TaskRelationsResponse> => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks/${itemId}/relations`);
      if (!response.ok) {
        throw new Error('Failed to fetch relations');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching item relations:', error);
      throw error;
    }
  };

  // Add relation for any item (task, epic, story, milestone)
  // Always use /tasks/ endpoint - itemId can be any item type
  const addRelation = async (
    itemId: string,  // Any item ID (task/epic/story/milestone)
    relatedItemId: string, 
    relationType: 'EPIC' | 'STORY' | 'MILESTONE' | 'PARENT_TASK' | 'TASK'
  ) => {
    try {
      console.log(`🔗 Adding relation: ${itemId} -> ${relatedItemId} (${relationType})`);
      
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks/${itemId}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatedItemId, relatedItemType: relationType }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`Failed to add ${relationType.toLowerCase()} relation`);
      }
      
      const result = await response.json();
      console.log('✅ Relation added successfully:', result);
      return result;
    } catch (error) {
      console.error(`Error adding ${relationType.toLowerCase()} relation:`, error);
      throw error;
    }
  };

  // Remove relation for any item
  const removeRelation = async (
    itemId: string,
    relatedItemId: string, 
    relationType: 'EPIC' | 'STORY' | 'MILESTONE' | 'PARENT_TASK' | 'TASK'
  ) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks/${itemId}/relations`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatedItemId, relatedItemType: relationType }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to remove ${relationType.toLowerCase()} relation`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error removing ${relationType.toLowerCase()} relation:`, error);
      throw error;
    }
  };

  // Fetch functions for dropdowns with search support
  const fetchEpics = async (search?: string): Promise<Epic[]> => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/workspaces/${workspaceId}/epics${params}`);
      if (!response.ok) throw new Error('Failed to fetch epics');
      return await response.json();
    } catch (error) {
      console.error('Error fetching epics:', error);
      throw error;
    }
  };

  const fetchStories = async (search?: string): Promise<Story[]> => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/workspaces/${workspaceId}/stories${params}`);
      if (!response.ok) throw new Error('Failed to fetch stories');
      return await response.json();
    } catch (error) {
      console.error('Error fetching stories:', error);
      throw error;
    }
  };

  const fetchTasks = async (search?: string): Promise<Task[]> => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/workspaces/${workspaceId}/task${params}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return await response.json();
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  };

  const fetchMilestones = async (search?: string): Promise<Milestone[]> => {
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/workspaces/${workspaceId}/milestones${params}`);
      if (!response.ok) throw new Error('Failed to fetch milestones');
      return await response.json();
    } catch (error) {
      console.error('Error fetching milestones:', error);
      throw error;
    }
  };
  // Generic remove handler for any component
  const createRemoveHandler = (
    currentItemId: string,
    currentItemType: 'TASK' | 'EPIC' | 'STORY' | 'MILESTONE',
    reloadFunction: () => Promise<void>
  ) => {
    return async (itemId: string, relationType: 'EPIC' | 'STORY' | 'MILESTONE' | 'TASK') => {
      try {
        console.log(`🗑️ Removing ${relationType.toLowerCase()} from ${currentItemType.toLowerCase()}:`, itemId);
        
        // Logic: Task relations are always stored as task->other, others are stored as source->target
        if (currentItemType === 'TASK' || relationType === 'TASK') {
          if (currentItemType === 'TASK') {
            await removeRelation(currentItemId, itemId, relationType);
          } else {
            await removeRelation(itemId, currentItemId, currentItemType);
          }
        } else {
          await removeRelation(currentItemId, itemId, relationType);
        }
        
        await reloadFunction();
        console.log(`✅ ${relationType} removed successfully`);
      } catch (error) {
        console.error(`Failed to remove ${relationType.toLowerCase()}:`, error);
      }
    };
  };

  return {
    getTaskRelations,
    addRelation,
    removeRelation,
    fetchEpics,
    fetchStories,
    fetchTasks,
    fetchMilestones,
    createRemoveHandler,
  };
}