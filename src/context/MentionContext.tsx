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
  const searchUsers = useCallback(async (query: string, workspaceId?: string): Promise<User[]> => {
    try {
      // Send the query as-is, empty query will return all workspace users
      let url = `/api/users/search?q=${encodeURIComponent(query || '')}`;
      if (workspaceId) {
        url += `&workspace=${encodeURIComponent(workspaceId)}`;
      }
      const response = await axios.get(url);
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
