"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

// Dynamically import the Detail Modals
const TaskDetailModal = dynamic(() => import("@/components/tasks/TaskDetailModal"), {
  ssr: false,
});
const MilestoneDetailModal = dynamic(() => import("@/components/milestones/MilestoneDetailModal"), {
  ssr: false,
});
const EpicDetailModal = dynamic(() => import("@/components/epics/EpicDetailModal"), {
  ssr: false,
});
const StoryDetailModal = dynamic(() => import("@/components/stories/StoryDetailModal"), {
  ssr: false,
});

interface TaskModalContextType {
  isTaskModalOpen: boolean;
  activeTaskId: string | null;
  openTaskModal: (taskId: string) => void;
  closeTaskModal: () => void;
  
  // New entity modal states and methods
  activeMilestoneId: string | null;
  activeEpicId: string | null;
  activeStoryId: string | null;
  isMilestoneModalOpen: boolean;
  isEpicModalOpen: boolean;
  isStoryModalOpen: boolean;
  openMilestoneModal: (milestoneId: string) => void;
  openEpicModal: (epicId: string) => void;
  openStoryModal: (storyId: string) => void;
  closeMilestoneModal: () => void;
  closeEpicModal: () => void;
  closeStoryModal: () => void;
}

export const TaskModalContext = createContext<TaskModalContextType>({
  isTaskModalOpen: false,
  activeTaskId: null,
  openTaskModal: () => {},
  closeTaskModal: () => {},
  
  // Default values for new entity modal states and methods
  activeMilestoneId: null,
  activeEpicId: null,
  activeStoryId: null,
  isMilestoneModalOpen: false,
  isEpicModalOpen: false,
  isStoryModalOpen: false,
  openMilestoneModal: () => {},
  openEpicModal: () => {},
  openStoryModal: () => {},
  closeMilestoneModal: () => {},
  closeEpicModal: () => {},
  closeStoryModal: () => {},
});

export const TaskModalProvider = ({ children }: { children: React.ReactNode }) => {
  // Task modal state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // New entity modal states
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [activeEpicId, setActiveEpicId] = useState<string | null>(null);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isEpicModalOpen, setIsEpicModalOpen] = useState(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sync URL to state on initial load or direct navigation
  useEffect(() => {
    const taskId = searchParams.get("taskId");
    const milestoneId = searchParams.get("milestoneId");
    const epicId = searchParams.get("epicId");
    const storyId = searchParams.get("storyId");

    // Prioritize Task if multiple are present? Or handle error?
    // For now, just set the first one found.
    if (taskId && !activeTaskId) {
      setActiveTaskId(taskId);
      setIsTaskModalOpen(true);
    } else if (milestoneId && !activeMilestoneId) {
      setActiveMilestoneId(milestoneId);
      setIsMilestoneModalOpen(true);
    } else if (epicId && !activeEpicId) {
      setActiveEpicId(epicId);
      setIsEpicModalOpen(true);
    } else if (storyId && !activeStoryId) {
      setActiveStoryId(storyId);
      setIsStoryModalOpen(true);
    }
    
    // If no modal ID is in the URL, ensure all are closed in state
    if (!taskId && !milestoneId && !epicId && !storyId) {
        setActiveTaskId(null);
        setActiveMilestoneId(null);
        setActiveEpicId(null);
        setActiveStoryId(null);
        setIsTaskModalOpen(false);
        setIsMilestoneModalOpen(false);
        setIsEpicModalOpen(false);
        setIsStoryModalOpen(false);
    }

  // Add missing dependencies to the dependency array
  }, [searchParams, activeTaskId, activeMilestoneId, activeEpicId, activeStoryId]);

  const updateUrl = (paramName: string, paramValue: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    // Clear other potential modal params first
    params.delete("taskId");
    params.delete("milestoneId");
    params.delete("epicId");
    params.delete("storyId");
    
    if (paramValue) {
      params.set(paramName, paramValue);
    } // If null, all params are already deleted
    
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const openTaskModal = (taskId: string) => {
    setActiveTaskId(taskId);
    setIsTaskModalOpen(true);
    updateUrl("taskId", taskId);
  };

  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
    setActiveTaskId(null);
    updateUrl("taskId", null);
  };
  
  // --- Milestone Modal ---
  const openMilestoneModal = (milestoneId: string) => {
    setActiveMilestoneId(milestoneId);
    setIsMilestoneModalOpen(true);
    updateUrl("milestoneId", milestoneId);
  };
  
  const closeMilestoneModal = () => {
    setIsMilestoneModalOpen(false);
    setActiveMilestoneId(null);
    updateUrl("milestoneId", null);
  };
  
  // --- Epic Modal ---
  const openEpicModal = (epicId: string) => {
    setActiveEpicId(epicId);
    setIsEpicModalOpen(true);
    updateUrl("epicId", epicId);
  };
  
  const closeEpicModal = () => {
    setIsEpicModalOpen(false);
    setActiveEpicId(null);
    updateUrl("epicId", null);
  };
  
  // --- Story Modal ---
  const openStoryModal = (storyId: string) => {
    setActiveStoryId(storyId);
    setIsStoryModalOpen(true);
    updateUrl("storyId", storyId);
  };
  
  const closeStoryModal = () => {
    setIsStoryModalOpen(false);
    setActiveStoryId(null);
    updateUrl("storyId", null);
  };

  return (
    <TaskModalContext.Provider
      value={{
        isTaskModalOpen,
        activeTaskId,
        openTaskModal,
        closeTaskModal,
        
        // New entity modal states and methods
        activeMilestoneId,
        activeEpicId,
        activeStoryId,
        isMilestoneModalOpen,
        isEpicModalOpen,
        isStoryModalOpen,
        openMilestoneModal,
        openEpicModal,
        openStoryModal,
        closeMilestoneModal,
        closeEpicModal,
        closeStoryModal,
      }}
    >
      {children}
      
      {/* Render Modals Conditionally based on active IDs */}
      {activeTaskId && <TaskDetailModal taskId={activeTaskId} onClose={closeTaskModal} />}
      {activeMilestoneId && <MilestoneDetailModal milestoneId={activeMilestoneId} onClose={closeMilestoneModal} />}
      {activeEpicId && <EpicDetailModal epicId={activeEpicId} onClose={closeEpicModal} />}
      {activeStoryId && <StoryDetailModal storyId={activeStoryId} onClose={closeStoryModal} />}
      
    </TaskModalContext.Provider>
  );
};

export const useTaskModal = () => useContext(TaskModalContext); 