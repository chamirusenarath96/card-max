import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "chamisenarath@gmail.com";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ profile }) {
      return profile?.email === ADMIN_EMAIL;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
