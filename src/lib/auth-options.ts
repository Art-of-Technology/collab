import { maestroEnabled, maestroProvider, safeAuthLogger, safeAuthRedirect, COLLAB_ORIGIN } from "@/lib/maestro-link";
import { type AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { processUserProfileImage } from "@/utils/user-image-handler";
import { CustomPrismaAdapter } from "@/lib/custom-prisma-adapter";

export const authOptions: AuthOptions = {
  adapter: CustomPrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string
    }),
    ...(maestroEnabled() ? [maestroProvider()] : []),
  ],
  debug: false,
  logger: safeAuthLogger,
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  events: {
    async createUser({ user }) {
      // Process Google profile image and upload to Cloudinary if needed
      if (user.image) {
        try {
          console.log('🔄 Processing Google profile image for new user:', user.id);
          const cloudinaryUrl = await processUserProfileImage(user.image, user.id);

          if (cloudinaryUrl && cloudinaryUrl !== user.image) {
            // Update the user's image URL to the Cloudinary URL
            await prisma.user.update({
              where: { id: user.id },
              data: { image: cloudinaryUrl }
            });
            console.log('✅ Updated user profile image to Cloudinary URL');
          }
        } catch (error) {
          console.error('❌ Failed to process user profile image during creation:', error);
          // Don't throw error to avoid blocking user creation
        }
      }

      // Note: We don't create workspaces automatically anymore
      // OAuth users will be directed to welcome page to create workspace manually
      console.log(`✅ OAuth user created successfully: ${user.email}`);
    },
    async linkAccount({ user, account, profile }) {
      // Handle profile image processing when linking Google account
      if (account.provider === 'google' && profile && 'picture' in profile && profile.picture) {
        try {
          console.log('🔄 Processing Google profile image for account linking:', user.id);
          const cloudinaryUrl = await processUserProfileImage(profile.picture as string, user.id);

          if (cloudinaryUrl && cloudinaryUrl !== profile.picture) {
            // Update the user's image URL to the Cloudinary URL
            await prisma.user.update({
              where: { id: user.id },
              data: { image: cloudinaryUrl }
            });
            console.log('✅ Updated user profile image to Cloudinary URL via account linking');
          }
        } catch (error) {
          console.error('❌ Failed to process user profile image during account linking:', error);
          // Don't throw error to avoid blocking account linking
        }
      }
    }
  },
  callbacks: {
    async signIn({ user, account }) {
      // Handle profile image processing for existing users signing in with Google
      if (account?.provider === 'google' && user.id && user.image) {
        try {
          // First verify the user actually exists in DB (signIn callback may receive provider ID for new users)
          const existingUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, image: true }
          });

          if (!existingUser) {
            // User doesn't exist yet - the createUser event will handle profile image
            console.log('ℹ️ User not found in DB during sign-in, skipping image processing (will be handled by createUser event)');
            return true;
          }

          console.log('🔄 Processing Google profile image for existing user sign-in:', user.id);
          const cloudinaryUrl = await processUserProfileImage(user.image, user.id);

          if (cloudinaryUrl && cloudinaryUrl !== user.image) {
            // Update the user's image URL to the Cloudinary URL
            await prisma.user.update({
              where: { id: user.id },
              data: { image: cloudinaryUrl }
            });
            console.log('✅ Updated existing user profile image to Cloudinary URL during sign-in');

            // Update the user object so the session gets the new URL
            user.image = cloudinaryUrl;
          }
        } catch (error) {
          console.error('❌ Failed to process user profile image during sign-in:', error);
          // Don't throw error to avoid blocking sign-in
        }
      }

      return true;
    },
    async session({ session, token }) {
      if (!token.sub) throw new Error("Invalid session");
      if (session.user) {
        session.user.id = token.sub;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture;
        session.user.team = token.team as string | null;
        session.user.currentFocus = token.currentFocus as string | null;
        session.user.expertise = token.expertise as string[] | null;
      }

      if (token.role && session.user) {
        session.user.role = token.role as string;
      }

      return session;
    },
    async jwt({ token }) {
      if (!token.sub) throw new Error("Invalid session");

      const existingUser = await prisma.user.findUnique({
        where: {
          id: token.sub,
        },
      });

      if (!existingUser) throw new Error("Invalid session");

      // Convert UserRole enum to string for NextAuth compatibility
      token.role = existingUser.role.toString();
      token.name = existingUser.name;
      token.email = existingUser.email;
      token.picture = existingUser.image;
      token.team = existingUser.team;
      token.currentFocus = existingUser.currentFocus;
      token.expertise = existingUser.expertise;

      return token;
    },
    async redirect({ url, baseUrl }) {
      return safeAuthRedirect(url, maestroEnabled() ? COLLAB_ORIGIN : baseUrl);
    },
  }
};
