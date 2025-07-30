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
}

interface UseRelationsApiProps {
  workspaceId: string;
}

export function useRelationsApi({ workspaceId }: UseRelationsApiProps) {
  
  // Get all relations for a specific task
  const getTaskRelations = async (taskId: string): Promise<TaskRelationsResponse> => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks/${taskId}/relations`);
      if (!response.ok) {
        throw new Error('Failed to fetch task relations');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching task relations:', error);
      throw error;
    }
  };

  // Fetch available epics for selection (for dropdowns)
  const fetchEpics = async (): Promise<Epic[]> => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/epics`);
      if (!response.ok) {
        throw new Error('Failed to fetch epics');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching epics:', error);
      throw error;
    }
  };

  // Fetch available stories for selection (for dropdowns)
  const fetchStories = async (): Promise<Story[]> => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/stories`);
      if (!response.ok) {
        throw new Error('Failed to fetch stories');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching stories:', error);
      throw error;
    }
  };

  // Fetch available tasks for parent selection (for dropdowns)
  const fetchTasks = async (): Promise<Task[]> => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/task`);
      if (!response.ok) {
        throw new Error('Failed to fetch task');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching task:', error);
      throw error;
    }
  };

  // Fetch available milestones for selection (for dropdowns)
  const fetchMilestones = async (): Promise<Milestone[]> => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/milestones`);
      if (!response.ok) {
        throw new Error('Failed to fetch milestones');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching milestones:', error);
      throw error;
    }
  };

  // Generic function to add relation
  const addRelation = async (
    taskId: string, 
    relatedItemId: string, 
    relatedItemType: 'EPIC' | 'STORY' | 'MILESTONE' | 'PARENT_TASK'
  ) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks/${taskId}/relations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relatedItemId, relatedItemType }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add ${relatedItemType.toLowerCase()} relation`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error adding ${relatedItemType.toLowerCase()} relation:`, error);
      throw error;
    }
  };

  // Generic function to remove relation
  const removeRelation = async (
    taskId: string, 
    relatedItemId: string, 
    relatedItemType: 'EPIC' | 'STORY' | 'MILESTONE' | 'PARENT_TASK'
  ) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/tasks/${taskId}/relations`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relatedItemId, relatedItemType }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to remove ${relatedItemType.toLowerCase()} relation`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error removing ${relatedItemType.toLowerCase()} relation:`, error);
      throw error;
    }
  };

  // Specific relation functions for backward compatibility
  const addEpicRelation = (taskId: string, epicId: string) => 
    addRelation(taskId, epicId, 'EPIC');

  const removeEpicRelation = (taskId: string, epicId: string) => 
    removeRelation(taskId, epicId, 'EPIC');

  const addStoryRelation = (taskId: string, storyId: string) => 
    addRelation(taskId, storyId, 'STORY');

  const removeStoryRelation = (taskId: string, storyId: string) => 
    removeRelation(taskId, storyId, 'STORY');

  const addParentTaskRelation = (taskId: string, parentTaskId: string) => 
    addRelation(taskId, parentTaskId, 'PARENT_TASK');

  const removeParentTaskRelation = (taskId: string, parentTaskId: string) => 
    removeRelation(taskId, parentTaskId, 'PARENT_TASK');

  const addMilestoneRelation = (taskId: string, milestoneId: string) => 
    addRelation(taskId, milestoneId, 'MILESTONE');

  const removeMilestoneRelation = (taskId: string, milestoneId: string) => 
    removeRelation(taskId, milestoneId, 'MILESTONE');

  // Bulk operations for multiple relations
  const addMultipleRelations = async (
    taskId: string, 
    items: Array<{ id: string; type: 'EPIC' | 'STORY' | 'MILESTONE' | 'PARENT_TASK' }>
  ) => {
    try {
      const promises = items.map(item => 
        addRelation(taskId, item.id, item.type)
      );
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error adding multiple relations:', error);
      throw error;
    }
  };

  // Legacy functions for backward compatibility (these were in original hook)
  const addMultipleEpicRelations = async (taskId: string, epicIds: string[]) => {
    const items = epicIds.map(id => ({ id, type: 'EPIC' as const }));
    return addMultipleRelations(taskId, items);
  };

  const addMultipleStoryRelations = async (taskId: string, storyIds: string[]) => {
    const items = storyIds.map(id => ({ id, type: 'STORY' as const }));
    return addMultipleRelations(taskId, items);
  };

  const addMultipleParentTaskRelations = async (taskId: string, parentTaskIds: string[]) => {
    const items = parentTaskIds.map(id => ({ id, type: 'PARENT_TASK' as const }));
    return addMultipleRelations(taskId, items);
  };

  const addMultipleMilestoneRelations = async (taskId: string, milestoneIds: string[]) => {
    const items = milestoneIds.map(id => ({ id, type: 'MILESTONE' as const }));
    return addMultipleRelations(taskId, items);
  };

  return {
    // Main relation function - NEW
    getTaskRelations,
    
    // Fetch functions for dropdowns - SAME AS BEFORE
    fetchEpics,
    fetchStories,
    fetchTasks,
    fetchMilestones,
    
    // Generic relation functions - NEW
    addRelation,
    removeRelation,
    addMultipleRelations,
    
    // Specific relation functions - BACKWARD COMPATIBLE
    addEpicRelation,
    removeEpicRelation,
    addStoryRelation,
    removeStoryRelation,
    addParentTaskRelation,
    removeParentTaskRelation,
    addMilestoneRelation,
    removeMilestoneRelation,
    
    // Legacy bulk functions - BACKWARD COMPATIBLE
    addMultipleEpicRelations,
    addMultipleStoryRelations,
    addMultipleParentTaskRelations,
    addMultipleMilestoneRelations,
  };
}