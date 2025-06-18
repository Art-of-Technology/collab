import { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";

export function CustomPrismaAdapter(prisma: PrismaClient): Adapter {
  const adapter = PrismaAdapter(prisma);
  
  // Override the getUserByAccount method to handle UserRole enum
  const originalGetUserByAccount = adapter.getUserByAccount;
  
  if (originalGetUserByAccount) {
    adapter.getUserByAccount = async function(account) {
      const result = await originalGetUserByAccount.call(this, account);
      
      // Convert UserRole enum to string if user exists
      if (result && (result as any).role) {
        return {
          ...result,
          role: (result as any).role.toString()
        } as any;
      }
      
      return result;
    };
  }
  
  // Override the getUser method to handle UserRole enum
  const originalGetUser = adapter.getUser;
  
  if (originalGetUser) {
    adapter.getUser = async function(id) {
      const result = await originalGetUser.call(this, id);
      
      // Convert UserRole enum to string if user exists
      if (result && (result as any).role) {
        return {
          ...result,
          role: (result as any).role.toString()
        } as any;
      }
      
      return result;
    };
  }
  
  // Override the getUserByEmail method to handle UserRole enum
  const originalGetUserByEmail = adapter.getUserByEmail;
  
  if (originalGetUserByEmail) {
    adapter.getUserByEmail = async function(email) {
      const result = await originalGetUserByEmail.call(this, email);
      
      // Convert UserRole enum to string if user exists
      if (result && (result as any).role) {
        return {
          ...result,
          role: (result as any).role.toString()
        } as any;
      }
      
      return result;
    };
  }
  
  return adapter;
} 