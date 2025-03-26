import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcrypt";
import { type DefaultSession, AuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GithubProvider from "next-auth/providers/github";
import { prisma } from "./prisma";
import { getServerSession } from "next-auth/next";

// Extend the next-auth session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      team?: string | null;
      currentFocus?: string | null;
      expertise?: string[] | null;
    } & DefaultSession["user"];
  }
}

export const authConfig: AuthOptions = {
  pages: {
    signIn: "/login",
  },
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
        });

        if (!user || !user.hashedPassword) {
          throw new Error("Invalid credentials");
        }

        const isPasswordValid = await compare(
          credentials.password,
          user.hashedPassword
        );

        if (!isPasswordValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          team: user.team,
          currentFocus: user.currentFocus,
          expertise: user.expertise,
        };
      },
    }),
  ],
  callbacks: {
    async session({ token, session }: { token: any; session: any }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture;
        session.user.role = token.role as string;
        session.user.team = token.team;
        session.user.currentFocus = token.currentFocus;
        session.user.expertise = token.expertise;
      }

      return session;
    },
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.team = user.team;
        token.currentFocus = user.currentFocus;
        token.expertise = user.expertise;
      } else if (token.email) {
        // Update the user data on each sign in
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.team = dbUser.team;
          token.currentFocus = dbUser.currentFocus;
          token.expertise = dbUser.expertise;
        }
      }
      return token;
    },
  },
}; 

export async function getAuthSession() {
  return await getServerSession(authConfig);
} 