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
    newUser: "/dashboard",
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      // Always send to /dashboard after sign-in unless a more specific callbackUrl is set
      if (url === baseUrl || url === `${baseUrl}/`) return `${baseUrl}/dashboard`;
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/dashboard`;
    },

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
        token.id = user.id;
        // NextAuth already puts name/email/picture on `token` for OAuth & credentials.
        // Avoid duplicating the avatar as `image` — it can push the JWE over cookie limits and trigger HTTP 431.
      }
      const t = token as Record<string, unknown>;
      if (t.picture && t.image) {
        delete t.image;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image =
          (token.picture as string | null | undefined) ??
          (token.image as string | null | undefined);
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
