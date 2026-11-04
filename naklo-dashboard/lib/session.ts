import { auth, authDisabled, isAllowedEmail } from "@/auth";

/** Ověří uživatele i v server actions (middleware sám nestačí). Vrací e-mail pro audit. */
export async function requireUser(): Promise<string> {
  if (authDisabled()) return "dev@localhost";
  const session = await auth();
  const email = session?.user?.email;
  if (!isAllowedEmail(email)) throw new Error("Nepřihlášený uživatel");
  return email!;
}
