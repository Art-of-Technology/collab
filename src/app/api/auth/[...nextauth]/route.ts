import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { processUserProfileImage } from "@/utils/user-image-handler";

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
  events: {
    async createUser({ user }) {
      // Process Google profile image and upload to Cloudinary if needed
      if (user.image && user.image.includes('googleusercontent.com')) {
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
    async signIn({ user, account, profile }) {
      // Handle profile image processing for existing users signing in with Google
      if (account?.provider === 'google' && user.id && user.image) {
        try {
          // Check if the current image is still a Google URL and needs migration
          if (user.image.includes('googleusercontent.com')) {
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
          }
        } catch (error) {
          console.error('❌ Failed to process user profile image during sign-in:', error);
          // Don't throw error to avoid blocking sign-in
        }
      }
      
      return true;
    },
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