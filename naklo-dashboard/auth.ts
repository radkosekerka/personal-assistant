import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** Přihlásit se smí jen konkrétní lidé z domény WSN. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = (process.env.ALLOWED_DOMAIN ?? "wakesurfnaklo.cz").toLowerCase();
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return e.endsWith(`@${domain}`) && list.includes(e);
}

export function authDisabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DISABLED === "1";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { hd: process.env.ALLOWED_DOMAIN ?? "wakesurfnaklo.cz" } } })],
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/prihlaseni" },
  callbacks: {
    signIn({ profile }) {
      return Boolean(profile?.email_verified) && isAllowedEmail(profile?.email);
    },
  },
});
