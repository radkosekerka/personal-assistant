import { NextResponse } from "next/server";
import { completeKbRegistration } from "@/lib/bank/sync";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** registrationBackUri: KB sem vrátí šifrované client_id a client_secret. Pak rovnou autorizace. */
export async function GET(req: Request) {
  const actor = await requireUser();
  const u = new URL(req.url);
  const salt = u.searchParams.get("salt");
  const data = u.searchParams.get("encryptedData");
  if (!salt || !data) return back(req, "KB nevrátila registrační data (registrace zrušena?)");
  try {
    return NextResponse.redirect(await completeKbRegistration(salt, data, u.searchParams.get("state"), actor));
  } catch (e) {
    return back(req, (e as Error).message);
  }
}

function back(req: Request, msg: string) {
  return NextResponse.redirect(new URL(`/finance/propojeni?chyba=${encodeURIComponent(msg)}`, req.url));
}
