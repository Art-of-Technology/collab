"use client";

import axios from 'axios';
import React, { createContext, useCallback, useContext } from 'react';

interface User {
  id: string;
  name: string | null;
  image: string | null;
}

interface MentionContextType {
  searchUsers: (query: string) => Promise<User[]>;
}

const MentionContext = createContext<MentionContextType | undefined>(undefined);

export function MentionProvider({ children }: { children: React.ReactNode }) {
  // Function to search users for mentions
  const searchUsers = useCallback(async (query: string): Promise<User[]> => {
    if (!query || query.length < 1) return [];

    try {
      const response = await axios.get(`/api/users/search?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  }, []);

  return (
    <MentionContext.Provider value={{ searchUsers }}>
      {children}
    </MentionContext.Provider>
  );
}

export const useMention = () => {
  const context = useContext(MentionContext);
  if (context === undefined) {
    throw new Error('useMention must be used within a MentionProvider');
  }
  return context;
};
