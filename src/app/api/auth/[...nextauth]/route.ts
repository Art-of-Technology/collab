import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string
    })
  ],
  debug: process.env.NODE_ENV === "development",
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      
      if (token.role && session.user) {
        session.user.role = token.role as string;
      }
      
      return session;
    },
    async jwt({ token }) {
      if (!token.sub) return token;
      
      const existingUser = await prisma.user.findUnique({
        where: {
          id: token.sub,
        },
      });
      
      if (!existingUser) return token;
      
      token.role = existingUser.role;
      
      return token;
    }
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 