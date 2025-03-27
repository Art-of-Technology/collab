"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

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

  const toggleChat = () => setIsChatOpen(prev => !prev);

  // Check if user is logged in
  useEffect(() => {
    // This is a simple check - you may want to use your actual auth system
    const checkAuth = async () => {
      try {
        // You can replace this with your actual auth check
        const response = await fetch("/api/user/me");
        if (response.ok) {
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        setIsLoggedIn(false);
      }
    };

    checkAuth();
  }, []);

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