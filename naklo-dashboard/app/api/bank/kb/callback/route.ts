import { NextResponse } from "next/server";
import { completeKbAuthorization } from "@/lib/bank/sync";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** redirect_uri: KB sem vrátí autorizační kód (platí 2 minuty), vyměníme ho za refresh token. */
export async function GET(req: Request) {
  const actor = await requireUser();
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const to = (q: string) => NextResponse.redirect(new URL(`/finance/propojeni?${q}`, req.url));
  if (!code || !state) return to(`chyba=${encodeURIComponent(u.searchParams.get("error_description") ?? "Autorizace v KB nebyla dokončena")}`);
  try {
    await completeKbAuthorization(code, state, actor);
    return to("ok=1");
  } catch (e) {
    return to(`chyba=${encodeURIComponent((e as Error).message)}`);
  }
}
