import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import GitLabProvider from "next-auth/providers/gitlab";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/lib/models/User";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId:     process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    GoogleProvider({
      clientId:     process.env.GOOGLE_ID!,
      clientSecret: process.env.GOOGLE_SECRET!,
    }),
    GitLabProvider({
      clientId:     process.env.GITLAB_ID!,
      clientSecret: process.env.GITLAB_SECRET!,
    }),
    CredentialsProvider({
      name: "Email",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        await connectDB();
        const user = await User.findOne({ email: credentials.email.toLowerCase() });
        if (!user || !user.password) return null;

        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;

        return { id: user._id.toString(), name: user.name, email: user.email, image: user.image };
      },
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn:  "/auth/signin",
    signOut: "/auth/signin",
    error:   "/auth/signin",
  },

  callbacks: {
    async signIn({ user, account }) {
      // persist OAuth users to MongoDB on first sign-in
      if (account?.provider !== "credentials") {
        await connectDB();
        const existing = await User.findOne({ email: user.email });
        if (!existing) {
          await User.create({
            name:     user.name ?? "User",
            email:    user.email,
            image:    user.image,
            provider: account?.provider,
          });
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id    = user.id;
        token.name  = user.name;
        token.email = user.email;
        token.image = (user as { image?: string }).image;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id    = token.id as string;
        session.user.name  = token.name;
        session.user.email = token.email;
        session.user.image = token.image as string | null | undefined;
      }
      return session;
    },
  },

<<<<<<< HEAD
  pages: {
    signIn: "/auth",
    error: "/auth",
  },

=======
>>>>>>> 63b4ada (feat: implement authentication with NextAuth, OAuth providers, and MongoDB integration)
  secret: process.env.NEXTAUTH_SECRET,
};
