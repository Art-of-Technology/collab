"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useCurrentUser } from "@/hooks/queries/useUser";

interface UiContextType {
  isLoggedIn: boolean;
  isChatOpen: boolean;
  toggleChat: () => void;
  isAssistantOpen: boolean;
  toggleAssistant: () => void;
  isAssistantFullScreen: boolean;
  toggleAssistantFullScreen: () => void;
}

const UiContext = createContext<UiContextType>({
  isLoggedIn: false,
  isChatOpen: false,
  toggleChat: () => {},
  isAssistantOpen: false,
  toggleAssistant: () => {},
  isAssistantFullScreen: false,
  toggleAssistantFullScreen: () => {},
});

export const useUiContext = () => useContext(UiContext);

interface UiProviderProps {
  children: ReactNode;
}

export const UiProvider = ({ children }: UiProviderProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isAssistantFullScreen, setIsAssistantFullScreen] = useState(false);
  
  // Use TanStack Query hook instead of direct fetch
  const { data: userData, isError } = useCurrentUser();

  const toggleChat = () => setIsChatOpen(prev => !prev);
  const toggleAssistant = () => {
    setIsAssistantOpen(prev => !prev);
    // Close fullscreen when closing assistant
    if (isAssistantOpen && isAssistantFullScreen) {
      setIsAssistantFullScreen(false);
    }
  };
  const toggleAssistantFullScreen = () => setIsAssistantFullScreen(prev => !prev);

  // Update login status based on user data
  useEffect(() => {
    setIsLoggedIn(!!userData && !isError);
  }, [userData, isError]);

  return (
    <UiContext.Provider
      value={{
        isLoggedIn,
        isChatOpen,
        toggleChat,
        isAssistantOpen,
        toggleAssistant,
        isAssistantFullScreen,
        toggleAssistantFullScreen,
      }}
    >
      {children}
    </UiContext.Provider>
  );
}; 