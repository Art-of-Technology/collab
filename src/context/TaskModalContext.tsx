"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { resolveIssueKeyToId, resolveIdToIssueKey } from "@/lib/client-issue-key-resolvers";
import { isIssueKey } from "@/lib/shared-issue-key-utils";

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
  openTaskModal: (taskId: string) => Promise<void>;
  closeTaskModal: () => void;

  // New entity modal states and methods
  activeMilestoneId: string | null;
  activeEpicId: string | null;
  activeStoryId: string | null;
  isMilestoneModalOpen: boolean;
  isEpicModalOpen: boolean;
  isStoryModalOpen: boolean;
  openMilestoneModal: (milestoneId: string) => Promise<void>;
  openEpicModal: (epicId: string) => Promise<void>;
  openStoryModal: (storyId: string) => Promise<void>;
  closeMilestoneModal: () => void;
  closeEpicModal: () => void;
  closeStoryModal: () => void;
}

export const TaskModalContext = createContext<TaskModalContextType>({
  isTaskModalOpen: false,
  activeTaskId: null,
  openTaskModal: async () => {},
  closeTaskModal: () => {},

  // Default values for new entity modal states and methods
  activeMilestoneId: null,
  activeEpicId: null,
  activeStoryId: null,
  isMilestoneModalOpen: false,
  isEpicModalOpen: false,
  isStoryModalOpen: false,
  openMilestoneModal: async () => {},
  openEpicModal: async () => {},
  openStoryModal: async () => {},
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
    const handleUrlSync = async () => {
      const taskParam = searchParams.get("taskId");
      const milestoneParam = searchParams.get("milestoneId");
      const epicParam = searchParams.get("epicId");
      const storyParam = searchParams.get("storyId");

      // Helper function to resolve param to ID
      const resolveParamToId = async (param: string, entityType: "task" | "epic" | "story" | "milestone") => {
        if (isIssueKey(param)) {
          return await resolveIssueKeyToId(param, entityType);
        }
        return param; // Already an ID
      };
      if (!activeTaskId && !activeMilestoneId && !activeEpicId && !activeStoryId) {
        // Prioritize Task if multiple are present
        if (taskParam && !activeTaskId) {
          const resolvedId = await resolveParamToId(taskParam, "task");
          if (resolvedId) {
            setActiveTaskId(resolvedId);
            setIsTaskModalOpen(true);
          }
        } else if (milestoneParam && !activeMilestoneId) {
          const resolvedId = await resolveParamToId(milestoneParam, "milestone");
          if (resolvedId) {
            setActiveMilestoneId(resolvedId);
            setIsMilestoneModalOpen(true);
          }
        } else if (epicParam && !activeEpicId) {
          const resolvedId = await resolveParamToId(epicParam, "epic");
          if (resolvedId) {
            setActiveEpicId(resolvedId);
            setIsEpicModalOpen(true);
          }
        } else if (storyParam && !activeStoryId) {
          const resolvedId = await resolveParamToId(storyParam, "story");
          if (resolvedId) {
            setActiveStoryId(resolvedId);
            setIsStoryModalOpen(true);
          }
        }

        // If no modal ID is in the URL, ensure all are closed in state
        if (!taskParam && !milestoneParam && !epicParam && !storyParam) {
          setActiveTaskId(null);
          setActiveMilestoneId(null);
          setActiveEpicId(null);
          setActiveStoryId(null);
          setIsTaskModalOpen(false);
          setIsMilestoneModalOpen(false);
          setIsEpicModalOpen(false);
          setIsStoryModalOpen(false);
        }
      }
    };
    handleUrlSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  const openTaskModal = async (taskId: string) => {
    setActiveTaskId(taskId);
    setIsTaskModalOpen(true);

    // Try to get the issue key for the URL
    const issueKey = await resolveIdToIssueKey(taskId, "task");
    updateUrl("taskId", issueKey || taskId);
  };

  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
    setActiveTaskId(null);
    updateUrl("taskId", null);
  };

  // --- Milestone Modal ---
  const openMilestoneModal = async (milestoneId: string) => {
    setActiveMilestoneId(milestoneId);
    setIsMilestoneModalOpen(true);

    // Try to get the issue key for the URL
    const issueKey = await resolveIdToIssueKey(milestoneId, "milestone");
    updateUrl("milestoneId", issueKey || milestoneId);
  };

  const closeMilestoneModal = () => {
    setIsMilestoneModalOpen(false);
    setActiveMilestoneId(null);
    updateUrl("milestoneId", null);
  };

  // --- Epic Modal ---
  const openEpicModal = async (epicId: string) => {
    setActiveEpicId(epicId);
    setIsEpicModalOpen(true);

    // Try to get the issue key for the URL
    const issueKey = await resolveIdToIssueKey(epicId, "epic");
    updateUrl("epicId", issueKey || epicId);
  };

  const closeEpicModal = () => {
    setIsEpicModalOpen(false);
    setActiveEpicId(null);
    updateUrl("epicId", null);
  };

  // --- Story Modal ---
  const openStoryModal = async (storyId: string) => {
    setActiveStoryId(storyId);
    setIsStoryModalOpen(true);

    // Try to get the issue key for the URL
    const issueKey = await resolveIdToIssueKey(storyId, "story");
    updateUrl("storyId", issueKey || storyId);
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
