import { type DefaultSession } from "next-auth";
import { getServerSession } from "@/lib/request-session";
import { authOptions } from "@/lib/auth-options";

// Extend the next-auth session types
declare module "next-auth" {
  interface Session {
    authMode?: "nextauth" | "gateway";
    user: {
      id: string;
      role: string;
      team?: string | null;
      currentFocus?: string | null;
      expertise?: string[] | null;
    } & DefaultSession["user"];
  }
}

export { authOptions };
export const authConfig = authOptions;

export async function getAuthSession() {
  return getServerSession(authOptions);
}
