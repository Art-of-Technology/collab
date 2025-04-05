"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useCurrentUser } from "@/hooks/queries/useUser";

interface UiContextType {
  isLoggedIn: boolean;
  isChatOpen: boolean;
  toggleChat: () => void;
}

const UiContext = createContext<UiContextType>({
  isLoggedIn: false,
  isChatOpen: false,
  toggleChat: () => {},
});

export const useUiContext = () => useContext(UiContext);

interface UiProviderProps {
  children: ReactNode;
}

export const UiProvider = ({ children }: UiProviderProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Use TanStack Query hook instead of direct fetch
  const { data: userData, isError } = useCurrentUser();

  const toggleChat = () => setIsChatOpen(prev => !prev);

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
      }}
    >
      {children}
    </UiContext.Provider>
  );
}; 